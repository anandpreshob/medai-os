# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
RTSTRUCT Import/Export Endpoints

API endpoints for importing RTSTRUCT contours as labelmaps
and exporting labelmaps as RTSTRUCT files.
"""

import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

try:
    import nibabel as nib
except ImportError:
    nib = None

try:
    import pydicom
except ImportError:
    pydicom = None

from monailabel.utils.rt import (
    RTStructParser,
    ContourToLabelmapConverter,
    CTSeriesInfo,
    build_rtstruct,
    ROIExport,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rtstruct", tags=["RTSTRUCT"])


# ============================================================================
# Request/Response Models
# ============================================================================


class RTStructROIInfo(BaseModel):
    """Information about an ROI in an RTSTRUCT."""

    roi_number: int
    roi_name: str
    roi_type: str
    color: str  # Hex color
    slice_count: int
    total_points: int


class RTStructSeriesInfo(BaseModel):
    """Information about an RTSTRUCT series."""

    series_instance_uid: str
    sop_instance_uid: str
    structure_set_label: Optional[str] = None
    structure_set_name: Optional[str] = None
    roi_count: int
    rois: List[RTStructROIInfo]
    referenced_series_uid: Optional[str] = None
    frame_of_reference_uid: Optional[str] = None


class ImportRTStructRequest(BaseModel):
    """Request to import an RTSTRUCT file."""

    ct_series_uid: str = Field(..., description="Series UID of the referenced CT")
    ct_study_uid: str = Field(..., description="Study UID containing the CT")
    # CT geometry info
    shape: Tuple[int, int, int] = Field(..., description="Volume shape (Z, Y, X)")
    spacing: Tuple[float, float, float] = Field(
        ..., description="Voxel spacing (X, Y, Z) in mm"
    )
    origin: Tuple[float, float, float] = Field(
        ..., description="Volume origin (X, Y, Z) in mm"
    )
    direction: Optional[List[List[float]]] = Field(
        None, description="3x3 direction matrix (optional, defaults to identity)"
    )
    slice_positions: Optional[List[float]] = Field(
        None, description="Z positions of each slice"
    )
    roi_filter: Optional[List[str]] = Field(
        None, description="Optional list of ROI names to import (imports all if None)"
    )


class ImportRTStructResponse(BaseModel):
    """Response from RTSTRUCT import."""

    success: bool
    message: str
    labelmap_path: Optional[str] = None
    label_map: Optional[Dict[int, str]] = None  # label_value -> roi_name
    roi_colors: Optional[Dict[str, str]] = None  # roi_name -> hex_color
    roi_types: Optional[Dict[str, str]] = None  # roi_name -> type


class ExportSegment(BaseModel):
    """A segment to include in the RTSTRUCT export."""

    label_value: int
    label_name: str
    roi_type: str = "ORGAN"  # GTV, CTV, PTV, ORGAN, EXTERNAL
    color: Tuple[int, int, int] = (255, 0, 0)
    interpreted_type: str = "ORGAN"


class ExportRTStructRequest(BaseModel):
    """Request to export segments as RTSTRUCT."""

    labelmap_path: str = Field(..., description="Path to the NIfTI labelmap file")
    segments: List[ExportSegment]
    ct_series_uid: str
    ct_study_uid: str
    ct_frame_of_reference_uid: str
    patient_name: str = "Anonymous"
    patient_id: str = "0000"
    structure_set_label: str = "MedAI_Structures"
    structure_set_name: str = "MedAI Auto-Segmentation"
    simplify_tolerance: float = Field(
        0.5, description="Contour simplification tolerance in mm"
    )
    # CT slice info for proper referencing
    ct_slice_info: Optional[List[Dict]] = Field(
        None,
        description="List of {sop_instance_uid, sop_class_uid, slice_index, z_position}",
    )


class ExportRTStructResponse(BaseModel):
    """Response from RTSTRUCT export."""

    success: bool
    message: str
    rtstruct_path: Optional[str] = None
    sop_instance_uid: Optional[str] = None
    series_instance_uid: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


def _create_ct_series_info(request: ImportRTStructRequest) -> CTSeriesInfo:
    """Create CTSeriesInfo from request parameters."""
    direction = np.eye(3)
    if request.direction:
        direction = np.array(request.direction)

    slice_positions = request.slice_positions
    if not slice_positions:
        # Generate slice positions from origin and spacing
        z_count = request.shape[0]
        z_spacing = request.spacing[2]
        z_origin = request.origin[2]
        slice_positions = [z_origin + i * z_spacing for i in range(z_count)]

    return CTSeriesInfo(
        shape=request.shape,
        spacing=request.spacing,
        origin=request.origin,
        direction=direction,
        slice_positions=slice_positions,
    )


def _get_ct_info_from_nifti(nifti_path: str) -> CTSeriesInfo:
    """Extract CT geometry info from a NIfTI file."""
    if nib is None:
        raise HTTPException(
            status_code=500,
            detail="nibabel is required for NIfTI processing",
        )

    img = nib.load(nifti_path)
    header = img.header
    affine = img.affine

    # Get shape (NIfTI stores as X, Y, Z, we want Z, Y, X)
    shape = img.shape
    if len(shape) == 3:
        shape = (shape[2], shape[1], shape[0])
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Expected 3D volume, got shape: {img.shape}",
        )

    # Get spacing from header
    spacing = tuple(header.get_zooms()[:3])

    # Get origin from affine
    origin = tuple(affine[:3, 3])

    # Get direction from affine
    direction = affine[:3, :3] / np.array(spacing)

    # Calculate slice positions
    z_count = shape[0]
    z_spacing = spacing[2]
    z_origin = origin[2]
    slice_positions = [z_origin + i * z_spacing for i in range(z_count)]

    return CTSeriesInfo(
        shape=shape,
        spacing=spacing,
        origin=origin,
        direction=direction,
        slice_positions=slice_positions,
    )


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/parse", response_model=RTStructSeriesInfo)
async def parse_rtstruct_file(
    file: UploadFile = File(..., description="RTSTRUCT DICOM file"),
):
    """
    Parse an RTSTRUCT file and return its structure information.

    This endpoint parses the file without converting to labelmaps,
    useful for previewing the contents before import.
    """
    if pydicom is None:
        raise HTTPException(
            status_code=500,
            detail="pydicom is required for RTSTRUCT parsing",
        )

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dcm") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        parser = RTStructParser(tmp_path)
        parser.load()

        # Get ROI info
        rois = []
        for roi in parser.get_roi_contours():
            rois.append(
                RTStructROIInfo(
                    roi_number=roi.roi_number,
                    roi_name=roi.roi_name,
                    roi_type=roi.roi_type,
                    color=roi.get_color_hex(),
                    slice_count=roi.slice_count,
                    total_points=roi.total_points,
                )
            )

        # Get series info
        ds = parser.dataset
        return RTStructSeriesInfo(
            series_instance_uid=str(ds.SeriesInstanceUID),
            sop_instance_uid=str(ds.SOPInstanceUID),
            structure_set_label=getattr(ds, "StructureSetLabel", None),
            structure_set_name=getattr(ds, "StructureSetName", None),
            roi_count=len(rois),
            rois=rois,
            referenced_series_uid=parser.referenced_series_uid,
            frame_of_reference_uid=parser.frame_of_reference_uid,
        )

    except Exception as e:
        logger.error(f"Failed to parse RTSTRUCT: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse RTSTRUCT: {e}")

    finally:
        # Clean up temp file
        os.unlink(tmp_path)


@router.post("/import", response_model=ImportRTStructResponse)
async def import_rtstruct(
    file: UploadFile = File(..., description="RTSTRUCT DICOM file"),
    ct_series_uid: str = Form(...),
    ct_study_uid: str = Form(...),
    shape_z: int = Form(...),
    shape_y: int = Form(...),
    shape_x: int = Form(...),
    spacing_x: float = Form(...),
    spacing_y: float = Form(...),
    spacing_z: float = Form(...),
    origin_x: float = Form(...),
    origin_y: float = Form(...),
    origin_z: float = Form(...),
    roi_filter: Optional[str] = Form(
        None, description="Comma-separated list of ROI names to import"
    ),
    output_dir: Optional[str] = Form(None, description="Output directory for labelmaps"),
):
    """
    Import an RTSTRUCT file and convert it to a 3D labelmap.

    Returns a NIfTI file containing all ROIs as separate label values.
    """
    if nib is None:
        raise HTTPException(
            status_code=500,
            detail="nibabel is required for NIfTI output",
        )

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dcm") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse RTSTRUCT
        parser = RTStructParser(tmp_path)
        rois = parser.get_roi_contours()

        # Apply ROI filter if specified
        if roi_filter:
            filter_names = [n.strip() for n in roi_filter.split(",")]
            rois = [r for r in rois if r.roi_name in filter_names]

        if not rois:
            return ImportRTStructResponse(
                success=False,
                message="No ROIs found to import",
            )

        # Create CT info
        shape = (shape_z, shape_y, shape_x)
        spacing = (spacing_x, spacing_y, spacing_z)
        origin = (origin_x, origin_y, origin_z)

        ct_info = CTSeriesInfo(
            shape=shape,
            spacing=spacing,
            origin=origin,
            direction=np.eye(3),
            slice_positions=[origin_z + i * spacing_z for i in range(shape_z)],
        )

        # Convert contours to labelmap
        converter = ContourToLabelmapConverter(ct_info)
        labelmap, label_map = converter.convert_all_rois(rois)

        # Build color and type maps
        roi_colors = {}
        roi_types = {}
        for roi in rois:
            roi_colors[roi.roi_name] = roi.get_color_hex()
            roi_types[roi.roi_name] = roi.roi_type

        # Save as NIfTI
        out_dir = output_dir or tempfile.gettempdir()
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"rtstruct_import_{ct_series_uid[:8]}.nii.gz")

        # Create affine matrix
        affine = np.eye(4)
        affine[:3, :3] = np.diag(spacing)
        affine[:3, 3] = origin

        # Save NIfTI (transpose to X, Y, Z for NIfTI)
        labelmap_nifti = labelmap.transpose(2, 1, 0)  # Z,Y,X -> X,Y,Z
        img = nib.Nifti1Image(labelmap_nifti.astype(np.uint8), affine)
        nib.save(img, output_path)

        logger.info(f"Imported RTSTRUCT with {len(rois)} ROIs to {output_path}")

        return ImportRTStructResponse(
            success=True,
            message=f"Successfully imported {len(rois)} ROIs",
            labelmap_path=output_path,
            label_map=label_map,
            roi_colors=roi_colors,
            roi_types=roi_types,
        )

    except Exception as e:
        logger.error(f"Failed to import RTSTRUCT: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to import RTSTRUCT: {e}")

    finally:
        os.unlink(tmp_path)


@router.post("/export", response_model=ExportRTStructResponse)
async def export_rtstruct(request: ExportRTStructRequest):
    """
    Export a labelmap as an RTSTRUCT DICOM file.

    Converts a NIfTI labelmap to RTSTRUCT format with specified
    segment names, colors, and ROI types.
    """
    if nib is None:
        raise HTTPException(
            status_code=500,
            detail="nibabel is required for NIfTI processing",
        )

    if pydicom is None:
        raise HTTPException(
            status_code=500,
            detail="pydicom is required for RTSTRUCT export",
        )

    # Verify labelmap exists
    if not os.path.exists(request.labelmap_path):
        raise HTTPException(
            status_code=404,
            detail=f"Labelmap not found: {request.labelmap_path}",
        )

    try:
        # Load labelmap
        img = nib.load(request.labelmap_path)
        labelmap_data = np.asarray(img.dataobj)

        # NIfTI is X, Y, Z - convert to Z, Y, X
        labelmap = labelmap_data.transpose(2, 1, 0)

        # Get CT info from NIfTI
        ct_info = _get_ct_info_from_nifti(request.labelmap_path)

        # Build label_names, label_colors, roi_types maps
        label_names = {}
        label_colors = {}
        roi_types = {}

        for seg in request.segments:
            label_names[seg.label_value] = seg.label_name
            label_colors[seg.label_value] = seg.color
            roi_types[seg.label_value] = seg.roi_type

        # Build CT slice info if provided
        ct_slices = None
        if request.ct_slice_info:
            from monailabel.utils.rt import CTSliceInfo

            ct_slices = [
                CTSliceInfo(
                    sop_instance_uid=s["sop_instance_uid"],
                    sop_class_uid=s.get("sop_class_uid", "1.2.840.10008.5.1.4.1.1.2"),
                    slice_index=s["slice_index"],
                    z_position=s["z_position"],
                )
                for s in request.ct_slice_info
            ]

        # Build RTSTRUCT
        output_dir = tempfile.gettempdir()
        output_path = os.path.join(
            output_dir,
            f"rtstruct_export_{request.ct_series_uid[:8]}.dcm",
        )

        ds, saved_path = build_rtstruct(
            labelmap=labelmap,
            ct_info=ct_info,
            label_names=label_names,
            ct_series_uid=request.ct_series_uid,
            ct_study_uid=request.ct_study_uid,
            ct_frame_of_reference_uid=request.ct_frame_of_reference_uid,
            label_colors=label_colors,
            roi_types=roi_types,
            ct_slices=ct_slices,
            output_path=output_path,
            patient_name=request.patient_name,
            patient_id=request.patient_id,
            simplify_tolerance=request.simplify_tolerance,
        )

        return ExportRTStructResponse(
            success=True,
            message=f"Successfully exported RTSTRUCT with {len(request.segments)} structures",
            rtstruct_path=str(saved_path),
            sop_instance_uid=str(ds.SOPInstanceUID),
            series_instance_uid=str(ds.SeriesInstanceUID),
        )

    except Exception as e:
        logger.error(f"Failed to export RTSTRUCT: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to export RTSTRUCT: {e}")


@router.get("/download/{filename}")
async def download_rtstruct(filename: str):
    """
    Download a generated RTSTRUCT file.
    """
    filepath = os.path.join(tempfile.gettempdir(), filename)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="RTSTRUCT file not found")

    return FileResponse(
        filepath,
        media_type="application/dicom",
        filename=filename,
    )
