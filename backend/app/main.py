import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from aws_xray_sdk.core import xray_recorder, patch_all

from app.config import get_settings
from app.utils.logger import logger
from app.routers import products, cart, orders, cache
from app.services.cache_service import CacheService

settings = get_settings()

# Configure X-Ray
xray_recorder.configure(
    service=settings.service_name,
    daemon_address=settings.xray_daemon_address,
    context_missing='LOG_ERROR'
)

# Patch libraries for automatic instrumentation
patch_all()


class XRayMiddleware(BaseHTTPMiddleware):
    """X-Ray middleware for FastAPI."""

    async def dispatch(self, request: Request, call_next):
        """Process request with X-Ray tracing."""
        # Start a segment for this request
        segment = xray_recorder.begin_segment(
            name=settings.service_name,
            traceid=request.headers.get('X-Amzn-Trace-Id')
        )

        try:
            # Add request metadata
            segment.put_http_meta('request', {
                'url': str(request.url),
                'method': request.method,
                'user_agent': request.headers.get('user-agent', ''),
                'client_ip': request.client.host if request.client else None
            })

            response = await call_next(request)

            # Add response metadata
            segment.put_http_meta('response', {
                'status': response.status_code
            })

            return response
        except Exception as e:
            # Record exception
            segment.put_annotation('error', True)
            xray_recorder.current_segment().add_exception(e)
            raise
        finally:
            xray_recorder.end_segment()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info(f"Starting {settings.service_name}...")

    # Initialize image cache
    try:
        cache_service = CacheService()
        await cache_service.initialize()
    except Exception as e:
        logger.error(f"Cache initialization failed: {e}")
        # Don't block startup on cache failure

    logger.info(f"Server running on port {settings.port}")

    yield

    # Shutdown
    logger.info("Shutting down...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Magician Props Store API",
        description="Backend API for the Magician Props Store",
        version="1.0.0",
        lifespan=lifespan
    )

    # X-Ray middleware (must be first)
    app.add_middleware(XRayMiddleware)

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
