# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Report generation agents for different imaging modalities.
"""

from .base_agent import BaseReportAgent
from .breast_agent import BreastAnalysisAgent
from .chestxray_agent import ChestXrayAnalysisAgent
from .medgemma_agent import MedGemmaReportAgent
from .triaging_agent import TriagingAgent
from .triage_rules import TriageLevel, TriageRulesEngine

# Longitudinal agents
from .longitudinal_base_agent import BaseLongitudinalReportAgent
from .chest_longitudinal_agent import ChestLongitudinalAgent
from .breast_longitudinal_agent import BreastLongitudinalAgent
from .abdomen_longitudinal_agent import AbdomenLongitudinalAgent

__all__ = [
    # Base agents
    "BaseReportAgent",
    "BaseLongitudinalReportAgent",
    # Single-study agents
    "BreastAnalysisAgent",
    "ChestXrayAnalysisAgent",
    "MedGemmaReportAgent",
    # Longitudinal agents
    "ChestLongitudinalAgent",
    "BreastLongitudinalAgent",
    "AbdomenLongitudinalAgent",
    # Triage
    "TriagingAgent",
    "TriageLevel",
    "TriageRulesEngine",
]
