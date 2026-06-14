"""Edge companion extension routes."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.db.database import get_db_connection
from app.db.settings_store import get_app_settings
from app.deps import require_extension_user, require_user
from app.models.schemas import ExtensionBookmarkCreate
from app.routes._helpers import bookmark_to_dict, page_to_dict
from app.services.bookmark_ops import create_bookmark_in_group
from app.utils.extension_tokens import (
    create_or_replace_extension_token,
    get_extension_token_status,
    revoke_extension_token,
)
from app.utils.permissions import can_edit, get_page

router = APIRouter(prefix="/extension", tags=["extension"])

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "extension_dist"
ARTIFACT_ZIP = ARTIFACT_DIR / "startboard-edge-companion.zip"


def _normalize_url(url: str) -> str:
    parsed = urlsplit((url or "").strip())
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


@router.get("/token")
def get_extension_token(user: dict = Depends(require_user)):
    status = get_extension_token_status(user["id"])
    return {
        **status,
        "download_url": "/api/extension/download",
        "default_base_url": "",
    }


@router.post("/tokens")
def create_extension_token(user: dict = Depends(require_user)):
    token = create_or_replace_extension_token(user["id"])
    status = get_extension_token_status(user["id"])
    return {**status, **token}


@router.delete("/tokens/current")
def delete_extension_token(user: dict = Depends(require_user)):
    revoke_extension_token(user["id"])
    return {"ok": True}


@router.get("/download")
def download_extension(_: dict = Depends(require_user)):
    if not ARTIFACT_ZIP.exists():
        raise HTTPException(status_code=404, detail="Extension package is not available in this build")
    return FileResponse(
        str(ARTIFACT_ZIP),
        media_type="application/zip",
        filename="startboard-edge-companion.zip",
    )


@router.get("/me")
def extension_me(user: dict = Depends(require_extension_user)):
    site_name = get_app_settings().get("site_name", "Startboard")
    return {
        "site_name": site_name,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
        },
    }


@router.get("/destinations")
def extension_destinations(user: dict = Depends(require_extension_user)):
    with get_db_connection() as conn:
        pages = conn.execute(
            """
            SELECT DISTINCT p.* FROM pages p
            LEFT JOIN page_permissions pp ON pp.page_id = p.id AND pp.user_id = ?
            WHERE (p.owner_id = ? OR pp.user_id IS NOT NULL OR ? = 'admin')
              AND p.is_archived = 0
            ORDER BY p.position, p.id
            """,
            (user["id"], user["id"], user["role"]),
        ).fetchall()
        out = []
        for page in pages:
            if not can_edit(conn, user, page):
                continue
            groups = conn.execute(
                "SELECT * FROM groups WHERE page_id = ? ORDER BY col, position, id",
                (page["id"],),
            ).fetchall()
            out.append({
                "page": page_to_dict(page, user, True),
                "groups": [
                    {
                        "id": group["id"],
                        "title": group["title"],
                        "icon_url": group["icon_url"],
                        "column": group["col"],
                        "position": group["position"],
                    }
                    for group in groups
                ],
            })
    return {"pages": out}


@router.get("/duplicates")
def extension_duplicates(
    url: str = Query(min_length=1, max_length=2048),
    user: dict = Depends(require_extension_user),
):
    normalized = _normalize_url(url)
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.*, g.title AS group_title, p.id AS page_id, p.title AS page_title, p.slug AS page_slug
            FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            JOIN pages p ON p.id = g.page_id
            LEFT JOIN page_permissions pp ON pp.page_id = p.id AND pp.user_id = ?
            WHERE (p.owner_id = ? OR pp.user_id IS NOT NULL OR ? = 'admin')
              AND p.is_archived = 0
            ORDER BY p.title, g.title, b.title
            """,
            (user["id"], user["id"], user["role"]),
        ).fetchall()
        matches = []
        for row in rows:
            page = get_page(conn, row["page_id"])
            if page is None or not can_edit(conn, user, page):
                continue
            row_normalized = _normalize_url(row["url"])
            if row["url"] != url and row_normalized != normalized:
                continue
            matches.append({
                "bookmark": bookmark_to_dict(row),
                "page_id": row["page_id"],
                "page_title": row["page_title"],
                "page_slug": row["page_slug"],
                "group_title": row["group_title"],
            })
    return {"matches": matches}


@router.post("/bookmarks", status_code=201)
def extension_create_bookmark(
    payload: ExtensionBookmarkCreate,
    user: dict = Depends(require_extension_user),
):
    with get_db_connection() as conn:
        group = conn.execute("SELECT * FROM groups WHERE id = ?", (payload.group_id,)).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="Group not found")
        page = get_page(conn, group["page_id"])
        if page is None or not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to save into this group")
        bookmark = create_bookmark_in_group(
            conn,
            user_id=user["id"],
            group_id=payload.group_id,
            url=payload.url,
            title=payload.title,
            description=payload.description,
        )
        conn.commit()
        return {
            "bookmark": bookmark_to_dict(bookmark),
            "page": page_to_dict(page, user, True),
            "group": {"id": group["id"], "title": group["title"]},
        }
