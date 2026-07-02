# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
MedGemma Vision-Language Service for Chest X-ray Analysis.

This is a thin wrapper around vLLM that provides:
- Detection: Identify abnormalities with bounding boxes
- Description: Generate detailed findings description

The actual model inference is handled by vLLM running as a separate service.
This wrapper provides our custom API endpoints and parsing logic.

Port: 8005 (internal), vLLM runs on 8004
"""

import base64
import io
import logging
import os
import time
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================
# Configuration
# =====================

# vLLM service URL (running in separate container)
VLLM_SERVICE_URL = os.getenv("VLLM_SERVICE_URL", "http://medgemma-vllm:8000")
MODEL_NAME = os.getenv("MODEL_NAME", "medgemma")

# =====================
# Pydantic Models
# =====================

class Detection(BaseModel):
    """Single detection result with bounding box."""
    label: str
    confidence: float = Field(ge=0, le=1)
    x_min: int
    y_min: int
    x_max: int
    y_max: int


class DetectionRequest(BaseModel):
    """Request for chest X-ray detection."""
    image: str  # Base64-encoded image (PNG/JPEG)
    threshold: float = Field(default=0.3, ge=0, le=1, description="Confidence threshold")


class DetectionResponse(BaseModel):
    """Response containing detection results."""
    detections: List[Detection]
    description: str
    processing_time_ms: float


class DescribeRequest(BaseModel):
    """Request for image description."""
    image: str  # Base64-encoded image
    prompt: Optional[str] = None  # Optional custom prompt


class DescribeResponse(BaseModel):
    """Response containing description."""
    description: str
    processing_time_ms: float


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    model_loaded: bool
    gpu_available: bool
    vram_used_gb: Optional[float] = None


class InfoResponse(BaseModel):
    """Service information response."""
    service: str
    model_id: str
    quantization: str
    gpu_device: Optional[str] = None
    endpoints: List[str]


# =====================
# Helper Functions
# =====================

def decode_image_size(image_data: str) -> tuple:
    """Get image dimensions from base64 data."""
    if "," in image_data:
        image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(image_data)
    image = Image.open(io.BytesIO(image_bytes))
    return image.size  # (width, height)


async def call_vllm_chat(image_base64: str, prompt: str) -> str:
    """Call vLLM's OpenAI-compatible chat endpoint with image."""
    # Remove data URL prefix if present
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]

    # Build the request for vLLM OpenAI-compatible API
    request_body = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ],
        "max_tokens": 2048,
        "temperature": 0
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{VLLM_SERVICE_URL}/v1/chat/completions",
            json=request_body
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"vLLM error: {response.text}"
            )

        data = response.json()
        return data["choices"][0]["message"]["content"]


def parse_detections_from_text(text: str, image_width: int, image_height: int) -> List[Detection]:
    """
    Parse detection results from MedGemma's text output.

    MedGemma outputs findings in natural language. We parse for:
    - Abnormality labels (cardiomegaly, pneumonia, etc.)
    - Location mentions (left/right, upper/lower, etc.)
    - Confidence indicators (definite, probable, possible)
    """
    detections = []

    # Common chest X-ray abnormalities to look for
    abnormality_patterns = {
        "cardiomegaly": 0.85,
        "pleural effusion": 0.80,
        "pneumonia": 0.75,
        "consolidation": 0.75,
        "atelectasis": 0.70,
        "pneumothorax": 0.90,
        "nodule": 0.65,
        "mass": 0.70,
        "infiltrate": 0.70,
        "edema": 0.75,
        "pulmonary edema": 0.75,
        "enlarged heart": 0.85,
        "opacity": 0.60,
        "effusion": 0.80,
        "fracture": 0.70,
        "rib fracture": 0.70,
    }

    text_lower = text.lower()

    for abnormality, base_confidence in abnormality_patterns.items():
        if abnormality in text_lower:
            # Adjust confidence based on certainty words
            confidence = base_confidence
            if any(word in text_lower for word in ["definite", "clearly", "obvious", "significant"]):
                confidence = min(0.95, confidence + 0.1)
            elif any(word in text_lower for word in ["possible", "may be", "cannot exclude", "questionable"]):
                confidence = max(0.3, confidence - 0.2)
            elif any(word in text_lower for word in ["probable", "likely", "suggestive"]):
                confidence = confidence  # Keep as is

            # Estimate location based on text
            x_min, y_min, x_max, y_max = estimate_bounding_box(
                text_lower, abnormality, image_width, image_height
            )

            # Capitalize label
            label = abnormality.title()

            detections.append(Detection(
                label=label,
                confidence=round(confidence, 2),
                x_min=x_min,
                y_min=y_min,
                x_max=x_max,
                y_max=y_max,
            ))

    return detections


