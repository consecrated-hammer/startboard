"""Application configuration via pydantic-settings.

All environment-driven config is centralised here. Import the cached `settings`
singleton anywhere: `from app.config import settings`.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Only use the Docker secrets dir if it exists (avoids noisy warnings self-hosted).
_secrets_dir = Path("/run/secrets")
_secrets_dir_str = str(_secrets_dir) if _secrets_dir.is_dir() else None


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_env: Literal["development", "production", "testing"] = "development"
    secret_key: str = "dev-secret-change-me"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8002

    # Database
    startboard_db_path: str = "/data/startboard.db"

    # Sessions / cookies
    session_ttl_days: int = 30
    session_cookie_secure: bool = False
    session_cookie_domain: str | None = None

    # CORS (dev only; prod SPA is same-origin)
    frontend_url: str = "http://localhost:5173"
    frontend_allowed_origins: str | None = None

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 120
    rate_limit_window_seconds: int = 60
    login_rate_limit_per_minute: int = 20

    # Favicons
    favicon_dir: str = "/data/icons"
    favicon_fallback_provider: str = "https://www.google.com/s2/favicons?sz=64&domain="
    iconify_api_base_url: str = "https://api.iconify.design"
    icon_upload_max_svg_bytes: int = 256 * 1024
    icon_upload_max_ico_bytes: int = 512 * 1024
    icon_upload_max_png_bytes: int = 1024 * 1024
    icon_upload_max_webp_bytes: int = 1024 * 1024
    icon_upload_max_jpg_bytes: int = 1024 * 1024
    icon_upload_max_gif_bytes: int = 1024 * 1024

    # Managed background images
    managed_images_dir: str = "/data/managed-images"
    managed_variants_dir: str = "/data/managed-variants"
    managed_image_import_dir: str = "/data/imports"
    managed_image_max_upload_bytes: int = 100 * 1024 * 1024

    # Homepage compose-label import
    homepage_compose_path: str = "/imports/dockerconfigs/docker-compose.yml"
    homepage_compose_env_path: str = "/imports/dockerconfigs/.env"

    # Logging
    log_level: str = "INFO"
    log_timezone: str = "Australia/Adelaide"
    log_dir: str = "/data/logs"
    log_file_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        secrets_dir=_secrets_dir_str,
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def allowed_origins(self) -> list[str]:
        if self.frontend_allowed_origins:
            return [o.strip() for o in self.frontend_allowed_origins.split(",") if o.strip()]
        return [self.frontend_url]


@lru_cache()
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once)."""
    return Settings()


settings = get_settings()
