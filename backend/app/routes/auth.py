"""Authentication routes: login / logout / me."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.config import settings
from app.db.database import get_db_connection
from app.deps import get_current_user, require_user
from app.middleware.rate_limit import hit_limit, _client_ip
from app.models.schemas import LoginRequest, PasswordChange, ProfileUpdate, SignupRequest, UserOut
from app.routes._helpers import clear_session_cookie, now_iso, set_session_cookie
from app.utils.security import hash_password, verify_password
from app.utils.session_manager import (
    SESSION_COOKIE_NAME,
    create_session,
    delete_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, request: Request, response: Response):
    # Stricter per-IP limit for credential attempts.
    if hit_limit(
        f"login:{_client_ip(request)}",
        settings.login_rate_limit_per_minute,
        60,
    ):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try later.")

    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (payload.username.strip(),)
        ).fetchone()

    # Constant-ish path: always verify to avoid trivial user enumeration timing.
    valid = bool(row) and bool(row["is_active"]) and verify_password(
        payload.password, row["password_hash"] if row else ""
    )
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    if row["status"] == "rejected":
        raise HTTPException(status_code=403, detail="Your account request was rejected")
    if row["status"] == "disabled":
        raise HTTPException(status_code=403, detail="Your account is disabled")

    session_id, _ = create_session(row["id"])
    set_session_cookie(response, session_id)
    logger.info("User %s logged in", row["username"])
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


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(payload: SignupRequest):
    username = payload.username.strip()
    email = payload.email.strip().lower()
    ts = now_iso()
    with get_db_connection() as conn:
        exists = conn.execute(
            "SELECT id FROM users WHERE username = ? OR lower(email) = ?",
            (username, email),
        ).fetchone()
        if exists is not None:
            raise HTTPException(status_code=409, detail="Username or email already exists")
        cur = conn.execute(
            """
            INSERT INTO users (
                username, email, display_name, password_hash, role, is_active, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'user', 1, 'pending', ?, ?)
            """,
            (username, email, payload.display_name, hash_password(payload.password), ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "display_name": row["display_name"],
        "icon_url": row["icon_url"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
        "status": row["status"] or "pending",
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    delete_session(request.cookies.get(SESSION_COOKIE_NAME))
    clear_session_cookie(response)
    return {"ok": True}


@router.post("/password")
def change_password(payload: PasswordChange, user: dict = Depends(require_user)):
    """Let the signed-in user change their own password."""
    with get_db_connection() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        conn.execute(
            "UPDATE users SET password_hash=?, updated_at=? WHERE id=?",
            (hash_password(payload.new_password), now_iso(), user["id"]),
        )
        conn.commit()
    return {"ok": True}


@router.post("/profile", response_model=UserOut)
def update_profile(payload: ProfileUpdate, user: dict = Depends(require_user)):
    """Let the signed-in user update their own profile (avatar icon)."""
    icon_url = (payload.icon_url or "").strip() or None
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE users SET icon_url=?, updated_at=? WHERE id=?",
            (icon_url, now_iso(), user["id"]),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
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


@router.get("/me", response_model=UserOut | None)
def me(user: dict | None = Depends(get_current_user)):
    if user is None:
        return None
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user.get("email"),
        "display_name": user["display_name"],
        "icon_url": user["icon_url"],
        "role": user["role"],
        "is_active": bool(user.get("is_active", True)),
        "status": user.get("status", "active"),
    }
