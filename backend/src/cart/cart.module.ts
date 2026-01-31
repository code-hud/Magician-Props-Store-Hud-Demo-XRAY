import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './repositories/cart.repository';
import { ProductsModule } from '../products/products.module';
import { PgService } from '../database/pg.service';

@Module({
  imports: [ProductsModule],
  controllers: [CartController],
  providers: [CartRepository, CartService, PgService],
  exports: [CartService, CartRepository],
})
export class CartModule {}
