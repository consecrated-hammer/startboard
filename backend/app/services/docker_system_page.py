"""Persist the Docker inventory as a normal, user-owned Startboard page."""

from __future__ import annotations

import logging
import sqlite3

from app.routes._helpers import now_iso, slugify
from app.services.bookmark_links import docker_placeholder_url
from app.services.docker_status import discover_docker_workloads

logger = logging.getLogger(__name__)

DOCKER_SYSTEM_PAGE_TYPE = "docker_system"
DOCKER_SYSTEM_PAGE_REF = "default"
DOCKER_SYSTEM_GROUP_TYPE = "docker_system_group"
DOCKER_SYSTEM_BOOKMARK_TYPE = "docker_system_service"
DOCKER_SYSTEM_OWNER_ID = 1
DOCKER_SYSTEM_PAGE_TITLE = "Docker services"
FALLBACK_GROUP = "Other Docker services"


def is_docker_system_page(page) -> bool:
    return bool(page and page["source_type"] == DOCKER_SYSTEM_PAGE_TYPE)


def ensure_docker_system_page(conn: sqlite3.Connection):
    """Create the page once, copying page 1's presentation defaults."""
    page = conn.execute(
        "SELECT * FROM pages WHERE source_type = ? AND source_ref = ? ORDER BY id LIMIT 1",
        (DOCKER_SYSTEM_PAGE_TYPE, DOCKER_SYSTEM_PAGE_REF),
    ).fetchone()
    if page is not None:
        return page

    owner = conn.execute("SELECT id FROM users WHERE id = ?", (DOCKER_SYSTEM_OWNER_ID,)).fetchone()
    if owner is None:
        logger.warning("Cannot create Docker system page: owner %s does not exist", DOCKER_SYSTEM_OWNER_ID)
        return None

    template = conn.execute("SELECT * FROM pages WHERE id = ?", (DOCKER_SYSTEM_OWNER_ID,)).fetchone()
    if template is None:
        template = conn.execute(
            "SELECT * FROM pages WHERE owner_id = ? ORDER BY position, id LIMIT 1",
            (DOCKER_SYSTEM_OWNER_ID,),
        ).fetchone()

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(pages)").fetchall()}
    excluded = {"id", "share_id", "created_at", "updated_at", "source_type", "source_ref"}
    copied = [name for name in columns if name not in excluded]
    values = {name: (template[name] if template is not None else None) for name in copied}
    values.update({
        "owner_id": DOCKER_SYSTEM_OWNER_ID,
        "title": DOCKER_SYSTEM_PAGE_TITLE,
        "description": "",
        "slug": slugify(DOCKER_SYSTEM_PAGE_TITLE),
        "visibility": "private",
        "is_archived": 0,
        "position": conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM pages WHERE owner_id = ?",
            (DOCKER_SYSTEM_OWNER_ID,),
        ).fetchone()["p"],
    })
    # These fields have defaults in the schema; use them when there is no template.
    defaults = {"max_cols": 4, "open_new_tab": 1, "layout_mode": "natural", "auto_balance": 0,
                "single_row_order": "natural", "card_gap": 12, "card_gap_x": 16, "bookmark_gap": 2,
                "card_max_width": 0, "group_align": "center", "search_mode": "inherit",
                "show_overview": 0, "analytics_enabled": 0, "bg_image_mode": "external",
                "bg_image_fit": "cover", "bg_image_position": "center", "bg_render_enabled": 0,
                "bg_render_position": "center", "bg_slideshow_enabled": 0,
                "bg_slideshow_interval_value": 30, "bg_slideshow_interval_unit": "seconds",
                "bg_slideshow_advance_mode": "random"}
    for name, value in defaults.items():
        if name in values and values[name] is None:
            values[name] = value

    insert_columns = [*copied, "source_type", "source_ref", "created_at", "updated_at"]
    ts = now_iso()
    insert_values = [values.get(name) for name in copied] + [
        DOCKER_SYSTEM_PAGE_TYPE, DOCKER_SYSTEM_PAGE_REF, ts, ts,
    ]
    placeholders = ", ".join("?" for _ in insert_columns)
    cur = conn.execute(
        f"INSERT INTO pages ({', '.join(insert_columns)}) VALUES ({placeholders})",
        insert_values,
    )
    return conn.execute("SELECT * FROM pages WHERE id = ?", (cur.lastrowid,)).fetchone()


