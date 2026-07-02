import { ImageLoader, LoadedImage } from './types';

class LoaderRegistryClass {
  private loaders: Map<string, ImageLoader> = new Map();

  /**
   * Register a new image loader
   */
  register(loader: ImageLoader): void {
    this.loaders.set(loader.name, loader);
    console.debug(`[LoaderRegistry] Registered loader: ${loader.name}`);
  }

  /**
   * Unregister a loader
   */
  unregister(name: string): void {
    this.loaders.delete(name);
  }

  /**
   * Get a loader by name
   */
  getLoader(name: string): ImageLoader | undefined {
    return this.loaders.get(name);
  }

  /**
   * Get all registered loaders
   */
  getAllLoaders(): ImageLoader[] {
    return Array.from(this.loaders.values());
  }

  /**
   * Find a loader that can handle the given file
   */
  findLoaderForFile(file: File): ImageLoader | undefined {
    for (const loader of this.loaders.values()) {
      if (loader.canLoad(file)) {
        return loader;
      }
    }
    return undefined;
  }

  /**
   * Alias for findLoaderForFile
   */
  getLoaderForFile(file: File): ImageLoader | undefined {
    return this.findLoaderForFile(file);
  }

  /**
   * Find a loader that can handle the given URL/path
   */
  findLoaderForUrl(url: string): ImageLoader | undefined {
    for (const loader of this.loaders.values()) {
      if (loader.canLoad(url)) {
        return loader;
      }
    }
    return undefined;
  }

  /**
   * Load an image using the appropriate loader
   */
  async loadFile(file: File): Promise<LoadedImage> {
    const loader = this.findLoaderForFile(file);
    if (!loader) {
      throw new Error(`No loader found for file: ${file.name}`);
    }
    return loader.loadFromFile(file);
  }

  /**
   * Load an image from URL using the appropriate loader
   */
  async loadUrl(url: string): Promise<LoadedImage> {
    const loader = this.findLoaderForUrl(url);
    if (!loader) {
      throw new Error(`No loader found for URL: ${url}`);
    }
    return loader.loadFromUrl(url);
  }
}

export const LoaderRegistry = new LoaderRegistryClass();
// Also export with lowercase for convenience
export const loaderRegistry = LoaderRegistry;
