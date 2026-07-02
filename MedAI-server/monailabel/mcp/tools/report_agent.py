# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Report Agent Tool - LLM-to-LLM tool for drafting radiology reports.
"""

import json
import logging
from typing import List, Optional

from ..schemas import (
    CaseContextOutput,
    PubMedArticleItem,
    RAGResultItem,
    ReportAgentInput,
    ReportAgentOutput,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


# System prompts for different report sections
FINDINGS_SYSTEM_PROMPT = """You are an expert radiology report assistant. Your task is to draft the FINDINGS section of a radiology report based on the provided case context, imaging data, and clinical guidelines.

Guidelines for drafting findings:
1. Use precise anatomical terminology
2. Describe observations objectively and systematically
3. Include quantitative measurements when available
4. Reference relevant guidelines (e.g., BI-RADS, RSNA templates) when applicable
5. Organize findings by anatomical region or system
6. Use standard reporting conventions for the modality

Important: This is a draft for radiologist review. Be thorough but concise."""

IMPRESSION_SYSTEM_PROMPT = """You are an expert radiology report assistant. Your task is to draft the IMPRESSION section of a radiology report.

The impression should:
1. Summarize the most clinically significant findings
2. Provide a clear assessment or differential diagnosis when appropriate
3. Use standardized classification systems (BI-RADS, TI-RADS, etc.) if applicable
4. List findings in order of clinical significance
5. Be concise - typically 2-5 key points

Important: This is a draft for radiologist review. Focus on actionable conclusions."""

FULL_REPORT_SYSTEM_PROMPT = """You are an expert radiology report assistant. Your task is to draft a complete structured radiology report.

The report should include:
1. CLINICAL HISTORY: Brief indication for the exam
2. TECHNIQUE: Imaging protocol and parameters
3. COMPARISON: Prior studies if available
4. FINDINGS: Systematic description of observations
5. IMPRESSION: Summary of key findings and assessment
6. RECOMMENDATIONS: Follow-up or additional workup if indicated

Format each section with a header (e.g., "## FINDINGS").

Guidelines:
- Use precise medical terminology
- Include quantitative measurements
- Reference clinical guidelines when applicable
- Be thorough but concise

