/**
 * InferenceService - Orchestrates the segmentation inference workflow
 * Connects MonaiLabelClient with viewer state and segmentation management
 *
 * Supports session-aware inference to avoid re-sending full images:
 * - First request with new image uses nninter="init" and sends full image
 * - Subsequent requests use nninter="sam3" and send only prompts
 */

import { MonaiLabelClient, InferenceParams, InferenceResult } from './MonaiLabelClient';
import { LoadedImage } from '../loaders/types';
import { SessionManager, computeImageHash, getSessionManager } from './SessionManager';

export interface InferenceOptions {
  model: string;
  params?: InferenceParams;
  // Point prompts for SmartEdit (interactive segmentation)
  posPoints?: number[][];  // Positive points (include regions)
  negPoints?: number[][];  // Negative points (exclude regions)
  // Box prompts for nninteractive
  posBoxes?: number[][][]; // [[[x_min, y_min, z], [x_max, y_max, z]], ...]
  negBoxes?: number[][][];
  // Scribble prompts for nninteractive (open freehand strokes)
  posScribbles?: number[][][];
  negScribbles?: number[][][];
  // Lasso prompts for nninteractive (closed freehand contours)
  posLassos?: number[][][];
  negLassos?: number[][][];
  // nninteractive control mode (if not provided, auto-determined by session state)
  nninter?: 'init' | 'sam3' | 'reset';
  // Force re-initialization even if session exists
  forceInit?: boolean;
}

export interface SegmentationResult {
  segmentationId: string;
  volumeId: string;
  labelData: ArrayBuffer;
  labels: { index: number; name: string; color: string }[];
  centroids?: Record<number, number[]>;
}

// Default colors for segmentation labels
const DEFAULT_COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#ff8000', '#8000ff', '#0080ff', '#ff0080', '#80ff00', '#00ff80',
  '#ff4040', '#40ff40', '#4040ff', '#ffff40', '#ff40ff', '#40ffff',
];

/**
 * Convert grayscale pixel data to PNG format for 2D image inference
 * This is used to send 2D images to the server in a standard format
 */
export async function convertToPngBytes(image: LoadedImage): Promise<ArrayBuffer> {
  const { metadata, pixelData } = image;
  const { width, height } = metadata;

  // Create a canvas to encode the image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  // Create ImageData from grayscale pixel data
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const srcData = new Uint8Array(pixelData);

  for (let i = 0; i < width * height; i++) {
    const gray = srcData[i];
    data[i * 4] = gray;     // R
    data[i * 4 + 1] = gray; // G
    data[i * 4 + 2] = gray; // B
    data[i * 4 + 3] = 255;  // A
  }

  ctx.putImageData(imageData, 0, 0);

  // Convert to PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          blob.arrayBuffer().then(resolve).catch(reject);
        } else {
          reject(new Error('Failed to create PNG blob'));
        }
      },
      'image/png'
    );
  });
}

/**
 * Convert LoadedImage to NIfTI format for sending to MONAI Label
 * This creates a simple NIfTI-1 format file
 */
