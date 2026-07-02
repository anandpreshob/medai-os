# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Detection Retrieval Service

Fetches pre-computed AI detection results from Orthanc attachments.
Used by the triaging agent to incorporate AI findings into prioritization.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Orthanc configuration
ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USERNAME = os.environ.get("ORTHANC_USERNAME", "")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "")

# Attachment name for AI detection results
AI_DETECTION_ATTACHMENT = "ai-detection"

# Minimum confidence threshold for triage consideration
DEFAULT_CONFIDENCE_THRESHOLD = 0.8


class DetectionRetrievalService:
    """
    Service to retrieve AI detection results from Orthanc attachments.

    Detections are stored as attachments on DICOM instances when images
    are uploaded. This service fetches those results for use in triaging.
    """

    def __init__(
        self,
        orthanc_url: str = ORTHANC_URL,
        username: str = ORTHANC_USERNAME,
        password: str = ORTHANC_PASSWORD
    ):
        self.orthanc_url = orthanc_url.rstrip("/")
        self.auth = (username, password) if username else None

    async def _make_request(self, method: str, path: str) -> Optional[httpx.Response]:
        """Make an authenticated request to Orthanc."""
        url = f"{self.orthanc_url}{path}"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    method,
                    url,
                    auth=self.auth,
                    timeout=10.0
                )
                return response
        except Exception as e:
            logger.warning(f"Orthanc request failed: {e}")
            return None

    async def get_study_orthanc_id(self, study_uid: str) -> Optional[str]:
        """
        Look up Orthanc study ID from DICOM StudyInstanceUID.

        Args:
            study_uid: DICOM StudyInstanceUID

        Returns:
            Orthanc internal study ID or None if not found
        """
        response = await self._make_request(
            "POST",
            "/tools/lookup",
        )

        if not response:
            return None

        # Alternative: search by StudyInstanceUID
        search_response = await self._make_request(
            "GET",
            f"/studies?StudyInstanceUID={study_uid}"
        )

        if search_response and search_response.is_success:
            studies = search_response.json()
            if studies and len(studies) > 0:
                return studies[0]  # Return first matching study ID

        return None

    async def get_study_instances(self, study_orthanc_id: str) -> List[str]:
        """
        Get all instance IDs for a study.

        Args:
            study_orthanc_id: Orthanc internal study ID

        Returns:
            List of instance IDs
        """
        response = await self._make_request(
            "GET",
            f"/studies/{study_orthanc_id}/instances"
        )

        if not response or not response.is_success:
            return []

        instances = response.json()
        return [inst.get("ID") for inst in instances if inst.get("ID")]

    async def get_instance_detection(
        self,
        instance_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get AI detection results for a single instance.

        Args:
            instance_id: Orthanc instance ID

        Returns:
            Detection result or None if not found
        """
        response = await self._make_request(
            "GET",
            f"/instances/{instance_id}/attachments/{AI_DETECTION_ATTACHMENT}/data"
        )

        if not response or not response.is_success:
            return None

        try:
            return response.json()
        except Exception as e:
            logger.warning(f"Failed to parse detection data: {e}")
            return None

    async def get_study_detections(
        self,
        study_uid: str,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
    ) -> List[Dict[str, Any]]:
        """
        Get all AI detections for a study.

        Fetches detection attachments from all instances in the study,
        filters by confidence threshold, and returns aggregated findings.

        Args:
            study_uid: DICOM StudyInstanceUID
            confidence_threshold: Minimum confidence to include (0-1)

        Returns:
            List of detection findings meeting the threshold
        """
        # Look up study in Orthanc
        study_orthanc_id = await self.get_study_orthanc_id(study_uid)

        if not study_orthanc_id:
            logger.debug(f"Study not found in Orthanc: {study_uid}")
            return []

        # Get all instances
        instance_ids = await self.get_study_instances(study_orthanc_id)

        if not instance_ids:
            logger.debug(f"No instances found for study: {study_uid}")
            return []

        # Collect detections from all instances
        all_detections: List[Dict[str, Any]] = []

        for instance_id in instance_ids:
            detection_data = await self.get_instance_detection(instance_id)

            if not detection_data:
                continue

            # Check if detection was successful
            if detection_data.get("status") != "success":
                continue

            # Filter detections by confidence threshold
            for det in detection_data.get("detections", []):
                if det.get("confidence", 0) >= confidence_threshold:
                    all_detections.append({
                        "label": det.get("label", "Unknown"),
                        "confidence": det.get("confidence", 0),
                        "x_min": det.get("x_min"),
                        "y_min": det.get("y_min"),
                        "x_max": det.get("x_max"),
                        "y_max": det.get("y_max"),
                        "instance_id": instance_id,
                    })

        # Sort by confidence (highest first)
        all_detections.sort(key=lambda d: d.get("confidence", 0), reverse=True)

        logger.info(
            f"Retrieved {len(all_detections)} detections for study {study_uid} "
            f"(threshold: {confidence_threshold})"
        )

        return all_detections

    async def get_detections_for_triage(
        self,
        study_uid: str,
        modality: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get detections formatted for triaging.

        Only retrieves detections for X-ray modalities (CR, DX, XR).
        Returns simplified format suitable for the triaging agent.

        Args:
            study_uid: DICOM StudyInstanceUID
            modality: Optional modality filter

        Returns:
            List of detections in triage format
        """
        # Only fetch detections for X-ray modalities
        xray_modalities = {"CR", "DX", "XR"}

        if modality and modality.upper() not in xray_modalities:
            return []

        return await self.get_study_detections(
            study_uid,
            confidence_threshold=DEFAULT_CONFIDENCE_THRESHOLD
        )


# Module-level singleton
_detection_service: Optional[DetectionRetrievalService] = None


def get_detection_retrieval_service() -> DetectionRetrievalService:
    """Get or create the detection retrieval service singleton."""
    global _detection_service

    if _detection_service is None:
        _detection_service = DetectionRetrievalService()

    return _detection_service


async def get_study_detections(
    study_uid: str,
    modality: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Convenience function to get detections for a study.

    Args:
        study_uid: DICOM StudyInstanceUID
        modality: Optional modality (only X-ray modalities are processed)

    Returns:
        List of AI detections
    """
    service = get_detection_retrieval_service()
    return await service.get_detections_for_triage(study_uid, modality)
