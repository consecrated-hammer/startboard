"""Managed background image storage, metadata, and render helpers."""

from __future__ import annotations

import hashlib
import mimetypes
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps

from app.config import settings
from app.db.database import get_db_connection

RenderPosition = Literal["center", "east", "west", "north", "south", "northwest"]

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def images_dir() -> Path:
    path = Path(settings.managed_images_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def variants_dir() -> Path:
    path = Path(settings.managed_variants_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def import_dir() -> Path:
    path = Path(settings.managed_image_import_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _guess_extension(filename: str, content_type: str | None) -> str:
    if content_type and content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[content_type]
    ext = Path(filename or "").suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return ".jpg" if ext == ".jpeg" else ext
    guessed = mimetypes.guess_extension(content_type or "") or ".jpg"
    return ".jpg" if guessed == ".jpe" else guessed


def _position_anchor(position: RenderPosition) -> tuple[float, float]:
    return {
        "center": (0.5, 0.5),
        "east": (1.0, 0.5),
        "west": (0.0, 0.5),
        "north": (0.5, 0.0),
        "south": (0.5, 1.0),
        "northwest": (0.0, 0.0),
    }.get(position, (0.5, 0.5))


def _variant_path(image_id: int, width: int, height: int, position: RenderPosition, source_key: str, suffix: str) -> Path:
    subdir = variants_dir() / str(image_id)
    subdir.mkdir(parents=True, exist_ok=True)
    return subdir / f"{width}x{height}-{position}-{source_key}{suffix}"


def _safe_name(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in name)[:160] or "image"


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_file_path(filename: str) -> Path:
    return images_dir() / filename


def image_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "owner_id": row["owner_id"],
        "filename": row["filename"],
        "original_name": row["original_name"],
        "content_type": row["content_type"],
        "upload_date": row["upload_date"],
        "in_rotation": bool(row["in_rotation"]),
        "width": row["width"],
        "height": row["height"],
        "file_size": row["file_size"],
        "content_hash": row["content_hash"],
        "rotation_order": row["rotation_order"],
        "favourite": bool(row["favourite"]),
        "source_import_key": row["source_import_key"],
        "original_url": f"/api/images/{row['id']}/file",
    }


def list_owner_pages(owner_id: int) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, title, slug, bg_image_mode, bg_managed_image_id
            FROM pages
            WHERE owner_id = ? AND is_archived = 0
            ORDER BY position, id
            """,
            (owner_id,),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "slug": row["slug"],
                "bg_image_mode": row["bg_image_mode"] if "bg_image_mode" in row.keys() else "external",
                "bg_managed_image_id": row["bg_managed_image_id"] if "bg_managed_image_id" in row.keys() else None,
            }
            for row in rows
        ]


def _legacy_single_usage(conn, owner_id: int) -> dict[int, list[dict]]:
    direct_rows = conn.execute(
        """
        SELECT id, title, slug, bg_managed_image_id
        FROM pages
        WHERE owner_id = ? AND bg_image_mode = 'managed_single' AND bg_managed_image_id IS NOT NULL
        ORDER BY title COLLATE NOCASE, id
        """,
        (owner_id,),
    ).fetchall()
    by_image_id: dict[int, list[dict]] = {}
    for row in direct_rows:
        by_image_id.setdefault(row["bg_managed_image_id"], []).append(
            {
                "page_id": row["id"],
                "page_title": row["title"],
                "page_slug": row["slug"],
                "mode": "single",
            }
        )
    return by_image_id


def _legacy_rotation_pages(conn, owner_id: int) -> list[dict]:
    rotation_rows = conn.execute(
        """
        SELECT id, title, slug
        FROM pages
        WHERE owner_id = ? AND bg_image_mode = 'managed_rotation'
        ORDER BY title COLLATE NOCASE, id
        """,
        (owner_id,),
    ).fetchall()
    return [
        {
            "page_id": row["id"],
            "page_title": row["title"],
            "page_slug": row["slug"],
            "mode": "rotation",
        }
        for row in rotation_rows
    ]


def _assignment_usage_payload(conn, owner_id: int) -> dict[int, list[dict]]:
    rows = conn.execute(
        """
        SELECT pia.image_id, pia.mode, p.id AS page_id, p.title, p.slug
        FROM page_image_assignments pia
        JOIN pages p ON p.id = pia.page_id
        JOIN managed_images mi ON mi.id = pia.image_id
        WHERE p.owner_id = ? AND mi.owner_id = ?
        ORDER BY p.title COLLATE NOCASE, pia.position, pia.id
        """,
        (owner_id, owner_id),
    ).fetchall()
    by_image_id: dict[int, list[dict]] = {}
    for row in rows:
        by_image_id.setdefault(row["image_id"], []).append(
            {
                "page_id": row["page_id"],
                "page_title": row["title"],
                "page_slug": row["slug"],
                "mode": row["mode"],
            }
        )
    return by_image_id


def _pages_with_explicit_assignments(conn, owner_id: int) -> set[int]:
    rows = conn.execute(
        """
        SELECT DISTINCT p.id
        FROM page_image_assignments pia
        JOIN pages p ON p.id = pia.page_id
        JOIN managed_images mi ON mi.id = pia.image_id
        WHERE p.owner_id = ? AND mi.owner_id = ?
        """,
        (owner_id, owner_id),
    ).fetchall()
    return {row["id"] for row in rows}


def get_image(conn, image_id: int):
    return conn.execute("SELECT * FROM managed_images WHERE id = ?", (image_id,)).fetchone()


def get_owner_image(conn, owner_id: int, image_id: int):
    return conn.execute(
        "SELECT * FROM managed_images WHERE id = ? AND owner_id = ?",
        (image_id, owner_id),
    ).fetchone()


def list_images(owner_id: int) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM managed_images WHERE owner_id = ? ORDER BY upload_date DESC, id DESC",
            (owner_id,),
        ).fetchall()
        usage_by_image = _assignment_usage_payload(conn, owner_id)
        pages_with_assignments = _pages_with_explicit_assignments(conn, owner_id)
        legacy_single = _legacy_single_usage(conn, owner_id)
        legacy_rotation_pages = [
            page for page in _legacy_rotation_pages(conn, owner_id) if page["page_id"] not in pages_with_assignments
        ]
        payload = []
        for row in rows:
            item = image_row_to_dict(row)
            allocations = list(usage_by_image.get(row["id"], []))
            if not allocations:
                allocations.extend(legacy_single.get(row["id"], []))
                if row["in_rotation"]:
                    allocations.extend(legacy_rotation_pages)
            item["allocations"] = allocations
            item["allocation_count"] = len(allocations)
            payload.append(item)
        return payload


def _first_rotation_assignment(conn, page_id: int):
    return conn.execute(
        """
        SELECT pia.image_id
        FROM page_image_assignments pia
        WHERE pia.page_id = ? AND pia.mode = 'rotation'
        ORDER BY pia.position, pia.id
        LIMIT 1
        """,
        (page_id,),
    ).fetchone()


def set_page_assignment(owner_id: int, image_id: int, page_id: int, mode: str) -> dict:
    if mode not in {"off", "single", "rotation"}:
        raise ValueError("Unsupported assignment mode")
    with get_db_connection() as conn:
        image = get_owner_image(conn, owner_id, image_id)
        if image is None:
            raise ValueError("Image not found")
        page = conn.execute("SELECT * FROM pages WHERE id = ? AND owner_id = ?", (page_id, owner_id)).fetchone()
        if page is None:
            raise ValueError("Page not found")
        ts = now_iso()

        if mode == "single":
            conn.execute("DELETE FROM page_image_assignments WHERE page_id = ? AND mode = 'single'", (page_id,))
            conn.execute(
                """
                INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                VALUES (?, ?, 'single', 0, ?, ?)
                ON CONFLICT(page_id, image_id, mode) DO UPDATE SET updated_at = excluded.updated_at
                """,
                (page_id, image_id, ts, ts),
            )
            conn.execute(
                "UPDATE pages SET bg_image_mode = 'managed_single', bg_managed_image_id = ?, updated_at = ? WHERE id = ?",
                (image_id, ts, page_id),
            )
        elif mode == "rotation":
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) AS m FROM page_image_assignments WHERE page_id = ? AND mode = 'rotation'",
                (page_id,),
            ).fetchone()["m"]
            conn.execute(
                """
                INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                VALUES (?, ?, 'rotation', ?, ?, ?)
                ON CONFLICT(page_id, image_id, mode) DO UPDATE SET updated_at = excluded.updated_at
                """,
                (page_id, image_id, int(max_pos or -1) + 1, ts, ts),
            )
            preview_image_id = page["bg_managed_image_id"] if page["bg_image_mode"] == "managed_rotation" and page["bg_managed_image_id"] else image_id
            conn.execute(
                "UPDATE pages SET bg_image_mode = 'managed_rotation', bg_managed_image_id = ?, updated_at = ? WHERE id = ?",
                (preview_image_id, ts, page_id),
            )
        else:
            conn.execute(
                "DELETE FROM page_image_assignments WHERE page_id = ? AND image_id = ? AND mode IN ('single', 'rotation')",
                (page_id, image_id),
            )
            single_row = conn.execute(
                "SELECT image_id FROM page_image_assignments WHERE page_id = ? AND mode = 'single' ORDER BY id LIMIT 1",
                (page_id,),
            ).fetchone()
            rotation_row = _first_rotation_assignment(conn, page_id)
            if single_row is not None:
                conn.execute(
                    "UPDATE pages SET bg_image_mode = 'managed_single', bg_managed_image_id = ?, updated_at = ? WHERE id = ?",
                    (single_row["image_id"], ts, page_id),
                )
            elif rotation_row is not None:
                conn.execute(
                    "UPDATE pages SET bg_image_mode = 'managed_rotation', bg_managed_image_id = ?, updated_at = ? WHERE id = ?",
                    (rotation_row["image_id"], ts, page_id),
                )
            else:
                next_mode = "external" if page["bg_image_mode"] in {"managed_single", "managed_rotation"} else page["bg_image_mode"]
                conn.execute(
                    "UPDATE pages SET bg_image_mode = ?, bg_managed_image_id = NULL, updated_at = ? WHERE id = ?",
                    (next_mode, ts, page_id),
                )
        conn.commit()
    return {"success": True}


def replace_page_assignments(owner_id: int, page_id: int, *, single_image_id: int | None, rotation_image_ids: list[int]) -> dict:
    with get_db_connection() as conn:
        page = conn.execute("SELECT * FROM pages WHERE id = ? AND owner_id = ?", (page_id, owner_id)).fetchone()
        if page is None:
            raise ValueError("Page not found")

        valid_ids = {row["id"] for row in conn.execute("SELECT id FROM managed_images WHERE owner_id = ?", (owner_id,)).fetchall()}
        if single_image_id is not None and single_image_id not in valid_ids:
            raise ValueError("Selected single image was not found")
        for image_id in rotation_image_ids:
            if image_id not in valid_ids:
                raise ValueError("One or more slideshow images were not found")

        ts = now_iso()
        conn.execute("DELETE FROM page_image_assignments WHERE page_id = ?", (page_id,))

        if single_image_id is not None:
            conn.execute(
                """
                INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                VALUES (?, ?, 'single', 0, ?, ?)
                """,
                (page_id, single_image_id, ts, ts),
            )

        for position, image_id in enumerate(rotation_image_ids):
            conn.execute(
                """
                INSERT INTO page_image_assignments (page_id, image_id, mode, position, created_at, updated_at)
                VALUES (?, ?, 'rotation', ?, ?, ?)
                """,
                (page_id, image_id, position, ts, ts),
            )

        conn.commit()
    return {"success": True}


def image_stats(owner_id: int) -> dict:
    with get_db_connection() as conn:
        image_count = conn.execute(
            "SELECT COUNT(*) AS c FROM managed_images WHERE owner_id = ?",
            (owner_id,),
        ).fetchone()["c"]
        originals_size = conn.execute(
            "SELECT COALESCE(SUM(file_size), 0) AS total FROM managed_images WHERE owner_id = ?",
            (owner_id,),
        ).fetchone()["total"]
    variant_count = 0
    variant_size = 0
    root = Path(settings.managed_variants_dir)
    if root.exists():
        for dirpath, _dirnames, filenames in os.walk(root):
            for filename in filenames:
                path = Path(dirpath) / filename
                try:
                    variant_count += 1
                    variant_size += path.stat().st_size
                except OSError:
                    pass
    return {
        "image_count": int(image_count or 0),
        "variant_count": variant_count,
        "total_original_size": int(originals_size or 0),
        "total_variant_size": variant_size,
    }


def _insert_image_record(
    conn,
    *,
    owner_id: int,
    original_name: str,
    content_type: str | None,
    data: bytes,
    source_import_key: str | None = None,
) -> dict:
    if len(data) > settings.managed_image_max_upload_bytes:
        raise ValueError("Image exceeds upload size limit")
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported image type")

    image = Image.open(BytesIO(data))
    image.load()
    width, height = image.size
    content_hash = _hash_bytes(data)
    existing = conn.execute(
        "SELECT * FROM managed_images WHERE owner_id = ? AND content_hash = ?",
        (owner_id, content_hash),
    ).fetchone()
    if existing is not None:
        return {"record": image_row_to_dict(existing), "duplicate": True}

    ext = _guess_extension(original_name, content_type)
    ts = now_iso()
    filename = f"{owner_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{content_hash[:12]}{ext}"
    file_path = image_file_path(filename)
    file_path.write_bytes(data)

    max_order = conn.execute(
        "SELECT COALESCE(MAX(rotation_order), 0) AS m FROM managed_images WHERE owner_id = ?",
        (owner_id,),
    ).fetchone()["m"]
    cur = conn.execute(
        """
        INSERT INTO managed_images (
            owner_id, filename, original_name, content_type, upload_date, in_rotation,
            width, height, file_size, content_hash, rotation_order, favourite,
            source_import_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (
            owner_id,
            filename,
            original_name,
            content_type,
            int(datetime.now(timezone.utc).timestamp() * 1000),
            width,
            height,
            len(data),
            content_hash,
            int(max_order or 0) + 1,
            source_import_key,
            ts,
            ts,
        ),
    )
    row = get_image(conn, cur.lastrowid)
    return {"record": image_row_to_dict(row), "duplicate": False}


def store_uploads(owner_id: int, uploads: list[tuple[str, str | None, bytes]]) -> dict:
    uploaded = []
    duplicates = []
    failed = []
    with get_db_connection() as conn:
        for original_name, content_type, data in uploads:
            try:
                result = _insert_image_record(
                    conn,
                    owner_id=owner_id,
                    original_name=original_name,
                    content_type=content_type,
                    data=data,
                )
                if result["duplicate"]:
                    duplicates.append(
                        {
                            "original_name": original_name,
                            "matched_image_id": result["record"]["id"],
                            "matched_filename": result["record"]["filename"],
                        }
                    )
                else:
                    uploaded.append(result["record"])
            except Exception as exc:  # noqa: BLE001
                failed.append({"original_name": original_name, "error": str(exc)})
        conn.commit()
    return {"uploaded": uploaded, "duplicates": duplicates, "failed": failed}


def update_image(owner_id: int, image_id: int, *, in_rotation=None, favourite=None, rotation_order=None) -> dict:
    with get_db_connection() as conn:
        row = get_owner_image(conn, owner_id, image_id)
        if row is None:
            raise ValueError("Image not found")
        if in_rotation is not None:
            conn.execute("UPDATE managed_images SET in_rotation = ?, updated_at = ? WHERE id = ?", (1 if in_rotation else 0, now_iso(), image_id))
        if favourite is not None:
            conn.execute("UPDATE managed_images SET favourite = ?, updated_at = ? WHERE id = ?", (1 if favourite else 0, now_iso(), image_id))
        if rotation_order is not None:
            conn.execute("UPDATE managed_images SET rotation_order = ?, updated_at = ? WHERE id = ?", (int(rotation_order), now_iso(), image_id))
        conn.commit()
        return image_row_to_dict(get_owner_image(conn, owner_id, image_id))


def reorder_images(owner_id: int, ordered_ids: list[int]) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            f"SELECT id FROM managed_images WHERE owner_id = ? AND id IN ({','.join('?' for _ in ordered_ids)})",
            (owner_id, *ordered_ids),
        ).fetchall()
        found = {row["id"] for row in rows}
        if found != set(ordered_ids):
            raise ValueError("One or more images were not found")
        for index, image_id in enumerate(ordered_ids, start=1):
            conn.execute(
                "UPDATE managed_images SET rotation_order = ?, updated_at = ? WHERE id = ?",
                (index, now_iso(), image_id),
            )
        conn.commit()
        rows = conn.execute(
            "SELECT * FROM managed_images WHERE owner_id = ? ORDER BY rotation_order ASC, upload_date DESC",
            (owner_id,),
        ).fetchall()
        return [image_row_to_dict(row) for row in rows]


def clear_variants(image_id: int | None = None) -> None:
    root = variants_dir()
    targets = [root / str(image_id)] if image_id is not None else [root]
    for target in targets:
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
    root.mkdir(parents=True, exist_ok=True)


def delete_images(owner_id: int, image_ids: list[int]) -> None:
    if not image_ids:
        return
    with get_db_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM managed_images WHERE owner_id = ? AND id IN ({','.join('?' for _ in image_ids)})",
            (owner_id, *image_ids),
        ).fetchall()
        found = {row["id"] for row in rows}
        for row in rows:
            clear_variants(row["id"])
            try:
                image_file_path(row["filename"]).unlink(missing_ok=True)
            except OSError:
                pass
        if found:
            conn.execute(
                f"DELETE FROM managed_images WHERE owner_id = ? AND id IN ({','.join('?' for _ in found)})",
                (owner_id, *found),
            )
            conn.commit()


