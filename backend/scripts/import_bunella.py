"""Import homepage-bunella images/settings into Startboard.

Usage:
    python -m scripts.import_bunella \
        --bunella-root /mnt/docker/config/dockerconfigs/homepage-bunella \
        --target-username bianca \
        --page-title Bianca
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from app.db.database import get_db_connection
from app.routes._helpers import now_iso, slugify
from app.services.managed_images import import_image_from_path


def _read_settings(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    out = {}
    for key, value in rows:
        out[key] = value
    return out


def _json_value(value: str):
    import json

    try:
        return json.loads(value)
    except Exception:  # noqa: BLE001
        return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a homepage-bunella library into Startboard")
    parser.add_argument("--bunella-root", required=True)
    parser.add_argument("--target-username", required=True)
    parser.add_argument("--page-title", default="Imported Bunella")
    args = parser.parse_args()

    bunella_root = Path(args.bunella_root)
    db_path = bunella_root / "data" / "database.db"
    images_root = bunella_root / "images"
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    src = sqlite3.connect(str(db_path))
    src.row_factory = sqlite3.Row
    settings = {key: _json_value(value) for key, value in _read_settings(src).items()}
    images = src.execute("SELECT * FROM images ORDER BY upload_date DESC").fetchall()

    with get_db_connection() as conn:
        owner = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (args.target_username,),
        ).fetchone()
        if owner is None:
            raise SystemExit(f"Target user not found: {args.target_username}")
        page = conn.execute(
            "SELECT * FROM pages WHERE owner_id = ? AND title = ?",
            (owner["id"], args.page_title),
        ).fetchone()
        ts = now_iso()
        if page is None:
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) AS m FROM pages WHERE owner_id = ?",
                (owner["id"],),
            ).fetchone()["m"]
            cur = conn.execute(
                """
                INSERT INTO pages (
                    owner_id, title, slug, visibility, position,
                    bg_image_mode, bg_image_fit, bg_render_enabled, bg_render_width, bg_render_height,
                    bg_render_position, bg_slideshow_enabled, bg_slideshow_interval_value, bg_slideshow_interval_unit,
                    bg_slideshow_advance_mode, created_at, updated_at
                ) VALUES (?, ?, ?, 'private', ?, 'managed_rotation', 'cover', 0, NULL, NULL, 'center', 0, 30, 'seconds', 'random', ?, ?)
                """,
                (owner["id"], args.page_title, slugify(args.page_title), max_pos + 1, ts, ts),
            )
            page_id = cur.lastrowid
            page = conn.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
        else:
            page_id = page["id"]

    first_image_id = None
    imported = duplicates = 0
    for row in images:
        source = images_root / row["filename"]
        if not source.exists():
            continue
        result = import_image_from_path(
            owner["id"],
            str(source),
            row["original_name"],
            source_import_key=f"bunella:{row['id']}:{row['content_hash'] or row['filename']}",
        )
        if result.duplicate:
            duplicates += 1
        else:
            imported += 1
        if first_image_id is None:
            first_image_id = result.image_id

    bg_mode = "managed_single" if settings.get("display_mode") == "single" else "managed_rotation"
    bg_fit = settings.get("image_fit") or "cover"
    render_enabled = 1 if settings.get("render_enabled") else 0
    slideshow_enabled = 1 if settings.get("slideshow_enabled") else 0
    render_width = settings.get("render_width")
    render_height = settings.get("render_height")
    render_position = settings.get("render_position") or "center"
    slideshow_interval_value = settings.get("slideshow_interval_value") or 30
    slideshow_interval_unit = settings.get("slideshow_interval_unit") or "seconds"
    slideshow_advance_mode = settings.get("slideshow_advance_mode") or "random"
    accent = settings.get("color_scheme")
    single_id = None
    if bg_mode == "managed_single" and settings.get("single_image_id") is not None:
        source_id = int(settings["single_image_id"])
        match = next((row for row in images if int(row["id"]) == source_id), None)
        if match is not None:
            source = images_root / match["filename"]
            if source.exists():
                single_id = import_image_from_path(
                    owner["id"],
                    str(source),
                    match["original_name"],
                    source_import_key=f"bunella:{match['id']}:{match['content_hash'] or match['filename']}",
                ).image_id
    if single_id is None:
        single_id = first_image_id

    with get_db_connection() as conn:
        conn.execute(
            """
            UPDATE pages
            SET bg_image_mode=?, bg_managed_image_id=?, bg_image_fit=?, bg_render_enabled=?, bg_render_width=?, bg_render_height=?,
                bg_render_position=?, bg_slideshow_enabled=?, bg_slideshow_interval_value=?, bg_slideshow_interval_unit=?,
                bg_slideshow_advance_mode=?, accent=?, updated_at=?
            WHERE id = ?
            """,
            (
                bg_mode,
                single_id,
                bg_fit,
                render_enabled,
                render_width,
                render_height,
                render_position,
                slideshow_enabled,
                slideshow_interval_value,
                slideshow_interval_unit,
                slideshow_advance_mode,
                accent,
                now_iso(),
                page_id,
            ),
        )
        conn.commit()

    print(
        f"Imported bunella into page '{args.page_title}' (id={page_id}) for {args.target_username}: "
        f"{imported} new images, {duplicates} duplicates."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
