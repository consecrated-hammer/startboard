# Page Analytics

## Summary

Startboard analytics is page-scoped and opt-in.

The goal is practical usage insight for personal/shared dashboard pages:

- which pages are being opened
- which bookmarks are actually used
- which links are duplicated
- which links are never clicked
- who or what is generating the traffic

It is not intended as a full BI, product analytics, or marketing analytics
system.

## Enablement Model

Analytics is controlled per page:

- `pages.analytics_enabled`

When disabled:

- no new view/click events are recorded
- the analytics page can still show historical data already collected

## Event Storage

Raw events are stored in:

- `page_events`

Columns:

- `page_id`
- `bookmark_id` nullable for page views
- `event_type`
- `actor_type`
- `actor_user_id`
- `share_id`
- `session_key`
- `bookmark_url`
- `occurred_at`

Why raw events:

- keeps reporting flexible
- avoids pre-committing to one summary layout
- allows later drill-in without schema redesign

## Event Types

Current event types:

- `view`
- `click`

## Actor Model

Current actor categories are intentionally simple:

- `user`: signed-in Startboard user
- `shared`: anonymous visitor using a shared page link
- `viewer` / `unknown`: fallback categories from older or generic tracking paths

The analytics UI should present these with clearer labels than the raw stored
values.

## Tracking Paths

Authenticated page routes:

- `POST /api/pages/{page_id}/analytics/view`
- `POST /api/pages/{page_id}/analytics/click`

Shared page routes:

- `POST /api/public/p/{share_id}/analytics/view`
- `POST /api/public/p/{share_id}/analytics/click`

Frontend delivery:

- best-effort telemetry via `navigator.sendBeacon(...)`
- fetch fallback with `keepalive: true`

This is intentionally low-friction and should not block navigation.

## Viewer Identity

For anonymous/shared traffic, Startboard uses a browser-local session key stored
in local storage. This supports:

- approximate unique viewer counts
- per-bookmark clicker breakdowns
- repeated-shared-viewer identification without requiring an account

This is not a secure identity system. It is a convenience analytics key.

## Current Reports

Admin analytics page:

- route: `/analytics`
- route with selected page: `/analytics/:pageId`

Current reporting includes:

- total views
- total clicks
- 7-day views
- 7-day clicks
- unique viewers
- last view / last click timestamps
- view source / audience split
- full bookmark table for the page
- per-bookmark click counts
- per-bookmark last-clicked timestamps
- per-bookmark unique clickers
- bookmark drill-in with clicker breakdown
- duplicate destinations
- zero-click bookmark count

## Duplicate Detection

Duplicates are derived from the current bookmark set on the page, not from the
event table.

That means duplicate reporting reflects the current board state rather than a
historical snapshot.

## Scale Expectations

The first scaling pressure is the UI, not the event schema.

Expected approach as usage grows:

- keep raw events
- show a full bookmark table
- show only top clickers inline
- move full clicker lists into searchable drill-in UI if needed
- add pagination or virtualization before redesigning storage

Roughly:

- dozens of pages and hundreds of users are still reasonable with the current
  model
- very high event volume would eventually justify rollups/materialized summaries

## Caveats

- ad blockers may block frontend modules or endpoints if filenames include
  obvious analytics terms
- shared-view unique counts are approximate, not identity-backed
- disabled analytics prevents future data collection but does not purge
  historical data
