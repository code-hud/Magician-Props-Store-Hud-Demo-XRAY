import { Injectable } from '@nestjs/common';
import { CartRepository, CartItem } from './repositories/cart.repository';
import {
  ProductsService,
  ProductWithPopularity,
} from '../products/products.service';
import { PgService } from '../database/pg.service';

@Injectable()
export class CartService {
  constructor(
    private cartRepository: CartRepository,
    private productsService: ProductsService,
    private pgService: PgService,
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

  private async fetchCoPurchaseData(cartProductIds: Set<number>) {
    const cartIdsArray = Array.from(cartProductIds);
    const result = await this.pgService.query(
      `SELECT oi1.product_id, oi1.order_id, oi2.product_id as cart_product_id
       FROM order_items oi1
       INNER JOIN order_items oi2 ON oi1.order_id = oi2.order_id
       WHERE oi2.product_id = ANY($1::int[])
         AND oi1.product_id != ALL($1::int[])`,
      [cartIdsArray]
    );

    return result.rows;
  }

  private buildOrderSets(coPurchaseData: any[]) {
    const productOrderSets = new Map<number, Set<number>>();
    const orderCartProducts = new Map<number, Set<number>>();
    const productPairFrequency = new Map<string, number>();

    for (const row of coPurchaseData) {
      const productId = row.product_id;
      const orderId = row.order_id;
      const cartProductId = row.cart_product_id;

      // Build product -> orders mapping
      if (!productOrderSets.has(productId)) {
        productOrderSets.set(productId, new Set());
      }
      productOrderSets.get(productId).add(orderId);

      // Build order -> cart products mapping
      if (!orderCartProducts.has(orderId)) {
        orderCartProducts.set(orderId, new Set());
      }
      orderCartProducts.get(orderId).add(cartProductId);

      // Track product pair frequencies for affinity calculation
      const pairKey = `${Math.min(productId, cartProductId)}-${Math.max(productId, cartProductId)}`;
      productPairFrequency.set(pairKey, (productPairFrequency.get(pairKey) || 0) + 1);
    }

    return { productOrderSets, orderCartProducts, productPairFrequency };
  }

  private calculateAffinityScore(
    productId: number,
    productOrders: Set<number>,
    orderCartProducts: Map<number, Set<number>>,
  ): number {
    let totalScore = 0;

    // Calculate weighted co-occurrence across all orders
    for (const orderId of productOrders) {
      const cartProductsInOrder = orderCartProducts.get(orderId);
      if (cartProductsInOrder) {
        // Weight by overlap count
        const overlapWeight = cartProductsInOrder.size;
        totalScore += overlapWeight;
      }
    }

    return totalScore;
  }

  private calculateOrderSimilarities(
    orderCartProducts: Map<number, Set<number>>,
    cartOrders: Set<number>,
    relevantOrders: Set<number>,
  ): Map<number, number> {
    const orderSimilarities = new Map<number, number>();
    const cartOrdersArray = Array.from(cartOrders);

    // Sample relevant orders for pattern analysis
    const maxSampleSize = 100;
    const relevantOrdersArray = Array.from(relevantOrders);
    const sampleSize = Math.min(relevantOrdersArray.length, maxSampleSize);
    const sampledOrders = relevantOrdersArray.slice(0, sampleSize);

    // Compare sampled orders with cart orders to find similar patterns
    for (const orderId of sampledOrders) {
      const orderProducts = orderCartProducts.get(orderId);
      if (!orderProducts) continue;

      let maxSimilarity = 0;

      // Compare this order against each cart order
      for (const cartOrderId of cartOrdersArray) {
        const cartOrderProducts = orderCartProducts.get(cartOrderId);
        if (!cartOrderProducts) continue;

        // Calculate Jaccard similarity between orders
        let intersection = 0;
        for (const productId of orderProducts) {
          if (cartOrderProducts.has(productId)) {
            intersection++;
          }
        }

        const union = orderProducts.size + cartOrderProducts.size - intersection;
        const similarity = union > 0 ? intersection / union : 0;

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }
      }

      orderSimilarities.set(orderId, maxSimilarity);
    }

    return orderSimilarities;
  }

