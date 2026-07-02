# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
LangGraph Agentic Workflow for Chest X-Ray Report Generation.

Multi-step workflow using LangGraph for structured report generation:
1. Integrate Inputs - Combine detections, findings, and clinical context
2. Structure Findings - Organize findings by anatomical region
3. Draft Report - Generate initial report draft
4. Validate & Finalize - Review and finalize the report

This workflow ensures consistent, high-quality reports by breaking down
the generation into discrete, reviewable steps.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import StateGraph, END

logger = logging.getLogger(__name__)


# =====================
# State Definitions
# =====================

class ChestXrayWorkflowState(TypedDict):
    """State for the chest X-ray report workflow."""
    # Input data
    image_base64: str
    detections: List[Dict[str, Any]]
    radiologist_findings: str
    clinical_context: Optional[str]
    patient_info: Optional[Dict[str, Any]]
    modality: str

    # Intermediate states
    integrated_findings: str
    structured_findings: Dict[str, str]
    draft_report: Dict[str, str]

    # Output
    final_report: Dict[str, str]
    report_id: str
    generated_at: str

    # Workflow metadata
    current_step: str
    errors: List[str]


# =====================
# Workflow Nodes
# =====================

def integrate_inputs(state: ChestXrayWorkflowState) -> ChestXrayWorkflowState:
    """
    Node 1: Integrate all input sources into a unified findings summary.

    Combines:
    - MedGemma AI detections
    - Radiologist observations
    - Clinical context/history
    """
    logger.info("Workflow Step 1: Integrating inputs")

    try:
        lines = []

        # Clinical context
        if state.get("clinical_context"):
            lines.append("## Clinical Context")
            lines.append(state["clinical_context"])
            lines.append("")

        # AI Detections from MedGemma
        detections = state.get("detections", [])
        if detections:
            lines.append("## AI-Detected Findings (MedGemma)")

            # Group by confidence level
            high_conf = [d for d in detections if d.get("confidence", 0) >= 0.8]
            med_conf = [d for d in detections if 0.5 <= d.get("confidence", 0) < 0.8]
            low_conf = [d for d in detections if d.get("confidence", 0) < 0.5]

            if high_conf:
                lines.append("\nHigh Confidence Findings (>80%):")
                for det in high_conf:
                    conf = det.get("confidence", 0) * 100
                    lines.append(f"  - {det['label']}: {conf:.0f}% confidence")

            if med_conf:
                lines.append("\nModerate Confidence Findings (50-80%):")
                for det in med_conf:
                    conf = det.get("confidence", 0) * 100
                    lines.append(f"  - {det['label']}: {conf:.0f}% confidence")

            if low_conf:
                lines.append("\nLow Confidence Findings (<50%, needs verification):")
                for det in low_conf:
                    conf = det.get("confidence", 0) * 100
                    lines.append(f"  - {det['label']}: {conf:.0f}% confidence")

            lines.append("")

        # Radiologist observations
        findings = state.get("radiologist_findings", "")
        if findings:
            lines.append("## Radiologist Observations")
            lines.append(findings)
            lines.append("")

        integrated = "\n".join(lines)

        return {
            **state,
            "integrated_findings": integrated,
            "current_step": "integrate_inputs_complete",
        }

    except Exception as e:
        logger.error(f"Error in integrate_inputs: {e}")
        errors = state.get("errors", [])
        errors.append(f"Integration error: {str(e)}")
        return {
            **state,
            "errors": errors,
            "current_step": "integrate_inputs_error",
        }


def structure_findings(state: ChestXrayWorkflowState) -> ChestXrayWorkflowState:
    """
    Node 2: Structure findings by anatomical region.

    Organizes findings into standard chest X-ray regions:
    - Lungs
    - Heart/Cardiac
    - Mediastinum
    - Pleura
    - Bones
    - Soft tissues
    - Lines/tubes
    """
    logger.info("Workflow Step 2: Structuring findings by region")

    try:
        detections = state.get("detections", [])
        radiologist_findings = state.get("radiologist_findings", "").lower()

        # Initialize regional findings
        structured = {
            "lungs": [],
            "heart": [],
            "mediastinum": [],
            "pleura": [],
            "bones": [],
            "soft_tissues": [],
            "lines_tubes": [],
            "other": [],
        }

        # Map detection labels to anatomical regions
        label_to_region = {
            "cardiomegaly": "heart",
            "enlarged heart": "heart",
            "cardiac enlargement": "heart",
            "pneumonia": "lungs",
            "consolidation": "lungs",
            "infiltrate": "lungs",
            "atelectasis": "lungs",
            "nodule": "lungs",
            "mass": "lungs",
            "opacity": "lungs",
            "pleural effusion": "pleura",
            "effusion": "pleura",
            "pneumothorax": "pleura",
            "edema": "lungs",
            "pulmonary edema": "lungs",
            "fracture": "bones",
            "rib fracture": "bones",
            "mediastinal widening": "mediastinum",
            "lymphadenopathy": "mediastinum",
        }

        # Categorize AI detections
        for det in detections:
            label = det.get("label", "").lower()
            region = "other"

            for pattern, reg in label_to_region.items():
                if pattern in label:
                    region = reg
                    break

            conf = det.get("confidence", 0) * 100
            structured[region].append(f"{det.get('label', 'Unknown')}: {conf:.0f}% confidence")

        # Create structured findings summary
        findings_dict = {}
        for region, items in structured.items():
            if items:
                findings_dict[region] = "\n".join(f"- {item}" for item in items)
            else:
                findings_dict[region] = "No abnormalities detected"

        return {
            **state,
            "structured_findings": findings_dict,
            "current_step": "structure_findings_complete",
        }

    except Exception as e:
        logger.error(f"Error in structure_findings: {e}")
        errors = state.get("errors", [])
        errors.append(f"Structuring error: {str(e)}")
        return {
            **state,
            "errors": errors,
            "current_step": "structure_findings_error",
        }


