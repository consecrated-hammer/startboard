# Docker Integration

## Summary

Startboard's Docker integration is now a live inventory and assignment system.
It is no longer modeled as a compose-file import workflow.

The admin UI connects to a Docker API endpoint, discovers workloads, shows
status, reads Homepage-style labels when present, and lets the admin assign
specific workloads to specific page/group destinations.

## Key Behavior

- Discovery is live from Docker, not from a YAML/compose parser.
- Running and stopped containers are both included.
- A workload can be visible on the board even if it has no usable launch URL.
- Existing Docker-linked bookmarks are preserved and surfaced as managed
  assignments.

## Terminology

- `workload`: the normalized unit exposed to Startboard
- `docker_service`: the bookmark `source_type` used for Docker-managed entries
- `source_ref`: the canonical Docker key used to reconnect a bookmark to a
  discovered workload

In practice, a workload key is usually:

- `com.docker.compose.service` when available
- otherwise a container name
- otherwise a short container ID fallback

## Label Support

When available, Startboard reads Homepage-style labels directly from the Docker
labels of the primary container in a workload:

- `homepage.name`
- `homepage.group`
- `homepage.icon`
- `homepage.href`
- `homepage.description`

These are advisory, not mandatory.

Important rule:

- `homepage.href` is optional

If `homepage.href` is missing, Startboard can still surface the workload on a
page for visibility and live status, but it renders as a non-clickable entry.

## Backend Flow

Core service:

- `backend/app/services/docker_status.py`

Key routes:

- `GET /api/admin/docker/preview`
- `POST /api/admin/docker/assignments`

Preview returns:

- current Docker endpoint / poll settings
- discovered workload list
- current Startboard assignment state
- available page/group destinations

Assignments update:

- enable/disable a workload
- choose a target group
- create or update the corresponding bookmark

## Bookmark Representation

Docker-managed bookmarks use:

- `source_type = 'docker_service'`
- `source_ref = <workload key>`
- `docker_ref = <workload key>`

If a workload has no launchable URL, Startboard stores an internal placeholder
URL using the `docker://...` scheme. The API serializer then marks the bookmark
as:

- `launchable: false`
- `display_url: null`

This allows the UI to:

- show the service
- keep status badges working
- avoid pretending the entry is clickable

## UI Behavior

Admin integrations UI:

- tabbed `Connection` and `Assignments` sections
- search/filter over workloads
- per-workload enable toggle
- page/group destination pickers
- visible workload state even without `homepage.href`

Board rendering:

- launchable Docker bookmarks behave like normal bookmarks
- visibility-only Docker bookmarks do not navigate
- context menus stay available for editable boards

### Generated Docker system page

When Docker integration is enabled, Startboard creates a real **Docker
services** page for the primary administrator. It is listed and opened like any
other page (`/p/<page-id>`) and uses the ordinary board layout, page settings,
and group settings.

- it includes every workload Docker currently reports, including `healthy`,
  `running`, `unhealthy`, and stopped/exited workloads;
- groups come from `homepage.group`, with **Other Docker services** as the
  fallback for workloads without that label;
- services without `homepage.href` are placed in a matching **· Internal**
  group, so non-launchable support containers stay separate from clickable
  services;
- a workload disappears only when Docker no longer reports its container;
- page layout and group presentation settings are persisted normally;
- Docker-managed bookmarks cannot be edited, moved, or deleted; their
  right-click menu provides Open and, when `homepage.href` exists, Copy to page.

The generated records use `docker_system` (page), `docker_system_group`
(group), and `docker_system_service` (bookmark) source types. A copied entry
uses `docker_copy`, remains an ordinary editable bookmark with a Docker status
reference, and is independent of the generated inventory lifecycle.

## Status Model

Docker status is intentionally lightweight.

Current normalized states:

- `healthy`
- `running`
- `stopped`
- `unhealthy`
- `unknown`

Presentation currently treats `running` and `healthy` with the same positive
iconography on the board.

## Operational Notes

- The polling loop runs in the backend app and refreshes the status cache.
- The Docker API endpoint is configurable in app settings.
- Common local endpoint: `unix:///var/run/docker.sock`

This integration is designed as "homepage-adjacent", not a replacement for a
real monitoring stack.
