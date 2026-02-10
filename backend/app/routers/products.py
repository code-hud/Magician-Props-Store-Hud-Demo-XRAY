from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from app.database.connection import DatabaseConnection, get_db_connection
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def get_products(
    search: Optional[str] = Query(None, description="Search term for name/description"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: DatabaseConnection = Depends(get_db_connection)
) -> List[dict]:
    """Get all products with optional search and category filter."""
    service = ProductService(db)
    return service.get_all_products(search=search, category=category)


@router.get("/categories")
async def get_categories(
    db: DatabaseConnection = Depends(get_db_connection)
) -> List[str]:
    """Get all distinct product categories."""
    service = ProductService(db)
    return service.get_categories()


@router.get("/{product_id}")
async def get_product(
    product_id: int,
    db: DatabaseConnection = Depends(get_db_connection)
) -> dict:
    """Get a single product by ID."""
    service = ProductService(db)
    product = service.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
