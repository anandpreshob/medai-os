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
DICOM-SEG Import/Export Endpoints

Provides endpoints for:
- Exporting segmentation masks as DICOM-SEG
- Importing DICOM-SEG and converting to NIfTI
- Uploading DICOM-SEG to PACS via DICOMweb STOW-RS
"""

import json
import logging
import os
import tempfile
from datetime import datetime
from typing import Dict, List, Optional, Any

import numpy as np
import nibabel as nib
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse, Response

import SimpleITK as sitk
import pydicom
from pydicom.uid import generate_uid

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/dicomseg",
    tags=["DICOM-SEG"],
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
            logger.info(f"Removed temp file: {path}")
    except Exception as e:
        logger.warning(f"Failed to remove temp file {path}: {e}")


def create_dicom_seg_template(
    segments: List[Dict],
    series_description: str = "MedAI Segmentation",
    content_creator: str = "MedAI Viewer",
    clinical_trial_series_id: Optional[str] = None,
    clinical_trial_timepoint_id: Optional[str] = None,
) -> Dict:
    """
    Create DICOM-SEG metadata template for dcmqi itkimage2segimage.

    Args:
        segments: List of segment info dicts with keys:
            - segmentIndex: int
            - label: str
            - color: [R, G, B]
            - algorithmType: str
            - algorithmName: str (optional)
        series_description: Series description for DICOM-SEG
        content_creator: Content creator name
        clinical_trial_series_id: Clinical trial series ID
        clinical_trial_timepoint_id: Clinical trial timepoint ID

    Returns:
        DICOM-SEG template dict for dcmqi
    """
    timestamp = datetime.now().strftime("%Y%m%d%H%M")

    segment_attributes = []
    for seg in segments:
        idx = seg.get("segmentIndex", 1)
        label = seg.get("label", f"Segment_{idx}")
        color = seg.get("color", [128, 128, 128])
        algorithm_type = seg.get("algorithmType", "AUTOMATIC")
        algorithm_name = seg.get("algorithmName", "MedAI")

        segment_attribute = {
            "labelID": int(idx),
            "SegmentLabel": label,
            "SegmentDescription": f"{label} segmentation",
            "SegmentAlgorithmType": algorithm_type,
            "SegmentAlgorithmName": algorithm_name,
            "SegmentedPropertyCategoryCodeSequence": {
                "CodeValue": "123037004",
                "CodingSchemeDesignator": "SCT",
                "CodeMeaning": "Anatomical Structure",
            },
            "SegmentedPropertyTypeCodeSequence": {
                "CodeValue": "78961009",
                "CodingSchemeDesignator": "SCT",
                "CodeMeaning": label,
            },
            "recommendedDisplayRGBValue": color,
        }

        # Add anatomic region if specified
        if seg.get("anatomicRegionCode"):
            segment_attribute["AnatomicRegionSequence"] = {
                "CodeValue": seg["anatomicRegionCode"],
                "CodingSchemeDesignator": "SCT",
                "CodeMeaning": label,
            }

        segment_attributes.append(segment_attribute)

    template = {
        "ContentCreatorName": content_creator,
        "ClinicalTrialSeriesID": clinical_trial_series_id or "Session1",
        "ClinicalTrialTimePointID": clinical_trial_timepoint_id or "1",
        "SeriesDescription": series_description,
        "SeriesNumber": "300",
        "InstanceNumber": "1",
        "segmentAttributes": [segment_attributes],
        "ContentLabel": "SEGMENTATION",
        "ContentDescription": "MedAI Viewer - Oncology Segmentation",
        "ClinicalTrialCoordinatingCenterName": "MedAI",
        "BodyPartExamined": "",
    }

    return template


def nifti_to_dicom_seg_export(
    mask_path: str,
    dicom_dir: str,
    template: Dict,
) -> str:
    """
    Convert NIfTI mask to DICOM-SEG using dcmqi itkimage2segimage.

    Args:
        mask_path: Path to NIfTI mask file
        dicom_dir: Path to source DICOM series directory
        template: DICOM-SEG metadata template

    Returns:
        Path to generated DICOM-SEG file
    """
    from monailabel.utils.others.generic import run_command

    output_file = tempfile.NamedTemporaryFile(suffix=".dcm", delete=False).name
    meta_file = tempfile.NamedTemporaryFile(suffix=".json", delete=False).name

    try:
        # Write template to file
        with open(meta_file, "w") as f:
            json.dump(template, f)

        # Run itkimage2segimage
        command = "itkimage2segimage"
        args = [
            "--inputImageList", mask_path,
            "--inputDICOMDirectory", dicom_dir,
            "--outputDICOM", output_file,
            "--inputMetadata", meta_file,
        ]

        run_command(command, args)

        if not os.path.exists(output_file):
            raise RuntimeError("DICOM-SEG generation failed - output file not created")

        return output_file
    finally:
        # Clean up metadata file
        if os.path.exists(meta_file):
            os.remove(meta_file)


def dicom_seg_to_nifti(dicom_seg_path: str) -> tuple:
    """
    Convert DICOM-SEG to NIfTI mask.

    Args:
        dicom_seg_path: Path to DICOM-SEG file

    Returns:
        Tuple of (nifti_path, segment_info_list)
    """
    try:
        import pydicom_seg

        dcm = pydicom.dcmread(dicom_seg_path)
        reader = pydicom_seg.MultiClassReader()
        result = reader.read(dcm)

        # Get segment info
        segments = []
        for seg in dcm.SegmentSequence:
            seg_number = int(seg.SegmentNumber)
            seg_label = getattr(seg, 'SegmentLabel', f'Segment_{seg_number}')

            # Get color if available
            color = [128, 128, 128]
            if hasattr(seg, 'RecommendedDisplayCIELabValue'):
                # Convert CIELab to RGB (simplified)
                color = [128, 128, 128]
            elif hasattr(seg, 'RecommendedDisplayGrayscaleValue'):
                gray = int(seg.RecommendedDisplayGrayscaleValue)
                color = [gray, gray, gray]

            segments.append({
                "segmentIndex": seg_number,
                "label": seg_label,
                "color": color,
            })

        # Write to NIfTI
        output_path = tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False).name
        sitk.WriteImage(result.image, output_path, True)

        return output_path, segments

    except Exception as e:
        logger.exception("Failed to convert DICOM-SEG to NIfTI")
        raise HTTPException(status_code=500, detail=f"DICOM-SEG conversion failed: {str(e)}")


@router.post("/export")
async def export_dicom_seg(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    params: str = Form("{}"),
):
    """
    Export segmentation mask as DICOM-SEG.

    Request body (multipart/form-data):
        - mask_file: NIfTI/NRRD mask file (.nii.gz, .nrrd)
        - params: JSON string with export parameters:
            - studyUID: Study Instance UID
            - seriesUID: Source series Instance UID
            - segments: List of segment info
            - seriesDescription: Series description (optional)
            - contentCreator: Content creator name (optional)
            - clinicalTrialSeriesId: Clinical trial series ID (optional)
            - clinicalTrialTimepointId: Clinical trial timepoint ID (optional)

    Returns:
        DICOM-SEG file (application/dicom)
    """
    temp_mask_path = None
    temp_dicom_seg_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        study_uid = params_dict.get("studyUID")
        series_uid = params_dict.get("seriesUID")
        segments = params_dict.get("segments", [])
        series_description = params_dict.get("seriesDescription", "MedAI Segmentation")
        content_creator = params_dict.get("contentCreator", "MedAI Viewer")
        clinical_trial_series_id = params_dict.get("clinicalTrialSeriesId")
        clinical_trial_timepoint_id = params_dict.get("clinicalTrialTimepointId")

        if not study_uid or not series_uid:
            raise HTTPException(status_code=400, detail="studyUID and seriesUID are required")

        if not segments:
            raise HTTPException(status_code=400, detail="At least one segment is required")

        # Save mask to temp file
        file_ext = ".nii.gz" if mask_file.filename and mask_file.filename.endswith(".gz") else ".nii"
        temp_fd, temp_mask_path = tempfile.mkstemp(suffix=file_ext)
        os.close(temp_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        logger.info(f"Saved mask to {temp_mask_path}, size: {len(content)} bytes")

        # Get DICOM directory for the source series
        # This would need to be configured based on your datastore
        from monailabel.interfaces.utils.app import app_instance

        try:
            instance = app_instance()
            datastore = instance.datastore()

            # Get series directory
            # For DICOMweb datastore, we need to download the series
            if hasattr(datastore, 'get_series_directory'):
                dicom_dir = datastore.get_series_directory(study_uid, series_uid)
            else:
                # Fallback: try to get image URI and extract directory
                image_id = f"{study_uid}/{series_uid}"
                dicom_dir = datastore.get_image_uri(image_id)
                if os.path.isfile(dicom_dir):
                    dicom_dir = os.path.dirname(dicom_dir)
        except Exception as e:
            logger.warning(f"Could not get DICOM directory from datastore: {e}")
            raise HTTPException(
                status_code=400,
                detail="Could not locate source DICOM series. Please ensure the series is loaded."
            )

        # Create template
        template = create_dicom_seg_template(
            segments=segments,
            series_description=series_description,
            content_creator=content_creator,
            clinical_trial_series_id=clinical_trial_series_id,
            clinical_trial_timepoint_id=clinical_trial_timepoint_id,
        )

        # Convert to DICOM-SEG
        temp_dicom_seg_path = nifti_to_dicom_seg_export(
            mask_path=temp_mask_path,
            dicom_dir=dicom_dir,
            template=template,
        )

        # Read DICOM-SEG and get SOP Instance UID
        dcm = pydicom.dcmread(temp_dicom_seg_path)
        sop_instance_uid = str(dcm.SOPInstanceUID)

        # Schedule cleanup
        background_tasks.add_task(remove_temp_file, temp_mask_path)

        # Return DICOM-SEG file
        return FileResponse(
            temp_dicom_seg_path,
            media_type="application/dicom",
            filename="segmentation.dcm",
            headers={"X-SOP-Instance-UID": sop_instance_uid},
            background=BackgroundTasks([lambda: remove_temp_file(temp_dicom_seg_path)]),
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("DICOM-SEG export failed")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    finally:
        # Clean up on error (success cleanup is handled by background tasks)
        pass


@router.post("/import")
async def import_dicom_seg(
    background_tasks: BackgroundTasks,
    dicom_seg_file: UploadFile = File(...),
):
    """
    Import DICOM-SEG and convert to NIfTI mask.

    Request body (multipart/form-data):
        - dicom_seg_file: DICOM-SEG file (.dcm)

    Returns:
        JSON with segment info and NIfTI mask file
    """
    temp_dcm_path = None
    temp_nifti_path = None

    try:
        # Save DICOM-SEG to temp file
        temp_fd, temp_dcm_path = tempfile.mkstemp(suffix=".dcm")
        os.close(temp_fd)

        with open(temp_dcm_path, "wb") as f:
            content = await dicom_seg_file.read()
            f.write(content)

        logger.info(f"Saved DICOM-SEG to {temp_dcm_path}, size: {len(content)} bytes")

        # Convert to NIfTI
        temp_nifti_path, segments = dicom_seg_to_nifti(temp_dcm_path)

        # Read NIfTI for multipart response
        with open(temp_nifti_path, "rb") as f:
            nifti_data = f.read()

        # Schedule cleanup
        background_tasks.add_task(remove_temp_file, temp_dcm_path)
        background_tasks.add_task(remove_temp_file, temp_nifti_path)

        # Return as multipart response
        import secrets
        from monailabel.utils.others.stream import stream_multipart

        meta_json = json.dumps({"segments": segments})
        return stream_multipart(meta_json, nifti_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("DICOM-SEG import failed")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.post("/upload-pacs")
async def upload_to_pacs(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_pacs_url: str = Header(..., alias="X-PACS-URL"),
):
    """
    Upload DICOM-SEG to PACS via DICOMweb STOW-RS.

    Request headers:
        - X-PACS-URL: DICOMweb STOW-RS endpoint URL

    Request body (multipart/form-data):
        - file: DICOM-SEG file

    Returns:
        JSON with upload status
    """
    temp_path = None

    try:
        # Save file to temp
        temp_fd, temp_path = tempfile.mkstemp(suffix=".dcm")
        os.close(temp_fd)

        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        logger.info(f"Uploading DICOM-SEG to PACS: {x_pacs_url}")

        # Upload via STOW-RS
        from monailabel.datastore.utils.dicom import dicom_web_upload_dcm

        result = dicom_web_upload_dcm(x_pacs_url, temp_path)

        return {"success": True, "result": result}

    except Exception as e:
        logger.exception("PACS upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        if temp_path:
            background_tasks.add_task(remove_temp_file, temp_path)


@router.get("/segments/{study_uid}/{series_uid}")
async def list_dicom_seg_segments(
    study_uid: str,
    series_uid: str,
):
    """
    List segments in a DICOM-SEG series.

    Returns:
        JSON with segment information
    """
    try:
        from monailabel.interfaces.utils.app import app_instance

        instance = app_instance()
        datastore = instance.datastore()

        # Get DICOM-SEG file
        image_id = f"{study_uid}/{series_uid}"
        dcm_path = datastore.get_image_uri(image_id)

        if not os.path.exists(dcm_path):
            raise HTTPException(status_code=404, detail="DICOM-SEG not found")

        # Read segment info
        dcm = pydicom.dcmread(dcm_path, stop_before_pixels=True)

        if not hasattr(dcm, 'SegmentSequence'):
            raise HTTPException(status_code=400, detail="Not a DICOM-SEG file")

        segments = []
        for seg in dcm.SegmentSequence:
            segments.append({
                "segmentNumber": int(seg.SegmentNumber),
                "segmentLabel": getattr(seg, 'SegmentLabel', f'Segment_{seg.SegmentNumber}'),
                "segmentDescription": getattr(seg, 'SegmentDescription', ''),
                "algorithmType": getattr(seg, 'SegmentAlgorithmType', 'UNKNOWN'),
                "algorithmName": getattr(seg, 'SegmentAlgorithmName', ''),
            })

        return {
            "studyUID": study_uid,
            "seriesUID": series_uid,
            "segmentCount": len(segments),
            "segments": segments,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list DICOM-SEG segments")
        raise HTTPException(status_code=500, detail=str(e))
