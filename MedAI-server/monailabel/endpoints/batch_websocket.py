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
Batch Processing WebSocket Endpoint

Provides real-time progress updates for batch processing jobs:
- WebSocket endpoint: /batch/ws/{id}
- Send progress updates (file count, current file, percentage)
- Send completion/error events
- Support for multiple connected clients per job
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

from monailabel.utils.batch.job_manager import (
    JobManager,
    JobStatus,
    get_job_manager,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/batch",
    tags=["Batch WebSocket"],
)


class ConnectionManager:
    """
    Manages WebSocket connections for batch job progress updates.

    Features:
    - Multiple clients can connect to the same job
    - Automatic cleanup on disconnect
    - Heartbeat support for connection health
    """

    def __init__(self):
        # job_id -> set of WebSocket connections
        self._active_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, job_id: str) -> bool:
        """
        Accept a new WebSocket connection for a job.

        Args:
            websocket: The WebSocket connection
            job_id: Job identifier

        Returns:
            True if connection accepted, False otherwise
        """
        try:
            await websocket.accept()

            async with self._lock:
                if job_id not in self._active_connections:
                    self._active_connections[job_id] = set()
                self._active_connections[job_id].add(websocket)

            logger.info(f"WebSocket connected for job {job_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to accept WebSocket connection: {e}")
            return False

    async def disconnect(self, websocket: WebSocket, job_id: str):
        """
        Remove a WebSocket connection.

        Args:
            websocket: The WebSocket connection
            job_id: Job identifier
        """
        async with self._lock:
            if job_id in self._active_connections:
                self._active_connections[job_id].discard(websocket)
                if not self._active_connections[job_id]:
                    del self._active_connections[job_id]

        logger.info(f"WebSocket disconnected for job {job_id}")

    async def send_to_job(self, job_id: str, message: Dict[str, Any]):
        """
        Send a message to all clients connected to a job.

        Args:
            job_id: Job identifier
            message: Message dictionary to send
        """
        async with self._lock:
            connections = self._active_connections.get(job_id, set()).copy()

        dead_connections = []

        for websocket in connections:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
                else:
                    dead_connections.append(websocket)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}")
                dead_connections.append(websocket)

        # Clean up dead connections
        for websocket in dead_connections:
            await self.disconnect(websocket, job_id)

    async def broadcast(self, message: Dict[str, Any]):
        """
        Broadcast a message to all connected clients.

        Args:
            message: Message dictionary to send
        """
        async with self._lock:
            all_jobs = list(self._active_connections.keys())

        for job_id in all_jobs:
            await self.send_to_job(job_id, message)

    def get_connection_count(self, job_id: str) -> int:
        """Get number of connections for a job."""
        return len(self._active_connections.get(job_id, set()))

    def get_connected_jobs(self) -> List[str]:
        """Get list of job IDs with active connections."""
        return list(self._active_connections.keys())


# Global connection manager
connection_manager = ConnectionManager()


async def handle_job_update(job_id: str, message: Dict[str, Any]):
    """
    Handler for job manager updates.

    This is registered with the JobManager to receive updates
    and forward them to WebSocket clients.

    Args:
        job_id: Job identifier
        message: Update message
    """
    # Add timestamp
    message["timestamp"] = datetime.now().isoformat()

    # Send to connected clients
    await connection_manager.send_to_job(job_id, message)


