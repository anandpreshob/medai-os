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
Neuro Longitudinal Analysis endpoints for tracking changes over time.

Provides:
- Lesion correspondence (new/enlarging/resolved)
- Atrophy rate calculation
- Volume change tracking
- Longitudinal report generation
"""

import json
import logging
import os
import tempfile
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial.distance import cdist
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analytics",
    tags=["Neuro Longitudinal"],
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
# Lesion Correspondence
# ============================================================================

def compute_lesion_overlap(
    mask1: np.ndarray,
    mask2: np.ndarray
) -> float:
    """
    Compute Dice-like overlap between two binary masks.

    Returns overlap coefficient (0-1).
    """
    intersection = np.sum(mask1 & mask2)
    union = np.sum(mask1) + np.sum(mask2)

    if union == 0:
        return 0.0

    return 2 * intersection / union


def match_lesions(
    baseline_mask: np.ndarray,
    followup_mask: np.ndarray,
    spacing: Tuple[float, float, float],
    overlap_threshold: float = 0.3,
    distance_threshold_mm: float = 10.0,
    volume_change_threshold: float = 0.2
) -> Dict[str, Any]:
    """
    Match lesions between baseline and follow-up.

    Lesion correspondence logic:
    - Matched: Overlap >30% between timepoints OR centroid within 10mm
    - New: Only in follow-up
    - Resolved: Only in baseline
    - Enlarging: Volume increase >20%

    Args:
        baseline_mask: Baseline lesion segmentation
        followup_mask: Follow-up lesion segmentation
        spacing: Voxel spacing in mm
        overlap_threshold: Minimum overlap for matching
        distance_threshold_mm: Maximum centroid distance for matching
        volume_change_threshold: Threshold for enlarging classification

    Returns:
        Dictionary with correspondence results
    """
    voxel_volume_mm3 = float(np.prod(spacing))

    # Get connected components for each timepoint
    structure = ndimage.generate_binary_structure(3, 3)

    baseline_labeled, n_baseline = ndimage.label(baseline_mask > 0, structure=structure)
    followup_labeled, n_followup = ndimage.label(followup_mask > 0, structure=structure)

    # Extract lesion info for baseline
    baseline_lesions = []
    for i in range(1, n_baseline + 1):
        mask = (baseline_labeled == i)
        voxel_count = int(np.sum(mask))
        coords = np.where(mask)
        centroid = np.array([np.mean(c) for c in coords])

        baseline_lesions.append({
            "id": i,
            "voxel_count": voxel_count,
            "volume_mm3": voxel_count * voxel_volume_mm3,
            "centroid": centroid,
            "mask": mask
        })

    # Extract lesion info for follow-up
    followup_lesions = []
    for i in range(1, n_followup + 1):
        mask = (followup_labeled == i)
        voxel_count = int(np.sum(mask))
        coords = np.where(mask)
        centroid = np.array([np.mean(c) for c in coords])

        followup_lesions.append({
            "id": i,
            "voxel_count": voxel_count,
            "volume_mm3": voxel_count * voxel_volume_mm3,
            "centroid": centroid,
            "mask": mask
        })

    # Match lesions
    matched = []
    baseline_matched = set()
    followup_matched = set()

    for bl in baseline_lesions:
        best_match = None
        best_score = 0

        for fu in followup_lesions:
            if fu["id"] in followup_matched:
                continue

            # Check overlap
            overlap = compute_lesion_overlap(bl["mask"], fu["mask"])

            # Check centroid distance
            centroid_dist = np.sqrt(np.sum(
                ((bl["centroid"] - fu["centroid"]) * np.array(spacing)) ** 2
            ))

            # Score based on overlap and distance
            if overlap >= overlap_threshold or centroid_dist <= distance_threshold_mm:
                score = overlap + max(0, 1 - centroid_dist / distance_threshold_mm)

                if score > best_score:
                    best_score = score
                    best_match = fu

        if best_match:
            baseline_matched.add(bl["id"])
            followup_matched.add(best_match["id"])

            # Determine if enlarging
            volume_change = (best_match["volume_mm3"] - bl["volume_mm3"]) / bl["volume_mm3"]

            status = "stable"
            if volume_change > volume_change_threshold:
                status = "enlarging"
            elif volume_change < -volume_change_threshold:
                status = "shrinking"

            matched.append({
                "baseline_id": bl["id"],
                "followup_id": best_match["id"],
                "baseline_volume_mm3": round(bl["volume_mm3"], 2),
                "followup_volume_mm3": round(best_match["volume_mm3"], 2),
                "volume_change_percent": round(volume_change * 100, 1),
                "status": status,
                "overlap_score": round(compute_lesion_overlap(bl["mask"], best_match["mask"]), 3),
                "centroid_distance_mm": round(float(np.sqrt(np.sum(
                    ((bl["centroid"] - best_match["centroid"]) * np.array(spacing)) ** 2
                ))), 2)
            })

    # Identify new lesions (in follow-up only)
    new_lesions = [
        {
            "followup_id": fu["id"],
            "volume_mm3": round(fu["volume_mm3"], 2),
            "centroid_ijk": [int(c) for c in fu["centroid"]]
        }
        for fu in followup_lesions if fu["id"] not in followup_matched
    ]

    # Identify resolved lesions (in baseline only)
    resolved_lesions = [
        {
            "baseline_id": bl["id"],
            "volume_mm3": round(bl["volume_mm3"], 2),
            "centroid_ijk": [int(c) for c in bl["centroid"]]
        }
        for bl in baseline_lesions if bl["id"] not in baseline_matched
    ]

    # Summary statistics
    total_baseline_volume = sum(bl["volume_mm3"] for bl in baseline_lesions)
    total_followup_volume = sum(fu["volume_mm3"] for fu in followup_lesions)
    volume_change_percent = (
        (total_followup_volume - total_baseline_volume) / total_baseline_volume * 100
        if total_baseline_volume > 0 else 0
    )

    return {
        "matched_lesions": matched,
        "new_lesions": new_lesions,
        "resolved_lesions": resolved_lesions,
        "summary": {
            "baseline_lesion_count": n_baseline,
            "followup_lesion_count": n_followup,
            "matched_count": len(matched),
            "new_count": len(new_lesions),
            "resolved_count": len(resolved_lesions),
            "enlarging_count": sum(1 for m in matched if m["status"] == "enlarging"),
            "shrinking_count": sum(1 for m in matched if m["status"] == "shrinking"),
            "stable_count": sum(1 for m in matched if m["status"] == "stable"),
            "total_baseline_volume_mm3": round(total_baseline_volume, 2),
            "total_followup_volume_mm3": round(total_followup_volume, 2),
            "total_volume_change_percent": round(volume_change_percent, 1)
        }
    }


# ============================================================================
# Atrophy Analysis
# ============================================================================

def calculate_atrophy_rate(
    baseline_volume_ml: float,
    current_volume_ml: float,
    interval_days: int
) -> Dict[str, Any]:
    """
    Calculate annualized atrophy rate.

    Formula: ((baseline - current) / baseline) * (365 / interval_days) * 100

    Reference ranges (approximate):
    - Normal aging (20-60): 0.2-0.5%/year
    - Normal aging (60+): 0.5-1.0%/year
    - AD hippocampus: 3-6%/year
    - MS whole brain: 0.5-1.0%/year
    """
    if baseline_volume_ml == 0 or interval_days == 0:
        return {
            "annualized_rate_percent": 0,
            "percent_change": 0,
            "interpretation": "undefined"
        }

    percent_change = ((baseline_volume_ml - current_volume_ml) / baseline_volume_ml) * 100
    annualized_rate = percent_change * (365 / interval_days)

    # Interpret rate
    abs_rate = abs(annualized_rate)
    if abs_rate < 0.5:
        interpretation = "normal"
    elif abs_rate < 1.0:
        interpretation = "borderline"
    elif abs_rate < 2.0:
        interpretation = "accelerated"
    else:
        interpretation = "pathological"

    return {
        "baseline_volume_ml": round(baseline_volume_ml, 4),
        "current_volume_ml": round(current_volume_ml, 4),
        "absolute_change_ml": round(baseline_volume_ml - current_volume_ml, 4),
        "percent_change": round(percent_change, 2),
        "interval_days": interval_days,
        "annualized_rate_percent": round(annualized_rate, 2),
        "interpretation": interpretation
    }


def compute_regional_atrophy(
    baseline_mask: np.ndarray,
    followup_mask: np.ndarray,
    spacing: Tuple[float, float, float],
    interval_days: int,
    segment_labels: Dict[str, str]
) -> Dict[str, Any]:
    """
    Compute atrophy for each segmented region.
    """
    voxel_volume_mm3 = float(np.prod(spacing))
    voxel_volume_ml = voxel_volume_mm3 / 1000

    baseline_labels = np.unique(baseline_mask[baseline_mask > 0])
    followup_labels = np.unique(followup_mask[followup_mask > 0])
    all_labels = set(baseline_labels) | set(followup_labels)

    regional_results = []

    for label in all_labels:
        label = int(label)
        label_name = segment_labels.get(str(label), f"Structure {label}")

        baseline_volume = np.sum(baseline_mask == label) * voxel_volume_ml
        followup_volume = np.sum(followup_mask == label) * voxel_volume_ml

        if baseline_volume > 0:
            atrophy = calculate_atrophy_rate(baseline_volume, followup_volume, interval_days)
            atrophy["segment_index"] = label
            atrophy["label"] = label_name
            regional_results.append(atrophy)

    # Sort by absolute rate (most significant first)
    regional_results.sort(key=lambda x: abs(x["annualized_rate_percent"]), reverse=True)

    # Summary
    pathological = [r for r in regional_results if r["interpretation"] == "pathological"]
    accelerated = [r for r in regional_results if r["interpretation"] == "accelerated"]

    return {
        "regional_atrophy": regional_results,
        "summary": {
            "regions_analyzed": len(regional_results),
            "pathological_count": len(pathological),
            "accelerated_count": len(accelerated),
            "interval_days": interval_days,
            "top_atrophy_regions": [r["label"] for r in pathological[:5]]
        }
    }


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/neuro-longitudinal")
async def neuro_longitudinal_endpoint(
    background_tasks: BackgroundTasks,
    baseline_mask_file: UploadFile = File(...),
    followup_mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Comprehensive longitudinal neuro analysis.

    Computes:
    - Lesion correspondence (new/enlarging/resolved)
    - Regional atrophy rates
    - Volume changes

    Parameters (in params JSON):
    - segment_labels: Mapping of segment index to label name
    - interval_days: Days between baseline and follow-up
    - baseline_date: Baseline study date (ISO format)
    - followup_date: Follow-up study date (ISO format)
    - overlap_threshold: Threshold for lesion matching (default: 0.3)
    - volume_change_threshold: Threshold for enlarging (default: 0.2)
    - compute_lesion_correspondence: Whether to compute lesion matching (default: true)
    - compute_atrophy: Whether to compute atrophy rates (default: true)
    """
    temp_baseline_path = None
    temp_followup_path = None

    try:
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        interval_days = params_dict.get("interval_days")
        baseline_date = params_dict.get("baseline_date")
        followup_date = params_dict.get("followup_date")
        overlap_threshold = params_dict.get("overlap_threshold", 0.3)
        volume_change_threshold = params_dict.get("volume_change_threshold", 0.2)
        compute_lesions = params_dict.get("compute_lesion_correspondence", True)
        compute_atrophy_flag = params_dict.get("compute_atrophy", True)
        spacing_override = params_dict.get("spacing", None)

        # Calculate interval from dates if not provided
        if not interval_days and baseline_date and followup_date:
            baseline_dt = datetime.fromisoformat(baseline_date.replace('Z', '+00:00'))
            followup_dt = datetime.fromisoformat(followup_date.replace('Z', '+00:00'))
            interval_days = (followup_dt - baseline_dt).days

        if not interval_days:
            interval_days = 365  # Default to 1 year

        # Save baseline mask
        temp_baseline_fd, temp_baseline_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_baseline_fd)
        with open(temp_baseline_path, "wb") as f:
            content = await baseline_mask_file.read()
            f.write(content)

        # Save follow-up mask
        temp_followup_fd, temp_followup_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_followup_fd)
        with open(temp_followup_path, "wb") as f:
            content = await followup_mask_file.read()
            f.write(content)

        # Load masks
        baseline_nii = nib.load(temp_baseline_path)
        baseline_data = baseline_nii.get_fdata().astype(np.int32)
        if baseline_data.ndim > 3:
            baseline_data = np.squeeze(baseline_data)

        followup_nii = nib.load(temp_followup_path)
        followup_data = followup_nii.get_fdata().astype(np.int32)
        if followup_data.ndim > 3:
            followup_data = np.squeeze(followup_data)

        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in baseline_nii.header.get_zooms()[:3])

        result = {
            "interval_days": interval_days,
            "spacing_mm": list(spacing)
        }

        # Lesion correspondence
        if compute_lesions:
            lesion_result = match_lesions(
                baseline_data,
                followup_data,
                spacing,
                overlap_threshold,
                volume_change_threshold=volume_change_threshold
            )
            result["lesion_correspondence"] = lesion_result

        # Regional atrophy
        if compute_atrophy_flag:
            atrophy_result = compute_regional_atrophy(
                baseline_data,
                followup_data,
                spacing,
                interval_days,
                segment_labels
            )
            result["atrophy_analysis"] = atrophy_result

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Longitudinal analysis failed")
        raise HTTPException(status_code=500, detail=f"Longitudinal analysis failed: {str(e)}")
    finally:
        if temp_baseline_path:
            background_tasks.add_task(remove_temp_file, temp_baseline_path)
        if temp_followup_path:
            background_tasks.add_task(remove_temp_file, temp_followup_path)


