"""Shared route helpers: serialization, slugs, cookies, timestamps."""

import re
import secrets
from datetime import datetime, timezone

from fastapi import Response

from app.config import settings
from app.services.bookmark_links import is_launchable_url
from app.services.managed_images import resolve_page_background_url
from app.utils.session_manager import SESSION_COOKIE_NAME


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug or "page"


def new_share_id() -> str:
    return secrets.token_urlsafe(9)


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_days * 24 * 3600,
        path="/",
        domain=settings.session_cookie_domain or None,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        domain=settings.session_cookie_domain or None,
    )


def page_to_dict(page, user: dict | None, can_edit_flag: bool) -> dict:
    layout_mode = (
        page["layout_mode"]
        if "layout_mode" in page.keys() and page["layout_mode"]
        else ("balanced" if bool(page["auto_balance"]) else "natural")
    )
    payload = {
        "id": page["id"],
        "owner_id": page["owner_id"],
        "title": page["title"],
        "description": page["description"] if "description" in page.keys() else None,
        "slug": page["slug"],
        "visibility": page["visibility"],
        "share_id": page["share_id"],
        "is_archived": bool(page["is_archived"]) if "is_archived" in page.keys() else False,
        "position": page["position"],
        "max_cols": page["max_cols"],
        "open_new_tab": bool(page["open_new_tab"]),
        "layout_mode": layout_mode,
        "auto_balance": bool(page["auto_balance"]),
        "single_row_order": page["single_row_order"] if "single_row_order" in page.keys() else "natural",
        "card_gap": page["card_gap"],
        "card_gap_x": page["card_gap_x"],
        "bookmark_gap": page["bookmark_gap"],
        "card_max_width": page["card_max_width"],
        "group_align": page["group_align"] if "group_align" in page.keys() else "center",
        "search_mode": page["search_mode"] if "search_mode" in page.keys() else "inherit",
        "show_overview": bool(page["show_overview"]) if "show_overview" in page.keys() else False,
        "analytics_enabled": bool(page["analytics_enabled"]) if "analytics_enabled" in page.keys() else False,
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
        "accent": page["accent"],
        "bookmark_title_color": page["bookmark_title_color"] if "bookmark_title_color" in page.keys() else None,
        "icon_color": page["icon_color"] if "icon_color" in page.keys() else None,
        "can_edit": can_edit_flag,
        "is_owner": bool(user and page["owner_id"] == user["id"]),
    }
    payload["background_url"] = resolve_page_background_url(payload)
    return payload


def group_to_dict(group, bookmarks: list, bookmark_extras: dict[int, dict] | None = None) -> dict:
    bookmark_sort = group["bookmark_sort"] if "bookmark_sort" in group.keys() else "manual"
    ordered_bookmarks = bookmarks
    if bookmark_sort == "title_asc":
        ordered_bookmarks = sorted(
            bookmarks,
            key=lambda b: (((b["title"] or "").strip().lower()), b["position"], b["id"]),
        )
    return {
        "id": group["id"],
        "page_id": group["page_id"],
        "title": group["title"],
        "icon_url": group["icon_url"] if "icon_url" in group.keys() else None,
        "bg_color": group["bg_color"] if "bg_color" in group.keys() else None,
        "header_bg_color": group["header_bg_color"] if "header_bg_color" in group.keys() else None,
        "header_text_color": group["header_text_color"] if "header_text_color" in group.keys() else None,
        "bookmark_title_color": group["bookmark_title_color"] if "bookmark_title_color" in group.keys() else None,
        "icon_color": group["icon_color"] if "icon_color" in group.keys() else None,
        "transparency": group["transparency"] if "transparency" in group.keys() else 0,
        "display_mode": group["display_mode"] if "display_mode" in group.keys() else "list",
        "icon_size": group["icon_size"] if "icon_size" in group.keys() else "small",
        "bookmark_align": group["bookmark_align"] if "bookmark_align" in group.keys() else "auto",
        "visible_limit": group["visible_limit"] if "visible_limit" in group.keys() else 0,
        "bookmark_sort": bookmark_sort,
        "column": group["col"],
        "position": group["position"],
        "manual_x": group["manual_x"] if "manual_x" in group.keys() else 24,
        "manual_y": group["manual_y"] if "manual_y" in group.keys() else 24,
        "manual_z": group["manual_z"] if "manual_z" in group.keys() else 0,
        "bookmarks": [bookmark_to_dict(b, bookmark_extras.get(b["id"]) if bookmark_extras else None) for b in ordered_bookmarks],
    }


def bookmark_to_dict(b, extra: dict | None = None) -> dict:
    launchable = is_launchable_url(b["url"])
    payload = {
        "id": b["id"],
        "group_id": b["group_id"],
        "title": b["title"],
        "url": b["url"],
        "display_url": b["url"] if launchable else None,
        "launchable": launchable,
        "icon_url": b["icon_url"],
        "icon_color": b["icon_color"] if "icon_color" in b.keys() else None,
        "description": b["description"],
        "title_color": b["title_color"] if "title_color" in b.keys() else None,
        "position": b["position"],
        "source_type": b["source_type"],
        "source_ref": b["source_ref"],
        "docker_ref": b["docker_ref"],
    }
    if extra:
        payload.update(extra)
    return payload
