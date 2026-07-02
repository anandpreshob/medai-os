# Audit Trail — Hash-Chain Integrity

## Overview

MedAI audit logs use a SHA-256 hash chain to provide tamper-evident storage.
Every record written to the JSONL audit log includes three integrity fields that
link it to the previous record, forming an append-only verifiable chain analogous
to a blockchain.

## Schema (v1.1.0)

Each JSONL record contains the application payload **plus** four chain fields:

| Field                  | Description                                                        |
|------------------------|--------------------------------------------------------------------|
| `schemaVersion`        | Schema version string (`"1.1.0"`).                                 |
| `canonicalPayloadHash` | SHA-256 of the deterministic JSON serialization of the payload.    |
| `prevRecordHash`       | `recordHash` of the preceding record (`"GENESIS"` for the first). |
| `recordHash`           | `SHA-256(prevRecordHash + "\n" + canonicalPayloadHash)`.           |

### Canonical JSON

Payload hashing uses **canonical JSON**: sorted keys, no whitespace
(`separators=(",", ":")`), ASCII-escaped. This ensures identical payloads always
produce identical hashes regardless of key insertion order.

## Writing a record

```
payload_hash = SHA256(canonical_json(payload))
record_hash  = SHA256(prev_record_hash + "\n" + payload_hash)
```

The `prev_record_hash` for the very first record in a file is the literal string
`GENESIS`.

## Verification

### API

```
GET /audit/verify
```

Returns:

```json
{
  "valid": true,
  "records_checked": 142,
  "error": null
}
```

- **200** — chain is intact.
- **409** — chain is broken; `error` describes the first mismatch.

### What is verified

1. `prevRecordHash` of record N equals `recordHash` of record N-1.
2. `recordHash` equals `SHA-256(prevRecordHash + "\n" + canonicalPayloadHash)`.
3. `canonicalPayloadHash` equals the SHA-256 of the canonical JSON of the
   payload fields (all fields except the four chain/schema fields).

### Limitations

- Verification covers the **current day's log file** by default.
- Deletion of entire records at the tail is not detectable without an external
  witness (e.g., a record count stored elsewhere).
- Log rotation starts a new chain with a fresh `GENESIS` root.

## Log rotation

When a log file exceeds the configured size limit (default 100 MB), it is
renamed with a timestamp suffix and a new file is started. Each file maintains
its own independent hash chain.

## Regulatory context

This mechanism supports FDA 21 CFR Part 11 and IEC 62304 requirements for
audit trail integrity by making any insertion, deletion, or modification of
a record computationally detectable.
