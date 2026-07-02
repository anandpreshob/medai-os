# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Triage endpoint for AI-powered radiologist worklist prioritization.

Provides REST API for triaging radiology studies using a hybrid
rules-based + LLM approach.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from monailabel.agents.triaging_agent import TriagingAgent
from monailabel.services.detection_retrieval import get_study_detections

logger = logging.getLogger(__name__)

# X-ray modalities that support AI detection
XRAY_MODALITIES = {"CR", "DX", "XR"}

router = APIRouter(
    prefix="/triage",
    tags=["Triage"],
    responses={
        200: {"description": "OK"},
        400: {"description": "Bad request"},
        500: {"description": "Internal server error"},
    },
)


# Request/Response Models
class DetectionFinding(BaseModel):
    """AI detection finding for a study."""
    label: str = Field(..., description="Abnormality label (e.g., 'Cardiomegaly', 'Pneumothorax')")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score 0-1")
    x_min: Optional[float] = Field(None, description="Bounding box x_min (normalized)")
    y_min: Optional[float] = Field(None, description="Bounding box y_min (normalized)")
    x_max: Optional[float] = Field(None, description="Bounding box x_max (normalized)")
    y_max: Optional[float] = Field(None, description="Bounding box y_max (normalized)")


class StudyInput(BaseModel):
    """Input study for triaging."""
    studyUID: str = Field(..., description="DICOM Study Instance UID")
    patientName: Optional[str] = Field(None, description="Patient name")
    patientID: Optional[str] = Field(None, description="Patient ID / MRN")
    studyDate: Optional[str] = Field(None, description="Study date (YYYYMMDD)")
    modality: Optional[str] = Field(None, description="Imaging modality (CT, MR, CR, etc.)")
    studyDescription: Optional[str] = Field(None, description="Study description")
    # Clinical context fields
    reasonForVisit: Optional[str] = Field(None, description="Clinical reason/indication for study")
    urgencyFlag: Optional[str] = Field(None, description="Explicit urgency flag (STAT, URGENT, ROUTINE)")
    patientHistory: Optional[str] = Field(None, description="Relevant patient history")
    symptoms: Optional[str] = Field(None, description="Current symptoms")
    patientLocation: Optional[str] = Field(None, description="Patient location (ED, ICU, Floor, Outpatient)")
    # AI detection findings (optional - can be auto-fetched from Orthanc)
    detections: Optional[List[DetectionFinding]] = Field(
        None,
        description="AI detection findings for this study (auto-fetched from Orthanc if not provided)"
    )


class TriageRequest(BaseModel):
    """Request body for study triaging."""
    studies: List[StudyInput] = Field(..., description="List of studies to triage")
    useLLM: bool = Field(
        True,
        description="If true, use LLM for fine-tuning priority order"
    )
    autoFetchDetections: bool = Field(
        True,
        description="If true, auto-fetch AI detections from Orthanc for X-ray studies without provided detections"
    )


class TriagedStudyOutput(BaseModel):
    """Output for a single triaged study."""
    studyUID: str
    patientName: Optional[str] = None
    patientID: Optional[str] = None
    modality: Optional[str] = None
    studyDescription: Optional[str] = None
    studyDate: Optional[str] = None
    priorityRank: int = Field(..., description="Overall priority rank (1 = highest)")
    triageLevel: str = Field(..., description="Triage level: STAT, URGENT, SEMI_URGENT, ROUTINE")
    priorityScore: float = Field(..., description="Priority score (0-100)")
    rationale: str = Field(..., description="Explanation for the priority assignment")
    keyFactors: List[str] = Field(default_factory=list, description="Key factors influencing priority")
    rulesApplied: List[str] = Field(default_factory=list, description="Rules that were applied")
    # Clinical context (passed through for display)
    reasonForVisit: Optional[str] = None
    patientHistory: Optional[str] = None
    symptoms: Optional[str] = None
    patientLocation: Optional[str] = None


class TriageResponse(BaseModel):
    """Response from triaging endpoint."""
    success: bool
    triagedStudies: List[TriagedStudyOutput]
    totalProcessed: int
    statCount: int
    urgentCount: int
    semiUrgentCount: int
    routineCount: int
    error: Optional[str] = None


# Singleton agent instance
_triage_agent: Optional[TriagingAgent] = None


def get_triage_agent(use_llm: bool = True) -> TriagingAgent:
    """Get or create the triage agent singleton."""
    global _triage_agent
    if _triage_agent is None or _triage_agent.use_llm != use_llm:
        _triage_agent = TriagingAgent(use_llm=use_llm)
    return _triage_agent


