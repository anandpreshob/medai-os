# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Document loaders for various file formats.
"""

import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class BaseLoader(ABC):
    """Abstract base class for document loaders."""

    @abstractmethod
    def load(self, file_path: str) -> Tuple[str, dict]:
        """
        Load a document and extract text content.

        Args:
            file_path: Path to the document file

        Returns:
            Tuple of (content text, metadata dict)
        """
        pass

    @abstractmethod
    def supports(self, file_path: str) -> bool:
        """Check if this loader supports the given file."""
        pass


class PDFLoader(BaseLoader):
    """Loader for PDF documents using pypdf."""

    SUPPORTED_EXTENSIONS = {".pdf"}

    def supports(self, file_path: str) -> bool:
        """Check if file is a PDF."""
        return Path(file_path).suffix.lower() in self.SUPPORTED_EXTENSIONS

    def load(self, file_path: str) -> Tuple[str, dict]:
        """Load PDF and extract text."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        try:
            from pypdf import PdfReader
        except ImportError:
            raise ImportError(
                "pypdf is required for PDF loading. Install with: pip install pypdf"
            )

        logger.info(f"Loading PDF: {file_path}")

        reader = PdfReader(file_path)

        # Extract metadata
        metadata = {
            "file_type": "pdf",
            "page_count": len(reader.pages),
        }

        if reader.metadata:
            if reader.metadata.title:
                metadata["title"] = reader.metadata.title
            if reader.metadata.author:
                metadata["author"] = reader.metadata.author
            if reader.metadata.creation_date:
                metadata["created_date"] = str(reader.metadata.creation_date)

        # Extract text from all pages
        text_parts = []
        for i, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"[Page {i + 1}]\n{page_text}")
            except Exception as e:
                logger.warning(f"Failed to extract text from page {i + 1}: {e}")

        content = "\n\n".join(text_parts)

        logger.info(f"Extracted {len(content)} characters from {len(reader.pages)} pages")

        return content, metadata


class MarkdownLoader(BaseLoader):
    """Loader for Markdown documents."""

    SUPPORTED_EXTENSIONS = {".md", ".markdown", ".mdown", ".mkd"}

    def supports(self, file_path: str) -> bool:
        """Check if file is Markdown."""
        return Path(file_path).suffix.lower() in self.SUPPORTED_EXTENSIONS

    def load(self, file_path: str) -> Tuple[str, dict]:
        """Load Markdown file."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Markdown file not found: {file_path}")

        logger.info(f"Loading Markdown: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract metadata from YAML frontmatter if present
        metadata = {"file_type": "markdown"}

        if content.startswith("---"):
            try:
                import yaml

                # Find end of frontmatter
                end_idx = content.find("---", 3)
                if end_idx > 0:
                    frontmatter = content[3:end_idx].strip()
                    yaml_data = yaml.safe_load(frontmatter)
                    if isinstance(yaml_data, dict):
                        metadata.update(yaml_data)

                    # Remove frontmatter from content
                    content = content[end_idx + 3:].strip()
            except Exception as e:
                logger.debug(f"Failed to parse YAML frontmatter: {e}")

        # Try to extract title from first heading
        if "title" not in metadata:
            lines = content.split("\n")
            for line in lines:
                if line.startswith("# "):
                    metadata["title"] = line[2:].strip()
                    break

        logger.info(f"Loaded {len(content)} characters from Markdown")

        return content, metadata


class HTMLLoader(BaseLoader):
    """Loader for HTML documents using BeautifulSoup."""

    SUPPORTED_EXTENSIONS = {".html", ".htm", ".xhtml"}

    def supports(self, file_path: str) -> bool:
        """Check if file is HTML."""
        return Path(file_path).suffix.lower() in self.SUPPORTED_EXTENSIONS

    def load(self, file_path: str) -> Tuple[str, dict]:
        """Load HTML and extract text."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"HTML file not found: {file_path}")

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            raise ImportError(
                "beautifulsoup4 is required for HTML loading. "
                "Install with: pip install beautifulsoup4 lxml"
            )

        logger.info(f"Loading HTML: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Parse with BeautifulSoup
        soup = BeautifulSoup(html_content, "lxml")

        # Extract metadata
        metadata = {"file_type": "html"}

        # Get title
        title_tag = soup.find("title")
        if title_tag:
            metadata["title"] = title_tag.get_text().strip()

        # Get meta tags
        for meta in soup.find_all("meta"):
            name = meta.get("name", "").lower()
            content = meta.get("content", "")
            if name and content:
                if name in ["description", "author", "keywords"]:
                    metadata[name] = content

        # Remove script, style, nav, footer elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
            element.decompose()

        # Extract text
        text = soup.get_text(separator="\n", strip=True)

        # Clean up excessive whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        content = "\n".join(lines)

        logger.info(f"Extracted {len(content)} characters from HTML")

        return content, metadata


class TextLoader(BaseLoader):
    """Loader for plain text documents."""

    SUPPORTED_EXTENSIONS = {".txt", ".text"}

    def supports(self, file_path: str) -> bool:
        """Check if file is plain text."""
        return Path(file_path).suffix.lower() in self.SUPPORTED_EXTENSIONS

    def load(self, file_path: str) -> Tuple[str, dict]:
        """Load plain text file."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Text file not found: {file_path}")

        logger.info(f"Loading text file: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        metadata = {
            "file_type": "text",
        }

        # Try to get title from first non-empty line
        for line in content.split("\n"):
            if line.strip():
                metadata["title"] = line.strip()[:100]  # First 100 chars
                break

        logger.info(f"Loaded {len(content)} characters from text file")

        return content, metadata


# Registry of all loaders
_LOADERS = [
    PDFLoader(),
    MarkdownLoader(),
    HTMLLoader(),
    TextLoader(),
]


def get_loader(file_path: str) -> Optional[BaseLoader]:
    """
    Get the appropriate loader for a file.

    Args:
        file_path: Path to the file

    Returns:
        Loader instance, or None if no loader supports the file
    """
    for loader in _LOADERS:
        if loader.supports(file_path):
            return loader

    logger.warning(f"No loader found for file: {file_path}")
    return None


def load_document(file_path: str) -> Tuple[str, dict]:
    """
    Load a document using the appropriate loader.

    Args:
        file_path: Path to the document

    Returns:
        Tuple of (content, metadata)

    Raises:
        ValueError: If no loader supports the file type
    """
    loader = get_loader(file_path)
    if loader is None:
        raise ValueError(f"Unsupported file type: {Path(file_path).suffix}")

    return loader.load(file_path)
