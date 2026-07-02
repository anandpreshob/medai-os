"""
MedAI Model Resolver

Resolves suite tasks to actual model names and parameters.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any

from .suite_config import SuiteTask
from .registry import SuiteRegistry, get_suite_registry

logger = logging.getLogger(__name__)

# Global resolver instance
_resolver_instance: Optional["ModelResolver"] = None


class ModelResolver:
    """
    Resolves suite tasks to model configurations.

    Takes a suite task and determines the actual model to use,
    considering model availability and fallback options.
    """

    def __init__(
        self,
        registry: Optional[SuiteRegistry] = None,
        available_models: Optional[List[str]] = None,
    ):
        """
        Initialize the model resolver.

        Args:
            registry: SuiteRegistry instance. If None, uses global registry.
            available_models: List of available model names. If None, will be
                            set later via set_available_models().
        """
        self._registry = registry or get_suite_registry()
        self._available_models: List[str] = available_models or []

    def set_available_models(self, models: List[str]) -> None:
        """
        Set the list of available models.

        This should be called after the MONAI Label app is initialized
        and the actual available models are known.

        Args:
            models: List of model names available in the app
        """
        self._available_models = [m.lower() for m in models]
        logger.info(f"ModelResolver: Available models set to {self._available_models}")

    def is_model_available(self, model_name: str) -> bool:
        """
        Check if a model is available.

        Args:
            model_name: Name of the model to check

        Returns:
            True if the model is available
        """
        return model_name.lower() in self._available_models

    def resolve_task(
        self,
        suite_id: str,
        task_id: str,
        override_params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
        """
        Resolve a suite task to a model name and parameters.

        Args:
            suite_id: The suite identifier (e.g., 'oncology')
            task_id: The task identifier (e.g., 'brain_tumor')
            override_params: Optional parameters to override task defaults

        Returns:
            Tuple of (model_name, model_params, task_metadata)

        Raises:
            ValueError: If suite or task not found, or no model available
        """
        suite = self._registry.get_suite(suite_id)
        if suite is None:
            raise ValueError(f"Suite '{suite_id}' not found")

        task = suite.get_task(task_id)
        if task is None:
            raise ValueError(f"Task '{task_id}' not found in suite '{suite_id}'")

        # Determine which model to use
        model_name = self._select_model(task, suite.model_preferences)

        # Build parameters
        params = dict(task.model_params)
        if override_params:
            params.update(override_params)

        # Build metadata
        metadata = {
            "suite_id": suite_id,
            "task_id": task_id,
            "display_name": task.display_name,
            "default_label_name": task.default_label_name,
            "label_color": task.label_color,
            "rt_type": task.rt_type,
            "interactive": task.interactive,
        }

        logger.info(
            f"Resolved task {suite_id}/{task_id} -> model={model_name}, params={params}"
        )

        return model_name, params, metadata

    def _select_model(
        self, task: SuiteTask, model_preferences: List[str]
    ) -> str:
        """
        Select the best available model for a task.

        Tries the primary model first, then fallback, then model preferences.

        Args:
            task: The task configuration
            model_preferences: Suite-level model preferences

        Returns:
            The selected model name

        Raises:
            ValueError: If no suitable model is available
        """
        # If no available models list, just return primary
        if not self._available_models:
            logger.warning(
                "No available models list set, using primary model from task"
            )
            return task.primary_model

        # Try primary model
        if self.is_model_available(task.primary_model):
            return task.primary_model

        # Try fallback model
        if task.fallback_model and self.is_model_available(task.fallback_model):
            logger.info(
                f"Primary model '{task.primary_model}' not available, "
                f"using fallback '{task.fallback_model}'"
            )
            return task.fallback_model

        # Try suite preferences
        for pref_model in model_preferences:
            if self.is_model_available(pref_model):
                logger.info(
                    f"Using suite preference model '{pref_model}' "
                    f"for task '{task.task_id}'"
                )
                return pref_model

        # No model available
        raise ValueError(
            f"No available model for task '{task.task_id}'. "
            f"Tried: {task.primary_model}, {task.fallback_model}, {model_preferences}. "
            f"Available: {self._available_models}"
        )

    def get_tasks_for_model(self, model_name: str) -> List[Dict[str, Any]]:
        """
        Get all tasks that can use a specific model.

        Args:
            model_name: The model name to search for

        Returns:
            List of task info dictionaries
        """
        model_lower = model_name.lower()
        tasks = []

        for suite_id, suite in self._registry.get_all_suites().items():
            for task_id, task in suite.tasks.items():
                if (
                    task.primary_model.lower() == model_lower
                    or (task.fallback_model and task.fallback_model.lower() == model_lower)
                ):
                    tasks.append({
                        "suite_id": suite_id,
                        "task_id": task_id,
                        "display_name": task.display_name,
                        "is_primary": task.primary_model.lower() == model_lower,
                    })

        return tasks

    def list_available_tasks(self, suite_id: str) -> List[Dict[str, Any]]:
        """
        List all tasks in a suite that have available models.

        Args:
            suite_id: The suite identifier

        Returns:
            List of task info dictionaries with availability status
        """
        suite = self._registry.get_suite(suite_id)
        if suite is None:
            return []

        tasks = []
        for task_id, task in suite.tasks.items():
            # Check model availability
            primary_available = self.is_model_available(task.primary_model)
            fallback_available = (
                task.fallback_model and self.is_model_available(task.fallback_model)
            )
            any_pref_available = any(
                self.is_model_available(m) for m in suite.model_preferences
            )

            available = primary_available or fallback_available or any_pref_available
            selected_model = None

            if primary_available:
                selected_model = task.primary_model
            elif fallback_available:
                selected_model = task.fallback_model
            elif any_pref_available:
                for m in suite.model_preferences:
                    if self.is_model_available(m):
                        selected_model = m
                        break

            tasks.append({
                "task_id": task_id,
                "display_name": task.display_name,
                "primary_model": task.primary_model,
                "fallback_model": task.fallback_model,
                "available": available,
                "selected_model": selected_model,
                "interactive": task.interactive,
                "priority": task.priority,
            })

        # Sort by priority
        tasks.sort(key=lambda t: t["priority"])

        return tasks


def get_model_resolver(
    registry: Optional[SuiteRegistry] = None,
    available_models: Optional[List[str]] = None,
) -> ModelResolver:
    """
    Get the global model resolver instance.

    Creates the resolver on first call and returns the cached instance
    on subsequent calls.

    Args:
        registry: Optional SuiteRegistry override
        available_models: Optional list of available models

    Returns:
        The global ModelResolver instance
    """
    global _resolver_instance

    if _resolver_instance is None:
        _resolver_instance = ModelResolver(registry, available_models)

    return _resolver_instance


def reset_resolver() -> None:
    """Reset the global resolver instance. Useful for testing."""
    global _resolver_instance
    _resolver_instance = None
