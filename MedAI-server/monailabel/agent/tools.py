# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Agent tools — real implementations backed by the MONAI Label REST API.

Each tool is exposed to Claude via the Anthropic ``tools`` schema in
``TOOL_DEFINITIONS`` and executed by ``MedAIToolExecutor.execute``. Tools call
the MONAI Label server (default ``http://inference:8001`` on the docker
network) rather than importing backend code, so this module stays runnable
inside the lightweight ``chat`` container.

Endpoints used:
  - GET  /datastore/?output=all              -> patient/image inventory
  - POST /batch/process                      -> start batch inference
  - GET  /batch/process/{job_id}             -> job status/results
  - POST /batch/process/{job_id}/save-pacs   -> push results to Orthanc as DICOM-SEG
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Base URL of the MONAI Label server that serves /datastore, /batch, /dicomseg.
# In the `ai` compose profile this is the `inference` container.
MONAI_LABEL_SERVER_URL = os.environ.get(
    "MONAI_LABEL_SERVER_URL", "http://inference:8001"
).rstrip("/")

# Optional path prefix if the MONAI Label app is mounted under a sub-path.
MONAI_LABEL_API_PREFIX = os.environ.get("MONAI_LABEL_API_PREFIX", "").rstrip("/")

# Optional bearer token if the MONAI Label server has auth enabled.
MONAI_LABEL_AUTH_TOKEN = os.environ.get("MONAI_LABEL_AUTH_TOKEN", "")

DEFAULT_MODEL = "biomedparse"
HTTP_TIMEOUT = 120.0


def _url(path: str) -> str:
    return f"{MONAI_LABEL_SERVER_URL}{MONAI_LABEL_API_PREFIX}{path}"


def _auth_headers() -> Dict[str, str]:
    if MONAI_LABEL_AUTH_TOKEN:
        return {"Authorization": f"Bearer {MONAI_LABEL_AUTH_TOKEN}"}
    return {}


# ============================================================================
# Datastore parsing helpers
# ============================================================================

