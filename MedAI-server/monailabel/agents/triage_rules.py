# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Triage Rules Engine for Radiologist Worklist Prioritization.

Implements deterministic rule-based classification for STAT and URGENT cases,
following ACR/RSNA guidelines for radiological study prioritization.
"""

import logging
import re
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class TriageLevel(Enum):
    """Priority levels for study triage."""
    STAT = "STAT"           # Immediate attention required
    URGENT = "URGENT"       # Within 24 hours
    SEMI_URGENT = "SEMI_URGENT"  # Within 48 hours
    ROUTINE = "ROUTINE"     # Standard workflow


class TriagePriority:
    """Priority ordering for triage levels (lower = higher priority)."""
    STAT = 1
    URGENT = 2
    SEMI_URGENT = 3
    ROUTINE = 4


# Keyword patterns for each triage level
STAT_KEYWORDS = [
    r"\bstat\b",
    r"\btrauma\b",
    r"\bstroke\b",
    r"\bcode\b",
    r"\bemergent\b",
    r"\bhemorrhage\b",
    r"\bbleeding\b",
    r"\baortic\s*dissection\b",
    r"\bpulmonary\s*embolism\b",
    r"\bpe\s*protocol\b",
    r"\btension\s*pneumo",
    r"\bcardiac\s*arrest\b",
    r"\bcrash\b",
    r"\bgunshot\b",
    r"\bstab\b",
    r"\bseizure\b",
    r"\baltered\s*mental\b",
    r"\bunresponsive\b",
    r"\bcritical\b",
]

URGENT_KEYWORDS = [
    r"\burgent\b",
    r"\bacute\b",
    r"\brule\s*out\s*pe\b",
    r"\br/o\s*pe\b",
    r"\bappendicitis\b",
    r"\bobstruction\b",
    r"\bileus\b",
    r"\bchest\s*pain\b",
    r"\bsob\b",
    r"\bshortness\s*of\s*breath\b",
    r"\bdyspnea\b",
    r"\brespiratory\s*distress\b",
    r"\bsuspected\s*fracture\b",
    r"\bfall\b",
    r"\bfever\b",
    r"\bsepsis\b",
    r"\binfection\b",
    r"\babdominal\s*pain\b",
    r"\bhead\s*injury\b",
    r"\ber\b",
    r"\bed\b",
    r"\bemergency\b",
]

SEMI_URGENT_KEYWORDS = [
    r"\bfollow[\s-]*up\b",
    r"\binterval\b",
    r"\bcompare\b",
    r"\bprogression\b",
    r"\bresponse\s*to\s*treatment\b",
    r"\bstaging\b",
    r"\brestaging\b",
    r"\bsuspicious\b",
    r"\bnodule\b",
    r"\bmass\b",
    r"\blesion\b",
]

# Modality priority scores (higher modalities often more acute)
MODALITY_PRIORITY = {
    "CT": 1,    # Often acute/emergent
    "CR": 2,    # Chest X-ray often stat
    "DX": 2,    # Digital X-ray
    "XR": 2,    # X-ray
    "US": 3,    # Ultrasound
    "MR": 4,    # MRI typically less acute (longer exam)
    "MG": 5,    # Mammography - scheduled
    "NM": 5,    # Nuclear medicine
    "PT": 5,    # PET
}

# Patient location priority (higher risk locations)
LOCATION_PRIORITY = {
    "icu": 1,
    "intensive care": 1,
    "er": 2,
    "ed": 2,
    "emergency": 2,
    "trauma": 1,
    "or": 1,
    "operating room": 1,
    "pacu": 2,
    "inpatient": 3,
    "floor": 3,
    "outpatient": 5,
    "clinic": 5,
}

# AI Detection-based triage rules
# STAT-level findings (auto-elevate at 85%+ confidence)
STAT_DETECTION_LABELS = [
    "pneumothorax",
    "tension pneumothorax",
    "large pleural effusion",
    "widened mediastinum",
    "aortic dissection",
    "massive hemothorax",
]

# URGENT-level findings (elevate at 80%+ confidence)
URGENT_DETECTION_LABELS = [
    "cardiomegaly",
    "pulmonary edema",
    "consolidation",
    "pneumonia",
    "lung mass",
    "pleural effusion",
    "rib fracture",
    "lung nodule",
    "atelectasis",
    "infiltrate",
]

# Confidence thresholds for detection-based rules
STAT_DETECTION_THRESHOLD = 0.85
URGENT_DETECTION_THRESHOLD = 0.80
MULTI_FINDING_THRESHOLD = 0.80
MULTI_FINDING_COUNT = 3  # Number of findings to trigger boost
MULTI_FINDING_SCORE_BOOST = 5  # Points to add for multiple findings


class TriageRulesEngine:
    """
    Deterministic rules engine for triaging radiology studies.

    Applies keyword matching, contextual rules, and AI detection findings
    to classify studies into priority tiers. Designed to catch STAT/URGENT
    cases reliably while allowing LLM to fine-tune ordering within lower tiers.
    """

    def __init__(self):
        """Initialize the rules engine with compiled regex patterns."""
        self.stat_patterns = [re.compile(p, re.IGNORECASE) for p in STAT_KEYWORDS]
        self.urgent_patterns = [re.compile(p, re.IGNORECASE) for p in URGENT_KEYWORDS]
        self.semi_urgent_patterns = [re.compile(p, re.IGNORECASE) for p in SEMI_URGENT_KEYWORDS]

    def _analyze_detections(
        self,
        detections: Optional[List[Dict[str, Any]]]
    ) -> Tuple[Optional[TriageLevel], float, List[str]]:
        """
        Analyze AI detection findings for triage elevation.

        Args:
            detections: List of AI detection findings with label and confidence

        Returns:
            Tuple of (triage_level or None, score_boost, rules_applied)
        """
        if not detections:
            return None, 0.0, []

        rules_applied: List[str] = []
        score_boost = 0.0
        suggested_level: Optional[TriageLevel] = None

        # Normalize labels for comparison
        stat_labels_lower = [l.lower() for l in STAT_DETECTION_LABELS]
        urgent_labels_lower = [l.lower() for l in URGENT_DETECTION_LABELS]

        high_confidence_findings = 0

        for det in detections:
            label = det.get("label", "").lower()
            confidence = det.get("confidence", 0)

            # Check for STAT-level findings
            if confidence >= STAT_DETECTION_THRESHOLD:
                for stat_label in stat_labels_lower:
                    if stat_label in label or label in stat_label:
                        rules_applied.append(
                            f"DETECTION_STAT:{det.get('label')}@{confidence:.0%}"
                        )
                        suggested_level = TriageLevel.STAT
                        logger.info(
                            f"STAT detection found: {det.get('label')} ({confidence:.0%})"
                        )
                        return suggested_level, 15.0, rules_applied

            # Check for URGENT-level findings
            if confidence >= URGENT_DETECTION_THRESHOLD:
                for urgent_label in urgent_labels_lower:
                    if urgent_label in label or label in urgent_label:
                        rules_applied.append(
                            f"DETECTION_URGENT:{det.get('label')}@{confidence:.0%}"
                        )
                        if suggested_level is None:
                            suggested_level = TriageLevel.URGENT
                            score_boost = max(score_boost, 10.0)
                        break

                # Count high-confidence findings
                high_confidence_findings += 1

        # Multiple findings boost
        if high_confidence_findings >= MULTI_FINDING_COUNT:
            rules_applied.append(
                f"DETECTION_MULTI:{high_confidence_findings}_findings"
            )
            score_boost += MULTI_FINDING_SCORE_BOOST
            logger.info(
                f"Multiple AI findings ({high_confidence_findings}) detected, boosting score"
            )

        return suggested_level, score_boost, rules_applied

    def apply_rules(
        self,
        study: Dict[str, Any]
    ) -> Tuple[TriageLevel, float, List[str]]:
        """
        Apply triage rules to a single study.

        Args:
            study: Dictionary containing study information:
                - studyDescription: Study description text
                - modality: Imaging modality (CT, MR, etc.)
                - reasonForVisit: Clinical reason/indication
                - urgencyFlag: Explicit urgency flag if present
                - patientHistory: Patient clinical history
                - patientLocation: Where patient is located
                - detections: Optional list of AI detection findings

        Returns:
            Tuple of (triage_level, priority_score, rules_applied)
        """
        rules_applied: List[str] = []
        base_score = 50.0  # Default middle score
        detection_score_boost = 0.0

        # Combine all text fields for keyword matching
        text_fields = [
            study.get("studyDescription", ""),
            study.get("reasonForVisit", ""),
            study.get("patientHistory", ""),
            study.get("symptoms", ""),
        ]
        combined_text = " ".join(str(f) for f in text_fields if f)

        # Check explicit urgency flag first
        urgency_flag = study.get("urgencyFlag", "").upper()
        if urgency_flag == "STAT":
            rules_applied.append("EXPLICIT_STAT_FLAG")
            return TriageLevel.STAT, 95.0, rules_applied
        elif urgency_flag == "URGENT":
            rules_applied.append("EXPLICIT_URGENT_FLAG")
            return TriageLevel.URGENT, 80.0, rules_applied

        # Check AI detections BEFORE keyword matching (can override to STAT)
        detections = study.get("detections")
        if detections:
            det_level, det_boost, det_rules = self._analyze_detections(detections)
            rules_applied.extend(det_rules)
            detection_score_boost = det_boost

            # If STAT-level detection found, return immediately
            if det_level == TriageLevel.STAT:
                return TriageLevel.STAT, 92.0, rules_applied

        # Check STAT keywords
        for i, pattern in enumerate(self.stat_patterns):
            if pattern.search(combined_text):
                rules_applied.append(f"STAT_KEYWORD:{STAT_KEYWORDS[i]}")
                return TriageLevel.STAT, 90.0, rules_applied

        # Check patient location for critical areas
        location = study.get("patientLocation", "").lower()
        for loc_key, priority in LOCATION_PRIORITY.items():
            if loc_key in location:
                if priority == 1:  # ICU, Trauma, OR
                    rules_applied.append(f"CRITICAL_LOCATION:{loc_key.upper()}")
                    # Don't auto-classify as STAT, but boost score significantly
                    base_score = 85.0
                    break
                elif priority == 2:  # ER, ED
                    rules_applied.append(f"URGENT_LOCATION:{loc_key.upper()}")
                    base_score = 75.0
                    break

        # Check URGENT keywords
        for i, pattern in enumerate(self.urgent_patterns):
            if pattern.search(combined_text):
                rules_applied.append(f"URGENT_KEYWORD:{URGENT_KEYWORDS[i]}")
                # If location already bumped score, this confirms URGENT
                if base_score >= 75.0:
                    return TriageLevel.URGENT, base_score + 5.0 + detection_score_boost, rules_applied
                return TriageLevel.URGENT, 75.0 + detection_score_boost, rules_applied

        # If AI detection suggested URGENT but no keywords matched, still elevate
        if detections:
            det_level, _, _ = self._analyze_detections(detections)
            if det_level == TriageLevel.URGENT:
                return TriageLevel.URGENT, 78.0 + detection_score_boost, rules_applied

        # Check SEMI_URGENT keywords
        for i, pattern in enumerate(self.semi_urgent_patterns):
            if pattern.search(combined_text):
                rules_applied.append(f"SEMI_URGENT_KEYWORD:{SEMI_URGENT_KEYWORDS[i]}")
                return TriageLevel.SEMI_URGENT, 55.0 + detection_score_boost, rules_applied

        # Apply modality scoring
        modality = study.get("modality", "").upper()
        if modality in MODALITY_PRIORITY:
            mod_priority = MODALITY_PRIORITY[modality]
            rules_applied.append(f"MODALITY_PRIORITY:{modality}={mod_priority}")
            # Adjust base score based on modality
            base_score = base_score + (5 - mod_priority) * 2

        # Check study age (older pending studies get priority bump)
        study_date = study.get("studyDate", "")
        if study_date:
            try:
                from datetime import datetime
                study_dt = datetime.strptime(study_date, "%Y%m%d")
                age_days = (datetime.now() - study_dt).days
                if age_days > 3:
                    rules_applied.append(f"STUDY_AGE:{age_days}_days")
                    base_score += min(age_days * 2, 10)  # Cap at +10
            except (ValueError, TypeError):
                pass

        # Add detection score boost to base score
        base_score += detection_score_boost

        # Default to ROUTINE
        if not rules_applied:
            rules_applied.append("DEFAULT_ROUTINE")

        return TriageLevel.ROUTINE, base_score, rules_applied

    def batch_apply_rules(
        self,
        studies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Apply triage rules to a batch of studies.

        Args:
            studies: List of study dictionaries

        Returns:
            List of results with triage level, score, and rules for each study
        """
        results = []
        for study in studies:
            level, score, rules = self.apply_rules(study)
            results.append({
                "studyUID": study.get("studyUID", ""),
                "triageLevel": level.value,
                "priorityScore": score,
                "rulesApplied": rules,
            })
        return results

    def sort_by_priority(
        self,
        triaged_studies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Sort studies by triage level and priority score.

        Args:
            triaged_studies: Studies with triageLevel and priorityScore

        Returns:
            Sorted list with priorityRank assigned
        """
        # Define level ordering
        level_order = {
            "STAT": 1,
            "URGENT": 2,
            "SEMI_URGENT": 3,
            "ROUTINE": 4,
        }

        # Sort by level first, then by score descending
        sorted_studies = sorted(
            triaged_studies,
            key=lambda s: (
                level_order.get(s.get("triageLevel", "ROUTINE"), 4),
                -s.get("priorityScore", 0)
            )
        )

        # Assign priority ranks
        for i, study in enumerate(sorted_studies):
            study["priorityRank"] = i + 1

        return sorted_studies
