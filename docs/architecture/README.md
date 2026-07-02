# MedAI Architecture Documentation

This directory contains comprehensive architecture documentation for the MedAI medical imaging platform.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Project Architecture](./PROJECT_ARCHITECTURE.md) | High-level system overview, component relationships, and design principles |
| [Backend Architecture](./BACKEND_ARCHITECTURE.md) | Server-side microservices, API design, and deployment patterns |
| [Frontend Architecture](./FRONTEND_ARCHITECTURE.md) | React application structure, state management, and component design |
| [AI Services Architecture](./AI_SERVICES.md) | Machine learning models, inference pipelines, and GPU utilization |
| [Agentic Workflows](./AGENTIC_WORKFLOWS.md) | LangChain agents, report generation, and worklist triaging |
| [Data Flow](./DATA_FLOW.md) | End-to-end data flow from image upload to report generation |

## Quick Links

### For Developers
- [Frontend Component Tree](./FRONTEND_ARCHITECTURE.md#component-organization)
- [API Endpoints](./BACKEND_ARCHITECTURE.md#api-endpoints)
- [State Management](./FRONTEND_ARCHITECTURE.md#state-management)

### For DevOps
- [Microservices Deployment](./BACKEND_ARCHITECTURE.md#microservices-deployment)
- [Docker Configuration](./BACKEND_ARCHITECTURE.md#docker-configuration)
- [Environment Variables](./BACKEND_ARCHITECTURE.md#environment-configuration)

### For ML Engineers
- [Inference Models](./AI_SERVICES.md#inference-models)
- [Adding New Models](./AI_SERVICES.md#adding-new-models)
- [GPU Memory Management](./AI_SERVICES.md#gpu-memory-management)

## Architecture Principles

1. **Separation of Concerns**: Frontend, backend, and AI services are independently deployable
2. **Modular Design**: Clinical suites, image loaders, and AI models use plugin architectures
3. **Scalability**: Microservices allow independent scaling of compute-intensive services
4. **Extensibility**: New imaging modalities, AI models, and clinical workflows are easy to add
5. **Medical Safety**: Human-in-the-loop design with AI as decision support, not replacement

## Technology Stack

### Frontend
- React 18 + TypeScript
- Cornerstone3D (medical image rendering)
- Zustand (state management)
- Tailwind CSS + shadcn/ui

### Backend
- Python 3.10+
- FastAPI (REST API)
- MONAI Label (medical AI framework)
- PyTorch 2.6 (deep learning)

### AI/ML
- SAM2/SAM3 (interactive segmentation)
- BiomedParse (text-prompted segmentation)
- TotalSegmentator (CT/MR organ segmentation)
- CheXagent (chest X-ray detection)
- LangChain + Gemini (agentic workflows)

### Infrastructure
- Docker + Docker Compose
- NVIDIA CUDA 12.1
- Nginx (API gateway)
- Orthanc (PACS)

---

**Last Updated:** 2026-01-22
