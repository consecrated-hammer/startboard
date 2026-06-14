"""Cookie-based session management, persisted in SQLite.

Sessions are random opaque tokens stored server-side; the cookie only carries the
token. No JWTs, no tokens exposed to the frontend.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db.database import get_db_connection

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "startboard_session"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def create_session(user_id: int) -> tuple[str, datetime]:
    """Create a session row for a user; return (session_id, expires_at)."""
    session_id = secrets.token_urlsafe(32)
    now = _now()
    expires = now + timedelta(days=settings.session_ttl_days)
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_id, user_id, created_at, last_used_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, user_id, _iso(now), _iso(now), _iso(expires)),
        )
        conn.commit()
    return session_id, expires


def get_user_for_session(session_id: str | None) -> dict | None:
    """Return the active user dict for a session token, or None.

    Touches `last_used_at` and rejects expired / inactive accounts.
    """
    if not session_id:
        return None
    now = _now()
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT
                u.id, u.username, u.email, u.display_name, u.icon_url, u.role,
                u.is_active, u.status, s.expires_at
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.session_id = ?
            """,
            (session_id,),
        ).fetchone()
        if row is None:
            return None
        if not row["is_active"]:
            return None
        try:
            if datetime.fromisoformat(row["expires_at"]) < now:
                conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
                conn.commit()
                return None
        except (TypeError, ValueError):
            return None
        conn.execute(
            "UPDATE sessions SET last_used_at = ? WHERE session_id = ?",
            (_iso(now), session_id),
        )
        conn.commit()
        return {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "display_name": row["display_name"],
            "icon_url": row["icon_url"],
            "role": row["role"],
            "is_active": bool(row["is_active"]),
            "status": row["status"] or "active",
        }


def delete_session(session_id: str | None) -> None:
    """Delete a session (logout)."""
    if not session_id:
        return
    with get_db_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.commit()


def cleanup_expired_sessions() -> int:
    """Remove expired sessions; return count deleted."""
    with get_db_connection() as conn:
        cur = conn.execute(
            "DELETE FROM sessions WHERE expires_at < ?", (_iso(_now()),)
        )
        conn.commit()
        return cur.rowcount
