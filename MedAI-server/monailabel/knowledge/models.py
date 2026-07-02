# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Pydantic models for the Knowledge Service API.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """Types of document sources."""

    GUIDELINE = "guideline"
    TEMPLATE = "template"
    ONTOLOGY = "ontology"
    CLINICAL_PROTOCOL = "clinical_protocol"
    RESEARCH_PAPER = "research_paper"
    REFERENCE = "reference"


class Modality(str, Enum):
    """Medical imaging modalities."""

    CT = "CT"
    MR = "MR"
    XR = "XR"
    CR = "CR"
    US = "US"
    MG = "MG"
    NM = "NM"
    PT = "PT"
    DX = "DX"
    ALL = "ALL"


class BodyRegion(str, Enum):
    """Body regions for filtering."""

    HEAD = "head"
    NECK = "neck"
    CHEST = "chest"
    ABDOMEN = "abdomen"
    PELVIS = "pelvis"
    SPINE = "spine"
    EXTREMITY = "extremity"
    BREAST = "breast"
    CARDIAC = "cardiac"
    WHOLE_BODY = "whole_body"
    ALL = "all"


class RAGSearchResult(BaseModel):
    """A single search result from the vector database."""

    id: str = Field(..., description="Unique identifier for the document chunk")
    content: str = Field(..., description="The text content of the chunk")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Metadata associated with the chunk"
    )
    score: float = Field(..., description="Similarity score (0-1, higher is better)")
    source_type: SourceType = Field(..., description="Type of the source document")
    source_path: Optional[str] = Field(None, description="Original file path")
    title: Optional[str] = Field(None, description="Document title")


class DocumentChunk(BaseModel):
    """A chunk of a document for storage in the vector database."""

    id: str = Field(..., description="Unique identifier for the chunk")
    content: str = Field(..., description="The text content of the chunk")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Metadata for the chunk"
    )
    embedding: Optional[List[float]] = Field(
        None, description="Vector embedding of the content"
    )
    source_path: Optional[str] = Field(None, description="Path to source document")
    chunk_index: int = Field(0, description="Index of this chunk in the document")
    total_chunks: int = Field(1, description="Total chunks in the source document")


class IngestionRequest(BaseModel):
    """Request to ingest a new document."""

    source_path: str = Field(..., description="Path to the document file")
    source_type: SourceType = Field(..., description="Type of the document")
    collection_name: Optional[str] = Field(
        None, description="Target collection (auto-selected if not provided)"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata to attach"
    )
    modality: Optional[Modality] = Field(None, description="Relevant imaging modality")
    body_region: Optional[BodyRegion] = Field(None, description="Relevant body region")
    title: Optional[str] = Field(None, description="Document title")
    force_reindex: bool = Field(False, description="Force re-ingestion if exists")


class IngestionResponse(BaseModel):
    """Response from document ingestion."""

    success: bool = Field(..., description="Whether ingestion succeeded")
    document_id: Optional[str] = Field(None, description="ID of the ingested document")
    chunks_created: int = Field(0, description="Number of chunks created")
    collection_name: str = Field(..., description="Collection the document was added to")
    error: Optional[str] = Field(None, description="Error message if failed")
    processing_time_ms: float = Field(0, description="Time taken to process")


class QueryRequest(BaseModel):
    """Request to query the knowledge base."""

    query: str = Field(..., description="The search query text")
    top_k: int = Field(5, ge=1, le=20, description="Number of results to return")
    filter_type: Optional[SourceType] = Field(
        None, description="Filter by source type"
    )
    modality: Optional[Modality] = Field(None, description="Filter by modality")
    body_region: Optional[BodyRegion] = Field(None, description="Filter by body region")
    collection_name: Optional[str] = Field(
        None, description="Specific collection to search"
    )
    include_metadata: bool = Field(True, description="Include metadata in results")
    min_score: float = Field(0.0, ge=0.0, le=1.0, description="Minimum similarity score")


class QueryResponse(BaseModel):
    """Response from a knowledge base query."""

    success: bool = Field(..., description="Whether the query succeeded")
    results: List[RAGSearchResult] = Field(
        default_factory=list, description="Search results"
    )
    total_results: int = Field(0, description="Total number of matching results")
    query_time_ms: float = Field(0, description="Time taken to execute query")
    error: Optional[str] = Field(None, description="Error message if failed")


class CollectionInfo(BaseModel):
    """Information about a collection."""

    name: str = Field(..., description="Collection name")
    document_count: int = Field(0, description="Number of documents")
    description: Optional[str] = Field(None, description="Collection description")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Collection metadata"
    )


class CollectionStats(BaseModel):
    """Statistics for all collections."""

    collections: List[CollectionInfo] = Field(
        default_factory=list, description="List of collections"
    )
    total_documents: int = Field(0, description="Total documents across all collections")
    total_collections: int = Field(0, description="Number of collections")
