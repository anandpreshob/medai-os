/**
 * Auto Detection Service
 *
 * Handles automatic chest X-ray detection on DICOM upload.
 * Checks if detection is appropriate, runs AI analysis, and stores results.
 */

import { OrthancAttachmentService, orthancAttachmentService } from './OrthancAttachmentService';
import { ChestXrayDetectionService } from './ChestXrayDetectionService';
import type { Detection } from '../stores/detectionStore';

/** Numeric attachment index for AI detection results (Orthanc requires >= 1024 for custom attachments) */
export const AI_DETECTION_ATTACHMENT_NAME = '9999';

/** X-ray modalities that support auto-detection */
const XRAY_MODALITIES = ['CR', 'DX', 'XR'];

/** Default confidence threshold for auto-detection */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Stored detection result schema
 */
export interface StoredDetectionResult {
  /** Schema version for future compatibility */
  version: '1.0';
  /** ISO timestamp when detection was run */
  timestamp: string;
  /** Service that performed the detection */
  service: 'medgemma';
  /** Confidence threshold used */
  threshold: number;
  /** Processing status */
  status: 'success' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Detected findings */
  detections: Array<{
    label: string;
    confidence: number;
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
  }>;
  /** AI-generated description of findings */
  description: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Configuration for auto-detection
 */
export interface AutoDetectionConfig {
  /** Whether auto-detection is enabled */
  enabled: boolean;
  /** Confidence threshold (0-1) */
  confidenceThreshold?: number;
  /** Custom MedGemma server URL */
  medgemmaUrl?: string;
}

/**
 * Instance metadata returned by Orthanc
 */
interface InstanceMetadata {
  Modality?: string;
  [key: string]: string | undefined;
}

/**
 * Service for automatic AI detection on DICOM uploads
 */
export class AutoDetectionService {
  private orthancUrl: string;
  private medgemmaUrl: string;
  private attachmentService: OrthancAttachmentService;
  private detectionService: ChestXrayDetectionService;

  /** In-memory cache of detection results keyed by instance ID */
  private instanceCache = new Map<string, StoredDetectionResult>();
  /** In-memory cache of study-level detection results keyed by study UID */
  private studyCache = new Map<string, Detection[]>();

  constructor(
    orthancUrl = '/proxy/orthanc',
    medgemmaUrl = '/monai'
  ) {
    this.orthancUrl = orthancUrl;
    this.medgemmaUrl = medgemmaUrl;
    this.attachmentService = orthancAttachmentService;
    this.detectionService = new ChestXrayDetectionService(medgemmaUrl);
  }

