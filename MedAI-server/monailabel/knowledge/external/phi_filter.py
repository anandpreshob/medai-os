# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
PHI (Protected Health Information) Filter.

This module provides functionality to detect and remove PHI from text
before sending it to external APIs, ensuring HIPAA compliance.
"""

import logging
import re
from typing import Dict, List, Pattern, Tuple

from .config import get_config
from .models import PHIMatch

logger = logging.getLogger(__name__)


class PHIFilter:
    """
    Detects and removes Protected Health Information (PHI) from text.

    This filter implements pattern matching for common PHI types including:
    - Medical Record Numbers (MRN)
    - Social Security Numbers (SSN)
    - Dates (various formats)
    - Patient names with common prefixes
    - Phone numbers
    - Email addresses
    - Physical addresses with zip codes

    Usage:
        filter = PHIFilter()
        safe_text = filter.filter_text("Patient: John Doe, MRN: 12345")
        # Returns: "[REDACTED], [REDACTED]"
    """

    # PHI pattern definitions with descriptions
    PHI_PATTERNS: Dict[str, Tuple[str, Pattern]] = {
        "MRN": (
            "Medical Record Number",
            re.compile(r"\bMRN[:\s]*\d+\b", re.IGNORECASE),
        ),
        "MRN_STANDALONE": (
            "Standalone MRN pattern",
            re.compile(r"\b(?:medical\s*record\s*(?:number|#)?)[:\s]*\d+\b", re.IGNORECASE),
        ),
        "SSN": (
            "Social Security Number",
            re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        ),
        "SSN_NO_DASH": (
            "Social Security Number (no dashes)",
            re.compile(r"\b(?:SSN|Social\s*Security)[:\s#]*\d{9}\b", re.IGNORECASE),
        ),
        "DATE_SLASH": (
            "Date (MM/DD/YYYY format)",
            re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
        ),
        "DATE_DASH": (
            "Date (MM-DD-YYYY format)",
            re.compile(r"\b\d{1,2}-\d{1,2}-\d{2,4}\b"),
        ),
        "DATE_DOT": (
            "Date (MM.DD.YYYY format)",
            re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{2,4}\b"),
        ),
        "DATE_WRITTEN": (
            "Date (written format)",
            re.compile(
                r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
                re.IGNORECASE,
            ),
        ),
        "PATIENT_NAME": (
            "Patient name with prefix",
            re.compile(r"\bPatient[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b"),
        ),
        "PATIENT_NAME_FULL": (
            "Patient name variations",
            re.compile(
                r"\b(?:Patient\s*(?:Name)?|Name|Subject)[:\s]+[A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)+\b",
                re.IGNORECASE,
            ),
        ),
        "PHONE_US": (
            "US Phone number",
            re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        ),
        "PHONE_INTL": (
            "International phone number",
            re.compile(r"\+\d{1,3}[\s.-]?\d{1,4}(?:[\s.-]?\d{2,4}){1,4}\b"),
        ),
        "EMAIL": (
            "Email address",
            re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
        ),
        "ADDRESS_ZIP": (
            "Address with zip code",
            re.compile(
                r"\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir)[.,]?\s*(?:[A-Za-z]+[,\s]+)?[A-Z]{2}\s+\d{5}(?:-\d{4})?\b",
                re.IGNORECASE,
            ),
        ),
        "ZIP_CODE": (
            "Standalone zip code with city/state",
            re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b"),
        ),
        "DOB": (
            "Date of Birth prefix",
            re.compile(
                r"\b(?:DOB|Date\s*of\s*Birth|Birth\s*Date)[:\s]*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b",
                re.IGNORECASE,
            ),
        ),
        "AGE_IDENTIFIER": (
            "Age with identifier",
            re.compile(r"\b(?:Age|aged)[:\s]*\d{1,3}\s*(?:years?|yrs?|y/?o)?\b", re.IGNORECASE),
        ),
        "ACCOUNT_NUMBER": (
            "Account/ID numbers",
            re.compile(
                r"\b(?:Account|Acct|ID|Patient\s*ID)[:\s#]*\d{6,}\b",
                re.IGNORECASE,
            ),
        ),
    }

    def __init__(
        self,
        enabled: bool = True,
        replacement_text: str = "[REDACTED]",
        additional_patterns: Dict[str, Tuple[str, Pattern]] = None,
    ):
        """
        Initialize the PHI filter.

        Args:
            enabled: Whether filtering is enabled (can be disabled for testing)
            replacement_text: Text to replace detected PHI with
            additional_patterns: Additional patterns to include in filtering
        """
        config = get_config()
        self._enabled = enabled if enabled is not None else config.PHI_FILTER_ENABLED
        self._replacement_text = replacement_text or config.PHI_REPLACEMENT_TEXT
        self._patterns = dict(self.PHI_PATTERNS)

        if additional_patterns:
            self._patterns.update(additional_patterns)

    @property
    def enabled(self) -> bool:
        """Check if PHI filtering is enabled."""
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        """Enable or disable PHI filtering."""
        self._enabled = value

    def filter_text(self, text: str) -> str:
        """
        Remove all detected PHI from the given text.

        Args:
            text: The text to filter

        Returns:
            The filtered text with PHI replaced
        """
        if not self._enabled or not text:
            return text

        filtered_text = text
        matches_found = []

        # Apply patterns in a specific order to handle overlapping matches
        for pattern_name, (description, pattern) in self._patterns.items():
            matches = list(pattern.finditer(filtered_text))
            if matches:
                matches_found.extend([(m.group(), pattern_name) for m in matches])

        # Replace all matches (process from end to preserve positions)
        for pattern_name, (description, pattern) in self._patterns.items():
            filtered_text = pattern.sub(self._replacement_text, filtered_text)

        # Clean up multiple consecutive redactions
        while f"{self._replacement_text} {self._replacement_text}" in filtered_text:
            filtered_text = filtered_text.replace(
                f"{self._replacement_text} {self._replacement_text}",
                self._replacement_text,
            )

        if matches_found:
            logger.info(f"Filtered {len(matches_found)} PHI matches from text")
            for match_text, pattern_name in matches_found:
                logger.debug(f"  - {pattern_name}: '{match_text[:20]}...'")

        return filtered_text

    def contains_phi(self, text: str) -> bool:
        """
        Check if the given text contains any PHI patterns.

        Args:
            text: The text to check

        Returns:
            True if PHI is detected, False otherwise
        """
        if not text:
            return False

        for pattern_name, (description, pattern) in self._patterns.items():
            if pattern.search(text):
                logger.debug(f"PHI detected: {pattern_name} pattern matched")
                return True

        return False

    def get_phi_matches(self, text: str) -> List[PHIMatch]:
        """
        Get all PHI matches in the given text.

        Args:
            text: The text to analyze

        Returns:
            List of PHIMatch objects describing each match
        """
        if not text:
            return []

        matches = []
        for pattern_name, (description, pattern) in self._patterns.items():
            for match in pattern.finditer(text):
                matches.append(
                    PHIMatch(
                        pattern_type=pattern_name,
                        matched_text=match.group(),
                        start_position=match.start(),
                        end_position=match.end(),
                    )
                )

        # Sort by position
        matches.sort(key=lambda m: m.start_position)

        return matches

    def add_pattern(self, name: str, description: str, pattern: str, flags: int = 0) -> None:
        """
        Add a custom PHI pattern.

        Args:
            name: Unique name for the pattern
            description: Human-readable description
            pattern: Regular expression pattern string
            flags: Optional regex flags (e.g., re.IGNORECASE)
        """
        self._patterns[name] = (description, re.compile(pattern, flags))
        logger.info(f"Added custom PHI pattern: {name}")

    def remove_pattern(self, name: str) -> bool:
        """
        Remove a PHI pattern.

        Args:
            name: Name of the pattern to remove

        Returns:
            True if the pattern was removed, False if not found
        """
        if name in self._patterns:
            del self._patterns[name]
            logger.info(f"Removed PHI pattern: {name}")
            return True
        return False

    def get_pattern_names(self) -> List[str]:
        """Get a list of all pattern names."""
        return list(self._patterns.keys())


# Global PHI filter instance
_phi_filter: PHIFilter = None


def get_phi_filter() -> PHIFilter:
    """Get or create the global PHI filter instance."""
    global _phi_filter
    if _phi_filter is None:
        _phi_filter = PHIFilter()
    return _phi_filter


def filter_phi(text: str) -> str:
    """
    Convenience function to filter PHI from text using the global filter.

    Args:
        text: The text to filter

    Returns:
        The filtered text
    """
    return get_phi_filter().filter_text(text)
