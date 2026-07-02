# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Metadata extraction for documents in the Knowledge Service.
"""

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..models import BodyRegion, Modality, SourceType

logger = logging.getLogger(__name__)

# Keywords for detecting modality
MODALITY_KEYWORDS = {
    Modality.CT: ["ct", "computed tomography", "cat scan"],
    Modality.MR: ["mri", "mr", "magnetic resonance", "t1", "t2", "flair", "dwi"],
    Modality.XR: ["x-ray", "xray", "radiograph", "plain film"],
    Modality.CR: ["chest radiograph", "cxr", "chest x-ray"],
    Modality.US: ["ultrasound", "sonography", "echo", "doppler"],
    Modality.MG: ["mammogram", "mammography", "breast imaging"],
    Modality.NM: ["nuclear medicine", "scintigraphy", "spect"],
    Modality.PT: ["pet", "positron emission", "pet-ct", "pet/ct"],
}

# Keywords for detecting body region
BODY_REGION_KEYWORDS = {
    BodyRegion.HEAD: ["head", "brain", "cranial", "intracranial", "skull", "neuro"],
    BodyRegion.NECK: ["neck", "cervical", "thyroid", "larynx", "pharynx"],
    BodyRegion.CHEST: ["chest", "thorax", "thoracic", "lung", "pulmonary", "mediastin"],
    BodyRegion.ABDOMEN: ["abdomen", "abdominal", "liver", "kidney", "pancrea", "spleen"],
    BodyRegion.PELVIS: ["pelvis", "pelvic", "bladder", "prostate", "uterus", "ovary"],
    BodyRegion.SPINE: ["spine", "spinal", "vertebr", "lumbar", "thoracic", "cervical"],
    BodyRegion.EXTREMITY: ["extremity", "arm", "leg", "hand", "foot", "ankle", "knee", "hip", "shoulder"],
    BodyRegion.BREAST: ["breast", "mammary"],
    BodyRegion.CARDIAC: ["cardiac", "heart", "coronary", "cardio"],
}

# Keywords for detecting source type
SOURCE_TYPE_KEYWORDS = {
    SourceType.GUIDELINE: ["guideline", "recommendation", "consensus", "practice parameter", "acr"],
    SourceType.TEMPLATE: ["template", "form", "checklist", "structured report"],
    SourceType.ONTOLOGY: ["radlex", "ontology", "terminology", "vocabulary", "snomed", "icd"],
    SourceType.CLINICAL_PROTOCOL: ["protocol", "procedure", "workflow", "sop"],
    SourceType.RESEARCH_PAPER: ["study", "research", "findings", "abstract", "methods", "results"],
}


def extract_document_metadata(
    file_path: str,
    content: str,
    existing_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extract metadata from a document path and content.

    Args:
        file_path: Path to the source document
        content: Text content of the document
        existing_metadata: Existing metadata to augment

    Returns:
        Dict with extracted metadata including:
        - source_type: Detected document type
        - modality: Detected imaging modality (if any)
        - body_region: Detected body region (if any)
        - title: Document title
        - date: Document date (if detectable)
        - file_name: Original filename
        - file_extension: File extension
    """
    metadata = existing_metadata.copy() if existing_metadata else {}

    path = Path(file_path)

    # Basic file metadata
    metadata["file_name"] = path.name
    metadata["file_extension"] = path.suffix.lower()
    metadata["source_path"] = str(file_path)

    # Try to get file modification date
    if os.path.exists(file_path):
        stat = os.stat(file_path)
        metadata["file_modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()

    # Detect source type if not already set
    if "source_type" not in metadata:
        detected_type = _detect_source_type(file_path, content)
        if detected_type:
            metadata["source_type"] = detected_type.value

    # Detect modality if not already set
    if "modality" not in metadata:
        detected_modality = _detect_modality(content)
        if detected_modality:
            metadata["modality"] = detected_modality.value

    # Detect body region if not already set
    if "body_region" not in metadata:
        detected_region = _detect_body_region(content)
        if detected_region:
            metadata["body_region"] = detected_region.value

    # Extract title if not already set
    if "title" not in metadata:
        title = _extract_title(file_path, content)
        if title:
            metadata["title"] = title

    # Extract date if present in content
    if "date" not in metadata:
        date = _extract_date(content)
        if date:
            metadata["date"] = date

    # Calculate content stats
    metadata["char_count"] = len(content)
    metadata["word_count"] = len(content.split())

    return metadata


def _detect_source_type(file_path: str, content: str) -> Optional[SourceType]:
    """Detect the source type from path and content."""
    combined_text = f"{file_path} {content[:2000]}".lower()

    # Count keyword matches for each type
    scores: Dict[SourceType, int] = {}

    for source_type, keywords in SOURCE_TYPE_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined_text)
        if score > 0:
            scores[source_type] = score

    if not scores:
        return SourceType.REFERENCE  # Default

    return max(scores, key=scores.get)


