# Startboard

Startboard is a self-hosted start page and bookmark dashboard with a browser-first editing model.

It is designed for people who want the convenience of a modern homepage without maintaining a hand-written config file. Pages, groups, bookmarks, icons, sharing, and layout can all be managed from the UI.

## What To Expect

Startboard is aimed at:

- self-hosters who want a clean home page for services, tools, and links
- multi-user setups where some pages are private and some are shared
- users who want drag-and-drop editing instead of YAML or JSON
- people who care about icons, layout, and visual polish

Startboard is not primarily a metrics dashboard. It can show lightweight Docker status badges, but bookmarks and navigation remain the core product.

## Highlights

- Multiple pages with tabbed navigation
- Rich page, group, and bookmark editing in the browser
- Public read-only page sharing
- Multi-user access with per-page permissions
- Drag-and-drop groups and bookmarks
- Live Docker inventory with assign-to-page/group workflows
- Local-first icon management with library search and uploads
- Offline snapshot fallback for boards you have already loaded
- Private Edge companion extension for saving the current tab into Startboard
- Dedicated admin analytics page for page usage and bookmark click reporting

## Editing Model

Everything is managed in the app itself:

- `User Preferences` for personal behavior and appearance defaults
- `Administration` for site-wide branding, integrations, and user management
- `Page settings` for page-specific layout, background, sharing, and behavior
- `Group actions` for widget-style management, display options, and bulk bookmark editing
- `Bookmark actions` for per-link editing, moving, duplication, and icon changes

The UI is organized around object-level settings rather than raw implementation details:

- page-level settings for layout and sharing
- group-level settings for display and structure
- bookmark-level settings for links and icons
- account-level settings for user preferences and extension setup

## Features

### Pages

- Create multiple pages per user
- Private-by-default pages
- Public share links for read-only access
- Duplicate pages
- Delete pages with share-link warning
- Archive and restore pages
- Per-page permissions for view/edit grants
- Empty-state affordances for first page / first group creation
- Per-page background controls:
  - accent colour
  - background colour
  - background image URL
- Per-page layout controls:
  - max columns
  - auto-balance mode
  - single-row ordering for yolo/auto-balance layouts
  - vertical card spacing
  - horizontal card spacing
  - bookmark spacing
  - max card width
- Per-page behavior controls:
  - search bar override
  - link opening behavior
  - page overview toggle
  - analytics enable/disable

### Groups

- Titled bookmark groups with optional icons
- Drag groups between columns and pages
- Move groups between pages
- Duplicate groups
- Per-group display modes:
  - list
  - detailed
  - icons
  - cloud
- Per-group appearance settings:
  - background colour
  - header background colour
  - header text colour
  - transparency
  - icon size
  - bookmark alignment
  - visible bookmark limit
- Group bookmark sorting:
  - manual
  - title A-Z
- Group bookmark management view for quick add, search, edit, and delete
- Open all links in a group in new tabs

### Bookmarks

- Add, edit, move, delete, and duplicate bookmarks
- Move bookmarks between groups
- Drag bookmarks within and across groups
- Send bookmarks to the top or bottom of a group
- Copy bookmark links to the clipboard
- Optional descriptions
- Optional Docker references for lightweight status badges
- Localized icon handling
- Visibility-only Docker bookmarks for services that do not expose a usable URL

### Context Menus And Actions

- Right-click actions for groups and bookmarks
- Permission-aware menus outside edit mode
- Bookmark-specific actions take precedence over group actions
- Kebab menus for page, group, and bookmark actions
- Inline edit mode for drag handles and structural changes

### Icons

Startboard treats icons as first-class content rather than simple favicons.

- Automatic favicon lookup
- Direct icon URLs
- Local file uploads
- Local caching of remote/provider icons
- Group icons and bookmark icons use the same picker model
- Shared icon workflow for:
  - auto favicon
  - direct/self-hosted URL
  - uploaded file
  - searchable library providers

Current library/provider support includes:

- `selfh.st/icons`
- Dashboard Icons
- Lucide
- Tabler
- Phosphor
- Remix Icon
- Heroicons
- Iconoir
- Google Material Symbols
- Simple Icons

Uploads and localized remote icons are served back from Startboard under `/api/icons/...`, so you are not forced to keep depending on third-party URLs after selection.

### Themes And Preferences

- Theme system:
  - dark
  - light
  - system
- User preferences for:
  - search bar default
  - website icon display
  - open links in new tab
  - add bookmarks to top
  - restore last page
  - language
  - country
- Theme-aware icon treatment options for supported vector/library icons
- Profile avatar/icon support
- Self-service password change

### Sharing And Read-Only Viewing

- Anonymous read-only shared pages
- Shared pages keep owner content authoritative
- Shared views can still be measured when page analytics is enabled
- Shared viewers can now apply local-only view overrides in their own browser:
  - background colour
  - background image URL
  - accent colour
  - column/layout controls
  - search bar visibility
  - link opening behavior
- Shared-view overrides are stored in browser `localStorage`, scoped to the share link, and never written back to the database

### Docker And Homepage Integration

Startboard now treats Docker integration as a live inventory and assignment workflow rather than a compose-file import tool.

Current Docker features include:

- connect directly to a Docker socket/API endpoint
- discover running and stopped workloads
- read Homepage-style labels directly from Docker metadata when present
- assign any discovered workload to a page/group from the admin UI
- preserve and manage existing Docker-linked bookmarks
- show live status icons on board bookmarks
- support visibility-only Docker entries when no launch URL exists

