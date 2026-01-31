import { Injectable } from '@nestjs/common';
import { CartRepository, CartItem } from './repositories/cart.repository';
import {
  ProductsService,
  ProductWithPopularity,
} from '../products/products.service';

@Injectable()
export class CartService {
  constructor(
    private cartRepository: CartRepository,
    private productsService: ProductsService,
  ) {}

  async getCart(sessionId: string): Promise<CartItem[]> {
    return this.cartRepository.findBySessionId(sessionId);
  }

  async addToCart(
    sessionId: string,
    productId: number,
    quantity: number = 1,
  ): Promise<CartItem> {
    return this.cartRepository.addItem(sessionId, productId, quantity);
  }

  async removeFromCart(sessionId: string, productId: number): Promise<void> {
    await this.cartRepository.removeItem(sessionId, productId);
  }

  async updateQuantity(
    sessionId: string,
    productId: number,
    quantity: number,
  ): Promise<CartItem> {
    return this.cartRepository.updateQuantity(sessionId, productId, quantity);
  }

  async clearCart(sessionId: string): Promise<void> {
    await this.cartRepository.clearCart(sessionId);
  }

  async getCartTotal(sessionId: string): Promise<number> {
    const cartItems = await this.cartRepository.findBySessionId(sessionId);

    return cartItems.reduce(
      (total, item) => total + Number(item.product.price) * item.quantity,
      0,
    );
  }

  private getPrimaryCategory(cartItems: CartItem[]): string | null {
    const categoryCounts: Record<string, number> = {};
    cartItems.forEach((item) => {
      const cat = item.product?.category;
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    return Object.entries(categoryCounts).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] || null;
  }

  async getSuggestions(sessionId: string): Promise<ProductWithPopularity[]> {
    const cartItems = await this.cartRepository.findBySessionId(sessionId);
    if (cartItems.length === 0) return [];

    const primaryCategory = this.getPrimaryCategory(cartItems);
    if (!primaryCategory) return [];

    const products = await this.productsService.findAll('', primaryCategory);
    const cartProductIds = new Set(cartItems.map((i) => i.product_id));
    const availableProducts = products.filter((p) => !cartProductIds.has(p.id));

    // Randomly shuffle and pick 3
    const shuffled = availableProducts.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }
}
