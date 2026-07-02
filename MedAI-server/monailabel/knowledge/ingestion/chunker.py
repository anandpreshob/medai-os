# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Document chunking strategies for the Knowledge Service.
"""

import logging
import re
import uuid
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from ..config import get_knowledge_config
from ..models import DocumentChunk, SourceType

logger = logging.getLogger(__name__)


class BaseChunker(ABC):
    """Abstract base class for document chunkers."""

    @abstractmethod
    def chunk(
        self,
        content: str,
        source_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[DocumentChunk]:
        """
        Split content into chunks.

        Args:
            content: The text content to chunk
            source_path: Path to the source document
            metadata: Additional metadata to attach to chunks

        Returns:
            List of DocumentChunk objects
        """
        pass

    def _generate_id(self, source_path: Optional[str], chunk_index: int) -> str:
        """Generate a unique ID for a chunk."""
        if source_path:
            # Create deterministic ID from path and index
            import hashlib
            hash_input = f"{source_path}:{chunk_index}"
            return hashlib.sha256(hash_input.encode()).hexdigest()[:16]
        return str(uuid.uuid4())[:16]


class SemanticChunker(BaseChunker):
    """
    Semantic chunker that preserves section boundaries.

    Uses 512 tokens with 64 token overlap by default.
    Attempts to split on paragraph/section boundaries when possible.
    """

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        config = get_knowledge_config()
        self.chunk_size = chunk_size or config.CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or config.CHUNK_OVERLAP

        # Section header patterns
        self.section_patterns = [
            r"\n#{1,6}\s+",  # Markdown headers
            r"\n[A-Z][A-Z\s]+:\s*\n",  # ALL CAPS headers with colon
            r"\n\d+\.\s+[A-Z]",  # Numbered sections
            r"\n[A-Z][a-z]+:\s*\n",  # Title case headers with colon
        ]

    def chunk(
        self,
        content: str,
        source_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[DocumentChunk]:
        """Split content into semantic chunks."""
        if not content or not content.strip():
            return []

        metadata = metadata or {}
        chunks: List[DocumentChunk] = []

        # First, try to split by sections
        sections = self._split_by_sections(content)

        # Then split each section into appropriately-sized chunks
        chunk_index = 0
        for section in sections:
            section_chunks = self._split_section(section)

            for chunk_text in section_chunks:
                chunk_text = chunk_text.strip()
                if not chunk_text:
                    continue

                chunk_metadata = {
                    **metadata,
                    "chunk_index": chunk_index,
                    "chunker": "semantic",
                }

                chunks.append(
                    DocumentChunk(
                        id=self._generate_id(source_path, chunk_index),
                        content=chunk_text,
                        metadata=chunk_metadata,
                        source_path=source_path,
                        chunk_index=chunk_index,
                    )
                )
                chunk_index += 1

        # Update total_chunks in all chunks
        for chunk in chunks:
            chunk.total_chunks = len(chunks)

        logger.debug(f"Created {len(chunks)} semantic chunks from content")
        return chunks

    def _split_by_sections(self, content: str) -> List[str]:
        """Split content by section headers."""
        # Find all section boundaries
        boundaries = [0]

        for pattern in self.section_patterns:
            for match in re.finditer(pattern, content):
                boundaries.append(match.start())

        boundaries = sorted(set(boundaries))
        boundaries.append(len(content))

        # Extract sections
        sections = []
        for i in range(len(boundaries) - 1):
            section = content[boundaries[i]:boundaries[i + 1]]
            if section.strip():
                sections.append(section)

        return sections if sections else [content]

    def _split_section(self, section: str) -> List[str]:
        """Split a section into chunks with overlap."""
        # Approximate token count (words * 1.3)
        words = section.split()
        approx_tokens = len(words)

        if approx_tokens <= self.chunk_size:
            return [section]

        chunks = []
        words = section.split()

        # Convert token sizes to approximate word counts
        chunk_words = int(self.chunk_size / 1.3)
        overlap_words = int(self.chunk_overlap / 1.3)

        start = 0
        while start < len(words):
            end = min(start + chunk_words, len(words))
            chunk = " ".join(words[start:end])
            chunks.append(chunk)

            # Move start with overlap
            start = end - overlap_words
            if start >= len(words):
                break

        return chunks


class StructuredChunker(BaseChunker):
    """
    Chunker for structured content like templates and forms.

    Preserves structural elements and doesn't split within forms.
    """

    def __init__(self, max_chunk_size: Optional[int] = None):
        config = get_knowledge_config()
        self.max_chunk_size = max_chunk_size or config.MAX_CHUNK_SIZE

    def chunk(
        self,
        content: str,
        source_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[DocumentChunk]:
        """Split structured content preserving structure."""
        if not content or not content.strip():
            return []

        metadata = metadata or {}
        chunks: List[DocumentChunk] = []

        # Split by major structural boundaries
        structural_boundaries = [
            r"\n---+\n",  # Horizontal rules
            r"\n\*\*\*+\n",  # Asterisk dividers
            r"\n## ",  # H2 headers
            r"\n### ",  # H3 headers
        ]

        sections = [content]
        for pattern in structural_boundaries:
            new_sections = []
            for section in sections:
                parts = re.split(pattern, section)
                new_sections.extend(parts)
            sections = new_sections

        chunk_index = 0
        for section in sections:
            section = section.strip()
            if not section:
                continue

            # If section is too large, split by paragraphs
            if len(section.split()) > self.max_chunk_size:
                paragraphs = section.split("\n\n")
                current_chunk = ""

                for para in paragraphs:
                    if len((current_chunk + para).split()) > self.max_chunk_size and current_chunk:
                        chunks.append(self._create_chunk(
                            current_chunk.strip(),
                            source_path,
                            metadata,
                            chunk_index,
                        ))
                        chunk_index += 1
                        current_chunk = para
                    else:
                        current_chunk = current_chunk + "\n\n" + para if current_chunk else para

                if current_chunk.strip():
                    chunks.append(self._create_chunk(
                        current_chunk.strip(),
                        source_path,
                        metadata,
                        chunk_index,
                    ))
                    chunk_index += 1
            else:
                chunks.append(self._create_chunk(
                    section,
                    source_path,
                    metadata,
                    chunk_index,
                ))
                chunk_index += 1

        # Update total_chunks
        for chunk in chunks:
            chunk.total_chunks = len(chunks)

        logger.debug(f"Created {len(chunks)} structured chunks")
        return chunks

    def _create_chunk(
        self,
        content: str,
        source_path: Optional[str],
        metadata: Dict[str, Any],
        chunk_index: int,
    ) -> DocumentChunk:
        """Create a DocumentChunk with proper metadata."""
        return DocumentChunk(
            id=self._generate_id(source_path, chunk_index),
            content=content,
            metadata={
                **metadata,
                "chunk_index": chunk_index,
                "chunker": "structured",
            },
            source_path=source_path,
            chunk_index=chunk_index,
        )


class OntologyChunker(BaseChunker):
    """
    Chunker for medical ontologies like RadLex.

    Creates one chunk per concept/term to maximize retrieval precision.
    """

    def chunk(
        self,
        content: str,
        source_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[DocumentChunk]:
        """Split ontology content into one chunk per concept."""
        if not content or not content.strip():
            return []

        metadata = metadata or {}
        chunks: List[DocumentChunk] = []

        # Try to detect ontology format
        lines = content.strip().split("\n")

        chunk_index = 0
        current_concept = ""
        concept_id = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Check for concept boundaries
            # RDF/OWL style: lines starting with concept IDs
            if re.match(r"^(RID\d+|[A-Z]+_\d+|http://)", line):
                if current_concept:
                    chunks.append(self._create_concept_chunk(
                        current_concept.strip(),
                        concept_id,
                        source_path,
                        metadata,
                        chunk_index,
                    ))
                    chunk_index += 1

                current_concept = line
                concept_id = line.split()[0] if " " in line else line

            # Tab-separated or CSV style
            elif "\t" in line or (line.count(",") >= 2 and '"' in line):
                if current_concept:
                    chunks.append(self._create_concept_chunk(
                        current_concept.strip(),
                        concept_id,
                        source_path,
                        metadata,
                        chunk_index,
                    ))
                    chunk_index += 1

                current_concept = line
                parts = line.split("\t") if "\t" in line else line.split(",")
                concept_id = parts[0].strip('"') if parts else None

            else:
                # Continuation of current concept
                current_concept += " " + line

        # Don't forget the last concept
        if current_concept:
            chunks.append(self._create_concept_chunk(
                current_concept.strip(),
                concept_id,
                source_path,
                metadata,
                chunk_index,
            ))

        # If no concepts were detected, fall back to line-based chunking
        if not chunks:
            logger.warning("No ontology concepts detected, falling back to line-based chunking")
            for i, line in enumerate(lines):
                if line.strip():
                    chunks.append(
                        DocumentChunk(
                            id=self._generate_id(source_path, i),
                            content=line.strip(),
                            metadata={
                                **metadata,
                                "chunk_index": i,
                                "chunker": "ontology",
                            },
                            source_path=source_path,
                            chunk_index=i,
                        )
                    )

        # Update total_chunks
        for chunk in chunks:
            chunk.total_chunks = len(chunks)

        logger.debug(f"Created {len(chunks)} ontology chunks")
        return chunks

    def _create_concept_chunk(
        self,
        content: str,
        concept_id: Optional[str],
        source_path: Optional[str],
        metadata: Dict[str, Any],
        chunk_index: int,
    ) -> DocumentChunk:
        """Create a chunk for a single ontology concept."""
        chunk_metadata = {
            **metadata,
            "chunk_index": chunk_index,
            "chunker": "ontology",
        }
        if concept_id:
            chunk_metadata["concept_id"] = concept_id

        return DocumentChunk(
            id=self._generate_id(source_path, chunk_index),
            content=content,
            metadata=chunk_metadata,
            source_path=source_path,
            chunk_index=chunk_index,
        )


def get_chunker(source_type: SourceType) -> BaseChunker:
    """
    Get the appropriate chunker for a source type.

    Args:
        source_type: The type of source document

    Returns:
        Appropriate chunker instance
    """
    if source_type == SourceType.ONTOLOGY:
        return OntologyChunker()
    elif source_type == SourceType.TEMPLATE:
        return StructuredChunker()
    else:
        return SemanticChunker()
