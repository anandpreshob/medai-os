---
description: "Verify audit hash-chain integrity, query audit logs, view stats, and export audit trails"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Interact with the MedAI audit trail system: verify hash-chain integrity, query audit logs with filters, view statistics, export logs, or retrieve audit trails for specific segmentations or studies.

## Parameters
Parse from user request: $ARGUMENTS
- **action** (required): infer from request — one of: verify, query, stats, export, segmentation_trail, study_trail
- **event_types** (optional): filter by event type
- **username** (optional): filter by user
- **patient_id** (optional): filter by patient
- **study_uid** (optional): filter by study UID
- **segmentation_id** (optional): filter by segmentation ID
- **start_time** / **end_time** (optional): time range (ISO 8601)
- **severities** (optional): filter by severity
- **limit** (optional): default 50
- **format** (optional): "jsonl" or "csv" for export, default "jsonl"

## Workflow

1. Parse what the user wants from their request.
2. Execute the appropriate endpoint:

```bash
# Verify hash-chain integrity
curl -s "$MEDAI_SERVER/audit/verify" | jq .

# Query logs with filters
curl -s "$MEDAI_SERVER/audit/query?start_time=$(date -u +%Y-%m-%dT00:00:00Z)&limit=50" | jq .

# Get statistics
curl -s "$MEDAI_SERVER/audit/stats" | jq .

# Export as CSV
curl -s "$MEDAI_SERVER/audit/export?format=csv" --output audit_logs.csv

# Export as JSONL
curl -s "$MEDAI_SERVER/audit/export?format=jsonl" --output audit_logs.jsonl

# Audit trail for a specific segmentation
curl -s "$MEDAI_SERVER/audit/segmentation/<SEGMENTATION_ID>" | jq .

# Audit trail for a specific study
curl -s "$MEDAI_SERVER/audit/study/<STUDY_UID>" | jq .

# Log new events
curl -X POST "$MEDAI_SERVER/audit/log" \
  -H "Content-Type: application/json" \
  -d '{"events": [<EVENT_LIST>]}'
```

`$MEDAI_SERVER` defaults to `http://localhost:8000`.

3. Display results based on action type.

## Confirmation Required
None.

## Output Format

**For verify**: Display chain integrity status with a clear PASS/FAIL indicator and records checked count.

**For query**: Display audit entries as a table:
| # | Timestamp | Event Type | User | Severity | Details |
|---|-----------|------------|------|----------|---------|

**For stats**: Display event counts by type, top users, and time period summary.

**For export**: Confirm file saved with path, format, and record count.

**For segmentation/study trail**: Display chronological event list with timestamps and details.

Flag any integrity issues or anomalies prominently.

## Examples
- "Verify the audit chain"
- "Show today's audit logs"
- "Export audit trail for this segmentation"
- "Show audit stats for the last week"
- "Get the audit trail for study 1.2.840..."
