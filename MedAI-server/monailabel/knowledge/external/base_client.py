# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Abstract base class for external API clients.

This module provides the foundation for implementing external literature
API clients with built-in rate limiting, caching, PHI filtering, and retry logic.
"""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Generic, List, Optional, TypeVar

import httpx

from .cache import CacheManager, generate_cache_key
from .config import ExternalAPIConfig, get_config
from .phi_filter import PHIFilter, get_phi_filter

logger = logging.getLogger(__name__)

T = TypeVar("T")  # Type variable for search results


class RateLimiter:
    """
    Token bucket rate limiter for API requests.

    This implementation uses a token bucket algorithm to limit
    the rate of API requests.
    """

    def __init__(self, rate: float, burst: int = 1):
        """
        Initialize the rate limiter.

        Args:
            rate: Maximum requests per second
            burst: Maximum burst size (default: 1)
        """
        self._rate = rate
        self._burst = burst
        self._tokens = burst
        self._last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """
        Acquire a token, waiting if necessary.

        This method blocks until a token is available.
        """
        async with self._lock:
            now = time.monotonic()
            time_passed = now - self._last_update
            self._tokens = min(self._burst, self._tokens + time_passed * self._rate)
            self._last_update = now

            if self._tokens < 1:
                wait_time = (1 - self._tokens) / self._rate
                logger.debug(f"Rate limit: waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)
                self._tokens = 0
            else:
                self._tokens -= 1


class ExternalAPIClient(ABC, Generic[T]):
    """
    Abstract base class for external API clients.

    This class provides common functionality for external API clients including:
    - Rate limiting
    - Caching
    - PHI filtering
    - Retry logic with exponential backoff
    - HTTP client management

    Subclasses must implement:
    - search(): Perform a search query
    - BASE_URL: The base URL for the API
    - CLIENT_NAME: A human-readable name for the client
    """

    BASE_URL: str = ""
    CLIENT_NAME: str = "ExternalAPIClient"

    def __init__(
        self,
        config: Optional[ExternalAPIConfig] = None,
        phi_filter: Optional[PHIFilter] = None,
        cache_manager: Optional[CacheManager] = None,
    ):
        """
        Initialize the API client.

        Args:
            config: Configuration object (uses global config if not provided)
            phi_filter: PHI filter instance (uses global filter if not provided)
            cache_manager: Cache manager instance (creates new one if not provided)
        """
        self._config = config or get_config()
        self._phi_filter = phi_filter or get_phi_filter()
        self._cache_manager = cache_manager or CacheManager(
            ttl=self._config.EXTERNAL_CACHE_TTL,
            maxsize=self._config.MAX_CACHE_SIZE,
        )
        self._rate_limiter = self._create_rate_limiter()
        self._client: Optional[httpx.AsyncClient] = None

    @abstractmethod
    def _create_rate_limiter(self) -> RateLimiter:
        """Create the rate limiter for this client."""
        pass

    @abstractmethod
    async def search(self, query: str, max_results: int = 10, **kwargs) -> List[T]:
        """
        Search for articles/papers matching the query.

        Args:
            query: Search query string
            max_results: Maximum number of results to return
            **kwargs: Additional API-specific parameters

        Returns:
            List of search results
        """
        pass

    def _get_headers(self) -> Dict[str, str]:
        """Get default HTTP headers for requests."""
        return {
            "User-Agent": f"MedAI/{self.CLIENT_NAME}",
            "Accept": "application/json",
        }

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._config.REQUEST_TIMEOUT,
                headers=self._get_headers(),
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client and release resources."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
            logger.debug(f"{self.CLIENT_NAME} client closed")

    async def __aenter__(self) -> "ExternalAPIClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    def filter_query(self, query: str) -> str:
        """
        Filter PHI from the query before sending to external API.

        Args:
            query: The search query

        Returns:
            The filtered query
        """
        if self._phi_filter.enabled and self._phi_filter.contains_phi(query):
            logger.warning(f"PHI detected in query for {self.CLIENT_NAME}, filtering...")
            return self._phi_filter.filter_text(query)
        return query

    def get_cache_key(self, query: str, params: Optional[Dict] = None) -> str:
        """
        Generate a cache key for the query.

        Args:
            query: The search query
            params: Additional parameters

        Returns:
            Cache key string
        """
        key_params = {"client": self.CLIENT_NAME}
        if params:
            key_params.update(params)
        return generate_cache_key(query, key_params)

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs,
    ) -> httpx.Response:
        """
        Make an HTTP request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            **kwargs: Additional arguments for httpx request

        Returns:
            HTTP response

        Raises:
            httpx.HTTPError: If all retries fail
        """
        client = await self._get_client()
        last_exception = None

        for attempt in range(self._config.MAX_RETRIES + 1):
            try:
                # Rate limiting
                await self._rate_limiter.acquire()

                # Make request
                response = await client.request(method, url, **kwargs)

                # Check for rate limit response
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(
                        f"{self.CLIENT_NAME} rate limited, waiting {retry_after}s"
                    )
                    await asyncio.sleep(retry_after)
                    continue

                # Raise for other error status codes
                response.raise_for_status()
                return response

            except httpx.HTTPStatusError as e:
                last_exception = e
                if e.response.status_code in (500, 502, 503, 504):
                    # Server error, retry with backoff
                    delay = self._config.RETRY_BASE_DELAY * (2**attempt)
                    logger.warning(
                        f"{self.CLIENT_NAME} server error (attempt {attempt + 1}), "
                        f"retrying in {delay:.1f}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    # Client error, don't retry
                    raise

            except httpx.TimeoutException as e:
                last_exception = e
                delay = self._config.RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    f"{self.CLIENT_NAME} timeout (attempt {attempt + 1}), "
                    f"retrying in {delay:.1f}s"
                )
                await asyncio.sleep(delay)

            except httpx.RequestError as e:
                last_exception = e
                delay = self._config.RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    f"{self.CLIENT_NAME} request error (attempt {attempt + 1}), "
                    f"retrying in {delay:.1f}s: {e}"
                )
                await asyncio.sleep(delay)

        # All retries exhausted
        logger.error(f"{self.CLIENT_NAME} all retries failed")
        raise last_exception

    async def _get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """
        Make a GET request with retry logic.

        Args:
            url: Request URL
            params: Query parameters

        Returns:
            HTTP response
        """
        return await self._request_with_retry("GET", url, params=params)

    async def _post(
        self,
        url: str,
        data: Optional[Dict] = None,
        json: Optional[Dict] = None,
    ) -> httpx.Response:
        """
        Make a POST request with retry logic.

        Args:
            url: Request URL
            data: Form data
            json: JSON data

        Returns:
            HTTP response
        """
        return await self._request_with_retry("POST", url, data=data, json=json)

    def clear_cache(self) -> None:
        """Clear the response cache."""
        self._cache_manager.clear()
        logger.info(f"{self.CLIENT_NAME} cache cleared")

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache_manager.stats

    async def health_check(self) -> bool:
        """
        Check if the API is accessible.

        Returns:
            True if the API is accessible, False otherwise
        """
        try:
            client = await self._get_client()
            response = await client.head(self.BASE_URL, timeout=10.0)
            return response.status_code < 500
        except Exception as e:
            logger.warning(f"{self.CLIENT_NAME} health check failed: {e}")
            return False
