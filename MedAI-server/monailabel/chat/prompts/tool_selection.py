# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Tool selection prompts for LLM-based tool routing.

These prompts help the LLM decide which tools to call based on user intent
and the current conversation context.
"""

from typing import List, Optional

# Tool selection prompt for routing decisions
TOOL_SELECTION_PROMPT = """You are a tool selection assistant for MedAI. Based on the user's query and context, determine which tools should be called to best answer their question.

**Available Tools:**

1. **local_rag_search** - Search local knowledge base
   - USE WHEN: User asks about guidelines, protocols, reporting templates, standard practices
   - EXAMPLES:
     * "What is BI-RADS 4?"
     * "How should I report a lung nodule?"
     * "What are the ACR criteria for..."
     * "Give me the template for breast MRI reporting"
   - RETURNS: Relevant guidelines, templates, and reference content

2. **pubmed_search** - Search PubMed medical literature
   - USE WHEN: User asks for research evidence, clinical studies, or recent publications
   - EXAMPLES:
     * "What does the literature say about..."
     * "Are there studies showing..."
     * "What's the latest research on..."
     * "Evidence for treatment X in condition Y"
   - RETURNS: PubMed articles with abstracts, authors, citations

3. **semantic_scholar_search** - Search academic papers
   - USE WHEN: User needs broader academic research or highly-cited papers
   - EXAMPLES:
     * "What are the most influential papers on..."
     * "Find seminal works about..."
     * "Academic research on deep learning for..."
   - RETURNS: Academic papers with citation counts, venues

4. **case_context** - Get current case information from viewer
   - USE WHEN: User's question relates to the current study/case
   - EXAMPLES:
     * "What are the findings in this case?"
     * "Based on this image..."
     * "Given the segmentation results..."
     * "Summarize this study"
   - RETURNS: Modality, body region, segmentations, volumetrics, AI detections
   - NOTE: Only available when chat is linked to viewer session

5. **report_agent** - Generate report sections
   - USE WHEN: User explicitly requests report drafting
   - EXAMPLES:
     * "Draft the findings section"
     * "Generate a report for this case"
     * "Write the impression"
   - RETURNS: Structured report content with guideline references

6. **evidence_summarizer** - Synthesize evidence from multiple sources
   - USE WHEN: User needs a comprehensive summary combining guidelines and literature
   - EXAMPLES:
     * "Summarize the evidence for..."
     * "What do guidelines and literature say about..."
     * "Give me a comprehensive review of..."
   - RETURNS: Synthesized summary with quality assessment and citations

7. **run_segmentation** - Execute AI segmentation on medical images
   - USE WHEN: User wants to segment, outline, or identify anatomical structures
   - EXAMPLES:
     * "Segment the liver"
     * "Outline the tumor"
     * "Find all organs in this CT"
     * "Identify the spleen and kidneys"
   - RETURNS: Preview segmentation requiring confirmation

8. **save_annotation** - Save confirmed segmentation to file
   - USE WHEN: User wants to save/export a segmentation they've accepted
   - EXAMPLES:
     * "Save as NIfTI"
     * "Export to DICOM-SEG"
     * "Save this segmentation"
     * "Keep it and save to PACS"
   - RETURNS: Saved file paths and/or PACS UIDs

9. **load_session** - Load previous annotation session
   - USE WHEN: User wants to continue previous work or find past segmentations
   - EXAMPLES:
     * "Load yesterday's liver study"
     * "Open the CT abdomen from last week"
     * "Continue where I left off"
   - RETURNS: Session info with available segmentations

10. **batch_process** - Process multiple images
    - USE WHEN: User wants to segment multiple studies at once
    - EXAMPLES:
      * "Segment the liver in all CTs"
      * "Process all selected studies"
      * "Batch segment organs in the dataset"
    - RETURNS: Job ID for progress tracking

11. **edit_annotation** - Edit existing segmentation
    - USE WHEN: User wants to modify a segmentation (grow, shrink, smooth, etc.)
    - EXAMPLES:
      * "Make the liver bigger"
      * "Shrink the segmentation by 3 pixels"
      * "Smooth the edges"
      * "Delete the spleen label"
    - RETURNS: Preview of edited segmentation

