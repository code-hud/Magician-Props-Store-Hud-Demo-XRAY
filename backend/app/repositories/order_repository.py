from typing import List, Optional
from app.database.connection import DatabaseConnection


class OrderRepository:
    def __init__(self, db: DatabaseConnection):
        self.db = db

    def create_order(
        self,
        session_id: str,
        customer_name: str,
        customer_email: str,
        customer_phone: str,
        total_amount: float
    ) -> dict:
        """Create a new order."""
        return self.db.execute_returning(
            """
            INSERT INTO orders (session_id, customer_name, customer_email, customer_phone, total_amount, status)
            VALUES (%s, %s, %s, %s, %s, 'completed')
            RETURNING *
            """,
            (session_id, customer_name, customer_email, customer_phone, total_amount)
        )

    def add_order_item(
        self,
        order_id: int,
        product_id: int,
        quantity: int,
        price: float
    ) -> dict:
        """Add an item to an order."""
        return self.db.execute_returning(
            """
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (order_id, product_id, quantity, price)
        )

    def find_by_id(self, order_id: int) -> Optional[dict]:
        """Get order by ID with items."""
        order = self.db.query_one(
            "SELECT * FROM orders WHERE id = %s",
            (order_id,)
        )

        if order:
            items = self.db.query(
                """
                SELECT
                    oi.*,
                    p.name as product_name,
                    p.image_url as product_image_url,
                    p.category as product_category
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s
                """,
                (order_id,)
            )
            order['items'] = items

        return order

    def find_by_session_id(self, session_id: str) -> List[dict]:
        """Get all orders for a session."""
        orders = self.db.query(
            "SELECT * FROM orders WHERE session_id = %s ORDER BY created_at DESC",
            (session_id,)
        )

        for order in orders:
            items = self.db.query(
                """
                SELECT
                    oi.*,
                    p.name as product_name,
                    p.image_url as product_image_url,
                    p.category as product_category
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s
                """,
                (order['id'],)
            )
            order['items'] = items

        return orders

    def decrement_stock(self, product_id: int, quantity: int) -> int:
        """Decrement product stock."""
        return self.db.execute(
            "UPDATE products SET stock = stock - %s WHERE id = %s",
            (quantity, product_id)
        )
