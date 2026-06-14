"""Group (column / widget) routes."""

from fastapi import APIRouter, Depends, HTTPException

from app.db.database import get_db_connection
from app.deps import require_user
from app.models.schemas import GroupCreate, GroupUpdate
from app.routes._helpers import now_iso
from app.services.icon_store import ingest_remote_icon
from app.utils.permissions import can_edit, get_page

router = APIRouter(tags=["groups"])


def _next_manual_z(conn, page_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(manual_z), -1) AS m FROM groups WHERE page_id = ?",
        (page_id,),
    ).fetchone()
    return int(row["m"]) + 1


def _page_for_group(conn, group_id: int):
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return group, get_page(conn, group["page_id"])


@router.post("/pages/{page_id}/groups", status_code=201)
def create_group(page_id: int, payload: GroupCreate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page = get_page(conn, page_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Page not found")
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        # Place new group in the shortest of the 4 logical columns for balance.
        counts = {c: 0 for c in range(4)}
        for row in conn.execute(
            "SELECT col, COUNT(*) AS c FROM groups WHERE page_id = ? GROUP BY col", (page_id,)
        ).fetchall():
            counts[row["col"] if row["col"] in counts else 0] = row["c"]
        target_col = min(counts, key=counts.get)
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM groups WHERE page_id = ? AND col = ?",
            (page_id, target_col),
        ).fetchone()["m"]
        group_count = conn.execute(
            "SELECT COUNT(*) AS c FROM groups WHERE page_id = ?",
            (page_id,),
        ).fetchone()["c"]
        ts = now_iso()
        cur = conn.execute(
            """
            INSERT INTO groups (
                page_id, title, icon_url, bg_color, header_bg_color, header_text_color, transparency, display_mode, icon_size, bookmark_align,
                visible_limit, bookmark_sort, col, position, manual_x, manual_y, manual_z, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                page_id,
                payload.title.strip(),
                ingest_remote_icon(payload.icon_url),
                payload.bg_color or None,
                payload.header_bg_color or None,
                payload.header_text_color or None,
                payload.transparency or 0,
                payload.display_mode or "list",
                payload.icon_size or "small",
                payload.bookmark_align or "auto",
                payload.visible_limit or 0,
                "manual",
                target_col,
                max_pos + 1,
                24 + ((group_count % 4) * 28),
                24 + (group_count * 18),
                _next_manual_z(conn, page_id),
                ts,
                ts,
            ),
        )
        conn.commit()
        g = conn.execute("SELECT * FROM groups WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {
            "id": g["id"], "page_id": g["page_id"], "title": g["title"], "icon_url": g["icon_url"],
            "bg_color": g["bg_color"], "header_bg_color": g["header_bg_color"], "header_text_color": g["header_text_color"],
            "transparency": g["transparency"], "display_mode": g["display_mode"],
            "icon_size": g["icon_size"], "bookmark_align": g["bookmark_align"], "visible_limit": g["visible_limit"], "column": g["col"],
            "position": g["position"], "bookmark_sort": g["bookmark_sort"], "manual_x": g["manual_x"], "manual_y": g["manual_y"], "manual_z": g["manual_z"], "bookmarks": []
        }


@router.patch("/groups/{group_id}")
def update_group(group_id: int, payload: GroupUpdate, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        group, page = _page_for_group(conn, group_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        title = payload.title.strip() if payload.title else group["title"]
        icon_url = group["icon_url"] if payload.icon_url is None else ingest_remote_icon(payload.icon_url)
        bg_color = group["bg_color"] if payload.bg_color is None else (payload.bg_color or None)
        header_bg_color = group["header_bg_color"] if payload.header_bg_color is None else (payload.header_bg_color or None)
        header_text_color = group["header_text_color"] if payload.header_text_color is None else (payload.header_text_color or None)
        transparency = group["transparency"] if payload.transparency is None else payload.transparency
        display_mode = payload.display_mode if payload.display_mode is not None else group["display_mode"]
        icon_size = payload.icon_size if payload.icon_size is not None else group["icon_size"]
        bookmark_align = payload.bookmark_align if payload.bookmark_align is not None else group["bookmark_align"]
        visible_limit = group["visible_limit"] if payload.visible_limit is None else payload.visible_limit
        bookmark_sort = payload.bookmark_sort if payload.bookmark_sort is not None else group["bookmark_sort"]
        target_page_id = payload.page_id if payload.page_id is not None else group["page_id"]
        target_page = page
        if target_page_id != group["page_id"]:
            target_page = get_page(conn, target_page_id)
            if target_page is None:
                raise HTTPException(status_code=404, detail="Target page not found")
            if not can_edit(conn, user, target_page):
                raise HTTPException(status_code=403, detail="Not allowed to edit the target page")

        target_col = group["col"]
        if target_page_id != group["page_id"]:
            counts = {c: 0 for c in range(4)}
            for row in conn.execute(
                "SELECT col, COUNT(*) AS c FROM groups WHERE page_id = ? GROUP BY col", (target_page_id,)
            ).fetchall():
                counts[row["col"] if row["col"] in counts else 0] = row["c"]
            target_col = min(counts, key=counts.get)

        position = payload.position if payload.position is not None else group["position"]
        manual_x = group["manual_x"] if payload.manual_x is None else payload.manual_x
        manual_y = group["manual_y"] if payload.manual_y is None else payload.manual_y
        manual_z = group["manual_z"] if payload.manual_z is None else payload.manual_z
        if target_page_id != group["page_id"] and payload.position is None:
            position = conn.execute(
                "SELECT COALESCE(MAX(position), -1) AS m FROM groups WHERE page_id = ? AND col = ?",
                (target_page_id, target_col),
            ).fetchone()["m"] + 1
        if target_page_id != group["page_id"]:
            if payload.manual_z is None:
                manual_z = _next_manual_z(conn, target_page_id)
            if payload.manual_x is None:
                manual_x = group["manual_x"]
            if payload.manual_y is None:
                manual_y = group["manual_y"]
        conn.execute(
            """
            UPDATE groups SET page_id=?, title=?, icon_url=?, bg_color=?, header_bg_color=?, header_text_color=?, transparency=?, display_mode=?,
                icon_size=?, bookmark_align=?, visible_limit=?, bookmark_sort=?, col=?, position=?, manual_x=?, manual_y=?, manual_z=?, updated_at=? WHERE id=?
            """,
            (
                target_page_id, title, icon_url, bg_color, header_bg_color, header_text_color, transparency, display_mode,
                icon_size, bookmark_align, visible_limit, bookmark_sort, target_col, position, manual_x, manual_y, manual_z, now_iso(), group_id,
            ),
        )
        conn.commit()
        g = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
        return {
            "id": g["id"],
            "page_id": g["page_id"],
            "title": g["title"],
            "icon_url": g["icon_url"],
            "bg_color": g["bg_color"],
            "header_bg_color": g["header_bg_color"],
            "header_text_color": g["header_text_color"],
            "transparency": g["transparency"],
            "display_mode": g["display_mode"],
            "icon_size": g["icon_size"],
            "bookmark_align": g["bookmark_align"],
            "visible_limit": g["visible_limit"],
            "bookmark_sort": g["bookmark_sort"],
            "column": g["col"],
            "position": g["position"],
            "manual_x": g["manual_x"],
            "manual_y": g["manual_y"],
            "manual_z": g["manual_z"],
        }


@router.post("/groups/{group_id}/duplicate", status_code=201)
def duplicate_group(group_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        group, page = _page_for_group(conn, group_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to duplicate this group")
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM groups WHERE page_id = ? AND col = ?",
            (group["page_id"], group["col"]),
        ).fetchone()["m"]
        ts = now_iso()
        cur = conn.execute(
            """
            INSERT INTO groups (
                page_id, title, icon_url, bg_color, header_bg_color, header_text_color, transparency, display_mode, icon_size, bookmark_align,
                visible_limit, bookmark_sort, col, position, manual_x, manual_y, manual_z, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group["page_id"], f'{group["title"]} Copy', group["icon_url"], group["bg_color"], group["header_bg_color"], group["header_text_color"], group["transparency"],
                group["display_mode"], group["icon_size"], group["bookmark_align"], group["visible_limit"], group["bookmark_sort"],
                group["col"], max_pos + 1, group["manual_x"] + 24, group["manual_y"] + 24, _next_manual_z(conn, group["page_id"]), ts, ts,
            ),
        )
        new_group_id = cur.lastrowid
        for bookmark in conn.execute("SELECT * FROM bookmarks WHERE group_id = ? ORDER BY position, id", (group_id,)).fetchall():
            conn.execute(
                """
                INSERT INTO bookmarks (
                    group_id, title, url, icon_url, description, source_type, source_ref,
                    docker_ref, position, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_group_id, bookmark["title"], bookmark["url"], bookmark["icon_url"], bookmark["description"],
                    None, None, bookmark["docker_ref"], bookmark["position"], ts, ts,
                ),
            )
        conn.commit()
        g = conn.execute("SELECT * FROM groups WHERE id = ?", (new_group_id,)).fetchone()
        return {
            "id": g["id"], "page_id": g["page_id"], "title": g["title"], "icon_url": g["icon_url"],
            "bg_color": g["bg_color"], "header_bg_color": g["header_bg_color"], "header_text_color": g["header_text_color"],
            "transparency": g["transparency"], "display_mode": g["display_mode"],
            "icon_size": g["icon_size"], "bookmark_align": g["bookmark_align"], "visible_limit": g["visible_limit"],
            "bookmark_sort": g["bookmark_sort"], "column": g["col"], "position": g["position"], "manual_x": g["manual_x"], "manual_y": g["manual_y"], "manual_z": g["manual_z"],
        }


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        _group, page = _page_for_group(conn, group_id)
        if not can_edit(conn, user, page):
            raise HTTPException(status_code=403, detail="Not allowed to edit this page")
        conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        conn.commit()
    return None
