# medai-os Roadmap: from a partially-real viewer to an agentic imaging OS

Date: 2026-08-30 · Branch analysed: `feat/agent-window` (+ uncommitted Vertex work)
Companion docs: [Tier 1 verification matrix](02_TIER1_VERIFICATION_MATRIX.md) · [Sample data manifest](03_SAMPLE_DATA_MANIFEST.md)

> **Status 2026-08-30 (end of day):** Phase 0 and Phase 1 are done on `feat/tier1-viewer`.
> The Vertex work is parked on `wip/cloud-vertex`. A new Tier 1 viewer (`apps/viewer2`,
> Cornerstone3D 5.8) replaces the hand-rolled DICOM path; the command registry lives in
> `packages/core`; fixtures come from `scripts/sample-data`; **56 Playwright tests drive the
> generated matrix and all 35 P0 rows are verified** (DICOM/NIfTI/NRRD/MHA/TIFF, every codec in
> the pydicom corpus, Enhanced MR, MONOCHROME1, RGB, cine, PET SUV, PET/CT fusion, DICOM-SEG and
> RTSTRUCT overlays, PACS STOW→QIDO→WADO-RS, measurements against known geometry). What is
> still open at P1/P2 is listed in the matrix (PNG/JPEG, hanging protocols, MG/multi-sequence
> hanging, 4D cardiac grouping, viewport sync, NM fixture). Phase 2 can start.

---

## 0. TL;DR

1. **The README oversells Tier 1.** There is no Cornerstone DICOM image loader in the repo; DICOM is hand-parsed (`packages/itk-loader/src/DicomLoader.ts`, `apps/viewer/src/pages/ViewerPage.tsx:282-410`). Compressed transfer syntaxes, multi-frame, colour, MONOCHROME1, Enhanced MR/CT, cine, US, NM, RTDOSE, SR are structurally unsupported. Only two automated tests touch the viewer, both on a JPEG/NIfTI fixture that the sample-data script does not fetch. CI runs **no tests**.
2. **Tier 2 has a real core wrapped in dead ends.** Brush/lasso/polygon tools, the MONAI Label client, interactive SAM/nnInteractive prompts, the backend batch API and the analytics endpoints work. Undo/redo, keyboard shortcuts, copy/paste, interpolation, the batch UI, DICOM-SEG/RTSTRUCT export, registration and audit are each broken by a missing link (unconsumed store, unmounted router, `simulate*` function, un-passed prop).
3. **Tier 3 is one strong vertical (RECIST/longitudinal) plus registry entries.** `SuiteConfig` declares 18 fields; 10 have no reader. `RightPanel` hard-codes suite IDs. Chest X-ray "detection" draws **heuristic boxes with hard-coded confidences** over a real MedGemma text description. PET SUV numbers come from `Math.random()`.
4. **There are three parallel agent systems and none can drive the viewer.** The new Agent window (`monailabel/agent/`) is real but backend-only; the LangGraph chat (`monailabel/chat/`) has nine mock nodes; `monailabel/mcp/` is never imported; the 28 `agentic_skills/*.md` files are inert and curl an endpoint (`/mcp/execute`) that does not exist.
5. **The plan:** build one spine — a typed **command layer** in the viewer, mirrored 1:1 as agent **tools**, composed by **skills** — and harden each tier on real test data before wiring the agent to it. Nothing ships mocked. Phases below.

---

## 1. Where we actually are

Legend: ✅ working · 🟡 wired but unverified · 🔴 stubbed / mocked / broken · ⚫ documented only

### 1.1 Tier 1 — viewer

