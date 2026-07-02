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
YOLO Format Exporter

Exports segmentation masks to YOLO segmentation format.
Generates label files with normalized polygon coordinates and class mapping.
Supports train/val split for training workflows.
"""

import logging
import os
import random
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class YOLOExporter:
    """
    Export segmentation data to YOLO format.

    YOLO segmentation format:
    - Each image has a corresponding .txt file
    - Each line: class_id x1 y1 x2 y2 ... (normalized coordinates)
    - data.yaml file with class mapping and paths

    Supports:
    - YOLO segmentation format (polygon-based)
    - YOLO detection format (bounding box)
    - Automatic train/val split
    - Class mapping file generation
    """

    def __init__(
        self,
        task: str = "segment",  # "segment" or "detect"
        normalize_coordinates: bool = True,
    ):
        """
        Initialize YOLO exporter.

        Args:
            task: "segment" for segmentation, "detect" for detection
            normalize_coordinates: Whether to normalize coordinates to [0, 1]
        """
        self.task = task
        self.normalize_coordinates = normalize_coordinates

    def export(
        self,
        results: List[Dict[str, Any]],
        categories: List[Dict[str, Any]],
        output_dir: str,
        train_split: float = 0.8,
        copy_images: bool = False,
        image_format: str = "png",
    ) -> str:
        """
        Export results to YOLO format.

        Args:
            results: List of result dictionaries with keys:
                - file_path: Path to original image
                - mask_path: Path to segmentation mask
                - labels: List of labels found
                - image_width: Image width
                - image_height: Image height
            categories: List of category definitions with keys:
                - id: Category ID
                - name: Category name
            output_dir: Output directory
            train_split: Fraction for training set (0-1)
            copy_images: Whether to copy images to output
            image_format: Format for exported images

        Returns:
            Path to output directory
        """
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Create directory structure
        train_images = output_path / "images" / "train"
        val_images = output_path / "images" / "val"
        train_labels = output_path / "labels" / "train"
        val_labels = output_path / "labels" / "val"

        for dir_path in [train_images, val_images, train_labels, val_labels]:
            dir_path.mkdir(parents=True, exist_ok=True)

        # Create class mapping
        class_names = [cat.get("name", f"class_{i}") for i, cat in enumerate(categories)]
        self._write_data_yaml(output_path, class_names)

        # Shuffle and split data
        indices = list(range(len(results)))
        random.shuffle(indices)
        split_idx = int(len(indices) * train_split)
        train_indices = set(indices[:split_idx])

        # Process each result
        for idx, result in enumerate(results):
            is_train = idx in train_indices

            file_path = result.get("file_path", "")
            mask_path = result.get("mask_path")

            if not mask_path or not os.path.exists(mask_path):
                logger.warning(f"Skipping {file_path}: mask not found")
                continue

            # Load mask
            mask, img_width, img_height = self._load_mask(mask_path)
            if mask is None:
                continue

            # Override dimensions if provided
            img_width = result.get("image_width", img_width)
            img_height = result.get("image_height", img_height)

            # Determine output paths
            base_name = Path(file_path).stem
            if is_train:
                img_dir = train_images
                label_dir = train_labels
            else:
                img_dir = val_images
                label_dir = val_labels

            # Copy/link image if requested
            if copy_images and os.path.exists(file_path):
                dst_img = img_dir / f"{base_name}.{image_format}"
                self._copy_image(file_path, dst_img, image_format)

            # Generate label file
            label_path = label_dir / f"{base_name}.txt"
            self._write_label_file(
                mask=mask,
                label_path=label_path,
                img_width=img_width,
                img_height=img_height,
                categories=categories,
            )

        logger.info(f"Exported YOLO dataset to {output_dir}")
        return str(output_path)

    def _write_data_yaml(
        self,
        output_path: Path,
        class_names: List[str],
    ):
        """Write data.yaml configuration file."""
        yaml_content = f"""# YOLO Dataset Configuration
# Auto-generated by MedAI Batch Export

path: {output_path.absolute()}
train: images/train
val: images/val

