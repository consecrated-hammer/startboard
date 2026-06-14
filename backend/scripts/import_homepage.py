"""Import a gethomepage `bookmarks.yaml` into a Startboard page.

homepage format:
    - Group Name:
        - Bookmark Name:
            - href: https://...
              description: "..."
              icon: si-...        # homepage-specific; ignored (we resolve favicon)

Usage (from backend/, venv active, env vars set):
    python -m scripts.import_homepage \
        --yaml /mnt/docker/config/dockerconfigs/homepage/bookmarks.yaml \
        --owner admin --page "Imported"
"""

import argparse
import sys

import yaml

from app.db.database import get_db_connection
from app.routes._helpers import now_iso, slugify
from app.services.favicon import domain_of, resolve_icon


def _first(d: dict):
    """homepage uses single-key dicts; return (key, value)."""
    k = next(iter(d))
    return k, d[k]


def main() -> int:
    parser = argparse.ArgumentParser(description="Import homepage bookmarks.yaml")
    parser.add_argument("--yaml", required=True)
    parser.add_argument("--owner", required=True, help="owner username")
    parser.add_argument("--page", default="Imported", help="title for the new page")
    args = parser.parse_args()

    with open(args.yaml, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or []

    with get_db_connection() as conn:
        owner = conn.execute(
            "SELECT id FROM users WHERE username = ?", (args.owner,)
        ).fetchone()
        if owner is None:
            print(f"ERROR: owner '{args.owner}' not found. Seed a user first.", file=sys.stderr)
            return 1
        owner_id = owner["id"]
        ts = now_iso()

        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM pages WHERE owner_id = ?", (owner_id,)
        ).fetchone()["m"]
        cur = conn.execute(
            """
            INSERT INTO pages (owner_id, title, slug, visibility, position, created_at, updated_at)
            VALUES (?, ?, ?, 'private', ?, ?, ?)
            """,
            (owner_id, args.page, slugify(args.page), max_pos + 1, ts, ts),
        )
        page_id = cur.lastrowid

        n_groups = n_bookmarks = 0
        for gpos, group_entry in enumerate(data):
            if not isinstance(group_entry, dict):
                continue
            group_name, items = _first(group_entry)
            # Round-robin across 4 logical columns for a balanced initial layout.
            gcur = conn.execute(
                "INSERT INTO groups (page_id, title, col, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (page_id, str(group_name), gpos % 4, gpos // 4, ts, ts),
            )
            group_id = gcur.lastrowid
            n_groups += 1
            for bpos, bm_entry in enumerate(items or []):
                if not isinstance(bm_entry, dict):
                    continue
                bm_name, props = _first(bm_entry)
                # props is a list of dicts in homepage format.
                meta = {}
                if isinstance(props, list):
                    for p in props:
                        if isinstance(p, dict):
                            meta.update(p)
                elif isinstance(props, dict):
                    meta = props
                href = (meta.get("href") or "").strip()
                if not href:
                    continue
                title = str(bm_name) or domain_of(href) or href
                desc = meta.get("description") or None
                conn.execute(
                    """
                    INSERT INTO bookmarks (group_id, title, url, icon_url, description, position, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (group_id, title, href, resolve_icon(href), desc, bpos, ts, ts),
                )
                n_bookmarks += 1
        conn.commit()

    print(f"Imported page '{args.page}' (id={page_id}): {n_groups} groups, {n_bookmarks} bookmarks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
