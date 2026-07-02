# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
import gc
import io
import logging
import os
import sys
import tempfile
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

import nibabel as nib
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from monailabel.interfaces.tasks.infer_v2 import InferTask, InferType

logger = logging.getLogger(__name__)

# Supported 2D image extensions
IMAGE_2D_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.tif', '.webp'}

# BiomedParse source path
BIOMEDPARSE_PATH = "/code/biomedparse"


class BiomedParse(InferTask):
    """
    BiomedParse text-prompted 3D segmentation.
    Bypasses MONAI Label's transform pipeline and calls BiomedParse directly.

    Accepts text prompts like "liver" or "liver[SEP]kidney[SEP]spleen" for multi-class.
    """

    def __init__(
        self,
        checkpoint_path: str = "/code/checkpoints/biomedparse/biomedparse_v2.ckpt",
        type: InferType = InferType.SEGMENTATION,
        labels: Optional[Dict[str, int]] = None,
        dimension: int = 3,
        description: str = "BiomedParse text-prompted 3D segmentation",
        **kwargs,
    ):
        # Labels are dynamic - populated from text_prompt at runtime
        super().__init__(
            type=type,
            labels=labels or {},
            dimension=dimension,
            description=description,
            config=kwargs.get("config", {}),
        )
        self.checkpoint_path = checkpoint_path
        self._model = None
        self._utils_loaded = False
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    def _load_biomedparse_utils(self):
        """Load BiomedParse utility functions."""
        if self._utils_loaded:
            return

        # Add BiomedParse to path
        if BIOMEDPARSE_PATH not in sys.path:
            sys.path.insert(0, BIOMEDPARSE_PATH)

        # Import utils
        from utils import process_input, process_output, slice_nms
        self.process_input = process_input
        self.process_output = process_output
        self.slice_nms = slice_nms
        self._utils_loaded = True

    def _get_model(self):
        """Lazy initialization of BiomedParse model using Hydra config."""
        if self._model is None:
            logger.info("Initializing BiomedParse model...")

            # Ensure BiomedParse path is in sys.path
            if BIOMEDPARSE_PATH not in sys.path:
                sys.path.insert(0, BIOMEDPARSE_PATH)

            import hydra
            from hydra import compose, initialize_config_dir
            from hydra.core.global_hydra import GlobalHydra

            # Clear any existing Hydra instance
            GlobalHydra.instance().clear()

            # Use initialize_config_dir with absolute path to configs/model directory
            config_dir = os.path.join(BIOMEDPARSE_PATH, "configs", "model")
            logger.info(f"Initializing Hydra with config_dir: {config_dir}")
            initialize_config_dir(config_dir=config_dir, job_name="biomedparse_inference", version_base=None)

            # Compose the model config (just the filename since we're in configs/model)
            cfg = compose(config_name="biomedparse_3D")

            logger.info(f"Composed config keys: {list(cfg.keys()) if hasattr(cfg, 'keys') else 'N/A'}")
            logger.info(f"Config _target_: {cfg.get('_target_', 'N/A')}")

            # Instantiate the model using _convert_="object" as in the notebook
            logger.info("Instantiating model...")
            self._model = hydra.utils.instantiate(cfg, _convert_="object")

            logger.info(f"Instantiated model type: {type(self._model)}")

            # Load pretrained weights
            logger.info(f"Loading checkpoint from {self.checkpoint_path}")
            self._model.load_pretrained(self.checkpoint_path)

            # Move to device and set to eval mode
            self._model.to(self.device)
            self._model.eval()

            logger.info("BiomedParse model initialized successfully")

        return self._model

    def info(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "labels": self.labels,
            "dimension": self.dimension,
            "description": self.description,
            "checkpoint_path": self.checkpoint_path,
        }

    def is_valid(self) -> bool:
        return os.path.exists(self.checkpoint_path)

    def pre_transforms(self, data=None) -> Sequence[Callable]:
        return []  # No pre-transforms - we handle everything in __call__

    def post_transforms(self, data=None) -> Sequence[Callable]:
        return []  # No post-transforms

    def inferer(self, data=None):
        return None  # No inferer - we handle everything in __call__

    def _postprocess(self, model_outputs, object_existence, threshold=0.5, do_nms=True):
        """Post-process model outputs with optional NMS."""
        if do_nms and model_outputs.shape[0] > 1:
            return self.slice_nms(
                model_outputs.sigmoid(),
                object_existence.sigmoid(),
                iou_threshold=0.5,
                score_threshold=threshold
            )
        mask = (model_outputs.sigmoid()) * (
            object_existence.sigmoid() > threshold
        ).int().unsqueeze(-1).unsqueeze(-1)
        return mask

    def _merge_multiclass_masks(self, masks, ids):
        """Merge multiple class masks into a single multi-class mask."""
        bg_mask = 0.5 * torch.ones_like(masks[0:1])
        keep_masks = torch.cat([bg_mask, masks], dim=0)
        class_mask = keep_masks.argmax(dim=0)

        # Remap class IDs if needed
        id_map = {j + 1: int(ids[j]) for j in range(len(ids)) if j + 1 != int(ids[j])}
        if len(id_map) > 0:
            orig_mask = class_mask.clone()
            for j in id_map:
                class_mask[orig_mask == j] = id_map[j]

        return class_mask

    def _is_2d_image(self, file_path: str) -> bool:
        """Check if file is a 2D image based on extension."""
        ext = os.path.splitext(file_path)[1].lower()
        return ext in IMAGE_2D_EXTENSIONS

    def _load_2d_image(self, image_path: str) -> Tuple[np.ndarray, None]:
        """Load a 2D image and convert to grayscale numpy array with shape (H, W, 1)."""
        img = Image.open(image_path)
        # Convert to grayscale if needed
        if img.mode != 'L':
            img = img.convert('L')
        img_np = np.array(img, dtype=np.float32)
        # Add depth dimension: (H, W) -> (H, W, 1)
        img_np = img_np[:, :, np.newaxis]
        logger.info(f"Loaded 2D image: {img_np.shape}, dtype: {img_np.dtype}")
        return img_np, None  # No affine for 2D images

    def _save_2d_mask(self, mask: np.ndarray, original_size: Tuple[int, int]) -> str:
        """Save 2D mask as PNG file."""
        # mask shape should be (H, W) or (1, H, W) or (H, W, 1)
        if mask.ndim == 3:
            if mask.shape[0] == 1:
                mask = mask[0]  # (1, H, W) -> (H, W)
            elif mask.shape[2] == 1:
                mask = mask[:, :, 0]  # (H, W, 1) -> (H, W)

        # Resize back to original size if different
        if mask.shape != original_size:
            mask_img = Image.fromarray(mask.astype(np.uint8))
            mask_img = mask_img.resize((original_size[1], original_size[0]), Image.NEAREST)
            mask = np.array(mask_img)

        # Save as PNG
        result_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
        mask_img = Image.fromarray(mask.astype(np.uint8))
        mask_img.save(result_file)
        logger.info(f"Saved 2D mask to: {result_file}, shape: {mask.shape}")
        return result_file

    def __call__(self, request: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Main entry point for inference.
        MONAI Label calls this method directly.
        Supports both 2D images (JPEG, PNG, etc.) and 3D volumes (NIfTI).
        """
        logger.info(f"BiomedParse.__call__ invoked with keys: {list(request.keys())}")

        # Get input image path
        image_path = request.get("image")
        if not image_path or not os.path.exists(image_path):
            logger.error(f"Image path not found: {image_path}")
            raise ValueError(f"Image not found: {image_path}")

        # Get text prompt
        text_prompt = request.get("text_prompt", "")
        if not text_prompt:
            # Check in 'params' dict as well (for API compatibility)
            params = request.get("params", {})
            if isinstance(params, dict):
                text_prompt = params.get("text_prompt", "")

        if not text_prompt:
            raise ValueError("text_prompt is required for BiomedParse segmentation")

        logger.info(f"Running BiomedParse inference on: {image_path}")
        logger.info(f"Text prompt: {text_prompt}")

        # Load utilities and model
        self._load_biomedparse_utils()
        model = self._get_model()

        # Detect if input is 2D image or 3D volume
        is_2d = self._is_2d_image(image_path)
        logger.info(f"Input type: {'2D image' if is_2d else '3D volume'}")

        if is_2d:
            # Load 2D image
            img_np, original_affine = self._load_2d_image(image_path)
            original_2d_size = (img_np.shape[0], img_np.shape[1])  # (H, W)
        else:
            # Load NIfTI image
            nib_img = nib.load(image_path)
            img_np = nib_img.get_fdata()
            original_affine = nib_img.affine
            original_2d_size = None

        logger.info(f"Input image shape: {img_np.shape}")

        # Parse text prompts to get class IDs
        # Support multiple input formats:
        # - "liver[SEP]spleen" (explicit separator)
        # - "liver, spleen, kidney" (comma-separated)
        # - "liver and spleen" (natural language with "and")
        # - "liver spleen kidney" (space-separated single words)
        if "[SEP]" in text_prompt:
            # Explicit separator - use as-is
            prompts = [p.strip() for p in text_prompt.split("[SEP]") if p.strip()]
        elif "," in text_prompt:
            # Comma-separated list
            prompts = [p.strip() for p in text_prompt.split(",") if p.strip()]
        elif " and " in text_prompt.lower():
            # Natural language with "and" - split by "and" (case insensitive)
            import re
            prompts = [p.strip() for p in re.split(r'\s+and\s+', text_prompt, flags=re.IGNORECASE) if p.strip()]
        else:
            # Space-separated - each word is a separate organ
            prompts = [p.strip() for p in text_prompt.split() if p.strip()]

        # If only one prompt after parsing, keep it as single prompt
        # (e.g., "left kidney" should stay as "left kidney", not ["left", "kidney"])
        # Heuristic: if original has no separators and result has multiple single words,
        # it might be a multi-word description - keep as single prompt
        if len(prompts) > 1 and "[SEP]" not in text_prompt and "," not in text_prompt and " and " not in text_prompt.lower():
            # Check if these look like single-word organ names or a multi-word description
            # Common multi-word patterns: "left X", "right X", "X tumor", etc.
            first_word = prompts[0].lower()
            if first_word in ['left', 'right', 'upper', 'lower', 'anterior', 'posterior', 'medial', 'lateral']:
                # Likely a multi-word description like "left kidney" - keep as one
                prompts = [text_prompt.strip()]

        # Build the model prompt with [SEP] separator
        model_text_prompt = "[SEP]".join(prompts)
        ids = list(range(1, len(prompts) + 1))

        logger.info(f"Original prompt: {text_prompt}")
        logger.info(f"Parsed prompts: {prompts}")
        logger.info(f"Model prompt: {model_text_prompt}")
        logger.info(f"Class IDs: {ids}")

        # Process input: pad to square, resize to 512
        imgs, pad_width, padded_size, valid_axis = self.process_input(img_np, 512)

        logger.info(f"Processed image shape: {imgs.shape}, valid_axis: {valid_axis}")

        # Move to device
        imgs = imgs.to(self.device).int()

        # Prepare input tensor
        input_tensor = {
            "image": imgs.unsqueeze(0),  # Add batch dimension
            "text": [model_text_prompt],  # Use parsed prompt with [SEP] separators
        }

        # Run inference
        with torch.no_grad():
            output = model(input_tensor, mode="eval", slice_batch_size=4)

        # Get predictions
        mask_preds = output["predictions"]["pred_gmasks"]
        object_existence = output["predictions"]["object_existence"]

        logger.info(f"Raw mask predictions shape: {mask_preds.shape}")

        # Interpolate to 512x512 if needed
        if mask_preds.shape[-1] != 512 or mask_preds.shape[-2] != 512:
            mask_preds = F.interpolate(
                mask_preds,
                size=(512, 512),
                mode="bicubic",
                align_corners=False,
                antialias=True,
            )

        # Post-process
        mask_preds = self._postprocess(mask_preds, object_existence)

        # Merge multi-class masks
        mask_preds = self._merge_multiclass_masks(mask_preds, ids)

        # Convert back to original dimensions
        mask_preds = self.process_output(mask_preds, pad_width, padded_size, valid_axis)

        logger.info(f"Final mask shape: {mask_preds.shape}")
        logger.info(f"Unique values in mask: {np.unique(mask_preds)}")

        # Save result - PNG for 2D, NIfTI for 3D
        if is_2d:
            result_file = self._save_2d_mask(mask_preds, original_2d_size)
        else:
            result_file = tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False).name
            result_img = nib.Nifti1Image(mask_preds.astype(np.uint8), original_affine)
            nib.save(result_img, result_file)

        logger.info(f"Inference complete. Result saved to: {result_file}")

        # Build dynamic labels from text prompt
        labels = {prompt: idx for idx, prompt in enumerate(prompts, start=1)}

        # Cleanup
        del imgs, input_tensor, output, mask_preds
        gc.collect()
        torch.cuda.empty_cache()

        # Return in MONAI Label format
        params = {
            "model": "biomedparse",
            "labels": labels,
            "text_prompt": text_prompt,
            "is_2d": is_2d,
        }
        return result_file, params
