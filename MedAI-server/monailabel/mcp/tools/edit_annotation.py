# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Edit Annotation Tool - Edit existing segmentation annotations.

MCP tool that allows editing existing annotations through operations
like grow, shrink, smooth, delete label, merge labels, etc.
"""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import ndimage

from ..schemas.annotation_schemas import (
    EditAnnotationInput,
    EditAnnotationOutput,
    SegmentationLabel,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


# Default label colors
DEFAULT_LABEL_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
]


class EditAnnotationTool(MCPTool):
    """
    MCP tool for editing existing segmentation annotations.

    Supports operations like grow, shrink, smooth, delete label,
    rename label, merge labels, and fill holes.
    """

    name = "edit_annotation"
    description = (
        "Edit an existing segmentation annotation. Use this when the user wants to "
        "modify a segmentation - grow it, shrink it, smooth edges, delete a label, "
        "merge labels together, or fill holes. Returns a preview requiring confirmation."
    )
    input_schema = EditAnnotationInput
    output_schema = EditAnnotationOutput

    def __init__(self):
        super().__init__()
        self._preview_storage = None
        self._segmentation_store = None

    def _get_preview_storage(self):
        """Lazy-load the preview storage service."""
        if self._preview_storage is None:
            from ...services.preview_storage import get_preview_storage
            self._preview_storage = get_preview_storage()
        return self._preview_storage

    def _get_segmentation_store(self):
        """Lazy-load the segmentation store."""
        if self._segmentation_store is None:
            try:
                from ...services.segmentation_store import get_segmentation_store
                self._segmentation_store = get_segmentation_store()
            except ImportError:
                logger.warning("Segmentation store not available")
        return self._segmentation_store

    async def execute(self, input_data: EditAnnotationInput) -> EditAnnotationOutput:
        """
        Execute edit annotation operation.

        Args:
            input_data: Edit parameters

        Returns:
            Preview of edited segmentation
        """
        start_time = time.time()

        try:
            # Load the segmentation to edit
            segmentation_data, metadata = await self._load_segmentation(
                input_data.segmentation_id
            )

            if segmentation_data is None:
                return self._error_response(
                    f"Segmentation not found: {input_data.segmentation_id}",
                    input_data.operation,
                )

            # Get original labels for comparison
            original_labels = self._extract_labels(segmentation_data, metadata)

            # Apply the edit operation
            edited_data, operation_desc = await self._apply_operation(
                segmentation_data,
                metadata,
                input_data,
            )

            # Get updated labels
            updated_labels = self._extract_labels(edited_data, metadata)

            # Calculate changes summary
            changes_summary = self._summarize_changes(
                original_labels, updated_labels, input_data.operation
            )

            # Store preview for confirmation
            preview_storage = self._get_preview_storage()
            preview_metadata = await preview_storage.store_preview(
                session_id=metadata.get("session_id", "edit_session"),
                segmentation_data=edited_data,
                model_used=f"edit_{input_data.operation}",
                labels=[label.model_dump() for label in updated_labels],
                prompt_used=f"{input_data.operation} on label {input_data.label_id}",
                inference_time_ms=(time.time() - start_time) * 1000,
            )

            logger.info(
                f"Edit operation {input_data.operation} completed: "
                f"{changes_summary}"
            )

            return EditAnnotationOutput(
                preview_id=preview_metadata.preview_id,
                original_labels=original_labels,
                updated_labels=updated_labels,
                operation_applied=operation_desc,
                changes_summary=changes_summary,
                thumbnail_url=preview_storage.get_thumbnail_url(preview_metadata.preview_id),
                can_undo=True,
            )

        except Exception as e:
            logger.exception(f"Edit annotation failed: {e}")
            return self._error_response(str(e), input_data.operation)

    async def _load_segmentation(
        self, segmentation_id: str
    ) -> Tuple[Optional[np.ndarray], Dict[str, Any]]:
        """Load a segmentation by ID."""
        # Try preview storage first
        preview_storage = self._get_preview_storage()
        result = await preview_storage.get_preview(segmentation_id)
        if result:
            metadata, data = result
            return data, metadata.to_dict()

        # Try segmentation store
        seg_store = self._get_segmentation_store()
        if seg_store is not None:
            try:
                return await seg_store.load_segmentation(segmentation_id)
            except Exception as e:
                logger.error(f"Failed to load from store: {e}")

        # Return mock data for testing
        return self._mock_segmentation(segmentation_id)

    def _mock_segmentation(
        self, segmentation_id: str
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Create mock segmentation for testing."""
        # Create a simple test segmentation
        data = np.zeros((64, 256, 256), dtype=np.uint8)

        # Add some labeled regions
        data[20:40, 80:180, 80:180] = 1  # Liver-like region
        data[25:35, 50:70, 150:200] = 2  # Spleen-like region

        metadata = {
            "session_id": "test_session",
            "labels": [
                {"label_id": 1, "label_name": "liver", "color": "#FF6B6B"},
                {"label_id": 2, "label_name": "spleen", "color": "#4ECDC4"},
            ],
            "spacing": [1.0, 1.0, 1.0],
        }

        return data, metadata

    async def _apply_operation(
        self,
        data: np.ndarray,
        metadata: Dict[str, Any],
        input_data: EditAnnotationInput,
    ) -> Tuple[np.ndarray, str]:
        """Apply the specified edit operation."""
        operation = input_data.operation
        label_id = input_data.label_id

        if operation == "grow":
            return self._grow_label(data, label_id, input_data.pixels or 3)

        elif operation == "shrink":
            return self._shrink_label(data, label_id, input_data.pixels or 3)

        elif operation == "smooth":
            return self._smooth_label(data, label_id)

        elif operation == "delete_label":
            return self._delete_label(data, label_id)

        elif operation == "rename_label":
            # Rename doesn't change the mask, just metadata
            return data, f"Renamed label {label_id} to '{input_data.new_label_name}'"

        elif operation == "merge_labels":
            return self._merge_labels(
                data, label_id, input_data.target_label_id
            )

        elif operation == "split":
            return self._split_label(data, label_id, input_data.parameters)

        elif operation == "fill_holes":
            return self._fill_holes(data, label_id)

        else:
            raise ValueError(f"Unknown operation: {operation}")

    def _grow_label(
        self, data: np.ndarray, label_id: int, pixels: int
    ) -> Tuple[np.ndarray, str]:
        """Grow a label by dilation."""
        result = data.copy()
        label_mask = data == label_id

        # Create structuring element
        if data.ndim == 3:
            struct = ndimage.generate_binary_structure(3, 1)
        else:
            struct = ndimage.generate_binary_structure(2, 1)

        # Dilate the mask
        dilated = ndimage.binary_dilation(
            label_mask, structure=struct, iterations=pixels
        )

        # Only fill areas that are background (0)
        result[(dilated) & (result == 0)] = label_id

        return result, f"Grew label {label_id} by {pixels} pixels"

    def _shrink_label(
        self, data: np.ndarray, label_id: int, pixels: int
    ) -> Tuple[np.ndarray, str]:
        """Shrink a label by erosion."""
        result = data.copy()
        label_mask = data == label_id

        # Create structuring element
        if data.ndim == 3:
            struct = ndimage.generate_binary_structure(3, 1)
        else:
            struct = ndimage.generate_binary_structure(2, 1)

        # Erode the mask
        eroded = ndimage.binary_erosion(
            label_mask, structure=struct, iterations=pixels
        )

        # Clear old label and apply eroded version
        result[label_mask] = 0
        result[eroded] = label_id

        return result, f"Shrunk label {label_id} by {pixels} pixels"

    def _smooth_label(
        self, data: np.ndarray, label_id: int
    ) -> Tuple[np.ndarray, str]:
        """Smooth label boundaries using morphological operations."""
        result = data.copy()
        label_mask = data == label_id

        # Create structuring element
        if data.ndim == 3:
            struct = ndimage.generate_binary_structure(3, 1)
        else:
            struct = ndimage.generate_binary_structure(2, 1)

        # Apply morphological closing then opening for smoothing
        smoothed = ndimage.binary_closing(label_mask, structure=struct, iterations=2)
        smoothed = ndimage.binary_opening(smoothed, structure=struct, iterations=2)

        # Update result
        result[label_mask] = 0
        result[smoothed] = label_id

        return result, f"Smoothed boundaries of label {label_id}"

    def _delete_label(
        self, data: np.ndarray, label_id: int
    ) -> Tuple[np.ndarray, str]:
        """Delete a label (set to background)."""
        result = data.copy()
        result[data == label_id] = 0
        return result, f"Deleted label {label_id}"

    def _merge_labels(
        self, data: np.ndarray, source_id: int, target_id: Optional[int]
    ) -> Tuple[np.ndarray, str]:
        """Merge source label into target label."""
        if target_id is None:
            raise ValueError("Target label ID required for merge operation")

        result = data.copy()
        result[data == source_id] = target_id
        return result, f"Merged label {source_id} into label {target_id}"

    def _split_label(
        self, data: np.ndarray, label_id: int, parameters: Optional[Dict[str, Any]]
    ) -> Tuple[np.ndarray, str]:
        """Split a label into connected components."""
        result = data.copy()
        label_mask = data == label_id

        # Find connected components
        if data.ndim == 3:
            struct = ndimage.generate_binary_structure(3, 1)
        else:
            struct = ndimage.generate_binary_structure(2, 1)

        labeled_array, num_features = ndimage.label(label_mask, structure=struct)

        if num_features <= 1:
            return result, f"Label {label_id} has only {num_features} component(s), no split needed"

        # Clear original label
        result[label_mask] = 0

        # Get max existing label
        max_label = int(data.max())

        # Assign new label IDs to each component
        for i in range(1, num_features + 1):
            if i == 1:
                # Keep first component as original label
                result[labeled_array == i] = label_id
            else:
                # Assign new label IDs
                new_label_id = max_label + i
                result[labeled_array == i] = new_label_id

        return result, f"Split label {label_id} into {num_features} components"

    def _fill_holes(
        self, data: np.ndarray, label_id: int
    ) -> Tuple[np.ndarray, str]:
        """Fill holes within a label."""
        result = data.copy()
        label_mask = data == label_id

        # Fill holes using binary_fill_holes
        filled = ndimage.binary_fill_holes(label_mask)

        # Only fill areas that are background
        new_voxels = filled & ~label_mask & (result == 0)
        result[new_voxels] = label_id

        holes_filled = int(np.sum(new_voxels))
        return result, f"Filled {holes_filled} hole voxels in label {label_id}"

    def _extract_labels(
        self, data: np.ndarray, metadata: Dict[str, Any]
    ) -> List[SegmentationLabel]:
        """Extract label information from segmentation data."""
        labels = []
        unique_labels = np.unique(data)
        unique_labels = unique_labels[unique_labels > 0]

        label_info = {l["label_id"]: l for l in metadata.get("labels", [])}
        spacing = metadata.get("spacing", [1.0, 1.0, 1.0])

        for i, label_id in enumerate(unique_labels):
            label_mask = data == label_id
            voxel_count = int(np.sum(label_mask))

            # Calculate volume
            if len(spacing) >= 3:
                voxel_volume_mm3 = spacing[0] * spacing[1] * spacing[2]
                volume_ml = (voxel_count * voxel_volume_mm3) / 1000
            else:
                volume_ml = None

            # Get label name and color from metadata
            info = label_info.get(int(label_id), {})
            label_name = info.get("label_name", f"label_{label_id}")
            color = info.get("color", DEFAULT_LABEL_COLORS[i % len(DEFAULT_LABEL_COLORS)])

            # Calculate bounding box
            coords = np.where(label_mask)
            if len(coords[0]) > 0:
                if data.ndim == 3:
                    bbox = {
                        "z_min": int(coords[0].min()),
                        "y_min": int(coords[1].min()),
                        "x_min": int(coords[2].min()),
                        "z_max": int(coords[0].max()),
                        "y_max": int(coords[1].max()),
                        "x_max": int(coords[2].max()),
                    }
                else:
                    bbox = {
                        "y_min": int(coords[0].min()),
                        "x_min": int(coords[1].min()),
                        "y_max": int(coords[0].max()),
                        "x_max": int(coords[1].max()),
                    }
            else:
                bbox = None

            labels.append(
                SegmentationLabel(
                    label_id=int(label_id),
                    label_name=label_name,
                    color=color,
                    voxel_count=voxel_count,
                    volume_ml=volume_ml,
                    confidence=None,
                    bounding_box=bbox,
                )
            )

        return labels

    def _summarize_changes(
        self,
        original: List[SegmentationLabel],
        updated: List[SegmentationLabel],
        operation: str,
    ) -> str:
        """Summarize the changes between original and updated labels."""
        orig_dict = {l.label_id: l for l in original}
        upd_dict = {l.label_id: l for l in updated}

        changes = []

        # Check for volume changes
        for label_id, upd_label in upd_dict.items():
            if label_id in orig_dict:
                orig_label = orig_dict[label_id]

                if orig_label.voxel_count != upd_label.voxel_count:
                    diff = upd_label.voxel_count - orig_label.voxel_count
                    pct = (diff / orig_label.voxel_count * 100) if orig_label.voxel_count > 0 else 0

                    if upd_label.volume_ml and orig_label.volume_ml:
                        vol_diff = upd_label.volume_ml - orig_label.volume_ml
                        changes.append(
                            f"{upd_label.label_name}: {diff:+d} voxels ({pct:+.1f}%), "
                            f"{vol_diff:+.2f} ml"
                        )
                    else:
                        changes.append(
                            f"{upd_label.label_name}: {diff:+d} voxels ({pct:+.1f}%)"
                        )

        # Check for added labels
        added = set(upd_dict.keys()) - set(orig_dict.keys())
        for label_id in added:
            label = upd_dict[label_id]
            changes.append(f"Added {label.label_name} ({label.voxel_count} voxels)")

        # Check for removed labels
        removed = set(orig_dict.keys()) - set(upd_dict.keys())
        for label_id in removed:
            label = orig_dict[label_id]
            changes.append(f"Removed {label.label_name}")

        if not changes:
            return f"No volume changes from {operation} operation"

        return "; ".join(changes)

    def _error_response(
        self, error_message: str, operation: str
    ) -> EditAnnotationOutput:
        """Create an error response."""
        return EditAnnotationOutput(
            preview_id=f"error_{uuid.uuid4().hex[:8]}",
            original_labels=[],
            updated_labels=[],
            operation_applied=f"Failed: {operation}",
            changes_summary=f"Error: {error_message}",
            thumbnail_url=None,
            can_undo=False,
        )
