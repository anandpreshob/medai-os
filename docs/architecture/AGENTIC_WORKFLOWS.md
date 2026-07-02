# Agentic Workflows Architecture

## Overview

MedAI uses LangChain-based agents for two key workflows: radiology report generation and worklist triaging. These agents combine rule-based logic with LLM reasoning for reliable, explainable outputs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agentic Workflows                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │      Report Generation          │  │      Worklist Triaging          │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │                                 │  │                                 │  │
│  │  ┌───────────────────────────┐  │  │  ┌───────────────────────────┐  │  │
│  │  │ Breast Analysis Agent     │  │  │  │ Rules Engine              │  │  │
│  │  │ - BI-RADS formatting      │  │  │  │ - Keyword matching        │  │  │
│  │  │ - Volumetrics integration │  │  │  │ - Location priority       │  │  │
│  │  └───────────────────────────┘  │  │  │ - Modality scoring        │  │  │
│  │                                 │  │  └───────────────────────────┘  │  │
│  │  ┌───────────────────────────┐  │  │              │                  │  │
│  │  │ Chest X-ray Agent         │  │  │              ▼                  │  │
│  │  │ - CheXagent integration   │  │  │  ┌───────────────────────────┐  │  │
│  │  │ - Detection bounding boxes│  │  │  │ LLM Refinement            │  │  │
│  │  └───────────────────────────┘  │  │  │ - Priority ordering       │  │  │
│  │                                 │  │  │ - Rationale generation    │  │  │
│  │              │                  │  │  └───────────────────────────┘  │  │
│  │              ▼                  │  │                                 │  │
│  │  ┌───────────────────────────┐  │  └─────────────────────────────────┘  │
│  │  │ LLM Client (Gemini/OpenAI)│  │                                       │
│  │  │ - Vision capabilities     │  │                                       │
│  │  │ - Structured output       │  │                                       │
│  │  └───────────────────────────┘  │                                       │
│  │                                 │                                       │
│  └─────────────────────────────────┘                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Report Generation

### Agent Hierarchy

```
BaseReportAgent (abstract)
├── BreastAnalysisAgent
│   └── BI-RADS formatting, volumetrics, radiomics
├── ChestXrayAnalysisAgent
│   └── CheXagent detection integration
└── GeneralRadiologyAgent (planned)
    └── Generic report structure
```

### BaseReportAgent Interface

```python
class BaseReportAgent(ABC):
    """Abstract base class for report generation agents."""

    AGENT_TYPE: str = "base"
    AGENT_NAME: str = "Base Report Agent"
    SUPPORTED_MODALITIES: list = []

    @abstractmethod
    def get_system_prompt(self) -> str:
        """System prompt with formatting instructions."""
        pass

    def format_volumetrics(self, volumetrics: Dict) -> str:
        """Format volumetric measurements."""
        pass

    def format_radiomics(self, radiomics: Dict) -> str:
        """Format radiomics features."""
        pass

    def build_user_prompt(
        self,
        findings: str,
        volumetrics: Optional[Dict] = None,
        radiomics: Optional[Dict] = None,
        patient_info: Optional[Dict] = None,
        modality: str = "Unknown",
    ) -> str:
        """Build complete user prompt with all data."""
        pass
```

### Breast Analysis Agent

**Purpose**: Generate BI-RADS compliant breast imaging reports

**System Prompt Features**:
- BI-RADS category guidelines (0-6)
- Clock-face positioning notation
- Breast density classification (A-D)
- DCE-MRI kinetic curve interpretation
- Radiomics feature interpretation

**Input Data**:
```python
{
    "mosaic_image": "<base64 PNG>",  # 3-view mosaic
    "findings": "Suspicious enhancing mass at 2 o'clock...",
    "volumetrics": {
        "segments": [
            {"label": "lesion", "total_volume_cm3": 2.5}
        ]
    },
    "radiomics": {
        "segments": [
            {"label": "lesion", "features": {"sphericity": 0.72}}
        ]
    },
    "patient_info": {
        "patientId": "MRN123",
        "studyDate": "20260120"
    },
    "modality": "MR"
}
```

