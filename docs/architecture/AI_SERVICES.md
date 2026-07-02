# AI Services Architecture

## Overview

MedAI integrates multiple AI models for medical image analysis, organized into three categories: auto-segmentation, interactive segmentation, and vision-language models.

## Model Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI Services                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐   │
│  │ Auto-Segmentation   │ │ Interactive         │ │ Vision-Language     │   │
│  ├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤   │
│  │ • BiomedParse       │ │ • SAM2              │ │ • CheXagent         │   │
│  │ • TotalSegmentator  │ │ • SAM3 (MedSAM2)    │ │ • Report Generation │   │
│  │ • nnUNet            │ │ • nnInteractive     │ │ • Triage Agent      │   │
│  │ • Organ Segmentation│ │ • DeepEdit          │ │                     │   │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘   │
│                                                                             │
│  GPU Required: Yes       GPU Required: Yes       GPU: VLM only, LLM=Cloud  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Inference Models

### BiomedParse

**Purpose**: Text-prompted medical image segmentation

**Architecture**: Vision-language model based on CLIP + segmentation decoder

```python
# Usage
POST /monai/infer/biomedparse
{
    "file": <image_data>,
    "params": {
        "prompts": "liver, spleen, kidney"  # Natural language input
    }
}
```

**Key Features**:
- Natural language text prompts
- Multi-label segmentation
- Supports: "liver", "liver, spleen", "liver[SEP]spleen"
- Output: Multi-channel NIfTI mask

**Model Details**:
- Checkpoint: `biomedparse_v2.ckpt` (~4.5GB)
- Source: Microsoft Research
- GPU Memory: ~8GB inference

### TotalSegmentator

**Purpose**: Comprehensive organ/structure segmentation

**Architecture**: nnU-Net trained on 1400+ CT scans

```python
# Usage
POST /monai/infer/totalsegmentator
{
    "file": <image_data>,
    "params": {
        "modality": "ct",           # or "mr"
        "roi_subset": ["liver", "spleen"]  # Optional subset
    }
}
```

**Key Features**:
- 117 CT structures, 56 MR structures
- Automatic modality detection
- ROI subset for faster inference
- Output: Multi-label NIfTI mask

**Model Details**:
- Weights auto-downloaded on first use
- GPU Memory: ~4-8GB depending on volume size

### nnUNet (Breast Tumor)

**Purpose**: Breast tumor segmentation from DCE-MRI

**Architecture**: nnUNetv2 with custom training

```python
# Usage
POST /monai/infer/breast_tumor
{
    "file": <dce_mri_series>
}
```

**Key Features**:
- Trained on DCE-MRI breast sequences
- Outputs tumor segmentation mask
- Integrates with BI-RADS reporting

**Model Details**:
- Checkpoint: `nnunet/full_image_dce_mri_tumor_segmentation/`
- GPU Memory: ~6GB

### SAM2 / SAM3 (MedSAM2)

**Purpose**: Interactive point/box-prompted segmentation

**Architecture**: Segment Anything Model adapted for medical imaging

```python
# Initialize session
POST /monai/infer/segmentation
{
    "file": <image_data>,
    "params": {"nninter": "init"}
}

# Run with prompts
POST /monai/infer/segmentation
{
    "params": {
        "nninter": "sam3",
        "pos_points": [[256, 256, 40]],
        "neg_points": [[100, 100, 40]]
    }
}
```

**Key Features**:
- Point prompts (positive/negative clicks)
- Box prompts
- 3D volumetric support
- Session-based caching for fast refinement

**Model Details**:
- SAM2: `sam2.1_hiera_tiny.pt` (~130MB)
- MedSAM2: `MedSAM2_latest.pt` (~200MB)
- GPU Memory: ~4GB

### nnInteractive

**Purpose**: Neural network interactive segmentation

**Architecture**: nnU-Net with interaction encoding

```python
# Usage
POST /monai/infer/segmentation
{
    "params": {
        "nninter": "nninter",
        "pos_points": [[256, 256, 40]],
        "neg_points": [],
        "scribbles": [],  # Optional
        "lasso": []       # Optional
    }
}
```

**Key Features**:
- Multiple prompt types: points, scribbles, lasso
- Refinement iterations
- Previous mask as input

**Model Details**:
- Checkpoint: `nnInteractive_v1.0/nnInteractive.pt`
- GPU Memory: ~6GB

### CheXagent

**Purpose**: Chest X-ray detection and report generation

**Architecture**: Vision-language transformer (3B parameters)

```python
# Detection
POST /monai/infer?model=chexagent
{
    "file": <chest_xray>,
    "params": {
        "detection_type": "abnormality_detection",
        "disease_name": "pneumothorax"
    }
}

# Report generation
POST /monai/infer?model=chexagent
{
    "file": <chest_xray>,
    "params": {
        "detection_type": "report_generation",
        "clinical_context": "50yo male, cough"
    }
}
```

**Detection Types**:
- `abnormality_detection`: Detect specific pathology
- `phrase_grounding`: Locate text description
- `chest_tube_detection`: Detect chest tubes
- `rib_fracture_detection`: Detect rib fractures
- `foreign_objects_detection`: Detect foreign objects
- `report_generation`: Generate radiology report

**Model Details**:
- HuggingFace: `StanfordAIMI/CheXagent-2-3b`
- GPU Memory: ~8GB
- 2D images only (PNG, JPG, DICOM)

## Inference Pipeline

### Request Flow

