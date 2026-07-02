"""
MedAI Clinical Workflow Suites

Defines clinical workflow suites that map clinical tasks to AI models.
Each suite represents a clinical workflow (e.g., Breast MRI, Brain CT, etc.)
with predefined segmentation tasks, analytics, and export options.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import yaml

logger = logging.getLogger(__name__)

# ============================================================================
# TG-263 Naming Convention Support
# ============================================================================

# Common TG-263 structure names for radiation therapy
TG263_STRUCTURES = {
    # Breast
    "breast_l": "Breast_L",
    "breast_r": "Breast_R",
    "breast": "Breast",
    "chest_wall": "ChestWall",
    "chestwall": "ChestWall",
    "axilla": "Axilla",
    "lymph_node": "LN",
    "ln": "LN",
    # Brain
    "brain": "Brain",
    "brainstem": "Brainstem",
    "brain_stem": "Brainstem",
    "cerebellum": "Cerebellum",
    "hippocampus": "Hippocampus",
    "hippocampus_l": "Hippocampus_L",
    "hippocampus_r": "Hippocampus_R",
    "optic_nerve": "OpticNrv",
    "opticnerve": "OpticNrv",
    "optic_chiasm": "OpticChiasm",
    "opticchiasm": "OpticChiasm",
    "pituitary": "Pituitary",
    "cochlea": "Cochlea",
    "cochlea_l": "Cochlea_L",
    "cochlea_r": "Cochlea_R",
    "lens": "Lens",
    "lens_l": "Lens_L",
    "lens_r": "Lens_R",
    "eye": "Eye",
    "eye_l": "Eye_L",
    "eye_r": "Eye_R",
    "parotid": "Parotid",
    "parotid_l": "Parotid_L",
    "parotid_r": "Parotid_R",
    # Thorax
    "lung": "Lung",
    "lung_l": "Lung_L",
    "lung_r": "Lung_R",
    "heart": "Heart",
    "esophagus": "Esophagus",
    "trachea": "Trachea",
    "spinal_cord": "SpinalCord",
    "spinalcord": "SpinalCord",
    # Abdomen
    "liver": "Liver",
    "spleen": "Spleen",
    "kidney": "Kidney",
    "kidney_l": "Kidney_L",
    "kidney_r": "Kidney_R",
    "stomach": "Stomach",
    "bowel": "Bowel",
    "small_bowel": "SmallBowel",
    "smallbowel": "SmallBowel",
    "large_bowel": "LargeBowel",
    "largebowel": "LargeBowel",
    "pancreas": "Pancreas",
    "duodenum": "Duodenum",
    # Pelvis
    "bladder": "Bladder",
    "rectum": "Rectum",
    "prostate": "Prostate",
    "seminal_vesicle": "SeminalVes",
    "seminalvesicle": "SeminalVes",
    "femur": "Femur",
    "femur_l": "Femur_L",
    "femur_r": "Femur_R",
    "femoral_head": "FemoralHead",
    "femoralhead": "FemoralHead",
    # General
    "skin": "Skin",
    "external": "External",
    "body": "Body",
    "ptv": "PTV",
    "ctv": "CTV",
    "gtv": "GTV",
    "tumor": "Tumor",
}


def get_tg263_name(name: str) -> str:
    """
    Get the TG-263 canonical name for a structure.

    Args:
        name: Input structure name

    Returns:
        TG-263 canonical name, or original if not found
    """
    # Normalize: lowercase, remove spaces and underscores
    normalized = name.lower().replace(" ", "_").replace("-", "_")

    # Direct lookup
    if normalized in TG263_STRUCTURES:
        return TG263_STRUCTURES[normalized]

    # Try without underscores
    no_underscore = normalized.replace("_", "")
    for key, value in TG263_STRUCTURES.items():
        if key.replace("_", "") == no_underscore:
            return value

    # Return original if no match
    return name


def validate_tg263_name(name: str) -> Tuple[bool, str]:
    """
    Validate a structure name against TG-263 conventions.

    Args:
        name: Structure name to validate

    Returns:
        Tuple of (is_valid, message)
    """
    canonical = get_tg263_name(name)

    # Check if it's a known TG-263 name
    if canonical in TG263_STRUCTURES.values():
        return True, f"Valid TG-263 name: {canonical}"

    # Check for common issues
    if " " in name:
        return False, "TG-263 names should not contain spaces"

    if name != name.strip():
        return False, "Name contains leading or trailing whitespace"

    if len(name) > 64:
        return False, "Name exceeds maximum length (64 characters)"

    # Unknown name - not invalid, just not standard
    return True, "Valid structure name (not a standard TG-263 name)"


# ============================================================================
# Suite Data Classes
# ============================================================================


@dataclass
class SuiteDefaults:
    """Default settings for a suite."""

    layout: str = "2x2"
    window_level_presets: Dict[str, Dict[str, int]] = field(default_factory=dict)


@dataclass
class SuiteAnalytics:
    """Analytics configuration for a suite."""

    default_metrics: List[str] = field(default_factory=list)
    enabled_features: List[str] = field(default_factory=list)


@dataclass
class SuiteExports:
    """Export configuration for a suite."""

    allowed_formats: List[str] = field(default_factory=lambda: ["nifti", "dicom_seg"])
    default_format: str = "nifti"


@dataclass
class SuiteDetectionHints:
    """Hints for auto-detecting which suite to use."""

    modalities: List[str] = field(default_factory=list)
    body_parts: List[str] = field(default_factory=list)
    description_keywords: List[str] = field(default_factory=list)
    protocol_keywords: List[str] = field(default_factory=list)


@dataclass
class StructureNaming:
    """Structure naming configuration."""

    convention: str = "TG-263"
    custom_mappings: Dict[str, str] = field(default_factory=dict)


@dataclass
class SuiteTask:
    """A segmentation task within a suite."""

    task_id: str
    display_name: str
    primary_model: str
    model_params: Dict[str, Any] = field(default_factory=dict)
    fallback_model: Optional[str] = None
    default_label_name: str = "Segment"
    label_color: str = "#FF0000"
    rt_type: Optional[str] = "ORGAN"  # ORGAN, GTV, CTV, PTV, EXTERNAL
    body_regions: List[str] = field(default_factory=lambda: ["any"])
    priority: int = 10
    interactive: bool = False


@dataclass
class Suite:
    """A clinical workflow suite."""

    suite_id: str
    suite_type: str
    display_name: str
    description: str
    version: str = "1.0.0"
    icon: str = "activity"
    defaults: SuiteDefaults = field(default_factory=SuiteDefaults)
    tasks: Dict[str, SuiteTask] = field(default_factory=dict)
    analytics: SuiteAnalytics = field(default_factory=SuiteAnalytics)
    exports: SuiteExports = field(default_factory=SuiteExports)
    detection_hints: SuiteDetectionHints = field(default_factory=SuiteDetectionHints)
    model_preferences: List[str] = field(default_factory=list)
    structure_colors: Dict[str, str] = field(default_factory=dict)
    structure_naming: Optional[StructureNaming] = None


# ============================================================================
# Suite Registry
# ============================================================================


class SuiteRegistry:
    """
    Registry for managing clinical workflow suites.

    Suites can be registered programmatically or loaded from YAML files.
    """

    _instance: Optional["SuiteRegistry"] = None

    def __init__(self):
        self._suites: Dict[str, Suite] = {}
        self._config_dir: Optional[str] = None
        self._register_default_suites()

    @classmethod
    def get_instance(cls) -> "SuiteRegistry":
        """Get the singleton registry instance."""
        if cls._instance is None:
            cls._instance = SuiteRegistry()
        return cls._instance

    def _register_default_suites(self):
        """Register built-in suites."""
        # Breast MRI Suite
        breast_suite = Suite(
            suite_id="breast_mri",
            suite_type="radiology",
            display_name="Breast MRI Analysis",
            description="Comprehensive breast MRI workflow with tumor detection and volumetrics",
            version="1.0.0",
            icon="heart",
            defaults=SuiteDefaults(
                layout="2x2",
                window_level_presets={
                    "soft_tissue": {"window": 400, "level": 40},
                    "enhanced": {"window": 600, "level": 100},
                }
            ),
            tasks={
                "breast_tumor": SuiteTask(
                    task_id="breast_tumor",
                    display_name="Breast Tumor Segmentation",
                    primary_model="breast_tumor",
                    model_params={"label": "tumor"},
                    default_label_name="Tumor",
                    label_color="#FF6B6B",
                    rt_type="GTV",
                    body_regions=["breast"],
                    priority=1,
                ),
                "breast_tissue": SuiteTask(
                    task_id="breast_tissue",
                    display_name="Breast Tissue Segmentation",
                    primary_model="segmentation",
                    model_params={"label": "breast"},
                    default_label_name="Breast",
                    label_color="#4ECDC4",
                    rt_type="ORGAN",
                    body_regions=["breast"],
                    priority=2,
                ),
            },
            analytics=SuiteAnalytics(
                default_metrics=["volume", "diameter", "sphericity"],
                enabled_features=["volumetrics", "radiomics"],
            ),
            detection_hints=SuiteDetectionHints(
                modalities=["MR", "MRI"],
                body_parts=["BREAST"],
                description_keywords=["breast", "mammography", "DCE"],
                protocol_keywords=["breast", "mri"],
            ),
            model_preferences=["breast_tumor", "segmentation"],
            structure_colors={
                "Tumor": "#FF6B6B",
                "Breast_L": "#4ECDC4",
                "Breast_R": "#45B7D1",
            },
        )
        self._suites["breast_mri"] = breast_suite

        # General Segmentation Suite
        general_suite = Suite(
            suite_id="general",
            suite_type="radiology",
            display_name="General Segmentation",
            description="General-purpose segmentation for various anatomical structures",
            version="1.0.0",
            icon="layers",
            tasks={
                "interactive": SuiteTask(
                    task_id="interactive",
                    display_name="Interactive Segmentation",
                    primary_model="segmentation",
                    model_params={},
                    default_label_name="Segment",
                    label_color="#9B59B6",
                    rt_type="ORGAN",
                    body_regions=["any"],
                    priority=1,
                    interactive=True,
                ),
                "auto": SuiteTask(
                    task_id="auto",
                    display_name="Auto Segmentation",
                    primary_model="segmentation",
                    model_params={"auto": True},
                    default_label_name="Auto_Segment",
                    label_color="#3498DB",
                    rt_type="ORGAN",
                    body_regions=["any"],
                    priority=2,
                    interactive=False,
                ),
            },
            analytics=SuiteAnalytics(
                default_metrics=["volume"],
                enabled_features=["volumetrics"],
            ),
            model_preferences=["segmentation"],
        )
        self._suites["general"] = general_suite

    def register_suite(self, suite: Suite) -> None:
        """Register a suite."""
        self._suites[suite.suite_id] = suite
        logger.info(f"Registered suite: {suite.suite_id}")

    def get_suite(self, suite_id: str) -> Optional[Suite]:
        """Get a suite by ID."""
        return self._suites.get(suite_id)

    def get_all_suites(self) -> Dict[str, Suite]:
        """Get all registered suites."""
        return self._suites

    def list_suite_ids(self) -> List[str]:
        """List all suite IDs."""
        return list(self._suites.keys())

    def get_task(self, suite_id: str, task_id: str) -> Optional[SuiteTask]:
        """Get a specific task from a suite."""
        suite = self.get_suite(suite_id)
        if suite:
            return suite.tasks.get(task_id)
        return None

    def reload(self) -> None:
        """Reload suites from configuration."""
        self._suites.clear()
        self._register_default_suites()

        if self._config_dir and os.path.isdir(self._config_dir):
            self._load_suites_from_dir(self._config_dir)

    def _load_suites_from_dir(self, config_dir: str) -> None:
        """Load suites from YAML files in a directory."""
        for filename in os.listdir(config_dir):
            if filename.endswith((".yaml", ".yml")):
                filepath = os.path.join(config_dir, filename)
                try:
                    self._load_suite_from_file(filepath)
                except Exception as e:
                    logger.error(f"Failed to load suite from {filepath}: {e}")

    def _load_suite_from_file(self, filepath: str) -> None:
        """Load a suite from a YAML file."""
        with open(filepath, "r") as f:
            data = yaml.safe_load(f)

        if not data or "suite_id" not in data:
            return

        # Parse tasks
        tasks = {}
        for task_data in data.get("tasks", []):
            task = SuiteTask(
                task_id=task_data["task_id"],
                display_name=task_data.get("display_name", task_data["task_id"]),
                primary_model=task_data["primary_model"],
                model_params=task_data.get("model_params", {}),
                fallback_model=task_data.get("fallback_model"),
                default_label_name=task_data.get("default_label_name", "Segment"),
                label_color=task_data.get("label_color", "#FF0000"),
                rt_type=task_data.get("rt_type", "ORGAN"),
                body_regions=task_data.get("body_regions", ["any"]),
                priority=task_data.get("priority", 10),
                interactive=task_data.get("interactive", False),
            )
            tasks[task.task_id] = task

        suite = Suite(
            suite_id=data["suite_id"],
            suite_type=data.get("suite_type", "radiology"),
            display_name=data.get("display_name", data["suite_id"]),
            description=data.get("description", ""),
            version=data.get("version", "1.0.0"),
            icon=data.get("icon", "activity"),
            tasks=tasks,
            model_preferences=data.get("model_preferences", []),
            structure_colors=data.get("structure_colors", {}),
        )

        self.register_suite(suite)


# ============================================================================
# Model Resolver
# ============================================================================


class ModelResolver:
    """
    Resolves suite tasks to available models.

    Handles model selection, fallbacks, and parameter merging.
    """

    _instance: Optional["ModelResolver"] = None

    def __init__(self, available_models: Optional[List[str]] = None):
        self._available_models = set(available_models or [])
        self._registry = SuiteRegistry.get_instance()

    @classmethod
    def get_instance(cls) -> "ModelResolver":
        """Get the singleton resolver instance."""
        if cls._instance is None:
            cls._instance = ModelResolver()
        return cls._instance

    def set_available_models(self, models: List[str]) -> None:
        """Set the list of available models."""
        self._available_models = set(models)

    def is_model_available(self, model_name: str) -> bool:
        """Check if a model is available."""
        # If no models registered, assume all are available
        if not self._available_models:
            return True
        return model_name in self._available_models

    def resolve_task(
        self,
        suite_id: str,
        task_id: str,
        param_overrides: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
        """
        Resolve a task to a model and parameters.

        Args:
            suite_id: Suite ID
            task_id: Task ID within the suite
            param_overrides: Optional parameter overrides

        Returns:
            Tuple of (model_name, merged_params, task_metadata)

        Raises:
            ValueError: If task not found or no model available
        """
        task = self._registry.get_task(suite_id, task_id)
        if task is None:
            raise ValueError(f"Task '{task_id}' not found in suite '{suite_id}'")

        # Try primary model first
        if self.is_model_available(task.primary_model):
            model_name = task.primary_model
        elif task.fallback_model and self.is_model_available(task.fallback_model):
            model_name = task.fallback_model
            logger.info(
                f"Using fallback model {task.fallback_model} for task {task_id}"
            )
        else:
            # Use primary anyway (will fail later if truly unavailable)
            model_name = task.primary_model
            logger.warning(
                f"Model {task.primary_model} may not be available for task {task_id}"
            )

        # Merge parameters
        params = dict(task.model_params)
        if param_overrides:
            params.update(param_overrides)

        # Build metadata
        metadata = {
            "task_id": task.task_id,
            "display_name": task.display_name,
            "default_label_name": task.default_label_name,
            "label_color": task.label_color,
            "rt_type": task.rt_type,
            "body_regions": task.body_regions,
            "interactive": task.interactive,
        }

        return model_name, params, metadata

    def list_available_tasks(self, suite_id: str) -> List[Dict[str, Any]]:
        """
        List all tasks in a suite with availability info.

        Args:
            suite_id: Suite ID

        Returns:
            List of task info dicts with availability status
        """
        suite = self._registry.get_suite(suite_id)
        if suite is None:
            return []

        results = []
        for task_id, task in suite.tasks.items():
            # Check availability
            primary_available = self.is_model_available(task.primary_model)
            fallback_available = (
                task.fallback_model is not None
                and self.is_model_available(task.fallback_model)
            )

            available = primary_available or fallback_available
            selected_model = (
                task.primary_model
                if primary_available
                else (task.fallback_model if fallback_available else None)
            )

            results.append({
                "task_id": task_id,
                "display_name": task.display_name,
                "available": available,
                "primary_model": task.primary_model,
                "fallback_model": task.fallback_model,
                "selected_model": selected_model,
                "priority": task.priority,
                "interactive": task.interactive,
            })

        # Sort by priority
        results.sort(key=lambda x: x["priority"])

        return results


# ============================================================================
# Module-level functions
# ============================================================================


def get_suite_registry() -> SuiteRegistry:
    """Get the global suite registry instance."""
    return SuiteRegistry.get_instance()


def get_model_resolver() -> ModelResolver:
    """Get the global model resolver instance."""
    return ModelResolver.get_instance()
