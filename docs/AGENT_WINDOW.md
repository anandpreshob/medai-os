# Agent Window — Development Tracking

Status: **In progress** — frontend + backend implemented and locally verified; full
end-to-end (BiomedParse batch inference + PACS write-back) pending validation on a
GPU host.

Last updated: 2026-07-07

---

## 1. Goal

Add a second way into medai-os. On launch the user chooses between:

- **Viewer window** — the existing app (browse studies, open one, segment/edit manually).
- **Agent window** — a chat *harness*. The user types a request like
  *"run liver segmentation with biomedparse on patients A, B and C"* and the agent
  orchestrates the whole workflow: resolve patients → read images → run BiomedParse
  batch segmentation → push results to PACS as DICOM-SEG.

This turns tedious one-by-one loading/segmenting into a batch job. After the models
run the initial segmentations, clinicians open each study in the Viewer and do final
touch-ups with the existing segmentation-editing tools.

**First use case (implemented):** batch text-prompted segmentation with BiomedParse
across a chosen set of patients, results saved back to Orthanc as DICOM-SEG.

Design/plan of record: `~/.claude/plans/i-want-to-build-federated-bear.md`.

---

## 2. Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Agent brain | **Anthropic Claude** tool-use loop (`ANTHROPIC_API_KEY`) | Strong tool calling; CPU-only for the LLM part. Model configurable via `AGENT_MODEL` (default `claude-sonnet-5`). |
| Outputs | **Push DICOM-SEG to Orthanc** | So processed studies appear in the Viewer ready for touch-ups. |
| Deployment | Agent lives in the **chat service** (`ai` compose profile, port 8005), calling the MONAI Label server over HTTP | Reuses the CPU-only, LLM-facing container; keeps GPU work in the inference service. |
| Patient input | Names/IDs **and** "list available patients" | Agent can query the datastore and let the user choose; accepts ranges like `1-25`. |

### Why a fresh agent path (not the existing chat orchestrator)

The existing LangGraph chat orchestrator (`monailabel/chat/orchestrator.py`) has intent
routing but **every execution node returns mock data**; the MCP tools
(`monailabel/mcp/tools/*.py`) depend on service modules that don't exist and fall back
to mocks; and `ChatService.ts` has contract mismatches with `chat_app.py`. The real,
working primitives are the MONAI Label REST endpoints, so the agent is a thin real loop
over those rather than a repair of the mock maze.

---

## 3. Architecture

```
Browser (Viewer app :3000)
  │  LauncherPage  ──►  AgentPage / AgentChat  ──►  AgentService (SSE)
  ▼
Chat service (:8005, `ai` profile)         ← Claude API (tool use)
  monailabel/agent/agent_endpoints.py  POST /agent/session, /agent/message (SSE)
  monailabel/agent/agent_loop.py       Claude tool-use loop + batch progress polling
  monailabel/agent/tools.py            HTTP calls to MONAI Label server
  │
  ▼  MONAI_LABEL_SERVER_URL (http://inference:8001)
MONAI Label server (inference service, GPU)
  GET  /datastore/?output=all               patient/image inventory
  POST /batch/process                        BiomedParse batch inference (job)
  GET  /batch/process/{job_id}               status/results
  POST /batch/process/{job_id}/save-pacs     NEW: masks → DICOM-SEG → Orthanc STOW
  │
  ▼
Orthanc PACS (:8042)  ── DICOM-SEG appears on the source study for viewer touch-ups
```

The agent streams batch progress over its **own SSE** (polling `get_batch_status`),
rather than depending on the browser reaching the batch WebSocket through nginx.

---

## 4. Files

### Backend (`MedAI-server/`)

New:
- `monailabel/agent/__init__.py`
- `monailabel/agent/tools.py` — `MedAIToolExecutor` + `TOOL_DEFINITIONS`. Tools:
  `list_patients`, `resolve_images`, `run_batch_segmentation`, `get_batch_status`,
  `save_results_to_pacs`. Robust datastore JSON normalization + patient/range resolution.
- `monailabel/agent/agent_loop.py` — `AgentLoop` (Claude streaming tool-use loop,
  confirmation-gated system prompt, batch progress polling).
- `monailabel/agent/agent_endpoints.py` — `POST /agent/session`, `POST /agent/message`
  (SSE), `GET /agent/health`.

Edited:
- `monailabel/services/chat_app.py` — mounts the agent router (at `/agent` and `/chat/agent`).
- `monailabel/endpoints/batch_process.py` — adds `POST /batch/process/{job_id}/save-pacs`
  (mask → DICOM-SEG via existing `dicomseg` helpers → STOW to Orthanc; per-file error report).
