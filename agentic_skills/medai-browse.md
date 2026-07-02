---
description: "Browse and filter the MedAI datastore to list available images with metadata"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
List all images in the MedAI datastore with their metadata, and optionally filter by modality, patient ID, or date range.

## Parameters
Parse from user request: $ARGUMENTS
- `modality` (optional): Filter by imaging modality (e.g., CT, MR, PT, DX)
- `patient_id` (optional): Filter by patient identifier
- `study_date_from` (optional): Start date for date range filter (YYYY-MM-DD or YYYYMMDD)
- `study_date_to` (optional): End date for date range filter (YYYY-MM-DD or YYYYMMDD)
- If no filters specified, show all images

## Server Configuration
Use environment variable `MEDAI_SERVER` or default to `http://localhost:8000`.

## API Endpoint

### List All Images
```
GET /datastore/?output=all
```
Returns: array of image objects with metadata fields.

```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all" | jq .
```

### Client-Side Filtering with jq

**Filter by modality:**
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all" | jq '[.[] | select(.modality == "CT")]'
```

**Filter by patient ID:**
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all" | jq '[.[] | select(.patient_id == "patient001")]'
```

**Filter by date range:**
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all" | jq '[.[] | select(.study_date >= "20240101" and .study_date <= "20241231")]'
```

**Combine filters:**
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all" | jq '[.[] | select(.modality == "CT" and .patient_id == "patient001")]'
```

## Workflow

1. Call `GET /datastore/?output=all` to retrieve all image metadata
2. Apply any user-specified filters client-side using jq
3. Format the results as a table
4. Report total count of matching images

## Confirmation Required
None. This is a read-only browse operation.

## Output Format
Display results as a formatted table:

```
MedAI Datastore
================
Showing <N> images (filtered by: <active filters or "none">)

Image ID        Patient ID     Modality   Study Date   Description
-----------     -----------    --------   ----------   -----------
img_001         patient001     CT         2024-03-15   Chest CT with contrast
img_002         patient001     PT         2024-03-15   FDG PET/CT
img_003         patient002     MR         2024-04-01   Brain MRI T1+T2
...

Total: <N> images
```

## Examples

**"show me all images"** — Fetch all, display full table.

**"list CT scans"** — Fetch all, filter by modality == "CT".

**"what images does patient 5 have?"** — Fetch all, filter by patient_id containing "5" or matching "patient005".

**"show MR studies from 2024"** — Fetch all, filter by modality == "MR" and study_date in 2024 range.
