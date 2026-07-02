# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Evidence Summarizer Tool - LLM-to-LLM tool for synthesizing evidence.
"""

import logging
from typing import List

from ..schemas import (
    EvidenceSummarizerInput,
    EvidenceSummarizerOutput,
    PubMedArticleItem,
    RAGResultItem,
    SemanticScholarPaperItem,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


EVIDENCE_SUMMARIZER_SYSTEM_PROMPT = """You are a medical evidence synthesis expert. Your task is to summarize and synthesize evidence from multiple sources to answer clinical questions.

Guidelines for evidence synthesis:
1. Critically evaluate the quality and relevance of each source
2. Identify areas of consensus and disagreement among sources
3. Prioritize evidence from high-quality sources (systematic reviews, large RCTs)
4. Acknowledge limitations and gaps in the evidence
5. Provide actionable key points
6. Use proper citations

Rate evidence quality as:
- HIGH: Multiple high-quality studies with consistent findings
- MODERATE: Some high-quality evidence or consistent findings from lower-quality studies
- LOW: Limited or conflicting evidence

Always include citations in your summary using [Author Year] format.

Important: This is for clinical decision support. The radiologist makes final decisions."""


class EvidenceSummarizerTool(MCPTool):
    """
    MCP tool for synthesizing evidence from multiple sources.

    This is an LLM-to-LLM tool - it calls another LLM to synthesize
    evidence from PubMed, Semantic Scholar, and local guidelines.
    """

    name = "evidence_summarizer"
    description = (
        "Synthesize evidence from multiple sources (PubMed, Semantic Scholar, local guidelines) "
        "to answer clinical questions. Returns a summary with key points, evidence quality rating, "
        "and citations. Use this to provide evidence-based support for clinical decisions."
    )
    input_schema = EvidenceSummarizerInput
    output_schema = EvidenceSummarizerOutput

    def __init__(self):
        super().__init__()
        self._llm_client = None

    def _get_llm_client(self):
        """Lazy-load the LLM client."""
        if self._llm_client is None:
            from llm.llm_client import LLMClient
            self._llm_client = LLMClient()
        return self._llm_client

    def _build_evidence_prompt(
        self,
        question: str,
        pubmed_articles: List[PubMedArticleItem],
        semantic_scholar_papers: List[SemanticScholarPaperItem],
        local_guidelines: List[RAGResultItem],
        max_length_words: int,
    ) -> str:
        """Build the prompt with all evidence sources."""
        lines = []

        lines.append(f"## Clinical Question\n{question}")
        lines.append(f"\n## Target Summary Length: ~{max_length_words} words")

        # PubMed articles
        if pubmed_articles:
            lines.append("\n## PubMed Articles")
            for i, article in enumerate(pubmed_articles[:10], 1):  # Limit to 10
                lines.append(f"\n### Article {i}")
                lines.append(f"**Title:** {article.title}")
                lines.append(f"**Citation:** {article.citation}")
                if article.abstract:
                    # Truncate very long abstracts
                    abstract = article.abstract
                    if len(abstract) > 500:
                        abstract = abstract[:500] + "..."
                    lines.append(f"**Abstract:** {abstract}")

        # Semantic Scholar papers
        if semantic_scholar_papers:
            lines.append("\n## Academic Papers (Semantic Scholar)")
            for i, paper in enumerate(semantic_scholar_papers[:10], 1):
                lines.append(f"\n### Paper {i}")
                lines.append(f"**Title:** {paper.title}")
                lines.append(f"**Citation:** {paper.citation}")
                lines.append(f"**Citations:** {paper.citation_count}")
                if paper.abstract:
                    abstract = paper.abstract
                    if len(abstract) > 500:
                        abstract = abstract[:500] + "..."
                    lines.append(f"**Abstract:** {abstract}")

        # Local guidelines
        if local_guidelines:
            lines.append("\n## Clinical Guidelines")
            for i, guide in enumerate(local_guidelines[:5], 1):
                lines.append(f"\n### Guideline {i}")
                if guide.title:
                    lines.append(f"**Title:** {guide.title}")
                lines.append(f"**Source Type:** {guide.source_type}")
                # Truncate long content
                content = guide.content
                if len(content) > 800:
                    content = content[:800] + "..."
                lines.append(f"**Content:** {content}")

        # Instructions
        lines.append("\n## Instructions")
        lines.append("""
Please synthesize the evidence above to answer the clinical question. Your response should include:

1. **SUMMARY**: A clear, concise synthesis of the evidence (~{} words)
2. **KEY POINTS**: 3-5 bullet points with the most important takeaways
3. **EVIDENCE QUALITY**: Rate as HIGH, MODERATE, or LOW with justification
4. **LIMITATIONS**: Note any gaps or limitations in the evidence
5. **CITATIONS**: List the sources you referenced

