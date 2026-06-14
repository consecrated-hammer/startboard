"""Per-user preferences and app-wide settings."""

from fastapi import APIRouter, Depends

from app.db.settings_store import (
    get_app_settings,
    get_docker_integration_settings,
    get_user_preferences,
    set_app_settings,
    set_user_preferences,
)
from app.deps import require_admin, require_user
from app.models.schemas import AppSettingsUpdate, PreferencesUpdate

router = APIRouter(tags=["settings"])


@router.get("/settings")
def public_settings():
    """Branding/feature flags needed by the SPA before/without auth."""
    s = get_app_settings()
    return {
        "site_name": s.get("site_name"),
        "allow_sharing": s.get("allow_sharing") == "true",
        "icon_treatment": s.get("icon_treatment", "default"),
    }


@router.get("/admin/settings")
def admin_settings(_: dict = Depends(require_admin)):
    app_settings = get_app_settings()
    docker_settings = get_docker_integration_settings()
    return {
        "site_name": app_settings.get("site_name"),
        "allow_sharing": app_settings.get("allow_sharing") == "true",
        "icon_treatment": app_settings.get("icon_treatment", "default"),
        "docker_integration_enabled": docker_settings["enabled"],
        "docker_api_endpoint": docker_settings["api_endpoint"],
        "docker_status_poll_seconds": docker_settings["poll_seconds"],
    }


@router.get("/preferences")
def get_preferences(user: dict = Depends(require_user)):
    return get_user_preferences(user["id"])


@router.put("/preferences")
def update_preferences(payload: PreferencesUpdate, user: dict = Depends(require_user)):
    values = {}
    for key in (
        "theme",
        "show_search_bar",
        "show_website_icons",
        "open_links_in_new_tab",
        "add_bookmarks_to_top",
        "restore_last_page",
        "language",
        "country",
    ):
        value = getattr(payload, key)
        if value is not None:
            values[key] = value.strip() if isinstance(value, str) else value
    if not values:
        return get_user_preferences(user["id"])
    return set_user_preferences(user["id"], values)


@router.put("/admin/settings")
def update_settings(payload: AppSettingsUpdate, _: dict = Depends(require_admin)):
    values = {}
    if payload.site_name is not None:
        values["site_name"] = payload.site_name.strip()
    if payload.allow_sharing is not None:
        values["allow_sharing"] = "true" if payload.allow_sharing else "false"
    if payload.icon_treatment is not None:
        values["icon_treatment"] = payload.icon_treatment
    if payload.docker_integration_enabled is not None:
        values["docker_integration_enabled"] = "true" if payload.docker_integration_enabled else "false"
    if payload.docker_api_endpoint is not None:
        values["docker_api_endpoint"] = payload.docker_api_endpoint.strip()
    if payload.docker_status_poll_seconds is not None:
        values["docker_status_poll_seconds"] = str(payload.docker_status_poll_seconds)
    if values:
        set_app_settings(values)
    return admin_settings(_)
