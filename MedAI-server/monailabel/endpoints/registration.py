"""
Registration Endpoints

FastAPI endpoints for image registration and segmentation propagation.
Supports rigid (6-DOF) and affine (12-DOF) registration using SimpleITK.
"""

import json
import logging
import os
import shutil
import tempfile
import secrets
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, Depends
from fastapi.responses import Response

from monailabel.config import RBAC_USER, settings
from monailabel.endpoints.user.auth import RBAC, User
from monailabel.interfaces.app import MONAILabelApp
from monailabel.interfaces.utils.app import app_instance
from monailabel.utils.others.generic import remove_file
from monailabel.utils.others.stream import stream_multipart

try:
    from monailabel.utils.registration import (
        load_image,
        rigid_registration,
        affine_registration,
        resample_mask_with_inverse,
        RegistrationResult,
        identity_matrix,
        check_sitk_available,
    )
    import SimpleITK as sitk
    REGISTRATION_AVAILABLE = True
except ImportError:
    REGISTRATION_AVAILABLE = False
    sitk = None

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/registration",
    tags=["Registration"],
    responses={
        404: {"description": "Not found"},
        503: {"description": "Registration not available"},
    },
)


def get_image_path(image_id: str) -> Optional[str]:
    """Get the file path for an image ID from the datastore."""
    try:
        instance: MONAILabelApp = app_instance()
        return instance.datastore().get_image_uri(image_id)
    except Exception as e:
        logger.warning(f"Could not get image path for {image_id}: {e}")
        return None


def ensure_registration_available():
    """Raise HTTP 503 if registration is not available."""
    if not REGISTRATION_AVAILABLE or not check_sitk_available():
        raise HTTPException(
            status_code=503,
            detail="Image registration is not available. Please install SimpleITK."
        )


@router.get("/status")
async def registration_status():
    """Check if registration functionality is available."""
    return {
        "available": REGISTRATION_AVAILABLE and check_sitk_available(),
        "sitk_version": sitk.Version.VersionString() if sitk else None,
    }


@router.post("/rigid", summary=f"{RBAC_USER}Perform rigid (6-DOF) registration")
async def api_rigid_registration(
    background_tasks: BackgroundTasks,
    fixed_image_id: str = Form(...),
    moving_image_id: str = Form(...),
    initial_transform: str = Form(None),
    fixed_file: UploadFile = File(None),
    moving_file: UploadFile = File(None),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
):
    """
    Perform rigid (6-DOF) registration between two images.

    Rigid registration includes rotation and translation only,
    preserving distances and angles.

    Args:
        fixed_image_id: ID of the fixed/reference image (or empty if file provided)
        moving_image_id: ID of the moving image to be registered
        initial_transform: Optional JSON string of 4x4 initial transform matrix
        fixed_file: Optional fixed image file upload
        moving_file: Optional moving image file upload

    Returns:
        Registration result with 4x4 transformation matrix
    """
    ensure_registration_available()

    # Get image paths
    fixed_path = None
    moving_path = None
    temp_files = []

    try:
        # Handle file uploads
        if fixed_file:
            fixed_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(fixed_path, "wb") as f:
                shutil.copyfileobj(fixed_file.file, f)
            temp_files.append(fixed_path)
        else:
            fixed_path = get_image_path(fixed_image_id)

        if moving_file:
            moving_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(moving_path, "wb") as f:
                shutil.copyfileobj(moving_file.file, f)
            temp_files.append(moving_path)
        else:
            moving_path = get_image_path(moving_image_id)

        if not fixed_path or not os.path.exists(fixed_path):
            raise HTTPException(status_code=404, detail=f"Fixed image not found: {fixed_image_id}")

        if not moving_path or not os.path.exists(moving_path):
            raise HTTPException(status_code=404, detail=f"Moving image not found: {moving_image_id}")

        # Parse initial transform
        init_transform = None
        if initial_transform:
            try:
                init_transform = json.loads(initial_transform)
            except json.JSONDecodeError:
                logger.warning("Invalid initial_transform JSON, ignoring")

        # Load images
        logger.info(f"Loading fixed image: {fixed_path}")
        fixed_image = load_image(fixed_path)
        if fixed_image is None:
            raise HTTPException(status_code=500, detail="Failed to load fixed image")

        logger.info(f"Loading moving image: {moving_path}")
        moving_image = load_image(moving_path)
        if moving_image is None:
            raise HTTPException(status_code=500, detail="Failed to load moving image")

        # Perform registration
        logger.info("Starting rigid registration...")
        result = rigid_registration(
            fixed_image,
            moving_image,
            initial_transform=init_transform,
        )

        # Schedule cleanup
        for temp_file in temp_files:
            background_tasks.add_task(remove_file, temp_file)

        return result.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rigid registration failed: {e}")
        # Cleanup on error
        for temp_file in temp_files:
            try:
                os.remove(temp_file)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/affine", summary=f"{RBAC_USER}Perform affine (12-DOF) registration")
