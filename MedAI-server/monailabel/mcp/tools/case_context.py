# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Case Context Tool - Extract context from MONAI Label viewer sessions.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

from ..schemas import (
    CaseContextInput,
    CaseContextOutput,
    DetectionInfo,
    SegmentationInfo,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class CaseContextTool(MCPTool):
    """
    MCP tool for fetching case context from MONAI Label sessions.

    Extracts modality, body region, segmentations, volumetrics,
    and detection results from an active viewer session.
    """

    name = "case_context"
    description = (
        "Fetch comprehensive case context from the current viewer session. "
        "Returns imaging modality, body region, segmentation labels with volumes, "
        "AI detection results, and whether this is a longitudinal study. "
        "Use this to understand the current case before drafting reports or searching for evidence."
    )
    input_schema = CaseContextInput
    output_schema = CaseContextOutput

    # MONAI Label API endpoints (relative to base URL)
    SESSION_ENDPOINT = "/session"
    DATASTORE_ENDPOINT = "/datastore"

    def __init__(
        self,
        monai_label_url: str = "http://localhost:8000/monai",
        timeout: float = 30.0,
    ):
        super().__init__()
        self.monai_label_url = monai_label_url.rstrip("/")
        self.timeout = timeout

    async def execute(self, input_data: CaseContextInput) -> CaseContextOutput:
        """
        Fetch case context from MONAI Label session.

        Args:
            input_data: Session ID and options

        Returns:
            Comprehensive case context
        """
        session_id = input_data.session_id

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Fetch session data
                session_data = await self._fetch_session_data(client, session_id)

                if not session_data:
                    logger.warning(f"Session {session_id} not found")
                    return self._empty_context(session_id)

                # Extract basic metadata
                modality = self._extract_modality(session_data)
                body_region = self._extract_body_region(session_data)
                study_description = session_data.get("studyDescription")
                patient_id = session_data.get("patientId")
                study_date = session_data.get("studyDate")

                # Extract segmentations
                segmentations = []
                if input_data.include_segmentations:
                    segmentations = self._extract_segmentations(session_data)

                # Extract analytics (volumetrics, radiomics)
                volumetrics_summary = None
                radiomics_summary = None
                if input_data.include_analytics:
                    volumetrics_summary = self._extract_volumetrics(session_data)
                    radiomics_summary = self._extract_radiomics(session_data)

                # Extract detections
                detections = []
                if input_data.include_detections:
                    detections = self._extract_detections(session_data)

                # Check if longitudinal
                is_longitudinal = self._check_longitudinal(session_data)
                prior_studies = session_data.get("priorStudies", [])

                return CaseContextOutput(
                    session_id=session_id,
                    modality=modality,
                    body_region=body_region,
                    study_description=study_description,
                    patient_id=patient_id,
                    study_date=study_date,
                    segmentations=segmentations,
                    volumetrics_summary=volumetrics_summary,
                    radiomics_summary=radiomics_summary,
                    detections=detections,
                    is_longitudinal=is_longitudinal,
                    prior_studies=prior_studies if prior_studies else None,
                )

        except httpx.RequestError as e:
            logger.error(f"Failed to fetch session data: {e}")
            return self._empty_context(session_id)

        except Exception as e:
            logger.exception(f"Error extracting case context: {e}")
            return self._empty_context(session_id)

    async def _fetch_session_data(
        self, client: httpx.AsyncClient, session_id: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch session data from MONAI Label API."""
        try:
            url = f"{self.monai_label_url}{self.SESSION_ENDPOINT}/{session_id}"
            response = await client.get(url)

            if response.status_code == 404:
                return None

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching session: {e}")
            return None

    def _extract_modality(self, session_data: Dict[str, Any]) -> str:
        """Extract imaging modality from session data."""
        # Check DICOM metadata
        dicom_meta = session_data.get("dicomMetadata", {})
        modality = dicom_meta.get("Modality")

        if modality:
            return modality

        # Check session info
        info = session_data.get("info", {})
        modality = info.get("modality")

        if modality:
            return modality

        # Try to infer from study description
        study_desc = session_data.get("studyDescription", "").lower()
        if "ct" in study_desc or "computed tomography" in study_desc:
            return "CT"
        elif "mr" in study_desc or "mri" in study_desc:
            return "MR"
        elif "x-ray" in study_desc or "radiograph" in study_desc:
            return "XR"
        elif "ultrasound" in study_desc:
            return "US"

        return "Unknown"

    def _extract_body_region(self, session_data: Dict[str, Any]) -> Optional[str]:
        """Extract body region from session data."""
        # Check DICOM metadata
        dicom_meta = session_data.get("dicomMetadata", {})
        body_part = dicom_meta.get("BodyPartExamined")

        if body_part:
            return body_part.lower()

        # Check session info
        info = session_data.get("info", {})
        body_region = info.get("bodyRegion") or info.get("body_region")

        if body_region:
            return body_region.lower()

        # Try to infer from study description
        study_desc = session_data.get("studyDescription", "").lower()

        region_keywords = {
            "chest": "chest",
            "thorax": "chest",
            "lung": "chest",
            "abdomen": "abdomen",
            "pelvis": "pelvis",
            "brain": "head",
            "head": "head",
            "spine": "spine",
            "breast": "breast",
            "cardiac": "cardiac",
            "heart": "cardiac",
        }

        for keyword, region in region_keywords.items():
            if keyword in study_desc:
                return region

        return None

    def _extract_segmentations(
        self, session_data: Dict[str, Any]
    ) -> List[SegmentationInfo]:
        """Extract segmentation labels and volumes."""
        segmentations = []

        # Check for labels in session
        labels = session_data.get("labels", {})

        for label_name, label_data in labels.items():
            if isinstance(label_data, dict):
                segmentations.append(
                    SegmentationInfo(
                        label=label_name,
                        volume_ml=label_data.get("volume_ml"),
                        volume_cm3=label_data.get("volume_cm3"),
                        color=label_data.get("color"),
                        instance_count=label_data.get("instance_count", 1),
                    )
                )

        # Check for volumetrics data
        volumetrics = session_data.get("volumetrics", {})
        segments = volumetrics.get("segments", [])

        for segment in segments:
            label = segment.get("label", f"Segment {segment.get('segment_index', '?')}")

            # Avoid duplicates
            if not any(s.label == label for s in segmentations):
                segmentations.append(
                    SegmentationInfo(
                        label=label,
                        volume_cm3=segment.get("total_volume_cm3"),
                        instance_count=segment.get("instance_count", 1),
                    )
                )

        return segmentations

    def _extract_volumetrics(
        self, session_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Extract volumetrics summary."""
        volumetrics = session_data.get("volumetrics")

        if not volumetrics:
            return None

        # Summarize key metrics
        summary = {
            "total_segments": len(volumetrics.get("segments", [])),
            "segments": [],
        }

        for segment in volumetrics.get("segments", []):
            summary["segments"].append({
                "label": segment.get("label"),
                "volume_cm3": segment.get("total_volume_cm3"),
                "instance_count": segment.get("instance_count"),
            })

        return summary

    def _extract_radiomics(
        self, session_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Extract radiomics summary."""
        radiomics = session_data.get("radiomics")

        if not radiomics:
            return None

        # Summarize key features
        summary = {
            "feature_count": radiomics.get("metadata", {}).get("feature_count", 0),
            "segments": [],
        }

        for segment in radiomics.get("segments", []):
            if segment.get("error"):
                continue

            features = segment.get("features", {})
            firstorder = features.get("firstorder", {})

            summary["segments"].append({
                "label": segment.get("label"),
                "mean_intensity": firstorder.get("Mean"),
                "std_intensity": firstorder.get("StandardDeviation"),
            })

        return summary

    def _extract_detections(
        self, session_data: Dict[str, Any]
    ) -> List[DetectionInfo]:
        """Extract AI detection results."""
        detections = []

        # Check for detection results
        detection_data = session_data.get("detections", [])

        for det in detection_data:
            detections.append(
                DetectionInfo(
                    label=det.get("label", "Unknown"),
                    confidence=det.get("confidence", 0.0),
                    bbox=det.get("bbox"),
                    location=det.get("location"),
                )
            )

        # Check for findings
        findings = session_data.get("findings", [])

        for finding in findings:
            detections.append(
                DetectionInfo(
                    label=finding.get("label", finding.get("name", "Unknown")),
                    confidence=finding.get("confidence", finding.get("score", 0.0)),
                    bbox=finding.get("bbox"),
                    location=finding.get("location"),
                )
            )

        return detections

    def _check_longitudinal(self, session_data: Dict[str, Any]) -> bool:
        """Check if this is a longitudinal study session."""
        # Check for longitudinal flag
        if session_data.get("isLongitudinal") or session_data.get("is_longitudinal"):
            return True

        # Check for prior studies
        prior_studies = session_data.get("priorStudies", [])
        if prior_studies and len(prior_studies) > 0:
            return True

        # Check session type
        session_type = session_data.get("sessionType", "").lower()
        if "longitudinal" in session_type:
            return True

        return False

    def _empty_context(self, session_id: str) -> CaseContextOutput:
        """Return empty context when session not found."""
        return CaseContextOutput(
            session_id=session_id,
            modality="Unknown",
            body_region=None,
            segmentations=[],
            volumetrics_summary=None,
            radiomics_summary=None,
            detections=[],
            is_longitudinal=False,
        )
