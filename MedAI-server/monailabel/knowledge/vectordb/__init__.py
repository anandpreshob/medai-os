# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Vector database module for ChromaDB integration.
"""

from .chroma_client import (
    add_documents,
    get_client,
    get_or_create_collection,
    query,
    delete_collection,
)
from .collections import (
    GUIDELINES_COLLECTION,
    ONTOLOGY_COLLECTION,
    TEMPLATES_COLLECTION,
    create_default_collections,
    get_collection_stats,
)
from .embeddings import EmbeddingService, get_embedding_service

__all__ = [
    # Client functions
    "get_client",
    "get_or_create_collection",
    "add_documents",
    "query",
    "delete_collection",
    # Collection constants and functions
    "GUIDELINES_COLLECTION",
    "TEMPLATES_COLLECTION",
    "ONTOLOGY_COLLECTION",
    "create_default_collections",
    "get_collection_stats",
    # Embedding service
    "EmbeddingService",
    "get_embedding_service",
]
