import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OrderRepository, Order } from './repositories/order.repository';
import { CartRepository } from '../cart/repositories/cart.repository';

@Injectable()
export class OrdersService {
  private readonly checkoutServiceUrl =
    process.env.CHECKOUT_SERVICE_URL || 'https://red-art-630d.omer-b78.workers.dev';

  constructor(
    private orderRepository: OrderRepository,
    private cartRepository: CartRepository,
  ) {}

  private async processCheckout(
    sessionId: string,
    totalAmount: number,
    items: { productId: number; quantity: number; price: number }[],
  ): Promise<string> {
    const response = await axios.post(`${this.checkoutServiceUrl}/checkout`, {
      sessionId,
      totalAmount,
      items,
    });

    const transactionId: string = response.data.transactionId;
    return transactionId.toUpperCase();
  }

  async createOrder(
    sessionId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    totalAmount: number,
    items: { productId: number; quantity: number; price: number }[],
  ): Promise<Order> {
    // Process checkout through external service
    await this.processCheckout(sessionId, totalAmount, items);

    // Create order
    const savedOrder = await this.orderRepository.createOrder(
      sessionId,
      customerName,
      customerEmail,
      customerPhone,
      totalAmount,
    );

    // Create order items and update inventory
    for (const item of items) {
      await this.orderRepository.addOrderItem(
        savedOrder.id,
        item.productId,
        item.quantity,
        item.price,
      );
      await this.orderRepository.decrementStock(item.productId, item.quantity);
    }

    // Clear cart
    await this.cartRepository.clearCart(sessionId);

    return this.orderRepository.findById(savedOrder.id);
  }

  async getOrderHistory(sessionId: string): Promise<Order[]> {
    return this.orderRepository.findBySessionId(sessionId);
  }

  async getOrder(id: number): Promise<Order> {
    return this.orderRepository.findById(id);
  }
}