**Output Structure**:
```json
{
    "sections": {
        "clinicalHistory": "52-year-old female with...",
        "technique": "Bilateral breast MRI with contrast...",
        "comparison": "Prior mammogram from 2025-06-15",
        "findings": "In the right breast at 2 o'clock position...",
        "impression": "BI-RADS 4B. Suspicious mass...",
        "recommendations": "Ultrasound-guided biopsy recommended..."
    },
    "rawResponse": "<full LLM response>"
}
```

### Chest X-ray Agent

**Purpose**: Generate chest X-ray reports with AI detection integration

**Key Features**:
- Integrates CheXagent bounding box detections
- Structured findings from AI observations
- Clinical context incorporation

**Input Data** (extended):
```python
{
    "mosaic_image": "<base64 PNG>",
    "clinical_context": "50yo male, smoker, persistent cough",
    "detections": [
        {
            "label": "pneumothorax",
            "confidence": 0.92,
            "x_min": 120, "y_min": 80,
            "x_max": 280, "y_max": 220
        }
    ],
    "findings": "AI detected possible pneumothorax..."
}
```

### LLM Client

**Supported Providers**:
- Google Gemini (recommended - free tier available)
- OpenAI GPT-4 Vision

**Configuration**:
```python
@dataclass
class LLMConfig:
    provider: str = "gemini"           # or "openai"
    model: str = "models/gemini-2.5-flash"
    api_key: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.3           # Low for medical accuracy

    @classmethod
    def from_env(cls) -> "LLMConfig":
        # Auto-detect from environment variables
        # GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY
```

**Vision Input**:
```python
# Gemini
content_parts = [image, text_prompt]
response = model.generate_content(content_parts)

# OpenAI
messages = [{
    "role": "user",
    "content": [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}}
    ]
}]
```

### Report Parsing

LLM responses are parsed into structured sections:

```python
def _parse_report_response(self, response_text: str) -> Dict:
    """Parse LLM response into sections."""
    header_map = {
        "CLINICAL HISTORY": "clinicalHistory",
        "TECHNIQUE": "technique",
        "COMPARISON": "comparison",
        "FINDINGS": "findings",
        "IMPRESSION": "impression",
        "RECOMMENDATIONS": "recommendations",
    }

    # Parse headers and content
    sections = {}
    for line in response_text.split("\n"):
        # Match headers like "## FINDINGS" or "**FINDINGS:**"
        # Extract content under each header
    return {"sections": sections, "rawResponse": response_text}
```

## Worklist Triaging

### Hybrid Architecture

The triaging system uses a hybrid approach:

1. **Rules Engine** (deterministic): Catches STAT/URGENT cases reliably
2. **LLM Refinement** (optional): Fine-tunes ordering within priority tiers

```
Study Input
     │
     ▼
┌─────────────────────────────────┐
│        Rules Engine             │
│  - Keyword matching (STAT/URGENT)│
│  - Location priority (ICU > ER) │
│  - Modality scoring (CT > MR)   │
│  - Study age consideration      │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│     Classification Result       │
│  STAT  │ URGENT │ SEMI │ ROUTINE│
└─────────────────────────────────┘
     │
     ▼ (if LLM enabled)
┌─────────────────────────────────┐
│       LLM Refinement            │
│  - Order within tier            │
│  - Generate rationale           │
│  - Consider clinical context    │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│      Prioritized Worklist       │
│  Rank │ Study │ Level │ Score  │
└─────────────────────────────────┘
```

### Triage Levels

| Level | Description | Turnaround | Priority Score |
|-------|-------------|------------|----------------|
| STAT | Immediate attention required | ASAP | 90-100 |
| URGENT | High priority | < 24 hours | 70-89 |
| SEMI_URGENT | Moderate priority | < 48 hours | 50-69 |
| ROUTINE | Standard workflow | Standard | 0-49 |

