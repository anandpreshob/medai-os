"""
MedAI Suites Module

Domain-specific workflow bundles for clinical verticals.
"""

from .suite_config import (
    SuiteConfig,
    SuiteTask,
    SuiteAnalytics,
    SuiteExports,
    SuiteDetectionHints,
    StructureNaming,
)
from .registry import SuiteRegistry, get_suite_registry
from .model_resolver import ModelResolver, get_model_resolver
from .naming import TG263Naming, get_tg263_name, validate_tg263_name

__all__ = [
    # Config classes
    "SuiteConfig",
    "SuiteTask",
    "SuiteAnalytics",
    "SuiteExports",
    "SuiteDetectionHints",
    "StructureNaming",
    # Registry
    "SuiteRegistry",
    "get_suite_registry",
    # Model resolution
    "ModelResolver",
    "get_model_resolver",
    # Naming
    "TG263Naming",
    "get_tg263_name",
    "validate_tg263_name",
]
