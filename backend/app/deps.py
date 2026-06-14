"""FastAPI dependencies: current user / auth guards."""

from fastapi import Depends, Header, HTTPException, Request, status

from app.utils.extension_tokens import get_user_for_extension_token
from app.utils.session_manager import SESSION_COOKIE_NAME, get_user_for_session


def get_current_user(request: Request) -> dict | None:
    """Return the signed-in user dict, or None for anonymous requests."""
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    return get_user_for_session(session_id)


def require_user(user: dict | None = Depends(get_current_user)) -> dict:
    """Require an authenticated user (401 otherwise)."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    if not user.get("is_active", True) or user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not approved for normal access yet",
        )
    return user


def require_admin(user: dict = Depends(require_user)) -> dict:
    """Require an authenticated admin (403 otherwise)."""
    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return user


def get_extension_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return get_user_for_extension_token(token)


def require_extension_user(user: dict | None = Depends(get_extension_user)) -> dict:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Extension authentication required",
        )
    return user