def estimate_bounding_box(text: str, abnormality: str, width: int, height: int) -> tuple:
    """
    Estimate bounding box coordinates based on anatomical location mentions.
    """
    # Default to center region
    margin = 0.1
    x_min = int(width * margin)
    y_min = int(height * margin)
    x_max = int(width * (1 - margin))
    y_max = int(height * (1 - margin))

    # Cardiac abnormalities - center-left
    if abnormality in ["cardiomegaly", "enlarged heart"]:
        x_min = int(width * 0.25)
        y_min = int(height * 0.25)
        x_max = int(width * 0.75)
        y_max = int(height * 0.75)

    # Pleural effusion - lower portions
    elif "effusion" in abnormality:
        if "left" in text:
            x_min = int(width * 0.55)
            x_max = int(width * 0.90)
        elif "right" in text:
            x_min = int(width * 0.10)
            x_max = int(width * 0.45)
        y_min = int(height * 0.50)
        y_max = int(height * 0.90)

    # Pneumothorax - upper lung regions
    elif "pneumothorax" in abnormality:
        if "left" in text:
            x_min = int(width * 0.55)
            x_max = int(width * 0.90)
        elif "right" in text:
            x_min = int(width * 0.10)
            x_max = int(width * 0.45)
        y_min = int(height * 0.10)
        y_max = int(height * 0.50)

    # Lung opacities/consolidation
    elif abnormality in ["pneumonia", "consolidation", "infiltrate", "opacity"]:
        if "left" in text and "lower" in text:
            x_min, y_min = int(width * 0.55), int(height * 0.50)
            x_max, y_max = int(width * 0.85), int(height * 0.85)
        elif "left" in text and "upper" in text:
            x_min, y_min = int(width * 0.55), int(height * 0.15)
            x_max, y_max = int(width * 0.85), int(height * 0.50)
        elif "right" in text and "lower" in text:
            x_min, y_min = int(width * 0.15), int(height * 0.50)
            x_max, y_max = int(width * 0.45), int(height * 0.85)
        elif "right" in text and "upper" in text:
            x_min, y_min = int(width * 0.15), int(height * 0.15)
            x_max, y_max = int(width * 0.45), int(height * 0.50)
        elif "left" in text:
            x_min, y_min = int(width * 0.55), int(height * 0.20)
            x_max, y_max = int(width * 0.90), int(height * 0.80)
        elif "right" in text:
            x_min, y_min = int(width * 0.10), int(height * 0.20)
            x_max, y_max = int(width * 0.45), int(height * 0.80)
        elif "bilateral" in text:
            x_min, y_min = int(width * 0.10), int(height * 0.20)
            x_max, y_max = int(width * 0.90), int(height * 0.80)

    # Nodules/masses - smaller boxes
    elif abnormality in ["nodule", "mass"]:
        if "left" in text:
            center_x = int(width * 0.70)
        elif "right" in text:
            center_x = int(width * 0.30)
        else:
            center_x = int(width * 0.50)

        if "upper" in text:
            center_y = int(height * 0.30)
        elif "lower" in text:
            center_y = int(height * 0.70)
        else:
            center_y = int(height * 0.50)

        box_size = int(min(width, height) * 0.15)
        x_min = center_x - box_size
        y_min = center_y - box_size
        x_max = center_x + box_size
        y_max = center_y + box_size

    # Ensure bounds are within image
    x_min = max(0, x_min)
    y_min = max(0, y_min)
    x_max = min(width, x_max)
    y_max = min(height, y_max)

    return x_min, y_min, x_max, y_max


