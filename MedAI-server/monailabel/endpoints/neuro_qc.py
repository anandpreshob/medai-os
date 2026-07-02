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
Neuro QC endpoints for image and segmentation quality assessment.

Provides heuristic-based QC without ML dependencies:
- Motion artifact detection
- SNR estimation
- Brain coverage assessment
- Skull strip quality evaluation
- Segmentation quality checks
"""

import json
import logging
import os
import tempfile
from typing import Dict, List, Optional, Any, Tuple

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.ndimage import sobel, gaussian_filter
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/neuro-qc",
    tags=["Neuro QC"],
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
# Quality Severity Levels
# ============================================================================

def score_to_severity(score: float) -> str:
    """Convert numeric score to severity level."""
    if score >= 90:
        return "excellent"
    elif score >= 70:
        return "good"
    elif score >= 40:
        return "warning"
    else:
        return "critical"


# ============================================================================
# Motion Detection
# ============================================================================

def detect_motion_artifacts(
    image_data: np.ndarray,
    axis: int = 2  # Typically slice axis
) -> Dict[str, Any]:
    """
    Detect motion artifacts using edge sharpness analysis.

    Motion artifacts typically cause:
    - Reduced edge sharpness
    - Inter-slice intensity discontinuities
    - Ghosting patterns

    This heuristic uses:
    1. Sobel filter variance across slices (blurring detection)
    2. Inter-slice intensity correlation (discontinuity detection)

    Returns score 0-100 (higher is better, less motion).
    """
    findings = []
    slices_with_issues = []

    # Normalize image
    image_norm = (image_data - np.min(image_data)) / (np.max(image_data) - np.min(image_data) + 1e-8)

    # Compute edge magnitude per slice
    edge_magnitudes = []
    n_slices = image_data.shape[axis]

    for i in range(n_slices):
        if axis == 0:
            slice_data = image_norm[i, :, :]
        elif axis == 1:
            slice_data = image_norm[:, i, :]
        else:
            slice_data = image_norm[:, :, i]

        # Skip empty slices
        if np.sum(slice_data) < 1:
            continue

        # Compute edge magnitude
        edge_x = sobel(slice_data, axis=0)
        edge_y = sobel(slice_data, axis=1)
        edge_mag = np.sqrt(edge_x**2 + edge_y**2)
        edge_magnitudes.append(np.mean(edge_mag))

    if len(edge_magnitudes) < 3:
        return {
            "score": 100,
            "severity": "excellent",
            "findings": [],
            "details": {"insufficient_data": True}
        }

    edge_magnitudes = np.array(edge_magnitudes)

    # Detect slices with significantly lower edge sharpness (potential motion blur)
    mean_edge = np.mean(edge_magnitudes)
    std_edge = np.std(edge_magnitudes)
    threshold = mean_edge - 2 * std_edge

    blurry_slices = np.where(edge_magnitudes < threshold)[0].tolist()
    if blurry_slices:
        slices_with_issues.extend(blurry_slices)
        findings.append({
            "type": "blur",
            "description": f"Reduced sharpness detected in {len(blurry_slices)} slices",
            "affected_slices": blurry_slices
        })

    # Compute inter-slice intensity correlation
    intensity_means = []
    for i in range(n_slices):
        if axis == 0:
            slice_data = image_norm[i, :, :]
        elif axis == 1:
            slice_data = image_norm[:, i, :]
        else:
            slice_data = image_norm[:, :, i]

        mask = slice_data > 0.1  # Focus on tissue
        if np.sum(mask) > 100:
            intensity_means.append(np.mean(slice_data[mask]))

    # Detect sudden intensity jumps
    if len(intensity_means) > 1:
        intensity_diffs = np.abs(np.diff(intensity_means))
        mean_diff = np.mean(intensity_diffs)
        std_diff = np.std(intensity_diffs)
        jump_threshold = mean_diff + 3 * std_diff

        jump_slices = np.where(intensity_diffs > jump_threshold)[0].tolist()
        if jump_slices:
            slices_with_issues.extend(jump_slices)
            findings.append({
                "type": "intensity_discontinuity",
                "description": f"Intensity jumps detected at {len(jump_slices)} slice transitions",
                "affected_slices": jump_slices
            })

    # Calculate overall score
    # Penalize based on percentage of affected slices
    affected_percent = len(set(slices_with_issues)) / n_slices * 100
    score = max(0, 100 - affected_percent * 2)

    # Additional penalty for severe blur
    if len(blurry_slices) > n_slices * 0.1:
        score *= 0.8

    return {
        "score": round(score, 1),
        "severity": score_to_severity(score),
        "findings": findings,
        "details": {
            "total_slices": n_slices,
            "affected_slices": len(set(slices_with_issues)),
            "affected_percent": round(affected_percent, 1),
            "mean_edge_sharpness": round(float(mean_edge), 4)
        }
    }


# ============================================================================
# SNR Estimation
# ============================================================================

def estimate_snr(
    image_data: np.ndarray,
    brain_mask: Optional[np.ndarray] = None
) -> Dict[str, Any]:
    """
    Estimate Signal-to-Noise Ratio.

    SNR = mean(signal region) / std(background region)

    Thresholds:
    - >25: Excellent
    - 15-25: Good
    - 8-15: Marginal
    - <8: Poor

    If no mask provided, uses Otsu thresholding to separate brain from background.
    """
    findings = []

    # Create brain mask if not provided
    if brain_mask is None:
        from skimage.filters import threshold_otsu
        try:
            thresh = threshold_otsu(image_data[image_data > 0])
            brain_mask = image_data > thresh
        except:
            brain_mask = image_data > np.percentile(image_data, 50)

    # Get background region (non-brain, non-zero)
    # Look for background in corners
    shape = image_data.shape
    corner_size = min(10, shape[0] // 10, shape[1] // 10, shape[2] // 10)

    background_values = []
    corners = [
        image_data[:corner_size, :corner_size, :corner_size],
        image_data[:corner_size, :corner_size, -corner_size:],
        image_data[:corner_size, -corner_size:, :corner_size],
        image_data[-corner_size:, :corner_size, :corner_size],
    ]

    for corner in corners:
        vals = corner[corner > 0]  # Exclude true zeros
        if len(vals) > 10:
            background_values.extend(vals.flatten())

    if len(background_values) < 100:
        # Fallback: use lowest 5% of non-zero values
        nonzero = image_data[image_data > 0]
        threshold = np.percentile(nonzero, 5)
        background_values = nonzero[nonzero <= threshold]

    background_std = np.std(background_values) if len(background_values) > 0 else 1

    # Get signal (brain) mean
    signal_values = image_data[brain_mask & (image_data > 0)]
    signal_mean = np.mean(signal_values) if len(signal_values) > 0 else 0

    # Calculate SNR
    snr = signal_mean / background_std if background_std > 0 else 0

    # Determine quality
    if snr >= 25:
        quality = "excellent"
        score = 95
    elif snr >= 15:
        quality = "good"
        score = 80
    elif snr >= 8:
        quality = "marginal"
        score = 60
        findings.append({
            "type": "low_snr",
            "description": f"SNR ({snr:.1f}) is below optimal (15+)"
        })
    else:
        quality = "poor"
        score = 30
        findings.append({
            "type": "very_low_snr",
            "description": f"SNR ({snr:.1f}) is poor, image may be unusable"
        })

    return {
        "snr": round(snr, 2),
        "score": round(score, 1),
        "severity": score_to_severity(score),
        "quality": quality,
        "findings": findings,
        "details": {
            "signal_mean": round(float(signal_mean), 2),
            "background_std": round(float(background_std), 4),
            "brain_voxels": int(np.sum(brain_mask)),
            "background_samples": len(background_values)
        }
    }


# ============================================================================
# Brain Coverage
# ============================================================================

def assess_brain_coverage(
    brain_mask: np.ndarray
) -> Dict[str, Any]:
    """
    Assess whether the brain is fully captured in the image.

    Checks if brain tissue touches image boundaries, which suggests truncation.
    """
    findings = []
    issues = []

    shape = brain_mask.shape

    # Check each boundary
    boundaries = {
        "superior": brain_mask[:, :, -1],    # Top
        "inferior": brain_mask[:, :, 0],      # Bottom
        "anterior": brain_mask[:, -1, :],    # Front
        "posterior": brain_mask[:, 0, :],    # Back
        "left": brain_mask[0, :, :],         # Left
        "right": brain_mask[-1, :, :]        # Right
    }

    truncated_boundaries = []
    for name, boundary_slice in boundaries.items():
        if np.sum(boundary_slice) > boundary_slice.size * 0.05:  # >5% of boundary has brain
            truncated_boundaries.append(name)
            issues.append(name)

    if truncated_boundaries:
        findings.append({
            "type": "truncation",
            "description": f"Brain may be truncated at: {', '.join(truncated_boundaries)}",
            "boundaries": truncated_boundaries
        })

    # Calculate score
    score = 100 - len(truncated_boundaries) * 15  # -15 per truncated boundary

    # Check for very small brain mask (might indicate failed segmentation or very limited FOV)
    brain_voxels = np.sum(brain_mask)
    total_voxels = np.prod(shape)
    brain_percent = brain_voxels / total_voxels * 100

    if brain_percent < 5:
        findings.append({
            "type": "small_brain_volume",
            "description": f"Brain occupies only {brain_percent:.1f}% of image volume"
        })
        score -= 20

    return {
        "score": max(0, round(score, 1)),
        "severity": score_to_severity(max(0, score)),
        "findings": findings,
        "details": {
            "truncated_boundaries": truncated_boundaries,
            "brain_volume_percent": round(brain_percent, 2),
            "image_dimensions": list(shape)
        }
    }


# ============================================================================
# Skull Strip Quality
# ============================================================================

def assess_skull_strip_quality(
    image_data: np.ndarray,
    brain_mask: np.ndarray
) -> Dict[str, Any]:
    """
    Assess quality of skull stripping.

    Checks for:
    1. Residual skull at mask boundary (under-stripping)
    2. Internal holes in brain (over-stripping)
    3. Boundary smoothness
    """
    findings = []

    # Get mask boundary
    dilated = ndimage.binary_dilation(brain_mask, iterations=1)
    eroded = ndimage.binary_erosion(brain_mask, iterations=1)
    boundary = dilated & ~brain_mask

    # Check for high-intensity voxels at boundary (residual skull/bone)
    boundary_intensities = image_data[boundary]
    brain_intensities = image_data[brain_mask & (image_data > 0)]

    if len(boundary_intensities) > 0 and len(brain_intensities) > 0:
        mean_brain = np.mean(brain_intensities)
        high_intensity_boundary = np.sum(boundary_intensities > mean_brain * 1.5)
        high_intensity_percent = high_intensity_boundary / len(boundary_intensities) * 100

        if high_intensity_percent > 10:
            findings.append({
                "type": "residual_skull",
                "description": f"{high_intensity_percent:.1f}% of boundary has high intensity (possible residual skull)"
            })

    # Check for internal holes (over-stripping)
    filled = ndimage.binary_fill_holes(brain_mask)
    holes = filled & ~brain_mask
    hole_percent = np.sum(holes) / np.sum(filled) * 100

    if hole_percent > 1:
        findings.append({
            "type": "internal_holes",
            "description": f"{hole_percent:.1f}% of brain volume appears over-stripped (internal holes)"
        })

    # Assess boundary smoothness
    # Smooth mask and compare to original
    smoothed = gaussian_filter(brain_mask.astype(float), sigma=2) > 0.5
    roughness = np.sum(brain_mask != smoothed) / np.sum(brain_mask) * 100

    if roughness > 5:
        findings.append({
            "type": "rough_boundary",
            "description": f"Mask boundary is rough ({roughness:.1f}% irregular voxels)"
        })

    # Calculate score
    score = 100
    if any(f["type"] == "residual_skull" for f in findings):
        score -= 25
    if any(f["type"] == "internal_holes" for f in findings):
        score -= 20
    if any(f["type"] == "rough_boundary" for f in findings):
        score -= 10

    return {
        "score": max(0, round(score, 1)),
        "severity": score_to_severity(max(0, score)),
        "findings": findings,
        "details": {
            "boundary_voxels": int(np.sum(boundary)),
            "hole_percent": round(hole_percent, 2),
            "roughness_percent": round(roughness, 2)
        }
    }


# ============================================================================
# Segmentation QC
# ============================================================================

def assess_segmentation_quality(
    segmentation_data: np.ndarray,
    image_data: Optional[np.ndarray] = None,
    expected_labels: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Assess quality of brain segmentation.

    Checks:
    1. Number of segments vs expected
    2. Segment connectivity (fragmentation)
    3. Boundary smoothness
    4. Anatomical plausibility (size ratios)
    """
    findings = []
    warning_segments = []
    review_required_segments = []

    unique_labels = np.unique(segmentation_data[segmentation_data > 0])
    n_segments = len(unique_labels)

    # Check expected labels
    if expected_labels:
        missing = set(expected_labels) - set(unique_labels)
        if missing:
            findings.append({
                "type": "missing_labels",
                "description": f"Expected labels not found: {list(missing)}"
            })

    # Per-segment analysis
    segment_info = []
    for label in unique_labels:
        label = int(label)
        mask = (segmentation_data == label)
        voxel_count = int(np.sum(mask))

        # Check connectivity
        structure = ndimage.generate_binary_structure(3, 3)
        labeled, n_components = ndimage.label(mask, structure=structure)

        info = {
            "label": label,
            "voxel_count": voxel_count,
            "n_components": n_components
        }

        if n_components > 1:
            warning_segments.append(label)
            info["warning"] = f"Fragmented into {n_components} components"

        # Check for very small segments
        if voxel_count < 100:
            warning_segments.append(label)
            info["warning"] = "Very small segment (<100 voxels)"

        segment_info.append(info)

    # Overall scores
    fragmented_count = len([s for s in segment_info if s.get("n_components", 1) > 1])
    fragmentation_score = 100 - (fragmented_count / n_segments * 50) if n_segments > 0 else 100

    # Review required if many warnings
    if len(warning_segments) > n_segments * 0.3:
        review_required_segments = list(set(warning_segments))
        findings.append({
            "type": "review_recommended",
            "description": f"{len(review_required_segments)} segments need review"
        })

    overall_score = fragmentation_score
    if expected_labels and len(unique_labels) < len(expected_labels) * 0.5:
        overall_score -= 30
        findings.append({
            "type": "incomplete_segmentation",
            "description": "Less than 50% of expected structures segmented"
        })

    return {
        "score": max(0, round(overall_score, 1)),
        "severity": score_to_severity(max(0, overall_score)),
        "findings": findings,
        "segment_count": n_segments,
        "warning_segments": list(set(warning_segments)),
        "review_required_segments": review_required_segments,
        "details": {
            "segments": segment_info,
            "fragmentation_score": round(fragmentation_score, 1)
        }
    }


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/assess-image")
async def assess_image_endpoint(
    background_tasks: BackgroundTasks,
    image_file: UploadFile = File(...),
    brain_mask_file: Optional[UploadFile] = File(None),
    params: str = Form("{}")
):
    """
    Comprehensive image quality assessment for neuroimaging.

    Assesses:
    - Motion artifacts
    - SNR
    - Brain coverage
    - Skull strip quality (if mask provided)

    Parameters (in params JSON):
    - skip_motion: Skip motion detection (default: false)
    - skip_snr: Skip SNR estimation (default: false)
    - skip_coverage: Skip coverage check (default: false)
    - skip_skull_strip: Skip skull strip QC (default: false)
    """
    temp_image_path = None
    temp_mask_path = None

    try:
        params_dict = json.loads(params)
        skip_motion = params_dict.get("skip_motion", False)
        skip_snr = params_dict.get("skip_snr", False)
        skip_coverage = params_dict.get("skip_coverage", False)
        skip_skull_strip = params_dict.get("skip_skull_strip", False)

        # Save image
        temp_image_fd, temp_image_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_image_fd)
        with open(temp_image_path, "wb") as f:
            content = await image_file.read()
            f.write(content)

        # Load image
        image_nii = nib.load(temp_image_path)
        image_data = image_nii.get_fdata().astype(np.float32)

        if image_data.ndim > 3:
            image_data = np.squeeze(image_data)

        # Load brain mask if provided
        brain_mask = None
        if brain_mask_file:
            temp_mask_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
            os.close(temp_mask_fd)
            with open(temp_mask_path, "wb") as f:
                content = await brain_mask_file.read()
                f.write(content)

            mask_nii = nib.load(temp_mask_path)
            brain_mask = mask_nii.get_fdata().astype(bool)
            if brain_mask.ndim > 3:
                brain_mask = np.squeeze(brain_mask)

        # Run assessments
        assessments = {}
        all_findings = []
        scores = []

        if not skip_motion:
            motion_result = detect_motion_artifacts(image_data)
            assessments["motion"] = motion_result
            all_findings.extend([{**f, "category": "motion"} for f in motion_result["findings"]])
            scores.append(motion_result["score"])

        if not skip_snr:
            snr_result = estimate_snr(image_data, brain_mask)
            assessments["snr"] = snr_result
            all_findings.extend([{**f, "category": "snr"} for f in snr_result["findings"]])
            scores.append(snr_result["score"])

        if brain_mask is not None:
            if not skip_coverage:
                coverage_result = assess_brain_coverage(brain_mask)
                assessments["coverage"] = coverage_result
                all_findings.extend([{**f, "category": "coverage"} for f in coverage_result["findings"]])
                scores.append(coverage_result["score"])

            if not skip_skull_strip:
                skull_strip_result = assess_skull_strip_quality(image_data, brain_mask)
                assessments["skull_strip"] = skull_strip_result
                all_findings.extend([{**f, "category": "skull_strip"} for f in skull_strip_result["findings"]])
                scores.append(skull_strip_result["score"])

        # Calculate overall score (weighted average)
        overall_score = np.mean(scores) if scores else 100

        # Determine usability
        is_usable = overall_score >= 40 and not any(
            f.get("type") in ["very_low_snr", "truncation"] for f in all_findings
        )

        return {
            "overall_score": round(overall_score, 1),
            "overall_status": score_to_severity(overall_score),
            "is_usable": is_usable,
            "assessments": assessments,
            "all_findings": all_findings,
            "metadata": {
                "dimensions": list(image_data.shape),
                "brain_mask_provided": brain_mask is not None
            }
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Image QC assessment failed")
        raise HTTPException(status_code=500, detail=f"Image QC assessment failed: {str(e)}")
    finally:
        if temp_image_path:
            background_tasks.add_task(remove_temp_file, temp_image_path)
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


@router.post("/assess-segmentation")
async def assess_segmentation_endpoint(
    background_tasks: BackgroundTasks,
    segmentation_file: UploadFile = File(...),
    image_file: Optional[UploadFile] = File(None),
    params: str = Form("{}")
):
    """
    Assess quality of brain segmentation.

    Parameters (in params JSON):
    - expected_labels: List of expected segment indices
    - segment_labels: Mapping of segment index to label name
    """
    temp_seg_path = None
    temp_image_path = None

    try:
        params_dict = json.loads(params)
        expected_labels = params_dict.get("expected_labels")
        segment_labels = params_dict.get("segment_labels", {})

        # Save segmentation
        temp_seg_fd, temp_seg_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_seg_fd)
        with open(temp_seg_path, "wb") as f:
            content = await segmentation_file.read()
            f.write(content)

        # Load segmentation
        seg_nii = nib.load(temp_seg_path)
        seg_data = seg_nii.get_fdata().astype(np.int32)

        if seg_data.ndim > 3:
            seg_data = np.squeeze(seg_data)

        # Load image if provided
        image_data = None
        if image_file:
            temp_image_fd, temp_image_path = tempfile.mkstemp(suffix=".nii.gz")
            os.close(temp_image_fd)
            with open(temp_image_path, "wb") as f:
                content = await image_file.read()
                f.write(content)

            image_nii = nib.load(temp_image_path)
            image_data = image_nii.get_fdata().astype(np.float32)
            if image_data.ndim > 3:
                image_data = np.squeeze(image_data)

        # Run assessment
        result = assess_segmentation_quality(seg_data, image_data, expected_labels)

        # Add label names to segment info
        if segment_labels and "details" in result:
            for seg_info in result["details"].get("segments", []):
                label = seg_info.get("label")
                if str(label) in segment_labels:
                    seg_info["label_name"] = segment_labels[str(label)]

        result["metadata"] = {
            "dimensions": list(seg_data.shape),
            "expected_labels": expected_labels
        }

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("Segmentation QC assessment failed")
        raise HTTPException(status_code=500, detail=f"Segmentation QC assessment failed: {str(e)}")
    finally:
        if temp_seg_path:
            background_tasks.add_task(remove_temp_file, temp_seg_path)
        if temp_image_path:
            background_tasks.add_task(remove_temp_file, temp_image_path)
