# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
MedAI Chat Service - FastAPI application for chat orchestration.

This service provides HTTP endpoints for the MedAI chat interface,
handling session management, message processing, and streaming responses.

Port: 8004
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Try to import sse-starlette for SSE support
try:
    from sse_starlette.sse import EventSourceResponse
    SSE_AVAILABLE = True
except ImportError:
    SSE_AVAILABLE = False
    EventSourceResponse = None

from monailabel.chat import (
    ChatOrchestrator,
    ChatSession,
    ChatSource as ChatSourceModel,
    get_orchestrator,
    get_session_manager,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="MedAI Chat Service",
    description="LangGraph-based chat orchestration for radiology Q&A with MCP tool integration",
    version="1.0.0",
    root_path="/chat",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request/Response Models
# ============================================================================


class ChatSource(BaseModel):
    """Citation source in a chat response."""

    type: Literal["guideline", "pubmed", "semantic_scholar", "textbook", "case_context"] = Field(
        ..., description="Type of source"
    )
    title: str = Field(..., description="Source title")
    authors: Optional[List[str]] = Field(None, description="List of authors")
    url: Optional[str] = Field(None, description="URL to the source")
    excerpt: Optional[str] = Field(None, description="Relevant excerpt from the source")
    relevance_score: Optional[float] = Field(
        None, ge=0, le=1, description="Relevance score (0-1)"
    )


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""

    session_id: Optional[str] = Field(
        None,
        description="Session ID. If not provided, a new session will be created.",
    )
    message: str = Field(..., min_length=1, description="User message")
    include_sources: bool = Field(True, description="Include source citations in response")
    stream: bool = Field(False, description="Stream the response via SSE")


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""

    session_id: str = Field(..., description="Session ID")
    message: str = Field(..., description="Assistant response")
    sources: List[ChatSource] = Field(default_factory=list, description="Source citations")
    case_context_used: bool = Field(False, description="Whether case context was used")


class SessionCreateRequest(BaseModel):
    """Request model for session creation."""

    viewer_session_id: Optional[str] = Field(
        None, description="Viewer session ID to link"
    )
    ttl_hours: Optional[int] = Field(
        None, ge=1, le=168, description="Session TTL in hours (max 7 days)"
    )


class SessionCreateResponse(BaseModel):
    """Response model for session creation."""

    session_id: str = Field(..., description="New session ID")
    viewer_session_id: Optional[str] = Field(None, description="Linked viewer session")
    expires_at: str = Field(..., description="Session expiration timestamp (ISO 8601)")


class SessionLinkRequest(BaseModel):
    """Request model for linking sessions."""

    chat_session_id: str = Field(..., description="Chat session ID")
    viewer_session_id: str = Field(..., description="Viewer session ID to link")


class SessionInfo(BaseModel):
    """Session information response."""

    session_id: str
    viewer_session_id: Optional[str]
    message_count: int
    has_case_context: bool
    created_at: str
    last_activity: str
    expires_at: Optional[str]


class EvidenceRequest(BaseModel):
    """Request model for evidence lookup."""

    finding: str = Field(..., min_length=1, description="Finding to search evidence for")
    modality: Optional[str] = Field(None, description="Imaging modality")
    body_region: Optional[str] = Field(None, description="Body region")
    max_results: int = Field(10, ge=1, le=50, description="Maximum results")


class EvidenceResponse(BaseModel):
    """Response model for evidence lookup."""

    finding: str
    sources: List[ChatSource]
    total_found: int


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str
    langgraph_available: bool
    sse_available: bool
    active_sessions: int


# ============================================================================
# Endpoints
# ============================================================================


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint."""
    from monailabel.chat.orchestrator import LANGGRAPH_AVAILABLE

    session_manager = get_session_manager()
    stats = session_manager.get_stats()

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        langgraph_available=LANGGRAPH_AVAILABLE,
        sse_available=SSE_AVAILABLE,
        active_sessions=stats["active_sessions"],
    )


@app.get("/info", tags=["System"])
async def service_info():
    """Get service information."""
    return {
        "service": "MedAI Chat Service",
        "version": "1.0.0",
        "description": "LangGraph-based chat orchestration for radiology Q&A",
        "endpoints": {
            "POST /chat": "Send a message and get a response",
            "POST /chat/stream": "Stream a response via SSE",
            "POST /chat/session/create": "Create a new chat session",
            "POST /chat/session/link": "Link chat to viewer session",
            "GET /chat/session/{id}": "Get session information",
            "DELETE /chat/session/{id}": "Delete a session",
            "GET /chat/evidence": "Quick evidence lookup",
            "GET /health": "Health check",
        },
    }


@app.post("/", response_model=ChatResponse, tags=["Chat"])
@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest):
    """
    Send a message and get a response.

    If no session_id is provided, a new session will be created.
    """
    session_manager = get_session_manager()

    # Get or create session
    if request.session_id:
        session = session_manager.get_session(request.session_id)
        if session is None:
            raise HTTPException(
                status_code=404, detail=f"Session {request.session_id} not found"
            )
    else:
        session = session_manager.create_session()

    # Handle streaming request
    if request.stream:
        if not SSE_AVAILABLE:
            raise HTTPException(
                status_code=501,
                detail="Streaming not available. Install sse-starlette.",
            )
        # Redirect to streaming endpoint
        return await chat_stream(request)

    # Process message
    orchestrator = get_orchestrator()
    result = await orchestrator.process_message(
        session_id=session.session_id,
        user_message=request.message,
        include_sources=request.include_sources,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    # Convert sources to response model
    sources = [
        ChatSource(
            type=s.get("type", "guideline"),
            title=s.get("title", "Unknown"),
            authors=s.get("authors"),
            url=s.get("url"),
            excerpt=s.get("excerpt"),
            relevance_score=s.get("relevance_score"),
        )
        for s in result.get("sources", [])
    ]

    return ChatResponse(
        session_id=result["session_id"],
        message=result["message"],
        sources=sources,
        case_context_used=result.get("case_context_used", False),
    )


@app.post("/stream", tags=["Chat"])
@app.post("/chat/stream", tags=["Chat"])
async def chat_stream(request: ChatRequest):
    """
    Stream a response via Server-Sent Events (SSE).

    Events:
    - message: Chunk of the response text
    - sources: Source citations (sent at the end)
    - done: Stream complete
    - error: Error occurred
    """
    if not SSE_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="Streaming not available. Install sse-starlette: pip install sse-starlette",
        )

    session_manager = get_session_manager()

    # Get or create session
    if request.session_id:
        session = session_manager.get_session(request.session_id)
        if session is None:
            raise HTTPException(
                status_code=404, detail=f"Session {request.session_id} not found"
            )
    else:
        session = session_manager.create_session()

    async def event_generator() -> AsyncGenerator[Dict[str, Any], None]:
        """Generate SSE events for the response."""
        try:
            # Send session ID first
            yield {
                "event": "session",
                "data": json.dumps({"session_id": session.session_id}),
            }

            # Process message (non-streaming for now)
            orchestrator = get_orchestrator()
            result = await orchestrator.process_message(
                session_id=session.session_id,
                user_message=request.message,
                include_sources=request.include_sources,
            )

            if "error" in result:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": result["error"]}),
                }
                return

            # Simulate streaming by chunking the response
            message = result.get("message", "")
            chunk_size = 50  # Characters per chunk

            for i in range(0, len(message), chunk_size):
                chunk = message[i : i + chunk_size]
                yield {
                    "event": "message",
                    "data": json.dumps({"chunk": chunk}),
                }
                await asyncio.sleep(0.05)  # Small delay for streaming effect

            # Send sources
            if request.include_sources and result.get("sources"):
                yield {
                    "event": "sources",
                    "data": json.dumps({"sources": result["sources"]}),
                }

            # Send completion
            yield {
                "event": "done",
                "data": json.dumps({
                    "session_id": result["session_id"],
                    "case_context_used": result.get("case_context_used", False),
                }),
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

    return EventSourceResponse(event_generator())


@app.post("/session/create", response_model=SessionCreateResponse, tags=["Session"])
@app.post("/chat/session/create", response_model=SessionCreateResponse, tags=["Session"])
async def create_session(request: SessionCreateRequest = None):
    """Create a new chat session."""
    request = request or SessionCreateRequest()

    session_manager = get_session_manager()
    session = session_manager.create_session(
        viewer_session_id=request.viewer_session_id,
        ttl_hours=request.ttl_hours,
    )

    return SessionCreateResponse(
        session_id=session.session_id,
        viewer_session_id=session.viewer_session_id,
        expires_at=session.expires_at.isoformat() if session.expires_at else "",
    )


@app.post("/session/link", response_model=SessionInfo, tags=["Session"])
@app.post("/chat/session/link", response_model=SessionInfo, tags=["Session"])
async def link_session(request: SessionLinkRequest):
    """Link a chat session to a viewer session."""
    session_manager = get_session_manager()

    session = session_manager.link_to_viewer(
        request.chat_session_id, request.viewer_session_id
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat session {request.chat_session_id} not found",
        )

    return SessionInfo(
        session_id=session.session_id,
        viewer_session_id=session.viewer_session_id,
        message_count=session.message_count,
        has_case_context=session.cached_case_context is not None,
        created_at=session.created_at.isoformat(),
        last_activity=session.last_activity.isoformat(),
        expires_at=session.expires_at.isoformat() if session.expires_at else None,
    )


@app.get("/session/{session_id}", response_model=SessionInfo, tags=["Session"])
@app.get("/chat/session/{session_id}", response_model=SessionInfo, tags=["Session"])
async def get_session(session_id: str):
    """Get session information."""
    session_manager = get_session_manager()
    session = session_manager.get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return SessionInfo(
        session_id=session.session_id,
        viewer_session_id=session.viewer_session_id,
        message_count=session.message_count,
        has_case_context=session.cached_case_context is not None,
        created_at=session.created_at.isoformat(),
        last_activity=session.last_activity.isoformat(),
        expires_at=session.expires_at.isoformat() if session.expires_at else None,
    )


@app.delete("/session/{session_id}", tags=["Session"])
@app.delete("/chat/session/{session_id}", tags=["Session"])
async def delete_session(session_id: str):
    """Delete a session."""
    session_manager = get_session_manager()

    if not session_manager.delete_session(session_id):
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return {"status": "deleted", "session_id": session_id}


@app.get("/evidence", response_model=EvidenceResponse, tags=["Evidence"])
@app.get("/chat/evidence", response_model=EvidenceResponse, tags=["Evidence"])
async def get_evidence(
    finding: str = Query(..., min_length=1, description="Finding to search for"),
    modality: Optional[str] = Query(None, description="Imaging modality"),
    body_region: Optional[str] = Query(None, description="Body region"),
    max_results: int = Query(10, ge=1, le=50, description="Maximum results"),
):
    """
    Quick evidence lookup for a specific finding.

    This endpoint searches both local guidelines and external literature
    to provide evidence related to a specific radiological finding.
    """
    # For now, return placeholder - would integrate with MCP tools
    return EvidenceResponse(
        finding=finding,
        sources=[],
        total_found=0,
    )


@app.get("/sessions/stats", tags=["Session"])
@app.get("/chat/sessions/stats", tags=["Session"])
async def get_session_stats():
    """Get session statistics."""
    session_manager = get_session_manager()
    return session_manager.get_stats()


# ============================================================================
# Startup/Shutdown Events
# ============================================================================


class VLLMChatClient:
    """Simple async chat client for vLLM OpenAI-compatible API."""

    def __init__(self, base_url: str, model: str = "medgemma"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        logger.info(f"VLLMChatClient initialized: {self.base_url}, model={self.model}")

    async def generate(self, messages: list) -> str:
        """Generate a chat completion."""
        import httpx

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 2048,
            "temperature": 0.3,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logger.info("MedAI Chat Service starting up...")

    # Initialize session manager
    session_manager = get_session_manager()
    logger.info(f"Session manager initialized: {session_manager.get_stats()}")

    # Initialize LLM client pointing to MedGemma vLLM server
    vllm_url = os.environ.get("VLLM_SERVICE_URL", "http://medgemma-vllm:8000")
    model_name = os.environ.get("MODEL_NAME", "medgemma")
    llm_client = VLLMChatClient(base_url=vllm_url, model=model_name)

    # Initialize orchestrator with the LLM client
    orchestrator = get_orchestrator(llm_client=llm_client)
    logger.info(f"Chat orchestrator initialized with LLM: {vllm_url}/{model_name}")

    logger.info("MedAI Chat Service ready")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("MedAI Chat Service shutting down...")

    # Cleanup expired sessions
    session_manager = get_session_manager()
    cleaned = session_manager.cleanup_expired()
    logger.info(f"Cleaned up {cleaned} expired sessions")

    logger.info("MedAI Chat Service shutdown complete")


# ============================================================================
# Main entry point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("CHAT_SERVICE_PORT", 8004))
    uvicorn.run(
        "monailabel.services.chat_app:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )
