# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Standalone FastAPI application for LLM-based report generation and triaging.
Uses cloud LLM APIs (Gemini, OpenAI) - NO GPU required.

Port: 8003
GPU: Not required (CPU-only, uses cloud APIs)
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import agents and LLM client
# These are copied into the container at build time
try:
    from agents.breast_agent import get_agent
    from agents.triaging_agent import TriagingAgent
    from agents.chestxray_workflow import run_chestxray_workflow
    from llm.llm_client import LLMClient, LLMConfig
except ImportError:
    # Fallback for local development
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from agents.breast_agent import get_agent
    from agents.triaging_agent import TriagingAgent
    from agents.chestxray_workflow import run_chestxray_workflow
    from llm.llm_client import LLMClient, LLMConfig


# =====================
# Pydantic Models - Report
# =====================

class PatientInfo(BaseModel):
    patientId: Optional[str] = None
    patientName: Optional[str] = None
    studyDate: Optional[str] = None
    studyDescription: Optional[str] = None


class Detection(BaseModel):
    label: str
    confidence: float
    x_min: Optional[float] = None
    y_min: Optional[float] = None
    x_max: Optional[float] = None
    y_max: Optional[float] = None


class ReportGenerationRequest(BaseModel):
    mosaic_image: str  # Base64 PNG data URL
    volumetrics: Optional[Dict[str, Any]] = None
    radiomics: Optional[Dict[str, Any]] = None
    findings: str
    modality: str = "Unknown"
    agent_type: str = "breast"
    patient_info: Optional[PatientInfo] = None
    clinical_context: Optional[str] = None
    detections: Optional[List[Detection]] = None


class ReportSections(BaseModel):
    clinicalHistory: str = ""
    technique: str = ""
    comparison: str = ""
    findings: str = ""
    impression: str = ""
    recommendations: str = ""


class GeneratedReport(BaseModel):
    id: str
    generatedAt: str
    agentType: str
    sections: ReportSections
    rawResponse: Optional[str] = None


class ReportGenerationResponse(BaseModel):
    success: bool
    report: Optional[GeneratedReport] = None
    error: Optional[str] = None


class AgenticReportRequest(BaseModel):
    """Request model for agentic workflow-based report generation."""
    image_base64: str = Field(..., description="Base64-encoded chest X-ray image")
    detections: List[Detection] = Field(default_factory=list, description="AI detections from MedGemma")
    radiologist_findings: str = Field(default="", description="Radiologist's observations")
    clinical_context: Optional[str] = Field(None, description="Clinical history or indication")
    patient_info: Optional[PatientInfo] = None
    modality: str = Field(default="CR", description="Imaging modality (CR, DX, XR)")


class AgenticReportResponse(BaseModel):
    """Response model for agentic workflow-based report generation."""
    success: bool
    report: Optional[Dict[str, Any]] = None
    errors: List[str] = Field(default_factory=list)
    workflow_steps: Optional[str] = None


# =====================
# Pydantic Models - Triage
# =====================

class StudyInput(BaseModel):
    studyUID: str
    patientName: Optional[str] = None
    patientID: Optional[str] = None
    studyDate: Optional[str] = None
    modality: Optional[str] = None
    studyDescription: Optional[str] = None
    reasonForVisit: Optional[str] = None
    urgencyFlag: Optional[str] = None
    patientHistory: Optional[str] = None
    symptoms: Optional[str] = None
    patientLocation: Optional[str] = None


class TriageRequest(BaseModel):
    studies: List[StudyInput]
    useLLM: bool = True


class TriagedStudyOutput(BaseModel):
    studyUID: str
    patientName: Optional[str] = None
    patientID: Optional[str] = None
    modality: Optional[str] = None
    studyDescription: Optional[str] = None
    studyDate: Optional[str] = None
    priorityRank: int
    triageLevel: str
    priorityScore: float
    rationale: str
    keyFactors: List[str] = []
    rulesApplied: List[str] = []
    reasonForVisit: Optional[str] = None
    patientHistory: Optional[str] = None
    symptoms: Optional[str] = None
    patientLocation: Optional[str] = None


class TriageResponse(BaseModel):
    success: bool
    triagedStudies: List[TriagedStudyOutput]
    totalProcessed: int
    statCount: int
    urgentCount: int
    semiUrgentCount: int
    routineCount: int
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    llm_provider: Optional[str] = None
    llm_configured: bool


# =====================
# Service State
# =====================

_llm_client: Optional[LLMClient] = None
_triage_agent: Optional[TriagingAgent] = None


def get_llm_client() -> LLMClient:
    """Get or create the LLM client singleton."""
    global _llm_client
    if _llm_client is None:
        config = LLMConfig.from_env()
        _llm_client = LLMClient(config)
    return _llm_client


def get_triage_agent(use_llm: bool = True) -> TriagingAgent:
    """Get or create the triage agent singleton."""
    global _triage_agent
    if _triage_agent is None or _triage_agent.use_llm != use_llm:
        _triage_agent = TriagingAgent(use_llm=use_llm)
    return _triage_agent


# =====================
# FastAPI Application
# =====================

