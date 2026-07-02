# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Report generation endpoint for AI-powered radiology reports.
Uses LLM with vision capabilities to analyze imaging data and generate structured reports.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from monailabel.agents.breast_agent import get_agent
from monailabel.llm import LLMClient, LLMConfig

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/report",
    tags=["Report Generation"],
    responses={
        404: {"description": "Not found"},
        200: {"description": "OK", "content": {"application/json": {}}},
        500: {"description": "Internal server error"},
    },
)


class PatientInfo(BaseModel):
    """Patient information for report context."""

    patientId: Optional[str] = None
    patientName: Optional[str] = None
    studyDate: Optional[str] = None
    studyDescription: Optional[str] = None


class Detection(BaseModel):
    """AI detection result (bounding box)."""

    label: str
    confidence: float
    x_min: Optional[float] = None
    y_min: Optional[float] = None
    x_max: Optional[float] = None
    y_max: Optional[float] = None


class TimepointMetrics(BaseModel):
    """Metrics for a single timepoint."""

    volumeCc: Optional[float] = None
    maxDiameterMm: Optional[float] = None
    lesionCount: Optional[int] = None


class LongitudinalTimepoint(BaseModel):
    """Data for a single timepoint in longitudinal comparison."""

    id: str
    label: str  # e.g., "Baseline", "6-month Follow-up"
    studyDate: str
    imageBase64: str  # Base64 PNG of this timepoint's image
    detections: Optional[list[Detection]] = None
    metrics: Optional[TimepointMetrics] = None
    notes: Optional[str] = None


class LongitudinalSegmentDelta(BaseModel):
    """Per-segment delta calculations."""

    segmentLabel: str
    baselineVolumeCm3: float
    currentVolumeCm3: float
    absoluteChangeCm3: float
    percentChange: float
    classification: str  # complete_response, partial_response, stable_disease, progressive_disease
    baselineDiameterMm: Optional[float] = None
    currentDiameterMm: Optional[float] = None
    diameterChangePercent: Optional[float] = None


class LongitudinalDeltaSummary(BaseModel):
    """Summary of longitudinal changes."""

    totalVolumeChangePercent: float
    classification: str
    sumOfDiametersChange: Optional[float] = None
    newLesionCount: Optional[int] = None
    resolvedLesionCount: Optional[int] = None


class LongitudinalDelta(BaseModel):
    """Delta calculations between timepoints."""

    baselineTimepointId: str
    currentTimepointId: str
    segments: list[LongitudinalSegmentDelta] = []
    summary: LongitudinalDeltaSummary


class LongitudinalPayload(BaseModel):
    """Longitudinal session data for comparative reporting."""

    sessionId: str
    timepoints: list[LongitudinalTimepoint]
    delta: Optional[LongitudinalDelta] = None


class ReportGenerationRequest(BaseModel):
    """Request body for report generation."""

    mosaic_image: str  # Base64 PNG data URL (or comparison image for longitudinal)
    volumetrics: Optional[Dict[str, Any]] = None
    radiomics: Optional[Dict[str, Any]] = None
    findings: str
    modality: str = "Unknown"
    agent_type: str = "breast"
    patient_info: Optional[PatientInfo] = None
    # CheXagent specific fields
    clinical_context: Optional[str] = None  # Patient history, indication
    detections: Optional[list[Detection]] = None  # AI bounding box detections
    # Longitudinal session data (NEW)
    longitudinal: Optional[LongitudinalPayload] = None


class ReportSections(BaseModel):
    """Generated report sections."""

    clinicalHistory: str = ""
    technique: str = ""
    comparison: str = ""
    findings: str = ""
    impression: str = ""
    recommendations: str = ""


class GeneratedReport(BaseModel):
    """Complete generated report."""

    id: str
    generatedAt: str
    agentType: str
    sections: ReportSections
    rawResponse: Optional[str] = None


class ReportGenerationResponse(BaseModel):
    """Response for report generation."""

    success: bool
    report: Optional[GeneratedReport] = None
    error: Optional[str] = None


