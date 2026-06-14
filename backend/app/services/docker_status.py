"""Live Docker workload discovery and bookmark status cache."""

from __future__ import annotations

import asyncio
import logging
from threading import Lock
from pathlib import Path

import httpx

from app.config import settings
from app.db.settings_store import get_docker_integration_settings
from app.services.favicon import resolve_icon

logger = logging.getLogger(__name__)

DOCKER_SOURCE_TYPE = "docker_service"

ICON_FILE_MAP = {
    "adguard": ("simple-icons", "adguard"),
    "authelia": ("simple-icons", "authelia"),
    "beszel": ("simple-icons", "beszel"),
    "ddns-updater": ("simple-icons", "duckdns"),
    "filebrowser": ("simple-icons", "filebrowser"),
    "flaresolverr": ("simple-icons", "cloudflare"),
    "gluetun": ("simple-icons", "wireguard"),
    "homepage": ("simple-icons", "homepage"),
    "immich": ("simple-icons", "immich"),
    "jellyfin": ("simple-icons", "jellyfin"),
    "kopia": ("simple-icons", "kopia"),
    "minecraft": ("simple-icons", "minecraft"),
    "ntopng": ("simple-icons", "ntopng"),
    "outline": ("simple-icons", "outline"),
    "plex": ("simple-icons", "plex"),
    "portainer": ("simple-icons", "portainer"),
    "prowlarr": ("simple-icons", "prowlarr"),
    "qbittorrent": ("simple-icons", "qbittorrent"),
    "radarr": ("simple-icons", "radarr"),
    "seerr": ("simple-icons", "overseerr"),
    "sonarr": ("simple-icons", "sonarr"),
    "syncthing": ("simple-icons", "syncthing"),
    "terminal": ("mdi", "console"),
    "traefik": ("simple-icons", "traefikproxy"),
}

_STATUS_CACHE: dict[str, dict] = {}
_CACHE_LOCK = Lock()


def _status_payload(members: list[dict]) -> dict:
    states = {str(item.get("State") or "").lower() for item in members}
    status_text = " ".join(str(item.get("Status") or "").lower() for item in members)
    if "unhealthy" in status_text:
        status = "unhealthy"
    elif states == {"running"} and "healthy" in status_text:
        status = "healthy"
    elif "running" in states:
        status = "running"
    elif states & {"created", "exited", "dead", "paused"}:
        status = "stopped"
    else:
        status = "unknown"
    return {
        "status": status,
        "containers": len(members),
    }


def _docker_client(endpoint: str) -> httpx.Client:
    if endpoint.startswith("unix://"):
        socket_path = endpoint.removeprefix("unix://")
        transport = httpx.HTTPTransport(uds=socket_path)
        return httpx.Client(base_url="http://docker", transport=transport, timeout=10.0)
    normalized = endpoint.rstrip("/")
    return httpx.Client(base_url=normalized, timeout=10.0)


def _fetch_containers(endpoint: str) -> list[dict]:
    with _docker_client(endpoint) as client:
        response = client.get("/containers/json", params={"all": "true"})
        response.raise_for_status()
        payload = response.json()
    return payload if isinstance(payload, list) else []


def _normalize_icon_url(raw_icon: str | None, href: str | None) -> str | None:
    icon = (raw_icon or "").strip()
    if icon:
        if icon.startswith(("http://", "https://", "/api/icons/")):
            return icon
        if icon.startswith("si-"):
            return f"{settings.iconify_api_base_url.rstrip('/')}/simple-icons/{icon[3:]}.svg"
        if icon.startswith("mdi-"):
            return f"{settings.iconify_api_base_url.rstrip('/')}/mdi/{icon[4:]}.svg"
        if ":" in icon and "/" not in icon:
            prefix, name = icon.split(":", 1)
            return f"{settings.iconify_api_base_url.rstrip('/')}/{prefix}/{name}.svg"
        if icon.endswith((".png", ".svg", ".webp", ".jpg", ".jpeg")):
            stem = Path(icon).stem.lower()
            if stem in ICON_FILE_MAP:
                prefix, name = ICON_FILE_MAP[stem]
                return f"{settings.iconify_api_base_url.rstrip('/')}/{prefix}/{name}.svg"
    if href:
        return resolve_icon(href)
    return None


