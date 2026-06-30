"""Local icon ingestion and caching.

Icons chosen from third-party providers are fetched once, saved under
``settings.favicon_dir``, and then served locally from ``/api/icons``.
"""

import hashlib
import mimetypes
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.config import settings
from app.services.url_guard import (
    UnsafeUrlError,
    fetch_public_url,
    resolve_public_redirect,
)

LOCAL_ICON_PREFIX = "/api/icons/"
TINTABLE_QUERY_KEY = "sb_tintable"
MAX_ICON_BYTES = 2 * 1024 * 1024
DEFAULT_TIMEOUT = 10.0
MAX_REDIRECTS = 5
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

LOCAL_ICON_FILENAME_RE = re.compile(r"^[0-9a-f]{24}\.(svg|png|ico|webp|jpg|gif)$")


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


def _append_query_value(path: str, key: str, value: str) -> str:
    parsed = urlparse(path)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query[key] = value
    return urlunparse(parsed._replace(query=urlencode(query)))


def _strip_internal_query_params(source_url: str) -> tuple[str, bool]:
    parsed = urlparse(source_url)
    query_items = []
    tintable = False
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key == TINTABLE_QUERY_KEY:
            tintable = value == "1"
            continue
        query_items.append((key, value))
    cleaned = urlunparse(parsed._replace(query=urlencode(query_items)))
    return cleaned, tintable


def local_icon_file(filename: str) -> Path:
    normalized = (filename or "").strip().lower()
    if not LOCAL_ICON_FILENAME_RE.fullmatch(normalized):
        raise ValueError("Invalid icon filename")
    for candidate in icon_dir().iterdir():
        if candidate.is_file() and candidate.name.lower() == normalized:
            return candidate
    raise FileNotFoundError(normalized)


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
    current = source_url
    for _ in range(MAX_REDIRECTS + 1):
        response = fetch_public_url(
            current,
            timeout=DEFAULT_TIMEOUT,
            max_bytes=MAX_ICON_BYTES,
            headers={"Accept": "image/*,*/*;q=0.1"},
        )
        if response.is_redirect:
            location = response.headers.get("location")
            if not location:
                raise ValueError("Redirect response missing location")
            current = resolve_public_redirect(current, location)
            continue
        if response.status >= 400:
            raise ValueError("Icon download failed")
        data = response.body
        if not data:
            raise ValueError("Downloaded icon is empty")
        if len(data) > MAX_ICON_BYTES:
            raise ValueError("Downloaded icon exceeds size limit")
        return data, _guess_extension(response.headers.get("content-type"), current)
    raise ValueError("Too many redirects")


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
        raise ValueError(
            f"{normalized_ext[1:].upper()} icon exceeds size limit ({_format_limit(size_limit)} max)"
        )
    digest = hashlib.sha256(data).hexdigest()[:24]
    filename = f"{digest}{normalized_ext}"
    destination = icon_dir() / filename
    if not destination.exists():
        destination.write_bytes(data)
    return public_icon_path(filename)


def ingest_uploaded_icon(
    data: bytes, filename: str | None = None, content_type: str | None = None
) -> str:
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
    cleaned_source_url, tintable = _strip_internal_query_params(source_url)
    if is_local_icon_path(cleaned_source_url):
        return source_url

    parsed = urlparse(cleaned_source_url)
    if parsed.scheme not in {"http", "https"}:
        return cleaned_source_url

    try:
        data, ext = _download_icon(cleaned_source_url)
        stored = _store_icon_bytes(data, ext)
        if tintable and ext == ".svg":
            return _append_query_value(stored, TINTABLE_QUERY_KEY, "1")
        return stored
    except UnsafeUrlError:
        return None
    except Exception:
        return cleaned_source_url


def recolor_svg_bytes(data: bytes, color: str) -> bytes:
    svg = data.decode("utf-8")
    cleaned_color = color.strip()
    if not cleaned_color:
        return data

    svg = re.sub(
        r'fill="(?!none\b|currentColor\b|url\()[^"]*"',
        'fill="currentColor"',
        svg,
        flags=re.IGNORECASE,
    )
    svg = re.sub(
        r"fill='(?!none\b|currentColor\b|url\()[^']*'",
        "fill='currentColor'",
        svg,
        flags=re.IGNORECASE,
    )
    svg = re.sub(
        r'stroke="(?!none\b|currentColor\b|url\()[^"]*"',
        'stroke="currentColor"',
        svg,
        flags=re.IGNORECASE,
    )
    svg = re.sub(
        r"stroke='(?!none\b|currentColor\b|url\()[^']*'",
        "stroke='currentColor'",
        svg,
        flags=re.IGNORECASE,
    )
    svg = re.sub(
        r"fill\s*:\s*(?!none\b|currentColor\b|url\()[^;\"']+",
        "fill:currentColor",
        svg,
        flags=re.IGNORECASE,
    )
    svg = re.sub(
        r"stroke\s*:\s*(?!none\b|currentColor\b|url\()[^;\"']+",
        "stroke:currentColor",
        svg,
        flags=re.IGNORECASE,
    )
    style_block = (
        f"<style>"
        f"svg{{color:{cleaned_color};}}"
        f'[fill]:not([fill="none"]):not([fill="currentColor"]){{fill:currentColor!important;}}'
        f'[stroke]:not([stroke="none"]):not([stroke="currentColor"]){{stroke:currentColor!important;}}'
        f"path:not([fill]),circle:not([fill]),rect:not([fill]),polygon:not([fill]),ellipse:not([fill]){{fill:currentColor!important;}}"
        f"</style>"
    )
    if "<svg" not in svg:
        return data
    svg = re.sub(
        r"(<svg\b[^>]*>)", rf"\1{style_block}", svg, count=1, flags=re.IGNORECASE
    )
    return svg.encode("utf-8")
