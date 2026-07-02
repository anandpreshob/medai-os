# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Caching utilities for external API clients.

This module provides TTL-based caching for API responses to reduce
redundant requests and improve response times.
"""

import hashlib
import json
import logging
from functools import wraps
from typing import Any, Callable, Optional, TypeVar

from cachetools import TTLCache

from .config import get_config

logger = logging.getLogger(__name__)

T = TypeVar("T")


def generate_cache_key(query: str, params: Optional[dict] = None) -> str:
    """
    Generate a unique cache key from a query string and optional parameters.

    Args:
        query: The search query string
        params: Optional dictionary of additional parameters

    Returns:
        A SHA-256 hash string serving as the cache key
    """
    key_data = {"query": query.strip().lower()}
    if params:
        # Sort params for consistent key generation
        key_data["params"] = dict(sorted(params.items()))

    key_string = json.dumps(key_data, sort_keys=True)
    return hashlib.sha256(key_string.encode()).hexdigest()


class CacheManager:
    """
    Manages TTL caches for different API clients.

    This class provides a centralized way to manage caches for different
    API endpoints, with configurable TTL and size limits.
    """

    def __init__(
        self,
        ttl: Optional[int] = None,
        maxsize: Optional[int] = None,
    ):
        """
        Initialize the cache manager.

        Args:
            ttl: Time-to-live for cache entries in seconds (defaults to config value)
            maxsize: Maximum number of entries in the cache (defaults to config value)
        """
        config = get_config()
        self._ttl = ttl if ttl is not None else config.EXTERNAL_CACHE_TTL
        self._maxsize = maxsize if maxsize is not None else config.MAX_CACHE_SIZE
        self._cache: TTLCache = TTLCache(maxsize=self._maxsize, ttl=self._ttl)
        self._hit_count = 0
        self._miss_count = 0

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve a value from the cache.

        Args:
            key: The cache key

        Returns:
            The cached value, or None if not found or expired
        """
        try:
            value = self._cache.get(key)
            if value is not None:
                self._hit_count += 1
                logger.debug(f"Cache hit for key: {key[:16]}...")
            else:
                self._miss_count += 1
                logger.debug(f"Cache miss for key: {key[:16]}...")
            return value
        except Exception as e:
            logger.warning(f"Error retrieving from cache: {e}")
            self._miss_count += 1
            return None

    def set(self, key: str, value: Any) -> None:
        """
        Store a value in the cache.

        Args:
            key: The cache key
            value: The value to cache
        """
        try:
            self._cache[key] = value
            logger.debug(f"Cached value for key: {key[:16]}...")
        except Exception as e:
            logger.warning(f"Error storing in cache: {e}")

    def delete(self, key: str) -> bool:
        """
        Remove a value from the cache.

        Args:
            key: The cache key

        Returns:
            True if the key was found and removed, False otherwise
        """
        try:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
        except Exception as e:
            logger.warning(f"Error deleting from cache: {e}")
            return False

    def clear(self) -> None:
        """Clear all entries from the cache."""
        self._cache.clear()
        self._hit_count = 0
        self._miss_count = 0
        logger.debug("Cache cleared")

    @property
    def size(self) -> int:
        """Get the current number of entries in the cache."""
        return len(self._cache)

    @property
    def hit_rate(self) -> float:
        """Get the cache hit rate as a percentage."""
        total = self._hit_count + self._miss_count
        if total == 0:
            return 0.0
        return (self._hit_count / total) * 100

    @property
    def stats(self) -> dict:
        """Get cache statistics."""
        return {
            "size": self.size,
            "maxsize": self._maxsize,
            "ttl": self._ttl,
            "hits": self._hit_count,
            "misses": self._miss_count,
            "hit_rate": self.hit_rate,
        }


def cached(
    cache_manager: CacheManager,
    key_func: Optional[Callable[..., str]] = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Decorator to cache function results.

    Args:
        cache_manager: The CacheManager instance to use
        key_func: Optional function to generate cache keys from arguments.
                  If not provided, uses generate_cache_key with the first argument.

    Returns:
        Decorated function with caching
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default: use the first positional argument as the query
                query = args[0] if args else kwargs.get("query", "")
                params = kwargs.copy()
                params.pop("query", None)
                cache_key = generate_cache_key(str(query), params if params else None)

            # Try to get from cache
            cached_value = cache_manager.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call the function and cache the result
            result = await func(*args, **kwargs)
            cache_manager.set(cache_key, result)
            return result

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                query = args[0] if args else kwargs.get("query", "")
                params = kwargs.copy()
                params.pop("query", None)
                cache_key = generate_cache_key(str(query), params if params else None)

            # Try to get from cache
            cached_value = cache_manager.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call the function and cache the result
            result = func(*args, **kwargs)
            cache_manager.set(cache_key, result)
            return result

        # Return appropriate wrapper based on whether the function is async
        import asyncio

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
