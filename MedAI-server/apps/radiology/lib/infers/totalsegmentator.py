# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
import gc
import logging
import os
import tempfile
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

import nibabel as nib
import numpy as np
import torch

from monailabel.interfaces.tasks.infer_v2 import InferTask, InferType

logger = logging.getLogger(__name__)


class TotalSegmentator(InferTask):
    """
    TotalSegmentator for comprehensive 3D organ segmentation.
    Supports both CT (117 structures) and MR (56 structures) modalities.
    """

    # CT Labels (117 structures) - using TotalSegmentator v2 official labels
    CT_LABELS = {
        "spleen": 1,
        "kidney_right": 2,
        "kidney_left": 3,
        "gallbladder": 4,
        "liver": 5,
        "stomach": 6,
        "pancreas": 7,
        "adrenal_gland_right": 8,
        "adrenal_gland_left": 9,
        "lung_upper_lobe_left": 10,
        "lung_lower_lobe_left": 11,
        "lung_upper_lobe_right": 12,
        "lung_middle_lobe_right": 13,
        "lung_lower_lobe_right": 14,
        "esophagus": 15,
        "trachea": 16,
        "thyroid_gland": 17,
        "small_bowel": 18,
        "duodenum": 19,
        "colon": 20,
        "urinary_bladder": 21,
        "prostate": 22,
        "kidney_cyst_left": 23,
        "kidney_cyst_right": 24,
        "aorta": 25,
        "inferior_vena_cava": 26,
        "portal_vein_and_splenic_vein": 27,
        "iliac_artery_left": 28,
        "iliac_artery_right": 29,
        "iliac_vena_left": 30,
        "iliac_vena_right": 31,
        "heart_myocardium": 32,
        "heart_atrium_left": 33,
        "heart_ventricle_left": 34,
        "heart_atrium_right": 35,
        "heart_ventricle_right": 36,
        "pulmonary_artery": 37,
        "brain": 38,
        "skull": 39,
        "spinal_cord": 40,
        "vertebrae_C1": 41,
        "vertebrae_C2": 42,
        "vertebrae_C3": 43,
        "vertebrae_C4": 44,
        "vertebrae_C5": 45,
        "vertebrae_C6": 46,
        "vertebrae_C7": 47,
        "vertebrae_T1": 48,
        "vertebrae_T2": 49,
        "vertebrae_T3": 50,
        "vertebrae_T4": 51,
        "vertebrae_T5": 52,
        "vertebrae_T6": 53,
        "vertebrae_T7": 54,
        "vertebrae_T8": 55,
        "vertebrae_T9": 56,
        "vertebrae_T10": 57,
        "vertebrae_T11": 58,
        "vertebrae_T12": 59,
        "vertebrae_L1": 60,
        "vertebrae_L2": 61,
        "vertebrae_L3": 62,
        "vertebrae_L4": 63,
        "vertebrae_L5": 64,
        "vertebrae_S1": 65,
        "rib_left_1": 66,
        "rib_left_2": 67,
        "rib_left_3": 68,
        "rib_left_4": 69,
        "rib_left_5": 70,
        "rib_left_6": 71,
        "rib_left_7": 72,
        "rib_left_8": 73,
        "rib_left_9": 74,
        "rib_left_10": 75,
        "rib_left_11": 76,
        "rib_left_12": 77,
        "rib_right_1": 78,
        "rib_right_2": 79,
        "rib_right_3": 80,
        "rib_right_4": 81,
        "rib_right_5": 82,
        "rib_right_6": 83,
        "rib_right_7": 84,
        "rib_right_8": 85,
        "rib_right_9": 86,
        "rib_right_10": 87,
        "rib_right_11": 88,
        "rib_right_12": 89,
        "sternum": 90,
        "costal_cartilages": 91,
        "humerus_left": 92,
        "humerus_right": 93,
        "scapula_left": 94,
        "scapula_right": 95,
        "clavicula_left": 96,
        "clavicula_right": 97,
        "femur_left": 98,
        "femur_right": 99,
        "hip_left": 100,
        "hip_right": 101,
        "sacrum": 102,
        "face": 103,
        "gluteus_maximus_left": 104,
        "gluteus_maximus_right": 105,
        "gluteus_medius_left": 106,
        "gluteus_medius_right": 107,
        "gluteus_minimus_left": 108,
        "gluteus_minimus_right": 109,
        "autochthon_left": 110,
        "autochthon_right": 111,
        "iliopsoas_left": 112,
        "iliopsoas_right": 113,
        "brachiocephalic_trunk": 114,
        "subclavian_artery_right": 115,
        "subclavian_artery_left": 116,
        "common_carotid_artery_right": 117,
    }

    # MR Labels (56 structures)
    MR_LABELS = {
        "spleen": 1,
        "kidney_right": 2,
        "kidney_left": 3,
        "gallbladder": 4,
        "liver": 5,
        "stomach": 6,
        "aorta": 7,
        "inferior_vena_cava": 8,
        "portal_vein_and_splenic_vein": 9,
        "pancreas": 10,
        "adrenal_gland_right": 11,
        "adrenal_gland_left": 12,
        "lung_upper_lobe_left": 13,
        "lung_lower_lobe_left": 14,
        "lung_upper_lobe_right": 15,
        "lung_middle_lobe_right": 16,
        "lung_lower_lobe_right": 17,
        "vertebrae_T12": 18,
        "vertebrae_L1": 19,
        "vertebrae_L2": 20,
        "vertebrae_L3": 21,
        "vertebrae_L4": 22,
        "vertebrae_L5": 23,
        "esophagus": 24,
        "trachea": 25,
        "heart_myocardium": 26,
        "heart_atrium_left": 27,
        "heart_ventricle_left": 28,
        "heart_atrium_right": 29,
        "heart_ventricle_right": 30,
        "pulmonary_artery": 31,
        "brain": 32,
        "iliac_artery_left": 33,
        "iliac_artery_right": 34,
        "iliac_vena_left": 35,
        "iliac_vena_right": 36,
        "small_bowel": 37,
        "duodenum": 38,
        "colon": 39,
        "urinary_bladder": 40,
        "face": 41,
        "hip_left": 42,
        "hip_right": 43,
        "sacrum": 44,
        "vertebrae_S1": 45,
        "gluteus_maximus_left": 46,
        "gluteus_maximus_right": 47,
        "gluteus_medius_left": 48,
        "gluteus_medius_right": 49,
        "gluteus_minimus_left": 50,
        "gluteus_minimus_right": 51,
        "autochthon_left": 52,
        "autochthon_right": 53,
        "iliopsoas_left": 54,
        "iliopsoas_right": 55,
    }

    def __init__(
        self,
        type: InferType = InferType.SEGMENTATION,
        labels: Optional[Dict[str, int]] = None,
        dimension: int = 3,
        description: str = "TotalSegmentator for comprehensive CT/MR organ segmentation",
        default_modality: str = "ct",
        **kwargs,
    ):
        # Labels are dynamic - populated based on modality and roi_subset at runtime
        super().__init__(
            type=type,
            labels=labels or {},
            dimension=dimension,
            description=description,
            config=kwargs.get("config", {}),
        )
        self.default_modality = default_modality
        self._totalsegmentator_loaded = False
        # TotalSegmentator API expects 'gpu', 'cpu', 'mps', or 'gpu:X' format (not 'cuda:X')
        self.device = "gpu" if torch.cuda.is_available() else "cpu"

        logger.info(f"TotalSegmentator initialized with device: {self.device}")

    def _load_totalsegmentator(self):
        """Load TotalSegmentator library."""
        if self._totalsegmentator_loaded:
            return

        try:
            from totalsegmentator.python_api import totalsegmentator
            self.totalsegmentator_func = totalsegmentator
            self._totalsegmentator_loaded = True
            logger.info("TotalSegmentator library loaded successfully")
        except ImportError as e:
            logger.error(
                "TotalSegmentator not installed. Install with: pip install TotalSegmentator"
            )
            raise ImportError(
                "TotalSegmentator not installed. Please run: pip install TotalSegmentator"
            ) from e

    def _get_label_mapping(self, modality: str) -> Dict[str, int]:
        """Get label mapping for the specified modality."""
        if modality.lower() == "ct":
            return self.CT_LABELS
        elif modality.lower() == "mr":
            return self.MR_LABELS
        else:
            raise ValueError(f"Unsupported modality: {modality}. Must be 'ct' or 'mr'")

    def _validate_roi_subset(
        self, roi_subset: list, available_labels: Dict[str, int]
    ) -> None:
        """Validate that all requested ROIs are available for the modality."""
        invalid_rois = [roi for roi in roi_subset if roi not in available_labels]
        if invalid_rois:
            raise ValueError(
                f"Invalid ROIs for this modality: {invalid_rois}. "
                f"Available ROIs: {list(available_labels.keys())}"
            )

    def info(self) -> Dict[str, Any]:
        """Return comprehensive model information including supported modalities and labels."""
        return {
            "type": self.type.value,
            "labels": self.labels,
            "dimension": self.dimension,
            "description": self.description,
            "supported_modalities": ["CT", "MR"],
            "default_modality": self.default_modality,
            "ct_labels": self.CT_LABELS,
            "mr_labels": self.MR_LABELS,
            "ct_structures_count": len(self.CT_LABELS),
            "mr_structures_count": len(self.MR_LABELS),
            "device": str(self.device),
        }

    def is_valid(self) -> bool:
        """Check if TotalSegmentator is available."""
        try:
            from totalsegmentator.python_api import totalsegmentator
            return True
        except ImportError:
            return False

    def pre_transforms(self, data=None) -> Sequence[Callable]:
        return []  # No pre-transforms - TotalSegmentator handles everything

    def post_transforms(self, data=None) -> Sequence[Callable]:
        return []  # No post-transforms

    def inferer(self, data=None):
        return None  # No inferer - TotalSegmentator handles inference

    def __call__(self, request: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Main entry point for TotalSegmentator inference.

        Args:
            request: Dictionary containing:
                - image: Path to input NIfTI file
                - modality: "ct" or "mr" (optional, defaults to "ct")
                - roi_subset: List of organ names to segment (optional, defaults to all)

        Returns:
            Tuple of (result_file_path, metadata_dict)
        """
        logger.info(f"TotalSegmentator.__call__ invoked with keys: {list(request.keys())}")

        # Get input image path
        image_path = request.get("image")
        if not image_path or not os.path.exists(image_path):
            logger.error(f"Image path not found: {image_path}")
            raise ValueError(f"Image not found: {image_path}")

        # Get modality from params or request
        params = request.get("params", {})
        if isinstance(params, str):
            import json
            try:
                params = json.loads(params)
            except json.JSONDecodeError:
                params = {}

        modality = params.get("modality", request.get("modality", self.default_modality))
        modality = modality.lower() if modality else self.default_modality

        if modality not in ["ct", "mr"]:
            raise ValueError(f"Invalid modality: {modality}. Must be 'ct' or 'mr'")

        # Get ROI subset (default to None = all structures)
        roi_subset = params.get("roi_subset", request.get("roi_subset", None))

        logger.info(f"Running TotalSegmentator inference on: {image_path}")
        logger.info(f"Modality: {modality}")
        logger.info(f"ROI subset: {roi_subset if roi_subset else 'all structures'}")

        # Load TotalSegmentator
        self._load_totalsegmentator()

        # Get available labels for this modality
        available_labels = self._get_label_mapping(modality)

        # Validate ROI subset if provided
        if roi_subset:
            self._validate_roi_subset(roi_subset, available_labels)

        # Load original image to get shape info
        nib_img = nib.load(image_path)
        img_shape = nib_img.shape
        logger.info(f"Input image shape: {img_shape}")

        # Create temporary output directory for TotalSegmentator
        output_dir = tempfile.mkdtemp(prefix="totalseg_")
        output_file = os.path.join(output_dir, "segmentation.nii.gz")

        # Determine task based on modality
        task = "total" if modality == "ct" else "total_mr"

        # Run TotalSegmentator inference
        try:
            logger.info(f"Running TotalSegmentator with task={task}")

            # TotalSegmentator API call
            self.totalsegmentator_func(
                input=image_path,
                output=output_file,
                ml=True,  # Use multi-label output (single file)
                task=task,
                roi_subset=roi_subset,
                device=self.device,
                quiet=True,
            )

            logger.info(f"TotalSegmentator inference complete")

        except Exception as e:
            logger.error(f"TotalSegmentator inference failed: {str(e)}")
            # Clean up temp directory
            import shutil
            shutil.rmtree(output_dir, ignore_errors=True)
            raise RuntimeError(f"TotalSegmentator inference failed: {str(e)}") from e

        # Load result and verify
        result_img = nib.load(output_file)
        result_data = result_img.get_fdata()
        logger.info(f"Output mask shape: {result_data.shape}")
        logger.info(f"Unique labels in mask: {np.unique(result_data)}")

        # Copy result to permanent temp file
        result_file = tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False).name
        nib.save(result_img, result_file)

        # Clean up temp directory
        import shutil
        shutil.rmtree(output_dir, ignore_errors=True)

        # Build dynamic labels from roi_subset or full label set
        if roi_subset:
            # Only return labels for requested ROIs
            labels = {roi: available_labels[roi] for roi in roi_subset}
        else:
            # Return all labels for this modality
            labels = available_labels

        # Cleanup
        gc.collect()
        torch.cuda.empty_cache()

        # Return in MONAI Label format
        result_params = {
            "model": "totalsegmentator",
            "modality": modality,
            "labels": labels,
            "roi_subset": roi_subset,
            "structures_count": len(labels),
        }

        logger.info(f"Inference complete. Result saved to: {result_file}")
        return result_file, result_params
