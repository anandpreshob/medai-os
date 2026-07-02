# MedAI Server Setup & Troubleshooting Guide

## Architecture Overview

The MedAI server runs as a microservices stack via Docker Compose:

| Service | Container | Port(s) | GPU | Description |
|---------|-----------|---------|-----|-------------|
| **nginx** | `medai-gateway` | 8002 (external) | No | API gateway — single entry point |
| **inference** | `medai-inference` | 8001 | Yes | MONAI Label: SAM2, BiomedParse, TotalSegmentator, nnUNet |
| **medgemma-vllm** | `medai-medgemma-vllm` | internal only | Yes | vLLM server running MedGemma 4B (~8.5GB VRAM) |
| **medgemma** | `medai-medgemma` | 8004 | No | Wrapper: /detect, /describe, /health endpoints |
| **llm** | `medai-llm` | 8003 | No | LangChain report generation (Gemini/OpenAI APIs) |
| **chat** | `medai-chat` | 8005 (internal) | No | LangGraph radiology Q&A |
| **orthanc** | `medai-orthanc` | 4242 (DICOM), 8042 (HTTP) | No | PACS/DICOMweb server |

**Request flow:** Viewer -> nginx (:8002) -> inference/medgemma/llm/chat/orthanc

## Prerequisites

### GPU Server Requirements

- NVIDIA GPU with >= 16GB VRAM (A10 recommended)
- NVIDIA drivers installed (`nvidia-smi` should work)
- Docker Engine
- **NVIDIA Container Toolkit** (critical — see below)

### Installing NVIDIA Container Toolkit

This is the most common failure point on new servers. Without it, any container using `runtime: nvidia` will fail with:

```
Error response from daemon: unknown or invalid runtime name: nvidia
```

**Install steps:**

```bash
# If you already have the nvidia apt repo (check /etc/apt/sources.list.d/):
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# If not, add the repo first:
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use nvidia runtime and restart:
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify:
sudo docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi
```

**Gotcha:** If you get `Conflicting values set for option Signed-By`, you already have an nvidia apt source configured (e.g. by cloud-init). Remove the conflicting file and use the existing repo:

```bash
sudo rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
```

## Deployment

### 1. Clone and configure

```bash
cd <repo-dir>/MedAI-server  # or wherever the repo is
cp .env.example .env
# Edit .env — set at minimum:
#   GEMINI_API_KEY=your_key
#   GOOGLE_API_KEY=your_key  (alternative)
```

### 2. Launch all services

```bash
sudo docker compose --profile ai up -d --build
```

### 3. Verify

```bash
# Quick check:
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'

# Full health check (from dev machine):
./scripts/health-check.sh <SERVER_IP>
```

### 4. Update frontend to point to server

In `medai-viewer/apps/viewer/.env.local`:

```
VITE_MONAI_SERVER_URL=http://<SERVER_IP>:8002
VITE_MEDAI_SERVER_URL=http://<SERVER_IP>:8002
```

## Health Check Script

Run from the MedAI-server directory:

```bash
# Check remote server
./scripts/health-check.sh my-server.example.com

# Check localhost
./scripts/health-check.sh
```

The script checks:
- Docker container status (via SSH for remote)
- API gateway (nginx :8002)
- Inference service + loaded models
- MedGemma wrapper + vLLM backend
- LLM service + API key configuration
- Chat service
- Orthanc PACS + DICOMweb
- GPU status (VRAM usage)

## Troubleshooting

### Service won't start: "unknown or invalid runtime name: nvidia"

