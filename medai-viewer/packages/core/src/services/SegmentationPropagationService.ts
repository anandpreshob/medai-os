/**
 * Segmentation Propagation Service
 *
 * Service for propagating/resampling segmentation masks from one timepoint
 * to another using registration transformations.
 */

import {
  SegmentationPropagationRequest,
  SegmentationPropagationResult,
} from '../stores/lesionCorrespondenceTypes';

/**
 * Configuration for the propagation service.
 */
export interface SegmentationPropagationConfig {
  /** Base URL for the MONAI Label server */
  serverUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Interpolation methods for resampling.
 */
export type InterpolationMethod = 'nearest' | 'linear';

/**
 * Result of checking propagation compatibility.
 */
export interface PropagationCompatibility {
  compatible: boolean;
  reason?: string;
  sourceSpacing?: [number, number, number];
  targetSpacing?: [number, number, number];
  spacingRatio?: [number, number, number];
}

/**
 * Segmentation Propagation Service.
 *
 * Enables propagating baseline segmentations to follow-up timepoints
 * to provide initial segmentation estimates for comparison.
 */
export class SegmentationPropagationService {
  private readonly serverUrl: string;
  private readonly timeout: number;

  constructor(config: SegmentationPropagationConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 180000; // 3 minute default (resampling can be slow)
  }

  /**
   * Propagate a segmentation mask from source to target image space.
   *
   * @param sourceMaskId - ID of the source segmentation mask
   * @param sourceImageId - ID of the source reference image
   * @param targetImageId - ID of the target reference image
   * @param transformMatrix - 4x4 transformation matrix from source to target space
   * @param interpolation - Interpolation method ('nearest' for labels, 'linear' for soft masks)
   * @returns Propagated mask data and metadata
   */
  async propagateSegmentation(
    sourceMaskId: string,
    sourceImageId: string,
    targetImageId: string,
    transformMatrix: number[][],
    interpolation: InterpolationMethod = 'nearest'
  ): Promise<SegmentationPropagationResult> {
    const url = `${this.serverUrl}/registration/resample-mask`;

    console.log('[SegmentationPropagationService] Starting propagation:', {
      sourceMaskId,
      sourceImageId,
      targetImageId,
      interpolation,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_mask_id: sourceMaskId,
          source_image_id: sourceImageId,
          target_image_id: targetImageId,
          transform_matrix: transformMatrix,
          interpolation,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Propagation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Check content type for multipart response
      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('multipart')) {
        return await this.parseMultipartResponse(response);
      }

      // JSON response (error or metadata only)
      const result = await response.json();

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Propagation failed',
        };
      }

      return {
        success: true,
        segments: result.segments,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[SegmentationPropagationService] Propagation timeout');
        return {
          success: false,
          error: 'Propagation timed out',
        };
      }

