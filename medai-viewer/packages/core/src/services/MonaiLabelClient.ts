/**
 * MONAI Label Client for TypeScript
 * Handles communication with MONAI Label server for AI-powered medical image segmentation.
 */

import { compressGzip } from './LabelExportService';

export interface ModelInfo {
  type: string;
  labels: string[];
  description: string;
  // TotalSegmentator specific fields
  supported_modalities?: string[];
  ct_labels?: Record<string, number>;
  mr_labels?: Record<string, number>;
}

export interface ServerInfo {
  name: string;
  version: string;
  models: Record<string, ModelInfo>;
}

export interface InferenceParams {
  // Point prompts (for SAM and nninteractive)
  pos_points?: number[][];
  neg_points?: number[][];

  // Box prompts (for nninteractive)
  pos_boxes?: number[][][];  // [[[x_min, y_min, z], [x_max, y_max, z]], ...]
  neg_boxes?: number[][][];

  // Lasso/freehand prompts (for nninteractive)
  pos_lassos?: number[][][]; // [[x1, y1, z], [x2, y2, z], ...]
  neg_lassos?: number[][][];

  // Scribble prompts (for nninteractive)
  pos_scribbles?: number[][][];
  neg_scribbles?: number[][][];

  // nninteractive control mode: "init" | "sam3" | "reset"
  nninter?: 'init' | 'sam3' | 'reset';

  // Result format options
  result_extension?: string;
  result_dtype?: string;
  result_compress?: boolean;
  restore_label_idx?: boolean;
  largest_cc?: boolean;

  // Text prompt for BiomedParse (e.g., "liver" or "liver[SEP]kidney[SEP]spleen")
  text_prompt?: string;

  // TotalSegmentator specific params
  modality?: string;      // 'CT' or 'MR'
  roi_subset?: string[];  // Selected organs to segment

  [key: string]: unknown;
}

export interface InferenceMetadata {
  centroids?: Record<number, number[]>;
  label_names?: Record<number, string>;
  [key: string]: unknown;
}


export interface InferenceResult {
  mask: ArrayBuffer;
  metadata: InferenceMetadata;
}

export interface SessionInfo {
  session_id: string;
  expiry: number;
  image_path?: string;
}

export class MonaiLabelClient {
  public readonly serverUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  /**
   * Fetch server information including available models
   */
  async info(): Promise<ServerInfo> {
    try {
      const response = await fetch(`${this.serverUrl}/info/`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Server returned')) {
        throw error;
      }
      throw new Error(`Failed to connect to MONAI Label server: ${error}`);
    }
  }

  /**
   * Get list of available model names
   */
  async getModelList(): Promise<string[]> {
    const info = await this.info();
    return Object.keys(info.models);
  }

