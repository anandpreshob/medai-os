# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
MCP (Model Context Protocol) module for MedAI.

This module provides a tool registry and execution engine for LLM orchestration.
Tools can be registered, listed, and executed via function calling.

Available Tools:
- local_rag_search: Search local knowledge base (guidelines, templates, ontology)
- pubmed_search: Search PubMed for medical literature
- semantic_scholar_search: Search Semantic Scholar for academic papers
- case_context: Fetch case context from MONAI Label sessions
- report_agent: Draft radiology report sections using LLM
- evidence_summarizer: Synthesize evidence from multiple sources

Example usage:
    from monailabel.mcp import get_mcp_server

    # Get the server singleton
    server = get_mcp_server()

    # List available tools (for LLM function definitions)
    tools = server.get_openai_tools()

    # Execute a tool
    result = await server.execute_tool(
        "local_rag_search",
        {"query": "breast MRI BI-RADS", "top_k": 5}
    )
"""

from .server import (
    MCPServer,
    get_mcp_server,
    reset_mcp_server,
    DEFAULT_TOOLS,
)
from .tools import (
    MCPTool,
    LocalRAGSearchTool,
    PubMedSearchTool,
    SemanticScholarSearchTool,
    CaseContextTool,
    ReportAgentTool,
    EvidenceSummarizerTool,
)
from .schemas import (
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

__all__ = [
    # Server
    "MCPServer",
    "get_mcp_server",
    "reset_mcp_server",
    "DEFAULT_TOOLS",
    # Base
    "MCPTool",
    # Tools
    "LocalRAGSearchTool",
    "PubMedSearchTool",
    "SemanticScholarSearchTool",
    "CaseContextTool",
    "ReportAgentTool",
    "EvidenceSummarizerTool",
    # Schemas - Local RAG
    "LocalRAGSearchInput",
    "LocalRAGSearchOutput",
    "RAGResultItem",
    # Schemas - PubMed
    "PubMedSearchInput",
    "PubMedSearchOutput",
    "PubMedArticleItem",
    # Schemas - Semantic Scholar
    "SemanticScholarSearchInput",
    "SemanticScholarSearchOutput",
    "SemanticScholarPaperItem",
    # Schemas - Case Context
    "SegmentationInfo",
    "DetectionInfo",
    "CaseContextInput",
    "CaseContextOutput",
    # Schemas - Report Agent
    "ReportAgentInput",
    "ReportAgentOutput",
    # Schemas - Evidence Summarizer
    "EvidenceSummarizerInput",
    "EvidenceSummarizerOutput",
]
