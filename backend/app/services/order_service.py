from typing import List, Optional
import httpx
import logging
from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.repositories.order_repository import OrderRepository
from app.repositories.cart_repository import CartRepository
from app.models.order import CreateOrderRequest

logger = logging.getLogger(__name__)
settings = get_settings()


class OrderService:
    def __init__(self, db: DatabaseConnection):
        self.db = db
        self.repository = OrderRepository(db)
        self.cart_repository = CartRepository(db)

    async def create_order(
        self,
        session_id: str,
        request: CreateOrderRequest
    ) -> dict:
        """Create a new order with payment processing."""
        # Process payment via external checkout service
        transaction_id = await self._process_payment(request)
        logger.info(f"Payment processed with transaction ID: {transaction_id}")

        # Create order record
        order = self.repository.create_order(
            session_id=session_id,
            customer_name=request.customerName,
            customer_email=request.customerEmail,
            customer_phone=request.customerPhone,
            total_amount=request.totalAmount
        )

        # Add order items and update stock
        for item in request.items:
            self.repository.add_order_item(
                order_id=order['id'],
                product_id=item.productId,
                quantity=item.quantity,
                price=item.price
            )
            self.repository.decrement_stock(item.productId, item.quantity)

        # Clear cart
        self.cart_repository.clear_cart(session_id)

        # Return complete order
        return self.repository.find_by_id(order['id'])

    def get_order_by_id(self, order_id: int) -> Optional[dict]:
        """Get order details by ID."""
        return self.repository.find_by_id(order_id)

    def get_order_history(self, session_id: str) -> List[dict]:
        """Get all orders for a session."""
        return self.repository.find_by_session_id(session_id)

    async def _process_payment(self, request: CreateOrderRequest) -> str:
        """Process payment via external checkout service."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.checkout_service_url}/checkout",
                json={
                    "customerName": request.customerName,
                    "customerEmail": request.customerEmail,
                    "customerPhone": request.customerPhone,
                    "totalAmount": request.totalAmount,
                    "items": [
                        {
                            "productId": item.productId,
                            "quantity": item.quantity,
                            "price": item.price
                        }
                        for item in request.items
                    ]
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data.get("transactionId", "").upper()