```
1. Client Request
        │
        ▼
2. API Gateway (nginx:8002)
        │ Route by model name
        ▼
3. Service Selection
   ├── inference:8001 (MONAI models)
   ├── vlm:8004 (CheXagent)
   └── llm:8003 (Report/Triage)
        │
        ▼
4. InferTask Execution
   ├── pre_transforms()
   ├── model.forward()
   └── post_transforms()
        │
        ▼
5. Response (multipart)
   ├── Part 1: JSON metadata
   └── Part 2: NIfTI mask (binary)
```

### Pre-processing Transforms

Common transforms applied before inference:

```python
pre_transforms = [
    LoadImaged(keys="image"),
    EnsureChannelFirstd(keys="image"),
    Orientationd(keys="image", axcodes="RAS"),
    Spacingd(keys="image", pixdim=(1.0, 1.0, 1.0)),
    ScaleIntensityRanged(keys="image", a_min=-1000, a_max=1000),
    # Model-specific transforms...
]
```

### Post-processing Transforms

Common transforms applied after inference:

```python
post_transforms = [
    Activationsd(keys="pred", sigmoid=True),
    AsDiscreted(keys="pred", threshold=0.5),
    KeepLargestConnectedComponentd(keys="pred"),
    Restored(keys="pred", ref_image="image"),  # Restore original space
]
```

## Session Management

Interactive models use session-based caching:

```
Session Lifecycle:
┌─────────────────────────────────────────────────┐
│                                                 │
│  1. INIT: Load image, extract features         │
│     └── Cache features in memory (~500ms)      │
│                                                 │
│  2. INFER: Apply prompts to cached features    │
│     └── Fast inference (~100ms per iteration)  │
│                                                 │
│  3. RESET: Clear cached features               │
│     └── Free GPU memory                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Session API**:
```python
# Create session
PUT /monai/session
{
    "image": <image_id>,
    "expiry": 3600  # seconds
}

# Get session info
GET /monai/session?image=<image_id>

# Delete session
DELETE /monai/session/<session_id>
```

## GPU Memory Management

### Memory Budget (24GB A10 GPU)

| Model | Loaded | Inference Peak |
|-------|--------|----------------|
| BiomedParse | 4GB | 8GB |
| TotalSegmentator | 2GB | 6GB |
| SAM3 | 2GB | 4GB |
| CheXagent | 6GB | 8GB |
| nnInteractive | 3GB | 6GB |

### Memory Optimization Strategies

1. **Lazy Loading**: Models loaded on first request
2. **Model Unloading**: TODO - LRU cache eviction
3. **Mixed Precision**: FP16 inference where supported
4. **Sliding Window**: Large volumes processed in patches

```python
# Sliding window inference for large volumes
from monai.inferers import SlidingWindowInferer

inferer = SlidingWindowInferer(
    roi_size=(128, 128, 128),
    sw_batch_size=2,
    overlap=0.5,
    mode="gaussian"
)
```

## Adding New Models

### 1. Create Config Class

```python
# apps/radiology/lib/configs/my_model.py
from monailabel.interfaces.config import TaskConfig

class MyModelConfig(TaskConfig):
    def __init__(self):
        super().__init__()
        self.name = "my_model"
        self.type = "segmentation"
        self.dimension = 3
        self.labels = {"lesion": 1, "organ": 2}

    def infer(self) -> InferTask:
        return MyModelInfer(
            path=os.path.join(self.model_dir, "my_model.pt"),
            labels=self.labels,
        )
```

### 2. Create InferTask Class

```python
# apps/radiology/lib/infers/my_model.py
from monailabel.interfaces.tasks.infer_v2 import InferTask

class MyModelInfer(InferTask):
    def __init__(self, path, labels, **kwargs):
        super().__init__(
            type=InferType.SEGMENTATION,
            labels=labels,
            dimension=3,
        )
        self.path = path

    def pre_transforms(self, data=None):
        return [
            LoadImaged(keys="image"),
            # ... your transforms
        ]

    def inferer(self, data=None):
        return SimpleInferer()

    def post_transforms(self, data=None):
        return [
            # ... your transforms
        ]
```

### 3. Register in App

```python
# apps/radiology/lib/configs/__init__.py
from .my_model import MyModelConfig

# apps/radiology/main.py
def init_infers(self):
    infers = {
        # ... existing models
        "my_model": MyModelConfig().infer(),
    }
    return infers
```

### 4. Add to Dockerfile CMD

```dockerfile
CMD ["python", "-m", "monailabel.main", "start_server", \
     "--conf", "models", "biomedparse,totalsegmentator,my_model"]
```

## Model Evaluation Metrics

### Segmentation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Dice Score | Overlap coefficient | > 0.85 |
| Hausdorff Distance | Surface distance (mm) | < 5mm |
| Sensitivity | True positive rate | > 0.90 |
| Specificity | True negative rate | > 0.95 |

### Detection Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| mAP@0.5 | Mean average precision | > 0.70 |
| Recall | Detection rate | > 0.85 |
| Precision | Correct detections | > 0.80 |

## Model Sources

| Model | Source | License |
|-------|--------|---------|
| BiomedParse | Microsoft Research | Apache 2.0 |
| TotalSegmentator | University Hospital Basel | Apache 2.0 |
| SAM2 | Meta AI | Apache 2.0 |
| MedSAM2 | Bowang Lab | Apache 2.0 |
| CheXagent | Stanford AIMI | Apache 2.0 |
| nnInteractive | DKFZ | Apache 2.0 |

---

**Related Documents**:
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- [Agentic Workflows](./AGENTIC_WORKFLOWS.md)
