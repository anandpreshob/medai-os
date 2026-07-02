# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Configuration for the Knowledge Service using pydantic-settings.
"""

import os
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class KnowledgeConfig(BaseSettings):
    """Configuration for the Knowledge Service with ChromaDB."""

    # ChromaDB settings
    CHROMA_PERSIST_DIR: str = "/var/lib/medai/chroma"
    CHROMA_HOST: Optional[str] = None  # For client-server mode
    CHROMA_PORT: int = 8000

    # Embedding model settings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_DEVICE: str = "cpu"  # cpu or cuda
    EMBEDDING_BATCH_SIZE: int = 32

    # Chunking settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    MAX_CHUNK_SIZE: int = 1024

    # Service settings
    KNOWLEDGE_SERVICE_PORT: int = 8005
    KNOWLEDGE_SERVICE_HOST: str = "0.0.0.0"
    KNOWLEDGE_LOG_LEVEL: str = "INFO"

    # Query defaults
    DEFAULT_TOP_K: int = 5
    MAX_TOP_K: int = 20
    SIMILARITY_THRESHOLD: float = 0.3

    # Collection names
    GUIDELINES_COLLECTION: str = "medai_guidelines"
    TEMPLATES_COLLECTION: str = "medai_templates"
    ONTOLOGY_COLLECTION: str = "medai_ontology"

    # Ingestion settings
    SUPPORTED_FILE_EXTENSIONS: List[str] = [".pdf", ".md", ".html", ".txt"]
    MAX_FILE_SIZE_MB: int = 50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MEDAI_KNOWLEDGE_",
        case_sensitive=True,
        extra="ignore",
    )


# Singleton config instance
_config: Optional[KnowledgeConfig] = None


@lru_cache()
def get_knowledge_config() -> KnowledgeConfig:
    """Get or create the Knowledge config singleton."""
    return KnowledgeConfig()
