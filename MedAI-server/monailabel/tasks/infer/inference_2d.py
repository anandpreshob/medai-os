# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
"""
2D image inference using SAM3 processor for point/box prompts.

This module provides 2D image segmentation using SAM3's image processor,
which is designed for 2D images. It handles:
- Point prompts (converted to small boxes for SAM3)
- Box prompts (in corner format, converted to center format)
- Returns PNG mask output

For 3D volumes, the regular nnInteractive pipeline is used instead.
"""
import logging
import os
import tempfile
from typing import Any, Dict, Tuple

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

# Supported 2D image extensions
IMAGE_2D_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.tif', '.webp'}

# Lazy-loaded global processor and state
_sam3_processor = None
_sam3_state = {}
_sam3_2d_session_id = None


def is_2d_image(file_path: str) -> bool:
    """Check if file is a 2D image based on extension."""
    if not file_path:
        return False
    ext = os.path.splitext(file_path)[1].lower()
    return ext in IMAGE_2D_EXTENSIONS


def get_sam3_processor():
    """Get or create SAM3 processor for 2D inference."""
    global _sam3_processor
    if _sam3_processor is None:
        logger.info("Initializing SAM3 processor for 2D inference...")
        try:
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Building SAM3 image model on device: {device}")

            model = build_sam3_image_model(
                enable_segmentation=True,
                enable_inst_interactivity=True,
                device=device
            )
            _sam3_processor = Sam3Processor(model, device=device)
            logger.info("SAM3 processor initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize SAM3 processor: {e}")
            raise
    return _sam3_processor


def run_2d_inference(image_path: str, prompts: Dict, mode: str, session_id: str = None) -> Tuple[str, Dict]:
    """
    Run 2D inference with SAM3 processor.

    Args:
        image_path: Path to 2D image (JPEG, PNG, etc.)
        prompts: Dict with pos_points, neg_points, pos_boxes, neg_boxes
        mode: "init" to initialize, "sam3" for inference
        session_id: Optional session ID for tracking

    Returns:
        Tuple of (result_file_path, result_metadata)
    """
    global _sam3_state, _sam3_2d_session_id

    logger.info(f"run_2d_inference called: mode={mode}, image_path={image_path}")
    logger.info(f"Prompts: {prompts}")

    processor = get_sam3_processor()

    if mode == "init":
        # Load and set 2D image
        logger.info(f"Initializing 2D session with image: {image_path}")
        image = Image.open(image_path).convert('RGB')
        _sam3_state = processor.set_image(image)
        _sam3_state['image_path'] = image_path
        _sam3_state['original_size'] = image.size  # (W, H)
        _sam3_2d_session_id = session_id

        logger.info(f"2D session initialized. Image size: {image.size}")
        return '/code/predictions/init_2d.nii.gz', {"status": "initialized_2d", "is_2d": True}

    # Validate state
    if 'backbone_out' not in _sam3_state:
        logger.warning("2D session not initialized, initializing now...")
        # Auto-initialize if image path is provided
        if image_path and os.path.exists(image_path):
            image = Image.open(image_path).convert('RGB')
            _sam3_state = processor.set_image(image)
            _sam3_state['image_path'] = image_path
            _sam3_state['original_size'] = image.size
            logger.info(f"Auto-initialized 2D session with image: {image_path}")
        else:
            raise ValueError("Must initialize 2D session first with nninter=init")

    orig_w, orig_h = _sam3_state['original_size']
    logger.info(f"Processing prompts on image {orig_w}x{orig_h}")

    # Process positive points as small boxes
    pos_points = prompts.get('pos_points', [])
    for point in pos_points:
        x, y = point[0], point[1]  # z is ignored for 2D
        box = _point_to_box(x, y, orig_w, orig_h, box_size=0.05)
        logger.info(f"Adding positive point ({x}, {y}) as box {box}")
        _sam3_state = processor.add_geometric_prompt(box=box, label=True, state=_sam3_state)

    # Process negative points
    neg_points = prompts.get('neg_points', [])
    for point in neg_points:
        x, y = point[0], point[1]
        box = _point_to_box(x, y, orig_w, orig_h, box_size=0.05)
        logger.info(f"Adding negative point ({x}, {y}) as box {box}")
        _sam3_state = processor.add_geometric_prompt(box=box, label=False, state=_sam3_state)

    # Process positive boxes
    pos_boxes = prompts.get('pos_boxes', [])
    for box_corners in pos_boxes:
        box = _corners_to_cxcywh(box_corners, orig_w, orig_h)
        logger.info(f"Adding positive box {box_corners} as {box}")
        _sam3_state = processor.add_geometric_prompt(box=box, label=True, state=_sam3_state)

    # Process negative boxes
    neg_boxes = prompts.get('neg_boxes', [])
    for box_corners in neg_boxes:
        box = _corners_to_cxcywh(box_corners, orig_w, orig_h)
        logger.info(f"Adding negative box {box_corners} as {box}")
        _sam3_state = processor.add_geometric_prompt(box=box, label=False, state=_sam3_state)

    # Extract and save mask
    if 'masks' in _sam3_state and len(_sam3_state['masks']) > 0:
        mask = _sam3_state['masks'][0].cpu().numpy().squeeze()
        mask_binary = (mask > 0.5).astype(np.uint8)

        # Count non-zero pixels
        non_zero = np.count_nonzero(mask_binary)
        logger.info(f"Generated mask with {non_zero} non-zero pixels out of {mask_binary.size}")

        # Scale to 0-255 for PNG (use 1 as label value for segmentation)
        mask_out = mask_binary  # Keep as 0/1 for label indexing

        result_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
        Image.fromarray(mask_out).save(result_file)

        logger.info(f"Saved 2D mask to: {result_file}")
        return result_file, {"is_2d": True, "model": "sam3", "labels": {"object": 1}}

    logger.warning("No mask generated from SAM3 processor")
    return '/code/predictions/empty.nii.gz', {"is_2d": True, "status": "no_mask"}


def _point_to_box(x: float, y: float, img_w: int, img_h: int, box_size: float = 0.05):
    """
    Convert point to small box in normalized [cx, cy, w, h] format.

    SAM3 uses box format: [center_x, center_y, width, height] normalized to [0, 1]
    """
    return [x / img_w, y / img_h, box_size, box_size]


def _corners_to_cxcywh(corners, img_w: int, img_h: int):
    """
    Convert [[x1,y1,z1], [x2,y2,z2]] to normalized [cx, cy, w, h].

    Input: Corner format from frontend
    Output: SAM3 center format [center_x, center_y, width, height] in [0, 1] range
    """
    x1, y1 = corners[0][0], corners[0][1]
    x2, y2 = corners[1][0], corners[1][1]
    cx = (x1 + x2) / 2 / img_w
    cy = (y1 + y2) / 2 / img_h
    w = abs(x2 - x1) / img_w
    h = abs(y2 - y1) / img_h
    return [cx, cy, w, h]


def reset_2d_session():
    """Reset 2D inference state."""
    global _sam3_state, _sam3_2d_session_id
    logger.info("Resetting 2D inference session")
    _sam3_state = {}
    _sam3_2d_session_id = None