@router.post("/prioritize", response_model=TriageResponse)
async def prioritize_studies(request: TriageRequest) -> TriageResponse:
    """
    Prioritize a batch of radiology studies for radiologist review.

    This endpoint uses a hybrid approach:
    1. Rules-based classification for STAT/URGENT cases (deterministic)
    2. AI detection analysis for X-ray studies with pre-computed findings
    3. LLM-based refinement for ordering within priority tiers

    Args:
        request: TriageRequest containing:
            - studies: List of studies with clinical context
            - useLLM: Enable LLM-based ordering refinement
            - autoFetchDetections: Auto-fetch AI detections from Orthanc

    Returns:
        TriageResponse with prioritized studies and summary statistics
    """
    try:
        if not request.studies:
            return TriageResponse(
                success=False,
                triagedStudies=[],
                totalProcessed=0,
                statCount=0,
                urgentCount=0,
                semiUrgentCount=0,
                routineCount=0,
                error="No studies provided"
            )

        logger.info(
            f"Triaging {len(request.studies)} studies "
            f"(useLLM={request.useLLM}, autoFetchDetections={request.autoFetchDetections})"
        )

        # Get agent
        agent = get_triage_agent(use_llm=request.useLLM)

        # Convert to dict format
        studies = [study.model_dump() for study in request.studies]

        # Auto-fetch AI detections for X-ray studies without provided detections
        if request.autoFetchDetections:
            for study in studies:
                # Skip if detections already provided
                if study.get("detections"):
                    continue

                # Only fetch for X-ray modalities
                modality = (study.get("modality") or "").upper()
                if modality not in XRAY_MODALITIES:
                    continue

                # Fetch from Orthanc
                try:
                    detections = await get_study_detections(
                        study.get("studyUID", ""),
                        modality
                    )
                    if detections:
                        study["detections"] = detections
                        logger.info(
                            f"Auto-fetched {len(detections)} detections for study {study.get('studyUID')}"
                        )
                except Exception as e:
                    logger.warning(
                        f"Failed to auto-fetch detections for {study.get('studyUID')}: {e}"
                    )

        # Run triage
        result = agent.triage_studies(studies=studies)

        # Convert to response format
        triaged_outputs = [
            TriagedStudyOutput(**study)
            for study in result["triagedStudies"]
        ]

        logger.info(
            f"Triage complete: {result['statCount']} STAT, "
            f"{result['urgentCount']} URGENT, "
            f"{result['semiUrgentCount']} SEMI-URGENT, "
            f"{result['routineCount']} ROUTINE"
        )

        return TriageResponse(
            success=True,
            triagedStudies=triaged_outputs,
            totalProcessed=result["totalProcessed"],
            statCount=result["statCount"],
            urgentCount=result["urgentCount"],
            semiUrgentCount=result["semiUrgentCount"],
            routineCount=result["routineCount"],
        )

    except Exception as e:
        logger.exception("Triage failed")
        return TriageResponse(
            success=False,
            triagedStudies=[],
            totalProcessed=0,
            statCount=0,
            urgentCount=0,
            semiUrgentCount=0,
            routineCount=0,
            error=str(e),
        )


@router.get("/health")
async def check_triage_health():
    """
    Check health of the triage service.

    Returns:
        Health status including LLM availability
    """
    try:
        agent = get_triage_agent(use_llm=True)

        return {
            "status": "healthy",
            "rulesEngineAvailable": True,
            "llmAvailable": agent.use_llm,
            "llmModel": agent.model_name if agent.use_llm else None,
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }


@router.get("/levels")
async def get_triage_levels():
    """
    Get available triage levels and their descriptions.

    Returns:
        List of triage levels with metadata
    """
    return {
        "levels": [
            {
                "level": "STAT",
                "description": "Immediate attention required",
                "turnaround": "ASAP",
                "color": "red",
            },
            {
                "level": "URGENT",
                "description": "High priority, within 24 hours",
                "turnaround": "< 24 hours",
                "color": "orange",
            },
            {
                "level": "SEMI_URGENT",
                "description": "Moderate priority, within 48 hours",
                "turnaround": "< 48 hours",
                "color": "yellow",
            },
            {
                "level": "ROUTINE",
                "description": "Standard workflow priority",
                "turnaround": "Standard",
                "color": "green",
            },
        ]
    }