  /**
   * Run inference on the MONAI Label server with image data
   * Use this for initial requests or when the image needs to be re-sent
   */
  async infer(
    model: string,
    imageData: ArrayBuffer,
    params: InferenceParams = {},
    options?: { filename?: string; mimeType?: string }
  ): Promise<InferenceResult> {
    const formData = new FormData();

    // Add parameters with required fields for MONAI Label
    const fullParams: InferenceParams = {
      ...params,
      result_extension: params.result_extension ?? '.nrrd',
      result_dtype: params.result_dtype ?? 'uint16',
      result_compress: params.result_compress ?? false,
      restore_label_idx: params.restore_label_idx ?? false,
    };
    formData.append('params', JSON.stringify(fullParams));

    // Compress image data with gzip for efficient transfer
    const compressedData = await compressGzip(imageData);
    const filename = options?.filename ?? 'volume.nii.gz';
    const mimeType = options?.mimeType ?? 'application/gzip';
    const imageBlob = new Blob([compressedData], { type: mimeType });
    formData.append('file', imageBlob, filename);

    console.log('[MonaiLabelClient] Sending inference request with image data', {
      model,
      originalSize: imageData.byteLength,
      compressedSize: compressedData.byteLength,
      filename,
      mimeType,
      nninter: fullParams.nninter,
    });

    try {
      const response = await fetch(`${this.serverUrl}/infer/${encodeURIComponent(model)}?output=all`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Inference failed: ${response.status} ${response.statusText}`);
      }

      return await this.parseMultipartResponse(response);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Inference failed')) {
        throw error;
      }
      throw new Error(`Inference failed: ${error}`);
    }
  }

  /**
   * Run inference with a 2D image file (JPEG, PNG, etc.)
   * The server will handle the image directly without NIfTI conversion
   */
  async infer2D(
    model: string,
    imageData: ArrayBuffer,
    format: 'jpeg' | 'png' | 'bmp' | 'tiff',
    params: InferenceParams = {}
  ): Promise<InferenceResult> {
    const mimeTypes: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
    };
    const extensions: Record<string, string> = {
      jpeg: '.jpg',
      png: '.png',
      bmp: '.bmp',
      tiff: '.tiff',
    };

    return this.infer(model, imageData, params, {
      filename: `image${extensions[format]}`,
      mimeType: mimeTypes[format],
    });
  }

  /**
   * Run inference using prompts only (no image data)
   * Use this after an image has been initialized with nninter="init"
   * The server uses its cached image data for subsequent prompt refinements
   *
   * @param model - Model name (should be same as used for init)
   * @param params - Inference parameters including prompts and nninter="sam3"
   * @returns Inference result with mask and metadata
   */
  async inferWithPromptsOnly(
    model: string,
    params: InferenceParams
  ): Promise<InferenceResult> {
    const formData = new FormData();

    // Ensure nninter is set to use cached image
    const fullParams: InferenceParams = {
      ...params,
      nninter: params.nninter ?? 'sam3',
      result_extension: params.result_extension ?? '.nrrd',
      result_dtype: params.result_dtype ?? 'uint16',
      result_compress: params.result_compress ?? false,
      restore_label_idx: params.restore_label_idx ?? false,
    };
    formData.append('params', JSON.stringify(fullParams));

    // NOTE: No 'file' field - server uses cached image from init request

    console.log('[MonaiLabelClient] Sending prompts-only request (no image)', {
      model,
      nninter: fullParams.nninter,
      hasPoints: !!(fullParams.pos_points?.length || fullParams.neg_points?.length),
      hasBoxes: !!(fullParams.pos_boxes?.length || fullParams.neg_boxes?.length),
      hasScribbles: !!(fullParams.pos_scribbles?.length || fullParams.neg_scribbles?.length),
    });

    try {
      const response = await fetch(`${this.serverUrl}/infer/${encodeURIComponent(model)}?output=all`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Inference failed: ${response.status} ${response.statusText}`);
      }

      return await this.parseMultipartResponse(response);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Inference failed')) {
        throw error;
      }
      throw new Error(`Inference failed: ${error}`);
    }
  }

  /**
   * Create a server session with the image data
   * Returns session_id that can be used for subsequent inference requests
   */
  async createSession(imageData: ArrayBuffer, expiry: number = 3600): Promise<SessionInfo> {
    const formData = new FormData();

    // Compress image data with gzip for efficient transfer
    const compressedData = await compressGzip(imageData);
    const imageBlob = new Blob([compressedData], { type: 'application/gzip' });
    // Server expects 'files' (plural) field name
    formData.append('files', imageBlob, 'image.nii.gz');
    formData.append('expiry', expiry.toString());

    console.log('[DEBUG:MonaiLabelClient] Creating session', {
      originalSize: imageData.byteLength,
      compressedSize: compressedData.byteLength,
      expiry,
      serverUrl: this.serverUrl,
    });

    const url = `${this.serverUrl}/session/`;
    console.log('[DEBUG:MonaiLabelClient] PUT', url);

    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: formData,
      });

      console.log('[DEBUG:MonaiLabelClient] Session response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error body');
        console.error('[DEBUG:MonaiLabelClient] Session creation failed:', errorText);
        throw new Error(`Failed to create session: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[DEBUG:MonaiLabelClient] Session created successfully:', JSON.stringify(result));
      return {
        session_id: result.session_id,
        expiry: result.session_info?.expiry || expiry,
        image_path: result.session_info?.image,
      };
    } catch (error) {
      console.error('[DEBUG:MonaiLabelClient] Session creation exception:', error);
      throw error;
    }
  }

  /**
   * Delete a server session
   */
  async deleteSession(sessionId: string): Promise<void> {
    console.log('[MonaiLabelClient] Deleting session:', sessionId);
    try {
      await fetch(`${this.serverUrl}/session/${sessionId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.warn('[MonaiLabelClient] Session delete failed:', error);
    }
  }

  /**
   * Run inference using a session ID (no image upload needed)
   * Use this after creating a session with createSession()
   */
  async inferWithSession(
    model: string,
    sessionId: string,
    params: InferenceParams
  ): Promise<InferenceResult> {
    const formData = new FormData();

    const fullParams: InferenceParams = {
      ...params,
      nninter: params.nninter ?? 'sam3',
      result_extension: params.result_extension ?? '.nrrd',
      result_dtype: params.result_dtype ?? 'uint16',
      result_compress: params.result_compress ?? false,
      restore_label_idx: params.restore_label_idx ?? false,
    };
    formData.append('params', JSON.stringify(fullParams));

    console.log('[DEBUG:MonaiLabelClient] Inference with session:', {
      model,
      sessionId,
      nninter: fullParams.nninter,
      hasPoints: !!(fullParams.pos_points?.length || fullParams.neg_points?.length),
      hasBoxes: !!(fullParams.pos_boxes?.length || fullParams.neg_boxes?.length),
      hasScribbles: !!(fullParams.pos_scribbles?.length || fullParams.neg_scribbles?.length),
      hasLassos: !!(fullParams.pos_lassos?.length || fullParams.neg_lassos?.length),
    });
    console.log('[DEBUG:MonaiLabelClient] Full params:', JSON.stringify(fullParams));

    const url = `${this.serverUrl}/infer/${encodeURIComponent(model)}?output=all&session_id=${encodeURIComponent(sessionId)}`;
    console.log('[DEBUG:MonaiLabelClient] POST', url);

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      const elapsed = Date.now() - startTime;
      console.log(`[DEBUG:MonaiLabelClient] Inference response: ${response.status} ${response.statusText} (${elapsed}ms)`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error body');
        console.error('[DEBUG:MonaiLabelClient] Inference failed:', errorText);
        throw new Error(`Inference failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      console.log('[DEBUG:MonaiLabelClient] Parsing multipart response...');
      const result = await this.parseMultipartResponse(response);
      console.log('[DEBUG:MonaiLabelClient] Response parsed, mask size:', result.mask.byteLength);
      return result;
    } catch (error) {
      console.error('[DEBUG:MonaiLabelClient] Inference exception:', error);
      throw error;
    }
  }

  /**
   * Reset server session cache for a model
   * Call this when switching images or models
   */
  async resetSession(model: string): Promise<void> {
    const formData = new FormData();
    formData.append('params', JSON.stringify({ nninter: 'reset' }));

    console.log('[MonaiLabelClient] Resetting server session for model:', model);

    try {
      const response = await fetch(`${this.serverUrl}/infer/${encodeURIComponent(model)}?output=all`, {
        method: 'POST',
        body: formData,
      });

      // Reset may return various status codes, we just want to clear the cache
      if (!response.ok && response.status !== 400) {
        console.warn('[MonaiLabelClient] Session reset returned:', response.status);
      }
    } catch (error) {
      // Session reset failure is not critical, log and continue
      console.warn('[MonaiLabelClient] Session reset failed:', error);
    }
  }

  /**
   * Parse multipart response containing JSON metadata and binary mask data
   * Uses binary-safe parsing to avoid corrupting gzip-compressed data
   */
  private async parseMultipartResponse(response: Response): Promise<InferenceResult> {
    const contentType = response.headers.get('Content-Type') || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);

    if (!boundaryMatch) {
      // Fallback: assume single binary response
      const mask = await response.arrayBuffer();
      return { mask, metadata: {} };
    }

    const boundary = boundaryMatch[1].trim();
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    console.log('[MonaiLabelClient] Parsing multipart response:', {
      totalSize: buffer.byteLength,
      boundary,
    });

    // Binary-safe multipart parsing
    const boundaryBytes = this.stringToUint8Array('--' + boundary);
    const crlfcrlf = this.stringToUint8Array('\r\n\r\n');
    const crlf = this.stringToUint8Array('\r\n');

    let metadata: InferenceMetadata = {};
    let maskData: ArrayBuffer | null = null;
    let partCount = 0;

    let pos = 0;
    while (pos < uint8Array.length) {
      // Find next boundary
      const boundaryPos = this.indexOfBytes(uint8Array, boundaryBytes, pos);
      if (boundaryPos === -1) break;

      // Find end of boundary line
      const lineEndPos = this.indexOfBytes(uint8Array, crlf, boundaryPos);
      if (lineEndPos === -1) break;

      // Check if this is the ending boundary (--boundary--)
      const afterBoundary = uint8Array.slice(boundaryPos + boundaryBytes.length, boundaryPos + boundaryBytes.length + 2);
      if (afterBoundary[0] === 0x2d && afterBoundary[1] === 0x2d) {
        break; // End of multipart
      }

      // Find end of headers (\r\n\r\n)
      const headerEndPos = this.indexOfBytes(uint8Array, crlfcrlf, lineEndPos);
      if (headerEndPos === -1) break;

      // Extract headers as text (headers are ASCII-safe)
      const headersBytes = uint8Array.slice(lineEndPos + 2, headerEndPos);
      const headers = new TextDecoder('utf-8').decode(headersBytes);

      // Body starts after \r\n\r\n
      const bodyStart = headerEndPos + 4;

      // Find next boundary to determine body end
      const nextBoundaryPos = this.indexOfBytes(uint8Array, boundaryBytes, bodyStart);
      // Body ends 2 bytes before next boundary (for \r\n)
      const bodyEnd = nextBoundaryPos !== -1 ? nextBoundaryPos - 2 : uint8Array.length;

      const body = buffer.slice(bodyStart, bodyEnd);
      partCount++;

      console.log(`[MonaiLabelClient] Part ${partCount}:`, {
        headers: headers.substring(0, 200),
        bodySize: body.byteLength,
        bodyStart,
        bodyEnd,
      });

      // Check if this is JSON part
      if (headers.includes('application/json') || headers.includes('name="result"')) {
        try {
          const jsonStr = new TextDecoder('utf-8').decode(new Uint8Array(body));
          metadata = JSON.parse(jsonStr);
          console.log('[MonaiLabelClient] Parsed JSON metadata');
        } catch (e) {
          console.error('[MonaiLabelClient] JSON parse failed:', e);
        }
      }
      // Check if this is binary part (mask data)
      else if (headers.includes('filename=') || headers.includes('application/gzip') || headers.includes('application/octet-stream')) {
        maskData = body;
        console.log('[MonaiLabelClient] Found binary mask data:', body.byteLength, 'bytes');
      }

      pos = bodyEnd + 2;
    }

    // Use extracted mask or fallback to entire buffer
    const mask = maskData || buffer;

    console.log('[MonaiLabelClient] Parsed multipart response:', {
      partCount,
      metadataKeys: Object.keys(metadata),
      maskSize: mask.byteLength,
      isGzip: new Uint8Array(mask)[0] === 0x1f && new Uint8Array(mask)[1] === 0x8b,
      maskDataFound: maskData !== null,
    });

    return { mask, metadata };
  }

  /**
   * Convert string to Uint8Array
   */
  private stringToUint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
  }

  /**
   * Find byte sequence in Uint8Array (like indexOf for bytes)
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
}

export default MonaiLabelClient;
