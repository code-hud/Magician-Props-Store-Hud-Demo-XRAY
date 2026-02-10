from typing import List, Optional
from app.database.connection import DatabaseConnection
from app.models.product import Product


class ProductRepository:
    def __init__(self, db: DatabaseConnection):
        self.db = db

    def find_all(self) -> List[dict]:
        """Get all products."""
        return self.db.query("SELECT * FROM products ORDER BY id")

    def find_by_id(self, product_id: int) -> Optional[dict]:
        """Get a product by ID."""
        return self.db.query_one(
            "SELECT * FROM products WHERE id = %s",
            (product_id,)
        )

    def find_by_ids(self, product_ids: List[int]) -> List[dict]:
        """Get products by list of IDs."""
        if not product_ids:
            return []
        placeholders = ','.join(['%s'] * len(product_ids))
        return self.db.query(
            f"SELECT * FROM products WHERE id IN ({placeholders})",
            tuple(product_ids)
        )

    def search_with_filters(
        self,
        search: Optional[str] = None,
        category: Optional[str] = None
    ) -> List[dict]:
        """Search products with optional filters."""
        conditions = []
        params = []

        if search:
            conditions.append("(name ILIKE %s OR description ILIKE %s)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])

        if category:
            conditions.append("category = %s")
            params.append(category)

        where_clause = " AND ".join(conditions) if conditions else "1=1"
        query = f"SELECT * FROM products WHERE {where_clause} ORDER BY id"

        return self.db.query(query, tuple(params) if params else None)

    def get_categories(self) -> List[str]:
        """Get distinct product categories."""
        results = self.db.query(
            "SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category"
        )
        return [r['category'] for r in results]
