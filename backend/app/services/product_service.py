from typing import List, Optional
from datetime import datetime, timedelta
from app.database.connection import DatabaseConnection
from app.repositories.product_repository import ProductRepository


class ProductService:
    def __init__(self, db: DatabaseConnection):
        self.db = db
        self.repository = ProductRepository(db)

    def get_all_products(
        self,
        search: Optional[str] = None,
        category: Optional[str] = None
    ) -> List[dict]:
        """Get all products with optional search/filter and popularity data."""
        products = self.repository.search_with_filters(search, category)

        if not products:
            return []

        # Get popularity data (times ordered in last 7 days)
        product_ids = [p['id'] for p in products]
        popularity = self._get_popularity(product_ids)

        # Add popularity to each product
        for product in products:
            product['times_ordered'] = popularity.get(product['id'], 0)

        return products

    def get_product_by_id(self, product_id: int) -> Optional[dict]:
        """Get a single product by ID with popularity."""
        product = self.repository.find_by_id(product_id)

        if product:
            popularity = self._get_popularity([product_id])
            product['times_ordered'] = popularity.get(product_id, 0)

        return product

    def get_categories(self) -> List[str]:
        """Get all distinct product categories."""
        return self.repository.get_categories()

    def _get_popularity(self, product_ids: List[int]) -> dict:
        """Get popularity count for products (times ordered in last 7 days)."""
        if not product_ids:
            return {}

        placeholders = ','.join(['%s'] * len(product_ids))
        seven_days_ago = datetime.now() - timedelta(days=7)

        results = self.db.query(
            f"""
            SELECT
                oi.product_id,
                COALESCE(SUM(oi.quantity), 0) as times_ordered
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.product_id IN ({placeholders})
              AND o.created_at >= %s
            GROUP BY oi.product_id
            """,
            tuple(product_ids) + (seven_days_ago,)
        )

        return {r['product_id']: int(r['times_ordered']) for r in results}
