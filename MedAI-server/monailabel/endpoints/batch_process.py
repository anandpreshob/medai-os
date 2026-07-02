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
Batch Processing API Endpoints

Provides enhanced batch processing capabilities for the Medical Image Annotation Suite:
- POST /batch/process - Start batch job with model, files, prompt
- GET /batch/process/{id} - Get job status and results
- DELETE /batch/process/{id} - Cancel running job
- POST /batch/process/{id}/review - Accept/reject individual results
- POST /batch/process/{id}/export - Export accepted results
"""

import asyncio
import logging
import os
import tempfile
import time
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from monailabel.config import RBAC_ADMIN, RBAC_USER, settings
from monailabel.endpoints.user.auth import RBAC, User
from monailabel.interfaces.app import MONAILabelApp
from monailabel.interfaces.utils.app import app_instance
from monailabel.utils.batch.job_manager import (
    BatchJob,
    FileResult,
    JobManager,
    JobStatus,
    get_job_manager,
)
from monailabel.utils.exporters.coco_exporter import COCOExporter
from monailabel.utils.exporters.yolo_exporter import YOLOExporter
from monailabel.utils.exporters.voc_exporter import VOCExporter
from monailabel.utils.exporters.overlay_exporter import OverlayExporter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/batch",
    tags=["Batch Processing"],
    responses={404: {"description": "Not found"}},
)


# ============================================================================
# Request/Response Models
# ============================================================================

class BatchProcessRequest(BaseModel):
    """Request model for starting batch processing."""
    files: List[str] = Field(..., description="List of file paths or image IDs to process")
    model: str = Field(..., description="Model name to use for inference")
    prompt: str = Field(..., description="Segmentation prompt (e.g., 'liver segmentation')")
    options: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional processing options",
        examples=[{"confidence_threshold": 0.5, "device": "cuda"}],
    )


class BatchProcessResponse(BaseModel):
    """Response model for batch processing status."""
    job_id: str
    status: str
    total: int
    processed: int
    success: int = 0
    failed: int = 0
    progress_percentage: float = 0.0
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class ReviewRequest(BaseModel):
    """Request model for reviewing a result."""
    file_path: str = Field(..., description="Path to the file being reviewed")
    accept: bool = Field(..., description="True to accept, False to reject")
    notes: Optional[str] = Field(default=None, description="Optional review notes")


class BulkReviewRequest(BaseModel):
    """Request model for bulk review."""
    reviews: List[ReviewRequest] = Field(..., description="List of review decisions")


class ExportFormat(str, Enum):
    """Supported export formats."""
    COCO = "coco"
    YOLO = "yolo"
    VOC = "voc"
    OVERLAY = "overlay"


class ExportRequest(BaseModel):
    """Request model for exporting results."""
    format: ExportFormat = Field(..., description="Export format")
    categories: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Category definitions",
        examples=[[{"id": 1, "name": "liver"}, {"id": 2, "name": "tumor"}]],
    )
    options: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Format-specific export options",
    )
    export_rejected: bool = Field(
        default=False,
        description="Include rejected results in export",
    )


# ============================================================================
# Helper Functions
# ============================================================================

def get_manager() -> JobManager:
    """Get the job manager instance."""
    persistence_path = os.path.join(
        settings.MONAI_LABEL_SESSION_PATH or tempfile.gettempdir(),
        "batch_jobs"
    )
    return get_job_manager(persistence_path)


async def run_batch_inference(
    job_id: str,
    model: str,
    files: List[str],
    prompt: str,
    options: Dict[str, Any],
):
    """
    Background task to run batch inference.

    Args:
        job_id: Job identifier
        model: Model name
        files: List of files to process
        prompt: Segmentation prompt
        options: Processing options
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        logger.error(f"Job {job_id} not found for batch inference")
        return

    try:
        # Update status to running
        await manager.update_job_status(job_id, JobStatus.RUNNING)

        # Get app instance
        instance: MONAILabelApp = app_instance()

        # Process each file
        for idx, file_path in enumerate(files):
            # Check for cancellation
            if job.cancel_requested:
                logger.info(f"Job {job_id} cancelled")
                break

            # Wait if paused
            await job.pause_event.wait()

            # Update current file index
            job.current_file_index = idx

            # Mark file as processing
            await manager.update_file_result(
                job_id=job_id,
                file_path=file_path,
                status="processing",
            )

            start_time = time.time()

            try:
                # Build inference request
                request = {
                    "model": model,
                    "image": file_path,
                    "prompt": prompt,
                    **options,
                }

                # Check if file exists in datastore or as path
                datastore = instance.datastore()
                if not os.path.exists(file_path):
                    try:
                        image_uri = datastore.get_image_uri(file_path)
                        request["image"] = image_uri
                    except Exception:
                        pass

                # Run inference
                result = instance.infer(request)

                if result is None:
                    raise Exception("Inference returned None")

                # Extract result data
                result_file = result.get("file")
                result_params = result.get("params", {})

                # Determine labels from prompt or result
                labels = [prompt] if prompt else []
                if "labels" in result_params:
                    labels = result_params["labels"]

                # Get confidence from result
                confidence = result_params.get("confidence")
                if confidence is None and "scores" in result_params:
                    scores = result_params.get("scores", [])
                    confidence = max(scores) if scores else None

                # Generate preview ID
                preview_id = str(uuid.uuid4())

                processing_time = time.time() - start_time

                # Update result
                await manager.update_file_result(
                    job_id=job_id,
                    file_path=file_path,
                    status="completed",
                    preview_id=preview_id,
                    preview_path=result_file if isinstance(result_file, str) else None,
                    labels=labels,
                    confidence=confidence,
                    mask_path=result_file if isinstance(result_file, str) else None,
                    processing_time=processing_time,
                    metadata={
                        "params": result_params,
                        "model": model,
                        "prompt": prompt,
                    },
                )

                logger.info(f"Processed {file_path} in {processing_time:.2f}s")

            except Exception as e:
                processing_time = time.time() - start_time
                logger.error(f"Failed to process {file_path}: {e}")

                await manager.update_file_result(
                    job_id=job_id,
                    file_path=file_path,
                    status="failed",
                    error=str(e),
                    processing_time=processing_time,
                )

        # Update final status
        if job.cancel_requested:
            await manager.update_job_status(job_id, JobStatus.CANCELLED)
        elif job.failed_count == job.total_files:
            await manager.update_job_status(job_id, JobStatus.FAILED)
        else:
            await manager.update_job_status(job_id, JobStatus.COMPLETED)

        logger.info(
            f"Batch job {job_id} finished: "
            f"{job.success_count} success, {job.failed_count} failed"
        )

    except Exception as e:
        logger.exception(f"Batch job {job_id} failed with error: {e}")
        job.error = str(e)
        await manager.update_job_status(job_id, JobStatus.FAILED)


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/process", summary=f"{RBAC_USER}Start batch processing job")
async def start_batch_process(
    request: BatchProcessRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> BatchProcessResponse:
    """
    Start a new batch processing job.

    This endpoint initiates asynchronous batch inference on multiple files.
    Use the job_id to track progress via GET /batch/process/{id} or
    WebSocket /batch/ws/{id}.

    Request body:
    - files: List of file paths or image IDs to process
    - model: Model name (e.g., "biomedparse", "totalsegmentator")
    - prompt: Segmentation prompt (e.g., "liver segmentation")
    - options: Optional processing parameters

    Returns:
    - job_id: Unique job identifier
    - status: Current job status
    - total: Total number of files
    """
    manager = get_manager()

    # Validate files list
    if not request.files:
        raise HTTPException(status_code=400, detail="Files list cannot be empty")

    # Validate model exists
    instance: MONAILabelApp = app_instance()
    info = instance.info()
    available_models = list(info.get("models", {}).keys())

    if request.model not in available_models:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{request.model}' not found. Available: {available_models}",
        )

    # Create job
    job = await manager.create_job(
        model=request.model,
        files=request.files,
        prompt=request.prompt,
        options=request.options or {},
    )

    # Start background processing
    background_tasks.add_task(
        run_batch_inference,
        job_id=job.job_id,
        model=request.model,
        files=request.files,
        prompt=request.prompt,
        options=request.options or {},
    )

    return BatchProcessResponse(
        job_id=job.job_id,
        status=job.status.value,
        total=job.total_files,
        processed=0,
        created_at=job.created_at,
    )


