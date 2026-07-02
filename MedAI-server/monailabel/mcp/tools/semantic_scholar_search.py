# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Semantic Scholar Search Tool - Academic paper search via S2 API.
"""

import logging
from typing import Optional

from ..schemas import (
    SemanticScholarPaperItem,
    SemanticScholarSearchInput,
    SemanticScholarSearchOutput,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class SemanticScholarSearchTool(MCPTool):
    """
    MCP tool for searching Semantic Scholar academic papers.

    Wraps the SemanticScholarClient with PHI filtering to ensure no
    patient-identifiable information is sent to external APIs.
    """

    name = "semantic_scholar_search"
    description = (
        "Search Semantic Scholar for academic research papers. Use this to find "
        "cutting-edge research, systematic reviews, and meta-analyses in medical "
        "imaging and radiology. Returns papers with citation counts to help "
        "identify influential research."
    )
    input_schema = SemanticScholarSearchInput
    output_schema = SemanticScholarSearchOutput

    def __init__(self):
        super().__init__()
        self._client: Optional["SemanticScholarClient"] = None
        self._phi_filter = None

    def _get_client(self):
        """Lazy-load the Semantic Scholar client."""
        if self._client is None:
            from knowledge.external import SemanticScholarClient
            self._client = SemanticScholarClient()
        return self._client

    def _get_phi_filter(self):
        """Lazy-load the PHI filter."""
        if self._phi_filter is None:
            from knowledge.external import get_phi_filter
            self._phi_filter = get_phi_filter()
        return self._phi_filter

    async def execute(
        self, input_data: SemanticScholarSearchInput
    ) -> SemanticScholarSearchOutput:
        """
        Execute Semantic Scholar search with PHI filtering.

        Args:
            input_data: Search parameters

        Returns:
            Semantic Scholar search results
        """
        try:
            # Apply PHI filter to query
            phi_filter = self._get_phi_filter()
            filtered_query = phi_filter.filter_text(input_data.query)

            if not filtered_query or not filtered_query.strip():
                logger.warning("Query was empty after PHI filtering")
                return SemanticScholarSearchOutput(
                    papers=[],
                    total_count=0,
                    query_used="",
                )

            logger.info(f"Searching Semantic Scholar for: '{filtered_query[:50]}...'")

            # Search Semantic Scholar
            client = self._get_client()

            async with client:
                papers = await client.search(
                    query=filtered_query,
                    max_results=input_data.max_results,
                )

            # Convert to output format
            paper_items = []
            for paper in papers:
                paper_items.append(
                    SemanticScholarPaperItem(
                        paper_id=paper.paper_id,
                        title=paper.title,
                        authors=[a.name for a in paper.authors],
                        abstract=paper.abstract,
                        year=paper.year,
                        venue=paper.venue,
                        citation_count=paper.citation_count,
                        url=paper.url,
                        is_open_access=paper.is_open_access,
                        citation=paper.to_citation(),
                    )
                )

            logger.info(f"Semantic Scholar search returned {len(paper_items)} papers")

            return SemanticScholarSearchOutput(
                papers=paper_items,
                total_count=len(paper_items),
                query_used=filtered_query,
            )

        except ImportError as e:
            logger.error(f"External API module not available: {e}")
            return SemanticScholarSearchOutput(
                papers=[],
                total_count=0,
                query_used=input_data.query,
            )

        except Exception as e:
            logger.exception(f"Semantic Scholar search failed: {e}")
            return SemanticScholarSearchOutput(
                papers=[],
                total_count=0,
                query_used=input_data.query,
            )