# Initialize LLM client (singleton)
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Get or create the LLM client singleton."""
    global _llm_client
    if _llm_client is None:
        config = LLMConfig.from_env()
        _llm_client = LLMClient(config)
    return _llm_client


def _select_longitudinal_agent(request: ReportGenerationRequest) -> str:
    """
    Auto-select appropriate longitudinal agent based on modality.

    Args:
        request: The report generation request

    Returns:
        Agent type string for longitudinal reporting
    """
    modality = request.modality.upper()

    # Chest modalities
    if modality in ["CT", "CR", "DX", "XR"]:
        # Check if it's chest-specific based on context or explicit agent type
        if "chest" in request.agent_type.lower():
            return "chest_longitudinal"
        # Default CT to chest for now (could be enhanced with body part detection)
        if modality in ["CR", "DX", "XR"]:
            return "chest_longitudinal"

    # Breast modalities
    if modality in ["MR", "MG", "US"]:
        if "breast" in request.agent_type.lower() or modality == "MG":
            return "breast_longitudinal"

    # Abdomen - CT or MR with abdomen context
    if "abdomen" in request.agent_type.lower() or "liver" in request.agent_type.lower():
        return "abdomen_longitudinal"

    # Default to chest longitudinal for CT
    if modality == "CT":
        return "abdomen_longitudinal"

    # Fallback to chest longitudinal as most general
    return "chest_longitudinal"


@router.post("/generate", response_model=ReportGenerationResponse)
async def generate_report(request: ReportGenerationRequest) -> ReportGenerationResponse:
    """
    Generate an AI-powered radiology report.

    Args:
        request: Report generation request containing:
            - mosaic_image: Base64 PNG of viewport mosaic
            - volumetrics: Optional volumetric measurements
            - radiomics: Optional radiomics features
            - findings: Radiologist's initial findings
            - modality: Imaging modality (e.g., MR, CT)
            - agent_type: Type of analysis agent (e.g., breast, lung)
            - patient_info: Optional patient information
            - longitudinal: Optional longitudinal session data for comparative reporting

    Returns:
        Generated report with structured sections
    """
    try:
        # Determine if this is a longitudinal report
        is_longitudinal = (
            request.longitudinal is not None
            and len(request.longitudinal.timepoints) >= 2
        )

        # Select agent type - auto-select longitudinal agent if longitudinal data present
        agent_type = request.agent_type
        if is_longitudinal:
            agent_type = _select_longitudinal_agent(request)
            logger.info(f"Longitudinal report requested, using agent: {agent_type}")
        else:
            logger.info(f"Generating report with agent type: {agent_type}")

        # Get the appropriate agent
        agent = get_agent(agent_type)

        # Get LLM client
        llm = get_llm_client()

        # Build prompts
        system_prompt = agent.get_system_prompt()

        patient_info_dict = None
        if request.patient_info:
            patient_info_dict = {
                "patientId": request.patient_info.patientId,
                "patientName": request.patient_info.patientName,
                "studyDate": request.patient_info.studyDate,
                "studyDescription": request.patient_info.studyDescription,
            }

        # Build prompt args - check if agent supports extended parameters
        prompt_kwargs = {
            "findings": request.findings,
            "volumetrics": request.volumetrics,
            "radiomics": request.radiomics,
            "patient_info": patient_info_dict,
            "modality": request.modality,
        }

        # Add CheXagent specific fields if provided
        if request.clinical_context:
            prompt_kwargs["clinical_context"] = request.clinical_context

        if request.detections:
            prompt_kwargs["detections"] = [det.model_dump() for det in request.detections]

        # Add longitudinal data if present
        if is_longitudinal:
            prompt_kwargs["timepoints"] = [
                {
                    "id": tp.id,
                    "label": tp.label,
                    "studyDate": tp.studyDate,
                    "metrics": tp.metrics.model_dump() if tp.metrics else None,
                    "detections": [d.model_dump() for d in tp.detections] if tp.detections else None,
                    "notes": tp.notes,
                }
                for tp in request.longitudinal.timepoints
            ]

            if request.longitudinal.delta:
                prompt_kwargs["delta"] = {
                    "baselineTimepointId": request.longitudinal.delta.baselineTimepointId,
                    "currentTimepointId": request.longitudinal.delta.currentTimepointId,
                    "segments": [seg.model_dump() for seg in request.longitudinal.delta.segments],
                    "summary": request.longitudinal.delta.summary.model_dump(),
                }

        user_prompt = agent.build_user_prompt(**prompt_kwargs)

        # For longitudinal reports, we may have multiple images
        # Use the mosaic_image which should be a comparison view
        image_base64 = request.mosaic_image

        # Generate report
        result = llm.generate_report(
            system_prompt=system_prompt,
            user_message=user_prompt,
            image_base64=image_base64,
        )

        # Parse result into report structure
        sections = result.get("sections", {})
        report = GeneratedReport(
            id=str(uuid.uuid4()),
            generatedAt=datetime.utcnow().isoformat() + "Z",
            agentType=agent_type,
            sections=ReportSections(
                clinicalHistory=sections.get("clinicalHistory", ""),
                technique=sections.get("technique", ""),
                comparison=sections.get("comparison", ""),
                findings=sections.get("findings", ""),
                impression=sections.get("impression", ""),
                recommendations=sections.get("recommendations", ""),
            ),
            rawResponse=result.get("rawResponse"),
        )

        logger.info(f"Report generated successfully: {report.id}")

        return ReportGenerationResponse(success=True, report=report)

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return ReportGenerationResponse(success=False, error=str(e))

    except Exception as e:
        logger.exception("Report generation failed")
        return ReportGenerationResponse(
            success=False, error=f"Report generation failed: {str(e)}"
        )


@router.get("/agents")
async def list_agents():
    """
    List available report generation agents.

    Returns:
        List of available agents with their metadata
    """
    return {
        "agents": [
            # Single-study agents
            {
                "type": "breast",
                "name": "Breast Analysis Agent",
                "description": "Specialized for breast MRI/mammography with BI-RADS formatting",
                "supported_modalities": ["MR", "MG", "US"],
                "longitudinal": False,
            },
            {
                "type": "chestxray",
                "name": "Chest X-Ray Analysis Agent",
                "description": "Specialized for chest X-ray with CheXagent AI detection integration",
                "supported_modalities": ["CR", "DX", "XR"],
                "longitudinal": False,
            },
            {
                "type": "medgemma",
                "name": "MedGemma Chest X-Ray Agent",
                "description": "AI-powered chest X-ray analysis with MedGemma detection",
                "supported_modalities": ["CR", "DX", "XR"],
                "longitudinal": False,
            },
            {
                "type": "general",
                "name": "General Radiology Agent",
                "description": "General purpose radiology report generation",
                "supported_modalities": ["CT", "MR", "XR", "US", "NM", "PT"],
                "longitudinal": False,
            },
            # Longitudinal agents
            {
                "type": "chest_longitudinal",
                "name": "Chest Longitudinal Agent",
                "description": "Comparative chest imaging analysis with RECIST/Lung-RADS response assessment",
                "supported_modalities": ["CT", "CR", "DX", "XR"],
                "longitudinal": True,
                "response_criteria": ["RECIST 1.1", "Lung-RADS"],
            },
            {
                "type": "breast_longitudinal",
                "name": "Breast Longitudinal Agent",
                "description": "Treatment response assessment for breast imaging with BI-RADS",
                "supported_modalities": ["MR", "MG", "US"],
                "longitudinal": True,
                "response_criteria": ["BI-RADS", "RECIST"],
            },
            {
                "type": "abdomen_longitudinal",
                "name": "Abdomen Longitudinal Agent",
                "description": "Abdominal oncologic response assessment with RECIST/mRECIST/LI-RADS",
                "supported_modalities": ["CT", "MR"],
                "longitudinal": True,
                "response_criteria": ["RECIST 1.1", "mRECIST", "LI-RADS"],
            },
        ]
    }


@router.get("/health")
async def check_llm_health():
    """
    Check if the LLM service is configured and reachable.

    Returns:
        Health status of the LLM connection
    """
    try:
        llm = get_llm_client()

        if not llm.config.api_key:
            return {
                "status": "not_configured",
                "message": "LLM API key not configured. Set GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY environment variable.",
                "supported_providers": ["gemini", "openai"],
                "recommended": "gemini (free tier available)",
            }

        # Try to validate connection
        is_valid = llm.validate_connection()

        if is_valid:
            return {
                "status": "healthy",
                "provider": llm.config.provider,
                "model": llm.config.model,
            }
        else:
            return {
                "status": "unhealthy",
                "message": f"Failed to connect to {llm.config.provider} API",
                "provider": llm.config.provider,
                "model": llm.config.model,
            }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
        }
