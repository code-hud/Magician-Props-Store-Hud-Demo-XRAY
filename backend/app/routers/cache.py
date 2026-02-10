from fastapi import APIRouter
from app.services.cache_service import CacheService

router = APIRouter(prefix="/cache", tags=["cache"])

cache_service = CacheService()


@router.get("/stats")
async def get_stats() -> dict:
    """Get cache statistics."""
    return cache_service.get_stats()


@router.get("/health")
async def get_health() -> dict:
    """Get cache health status."""
    return cache_service.get_health()


@router.get("/load")
async def reload_cache() -> dict:
    """Manually reload the cache."""
    return await cache_service.reload()
