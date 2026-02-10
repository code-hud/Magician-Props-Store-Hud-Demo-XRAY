from typing import Dict, Optional, List
import httpx
import logging
import asyncio
from dataclasses import dataclass, field
from app.config import get_settings
from app.database.connection import get_db

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ImageMetadata:
    product_id: int
    url: str
    size_bytes: int
    loaded_at: float


@dataclass
class ImageCache:
    """Singleton in-memory image cache."""
    _images: Dict[int, bytes] = field(default_factory=dict)
    _metadata: Dict[int, ImageMetadata] = field(default_factory=dict)
    _url_to_products: Dict[str, List[int]] = field(default_factory=dict)
    _initialized: bool = False

    def load_image(self, product_id: int, image_url: str, image_buffer: bytes):
        """Add image to cache."""
        import time
        self._images[product_id] = image_buffer
        self._metadata[product_id] = ImageMetadata(
            product_id=product_id,
            url=image_url,
            size_bytes=len(image_buffer),
            loaded_at=time.time()
        )

        # Track URL -> products mapping
        if image_url not in self._url_to_products:
            self._url_to_products[image_url] = []
        self._url_to_products[image_url].append(product_id)

    def get_image(self, product_id: int) -> Optional[bytes]:
        """Get cached image."""
        return self._images.get(product_id)

    def has_image(self, product_id: int) -> bool:
        """Check if image is cached."""
        return product_id in self._images

    def clear(self):
        """Clear all cached images."""
        self._images.clear()
        self._metadata.clear()
        self._url_to_products.clear()

    def get_stats(self) -> dict:
        """Get cache statistics."""
        total_size = sum(len(img) for img in self._images.values())
        return {
            "totalImages": len(self._images),
            "totalSizeBytes": total_size,
            "totalSizeMB": round(total_size / (1024 * 1024), 2),
            "uniqueUrls": len(self._url_to_products),
            "initialized": self._initialized
        }

    def get_metadata(self, product_id: int) -> Optional[dict]:
        """Get image metadata."""
        meta = self._metadata.get(product_id)
        if meta:
            return {
                "productId": meta.product_id,
                "url": meta.url,
                "sizeBytes": meta.size_bytes,
                "loadedAt": meta.loaded_at
            }
        return None


# Singleton instance
image_cache = ImageCache()


class CacheService:
    def __init__(self):
        self.cache = image_cache
        self.batch_size = settings.image_cache_batch_size
        self.timeout = settings.image_cache_timeout / 1000  # Convert to seconds

    async def initialize(self):
        """Load all product images on startup."""
        if self.cache._initialized:
            logger.info("Cache already initialized, skipping")
            return

        logger.info("Starting image cache initialization...")

        try:
            with get_db() as db:
                products = db.query("SELECT id, image_url FROM products WHERE image_url IS NOT NULL")

            logger.info(f"Found {len(products)} products with images")

            # Process in batches
            for i in range(0, len(products), self.batch_size):
                batch = products[i:i + self.batch_size]
                await self._load_batch(batch)
                logger.info(f"Loaded batch {i // self.batch_size + 1}/{(len(products) + self.batch_size - 1) // self.batch_size}")

            self.cache._initialized = True
            stats = self.cache.get_stats()
            logger.info(f"Image cache initialized: {stats['totalImages']} images, {stats['totalSizeMB']}MB")

        except Exception as e:
            logger.error(f"Failed to initialize image cache: {e}")
            # Don't block app startup on cache failure

    async def _load_batch(self, products: List[dict]):
        """Load a batch of product images."""
        tasks = []
        for product in products:
            tasks.append(self._load_single_image(product['id'], product['image_url']))
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _load_single_image(self, product_id: int, image_url: str):
        """Load a single image."""
        # Check if URL already loaded (deduplication)
        if image_url in self.cache._url_to_products:
            # Reuse existing image data
            existing_product_id = self.cache._url_to_products[image_url][0]
            existing_image = self.cache.get_image(existing_product_id)
            if existing_image:
                self.cache.load_image(product_id, image_url, existing_image)
                return

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=self.timeout)
                response.raise_for_status()
                self.cache.load_image(product_id, image_url, response.content)
        except Exception as e:
            logger.warning(f"Failed to load image for product {product_id}: {e}")

    def get_stats(self) -> dict:
        """Get cache statistics."""
        return self.cache.get_stats()

    def get_health(self) -> dict:
        """Get cache health status."""
        stats = self.cache.get_stats()
        return {
            "status": "healthy" if stats["initialized"] else "initializing",
            "imageCount": stats["totalImages"],
            "sizeMB": stats["totalSizeMB"]
        }

    async def reload(self):
        """Manually reload cache."""
        self.cache.clear()
        self.cache._initialized = False
        await self.initialize()
        return self.get_stats()
