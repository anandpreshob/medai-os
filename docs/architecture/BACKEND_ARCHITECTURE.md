# Backend Architecture

## Overview

The MedAI backend is built on MONAI Label, extended with custom inference models, LLM-based agents, and a microservices architecture for scalability.

## Microservices Architecture

### Service Topology

```
                    ┌──────────────────────────────────────┐
                    │          Internet / Client           │
                    └───────────────────┬──────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (nginx:8002)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Routing Rules:                                                      │  │
│  │    /monai/infer?model=chexagent  →  vlm:8004                        │  │
│  │    /monai/report/*               →  llm:8003                        │  │
│  │    /monai/triage/*               →  llm:8003                        │  │
│  │    /monai/*                      →  inference:8001                  │  │
│  │    /proxy/*                      →  inference:8001                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
                    │                   │                   │
          ┌─────────▼─────────┐ ┌───────▼───────┐ ┌─────────▼─────────┐
          │  inference:8001   │ │  vlm:8004     │ │   llm:8003        │
          │  (GPU Required)   │ │  (GPU Req.)   │ │   (CPU Only)      │
          ├───────────────────┤ ├───────────────┤ ├───────────────────┤
          │ - MONAI Label     │ │ - CheXagent   │ │ - Report Gen      │
          │ - SAM2/SAM3       │ │ - Transformers│ │ - Triage Agent    │
          │ - BiomedParse     │ │ - VL Detection│ │ - LangChain       │
          │ - TotalSegmentator│ │               │ │ - Gemini API      │
          │ - nnUNet          │ │               │ │                   │
          └───────────────────┘ └───────────────┘ └───────────────────┘
```

### Service Details

| Service | Port | GPU | Image Size | Dependencies |
|---------|------|-----|------------|--------------|
| nginx | 8002 | No | ~20MB | nginx:alpine |
| inference | 8001 | Yes | ~12GB | 45 packages (MONAI, PyTorch, etc.) |
| vlm | 8004 | Yes | ~8GB | 12 packages (transformers, torch) |
| llm | 8003 | No | ~2GB | 15 packages (LangChain, pydantic 2.9+) |

### Why Microservices?

**Problem**: Monolithic build had dependency conflicts:
- LangChain >= 0.3.0 requires pydantic >= 2.9
- MONAI Label pins pydantic == 2.7.0

**Solution**: Isolate services with independent dependency trees:
- Inference service uses pydantic 2.7.0 (MONAI compatible)
- LLM service uses pydantic 2.9+ (LangChain compatible)

## Directory Structure

```
MedAI-server/
├── dockerfiles/
│   ├── Dockerfile.inference      # Core MONAI inference
│   ├── Dockerfile.vlm            # CheXagent VLM
│   ├── Dockerfile.llm            # LangChain agents
│   ├── requirements-inference.txt
│   ├── requirements-vlm.txt
│   └── requirements-llm.txt
│
├── nginx/
│   └── nginx.conf                # API gateway configuration
│
├── monailabel/
│   ├── app.py                    # Main FastAPI application
│   ├── main.py                   # CLI entry point
│   ├── config.py                 # Settings and configuration
│   │
│   ├── endpoints/                # FastAPI route handlers
│   │   ├── infer.py              # /infer/{model}
│   │   ├── session.py            # /session
│   │   ├── datastore.py          # /datastore
│   │   ├── report.py             # /report/*
│   │   ├── triage.py             # /triage/*
│   │   ├── proxy.py              # /proxy/*
│   │   └── ...
│   │
│   ├── agents/                   # LLM-based agents
│   │   ├── base_agent.py         # Abstract base class
│   │   ├── breast_agent.py       # BI-RADS report generation
│   │   ├── chestxray_agent.py    # Chest X-ray reports
│   │   ├── triaging_agent.py     # Worklist prioritization
│   │   └── triage_rules.py       # Deterministic rules engine
│   │
│   ├── llm/                      # LLM client abstraction
│   │   ├── __init__.py
│   │   └── llm_client.py         # Gemini/OpenAI client
│   │
│   ├── services/                 # Standalone FastAPI apps
│   │   ├── llm_app.py            # LLM service (port 8003)
│   │   └── vlm_app.py            # VLM service (port 8004)
│   │
│   └── interfaces/               # MONAI Label interfaces
│       └── tasks/
│           └── infer_v2.py       # InferTask base class
│
├── apps/
│   └── radiology/                # Radiology inference app
│       ├── main.py               # App configuration
│       └── lib/
│           ├── configs/          # Model configurations
│           │   ├── biomedparse.py
│           │   ├── totalsegmentator.py
│           │   ├── segmentation.py
│           │   ├── breast_tumor.py
│           │   └── chexagent.py
│           └── infers/           # Inference implementations
│               ├── biomedparse.py
│               ├── totalsegmentator.py
│               ├── segmentation.py
│               ├── breast_tumor.py
│               └── chexagent.py
│
├── biomedparse/                  # BiomedParse model source
├── sam2/                         # SAM2 model (submodule)
├── sam3/                         # SAM3 model (custom)
│
├── checkpoints/                  # Model weights (volume mount)
├── studies/                      # Input data (volume mount)
├── predictions/                  # Output data (volume mount)
│
├── docker-compose.yml            # Monolithic deployment
├── docker-compose.yml (profile: ai)  # Microservices deployment
├── Dockerfile                    # Monolithic Dockerfile
└── requirements.txt              # Combined requirements
```

