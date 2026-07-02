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
Neuro Analytics endpoints for neurology-specific metrics and analysis.

Provides:
- ICV normalization
- Asymmetry indices
- Regional grouping
- Lesion classification (MS-style, vascular)
"""

import json
import logging
import os
import tempfile
from typing import Dict, List, Optional, Any, Tuple

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial.distance import cdist
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analytics",
    tags=["Neuro Analytics"],
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


# ============================================================================
# ICV Normalization
# ============================================================================

def compute_icv(
    mask_data: np.ndarray,
    spacing: Tuple[float, float, float],
    brain_labels: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Estimate Intracranial Volume (ICV) from brain segmentation.

    If brain_labels are provided, uses those specific labels.
    Otherwise, treats all non-zero voxels as brain.

    Args:
        mask_data: 3D segmentation array
        spacing: Voxel spacing in mm
        brain_labels: Optional list of segment indices to include

    Returns:
        Dictionary with ICV estimate and metadata
    """
    voxel_volume_mm3 = float(np.prod(spacing))

    if brain_labels:
        # Sum specified labels
        brain_mask = np.isin(mask_data, brain_labels)
    else:
        # All non-zero voxels
        brain_mask = mask_data > 0

    voxel_count = int(np.sum(brain_mask))
    volume_mm3 = voxel_count * voxel_volume_mm3
    volume_ml = volume_mm3 / 1000  # Convert to mL

    return {
        "icv_ml": round(volume_ml, 2),
        "icv_mm3": round(volume_mm3, 2),
        "voxel_count": voxel_count,
        "method": "segmentation",
        "labels_used": brain_labels or "all_nonzero"
    }


def normalize_to_icv(volume_ml: float, icv_ml: float) -> Dict[str, float]:
    """
    Normalize a volume to ICV.

    Returns volume per 1000 mL ICV for comparability.
    """
    if icv_ml == 0:
        return {
            "raw_volume_ml": volume_ml,
            "normalized_volume": 0,
            "percent_of_icv": 0
        }

    return {
        "raw_volume_ml": round(volume_ml, 4),
        "normalized_volume": round((volume_ml / icv_ml) * 1000, 4),  # per 1000 mL ICV
        "percent_of_icv": round((volume_ml / icv_ml) * 100, 4)
    }


# ============================================================================
# Asymmetry Index
# ============================================================================

def compute_asymmetry_index(left_volume: float, right_volume: float) -> Dict[str, Any]:
    """
    Compute asymmetry index between left and right structures.

    AI = ((L - R) / ((L + R) / 2)) * 100

    Interpretation:
    - |AI| < 5%: Normal
    - |AI| 5-10%: Mild asymmetry
    - |AI| > 10%: Significant asymmetry
    - |AI| > 20%: Severe asymmetry
    """
    mean_volume = (left_volume + right_volume) / 2

    if mean_volume == 0:
        return {
            "asymmetry_percent": 0,
            "interpretation": "undefined",
            "dominant_side": "symmetric"
        }

    ai = ((left_volume - right_volume) / mean_volume) * 100
    abs_ai = abs(ai)

    # Determine interpretation
    if abs_ai < 5:
        interpretation = "normal"
    elif abs_ai < 10:
        interpretation = "mild"
    elif abs_ai < 20:
        interpretation = "significant"
    else:
        interpretation = "severe"

    # Determine dominant side
    if abs_ai < 5:
        dominant_side = "symmetric"
    elif ai > 0:
        dominant_side = "left"
    else:
        dominant_side = "right"

    return {
        "left_volume_ml": round(left_volume, 4),
        "right_volume_ml": round(right_volume, 4),
        "asymmetry_percent": round(ai, 2),
        "interpretation": interpretation,
        "dominant_side": dominant_side
    }


# ============================================================================
# Lesion Classification
# ============================================================================