def _group_workloads(workloads: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for workload in workloads:
        title = (workload.get("group_hint") or "").strip() or FALLBACK_GROUP
        grouped.setdefault(title, []).append(workload)
    return grouped


def _ensure_group(conn: sqlite3.Connection, page_id: int, label: str):
    group = conn.execute(
        "SELECT * FROM groups WHERE page_id = ? AND source_type = ? AND source_ref = ?",
        (page_id, DOCKER_SYSTEM_GROUP_TYPE, label),
    ).fetchone()
    if group is not None:
        return group
    counts = {index: 0 for index in range(4)}
    for row in conn.execute("SELECT col, COUNT(*) AS count FROM groups WHERE page_id = ? GROUP BY col", (page_id,)):
        counts[row["col"] if row["col"] in counts else 0] = row["count"]
    column = min(counts, key=counts.get)
    position = conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM groups WHERE page_id = ? AND col = ?",
        (page_id, column),
    ).fetchone()["p"]
    ts = now_iso()
    cur = conn.execute(
        """
        INSERT INTO groups (page_id, title, source_type, source_ref, col, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (page_id, label, DOCKER_SYSTEM_GROUP_TYPE, label, column, position, ts, ts),
    )
    return conn.execute("SELECT * FROM groups WHERE id = ?", (cur.lastrowid,)).fetchone()


def sync_docker_system_page(conn: sqlite3.Connection, endpoint: str) -> int | None:
    """Synchronise every Docker-reported workload without overwriting user styling."""
    page = ensure_docker_system_page(conn)
    if page is None:
        return None
    grouped = _group_workloads(discover_docker_workloads(endpoint))
    desired_keys: set[str] = set()
    for label in sorted(grouped, key=str.lower):
        group = _ensure_group(conn, page["id"], label)
        for workload in sorted(grouped[label], key=lambda item: (item["title"].lower(), item["key"].lower())):
            key = workload["key"]
            desired_keys.add(key)
            existing = conn.execute(
                """
                SELECT b.* FROM bookmarks b JOIN groups g ON g.id = b.group_id
                WHERE g.page_id = ? AND b.source_type = ? AND b.source_ref = ?
                """,
                (page["id"], DOCKER_SYSTEM_BOOKMARK_TYPE, key),
            ).fetchone()
            url = workload.get("href") or docker_placeholder_url(key)
            if existing is None:
                position = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM bookmarks WHERE group_id = ?",
                    (group["id"],),
                ).fetchone()["p"]
                conn.execute(
                    """
                    INSERT INTO bookmarks (group_id, title, url, icon_url, description, source_type, source_ref, docker_ref, position, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (group["id"], workload["title"], url, workload.get("icon_url"), workload.get("description"),
                     DOCKER_SYSTEM_BOOKMARK_TYPE, key, key, position, now_iso(), now_iso()),
                )
            else:
                conn.execute(
                    """
                    UPDATE bookmarks SET group_id=?, title=?, url=?, icon_url=?, description=?, docker_ref=?, updated_at=? WHERE id=?
                    """,
                    (group["id"], workload["title"], url, workload.get("icon_url"), workload.get("description"), key, now_iso(), existing["id"]),
                )
    stale = conn.execute(
        """
        SELECT b.id, b.source_ref FROM bookmarks b JOIN groups g ON g.id = b.group_id
        WHERE g.page_id = ? AND b.source_type = ?
        """,
        (page["id"], DOCKER_SYSTEM_BOOKMARK_TYPE),
    ).fetchall()
    for bookmark in stale:
        if bookmark["source_ref"] not in desired_keys:
            conn.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark["id"],))
    conn.commit()
    return page["id"]
