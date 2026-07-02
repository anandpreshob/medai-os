import type { ImageLoader, LoadedImage, ImageMetadata } from '@medai/core';

// DICOM tag constants
const DICOM_TAGS = {
  ROWS: 'x00280010',
  COLUMNS: 'x00280011',
  BITS_ALLOCATED: 'x00280100',
  BITS_STORED: 'x00280101',
  HIGH_BIT: 'x00280102',
  PIXEL_REPRESENTATION: 'x00280103',
  PIXEL_SPACING: 'x00280030',
  MODALITY: 'x00080060',
  SERIES_DESCRIPTION: 'x0008103e',
  STUDY_DESCRIPTION: 'x00081030',
  BODY_PART_EXAMINED: 'x00180015',
  PROTOCOL_NAME: 'x00181030',
  PATIENT_NAME: 'x00100010',
  NUMBER_OF_FRAMES: 'x00280008',
  PHOTOMETRIC_INTERPRETATION: 'x00280004',
  SAMPLES_PER_PIXEL: 'x00280002',
  WINDOW_CENTER: 'x00281050',
  WINDOW_WIDTH: 'x00281051',
  RESCALE_INTERCEPT: 'x00281052',
  RESCALE_SLOPE: 'x00281053',
  PIXEL_DATA: 'x7fe00010',
};

// 2D modalities (X-ray, mammography, etc.)
const MODALITIES_2D = ['CR', 'DX', 'MG', 'XA', 'RF', 'RG', 'IO', 'PX'];

/**
 * DICOM Image Loader using dicom-parser
 *
 * Handles DICOM files with focus on 2D modalities like X-ray (CR, DX),
 * mammography (MG), and radiofluoroscopy (RF).
 */
export class DicomLoader implements ImageLoader {
  name = 'dicom';
  supportedExtensions = ['.dcm', '.dicom', ''];
  supportedMimeTypes = ['application/dicom', 'application/octet-stream'];

  private dicomParser: any = null;

  /**
   * Lazy-load dicom-parser
   */
  private async loadDicomParser(): Promise<any> {
    if (this.dicomParser) {
      return this.dicomParser;
    }

    // Dynamically import dicom-parser
    const dicomParser = await import('dicom-parser');
    this.dicomParser = dicomParser.default || dicomParser;
    return this.dicomParser;
  }

  canLoad(fileOrUrl: File | string): boolean {
    const name = typeof fileOrUrl === 'string' ? fileOrUrl : fileOrUrl.name;
    const lowerName = name.toLowerCase();

    // Check extensions
    if (this.supportedExtensions.some((ext) => ext && lowerName.endsWith(ext))) {
      return true;
    }

    // Files without extension might be DICOM (common in medical imaging)
    if (!lowerName.includes('.')) {
      return true;
    }

    return false;
  }

  async loadFromFile(file: File): Promise<LoadedImage> {
    const buffer = await file.arrayBuffer();
    return this.loadFromBuffer(buffer, file.name);
  }

