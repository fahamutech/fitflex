# Metricool capability verification — 2026-10-16

What the connector can verifiably do, from read-only calls made in this session and the tool schemas it exposes. No write was made. Credentials are held by the claude.ai connector and never appear here.

## Connection

| Check | Result | How verified |
|---|---|---|
| Connector authorised in this session | Yes | `getBrandSettings` returned data |
| Brand | FitFlex Africa, id 7458423, timezone Africa/Dar_es_Salaam, first connection 2026-10-16 | `getBrandSettings` |
| Instagram profile connected | Yes, `fitflex.africa` | `getBrandSettings` → `networksData.instagramData` |
| Facebook Page connected | Yes, Page id 1368079233061761 | `getBrandSettings` → `networksData.facebookData` |
| Facebook Page linked to the Instagram account at Meta | **Not verifiable from the connector.** The owner supplied `facebook.com/profile.php?id=61595529537350`; Metricool reports Page id 1368079233061761. These are different id spaces (profile id vs Page id), so they may be the same Page. Confirm in Meta Business settings | owner |
| Plan | Not exposed by the connector. The owner states the plan includes MCP access; `createScheduledPostForReview` says it needs a plan with team management, untested | owner statement |
| Scheduled posts in the planner | None (Oct–Dec 2026) | `getScheduledPosts` |
| Best time to post (Instagram, 19–25 Oct) | All zeros: no history yet on this account | `getBestTimeToPostByNetwork` |
| Instagram post metrics available | IGPO01–29 incl. likes, comments, saved, shares, reach, views, interactions, follows, post id, url; impressions and video views deprecated | `getAnalyticsAvailableMetrics` |

## Actions the connector exposes (schemas read, not called)

| Tool | Use here | Notes |
|---|---|---|
| `getBrandSettings` | brand id, timezone, networks | read |
| `getScheduledPosts` | reconciliation, duplicate check | read |
| `getBestTimeToPostByNetwork` | suggest a slot once data exists | read |
| `getAnalyticsAvailableMetrics`, `getAnalyticsDataByMetrics` | performance snapshots | read |
| `createScheduledPost` | **the only write we use**: `blogId`, `date` (ISO with offset), `info` JSON with `providers`, `text`, `media` (public URLs), `mediaAltText`, `publicationDate {dateTime, timezone}`, `instagramData {type POST, isAiGenerated}`, `facebookData {type POST}`, `autoPublish`, `draft`; returns `plannerUrl` | one platform per call in our process |
| `createScheduledPostForReview`, `sendScheduledPostForReview` | Metricool's own approval flow | not used; our approval is the repo record |
| `updateScheduledPost` | changes a scheduled post; changes its id | not used in Phase 3; errors are final per schema |

## Constraints that shape the process

- Instagram posts need at least one image; carousels are images in `media` order; Instagram allows up to 10 per carousel (ours have 8).
- Media must be public URLs. The repo is public, so slide PNGs are served from `raw.githubusercontent.com` for a pushed ref; `publish.js` refuses any URL that does not answer 200. After merge the base moves to the `release-candidate` or `main` ref.
- `publicationDate.timezone` takes the IANA name; `date` takes ISO with offset. Dar es Salaam has no daylight saving, so the offset is always +03:00.
- Deleting a scheduled post is not exposed; the owner does that in the Metricool planner.
- Publishing to the network happens at the scheduled time by Metricool; the post URL appears afterwards and is read back through analytics (IGPO06).

## Not verified

- Whether the connected Facebook Page is the one linked to the Instagram Business account at Meta (owner to confirm).
- Plan limits (posts per month, team features).
- Actual publishing success: no write has been made.
