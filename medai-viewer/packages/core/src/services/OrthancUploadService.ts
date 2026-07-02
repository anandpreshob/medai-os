/**
 * Orthanc Upload Service
 * Handles uploading DICOM files to the Orthanc PACS server
 */

import { autoDetectionService, type AutoDetectionConfig, type StoredDetectionResult } from './AutoDetectionService';

export interface UploadProgress {
  fileName: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  fileName: string;
  instanceId?: string;
  studyInstanceUID?: string;
  error?: string;
}

export interface UploadResultWithDetection extends UploadResult {
  /** Auto-detection result (if run) */
  detectionResult?: StoredDetectionResult;
  /** Whether auto-detection was triggered */
  detectionTriggered?: boolean;
}

export class OrthancUploadService {
  private orthancUrl: string;

  constructor(orthancUrl = '/proxy/orthanc') {
    this.orthancUrl = orthancUrl;
  }

  /**
   * Upload a single DICOM file to Orthanc
   * @param file - The DICOM file to upload
   * @param onProgress - Optional callback for upload progress
   * @returns Upload result
   */
  async uploadDicomFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      // Read file as ArrayBuffer
      const fileBuffer = await this.readFileAsArrayBuffer(file);

      // Create FormData (Orthanc accepts raw DICOM binary)
      const formData = new FormData();
      formData.append('file', new Blob([fileBuffer]), file.name);

      // Upload to Orthanc /instances endpoint
      const response = await fetch(`${this.orthancUrl}/instances`, {
        method: 'POST',
        body: fileBuffer, // Orthanc expects raw DICOM binary
        headers: {
          'Content-Type': 'application/dicom',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      // Parse response
      const result = await response.json();

      // Orthanc returns: { ID, Path, Status }
      // We need to fetch the instance details to get StudyInstanceUID
      const instanceId = result.ID;
      let studyInstanceUID: string | undefined;

      try {
        const instanceInfoResp = await fetch(`${this.orthancUrl}/instances/${instanceId}/simplified-tags`);
        if (instanceInfoResp.ok) {
          const tags = await instanceInfoResp.json();
          studyInstanceUID = tags.StudyInstanceUID;
        }
      } catch (err) {
        console.warn('[OrthancUpload] Could not fetch StudyInstanceUID:', err);
      }

      return {
        success: true,
        fileName: file.name,
        instanceId,
        studyInstanceUID,
      };
    } catch (error) {
      console.error('[OrthancUpload] Upload failed:', error);
      return {
        success: false,
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload multiple DICOM files to Orthanc
   * @param files - Array of DICOM files to upload
   * @param onFileProgress - Optional callback for individual file progress
   * @returns Array of upload results
   */
  async uploadDicomFiles(
    files: File[],
    onFileProgress?: (fileName: string, progress: UploadProgress) => void
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadDicomFile(file, (progress) => {
        if (onFileProgress) {
          onFileProgress(file.name, progress);
        }
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Test connection to Orthanc server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.orthancUrl}/system`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Upload a single DICOM file to Orthanc with automatic AI detection
   *
   * This method uploads the file and then triggers auto-detection in a
   * fire-and-forget manner (non-blocking). The upload result is returned
   * immediately while detection runs in the background.
   *
   * @param file - The DICOM file to upload
   * @param config - Auto-detection configuration
   * @param onProgress - Optional callback for upload progress
   * @returns Upload result (detection runs async in background)
   */
  async uploadDicomFileWithAutoDetection(
    file: File,
    config?: AutoDetectionConfig,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResultWithDetection> {
    // First, upload the file normally
    const uploadResult = await this.uploadDicomFile(file, onProgress);

    // If upload failed or no instance ID, return early
    if (!uploadResult.success || !uploadResult.instanceId) {
      return uploadResult;
    }

    // Check if auto-detection is enabled
    const autoDetectEnabled = config?.enabled ?? true;

    if (autoDetectEnabled) {
      // Fire-and-forget: trigger auto-detection without waiting
      console.log('[OrthancUpload] Triggering auto-detection for instance:', uploadResult.instanceId);

      autoDetectionService
        .runAutoDetection(uploadResult.instanceId, config)
        .then((detectionResult) => {
          if (detectionResult) {
            console.log(
              '[OrthancUpload] Auto-detection complete:',
              detectionResult.status,
              detectionResult.detections.length,
              'findings'
            );
          }
        })
        .catch((error) => {
          console.warn('[OrthancUpload] Auto-detection error:', error);
        });

      return {
        ...uploadResult,
        detectionTriggered: true,
      };
    }

    return {
      ...uploadResult,
      detectionTriggered: false,
    };
  }

  /**
   * Upload multiple DICOM files with automatic AI detection
   *
   * @param files - Array of DICOM files to upload
   * @param config - Auto-detection configuration
   * @param onFileProgress - Optional callback for individual file progress
   * @returns Array of upload results
   */
  async uploadDicomFilesWithAutoDetection(
    files: File[],
    config?: AutoDetectionConfig,
    onFileProgress?: (fileName: string, progress: UploadProgress) => void
  ): Promise<UploadResultWithDetection[]> {
    const results: UploadResultWithDetection[] = [];

    for (const file of files) {
      const result = await this.uploadDicomFileWithAutoDetection(
        file,
        config,
        (progress) => {
          if (onFileProgress) {
            onFileProgress(file.name, progress);
          }
        }
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Read file as ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

// Singleton instance
export const orthancUploadService = new OrthancUploadService();