### Rules Engine

**STAT Keywords** (highest priority):
```python
STAT_KEYWORDS = [
    r"\bstat\b", r"\btrauma\b", r"\bstroke\b",
    r"\bhemorrhage\b", r"\baortic\s*dissection\b",
    r"\bpulmonary\s*embolism\b", r"\btension\s*pneumo",
    r"\bcardiac\s*arrest\b", r"\bcritical\b",
]
```

**URGENT Keywords**:
```python
URGENT_KEYWORDS = [
    r"\burgent\b", r"\bacute\b", r"\bappendicitis\b",
    r"\bobstruction\b", r"\bchest\s*pain\b",
    r"\brespiratory\s*distress\b", r"\bsepsis\b",
]
```

**Location Priority**:
```python
LOCATION_PRIORITY = {
    "icu": 1, "trauma": 1, "or": 1,    # Critical
    "er": 2, "ed": 2, "pacu": 2,       # Urgent
    "inpatient": 3, "floor": 3,         # Semi-urgent
    "outpatient": 5, "clinic": 5,       # Routine
}
```

**Modality Priority**:
```python
MODALITY_PRIORITY = {
    "CT": 1,   # Often emergent
    "CR": 2,   # X-ray often stat
    "US": 3,   # Ultrasound
    "MR": 4,   # Less acute
}
```

### TriagingAgent

```python
class TriagingAgent:
    def __init__(self, use_llm: bool = True):
        self.rules_engine = TriageRulesEngine()
        self.use_llm = use_llm

    def triage_studies(
        self,
        studies: List[Dict],
        use_mock_data: bool = False
    ) -> Dict:
        # 1. Apply rules to all studies
        for study in studies:
            level, score, rules = self.rules_engine.apply_rules(study)

        # 2. Optionally refine with LLM
        if self.use_llm:
            self._llm_refine_ordering(triaged_studies)

        # 3. Sort and assign final ranks
        return self.rules_engine.sort_by_priority(triaged_studies)
```

### LLM Refinement

Only applied to SEMI_URGENT and ROUTINE tiers (where rules are less definitive):

```python
TRIAGE_SYSTEM_PROMPT = """
You are an expert radiology triaging assistant.

Priority Factors (Highest to Lowest):
1. Clinical Acuity: Acute symptoms, life-threatening conditions
2. Study Context: Reason for exam, referring specialty
3. Patient Factors: ICU/hospitalized > floor > outpatient
4. Symptoms Severity: Active symptoms vs screening
5. Study Age: Older pending studies need attention
6. Modality Context: CT/X-ray for acute > MRI

For each study, provide:
- Refined priority score (0-100)
- Brief rationale
- Key factors
"""
```

**LangChain Integration**:
```python
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import PydanticOutputParser

class TriagedStudy(BaseModel):
    studyUID: str
    priorityScore: float
    rationale: str
    keyFactors: List[str]

llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")
parser = PydanticOutputParser(pydantic_object=TriageRefinementOutput)
```

### API Endpoint

```python
POST /monai/triage/prioritize
{
    "studies": [
        {
            "studyUID": "1.2.3.4.5",
            "patientName": "John Doe",
            "modality": "CT",
            "studyDescription": "CT CHEST WITH CONTRAST",
            "reasonForVisit": "Chest pain, rule out PE",
            "patientLocation": "ED",
            "urgencyFlag": null
        }
    ],
    "useMockData": false,
    "useLLM": true
}
```

**Response**:
```json
{
    "success": true,
    "triagedStudies": [
        {
            "studyUID": "1.2.3.4.5",
            "priorityRank": 1,
            "triageLevel": "URGENT",
            "priorityScore": 82.5,
            "rationale": "ED patient with chest pain and PE concern",
            "keyFactors": ["Chest pain", "Rule out PE", "ED location"],
            "rulesApplied": ["URGENT_KEYWORD:chest\\s*pain", "URGENT_LOCATION:ED"]
        }
    ],
    "statCount": 0,
    "urgentCount": 1,
    "semiUrgentCount": 0,
    "routineCount": 0,
    "totalProcessed": 1
}
```

