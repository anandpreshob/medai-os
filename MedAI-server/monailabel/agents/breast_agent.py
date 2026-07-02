# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Breast Analysis Agent for AI-powered radiology report generation.
Specialized for breast MRI and mammography with BI-RADS formatting.
"""

import logging
from typing import Any, Dict, List, Optional

from .base_agent import BaseReportAgent

logger = logging.getLogger(__name__)


class BreastAnalysisAgent(BaseReportAgent):
    """
    Specialized agent for breast imaging analysis.
    Generates structured reports following BI-RADS guidelines.
    """

    AGENT_TYPE = "breast"
    AGENT_NAME = "Breast Analysis Agent"
    SUPPORTED_MODALITIES = ["MR", "MG", "US"]  # MRI, Mammography, Ultrasound

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for breast imaging analysis.

        Returns:
            Detailed system prompt with BI-RADS formatting instructions.
        """
        return """You are an expert radiologist assistant specializing in breast imaging analysis.
Your role is to generate structured radiology reports based on imaging findings, volumetric measurements, and radiomics features.

## CRITICAL FORMATTING RULES
1. Use PLAIN TEXT for report content - do NOT use markdown bold (**) or italic (*) markers
2. Use line breaks to separate different findings, not inline labels
3. Structure content with clear paragraphs, not inline bold labels
4. For lists, use simple dashes (-) without bold formatting

WRONG FORMAT (do not use):
"Breast Density:** The breasts are dense. Location:** Upper outer quadrant."

CORRECT FORMAT (use this):
"Breast Density: The breasts are heterogeneously dense (BI-RADS C).

Location: Upper outer quadrant, 2 o'clock position, 4 cm from nipple.

Size: The lesion measures 2.1 x 1.8 x 1.5 cm."

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
Brief clinical history or indication for the examination.

TECHNIQUE:
Description of imaging technique/protocol used.

COMPARISON:
Any prior studies available for comparison.

FINDINGS:
Detailed findings including:
- Background parenchymal enhancement (BPE) for MRI
- Description of any masses, non-mass enhancements, or suspicious findings
- Location using clock face position and distance from nipple
- Size, shape, margins, and internal characteristics
- Associated features (skin changes, nipple changes, lymph nodes)
- Incorporate the provided volumetric measurements and radiomics features where relevant

IMPRESSION:
Summary including:
- Primary diagnosis or differential diagnoses
- BI-RADS category with justification:
  - Category 0: Incomplete - Need additional imaging
  - Category 1: Negative - No findings
  - Category 2: Benign
  - Category 3: Probably Benign (<2% malignancy risk)
  - Category 4A: Low suspicion (2-10%)
  - Category 4B: Moderate suspicion (10-50%)
  - Category 4C: High suspicion (50-95%)
  - Category 5: Highly suggestive of malignancy (>95%)
  - Category 6: Known biopsy-proven malignancy

RECOMMENDATIONS:
Specific recommendations for follow-up or additional workup.

Important Guidelines:
1. Be precise and use standard radiology terminology
2. Always provide a BI-RADS category with justification
3. Incorporate quantitative data (volumes, radiomics) to support findings
4. For masses, describe size in 3 dimensions when volumetric data is available
5. Note any suspicious radiomics features (e.g., irregular shape metrics, heterogeneous texture)
6. Be conservative - when uncertain, recommend additional imaging or biopsy
7. Include a differential diagnosis when appropriate
8. Mention relevant anatomical landmarks (quadrant, clock position, depth)

## Radiomics Interpretation
- Sphericity < 0.8 may suggest irregular margins
- High contrast/heterogeneity in GLCM features may indicate complexity
- Rapid volume changes on serial imaging may indicate aggressive behavior

Remember: This is an AI-assisted draft that must be reviewed and finalized by a board-certified radiologist before clinical use."""

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "MR",
        clinical_context: Optional[str] = None,
        detections: Optional[List[Dict[str, Any]]] = None,
        **kwargs,  # Accept any additional kwargs for forward compatibility
    ) -> str:
        """
        Build the user prompt for breast imaging analysis.

        Extends base prompt with breast-specific context.
        """
        # Start with base prompt
        prompt = super().build_user_prompt(
            findings=findings,
            volumetrics=volumetrics,
            radiomics=radiomics,
            patient_info=patient_info,
            modality=modality,
        )

        # Add breast-specific instructions
        breast_context = """

## Additional Breast-Specific Instructions
1. Use clock-face positioning (e.g., "2 o'clock position, 5 cm from the nipple")
2. Describe breast density using BI-RADS density categories (A-D) if apparent
3. For enhancing lesions on MRI, comment on kinetic curve characteristics if inferable
4. Consider patient age and risk factors if mentioned in clinical history
5. Compare volumetric measurements to typical breast lesion sizes
6. The segmented region in the image represents the lesion of interest"""

        return prompt + breast_context


# Factory function to get agent by type
def get_agent(agent_type: str) -> BaseReportAgent:
    """
    Get the appropriate agent for the given type.

    Args:
        agent_type: Type of agent (e.g., "breast", "chestxray", "medgemma", "general",
                    "chest_longitudinal", "breast_longitudinal", "abdomen_longitudinal")

    Returns:
        Agent instance

    Raises:
        ValueError: If agent type is not supported
    """
    from .chestxray_agent import ChestXrayAnalysisAgent
    from .medgemma_agent import MedGemmaReportAgent
    from .chest_longitudinal_agent import ChestLongitudinalAgent
    from .breast_longitudinal_agent import BreastLongitudinalAgent
    from .abdomen_longitudinal_agent import AbdomenLongitudinalAgent

    agents = {
        # Single-study agents
        "breast": BreastAnalysisAgent,
        "chestxray": ChestXrayAnalysisAgent,
        "medgemma": MedGemmaReportAgent,
        # Longitudinal agents
        "chest_longitudinal": ChestLongitudinalAgent,
        "breast_longitudinal": BreastLongitudinalAgent,
        "abdomen_longitudinal": AbdomenLongitudinalAgent,
    }

    logger.info(f"get_agent called with agent_type='{agent_type}'")

    agent_class = agents.get(agent_type.lower())
    if not agent_class:
        # Default to breast for now, can add general agent later
        logger.warning(f"Unknown agent type '{agent_type}', defaulting to breast")
        agent_class = BreastAnalysisAgent
    else:
        logger.info(f"Selected agent class: {agent_class.__name__}")

    return agent_class()
