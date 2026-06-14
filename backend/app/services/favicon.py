"""Favicon resolution.

When no explicit icon is provided, derive a favicon-provider URL from the
bookmark's domain. The caller may then ingest/cache that remote icon locally.
"""

from urllib.parse import urlparse

from app.config import settings


def domain_of(url: str) -> str | None:
    """Return the host portion of a URL, tolerating missing scheme."""
    if not url:
        return None
    candidate = url if "://" in url else f"https://{url}"
    host = urlparse(candidate).netloc
    return host or None


def resolve_icon(url: str, explicit_icon: str | None = None) -> str | None:
    """Return an icon URL for a bookmark.

    If the caller supplied an explicit icon, keep it. Otherwise build a
    favicon-provider URL from the bookmark's domain.
    """
    if explicit_icon:
        return explicit_icon
    host = domain_of(url)
    if not host:
        return None
    return f"{settings.favicon_fallback_provider}{host}"