      console.error('[SegmentationPropagationService] Propagation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Propagate segmentation using image data directly (for local files).
   *
   * @param sourceMaskData - Source mask as NIfTI ArrayBuffer
   * @param sourceImageData - Source image as NIfTI ArrayBuffer
   * @param targetImageData - Target image as NIfTI ArrayBuffer
   * @param transformMatrix - 4x4 transformation matrix
   * @param interpolation - Interpolation method
   * @returns Propagated mask data and metadata
   */
  async propagateSegmentationWithData(
    sourceMaskData: ArrayBuffer,
    sourceImageData: ArrayBuffer,
    targetImageData: ArrayBuffer,
    transformMatrix: number[][],
    interpolation: InterpolationMethod = 'nearest'
  ): Promise<SegmentationPropagationResult> {
    const url = `${this.serverUrl}/registration/resample-mask-data`;

    console.log('[SegmentationPropagationService] Starting propagation with data:', {
      sourceMaskSize: sourceMaskData.byteLength,
      sourceImageSize: sourceImageData.byteLength,
      targetImageSize: targetImageData.byteLength,
      interpolation,
    });

    try {
      const formData = new FormData();

      // Add files
      formData.append('source_mask', new Blob([sourceMaskData], { type: 'application/gzip' }), 'source_mask.nii.gz');
      formData.append('source_image', new Blob([sourceImageData], { type: 'application/gzip' }), 'source_image.nii.gz');
      formData.append('target_image', new Blob([targetImageData], { type: 'application/gzip' }), 'target_image.nii.gz');

      // Add parameters
      formData.append(
        'params',
        JSON.stringify({
          transform_matrix: transformMatrix,
          interpolation,
        })
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Propagation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await this.parseMultipartResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[SegmentationPropagationService] Propagation timeout');
        return {
          success: false,
          error: 'Propagation timed out',
        };
      }

      console.error('[SegmentationPropagationService] Propagation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if propagation is compatible between two images.
   * Checks spacing ratios and image dimensions.
   */
  async checkCompatibility(
    sourceImageId: string,
    targetImageId: string
  ): Promise<PropagationCompatibility> {
    const url = `${this.serverUrl}/registration/check-compatibility`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_image_id: sourceImageId,
          target_image_id: targetImageId,
        }),
      });

      if (!response.ok) {
        return {
          compatible: false,
          reason: `Server error: ${response.statusText}`,
        };
      }

      const result = await response.json();

      return {
        compatible: result.compatible,
        reason: result.reason,
        sourceSpacing: result.source_spacing,
        targetSpacing: result.target_spacing,
        spacingRatio: result.spacing_ratio,
      };
    } catch (error) {
      return {
        compatible: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse multipart response containing mask data and metadata.
   */
  private async parseMultipartResponse(response: Response): Promise<SegmentationPropagationResult> {
    const contentType = response.headers.get('Content-Type') || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);

    if (!boundaryMatch) {
      // Single binary response
      const maskData = await response.arrayBuffer();
      return {
        success: true,
        maskData,
      };
    }

    const boundary = boundaryMatch[1].trim();
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Parse multipart
    const boundaryBytes = this.stringToUint8Array('--' + boundary);
    const crlfcrlf = this.stringToUint8Array('\r\n\r\n');

    let metadata: Record<string, unknown> = {};
    let maskData: ArrayBuffer | undefined;

    let pos = 0;
    while (pos < uint8Array.length) {
      const boundaryPos = this.indexOfBytes(uint8Array, boundaryBytes, pos);
      if (boundaryPos === -1) break;

      // Check for ending boundary
      const afterBoundary = uint8Array.slice(
        boundaryPos + boundaryBytes.length,
        boundaryPos + boundaryBytes.length + 2
      );
      if (afterBoundary[0] === 0x2d && afterBoundary[1] === 0x2d) break;

      // Find header end
      const headerEndPos = this.indexOfBytes(uint8Array, crlfcrlf, boundaryPos);
      if (headerEndPos === -1) break;

      const headersBytes = uint8Array.slice(boundaryPos + boundaryBytes.length + 2, headerEndPos);
      const headers = new TextDecoder('utf-8').decode(headersBytes);

      const bodyStart = headerEndPos + 4;
      const nextBoundaryPos = this.indexOfBytes(uint8Array, boundaryBytes, bodyStart);
      const bodyEnd = nextBoundaryPos !== -1 ? nextBoundaryPos - 2 : uint8Array.length;
      const body = buffer.slice(bodyStart, bodyEnd);

      if (headers.includes('application/json')) {
        try {
          const jsonStr = new TextDecoder('utf-8').decode(new Uint8Array(body));
          metadata = JSON.parse(jsonStr);
        } catch (e) {
          console.error('[SegmentationPropagationService] JSON parse failed:', e);
        }
      } else if (headers.includes('filename=') || headers.includes('application/gzip')) {
        maskData = body;
      }

      pos = bodyEnd + 2;
    }

    return {
      success: true,
      maskData,
      segments: metadata.segments as SegmentationPropagationResult['segments'],
    };
  }

  /**
   * Convert string to Uint8Array.
   */
  private stringToUint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
  }

  /**
   * Find byte sequence in Uint8Array.
   */
  private indexOfBytes(haystack: Uint8Array, needle: Uint8Array, start: number = 0): number {
    outer: for (let i = start; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  /**
   * Apply inverse transform to propagate from follow-up back to baseline.
   */
  async propagateToBaseline(
    followUpMaskId: string,
    followUpImageId: string,
    baselineImageId: string,
    inverseTransformMatrix: number[][],
    interpolation: InterpolationMethod = 'nearest'
  ): Promise<SegmentationPropagationResult> {
    return this.propagateSegmentation(
      followUpMaskId,
      followUpImageId,
      baselineImageId,
      inverseTransformMatrix,
      interpolation
    );
  }
}

/**
 * Singleton instance factory.
 */
let propagationServiceInstance: SegmentationPropagationService | null = null;

export function getSegmentationPropagationService(serverUrl?: string): SegmentationPropagationService {
  if (!propagationServiceInstance && serverUrl) {
    propagationServiceInstance = new SegmentationPropagationService({ serverUrl });
  }

  if (!propagationServiceInstance) {
    throw new Error('SegmentationPropagationService not initialized. Provide serverUrl.');
  }

  return propagationServiceInstance;
}

export function initSegmentationPropagationService(serverUrl: string): SegmentationPropagationService {
  propagationServiceInstance = new SegmentationPropagationService({ serverUrl });
  return propagationServiceInstance;
}

export default SegmentationPropagationService;
