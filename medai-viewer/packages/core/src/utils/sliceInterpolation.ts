/**
 * Slice Interpolation Utilities
 *
 * Provides interpolation algorithms for segmentation masks between keyframe slices.
 * Supports morphological distance transform and linear interpolation methods.
 */

/**
 * Configuration for interpolation
 */
export interface InterpolationConfig {
  /** Interpolation method to use */
  method: 'morphological' | 'linear' | 'shape_based';
  /** Whether to smooth the result */
  smoothResult: boolean;
  /** Smoothing kernel size (odd number) */
  smoothingKernelSize: number;
  /** Threshold for binary output (0-1) */
  binaryThreshold: number;
}

/**
 * A keyframe slice with mask data
 */
export interface KeyframeSlice {
  /** Slice index in the volume */
  sliceIndex: number;
  /** Binary mask data (1 = inside, 0 = outside) */
  maskData: Uint8Array;
  /** Dimensions of the mask [width, height] */
  dimensions: [number, number];
}

/**
 * Result of interpolation
 */
export interface InterpolationResult {
  /** Slice index */
  sliceIndex: number;
  /** Interpolated mask data */
  maskData: Uint8Array;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether this was a keyframe (not interpolated) */
  isKeyframe: boolean;
}

/**
 * Default interpolation configuration
 */
export const DEFAULT_INTERPOLATION_CONFIG: InterpolationConfig = {
  method: 'morphological',
  smoothResult: true,
  smoothingKernelSize: 3,
  binaryThreshold: 0.5,
};

/**
 * Compute the signed distance transform of a binary mask.
 * Positive values are outside the mask, negative values are inside.
 *
 * Uses a simplified approximation based on chamfer distance.
 *
 * @param mask - Binary mask (1 = inside, 0 = outside)
 * @param width - Width of the mask
 * @param height - Height of the mask
 * @returns Signed distance transform array
 */
export function computeSignedDistanceTransform(
  mask: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const sdt = new Float32Array(width * height);
  const INF = width + height;

  // Initialize: inside = -INF, outside = +INF
  for (let i = 0; i < mask.length; i++) {
    sdt[i] = mask[i] > 0 ? -INF : INF;
  }

  // Forward pass (top-left to bottom-right)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Check neighbors: top, left, top-left, top-right
      if (y > 0) {
        const topIdx = (y - 1) * width + x;
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[topIdx] + 1);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[topIdx] - 1);
        }
      }
      if (x > 0) {
        const leftIdx = y * width + (x - 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[leftIdx] + 1);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[leftIdx] - 1);
        }
      }
      if (y > 0 && x > 0) {
        const topLeftIdx = (y - 1) * width + (x - 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[topLeftIdx] + 1.414);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[topLeftIdx] - 1.414);
        }
      }
      if (y > 0 && x < width - 1) {
        const topRightIdx = (y - 1) * width + (x + 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[topRightIdx] + 1.414);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[topRightIdx] - 1.414);
        }
      }
    }
  }

  // Backward pass (bottom-right to top-left)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;

      // Check neighbors: bottom, right, bottom-left, bottom-right
      if (y < height - 1) {
        const bottomIdx = (y + 1) * width + x;
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[bottomIdx] + 1);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[bottomIdx] - 1);
        }
      }
      if (x < width - 1) {
        const rightIdx = y * width + (x + 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[rightIdx] + 1);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[rightIdx] - 1);
        }
      }
      if (y < height - 1 && x > 0) {
        const bottomLeftIdx = (y + 1) * width + (x - 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[bottomLeftIdx] + 1.414);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[bottomLeftIdx] - 1.414);
        }
      }
      if (y < height - 1 && x < width - 1) {
        const bottomRightIdx = (y + 1) * width + (x + 1);
        if (sdt[idx] > 0) {
          sdt[idx] = Math.min(sdt[idx], sdt[bottomRightIdx] + 1.414);
        } else {
          sdt[idx] = Math.max(sdt[idx], sdt[bottomRightIdx] - 1.414);
        }
      }
    }
  }

  return sdt;
}

/**
 * Interpolate between two signed distance transforms.
 *
 * @param sdt1 - First signed distance transform
 * @param sdt2 - Second signed distance transform
 * @param t - Interpolation parameter (0 = sdt1, 1 = sdt2)
 * @returns Interpolated signed distance transform
 */
