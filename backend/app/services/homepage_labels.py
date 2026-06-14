"""Import/sync `homepage.*` Docker Compose labels into Startboard."""

from __future__ import annotations

import os
import re
from collections import OrderedDict
from pathlib import Path

import yaml
from dotenv import dotenv_values

from app.config import settings
from app.routes._helpers import now_iso, slugify
from app.services.favicon import resolve_icon
from app.services.icon_store import ingest_remote_icon

SOURCE_TYPE = "homepage_label"

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


def _load_compose_env() -> dict[str, str]:
    values = {
        key: str(value)
        for key, value in dotenv_values(settings.homepage_compose_env_path).items()
        if value is not None
    }
    values.update(os.environ)
    return values


def _interpolate(value: str, env: dict[str, str]) -> str:
    def replace(match):
        key = match.group(1)
        default = match.group(2)
        return env.get(key, default or "")

    return re.sub(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}", replace, value)


def _label_map(raw_labels) -> dict[str, str]:
    if isinstance(raw_labels, dict):
        return {str(k): str(v) for k, v in raw_labels.items()}
    if isinstance(raw_labels, list):
        out = {}
        for item in raw_labels:
            if isinstance(item, str) and "=" in item:
                key, value = item.split("=", 1)
                out[str(key)] = str(value)
        return out
    return {}


def _iconify_url(prefix: str, name: str) -> str:
    base = settings.iconify_api_base_url.rstrip("/")
    return f"{base}/{prefix}/{name}.svg"


def _resolve_homepage_icon(icon: str | None, href: str) -> str | None:
    icon = (icon or "").strip()
    if not icon:
        return resolve_icon(href)
    if icon.startswith(("http://", "https://", "/api/icons/")):
        return icon
    if icon.startswith("si-"):
        return _iconify_url("simple-icons", icon[3:])
    if icon.startswith("mdi-"):
        return _iconify_url("mdi", icon[4:])
    if ":" in icon and "/" not in icon:
        prefix, name = icon.split(":", 1)
        return _iconify_url(prefix, name)
    if icon.endswith((".png", ".svg", ".webp", ".jpg", ".jpeg")):
        stem = Path(icon).stem.lower()
        if stem in ICON_FILE_MAP:
            prefix, name = ICON_FILE_MAP[stem]
            return _iconify_url(prefix, name)
    # Final fallback: use the same favicon resolution as manual bookmarks.
    return resolve_icon(href)


def parse_homepage_compose_labels() -> list[dict]:
    compose_path = Path(settings.homepage_compose_path)
    if not compose_path.exists():
        raise FileNotFoundError(f"Compose file not found: {compose_path}")

    env = _load_compose_env()
    with compose_path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}

    services = data.get("services") or {}
    entries = []
    for service_name, service in services.items():
        labels = _label_map((service or {}).get("labels"))
        name = labels.get("homepage.name", "").strip()
        href = labels.get("homepage.href", "").strip()
        group = labels.get("homepage.group", "").strip()
        if not name or not href or not group:
            continue

        href = _interpolate(href, env)
        title = _interpolate(name, env)
        description = _interpolate(labels.get("homepage.description", "").strip(), env) or None
        icon = _resolve_homepage_icon(_interpolate(labels.get("homepage.icon", "").strip(), env), href)
        entries.append({
            "service": service_name,
            "group": _interpolate(group, env),
            "title": title,
            "href": href,
            "description": description,
            "icon_url": icon,
            "docker_ref": service_name,
        })

    entries.sort(key=lambda item: (item["group"].lower(), item["title"].lower(), item["service"].lower()))
    return entries


