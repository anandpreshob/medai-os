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
Analytics endpoints for volumetrics and radiomics feature extraction.
"""

import json
import logging
import os
import tempfile
import time
from typing import Dict, List, Optional, Any

import nibabel as nib
import numpy as np
from scipy import ndimage
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    responses={
        404: {"description": "Not found"},
        200: {"description": "OK", "content": {"application/json": {}}},
    },
)


def remove_temp_file(path: str):
    """Background task to remove temporary files."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning(f"Failed to remove temp file {path}: {e}")


def compute_volumetrics(
    mask_data: np.ndarray,
    spacing: tuple,
    segment_labels: Dict[str, str]
) -> Dict[str, Any]:
    """
    Compute volumetric measurements for each segment using connected components.

    Args:
        mask_data: 3D numpy array with segment labels (0=background)
        spacing: Voxel spacing in mm (x, y, z)
        segment_labels: Mapping of segment index to label name

    Returns:
        Dictionary with volumetric results per segment
    """
    voxel_volume_mm3 = float(np.prod(spacing))
    unique_labels = np.unique(mask_data[mask_data > 0])

    segments = []

    for label_idx in unique_labels:
        label_idx = int(label_idx)
        binary_mask = (mask_data == label_idx)

        # Connected component analysis (26-connectivity for 3D)
        structure = ndimage.generate_binary_structure(3, 3)
        labeled_array, num_instances = ndimage.label(binary_mask, structure=structure)

        instances = []
        for instance_id in range(1, num_instances + 1):
            instance_mask = (labeled_array == instance_id)
            voxel_count = int(np.sum(instance_mask))
            volume_mm3 = voxel_count * voxel_volume_mm3

            # Compute centroid and dimensions
            coords = np.where(instance_mask)
            if len(coords[0]) > 0:
                centroid = [int(np.mean(c)) for c in coords]
                bbox_min = [int(np.min(c)) for c in coords]
                bbox_max = [int(np.max(c)) for c in coords]
                # Compute dimensions in voxels and mm
                extent_voxels = [bbox_max[i] - bbox_min[i] + 1 for i in range(3)]
                extent_mm = [round(extent_voxels[i] * spacing[i], 2) for i in range(3)]
                longest_axis_mm = max(extent_mm)
                # Compute 3D diagonal (maximum possible diameter)
                diagonal_mm = round(np.sqrt(sum(e**2 for e in extent_mm)), 2)
            else:
                centroid = [0, 0, 0]
                bbox_min = [0, 0, 0]
                bbox_max = [0, 0, 0]
                extent_mm = [0.0, 0.0, 0.0]
                longest_axis_mm = 0.0
                diagonal_mm = 0.0

            instances.append({
                "instance_id": instance_id,
                "voxel_count": voxel_count,
                "volume_mm3": round(volume_mm3, 4),
                "volume_cm3": round(volume_mm3 / 1000, 4),
                "centroid_ijk": centroid,
                "bounding_box": [bbox_min, bbox_max],
                "dimensions_mm": extent_mm,
                "longest_axis_mm": longest_axis_mm,
                "max_diameter_mm": diagonal_mm
            })

        total_voxels = int(np.sum(binary_mask))
        total_volume_mm3 = total_voxels * voxel_volume_mm3

        # Compute overall bounding box and dimensions for entire segment
        all_coords = np.where(binary_mask)
        if len(all_coords[0]) > 0:
            overall_bbox_min = [int(np.min(c)) for c in all_coords]
            overall_bbox_max = [int(np.max(c)) for c in all_coords]
            overall_extent_voxels = [overall_bbox_max[i] - overall_bbox_min[i] + 1 for i in range(3)]
            overall_extent_mm = [round(overall_extent_voxels[i] * spacing[i], 2) for i in range(3)]
            overall_longest_axis_mm = max(overall_extent_mm)
            overall_diagonal_mm = round(np.sqrt(sum(e**2 for e in overall_extent_mm)), 2)
        else:
            overall_extent_mm = [0.0, 0.0, 0.0]
            overall_longest_axis_mm = 0.0
            overall_diagonal_mm = 0.0

        segments.append({
            "segment_index": label_idx,
            "label": segment_labels.get(str(label_idx), f"Segment {label_idx}"),
            "total_voxel_count": total_voxels,
            "total_volume_mm3": round(total_volume_mm3, 4),
            "total_volume_cm3": round(total_volume_mm3 / 1000, 4),
            "dimensions_mm": overall_extent_mm,
            "longest_axis_mm": overall_longest_axis_mm,
            "max_diameter_mm": overall_diagonal_mm,
            "instance_count": num_instances,
            "instances": instances
        })

    return {"segments": segments}


