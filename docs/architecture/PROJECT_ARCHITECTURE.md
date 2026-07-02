# MedAI Project Architecture

## Overview

MedAI is an AI-powered medical imaging platform that combines advanced segmentation models, vision-language models, and LLM-based agentic workflows to assist radiologists in diagnosis and reporting.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MedAI Platform                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                    ┌─────────────────────────────┐ │
│  │   medai-viewer      │                    │      MedAI-server           │ │
│  │   (Frontend)        │    HTTP/REST       │      (Backend)              │ │
│  │                     │◄──────────────────►│                             │ │
│  │  React + Cornerstone│                    │  FastAPI + MONAI Label      │ │
│  │  Port: 3000 (dev)   │                    │  Port: 8002 (gateway)       │ │
│  └─────────────────────┘                    └─────────────────────────────┘ │
│           │                                              │                  │
│           │                                              │                  │
│           ▼                                              ▼                  │
│  ┌─────────────────────┐                    ┌─────────────────────────────┐ │
│  │   Orthanc PACS      │                    │   External Services         │ │
│  │   (DICOM Storage)   │                    │   - Gemini API (LLM)        │ │
│  │   Port: 8042        │                    │   - HuggingFace (models)    │ │
│  └─────────────────────┘                    └─────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Overview

### 1. Frontend (medai-viewer)

**Purpose**: Web-based medical image viewer with AI-assisted tools

**Key Capabilities**:
- Multi-format image loading (DICOM, NIfTI, NRRD, MHA)
- 2D/3D volume rendering with Cornerstone3D
- AI-powered segmentation tools
- Clinical suite workflows (oncology, cardiology, etc.)
- Report generation interface

**Technology**: React 18, TypeScript, Cornerstone3D, Zustand, Tailwind CSS

### 2. Backend (MedAI-server)

**Purpose**: AI inference server and API gateway

**Key Capabilities**:
- Medical image segmentation (SAM2, BiomedParse, TotalSegmentator)
- Vision-language analysis (CheXagent)
- Report generation (LangChain + Gemini)
- Worklist triaging
- DICOM proxy

**Technology**: Python, FastAPI, MONAI Label, PyTorch, LangChain

### 3. PACS (Orthanc)

**Purpose**: DICOM storage and DICOMweb API

**Key Capabilities**:
- Study/series storage
- WADO-RS/QIDO-RS endpoints
- DICOM-to-web bridge

**Technology**: Orthanc with DICOMweb plugin

## Repository Structure

```
MedAI/
├── medai-viewer/              # Frontend application
│   ├── apps/
│   │   └── viewer/            # Main React app
│   ├── packages/
│   │   ├── core/              # Business logic, stores, services
│   │   ├── ui/                # UI component library
│   │   └── itk-loader/        # Medical image loaders
│   ├── turbo.json             # Build orchestration
│   └── package.json
│
├── MedAI-server/              # Backend server
│   ├── monailabel/            # MONAI Label core + extensions
│   │   ├── agents/            # LLM report/triage agents
│   │   ├── endpoints/         # FastAPI route handlers
│   │   ├── llm/               # LLM client abstractions
│   │   └── services/          # Standalone FastAPI apps
│   ├── apps/radiology/        # Radiology inference app
│   │   └── lib/infers/        # Model inference tasks
│   ├── dockerfiles/           # Service-specific Dockerfiles
│   ├── nginx/                 # API gateway config
│   └── docker-compose*.yml
│
└── docs/                      # Documentation
    ├── architecture/          # Architecture docs (this folder)
    └── suites/                # Clinical suite PRDs
```

## Design Principles

### 1. Separation of Concerns

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Presentation │    │   Business   │    │     Data     │
│    Layer     │    │    Logic     │    │    Layer     │
├──────────────┤    ├──────────────┤    ├──────────────┤
│ React UI     │◄──►│ Zustand      │◄──►│ API Clients  │
│ Components   │    │ Stores       │    │ IndexedDB    │
│ Cornerstone  │    │ Services     │    │ PACS         │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 2. Plugin Architecture

**Image Loaders**: Extensible format support
```typescript
LoaderRegistry.register(new NiftiLoader());
LoaderRegistry.register(new DicomLoader());
// Easy to add new formats
```

