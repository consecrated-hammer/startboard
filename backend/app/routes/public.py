"""Public, unauthenticated share routes.

Anyone with a page's share link can view it read-only. No auth, no edit.
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import Response as RawResponse

from app.db.database import get_db_connection
from app.db.settings_store import get_docker_integration_settings
from app.models.schemas import PageAnalyticsClick
from app.routes._helpers import group_to_dict
from app.services.docker_status import get_docker_status, refresh_docker_status_cache
from app.services.managed_images import original_image_bytes, render_image_bytes, resolve_page_background_url, select_page_background_image
from app.services.page_analytics import record_page_event
from app.utils.permissions import get_page_by_share

router = APIRouter(prefix="/public", tags=["public"])


def _bookmark_extras(rows) -> dict[int, dict]:
    if not get_docker_integration_settings()["enabled"]:
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
        return {}
    return collect()


@router.get("/p/{share_id}")
def view_shared(share_id: str):
    with get_db_connection() as conn:
        page = get_page_by_share(conn, share_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Shared page not found")
        groups = conn.execute(
            "SELECT * FROM groups WHERE page_id = ? ORDER BY col, position, id", (page["id"],)
        ).fetchall()
        out_groups = []
        for g in groups:
            bms = conn.execute(
                "SELECT * FROM bookmarks WHERE group_id = ? ORDER BY position, id",
                (g["id"],),
            ).fetchall()
            out_groups.append(group_to_dict(g, bms, _bookmark_extras(bms)))
        return {
            "page": {
                "id": page["id"],
                "title": page["title"],
                "slug": page["slug"],
                "share_id": share_id,
                "max_cols": page["max_cols"],
                "open_new_tab": bool(page["open_new_tab"]),
                "auto_balance": bool(page["auto_balance"]),
                "analytics_enabled": bool(page["analytics_enabled"]),
                "card_gap": page["card_gap"],
                "card_gap_x": page["card_gap_x"],
                "bookmark_gap": page["bookmark_gap"],
                "card_max_width": page["card_max_width"],
                "bg_image_mode": page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external",
                "bg_managed_image_id": page["bg_managed_image_id"] if "bg_managed_image_id" in page.keys() else None,
                "bg_image_fit": page["bg_image_fit"] if "bg_image_fit" in page.keys() else "cover",
                "bg_image_position": page["bg_image_position"] if "bg_image_position" in page.keys() else "center",
                "bg_render_enabled": bool(page["bg_render_enabled"]) if "bg_render_enabled" in page.keys() else False,
                "bg_render_width": page["bg_render_width"] if "bg_render_width" in page.keys() else None,
                "bg_render_height": page["bg_render_height"] if "bg_render_height" in page.keys() else None,
                "bg_render_position": page["bg_render_position"] if "bg_render_position" in page.keys() else "center",
                "bg_slideshow_enabled": bool(page["bg_slideshow_enabled"]) if "bg_slideshow_enabled" in page.keys() else False,
                "bg_slideshow_interval_value": page["bg_slideshow_interval_value"] if "bg_slideshow_interval_value" in page.keys() else 30,
                "bg_slideshow_interval_unit": page["bg_slideshow_interval_unit"] if "bg_slideshow_interval_unit" in page.keys() else "seconds",
                "bg_slideshow_advance_mode": page["bg_slideshow_advance_mode"] if "bg_slideshow_advance_mode" in page.keys() else "random",
                "bg_color": page["bg_color"],
                "bg_image": page["bg_image"],
                "background_url": resolve_page_background_url(
                    {
                        "id": page["id"],
                        "bg_image_mode": page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external",
                        "bg_image": page["bg_image"],
                    },
                    public_share_id=share_id,
                ),
                "accent": page["accent"],
                "bookmark_title_color": page["bookmark_title_color"] if "bookmark_title_color" in page.keys() else None,
            },
            "groups": out_groups,
            "can_edit": False,
        }


@router.get("/p/{share_id}/background")
def shared_page_background(share_id: str):
    with get_db_connection() as conn:
        page = get_page_by_share(conn, share_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Shared page not found")
        mode = page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external"
        if mode == "external":
            raise HTTPException(status_code=404, detail="This page uses an external background URL")
        image = select_page_background_image(conn, page)
        if not image:
            raise HTTPException(status_code=404, detail="No managed background image available")
        row = conn.execute("SELECT * FROM managed_images WHERE id = ?", (image["id"],)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Managed background image not found")
        if page["bg_render_enabled"] and page["bg_render_width"] and page["bg_render_height"]:
            content, content_type = render_image_bytes(
                row,
                int(page["bg_render_width"]),
                int(page["bg_render_height"]),
                page["bg_render_position"] or "center",
            )
        else:
            content, content_type = original_image_bytes(row)
        return RawResponse(content=content, media_type=content_type)


@router.post("/p/{share_id}/analytics/view", status_code=204)
def track_shared_view(share_id: str, payload: dict | None = None):
    session_key = ((payload or {}).get("session_key") or "").strip() or None
    with get_db_connection() as conn:
        page = get_page_by_share(conn, share_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Shared page not found")
        if page["analytics_enabled"]:
            record_page_event(
                conn,
                page_id=page["id"],
                event_type="view",
                actor_type="shared",
                share_id=share_id,
                session_key=session_key,
            )
            conn.commit()
    return Response(status_code=204)


@router.post("/p/{share_id}/analytics/click", status_code=204)
def track_shared_click(share_id: str, payload: PageAnalyticsClick):
    with get_db_connection() as conn:
        page = get_page_by_share(conn, share_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Shared page not found")
        bookmark = conn.execute(
            """
            SELECT b.*
            FROM bookmarks b
            JOIN groups g ON g.id = b.group_id
            WHERE b.id = ? AND g.page_id = ?
            """,
            (payload.bookmark_id, page["id"]),
        ).fetchone()
        if bookmark is None:
            raise HTTPException(status_code=404, detail="Bookmark not found on this shared page")
        if page["analytics_enabled"]:
            record_page_event(
                conn,
                page_id=page["id"],
                event_type="click",
                bookmark_id=bookmark["id"],
                actor_type="shared",
                share_id=share_id,
                session_key=(payload.session_key or "").strip() or None,
                bookmark_url=bookmark["url"],
            )
            conn.commit()
    return Response(status_code=204)
