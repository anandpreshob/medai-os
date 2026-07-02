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
SUV (Standardized Uptake Value) computation endpoints for PET imaging.

Provides endpoints for computing SUV metrics from PET images:
- SUVmax: Maximum SUV in lesion
- SUVmean: Mean SUV in lesion
- SUVpeak: SUV in 1cm³ sphere around max voxel
- Metabolic Volume: Volume where SUV > threshold
- Total Lesion Glycolysis (TLG): SUVmean × Metabolic Volume

SUV Formula: SUV = (Tissue Activity [Bq/ml]) / (Injected Dose [Bq] / Body Weight [g])
"""

import json
import logging
import math
import os
import tempfile
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import nibabel as nib
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks
from pydantic import BaseModel
from scipy import ndimage

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/suv",
    tags=["SUV"],
    responses={
        404: {"description": "Not found"},
        200: {"description": "OK", "content": {"application/json": {}}},
    },
)


# ============================================================================
# Constants
# ============================================================================

# F-18 half-life in seconds (109.77 minutes)
F18_HALF_LIFE_SECONDS = 6586.2

# Default SUV threshold for metabolic volume calculation
DEFAULT_SUV_THRESHOLD = 2.5

# Sphere radius for SUVpeak (1 cm³ sphere has radius ~6.2mm)
# Volume = (4/3) * pi * r³ = 1000 mm³ → r = (3*1000/(4*pi))^(1/3) ≈ 6.2 mm
SUV_PEAK_SPHERE_RADIUS_MM = 6.2035


# ============================================================================
# Pydantic Models
# ============================================================================

class SUVMetrics(BaseModel):
    """SUV metrics for a single segment/lesion."""
    segment_label: str
    segment_index: int
    suv_max: float
    suv_mean: float
    suv_peak: float
    suv_min: float
    suv_std: float
    metabolic_volume_cm3: float
    total_lesion_glycolysis: float
    voxel_count: int
    volume_cm3: float
    max_location_ijk: Optional[List[int]] = None
    max_location_mm: Optional[List[float]] = None


class SUVComputationMetadata(BaseModel):
    """Metadata about the SUV computation."""
    normalization_method: str
    suv_threshold: float
    patient_weight_kg: float
    injected_dose_bq: float
    decay_factor: float
    decay_corrected: bool
    half_life_seconds: float
    sphere_radius_mm: float
    computation_time_seconds: float
    image_dimensions: List[int]
    voxel_spacing_mm: List[float]
    voxel_volume_mm3: float


class SUVComputationResult(BaseModel):
    """Complete SUV computation result."""
    segments: List[SUVMetrics]
    metadata: SUVComputationMetadata
    warnings: List[str] = []


# ============================================================================
# Utility Functions
# ============================================================================

def remove_temp_file(path: str):
    """Background task to remove temporary files."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.warning(f"Failed to remove temp file {path}: {e}")


def parse_dicom_time(time_str: str) -> float:
    """
    Parse DICOM time string to seconds since midnight.
    Supports formats: HHMMSS, HHMMSS.ffffff, HH:MM:SS, HH:MM:SS.ffffff
    """
    if not time_str:
        return 0.0

    time_str = time_str.strip()

    try:
        if ':' in time_str:
            # Format: HH:MM:SS or HH:MM:SS.ffffff
            parts = time_str.split(':')
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = float(parts[2]) if len(parts) > 2 else 0.0
        else:
            # Format: HHMMSS or HHMMSS.ffffff
            hours = int(time_str[:2])
            minutes = int(time_str[2:4])
            seconds = float(time_str[4:]) if len(time_str) > 4 else 0.0

        return hours * 3600 + minutes * 60 + seconds
    except (ValueError, IndexError) as e:
        logger.warning(f"Failed to parse DICOM time '{time_str}': {e}")
        return 0.0


def calculate_decay_factor(
    injection_time_seconds: float,
    scan_time_seconds: float,
    half_life_seconds: float
) -> float:
    """
    Calculate decay factor from injection time to scan time.
    DecayFactor = e^(-lambda * t) where lambda = ln(2) / halfLife
    """
    # Handle case where scan is on next day
    elapsed_seconds = scan_time_seconds - injection_time_seconds
    if elapsed_seconds < 0:
        elapsed_seconds += 86400  # Add 24 hours

    decay_constant = math.log(2) / half_life_seconds
    return math.exp(-decay_constant * elapsed_seconds)


