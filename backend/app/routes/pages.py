"""Page routes: tab list, full board, CRUD, share, reorder, permissions."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import Response
from fastapi.responses import Response as RawResponse

from app.db.database import get_db_connection
from app.db.settings_store import get_docker_integration_settings, sharing_enabled
from app.deps import get_current_user, require_user
from app.models.schemas import (
    PageCreate,
    PageAnalyticsClick,
    PagePositionsRequest,
    PageUpdate,
    PrivatePageInviteCreate,
    PermissionsUpdate,
    ReorderRequest,
)
from app.routes._helpers import (
    group_to_dict,
    new_share_id,
    now_iso,
    page_to_dict,
    slugify,
)
from app.services.docker_status import get_docker_status, refresh_docker_status_cache
from app.services.managed_images import (
    get_owner_image,
    image_row_to_dict,
    original_image_bytes,
    render_image_bytes,
    resolve_page_background_url,
    select_page_background_image,
)
from app.services.page_analytics import analytics_summary, record_page_event
from app.utils.permissions import can_edit, can_view, get_page

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pages", tags=["pages"])


def _bookmark_extras(rows) -> dict[int, dict]:
    cfg = get_docker_integration_settings()
    if not cfg["enabled"]:
        return {}
    refs = [(row["id"], (row["docker_ref"] or "").strip()) for row in rows if (row["docker_ref"] or "").strip()]
    if not refs:
        return {}

    def collect():
        extras = {}
        for bookmark_id, docker_ref in refs:
            status = get_docker_status(docker_ref)
            if status:
                extras[bookmark_id] = {"docker_status": status}
        return extras

    extras = collect()
    if extras:
        return extras

    try:
        refresh_docker_status_cache()
    except Exception:
        logger.exception("Docker status refresh during page render failed")
        return {}
    return collect()


def _load_page_or_404(conn, page_id: int):
    page = get_page(conn, page_id)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.get("")
def list_pages(user: dict = Depends(require_user)):
    """Pages visible to the user (owned + granted) for the tab bar."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT p.* FROM pages p
            LEFT JOIN page_permissions pp ON pp.page_id = p.id AND pp.user_id = ?
            WHERE (p.owner_id = ? OR pp.user_id IS NOT NULL OR ? = 'admin')
              AND p.is_archived = 0
            ORDER BY p.position, p.id
            """,
            (user["id"], user["id"], user["role"]),
        ).fetchall()
        return [page_to_dict(p, user, can_edit(conn, user, p)) for p in rows]


@router.get("/archived")
def list_archived_pages(user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT p.* FROM pages p
            LEFT JOIN page_permissions pp ON pp.page_id = p.id AND pp.user_id = ?
            WHERE (p.owner_id = ? OR pp.user_id IS NOT NULL OR ? = 'admin')
              AND p.is_archived = 1
            ORDER BY p.updated_at DESC, p.id DESC
            """,
            (user["id"], user["id"], user["role"]),
        ).fetchall()
        return [page_to_dict(p, user, can_edit(conn, user, p)) for p in rows]


@router.put("/positions")
def reorder_pages(payload: PagePositionsRequest, user: dict = Depends(require_user)):
    """Persist tab-bar order: set each page's position to its index in `ids`."""
    with get_db_connection() as conn:
        ts = now_iso()
        for index, page_id in enumerate(payload.ids):
            page = get_page(conn, page_id)
            if page is None:
                raise HTTPException(status_code=404, detail=f"Page {page_id} not found")
            if not can_edit(conn, user, page):
                raise HTTPException(status_code=403, detail="Not allowed to reorder this page")
            conn.execute(
                "UPDATE pages SET position=?, updated_at=? WHERE id=?",
                (index, ts, page_id),
            )
        conn.commit()
        return {"ok": True}


@router.post("", status_code=201)
def create_page(payload: PageCreate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM pages WHERE owner_id = ?",
            (user["id"],),
        ).fetchone()["m"]
        ts = now_iso()
        cur = conn.execute(
            """
            INSERT INTO pages (owner_id, title, slug, visibility, position, single_row_order, card_gap, card_gap_x, bookmark_gap, created_at, updated_at)
            VALUES (?, ?, ?, 'private', ?, 'natural', 12, 16, 2, ?, ?)
            """,
            (user["id"], payload.title.strip(), slugify(payload.title), max_pos + 1, ts, ts),
        )
        conn.commit()
        page = get_page(conn, cur.lastrowid)
        return page_to_dict(page, user, True)