def generate_draft(state: ChestXrayWorkflowState) -> ChestXrayWorkflowState:
    """
    Node 3: Generate the initial report draft.

    Creates structured report sections based on integrated and structured findings.
    """
    logger.info("Workflow Step 3: Generating draft report")

    try:
        patient_info = state.get("patient_info", {})
        clinical_context = state.get("clinical_context", "")
        structured = state.get("structured_findings", {})
        detections = state.get("detections", [])
        radiologist_findings = state.get("radiologist_findings", "")
        modality = state.get("modality", "CR")

        # Determine technique description
        modality_tech = {
            "CR": "PA and lateral views obtained using computed radiography.",
            "DX": "PA and lateral views obtained using digital radiography.",
            "XR": "Standard PA chest radiograph obtained.",
        }
        technique = modality_tech.get(modality.upper(), "Chest radiograph obtained.")

        # Build clinical history
        clinical_history = clinical_context if clinical_context else "Clinical history not provided."

        # Build findings section
        findings_parts = []

        # Lungs
        lungs_findings = structured.get("lungs", "")
        if lungs_findings and lungs_findings != "No abnormalities detected":
            findings_parts.append(f"Lungs:\n{lungs_findings}")
        else:
            findings_parts.append("Lungs: Clear. No focal consolidation, masses, or nodules identified.")

        # Heart
        heart_findings = structured.get("heart", "")
        if heart_findings and heart_findings != "No abnormalities detected":
            findings_parts.append(f"\nHeart:\n{heart_findings}")
        else:
            findings_parts.append("\nHeart: Normal cardiac silhouette. No cardiomegaly.")

        # Mediastinum
        mediastinum_findings = structured.get("mediastinum", "")
        if mediastinum_findings and mediastinum_findings != "No abnormalities detected":
            findings_parts.append(f"\nMediastinum:\n{mediastinum_findings}")
        else:
            findings_parts.append("\nMediastinum: Normal mediastinal contour. No widening or lymphadenopathy.")

        # Pleura
        pleura_findings = structured.get("pleura", "")
        if pleura_findings and pleura_findings != "No abnormalities detected":
            findings_parts.append(f"\nPleura:\n{pleura_findings}")
        else:
            findings_parts.append("\nPleura: No pleural effusion or pneumothorax.")

        # Bones
        bones_findings = structured.get("bones", "")
        if bones_findings and bones_findings != "No abnormalities detected":
            findings_parts.append(f"\nBones:\n{bones_findings}")
        else:
            findings_parts.append("\nBones: No acute osseous abnormality identified.")

        # Add radiologist observations if different from AI
        if radiologist_findings:
            findings_parts.append(f"\nRadiologist observations:\n{radiologist_findings}")

        findings_text = "\n".join(findings_parts)

        # Build impression
        high_conf_detections = [d for d in detections if d.get("confidence", 0) >= 0.5]
        if high_conf_detections:
            impression_items = [f"- {d['label']}" for d in high_conf_detections]
            impression = "Abnormalities identified:\n" + "\n".join(impression_items)
            impression += "\n\nClinical correlation recommended."
        else:
            impression = "No significant acute cardiopulmonary abnormality identified."

        # Build recommendations
        urgent_findings = [d for d in detections if d.get("label", "").lower() in ["pneumothorax", "large effusion"]]
        if urgent_findings:
            recommendations = "URGENT: Immediate clinical correlation recommended for the above findings."
        elif high_conf_detections:
            recommendations = "Follow-up as clinically indicated. Correlate with clinical symptoms."
        else:
            recommendations = "No specific follow-up imaging recommended. Routine clinical follow-up."

        # Assemble draft
        draft = {
            "clinicalHistory": clinical_history,
            "technique": technique,
            "comparison": "None available.",
            "findings": findings_text,
            "impression": impression,
            "recommendations": recommendations,
        }

        return {
            **state,
            "draft_report": draft,
            "current_step": "generate_draft_complete",
        }

    except Exception as e:
        logger.error(f"Error in generate_draft: {e}")
        errors = state.get("errors", [])
        errors.append(f"Draft generation error: {str(e)}")
        return {
            **state,
            "errors": errors,
            "current_step": "generate_draft_error",
        }


