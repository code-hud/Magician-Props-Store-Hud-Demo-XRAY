import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductRepository } from './repositories/product.repository';
import { PgService } from '../database/pg.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductRepository, ProductsService, PgService],
  exports: [ProductsService],
})
export class ProductsModule {}