  async loadFromUrl(url: string): Promise<LoadedImage> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const filename = url.split('/').pop() || 'image.dcm';
    return this.loadFromBuffer(buffer, filename);
  }

  async loadFromBuffer(buffer: ArrayBuffer, filename?: string): Promise<LoadedImage> {
    const dicomParser = await this.loadDicomParser();

    const byteArray = new Uint8Array(buffer);

    // Check for DICOM magic bytes at offset 128
    if (byteArray.length > 132) {
      const magic = String.fromCharCode(
        byteArray[128],
        byteArray[129],
        byteArray[130],
        byteArray[131]
      );
      if (magic !== 'DICM') {
        throw new Error('Not a valid DICOM file (missing DICM magic bytes)');
      }
    }

    // Parse DICOM
    const dataSet = dicomParser.parseDicom(byteArray);

    // Extract metadata
    const metadata = this.extractMetadata(dataSet);

    // Extract and process pixel data
    const pixelData = this.extractPixelData(dataSet, metadata);

    // Generate unique image ID
    const imageId = `dicom:${filename || Date.now()}`;

    return {
      metadata,
      pixelData,
      imageId,
    };
  }

  /**
   * Extract metadata from DICOM dataset
   */
  private extractMetadata(dataSet: any): ImageMetadata {
    // Basic image dimensions
    const rows = dataSet.uint16(DICOM_TAGS.ROWS) || 512;
    const columns = dataSet.uint16(DICOM_TAGS.COLUMNS) || 512;
    const numberOfFrames = parseInt(dataSet.string(DICOM_TAGS.NUMBER_OF_FRAMES) || '1', 10);

    // Pixel spacing (y\x format in DICOM)
    const pixelSpacingStr = dataSet.string(DICOM_TAGS.PIXEL_SPACING);
    let spacingX = 1.0;
    let spacingY = 1.0;
    if (pixelSpacingStr) {
      const parts = pixelSpacingStr.split('\\');
      spacingY = parseFloat(parts[0]) || 1.0;
      spacingX = parseFloat(parts[1]) || spacingY;
    }

    // Modality and clinical context
    const modality = dataSet.string(DICOM_TAGS.MODALITY) || 'OT';
    const seriesDescription = dataSet.string(DICOM_TAGS.SERIES_DESCRIPTION) || '';
    const studyDescription = dataSet.string(DICOM_TAGS.STUDY_DESCRIPTION) || '';
    const bodyPartExamined = dataSet.string(DICOM_TAGS.BODY_PART_EXAMINED) || '';
    const protocolName = dataSet.string(DICOM_TAGS.PROTOCOL_NAME) || '';
    const patientName = dataSet.string(DICOM_TAGS.PATIENT_NAME) || '';

    // Bits info
    const bitsAllocated = dataSet.uint16(DICOM_TAGS.BITS_ALLOCATED) || 16;
    const pixelRepresentation = dataSet.uint16(DICOM_TAGS.PIXEL_REPRESENTATION) || 0;

    // Determine data type
    let dataType: ImageMetadata['dataType'];
    if (bitsAllocated === 8) {
      dataType = 'uint8';
    } else if (bitsAllocated === 16) {
      dataType = pixelRepresentation === 0 ? 'uint16' : 'int16';
    } else {
      dataType = 'float32';
    }

    // Determine dimensionality
    const is2DModality = MODALITIES_2D.includes(modality.toUpperCase());
    const dimensionality = is2DModality || numberOfFrames <= 1 ? '2D' : '3D';

    return {
      width: columns,
      height: rows,
      depth: numberOfFrames,
      spacingX,
      spacingY,
      spacingZ: 1.0, // Not typically defined for 2D modalities
      originX: 0,
      originY: 0,
      originZ: 0,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      dataType,
      modality,
      seriesDescription,
      studyDescription,
      bodyPartExamined,
      protocolName,
      patientName,
      format: 'dicom',
      dimensionality,
    };
  }

  /**
   * Extract pixel data from DICOM dataset
   */
  private extractPixelData(dataSet: any, metadata: ImageMetadata): ArrayBuffer {
    const pixelDataElement = dataSet.elements[DICOM_TAGS.PIXEL_DATA];
    if (!pixelDataElement) {
      throw new Error('No pixel data found in DICOM file');
    }

    const { width, height, depth, dataType } = metadata;
    const totalPixels = width * height * depth;

    // Get the raw byte array
    const byteArray = dataSet.byteArray;
    const offset = pixelDataElement.dataOffset;
    const length = pixelDataElement.length;

    // Apply rescale slope/intercept if present
    const rescaleSlope = parseFloat(dataSet.string(DICOM_TAGS.RESCALE_SLOPE) || '1');
    const rescaleIntercept = parseFloat(dataSet.string(DICOM_TAGS.RESCALE_INTERCEPT) || '0');

    if (dataType === 'uint8') {
      const pixels = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels && i < length; i++) {
        let value = byteArray[offset + i];
        value = value * rescaleSlope + rescaleIntercept;
        pixels[i] = Math.max(0, Math.min(255, Math.round(value)));
      }
      return pixels.buffer;
    } else if (dataType === 'uint16') {
      const pixels = new Uint16Array(totalPixels);
      const dataView = new DataView(byteArray.buffer, byteArray.byteOffset + offset, length);
      for (let i = 0; i < totalPixels && i * 2 < length; i++) {
        let value = dataView.getUint16(i * 2, true); // Little-endian
        value = value * rescaleSlope + rescaleIntercept;
        pixels[i] = Math.max(0, Math.min(65535, Math.round(value)));
      }
      return pixels.buffer;
    } else if (dataType === 'int16') {
      const pixels = new Int16Array(totalPixels);
      const dataView = new DataView(byteArray.buffer, byteArray.byteOffset + offset, length);
      for (let i = 0; i < totalPixels && i * 2 < length; i++) {
        let value = dataView.getInt16(i * 2, true); // Little-endian
        value = value * rescaleSlope + rescaleIntercept;
        pixels[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
      }
      return pixels.buffer;
    } else {
      // Fall back to float32
      const pixels = new Float32Array(totalPixels);
      const dataView = new DataView(byteArray.buffer, byteArray.byteOffset + offset, length);
      for (let i = 0; i < totalPixels && i * 2 < length; i++) {
        let value = dataView.getInt16(i * 2, true);
        pixels[i] = value * rescaleSlope + rescaleIntercept;
      }
      return pixels.buffer;
    }
  }
}
