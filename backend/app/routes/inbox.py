"""Pending private shares and notifications inbox."""

from fastapi import APIRouter, Depends, HTTPException

from app.db.database import get_db_connection
from app.deps import require_user
from app.routes._helpers import now_iso

router = APIRouter(prefix="/inbox", tags=["inbox"])


def _page_invites(conn, user_id: int):
    rows = conn.execute(
        """
        SELECT
            psi.*,
            p.title AS page_title,
            p.slug AS page_slug,
            p.owner_id,
            sender.username AS sender_username,
            sender.display_name AS sender_display_name
        FROM page_share_invites psi
        JOIN pages p ON p.id = psi.page_id
        JOIN users sender ON sender.id = psi.sender_user_id
        WHERE psi.recipient_user_id = ?
        ORDER BY CASE psi.status WHEN 'pending' THEN 0 ELSE 1 END, psi.created_at DESC, psi.id DESC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "kind": "page_invite",
            "id": row["id"],
            "page_id": row["page_id"],
            "page_title": row["page_title"],
            "page_slug": row["page_slug"],
            "sender_username": row["sender_username"],
            "sender_display_name": row["sender_display_name"],
            "can_edit": bool(row["can_edit"]),
            "status": row["status"],
            "created_at": row["created_at"],
            "responded_at": row["responded_at"],
        }
        for row in rows
    ]


def _bookmark_offers(conn, user_id: int):
    rows = conn.execute(
        """
        SELECT
            bso.*,
            sender.username AS sender_username,
            sender.display_name AS sender_display_name
        FROM bookmark_share_offers bso
        JOIN users sender ON sender.id = bso.sender_user_id
        WHERE bso.recipient_user_id = ?
        ORDER BY CASE bso.status WHEN 'pending' THEN 0 ELSE 1 END, bso.created_at DESC, bso.id DESC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "kind": "bookmark_offer",
            "id": row["id"],
            "sender_username": row["sender_username"],
            "sender_display_name": row["sender_display_name"],
            "bookmark": {
                "title": row["title"],
                "url": row["url"],
                "icon_url": row["icon_url"],
                "description": row["description"],
            },
            "status": row["status"],
            "created_at": row["created_at"],
            "responded_at": row["responded_at"],
        }
        for row in rows
    ]


@router.get("")
def list_inbox(user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        return {
            "page_invites": _page_invites(conn, user["id"]),
            "bookmark_offers": _bookmark_offers(conn, user["id"]),
        }


@router.get("/summary")
def inbox_summary(user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        page_count = conn.execute(
            "SELECT COUNT(*) AS c FROM page_share_invites WHERE recipient_user_id = ? AND status = 'pending'",
            (user["id"],),
        ).fetchone()["c"]
        bookmark_count = conn.execute(
            "SELECT COUNT(*) AS c FROM bookmark_share_offers WHERE recipient_user_id = ? AND status = 'pending'",
            (user["id"],),
        ).fetchone()["c"]
        return {"pending_count": int(page_count or 0) + int(bookmark_count or 0)}


@router.post("/page-invites/{invite_id}/accept")
def accept_page_invite(invite_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        invite = conn.execute(
            "SELECT * FROM page_share_invites WHERE id = ? AND recipient_user_id = ?",
            (invite_id, user["id"]),
        ).fetchone()
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        if invite["status"] != "pending":
            raise HTTPException(status_code=400, detail="Invite is no longer pending")
        conn.execute(
            """
            INSERT INTO page_permissions (page_id, user_id, can_edit, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(page_id, user_id) DO UPDATE SET can_edit = excluded.can_edit
            """,
            (invite["page_id"], user["id"], invite["can_edit"], now_iso()),
        )
        conn.execute(
            "UPDATE page_share_invites SET status = 'accepted', responded_at = ? WHERE id = ?",
            (now_iso(), invite_id),
        )
        conn.commit()
        return {"ok": True}


@router.post("/page-invites/{invite_id}/reject")
def reject_page_invite(invite_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        invite = conn.execute(
            "SELECT * FROM page_share_invites WHERE id = ? AND recipient_user_id = ?",
            (invite_id, user["id"]),
        ).fetchone()
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        conn.execute(
            "UPDATE page_share_invites SET status = 'rejected', responded_at = ? WHERE id = ?",
            (now_iso(), invite_id),
        )
        conn.commit()
        return {"ok": True}


@router.post("/bookmark-offers/{offer_id}/accept")
def accept_bookmark_offer(offer_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        offer = conn.execute(
            "SELECT * FROM bookmark_share_offers WHERE id = ? AND recipient_user_id = ?",
            (offer_id, user["id"]),
        ).fetchone()
        if offer is None:
            raise HTTPException(status_code=404, detail="Offer not found")
        if offer["status"] != "pending":
            raise HTTPException(status_code=400, detail="Offer is no longer pending")
        page = conn.execute(
            "SELECT * FROM pages WHERE owner_id = ? AND is_archived = 0 ORDER BY position, id LIMIT 1",
            (user["id"],),
        ).fetchone()
        if page is None:
            raise HTTPException(status_code=400, detail="Create a page before accepting bookmark shares")
        group = conn.execute(
            "SELECT * FROM groups WHERE page_id = ? ORDER BY col, position, id LIMIT 1",
            (page["id"],),
        ).fetchone()
        if group is None:
            cur = conn.execute(
                "INSERT INTO groups (page_id, title, col, position, created_at, updated_at) VALUES (?, 'Shared', 0, 0, ?, ?)",
                (page["id"], now_iso(), now_iso()),
            )
            group_id = cur.lastrowid
        else:
            group_id = group["id"]
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM bookmarks WHERE group_id = ?",
            (group_id,),
        ).fetchone()["m"]
        conn.execute(
            """
            INSERT INTO bookmarks (group_id, title, url, icon_url, description, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group_id,
                offer["title"],
                offer["url"],
                offer["icon_url"],
                offer["description"],
                int(max_pos or -1) + 1,
                now_iso(),
                now_iso(),
            ),
        )
        conn.execute(
            "UPDATE bookmark_share_offers SET status = 'accepted', responded_at = ? WHERE id = ?",
            (now_iso(), offer_id),
        )
        conn.commit()
        return {"ok": True}


@router.post("/bookmark-offers/{offer_id}/reject")
def reject_bookmark_offer(offer_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        offer = conn.execute(
            "SELECT * FROM bookmark_share_offers WHERE id = ? AND recipient_user_id = ?",
            (offer_id, user["id"]),
        ).fetchone()
        if offer is None:
            raise HTTPException(status_code=404, detail="Offer not found")
        conn.execute(
            "UPDATE bookmark_share_offers SET status = 'rejected', responded_at = ? WHERE id = ?",
            (now_iso(), offer_id),
        )
        conn.commit()
        return {"ok": True}
