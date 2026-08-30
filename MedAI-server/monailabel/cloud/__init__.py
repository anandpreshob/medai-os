# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Cloud batch-inference providers.

This package abstracts "run a batch segmentation job on a managed cloud" behind
a single :class:`CloudBatchProvider` interface so the orchestrator (the
``/batch/process`` endpoint) can dispatch to Google Vertex AI today and to Azure
ML / AWS later without touching the batch/Agent contract.

Selection is by name via :func:`get_cloud_provider`. The active backend is chosen
per-job (``options["backend"]``) or per-deployment (``BATCH_BACKEND`` env), see
``monailabel/endpoints/batch_process.py``.
"""

from monailabel.cloud.base import (
    CloudBatchProvider,
    CloudFileResult,
    CloudJobState,
    CloudJobStatus,
    StagedImage,
)
from monailabel.cloud.factory import get_cloud_provider

__all__ = [
    "CloudBatchProvider",
    "CloudFileResult",
    "CloudJobState",
    "CloudJobStatus",
    "StagedImage",
    "get_cloud_provider",
]