  /**
   * Check if an instance is an X-ray that supports detection
   *
   * @param instanceId - Orthanc instance ID
   * @returns True if instance is a chest X-ray
   */
  async isXrayInstance(instanceId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.orthancUrl}/instances/${instanceId}/simplified-tags`
      );

      if (!response.ok) {
        return false;
      }

      const tags: InstanceMetadata = await response.json();
      const modality = tags.Modality?.toUpperCase() || '';

      return XRAY_MODALITIES.includes(modality);
    } catch (error) {
      console.warn('[AutoDetection] Failed to check instance modality:', error);
      return false;
    }
  }

  /**
   * Check if MedGemma service is available
   *
   * @returns True if service is healthy and model is loaded
   */
  async isMedGemmaAvailable(): Promise<boolean> {
    return this.detectionService.isModelReady();
  }

  /**
   * Check if detection results already exist for an instance
   *
   * @param instanceId - Orthanc instance ID
   * @returns True if detection attachment exists
   */
  async hasStoredDetection(instanceId: string): Promise<boolean> {
    if (this.instanceCache.has(instanceId)) return true;
    return this.attachmentService.hasAttachment(instanceId, AI_DETECTION_ATTACHMENT_NAME);
  }

  /**
   * Get stored detection results for an instance
   *
   * @param instanceId - Orthanc instance ID
   * @returns Stored detection result or null if not found
   */
  async getStoredDetection(instanceId: string): Promise<StoredDetectionResult | null> {
    const cached = this.instanceCache.get(instanceId);
    if (cached) return cached;

    const stored = await this.attachmentService.getAttachment<StoredDetectionResult>(
      instanceId,
      AI_DETECTION_ATTACHMENT_NAME
    );
    if (stored) {
      this.instanceCache.set(instanceId, stored);
    }
    return stored;
  }

  /**
   * Get rendered PNG image from Orthanc instance
   *
   * @param instanceId - Orthanc instance ID
   * @returns Base64-encoded PNG image
   */
  async getRenderedImage(instanceId: string): Promise<string> {
    const response = await fetch(
      `${this.orthancUrl}/instances/${instanceId}/rendered`
    );

    if (!response.ok) {
      throw new Error(`Failed to get rendered image: ${response.status}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix if present
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Run detection on an instance and store results
   *
   * @param instanceId - Orthanc instance ID
   * @param config - Detection configuration
   * @returns Detection result
   */
  async runDetection(
    instanceId: string,
    config?: Partial<AutoDetectionConfig>
  ): Promise<StoredDetectionResult> {
    const threshold = config?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    const startTime = Date.now();

    try {
      console.log(`[AutoDetection] Running detection on instance ${instanceId}`);

      // Get rendered image
      const imageBase64 = await this.getRenderedImage(instanceId);

      // Run detection
      const result = await this.detectionService.runDetection(imageBase64, threshold);

      // Create stored result
      const storedResult: StoredDetectionResult = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        service: 'medgemma',
        threshold,
        status: 'success',
        detections: result.detections.map(d => ({
          label: d.label,
          confidence: d.confidence,
          x_min: d.x_min,
          y_min: d.y_min,
          x_max: d.x_max,
          y_max: d.y_max,
        })),
        description: result.description,
        processingTimeMs: result.processingTimeMs,
      };

      // Cache in memory immediately
      this.instanceCache.set(instanceId, storedResult);

      // Save to Orthanc attachment (best-effort)
      try {
        await this.attachmentService.saveAttachment(
          instanceId,
          AI_DETECTION_ATTACHMENT_NAME,
          storedResult
        );
      } catch (saveErr) {
        console.warn('[AutoDetection] Orthanc attachment save failed (results cached in memory):', saveErr);
      }

      console.log(
        `[AutoDetection] Detection complete: ${result.detections.length} findings saved`
      );

      return storedResult;
    } catch (error) {
      console.error('[AutoDetection] Detection failed:', error);

      // Store error result
      const errorResult: StoredDetectionResult = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        service: 'medgemma',
        threshold,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        detections: [],
        description: '',
        processingTimeMs: Date.now() - startTime,
      };

      // Cache error result in memory to prevent retries
      this.instanceCache.set(instanceId, errorResult);

      // Best-effort save to Orthanc
      try {
        await this.attachmentService.saveAttachment(
          instanceId,
          AI_DETECTION_ATTACHMENT_NAME,
          errorResult
        );
      } catch {
        // Ignore save error — in-memory cache will prevent retries
      }

