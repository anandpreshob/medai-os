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
Structured Export Endpoints

Provides endpoints for:
- Structured JSON export of oncology measurements
- CSV export of lesion data
- RECIST assessment calculations
- Batch export in multiple formats (COCO, YOLO, VOC, Overlay)
"""

import csv
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any

import numpy as np
import nibabel as nib
from scipy import ndimage
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query
from fastapi.background import BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from pydantic import BaseModel, Field

from monailabel.utils.exporters.coco_exporter import COCOExporter
from monailabel.utils.exporters.yolo_exporter import YOLOExporter
from monailabel.utils.exporters.voc_exporter import VOCExporter
from monailabel.utils.exporters.overlay_exporter import OverlayExporter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/exports",
    tags=["Exports"],
    responses={
        404: {"description": "Not found"},
        200: {"description": "OK"},
    },
)


def remove_temp_file(path: str):
    """Background task to remove temporary files."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning(f"Failed to remove temp file {path}: {e}")


def compute_lesion_measurements(
    mask_data: np.ndarray,
    spacing: tuple,
    segment_index: int,
) -> Dict[str, Any]:
    """
    Compute volumetric measurements for a single lesion/segment.

    Args:
        mask_data: 3D numpy array with segment labels
        spacing: Voxel spacing in mm (x, y, z)
        segment_index: Segment index to measure

    Returns:
        Dictionary with volumetric measurements
    """
    binary_mask = (mask_data == segment_index)
    voxel_volume_mm3 = float(np.prod(spacing))

    if not np.any(binary_mask):
        return {
            "volumeMm3": 0,
            "volumeCm3": 0,
            "longestAxisMm": 0,
            "axialDiameterMm": 0,
            "dimensionsMm": [0, 0, 0],
            "centroidIjk": [0, 0, 0],
            "voxelCount": 0,
        }

    voxel_count = int(np.sum(binary_mask))
    volume_mm3 = voxel_count * voxel_volume_mm3
    volume_cm3 = volume_mm3 / 1000

    # Compute centroid and bounding box
    coords = np.where(binary_mask)
    centroid = [int(np.mean(c)) for c in coords]
    bbox_min = [int(np.min(c)) for c in coords]
    bbox_max = [int(np.max(c)) for c in coords]

    # Compute dimensions in mm
    extent_voxels = [bbox_max[i] - bbox_min[i] + 1 for i in range(3)]
    dimensions_mm = [round(extent_voxels[i] * spacing[i], 2) for i in range(3)]

    # Longest axis (for RECIST)
    longest_axis_mm = max(dimensions_mm)

    # Axial diameter (maximum in x-y plane)
    axial_diameter_mm = max(dimensions_mm[0], dimensions_mm[1])

    return {
        "volumeMm3": round(volume_mm3, 4),
        "volumeCm3": round(volume_cm3, 4),
        "longestAxisMm": round(longest_axis_mm, 2),
        "axialDiameterMm": round(axial_diameter_mm, 2),
        "dimensionsMm": dimensions_mm,
        "centroidIjk": centroid,
        "voxelCount": voxel_count,
    }


def calculate_recist_response(
    current_sum_ld: float,
    baseline_sum_ld: Optional[float],
    nadir_sum_ld: Optional[float],
    new_lesion_count: int,
) -> Dict[str, Any]:
    """
    Calculate RECIST 1.1 response classification.

    Args:
        current_sum_ld: Current sum of longest diameters (mm)
        baseline_sum_ld: Baseline sum of longest diameters (mm)
        nadir_sum_ld: Nadir (lowest) sum of longest diameters (mm)
        new_lesion_count: Number of new lesions

    Returns:
        Response assessment dictionary
    """
    percent_change_baseline = None
    percent_change_nadir = None

    if baseline_sum_ld and baseline_sum_ld > 0:
        percent_change_baseline = ((current_sum_ld - baseline_sum_ld) / baseline_sum_ld) * 100

    if nadir_sum_ld and nadir_sum_ld > 0:
        percent_change_nadir = ((current_sum_ld - nadir_sum_ld) / nadir_sum_ld) * 100

    # RECIST 1.1 classification
    if new_lesion_count > 0:
        classification = "progressive_disease"
    elif percent_change_nadir is not None and percent_change_nadir >= 20:
        # Must also have absolute increase of at least 5mm (simplified here)
        classification = "progressive_disease"
    elif current_sum_ld == 0:
        classification = "complete_response"
    elif percent_change_baseline is not None and percent_change_baseline <= -30:
        classification = "partial_response"
    elif percent_change_baseline is not None:
        classification = "stable_disease"
    else:
        classification = "not_evaluable"

    return {
        "recistClassification": classification,
        "sumLongestDiameterMm": round(current_sum_ld, 2),
        "percentChangeFromBaseline": round(percent_change_baseline, 2) if percent_change_baseline else None,
        "percentChangeFromNadir": round(percent_change_nadir, 2) if percent_change_nadir else None,
        "newLesionCount": new_lesion_count,
        "assessmentTimestamp": datetime.now().isoformat(),
    }