def finalize_report(state: ChestXrayWorkflowState) -> ChestXrayWorkflowState:
    """
    Node 4: Finalize the report.

    Validates the draft and prepares final output with metadata.
    """
    logger.info("Workflow Step 4: Finalizing report")

    try:
        draft = state.get("draft_report", {})

        # Add AI disclosure
        disclaimer = (
            "\n\n---\n"
            "This report was generated with AI assistance (MedGemma) and must be reviewed "
            "and finalized by a board-certified radiologist before clinical use."
        )

        # Finalize sections
        final = {
            "clinicalHistory": draft.get("clinicalHistory", ""),
            "technique": draft.get("technique", ""),
            "comparison": draft.get("comparison", ""),
            "findings": draft.get("findings", "") + disclaimer,
            "impression": draft.get("impression", ""),
            "recommendations": draft.get("recommendations", ""),
        }

        return {
            **state,
            "final_report": final,
            "report_id": str(uuid.uuid4()),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "current_step": "finalize_complete",
        }

    except Exception as e:
        logger.error(f"Error in finalize_report: {e}")
        errors = state.get("errors", [])
        errors.append(f"Finalization error: {str(e)}")
        return {
            **state,
            "errors": errors,
            "current_step": "finalize_error",
        }


# =====================
# Workflow Graph
# =====================

def create_chestxray_workflow():
    """
    Create and compile the chest X-ray report generation workflow.

    Workflow:
    integrate_inputs -> structure_findings -> generate_draft -> finalize_report -> END
    """
    workflow = StateGraph(ChestXrayWorkflowState)

    # Add nodes
    workflow.add_node("integrate_inputs", integrate_inputs)
    workflow.add_node("structure_findings", structure_findings)
    workflow.add_node("generate_draft", generate_draft)
    workflow.add_node("finalize_report", finalize_report)

    # Define edges (linear workflow)
    workflow.set_entry_point("integrate_inputs")
    workflow.add_edge("integrate_inputs", "structure_findings")
    workflow.add_edge("structure_findings", "generate_draft")
    workflow.add_edge("generate_draft", "finalize_report")
    workflow.add_edge("finalize_report", END)

    return workflow.compile()


# =====================
# Workflow Execution
# =====================

async def run_chestxray_workflow(
    image_base64: str,
    detections: List[Dict[str, Any]],
    radiologist_findings: str,
    clinical_context: Optional[str] = None,
    patient_info: Optional[Dict[str, Any]] = None,
    modality: str = "CR",
) -> Dict[str, Any]:
    """
    Execute the chest X-ray report generation workflow.

    Args:
        image_base64: Base64-encoded chest X-ray image
        detections: List of MedGemma detections
        radiologist_findings: Radiologist's observations
        clinical_context: Clinical history/indication
        patient_info: Patient metadata
        modality: Imaging modality (CR, DX, XR)

    Returns:
        Dictionary containing the generated report and metadata
    """
    logger.info("Starting chest X-ray report workflow")

    # Initialize state
    initial_state: ChestXrayWorkflowState = {
        "image_base64": image_base64,
        "detections": detections or [],
        "radiologist_findings": radiologist_findings or "",
        "clinical_context": clinical_context,
        "patient_info": patient_info,
        "modality": modality,
        "integrated_findings": "",
        "structured_findings": {},
        "draft_report": {},
        "final_report": {},
        "report_id": "",
        "generated_at": "",
        "current_step": "initialized",
        "errors": [],
    }

    # Create and run workflow
    workflow = create_chestxray_workflow()
    final_state = workflow.invoke(initial_state)

    # Check for errors
    if final_state.get("errors"):
        logger.warning(f"Workflow completed with errors: {final_state['errors']}")

    # Return result
    return {
        "success": len(final_state.get("errors", [])) == 0,
        "report": {
            "id": final_state.get("report_id", ""),
            "generatedAt": final_state.get("generated_at", ""),
            "agentType": "medgemma-workflow",
            "sections": final_state.get("final_report", {}),
        },
        "errors": final_state.get("errors", []),
        "workflow_steps": final_state.get("current_step", ""),
    }
