from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CartItem(BaseModel):
    id: int
    product_id: int
    quantity: int
    session_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CartItemWithProduct(CartItem):
    name: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    stock: Optional[int] = None


class AddToCartRequest(BaseModel):
    productId: int
    quantity: int = 1


class UpdateCartRequest(BaseModel):
    productId: int
    quantity: int
