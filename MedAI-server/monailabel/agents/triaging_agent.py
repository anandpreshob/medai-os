# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Triaging Agent for Radiologist Worklist Prioritization.

Implements a hybrid rules-based + LLM approach for prioritizing radiology studies.
Uses deterministic rules for STAT/URGENT classification and LLM for fine-tuning
the ordering of remaining cases.
"""

import logging
import os
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .triage_rules import TriageLevel, TriageRulesEngine

logger = logging.getLogger(__name__)

# LangChain imports - optional, graceful fallback if not available
try:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser
    from langchain_google_genai import ChatGoogleGenerativeAI
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False
    logger.warning("LangChain not available. LLM-based triage refinement will be disabled.")


# Pydantic models for structured LLM output
class TriagedStudy(BaseModel):
    """Structured output for a single triaged study."""
    studyUID: str = Field(description="The study instance UID")
    priorityScore: float = Field(description="Priority score from 0-100, higher is more urgent")
    rationale: str = Field(description="Brief explanation for the priority ranking")
    keyFactors: List[str] = Field(description="Key factors that influenced the ranking")


class TriageRefinementOutput(BaseModel):
    """Structured output for LLM triage refinement."""
    refinedStudies: List[TriagedStudy] = Field(
        description="Studies with refined priority scores and rationales"
    )


# System prompt for LLM-based triage refinement
TRIAGE_SYSTEM_PROMPT = """You are an expert radiology triaging assistant helping prioritize patient studies for radiologist review.

Your role is to fine-tune the ordering of studies within the same priority tier (e.g., among ROUTINE studies).
The deterministic rules have already classified STAT and URGENT cases. You are refining the relative priority within each tier.

## Priority Factors (Highest to Lowest Importance)

1. **Clinical Acuity**: Acute symptoms, life-threatening conditions, rapid deterioration
2. **AI Detection Findings**: Pre-computed AI analysis with abnormality detection
3. **Study Context**: Reason for exam, referring specialty (ER > Inpatient > Outpatient)
4. **Patient Factors**: ICU/hospitalized patients > floor > outpatient, comorbidities
5. **Symptoms Severity**: Active symptoms vs asymptomatic screening
6. **Study Age**: Older pending studies may need attention (>24h delay is concerning)
7. **Modality Context**: CT/X-ray for acute indications typically more urgent than MRI

## AI Detection Findings (IMPORTANT)

When AI detections are provided for a study:
- **Prioritize studies with critical findings**: pneumothorax, large effusion, widened mediastinum
- **Weight by confidence**: >90% = very reliable, 80-90% = reliable, <80% = suggestive
- **Multiple abnormalities**: Studies with 3+ findings deserve elevated attention
- **Routine study with significant AI findings**: Should be given higher priority
- **Cross-reference with clinical context**: AI findings matching symptoms are more concerning

Detection findings are formatted as: "label (confidence%)"
Example: "Cardiomegaly (92%), Pleural Effusion (85%)"

## Output Instructions

For each study, provide:
- A refined priority score (0-100 scale within the tier)
- A brief rationale explaining the key factors
- List the most important factors that influenced your decision

## Important Notes

- Do NOT change the triage level (STAT/URGENT/SEMI_URGENT/ROUTINE) - only refine ordering within tiers
- Be consistent in your scoring approach
- Consider the full clinical picture, not just individual symptoms
- Patient safety is paramount - when uncertain, err on the side of higher priority
- AI detections are pre-computed and should be trusted, but always correlate with clinical context
"""


class TriagingAgent:
    """
    AI-powered triaging agent for radiology worklist prioritization.

    Combines deterministic rules for reliable STAT/URGENT classification
    with LLM-based refinement for fine-tuning study ordering.
    """

    def __init__(self, use_llm: bool = True, model_name: str = "gemini-2.0-flash"):
        """
        Initialize the triaging agent.

        Args:
            use_llm: Whether to use LLM for refinement (requires API key)
            model_name: The LLM model to use for refinement
        """
        self.rules_engine = TriageRulesEngine()
        self.use_llm = use_llm and LANGCHAIN_AVAILABLE
        self.model_name = model_name
        self._llm = None
        self._chain = None

        if self.use_llm:
            self._initialize_llm()

    def _initialize_llm(self) -> None:
        """Initialize the LangChain LLM and chain."""
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

        if not api_key:
            logger.warning("No Google API key found. LLM refinement will be disabled.")
            self.use_llm = False
            return

        try:
            self._llm = ChatGoogleGenerativeAI(
                model=self.model_name,
                google_api_key=api_key,
                temperature=0.3,  # Low temperature for consistent outputs
            )

            # Create output parser
            self._parser = PydanticOutputParser(pydantic_object=TriageRefinementOutput)

            # Create prompt template
            self._prompt = ChatPromptTemplate.from_messages([
                ("system", TRIAGE_SYSTEM_PROMPT),
                ("human", """Please refine the priority ordering for the following studies within the {tier} tier.

