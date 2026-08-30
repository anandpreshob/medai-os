# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Google Vertex AI implementation of :class:`CloudBatchProvider`.

Runs each batch as a Vertex AI **Custom Job**: one GPU container invocation
(``VERTEX_AR_IMAGE`` — the inference image with the ``vertex_predict`` entrypoint)
loads the model once and processes every file, reading inputs from and writing
masks to a GCS staging bucket. This provider only stages/submits/polls/fetches;
all datastore and DICOM-SEG work stays in the orchestrator.

GCS layout per job::

    gs://{bucket}/jobs/{job_id}/request.json
    gs://{bucket}/jobs/{job_id}/inputs/{image_id}.nii.gz
    gs://{bucket}/jobs/{job_id}/outputs/{image_id}.nii.gz
    gs://{bucket}/jobs/{job_id}/outputs/manifest.json

Credentials come from Application Default Credentials
(``GOOGLE_APPLICATION_CREDENTIALS`` pointing at the mounted service-account key).
"""

import json
import logging
import os
import re
from typing import Any, Dict, List

from monailabel.cloud.base import (
    CloudBatchProvider,
    CloudFileResult,
    CloudJobState,
    CloudJobStatus,
    StagedImage,
)

logger = logging.getLogger(__name__)

# Vertex JobState (aiplatform) -> normalized status.
_STATE_MAP = {
    "JOB_STATE_QUEUED": CloudJobStatus.PENDING,
    "JOB_STATE_PENDING": CloudJobStatus.PENDING,
    "JOB_STATE_RUNNING": CloudJobStatus.RUNNING,
    "JOB_STATE_SUCCEEDED": CloudJobStatus.SUCCEEDED,
    "JOB_STATE_FAILED": CloudJobStatus.FAILED,
    "JOB_STATE_CANCELLING": CloudJobStatus.CANCELLED,
    "JOB_STATE_CANCELLED": CloudJobStatus.CANCELLED,
    "JOB_STATE_PAUSED": CloudJobStatus.RUNNING,
    "JOB_STATE_EXPIRED": CloudJobStatus.FAILED,
    "JOB_STATE_UPDATING": CloudJobStatus.RUNNING,
}


def _safe_name(image_id: str) -> str:
    """Make an image id safe to use as a GCS object leaf name."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", str(image_id))


