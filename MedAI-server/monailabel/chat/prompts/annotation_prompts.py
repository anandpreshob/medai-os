# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Annotation prompts for parsing annotation intents.

Templates and prompts for understanding user annotation requests
and generating appropriate confirmation messages.
"""

from typing import Any, Dict, List, Optional


# =============================================================================
# Intent Parsing Prompts
# =============================================================================

ANNOTATION_INTENT_PROMPT = """Analyze the user's message and determine their annotation intent.

**Possible Intents:**

1. **segmentation_request** - User wants to segment/outline something in the image
   - Examples: "segment the liver", "outline the tumor", "find all organs", "identify the spleen"
   - Key words: segment, outline, identify, find, detect, mark, label

2. **save_request** - User wants to save a segmentation
   - Examples: "save as NIfTI", "export to DICOM", "save this", "keep it"
   - Key words: save, export, download, keep, store

3. **batch_request** - User wants to process multiple images
   - Examples: "segment liver in all CTs", "process all studies", "batch segment"
   - Key words: all, batch, multiple, every, each

4. **session_load** - User wants to load a previous session
   - Examples: "load yesterday's work", "open the liver study", "continue where I left off"
   - Key words: load, open, continue, resume, previous, yesterday, last

5. **edit_request** - User wants to edit an existing segmentation
   - Examples: "make it bigger", "shrink the liver", "smooth the edges", "delete spleen"
   - Key words: grow, shrink, smooth, delete, edit, modify, adjust, bigger, smaller

6. **confirm_action** - User is confirming a pending action
   - Examples: "yes", "accept", "looks good", "confirm", "do it"
   - Key words: yes, accept, confirm, ok, approve, good, correct

7. **reject_action** - User is rejecting a pending action
   - Examples: "no", "reject", "cancel", "try again", "redo"
   - Key words: no, reject, cancel, redo, wrong, bad

8. **clarification** - User is asking for clarification or more info
   - Examples: "what labels did you find?", "show me the preview", "what models are available?"

**Output Format:**
Respond with a JSON object:
```json
{
  "intent": "<intent_name>",
  "confidence": 0.0-1.0,
  "extracted_params": {
    // relevant parameters extracted from the message
  }
}
```

**Parameter Extraction:**

For segmentation_request:
- "target": what to segment (e.g., "liver", "all organs")
- "model_preference": if user mentions a model
- "has_point_prompt": true if user is clicking/pointing

For save_request:
- "format": nifti, dicom-seg, png, or null
- "destination": local, pacs, or null

For batch_request:
- "scope": all, selected, filter
- "filter_modality": if mentioned
- "target": what to segment

For edit_request:
- "operation": grow, shrink, smooth, delete, merge, etc.
- "target_label": which label to edit
- "amount": if specified (e.g., "5 pixels")

User message: {message}
"""


SEGMENTATION_PARAMS_PROMPT = """Extract segmentation parameters from the user's message.

User message: "{message}"

Current context:
- Modality: {modality}
- Body region: {body_region}
- Available models: biomedparse, medsam, totalsegmentator

Extract the following parameters as JSON:
```json
{
  "targets": ["list of anatomical structures to segment"],
  "model": "preferred model or null",
  "is_interactive": false,
  "slice_specific": false,
  "propagate_3d": true
}
```

Guidelines:
- If user says "everything" or "all organs", use totalsegmentator
- If user mentions specific structures, use biomedparse
- For interactive/point-based, use medsam
- Consider body region when interpreting vague requests
"""


# =============================================================================
# Confirmation Message Templates
# =============================================================================


def get_segmentation_confirmation_message(
    labels: List[Dict[str, Any]],
    model_used: str,
    confidence: Optional[float],
    inference_time_ms: float,
) -> str:
    """Generate confirmation message for segmentation results."""
    label_list = "\n".join([
        f"  - **{l['label_name']}**: {l.get('voxel_count', 'N/A')} voxels"
        + (f" ({l['volume_ml']:.1f} ml)" if l.get('volume_ml') else "")
        for l in labels
    ])

    confidence_str = f" (confidence: {confidence:.0%})" if confidence else ""

    message = f"""**Segmentation Preview**{confidence_str}

I found {len(labels)} structure(s) using {model_used}:

{label_list}

Processing time: {inference_time_ms:.0f}ms

Would you like to:
- **Accept** this segmentation
- **Edit** it (grow, shrink, smooth)
- **Reject** and try again with different parameters
"""

    return message


def get_save_confirmation_message(
    format: str,
    destination: str,
    labels: List[str],
) -> str:
    """Generate confirmation message before saving."""
    label_str = ", ".join(labels[:5])
    if len(labels) > 5:
        label_str += f", and {len(labels) - 5} more"

    dest_str = {
        "local": "locally",
        "pacs": "to PACS",
        "both": "locally and to PACS",
    }.get(destination, "locally")

    return f"""**Ready to Save**