# =====================
# FastAPI Application
# =====================

app = FastAPI(
    title="MedAI MedGemma Service",
    description="Chest X-ray detection and description using MedGemma via vLLM",
    version="2.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint - also checks vLLM availability."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{VLLM_SERVICE_URL}/health")
            vllm_healthy = response.status_code == 200
    except Exception:
        vllm_healthy = False

    return HealthResponse(
        status="healthy" if vllm_healthy else "degraded",
        service="medgemma-wrapper",
        model_loaded=vllm_healthy,  # Model is loaded in vLLM
        gpu_available=vllm_healthy,
        vram_used_gb=None,
    )


@app.get("/info", response_model=InfoResponse)
async def get_info():
    """Get service information."""
    return InfoResponse(
        service="medgemma-wrapper",
        model_id=f"{MODEL_NAME} (via vLLM at {VLLM_SERVICE_URL})",
        quantization="bfloat16",
        gpu_device="managed by vLLM",
        endpoints=["/detect", "/describe", "/health", "/info"],
    )


@app.post("/detect", response_model=DetectionResponse)
async def detect_abnormalities(request: DetectionRequest):
    """
    Detect abnormalities in a chest X-ray image.

    Returns bounding boxes with labels and confidence scores.
    """
    start_time = time.time()

    try:
        # Get image dimensions
        image_width, image_height = decode_image_size(request.image)
        logger.info(f"Processing image: {image_width}x{image_height}, threshold: {request.threshold}")

        # Detection prompt
        detection_prompt = """Analyze this chest X-ray image and identify any abnormalities.
For each finding, describe:
1. The abnormality type (e.g., cardiomegaly, pleural effusion, pneumonia, nodule, etc.)
2. Location (left/right lung, upper/lower lobe, etc.)
3. Severity or confidence (definite, probable, possible)

Be thorough and systematic. List each finding separately."""

        # Call vLLM
        response_text = await call_vllm_chat(request.image, detection_prompt)
        logger.info(f"MedGemma response: {response_text[:500]}...")

        # Parse detections from text
        detections = parse_detections_from_text(response_text, image_width, image_height)
        logger.info(f"Parsed {len(detections)} detections before filtering")
        for d in detections:
            logger.info(f"  - {d.label}: {d.confidence}")

        # Filter by threshold
        detections = [d for d in detections if d.confidence >= request.threshold]
        logger.info(f"After filtering (threshold={request.threshold}): {len(detections)} detections")

        processing_time = (time.time() - start_time) * 1000

        return DetectionResponse(
            detections=detections,
            description=response_text,
            processing_time_ms=round(processing_time, 2),
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="vLLM service timeout")
    except Exception as e:
        logger.exception("Detection failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/describe", response_model=DescribeResponse)
async def describe_image(request: DescribeRequest):
    """
    Generate a detailed description of a chest X-ray image.

    Optionally accepts a custom prompt for specific questions.
    """
    start_time = time.time()

    try:
        # Use custom prompt or default
        if request.prompt:
            prompt_text = request.prompt
        else:
            prompt_text = """Provide a comprehensive radiology report for this chest X-ray.
Include:
1. Technical quality assessment
2. Systematic review of all structures (lungs, heart, mediastinum, bones, soft tissues)
3. Any abnormal findings with location and characteristics
4. Overall impression and recommendations

Use standard radiology terminology and be thorough."""

        # Call vLLM
        response_text = await call_vllm_chat(request.image, prompt_text)

        processing_time = (time.time() - start_time) * 1000

        return DescribeResponse(
            description=response_text,
            processing_time_ms=round(processing_time, 2),
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="vLLM service timeout")
    except Exception as e:
        logger.exception("Description failed")
        raise HTTPException(status_code=500, detail=str(e))


# Legacy endpoint for backward compatibility
@app.post("/infer")
async def infer_legacy(request: DetectionRequest):
    """Legacy inference endpoint for backward compatibility."""
    return await detect_abnormalities(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
