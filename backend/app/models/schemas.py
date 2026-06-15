"""Pydantic request/response models."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["admin", "user"]
UserStatus = Literal["pending", "active", "rejected", "disabled"]
Visibility = Literal["private", "shared"]
BookmarkSort = Literal["manual", "title_asc"]
PageSearchMode = Literal["inherit", "show", "hide"]
PageSingleRowOrder = Literal["natural", "tallest_first"]
PageLayoutMode = Literal["natural", "balanced", "manual"]
PageGroupAlign = Literal["left", "center", "right"]
GroupDisplayMode = Literal["list", "detailed", "icons", "cloud"]
GroupIconSize = Literal["small", "medium", "large", "xl"]
GroupBookmarkAlign = Literal["auto", "left", "center"]
BackgroundImageMode = Literal["external", "managed_single", "managed_rotation", "solid"]
BackgroundImageFit = Literal["cover", "contain", "fill", "scale-down"]
BackgroundImagePosition = Literal["center", "north", "south", "east", "west", "northwest", "northeast", "southwest", "southeast"]
RenderPosition = Literal["center", "east", "west", "north", "south", "northwest"]
TimerUnit = Literal["seconds", "minutes"]
AdvanceMode = Literal["random", "sequential", "shuffle"]


# ---- Auth ----
class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    display_name: Optional[str] = Field(default=None, max_length=120)


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    icon_url: Optional[str] = None
    role: Role
    is_active: bool = True
    status: UserStatus = "active"


# ---- Pages ----
class PageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class PageUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    visibility: Optional[Visibility] = None
    is_archived: Optional[bool] = None
    position: Optional[int] = None
    max_cols: Optional[int] = Field(default=None, ge=0, le=12)  # 0 = unlimited (fill screen)
    open_new_tab: Optional[bool] = None
    layout_mode: Optional[PageLayoutMode] = None
    auto_balance: Optional[bool] = None  # auto-space: spread groups to fill columns
    single_row_order: Optional[PageSingleRowOrder] = None
    card_gap: Optional[int] = Field(default=None, ge=0, le=48)  # px, vertical
    card_gap_x: Optional[int] = Field(default=None, ge=0, le=48)  # px, horizontal
    bookmark_gap: Optional[int] = Field(default=None, ge=0, le=24)  # px
    card_max_width: Optional[int] = Field(default=None, ge=0, le=640)  # px, 0 = auto/fill
    group_align: Optional[PageGroupAlign] = None  # horizontal alignment of the column block
    search_mode: Optional[PageSearchMode] = None
    show_overview: Optional[bool] = None
    analytics_enabled: Optional[bool] = None
    bg_image_mode: Optional[BackgroundImageMode] = None
    bg_managed_image_id: Optional[int] = None
    bg_image_fit: Optional[BackgroundImageFit] = None
    bg_image_position: Optional[BackgroundImagePosition] = None
    bg_render_enabled: Optional[bool] = None
    bg_render_width: Optional[int] = Field(default=None, ge=1, le=12000)
    bg_render_height: Optional[int] = Field(default=None, ge=1, le=12000)
    bg_render_position: Optional[RenderPosition] = None
    bg_slideshow_enabled: Optional[bool] = None
    bg_slideshow_interval_value: Optional[int] = Field(default=None, ge=1, le=1440)
    bg_slideshow_interval_unit: Optional[TimerUnit] = None
    bg_slideshow_advance_mode: Optional[AdvanceMode] = None
    bg_color: Optional[str] = Field(default=None, max_length=32)
    bg_image: Optional[str] = Field(default=None, max_length=2048)
    accent: Optional[str] = Field(default=None, max_length=32)
    bookmark_title_color: Optional[str] = Field(default=None, max_length=32)


class PageOut(BaseModel):
    id: int
    owner_id: int
    title: str
    slug: str
    visibility: Visibility
    share_id: Optional[str] = None
    position: int
    can_edit: bool = False
    is_owner: bool = False


# ---- Groups ----
class GroupCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    icon_url: Optional[str] = Field(default=None, max_length=2048)
    bg_color: Optional[str] = Field(default=None, max_length=32)
    header_bg_color: Optional[str] = Field(default=None, max_length=32)
    header_text_color: Optional[str] = Field(default=None, max_length=32)
    bookmark_title_color: Optional[str] = Field(default=None, max_length=32)
    transparency: Optional[int] = Field(default=0, ge=0, le=100)
    display_mode: Optional[GroupDisplayMode] = None
    icon_size: Optional[GroupIconSize] = None
    bookmark_align: Optional[GroupBookmarkAlign] = None
    visible_limit: Optional[int] = Field(default=0, ge=0, le=200)


class GroupUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    icon_url: Optional[str] = Field(default=None, max_length=2048)
    bg_color: Optional[str] = Field(default=None, max_length=32)
    header_bg_color: Optional[str] = Field(default=None, max_length=32)
    header_text_color: Optional[str] = Field(default=None, max_length=32)
    bookmark_title_color: Optional[str] = Field(default=None, max_length=32)
    transparency: Optional[int] = Field(default=None, ge=0, le=100)
    display_mode: Optional[GroupDisplayMode] = None
    icon_size: Optional[GroupIconSize] = None
    bookmark_align: Optional[GroupBookmarkAlign] = None
    visible_limit: Optional[int] = Field(default=None, ge=0, le=200)
    position: Optional[int] = None
    page_id: Optional[int] = None
    bookmark_sort: Optional[BookmarkSort] = None
    manual_x: Optional[int] = None
    manual_y: Optional[int] = None
    manual_z: Optional[int] = None


# ---- Bookmarks ----
class BookmarkCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    url: str = Field(min_length=1, max_length=2048)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_url: Optional[str] = None
    docker_ref: Optional[str] = Field(default=None, max_length=200)
    title_color: Optional[str] = Field(default=None, max_length=32)


class BookmarkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    url: Optional[str] = Field(default=None, min_length=1, max_length=2048)
    description: Optional[str] = Field(default=None, max_length=500)
    icon_url: Optional[str] = None
    docker_ref: Optional[str] = Field(default=None, max_length=200)
    title_color: Optional[str] = Field(default=None, max_length=32)
    group_id: Optional[int] = None
    position: Optional[int] = None


class ExtensionBookmarkCreate(BaseModel):
    group_id: int
    title: Optional[str] = Field(default=None, max_length=200)
    url: str = Field(min_length=1, max_length=2048)
    description: Optional[str] = Field(default=None, max_length=500)


# ---- Reorder (drag/drop persistence) ----
class ReorderGroup(BaseModel):
    group_id: int
    column: int = 0
    position: int
    bookmark_ids: list[int] = []


class ReorderRequest(BaseModel):
    groups: list[ReorderGroup]


# ---- Admin: users & grants ----
class AdminUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    display_name: Optional[str] = Field(default=None, max_length=120)
    role: Role = "user"


class AdminUserUpdate(BaseModel):
    email: Optional[str] = Field(default=None, min_length=3, max_length=255)
    display_name: Optional[str] = Field(default=None, max_length=120)
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)
    status: Optional[UserStatus] = None


class DockerAssignmentItem(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    enabled: bool = False
    group_id: Optional[int] = None


class DockerAssignmentsUpdate(BaseModel):
    assignments: list[DockerAssignmentItem]


class PermissionItem(BaseModel):
    user_id: int
    can_edit: bool = False


class PermissionsUpdate(BaseModel):
    permissions: list[PermissionItem]


class PageAnalyticsClick(BaseModel):
    bookmark_id: int
    session_key: Optional[str] = Field(default=None, max_length=128)


# ---- Account & settings ----
class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ProfileUpdate(BaseModel):
    icon_url: Optional[str] = Field(default=None, max_length=2048)


class RecipientLookup(BaseModel):
    recipient: str = Field(min_length=1, max_length=255)


class PrivatePageInviteCreate(RecipientLookup):
    can_edit: bool = False


class BookmarkShareCreate(RecipientLookup):
    pass


class PreferencesUpdate(BaseModel):
    theme: Optional[Literal["dark", "light", "system"]] = None
    show_search_bar: Optional[bool] = None
    show_website_icons: Optional[bool] = None
    open_links_in_new_tab: Optional[bool] = None
    add_bookmarks_to_top: Optional[bool] = None
    restore_last_page: Optional[bool] = None
    language: Optional[str] = Field(default=None, max_length=64)
    country: Optional[str] = Field(default=None, max_length=64)


class AppSettingsUpdate(BaseModel):
    site_name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    allow_sharing: Optional[bool] = None
    icon_treatment: Optional[Literal["default", "monochrome", "tile"]] = None
    docker_integration_enabled: Optional[bool] = None
    docker_api_endpoint: Optional[str] = Field(default=None, max_length=512)
    docker_status_poll_seconds: Optional[int] = Field(default=None, ge=5, le=3600)
