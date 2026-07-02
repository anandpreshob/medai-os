# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Chest X-Ray Analysis Agent for AI-powered radiology report generation.
Integrates CheXagent detection results with radiologist observations.
"""

import logging
from typing import Any, Dict, List, Optional

from .base_agent import BaseReportAgent

logger = logging.getLogger(__name__)


class ChestXrayAnalysisAgent(BaseReportAgent):
    """
    Specialized agent for chest X-ray imaging analysis.
    Generates structured reports integrating AI detections with radiologist observations.
    """

    AGENT_TYPE = "chestxray"
    AGENT_NAME = "Chest X-Ray Analysis Agent"
    SUPPORTED_MODALITIES = ["CR", "DX", "XR"]  # Computed Radiography, Digital X-ray

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for chest X-ray analysis.

        Returns:
            Detailed system prompt with chest X-ray reporting instructions.
        """
        return """You are an expert radiologist assistant specializing in chest X-ray analysis.
Your role is to generate structured radiology reports based on imaging findings, AI-detected abnormalities, and radiologist observations.

## CRITICAL FORMATTING RULES
1. Use PLAIN TEXT for report content - do NOT use markdown bold (**) or italic (*) markers
2. Use line breaks to separate different findings, not inline labels
3. Structure content with clear paragraphs, not inline bold labels
4. For lists, use simple dashes (-) without bold formatting

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
Brief clinical history, indication, or reason for the examination.

TECHNIQUE:
PA and lateral views (or AP portable if applicable), description of imaging technique.

COMPARISON:
Any prior studies available for comparison, or "None available" if not provided.

FINDINGS:
Detailed systematic review including:
- Lungs: Aeration, masses, nodules, infiltrates, consolidation, atelectasis
- Pleura: Effusions, pneumothorax, thickening
- Heart: Size (cardiothoracic ratio), contour, pericardial effusion
- Mediastinum: Width, contour, lymphadenopathy
- Bones: Ribs, spine, clavicles - fractures, lesions
- Soft tissues: Subcutaneous emphysema, foreign bodies
- Lines/tubes: Position of any medical devices

When AI detections are provided, integrate them with confidence levels:
- High confidence (>80%): Report as definite findings
- Moderate confidence (50-80%): Report as probable findings
- Low confidence (<50%): Report as possible findings or mention for radiologist review

IMPRESSION:
Summary of significant findings with:
- Primary diagnosis or differential diagnoses
- Clinical significance
- Any urgent/critical findings highlighted

RECOMMENDATIONS:
Specific recommendations for:
- Follow-up imaging if needed
- Clinical correlation
- Additional workup

## Important Guidelines
1. Integrate AI detections with radiologist observations seamlessly
2. Use standard radiology terminology
3. Be systematic - review all anatomical structures
4. Highlight discordance between AI findings and radiologist observations
5. Note any limitations (patient positioning, technique, etc.)
6. Flag urgent findings prominently (pneumothorax, large effusion, etc.)

## AI Detection Integration
When bounding box detections are provided:
- Reference the location of detected abnormalities
- Correlate with radiologist's visual assessment
- Note agreement or disagreement with AI findings
- Use AI confidence to weight certainty of findings

Remember: This is an AI-assisted draft that must be reviewed and finalized by a board-certified radiologist before clinical use."""

    def format_detections(self, detections: Optional[List[Dict[str, Any]]]) -> str:
        """
        Format AI detection results into readable summary.

        Args:
            detections: List of detection dictionaries with label, confidence, and coordinates

        Returns:
            Formatted string summary of AI detections
        """
        if not detections:
            return "No AI detections available."

        lines = ["## AI Detection Results (CheXagent)"]

        for i, det in enumerate(detections, 1):
            label = det.get("label", "Unknown")
            confidence = det.get("confidence", 0)
            confidence_pct = confidence * 100 if confidence <= 1 else confidence

            # Confidence level interpretation
            if confidence_pct >= 80:
                conf_level = "High confidence"
            elif confidence_pct >= 50:
                conf_level = "Moderate confidence"
            else:
                conf_level = "Low confidence"

            lines.append(f"\n{i}. **{label}**")
            lines.append(f"   - Confidence: {confidence_pct:.1f}% ({conf_level})")

            # Include bounding box info if available
            if all(k in det for k in ["x_min", "y_min", "x_max", "y_max"]):
                x_min, y_min = det["x_min"], det["y_min"]
                x_max, y_max = det["x_max"], det["y_max"]
                # Estimate location based on coordinates
                center_x = (x_min + x_max) / 2
                center_y = (y_min + y_max) / 2
                lines.append(f"   - Location: Image coordinates ({center_x:.0f}, {center_y:.0f})")

        return "\n".join(lines)

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "CR",
        clinical_context: Optional[str] = None,
        detections: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        Build the user prompt for chest X-ray analysis.

        Extends base prompt with chest X-ray specific context and AI detections.
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
        lines.append(f"\n## Imaging Modality: {modality}")

        # Clinical context (patient history, indication)
        if clinical_context:
            lines.append("\n## Clinical Context / Indication")
            lines.append(clinical_context)

        # AI Detections from CheXagent
        if detections:
            lines.append("\n" + self.format_detections(detections))

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
            "Please analyze the image in conjunction with the AI detections and radiologist observations above."
        )

        # Chest X-ray specific instructions
        lines.append("""
## Chest X-Ray Specific Instructions
1. Systematically review all structures (lungs, heart, mediastinum, bones, soft tissues)
2. Integrate AI bounding box detections with your visual analysis
3. Note if AI findings correlate with or differ from radiologist observations
4. Use standard chest X-ray terminology and measurements
5. For cardiac size, estimate cardiothoracic ratio if visible
6. Note any lines, tubes, or medical devices and their positioning
7. Flag any urgent/emergent findings prominently""")

        return "\n".join(lines)
