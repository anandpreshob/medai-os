# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Session management for MedAI chat service.

Handles chat session lifecycle, message history, and viewer session linking.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

logger = logging.getLogger(__name__)


@dataclass
class ChatSource:
    """Represents a source citation in a chat response."""

    type: Literal["guideline", "pubmed", "semantic_scholar", "textbook", "case_context"]
    title: str
    authors: Optional[List[str]] = None
    url: Optional[str] = None
    excerpt: Optional[str] = None
    relevance_score: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "type": self.type,
            "title": self.title,
            "authors": self.authors,
            "url": self.url,
            "excerpt": self.excerpt,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata,
        }


@dataclass
class ChatMessage:
    """Represents a single message in a chat conversation."""

    role: Literal["user", "assistant", "system"]
    content: str
    sources: Optional[List[ChatSource]] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    message_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "message_id": self.message_id,
            "role": self.role,
            "content": self.content,
            "sources": [s.to_dict() for s in self.sources] if self.sources else None,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChatMessage":
        """Create from dictionary."""
        sources = None
        if data.get("sources"):
            sources = [
                ChatSource(
                    type=s["type"],
                    title=s["title"],
                    authors=s.get("authors"),
                    url=s.get("url"),
                    excerpt=s.get("excerpt"),
                    relevance_score=s.get("relevance_score"),
                    metadata=s.get("metadata"),
                )
                for s in data["sources"]
            ]

        return cls(
            message_id=data.get("message_id", str(uuid.uuid4())),
            role=data["role"],
            content=data["content"],
            sources=sources,
            timestamp=datetime.fromisoformat(data["timestamp"])
            if isinstance(data.get("timestamp"), str)
            else data.get("timestamp", datetime.utcnow()),
            metadata=data.get("metadata"),
        )


@dataclass
class CaseContext:
    """Cached case context from viewer session."""

    modality: str
    body_region: Optional[str] = None
    segmentations: List[Dict[str, Any]] = field(default_factory=list)
    volumetrics_summary: Optional[Dict[str, Any]] = None
    detections: List[Dict[str, Any]] = field(default_factory=list)
    is_longitudinal: bool = False
    patient_info: Optional[Dict[str, Any]] = None
    study_info: Optional[Dict[str, Any]] = None
    fetched_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "modality": self.modality,
            "body_region": self.body_region,
            "segmentations": self.segmentations,
            "volumetrics_summary": self.volumetrics_summary,
            "detections": self.detections,
            "is_longitudinal": self.is_longitudinal,
            "patient_info": self.patient_info,
            "study_info": self.study_info,
            "fetched_at": self.fetched_at.isoformat(),
        }