@router.websocket("/ws/{job_id}")
async def websocket_batch_progress(
    websocket: WebSocket,
    job_id: str,
):
    """
    WebSocket endpoint for real-time batch job progress.

    Path parameters:
    - job_id: Job identifier to monitor

    Message types sent:
    - {"type": "connected", "job_id": "...", "status": "..."}
    - {"type": "progress", "current": 1, "total": 10, "file": "...", "percentage": 10.0}
    - {"type": "result", "file": "...", "preview_id": "...", "labels": [...]}
    - {"type": "status_change", "job_id": "...", "status": "..."}
    - {"type": "paused", "job_id": "..."}
    - {"type": "resumed", "job_id": "..."}
    - {"type": "complete", "success": 8, "failed": 2, "total": 10}
    - {"type": "error", "message": "..."}
    - {"type": "heartbeat", "timestamp": "..."}

    Client commands accepted:
    - {"command": "ping"} -> responds with {"type": "pong"}
    - {"command": "status"} -> responds with current job status
    - {"command": "subscribe"} -> confirms subscription
    """
    # Get job manager
    manager = get_job_manager()

    # Verify job exists
    job = await manager.get_job(job_id)
    if not job:
        await websocket.close(code=4004, reason=f"Job {job_id} not found")
        return

    # Accept connection
    if not await connection_manager.connect(websocket, job_id):
        return

    # Register handler with job manager
    async def ws_handler(message: Dict[str, Any]):
        await connection_manager.send_to_job(job_id, message)

    manager.register_websocket_handler(job_id, ws_handler)

    try:
        # Send initial connection message with current status
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "status": job.status.value,
            "total": job.total_files,
            "processed": job.processed_count,
            "success": job.success_count,
            "failed": job.failed_count,
            "progress_percentage": round(job.progress_percentage, 2),
            "timestamp": datetime.now().isoformat(),
        })

        # If job already completed, send completion message
        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            await websocket.send_json({
                "type": "complete",
                "job_id": job_id,
                "status": job.status.value,
                "success": job.success_count,
                "failed": job.failed_count,
                "total": job.total_files,
                "timestamp": datetime.now().isoformat(),
            })

        # Handle incoming messages
        while True:
            try:
                # Wait for message with timeout for heartbeat
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0  # 30 second timeout
                )

                try:
                    message = json.loads(data)
                    command = message.get("command")

                    if command == "ping":
                        await websocket.send_json({
                            "type": "pong",
                            "timestamp": datetime.now().isoformat(),
                        })

                    elif command == "status":
                        # Refresh job data
                        job = await manager.get_job(job_id)
                        if job:
                            await websocket.send_json({
                                "type": "status",
                                "job_id": job_id,
                                "status": job.status.value,
                                "total": job.total_files,
                                "processed": job.processed_count,
                                "success": job.success_count,
                                "failed": job.failed_count,
                                "progress_percentage": round(job.progress_percentage, 2),
                                "accepted": job.accepted_count,
                                "rejected": job.rejected_count,
                                "timestamp": datetime.now().isoformat(),
                            })

                    elif command == "subscribe":
                        await websocket.send_json({
                            "type": "subscribed",
                            "job_id": job_id,
                            "timestamp": datetime.now().isoformat(),
                        })

                    elif command == "results":
                        # Send current results summary
                        job = await manager.get_job(job_id)
                        if job:
                            results_summary = []
                            for file_path, result in job.results.items():
                                results_summary.append({
                                    "file_path": file_path,
                                    "file_name": result.file_name,
                                    "status": result.status,
                                    "preview_id": result.preview_id,
                                    "labels": result.labels,
                                    "review_status": result.review_status,
                                })
                            await websocket.send_json({
                                "type": "results",
                                "job_id": job_id,
                                "results": results_summary,
                                "timestamp": datetime.now().isoformat(),
                            })

                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Unknown command: {command}",
                            "timestamp": datetime.now().isoformat(),
                        })

                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON",
                        "timestamp": datetime.now().isoformat(),
                    })

            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.now().isoformat(),
                    })
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}")
    finally:
        # Cleanup
        manager.unregister_websocket_handler(job_id, ws_handler)
        await connection_manager.disconnect(websocket, job_id)


@router.get("/ws/connections", summary="Get WebSocket connection stats")
async def get_websocket_stats() -> Dict[str, Any]:
    """
    Get statistics about active WebSocket connections.

    Returns:
    - total_connections: Total number of active connections
    - jobs_with_connections: List of job IDs with active connections
    - connection_counts: Connections per job
    """
    connected_jobs = connection_manager.get_connected_jobs()
    connection_counts = {
        job_id: connection_manager.get_connection_count(job_id)
        for job_id in connected_jobs
    }

    return {
        "total_connections": sum(connection_counts.values()),
        "jobs_with_connections": connected_jobs,
        "connection_counts": connection_counts,
        "timestamp": datetime.now().isoformat(),
    }


# Helper function to send progress update from external code
async def send_batch_progress(
    job_id: str,
    current: int,
    total: int,
    file: str,
    status: str = "processing",
    extra: Optional[Dict[str, Any]] = None,
):
    """
    Send a progress update to WebSocket clients.

    This can be called from batch processing code to send updates.

    Args:
        job_id: Job identifier
        current: Current file index (1-based)
        total: Total number of files
        file: Current file being processed
        status: Current status
        extra: Additional data to include
    """
    message = {
        "type": "progress",
        "current": current,
        "total": total,
        "file": file,
        "percentage": round((current / total) * 100, 2) if total > 0 else 0,
        "status": status,
        "timestamp": datetime.now().isoformat(),
    }

    if extra:
        message.update(extra)

    await connection_manager.send_to_job(job_id, message)


async def send_batch_result(
    job_id: str,
    file: str,
    preview_id: str,
    labels: List[str],
    confidence: Optional[float] = None,
    extra: Optional[Dict[str, Any]] = None,
):
    """
    Send a result update to WebSocket clients.

    Args:
        job_id: Job identifier
        file: File that was processed
        preview_id: Preview identifier
        labels: Detected labels
        confidence: Optional confidence score
        extra: Additional data to include
    """
    message = {
        "type": "result",
        "file": file,
        "preview_id": preview_id,
        "labels": labels,
        "confidence": confidence,
        "timestamp": datetime.now().isoformat(),
    }

    if extra:
        message.update(extra)

    await connection_manager.send_to_job(job_id, message)


async def send_batch_complete(
    job_id: str,
    success: int,
    failed: int,
    total: int,
    status: str = "completed",
):
    """
    Send completion message to WebSocket clients.

    Args:
        job_id: Job identifier
        success: Number of successfully processed files
        failed: Number of failed files
        total: Total number of files
        status: Final status
    """
    message = {
        "type": "complete",
        "job_id": job_id,
        "status": status,
        "success": success,
        "failed": failed,
        "total": total,
        "timestamp": datetime.now().isoformat(),
    }

    await connection_manager.send_to_job(job_id, message)


async def send_batch_error(
    job_id: str,
    error: str,
    file: Optional[str] = None,
):
    """
    Send error message to WebSocket clients.

    Args:
        job_id: Job identifier
        error: Error message
        file: Optional file that caused the error
    """
    message = {
        "type": "error",
        "job_id": job_id,
        "message": error,
        "file": file,
        "timestamp": datetime.now().isoformat(),
    }

    await connection_manager.send_to_job(job_id, message)
