/**
 * Report Generation Service
 * Handles communication with MedAI server for AI-powered radiology report generation.
 */

import { VolumetricsResult, RadiomicsResult } from '../stores/analyticsStore';
import { GeneratedReport, ReportSections, ReportDetection } from '../stores/reportStore';
import type { LongitudinalDelta, ProgressionClassification } from '../stores/longitudinalTypes';

/**
 * Per-timepoint data for longitudinal reports
 */
export interface LongitudinalTimepointData {
  timepointId: string;
  label: string;
  studyDate?: string;
  imageBase64?: string;
  detections?: ReportDetection[];
  volumetrics?: VolumetricsResult | null;
  findings?: string;
}

/**
 * Longitudinal-specific report payload
 */
export interface LongitudinalReportPayload {
  sessionId: string;
  patientId: string;
  patientName?: string;
  modality: string;
  anatomy?: string;
  timepoints: LongitudinalTimepointData[];
  deltas: LongitudinalDelta[];
  overallClassification?: ProgressionClassification;
  clinicalContext?: string;
}

/**
 * Request payload for report generation
 */
export interface ReportGenerationRequest {
  mosaicImage: string;  // Base64 PNG data URL
  volumetrics: VolumetricsResult | null;
  radiomics: RadiomicsResult | null;
  findings: string;  // Radiologist observations
  modality: string;
  agentType: string;
  patientInfo?: {
    patientId?: string;
    patientName?: string;
    studyDate?: string;
    studyDescription?: string;
  };
  clinicalContext?: string;  // Patient history, indication
  detections?: ReportDetection[];  // AI detections from MedGemma
  /** Longitudinal data for comparison reports */
  longitudinal?: LongitudinalReportPayload;
}

/**
 * Response from report generation endpoint
 */
export interface ReportGenerationResponse {
  success: boolean;
  report?: {
    id: string;
    generatedAt: string;
    agentType: string;
    sections: ReportSections;
    rawResponse?: string;
  };
  error?: string;
}

/**
 * Available agent types for report generation
 */
export type AgentType = 'breast' | 'medgemma' | 'chestxray' | 'lung' | 'liver' | 'brain' | 'general' | 'longitudinal';

/**
 * Agent configuration
 */
export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  modalities: string[];  // Supported modalities
}

/**
 * Available agents for report generation
 */
export const AVAILABLE_AGENTS: AgentConfig[] = [
  {
    type: 'breast',
    name: 'Breast Analysis Agent',
    description: 'Specialized for breast MRI/mammography with BI-RADS formatting',
    modalities: ['MR', 'MG', 'US'],
  },
  {
    type: 'medgemma',
    name: 'MedGemma Chest X-Ray Agent',
    description: 'AI-powered chest X-ray analysis with MedGemma detection integration',
    modalities: ['CR', 'DX', 'XR'],
  },
  {
    type: 'chestxray',
    name: 'Chest X-Ray Analysis Agent',
    description: 'Specialized for chest X-ray with AI detection integration',
    modalities: ['CR', 'DX', 'XR'],
  },
  {
    type: 'lung',
    name: 'Lung Analysis Agent',
    description: 'Specialized for chest CT with Lung-RADS formatting',
    modalities: ['CT'],
  },
  {
    type: 'liver',
    name: 'Liver Analysis Agent',
    description: 'Specialized for liver CT/MRI with LI-RADS formatting',
    modalities: ['CT', 'MR'],
  },
  {
    type: 'brain',
    name: 'Brain Analysis Agent',
    description: 'Specialized for brain MRI/CT analysis',
    modalities: ['MR', 'CT'],
  },
  {
    type: 'general',
    name: 'General Radiology Agent',
    description: 'General purpose radiology report generation',
    modalities: ['CT', 'MR', 'XR', 'US', 'NM', 'PT'],
  },
  {
    type: 'longitudinal',
    name: 'Longitudinal Comparison Agent',
    description: 'Comparison reports with response assessment across multiple timepoints',
    modalities: ['CT', 'MR', 'XR', 'CR', 'DX', 'PT'],
  },
];

