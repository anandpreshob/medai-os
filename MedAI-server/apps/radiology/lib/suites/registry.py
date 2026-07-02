"""
MedAI Suite Registry

Loads and manages suite configurations from YAML files.
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

import yaml

from .suite_config import SuiteConfig

logger = logging.getLogger(__name__)

# Global registry instance
_registry_instance: Optional["SuiteRegistry"] = None


class SuiteRegistry:
    """
    Registry for loading and managing suite configurations.

    Loads suite definitions from YAML files in the configs/suites directory
    and provides access to suite configurations by ID.
    """

    def __init__(self, config_dir: Optional[str] = None):
        """
        Initialize the registry.

        Args:
            config_dir: Path to the configs directory. If None, will use
                       the default location relative to this file.
        """
        if config_dir is None:
            # Default to apps/radiology/configs relative to this file
            this_dir = Path(__file__).parent
            config_dir = str(this_dir.parent.parent / "configs")

        self.config_dir = Path(config_dir)
        self._suites: Dict[str, SuiteConfig] = {}
        self._loaded = False

    def load_suites(self) -> None:
        """
        Load all suite configurations from YAML files.

        Scans the configs/suites directory for .yaml and .yml files
        and loads each one as a SuiteConfig.
        """
        suites_dir = self.config_dir / "suites"

        if not suites_dir.exists():
            logger.warning(f"Suites directory not found: {suites_dir}")
            self._loaded = True
            return

        logger.info(f"Loading suites from: {suites_dir}")

        for yaml_file in suites_dir.glob("*.yaml"):
            self._load_suite_from_file(yaml_file)

        for yaml_file in suites_dir.glob("*.yml"):
            self._load_suite_from_file(yaml_file)

        self._loaded = True
        logger.info(f"Loaded {len(self._suites)} suites: {list(self._suites.keys())}")

    def _load_suite_from_file(self, yaml_path: Path) -> Optional[SuiteConfig]:
        """
        Load a single suite from a YAML file.

        Args:
            yaml_path: Path to the YAML file

        Returns:
            The loaded SuiteConfig, or None if loading failed
        """
        try:
            with open(yaml_path, "r") as f:
                data = yaml.safe_load(f)

            if data is None:
                logger.warning(f"Empty suite config file: {yaml_path}")
                return None

            suite = SuiteConfig.from_dict(data)
            self._suites[suite.suite_id] = suite
            logger.debug(f"Loaded suite '{suite.suite_id}' from {yaml_path.name}")
            return suite

        except yaml.YAMLError as e:
            logger.error(f"Failed to parse YAML in {yaml_path}: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to load suite from {yaml_path}: {e}")
            return None

    def get_suite(self, suite_id: str) -> Optional[SuiteConfig]:
        """
        Get a suite configuration by ID.

        Args:
            suite_id: The suite identifier (e.g., 'oncology', 'radiotherapy')

        Returns:
            The SuiteConfig if found, None otherwise
        """
        if not self._loaded:
            self.load_suites()
        return self._suites.get(suite_id)

    def get_all_suites(self) -> Dict[str, SuiteConfig]:
        """
        Get all loaded suite configurations.

        Returns:
            Dictionary mapping suite IDs to their configurations
        """
        if not self._loaded:
            self.load_suites()
        return self._suites.copy()

    def list_suite_ids(self) -> List[str]:
        """
        Get a list of all available suite IDs.

        Returns:
            List of suite ID strings
        """
        if not self._loaded:
            self.load_suites()
        return list(self._suites.keys())

    def get_task(self, suite_id: str, task_id: str) -> Optional[Dict]:
        """
        Get a specific task configuration.

        Args:
            suite_id: The suite identifier
            task_id: The task identifier within the suite

        Returns:
            The task config as a dictionary, or None if not found
        """
        suite = self.get_suite(suite_id)
        if suite is None:
            return None
        task = suite.get_task(task_id)
        if task is None:
            return None
        return {
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

    def get_suites_for_modality(self, modality: str) -> List[SuiteConfig]:
        """
        Get all suites that support a given modality.

        Args:
            modality: DICOM modality (e.g., 'CT', 'MR', 'RTSTRUCT')

        Returns:
            List of matching suite configurations
        """
        if not self._loaded:
            self.load_suites()

        modality_upper = modality.upper()
        return [
            suite
            for suite in self._suites.values()
            if modality_upper in [m.upper() for m in suite.detection_hints.modalities]
        ]

    def reload(self) -> None:
        """Force reload all suite configurations from disk."""
        self._suites.clear()
        self._loaded = False
        self.load_suites()


def get_suite_registry(config_dir: Optional[str] = None) -> SuiteRegistry:
    """
    Get the global suite registry instance.

    Creates the registry on first call and returns the cached instance
    on subsequent calls.

    Args:
        config_dir: Optional config directory override (only used on first call)

    Returns:
        The global SuiteRegistry instance
    """
    global _registry_instance

    if _registry_instance is None:
        _registry_instance = SuiteRegistry(config_dir)
        _registry_instance.load_suites()

    return _registry_instance


def reset_registry() -> None:
    """Reset the global registry instance. Useful for testing."""
    global _registry_instance
    _registry_instance = None
