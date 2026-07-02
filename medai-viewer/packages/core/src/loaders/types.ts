export interface ImageMetadata {
  // Dimensions
  width: number;
  height: number;
  depth: number;

  // Spacing (mm)
  spacingX: number;
  spacingY: number;
  spacingZ: number;

  // Origin (mm)
  originX: number;
  originY: number;
  originZ: number;

  // Direction cosines (3x3 matrix as flat array)
  direction: number[];

  // Data type
  dataType: 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32' | 'float64';

  // Modality info
  modality?: string;
  seriesDescription?: string;
  studyDescription?: string;
  bodyPartExamined?: string;
  protocolName?: string;
  patientName?: string;

  // Format-specific
  format: 'nifti' | 'nrrd' | 'mha' | 'dicom' | 'png' | 'jpg' | 'tiff' | 'unknown';

  // Image dimensionality (2D for single images, 3D for volumes)
  dimensionality: '2D' | '3D';
}

export interface LoadedImage {
  metadata: ImageMetadata;
  pixelData: ArrayBuffer;
  imageId: string;
}

export interface ImageLoader {
  /**
   * Unique identifier for this loader
   */
  name: string;

  /**
   * File extensions this loader can handle
   */
  supportedExtensions: string[];

  /**
   * MIME types this loader can handle
   */
  supportedMimeTypes: string[];

  /**
   * Check if this loader can handle the given file
   */
  canLoad(file: File | string): boolean;

  /**
   * Load an image from a File object
   */
  loadFromFile(file: File): Promise<LoadedImage>;

  /**
   * Load an image from a URL
   */
  loadFromUrl(url: string): Promise<LoadedImage>;

  /**
   * Load an image from raw bytes
   */
  loadFromBuffer(buffer: ArrayBuffer, filename?: string): Promise<LoadedImage>;
}
