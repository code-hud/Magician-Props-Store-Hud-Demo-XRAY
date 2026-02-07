import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheController } from './cache.controller';
import { ProductsModule } from '../products/products.module';
import { LoggerModule } from '../logger/logger.module';

/**
 * Cache module for in-memory image caching.
 * Automatically loads product images on application startup.
 */
@Module({
  imports: [ProductsModule, LoggerModule],
  controllers: [CacheController],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
