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
Batch Processing Job Manager

Provides job tracking and lifecycle management for batch processing tasks.
Supports:
- Job status tracking: pending, running, paused, completed, failed, cancelled
- Per-file result storage (preview paths, labels, confidence)
- Pause/resume functionality
- WebSocket notification integration
"""

import asyncio
import json
import logging
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Batch job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ReviewStatus(str, Enum):
    """File review status enumeration."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


@dataclass
class FileResult:
    """Result data for a single processed file."""
    file_name: str
    file_path: str
    status: str = "pending"  # pending, processing, completed, failed
    preview_id: Optional[str] = None
    preview_path: Optional[str] = None
    labels: List[str] = field(default_factory=list)
    confidence: Optional[float] = None
    mask_path: Optional[str] = None
    error: Optional[str] = None
    processing_time: Optional[float] = None
    review_status: str = ReviewStatus.PENDING
    review_notes: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "file_name": self.file_name,
            "file_path": self.file_path,
            "status": self.status,
            "preview_id": self.preview_id,
            "preview_path": self.preview_path,
            "labels": self.labels,
            "confidence": self.confidence,
            "mask_path": self.mask_path,
            "error": self.error,
            "processing_time": self.processing_time,
            "review_status": self.review_status,
            "review_notes": self.review_notes,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FileResult":
        """Create from dictionary."""
        return cls(
            file_name=data.get("file_name", ""),
            file_path=data.get("file_path", ""),
            status=data.get("status", "pending"),
            preview_id=data.get("preview_id"),
            preview_path=data.get("preview_path"),
            labels=data.get("labels", []),
            confidence=data.get("confidence"),
            mask_path=data.get("mask_path"),
            error=data.get("error"),
            processing_time=data.get("processing_time"),
            review_status=data.get("review_status", ReviewStatus.PENDING),
            review_notes=data.get("review_notes"),
            metadata=data.get("metadata", {}),
        )


@dataclass
class BatchJob:
    """Batch processing job data."""
    job_id: str
    model: str
    prompt: str
    files: List[str]
    options: Dict[str, Any] = field(default_factory=dict)
    status: JobStatus = JobStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    current_file_index: int = 0
    results: Dict[str, FileResult] = field(default_factory=dict)
    error: Optional[str] = None
    # Free-form job-level metadata (e.g. cloud provider job id for a Vertex run).
    metadata: Dict[str, Any] = field(default_factory=dict)
    progress_callbacks: Set[Callable] = field(default_factory=set)
    pause_event: asyncio.Event = field(default_factory=asyncio.Event)
    cancel_requested: bool = False

    def __post_init__(self):
        """Initialize pause event to allow running by default."""
        self.pause_event.set()
        # Initialize file results
        for file_path in self.files:
            file_name = os.path.basename(file_path)
            self.results[file_path] = FileResult(
                file_name=file_name,
                file_path=file_path,
            )

    @property
    def total_files(self) -> int:
        """Total number of files to process."""
        return len(self.files)

    @property
    def processed_count(self) -> int:
        """Number of processed files."""
        return sum(
            1 for r in self.results.values()
            if r.status in ("completed", "failed")
        )

    @property
    def success_count(self) -> int:
        """Number of successfully processed files."""
        return sum(
            1 for r in self.results.values()
            if r.status == "completed"
        )

    @property
    def failed_count(self) -> int:
        """Number of failed files."""
        return sum(
            1 for r in self.results.values()
            if r.status == "failed"
        )

    @property
    def accepted_count(self) -> int:
        """Number of accepted results."""
        return sum(
            1 for r in self.results.values()
            if r.review_status == ReviewStatus.ACCEPTED
        )

    @property
    def rejected_count(self) -> int:
        """Number of rejected results."""
        return sum(
            1 for r in self.results.values()
            if r.review_status == ReviewStatus.REJECTED
        )

    @property
    def progress_percentage(self) -> float:
        """Processing progress percentage."""
        if self.total_files == 0:
            return 100.0
        return (self.processed_count / self.total_files) * 100

    def to_dict(self, include_results: bool = True) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        data = {
            "job_id": self.job_id,
            "model": self.model,
            "prompt": self.prompt,
            "files": self.files,
            "options": self.options,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "current_file_index": self.current_file_index,
            "total_files": self.total_files,
            "processed_count": self.processed_count,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "accepted_count": self.accepted_count,
            "rejected_count": self.rejected_count,
            "progress_percentage": round(self.progress_percentage, 2),
            "error": self.error,
            "metadata": self.metadata,
        }
        if include_results:
            data["results"] = {k: v.to_dict() for k, v in self.results.items()}
        return data

    def to_summary(self) -> Dict[str, Any]:
        """Return summary without full results."""
        return self.to_dict(include_results=False)


class JobManager:
    """
    Manages batch processing jobs.

    Provides:
    - Job creation and tracking
    - Status management (pending, running, paused, completed, failed, cancelled)
    - Per-file result storage
    - Pause/resume functionality
    - Optional persistence to disk
    """

    _instance = None

    def __new__(cls, *args, **kwargs):
        """Singleton pattern for job manager."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, persistence_path: Optional[str] = None):
        """
        Initialize job manager.

        Args:
            persistence_path: Optional path for job persistence.
                            If None, jobs are stored in memory only.
        """
        if self._initialized:
            return

        self._jobs: Dict[str, BatchJob] = {}
        self._persistence_path = persistence_path
        self._lock = asyncio.Lock()
        self._websocket_handlers: Dict[str, Set[Callable]] = {}
        self._initialized = True

        if persistence_path:
            os.makedirs(persistence_path, exist_ok=True)
            self._load_jobs()

    def _load_jobs(self):
        """Load persisted jobs from disk."""
        if not self._persistence_path:
            return

        jobs_file = os.path.join(self._persistence_path, "jobs.json")
        if os.path.exists(jobs_file):
            try:
                with open(jobs_file, "r") as f:
                    jobs_data = json.load(f)
                    for job_id, job_data in jobs_data.items():
                        # Restore basic job data (not running state)
                        job = BatchJob(
                            job_id=job_data["job_id"],
                            model=job_data["model"],
                            prompt=job_data["prompt"],
                            files=job_data["files"],
                            options=job_data.get("options", {}),
                            status=JobStatus(job_data["status"]),
                            created_at=job_data["created_at"],
                            started_at=job_data.get("started_at"),
                            completed_at=job_data.get("completed_at"),
                            current_file_index=job_data.get("current_file_index", 0),
                            error=job_data.get("error"),
                            metadata=job_data.get("metadata", {}),
                        )
                        # Restore results
                        if "results" in job_data:
                            for file_path, result_data in job_data["results"].items():
                                job.results[file_path] = FileResult.from_dict(result_data)
                        self._jobs[job_id] = job
                logger.info(f"Loaded {len(self._jobs)} jobs from persistence")
            except Exception as e:
                logger.error(f"Failed to load persisted jobs: {e}")

    def _save_jobs(self):
        """Save jobs to disk."""
        if not self._persistence_path:
            return

        jobs_file = os.path.join(self._persistence_path, "jobs.json")
        try:
            jobs_data = {
                job_id: job.to_dict()
                for job_id, job in self._jobs.items()
            }
            with open(jobs_file, "w") as f:
                json.dump(jobs_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save jobs: {e}")

    async def create_job(
        self,
        model: str,
        files: List[str],
        prompt: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> BatchJob:
        """
        Create a new batch processing job.

        Args:
            model: Model name to use for inference
            files: List of file paths to process
            prompt: Segmentation prompt
            options: Optional processing options

        Returns:
            Created BatchJob instance
        """
        async with self._lock:
            job_id = str(uuid.uuid4())
            job = BatchJob(
                job_id=job_id,
                model=model,
                files=files,
                prompt=prompt,
                options=options or {},
            )
            self._jobs[job_id] = job
            self._save_jobs()
            logger.info(f"Created batch job {job_id} with {len(files)} files")
            return job

    async def get_job(self, job_id: str) -> Optional[BatchJob]:
        """Get job by ID."""
        return self._jobs.get(job_id)

    async def get_all_jobs(self) -> List[BatchJob]:
        """Get all jobs."""
        return list(self._jobs.values())

    async def update_job_status(self, job_id: str, status: JobStatus) -> bool:
        """
        Update job status.

        Args:
            job_id: Job identifier
            status: New status

        Returns:
            True if updated, False if job not found
        """
        job = self._jobs.get(job_id)
        if not job:
            return False

        job.status = status

        if status == JobStatus.RUNNING and not job.started_at:
            job.started_at = datetime.now().isoformat()
        elif status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            job.completed_at = datetime.now().isoformat()

        self._save_jobs()
        await self._notify_websockets(job_id, {
            "type": "status_change",
            "job_id": job_id,
            "status": status.value,
        })
        return True

    async def update_file_result(
        self,
        job_id: str,
        file_path: str,
        status: str,
        preview_id: Optional[str] = None,
        preview_path: Optional[str] = None,
        labels: Optional[List[str]] = None,
        confidence: Optional[float] = None,
        mask_path: Optional[str] = None,
        error: Optional[str] = None,
        processing_time: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Update result for a specific file.

        Args:
            job_id: Job identifier
            file_path: Path to the processed file
            status: Processing status (pending, processing, completed, failed)
            preview_id: Optional preview identifier
            preview_path: Optional path to preview image
            labels: Optional detected labels
            confidence: Optional confidence score
            mask_path: Optional path to segmentation mask
            error: Optional error message
            processing_time: Optional processing time in seconds
            metadata: Optional additional metadata

        Returns:
            True if updated, False if job or file not found
        """
        job = self._jobs.get(job_id)
        if not job or file_path not in job.results:
            return False

        result = job.results[file_path]
        result.status = status

        if preview_id is not None:
            result.preview_id = preview_id
        if preview_path is not None:
            result.preview_path = preview_path
        if labels is not None:
            result.labels = labels
        if confidence is not None:
            result.confidence = confidence
        if mask_path is not None:
            result.mask_path = mask_path
        if error is not None:
            result.error = error
        if processing_time is not None:
            result.processing_time = processing_time
        if metadata is not None:
            result.metadata.update(metadata)

        self._save_jobs()

        # Notify websockets
        await self._notify_websockets(job_id, {
            "type": "result" if status == "completed" else "progress",
            "file": os.path.basename(file_path),
            "file_path": file_path,
            "status": status,
            "current": job.processed_count,
            "total": job.total_files,
            "preview_id": preview_id,
            "labels": labels,
            "confidence": confidence,
        })

        return True

    async def review_result(
        self,
        job_id: str,
        file_path: str,
        accept: bool,
        notes: Optional[str] = None,
    ) -> bool:
        """
        Accept or reject a file result.

        Args:
            job_id: Job identifier
            file_path: Path to the file
            accept: True to accept, False to reject
            notes: Optional review notes

        Returns:
            True if updated, False if job or file not found
        """
        job = self._jobs.get(job_id)
        if not job or file_path not in job.results:
            return False

        result = job.results[file_path]
        result.review_status = ReviewStatus.ACCEPTED if accept else ReviewStatus.REJECTED
        result.review_notes = notes

        self._save_jobs()
        return True

    async def pause_job(self, job_id: str) -> bool:
        """
        Pause a running job.

        Args:
            job_id: Job identifier

        Returns:
            True if paused, False if job not found or not running
        """
        job = self._jobs.get(job_id)
        if not job or job.status != JobStatus.RUNNING:
            return False

        job.pause_event.clear()
        job.status = JobStatus.PAUSED
        self._save_jobs()

        await self._notify_websockets(job_id, {
            "type": "paused",
            "job_id": job_id,
        })

        logger.info(f"Paused job {job_id}")
        return True

    async def resume_job(self, job_id: str) -> bool:
        """
        Resume a paused job.

        Args:
            job_id: Job identifier

        Returns:
            True if resumed, False if job not found or not paused
        """
        job = self._jobs.get(job_id)
        if not job or job.status != JobStatus.PAUSED:
            return False

        job.pause_event.set()
        job.status = JobStatus.RUNNING
        self._save_jobs()

        await self._notify_websockets(job_id, {
            "type": "resumed",
            "job_id": job_id,
        })

        logger.info(f"Resumed job {job_id}")
        return True

    async def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a job.

        Args:
            job_id: Job identifier

        Returns:
            True if cancelled, False if job not found
        """
        job = self._jobs.get(job_id)
        if not job:
            return False

        job.cancel_requested = True
        job.pause_event.set()  # Unblock if paused

        if job.status in (JobStatus.PENDING, JobStatus.RUNNING, JobStatus.PAUSED):
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now().isoformat()
            self._save_jobs()

            await self._notify_websockets(job_id, {
                "type": "cancelled",
                "job_id": job_id,
            })

            logger.info(f"Cancelled job {job_id}")
        return True

    async def delete_job(self, job_id: str) -> bool:
        """
        Delete a job.

        Args:
            job_id: Job identifier

        Returns:
            True if deleted, False if job not found
        """
        if job_id not in self._jobs:
            return False

        # Cancel if running
        await self.cancel_job(job_id)

        del self._jobs[job_id]
        self._save_jobs()

        logger.info(f"Deleted job {job_id}")
        return True

    def register_websocket_handler(self, job_id: str, handler: Callable):
        """
        Register a WebSocket handler for job updates.

        Args:
            job_id: Job identifier
            handler: Async function to call with updates
        """
        if job_id not in self._websocket_handlers:
            self._websocket_handlers[job_id] = set()
        self._websocket_handlers[job_id].add(handler)

    def unregister_websocket_handler(self, job_id: str, handler: Callable):
        """
        Unregister a WebSocket handler.

        Args:
            job_id: Job identifier
            handler: Handler to remove
        """
        if job_id in self._websocket_handlers:
            self._websocket_handlers[job_id].discard(handler)
            if not self._websocket_handlers[job_id]:
                del self._websocket_handlers[job_id]

    async def _notify_websockets(self, job_id: str, message: Dict[str, Any]):
        """Send notification to all registered WebSocket handlers."""
        handlers = self._websocket_handlers.get(job_id, set()).copy()
        for handler in handlers:
            try:
                await handler(message)
            except Exception as e:
                logger.error(f"Error notifying WebSocket handler: {e}")
                self.unregister_websocket_handler(job_id, handler)

    def get_accepted_results(self, job_id: str) -> List[FileResult]:
        """
        Get all accepted results for a job.

        Args:
            job_id: Job identifier

        Returns:
            List of accepted FileResult objects
        """
        job = self._jobs.get(job_id)
        if not job:
            return []

        return [
            result for result in job.results.values()
            if result.review_status == ReviewStatus.ACCEPTED
            and result.status == "completed"
        ]

    def get_pending_review_results(self, job_id: str) -> List[FileResult]:
        """
        Get results pending review.

        Args:
            job_id: Job identifier

        Returns:
            List of FileResult objects pending review
        """
        job = self._jobs.get(job_id)
        if not job:
            return []

        return [
            result for result in job.results.values()
            if result.review_status == ReviewStatus.PENDING
            and result.status == "completed"
        ]


# Global job manager instance
_job_manager: Optional[JobManager] = None


def get_job_manager(persistence_path: Optional[str] = None) -> JobManager:
    """
    Get the global job manager instance.

    Args:
        persistence_path: Optional path for job persistence

    Returns:
        JobManager singleton instance
    """
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager(persistence_path)
    return _job_manager
