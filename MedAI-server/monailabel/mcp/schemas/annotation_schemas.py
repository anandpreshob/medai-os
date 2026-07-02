# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Pydantic schemas for annotation MCP tool inputs and outputs.

These schemas define the contract for agentic conversational annotation
including segmentation execution, saving, session recovery, batch processing,
and editing operations.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Point Prompt Schema
# =============================================================================


class PointPrompt(BaseModel):
    """A point prompt for interactive segmentation."""

    x: float = Field(..., description="X coordinate (0-1 normalized or pixel)")
    y: float = Field(..., description="Y coordinate (0-1 normalized or pixel)")
    z: Optional[float] = Field(None, description="Z coordinate for 3D (slice index or normalized)")
    label: int = Field(default=1, ge=0, description="Label for this point (1=foreground, 0=background)")
    is_normalized: bool = Field(default=True, description="Whether coordinates are normalized (0-1)")


# =============================================================================
# Run Segmentation Schemas
# =============================================================================


class RunSegmentationInput(BaseModel):
    """Input schema for running AI segmentation inference."""

    session_id: str = Field(
        ...,
        description="Viewer session ID containing the image to segment",
    )
    model: str = Field(
        default="biomedparse",
        description="Segmentation model to use (biomedparse, medsam, totalsegmentator)",
    )
    text_prompt: Optional[str] = Field(
        None,
        description="Natural language prompt describing what to segment (e.g., 'liver', 'lung nodule')",
    )
    point_prompts: Optional[List[PointPrompt]] = Field(
        None,
        description="Interactive point prompts for guided segmentation",
    )
    box_prompt: Optional[Dict[str, float]] = Field(
        None,
        description="Bounding box prompt: {x_min, y_min, x_max, y_max} (normalized 0-1)",
    )
    slice_index: Optional[int] = Field(
        None,
        description="Specific slice to segment (for 2D inference on 3D volume)",
    )
    propagate_3d: bool = Field(
        default=True,
        description="Whether to propagate 2D segmentation to 3D volume",
    )


class SegmentationLabel(BaseModel):
    """Information about a segmentation label result."""

    label_id: int = Field(..., description="Numeric label ID")
    label_name: str = Field(..., description="Human-readable label name")
    color: str = Field(..., description="Display color in hex format (e.g., '#FF6B6B')")
    voxel_count: int = Field(default=0, description="Number of voxels in segmentation")
    volume_ml: Optional[float] = Field(None, description="Volume in milliliters")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Model confidence score")
    bounding_box: Optional[Dict[str, int]] = Field(
        None,
        description="Bounding box: {x_min, y_min, z_min, x_max, y_max, z_max}",
    )


class RunSegmentationOutput(BaseModel):
    """Output schema for segmentation inference."""

    preview_id: str = Field(
        ...,
        description="Unique ID for this preview segmentation (for acceptance/rejection)",
    )
    labels: List[SegmentationLabel] = Field(
        default_factory=list,
        description="List of segmentation labels created",
    )
    thumbnail_url: Optional[str] = Field(
        None,
        description="URL to preview thumbnail image",
    )
    overlay_data_url: Optional[str] = Field(
        None,
        description="URL to fetch the full segmentation overlay data",
    )
    model_used: str = Field(..., description="Model that performed the segmentation")
    inference_time_ms: float = Field(..., description="Time taken for inference in milliseconds")
    confidence: Optional[float] = Field(
        None, ge=0, le=1,
        description="Overall confidence score for the segmentation",
    )
    requires_confirmation: bool = Field(
        default=True,
        description="Whether user confirmation is required before saving",
    )
    suggested_edits: Optional[List[str]] = Field(
        None,
        description="Suggested edit operations to improve segmentation",
    )


# =============================================================================
# Save Annotation Schemas
# =============================================================================


class SaveAnnotationInput(BaseModel):
    """Input schema for saving a preview segmentation."""

    preview_id: str = Field(
        ...,
        description="Preview ID from run_segmentation output",
    )
    format: Literal["nifti", "dicom-seg", "png", "npz"] = Field(
        default="nifti",
        description="Output format for saved annotation",
    )
    destination: Literal["local", "pacs", "both"] = Field(
        default="local",
        description="Where to save the annotation",
    )
    filename_prefix: Optional[str] = Field(
        None,
        description="Custom prefix for output filename",
    )
    include_metadata: bool = Field(
        default=True,
        description="Whether to include model and provenance metadata",
    )
    labels_to_save: Optional[List[int]] = Field(
        None,
        description="Specific label IDs to save (default: all)",
    )


