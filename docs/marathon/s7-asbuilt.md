# Marathon module — Slice 7 as built (2026-11-02)

Hardening and pilot readiness: offline kit desk, waitlist, analytics and health, retention, admin incident controls, unpaid-place cap, the `rewardsEligible` gate and a rewritten consent draft. Design: `docs/design/events-s7-hardening-and-pilot.md`. Contract: `docs/marathon/s7-contract.md` (in functions). Decisions D63 to D85 (all recommended defaults accepted 2026-11-02, except D66 changed). Everything new is dormant behind flags. Merged into `release-candidate` only; nothing is on `main`.

## PRs (all into `release-candidate`)
| Repo | PR | Head | RC merge commit |
|---|---|---|---|
| fitflex-functions | #306 | 7c4a0ec | 92f47bc (RC head dad3704 after functions#305 merged on top) |
| fitflex-portal | #182 | 952814d | 5ae11c1 |
| fitflexmobile | #266 | 9573ca2 | 2f6dbbd |
| parent (design + D63-D85) | fitflex#105 | | 770df2c |
| parent (submodule re-point) | fitflex#110 | | eca143d |

The portal PR #182 body is a copy of the backend PR body (it describes the backend slice); this document and the portal diff are the accurate record of the portal slice.

## What was built
**Functions**
- Offline kit desk (`EVENTS_KIT_OFFLINE`, needs `EVENTS_KIT_OPS`): a desk is a registry row, not a credential (every call uses the staff member's own sign-in; only the staff user who prepared a desk can download its list, heartbeat or sync for it). Routes under `/organizer/events/:id/kit-offline`: `devices` (create, list, revoke), `snapshot` (paged, signed cursor, delta by `sinceSeq`), `heartbeat`, `sync` (up to 200 items, exactly-once per `(deviceId, clientRef)`), `review` and `review/:scanId/check`; admin list and revoke under `/admin/events/:id/kit-offline`. `GET /organizer/events/:id/kit/summary` gains `offline` while the flag is on.
- Offline ticket check (D64): the desk looks up SHA-256 of the scanned token in a server-provided list; no secret or MAC on any device; the server re-verifies HMAC, ticket, registration, event, organizer, desk and one-kit-per-registration at sync. Outcomes: accepted, duplicate, revoked_after_scan, event_closed, after_revoke, after_expiry, organizer_suspended, invalid_token, unknown_ticket, wrong_event, validation_failed, deferred. Revoked and expired desks may still send; the server judges by its receipt time and everything goes to a person.
- Offline bib recording (D66, changed): the number read off the physical bib is a claim applied after the handover committed, inside a SAVEPOINT, by `assignOfflineBibTx` (never `assignBibTx`, never replaces or releases a bib). Each desk may carry an immutable, non-overlapping bib block set at creation (`bibRange`, owner/admin only; limit 5,000 numbers). Outcomes `assigned`, `same_already`, `not_applied`, `format_invalid`, `out_of_range`, `no_range`, `taken`, `registration_has_other`; anything but the first two puts the scan into review as a bib exception and the kit handover stands (no auto-void).
- Waitlist (`EVENTS_WAITLIST`): self only, one place, verified member (D70); strict first-in-first-out per ticket type; an offer is a normal `awaiting_payment` order made by a system actor (`placeSystemOrder`) from stored details (D71); queue gate `409 waitlist_active` and the ticket type reads sold out while a queue exists; offer window clamp(close/4, 2 h, 12 h), none in the last 2 h before close, none 21:00 to 07:00 event time (D72); limits 5 live entries per member, 500 per ticket type, 10 joins an hour, 2 lapses (D74); push and in-app only (D76). Organizer sees counts only and can stop sign-ups or close (D75). Admin can list (masked names) and remove with a reason.
- Analytics and health (`EVENTS_ANALYTICS`): `POST /events/analytics` (member JWT, closed allowlist, aggregate daily counters, no user/session/device ids, 202 accepted/dropped); `GET /admin/events/health` (days 1/7/30, optional `eventId`); alert rules A1 to A13 emailed by `event-health-alert` to `OPS_ALERT_EMAILS` (unset means shown on the Health tab only).
- Hardening H1 to H17 (ride on the flag of the feature each fixes, no new flag): H1 webhook per-host batch cap and lease release; H2 a failing card read, notice or analytics after commit cannot fail a kit or bib request; H3 outbox purge of rows older than 90 days; H4 owner webhook redelivery; H5 unpaid-places cap; H6 admin `rewards-eligible` switch; H7 hourly organizer-status sweep; H8 timezone validated against `GET /events/options.timezones`; H9 team join code shares the lookup limiter; H10 admin dispute list; H11 admin reward redemptions list (never a code, hash or user id); H12 correction rank preview (nothing stored); H13 medal template art status; H14 `payments.blockedReason` in options; H15 event jobs hidden while `EVENTS_MODULE` is off; H16 admin pause/resume of registrations (D85, reason, organizer notified, audited); H17 organizer search with API access state.
- Retention (D79): `event-registration-anonymise` ships unset; with `EVENTS_RETENTION_MONTHS` and `EVENTS_DELETED_USER_ANONYMISE_DAYS` both unset it does nothing and writes nothing. When set it clears phone, email, date of birth, gender, emergency contact and claim token data once per registration (`anonymisedAt`) and keeps names, bib, kit and results.
- `GET /events/options` is additive: `analytics`, `waitlist`, `ops.kitOffline`, `payments.blockedReason`. Results summary gains `rules` (resolved) and `rulesOverride` (saved; null means unset).

**Portal**
- Organizer offline kit desk at `/organizer/kit-desk?event=<id>`: prepare a desk (with optional bib block), download the list, scan or type, record the bib read from the physical bib, queue, send, review and check, devices panel. Ticket list and unsent scans are stored in IndexedDB encrypted with AES-GCM under a non-extractable key (`desk-store.ts`); wiped on sign-out. A service worker `public/organizer/kit-desk/sw.js` (scope `/organizer/kit-desk/` only, `firebase.json` headers `Cache-Control: no-cache` and `Service-Worker-Allowed`) opens the page with no network and caches no API data. `DESK_BUILD` is `'1'` (`desk-logic.ts`).
- Organizer waitlist card (counts, stop sign-ups, close).
- FitFlex admin events page gains tabs Health, Operations (incident controls: API access, revoke-all, disable-all, registration pause/resume, rewards switch; D84), Disputes; admin event view gains a waitlist block and controls; recent redemptions table; organizer results gain Per race settings and the correction rank preview.
- 797-line `src/lib/i18n-events-s7.ts` (EN + SW draft).

**Mobile**
- Waitlist: Join waitlist on a sold-out ticket, join page (`mode=waitlist`), My waitlist tab and `/member/events/waitlist` with position, offer countdown driven by the server clock, Pay now, Leave, Review terms; "From the waitlist" chip on the order page; push links for offer, reminder, joined, expired, closed, removed and deferred.
- Analytics: `EventsAnalyticsTransport` (allowlist, buckets, in-memory only, flush every 30 s / 10 events / on pause, never persisted); new events `waitlist_cta_viewed`, `waitlist_join_started`, `waitlist_offer_opened`, `run_started`; payment/ticket steps now carry the event id.
- Glossary fixes: `error.offlineTitle` sw "Hakuna intaneti"; `events.cta.soldOutHint` no longer uses "nafasi" for places. Privacy page note. No payment or check-in code touched; `api_client.dart` gains 5 endpoint methods. No new `dart-define`.

## Flags (all off)
`EVENTS_KIT_OFFLINE` (also needs `EVENTS_KIT_OPS`), `EVENTS_WAITLIST`, `EVENTS_ANALYTICS`. Each also needs `EVENTS_MODULE` + `EVENTS_REGISTRATION`. A route behind an off flag answers `404 { error: "feature_disabled" }`. `ops.kitOffline` in options is true only when the flag is on and the ticket secret is usable. Old servers without the new options blocks change nothing in the apps.

## Env (all optional; add to `docs/server-env-checklist.md`)
- Offline: `EVENTS_OFFLINE_SESSION_HOURS` 36, `_MAX_DEVICES` 10, `_MAX_PER_USER` 2, `_MAX_ROWS` 20000, `_SYNC_BATCH` 200, `_MAX_PENDING` 2000, `_CLOCK_TOLERANCE_SECONDS` 300, `_MIN_DESK_BUILD` unset, `_SCAN_KEEP_DAYS` 180, `_MAX_BIB_RANGE` 5000.
- Waitlist: `EVENTS_WAITLIST_OFFER_HOURS` 12, `_MIN_OFFER_MINUTES` 120, `_MAX_ACTIVE_PER_USER` 5, `_MAX_QUEUE` 500, `_MAX_LAPSES` 2, `_QUIET_HOURS` `21-7` (`off` disables), `_KEEP_DAYS` 90.
- Other: `EVENTS_ANALYTICS_KEEP_DAYS` 730, `EVENTS_ALERT_RULES` (JSON overrides), `OPS_ALERT_EMAILS` (existing), `EVENTS_WEBHOOK_PER_HOST_BATCH` 5, `EVENTS_MAX_UNPAID_PLACES_PER_USER` 4, `EVENTS_RETENTION_MONTHS` unset, `EVENTS_DELETED_USER_ANONYMISE_DAYS` unset, `EVENTS_CONSENT_TEXT_VERSION` (default now `2026-11-draft`).
- **`EVENTS_RESULTS_CONSENT_VERSIONS` must list `2026-11-draft`** (and keep `2026-10-draft` if people who consented under it should keep the public-results clause), or those registrations start bib-only.
- **`DESK_BUILD` versus `EVENTS_OFFLINE_MIN_DESK_BUILD`:** the portal sends `deskBuild` `1`. If `EVENTS_OFFLINE_MIN_DESK_BUILD` is ever set above the shipped build, every desk gets `426 desk_update_required`. Leave it unset until a newer desk build is deployed; raise it only after.

## Jobs
`event-analytics-rollup` (hourly), `event-health-alert` (every 15 minutes), `event-kit-offline-purge` (daily 23:30 UTC), `event-waitlist-promote` (every minute), `event-waitlist-purge` (daily 23:15 UTC), `event-organizer-status-sweep` (hourly), `event-registration-anonymise` (daily 01:10 UTC). Quiet jobs, stamped by a `JobControl.lastOkAt` heartbeat so alert A5 can tell idle from dead. Event jobs are hidden from the admin job list while `EVENTS_MODULE` is off.

## Migrations
`20270202090000-events-analytics-s7`, `20270202090100-events-kit-offline-s7`, `20270202090200-events-waitlist-s7`, `20270202090300-events-hardening-s7`. Additive; `down` fails closed once S7 data exists. Reported dry run on a fresh database done; take a backup before production.
- **Same-prefix collision with functions#305:** `20270202090000-audit-log-append-only` and `20270202090100-audit-log-indexes` share the first two timestamps. Filenames differ so they sort deterministically, but confirm they apply in order on a fresh database and on a copy of production before deploy.
- **`outboxevent_created_idx` is built without `CONCURRENTLY`** (`CREATE INDEX IF NOT EXISTS ... ON "OutboxEvent" ("createdAt")`), which blocks writes to `OutboxEvent` while it builds. Run in a quiet window or check the table size first.

## Behaviour that is live on deploy regardless of flags
- **Unpaid-place cap (H5):** the first concurrent unpaid order can hold up to the per-order maximum (10); each further concurrent unpaid order must fit, with what the member already holds unpaid, under `EVENTS_MAX_UNPAID_PLACES_PER_USER` (default 4); organisation orders exempt; `409 unpaid_places_limit`.
- **Consent default** is `2026-11-draft`: an old app build sending `2026-10-draft` gets `409 consent_version_stale { current }` on order create.
- **`rewardsEligible` defaults false:** rewards are earned only for events a FitFlex admin has switched on; medals are unaffected. Events that were creating rewards before now earn none until switched (the S6 test fixture marks its events eligible).
- **Outbox purge:** rows older than 90 days are deleted whether published or not.
- **Hourly `event-organizer-status-sweep`** runs while `EVENTS_MODULE` is on and writes `events.organizer_status_corrected` audit rows for corrections.
- Other H-fixes (H2, H8, H9, H10 to H13, H15) also apply without a new flag; H1 and H4 follow the webhook flags.

## Decisions applied
D63 web desk in the portal; D64 SHA-256 lookup, no secret on devices; D65 first processed wins, later duplicates kept for a human; D66 changed (offline bib recording, per-desk blocks, savepoint writer, conflict becomes an exception, no auto-void); D67 offline manual handover with reason and ID tick; D68 list valid 36 h, 10 desks per event, 2 per staff user, 2,000 unsent scans per desk, clock tolerance 5 minutes; D69 unknown ticket refused offline; D70 to D76 waitlist; D77 and D78 analytics and alerts; D79 retention unset and consent bump; D80 `rewardsEligible`; D81 pilot structure (Stage A rehearsal on RC, Stage B at most 150 places with one friendly organizer, after promotion and the owner's go-ahead); **D82 organizer payout during the pilot is a manual two-person payout per Runbook R2 with a signed sheet, no system record (process, no code)**; D83 no offline scanning for API clients; D84 admin incident controls with reason and typed confirmation; D85 admin pause of registrations.

## Review outcomes and fixes
**Security round (functions, three fix commits 9c420b2, 5edc47a, 7c4a0ec)**
- M1 snapshot cursor HMAC-signed (key derived from the ticket secret), bounded to the desk's life, invalid is `400 invalid_cursor`, every page audited by desk.
- M2 `after_revoke` and new `after_expiry` judged by server receipt time; clock floor is the desk's issue time.
- M3 the member's own limits defer a waitlist entry (it stays waiting, not counted toward the three skips, one notice `event_waitlist_deferred`).
- M4 only terminal reasons end waitlist entries; an admin pause or a ticket type or category switched off only stops promotion.
- M5 consent draft states that an organizer system with demographic API access may receive gender and age on the event day, and that a waitlist entry keeps its details until 24 hours after it ends.
- Lows fixed: per-member advisory lock on waitlist join; bib range clamped to 5,000; per-desk stored-scan cap (`409 device_scan_limit`); suspended organizer cannot download a list; redeliver counts against its limit before work.

**Contract (coordinator list, backend fix 7c4a0ec)** waitlist list items gained `ticketTypeId, priceTzs, currency, utcOffsetMinutes, timezoneAbbr`; `cancel_preview_viewed` and `cancel_confirmed` need no event id; admin dispute next-page cursor fixed (it used a field that did not exist); ops can remove the desk they created; contract updated (schedule is an object, alert severities high/medium/low, full `waitlist_unavailable.reason` list, `{field,code}` versus `{path,code}`, Idempotency-Key not honoured on waitlist join/leave/reconfirm with the 409 retry behaviour). Portal then aligned to the real backend shapes (commits e4dee1d, 5aa0bce); mobile fixed raw analytics counts, waitlist idempotency and error codes, cancel analytics scope, and the `event_waitlist_deferred` deep link (c18a7e6, 9573ca2).

**Swahili review.** Fixes visible in git: functions N12 consent wording and "ifikapo {time}" in the reminder; portal N7 `countsNote` and N10 `already_ended`; mobile M8, N1, N3, N13. I did not find the written Swahili review notes (M1 to M9) in any repo, so I cannot confirm each of M1 to M9 individually; only the commits above are verified. All Swahili remains a draft.

## Tests (as reported at hand-off; I did not re-run them)
- Functions: 3708 of 3708 pass (full `npm test` on a fresh isolated database). The functions#306 PR body recorded 3661 of 3661 before the fix rounds.
- Portal: events e2e 376 of 376, flag-off suite 10 of 10.
- Mobile: 4055 pass, 1 skipped.
- Pre-existing mobile 53 px overflow remains (not introduced by S7).

## Rule 6 areas (owner reviews, D35)
1. **Event-day entry logic:** second writer of `EventKitCollection` (method `offline`) and of `EventBibAssignment` (`assignOfflineBibTx`, savepoint, `sourceScanId`); `src/services/events-kit-offline-service.mjs`, `functions/events-kit-offline.mjs`, migration `...090100`.
2. **Credential-adjacent data on devices:** ticket-token SHA-256 hashes, masked names and bibs in the snapshot; server re-verifies every item and never trusts a device verdict or clock.
3. **Order creation by a system actor:** `placeSystemOrder`, `validateWaitlistJoin`, the queue gate inside the creation transaction, and the unpaid-places cap in `events-registration-service.mjs`; also `events-document.mjs`, `event-catalogue-store-pg.mjs`, `events-discovery-service.mjs`.
4. **Payment hold for waitlist orders:** unchanged (D26 applies, D73).
5. **Analytics ingestion:** `POST /events/analytics` accepts client-supplied data into aggregate counters.
6. **Retention:** `event-registration-anonymise` rewrites personal data (unset by default).
7. **Rewards:** `events-award-service.mjs` earns only when `rewardsEligible`.
8. **Outbound network and outbox:** webhook per-host cap, redelivery, outbox purge (`events-webhook-service.mjs`).
9. **Admin incident powers:** registration pause/resume, rewards switch, organizer search, Operations tab.
Not touched (per the PR): `src/auth/*`, `constants.mjs`, payout engine, pricing constants, gym check-in, `payment-product.mjs`, `events-payment-service.mjs`, `event-money-store-pg.mjs`, `event-store-pg.mjs`, refund and mobile-money services. Endpoint changes are additive (new routes, optional fields, new error codes).

## Deploy order
1. Functions, with migrations first, flags off. Back up the database; check the `OutboxEvent` index build and the same-prefix migration order (see Migrations).
2. Portal (flags off; the new tabs and the desk read availability from the server's options).
3. Mobile (flags off).
4. Parent submodule re-point PR.
5. Flags on are owner decisions, never part of a deploy. Consent text must be rewritten and its version bumped (done in code as a draft, counsel pending) before `EVENTS_KIT_OPS` or `EVENTS_KIT_OFFLINE` go on in production (D79).

## Launch gates
- **H5 cap interpretation: pending owner confirmation.** Built as "first order up to 10, further concurrent orders under 4". If the cap should apply to every order, group orders of 5 to 10 places would be blocked; say which.
- **Counsel (Tanzania):** consent text `2026-11-draft`, retention months, and the waitlist and demographic-sharing statements are drafts; counsel and owner set the retention months before `EVENTS_RETENTION_MONTHS` is set.
- **Native Swahili review** of all S7 strings (portal `src/lib/i18n-events-s7.ts`, mobile `TODO(sw-review)`, server inline `{en, sw}`).
- `EVENTS_RESULTS_CONSENT_VERSIONS` includes `2026-11-draft`; `OPS_ALERT_EMAILS` set if alerts should be emailed.
- Pilot per D81: Stage A rehearsal on RC with seed data; Stage B only after promotion and the owner's explicit go-ahead. Payout during the pilot follows Runbook R2 (D82).
- Legal text stays draft; trainer, vendor and organizer settlement not exercised; all flags still off.

## Not built
- Native staff scanner app (D63); offline scanning for API clients (D83); organizer-facing analytics (D77); organizer waitlist names, reordering or manual promotion (D75); SMS waitlist offers (D76); system record of organizer payout (D82).
- Counters `medal_awarded`, `reward_earned`, `reward_redeemed`, `reward_duplicate_blocked`, `run_saved` are allowlisted but not emitted (the emit points are S6 award and run code).
- A 15-minute window for alert A10 (it uses the daily `api_error` counter); whole-response replay for `/sync` (exactly-once is per item); a grace window after a desk expires.

## Known gaps / not verified
- No real device: camera/QR scanning on the desk, service worker and IndexedDB behaviour on real phones and browsers, real push for waitlist offers, mobile waitlist on a handset. Not tested through the real BFast platform parser; spec harness only.
- No load tests (5,000-row desk lists, sync batches, bib blocks of 5,000).
- Rate limits are per server instance (join, sync, heartbeat, snapshot, analytics); with N instances the real allowance can be N times higher.
- Production Postgres 15 or later is still unconfirmed (S3 `ON DELETE SET NULL` column list); CI runs 16.
- The ops alert email text is English-only.
- Open Lows in `docs/marathon/follow-ups.md` (functions): review list cursor unsigned; waitlist `contactKey` falls back to user id; up to 200 pushes per sync batch; admin pause does not stop `event-lifecycle` moving to `in_progress`; offline scan rows are only removed by the 180-day purge; retention covers registration rows only.
- Counsel and native Swahili review of everything above are outstanding; all flags remain off.
- Not verified by the author of this document: the test counts above, the PR review notes beyond what is in git and PR bodies, and anything on `main` or production.
