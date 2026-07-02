/**
 * Coordinate system transformation utilities
 *
 * Medical imaging uses different coordinate systems:
 * - RAS (Right-Anterior-Superior): Common in NIfTI
 * - LPS (Left-Posterior-Superior): Common in DICOM
 *
 * Cornerstone3D uses LPS internally, so we need to convert RAS to LPS.
 */

/**
 * Transform a direction matrix from RAS to LPS coordinate system
 * RAS -> LPS: flip X and Y axes
 */
export function rasToLps(direction: number[]): number[] {
  // For a 3x3 matrix stored as flat array [m00, m01, m02, m10, m11, m12, m20, m21, m22]
  // RAS to LPS transformation negates the first two rows
  return [
    -direction[0], -direction[1], -direction[2],  // Negate X row
    -direction[3], -direction[4], -direction[5],  // Negate Y row
    direction[6],  direction[7],  direction[8],   // Keep Z row
  ];
}

/**
 * Transform origin from RAS to LPS
 */
export function rasOriginToLps(
  originX: number,
  originY: number,
  originZ: number
): { x: number; y: number; z: number } {
  return {
    x: -originX,  // Negate X
    y: -originY,  // Negate Y
    z: originZ,   // Keep Z
  };
}

/**
 * Check if a direction matrix is in RAS orientation
 * This is a heuristic based on typical NIfTI conventions
 */
export function isRasOrientation(direction: number[]): boolean {
  // Check if the matrix looks like it's in RAS by examining
  // the dominant axis directions
  // This is a simplified check - real implementation would be more robust
  return direction[0] > 0 || direction[4] > 0;
}

/**
 * Transform point coordinates from RAS to LPS
 */
export function transformPointRasToLps(
  point: [number, number, number]
): [number, number, number] {
  return [-point[0], -point[1], point[2]];
}

/**
 * Create identity direction matrix
 */
export function identityDirection(): number[] {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/**
 * Normalize direction matrix to 3x3 (9 elements)
 * ITK-WASM can return different matrix sizes:
 * - 4 elements: 2x2 for 2D images
 * - 9 elements: 3x3 direction matrix (standard)
 * - 16 elements: 4x4 affine matrix (NIfTI format)
 * Cornerstone3D expects a 3x3 direction matrix (9 elements)
 */
export function normalizeDirection(direction: any): number[] {
  if (!direction) return identityDirection();

  const arr = Array.from(direction) as number[];

  // Already 3x3 (9 elements) - return as-is
  if (arr.length === 9) return arr;

  // 2x2 direction (4 elements) - expand to 3x3
  if (arr.length === 4) {
    return [
      arr[0], arr[1], 0,
      arr[2], arr[3], 0,
      0,      0,      1
    ];
  }

  // 4x4 affine matrix (16 elements) - extract upper-left 3x3 rotation portion
  // Layout: [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33]
  if (arr.length === 16) {
    return [
      arr[0], arr[1], arr[2],   // First row
      arr[4], arr[5], arr[6],   // Second row
      arr[8], arr[9], arr[10]   // Third row
    ];
  }

  // Unexpected size - use identity
  console.warn('[ITK Loader] Unexpected direction matrix size:', arr.length);
  return identityDirection();
}