@dataclass
class ChatSession:
    """Represents a chat session with conversation history."""

    session_id: str
    viewer_session_id: Optional[str] = None
    messages: List[ChatMessage] = field(default_factory=list)
    cached_case_context: Optional[CaseContext] = None
    current_report_draft: Optional[Dict[str, str]] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        """Set default expiration if not provided."""
        if self.expires_at is None:
            # Default 24-hour expiration
            self.expires_at = self.created_at + timedelta(hours=24)

    @property
    def is_expired(self) -> bool:
        """Check if the session has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    @property
    def has_viewer_link(self) -> bool:
        """Check if session is linked to a viewer session."""
        return self.viewer_session_id is not None

    @property
    def message_count(self) -> int:
        """Get total message count."""
        return len(self.messages)

    def add_message(self, message: ChatMessage) -> None:
        """Add a message to the session."""
        self.messages.append(message)
        self.last_activity = datetime.utcnow()

    def get_conversation_history(
        self, max_messages: Optional[int] = None
    ) -> List[Dict[str, str]]:
        """
        Get conversation history in format suitable for LLM.

        Args:
            max_messages: Maximum number of messages to return (most recent)

        Returns:
            List of message dicts with 'role' and 'content'
        """
        messages = self.messages
        if max_messages:
            messages = messages[-max_messages:]

        return [{"role": m.role, "content": m.content} for m in messages]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "viewer_session_id": self.viewer_session_id,
            "messages": [m.to_dict() for m in self.messages],
            "cached_case_context": self.cached_case_context.to_dict()
            if self.cached_case_context
            else None,
            "current_report_draft": self.current_report_draft,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "metadata": self.metadata,
        }


class SessionManager:
    """
    Manages chat sessions with lifecycle handling.

    This class provides session creation, retrieval, linking to viewer sessions,
    message management, and cleanup of expired sessions.
    """

    def __init__(
        self,
        default_ttl_hours: int = 24,
        max_sessions: int = 1000,
        cleanup_interval_minutes: int = 30,
    ):
        """
        Initialize the session manager.

        Args:
            default_ttl_hours: Default session TTL in hours
            max_sessions: Maximum number of concurrent sessions
            cleanup_interval_minutes: Interval for automatic cleanup
        """
        self._sessions: Dict[str, ChatSession] = {}
        self._viewer_to_chat: Dict[str, str] = {}  # viewer_session_id -> chat_session_id
        self._default_ttl = timedelta(hours=default_ttl_hours)
        self._max_sessions = max_sessions
        self._cleanup_interval = timedelta(minutes=cleanup_interval_minutes)
        self._last_cleanup = datetime.utcnow()
        self._lock = asyncio.Lock()

        logger.info(
            f"SessionManager initialized: ttl={default_ttl_hours}h, "
            f"max_sessions={max_sessions}"
        )

    def create_session(
        self,
        viewer_session_id: Optional[str] = None,
        ttl_hours: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ChatSession:
        """
        Create a new chat session.

        Args:
            viewer_session_id: Optional viewer session to link
            ttl_hours: Optional custom TTL in hours
            metadata: Optional session metadata

        Returns:
            New ChatSession instance
        """
        # Cleanup if needed
        self._maybe_cleanup()

        # Check capacity
        if len(self._sessions) >= self._max_sessions:
            self._cleanup_oldest()

        session_id = str(uuid.uuid4())
        ttl = timedelta(hours=ttl_hours) if ttl_hours else self._default_ttl
        expires_at = datetime.utcnow() + ttl

        session = ChatSession(
            session_id=session_id,
            viewer_session_id=viewer_session_id,
            expires_at=expires_at,
            metadata=metadata,
        )

        self._sessions[session_id] = session

        if viewer_session_id:
            self._viewer_to_chat[viewer_session_id] = session_id

        logger.info(
            f"Created session {session_id}, "
            f"viewer_link={viewer_session_id is not None}"
        )

        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """
        Get a session by ID.

        Args:
            session_id: The session ID

        Returns:
            ChatSession if found and not expired, None otherwise
        """
        session = self._sessions.get(session_id)

        if session is None:
            return None

        if session.is_expired:
            self._remove_session(session_id)
            return None

        return session

    def get_session_by_viewer(self, viewer_session_id: str) -> Optional[ChatSession]:
        """
        Get a chat session linked to a viewer session.

        Args:
            viewer_session_id: The viewer session ID

        Returns:
            ChatSession if found, None otherwise
        """
        chat_session_id = self._viewer_to_chat.get(viewer_session_id)
        if chat_session_id:
            return self.get_session(chat_session_id)
        return None

    def link_to_viewer(
        self, chat_session_id: str, viewer_session_id: str
    ) -> Optional[ChatSession]:
        """
        Link a chat session to a viewer session.

        Args:
            chat_session_id: The chat session ID
            viewer_session_id: The viewer session ID to link

        Returns:
            Updated ChatSession if successful, None otherwise
        """
        session = self.get_session(chat_session_id)
        if session is None:
            return None

        # Remove old viewer link if exists
        if session.viewer_session_id:
            self._viewer_to_chat.pop(session.viewer_session_id, None)

        # Set new link
        session.viewer_session_id = viewer_session_id
        self._viewer_to_chat[viewer_session_id] = chat_session_id

        # Clear cached context (will be refreshed)
        session.cached_case_context = None

        logger.info(f"Linked session {chat_session_id} to viewer {viewer_session_id}")

        return session

    def unlink_from_viewer(self, chat_session_id: str) -> Optional[ChatSession]:
        """
        Unlink a chat session from its viewer session.

        Args:
            chat_session_id: The chat session ID

        Returns:
            Updated ChatSession if successful, None otherwise
        """
        session = self.get_session(chat_session_id)
        if session is None:
            return None

        if session.viewer_session_id:
            self._viewer_to_chat.pop(session.viewer_session_id, None)
            session.viewer_session_id = None
            session.cached_case_context = None

        return session

    def add_message(
        self,
        session_id: str,
        role: Literal["user", "assistant", "system"],
        content: str,
        sources: Optional[List[ChatSource]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[ChatMessage]:
        """
        Add a message to a session.

        Args:
            session_id: The session ID
            role: Message role
            content: Message content
            sources: Optional list of sources
            metadata: Optional message metadata

        Returns:
            The created ChatMessage if successful, None otherwise
        """
        session = self.get_session(session_id)
        if session is None:
            return None

        message = ChatMessage(
            role=role,
            content=content,
            sources=sources,
            metadata=metadata,
        )

        session.add_message(message)

        return message

    def update_case_context(
        self, session_id: str, case_context: CaseContext
    ) -> Optional[ChatSession]:
        """
        Update the cached case context for a session.

        Args:
            session_id: The session ID
            case_context: The case context to cache

        Returns:
            Updated ChatSession if successful, None otherwise
        """
        session = self.get_session(session_id)
        if session is None:
            return None

        session.cached_case_context = case_context
        session.last_activity = datetime.utcnow()

        return session

    def update_report_draft(
        self, session_id: str, report_draft: Dict[str, str]
    ) -> Optional[ChatSession]:
        """
        Update the current report draft for a session.

        Args:
            session_id: The session ID
            report_draft: The report draft sections

        Returns:
            Updated ChatSession if successful, None otherwise
        """
        session = self.get_session(session_id)
        if session is None:
            return None

        session.current_report_draft = report_draft
        session.last_activity = datetime.utcnow()

        return session

    def delete_session(self, session_id: str) -> bool:
        """
        Delete a session.

        Args:
            session_id: The session ID

        Returns:
            True if deleted, False if not found
        """
        return self._remove_session(session_id)

    def cleanup_expired(self) -> int:
        """
        Clean up all expired sessions.

        Returns:
            Number of sessions removed
        """
        expired_ids = [
            sid for sid, session in self._sessions.items() if session.is_expired
        ]

        for sid in expired_ids:
            self._remove_session(sid)

        if expired_ids:
            logger.info(f"Cleaned up {len(expired_ids)} expired sessions")

        self._last_cleanup = datetime.utcnow()

        return len(expired_ids)

    def get_stats(self) -> Dict[str, Any]:
        """Get session manager statistics."""
        now = datetime.utcnow()
        active_count = sum(1 for s in self._sessions.values() if not s.is_expired)
        linked_count = sum(
            1 for s in self._sessions.values() if s.has_viewer_link and not s.is_expired
        )

        return {
            "total_sessions": len(self._sessions),
            "active_sessions": active_count,
            "linked_sessions": linked_count,
            "max_sessions": self._max_sessions,
            "last_cleanup": self._last_cleanup.isoformat(),
        }

    def _remove_session(self, session_id: str) -> bool:
        """Remove a session and its viewer link."""
        session = self._sessions.pop(session_id, None)
        if session is None:
            return False

        if session.viewer_session_id:
            self._viewer_to_chat.pop(session.viewer_session_id, None)

        return True

    def _maybe_cleanup(self) -> None:
        """Run cleanup if enough time has passed."""
        if datetime.utcnow() - self._last_cleanup > self._cleanup_interval:
            self.cleanup_expired()

    def _cleanup_oldest(self) -> None:
        """Remove oldest sessions when at capacity."""
        # Sort by last activity
        sorted_sessions = sorted(
            self._sessions.items(), key=lambda x: x[1].last_activity
        )

        # Remove oldest 10%
        to_remove = max(1, len(sorted_sessions) // 10)
        for session_id, _ in sorted_sessions[:to_remove]:
            self._remove_session(session_id)

        logger.info(f"Cleaned up {to_remove} oldest sessions due to capacity")


# Global session manager instance
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get or create the global session manager instance."""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


def reset_session_manager() -> None:
    """Reset the global session manager (for testing)."""
    global _session_manager
    _session_manager = None