@router.post("/oncology-json")
async def export_oncology_json(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    params: str = Form("{}"),
):
    """
    Export oncology measurements as structured JSON.

    Request body (multipart/form-data):
        - mask_file: NIfTI mask file (.nii.gz)
        - params: JSON string with export parameters:
            - context: { patientId, studyUID, modality, bodyPart, ... }
            - segments: [{ segmentIndex, label, color, category, ... }]
            - provenance: { segmentationModel, edits, reviewer }
            - baselineLesions: Optional baseline data for RECIST
            - nadirLesions: Optional nadir data for RECIST

    Returns:
        JSON with OncologyExportSchema structure
    """
    temp_mask_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        context = params_dict.get("context", {})
        segments_info = params_dict.get("segments", [])
        provenance = params_dict.get("provenance", {})
        baseline_lesions = params_dict.get("baselineLesions")
        nadir_lesions = params_dict.get("nadirLesions")

        # Save mask to temp file
        temp_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load mask
        mask_nii = nib.load(temp_mask_path)
        mask_data = mask_nii.get_fdata().astype(np.int32)

        # Squeeze to 3D if needed
        if mask_data.ndim > 3:
            mask_data = np.squeeze(mask_data)

        # Get spacing
        spacing = tuple(float(s) for s in mask_nii.header.get_zooms()[:3])

        # Build lesions array with measurements
        lesions = []
        total_tumor_burden_cm3 = 0
        sum_longest_diameter_mm = 0
        new_lesion_count = 0

        for seg_info in segments_info:
            seg_index = seg_info.get("segmentIndex", 1)
            measurements = compute_lesion_measurements(mask_data, spacing, seg_index)

            lesion = {
                "id": f"lesion-{seg_index}",
                "label": seg_info.get("label", f"Lesion {seg_index}"),
                "segmentIndex": seg_index,
                "color": seg_info.get("color", "#808080"),
                "category": seg_info.get("category", "target"),
                "location": seg_info.get("location"),
                "volumetrics": measurements,
                "measurementSource": seg_info.get("measurementSource", "ai_auto"),
                "confidence": seg_info.get("confidence"),
                "notes": seg_info.get("notes"),
                "linkedLesionIds": seg_info.get("linkedLesionIds"),
            }

            lesions.append(lesion)

            # Aggregate metrics
            total_tumor_burden_cm3 += measurements["volumeCm3"]
            if lesion["category"] == "target":
                sum_longest_diameter_mm += measurements["longestAxisMm"]
            if lesion["category"] == "new":
                new_lesion_count += 1

        # Calculate RECIST response if baseline provided
        response_assessment = None
        if baseline_lesions or len(segments_info) > 0:
            baseline_sum_ld = None
            nadir_sum_ld = None

            if baseline_lesions:
                baseline_sum_ld = sum(
                    l.get("volumetrics", {}).get("longestAxisMm", 0)
                    for l in baseline_lesions
                    if l.get("category") == "target"
                )

            if nadir_lesions:
                nadir_sum_ld = sum(
                    l.get("volumetrics", {}).get("longestAxisMm", 0)
                    for l in nadir_lesions
                    if l.get("category") == "target"
                )

            recist = calculate_recist_response(
                current_sum_ld=sum_longest_diameter_mm,
                baseline_sum_ld=baseline_sum_ld,
                nadir_sum_ld=nadir_sum_ld,
                new_lesion_count=new_lesion_count,
            )

            response_assessment = {
                **recist,
                "totalTumorBurdenCm3": round(total_tumor_burden_cm3, 4),
            }

        # Build export schema
        export_schema = {
            "version": "1.0.0",
            "exportTimestamp": datetime.now().isoformat(),
            "context": context,
            "lesions": lesions,
            "responseAssessment": response_assessment,
            "provenance": provenance,
        }

        return JSONResponse(content=export_schema)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Oncology JSON export failed")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    finally:
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


@router.post("/oncology-csv")
async def export_oncology_csv(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    params: str = Form("{}"),
):
    """
    Export oncology measurements as CSV.

    Returns:
        CSV file with lesion measurements
    """
    temp_mask_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        segments_info = params_dict.get("segments", [])
        include_header = params_dict.get("includeHeader", True)
        filename = params_dict.get("filename", "oncology_lesions.csv")

        # Save mask to temp file
        temp_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load mask
        mask_nii = nib.load(temp_mask_path)
        mask_data = mask_nii.get_fdata().astype(np.int32)

        if mask_data.ndim > 3:
            mask_data = np.squeeze(mask_data)

        spacing = tuple(float(s) for s in mask_nii.header.get_zooms()[:3])

        # Build CSV
        output = io.StringIO()
        writer = csv.writer(output)

        if include_header:
            writer.writerow([
                "lesion_id",
                "label",
                "category",
                "location",
                "volume_mm3",
                "volume_cm3",
                "longest_axis_mm",
                "axial_diameter_mm",
                "dimension_x_mm",
                "dimension_y_mm",
                "dimension_z_mm",
                "centroid_x",
                "centroid_y",
                "centroid_z",
                "voxel_count",
                "measurement_source",
                "confidence",
                "segment_index",
            ])

        for seg_info in segments_info:
            seg_index = seg_info.get("segmentIndex", 1)
            measurements = compute_lesion_measurements(mask_data, spacing, seg_index)

            writer.writerow([
                f"lesion-{seg_index}",
                seg_info.get("label", f"Lesion {seg_index}"),
                seg_info.get("category", "target"),
                seg_info.get("location", ""),
                measurements["volumeMm3"],
                measurements["volumeCm3"],
                measurements["longestAxisMm"],
                measurements["axialDiameterMm"],
                measurements["dimensionsMm"][0],
                measurements["dimensionsMm"][1],
                measurements["dimensionsMm"][2],
                measurements["centroidIjk"][0],
                measurements["centroidIjk"][1],
                measurements["centroidIjk"][2],
                measurements["voxelCount"],
                seg_info.get("measurementSource", "ai_auto"),
                seg_info.get("confidence", ""),
                seg_index,
            ])

        csv_content = output.getvalue()

        return StreamingResponse(
            io.BytesIO(csv_content.encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Oncology CSV export failed")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    finally:
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


@router.post("/recist-assessment")
async def calculate_recist_assessment(
    params: str = Form("{}"),
):
    """
    Calculate RECIST 1.1 response assessment from lesion data.

    Request body:
        - currentLesions: Current timepoint lesion measurements
        - baselineLesions: Baseline timepoint lesion measurements
        - nadirLesions: Nadir timepoint lesion measurements

    Returns:
        RECIST assessment with classification
    """
    try:
        params_dict = json.loads(params)
        current_lesions = params_dict.get("currentLesions", [])
        baseline_lesions = params_dict.get("baselineLesions", [])
        nadir_lesions = params_dict.get("nadirLesions", [])

        # Calculate sums of longest diameters for target lesions
        current_sum_ld = sum(
            l.get("volumetrics", {}).get("longestAxisMm", 0)
            for l in current_lesions
            if l.get("category") == "target"
        )

        baseline_sum_ld = sum(
            l.get("volumetrics", {}).get("longestAxisMm", 0)
            for l in baseline_lesions
            if l.get("category") == "target"
        ) if baseline_lesions else None

        nadir_sum_ld = sum(
            l.get("volumetrics", {}).get("longestAxisMm", 0)
            for l in nadir_lesions
            if l.get("category") == "target"
        ) if nadir_lesions else None

        new_lesion_count = sum(1 for l in current_lesions if l.get("category") == "new")

        # Calculate total tumor burden
        total_tumor_burden_cm3 = sum(
            l.get("volumetrics", {}).get("volumeCm3", 0)
            for l in current_lesions
        )

        recist = calculate_recist_response(
            current_sum_ld=current_sum_ld,
            baseline_sum_ld=baseline_sum_ld,
            nadir_sum_ld=nadir_sum_ld,
            new_lesion_count=new_lesion_count,
        )

        return {
            **recist,
            "totalTumorBurdenCm3": round(total_tumor_burden_cm3, 4),
            "targetLesionCount": sum(1 for l in current_lesions if l.get("category") == "target"),
            "nonTargetLesionCount": sum(1 for l in current_lesions if l.get("category") == "non_target"),
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("RECIST assessment failed")
        raise HTTPException(status_code=500, detail=f"Assessment failed: {str(e)}")


# ============================================================================
# Batch Export Endpoints
# ============================================================================

class BatchExportFormat(str, Enum):
    """Supported batch export formats."""
    COCO = "coco"
    YOLO = "yolo"
    VOC = "voc"
    OVERLAY = "overlay"


class BatchExportRequest(BaseModel):
    """Request model for batch export."""
    results: List[Dict[str, Any]] = Field(
        ...,
        description="List of results to export with file_path, mask_path, labels",
    )
    categories: List[Dict[str, Any]] = Field(
        ...,
        description="Category definitions with id and name",
    )
    format: BatchExportFormat = Field(
        default=BatchExportFormat.COCO,
        description="Export format",
    )
    options: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Format-specific export options",
    )


@router.post("/batch-export")
async def batch_export(
    background_tasks: BackgroundTasks,
    params: str = Form("{}"),
):
    """
    Export multiple segmentation results in various formats.

    Supported formats:
    - coco: COCO JSON format for detection/segmentation
    - yolo: YOLO segmentation format with train/val split
    - voc: Pascal VOC XML format with PNG masks
    - overlay: Colored PNG overlays

    Request body (multipart/form-data):
        - params: JSON string with:
            - results: List of {file_path, mask_path, labels}
            - categories: List of {id, name}
            - format: Export format (coco, yolo, voc, overlay)
            - options: Format-specific options

    Returns:
        - For single file exports (COCO): JSON file
        - For directory exports (YOLO, VOC, Overlay): ZIP archive
    """
    try:
        params_dict = json.loads(params)
        results = params_dict.get("results", [])
        categories = params_dict.get("categories", [])
        export_format = params_dict.get("format", "coco")
        options = params_dict.get("options", {})

        if not results:
            raise HTTPException(status_code=400, detail="No results provided for export")

        if not categories:
            # Create default category from first result labels
            if results and results[0].get("labels"):
                categories = [
                    {"id": idx + 1, "name": label}
                    for idx, label in enumerate(results[0].get("labels", []))
                ]
            else:
                categories = [{"id": 1, "name": "segmentation"}]

        # Create temp directory for export
        export_dir = tempfile.mkdtemp(prefix="medai_export_")

        try:
            if export_format == "coco":
                exporter = COCOExporter(
                    description=options.get("description", "MedAI Batch Export"),
                    use_rle=options.get("use_rle", False),
                )
                output_path = os.path.join(export_dir, "annotations.json")
                exporter.export(
                    results=results,
                    categories=categories,
                    output_path=output_path,
                )

                # Return JSON file
                return FileResponse(
                    output_path,
                    media_type="application/json",
                    filename="coco_annotations.json",
                    background=BackgroundTasks([lambda: shutil.rmtree(export_dir, ignore_errors=True)]),
                )

            elif export_format == "yolo":
                exporter = YOLOExporter(
                    task=options.get("task", "segment"),
                )
                exporter.export(
                    results=results,
                    categories=categories,
                    output_dir=export_dir,
                    train_split=options.get("train_split", 0.8),
                    copy_images=options.get("copy_images", False),
                )

            elif export_format == "voc":
                exporter = VOCExporter()
                exporter.export(
                    results=results,
                    categories=categories,
                    output_dir=export_dir,
                    train_split=options.get("train_split", 0.8),
                )

            elif export_format == "overlay":
                exporter = OverlayExporter(
                    default_alpha=options.get("alpha", 0.5),
                )
                exporter.export(
                    results=results,
                    categories=categories,
                    output_dir=export_dir,
                    alpha=options.get("alpha", 0.5),
                    include_original=options.get("include_original", True),
                    export_individual_masks=options.get("export_individual_masks", False),
                    add_legend=options.get("add_legend", True),
                )

            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported export format: {export_format}",
                )

            # Create ZIP archive for directory-based exports
            zip_path = os.path.join(tempfile.gettempdir(), f"medai_export_{export_format}.zip")
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(export_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, export_dir)
                        zipf.write(file_path, arcname)

            # Schedule cleanup
            background_tasks.add_task(shutil.rmtree, export_dir, True)
            background_tasks.add_task(os.remove, zip_path)

            return FileResponse(
                zip_path,
                media_type="application/zip",
                filename=f"{export_format}_export.zip",
            )

        except Exception as e:
            # Clean up on error
            shutil.rmtree(export_dir, ignore_errors=True)
            raise

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Batch export failed")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/formats")
async def get_export_formats():
    """
    Get available export formats and their options.

    Returns:
        Dictionary of formats with descriptions and available options
    """
    return {
        "formats": {
            "coco": {
                "name": "COCO JSON",
                "description": "Common Objects in Context format for detection and segmentation",
                "options": {
                    "description": "Dataset description string",
                    "use_rle": "Use RLE encoding instead of polygons (default: false)",
                },
                "output": "Single JSON file",
            },
            "yolo": {
                "name": "YOLO Segmentation",
                "description": "YOLO format with normalized polygon coordinates",
                "options": {
                    "task": "segment or detect (default: segment)",
                    "train_split": "Fraction for training set (default: 0.8)",
                    "copy_images": "Copy images to output (default: false)",
                },
                "output": "Directory with labels/ and data.yaml",
            },
            "voc": {
                "name": "Pascal VOC",
                "description": "Pascal VOC XML format with PNG segmentation masks",
                "options": {
                    "train_split": "Fraction for training set (default: 0.8)",
                },
                "output": "Directory with Annotations/, SegmentationClass/, ImageSets/",
            },
            "overlay": {
                "name": "Colored Overlays",
                "description": "PNG images with colored segmentation overlays",
                "options": {
                    "alpha": "Overlay opacity (default: 0.5)",
                    "include_original": "Blend with original image (default: true)",
                    "export_individual_masks": "Export separate mask per label (default: false)",
                    "add_legend": "Add color legend to images (default: true)",
                },
                "output": "Directory with overlay PNG images",
            },
        }
    }