def bulk_action(owner_id: int, image_ids: list[int], action: str) -> dict:
    if action == "delete":
        delete_images(owner_id, image_ids)
        return {"success": True}
    with get_db_connection() as conn:
        if action in {"enable-rotation", "disable-rotation"}:
            value = 1 if action == "enable-rotation" else 0
            conn.execute(
                f"UPDATE managed_images SET in_rotation = ?, updated_at = ? WHERE owner_id = ? AND id IN ({','.join('?' for _ in image_ids)})",
                (value, now_iso(), owner_id, *image_ids),
            )
        elif action in {"favourite", "unfavourite"}:
            value = 1 if action == "favourite" else 0
            conn.execute(
                f"UPDATE managed_images SET favourite = ?, updated_at = ? WHERE owner_id = ? AND id IN ({','.join('?' for _ in image_ids)})",
                (value, now_iso(), owner_id, *image_ids),
            )
        else:
            raise ValueError("Unsupported bulk action")
        conn.commit()
        rows = conn.execute(
            "SELECT * FROM managed_images WHERE owner_id = ? ORDER BY upload_date DESC, id DESC",
            (owner_id,),
        ).fetchall()
        return {"success": True, "images": [image_row_to_dict(row) for row in rows]}


def render_image_bytes(row, width: int, height: int, position: RenderPosition) -> tuple[bytes, str]:
    source = image_file_path(row["filename"])
    suffix = Path(row["filename"]).suffix or ".png"
    variant = _variant_path(row["id"], width, height, position, row["content_hash"], suffix)
    if not variant.exists():
        with Image.open(source) as img:
            rendered = ImageOps.fit(img.convert("RGB"), (width, height), method=Image.Resampling.LANCZOS, centering=_position_anchor(position))
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=str(variant.parent)) as tmp:
                temp_path = Path(tmp.name)
            try:
                fmt = "JPEG" if suffix in {".jpg", ".jpeg"} else suffix.lstrip(".").upper()
                rendered.save(temp_path, format=fmt)
                temp_path.replace(variant)
            finally:
                temp_path.unlink(missing_ok=True)
    content_type = row["content_type"] or mimetypes.guess_type(variant.name)[0] or "image/png"
    return variant.read_bytes(), content_type