class SavedFileInfo(BaseModel):
    """Information about a saved file."""

    path: str = Field(..., description="Local file path or URL")
    format: str = Field(..., description="File format")
    size_bytes: int = Field(..., description="File size in bytes")
    checksum: Optional[str] = Field(None, description="MD5 checksum of file")


class SaveAnnotationOutput(BaseModel):
    """Output schema for save annotation."""

    saved_files: List[SavedFileInfo] = Field(
        default_factory=list,
        description="List of saved files",
    )
    pacs_uid: Optional[str] = Field(
        None,
        description="DICOM SOP Instance UID if saved to PACS",
    )
    pacs_series_uid: Optional[str] = Field(
        None,
        description="DICOM Series UID if saved to PACS",
    )
    segmentation_id: str = Field(
        ...,
        description="Unique ID for the saved segmentation (for later editing)",
    )
    success: bool = Field(..., description="Whether save operation succeeded")
    message: Optional[str] = Field(None, description="Status message or error details")


# =============================================================================
# Load Session Schemas
# =============================================================================


class LoadSessionInput(BaseModel):
    """Input schema for loading a previous annotation session."""

    query: str = Field(
        ...,
        description="Natural language query to find session (e.g., 'yesterday's liver study', 'CT abdomen from last week')",
    )
    session_id: Optional[str] = Field(
        None,
        description="Direct session ID if known",
    )
    patient_id: Optional[str] = Field(
        None,
        description="Patient ID to filter sessions",
    )
    date_range_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="How far back to search (in days)",
    )
    modality_filter: Optional[str] = Field(
        None,
        description="Filter by imaging modality (CT, MR, US, etc.)",
    )


class SessionSegmentationInfo(BaseModel):
    """Information about a segmentation in a loaded session."""

    segmentation_id: str = Field(..., description="Unique segmentation ID")
    labels: List[str] = Field(default_factory=list, description="Label names in segmentation")
    created_at: str = Field(..., description="ISO timestamp of creation")
    model_used: Optional[str] = Field(None, description="AI model used")
    is_verified: bool = Field(default=False, description="Whether verified by user")


class LoadSessionOutput(BaseModel):
    """Output schema for load session."""

    session_id: str = Field(..., description="Loaded session ID")
    study_description: Optional[str] = Field(None, description="DICOM study description")
    modality: str = Field(..., description="Imaging modality")
    body_region: Optional[str] = Field(None, description="Body region")
    study_date: Optional[str] = Field(None, description="Original study date")
    session_created: str = Field(..., description="When annotation session was created")
    last_modified: str = Field(..., description="Last modification timestamp")
    segmentations: List[SessionSegmentationInfo] = Field(
        default_factory=list,
        description="Available segmentations in session",
    )
    has_unsaved_changes: bool = Field(default=False, description="Whether there are unsaved previews")
    thumbnail_url: Optional[str] = Field(None, description="Session preview thumbnail")


# =============================================================================
# Batch Process Schemas
# =============================================================================


class BatchProcessInput(BaseModel):
    """Input schema for starting batch processing from chat."""

    scope: Literal["all", "selected", "filter"] = Field(
        ...,
        description="Scope of images to process",
    )
    model: str = Field(
        default="biomedparse",
        description="Segmentation model to use",
    )
    prompt: str = Field(
        ...,
        description="What to segment (e.g., 'liver and spleen', 'all organs')",
    )
    filter_criteria: Optional[Dict[str, Any]] = Field(
        None,
        description="Filter criteria when scope='filter' (modality, body_region, date_range)",
    )
    selected_image_ids: Optional[List[str]] = Field(
        None,
        description="Image IDs when scope='selected'",
    )
    save_format: Literal["nifti", "dicom-seg"] = Field(
        default="nifti",
        description="Format to save results",
    )
    auto_save: bool = Field(
        default=False,
        description="Whether to auto-save without confirmation (requires explicit user consent)",
    )
    max_concurrent: int = Field(
        default=2,
        ge=1,
        le=10,
        description="Maximum concurrent processing jobs",
    )


