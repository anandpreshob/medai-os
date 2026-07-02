/**
 * Oncology Export Service - Structured JSON/CSV export for oncology measurements
 *
 * Provides trial-grade export of lesion measurements, response assessments,
 * and provenance tracking in JSON and CSV formats.
 */

import type {
  OncologyExportSchema,
  OncologyLesion,
  ResponseAssessment,
  ExportContext,
  RECISTResponse,
  LesionVolumetrics,
} from '../schemas/oncologyExportSchema';
import type { Segment } from '../stores/segmentationStore';
import type { SegmentationProvenanceState } from '../stores/provenanceStore';

// ============================================================================
// Types
// ============================================================================

/**
 * Volumetrics data from analytics service
 */
export interface VolumetricsData {
  segments: Array<{
    segment_index: number;
    label: string;
    total_volume_mm3: number;
    total_volume_cm3: number;
    longest_axis_mm: number;
    dimensions_mm: [number, number, number];
    instance_count: number;
    instances: Array<{
      instance_id: number;
      volume_mm3: number;
      volume_cm3: number;
      centroid_ijk: [number, number, number];
      longest_axis_mm: number;
      max_diameter_mm: number;
    }>;
  }>;
  metadata?: {
    voxel_spacing_mm: [number, number, number];
  };
}

/**
 * Export options
 */
export interface OncologyExportOptions {
  /** Include provenance in export */
  includeProvenance?: boolean;

  /** Include response assessment */
  includeResponseAssessment?: boolean;

  /** Format for export */
  format: 'json' | 'csv' | 'both';

  /** Filename prefix */
  filenamePrefix?: string;

  /** Include timestamp in filename */
  timestampFilename?: boolean;
}

/**
 * CSV export row
 */
