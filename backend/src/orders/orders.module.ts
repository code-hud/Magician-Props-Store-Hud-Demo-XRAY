import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories/order.repository';
import { CartRepository } from '../cart/repositories/cart.repository';
import { PgService } from '../database/pg.service';

@Module({
  controllers: [OrdersController],
  providers: [OrderRepository, CartRepository, OrdersService, PgService],
  exports: [OrdersService],
})
export class OrdersModule {}
