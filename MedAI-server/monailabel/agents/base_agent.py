# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Base class for radiology report generation agents.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class BaseReportAgent(ABC):
    """
    Abstract base class for radiology report generation agents.
    Each agent specializes in a specific imaging modality or body region.
    """

    # Agent metadata - override in subclasses
    AGENT_TYPE: str = "base"
    AGENT_NAME: str = "Base Report Agent"
    SUPPORTED_MODALITIES: list = []

    def __init__(self):
        """Initialize the agent."""
        pass

    @abstractmethod
    def get_system_prompt(self) -> str:
        """
        Get the system prompt for the LLM.

        Returns:
            System prompt string with instructions for report generation.
        """
        pass

    def format_volumetrics(self, volumetrics: Optional[Dict[str, Any]]) -> str:
        """
        Format volumetrics data into readable summary.

        Args:
            volumetrics: Volumetrics result dictionary

        Returns:
            Formatted string summary of volumetric measurements
        """
        if not volumetrics:
            return "No volumetric data available."

        lines = ["## Volumetric Measurements"]

        try:
            segments = volumetrics.get("volumetrics", {}).get("segments", [])
            metadata = volumetrics.get("metadata", {})

            if metadata:
                spacing = metadata.get("voxel_spacing_mm", [])
                if spacing:
                    lines.append(
                        f"- Voxel spacing: {spacing[0]:.2f} x {spacing[1]:.2f} x {spacing[2]:.2f} mm"
                    )

            for segment in segments:
                label = segment.get("label", f"Segment {segment.get('segment_index', '?')}")
                volume_cm3 = segment.get("total_volume_cm3", 0)
                instance_count = segment.get("instance_count", 0)

                lines.append(f"\n### {label}")
                lines.append(f"- Total volume: {volume_cm3:.2f} cm³")
                lines.append(f"- Number of instances: {instance_count}")

                instances = segment.get("instances", [])
                if instances and len(instances) <= 5:  # Only show if reasonable number
                    for inst in instances:
                        inst_vol = inst.get("volume_cm3", 0)
                        lines.append(f"  - Instance {inst.get('instance_id', '?')}: {inst_vol:.2f} cm³")

        except Exception as e:
            logger.warning(f"Error formatting volumetrics: {e}")
            return "Volumetric data could not be formatted."

        return "\n".join(lines)

    def format_radiomics(self, radiomics: Optional[Dict[str, Any]]) -> str:
        """
        Format radiomics features into readable summary.

        Args:
            radiomics: Radiomics result dictionary

        Returns:
            Formatted string summary of key radiomics features
        """
        if not radiomics:
            return "No radiomics data available."

        lines = ["## Radiomics Features"]

        try:
            segments = radiomics.get("segments", [])
            metadata = radiomics.get("metadata", {})

            if metadata:
                feature_count = metadata.get("feature_count", 0)
                lines.append(f"- Total features extracted: {feature_count}")

            for segment in segments:
                label = segment.get("label", f"Segment {segment.get('segment_index', '?')}")
                features = segment.get("features", {})

                if segment.get("error"):
                    lines.append(f"\n### {label}")
                    lines.append(f"- Error: {segment.get('error')}")
                    continue

                lines.append(f"\n### {label}")

                # First order statistics (key ones)
                firstorder = features.get("firstorder", {})
                if firstorder:
                    lines.append("**First Order Statistics:**")
                    key_stats = ["Mean", "Median", "StandardDeviation", "Skewness", "Kurtosis"]
                    for stat in key_stats:
                        if stat in firstorder:
                            lines.append(f"  - {stat}: {firstorder[stat]:.4f}")

                # Shape features
                shape = features.get("shape", {})
                if shape:
                    lines.append("**Shape Features:**")
                    key_shape = ["Sphericity", "Elongation", "Flatness", "SurfaceArea", "Volume"]
                    for stat in key_shape:
                        if stat in shape:
                            value = shape[stat]
                            if stat in ["SurfaceArea", "Volume"]:
                                lines.append(f"  - {stat}: {value:.2f}")
                            else:
                                lines.append(f"  - {stat}: {value:.4f}")

                # Texture features (selected)
                glcm = features.get("glcm", {})
                if glcm:
                    lines.append("**Texture Features (GLCM):**")
                    key_glcm = ["Contrast", "Correlation", "Energy", "Homogeneity"]
                    for stat in key_glcm:
                        if stat in glcm:
                            lines.append(f"  - {stat}: {glcm[stat]:.4f}")

        except Exception as e:
            logger.warning(f"Error formatting radiomics: {e}")
            return "Radiomics data could not be formatted."

        return "\n".join(lines)

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "Unknown",
    ) -> str:
        """
        Build the user prompt with all provided data.

        Args:
            findings: Radiologist's initial findings
            volumetrics: Volumetrics data
            radiomics: Radiomics data
            patient_info: Patient information
            modality: Imaging modality

        Returns:
            Complete user prompt for the LLM
        """
        lines = ["Please generate a structured radiology report based on the following information:"]

        # Patient info
        if patient_info:
            lines.append("\n## Patient Information")
            if patient_info.get("patientId"):
                lines.append(f"- Patient ID: {patient_info['patientId']}")
            if patient_info.get("studyDate"):
                lines.append(f"- Study Date: {patient_info['studyDate']}")
            if patient_info.get("studyDescription"):
                lines.append(f"- Study Description: {patient_info['studyDescription']}")

        # Modality
        lines.append(f"\n## Imaging Modality: {modality}")

        # Radiologist findings
        lines.append("\n## Radiologist's Initial Findings")
        lines.append(findings if findings else "No specific findings provided.")

        # Volumetrics
        if volumetrics:
            lines.append("\n" + self.format_volumetrics(volumetrics))

        # Radiomics
        if radiomics:
            lines.append("\n" + self.format_radiomics(radiomics))

        # Image reference
        lines.append(
            "\n## Image"
            "\nA mosaic image showing axial, sagittal, and coronal views is attached. "
            "Please analyze the image in conjunction with the quantitative data above."
        )

        return "\n".join(lines)