Important: This is a draft for radiologist review."""


class ReportAgentTool(MCPTool):
    """
    MCP tool for drafting radiology report sections.

    This is an LLM-to-LLM tool - it calls another LLM to generate
    report content based on case context, guidelines, and evidence.
    """

    name = "report_agent"
    description = (
        "Draft sections of a radiology report using case context, guidelines, and evidence. "
        "Can generate findings, impression, or a full structured report. "
        "Incorporates relevant guidelines and cites supporting evidence. "
        "Output is always a DRAFT requiring radiologist review."
    )
    input_schema = ReportAgentInput
    output_schema = ReportAgentOutput

    def __init__(self):
        super().__init__()
        self._llm_client = None

    def _get_llm_client(self):
        """Lazy-load the LLM client."""
        if self._llm_client is None:
            from llm.llm_client import LLMClient
            self._llm_client = LLMClient()
        return self._llm_client

    def _get_system_prompt(self, task: str) -> str:
        """Get the appropriate system prompt for the task."""
        if task == "draft_findings":
            return FINDINGS_SYSTEM_PROMPT
        elif task == "draft_impression":
            return IMPRESSION_SYSTEM_PROMPT
        else:  # draft_full_report
            return FULL_REPORT_SYSTEM_PROMPT

    def _build_context_prompt(
        self,
        case_context: CaseContextOutput,
        guidelines: Optional[List[RAGResultItem]],
        evidence: Optional[List[PubMedArticleItem]],
        radiologist_notes: Optional[str],
        report_style: str,
    ) -> str:
        """Build the user prompt with all context."""
        lines = []

        # Case context
        lines.append("## Case Information")
        lines.append(f"- Modality: {case_context.modality}")
        if case_context.body_region:
            lines.append(f"- Body Region: {case_context.body_region}")
        if case_context.study_description:
            lines.append(f"- Study Description: {case_context.study_description}")
        if case_context.study_date:
            lines.append(f"- Study Date: {case_context.study_date}")
        if case_context.is_longitudinal:
            lines.append("- **Longitudinal Study** - Compare with prior exams")
            if case_context.prior_studies:
                lines.append(f"- Prior Studies: {', '.join(case_context.prior_studies)}")

        # Segmentations
        if case_context.segmentations:
            lines.append("\n## Segmentations")
            for seg in case_context.segmentations:
                vol_str = ""
                if seg.volume_cm3:
                    vol_str = f" ({seg.volume_cm3:.2f} cm³)"
                elif seg.volume_ml:
                    vol_str = f" ({seg.volume_ml:.2f} mL)"
                lines.append(f"- {seg.label}{vol_str}")

        # Volumetrics
        if case_context.volumetrics_summary:
            lines.append("\n## Volumetric Measurements")
            lines.append(json.dumps(case_context.volumetrics_summary, indent=2))

        # Detections
        if case_context.detections:
            lines.append("\n## AI Detections")
            for det in case_context.detections:
                conf_pct = det.confidence * 100
                loc_str = f" at {det.location}" if det.location else ""
                lines.append(f"- {det.label}: {conf_pct:.1f}% confidence{loc_str}")

        # Radiologist notes
        if radiologist_notes:
            lines.append("\n## Radiologist Notes")
            lines.append(radiologist_notes)

        # Guidelines
        if guidelines:
            lines.append("\n## Relevant Guidelines")
            for i, guide in enumerate(guidelines[:5], 1):  # Limit to top 5
                lines.append(f"\n### Guideline {i}: {guide.title or 'Untitled'}")
                # Truncate content if too long
                content = guide.content[:500] + "..." if len(guide.content) > 500 else guide.content
                lines.append(content)

        # Evidence
        if evidence:
            lines.append("\n## Supporting Evidence (PubMed)")
            for i, article in enumerate(evidence[:5], 1):  # Limit to top 5
                lines.append(f"\n### [{i}] {article.title}")
                lines.append(f"- Citation: {article.citation}")
                if article.abstract:
                    abstract = article.abstract[:300] + "..." if len(article.abstract) > 300 else article.abstract
                    lines.append(f"- Abstract: {abstract}")

        # Style instruction
        lines.append(f"\n## Report Style: {report_style}")
        if report_style == "structured":
            lines.append("Use bullet points and clear section headers.")
        elif report_style == "concise":
            lines.append("Be brief and focus on key findings only.")
        else:  # standard
            lines.append("Use traditional prose format.")

        return "\n".join(lines)

    async def execute(self, input_data: ReportAgentInput) -> ReportAgentOutput:
        """
        Execute report drafting with LLM.

        Args:
            input_data: Report drafting parameters

        Returns:
            Generated report section(s)
        """
        try:
            llm_client = self._get_llm_client()

            # Build prompts
            system_prompt = self._get_system_prompt(input_data.task)
            user_prompt = self._build_context_prompt(
                case_context=input_data.case_context,
                guidelines=input_data.guidelines,
                evidence=input_data.evidence,
                radiologist_notes=input_data.radiologist_notes,
                report_style=input_data.report_style,
            )

            logger.info(f"Generating report draft for task: {input_data.task}")

            # Call LLM
            result = llm_client.generate_report(
                system_prompt=system_prompt,
                user_message=user_prompt,
            )

            # Extract content from result
            sections = result.get("sections", {})
            raw_response = result.get("rawResponse", "")

            # Determine section name and content based on task
            if input_data.task == "draft_findings":
                section_name = "Findings"
                content = sections.get("findings") or raw_response
            elif input_data.task == "draft_impression":
                section_name = "Impression"
                content = sections.get("impression") or raw_response
            else:  # draft_full_report
                section_name = "Full Report"
                content = raw_response

            # Build citations and references lists
            citations_used = []
            if input_data.evidence:
                for article in input_data.evidence:
                    if article.title.lower() in content.lower():
                        citations_used.append(article.citation)

            guidelines_referenced = []
            if input_data.guidelines:
                for guide in input_data.guidelines:
                    if guide.title and guide.title.lower() in content.lower():
                        guidelines_referenced.append(guide.title)

            return ReportAgentOutput(
                section_name=section_name,
                content=content,
                citations_used=citations_used,
                guidelines_referenced=guidelines_referenced,
                confidence_note="This is an AI-generated draft requiring radiologist review.",
            )

        except ImportError as e:
            logger.error(f"LLM client not available: {e}")
            return ReportAgentOutput(
                section_name=input_data.task,
                content="Error: LLM client not configured",
                citations_used=[],
                guidelines_referenced=[],
                confidence_note="Failed to generate report draft",
            )

        except Exception as e:
            logger.exception(f"Report generation failed: {e}")
            return ReportAgentOutput(
                section_name=input_data.task,
                content=f"Error generating report: {str(e)}",
                citations_used=[],
                guidelines_referenced=[],
                confidence_note="Failed to generate report draft",
            )