**Cause:** NVIDIA Container Toolkit not installed.
**Fix:** See [Installing NVIDIA Container Toolkit](#installing-nvidia-container-toolkit) above.

### medgemma-vllm stuck in "health: starting"

**Cause:** Model loading + CUDA graph compilation takes 2-4 minutes on first start.
**Check:**

```bash
sudo docker logs -f medai-medgemma-vllm
```

Look for these lines indicating readiness:
```
INFO ... GPU KV cache size: 31,072 tokens
INFO ... Maximum concurrency for 4,096 tokens per request: 7.59x
```

If it crashes with OOM, reduce `--gpu-memory-utilization` in docker-compose.yml (profile: ai) (currently 0.85).

### medgemma wrapper shows healthy but viewer says unavailable

**Cause:** The wrapper (`medai-medgemma`) may be healthy but vLLM backend isn't ready yet. The wrapper reports healthy as long as it can start; actual inference requires vLLM.
**Check:**

```bash
# Test vLLM directly from inside the container:
sudo docker exec medai-medgemma-vllm curl -s http://localhost:8000/v1/models

# Test wrapper health via gateway:
curl http://<SERVER_IP>:8002/monai/medgemma/health
```

### Orthanc shows "unhealthy"

**Cause:** The Orthanc container image doesn't include `curl`. The healthcheck uses `wget` instead.
**Check:** Orthanc is likely running fine — verify directly:

```bash
curl http://<SERVER_IP>:8042/system
```

If using an older docker-compose, update the healthcheck to use `wget`:
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:8042/system || exit 1"]
```

### Inference service loads but models fail

**Check loaded models:**

```bash
curl http://<SERVER_IP>:8002/monai/info/ | python3 -m json.tool | grep -A2 '"models"'
```

**Check logs:**

```bash
sudo docker logs medai-inference 2>&1 | grep -i "error\|fail\|adding model"
```

**Common issues:**
- Missing checkpoints in `/code/checkpoints/` — ensure model files are on the NFS mount
- CUDA OOM — inference + vLLM compete for GPU memory; check `nvidia-smi`

### LLM service returns errors on report generation

**Check API key configuration:**

```bash
curl http://<SERVER_IP>:8003/health
# Look for: "llm_configured": true, "llm_provider": "gemini"
```

If `llm_configured` is false, the `.env` file is missing `GEMINI_API_KEY` or `GOOGLE_API_KEY`.

### Chat service can't reach vLLM

The chat service connects to `medgemma-vllm:8000` via the Docker network. Check:

```bash
sudo docker exec medai-chat curl -s http://medgemma-vllm:8000/v1/models
```

### nginx gateway returns 502 Bad Gateway

**Cause:** Upstream service not ready yet.
**Check:**

```bash
sudo docker logs medai-gateway | grep "502\|upstream"
```

Common during startup — inference takes 30-60s to load, vLLM takes 2-4 min.

### Shared GPU memory issues

If services crash with CUDA errors, ensure `shm_size` is set (inference uses `shm_size: '10gb'`) and `ipc: host` is set for vLLM.

## Port Reference

| Port | Service | Access |
|------|---------|--------|
| 8002 | nginx gateway | External — viewer connects here |
| 8001 | inference (MONAI) | Internal (debug access) |
| 8003 | llm | Internal (debug access) |
| 8004 | medgemma wrapper | Internal (debug access) |
| 8042 | orthanc HTTP | External — DICOMweb |
| 4242 | orthanc DICOM | External — DICOM protocol |

## Volume Mounts

`$MEDAI_DATA` is an operator-chosen directory for large, persistent assets
(model weights and caches). It defaults to a local path but can point at any
shared/NFS mount; the compose file reads it via `MODELS_DIR` and
`MODEL_CACHE_DIR` in `.env` (defaults: `./models`, `./model-cache`).

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./predictions` | `/code/predictions` | Segmentation outputs |
| `./studies` | `/code/studies` | DICOM study files |
| `./checkpoints` | `/code/checkpoints` | Model weights |
| `$MEDAI_DATA/model-cache` | `/root/.cache` | HF/torch model cache |
| `$MEDAI_DATA/models` | `/models` (vLLM) | MedGemma model files |

## Deployment Notes

Record your own server host and provider details here. Any cloud VM with an
NVIDIA GPU (e.g. A10 24 GB) and Ubuntu 22.04 works for the GPU tiers.
