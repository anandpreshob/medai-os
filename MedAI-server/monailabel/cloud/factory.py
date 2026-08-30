# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""Factory that resolves a backend name to a :class:`CloudBatchProvider`."""

import logging
from functools import lru_cache

from monailabel.cloud.base import CloudBatchProvider

logger = logging.getLogger(__name__)


@lru_cache(maxsize=None)
def get_cloud_provider(name: str) -> CloudBatchProvider:
    """Return a (cached) provider instance for ``name``.

    Providers are imported lazily so a deployment that only uses one backend
    does not need the others' SDKs installed. Add Azure/AWS here as they land.
    """
    key = (name or "").strip().lower()

    if key in ("vertex", "gcp", "google"):
        from monailabel.cloud.vertex_provider import VertexBatchProvider

        return VertexBatchProvider()

    raise ValueError(
        f"Unknown cloud batch backend '{name}'. Supported: 'vertex'. "
        f"Set options.backend or BATCH_BACKEND to a supported value."
    )