# Classes
nc: {len(class_names)}
names: {class_names}
"""
        yaml_path = output_path / "data.yaml"
        with open(yaml_path, "w") as f:
            f.write(yaml_content)

        logger.info(f"Created data.yaml with {len(class_names)} classes")

    def _load_mask(
        self,
        mask_path: str,
    ) -> Tuple[Optional[np.ndarray], int, int]:
        """Load mask from file."""
        try:
            if mask_path.endswith((".nii", ".nii.gz")):
                import nibabel as nib
                nii = nib.load(mask_path)
                mask = nii.get_fdata().astype(np.int32)
                if mask.ndim > 2:
                    mask = np.max(mask, axis=2)
                height, width = mask.shape[:2]
            elif mask_path.endswith((".png", ".jpg", ".jpeg")):
                from PIL import Image
                img = Image.open(mask_path)
                mask = np.array(img)
                if mask.ndim == 3:
                    mask = mask[:, :, 0]
                height, width = mask.shape
            elif mask_path.endswith(".npy"):
                mask = np.load(mask_path)
                if mask.ndim > 2:
                    mask = np.max(mask, axis=2)
                height, width = mask.shape
            else:
                logger.warning(f"Unsupported mask format: {mask_path}")
                return None, 512, 512

            return mask, width, height

        except Exception as e:
            logger.error(f"Failed to load mask {mask_path}: {e}")
            return None, 512, 512

    def _write_label_file(
        self,
        mask: np.ndarray,
        label_path: Path,
        img_width: int,
        img_height: int,
        categories: List[Dict[str, Any]],
    ):
        """Write YOLO format label file."""
        lines = []
        unique_labels = np.unique(mask)

        for label_val in unique_labels:
            if label_val == 0:  # Skip background
                continue

            binary_mask = (mask == label_val).astype(np.uint8)

            # Get class index (YOLO uses 0-indexed)
            class_idx = int(label_val) - 1
            if class_idx < 0 or class_idx >= len(categories):
                class_idx = 0

            if self.task == "segment":
                # Get polygon coordinates
                polygons = self._mask_to_polygons(binary_mask)
                for polygon in polygons:
                    if self.normalize_coordinates:
                        normalized = self._normalize_polygon(
                            polygon, img_width, img_height
                        )
                    else:
                        normalized = polygon

                    coords_str = " ".join(f"{c:.6f}" for c in normalized)
                    lines.append(f"{class_idx} {coords_str}")
            else:
                # Detection: get bounding box
                bbox = self._get_bbox_yolo(binary_mask, img_width, img_height)
                if bbox:
                    x_center, y_center, width, height = bbox
                    lines.append(f"{class_idx} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")

        with open(label_path, "w") as f:
            f.write("\n".join(lines))

    def _mask_to_polygons(
        self,
        binary_mask: np.ndarray,
    ) -> List[List[float]]:
        """Convert binary mask to polygon coordinates."""
        try:
            import cv2
            contours, _ = cv2.findContours(
                binary_mask,
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE,
            )

            polygons = []
            for contour in contours:
                if len(contour) < 3:
                    continue

                # Simplify contour to reduce points
                epsilon = 0.01 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)

                if len(approx) < 3:
                    continue

                # Flatten to [x1, y1, x2, y2, ...]
                polygon = []
                for point in approx:
                    polygon.extend([float(point[0][0]), float(point[0][1])])
                polygons.append(polygon)

            return polygons

        except ImportError:
            logger.warning("OpenCV not available, using simplified extraction")
            return self._simple_polygon(binary_mask)

    def _simple_polygon(
        self,
        binary_mask: np.ndarray,
    ) -> List[List[float]]:
        """Simple bounding box polygon without OpenCV."""
        rows, cols = np.where(binary_mask > 0)
        if len(rows) == 0:
            return []

        min_row, max_row = rows.min(), rows.max()
        min_col, max_col = cols.min(), cols.max()

        polygon = [
            float(min_col), float(min_row),
            float(max_col), float(min_row),
            float(max_col), float(max_row),
            float(min_col), float(max_row),
        ]
        return [polygon]

    def _normalize_polygon(
        self,
        polygon: List[float],
        img_width: int,
        img_height: int,
    ) -> List[float]:
        """Normalize polygon coordinates to [0, 1]."""
        normalized = []
        for i in range(0, len(polygon), 2):
            x = polygon[i] / img_width
            y = polygon[i + 1] / img_height
            normalized.extend([x, y])
        return normalized

    def _get_bbox_yolo(
        self,
        binary_mask: np.ndarray,
        img_width: int,
        img_height: int,
    ) -> Optional[Tuple[float, float, float, float]]:
        """
        Get YOLO format bounding box (normalized center + dimensions).

        Returns:
            Tuple of (x_center, y_center, width, height) normalized to [0, 1]
        """
        rows, cols = np.where(binary_mask > 0)
        if len(rows) == 0:
            return None

        min_row, max_row = rows.min(), rows.max()
        min_col, max_col = cols.min(), cols.max()

        # Calculate center and dimensions
        box_width = (max_col - min_col + 1) / img_width
        box_height = (max_row - min_row + 1) / img_height
        x_center = (min_col + (max_col - min_col) / 2) / img_width
        y_center = (min_row + (max_row - min_row) / 2) / img_height

        return (x_center, y_center, box_width, box_height)

    def _copy_image(
        self,
        src_path: str,
        dst_path: Path,
        image_format: str,
    ):
        """Copy or convert image to destination."""
        try:
            if src_path.endswith((".nii", ".nii.gz")):
                # Convert medical images to standard format
                import nibabel as nib
                from PIL import Image

                nii = nib.load(src_path)
                data = nii.get_fdata()
                if data.ndim > 2:
                    # Take middle slice
                    mid_slice = data.shape[2] // 2
                    data = data[:, :, mid_slice]

                # Normalize to 0-255
                data = ((data - data.min()) / (data.max() - data.min() + 1e-8) * 255).astype(np.uint8)
                img = Image.fromarray(data)
                img.save(dst_path)
            else:
                # Direct copy for standard images
                if src_path.lower().endswith(f".{image_format}"):
                    shutil.copy2(src_path, dst_path)
                else:
                    from PIL import Image
                    img = Image.open(src_path)
                    img.save(dst_path)

        except Exception as e:
            logger.error(f"Failed to copy image {src_path}: {e}")

    @staticmethod
    def create_classes_file(
        categories: List[Dict[str, Any]],
        output_path: str,
    ) -> str:
        """
        Create classes.txt file for YOLO.

        Args:
            categories: List of category definitions
            output_path: Path for output file

        Returns:
            Path to created file
        """
        class_names = [cat.get("name", f"class_{i}") for i, cat in enumerate(categories)]

        with open(output_path, "w") as f:
            f.write("\n".join(class_names))

        return output_path
