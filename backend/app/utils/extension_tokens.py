"""Browser extension token helpers.

Tokens are random opaque strings stored server-side as SHA-256 hashes. v1 keeps
one active token per user; rotating simply replaces the row.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from app.db.database import get_db_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def mint_extension_token() -> tuple[str, str]:
    raw = f"sbx_{secrets.token_urlsafe(32)}"
    return raw, _hash_token(raw)


def create_or_replace_extension_token(user_id: int) -> dict:
    raw_token, token_hash = mint_extension_token()
    ts = _now()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO extension_tokens (user_id, token_hash, created_at, updated_at, last_used_at)
            VALUES (?, ?, ?, ?, NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                token_hash=excluded.token_hash,
                updated_at=excluded.updated_at,
                last_used_at=NULL
            """,
            (user_id, token_hash, ts, ts),
        )
        conn.commit()
        row = conn.execute(
            "SELECT user_id, created_at, updated_at, last_used_at FROM extension_tokens WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return {
        "token": raw_token,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_used_at": row["last_used_at"],
    }


def revoke_extension_token(user_id: int) -> None:
    with get_db_connection() as conn:
        conn.execute("DELETE FROM extension_tokens WHERE user_id = ?", (user_id,))
        conn.commit()


def get_extension_token_status(user_id: int) -> dict:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT created_at, updated_at, last_used_at FROM extension_tokens WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return {
            "has_token": False,
            "created_at": None,
            "updated_at": None,
            "last_used_at": None,
        }
    return {
        "has_token": True,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_used_at": row["last_used_at"],
    }


def get_user_for_extension_token(raw_token: str | None) -> dict | None:
    if not raw_token:
        return None
    token_hash = _hash_token(raw_token.strip())
    if not token_hash:
        return None
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.icon_url, u.role, u.is_active
            FROM extension_tokens et
            JOIN users u ON u.id = et.user_id
            WHERE et.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if not row or not bool(row["is_active"]):
            return None
        conn.execute(
            "UPDATE extension_tokens SET last_used_at = ? WHERE user_id = ?",
            (_now(), row["id"]),
        )
        conn.commit()
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "icon_url": row["icon_url"],
            "role": row["role"],
            "is_active": bool(row["is_active"]),
        }
