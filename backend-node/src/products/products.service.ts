import { Injectable } from '@nestjs/common';
import { ProductRepository, Product } from './repositories/product.repository';
import { PgService } from '../database/pg.service';

export interface ProductWithPopularity extends Product {
  timesOrdered: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private productRepository: ProductRepository,
    private pgService: PgService,
  ) {}

  async findAll(search?: string, category?: string): Promise<ProductWithPopularity[]> {
    const products = await this.productRepository.searchWithFilters(search, category);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Single aggregated query instead of N+1
    const result = await this.pgService.query(
      `SELECT product_id, COUNT(*) as count
       FROM order_items
       WHERE created_at >= $1
       GROUP BY product_id`,
      [oneWeekAgo]
    );

    const countMap = new Map(
      result.rows.map((row) => [row.product_id, parseInt(row.count)]),
    );

    const productsWithPopularity: ProductWithPopularity[] = products.map((product) => ({
      ...product,
      timesOrdered: (countMap.get(product.id) as number) || 0,
    }));

    return productsWithPopularity;
  }

  async findOne(id: number): Promise<Product> {
    return this.productRepository.findById(id);
  }

  async getCategories(): Promise<string[]> {
    return this.productRepository.getCategories();
  }
}