def calculate_lean_body_mass(
    weight_kg: float,
    height_cm: float,
    sex: str
) -> float:
    """
    Calculate lean body mass using James formula.
    LBM (kg) for males: 1.1 * weight - 128 * (weight/height)²
    LBM (kg) for females: 1.07 * weight - 148 * (weight/height)²
    """
    if sex.upper() == 'M':
        return 1.1 * weight_kg - 128 * (weight_kg / height_cm) ** 2
    else:
        return 1.07 * weight_kg - 148 * (weight_kg / height_cm) ** 2


def calculate_body_surface_area(weight_kg: float, height_cm: float) -> float:
    """
    Calculate body surface area using Du Bois formula.
    BSA (m²) = 0.007184 * weight^0.425 * height^0.725
    """
    return 0.007184 * (weight_kg ** 0.425) * (height_cm ** 0.725)


def get_normalization_factor(
    method: str,
    weight_kg: float,
    height_cm: Optional[float] = None,
    sex: Optional[str] = None
) -> float:
    """
    Get normalization factor based on method.
    Returns the factor to divide injected dose by.
    """
    if method == 'bw':
        # Body weight in grams
        return weight_kg * 1000
    elif method == 'lbm':
        # Lean body mass in grams
        if height_cm and sex:
            return calculate_lean_body_mass(weight_kg, height_cm, sex) * 1000
        logger.warning("LBM calculation requires height and sex, falling back to body weight")
        return weight_kg * 1000
    elif method == 'bsa':
        # Body surface area in m²
        if height_cm:
            return calculate_body_surface_area(weight_kg, height_cm)
        logger.warning("BSA calculation requires height, falling back to body weight")
        return weight_kg * 1000
    else:
        return weight_kg * 1000


def create_sphere_mask(
    shape: Tuple[int, int, int],
    center: Tuple[int, int, int],
    radius_mm: float,
    spacing: Tuple[float, float, float]
) -> np.ndarray:
    """
    Create a spherical mask with given center and radius.
    """
    # Create coordinate grids
    z, y, x = np.ogrid[
        0:shape[0],
        0:shape[1],
        0:shape[2]
    ]

    # Convert to mm coordinates relative to center
    x_mm = (x - center[2]) * spacing[0]
    y_mm = (y - center[1]) * spacing[1]
    z_mm = (z - center[0]) * spacing[2]

    # Calculate distance from center
    dist_sq = x_mm**2 + y_mm**2 + z_mm**2

    # Create sphere mask
    return dist_sq <= radius_mm**2


def compute_suv_peak(
    suv_image: np.ndarray,
    max_location: Tuple[int, int, int],
    spacing: Tuple[float, float, float],
    radius_mm: float = SUV_PEAK_SPHERE_RADIUS_MM
) -> float:
    """
    Compute SUVpeak: mean SUV in 1cm³ sphere centered at max voxel.
    """
    # Create sphere mask
    sphere_mask = create_sphere_mask(
        suv_image.shape,
        max_location,
        radius_mm,
        spacing
    )

    # Get SUV values within sphere
    sphere_values = suv_image[sphere_mask]

    if len(sphere_values) == 0:
        return suv_image[max_location]

    return float(np.mean(sphere_values))


