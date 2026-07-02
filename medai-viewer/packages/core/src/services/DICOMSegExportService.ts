/**
 * DICOM-SEG Export Service - Frontend service for DICOM Segmentation exports
 *
 * Handles conversion of segmentation masks to DICOM-SEG format via the backend
 * and provides download/upload functionality.
 */

import type { Segment } from '../stores/segmentationStore';
import type { SegmentationProvenance } from '../schemas/oncologyExportSchema';
import { compressGzip } from './LabelExportService';

// ============================================================================
// Types
// ============================================================================

/**
 * Segment metadata for DICOM-SEG export
 */
export interface DICOMSegmentInfo {
  /** Segment index (1-based) */
  segmentIndex: number;

  /** Segment label */
  label: string;

  /** RGB color [R, G, B] (0-255) */
  color: [number, number, number];

  /** Algorithm type */
  algorithmType: 'AUTOMATIC' | 'SEMIAUTOMATIC' | 'MANUAL';

  /** Algorithm name */
  algorithmName?: string;

  /** Anatomical structure code (SCT code) */
  anatomicRegionCode?: string;

  /** Segmented property code (SCT code) */
  segmentedPropertyCode?: string;
}

/**
 * DICOM-SEG export request
 */
export interface DICOMSegExportRequest {
  /** Study Instance UID */
  studyUID: string;

  /** Series Instance UID of source image */
  seriesUID: string;

  /** Segment information */
  segments: DICOMSegmentInfo[];

  /** Series description for the DICOM-SEG */
  seriesDescription?: string;

  /** Content creator name */
  contentCreator?: string;

  /** Clinical trial series ID */
  clinicalTrialSeriesId?: string;

  /** Clinical trial timepoint ID */
  clinicalTrialTimepointId?: string;
}

/**
 * DICOM-SEG export response
 */
export interface DICOMSegExportResponse {
  /** Whether export was successful */
  success: boolean;

  /** DICOM-SEG file URL (for download) */
  fileUrl?: string;

  /** DICOM-SEG as bytes (for direct use) */
  fileData?: ArrayBuffer;

  /** SOP Instance UID of created DICOM-SEG */
  sopInstanceUID?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * DICOM-SEG import response
 */
export interface DICOMSegImportResponse {
  /** Whether import was successful */
  success: boolean;

  /** Imported segment data */
  segments: Array<{
    segmentIndex: number;
    label: string;
    color: [number, number, number];
  }>;

  /** NIfTI mask data (for loading into viewer) */
  maskData?: ArrayBuffer;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert hex color to RGB tuple
 */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  }
  return [128, 128, 128]; // Default gray
}

/**
 * Convert Segment to DICOMSegmentInfo
 */
export function segmentToDicomInfo(
  segment: Segment,
  algorithmName?: string
): DICOMSegmentInfo {
  return {
    segmentIndex: segment.segmentIndex,
    label: segment.label,
    color: hexToRgb(segment.color),
    algorithmType: algorithmName ? 'AUTOMATIC' : 'MANUAL',
    algorithmName,
  };
}

// ============================================================================
// DICOMSegExportService Class
// ============================================================================

