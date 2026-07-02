# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
PubMed API client for searching medical literature.

This module provides an async client for the NCBI E-utilities API,
enabling search and retrieval of PubMed articles.
"""

import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List, Optional

from .base_client import ExternalAPIClient, RateLimiter
from .cache import CacheManager
from .config import ExternalAPIConfig, get_config
from .models import Author, PubMedArticle
from .phi_filter import PHIFilter

logger = logging.getLogger(__name__)


class PubMedClient(ExternalAPIClient[PubMedArticle]):
    """
    Async client for the PubMed/NCBI E-utilities API.

    This client supports searching PubMed and retrieving article metadata
    including titles, authors, abstracts, and publication details.

    Rate limits:
    - Without API key: 3 requests/second
    - With API key: 10 requests/second

    Usage:
        async with PubMedClient() as client:
            articles = await client.search("lung cancer CT imaging", max_results=10)
            for article in articles:
                print(f"{article.title} ({article.pub_date})")
    """

    BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    CLIENT_NAME = "PubMed"

    def __init__(
        self,
        config: Optional[ExternalAPIConfig] = None,
        phi_filter: Optional[PHIFilter] = None,
        cache_manager: Optional[CacheManager] = None,
    ):
        """
        Initialize the PubMed client.

        Args:
            config: Configuration object (uses global config if not provided)
            phi_filter: PHI filter instance (uses global filter if not provided)
            cache_manager: Cache manager instance (creates new one if not provided)
        """
        super().__init__(config, phi_filter, cache_manager)
        self._api_key = self._config.PUBMED_API_KEY
        self._email = self._config.PUBMED_EMAIL
        self._tool = self._config.PUBMED_TOOL_NAME

    def _create_rate_limiter(self) -> RateLimiter:
        """Create rate limiter based on API key availability."""
        rate = self._config.pubmed_rate_limit
        return RateLimiter(rate=rate, burst=2)

    def _get_base_params(self) -> Dict[str, str]:
        """Get base parameters required for all NCBI API requests."""
        params = {
            "email": self._email,
            "tool": self._tool,
        }
        if self._api_key:
            params["api_key"] = self._api_key
        return params

    async def search(
        self,
        query: str,
        max_results: int = 10,
        date_range_years: Optional[int] = 5,
        sort: str = "relevance",
    ) -> List[PubMedArticle]:
        """
        Search PubMed for articles matching the query.

        Args:
            query: Search query string
            max_results: Maximum number of results (1-100)
            date_range_years: Limit to papers from the last N years (None for no limit)
            sort: Sort order ('relevance' or 'date')

        Returns:
            List of PubMedArticle objects
        """
        # Filter PHI from query
        filtered_query = self.filter_query(query)
        if not filtered_query or filtered_query == self._config.PHI_REPLACEMENT_TEXT:
            logger.warning("Query contains only PHI, cannot search")
            return []

        # Check cache
        cache_key = self.get_cache_key(
            filtered_query,
            {"max_results": max_results, "date_range_years": date_range_years, "sort": sort},
        )
        cached_result = self._cache_manager.get(cache_key)
        if cached_result is not None:
            logger.debug(f"Cache hit for PubMed query: {filtered_query[:50]}...")
            return cached_result

        # Step 1: Search for PMIDs using ESearch
        pmids = await self._esearch(
            filtered_query,
            max_results=max_results,
            date_range_years=date_range_years,
            sort=sort,
        )

        if not pmids:
            logger.info(f"No results found for query: {filtered_query[:50]}...")
            return []

        # Step 2: Fetch article details using EFetch
        articles = await self._efetch(pmids)

        # Cache the results
        self._cache_manager.set(cache_key, articles)

        logger.info(f"Found {len(articles)} articles for query: {filtered_query[:50]}...")
        return articles

    async def get_article(self, pmid: str) -> Optional[PubMedArticle]:
        """
        Get a single article by its PubMed ID.

        Args:
            pmid: The PubMed ID

        Returns:
            PubMedArticle object, or None if not found
        """
        # Check cache
        cache_key = self.get_cache_key(f"pmid:{pmid}")
        cached_result = self._cache_manager.get(cache_key)
        if cached_result is not None:
            return cached_result

        articles = await self._efetch([pmid])
        if articles:
            self._cache_manager.set(cache_key, articles[0])
            return articles[0]
        return None

    async def _esearch(
        self,
        query: str,
        max_results: int = 10,
        date_range_years: Optional[int] = None,
        sort: str = "relevance",
    ) -> List[str]:
        """
        Search PubMed and return a list of PMIDs.

        Args:
            query: Search query
            max_results: Maximum number of results
            date_range_years: Limit to recent years
            sort: Sort order

        Returns:
            List of PMID strings
        """
        params = self._get_base_params()
        params.update(
            {
                "db": "pubmed",
                "term": query,
                "retmax": str(min(max_results, 100)),
                "retmode": "json",
                "sort": sort,
            }
        )

        # Add date filter if specified
        if date_range_years:
            current_year = datetime.now().year
            min_date = f"{current_year - date_range_years}/01/01"
            params["mindate"] = min_date
            params["maxdate"] = f"{current_year}/12/31"
            params["datetype"] = "pdat"  # Publication date

        url = f"{self.BASE_URL}/esearch.fcgi"
        response = await self._get(url, params=params)
        data = response.json()

        esearch_result = data.get("esearchresult", {})
        pmids = esearch_result.get("idlist", [])

        logger.debug(f"ESearch returned {len(pmids)} PMIDs")
        return pmids

    async def _efetch(self, pmids: List[str]) -> List[PubMedArticle]:
        """
        Fetch article details for a list of PMIDs.

        Args:
            pmids: List of PubMed IDs

        Returns:
            List of PubMedArticle objects
        """
        if not pmids:
            return []

        params = self._get_base_params()
        params.update(
            {
                "db": "pubmed",
                "id": ",".join(pmids),
                "rettype": "abstract",
                "retmode": "xml",
            }
        )

        url = f"{self.BASE_URL}/efetch.fcgi"
        response = await self._get(url, params=params)

        # Parse XML response
        articles = self._parse_efetch_xml(response.text)
        return articles

    def _parse_efetch_xml(self, xml_text: str) -> List[PubMedArticle]:
        """
        Parse the EFetch XML response into PubMedArticle objects.

        Args:
            xml_text: XML response from EFetch

        Returns:
            List of PubMedArticle objects
        """
        articles = []

        try:
            root = ET.fromstring(xml_text)

            for article_elem in root.findall(".//PubmedArticle"):
                try:
                    article = self._parse_article_element(article_elem)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.warning(f"Error parsing article element: {e}")
                    continue

        except ET.ParseError as e:
            logger.error(f"Error parsing EFetch XML: {e}")

        return articles

    def _parse_article_element(self, article_elem: ET.Element) -> Optional[PubMedArticle]:
        """
        Parse a single PubmedArticle XML element.

        Args:
            article_elem: XML element for a PubMed article

        Returns:
            PubMedArticle object, or None if parsing fails
        """
        medline = article_elem.find(".//MedlineCitation")
        if medline is None:
            return None

        # Get PMID
        pmid_elem = medline.find(".//PMID")
        if pmid_elem is None or pmid_elem.text is None:
            return None
        pmid = pmid_elem.text

        # Get article details
        article_data = medline.find(".//Article")
        if article_data is None:
            return None

        # Title
        title_elem = article_data.find(".//ArticleTitle")
        title = title_elem.text if title_elem is not None and title_elem.text else "Unknown Title"

        # Abstract
        abstract_elem = article_data.find(".//Abstract/AbstractText")
        abstract = None
        if abstract_elem is not None:
            # Handle structured abstracts
            abstract_parts = article_data.findall(".//Abstract/AbstractText")
            if len(abstract_parts) > 1:
                abstract_texts = []
                for part in abstract_parts:
                    label = part.get("Label", "")
                    text = part.text or ""
                    if label:
                        abstract_texts.append(f"{label}: {text}")
                    else:
                        abstract_texts.append(text)
                abstract = " ".join(abstract_texts)
            else:
                abstract = abstract_elem.text

        # Authors
        authors = []
        author_list = article_data.find(".//AuthorList")
        if author_list is not None:
            for author_elem in author_list.findall(".//Author"):
                last_name = author_elem.findtext("LastName", "")
                fore_name = author_elem.findtext("ForeName", "")
                initials = author_elem.findtext("Initials", "")

                if last_name:
                    name = f"{last_name}, {fore_name or initials}".strip(", ")
                    affiliation_elem = author_elem.find(".//AffiliationInfo/Affiliation")
                    affiliation = (
                        affiliation_elem.text
                        if affiliation_elem is not None
                        else None
                    )
                    authors.append(Author(name=name, affiliation=affiliation))

        # Journal
        journal_elem = article_data.find(".//Journal/Title")
        journal = journal_elem.text if journal_elem is not None else None

        # Publication date
        pub_date = self._extract_pub_date(article_data)

        # DOI
        doi = None
        for id_elem in article_elem.findall(".//ArticleIdList/ArticleId"):
            if id_elem.get("IdType") == "doi":
                doi = id_elem.text
                break

        return PubMedArticle(
            pmid=pmid,
            title=title,
            authors=authors,
            abstract=abstract,
            journal=journal,
            pub_date=pub_date,
            doi=doi,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        )

    def _extract_pub_date(self, article_data: ET.Element) -> Optional[str]:
        """
        Extract publication date from article data.

        Args:
            article_data: Article XML element

        Returns:
            Date string in YYYY-MM-DD or YYYY format
        """
        # Try PubDate first
        pub_date_elem = article_data.find(".//Journal/JournalIssue/PubDate")
        if pub_date_elem is not None:
            year = pub_date_elem.findtext("Year")
            month = pub_date_elem.findtext("Month")
            day = pub_date_elem.findtext("Day")

            if year:
                if month and day:
                    # Convert month name to number if needed
                    try:
                        if not month.isdigit():
                            month_num = datetime.strptime(month[:3], "%b").month
                        else:
                            month_num = int(month)
                        return f"{year}-{month_num:02d}-{int(day):02d}"
                    except (ValueError, TypeError):
                        pass
                if month:
                    try:
                        if not month.isdigit():
                            month_num = datetime.strptime(month[:3], "%b").month
                        else:
                            month_num = int(month)
                        return f"{year}-{month_num:02d}"
                    except (ValueError, TypeError):
                        pass
                return year

        # Try MedlineDate as fallback
        medline_date = pub_date_elem.findtext("MedlineDate") if pub_date_elem is not None else None
        if medline_date:
            # Extract year from MedlineDate (e.g., "2023 Jan-Feb")
            parts = medline_date.split()
            if parts and parts[0].isdigit():
                return parts[0]

        return None

    async def health_check(self) -> bool:
        """Check if PubMed API is accessible."""
        try:
            params = self._get_base_params()
            params.update(
                {
                    "db": "pubmed",
                    "term": "test",
                    "retmax": "1",
                    "retmode": "json",
                }
            )
            url = f"{self.BASE_URL}/esearch.fcgi"
            response = await self._get(url, params=params)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"PubMed health check failed: {e}")
            return False
