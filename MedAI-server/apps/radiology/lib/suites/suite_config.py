"""
MedAI Suite Configuration Data Classes

Defines the structure for suite configurations loaded from YAML files.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class SuiteTask:
    """Configuration for a single suite task (e.g., brain_tumor, oar_head_neck)."""

    task_id: str
    display_name: str
    primary_model: str
    model_params: Dict[str, Any] = field(default_factory=dict)
    fallback_model: Optional[str] = None
    default_label_name: str = "Segment"
    label_color: str = "#FF0000"
    rt_type: Optional[str] = None  # GTV, CTV, PTV, ORGAN, etc.
    body_regions: List[str] = field(default_factory=list)
    priority: int = 10
    interactive: bool = False

    @classmethod
    def from_dict(cls, task_id: str, data: Dict[str, Any]) -> "SuiteTask":
        """Create a SuiteTask from a dictionary."""
        return cls(
            task_id=task_id,
            display_name=data.get("display_name", task_id),
            primary_model=data.get("primary_model", "segmentation"),
            model_params=data.get("model_params", {}),
            fallback_model=data.get("fallback_model"),
            default_label_name=data.get("default_label_name", "Segment"),
            label_color=data.get("label_color", "#FF0000"),
            rt_type=data.get("rt_type"),
            body_regions=data.get("body_regions", []),
            priority=data.get("priority", 10),
            interactive=data.get("interactive", False),
        )


@dataclass
class SuiteAnalytics:
    """Analytics configuration for a suite."""

    default_metrics: List[str] = field(default_factory=list)
    enabled_features: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "SuiteAnalytics":
        """Create SuiteAnalytics from a dictionary."""
        if data is None:
            return cls()
        return cls(
            default_metrics=data.get("default_metrics", []),
            enabled_features=data.get("enabled_features", []),
        )


@dataclass
class SuiteExports:
    """Export configuration for a suite."""

    allowed_formats: List[str] = field(default_factory=list)
    default_format: str = "nifti"
    rtstruct_options: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "SuiteExports":
        """Create SuiteExports from a dictionary."""
        if data is None:
            return cls(allowed_formats=["nifti"])
        return cls(
            allowed_formats=data.get("allowed_formats", ["nifti"]),
            default_format=data.get("default_format", "nifti"),
            rtstruct_options=data.get("rtstruct_options", {}),
        )


@dataclass
class SuiteDetectionHints:
    """Hints for auto-detecting this suite from DICOM metadata."""

    modalities: List[str] = field(default_factory=list)
    body_parts: List[str] = field(default_factory=list)
    description_keywords: List[str] = field(default_factory=list)
    protocol_keywords: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "SuiteDetectionHints":
        """Create SuiteDetectionHints from a dictionary."""
        if data is None:
            return cls()
        return cls(
            modalities=data.get("modalities", []),
            body_parts=data.get("body_parts", []),
            description_keywords=data.get("description_keywords", []),
            protocol_keywords=data.get("protocol_keywords", []),
        )


@dataclass
class StructureNaming:
    """Structure naming configuration (e.g., TG-263)."""

    convention: str = "TG-263"
    mappings: Dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "StructureNaming":
        """Create StructureNaming from a dictionary."""
        if data is None:
            return cls()
        return cls(
            convention=data.get("convention", "TG-263"),
            mappings=data.get("mappings", {}),
        )


@dataclass
class SuiteDefaults:
    """Default settings for a suite."""

    layout: str = "fourUp"
    window_level_presets: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "SuiteDefaults":
        """Create SuiteDefaults from a dictionary."""
        if data is None:
            return cls()
        return cls(
            layout=data.get("layout", "fourUp"),
            window_level_presets=data.get("window_level_presets", []),
        )


@dataclass
class SuiteConfig:
    """
    Main suite configuration class.

    Represents a complete clinical workflow suite loaded from YAML.
    """

    suite_id: str
    suite_type: str
    display_name: str
    description: str
    version: str
    icon: str

    defaults: SuiteDefaults
    tasks: Dict[str, SuiteTask]
    analytics: SuiteAnalytics
    exports: SuiteExports
    detection_hints: SuiteDetectionHints

    # Optional RT-specific configs
    structure_naming: Optional[StructureNaming] = None
    structure_colors: Optional[Dict[str, str]] = None
    model_preferences: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SuiteConfig":
        """Create a SuiteConfig from a dictionary (parsed YAML)."""
        # Parse tasks
        tasks_data = data.get("tasks", {})
        tasks = {
            task_id: SuiteTask.from_dict(task_id, task_data)
            for task_id, task_data in tasks_data.items()
        }

        return cls(
            suite_id=data.get("suite_id", "unknown"),
            suite_type=data.get("suite_type", "generic"),
            display_name=data.get("display_name", "Unknown Suite"),
            description=data.get("description", ""),
            version=data.get("version", "1.0.0"),
            icon=data.get("icon", "Activity"),
            defaults=SuiteDefaults.from_dict(data.get("defaults")),
            tasks=tasks,
            analytics=SuiteAnalytics.from_dict(data.get("analytics")),
            exports=SuiteExports.from_dict(data.get("exports")),
            detection_hints=SuiteDetectionHints.from_dict(data.get("detection_hints")),
            structure_naming=StructureNaming.from_dict(data.get("structure_naming")),
            structure_colors=data.get("structure_colors"),
            model_preferences=data.get("model_preferences", []),
        )

    def get_task(self, task_id: str) -> Optional[SuiteTask]:
        """Get a task by ID."""
        return self.tasks.get(task_id)

    def get_tasks_for_body_region(self, region: str) -> List[SuiteTask]:
        """Get all tasks applicable to a body region."""
        region_lower = region.lower()
        return [
            task
            for task in self.tasks.values()
            if "any" in [r.lower() for r in task.body_regions]
            or region_lower in [r.lower() for r in task.body_regions]
        ]

    def get_tg263_name(self, model_label: str) -> str:
        """
        Convert a model label to TG-263 standard name.

        Args:
            model_label: The label from the segmentation model

        Returns:
            TG-263 compliant name if mapping exists, otherwise original label
        """
        if self.structure_naming and self.structure_naming.mappings:
            return self.structure_naming.mappings.get(model_label, model_label)
        return model_label

    def get_structure_color(self, structure_name: str) -> Optional[str]:
        """
        Get the RT-standard color for a structure.

        Args:
            structure_name: The structure name (TG-263 or model label)

        Returns:
            Hex color code if found, None otherwise
        """
        if self.structure_colors:
            # Try direct match
            if structure_name in self.structure_colors:
                return self.structure_colors[structure_name]
            # Try TG-263 converted name
            tg263_name = self.get_tg263_name(structure_name)
            if tg263_name in self.structure_colors:
                return self.structure_colors[tg263_name]
            # Try prefix match (e.g., "GTV_Primary" -> "GTV")
            for prefix in ["GTV", "CTV", "PTV", "ITV"]:
                if structure_name.upper().startswith(prefix):
                    return self.structure_colors.get(prefix)
        return None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "suite_id": self.suite_id,
            "suite_type": self.suite_type,
            "display_name": self.display_name,
            "description": self.description,
            "version": self.version,
            "icon": self.icon,
            "defaults": {
                "layout": self.defaults.layout,
                "window_level_presets": self.defaults.window_level_presets,
            },
            "tasks": {
                task_id: {
                    "task_id": task.task_id,
                    "display_name": task.display_name,
                    "primary_model": task.primary_model,
                    "model_params": task.model_params,
                    "fallback_model": task.fallback_model,
                    "default_label_name": task.default_label_name,
                    "label_color": task.label_color,
                    "rt_type": task.rt_type,
                    "body_regions": task.body_regions,
                    "priority": task.priority,
                    "interactive": task.interactive,
                }
                for task_id, task in self.tasks.items()
            },
            "analytics": {
                "default_metrics": self.analytics.default_metrics,
                "enabled_features": self.analytics.enabled_features,
            },
            "exports": {
                "allowed_formats": self.exports.allowed_formats,
                "default_format": self.exports.default_format,
            },
            "detection_hints": {
                "modalities": self.detection_hints.modalities,
                "body_parts": self.detection_hints.body_parts,
                "description_keywords": self.detection_hints.description_keywords,
                "protocol_keywords": self.detection_hints.protocol_keywords,
            },
            "model_preferences": self.model_preferences,
        }
