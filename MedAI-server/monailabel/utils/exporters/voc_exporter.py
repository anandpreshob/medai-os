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
Pascal VOC Format Exporter

Exports segmentation masks to Pascal VOC XML annotation format.
Generates:
- XML annotation files with bounding boxes and object info
- Segmentation masks as PNG files
- ImageSets for train/val splits
"""

import logging
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET
from xml.dom import minidom

import numpy as np

logger = logging.getLogger(__name__)


class VOCExporter:
    """
    Export segmentation data to Pascal VOC format.

    VOC format includes:
    - Annotations/: XML files with object bounding boxes
    - SegmentationClass/: PNG masks with class colors
    - SegmentationObject/: PNG masks with instance colors
    - ImageSets/Segmentation/: train.txt, val.txt splits

    Supports:
    - Bounding box annotations
    - Segmentation masks
    - Multi-class labels
    - Train/val splits
    """

    # Default VOC color palette (21 classes including background)
    VOC_PALETTE = [
        [0, 0, 0],        # 0: background
        [128, 0, 0],      # 1: class 1
        [0, 128, 0],      # 2: class 2
        [128, 128, 0],    # 3: class 3
        [0, 0, 128],      # 4: class 4
        [128, 0, 128],    # 5: class 5
        [0, 128, 128],    # 6: class 6
        [128, 128, 128],  # 7: class 7
        [64, 0, 0],       # 8: class 8
        [192, 0, 0],      # 9: class 9
        [64, 128, 0],     # 10: class 10
        [192, 128, 0],    # 11: class 11
        [64, 0, 128],     # 12: class 12
        [192, 0, 128],    # 13: class 13
        [64, 128, 128],   # 14: class 14
        [192, 128, 128],  # 15: class 15
        [0, 64, 0],       # 16: class 16
        [128, 64, 0],     # 17: class 17
        [0, 192, 0],      # 18: class 18
        [128, 192, 0],    # 19: class 19
        [0, 64, 128],     # 20: class 20
    ]

    def __init__(
        self,
        database_name: str = "MedAI",
        annotation_source: str = "MedAI Batch Export",
    ):
        """
        Initialize VOC exporter.

        Args:
            database_name: Name of the database for XML
            annotation_source: Source annotation tool name
        """
        self.database_name = database_name
        self.annotation_source = annotation_source

    def export(
        self,
        results: List[Dict[str, Any]],
        categories: List[Dict[str, Any]],
        output_dir: str,
        train_split: float = 0.8,
        include_segmentation: bool = True,
        include_detection: bool = True,
    ) -> str:
        """
        Export results to Pascal VOC format.

        Args:
            results: List of result dictionaries with keys:
                - file_path: Path to original image
                - mask_path: Path to segmentation mask
                - labels: List of labels found
                - image_width: Image width
                - image_height: Image height
            categories: List of category definitions
            output_dir: Output directory
            train_split: Fraction for training set
            include_segmentation: Export segmentation masks
            include_detection: Export detection annotations

        Returns:
            Path to output directory
        """
        output_path = Path(output_dir)

        # Create VOC directory structure
        dirs = {
            "annotations": output_path / "Annotations",
            "jpeg_images": output_path / "JPEGImages",
            "seg_class": output_path / "SegmentationClass",
            "seg_object": output_path / "SegmentationObject",
            "imagesets_seg": output_path / "ImageSets" / "Segmentation",
            "imagesets_main": output_path / "ImageSets" / "Main",
        }

        for dir_path in dirs.values():
            dir_path.mkdir(parents=True, exist_ok=True)

        # Create label map
        self._write_labelmap(output_path, categories)

        # Process results and track splits
        train_ids = []
        val_ids = []

        indices = list(range(len(results)))
        random.shuffle(indices)
        split_idx = int(len(indices) * train_split)
        train_indices = set(indices[:split_idx])

        for idx, result in enumerate(results):
            file_path = result.get("file_path", "")
            mask_path = result.get("mask_path")

            if not file_path:
                continue

            base_name = Path(file_path).stem
            is_train = idx in train_indices

            # Add to split lists
            if is_train:
                train_ids.append(base_name)
            else:
                val_ids.append(base_name)

            # Load mask if available
            mask = None
            if mask_path and os.path.exists(mask_path):
                mask, img_width, img_height = self._load_mask(mask_path)
            else:
                img_width = result.get("image_width", 512)
                img_height = result.get("image_height", 512)

            # Override with provided dimensions
            img_width = result.get("image_width", img_width)
            img_height = result.get("image_height", img_height)

            # Write detection annotation XML
            if include_detection:
                xml_path = dirs["annotations"] / f"{base_name}.xml"
                self._write_annotation_xml(
                    xml_path=xml_path,
                    file_name=os.path.basename(file_path),
                    img_width=img_width,
                    img_height=img_height,
                    mask=mask,
                    categories=categories,
                )

            # Write segmentation masks
            if include_segmentation and mask is not None:
                # Class segmentation mask
                class_mask_path = dirs["seg_class"] / f"{base_name}.png"
                self._write_segmentation_mask(
                    mask=mask,
                    output_path=class_mask_path,
                    categories=categories,
                    instance_mask=False,
                )

                # Instance segmentation mask
                obj_mask_path = dirs["seg_object"] / f"{base_name}.png"
                self._write_segmentation_mask(
                    mask=mask,
                    output_path=obj_mask_path,
                    categories=categories,
                    instance_mask=True,
                )

        # Write ImageSets
        self._write_imageset(dirs["imagesets_seg"] / "train.txt", train_ids)
        self._write_imageset(dirs["imagesets_seg"] / "val.txt", val_ids)
        self._write_imageset(dirs["imagesets_seg"] / "trainval.txt", train_ids + val_ids)
        self._write_imageset(dirs["imagesets_main"] / "train.txt", train_ids)
        self._write_imageset(dirs["imagesets_main"] / "val.txt", val_ids)
        self._write_imageset(dirs["imagesets_main"] / "trainval.txt", train_ids + val_ids)

        logger.info(f"Exported VOC dataset to {output_dir}")
        logger.info(f"  Train: {len(train_ids)}, Val: {len(val_ids)}")
        return str(output_path)

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

    def _write_annotation_xml(
        self,
        xml_path: Path,
        file_name: str,
        img_width: int,
        img_height: int,
        mask: Optional[np.ndarray],
        categories: List[Dict[str, Any]],
    ):
        """Write VOC XML annotation file."""
        root = ET.Element("annotation")

        # Add folder
        ET.SubElement(root, "folder").text = "JPEGImages"

        # Add filename
        ET.SubElement(root, "filename").text = file_name

        # Add source
        source = ET.SubElement(root, "source")
        ET.SubElement(source, "database").text = self.database_name
        ET.SubElement(source, "annotation").text = self.annotation_source
        ET.SubElement(source, "image").text = "MedAI"

        # Add size
        size = ET.SubElement(root, "size")
        ET.SubElement(size, "width").text = str(img_width)
        ET.SubElement(size, "height").text = str(img_height)
        ET.SubElement(size, "depth").text = "1"

        # Add segmented flag
        ET.SubElement(root, "segmented").text = "1" if mask is not None else "0"

        # Add objects from mask
        if mask is not None:
            objects = self._extract_objects(mask, categories)
            for obj in objects:
                obj_elem = ET.SubElement(root, "object")
                ET.SubElement(obj_elem, "name").text = obj["name"]
                ET.SubElement(obj_elem, "pose").text = "Unspecified"
                ET.SubElement(obj_elem, "truncated").text = "0"
                ET.SubElement(obj_elem, "difficult").text = "0"

                bndbox = ET.SubElement(obj_elem, "bndbox")
                ET.SubElement(bndbox, "xmin").text = str(obj["xmin"])
                ET.SubElement(bndbox, "ymin").text = str(obj["ymin"])
                ET.SubElement(bndbox, "xmax").text = str(obj["xmax"])
                ET.SubElement(bndbox, "ymax").text = str(obj["ymax"])

        # Write formatted XML
        xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
        with open(xml_path, "w") as f:
            f.write(xml_str)

    def _extract_objects(
        self,
        mask: np.ndarray,
        categories: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Extract objects with bounding boxes from mask."""
        objects = []
        unique_labels = np.unique(mask)

        for label_val in unique_labels:
            if label_val == 0:  # Skip background
                continue

            binary_mask = (mask == label_val)
            rows, cols = np.where(binary_mask)

            if len(rows) == 0:
                continue

            # Get bounding box
            ymin, ymax = int(rows.min()), int(rows.max())
            xmin, xmax = int(cols.min()), int(cols.max())

            # Get class name
            class_idx = int(label_val) - 1
            if 0 <= class_idx < len(categories):
                class_name = categories[class_idx].get("name", f"class_{label_val}")
            else:
                class_name = f"class_{label_val}"

            objects.append({
                "name": class_name,
                "xmin": xmin,
                "ymin": ymin,
                "xmax": xmax,
                "ymax": ymax,
            })

        return objects

    def _write_segmentation_mask(
        self,
        mask: np.ndarray,
        output_path: Path,
        categories: List[Dict[str, Any]],
        instance_mask: bool = False,
    ):
        """Write segmentation mask as PNG."""
        try:
            from PIL import Image

            height, width = mask.shape[:2]

            # Create color mask
            color_mask = np.zeros((height, width, 3), dtype=np.uint8)

            if instance_mask:
                # Instance mask: each connected component gets unique color
                instance_id = 0
                for label_val in np.unique(mask):
                    if label_val == 0:
                        continue

                    binary_mask = (mask == label_val).astype(np.uint8)

                    # Find connected components
                    try:
                        import cv2
                        num_labels, labels = cv2.connectedComponents(binary_mask)

                        for comp_id in range(1, num_labels):
                            instance_id += 1
                            color_idx = instance_id % len(self.VOC_PALETTE)
                            color = self.VOC_PALETTE[color_idx]
                            color_mask[labels == comp_id] = color
                    except ImportError:
                        # Without OpenCV, use label directly
                        instance_id += 1
                        color_idx = instance_id % len(self.VOC_PALETTE)
                        color = self.VOC_PALETTE[color_idx]
                        color_mask[binary_mask > 0] = color
            else:
                # Class mask: each class gets fixed color
                for label_val in np.unique(mask):
                    if label_val == 0:
                        continue

                    color_idx = int(label_val) % len(self.VOC_PALETTE)
                    if color_idx == 0:
                        color_idx = 1  # Avoid background color
                    color = self.VOC_PALETTE[color_idx]
                    color_mask[mask == label_val] = color

            # Save as PNG with palette
            img = Image.fromarray(color_mask, mode='RGB')
            img.save(output_path)

        except Exception as e:
            logger.error(f"Failed to write segmentation mask: {e}")

    def _write_labelmap(
        self,
        output_path: Path,
        categories: List[Dict[str, Any]],
    ):
        """Write labelmap.txt file."""
        labelmap_path = output_path / "labelmap.txt"

        with open(labelmap_path, "w") as f:
            f.write("# Label map for VOC dataset\n")
            f.write("# Format: label_id:label_name\n")
            f.write("0:background\n")

            for idx, cat in enumerate(categories):
                label_id = idx + 1
                label_name = cat.get("name", f"class_{label_id}")
                f.write(f"{label_id}:{label_name}\n")

    def _write_imageset(
        self,
        file_path: Path,
        image_ids: List[str],
    ):
        """Write ImageSet file with image IDs."""
        with open(file_path, "w") as f:
            f.write("\n".join(image_ids))
            if image_ids:
                f.write("\n")

    @staticmethod
    def get_voc_color(class_id: int) -> Tuple[int, int, int]:
        """
        Get VOC color for a class ID.

        Args:
            class_id: Class ID (1-indexed)

        Returns:
            RGB color tuple
        """
        if class_id < 0 or class_id >= len(VOCExporter.VOC_PALETTE):
            class_id = class_id % len(VOCExporter.VOC_PALETTE)
        return tuple(VOCExporter.VOC_PALETTE[class_id])