def compute_suv_metrics_for_segment(
    pet_data: np.ndarray,
    mask_data: np.ndarray,
    segment_index: int,
    segment_label: str,
    spacing: Tuple[float, float, float],
    suv_threshold: float,
    rescale_slope: float = 1.0,
    rescale_intercept: float = 0.0,
    injected_dose_bq: float = 1.0,
    normalization_factor: float = 1.0,
    decay_factor: float = 1.0
) -> Optional[SUVMetrics]:
    """
    Compute SUV metrics for a single segment.
    """
    # Get segment mask
    segment_mask = mask_data == segment_index
    voxel_count = int(np.sum(segment_mask))

    if voxel_count == 0:
        return None

    # Get PET values for segment
    pet_values = pet_data[segment_mask].astype(np.float64)

    # Convert to activity (Bq/ml) using rescale parameters
    activity_values = pet_values * rescale_slope + rescale_intercept

    # Convert to SUV
    # SUV = Activity (Bq/ml) / (Decay-corrected Dose (Bq) / Normalization Factor)
    corrected_dose = injected_dose_bq * decay_factor
    if corrected_dose > 0 and normalization_factor > 0:
        suv_values = activity_values / (corrected_dose / normalization_factor)
    else:
        suv_values = activity_values * 0  # Zero SUV if parameters invalid

    # Compute basic statistics
    suv_max = float(np.max(suv_values))
    suv_mean = float(np.mean(suv_values))
    suv_min = float(np.min(suv_values))
    suv_std = float(np.std(suv_values))

    # Find location of max SUV
    segment_coords = np.where(segment_mask)
    max_idx_in_segment = np.argmax(suv_values)
    max_location = (
        int(segment_coords[0][max_idx_in_segment]),
        int(segment_coords[1][max_idx_in_segment]),
        int(segment_coords[2][max_idx_in_segment])
    )

    # Compute SUVpeak (mean in 1cm³ sphere around max)
    # Create full SUV image for sphere calculation
    suv_image = np.zeros_like(pet_data, dtype=np.float64)
    suv_image[segment_mask] = suv_values
    suv_peak = compute_suv_peak(suv_image, max_location, spacing)

    # Compute metabolic volume (volume where SUV > threshold)
    metabolic_mask = suv_values > suv_threshold
    metabolic_voxel_count = int(np.sum(metabolic_mask))
    voxel_volume_mm3 = float(np.prod(spacing))
    metabolic_volume_mm3 = metabolic_voxel_count * voxel_volume_mm3
    metabolic_volume_cm3 = metabolic_volume_mm3 / 1000

    # Compute Total Lesion Glycolysis (TLG)
    # TLG = SUVmean of metabolic volume × Metabolic Volume
    if metabolic_voxel_count > 0:
        metabolic_suv_mean = float(np.mean(suv_values[metabolic_mask]))
        total_lesion_glycolysis = metabolic_suv_mean * metabolic_volume_cm3
    else:
        total_lesion_glycolysis = 0.0

    # Calculate total volume
    volume_mm3 = voxel_count * voxel_volume_mm3
    volume_cm3 = volume_mm3 / 1000

    # Convert max location to mm
    max_location_mm = [
        round(max_location[0] * spacing[2], 2),
        round(max_location[1] * spacing[1], 2),
        round(max_location[2] * spacing[0], 2)
    ]

    return SUVMetrics(
        segment_label=segment_label,
        segment_index=segment_index,
        suv_max=round(suv_max, 4),
        suv_mean=round(suv_mean, 4),
        suv_peak=round(suv_peak, 4),
        suv_min=round(suv_min, 4),
        suv_std=round(suv_std, 4),
        metabolic_volume_cm3=round(metabolic_volume_cm3, 4),
        total_lesion_glycolysis=round(total_lesion_glycolysis, 4),
        voxel_count=voxel_count,
        volume_cm3=round(volume_cm3, 4),
        max_location_ijk=list(max_location),
        max_location_mm=max_location_mm
    )


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/compute", response_model=SUVComputationResult)
async def compute_suv(
    background_tasks: BackgroundTasks,
    pet_file: UploadFile = File(..., description="PET image in NIfTI format"),
    mask_file: UploadFile = File(..., description="Segmentation mask in NIfTI format"),
    params: str = Form("{}", description="JSON parameters")
):
    """
    Compute SUV metrics for PET image with segmentation mask.

    Computes per-segment SUV metrics including:
    - SUVmax: Maximum SUV value in the segment
    - SUVmean: Mean SUV value in the segment
    - SUVpeak: Mean SUV in 1cm³ sphere around max voxel
    - Metabolic Volume: Volume where SUV > threshold (default 2.5)
    - TLG: Total Lesion Glycolysis = SUVmean × Metabolic Volume

    Parameters (via params JSON):
    - patient_weight_kg: Patient body weight in kg (required)
    - injected_dose_bq: Injected dose in Bq (required)
    - normalization_method: 'bw' (body weight), 'lbm' (lean body mass), 'bsa' (body surface area)
    - suv_threshold: Threshold for metabolic volume (default: 2.5)
    - half_life_seconds: Radionuclide half-life (default: F-18 = 6586.2s)
    - injection_time: Injection time string (HHMMSS or HH:MM:SS)
    - scan_time: Scan time string (HHMMSS or HH:MM:SS)
    - decay_corrected: Whether image is already decay corrected (default: True)
    - rescale_slope: DICOM rescale slope (default: 1.0)
    - rescale_intercept: DICOM rescale intercept (default: 0.0)
    - segment_labels: Dict mapping segment index to label name
    - patient_height_cm: Patient height in cm (for LBM/BSA)
    - patient_sex: Patient sex ('M' or 'F') (for LBM)
    """
    temp_pet_path = None
    temp_mask_path = None
    start_time = time.time()
    warnings = []

    try:
        # Parse parameters
        params_dict = json.loads(params)

        # Required parameters
        patient_weight_kg = params_dict.get("patient_weight_kg")
        injected_dose_bq = params_dict.get("injected_dose_bq")

        if not patient_weight_kg or patient_weight_kg <= 0:
            raise HTTPException(
                status_code=400,
                detail="patient_weight_kg is required and must be positive"
            )

        if not injected_dose_bq or injected_dose_bq <= 0:
            raise HTTPException(
                status_code=400,
                detail="injected_dose_bq is required and must be positive"
            )

        # Optional parameters with defaults
        normalization_method = params_dict.get("normalization_method", "bw")
        suv_threshold = params_dict.get("suv_threshold", DEFAULT_SUV_THRESHOLD)
        half_life_seconds = params_dict.get("half_life_seconds", F18_HALF_LIFE_SECONDS)
        injection_time = params_dict.get("injection_time")
        scan_time = params_dict.get("scan_time")
        decay_corrected = params_dict.get("decay_corrected", True)
        rescale_slope = params_dict.get("rescale_slope", 1.0)
        rescale_intercept = params_dict.get("rescale_intercept", 0.0)
        segment_labels = params_dict.get("segment_labels", {})
        patient_height_cm = params_dict.get("patient_height_cm")
        patient_sex = params_dict.get("patient_sex")

        # Calculate normalization factor
        normalization_factor = get_normalization_factor(
            normalization_method,
            patient_weight_kg,
            patient_height_cm,
            patient_sex
        )

        # Calculate decay factor
        decay_factor = 1.0
        if not decay_corrected and injection_time and scan_time:
            injection_seconds = parse_dicom_time(injection_time)
            scan_seconds = parse_dicom_time(scan_time)
            decay_factor = calculate_decay_factor(
                injection_seconds,
                scan_seconds,
                half_life_seconds
            )
            logger.info(f"Calculated decay factor: {decay_factor:.4f}")
        elif not decay_corrected:
            warnings.append(
                "Image is not decay-corrected but injection/scan times not provided. "
                "SUV values may be inaccurate."
            )

        # Save uploaded files to temp locations
        temp_pet_fd, temp_pet_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_pet_fd)
        with open(temp_pet_path, "wb") as f:
            content = await pet_file.read()
            f.write(content)

        temp_mask_fd, temp_mask_path = tempfile.mkstemp(suffix=".nii.gz")
        os.close(temp_mask_fd)
        with open(temp_mask_path, "wb") as f:
            content = await mask_file.read()
            f.write(content)

        # Load NIfTI files
        pet_nii = nib.load(temp_pet_path)
        mask_nii = nib.load(temp_mask_path)

        pet_data = pet_nii.get_fdata().astype(np.float64)
        mask_data = mask_nii.get_fdata().astype(np.int32)

        # Handle 4D volumes (squeeze if single timepoint)
        if pet_data.ndim == 4 and pet_data.shape[3] == 1:
            pet_data = pet_data[:, :, :, 0]
        if mask_data.ndim == 4 and mask_data.shape[3] == 1:
            mask_data = mask_data[:, :, :, 0]

        # Validate dimensions match
        if pet_data.shape != mask_data.shape:
            raise HTTPException(
                status_code=400,
                detail=f"PET and mask dimensions don't match: {pet_data.shape} vs {mask_data.shape}"
            )

        # Get spacing from NIfTI header
        spacing = tuple(float(s) for s in pet_nii.header.get_zooms()[:3])
        voxel_volume_mm3 = float(np.prod(spacing))

        # Get unique segment labels (excluding background = 0)
        unique_labels = np.unique(mask_data[mask_data > 0])

        # Compute SUV metrics for each segment
        segments: List[SUVMetrics] = []

        for label_idx in unique_labels:
            label_idx = int(label_idx)
            label_name = segment_labels.get(str(label_idx), f"Segment {label_idx}")

            metrics = compute_suv_metrics_for_segment(
                pet_data=pet_data,
                mask_data=mask_data,
                segment_index=label_idx,
                segment_label=label_name,
                spacing=spacing,
                suv_threshold=suv_threshold,
                rescale_slope=rescale_slope,
                rescale_intercept=rescale_intercept,
                injected_dose_bq=injected_dose_bq,
                normalization_factor=normalization_factor,
                decay_factor=decay_factor
            )

            if metrics:
                segments.append(metrics)

        computation_time = time.time() - start_time

        # Build result
        result = SUVComputationResult(
            segments=segments,
            metadata=SUVComputationMetadata(
                normalization_method=normalization_method,
                suv_threshold=suv_threshold,
                patient_weight_kg=patient_weight_kg,
                injected_dose_bq=injected_dose_bq,
                decay_factor=round(decay_factor, 6),
                decay_corrected=decay_corrected,
                half_life_seconds=half_life_seconds,
                sphere_radius_mm=SUV_PEAK_SPHERE_RADIUS_MM,
                computation_time_seconds=round(computation_time, 2),
                image_dimensions=list(pet_data.shape),
                voxel_spacing_mm=list(spacing),
                voxel_volume_mm3=round(voxel_volume_mm3, 6)
            ),
            warnings=warnings
        )

        logger.info(
            f"Computed SUV for {len(segments)} segments in {computation_time:.2f}s"
        )

        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid params JSON")
    except Exception as e:
        logger.exception("SUV computation failed")
        raise HTTPException(status_code=500, detail=f"SUV computation failed: {str(e)}")
    finally:
        # Schedule cleanup
        if temp_pet_path:
            background_tasks.add_task(remove_temp_file, temp_pet_path)
        if temp_mask_path:
            background_tasks.add_task(remove_temp_file, temp_mask_path)


