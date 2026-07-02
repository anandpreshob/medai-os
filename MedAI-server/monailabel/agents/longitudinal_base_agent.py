# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Base class for longitudinal report generation agents.
Extends BaseReportAgent with methods for formatting multi-timepoint data
and delta calculations for interval change assessment.
"""

import logging
from abc import abstractmethod
from typing import Any, Dict, List, Optional

from .base_agent import BaseReportAgent

logger = logging.getLogger(__name__)


class BaseLongitudinalReportAgent(BaseReportAgent):
    """
    Abstract base class for longitudinal radiology report generation.
    Specialized for comparing imaging studies across multiple timepoints.
    """

    # Agent metadata - override in subclasses
    AGENT_TYPE: str = "longitudinal_base"
    AGENT_NAME: str = "Base Longitudinal Report Agent"
    SUPPORTED_MODALITIES: list = []

    # Response assessment criteria supported
    RESPONSE_CRITERIA: str = "RECIST"  # Override in subclasses: RECIST, BI-RADS, RANO, etc.

    def format_timepoints(self, timepoints: List[Dict[str, Any]]) -> str:
        """
        Format timepoint information into readable summary.

        Args:
            timepoints: List of timepoint dictionaries with label, date, metrics, etc.

        Returns:
            Formatted string summary of timepoints
        """
        if not timepoints:
            return "No timepoint data available."

        lines = ["## Study Timepoints"]

        for i, tp in enumerate(timepoints):
            label = tp.get("label", f"Timepoint {i + 1}")
            study_date = tp.get("studyDate", "Unknown date")

            lines.append(f"\n### {label} ({study_date})")

            # Include metrics if available
            metrics = tp.get("metrics", {})
            if metrics:
                volume = metrics.get("volumeCc") or metrics.get("volume_cm3")
                if volume is not None:
                    lines.append(f"- Total Volume: {volume:.2f} cm³")

                diameter = metrics.get("maxDiameterMm") or metrics.get("max_diameter_mm")
                if diameter is not None:
                    lines.append(f"- Max Diameter: {diameter:.1f} mm")

                lesion_count = metrics.get("lesionCount") or metrics.get("instance_count")
                if lesion_count is not None:
                    lines.append(f"- Lesion Count: {lesion_count}")

            # Include detections count if available
            detections = tp.get("detections", [])
            if detections:
                lines.append(f"- AI Detections: {len(detections)} finding(s)")

            # Include notes if available
            notes = tp.get("notes")
            if notes:
                lines.append(f"- Notes: {notes}")

        return "\n".join(lines)

    def format_longitudinal_metrics(self, delta: Optional[Dict[str, Any]]) -> str:
        """
        Format delta calculations into readable summary.

        Args:
            delta: Delta dictionary with segment changes and summary

        Returns:
            Formatted string summary of interval changes
        """
        if not delta:
            return "No interval change data available."

        lines = ["## Interval Change Analysis"]

        # Summary statistics
        summary = delta.get("summary", {})
        if summary:
            total_change = summary.get("totalVolumeChangePercent", 0)
            classification = summary.get("classification", "not_evaluable")

            lines.append("\n### Overall Assessment")
            lines.append(f"- Total Volume Change: {total_change:+.1f}%")
            lines.append(f"- Response Classification: {self._format_classification(classification)}")

            new_lesions = summary.get("newLesionCount", 0)
            resolved_lesions = summary.get("resolvedLesionCount", 0)

            if new_lesions > 0:
                lines.append(f"- New Lesions: {new_lesions}")
            if resolved_lesions > 0:
                lines.append(f"- Resolved Lesions: {resolved_lesions}")

        # Per-segment changes
        segments = delta.get("segments", [])
        if segments:
            lines.append("\n### Per-Lesion Changes")

            for seg in segments:
                label = seg.get("segmentLabel", "Unknown")
                baseline_vol = seg.get("baselineVolumeCm3", 0)
                current_vol = seg.get("currentVolumeCm3", 0)
                percent_change = seg.get("percentChange", 0)
                classification = seg.get("classification", "not_evaluable")

                lines.append(f"\n**{label}:**")
                lines.append(f"  - Baseline: {baseline_vol:.2f} cm³ → Current: {current_vol:.2f} cm³")
                lines.append(f"  - Change: {percent_change:+.1f}%")
                lines.append(f"  - Assessment: {self._format_classification(classification)}")

                # Include diameter changes if available
                baseline_diam = seg.get("baselineDiameterMm")
                current_diam = seg.get("currentDiameterMm")
                if baseline_diam is not None and current_diam is not None:
                    diam_change = seg.get("diameterChangePercent", 0)
                    lines.append(f"  - Diameter: {baseline_diam:.1f}mm → {current_diam:.1f}mm ({diam_change:+.1f}%)")

        return "\n".join(lines)

    def _format_classification(self, classification: str) -> str:
        """
        Format progression classification for display.

        Args:
            classification: Classification string from delta calculations

        Returns:
            Human-readable classification label
        """
        labels = {
            "complete_response": "Complete Response (CR)",
            "partial_response": "Partial Response (PR)",
            "stable_disease": "Stable Disease (SD)",
            "progressive_disease": "Progressive Disease (PD)",
            "not_evaluable": "Not Evaluable (NE)",
        }
        return labels.get(classification, classification)

    def format_comparison_images(self, timepoints: List[Dict[str, Any]]) -> str:
        """
        Format description of comparison images being analyzed.

        Args:
            timepoints: List of timepoint dictionaries

        Returns:
            Formatted description of images
        """
        if not timepoints or len(timepoints) < 2:
            return "Single study - no comparison available."

        baseline = timepoints[0]
        current = timepoints[-1]

        baseline_label = baseline.get("label", "Baseline")
        baseline_date = baseline.get("studyDate", "Unknown")
        current_label = current.get("label", "Current")
        current_date = current.get("studyDate", "Unknown")

        interval = self._calculate_interval(baseline_date, current_date)

        lines = [
            "## Comparison Studies",
            f"- Baseline: {baseline_label} ({baseline_date})",
            f"- Current: {current_label} ({current_date})",
        ]

        if interval:
            lines.append(f"- Interval: {interval}")

        return "\n".join(lines)

    def _calculate_interval(self, baseline_date: str, current_date: str) -> Optional[str]:
        """
        Calculate interval between two dates.

        Args:
            baseline_date: Baseline study date string
            current_date: Current study date string

        Returns:
            Human-readable interval string, or None if cannot calculate
        """
        try:
            from datetime import datetime

            # Try common date formats
            formats = ["%Y-%m-%d", "%Y%m%d", "%m/%d/%Y", "%d/%m/%Y"]

            baseline_dt = None
            current_dt = None

            for fmt in formats:
                try:
                    baseline_dt = datetime.strptime(baseline_date, fmt)
                    break
                except ValueError:
                    continue

            for fmt in formats:
                try:
                    current_dt = datetime.strptime(current_date, fmt)
                    break
                except ValueError:
                    continue

            if baseline_dt and current_dt:
                delta = current_dt - baseline_dt
                days = delta.days

                if days < 30:
                    return f"{days} days"
                elif days < 365:
                    months = days // 30
                    return f"~{months} month{'s' if months > 1 else ''}"
                else:
                    years = days // 365
                    remaining_months = (days % 365) // 30
                    if remaining_months > 0:
                        return f"~{years} year{'s' if years > 1 else ''}, {remaining_months} month{'s' if remaining_months > 1 else ''}"
                    return f"~{years} year{'s' if years > 1 else ''}"

        except Exception as e:
            logger.warning(f"Could not calculate interval: {e}")

        return None

    @abstractmethod
    def get_longitudinal_system_prompt(self) -> str:
        """
        Get the system prompt specific to longitudinal comparison reporting.

        Subclasses must implement this to provide domain-specific instructions
        for interval change assessment.

        Returns:
            System prompt string with longitudinal reporting instructions.
        """
        pass

    def get_system_prompt(self) -> str:
        """
        Get the system prompt - delegates to longitudinal-specific prompt.

        Returns:
            System prompt for longitudinal report generation.
        """
        return self.get_longitudinal_system_prompt()

    def build_longitudinal_prompt(
        self,
        findings: str,
        timepoints: List[Dict[str, Any]],
        delta: Optional[Dict[str, Any]] = None,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "Unknown",
        clinical_context: Optional[str] = None,
        **kwargs,
    ) -> str:
        """
        Build the user prompt for longitudinal report generation.

        Args:
            findings: Radiologist's observations
            timepoints: List of timepoint data
            delta: Delta calculations between timepoints
            volumetrics: Current volumetrics (optional, for backwards compat)
            radiomics: Current radiomics (optional, for backwards compat)
            patient_info: Patient information
            modality: Imaging modality
            clinical_context: Clinical history/indication

        Returns:
            Complete user prompt for the LLM
        """
        lines = ["Please generate a longitudinal comparison radiology report based on the following information:"]

        # Patient info
        if patient_info:
            lines.append("\n## Patient Information")
            if patient_info.get("patientId"):
                lines.append(f"- Patient ID: {patient_info['patientId']}")
            if patient_info.get("patientName"):
                lines.append(f"- Patient Name: {patient_info['patientName']}")
            if patient_info.get("studyDate"):
                lines.append(f"- Current Study Date: {patient_info['studyDate']}")
            if patient_info.get("studyDescription"):
                lines.append(f"- Study Description: {patient_info['studyDescription']}")

        # Modality and clinical context
        lines.append(f"\n## Imaging Modality: {modality}")

        if clinical_context:
            lines.append("\n## Clinical History / Indication")
            lines.append(clinical_context)

        # Timepoint information
        if timepoints:
            lines.append("\n" + self.format_comparison_images(timepoints))
            lines.append("\n" + self.format_timepoints(timepoints))

        # Delta calculations
        if delta:
            lines.append("\n" + self.format_longitudinal_metrics(delta))

        # Radiologist findings
        lines.append("\n## Radiologist's Observations")
        lines.append(findings if findings else "No specific observations provided.")

        # Current volumetrics (if provided separately)
        if volumetrics:
            lines.append("\n" + self.format_volumetrics(volumetrics))

        # Current radiomics (if provided separately)
        if radiomics:
            lines.append("\n" + self.format_radiomics(radiomics))

        # Image reference
        lines.append(
            "\n## Images"
            "\nComparison images from baseline and current studies are attached. "
            "Please analyze the images to assess interval changes and correlate with the quantitative data above."
        )

        # Response criteria reminder
        lines.append(f"\n## Response Criteria: {self.RESPONSE_CRITERIA}")

        return "\n".join(lines)

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "Unknown",
        clinical_context: Optional[str] = None,
        timepoints: Optional[List[Dict[str, Any]]] = None,
        delta: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """
        Build the user prompt - routes to longitudinal prompt if timepoints provided.

        This method maintains compatibility with the base interface while supporting
        longitudinal-specific parameters.
        """
        # If longitudinal data provided, use longitudinal prompt builder
        if timepoints and len(timepoints) >= 2:
            return self.build_longitudinal_prompt(
                findings=findings,
                timepoints=timepoints,
                delta=delta,
                volumetrics=volumetrics,
                radiomics=radiomics,
                patient_info=patient_info,
                modality=modality,
                clinical_context=clinical_context,
                **kwargs,
            )

        # Fall back to standard single-study prompt
        return super().build_user_prompt(
            findings=findings,
            volumetrics=volumetrics,
            radiomics=radiomics,
            patient_info=patient_info,
            modality=modality,
        )
