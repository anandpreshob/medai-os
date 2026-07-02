# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Collection management for the Knowledge Service.
"""

import logging
from typing import Dict, List, Optional

from ..config import get_knowledge_config
from ..models import CollectionInfo, CollectionStats
from .chroma_client import get_client, get_or_create_collection

logger = logging.getLogger(__name__)

# Collection name constants
GUIDELINES_COLLECTION = "medai_guidelines"
TEMPLATES_COLLECTION = "medai_templates"
ONTOLOGY_COLLECTION = "medai_ontology"

# Collection metadata definitions
COLLECTION_DEFINITIONS = {
    GUIDELINES_COLLECTION: {
        "description": "Clinical guidelines and best practices for radiology",
        "source_types": ["guideline", "clinical_protocol", "reference"],
        "hnsw:space": "cosine",
    },
    TEMPLATES_COLLECTION: {
        "description": "Report templates and structured forms",
        "source_types": ["template"],
        "hnsw:space": "cosine",
    },
    ONTOLOGY_COLLECTION: {
        "description": "Medical ontologies including RadLex terminology",
        "source_types": ["ontology"],
        "hnsw:space": "cosine",
    },
}


def create_default_collections() -> Dict[str, bool]:
    """
    Create all default collections if they don't exist.

    Returns:
        Dict mapping collection names to creation success status
    """
    results = {}

    for name, metadata in COLLECTION_DEFINITIONS.items():
        try:
            collection = get_or_create_collection(name, metadata)
            results[name] = True
            logger.info(f"Collection '{name}' ready with {collection.count()} documents")
        except Exception as e:
            logger.error(f"Failed to create collection '{name}': {e}")
            results[name] = False

    return results


def get_collection_stats() -> CollectionStats:
    """
    Get statistics for all collections.

    Returns:
        CollectionStats with info about all collections
    """
    client = get_client()
    collections_info: List[CollectionInfo] = []
    total_docs = 0

    try:
        # List all collections
        collections = client.list_collections()

        for col in collections:
            try:
                count = col.count()
                total_docs += count

                collections_info.append(
                    CollectionInfo(
                        name=col.name,
                        document_count=count,
                        description=col.metadata.get("description") if col.metadata else None,
                        metadata=col.metadata or {},
                    )
                )
            except Exception as e:
                logger.warning(f"Error getting stats for collection {col.name}: {e}")
                collections_info.append(
                    CollectionInfo(
                        name=col.name,
                        document_count=0,
                        description="Error retrieving stats",
                    )
                )

    except Exception as e:
        logger.error(f"Error listing collections: {e}")

    return CollectionStats(
        collections=collections_info,
        total_documents=total_docs,
        total_collections=len(collections_info),
    )


def get_collection_for_source_type(source_type: str) -> str:
    """
    Determine which collection to use based on source type.

    Args:
        source_type: The type of source document

    Returns:
        Collection name to use
    """
    source_type_lower = source_type.lower()

    for collection_name, metadata in COLLECTION_DEFINITIONS.items():
        if source_type_lower in metadata.get("source_types", []):
            return collection_name

    # Default to guidelines for unknown types
    logger.warning(f"Unknown source type '{source_type}', using guidelines collection")
    return GUIDELINES_COLLECTION


def collection_exists(name: str) -> bool:
    """
    Check if a collection exists.

    Args:
        name: Collection name

    Returns:
        bool: True if collection exists
    """
    client = get_client()

    try:
        collections = client.list_collections()
        return any(col.name == name for col in collections)
    except Exception:
        return False


def get_collection_count(name: str) -> int:
    """
    Get document count for a collection.

    Args:
        name: Collection name

    Returns:
        Number of documents, or 0 if collection doesn't exist
    """
    try:
        collection = get_or_create_collection(name)
        return collection.count()
    except Exception:
        return 0
