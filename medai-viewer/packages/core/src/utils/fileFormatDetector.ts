/**
 * File Format Detection Utility
 * Detects medical image file formats to route them appropriately
 */

export type FileFormat = 'dicom' | 'nifti' | 'nrrd' | 'mhd' | 'unknown';

/**
 * Detects the format of a medical image file
 * @param file - The file to analyze
 * @returns Promise resolving to the detected format
 */
export async function detectFileFormat(file: File): Promise<FileFormat> {
  const extension = file.name.toLowerCase();

  // Check by extension first
  if (extension.endsWith('.nii') || extension.endsWith('.nii.gz')) {
    return 'nifti';
  }
  if (extension.endsWith('.nrrd') || extension.endsWith('.nhdr')) {
    return 'nrrd';
  }
  if (extension.endsWith('.mhd') || extension.endsWith('.mha')) {
    return 'mhd';
  }

  // For files without clear extension or .dcm extension, check magic bytes
  const header = await readFileHeader(file, 144);

  // DICOM files have "DICM" magic bytes at offset 128
  if (isDicomFile(header)) {
    return 'dicom';
  }

  // Check NIfTI magic bytes
  if (isNiftiFile(header)) {
    return 'nifti';
  }

  // Check NRRD magic bytes
  if (isNrrdFile(header)) {
    return 'nrrd';
  }

  return 'unknown';
}

/**
 * Reads the first N bytes of a file
 */
async function readFileHeader(file: File, bytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const blob = file.slice(0, bytes);

    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      resolve(new Uint8Array(buffer));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Checks if file header indicates DICOM format
 * DICOM files have "DICM" at byte offset 128
 */
function isDicomFile(header: Uint8Array): boolean {
  if (header.length < 132) return false;

  // Check for DICM magic bytes at offset 128
  return (
    header[128] === 0x44 && // 'D'
    header[129] === 0x49 && // 'I'
    header[130] === 0x43 && // 'C'
    header[131] === 0x4D    // 'M'
  );
}

/**
 * Checks if file header indicates NIfTI format
 * NIfTI-1 has magic bytes: "n+1" or "ni1"
 */
function isNiftiFile(header: Uint8Array): boolean {
  if (header.length < 4) return false;

  // Check for NIfTI-1 magic bytes at different possible offsets
  const checkMagic = (offset: number) => {
    const magic = String.fromCharCode(
      header[offset],
      header[offset + 1],
      header[offset + 2]
    );
    return magic === 'n+1' || magic === 'ni1';
  };

  // NIfTI-1 header size is 348, magic is at offset 344
  // But for preliminary check, we can look at the beginning too
  return checkMagic(0) || (header.length >= 348 && checkMagic(344));
}

/**
 * Checks if file header indicates NRRD format
 * NRRD files start with "NRRD" magic bytes
 */
function isNrrdFile(header: Uint8Array): boolean {
  if (header.length < 4) return false;

  // Check for NRRD magic bytes at beginning
  return (
    header[0] === 0x4E && // 'N'
    header[1] === 0x52 && // 'R'
    header[2] === 0x52 && // 'R'
    header[3] === 0x44    // 'D'
  );
}

/**
 * Determines if a file format should be uploaded to Orthanc
 */
export function shouldUploadToOrthanc(format: FileFormat): boolean {
  return format === 'dicom';
}

/**
 * Gets a user-friendly description of the file format
 */
export function getFormatDescription(format: FileFormat): string {
  switch (format) {
    case 'dicom':
      return 'DICOM Medical Image';
    case 'nifti':
      return 'NIfTI Volume';
    case 'nrrd':
      return 'NRRD Volume';
    case 'mhd':
      return 'MetaImage Volume';
    case 'unknown':
      return 'Unknown Format';
  }
}
