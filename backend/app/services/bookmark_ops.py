"""Shared bookmark creation helpers."""

from __future__ import annotations

import sqlite3

from app.db.settings_store import get_user_preferences
from app.routes._helpers import now_iso
from app.services.favicon import domain_of, resolve_icon
from app.services.bookmark_links import is_launchable_url
from app.services.icon_store import ingest_remote_icon


def create_bookmark_in_group(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    group_id: int,
    url: str,
    title: str | None = None,
    description: str | None = None,
    icon_url: str | None = None,
    docker_ref: str | None = None,
    source_type: str | None = None,
    source_ref: str | None = None,
):
    cleaned_url = url.strip()
    cleaned_title = (title or "").strip() or domain_of(cleaned_url) or cleaned_url
    if icon_url is not None:
        resolved_icon = ingest_remote_icon(icon_url or (resolve_icon(cleaned_url) if is_launchable_url(cleaned_url) else None))
    else:
        resolved_icon = ingest_remote_icon(resolve_icon(cleaned_url)) if is_launchable_url(cleaned_url) else None
    cleaned_docker_ref = (docker_ref or "").strip() or None
    cleaned_source_type = (source_type or "").strip() or None
    cleaned_source_ref = (source_ref or "").strip() or None
    ts = now_iso()
    add_to_top = get_user_preferences(user_id)["add_bookmarks_to_top"]
    if add_to_top:
        conn.execute("UPDATE bookmarks SET position = position + 1 WHERE group_id = ?", (group_id,))
        position = 0
    else:
        position = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM bookmarks WHERE group_id = ?",
            (group_id,),
        ).fetchone()["m"] + 1
    cur = conn.execute(
        """
        INSERT INTO bookmarks (
            group_id, title, url, icon_url, description, source_type, source_ref,
            docker_ref, position, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            group_id,
            cleaned_title,
            cleaned_url,
            resolved_icon,
            description,
            cleaned_source_type,
            cleaned_source_ref,
            cleaned_docker_ref,
            position,
            ts,
            ts,
        ),
    )
    return conn.execute("SELECT * FROM bookmarks WHERE id = ?", (cur.lastrowid,)).fetchone()
