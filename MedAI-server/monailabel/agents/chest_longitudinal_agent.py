# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Chest Longitudinal Report Agent for comparative chest imaging analysis.
Supports interval change assessment for chest CT and chest X-ray studies.
"""

import logging
from typing import Any, Dict, List, Optional

from .longitudinal_base_agent import BaseLongitudinalReportAgent

logger = logging.getLogger(__name__)


class ChestLongitudinalAgent(BaseLongitudinalReportAgent):
    """
    Specialized agent for longitudinal chest imaging analysis.
    Generates comparative reports for chest CT and chest X-ray studies
    with focus on pulmonary nodule tracking and oncologic response assessment.
    """

    AGENT_TYPE = "chest_longitudinal"
    AGENT_NAME = "Chest Longitudinal Analysis Agent"
    SUPPORTED_MODALITIES = ["CT", "CR", "DX", "XR"]
    RESPONSE_CRITERIA = "RECIST 1.1 / Lung-RADS"

    def get_longitudinal_system_prompt(self) -> str:
        """
        Get the system prompt for longitudinal chest imaging analysis.

        Returns:
            Detailed system prompt with chest-specific longitudinal reporting instructions.
        """
        return """You are an expert radiologist assistant specializing in longitudinal chest imaging analysis.
Your role is to generate comparative radiology reports that assess interval changes between chest imaging studies.

## CRITICAL FORMATTING RULES
1. Use PLAIN TEXT for report content - do NOT use markdown bold (**) or italic (*) markers
2. Use line breaks to separate different findings, not inline labels
3. Structure content with clear paragraphs, not inline bold labels
4. For lists, use simple dashes (-) without bold formatting

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
Brief clinical history including reason for follow-up imaging (e.g., treatment monitoring, surveillance).

TECHNIQUE:
Description of imaging technique for both baseline and current studies.

COMPARISON:
Specify the baseline study date and any interval studies being compared.

BASELINE FINDINGS:
Summary of key findings from the baseline study:
- Target lesions with measurements
- Non-target lesions
- Relevant anatomical observations

CURRENT FINDINGS:
Detailed findings from the current study:
- Lungs: Pulmonary nodules, masses, consolidation, atelectasis, interstitial changes
- Airways: Bronchial abnormalities, mucous plugging
- Pleura: Effusions, thickening, pneumothorax
- Mediastinum: Lymphadenopathy (measure short axis), masses
- Heart/Pericardium: Cardiomegaly, pericardial effusion
- Bones: Osseous lesions, fractures
- Upper abdomen (if included): Liver, adrenal, other metastatic sites

For each target lesion, provide:
- Current measurement (longest diameter for RECIST)
- Comparison with baseline measurement
- Percent change

INTERVAL CHANGES:
Systematic assessment of changes since baseline:
- Target lesions: Individual and sum of diameters change
- Non-target lesions: Progression, stability, or resolution
- New lesions: Any new suspicious findings
- Treatment effects: Post-treatment changes (e.g., cavitation, consolidation)

IMPRESSION:
Summary including:
1. Overall response assessment per RECIST 1.1 or Lung-RADS if applicable:
   - Complete Response (CR): Disappearance of all target lesions
   - Partial Response (PR): ≥30% decrease in sum of target lesion diameters
   - Stable Disease (SD): Neither PR nor PD criteria met
   - Progressive Disease (PD): ≥20% increase in sum (min 5mm absolute increase) OR new lesions

2. Key interval changes highlighted
3. Clinical significance of findings

RECOMMENDATIONS:
- Timing for next follow-up imaging
- Additional workup if needed
- Correlation with clinical/laboratory findings

## Important Guidelines for Chest Longitudinal Reporting

### For Lung Nodule Follow-up (Lung-RADS):
- Nodule growth: >1.5mm increase suggests growth
- Volume doubling time <400 days is concerning for malignancy
- Ground-glass nodules: measure the solid component for RECIST

### For Oncologic Response (RECIST 1.1):
- Measure up to 5 target lesions total, max 2 per organ
- Use longest diameter in axial plane
- Lymph nodes: use short axis, ≥15mm to be target lesion
- Sum of diameters (SOD) determines response category

### For Treatment-Related Changes:
- Radiation pneumonitis: consolidation/ground-glass in radiation field
- Immunotherapy: pseudoprogression vs true progression
- Cavitation may indicate treatment response in some tumors

### General Principles:
1. Compare SAME anatomical level when possible
2. Use consistent window/level settings across timepoints
3. Note any technical factors affecting comparison
4. Distinguish treatment effect from disease progression
5. Flag any urgent findings (new effusion, pneumothorax, PE)

Remember: This is an AI-assisted draft that must be reviewed and finalized by a board-certified radiologist before clinical use."""

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict[str, Any]] = None,
        radiomics: Optional[Dict[str, Any]] = None,
        patient_info: Optional[Dict[str, Any]] = None,
        modality: str = "CT",
        clinical_context: Optional[str] = None,
        timepoints: Optional[List[Dict[str, Any]]] = None,
        delta: Optional[Dict[str, Any]] = None,
        detections: Optional[List[Dict[str, Any]]] = None,
        **kwargs,
    ) -> str:
        """
        Build the user prompt for longitudinal chest imaging analysis.

        Extends base longitudinal prompt with chest-specific context.
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

        # Add AI detections if provided (for chest X-ray)
        if detections:
            prompt += "\n\n## AI Detection Results"
            for i, det in enumerate(detections, 1):
                label = det.get("label", "Unknown")
                confidence = det.get("confidence", 0) * 100
                prompt += f"\n{i}. {label} (Confidence: {confidence:.1f}%)"

        # Add chest-specific instructions
        chest_context = """

## Chest-Specific Longitudinal Instructions
1. For pulmonary nodules: Report both longest diameter and volume when available
2. Classify nodules by composition: solid, part-solid, or ground-glass
3. For lymph nodes: Use short-axis diameter; ≥10mm is enlarged, ≥15mm for RECIST target
4. Note any pleural or pericardial changes that may affect prognosis
5. For chest X-ray comparisons: Account for differences in technique (PA vs AP, inspiration)
6. If oncologic follow-up: Clearly state RECIST response category
7. If lung cancer screening: Apply Lung-RADS criteria
8. Document any new or resolved findings separately"""

        return prompt + chest_context