      return errorResult;
    }
  }

  /**
   * Run auto-detection on an instance if appropriate
   *
   * This method checks all prerequisites before running detection:
   * - Instance is an X-ray modality
   * - MedGemma service is available
   * - Detection hasn't already been run
   *
   * @param instanceId - Orthanc instance ID
   * @param config - Detection configuration
   * @returns Detection result or null if skipped
   */
  async runAutoDetection(
    instanceId: string,
    config?: Partial<AutoDetectionConfig>
  ): Promise<StoredDetectionResult | null> {
    // Check if enabled
    if (config?.enabled === false) {
      console.log('[AutoDetection] Skipped: disabled by config');
      return null;
    }

    // Check if X-ray
    const isXray = await this.isXrayInstance(instanceId);
    if (!isXray) {
      console.log('[AutoDetection] Skipped: not an X-ray modality');
      return null;
    }

    // Check if MedGemma is available
    const isAvailable = await this.isMedGemmaAvailable();
    if (!isAvailable) {
      console.log('[AutoDetection] Skipped: MedGemma service unavailable');
      return null;
    }

    // Check if already processed
    const hasExisting = await this.hasStoredDetection(instanceId);
    if (hasExisting) {
      console.log('[AutoDetection] Skipped: detection already exists');
      return this.getStoredDetection(instanceId);
    }

    // Run detection
    return this.runDetection(instanceId, config);
  }

  /**
   * Convert stored detection to Detection[] for the detection store
   *
   * @param stored - Stored detection result
   * @returns Array of Detection objects
   */
  static toDetections(stored: StoredDetectionResult): Detection[] {
    if (stored.status !== 'success') {
      return [];
    }

    return stored.detections.map((det, index) => ({
      id: `stored_${Date.now()}_${index}`,
      label: det.label,
      confidence: det.confidence,
      x_min: det.x_min,
      y_min: det.y_min,
      x_max: det.x_max,
      y_max: det.y_max,
      visible: true,
      color: det.confidence >= 0.8 ? '#22c55e' : det.confidence >= 0.5 ? '#eab308' : '#ef4444',
      includeInReport: true,
      source: 'ai' as const,
    }));
  }

  /**
   * Get existing detections for all instances in a study
   *
   * @param studyUID - DICOM StudyInstanceUID
   * @returns Aggregated detection findings from stored attachments
   */
  /**
   * Get Orthanc instances for a study by StudyInstanceUID
   */
  private async getStudyInstances(studyUID: string): Promise<Array<{ ID: string }>> {
    const findResp = await fetch(`${this.orthancUrl}/tools/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Level: 'Study',
        Query: { StudyInstanceUID: studyUID },
      }),
    });

    if (!findResp.ok) return [];
    const studyIds: string[] = await findResp.json();
    if (studyIds.length === 0) return [];

    const instancesResp = await fetch(
      `${this.orthancUrl}/studies/${studyIds[0]}/instances`
    );
    if (!instancesResp.ok) return [];
    return instancesResp.json();
  }

  async getStudyDetections(studyUID: string): Promise<{ detections: Detection[]; allDetected: boolean }> {
    // Check study-level cache first
    const cachedStudy = this.studyCache.get(studyUID);
    if (cachedStudy !== undefined) {
      console.log(`[AutoDetection] Study ${studyUID} found in cache (${cachedStudy.length} detections)`);
      return { detections: cachedStudy, allDetected: true };
    }

    try {
      const instances = await this.getStudyInstances(studyUID);
      if (instances.length === 0) return { detections: [], allDetected: false };

      // Check which X-ray instances have stored detections
      const allDetections: Detection[] = [];
      let xrayCount = 0;
      let detectedCount = 0;

      for (const inst of instances) {
        const isXray = await this.isXrayInstance(inst.ID);
        if (!isXray) continue;
        xrayCount++;

        const stored = await this.getStoredDetection(inst.ID);
        if (stored) {
          detectedCount++;
          if (stored.status === 'success' && stored.detections.length > 0) {
            allDetections.push(...AutoDetectionService.toDetections(stored));
          }
        }
      }

      const allDetected = xrayCount > 0 && detectedCount === xrayCount;

      // Cache at study level if all instances are detected
      if (allDetected) {
        this.studyCache.set(studyUID, allDetections);
      }

      return { detections: allDetections, allDetected };
    } catch (error) {
      console.warn('[AutoDetection] Failed to get study detections:', error);
      return { detections: [], allDetected: false };
    }
  }

  /**
   * Run detection on all undetected X-ray instances in a study
   *
   * @param studyUID - DICOM StudyInstanceUID
   * @param onProgress - Optional callback for progress updates (current, total)
   * @returns Aggregated detection findings
   */
  async runDetectionsForStudy(
    studyUID: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<Detection[]> {
    try {
      const instances = await this.getStudyInstances(studyUID);
      if (instances.length === 0) return [];

      // Filter to X-ray instances without existing detection
      const candidates: string[] = [];
      for (const inst of instances) {
        const isXray = await this.isXrayInstance(inst.ID);
        if (!isXray) continue;
        const hasDetection = await this.hasStoredDetection(inst.ID);
        if (!hasDetection) {
          candidates.push(inst.ID);
        }
      }

      if (candidates.length === 0) return [];

      // Run all detections in parallel
      onProgress?.(0, candidates.length);
      let completed = 0;

      const results = await Promise.all(
        candidates.map(async (instanceId) => {
          const result = await this.runDetection(instanceId);
          completed++;
          onProgress?.(completed, candidates.length);
          return result;
        })
      );

      const allDetections: Detection[] = [];
      for (const result of results) {
        if (result.status === 'success') {
          allDetections.push(...AutoDetectionService.toDetections(result));
        }
      }

      // Cache at study level so subsequent triage clicks skip detection entirely
      const existingCache = this.studyCache.get(studyUID) || [];
      this.studyCache.set(studyUID, [...existingCache, ...allDetections]);

      return allDetections;
    } catch (error) {
      console.error('[AutoDetection] Failed to run study detections:', error);
      return [];
    }
  }
}

// Singleton instance
export const autoDetectionService = new AutoDetectionService();
