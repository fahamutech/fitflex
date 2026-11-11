# Marathon module — Slice 6 as built (2026-10-30)

Runs, results, medals, rewards and organizer-uploaded medal artwork. Design: `docs/design/events-s6-runs-results-medals-rewards.md`. Contract: `docs/marathon/s6-contract.md` (in functions). Decisions D44 to D62 (D54: organizer art with built-in fallback). Everything is dormant. Merged into `release-candidate` only; nothing is on `main`.

## PRs (all into `release-candidate`)
| Repo | PR | Head | RC merge commit |
|---|---|---|---|
| fitflex-functions | #287 | bbe65fe | 4cf90b5 |
| fitflex-portal | #175 | d578e13 | e81b4cf |
| fitflex-mobile | #254 | 71f11d1 | 97529bc |

## What was built
**Functions**
- Results core: result revisions, stages and ranks; CSV import (preview/apply, replay); manual entry; verify/reject/bulk; provisional and official release, withdraw; corrections and disqualification; disputes; visibility and privacy masking; board; `/v1` results routes; four result webhook types; admin exceptions.
- Run links: `EventActivityLink` checks (window, distance tolerance, pace/gap/dropped-points/duplicate-route flags), evidence versus virtual pending result, `clientRef` replay and crash repair, unlink.
- Awards and rewards: medal templates, award engine (task queue, SKIP LOCKED), achievements, entitlement ledger (units, no points), claim/redeem/perk codes, admin desk, expiry and reconcile jobs, account-deletion path.
- Medal artwork: raw-body upload pipeline (SVG refused, type sniffed from bytes, 2 MB / 16 MP / 512-4000 px square, metadata stripped, WebP only), caps counted before the body is read, takedown with hash block, signed-in-only serving, moderation queue.

**Portal**
- Organizer Results tab (overview, CSV import, results table and drawer, disputes, medals, settings), release dialog with typed-number confirmation.
- Medal designs (8 built-in) and artwork upload/replace/remove with square crop, alt text EN/SW, faces/brands notice and required rights checkbox.
- Integrations: `results:read` / `results:write` scopes and `result.*` webhook types. Admin: `/admin/event-rewards` desk (definitions, redemptions, ledger, tasks, medal art queue) and a read-only Results block with correct/disqualify exceptions on the admin event view.
- 509 new i18n keys (EN + SW draft). The wizard is untouched.

