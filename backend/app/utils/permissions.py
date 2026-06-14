"""Page access-control helpers.

Rules (see PLAN.md §3):
- can_view: admin OR owner OR page is shared OR an explicit grant row exists.
- can_edit: signed-in AND (admin OR owner OR grant.can_edit). Anonymous never edits.
Anonymous public access is only via share_id resolution (routes/public.py).
"""

import sqlite3


def get_page(conn: sqlite3.Connection, page_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()


def get_page_by_share(conn: sqlite3.Connection, share_id: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pages WHERE share_id = ? AND visibility = 'shared'",
        (share_id,),
    ).fetchone()


def _grant(conn: sqlite3.Connection, page_id: int, user_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM page_permissions WHERE page_id = ? AND user_id = ?",
        (page_id, user_id),
    ).fetchone()


def can_view(conn: sqlite3.Connection, user: dict | None, page: sqlite3.Row) -> bool:
    if page["visibility"] == "shared":
        return True
    if user is None:
        return False
    if user["role"] == "admin" or page["owner_id"] == user["id"]:
        return True
    return _grant(conn, page["id"], user["id"]) is not None


def can_edit(conn: sqlite3.Connection, user: dict | None, page: sqlite3.Row) -> bool:
    if user is None:
        return False
    if user["role"] == "admin" or page["owner_id"] == user["id"]:
        return True
    grant = _grant(conn, page["id"], user["id"])
    return grant is not None and bool(grant["can_edit"])
