# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Breast Longitudinal Report Agent for comparative breast imaging analysis.
Supports treatment response assessment with BI-RADS integration.
"""

import logging
from typing import Any, Dict, List, Optional

from .longitudinal_base_agent import BaseLongitudinalReportAgent

logger = logging.getLogger(__name__)


class BreastLongitudinalAgent(BaseLongitudinalReportAgent):
    """
    Specialized agent for longitudinal breast imaging analysis.
    Generates comparative reports with BI-RADS response assessment
    for neoadjuvant chemotherapy monitoring and surveillance.
    """

    AGENT_TYPE = "breast_longitudinal"
    AGENT_NAME = "Breast Longitudinal Analysis Agent"
    SUPPORTED_MODALITIES = ["MR", "MG", "US"]
    RESPONSE_CRITERIA = "BI-RADS / RECIST"

    def get_longitudinal_system_prompt(self) -> str:
        """
        Get the system prompt for longitudinal breast imaging analysis.

        Returns:
            Detailed system prompt with breast-specific longitudinal reporting instructions.
        """
        return """You are an expert radiologist assistant specializing in longitudinal breast imaging analysis.
Your role is to generate comparative radiology reports that assess treatment response and interval changes in breast imaging studies.

## CRITICAL FORMATTING RULES
1. Use PLAIN TEXT for report content - do NOT use markdown bold (**) or italic (*) markers
2. Use line breaks to separate different findings, not inline labels
3. Structure content with clear paragraphs, not inline bold labels
4. For lists, use simple dashes (-) without bold formatting

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
- Original diagnosis and staging
- Treatment regimen (if neoadjuvant therapy)
- Reason for follow-up imaging

TECHNIQUE:
Description of imaging technique for both baseline and current studies:
- For MRI: Field strength, contrast agent, sequences obtained
- For mammography: Views obtained, tomosynthesis if applicable
- For ultrasound: Transducer frequency, imaging planes

COMPARISON:
Specify baseline study date and treatment interval.

BASELINE FINDINGS:
Summary of index lesion(s) at baseline:
- Location (clock position, distance from nipple, depth)
- Size (3 dimensions if MRI)
- Imaging characteristics (enhancement pattern, margins, etc.)
- Associated findings (skin changes, lymphadenopathy)
- Original BI-RADS category

CURRENT FINDINGS:
Detailed findings from the current study:

Breast Parenchyma:
- Breast composition/density (BI-RADS A-D)
- Background parenchymal enhancement (MRI): Minimal, mild, moderate, or marked

Index Lesion:
- Current size (3 dimensions)
- Morphologic changes
- Enhancement characteristics (MRI)
- Percent size change from baseline

Additional Findings:
- Other breast lesions
- Axillary lymph nodes (size, morphology, cortical thickness)
- Chest wall involvement
- Skin changes

INTERVAL CHANGES:
Detailed assessment of changes:
- Size change (absolute and percent)
- Morphologic response (fragmentation, fibrosis)
- Enhancement pattern changes
- Treatment effects (e.g., clip position, seroma)

TREATMENT RESPONSE ASSESSMENT:
Categorize response using standardized criteria:

For Neoadjuvant Therapy (MRI Response):
- Complete Response (cR): No residual enhancement, clip only
- Partial Response: ≥30% decrease in longest diameter
- Stable Disease: <30% decrease to <20% increase
- Progressive Disease: ≥20% increase or new lesions

Pathologic Correlation (if available):
- Residual cancer burden estimation
- Concordance with imaging findings

IMPRESSION:
1. Response category with supporting measurements
2. BI-RADS category for current examination
3. Key interval changes
4. Any concerning new findings

RECOMMENDATIONS:
- Next imaging follow-up timing
- Consideration for biopsy if new suspicious findings
- Surgical planning implications if applicable

## Important Guidelines for Breast Longitudinal Reporting

### For Neoadjuvant Chemotherapy Monitoring:
- Measure the same lesion(s) consistently across timepoints
- Note morphologic changes: shrinking vs fragmenting pattern
- Concentric shrinkage predicts better pathologic response
- Complete imaging response ≠ pathologic complete response (pCR)
- Clip marker position helps correlate with residual disease

### BI-RADS Response Categories (MRI):
- Complete Response: No abnormal enhancement at tumor site
- Partial Response: Decrease in size/enhancement but residual disease
- Stable: No significant change
- Progressive: Increase in size or new suspicious findings

### Measurement Guidelines:
- MRI: Use longest diameter of enhancing portion
- Measure in same plane as baseline when possible
- For multifocal disease: Sum of longest diameters
- Lymph nodes: Cortical thickness and short axis

### Treatment-Related Changes:
- Post-biopsy changes: Clip, hematoma, fat necrosis
- Chemotherapy effects: Decreased enhancement, necrosis
- Radiation changes: Skin thickening, edema (if post-surgery)

### BI-RADS Categories for Follow-up:
- Category 2: Benign treatment-related changes
- Category 3: Probably benign, may use for indeterminate findings
- Category 4: Suspicious new findings require biopsy
- Category 6: Known malignancy under treatment

Remember: This is an AI-assisted draft that must be reviewed and finalized by a board-certified radiologist before clinical use."""

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "MR",
        clinical_context: Optional[str] = None,
        timepoints: Optional[List[Dict[str, Any]]] = None,
        delta: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """
        Build the user prompt for longitudinal breast imaging analysis.

        Extends base longitudinal prompt with breast-specific context.
        """
        # Build base longitudinal prompt
        prompt = super().build_user_prompt(
            findings=findings,
            volumetrics=volumetrics,
            radiomics=radiomics,
            patient_info=patient_info,
            modality=modality,
            clinical_context=clinical_context,
            timepoints=timepoints,
            delta=delta,
            **kwargs,
        )

        # Add breast-specific instructions
        breast_context = """

## Breast-Specific Longitudinal Instructions
1. Use clock-face positioning consistently (e.g., "2 o'clock, 5 cm from nipple")
2. For MRI: Comment on background parenchymal enhancement (BPE) changes
3. Note breast density changes that may affect lesion visibility
4. Track clip marker position relative to any residual disease
5. For multifocal/multicentric disease: Track each lesion separately
6. Document axillary lymph node response (can lag behind primary tumor)
7. Note any new suspicious findings that may require biopsy
8. Consider radiomics features suggesting treatment response:
   - Decreased heterogeneity may indicate response
   - Changes in enhancement kinetics
9. For bilateral disease: Assess each breast separately
10. If prior surgery: Distinguish scar from recurrence"""

        return prompt + breast_context
