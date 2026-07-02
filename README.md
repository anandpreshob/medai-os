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

---

## Quick start (basic viewer, zero backend)

The basic viewer needs no server at all — it loads local files directly in the browser.

```bash
# 1. Install and run the frontend
cd medai-viewer
pnpm install
pnpm dev              # http://localhost:3000

# 2. Open the app, go to Upload, and drag in a DICOM/NIfTI/NRRD file.
```

Requirements: Node ≥ 20 and pnpm ≥ 9.

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

No imaging data ships in this repo. To fetch public sample datasets for a quick try:

```bash
./scripts/download-sample-data.sh          # downloads into ./sample-data (gitignored)
./scripts/download-sample-data.sh --upload # also push DICOMs into a running Orthanc
```

---

## Repository layout

```
medai-viewer/          Frontend monorepo (pnpm + Turborepo)
  apps/viewer/         React 18 + Vite + Cornerstone3D app
  packages/core/       Framework-agnostic stores, service clients, feature + suite registries
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
