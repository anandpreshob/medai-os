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
COCO Format Exporter

Exports segmentation masks to COCO JSON format for object detection and
instance segmentation tasks. Supports both polygon and RLE mask representations.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)


class COCOExporter:
    """
    Export segmentation data to COCO JSON format.

    The COCO format includes:
    - info: Dataset metadata
    - licenses: License information
    - images: List of images with dimensions
    - categories: List of category definitions
    - annotations: List of annotations with segmentation data

    Supports:
    - Polygon representation (default)
    - RLE (Run-Length Encoding) mask representation
    - Multi-class segmentation
    - Instance segmentation
    """

    def __init__(
        self,
        description: str = "Medical Image Annotation Export",
        version: str = "1.0",
        contributor: str = "MedAI",
        use_rle: bool = False,
    ):
        """
        Initialize COCO exporter.

        Args:
            description: Dataset description
            version: Dataset version
            contributor: Dataset contributor
            use_rle: Use RLE encoding instead of polygons
        """
        self.description = description
        self.version = version
        self.contributor = contributor
        self.use_rle = use_rle

    def export(
        self,
        results: List[Dict[str, Any]],
        categories: List[Dict[str, Any]],
        output_path: str,
        image_dir: Optional[str] = None,
    ) -> str:
        """
        Export results to COCO format.

        Args:
            results: List of result dictionaries with keys:
                - file_path: Path to original image
                - mask_path: Path to segmentation mask
                - labels: List of labels found
                - image_width: Image width (optional)
                - image_height: Image height (optional)
            categories: List of category definitions with keys:
                - id: Category ID (integer)
                - name: Category name
                - supercategory: Parent category (optional)
            output_path: Path to save the COCO JSON file
            image_dir: Optional directory containing images (for relative paths)

        Returns:
            Path to exported JSON file
        """
        coco_data = self._create_coco_structure(categories)
        annotation_id = 1

        for idx, result in enumerate(results):
            image_id = idx + 1
            file_path = result.get("file_path", "")
            mask_path = result.get("mask_path")

            # Get image dimensions
            width = result.get("image_width")
            height = result.get("image_height")

            if mask_path and os.path.exists(mask_path):
                # Load mask and get dimensions
                mask, img_width, img_height = self._load_mask(mask_path)
                width = width or img_width
                height = height or img_height
            else:
                mask = None
                width = width or 512
                height = height or 512

            # Add image entry
            file_name = os.path.basename(file_path)
            if image_dir:
                file_name = os.path.relpath(file_path, image_dir)

            coco_data["images"].append({
                "id": image_id,
                "file_name": file_name,
                "width": width,
                "height": height,
                "date_captured": datetime.now().isoformat(),
            })

            # Process mask and create annotations
            if mask is not None:
                annotations, annotation_id = self._mask_to_annotations(
                    mask=mask,
                    image_id=image_id,
                    annotation_id=annotation_id,
                    categories=categories,
                    labels=result.get("labels", []),
                )
                coco_data["annotations"].extend(annotations)

        # Write to file
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(coco_data, f, indent=2)

        logger.info(f"Exported COCO annotations to {output_path}")
        return output_path

    def _create_coco_structure(
        self,
        categories: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Create base COCO data structure."""
        return {
            "info": {
                "description": self.description,
                "version": self.version,
                "year": datetime.now().year,
                "contributor": self.contributor,
                "date_created": datetime.now().isoformat(),
            },
            "licenses": [
                {
                    "id": 1,
                    "name": "Internal Use",
                    "url": "",
                }
            ],
            "images": [],
            "categories": [
                {
                    "id": cat.get("id", idx + 1),
                    "name": cat.get("name", f"category_{idx + 1}"),
                    "supercategory": cat.get("supercategory", "medical"),
                }
                for idx, cat in enumerate(categories)
            ],
            "annotations": [],
        }

    def _load_mask(
        self,
        mask_path: str,
    ) -> Tuple[Optional[np.ndarray], int, int]:
        """
        Load mask from file.

        Args:
            mask_path: Path to mask file

        Returns:
            Tuple of (mask array, width, height)
        """
        try:
            # Support different mask formats
            if mask_path.endswith((".nii", ".nii.gz")):
                import nibabel as nib
                nii = nib.load(mask_path)
                mask = nii.get_fdata().astype(np.int32)
                if mask.ndim > 2:
                    # Take max projection for 3D masks
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

    def _mask_to_annotations(
        self,
        mask: np.ndarray,
        image_id: int,
        annotation_id: int,
        categories: List[Dict[str, Any]],
        labels: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Convert mask to COCO annotations.

        Args:
            mask: Numpy array with segment labels
            image_id: Image ID
            annotation_id: Starting annotation ID
            categories: Category definitions
            labels: Labels detected in this image

        Returns:
            Tuple of (annotations list, next annotation ID)
        """
        annotations = []
        unique_labels = np.unique(mask)

        # Create label to category mapping
        label_to_cat = {}
        for cat in categories:
            cat_name = cat.get("name", "")
            cat_id = cat.get("id", 1)
            label_to_cat[cat_name.lower()] = cat_id
            # Also map by category ID for numeric masks
            label_to_cat[cat_id] = cat_id

        for label_val in unique_labels:
            if label_val == 0:  # Skip background
                continue

            binary_mask = (mask == label_val).astype(np.uint8)

            # Determine category ID
            category_id = int(label_val)
            if labels and label_val <= len(labels):
                label_name = labels[int(label_val) - 1]
                category_id = label_to_cat.get(label_name.lower(), int(label_val))

            # Get segmentation data
            if self.use_rle:
                segmentation = self._mask_to_rle(binary_mask)
            else:
                segmentation = self._mask_to_polygons(binary_mask)
                if not segmentation:
                    continue

            # Calculate bounding box
            bbox = self._get_bbox(binary_mask)
            area = float(np.sum(binary_mask))

            annotation = {
                "id": annotation_id,
                "image_id": image_id,
                "category_id": category_id,
                "segmentation": segmentation,
                "area": area,
                "bbox": bbox,
                "iscrowd": 0 if not self.use_rle else 1,
            }

            annotations.append(annotation)
            annotation_id += 1

        return annotations, annotation_id

    def _mask_to_polygons(
        self,
        binary_mask: np.ndarray,
    ) -> List[List[float]]:
        """
        Convert binary mask to polygon coordinates.

        Args:
            binary_mask: Binary mask (0/1)

        Returns:
            List of polygons (each polygon is [x1, y1, x2, y2, ...])
        """
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
                # Flatten contour to [x1, y1, x2, y2, ...]
                polygon = contour.flatten().tolist()
                if len(polygon) >= 6:  # At least 3 points
                    polygons.append(polygon)

            return polygons

        except ImportError:
            logger.warning("OpenCV not available, using simplified polygon extraction")
            return self._simple_polygon_extraction(binary_mask)

    def _simple_polygon_extraction(
        self,
        binary_mask: np.ndarray,
    ) -> List[List[float]]:
        """Simplified polygon extraction without OpenCV."""
        # Find bounding box and use it as a simple polygon
        rows, cols = np.where(binary_mask > 0)
        if len(rows) == 0:
            return []

        min_row, max_row = rows.min(), rows.max()
        min_col, max_col = cols.min(), cols.max()

        # Create rectangle polygon
        polygon = [
            float(min_col), float(min_row),
            float(max_col), float(min_row),
            float(max_col), float(max_row),
            float(min_col), float(max_row),
        ]
        return [polygon]

    def _mask_to_rle(
        self,
        binary_mask: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Convert binary mask to RLE (Run-Length Encoding).

        Args:
            binary_mask: Binary mask (0/1)

        Returns:
            RLE dictionary with 'counts' and 'size'
        """
        # Flatten in column-major (Fortran) order as per COCO spec
        flat_mask = binary_mask.flatten(order='F')

        # Find runs
        runs = []
        prev = 0
        count = 0

        for val in flat_mask:
            if val != prev:
                runs.append(count)
                count = 0
                prev = val
            count += 1
        runs.append(count)

        # If mask starts with 1, prepend a 0
        if binary_mask.flat[0] == 1:
            runs = [0] + runs

        return {
            "counts": runs,
            "size": list(binary_mask.shape),
        }

    def _get_bbox(
        self,
        binary_mask: np.ndarray,
    ) -> List[float]:
        """
        Get bounding box from binary mask.

        Args:
            binary_mask: Binary mask (0/1)

        Returns:
            Bounding box [x, y, width, height]
        """
        rows, cols = np.where(binary_mask > 0)
        if len(rows) == 0:
            return [0.0, 0.0, 0.0, 0.0]

        min_row, max_row = float(rows.min()), float(rows.max())
        min_col, max_col = float(cols.min()), float(cols.max())

        return [
            min_col,
            min_row,
            max_col - min_col + 1,
            max_row - min_row + 1,
        ]

    @staticmethod
    def merge_coco_files(
        files: List[str],
        output_path: str,
    ) -> str:
        """
        Merge multiple COCO JSON files.

        Args:
            files: List of COCO JSON file paths
            output_path: Path for merged output

        Returns:
            Path to merged file
        """
        merged = {
            "info": {},
            "licenses": [],
            "images": [],
            "categories": [],
            "annotations": [],
        }

        image_id_offset = 0
        annotation_id_offset = 0
        seen_categories = {}

        for file_path in files:
            with open(file_path, "r") as f:
                data = json.load(f)

            if not merged["info"]:
                merged["info"] = data.get("info", {})
                merged["licenses"] = data.get("licenses", [])

            # Add categories (avoid duplicates)
            for cat in data.get("categories", []):
                cat_key = (cat.get("id"), cat.get("name"))
                if cat_key not in seen_categories:
                    seen_categories[cat_key] = cat["id"]
                    merged["categories"].append(cat)

            # Add images with offset IDs
            id_mapping = {}
            for img in data.get("images", []):
                old_id = img["id"]
                new_id = old_id + image_id_offset
                id_mapping[old_id] = new_id
                img["id"] = new_id
                merged["images"].append(img)

            # Add annotations with offset IDs
            for ann in data.get("annotations", []):
                ann["id"] = ann["id"] + annotation_id_offset
                ann["image_id"] = id_mapping.get(ann["image_id"], ann["image_id"])
                merged["annotations"].append(ann)

            # Update offsets
            if data.get("images"):
                image_id_offset = max(img["id"] for img in merged["images"])
            if data.get("annotations"):
                annotation_id_offset = max(ann["id"] for ann in merged["annotations"])

        with open(output_path, "w") as f:
            json.dump(merged, f, indent=2)

        return output_path
