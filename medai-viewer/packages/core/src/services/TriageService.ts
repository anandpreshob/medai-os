/**
 * Triage Service - API client for radiologist worklist triaging
 *
 * Handles communication with the MONAI Label triage endpoint for
 * AI-powered study prioritization.
 */

import type { TriagedStudy, TriageStats } from '../stores/triageStore';
import { isFeatureEnabled } from '../features/registry';

/**
 * Detection finding from AI analysis
 */
export interface DetectionFinding {
  /** Abnormality label (e.g., "Cardiomegaly", "Pneumothorax") */
  label: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Bounding box coordinates (optional) */
  x_min?: number;
  y_min?: number;
  x_max?: number;
  y_max?: number;
}

/**
 * Input study format for triage request
 */
export interface TriageStudyInput {
  studyUID: string;
  patientName?: string;
  patientID?: string;
  studyDate?: string;
  modality?: string;
  studyDescription?: string;
  // Clinical context (optional - can be generated as mock data by backend)
  reasonForVisit?: string;
  urgencyFlag?: string;
  patientHistory?: string;
  symptoms?: string;
  patientLocation?: string;
  // AI detection findings (optional - enhances triaging)
  detections?: DetectionFinding[];
}

/**
 * Triage request body
 */
export interface TriageRequest {
  studies: TriageStudyInput[];
  useLLM?: boolean;
}

/**
 * Triage response from backend
 */
export interface TriageResponse {
  success: boolean;
  triagedStudies: TriagedStudy[];
  totalProcessed: number;
  statCount: number;
  urgentCount: number;
  semiUrgentCount: number;
  routineCount: number;
  error?: string;
}

/**
 * Triage health status
 */
export interface TriageHealth {
  status: 'healthy' | 'error';
  rulesEngineAvailable: boolean;
  llmAvailable: boolean;
  llmModel?: string;
  error?: string;
}

/**
 * Triage level information
 */
export interface TriageLevelInfo {
  level: string;
  description: string;
  turnaround: string;
  color: string;
}

/**
 * Service class for triage API operations
 */
export class TriageService {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '/monai') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Triage a batch of studies
   *
   * @param request - Studies to triage with options
   * @returns Triaged studies with priority rankings
   */
  async triageStudies(request: TriageRequest): Promise<TriageResponse> {
    if (!isFeatureEnabled('triage')) {
      throw new Error('Triage feature is disabled (enable via VITE_FEATURES=triage)');
    }
    const response = await fetch(`${this.baseUrl}/triage/prioritize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Triage failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Check triage service health
   *
   * @returns Health status including LLM availability
   */
  async checkHealth(): Promise<TriageHealth> {
    const response = await fetch(`${this.baseUrl}/triage/health`);

    if (!response.ok) {
      return {
        status: 'error',
        rulesEngineAvailable: false,
        llmAvailable: false,
        error: `Health check failed: ${response.status}`,
      };
    }

    return response.json();
  }

  /**
   * Get available triage levels
   *
   * @returns List of triage levels with metadata
   */
  async getTriageLevels(): Promise<TriageLevelInfo[]> {
    const response = await fetch(`${this.baseUrl}/triage/levels`);

    if (!response.ok) {
      throw new Error(`Failed to get triage levels: ${response.status}`);
    }

    const data = await response.json();
    return data.levels;
  }
}

/**
 * Convert PACS/DICOM study to triage input format
 *
 * @param study - PACS study object
 * @param detections - Optional AI detections for this study
 * @returns Triage input study
 */
export function convertToTriageInput(
  study: {
    studyInstanceUID?: string;
    patientName?: string;
    patientID?: string;
    studyDate?: string;
    modalities?: string[];
    studyDescription?: string;
    // Clinical context fields
    reasonForVisit?: string;
    urgencyFlag?: string;
    patientLocation?: string;
  },
  detections?: DetectionFinding[]
): TriageStudyInput {
  return {
    studyUID: study.studyInstanceUID || '',
    patientName: study.patientName,
    patientID: study.patientID,
    studyDate: study.studyDate,
    modality: study.modalities?.[0] || 'UNKNOWN',
    studyDescription: study.studyDescription,
    // Include clinical context for triage
    reasonForVisit: study.reasonForVisit,
    urgencyFlag: study.urgencyFlag,
    patientLocation: study.patientLocation,
    // Include AI detections if provided
    detections,
  };
}

/**
 * Prepare multiple studies for triage
 *
 * @param studies - Array of PACS studies
 * @param detectionsMap - Optional map of studyUID to detections
 * @returns Array of triage inputs
 */
export function prepareStudiesForTriage(
  studies: Array<{
    studyInstanceUID?: string;
    patientName?: string;
    patientID?: string;
    studyDate?: string;
    modalities?: string[];
    studyDescription?: string;
    // Clinical context fields
    reasonForVisit?: string;
    urgencyFlag?: string;
    patientLocation?: string;
  }>,
  detectionsMap?: Map<string, DetectionFinding[]>
): TriageStudyInput[] {
  return studies.map((study) => {
    const detections = detectionsMap?.get(study.studyInstanceUID || '');
    return convertToTriageInput(study, detections);
  });
}

// Default service instance
let _triageService: TriageService | null = null;

/**
 * Get the default triage service instance
 */
export function getTriageService(): TriageService {
  if (!_triageService) {
    _triageService = new TriageService();
  }
  return _triageService;
}

export default TriageService;