I'll save the following segmentation(s) {dest_str}:
- Labels: {label_str}
- Format: {format.upper()}

Do you want me to proceed?
"""


def get_batch_confirmation_message(
    total_images: int,
    model: str,
    prompt: str,
    estimated_time_s: float,
) -> str:
    """Generate confirmation message for batch processing."""
    time_str = (
        f"{estimated_time_s:.0f} seconds"
        if estimated_time_s < 60
        else f"{estimated_time_s / 60:.1f} minutes"
    )

    return f"""**Batch Processing Request**

I'll process **{total_images} image(s)** with the following parameters:
- Model: {model}
- Target: {prompt}
- Estimated time: {time_str}

This operation will run in the background. Do you want me to start?
"""


def get_edit_confirmation_message(
    operation: str,
    label_name: str,
    changes_summary: str,
) -> str:
    """Generate confirmation message for edit operations."""
    return f"""**Edit Preview**

Operation: **{operation.replace('_', ' ').title()}** on {label_name}

Changes: {changes_summary}

Do you want to apply this edit?
"""


def get_session_load_message(
    session_id: str,
    study_description: Optional[str],
    modality: str,
    segmentations: List[Dict[str, Any]],
) -> str:
    """Generate message for loaded session."""
    desc = study_description or "Unknown study"

    if segmentations:
        seg_list = "\n".join([
            f"  - {s.get('labels', ['Unknown'])[0]}"
            + (" (verified)" if s.get('is_verified') else "")
            for s in segmentations[:5]
        ])
        seg_section = f"\n**Existing Segmentations:**\n{seg_list}"
        if len(segmentations) > 5:
            seg_section += f"\n  ...and {len(segmentations) - 5} more"
    else:
        seg_section = "\nNo existing segmentations found."

    return f"""**Session Loaded**

Study: {desc} ({modality})
Session ID: {session_id}
{seg_section}

What would you like to do?
"""


# =============================================================================
# Error and Guidance Messages
# =============================================================================


def get_missing_context_message() -> str:
    """Message when no image is loaded."""
    return """I don't have an image loaded in the current session.

To perform segmentation, please:
1. Load an image in the viewer, or
2. Tell me which study to load (e.g., "load yesterday's CT abdomen")
"""


def get_model_suggestion_message(
    target: str,
    modality: Optional[str],
    body_region: Optional[str],
) -> str:
    """Suggest appropriate model for the request."""
    suggestions = []

    # BiomedParse for specific structures
    specific_organs = ["liver", "spleen", "kidney", "pancreas", "tumor", "lesion"]
    if any(organ in target.lower() for organ in specific_organs):
        suggestions.append("**BiomedParse** - Best for specific anatomical structures")

    # TotalSegmentator for comprehensive segmentation
    if "all" in target.lower() or "everything" in target.lower():
        suggestions.append("**TotalSegmentator** - Complete multi-organ segmentation")

    # MedSAM for interactive
    suggestions.append("**MedSAM** - Interactive point/box-guided segmentation")

    suggestion_text = "\n".join(f"- {s}" for s in suggestions)

    return f"""**Model Recommendations for "{target}":**

{suggestion_text}

Which model would you like to use, or should I pick the best one?
"""


def get_pending_action_reminder(
    action_type: str,
    preview_id: str,
) -> str:
    """Remind user about pending action."""
    return f"""You have a pending {action_type} preview ({preview_id[:8]}...).

