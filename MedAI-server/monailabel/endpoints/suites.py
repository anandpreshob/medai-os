"""
MedAI Suites API Endpoints

REST API for clinical workflow suites.
"""

import logging
import os
import sys
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

# Add apps/radiology to path for suite imports
_apps_dir = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "radiology")
if _apps_dir not in sys.path:
    sys.path.insert(0, _apps_dir)

from lib.suites import (
    get_suite_registry,
    get_model_resolver,
    SuiteRegistry,
    ModelResolver,
    get_tg263_name,
    validate_tg263_name,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/suites", tags=["Suites"])


# === Pydantic Models ===


class SuiteTaskResponse(BaseModel):
    """Response model for a single suite task."""

    task_id: str
    display_name: str
    primary_model: str
    model_params: Dict[str, Any] = Field(default_factory=dict)
    fallback_model: Optional[str] = None
    default_label_name: str = "Segment"
    label_color: str = "#FF0000"
    rt_type: Optional[str] = None
    body_regions: List[str] = Field(default_factory=list)
    priority: int = 10
    interactive: bool = False
    available: bool = True
    selected_model: Optional[str] = None


class SuiteResponse(BaseModel):
    """Response model for a suite configuration."""

    suite_id: str
    suite_type: str
    display_name: str
    description: str
    version: str
    icon: str
    defaults: Dict[str, Any]
    tasks: Dict[str, SuiteTaskResponse]
    analytics: Dict[str, Any]
    exports: Dict[str, Any]
    detection_hints: Dict[str, Any]
    model_preferences: List[str]


class SuiteListItem(BaseModel):
    """Response model for suite list item."""

    suite_id: str
    display_name: str
    description: str
    icon: str
    task_count: int


class SuiteInferRequest(BaseModel):
    """Request model for suite task inference."""

    image: str = Field(..., description="Image ID or path")
    params: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional parameter overrides"
    )
    output_format: str = Field(
        default="nifti", description="Output format: nifti, dicom_seg, rtstruct"
    )


class SuiteInferResponse(BaseModel):
    """Response model for suite task inference."""

    success: bool
    suite_id: str
    task_id: str
    model_used: str
    output_file: Optional[str] = None
    labels: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TG263ValidationRequest(BaseModel):
    """Request model for TG-263 name validation."""

    names: List[str] = Field(..., description="List of structure names to validate")


class TG263ValidationResponse(BaseModel):
    """Response model for TG-263 name validation."""

    results: List[Dict[str, Any]]


# === Dependency Injection ===


def get_registry() -> SuiteRegistry:
    """Get the suite registry dependency."""
    return get_suite_registry()


def get_resolver() -> ModelResolver:
    """Get the model resolver dependency."""
    return get_model_resolver()


# === Endpoints ===


@router.get("/", response_model=List[SuiteListItem])
async def list_suites(registry: SuiteRegistry = Depends(get_registry)):
    """
    List all available clinical workflow suites.

    Returns a list of suite summaries with basic information.
    """
    suites = registry.get_all_suites()
    return [
        SuiteListItem(
            suite_id=suite.suite_id,
            display_name=suite.display_name,
            description=suite.description,
            icon=suite.icon,
            task_count=len(suite.tasks),
        )
        for suite in suites.values()
    ]


@router.get("/{suite_id}", response_model=SuiteResponse)
async def get_suite(
    suite_id: str,
    registry: SuiteRegistry = Depends(get_registry),
    resolver: ModelResolver = Depends(get_resolver),
):
    """
    Get detailed configuration for a specific suite.

    Includes all tasks with model availability information.
    """
    suite = registry.get_suite(suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail=f"Suite '{suite_id}' not found")

    # Get task availability info
    available_tasks = resolver.list_available_tasks(suite_id)
    task_availability = {t["task_id"]: t for t in available_tasks}

    # Build task responses with availability
    tasks_response = {}
    for task_id, task in suite.tasks.items():
        avail_info = task_availability.get(task_id, {})
        tasks_response[task_id] = SuiteTaskResponse(
            task_id=task.task_id,
            display_name=task.display_name,
            primary_model=task.primary_model,
            model_params=task.model_params,
            fallback_model=task.fallback_model,
            default_label_name=task.default_label_name,
            label_color=task.label_color,
            rt_type=task.rt_type,
            body_regions=task.body_regions,
            priority=task.priority,
            interactive=task.interactive,
            available=avail_info.get("available", True),
            selected_model=avail_info.get("selected_model"),
        )

    return SuiteResponse(
        suite_id=suite.suite_id,
        suite_type=suite.suite_type,
        display_name=suite.display_name,
        description=suite.description,
        version=suite.version,
        icon=suite.icon,
        defaults={
            "layout": suite.defaults.layout,
            "window_level_presets": suite.defaults.window_level_presets,
        },
        tasks=tasks_response,
        analytics={
            "default_metrics": suite.analytics.default_metrics,
            "enabled_features": suite.analytics.enabled_features,
        },
        exports={
            "allowed_formats": suite.exports.allowed_formats,
            "default_format": suite.exports.default_format,
        },
        detection_hints={
            "modalities": suite.detection_hints.modalities,
            "body_parts": suite.detection_hints.body_parts,
            "description_keywords": suite.detection_hints.description_keywords,
            "protocol_keywords": suite.detection_hints.protocol_keywords,
        },
        model_preferences=suite.model_preferences,
    )


