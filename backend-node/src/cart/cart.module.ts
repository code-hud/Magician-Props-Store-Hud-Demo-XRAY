import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './repositories/cart.repository';
import { ProductsModule } from '../products/products.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ProductsModule, DatabaseModule],
  controllers: [CartController],
  providers: [CartRepository, CartService],
  exports: [CartService, CartRepository],
})
export class CartModule {}