def _title_case_name(value: str) -> str:
    return " ".join(part.capitalize() for part in value.replace("_", "-").split("-") if part) or value


def _build_workloads(containers: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    grouped: dict[str, dict] = {}
    for container in containers:
        labels = container.get("Labels") or {}
        service = str(labels.get("com.docker.compose.service") or "").strip()
        names = [str(name).lstrip("/") for name in (container.get("Names") or []) if name]
        key = service or (names[0] if names else str(container.get("Id") or "")[:12])
        if not key:
            continue
        bucket = grouped.setdefault(
            key,
            {
                "key": key,
                "service": service or None,
                "names": set(),
                "members": [],
            },
        )
        bucket["members"].append(container)
        bucket["names"].update(name for name in names if name)
        if service:
            bucket["names"].add(service)

    workloads = []
    cache: dict[str, dict] = {}
    for key, bucket in grouped.items():
        members = bucket["members"]
        primary = members[0]
        labels = primary.get("Labels") or {}
        names = sorted(bucket["names"])
        href = str(labels.get("homepage.href") or "").strip() or None
        raw_icon = str(labels.get("homepage.icon") or "").strip() or None
        title = str(labels.get("homepage.name") or "").strip() or _title_case_name(key)
        description = str(labels.get("homepage.description") or "").strip() or None
        group_hint = str(labels.get("homepage.group") or "").strip() or None
        status = _status_payload(members)
        workload = {
            "key": key,
            "title": title,
            "description": description,
            "href": href,
            "group_hint": group_hint,
            "icon_url": _normalize_icon_url(raw_icon, href),
            "icon_ref": raw_icon,
            "compose_service": bucket["service"],
            "container_names": names,
            "has_homepage_labels": bool(
                str(labels.get("homepage.name") or "").strip()
                or str(labels.get("homepage.href") or "").strip()
                or str(labels.get("homepage.icon") or "").strip()
                or str(labels.get("homepage.group") or "").strip()
            ),
            "docker_status": status,
            "docker_ref": key,
        }
        workloads.append(workload)
        for alias in names:
            cache[alias] = status
        cache[key] = status

    workloads.sort(key=lambda item: (item["title"].lower(), item["key"].lower()))
    return workloads, cache


def discover_docker_workloads(endpoint: str | None = None) -> list[dict]:
    cfg = get_docker_integration_settings()
    target = endpoint or cfg["api_endpoint"]
    if not target:
        raise ValueError("Docker integration needs an API endpoint")
    containers = _fetch_containers(target)
    workloads, _cache = _build_workloads(containers)
    return workloads


def refresh_docker_status_cache() -> dict[str, dict]:
    cfg = get_docker_integration_settings()
    endpoint = cfg["api_endpoint"]
    if not endpoint:
        raise ValueError("Docker integration needs an API endpoint")
    containers = _fetch_containers(endpoint)
    _workloads, cache = _build_workloads(containers)
    with _CACHE_LOCK:
        _STATUS_CACHE.clear()
        _STATUS_CACHE.update(cache)
    return cache


def get_docker_status(service_name: str) -> dict | None:
    with _CACHE_LOCK:
        return _STATUS_CACHE.get(service_name)


def snapshot_docker_status_cache() -> dict[str, dict]:
    with _CACHE_LOCK:
        return dict(_STATUS_CACHE)


async def docker_status_loop() -> None:
    last_signature = None

    while True:
        cfg = get_docker_integration_settings()
        signature = (cfg["enabled"], cfg["api_endpoint"], cfg["poll_seconds"])
        if signature != last_signature:
            last_signature = signature
            logger.info(
                "Docker integration settings updated: enabled=%s endpoint=%r poll=%ss",
                cfg["enabled"],
                cfg["api_endpoint"],
                cfg["poll_seconds"],
            )

        if cfg["enabled"]:
            try:
                cache = await asyncio.to_thread(refresh_docker_status_cache)
                logger.debug("Docker status cache refreshed for %d services", len(cache))
            except Exception:
                logger.exception("Docker status refresh failed")

        await asyncio.sleep(cfg["poll_seconds"] if cfg["enabled"] else 30)