Studies to prioritize:
{studies_json}

{format_instructions}

Provide refined priority scores and rationales for each study.""")
            ])

            logger.info(f"LLM initialized successfully with model: {self.model_name}")

        except Exception as e:
            logger.error(f"Failed to initialize LLM: {e}")
            self.use_llm = False

    def triage_studies(
        self,
        studies: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Triage a batch of studies.

        Args:
            studies: List of study dictionaries containing:
                - studyUID: Study instance UID
                - patientName: Patient name
                - modality: Imaging modality
                - studyDescription: Study description
                - studyDate: Study date
                - reasonForVisit: Clinical reason (optional)
                - urgencyFlag: Explicit urgency flag (optional)
                - patientHistory: Patient history (optional)

        Returns:
            Dictionary with:
                - triagedStudies: List of studies with priority info
                - statCount: Number of STAT studies
                - urgentCount: Number of URGENT studies
                - semiUrgentCount: Number of SEMI_URGENT studies
                - routineCount: Number of ROUTINE studies
                - totalProcessed: Total number of studies processed
        """
        # Step 1: Apply rules to all studies
        triaged_studies = []
        level_counts = {
            "STAT": 0,
            "URGENT": 0,
            "SEMI_URGENT": 0,
            "ROUTINE": 0,
        }

        for study in studies:
            level, score, rules = self.rules_engine.apply_rules(study)
            level_counts[level.value] += 1

            triaged_study = {
                "studyUID": study.get("studyUID", ""),
                "patientName": study.get("patientName", "Unknown"),
                "patientID": study.get("patientID", ""),
                "modality": study.get("modality", ""),
                "studyDescription": study.get("studyDescription", ""),
                "studyDate": study.get("studyDate", ""),
                "triageLevel": level.value,
                "priorityScore": score,
                "rulesApplied": rules,
                "rationale": self._generate_rules_rationale(level, rules),
                "keyFactors": self._extract_key_factors(rules, study),
                # Pass through clinical context for display
                "reasonForVisit": study.get("reasonForVisit", ""),
                "patientHistory": study.get("patientHistory", ""),
                "symptoms": study.get("symptoms", ""),
                "patientLocation": study.get("patientLocation", ""),
            }
            triaged_studies.append(triaged_study)

        # Step 2: Optionally refine ordering within tiers using LLM
        if self.use_llm and len(triaged_studies) > 1:
            triaged_studies = self._llm_refine_ordering(triaged_studies)

        # Step 3: Sort and assign final ranks
        triaged_studies = self.rules_engine.sort_by_priority(triaged_studies)

        return {
            "success": True,
            "triagedStudies": triaged_studies,
            "statCount": level_counts["STAT"],
            "urgentCount": level_counts["URGENT"],
            "semiUrgentCount": level_counts["SEMI_URGENT"],
            "routineCount": level_counts["ROUTINE"],
            "totalProcessed": len(studies),
        }

    def _generate_rules_rationale(
        self,
        level: TriageLevel,
        rules: List[str]
    ) -> str:
        """Generate a human-readable rationale from applied rules."""
        if not rules:
            return "Default classification"

        rationale_parts = []

        for rule in rules:
            if rule.startswith("EXPLICIT_"):
                flag = rule.replace("EXPLICIT_", "").replace("_FLAG", "")
                rationale_parts.append(f"Explicit {flag} flag set")
            elif rule.startswith("STAT_KEYWORD:"):
                keyword = rule.split(":")[-1].strip("\\b")
                rationale_parts.append(f"Critical keyword detected: '{keyword}'")
            elif rule.startswith("URGENT_KEYWORD:"):
                keyword = rule.split(":")[-1].strip("\\b")
                rationale_parts.append(f"Urgent indicator: '{keyword}'")
            elif rule.startswith("CRITICAL_LOCATION:"):
                location = rule.split(":")[-1]
                rationale_parts.append(f"Patient in critical care area: {location}")
            elif rule.startswith("URGENT_LOCATION:"):
                location = rule.split(":")[-1]
                rationale_parts.append(f"Patient in urgent care area: {location}")
            elif rule.startswith("MODALITY_PRIORITY:"):
                mod_info = rule.split(":")[-1]
                rationale_parts.append(f"Modality priority factor: {mod_info}")
            elif rule.startswith("STUDY_AGE:"):
                age_info = rule.split(":")[-1]
                rationale_parts.append(f"Study pending for {age_info}")
            elif rule == "DEFAULT_ROUTINE":
                rationale_parts.append("No urgent indicators found")

        return "; ".join(rationale_parts) if rationale_parts else "Classified as routine"

    def _extract_key_factors(
        self,
        rules: List[str],
        study: Dict[str, Any]
    ) -> List[str]:
        """Extract key factors that influenced the triage decision."""
        factors = []

        # Extract from rules
        for rule in rules:
            if "KEYWORD:" in rule or "FLAG" in rule:
                keyword = rule.split(":")[-1] if ":" in rule else rule
                factors.append(keyword.strip("\\b").replace("_", " ").title())
            elif "LOCATION:" in rule:
                factors.append(f"Location: {rule.split(':')[-1]}")

        # Add clinical factors if present
        if study.get("symptoms"):
            factors.append(f"Symptoms: {study['symptoms'][:50]}")
        if study.get("patientLocation"):
            if "icu" in study["patientLocation"].lower():
                factors.append("ICU patient")
            elif "ed" in study["patientLocation"].lower() or "er" in study["patientLocation"].lower():
                factors.append("Emergency department")

        return factors[:5]  # Limit to top 5 factors

    def _llm_refine_ordering(
        self,
        studies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Use LLM to refine ordering within priority tiers.

        Only refines SEMI_URGENT and ROUTINE tiers where there's more ambiguity.
        STAT and URGENT are left as-is since rules are definitive.
        """
        if not self._llm or not self._prompt:
            return studies

        # Group studies by tier
        tiers = {
            "STAT": [],
            "URGENT": [],
            "SEMI_URGENT": [],
            "ROUTINE": [],
        }

        for study in studies:
            tier = study.get("triageLevel", "ROUTINE")
            tiers[tier].append(study)

        # Only refine SEMI_URGENT and ROUTINE tiers with LLM
        for tier_name in ["SEMI_URGENT", "ROUTINE"]:
            tier_studies = tiers[tier_name]
            if len(tier_studies) <= 1:
                continue

            try:
                refined = self._refine_tier(tier_name, tier_studies)
                tiers[tier_name] = refined
            except Exception as e:
                logger.warning(f"LLM refinement failed for {tier_name}: {e}")
                # Keep original ordering on failure

        # Recombine all tiers
        all_studies = (
            tiers["STAT"] +
            tiers["URGENT"] +
            tiers["SEMI_URGENT"] +
            tiers["ROUTINE"]
        )

        return all_studies

    def _format_detections_for_llm(
        self,
        detections: Optional[List[Dict[str, Any]]]
    ) -> str:
        """Format AI detections into a human-readable string for LLM."""
        if not detections:
            return "No AI detections"

        # Filter to high-confidence findings (80%+)
        significant = [
            d for d in detections
            if d.get("confidence", 0) >= 0.8
        ]

        if not significant:
            return "No significant AI findings"

        # Format as "label (confidence%)"
        formatted = [
            f"{d.get('label', 'Unknown')} ({d.get('confidence', 0):.0%})"
            for d in significant[:5]  # Limit to top 5
        ]

        return ", ".join(formatted)

    def _refine_tier(
        self,
        tier: str,
        studies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Refine ordering within a single tier using LLM."""
        import json

        # Prepare study summaries for LLM
        study_summaries = []
        for s in studies:
            # Format AI detections for LLM context
            detections = s.get("detections") or []
            ai_findings = self._format_detections_for_llm(detections)

            summary = {
                "studyUID": s["studyUID"],
                "patientName": s.get("patientName", "Unknown"),
                "modality": s.get("modality", ""),
                "studyDescription": s.get("studyDescription", ""),
                "reasonForVisit": s.get("reasonForVisit", ""),
                "symptoms": s.get("symptoms", ""),
                "patientLocation": s.get("patientLocation", ""),
                "currentScore": s.get("priorityScore", 50),
                "aiDetections": ai_findings,
            }
            study_summaries.append(summary)

        # Format the prompt
        prompt_value = self._prompt.format_messages(
            tier=tier,
            studies_json=json.dumps(study_summaries, indent=2),
            format_instructions=self._parser.get_format_instructions(),
        )

        # Call LLM
        response = self._llm.invoke(prompt_value)

        # Parse response
        try:
            parsed = self._parser.parse(response.content)

            # Update studies with refined scores
            uid_to_refined = {r.studyUID: r for r in parsed.refinedStudies}

            for study in studies:
                uid = study["studyUID"]
                if uid in uid_to_refined:
                    refined = uid_to_refined[uid]
                    study["priorityScore"] = refined.priorityScore
                    study["rationale"] = refined.rationale
                    study["keyFactors"] = refined.keyFactors

        except Exception as e:
            logger.warning(f"Failed to parse LLM response: {e}")

        # Sort by refined score within tier
        studies.sort(key=lambda s: -s.get("priorityScore", 0))

        return studies
