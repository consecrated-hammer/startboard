"""App-wide settings (key/value) and per-user preferences access."""

from datetime import datetime, timezone

from app.db.database import get_db_connection

# Defaults applied when a key has never been set.
APP_DEFAULTS = {
    "site_name": "Startboard",
    "allow_sharing": "true",
    "icon_treatment": "default",
    "docker_integration_enabled": "false",
    "docker_api_endpoint": "unix:///var/run/docker.sock",
    "docker_status_poll_seconds": "30",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_app_settings() -> dict:
    """Return all app settings, merged over defaults. Values are strings."""
    out = dict(APP_DEFAULTS)
    with get_db_connection() as conn:
        for row in conn.execute("SELECT key, value FROM app_settings").fetchall():
            out[row["key"]] = row["value"]
    return out


def set_app_settings(values: dict) -> None:
    with get_db_connection() as conn:
        for key, value in values.items():
            conn.execute(
                """
                INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                """,
                (key, str(value), _now()),
            )
        conn.commit()


def sharing_enabled() -> bool:
    return get_app_settings().get("allow_sharing", "true") == "true"


def get_docker_integration_settings() -> dict:
    settings = get_app_settings()
    poll_raw = settings.get("docker_status_poll_seconds", APP_DEFAULTS["docker_status_poll_seconds"])
    try:
        poll_seconds = max(5, min(3600, int(poll_raw)))
    except (TypeError, ValueError):
        poll_seconds = int(APP_DEFAULTS["docker_status_poll_seconds"])
    return {
        "enabled": settings.get("docker_integration_enabled", "false") == "true",
        "api_endpoint": settings.get("docker_api_endpoint", APP_DEFAULTS["docker_api_endpoint"]).strip(),
        "poll_seconds": poll_seconds,
    }


def get_user_preferences(user_id: int) -> dict:
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT theme, show_search_bar, show_website_icons, open_links_in_new_tab,
                   add_bookmarks_to_top, restore_last_page, language, country
            FROM user_preferences WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if not row:
            return {
                "theme": "system",
                "show_search_bar": True,
                "show_website_icons": True,
                "open_links_in_new_tab": True,
                "add_bookmarks_to_top": False,
                "restore_last_page": False,
                "language": "English",
                "country": "Australia",
            }
        return {
            "theme": row["theme"],
            "show_search_bar": bool(row["show_search_bar"]),
            "show_website_icons": bool(row["show_website_icons"]),
            "open_links_in_new_tab": bool(row["open_links_in_new_tab"]),
            "add_bookmarks_to_top": bool(row["add_bookmarks_to_top"]),
            "restore_last_page": bool(row["restore_last_page"]),
            "language": row["language"],
            "country": row["country"],
        }


def set_user_preferences(user_id: int, values: dict) -> dict:
    current = get_user_preferences(user_id)
    merged = {**current, **values}
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_preferences (
                user_id, theme, show_search_bar, show_website_icons,
                open_links_in_new_tab, add_bookmarks_to_top, restore_last_page,
                language, country, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                theme=excluded.theme,
                show_search_bar=excluded.show_search_bar,
                show_website_icons=excluded.show_website_icons,
                open_links_in_new_tab=excluded.open_links_in_new_tab,
                add_bookmarks_to_top=excluded.add_bookmarks_to_top,
                restore_last_page=excluded.restore_last_page,
                language=excluded.language,
                country=excluded.country,
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                merged["theme"],
                1 if merged["show_search_bar"] else 0,
                1 if merged["show_website_icons"] else 0,
                1 if merged["open_links_in_new_tab"] else 0,
                1 if merged["add_bookmarks_to_top"] else 0,
                1 if merged["restore_last_page"] else 0,
                merged["language"],
                merged["country"],
                _now(),
            ),
        )
        conn.commit()
    return merged