Format your response clearly with these section headers.""".format(max_length_words))

        return "\n".join(lines)

    def _parse_llm_response(
        self,
        response: str,
        pubmed_articles: List[PubMedArticleItem],
        semantic_scholar_papers: List[SemanticScholarPaperItem],
        local_guidelines: List[RAGResultItem],
    ) -> EvidenceSummarizerOutput:
        """Parse the LLM response into structured output."""
        # Default values
        summary = response
        key_points = []
        evidence_quality = "moderate"
        citations = []
        limitations = None

        # Try to parse sections from response
        lines = response.split("\n")
        current_section = None
        section_content = []

        for line in lines:
            line_stripped = line.strip()
            line_upper = line_stripped.upper()

            # Check for section headers
            if "SUMMARY" in line_upper and ("##" in line or "**" in line):
                if current_section == "summary":
                    summary = "\n".join(section_content).strip()
                current_section = "summary"
                section_content = []
            elif "KEY POINTS" in line_upper or "KEY_POINTS" in line_upper:
                if current_section == "summary":
                    summary = "\n".join(section_content).strip()
                current_section = "key_points"
                section_content = []
            elif "EVIDENCE QUALITY" in line_upper or "EVIDENCE_QUALITY" in line_upper:
                current_section = "evidence_quality"
                section_content = []
            elif "LIMITATION" in line_upper:
                current_section = "limitations"
                section_content = []
            elif "CITATION" in line_upper:
                current_section = "citations"
                section_content = []
            elif current_section:
                if line_stripped:
                    section_content.append(line_stripped)

        # Process final section
        if current_section == "summary":
            summary = "\n".join(section_content).strip()

        # Extract key points (bullet points)
        for line in response.split("\n"):
            line = line.strip()
            if line.startswith("- ") or line.startswith("* ") or line.startswith("• "):
                point = line.lstrip("-*• ").strip()
                if point and len(key_points) < 10:
                    key_points.append(point)

        # Determine evidence quality from response
        response_lower = response.lower()
        if "high quality" in response_lower or "strong evidence" in response_lower:
            evidence_quality = "high"
        elif "low quality" in response_lower or "limited evidence" in response_lower:
            evidence_quality = "low"
        else:
            evidence_quality = "moderate"

        # Build citations list from sources used
        all_citations = []
        for article in pubmed_articles:
            all_citations.append(article.citation)
        for paper in semantic_scholar_papers:
            all_citations.append(paper.citation)
        for guide in local_guidelines:
            if guide.title:
                all_citations.append(f"{guide.title} ({guide.source_type})")

        # Extract limitations if found
        if "limitation" in response_lower:
            # Try to extract limitations section
            start_idx = response_lower.find("limitation")
            if start_idx > 0:
                end_idx = response_lower.find("\n\n", start_idx)
                if end_idx > start_idx:
                    limitations = response[start_idx:end_idx].strip()

        return EvidenceSummarizerOutput(
            summary=summary if summary else response,
            key_points=key_points[:5],  # Limit to 5 key points
            evidence_quality=evidence_quality,
            citations=all_citations[:10],  # Limit citations
            limitations=limitations,
        )

    async def execute(
        self, input_data: EvidenceSummarizerInput
    ) -> EvidenceSummarizerOutput:
        """
        Execute evidence synthesis with LLM.

        Args:
            input_data: Evidence sources and question

        Returns:
            Synthesized evidence summary
        """
        try:
            # Check if we have any evidence
            total_sources = (
                len(input_data.pubmed_articles)
                + len(input_data.semantic_scholar_papers)
                + len(input_data.local_guidelines)
            )

            if total_sources == 0:
                return EvidenceSummarizerOutput(
                    summary="No evidence sources provided to synthesize.",
                    key_points=["No evidence available"],
                    evidence_quality="low",
                    citations=[],
                    limitations="No evidence sources were provided for synthesis.",
                )

            llm_client = self._get_llm_client()

            # Build prompt
            user_prompt = self._build_evidence_prompt(
                question=input_data.question,
                pubmed_articles=input_data.pubmed_articles,
                semantic_scholar_papers=input_data.semantic_scholar_papers,
                local_guidelines=input_data.local_guidelines,
                max_length_words=input_data.max_length_words,
            )

            logger.info(
                f"Synthesizing evidence from {total_sources} sources for: "
                f"'{input_data.question[:50]}...'"
            )

            # Call LLM
            result = llm_client.generate_report(
                system_prompt=EVIDENCE_SUMMARIZER_SYSTEM_PROMPT,
                user_message=user_prompt,
            )

            # Parse response
            raw_response = result.get("rawResponse", "")

            return self._parse_llm_response(
                response=raw_response,
                pubmed_articles=input_data.pubmed_articles,
                semantic_scholar_papers=input_data.semantic_scholar_papers,
                local_guidelines=input_data.local_guidelines,
            )

        except ImportError as e:
            logger.error(f"LLM client not available: {e}")
            return EvidenceSummarizerOutput(
                summary="Error: LLM client not configured for evidence synthesis.",
                key_points=[],
                evidence_quality="low",
                citations=[],
                limitations="Failed to synthesize evidence due to configuration error.",
            )

        except Exception as e:
            logger.exception(f"Evidence synthesis failed: {e}")
            return EvidenceSummarizerOutput(
                summary=f"Error synthesizing evidence: {str(e)}",
                key_points=[],
                evidence_quality="low",
                citations=[],
                limitations=f"Synthesis failed: {str(e)}",
            )