export function convertToNiftiBytes(image: LoadedImage): ArrayBuffer {
  const { metadata, pixelData } = image;

  // NIfTI-1 header is 348 bytes, but for single-file .nii format,
  // vox_offset must be at least 352 (348 header + 4 byte extension)
  const headerSize = 352;
  const totalSize = headerSize + pixelData.byteLength;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // sizeof_hdr (int32) - must be 348 for NIfTI-1
  view.setInt32(0, 348, true);

  // data_type (10 bytes) - unused in NIfTI-1
  // db_name (18 bytes) - unused in NIfTI-1

  // extents (int32) at offset 32 - unused
  // session_error (int16) at offset 36 - unused
  // regular (char) at offset 38 - unused
  // dim_info (char) at offset 39 - unused

  // dim[0-7] (8 x int16) at offset 40
  view.setInt16(40, 3, true); // ndim = 3
  view.setInt16(42, metadata.width, true);   // dim[1]
  view.setInt16(44, metadata.height, true);  // dim[2]
  view.setInt16(46, metadata.depth, true);   // dim[3]
  view.setInt16(48, 1, true); // dim[4]
  view.setInt16(50, 1, true); // dim[5]
  view.setInt16(52, 1, true); // dim[6]
  view.setInt16(54, 1, true); // dim[7]

  // intent_p1, intent_p2, intent_p3 (3 x float32) at offset 56-64 - unused
  // intent_code (int16) at offset 68 - unused

  // datatype (int16) at offset 70
  const datatype = getDataTypeCode(metadata.dataType);
  view.setInt16(70, datatype, true);

  // bitpix (int16) at offset 72
  const bitpix = getBitpix(metadata.dataType);
  view.setInt16(72, bitpix, true);

  // slice_start (int16) at offset 74 - unused

  // pixdim[0-7] (8 x float32) at offset 76
  view.setFloat32(76, 1.0, true);  // qfac
  view.setFloat32(80, metadata.spacingX, true);   // pixdim[1]
  view.setFloat32(84, metadata.spacingY, true);   // pixdim[2]
  view.setFloat32(88, metadata.spacingZ, true);   // pixdim[3]
  view.setFloat32(92, 1.0, true);  // pixdim[4]
  view.setFloat32(96, 1.0, true);  // pixdim[5]
  view.setFloat32(100, 1.0, true); // pixdim[6]
  view.setFloat32(104, 1.0, true); // pixdim[7]

  // vox_offset (float32) at offset 108 - data starts at byte 352 for single-file NIfTI
  view.setFloat32(108, 352, true);

  // scl_slope (float32) at offset 112
  view.setFloat32(112, 1.0, true);

  // scl_inter (float32) at offset 116
  view.setFloat32(116, 0.0, true);

  // slice_end (int16) at offset 120 - unused
  // slice_code (char) at offset 122 - unused
  // xyzt_units (char) at offset 123
  view.setUint8(123, 2); // NIFTI_UNITS_MM

  // cal_max (float32) at offset 124 - unused
  // cal_min (float32) at offset 128 - unused
  // slice_duration (float32) at offset 132 - unused
  // toffset (float32) at offset 136 - unused
  // glmax (int32) at offset 140 - deprecated
  // glmin (int32) at offset 144 - deprecated

  // descrip (80 chars) at offset 148 - optional description
  const descrip = 'MedAI Viewer Export';
  for (let i = 0; i < descrip.length && i < 80; i++) {
    view.setUint8(148 + i, descrip.charCodeAt(i));
  }

  // aux_file (24 chars) at offset 228 - unused

  // qform_code (int16) at offset 252
  view.setInt16(252, 1, true); // NIFTI_XFORM_SCANNER_ANAT

  // sform_code (int16) at offset 254
  view.setInt16(254, 1, true); // NIFTI_XFORM_SCANNER_ANAT

  // quatern_b, quatern_c, quatern_d (3 x float32) at offset 256-264
  // qoffset_x, qoffset_y, qoffset_z (3 x float32) at offset 268-276
  view.setFloat32(268, metadata.originX, true);
  view.setFloat32(272, metadata.originY, true);
  view.setFloat32(276, metadata.originZ, true);

  // srow_x, srow_y, srow_z (3 x 4 x float32) at offset 280-324
  // Use direction matrix with spacing
  const dir = metadata.direction;
  view.setFloat32(280, dir[0] * metadata.spacingX, true);
  view.setFloat32(284, dir[1] * metadata.spacingY, true);
  view.setFloat32(288, dir[2] * metadata.spacingZ, true);
  view.setFloat32(292, metadata.originX, true);

  view.setFloat32(296, dir[3] * metadata.spacingX, true);
  view.setFloat32(300, dir[4] * metadata.spacingY, true);
  view.setFloat32(304, dir[5] * metadata.spacingZ, true);
  view.setFloat32(308, metadata.originY, true);

  view.setFloat32(312, dir[6] * metadata.spacingX, true);
  view.setFloat32(316, dir[7] * metadata.spacingY, true);
  view.setFloat32(320, dir[8] * metadata.spacingZ, true);
  view.setFloat32(324, metadata.originZ, true);

  // intent_name (16 chars) at offset 328 - unused

  // magic (4 chars) at offset 344 - "n+1\0" for single-file NIfTI
  view.setUint8(344, 110); // 'n'
  view.setUint8(345, 43);  // '+'
  view.setUint8(346, 49);  // '1'
  view.setUint8(347, 0);   // null

  // Extension indicator (4 bytes at offset 348) - 0 means no extensions
  view.setUint8(348, 0);
  view.setUint8(349, 0);
  view.setUint8(350, 0);
  view.setUint8(351, 0);

  // Copy pixel data
  const pixelDataView = new Uint8Array(pixelData);
  const bufferView = new Uint8Array(buffer);
  bufferView.set(pixelDataView, headerSize);

  return buffer;
}

