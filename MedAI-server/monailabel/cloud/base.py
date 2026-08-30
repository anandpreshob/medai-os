# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Provider-agnostic contract for running a batch segmentation job on a managed
cloud (Vertex AI, Azure ML, SageMaker, ...).

A provider is responsible for four things and nothing else:

  1. ``stage_inputs``  — upload local NIfTI inputs + a request manifest to the
     cloud, returning an opaque staging handle.
  2. ``submit_job``    — launch the remote batch job over the staged inputs,
     returning an opaque provider job id.
  3. ``poll_job``      — report the normalized state of a submitted job.
  4. ``fetch_results`` — download the output masks + manifest locally.

The orchestrator (``batch_process._run_cloud_batch_inference``) owns everything
else: talking to the datastore/PACS, updating the shared ``JobManager``, and the
DICOM-SEG write-back. That keeps the Agent window and job contract unchanged
regardless of which cloud runs the GPU work.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class CloudJobStatus(str, Enum):
    """Normalized cloud job state, provider-independent."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def is_terminal(self) -> bool:
        return self in (
            CloudJobStatus.SUCCEEDED,
            CloudJobStatus.FAILED,
            CloudJobStatus.CANCELLED,
        )


@dataclass
class StagedImage:
    """A single input volume to run inference on."""

    image_id: str
    local_path: str


@dataclass
class CloudJobState:
    """Normalized result of ``poll_job``."""

    status: CloudJobStatus
    message: Optional[str] = None
    raw_state: Optional[str] = None


@dataclass
class CloudFileResult:
    """Per-image result of ``fetch_results`` (masks already downloaded locally)."""

    image_id: str
    status: str = "completed"  # completed | failed
    local_mask_path: Optional[str] = None
    labels: List[str] = field(default_factory=list)
    confidence: Optional[float] = None
    error: Optional[str] = None
    processing_time: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class CloudBatchProvider(ABC):
    """Interface every cloud backend implements. Methods are synchronous and are
    called from a background task; keep them blocking (no asyncio) — the caller
    runs them in a worker context and polls between calls."""

    #: Short provider name, e.g. "vertex".
    name: str = "base"

    @abstractmethod
    def stage_inputs(
        self,
        job_id: str,
        images: List[StagedImage],
        request: Dict[str, Any],
    ) -> str:
        """Upload the input volumes and a ``request.json`` manifest for ``job_id``.

        ``request`` carries ``{model, prompt, options, image_ids}`` so the remote
        worker is fully self-describing. Returns an opaque staging URI (e.g. a
        ``gs://`` prefix) understood by :meth:`submit_job`.
        """

    @abstractmethod
    def submit_job(self, job_id: str, staged_uri: str) -> str:
        """Launch the remote batch job over ``staged_uri``. Returns an opaque
        provider job id/resource name for :meth:`poll_job` / :meth:`cancel_job`."""

    @abstractmethod
    def poll_job(self, provider_job_id: str) -> CloudJobState:
        """Return the current normalized state of a submitted job."""

    @abstractmethod
    def fetch_results(self, job_id: str, dest_dir: str) -> List[CloudFileResult]:
        """Download output masks + manifest for ``job_id`` into ``dest_dir`` and
        return one :class:`CloudFileResult` per input image."""

    @abstractmethod
    def cancel_job(self, provider_job_id: str) -> None:
        """Best-effort cancellation of a running job."""