class VertexBatchProvider(CloudBatchProvider):
    name = "vertex"

    def __init__(self) -> None:
        self.project = os.environ.get("GCP_PROJECT", "").strip()
        self.region = os.environ.get("GCP_REGION", "us-central1").strip()
        self.bucket = os.environ.get("GCS_BUCKET", "").strip().replace("gs://", "").rstrip("/")
        self.image_uri = os.environ.get("VERTEX_AR_IMAGE", "").strip()
        self.machine_type = os.environ.get("VERTEX_MACHINE_TYPE", "n1-standard-8").strip()
        self.accelerator_type = os.environ.get("VERTEX_ACCELERATOR_TYPE", "NVIDIA_TESLA_T4").strip()
        self.accelerator_count = int(os.environ.get("VERTEX_ACCELERATOR_COUNT", "1"))
        self.service_account = os.environ.get("VERTEX_SERVICE_ACCOUNT", "").strip() or None

        missing = [
            k
            for k, v in {
                "GCP_PROJECT": self.project,
                "GCS_BUCKET": self.bucket,
                "VERTEX_AR_IMAGE": self.image_uri,
            }.items()
            if not v
        ]
        if missing:
            raise RuntimeError(
                f"Vertex backend is not configured; missing env: {', '.join(missing)}"
            )

    # -- lazy SDK handles ----------------------------------------------------

    def _storage_bucket(self):
        from google.cloud import storage

        client = storage.Client(project=self.project)
        return client.bucket(self.bucket)

    def _aiplatform(self):
        from google.cloud import aiplatform

        aiplatform.init(
            project=self.project,
            location=self.region,
            staging_bucket=f"gs://{self.bucket}",
        )
        return aiplatform

    def _job_prefix(self, job_id: str) -> str:
        return f"jobs/{job_id}"

    def _gs_uri(self, job_id: str) -> str:
        return f"gs://{self.bucket}/{self._job_prefix(job_id)}"

    # -- CloudBatchProvider --------------------------------------------------

    def stage_inputs(
        self,
        job_id: str,
        images: List[StagedImage],
        request: Dict[str, Any],
    ) -> str:
        bucket = self._storage_bucket()
        prefix = self._job_prefix(job_id)

        # Map each image id to its object leaf so the worker + fetch agree.
        id_to_leaf = {img.image_id: _safe_name(img.image_id) for img in images}

        for img in images:
            leaf = id_to_leaf[img.image_id]
            blob = bucket.blob(f"{prefix}/inputs/{leaf}.nii.gz")
            blob.upload_from_filename(img.local_path)
            logger.info("Staged %s -> gs://%s/%s/inputs/%s.nii.gz", img.image_id, self.bucket, prefix, leaf)

        manifest = {
            "job_id": job_id,
            "model": request.get("model"),
            "prompt": request.get("prompt"),
            "options": request.get("options") or {},
            # Preserve id<->leaf mapping so the worker labels outputs by original id.
            "images": [{"image_id": i, "leaf": l} for i, l in id_to_leaf.items()],
        }
        bucket.blob(f"{prefix}/request.json").upload_from_string(
            json.dumps(manifest, indent=2), content_type="application/json"
        )
        return self._gs_uri(job_id)

    def submit_job(self, job_id: str, staged_uri: str) -> str:
        aiplatform = self._aiplatform()

        machine_spec: Dict[str, Any] = {"machine_type": self.machine_type}
        if self.accelerator_count > 0 and self.accelerator_type:
            machine_spec["accelerator_type"] = self.accelerator_type
            machine_spec["accelerator_count"] = self.accelerator_count

        worker_pool_specs = [
            {
                "machine_spec": machine_spec,
                "replica_count": 1,
                "container_spec": {
                    "image_uri": self.image_uri,
                    "args": ["--job-gcs-uri", staged_uri],
                },
            }
        ]

        job = aiplatform.CustomJob(
            display_name=f"medai-seg-{job_id[:12]}",
            worker_pool_specs=worker_pool_specs,
        )
        # submit() is non-blocking (does not wait for completion).
        job.submit(service_account=self.service_account)
        resource_name = job.resource_name
        logger.info("Submitted Vertex CustomJob %s for batch job %s", resource_name, job_id)
        return resource_name

    def poll_job(self, provider_job_id: str) -> CloudJobState:
        aiplatform = self._aiplatform()
        job = aiplatform.CustomJob.get(resource_name=provider_job_id)
        raw = getattr(job.state, "name", str(job.state))
        status = _STATE_MAP.get(raw, CloudJobStatus.RUNNING)
        message = None
        if status == CloudJobStatus.FAILED:
            err = getattr(job, "error", None)
            message = getattr(err, "message", None) or str(err) if err else "Vertex job failed"
        return CloudJobState(status=status, message=message, raw_state=raw)

    def fetch_results(self, job_id: str, dest_dir: str) -> List[CloudFileResult]:
        bucket = self._storage_bucket()
        prefix = self._job_prefix(job_id)
        os.makedirs(dest_dir, exist_ok=True)

        manifest_blob = bucket.blob(f"{prefix}/outputs/manifest.json")
        if not manifest_blob.exists():
            raise RuntimeError(
                f"Vertex job {job_id} produced no outputs/manifest.json — the worker may have crashed."
            )
        manifest = json.loads(manifest_blob.download_as_text())

        results: List[CloudFileResult] = []
        for entry in manifest.get("results", []):
            image_id = entry.get("image_id")
            status = entry.get("status", "failed")
            if status != "completed":
                results.append(
                    CloudFileResult(
                        image_id=image_id,
                        status="failed",
                        error=entry.get("error") or "worker reported failure",
                        processing_time=entry.get("processing_time"),
                    )
                )
                continue

            leaf = entry.get("leaf") or _safe_name(image_id)
            local_mask = os.path.join(dest_dir, f"{leaf}.nii.gz")
            mask_blob = bucket.blob(f"{prefix}/outputs/{leaf}.nii.gz")
            if not mask_blob.exists():
                results.append(
                    CloudFileResult(
                        image_id=image_id,
                        status="failed",
                        error=f"mask missing in GCS: outputs/{leaf}.nii.gz",
                    )
                )
                continue
            mask_blob.download_to_filename(local_mask)

            results.append(
                CloudFileResult(
                    image_id=image_id,
                    status="completed",
                    local_mask_path=local_mask,
                    labels=entry.get("labels") or [],
                    confidence=entry.get("confidence"),
                    processing_time=entry.get("processing_time"),
                    metadata=entry.get("metadata") or {},
                )
            )
        return results

    def cancel_job(self, provider_job_id: str) -> None:
        try:
            aiplatform = self._aiplatform()
            job = aiplatform.CustomJob.get(resource_name=provider_job_id)
            job.cancel()
            logger.info("Requested cancel of Vertex CustomJob %s", provider_job_id)
        except Exception as e:  # noqa: BLE001 - cancel is best effort
            logger.warning("Failed to cancel Vertex job %s: %s", provider_job_id, e)