function getDataTypeCode(dataType: string): number {
  switch (dataType) {
    case 'uint8': return 2;    // DT_UNSIGNED_CHAR
    case 'int16': return 4;    // DT_SIGNED_SHORT
    case 'int32': return 8;    // DT_SIGNED_INT
    case 'float32': return 16; // DT_FLOAT
    case 'float64': return 64; // DT_DOUBLE
    case 'int8': return 256;   // DT_INT8
    case 'uint16': return 512; // DT_UINT16
    case 'uint32': return 768; // DT_UINT32
    default: return 16;        // Default to float
  }
}

function getBitpix(dataType: string): number {
  switch (dataType) {
    case 'uint8':
    case 'int8':
      return 8;
    case 'int16':
    case 'uint16':
      return 16;
    case 'int32':
    case 'uint32':
    case 'float32':
      return 32;
    case 'float64':
      return 64;
    default:
      return 32;
  }
}

/**
 * Run inference on an image using MONAI Label
 * Uses session-aware logic to avoid re-sending full images for subsequent prompts
 */
export async function runInference(
  client: MonaiLabelClient,
  image: LoadedImage,
  options: InferenceOptions
): Promise<SegmentationResult> {
  const {
    model,
    params = {},
    posPoints,
    negPoints,
    posBoxes,
    negBoxes,
    posScribbles,
    negScribbles,
    posLassos,
    negLassos,
    nninter,
    forceInit = false,
  } = options;

  // Compute image hash for session tracking
  const imageHash = computeImageHash(image);
  const sessionManager = getSessionManager();

  // Detect if this is an nninteractive/SAM request (supports session caching)
  // Can be detected by model name OR by params containing nninter/medsam2
  const isNnInteractive = model.toLowerCase().includes('nninter') ||
    params.nninter !== undefined ||
    params.medsam2 !== undefined;

  // Detect if this is a 2D image (single slice)
  const is2DImage = image.metadata.dimensionality === '2D' || image.metadata.depth <= 1;

  // Build inference params, including all prompt types
  const inferenceParams: InferenceParams = { ...params };

  // Point prompts (SAM and nninteractive)
  if (posPoints && posPoints.length > 0) {
    inferenceParams.pos_points = posPoints;
    console.log('[InferenceService] Using positive points:', posPoints);
  }

  if (negPoints && negPoints.length > 0) {
    inferenceParams.neg_points = negPoints;
    console.log('[InferenceService] Using negative points:', negPoints);
  }

  // Box prompts (nninteractive only)
  if (posBoxes && posBoxes.length > 0) {
    inferenceParams.pos_boxes = posBoxes;
    console.log('[InferenceService] Using positive boxes:', posBoxes);
  }

  if (negBoxes && negBoxes.length > 0) {
    inferenceParams.neg_boxes = negBoxes;
    console.log('[InferenceService] Using negative boxes:', negBoxes);
  }

  // Scribble prompts (nninteractive only)
  if (posScribbles && posScribbles.length > 0) {
    inferenceParams.pos_scribbles = posScribbles;
    console.log('[InferenceService] Using positive scribbles:', posScribbles);
  }

  if (negScribbles && negScribbles.length > 0) {
    inferenceParams.neg_scribbles = negScribbles;
    console.log('[InferenceService] Using negative scribbles:', negScribbles);
  }

  // Lasso prompts (nninteractive only - closed freehand contours)
  if (posLassos && posLassos.length > 0) {
    inferenceParams.pos_lassos = posLassos;
    console.log('[InferenceService] Using positive lassos:', posLassos);
  }

  if (negLassos && negLassos.length > 0) {
    inferenceParams.neg_lassos = negLassos;
    console.log('[InferenceService] Using negative lassos:', negLassos);
  }

  let result: InferenceResult;

  console.log('[DEBUG:InferenceService] Starting inference', {
    model,
    isNnInteractive,
    is2DImage,
    nninter,
    forceInit,
    imageHash,
    hasParams: Object.keys(params).length > 0,
  });

  // Special handling for 2D images with nninteractive/SAM3
  // 2D images use the same session-based init/sam3 pattern as 3D
  // but send image as PNG directly - backend routes to SAM3 2D processor
  if (is2DImage && isNnInteractive) {
    console.log('[InferenceService] 2D image detected - using SAM3 2D inference via PNG');

    // Convert to PNG for 2D images - backend routes to SAM3 2D processor
    const pngData = await convertToPngBytes(image);
    console.log('[InferenceService] 2D PNG data size:', pngData.byteLength, 'bytes');

    // Check if session is already initialized (same logic as 3D)
    const isSessionInitialized = sessionManager.isInitialized(imageHash, model);
    const paramsNninter = params.nninter;
    const needsInit = forceInit ||
      nninter === 'init' ||
      paramsNninter === 'init' ||
      (!isSessionInitialized && paramsNninter !== 'sam3');

    console.log('[InferenceService] 2D session state:', {
      isSessionInitialized,
      needsInit,
      nninter,
      paramsNninter,
      forceInit,
    });

    if (needsInit) {
      // First call: init to set the image
      console.log('[InferenceService] 2D Step 1: Initializing SAM3 2D session...');
      const initParams: InferenceParams = {
        nninter: 'init',
      };
      await client.infer2D(model, pngData, 'png', initParams);
      console.log('[InferenceService] 2D session initialized');

      // Mark session as initialized (so subsequent calls skip init)
      sessionManager.markInitialized(imageHash, model);
    } else {
      console.log('[InferenceService] 2D session already initialized, skipping init');
    }

    // Second call: sam3 with prompts (always needed)
    console.log('[InferenceService] 2D Step 2: Running SAM3 2D inference with prompts...');
    inferenceParams.nninter = 'sam3';
    result = await client.infer2D(model, pngData, 'png', inferenceParams);
    console.log('[InferenceService] 2D SAM3 inference complete, mask size:', result.mask.byteLength);
  }
  // Determine nninter mode based on session state for 3D images
  else if (isNnInteractive) {
    // Handle explicit nninter mode
    if (nninter === 'reset') {
      // Reset session and clear client cache
      console.log('[DEBUG:InferenceService] Resetting session for model:', model);
      await client.resetSession(model);
      sessionManager.clearSession(imageHash, model);
      console.log('[DEBUG:InferenceService] Session reset complete');
      // After reset, we need to re-init, so continue with init flow
    }

    // Determine if we should use cached image or send full image
    // Check both explicit nninter option AND params.nninter
    // 'init' forces initialization, 'sam3' uses existing session
    // If not specified, check session state to decide
    const paramsNninter = params.nninter;
    const isSessionInitialized = sessionManager.isInitialized(imageHash, model);
    const needsInit = forceInit ||
      nninter === 'init' ||
      paramsNninter === 'init' ||
      // If no nninter specified and session not initialized, we need to init
      (!isSessionInitialized && paramsNninter !== 'sam3');

    console.log('[DEBUG:InferenceService] Session state check:', {
      isSessionInitialized,
      needsInit,
      nninter,
      paramsNninter,
      forceInit,
    });

    if (needsInit) {
      // First request: need to initialize session THEN run inference with prompts
      // Server behavior: when nninter="init", it only initializes and returns without processing prompts
      // So we need TWO calls:
      // 1. nninter="init" to initialize the session
      // 2. nninter="sam3" to actually process the prompts

      console.log('[DEBUG:InferenceService] First request - need to initialize session first');
      console.log('[DEBUG:InferenceService] Image hash:', imageHash);
      console.log('[DEBUG:InferenceService] Image metadata:', {
        width: image.metadata.width,
        height: image.metadata.height,
        depth: image.metadata.depth,
        dataType: image.metadata.dataType,
        spacingX: image.metadata.spacingX,
        spacingY: image.metadata.spacingY,
        spacingZ: image.metadata.spacingZ,
      });

      console.log('[DEBUG:InferenceService] Converting to NIfTI...');
      const niftiData = convertToNiftiBytes(image);
      console.log('[DEBUG:InferenceService] NIfTI data size:', niftiData.byteLength, 'bytes');

      // Create session first to cache image on server
      let serverSessionId: string | undefined;
      try {
        console.log('[DEBUG:InferenceService] Creating session on server...');
        const sessionInfo = await client.createSession(niftiData, 3600); // 1 hour expiry
        serverSessionId = sessionInfo.session_id;
        console.log('[DEBUG:InferenceService] Session created successfully:', serverSessionId);

        // Step 1: Initialize nnInteractive session (server returns early without processing prompts)
        // IMPORTANT: Server only initializes when seriesInstanceUID is provided and different from cached
        // We use the image hash as a unique identifier for NIfTI files
        console.log('[DEBUG:InferenceService] Step 1: Initializing nnInteractive session...');
        const initParams: InferenceParams = {
          nninter: 'init',
          seriesInstanceUID: imageHash, // Required for server to call session.set_image()
        };
        await client.inferWithSession(model, serverSessionId, initParams);
        console.log('[DEBUG:InferenceService] Session initialization complete');

        // Step 2: Now send actual prompts with nninter="sam3"
        console.log('[DEBUG:InferenceService] Step 2: Running inference with prompts...');
        inferenceParams.nninter = 'sam3';
        console.log('[DEBUG:InferenceService] Params:', JSON.stringify(inferenceParams));
        result = await client.inferWithSession(model, serverSessionId, inferenceParams);
        console.log('[DEBUG:InferenceService] inferWithSession completed');
      } catch (sessionError) {
        // Fallback to sending image with request if session creation fails
        console.warn('[DEBUG:InferenceService] Session creation failed, falling back to direct inference:', sessionError);
        console.log('[DEBUG:InferenceService] Running direct infer with image...');
        // For fallback, we need to try init then sam3 with image
        const initParams: InferenceParams = {
          nninter: 'init',
          seriesInstanceUID: imageHash,
        };
        await client.infer(model, niftiData, initParams);
        inferenceParams.nninter = 'sam3';
        result = await client.infer(model, niftiData, inferenceParams);
        console.log('[DEBUG:InferenceService] Direct inference completed');
      }

      // Mark session as initialized after successful inference
      sessionManager.markInitialized(imageHash, model, serverSessionId);
      console.log('[DEBUG:InferenceService] Session initialized for model:', model, serverSessionId ? `sessionId=${serverSessionId}` : '');
    } else {
      // Session exists: use cached session for fast inference
      const serverSessionId = sessionManager.getServerSessionId(imageHash, model);

      // IMPORTANT: Use 'sam3' for subsequent requests (not 'init')
      // 'sam3' tells server to use existing nnInteractive session
      inferenceParams.nninter = 'sam3';

      console.log('[InferenceService] Using cached session - fast inference');
      console.log('[InferenceService] Image hash:', imageHash);
      console.log('[InferenceService] Server session ID:', serverSessionId);
      console.log('[InferenceService] Params:', inferenceParams);

      if (serverSessionId) {
        // Use session ID for fast inference (no image upload)
        result = await client.inferWithSession(model, serverSessionId, inferenceParams);
      } else {
        // Fallback: no session ID available, need to re-send image
        console.warn('[InferenceService] No session ID available, re-sending image');
        const niftiData = convertToNiftiBytes(image);
        result = await client.infer(model, niftiData, inferenceParams);
      }
      console.log('[InferenceService] Session-based inference complete');
    }
  } else {
    // Non-nninteractive models: always send full image
    console.log('[InferenceService] Non-nninteractive model - sending full image');
    console.log('[InferenceService] Params:', inferenceParams);

    // For 2D images, send in PNG format (faster, no NIfTI conversion needed)
    if (is2DImage) {
      console.log('[InferenceService] 2D image - sending as PNG');
      const pngData = await convertToPngBytes(image);
      console.log('[InferenceService] PNG data size:', pngData.byteLength);
      result = await client.infer2D(model, pngData, 'png', inferenceParams);
    } else {
      // 3D volume - send as NIfTI
      const niftiData = convertToNiftiBytes(image);
      console.log('[InferenceService] NIfTI data size:', niftiData.byteLength);
      result = await client.infer(model, niftiData, inferenceParams);
    }
  }

  console.log('[InferenceService] Inference complete, mask size:', result.mask.byteLength);

  // Generate segmentation ID
  const segmentationId = `seg-${Date.now()}`;
  const volumeId = `segVolume:${segmentationId}`;

  // Parse labels from metadata
  const labels = parseLabels(result.metadata);
  console.log('[InferenceService] Parsed labels:', labels);

  return {
    segmentationId,
    volumeId,
    labelData: result.mask,
    labels,
    centroids: result.metadata.centroids,
  };
}