def _detect_modality(content: str) -> Optional[Modality]:
    """Detect imaging modality from content."""
    content_lower = content[:5000].lower()  # Check first 5000 chars

    scores: Dict[Modality, int] = {}

    for modality, keywords in MODALITY_KEYWORDS.items():
        score = sum(content_lower.count(kw) for kw in keywords)
        if score > 0:
            scores[modality] = score

    if not scores:
        return None

    # Return modality with highest score, or ALL if multiple have similar scores
    max_score = max(scores.values())
    high_scorers = [m for m, s in scores.items() if s >= max_score * 0.5]

    if len(high_scorers) > 2:
        return Modality.ALL

    return max(scores, key=scores.get)


def _detect_body_region(content: str) -> Optional[BodyRegion]:
    """Detect body region from content."""
    content_lower = content[:5000].lower()

    scores: Dict[BodyRegion, int] = {}

    for region, keywords in BODY_REGION_KEYWORDS.items():
        score = sum(content_lower.count(kw) for kw in keywords)
        if score > 0:
            scores[region] = score

    if not scores:
        return None

    # Return region with highest score, or ALL if multiple
    max_score = max(scores.values())
    high_scorers = [r for r, s in scores.items() if s >= max_score * 0.5]

    if len(high_scorers) > 2:
        return BodyRegion.ALL

    return max(scores, key=scores.get)


def _extract_title(file_path: str, content: str) -> Optional[str]:
    """Extract document title."""
    # Try filename first (without extension)
    path = Path(file_path)
    filename_title = path.stem.replace("_", " ").replace("-", " ")

    # Look for title in content
    lines = content.split("\n")[:20]  # Check first 20 lines

    for line in lines:
        line = line.strip()

        # Markdown header
        if line.startswith("# "):
            return line[2:].strip()

        # ALL CAPS title
        if line.isupper() and 5 < len(line) < 100:
            return line.title()

        # Title case line at the start
        if line and not line.startswith("#") and len(line) < 100:
            words = line.split()
            if words and all(w[0].isupper() if w[0].isalpha() else True for w in words[:3]):
                return line

    # Fall back to filename
    if filename_title and len(filename_title) > 3:
        return filename_title.title()

    return None


def _extract_date(content: str) -> Optional[str]:
    """Extract date from content."""
    # Common date patterns
    date_patterns = [
        r"\b(\d{4}-\d{2}-\d{2})\b",  # ISO format
        r"\b(\d{1,2}/\d{1,2}/\d{4})\b",  # US format
        r"\b(\d{1,2}-\d{1,2}-\d{4})\b",  # Dash format
        r"\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b",  # Long month
        r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b",  # Short month
    ]

    for pattern in date_patterns:
        match = re.search(pattern, content[:2000], re.IGNORECASE)
        if match:
            return match.group(1)

    return None


def enrich_metadata_from_content(
    content: str,
    current_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Enrich existing metadata with additional content analysis.

    Args:
        content: Document content
        current_metadata: Existing metadata

    Returns:
        Enriched metadata dict
    """
    metadata = current_metadata.copy()

    # Extract any mentions of specific standards/organizations
    standards = _extract_standards(content)
    if standards:
        metadata["standards"] = standards

    # Extract any specific procedure names
    procedures = _extract_procedures(content)
    if procedures:
        metadata["procedures"] = procedures

    return metadata


def _extract_standards(content: str) -> List[str]:
    """Extract mentions of medical imaging standards."""
    standards = []
    content_lower = content.lower()

    standard_patterns = [
        (r"ACR\s+\w+", "ACR"),
        (r"BI-RADS", "BI-RADS"),
        (r"TI-RADS", "TI-RADS"),
        (r"PI-RADS", "PI-RADS"),
        (r"LI-RADS", "LI-RADS"),
        (r"Lung-RADS", "Lung-RADS"),
        (r"RSNA", "RSNA"),
        (r"DICOM", "DICOM"),
    ]

    for pattern, name in standard_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            if name not in standards:
                standards.append(name)

    return standards


def _extract_procedures(content: str) -> List[str]:
    """Extract mentions of specific procedures."""
    procedures = []

    procedure_keywords = [
        "biopsy",
        "ablation",
        "drainage",
        "injection",
        "angiography",
        "arthrography",
        "myelography",
        "fluoroscopy",
        "intervention",
    ]

    content_lower = content.lower()
    for proc in procedure_keywords:
        if proc in content_lower:
            procedures.append(proc)

    return procedures
