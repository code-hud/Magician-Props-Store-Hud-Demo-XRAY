import { Injectable } from '@nestjs/common';
import { PgService } from '../../database/pg.service';

export interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  session_id: string;
  created_at: Date;
  product?: any;
}

@Injectable()
export class CartRepository {
  constructor(private readonly pgService: PgService) {}

  async findBySessionId(sessionId: string): Promise<CartItem[]> {
    const result = await this.pgService.query(
      `SELECT ci.*,
              p.id as product_id, p.name as product_name, p.price as product_price,
              p.category as product_category, p.description as product_description,
              p.image_url as product_image_url, p.stock as product_stock,
              p.created_at as product_created_at, p.updated_at as product_updated_at
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       WHERE ci.session_id = $1`,
      [sessionId]
    );

    const items = result.rows.map(row => ({
      id: row.id,
      product_id: row.product_id,
      quantity: row.quantity,
      session_id: row.session_id,
      created_at: row.created_at,
      product: {
        id: row.product_id,
        name: row.product_name,
        price: row.product_price,
        category: row.product_category,
        description: row.product_description,
        image_url: row.product_image_url,
        stock: row.product_stock,
        created_at: row.product_created_at,
        updated_at: row.product_updated_at,
      }
    }));

    console.log(`[CartRepository] Found ${items.length} items in cart for session ${sessionId}`);
    return items;
  }

  async findItem(sessionId: string, productId: number): Promise<CartItem | null> {
    const result = await this.pgService.query(
      'SELECT * FROM cart_items WHERE session_id = $1 AND product_id = $2',
      [sessionId, productId]
    );

    const item = result.rows[0] || null;
    console.log(`[CartRepository] ${item ? 'Found' : 'Did not find'} cart item for product ${productId} in session ${sessionId}`);
    return item;
  }

  async addItem(
    sessionId: string,
    productId: number,
    quantity: number,
  ): Promise<CartItem> {
    const result = await this.pgService.query(
      `INSERT INTO cart_items (product_id, quantity, session_id, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [productId, quantity, sessionId]
    );

    const item = result.rows[0];
    console.log(`[CartRepository] Added item (product ${productId}, qty ${quantity}) to cart for session ${sessionId}`);
    return item;
  }

  async updateQuantity(
    sessionId: string,
    productId: number,
    quantity: number,
  ): Promise<CartItem> {
    const result = await this.pgService.query(
      `UPDATE cart_items
       SET quantity = $1
       WHERE session_id = $2 AND product_id = $3
       RETURNING *`,
      [quantity, sessionId, productId]
    );

    if (result.rows.length === 0) {
      throw new Error('Cart item not found');
    }

    console.log(`[CartRepository] Updated quantity to ${quantity} for product ${productId} in session ${sessionId}`);
    return result.rows[0];
  }

  async removeItem(sessionId: string, productId: number): Promise<void> {
    await this.pgService.query(
      'DELETE FROM cart_items WHERE session_id = $1 AND product_id = $2',
      [sessionId, productId]
    );
    console.log(`[CartRepository] Removed product ${productId} from cart for session ${sessionId}`);
  }

  async clearCart(sessionId: string): Promise<void> {
    await this.pgService.query(
      'DELETE FROM cart_items WHERE session_id = $1',
      [sessionId]
    );
    console.log(`[CartRepository] Cleared entire cart for session ${sessionId}`);
  }
}
