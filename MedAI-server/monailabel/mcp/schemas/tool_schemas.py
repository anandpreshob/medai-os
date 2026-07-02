# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Pydantic schemas for all MCP tool inputs and outputs.

These schemas define the contract for LLM function calling and
ensure type safety across the MCP tool ecosystem.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Local RAG Search Schemas
# =============================================================================


class LocalRAGSearchInput(BaseModel):
    """Input schema for local RAG (vector database) search."""

    query: str = Field(
        ...,
        description="Search query for finding relevant guidelines, templates, or ontology terms",
        min_length=1,
    )
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of results to return",
    )
    filter_type: Literal["guideline", "template", "ontology", "all"] = Field(
        default="all",
        description="Filter results by source type",
    )
    modality: Optional[str] = Field(
        default=None,
        description="Filter by imaging modality (CT, MR, XR, US, etc.)",
    )
    body_region: Optional[str] = Field(
        default=None,
        description="Filter by body region (chest, abdomen, brain, etc.)",
    )


class RAGResultItem(BaseModel):
    """A single result from the local RAG search."""

    id: str = Field(..., description="Unique document chunk ID")
    content: str = Field(..., description="Text content of the chunk")
    source_type: str = Field(..., description="Type of source (guideline, template, ontology)")
    source_path: Optional[str] = Field(None, description="Path to source document")
    title: Optional[str] = Field(None, description="Document title")
    score: float = Field(..., description="Relevance score (0-1)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class LocalRAGSearchOutput(BaseModel):
    """Output schema for local RAG search."""

    results: List[RAGResultItem] = Field(
        default_factory=list,
        description="List of matching results",
    )
    total_found: int = Field(
        default=0,
        description="Total number of matching documents",
    )
    query_time_ms: float = Field(
        default=0,
        description="Time taken to execute query in milliseconds",
    )


# =============================================================================
# PubMed Search Schemas
# =============================================================================


class PubMedSearchInput(BaseModel):
    """Input schema for PubMed literature search."""

    query: str = Field(
        ...,
        description="Search query for PubMed (will be PHI-filtered before sending)",
        min_length=1,
    )
    max_results: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of articles to return",
    )
    date_range_years: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Limit to articles published within N years",
    )


class PubMedArticleItem(BaseModel):
    """A single PubMed article result."""

    pmid: str = Field(..., description="PubMed ID")
    title: str = Field(..., description="Article title")
    authors: List[str] = Field(default_factory=list, description="List of author names")
    abstract: Optional[str] = Field(None, description="Article abstract")
    journal: Optional[str] = Field(None, description="Journal name")
    pub_date: Optional[str] = Field(None, description="Publication date")
    url: str = Field(..., description="URL to PubMed article")
    citation: str = Field(..., description="Formatted citation string")


class PubMedSearchOutput(BaseModel):
    """Output schema for PubMed search."""

    articles: List[PubMedArticleItem] = Field(
        default_factory=list,
        description="List of PubMed articles",
    )
    total_count: int = Field(
        default=0,
        description="Total number of matching articles in PubMed",
    )
    query_used: str = Field(
        default="",
        description="The actual query sent to PubMed (after PHI filtering)",
    )


# =============================================================================
# Semantic Scholar Search Schemas
# =============================================================================


class SemanticScholarSearchInput(BaseModel):
    """Input schema for Semantic Scholar paper search."""

    query: str = Field(
        ...,
        description="Search query for academic papers (will be PHI-filtered)",
        min_length=1,
    )
    max_results: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of papers to return",
    )


class SemanticScholarPaperItem(BaseModel):
    """A single Semantic Scholar paper result."""

    paper_id: str = Field(..., description="Semantic Scholar paper ID")
    title: str = Field(..., description="Paper title")
    authors: List[str] = Field(default_factory=list, description="List of author names")
    abstract: Optional[str] = Field(None, description="Paper abstract")
    year: Optional[int] = Field(None, description="Publication year")
    venue: Optional[str] = Field(None, description="Publication venue")
    citation_count: int = Field(default=0, description="Number of citations")
    url: str = Field(..., description="URL to Semantic Scholar page")
    is_open_access: bool = Field(default=False, description="Whether paper is open access")
    citation: str = Field(..., description="Formatted citation string")


class SemanticScholarSearchOutput(BaseModel):
    """Output schema for Semantic Scholar search."""

    papers: List[SemanticScholarPaperItem] = Field(
        default_factory=list,
        description="List of academic papers",
    )
    total_count: int = Field(
        default=0,
        description="Total number of matching papers",
    )
    query_used: str = Field(
        default="",
        description="The actual query sent to Semantic Scholar (after PHI filtering)",
    )


# =============================================================================
# Case Context Schemas
# =============================================================================


class SegmentationInfo(BaseModel):
    """Information about a segmentation label."""

    label: str = Field(..., description="Segmentation label name")
    volume_ml: Optional[float] = Field(None, description="Volume in milliliters")
    volume_cm3: Optional[float] = Field(None, description="Volume in cubic centimeters")
    color: Optional[str] = Field(None, description="Display color (hex)")
    instance_count: int = Field(default=1, description="Number of separate instances")