def original_image_bytes(row) -> tuple[bytes, str]:
    path = image_file_path(row["filename"])
    content_type = row["content_type"] or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return path.read_bytes(), content_type


def _rotation_seed_bucket(page_id: int, interval_seconds: int) -> int:
    bucket = int(datetime.now(timezone.utc).timestamp()) // max(1, interval_seconds)
    return bucket + page_id


def select_page_background_image(conn, page, advance: int = 0) -> dict | None:
    mode = page["bg_image_mode"] if "bg_image_mode" in page.keys() else "external"
    if mode == "managed_single":
        assigned = conn.execute(
            "SELECT image_id FROM page_image_assignments WHERE page_id = ? AND mode = 'single' ORDER BY id LIMIT 1",
            (page["id"],),
        ).fetchone()
        image_id = assigned["image_id"] if assigned is not None else page["bg_managed_image_id"]
        if not image_id:
            return None
        row = get_owner_image(conn, page["owner_id"], image_id)
        return image_row_to_dict(row) if row else None
    if mode == "managed_rotation":
        rows = conn.execute(
            """
            SELECT mi.*
            FROM page_image_assignments pia
            JOIN managed_images mi ON mi.id = pia.image_id
            WHERE pia.page_id = ? AND pia.mode = 'rotation' AND mi.owner_id = ?
            ORDER BY pia.position, pia.id
            """,
            (page["id"], page["owner_id"]),
        ).fetchall()
        if not rows:
            has_any_assignment = conn.execute(
                "SELECT 1 FROM page_image_assignments WHERE page_id = ? LIMIT 1",
                (page["id"],),
            ).fetchone()
            if has_any_assignment is None:
                rows = conn.execute(
                    """
                    SELECT * FROM managed_images
                    WHERE owner_id = ? AND in_rotation = 1
                    ORDER BY COALESCE(rotation_order, 2147483647) ASC, upload_date DESC
                    """,
                    (page["owner_id"],),
                ).fetchall()
        if not rows:
            return None
        if not page["bg_slideshow_enabled"]:
            selected_id = page["bg_managed_image_id"]
            if selected_id:
                for row in rows:
                    if row["id"] == selected_id:
                        return image_row_to_dict(row)
            return image_row_to_dict(rows[0])
        unit = page["bg_slideshow_interval_unit"] if "bg_slideshow_interval_unit" in page.keys() else "seconds"
        value = page["bg_slideshow_interval_value"] if "bg_slideshow_interval_value" in page.keys() else 30
        interval = int(value or 30) * (60 if unit == "minutes" else 1)
        mode_name = page["bg_slideshow_advance_mode"] if "bg_slideshow_advance_mode" in page.keys() else "random"
        bucket = _rotation_seed_bucket(page["id"], interval)
        if mode_name == "sequential":
            base = bucket
        else:
            base = hash(f"{page['id']}:{bucket}:{mode_name}")
        # `advance` lets a viewer step forward from whatever the time bucket would
        # otherwise show (the "Show next image" action), staying in rotation order.
        row = rows[(base + int(advance or 0)) % len(rows)]
        return image_row_to_dict(row)
    return None


def resolve_page_background_url(page: dict, public_share_id: str | None = None) -> str | None:
    mode = page.get("bg_image_mode") or "external"
    if mode == "solid":
        return None
    if mode == "external":
        return page.get("bg_image") or None
    if public_share_id:
        return f"/api/public/p/{public_share_id}/background"
    return f"/api/pages/{page['id']}/background"


@dataclass
class ImportedImageResult:
    image_id: int
    duplicate: bool


def import_image_from_path(owner_id: int, source_path: str, original_name: str, source_import_key: str | None = None) -> ImportedImageResult:
    data = Path(source_path).read_bytes()
    content_type = mimetypes.guess_type(source_path)[0] or "image/png"
    with get_db_connection() as conn:
        result = _insert_image_record(
            conn,
            owner_id=owner_id,
            original_name=original_name,
            content_type=content_type,
            data=data,
            source_import_key=source_import_key,
        )
        conn.commit()
        return ImportedImageResult(image_id=result["record"]["id"], duplicate=result["duplicate"])
