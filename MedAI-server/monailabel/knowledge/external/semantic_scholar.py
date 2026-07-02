# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Semantic Scholar API client for searching academic literature.

This module provides an async client for the Semantic Scholar Academic Graph API,
enabling search and retrieval of research papers with citation data.
"""

import logging
from typing import Dict, List, Optional, Set

from .base_client import ExternalAPIClient, RateLimiter
from .cache import CacheManager
from .config import ExternalAPIConfig, get_config
from .models import Author, SemanticScholarPaper
from .phi_filter import PHIFilter

logger = logging.getLogger(__name__)


class SemanticScholarClient(ExternalAPIClient[SemanticScholarPaper]):
    """
    Async client for the Semantic Scholar Academic Graph API.

    This client supports searching for research papers and retrieving
    detailed metadata including citations, abstracts, and author information.

    Rate limits:
    - Without API key: 100 requests/5 minutes (~0.33 req/sec)
    - With API key: Higher limits (varies by tier)

    Usage:
        async with SemanticScholarClient() as client:
            papers = await client.search("medical imaging deep learning", max_results=10)
            for paper in papers:
                print(f"{paper.title} - {paper.citation_count} citations")
    """

    BASE_URL = "https://api.semanticscholar.org/graph/v1"
    CLIENT_NAME = "SemanticScholar"

    # Default fields to request from the API
    DEFAULT_FIELDS: Set[str] = {
        "paperId",
        "title",
        "authors",
        "abstract",
        "year",
        "citationCount",
        "url",
        "venue",
        "fieldsOfStudy",
        "isOpenAccess",
        "openAccessPdf",
    }

    def __init__(
        self,
        config: Optional[ExternalAPIConfig] = None,
        phi_filter: Optional[PHIFilter] = None,
        cache_manager: Optional[CacheManager] = None,
    ):
        """
        Initialize the Semantic Scholar client.

        Args:
            config: Configuration object (uses global config if not provided)
            phi_filter: PHI filter instance (uses global filter if not provided)
            cache_manager: Cache manager instance (creates new one if not provided)
        """
        super().__init__(config, phi_filter, cache_manager)
        self._api_key = self._config.SEMANTIC_SCHOLAR_API_KEY

    def _create_rate_limiter(self) -> RateLimiter:
        """Create rate limiter based on API key availability."""
        rate = self._config.semantic_scholar_rate_limit
        return RateLimiter(rate=rate, burst=3)

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers including API key if available."""
        headers = super()._get_headers()
        if self._api_key:
            headers["x-api-key"] = self._api_key
        return headers

    async def search(
        self,
        query: str,
        max_results: int = 10,
        fields: Optional[Set[str]] = None,
        year_range: Optional[tuple] = None,
        open_access_only: bool = False,
        fields_of_study: Optional[List[str]] = None,
    ) -> List[SemanticScholarPaper]:
        """
        Search Semantic Scholar for papers matching the query.

        Args:
            query: Search query string
            max_results: Maximum number of results (1-100)
            fields: Fields to return (uses DEFAULT_FIELDS if not specified)
            year_range: Tuple of (start_year, end_year) to filter by publication year
            open_access_only: Only return open access papers
            fields_of_study: Filter by fields of study (e.g., ["Medicine", "Computer Science"])

        Returns:
            List of SemanticScholarPaper objects
        """
        # Filter PHI from query
        filtered_query = self.filter_query(query)
        if not filtered_query or filtered_query == self._config.PHI_REPLACEMENT_TEXT:
            logger.warning("Query contains only PHI, cannot search")
            return []

        # Check cache
        cache_key = self.get_cache_key(
            filtered_query,
            {
                "max_results": max_results,
                "year_range": year_range,
                "open_access_only": open_access_only,
                "fields_of_study": fields_of_study,
            },
        )
        cached_result = self._cache_manager.get(cache_key)
        if cached_result is not None:
            logger.debug(f"Cache hit for Semantic Scholar query: {filtered_query[:50]}...")
            return cached_result

        # Build request parameters
        request_fields = fields or self.DEFAULT_FIELDS
        params = {
            "query": filtered_query,
            "limit": str(min(max_results, 100)),
            "fields": ",".join(request_fields),
        }

        # Add optional filters
        if year_range:
            params["year"] = f"{year_range[0]}-{year_range[1]}"

        if open_access_only:
            params["openAccessPdf"] = ""

        if fields_of_study:
            params["fieldsOfStudy"] = ",".join(fields_of_study)

        # Make request
        url = f"{self.BASE_URL}/paper/search"
        response = await self._get(url, params=params)
        data = response.json()

        # Parse results
        papers = []
        for paper_data in data.get("data", []):
            try:
                paper = self._parse_paper(paper_data)
                if paper:
                    papers.append(paper)
            except Exception as e:
                logger.warning(f"Error parsing paper data: {e}")
                continue

        # Filter open access if requested (API filter may not be exact)
        if open_access_only:
            papers = [p for p in papers if p.is_open_access]

        # Cache the results
        self._cache_manager.set(cache_key, papers)

        logger.info(
            f"Found {len(papers)} papers for query: {filtered_query[:50]}..."
        )
        return papers

    async def get_paper(
        self,
        paper_id: str,
        fields: Optional[Set[str]] = None,
    ) -> Optional[SemanticScholarPaper]:
        """
        Get a single paper by its Semantic Scholar ID.

        The paper_id can be:
        - Semantic Scholar ID (e.g., "649def34f8be52c8b66281af98ae884c09aef38b")
        - DOI with prefix (e.g., "DOI:10.1038/nature12373")
        - arXiv ID with prefix (e.g., "arXiv:1234.56789")
        - PubMed ID with prefix (e.g., "PMID:12345678")

        Args:
            paper_id: Paper identifier
            fields: Fields to return (uses DEFAULT_FIELDS if not specified)

        Returns:
            SemanticScholarPaper object, or None if not found
        """
        # Check cache
        cache_key = self.get_cache_key(f"paper:{paper_id}")
        cached_result = self._cache_manager.get(cache_key)
        if cached_result is not None:
            return cached_result

        # Build request
        request_fields = fields or self.DEFAULT_FIELDS
        params = {
            "fields": ",".join(request_fields),
        }

        url = f"{self.BASE_URL}/paper/{paper_id}"

        try:
            response = await self._get(url, params=params)
            data = response.json()
            paper = self._parse_paper(data)

            if paper:
                self._cache_manager.set(cache_key, paper)
            return paper

        except Exception as e:
            logger.warning(f"Error fetching paper {paper_id}: {e}")
            return None

    async def get_paper_citations(
        self,
        paper_id: str,
        max_results: int = 100,
        fields: Optional[Set[str]] = None,
    ) -> List[SemanticScholarPaper]:
        """
        Get papers that cite the specified paper.

        Args:
            paper_id: Paper identifier
            max_results: Maximum number of citing papers to return
            fields: Fields to return for each citing paper

        Returns:
            List of SemanticScholarPaper objects that cite the specified paper
        """
        request_fields = fields or self.DEFAULT_FIELDS
        params = {
            "limit": str(min(max_results, 1000)),
            "fields": ",".join(f"citingPaper.{f}" for f in request_fields),
        }

        url = f"{self.BASE_URL}/paper/{paper_id}/citations"

        try:
            response = await self._get(url, params=params)
            data = response.json()

            papers = []
            for citation in data.get("data", []):
                paper_data = citation.get("citingPaper", {})
                paper = self._parse_paper(paper_data)
                if paper:
                    papers.append(paper)

            return papers

        except Exception as e:
            logger.warning(f"Error fetching citations for {paper_id}: {e}")
            return []

    async def get_paper_references(
        self,
        paper_id: str,
        max_results: int = 100,
        fields: Optional[Set[str]] = None,
    ) -> List[SemanticScholarPaper]:
        """
        Get papers referenced by the specified paper.

        Args:
            paper_id: Paper identifier
            max_results: Maximum number of referenced papers to return
            fields: Fields to return for each referenced paper

        Returns:
            List of SemanticScholarPaper objects referenced by the specified paper
        """
        request_fields = fields or self.DEFAULT_FIELDS
        params = {
            "limit": str(min(max_results, 1000)),
            "fields": ",".join(f"citedPaper.{f}" for f in request_fields),
        }

        url = f"{self.BASE_URL}/paper/{paper_id}/references"

        try:
            response = await self._get(url, params=params)
            data = response.json()

            papers = []
            for reference in data.get("data", []):
                paper_data = reference.get("citedPaper", {})
                paper = self._parse_paper(paper_data)
                if paper:
                    papers.append(paper)

            return papers

        except Exception as e:
            logger.warning(f"Error fetching references for {paper_id}: {e}")
            return []

    def _parse_paper(self, data: Dict) -> Optional[SemanticScholarPaper]:
        """
        Parse paper data from API response.

        Args:
            data: Paper data dictionary from API

        Returns:
            SemanticScholarPaper object, or None if parsing fails
        """
        paper_id = data.get("paperId")
        if not paper_id:
            return None

        title = data.get("title", "Unknown Title")

        # Parse authors
        authors = []
        for author_data in data.get("authors", []):
            name = author_data.get("name", "Unknown")
            authors.append(Author(name=name, affiliation=None))

        # Parse open access PDF URL
        open_access_pdf = data.get("openAccessPdf")
        open_access_pdf_url = None
        if open_access_pdf and isinstance(open_access_pdf, dict):
            open_access_pdf_url = open_access_pdf.get("url")

        return SemanticScholarPaper(
            paper_id=paper_id,
            title=title,
            authors=authors,
            abstract=data.get("abstract"),
            year=data.get("year"),
            citation_count=data.get("citationCount", 0),
            url=data.get("url", f"https://www.semanticscholar.org/paper/{paper_id}"),
            venue=data.get("venue"),
            fields_of_study=data.get("fieldsOfStudy") or [],
            is_open_access=data.get("isOpenAccess", False),
            open_access_pdf_url=open_access_pdf_url,
        )

    async def health_check(self) -> bool:
        """Check if Semantic Scholar API is accessible."""
        try:
            params = {
                "query": "test",
                "limit": "1",
                "fields": "paperId,title",
            }
            url = f"{self.BASE_URL}/paper/search"
            response = await self._get(url, params=params)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Semantic Scholar health check failed: {e}")
            return False