## Safety Considerations

### Human-in-the-Loop

All agentic outputs are **decision support**, not decisions:

1. **Reports**: Marked as AI-generated drafts requiring radiologist review
2. **Triage**: Priorities are suggestions; final order determined by radiologist
3. **Detections**: Bounding boxes highlight areas of interest, not diagnoses

### Audit Trail

- All agent invocations logged with input/output
- Rules applied recorded in `rulesApplied` field
- LLM responses preserved in `rawResponse`

### Fallback Behavior

```python
# LLM graceful degradation
try:
    self._llm = ChatGoogleGenerativeAI(...)
except Exception:
    self.use_llm = False
    logger.warning("LLM unavailable, using rules only")

# Rules always available
# No cloud dependency for core triage functionality
```

## Adding New Agents

### 1. Create Agent Class

```python
# monailabel/agents/my_agent.py
from .base_agent import BaseReportAgent

class MyAnalysisAgent(BaseReportAgent):
    AGENT_TYPE = "my_domain"
    AGENT_NAME = "My Domain Analysis Agent"
    SUPPORTED_MODALITIES = ["CT", "MR"]

    def get_system_prompt(self) -> str:
        return """
        You are an expert in [domain] imaging.
        ...
        """

    def build_user_prompt(self, findings, **kwargs) -> str:
        # Custom prompt building
        return super().build_user_prompt(findings, **kwargs)
```

### 2. Register Agent

```python
# monailabel/agents/breast_agent.py (get_agent function)
def get_agent(agent_type: str) -> BaseReportAgent:
    agents = {
        "breast": BreastAnalysisAgent,
        "chestxray": ChestXrayAnalysisAgent,
        "my_domain": MyAnalysisAgent,  # Add here
    }
    return agents.get(agent_type, BreastAnalysisAgent)()
```

### 3. Update Agent List

```python
# monailabel/endpoints/report.py
@router.get("/agents")
async def list_agents():
    return {
        "agents": [
            # ... existing agents
            {
                "type": "my_domain",
                "name": "My Domain Agent",
                "description": "Specialized for [domain] imaging",
                "supported_modalities": ["CT", "MR"],
            },
        ]
    }
```

---

## Agentic Conversational Annotation

### Overview

The conversational annotation workflow allows users to control annotation operations through natural language chat commands. This extends the LangGraph orchestrator with annotation-specific intents and MCP tools.

### Architecture

```
User Message: "Segment the liver using biomedparse and save as NIfTI"
                    │
                    v
         ┌─────────────────────┐
         │  Intent Classifier  │  -> "segmentation_request"
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Model Extraction   │  -> model: "biomedparse"
         │  extract_model_from_prompt()
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  run_segmentation   │  -> Execute BiomedParse
         │  MCP Tool           │     Return preview
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Preview Storage    │  -> Store mask with TTL
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Confirmation UI    │  -> Show thumbnail, buttons:
         │                     │     [Accept] [Edit] [Cancel]
         └──────────┬──────────┘
                    v
         User clicks [Accept]
                    │
                    v
         ┌─────────────────────┐
         │  save_annotation    │  -> Export to NIfTI + PACS
         │  MCP Tool           │
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Success Response   │  -> "Saved: liver.nii.gz"
         └─────────────────────┘
```

### Annotation Intents

The orchestrator classifies user messages into these annotation intents:

| Intent | Example Messages | Handler |
|--------|------------------|---------|
| `segmentation_request` | "Segment the liver", "Find all organs" | run_segmentation tool |
| `save_request` | "Save as NIfTI", "Export to PACS" | save_annotation tool |
| `batch_request` | "Process all studies", "Segment liver in all CTs" | batch_process tool |
| `session_load` | "Load yesterday's session", "Continue where I left off" | load_session tool |
| `edit_request` | "Make it bigger", "Smooth the edges" | edit_annotation tool |
| `confirm_action` | "Yes", "Accept", "Looks good" | Confirm pending action |
| `reject_action` | "No", "Cancel", "Try again" | Reject pending action |

