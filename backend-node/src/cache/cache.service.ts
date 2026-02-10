import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { ProductRepository } from '../products/repositories/product.repository';
import { ImageCache } from './image-cache';

/**
 * Cache service that automatically loads product images into memory on startup.
 * Images are fetched from Unsplash URLs and stored as Buffers for the lifetime
 * of the application.
 */
@Injectable()
export class CacheService implements OnModuleInit {
  private static initializationStarted = false;
  private readonly imageCache: ImageCache;
  private readonly BATCH_SIZE = parseInt(process.env.IMAGE_CACHE_BATCH_SIZE || '15', 10);
  private readonly FETCH_TIMEOUT_MS = parseInt(process.env.IMAGE_CACHE_TIMEOUT || '10000', 10);
  private isLoading = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(private readonly productRepository: ProductRepository) {
    this.imageCache = ImageCache.getInstance();
  }

  onModuleInit() {
    if (CacheService.initializationStarted) {
      console.log('[CacheService] Initialization already started, skipping');
      return;
    }
    CacheService.initializationStarted = true;
    console.log('[CacheService] Starting one-time cache initialization...');
    this.initializeCache().catch((error) => {
      console.error('[CacheService] Init error:', error);
    });
  }

  /**
   * Initialize the image cache.
   * Called automatically on service instantiation.
   * Can also be called manually to reload the cache.
   */
  async initializeCache(): Promise<void> {
    // Prevent multiple simultaneous loads
    if (this.isLoading) {
      console.warn('Cache loading already in progress, skipping...');
      return this.loadingPromise || Promise.resolve();
    }

    this.isLoading = true;
    this.loadingPromise = this.performLoad();

    try {
      await this.loadingPromise;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  private async performLoad(): Promise<void> {
    try {
      console.log('[CacheService] performLoad starting...');
      console.log('Initializing image cache...');
      await this.loadAllImages();
      console.log('[CacheService] performLoad completed successfully');
    } catch (error) {
      console.error('[CacheService] performLoad error:', error);
      console.error('Failed to initialize image cache', error);
      // Don't throw - allow application to start even if cache loading fails
    }
  }

  /**
   * Load all product images into the cache.
   * Fetches images in parallel batches to avoid overwhelming the server.
   */
  private async loadAllImages(): Promise<void> {
    try {
      // Fetch all products from database
      const products = await this.productRepository.findAll();
      console.log(`Fetched ${products.length} products from database`);
      if (products.length > 0) {
        console.log(`First product sample:`, JSON.stringify(products[0]));
      }

      // Filter products with image URLs
      const productsWithImages = products.filter(
        (p) => p.image_url && p.image_url.trim() !== '',
      );
      console.log(`Filtered to ${productsWithImages.length} products with image URLs`);

      if (productsWithImages.length === 0) {
        console.warn('No products with image URLs found');
        return;
      }

      console.log(
        `Found ${productsWithImages.length} products with images. Starting download...`,
      );

      // Get unique image URLs to avoid fetching duplicates
      const uniqueImageUrls = new Map<string, number[]>(); // URL -> [productIds]
      productsWithImages.forEach((product) => {
        const url = product.image_url!;
        if (!uniqueImageUrls.has(url)) {
          uniqueImageUrls.set(url, []);
        }
        uniqueImageUrls.get(url)!.push(product.id);
      });

      console.log(
        `Fetching ${uniqueImageUrls.size} unique images for ${productsWithImages.length} products`,
      );

      let loaded = 0;
      let failed = 0;
      const startTime = Date.now();

      // Process images in batches
      const imageEntries = Array.from(uniqueImageUrls.entries());
      for (let i = 0; i < imageEntries.length; i += this.BATCH_SIZE) {
        const batch = imageEntries.slice(i, i + this.BATCH_SIZE);

        // Fetch batch in parallel
        const results = await Promise.allSettled(
          batch.map(([url, productIds]) =>
            this.fetchAndCacheImage(url, productIds),
          ),
        );

        // Count successes and failures
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            loaded++;
          } else {
            failed++;
            const [url] = batch[index];
            console.warn(
              `Failed to fetch image: ${url.substring(0, 60)}... - ${result.reason.message}`,
            );
          }
        });

        // Log progress
        const progress = Math.min(i + this.BATCH_SIZE, uniqueImageUrls.size);
        console.log(
          `Progress: ${progress}/${uniqueImageUrls.size} images processed`,
        );
      }

      const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      const stats = this.imageCache.getStats();

      console.log(
        `Image cache loaded: ${stats.totalImages} images, ${stats.totalSizeMB} MB in ${durationSeconds}s`,
      );

      if (failed > 0) {
        console.warn(`${failed} images failed to load`);
      }
    } catch (error) {
      console.error('Failed to load image cache', error);
      // Don't throw - allow application to start even if cache loading fails
    }
  }

  /**
   * Fetch an image from a URL and cache it for multiple products.
   * @param url Image URL
   * @param productIds Product IDs that use this image
   */
  private async fetchAndCacheImage(
    url: string,
    productIds: number[],
  ): Promise<void> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: this.FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Magician-Props-Store/1.0',
        },
      });

      const imageBuffer = Buffer.from(response.data);

      // Cache the same image buffer for all products using this URL
      for (const productId of productIds) {
        await this.imageCache.loadImage(productId, url, imageBuffer);
      }
    } catch (error: any) {
      const message =
        error.code === 'ECONNABORTED'
          ? 'Timeout'
          : error.response?.status
            ? `HTTP ${error.response.status}`
            : error.message;
      throw new Error(message);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.imageCache.getStats();
  }

  /**
   * Get a cached image by product ID
   * @param productId Product ID
   * @returns Image buffer or null
   */
  getCachedImage(productId: number): Buffer | null {
    return this.imageCache.getImage(productId);
  }
}
