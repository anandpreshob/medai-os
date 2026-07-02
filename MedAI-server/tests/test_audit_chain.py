"""Tests for audit log hash-chain integrity."""

import json
import pytest
from pathlib import Path

from monailabel.endpoints.services.audit_log import (
    AuditEvent,
    AuditLogService,
    GENESIS_HASH,
    canonical_json,
    sha256_hex,
)


@pytest.fixture()
def audit_service(tmp_path):
    """Create an AuditLogService writing to a temp directory."""
    return AuditLogService(log_dir=str(tmp_path))


def _make_event(**overrides):
    defaults = dict(
        event_type="test.event",
        severity="info",
        timestamp="2025-01-01T00:00:00Z",
        username="tester",
    )
    defaults.update(overrides)
    return AuditEvent(**defaults)


# ---- canonical_json / sha256_hex helpers ----


def test_canonical_json_is_deterministic():
    a = canonical_json({"z": 1, "a": 2})
    b = canonical_json({"a": 2, "z": 1})
    assert a == b


def test_sha256_hex_known_value():
    assert sha256_hex("hello") == (
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    )


# ---- write + verify round-trip ----


def test_single_event_chain_valid(audit_service):
    audit_service.log_event(_make_event())
    result = audit_service.verify_chain()
    assert result["valid"] is True
    assert result["records_checked"] == 1
    assert result["error"] is None


def test_multiple_events_chain_valid(audit_service):
    for i in range(5):
        audit_service.log_event(_make_event(event_type=f"evt.{i}"))
    result = audit_service.verify_chain()
    assert result["valid"] is True
    assert result["records_checked"] == 5


def test_empty_log_valid(audit_service):
    result = audit_service.verify_chain()
    assert result["valid"] is True
    assert result["records_checked"] == 0


# ---- tamper detection ----


def test_tampered_payload_detected(audit_service):
    audit_service.log_event(_make_event())
    audit_service.log_event(_make_event(event_type="second"))
    audit_service.close()

    # Tamper with the payload in the second line
    log_file = audit_service._current_file
    lines = log_file.read_text().splitlines()
    record = json.loads(lines[1])
    record["username"] = "hacker"
    lines[1] = json.dumps(record, separators=(",", ":"))
    log_file.write_text("\n".join(lines) + "\n")

    result = audit_service.verify_chain()
    assert result["valid"] is False
    assert "canonicalPayloadHash mismatch" in result["error"]


def test_tampered_record_hash_detected(audit_service):
    audit_service.log_event(_make_event())
    audit_service.close()

    log_file = audit_service._current_file
    lines = log_file.read_text().splitlines()
    record = json.loads(lines[0])
    record["recordHash"] = "0" * 64
    lines[0] = json.dumps(record, separators=(",", ":"))
    log_file.write_text(lines[0] + "\n")

    result = audit_service.verify_chain()
    assert result["valid"] is False
    assert "recordHash mismatch" in result["error"]


def test_swapped_records_detected(audit_service):
    audit_service.log_event(_make_event(event_type="first"))
    audit_service.log_event(_make_event(event_type="second"))
    audit_service.close()

    log_file = audit_service._current_file
    lines = log_file.read_text().splitlines()
    # Swap the two lines
    log_file.write_text(lines[1] + "\n" + lines[0] + "\n")

    result = audit_service.verify_chain()
    assert result["valid"] is False


def test_deleted_record_detected(audit_service):
    audit_service.log_event(_make_event(event_type="first"))
    audit_service.log_event(_make_event(event_type="second"))
    audit_service.log_event(_make_event(event_type="third"))
    audit_service.close()

    log_file = audit_service._current_file
    lines = log_file.read_text().splitlines()
    # Remove the middle record
    log_file.write_text(lines[0] + "\n" + lines[2] + "\n")

    result = audit_service.verify_chain()
    assert result["valid"] is False
    assert "prevRecordHash mismatch" in result["error"]


# ---- genesis hash ----


def test_first_record_prev_is_genesis(audit_service):
    audit_service.log_event(_make_event())
    log_file = audit_service._current_file
    first = json.loads(log_file.read_text().splitlines()[0])
    assert first["prevRecordHash"] == GENESIS_HASH
