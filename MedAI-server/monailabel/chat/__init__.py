# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
MedAI Chat Orchestration Module.

This module provides LangGraph-based chat orchestration with MCP tool integration
for the MedAI radiology assistant.

Key components:
- ChatOrchestrator: LangGraph workflow for processing chat messages
- SessionManager: Session lifecycle and message history management
- CaseContextInjector: Formatting case context for LLM consumption
- Prompts: System prompts for radiology Q&A, report generation, and evidence synthesis

Example usage:
    from monailabel.chat import (
        ChatOrchestrator,
        get_session_manager,
        get_orchestrator,
    )

    # Create a session
    session_manager = get_session_manager()
    session = session_manager.create_session()

    # Process a message
    orchestrator = get_orchestrator()
    response = await orchestrator.process_message(
        session_id=session.session_id,
        user_message="What is BI-RADS 4?",
    )
"""

from .context_injector import (
    CaseContextInjector,
    create_context_summary,
    format_context_for_llm,
)
from .orchestrator import (
    ChatOrchestrator,
    ChatState,
    get_orchestrator,
    reset_orchestrator,
)
from .session_manager import (
    CaseContext,
    ChatMessage,
    ChatSession,
    ChatSource,
    SessionManager,
    get_session_manager,
    reset_session_manager,
)

__all__ = [
    # Orchestrator
    "ChatOrchestrator",
    "ChatState",
    "get_orchestrator",
    "reset_orchestrator",
    # Session management
    "SessionManager",
    "ChatSession",
    "ChatMessage",
    "ChatSource",
    "CaseContext",
    "get_session_manager",
    "reset_session_manager",
    # Context injection
    "CaseContextInjector",
    "format_context_for_llm",
    "create_context_summary",
]