def sync_homepage_compose_labels(conn, owner_username: str, page_title: str, prune_missing: bool = False) -> dict:
    owner = conn.execute(
        "SELECT id, username FROM users WHERE username = ?", (owner_username.strip(),)
    ).fetchone()
    if owner is None:
        raise ValueError(f"Owner '{owner_username}' not found")

    entries = parse_homepage_compose_labels()
    if not entries:
        raise ValueError("No homepage.* labels with name, href, and group were found")

    ts = now_iso()
    page = conn.execute(
        "SELECT * FROM pages WHERE owner_id = ? AND title = ? ORDER BY id LIMIT 1",
        (owner["id"], page_title.strip()),
    ).fetchone()
    created_page = False
    if page is None:
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM pages WHERE owner_id = ?",
            (owner["id"],),
        ).fetchone()["m"]
        cur = conn.execute(
            """
            INSERT INTO pages (owner_id, title, slug, visibility, position, card_gap, card_gap_x, bookmark_gap, created_at, updated_at)
            VALUES (?, ?, ?, 'private', ?, 12, 16, 2, ?, ?)
            """,
            (owner["id"], page_title.strip(), slugify(page_title), max_pos + 1, ts, ts),
        )
        page = conn.execute("SELECT * FROM pages WHERE id = ?", (cur.lastrowid,)).fetchone()
        created_page = True

    groups_by_name: OrderedDict[str, list[dict]] = OrderedDict()
    for entry in entries:
        groups_by_name.setdefault(entry["group"], []).append(entry)

    imported_group_refs = set()
    imported_bookmark_refs = set()
    created_groups = updated_groups = created_bookmarks = updated_bookmarks = deleted_bookmarks = deleted_groups = 0

    for g_index, (group_name, items) in enumerate(groups_by_name.items()):
        group_ref = f"group:{group_name}"
        imported_group_refs.add(group_ref)
        group = conn.execute(
            """
            SELECT * FROM groups
            WHERE page_id = ? AND source_type = ? AND source_ref = ?
            """,
            (page["id"], SOURCE_TYPE, group_ref),
        ).fetchone()
        if group is None:
            cur = conn.execute(
                """
                INSERT INTO groups (page_id, title, source_type, source_ref, col, position, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (page["id"], group_name, SOURCE_TYPE, group_ref, g_index % 4, g_index // 4, ts, ts),
            )
            group = conn.execute("SELECT * FROM groups WHERE id = ?", (cur.lastrowid,)).fetchone()
            created_groups += 1
        else:
            conn.execute(
                """
                UPDATE groups SET title=?, col=?, position=?, updated_at=? WHERE id=?
                """,
                (group_name, g_index % 4, g_index // 4, ts, group["id"]),
            )
            group = conn.execute("SELECT * FROM groups WHERE id = ?", (group["id"],)).fetchone()
            updated_groups += 1

        for b_index, item in enumerate(items):
            bookmark_ref = f"service:{item['service']}"
            imported_bookmark_refs.add(bookmark_ref)
            icon_url = ingest_remote_icon(item["icon_url"])
            bookmark = conn.execute(
                """
                SELECT b.* FROM bookmarks b
                JOIN groups g ON g.id = b.group_id
                WHERE g.page_id = ? AND b.source_type = ? AND b.source_ref = ?
                """,
                (page["id"], SOURCE_TYPE, bookmark_ref),
            ).fetchone()
            if bookmark is None:
                conn.execute(
                    """
                    INSERT INTO bookmarks (
                        group_id, title, url, icon_url, description, source_type, source_ref,
                        docker_ref, position, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        group["id"],
                        item["title"],
                        item["href"],
                        icon_url,
                        item["description"],
                        SOURCE_TYPE,
                        bookmark_ref,
                        item["docker_ref"],
                        b_index,
                        ts,
                        ts,
                    ),
                )
                created_bookmarks += 1
            else:
                conn.execute(
                    """
                    UPDATE bookmarks
                    SET group_id=?, title=?, url=?, icon_url=?, description=?, docker_ref=?, position=?, updated_at=?
                    WHERE id=?
                    """,
                    (
                        group["id"],
                        item["title"],
                        item["href"],
                        icon_url,
                        item["description"],
                        item["docker_ref"],
                        b_index,
                        ts,
                        bookmark["id"],
                    ),
                )
                updated_bookmarks += 1

    if prune_missing:
        rows = conn.execute(
            """
            SELECT b.id, b.source_ref FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE g.page_id = ? AND b.source_type = ?
            """,
            (page["id"], SOURCE_TYPE),
        ).fetchall()
        to_delete = [r["id"] for r in rows if r["source_ref"] not in imported_bookmark_refs]
        for bookmark_id in to_delete:
            conn.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
            deleted_bookmarks += 1

        group_rows = conn.execute(
            """
            SELECT id, source_ref FROM groups WHERE page_id = ? AND source_type = ?
            """,
            (page["id"], SOURCE_TYPE),
        ).fetchall()
        for row in group_rows:
            if row["source_ref"] not in imported_group_refs:
                conn.execute("DELETE FROM groups WHERE id = ?", (row["id"],))
                deleted_groups += 1

    conn.commit()
    return {
        "page_id": page["id"],
        "page_title": page["title"],
        "owner_username": owner["username"],
        "created_page": created_page,
        "groups_created": created_groups,
        "groups_updated": updated_groups,
        "groups_deleted": deleted_groups,
        "bookmarks_created": created_bookmarks,
        "bookmarks_updated": updated_bookmarks,
        "bookmarks_deleted": deleted_bookmarks,
        "services_seen": len(entries),
        "prune_missing": prune_missing,
    }