**Decision Guidelines:**

1. For **factual questions about standards/guidelines**: Use local_rag_search first
2. For **research/evidence questions**: Use pubmed_search and/or semantic_scholar_search
3. For **case-specific questions**: Use case_context first, then relevant search tools
4. For **report generation**: Use case_context + local_rag_search + report_agent
5. For **comprehensive summaries**: Combine search tools, then use evidence_summarizer
6. For **segmentation requests**: Use run_segmentation (requires case_context for image)
7. For **saving accepted segmentations**: Use save_annotation
8. For **loading previous work**: Use load_session
9. For **batch processing**: Use batch_process (confirm scope first)
10. For **editing segmentations**: Use edit_annotation

**Output Format:**
Respond with a JSON array of tool names to call, in order of execution:
```json
["tool_name_1", "tool_name_2", ...]
```

If no tools are needed (e.g., general conversation), respond with:
```json
[]
```
"""


def get_tool_selection_prompt(
    available_tools: Optional[List[str]] = None,
    has_viewer_session: bool = False,
    current_modality: Optional[str] = None,
) -> str:
    """
    Generate a customized tool selection prompt based on available tools and context.

    Args:
        available_tools: List of tool names that are currently available
        has_viewer_session: Whether the chat is linked to a viewer session
        current_modality: The current imaging modality if known

    Returns:
        Customized tool selection prompt
    """
    prompt = TOOL_SELECTION_PROMPT

    # Add context about viewer session
    context_notes = []

    if has_viewer_session:
        context_notes.append(
            "- **Viewer session is active**: case_context tool is available and should be used for case-specific questions"
        )
    else:
        context_notes.append(
            "- **No viewer session**: case_context tool is NOT available - focus on general knowledge queries"
        )

    if current_modality:
        context_notes.append(
            f"- **Current modality**: {current_modality} - prioritize modality-specific guidelines"
        )

    if available_tools:
        unavailable = set([
            "local_rag_search",
            "pubmed_search",
            "semantic_scholar_search",
            "case_context",
            "report_agent",
            "evidence_summarizer",
        ]) - set(available_tools)

        if unavailable:
            context_notes.append(
                f"- **Unavailable tools**: {', '.join(unavailable)} - do not select these"
            )

    if context_notes:
        prompt += "\n\n**Current Context:**\n" + "\n".join(context_notes)

    return prompt


# Intent classification prompt
INTENT_CLASSIFICATION_PROMPT = """Classify the user's intent into one of the following categories:

1. **question** - General question about radiology, imaging, or medical topics
   - Examples: "What is BI-RADS?", "How do I interpret this finding?"

2. **report_request** - Request to generate or draft a report
   - Examples: "Draft the findings", "Generate a report", "Write the impression"

3. **evidence_request** - Request for literature or guideline evidence
   - Examples: "What does the literature say?", "Find studies about...", "Evidence for..."

4. **case_analysis** - Request to analyze the current case
   - Examples: "What are the findings?", "Summarize this study", "Analyze the segmentation"

5. **clarification** - Follow-up or clarification to previous response
   - Examples: "What do you mean by...", "Can you explain more?", "Tell me more about..."

6. **greeting** - Social greeting or conversation
   - Examples: "Hello", "Thanks", "Good morning"

7. **segmentation_request** - Request to segment anatomical structures
   - Examples: "Segment the liver", "Outline the tumor", "Find all organs"

8. **save_request** - Request to save/export a segmentation
   - Examples: "Save as NIfTI", "Export to PACS", "Save this segmentation"

9. **batch_request** - Request to process multiple images
   - Examples: "Segment liver in all CTs", "Batch process all studies"

10. **session_load** - Request to load previous work
    - Examples: "Load yesterday's study", "Continue where I left off"

11. **edit_request** - Request to edit a segmentation
    - Examples: "Make it bigger", "Shrink the liver", "Smooth the edges"

12. **confirm_action** - Confirming a pending action
    - Examples: "Yes", "Accept", "Looks good", "Confirm"

13. **reject_action** - Rejecting a pending action
    - Examples: "No", "Reject", "Try again", "Cancel"

Respond with a single word matching one of the intent names above.
"""
