import type { ImageLoader, LoadedImage, ImageMetadata } from '@medai/core';

/**
 * Standard 2D Image Loader for PNG and JPG
 *
 * Uses browser's native Canvas API for maximum compatibility and performance.
 * Converts images to grayscale for medical imaging display.
 */
export class StandardImageLoader implements ImageLoader {
  name = 'standard-image';
  supportedExtensions = ['.png', '.jpg', '.jpeg'];
  supportedMimeTypes = ['image/png', 'image/jpeg'];

  canLoad(fileOrUrl: File | string): boolean {
    const name = typeof fileOrUrl === 'string' ? fileOrUrl : fileOrUrl.name;
    const lowerName = name.toLowerCase();
    return this.supportedExtensions.some((ext) => lowerName.endsWith(ext));
  }

  async loadFromFile(file: File): Promise<LoadedImage> {
    console.log('[StandardImageLoader] Loading file:', file.name, 'type:', file.type, 'size:', file.size);
    // Create blob URL for the file
    const blobUrl = URL.createObjectURL(file);
    try {
      const result = await this.loadFromBlobUrl(blobUrl, file.name);
      console.log('[StandardImageLoader] Loaded successfully:', {
        imageId: result.imageId,
        width: result.metadata.width,
        height: result.metadata.height,
        dataType: result.metadata.dataType,
        dimensionality: result.metadata.dimensionality,
        pixelDataSize: result.pixelData.byteLength,
      });
      return result;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async loadFromUrl(url: string): Promise<LoadedImage> {
    const filename = url.split('/').pop() || 'image.png';
    return this.loadFromBlobUrl(url, filename);
  }

  async loadFromBuffer(buffer: ArrayBuffer, filename?: string): Promise<LoadedImage> {
    // Determine MIME type from filename
    const ext = (filename || '').toLowerCase();
    const mimeType = ext.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Create blob URL
    const blob = new Blob([buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    try {
      return await this.loadFromBlobUrl(blobUrl, filename || 'image.png');
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  /**
   * Load image from blob URL using Canvas API
   */
  private async loadFromBlobUrl(url: string, filename: string): Promise<LoadedImage> {
    // Load image using createImageBitmap
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const width = bitmap.width;
    const height = bitmap.height;

    // Draw to canvas to extract pixel data
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Get RGBA image data
    const imageData = ctx.getImageData(0, 0, width, height);

    // Convert to grayscale (average RGB, ignore alpha)
    const grayscaleData = this.convertToGrayscale(imageData);

    // Determine format from filename
    const ext = filename.toLowerCase();
    const format = ext.endsWith('.png') ? 'png' : 'jpg';

    // Build metadata
    const metadata: ImageMetadata = {
      width,
      height,
      depth: 1, // 2D image
      spacingX: 1.0, // Unknown pixel spacing, default to 1mm
      spacingY: 1.0,
      spacingZ: 1.0,
      originX: 0,
      originY: 0,
      originZ: 0,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      dataType: 'uint8',
      format: format as 'png' | 'jpg',
      dimensionality: '2D',
    };

    // Generate unique image ID
    const imageId = `standard:${filename || Date.now()}`;

    return {
      metadata,
      pixelData: grayscaleData.buffer as ArrayBuffer,
      imageId,
    };
  }

  /**
   * Convert RGBA ImageData to grayscale Uint8Array
   * Uses luminance formula: 0.299*R + 0.587*G + 0.114*B
   */
  private convertToGrayscale(imageData: ImageData): Uint8Array {
    const { data, width, height } = imageData;
    const grayscale = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Standard luminance formula
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return grayscale;
  }
}