app = FastAPI(
    title="MedAI LLM Service",
    description="LLM-based report generation and worklist triaging service",
    version="1.0.0",
    root_path="/monai",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    try:
        llm = get_llm_client()
        return HealthResponse(
            status="healthy",
            service="llm",
            llm_provider=llm.config.provider if llm.config.api_key else None,
            llm_configured=bool(llm.config.api_key),
        )
    except Exception as e:
        return HealthResponse(
            status="unhealthy",
            service="llm",
            llm_configured=False,
        )


@app.get("/info")
async def get_info():
    """Get service information."""
    try:
        llm = get_llm_client()
        return {
            "service": "llm",
            "llm_provider": llm.config.provider,
            "llm_model": llm.config.model,
            "llm_configured": bool(llm.config.api_key),
            "endpoints": {
                "report": ["/report/generate", "/report/generate-agentic", "/report/agents", "/report/health"],
                "triage": ["/triage/prioritize", "/triage/health", "/triage/levels"],
            },
        }
    except Exception:
        return {
            "service": "llm",
            "llm_configured": False,
        }


# =====================
# Report Endpoints
# =====================

@app.post("/report/generate", response_model=ReportGenerationResponse)
async def generate_report(request: ReportGenerationRequest) -> ReportGenerationResponse:
    """
    Generate an AI-powered radiology report.
    """
    try:
        logger.info(f"Generating report with agent type: {request.agent_type}")

        # Get the appropriate agent
        agent = get_agent(request.agent_type)

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

        # Build prompt args
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

        user_prompt = agent.build_user_prompt(**prompt_kwargs)

        # Generate report
        result = llm.generate_report(
            system_prompt=system_prompt,
            user_message=user_prompt,
            image_base64=request.mosaic_image,
        )

        # Parse result into report structure
        sections = result.get("sections", {})
        report = GeneratedReport(
            id=str(uuid.uuid4()),
            generatedAt=datetime.utcnow().isoformat() + "Z",
            agentType=request.agent_type,
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


@app.get("/report/agents")
async def list_agents():
    """List available report generation agents."""
    return {
        "agents": [
            {
                "type": "breast",
                "name": "Breast Analysis Agent",
                "description": "Specialized for breast MRI/mammography with BI-RADS formatting",
                "supported_modalities": ["MR", "MG", "US"],
            },
            {
                "type": "chestxray",
                "name": "Chest X-Ray Analysis Agent",
                "description": "Specialized for chest X-ray with CheXagent AI detection integration",
                "supported_modalities": ["CR", "DX", "XR"],
            },
            {
                "type": "general",
                "name": "General Radiology Agent",
                "description": "General purpose radiology report generation (coming soon)",
                "supported_modalities": ["CT", "MR", "XR", "US", "NM", "PT"],
            },
        ]
    }


@app.get("/report/health")
async def check_report_health():
    """Check if the LLM service is configured and reachable."""
    try:
        llm = get_llm_client()

        if not llm.config.api_key:
            return {
                "status": "not_configured",
                "message": "LLM API key not configured. Set GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY.",
                "supported_providers": ["gemini", "openai"],
                "recommended": "gemini (free tier available)",
            }

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


@app.post("/report/generate-agentic", response_model=AgenticReportResponse)
async def generate_agentic_report(request: AgenticReportRequest) -> AgenticReportResponse:
    """
    Generate a radiology report using the LangGraph agentic workflow.

    This endpoint uses a multi-step workflow:
    1. Integrate inputs - Combine AI detections, radiologist findings, clinical context
    2. Structure findings - Organize by anatomical region
    3. Generate draft - Create initial report draft
    4. Finalize - Validate and add metadata

    Args:
        request: AgenticReportRequest with image, detections, findings, etc.

    Returns:
        AgenticReportResponse with the generated report or errors
    """
    try:
        logger.info("Starting agentic report generation workflow")

        # Convert patient_info to dict if provided
        patient_info_dict = None
        if request.patient_info:
            patient_info_dict = {
                "patientId": request.patient_info.patientId,
                "patientName": request.patient_info.patientName,
                "studyDate": request.patient_info.studyDate,
                "studyDescription": request.patient_info.studyDescription,
            }

        # Convert detections to dict list
        detections_list = [det.model_dump() for det in request.detections] if request.detections else []

        # Run the LangGraph workflow
        result = await run_chestxray_workflow(
            image_base64=request.image_base64,
            detections=detections_list,
            radiologist_findings=request.radiologist_findings,
            clinical_context=request.clinical_context,
            patient_info=patient_info_dict,
            modality=request.modality,
        )

        logger.info(f"Agentic workflow completed: success={result.get('success', False)}")

        return AgenticReportResponse(
            success=result.get("success", False),
            report=result.get("report"),
            errors=result.get("errors", []),
            workflow_steps=result.get("workflow_steps"),
        )

    except Exception as e:
        logger.exception("Agentic report generation failed")
        return AgenticReportResponse(
            success=False,
            errors=[f"Workflow execution failed: {str(e)}"],
        )


# =====================
# Triage Endpoints
# =====================

@app.post("/triage/prioritize", response_model=TriageResponse)
async def prioritize_studies(request: TriageRequest) -> TriageResponse:
    """
    Prioritize a batch of radiology studies for radiologist review.
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
                error="No studies provided",
            )

        logger.info(
            f"Triaging {len(request.studies)} studies (useLLM={request.useLLM})"
        )

        # Get agent
        agent = get_triage_agent(use_llm=request.useLLM)

        # Convert to dict format
        studies = [study.model_dump() for study in request.studies]

        # Run triage
        result = agent.triage_studies(studies=studies)

        # Convert to response format
        triaged_outputs = [TriagedStudyOutput(**study) for study in result["triagedStudies"]]

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


@app.get("/triage/health")
async def check_triage_health():
    """Check health of the triage service."""
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


@app.get("/triage/levels")
async def get_triage_levels():
    """Get available triage levels and their descriptions."""
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