/**
 * Reset session for a specific image/model combination
 * Call this when switching images or when user wants to start fresh
 */
export async function resetInferenceSession(
  client: MonaiLabelClient,
  image: LoadedImage,
  model: string
): Promise<void> {
  const imageHash = computeImageHash(image);
  const sessionManager = getSessionManager();

  await client.resetSession(model);
  sessionManager.clearSession(imageHash, model);

  console.log('[InferenceService] Session reset for:', model, 'image:', imageHash);
}

/**
 * Clear all inference sessions
 * Call this on disconnect or when user loads a new study
 */
export function clearAllInferenceSessions(): void {
  const sessionManager = getSessionManager();
  sessionManager.clearAllSessions();
  console.log('[InferenceService] All sessions cleared');
}

/**
 * Pre-initialize nnInteractive session by uploading image to server
 * Call this when SmartEdit tab is activated to avoid long wait on first prompt
 * Only applicable for nnInteractive models (SAM models don't have server-side sessions)
 */
export async function preInitializeSession(
  client: MonaiLabelClient,
  image: LoadedImage,
  model: string
): Promise<boolean> {
  // Skip session pre-initialization for 2D images
  // 2D images use direct inference without session caching
  const is2DImage = image.metadata.dimensionality === '2D' || image.metadata.depth <= 1;
  if (is2DImage) {
    console.log('[InferenceService] Skipping session pre-init for 2D image');
    // Mark session as initialized in SessionManager so UI shows correct state
    const sessionManager = getSessionManager();
    const imageHash = computeImageHash(image);
    sessionManager.markInitialized(imageHash, model);
    return true;
  }

  const sessionManager = getSessionManager();
  const imageHash = computeImageHash(image);

  // Check if session already initialized
  if (sessionManager.isInitialized(imageHash, model)) {
    console.log('[InferenceService] Session already initialized for:', model);
    return true;
  }

  console.log('[InferenceService] Pre-initializing session for model:', model);
  console.log('[InferenceService] Image hash:', imageHash);
  console.log('[InferenceService] Image dimensions:', {
    width: image.metadata.width,
    height: image.metadata.height,
    depth: image.metadata.depth,
  });

  try {
    // Convert image to NIfTI
    const niftiData = convertToNiftiBytes(image);
    console.log('[InferenceService] NIfTI data size:', niftiData.byteLength, 'bytes');

    // Create session on server
    console.log('[InferenceService] Creating session on server...');
    const sessionInfo = await client.createSession(niftiData, 3600); // 1 hour expiry
    const serverSessionId = sessionInfo.session_id;
    console.log('[InferenceService] Session created:', serverSessionId);

    // Initialize nnInteractive session
    // Include timestamp in seriesInstanceUID to force server to refresh image cache
    // This works around a server-side issue where stale images can persist
    const uniqueSeriesUID = `${imageHash}-${Date.now()}`;
    console.log('[InferenceService] Initializing nnInteractive session with UID:', uniqueSeriesUID);
    const initParams = {
      nninter: 'init' as const,
      seriesInstanceUID: uniqueSeriesUID,
    };
    await client.inferWithSession(model, serverSessionId, initParams);
    console.log('[InferenceService] nnInteractive session initialized');

    // Mark session as initialized
    sessionManager.markInitialized(imageHash, model, serverSessionId);
    console.log('[InferenceService] Session pre-initialization complete');

    return true;
  } catch (error) {
    console.error('[InferenceService] Pre-initialization failed:', error);
    return false;
  }
}