def compute_radiomics(
    image_path: str,
    mask_path: str,
    segment_labels: Dict[str, str],
    settings: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Compute pyradiomics features for each segment.

    Args:
        image_path: Path to source image (NIfTI)
        mask_path: Path to segmentation mask (NIfTI)
        segment_labels: Mapping of segment index to label name
        settings: Optional pyradiomics settings

    Returns:
        Dictionary with radiomics features per segment
    """
    try:
        from radiomics import featureextractor
        import radiomics
        import SimpleITK as sitk
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Radiomics dependencies not installed: {e}"
        )

    start_time = time.time()

    # Configure extractor with default settings
    extractor_settings = {
        'binWidth': 25,
        'resampledPixelSpacing': None,  # Use original spacing
        'interpolator': sitk.sitkBSpline,
        'verbose': False,
        'force2D': False,
    }
    if settings:
        extractor_settings.update(settings)

    extractor = featureextractor.RadiomicsFeatureExtractor(**extractor_settings)

    # Enable all feature classes
    extractor.enableAllFeatures()

    # Load mask to get unique labels
    mask_nii = nib.load(mask_path)
    mask_data = mask_nii.get_fdata().astype(np.int32)
    # Squeeze to 3D if needed
    if mask_data.ndim > 3:
        mask_data = np.squeeze(mask_data)
    unique_labels = np.unique(mask_data[mask_data > 0])

    segments = []

    for label_idx in unique_labels:
        label_idx = int(label_idx)

        try:
            # Extract features for this segment
            features = extractor.execute(image_path, mask_path, label=label_idx)

            # Organize features by class
            organized = organize_features(features)

            segments.append({
                "segment_index": label_idx,
                "label": segment_labels.get(str(label_idx), f"Segment {label_idx}"),
                "features": organized
            })
        except Exception as e:
            logger.warning(f"Failed to extract features for segment {label_idx}: {e}")
            segments.append({
                "segment_index": label_idx,
                "label": segment_labels.get(str(label_idx), f"Segment {label_idx}"),
                "features": {},
                "error": str(e)
            })

    computation_time = time.time() - start_time

    # Count total features
    feature_count = 0
    if segments and "features" in segments[0]:
        for class_features in segments[0]["features"].values():
            if isinstance(class_features, dict):
                feature_count += len(class_features)

    return {
        "segments": segments,
        "metadata": {
            "pyradiomics_version": radiomics.__version__,
            "feature_count": feature_count,
            "computation_time_seconds": round(computation_time, 2)
        }
    }


def organize_features(features: Dict) -> Dict[str, Dict[str, float]]:
    """
    Organize flat pyradiomics output into nested structure by feature class.

    PyRadiomics outputs features like: "original_firstorder_Mean" -> value
    We organize them as: {"firstorder": {"Mean": value}}
    """
    organized = {
        "firstorder": {},
        "shape": {},
        "glcm": {},
        "glrlm": {},
        "glszm": {},
        "ngtdm": {},
        "gldm": {}
    }

    for key, value in features.items():
        # Skip diagnostic keys
        if key.startswith('diagnostics'):
            continue

        # Parse feature class from key (e.g., "original_firstorder_Mean")
        parts = key.split('_')
        if len(parts) >= 3:
            # parts[0] = filter (original, wavelet, etc.)
            # parts[1] = feature class
            # parts[2:] = feature name
            feature_class = parts[1].lower()
            feature_name = '_'.join(parts[2:])

            if feature_class in organized:
                try:
                    organized[feature_class][feature_name] = float(value)
                except (ValueError, TypeError):
                    # Skip non-numeric values
                    pass

    # Remove empty classes
    organized = {k: v for k, v in organized.items() if v}

    return organized


@router.post("/volumetrics")
async def volumetrics_endpoint(
    background_tasks: BackgroundTasks,
    image_file: Optional[UploadFile] = File(None),
    mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Compute volumetric measurements for segmentation mask.

    Returns volume and instance count for each segment using connected components analysis.
    """
    temp_mask_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        spacing_override = params_dict.get("spacing", None)

        # Save mask to temp file
        temp_mask_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_mask_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load mask
        mask_nii = nib.load(temp_mask_path)
        mask_data = mask_nii.get_fdata().astype(np.int32)
        # Squeeze to 3D if 4D with single time point
        if mask_data.ndim == 4 and mask_data.shape[3] == 1:
            mask_data = mask_data[:, :, :, 0]
        elif mask_data.ndim > 3:
            logger.warning(f"Mask has unexpected dimensions: {mask_data.shape}, squeezing...")
            mask_data = np.squeeze(mask_data)

        # Get spacing from NIfTI header or override (convert to native Python floats)
        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in mask_nii.header.get_zooms()[:3])

        # Compute volumetrics
        volumetrics_result = compute_volumetrics(mask_data, spacing, segment_labels)

        # Add metadata
        result = {
            "volumetrics": volumetrics_result,
            "metadata": {
                "image_dimensions": list(mask_data.shape),
                "voxel_spacing_mm": list(spacing),
                "voxel_volume_mm3": round(float(np.prod(spacing)), 6),
                "total_mask_voxels": int(np.sum(mask_data > 0))
            }
        }

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Volumetrics computation failed")
        raise HTTPException(status_code=500, detail=f"Volumetrics computation failed: {str(e)}")
    finally:
        # Schedule cleanup
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


