from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from app.database.connection import DatabaseConnection, get_db_connection
from app.services.cart_service import CartService
from app.models.cart import AddToCartRequest, UpdateCartRequest

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("")
async def get_cart(
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> List[dict]:
    """Get all cart items for a session."""
    service = CartService(db)
    return service.get_cart(sessionId)


@router.get("/suggestions")
async def get_suggestions(
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> List[dict]:
    """Get product suggestions based on cart items."""
    service = CartService(db)
    return service.get_suggestions(sessionId)


@router.get("/total")
async def get_cart_total(
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Get cart total and item count."""
    service = CartService(db)
    return service.get_cart_total(sessionId)


@router.post("/add")
async def add_to_cart(
    request: AddToCartRequest,
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Add item to cart."""
    service = CartService(db)
    return service.add_item(sessionId, request.productId, request.quantity)


@router.put("/update")
async def update_cart(
    request: UpdateCartRequest,
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Update cart item quantity."""
    service = CartService(db)
    result = service.update_quantity(sessionId, request.productId, request.quantity)
    if not result:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return result


@router.delete("/{product_id}")
async def remove_from_cart(
    product_id: int,
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Remove item from cart."""
    service = CartService(db)
    deleted = service.remove_item(sessionId, product_id)
    return {"deleted": deleted > 0}


@router.delete("")
async def clear_cart(
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Clear all items from cart."""
    service = CartService(db)
    deleted = service.clear_cart(sessionId)
    return {"deleted": deleted}