def classify_ms_lesion(
    lesion_centroid: np.ndarray,
    ventricle_mask: Optional[np.ndarray],
    cortex_mask: Optional[np.ndarray],
    brainstem_cerebellum_mask: Optional[np.ndarray],
    spacing: Tuple[float, float, float],
    periventricular_threshold_mm: float = 3.0,
    juxtacortical_threshold_mm: float = 3.0
) -> Dict[str, Any]:
    """
    Classify a lesion according to MS diagnostic criteria locations.

    MS lesion locations:
    - Periventricular: within 3mm of lateral ventricles
    - Juxtacortical: within 3mm of cortical gray matter
    - Infratentorial: brainstem or cerebellum
    - Deep white matter: all other white matter lesions

    Args:
        lesion_centroid: 3D coordinates [x, y, z] in voxel space
        ventricle_mask: Binary mask of ventricles
        cortex_mask: Binary mask of cortical gray matter
        brainstem_cerebellum_mask: Binary mask of brainstem/cerebellum
        spacing: Voxel spacing in mm
        periventricular_threshold_mm: Distance threshold for periventricular
        juxtacortical_threshold_mm: Distance threshold for juxtacortical

    Returns:
        Classification result with distances
    """
    result = {
        "location": "deep_white_matter",  # Default
        "distance_to_ventricle_mm": None,
        "distance_to_cortex_mm": None,
        "is_infratentorial": False
    }

    centroid = np.array(lesion_centroid)

    # Check infratentorial first
    if brainstem_cerebellum_mask is not None:
        centroid_idx = tuple(centroid.astype(int))
        if (0 <= centroid_idx[0] < brainstem_cerebellum_mask.shape[0] and
            0 <= centroid_idx[1] < brainstem_cerebellum_mask.shape[1] and
            0 <= centroid_idx[2] < brainstem_cerebellum_mask.shape[2]):
            if brainstem_cerebellum_mask[centroid_idx]:
                result["location"] = "infratentorial"
                result["is_infratentorial"] = True
                return result

    # Compute distance to ventricle
    if ventricle_mask is not None:
        vent_coords = np.array(np.where(ventricle_mask)).T
        if len(vent_coords) > 0:
            # Compute minimum distance in mm
            distances = cdist([centroid], vent_coords) * np.array(spacing)
            min_dist = np.min(distances)
            result["distance_to_ventricle_mm"] = round(float(min_dist), 2)

            if min_dist <= periventricular_threshold_mm:
                result["location"] = "periventricular"
                return result

    # Compute distance to cortex
    if cortex_mask is not None:
        cortex_coords = np.array(np.where(cortex_mask)).T
        if len(cortex_coords) > 0:
            distances = cdist([centroid], cortex_coords) * np.array(spacing)
            min_dist = np.min(distances)
            result["distance_to_cortex_mm"] = round(float(min_dist), 2)

            if min_dist <= juxtacortical_threshold_mm:
                result["location"] = "juxtacortical"
                return result

    return result


def compute_lesion_classification(
    lesion_mask: np.ndarray,
    anatomy_masks: Dict[str, np.ndarray],
    spacing: Tuple[float, float, float],
    segment_labels: Dict[str, str]
) -> Dict[str, Any]:
    """
    Classify all lesions in a segmentation mask.

    Args:
        lesion_mask: 3D lesion segmentation mask
        anatomy_masks: Dictionary of anatomy reference masks
        spacing: Voxel spacing in mm
        segment_labels: Mapping of segment index to label name

    Returns:
        Classification results for all lesions
    """
    voxel_volume_mm3 = float(np.prod(spacing))
    unique_labels = np.unique(lesion_mask[lesion_mask > 0])

    # Get reference anatomy masks
    ventricle_mask = anatomy_masks.get("ventricles")
    cortex_mask = anatomy_masks.get("cortex")
    brainstem_cerebellum_mask = anatomy_masks.get("brainstem_cerebellum")

    lesions = []
    counts_by_location = {
        "periventricular": 0,
        "juxtacortical": 0,
        "infratentorial": 0,
        "deep_white_matter": 0
    }

    for label_idx in unique_labels:
        label_idx = int(label_idx)
        binary_mask = (lesion_mask == label_idx)

        # Connected components
        structure = ndimage.generate_binary_structure(3, 3)
        labeled_array, num_instances = ndimage.label(binary_mask, structure=structure)

        for instance_id in range(1, num_instances + 1):
            instance_mask = (labeled_array == instance_id)
            voxel_count = int(np.sum(instance_mask))
            volume_mm3 = voxel_count * voxel_volume_mm3
            volume_ml = volume_mm3 / 1000

            # Compute centroid
            coords = np.where(instance_mask)
            centroid = np.array([np.mean(c) for c in coords])

            # Classify
            classification = classify_ms_lesion(
                centroid,
                ventricle_mask,
                cortex_mask,
                brainstem_cerebellum_mask,
                spacing
            )

            location = classification["location"]
            counts_by_location[location] = counts_by_location.get(location, 0) + 1

            lesions.append({
                "segment_index": label_idx,
                "instance_id": instance_id,
                "label": segment_labels.get(str(label_idx), f"Lesion {label_idx}"),
                "volume_ml": round(volume_ml, 4),
                "centroid_ijk": [int(c) for c in centroid],
                "ms_location": location,
                "distance_to_ventricle_mm": classification["distance_to_ventricle_mm"],
                "distance_to_cortex_mm": classification["distance_to_cortex_mm"]
            })

    return {
        "lesions": lesions,
        "counts_by_location": counts_by_location,
        "total_lesion_count": len(lesions),
        "total_lesion_volume_ml": round(sum(l["volume_ml"] for l in lesions), 4)
    }