def _first(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Return the first present, non-None value among keys (case-insensitive)."""
    lower = {k.lower(): v for k, v in d.items()} if isinstance(d, dict) else {}
    for key in keys:
        if isinstance(d, dict) and key in d and d[key] is not None:
            return d[key]
        if key.lower() in lower and lower[key.lower()] is not None:
            return lower[key.lower()]
    return default


def _normalize_images(datastore_json: Any) -> List[Dict[str, Any]]:
    """
    Normalize the many shapes MONAI Label ``datastore(output=all)`` can return
    into a flat list of ``{image_id, patient_id, patient_name, modality,
    study_date, study_uid}`` records.

    Handles:
      - {"objects": {"<id>": {"image": {"info": {...}}}, ...}}
      - {"objects": [ {...}, ... ]}
      - {"datalist"|"training": [ {"image": "...", ...}, ... ]}
      - a bare list of records
    """
    objects = None
    if isinstance(datastore_json, dict):
        objects = (
            datastore_json.get("objects")
            or datastore_json.get("datalist")
            or datastore_json.get("training")
            or datastore_json.get("data")
        )
    elif isinstance(datastore_json, list):
        objects = datastore_json

    if objects is None:
        return []

    # Dict keyed by image id -> list of (id, record)
    items: List[tuple] = []
    if isinstance(objects, dict):
        items = list(objects.items())
    elif isinstance(objects, list):
        for rec in objects:
            if isinstance(rec, dict):
                items.append((None, rec))

    records: List[Dict[str, Any]] = []
    for key, rec in items:
        if not isinstance(rec, dict):
            continue

        # The image sub-object may hold the id and info
        image_obj = rec.get("image") if isinstance(rec.get("image"), dict) else None
        info = {}
        if image_obj and isinstance(image_obj.get("info"), dict):
            info = image_obj["info"]
        elif isinstance(rec.get("info"), dict):
            info = rec["info"]

        image_id = (
            key
            or _first(rec, "image_id", "id", "name")
            or (image_obj.get("id") if image_obj else None)
            or (rec.get("image") if isinstance(rec.get("image"), str) else None)
        )
        if not image_id:
            continue

        patient_id = _first(
            info, "PatientID", "patient_id", "patientId"
        ) or _first(rec, "patient_id", "PatientID", default="")
        patient_name = _first(
            info, "PatientName", "patient_name", default=""
        ) or _first(rec, "patient_name", default="")
        modality = _first(info, "Modality", "modality", default="") or _first(
            rec, "modality", default=""
        )
        study_date = _first(info, "StudyDate", "study_date", default="") or _first(
            rec, "study_date", default=""
        )
        study_uid = _first(
            info, "StudyInstanceUID", "study_uid", "studyInstanceUID", default=""
        )

        records.append(
            {
                "image_id": str(image_id),
                "patient_id": str(patient_id) if patient_id else "",
                "patient_name": str(patient_name) if patient_name else "",
                "modality": str(modality) if modality else "",
                "study_date": str(study_date) if study_date else "",
                "study_uid": str(study_uid) if study_uid else "",
            }
        )

    return records


def _expand_patient_tokens(tokens: List[str]) -> List[str]:
    """
    Expand tokens like "1-25" or "3,4,5" into individual patient identifiers.
    Non-numeric tokens (names/IDs) are passed through unchanged.
    """
    out: List[str] = []
    for tok in tokens:
        tok = str(tok).strip()
        if not tok:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", tok)
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            if lo <= hi and hi - lo <= 10000:
                out.extend(str(n) for n in range(lo, hi + 1))
                continue
        out.append(tok)
    return out


def _match_patient(record: Dict[str, Any], token: str) -> bool:
    token = token.strip().lower()
    if not token:
        return False
    for field in ("patient_id", "patient_name", "image_id"):
        val = str(record.get(field, "")).lower()
        if token == val or (len(token) >= 3 and token in val):
            return True
    return False


# ============================================================================
# Tool executor
# ============================================================================

class MedAIToolExecutor:
    """Executes agent tool calls against the MONAI Label server."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or MONAI_LABEL_SERVER_URL).rstrip("/")

    async def execute(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch a tool call. Always returns a JSON-serializable dict."""
        try:
            handler = getattr(self, f"_tool_{name}", None)
            if handler is None:
                return {"error": f"Unknown tool: {name}"}
            return await handler(arguments or {})
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = e.response.text[:500]
            except Exception:
                pass
            logger.warning("Tool %s HTTP error: %s %s", name, e, body)
            return {"error": f"Server returned {e.response.status_code}: {body}"}
        except Exception as e:  # noqa: BLE001 - surface any failure to the model
            logger.exception("Tool %s failed", name)
            return {"error": str(e)}

    # -- datastore -----------------------------------------------------------

    async def _fetch_datastore(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                _url("/datastore/"),
                params={"output": "all"},
                headers=_auth_headers(),
            )
            resp.raise_for_status()
            return _normalize_images(resp.json())

    async def _tool_list_patients(self, args: Dict[str, Any]) -> Dict[str, Any]:
        modality = str(args.get("modality") or "").strip().upper()
        records = await self._fetch_datastore()

        # Group images by patient
        patients: Dict[str, Dict[str, Any]] = {}
        for rec in records:
            if modality and rec["modality"].upper() != modality:
                continue
            pid = rec["patient_id"] or rec["image_id"]
            entry = patients.setdefault(
                pid,
                {
                    "patient_id": rec["patient_id"],
                    "patient_name": rec["patient_name"],
                    "modalities": set(),
                    "study_date": rec["study_date"],
                    "image_ids": [],
                },
            )
            if rec["modality"]:
                entry["modalities"].add(rec["modality"])
            entry["image_ids"].append(rec["image_id"])

        result = []
        for entry in patients.values():
            result.append(
                {
                    "patient_id": entry["patient_id"],
                    "patient_name": entry["patient_name"],
                    "modalities": sorted(entry["modalities"]),
                    "study_date": entry["study_date"],
                    "image_ids": entry["image_ids"],
                    "num_images": len(entry["image_ids"]),
                }
            )

        return {
            "total_patients": len(result),
            "total_images": len(records),
            "patients": result,
        }

    async def _tool_resolve_images(self, args: Dict[str, Any]) -> Dict[str, Any]:
        records = await self._fetch_datastore()
        image_ids = self._resolve(records, args)
        return {
            "resolved_image_ids": image_ids,
            "count": len(image_ids),
        }

    def _resolve(self, records: List[Dict[str, Any]], args: Dict[str, Any]) -> List[str]:
        # Explicit image ids take precedence
        explicit = args.get("image_ids") or []
        if explicit:
            valid = {r["image_id"] for r in records}
            return [i for i in explicit if i in valid] or list(explicit)

        scope = str(args.get("scope") or "").lower()
        modality = str(args.get("modality") or "").strip().upper()

        if scope == "all" or (not args.get("patients") and not args.get("patient_ids") and scope):
            selected = records
        else:
            tokens = _expand_patient_tokens(
                list(args.get("patients") or args.get("patient_ids") or [])
            )
            selected = [
                r for r in records if any(_match_patient(r, t) for t in tokens)
            ]

        if modality:
            selected = [r for r in selected if r["modality"].upper() == modality]

        # De-dup while preserving order
        seen, out = set(), []
        for r in selected:
            if r["image_id"] not in seen:
                seen.add(r["image_id"])
                out.append(r["image_id"])
        return out

    # -- batch ---------------------------------------------------------------

    async def _tool_run_batch_segmentation(self, args: Dict[str, Any]) -> Dict[str, Any]:
        prompt = str(args.get("prompt") or "").strip()
        if not prompt:
            return {"error": "A segmentation prompt is required (e.g. 'liver')."}

        model = str(args.get("model") or DEFAULT_MODEL).strip()

        records = await self._fetch_datastore()
        image_ids = self._resolve(records, args)
        if not image_ids:
            return {
                "error": "No matching images found. Ask the user to clarify which "
                "patients, or call list_patients to show what is available."
            }

        payload = {
            "files": image_ids,
            "model": model,
            "prompt": prompt,
            "options": args.get("options") or {},
        }

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                _url("/batch/process"), json=payload, headers=_auth_headers()
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "job_id": data.get("job_id"),
            "status": data.get("status"),
            "total": data.get("total", len(image_ids)),
            "model": model,
            "prompt": prompt,
            "image_ids": image_ids,
        }

    async def _tool_get_batch_status(self, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        if not job_id:
            return {"error": "job_id is required"}
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                _url(f"/batch/process/{job_id}"),
                params={"include_results": True},
                headers=_auth_headers(),
            )
            resp.raise_for_status()
            return self._summarize_status(resp.json())

    @staticmethod
    def _summarize_status(job: Dict[str, Any]) -> Dict[str, Any]:
        results = job.get("results") or {}
        if isinstance(results, dict):
            results = list(results.values())
        completed = [r for r in results if r.get("status") == "completed"]
        failed = [r for r in results if r.get("status") == "failed"]
        return {
            "job_id": job.get("job_id"),
            "status": job.get("status"),
            "total": job.get("total") or job.get("total_files"),
            "success": job.get("success") or len(completed),
            "failed": job.get("failed") or len(failed),
            "progress_percentage": job.get("progress_percentage", 0.0),
            "completed_files": [
                {"file": r.get("file_name") or r.get("file_path"), "labels": r.get("labels", [])}
                for r in completed
            ],
            "failed_files": [
                {"file": r.get("file_name") or r.get("file_path"), "error": r.get("error")}
                for r in failed
            ],
        }

    async def _tool_save_results_to_pacs(self, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        if not job_id:
            return {"error": "job_id is required"}
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT * 3) as client:
            resp = await client.post(
                _url(f"/batch/process/{job_id}/save-pacs"), headers=_auth_headers()
            )
            resp.raise_for_status()
            return resp.json()


# ============================================================================
# Anthropic tool schema
# ============================================================================

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "list_patients",
        "description": (
            "List the patients/studies available in the imaging datastore. Use "
            "this when the user asks what is available, or to confirm which "
            "patients exist before starting a batch job. Optionally filter by "
            "imaging modality (e.g. CT, MR)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "modality": {
                    "type": "string",
                    "description": "Optional modality filter, e.g. 'CT'.",
                }
            },
        },
    },
    {
        "name": "resolve_images",
        "description": (
            "Preview which datastore image IDs a patient selection resolves to, "
            "without starting a job. Useful to confirm a count before running."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "patients": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Patient names, IDs, or ranges like '1-25'.",
                },
                "scope": {
                    "type": "string",
                    "enum": ["all", "selected"],
                    "description": "Use 'all' to select every image in the datastore.",
                },
                "modality": {"type": "string"},
                "image_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Explicit datastore image IDs (bypasses patient resolution).",
                },
            },
        },
    },
    {
        "name": "run_batch_segmentation",
        "description": (
            "Start a batch segmentation job over the selected patients/images. "
            "Resolves the patient selection to datastore image IDs and runs the "
            "given model with the text prompt on each. Default model is "
            "'biomedparse', which is text-prompted (the prompt names the "
            "structure, e.g. 'liver'). IMPORTANT: only call this AFTER the user "
            "has explicitly confirmed the model, prompt, and patient selection."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "description": "Model name. Default 'biomedparse'.",
                },
                "prompt": {
                    "type": "string",
                    "description": "Segmentation target text, e.g. 'liver'. Required.",
                },
                "patients": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Patient names, IDs, or ranges like '1-25'.",
                },
                "scope": {
                    "type": "string",
                    "enum": ["all", "selected"],
                },
                "modality": {"type": "string"},
                "image_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Explicit datastore image IDs (bypasses patient resolution).",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "get_batch_status",
        "description": "Get the current status, progress, and results of a batch job by job_id.",
        "input_schema": {
            "type": "object",
            "properties": {"job_id": {"type": "string"}},
            "required": ["job_id"],
        },
    },
    {
        "name": "save_results_to_pacs",
        "description": (
            "Push all completed segmentation results from a batch job to PACS "
            "(Orthanc) as DICOM-SEG, so the user can open each study in the "
            "viewer and touch up the segmentation. Only call after the user "
            "confirms they want to save."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"job_id": {"type": "string"}},
            "required": ["job_id"],
        },
    },
]
