# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
External API clients for medical literature search.

This module provides async clients for querying external medical and
academic literature databases, with built-in PHI filtering, caching,
and rate limiting.

Supported APIs:
- PubMed (NCBI E-utilities)
- Semantic Scholar Academic Graph API

Example usage:
    from monailabel.knowledge.external import PubMedClient, SemanticScholarClient

    async def search_literature():
        async with PubMedClient() as pubmed:
            articles = await pubmed.search("lung cancer imaging", max_results=10)

        async with SemanticScholarClient() as s2:
            papers = await s2.search("medical image segmentation", max_results=10)
"""

from .base_client import ExternalAPIClient, RateLimiter
from .cache import CacheManager, cached, generate_cache_key
from .config import ExternalAPIConfig, get_config, reset_config
from .models import (
    Author,
    ExternalSearchResult,
    PHIMatch,
    PubMedArticle,
    SearchQuery,
    SearchResponse,
    SemanticScholarPaper,
)
from .phi_filter import PHIFilter, filter_phi, get_phi_filter
from .pubmed_client import PubMedClient
from .semantic_scholar import SemanticScholarClient

__all__ = [
    # Clients
    "PubMedClient",
    "SemanticScholarClient",
    "ExternalAPIClient",
    # Models
    "PubMedArticle",
    "SemanticScholarPaper",
    "Author",
    "PHIMatch",
    "ExternalSearchResult",
    "SearchQuery",
    "SearchResponse",
    # PHI filtering
    "PHIFilter",
    "filter_phi",
    "get_phi_filter",
    # Configuration
    "ExternalAPIConfig",
    "get_config",
    "reset_config",
    # Caching
    "CacheManager",
    "cached",
    "generate_cache_key",
    # Utilities
    "RateLimiter",
]
