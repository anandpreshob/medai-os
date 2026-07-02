# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Pydantic models for external API responses.

This module defines the data structures for PubMed articles and Semantic Scholar papers,
providing type-safe representations of search results from external literature APIs.
"""

from datetime import date
from typing import List, Optional, Union

from pydantic import BaseModel, Field, HttpUrl


class Author(BaseModel):
    """Represents an author of a scientific publication."""

    name: str = Field(..., description="Full name of the author")
    affiliation: Optional[str] = Field(None, description="Author's institutional affiliation")


class PubMedArticle(BaseModel):
    """Represents a PubMed article with metadata."""

    pmid: str = Field(..., description="PubMed ID")
    title: str = Field(..., description="Article title")
    authors: List[Author] = Field(default_factory=list, description="List of authors")
    abstract: Optional[str] = Field(None, description="Article abstract")
    journal: Optional[str] = Field(None, description="Journal name")
    pub_date: Optional[str] = Field(None, description="Publication date (YYYY-MM-DD or YYYY)")
    doi: Optional[str] = Field(None, description="Digital Object Identifier")
    url: str = Field(..., description="URL to the PubMed article")

    @property
    def pubmed_url(self) -> str:
        """Generate PubMed URL from PMID."""
        return f"https://pubmed.ncbi.nlm.nih.gov/{self.pmid}/"

    def to_citation(self) -> str:
        """Generate a citation string."""
        author_str = ", ".join(a.name for a in self.authors[:3])
        if len(self.authors) > 3:
            author_str += " et al."
        year = self.pub_date[:4] if self.pub_date else "n.d."
        return f"{author_str}. {self.title}. {self.journal or 'Unknown'}. {year}."


class SemanticScholarPaper(BaseModel):
    """Represents a Semantic Scholar paper with metadata."""

    paper_id: str = Field(..., description="Semantic Scholar paper ID")
    title: str = Field(..., description="Paper title")
    authors: List[Author] = Field(default_factory=list, description="List of authors")
    abstract: Optional[str] = Field(None, description="Paper abstract")
    year: Optional[int] = Field(None, description="Publication year")
    citation_count: int = Field(default=0, description="Number of citations")
    url: str = Field(..., description="URL to the Semantic Scholar page")
    venue: Optional[str] = Field(None, description="Publication venue (journal/conference)")
    fields_of_study: List[str] = Field(default_factory=list, description="Fields of study")
    is_open_access: bool = Field(default=False, description="Whether the paper is open access")
    open_access_pdf_url: Optional[str] = Field(None, description="URL to open access PDF")

    @property
    def semantic_scholar_url(self) -> str:
        """Generate Semantic Scholar URL from paper ID."""
        return f"https://www.semanticscholar.org/paper/{self.paper_id}"

    def to_citation(self) -> str:
        """Generate a citation string."""
        author_str = ", ".join(a.name for a in self.authors[:3])
        if len(self.authors) > 3:
            author_str += " et al."
        year_str = str(self.year) if self.year else "n.d."
        return f"{author_str}. {self.title}. {self.venue or 'Unknown'}. {year_str}."


# Type alias for search results that can be either PubMed or Semantic Scholar
ExternalSearchResult = Union[PubMedArticle, SemanticScholarPaper]


class PHIMatch(BaseModel):
    """Represents a detected PHI pattern match."""

    pattern_type: str = Field(..., description="Type of PHI detected (e.g., 'MRN', 'SSN', 'EMAIL')")
    matched_text: str = Field(..., description="The actual text that matched the pattern")
    start_position: int = Field(..., description="Start index in the original text")
    end_position: int = Field(..., description="End index in the original text")


class SearchQuery(BaseModel):
    """Represents a search query for external APIs."""

    query: str = Field(..., min_length=1, description="Search query text")
    max_results: int = Field(default=10, ge=1, le=100, description="Maximum number of results")
    date_range_years: Optional[int] = Field(
        None, ge=1, le=50, description="Limit to papers published within N years"
    )
    filters: Optional[dict] = Field(None, description="Additional API-specific filters")


class SearchResponse(BaseModel):
    """Represents a response from an external search API."""

    query: str = Field(..., description="Original search query")
    total_results: int = Field(..., description="Total number of results available")
    returned_results: int = Field(..., description="Number of results returned in this response")
    results: List[ExternalSearchResult] = Field(..., description="List of search results")
    source: str = Field(..., description="Source API (pubmed or semantic_scholar)")
    cached: bool = Field(default=False, description="Whether the response was from cache")
