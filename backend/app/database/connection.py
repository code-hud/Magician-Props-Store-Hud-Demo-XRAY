import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from typing import Generator, Any, List, Optional
import logging
import re

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def sanitize_query(query: str, max_length: int = 500) -> str:
    """Sanitize query for logging - remove extra whitespace and truncate."""
    sanitized = re.sub(r'\s+', ' ', query).strip()
    if len(sanitized) > max_length:
        return sanitized[:max_length] + "..."
    return sanitized


class DatabaseConnection:
    """Request-scoped database connection wrapper."""

    def __init__(self):
        self._connection = None
        self._connected = False

    def _ensure_connection(self):
        """Lazy connection - only connect when first query is made."""
        if not self._connected:
            self._connection = psycopg2.connect(
                host=settings.db_host,
                port=settings.db_port,
                database=settings.db_name,
                user=settings.db_user,
                password=settings.db_password,
                cursor_factory=RealDictCursor
            )
            self._connected = True
            logger.debug("Database connection established")

    def query(self, sql: str, params: tuple = None) -> List[dict]:
        """Execute a query and return all results."""
        self._ensure_connection()
        sanitized = sanitize_query(sql)
        logger.debug(f"Executing query: {sanitized}")

        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            if cursor.description:
                return [dict(row) for row in cursor.fetchall()]
            return []

    def query_one(self, sql: str, params: tuple = None) -> Optional[dict]:
        """Execute a query and return first result."""
        results = self.query(sql, params)
        return results[0] if results else None

    def execute(self, sql: str, params: tuple = None) -> int:
        """Execute a statement and return affected row count."""
        self._ensure_connection()
        sanitized = sanitize_query(sql)
        logger.debug(f"Executing statement: {sanitized}")

        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            self._connection.commit()
            return cursor.rowcount

    def execute_returning(self, sql: str, params: tuple = None) -> Optional[dict]:
        """Execute a statement with RETURNING clause."""
        self._ensure_connection()
        sanitized = sanitize_query(sql)
        logger.debug(f"Executing statement: {sanitized}")

        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            self._connection.commit()
            if cursor.description:
                row = cursor.fetchone()
                return dict(row) if row else None
            return None

    def disconnect(self):
        """Close the database connection."""
        if self._connection and self._connected:
            self._connection.close()
            self._connected = False
            logger.debug("Database connection closed")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()


@contextmanager
def get_db() -> Generator[DatabaseConnection, None, None]:
    """Context manager for database connections."""
    db = DatabaseConnection()
    try:
        yield db
    finally:
        db.disconnect()


async def get_db_connection() -> Generator[DatabaseConnection, None, None]:
    """FastAPI dependency for database connections."""
    db = DatabaseConnection()
    try:
        yield db
    finally:
        db.disconnect()