export class ReportGenerationService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  /**
   * Generate a radiology report using AI
   *
   * @param request - Report generation request with image and data
   * @returns Generated report with structured sections
   */
  async generateReport(request: ReportGenerationRequest): Promise<GeneratedReport> {
    // Prepare longitudinal data if present
    const longitudinalPayload = request.longitudinal ? {
      session_id: request.longitudinal.sessionId,
      patient_id: request.longitudinal.patientId,
      patient_name: request.longitudinal.patientName,
      modality: request.longitudinal.modality,
      anatomy: request.longitudinal.anatomy,
      timepoints: request.longitudinal.timepoints.map(tp => ({
        timepoint_id: tp.timepointId,
        label: tp.label,
        study_date: tp.studyDate,
        image_base64: tp.imageBase64,
        detections: tp.detections,
        volumetrics: tp.volumetrics,
        findings: tp.findings,
      })),
      deltas: request.longitudinal.deltas.map(delta => ({
        baseline_timepoint_id: delta.baselineTimepointId,
        current_timepoint_id: delta.currentTimepointId,
        segments: delta.segments.map(seg => ({
          segment_label: seg.segmentLabel,
          baseline_volume_cm3: seg.baselineVolumeCm3,
          current_volume_cm3: seg.currentVolumeCm3,
          absolute_change_cm3: seg.absoluteChangeCm3,
          percent_change: seg.percentChange,
          classification: seg.classification,
        })),
        summary: {
          total_volume_change_percent: delta.summary.totalVolumeChangePercent,
          classification: delta.summary.classification,
          new_lesion_count: delta.summary.newLesionCount,
          resolved_lesion_count: delta.summary.resolvedLesionCount,
        },
      })),
      overall_classification: request.longitudinal.overallClassification,
      clinical_context: request.longitudinal.clinicalContext,
    } : undefined;

    const response = await fetch(`${this.serverUrl}/report/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mosaic_image: request.mosaicImage,
        volumetrics: request.volumetrics,
        radiomics: request.radiomics,
        findings: request.findings,
        modality: request.modality,
        agent_type: request.agentType,
        patient_info: request.patientInfo,
        clinical_context: request.clinicalContext,
        detections: request.detections,
        longitudinal: longitudinalPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Report generation failed: ${response.status} - ${errorText}`);
    }

    const data: ReportGenerationResponse = await response.json();

    if (!data.success || !data.report) {
      throw new Error(data.error || 'Report generation failed with unknown error');
    }

    return data.report;
  }

  /**
   * Get recommended agent based on modality
   *
   * @param modality - DICOM modality code (e.g., 'CT', 'MR')
   * @returns Recommended agent type
   */
  getRecommendedAgent(modality: string): AgentType {
    const upperModality = modality.toUpperCase();

    // Check for specific modality matches
    if (upperModality === 'MG' || upperModality.includes('MAMMO')) {
      return 'breast';
    }

    // Chest X-ray modalities use MedGemma agent
    if (upperModality === 'CR' || upperModality === 'DX' || upperModality === 'XR') {
      return 'medgemma';
    }

    if (upperModality === 'CT' && this.isChestStudy(modality)) {
      return 'lung';
    }

    // Find agent that supports this modality
    const matchingAgent = AVAILABLE_AGENTS.find(
      (agent) => agent.type !== 'general' && agent.modalities.includes(upperModality)
    );

    return matchingAgent?.type || 'general';
  }

  /**
   * Check if modality suggests a chest study (simplified heuristic)
   */
  private isChestStudy(_modality: string): boolean {
    // This would ideally check study description, but for now return false
    // to default to general agent for CT
    return false;
  }

  /**
   * Get all available agents
   */
  getAvailableAgents(): AgentConfig[] {
    return AVAILABLE_AGENTS;
  }

  /**
   * Get agent configuration by type
   */
  getAgentConfig(type: AgentType): AgentConfig | undefined {
    return AVAILABLE_AGENTS.find((agent) => agent.type === type);
  }

  /**
   * Check server health/availability
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/info`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