@router.get("/{suite_id}/tasks")
async def list_suite_tasks(
    suite_id: str,
    body_region: Optional[str] = Query(None, description="Filter by body region"),
    registry: SuiteRegistry = Depends(get_registry),
    resolver: ModelResolver = Depends(get_resolver),
):
    """
    List all tasks available in a suite.

    Optionally filter by body region.
    """
    suite = registry.get_suite(suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail=f"Suite '{suite_id}' not found")

    # Get tasks with availability
    available_tasks = resolver.list_available_tasks(suite_id)

    # Filter by body region if specified
    if body_region:
        region_lower = body_region.lower()
        available_tasks = [
            t
            for t in available_tasks
            if "any" in [r.lower() for r in suite.tasks[t["task_id"]].body_regions]
            or region_lower
            in [r.lower() for r in suite.tasks[t["task_id"]].body_regions]
        ]

    return {"suite_id": suite_id, "tasks": available_tasks}


@router.get("/{suite_id}/tasks/{task_id}")
async def get_suite_task(
    suite_id: str,
    task_id: str,
    registry: SuiteRegistry = Depends(get_registry),
):
    """
    Get detailed configuration for a specific task.
    """
    task_config = registry.get_task(suite_id, task_id)
    if task_config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task_id}' not found in suite '{suite_id}'",
        )
    return task_config


@router.post("/{suite_id}/infer/{task_id}", response_model=SuiteInferResponse)
async def run_suite_task(
    suite_id: str,
    task_id: str,
    request: SuiteInferRequest,
    registry: SuiteRegistry = Depends(get_registry),
    resolver: ModelResolver = Depends(get_resolver),
):
    """
    Run inference for a specific suite task.

    This endpoint resolves the task to the appropriate model,
    applies suite-specific parameters, and returns the result
    with suite metadata (label names, colors, etc.).
    """
    try:
        # Resolve task to model
        model_name, model_params, metadata = resolver.resolve_task(
            suite_id, task_id, request.params
        )

        # TODO: Integrate with actual MONAI Label inference
        # For now, return a placeholder response
        # In production, this would call:
        # result = app.infer(model=model_name, image=request.image, params=model_params)

        logger.info(
            f"Suite inference: {suite_id}/{task_id} -> model={model_name}, "
            f"params={model_params}"
        )

        return SuiteInferResponse(
            success=True,
            suite_id=suite_id,
            task_id=task_id,
            model_used=model_name,
            output_file=None,  # Would be set by actual inference
            labels=[
                {
                    "index": 1,
                    "name": metadata["default_label_name"],
                    "color": metadata["label_color"],
                    "rt_type": metadata.get("rt_type"),
                }
            ],
            metadata=metadata,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Suite inference failed: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")


@router.get("/{suite_id}/structure-colors")
async def get_structure_colors(
    suite_id: str,
    registry: SuiteRegistry = Depends(get_registry),
):
    """
    Get RT structure colors for a suite.

    Returns color mappings for structures, following RT conventions.
    """
    suite = registry.get_suite(suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail=f"Suite '{suite_id}' not found")

    return {
        "suite_id": suite_id,
        "colors": suite.structure_colors or {},
        "naming_convention": suite.structure_naming.convention
        if suite.structure_naming
        else "TG-263",
    }


@router.post("/validate-names", response_model=TG263ValidationResponse)
async def validate_structure_names(request: TG263ValidationRequest):
    """
    Validate structure names against TG-263 conventions.

    Returns validation results with canonical names and suggestions.
    """
    results = []
    for name in request.names:
        is_valid, message = validate_tg263_name(name)
        canonical = get_tg263_name(name)
        results.append(
            {
                "input": name,
                "valid": is_valid,
                "message": message,
                "canonical": canonical if canonical != name else None,
            }
        )

    return TG263ValidationResponse(results=results)


@router.get("/naming/tg263/{structure_name}")
async def get_tg263_canonical_name(structure_name: str):
    """
    Get the TG-263 canonical name for a structure.
    """
    canonical = get_tg263_name(structure_name)
    is_valid, message = validate_tg263_name(structure_name)

    return {
        "input": structure_name,
        "canonical": canonical,
        "is_standard": canonical in structure_name or structure_name in canonical,
        "validation": {"valid": is_valid, "message": message},
    }


@router.post("/reload")
async def reload_suites(registry: SuiteRegistry = Depends(get_registry)):
    """
    Reload suite configurations from disk.

    Useful for development when suite YAML files are modified.
    """
    registry.reload()
    suites = registry.list_suite_ids()
    return {"message": "Suites reloaded", "suites": suites}
