# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Local RAG Search Tool - Vector database search for guidelines and templates.
"""

import logging
import time
from typing import Optional

from ..schemas import (
    LocalRAGSearchInput,
    LocalRAGSearchOutput,
    RAGResultItem,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class LocalRAGSearchTool(MCPTool):
    """
    MCP tool for searching the local vector database.

    Searches ChromaDB collections for relevant guidelines, templates,
    and ontology terms based on semantic similarity.
    """

    name = "local_rag_search"
    description = (
        "Search local knowledge base for relevant clinical guidelines, "
        "report templates, and medical terminology. Use this to find "
        "evidence-based recommendations and standardized reporting formats."
    )
    input_schema = LocalRAGSearchInput
    output_schema = LocalRAGSearchOutput

    def __init__(self):
        super().__init__()
        self._embedding_service = None
        self._collections_initialized = False

    def _get_embedding_service(self):
        """Lazy-load the embedding service."""
        if self._embedding_service is None:
            from knowledge.vectordb import get_embedding_service
            self._embedding_service = get_embedding_service()
        return self._embedding_service

    def _ensure_collections(self):
        """Ensure collections are created."""
        if not self._collections_initialized:
            from knowledge.vectordb import create_default_collections
            create_default_collections()
            self._collections_initialized = True

    def _get_collections_to_search(self, filter_type: str):
        """Determine which collections to search based on filter."""
        from knowledge.vectordb import (
            GUIDELINES_COLLECTION,
            TEMPLATES_COLLECTION,
            ONTOLOGY_COLLECTION,
        )

        if filter_type == "guideline":
            return [GUIDELINES_COLLECTION]
        elif filter_type == "template":
            return [TEMPLATES_COLLECTION]
        elif filter_type == "ontology":
            return [ONTOLOGY_COLLECTION]
        else:  # "all"
            return [GUIDELINES_COLLECTION, TEMPLATES_COLLECTION, ONTOLOGY_COLLECTION]

    def _build_where_filter(
        self,
        modality: Optional[str],
        body_region: Optional[str],
    ) -> Optional[dict]:
        """Build ChromaDB where filter from parameters."""
        conditions = []

        if modality:
            conditions.append({"modality": modality.upper()})

        if body_region:
            conditions.append({"body_region": body_region.lower()})

        if not conditions:
            return None

        if len(conditions) == 1:
            return conditions[0]

        return {"$and": conditions}

    async def execute(self, input_data: LocalRAGSearchInput) -> LocalRAGSearchOutput:
        """
        Execute local RAG search.

        Args:
            input_data: Search parameters

        Returns:
            Search results from vector database
        """
        start_time = time.time()

        try:
            from knowledge.vectordb import (
                get_or_create_collection,
                query as vectordb_query,
            )

            self._ensure_collections()

            # Get query embedding
            embedding_service = self._get_embedding_service()
            query_embedding = embedding_service.embed_text(input_data.query)

            # Build filter
            where_filter = self._build_where_filter(
                input_data.modality,
                input_data.body_region,
            )

            # Get collections to search
            collection_names = self._get_collections_to_search(input_data.filter_type)

            all_results = []

            # Search each collection
            for collection_name in collection_names:
                try:
                    collection = get_or_create_collection(collection_name)

                    results = vectordb_query(
                        collection=collection,
                        query_embedding=query_embedding,
                        top_k=input_data.top_k,
                        where_filter=where_filter,
                    )

                    # Convert to output format
                    for i, doc_id in enumerate(results.get("ids", [])):
                        distance = results.get("distances", [])[i] if results.get("distances") else 0
                        score = 1 - distance  # Convert distance to similarity

                        metadata = results.get("metadatas", [])[i] if results.get("metadatas") else {}
                        content = results.get("documents", [])[i] if results.get("documents") else ""

                        # Determine source type from collection name
                        if "guideline" in collection_name:
                            source_type = "guideline"
                        elif "template" in collection_name:
                            source_type = "template"
                        elif "ontology" in collection_name:
                            source_type = "ontology"
                        else:
                            source_type = metadata.get("source_type", "unknown")

                        all_results.append(
                            RAGResultItem(
                                id=doc_id,
                                content=content,
                                source_type=source_type,
                                source_path=metadata.get("source_path"),
                                title=metadata.get("title"),
                                score=score,
                                metadata=metadata,
                            )
                        )

                except Exception as e:
                    logger.warning(f"Error searching collection {collection_name}: {e}")
                    continue

            # Sort by score and limit
            all_results.sort(key=lambda x: x.score, reverse=True)
            all_results = all_results[:input_data.top_k]

            query_time_ms = (time.time() - start_time) * 1000

            logger.info(
                f"Local RAG search for '{input_data.query[:50]}...' "
                f"returned {len(all_results)} results in {query_time_ms:.1f}ms"
            )

            return LocalRAGSearchOutput(
                results=all_results,
                total_found=len(all_results),
                query_time_ms=query_time_ms,
            )

        except ImportError as e:
            logger.error(f"Knowledge module not available: {e}")
            return LocalRAGSearchOutput(
                results=[],
                total_found=0,
                query_time_ms=(time.time() - start_time) * 1000,
            )

        except Exception as e:
            logger.exception(f"Local RAG search failed: {e}")
            return LocalRAGSearchOutput(
                results=[],
                total_found=0,
                query_time_ms=(time.time() - start_time) * 1000,
            )
