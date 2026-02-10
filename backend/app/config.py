from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    db_host: str = "postgres"
    db_port: int = 5432
    db_name: str = "magician_props_store"
    db_user: str = "postgres"
    db_password: str = "postgres"

    # Application
    port: int = 3001
    service_name: str = "magician-props-api-py"
    log_level: str = "info"

    # External services
    checkout_service_url: str = "https://red-art-630d.omer-b78.workers.dev"

    # Image cache
    image_cache_batch_size: int = 15
    image_cache_timeout: int = 10000

    # AWS X-Ray
    xray_daemon_address: str = "localhost:2000"

    # Hud SDK
    hud_api_key: str = ""
    git_commit_hash: str = "unknown"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
