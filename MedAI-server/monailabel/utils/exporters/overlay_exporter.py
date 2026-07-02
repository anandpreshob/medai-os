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
Overlay Exporter

Exports segmentation masks as colored PNG overlays with support for:
- Multiple labels with distinct colors
- Alpha blending with original images
- Configurable color palettes
- Individual mask export or combined overlay
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)


class OverlayExporter:
    """
    Export segmentation masks as colored PNG overlays.

    Supports:
    - Multi-label segmentation with distinct colors
    - Alpha blending with original images
    - Configurable color palettes
    - Individual mask export per label
    - Combined overlay with legend
    """

    # Default color palette (distinct, visually appealing colors)
    DEFAULT_PALETTE = [
        (255, 0, 0),      # Red
        (0, 255, 0),      # Green
        (0, 0, 255),      # Blue
        (255, 255, 0),    # Yellow
        (255, 0, 255),    # Magenta
        (0, 255, 255),    # Cyan
        (255, 128, 0),    # Orange
        (128, 0, 255),    # Purple
        (0, 255, 128),    # Spring Green
        (255, 0, 128),    # Rose
        (128, 255, 0),    # Lime
        (0, 128, 255),    # Sky Blue
        (255, 128, 128),  # Light Red
        (128, 255, 128),  # Light Green
        (128, 128, 255),  # Light Blue
        (255, 255, 128),  # Light Yellow
        (255, 128, 255),  # Light Magenta
        (128, 255, 255),  # Light Cyan
    ]

    # Medical imaging specific palette
    MEDICAL_PALETTE = [
        (255, 0, 0),      # Lesion/Tumor - Red
        (0, 255, 0),      # Healthy Tissue - Green
        (0, 0, 255),      # Organ Boundary - Blue
        (255, 165, 0),    # Warning Area - Orange
        (255, 255, 0),    # Highlight - Yellow
        (128, 0, 128),    # Secondary Finding - Purple
        (0, 255, 255),    # Fluid/Edema - Cyan
        (255, 192, 203),  # Soft Tissue - Pink
        (165, 42, 42),    # Blood/Hemorrhage - Brown
        (0, 128, 128),    # Necrosis - Teal
    ]

    def __init__(
        self,
        palette: Optional[List[Tuple[int, int, int]]] = None,
        use_medical_palette: bool = True,
        default_alpha: float = 0.5,
    ):
        """
        Initialize overlay exporter.

        Args:
            palette: Custom color palette as list of RGB tuples
            use_medical_palette: Use medical imaging specific colors
            default_alpha: Default alpha value for blending (0-1)
        """
        if palette:
            self.palette = palette
        elif use_medical_palette:
            self.palette = self.MEDICAL_PALETTE
        else:
            self.palette = self.DEFAULT_PALETTE

        self.default_alpha = default_alpha

    def export(
        self,
        results: List[Dict[str, Any]],
        categories: List[Dict[str, Any]],
        output_dir: str,
        alpha: Optional[float] = None,
        include_original: bool = True,
        export_individual_masks: bool = False,
        add_legend: bool = True,
    ) -> str:
        """
        Export masks as colored PNG overlays.

        Args:
            results: List of result dictionaries with keys:
                - file_path: Path to original image
                - mask_path: Path to segmentation mask
                - labels: List of labels found
            categories: List of category definitions
            output_dir: Output directory
            alpha: Alpha value for blending (0-1), uses default if None
            include_original: Blend with original image if available
            export_individual_masks: Export separate mask per label
            add_legend: Add color legend to exports

        Returns:
            Path to output directory
        """
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        alpha = alpha if alpha is not None else self.default_alpha

        # Create color mapping for categories
        color_map = self._create_color_map(categories)

        for result in results:
            file_path = result.get("file_path", "")
            mask_path = result.get("mask_path")

            if not mask_path or not os.path.exists(mask_path):
                logger.warning(f"Skipping {file_path}: mask not found")
                continue

            base_name = Path(file_path).stem

            # Load mask
            mask = self._load_mask(mask_path)
            if mask is None:
                continue

            # Load original image if needed
            original_image = None
            if include_original and os.path.exists(file_path):
                original_image = self._load_image(file_path)

            # Create combined overlay
            overlay_path = output_path / f"{base_name}_overlay.png"
            self._create_overlay(
                mask=mask,
                output_path=overlay_path,
                color_map=color_map,
                original_image=original_image,
                alpha=alpha,
                add_legend=add_legend,
                categories=categories,
            )

            # Export individual masks if requested
            if export_individual_masks:
                masks_dir = output_path / "individual_masks" / base_name
                masks_dir.mkdir(parents=True, exist_ok=True)

                for label_val in np.unique(mask):
                    if label_val == 0:
                        continue

                    # Get label name
                    class_idx = int(label_val) - 1
                    if 0 <= class_idx < len(categories):
                        label_name = categories[class_idx].get("name", f"label_{label_val}")
                    else:
                        label_name = f"label_{label_val}"

                    mask_output = masks_dir / f"{label_name}.png"
                    self._export_single_mask(
                        mask=mask,
                        label_value=label_val,
                        output_path=mask_output,
                        color=color_map.get(int(label_val), self.palette[0]),
                    )

        logger.info(f"Exported overlay masks to {output_dir}")
        return str(output_path)

    def _create_color_map(
        self,
        categories: List[Dict[str, Any]],
    ) -> Dict[int, Tuple[int, int, int]]:
        """Create mapping from label ID to color."""
        color_map = {}

        for idx, cat in enumerate(categories):
            label_id = cat.get("id", idx + 1)

            # Use custom color if specified
            if "color" in cat:
                color = self._parse_color(cat["color"])
            else:
                color = self.palette[idx % len(self.palette)]

            color_map[label_id] = color

        return color_map

    def _parse_color(
        self,
        color: Union[str, List[int], Tuple[int, int, int]],
    ) -> Tuple[int, int, int]:
        """Parse color from various formats."""
        if isinstance(color, (list, tuple)) and len(color) >= 3:
            return (int(color[0]), int(color[1]), int(color[2]))

        if isinstance(color, str):
            # Handle hex colors
            if color.startswith("#"):
                color = color[1:]
            if len(color) == 6:
                return (
                    int(color[0:2], 16),
                    int(color[2:4], 16),
                    int(color[4:6], 16),
                )

        # Fallback to first palette color
        return self.palette[0]

    def _load_mask(
        self,
        mask_path: str,
    ) -> Optional[np.ndarray]:
        """Load mask from file."""
        try:
            if mask_path.endswith((".nii", ".nii.gz")):
                import nibabel as nib
                nii = nib.load(mask_path)
                mask = nii.get_fdata().astype(np.int32)
                if mask.ndim > 2:
                    # Take max projection for 3D masks
                    mask = np.max(mask, axis=2)
            elif mask_path.endswith((".png", ".jpg", ".jpeg")):
                from PIL import Image
                img = Image.open(mask_path)
                mask = np.array(img)
                if mask.ndim == 3:
                    mask = mask[:, :, 0]
            elif mask_path.endswith(".npy"):
                mask = np.load(mask_path)
                if mask.ndim > 2:
                    mask = np.max(mask, axis=2)
            else:
                logger.warning(f"Unsupported mask format: {mask_path}")
                return None

            return mask.astype(np.int32)

        except Exception as e:
            logger.error(f"Failed to load mask {mask_path}: {e}")
            return None

    def _load_image(
        self,
        image_path: str,
    ) -> Optional[np.ndarray]:
        """Load original image."""
        try:
            if image_path.endswith((".nii", ".nii.gz")):
                import nibabel as nib
                nii = nib.load(image_path)
                img = nii.get_fdata()
                if img.ndim > 2:
                    # Take middle slice
                    mid = img.shape[2] // 2
                    img = img[:, :, mid]

                # Normalize to 0-255
                img = ((img - img.min()) / (img.max() - img.min() + 1e-8) * 255).astype(np.uint8)

            elif image_path.endswith((".png", ".jpg", ".jpeg")):
                from PIL import Image
                pil_img = Image.open(image_path)
                img = np.array(pil_img)
                if img.ndim == 2:
                    img = np.stack([img] * 3, axis=-1)
                elif img.ndim == 3 and img.shape[2] == 4:
                    img = img[:, :, :3]

            else:
                return None

            # Ensure 3-channel image
            if img.ndim == 2:
                img = np.stack([img] * 3, axis=-1)

            return img.astype(np.uint8)

        except Exception as e:
            logger.error(f"Failed to load image {image_path}: {e}")
            return None

    def _create_overlay(
        self,
        mask: np.ndarray,
        output_path: Path,
        color_map: Dict[int, Tuple[int, int, int]],
        original_image: Optional[np.ndarray] = None,
        alpha: float = 0.5,
        add_legend: bool = True,
        categories: List[Dict[str, Any]] = None,
    ):
        """Create colored overlay from mask."""
        try:
            from PIL import Image, ImageDraw, ImageFont

            height, width = mask.shape[:2]

            # Create RGB overlay
            overlay = np.zeros((height, width, 3), dtype=np.uint8)

            for label_val in np.unique(mask):
                if label_val == 0:
                    continue

                color = color_map.get(int(label_val), self.palette[0])
                overlay[mask == label_val] = color

            # Blend with original if provided
            if original_image is not None:
                # Resize original to match mask if needed
                if original_image.shape[:2] != (height, width):
                    from PIL import Image
                    pil_orig = Image.fromarray(original_image)
                    pil_orig = pil_orig.resize((width, height), Image.Resampling.LANCZOS)
                    original_image = np.array(pil_orig)

                # Create alpha mask (only where mask > 0)
                alpha_mask = (mask > 0).astype(np.float32) * alpha
                alpha_mask = alpha_mask[:, :, np.newaxis]

                # Blend
                blended = (
                    original_image * (1 - alpha_mask) +
                    overlay * alpha_mask
                ).astype(np.uint8)
            else:
                blended = overlay

            # Create PIL image
            result_img = Image.fromarray(blended)

            # Add legend if requested
            if add_legend and categories:
                result_img = self._add_legend(result_img, color_map, categories)

            result_img.save(output_path)

        except Exception as e:
            logger.error(f"Failed to create overlay: {e}")

    def _add_legend(
        self,
        image: "Image.Image",
        color_map: Dict[int, Tuple[int, int, int]],
        categories: List[Dict[str, Any]],
    ) -> "Image.Image":
        """Add color legend to image."""
        try:
            from PIL import Image, ImageDraw, ImageFont

            # Calculate legend dimensions
            legend_height = 20 * len(categories) + 20
            legend_width = 150

            # Create new image with legend space
            new_width = image.width + legend_width
            new_height = max(image.height, legend_height)

            new_image = Image.new("RGB", (new_width, new_height), (255, 255, 255))
            new_image.paste(image, (0, 0))

            draw = ImageDraw.Draw(new_image)

            # Draw legend
            y_offset = 10
            x_start = image.width + 10

            for idx, cat in enumerate(categories):
                label_id = cat.get("id", idx + 1)
                label_name = cat.get("name", f"Label {label_id}")
                color = color_map.get(label_id, self.palette[idx % len(self.palette)])

                # Draw color box
                box_size = 15
                draw.rectangle(
                    [x_start, y_offset, x_start + box_size, y_offset + box_size],
                    fill=color,
                    outline=(0, 0, 0),
                )

                # Draw label text
                draw.text(
                    (x_start + box_size + 5, y_offset),
                    label_name,
                    fill=(0, 0, 0),
                )

                y_offset += 20

            return new_image

        except Exception as e:
            logger.warning(f"Failed to add legend: {e}")
            return image

    def _export_single_mask(
        self,
        mask: np.ndarray,
        label_value: int,
        output_path: Path,
        color: Tuple[int, int, int],
    ):
        """Export single label mask as colored PNG."""
        try:
            from PIL import Image

            height, width = mask.shape[:2]

            # Create RGBA image (with transparency)
            rgba = np.zeros((height, width, 4), dtype=np.uint8)

            # Set color where mask matches label
            binary_mask = mask == label_value
            rgba[binary_mask, :3] = color
            rgba[binary_mask, 3] = 255  # Full opacity for mask areas

            img = Image.fromarray(rgba, mode='RGBA')
            img.save(output_path)

        except Exception as e:
            logger.error(f"Failed to export single mask: {e}")

    @staticmethod
    def blend_images(
        background: np.ndarray,
        overlay: np.ndarray,
        alpha: float = 0.5,
        mask: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Blend two images with alpha.

        Args:
            background: Background image
            overlay: Overlay image
            alpha: Alpha value (0-1)
            mask: Optional mask for selective blending

        Returns:
            Blended image
        """
        if mask is not None:
            alpha_mask = mask.astype(np.float32) * alpha
            if alpha_mask.ndim == 2:
                alpha_mask = alpha_mask[:, :, np.newaxis]
        else:
            alpha_mask = alpha

        blended = (
            background.astype(np.float32) * (1 - alpha_mask) +
            overlay.astype(np.float32) * alpha_mask
        )

        return blended.astype(np.uint8)

    @staticmethod
    def create_colorbar(
        categories: List[Dict[str, Any]],
        palette: List[Tuple[int, int, int]],
        width: int = 200,
        height: int = 400,
    ) -> np.ndarray:
        """
        Create a standalone colorbar image.

        Args:
            categories: List of category definitions
            palette: Color palette
            width: Image width
            height: Image height

        Returns:
            RGB numpy array
        """
        try:
            from PIL import Image, ImageDraw

            img = Image.new("RGB", (width, height), (255, 255, 255))
            draw = ImageDraw.Draw(img)

            row_height = height // max(len(categories), 1)

            for idx, cat in enumerate(categories):
                label_name = cat.get("name", f"Label {idx + 1}")
                color = palette[idx % len(palette)]

                y_start = idx * row_height
                y_end = y_start + row_height

                # Draw color box
                box_width = 30
                draw.rectangle(
                    [10, y_start + 5, 10 + box_width, y_end - 5],
                    fill=color,
                    outline=(0, 0, 0),
                )

                # Draw label
                draw.text(
                    (50, y_start + row_height // 2 - 10),
                    label_name,
                    fill=(0, 0, 0),
                )

            return np.array(img)

        except Exception as e:
            logger.error(f"Failed to create colorbar: {e}")
            return np.zeros((height, width, 3), dtype=np.uint8)
