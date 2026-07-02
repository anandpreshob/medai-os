# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Case context injection for chat sessions.

Provides utilities to format case context from the MedAI viewer
into structured text suitable for LLM consumption.
"""

import logging
from typing import Any, Dict, List, Optional

from .session_manager import CaseContext, ChatSession

logger = logging.getLogger(__name__)


class CaseContextInjector:
    """
    Formats and injects case context into chat prompts.

    This class converts structured case data (modality, segmentations,
    volumetrics, detections) into human-readable markdown format
    that can be included in LLM prompts.
    """

    def __init__(
        self,
        include_volumetrics: bool = True,
        include_radiomics: bool = False,
        max_detections: int = 10,
        max_segmentations: int = 10,
    ):
        """
        Initialize the context injector.

        Args:
            include_volumetrics: Include volumetric measurements
            include_radiomics: Include radiomic features
            max_detections: Maximum detections to include
            max_segmentations: Maximum segmentations to include
        """
        self.include_volumetrics = include_volumetrics
        self.include_radiomics = include_radiomics
        self.max_detections = max_detections
        self.max_segmentations = max_segmentations

    def inject_case_context(self, session: ChatSession) -> str:
        """
        Generate formatted case context from a chat session.

        Args:
            session: The chat session with cached case context

        Returns:
            Formatted markdown string with case context
        """
        if session.cached_case_context is None:
            return ""

        return self.format_case_context(session.cached_case_context)

    def format_case_context(self, context: CaseContext) -> str:
        """
        Format a CaseContext object into markdown.

        Args:
            context: The case context to format

        Returns:
            Formatted markdown string
        """
        sections = []

        # Header
        sections.append("## Current Case Context")
        sections.append("")

        # Study information
        study_info = self._format_study_info(context)
        if study_info:
            sections.append(study_info)

        # Patient info (anonymized)
        patient_info = self._format_patient_info(context)
        if patient_info:
            sections.append(patient_info)

        # Segmentations
        seg_info = self._format_segmentations(context)
        if seg_info:
            sections.append(seg_info)

        # Volumetrics
        if self.include_volumetrics:
            vol_info = self._format_volumetrics(context)
            if vol_info:
                sections.append(vol_info)

        # Detections
        det_info = self._format_detections(context)
        if det_info:
            sections.append(det_info)

        # Longitudinal flag
        if context.is_longitudinal:
            sections.append("### Longitudinal Study")
            sections.append("*This is a longitudinal study with multiple timepoints available for comparison.*")
            sections.append("")

        return "\n".join(sections)

    def _format_study_info(self, context: CaseContext) -> str:
        """Format study information section."""
        lines = ["### Study Information", ""]

        lines.append(f"- **Modality:** {context.modality}")

        if context.body_region:
            lines.append(f"- **Body Region:** {context.body_region}")

        if context.study_info:
            info = context.study_info
            if info.get("study_description"):
                lines.append(f"- **Study Description:** {info['study_description']}")
            if info.get("study_date"):
                lines.append(f"- **Study Date:** {info['study_date']}")
            if info.get("institution"):
                lines.append(f"- **Institution:** {info['institution']}")

        lines.append("")
        return "\n".join(lines)

    def _format_patient_info(self, context: CaseContext) -> str:
        """Format patient information section (limited to clinical context)."""
        if not context.patient_info:
            return ""

        lines = ["### Clinical Context", ""]

        info = context.patient_info

        # Only include clinically relevant, non-identifying information
        if info.get("age"):
            lines.append(f"- **Age:** {info['age']}")
        if info.get("sex"):
            lines.append(f"- **Sex:** {info['sex']}")
        if info.get("clinical_history"):
            lines.append(f"- **Clinical History:** {info['clinical_history']}")
        if info.get("indication"):
            lines.append(f"- **Indication:** {info['indication']}")

        if len(lines) == 2:  # Only header added
            return ""

        lines.append("")
        return "\n".join(lines)

    def _format_segmentations(self, context: CaseContext) -> str:
        """Format segmentation results section."""
        if not context.segmentations:
            return ""

        lines = ["### AI Segmentation Results", ""]

        segmentations = context.segmentations[: self.max_segmentations]

        for i, seg in enumerate(segmentations, 1):
            label = seg.get("label", f"Segmentation {i}")
            lines.append(f"**{i}. {label}**")

            # Volume if available
            if seg.get("volume_ml"):
                lines.append(f"   - Volume: {seg['volume_ml']:.2f} mL")
            if seg.get("volume_cc"):
                lines.append(f"   - Volume: {seg['volume_cc']:.2f} cc")

            # Dimensions if available
            if seg.get("dimensions"):
                dims = seg["dimensions"]
                lines.append(
                    f"   - Dimensions: {dims.get('length', 'N/A')} x "
                    f"{dims.get('width', 'N/A')} x {dims.get('height', 'N/A')} mm"
                )

            # Location if available
            if seg.get("location"):
                lines.append(f"   - Location: {seg['location']}")

            # Confidence if available
            if seg.get("confidence"):
                lines.append(f"   - AI Confidence: {seg['confidence']:.1%}")

            lines.append("")

        if len(context.segmentations) > self.max_segmentations:
            lines.append(
                f"*... and {len(context.segmentations) - self.max_segmentations} more segmentations*"
            )
            lines.append("")

        return "\n".join(lines)

    def _format_volumetrics(self, context: CaseContext) -> str:
        """Format volumetric measurements section."""
        if not context.volumetrics_summary:
            return ""

        lines = ["### Volumetric Measurements", ""]

        vol = context.volumetrics_summary

        # Format based on common volumetric structures
        if isinstance(vol, dict):
            for key, value in vol.items():
                if isinstance(value, dict):
                    lines.append(f"**{self._format_key(key)}:**")
                    for sub_key, sub_value in value.items():
                        formatted_value = self._format_value(sub_value)
                        lines.append(f"   - {self._format_key(sub_key)}: {formatted_value}")
                else:
                    formatted_value = self._format_value(value)
                    lines.append(f"- **{self._format_key(key)}:** {formatted_value}")

        lines.append("")
        return "\n".join(lines)

    def _format_detections(self, context: CaseContext) -> str:
        """Format AI detection results section."""
        if not context.detections:
            return ""

        lines = ["### AI Detections", ""]
        lines.append("*[AI] markers indicate AI-detected findings requiring radiologist verification*")
        lines.append("")

        detections = context.detections[: self.max_detections]

        for i, det in enumerate(detections, 1):
            label = det.get("label", f"Detection {i}")
            confidence = det.get("confidence", 0)

            # Confidence indicator
            conf_str = f"({confidence:.0%} confidence)" if confidence else ""
            lines.append(f"**{i}. [AI] {label}** {conf_str}")

            # Location/coordinates
            if det.get("location"):
                lines.append(f"   - Location: {det['location']}")
            elif det.get("bounding_box"):
                bbox = det["bounding_box"]
                lines.append(f"   - Bounding Box: {bbox}")

            # Size if available
            if det.get("size_mm"):
                lines.append(f"   - Size: {det['size_mm']} mm")

            # Classification if available
            if det.get("classification"):
                lines.append(f"   - Classification: {det['classification']}")

            # Additional notes
            if det.get("notes"):
                lines.append(f"   - Notes: {det['notes']}")

            lines.append("")

        if len(context.detections) > self.max_detections:
            lines.append(
                f"*... and {len(context.detections) - self.max_detections} more detections*"
            )
            lines.append("")

        return "\n".join(lines)

    def _format_key(self, key: str) -> str:
        """Format a dictionary key for display."""
        # Convert snake_case or camelCase to Title Case
        result = key.replace("_", " ").replace("-", " ")
        # Handle camelCase
        import re

        result = re.sub(r"([a-z])([A-Z])", r"\1 \2", result)
        return result.title()

    def _format_value(self, value: Any) -> str:
        """Format a value for display."""
        if value is None:
            return "N/A"
        if isinstance(value, float):
            return f"{value:.2f}"
        if isinstance(value, bool):
            return "Yes" if value else "No"
        if isinstance(value, list):
            return ", ".join(str(v) for v in value)
        return str(value)


def format_context_for_llm(
    context: CaseContext,
    include_volumetrics: bool = True,
    include_radiomics: bool = False,
) -> str:
    """
    Convenience function to format case context for LLM.

    Args:
        context: The case context to format
        include_volumetrics: Include volumetric measurements
        include_radiomics: Include radiomic features

    Returns:
        Formatted markdown string
    """
    injector = CaseContextInjector(
        include_volumetrics=include_volumetrics,
        include_radiomics=include_radiomics,
    )
    return injector.format_case_context(context)


def create_context_summary(context: CaseContext) -> str:
    """
    Create a brief one-line summary of the case context.

    Args:
        context: The case context

    Returns:
        Brief summary string
    """
    parts = [context.modality]

    if context.body_region:
        parts.append(context.body_region)

    if context.segmentations:
        parts.append(f"{len(context.segmentations)} segmentations")

    if context.detections:
        parts.append(f"{len(context.detections)} AI detections")

    if context.is_longitudinal:
        parts.append("longitudinal")

    return " | ".join(parts)
