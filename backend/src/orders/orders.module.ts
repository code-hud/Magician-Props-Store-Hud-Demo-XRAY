import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories/order.repository';
import { CartModule } from '../cart/cart.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [CartModule, DatabaseModule],
  controllers: [OrdersController],
  providers: [OrderRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
