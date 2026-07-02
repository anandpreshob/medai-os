# MedAI MONAI Label Server - Deployment Guide

**GPU-Accelerated Medical Image Segmentation Server**

Complete guide for deploying the MedAI MONAI Label server with SAM2/SAM3 interactive segmentation on GPU cloud instances.

**Repository:** https://github.com/<your-org>/medai-os

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Microservices Architecture](#microservices-architecture) **(NEW)**
5. [Provider-Specific Setup](#provider-specific-setup)
   - [Lambda Labs](#lambda-labs-setup)
   - [AWS EC2](#aws-ec2-setup)
   - [Google Cloud](#google-cloud-setup)
   - [Azure](#azure-setup)
6. [Server Configuration](#server-configuration)
7. [Testing the Server](#testing-the-server)
8. [API Documentation](#api-documentation)
9. [Troubleshooting](#troubleshooting)
10. [Cost Management](#cost-management)
11. [Advanced Configuration](#advanced-configuration)
12. [Maintenance](#maintenance)

---

## Overview

This server provides GPU-accelerated medical image segmentation using:
- **SAM2/SAM3** - Segment Anything Model for interactive segmentation
- **nnInteractive** - Neural network-based interactive segmentation
- **MONAI Label** - Medical imaging AI framework

### Architecture

```
┌─────────────────────┐              ┌──────────────────────┐
│   Local Machine     │              │   GPU Cloud Instance │
│                     │              │                      │
│  ┌───────────────┐  │   API calls  │  ┌────────────────┐  │
│  │ medai-viewer  │  │─────────────>│  │ MONAI Label    │  │
│  │ (React/Vite)  │  │              │  │ API Server     │  │
│  │               │  │              │  │ (GPU-powered)  │  │
│  │ - UI          │  │              │  │                │  │
│  │ - DICOM files │  │              │  │ - SAM2/SAM3    │  │
│  └───────────────┘  │              │  │ - nnInteractive│  │
│                     │              │  └────────────────┘  │
│  Port: 3000 (local) │              │  Port: 8002          │
└─────────────────────┘              └──────────────────────┘
```

**Why this architecture?**
- **Cost efficiency**: Only pay for GPU when running inference
- **Security**: Medical images stay on local machine (sent only during inference)
- **Performance**: GPU-accelerated inference (A10: ~0.58s per segmentation)
- **Flexibility**: Can switch GPU instances as needed

---

## Prerequisites

### GPU Instance Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA T4 (16GB) | NVIDIA A10 (24GB) |
| GPU Memory | 16GB VRAM | 24GB VRAM |
| CPU | 4 cores | 8+ cores |
| RAM | 16GB | 32GB+ |
| Storage | 50GB | 100GB+ |
| CUDA | 11.8+ | 12.1+ |

### Required Software

Pre-installed on most GPU cloud instances:
- Docker 20.10+
- Docker Compose 2.0+
- NVIDIA Docker Runtime
- Git
- curl

---

## Quick Start

**Get running in 5 minutes:**

```bash
# 1. SSH into your GPU instance
ssh ubuntu@YOUR_INSTANCE_IP

# 2. Clone repository
git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server

# 3. Build and start (15-20 min build time)
sudo docker compose up --build -d

# 4. Monitor logs until "Application startup complete"
sudo docker compose logs -f

# 5. Test server
curl http://localhost:8002/info/ | grep models
```

That's it! Server is running on port 8002.

For remote access, configure firewall (see provider-specific sections below).

---

## Microservices Architecture

> **NEW (v3.0)**: The server now supports a microservices architecture that solves dependency conflicts between MONAI and LangChain, improves build times, and enables independent scaling.

### Why Microservices?

The monolithic Docker build was experiencing:
- **Dependency conflicts**: LangChain >= 0.3.0 conflicts with pydantic 2.7.0 (required by MONAI)
- **Long build times**: 25+ minute builds with frequent resolution failures
- **GPU memory contention**: Inference and LLM services competing for resources

### Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                      API Gateway / Nginx                        │
│                   (Port 8002 - External Entry)                  │
└──────┬──────────────┬────────────────┬────────────┬────────────┘
       │              │                │            │
┌──────▼──────┐ ┌─────▼─────┐ ┌────────▼────────┐ ┌─▼───────────┐
│  Inference  │ │MedGemma   │ │  LLM Service    │ │Chat Service │
│  (MONAI)    │ │ Wrapper   │ │(Reports/Triage) │ │(LangGraph)  │
│  Port: 8001 │ │ Port: 8004│ │   Port: 8003    │ │ Port: 8005  │
│  GPU (Yes)  │ │ CPU only  │ │   CPU only      │ │ CPU only    │
└──────┬──────┘ └─────┬─────┘ └─────────────────┘ └─────────────┘
       │              │
       │        ┌─────▼─────────┐
       │        │MedGemma vLLM  │
       │        │(Internal Only)│
       │        │GPU (~8.5GB)   │
       └────────┴───────────────┘
```

### Service Breakdown

| Service | Port | GPU | Purpose | Image Size |
|---------|------|-----|---------|------------|
| nginx (gateway) | 8002 | No | Request routing, CORS, single entry point | ~20MB |
| inference | 8001 | Yes | MONAI: SAM2, BiomedParse, TotalSegmentator, nnUNet | ~12GB |
| medgemma-vllm | internal | Yes | vLLM server running MedGemma 4B (~8.5GB VRAM) | ~17GB |
| medgemma-wrapper | 8004 | No | MedGemma /detect, /describe, /health endpoints | ~188MB |
| llm | 8003 | No | LangChain report generation (Gemini/OpenAI APIs) | ~440MB |
| chat | 8005 | No | LangGraph radiology Q&A with RAG | ~380MB |
| orthanc | 4242/8042 | No | PACS/DICOMweb server | ~150MB |

### Nginx Routing Rules

- `/monai/medgemma/*` → medgemma-wrapper:8004
- `/monai/report/*` → llm:8003
- `/monai/triage/*` → llm:8003
- `/chat/*` → chat:8005
- `/audit/*` → inference:8001
- All other `/monai/*` → inference:8001

### Deploy Microservices

```bash
# SSH into your GPU instance
ssh ubuntu@YOUR_INSTANCE_IP

# Clone repository
git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server

# Configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY (required for LLM service)

# Build and start all services (parallel build)
sudo docker compose --profile ai up -d --build

# Monitor logs
sudo docker compose --profile ai logs -f

# Test health endpoints
curl http://localhost:8002/health              # Gateway
curl http://localhost:8002/monai/info          # Inference service
curl http://localhost:8002/monai/report/health # LLM service
curl http://localhost:8002/chat/health         # Chat service
curl http://localhost:8002/audit/verify        # Audit chain verification
```

### Fast Deployment (Pre-built Images)

If you keep pre-built images on shared/NFS storage, you can skip the build step
by loading them. `$MEDAI_DATA` is an operator-chosen directory (e.g. a local
path, or an NFS mount such as the one Lambda Labs provides) — set it to wherever
your persistent assets live:

```bash
# SSH into your GPU instance
ssh ubuntu@YOUR_INSTANCE_IP

# Point MEDAI_DATA at your persistent/shared storage
export MEDAI_DATA=/opt/medai        # or your NFS mount, e.g. /mnt/nfs/medai

# Navigate to the server directory
cd $MEDAI_DATA/MedAI-server

# Load pre-built images from NFS (~2-3 minutes)
./scripts/load-images.sh

# Start all services
sudo docker compose --profile ai up -d

# Verify all services are healthy
sudo docker compose --profile ai ps
```

**Pre-built images on NFS:**
| Image | Compressed Size | Description |
|-------|-----------------|-------------|
| inference.tar.gz | 5.9GB | Core MONAI segmentation models |
| vlm.tar.gz | 4.5GB | Vision-language model (CheXagent) |
| llm.tar.gz | 122MB | LLM report agents (LangChain) |
| medgemma.tar.gz | 4.4GB | MedGemma chest X-ray detection model |
| medgemma-wrapper.tar.gz | 65MB | MedGemma API wrapper service |

**After updating images**, save them back to NFS for future deployments:
```bash
./scripts/save-images.sh
```

**Manual image save/load commands** (if scripts unavailable):
```bash
# Save images to NFS (run after building/updating)
sudo docker save medai/inference:latest | gzip > $MEDAI_DATA/docker-images/inference.tar.gz
sudo docker save medai/vlm:latest | gzip > $MEDAI_DATA/docker-images/vlm.tar.gz
sudo docker save medai/llm:latest | gzip > $MEDAI_DATA/docker-images/llm.tar.gz
sudo docker save medai/medgemma:latest | gzip > $MEDAI_DATA/docker-images/medgemma.tar.gz
sudo docker save medai/medgemma-wrapper:latest | gzip > $MEDAI_DATA/docker-images/medgemma-wrapper.tar.gz

# Load images from NFS (on new instance)
gunzip -c $MEDAI_DATA/docker-images/inference.tar.gz | sudo docker load
gunzip -c $MEDAI_DATA/docker-images/vlm.tar.gz | sudo docker load
gunzip -c $MEDAI_DATA/docker-images/llm.tar.gz | sudo docker load
gunzip -c $MEDAI_DATA/docker-images/medgemma.tar.gz | sudo docker load
gunzip -c $MEDAI_DATA/docker-images/medgemma-wrapper.tar.gz | sudo docker load
```

### Directory Structure

```
MedAI-server/
├── dockerfiles/
│   ├── Dockerfile.inference      # Core MONAI (GPU, port 8001)
│   ├── Dockerfile.vlm            # CheXagent (GPU, port 8004)
│   ├── Dockerfile.llm            # LLM agents (CPU, port 8003)
│   ├── requirements-inference.txt # 45 deps, pinned
│   ├── requirements-vlm.txt       # 12 deps, minimal
│   └── requirements-llm.txt       # 15 deps, latest LangChain!
├── nginx/
│   └── nginx.conf                # API gateway routing (port 8002)
├── scripts/
│   ├── load-images.sh            # Load pre-built images from NFS
│   └── save-images.sh            # Save images to NFS after updates
├── monailabel/services/
│   ├── llm_app.py                # Standalone FastAPI for reports/triage
│   └── vlm_app.py                # Standalone FastAPI for CheXagent
├── docker-compose.yml (profile: ai)  # Multi-service orchestration
└── .env.example                  # Environment variable template

# NFS Fileshare Structure (Lambda Labs)
$MEDAI_DATA/
├── MedAI-server/                 # Server code (synced from git)
├── docker-images/                # Pre-built Docker images
│   ├── inference.tar.gz          # 5.9GB - Core MONAI
│   ├── vlm.tar.gz                # 4.5GB - CheXagent VLM
│   ├── llm.tar.gz                # 122MB - LangChain agents
│   ├── medgemma.tar.gz           # 4.4GB - MedGemma model
│   └── medgemma-wrapper.tar.gz   # 65MB  - MedGemma wrapper
└── model-cache/                  # HuggingFace model cache (shared)
```

### Benefits vs Monolithic

| Metric | Monolithic | Microservices | With Pre-built Images |
|--------|------------|---------------|----------------------|
| Build time | 25+ min | 15 min (parallel) | **2-3 min** (load only) |
| LLM update | Full rebuild | 2 min LLM service only | 2 min + save |
| Dependency conflicts | Frequent | None (isolated) | None |
| GPU memory | Shared/contended | Per-service | Per-service |
| Scaling | All or nothing | Per-service | Per-service |
| New server setup | 25+ min | 15+ min | **2-3 min** |

### Frontend Update

When using microservices, update `medai-viewer/apps/viewer/.env`:
```bash
# Port 8002 = nginx gateway (routes to appropriate service)
VITE_MONAI_SERVER_URL=http://YOUR_SERVER_IP:8002
```

### Rollback to Monolithic

If microservices fail, revert to the original monolithic deployment:
```bash
# Stop microservices
sudo docker compose --profile ai down

# Start monolithic (uses docker-compose.yml)
sudo docker compose up -d

# Update frontend to port 8002
# VITE_MONAI_SERVER_URL=http://YOUR_SERVER_IP:8002
```

---

## Provider-Specific Setup

### Lambda Labs Setup

**Best for:** Quick deployment, competitive pricing ($0.60/hr for A10)

#### Step 1: Create Lambda Labs Account

1. Go to https://lambdalabs.com/service/gpu-cloud
2. Create an account and add payment method
3. Add SSH key:
   ```bash
   # On your local machine (if needed)
   ssh-keygen -t ed25519 -C "your_email@example.com"
   cat ~/.ssh/id_ed25519.pub
   # Copy this public key to Lambda Labs dashboard
   ```

#### Step 2: Launch GPU Instance

1. Go to **Instances** tab → **Launch Instance**
2. Select **1x A10 (24 GB)** - ~$0.60/hour
3. Choose **Ubuntu 22.04** (CUDA pre-installed)
4. Select region closest to you
5. Paste your SSH public key
6. Click **Launch**
7. Note the assigned public IP address of your instance

#### Step 3: Connect and Deploy

```bash
# SSH into instance
ssh ubuntu@YOUR_INSTANCE_IP

# Verify environment (Lambda Labs comes with Docker pre-installed)
docker --version          # Should show Docker 28.5.1+
nvidia-smi               # Should show NVIDIA A10 (24GB)

# Clone and deploy
git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server
sudo docker compose up --build -d

# Monitor build (~15-20 minutes first time)
sudo docker compose logs -f
```

#### Step 4: Configure Firewall

1. Go to https://cloud.lambdalabs.com/instances
2. Click on your instance
3. **Firewall** section → **Add Rule**:
   - Port: `8002`
   - Protocol: `TCP`
   - Source: `0.0.0.0/0` (or your IP for security)

#### Step 5: Test Remote Access

```bash
# From your local machine
curl http://YOUR_INSTANCE_IP:8002/info/
```

**Lambda Labs Tips:**
- Instance data is **not persistent** - save important files before terminating
- Use **Persistent Storage** volumes for model checkpoints (optional)
- Billing is **per minute** - stop when not in use to save costs
- No egress fees (unlike AWS)

---

### AWS EC2 Setup

**Best for:** Enterprise deployments, integration with AWS services

#### Step 1: Launch EC2 Instance

```bash
# Using AWS CLI
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \  # Deep Learning AMI (Ubuntu 22.04)
  --instance-type g5.xlarge \          # 1x A10 GPU
  --key-name your-key-pair \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx
```

Or use AWS Console:
1. Go to EC2 → Launch Instance
2. Select **Deep Learning AMI (Ubuntu 22.04)**
3. Instance type: **g5.xlarge** (1x A10, 24GB) or **g4dn.xlarge** (1x T4, 16GB)
4. Configure storage: 100GB
5. Security Group: Allow TCP 8002 from your IP

#### Step 2: Configure Security Group

```bash
# Add inbound rule for port 8002
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 8002 \
  --cidr YOUR_IP/32
```

#### Step 3: Connect and Deploy

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@ec2-instance-ip.compute.amazonaws.com

# Verify NVIDIA drivers (pre-installed on Deep Learning AMI)
nvidia-smi

# Deploy server (same as Lambda Labs)
git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server
sudo docker compose up --build -d
```

**AWS Tips:**
- Use **Spot Instances** for 70% cost savings (may be interrupted)
- Use **Reserved Instances** for 30-50% savings (1-year commitment)
- Attach **EBS volumes** for persistent storage
- Use **Elastic IPs** for stable IP addresses
- Consider **Auto Scaling Groups** for production

---

### Google Cloud Setup

**Best for:** Google Cloud integrations, TPU availability

#### Step 1: Create VM Instance

```bash
# Using gcloud CLI
gcloud compute instances create medai-server \
  --zone=us-central1-a \
  --machine-type=n1-standard-4 \
  --accelerator=type=nvidia-tesla-t4,count=1 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --metadata=install-nvidia-driver=True
```

#### Step 2: Configure Firewall

```bash
# Create firewall rule
gcloud compute firewall-rules create allow-monai \
  --allow=tcp:8002 \
  --source-ranges=YOUR_IP/32 \
  --description="Allow MONAI Label server"
```

#### Step 3: Connect and Deploy

```bash
# SSH into instance
gcloud compute ssh medai-server --zone=us-central1-a

# Install Docker (not pre-installed on basic Ubuntu image)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Install NVIDIA Docker Runtime
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker

# Deploy server
git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server
sudo docker compose up --build -d
```

**GCP Tips:**
- Use **Preemptible VMs** for 80% cost savings
- Use **Committed Use Discounts** for long-term deployments
- GPU availability varies by zone - check quota
- Consider **Cloud Run** for serverless deployment (advanced)

---

### Azure Setup

**Best for:** Microsoft enterprise integrations

#### Step 1: Create VM

```bash
# Using Azure CLI
az vm create \
  --resource-group medai-rg \
  --name medai-server \
  --image Ubuntu2204 \
  --size Standard_NC6s_v3 \  # 1x V100 GPU
  --admin-username azureuser \
  --generate-ssh-keys
```

#### Step 2: Configure Network Security Group

```bash
# Add inbound rule for port 8002
az network nsg rule create \
  --resource-group medai-rg \
  --nsg-name medai-server-nsg \
  --name Allow-MONAI \
  --priority 1000 \
  --source-address-prefixes YOUR_IP \
  --destination-port-ranges 8002 \
  --access Allow \
  --protocol Tcp
```

#### Step 3: Install NVIDIA Drivers

```bash
# SSH into instance
ssh azureuser@medai-server-ip

# Install NVIDIA drivers
sudo apt update
sudo apt install -y ubuntu-drivers-common
sudo ubuntu-drivers install

# Reboot
sudo reboot

# After reboot, verify
nvidia-smi
```

#### Step 4: Deploy Server

```bash
# Install Docker (same as GCP section)
# ... then:

git clone https://github.com/<your-org>/medai-os.git
cd medai-os/MedAI-server
sudo docker compose up --build -d
```

**Azure Tips:**
- Use **Low-priority VMs** for discounted GPU instances
- Use **Azure Machine Learning** for managed deployment
- GPU quota may require approval request
- Consider **Azure Container Instances** for simpler deployment

---

## Server Configuration

### Understanding docker-compose.yml

The server uses a simplified configuration for GPU-only deployment:

```yaml
# MedAI-server/docker-compose.yml
version: "3.8"

networks:
  medai-network:
    driver: bridge

volumes:
  orthanc-db:
    name: medai-orthanc-db

services:
  # Orthanc PACS Server (optional for DICOM storage)
  orthanc:
    image: jodogne/orthanc-plugins:latest
    ports:
      - "8042:8042"
    volumes:
      - ./orthanc/orthanc.json:/etc/orthanc/orthanc.json:ro
      - orthanc-db:/var/lib/orthanc/db

  # MONAI Label AI Server (main service)
  monai_sam2:
    build:
      context: ./
      dockerfile: ./Dockerfile
    image: monai:latest
    container_name: medai-monai-label
    runtime: nvidia
    ports:
      - "8002:8002"
    volumes:
      - ./predictions:/code/predictions
      - ./studies:/code/studies
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities: [gpu]
    shm_size: '10gb'
    depends_on:
      - orthanc
```

### Build Process

```bash
# Start build (15-20 minutes first time)
cd medai-os/MedAI-server
sudo docker compose up --build -d

# Monitor build progress
sudo docker compose logs -f
```

**What happens during build:**
1. Downloads NVIDIA CUDA base image (~2GB)
2. Installs Python dependencies (PyTorch, MONAI, transformers)
3. Downloads model weights:
   - SAM2.1 Hiera Tiny (~130MB)
   - SAM3 weights (~1.3GB if configured)
4. Downloads radiology app from MONAI registry
5. Total: ~8GB disk space

**Build artifacts are cached** - subsequent builds are much faster (2-3 minutes).

### Verify Server is Running

```bash
# Check container status
sudo docker compose ps

# Should show:
# NAME                 STATUS       PORTS
# medai-monai-label    Up X mins    0.0.0.0:8002->8002/tcp
# medai-orthanc        Up X mins    0.0.0.0:8042->8042/tcp

# Test MONAI API
curl http://localhost:8002/info/ | python3 -m json.tool | head -20

# Should show server info and available models
```

### Verify GPU Access

```bash
# Check GPU from inside container
sudo docker exec medai-monai-label nvidia-smi

# Should show:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 570.xx    Driver Version: 570.xx    CUDA Version: 12.x         |
# |-------------------------------+----------------------+----------------------+
# |   0  NVIDIA A10               | Memory-Usage:  ~1.4GB / 24GB                |
# +-------------------------------+----------------------+----------------------+
```

The ~1.4GB memory usage indicates model weights are loaded successfully.

---

## Testing the Server

### Manual Testing

```bash
# Test 1: Health check
curl http://localhost:8002/

# Expected: {"status": "UP"}

# Test 2: Server info
curl http://localhost:8002/info/ | grep models

# Expected: "models": {"segmentation": {...}}

# Test 3: Initialize session (if you have sample data)
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@sample-data/ct-liver.zip" \
  -F 'params={"nninter":"init"}'

# Expected: {}

# Test 4: Run segmentation with point prompt
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@sample-data/ct-liver.zip" \
  -F 'params={"nninter":"sam3","pos_points":[[256,256,40]],"neg_points":[]}' \
  --max-time 180 -o /tmp/seg_result.dat

# Check response size
ls -lh /tmp/seg_result.dat
# Should be ~few MB (multipart response with JSON + NIfTI)
```

### Automated Test Script

Save as `test-server.sh`:

```bash
#!/bin/bash
set -e

SERVER="http://localhost:8002"

echo "=== MONAI Label Server Test Suite ==="

# Test 1: Server Health
echo "✓ Testing server health..."
curl -s "$SERVER/" | grep -q "UP" || { echo "✗ Failed"; exit 1; }

# Test 2: Models Loaded
echo "✓ Testing models loaded..."
curl -s "$SERVER/info/" | grep -q "models" || { echo "✗ Failed"; exit 1; }

# Test 3: GPU Access
echo "✓ Testing GPU access..."
sudo docker exec medai-monai-label nvidia-smi > /dev/null || { echo "✗ Failed"; exit 1; }

echo ""
echo "=== All Tests Passed! ==="
```

Run tests:
```bash
chmod +x test-server.sh
./test-server.sh
```

---

## API Documentation

### Base URL

- **Local:** `http://localhost:8002`
- **Remote:** `http://YOUR_INSTANCE_IP:8002`

### Endpoints

#### 1. GET `/`
Health check endpoint.

**Response:**
```json
{"status": "UP"}
```

#### 2. GET `/info/`
Get server information and loaded models.

**Response:**
```json
{
  "name": "MONAILabel - Radiology",
  "version": "0.8.1",
  "models": {
    "segmentation": {
      "type": "segmentation",
      "labels": {
        "spleen": 1,
        "kidney_right": 2,
        "kidney_left": 3,
        "liver": 4,
        "stomach": 5,
        ...
      },
      "dimension": 3
    }
  }
}
```

#### 3. POST `/infer/segmentation`
Run interactive segmentation inference.

**Request:**
Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | ZIP of DICOM series or single DICOM file |
| `params` | JSON | Yes | Inference parameters (see below) |

**Params JSON:**
```json
{
  "nninter": "sam3",
  "pos_points": [[x, y, z]],
  "neg_points": [[x, y, z]]
}
```

**nninter modes:**
- `init` - Initialize session with DICOM series
- `sam3` - Run SAM3 interactive segmentation
- `reset` - Reset session

**Response:**
Content-Type: `multipart/form-data`

1. **params** (JSON):
```json
{
  "prompt_info": {"pos_points": [[256, 256, 40]]},
  "nninter_elapsed": 0.578,
  "flipped": true
}
```

2. **image** (binary NIfTI file): `.nii.gz` compressed segmentation mask

**Example:**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@series.zip" \
  -F 'params={"nninter":"sam3","pos_points":[[256,256,40]],"neg_points":[]}'
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
sudo docker compose logs --tail=100

# Common issues:

# 1. GPU not accessible
sudo docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# 2. Port 8002 already in use
sudo lsof -i :8002
sudo kill -9 <PID>

# 3. Out of disk space
df -h
sudo docker system prune -a -f
```

### Build Fails

```bash
# Clean rebuild
sudo docker compose down
sudo docker system prune -a -f
sudo docker compose up --build -d
```

### Inference Returns HTTP 500

```bash
# Check recent logs
sudo docker compose logs --tail=200 | grep ERROR

# Common issues:
# 1. Missing nninter parameter - Add "nninter": "init" or "sam3"
# 2. Invalid prompt format - Check JSON structure
# 3. GPU out of memory - Restart container or use smaller batch
```

### Slow Inference

```bash
# Check GPU utilization
watch -n 1 sudo docker exec medai-monai-label nvidia-smi

# During inference, GPU-Util should spike to 80-100%

# If GPU not being used:
sudo docker exec medai-monai-label python -c "import torch; print(torch.cuda.is_available())"
# Should print: True
```

### Connection Refused (Remote Access)

```bash
# 1. Verify server is running locally
curl http://localhost:8002/

# 2. Check firewall rules
# Lambda Labs: Dashboard → Firewall
# AWS: Security Group → Inbound Rules
# GCP: VPC Firewall → Rules
# Azure: Network Security Group → Inbound Rules

# 3. Test from instance itself
curl http://YOUR_INSTANCE_IP:8002/

# 4. Check container port binding
sudo docker port medai-monai-label
# Should show: 8002/tcp -> 0.0.0.0:8002
```

---

## Cost Management

### Pricing Comparison (Approximate)

| Provider | Instance | GPU | Cost/Hour | Cost/Day (24h) | Cost/Month (730h) |
|----------|----------|-----|-----------|----------------|-------------------|
| **Lambda Labs** | 1x A10 | 24GB | $0.60 | $14.40 | $432 |
| **Lambda Labs** | 1x A6000 | 48GB | $0.80 | $19.20 | $576 |
| **AWS EC2** | g5.xlarge | A10 24GB | $1.01 | $24.24 | $737 |
| **AWS EC2 Spot** | g5.xlarge | A10 24GB | ~$0.30 | $7.20 | $216 |
| **AWS EC2** | g4dn.xlarge | T4 16GB | $0.526 | $12.62 | $384 |
| **GCP** | n1-std-4 + T4 | T4 16GB | $0.65 | $15.60 | $474 |
| **GCP Preemptible** | n1-std-4 + T4 | T4 16GB | ~$0.16 | $3.84 | $116 |
| **Azure** | NC6s_v3 | V100 16GB | $3.06 | $73.44 | $2,234 |

### Cost Optimization Strategies

#### 1. Stop When Not in Use

**Lambda Labs:**
```bash
# Stop containers (keeps instance)
sudo docker compose down

# Terminate instance (destroys everything)
# Lambda Labs Dashboard → Terminate
```

**AWS:**
```bash
# Stop instance (preserves data)
aws ec2 stop-instances --instance-ids i-xxxxx

# Terminate instance (destroys everything)
aws ec2 terminate-instances --instance-ids i-xxxxx
```

#### 2. Use Spot/Preemptible Instances

**AWS Spot Instances:**
- 50-70% cheaper than on-demand
- May be interrupted with 2-minute warning
- Good for development/testing

**GCP Preemptible VMs:**
- 80% cheaper than regular instances
- Guaranteed to run for at least 24 hours
- Max lifetime: 24 hours

#### 3. Automated Shutdown

**Auto-shutdown after inactivity (Lambda Labs/AWS):**
```bash
# Add to crontab - shutdown if no activity for 2 hours
cat > ~/auto-shutdown.sh << 'EOF'
#!/bin/bash
IDLE_TIME=7200  # 2 hours
while true; do
  ACTIVITY=$(docker stats --no-stream --format "{{.CPUPerc}}" medai-monai-label 2>/dev/null | sed 's/%//')
  if (( $(echo "$ACTIVITY < 1" | bc -l) )); then
    echo "Shutting down due to inactivity"
    sudo docker compose down
    break
  fi
  sleep 60
done
EOF
chmod +x ~/auto-shutdown.sh

# Run in background
nohup ~/auto-shutdown.sh &
```

#### 4. Development vs Production Recommendations

**Development:**
- Lambda Labs 1x A10 ($0.60/hr)
- Start/stop as needed
- **Estimated:** $50-100/month with active management

**Production:**
- AWS Reserved Instances (30-50% savings, 1-year commitment)
- Auto-scaling groups
- **Estimated:** $250-350/month with optimization

---

## Advanced Configuration

### Use Multiple GPUs

Edit `docker-compose.yml`:
```yaml
environment:
  - CUDA_VISIBLE_DEVICES=0,1  # Use GPUs 0 and 1
```

### Change Server Port

```yaml
ports:
  - "8003:8002"  # External:Internal
```

### Increase Shared Memory

For large DICOM series:
```yaml
shm_size: '20gb'  # Increase from 10gb
```

### Enable Debug Logging

```bash
# Set environment variable
export MONAI_DEBUG=1

# Rebuild
sudo docker compose up --build -d

# View debug logs
sudo docker compose logs -f | grep DEBUG
```

### Persistent Model Checkpoints

To avoid re-downloading models after instance restart:

1. **Save checkpoints:**
```bash
# Before terminating instance
sudo docker cp medai-monai-label:/code/checkpoints ./checkpoints-backup
```

2. **On new instance:**
```bash
mkdir -p checkpoints
# Upload checkpoints-backup via scp
```

3. **Mount in docker-compose.yml:**
```yaml
volumes:
  - ./predictions:/code/predictions
  - ./studies:/code/studies
  - ./checkpoints:/code/checkpoints  # Add this
```

---

## Maintenance

### Daily Operations

```bash
# Start server
sudo docker compose up -d

# Stop server
sudo docker compose down

# Restart server
sudo docker compose restart

# View logs (real-time)
sudo docker compose logs -f

# View last 100 lines
sudo docker compose logs --tail=100

# Check status
sudo docker compose ps

# Check GPU usage
sudo docker exec medai-monai-label nvidia-smi

# Test API
curl http://localhost:8002/info/
```

### Update Server

```bash
# Pull latest changes
cd ~/MedAI
git pull origin main

# Rebuild and restart
cd MedAI-server
sudo docker compose up --build -d
```

### Clean Rebuild

```bash
sudo docker compose down
sudo docker system prune -a -f
sudo docker compose up --build -d
```

### Backup

```bash
# Backup predictions and studies
tar -czf monai-backup-$(date +%Y%m%d).tar.gz \
  predictions \
  studies

# Backup to cloud (AWS S3 example)
aws s3 cp monai-backup-*.tar.gz s3://your-bucket/backups/
```

---

## Summary Checklist

### Initial Setup
- [ ] GPU instance launched (Lambda Labs/AWS/GCP/Azure)
- [ ] SSH key configured
- [ ] Connected via SSH
- [ ] NVIDIA drivers verified (`nvidia-smi`)
- [ ] Docker and Docker Compose verified
- [ ] Repository cloned
- [ ] Docker image built
- [ ] Server running on port 8002
- [ ] API responding to `/info/` requests
- [ ] GPU detected and in use

### Client Setup
- [ ] Firewall configured for port 8002
- [ ] medai-viewer configured with server IP
- [ ] Successfully connected to MONAI API from viewer
- [ ] Test segmentation completed

### Production Checklist
- [ ] Auto-restart configured
- [ ] Monitoring set up (optional)
- [ ] Backup strategy configured
- [ ] Auto-shutdown configured (optional)
- [ ] Team has access credentials
- [ ] Cost alerts configured

---

## Support

- **GitHub Issues:** https://github.com/<your-org>/medai-os/issues
- **MONAI Label Docs:** https://docs.monai.io/projects/label/en/latest/
- **SAM2/SAM3 Documentation:** https://github.com/facebookresearch/segment-anything-2

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.3.0 | 2026-02-04 | Added chat service, audit verification endpoint, updated service ports |
| 3.2.0 | 2026-01-24 | Added MedGemma services (medgemma-vllm, medgemma-wrapper) for chest X-ray detection |
| 3.1.0 | 2026-01-23 | Added pre-built Docker images on NFS for fast deployment (2-3 min) |
| 3.0.0 | 2026-01-22 | Added microservices architecture (4-service: nginx, inference, vlm, llm) |
| 2.0.0 | 2026-01-17 | Consolidated guide with provider-specific sections |
| 1.0.0 | 2026-01-06 | Initial deployment guide |

---

**Last Updated:** 2026-02-04
**Generated with Claude Code**