**Clinical Suites**: Modular workflow configurations
```typescript
SuiteRegistry.register('oncology', oncologySuiteConfig);
SuiteRegistry.register('cardiology', cardiologySuiteConfig);
// New specialties = new config files
```

**AI Models**: InferTask interface for consistent model integration
```python
class MyModel(InferTask):
    def __call__(self, request):
        # Standardized input/output contract
```

### 3. Microservices Architecture

The backend uses a 7-service architecture for dependency isolation:

| Service | Port | GPU | Responsibility |
|---------|------|-----|----------------|
| nginx | 8002 | No | API gateway, routing, CORS |
| inference | 8001 | Yes | MONAI segmentation (SAM2, BiomedParse, TotalSegmentator) |
| medgemma-vllm | internal | Yes | vLLM server for MedGemma 4B |
| medgemma-wrapper | 8004 | No | Detection/description API wrapper |
| llm | 8003 | No | LangChain report/triage agents |
| chat | 8005 | No | LangGraph radiology Q&A with RAG |
| orthanc | 8042 | No | PACS/DICOMweb server |

### 4. Human-in-the-Loop Design

All AI outputs are designed as decision support:
- Segmentations can be edited with brush/eraser tools
- Reports are drafts requiring radiologist review
- Triage priorities are suggestions, not decisions

## Key Integrations

### Frontend ↔ Backend

```
medai-viewer                    MedAI-server
     │                               │
     │  GET /monai/info             │
     ├──────────────────────────────►│  Returns available models
     │                               │
     │  POST /monai/infer/{model}   │
     ├──────────────────────────────►│  Runs AI inference
     │  ◄─ multipart (json + nifti) │
     │                               │
     │  POST /monai/report/generate │
     ├──────────────────────────────►│  LLM report generation
     │                               │
     │  POST /monai/triage/prioritize│
     ├──────────────────────────────►│  Worklist triaging
     │                               │
     │  POST /chat                  │
     ├──────────────────────────────►│  LangGraph Q&A with citations
     │                               │
     │  GET /audit/verify           │
     ├──────────────────────────────►│  Hash-chain integrity check
     │                               │
```

### Backend ↔ External Services

```
MedAI-server                    External
     │                               │
     │  Gemini API                  │
     ├──────────────────────────────►│  Report generation, triage
     │                               │
     │  HuggingFace Hub             │
     ├──────────────────────────────►│  Model weights download
     │                               │
     │  Orthanc DICOMweb            │
     ├──────────────────────────────►│  Study retrieval
     │                               │
```

## Scalability Considerations

### Horizontal Scaling

- **Frontend**: Stateless, can scale behind load balancer
- **LLM Service**: CPU-only, easy to replicate
- **Inference Service**: Requires GPU scheduling (Kubernetes with GPU operator)

### Vertical Scaling

- **GPU Memory**: Larger GPUs enable more concurrent models
- **Model Loading**: Lazy loading to avoid memory exhaustion

### Caching

- **Session Cache**: Inference results cached per session
- **Image Cache**: IndexedDB for loaded images
- **Model Cache**: Docker volume for HuggingFace weights

## Security Considerations

### Data Privacy

- Medical images processed locally or on controlled infrastructure
- No PHI sent to external LLM APIs (only de-identified metadata)
- Session data ephemeral, not persisted

### Network Security

- CORS configured for specific origins
- Rate limiting on API gateway
- HTTPS in production

### Authentication

- Optional authentication via MONAI Label auth module
- JWT tokens for session management

### Audit Trail

- SHA-256 hash-chain audit logging (tamper-evident)
- `/audit/verify` endpoint for integrity verification
- Supports FDA 21 CFR Part 11 and IEC 62304 compliance
- Schema v1.1.0 with canonical JSON for reproducible hashes

## Future Architecture Considerations

1. **Kubernetes Deployment**: GPU-aware scheduling, auto-scaling
2. **Model Versioning**: MLflow or similar for model registry
3. **Federated Learning**: Train on distributed hospital data
4. **FHIR Integration**: Connect to EHR for clinical context
5. **Multi-tenant Support**: Organization-level data isolation

---

**Related Documents**:
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md)
- [AI Services](./AI_SERVICES.md)
