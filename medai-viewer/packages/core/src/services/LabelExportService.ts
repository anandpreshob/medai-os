/**
 * LabelExportService - Export segmentation labels to NIfTI format
 * Creates downloadable .nii.gz files from labelmap volumes
 */

export interface ExportOptions {
  filename?: string;
  compress?: boolean;
}

/**
 * Convert labelmap scalar data and metadata to NIfTI format
 */
export function convertToNifti(
  scalarData: Uint8Array | Uint16Array | Float32Array,
  dimensions: [number, number, number],
  spacing: [number, number, number],
  origin: [number, number, number],
  direction: number[]
): ArrayBuffer {
  // NIfTI-1 header is 348 bytes
  const headerSize = 348;
  const totalSize = headerSize + scalarData.byteLength;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // sizeof_hdr (int32) - must be 348 for NIfTI-1
  view.setInt32(0, 348, true);

  // dim[0-7] (8 x int16) at offset 40
  view.setInt16(40, 3, true); // ndim = 3
  view.setInt16(42, dimensions[0], true);   // dim[1]
  view.setInt16(44, dimensions[1], true);   // dim[2]
  view.setInt16(46, dimensions[2], true);   // dim[3]
  view.setInt16(48, 1, true); // dim[4]
  view.setInt16(50, 1, true); // dim[5]
  view.setInt16(52, 1, true); // dim[6]
  view.setInt16(54, 1, true); // dim[7]

  // datatype (int16) at offset 70
  let datatype: number;
  let bitpix: number;

  if (scalarData instanceof Uint8Array) {
    datatype = 2;    // DT_UNSIGNED_CHAR
    bitpix = 8;
  } else if (scalarData instanceof Uint16Array) {
    datatype = 512;  // DT_UINT16
    bitpix = 16;
  } else {
    datatype = 16;   // DT_FLOAT
    bitpix = 32;
  }

  view.setInt16(70, datatype, true);
  view.setInt16(72, bitpix, true);

  // pixdim[0-7] (8 x float32) at offset 76
  view.setFloat32(76, 1.0, true);  // qfac
  view.setFloat32(80, spacing[0], true);   // pixdim[1]
  view.setFloat32(84, spacing[1], true);   // pixdim[2]
  view.setFloat32(88, spacing[2], true);   // pixdim[3]
  view.setFloat32(92, 1.0, true);  // pixdim[4]
  view.setFloat32(96, 1.0, true);  // pixdim[5]
  view.setFloat32(100, 1.0, true); // pixdim[6]
  view.setFloat32(104, 1.0, true); // pixdim[7]

  // vox_offset (float32) at offset 108
  view.setFloat32(108, headerSize, true);

  // scl_slope (float32) at offset 112
  view.setFloat32(112, 1.0, true);

  // scl_inter (float32) at offset 116
  view.setFloat32(116, 0.0, true);

  // xyzt_units (char) at offset 123
  view.setUint8(123, 2); // NIFTI_UNITS_MM

  // descrip (80 chars) at offset 148
  const descrip = 'MedAI Viewer Label Export';
  for (let i = 0; i < descrip.length && i < 80; i++) {
    view.setUint8(148 + i, descrip.charCodeAt(i));
  }

  // qform_code (int16) at offset 252
  view.setInt16(252, 1, true); // NIFTI_XFORM_SCANNER_ANAT

  // sform_code (int16) at offset 254
  view.setInt16(254, 1, true); // NIFTI_XFORM_SCANNER_ANAT

  // qoffset_x, qoffset_y, qoffset_z (3 x float32) at offset 268-276
  view.setFloat32(268, origin[0], true);
  view.setFloat32(272, origin[1], true);
  view.setFloat32(276, origin[2], true);

  // srow_x, srow_y, srow_z (3 x 4 x float32) at offset 280-324
  // Use direction matrix with spacing
  const dir = direction.length >= 9 ? direction : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  view.setFloat32(280, dir[0] * spacing[0], true);
  view.setFloat32(284, dir[1] * spacing[1], true);
  view.setFloat32(288, dir[2] * spacing[2], true);
  view.setFloat32(292, origin[0], true);

  view.setFloat32(296, dir[3] * spacing[0], true);
  view.setFloat32(300, dir[4] * spacing[1], true);
  view.setFloat32(304, dir[5] * spacing[2], true);
  view.setFloat32(308, origin[1], true);

  view.setFloat32(312, dir[6] * spacing[0], true);
  view.setFloat32(316, dir[7] * spacing[1], true);
  view.setFloat32(320, dir[8] * spacing[2], true);
  view.setFloat32(324, origin[2], true);

  // magic (4 chars) at offset 344 - "n+1\0" for single-file NIfTI
  view.setUint8(344, 110); // 'n'
  view.setUint8(345, 43);  // '+'
  view.setUint8(346, 49);  // '1'
  view.setUint8(347, 0);   // null

  // Copy pixel data
  const pixelDataView = new Uint8Array(scalarData.buffer);
  const bufferView = new Uint8Array(buffer);
  bufferView.set(pixelDataView, headerSize);

  return buffer;
}

/**
 * Compress data using gzip (browser-compatible)
 */
export async function compressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  // Use CompressionStream API if available (modern browsers)
  if ('CompressionStream' in window) {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(new Uint8Array(data));
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  // Fallback: return uncompressed
  console.warn('[LabelExportService] CompressionStream not available, returning uncompressed data');
  return data;
}

/**
 * Trigger download of the exported label file
 */
export function downloadFile(data: ArrayBuffer, filename: string): void {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export labelmap to NIfTI file and trigger download
 */
export async function exportLabelAsNifti(
  scalarData: Uint8Array | Uint16Array | Float32Array,
  dimensions: [number, number, number],
  spacing: [number, number, number],
  origin: [number, number, number],
  direction: number[],
  options: ExportOptions = {}
): Promise<void> {
  const { filename = 'segmentation.nii.gz', compress = true } = options;

  console.log('[LabelExportService] Exporting label:', {
    dimensions,
    spacing,
    origin,
    dataType: scalarData.constructor.name,
    compress,
  });

  // Convert to NIfTI format
  const niftiData = convertToNifti(scalarData, dimensions, spacing, origin, direction);

  let outputData: ArrayBuffer;
  let outputFilename: string;

  if (compress) {
    outputData = await compressGzip(niftiData);
    outputFilename = filename.endsWith('.nii.gz') ? filename : `${filename}.nii.gz`;
  } else {
    outputData = niftiData;
    outputFilename = filename.endsWith('.nii') ? filename : `${filename}.nii`;
  }

  // Trigger download
  downloadFile(outputData, outputFilename);

  console.log('[LabelExportService] Export complete:', outputFilename);
}

export default {
  convertToNifti,
  compressGzip,
  downloadFile,
  exportLabelAsNifti,
};
