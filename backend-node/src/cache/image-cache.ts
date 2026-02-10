/**
 * In-memory image cache for storing product images.
 * Singleton class that keeps image buffers in memory for fast access.
 */

export interface ImageMetadata {
  productId: number;
  url: string;
  size: number; // Size in bytes
  loadedAt: Date;
}

export interface CacheStats {
  totalImages: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  images: ImageMetadata[];
}

export class ImageCache {
  private static instance: ImageCache;
  private cache: Map<number, Buffer> = new Map();
  private metadata: Map<number, ImageMetadata> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of ImageCache
   */
  public static getInstance(): ImageCache {
    if (!ImageCache.instance) {
      ImageCache.instance = new ImageCache();
    }
    return ImageCache.instance;
  }

  /**
   * Load an image into the cache
   * @param productId Product ID
   * @param imageUrl URL of the image
   * @param imageBuffer Buffer containing the image data
   */
  async loadImage(
    productId: number,
    imageUrl: string,
    imageBuffer: Buffer,
  ): Promise<void> {
    this.cache.set(productId, imageBuffer);
    this.metadata.set(productId, {
      productId,
      url: imageUrl,
      size: imageBuffer.length,
      loadedAt: new Date(),
    });
  }

  /**
   * Get an image from the cache
   * @param productId Product ID
   * @returns Image buffer or null if not found
   */
  getImage(productId: number): Buffer | null {
    return this.cache.get(productId) || null;
  }

  /**
   * Check if an image exists in the cache
   * @param productId Product ID
   * @returns true if image is cached
   */
  hasImage(productId: number): boolean {
    return this.cache.has(productId);
  }

  /**
   * Clear all images from the cache
   */
  clear(): void {
    this.cache.clear();
    this.metadata.clear();
  }

  /**
   * Get cache statistics
   * @returns Cache statistics including size and count
   */
  getStats(): CacheStats {
    const images = Array.from(this.metadata.values());
    const totalSizeBytes = images.reduce((sum, meta) => sum + meta.size, 0);

    return {
      totalImages: this.cache.size,
      totalSizeBytes,
      totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
      images,
    };
  }

  /**
   * Get metadata for a specific image
   * @param productId Product ID
   * @returns Image metadata or null if not found
   */
  getMetadata(productId: number): ImageMetadata | null {
    return this.metadata.get(productId) || null;
  }
}