class BatchJobStatus(BaseModel):
    """Status of a batch processing job."""

    image_id: str = Field(..., description="Image being processed")
    status: Literal["pending", "processing", "completed", "failed", "skipped"] = Field(
        ..., description="Current status"
    )
    progress_percent: Optional[float] = Field(None, description="Progress percentage")
    labels_found: Optional[List[str]] = Field(None, description="Labels found if completed")
    error_message: Optional[str] = Field(None, description="Error if failed")


class BatchProcessOutput(BaseModel):
    """Output schema for batch process."""

    job_id: str = Field(..., description="Unique batch job ID")
    total_images: int = Field(..., description="Total images to process")
    status: Literal["queued", "running", "paused", "completed", "cancelled"] = Field(
        ..., description="Overall job status"
    )
    completed_count: int = Field(default=0, description="Number completed")
    failed_count: int = Field(default=0, description="Number failed")
    current_image: Optional[str] = Field(None, description="Currently processing image ID")
    estimated_time_remaining_s: Optional[float] = Field(None, description="Estimated seconds remaining")
    image_statuses: Optional[List[BatchJobStatus]] = Field(
        None, description="Detailed status per image (may be paginated)"
    )
    can_cancel: bool = Field(default=True, description="Whether job can be cancelled")


# =============================================================================
# Edit Annotation Schemas
# =============================================================================


class EditAnnotationInput(BaseModel):
    """Input schema for editing an existing annotation."""

    segmentation_id: str = Field(
        ...,
        description="ID of segmentation to edit",
    )
    operation: Literal["grow", "shrink", "smooth", "delete_label", "rename_label", "merge_labels", "split", "fill_holes"] = Field(
        ...,
        description="Edit operation to perform",
    )
    label_id: Optional[int] = Field(
        None,
        description="Label ID to operate on (required for most operations)",
    )
    parameters: Optional[Dict[str, Any]] = Field(
        None,
        description="Operation-specific parameters",
    )
    # Grow/Shrink parameters
    pixels: Optional[int] = Field(
        None,
        ge=1,
        le=50,
        description="Number of pixels to grow/shrink by",
    )
    # Rename parameters
    new_label_name: Optional[str] = Field(
        None,
        description="New name when renaming a label",
    )
    # Merge parameters
    target_label_id: Optional[int] = Field(
        None,
        description="Target label ID for merge operation",
    )


class EditAnnotationOutput(BaseModel):
    """Output schema for edit annotation."""

    preview_id: str = Field(
        ...,
        description="Preview ID for the edited result (requires confirmation)",
    )
    original_labels: List[SegmentationLabel] = Field(
        default_factory=list,
        description="Labels before edit",
    )
    updated_labels: List[SegmentationLabel] = Field(
        default_factory=list,
        description="Labels after edit",
    )
    operation_applied: str = Field(..., description="Description of operation applied")
    changes_summary: str = Field(
        ...,
        description="Human-readable summary of changes (e.g., 'Grew liver by 5 pixels, volume increased by 12%')",
    )
    thumbnail_url: Optional[str] = Field(None, description="Preview thumbnail URL")
    can_undo: bool = Field(default=True, description="Whether edit can be undone")


# =============================================================================
# Common Response Schemas
# =============================================================================


class AnnotationErrorResponse(BaseModel):
    """Error response for annotation operations."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    recoverable: bool = Field(default=True, description="Whether error is recoverable")
    suggested_action: Optional[str] = Field(
        None,
        description="Suggested action to resolve the error",
    )


class ConfirmationRequest(BaseModel):
    """Request for user confirmation before destructive action."""

    action: str = Field(..., description="Action requiring confirmation")
    preview_id: str = Field(..., description="Preview ID to confirm or reject")
    summary: str = Field(..., description="Summary of what will happen")
    warnings: Optional[List[str]] = Field(None, description="Warnings to display")
    requires_explicit_consent: bool = Field(
        default=False,
        description="Whether action requires typing 'confirm' vs just clicking",
    )
