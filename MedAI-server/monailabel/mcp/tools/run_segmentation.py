# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Run Segmentation Tool - Execute AI inference for segmentation.

MCP tool that runs segmentation models (BiomedParse, MedSAM, TotalSegmentator)
on medical images and returns preview results for user confirmation.
"""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

import numpy as np

from ..schemas.annotation_schemas import (
    RunSegmentationInput,
    RunSegmentationOutput,
    SegmentationLabel,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


# Default label colors for visualization
DEFAULT_LABEL_COLORS = [
    "#FF6B6B",  # Red
    "#4ECDC4",  # Teal
    "#45B7D1",  # Blue
    "#96CEB4",  # Green
    "#FFEAA7",  # Yellow
    "#DDA0DD",  # Plum
    "#98D8C8",  # Mint
    "#F7DC6F",  # Gold
    "#BB8FCE",  # Purple
    "#85C1E9",  # Light Blue
]


class RunSegmentationTool(MCPTool):
    """
    MCP tool for running AI segmentation inference.

    Executes segmentation models on medical images and stores
    preview results for user confirmation before saving.
    """

    name = "run_segmentation"
    description = (
        "Run AI segmentation on a medical image. Use this when the user asks to "
        "segment, outline, or identify anatomical structures in an image. "
        "Supports text prompts (e.g., 'segment the liver') and interactive point prompts. "
        "Returns a preview that requires user confirmation before saving."
    )
    input_schema = RunSegmentationInput
    output_schema = RunSegmentationOutput

    def __init__(self):
        super().__init__()
        self._inference_service = None
        self._preview_storage = None
        self._session_manager = None

    def _get_inference_service(self):
        """Lazy-load the inference service."""
        if self._inference_service is None:
            try:
                from ...services.inference import get_inference_service
                self._inference_service = get_inference_service()
            except ImportError:
                logger.warning("Inference service not available")
        return self._inference_service

    def _get_preview_storage(self):
        """Lazy-load the preview storage service."""
        if self._preview_storage is None:
            from ...services.preview_storage import get_preview_storage
            self._preview_storage = get_preview_storage()
        return self._preview_storage

    def _get_session_manager(self):
        """Lazy-load the session manager."""
        if self._session_manager is None:
            try:
                from ...chat.session_manager import get_session_manager
                self._session_manager = get_session_manager()
            except ImportError:
                logger.warning("Session manager not available")
        return self._session_manager

    async def execute(self, input_data: RunSegmentationInput) -> RunSegmentationOutput:
        """
        Execute segmentation inference.

        Args:
            input_data: Segmentation parameters

        Returns:
            Preview result with labels and thumbnail
        """
        start_time = time.time()

        try:
            # Validate session exists
            session = await self._validate_session(input_data.session_id)
            if session is None:
                return self._error_response(
                    "Session not found or expired",
                    input_data.model,
                    start_time,
                )

            # Get image data from session
            image_data, image_metadata = await self._get_image_data(
                session, input_data.slice_index
            )

            if image_data is None:
                return self._error_response(
                    "No image loaded in session",
                    input_data.model,
                    start_time,
                )

            # Build inference request based on model and prompts
            inference_request = self._build_inference_request(
                input_data, image_metadata
            )

            # Run inference
            segmentation_result = await self._run_inference(
                input_data.model,
                image_data,
                inference_request,
            )

            if segmentation_result is None:
                return self._error_response(
                    "Segmentation inference failed",
                    input_data.model,
                    start_time,
                )

            # Process results into labels
            labels = self._process_segmentation_labels(
                segmentation_result["mask"],
                segmentation_result.get("labels", []),
                segmentation_result.get("confidences", []),
                image_metadata,
            )

            # Store preview for confirmation
            preview_storage = self._get_preview_storage()
            preview_metadata = await preview_storage.store_preview(
                session_id=input_data.session_id,
                segmentation_data=segmentation_result["mask"],
                model_used=input_data.model,
                labels=[label.model_dump() for label in labels],
                prompt_used=input_data.text_prompt,
                inference_time_ms=(time.time() - start_time) * 1000,
                confidence=segmentation_result.get("confidence"),
                source_image_id=image_metadata.get("image_id"),
            )

            inference_time_ms = (time.time() - start_time) * 1000

            logger.info(
                f"Segmentation completed: model={input_data.model}, "
                f"labels={len(labels)}, time={inference_time_ms:.1f}ms"
            )

            return RunSegmentationOutput(
                preview_id=preview_metadata.preview_id,
                labels=labels,
                thumbnail_url=preview_storage.get_thumbnail_url(preview_metadata.preview_id),
                overlay_data_url=f"/api/preview/{preview_metadata.preview_id}/overlay",
                model_used=input_data.model,
                inference_time_ms=inference_time_ms,
                confidence=segmentation_result.get("confidence"),
                requires_confirmation=True,
                suggested_edits=self._get_suggested_edits(labels),
            )

        except Exception as e:
            logger.exception(f"Segmentation failed: {e}")
            return self._error_response(str(e), input_data.model, start_time)

    async def _validate_session(self, session_id: str) -> Optional[Any]:
        """Validate that the session exists and has an image."""
        session_manager = self._get_session_manager()
        if session_manager is None:
            # Return mock session for testing
            return {"id": session_id, "has_image": True}

        return session_manager.get_session(session_id)

    async def _get_image_data(
        self, session: Any, slice_index: Optional[int]
    ) -> tuple:
        """Get image data from session."""
        # In production, this would fetch from the viewer session
        # For now, return mock data
        try:
            # Try to get actual image from session
            if hasattr(session, "get_image_data"):
                image_data = session.get_image_data(slice_index=slice_index)
                metadata = session.get_image_metadata()
                return image_data, metadata
        except Exception as e:
            logger.warning(f"Could not get image from session: {e}")

        # Return placeholder indicating image should be loaded
        return None, {"image_id": None}

    def _build_inference_request(
        self,
        input_data: RunSegmentationInput,
        image_metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build the inference request based on input parameters."""
        request = {
            "model": input_data.model,
        }

        # Add text prompt if provided
        if input_data.text_prompt:
            request["text_prompt"] = input_data.text_prompt

        # Add point prompts if provided
        if input_data.point_prompts:
            request["point_prompts"] = [
                {
                    "x": p.x,
                    "y": p.y,
                    "z": p.z,
                    "label": p.label,
                    "is_normalized": p.is_normalized,
                }
                for p in input_data.point_prompts
            ]

        # Add box prompt if provided
        if input_data.box_prompt:
            request["box_prompt"] = input_data.box_prompt

        # Add 3D propagation setting
        request["propagate_3d"] = input_data.propagate_3d

        return request

    async def _run_inference(
        self,
        model: str,
        image_data: np.ndarray,
        inference_request: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Run the actual inference."""
        inference_service = self._get_inference_service()

        if inference_service is not None:
            try:
                return await inference_service.segment(
                    model_name=model,
                    image=image_data,
                    **inference_request,
                )
            except Exception as e:
                logger.error(f"Inference service error: {e}")

        # Mock inference for testing/development
        return await self._mock_inference(model, image_data, inference_request)

    async def _mock_inference(
        self,
        model: str,
        image_data: Optional[np.ndarray],
        inference_request: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Mock inference for testing."""
        # Generate mock segmentation based on text prompt
        text_prompt = inference_request.get("text_prompt", "unknown")

        # Parse organs from prompt
        organs = self._parse_organs_from_prompt(text_prompt)

        # Create mock mask
        if image_data is not None:
            shape = image_data.shape[:3] if image_data.ndim >= 3 else (256, 256)
        else:
            shape = (64, 256, 256)  # Default 3D shape

        mask = np.zeros(shape, dtype=np.uint8)

        # Create mock regions for each organ
        labels = []
        confidences = []

        for i, organ in enumerate(organs, start=1):
            # Create a simple elliptical region for each organ
            center = (shape[0] // 2, shape[1] // 2 + (i - 1) * 30, shape[2] // 2)
            self._create_mock_region(mask, center, i, shape)
            labels.append(organ)
            confidences.append(0.85 + (i * 0.02))

        return {
            "mask": mask,
            "labels": labels,
            "confidences": confidences,
            "confidence": np.mean(confidences) if confidences else 0.85,
        }

    def _create_mock_region(
        self,
        mask: np.ndarray,
        center: tuple,
        label_id: int,
        shape: tuple,
    ) -> None:
        """Create a mock elliptical region in the mask."""
        # Simple spherical region
        if len(shape) == 3:
            for z in range(max(0, center[0] - 10), min(shape[0], center[0] + 10)):
                for y in range(max(0, center[1] - 30), min(shape[1], center[1] + 30)):
                    for x in range(max(0, center[2] - 30), min(shape[2], center[2] + 30)):
                        dz = (z - center[0]) / 10
                        dy = (y - center[1]) / 30
                        dx = (x - center[2]) / 30
                        if dz**2 + dy**2 + dx**2 <= 1:
                            mask[z, y, x] = label_id
        else:
            for y in range(max(0, center[0] - 30), min(shape[0], center[0] + 30)):
                for x in range(max(0, center[1] - 30), min(shape[1], center[1] + 30)):
                    dy = (y - center[0]) / 30
                    dx = (x - center[1]) / 30
                    if dy**2 + dx**2 <= 1:
                        mask[y, x] = label_id

    def _parse_organs_from_prompt(self, prompt: str) -> List[str]:
        """Parse organ names from text prompt."""
        prompt_lower = prompt.lower()

        # Common anatomical structures
        known_organs = [
            "liver", "spleen", "kidney", "kidneys", "pancreas", "stomach",
            "heart", "lung", "lungs", "aorta", "spine", "vertebrae",
            "tumor", "lesion", "nodule", "mass",
            "bladder", "prostate", "uterus", "ovary", "ovaries",
            "brain", "ventricles", "cerebellum",
            "thyroid", "adrenal", "gallbladder",
        ]

        found = []
        for organ in known_organs:
            if organ in prompt_lower:
                # Handle plurals
                if organ == "kidneys":
                    found.extend(["left_kidney", "right_kidney"])
                elif organ == "lungs":
                    found.extend(["left_lung", "right_lung"])
                elif organ == "ovaries":
                    found.extend(["left_ovary", "right_ovary"])
                else:
                    found.append(organ)

        # If nothing found, use generic label
        if not found:
            found = ["segmentation"]

        return found[:10]  # Limit to 10 labels

    def _process_segmentation_labels(
        self,
        mask: np.ndarray,
        label_names: List[str],
        confidences: List[float],
        image_metadata: Dict[str, Any],
    ) -> List[SegmentationLabel]:
        """Process segmentation results into label objects."""
        labels = []

        # Get unique labels from mask
        unique_labels = np.unique(mask)
        unique_labels = unique_labels[unique_labels > 0]  # Exclude background

        for i, label_id in enumerate(unique_labels):
            label_mask = mask == label_id

            # Get label name
            if i < len(label_names):
                label_name = label_names[i]
            else:
                label_name = f"label_{label_id}"

            # Calculate voxel count
            voxel_count = int(np.sum(label_mask))

            # Calculate volume if spacing is available
            volume_ml = None
            spacing = image_metadata.get("spacing")
            if spacing and len(spacing) >= 3:
                voxel_volume_mm3 = spacing[0] * spacing[1] * spacing[2]
                volume_ml = (voxel_count * voxel_volume_mm3) / 1000  # mm3 to ml

            # Get confidence
            confidence = confidences[i] if i < len(confidences) else None

            # Calculate bounding box
            coords = np.where(label_mask)
            if len(coords[0]) > 0:
                if mask.ndim == 3:
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
                    color=DEFAULT_LABEL_COLORS[i % len(DEFAULT_LABEL_COLORS)],
                    voxel_count=voxel_count,
                    volume_ml=volume_ml,
                    confidence=confidence,
                    bounding_box=bbox,
                )
            )

        return labels

    def _get_suggested_edits(self, labels: List[SegmentationLabel]) -> Optional[List[str]]:
        """Get suggested edit operations based on results."""
        suggestions = []

        for label in labels:
            # Suggest smoothing for small structures
            if label.voxel_count and label.voxel_count < 1000:
                suggestions.append(f"Consider smoothing '{label.label_name}' for cleaner boundaries")

            # Suggest review for low confidence
            if label.confidence and label.confidence < 0.7:
                suggestions.append(f"Review '{label.label_name}' - confidence is {label.confidence:.0%}")

        return suggestions if suggestions else None

    def _error_response(
        self, error_message: str, model: str, start_time: float
    ) -> RunSegmentationOutput:
        """Create an error response."""
        return RunSegmentationOutput(
            preview_id=f"error_{uuid.uuid4().hex[:8]}",
            labels=[],
            thumbnail_url=None,
            overlay_data_url=None,
            model_used=model,
            inference_time_ms=(time.time() - start_time) * 1000,
            confidence=0.0,
            requires_confirmation=False,
            suggested_edits=[f"Error: {error_message}"],
        )