| Area | State | Evidence |
|---|---|---|
| NIfTI / NRRD / MHA / TIFF via itk-wasm | 🟡 | `packages/itk-loader/src/*Loader.ts`. Only NIfTI handles gzip and RAS→LPS. No tests. |
| PNG/JPEG | ✅ (grayscale only, 1 mm spacing) | `StandardImageLoader.ts:86-100`; `e2e/2d-image-support.spec.ts` |
| Local DICOM file | 🔴 | `DicomLoader.ts` reads raw pixel bytes; ignores PhotometricInterpretation, transfer syntax, multi-frame |
| PACS study load | 🔴 | `ViewerPage.tsx:32-249`: O(n) scan of all studies, loads `series[0]` only, direction row 3 hard-coded to `[0,0,1]` |
| Cornerstone DICOM loader / WADO-RS pixel retrieval | ⚫ | `@cornerstonejs/dicom-image-loader` not a dependency; zero `wadors`/`wadouri` hits |
| Stack viewports | ⚫ | Every viewport is ORTHOGRAPHIC/VOLUME_3D; 2D images are wrapped as 1-slice volumes (`cornerstone.ts:640-790`) |
| MPR + crosshairs | ✅ | `cornerstone.ts:436-634` |
| 3D | 🟡 surface-only | `surface3D.ts` marching-cubes of labelmaps; no volume ray-cast of the image |
| Window/level | 🟡 | Percentile heuristic, not DICOM VOI; MR/X-ray presets defined but unreachable in `WindowPresetMenu.tsx:53-55` |
| Scale bar | 🔴 | `ScaleOverlay.tsx:18` wrong default engine ID → never renders |
| Orientation markers | 🔴 | Hard-coded per plane name, not from direction cosines (`OrientationMarkerOverlay.tsx:26-38`) |
| Measurement tools | ✅ (7 tools) | `cornerstone.ts:193-201`; no table/export, no Cobb, no calibration |
| Hanging protocols / cine / 4D | ⚫ | — |
| RTSTRUCT / DICOM-SEG display | 🔴 | `RTStructuresPanel.tsx:301-310` TODO stubs; `dicomseg` router not mounted |
| PET SUV | 🔴 | `PETMetricsPanel.tsx:416-442` uses `Math.random()`; real `suvComputation.ts` (536 lines) has zero callers |
| Tests | 🔴 | 4 unit files (none on loaders/rendering), 21 e2e (2 viewer-relevant, fixtures not shipped). CI: build only. |

### 1.2 Tier 2 — annotation / localization station

| Area | State | Evidence |
|---|---|---|
| Brush, eraser, lasso fill/erase, rect fill/outline, polygon, polyline, smart brush | ✅ | `cornerstone.ts:1880-2262, 4497-4549` |
| Label management, merge/replace dialogs | ✅ | `right-panel/panels/SegmentsPanel.tsx` |
| NIfTI export / NIfTI+NRRD import | ✅ | `LabelExportService.ts`, `LabelLoaderService.ts` |
| Undo/redo | 🔴 | `segmentationStore.ts:325` dispatches an event nobody listens to; `pushAnnotationHistory` has no callers |
| Keyboard shortcuts | 🔴 | Manager exists; **zero shortcuts registered**; help modal lists an empty set |
| Copy/paste, slice interpolation | 🔴 | `clipboardStore.ts` and `InterpolationControls.tsx` have no consumers |
| Threshold / region-grow | ⚫ | — |
| MONAI Label client, sessions, multipart parsing | ✅ | `MonaiLabelClient.ts` (+ unit tests) |
| Interactive prompts (point/box/scribble/lasso) → SAM2/MedSAM2/SAM3/nnInteractive | ✅ | `tools/*MONAILabelTool.ts`, `basic_infer.py:430,923` |
| BiomedParse text prompt, TotalSegmentator organ select | ✅ | `AutoSegmentationTab.tsx` |
| Volumetrics / radiomics | ✅ | `analytics.py:293,364` |
| DICOM-SEG export from UI | 🔴 | Buttons never render (`RightPanel.tsx:731` omits props) **and** `dicomseg` router unmounted (`app.py:24-51`) |
| RTSTRUCT import/export | 🔴 UI / ✅ backend | Backend `endpoints/rtstruct.py` is real; UI is `console.log` |
| Batch processing UI | 🔴 | `BatchProcessingPanel.tsx:166` `simulateBatchProcessing` with hard-coded Liver/Spleen; panel imported by nothing; WS default port wrong (8000 vs 8001) |
| Batch backend + WebSocket + COCO/YOLO/VOC export + save-pacs | ✅ | `batch_process.py`, `batch_websocket.py` |
| Registration + propagation | 🔴 | Router unmounted; `RegistrationService.ts` has no callers |
| Cloud batch (GCP Vertex) | 🟡 | Untracked: `monailabel/cloud/`, `monailabel/vertex/`, `apps/orchestrator/`, `scripts/vertex/` (1,413 LOC). Coherent end-to-end design; zero tests; not in CI; GCP only — `factory.py:28` raises for anything else |
| AWS / Azure | ⚫ | `CloudBatchProvider` ABC anticipates them; no implementation |
| Backend tests | 🔴 | One file (`test_audit_chain.py`); no pytest config; CI runs no Python |

