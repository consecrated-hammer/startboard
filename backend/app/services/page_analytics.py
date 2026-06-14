"""Page analytics tracking and summary helpers."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from app.routes._helpers import now_iso


def record_page_event(
    conn: sqlite3.Connection,
    *,
    page_id: int,
    event_type: str,
    bookmark_id: int | None = None,
    actor_type: str | None = None,
    actor_user_id: int | None = None,
    share_id: str | None = None,
    session_key: str | None = None,
    bookmark_url: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO page_events (
            page_id, bookmark_id, event_type, actor_type, actor_user_id, share_id,
            session_key, bookmark_url, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            page_id,
            bookmark_id,
            event_type,
            actor_type,
            actor_user_id,
            share_id,
            session_key,
            bookmark_url,
            now_iso(),
        ),
    )


def _cutoff(days: int | None) -> str | None:
    if not days:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=max(1, days))).isoformat()


def _event_scope(days: int | None, alias: str = "page_events") -> tuple[str, tuple]:
    cutoff = _cutoff(days)
    if not cutoff:
        return "", ()
    return f" AND {alias}.occurred_at >= ?", (cutoff,)


def _trend_series(conn: sqlite3.Connection, page_id: int, days: int | None) -> list[dict]:
    # Keep the chart stable and readable. "All time" still returns the recorded
    # days only; fixed ranges include zero-value days so the sparkline does not jump.
    event_filter, params = _event_scope(days)
    rows = conn.execute(
        f"""
        SELECT
            substr(occurred_at, 1, 10) AS day,
            SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
        FROM page_events
        WHERE page_id = ?{event_filter}
        GROUP BY substr(occurred_at, 1, 10)
        ORDER BY day
        """,
        (page_id, *params),
    ).fetchall()
    by_day = {row["day"]: {"date": row["day"], "views": row["views"] or 0, "clicks": row["clicks"] or 0} for row in rows}
    if not days:
        return list(by_day.values())

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=max(1, days) - 1)
    series = []
    for offset in range(max(1, days)):
        key = (start + timedelta(days=offset)).isoformat()
        series.append(by_day.get(key, {"date": key, "views": 0, "clicks": 0}))
    return series


def analytics_summary(conn: sqlite3.Connection, page_id: int, days: int | None = None) -> dict:
    event_filter, event_params = _event_scope(days)
    counts = conn.execute(
        f"""
        SELECT
            SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS total_views,
            SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS total_clicks,
            SUM(CASE WHEN event_type = 'view' AND occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS views_7d,
            SUM(CASE WHEN event_type = 'click' AND occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
            MAX(CASE WHEN event_type = 'view' THEN occurred_at END) AS last_view_at,
            MAX(CASE WHEN event_type = 'click' THEN occurred_at END) AS last_click_at,
            COUNT(DISTINCT CASE WHEN event_type = 'view' THEN COALESCE('u' || actor_user_id, 's' || session_key) END) AS unique_viewers
        FROM page_events
        WHERE page_id = ?{event_filter}
        """,
        (page_id, *event_params),
    ).fetchone()

    bookmark_rows = conn.execute(
        f"""
        SELECT
            b.id AS bookmark_id,
            b.title AS title,
            b.url AS url,
            COALESCE(b.icon_url, '') AS icon_url,
            g.title AS group_title,
            COALESCE(SUM(CASE WHEN pe.event_type = 'click' THEN 1 ELSE 0 END), 0) AS clicks,
            MAX(CASE WHEN pe.event_type = 'click' THEN pe.occurred_at END) AS last_clicked_at,
            COUNT(DISTINCT CASE WHEN pe.event_type = 'click' AND pe.session_key IS NOT NULL THEN pe.session_key END) AS unique_clickers
        FROM bookmarks b
        JOIN groups g ON g.id = b.group_id
        LEFT JOIN page_events pe ON pe.bookmark_id = b.id AND pe.page_id = g.page_id
            {"AND pe.occurred_at >= ?" if event_params else ""}
        WHERE g.page_id = ?
        GROUP BY b.id, b.title, b.url, COALESCE(b.icon_url, ''), g.title
        ORDER BY clicks DESC, b.title COLLATE NOCASE
        """,
        (*event_params, page_id),
    ).fetchall()

    clicker_rows = conn.execute(
        f"""
        SELECT
            pe.bookmark_id AS bookmark_id,
            COALESCE(u.display_name, u.username, pe.session_key, 'Unknown viewer') AS actor_label,
            COALESCE(
                CASE
                    WHEN pe.actor_user_id IS NOT NULL THEN 'user'
                    WHEN pe.actor_type IS NOT NULL THEN pe.actor_type
                    ELSE 'unknown'
                END,
                'unknown'
            ) AS actor_type,
            COUNT(*) AS clicks,
            MAX(pe.occurred_at) AS last_clicked_at
        FROM page_events pe
        LEFT JOIN users u ON u.id = pe.actor_user_id
        WHERE pe.page_id = ? AND pe.event_type = 'click' AND pe.bookmark_id IS NOT NULL{event_filter.replace("page_events.", "pe.")}
        GROUP BY pe.bookmark_id, actor_label, actor_type
        ORDER BY pe.bookmark_id, clicks DESC, actor_label COLLATE NOCASE
        """,
        (page_id, *event_params),
    ).fetchall()

    clickers_by_bookmark: dict[int, list[dict]] = {}
    for row in clicker_rows:
        clickers_by_bookmark.setdefault(row["bookmark_id"], []).append(
            {
                "actor_label": row["actor_label"],
                "actor_type": row["actor_type"],
                "clicks": row["clicks"],
                "last_clicked_at": row["last_clicked_at"],
            }
        )

    all_bookmarks = []
    for row in bookmark_rows:
        bookmark_id = row["bookmark_id"]
        all_bookmarks.append(
            {
                "bookmark_id": bookmark_id,
                "title": row["title"],
                "url": row["url"],
                "icon_url": row["icon_url"],
                "group_title": row["group_title"],
                "clicks": row["clicks"] or 0,
                "last_clicked_at": row["last_clicked_at"],
                "unique_clickers": row["unique_clickers"] or 0,
                "clickers": clickers_by_bookmark.get(bookmark_id, []),
            }
        )

    top_links = all_bookmarks[:10]

    unclicked = conn.execute(
        f"""
        SELECT COUNT(*) AS c
        FROM bookmarks b
        JOIN groups g ON g.id = b.group_id
        WHERE g.page_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM page_events pe
            WHERE pe.page_id = g.page_id
              AND pe.bookmark_id = b.id
              AND pe.event_type = 'click'
              {"AND pe.occurred_at >= ?" if event_params else ""}
          )
        """,
        (page_id, *event_params),
    ).fetchone()["c"]

    duplicates = conn.execute(
        """
        SELECT
            url,
            COUNT(*) AS copies,
            GROUP_CONCAT(title, ' • ') AS titles
        FROM (
            SELECT b.url AS url, b.title AS title
            FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE g.page_id = ?
              AND b.url IS NOT NULL
              AND TRIM(b.url) <> ''
            ORDER BY b.title COLLATE NOCASE
        )
        GROUP BY url
        HAVING COUNT(*) > 1
        ORDER BY copies DESC, url COLLATE NOCASE
        LIMIT 50
        """,
        (page_id,),
    ).fetchall()

    # True total of duplicated destinations (the list above is capped for payload).
    duplicate_count = conn.execute(
        """
        SELECT COUNT(*) AS c FROM (
            SELECT b.url
            FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE g.page_id = ?
              AND b.url IS NOT NULL
              AND TRIM(b.url) <> ''
            GROUP BY b.url
            HAVING COUNT(*) > 1
        )
        """,
        (page_id,),
    ).fetchone()["c"]

    views_by_actor = conn.execute(
        f"""
        SELECT COALESCE(actor_type, 'unknown') AS actor_type, COUNT(*) AS count
        FROM page_events
        WHERE page_id = ? AND event_type = 'view'{event_filter}
        GROUP BY COALESCE(actor_type, 'unknown')
        ORDER BY count DESC
        """,
        (page_id, *event_params),
    ).fetchall()

    return {
        "total_views": counts["total_views"] or 0,
        "total_clicks": counts["total_clicks"] or 0,
        "views_7d": counts["views_7d"] or 0,
        "clicks_7d": counts["clicks_7d"] or 0,
        "last_view_at": counts["last_view_at"],
        "last_click_at": counts["last_click_at"],
        "unique_viewers": counts["unique_viewers"] or 0,
        "unclicked_bookmarks": unclicked or 0,
        "top_links": top_links,
        "all_bookmarks": all_bookmarks,
        "duplicate_links": [dict(row) for row in duplicates],
        "duplicate_count": duplicate_count or 0,
        "views_by_actor": [dict(row) for row in views_by_actor],
        "trend": _trend_series(conn, page_id, days),
        "range_days": days,
    }
