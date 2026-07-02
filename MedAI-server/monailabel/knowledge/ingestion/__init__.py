# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Document ingestion module for the Knowledge Service.
"""

from .chunker import OntologyChunker, SemanticChunker, StructuredChunker, get_chunker
from .loader import HTMLLoader, MarkdownLoader, PDFLoader, get_loader
from .metadata import extract_document_metadata

__all__ = [
    # Chunkers
    "SemanticChunker",
    "StructuredChunker",
    "OntologyChunker",
    "get_chunker",
    # Loaders
    "PDFLoader",
    "MarkdownLoader",
    "HTMLLoader",
    "get_loader",
    # Metadata
    "extract_document_metadata",
]