async def api_affine_registration(
    background_tasks: BackgroundTasks,
    fixed_image_id: str = Form(...),
    moving_image_id: str = Form(...),
    initial_transform: str = Form(None),
    fixed_file: UploadFile = File(None),
    moving_file: UploadFile = File(None),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
):
    """
    Perform affine (12-DOF) registration between two images.

    Affine registration includes rotation, translation, scaling, and shearing.

    Args:
        fixed_image_id: ID of the fixed/reference image
        moving_image_id: ID of the moving image to be registered
        initial_transform: Optional JSON string of 4x4 initial transform matrix
        fixed_file: Optional fixed image file upload
        moving_file: Optional moving image file upload

    Returns:
        Registration result with 4x4 transformation matrix
    """
    ensure_registration_available()

    # Get image paths
    fixed_path = None
    moving_path = None
    temp_files = []

    try:
        # Handle file uploads
        if fixed_file:
            fixed_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(fixed_path, "wb") as f:
                shutil.copyfileobj(fixed_file.file, f)
            temp_files.append(fixed_path)
        else:
            fixed_path = get_image_path(fixed_image_id)

        if moving_file:
            moving_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(moving_path, "wb") as f:
                shutil.copyfileobj(moving_file.file, f)
            temp_files.append(moving_path)
        else:
            moving_path = get_image_path(moving_image_id)

        if not fixed_path or not os.path.exists(fixed_path):
            raise HTTPException(status_code=404, detail=f"Fixed image not found: {fixed_image_id}")

        if not moving_path or not os.path.exists(moving_path):
            raise HTTPException(status_code=404, detail=f"Moving image not found: {moving_image_id}")

        # Parse initial transform
        init_transform = None
        if initial_transform:
            try:
                init_transform = json.loads(initial_transform)
            except json.JSONDecodeError:
                logger.warning("Invalid initial_transform JSON, ignoring")

        # Load images
        logger.info(f"Loading fixed image: {fixed_path}")
        fixed_image = load_image(fixed_path)
        if fixed_image is None:
            raise HTTPException(status_code=500, detail="Failed to load fixed image")

        logger.info(f"Loading moving image: {moving_path}")
        moving_image = load_image(moving_path)
        if moving_image is None:
            raise HTTPException(status_code=500, detail="Failed to load moving image")

        # Perform registration
        logger.info("Starting affine registration...")
        result = affine_registration(
            fixed_image,
            moving_image,
            initial_transform=init_transform,
        )

        # Schedule cleanup
        for temp_file in temp_files:
            background_tasks.add_task(remove_file, temp_file)

        return result.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Affine registration failed: {e}")
        # Cleanup on error
        for temp_file in temp_files:
            try:
                os.remove(temp_file)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resample-mask", summary=f"{RBAC_USER}Resample/propagate segmentation mask")
