"""Helpers for bookmark URLs that may be visibility-only."""

from __future__ import annotations

from urllib.parse import quote

DOCKER_PLACEHOLDER_URL_PREFIX = "docker://"


def docker_placeholder_url(ref: str) -> str:
    cleaned = (ref or "").strip()
    return f"{DOCKER_PLACEHOLDER_URL_PREFIX}{quote(cleaned, safe='-._~')}"


def is_launchable_url(url: str | None) -> bool:
    cleaned = (url or "").strip()
    return bool(cleaned) and not cleaned.startswith(DOCKER_PLACEHOLDER_URL_PREFIX)
