import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import products, cart, orders, cache
from app.services.cache_service import CacheService

settings = get_settings()


async def _init_cache_background():
    """Initialize cache in background without blocking startup."""
    try:
        cache_service = CacheService()
        await cache_service.initialize()
    except Exception as e:
        print(f"Cache initialization failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    print(f"Starting {settings.service_name}...")

    # Initialize image cache in background (don't block startup)
    cache_task = asyncio.create_task(_init_cache_background())

    print(f"Server running on port {settings.port}")

    yield

    # Shutdown
    print("Shutting down...")
    # Cancel cache task if still running
    if not cache_task.done():
        cache_task.cancel()
        try:
            await cache_task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Magician Props Store API",
        description="Backend API for the Magician Props Store",
        version="1.0.0",
        lifespan=lifespan
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(products.router)
    app.include_router(cart.router)
    app.include_router(orders.router)
    app.include_router(cache.router)

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "service": settings.service_name}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True
    )