### 1.3 Tier 3 — application layer (suites)

| Suite | State | Evidence |
|---|---|---|
| `auto` | ✅ | The only suite where `AnalyticsPanel` renders (`RightPanel.tsx:788`) |
| `oncology` (RECIST 1.1, longitudinal, lesion correspondence) | ✅ client-side | `recistStore.ts`, `recistMetrics.ts:123-174`, `longitudinalStore.ts`; backend `/analytics/recist-measurements` has no frontend caller |
| `chestxray` | 🟡 | Real MedGemma description via vLLM; **boxes and confidences are heuristics** (`medgemma_app.py:159-315`) |
| `rt` | 🔴 | RTSTRUCT panel stubs |
| `neurology` | 🔴 | 13 panels + `MultiSequenceViewport` have zero import sites; neuro backend routes never called |
| `cardiology` | ⚫ | EF explicitly not computed (`CardiacMetricsPanel.tsx:387`); `CardiacFunctionPanel` file missing |
| `surgical` | 🔴 | Mesh export TODO; `MeshExportPanel` missing |
| `annotation` | ⚫ | All declared tabs/panels missing |
| Suite mechanism | 🔴 | `useSuiteEffects` never called; `RightPanel` switch-cases on suite ID; 10/18 `SuiteConfig` fields unread; metrics panels starve because Analytics is gated to `auto` |
| Triage, reports (Gemini), audit hash-chain algorithm | ✅ logic | Audit router unmounted and `AuditService` never instantiated |
| Two suite registries (TS 8 suites vs Python 5 YAML) | 🔴 | Frontend never calls `/suites/*`; IDs disagree (`rt` vs `radiotherapy`) |

### 1.4 Agentic layer

| Component | State | Evidence |
|---|---|---|
| Agent window: Claude tool loop, 5 real tools, SSE | ✅ mechanics / 🟡 E2E | `monailabel/agent/{tools,agent_loop,agent_endpoints}.py`; E2E pending GPU host |
| Agent drives the viewer | ⚫ | `AgentChat.tsx` imports zero stores; `/agent` is a sibling route of `/viewer` |
| Confirmation gating | 🔴 prompt-only | `agent_loop.py:47-71`; no code interlock before `run_batch_segmentation` / `save_results_to_pacs` |
| Session persistence | 🔴 | In-memory dict (`chat/session_manager.py:225`) |
| Legacy LangGraph chat | 🔴 | 9 mock nodes (`orchestrator.py:559-579, 809, 920`); `_mcp_server` assigned, never read; fake SSE streaming (`chat_app.py:340`) |
| `monailabel/mcp/` | 🔴 | Never imported; 4 of 11 tool files draw synthetic ellipses |
| `agentic_skills/*.md` (28) | ⚫ | No loader, no `.claude/`, zero references; call nonexistent `POST /mcp/execute`; jq recipes assume the wrong datastore shape |
| LLM SDK pins | 🔴 | `anthropic` at 0.39.0 / 0.40.0 / 0.76.0 across three requirement files; agent container gets 0.40.0 |
| Command bus / action dispatcher in viewer | ⚫ | 26 Zustand stores, callable via `getState()`; no command abstraction |

### 1.5 Stack age

| | Current | Current upstream | Note |
|---|---|---|---|
| Cornerstone3D | 1.86 | 3.x | 2.0 merged `streaming-image-volume-loader` into core, rewrote `dicom-image-loader` (TS/ESM), replaced `StackScrollMouseWheelTool`; 3.x adds newer segmentation tooling. The 4,647-line `cornerstone.ts` targets the 1.x API. |
| React / Vite / Tailwind / Vitest / Zustand | 18 / 5 / 3 / 1 / 4 | 19 / 7 / 4 / 3 / 5 | Routine upgrades |
| FastAPI / pydantic / torch | 0.110 / 2.7 / 2.6 | current | Leave model stacks pinned; upgrade web layer |
| LangChain / LangGraph | 0.3 | — | Only used by mock orchestrator + triage/report prompts → remove from the agent path |
| Anthropic SDK | 0.40 in agent container | 1.x | Unify to one pin; adopt adaptive thinking, strict tools, tool runner |

---

## 2. What "not AI-slop" means for this product

