# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
MCP Server - Tool registry and execution engine.

The MCPServer manages a collection of MCP tools that can be invoked
by LLM orchestrators for function calling / tool use.
"""

import logging
from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel

from .tools import (
    MCPTool,
    CaseContextTool,
    EvidenceSummarizerTool,
    LocalRAGSearchTool,
    PubMedSearchTool,
    ReportAgentTool,
    SemanticScholarSearchTool,
    # Annotation tools
    RunSegmentationTool,
    SaveAnnotationTool,
    LoadSessionTool,
    BatchProcessTool,
    EditAnnotationTool,
)

logger = logging.getLogger(__name__)


# Default tools to register
DEFAULT_TOOLS: List[MCPTool] = [
    LocalRAGSearchTool(),
    PubMedSearchTool(),
    SemanticScholarSearchTool(),
    CaseContextTool(),
    ReportAgentTool(),
    EvidenceSummarizerTool(),
    # Annotation tools for conversational annotation workflow
    RunSegmentationTool(),
    SaveAnnotationTool(),
    LoadSessionTool(),
    BatchProcessTool(),
    EditAnnotationTool(),
]


class MCPServer:
    """
    MCP (Model Context Protocol) Server for tool management.

    The server maintains a registry of tools that can be:
    - Listed for LLM function calling definitions
    - Executed by name with validated inputs
    - Introspected for schemas and capabilities
    """

    def __init__(self, register_defaults: bool = True):
        """
        Initialize the MCP server.

        Args:
            register_defaults: Whether to register default tools
        """
        self._tools: Dict[str, MCPTool] = {}

        if register_defaults:
            for tool in DEFAULT_TOOLS:
                self.register_tool(tool)

        logger.info(f"MCPServer initialized with {len(self._tools)} tools")

    def register_tool(self, tool: MCPTool) -> None:
        """
        Register a tool with the server.

        Args:
            tool: MCPTool instance to register

        Raises:
            ValueError: If tool name is already registered
        """
        if tool.name in self._tools:
            logger.warning(f"Tool '{tool.name}' is already registered, overwriting")

        self._tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    def unregister_tool(self, name: str) -> bool:
        """
        Unregister a tool by name.

        Args:
            name: Tool name to unregister

        Returns:
            True if tool was removed, False if not found
        """
        if name in self._tools:
            del self._tools[name]
            logger.debug(f"Unregistered tool: {name}")
            return True
        return False

    def get_tool(self, name: str) -> Optional[MCPTool]:
        """
        Get a tool by name.

        Args:
            name: Tool name

        Returns:
            MCPTool instance or None if not found
        """
        return self._tools.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        """
        List all registered tools with their info.

        Returns:
            List of tool info dictionaries
        """
        return [tool.get_info() for tool in self._tools.values()]

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        return list(self._tools.keys())

    async def execute_tool(
        self,
        name: str,
        input_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a tool by name with the given input.

        Args:
            name: Tool name to execute
            input_data: Input dictionary (will be validated)

        Returns:
            Output dictionary from tool execution

        Raises:
            KeyError: If tool not found
            ValidationError: If input validation fails
        """
        tool = self._tools.get(name)

        if tool is None:
            raise KeyError(f"Tool not found: {name}")

        # Validate input
        validated_input = tool.validate_input(input_data)

        logger.info(f"Executing tool: {name}")

        # Execute
        output = await tool.execute(validated_input)

        # Format output
        return tool.format_output(output)

    def get_openai_tools(self) -> List[Dict[str, Any]]:
        """
        Get all tools in OpenAI function calling format.

        Returns:
            List of OpenAI-formatted tool definitions
        """
        return [tool.to_openai_function() for tool in self._tools.values()]

    def get_anthropic_tools(self) -> List[Dict[str, Any]]:
        """
        Get all tools in Anthropic tool use format.

        Returns:
            List of Anthropic-formatted tool definitions
        """
        return [tool.to_anthropic_tool() for tool in self._tools.values()]

    def get_gemini_functions(self) -> List[Dict[str, Any]]:
        """
        Get all tools in Google Gemini function declaration format.

        Returns:
            List of Gemini-formatted function declarations
        """
        return [tool.to_gemini_function() for tool in self._tools.values()]

    def get_tool_for_llm(
        self,
        name: str,
        format: str = "openai",
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific tool definition in LLM format.

        Args:
            name: Tool name
            format: Output format ('openai', 'anthropic', 'gemini')

        Returns:
            Tool definition dict or None if not found
        """
        tool = self._tools.get(name)
        if tool is None:
            return None

        if format == "anthropic":
            return tool.to_anthropic_tool()
        elif format == "gemini":
            return tool.to_gemini_function()
        else:
            return tool.to_openai_function()

    def __len__(self) -> int:
        """Return number of registered tools."""
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        """Check if tool is registered."""
        return name in self._tools

    def __repr__(self) -> str:
        return f"<MCPServer tools={list(self._tools.keys())}>"


# Singleton instance
_mcp_server: Optional[MCPServer] = None


def get_mcp_server() -> MCPServer:
    """
    Get or create the MCP server singleton.

    Returns:
        MCPServer instance
    """
    global _mcp_server

    if _mcp_server is None:
        _mcp_server = MCPServer(register_defaults=True)

    return _mcp_server


def reset_mcp_server() -> None:
    """Reset the MCP server singleton (for testing)."""
    global _mcp_server
    _mcp_server = None
