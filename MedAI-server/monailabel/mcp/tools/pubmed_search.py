# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
PubMed Search Tool - Literature search via NCBI E-utilities.
"""

import logging
from typing import Optional

from ..schemas import (
    PubMedArticleItem,
    PubMedSearchInput,
    PubMedSearchOutput,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class PubMedSearchTool(MCPTool):
    """
    MCP tool for searching PubMed literature.

    Wraps the PubMedClient with PHI filtering to ensure no
    patient-identifiable information is sent to external APIs.
    """

    name = "pubmed_search"
    description = (
        "Search PubMed for peer-reviewed medical literature. Use this to find "
        "evidence-based research supporting clinical decisions, particularly for "
        "differential diagnosis, treatment options, and imaging findings. "
        "Returns article titles, abstracts, and citations."
    )
    input_schema = PubMedSearchInput
    output_schema = PubMedSearchOutput

    def __init__(self):
        super().__init__()
        self._client: Optional["PubMedClient"] = None
        self._phi_filter = None

    def _get_client(self):
        """Lazy-load the PubMed client."""
        if self._client is None:
            from knowledge.external import PubMedClient
            self._client = PubMedClient()
        return self._client

    def _get_phi_filter(self):
        """Lazy-load the PHI filter."""
        if self._phi_filter is None:
            from knowledge.external import get_phi_filter
            self._phi_filter = get_phi_filter()
        return self._phi_filter

    async def execute(self, input_data: PubMedSearchInput) -> PubMedSearchOutput:
        """
        Execute PubMed search with PHI filtering.

        Args:
            input_data: Search parameters

        Returns:
            PubMed search results
        """
        try:
            # Apply PHI filter to query
            phi_filter = self._get_phi_filter()
            filtered_query = phi_filter.filter_text(input_data.query)

            if not filtered_query or not filtered_query.strip():
                logger.warning("Query was empty after PHI filtering")
                return PubMedSearchOutput(
                    articles=[],
                    total_count=0,
                    query_used="",
                )

            logger.info(f"Searching PubMed for: '{filtered_query[:50]}...'")

            # Search PubMed
            client = self._get_client()

            async with client:
                articles = await client.search(
                    query=filtered_query,
                    max_results=input_data.max_results,
                    date_range_years=input_data.date_range_years,
                )

            # Convert to output format
            article_items = []
            for article in articles:
                article_items.append(
                    PubMedArticleItem(
                        pmid=article.pmid,
                        title=article.title,
                        authors=[a.name for a in article.authors],
                        abstract=article.abstract,
                        journal=article.journal,
                        pub_date=article.pub_date,
                        url=article.url,
                        citation=article.to_citation(),
                    )
                )

            logger.info(f"PubMed search returned {len(article_items)} articles")

            return PubMedSearchOutput(
                articles=article_items,
                total_count=len(article_items),
                query_used=filtered_query,
            )

        except ImportError as e:
            logger.error(f"External API module not available: {e}")
            return PubMedSearchOutput(
                articles=[],
                total_count=0,
                query_used=input_data.query,
            )

        except Exception as e:
            logger.exception(f"PubMed search failed: {e}")
            return PubMedSearchOutput(
                articles=[],
                total_count=0,
                query_used=input_data.query,
            )