@router.post("/atrophy-rate")
async def atrophy_rate_endpoint(
    params: str = Form("{}")
):
    """
    Calculate atrophy rates from volume measurements.

    Simple calculation endpoint (no file upload needed).

    Parameters (in params JSON):
    - comparisons: List of {region, baseline_ml, current_ml, interval_days}
    """
    try:
        params_dict = json.loads(params)
        comparisons = params_dict.get("comparisons", [])

        if not comparisons:
            raise HTTPException(status_code=400, detail="No comparisons provided")

        results = []
        for comp in comparisons:
            region = comp.get("region", "Unknown")
            baseline_ml = comp.get("baseline_ml", 0)
            current_ml = comp.get("current_ml", 0)
            interval_days = comp.get("interval_days", 365)

            rate_result = calculate_atrophy_rate(baseline_ml, current_ml, interval_days)
            rate_result["region"] = region
            results.append(rate_result)

        # Summary
        pathological = [r for r in results if r["interpretation"] == "pathological"]
        max_atrophy = max(results, key=lambda x: abs(x["annualized_rate_percent"]))

        return {
            "atrophy_rates": results,
            "summary": {
                "regions_analyzed": len(results),
                "pathological_count": len(pathological),
                "max_atrophy_region": max_atrophy["region"] if results else None,
                "max_atrophy_rate": max_atrophy["annualized_rate_percent"] if results else 0
            }
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Atrophy rate calculation failed")
        raise HTTPException(status_code=500, detail=f"Atrophy rate calculation failed: {str(e)}")


@router.post("/top-changes")
async def top_changes_endpoint(
    background_tasks: BackgroundTasks,
    baseline_mask_file: UploadFile = File(...),
    followup_mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Get top changes between baseline and follow-up for highlight panel.

    Returns the most clinically significant changes for quick review.

    Parameters (in params JSON):
    - segment_labels: Mapping of segment index to label name
    - interval_days: Days between scans
    - top_n: Number of top changes to return (default: 5)
    """
    temp_baseline_path = None
    temp_followup_path = None

    try:
        params_dict = json.loads(params)
        segment_labels = params_dict.get("segment_labels", {})
        interval_days = params_dict.get("interval_days", 365)
        top_n = params_dict.get("top_n", 5)
        spacing_override = params_dict.get("spacing", None)

        # Save and load masks (same as above)
        temp_baseline_fd, temp_baseline_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_baseline_fd)
        with open(temp_baseline_path, "wb") as f:
            f.write(await baseline_mask_file.read())

        temp_followup_fd, temp_followup_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_followup_fd)
        with open(temp_followup_path, "wb") as f:
            f.write(await followup_mask_file.read())

        baseline_nii = nib.load(temp_baseline_path)
        baseline_data = baseline_nii.get_fdata().astype(np.int32)
        if baseline_data.ndim > 3:
            baseline_data = np.squeeze(baseline_data)

        followup_nii = nib.load(temp_followup_path)
        followup_data = followup_nii.get_fdata().astype(np.int32)
        if followup_data.ndim > 3:
            followup_data = np.squeeze(followup_data)

        if spacing_override:
            spacing = tuple(float(s) for s in spacing_override)
        else:
            spacing = tuple(float(s) for s in baseline_nii.header.get_zooms()[:3])

        # Compute regional atrophy
        atrophy_result = compute_regional_atrophy(
            baseline_data,
            followup_data,
            spacing,
            interval_days,
            segment_labels
        )

        # Get top changes by absolute rate
        all_changes = atrophy_result["regional_atrophy"]
        top_changes = all_changes[:top_n]

        # Categorize for display
        concerning = [c for c in top_changes if c["interpretation"] in ["pathological", "accelerated"]]
        improved = [c for c in top_changes if c["percent_change"] < -5]  # Volume increase (less atrophy)

        return {
            "top_changes": top_changes,
            "concerning_changes": concerning,
            "improvements": improved,
            "summary": {
                "total_regions": len(all_changes),
                "concerning_count": len(concerning),
                "interval_days": interval_days
            }
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Top changes computation failed")
        raise HTTPException(status_code=500, detail=f"Top changes computation failed: {str(e)}")
    finally:
        if temp_baseline_path:
            background_tasks.add_task(remove_temp_file, temp_baseline_path)
        if temp_followup_path:
            background_tasks.add_task(remove_temp_file, temp_followup_path)