@router.post("/radiomics")
async def radiomics_endpoint(
    background_tasks: BackgroundTasks,
    image_file: UploadFile = File(...),
    mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Compute pyradiomics features for segmentation.

    Extracts ~120 radiomics features including:
    - First Order Statistics (19 features)
    - Shape (3D) (16 features)
    - GLCM (24 features)
    - GLRLM (16 features)
    - GLSZM (16 features)
    - NGTDM (5 features)
    - GLDM (14 features)
    """
    temp_image_path = None
    temp_mask_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        radiomics_settings = params_dict.get("settings", None)

        # Save image to temp file
        temp_image_fd, temp_image_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_image_fd)

        with open(temp_image_path, "wb") as f:
            content = await image_file.read()
            f.write(content)

        # Save mask to temp file
        temp_mask_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_mask_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Compute radiomics
        result = compute_radiomics(
            temp_image_path,
            temp_mask_path,
            segment_labels,
            radiomics_settings
        )

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Radiomics computation failed")
        raise HTTPException(status_code=500, detail=f"Radiomics computation failed: {str(e)}")
    finally:
        # Schedule cleanup
        if temp_image_path:
            background_tasks.add_task(remove_temp_file, temp_image_path)
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


def compute_recist_measurements(
    mask_data: np.ndarray,
    spacing: tuple,
    segment_labels: Dict[str, str],
    lesion_metadata: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Compute RECIST 1.1 measurements for lesion segmentations.

    RECIST measurements include:
    - Longest diameter (longest axis in axial plane for non-lymph nodes)
    - Short axis (for lymph nodes, measured perpendicular to longest diameter)
    - Volume (for reference)

    Args:
        mask_data: 3D numpy array with segment labels (0=background)
        spacing: Voxel spacing in mm (x, y, z)
        segment_labels: Mapping of segment index to label name
        lesion_metadata: Optional list of dicts with lesion info (is_lymph_node, anatomical_region)

    Returns:
        Dictionary with RECIST measurements per segment
    """
    voxel_volume_mm3 = float(np.prod(spacing))
    unique_labels = np.unique(mask_data[mask_data > 0])

    lesions = []
    lesion_meta_map = {}
    if lesion_metadata:
        for meta in lesion_metadata:
            if "segment_index" in meta:
                lesion_meta_map[meta["segment_index"]] = meta

    for label_idx in unique_labels:
        label_idx = int(label_idx)
        binary_mask = (mask_data == label_idx)

        # Get voxel coordinates
        coords = np.where(binary_mask)
        if len(coords[0]) == 0:
            continue

        # Compute basic volumetrics
        voxel_count = int(np.sum(binary_mask))
        volume_mm3 = voxel_count * voxel_volume_mm3
        volume_cm3 = volume_mm3 / 1000

        # Compute bounding box
        bbox_min = [int(np.min(c)) for c in coords]
        bbox_max = [int(np.max(c)) for c in coords]

        # Compute extent in mm
        extent_voxels = [bbox_max[i] - bbox_min[i] + 1 for i in range(3)]
        extent_mm = [round(extent_voxels[i] * spacing[i], 2) for i in range(3)]

        # Get lesion metadata
        meta = lesion_meta_map.get(label_idx, {})
        is_lymph_node = meta.get("is_lymph_node", False)
        anatomical_region = meta.get("anatomical_region", "Unknown")

        # RECIST measurements
        # For axial plane measurements (typical CT), x and y are in-plane
        # Longest diameter: max extent in axial plane
        # For lymph nodes: short axis is perpendicular to longest axis

        axial_extents = [extent_mm[0], extent_mm[1]]  # x, y extents
        longest_diameter_mm = max(axial_extents)
        short_axis_mm = min(axial_extents)

        # Compute centroid in physical coordinates
        centroid_ijk = [int(np.mean(c)) for c in coords]
        centroid_mm = [round(centroid_ijk[i] * spacing[i], 2) for i in range(3)]

        # Determine measurement to use for RECIST SLD
        # Non-lymph node: longest diameter
        # Lymph node: short axis (if >= 15mm, otherwise not measurable for target)
        if is_lymph_node:
            recist_measurement_mm = short_axis_mm
            measurement_type = "short_axis"
        else:
            recist_measurement_mm = longest_diameter_mm
            measurement_type = "longest_diameter"

        # Check measurability per RECIST 1.1
        is_measurable_target = False
        measurability_note = ""

        if is_lymph_node:
            if short_axis_mm >= 15:
                is_measurable_target = True
            elif short_axis_mm >= 10:
                measurability_note = "Pathological but not measurable (10-15mm short axis)"
            else:
                measurability_note = "Normal lymph node (<10mm short axis)"
        else:
            if longest_diameter_mm >= 10:
                is_measurable_target = True
            else:
                measurability_note = "Below minimum measurable size (<10mm)"

        lesion_result = {
            "segment_index": label_idx,
            "label": segment_labels.get(str(label_idx), f"Lesion {label_idx}"),
            "anatomical_region": anatomical_region,
            "is_lymph_node": is_lymph_node,
            "measurements": {
                "longest_diameter_mm": round(longest_diameter_mm, 2),
                "short_axis_mm": round(short_axis_mm, 2),
                "axial_extents_mm": [round(e, 2) for e in axial_extents],
                "craniocaudal_extent_mm": round(extent_mm[2], 2),
                "volume_cm3": round(volume_cm3, 4),
                "volume_mm3": round(volume_mm3, 4),
            },
            "recist": {
                "measurement_mm": round(recist_measurement_mm, 2),
                "measurement_type": measurement_type,
                "is_measurable_target": is_measurable_target,
                "measurability_note": measurability_note,
            },
            "geometry": {
                "voxel_count": voxel_count,
                "centroid_ijk": centroid_ijk,
                "centroid_mm": centroid_mm,
                "bounding_box": [bbox_min, bbox_max],
                "dimensions_mm": extent_mm,
            }
        }

        lesions.append(lesion_result)

    # Compute summary statistics
    measurable_lesions = [l for l in lesions if l["recist"]["is_measurable_target"]]
    sum_of_longest_diameters = sum(l["recist"]["measurement_mm"] for l in measurable_lesions)

    return {
        "lesions": lesions,
        "summary": {
            "total_lesion_count": len(lesions),
            "measurable_target_count": len(measurable_lesions),
            "sum_of_longest_diameters_mm": round(sum_of_longest_diameters, 2),
            "total_tumor_volume_cm3": round(sum(l["measurements"]["volume_cm3"] for l in lesions), 4),
        }
    }


@router.post("/recist-measurements")
async def recist_measurements_endpoint(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Compute RECIST 1.1 measurements for lesion segmentations.

    Returns longest diameter and short axis measurements suitable for
    RECIST response assessment tracking.

    Parameters (in params JSON):
    - segment_labels: Mapping of segment index to label name
    - spacing: Optional voxel spacing override [x, y, z] in mm
    - lesion_metadata: Optional list of lesion info with segment_index,
                       is_lymph_node, anatomical_region

    Returns:
    - lesions: Per-lesion measurements including RECIST-specific values
    - summary: Aggregate statistics including SLD
    """
    temp_mask_path = None

    try:
        # Parse parameters
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        spacing_override = params_dict.get("spacing", None)
        lesion_metadata = params_dict.get("lesion_metadata", None)

        # Save mask to temp file
        temp_mask_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_mask_fd)

        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load mask
        mask_nii = nib.load(temp_mask_path)
        mask_data = mask_nii.get_fdata().astype(np.int32)

        # Squeeze to 3D if needed
        if mask_data.ndim == 4 and mask_data.shape[3] == 1:
            mask_data = mask_data[:, :, :, 0]
        elif mask_data.ndim > 3:
            logger.warning(f"Mask has unexpected dimensions: {mask_data.shape}, squeezing...")
            mask_data = np.squeeze(mask_data)

        # Get spacing
        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in mask_nii.header.get_zooms()[:3])

        # Compute RECIST measurements
        result = compute_recist_measurements(
            mask_data,
            spacing,
            segment_labels,
            lesion_metadata
        )

        # Add metadata
        result["metadata"] = {
            "image_dimensions": list(mask_data.shape),
            "voxel_spacing_mm": list(spacing),
            "recist_version": "1.1",
            "measurement_method": "bounding_box_extent",
            "notes": [
                "Longest diameter measured as max extent in axial plane",
                "Short axis measured perpendicular to longest diameter",
                "Lymph nodes use short axis for RECIST SLD calculation",
                "Target lesion eligibility: non-LN >= 10mm, LN short axis >= 15mm"
            ]
        }

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("RECIST measurement computation failed")
        raise HTTPException(status_code=500, detail=f"RECIST measurement computation failed: {str(e)}")
    finally:
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)