export function interpolateSDT(
  sdt1: Float32Array,
  sdt2: Float32Array,
  t: number
): Float32Array {
  const result = new Float32Array(sdt1.length);

  for (let i = 0; i < sdt1.length; i++) {
    // Linear interpolation in SDT space
    result[i] = sdt1[i] * (1 - t) + sdt2[i] * t;
  }

  return result;
}

/**
 * Convert signed distance transform back to binary mask.
 *
 * @param sdt - Signed distance transform
 * @param threshold - Threshold for binarization (typically 0)
 * @returns Binary mask
 */
export function sdtToMask(sdt: Float32Array, threshold: number = 0): Uint8Array {
  const mask = new Uint8Array(sdt.length);

  for (let i = 0; i < sdt.length; i++) {
    mask[i] = sdt[i] <= threshold ? 1 : 0;
  }

  return mask;
}

/**
 * Apply Gaussian smoothing to a mask.
 *
 * @param mask - Input mask
 * @param width - Mask width
 * @param height - Mask height
 * @param kernelSize - Size of the smoothing kernel (odd number)
 * @param threshold - Threshold for re-binarization
 * @returns Smoothed mask
 */
export function smoothMask(
  mask: Uint8Array,
  width: number,
  height: number,
  kernelSize: number = 3,
  threshold: number = 0.5
): Uint8Array {
  const size = Math.max(3, kernelSize | 1); // Ensure odd
  const halfSize = Math.floor(size / 2);
  const sigma = size / 6;

  // Generate Gaussian kernel
  const kernel = new Float32Array(size * size);
  let kernelSum = 0;

  for (let ky = 0; ky < size; ky++) {
    for (let kx = 0; kx < size; kx++) {
      const dx = kx - halfSize;
      const dy = ky - halfSize;
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      kernel[ky * size + kx] = value;
      kernelSum += value;
    }
  }

  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  // Apply convolution
  const smoothed = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let ky = 0; ky < size; ky++) {
        for (let kx = 0; kx < size; kx++) {
          const px = x + kx - halfSize;
          const py = y + ky - halfSize;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            sum += mask[py * width + px] * kernel[ky * size + kx];
          }
        }
      }

      smoothed[y * width + x] = sum;
    }
  }

  // Re-binarize
  const result = new Uint8Array(width * height);
  for (let i = 0; i < smoothed.length; i++) {
    result[i] = smoothed[i] >= threshold ? 1 : 0;
  }

  return result;
}

/**
 * Interpolate masks between keyframe slices using morphological distance transform.
 *
 * This method:
 * 1. Computes signed distance transforms for each keyframe
 * 2. Linearly interpolates the SDTs for intermediate slices
 * 3. Converts back to binary masks
 *
 * @param keyframes - Array of keyframe slices (must be sorted by sliceIndex)
 * @param config - Interpolation configuration
 * @returns Array of interpolated results for all slices between keyframes
 */
export function interpolateMorphological(
  keyframes: KeyframeSlice[],
  config: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG
): InterpolationResult[] {
  if (keyframes.length < 2) {
    // Return keyframes as-is
    return keyframes.map((kf) => ({
      sliceIndex: kf.sliceIndex,
      maskData: kf.maskData,
      confidence: 1.0,
      isKeyframe: true,
    }));
  }

  // Sort keyframes by slice index
  const sorted = [...keyframes].sort((a, b) => a.sliceIndex - b.sliceIndex);
  const results: InterpolationResult[] = [];
  const [width, height] = sorted[0].dimensions;

  // Add first keyframe
  results.push({
    sliceIndex: sorted[0].sliceIndex,
    maskData: sorted[0].maskData,
    confidence: 1.0,
    isKeyframe: true,
  });

  // Interpolate between consecutive keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];

    // Compute SDTs for both keyframes
    const sdt1 = computeSignedDistanceTransform(kf1.maskData, width, height);
    const sdt2 = computeSignedDistanceTransform(kf2.maskData, width, height);

    // Interpolate for each slice between keyframes
    const sliceCount = kf2.sliceIndex - kf1.sliceIndex;

    for (let j = 1; j < sliceCount; j++) {
      const t = j / sliceCount;
      const sliceIndex = kf1.sliceIndex + j;

      // Interpolate SDTs
      const interpolatedSDT = interpolateSDT(sdt1, sdt2, t);

      // Convert back to mask
      let mask = sdtToMask(interpolatedSDT, 0);

      // Optionally smooth
      if (config.smoothResult) {
        mask = smoothMask(mask, width, height, config.smoothingKernelSize, config.binaryThreshold);
      }

      // Calculate confidence based on distance from keyframes
      // Confidence is higher closer to keyframes
      const confidence = Math.max(1 - t, t);

      results.push({
        sliceIndex,
        maskData: mask,
        confidence,
        isKeyframe: false,
      });
    }

    // Add next keyframe
    results.push({
      sliceIndex: kf2.sliceIndex,
      maskData: kf2.maskData,
      confidence: 1.0,
      isKeyframe: true,
    });
  }

  return results;
}

