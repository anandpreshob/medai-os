# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Base class for MCP (Model Context Protocol) tools.

MCP tools are callable units that can be invoked by LLM orchestrators
for function calling / tool use. Each tool has:
- A name and description for the LLM
- Input and output Pydantic schemas
- An async execute method
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Type

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class MCPTool(ABC):
    """
    Abstract base class for MCP tools.

    MCP tools follow a standard interface that allows them to be:
    1. Registered with the MCPServer
    2. Described to LLMs for function calling
    3. Executed with validated inputs
    """

    # Override these in subclasses
    name: str = "base_tool"
    description: str = "Base MCP tool - override in subclass"
    input_schema: Type[BaseModel] = BaseModel
    output_schema: Type[BaseModel] = BaseModel

    def __init__(self):
        """Initialize the tool."""
        self._validate_schemas()

    def _validate_schemas(self) -> None:
        """Validate that schemas are properly defined."""
        if self.input_schema is BaseModel:
            logger.warning(f"Tool {self.name} has no custom input schema defined")
        if self.output_schema is BaseModel:
            logger.warning(f"Tool {self.name} has no custom output schema defined")

    @abstractmethod
    async def execute(self, input_data: BaseModel) -> BaseModel:
        """
        Execute the tool with validated input.

        Args:
            input_data: Validated input conforming to input_schema

        Returns:
            Output conforming to output_schema
        """
        pass

    async def __call__(self, input_data: BaseModel) -> BaseModel:
        """Allow calling the tool directly."""
        return await self.execute(input_data)

    def to_openai_function(self) -> Dict[str, Any]:
        """
        Convert tool to OpenAI function calling format.

        Returns:
            Dict in OpenAI function format for LLM tool use.
        """
        # Get JSON schema from Pydantic model
        schema = self.input_schema.model_json_schema()

        # Remove title as it's redundant with function name
        schema.pop("title", None)

        # Build OpenAI function format
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": schema,
            },
        }

    def to_anthropic_tool(self) -> Dict[str, Any]:
        """
        Convert tool to Anthropic tool use format.

        Returns:
            Dict in Anthropic tool format.
        """
        schema = self.input_schema.model_json_schema()
        schema.pop("title", None)

        return {
            "name": self.name,
            "description": self.description,
            "input_schema": schema,
        }

    def to_gemini_function(self) -> Dict[str, Any]:
        """
        Convert tool to Google Gemini function calling format.

        Returns:
            Dict in Gemini function declaration format.
        """
        schema = self.input_schema.model_json_schema()
        schema.pop("title", None)

        # Gemini uses slightly different format
        return {
            "name": self.name,
            "description": self.description,
            "parameters": schema,
        }

    def validate_input(self, data: Dict[str, Any]) -> BaseModel:
        """
        Validate and parse input data.

        Args:
            data: Raw input dictionary

        Returns:
            Validated input model instance

        Raises:
            ValidationError: If data doesn't match schema
        """
        return self.input_schema.model_validate(data)

    def format_output(self, output: BaseModel) -> Dict[str, Any]:
        """
        Convert output model to dictionary.

        Args:
            output: Output model instance

        Returns:
            Dictionary representation
        """
        return output.model_dump()

    def get_info(self) -> Dict[str, Any]:
        """
        Get tool information for registry listing.

        Returns:
            Dict with tool metadata
        """
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema.model_json_schema(),
            "output_schema": self.output_schema.model_json_schema(),
        }

    def __repr__(self) -> str:
        return f"<MCPTool: {self.name}>"
