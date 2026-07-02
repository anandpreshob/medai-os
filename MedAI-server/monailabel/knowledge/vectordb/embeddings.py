# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Embedding service using sentence-transformers.
"""

import logging
from typing import List, Optional

from ..config import get_knowledge_config

logger = logging.getLogger(__name__)

# Singleton instance
_embedding_service: Optional["EmbeddingService"] = None


class EmbeddingService:
    """
    Service for generating text embeddings using sentence-transformers.

    Uses the model specified in KnowledgeConfig (default: all-MiniLM-L6-v2).
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
        device: Optional[str] = None,
    ):
        """
        Initialize the embedding service.

        Args:
            model_name: Name of the sentence-transformers model
            device: Device to run on ('cpu' or 'cuda')
        """
        config = get_knowledge_config()

        self.model_name = model_name or config.EMBEDDING_MODEL
        self.device = device or config.EMBEDDING_DEVICE
        self.dimension = config.EMBEDDING_DIMENSION
        self.batch_size = config.EMBEDDING_BATCH_SIZE

        self._model = None

        logger.info(
            f"EmbeddingService initialized with model={self.model_name}, "
            f"device={self.device}, dimension={self.dimension}"
        )

    @property
    def model(self):
        """Lazy-load the model on first use."""
        if self._model is None:
            logger.info(f"Loading embedding model: {self.model_name}")
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(
                    self.model_name,
                    device=self.device,
                )

                # Verify dimension matches
                test_embedding = self._model.encode(["test"], convert_to_numpy=True)
                actual_dim = test_embedding.shape[1]

                if actual_dim != self.dimension:
                    logger.warning(
                        f"Model dimension ({actual_dim}) differs from config ({self.dimension}). "
                        f"Updating to actual dimension."
                    )
                    self.dimension = actual_dim

            except ImportError:
                raise ImportError(
                    "sentence-transformers is required for embeddings. "
                    "Install with: pip install sentence-transformers"
                )

        return self._model

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            List[float]: Embedding vector
        """
        if not text or not text.strip():
            # Return zero vector for empty text
            return [0.0] * self.dimension

        embedding = self.model.encode(
            [text],
            convert_to_numpy=True,
            normalize_embeddings=True,  # L2 normalize for cosine similarity
        )

        return embedding[0].tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a batch of texts.

        Args:
            texts: List of input texts

        Returns:
            List[List[float]]: List of embedding vectors
        """
        if not texts:
            return []

        # Handle empty strings
        processed_texts = [t if t and t.strip() else " " for t in texts]

        embeddings = self.model.encode(
            processed_texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            batch_size=self.batch_size,
            show_progress_bar=len(texts) > 100,
        )

        return embeddings.tolist()

    def get_dimension(self) -> int:
        """Get the embedding dimension."""
        return self.dimension


def get_embedding_service() -> EmbeddingService:
    """Get or create the embedding service singleton."""
    global _embedding_service

    if _embedding_service is None:
        _embedding_service = EmbeddingService()

    return _embedding_service


def reset_embedding_service() -> None:
    """Reset the embedding service singleton (for testing)."""
    global _embedding_service
    _embedding_service = None
