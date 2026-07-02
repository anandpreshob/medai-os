# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Batch Process Tool - Batch segmentation via chat interface.

MCP tool that allows starting batch segmentation jobs through
the conversational interface with progress tracking.
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..schemas.annotation_schemas import (
    BatchJobStatus,
    BatchProcessInput,
    BatchProcessOutput,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class BatchProcessTool(MCPTool):
    """
    MCP tool for batch segmentation processing.

    Allows users to start batch jobs through chat commands like
    "segment the liver in all CT scans" or "process selected studies".
    """

    name = "batch_process"
    description = (
        "Start a batch segmentation job for multiple images. Use this when the user "
        "wants to process multiple studies or images at once. Supports filtering by "
        "modality, date range, or manual selection. Returns a job ID for progress tracking."
    )
    input_schema = BatchProcessInput
    output_schema = BatchProcessOutput

    def __init__(self):
        super().__init__()
        self._batch_jobs: Dict[str, Dict[str, Any]] = {}
        self._job_lock = asyncio.Lock()
        self._image_service = None
        self._inference_service = None

    def _get_image_service(self):
        """Lazy-load the image service."""
        if self._image_service is None:
            try:
                from ...services.image_service import get_image_service
                self._image_service = get_image_service()
            except ImportError:
                logger.warning("Image service not available")
        return self._image_service

    def _get_inference_service(self):
        """Lazy-load the inference service."""
        if self._inference_service is None:
            try:
                from ...services.inference import get_inference_service
                self._inference_service = get_inference_service()
            except ImportError:
                logger.warning("Inference service not available")
        return self._inference_service

    async def execute(self, input_data: BatchProcessInput) -> BatchProcessOutput:
        """
        Execute batch processing start operation.

        Args:
            input_data: Batch processing parameters

        Returns:
            Job status with ID for tracking
        """
        try:
            # Get images based on scope
            images = await self._get_images_for_scope(input_data)

            if not images:
                return BatchProcessOutput(
                    job_id=f"empty_{uuid.uuid4().hex[:8]}",
                    total_images=0,
                    status="completed",
                    completed_count=0,
                    failed_count=0,
                    current_image=None,
                    estimated_time_remaining_s=None,
                    image_statuses=[],
                    can_cancel=False,
                )

            # Create job
            job_id = f"batch_{uuid.uuid4().hex[:12]}"

            job = {
                "job_id": job_id,
                "created_at": datetime.utcnow(),
                "model": input_data.model,
                "prompt": input_data.prompt,
                "save_format": input_data.save_format,
                "auto_save": input_data.auto_save,
                "max_concurrent": input_data.max_concurrent,
                "images": images,
                "status": "queued",
                "completed_count": 0,
                "failed_count": 0,
                "current_index": 0,
                "image_statuses": [
                    BatchJobStatus(
                        image_id=img["id"],
                        status="pending",
                        progress_percent=None,
                        labels_found=None,
                        error_message=None,
                    )
                    for img in images
                ],
                "results": {},
            }

            async with self._job_lock:
                self._batch_jobs[job_id] = job

            # Start processing in background
            asyncio.create_task(self._run_batch_job(job_id))

            # Return initial status
            return BatchProcessOutput(
                job_id=job_id,
                total_images=len(images),
                status="queued",
                completed_count=0,
                failed_count=0,
                current_image=images[0]["id"] if images else None,
                estimated_time_remaining_s=self._estimate_time(len(images), input_data.model),
                image_statuses=job["image_statuses"][:10],  # Return first 10
                can_cancel=True,
            )

        except Exception as e:
            logger.exception(f"Batch process start failed: {e}")
            return BatchProcessOutput(
                job_id=f"error_{uuid.uuid4().hex[:8]}",
                total_images=0,
                status="cancelled",
                completed_count=0,
                failed_count=0,
                current_image=None,
                estimated_time_remaining_s=None,
                image_statuses=[],
                can_cancel=False,
            )

    async def get_job_status(self, job_id: str) -> Optional[BatchProcessOutput]:
        """Get the current status of a batch job."""
        async with self._job_lock:
            job = self._batch_jobs.get(job_id)

        if job is None:
            return None

        remaining = len(job["images"]) - job["completed_count"] - job["failed_count"]
        est_time = self._estimate_time(remaining, job["model"]) if remaining > 0 else None

        return BatchProcessOutput(
            job_id=job_id,
            total_images=len(job["images"]),
            status=job["status"],
            completed_count=job["completed_count"],
            failed_count=job["failed_count"],
            current_image=job["images"][job["current_index"]]["id"]
            if job["current_index"] < len(job["images"]) else None,
            estimated_time_remaining_s=est_time,
            image_statuses=job["image_statuses"][:10],
            can_cancel=job["status"] in ("queued", "running"),
        )

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running batch job."""
        async with self._job_lock:
            job = self._batch_jobs.get(job_id)
            if job and job["status"] in ("queued", "running"):
                job["status"] = "cancelled"
                return True
        return False

    async def _get_images_for_scope(
        self, input_data: BatchProcessInput
    ) -> List[Dict[str, Any]]:
        """Get images based on the specified scope."""
        image_service = self._get_image_service()

        if input_data.scope == "selected":
            # Use provided image IDs
            if not input_data.selected_image_ids:
                return []

            if image_service is not None:
                return [
                    await image_service.get_image_info(img_id)
                    for img_id in input_data.selected_image_ids
                ]

            # Mock data
            return [{"id": img_id, "path": f"/images/{img_id}"} for img_id in input_data.selected_image_ids]

        elif input_data.scope == "filter":
            # Apply filter criteria
            if image_service is not None:
                return await image_service.search_images(
                    modality=input_data.filter_criteria.get("modality") if input_data.filter_criteria else None,
                    body_region=input_data.filter_criteria.get("body_region") if input_data.filter_criteria else None,
                    date_from=input_data.filter_criteria.get("date_from") if input_data.filter_criteria else None,
                    date_to=input_data.filter_criteria.get("date_to") if input_data.filter_criteria else None,
                    limit=100,
                )

            # Mock data
            return self._mock_filter_images(input_data.filter_criteria)

        else:  # scope == "all"
            if image_service is not None:
                return await image_service.get_all_images(limit=100)

            # Mock data - return a few test images
            return [
                {"id": f"img_{i:04d}", "path": f"/images/test_{i}.nii.gz"}
                for i in range(5)
            ]

    def _mock_filter_images(
        self, filter_criteria: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Mock filtered image list for testing."""
        count = 3
        if filter_criteria:
            if filter_criteria.get("modality") == "CT":
                count = 5
            elif filter_criteria.get("modality") == "MR":
                count = 4

        return [
            {"id": f"img_{i:04d}", "path": f"/images/filtered_{i}.nii.gz"}
            for i in range(count)
        ]

    def _estimate_time(self, num_images: int, model: str) -> float:
        """Estimate remaining processing time in seconds."""
        # Rough estimates per model (seconds per image)
        model_times = {
            "biomedparse": 5.0,
            "medsam": 3.0,
            "totalsegmentator": 15.0,
        }

        time_per_image = model_times.get(model, 5.0)
        return num_images * time_per_image

    async def _run_batch_job(self, job_id: str) -> None:
        """Run the batch processing job."""
        async with self._job_lock:
            job = self._batch_jobs.get(job_id)
            if not job:
                return
            job["status"] = "running"

        inference_service = self._get_inference_service()

        try:
            images = job["images"]
            max_concurrent = job["max_concurrent"]

            # Process in batches
            for i in range(0, len(images), max_concurrent):
                # Check for cancellation
                async with self._job_lock:
                    if job["status"] == "cancelled":
                        logger.info(f"Batch job {job_id} cancelled")
                        return

                batch = images[i:i + max_concurrent]

                # Process batch concurrently
                tasks = [
                    self._process_single_image(
                        job, idx + i, image, inference_service
                    )
                    for idx, image in enumerate(batch)
                ]

                await asyncio.gather(*tasks, return_exceptions=True)

            # Mark job as completed
            async with self._job_lock:
                if job["status"] == "running":
                    job["status"] = "completed"

            logger.info(
                f"Batch job {job_id} completed: "
                f"{job['completed_count']}/{len(images)} succeeded, "
                f"{job['failed_count']} failed"
            )

        except Exception as e:
            logger.exception(f"Batch job {job_id} error: {e}")
            async with self._job_lock:
                job["status"] = "cancelled"

    async def _process_single_image(
        self,
        job: Dict[str, Any],
        index: int,
        image: Dict[str, Any],
        inference_service: Any,
    ) -> None:
        """Process a single image in the batch."""
        image_id = image["id"]

        try:
            # Update status to processing
            async with self._job_lock:
                job["current_index"] = index
                job["image_statuses"][index].status = "processing"
                job["image_statuses"][index].progress_percent = 0.0

            # Load image
            image_data = await self._load_image(image)
            if image_data is None:
                raise ValueError(f"Failed to load image {image_id}")

            # Update progress
            async with self._job_lock:
                job["image_statuses"][index].progress_percent = 25.0

            # Run inference
            if inference_service is not None:
                result = await inference_service.segment(
                    model_name=job["model"],
                    image=image_data,
                    text_prompt=job["prompt"],
                )
            else:
                # Mock inference
                result = await self._mock_inference(image_data, job["prompt"])

            # Update progress
            async with self._job_lock:
                job["image_statuses"][index].progress_percent = 75.0

            # Save if auto_save is enabled
            if job["auto_save"]:
                await self._save_result(image, result, job["save_format"])

            # Update completion status
            async with self._job_lock:
                job["completed_count"] += 1
                job["image_statuses"][index].status = "completed"
                job["image_statuses"][index].progress_percent = 100.0
                job["image_statuses"][index].labels_found = result.get("labels", [])
                job["results"][image_id] = result

        except Exception as e:
            logger.error(f"Failed to process image {image_id}: {e}")
            async with self._job_lock:
                job["failed_count"] += 1
                job["image_statuses"][index].status = "failed"
                job["image_statuses"][index].error_message = str(e)

    async def _load_image(self, image: Dict[str, Any]) -> Optional[Any]:
        """Load image data."""
        image_service = self._get_image_service()

        if image_service is not None:
            try:
                return await image_service.load_image(image["id"])
            except Exception as e:
                logger.error(f"Failed to load image: {e}")

        # Return mock data
        import numpy as np
        return np.random.rand(64, 256, 256).astype(np.float32)

    async def _mock_inference(
        self, image_data: Any, prompt: str
    ) -> Dict[str, Any]:
        """Mock inference for testing."""
        import numpy as np

        # Simulate processing time
        await asyncio.sleep(0.5)

        # Create mock result
        mask = np.zeros(image_data.shape[:3], dtype=np.uint8)
        mask[20:40, 100:150, 100:150] = 1

        return {
            "mask": mask,
            "labels": [prompt.split()[0] if prompt else "segmentation"],
            "confidence": 0.85,
        }

    async def _save_result(
        self,
        image: Dict[str, Any],
        result: Dict[str, Any],
        save_format: str,
    ) -> None:
        """Save segmentation result."""
        # Import save annotation tool functionality
        try:
            from .save_annotation import SaveAnnotationTool
            from ..schemas.annotation_schemas import SaveAnnotationInput
            from ...services.preview_storage import get_preview_storage

            # Store in preview storage
            preview_storage = get_preview_storage()
            preview_metadata = await preview_storage.store_preview(
                session_id=f"batch_{image['id']}",
                segmentation_data=result["mask"],
                model_used="batch",
                labels=[{"label_id": 1, "label_name": l} for l in result.get("labels", [])],
                prompt_used=None,
                inference_time_ms=0,
                confidence=result.get("confidence"),
            )

            # Save using save annotation tool
            save_tool = SaveAnnotationTool()
            save_input = SaveAnnotationInput(
                preview_id=preview_metadata.preview_id,
                format=save_format,
                destination="local",
            )
            await save_tool.execute(save_input)

        except Exception as e:
            logger.error(f"Failed to save batch result: {e}")
