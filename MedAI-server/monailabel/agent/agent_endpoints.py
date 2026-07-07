# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
FastAPI routes for the MedAI agent, mounted by the chat service.

Externally (behind nginx, with the chat app's root_path="/chat") these are:
  POST /chat/agent/session   -> create an agent session
  POST /chat/agent/message   -> stream one agent turn (SSE)
  GET  /chat/agent/health    -> readiness (is ANTHROPIC_API_KEY set)
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from sse_starlette.sse import EventSourceResponse

    SSE_AVAILABLE = True
except ImportError:  # pragma: no cover
    SSE_AVAILABLE = False
    EventSourceResponse = None

from monailabel.agent.agent_loop import AGENT_MODEL, get_agent_loop
from monailabel.chat import get_session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentSessionResponse(BaseModel):
    session_id: str


class AgentMessageRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Existing agent session ID")
    message: str = Field(..., min_length=1, description="User message")


def _get_agent_messages(session) -> List[Dict[str, Any]]:
    """Fetch (creating if needed) the Anthropic-format message list on a session."""
    if session.metadata is None:
        session.metadata = {}
    return session.metadata.setdefault("agent_messages", [])


@router.get("/health", tags=["Agent"])
async def agent_health():
    loop = get_agent_loop()
    return {
        "status": "healthy" if loop.available else "unconfigured",
        "configured": loop.available,
        "model": AGENT_MODEL,
        "sse_available": SSE_AVAILABLE,
    }


@router.post("/session", response_model=AgentSessionResponse, tags=["Agent"])
async def create_agent_session():
    session = get_session_manager().create_session()
    return AgentSessionResponse(session_id=session.session_id)


@router.post("/message", tags=["Agent"])
async def agent_message(request: AgentMessageRequest):
    """Stream one agent turn as Server-Sent Events."""
    if not SSE_AVAILABLE:
        raise HTTPException(
            status_code=501, detail="Streaming not available. Install sse-starlette."
        )

    session_manager = get_session_manager()
    if request.session_id:
        session = session_manager.get_session(request.session_id)
        if session is None:
            raise HTTPException(
                status_code=404, detail=f"Session {request.session_id} not found"
            )
    else:
        session = session_manager.create_session()

    loop = get_agent_loop()
    messages = _get_agent_messages(session)

    async def event_generator() -> AsyncGenerator[Dict[str, str], None]:
        # Announce the session id up front so a fresh client can persist it.
        yield {"event": "session", "data": json.dumps({"session_id": session.session_id})}
        try:
            async for ev in loop.run(messages, request.message):
                yield {"event": ev.get("type", "message"), "data": json.dumps(ev, default=str)}
        except Exception as e:  # noqa: BLE001
            logger.exception("Agent turn failed")
            yield {"event": "error", "data": json.dumps({"error": str(e)})}
        finally:
            session.last_activity = session.last_activity  # touch; history already mutated

    return EventSourceResponse(event_generator())
