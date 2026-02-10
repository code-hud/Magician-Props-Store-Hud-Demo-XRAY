from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class OrderItemInput(BaseModel):
    productId: int
    quantity: int
    price: float


class CreateOrderRequest(BaseModel):
    customerName: str
    customerEmail: str
    customerPhone: str
    totalAmount: float
    items: List[OrderItemInput]


class OrderItem(BaseModel):
    id: int
    order_id: int
    product_id: int
    quantity: int
    price: float
    created_at: Optional[datetime] = None
    product: Optional[dict] = None

    class Config:
        from_attributes = True


class Order(BaseModel):
    id: int
    session_id: str
    customer_name: str
    customer_email: str
    customer_phone: str
    total_amount: float
    status: str
    created_at: Optional[datetime] = None
    items: Optional[List[OrderItem]] = None

    class Config:
        from_attributes = True
