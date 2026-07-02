# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Configuration for external API clients.

This module provides configuration settings for PubMed and Semantic Scholar
API clients, including API keys, cache settings, and rate limiting parameters.
"""

import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ExternalAPIConfig(BaseSettings):
    """Configuration settings for external literature API clients."""

    # PubMed configuration
    PUBMED_EMAIL: str = Field(
        default="medai@example.com",
        description="Email address for PubMed API requests (required by NCBI)",
    )
    PUBMED_API_KEY: Optional[str] = Field(
        default=None,
        description="NCBI API key for increased rate limits (optional)",
    )
    PUBMED_TOOL_NAME: str = Field(
        default="MedAI",
        description="Tool name for PubMed API requests",
    )

    # Semantic Scholar configuration
    SEMANTIC_SCHOLAR_API_KEY: Optional[str] = Field(
        default=None,
        description="Semantic Scholar API key for increased rate limits (optional)",
    )

    # Cache configuration
    EXTERNAL_CACHE_TTL: int = Field(
        default=3600,
        ge=0,
        description="Cache time-to-live in seconds (default: 1 hour)",
    )
    MAX_CACHE_SIZE: int = Field(
        default=1000,
        ge=1,
        description="Maximum number of cached responses",
    )

    # Rate limiting configuration
    PUBMED_RATE_LIMIT: float = Field(
        default=3.0,
        description="PubMed requests per second without API key",
    )
    PUBMED_RATE_LIMIT_WITH_KEY: float = Field(
        default=10.0,
        description="PubMed requests per second with API key",
    )
    SEMANTIC_SCHOLAR_RATE_LIMIT: float = Field(
        default=0.33,
        description="Semantic Scholar requests per second (100 req/5min without key)",
    )
    SEMANTIC_SCHOLAR_RATE_LIMIT_WITH_KEY: float = Field(
        default=1.0,
        description="Semantic Scholar requests per second with API key",
    )

    # HTTP client configuration
    REQUEST_TIMEOUT: float = Field(
        default=30.0,
        description="HTTP request timeout in seconds",
    )
    MAX_RETRIES: int = Field(
        default=3,
        ge=0,
        description="Maximum number of retry attempts for failed requests",
    )
    RETRY_BASE_DELAY: float = Field(
        default=1.0,
        description="Base delay in seconds for exponential backoff",
    )

    # PHI filter configuration
    PHI_FILTER_ENABLED: bool = Field(
        default=True,
        description="Enable PHI filtering on search queries",
    )
    PHI_REPLACEMENT_TEXT: str = Field(
        default="[REDACTED]",
        description="Text to replace detected PHI",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MEDAI_",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def pubmed_rate_limit(self) -> float:
        """Get the appropriate PubMed rate limit based on API key availability."""
        if self.PUBMED_API_KEY:
            return self.PUBMED_RATE_LIMIT_WITH_KEY
        return self.PUBMED_RATE_LIMIT

    @property
    def semantic_scholar_rate_limit(self) -> float:
        """Get the appropriate Semantic Scholar rate limit based on API key availability."""
        if self.SEMANTIC_SCHOLAR_API_KEY:
            return self.SEMANTIC_SCHOLAR_RATE_LIMIT_WITH_KEY
        return self.SEMANTIC_SCHOLAR_RATE_LIMIT


# Global configuration instance
_config: Optional[ExternalAPIConfig] = None


def get_config() -> ExternalAPIConfig:
    """Get or create the global configuration instance."""
    global _config
    if _config is None:
        _config = ExternalAPIConfig()
    return _config


def reset_config() -> None:
    """Reset the global configuration (useful for testing)."""
    global _config
    _config = None