/**
 * Simple linear interpolation between masks.
 *
 * This method:
 * 1. Blends mask values directly
 * 2. Thresholds the result
 *
 * Fast but less accurate than morphological interpolation.
 *
 * @param keyframes - Array of keyframe slices
 * @param config - Interpolation configuration
 * @returns Array of interpolated results
 */
export function interpolateLinear(
  keyframes: KeyframeSlice[],
  config: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG
): InterpolationResult[] {
  if (keyframes.length < 2) {
    return keyframes.map((kf) => ({
      sliceIndex: kf.sliceIndex,
      maskData: kf.maskData,
      confidence: 1.0,
      isKeyframe: true,
    }));
  }

  const sorted = [...keyframes].sort((a, b) => a.sliceIndex - b.sliceIndex);
  const results: InterpolationResult[] = [];
  const [width, height] = sorted[0].dimensions;

  results.push({
    sliceIndex: sorted[0].sliceIndex,
    maskData: sorted[0].maskData,
    confidence: 1.0,
    isKeyframe: true,
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];
    const sliceCount = kf2.sliceIndex - kf1.sliceIndex;

    for (let j = 1; j < sliceCount; j++) {
      const t = j / sliceCount;
      const sliceIndex = kf1.sliceIndex + j;

      // Linear blend
      const mask = new Uint8Array(width * height);
      for (let k = 0; k < mask.length; k++) {
        const blended = kf1.maskData[k] * (1 - t) + kf2.maskData[k] * t;
        mask[k] = blended >= config.binaryThreshold ? 1 : 0;
      }

      const confidence = Math.max(1 - t, t);

      results.push({
        sliceIndex,
        maskData: config.smoothResult
          ? smoothMask(mask, width, height, config.smoothingKernelSize, config.binaryThreshold)
          : mask,
        confidence,
        isKeyframe: false,
      });
    }

    results.push({
      sliceIndex: kf2.sliceIndex,
      maskData: kf2.maskData,
      confidence: 1.0,
      isKeyframe: true,
    });
  }

  return results;
}

/**
 * Main interpolation function that dispatches to the appropriate method.
 *
 * @param keyframes - Array of keyframe slices (minimum 2 required)
 * @param config - Interpolation configuration
 * @returns Array of interpolated results
 */
export function interpolateSlices(
  keyframes: KeyframeSlice[],
  config: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG
): InterpolationResult[] {
  if (keyframes.length < 2) {
    console.warn('[SliceInterpolation] At least 2 keyframes required for interpolation');
    return keyframes.map((kf) => ({
      sliceIndex: kf.sliceIndex,
      maskData: kf.maskData,
      confidence: 1.0,
      isKeyframe: true,
    }));
  }

  // Validate dimensions match
  const dims = keyframes[0].dimensions;
  for (const kf of keyframes) {
    if (kf.dimensions[0] !== dims[0] || kf.dimensions[1] !== dims[1]) {
      throw new Error('All keyframes must have the same dimensions');
    }
  }

  console.log(
    '[SliceInterpolation] Interpolating',
    keyframes.length,
    'keyframes using',
    config.method
  );

  switch (config.method) {
    case 'morphological':
    case 'shape_based':
      return interpolateMorphological(keyframes, config);
    case 'linear':
      return interpolateLinear(keyframes, config);
    default:
      return interpolateMorphological(keyframes, config);
  }
}

/**
 * Interpolate polygon contours between keyframe slices.
 *
 * @param keyframePolygons - Array of keyframe polygons with their slice indices
 * @returns Array of interpolated polygons
 */