export interface CSVLesionRow {
  lesion_id: string;
  label: string;
  category: string;
  location: string;
  volume_mm3: number;
  volume_cm3: number;
  longest_axis_mm: number;
  short_axis_mm: number | null;
  axial_diameter_mm: number;
  dimension_x_mm: number;
  dimension_y_mm: number;
  dimension_z_mm: number;
  centroid_x: number;
  centroid_y: number;
  centroid_z: number;
  measurement_source: string;
  confidence: number | null;
  segment_index: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert volumetrics to LesionVolumetrics
 */
function volumetricsToLesion(
  volumeData: VolumetricsData['segments'][0]
): LesionVolumetrics {
  // Use first instance for centroid if available
  const firstInstance = volumeData.instances[0];
  const centroid = firstInstance?.centroid_ijk || [0, 0, 0];

  return {
    volumeMm3: volumeData.total_volume_mm3,
    volumeCm3: volumeData.total_volume_cm3,
    longestAxisMm: volumeData.longest_axis_mm,
    axialDiameterMm: volumeData.dimensions_mm[0], // X dimension as axial
    dimensionsMm: volumeData.dimensions_mm,
    centroidIjk: centroid as [number, number, number],
    voxelCount: Math.round(
      volumeData.total_volume_mm3 / (1 * 1 * 1) // Approximate if spacing not known
    ),
  };
}

/**
 * Escape CSV value
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate filename with optional timestamp
 */
function generateFilename(
  prefix: string,
  extension: string,
  includeTimestamp: boolean
): string {
  if (includeTimestamp) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${prefix}_${timestamp}.${extension}`;
  }
  return `${prefix}.${extension}`;
}

// ============================================================================
// OncologyExportService Class
// ============================================================================

export class OncologyExportService {
  /**
   * Build oncology export schema from viewer data
   */
  buildExportSchema(
    context: ExportContext,
    segments: Segment[],
    volumetrics?: VolumetricsData,
    provenance?: SegmentationProvenanceState,
    responseAssessment?: ResponseAssessment
  ): OncologyExportSchema {
    const lesions: OncologyLesion[] = segments.map((segment, index) => {
      const volumeData = volumetrics?.segments.find(
        (v) => v.segment_index === segment.segmentIndex
      );

      const lesionVolumetrics: LesionVolumetrics = volumeData
        ? volumetricsToLesion(volumeData)
        : {
            volumeMm3: 0,
            volumeCm3: 0,
            longestAxisMm: 0,
            axialDiameterMm: 0,
            dimensionsMm: [0, 0, 0],
            centroidIjk: [0, 0, 0],
            voxelCount: 0,
          };

      return {
        id: `lesion-${segment.segmentIndex}`,
        label: segment.label,
        segmentIndex: segment.segmentIndex,
        color: segment.color,
        category: 'target' as const, // Default - should be set by user
        volumetrics: lesionVolumetrics,
        measurementSource: provenance?.latestInference ? 'ai_auto' : 'manual',
        confidence: undefined,
      };
    });

    const exportProvenance = provenance
      ? {
          segmentationModel: provenance.latestInference?.model || {
            name: 'unknown',
            version: '0.0.0',
            parameters: {},
            timestamp: new Date().toISOString(),
          },
          edits: provenance.editHistory,
          reviewer: provenance.reviewer,
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

    return {
      version: '1.0.0',
      exportTimestamp: new Date().toISOString(),
      context,
      lesions,
      responseAssessment,
      provenance: exportProvenance,
    };
  }

  /**
   * Export to JSON format
   */
  exportToJSON(schema: OncologyExportSchema): string {
    return JSON.stringify(schema, null, 2);
  }

  /**
   * Export lesions to CSV format
   */
  exportToCSV(schema: OncologyExportSchema): string {
    const headers = [
      'lesion_id',
      'label',
      'category',
      'location',
      'volume_mm3',
      'volume_cm3',
      'longest_axis_mm',
      'short_axis_mm',
      'axial_diameter_mm',
      'dimension_x_mm',
      'dimension_y_mm',
      'dimension_z_mm',
      'centroid_x',
      'centroid_y',
      'centroid_z',
      'measurement_source',
      'confidence',
      'segment_index',
    ];

    const rows: string[] = [headers.join(',')];

    for (const lesion of schema.lesions) {
      const row: CSVLesionRow = {
        lesion_id: lesion.id,
        label: lesion.label,
        category: lesion.category,
        location: lesion.location || '',
        volume_mm3: lesion.volumetrics.volumeMm3,
        volume_cm3: lesion.volumetrics.volumeCm3,
        longest_axis_mm: lesion.volumetrics.longestAxisMm,
        short_axis_mm: lesion.volumetrics.shortAxisMm || null,
        axial_diameter_mm: lesion.volumetrics.axialDiameterMm,
        dimension_x_mm: lesion.volumetrics.dimensionsMm[0],
        dimension_y_mm: lesion.volumetrics.dimensionsMm[1],
        dimension_z_mm: lesion.volumetrics.dimensionsMm[2],
        centroid_x: lesion.volumetrics.centroidIjk[0],
        centroid_y: lesion.volumetrics.centroidIjk[1],
        centroid_z: lesion.volumetrics.centroidIjk[2],
        measurement_source: lesion.measurementSource,
        confidence: lesion.confidence || null,
        segment_index: lesion.segmentIndex,
      };

      const rowStr = [
        escapeCSV(row.lesion_id),
        escapeCSV(row.label),
        escapeCSV(row.category),
        escapeCSV(row.location),
        row.volume_mm3.toFixed(4),
        row.volume_cm3.toFixed(4),
        row.longest_axis_mm.toFixed(2),
        row.short_axis_mm !== null ? row.short_axis_mm.toFixed(2) : '',
        row.axial_diameter_mm.toFixed(2),
        row.dimension_x_mm.toFixed(2),
        row.dimension_y_mm.toFixed(2),
        row.dimension_z_mm.toFixed(2),
        row.centroid_x.toFixed(0),
        row.centroid_y.toFixed(0),
        row.centroid_z.toFixed(0),
        escapeCSV(row.measurement_source),
        row.confidence !== null ? row.confidence.toFixed(3) : '',
        row.segment_index.toString(),
      ].join(',');

      rows.push(rowStr);
    }

    return rows.join('\n');
  }

  /**
   * Export response assessment summary to CSV
   */
  exportAssessmentToCSV(schema: OncologyExportSchema): string {
    if (!schema.responseAssessment) {
      return '';
    }

    const assessment = schema.responseAssessment;
    const headers = [
      'assessment_timestamp',
      'recist_classification',
      'sum_longest_diameter_mm',
      'percent_change_from_baseline',
      'percent_change_from_nadir',
      'total_tumor_burden_cm3',
      'new_lesion_count',
      'notes',
    ];

    const row = [
      assessment.assessmentTimestamp,
      assessment.recistClassification,
      assessment.sumLongestDiameterMm.toFixed(2),
      assessment.percentChangeFromBaseline?.toFixed(2) || '',
      assessment.percentChangeFromNadir?.toFixed(2) || '',
      assessment.totalTumorBurdenCm3.toFixed(4),
      assessment.newLesionCount.toString(),
      escapeCSV(assessment.notes || ''),
    ].join(',');

    return [headers.join(','), row].join('\n');
  }

  /**
   * Download file
   */
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log('[OncologyExportService] Downloaded:', filename);
  }

  /**
   * Export and download oncology data
   */
  exportAndDownload(
    schema: OncologyExportSchema,
    options: OncologyExportOptions = { format: 'json' }
  ): void {
    const prefix = options.filenamePrefix || 'oncology_export';
    const timestamp = options.timestampFilename ?? true;

    if (options.format === 'json' || options.format === 'both') {
      const jsonContent = this.exportToJSON(schema);
      const jsonFilename = generateFilename(prefix, 'json', timestamp);
      this.downloadFile(jsonContent, jsonFilename, 'application/json');
    }

    if (options.format === 'csv' || options.format === 'both') {
      const csvContent = this.exportToCSV(schema);
      const csvFilename = generateFilename(`${prefix}_lesions`, 'csv', timestamp);
      this.downloadFile(csvContent, csvFilename, 'text/csv');

      if (schema.responseAssessment) {
        const assessmentCsv = this.exportAssessmentToCSV(schema);
        const assessmentFilename = generateFilename(`${prefix}_assessment`, 'csv', timestamp);
        this.downloadFile(assessmentCsv, assessmentFilename, 'text/csv');
      }
    }
  }

  /**
   * Calculate RECIST response assessment
   */
  calculateResponseAssessment(
    currentLesions: OncologyLesion[],
    baselineLesions?: OncologyLesion[],
    nadirLesions?: OncologyLesion[]
  ): ResponseAssessment {
    // Calculate sum of longest diameters for target lesions
    const targetLesions = currentLesions.filter((l) => l.category === 'target');
    const sumLongestDiameter = targetLesions.reduce(
      (sum, l) => sum + l.volumetrics.longestAxisMm,
      0
    );

    // Calculate total tumor burden
    const totalTumorBurden = currentLesions.reduce(
      (sum, l) => sum + l.volumetrics.volumeCm3,
      0
    );

    // Count new lesions
    const newLesionCount = currentLesions.filter((l) => l.category === 'new').length;

    // Calculate percentage changes
    let percentChangeFromBaseline: number | undefined;
    let percentChangeFromNadir: number | undefined;

    if (baselineLesions) {
      const baselineSum = baselineLesions
        .filter((l) => l.category === 'target')
        .reduce((sum, l) => sum + l.volumetrics.longestAxisMm, 0);

      if (baselineSum > 0) {
        percentChangeFromBaseline = ((sumLongestDiameter - baselineSum) / baselineSum) * 100;
      }
    }

    if (nadirLesions) {
      const nadirSum = nadirLesions
        .filter((l) => l.category === 'target')
        .reduce((sum, l) => sum + l.volumetrics.longestAxisMm, 0);

      if (nadirSum > 0) {
        percentChangeFromNadir = ((sumLongestDiameter - nadirSum) / nadirSum) * 100;
      }
    }

    // Determine RECIST classification
    let recistClassification: RECISTResponse = 'not_evaluable';

    if (targetLesions.length > 0 || newLesionCount > 0) {
      // Progressive disease: new lesions or >= 20% increase from nadir
      if (newLesionCount > 0 || (percentChangeFromNadir !== undefined && percentChangeFromNadir >= 20)) {
        recistClassification = 'progressive_disease';
      }
      // Complete response: all target lesions disappeared
      else if (sumLongestDiameter === 0 && targetLesions.length === 0) {
        recistClassification = 'complete_response';
      }
      // Partial response: >= 30% decrease from baseline
      else if (percentChangeFromBaseline !== undefined && percentChangeFromBaseline <= -30) {
        recistClassification = 'partial_response';
      }
      // Stable disease
      else if (percentChangeFromBaseline !== undefined) {
        recistClassification = 'stable_disease';
      }
    }

    return {
      recistClassification,
      sumLongestDiameterMm: sumLongestDiameter,
      percentChangeFromBaseline,
      percentChangeFromNadir,
      totalTumorBurdenCm3: totalTumorBurden,
      newLesionCount,
      assessmentTimestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an oncology export service instance
 */
export function createOncologyExportService(): OncologyExportService {
  return new OncologyExportService();
}

export default OncologyExportService;
