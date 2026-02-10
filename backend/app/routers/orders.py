from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from app.database.connection import DatabaseConnection, get_db_connection
from app.services.order_service import OrderService
from app.models.order import CreateOrderRequest

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("")
async def create_order(
    request: CreateOrderRequest,
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Create a new order."""
    service = OrderService(db)
    order = await service.create_order(sessionId, request)
    if not order:
        raise HTTPException(status_code=500, detail="Failed to create order")
    return order


@router.get("/history")
async def get_order_history(
    sessionId: str = Query(..., description="Session identifier"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> List[dict]:
    """Get order history for a session."""
    service = OrderService(db)
    return service.get_order_history(sessionId)


@router.get("/{order_id}")
async def get_order(
    order_id: int,
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Get order details by ID."""
    service = OrderService(db)
    order = service.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
