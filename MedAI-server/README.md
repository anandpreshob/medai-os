# MedAI Server

A lightweight MONAI Label server deployment for medical image AI segmentation.

> **NEW (v3.0)**: Now supports a [microservices architecture](#microservices-architecture) for better dependency isolation, faster builds, and independent scaling.

## Supported Models

| Model | Type | Description |
|-------|------|-------------|
| `biomedparse` | Auto-Segmentation | Text-prompted segmentation - supports natural language input (e.g., "liver, spleen" or "liver spleen") |
| `totalsegmentator` | Auto-Segmentation | Comprehensive organ segmentation (117 CT / 56 MR structures) |
| `segmentation` | Auto-Segmentation | Multi-organ segmentation (spleen, kidney, liver, etc.) |
| `breast_tumor` | Auto-Segmentation | nnUNet-based breast tumor segmentation from DCE-MRI |
| `nninteractive` | Interactive | nnInteractive model for SmartEdit refinement |
| `sam2` / `sam3` | Interactive | SAM-based point/box prompting |

## Quick Start

### Prerequisites

- Docker with NVIDIA GPU support
- NVIDIA GPU with CUDA 12.1+
- Model checkpoints (see Checkpoints section)

### Option 1: Using Docker Run (Recommended)

```bash
# SSH to server
ssh ubuntu@<SERVER_IP>

# Navigate to project directory
cd <repo-dir>/MedAI-server

# Build the Docker image
sudo docker compose build monai_sam2

# Run the container with all required volume mounts
sudo docker run -d --gpus all --name medai-monai-label \
  --network medai-network \
  -p 8002:8002 \
  -v $(pwd)/predictions:/code/predictions \
  -v $(pwd)/studies:/code/studies \
  -v $(pwd)/checkpoints:/code/checkpoints \
  --shm-size 10gb \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  --restart on-failure \
  monai:latest

# Check logs
sudo docker logs -f medai-monai-label
```

### Option 2: Using Docker Compose

> Note: If you encounter "nvidia runtime" errors, use Option 1 instead.

```bash
# Build and start
sudo docker compose build monai_sam2
sudo docker compose up -d monai_sam2

# Check logs
sudo docker compose logs -f monai_sam2
```

### Verify Server

```bash
# Check server info
curl http://localhost:8002/monai/info/

# List available models
curl -s http://localhost:8002/monai/info/ | python3 -c "import sys, json; data=json.load(sys.stdin); print('Available models:', list(data.get('models', {}).keys()))"

# Expected output:
# Available models: ['biomedparse', 'totalsegmentator', 'segmentation', ...]
```

### Stop and Restart Server

```bash
# Stop container
sudo docker stop medai-monai-label

# Remove container
sudo docker rm medai-monai-label

# Restart (run the docker run command again)
```

## Checkpoints

> **No model weights ship with this repository.** The AI features rely on
> third-party model checkpoints that you download yourself, under each model's
> own license. Some models are **gated** — you must request access and accept
> the provider's license on Hugging Face before you can download them.

Place downloaded checkpoints in the `checkpoints/` directory (git-ignored):

```
checkpoints/
├── biomedparse/
│   └── biomedparse_v2.ckpt          # ~4.5GB - microsoft/BiomedParse (open)
├── totalsegmentator/                 # Auto-downloaded on first use (open)
├── nnInteractive_v1.0/
│   └── nnInteractive.pt             # nnInteractive weights (open)
├── sam2.1_hiera_tiny.pt             # SAM2 weights, auto-downloaded (Apache-2.0)
├── sam3.pt                          # SAM3 weights ~3.4GB — GATED (Meta SAM License)
├── MedSAM2_latest.pt                # MedSAM2 weights (open)
└── nnunet/
    └── full_image_dce_mri_tumor_segmentation/  # nnUNet breast tumor model
```

### Downloading Checkpoints

First install the Hugging Face CLI:
```bash
pip install -U "huggingface_hub[cli]"
```

**SAM 3 — GATED (Meta "SAM License", not Apache-2.0):**

The SAM 3 *code* is vendored in `sam3/` (already open-sourced by Meta); the
*weights* are gated and are **not** distributed here. To obtain them:

1. Open the model page and **request access**, then read and accept Meta's
   SAM License: https://huggingface.co/facebook/sam3
2. Authenticate with a Hugging Face token that has been granted access:
   ```bash
   huggingface-cli login
   ```
3. Download the checkpoint (or let the server fetch it automatically on first
   use via `hf_hub_download(repo_id="facebook/sam3")`):
   ```bash
   huggingface-cli download facebook/sam3 sam3.pt --local-dir checkpoints/
   ```

Your use of the SAM 3 weights is governed by Meta's SAM License — see
[`sam3/LICENSE`](sam3/LICENSE) and the repository-root `NOTICE`, including its
acceptable-use terms.

**BiomedParse (open):**
```bash
huggingface-cli download microsoft/BiomedParse --local-dir checkpoints/biomedparse
```

**MedSAM2 (open):**
```bash
huggingface-cli download wanglab/MedSAM2 MedSAM2_latest.pt --local-dir checkpoints/
```

**SAM 2 (Apache-2.0):**
- Auto-downloaded from Meta's public mirror on first use (no login required).

**TotalSegmentator / nnUNet:**
- Weights are automatically downloaded on first inference.

## Directory Structure

```
MedAI-server/
├── Dockerfile              # Docker image definition
├── docker-compose.yml      # Deployment configuration
├── requirements.txt        # Python dependencies
├── monailabel/             # Core MONAI Label
├── biomedparse/            # BiomedParse source code
├── sam2/                   # SAM2 package
├── sam3/                   # SAM3 package
├── nnInteractive/          # nnInteractive package
├── apps/
│   └── radiology/          # Custom radiology app
│       └── lib/
│           ├── configs/
│           │   ├── biomedparse.py
│           │   ├── totalsegmentator.py
│           │   ├── segmentation.py
│           │   └── breast_tumor.py
│           └── infers/
│               ├── biomedparse.py
│               ├── totalsegmentator.py
│               ├── segmentation.py
│               └── breast_tumor.py
├── checkpoints/            # Model weights (mounted volume)
├── studies/                # Input data (mounted volume)
└── predictions/            # Output predictions (mounted volume)
```

## Configuring Models

Models are configured in the Dockerfile CMD:

```dockerfile
CMD ["python", "-m", "monailabel.main", "start_server", \
     "--app", "/code/apps/radiology", \
     "--studies", "/code/studies", \
     "--conf", "models", "biomedparse,totalsegmentator,segmentation,breast_tumor", \
     "--conf", "use_pretrained_model", "false", \
     "-p", "8002"]
```

To change which models are loaded, edit the `--conf models` line.

## Workflow Testing

### Complete Workflow

1. **Load Image**: Open MedAI Viewer, drag & drop NIfTI file
2. **Auto-Segmentation**:
   - Go to Auto-Seg tab
   - Select model:
     - `biomedparse` - Enter text prompt like "liver" or "liver[SEP]kidney"
     - `totalsegmentator` - Select organs from the organ selector
     - `segmentation` - No additional input needed
   - Click "Run Segmentation"
   - View segmentation overlay
3. **SmartEdit Refinement**:
   - Switch to SmartEdit tab
   - Select `nninteractive` model
   - Click to add positive points (include regions)
   - Shift+Click to add negative points (exclude regions)
4. **Manual Touch-up**:
   - Use Brush tool to paint additional regions
   - Use Eraser to remove incorrectly segmented areas
5. **Export**: Save segmentation as NIfTI

### Configure MedAI Viewer

In the viewer, set MONAI Label server URL:
```
http://<SERVER_IP>:8002
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monai/info/` | GET | Server info and available models |
| `/monai/infer/biomedparse` | POST | Run BiomedParse segmentation |
| `/monai/infer/totalsegmentator` | POST | Run TotalSegmentator |
| `/monai/infer/segmentation` | POST | Run multi-organ segmentation |
| `/monai/session/` | PUT | Create session |

## Model Details

### BiomedParse

- **Input**: 2D/3D medical image + text prompt
- **Output**: Multi-label segmentation mask
- **Text Format**: Supports natural language input - comma-separated, space-separated, or with "and"
- **Examples**:
  - `"liver"` - single organ
  - `"liver, spleen, kidney"` - comma-separated (recommended)
  - `"liver spleen kidney"` - space-separated
  - `"liver and spleen"` - natural language with "and"
  - `"left kidney"` - multi-word descriptions are kept together
  - `"liver[SEP]spleen"` - explicit separator (legacy format)

### TotalSegmentator

- **Input**: CT or MR volume
- **Output**: Multi-label segmentation (up to 117 structures)
- **Modalities**: CT (117 structures), MR (56 structures)
- **Parameters**:
  - `modality`: "ct" or "mr"
  - `roi_subset`: Optional list of specific organs

### nnInteractive

- **Input**: Image + prompts (points, boxes, scribbles, lassos)
- **Output**: Binary or multi-label segmentation
- **Modes**:
  - `init`: Initialize session with full image
  - `sam3`/`nninter`: Refinement with prompts only

## Troubleshooting

### Server won't start

```bash
# Check GPU availability
nvidia-smi

# Check Docker GPU support
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi
```

### "nvidia runtime" error with docker compose

Use the direct `docker run` command instead (Option 1 above).

### Model not showing in dropdown

1. Check if checkpoint exists:
```bash
ls -la checkpoints/biomedparse/
ls -la checkpoints/totalsegmentator/
```

2. Check server logs for errors:
```bash
sudo docker logs medai-monai-label 2>&1 | grep -i error
```

3. Verify model is in the configured list in Dockerfile

### Out of memory

- Reduce batch size or use smaller models
- For TotalSegmentator, segment fewer organs at once using `roi_subset`

## Development

### Deploy Code Changes WITHOUT Rebuilding

For quick code changes (e.g., fixing bugs in inference scripts), you can update files directly in the running container without rebuilding the entire image:

```bash
# SSH to server
ssh ubuntu@<SERVER_IP>

# Copy updated file to container
sudo docker cp /path/to/local/file.py medai-monai-label:/code/apps/radiology/lib/infers/file.py

# Restart container to apply changes
sudo docker restart medai-monai-label

# Verify server is running
curl http://localhost:8002/info/
```

**Example: Updating BiomedParse inference script**
```bash
# From your local machine, copy file to server first
scp ./apps/radiology/lib/infers/biomedparse.py ubuntu@<SERVER_IP>:/tmp/

# Then on the server
ssh ubuntu@<SERVER_IP>
sudo docker cp /tmp/biomedparse.py medai-monai-label:/code/apps/radiology/lib/infers/
sudo docker restart medai-monai-label
```

**One-liner from local machine:**
```bash
scp ./apps/radiology/lib/infers/biomedparse.py ubuntu@<SERVER_IP>:/tmp/ && \
ssh ubuntu@<SERVER_IP> "sudo docker cp /tmp/biomedparse.py medai-monai-label:/code/apps/radiology/lib/infers/ && sudo docker restart medai-monai-label"
```

### Rebuild after major changes

Only rebuild when changing dependencies or Dockerfile:

```bash
sudo docker compose build --no-cache monai_sam2
sudo docker stop medai-monai-label && sudo docker rm medai-monai-label
# Then run the docker run command again
```

### View live logs

```bash
sudo docker logs -f medai-monai-label
```

### Check container status

```bash
sudo docker ps -a
```

## Dependency Management

All dependencies are pinned to specific versions in `requirements.txt` to ensure reproducibility. These versions are synced from the working production server.

**IMPORTANT:** Before updating any dependency:
1. Test locally first
2. Update both `requirements.txt` and `Dockerfile` if needed
3. Document the change and reason

To sync versions from a working server:
```bash
ssh ubuntu@<SERVER_IP> "sudo docker exec medai-monai-label pip freeze" > server-packages.txt
```

---

## Microservices Architecture

The microservices deployment splits the server into 4 independent services to solve dependency conflicts and improve build times.

### Why Microservices?

- **Dependency isolation**: LangChain >= 0.3.0 can conflict with pydantic 2.7.0 (required by MONAI). Microservices isolate these dependencies.
- **Faster builds**: Parallel builds, smaller images, incremental updates
- **Better scaling**: Scale LLM service independently from GPU inference

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      API Gateway (nginx:8000)                   │
└─────────────┬──────────────────────────────┬───────────────────┘
              │                              │
      ┌───────▼──────────┐          ┌───────▼──────────────────┐
      │  inference:8001  │          │   llm:8003               │
      │  (GPU - MONAI)   │          │   (CPU - LangChain)      │
      └─────────┬────────┘          └──────────────────────────┘
                │
      ┌─────────▼──────────┐
      │  vlm:8002          │
      │  (GPU - CheXagent) │
      └────────────────────┘
```

### Services

| Service | Port | GPU | Purpose |
|---------|------|-----|---------|
| nginx | 8000 | No | API gateway, request routing |
| inference | 8001 | Yes | MONAI segmentation (SAM2, BiomedParse, etc.) |
| vlm | 8002 | Yes | CheXagent chest X-ray detection |
| llm | 8003 | No | Report generation, worklist triaging |

### Deploy Microservices

```bash
# Configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Build and start all services
sudo docker compose --profile ai up -d --build

# Monitor logs
sudo docker compose --profile ai logs -f

# Test services
curl http://localhost:8000/health              # Gateway
curl http://localhost:8000/monai/info          # Inference
curl http://localhost:8000/monai/report/health # LLM
```

### Nginx Routing

| Route | Service | Description |
|-------|---------|-------------|
| `/monai/infer?model=chexagent` | vlm:8002 | CheXagent detection |
| `/monai/report/*` | llm:8003 | Report generation |
| `/monai/triage/*` | llm:8003 | Worklist triaging |
| `/monai/*` | inference:8001 | All other MONAI endpoints |

### Files

```
dockerfiles/
├── Dockerfile.inference      # Core MONAI (45 deps)
├── Dockerfile.vlm            # CheXagent (12 deps)
├── Dockerfile.llm            # LangChain (15 deps)
├── requirements-inference.txt
├── requirements-vlm.txt
└── requirements-llm.txt

nginx/
└── nginx.conf               # API gateway config

monailabel/services/
├── llm_app.py               # Standalone LLM FastAPI app
└── vlm_app.py               # Standalone VLM FastAPI app

docker-compose.yml (profile: ai)
```

### Update Individual Service

```bash
# Rebuild only the LLM service (fast - no GPU deps)
sudo docker compose --profile ai build llm
sudo docker compose --profile ai up -d llm

# Rebuild only inference service
sudo docker compose --profile ai build inference
sudo docker compose --profile ai up -d inference
```

### Rollback to Monolithic

```bash
# Stop microservices
sudo docker compose --profile ai down

# Start monolithic
sudo docker compose up -d

# Frontend: change port from 8000 to 8002
```

### Environment Variables

Required in `.env`:
```bash
# LLM Service (required for report generation)
GEMINI_API_KEY=your_key_here
# or
GOOGLE_API_KEY=your_key_here

# Optional
OPENAI_API_KEY=your_key_here
```
