import { Controller, Get } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Controller for cache management and diagnostics
 */
@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('stats')
  getStats() {
    return this.cacheService.getCacheStats();
  }

  @Get('health')
  getHealth() {
    const stats = this.cacheService.getCacheStats();
    return {
      status: 'ok',
      cacheLoaded: stats.totalImages > 0,
      ...stats,
    };
  }

  /**
   * Manually reload cache - useful for warming cache on demand
   * Note: Cache loads automatically on startup, this endpoint is for manual reload
   */
  @Get('load')
  async loadCache() {
    await this.cacheService.initializeCache();
    const stats = this.cacheService.getCacheStats();
    return {
      message: 'Cache reloaded successfully',
      ...stats,
    };
  }
}
