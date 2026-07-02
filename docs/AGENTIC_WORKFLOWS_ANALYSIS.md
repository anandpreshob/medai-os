# MedAI Agentic Workflows Analysis

> **Document Type:** Research Analysis
> **Date:** January 2026
> **Status:** Research Complete - No Implementation Yet
> **Scope:** Comprehensive analysis of agentic workflow opportunities for MedAI

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Current State Analysis](#3-current-state-analysis)
4. [Agentic Workflow Opportunities](#4-agentic-workflow-opportunities)
5. [Implementation Considerations](#5-implementation-considerations)
6. [Prioritized Recommendations](#6-prioritized-recommendations)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Success Metrics](#8-success-metrics)
9. [Risk Mitigation](#9-risk-mitigation)
10. [Conclusion](#10-conclusion)

---

## 1. Executive Summary

This document presents a comprehensive analysis of **15 high-value agentic workflow opportunities** that could significantly enhance MedAI's clinical workflows, reduce radiologist workload, and improve diagnostic accuracy.

### Key Findings

- **MedAI's existing infrastructure** (MONAI Label, suite architecture, analytics) provides an excellent foundation for multi-agent systems
- **Highest-value opportunities:** QA validation, report generation, study triage, and longitudinal comparison
- **All agents must be designed as clinical decision support** - never autonomous clinical actors
- **Safety-first approach** with mandatory human-in-the-loop gates for all clinical outputs

### Recommended Starting Points

| Priority | Agent | Impact | Effort |
|----------|-------|--------|--------|
| 1st | Interactive QA Agent | Prevents segmentation errors | Medium |
| 2nd | Adaptive Model Selection | Better model choices | Low |
| 3rd | Study Triage Agent | Faster urgent case identification | Medium |

---

## 2. Project Overview

### 2.1 What is MedAI?

**MedAI Viewer** is a modern, AI-powered medical imaging viewer designed to bridge the gap between clinical imaging (DICOM) and research formats (NIfTI, NRRD, MHA). It combines native support for multiple image formats with AI-powered interactive segmentation via MONAI Label integration.

**Key Differentiators:**
- Native NIfTI, NRRD, MHA support (not just DICOM)
- Built-in AI segmentation as a core feature (not an extension)
- Designed for research workflows and AI/ML engineers
- Modern, customizable UI with theme system
- Multi-planar reconstruction (MPR) with 3D surface rendering
- Domain-specific suites for clinical specialties

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Presentation Layer (React + TypeScript)       │
│  UI Components | Viewports | Panels | Tools | Theme System     │
└───────────────────┬─────────────────────────────────────┬───────┘
                    │                                     │
        ┌───────────▼──────────────┐     ┌──────────────▼────────┐
        │  Core Services Layer      │     │  MONAI Label Client   │
        │  (Zustand Stores)         │     │  (REST API Client)    │
        │  - Viewer State           │     │  - Inference Service  │
        │  - Segmentation          │     │  - Analytics Service  │
        │  - MONAI Integration     │     │  - File Export        │
        └───────────┬──────────────┘     └──────────────┬────────┘
                    │                                    │
        ┌───────────▼──────────────────────────────────▼────────────┐
        │         Image Loading & Rendering Layer                    │
        │  ┌────────────────────┐      ┌──────────────────────────┐ │
        │  │  DICOM Loader      │      │  ITK-WASM Universal     │ │
        │  │ (Cornerstone3D)    │      │  (NIfTI, NRRD, MHA)    │ │
        │  └────────────────────┘      └──────────────────────────┘ │
        │              │                            │                │
        │  ┌───────────▼──────────────────────────▼──────────────┐  │
        │  │         Cornerstone3D Rendering Engine               │  │
        │  │  MPR | Volume Rendering | 3D Surface | Segmentation │  │
        │  └──────────────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
     ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
     │ Local Files │ │DICOM PACS │ │MONAI Label  │
     │(File API)   │ │(Orthanc)  │ │(GPU Server) │
     └─────────────┘ └───────────┘ └─────────────┘
```

### 2.3 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | React 18 + TypeScript | UI framework with type safety |
| **Bundler** | Vite 5.x | Fast builds and HMR |
| **State Management** | Zustand | Store state (viewer, segmentation, MONAI) |
| **Styling** | Tailwind CSS | Utility-based CSS |
| **Medical Imaging** | Cornerstone3D | Main rendering engine |
| **3D Rendering** | VTK.js | Surface rendering (marching cubes) |
| **Image Formats** | ITK-WASM | NIfTI, NRRD, MHA, Analyze |
| **Build System** | Turborepo | Monorepo orchestration |
| **Backend** | MONAI Label + FastAPI | AI segmentation server |
| **Deep Learning** | PyTorch | DL framework |
| **Testing** | Playwright | E2E testing |

### 2.4 MedAI Suites System

MedAI Suites transform the viewer into domain-specific solutions:

| Suite | Use Cases | Key Features |
|-------|-----------|--------------|
| **Oncology** | Tumor analysis, RECIST, lesion tracking | Volumetrics, radiomics, lesion count |
| **Radiation Therapy** | OAR contouring, RTSTRUCT handling | TG-263 compliance, dose overlay |
| **Neurology** | Brain parcellation, lesion load | WM lesion tracking, brain volumes |
| **Cardiology** | Chamber segmentation, EF calculation | 4D cine support, wall motion |
| **Surgical Planning** | Pre-op planning, 3D models | STL export, FLR calculation |

---

## 3. Current State Analysis

### 3.1 Existing AI Capabilities

#### Segmentation Models (Backend - MONAI Label)

| Model | Type | Purpose |
|-------|------|---------|
| **SAM3** | Interactive | Segment Anything with point/box/lasso prompts |
| **SAM2/MedSAM2** | Interactive | Medical-specific SAM variants |
| **nnInteractive** | Interactive | 3D interactive segmentation framework |
| **TotalSegmentator** | Automatic | Multi-organ segmentation (104+ structures) |
| **BiomedParse** | Text-prompted | Multi-modal medical image parsing |
| **DeepEdit** | Interactive | Interactive refinement model |
| **DeepGrow** | Interactive | 2D/3D growth-based segmentation |
| **Custom models** | Task-specific | Breast tumor, vertebra pipeline, spleen |

#### Analytics Services

- **Volumetrics:** Connected components analysis, volume measurement (mm³/cm³)
- **Radiomics:** PyRadiomics with ~120 features (shape, texture, first-order)
- **Suite-specific metrics:** RECIST, ejection fraction, lesion load, etc.

### 3.2 Current Invocation Patterns

**Manual Triggers (Current State):**
- User selects model from dropdown
- User draws prompts (points, boxes, lassos, scribbles)
- User clicks "Run Segmentation" button
- User manually requests analytics computation

**Semi-Automated:**
- Session management for iterative refinement
- Automatic 3D propagation from 2D prompts
- Suite auto-detection from DICOM metadata

**No Current Automation For:**
- Study prioritization/triage
- Automatic model selection beyond suite hints
- Multi-step workflow orchestration
- Quality assurance checks
- Report generation
- Cross-study analysis
- Protocol recommendation

### 3.3 Typical User Workflow

```
1. Load image (DICOM, NIfTI, NRRD) → Manual
2. Select suite (or auto-detected)   → Semi-auto
3. Choose model                       → Manual
4. Draw prompts                       → Manual
5. Run segmentation                   → Manual
6. Review results                     → Manual
7. Refine with brush/eraser          → Manual
8. Compute analytics                  → Manual
9. Export results                     → Manual
```

**Opportunity:** Many of these steps can be enhanced or automated with agentic workflows while maintaining human oversight.

---

## 4. Agentic Workflow Opportunities

### 4.1 Overview: 15 Identified Opportunities

| # | Agent | Category | Impact | Risk |
|---|-------|----------|--------|------|
| 1 | Intelligent Study Triage | Workflow | High | Medium |
| 2 | Multi-Modal Report Generation | Documentation | Very High | Medium |
| 3 | Adaptive Model Selection | UX | High | Low |
| 4 | Longitudinal Study Comparison | Clinical | High | Medium |
| 5 | Interactive QA Agent | Quality | High | Low |
| 6 | Protocol Recommendation | Clinical | Medium | Low |
| 7 | Batch Processing Orchestrator | Operations | Medium | Low |
| 8 | Radiomics Interpretation | Research | Medium | Low |
| 9 | DICOM Metadata Enrichment | Data Quality | Low | Low |
| 10 | Smart Annotation Propagation | UX | Medium | Low |
| 11 | RT Planning Assistant | RT Suite | Very High | Medium |
| 12 | Oncology Treatment Response | Oncology Suite | Very High | Medium |
| 13 | Cardiac Function Analysis | Cardiology Suite | High | Medium |
| 14 | Neurology Lesion Tracking | Neurology Suite | High | Medium |
| 15 | Surgical Planning Optimization | Surgical Suite | High | Medium |

---

### 4.2 Detailed Opportunity Analysis

#### Opportunity 1: Intelligent Study Triage Agent

**Use Case:** Automatically prioritize studies requiring urgent attention

**Current Gap:** All studies arrive in chronological order; radiologists must manually assess urgency

**Agent Architecture:** Single agent with tool access

**Workflow:**
```
Study Arrives → Triage Agent
  ├── Extract metadata (modality, body part, protocol)
  ├── Parse clinical history for urgency keywords
  ├── Run preliminary TotalSegmentator (if CT/MR)
  ├── Detect anomalies (unexpected masses, fluid collections)
  ├── Calculate urgency score
  └── Route to queue: [STAT, Urgent, Routine]
```

**Human-in-the-Loop Gate:**
- High-urgency classifications trigger immediate radiologist notification
- Agent provides reasoning: "Large pleural effusion detected + keyword 'dyspnea' → Urgent"
- Radiologist can override prioritization

**Safety Considerations:**
- Never delay truly urgent cases (pneumothorax, hemorrhage)
- Confidence threshold: >0.85 for STAT classification
- All studies still reviewed; only ordering changes
- Audit log of all prioritization decisions

**Impact:** 30-50% faster identification of urgent cases

---

#### Opportunity 2: Multi-Modal Report Generation Assistant

**Use Case:** Generate structured radiology reports with AI assistance

**Current Gap:** No report generation; segmentation results exported separately from clinical interpretation

**Agent Architecture:** Multi-agent supervisor pattern

**Agents:**
1. **Finding Extraction Agent** - Analyzes segmentations and measurements
2. **Literature Retrieval Agent** - Searches RadLex, ACR guidelines
3. **Report Drafting Agent** - Generates structured report
4. **QA Agent** - Validates completeness and accuracy

**Workflow:**
```
Completed Segmentation → Report Generation Pipeline

Finding Agent:
  ├── Extract segment volumes
  ├── Compute radiomics features
  ├── Compare to normal reference ranges
  └── Identify significant findings

Literature Agent:
  ├── Query RadLex for standardized terminology
  ├── Retrieve ACR appropriateness criteria
  └── Find relevant guidelines (e.g., LI-RADS, Lung-RADS)

Drafting Agent:
  ├── Generate "Findings" section
  ├── Generate "Impression" section
  └── Apply suite-specific templates

QA Agent:
  ├── Check for missing critical findings
  ├── Verify measurements cited
  └── Flag inconsistencies

→ Human Review Gate (Radiologist edits/approves) [MANDATORY]
```

**Human-in-the-Loop Gate:**
- **MANDATORY:** Report NEVER auto-finalized
- Radiologist sees draft with highlighted AI sections
- Confidence scores per finding
- Reference ranges and guidelines cited
- Radiologist edits/approves before signing

**Safety Considerations:**
- All AI-generated text watermarked: "AI-assisted draft - requires physician review"
- No autonomous clinical decisions
- Comprehensive audit trail of all edits
- Explicit labeling of AI vs human contributions

**Impact:** 40-60% reduction in report drafting time

---

#### Opportunity 3: Adaptive Model Selection Agent

**Use Case:** Automatically select optimal segmentation model for each study

**Current Gap:** User manually selects from 10+ models; suboptimal choices common

**Agent Architecture:** Single reasoning agent with decision tree

**Decision Logic:**
```
Study Loaded → Model Selection Agent

1. Parse DICOM tags:
   - Modality (CT, MR, PET, etc.)
   - Body part examined
   - Sequence type (T1, T2, FLAIR, etc.)
   - Clinical indication

2. Analyze image characteristics:
   - Dimensionality (2D vs 3D)
   - Spacing/resolution
   - Contrast phase

3. Consider suite context:
   - Oncology → prioritize tumor models
   - RT → prioritize OAR models
   - Neurology → prioritize brain models

4. Query model capabilities and match

5. Generate recommendations:
   Primary: TotalSegmentator (CT, body part matches)
   Fallback: nnInteractive (for refinement)
   Alternative: BiomedParse (if text prompt available)
```

**Human-in-the-Loop:**
- Agent provides recommendations, user approves
- "Auto-run" option with user confirmation
- Override always available

**Impact:** 25% reduction in suboptimal model selection

---

#### Opportunity 4: Longitudinal Study Comparison Agent

**Use Case:** Automatically compare current study with prior exams for tumor tracking

**Current Gap:** Manual side-by-side comparison; no automated change detection

**Agent Architecture:** Multi-agent pipeline

**Agents:**
1. **Prior Retrieval Agent** - Fetches relevant prior studies from PACS
2. **Registration Agent** - Aligns current and prior volumes
3. **Change Detection Agent** - Identifies growth/regression
4. **RECIST Measurement Agent** - Computes standardized measurements

**Workflow:**
```
New Study Loaded → Longitudinal Analysis Pipeline

Prior Retrieval Agent:
  ├── Query PACS for same patient
  ├── Filter by modality and body part
  ├── Select most recent comparable study
  └── Download DICOM series

Registration Agent:
  ├── Perform rigid registration (ITK/ANTs)
  ├── Apply deformable registration if needed
  └── Align coordinate systems

Segmentation Agent:
  ├── Segment current study
  ├── Segment prior study (if not already done)
  └── Propagate labels to aligned space

Change Detection Agent:
  ├── Compute volumetric changes (%)
  ├── Detect new lesions
  ├── Identify resolved lesions
  └── Calculate growth rates

RECIST Agent (for oncology):
  ├── Identify target lesions
  ├── Measure longest diameter
  ├── Calculate sum of diameters
  └── Classify: CR, PR, SD, PD

→ Human Review Gate (Radiologist validates findings)
```

**Safety Considerations:**
- Registration errors flagged for manual review
- Confidence thresholds on change detection
- RECIST measurements require radiologist confirmation
- Clear visualization of alignment quality

**Impact:** 70% faster prior comparison workflow

---

#### Opportunity 5: Interactive Quality Assurance Agent

**Use Case:** Automated QA checks on segmentations before export

**Current Gap:** No systematic QA; users export potentially flawed segmentations

**Agent Architecture:** Rule-based agent + LLM validator

**Checks Performed:**
- Anatomical plausibility (liver volume 700-2500 mL)
- Segmentation completeness (no missing slices)
- Label consistency (no overlapping OARs in RT)
- Edge quality (smooth vs jagged boundaries)
- Outlier detection (volumes >3 SD from mean)

**Workflow:**
```
User Clicks "Export" → QA Agent

Rule-Based Checks:
  ├── Volume range validation
  ├── Connectivity analysis (should be one component)
  ├── Boundary smoothness metrics
  └── Overlap detection

LLM Reasoner:
  ├── "Does this segmentation look anatomically correct?"
  ├── Cross-reference with image intensity
  └── Generate QA report

If QA Fails:
  ├── Block export with warning
  ├── Highlight problematic regions
  └── Suggest corrections

If QA Passes:
  └── Proceed to export
```

**Human-in-the-Loop:**
- User reviews QA report
- Can override warnings (with justification logged)
- Cannot bypass errors without fixing

**Impact:** 60% reduction in segmentation errors

---

#### Opportunity 6: Automated Protocol Recommendation Agent

**Use Case:** Suggest imaging protocols for follow-up studies

**Agent Architecture:** RAG-based recommendation system

**Tools:** ACR Appropriateness Criteria, institutional protocols, guideline search

**Workflow:**
```
Study Findings → Protocol Agent
  ├── Parse current findings
  ├── Query ACR guidelines
  ├── Match to institutional protocols
  └── Recommend follow-up (modality, timing, technique)
```

**Safety:** Recommendations only; ordering requires physician approval

---

#### Opportunity 7: Batch Processing Orchestrator

**Use Case:** Overnight processing of multiple studies with optimal resource allocation

**Agent Architecture:** Supervisor agent managing worker pool

**Capabilities:**
- Queue management (FIFO, priority)
- GPU resource allocation
- Model caching optimization
- Error recovery and retry logic

**Workflow:**
```
Batch Job Submitted → Orchestrator Agent
  ├── Analyze queue (100 studies)
  ├── Group by modality/model
  ├── Allocate GPU resources
  ├── Parallelize where possible
  ├── Handle failures gracefully
  └── Generate completion report
```

**Safety:** Batch results flagged for review; no auto-acceptance

---

#### Opportunity 8: Radiomics Feature Interpretation Agent

**Use Case:** Translate 120+ radiomics features into clinical insights

**Current Gap:** Radiomics computation exists but no interpretation layer

**Agent Architecture:** LLM-based feature interpreter + literature search

**Workflow:**
```
Radiomics Computed → Interpretation Agent
  ├── Identify significant features (z-score > 2)
  ├── Search PubMed for feature-outcome associations
  ├── Generate plain-language summary
  └── Link to relevant research
```

**Example Output:**
> "High GLCM contrast (23.4) suggests heterogeneous tumor texture, associated with aggressive histology in lung adenocarcinoma (PMID: 12345678)"

**Safety:** "Research insights only - not validated for clinical diagnosis"

---

#### Opportunity 9: DICOM Metadata Validator & Enrichment Agent

**Use Case:** Validate and enrich DICOM tags for downstream systems

**Agent Architecture:** Rule-based validator + LLM enrichment

**Capabilities:**
- Detect missing/invalid required tags
- Suggest corrections for malformed data
- Enrich with derived metadata (body part from images)
- Harmonize terminology (SNOMED CT mapping)

**Impact:** Improved data quality for research and AI training

---

#### Opportunity 10: Smart Annotation Propagation Agent

**Use Case:** Propagate user annotations across similar slices/studies

**Agent Architecture:** Single agent with similarity detection

**Workflow:**
```
User Annotates Slice 50 → Propagation Agent
  ├── Detect similar slices (image similarity)
  ├── Apply deformable propagation
  ├── Present for user validation
  └── User approves/rejects per slice
```

**Safety:** User validates every propagated annotation

---

### 4.3 Suite-Specific Agents

#### Opportunity 11: RT Planning Assistant (Radiation Therapy Suite)

**Use Case:** End-to-end RT planning workflow automation

**Multi-Agent System:**
- **OAR Segmentation Agent** - Auto-segment all organs at risk
- **GTV Definition Agent** - Assist with gross tumor volume delineation
- **Margin Expansion Agent** - Generate CTV/PTV from GTV
- **Dose Constraint Agent** - Suggest dose limits per structure
- **RTSTRUCT Export Agent** - Format for treatment planning system

**Workflow:**
```
CT Sim Loaded → RT Planning Pipeline
  ├── OAR Agent: TotalSegmentator for all OARs
  ├── GTV Agent: Interactive SAM3 with physician input
  ├── Margin Agent: Auto-expand GTV → CTV (5mm) → PTV (3mm)
  ├── Constraint Agent: Apply QUANTEC guidelines
  └── Export Agent: Generate TG-263 compliant RTSTRUCT
```

**Human-in-the-Loop:**
- **CRITICAL:** Physician reviews all target volumes
- Margin expansions require approval
- Dose constraints are suggestions only

---

#### Opportunity 12: Oncology Treatment Response Agent (Oncology Suite)

**Use Case:** Automated RECIST measurement and response assessment

**Multi-Agent System:**
- **Lesion Detection Agent** - Identify all lesions
- **Target Lesion Selection Agent** - Choose up to 5 target lesions
- **Measurement Agent** - Measure longest diameter per RECIST 1.1
- **Response Classification Agent** - CR, PR, SD, PD determination

**Workflow:**
```
Follow-up Study → RECIST Pipeline
  ├── Compare to baseline and prior
  ├── Detect all lesions (new and existing)
  ├── Select target lesions (per RECIST rules)
  ├── Measure each lesion
  ├── Calculate sum of diameters
  ├── Classify response (CR/PR/SD/PD)
  └── Generate response table
```

**Safety:** Measurements require oncologist validation

---

#### Opportunity 13: Cardiac Function Analysis Agent (Cardiology Suite)

**Use Case:** Automated cardiac chamber quantification and EF calculation

**Workflow:**
```
Cardiac MR Loaded → Cardiac Agent
  ├── Segment LV endocardium/epicardium
  ├── Track across cardiac phases
  ├── Compute end-diastolic volume (EDV)
  ├── Compute end-systolic volume (ESV)
  ├── Calculate ejection fraction: (EDV-ESV)/EDV
  └── Generate bull's-eye plot
```

**Safety:** EF values flagged if <40% or >80% (abnormal); cardiologist reviews all

---

#### Opportunity 14: Neurology Lesion Tracking Agent (Neurology Suite)

**Use Case:** Automated MS lesion detection and burden quantification

**Multi-Agent System:**
- **Lesion Detection Agent** - Detect T2/FLAIR hyperintensities
- **Classification Agent** - New vs enhancing vs chronic
- **Burden Quantification Agent** - Total lesion volume, count
- **Progression Detection Agent** - Compare to baseline

**Workflow:**
```
Brain MR → MS Lesion Pipeline
  ├── Segment white matter lesions
  ├── Classify by age (T1 enhancement)
  ├── Count new lesions vs prior
  ├── Calculate total lesion burden
  └── Detect progression (McDonald criteria)
```

**Safety:** Lesion classifications reviewed by neurologist

---

#### Opportunity 15: Surgical Planning Optimization Agent (Surgical Suite)

**Use Case:** Pre-operative planning with 3D visualization and measurements

**Multi-Agent System:**
- **Anatomy Segmentation Agent** - Segment relevant structures
- **3D Reconstruction Agent** - Generate high-quality meshes
- **Measurement Agent** - Distances, angles, volumes
- **Risk Assessment Agent** - Identify nearby critical structures

**Workflow:**
```
Pre-op CT → Surgical Planning
  ├── Segment tumor and surrounding anatomy
  ├── Generate 3D surface models
  ├── Measure tumor-vessel distances
  ├── Identify critical structures at risk
  └── Export STL for 3D printing or AR navigation
```

**Safety:** Planning data reviewed in MDT; surgical decisions require surgeon input

---

## 5. Implementation Considerations

### 5.1 Medical Safety Requirements

#### Mandatory Human-in-the-Loop Gates

| Agent Type | Gate Requirement | Approval Level |
|------------|------------------|----------------|
| Report Generation | ALWAYS - before finalization | Radiologist |
| Treatment Planning (RT) | ALWAYS - target volumes | Radiation Oncologist |
| RECIST Measurements | ALWAYS - before oncology decisions | Oncologist |
| Cardiac Function | ALWAYS - before clinical use | Cardiologist |
| Surgical Planning | ALWAYS - before OR | Surgeon |
| Study Triage | High-priority classifications | Radiologist |
| QA Validation | Error-level issues | User |

#### Confidence Thresholds

| Agent Output | Minimum Confidence | Action if Below |
|--------------|-------------------|-----------------|
| STAT triage classification | 0.85 | Route to radiologist review |
| Segmentation QA pass | 0.90 | Flag for manual check |
| Model selection | 0.80 | Present alternatives |
| Report findings | 0.75 | Highlight with caveat |

#### Audit Logging Requirements

All agents must log:
- All agent inputs and outputs
- User approvals and overrides
- Timestamps and session IDs
- Data access patterns
- Model versions and parameters
- Confidence scores
- Human review decisions

### 5.2 HIPAA Compliance

#### Data Handling Principles

- **Minimum necessary:** Agents access only required DICOM tags and images
- **De-identification:** PHI stripped before external LLM calls (if cloud-based)
- **Encryption:** At rest and in transit
- **Access controls:** Role-based access to agent outputs
- **Retention policies:** Agent logs retained per institutional policy

#### LLM Integration Options

| Approach | Privacy | Performance | Cost |
|----------|---------|-------------|------|
| **Local (Ollama/vLLM)** | Full control | Medium | Hardware |
| **Azure OpenAI HIPAA BAA** | Compliant | High | API fees |
| **AWS HealthLake + Bedrock** | Compliant | High | API fees |
| **On-premise medical LLM** | Full control | High | GPU infra |

**Recommendation:** Start with local medical LLMs (BioGPT, Clinical BERT) for privacy; upgrade to cloud with BAA for production.

### 5.3 Integration with Existing MONAI Label Infrastructure

#### Reusable Endpoints

| Component | Current Path | Agent Integration |
|-----------|--------------|-------------------|
| Inference Endpoint | `/infer/{model}` | Tool for segmentation agents |
| Session Management | `/session/` | Cache for iterative agents |
| Info Endpoint | `/info/` | Model capability discovery |
| Batch Inference | `/batch_infer/` | Batch orchestrator backend |
| Volumetrics | `/analytics/volumetrics` | QA and reporting agents |
| Radiomics | `/analytics/radiomics` | Feature interpretation agent |

#### New Endpoints Required

```python
# Agent orchestration endpoints
POST /agent/triage          # Study prioritization
POST /agent/report          # Report generation
POST /agent/qa              # QA validation
POST /agent/longitudinal    # Prior comparison
POST /agent/model-select    # Model recommendation
GET  /agent/status/{id}     # Agent execution status
```

### 5.4 Recommended Technology Stack

#### Agent Framework

```
Orchestration:     LangGraph (state machines + human gates)
LLM Framework:     LangChain
Observability:     LangSmith
```

#### LLM Stack

```
Reasoning:         GPT-4 (Azure HIPAA BAA) or local Mistral-7B-Medical
Embeddings:        Clinical BERT (local) or PubMedBERT
Medical NER:       ScispaCy (local)
```

#### Knowledge Base

```
Vector Store:      ChromaDB (local)
Ontologies:        RadLex, SNOMED CT
Guidelines:        ACR Appropriateness Criteria
Literature:        PubMed API integration
```

### 5.5 Frontend Integration

#### New UI Components Required

```typescript
// Agent control panel
AgentControlPanel: {
  agentType: 'triage' | 'report' | 'qa' | 'longitudinal'
  status: 'idle' | 'running' | 'awaiting_review' | 'completed'
  onApprove, onReject handlers
}

// Human-in-the-loop review interface
ReviewGatePanel: {
  agentRecommendation: string
  confidenceScore: number
  supportingEvidence: Evidence[]
  alternativeOptions: string[]
  onUserDecision: (decision) => void
}

// Agent result viewer
AgentResultViewer: {
  output: AgentOutput
  reasoning: string[]
  requiresReview: boolean
}
```

#### State Management Extensions

```typescript
// Extend Zustand store for agents
interface AgentState {
  activeAgents: Map<string, AgentExecution>
  pendingReviews: ReviewTask[]
  agentHistory: AgentLog[]

  // Actions
  startAgent: (type, params) => Promise<void>
  approveAgentOutput: (agentId) => void
  rejectAgentOutput: (agentId, reason) => void
}
```

---

## 6. Prioritized Recommendations

### Tier 1: Highest Impact, Lowest Risk (Start Here)

| Rank | Agent | Impact | Feasibility | Risk | Effort |
|------|-------|--------|-------------|------|--------|
| 1st | **Interactive QA Agent** | High | High | Low | Medium |
| 2nd | **Adaptive Model Selection** | High | High | Low | Low |
| 3rd | **Study Triage Agent** | High | Medium | Medium | Medium |

**Why Start Here:**
- **QA Agent:** Immediate value, no clinical risk (prevents errors before they happen)
- **Model Selection:** Improves existing workflows without new dependencies
- **Triage:** High ROI, well-scoped problem with clear metrics

### Tier 2: High Value, Moderate Complexity

| Rank | Agent | Impact | Feasibility | Risk | Effort |
|------|-------|--------|-------------|------|--------|
| 4th | **Report Generation Assistant** | Very High | Medium | Medium | High |
| 5th | **Longitudinal Comparison** | High | Medium | Medium | High |
| 6th | **Batch Processing Orchestrator** | Medium | High | Low | Medium |

**Implementation Order:**
1. Report Generation (6-8 weeks) - Most requested feature
2. Longitudinal (4-6 weeks) - Oncology workflow critical path
3. Batch Processing (3-4 weeks) - Operational efficiency

### Tier 3: Suite-Specific (Based on Adoption)

| Agent | Target Suite | Implement When |
|-------|-------------|----------------|
| **RT Planning Assistant** | Radiation Therapy | RT Suite gains traction |
| **RECIST Treatment Response** | Oncology | Oncology primary use case |
| **Cardiac Function Analysis** | Cardiology | Cardiac MR workflows needed |
| **MS Lesion Tracking** | Neurology | Neuro workflows requested |
| **Surgical Planning** | Surgical | Pre-op planning use cases |

### Tier 4: Future Enhancements

| Agent | Rationale for Deferral |
|-------|------------------------|
| Protocol Recommendation | Requires extensive guideline integration |
| Radiomics Interpretation | Needs validation studies first |
| DICOM Metadata Enrichment | Lower clinical impact |
| Smart Annotation Propagation | Nice-to-have vs essential |

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Months 1-2)

**Infrastructure:**
- [ ] LangGraph + LangSmith setup
- [ ] Local LLM deployment (Ollama + Mistral-7B-Medical)
- [ ] Vector database (ChromaDB) with medical embeddings
- [ ] Agent state management extension to existing session system
- [ ] Frontend agent UI components (control panel, review gate)

**Proof of Concept:**
- [ ] Implement Interactive QA Agent (2 weeks)
- [ ] Implement Adaptive Model Selection Agent (2 weeks)
- [ ] Deploy to staging environment
- [ ] Gather user feedback

### Phase 2: Core Agents (Months 3-5)

**Agent Development:**
- [ ] Study Triage Agent (3 weeks)
  - DICOM metadata parsing
  - Preliminary segmentation integration
  - Urgency classification with confidence scores
- [ ] Report Generation Assistant (8 weeks)
  - Finding extraction agent
  - RAG system for guidelines (RadLex, ACR)
  - Report drafting with templates
  - QA validation
  - Human review interface

**Testing:**
- [ ] Retrospective validation on 100 studies per agent
- [ ] Radiologist user acceptance testing
- [ ] Safety review with clinical team

### Phase 3: Advanced Workflows (Months 6-8)

**Multi-Agent Systems:**
- [ ] Longitudinal Comparison Pipeline (6 weeks)
  - PACS integration for prior retrieval
  - Registration pipeline (ITK/ANTs)
  - Change detection algorithms
  - RECIST measurement automation
- [ ] RT Planning Assistant (6 weeks)
  - OAR segmentation orchestration
  - Margin expansion automation
  - TG-263 compliance validation
  - RTSTRUCT export integration

**Monitoring:**
- [ ] LangSmith observability dashboard
- [ ] Agent performance metrics collection
- [ ] Clinical outcome tracking system

### Phase 4: Specialization (Months 9-12)

**Suite-Specific Agents:**
- [ ] Deploy agents based on suite adoption metrics
- [ ] Oncology: RECIST agent if oncology suite primary
- [ ] Neurology: Lesion tracking if neuro workflows needed
- [ ] Cardiology: Cardiac function if cardiac MR requested
- [ ] Surgical: Planning optimization if pre-op use cases

**Production Hardening:**
- [ ] Comprehensive audit logging system
- [ ] HIPAA compliance certification
- [ ] Clinical validation studies
- [ ] Regulatory documentation (if pursuing FDA pathway)

---

## 8. Success Metrics

### Technical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Agent Uptime | >99% | Monitoring dashboard |
| Inference Latency | <30s per agent | LangSmith traces |
| Human Review Rate | <20% for high-confidence | Review queue analytics |
| Error Rate | <1% critical errors | Error logs |

### Clinical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Triage Accuracy | >90% STAT classification | Radiologist validation |
| Report Draft Quality | >80% accepted with minor edits | User feedback |
| QA Detection Rate | >95% of anomalies flagged | Retrospective analysis |
| Time Savings | 40% reduction in report drafting | Time-motion studies |

### User Adoption Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Agent Utilization | >60% of studies | Usage analytics |
| User Satisfaction | >4.0/5.0 | Quarterly survey |
| Override Rate | <10% | Agent decision logs |
| Training Completion | 100% of users | Training records |

### Safety Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| False Negative Rate (Triage) | <1% | Outcome review |
| Report Accuracy | >98% after review | QA audits |
| Adverse Events | 0 attributable to agent | Incident reporting |
| Compliance Audit | 100% pass | Annual audit |

---

## 9. Risk Mitigation

### Clinical Risks

| Risk | Mitigation | Responsibility |
|------|------------|----------------|
| **Missed urgent finding** | Mandatory radiologist review of STAT classifications | Clinical lead |
| **Incorrect segmentation** | QA agent validation before export | QA agent + user |
| **Report inaccuracies** | Watermarking, mandatory review, edit logging | Radiologist |
| **Over-reliance on AI** | Training emphasizing AI as assistant, not replacement | Medical director |

### Technical Risks

| Risk | Mitigation | Owner |
|------|------------|-------|
| **Agent failures** | Graceful degradation, user notifications, manual fallback | DevOps |
| **LLM hallucinations** | Confidence thresholds, citation requirements, validation | AI team |
| **Integration bugs** | Comprehensive testing, staged rollout | Engineering |
| **Performance issues** | Load testing, GPU scaling, caching | Infrastructure |

### Regulatory Risks

| Risk | Mitigation | Owner |
|------|------------|-------|
| **HIPAA violations** | BAA with cloud providers, de-identification, audit logs | Compliance |
| **Liability concerns** | Clear disclaimers, physician responsibility documentation | Legal |
| **State medical board issues** | Engagement with regulatory bodies early | Executive |

---

## 10. Conclusion

### Key Takeaways

1. **Solid Foundation:** MedAI's existing MONAI Label integration, suite architecture, and analytics capabilities provide excellent infrastructure for agentic workflows.

2. **Highest-Value Opportunities:**
   - Interactive QA Agent (immediate safety/quality improvement)
   - Report Generation Assistant (massive time savings)
   - Study Triage Agent (workflow optimization)

3. **Safety-First Approach:** All agents designed as **clinical decision support**, not autonomous actors. Mandatory human-in-the-loop gates for all critical workflows.

4. **Technical Feasibility:** LangGraph/LangChain ideal for medical workflows (state management, human gates). Existing MONAI Label endpoints reusable as agent tools.

5. **Phased Implementation:** Start with low-risk, high-value agents (QA, model selection). Build multi-agent systems incrementally.

### Recommended Next Steps

1. **Stakeholder Review:** Present findings to clinical team, get prioritization input
2. **Technical Spike:** 2-week proof-of-concept with QA Agent
3. **Architecture Design:** Detailed design doc for Tier 1 agents
4. **Pilot Program:** Deploy to 2-3 radiologists for beta testing
5. **Iterative Rollout:** Expand based on metrics and feedback

---

## Appendix A: Code Examples

### A.1 LangGraph Workflow Pattern

```python
from langgraph.graph import StateGraph, END

def create_report_graph():
    workflow = StateGraph()

    # Add nodes
    workflow.add_node("extract_findings", extract_findings_agent)
    workflow.add_node("retrieve_literature", rag_retrieval)
    workflow.add_node("draft_report", report_drafting_llm)
    workflow.add_node("qa_check", qa_validation)
    workflow.add_node("human_review", human_review_gate)  # MANDATORY

    # Define edges
    workflow.add_edge("extract_findings", "retrieve_literature")
    workflow.add_edge("retrieve_literature", "draft_report")
    workflow.add_edge("draft_report", "qa_check")
    workflow.add_conditional_edges(
        "qa_check",
        route_qa_result,
        {
            "pass": "human_review",
            "fail": "draft_report"  # Retry with feedback
        }
    )
    workflow.add_edge("human_review", END)

    return workflow.compile()
```

### A.2 QA Agent Implementation Pattern

```python
class QAAgent:
    def __init__(self):
        self.anatomical_ranges = load_anatomical_ranges()
        self.llm = ChatOpenAI(model="gpt-4-vision")

    def validate_segmentation(self, mask, label, image):
        issues = []

        # Volume check
        volume = compute_volume(mask)
        expected = self.anatomical_ranges[label]
        if not (expected["min"] <= volume <= expected["max"]):
            issues.append({
                "type": "volume_outlier",
                "severity": "warning",
                "message": f"{label} volume {volume:.1f} mL outside expected range"
            })

        # Connectivity check
        num_components = count_connected_components(mask)
        if num_components > 1 and label not in ["kidneys", "lungs"]:
            issues.append({
                "type": "fragmentation",
                "severity": "error",
                "message": f"{label} has {num_components} disconnected components"
            })

        return {
            "passed": len([i for i in issues if i["severity"] == "error"]) == 0,
            "issues": issues
        }
```

### A.3 Medical RAG System Pattern

```python
from langchain.vectorstores import ChromaDB
from langchain.embeddings import HuggingFaceEmbeddings

class MedicalRAG:
    def __init__(self):
        self.embeddings = HuggingFaceEmbeddings(
            model_name="microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract"
        )
        self.vector_store = ChromaDB(
            embedding_function=self.embeddings,
            collection_name="radiology_guidelines"
        )

    def retrieve_relevant(self, query, k=5):
        results = self.vector_store.similarity_search_with_score(query, k=k)
        return [
            {
                "text": doc.page_content,
                "source": doc.metadata["source"],
                "score": score
            }
            for doc, score in results if score > 0.7
        ]
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Agent** | Autonomous software component that can perceive, reason, and act |
| **Human-in-the-Loop (HITL)** | Design pattern requiring human approval for critical decisions |
| **LangGraph** | Framework for building stateful, multi-agent applications |
| **RAG** | Retrieval-Augmented Generation - combining LLMs with knowledge retrieval |
| **RECIST** | Response Evaluation Criteria in Solid Tumors - standard for tumor measurement |
| **Suite** | Domain-specific configuration of MedAI for a clinical specialty |
| **OAR** | Organ at Risk - healthy tissue to protect during radiation therapy |
| **TG-263** | AAPM Task Group 263 - standard nomenclature for RT structures |

---

## Appendix C: References

- MONAI Label Documentation: https://docs.monai.io/projects/label/
- LangGraph Documentation: https://langchain-ai.github.io/langgraph/
- ACR Appropriateness Criteria: https://www.acr.org/Clinical-Resources/ACR-Appropriateness-Criteria
- RadLex Ontology: https://www.rsna.org/practice-tools/data-tools-and-standards/radlex-radiology-lexicon
- RECIST 1.1 Guidelines: https://recist.eortc.org/
- TG-263 Standard: https://www.aapm.org/pubs/reports/RPT_263.pdf

---

*Document prepared as research analysis for MedAI agentic workflow implementation planning.*