**Mobile**
- My result, Runs (start a run for the event, add a recorded run), Board, Medals, Rewards wallet, My results; share card rendered on device (time off by default, name never on it); medal art fetched with the member's sign-in and falling back to the built-in design; push routing for eight member notice types; `RunRecorder` `bindEvent` + persisted `clientRef`.
- No new `dart-define`. Tests: `flutter analyze` clean, `flutter test` +3784 ~1 (author's run).

## Flags (all off)
`EVENTS_RESULTS`, `EVENTS_RUNS`, `EVENTS_RESULTS_PUBLIC`, `EVENTS_REWARDS`, `EVENTS_MEDAL_ART`. Each also needs `EVENTS_MODULE` + `EVENTS_REGISTRATION`. Chain: RUNS, PUBLIC and REWARDS need RESULTS; MEDAL_ART needs REWARDS. Clients read them from `GET /events/options` `results {enabled, runs, public, rewards, medalArt}`; an older server without the block changes nothing.

## Env (defaults apply when unset; list in `.env.example`; add to `docs/server-env-checklist.md`)
`EVENTS_RESULTS_CONSENT_VERSIONS` (new; consent-text versions that carry the public-results clause; unset means everyone starts bib-only), `EVENTS_RUN_DISTANCE_TOLERANCE_BPS`, `EVENTS_RUN_LINK_MAX_DAYS_AFTER`, `EVENTS_RESULTS_IMPORT_MAX_ROWS`, `EVENTS_RESULTS_DISPUTE_DEFAULT_HOURS`, `EVENTS_AWARD_BATCH`, `EVENTS_RESULTS_PUSH_MAX`, `EVENTS_MEDAL_ART_MAX_BYTES`, `EVENTS_MEDAL_ART_MAX_PIXELS`, `EVENTS_MEDAL_ART_UPLOADS_PER_DAY`.
Perk codes reuse `EVENT_TICKET_SECRET` through a derived key. **Note for `EVENT_TICKET_SECRET_PREVIOUS`:** if the ticket secret is ever rotated, keep the old value in `EVENT_TICKET_SECRET_PREVIOUS` for as long as issued perk codes can still be redeemed, otherwise unexpired perk codes stop verifying. Confirm the rotation path covers the derived perk-code key before rotating.

## Jobs
`event-awards-run` (every minute), `event-awards-reconcile` (every 10 minutes), `event-reward-expire` (daily 23:00 UTC = 02:00 EAT). In code: `eventAwardsRun`, `eventAwardsReconcile`, `eventRewardExpire`. All no-op unless `EVENTS_REWARDS`.

## Migrations
`20270131090000-events-results-s6`, `20270131090100-events-rewards-s6`, `20270131090200-events-medal-art-s6`; they sort after RC's previous newest (`20270130090000`). Additive; `down` fails closed once data exists. Dry run on a fresh database: 144 migrations up, up/down/up of the three verified.

## Deploy order
1. Functions, with migrations first, flags off.
2. Portal (flags off; nothing renders until the server reports them; the spec wants the portal live before `EVENTS_RESULTS`).
3. Mobile (flags off).
4. Switch flags on (owner decision each time, never in the deploy): `EVENTS_RESULTS`, then `EVENTS_RUNS`, then `EVENTS_REWARDS`, then `EVENTS_MEDAL_ART` (after the launch gates), and `EVENTS_RESULTS_PUBLIC` last and only after counsel text is final.

## Rule 6 areas (owner reviews, D35)
1. **API scopes** in `src/services/events-integrations-service.mjs`: `results:write` activated, `results:read` added. `src/auth/organizer-api-auth.mjs` is untouched. No API scope can verify, release, correct or disqualify (D46); API results are always `pending_verification`.
2. **Account deletion** (`src/services/account-service.mjs`, `functions/subscriptions.mjs`): organizer owners get `409 organizer_owner` (+ `messageSw`); ledger and redemption rows are anonymised by an `ON DELETE SET NULL` FK, not deleted.
3. **Ledger trigger** (migration `...090100`): the only allowed UPDATE of `RewardLedgerEntry` is `userId` to NULL with every other column unchanged (the trigger stamps `anonymisedAt`); DELETE/TRUNCATE remain forbidden. Spec-proven.
4. **Participant-removal trigger:** BEFORE UPDATE trigger clears `EventRegistration.claimedAt` when `participantUserId` is removed, fixing a latent S3 bug where `eventregistration_claimed_check` blocked deleting a member who had claimed a place. The check stays.
5. **Medal-art pipeline:** `src/infra/medal-art-file.mjs`, the upload route, serving authorisation, takedown. Security review before `EVENTS_MEDAL_ART`.
6. **Results authority:** who can verify, release, correct, disqualify; API cannot.
7. **Additive response fields** on `GET /events/options`, `GET /events/:id`, `GET /me/event-registrations[/:id]`, and the `DELETE /me` behaviour change (organizer_owner 409).
Not touched: payment code, payout engine, pricing constants, check-in, `src/auth/jwt.mjs`, `constants.mjs`, `events-authz.mjs`, `route-guard.mjs`, challenge rewards, `src/shared/media-src.mjs`, `/storage/upload`, `src/shared/events-document.mjs`.

## Launch gates
- **Faces in medal art:** policy decision needed before `EVENTS_MEDAL_ART`.
- **Counsel (Tanzania):** rights-confirmation text (`2026-10-29.s6draft1`), public-results consent clause and retention text are drafts pending counsel. They gate `EVENTS_RESULTS_PUBLIC` and `EVENTS_MEDAL_ART`.
- **Native Swahili review:** all S6 strings are drafts (portal `src/lib/i18n-events-s6.ts`, 509 keys; mobile `TODO(sw-review)`).
- **M6 reward-farming guard: OPEN owner decision.** Recommended: a per-event "rewards-eligible" flag so organizers cannot create events only to farm rewards.
- **Portal medal-art form and admin takedown** need the security/privacy review before `EVENTS_MEDAL_ART`.
- Legal text stays draft; trainer, vendor and organizer settlement not exercised; all flags still off.

## Known gaps / not verified
- No real device: Android GPS recording for an event, share sheet, push taps, mail app for "Report this image", live art fetch (bearer header, WebP decode).
- Raw-body art upload is untested through the real platform parser (BFast); it was tested through the spec harness only.
- 5,000-row import and a release to thousands of participants not load-tested.
- Postgres 15+ assumed (as in S3), unconfirmed on production.
- Not built in the portal: admin dispute list (no list route), per-category settings UI (time basis is event level), organizer takedown banner, recent-redemptions table, correction rank preview.
- API-submitted DNF/DNS stay `pending_verification` (D46). Walking events cannot link runs.
- The shared `fitflex_ci` database is dirty; use a fresh isolated database per run.
- Mobile contract assumptions (`GET /me/event-results` shape, refused-link status, reason codes, `organizerName`) and portal contract assumptions (time string format, query-string `confirmationVersion`, event-level settings) are listed in the portal and mobile PR bodies; run contract-checker before switching flags on.
- No native Swahili or counsel review of anything above.
