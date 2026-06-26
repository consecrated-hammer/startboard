"""Admin routes: user management and integration diagnostics."""

import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.db.database import get_db_connection
from app.db.settings_store import get_docker_integration_settings
from app.deps import require_admin
from app.models.schemas import AdminUserCreate, AdminUserUpdate, DockerAssignmentsUpdate
from app.routes._helpers import now_iso
from app.services.bookmark_links import docker_placeholder_url, is_launchable_url
from app.services.bookmark_ops import create_bookmark_in_group
from app.services.docker_status import DOCKER_SOURCE_TYPE, discover_docker_workloads, refresh_docker_status_cache
from app.services.icon_store import ingest_remote_icon
from app.utils.security import hash_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _user_out(row) -> dict:
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


@router.get("/users")
def list_users(_: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
        return [_user_out(r) for r in rows]


@router.post("/users", status_code=201)
def create_user(payload: AdminUserCreate, admin: dict = Depends(require_admin)):
    ts = now_iso()
    with get_db_connection() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO users (
                    username, email, display_name, password_hash, role, is_active,
                    status, approved_at, approved_by_user_id, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?)
                """,
                (
                    payload.username.strip(),
                    payload.email.strip().lower(),
                    payload.display_name,
                    hash_password(payload.password),
                    payload.role,
                    ts,
                    admin["id"],
                    ts,
                    ts,
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Username or email already exists")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _user_out(row)


@router.patch("/users/{user_id}")
def update_user(user_id: int, payload: AdminUserUpdate, admin: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")

        email = payload.email.strip().lower() if payload.email is not None else row["email"]
        display_name = payload.display_name if payload.display_name is not None else row["display_name"]
        role = payload.role if payload.role is not None else row["role"]
        is_active = int(payload.is_active) if payload.is_active is not None else row["is_active"]
        next_status = payload.status if payload.status is not None else row["status"]
        if not is_active:
            next_status = "disabled"
        elif next_status == "disabled":
            is_active = 0
        elif next_status in {"pending", "active", "rejected"}:
            is_active = 1

        # Guard: never strip the last active admin (role change or deactivation).
        if (role != "admin" or not is_active) and row["role"] == "admin":
            active_admins = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role='admin' AND is_active=1 AND id != ?",
                (user_id,),
            ).fetchone()["c"]
            if active_admins == 0:
                raise HTTPException(status_code=400, detail="Cannot remove the last active admin")

        password_hash = row["password_hash"]
        if payload.password:
            password_hash = hash_password(payload.password)
            # Revoke existing sessions on password change.
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

        approved_at = row["approved_at"]
        approved_by_user_id = row["approved_by_user_id"]
        rejected_at = row["rejected_at"]
        rejected_by_user_id = row["rejected_by_user_id"]
        if next_status == "active":
            approved_at = now_iso()
            approved_by_user_id = admin["id"]
            rejected_at = None
            rejected_by_user_id = None
        elif next_status == "rejected":
            rejected_at = now_iso()
            rejected_by_user_id = admin["id"]

        conn.execute(
            """
            UPDATE users
            SET email=?, display_name=?, role=?, is_active=?, status=?, password_hash=?,
                approved_at=?, approved_by_user_id=?, rejected_at=?, rejected_by_user_id=?, updated_at=?
            WHERE id=?
            """,
            (
                email,
                display_name,
                role,
                is_active,
                next_status,
                password_hash,
                approved_at,
                approved_by_user_id,
                rejected_at,
                rejected_by_user_id,
                now_iso(),
                user_id,
            ),
        )
        if not is_active or next_status in {"pending", "rejected"}:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        return _user_out(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


@router.get("/users/pending")
def list_pending_users(_: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at ASC, id ASC"
        ).fetchall()
        return [_user_out(row) for row in rows]


@router.post("/users/{user_id}/approve")
def approve_user(user_id: int, admin: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            """
            UPDATE users
            SET status='active', is_active=1, approved_at=?, approved_by_user_id=?,
                rejected_at=NULL, rejected_by_user_id=NULL, updated_at=?
            WHERE id=?
            """,
            (now_iso(), admin["id"], now_iso(), user_id),
        )
        conn.commit()
        return _user_out(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


@router.post("/users/{user_id}/reject")
def reject_user(user_id: int, admin: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            """
            UPDATE users
            SET status='rejected', is_active=1, rejected_at=?, rejected_by_user_id=?, updated_at=?
            WHERE id=?
            """,
            (now_iso(), admin["id"], now_iso(), user_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        return _user_out(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        if row["role"] == "admin":
            active_admins = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role='admin' AND id != ?", (user_id,)
            ).fetchone()["c"]
            if active_admins == 0:
                raise HTTPException(status_code=400, detail="Cannot delete the last admin")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return None


@router.get("/pages")
def list_all_pages(_: dict = Depends(require_admin)):
    """All pages with owner info (for assigning cross-user grants)."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT p.id, p.title, p.visibility, p.owner_id, u.username AS owner_username
            FROM pages p JOIN users u ON u.id = p.owner_id
            ORDER BY u.username, p.position
            """
        ).fetchall()
        return [dict(r) for r in rows]


def _load_docker_destinations(conn):
    pages = conn.execute(
        """
        SELECT p.id, p.title, u.username AS owner_username
        FROM pages p
        JOIN users u ON u.id = p.owner_id
        WHERE p.is_archived = 0
        ORDER BY u.username, p.position, p.id
        """
    ).fetchall()
    groups = conn.execute(
        """
        SELECT g.id, g.page_id, g.title
        FROM groups g
        JOIN pages p ON p.id = g.page_id
        WHERE p.is_archived = 0
        ORDER BY p.position, g.col, g.position, g.id
        """
    ).fetchall()
    groups_by_page: dict[int, list[dict]] = {}
    for row in groups:
        groups_by_page.setdefault(row["page_id"], []).append({"id": row["id"], "title": row["title"]})
    return [
        {
            "id": page["id"],
            "title": page["title"],
            "owner_username": page["owner_username"],
            "groups": groups_by_page.get(page["id"], []),
        }
        for page in pages
    ]


def _load_docker_assignments(conn) -> dict[str, list[dict]]:
    rows = conn.execute(
        """
        SELECT
            b.id,
            b.group_id,
            b.title,
            b.url,
            b.icon_url,
            b.description,
            b.source_ref,
            b.docker_ref,
            g.title AS group_title,
            g.page_id,
            p.title AS page_title
        FROM bookmarks b
        JOIN groups g ON g.id = b.group_id
        JOIN pages p ON p.id = g.page_id
        WHERE b.source_type = ?
           OR (
                (b.source_type IS NULL OR TRIM(b.source_type) = '')
                AND b.docker_ref IS NOT NULL
                AND TRIM(b.docker_ref) <> ''
              )
        ORDER BY p.position, g.col, g.position, b.position, b.id
        """,
        (DOCKER_SOURCE_TYPE,),
    ).fetchall()
    out: dict[str, list[dict]] = {}
    for row in rows:
        key = (row["source_ref"] or row["docker_ref"] or "").strip()
        if not key:
            continue
        out.setdefault(key, []).append(
            {
                "bookmark_id": row["id"],
                "page_id": row["page_id"],
                "page_title": row["page_title"],
                "group_id": row["group_id"],
                "group_title": row["group_title"],
                "title": row["title"],
                "url": row["url"],
                "icon_url": row["icon_url"],
                "description": row["description"],
            }
        )
    return out


def _docker_inventory_payload(conn) -> dict:
    cfg = get_docker_integration_settings()
    endpoint = cfg["api_endpoint"]
    if not endpoint:
        raise HTTPException(status_code=400, detail="Docker API endpoint is not configured")

    try:
        workloads = discover_docker_workloads(endpoint)
        refresh_docker_status_cache()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Docker connection failed: {exc}")

    assignments = _load_docker_assignments(conn)
    pages = _load_docker_destinations(conn)
    for workload in workloads:
        linked = assignments.get(workload["key"], [])
        workload["assignment"] = linked[0] if linked else None
        workload["assignment_count"] = len(linked)
        workload["can_create"] = True
        workload["needs_label_help"] = not workload["href"]
    return {
        "enabled": cfg["enabled"],
        "endpoint": endpoint,
        "poll_seconds": cfg["poll_seconds"],
        "workload_count": len(workloads),
        "assigned_count": sum(1 for item in workloads if item["assignment"]),
        "pages": pages,
        "workloads": workloads,
    }


@router.get("/docker/preview")
def docker_preview(_: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        return _docker_inventory_payload(conn)


@router.post("/docker/assignments")
def update_docker_assignments(payload: DockerAssignmentsUpdate, admin: dict = Depends(require_admin)):
    with get_db_connection() as conn:
        workload_map = {item["key"]: item for item in _docker_inventory_payload(conn)["workloads"]}
        created = updated = removed = 0

        for item in payload.assignments:
            key = item.key.strip()
            workload = workload_map.get(key)
            if workload is None:
                raise HTTPException(status_code=400, detail=f"Unknown Docker workload: {key}")

            existing = conn.execute(
                """
                SELECT * FROM bookmarks
                WHERE source_type = ? AND source_ref = ?
                ORDER BY id
                LIMIT 1
                """,
                (DOCKER_SOURCE_TYPE, key),
            ).fetchone()

            if not item.enabled:
                if existing is not None:
                    conn.execute("DELETE FROM bookmarks WHERE id = ?", (existing["id"],))
                    removed += 1
                continue

            if item.group_id is None:
                raise HTTPException(status_code=400, detail=f"Choose a destination group for {workload['title']}")
            group = conn.execute("SELECT * FROM groups WHERE id = ?", (item.group_id,)).fetchone()
            if group is None:
                raise HTTPException(status_code=404, detail="Destination group not found")

            url = (workload["href"] or "").strip()
            if not url and existing is not None and is_launchable_url(existing["url"]):
                url = existing["url"]
            if not url:
                url = docker_placeholder_url(key)

            title = (workload["title"] or "").strip() or (existing["title"] if existing is not None else key)
            # Preserve a manually-assigned icon on existing docker links; only derive from
            # the workload when creating a new link or when the existing one has no icon.
            if existing is not None and existing["icon_url"]:
                icon_url = existing["icon_url"]
            else:
                icon_url = ingest_remote_icon(workload["icon_url"])
            description = workload["description"] if workload["description"] is not None else (
                existing["description"] if existing is not None else None
            )

            if existing is None:
                create_bookmark_in_group(
                    conn,
                    user_id=admin["id"],
                    group_id=item.group_id,
                    url=url,
                    title=title,
                    description=description,
                    icon_url=icon_url,
                    docker_ref=key,
                    source_type=DOCKER_SOURCE_TYPE,
                    source_ref=key,
                )
                created += 1
                continue

            position = existing["position"]
            if existing["group_id"] != item.group_id:
                position = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) AS m FROM bookmarks WHERE group_id = ?",
                    (item.group_id,),
                ).fetchone()["m"] + 1
            conn.execute(
                """
                UPDATE bookmarks
                SET group_id=?, title=?, url=?, icon_url=?, description=?, source_type=?, source_ref=?, docker_ref=?, position=?, updated_at=?
                WHERE id=?
                """,
                (
                    item.group_id,
                    title,
                    url,
                    icon_url,
                    description,
                    DOCKER_SOURCE_TYPE,
                    key,
                    key,
                    position,
                    now_iso(),
                    existing["id"],
                ),
            )
            updated += 1

        conn.commit()
        data = _docker_inventory_payload(conn)
        data["changes"] = {"created": created, "updated": updated, "removed": removed}
        return data