export class DICOMSegExportService {
  private readonly serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  /**
   * Export segmentation mask as DICOM-SEG
   *
   * @param maskData - NIfTI/NRRD mask data as ArrayBuffer
   * @param request - Export request with DICOM metadata
   * @returns Export response with DICOM-SEG data
   */
  async exportDicomSeg(
    maskData: ArrayBuffer,
    request: DICOMSegExportRequest
  ): Promise<DICOMSegExportResponse> {
    const formData = new FormData();

    // Compress mask data
    const compressedMask = await compressGzip(maskData);
    const maskBlob = new Blob([compressedMask], { type: 'application/gzip' });
    formData.append('mask_file', maskBlob, 'mask.nii.gz');

    // Add metadata
    formData.append('params', JSON.stringify(request));

    console.log('[DICOMSegExportService] Exporting DICOM-SEG:', {
      studyUID: request.studyUID,
      seriesUID: request.seriesUID,
      segmentCount: request.segments.length,
      maskSize: maskData.byteLength,
    });

    try {
      const response = await fetch(`${this.serverUrl}/dicomseg/export`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[DICOMSegExportService] Export failed:', errorText);
        return {
          success: false,
          error: `Export failed: ${response.status} ${response.statusText}`,
        };
      }

      const contentType = response.headers.get('Content-Type') || '';

      // Check if response is JSON (error) or binary (DICOM-SEG)
      if (contentType.includes('application/json')) {
        const result = await response.json();
        if (result.error) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          fileUrl: result.file_url,
          sopInstanceUID: result.sop_instance_uid,
        };
      }

      // Binary DICOM-SEG data
      const fileData = await response.arrayBuffer();
      const sopInstanceUID = response.headers.get('X-SOP-Instance-UID') || undefined;

      return {
        success: true,
        fileData,
        sopInstanceUID,
      };
    } catch (error) {
      console.error('[DICOMSegExportService] Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Import DICOM-SEG and convert to NIfTI mask
   *
   * @param dicomSegData - DICOM-SEG file data
   * @returns Import response with mask data
   */
  async importDicomSeg(dicomSegData: ArrayBuffer): Promise<DICOMSegImportResponse> {
    const formData = new FormData();

    const dicomBlob = new Blob([dicomSegData], { type: 'application/dicom' });
    formData.append('dicom_seg_file', dicomBlob, 'segmentation.dcm');

    console.log('[DICOMSegExportService] Importing DICOM-SEG:', {
      size: dicomSegData.byteLength,
    });

    try {
      const response = await fetch(`${this.serverUrl}/dicomseg/import`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[DICOMSegExportService] Import failed:', errorText);
        return {
          success: false,
          segments: [],
          error: `Import failed: ${response.status} ${response.statusText}`,
        };
      }

      // Parse multipart response
      const result = await this.parseMultipartImportResponse(response);
      return result;
    } catch (error) {
      console.error('[DICOMSegExportService] Import error:', error);
      return {
        success: false,
        segments: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download DICOM-SEG as file
   */
  downloadDicomSeg(data: ArrayBuffer, filename: string = 'segmentation.dcm'): void {
    const blob = new Blob([data], { type: 'application/dicom' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log('[DICOMSegExportService] Downloaded:', filename);
  }

  /**
   * Upload DICOM-SEG to PACS (DICOMweb STOW-RS)
   */
  async uploadToPacs(
    pacsUrl: string,
    dicomSegData: ArrayBuffer
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[DICOMSegExportService] Uploading to PACS:', pacsUrl);

    try {
      const formData = new FormData();
      const blob = new Blob([dicomSegData], { type: 'application/dicom' });
      formData.append('file', blob, 'segmentation.dcm');

      const response = await fetch(`${this.serverUrl}/dicomseg/upload-pacs`, {
        method: 'POST',
        headers: {
          'X-PACS-URL': pacsUrl,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return { success: false, error: errorText };
      }

      return { success: true };
    } catch (error) {
      console.error('[DICOMSegExportService] PACS upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse multipart import response
   */
  private async parseMultipartImportResponse(
    response: Response
  ): Promise<DICOMSegImportResponse> {
    const contentType = response.headers.get('Content-Type') || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);

    if (!boundaryMatch) {
      // Single JSON response
      const result = await response.json();
      return {
        success: true,
        segments: result.segments || [],
      };
    }

    const boundary = boundaryMatch[1].trim();
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    let segments: DICOMSegImportResponse['segments'] = [];
    let maskData: ArrayBuffer | undefined;

    // Parse multipart (simplified)
    const textDecoder = new TextDecoder();
    const text = textDecoder.decode(uint8Array);
    const parts = text.split('--' + boundary);

    for (const part of parts) {
      if (part.includes('application/json')) {
        const jsonStart = part.indexOf('{');
        const jsonEnd = part.lastIndexOf('}') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try {
            const json = JSON.parse(part.substring(jsonStart, jsonEnd));
            segments = json.segments || [];
          } catch (e) {
            console.warn('[DICOMSegExportService] Failed to parse JSON part');
          }
        }
      } else if (part.includes('application/octet-stream') || part.includes('application/gzip')) {
        // Binary mask data - would need more sophisticated parsing
        // For now, assume server returns mask separately
      }
    }

    return {
      success: true,
      segments,
      maskData,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a DICOM-SEG export service instance
 */
export function createDICOMSegExportService(serverUrl: string): DICOMSegExportService {
  return new DICOMSegExportService(serverUrl);
}

export default DICOMSegExportService;
