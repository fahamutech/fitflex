# Marathon module — Slice 5 as built (2026-10-29)

Venue operations (ticket verify, kit handover, bibs, audited export), the organizer API with its own credential scheme, signed webhooks, and the payout schedule field (D33). Design: `docs/design/events-s5-venue-api-and-webhooks.md`. This slice adds API-credential authentication code (rule 6; owner reviews per D35). Everything dormant.

## PRs (all into `release-candidate`, not `main`)
| Repo | PR | Final head |
|---|---|---|
| fitflex-functions | #279 `feat/events-s5-venue-api-1029` | 79889ac |
| fitflex-portal | #167 | fe25f18 |
| fitflex-mobile | #249 | e60ad11 |
| fitflex (docs) | #94 | a47c33c |

## What was built
- **API client auth:** client credentials (`ffs_live_` / `ffs_test_` secret, sha256 stored) exchanged at `POST /v1/organizer/token` for a 15-minute bearer token. The guard re-reads the `ApiClient` row on every call (revoke/rotate/suspend effective immediately). Per-client rate limit, failures-only source limit, no lock-out; alert audit row after more than 20 failures in an hour.
- **Webhooks:** signed (HMAC) JSON, ids only, SSRF-hardened dispatcher (https/443, public DNS only, re-resolved per attempt, pinned socket, no redirects). Secrets AES-256-GCM encrypted with `EVENTS_WEBHOOK_SECRET_KEY`. Endpoint changes are owner-only (D38). Jobs: `event-webhook-fanout`, `event-webhook-deliver`, `event-webhook-retention`.
- **Kit ops:** verify, handover (Idempotency-Key), void/recollect corrections, bib assign/replace/release, bulk rule-based and CSV import (atomic), change feed (`seq` cursor), audited CSV export. Portal desk, bibs, export, integrations screens; mobile ticket kit state and scanner prefix guard.
- **Payout schedule:** `biweekly | monthly` per event (D33); required at submit; locked after submit (409 `payout_schedule_locked`); admin can change it.

## Flags (all off)
`EVENTS_KIT_OPS`, `EVENTS_ORGANIZER_API`, `EVENTS_WEBHOOKS`, each needing `EVENTS_MODULE` + `EVENTS_REGISTRATION`. Webhooks also need `EVENTS_WEBHOOK_SECRET_KEY` (32 bytes base64); missing means the feature stays off. The payout-schedule field ships with `EVENTS_MODULE`. Env list in `.env.example`; add to `docs/server-env-checklist.md`.

## Migrations
`20270126090000-events-ops-s5.cjs` and `20270126090100-events-integrations-s5.cjs`, sorting after `20270125090000-partner-media`. Additive; `down` fails closed once S5 data exists.

## Rule 6 callouts (from functions#279)
New: `src/auth/organizer-api-auth.mjs` (157 lines). Unauthenticated new endpoints: `POST /v1/organizer/token`, `GET /v1/organizer/openapi.json`. New outbound network code: `src/shared/webhook-url-guard.mjs`, `src/services/events-webhook-service.mjs`.
Existing files touched: `src/services/events-discovery-service.mjs`, `events-payment-service.mjs`, `events-organizer-service.mjs`, `events-registration-service.mjs` (claim now writes the claim and a `registration.updated` outbox row in one transaction), `events-admin-service.mjs`, `src/infra/event-store-pg.mjs`, `src/infra/event-money-store-pg.mjs` (`cancelPaidPlaces` releases the live bib in the same transaction; no money logic changed), `src/shared/events-document.mjs`, `feature-flags.mjs`, `events-config.mjs`, `src/bootstrap/services.mjs`, `functions/jobs.mjs`. Submit now returns 422 `payoutSchedule required`.
Untouched: `src/auth/jwt.mjs`, `events-authz.mjs`, `org-authz.mjs`, `qr-token.mjs`, `route-guard.mjs`, `functions/checkins.mjs`, `constants.mjs`, payout engine, check-in, refund service.

## Deploy order and gotchas
1. **Portal wizard before functions.** Once `EVENTS_MODULE` is on, submit requires `payoutSchedule`; an old portal wizard cannot submit.
2. **`OutboxEvent.seq` is an identity column added to an existing table, which rewrites the table on deploy.** Run during a quiet period; dry-run on the CI database first.
3. Then: migrations, functions, mobile, flags last.

## Launch gates (D43)
- `EVENTS_WEBHOOKS`: M4 (transactional `event.updated`/`event.cancelled` outbox) is resolved in code and no longer a gate. Still open: production Node supports the pinned lookup with SNI; `docs/api` ships in the deploy; forwarded-IP behaviour confirmed; `EVENTS_WEBHOOK_SECRET_KEY` set.
- `EVENTS_KIT_OPS`: privacy/retention rule and consent-text update.
- `EVENTS_ORGANIZER_API`: owner review of `src/auth/organizer-api-auth.mjs` (D35); platform logging of `/token` bodies checked (L5).

## Known gaps
- Tokens are signed with the shared `JWT_SECRET`; rate windows are per server in memory; `X-Forwarded-For` behaviour unverified.
- Follow-ups L2, L7, L8 carried (see `follow-ups.md`).
- Legal and consent text draft pending Tanzanian counsel; Swahili needs native review.
- Organizer settlement statements still not built; vendor/trainer settlement not exercised against real accounts.