These are the rules the rest of the plan enforces. They are what keep an agentic product coherent instead of a pile of chat boxes.

1. **One vocabulary.** Every user-visible action is a **command** (`viewer.loadStudy`, `seg.runModel`, `batch.submit`). Toolbar buttons, keyboard shortcuts, suite defaults, and the agent all invoke the same command. There are no agent-only and no UI-only features.
2. **Tools are commands with a JSON schema. Skills are recipes over tools.** No third registry. `agent/tools.py`, `mcp/tools/`, and `agentic_skills/` collapse into one.
3. **Nothing ships mocked.** A feature is real and tested, or it is absent from `main`. `Math.random()` outputs, `simulate*` functions, hard-coded confidences, and "coming soon" panels are deleted, not hidden behind flags.
4. **Confirmation is enforced in code, not in the prompt.** Tools that write to PACS, spend cloud money, or delete data carry `requires_confirmation`; the loop suspends until the UI approves.
5. **Every tier has a fixture corpus and a generated verification matrix.** "Verified" means a CI test on a named public dataset, not a memory of having tried it.
6. **Docs describe `main`; the roadmap describes the future.** No "✅ Implemented" claim that a test can't back.
7. **One chat surface.** A docked agent panel inside the viewer (with a full-screen mode for batch work). Not a Launcher fork, a legacy ChatPanel, and an orphaned AskMedAI tab.

---

## 3. Target architecture

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  Viewer UI  ──┐                                                   │
│  Keyboard  ───┼──►  Command registry  (packages/core/src/commands)│
│  Suite defaults┘        │  typed, serializable, undoable           │
│                         ▼                                         │
│               Zustand stores + Cornerstone3D 3.x                  │
│                         ▲                                         │
│  Agent panel ◄─SSE──────┼──── client-tool calls (viewer.*)        │
│       │ POST tool_result│                                         │
└───────┼─────────────────┼─────────────────────────────────────────┘
        ▼                 │
┌── Chat/Agent service (CPU) ───────────────────────────────────────┐
│  Claude tool loop (Sonnet 5 default; adaptive thinking; strict    │
│  tools; confirmation interlock; persistent sessions; audit chain) │
│  Server tools: datastore.*, batch.*, cloud.*, analytics.*, pacs.* │
│  Skills index: skills/<name>/SKILL.md  (also mounted for Claude   │
│  Code via .claude/skills)                                          │
│  MCP server exposing the same server tools (replaces dead mcp/)   │
└──────────┬──────────────────────────┬─────────────────────────────┘
           ▼                          ▼
   MONAI Label server (GPU)    Cloud batch providers
   /infer /batch /analytics    Vertex ✔ · SageMaker · Azure ML
   /dicomseg /rtstruct         (CloudBatchProvider ABC, BYO creds)
           │
           ▼
        Orthanc (DICOMweb: QIDO / WADO-RS / STOW-RS)