class DetectionInfo(BaseModel):
    """Information about a detection/finding."""

    label: str = Field(..., description="Detection label")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score")
    bbox: Optional[List[float]] = Field(
        None,
        description="Bounding box [x_min, y_min, x_max, y_max]",
    )
    location: Optional[str] = Field(None, description="Anatomical location")


class CaseContextInput(BaseModel):
    """Input schema for fetching case context from a viewer session."""

    session_id: str = Field(
        ...,
        description="MONAI Label viewer session ID",
    )
    include_segmentations: bool = Field(
        default=True,
        description="Include segmentation labels and volumes",
    )
    include_analytics: bool = Field(
        default=True,
        description="Include volumetrics and radiomics data",
    )
    include_detections: bool = Field(
        default=True,
        description="Include AI detection results",
    )


class CaseContextOutput(BaseModel):
    """Output schema with comprehensive case context."""

    session_id: str = Field(..., description="Session ID")
    modality: str = Field(..., description="Imaging modality (CT, MR, XR, etc.)")
    body_region: Optional[str] = Field(None, description="Body region being imaged")
    study_description: Optional[str] = Field(None, description="DICOM study description")
    patient_id: Optional[str] = Field(None, description="De-identified patient ID")
    study_date: Optional[str] = Field(None, description="Study date")
    segmentations: List[SegmentationInfo] = Field(
        default_factory=list,
        description="List of segmentation labels with volumes",
    )
    volumetrics_summary: Optional[Dict[str, Any]] = Field(
        None,
        description="Summary of volumetric measurements",
    )
    radiomics_summary: Optional[Dict[str, Any]] = Field(
        None,
        description="Summary of radiomics features",
    )
    detections: List[DetectionInfo] = Field(
        default_factory=list,
        description="List of AI detections/findings",
    )
    is_longitudinal: bool = Field(
        default=False,
        description="Whether this is a longitudinal (multi-timepoint) session",
    )
    prior_studies: Optional[List[str]] = Field(
        None,
        description="List of prior study dates for longitudinal comparison",
    )


# =============================================================================
# Report Agent Schemas
# =============================================================================


class ReportAgentInput(BaseModel):
    """Input schema for the report drafting agent."""

    task: Literal["draft_findings", "draft_impression", "draft_full_report"] = Field(
        ...,
        description="What section(s) to draft",
    )
    case_context: CaseContextOutput = Field(
        ...,
        description="Case context from CaseContextTool",
    )
    guidelines: Optional[List[RAGResultItem]] = Field(
        None,
        description="Relevant guidelines from local RAG search",
    )
    evidence: Optional[List[PubMedArticleItem]] = Field(
        None,
        description="Supporting evidence from PubMed",
    )
    radiologist_notes: Optional[str] = Field(
        None,
        description="Additional notes from the radiologist",
    )
    report_style: Literal["standard", "structured", "concise"] = Field(
        default="structured",
        description="Report formatting style",
    )


class ReportAgentOutput(BaseModel):
    """Output schema for the report drafting agent."""

    section_name: str = Field(
        ...,
        description="Name of the report section generated",
    )
    content: str = Field(
        ...,
        description="Generated report content",
    )
    citations_used: List[str] = Field(
        default_factory=list,
        description="List of PubMed citations used",
    )
    guidelines_referenced: List[str] = Field(
        default_factory=list,
        description="List of guidelines referenced",
    )
    confidence_note: Optional[str] = Field(
        None,
        description="Note about confidence or areas requiring review",
    )


# =============================================================================
# Evidence Summarizer Schemas
# =============================================================================


class EvidenceSummarizerInput(BaseModel):
    """Input schema for evidence summarization."""

    question: str = Field(
        ...,
        description="The clinical question to answer with evidence",
    )
    pubmed_articles: List[PubMedArticleItem] = Field(
        default_factory=list,
        description="PubMed articles to synthesize",
    )
    semantic_scholar_papers: List[SemanticScholarPaperItem] = Field(
        default_factory=list,
        description="Semantic Scholar papers to synthesize",
    )
    local_guidelines: List[RAGResultItem] = Field(
        default_factory=list,
        description="Local guidelines to incorporate",
    )
    max_length_words: int = Field(
        default=500,
        ge=100,
        le=2000,
        description="Maximum length of the summary in words",
    )


class EvidenceSummarizerOutput(BaseModel):
    """Output schema for evidence summarization."""

    summary: str = Field(
        ...,
        description="Synthesized summary of the evidence",
    )
    key_points: List[str] = Field(
        default_factory=list,
        description="Bulleted key points from the evidence",
    )
    evidence_quality: Literal["high", "moderate", "low"] = Field(
        ...,
        description="Overall quality rating of the evidence",
    )
    citations: List[str] = Field(
        default_factory=list,
        description="Formatted citations used in the summary",
    )
    limitations: Optional[str] = Field(
        None,
        description="Limitations of the evidence or gaps identified",
    )
    recommendation_strength: Optional[str] = Field(
        None,
        description="Strength of any recommendations (strong, moderate, weak)",
    )
