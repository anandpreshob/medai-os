import type { ImageLoader, LoadedImage, ImageMetadata } from '@medai/core';
import { normalizeDirection } from './utils/coordinateTransform';

/**
 * TIFF Image Loader using ITK-WASM
 *
 * Handles .tif and .tiff files commonly used in pathology and scientific imaging.
 * Supports both single-slice (2D) and multi-page (3D) TIFF files.
 */
export class TiffLoader implements ImageLoader {
  name = 'tiff';
  supportedExtensions = ['.tif', '.tiff'];
  supportedMimeTypes = ['image/tiff'];

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
    const filename = url.split('/').pop() || 'image.tiff';
    return this.loadFromBuffer(buffer, filename);
  }

  async loadFromBuffer(buffer: ArrayBuffer, filename?: string): Promise<LoadedImage> {
    const itk = await this.loadItkModule();

    const data = new Uint8Array(buffer);

    // Read the TIFF file using ITK-WASM
    const { image } = await itk.readImage({
      data,
      path: filename || 'image.tiff',
    });

    // Extract metadata
    const metadata = this.extractMetadata(image);

    // Convert pixel data to ArrayBuffer
    const pixelData = this.convertPixelData(image);

    // Generate unique image ID
    const imageId = `tiff:${filename || Date.now()}`;

    return {
      metadata,
      pixelData,
      imageId,
    };
  }

  /**
   * Extract metadata from ITK image object
   */
  private extractMetadata(itkImage: any): ImageMetadata {
    const { size, spacing, origin, direction, imageType } = itkImage;

    // Map ITK component type to our data type
    const dataTypeMap: Record<string, ImageMetadata['dataType']> = {
      uint8: 'uint8',
      int8: 'int8',
      uint16: 'uint16',
      int16: 'int16',
      float32: 'float32',
      float64: 'float64',
    };

    const componentType = imageType?.componentType || 'uint8';
    const dataType = dataTypeMap[componentType] || 'uint8';

    // Determine dimensionality based on depth
    const depth = size[2] || 1;
    const dimensionality = depth <= 1 ? '2D' : '3D';

    return {
      width: size[0] || 1,
      height: size[1] || 1,
      depth,
      spacingX: spacing[0] || 1,
      spacingY: spacing[1] || 1,
      spacingZ: spacing[2] || 1,
      originX: origin[0] || 0,
      originY: origin[1] || 0,
      originZ: origin[2] || 0,
      direction: normalizeDirection(direction),
      dataType,
      format: 'tiff',
      dimensionality,
    };
  }

  /**
   * Convert ITK pixel data to ArrayBuffer
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