@router.get("/process/{job_id}", summary=f"{RBAC_USER}Get batch job status")
async def get_batch_status(
    job_id: str,
    include_results: bool = Query(
        default=True,
        description="Include detailed results per file",
    ),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Get the status and results of a batch processing job.

    Path parameters:
    - job_id: Unique job identifier

    Query parameters:
    - include_results: Whether to include detailed per-file results

    Returns:
    - Complete job status including processed files, success/failure counts,
      and optionally detailed results with preview paths and labels.
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return job.to_dict(include_results=include_results)


@router.get("/process", summary=f"{RBAC_USER}List all batch jobs")
async def list_batch_jobs(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, description="Maximum number of jobs to return"),
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> List[Dict[str, Any]]:
    """
    List all batch processing jobs.

    Query parameters:
    - status: Filter by job status (pending, running, completed, failed, cancelled)
    - limit: Maximum number of jobs to return

    Returns:
    - List of job summaries (without detailed results)
    """
    manager = get_manager()
    jobs = await manager.get_all_jobs()

    # Filter by status if specified
    if status:
        try:
            filter_status = JobStatus(status)
            jobs = [j for j in jobs if j.status == filter_status]
        except ValueError:
            pass

    # Sort by creation time (newest first)
    jobs.sort(key=lambda j: j.created_at, reverse=True)

    # Limit results
    jobs = jobs[:limit]

    return [job.to_summary() for job in jobs]


@router.delete("/process/{job_id}", summary=f"{RBAC_ADMIN}Cancel batch job")
async def cancel_batch_job(
    job_id: str,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_ADMIN)),
) -> Dict[str, Any]:
    """
    Cancel a running batch processing job.

    Path parameters:
    - job_id: Unique job identifier

    Returns:
    - Updated job status
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status: {job.status.value}",
        )

    await manager.cancel_job(job_id)

    # Refresh job data
    job = await manager.get_job(job_id)
    return job.to_summary()


@router.post("/process/{job_id}/pause", summary=f"{RBAC_USER}Pause batch job")
async def pause_batch_job(
    job_id: str,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Pause a running batch processing job.

    Path parameters:
    - job_id: Unique job identifier

    Returns:
    - Updated job status
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.status != JobStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail=f"Can only pause running jobs. Current status: {job.status.value}",
        )

    await manager.pause_job(job_id)

    job = await manager.get_job(job_id)
    return job.to_summary()


@router.post("/process/{job_id}/resume", summary=f"{RBAC_USER}Resume batch job")
async def resume_batch_job(
    job_id: str,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Resume a paused batch processing job.

    Path parameters:
    - job_id: Unique job identifier

    Returns:
    - Updated job status
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.status != JobStatus.PAUSED:
        raise HTTPException(
            status_code=400,
            detail=f"Can only resume paused jobs. Current status: {job.status.value}",
        )

    await manager.resume_job(job_id)

    job = await manager.get_job(job_id)
    return job.to_summary()


@router.post("/process/{job_id}/review", summary=f"{RBAC_USER}Review batch results")
async def review_batch_results(
    job_id: str,
    request: BulkReviewRequest,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Accept or reject individual results from a batch job.

    Path parameters:
    - job_id: Unique job identifier

    Request body:
    - reviews: List of review decisions with file_path, accept, and optional notes

    Returns:
    - Updated job summary with review counts
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Process reviews
    results = {"success": [], "failed": []}

    for review in request.reviews:
        success = await manager.review_result(
            job_id=job_id,
            file_path=review.file_path,
            accept=review.accept,
            notes=review.notes,
        )

        if success:
            results["success"].append(review.file_path)
        else:
            results["failed"].append(review.file_path)

    # Refresh job data
    job = await manager.get_job(job_id)

    return {
        "job_id": job_id,
        "review_results": results,
        "accepted_count": job.accepted_count,
        "rejected_count": job.rejected_count,
        "pending_review_count": job.success_count - job.accepted_count - job.rejected_count,
    }


@router.post("/process/{job_id}/export", summary=f"{RBAC_USER}Export batch results")
async def export_batch_results(
    job_id: str,
    request: ExportRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Export accepted results from a batch job.

    Path parameters:
    - job_id: Unique job identifier

    Request body:
    - format: Export format (coco, yolo, voc, overlay)
    - categories: Category definitions for export
    - options: Format-specific export options
    - export_rejected: Whether to include rejected results

    Returns:
    - export_path: Path to exported files
    - format: Export format used
    - file_count: Number of files exported
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Get results to export
    if request.export_rejected:
        results_to_export = [
            r for r in job.results.values()
            if r.status == "completed"
        ]
    else:
        results_to_export = manager.get_accepted_results(job_id)

    if not results_to_export:
        raise HTTPException(
            status_code=400,
            detail="No results available for export. Accept some results first.",
        )

    # Prepare results for export
    export_results = []
    for result in results_to_export:
        export_results.append({
            "file_path": result.file_path,
            "mask_path": result.mask_path,
            "labels": result.labels,
            "confidence": result.confidence,
            "image_width": result.metadata.get("image_width"),
            "image_height": result.metadata.get("image_height"),
        })

    # Default categories if not provided
    categories = request.categories or [
        {"id": 1, "name": job.prompt or "segmentation"}
    ]

    # Create export directory
    export_dir = os.path.join(
        settings.MONAI_LABEL_SESSION_PATH or tempfile.gettempdir(),
        "exports",
        job_id,
        request.format.value,
    )
    os.makedirs(export_dir, exist_ok=True)

    options = request.options or {}

    # Export based on format
    if request.format == ExportFormat.COCO:
        exporter = COCOExporter(
            description=f"Batch export from job {job_id}",
            use_rle=options.get("use_rle", False),
        )
        output_path = os.path.join(export_dir, "annotations.json")
        exporter.export(
            results=export_results,
            categories=categories,
            output_path=output_path,
        )

    elif request.format == ExportFormat.YOLO:
        exporter = YOLOExporter(
            task=options.get("task", "segment"),
        )
        exporter.export(
            results=export_results,
            categories=categories,
            output_dir=export_dir,
            train_split=options.get("train_split", 0.8),
            copy_images=options.get("copy_images", False),
        )
        output_path = export_dir

    elif request.format == ExportFormat.VOC:
        exporter = VOCExporter()
        exporter.export(
            results=export_results,
            categories=categories,
            output_dir=export_dir,
            train_split=options.get("train_split", 0.8),
        )
        output_path = export_dir

    elif request.format == ExportFormat.OVERLAY:
        exporter = OverlayExporter(
            default_alpha=options.get("alpha", 0.5),
        )
        exporter.export(
            results=export_results,
            categories=categories,
            output_dir=export_dir,
            alpha=options.get("alpha", 0.5),
            include_original=options.get("include_original", True),
            export_individual_masks=options.get("export_individual_masks", False),
            add_legend=options.get("add_legend", True),
        )
        output_path = export_dir

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported export format: {request.format}",
        )

    return {
        "export_path": output_path,
        "format": request.format.value,
        "file_count": len(results_to_export),
        "categories": categories,
    }


@router.get("/process/{job_id}/results/{file_path:path}", summary=f"{RBAC_USER}Get file result")
async def get_file_result(
    job_id: str,
    file_path: str,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
) -> Dict[str, Any]:
    """
    Get detailed result for a specific file.

    Path parameters:
    - job_id: Unique job identifier
    - file_path: Path to the file

    Returns:
    - Detailed result including preview path, labels, confidence, review status
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    result = job.results.get(file_path)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Result for file {file_path} not found in job {job_id}",
        )

    return result.to_dict()


@router.get("/process/{job_id}/preview/{preview_id}", summary=f"{RBAC_USER}Get preview image")
async def get_preview_image(
    job_id: str,
    preview_id: str,
    user: User = Depends(RBAC(settings.MONAI_LABEL_AUTH_ROLE_USER)),
):
    """
    Get preview image for a result.

    Path parameters:
    - job_id: Unique job identifier
    - preview_id: Preview identifier

    Returns:
    - Preview image file
    """
    manager = get_manager()
    job = await manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Find result with this preview ID
    preview_path = None
    for result in job.results.values():
        if result.preview_id == preview_id:
            preview_path = result.preview_path
            break

    if not preview_path or not os.path.exists(preview_path):
        raise HTTPException(
            status_code=404,
            detail=f"Preview {preview_id} not found",
        )

    return FileResponse(preview_path)