- `dockerfiles/Dockerfile.chat` — installs `anthropic`, `httpx`; copies `monailabel/agent/`.
- `docker-compose.yml` — chat service env: `ANTHROPIC_API_KEY`, `AGENT_MODEL`,
  `MONAI_LABEL_SERVER_URL`, `ORTHANC_DICOMWEB_URL`.
- `.env.example` — documents `ANTHROPIC_API_KEY` / `AGENT_MODEL`.

### Frontend (`medai-viewer/`)

New:
- `apps/viewer/src/pages/LauncherPage.tsx` — Agent vs Viewer entry screen.
- `apps/viewer/src/pages/AgentPage.tsx` — full-window agent host (redirects to `/studies`
  if the `agent` feature is disabled).
- `apps/viewer/src/components/agent/AgentChat.tsx` — chat harness UI: markdown, tool
  activity chips, live batch-progress card.
- `packages/core/src/services/AgentService.ts` — session + SSE stream parser
  (CRLF/LF/partial-frame safe).

Edited:
- `apps/viewer/src/App.tsx` — routes: `/` → Launcher, `/studies` → StudyBrowser,
  `/agent` → AgentPage (gated).
- `apps/viewer/src/pages/UploadPage.tsx` — "home" now points at `/studies`.
- `packages/core/src/features/{types,registry}.ts` — new `agent` feature flag
  (`requiresUrl: chatServiceUrl`, `composeProfile: ai`).
- `packages/core/src/index.ts` — exports `AgentService`.

---

## 5. Status

Done and verified locally:
- Backend Python compiles; datastore parsing + patient/range resolution unit-tested
  across multiple datastore JSON shapes.
- Frontend `@medai/core` typechecks clean; all new/edited files typecheck clean
  (remaining repo tsc errors are pre-existing, in unrelated neuro/lib files).
- SSE frame parser unit-tested (CRLF/LF/partial). Full `vite build` succeeds.
- Dev server runs; Launcher and Agent window render and navigate correctly (screenshots taken).

Pending (needs a GPU host running the `ai` profile):
- Real `list_patients` against a populated Orthanc datastore.
- BiomedParse batch inference via `POST /batch/process`.
- `save-pacs`: study/series-UID resolution + DICOM-SEG STOW against the live datastore
  (the highest-risk integration point; written defensively with per-file error reporting).
- End-to-end agent conversation (list → confirm → run → progress → save → open in viewer).
- Playwright e2e spec alongside `apps/viewer/e2e/biomedparse-workflow.spec.ts`.

---

## 6. How to run

### Frontend only (no GPU, UI walkthrough)
```bash
cd medai-viewer
VITE_FEATURES=agent pnpm --filter @medai/viewer dev   # http://localhost:3000
```
Launcher, Agent window, and Viewer navigation work. The Agent won't respond until the
chat/agent backend is running.

### Full end-to-end (GPU host)
```bash
cd MedAI-server
# set ANTHROPIC_API_KEY (and GEMINI_API_KEY) in .env
docker compose --profile ai up
```
Point the viewer at the backend via `VITE_CHAT_SERVICE_URL` / `VITE_MEDAI_SERVER_URL`
and set `VITE_FEATURES=agent` (or enable `agent` in `public/config.json`). Ensure Orthanc
has studies (`scripts/download-sample-data.sh`).

### Manual verification (curl)
```bash
# tools in isolation
curl 'http://<server>/datastore/?output=all'
curl -X POST http://<server>/batch/process \
  -H 'Content-Type: application/json' \
  -d '{"files":["<imageId>"],"model":"biomedparse","prompt":"liver"}'
curl http://<server>/batch/process/<job_id>
curl -X POST http://<server>/batch/process/<job_id>/save-pacs

# agent loop (SSE)
curl -N -X POST http://<server>/chat/agent/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"list the available patients"}'
```

---

## 7. Open items / follow-ups

- Validate `save-pacs` UID resolution against the real DICOMWeb datastore; confirm the
  DICOM-SEG references the correct source series so it overlays in the viewer.
- Confirm the deployed `AGENT_MODEL` is accessible to the API key in use.
- Optional: replace the batch UI's `simulateBatchProcessing`
  (`components/BatchProcessingPanel.tsx`) with real `/batch/process` + WS calls now that
  the wiring exists.
- Optional: add a one-click "open processed study in Viewer" deep link from the agent's
  completion state (needs study-UID mapping surfaced in results).
