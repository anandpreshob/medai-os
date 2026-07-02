import type { ImageLoader, LoadedImage, ImageMetadata } from '@medai/core';
import { normalizeDirection, rasToLps, rasOriginToLps } from './utils/coordinateTransform';

/**
 * NIfTI Image Loader using ITK-WASM
 *
 * This loader handles .nii and .nii.gz files commonly used in neuroimaging
 * and research environments.
 */
export class NiftiLoader implements ImageLoader {
  name = 'nifti';
  supportedExtensions = ['.nii', '.nii.gz'];
  supportedMimeTypes = ['application/octet-stream', 'application/gzip'];

  private itkModule: any = null;

  /**
   * Lazy-load the ITK-WASM module
   */
  private async loadItkModule(): Promise<any> {
    if (this.itkModule) {
      return this.itkModule;
    }

    // Dynamically import ITK-WASM image-io module
    const itkImageIO = await import('@itk-wasm/image-io');
    this.itkModule = itkImageIO;
    return this.itkModule;
  }

  canLoad(fileOrUrl: File | string): boolean {
    const name = typeof fileOrUrl === 'string' ? fileOrUrl : fileOrUrl.name;
    const lowerName = name.toLowerCase();
    return this.supportedExtensions.some((ext) => lowerName.endsWith(ext));
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
    const filename = url.split('/').pop() || 'image.nii';
    return this.loadFromBuffer(buffer, filename);
  }

  async loadFromBuffer(buffer: ArrayBuffer, filename?: string): Promise<LoadedImage> {
    const itk = await this.loadItkModule();

    // Handle gzip decompression if needed
    let data: Uint8Array<ArrayBuffer> = new Uint8Array(buffer);
    const isGzipped = filename?.endsWith('.gz') || (data[0] === 0x1f && data[1] === 0x8b);

    if (isGzipped) {
      data = await this.decompress(data);
    }

    // Read the NIfTI file using ITK-WASM
    const { image } = await itk.readImage({
      data,
      path: filename?.replace('.gz', '') || 'image.nii',
    });

    // Extract metadata
    const metadata = this.extractMetadata(image, filename);

    // Convert pixel data to ArrayBuffer
    const pixelData = this.convertPixelData(image);

    // Generate unique image ID
    const imageId = `nifti:${filename || Date.now()}`;

    return {
      metadata,
      pixelData,
      imageId,
    };
  }

  /**
   * Decompress gzip data using DecompressionStream API
   */
  private async decompress(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    // Check if DecompressionStream is available
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const blob = new Blob([data as BlobPart]);
        const stream = blob.stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        return new Uint8Array(ab);
      } catch (e) {
        console.warn('[NiftiLoader] DecompressionStream failed, trying pako fallback');
      }
    }

    // Fallback: manual gzip decompression using pako-like approach
    // For now, throw error if DecompressionStream is not available
    throw new Error('Gzip decompression not available. Please use an uncompressed NIfTI file.');
  }

  /**
   * Extract metadata from ITK image object
   */
  private extractMetadata(itkImage: any, filename?: string): ImageMetadata {
    const { size, spacing, origin, direction, imageType, data } = itkImage;

    // Map ITK component type to our data type
    const dataTypeMap: Record<string, ImageMetadata['dataType']> = {
      uint8: 'uint8',
      int8: 'int8',
      uint16: 'uint16',
      int16: 'int16',
      float32: 'float32',
      float64: 'float64',
    };

    const componentType = imageType?.componentType || 'float32';
    const dataType = dataTypeMap[componentType] || 'float32';

    // Determine dimensionality based on depth
    const depth = size[2] || 1;
    const dimensionality = depth <= 1 ? '2D' : '3D';

    // Convert direction matrix from RAS to LPS coordinate system
    // NIfTI files use RAS (Right-Anterior-Superior) coordinates
    // Cornerstone3D expects LPS (Left-Posterior-Superior) coordinates
    const normalizedDirection = normalizeDirection(direction);
    const lpsDirection = rasToLps(normalizedDirection);

    // Convert origin from RAS to LPS
    const lpsOrigin = rasOriginToLps(
      origin[0] || 0,
      origin[1] || 0,
      origin[2] || 0
    );

    // Infer modality from filename and pixel data
    const modality = this.inferModality(filename, data, dataType);

    return {
      width: size[0] || 1,
      height: size[1] || 1,
      depth,
      spacingX: spacing[0] || 1,
      spacingY: spacing[1] || 1,
      spacingZ: spacing[2] || 1,
      originX: lpsOrigin.x,
      originY: lpsOrigin.y,
      originZ: lpsOrigin.z,
      direction: lpsDirection,
      dataType,
      format: 'nifti',
      dimensionality,
      modality,
    };
  }

  /**
   * Infer modality from pixel data characteristics and explicit filename markers
   *
   * Primary method: Analyze pixel value distribution
   * - CT: Hounsfield Units, typically -1024 (air) to 3000+ (bone/metal), with negative values
   * - MR: Arbitrary intensity, typically non-negative, normalized values
   * - PET: Non-negative, often normalized SUV values
   */
  private inferModality(filename?: string, pixelData?: any, _dataType?: string): string | undefined {
    // First, try to infer from pixel data (most reliable)
    if (pixelData && pixelData.length > 0) {
      const stats = this.analyzePixelData(pixelData);

      // CT detection: Has significant negative values (HU scale includes air at -1024)
      // and typically has values below -100 for soft tissue/air
      if (stats.min < -100 && stats.hasNegativeValues) {
        return 'CT';
      }

      // If no negative values, likely MR or PET
      // MR typically has a wider dynamic range relative to mean
      if (stats.min >= 0) {
        return 'MR';
      }
    }

    // Fallback: Check filename only for explicit modality markers
    // Only match clear modality indicators, not anatomy terms
    const lowerName = (filename || '').toLowerCase();

    // Look for explicit modality in filename (e.g., "scan_MR_001.nii" or "CT-001.nii")
    // Use word boundaries to avoid false matches
    if (/[_\-\.]mr[_\-\.]|[_\-\.]mri[_\-\.]|^mr[_\-\.]|[_\-\.]mr$/i.test(lowerName)) {
      return 'MR';
    }
    if (/[_\-\.]ct[_\-\.]|^ct[_\-\.]|[_\-\.]ct$/i.test(lowerName)) {
      return 'CT';
    }
    if (/[_\-\.]pet[_\-\.]|^pet[_\-\.]|[_\-\.]pet$/i.test(lowerName)) {
      return 'PT';
    }

    // Cannot determine modality
    return undefined;
  }

  /**
   * Analyze pixel data to get statistics for modality inference
   */
  private analyzePixelData(pixelData: any): { min: number; max: number; hasNegativeValues: boolean } {
    const sampleSize = Math.min(50000, pixelData.length);
    const step = Math.max(1, Math.floor(pixelData.length / sampleSize));

    let min = Infinity;
    let max = -Infinity;
    let hasNegativeValues = false;

    for (let i = 0; i < pixelData.length; i += step) {
      const val = pixelData[i];
      if (val < min) min = val;
      if (val > max) max = val;
      if (val < 0) hasNegativeValues = true;
    }

    return { min, max, hasNegativeValues };
  }

  /**
   * Convert ITK pixel data to ArrayBuffer
   * Also handles coordinate system conversion from RAS to LPS if needed
   */
  private convertPixelData(itkImage: any): ArrayBuffer {
    const { data } = itkImage;

    // If data is already a TypedArray, get its buffer
    if (data.buffer) {
      return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );
    }

    // Otherwise, create a copy
    return new Uint8Array(data).buffer;
  }
}
