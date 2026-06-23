"""Bookmark routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.db.database import get_db_connection
from app.deps import require_user
from app.models.schemas import BookmarkCreate, BookmarkShareCreate, BookmarkUpdate
from app.routes._helpers import bookmark_to_dict, now_iso
from app.services.bookmark_links import is_launchable_url
from app.services.bookmark_ops import create_bookmark_in_group
from app.services.favicon import resolve_icon
from app.services.icon_store import ingest_remote_icon, ingest_uploaded_icon, local_icon_file, recolor_svg_bytes
from app.utils.permissions import can_edit, get_page

router = APIRouter(tags=["bookmarks"])


def _page_for_group(conn, group_id: int):
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return group, get_page(conn, group["page_id"])


def _page_for_bookmark(conn, bookmark_id: int):
    b = conn.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    if b is None:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (b["group_id"],)).fetchone()
    return b, get_page(conn, group["page_id"])


@router.post("/icons/upload")
async def upload_icon(
    file: UploadFile = File(...), user: dict = Depends(require_user)
):
    del user
    data = await file.read()
    try:
        icon_url = ingest_uploaded_icon(data, filename=file.filename, content_type=file.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"icon_url": icon_url}


@router.get("/icons/render/{filename}")
def render_local_svg_icon(filename: str, color: str):
    if Path(filename).suffix.lower() != ".svg":
        raise HTTPException(status_code=400, detail="Only SVG icons can be recoloured")
    try:
        path = local_icon_file(filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.exists():
        raise HTTPException(status_code=404, detail="Icon not found")
    data = recolor_svg_bytes(path.read_bytes(), color)
    return Response(
        content=data,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post("/groups/{group_id}/bookmarks", status_code=201)
def create_bookmark(
    group_id: int, payload: BookmarkCreate, user: dict = Depends(require_user)
):
    with get_db_connection() as conn:
        _group, page = _page_for_group(conn, group_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        b = create_bookmark_in_group(
            conn,
            user_id=user["id"],
            group_id=group_id,
            url=payload.url,
            title=payload.title,
            description=payload.description,
            icon_url=payload.icon_url,
            icon_color=payload.icon_color,
            docker_ref=payload.docker_ref,
            title_color=payload.title_color,
        )
        conn.commit()
        return bookmark_to_dict(b)


@router.patch("/bookmarks/{bookmark_id}")
def update_bookmark(
    bookmark_id: int, payload: BookmarkUpdate, user: dict = Depends(require_user)
):
    with get_db_connection() as conn:
        b, page = _page_for_bookmark(conn, bookmark_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")

        url = payload.url.strip() if payload.url else b["url"]
        title = payload.title.strip() if payload.title is not None else b["title"]
        description = payload.description if payload.description is not None else b["description"]
        docker_ref = payload.docker_ref.strip() if payload.docker_ref is not None else b["docker_ref"]
        title_color = (payload.title_color or None) if payload.title_color is not None else b["title_color"]
        icon_color = (payload.icon_color or None) if payload.icon_color is not None else b["icon_color"]
        position = payload.position if payload.position is not None else b["position"]

        # If a target group is given, allow moving within or across pages the
        # caller can edit. Cross-page moves append to the end of the new group.
        group_id = b["group_id"]
        if payload.group_id is not None and payload.group_id != group_id:
            target = conn.execute(
                "SELECT page_id FROM groups WHERE id = ?", (payload.group_id,)
            ).fetchone()
            if target is None:
                raise HTTPException(status_code=400, detail="Target group not found")
            if target["page_id"] != page["id"]:
                target_page = get_page(conn, target["page_id"])
                if not can_edit(conn, user, target_page):
                    raise HTTPException(status_code=403, detail="Not allowed to edit the target page")
            group_id = payload.group_id
            if payload.position is None:
                max_pos = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) AS m FROM bookmarks WHERE group_id = ?",
                    (group_id,),
                ).fetchone()["m"]
                position = max_pos + 1

        # Re-resolve icon when an explicit icon is given, or url changed and none set.
        if payload.icon_url is not None:
            fallback_icon = resolve_icon(url) if is_launchable_url(url) else None
            icon = ingest_remote_icon(payload.icon_url or fallback_icon)
        elif payload.url and payload.url.strip() != b["url"] and is_launchable_url(url):
            icon = ingest_remote_icon(resolve_icon(url))
        else:
            icon = b["icon_url"]

        conn.execute(
            """
            UPDATE bookmarks SET group_id=?, title=?, url=?, icon_url=?, description=?, docker_ref=?, title_color=?, position=?, updated_at=?
            WHERE id=?
            """,
            (group_id, title, url, icon, description, docker_ref or None, title_color, position, now_iso(), bookmark_id),
        )
        conn.execute(
            "UPDATE bookmarks SET icon_color=? WHERE id=?",
            (icon_color, bookmark_id),
        )
        conn.commit()
        out = conn.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
        return bookmark_to_dict(out)


@router.post("/bookmarks/{bookmark_id}/duplicate", status_code=201)
def duplicate_bookmark(bookmark_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        b, page = _page_for_bookmark(conn, bookmark_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to duplicate this bookmark")
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM bookmarks WHERE group_id = ?",
            (b["group_id"],),
        ).fetchone()["m"]
        ts = now_iso()
        cur = conn.execute(
            """
            INSERT INTO bookmarks (
                group_id, title, url, icon_url, description, source_type, source_ref,
                docker_ref, title_color, icon_color, position, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                b["group_id"], f'{b["title"]} Copy', b["url"], b["icon_url"], b["description"],
                None, None, b["docker_ref"], b["title_color"], b["icon_color"] if "icon_color" in b.keys() else None, max_pos + 1, ts, ts,
            ),
        )
        conn.commit()
        out = conn.execute("SELECT * FROM bookmarks WHERE id = ?", (cur.lastrowid,)).fetchone()
        return bookmark_to_dict(out)


