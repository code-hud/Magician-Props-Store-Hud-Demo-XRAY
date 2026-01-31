import { Injectable } from '@nestjs/common';
import { PgService } from '../../database/pg.service';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price: string;
  created_at: Date;
  product?: any;
}

export interface Order {
  id: number;
  session_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  total_amount: string;
  status: string;
  created_at: Date;
  items?: OrderItem[];
}

@Injectable()
export class OrderRepository {
  constructor(private readonly pgService: PgService) {}

  async createOrder(
    sessionId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    totalAmount: number,
  ): Promise<Order> {
    const result = await this.pgService.query(
      `INSERT INTO orders (session_id, customer_name, customer_email, customer_phone, total_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [sessionId, customerName, customerEmail, customerPhone, totalAmount, 'completed']
    );

    const order = result.rows[0];
    console.log(`[OrderRepository] Created order ${order.id} for session ${sessionId} with total $${totalAmount}`);
    return order;
  }

  async addOrderItem(
    orderId: number,
    productId: number,
    quantity: number,
    price: number,
  ): Promise<OrderItem> {
    const result = await this.pgService.query(
      `INSERT INTO order_items (order_id, product_id, quantity, price, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [orderId, productId, quantity, price]
    );

    const item = result.rows[0];
    console.log(`[OrderRepository] Added item to order ${orderId}: product ${productId}, qty ${quantity}, price $${price}`);
    return item;
  }

  async findById(id: number): Promise<Order | null> {
    const orderResult = await this.pgService.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      console.log(`[OrderRepository] Did not find order ${id}`);
      return null;
    }

    const order = orderResult.rows[0];

    // Get order items with products
    const itemsResult = await this.pgService.query(
      `SELECT oi.*,
              p.id as product_id, p.name as product_name, p.price as product_price,
              p.category as product_category, p.description as product_description,
              p.image_url as product_image_url, p.stock as product_stock,
              p.created_at as product_created_at, p.updated_at as product_updated_at
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    order.items = itemsResult.rows.map(row => ({
      id: row.id,
      order_id: row.order_id,
      product_id: row.product_id,
      quantity: row.quantity,
      price: row.price,
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

    console.log(`[OrderRepository] Found order ${id}`);
    return order;
  }

  async findBySessionId(sessionId: string): Promise<Order[]> {
    const ordersResult = await this.pgService.query(
      'SELECT * FROM orders WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );

    const orders = ordersResult.rows;

    // Get all order items with products for these orders
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const itemsResult = await this.pgService.query(
        `SELECT oi.*,
                p.id as product_id, p.name as product_name, p.price as product_price,
                p.category as product_category, p.description as product_description,
                p.image_url as product_image_url, p.stock as product_stock,
                p.created_at as product_created_at, p.updated_at as product_updated_at
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ANY($1::int[])`,
        [orderIds]
      );

      // Group items by order
      const itemsByOrder = new Map<number, OrderItem[]>();
      for (const row of itemsResult.rows) {
        if (!itemsByOrder.has(row.order_id)) {
          itemsByOrder.set(row.order_id, []);
        }
        itemsByOrder.get(row.order_id).push({
          id: row.id,
          order_id: row.order_id,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.price,
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
        });
      }

      // Attach items to orders
      for (const order of orders) {
        order.items = itemsByOrder.get(order.id) || [];
      }
    }

    console.log(`[OrderRepository] Found ${orders.length} orders for session ${sessionId}`);
    return orders;
  }
}