@router.post("/convert-mask")
async def convert_mask_format(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    target_format: str = Query(..., description="Target format: png, npy, nifti"),
    params: str = Form("{}"),
):
    """
    Convert a mask file between formats.

    Supported conversions:
    - NIfTI to PNG (2D slice)
    - NIfTI to NPY
    - NPY to PNG
    - NPY to NIfTI

    Request body (multipart/form-data):
        - mask_file: Input mask file
        - target_format: Target format (png, npy, nifti)
        - params: JSON with options (slice_index for 3D masks)

    Returns:
        Converted mask file
    """
    temp_input = None
    temp_output = None

    try:
        params_dict = json.loads(params)
        slice_index = params_dict.get("slice_index")  # For 3D to 2D conversion

        # Save input to temp file
        suffix = os.path.splitext(mask_file.filename or ".nii.gz")[1]
        if mask_file.filename and mask_file.filename.endswith(".nii.gz"):
            suffix = ".nii.gz"

        temp_fd, temp_input = tempfile.mkstemp(suffix=suffix)
        os.close(temp_fd)

        with open(temp_input, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load mask
        if temp_input.endswith((".nii", ".nii.gz")):
            nii = nib.load(temp_input)
            mask_data = nii.get_fdata().astype(np.int32)
            affine = nii.affine
        elif temp_input.endswith(".npy"):
            mask_data = np.load(temp_input)
            affine = np.eye(4)
        elif temp_input.endswith((".png", ".jpg", ".jpeg")):
            from PIL import Image
            img = Image.open(temp_input)
            mask_data = np.array(img)
            affine = np.eye(4)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported input format: {suffix}")

        # Handle 3D to 2D conversion
        if mask_data.ndim > 2 and target_format == "png":
            if slice_index is not None:
                mask_data = mask_data[:, :, int(slice_index)]
            else:
                # Take middle slice
                mask_data = mask_data[:, :, mask_data.shape[2] // 2]

        # Convert to target format
        if target_format == "png":
            from PIL import Image

            # Normalize to 0-255 if needed
            if mask_data.max() > 255:
                mask_data = ((mask_data - mask_data.min()) /
                            (mask_data.max() - mask_data.min() + 1e-8) * 255).astype(np.uint8)
            else:
                mask_data = mask_data.astype(np.uint8)

            temp_output = tempfile.mktemp(suffix=".png")
            img = Image.fromarray(mask_data)
            img.save(temp_output)
            media_type = "image/png"
            filename = "converted_mask.png"

        elif target_format == "npy":
            temp_output = tempfile.mktemp(suffix=".npy")
            np.save(temp_output, mask_data)
            media_type = "application/octet-stream"
            filename = "converted_mask.npy"

        elif target_format == "nifti":
            temp_output = tempfile.mktemp(suffix=".nii.gz")
            nii_out = nib.Nifti1Image(mask_data.astype(np.int16), affine)
            nib.save(nii_out, temp_output)
            media_type = "application/gzip"
            filename = "converted_mask.nii.gz"

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported target format: {target_format}")

        # Schedule cleanup
        background_tasks.add_task(remove_temp_file, temp_input)
        background_tasks.add_task(remove_temp_file, temp_output)

        return FileResponse(
            temp_output,
            media_type=media_type,
            filename=filename,
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Mask conversion failed")
        if temp_input:
            remove_temp_file(temp_input)
        if temp_output:
            remove_temp_file(temp_output)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