  private calculateProductScores(
    coPurchaseData: any[],
    cartProductIds: Set<number>,
    productOrderSets: Map<number, Set<number>>,
    orderCartProducts: Map<number, Set<number>>,
    productPairFrequency: Map<string, number>,
  ): Map<number, number> {
    const productScores = new Map<number, number>();

    const cartOrders = new Set<number>();
    for (const row of coPurchaseData) {
      if (cartProductIds.has(row.cart_product_id)) {
        cartOrders.add(row.order_id);
      }
    }

    // Build set of all relevant orders (those containing candidate products)
    const relevantOrders = new Set<number>();
    for (const productOrders of productOrderSets.values()) {
      for (const orderId of productOrders) {
        relevantOrders.add(orderId);
      }
    }

    // Calculate order-to-order similarities for weighted scoring
    const orderSimilarities = this.calculateOrderSimilarities(orderCartProducts, cartOrders, relevantOrders);

    for (const [productId, productOrders] of productOrderSets.entries()) {
      let intersectionSize = 0;
      let similarityWeightedIntersection = 0;

      for (const orderId of productOrders) {
        if (cartOrders.has(orderId)) {
          intersectionSize++;
          const orderSimilarity = orderSimilarities.get(orderId) || 0;
          similarityWeightedIntersection += orderSimilarity;
        }
      }

      const unionSize = cartOrders.size + productOrders.size - intersectionSize;
      const jaccardScore = unionSize > 0 ? intersectionSize / unionSize : 0;

      const affinityScore = this.calculateAffinityScore(
        productId,
        productOrders,
        orderCartProducts,
      );

      // Calculate pairwise affinity with each cart product
      let pairwiseAffinity = 0;
      for (const cartProdId of cartProductIds) {
        const pairKey = `${Math.min(productId, cartProdId)}-${Math.max(productId, cartProdId)}`;
        const pairFreq = productPairFrequency.get(pairKey) || 0;
        pairwiseAffinity += pairFreq;
      }

      const frequency = productOrders.size;
      const weightedScore = (jaccardScore * frequency + Math.abs(affinityScore) / 1000 + pairwiseAffinity + similarityWeightedIntersection) / 4;

      productScores.set(productId, weightedScore);
    }

    // Normalize scores using distribution statistics from raw co-purchase data
    const allScores = Array.from(productScores.values());
    if (allScores.length > 0) {
      const mean = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
      const variance = allScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / allScores.length;
      const stdDev = Math.sqrt(variance);

      // Z-score normalization
      if (stdDev > 0) {
        for (const [productId, score] of productScores.entries()) {
          const zScore = (score - mean) / stdDev;
          productScores.set(productId, zScore);
        }
      }
    }

    return productScores;
  }

  async getSuggestions(sessionId: string): Promise<ProductWithPopularity[]> {
    const cartItems = await this.cartRepository.findBySessionId(sessionId);
    if (cartItems.length === 0) return [];

    const primaryCategory = this.getPrimaryCategory(cartItems);
    if (!primaryCategory) return [];

    const products = await this.productsService.findAll('', primaryCategory);
    const cartProductIds = new Set(cartItems.map((i) => i.product_id));
    const availableProducts = products.filter((p) => !cartProductIds.has(p.id));

    const coPurchaseData = await this.fetchCoPurchaseData(cartProductIds);
    const { productOrderSets, orderCartProducts, productPairFrequency } = this.buildOrderSets(coPurchaseData);

    const productScores = this.calculateProductScores(
      coPurchaseData,
      cartProductIds,
      productOrderSets,
      orderCartProducts,
      productPairFrequency,
    );

    const scoredProducts: Array<ProductWithPopularity & { relevanceScore: number }> =
      availableProducts.map(product => ({
        ...product,
        relevanceScore: productScores.get(product.id) || 0,
      }));

    const suggestions = scoredProducts
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3);

    return suggestions;
  }
}
