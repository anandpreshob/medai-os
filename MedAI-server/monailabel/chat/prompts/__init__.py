# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Chat prompt templates for MedAI radiology assistant.
"""

from .system_prompts import (
    RADIOLOGY_ASSISTANT_PROMPT,
    REPORT_GENERATION_PROMPT,
    EVIDENCE_SYNTHESIS_PROMPT,
    get_system_prompt,
)
from .tool_selection import (
    TOOL_SELECTION_PROMPT,
    INTENT_CLASSIFICATION_PROMPT,
    get_tool_selection_prompt,
)
from .annotation_prompts import (
    ANNOTATION_INTENT_PROMPT,
    SEGMENTATION_PARAMS_PROMPT,
    get_segmentation_confirmation_message,
    get_save_confirmation_message,
    get_batch_confirmation_message,
    get_edit_confirmation_message,
    get_session_load_message,
    get_missing_context_message,
    get_model_suggestion_message,
    get_pending_action_reminder,
    classify_intent_simple,
    extract_segmentation_targets,
    extract_edit_operation,
    extract_model_from_prompt,
)

__all__ = [
    "RADIOLOGY_ASSISTANT_PROMPT",
    "REPORT_GENERATION_PROMPT",
    "EVIDENCE_SYNTHESIS_PROMPT",
    "TOOL_SELECTION_PROMPT",
    "INTENT_CLASSIFICATION_PROMPT",
    "get_system_prompt",
    "get_tool_selection_prompt",
    # Annotation prompts
    "ANNOTATION_INTENT_PROMPT",
    "SEGMENTATION_PARAMS_PROMPT",
    "get_segmentation_confirmation_message",
    "get_save_confirmation_message",
    "get_batch_confirmation_message",
    "get_edit_confirmation_message",
    "get_session_load_message",
    "get_missing_context_message",
    "get_model_suggestion_message",
    "get_pending_action_reminder",
    "classify_intent_simple",
    "extract_segmentation_targets",
    "extract_edit_operation",
    "extract_model_from_prompt",
]
