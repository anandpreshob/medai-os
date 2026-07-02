/**
 * Chest X-Ray Detection Service
 * Handles communication with MedGemma service for AI-powered chest X-ray detection.
 */

import type { Detection } from '../stores/detectionStore';

/**
 * Request payload for detection
 */
export interface DetectionRequest {
  /** Base64-encoded image (PNG/JPEG) */
  image: string;
  /** Confidence threshold (0-1) */
  threshold?: number;
}

/**
 * Raw detection from server
 */
export interface RawDetection {
  label: string;
  confidence: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

/**
 * Response from detection endpoint
 */
export interface DetectionResponse {
  detections: RawDetection[];
  description: string;
  processing_time_ms: number;
}

/**
 * Request payload for description
 */
export interface DescribeRequest {
  /** Base64-encoded image */
  image: string;
  /** Optional custom prompt */
  prompt?: string;
}

/**
 * Response from describe endpoint
 */
export interface DescribeResponse {
  description: string;
  processing_time_ms: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  service: string;
  model_loaded: boolean;
  gpu_available: boolean;
  vram_used_gb?: number;
}

/**
 * Service info response
 */
export interface InfoResponse {
  service: string;
  model_id: string;
  quantization: string;
  gpu_device?: string;
  endpoints: string[];
}

/**
 * Service for chest X-ray AI detection using MedGemma
 */
export class ChestXrayDetectionService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  /**
   * Run AI detection on a chest X-ray image
   *
   * @param imageBase64 - Base64-encoded image (with or without data URL prefix)
   * @param threshold - Confidence threshold (default: 0.3)
   * @returns Detection results with bounding boxes
   */
  async runDetection(imageBase64: string, threshold = 0.3): Promise<{
    detections: Detection[];
    description: string;
    processingTimeMs: number;
  }> {
    console.log('[ChestXrayDetectionService] Sending request with threshold:', threshold);

    const response = await fetch(`${this.serverUrl}/medgemma/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageBase64,
        threshold,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Detection failed: ${response.status} - ${errorText}`);
    }

    const data: DetectionResponse = await response.json();

    // Convert raw detections to Detection objects with IDs and colors
    const detections: Detection[] = data.detections.map((det, index) => ({
      id: `det_${Date.now()}_${index}`,
      label: det.label,
      confidence: det.confidence,
      x_min: det.x_min,
      y_min: det.y_min,
      x_max: det.x_max,
      y_max: det.y_max,
      visible: true,
      color: this.getConfidenceColor(det.confidence),
      includeInReport: true,
      source: 'ai' as const,
    }));

    return {
      detections,
      description: data.description,
      processingTimeMs: data.processing_time_ms,
    };
  }

  /**
   * Get AI description/findings for a chest X-ray image
   *
   * @param imageBase64 - Base64-encoded image
   * @param customPrompt - Optional custom prompt for specific questions
   * @returns AI-generated description
   */
  async getDescription(imageBase64: string, customPrompt?: string): Promise<{
    description: string;
    processingTimeMs: number;
  }> {
    const response = await fetch(`${this.serverUrl}/medgemma/describe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageBase64,
        prompt: customPrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Description failed: ${response.status} - ${errorText}`);
    }

    const data: DescribeResponse = await response.json();

    return {
      description: data.description,
      processingTimeMs: data.processing_time_ms,
    };
  }

  /**
   * Check if MedGemma service is healthy and ready
   */
  async checkHealth(): Promise<HealthResponse> {
    const response = await fetch(`${this.serverUrl}/medgemma/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get service information
   */
  async getInfo(): Promise<InfoResponse> {
    const response = await fetch(`${this.serverUrl}/medgemma/info`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Info request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check if the service is available (quick health check)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Check if the model is loaded and ready
   */
  async isModelReady(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.status === 'healthy' && health.model_loaded;
    } catch {
      return false;
    }
  }

  /**
   * Get color based on confidence level
   */
  private getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return '#22c55e'; // Green
    if (confidence >= 0.5) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  }

  /**
   * Format confidence as percentage string
   */
  static formatConfidence(confidence: number): string {
    return `${(confidence * 100).toFixed(1)}%`;
  }

  /**
   * Get confidence level label
   */
  static getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get human-readable confidence description
   */
  static getConfidenceDescription(confidence: number): string {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.5) return 'Moderate confidence';
    return 'Low confidence';
  }
}
