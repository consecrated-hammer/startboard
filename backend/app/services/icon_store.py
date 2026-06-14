"""Local icon ingestion and caching.

Icons chosen from third-party providers are fetched once, saved under
``settings.favicon_dir``, and then served locally from ``/api/icons``.
"""

import hashlib
import mimetypes
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.config import settings

LOCAL_ICON_PREFIX = "/api/icons/"
MAX_ICON_BYTES = 2 * 1024 * 1024
DEFAULT_TIMEOUT = 10.0
ALLOWED_UPLOAD_EXTS = {".svg", ".png", ".ico", ".webp", ".jpg", ".jpeg", ".gif"}

CONTENT_TYPE_TO_EXT = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
}


def icon_dir() -> Path:
    path = Path(settings.favicon_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_local_icon_path(value: str | None) -> bool:
    if not value:
        return False
    if value.startswith(LOCAL_ICON_PREFIX):
        return True
    parsed = urlparse(value)
    return parsed.path.startswith(LOCAL_ICON_PREFIX)


def public_icon_path(filename: str) -> str:
    return f"{LOCAL_ICON_PREFIX}{filename}"


def _guess_extension(content_type: str | None, source_url: str) -> str:
    base_type = (content_type or "").split(";", 1)[0].strip().lower()
    if base_type in CONTENT_TYPE_TO_EXT:
        return CONTENT_TYPE_TO_EXT[base_type]

    guessed = Path(urlparse(source_url).path).suffix.lower()
    if guessed in {".svg", ".png", ".ico", ".webp", ".jpg", ".jpeg", ".gif"}:
        return ".jpg" if guessed == ".jpeg" else guessed

    guessed_mime, _ = mimetypes.guess_type(source_url)
    if guessed_mime in CONTENT_TYPE_TO_EXT:
        return CONTENT_TYPE_TO_EXT[guessed_mime]
    return ".bin"


def _download_icon(source_url: str) -> tuple[bytes, str]:
    with httpx.Client(follow_redirects=True, timeout=DEFAULT_TIMEOUT) as client:
        response = client.get(source_url)
        response.raise_for_status()
        data = response.content
        if not data:
            raise ValueError("Downloaded icon is empty")
        if len(data) > MAX_ICON_BYTES:
            raise ValueError("Downloaded icon exceeds size limit")
        return data, _guess_extension(response.headers.get("content-type"), source_url)


def _format_limit(limit_bytes: int) -> str:
    if limit_bytes % (1024 * 1024) == 0:
        return f"{limit_bytes // (1024 * 1024)} MB"
    return f"{limit_bytes // 1024} KB"


def _upload_limits() -> dict[str, int]:
    return {
        ".svg": settings.icon_upload_max_svg_bytes,
        ".ico": settings.icon_upload_max_ico_bytes,
        ".png": settings.icon_upload_max_png_bytes,
        ".webp": settings.icon_upload_max_webp_bytes,
        ".jpg": settings.icon_upload_max_jpg_bytes,
        ".jpeg": settings.icon_upload_max_jpg_bytes,
        ".gif": settings.icon_upload_max_gif_bytes,
    }


def _store_icon_bytes(data: bytes, ext: str) -> str:
    normalized_ext = ".jpg" if ext == ".jpeg" else ext.lower()
    if not data:
        raise ValueError("Icon file is empty")
    if normalized_ext not in ALLOWED_UPLOAD_EXTS:
        raise ValueError("Unsupported icon format")
    size_limit = _upload_limits().get(normalized_ext, MAX_ICON_BYTES)
    if len(data) > size_limit:
        raise ValueError(f"{normalized_ext[1:].upper()} icon exceeds size limit ({_format_limit(size_limit)} max)")
    digest = hashlib.sha256(data).hexdigest()[:24]
    filename = f"{digest}{normalized_ext}"
    destination = icon_dir() / filename
    if not destination.exists():
        destination.write_bytes(data)
    return public_icon_path(filename)


def ingest_uploaded_icon(data: bytes, filename: str | None = None, content_type: str | None = None) -> str:
    ext = ""
    if content_type:
        ext = CONTENT_TYPE_TO_EXT.get(content_type.split(";", 1)[0].strip().lower(), "")
    if not ext and filename:
        candidate = Path(filename).suffix.lower()
        if candidate in ALLOWED_UPLOAD_EXTS:
            ext = ".jpg" if candidate == ".jpeg" else candidate
    if not ext:
        raise ValueError("Unsupported icon format")
    return _store_icon_bytes(data, ext)


def ingest_remote_icon(source_url: str | None) -> str | None:
    """Download and cache a remote icon, returning a local API path.

    Relative/local paths are returned unchanged. If the download fails, the
    original source URL is returned so the UI still has something to render.
    """
    if not source_url:
        return None
    if is_local_icon_path(source_url):
        return source_url

    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        return source_url

    try:
        data, ext = _download_icon(source_url)
        return _store_icon_bytes(data, ext)
    except Exception:
        return source_url