```

Key mechanism: **client tools**. The server-side loop declares `viewer.*` tools whose execution happens in the browser. When Claude emits `tool_use` for one, the SSE stream carries it to the agent panel, the panel runs the command through the registry, and POSTs the `tool_result` back. "Can you load this image?" is then a one-tool conversation, and the same command is what the toolbar button calls.

---

## 4. Phases

Effort assumes 1–2 engineers; treat as relative sizing.

### Phase 0 — Ground truth (1–2 weeks)

Goal: stop the repo from lying to us before building on it.

- Land the Vertex work as a PR (`feat/cloud-vertex`) so it stops living as untracked files; add the `vertex` profile to the compose-validation job.
- CI runs `pnpm typecheck`, `vitest`, `pytest`, and a Playwright smoke; add `pytest.ini` and a `conftest.py`.
- Manifest-driven sample-data fetcher (see [03_SAMPLE_DATA_MANIFEST.md](03_SAMPLE_DATA_MANIFEST.md)) replacing the current script, which downloads nothing usable; ship the P0 fixtures the e2e specs already reference.
- Move dead code to an `attic/` branch, not `main`: `monailabel/mcp/`, the LangGraph orchestrator's mock nodes, `Dockerfile.medgemma`, the 13 orphan neuro panels, `DetectionsPanel.tsx`, `ChestXrayReportTab.tsx`, `BatchProcessingPanel.tsx` (until rewired), `AskMedAITab.tsx`.
- Rewrite `docs/suites/*` status lines and `LONGITUDINAL_IMPLEMENTATION_PLAN.md` to match the matrix; README feature table gets a "verified on" column.
- Unify the `anthropic` pin; delete LangChain/LangGraph from the chat container.

Exit: CI green with real tests; `02_TIER1_VERIFICATION_MATRIX.md` regenerated from CI output; README honest.

### Phase 1 — Tier 1: a viewer that survives real modalities (6–10 weeks)

Goal: every P0 row in the verification matrix is ✅ on public data.

1. **Cornerstone3D 3.x migration** — in a fresh `packages/viewer-engine` behind a route, not by patching the 4,647-line `cornerstone.ts`. Adopt `@cornerstonejs/dicom-image-loader` (wadouri for local files, wadors against Orthanc), delete `DicomLoader.ts` and the parsers in `ViewerPage.tsx`.
2. **Correctness fixes that the loader alone doesn't buy:** stack viewports for 2D/multi-frame; VOI from DICOM header with modality-appropriate presets (unhide MR/X-ray presets); orientation markers from direction cosines; scale bar (fix engine ID); PACS series picker (not `series[0]`); oblique acquisitions.
3. **Modality support:** MONOCHROME1 (MG), RGB/YBR (US, SC), compressed transfer syntaxes (JPEG baseline/lossless, JPEG-LS, J2K, RLE) via the loader's codecs, Enhanced MR/CT, multi-frame cine (XA/US/cardiac) with a cine player, PET/CT fusion using the existing `fusionController.ts` **and real SUV** (wire `suvComputation.ts`, delete `Math.random()`).
4. **Derived objects:** DICOM-SEG and RTSTRUCT display via `@cornerstonejs/adapters`; RTDOSE overlay as a stretch.
5. **Non-DICOM parity:** gzip for NRRD/MHA, RAS→LPS for all itk loaders, drop the "any gzip is NIfTI" guess.
6. **Hanging-protocol-lite:** layout presets by modality/body part driven from the suite registry (the first `SuiteConfig` field to become real).
7. **Measurements:** measurement table with CSV/JSON export, Cobb angle, calibration.
8. **Command registry** — built here because every fix above is a command: `viewer.loadStudy`, `viewer.selectSeries`, `viewer.setLayout`, `viewer.setWindowLevel`, `viewer.applyPreset`, `viewer.scrollTo`, `viewer.measure.*`, `viewer.toggleOverlay`. Keyboard shortcuts bind to commands (this alone fixes the empty shortcut registry).
9. **Tests:** one Playwright spec per fixture in the manifest, screenshot baselines, and a JSON result that regenerates the matrix.

Exit: matrix P0 rows all ✅; zero 🔴 rows in P0; old engine deleted.

### Phase 2 — Tier 2: annotation & localization station (6–8 weeks)

1. Segmentation editing on Cornerstone 3.x tools: keep the custom brush/lasso only where they beat upstream; add threshold brush, region grow, interpolation (mount `InterpolationControls`), copy/paste (consume `clipboardStore`), **working undo/redo** (record from the tools, restore in the store).
2. Mount `dicomseg`, `registration`, `audit` routers; DICOM-SEG and RTSTRUCT export/import from the UI; propagation via `SegmentationPropagationService`.
3. Batch UI: delete `simulateBatchProcessing`; `batchProcessingStore` talks to `/batch/process` + WS (fix port); add NIfTI/DICOM-SEG to batch export formats.
4. **Cloud providers:** commit Vertex; implement `SageMakerBatchProvider` (AWS) and `AzureMLBatchProvider` on the existing ABC; BYO-credentials model (per-user provider config, never in compose env); poll timeouts; `_geometry_matches` fails closed; provider-mock tests in CI, nightly real run on one provider.
5. Model registry: backend `/info` is the single source of truth; delete the five duplicated frontend model lists.
6. Commands: `seg.runModel`, `seg.prompt.*`, `seg.edit.*`, `seg.export`, `batch.submit`, `batch.status`, `cloud.configure`, `pacs.store`.

Exit: e2e on fixtures: load → auto-segment → interactive edit → undo → export SEG → visible in Orthanc → reload; batch job local and on one cloud provider.

### Phase 3 — Tier 3: suites (3–5 weeks each; start with two)

Mechanism first, then verticals.

- **Make `SuiteConfig` real or delete the field.** `RightPanel` iterates `suite.panels`; `useSuiteEffects` applies layout/presets/tools; Analytics available in every suite (fixes metrics starvation); one registry (TS) — delete the Python YAML suites or generate one from the other.
- Each suite is a folder: `suites/<id>/{config.ts, panels/, backend/, fixtures/, SKILL.md, e2e/}`.
- **RECIST / Oncology suite** (already strongest): wire `/analytics/recist-measurements` so target lesions auto-measure from segmentations; longitudinal registration (now mounted); PET SUV real; export package.
- **Chest X-ray suite:** keep MedGemma's description; **stop drawing heuristic boxes.** Either show findings as a list without localisation, or add a real detector (fine-tuned on VinDr-CXR-class data) and show its boxes with its confidences. Report generation stays.
- Then RT (RTSTRUCT already real on the backend), Neuro (resurrect or delete the 13 panels — decide per panel against fixtures), Cardiac (needs cine first), Surgical.

Exit: two suites with fixture-backed e2e and a `SKILL.md` each.

### Phase 4 — Agentic layer (starts alongside Phase 1; each tier's commands become tools as they land)

1. **One agent, one loop:** keep `monailabel/agent/` as the seed. Move to the SDK tool runner (per-turn hooks give approval gates and audit for free), adaptive thinking, `strict: true` tools, Sonnet 5 default with Opus 5 for plan-heavy skills. Generic long-running-tool support replaces the hard-coded batch poll.
2. **Client tools:** `viewer.*` commands declared to Claude, executed in the browser via the SSE → command registry → `tool_result` path in §3.
3. **Interlock:** tools tagged `requires_confirmation` suspend the loop; the panel renders a confirm card; the decision is recorded in the audit chain (this is what finally gives `audit` a job).
4. **Persistence:** sessions in SQLite/Postgres; transcript + tool calls replayable.
5. **One surface:** docked agent panel in the viewer + full-screen mode; delete the LangGraph chat, `ChatPanel`, `AskMedAITab`, and the Launcher fork.
6. **Skills:** convert `agentic_skills/*.md` into Agent Skills (`skills/<name>/SKILL.md` with `name`/`description` frontmatter) that reference **tool names, not curl**. The same files are loaded by the in-product agent (skill index in the system prompt, full file on demand) and by Claude Code via `.claude/skills`. Expose the server tools as a real MCP server so Claude Code/Desktop can drive the backend — this replaces the dead `monailabel/mcp/`.
7. **Skill tiers:** T1 `load-study`, `set-layout`, `window-level`, `measure`, `navigate`; T2 `segment`, `edit-segmentation`, `batch-segment`, `cloud-batch`, `export`; T3 `recist-assess`, `cxr-report`, `longitudinal-compare`.
8. **Evals:** a scripted conversation per skill runs in CI against fixtures with the model mocked (deterministic), and nightly against the real model.

Exit: from the chat, on fixtures: "load patient 12's chest CT" → "run TotalSegmentator on liver for patients 1–5 on my AWS account" → "export to PACS" completes with confirm cards, audit entries, and the viewer following along.

---

## 5. Phase dependency

```
Phase 0 ──► Phase 1 (viewer + command registry) ──► Phase 2 (annotation) ──► Phase 3 (suites)
                      │                                   │                       │
                      └──► Phase 4a: T1 tools/skills      └──► 4b: T2 tools       └──► 4c: T3 skills
```

Phase 4 is not a final layer; it is a lane that consumes each tier's commands as they land. The first agentic milestone ("load this image") is reachable within Phase 1.

---

## 6. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| 1 | Launcher (Agent vs Viewer) or a single app with a docked agent panel? | Docked panel + full-screen mode; the agent must live where the viewer state is. |
| 2 | Cornerstone 3.x: patch `cornerstone.ts` or rebuild in a new package? | Rebuild. The DICOM path has to be replaced anyway; the 1.x API is gone in 3.x. |
| 3 | Cloud order after GCP? | AWS SageMaker next (largest user base), then Azure ML. Same ABC. |
| 4 | Which two suites first? | Oncology/RECIST (strongest today) and Chest X-ray (your stated first) — with the box-honesty decision above. |
| 5 | Dead code: delete or attic? | `attic/` branch, delete from `main`. Nothing unreachable stays in the tree. |
| 6 | Neuro panels: resurrect or drop? | Decide per panel in Phase 3 against IXI/ISLES fixtures; default drop. |
