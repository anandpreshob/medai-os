# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
MCP Tool Schemas - Pydantic models for tool inputs and outputs.
"""

from .tool_schemas import (
    # Local RAG Search
    LocalRAGSearchInput,
    LocalRAGSearchOutput,
    RAGResultItem,
    # PubMed Search
    PubMedSearchInput,
    PubMedSearchOutput,
    PubMedArticleItem,
    # Semantic Scholar Search
    SemanticScholarSearchInput,
    SemanticScholarSearchOutput,
    SemanticScholarPaperItem,
    # Case Context
    SegmentationInfo,
    DetectionInfo,
    CaseContextInput,
    CaseContextOutput,
    # Report Agent
    ReportAgentInput,
    ReportAgentOutput,
    # Evidence Summarizer
    EvidenceSummarizerInput,
    EvidenceSummarizerOutput,
)

from .annotation_schemas import (
    # Run Segmentation
    PointPrompt,
    RunSegmentationInput,
    RunSegmentationOutput,
    SegmentationLabel,
    # Save Annotation
    SaveAnnotationInput,
    SaveAnnotationOutput,
    SavedFileInfo,
    # Load Session
    LoadSessionInput,
    LoadSessionOutput,
    SessionSegmentationInfo,
    # Batch Process
    BatchProcessInput,
    BatchProcessOutput,
    BatchJobStatus,
    # Edit Annotation
    EditAnnotationInput,
    EditAnnotationOutput,
    # Common
    AnnotationErrorResponse,
    ConfirmationRequest,
)

__all__ = [
    # Local RAG Search
    "LocalRAGSearchInput",
    "LocalRAGSearchOutput",
    "RAGResultItem",
    # PubMed Search
    "PubMedSearchInput",
    "PubMedSearchOutput",
    "PubMedArticleItem",
    # Semantic Scholar Search
    "SemanticScholarSearchInput",
    "SemanticScholarSearchOutput",
    "SemanticScholarPaperItem",
    # Case Context
    "SegmentationInfo",
    "DetectionInfo",
    "CaseContextInput",
    "CaseContextOutput",
    # Report Agent
    "ReportAgentInput",
    "ReportAgentOutput",
    # Evidence Summarizer
    "EvidenceSummarizerInput",
    "EvidenceSummarizerOutput",
    # Annotation - Run Segmentation
    "PointPrompt",
    "RunSegmentationInput",
    "RunSegmentationOutput",
    "SegmentationLabel",
    # Annotation - Save
    "SaveAnnotationInput",
    "SaveAnnotationOutput",
    "SavedFileInfo",
    # Annotation - Load Session
    "LoadSessionInput",
    "LoadSessionOutput",
    "SessionSegmentationInfo",
    # Annotation - Batch Process
    "BatchProcessInput",
    "BatchProcessOutput",
    "BatchJobStatus",
    # Annotation - Edit
    "EditAnnotationInput",
    "EditAnnotationOutput",
    # Annotation - Common
    "AnnotationErrorResponse",
    "ConfirmationRequest",
]
