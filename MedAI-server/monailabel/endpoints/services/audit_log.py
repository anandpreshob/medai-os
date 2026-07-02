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
Audit Log Service - JSONL-based audit logging

Provides:
- JSONL file-based audit log storage
- Efficient querying with filtering
- Log rotation support
- Statistics aggregation
"""

import hashlib
import json
import logging
import os
import threading
import uuid
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

SCHEMA_VERSION = "1.1.0"
GENESIS_HASH = "GENESIS"


def canonical_json(obj: Dict[str, Any]) -> str:
    """Deterministic JSON serialization (sorted keys, no whitespace)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()

logger = logging.getLogger(__name__)


@dataclass
class AuditEvent:
    """Represents a single audit event."""
    event_type: str
    severity: str
    timestamp: str
    username: Optional[str] = None
    session_id: Optional[str] = None
    patient_id: Optional[str] = None
    study_uid: Optional[str] = None
    series_uid: Optional[str] = None
    segmentation_id: Optional[str] = None
    model_name: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    server_timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        d = asdict(self)
        # Rename fields to match API schema
        d["eventType"] = d.pop("event_type")
        d["sessionId"] = d.pop("session_id")
        d["patientId"] = d.pop("patient_id")
        d["studyUID"] = d.pop("study_uid")
        d["seriesUID"] = d.pop("series_uid")
        d["segmentationId"] = d.pop("segmentation_id")
        d["modelName"] = d.pop("model_name")
        d["clientIp"] = d.pop("client_ip")
        d["userAgent"] = d.pop("user_agent")
        d["serverTimestamp"] = d.pop("server_timestamp")
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "AuditEvent":
        """Create from dictionary."""
        # Handle both API format and internal format
        return cls(
            event_type=d.get("eventType") or d.get("event_type", ""),
            severity=d.get("severity", "info"),
            timestamp=d.get("timestamp", ""),
            username=d.get("username"),
            session_id=d.get("sessionId") or d.get("session_id"),
            patient_id=d.get("patientId") or d.get("patient_id"),
            study_uid=d.get("studyUID") or d.get("study_uid"),
            series_uid=d.get("seriesUID") or d.get("series_uid"),
            segmentation_id=d.get("segmentationId") or d.get("segmentation_id"),
            model_name=d.get("modelName") or d.get("model_name"),
            details=d.get("details"),
            client_ip=d.get("clientIp") or d.get("client_ip"),
            user_agent=d.get("userAgent") or d.get("user_agent"),
            id=d.get("id", str(uuid.uuid4())),
            server_timestamp=d.get("serverTimestamp") or d.get("server_timestamp", datetime.now().isoformat()),
        )


