# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Standalone FastAPI application for the Knowledge Service.
Provides RAG (Retrieval-Augmented Generation) capabilities with ChromaDB.

Port: 8005
GPU: Not required (CPU-only, uses sentence-transformers)
"""

import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import knowledge module
from monailabel.knowledge import (
    KnowledgeConfig,
    get_knowledge_config,
    QueryRequest,
    QueryResponse,
    IngestionRequest,
    IngestionResponse,
    RAGSearchResult,
)
from monailabel.knowledge.vectordb import (
    get_client,
    get_or_create_collection,
    add_documents,
    query as vectordb_query,
    create_default_collections,
    get_collection_stats,
    get_embedding_service,
    GUIDELINES_COLLECTION,
    TEMPLATES_COLLECTION,
    ONTOLOGY_COLLECTION,
)
from monailabel.knowledge.vectordb.collections import get_collection_for_source_type
from monailabel.knowledge.ingestion import (
    get_chunker,
    get_loader,
    extract_document_metadata,
)
from monailabel.knowledge.models import SourceType, CollectionStats


# =====================
# Pydantic Models
# =====================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    chroma_connected: bool
    embedding_model: Optional[str] = None
    collections_count: int = 0


class InfoResponse(BaseModel):
    """Service info response."""
    service: str
    version: str
    embedding_model: str
    embedding_dimension: int
    collections: List[str]
    endpoints: Dict[str, List[str]]


class BatchIngestionRequest(BaseModel):
    """Request to ingest multiple documents."""
    documents: List[IngestionRequest] = Field(..., description="List of documents to ingest")


class BatchIngestionResponse(BaseModel):
    """Response from batch ingestion."""
    success: bool
    total_processed: int
    successful: int
    failed: int
    results: List[IngestionResponse]


# =====================
# FastAPI Application
# =====================

app = FastAPI(
    title="MedAI Knowledge Service",
    description="RAG-based knowledge retrieval service for medical imaging",
    version="1.0.0",
    root_path="/monai",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================
# Startup Event
# =====================

@app.on_event("startup")
async def startup_event():
    """Initialize the knowledge service on startup."""
    logger.info("Initializing Knowledge Service...")

    try:
        # Initialize ChromaDB client
        client = get_client()
        logger.info("ChromaDB client initialized")

        # Create default collections
        results = create_default_collections()
        for name, success in results.items():
            status = "created/ready" if success else "failed"
            logger.info(f"Collection '{name}': {status}")

        # Initialize embedding service (lazy load)
        logger.info("Embedding service will be loaded on first use")

    except Exception as e:
        logger.error(f"Failed to initialize Knowledge Service: {e}")
        raise


# =====================
# Health Endpoints
# =====================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    try:
        config = get_knowledge_config()

        # Check ChromaDB connection
        client = get_client()
        collections = client.list_collections()
        chroma_connected = True

        return HealthResponse(
            status="healthy",
            service="knowledge",
            chroma_connected=chroma_connected,
            embedding_model=config.EMBEDDING_MODEL,
            collections_count=len(collections),
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            service="knowledge",
            chroma_connected=False,
        )


@app.get("/info", response_model=InfoResponse)
async def get_info():
    """Get service information."""
    config = get_knowledge_config()

    return InfoResponse(
        service="knowledge",
        version="1.0.0",
        embedding_model=config.EMBEDDING_MODEL,
        embedding_dimension=config.EMBEDDING_DIMENSION,
        collections=[
            GUIDELINES_COLLECTION,
            TEMPLATES_COLLECTION,
            ONTOLOGY_COLLECTION,
        ],
        endpoints={
            "query": ["/knowledge/query"],
            "collections": ["/knowledge/collections", "/knowledge/collections/{name}"],
            "ingest": ["/knowledge/ingest", "/knowledge/ingest/batch"],
            "health": ["/health", "/info"],
        },
    )


# =====================
# Query Endpoints
# =====================

@app.post("/knowledge/query", response_model=QueryResponse)
async def query_knowledge(request: QueryRequest) -> QueryResponse:
    """
    Search the knowledge base for relevant documents.

    Uses semantic similarity search with the configured embedding model.
    """
    start_time = time.time()

    try:
        if not request.query or not request.query.strip():
            return QueryResponse(
                success=False,
                error="Query cannot be empty",
                query_time_ms=0,
            )

        logger.info(f"Processing query: '{request.query[:50]}...' (top_k={request.top_k})")

        # Get embedding for query
        embedding_service = get_embedding_service()
        query_embedding = embedding_service.embed_text(request.query)

        # Build filter
        where_filter = _build_filter(request)

        # Determine which collections to search
        if request.collection_name:
            collections_to_search = [request.collection_name]
        else:
            collections_to_search = [
                GUIDELINES_COLLECTION,
                TEMPLATES_COLLECTION,
                ONTOLOGY_COLLECTION,
            ]

        all_results: List[RAGSearchResult] = []

        # Search each collection
        for collection_name in collections_to_search:
            try:
                collection = get_or_create_collection(collection_name)

                results = vectordb_query(
                    collection=collection,
                    query_embedding=query_embedding,
                    top_k=request.top_k,
                    where_filter=where_filter if where_filter else None,
                )

                # Convert to RAGSearchResult objects
                for i, doc_id in enumerate(results["ids"]):
                    distance = results["distances"][i] if results["distances"] else 0
                    # Convert distance to similarity score (cosine distance)
                    score = 1 - distance

                    # Apply minimum score filter
                    if score < request.min_score:
                        continue

                    metadata = results["metadatas"][i] if results["metadatas"] else {}
                    content = results["documents"][i] if results["documents"] else ""

                    # Determine source type from metadata
                    source_type_str = metadata.get("source_type", "reference")
                    try:
                        source_type = SourceType(source_type_str)
                    except ValueError:
                        source_type = SourceType.REFERENCE

                    # Apply source type filter if specified
                    if request.filter_type and source_type != request.filter_type:
                        continue

                    all_results.append(
                        RAGSearchResult(
                            id=doc_id,
                            content=content,
                            metadata=metadata if request.include_metadata else {},
                            score=score,
                            source_type=source_type,
                            source_path=metadata.get("source_path"),
                            title=metadata.get("title"),
                        )
                    )

            except Exception as e:
                logger.warning(f"Error searching collection {collection_name}: {e}")
                continue

        # Sort by score and limit to top_k
        all_results.sort(key=lambda x: x.score, reverse=True)
        all_results = all_results[:request.top_k]

        query_time_ms = (time.time() - start_time) * 1000

        logger.info(f"Query returned {len(all_results)} results in {query_time_ms:.1f}ms")

        return QueryResponse(
            success=True,
            results=all_results,
            total_results=len(all_results),
            query_time_ms=query_time_ms,
        )

    except Exception as e:
        logger.exception("Query failed")
        return QueryResponse(
            success=False,
            error=str(e),
            query_time_ms=(time.time() - start_time) * 1000,
        )


def _build_filter(request: QueryRequest) -> Optional[Dict[str, Any]]:
    """Build a ChromaDB where filter from the request."""
    conditions = []

    if request.modality:
        conditions.append({"modality": request.modality.value})

    if request.body_region:
        conditions.append({"body_region": request.body_region.value})

    if not conditions:
        return None

    if len(conditions) == 1:
        return conditions[0]

    return {"$and": conditions}


# =====================
# Collection Endpoints
# =====================

@app.get("/knowledge/collections", response_model=CollectionStats)
async def list_collections() -> CollectionStats:
    """List all collections with statistics."""
    try:
        return get_collection_stats()
    except Exception as e:
        logger.exception("Failed to get collection stats")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/knowledge/collections/{name}")
async def get_collection_info(name: str):
    """Get detailed information about a specific collection."""
    try:
        collection = get_or_create_collection(name)

        return {
            "name": collection.name,
            "document_count": collection.count(),
            "metadata": collection.metadata,
        }
    except Exception as e:
        logger.error(f"Failed to get collection {name}: {e}")
        raise HTTPException(status_code=404, detail=f"Collection not found: {name}")


# =====================
# Ingestion Endpoints
# =====================

@app.post("/knowledge/ingest", response_model=IngestionResponse)
async def ingest_document(request: IngestionRequest) -> IngestionResponse:
    """
    Ingest a document into the knowledge base.

    The document will be:
    1. Loaded using the appropriate loader
    2. Split into chunks using the appropriate chunker
    3. Embedded using sentence-transformers
    4. Stored in the appropriate ChromaDB collection
    """
    start_time = time.time()

    try:
        # Validate file exists
        if not os.path.exists(request.source_path):
            return IngestionResponse(
                success=False,
                collection_name="",
                error=f"File not found: {request.source_path}",
            )

        # Get appropriate loader
        loader = get_loader(request.source_path)
        if loader is None:
            return IngestionResponse(
                success=False,
                collection_name="",
                error=f"Unsupported file type: {request.source_path}",
            )

        logger.info(f"Ingesting document: {request.source_path}")

        # Load document
        content, file_metadata = loader.load(request.source_path)

        if not content or not content.strip():
            return IngestionResponse(
                success=False,
                collection_name="",
                error="Document has no extractable content",
            )

        # Extract metadata
        metadata = extract_document_metadata(
            request.source_path,
            content,
            existing_metadata={
                **file_metadata,
                **request.metadata,
                "source_type": request.source_type.value,
            },
        )

        if request.modality:
            metadata["modality"] = request.modality.value
        if request.body_region:
            metadata["body_region"] = request.body_region.value
        if request.title:
            metadata["title"] = request.title

        # Get appropriate chunker
        chunker = get_chunker(request.source_type)

        # Chunk document
        chunks = chunker.chunk(content, request.source_path, metadata)

        if not chunks:
            return IngestionResponse(
                success=False,
                collection_name="",
                error="Document produced no chunks",
            )

        logger.info(f"Created {len(chunks)} chunks")

        # Get embeddings
        embedding_service = get_embedding_service()
        chunk_texts = [c.content for c in chunks]
        embeddings = embedding_service.embed_batch(chunk_texts)

        # Determine collection
        collection_name = request.collection_name or get_collection_for_source_type(
            request.source_type.value
        )
        collection = get_or_create_collection(collection_name)

        # Prepare data for ChromaDB
        ids = [c.id for c in chunks]
        documents = chunk_texts
        metadatas = [c.metadata for c in chunks]

        # Add to collection
        add_documents(
            collection=collection,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )

        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Ingested {len(chunks)} chunks into {collection_name} "
            f"in {processing_time_ms:.1f}ms"
        )

        return IngestionResponse(
            success=True,
            document_id=ids[0] if ids else None,
            chunks_created=len(chunks),
            collection_name=collection_name,
            processing_time_ms=processing_time_ms,
        )

    except Exception as e:
        logger.exception(f"Ingestion failed: {e}")
        return IngestionResponse(
            success=False,
            collection_name="",
            error=str(e),
            processing_time_ms=(time.time() - start_time) * 1000,
        )


@app.post("/knowledge/ingest/batch", response_model=BatchIngestionResponse)
async def ingest_batch(request: BatchIngestionRequest) -> BatchIngestionResponse:
    """Ingest multiple documents in batch."""
    results = []
    successful = 0
    failed = 0

    for doc_request in request.documents:
        result = await ingest_document(doc_request)
        results.append(result)

        if result.success:
            successful += 1
        else:
            failed += 1

    return BatchIngestionResponse(
        success=failed == 0,
        total_processed=len(request.documents),
        successful=successful,
        failed=failed,
        results=results,
    )


# =====================
# Main
# =====================

if __name__ == "__main__":
    import uvicorn

    config = get_knowledge_config()
    uvicorn.run(
        app,
        host=config.KNOWLEDGE_SERVICE_HOST,
        port=config.KNOWLEDGE_SERVICE_PORT,
    )