# ============================================================================
# Regional Grouping
# ============================================================================

# Brain region groupings
REGION_GROUPS = {
    "frontal": ["frontal_lobe", "prefrontal", "motor_cortex", "premotor"],
    "temporal": ["temporal_lobe", "hippocampus", "amygdala", "parahippocampal"],
    "parietal": ["parietal_lobe", "somatosensory", "precuneus"],
    "occipital": ["occipital_lobe", "visual_cortex", "cuneus", "calcarine"],
    "subcortical": ["thalamus", "caudate", "putamen", "globus_pallidus", "accumbens"],
    "cerebellum": ["cerebellum", "cerebellar_vermis", "cerebellar_hemisphere"],
    "brainstem": ["brainstem", "midbrain", "pons", "medulla"],
    "ventricles": ["lateral_ventricle", "third_ventricle", "fourth_ventricle"],
    "white_matter": ["white_matter", "corpus_callosum", "internal_capsule"]
}


def classify_region_to_group(region_name: str) -> str:
    """Map a region name to its group."""
    region_lower = region_name.lower().replace(" ", "_")

    for group, regions in REGION_GROUPS.items():
        if any(r in region_lower for r in regions):
            return group

    return "other"


def group_regions(
    regions: List[Dict[str, Any]]
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Group regions by anatomical category.

    Args:
        regions: List of region dicts with 'label' and 'volume_ml'

    Returns:
        Dictionary mapping group names to lists of regions
    """
    grouped = {
        "frontal": [],
        "temporal": [],
        "parietal": [],
        "occipital": [],
        "subcortical": [],
        "cerebellum": [],
        "brainstem": [],
        "ventricles": [],
        "white_matter": [],
        "other": []
    }

    for region in regions:
        label = region.get("label", "")
        group = classify_region_to_group(label)
        grouped[group].append({
            **region,
            "group": group
        })

    # Sort each group by volume
    for group in grouped:
        grouped[group] = sorted(grouped[group], key=lambda r: r.get("volume_ml", 0), reverse=True)

    return grouped


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/neuro-metrics")
async def neuro_metrics_endpoint(
    background_tasks: BackgroundTasks,
    brain_mask_file: UploadFile = File(...),
    anatomy_mask_file: Optional[UploadFile] = File(None),
    params: str = Form("{}")
):
    """
    Compute comprehensive neuro metrics including:
    - ICV estimation
    - Per-structure volumes (ICV-normalized)
    - Asymmetry indices for paired structures
    - Regional grouping

    Parameters (in params JSON):
    - segment_labels: Mapping of segment index to label name
    - paired_structures: List of tuples [left_label, right_label] for asymmetry
    - brain_labels: Optional list of segment indices for ICV calculation
    - compute_icv: Whether to compute ICV (default: true)
    - compute_asymmetry: Whether to compute asymmetry (default: true)
    """
    temp_brain_path = None
    temp_anatomy_path = None

    try:
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        paired_structures = params_dict.get("paired_structures", [])
        brain_labels = params_dict.get("brain_labels", None)
        compute_icv_flag = params_dict.get("compute_icv", True)
        compute_asymmetry_flag = params_dict.get("compute_asymmetry", True)
        spacing_override = params_dict.get("spacing", None)

        # Save brain mask
        temp_brain_fd, temp_brain_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_brain_fd)
        with open(temp_brain_path, "wb") as f:
            content = await brain_mask_file.read()
            f.write(content)

        # Load mask
        brain_nii = nib.load(temp_brain_path)
        brain_data = brain_nii.get_fdata().astype(np.int32)

        if brain_data.ndim > 3:
            brain_data = np.squeeze(brain_data)

        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in brain_nii.header.get_zooms()[:3])

        voxel_volume_mm3 = float(np.prod(spacing))

        result = {
            "spacing_mm": list(spacing),
            "dimensions": list(brain_data.shape)
        }

        # Compute ICV
        if compute_icv_flag:
            icv_result = compute_icv(brain_data, spacing, brain_labels)
            result["icv"] = icv_result

        # Compute per-structure volumes
        unique_labels = np.unique(brain_data[brain_data > 0])
        structures = []

        for label_idx in unique_labels:
            label_idx = int(label_idx)
            binary_mask = (brain_data == label_idx)
            voxel_count = int(np.sum(binary_mask))
            volume_mm3 = voxel_count * voxel_volume_mm3
            volume_ml = volume_mm3 / 1000

            structure = {
                "segment_index": label_idx,
                "label": segment_labels.get(str(label_idx), f"Structure {label_idx}"),
                "volume_ml": round(volume_ml, 4),
                "voxel_count": voxel_count
            }

            # ICV normalization
            if compute_icv_flag and result.get("icv"):
                normalized = normalize_to_icv(volume_ml, result["icv"]["icv_ml"])
                structure["icv_normalized"] = normalized

            structures.append(structure)

        result["structures"] = structures

        # Group structures
        result["grouped_structures"] = group_regions(structures)

        # Compute asymmetry indices
        if compute_asymmetry_flag and paired_structures:
            asymmetry_results = []

            for left_label, right_label in paired_structures:
                left_struct = next((s for s in structures if s["label"] == left_label), None)
                right_struct = next((s for s in structures if s["label"] == right_label), None)

                if left_struct and right_struct:
                    ai_result = compute_asymmetry_index(
                        left_struct["volume_ml"],
                        right_struct["volume_ml"]
                    )
                    ai_result["region"] = left_label.replace("_left", "").replace("_L", "")
                    asymmetry_results.append(ai_result)

            result["asymmetry_indices"] = asymmetry_results

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Neuro metrics computation failed")
        raise HTTPException(status_code=500, detail=f"Neuro metrics computation failed: {str(e)}")
    finally:
        if temp_brain_path:
            background_tasks.add_task(remove_temp_file, temp_brain_path)
        if temp_anatomy_path:
            background_tasks.add_task(remove_temp_file, temp_anatomy_path)


@router.post("/lesion-classification")
async def lesion_classification_endpoint(
    background_tasks: BackgroundTasks,
    lesion_mask_file: UploadFile = File(...),
    anatomy_mask_file: Optional[UploadFile] = File(None),
    params: str = Form("{}")
):
    """
    Classify lesions according to MS diagnostic criteria and vascular patterns.

    MS lesion locations:
    - Periventricular (within 3mm of lateral ventricles)
    - Juxtacortical (within 3mm of cortical gray matter)
    - Infratentorial (brainstem, cerebellum)
    - Deep white matter (all other WM lesions)

    Parameters (in params JSON):
    - segment_labels: Mapping of segment index to label name
    - ventricle_label: Segment index for ventricles in anatomy mask
    - cortex_label: Segment index for cortex in anatomy mask
    - brainstem_cerebellum_labels: List of indices for brainstem/cerebellum
    - periventricular_threshold_mm: Distance threshold (default: 3.0)
    - juxtacortical_threshold_mm: Distance threshold (default: 3.0)
    """
    temp_lesion_path = None
    temp_anatomy_path = None

    try:
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        ventricle_label = params_dict.get("ventricle_label")
        cortex_label = params_dict.get("cortex_label")
        brainstem_cerebellum_labels = params_dict.get("brainstem_cerebellum_labels", [])
        periventricular_threshold = params_dict.get("periventricular_threshold_mm", 3.0)
        juxtacortical_threshold = params_dict.get("juxtacortical_threshold_mm", 3.0)
        spacing_override = params_dict.get("spacing", None)

        # Save lesion mask
        temp_lesion_fd, temp_lesion_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_lesion_fd)
        with open(temp_lesion_path, "wb") as f:
            content = await lesion_mask_file.read()
            f.write(content)

        # Load lesion mask
        lesion_nii = nib.load(temp_lesion_path)
        lesion_data = lesion_nii.get_fdata().astype(np.int32)

        if lesion_data.ndim > 3:
            lesion_data = np.squeeze(lesion_data)

        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in lesion_nii.header.get_zooms()[:3])

        # Load anatomy mask if provided
        anatomy_masks = {}
        if anatomy_mask_file:
            temp_anatomy_fd, temp_anatomy_path = tempfile.mkstemp(suffix=".nii.gz")
            os.close(temp_anatomy_fd)
            with open(temp_anatomy_path, "wb") as f:
                content = await anatomy_mask_file.read()
                f.write(content)

            anatomy_nii = nib.load(temp_anatomy_path)
            anatomy_data = anatomy_nii.get_fdata().astype(np.int32)

            if anatomy_data.ndim > 3:
                anatomy_data = np.squeeze(anatomy_data)

            if ventricle_label is not None:
                anatomy_masks["ventricles"] = (anatomy_data == ventricle_label)

            if cortex_label is not None:
                anatomy_masks["cortex"] = (anatomy_data == cortex_label)

            if brainstem_cerebellum_labels:
                anatomy_masks["brainstem_cerebellum"] = np.isin(anatomy_data, brainstem_cerebellum_labels)

        # Classify lesions
        result = compute_lesion_classification(
            lesion_data,
            anatomy_masks,
            spacing,
            segment_labels
        )

        result["metadata"] = {
            "spacing_mm": list(spacing),
            "dimensions": list(lesion_data.shape),
            "periventricular_threshold_mm": periventricular_threshold,
            "juxtacortical_threshold_mm": juxtacortical_threshold,
            "anatomy_masks_provided": list(anatomy_masks.keys())
        }

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Lesion classification failed")
        raise HTTPException(status_code=500, detail=f"Lesion classification failed: {str(e)}")
    finally:
        if temp_lesion_path:
            background_tasks.add_task(remove_temp_file, temp_lesion_path)
        if temp_anatomy_path:
            background_tasks.add_task(remove_temp_file, temp_anatomy_path)


@router.post("/icv-normalization")
async def icv_normalization_endpoint(
    params: str = Form("{}")
):
    """
    Normalize volumes to ICV (simple calculation endpoint).

    Parameters (in params JSON):
    - icv_ml: Intracranial volume in mL
    - volumes: List of {label, volume_ml} to normalize

    Returns normalized volumes with percentages.
    """
    try:
        params_dict = json.loads(params)
        icv_ml = params_dict.get("icv_ml")
        volumes = params_dict.get("volumes", [])

        if not icv_ml:
            raise HTTPException(status_code=400, detail="icv_ml is required")

        normalized = []
        for vol in volumes:
            label = vol.get("label", "Unknown")
            volume_ml = vol.get("volume_ml", 0)

            result = normalize_to_icv(volume_ml, icv_ml)
            result["label"] = label
            normalized.append(result)

        return {
            "icv_ml": icv_ml,
            "normalized_volumes": normalized
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("ICV normalization failed")
        raise HTTPException(status_code=500, detail=f"ICV normalization failed: {str(e)}")


@router.post("/asymmetry-indices")
async def asymmetry_indices_endpoint(
    params: str = Form("{}")
):
    """
    Compute asymmetry indices for paired structures.

    Parameters (in params JSON):
    - paired_volumes: List of {region, left_ml, right_ml}

    Returns asymmetry indices with interpretations.
    """
    try:
        params_dict = json.loads(params)
        paired_volumes = params_dict.get("paired_volumes", [])

        results = []
        for pair in paired_volumes:
            region = pair.get("region", "Unknown")
            left_ml = pair.get("left_ml", 0)
            right_ml = pair.get("right_ml", 0)

            ai_result = compute_asymmetry_index(left_ml, right_ml)
            ai_result["region"] = region
            results.append(ai_result)

        # Summary
        significant = [r for r in results if r["interpretation"] in ["significant", "severe"]]

        return {
            "asymmetry_indices": results,
            "summary": {
                "total_pairs": len(results),
                "significant_asymmetries": len(significant),
                "regions_with_asymmetry": [r["region"] for r in significant]
            }
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Asymmetry computation failed")
        raise HTTPException(status_code=500, detail=f"Asymmetry computation failed: {str(e)}")