class AuditLogService:
    """
    JSONL-based audit log service.

    Stores audit events in JSONL (JSON Lines) format for easy querying
    and compatibility with log analysis tools.
    """

    def __init__(
        self,
        log_dir: str = "/var/log/medai/audit",
        max_file_size_mb: int = 100,
        max_files: int = 10,
    ):
        """
        Initialize audit log service.

        Args:
            log_dir: Directory for audit log files
            max_file_size_mb: Maximum size of a single log file in MB
            max_files: Maximum number of rotated log files to keep
        """
        self.log_dir = Path(log_dir)
        self.max_file_size = max_file_size_mb * 1024 * 1024
        self.max_files = max_files
        self._lock = threading.Lock()
        self._current_file: Optional[Path] = None
        self._file_handle = None
        self._prev_hash: str = GENESIS_HASH

        # Create log directory
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Initialize current log file
        self._init_current_file()
        self._load_prev_hash()

        logger.info(f"AuditLogService initialized: {self.log_dir}")

    def _init_current_file(self):
        """Initialize or get current log file."""
        today = datetime.now().strftime("%Y%m%d")
        self._current_file = self.log_dir / f"audit_{today}.jsonl"

    def _load_prev_hash(self):
        """Read the last recordHash from the current log file to resume the chain."""
        if self._current_file and self._current_file.exists():
            last_hash = GENESIS_HASH
            with open(self._current_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        last_hash = data.get("recordHash", last_hash)
                    except json.JSONDecodeError:
                        continue
            self._prev_hash = last_hash
        else:
            self._prev_hash = GENESIS_HASH

    def _get_file_handle(self):
        """Get or create file handle for writing."""
        if self._file_handle is None or self._file_handle.closed:
            self._init_current_file()
            self._file_handle = open(self._current_file, "a", encoding="utf-8")
        return self._file_handle

    def _check_rotation(self):
        """Check if log rotation is needed."""
        if self._current_file and self._current_file.exists():
            if self._current_file.stat().st_size >= self.max_file_size:
                self._rotate_logs()

    def _rotate_logs(self):
        """Rotate log files."""
        if self._file_handle:
            self._file_handle.close()
            self._file_handle = None

        # Rename current file with timestamp
        if self._current_file and self._current_file.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            rotated_name = self._current_file.stem + f"_{timestamp}.jsonl"
            rotated_path = self._current_file.parent / rotated_name
            self._current_file.rename(rotated_path)

        # Clean up old files
        self._cleanup_old_files()

        # Create new file — fresh hash chain
        self._init_current_file()
        self._prev_hash = GENESIS_HASH

    def _cleanup_old_files(self):
        """Remove old log files beyond max_files limit."""
        log_files = sorted(
            self.log_dir.glob("audit_*.jsonl"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        for old_file in log_files[self.max_files:]:
            try:
                old_file.unlink()
                logger.info(f"Removed old audit log: {old_file}")
            except Exception as e:
                logger.warning(f"Failed to remove old log {old_file}: {e}")

    def log_event(self, event: AuditEvent):
        """
        Log a single audit event with tamper-evident hash chain.

        Args:
            event: Audit event to log
        """
        with self._lock:
            try:
                self._check_rotation()
                handle = self._get_file_handle()

                # Build payload dict (without hash-chain fields)
                payload = event.to_dict()

                # Compute hashes
                canonical_payload_hash = sha256_hex(canonical_json(payload))
                prev = self._prev_hash
                record_hash = sha256_hex(prev + "\n" + canonical_payload_hash)

                # Attach hash-chain fields
                payload["schemaVersion"] = SCHEMA_VERSION
                payload["canonicalPayloadHash"] = canonical_payload_hash
                payload["prevRecordHash"] = prev
                payload["recordHash"] = record_hash

                # Write as JSON line
                line = json.dumps(payload, separators=(",", ":")) + "\n"
                handle.write(line)
                handle.flush()

                self._prev_hash = record_hash

            except Exception as e:
                logger.error(f"Failed to log audit event: {e}")

    def query_logs(
        self,
        event_types: Optional[List[str]] = None,
        username: Optional[str] = None,
        patient_id: Optional[str] = None,
        study_uid: Optional[str] = None,
        segmentation_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        severities: Optional[List[str]] = None,
        limit: int = 100,
        offset: int = 0,
        sort_order: str = "desc",
    ) -> Tuple[List[AuditEvent], int]:
        """
        Query audit logs with filters.

        Args:
            event_types: Filter by event types
            username: Filter by username
            patient_id: Filter by patient ID
            study_uid: Filter by study UID
            segmentation_id: Filter by segmentation ID
            start_time: Filter by start time
            end_time: Filter by end time
            severities: Filter by severity levels
            limit: Maximum results to return
            offset: Offset for pagination
            sort_order: Sort order ("asc" or "desc")

        Returns:
            Tuple of (matching events, total count)
        """
        all_entries = []

        # Read from all log files
        log_files = sorted(self.log_dir.glob("audit_*.jsonl"), reverse=(sort_order == "desc"))

        for log_file in log_files:
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue

                        try:
                            data = json.loads(line)
                            event = AuditEvent.from_dict(data)

                            # Apply filters
                            if not self._matches_filters(
                                event,
                                event_types=event_types,
                                username=username,
                                patient_id=patient_id,
                                study_uid=study_uid,
                                segmentation_id=segmentation_id,
                                start_time=start_time,
                                end_time=end_time,
                                severities=severities,
                            ):
                                continue

                            all_entries.append(event)

                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON line in {log_file}")
                            continue

            except Exception as e:
                logger.warning(f"Failed to read log file {log_file}: {e}")

        # Sort by timestamp
        all_entries.sort(
            key=lambda e: e.timestamp,
            reverse=(sort_order == "desc"),
        )

        total_count = len(all_entries)

        # Apply pagination
        paginated = all_entries[offset : offset + limit]

        return paginated, total_count

    def _matches_filters(
        self,
        event: AuditEvent,
        event_types: Optional[List[str]],
        username: Optional[str],
        patient_id: Optional[str],
        study_uid: Optional[str],
        segmentation_id: Optional[str],
        start_time: Optional[datetime],
        end_time: Optional[datetime],
        severities: Optional[List[str]],
    ) -> bool:
        """Check if event matches all filters."""
        if event_types and event.event_type not in event_types:
            return False

        if username and event.username != username:
            return False

        if patient_id and event.patient_id != patient_id:
            return False

        if study_uid and event.study_uid != study_uid:
            return False

        if segmentation_id and event.segmentation_id != segmentation_id:
            return False

        if severities and event.severity not in severities:
            return False

        if start_time or end_time:
            try:
                event_time = datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))
                if start_time and event_time < start_time:
                    return False
                if end_time and event_time > end_time:
                    return False
            except ValueError:
                pass

        return True

    def get_stats(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get audit log statistics.

        Args:
            start_time: Filter by start time
            end_time: Filter by end time

        Returns:
            Dictionary with statistics
        """
        entries, total = self.query_logs(
            start_time=start_time,
            end_time=end_time,
            limit=100000,
        )

        # Aggregate stats
        by_event_type = defaultdict(int)
        by_severity = defaultdict(int)
        by_user = defaultdict(int)
        by_date = defaultdict(int)

        for event in entries:
            by_event_type[event.event_type] += 1
            by_severity[event.severity] += 1
            if event.username:
                by_user[event.username] += 1
            try:
                date = event.timestamp[:10]  # YYYY-MM-DD
                by_date[date] += 1
            except (IndexError, TypeError):
                pass

        return {
            "totalEvents": total,
            "byEventType": dict(by_event_type),
            "bySeverity": dict(by_severity),
            "byUser": dict(by_user),
            "byDate": dict(sorted(by_date.items())),
            "timeRange": {
                "start": start_time.isoformat() if start_time else None,
                "end": end_time.isoformat() if end_time else None,
            },
        }

    def verify_chain(self, file_path: Optional[Path] = None) -> Dict[str, Any]:
        """
        Verify the hash chain integrity of an audit log file.

        Args:
            file_path: Specific log file to verify. Defaults to current file.

        Returns:
            Dict with valid (bool), records_checked (int), and error (str|None).
        """
        target = file_path or self._current_file
        if not target or not target.exists():
            return {"valid": True, "records_checked": 0, "error": None}

        prev_hash = GENESIS_HASH
        records_checked = 0

        try:
            with open(target, "r", encoding="utf-8") as f:
                for lineno, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        return {
                            "valid": False,
                            "records_checked": records_checked,
                            "error": f"Invalid JSON on line {lineno}",
                        }

                    stored_prev = data.get("prevRecordHash")
                    stored_record = data.get("recordHash")
                    stored_payload = data.get("canonicalPayloadHash")

                    if stored_prev is None or stored_record is None or stored_payload is None:
                        return {
                            "valid": False,
                            "records_checked": records_checked,
                            "error": f"Missing hash-chain fields on line {lineno}",
                        }

                    if stored_prev != prev_hash:
                        return {
                            "valid": False,
                            "records_checked": records_checked,
                            "error": f"prevRecordHash mismatch on line {lineno}",
                        }

                    expected_record = sha256_hex(prev_hash + "\n" + stored_payload)
                    if stored_record != expected_record:
                        return {
                            "valid": False,
                            "records_checked": records_checked,
                            "error": f"recordHash mismatch on line {lineno}",
                        }

                    # Verify canonical payload hash against the payload fields
                    payload = {
                        k: v
                        for k, v in data.items()
                        if k not in ("schemaVersion", "canonicalPayloadHash", "prevRecordHash", "recordHash")
                    }
                    expected_payload_hash = sha256_hex(canonical_json(payload))
                    if stored_payload != expected_payload_hash:
                        return {
                            "valid": False,
                            "records_checked": records_checked,
                            "error": f"canonicalPayloadHash mismatch on line {lineno}",
                        }

                    prev_hash = stored_record
                    records_checked += 1

        except Exception as e:
            return {
                "valid": False,
                "records_checked": records_checked,
                "error": str(e),
            }

        return {"valid": True, "records_checked": records_checked, "error": None}

    def close(self):
        """Close file handles."""
        if self._file_handle:
            self._file_handle.close()
            self._file_handle = None


# Singleton instance
_audit_log_service: Optional[AuditLogService] = None


def get_audit_log_service() -> AuditLogService:
    """Get or create the audit log service singleton."""
    global _audit_log_service
    if _audit_log_service is None:
        # Get log directory from environment or use default
        log_dir = os.environ.get("MEDAI_AUDIT_LOG_DIR", "/var/log/medai/audit")
        _audit_log_service = AuditLogService(log_dir=log_dir)
    return _audit_log_service


def init_audit_log_service(
    log_dir: str = "/var/log/medai/audit",
    max_file_size_mb: int = 100,
    max_files: int = 10,
) -> AuditLogService:
    """Initialize the audit log service with custom settings."""
    global _audit_log_service
    _audit_log_service = AuditLogService(
        log_dir=log_dir,
        max_file_size_mb=max_file_size_mb,
        max_files=max_files,
    )
    return _audit_log_service
