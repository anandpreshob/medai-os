/**
 * Session Export Service - Export and import complete session artifacts
 *
 * Handles serialization and deserialization of complete session state including:
 * - Segmentations with labelmap data
 * - Detections and findings
 * - Longitudinal session data
 * - Provenance and audit information
 */

import type {
  SessionArtifactSchema,
  SegmentationArtifact,
  SerializedSegment,
  SerializedLabelmap,
} from '../schemas/sessionArtifactSchema';
import {
  createEmptySessionArtifact,
  validateSessionArtifact,
  calculateArtifactChecksum,
  verifyArtifactIntegrity,
} from '../schemas/sessionArtifactSchema';
import type { Segmentation } from '../stores/segmentationStore';
import type { SegmentationProvenanceState } from '../stores/provenanceStore';
import type { LongitudinalSession, LongitudinalTimepoint } from '../stores/longitudinalTypes';
import type { ReviewStatus, SegmentationProvenance } from '../schemas/oncologyExportSchema';
import { compressGzip } from './LabelExportService';

// ============================================================================
// Types
// ============================================================================

/**
 * Detection data for session export (compatible with detection store format)
 */
export interface SessionDetection {
  id: string;
  label: string;
  confidence: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  source: 'ai' | 'manual';
  modelName?: string;
}

/**
 * Findings from findings store
 */
export interface Findings {
  imageId: string;
  radiologistObservations?: string;
  aiFindings?: string;
  clinicalContext?: string;
  timestamp?: string;
}

/**
 * Labelmap volume data
 */
export interface LabelmapVolumeData {
  scalarData: Uint8Array | Uint16Array;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
}

/**
 * Session export options
 */
export interface SessionExportOptions {
  /** Include full labelmap data */
  includeLabelmaps?: boolean;

  /** Include checksum for integrity */
  includeChecksum?: boolean;

  /** Compress labelmaps */
  compressLabelmaps?: boolean;

  /** Application version for metadata */
  applicationVersion?: string;
}

/**
 * Session import result
 */
export interface SessionImportResult {
  success: boolean;
  artifact?: SessionArtifactSchema;
  segmentations?: Array<{
    id: string;
    label: string;
    status: ReviewStatus;
    segments: SerializedSegment[];
    labelmap?: LabelmapVolumeData;
  }>;
  detections?: Record<string, SessionDetection[]>;
  findings?: Findings[];
  longitudinalSession?: LongitudinalSession;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compress and encode labelmap data
 */
async function encodeLabelmap(
  volumeData: LabelmapVolumeData,
  compress: boolean = true
): Promise<SerializedLabelmap> {
  // Ensure we have a proper ArrayBuffer
  const rawData = new Uint8Array(volumeData.scalarData.buffer).buffer as ArrayBuffer;
  let encodedData: string;
  let encoding: 'base64-gzip' | 'base64-raw';

  if (compress) {
    const compressed = await compressGzip(rawData);
    encodedData = arrayBufferToBase64(compressed);
    encoding = 'base64-gzip';
  } else {
    encodedData = arrayBufferToBase64(rawData);
    encoding = 'base64-raw';
  }

  const dtype =
    volumeData.scalarData instanceof Uint16Array
      ? 'uint16'
      : volumeData.scalarData instanceof Int16Array
      ? 'int16'
      : 'uint8';

  return {
    data: encodedData,
    encoding,
    dtype,
    dimensions: volumeData.dimensions,
    spacing: volumeData.spacing,
    origin: volumeData.origin,
    direction: volumeData.direction,
  };
}

/**
 * Decode labelmap data
 */
async function decodeLabelmap(
  serialized: SerializedLabelmap
): Promise<LabelmapVolumeData> {
  let rawBuffer: ArrayBuffer;

  if (serialized.encoding === 'base64-gzip') {
    const compressed = base64ToArrayBuffer(serialized.data);
    rawBuffer = await decompressGzip(compressed);
  } else {
    rawBuffer = base64ToArrayBuffer(serialized.data);
  }

  let scalarData: Uint8Array | Uint16Array;
  switch (serialized.dtype) {
    case 'uint16':
      scalarData = new Uint16Array(rawBuffer);
      break;
    case 'int16':
      // Cast to Uint16 for compatibility
      scalarData = new Uint16Array(rawBuffer);
      break;
    default:
      scalarData = new Uint8Array(rawBuffer);
  }

  return {
    scalarData,
    dimensions: serialized.dimensions,
    spacing: serialized.spacing,
    origin: serialized.origin,
    direction: serialized.direction,
  };
}

/**
 * ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Decompress gzip data
 */
async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  if ('DecompressionStream' in window) {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(data));
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  console.warn('[SessionExportService] DecompressionStream not available');
  return data;
}

