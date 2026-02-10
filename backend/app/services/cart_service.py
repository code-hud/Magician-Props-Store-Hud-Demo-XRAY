from typing import List, Optional
from collections import defaultdict
import math
from app.database.connection import DatabaseConnection
from app.repositories.cart_repository import CartRepository
from app.repositories.product_repository import ProductRepository


class CartService:
    def __init__(self, db: DatabaseConnection):
        self.db = db
        self.repository = CartRepository(db)
        self.product_repository = ProductRepository(db)

    def get_cart(self, session_id: str) -> List[dict]:
        """Get all cart items for a session."""
        return self.repository.find_by_session_id(session_id)

    def add_item(self, session_id: str, product_id: int, quantity: int = 1) -> dict:
        """Add item to cart."""
        return self.repository.add_item(session_id, product_id, quantity)

    def update_quantity(
        self,
        session_id: str,
        product_id: int,
        quantity: int
    ) -> Optional[dict]:
        """Update cart item quantity."""
        return self.repository.update_quantity(session_id, product_id, quantity)

    def remove_item(self, session_id: str, product_id: int) -> int:
        """Remove item from cart."""
        return self.repository.remove_item(session_id, product_id)

    def clear_cart(self, session_id: str) -> int:
        """Clear all items from cart."""
        return self.repository.clear_cart(session_id)

    def get_cart_total(self, session_id: str) -> dict:
        """Calculate cart total."""
        items = self.get_cart(session_id)
        total = sum(
            float(item.get('price', 0)) * item.get('quantity', 0)
            for item in items
        )
        return {
            "total": round(total, 2),
            "itemCount": len(items)
        }

    def get_suggestions(self, session_id: str) -> List[dict]:
        """Get product suggestions based on cart items using co-purchase analysis."""
        cart_items = self.get_cart(session_id)

        if not cart_items:
            return []

        cart_product_ids = {item['product_id'] for item in cart_items}

        # Identify primary category from cart
        categories = [item.get('category') for item in cart_items if item.get('category')]
        if not categories:
            return []

        # Count category occurrences to find primary
        category_counts = defaultdict(int)
        for cat in categories:
            category_counts[cat] += 1
        primary_category = max(category_counts, key=category_counts.get)

        # Get products in same category (excluding cart items)
        category_products = self._get_products_in_category(
            primary_category,
            cart_product_ids
        )

        if not category_products:
            return []

        # Get co-purchase data
        co_purchase_data = self._get_co_purchase_data(cart_product_ids)

        if not co_purchase_data:
            # No co-purchase data, return random from category
            return category_products[:3]

        # Score products using multiple metrics
        scored_products = self._score_products(
            category_products,
            cart_product_ids,
            co_purchase_data
        )

        # Return top 3 suggestions
        return sorted(scored_products, key=lambda x: x['score'], reverse=True)[:3]

    def _get_products_in_category(
        self,
        category: str,
        exclude_ids: set
    ) -> List[dict]:
        """Get products in a category excluding specified IDs."""
        products = self.product_repository.search_with_filters(category=category)
        return [p for p in products if p['id'] not in exclude_ids]

    def _get_co_purchase_data(self, cart_product_ids: set) -> List[dict]:
        """Get orders containing any of the cart products."""
        if not cart_product_ids:
            return []

        placeholders = ','.join(['%s'] * len(cart_product_ids))
        return self.db.query(
            f"""
            SELECT DISTINCT o.id as order_id, oi.product_id
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.id IN (
                SELECT DISTINCT order_id
                FROM order_items
                WHERE product_id IN ({placeholders})
            )
            """,
            tuple(cart_product_ids)
        )

    def _score_products(
        self,
        candidates: List[dict],
        cart_product_ids: set,
        co_purchase_data: List[dict]
    ) -> List[dict]:
        """Score candidate products using multiple metrics."""
        # Build order sets: product_id -> set of order_ids containing it
        order_sets = defaultdict(set)
        for row in co_purchase_data:
            order_sets[row['product_id']].add(row['order_id'])

        # Get order IDs for cart products
        cart_orders = set()
        for pid in cart_product_ids:
            cart_orders.update(order_sets.get(pid, set()))

        scores = []

        for product in candidates:
            pid = product['id']
            product_orders = order_sets.get(pid, set())

            if not product_orders:
                scores.append({**product, 'score': 0})
                continue

            # Jaccard similarity
            intersection = len(cart_orders & product_orders)
            union = len(cart_orders | product_orders)
            jaccard = intersection / union if union > 0 else 0

            # Affinity score (weighted co-occurrence)
            affinity = 0
            for cart_pid in cart_product_ids:
                cart_pid_orders = order_sets.get(cart_pid, set())
                common = len(cart_pid_orders & product_orders)
                affinity += common / len(cart_pid_orders) if cart_pid_orders else 0

            # Pairwise affinity (direct frequency)
            pairwise = intersection / len(cart_orders) if cart_orders else 0

            # Combined score
            combined = (jaccard * 0.3) + (affinity * 0.4) + (pairwise * 0.3)

            scores.append({**product, 'score': combined})

        # Z-score normalization
        if len(scores) > 1:
            raw_scores = [s['score'] for s in scores]
            mean = sum(raw_scores) / len(raw_scores)
            std = math.sqrt(sum((x - mean) ** 2 for x in raw_scores) / len(raw_scores))

            if std > 0:
                for s in scores:
                    s['score'] = (s['score'] - mean) / std

        return scores