@router.get("/info")
async def get_suv_info():
    """
    Get information about SUV computation capabilities and defaults.
    """
    return {
        "description": "SUV (Standardized Uptake Value) computation for PET imaging",
        "supported_normalization_methods": {
            "bw": "Body Weight - SUVbw = Activity / (Dose / Weight)",
            "lbm": "Lean Body Mass - SUVlbm (requires height and sex)",
            "bsa": "Body Surface Area - SUVbsa (requires height)"
        },
        "defaults": {
            "normalization_method": "bw",
            "suv_threshold": DEFAULT_SUV_THRESHOLD,
            "half_life_seconds": F18_HALF_LIFE_SECONDS,
            "sphere_radius_mm": SUV_PEAK_SPHERE_RADIUS_MM
        },
        "metrics_computed": [
            "suv_max - Maximum SUV in lesion",
            "suv_mean - Mean SUV in lesion",
            "suv_peak - Mean SUV in 1cm³ sphere around max",
            "suv_min - Minimum SUV in lesion",
            "suv_std - Standard deviation of SUV",
            "metabolic_volume_cm3 - Volume where SUV > threshold",
            "total_lesion_glycolysis - SUVmean × Metabolic Volume"
        ],
        "required_params": [
            "patient_weight_kg - Patient weight in kilograms",
            "injected_dose_bq - Injected radiotracer dose in Becquerels"
        ],
        "optional_params": [
            "normalization_method - 'bw', 'lbm', or 'bsa'",
            "suv_threshold - Threshold for metabolic volume",
            "half_life_seconds - Radionuclide half-life",
            "injection_time - Time of injection (HHMMSS)",
            "scan_time - Time of scan (HHMMSS)",
            "decay_corrected - Whether image is decay-corrected",
            "rescale_slope - DICOM rescale slope",
            "rescale_intercept - DICOM rescale intercept",
            "segment_labels - Dict of index to label name",
            "patient_height_cm - For LBM/BSA calculation",
            "patient_sex - 'M' or 'F' for LBM calculation"
        ]
    }
