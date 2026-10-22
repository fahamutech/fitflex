# Marathon module — Slice 2 as built (2026-10-22)

Organizer capability, event management, admin moderation and member discovery. Everything dormant.

## PRs (all into `release-candidate`, not `main`)
| Repo | PR | Head | Tests |
|---|---|---|---|
| fitflex-functions | #249 `feat/events-s2-organizer-discovery-1022` | 025885a | full suite 2766/2766 on CI DB |
| fitflex-portal | #148 `feat/events-s2-organizer-1022` | see PR | tsc, build, events Playwright 45 + 4 (flag off) |
| fitflex-mobile | #222 `feat/events-s2-discovery-1022` | 9b3487a | analyze clean, full suite 2680 on first head; events 86 |
| fitflex (docs) | this PR | — | — |

## Flags (all off)
`EVENTS_MODULE` (server; gates every events route except `GET /events/options`), `EVENTS_FAVOURITES`, `EVENTS_REGISTRATION` (probe only, S3), `EVENTS_CLOSING_SOON_HOURS` (72), `EVENT_AUTO_COMPLETE_GRACE_HOURS` (6), `EVENTS_IMAGE_HOSTS` (defaults to hosts of `PUBLIC_API_URL` + `ZEBRA_BASE_URL`; relative `/storage/...` always allowed), portal `NEXT_PUBLIC_EVENTS_MODULE`, mobile dart-define `EVENTS_DISCOVERY`.

## Migrations
`20270110090700-events-organizer-identity.cjs` (User/OrgMembership/Invitation `organizerId`, widened CHECKs), `20270110090800-events-document-fields.cjs` (event document columns, `EventCategory.minAge`, `EventChangeLog.fields/note/actorRole`, `EventFavourite`, relaxed `event_cancelled_at_check`). Run before deploying functions.

## Rule 6 callouts (owner review)
- New user types `event_organizer`, `organizer_staff` (`src/auth/*`, `auth-service.mjs`, `portal-user-service.mjs`, `org-membership-service.mjs`, `invitation-service.mjs`, `account-recovery-service.mjs`); refused as self-registrations; organizer/role always resolved from `EventOrganizerStaff`, never from the JWT.
- `functions/partner-kyc.mjs` admits `event_organizer`; new partner type with optional `event_permit`; organizer status derived from the KYC case via a hook in `moveCase`.
- New portal ACL scope `events`.
- Invitation in-app notices for gym, vendor and organizer are now bilingual (previously English-only).
- `GET /events` shares the prefix with the pre-existing `POST /events` analytics route; guards are method-scoped and spec'd.
- No pricing, payout or check-in changes.

## Deploy order
functions (migrations first) → portal → mobile. No live risk while flags are off.

## Reviews
- Security (functions#249): verdict merge with fixes; M1 (invite-by-ID leak), M2 (URL/length validation), M3 (organizer recovery path) and L2–L5, L7, L8 fixed in the PR; L6, L9, L10 carried in `follow-ups.md`.
- Contract check: backend conformant; portal items 1–13 fixed in the PR; backend date-only `from`/`to` now mean whole EAT days.
- Swahili: both apps ok with native review pending; glossary violations fixed; status noun class unified on li- for a single event; weekday abbreviations withdrawn (full names); kit = "vifaa vya mbio" (needs native review).

## Known gaps
- Image derivatives are the storage service's own sizes (full ≤1280, thumb ≤320), not the spec's 1200×675 / 600×338.
- No `events` hero slot asset in mobile; falls back to the activity hero until the owner picks a photo.
- Android App Link for `/member/events/*` not added.
- Organizer partner terms do not exist; only the KYC consent (draft pending counsel).
- Not verified: portal/mobile against the live backend branch; SMS/email delivery of organizer staff invitations; real device items (images, share sheet, intents).

## Owner questions carried from the design spec
Home card shows the two soonest open events to everyone (kept); hero photo for the Events area; native Swahili review before UAT.
