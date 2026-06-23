"""SQLite database management for Startboard.

Raw sqlite3 (no ORM), mirroring the playlistpolisher house style:
- idempotent `init_db()` using CREATE TABLE IF NOT EXISTS (+ guarded ALTERs),
- `get_db_connection()` context manager with `row_factory = sqlite3.Row`,
- `init_db()` runs on import.
"""

import logging
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(os.getenv("STARTBOARD_DB_PATH", "/data/startboard.db"))


def init_db() -> None:
    """Create tables/indexes if they do not yet exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Users
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT,
            display_name TEXT,
            icon_url TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            approved_at TEXT,
            approved_by_user_id INTEGER,
            rejected_at TEXT,
            rejected_by_user_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    # Migration: user avatar on existing DBs.
    for ddl in (
        "ALTER TABLE users ADD COLUMN icon_url TEXT",
        "ALTER TABLE users ADD COLUMN email TEXT",
        "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN approved_at TEXT",
        "ALTER TABLE users ADD COLUMN approved_by_user_id INTEGER",
        "ALTER TABLE users ADD COLUMN rejected_at TEXT",
        "ALTER TABLE users ADD COLUMN rejected_by_user_id INTEGER",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass  # already exists
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    cur.execute("UPDATE users SET email = username || '@local.invalid' WHERE email IS NULL OR TRIM(email) = ''")
    cur.execute("UPDATE users SET status = 'active' WHERE status IS NULL OR TRIM(status) = ''")

    # Sessions (cookie-based auth, persisted)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            last_used_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)")

    # Pages (tabs)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            slug TEXT NOT NULL,
            share_id TEXT UNIQUE,
            visibility TEXT NOT NULL DEFAULT 'private',
            is_archived INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            max_cols INTEGER NOT NULL DEFAULT 4,
            open_new_tab INTEGER NOT NULL DEFAULT 1,
            layout_mode TEXT NOT NULL DEFAULT 'natural',
            auto_balance INTEGER NOT NULL DEFAULT 0,
            single_row_order TEXT NOT NULL DEFAULT 'natural',
            card_gap INTEGER NOT NULL DEFAULT 12,
            card_gap_x INTEGER NOT NULL DEFAULT 16,
            bookmark_gap INTEGER NOT NULL DEFAULT 2,
            card_max_width INTEGER NOT NULL DEFAULT 0,
            group_align TEXT NOT NULL DEFAULT 'center',
            search_mode TEXT NOT NULL DEFAULT 'inherit',
            show_overview INTEGER NOT NULL DEFAULT 0,
            analytics_enabled INTEGER NOT NULL DEFAULT 0,
            bg_image_mode TEXT NOT NULL DEFAULT 'external',
            bg_managed_image_id INTEGER,
            bg_image_fit TEXT NOT NULL DEFAULT 'cover',
            bg_image_position TEXT NOT NULL DEFAULT 'center',
            bg_render_enabled INTEGER NOT NULL DEFAULT 0,
            bg_render_width INTEGER,
            bg_render_height INTEGER,
            bg_render_position TEXT NOT NULL DEFAULT 'center',
            bg_slideshow_enabled INTEGER NOT NULL DEFAULT 0,
            bg_slideshow_interval_value INTEGER NOT NULL DEFAULT 30,
            bg_slideshow_interval_unit TEXT NOT NULL DEFAULT 'seconds',
            bg_slideshow_advance_mode TEXT NOT NULL DEFAULT 'random',
            bg_color TEXT,
            bg_image TEXT,
            accent TEXT,
            icon_color TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pages_share ON pages(share_id)")
    # Migrations: per-page display settings on existing DBs.
    for ddl in (
        "ALTER TABLE pages ADD COLUMN max_cols INTEGER NOT NULL DEFAULT 4",
        "ALTER TABLE pages ADD COLUMN open_new_tab INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE pages ADD COLUMN layout_mode TEXT NOT NULL DEFAULT 'natural'",
        "ALTER TABLE pages ADD COLUMN auto_balance INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN single_row_order TEXT NOT NULL DEFAULT 'natural'",
        "ALTER TABLE pages ADD COLUMN card_gap INTEGER NOT NULL DEFAULT 12",
        "ALTER TABLE pages ADD COLUMN card_gap_x INTEGER NOT NULL DEFAULT 16",
        "ALTER TABLE pages ADD COLUMN bookmark_gap INTEGER NOT NULL DEFAULT 2",
        "ALTER TABLE pages ADD COLUMN card_max_width INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN group_align TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE pages ADD COLUMN description TEXT",
        "ALTER TABLE pages ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN search_mode TEXT NOT NULL DEFAULT 'inherit'",
        "ALTER TABLE pages ADD COLUMN show_overview INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN analytics_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN bg_image_mode TEXT NOT NULL DEFAULT 'external'",
        "ALTER TABLE pages ADD COLUMN bg_managed_image_id INTEGER",
        "ALTER TABLE pages ADD COLUMN bg_image_fit TEXT NOT NULL DEFAULT 'cover'",
        "ALTER TABLE pages ADD COLUMN bg_image_position TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE pages ADD COLUMN bg_render_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN bg_render_width INTEGER",
        "ALTER TABLE pages ADD COLUMN bg_render_height INTEGER",
        "ALTER TABLE pages ADD COLUMN bg_render_position TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE pages ADD COLUMN bg_slideshow_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pages ADD COLUMN bg_slideshow_interval_value INTEGER NOT NULL DEFAULT 30",
        "ALTER TABLE pages ADD COLUMN bg_slideshow_interval_unit TEXT NOT NULL DEFAULT 'seconds'",
        "ALTER TABLE pages ADD COLUMN bg_slideshow_advance_mode TEXT NOT NULL DEFAULT 'random'",
        "ALTER TABLE pages ADD COLUMN bg_color TEXT",
        "ALTER TABLE pages ADD COLUMN bg_image TEXT",
        "ALTER TABLE pages ADD COLUMN accent TEXT",
        "ALTER TABLE pages ADD COLUMN bookmark_title_color TEXT",
        "ALTER TABLE pages ADD COLUMN icon_color TEXT",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass  # already exists

    # One-time data migration: card_gap/bookmark_gap moved from a 0–3 preset
    # index to a raw pixel value. Convert legacy index values once so existing
    # pages keep their previous look, then bump user_version so it never re-runs.
    if cur.execute("PRAGMA user_version").fetchone()[0] < 1:
        cur.execute(
            "UPDATE pages SET "
            "card_gap = CASE card_gap WHEN 0 THEN 8 WHEN 1 THEN 12 WHEN 2 THEN 16 WHEN 3 THEN 20 ELSE card_gap END, "
            "bookmark_gap = CASE bookmark_gap WHEN 0 THEN 0 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 6 ELSE bookmark_gap END"
        )
        cur.execute("PRAGMA user_version = 1")

    # Per-page permissions (grant view/edit to specific users)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS page_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            can_edit INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE (page_id, user_id),
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_perm_user ON page_permissions(user_id)")

    # Groups (the columns / "widgets")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            icon_url TEXT,
            bg_color TEXT,
            header_bg_color TEXT,
            header_text_color TEXT,
            icon_color TEXT,
            transparency INTEGER NOT NULL DEFAULT 0,
            display_mode TEXT NOT NULL DEFAULT 'list',
            icon_size TEXT NOT NULL DEFAULT 'small',
            bookmark_align TEXT NOT NULL DEFAULT 'auto',
            visible_limit INTEGER NOT NULL DEFAULT 0,
            source_type TEXT,
            source_ref TEXT,
            bookmark_sort TEXT NOT NULL DEFAULT 'manual',
            col INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            manual_x INTEGER NOT NULL DEFAULT 24,
            manual_y INTEGER NOT NULL DEFAULT 24,
            manual_z INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_groups_page ON groups(page_id)")
    # Migration: add column index to existing DBs (groups can stack in columns).
    try:
        cur.execute("ALTER TABLE groups ADD COLUMN col INTEGER NOT NULL DEFAULT 0")
        logger.info("Added col column to groups")
    except sqlite3.OperationalError:
        pass  # already exists
    for ddl in (
        "ALTER TABLE groups ADD COLUMN icon_url TEXT",
        "ALTER TABLE groups ADD COLUMN bg_color TEXT",
        "ALTER TABLE groups ADD COLUMN header_bg_color TEXT",
        "ALTER TABLE groups ADD COLUMN header_text_color TEXT",
        "ALTER TABLE groups ADD COLUMN bookmark_title_color TEXT",
        "ALTER TABLE groups ADD COLUMN icon_color TEXT",
        "ALTER TABLE groups ADD COLUMN transparency INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE groups ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'list'",
        "ALTER TABLE groups ADD COLUMN icon_size TEXT NOT NULL DEFAULT 'small'",
        "ALTER TABLE groups ADD COLUMN bookmark_align TEXT NOT NULL DEFAULT 'auto'",
        "ALTER TABLE groups ADD COLUMN visible_limit INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE groups ADD COLUMN source_type TEXT",
        "ALTER TABLE groups ADD COLUMN source_ref TEXT",
        "ALTER TABLE groups ADD COLUMN bookmark_sort TEXT NOT NULL DEFAULT 'manual'",
        "ALTER TABLE groups ADD COLUMN manual_x INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE groups ADD COLUMN manual_y INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE groups ADD COLUMN manual_z INTEGER NOT NULL DEFAULT 0",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass
    cur.execute("CREATE INDEX IF NOT EXISTS idx_groups_source ON groups(page_id, source_type, source_ref)")

    # Bookmarks
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            icon_url TEXT,
            icon_color TEXT,
            description TEXT,
            source_type TEXT,
            source_ref TEXT,
            docker_ref TEXT,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_group ON bookmarks(group_id)")
    for ddl in (
        "ALTER TABLE bookmarks ADD COLUMN source_type TEXT",
        "ALTER TABLE bookmarks ADD COLUMN source_ref TEXT",
        "ALTER TABLE bookmarks ADD COLUMN docker_ref TEXT",
        "ALTER TABLE bookmarks ADD COLUMN title_color TEXT",
        "ALTER TABLE bookmarks ADD COLUMN icon_color TEXT",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_source ON bookmarks(source_type, source_ref)")
    cur.execute(
        """
        UPDATE bookmarks
        SET source_type = 'docker_service',
            source_ref = TRIM(docker_ref)
        WHERE (source_type IS NULL OR TRIM(source_type) = '' OR source_type = 'homepage_label')
          AND docker_ref IS NOT NULL
          AND TRIM(docker_ref) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM bookmarks b2
            WHERE b2.id <> bookmarks.id
              AND b2.source_type = 'docker_service'
              AND b2.source_ref = TRIM(bookmarks.docker_ref)
          )
        """
    )

    # Per-page analytics events (views + bookmark clicks). We keep raw events for
    # flexibility because shared-page traffic is expected to be modest, and
    # summary queries stay simple with indexes.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS page_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            bookmark_id INTEGER,
            event_type TEXT NOT NULL,
            actor_type TEXT,
            actor_user_id INTEGER,
            share_id TEXT,
            session_key TEXT,
            bookmark_url TEXT,
            occurred_at TEXT NOT NULL,
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
            FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE SET NULL,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    for ddl in (
        "ALTER TABLE page_events ADD COLUMN actor_type TEXT",
        "ALTER TABLE page_events ADD COLUMN actor_user_id INTEGER",
        "ALTER TABLE page_events ADD COLUMN share_id TEXT",
        "ALTER TABLE page_events ADD COLUMN session_key TEXT",
        "ALTER TABLE page_events ADD COLUMN bookmark_url TEXT",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_events_page_type_time ON page_events(page_id, event_type, occurred_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_events_bookmark ON page_events(bookmark_id, occurred_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_events_session ON page_events(session_key, occurred_at)")

    # Per-user preferences (theme, etc.)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER PRIMARY KEY,
            theme TEXT NOT NULL DEFAULT 'system',
            show_search_bar INTEGER NOT NULL DEFAULT 1,
            show_website_icons INTEGER NOT NULL DEFAULT 1,
            open_links_in_new_tab INTEGER NOT NULL DEFAULT 1,
            add_bookmarks_to_top INTEGER NOT NULL DEFAULT 0,
            restore_last_page INTEGER NOT NULL DEFAULT 0,
            language TEXT NOT NULL DEFAULT 'English',
            country TEXT NOT NULL DEFAULT 'Australia',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    for ddl in (
        "ALTER TABLE user_preferences ADD COLUMN show_search_bar INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_preferences ADD COLUMN show_website_icons INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_preferences ADD COLUMN open_links_in_new_tab INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_preferences ADD COLUMN add_bookmarks_to_top INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_preferences ADD COLUMN restore_last_page INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_preferences ADD COLUMN language TEXT NOT NULL DEFAULT 'English'",
        "ALTER TABLE user_preferences ADD COLUMN country TEXT NOT NULL DEFAULT 'Australia'",
    ):
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass

    # Single per-user browser extension token (stored hashed).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS extension_tokens (
            user_id INTEGER PRIMARY KEY,
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_tokens_hash ON extension_tokens(token_hash)")

    # Application-wide settings (key/value).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Managed background image library.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS managed_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            content_type TEXT,
            upload_date INTEGER NOT NULL,
            in_rotation INTEGER NOT NULL DEFAULT 1,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            content_hash TEXT NOT NULL,
            rotation_order INTEGER,
            favourite INTEGER NOT NULL DEFAULT 0,
            source_import_key TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(owner_id, content_hash)
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_managed_images_owner_date ON managed_images(owner_id, upload_date DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_managed_images_owner_rotation ON managed_images(owner_id, in_rotation, rotation_order)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_managed_images_import_key ON managed_images(source_import_key)")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS page_image_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            image_id INTEGER NOT NULL,
            mode TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
            FOREIGN KEY (image_id) REFERENCES managed_images(id) ON DELETE CASCADE,
            UNIQUE(page_id, image_id, mode)
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_image_assignments_page_mode ON page_image_assignments(page_id, mode, position, id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_image_assignments_image ON page_image_assignments(image_id, mode, page_id)")

    # Pending private page shares that require recipient acceptance.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS page_share_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            sender_user_id INTEGER NOT NULL,
            recipient_user_id INTEGER NOT NULL,
            can_edit INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            responded_at TEXT,
            UNIQUE(page_id, recipient_user_id, status),
            FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_page_share_invites_recipient ON page_share_invites(recipient_user_id, status, created_at DESC)")

    # Pending bookmark copies that require recipient acceptance.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS bookmark_share_offers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_user_id INTEGER NOT NULL,
            recipient_user_id INTEGER NOT NULL,
            source_bookmark_id INTEGER,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            icon_url TEXT,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            responded_at TEXT,
            FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (source_bookmark_id) REFERENCES bookmarks(id) ON DELETE SET NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bookmark_share_offers_recipient ON bookmark_share_offers(recipient_user_id, status, created_at DESC)")

    conn.commit()
    conn.close()
    logger.info("Database initialized at %s", DB_PATH)


@contextmanager
def get_db_connection():
    """Context manager yielding a sqlite3 connection with Row factory + FKs on."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


# Initialize on import (house style).
init_db()