// ============================================================================
// SessionExportService Class
// ============================================================================

export class SessionExportService {
  /**
   * Build session artifact from current state
   */
  async buildArtifact(
    segmentations: Array<{
      segmentation: Segmentation;
      labelmapData?: LabelmapVolumeData;
      provenance?: SegmentationProvenanceState;
      referenceImageId: string;
      referenceSeriesUID?: string;
    }>,
    detections: Record<string, SessionDetection[]>,
    findings: Findings[],
    longitudinalSession?: LongitudinalSession,
    options: SessionExportOptions = {}
  ): Promise<SessionArtifactSchema> {
    const artifact = createEmptySessionArtifact(options.applicationVersion);

    // Process segmentations
    for (const seg of segmentations) {
      const status: ReviewStatus = seg.provenance?.status || 'draft';

      const serializedSegments: SerializedSegment[] = seg.segmentation.segments.map((s) => ({
        segmentIndex: s.segmentIndex,
        label: s.label,
        color: s.color,
        visible: s.visible,
        locked: s.locked,
        volumeId: s.volumeId,
      }));

      let labelmap: SerializedLabelmap | undefined;
      if (options.includeLabelmaps && seg.labelmapData) {
        labelmap = await encodeLabelmap(
          seg.labelmapData,
          options.compressLabelmaps ?? true
        );
      }

      const provenance: SegmentationProvenance = seg.provenance
        ? {
            segmentationModel: seg.provenance.latestInference?.model || {
              name: 'unknown',
              version: '0.0.0',
              parameters: {},
              timestamp: new Date().toISOString(),
            },
            edits: seg.provenance.editHistory,
            reviewer: seg.provenance.reviewer,
          }
        : {
            segmentationModel: {
              name: 'unknown',
              version: '0.0.0',
              parameters: {},
              timestamp: new Date().toISOString(),
            },
            edits: [],
          };

      const segArtifact: SegmentationArtifact = {
        id: seg.segmentation.id,
        label: seg.segmentation.label,
        status,
        referenceImageId: seg.referenceImageId,
        referenceSeriesUID: seg.referenceSeriesUID,
        segments: serializedSegments,
        labelmap: labelmap || {
          data: '',
          encoding: 'base64-raw',
          dtype: 'uint8',
          dimensions: [0, 0, 0],
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
        provenance,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      };

      artifact.segmentations.push(segArtifact);
    }

    // Process detections
    for (const [imageId, dets] of Object.entries(detections)) {
      artifact.detections[imageId] = dets.map((d) => ({
        id: d.id,
        label: d.label,
        confidence: d.confidence,
        box: {
          xMin: d.x_min,
          yMin: d.y_min,
          xMax: d.x_max,
          yMax: d.y_max,
        },
        source: d.source,
        modelName: d.modelName,
      }));
    }

    // Process findings
    artifact.findings = findings.map((f) => ({
      imageId: f.imageId,
      radiologistObservations: f.radiologistObservations,
      aiFindings: f.aiFindings,
      clinicalContext: f.clinicalContext,
      timestamp: f.timestamp || new Date().toISOString(),
    }));

    // Process longitudinal session
    if (longitudinalSession) {
      artifact.longitudinalSession = {
        id: longitudinalSession.id,
        patientId: longitudinalSession.patientId,
        patientName: longitudinalSession.patientName,
        modality: longitudinalSession.modality,
        anatomy: longitudinalSession.anatomy,
        description: longitudinalSession.description,
        responseAssessment: longitudinalSession.responseAssessment,
        suiteId: longitudinalSession.suiteId,
        timepoints: longitudinalSession.timepoints.map((tp) => ({
          id: tp.id,
          order: tp.order,
          label: tp.label,
          studyDate: tp.studyDate,
          imageId: tp.imageId,
          studyUID: tp.studyInstanceUID,
          seriesUID: tp.seriesInstanceUID,
          segmentationIds: tp.segmentationIds || [],
          notes: tp.notes,
        })),
        createdAt: new Date(longitudinalSession.createdAt).toISOString(),
        updatedAt: new Date(longitudinalSession.updatedAt).toISOString(),
      };
    }

    // Add checksum if requested
    if (options.includeChecksum) {
      artifact.checksum = await calculateArtifactChecksum(artifact);
    }

    return artifact;
  }

  /**
   * Export artifact to JSON string
   */
  exportToJSON(artifact: SessionArtifactSchema): string {
    return JSON.stringify(artifact, null, 2);
  }

  /**
   * Export and download artifact
   */
  async exportAndDownload(
    artifact: SessionArtifactSchema,
    filename: string = 'session_artifact.json'
  ): Promise<void> {
    const json = this.exportToJSON(artifact);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log('[SessionExportService] Downloaded:', filename);
  }

  /**
   * Import artifact from JSON string
   */
  async importFromJSON(json: string): Promise<SessionImportResult> {
    const warnings: string[] = [];

    try {
      const parsed = JSON.parse(json);

      if (!validateSessionArtifact(parsed)) {
        return {
          success: false,
          error: 'Invalid session artifact format',
        };
      }

      const artifact = parsed as SessionArtifactSchema;

      // Verify integrity if checksum present
      if (artifact.checksum) {
        const isValid = await verifyArtifactIntegrity(artifact);
        if (!isValid) {
          warnings.push('Checksum verification failed - artifact may have been modified');
        }
      }

      // Decode segmentations
      const segmentations: SessionImportResult['segmentations'] = [];
      for (const seg of artifact.segmentations) {
        let labelmap: LabelmapVolumeData | undefined;
        if (seg.labelmap && seg.labelmap.data) {
          try {
            labelmap = await decodeLabelmap(seg.labelmap);
          } catch (e) {
            warnings.push(`Failed to decode labelmap for segmentation ${seg.id}`);
          }
        }

        segmentations.push({
          id: seg.id,
          label: seg.label,
          status: seg.status,
          segments: seg.segments,
          labelmap,
        });
      }

      // Convert detections back to store format
      const detections: Record<string, SessionDetection[]> = {};
      for (const [imageId, dets] of Object.entries(artifact.detections)) {
        detections[imageId] = dets.map((d) => ({
          id: d.id,
          label: d.label,
          confidence: d.confidence,
          x_min: d.box.xMin,
          y_min: d.box.yMin,
          x_max: d.box.xMax,
          y_max: d.box.yMax,
          source: d.source,
          modelName: d.modelName,
        }));
      }

      // Convert findings
      const findings: Findings[] = artifact.findings.map((f) => ({
        imageId: f.imageId,
        radiologistObservations: f.radiologistObservations,
        aiFindings: f.aiFindings,
        clinicalContext: f.clinicalContext,
        timestamp: f.timestamp,
      }));

      // Convert longitudinal session
      let longitudinalSession: LongitudinalSession | undefined;
      if (artifact.longitudinalSession) {
        const ls = artifact.longitudinalSession;
        // Map response assessment to valid enum value
        const validAssessments = ['RECIST', 'BI-RADS', 'RANO', 'mRECIST', 'iRECIST', 'custom'] as const;
        const responseAssessment = ls.responseAssessment && validAssessments.includes(ls.responseAssessment as typeof validAssessments[number])
          ? ls.responseAssessment as typeof validAssessments[number]
          : undefined;

        longitudinalSession = {
          id: ls.id,
          patientId: ls.patientId,
          patientName: ls.patientName,
          modality: ls.modality,
          anatomy: ls.anatomy,
          description: ls.description,
          responseAssessment,
          suiteId: ls.suiteId,
          timepoints: ls.timepoints.map((tp) => ({
            id: tp.id,
            order: tp.order,
            label: tp.label,
            studyDate: tp.studyDate,
            imageId: tp.imageId,
            studyInstanceUID: tp.studyUID,
            seriesInstanceUID: tp.seriesUID,
            segmentationIds: tp.segmentationIds,
            notes: tp.notes,
            acquisitionDateTime: tp.studyDate || new Date().toISOString(),
          })),
          createdAt: new Date(ls.createdAt).getTime(),
          updatedAt: new Date(ls.updatedAt).getTime(),
        };
      }

      return {
        success: true,
        artifact,
        segmentations,
        detections,
        findings,
        longitudinalSession,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to parse JSON',
      };
    }
  }

  /**
   * Import from file
   */
  async importFromFile(file: File): Promise<SessionImportResult> {
    try {
      const json = await file.text();
      return this.importFromJSON(json);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to read file',
      };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a session export service instance
 */
export function createSessionExportService(): SessionExportService {
  return new SessionExportService();
}

export default SessionExportService;