### Model Selection

Users can specify which model to use in natural language:

```python
# Examples:
"Segment the liver using biomedparse"  -> model: "biomedparse"
"Use medsam for this image"            -> model: "medsam"
"Run totalsegmentator on all organs"   -> model: "totalsegmentator"

# Model aliases supported:
model_aliases = {
    "biomedparse": "biomedparse",
    "biomed parse": "biomedparse",
    "medsam": "medsam",
    "med-sam": "medsam",
    "sam": "medsam",
    "totalsegmentator": "totalsegmentator",
    "total segmentator": "totalsegmentator",
    "ts": "totalsegmentator",
    "sam2": "sam2",
}
```

### MCP Tools

Five MCP tools enable annotation operations:

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `run_segmentation` | Execute AI inference | session_id, model, text_prompt, point_prompts | preview_id, labels, thumbnail |
| `save_annotation` | Save to format/PACS | preview_id, format, destination | saved_files, pacs_uid |
| `load_session` | Recover previous session | query (natural language) | session, segmentations |
| `batch_process` | Run batch segmentation | scope, model, prompt | job_id, progress |
| `edit_annotation` | Morphological edits | segmentation_id, operation, params | updated_labels |

### Preview Storage

Segmentation previews are stored temporarily before user confirmation:

```python
class PreviewStorage:
    """TTL-based preview cache for human-in-the-loop confirmation."""

    async def store_preview(
        self,
        session_id: str,
        segmentation_data: np.ndarray,
        model_used: str,
        labels: List[Dict],
        prompt_used: str,
        ttl_seconds: int = 3600,  # 1 hour default
    ) -> PreviewMetadata:
        """Store preview and return metadata."""

    async def confirm_preview(
        self,
        preview_id: str,
    ) -> Tuple[PreviewMetadata, np.ndarray]:
        """Confirm and retrieve preview for saving."""

    async def reject_preview(
        self,
        preview_id: str,
    ) -> bool:
        """Reject and delete preview."""
```

### PACS Integration

Segmentations can be saved directly to PACS as DICOM-SEG:

```python
# save_annotation.py
if input_data.destination in ("pacs", "both"):
    # Convert to DICOM-SEG format
    dicom_seg = await export_service.export_dicom_seg(
        segmentation_data=data,
        labels=metadata.labels,
        source_dicom=source_series,
    )

    # Upload to PACS
    pacs_result = await pacs_client.store(dicom_seg)

    # Returns SOP Instance UID for reference
    pacs_uid = pacs_result["sop_instance_uid"]
```

### Confirmation UI Components

Two React components render annotation actions in chat:

**AnnotationActionCard**: Shows segmentation preview with accept/edit/cancel buttons
```tsx
<AnnotationActionCard
  previewId="prev_123"
  labels={[{name: "liver", voxelCount: 45000, volumeMl: 1523}]}
  thumbnailUrl="/api/preview/prev_123/thumbnail"
  modelUsed="biomedparse"
  onAccept={() => confirmSegmentation(previewId)}
  onEdit={() => openEditMode(previewId)}
  onCancel={() => rejectSegmentation(previewId)}
/>
```

**BatchProgressCard**: Shows batch job progress in chat
```tsx
<BatchProgressCard
  jobId="batch_abc"
  status="running"
  progressPercent={45}
  processedCount={9}
  totalCount={20}
  onCancel={() => cancelBatchJob(jobId)}
/>
```

---

**Related Documents**:
- [AI Services Architecture](./AI_SERVICES.md)
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- [Medical Image Annotation Suite PRD](../suites/MEDICAL_IMAGE_ANNOTATION_SUITE_PRD.md)
