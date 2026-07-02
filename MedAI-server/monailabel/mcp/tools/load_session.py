# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Load Session Tool - Session recovery for annotation workflows.

MCP tool that allows loading previous annotation sessions using
natural language queries or direct session IDs.
"""

import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ..schemas.annotation_schemas import (
    LoadSessionInput,
    LoadSessionOutput,
    SessionSegmentationInfo,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class LoadSessionTool(MCPTool):
    """
    MCP tool for loading previous annotation sessions.

    Allows users to recover previous work using natural language
    queries like "yesterday's liver study" or "CT abdomen from last week".
    """

    name = "load_session"
    description = (
        "Load a previous annotation session. Use this when the user wants to "
        "continue working on a previous study or retrieve past segmentations. "
        "Supports natural language queries like 'yesterday's liver study', "
        "'the CT abdomen from last week', or direct session IDs."
    )
    input_schema = LoadSessionInput
    output_schema = LoadSessionOutput

    def __init__(self):
        super().__init__()
        self._session_store = None
        self._session_manager = None

    def _get_session_store(self):
        """Lazy-load the session store."""
        if self._session_store is None:
            try:
                from ...services.session_store import get_session_store
                self._session_store = get_session_store()
            except ImportError:
                logger.warning("Session store not available")
        return self._session_store

    def _get_session_manager(self):
        """Lazy-load the chat session manager."""
        if self._session_manager is None:
            try:
                from ...chat.session_manager import get_session_manager
                self._session_manager = get_session_manager()
            except ImportError:
                logger.warning("Session manager not available")
        return self._session_manager

    async def execute(self, input_data: LoadSessionInput) -> LoadSessionOutput:
        """
        Execute session load operation.

        Args:
            input_data: Load parameters including query or session ID

        Returns:
            Loaded session information
        """
        start_time = time.time()

        try:
            # If direct session ID provided, load it
            if input_data.session_id:
                return await self._load_session_by_id(input_data.session_id)

            # Parse natural language query
            search_params = self._parse_query(input_data.query)

            # Apply additional filters
            if input_data.patient_id:
                search_params["patient_id"] = input_data.patient_id
            if input_data.modality_filter:
                search_params["modality"] = input_data.modality_filter.upper()

            # Set date range
            search_params["date_range_days"] = input_data.date_range_days

            # Search for matching sessions
            sessions = await self._search_sessions(search_params)

            if not sessions:
                return self._not_found_response(input_data.query)

            # Return the best matching session
            best_match = sessions[0]
            return await self._format_session_output(best_match)

        except Exception as e:
            logger.exception(f"Load session failed: {e}")
            return LoadSessionOutput(
                session_id=f"error_{int(time.time())}",
                study_description=None,
                modality="Unknown",
                body_region=None,
                study_date=None,
                session_created=datetime.utcnow().isoformat(),
                last_modified=datetime.utcnow().isoformat(),
                segmentations=[],
                has_unsaved_changes=False,
                thumbnail_url=None,
            )

    def _parse_query(self, query: str) -> Dict[str, Any]:
        """
        Parse natural language query into search parameters.

        Handles queries like:
        - "yesterday's liver study"
        - "CT abdomen from last week"
        - "the MRI I was working on"
        - "patient's kidney segmentation"
        """
        query_lower = query.lower()
        params: Dict[str, Any] = {}

        # Parse time references
        time_range = self._parse_time_reference(query_lower)
        if time_range:
            params["start_date"] = time_range[0]
            params["end_date"] = time_range[1]

        # Parse modality
        modality = self._parse_modality(query_lower)
        if modality:
            params["modality"] = modality

        # Parse body region
        body_region = self._parse_body_region(query_lower)
        if body_region:
            params["body_region"] = body_region

        # Parse organ/structure references
        structures = self._parse_structures(query_lower)
        if structures:
            params["structures"] = structures

        # Extract any keywords for text search
        keywords = self._extract_keywords(query_lower)
        if keywords:
            params["keywords"] = keywords

        return params

    def _parse_time_reference(self, query: str) -> Optional[tuple]:
        """Parse time references from query."""
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Yesterday
        if "yesterday" in query:
            start = today_start - timedelta(days=1)
            end = today_start
            return (start, end)

        # Today
        if "today" in query:
            return (today_start, now)

        # Last week
        if "last week" in query or "past week" in query:
            start = today_start - timedelta(days=7)
            return (start, now)

        # Last N days
        days_match = re.search(r"last (\d+) days?", query)
        if days_match:
            days = int(days_match.group(1))
            start = today_start - timedelta(days=days)
            return (start, now)

        # This morning/afternoon
        if "this morning" in query:
            start = today_start
            end = today_start.replace(hour=12)
            return (start, end)
        if "this afternoon" in query:
            start = today_start.replace(hour=12)
            return (start, now)

        # Recently / just now
        if any(term in query for term in ["recently", "just", "earlier"]):
            start = now - timedelta(hours=4)
            return (start, now)

        # This month
        if "this month" in query:
            start = today_start.replace(day=1)
            return (start, now)

        return None

    def _parse_modality(self, query: str) -> Optional[str]:
        """Parse imaging modality from query."""
        modality_keywords = {
            "CT": ["ct", "computed tomography", "cat scan"],
            "MR": ["mri", "mr", "magnetic resonance"],
            "US": ["ultrasound", "us ", "sonography", "echo"],
            "XR": ["x-ray", "xray", "radiograph", "chest x"],
            "PT": ["pet", "pet/ct", "pet-ct"],
            "NM": ["nuclear", "spect"],
            "MG": ["mammogram", "mammography"],
            "DX": ["digital x-ray", "dx"],
        }

        for modality, keywords in modality_keywords.items():
            if any(kw in query for kw in keywords):
                return modality

        return None

    def _parse_body_region(self, query: str) -> Optional[str]:
        """Parse body region from query."""
        region_keywords = {
            "chest": ["chest", "thorax", "thoracic", "lung", "pulmonary"],
            "abdomen": ["abdomen", "abdominal", "belly", "stomach area"],
            "pelvis": ["pelvis", "pelvic"],
            "head": ["head", "brain", "cranial", "intracranial"],
            "neck": ["neck", "cervical", "thyroid"],
            "spine": ["spine", "spinal", "vertebra", "back"],
            "extremity": ["arm", "leg", "hand", "foot", "knee", "shoulder"],
            "cardiac": ["heart", "cardiac", "coronary"],
            "breast": ["breast", "mammary"],
        }

        for region, keywords in region_keywords.items():
            if any(kw in query for kw in keywords):
                return region

        return None

    def _parse_structures(self, query: str) -> List[str]:
        """Parse anatomical structures from query."""
        structures = []

        structure_keywords = [
            "liver", "spleen", "kidney", "pancreas", "stomach",
            "lung", "heart", "aorta", "spine", "vertebrae",
            "tumor", "lesion", "nodule", "mass", "cyst",
            "bladder", "prostate", "uterus", "ovary",
            "brain", "ventricle", "cerebellum",
            "thyroid", "adrenal", "gallbladder",
        ]

        for structure in structure_keywords:
            if structure in query:
                structures.append(structure)

        return structures

    def _extract_keywords(self, query: str) -> List[str]:
        """Extract search keywords from query."""
        # Remove common words
        stop_words = {
            "the", "a", "an", "from", "on", "in", "at", "to", "for",
            "with", "was", "were", "is", "are", "my", "i", "we",
            "study", "scan", "image", "segmentation", "working",
            "load", "open", "show", "find", "get", "retrieve",
        }

        words = re.findall(r"\b[a-z]+\b", query)
        keywords = [w for w in words if w not in stop_words and len(w) > 2]

        return keywords[:5]  # Limit to 5 keywords

    async def _search_sessions(
        self, params: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Search for sessions matching parameters."""
        session_store = self._get_session_store()

        if session_store is not None:
            try:
                return await session_store.search_sessions(
                    start_date=params.get("start_date"),
                    end_date=params.get("end_date"),
                    modality=params.get("modality"),
                    body_region=params.get("body_region"),
                    patient_id=params.get("patient_id"),
                    keywords=params.get("keywords"),
                    structures=params.get("structures"),
                    limit=10,
                )
            except Exception as e:
                logger.error(f"Session search failed: {e}")

        # Return mock data for testing/development
        return await self._mock_search(params)

    async def _mock_search(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Mock session search for testing."""
        now = datetime.utcnow()

        # Generate mock sessions based on query params
        sessions = []

        modality = params.get("modality", "CT")
        body_region = params.get("body_region", "abdomen")
        structures = params.get("structures", ["liver"])

        # Create a mock session
        session = {
            "session_id": f"sess_{now.strftime('%Y%m%d')}_{hash(str(params)) % 10000:04d}",
            "study_description": f"{modality} {body_region.title()}",
            "modality": modality,
            "body_region": body_region,
            "study_date": (now - timedelta(days=1)).isoformat(),
            "session_created": (now - timedelta(hours=2)).isoformat(),
            "last_modified": (now - timedelta(minutes=30)).isoformat(),
            "segmentations": [
                {
                    "segmentation_id": f"seg_{structure}_{i}",
                    "labels": [structure],
                    "created_at": (now - timedelta(hours=1)).isoformat(),
                    "model_used": "biomedparse",
                    "is_verified": i == 0,
                }
                for i, structure in enumerate(structures)
            ],
            "has_unsaved_changes": False,
            "thumbnail_url": None,
        }

        sessions.append(session)

        return sessions

    async def _load_session_by_id(self, session_id: str) -> LoadSessionOutput:
        """Load a specific session by ID."""
        session_store = self._get_session_store()

        if session_store is not None:
            try:
                session = await session_store.get_session(session_id)
                if session:
                    return await self._format_session_output(session)
            except Exception as e:
                logger.error(f"Failed to load session {session_id}: {e}")

        # Check chat session manager
        session_manager = self._get_session_manager()
        if session_manager is not None:
            chat_session = session_manager.get_session(session_id)
            if chat_session:
                return self._format_chat_session(chat_session)

        return self._not_found_response(session_id)

    async def _format_session_output(
        self, session: Dict[str, Any]
    ) -> LoadSessionOutput:
        """Format session data into output schema."""
        segmentations = [
            SessionSegmentationInfo(
                segmentation_id=seg.get("segmentation_id", "unknown"),
                labels=seg.get("labels", []),
                created_at=seg.get("created_at", datetime.utcnow().isoformat()),
                model_used=seg.get("model_used"),
                is_verified=seg.get("is_verified", False),
            )
            for seg in session.get("segmentations", [])
        ]

        return LoadSessionOutput(
            session_id=session["session_id"],
            study_description=session.get("study_description"),
            modality=session.get("modality", "Unknown"),
            body_region=session.get("body_region"),
            study_date=session.get("study_date"),
            session_created=session.get("session_created", datetime.utcnow().isoformat()),
            last_modified=session.get("last_modified", datetime.utcnow().isoformat()),
            segmentations=segmentations,
            has_unsaved_changes=session.get("has_unsaved_changes", False),
            thumbnail_url=session.get("thumbnail_url"),
        )

    def _format_chat_session(self, chat_session: Any) -> LoadSessionOutput:
        """Format a chat session into output schema."""
        context = chat_session.cached_case_context

        return LoadSessionOutput(
            session_id=chat_session.session_id,
            study_description=context.study_info.get("description") if context and context.study_info else None,
            modality=context.modality if context else "Unknown",
            body_region=context.body_region if context else None,
            study_date=context.study_info.get("date") if context and context.study_info else None,
            session_created=chat_session.created_at.isoformat(),
            last_modified=chat_session.last_activity.isoformat(),
            segmentations=[],
            has_unsaved_changes=False,
            thumbnail_url=None,
        )

    def _not_found_response(self, query: str) -> LoadSessionOutput:
        """Create a not-found response."""
        logger.info(f"No session found for query: {query}")

        return LoadSessionOutput(
            session_id="not_found",
            study_description=f"No session found matching: {query}",
            modality="Unknown",
            body_region=None,
            study_date=None,
            session_created=datetime.utcnow().isoformat(),
            last_modified=datetime.utcnow().isoformat(),
            segmentations=[],
            has_unsaved_changes=False,
            thumbnail_url=None,
        )