export function interpolatePolygons(
  keyframePolygons: Array<{
    sliceIndex: number;
    points: [number, number][];
  }>
): Array<{
  sliceIndex: number;
  points: [number, number][];
  isKeyframe: boolean;
  confidence: number;
}> {
  if (keyframePolygons.length < 2) {
    return keyframePolygons.map((kf) => ({
      ...kf,
      isKeyframe: true,
      confidence: 1.0,
    }));
  }

  const sorted = [...keyframePolygons].sort((a, b) => a.sliceIndex - b.sliceIndex);
  const results: Array<{
    sliceIndex: number;
    points: [number, number][];
    isKeyframe: boolean;
    confidence: number;
  }> = [];

  results.push({
    sliceIndex: sorted[0].sliceIndex,
    points: sorted[0].points,
    isKeyframe: true,
    confidence: 1.0,
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const kf1 = sorted[i];
    const kf2 = sorted[i + 1];
    const sliceCount = kf2.sliceIndex - kf1.sliceIndex;

    // Resample both polygons to have the same number of points
    const numPoints = Math.max(kf1.points.length, kf2.points.length, 32);
    const resampled1 = resamplePolygon(kf1.points, numPoints);
    const resampled2 = resamplePolygon(kf2.points, numPoints);

    for (let j = 1; j < sliceCount; j++) {
      const t = j / sliceCount;
      const sliceIndex = kf1.sliceIndex + j;

      // Interpolate each point
      const interpolatedPoints: [number, number][] = [];
      for (let k = 0; k < numPoints; k++) {
        const x = resampled1[k][0] * (1 - t) + resampled2[k][0] * t;
        const y = resampled1[k][1] * (1 - t) + resampled2[k][1] * t;
        interpolatedPoints.push([x, y]);
      }

      results.push({
        sliceIndex,
        points: interpolatedPoints,
        isKeyframe: false,
        confidence: Math.max(1 - t, t),
      });
    }

    results.push({
      sliceIndex: kf2.sliceIndex,
      points: kf2.points,
      isKeyframe: true,
      confidence: 1.0,
    });
  }

  return results;
}

/**
 * Resample a polygon to have a specific number of points.
 *
 * @param points - Original polygon points
 * @param numPoints - Desired number of points
 * @returns Resampled polygon points
 */
function resamplePolygon(
  points: [number, number][],
  numPoints: number
): [number, number][] {
  if (points.length === 0) return [];
  if (points.length === numPoints) return [...points];

  // Calculate total perimeter
  let perimeter = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    const dx = points[next][0] - points[i][0];
    const dy = points[next][1] - points[i][1];
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    perimeter += length;
  }

  // Resample at uniform arc length intervals
  const step = perimeter / numPoints;
  const result: [number, number][] = [];

  let currentSegment = 0;
  let distanceInSegment = 0;

  for (let i = 0; i < numPoints; i++) {
    const targetDistance = i * step;
    let accumulatedDistance = 0;

    // Find the segment containing this point
    for (let j = 0; j < currentSegment; j++) {
      accumulatedDistance += segmentLengths[j];
    }
    accumulatedDistance += distanceInSegment;

    while (accumulatedDistance + (segmentLengths[currentSegment] - distanceInSegment) < targetDistance) {
      accumulatedDistance += segmentLengths[currentSegment] - distanceInSegment;
      currentSegment = (currentSegment + 1) % points.length;
      distanceInSegment = 0;
    }

    // Interpolate within the segment
    const remainingDistance = targetDistance - accumulatedDistance;
    const t = (distanceInSegment + remainingDistance) / segmentLengths[currentSegment];
    const next = (currentSegment + 1) % points.length;

    const x = points[currentSegment][0] + t * (points[next][0] - points[currentSegment][0]);
    const y = points[currentSegment][1] + t * (points[next][1] - points[currentSegment][1]);

    result.push([x, y]);
    distanceInSegment += remainingDistance;
  }

  return result;
}

/**
 * Calculate the area of a polygon using the shoelace formula.
 */
export function calculatePolygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }

  return Math.abs(area) / 2;
}

/**
 * Calculate the centroid of a polygon.
 */
export function calculatePolygonCentroid(points: [number, number][]): [number, number] {
  if (points.length === 0) return [0, 0];

  let cx = 0;
  let cy = 0;

  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }

  return [cx / points.length, cy / points.length];
}
