import { Injectable } from '@nestjs/common';
import { PgService } from '../../database/pg.service';

export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url: string | null;
  category: string;
  stock: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ProductRepository {
  constructor(private readonly pgService: PgService) {}

  async findAll(): Promise<Product[]> {
    const result = await this.pgService.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );
    console.log(`[ProductRepository] Retrieved ${result.rows.length} products`);
    return result.rows;
  }

  async findById(id: number): Promise<Product | null> {
    const result = await this.pgService.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
    const product = result.rows[0] || null;
    console.log(`[ProductRepository] ${product ? 'Found' : 'Did not find'} product with id ${id}`);
    return product;
  }

  async findByIds(ids: number[]): Promise<Product[]> {
    const result = await this.pgService.query(
      'SELECT * FROM products WHERE id = ANY($1::int[])',
      [ids]
    );
    console.log(`[ProductRepository] Retrieved ${result.rows.length} of ${ids.length} products`);
    return result.rows;
  }

  async searchWithFilters(search?: string, category?: string): Promise<Product[]> {
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      paramIndex++;
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${paramIndex}`;
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pgService.query(query, params);
    console.log(`[ProductRepository] Search returned ${result.rows.length} products (search: "${search}", category: "${category}")`);
    return result.rows;
  }

  async getCategories(): Promise<string[]> {
    const result = await this.pgService.query(
      'SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category'
    );
    const categories = result.rows.map(row => row.category).filter(Boolean);
    console.log(`[ProductRepository] Retrieved ${categories.length} distinct categories`);
    return categories;
  }
}