Please **accept**, **edit**, or **reject** it before starting a new operation.
"""


# =============================================================================
# Intent Classification Helpers
# =============================================================================


SEGMENTATION_KEYWORDS = [
    "segment", "outline", "identify", "find", "detect", "mark", "label",
    "contour", "delineate", "trace", "extract", "annotate",
]

SAVE_KEYWORDS = [
    "save", "export", "download", "keep", "store", "write", "output",
]

BATCH_KEYWORDS = [
    "all", "batch", "multiple", "every", "each", "entire", "whole set",
]

EDIT_KEYWORDS = [
    "grow", "shrink", "smooth", "delete", "edit", "modify", "adjust",
    "bigger", "smaller", "expand", "contract", "remove", "erase",
    "merge", "combine", "split", "fill", "refine",
]

LOAD_KEYWORDS = [
    "load", "open", "continue", "resume", "previous", "yesterday",
    "last", "earlier", "retrieve", "fetch", "bring up",
]

CONFIRM_KEYWORDS = [
    "yes", "accept", "confirm", "ok", "okay", "approve", "good",
    "correct", "right", "proceed", "go ahead", "do it", "looks good",
]

REJECT_KEYWORDS = [
    "no", "reject", "cancel", "redo", "wrong", "bad", "try again",
    "not right", "incorrect", "discard", "abort",
]


def classify_intent_simple(message: str) -> str:
    """
    Simple keyword-based intent classification.

    Used as a fallback when LLM classification is not available.
    """
    message_lower = message.lower()

    # Check for confirmation/rejection first (usually short messages)
    if len(message.split()) <= 5:
        if any(kw in message_lower for kw in CONFIRM_KEYWORDS):
            return "confirm_action"
        if any(kw in message_lower for kw in REJECT_KEYWORDS):
            return "reject_action"

    # Check other intents
    if any(kw in message_lower for kw in EDIT_KEYWORDS):
        return "edit_request"

    if any(kw in message_lower for kw in BATCH_KEYWORDS):
        if any(kw in message_lower for kw in SEGMENTATION_KEYWORDS):
            return "batch_request"

    if any(kw in message_lower for kw in SAVE_KEYWORDS):
        return "save_request"

    if any(kw in message_lower for kw in LOAD_KEYWORDS):
        return "session_load"

    if any(kw in message_lower for kw in SEGMENTATION_KEYWORDS):
        return "segmentation_request"

    return "clarification"


def extract_model_from_prompt(message: str) -> Optional[str]:
    """
    Extract preferred model name from user message.

    Handles variations like:
    - "use biomedparse" / "with biomedparse"
    - "using medsam" / "via medsam"
    - "totalsegmentator model" / "the totalsegmentator"
    """
    message_lower = message.lower()

    # Model name mapping (aliases → canonical names)
    model_aliases = {
        # BiomedParse
        "biomedparse": "biomedparse",
        "biomed parse": "biomedparse",
        "biomed-parse": "biomedparse",
        "biomedical parse": "biomedparse",
        # MedSAM
        "medsam": "medsam",
        "med-sam": "medsam",
        "med sam": "medsam",
        "medical sam": "medsam",
        "sam": "medsam",  # Assume MedSAM when user says SAM in medical context
        # TotalSegmentator
        "totalsegmentator": "totalsegmentator",
        "total segmentator": "totalsegmentator",
        "total-segmentator": "totalsegmentator",
        "ts": "totalsegmentator",  # Common abbreviation
        # SAM2
        "sam2": "sam2",
        "sam 2": "sam2",
    }

    # Check for explicit model mentions with context words
    context_words = ["use", "using", "with", "via", "the", "model"]

    for alias, canonical in model_aliases.items():
        if alias in message_lower:
            # Check if it appears near a context word (more confident match)
            for context in context_words:
                if f"{context} {alias}" in message_lower or f"{alias} {context}" in message_lower:
                    return canonical
            # Even without context, if model name is explicit, use it
            if alias in ["biomedparse", "medsam", "totalsegmentator", "sam2"]:
                return canonical

    return None


def extract_segmentation_targets(message: str) -> List[str]:
    """Extract anatomical targets from message."""
    message_lower = message.lower()

    targets = []

    # Common organs/structures
    structures = [
        "liver", "spleen", "kidney", "kidneys", "pancreas", "stomach",
        "heart", "lung", "lungs", "aorta", "spine", "vertebrae",
        "tumor", "tumors", "lesion", "lesions", "nodule", "nodules", "mass",
        "bladder", "prostate", "uterus", "ovary", "ovaries",
        "brain", "ventricles", "cerebellum",
        "thyroid", "adrenal", "gallbladder",
        "colon", "small bowel", "intestine",
        "ribs", "sternum", "pelvis",
    ]

    for structure in structures:
        if structure in message_lower:
            targets.append(structure)

    # Handle "all organs" or "everything"
    if "all" in message_lower and ("organ" in message_lower or "structure" in message_lower):
        targets = ["all_organs"]
    elif "everything" in message_lower:
        targets = ["all_organs"]

    return targets if targets else ["unknown"]


def extract_edit_operation(message: str) -> Dict[str, Any]:
    """Extract edit operation details from message."""
    message_lower = message.lower()

    operation = None
    amount = None

    # Detect operation type
    if any(kw in message_lower for kw in ["grow", "bigger", "expand", "enlarge"]):
        operation = "grow"
    elif any(kw in message_lower for kw in ["shrink", "smaller", "contract", "reduce"]):
        operation = "shrink"
    elif any(kw in message_lower for kw in ["smooth", "refine", "clean"]):
        operation = "smooth"
    elif any(kw in message_lower for kw in ["delete", "remove", "erase"]):
        operation = "delete_label"
    elif any(kw in message_lower for kw in ["merge", "combine", "join"]):
        operation = "merge_labels"
    elif any(kw in message_lower for kw in ["fill", "hole"]):
        operation = "fill_holes"
    elif any(kw in message_lower for kw in ["split", "separate"]):
        operation = "split"

    # Extract amount if specified
    import re
    amount_match = re.search(r"(\d+)\s*(pixel|voxel|mm|%)", message_lower)
    if amount_match:
        amount = int(amount_match.group(1))

    return {
        "operation": operation,
        "amount": amount,
    }