async def api_resample_mask(
    background_tasks: BackgroundTasks,
    source_mask_id: str = Form(None),
    source_image_id: str = Form(None),
    target_image_id: str = Form(...),
    transform_matrix: str = Form(...),
    interpolation: str = Form("nearest"),
    source_mask_file: UploadFile = File(None),
    source_image_file: UploadFile = File(None),
    target_image_file: UploadFile = File(None),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
):
    """
    Resample/propagate a segmentation mask to a different image space.

    Args:
        source_mask_id: ID of the source segmentation mask
        source_image_id: ID of the source reference image
        target_image_id: ID of the target reference image
        transform_matrix: JSON string of 4x4 transformation matrix
        interpolation: 'nearest' for labels, 'linear' for soft masks
        source_mask_file: Optional mask file upload
        source_image_file: Optional source image file upload
        target_image_file: Optional target image file upload

    Returns:
        Multipart response with resampled mask and metadata
    """
    ensure_registration_available()

    temp_files = []

    try:
        # Parse transform matrix
        try:
            transform = json.loads(transform_matrix)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid transform_matrix JSON")

        # Get or create file paths
        mask_path = None
        source_path = None
        target_path = None

        # Handle file uploads for mask
        if source_mask_file:
            mask_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(mask_path, "wb") as f:
                shutil.copyfileobj(source_mask_file.file, f)
            temp_files.append(mask_path)
        elif source_mask_id:
            # Try to get from datastore
            mask_path = get_image_path(source_mask_id)

        # Handle source image
        if source_image_file:
            source_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(source_path, "wb") as f:
                shutil.copyfileobj(source_image_file.file, f)
            temp_files.append(source_path)
        elif source_image_id:
            source_path = get_image_path(source_image_id)

        # Handle target image
        if target_image_file:
            target_path = tempfile.NamedTemporaryFile(
                suffix=".nii.gz", delete=False
            ).name
            with open(target_path, "wb") as f:
                shutil.copyfileobj(target_image_file.file, f)
            temp_files.append(target_path)
        else:
            target_path = get_image_path(target_image_id)

        if not mask_path or not os.path.exists(mask_path):
            raise HTTPException(status_code=404, detail="Source mask not found")

        if not target_path or not os.path.exists(target_path):
            raise HTTPException(status_code=404, detail="Target image not found")

        # Load images
        mask_image = load_image(mask_path)
        if mask_image is None:
            raise HTTPException(status_code=500, detail="Failed to load mask")

        # Cast mask back to integer type for label preservation
        mask_image = sitk.Cast(mask_image, sitk.sitkUInt16)

        target_image = load_image(target_path)
        if target_image is None:
            raise HTTPException(status_code=500, detail="Failed to load target image")

        # Source image is optional (only needed for certain transform modes)
        source_image = None
        if source_path and os.path.exists(source_path):
            source_image = load_image(source_path)

        # Perform resampling
        logger.info("Resampling mask to target space...")
        resampled_mask = resample_mask_with_inverse(
            mask_image,
            source_image if source_image else mask_image,  # Use mask as source if no source image
            target_image,
            transform,
            interpolation=interpolation,
        )

        # Save resampled mask to temp file
        output_path = tempfile.NamedTemporaryFile(
            suffix=".nii.gz", delete=False
        ).name
        sitk.WriteImage(resampled_mask, output_path)
        temp_files.append(output_path)

        # Calculate segment statistics
        resampled_array = sitk.GetArrayFromImage(resampled_mask)
        unique_labels = [int(l) for l in set(resampled_array.flatten()) if l > 0]

        spacing = resampled_mask.GetSpacing()
        voxel_volume = spacing[0] * spacing[1] * spacing[2]

        segments = []
        for label in unique_labels:
            voxel_count = int((resampled_array == label).sum())
            volume_mm3 = voxel_count * voxel_volume
            segments.append({
                "index": label,
                "label": f"Segment {label}",
                "volume_mm3": volume_mm3,
            })

        # Prepare multipart response
        metadata = {
            "success": True,
            "segments": segments,
            "target_dimensions": list(target_image.GetSize()),
            "target_spacing": list(target_image.GetSpacing()),
        }

        # Read output file
        with open(output_path, "rb") as f:
            mask_data = f.read()

        # Schedule cleanup
        for temp_file in temp_files:
            background_tasks.add_task(remove_file, temp_file)

        # Return multipart response
        return stream_multipart(json.dumps(metadata), mask_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mask resampling failed: {e}")
        # Cleanup on error
        for temp_file in temp_files:
            try:
                os.remove(temp_file)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-compatibility", summary=f"{RBAC_USER}Check registration compatibility")
async def api_check_compatibility(
    source_image_id: str = Form(...),
    target_image_id: str = Form(...),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
):
    """
    Check if two images are compatible for registration.

    Checks spacing ratios and modality compatibility.
    """
    ensure_registration_available()

    try:
        source_path = get_image_path(source_image_id)
        target_path = get_image_path(target_image_id)

        if not source_path or not os.path.exists(source_path):
            return {
                "compatible": False,
                "reason": f"Source image not found: {source_image_id}",
            }

        if not target_path or not os.path.exists(target_path):
            return {
                "compatible": False,
                "reason": f"Target image not found: {target_image_id}",
            }

        source_image = load_image(source_path)
        target_image = load_image(target_path)

        if source_image is None or target_image is None:
            return {
                "compatible": False,
                "reason": "Failed to load images",
            }

        source_spacing = source_image.GetSpacing()
        target_spacing = target_image.GetSpacing()

        # Calculate spacing ratios
        spacing_ratio = [
            source_spacing[i] / target_spacing[i]
            for i in range(3)
        ]

        # Check if spacing ratios are reasonable (within 10x)
        max_ratio = max(max(spacing_ratio), max(1/r for r in spacing_ratio))
        compatible = max_ratio < 10

        reason = None
        if not compatible:
            reason = f"Spacing ratio too large: {max_ratio:.2f}x"

        return {
            "compatible": compatible,
            "reason": reason,
            "source_spacing": list(source_spacing),
            "target_spacing": list(target_spacing),
            "spacing_ratio": spacing_ratio,
        }

    except Exception as e:
        logger.error(f"Compatibility check failed: {e}")
        return {
            "compatible": False,
            "reason": str(e),
        }
