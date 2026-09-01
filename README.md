# MedAI Imaging Operating System (medai-os)

**A modular, browser-based medical imaging viewer with optional AI.**

**medai-os** is an OHIF-style DICOM/NIfTI viewer built on [Cornerstone3D](https://www.cornerstonejs.org/)
and [VTK.js](https://kitware.github.io/vtk-js/). It runs as a **basic viewer out of
the box** — drag in a study and view it, with measurement tools, multi-planar
reconstruction, 3D rendering, and orientation/scale overlays — and layers on
**optional AI features** (segmentation, chat, chest X-ray detection, triage,
analytics, reporting) only when you enable them.

> ⚠️ **Not a medical device.** medai-os is for research and educational use only.
> It is not FDA/CE cleared and must not be used for primary diagnosis or clinical
> decision-making. See [SECURITY.md](SECURITY.md).

> 📖 **Learn the concepts.** medai-os is the companion project to the open textbook
> [*AI in Medical Imaging: From Pixels to Practice*](https://anandpreshob.github.io/ai-medical-imaging-book/)
> ([GitHub](https://github.com/anandpreshob/ai-medical-imaging-book)), which explains
> the modalities, models, and workflows behind every feature here — with hands-on
> "Doing this in MedAI OS" walkthroughs per chapter.

---

## Quick start (basic viewer, zero backend)

The Tier 1 viewer (`medai-viewer/apps/viewer2`, Cornerstone3D 5) needs no server at
all — it opens DICOM, NIfTI, NRRD and MetaImage files directly in the browser.

```bash
# 1. Install and run the viewer
cd medai-viewer
pnpm install
pnpm --filter @medai/viewer2 dev      # http://localhost:3100

# 2. "Open local files" → drop a DICOM folder / .zip, or a .nii.gz / .nrrd / .mha
```

Requirements: Node ≥ 20 and pnpm ≥ 9.

What it does today is recorded, not claimed: every capability row in
[`docs/roadmap/02_TIER1_VERIFICATION_MATRIX.md`](docs/roadmap/02_TIER1_VERIFICATION_MATRIX.md)
is generated from a Playwright run against named public fixtures. The plan to get
from here to the annotation station and the agentic layer is in
[`docs/roadmap/01_ROADMAP.md`](docs/roadmap/01_ROADMAP.md).

> The previous app in `medai-viewer/apps/viewer` (Cornerstone3D 1.x, plus the
> segmentation, suite and AI panels) is frozen while Tier 1 is rebuilt; its Tier 2/3
> features will be ported onto the new engine. `pnpm dev` still starts it on :3000.

### Add a PACS (upload + browse studies)

To upload studies and browse them from a server, start Orthanc (the only
always-on backend service):

```bash
cd MedAI-server
docker compose up -d          # starts Orthanc PACS on :8042
```

The viewer's dev proxy already points `/proxy/orthanc` and `/proxy/dicom` at
`http://localhost:8042`.

---

## Enabling optional features

Features are **off by default**. Turn them on with the `VITE_FEATURES` env var
(comma-separated, or `all`) in `medai-viewer/apps/viewer/.env.local`, and start
the matching backend compose profile. A feature only activates if its backend
URL is also configured.

| Feature flag (`VITE_FEATURES`) | What it adds | Backend profile | Needs |
|---|---|---|---|
| *(empty)* | Basic viewer: local files, PACS viewing, measurement tools, overlays | *(none / orthanc only)* | — |
| `monai-segmentation` | Auto-segmentation + interactive smart-edit | `segmentation` | GPU, `VITE_MONAI_SERVER_URL` |
| `analytics` | Volumetrics, radiomics, SUV | `segmentation` | GPU, `VITE_MONAI_SERVER_URL` |
| `chestxray` | MedGemma chest X-ray detection | `ai` | GPU, `VITE_MEDAI_SERVER_URL` |
| `triage` | AI study prioritization | `ai` | GPU, `VITE_MEDAI_SERVER_URL` |
| `batch` | Batch inference jobs (live progress) | `ai` | GPU, `VITE_MEDAI_SERVER_URL` |
| `reports` | AI report generation + report page | `ai` | GPU, `VITE_MEDAI_SERVER_URL` |
| `audit` | Regulatory hash-chain audit logging | `ai` | `VITE_MEDAI_SERVER_URL` |
| `chat` | "Ask MedAI" RAG assistant | `chat` (in `ai`) | GPU + `GEMINI_API_KEY` |
| `registration` | Image registration + propagation | `segmentation` | GPU, `VITE_MONAI_SERVER_URL` |

### Backend tiers

```bash
cd MedAI-server
cp .env.example .env                          # set GEMINI_API_KEY etc. as needed

docker compose up -d                          # basic: Orthanc only
docker compose --profile segmentation up -d   # + MONAI Label (single-container, GPU)
docker compose --profile ai up -d             # + full microservices stack (GPU)
```

`segmentation` and `ai` are alternatives — both serve the AI API on port 8002
(the single MONAI Label container vs. the nginx gateway in front of the
microservices). The GPU tiers require an NVIDIA GPU and the NVIDIA container
runtime. Model weights download on first start into `MedAI-server/checkpoints/`
(gitignored).

Example — enable segmentation + analytics in the viewer:

```bash
# medai-viewer/apps/viewer/.env.local
VITE_FEATURES=monai-segmentation,analytics
VITE_MONAI_SERVER_URL=http://localhost:8002
```

---

## Sample data

No imaging data ships in this repo. A manifest-driven fetcher
(`scripts/sample-data/manifest.json`, stdlib-only Python) downloads public,
de-identified fixtures with SHA-256 verification into `./sample-data`
(gitignored) and writes licence/citation notes to `sample-data/SOURCES.md`:

```bash
python3 scripts/sample-data/fetch.py                  # P0 + unit-test corpus (~100 MB)
python3 scripts/sample-data/fetch.py --list           # show every fixture, tier and size
python3 scripts/sample-data/fetch.py --fixture msd-spleen   # large/optional fixtures by id
python3 scripts/sample-data/fetch.py --verify         # re-check hashes of what is present
python3 scripts/sample-data/fetch.py --upload-to-orthanc http://localhost:8042
python3 scripts/sample-data/synth.py                  # deterministic synthetic fixtures
```

Fixtures that need a Kaggle/PhysioNet/TCIA account are marked `manual`; the
fetcher prints the steps and never embeds credentials. `synth.py` generates
known-geometry CT/DX/XA/RGB/SEG/RTSTRUCT test objects (see each fixture's
`expected.json`); it needs pydicom, nibabel, SimpleITK and, for DICOM-SEG,
highdicom.

### Testing the viewer

```bash
python3 scripts/sample-data/synth.py                         # synthetic known-geometry fixtures
python3 scripts/sample-data/fetch.py                         # public fixtures (pydicom corpus, Slicer, Orthanc demo)
cd medai-viewer && pnpm --filter @medai/viewer2 exec playwright install chromium
pnpm --filter @medai/viewer2 exec playwright test            # 50 fixture tests; PACS test skips without Orthanc
node apps/viewer2/scripts/render-matrix.mjs                  # regenerate docs/roadmap/02_TIER1_VERIFICATION_MATRIX.md
```

CI runs the same suite with an Orthanc service container and uploads the matrix as an artifact.

---

## Repository layout

```
medai-viewer/          Frontend monorepo (pnpm + Turborepo)
  apps/viewer2/        Tier 1 viewer: React 19 + Vite 7 + Cornerstone3D 5 (engine, commands, e2e fixtures)
  apps/viewer/         Previous app (Cornerstone3D 1.x) — frozen, to be ported
  packages/core/       Framework-agnostic stores, service clients, command registry, feature + suite registries
  packages/itk-loader/ itk-wasm local file loaders (DICOM/NIfTI/NRRD/MHA/TIFF)
  packages/ui/         Shared UI primitives
MedAI-server/          Python backend (MONAI Label fork + microservices), docker-compose
docs/                  Architecture and API documentation
scripts/               Helper scripts (sample data, release)
```

The frontend never imports backend code — it talks to it over HTTP, so the
basic viewer is fully usable with no backend running.

## Architecture

How features are gated (frontend): `packages/core/src/features/` defines a
boot-time feature registry. `initFeatures()` runs once (from
`apps/viewer/src/main.tsx`) reading `VITE_FEATURES` plus an optional
`public/config.json`. Disabled features' tabs, panels, routes, hooks, and
service calls never initialize. The existing "Suites" registry
(`packages/core/src/suites/`) is filtered by the same flags.

## License

Apache-2.0 — see [LICENSE](LICENSE). Third-party components (MONAI Label,
BiomedParse, SAM 2/3, Cornerstone3D, VTK.js, itk-wasm) retain their own
licenses; see [NOTICE](NOTICE). **SAM 3 is under Meta's separate "SAM License",
not Apache-2.0.**

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
