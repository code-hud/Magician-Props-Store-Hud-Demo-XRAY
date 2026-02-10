from typing import List, Optional
from app.database.connection import DatabaseConnection


class CartRepository:
    def __init__(self, db: DatabaseConnection):
        self.db = db

    def find_by_session_id(self, session_id: str) -> List[dict]:
        """Get all cart items for a session with product details."""
        return self.db.query(
            """
            SELECT
                ci.id,
                ci.product_id,
                ci.quantity,
                ci.session_id,
                ci.created_at,
                p.name,
                p.price,
                p.image_url,
                p.category,
                p.stock
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.session_id = %s
            ORDER BY ci.created_at DESC
            """,
            (session_id,)
        )

    def find_item(self, session_id: str, product_id: int) -> Optional[dict]:
        """Get a specific cart item."""
        return self.db.query_one(
            "SELECT * FROM cart_items WHERE session_id = %s AND product_id = %s",
            (session_id, product_id)
        )

    def add_item(self, session_id: str, product_id: int, quantity: int) -> dict:
        """Add item to cart or update quantity if exists."""
        existing = self.find_item(session_id, product_id)

        if existing:
            new_quantity = existing['quantity'] + quantity
            return self.db.execute_returning(
                """
                UPDATE cart_items
                SET quantity = %s
                WHERE session_id = %s AND product_id = %s
                RETURNING *
                """,
                (new_quantity, session_id, product_id)
            )
        else:
            return self.db.execute_returning(
                """
                INSERT INTO cart_items (session_id, product_id, quantity)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (session_id, product_id, quantity)
            )

    def update_quantity(self, session_id: str, product_id: int, quantity: int) -> Optional[dict]:
        """Update cart item quantity."""
        return self.db.execute_returning(
            """
            UPDATE cart_items
            SET quantity = %s
            WHERE session_id = %s AND product_id = %s
            RETURNING *
            """,
            (quantity, session_id, product_id)
        )

    def remove_item(self, session_id: str, product_id: int) -> int:
        """Remove item from cart."""
        return self.db.execute(
            "DELETE FROM cart_items WHERE session_id = %s AND product_id = %s",
            (session_id, product_id)
        )

    def clear_cart(self, session_id: str) -> int:
        """Clear all items from cart."""
        return self.db.execute(
            "DELETE FROM cart_items WHERE session_id = %s",
            (session_id,)
        )
