/**
 * Detect the format of a medical image file
 */

export type ImageFormat = 'nifti' | 'nrrd' | 'mha' | 'dicom' | 'unknown';

/**
 * Detect format from filename
 */
export function detectFormatFromFilename(filename: string): ImageFormat {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.nii') || lower.endsWith('.nii.gz')) {
    return 'nifti';
  }
  if (lower.endsWith('.nrrd') || lower.endsWith('.nhdr')) {
    return 'nrrd';
  }
  if (lower.endsWith('.mha') || lower.endsWith('.mhd')) {
    return 'mha';
  }
  if (lower.endsWith('.dcm') || lower.endsWith('.dicom')) {
    return 'dicom';
  }

  return 'unknown';
}

/**
 * Detect format from file magic bytes
 */
export function detectFormatFromBytes(data: Uint8Array): ImageFormat {
  // NIfTI-1: header size is 348 (little-endian at offset 0)
  if (data.length >= 4) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const headerSize = view.getInt32(0, true);
    if (headerSize === 348) {
      return 'nifti';
    }
  }

  // NRRD: starts with "NRRD"
  if (data.length >= 4) {
    const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (magic === 'NRRD') {
      return 'nrrd';
    }
  }

  // DICOM: look for "DICM" at offset 128
  if (data.length >= 132) {
    const magic = String.fromCharCode(data[128], data[129], data[130], data[131]);
    if (magic === 'DICM') {
      return 'dicom';
    }
  }

  // Gzip: starts with 0x1f 0x8b
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    // Could be .nii.gz - would need to decompress to check further
    return 'nifti'; // Assume NIfTI for gzipped files
  }

  return 'unknown';
}