/**
 * Check if a session is already initialized for an image/model combination
 */
export function isSessionInitialized(image: LoadedImage, model: string): boolean {
  const sessionManager = getSessionManager();
  const imageHash = computeImageHash(image);
  return sessionManager.isInitialized(imageHash, model);
}

/**
 * Parse label information from inference metadata
 */
function parseLabels(metadata: Record<string, unknown>): { index: number; name: string; color: string }[] {
  const labels: { index: number; name: string; color: string }[] = [];

  // Try different metadata formats
  const labelNames = metadata.label_names as Record<number, string> | undefined;
  const labelsField = metadata.labels;

  if (labelNames) {
    // Format: { label_names: { 1: "spleen", 2: "liver" } }
    Object.entries(labelNames).forEach(([indexStr, name]) => {
      const index = parseInt(indexStr, 10);
      if (!isNaN(index) && index > 0) {
        labels.push({
          index,
          name: name || `Segment ${index}`,
          color: DEFAULT_COLORS[(index - 1) % DEFAULT_COLORS.length],
        });
      }
    });
  } else if (labelsField && typeof labelsField === 'object' && !Array.isArray(labelsField)) {
    // Format: { labels: { "tumor": 1, "liver": 2 } } - name to index mapping
    Object.entries(labelsField as Record<string, number>).forEach(([name, index]) => {
      if (typeof index === 'number' && index > 0) {
        labels.push({
          index,
          name,
          color: DEFAULT_COLORS[(index - 1) % DEFAULT_COLORS.length],
        });
      }
    });
  } else if (Array.isArray(labelsField)) {
    // Format: { labels: [1, 2, 3] }
    (labelsField as number[]).forEach((index) => {
      if (index > 0) {
        labels.push({
          index,
          name: `Segment ${index}`,
          color: DEFAULT_COLORS[(index - 1) % DEFAULT_COLORS.length],
        });
      }
    });
  } else {
    // Default: assume at least one label
    labels.push({
      index: 1,
      name: 'Segment 1',
      color: DEFAULT_COLORS[0],
    });
  }

  return labels;
}

export default {
  runInference,
  convertToNiftiBytes,
  resetInferenceSession,
  clearAllInferenceSessions,
};
