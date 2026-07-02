# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Audit Log Endpoints

Provides endpoints for:
- Logging audit events
- Querying audit logs
- Exporting audit trails
"""

import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from monailabel.endpoints.services.audit_log import (
    AuditLogService,
    AuditEvent,
    get_audit_log_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/audit",
    tags=["Audit"],
    responses={
        404: {"description": "Not found"},
        200: {"description": "OK"},
    },
)


class AuditEventRequest(BaseModel):
    """Request model for a single audit event."""
    eventType: str
    severity: str = "info"
    timestamp: str
    username: Optional[str] = None
    sessionId: Optional[str] = None
    patientId: Optional[str] = None
    studyUID: Optional[str] = None
    seriesUID: Optional[str] = None
    segmentationId: Optional[str] = None
    modelName: Optional[str] = None
    details: Optional[dict] = None
    userAgent: Optional[str] = None


class AuditLogRequest(BaseModel):
    """Request model for batch audit log submission."""
    events: List[AuditEventRequest]


@router.post("/log")
async def log_audit_events(
    request: Request,
    body: AuditLogRequest,
):
    """
    Log one or more audit events.

    Request body:
        - events: List of audit events to log

    Returns:
        JSON with success status and logged event count
    """
    try:
        audit_service = get_audit_log_service()

        # Get client IP from request
        client_ip = request.client.host if request.client else None

        logged_count = 0
        for event_req in body.events:
            event = AuditEvent(
                event_type=event_req.eventType,
                severity=event_req.severity,
                timestamp=event_req.timestamp,
                username=event_req.username,
                session_id=event_req.sessionId,
                patient_id=event_req.patientId,
                study_uid=event_req.studyUID,
                series_uid=event_req.seriesUID,
                segmentation_id=event_req.segmentationId,
                model_name=event_req.modelName,
                details=event_req.details,
                client_ip=client_ip,
                user_agent=event_req.userAgent,
            )

            audit_service.log_event(event)
            logged_count += 1

        return {"success": True, "loggedCount": logged_count}

    except Exception as e:
        logger.exception("Failed to log audit events")
        raise HTTPException(status_code=500, detail=f"Logging failed: {str(e)}")


@router.get("/query")
async def query_audit_logs(
    event_types: Optional[str] = Query(None, description="Comma-separated event types"),
    username: Optional[str] = Query(None, description="Filter by username"),
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    study_uid: Optional[str] = Query(None, description="Filter by study UID"),
    segmentation_id: Optional[str] = Query(None, description="Filter by segmentation ID"),
    start_time: Optional[str] = Query(None, description="Start time (ISO format)"),
    end_time: Optional[str] = Query(None, description="End time (ISO format)"),
    severities: Optional[str] = Query(None, description="Comma-separated severities"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
):
    """
    Query audit logs with filters.

    Returns:
        JSON with matching log entries and pagination info
    """
    try:
        audit_service = get_audit_log_service()

        # Parse comma-separated values
        event_type_list = event_types.split(",") if event_types else None
        severity_list = severities.split(",") if severities else None

        # Parse timestamps
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        # Query logs
        entries, total_count = audit_service.query_logs(
            event_types=event_type_list,
            username=username,
            patient_id=patient_id,
            study_uid=study_uid,
            segmentation_id=segmentation_id,
            start_time=start_dt,
            end_time=end_dt,
            severities=severity_list,
            limit=limit,
            offset=offset,
            sort_order=sort_order,
        )

        return {
            "entries": [e.to_dict() for e in entries],
            "totalCount": total_count,
            "query": {
                "limit": limit,
                "offset": offset,
                "hasMore": (offset + len(entries)) < total_count,
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid query parameter: {str(e)}")
    except Exception as e:
        logger.exception("Failed to query audit logs")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.get("/segmentation/{segmentation_id}")
async def get_segmentation_audit_trail(
    segmentation_id: str,
    limit: int = Query(1000, ge=1, le=10000),
):
    """
    Get complete audit trail for a segmentation.

    Returns:
        JSON with all audit entries for the segmentation
    """
    try:
        audit_service = get_audit_log_service()

        entries, total_count = audit_service.query_logs(
            segmentation_id=segmentation_id,
            limit=limit,
            offset=0,
            sort_order="asc",
        )

        return {
            "segmentationId": segmentation_id,
            "entries": [e.to_dict() for e in entries],
            "totalCount": total_count,
        }

    except Exception as e:
        logger.exception("Failed to get segmentation audit trail")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/study/{study_uid}")
async def get_study_audit_trail(
    study_uid: str,
    limit: int = Query(1000, ge=1, le=10000),
):
    """
    Get complete audit trail for a study.

    Returns:
        JSON with all audit entries for the study
    """
    try:
        audit_service = get_audit_log_service()

        entries, total_count = audit_service.query_logs(
            study_uid=study_uid,
            limit=limit,
            offset=0,
            sort_order="asc",
        )

        return {
            "studyUID": study_uid,
            "entries": [e.to_dict() for e in entries],
            "totalCount": total_count,
        }

    except Exception as e:
        logger.exception("Failed to get study audit trail")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_audit_logs(
    event_types: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    study_uid: Optional[str] = Query(None),
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
    format: str = Query("jsonl", description="Export format: jsonl or csv"),
):
    """
    Export audit logs as JSONL or CSV file.

    Returns:
        Streaming file download
    """
    try:
        audit_service = get_audit_log_service()

        # Parse filters
        event_type_list = event_types.split(",") if event_types else None
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        # Get all matching entries (no pagination)
        entries, _ = audit_service.query_logs(
            event_types=event_type_list,
            username=username,
            patient_id=patient_id,
            study_uid=study_uid,
            start_time=start_dt,
            end_time=end_dt,
            limit=100000,  # Large limit for export
            offset=0,
            sort_order="asc",
        )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format == "csv":
            import csv
            import io

            output = io.StringIO()
            if entries:
                fieldnames = list(entries[0].to_dict().keys())
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                for entry in entries:
                    row = entry.to_dict()
                    # Convert dict fields to JSON strings
                    if row.get("details"):
                        row["details"] = json.dumps(row["details"])
                    writer.writerow(row)

            return StreamingResponse(
                io.BytesIO(output.getvalue().encode("utf-8")),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=audit_log_{timestamp}.csv"},
            )
        else:
            # JSONL format
            import io

            lines = [json.dumps(e.to_dict()) + "\n" for e in entries]
            content = "".join(lines)

            return StreamingResponse(
                io.BytesIO(content.encode("utf-8")),
                media_type="application/x-ndjson",
                headers={"Content-Disposition": f"attachment; filename=audit_log_{timestamp}.jsonl"},
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {str(e)}")
    except Exception as e:
        logger.exception("Failed to export audit logs")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/verify")
async def verify_audit_chain():
    """
    Verify the integrity of the current audit log hash chain.

    Returns:
        JSON with valid (bool), records_checked (int), and error (str|None).
    """
    try:
        audit_service = get_audit_log_service()
        result = audit_service.verify_chain()
        status_code = 200 if result["valid"] else 409
        return JSONResponse(content=result, status_code=status_code)
    except Exception as e:
        logger.exception("Failed to verify audit chain")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_audit_stats(
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
):
    """
    Get audit log statistics.

    Returns:
        JSON with event counts by type, user, etc.
    """
    try:
        audit_service = get_audit_log_service()

        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        stats = audit_service.get_stats(start_time=start_dt, end_time=end_dt)

        return stats

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {str(e)}")
    except Exception as e:
        logger.exception("Failed to get audit stats")
        raise HTTPException(status_code=500, detail=str(e))