## API Endpoints

### Core MONAI Label Endpoints (inference:8001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monai/info` | GET | Server info, available models |
| `/monai/infer/{model}` | POST | Run inference on image |
| `/monai/batch_infer/{model}` | POST | Batch inference |
| `/monai/session` | PUT/GET/DELETE | Session management |
| `/monai/datastore` | GET | List studies |
| `/monai/proxy/orthanc/*` | * | Proxy to Orthanc PACS |

### LLM Service Endpoints (llm:8003)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monai/report/generate` | POST | Generate radiology report |
| `/monai/report/agents` | GET | List available agents |
| `/monai/report/health` | GET | LLM service health |
| `/monai/triage/prioritize` | POST | Prioritize study worklist |
| `/monai/triage/levels` | GET | Get triage level definitions |
| `/monai/triage/health` | GET | Triage service health |

### VLM Service Endpoints (vlm:8004 internally)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monai/infer` | POST | CheXagent inference (form data) |
| `/monai/infer/base64` | POST | CheXagent inference (base64) |
| `/monai/info` | GET | VLM service info |
| `/health` | GET | Health check |

## Inference Architecture

### InferTask Pattern

All inference models implement the `InferTask` interface:

```python
class InferTask(ABC):
    """Base class for all inference tasks."""

    def __init__(
        self,
        type: InferType,           # SEGMENTATION, DETECTION, etc.
        labels: Dict[str, int],    # Label name → index mapping
        dimension: int,            # 2 or 3
        description: str,
    ):
        pass

    @abstractmethod
    def pre_transforms(self, data=None) -> Sequence[Callable]:
        """Preprocessing pipeline."""
        pass

    @abstractmethod
    def inferer(self, data=None):
        """Model inference logic."""
        pass

    @abstractmethod
    def post_transforms(self, data=None) -> Sequence[Callable]:
        """Postprocessing pipeline."""
        pass

    def __call__(self, request: Dict) -> Tuple[str, Dict]:
        """Main entry point."""
        pass
```

### Model Inference Flow

```
1. Request arrives at /infer/{model}
        │
        ▼
2. InferEndpoint validates request
        │
        ▼
3. Load/cache model from app_instance
        │
        ▼
4. Pre-transforms (normalize, resample, etc.)
        │
        ▼
5. Model inference (GPU)
        │
        ▼
6. Post-transforms (threshold, largest component, etc.)
        │
        ▼
7. Return multipart response (JSON metadata + NIfTI mask)
```

### Session Management

Interactive models (SAM2, SAM3, nnInteractive) use sessions:

```python
# Initialize session (caches image features)
POST /infer/segmentation
{
    "nninter": "init"
}

# Run inference with prompts (reuses cached features)
POST /infer/segmentation
{
    "nninter": "sam3",
    "pos_points": [[256, 256, 40]],
    "neg_points": []
}

# Reset session
POST /infer/segmentation
{
    "nninter": "reset"
}
```

## Docker Configuration

### Monolithic Deployment

```bash
# Build and run
docker compose up -d --build

# Uses: docker-compose.yml, Dockerfile
# Single container with all services on port 8002
```

### Microservices Deployment

```bash
# Build and run
docker compose --profile ai up -d --build

# Uses: docker-compose.yml (profile: ai)
# 4 containers: nginx (port 8002), inference:8001, vlm:8004, llm:8003
```

### GPU Configuration

```yaml
# docker-compose.yml (profile: ai) (excerpt)
inference:
  runtime: nvidia
  environment:
    - CUDA_VISIBLE_DEVICES=0
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            capabilities: [gpu]
  shm_size: '10gb'  # Required for PyTorch DataLoader
```

## Environment Configuration

### Required Variables

```bash
# .env file

# LLM API (required for report generation)
GEMINI_API_KEY=your_key_here
# or
GOOGLE_API_KEY=your_key_here

# Optional: OpenAI alternative
OPENAI_API_KEY=your_key_here
```

### Service URLs (set automatically in Docker)

```bash
INFERENCE_SERVICE_URL=http://inference:8001
VLM_SERVICE_URL=http://vlm:8004
LLM_SERVICE_URL=http://llm:8003
```

### MONAI Label Settings

```bash
MONAI_LABEL_API_STR=""
MONAI_LABEL_PROJECT_NAME="MedAI MONAI Label"
MONAI_LABEL_AUTH_ENABLE=false
MONAI_LABEL_CORS_ORIGINS=*
```

## Nginx Gateway Configuration

```nginx
# nginx/nginx.conf (simplified)

upstream inference { server inference:8001; }
upstream vlm { server vlm:8004; }
upstream llm { server llm:8003; }

server {
    listen 8002;

    # Route CheXagent to VLM service
    location ~ ^/monai/infer$ {
        if ($arg_model = "chexagent") {
            proxy_pass http://vlm;
        }
        proxy_pass http://inference;
    }

    # Route report/triage to LLM service
    location /monai/report { proxy_pass http://llm; }
    location /monai/triage { proxy_pass http://llm; }

    # Everything else to inference service
    location /monai { proxy_pass http://inference; }
}
```

## Performance Considerations

### GPU Memory Management

- **Lazy Model Loading**: Models loaded on first use, not startup
- **Model Unloading**: TODO - LRU cache for model instances
- **Batch Processing**: `/batch_infer` for multiple images

### Request Timeouts

```nginx
proxy_connect_timeout 60s;
proxy_send_timeout 300s;   # 5 min for large volumes
proxy_read_timeout 300s;
```

### Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=inference_limit:10m rate=10r/s;

location /monai/infer {
    limit_req zone=inference_limit burst=5 nodelay;
}
```

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid request (bad params, unsupported format) |
| 404 | Model or resource not found |
| 500 | Internal error (check logs) |
| 503 | Service unavailable (model loading) |

### Logging

```bash
# View logs
docker compose --profile ai logs -f inference
docker compose --profile ai logs -f llm

# Check for errors
docker logs medai-inference 2>&1 | grep -i error
```

## Health Checks

### Service Health Endpoints

```bash
# Gateway
curl http://localhost:8002/health

# Inference (via gateway)
curl http://localhost:8002/monai/info

# LLM (via gateway)
curl http://localhost:8002/monai/report/health

# VLM (internal port)
curl http://localhost:8004/health
```

### Docker Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8001/monai/info"]
  interval: 60s
  timeout: 30s
  retries: 3
  start_period: 120s  # Allow time for model loading
```

---

**Related Documents**:
- [AI Services Architecture](./AI_SERVICES.md)
- [Agentic Workflows](./AGENTIC_WORKFLOWS.md)
- [Project Architecture](./PROJECT_ARCHITECTURE.md)