@router.post("/bookmarks/{bookmark_id}/move")
def move_bookmark_to_edge(bookmark_id: int, payload: dict, user: dict = Depends(require_user)):
    edge = (payload.get("edge") or "").strip()
    if edge not in {"top", "bottom"}:
        raise HTTPException(status_code=400, detail="Edge must be 'top' or 'bottom'")
    with get_db_connection() as conn:
        b, page = _page_for_bookmark(conn, bookmark_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this bookmark")
        rows = conn.execute(
            "SELECT id FROM bookmarks WHERE group_id = ? ORDER BY position, id",
            (b["group_id"],),
        ).fetchall()
        ids = [row["id"] for row in rows if row["id"] != bookmark_id]
        ids = [bookmark_id, *ids] if edge == "top" else [*ids, bookmark_id]
        for pos, bid in enumerate(ids):
            conn.execute("UPDATE bookmarks SET position = ?, updated_at = ? WHERE id = ?", (pos, now_iso(), bid))
        conn.commit()
        out = conn.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
        return bookmark_to_dict(out)


@router.delete("/bookmarks/{bookmark_id}", status_code=204)
def delete_bookmark(bookmark_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        _b, page = _page_for_bookmark(conn, bookmark_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        conn.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
        conn.commit()
    return None


@router.post("/bookmarks/{bookmark_id}/share", status_code=201)
def share_bookmark(bookmark_id: int, payload: BookmarkShareCreate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        bookmark, page = _page_for_bookmark(conn, bookmark_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to share this bookmark")
        target = conn.execute(
            """
            SELECT * FROM users
            WHERE lower(username) = ? OR lower(email) = ?
            ORDER BY CASE WHEN lower(username) = ? THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (
                payload.recipient.strip().lower(),
                payload.recipient.strip().lower(),
                payload.recipient.strip().lower(),
            ),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Recipient user not found")
        if target["id"] == user["id"]:
            raise HTTPException(status_code=400, detail="You already own this bookmark")
        cur = conn.execute(
            """
            INSERT INTO bookmark_share_offers (
                sender_user_id, recipient_user_id, source_bookmark_id, title, url, icon_url, description, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (
                user["id"],
                target["id"],
                bookmark["id"],
                bookmark["title"],
                bookmark["url"],
                bookmark["icon_url"],
                bookmark["description"],
                now_iso(),
            ),
        )
        conn.commit()
        return {
            "id": cur.lastrowid,
            "recipient_user_id": target["id"],
            "recipient_username": target["username"],
            "recipient_email": target["email"],
            "status": "pending",
        }
