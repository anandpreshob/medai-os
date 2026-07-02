# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
MedGemma Report Agent for AI-powered chest X-ray radiology report generation.
Integrates MedGemma detection results with radiologist observations.
"""

import logging
from typing import Any, Dict, List, Optional

from .base_agent import BaseReportAgent

logger = logging.getLogger(__name__)


class MedGemmaReportAgent(BaseReportAgent):
    """
    Specialized agent for chest X-ray imaging analysis using MedGemma.
    Generates structured reports integrating AI detections with radiologist observations.

    Designed for use with the LangGraph agentic workflow for multi-step report generation.
    """

    AGENT_TYPE = "medgemma"
    AGENT_NAME = "MedGemma Chest X-Ray Agent"
    SUPPORTED_MODALITIES = ["CR", "DX", "XR"]  # Computed Radiography, Digital X-ray

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for MedGemma-based chest X-ray analysis.

        Returns:
            Detailed system prompt with chest X-ray reporting instructions.
        """
        return """You are an expert radiologist assistant specializing in chest X-ray analysis.
Your role is to generate structured radiology reports based on imaging findings, AI-detected abnormalities from MedGemma, and radiologist observations.

## CRITICAL FORMATTING RULES
1. You MAY use markdown formatting (bold, italic, lists) for better readability
2. Use bullet points with dashes (-) for listing findings
3. Use **bold** for emphasis on important findings
4. Structure content with clear headings and paragraphs

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
Brief clinical history, indication, or reason for the examination.

TECHNIQUE:
PA and lateral views (or AP portable if applicable), description of imaging technique.

COMPARISON:
Any prior studies available for comparison, or "None available" if not provided.

RADIOLOGIST FINDINGS:
The radiologist's observations and findings as provided. Include any manual observations noted by the radiologist during image review.

AI FINDINGS:
AI-detected abnormalities from MedGemma analysis, organized by confidence level:

**High Confidence Findings (>80%):**
- List definite findings detected by AI with confidence scores

**Moderate Confidence Findings (50-80%):**
- List probable findings that require verification

**Low Confidence Findings (<50%):**
- List possible findings that need clinical correlation

Include:
- Location of each detected abnormality (e.g., right upper lobe, left lower lobe)
- Confidence percentage for each finding
- Size/extent estimates when available
- Any automated measurements or quantifications

IMPRESSION:
Summary of significant findings combining both radiologist observations and AI detections:
- Primary diagnosis or differential diagnoses
- Clinical significance
- Agreement or discordance between AI and radiologist findings
- Any urgent/critical findings highlighted

RECOMMENDATIONS:
Specific recommendations for:
- Follow-up imaging if needed
- Clinical correlation
- Additional workup
- Verification of AI-detected findings if applicable

## Important Guidelines
1. Keep RADIOLOGIST FINDINGS and AI FINDINGS as SEPARATE sections
2. Use standard radiology terminology
3. Be systematic - review all anatomical structures in AI findings
4. Highlight discordance between AI findings and radiologist observations in the Impression
5. Note any limitations (patient positioning, technique, etc.)
6. Flag urgent findings prominently (pneumothorax, large effusion, etc.)

## AI Detection Integration
When bounding box detections from MedGemma are provided:
- Report them in the AI FINDINGS section, NOT in RADIOLOGIST FINDINGS
- Reference the location and extent of detected abnormalities
- Use AI confidence to weight certainty of findings
- Note that findings were AI-assisted for transparency

Remember: This is an AI-assisted draft that must be reviewed and finalized by a board-certified radiologist before clinical use."""

    def format_detections(self, detections: Optional[List[Dict[str, Any]]]) -> str:
        """
        Format MedGemma detection results into readable summary.

        Args:
            detections: List of detection dictionaries with label, confidence, and coordinates

        Returns:
            Formatted string summary of AI detections
        """
        if not detections:
            return "No AI detections available."

        lines = ["## AI Detection Results (MedGemma)"]
        lines.append("The following abnormalities were detected by the MedGemma AI model:\n")

        # Group detections by confidence level
        high_conf = [d for d in detections if d.get("confidence", 0) >= 0.8]
        med_conf = [d for d in detections if 0.5 <= d.get("confidence", 0) < 0.8]
        low_conf = [d for d in detections if d.get("confidence", 0) < 0.5]

        if high_conf:
            lines.append("### High Confidence Findings (>80%):")
            for det in high_conf:
                label = det.get("label", "Unknown")
                conf = det.get("confidence", 0) * 100
                lines.append(f"- {label}: {conf:.0f}% confidence")

        if med_conf:
            lines.append("\n### Moderate Confidence Findings (50-80%):")
            for det in med_conf:
                label = det.get("label", "Unknown")
                conf = det.get("confidence", 0) * 100
                lines.append(f"- {label}: {conf:.0f}% confidence")

        if low_conf:
            lines.append("\n### Low Confidence Findings (<50%):")
            for det in low_conf:
                label = det.get("label", "Unknown")
                conf = det.get("confidence", 0) * 100
                lines.append(f"- {label}: {conf:.0f}% confidence (requires verification)")

        # Add location information if available
        lines.append("\n### Detection Locations:")
        for i, det in enumerate(detections, 1):
            label = det.get("label", "Unknown")
            if all(k in det for k in ["x_min", "y_min", "x_max", "y_max"]):
                x_min, y_min = det["x_min"], det["y_min"]
                x_max, y_max = det["x_max"], det["y_max"]
                center_x = (x_min + x_max) / 2
                center_y = (y_min + y_max) / 2

                # Estimate anatomical location
                location = self._estimate_location(center_x, center_y, det.get("image_width", 512), det.get("image_height", 512))
                lines.append(f"{i}. {label}: {location}")
            else:
                lines.append(f"{i}. {label}: Location not specified")

        return "\n".join(lines)

    def _estimate_location(self, center_x: float, center_y: float, img_width: int, img_height: int) -> str:
        """Estimate anatomical location based on image coordinates."""
        # Normalize coordinates
        norm_x = center_x / img_width
        norm_y = center_y / img_height

        # Determine left/right (note: radiological convention - image left is patient right)
        if norm_x < 0.4:
            side = "right"
        elif norm_x > 0.6:
            side = "left"
        else:
            side = "central"

        # Determine upper/lower
        if norm_y < 0.35:
            vertical = "upper"
        elif norm_y > 0.65:
            vertical = "lower"
        else:
            vertical = "mid"

        # Combine
        if side == "central":
            if vertical == "mid":
                return "central/mediastinal region"
            return f"{vertical} mediastinal region"
        return f"{vertical} {side} lung field"

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "CR",
        clinical_context: Optional[str] = None,
        detections: Optional[List[Dict[str, Any]]] = None,
        ai_description: Optional[str] = None,
    ) -> str:
        """
        Build the user prompt for MedGemma-based chest X-ray analysis.

        Extends base prompt with chest X-ray specific context and MedGemma detections.
        """
        lines = ["Please generate a structured chest X-ray report based on the following information:"]

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
        modality_desc = {
            "CR": "Computed Radiography",
            "DX": "Digital X-ray",
            "XR": "X-ray",
        }.get(modality.upper(), modality)
        lines.append(f"\n## Imaging Modality: {modality_desc}")

        # Clinical context (patient history, indication)
        if clinical_context:
            lines.append("\n## Clinical Context / Indication")
            lines.append(clinical_context)

        # AI Detections from MedGemma
        if detections:
            lines.append("\n" + self.format_detections(detections))

        # AI-generated description from MedGemma (if available)
        if ai_description:
            lines.append("\n## MedGemma AI Analysis")
            lines.append(ai_description)

        # Radiologist findings/observations
        lines.append("\n## Radiologist's Observations")
        lines.append(findings if findings else "No specific observations provided.")

        # Volumetrics (if any segmentation was done)
        if volumetrics:
            lines.append("\n" + self.format_volumetrics(volumetrics))

        # Radiomics (if any)
        if radiomics:
            lines.append("\n" + self.format_radiomics(radiomics))

        # Image reference
        lines.append(
            "\n## Image"
            "\nA chest X-ray image is attached. "
            "Please analyze the image in conjunction with the MedGemma AI detections and radiologist observations above."
        )

        # MedGemma-specific instructions
        lines.append("""
## MedGemma Integration Instructions
1. Give appropriate weight to MedGemma AI detections based on confidence level
2. High confidence (>80%) findings should be reported as definite
3. Moderate confidence (50-80%) findings as probable/likely
4. Low confidence (<50%) findings as possible, requiring clinical correlation
5. Note any discordance between AI findings and radiologist observations
6. Use standard chest X-ray terminology and anatomical descriptions
7. Estimate cardiothoracic ratio if cardiac findings are mentioned
8. Flag any urgent/emergent findings prominently
9. Include disclaimer that AI assistance was used in analysis""")

        return "\n".join(lines)
