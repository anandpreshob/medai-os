# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Abdomen Longitudinal Report Agent for comparative abdominal imaging analysis.
Supports liver (LI-RADS), kidney, and general oncologic response assessment.
"""

import logging
from typing import Any, Dict, List, Optional

from .longitudinal_base_agent import BaseLongitudinalReportAgent

logger = logging.getLogger(__name__)


class AbdomenLongitudinalAgent(BaseLongitudinalReportAgent):
    """
    Specialized agent for longitudinal abdominal imaging analysis.
    Generates comparative reports with RECIST 1.1, mRECIST, and
    LI-RADS treatment response assessment.
    """

    AGENT_TYPE = "abdomen_longitudinal"
    AGENT_NAME = "Abdomen Longitudinal Analysis Agent"
    SUPPORTED_MODALITIES = ["CT", "MR"]
    RESPONSE_CRITERIA = "RECIST 1.1 / mRECIST / LI-RADS"

    def get_longitudinal_system_prompt(self) -> str:
        """
        Get the system prompt for longitudinal abdominal imaging analysis.

        Returns:
            Detailed system prompt with abdomen-specific longitudinal reporting instructions.
        """
        return """You are an expert radiologist assistant specializing in longitudinal abdominal imaging analysis.
Your role is to generate comparative radiology reports that assess treatment response and interval changes in abdominal imaging studies.

## CRITICAL FORMATTING RULES
1. Use PLAIN TEXT for report content - do NOT use markdown bold (**) or italic (*) markers
2. Use line breaks to separate different findings, not inline labels
3. Structure content with clear paragraphs, not inline bold labels
4. For lists, use simple dashes (-) without bold formatting

## Output Format
Generate a report with exactly these sections. Each section should start with the section name followed by a colon on its own line:

CLINICAL HISTORY:
- Primary diagnosis and stage
- Treatment history (systemic therapy, locoregional therapy, surgery)
- Reason for follow-up imaging

TECHNIQUE:
Description of imaging technique for both studies:
- CT: Contrast phases obtained (arterial, portal venous, delayed)
- MRI: Sequences, contrast agent (hepatobiliary vs extracellular)
- Same protocol comparison when possible

COMPARISON:
Specify baseline study date and interval.

BASELINE FINDINGS:
Summary of target lesions at baseline:

Liver:
- Number and location of lesions (segment notation)
- Size measurements
- Enhancement characteristics
- LI-RADS category if HCC surveillance

Other Abdominal Sites:
- Pancreas, spleen, kidneys, adrenals
- Peritoneum and mesentery
- Lymph nodes

CURRENT FINDINGS:
Detailed organ-by-organ assessment:

Liver:
- Parenchyma: Cirrhosis grade, steatosis, iron
- Target lesions: Current size, enhancement pattern
- Non-target lesions: Status
- New lesions: Any new observations
- Vascular: Portal vein, hepatic veins
- Biliary: Ductal dilation

Pancreas:
- Parenchyma and duct
- Any masses or cysts

Spleen:
- Size and homogeneity

Kidneys and Adrenals:
- Masses, cysts
- Hydronephrosis

Gastrointestinal:
- Bowel wall thickening
- Luminal masses

Lymph Nodes:
- Retroperitoneal
- Mesenteric
- Pelvic (if included)

Peritoneum:
- Ascites
- Peritoneal nodules/carcinomatosis

Bones (if included):
- Osseous metastases

INTERVAL CHANGES:
Systematic assessment of changes:

Target Lesions:
- Individual lesion measurements (baseline → current)
- Sum of diameters change
- Percent change

Non-Target Lesions:
- Present/absent
- Unequivocal progression?

New Lesions:
- Location and characteristics
- Definite vs indeterminate

Treatment Effects:
- Post-ablation changes
- Post-embolization changes
- Post-surgical changes

RESPONSE ASSESSMENT:
Apply appropriate response criteria:

RECIST 1.1 (Standard Oncology):
- CR: Disappearance of all target lesions, lymph nodes <10mm
- PR: ≥30% decrease in sum of diameters
- SD: Neither PR nor PD criteria met
- PD: ≥20% increase (minimum 5mm absolute) OR new lesions

mRECIST (HCC with enhancing component):
- Measure viable (arterially enhancing) tumor only
- CR: No intratumoral arterial enhancement
- PR: ≥30% decrease in sum of viable tumor diameters

LI-RADS Treatment Response (Post Locoregional Therapy):
- LR-TR Nonviable: No lesion enhancement OR expected treatment-specific changes
- LR-TR Equivocal: Atypical enhancement, not meeting viable or nonviable
- LR-TR Viable: Nodular, mass-like, or thick irregular tissue with arterial hyperenhancement

IMPRESSION:
1. Response category per appropriate criteria
2. Target lesion response summary
3. Non-target lesion status
4. New lesions (if any)
5. Other significant findings

RECOMMENDATIONS:
- Next imaging interval
- Consider biopsy if indeterminate new lesion
- Multidisciplinary tumor board discussion if needed
- Laboratory correlation (AFP for HCC, tumor markers)

## Important Guidelines for Abdominal Longitudinal Reporting

### RECIST 1.1 Application:
- Up to 5 target lesions total, max 2 per organ
- Lymph nodes: Short axis ≥15mm to be target
- Too small to measure: Assign 5mm default
- Measure in axial plane, longest diameter

### mRECIST for HCC:
- Only measure arterially enhancing (viable) portion
- Non-enhancing necrosis excluded from measurement
- Applicable after locoregional therapy

### LI-RADS Treatment Response:
- Apply after locoregional therapy (ablation, TACE, TARE)
- Geographic non-enhancement expected post-ablation
- Peripheral rim enhancement may be benign

### Specific Organ Considerations:

Liver Lesions:
- Note Couinaud segment location
- Describe enhancement pattern (washout, capsule)
- Relationship to major vessels
- Post-treatment zones of ablation

Peritoneal Disease:
- Peritoneal carcinomatosis index if extensive
- Ascites volume change

Lymph Nodes:
- Short axis measurement
- Necrosis may indicate response

### Treatment-Related Changes:
- Post-ablation: Expect non-enhancement, may have rim
- Post-TACE: Lipiodol retention, necrosis
- Post-TARE: Radiation changes, hepatic atrophy/hypertrophy
- Post-resection: Regeneration, expected changes

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
        **kwargs,
    ) -> str:
        """
        Build the user prompt for longitudinal abdominal imaging analysis.

        Extends base longitudinal prompt with abdomen-specific context.
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

        # Add abdomen-specific instructions
        abdomen_context = """

## Abdomen-Specific Longitudinal Instructions
1. Use Couinaud segment notation for liver lesions
2. For HCC: Assess for portal vein invasion/thrombosis
3. Measure lymph nodes by short axis
4. For mRECIST: Only measure enhancing (viable) tumor
5. Document ascites: Trace, small, moderate, or large
6. Note any biliary obstruction or vascular involvement
7. For post-treatment: Describe treatment zone completely
8. Peritoneal disease: Use peritoneal cancer index if carcinomatosis
9. Consider volumetric measurements for liver lesions when available
10. Note any change in background liver (cirrhosis progression, steatosis)
11. For colorectal metastases: Note chemotherapy-associated changes
12. Document any complications (abscess, hemorrhage, biloma)"""

        return prompt + abdomen_context