@router.get("/{page_id}")
def get_board(page_id: int, user: dict | None = Depends(get_current_user)):
    """Full board (groups + bookmarks) if the caller may view it."""
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_view(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to view this page")
        editable = can_edit(conn, user, page)
        groups = conn.execute(
            "SELECT * FROM groups WHERE page_id = ? ORDER BY col, position, id", (page_id,)
        ).fetchall()
        out_groups = []
        for g in groups:
            bms = conn.execute(
                "SELECT * FROM bookmarks WHERE group_id = ? ORDER BY position, id",
                (g["id"],),
            ).fetchall()
            out_groups.append(group_to_dict(g, bms, _bookmark_extras(bms)))
        return {
            "page": page_to_dict(page, user, editable),
            "groups": out_groups,
            "can_edit": editable,
        }


@router.get("/{page_id}/background")
def get_page_background(
    page_id: int,
    advance: int = Query(default=0),
    user: dict | None = Depends(get_current_user),
):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_view(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to view this page")
        mode = page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external"
        if mode == "external":
            raise HTTPException(status_code=404, detail="This page uses an external background URL")
        image = select_page_background_image(conn, page, advance=advance)
        if not image:
            raise HTTPException(status_code=404, detail="No managed background image available")
        image_row = get_owner_image(conn, page["owner_id"], image["id"])
        if image_row is None:
            raise HTTPException(status_code=404, detail="Managed background image not found")
        if page["bg_render_enabled"] and page["bg_render_width"] and page["bg_render_height"]:
            content, content_type = render_image_bytes(
                image_row,
                int(page["bg_render_width"]),
                int(page["bg_render_height"]),
                page["bg_render_position"] or "center",
            )
        else:
            content, content_type = original_image_bytes(image_row)
        return RawResponse(content=content, media_type=content_type)


@router.patch("/{page_id}")
def update_page(page_id: int, payload: PageUpdate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        title = payload.title.strip() if payload.title else page["title"]
        description = payload.description if payload.description is not None else page["description"]
        slug = slugify(payload.title) if payload.title else page["slug"]
        position = payload.position if payload.position is not None else page["position"]
        visibility = page["visibility"]
        share_id = page["share_id"]
        is_archived = page["is_archived"] if payload.is_archived is None else int(payload.is_archived)
        if payload.visibility is not None:
            visibility = payload.visibility
            if visibility == "shared":
                if not sharing_enabled():
                    raise HTTPException(status_code=403, detail="Public sharing is disabled by the administrator")
                if not share_id:
                    share_id = new_share_id()
            elif visibility == "private":
                share_id = None

        def pick(val, current):
            return current if val is None else val

        current_layout_mode = page["layout_mode"] if "layout_mode" in page.keys() and page["layout_mode"] else ("balanced" if page["auto_balance"] else "natural")
        layout_mode = pick(payload.layout_mode, current_layout_mode)
        max_cols = pick(payload.max_cols, page["max_cols"])
        open_new_tab = page["open_new_tab"] if payload.open_new_tab is None else int(payload.open_new_tab)
        auto_balance = 1 if layout_mode == "balanced" else 0
        single_row_order = pick(payload.single_row_order, page["single_row_order"])
        card_gap = pick(payload.card_gap, page["card_gap"])
        card_gap_x = pick(payload.card_gap_x, page["card_gap_x"])
        bookmark_gap = pick(payload.bookmark_gap, page["bookmark_gap"])
        card_max_width = pick(payload.card_max_width, page["card_max_width"])
        group_align = pick(payload.group_align, page["group_align"])
        search_mode = pick(payload.search_mode, page["search_mode"])
        show_overview = page["show_overview"] if payload.show_overview is None else int(payload.show_overview)
        analytics_enabled = page["analytics_enabled"] if payload.analytics_enabled is None else int(payload.analytics_enabled)
        bg_image_mode = pick(payload.bg_image_mode, page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external")
        bg_managed_image_id = pick(payload.bg_managed_image_id, page["bg_managed_image_id"] if "bg_managed_image_id" in page.keys() else None)
        bg_image_fit = pick(payload.bg_image_fit, page["bg_image_fit"] if "bg_image_fit" in page.keys() else "cover")
        bg_image_position = pick(payload.bg_image_position, page["bg_image_position"] if "bg_image_position" in page.keys() else "center")
        bg_render_enabled = page["bg_render_enabled"] if payload.bg_render_enabled is None else int(payload.bg_render_enabled)
        bg_render_width = pick(payload.bg_render_width, page["bg_render_width"] if "bg_render_width" in page.keys() else None)
        bg_render_height = pick(payload.bg_render_height, page["bg_render_height"] if "bg_render_height" in page.keys() else None)
        bg_render_position = pick(payload.bg_render_position, page["bg_render_position"] if "bg_render_position" in page.keys() else "center")
        bg_slideshow_enabled = page["bg_slideshow_enabled"] if payload.bg_slideshow_enabled is None else int(payload.bg_slideshow_enabled)
        bg_slideshow_interval_value = pick(payload.bg_slideshow_interval_value, page["bg_slideshow_interval_value"] if "bg_slideshow_interval_value" in page.keys() else 30)
        bg_slideshow_interval_unit = pick(payload.bg_slideshow_interval_unit, page["bg_slideshow_interval_unit"] if "bg_slideshow_interval_unit" in page.keys() else "seconds")
        bg_slideshow_advance_mode = pick(payload.bg_slideshow_advance_mode, page["bg_slideshow_advance_mode"] if "bg_slideshow_advance_mode" in page.keys() else "random")
        bg_color = pick(payload.bg_color, page["bg_color"]) or None
        bg_image = pick(payload.bg_image, page["bg_image"]) or None
        accent = pick(payload.accent, page["accent"]) or None
        bookmark_title_color = pick(payload.bookmark_title_color, page["bookmark_title_color"] if "bookmark_title_color" in page.keys() else None) or None
        icon_color = pick(payload.icon_color, page["icon_color"] if "icon_color" in page.keys() else None) or None
        if bg_image_mode in {"managed_single", "managed_rotation"}:
            if bg_image_mode == "managed_single" and bg_managed_image_id:
                image = get_owner_image(conn, page["owner_id"], bg_managed_image_id)
                if image is None:
                    raise HTTPException(status_code=400, detail="Selected managed image was not found")
        conn.execute(
            """
            UPDATE pages SET title=?, description=?, slug=?, position=?, visibility=?, share_id=?, is_archived=?,
                max_cols=?, open_new_tab=?, layout_mode=?, auto_balance=?, single_row_order=?, card_gap=?, card_gap_x=?, bookmark_gap=?, card_max_width=?,
                group_align=?, search_mode=?, show_overview=?, analytics_enabled=?, bg_image_mode=?, bg_managed_image_id=?, bg_image_fit=?, bg_image_position=?,
                bg_render_enabled=?, bg_render_width=?, bg_render_height=?, bg_render_position=?,
                bg_slideshow_enabled=?, bg_slideshow_interval_value=?, bg_slideshow_interval_unit=?, bg_slideshow_advance_mode=?,
                bg_color=?, bg_image=?, accent=?, bookmark_title_color=?, icon_color=?, updated_at=?
            WHERE id=?
            """,
            (title, description, slug, position, visibility, share_id, is_archived,
             max_cols, open_new_tab, layout_mode, auto_balance, single_row_order, card_gap, card_gap_x, bookmark_gap, card_max_width,
             group_align, search_mode, show_overview, analytics_enabled, bg_image_mode, bg_managed_image_id, bg_image_fit, bg_image_position,
             bg_render_enabled, bg_render_width, bg_render_height, bg_render_position,
             bg_slideshow_enabled, bg_slideshow_interval_value, bg_slideshow_interval_unit, bg_slideshow_advance_mode,
             bg_color, bg_image, accent, bookmark_title_color, icon_color, now_iso(), page_id),
        )
        ts = now_iso()
        if bg_image_mode == "managed_single" and bg_managed_image_id:
            conn.execute("DELETE FROM page_image_assignments WHERE page_id = ? AND mode = 'single'", (page_id,))
            conn.execute(
                """
                INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                VALUES (?, ?, 'single', 0, ?, ?)
                ON CONFLICT(page_id, image_id, mode) DO UPDATE SET updated_at = excluded.updated_at
                """,
                (page_id, bg_managed_image_id, ts, ts),
            )
        elif bg_image_mode == "managed_rotation":
            if bg_managed_image_id:
                exists = conn.execute(
                    "SELECT 1 FROM page_image_assignments WHERE page_id = ? AND image_id = ? AND mode = 'rotation'",
                    (page_id, bg_managed_image_id),
                ).fetchone()
                if exists is None:
                    max_pos = conn.execute(
                        "SELECT COALESCE(MAX(position), -1) AS m FROM page_image_assignments WHERE page_id = ? AND mode = 'rotation'",
                        (page_id,),
                    ).fetchone()["m"]
                    conn.execute(
                        """
                        INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                        VALUES (?, ?, 'rotation', ?, ?, ?)
                        """,
                        (page_id, bg_managed_image_id, int(max_pos or -1) + 1, ts, ts),
                    )
        conn.commit()
        return page_to_dict(get_page(conn, page_id), user, True)


@router.delete("/{page_id}", status_code=204)
def delete_page(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if user["role"] != "admin" and page["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the owner can delete a page")
        conn.execute("DELETE FROM pages WHERE id = ?", (page_id,))
        conn.commit()
    return None


@router.get("/{page_id}/analytics")
def get_page_analytics(
    page_id: int,
    days: int = Query(default=30, ge=0, le=365),
    user: dict = Depends(require_user),
):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to view analytics for this page")
        return {
            "page": page_to_dict(page, user, True),
            "analytics_enabled": bool(page["analytics_enabled"]),
            "summary": analytics_summary(conn, page_id, days or None),
        }


@router.post("/{page_id}/analytics/view", status_code=204)
def track_page_view(page_id: int, payload: dict | None = None, user: dict | None = Depends(get_current_user)):
    del payload
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_view(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to view this page")
        if page["analytics_enabled"]:
            record_page_event(
                conn,
                page_id=page_id,
                event_type="view",
                actor_type="user" if user else "viewer",
                actor_user_id=user["id"] if user else None,
            )
            conn.commit()
    return Response(status_code=204)


@router.post("/{page_id}/analytics/click", status_code=204)
def track_page_click(page_id: int, payload: PageAnalyticsClick, user: dict | None = Depends(get_current_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_view(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to view this page")
        bookmark = conn.execute(
            """
            SELECT b.*
            FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE b.id = ? AND g.page_id = ?
            """,
            (payload.bookmark_id, page_id),
        ).fetchone()
        if bookmark is None:
            raise HTTPException(status_code=404, detail="Bookmark not found on this page")
        if page["analytics_enabled"]:
            record_page_event(
                conn,
                page_id=page_id,
                event_type="click",
                bookmark_id=bookmark["id"],
                actor_type="user" if user else "viewer",
                actor_user_id=user["id"] if user else None,
                session_key=(payload.session_key or "").strip() or None,
                bookmark_url=bookmark["url"],
            )
            conn.commit()
    return Response(status_code=204)


@router.post("/{page_id}/duplicate", status_code=201)
def duplicate_page(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to duplicate this page")
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM pages WHERE owner_id = ? AND is_archived = 0",
            (page["owner_id"],),
        ).fetchone()["m"]
        ts = now_iso()
        base_title = f'{page["title"]} Copy'
        clone_slug = slugify(base_title)
        cur = conn.execute(
            """
            INSERT INTO pages (
                owner_id, title, description, slug, visibility, share_id, is_archived, position,
                max_cols, open_new_tab, layout_mode, auto_balance, single_row_order, card_gap, card_gap_x, bookmark_gap, card_max_width,
                group_align, search_mode, show_overview, analytics_enabled,
                bg_image_mode, bg_managed_image_id, bg_image_fit, bg_image_position, bg_render_enabled, bg_render_width, bg_render_height,
                bg_render_position, bg_slideshow_enabled, bg_slideshow_interval_value, bg_slideshow_interval_unit,
                bg_slideshow_advance_mode, bg_color, bg_image, accent, bookmark_title_color, icon_color, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'private', NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                page["owner_id"], base_title, page["description"], clone_slug, max_pos + 1,
                page["max_cols"], page["open_new_tab"], (page["layout_mode"] if "layout_mode" in page.keys() else ("balanced" if page["auto_balance"] else "natural")), page["auto_balance"], page["single_row_order"], page["card_gap"], page["card_gap_x"],
                page["bookmark_gap"], page["card_max_width"], page["group_align"], page["search_mode"], page["show_overview"],
                page["analytics_enabled"], page["bg_image_mode"], page["bg_managed_image_id"], page["bg_image_fit"], page["bg_image_position"],
                page["bg_render_enabled"], page["bg_render_width"], page["bg_render_height"], page["bg_render_position"],
                page["bg_slideshow_enabled"], page["bg_slideshow_interval_value"], page["bg_slideshow_interval_unit"],
                page["bg_slideshow_advance_mode"], page["bg_color"], page["bg_image"], page["accent"],
                page["bookmark_title_color"] if "bookmark_title_color" in page.keys() else None, page["icon_color"] if "icon_color" in page.keys() else None, ts, ts,
            ),
        )
        new_page_id = cur.lastrowid
        group_map = {}
        for group in conn.execute("SELECT * FROM groups WHERE page_id = ? ORDER BY col, position, id", (page_id,)).fetchall():
            group_cur = conn.execute(
                """
                INSERT INTO groups (
                    page_id, title, icon_url, bg_color, header_bg_color, header_text_color, bookmark_title_color, icon_color, transparency, display_mode, icon_size, bookmark_align,
                    visible_limit, source_type, source_ref, bookmark_sort, col, position, manual_x, manual_y, manual_z, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_page_id, group["title"], group["icon_url"], group["bg_color"], group["header_bg_color"], group["header_text_color"],
                    group["bookmark_title_color"] if "bookmark_title_color" in group.keys() else None, group["icon_color"] if "icon_color" in group.keys() else None, group["transparency"],
                    group["display_mode"], group["icon_size"], group["bookmark_align"], group["visible_limit"], None, None,
                    group["bookmark_sort"], group["col"], group["position"], group["manual_x"] if "manual_x" in group.keys() else 24,
                    group["manual_y"] if "manual_y" in group.keys() else 24, group["manual_z"] if "manual_z" in group.keys() else 0, ts, ts,
                ),
            )
            group_map[group["id"]] = group_cur.lastrowid
        for bookmark in conn.execute(
            """
            SELECT b.* FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE g.page_id = ?
            ORDER BY g.col, g.position, b.position, b.id
            """,
            (page_id,),
        ).fetchall():
            conn.execute(
                """
                INSERT INTO bookmarks (
                    group_id, title, url, icon_url, description, source_type, source_ref,
                    docker_ref, title_color, icon_color, position, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    group_map[bookmark["group_id"]], bookmark["title"], bookmark["url"], bookmark["icon_url"],
                    bookmark["description"], None, None, bookmark["docker_ref"],
                    bookmark["title_color"] if "title_color" in bookmark.keys() else None, bookmark["icon_color"] if "icon_color" in bookmark.keys() else None, bookmark["position"], ts, ts,
                ),
            )
        conn.commit()
        return page_to_dict(get_page(conn, new_page_id), user, True)


@router.post("/{page_id}/share")
def share_page(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to share this page")
        if not sharing_enabled():
            raise HTTPException(status_code=403, detail="Public sharing is disabled by the administrator")
        share_id = page["share_id"] or new_share_id()
        conn.execute(
            "UPDATE pages SET visibility='shared', share_id=?, updated_at=? WHERE id=?",
            (share_id, now_iso(), page_id),
        )
        conn.commit()
        return {"share_id": share_id, "slug": page["slug"], "visibility": "shared"}


@router.delete("/{page_id}/share")
def unshare_page(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to modify this page")
        conn.execute(
            "UPDATE pages SET visibility='private', share_id=NULL, updated_at=? WHERE id=?",
            (now_iso(), page_id),
        )
        conn.commit()
        return {"visibility": "private"}


@router.put("/{page_id}/reorder")
def reorder(page_id: int, payload: ReorderRequest, user: dict = Depends(require_user)):
    """Persist drag/drop: ordered groups, each with its ordered bookmark ids."""
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        valid_groups = {
            r["id"]
            for r in conn.execute(
                "SELECT id FROM groups WHERE page_id = ?", (page_id,)
            ).fetchall()
        }
        ts = now_iso()
        for g in payload.groups:
            if g.group_id not in valid_groups:
                raise HTTPException(status_code=400, detail="Group not on this page")
            conn.execute(
                "UPDATE groups SET col=?, position=?, updated_at=? WHERE id=?",
                (g.column, g.position, ts, g.group_id),
            )
            for idx, bid in enumerate(g.bookmark_ids):
                # Guard: bookmark must belong to this page (any of its groups).
                conn.execute(
                    """
                    UPDATE bookmarks SET group_id=?, position=?, updated_at=?
                    WHERE id=? AND group_id IN (SELECT id FROM groups WHERE page_id=?)
                    """,
                    (g.group_id, idx, ts, bid, page_id),
                )
        conn.commit()
        return {"ok": True}


@router.get("/{page_id}/permissions")
def get_permissions(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if user["role"] != "admin" and page["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the owner can manage sharing")
        rows = conn.execute(
            """
            SELECT pp.user_id, pp.can_edit, u.username, u.display_name
            FROM page_permissions pp JOIN users u ON u.id = pp.user_id
            WHERE pp.page_id = ? ORDER BY u.username
            """,
            (page_id,),
        ).fetchall()
        return [
            {
                "user_id": r["user_id"],
                "username": r["username"],
                "display_name": r["display_name"],
                "can_edit": bool(r["can_edit"]),
            }
            for r in rows
        ]


@router.put("/{page_id}/permissions")
def set_permissions(
    page_id: int, payload: PermissionsUpdate, user: dict = Depends(require_user)
):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if user["role"] != "admin" and page["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the owner can manage sharing")
        ts = now_iso()
        conn.execute("DELETE FROM page_permissions WHERE page_id = ?", (page_id,))
        for item in payload.permissions:
            if item.user_id == page["owner_id"]:
                continue  # owner always has full access; no row needed
            conn.execute(
                """
                INSERT OR REPLACE INTO page_permissions (page_id, user_id, can_edit, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (page_id, item.user_id, int(item.can_edit), ts),
            )
        conn.commit()
        return {"ok": True}


def _resolve_share_target(conn, recipient: str):
    target = recipient.strip().lower()
    return conn.execute(
        """
        SELECT * FROM users
        WHERE lower(username) = ? OR lower(email) = ?
        ORDER BY CASE WHEN lower(username) = ? THEN 0 ELSE 1 END
        LIMIT 1
        """,
        (target, target, target),
    ).fetchone()


@router.get("/{page_id}/invites")
def list_page_invites(page_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if user["role"] != "admin" and page["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the owner can manage private invites")
        rows = conn.execute(
            """
            SELECT psi.*, u.username AS recipient_username, u.email AS recipient_email, u.display_name AS recipient_display_name
            FROM page_share_invites psi
            JOIN users u ON u.id = psi.recipient_user_id
            WHERE psi.page_id = ?
            ORDER BY psi.created_at DESC, psi.id DESC
            """,
            (page_id,),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "recipient_user_id": row["recipient_user_id"],
                "recipient_username": row["recipient_username"],
                "recipient_email": row["recipient_email"],
                "recipient_display_name": row["recipient_display_name"],
                "can_edit": bool(row["can_edit"]),
                "status": row["status"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]


@router.post("/{page_id}/invites", status_code=201)
def create_page_invite(page_id: int, payload: PrivatePageInviteCreate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to share this page privately")
        target = _resolve_share_target(conn, payload.recipient)
        if target is None:
            raise HTTPException(status_code=404, detail="Recipient user not found")
        if target["id"] == page["owner_id"]:
            raise HTTPException(status_code=400, detail="The page owner already has access")
        conn.execute(
            "DELETE FROM page_share_invites WHERE page_id = ? AND recipient_user_id = ?",
            (page_id, target["id"]),
        )
        cur = conn.execute(
            """
            INSERT INTO page_share_invites (
                page_id, sender_user_id, recipient_user_id, can_edit, status, created_at
            ) VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (page_id, user["id"], target["id"], int(payload.can_edit), now_iso()),
        )
        conn.commit()
        return {
            "id": cur.lastrowid,
            "recipient_user_id": target["id"],
            "recipient_username": target["username"],
            "recipient_email": target["email"],
            "can_edit": payload.can_edit,
            "status": "pending",
        }


@router.delete("/{page_id}/invites/{invite_id}")
def revoke_page_invite(page_id: int, invite_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = _load_page_or_404(conn, page_id)
        if user["role"] != "admin" and page["owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the owner can revoke private invites")
        row = conn.execute(
            "SELECT * FROM page_share_invites WHERE id = ? AND page_id = ?",
            (invite_id, page_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        conn.execute("DELETE FROM page_share_invites WHERE id = ?", (invite_id,))
        conn.commit()
        return {"ok": True}
