# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
ChromaDB client wrapper with singleton pattern.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings

from ..config import get_knowledge_config

logger = logging.getLogger(__name__)

# Singleton client instance
_chroma_client: Optional[chromadb.Client] = None


def get_client() -> chromadb.Client:
    """
    Get or create the ChromaDB client singleton.

    Uses persistent storage by default. Can connect to a remote
    ChromaDB server if CHROMA_HOST is configured.

    Returns:
        chromadb.Client: The ChromaDB client instance
    """
    global _chroma_client

    if _chroma_client is not None:
        return _chroma_client

    config = get_knowledge_config()

    # Check if using client-server mode
    if config.CHROMA_HOST:
        logger.info(f"Connecting to ChromaDB server at {config.CHROMA_HOST}:{config.CHROMA_PORT}")
        _chroma_client = chromadb.HttpClient(
            host=config.CHROMA_HOST,
            port=config.CHROMA_PORT,
        )
    else:
        # Ensure persist directory exists
        persist_dir = config.CHROMA_PERSIST_DIR
        os.makedirs(persist_dir, exist_ok=True)

        logger.info(f"Initializing ChromaDB with persistent storage at {persist_dir}")
        _chroma_client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True,
            ),
        )

    return _chroma_client


def get_or_create_collection(
    name: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> chromadb.Collection:
    """
    Get or create a ChromaDB collection.

    Args:
        name: Collection name
        metadata: Optional metadata for the collection

    Returns:
        chromadb.Collection: The collection instance
    """
    client = get_client()

    collection_metadata = metadata or {}
    collection_metadata.setdefault("hnsw:space", "cosine")  # Use cosine similarity

    logger.debug(f"Getting or creating collection: {name}")

    return client.get_or_create_collection(
        name=name,
        metadata=collection_metadata,
    )


def add_documents(
    collection: chromadb.Collection,
    documents: List[str],
    embeddings: List[List[float]],
    metadatas: List[Dict[str, Any]],
    ids: List[str],
) -> bool:
    """
    Add documents to a ChromaDB collection.

    Args:
        collection: The target collection
        documents: List of document texts
        embeddings: List of embedding vectors
        metadatas: List of metadata dicts
        ids: List of unique IDs

    Returns:
        bool: True if successful
    """
    if not documents:
        logger.warning("No documents to add")
        return True

    if len(documents) != len(embeddings) != len(metadatas) != len(ids):
        raise ValueError("All input lists must have the same length")

    logger.info(f"Adding {len(documents)} documents to collection {collection.name}")

    # Clean metadata - ChromaDB only supports str, int, float, bool
    cleaned_metadatas = []
    for meta in metadatas:
        cleaned = {}
        for key, value in meta.items():
            if value is None:
                continue
            if isinstance(value, (str, int, float, bool)):
                cleaned[key] = value
            elif isinstance(value, list):
                # Convert lists to comma-separated strings
                cleaned[key] = ",".join(str(v) for v in value)
            else:
                cleaned[key] = str(value)
        cleaned_metadatas.append(cleaned)

    collection.add(
        documents=documents,
        embeddings=embeddings,
        metadatas=cleaned_metadatas,
        ids=ids,
    )

    return True


def query(
    collection: chromadb.Collection,
    query_embedding: List[float],
    top_k: int = 5,
    where_filter: Optional[Dict[str, Any]] = None,
    include_documents: bool = True,
    include_metadatas: bool = True,
    include_distances: bool = True,
) -> Dict[str, Any]:
    """
    Query a ChromaDB collection.

    Args:
        collection: The collection to query
        query_embedding: The query vector
        top_k: Number of results to return
        where_filter: Optional metadata filter
        include_documents: Include document text in results
        include_metadatas: Include metadata in results
        include_distances: Include distance scores in results

    Returns:
        Dict with 'ids', 'documents', 'metadatas', 'distances' keys
    """
    logger.debug(f"Querying collection {collection.name} for top {top_k} results")

    include = []
    if include_documents:
        include.append("documents")
    if include_metadatas:
        include.append("metadatas")
    if include_distances:
        include.append("distances")

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_filter,
        include=include,
    )

    # Flatten results (query returns nested lists for batch queries)
    return {
        "ids": results.get("ids", [[]])[0],
        "documents": results.get("documents", [[]])[0] if include_documents else [],
        "metadatas": results.get("metadatas", [[]])[0] if include_metadatas else [],
        "distances": results.get("distances", [[]])[0] if include_distances else [],
    }


def delete_collection(name: str) -> bool:
    """
    Delete a collection by name.

    Args:
        name: Collection name to delete

    Returns:
        bool: True if deleted, False if not found
    """
    client = get_client()

    try:
        client.delete_collection(name)
        logger.info(f"Deleted collection: {name}")
        return True
    except Exception as e:
        logger.warning(f"Could not delete collection {name}: {e}")
        return False


def reset_client() -> None:
    """Reset the ChromaDB client singleton (for testing)."""
    global _chroma_client
    _chroma_client = None
