import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { LoggerModule } from './logger/logger.module';
import { PgService } from './database/pg.service';
import { PgCleanupInterceptor } from './database/pg.interceptor';

@Module({
  imports: [
    LoggerModule,
    ProductsModule,
    CartModule,
    OrdersModule,
  ],
  providers: [
    PgService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PgCleanupInterceptor,
    },
  ],
})
export class AppModule {}