Homepage-style labels such as `homepage.name`, `homepage.group`, `homepage.icon`, and `homepage.href` are used when available, but Startboard does not require `homepage.href` to surface a service on the board.

The Docker badge is intentionally lightweight. It is there to help you spot obvious state at a glance, not to replace a monitoring system.

### Analytics

Page analytics is opt-in, per page.

When enabled, Startboard records:

- page views
- bookmark clicks
- last-viewed and last-clicked timestamps
- 7-day view and click totals
- unique viewers by local browser/session key
- audience/source split for views
- duplicate destinations on the page
- bookmarks with zero clicks

Admins also get a dedicated analytics screen at `/analytics` with:

- page-level summary cards
- full bookmark click inventory for the selected page
- per-bookmark click counts and last-clicked timestamps
- bookmark drill-in showing top clickers / shared-viewer sessions

This is intended as practical usage insight for dashboards and shared pages, not a full product-analytics platform.

### Browser Extension

Startboard ships with a private Edge companion extension workflow.

- Downloadable extension package from the UI
- Per-user extension token generation/rotation/revocation
- Startboard-hosted install instructions
- Destination picker for page/group selection
- Duplicate detection before save
- Save the current tab into Startboard without opening the full app

The extension is intended for private/self-hosted sideload use, not public Edge Store distribution.

## Authentication And Access

- Built-in username/password authentication
- Cookie-based sessions
- Admin and user roles
- Per-page view and edit permissions
- Public share links for anonymous read-only viewing
- Browser-extension auth via dedicated per-user token

Startboard does not require an external auth proxy, but it can sit behind one if you want.

## Offline Behavior

- Cached offline snapshot for previously loaded private boards
- Cached offline snapshot for previously loaded shared boards
- Editing is disabled while running from offline snapshots
- Shared-view local overrides continue to apply on top of the last cached shared page

## Technology

- Backend: FastAPI
- Database: SQLite
- Frontend: React + Vite + Tailwind CSS
- Drag and drop: `dnd-kit`
- Packaging: single Docker image serving both API and SPA

## Further Documentation

For technical subsystem notes, see:

- [docs/public/architecture/README.md](./docs/public/architecture/README.md)
- [docs/public/architecture/docker-integration.md](./docs/public/architecture/docker-integration.md)
- [docs/public/architecture/analytics.md](./docs/public/architecture/analytics.md)


## Development

```bash
# First-time setup
cp .env.dev.example .env.dev

# Local immediate-feedback dev mode
./scripts/dev.sh
```

This starts:

- FastAPI locally with `uvicorn --reload`
- Vite locally
- a separate dev data tree under `.data/dev/`

By default the Vite dev server listens on the host so you can open it from another machine on your LAN, for example:

- `http://localhost:5173`
- `http://192.168.x.x:5173`

Useful variants:

```bash
./scripts/dev.sh --lint-only
./scripts/dev.sh --test-only
./scripts/dev.sh --build-only
./scripts/dev.sh --skip-tests
```

If you need an initial local admin user for a fresh dev DB:

```bash
cd backend
../.venv/bin/python -m scripts.seed --username admin --password changeme --role admin
```

## Configuration

Environment variables are documented in [`.env.example`](./.env.example).

Important areas include:

- database path
- session and cookie behavior
- rate limiting
- icon upload limits
- icon provider endpoints
- Docker API endpoint and poll interval
- logging paths and verbosity

For production, set at least:

- `APP_ENV=production`
- a strong `SECRET_KEY`
- `SESSION_COOKIE_SECURE=true`

## Build And Deploy

Canonical build:

```bash
./scripts/build.sh
```

Deploy using the helper script:

```bash
./scripts/deploy.sh
```

Or skip rebuild if you already built the image:

```bash
./scripts/deploy.sh --no-build
```

The provided deployment path is Docker-first and works well behind Traefik, but Startboard does not depend on Traefik specifically.

### Production Persistence

The repo-local Traefik compose file now persists Startboard state to a host path instead of a named Docker volume:

- `STARTBOARD_DATA_HOST_PATH=./.data` by default
- container data lives at `/data`
- this includes the SQLite DB, cached icons, and logs

### Main Docker Compose Integration

The recommended long-term production shape is your main host compose stack in:

- `/mnt/docker/config/dockerconfigs/docker-compose.yml`

That service is image-based and pulls from:

- `ghcr.io/consecrated-hammer/startboard:latest`

Its persistent storage lives on disk at:

- `${MOUNT_DOCKER_CONFIG}/startboard/data`

So production state is no longer tied to an opaque Docker-managed volume.

## Current Scope Notes

Some parts of the product are intentionally lightweight rather than fully enterprise-grade:

- Docker badges are simple status signals, not deep observability
- analytics is intended for page/share insight, not full BI or marketing analytics
- offline mode is best-effort snapshot support, not full offline editing/sync
- the Edge companion is intentionally private/sideloaded rather than public-store packaged

## Project Direction

Startboard is actively evolving. The current direction is focused on:

- clearer settings architecture
- stronger page/group/bookmark action flows
- better icon workflows
- practical self-hosted integrations
- shared-page flexibility without forcing accounts
- keeping the product visually distinctive without turning it into a clone of any existing dashboard
