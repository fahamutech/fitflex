# Events S7: hardening and pilot (offline kit scanning, waitlist, analytics, go-live gates, runbooks, pilot). Design spec

**Status:** Draft for owner review · **Date:** 2026-10-30 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 7 of `docs/marathon/reuse-map.md` §9 (PRD §16 Phase 7)
**Repos:** `fitflex-functions` (offline kit sync, waitlist, analytics, hardening fixes; §3 to §6), `fitflex-portal` (offline kit desk, waitlist counts, admin health and incident controls, results follow-ups; §3.14, §4.10, §5.5, §6.3, §6.4), `fitflexmobile` (waitlist, analytics wiring, offline ticket checks; §4.10, §5.4)
**Ships:** dormant behind three new server flags: `EVENTS_KIT_OFFLINE` (needs `EVENTS_KIT_OPS`), `EVENTS_WAITLIST`, `EVENTS_ANALYTICS` (each also needs `EVENTS_MODULE` and `EVENTS_REGISTRATION`). The hardening fixes in §6 ride on the flags of the feature they fix (no new flag). With all three flags off, S6 behaviour is unchanged. See §7.1.
**Binding inputs:** `docs/marathon/decisions.md` D1 to D62 (D5 error envelope, D7 offline scanning deferred to S7 "behind its own flag", D16 hold length, D20 duplicate policy, D26 hold while a manual payment waits, D29 to D32 refunds and fail-closed manual payments, D33 payout schedule, D35 owner reviews rule 6 areas, D36 and D37 no contact data or emergency contact to organizers, D38 and D42 webhook management owner only, D39 API pilot allowlist, D40 bib unique across the event, D43 launch gates, D46 results authority, D47 medals at official release, D48 public results consent, D54 medal art, D56 notification classes, D59 dispute authority); PRD §5.4 REG-014 and REG-015, §5.5 KIT-001 to KIT-010, §10, §11, §13 (scenarios 5, 11, 12), §14 (analytics and launch dashboard), §15 (launch gates), §16 Phase 7, §17 item 9; `docs/marathon/reuse-map.md` §3 G6, §4 R9 and §9; `docs/marathon/follow-ups.md` (all sections); `s4-asbuilt.md`, `s5-asbuilt.md`, `s6-asbuilt.md`; design specs S2 to S6 (format template: S5 and S6).

**Rule 6 and the owner.** CLAUDE.md rule 6 applies and §9 lists every file. In short: this slice does **not** touch `src/auth/*`, the payout engine, pricing constants, gym check-in or `payment-product.mjs`. It does: (a) add a second way an event kit handover is written (offline sync) next to the S5 one (event-day entry logic, closest analogue to check-in logic); (b) put credential-adjacent data (ticket-token hashes) on staff devices; (c) reuse the order-creation primitive from a system actor for the waitlist (inventory and money adjacent; the primitive itself is not modified); (d) add an authenticated endpoint that accepts client-reported analytics; (e) add a retention and anonymisation job over registration personal data (shipped unset); (f) add a reward-eligibility switch to the award engine; (g) change existing S5 integration code (webhook delivery caps, redelivery, outbox purge, idempotency after-commit). Per D35 the owner reviews §3 (offline trust model), §4.5 to §4.6 (waitlist and payment interplay), §5.2 (analytics privacy) and §6.2 (retention) personally before anything reaches `main`.

**Not in scope:** a native staff scanner in the mobile app (stays deferred, D63); offline scanning for API clients; waitlist for groups, teams, guests or corporate orders (D70); SMS offers (D76); organizer-facing analytics (D77); organizer settlement statements and any payment-provider work (D34, still not built, §19); numeric conversion or SLO targets (PRD §14 says set them from pilot evidence, so this spec proposes none); timing hardware; checkpoints and waves (KIT-009, P1); age-group rankings (D61).

Sources read (RC heads of 2026-10-30, read-only via `git show` and `git grep`, no branch switched in the shared checkouts: functions `9551760`, portal `e81b4cf`, mobile `97529bc`): functions `src/services/events-ops-service.mjs` (kit collect, verify, `idempotent`, `assignBibTx`, notices, `analytics`), `src/shared/events-ticket-token.mjs`, `events-ops-rules.mjs`, `events-kit-view.mjs`, `events-lifecycle.mjs`, `events-document.mjs` (availability), `events-config.mjs`, `feature-flags.mjs`, `webhook-events.mjs`, `events-rate-limits.mjs`, `src/infra/event-store-pg.mjs` (`createOrderWithHolds`, `expireHolds`, release primitives), `event-money-store-pg.mjs` (`cancelPaidPlaces`, rehold, `extendHold`), `src/services/events-sync-service.mjs`, `functions/events-ops.mjs`, `events-admin-s5.mjs`, `events-admin.mjs`, `events-results.mjs`, `events-rewards.mjs`, `events-admin-rewards.mjs`, `functions/jobs.mjs`, `src/bootstrap/services.mjs` (job list), migrations `20270110090200`, `…090400`, `20270126090000`; portal `next.config.mjs`, `firebase.json`, `src/components/organizer/event-views.tsx`, `app/admin/events/page.tsx`, `package.json`; mobile `lib/shared/events/events_analytics.dart`, `events_cache.dart`, `event_ticket.dart`, `member_event_detail_page.dart` (CTA bar), `member_event_ticket_page.dart`, `i18n.dart` (`events.offline.*`, `events.cta.*`, `events.ticket.kit.*`); `docs/localization/fitflex-terminology-glossary.md`.

Conventions: **EN** English copy, **SW** Swahili draft (every Swahili string needs native review; Swahili runs 20 to 30 % longer, so no layout may depend on English widths). Glossary rules followed: "app" never "programu"; kit is "vifaa vya mbio"; offline is "Hakuna intaneti"; money is "TSh"; "nafasi" is reserved for roles so a place or slot is never "nafasi" (a bought place is "tiketi", held is "imeshikiliwa", D22); "aina" means category; "gym" never "jimu"; "namba" never "nambari"; failures are "Imeshindikana" never "Imeshindwa"; "kutuma" is the sync verb (glossary row "Sync (offline sales)"). "Backend field" lines list data the UI needs so `fitflex-planner` and `contract-checker` can confirm them; every field marked **NEW** does not exist today and is introduced by this slice; nothing else is claimed to exist unless the text says "exists" with its source.

---

## 1. What exists today, what this reuses, what is new

| Need | Exists (evidence) | Reuse / gap |
|---|---|---|
| Ticket token | Derived `ev1.<keyId>.<ticketId>.<version>.<mac>`; QR payload `FFEV1:` + token; `sha256(token)` stored in `EventTicket.tokenHash` (unique); MAC is HMAC-SHA256 under `EVENT_TICKET_SECRET` (`events-ticket-token.mjs`) | Offline cannot verify the MAC (the secret must never leave the server). Offline verification is a **hash lookup in a downloaded list**, the MAC is re-verified at sync (§3.9). No token code changes. |
| Online kit handover | `collectKit`: resolve payload, row lock, partial unique `collected` per registration (constraint name matches `/collected_unique/`), `EventKitCollection` with `method scan\|manual\|api`, notice, outbox `kit.collected`, `idempotent()` over `OrganizerIdempotency` | Offline sync reuses the same unique index as the arbiter and the same audit, outbox and notice code paths. `EventKitCollection.offlineBatchId` exists and is unused (migration comment "D7 deferred"). `method` CHECK gains `offline`. |
| Idempotency | `idempotent({actor, route, key, body})` for staff and API writes; `assignBibBatch` already returns per-item `clientRef` results | Pattern reused for the sync endpoint (per-item `clientRef`). |
| Change feed | `OutboxEvent.seq` identity cursor; `events-sync-service.mjs` roster and feed | Snapshot and delta carry a `seq` high-water mark so a device knows which changes it has seen. |
| Portal scanner | `QrScanner` component extracted in S5 (jsQR, `getUserMedia`); kit desk page `view=kit` with online-only flow and an explicit "Offline scanning is not available yet" banner (S5 §8.3) | The offline desk is a **separate route** so the existing desk keeps working untouched (§3.14). The S5 offline banner copy is replaced only when `ops.kitOffline` is true. |
| Mobile ticket offline | `EventTicketCache` stores the last good ticket (QR payload included) in `SharedPreferences`; ticket page shows "Showing a saved copy from {time}" offline | Participant side of offline already works; S7 adds tests only (§5.4). |
| Capacity | `EventTicketType.capacity/sold/held`; CHECK `sold + held <= capacity`; `createOrderWithHolds` conditional UPDATE under `FOR UPDATE`, accepts `holdTtlMinutes`, `afterCreate(trx, order)`, `orderExtra`; hold expiry job every 5 minutes; `EventInventoryMovement` ledger needs an `orderId` on every row | An offer cannot move `held` without an order. **Design consequence: a waitlist offer is a real order created by a system actor** (§4.3); the inventory primitives are not modified. Category `capacity` is shown to members but is not used by the ticket-type conditional update (**confirmation 4**). |
| Availability | `ticketAvailability`/`availabilityOf` compute `sold_out` from `sold + held >= capacity`; mobile CTA bar shows "Sold out" with `events.cta.soldOutHint` | Waitlist replaces the sold-out hint with a button when the server says a waitlist is open. |
| Analytics | Server: `analytics.<name>` rows in `AuditLog` (ids and counts only) from S3 to S6; Mobile: `EventsAnalytics` named no-ops with a `debugSink`, "S7 connects them" | One new aggregate-counter pipeline (§5). Existing audit rows stay and are read by the roll-up. |
| Jobs and alerts | `JobRun` + advisory lock + `runJob(name)`; event jobs `event-hold-expiry` (5 min), `event-lifecycle`, `event-payment-reconciliation`, webhook and award jobs; ops alert emails to `OPS_ALERT_EMAILS` (`b2b-watch-service.mjs`) | New jobs follow the same registration; alerts reuse `OPS_ALERT_EMAILS`. |
| Admin incident controls | Routes exist (S5): `GET /admin/events/:id/integrations`, `POST /admin/events/organizers/:organizerId/api-access`, `…/api-clients/revoke-all`, `…/webhook-endpoints/disable-all`, `PATCH /admin/events/api-clients/:id` | No portal UI yet (S5 follow-up). S7 builds the UI (§6.3). |
| Results gaps | `PATCH results-settings` already accepts `categories: [{ id, timeBasis, cutoffMinutes, virtualDistanceToleranceBps }]` (events-results.mjs); organizer `GET results/disputes` exists; admin can resolve a dispute by id but cannot list | S6 follow-ups the portal and one admin list route close (§6.4). |
| Offline precedent | None in mobile or portal for queued writes (S6 reuse-map R9: "no precedent"); portal has no service worker; `firebase.json` rewrites `**` to `/index.html`; glossary has "Sync (offline sales)" | The offline desk is new infrastructure; it is built as a self-contained route (§3.14). |

**New components (with reason):**
1. Backend `events-kit-offline-service.mjs` (device registry, snapshot, sync, review). Needs a service of its own: its trust model differs from the online path and must be reviewable in one file.
2. Backend `events-waitlist-service.mjs` and job `event-waitlist-promote`. No waitlist code exists anywhere (searched `src`, `functions`, `db`, `docs` on RC).
3. Backend `events-analytics-service.mjs` (allowlist, counters, roll-up, health read, alert rules).
4. Portal route `app/organizer/kit-desk/page.tsx` + `src/components/organizer/kit-desk-offline/*` + `public/organizer/kit-desk/sw.js`: no service worker or IndexedDB code exists in the portal.
5. Portal `src/components/admin-events-health.tsx` and `admin-events-ops.tsx`: no operations screen exists for events (B2B has `app/admin/b2b-ops/page.tsx` as a pattern to follow).
6. Mobile `lib/shared/events/waitlist.dart` (model + loader) and `lib/screens/member/events/waitlist/*`; `EventsAnalytics` gets a transport (the file already fixes names and payloads).

---

## 2. Personas and permissions

| Actor | Offline desk (prepare, scan, send) | Offline review and device list | Waitlist | Health, incidents (admin Operations tab) |
|---|---|---|---|---|
| Organizer owner / admin | prepare, scan, send; remove any desk | review list (acknowledge); device list (all) | toggle new joins, close with notice, read counts | none |
| Organizer ops | prepare own desk (max 2), scan, send | sees **own** desks and the outcomes returned to their own desk; no review list, cannot mark as checked | read counts | none |
| Organizer timing / finance | none (route shows `Forbidden`) | none | finance reads counts only | none |
| FitFlex admin, scope `events` | read-only history; can remove a desk | read-only review list | read masked list, remove an entry with a reason | all (health, incident controls, results exceptions) |
| FitFlex admin, scope `payments` | none | none | none | health payment cards only (read) |
| Member | none | none | join, leave, see own position and offer | none |
| API client | none in S7 (D83) | none | none | none |

Role names are checked in the service as well as the guard (as S5). A suspended organizer: the desk can still **send** already-saved scans (so data already collected is not stranded) but cannot prepare a new desk or scan new tickets; every sent item from a suspended organizer lands in review (`organizer_suspended`), never auto-collected.

---

## 3. A. Offline kit scanning, provisional until sent (KIT-005, D7, G6, R9)

### 3.1 The one-paragraph model

An organizer staff member **prepares a desk** (a phone or laptop browser) while online: the server registers the desk and returns a **ticket list** for one event (hashes of ticket tokens, masked names, bib, kit state). With no internet the desk accepts a scan only if the token's hash is in that list and the list says the kit is not yet collected; it writes a **provisional scan** to durable local storage and tells the staff member "Saved, not final". When the desk is online again it **sends** the scans; the server re-verifies everything (token MAC, ticket status, event, one-kit-per-registration) and either makes the handover official or records why not. **Nothing is official until the server says so.** The kit state participants and organizers see only changes at that moment.

### 3.2 Decisions this section depends on (D63 to D69, §20)

| D | Choice (recommended default) |
|---|---|
| D63 | Web desk first (portal route, works on a phone browser or laptop); native staff scanner stays deferred (S5 §9.2). |
| D64 | Offline check = SHA-256 lookup of the scanned token in the downloaded list; no secret and no MAC code on the device; the server re-verifies at sync. |
| D65 | Conflicts: first-sent wins; later duplicates are recorded and queued for a human, never auto-voided. |
| D66 | No bib assignment offline; bibs should be pre-assigned (S5 bulk and CSV). |
| D67 | Offline manual handover (lost phone) allowed with the same reasons and ID-check checkbox; every one is listed in the post-event review. |
| D68 | Limits: list valid 36 h, 10 desks per event, 2 per staff user, 2,000 unsent scans per desk, device clock tolerance 5 minutes. |
| D69 | A ticket not on the desk's list is **refused** offline; there is no "accept unverified" button. |

### 3.3 Desk registry (device management, PRD §17 item 9)

A **desk** is one registered browser profile on one phone or laptop for one event. It is a registry entry, **not a credential**: every server call still uses the staff member's normal portal sign-in (no new authentication path, `src/auth/*` untouched). The registry exists so FitFlex and the owner can see which devices hold a ticket list, limit how many exist, and cut one off.

**Server states (`EventKitOfflineDevice.status`):** `active` -> `revoked` (owner/admin or admin removes it, or the staff user is removed from the organizer) and `active` -> `expired` (past `expiresAt`, set lazily on read and by the daily purge). `revoked` and `expired` are final; preparing again creates a new desk row.

**Rules**
- Prepare: owner/admin/ops, event in `published | registration_closed | in_progress` and `kitProvided = true`, organizer not suspended. Max `EVENTS_OFFLINE_MAX_DEVICES` (10) active desks per event and `EVENTS_OFFLINE_MAX_PER_USER` (2) per staff user; over the limit: 409 `device_limit_reached` (owner/admin are told which desks to remove).
- Expiry: `expiresAt = issuedAt + EVENTS_OFFLINE_SESSION_HOURS` (36), never later than 24 hours after the event end. After `expiresAt` the desk refuses new scans (but still sends unsent ones, §3.11).
- Label: free text 1 to 40 characters ("Gate 2", "Phone A"), shown to owners and in review rows; not personal data.
- The desk reports a **heartbeat** whenever it has a connection (`pending` count, oldest pending time, desk build). Used for the Offline desks panel and the alert "desk has unsent scans" (§5.6).
- Revocation takes effect at the next contact. A revoked desk that reconnects is told `device_revoked`, **still may send** its unsent scans, and then wipes its list. Items with a device time **after** the revoke time are not auto-collected (`after_revoke`, review). This is the stolen or lost phone case.
- A minimum desk build is enforced: the server answers `426 desk_update_required { minBuild }` to snapshot, sync and heartbeat calls from older builds (`EVENTS_OFFLINE_MIN_DESK_BUILD`), the desk shows "Update needed" and refreshes the page (service worker update, §3.12).

### 3.4 The ticket list (snapshot)

Contents per **confirmed** registration of the event (optionally one category, for events too big for one list):

| Field | Why | Never included |
|---|---|---|
| `registrationId` (opaque) | to name the row in sync and review | user ids |
| `tokenHash` (sha256 hex of the active ticket token) | the offline check (§3.9) | the token itself, the MAC, the secret |
| `ticketCode` (display code, as S5 export) | support aid and search | |
| `name` masked ("Amina M.", `cardName`) | desk staff compare with ID | phone, email, DOB, gender, emergency contact (D36, D37) |
| `categoryId`, `bibNumber` (nullable) | desk card | payment data, payer, order ids |
| `ticket` `active` or `revoked` (+ `revokeReason` code) | refuse cancelled tickets offline | |
| `kit` `collected` (+ `collectedAt`, `collectionPointName`) or not | show "already collected" | staff names |

Plus header: `snapshotSeq` (the `OutboxEvent.seq` high-water mark read in the same transaction), `takenAt`, `serverTime`, `validUntil`, event status, timezone, collection points (id, name), categories (id, name), `kitProvided`, row count. Delta: `?sinceSeq=` returns only registrations changed since and a `removed` list; a desk refreshes by delta whenever online (every 5 minutes and before the event opens).

Size: about 250 bytes per row, so 5,000 registrations is roughly 1.2 MB; `EVENTS_OFFLINE_MAX_ROWS` 20,000. Above that: 413 `snapshot_too_large { rows, max }` and the portal asks for a category. Paged (`limit` 1,000, `cursor`). Served `Cache-Control: no-store`, gzip, audited (`events.kit_offline_snapshot { deviceId, rows }`), rate limited (6 full downloads per hour per desk, deltas 60 per hour).

A ticket **bought or claimed after** the list was taken is not on the list (claiming rotates the token, S4). That is deliberate (D69): such a person is handled by the online path or manual lookup once any desk has signal.

### 3.5 What the desk does with a scan, offline (the decision order)

1. Decode text. A gym QR is refused as in S5 ("This looks like a gym pass"), never stored. Anything not starting with `FFEV1:` and not a bare token: "Code not recognised".
2. **Clock guard** (§3.8). If the guard fails: stop, show the clock banner, store nothing.
3. **List guard.** No list, `validUntil` passed, or `removedByRevoke` flag set: refuse ("This desk's list has expired").
4. Compute `sha256(token)` in the browser (`crypto.subtle`), look up `tokenHash` in the list.
   - Not found: **refuse** `unknown_offline` ("Not on this desk's list"). Nothing stored.
   - Found, `ticket revoked`: **refuse** `revoked` with the reason code and the list time.
   - Found, kit `collected` in the list **or** a local pending scan exists for it on this desk: **refuse** `already_collected` (local repeat shows the earlier time on this desk). **No override offline** (override is owner/admin and online only).
   - Found, active, not collected: show the **valid card** (name, bib or "No bib yet" warning, category, kit size if the list has it).
5. Staff taps **Hand over kit**. The desk writes a provisional scan to IndexedDB **before** showing success (a crash right after must not lose it). Success text is "Saved, not final", never "Kit recorded".
6. The local list marks the registration `collected locally` so the same desk cannot scan it twice.

Offline manual handover (D67): the staff member searches the saved list by name, bib or ticket code (masked cards), picks a reason (phone lost, no signal, screen damaged, other), ticks "I checked their photo ID", and the desk stores a `manual` provisional scan with `registrationId` and `manualReason`. No override, no bib assignment, no kit size change beyond what the list already has.

The desk never shows a "Valid" word without the qualifier "from saved list" and the list time, so staff cannot mistake it for a live check.

### 3.6 State machines

**Provisional scan on the device (`localState`)**

| From | To | When |
|---|---|---|
| (none) | `pending` | staff confirms handover; row persisted |
| `pending` | `sending` | a sync request containing it is in flight |
| `sending` | `pending` | network error, 5xx, 429 or deferred item (retry with backoff, same `clientRef`) |
| `sending` | `confirmed` | server outcome `accepted` |
| `sending` | `needs_review` | server outcome `duplicate`, `revoked_after_scan`, `event_closed`, `after_revoke`, `organizer_suspended` |
| `sending` | `rejected` | server outcome `invalid_token`, `unknown_ticket`, `wrong_event`, `validation_failed` |
| `confirmed`, `needs_review`, `rejected` | (removed) | 24 hours after the outcome, or earlier by "Clear sent" (keeps the unsent) |

`pending` rows are **never** auto-deleted. "Discard unsent scans" exists only behind a typed confirmation of the count ("Type 14 to discard 14 unsent scans") and is counted in the next heartbeat (`discarded`), so the loss is visible to the owner.

**Server-side scan record (`EventKitOfflineScan.outcome`)**

| Outcome | Meaning | Creates a collection? | Review? |
|---|---|---|---|
| `accepted` | token valid, ticket active, event open, registration confirmed, no earlier collection | yes (`EventKitCollection`, `method offline`, `offlineBatchId`) | no |
| `duplicate` | a `collected` row already exists (online, or another desk synced first) | no | yes |
| `revoked_after_scan` | ticket cancelled, refunded, event cancelled or replaced after the list was taken (see §3.7 rule 5 for "replaced") | no | yes |
| `event_closed` | event cancelled or archived at sync time | no | yes |
| `after_revoke` | device time after the desk was removed | no | yes |
| `organizer_suspended` | organizer suspended at sync time | no | yes |
| `invalid_token` | payload is not a ticket token or the MAC fails | no | no (counted; burst alert) |
| `unknown_ticket` | valid MAC but no matching ticket row | no | no |
| `wrong_event` | ticket belongs to another event | no | no |
| `validation_failed` | bad point, bad reason, bad shape | no | no |
| `deferred` | not processed (time budget); **not stored**, device retries | no | no |

Review state (`reviewStatus`): `none`, `needs_review` -> `checked` (one action, "Mark as checked", by owner/admin, optional note, required 10 to 300 characters for `revoked_after_scan`). No auto-expiry; an unchecked item blocks nothing but shows on the desk header and in the post-event list.

### 3.7 Sync rules, conflicts and double scans

Sync order: the device sends oldest first by device time, batches of at most `EVENTS_OFFLINE_SYNC_BATCH` (200). The server processes **each item in its own transaction** (a bad item never rolls back good ones), in the order sent, within a 20 second budget; the rest come back `deferred`.

| # | Case | Server rule |
|---|---|---|
| 1 | Same scan sent twice (network drop, retry, duplicate tab) | `(deviceId, clientRef)` is unique; the second send returns the **stored outcome** with `replayed: true`. Never `already_collected`. (This also fixes follow-up S5 L7 for this path.) |
| 2 | Same ticket scanned offline on two desks | The first item **processed** wins (`accepted`); the second is `duplicate`, linked to the winning collection, in review. The winner's `collectedAt` is its (clamped) device time; the loser keeps its own for the reviewer. `kit.collected` webhook and member notice are sent **once**, for the winner. |
| 3 | Offline scan, but an online collection already exists (made after the list was taken) | `duplicate` as in 2. |
| 4 | Offline scan of a ticket cancelled or refunded after the list was taken | `revoked_after_scan`, no collection, review shows masked name, reason code, both times. The kit may already be in someone's hands: the organizer decides (runbook R8). |
| 5 | Offline scan of a ticket whose token was **replaced after** the list was taken (the person claimed and the ticket rotated) | Accepted **only if** the old ticket row is `revoked` with reason `replaced`, its `revokedAt` is later than the desk's `snapshotTakenAt`, and the registration is still `confirmed`. A replaced ticket that was already replaced when the list was taken is not on the list, so the desk refused it. |
| 6 | Event cancelled, archived or organizer suspended at sync | `event_closed` / `organizer_suspended`, review. |
| 7 | Collection point id missing or not active | accepted, point stored as null, warning `collection_point_invalid` (the point is not a safety property). |
| 8 | Kit size in the item differs from the registration | accepted, warning `kit_size_differs` (as S5). |
| 9 | `bibNumber` in an item | **ignored** with warning `bib_ignored_offline` (D66). |
| 10 | Item time outside the window `[snapshotTakenAt - 5 min, receivedAt + 5 min]` after clock correction | accepted, `collectedAt` clamped to the nearest bound, `clock_adjusted` flag on the scan row (not an error; a kit that really changed hands is not refused because a clock was wrong). |
| 11 | More than 20 `invalid_token` items from one desk in a batch | the whole batch is still processed; an audit row `events.kit_offline_invalid_burst { deviceId, count }` and an owner notice (a desk replaying guessed tokens). |

What review shows: outcome in words, masked name, category, desk label, device time, server time received, the winning collection's time and desk when relevant, and the note box. **No** phone, email or other contact data (D36).

### 3.8 Device clock

- The device clock is **not trusted** for anything that changes data other than the displayed time. Every server response carries `serverTime`; the desk stores `offsetMs = deviceNow - serverTime` at each contact and stamps each scan with its device ISO time, the monotonic reading (`performance.now()`), and the `offsetMs` last known.
- Server correction: `correctedAt = claimedAt - offsetMs`, then clamped (§3.7 rule 10). Order of processing never depends on device time for correctness, only for sorting.
- Desk clock guard (blocks scanning, §3.5 step 2): (a) the device's wall clock moved **backwards** against the monotonic reading since the last scan; (b) the wall clock differs from the last `serverTime + elapsed monotonic` by more than `EVENTS_OFFLINE_CLOCK_TOLERANCE_SECONDS` (300). The banner tells staff to correct the date and time; scanning resumes when the guard passes. Sending is never blocked by the guard.

### 3.9 Ticket signature verification offline (what it proves and what it does not)

- **What the device checks:** that the scanned token hashes to a value the **server put in this desk's list** for this event. Tokens carry 132 bits of MAC and 64 bits of ticket id, so a hash cannot be inverted or guessed; a token not issued by FitFlex cannot pass.
- **What it cannot check:** the MAC itself (needs `EVENT_TICKET_SECRET`, which never leaves the server; shipping it to staff devices or embedding a MAC routine in the page would expose the key to anyone who opens developer tools). It also cannot know about anything that happened after the list was taken.
- **Why that is enough:** the device verdict only decides whether staff may hand over a kit *right now*. The **server re-verifies every item at sync**: token parsed, hash looked up, `verifyToken` MAC compared in constant time against the registration and event, ticket active (or replaced-after-snapshot), registration confirmed, event open, one-collected unique index. A forged or edited cache can at worst make one desk hand out kits that sync then flags; it can never create an official collection.
- **Not adopted (D64 alternative):** public-key signed tickets (Ed25519) would let devices verify offline with a public key but need a token format v2 and a QR migration for every issued ticket. Revisit only if offline becomes the main path.

### 3.10 What is NOT trusted (builder checklist; each gets a spec)

The device clock; the desk's verdict ("valid from saved list"); `collectionPointId` and `kitSize` and `bibNumber` in an item; any `registrationId` for a `scan` item (only the token is used, the server resolves the registration itself); the staff identity beyond the signed-in user and the registered desk; item order and counts; the desk build string except for the minimum-build gate; the `outcomeOnDevice` field (stored for diagnostics only, never read to decide); `kit` flags in the list on the desk (a desk can be edited by its user). The server trusts only: the staff JWT, the desk registry row, the token MAC and database state.

### 3.11 Revocation, expiry, end of event

- Revoked desk: §3.3. Expired desk: scanning stops; sending still works; the list is wiped after the last unsent scan is sent.
- Wipe triggers: sign-out; desk removed; list expired **and** nothing unsent; "Remove saved list from this desk"; 7 days after the event end. A wipe **never deletes unsent scans**.
- Stranded scans: if a desk is lost with unsent scans, the owner can see `pending` from the last heartbeat on the Offline desks panel and uses runbook R8 (manual handover records with reason `other` and a note, after verifying who collected). No back door writes collections without a ticket.

### 3.12 Privacy and storage on the device

- The list is stored in IndexedDB encrypted with AES-GCM using a **non-extractable** `CryptoKey` kept in the same origin's IndexedDB; unsent scans (which contain the scanned token text the server needs for the MAC check) are encrypted the same way. This protects against casual disk reading and other pages; it does **not** protect against someone who can use the signed-in browser profile, which is why the list is time-limited and wiped on sign-out.
- `navigator.storage.persist()` is requested when the desk is prepared; if refused, the desk shows a warning "This browser may delete saved data when space is low" (it does not block).
- No list data in `localStorage`, URLs, logs, analytics or error reports. Telemetry from the desk is counts only (§5).
- Participant exposure is the same as the S5 desk card (masked name, bib, kit); contact data and emergency contact are never in the list (D36, D37).
- **Gate:** the retention and consent rule from S5 (follow-up "retention and anonymisation rule is a launch gate before roster API/export goes live"; consent text over-states sharing and omits kit status and bib) must be settled before `EVENTS_KIT_OFFLINE` is on in production (§6.2 and checklist C14).

### 3.13 API contract (organizer JWT; every route 404 `feature_disabled` unless `EVENTS_KIT_OFFLINE`; errors `{ error, ...extra }`; `Cache-Control: no-store`)

Base `/organizer/events/:id`. Writes need `Idempotency-Key` (8 to 100). Guards as S5 (`requireActiveOrganizer` for writes, `requireOpenOrganizer` for reads; sync is allowed for a suspended organizer and returns review items).

| Method and path | Roles | Body / query | Success | Errors |
|---|---|---|---|---|
| `POST /kit-offline/devices` | owner admin ops | `{ label (1-40), clientKind: 'web', deskBuild }` | 201 `{ device: { id, label, status, issuedAt, expiresAt }, limits: { sessionHours, maxPending, clockToleranceSeconds, syncBatch }, serverTime }` | 409 `device_limit_reached`, 409 `event_not_open`, 409 `kit_not_provided`, 403 `forbidden_role`, 426 `desk_update_required`, 429 |
| `GET /kit-offline/devices` | owner admin (all); ops (own) | `?status` | `{ items: [{ id, label, status, staffFirstName, issuedAt, expiresAt, lastSyncAt, lastHeartbeatAt, pendingReported, discardedReported, snapshotRows, snapshotSeq, deskBuild }] }` | |
| `POST /kit-offline/devices/:deviceId/revoke` | owner admin | `{ reason (10-300), reasonSw? (10-300) }` | 200 `{ device }` | 404 `device_not_found`, 409 `already_ended` |
| `GET /kit-offline/snapshot` | owner admin ops | `?deviceId&cursor&limit(<=1000)&sinceSeq&categoryId` | 200 `{ header: { snapshotSeq, takenAt, serverTime, validUntil, event: { status, timezone, kitProvided }, collectionPoints[], categories[], rowCount }, rows[], removed[], nextCursor }` | 403 `device_not_active`, 404, 413 `snapshot_too_large`, 426, 429 |
| `POST /kit-offline/heartbeat` | owner admin ops | `{ deviceId, pending, oldestPendingAt, discarded, deskBuild, clockOffsetMs }` | 200 `{ serverTime, deviceStatus: 'active'\|'revoked'\|'expired', minDeskBuild }` | 404, 426, 429 |
| `POST /kit-offline/sync` | owner admin ops | `{ deviceId, batchId, snapshotSeq, snapshotTakenAt, clockOffsetMs, items: [{ clientRef (uuid), method: 'scan'\|'manual', payload?, registrationId?, manualReason?, collectionPointId?, kitSize?, claimedAt, outcomeOnDevice? }] }` (<= 200 items; `Idempotency-Key` = `batchId`) | 200 `{ results: [{ clientRef, outcome, replayed?, registrationId?, collectionId?, warnings[], reviewId?, card? }], summary: { accepted, duplicate, needsReview, rejected, deferred }, serverTime, deviceStatus, minDeskBuild }` | 400 `invalid_batch`, 404 `device_not_found`, 413 `too_many_items`, 426, 429 `rate_limited` (30 a minute per user) |
| `GET /kit-offline/review` | owner admin | `?status=needs_review\|checked\|manual&cursor&limit` (`manual` lists accepted offline manual handovers for the post-event review, D67) | `{ items: [{ id, outcome, card (masked), deviceLabel, deviceTime, receivedAt, winner?: { collectedAt, deviceLabel?, method }, reviewStatus, note?, warnings[] }], nextCursor, counts: { needsReview, checked } }` | |
| `POST /kit-offline/review/:scanId/check` | owner admin | `{ note? (required 10-300 for revoked_after_scan) }` | 200 `{ review }` (audited `events.kit_offline_checked`) | 404, 409 `not_in_review`, 422 `note_required` |
| `GET /kit/summary` (S5, additive) | owner admin ops | | adds `offline: { desks, pendingReported, needsReview }` | |

Admin (scope `events`): `GET /admin/events/:id/kit-offline` (devices and review counts, read-only) and `POST /admin/events/:id/kit-offline/devices/:deviceId/revoke { reason }`.

Webhooks: **no new type** (the S5 allowlist is closed); `kit.collected` fires once per accepted item at sync time. Notifications: `event_kit_collected` is sent at sync for `accepted` items only (existing copy). Owner notice `organizer_kit_offline_invalid_burst` (essential).

**Audit** (`AuditLog`, actor and requestId, no tokens): `events.kit_offline_device_prepared`, `…_device_revoked`, `…_snapshot`, `…_synced { deviceId, batchId, accepted, duplicate, needsReview, rejected }`, `…_checked`, `…_invalid_burst`. **Analytics:** §5.

### 3.14 Portal: the offline kit desk (`/organizer/kit-desk?event=<id>`)

**Why a separate route:** the S5 desk (`view=kit`) stays online-only and unchanged; the offline desk must open with no network, so it is one self-contained page with a service worker scoped to its own path (`public/organizer/kit-desk/sw.js`, scope `/organizer/kit-desk/`), no dynamic `import()`, all dialogs and strings bundled. The rest of the portal never sees the service worker. Entry points: a **Use the offline desk** button on the S5 desk header (shown when `ops.kitOffline`), a link on the event page for owner/admin/ops, and a bookmarkable URL for staff phones. Deep link: `/organizer/kit-desk?event=<id>[&category=<id>]`. Back goes to the event's kit view. After sending completes, the page stays (the desk is the destination).

**Service worker rules:** cache-first for `/organizer/kit-desk/` HTML and `/_next/static/*` chunks it has seen, network-first for everything else (API calls are never cached); versioned cache name; on update the page shows "A new version is ready" and applies it only when no scan is in progress and nothing is `sending`; `Cache-Control: no-cache` on `sw.js` in `firebase.json`. The first successful online load while the service worker is active is the "prepare the page" step; the Prepare screen says so and shows a green "Works without internet" chip only after the worker reports the shell cached.

**Layout, phone (375 px), top to bottom:** header (event title, status badge, **mode chip**: `Online`, `No internet`, `Sending`), sync bar (pending count, oldest time, list time, **Send now** button), camera card (`QrScanner`, max 40 vh, sticky), result card, manual/search block, footer links (Offline scans to check (n), Remove saved list). **Desktop (>= 1024 px):** two columns as S5 (camera and search left, result card right); the review list and desk list are tabs under the header.

**Screens and states**

| State | Behaviour |
|---|---|
| Not prepared | Prepare card: desk name `Field`, collection point `Select` (remembered), category `Select` only when `snapshot_too_large`, **Download ticket list**, the "open this page once with internet" hint, desk limits text. Download progress with count; failure keeps the card with Retry. |
| Ready, online | Normal S5 behaviour (verify and confirm online) **plus** the list is refreshed by delta in the background. The online path is always preferred when reachable; the offline path is used when a request fails twice within 8 seconds or `navigator.onLine` is false (banner "Weak signal, using saved list", return to online automatically when a heartbeat succeeds). |
| Offline | Sticky warning banner (`role="status"`), provisional wording on every result, pending counter, no override, no bib field. |
| Sending | Progress "Sending {done} of {total}", the camera keeps working (new scans queue), per-outcome summary at the end ("12 confirmed, 2 need a check"). |
| Needs review | Chip on the sync bar and the **Offline scans to check** list (owner/admin: Mark as checked; ops: read own, text "Ask an owner or admin"). |
| List expired | Camera card replaced by the expired message; Send still works. |
| Clock wrong | Blocking banner with the device time and the expected time; scanning disabled. |
| Desk removed | Banner "This desk was removed. Send your unsent scans, then the list will be deleted." Send enabled; scanning disabled. |
| Update needed | Banner and **Refresh** (426). |
| Storage blocked or unavailable | Prepare screen explains (private browsing, blocked storage) and offers the online desk. |
| Event not open / cancelled / completed | As S5 (history read-only, scanner disabled); sending still allowed. |
| Forbidden role | `Forbidden`. |
| Camera denied, unsupported, insecure | As S5; the manual box and the saved-list search remain. |
| Loading, error | Skeleton; `ErrorState` + Retry. |

**Result card (offline wording)** extends the S5 table: `valid (saved list)` success "Ready for kit (from saved list)" + **Hand over kit**; `saved` success "Saved, not final" (2 s, `aria-live`, then scanner resumes; **Scan next** skips); `already_collected (local)` warning; `already_collected (list)` warning; `revoked (list)` danger; `unknown_offline` danger "Not on this desk's list"; `wrong_event` is not detectable offline (any foreign token is simply unknown). Colour is never the only signal.

**Focus and keys:** as S5 §8.3 (result heading focused and announced, **Hand over kit** autofocus on valid, `Esc` cancels, manual box keeps focus for USB scanners). Pending counter and mode chip are in a `role="status"` region; Send is a real button.

**Desks panel** (event page, owner/admin; ops sees own): `DataTable` with Desk, Staff, Status, Last sent, Unsent (as last reported), List rows, Build; row actions **Remove desk** (`ConfirmDialog` danger, typed desk name, reason `Textarea`). Empty: "No offline desks yet."

**Portal tests (Playwright, mocks):** online load registers the worker; `context.setOffline(true)` then reload still renders; injected decode text for each result; two scans of the same ticket offline; sync partial outcomes and `deferred`; revoked desk; clock guard (stubbed `Date`); sign-out wipes the list but not unsent scans; Swahili at 375 px with no overflow; flag off hides every entry point.

---

## 4. B. Waitlist (REG-015, P1)

### 4.1 Principles

1. **Waiting costs nothing and takes no money.** No payment, hold or pre-authorisation exists while waiting.
2. **First come, first offered** per ticket type, by a database sequence, not by clock time.
3. **The offer is a normal order.** When a place opens, FitFlex creates a real order (`awaiting_payment`) for the person at the head of the line, using the registration details they gave when joining. From there everything is the existing S3/S4 flow: hold timer, manual payment, 24 hour confirmation, refund rules. No new payment code path exists.
4. **No queue jumping.** While anyone is waiting for a ticket type, new buyers cannot take that type's open places; the places are for the line.
5. **Organizers cannot reorder, skip or promote.** They see counts only.

### 4.2 Scope (D70)

One signed-in member, one place, for themselves, in one ticket type, with a verified phone or email. Not for guests, groups, teams, corporate orders or "register another person" (those stay on the normal sold-out message). The registration form used to join is the same self-registration form as checkout, so the offer needs no further data from the member.

**Who may join (all server-checked, in this order; first failing wins):**
`feature_disabled` -> event `published` and registration open (event and category) -> `waitlist_unavailable` when the event's `waitlistEnabled` is false or the waitlist was closed -> ticket type active, sale window open -> **sold out now** (`sold + held >= capacity`, read under the ticket-type row lock; else 409 `not_sold_out` and the app sends them to register) -> payments available for a priced ticket (event payment mode not `none`, D32; else 409 `waitlist_unavailable`) -> `verification_required` (no verified phone or email on the account) -> `already_registered` (D20 duplicate policy: an active place, a held order or a live waitlist entry in the same category, matched on normalised phone or email as entered) -> `waitlist_lapse_limit` (two expired offers for this event) -> `waitlist_limit_reached` (5 live entries per member) -> `waitlist_full` (500 live entries per ticket type) -> `rate_limited` (10 joins an hour).

### 4.3 State machine (`EventWaitlistEntry.status`)

| From | To | Trigger | Notes |
|---|---|---|---|
| (none) | `waiting` | join succeeds | `seq` assigned by identity column |
| `waiting` | `offered` | promoter creates the order | `orderId`, `offeredAt`, `offerExpiresAt = order.holdExpiresAt` set in the order's own transaction (`afterCreate`) |
| `offered` | `converted` | the linked order becomes `confirmed` | reconciliation (job and after-payment hook of the sweep), not inside payment code |
| `offered` | `expired` | the linked order expires (hold lapsed, nothing paid) | counts as a lapse |
| `offered` | `declined` | the member cancels the held order or leaves | not a lapse |
| `expired` | `converted` | a late payment re-reserves the place (S4 rehold) | only through reconciliation |
| `waiting`, `offered` | `left` | member leaves | `offered` leaves via the order cancel path; blocked by 409 `payment_pending` while a manual payment is waiting for confirmation (use the order cancel and refund flow) |
| `waiting`, `offered` | `removed` | FitFlex admin removes (reason, audited) | `offered` cancels the held order if unpaid |
| `waiting` | `closed` | event or category leaves open registration, sale window ends, event cancelled, organizer closes the waitlist, member's account deleted (row deleted instead) | `endedReason`: `sale_closed`, `event_cancelled`, `organizer_closed`, `registered_elsewhere`, `not_eligible` |

`converted`, `expired` (without late payment), `declined`, `left`, `removed`, `closed` are final. A sub-state `blockedReason = reconsent` (consent text version changed since joining) keeps `waiting` but makes the promoter skip the entry until the member re-confirms; the entry keeps its `seq`.

**Position** (for the member only) = number of `waiting` entries of the same ticket type with `seq` <= own. A member whose offer is open is not counted; the queue length is never shown.

### 4.4 Promotion rules (fairness and hold windows)

Runs in job `event-waitlist-promote` (every minute, advisory lock, `SKIP LOCKED` per ticket type, flag-gated) and is also nudged after hold expiry (`hooks.afterExpire` exists) and after a cancel; the job is the guarantee, the nudge only shortens the wait.

For each ticket type with live waiting entries and free capacity (`capacity - sold - held >= 1`):
1. Lock the ticket-type row. Re-read free capacity.
2. Take the lowest-`seq` entry that is eligible: not `blockedReason`, member still eligible (verification, no duplicate place, account active). Skips (blocked, transient unpaid-order limit, **max 3 skips** then `closed(not_eligible)`) never move the entry behind others.
3. Pre-conditions that stop the whole ticket type for this run (entries stay `waiting`): event not `published`; registration, category or ticket sale closed (then entries close: `sale_closed`); payments unavailable for a priced ticket; fewer than `EVENTS_WAITLIST_MIN_OFFER_MINUTES` (120) left before registration closes; **quiet hours** (21:00 to 07:00 in the event timezone; promotion waits for 07:00 unless registration closes before the offer would end).
4. Create the order through the **registration service's create-order function with a system actor**, so every validator runs again (sale window, per-order limits, duplicate policy D20, age and eligibility, consent snapshot): purchaser = the member, one line, one participant from the stored details, `idempotencyKey = 'wl:' + entryId` (an entry can never produce two orders), `holdTtlMinutes` = the **offer window**, `afterCreate` marks the entry `offered`. The store primitive is **not modified** (`holdTtlMinutes` and `afterCreate` parameters exist today).
5. After commit: notice (push + in-app, §4.8), analytics, loop while free capacity remains (each entry in its own transaction, at most 10 per run per ticket type).
6. Failure mapping: `capacity_unavailable` stops this ticket type for this run; duplicate or ineligible closes that entry (`registered_elsewhere` / `not_eligible`) and moves on; sale or registration closed closes all entries of the type (`sale_closed`).

**Offer window (the hold):** `clamp(hoursUntilRegistrationCloses / 4, 2 h, EVENTS_WAITLIST_OFFER_HOURS (12 h))`, never past registration close. A reminder notice goes at one hour left. Nothing in the offer clock stops while the member is offline; the app shows the deadline in the event timezone and the member's phone clock is never used (the server sends `expiresAt`, the app counts down from `serverTime`).

### 4.5 Payment interplay (D26, D29 to D32)

| Situation | Rule |
|---|---|
| Payment mode `none` (second approver flag off, D32) | No offers are made; joining a priced ticket is refused; existing entries wait. Free (TSh 0) ticket types are unaffected. |
| Offer accepted by paying | The order follows S4 unchanged: manual payment with a transaction id, admin confirms within the quoted 24 hours, `MONEY_SECOND_APPROVER` where on. Confirmation turns the order `confirmed`, tickets are issued as usual, the entry becomes `converted`. |
| Hold while a manual payment waits (D26) | The existing extension (+24 h, capped at 48 h from the order; `extendHold`) applies to waitlist orders exactly as to any order, so a member who really paid does not lose the place because FitFlex has not confirmed yet. **Risk:** one bogus transaction id can stall the line for up to 48 h (follow-up S4 L6). Mitigation shipped: the per-member cap on unpaid places (§6.1, B4). Alternative that needs a change inside payment code and is **not** the default: a shorter cap for waitlist orders (D73). |
| Payment rejected | Existing rule (hold reset to the retry window, no further extension); if the order then expires the entry is `expired` and counts as a lapse. |
| Late payment after the offer expired | Existing S4 rule: places are re-reserved only if available, else the payment is refunded in full (D26). **No priority over the line**: by then the place has usually gone to the next person. The app and the expiry notice say so ("If you already paid, we will refund you"). |
| Member cancels a paid waitlist-origin ticket | Normal member cancel and the refund policy of the event (D24, D27, D29: a `custom` preset cannot be evaluated by "policy" refunds, the admin picks full or none); the freed place goes to the next entry. |
| Event cancelled | Entries `closed(event_cancelled)`; offered orders follow the S4 event-cancel refund batch (D31) like any order. |
| Refund payouts | Unchanged and manual (S4). Waiting members have no money to refund. |
| Organization (D30) | Waitlist is individuals only; orders created by organisations still obey the queue gate (§4.6) so they cannot jump it. |

### 4.6 The queue gate (no sniping)

In the registration service, before any order is created for a ticket type (member checkout, corporate bulk, API-driven or admin-created), if the ticket type has any `waiting` or `offered` entry and the order is **not** the promoter's own, answer 409 `waitlist_active { ticketTypeId }`. The check runs after the ticket-type row is locked in the creation path where the service already holds it; otherwise it is a read just before (a buyer slipping in between two promoter runs is possible only when no entry exists, which is the case where there is nobody to wrong). Discovery follows the gate: `ticketAvailability` returns `sold_out` while a live queue exists, even if free places exist, so **old app builds** show "Sold out" instead of an error, and new builds read `waitlist.state` to show the button. `GET /events/options` `waitlist.enabled` lets clients hide the button on servers without the flag.

### 4.7 Abuse and safety limits (D74)

- One live entry per member per ticket type and per category; one live entry per **normalised phone or email** per ticket type (`contactKey`, a hash, unique where live) so a second account on the same contact cannot double up.
- 5 live entries per member overall; 500 live entries per ticket type; 10 join attempts per hour per member; two expired offers on one event block further joins to that event (`waitlist_lapse_limit`).
- Verified contact required; no guests.
- Entries and offers are audited without personal data; admin can remove an entry with a reason (audited, member is told).
- Stored registration details (`intent`) are removed within 24 hours of an entry ending and when the account is deleted (cascade delete of the row). Stored data = what the same registration form would store for an order, for the same purpose.
- Reward farming: offers do not change reward rules; per-event reward eligibility is §6.1.
- The promoter never reads or logs contact data.

### 4.8 Notifications (class per D56; server strings `{en, sw}`)

| Type | When | Class | Channel |
|---|---|---|---|
| `event_waitlist_joined` | joined | optional | in-app only |
| `event_waitlist_offer` | order created | **essential** | push + in-app, route to the order's payment page |
| `event_waitlist_offer_reminder` | 1 hour left, once | essential | push + in-app |
| `event_waitlist_offer_expired` | offer ended unpaid | essential | in-app (+ push) |
| `event_waitlist_closed` | event cancelled, sale closed, organizer closed, admin removal | essential | in-app (+ push) |

Copy in §10.3. No SMS in S7 (D76). Deep links: `/member/events/orders/<orderId>` for offer and reminder, `/member/events/waitlist` otherwise (both added to `memberRouteFor`).

### 4.9 API contract (D5 envelope; every route 404 `feature_disabled` unless `EVENTS_WAITLIST`)

**Member (JWT `member`, `Idempotency-Key` on writes):**

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /me/events/:id/waitlist` | `{ ticketTypeId, participants: [self details exactly as the checkout quote takes them], consent: { accepted: true, textVersion }, locale? }` | 201 `{ entry: { id, status: 'waiting', position, ticketTypeId, ticketTypeName, categoryName, priceTzs, currency, joinedAt } }` | 404 `event_not_found`, 409 `not_sold_out`, `waitlist_unavailable`, `already_registered`, `waitlist_full`, `waitlist_limit_reached`, `waitlist_lapse_limit`, 403 `verification_required`, 422 `validation_failed { fields }`, 422 `consent_required`, 429 `rate_limited` |
| `GET /me/event-waitlist` | | `{ items: [{ id, eventId, eventTitle, startsAt, timezone, ticketTypeName, categoryName, status, position?, joinedAt, blockedReason?, offer?: { orderId, expiresAt, amountTzs, currency }, endedAt?, endedReason? }], serverTime }` | |
| `DELETE /me/event-waitlist/:id` | | 200 `{ entry }` | 404, 409 `payment_pending`, 409 `already_ended` |
| `POST /me/event-waitlist/:id/reconfirm` | `{ consent: { accepted: true, textVersion } }` | 200 `{ entry }` | 409 `not_blocked` |
| `GET /events/:id` (additive) | | each ticket type gains `waitlist: { state: 'none'\|'open'\|'closed' }`; event gains `waitlist: { enabled }` | |
| `GET /events/options` (additive) | | `waitlist: { enabled, offerHours, maxActivePerUser }` | |
| `GET /me/event-orders` (additive) | | order rows gain `source: 'waitlist' \| null` | |

**Organizer (JWT; owner/admin/ops read; owner/admin write):** `GET /organizer/events/:id/waitlist` -> `{ enabled, closedAt, byTicketType: [{ ticketTypeId, name, waiting, offered, converted, expired, left }], totals }` (counts only, **no names or positions**); `PATCH /organizer/events/:id/waitlist { enabled }` (stops or resumes **new joins**; allowed after publish; not a material change); `POST /organizer/events/:id/waitlist/close { }` (closes all live entries with a notice; irreversible; owner/admin).
**Admin (scope `events`):** `GET /admin/events/:id/waitlist?ticketTypeId&status&cursor&limit` (masked cards: first name and last initial, seq, status, joinedAt; no contact data) and `POST /admin/events/:id/waitlist/:entryId/remove { reason (10-300), reasonSw? }`.
**Jobs:** `event-waitlist-promote` (every minute) and `event-waitlist-purge` (daily 23:15 UTC: nulls `intent` of ended entries, deletes ended entries older than `EVENTS_WAITLIST_KEEP_DAYS` (90) keeping an anonymised count in analytics).

**Backend fields (NEW unless stated):** `Event.waitlistEnabled boolean NOT NULL DEFAULT true`, `Event.waitlistClosedAt timestamptz NULL`; table `EventWaitlistEntry` (§7.3); `EventOrder` unchanged (the entry points at the order, `afterCreate`); existing: `EventTicketType.capacity/sold/held`, `EventOrder.holdExpiresAt`, `User` verification fields (**confirmation 7**).

### 4.10 Surfaces

**Mobile (member).**
- *Event detail, CTA bar:* when the event is open and a ticket type's `waitlist.state` is `open`, the sold-out state's button becomes **Join waitlist** (hint `events.waitlist.cta.hint`); `joined` shows a disabled-looking secondary "On the waitlist" that opens the entry. Old server (no field): unchanged "Sold out".
- *Join flow* reuses `MemberEventRegisterPage` in `mode=waitlist` (route `/member/events/:id/register?mode=waitlist&ticketTypeId=<id>`): steps Ticket (only sold-out types; others disabled with the reason), Your details (prefilled from profile, self only, the mode tiles for other people are hidden), Consent (same text and version as checkout), Review (price today, the three rules: free to wait, held for {hours} h when offered, first come first offered) and a primary **Join waitlist** (no payment step). Success page: "You're on the waitlist", position, "Keep notifications on", buttons **View my waitlist** and **Back to event**.
- *My waitlist:* a **Waitlist** section in the Mine page (`member_event_orders_page.dart`) and `/member/events/waitlist`. Each card: event title, ticket type, status chip (text + icon, not colour alone), position when `waiting`, deadline and **Pay now** when `offered`, **Leave waitlist** (ConfirmDialog) when live, reason text when ended. Empty state with a link to Events.
- *Offer:* the push opens the order's payment page (existing S4 page with its hold countdown); the order shows a "From the waitlist" chip. If the hold lapsed while the app was closed, the order page shows the existing expired state plus the waitlist line "Your turn passed. If you already paid, we will refund you."
- *Offline:* viewing My waitlist shows the saved copy (`EventsCache`, 24 h age rule as other member lists); join and leave need internet ("Hakuna intaneti. You need a connection to join or leave.").
- *Roles:* member only; trainers, owners and vendors see nothing new.
- Layout: single column on phone; >= 840 px (Flutter web desktop) cards in a 2-column grid; targets >= 48 dp; every chip, button and the position have `Semantics`.

**Portal (organizer).** On the event **Registrations** tab header a **Waitlist** card (owner/admin/ops; finance read): "Waitlist on" switch (owner/admin; label **Accept new waitlist sign-ups**), counts per ticket type in a small `DataTable` (Waiting, Offers open, Bought, Time ran out, Left), and **Close waitlist** (owner/admin, `ConfirmDialog` danger, typed word, "This ends the line and tells everyone waiting. It can't be undone."). No names, no positions, no "promote" buttons. Also a read-only line on the event Review step. States: flag off (card hidden), loading, empty ("Nobody is waiting"), error + retry, closed (read-only with the close time), suspended organizer (read-only).

**Portal (FitFlex admin).** On the admin event view a **Waitlist** block with the masked list and **Remove** (reason `Textarea`); read-only when the event is cancelled or archived.

---

## 5. C. Analytics, launch dashboard and alerts (PRD §14)

### 5.1 Model (D77)

Today server events are `analytics.<name>` rows in `AuditLog` (S3 to S6) and mobile calls are no-ops (`EventsAnalytics`, "S7 connects them"). S7 adds **one aggregate-counter store** and one transport, and keeps what exists:

- **Counters, not event logs.** `EventAnalyticsDaily` holds `(day in Africa/Dar_es_Salaam, name, eventId or null, dimsKey) -> count`. No user id, no registration or order id, no session or device id, no IP, no user agent, no timestamp finer than the day. A funnel is therefore counts of events, not counts of distinct people; that is enough for the launch dashboard's conversion shape and is the privacy trade (stated on the dashboard).
- **One helper** `track(name, dims, { eventId, n = 1 })` validates against the allowlist (§5.3) and upserts; unknown names or dimension keys are dropped, enumerated values outside the closed set become `other`. Best effort: a failure never affects a request (same rule as today's `analytics()`).
- **Server events stay authoritative** for anything the server knows (orders, payments, kit, results, rewards). The roll-up job `event-analytics-rollup` reads the existing `analytics.%` rows from `AuditLog` (cursor on `at`, `id`) and maps them to counters, so S3 to S6 history is not lost and no S3 to S6 service changes. New S7 events call `track` directly.
- **Client events** (mobile) cover only what the server cannot see: views and steps before an order exists. The client does **not** send names the server emits (`order_created`, `order_cancelled`, `registration_claimed`) so nothing is double counted.

### 5.2 Privacy rules (security-and-privacy-reviewer checks these)

1. No personal data in any name, dimension or id: no names, phones, emails, DOB, age, gender, bib, ticket code, token, hash, payment reference, user id, registration id, order id, team or organization id, free text.
2. **Minors:** nothing varies by age, DOB, gender, guardian or "is minor". `categoryId` is **not** a dimension (an under-18 category would reveal a small group): counters are per event only. Results, medals and rewards counters are event-level and carry only a closed type (`tier`, `rewardType`).
3. Public ids only: `eventId` is public (it appears in discovery). Organizer ids are not dimensions.
4. Amounts are not dimensions (counts only; money is reconciled from the money tables, not analytics).
5. Closed enumerations only: every dimension value comes from a fixed list in code; the transport drops everything else.
6. The ingestion endpoint stores nothing about the caller: the member token is used for rate limiting and to refuse anonymous spam, then discarded. Request bodies must not be logged by the platform (**confirmation 9**).
7. No organizer-facing view in S7 (D77). If one is added later, cells below 5 are suppressed.
8. Counters keep `EVENTS_ANALYTICS_KEEP_DAYS` (default 730) then are deleted by the purge job. The app privacy text gains one sentence ("We count how the events screens are used, without your name or account"; draft, counsel to review, §19).

### 5.3 Event list (names follow PRD §14; "src" is where it is emitted)

| Name (PRD name where it exists) | src | Dimensions (closed sets) | Status |
|---|---|---|---|
| `event_list_viewed` | app | `filters` (0, 1, 2+), `results` (0, 1-5, 6-20, 21+), `platform` | exists as no-op; wired in S7 |
| `event_detail_viewed` | app | `availability` (open, closing_soon, sold_out, closed, not_yet_open, cancelled, in_progress, completed), `platform`; `eventId` | exists as no-op |
| `event_saved` | app | `saved` (true, false); `eventId` | exists as no-op |
| `registration_started` | app | `source` (cta, ticket_row, deep_link, other); `eventId` | exists as no-op |
| `checkout_quote_created` | app | `mode` (self, others, group, team); `eventId`; `places` (1, 2-5, 6+) | exists as no-op (amount and order id dropped by the transport) |
| `payment_started`, `payment_submitted`, `payment_state_seen` | app | `late` (true, false), `state` (pending, confirmed, rejected, expired, unknown, refunded), `method` (manual, mobile_money) | exists as no-op |
| `ticket_opened`, `ticket_rotated`, `invitation_resent`, `cancel_preview_viewed`, `cancel_confirmed` | app | `scope` (place, order), `mode` (policy, none, full, other) | exists as no-op |
| `run_started` | app | `eventId`, `platform` | new (S6 recorder bound to an event) |
| `waitlist_cta_viewed`, `waitlist_join_started`, `waitlist_offer_opened` | app | `eventId` | new |
| `order_created`, `order_expired`, `order_cancelled`, `registration_cancelled`, `registration_claimed`, `payment_initiated`, `payment_confirmed`, `payment_failed`, `ticket_issued`, `refund_requested`, `refund_completed`, `cancel_no_refund`, `kit_collected`, `bib_assigned`, `organizer_event_submitted`, `event_published` | server | as already written (ids and counts only); counters keep only `eventId`, `method` (manual, mobile_money), `mode`, `reason` (closed set), `scope`, `late`, `count` | exist as audit rows; rolled up |
| `result_submitted` (import, manual, run) , `result_verified`, `events_results_released` | server | `source` (csv, manual, api, run), `stage` (provisional, official), `count` | exist under `events_*` names; mapped |
| `events_result_corrected`, `events_dispute_raised` | server | none | exist; mapped |
| `run_saved` | server | `linkType` (evidence, virtual) | new |
| `medal_awarded`, `reward_earned`, `reward_redeemed` | server | `tier` (finisher, podium, other), `rewardType` (certificate, perk) | new |
| `reward_duplicate_blocked` | server | `where` (ledger, redemption, award) | new: the PRD "duplicate-prevention incidents" counter |
| `webhook_delivery_failed`, `webhook_delivery_gave_up` | server | `class` (timeout, dns, tls, blocked, http_4xx, http_5xx) | new (PRD list item); **no URL, host or endpoint id** |
| `waitlist_joined`, `waitlist_offer_made`, `waitlist_offer_converted`, `waitlist_offer_expired`, `waitlist_left`, `waitlist_closed` | server | `reason` for closed (sale_closed, event_cancelled, organizer_closed, admin, other) | new |
| `kit_offline_device_prepared`, `kit_offline_accepted`, `kit_offline_duplicate`, `kit_offline_review`, `kit_offline_rejected`, `kit_offline_invalid_burst` | server | `n` is the increment | new |
| `api_error` | server | `group` (registration, payment, kit, results, rewards, webhook, admin, other), `class` (5xx, 429, 4xx_unexpected) | new counter in the shared route wrapper (**confirmation 10**) |

### 5.4 Mobile wiring

- `EventsAnalytics._record` keeps writing to `debugSink` (existing tests stay valid) **and** hands the call to a new `EventsAnalyticsTransport` when `EventsOptions.analytics.enabled` (from `GET /events/options`, default false so an older server changes nothing).
- The transport applies the allowlist (drops `orderId`, `registrationId`, `totalTzs`, `placesCount` raw values, converting counts to buckets), adds `platform` (android, ios, web), keeps at most 100 events **in memory only**, flushes every 30 seconds, when 10 are queued, and on app pause; one retry, then drop. Never persisted, never sent offline (dropped), never blocks UI, no logging of payloads.
- Waitlist and offline checks on the member side: the saved ticket (QR text included) is already kept by `EventTicketCache` and opens with no signal; S7 adds tests that the QR is shown offline with the "saved copy" line and that the kit chip shows `events.ticket.kit.staleHint` ("Kit status may have changed. Connect to refresh.") when saved more than 5 minutes ago.

### 5.5 Portal: Events health (FitFlex admin, scope `events`; new tab **Health** next to Audit on `/admin/events`)

Purpose: one place to see whether the module is healthy during the pilot and after. Layout: filter bar (period 24 h, 7 days, 30 days; event `Select`), then `MetricCard` groups in a responsive grid (1 column at 375 px, 3 at desktop); every card has a plain-language title, the number, a one-line explanation and a link to the screen that fixes it. Payment cards need scope `payments` (hidden otherwise). Numbers come from tables, not from the counters, wherever the table can answer (counters only for client funnel steps and the S7 events).

| Group | Cards (definition) |
|---|---|
| Funnel | List views, detail views, registration starts, orders created, payments confirmed (counts and the step-to-step ratio; the note "counts of events, not people") |
| Payments (scope `payments`) | Manual payments waiting (count, **oldest age** against the quoted confirmation time `EVENTS_MANUAL_CONFIRM_SLA_HOURS`), rejected, late-payment cases, reconciliation required |
| Refunds | Requested not yet paid (count, oldest age against `EVENTS_REFUND_TARGET_DAYS`), batches running or stuck |
| Webhooks | Pending, failed in 24 h (by class), gave up, endpoints auto-disabled, **oldest pending age** |
| Kit | Collected of confirmed (per event), exceptions, offline desks active, unsent scans reported, **scans to check** |
| Results | Waiting for verification (count, oldest age), open disputes (count, oldest age), releases in period |
| Rewards | Award tasks failed or old, redemptions waiting, duplicate-prevention incidents |
| Waitlist | Entries waiting, offers open, offers bought vs time ran out, promoter last run |
| Jobs | Each event job: last run, outcome, "late" marker when no success in 3 cadences |
| Errors | `api_error` by group and class |
| Setup | Flag states (from the same options the clients read), retention configured yes/no, alert recipients set yes/no, consent text version |

States: loading skeleton per group; a group that fails shows its own error with Retry and the rest stay; empty ("No activity in this period"); flag off for a feature shows "Off" and hides its cards; forbidden (no scope); partial (counters not yet rolled up: "Funnel updates once a day, last at {time}"). Data is read-only. `GET /admin/events/health` (§5.7).

### 5.6 Alerts (D78)

Job `event-health-alert` every 15 minutes evaluates the rules below and emails the addresses in `OPS_ALERT_EMAILS` (existing variable; unset means alerts show only as a banner on the Health tab, the same "off until set" behaviour as the B2B alerts). One email per `(rule, subject)` per 6 hours, subject line prefixed "[FitFlex events]", body lists counts and ids only (no names or contact data) and the runbook number. Thresholds are tied to promises the product already makes (no invented conversion or latency targets); overrides through optional `EVENTS_ALERT_RULES` JSON.

| Rule | Fires when | Severity | Runbook |
|---|---|---|---|
| A1 manual payment overdue | a manual event payment has waited longer than `EVENTS_MANUAL_CONFIRM_SLA_HOURS` (24 h) | high | R6 |
| A2 refund overdue | a refund is unpaid after `EVENTS_REFUND_TARGET_DAYS` (5 working days) | high | R7 |
| A3 reconciliation required | any payment `reconciliation_required` older than 2 h | high | R6 |
| A4 webhook backlog | oldest pending delivery older than 30 min, or an endpoint auto-disabled, or any gave-up in the last hour | medium | R4 |
| A5 job late | an event job with no success in 3 cadences while its flag is on | high | R1 |
| A6 awards stuck | an award task failed, or the oldest task is older than 15 min | medium | R9 |
| A7 waitlist stuck | free capacity and a waiting entry for more than 15 min with promotion allowed | high | R1 |
| A8 offline debt | a desk with unsent scans not heard from for 2 h after the event ended, or scans to check unchecked 24 h after the event ended | medium | R5, R8 |
| A9 invalid-token burst | `kit_offline_invalid_burst` or 20 failed verifications by one staff user in a minute (existing S5 audit rows) | medium | R5 |
| A10 5xx rising | `api_error` 5xx above 20 in 15 min for one group | high | R1 |
| A11 duplicate prevented | `reward_duplicate_blocked` above 0 | medium | R9 |
| A12 dispute aging | an open dispute older than 7 days (the D59 admin threshold) | low | R3 |
| A13 retention not set | `EVENTS_KIT_OFFLINE` or `EVENTS_KIT_OPS` on while retention is unset (daily) | low | checklist C14 |

### 5.7 API contract

- `POST /events/analytics` (member JWT; 404 `feature_disabled` unless `EVENTS_ANALYTICS`): body `{ events: [{ name, props }] }` (at most 20, each `props` at most 8 keys), response 202 `{ accepted, dropped }`; limits 60 requests and 200 events a minute per member; 413 above 4 KB; never stores the caller.
- `GET /admin/events/health?days=1|7|30&eventId=` (admin scope `events`; payment block present only with scope `payments`): `{ generatedAt, rolledUpAt, setup { flags, retentionConfigured, alertsConfigured, consentTextVersion }, funnel[], payments?, refunds, webhooks, kit, results, rewards, waitlist, jobs[], errors[] }`.
- Jobs: `event-analytics-rollup` (hourly for today, nightly for yesterday; cursor makes it safe to rerun), `event-health-alert`, and the purge inside the analytics roll-up (retention days).

---

## 6. D. Hardening carried in from earlier slices

### 6.1 Backend fixes (builder B4; each cites its source in `docs/marathon/follow-ups.md` or the as-built notes; each ships on the flag of the feature it fixes)

| ID | Source | What S7 does | Test |
|---|---|---|---|
| H1 | S5 L2 | Webhook dispatcher: at most `EVENTS_WEBHOOK_PER_HOST_BATCH` (5) deliveries per receiving host per batch, leases released when the batch time budget runs out, so one slow receiver cannot delay other organizers. | spec: slow host plus ten hosts, others deliver on time |
| H2 | S5 L7 | `collectKit` and bib writes: after the transaction commits, notices, analytics and the response re-read cannot throw out of the idempotent wrapper; the stored response is written from the committed result. A retry returns the original 201 with `replayed`, never `already_collected`. | spec: force the notice to throw, retry, same answer |
| H3 | S5 L8 | Outbox retention: rows older than the feed retention (90 days) are deleted in batches of 5,000 whether published or not, inside the existing retention job. | spec: old unpublished rows go, recent ones stay, feed cursor still valid |
| H4 | S5 "redeliver missed events" | `POST /organizer/webhook-endpoints/:id/redeliver { from, to, types? }`, owner only (D42), at most 7 days and 5,000 rows, rate limited, audited; creates fresh delivery rows for outbox rows in range for **that organizer only**. | spec: cross-organizer rows never redelivered |
| H5 | S4 L6 | Cap on concurrent unpaid places per member across events: `EVENTS_MAX_UNPAID_PLACES_PER_USER` (4); 409 `unpaid_places_limit { limit }`; organisation orders exempt; waitlist system orders count and treat the cap as a transient skip (§4.4). | spec: concurrency at the limit |
| H6 | S6 M6, S6 gaps | Per-event reward eligibility: `Event.rewardsEligible boolean NOT NULL DEFAULT false`, set by a FitFlex admin at approval or later (`POST /admin/events/:id/rewards-eligible { eligible, reason, reasonSw? }`, audited, organizer notified); the award engine creates medals as before but **earns rewards only when eligible**. Default false means no event can farm rewards until FitFlex says so. | spec: eligible vs not, ledger unchanged for not |
| H7 | S2 L9 | Hourly job `event-organizer-status-sweep` re-derives each organizer's status from its KYC case through the existing transition primitive and audits every correction; mismatches shown on the Health tab. | spec: failed hook then sweep fixes |
| H8 | S2 L6 | Submit validates `Event.timezone` against the published `GET /events/options.timezones` list. | spec |
| H9 | S3 L6 | Team join by code inside quote and order uses the same lookup limiter as the lookup route. | spec |
| H10 | S6 gap | Admin dispute list: `GET /admin/events/results/disputes?status=open&olderThanDays&organizerStatus&cursor&limit` -> `{ items: [{ id, eventId, eventTitle, organizerName, openedAt, ageDays, status, adminMayResolve (true after 7 days or organizer suspended or inactive, D59) }], nextCursor, counts }`; resolving uses the existing `…/disputes/:disputeId/resolve`. | spec |
| H11 | S6 gap | Admin reward redemptions list: `GET /admin/reward-redemptions?status&cursor&limit` (masked person, reward title, code state, times); no codes. | spec |
| H12 | S6 gap | Correction preview: `POST /organizer/events/:id/results/:resultId/correct/preview` -> `{ rankBefore, rankAfter, othersShifted, medalsAffected }` (counts, no names). | spec |
| H13 | S6 gap | Organizer medal-art take-down read: medal template rows expose `art: { status, takedown?: { reasonCode, at } }` (**NEW if absent, confirmation 12**). | spec |
| H14 | S4 gap | `GET /events/options` gains `payments: { blockedReason: null \| 'second_approver_off' \| 'no_ticket_secret' \| 'flag_off' }` so the portal can say why payments are off. | spec |
| H15 | S4 L-cosmetic, S6 | Job list hides `event-hold-expiry` and other event jobs while `EVENTS_MODULE` is off (runs already record `skipped: flag_off`). | spec |
| H16 | S5 admin | `POST /admin/events/:id/registration-state { state: 'closed' \| 'open', reason (10-300), reasonSw? }` moves `published <-> registration_closed` (existing state machine) for incident response (D85); audited; organizer notified (essential). | spec |
| H17 | Ops | `GET /admin/events/organizers?q&apiAccess&cursor` (id, name, status, `apiAccessEnabled`, active clients, active endpoints) so the Operations tab can find an organizer without a direct API call (**NEW**, confirmation 11). | spec |

### 6.2 Retention and consent (gate for `EVENTS_KIT_OPS`, `EVENTS_KIT_OFFLINE`, roster API and export in production; D79)

- **Consent text rewrite:** the S3 text over-states what is shared and omits kit status and bib (S5 follow-up). The wording is counsel's; S7 delivers a **proposed draft** and bumps `EVENTS_CONSENT_TEXT_VERSION`; `EVENTS_RESULTS_CONSENT_VERSIONS` must list every version that carries the public-results clause. Waitlist entries store the version at joining and use the reconfirm path (§4.3) when it changes.
- **Anonymisation job `event-registration-anonymise`** (daily): with `EVENTS_RETENTION_MONTHS` **unset it does nothing** and the Health tab shows "Retention not configured". When set to N, for events completed, cancelled or archived more than N months ago it clears **contact and sensitive fields only** (phone, email, date of birth, gender, emergency contact, claim token data, team contact) and keeps first name, last initial, bib and results (D55: results are kept and a person can hide their name). A second setting `EVENTS_DELETED_USER_ANONYMISE_DAYS` (unset = off) does the same for registrations whose participant account was deleted, later of that many days and the event end. Every run writes one audit row with counts. N is for counsel and the owner; no period is encoded (D55).
- Offline lists and waitlist stored details follow §3.12 and §4.7 (hours, not months).
- Cross-border transfer position and API terms of use remain unwritten (S5) and are checklist items, not code.

### 6.3 Portal: Admin **Operations** tab (`/admin/events?tab=operations`, scope `events`; closes the S5 "no portal UI for incident controls" follow-up)

Layout: `PageHeader`, tab, then four `Card` sections. Every action asks for a reason (`Textarea`, 10 to 300) and a typed confirmation; every result is a toast plus a row in the audit tab; nothing here changes a server flag (flags are the owner's, in the server settings: the Setup card says so).

1. **Setup (read-only):** flag chips On/Off from the options the apps read, `payments.blockedReason` in words, alert recipients configured, retention configured.
2. **Jobs (read-only):** table Job, Schedule, Last run, Outcome, Late marker.
3. **Organizer integrations:** search box (`GET /admin/events/organizers`), table Organizer, Status, API access (switch), Active clients, Active endpoints, Last failure. Actions: **Enable / Disable API access**, **Revoke all API clients**, **Disable all webhook endpoints**, **Change a client's rate** (number 1 to 600). Dangerous ones (`revoke all`, `disable all`) are `ConfirmDialog` danger with the organizer name typed. After revoke-all the secret-once dialog is not used (nothing is issued); the result lists how many were revoked. Also shown on the admin event view as the small **Integrations** block (counts only, no secrets, no client ids) with a link here.
4. **Event controls:** on the admin event view, **Pause registrations** / **Resume registrations** (H16) and **Rewards eligible** switch (H6), each with reason; here only a link list of events currently paused.

States: loading, error with Retry per card, empty search, forbidden (`events` scope), 404 `feature_disabled` for an action whose flag is off ("Not available because {feature} is off"), suspended organizer rows labelled. Keyboard: all switches and buttons real controls with labels; dialogs trap focus and return it.

### 6.4 Portal: results follow-ups (S6 gaps) and the payments banner

| Item | Where | Behaviour |
|---|---|---|
| Admin dispute list | Admin `/admin/events?tab=disputes` (new tab, or a block on Operations; recommended: a tab) | `DataTable` from H10: Event, Organizer, Opened, Age (days), Status, **May resolve** badge; row opens the existing admin result drawer with the resolve action; filter chips Open, Older than 7 days, Organizer suspended. Empty "No open disputes". |
| Recent redemptions | Admin `/admin/event-rewards` (existing desk) | New **Recent redemptions** table from H11 under the lookup: Reward, Person (masked), State, Claimed, Redeemed; no codes shown. |
| Per-category settings | Organizer Results tab > Settings | Section **Per race settings**: a table of the event's races (Race, Time basis `Select` net or gun, Cut-off minutes, Distance tolerance %) with **Same for all races** at the top (the existing event-level controls stay). Saving sends `PATCH results-settings { categories: [...] }` (backend exists; **confirmation 13**: the settings read must return per-race values). After the first official release only a longer dispute window can change (existing 409 `settings_locked`): fields disable with that explanation. |
| Correction rank preview | Organizer correct dialog | After entering the new time, **Preview effect** shows "Rank changes from {a} to {b}. {n} other runners shift. {m} medals affected." (H12) and the confirm button stays disabled until the preview matches the current revision. |
| Medal art take-down banner | Organizer Results > Medals | When `art.status = taken_down`: danger `Alert` "FitFlex removed your design for {medal}: {reason}. The built-in design is shown instead." with **Upload a new design**. Dismissed only by uploading or replacing. |
| Payments-off banner | Organizer event page and admin event view | When `payments.blockedReason` is set: warning `Alert` in words ("Payments are switched off because two approvers are not turned on yet."), only for roles that can see Finance or admins. |

### 6.5 Items that are checks, not code (tracked in the go-live checklist, owner or release-captain)

Production Node supports the pinned lookup with SNI; `docs/api` ships in the deploy and `PUBLIC_API_URL` is set; forwarded-IP behaviour confirmed; Postgres 15+ confirmed on production (S3 L10, S6); platform logs do not contain ticket or preview tokens in paths (S3 L5); migration order dry-run and the `OutboxEvent.seq` rewrite window (S4, S5); `EVENT_TICKET_SECRET`, key id and previous-secret rotation covers the derived perk-code key (S6); env list added to `docs/server-env-checklist.md`; native Swahili review and glossary additions (token, secret, signing secret, client ID, bib, export/import, roster, rotate/revoke, kit desk, exception status; "mteja" clash; "Anwani" for two concepts; and the S7 additions in §10.4); counsel review of consent, API terms, rights-confirmation text and retention; faces-in-medal-art policy; owner review of `organizer-api-auth.mjs` (D35).

---

## 7. E. Shared

### 7.1 Flags and options

| Flag | Gates |
|---|---|
| `EVENTS_KIT_OFFLINE` | all `/kit-offline/*` routes, admin read and revoke, the offline desk entry points (`ops.kitOffline`), the device purge job |
| `EVENTS_WAITLIST` | all waitlist routes, the ticket-type `waitlist` field, the queue gate, availability-while-queued, promote and purge jobs, mobile waitlist UI |
| `EVENTS_ANALYTICS` | `POST /events/analytics`, mobile transport, roll-up, health and alert jobs, Health tab. |

All three need `EVENTS_MODULE` and `EVENTS_REGISTRATION`; `EVENTS_KIT_OFFLINE` also needs `EVENTS_KIT_OPS`. Guards `requireEventsKitOffline`, `requireEventsWaitlist`, `requireEventsAnalytics` in `feature-flags.mjs`: 404 `feature_disabled`. Chain for switching on: `EVENTS_ANALYTICS` first (so the pilot is observable), then `EVENTS_KIT_OFFLINE` and `EVENTS_WAITLIST` independently. `GET /events/options` gains `ops.kitOffline` (false unless the ticket secret is usable), `waitlist { enabled, offerHours, maxActivePerUser }`, `analytics { enabled }`, `payments { blockedReason }`. Portal reads `useEventsOptions()`; mobile reads `EventsOptions`; an older server without the blocks changes nothing. Hardening fixes H1 to H17 ride on existing flags (H6 on `EVENTS_REWARDS`, H10 to H13 on `EVENTS_RESULTS`, H1 and H4 on `EVENTS_WEBHOOKS`, H5, H8, H9, H14 on `EVENTS_REGISTRATION`/`EVENTS_MODULE`, H16 on `EVENTS_MODULE`).

### 7.2 Environment (add all to `docs/server-env-checklist.md` before enabling; defaults in parentheses)

Offline: `EVENTS_OFFLINE_SESSION_HOURS` (36), `EVENTS_OFFLINE_MAX_DEVICES` (10), `EVENTS_OFFLINE_MAX_PER_USER` (2), `EVENTS_OFFLINE_MAX_ROWS` (20000), `EVENTS_OFFLINE_SYNC_BATCH` (200), `EVENTS_OFFLINE_MAX_PENDING` (2000, sent to the desk in `limits`), `EVENTS_OFFLINE_CLOCK_TOLERANCE_SECONDS` (300), `EVENTS_OFFLINE_MIN_DESK_BUILD` (unset), `EVENTS_OFFLINE_SCAN_KEEP_DAYS` (180).
Waitlist: `EVENTS_WAITLIST_OFFER_HOURS` (12), `EVENTS_WAITLIST_MIN_OFFER_MINUTES` (120), `EVENTS_WAITLIST_MAX_ACTIVE_PER_USER` (5), `EVENTS_WAITLIST_MAX_QUEUE` (500), `EVENTS_WAITLIST_MAX_LAPSES` (2), `EVENTS_WAITLIST_QUIET_HOURS` (`21-7`, event timezone; `off` disables), `EVENTS_WAITLIST_KEEP_DAYS` (90).
Analytics and alerts: `EVENTS_ANALYTICS_KEEP_DAYS` (730), `EVENTS_ALERT_RULES` (optional JSON overrides), existing `OPS_ALERT_EMAILS`.
Hardening: `EVENTS_WEBHOOK_PER_HOST_BATCH` (5), `EVENTS_MAX_UNPAID_PLACES_PER_USER` (4), `EVENTS_RETENTION_MONTHS` (unset), `EVENTS_DELETED_USER_ANONYMISE_DAYS` (unset).
Existing and required for the pilot: `EVENT_TICKET_SECRET`, `EVENT_TICKET_KEY_ID`, `EVENT_TICKET_SECRET_PREVIOUS`, `EVENTS_WEBHOOK_SECRET_KEY`, `JWT_SECRET` (non-dev), `PUBLIC_API_URL`, `OPS_ALERT_EMAILS`, `MONEY_SECOND_APPROVER` (D32). Invalid values fail closed to the default and report only `invalid_config`, never the variable name (S3 review L8).

### 7.3 Migrations (additive; sort after the highest existing timestamp at branch time, currently `20270131090200`; all with `down` that **fails closed once S7 data exists**; dry-run on a fresh isolated database and take a backup before production; confirmation 14)

1. `20270201090000-events-kit-offline-s7.cjs`
   - `EventKitOfflineDevice`: `id` (`ekd_` + 16 hex), `eventId`, `organizerId`, `staffUserId` (FK User RESTRICT), `label text CHECK char_length 1..40`, `clientKind text CHECK IN ('web')`, `status text CHECK IN ('active','revoked','expired')`, `issuedAt`, `expiresAt`, `revokedAt`, `revokedBy`, `revokeReason`, `lastSyncAt`, `lastHeartbeatAt`, `pendingReported int`, `discardedReported int`, `snapshotSeq bigint`, `snapshotTakenAt`, `snapshotRows int`, `deskBuild text`, `createdAt/updatedAt`; composite FK `(eventId, organizerId)` to `Event`; index `(eventId, status)`; partial index `(staffUserId, eventId) WHERE status = 'active'`; CHECK `(status = 'revoked') = (revokedAt IS NOT NULL)`.
   - `EventKitOfflineScan`: `id` (`eks_`), `eventId`, `deviceId` (FK RESTRICT), `clientRef text` (uuid), `batchId text`, `method text CHECK IN ('scan','manual')`, `registrationId text NULL` (composite FK to `EventRegistration (id, eventId)`), `outcome text CHECK` (the §3.6 set), `collectionId text NULL` (FK `EventKitCollection`), `winnerCollectionId text NULL`, `manualReason`, `claimedAt`, `correctedAt`, `receivedAt`, `clockOffsetMs int`, `flags jsonb` (`clock_adjusted`, warnings), `outcomeOnDevice text`, `reviewStatus text CHECK IN ('none','needs_review','checked')`, `checkedBy`, `checkedAt`, `note text CHECK <= 300`; **unique `(deviceId, clientRef)`**; indexes `(eventId, reviewStatus)`, `(registrationId)`. No token, no hash, no payload text is stored (the payload is resolved and discarded).
   - `EventKitCollection`: widen `eventkitcollection_method_check` to `scan | manual | api | offline`; the S5 `manual` CHECK is unchanged; `offlineBatchId` (exists) is set for offline rows.
2. `20270201090100-events-waitlist-s7.cjs`: `Event.waitlistEnabled boolean NOT NULL DEFAULT true`, `Event.waitlistClosedAt`; `EventWaitlistEntry` (PRD §7 fields, made concrete): `id` (`ewl_`), `eventId`, `categoryId`, `ticketTypeId` (composite FK `(ticketTypeId, eventId)`), `userId` (FK User **ON DELETE CASCADE**), `seq bigint GENERATED ALWAYS AS IDENTITY`, `status CHECK` (§4.3 set), `quantity smallint NOT NULL DEFAULT 1 CHECK (quantity = 1)`, `intent jsonb NULL`, `consentTextVersion`, `contactKey text` (sha256 of normalised phone or email), `blockedReason CHECK IS NULL OR = 'reconsent'`, `skipCount smallint DEFAULT 0`, `joinedAt`, `offeredAt`, `offerExpiresAt`, `remindedAt`, `orderId` (FK `EventOrder` ON DELETE SET NULL), `endedAt`, `endedReason CHECK` closed set, `createdAt/updatedAt`; **partial unique `(userId, ticketTypeId) WHERE status IN ('waiting','offered')`**, **partial unique `(ticketTypeId, contactKey) WHERE status IN ('waiting','offered')`**, index `(ticketTypeId, status, seq)`, CHECKs `(status = 'offered') = (offeredAt IS NOT NULL AND orderId IS NOT NULL)` while offered, `endedAt` set iff final.
3. `20270201090200-events-analytics-s7.cjs`: `EventAnalyticsDaily` (`day date`, `name text`, `eventId text NULL`, `dimsKey text`, `dims jsonb`, `count bigint CHECK >= 0`; unique on `(day, name, COALESCE(eventId,''), dimsKey)`; index `(name, day)`); `AnalyticsRollupCursor` (`name` primary, `lastAt`, `lastId`).
4. `20270201090300-events-hardening-s7.cjs`: `Event.rewardsEligible boolean NOT NULL DEFAULT false`; `OutboxEvent (createdAt)` index for the purge if absent; no other change.

### 7.4 Jobs (existing ops framework: advisory lock, `JobRun`, `runJob(name)`, flag-gated, `quiet: true`)

`event-waitlist-promote` (every minute), `event-waitlist-purge` (daily 23:15 UTC), `event-kit-offline-purge` (daily 23:30 UTC: marks desks `expired`, deletes scans older than the keep days), `event-analytics-rollup` (hourly), `event-health-alert` (every 15 minutes), `event-organizer-status-sweep` (hourly), `event-registration-anonymise` (daily 01:10 UTC; no-op until configured).

### 7.5 Audit events (`AuditLog`, actor and requestId, no tokens, no contact data, no payloads)

`events.kit_offline_device_prepared`, `…_device_revoked`, `…_snapshot`, `…_synced`, `…_checked`, `…_invalid_burst`; `events.waitlist_joined`, `…_offered`, `…_left`, `…_removed`, `…_closed`, `…_organizer_toggled`; `events.admin_registration_state_changed`, `events.rewards_eligible_changed`, `events.webhook_redelivery_requested`, `events.organizer_status_corrected`, `events.registration_anonymised { events, rows }`, `events.alerts_sent`.

---

## 8. Consolidated new and changed endpoints (for `contract-checker`)

| Area | New | Changed (additive) |
|---|---|---|
| Offline | `POST/GET /organizer/events/:id/kit-offline/devices`, `…/devices/:deviceId/revoke`, `GET …/snapshot`, `POST …/heartbeat`, `POST …/sync`, `GET …/review`, `POST …/review/:scanId/check`, admin `GET/POST /admin/events/:id/kit-offline…` | `GET /organizer/events/:id/kit/summary` (`offline`), `GET /events/options` (`ops.kitOffline`) |
| Waitlist | `POST /me/events/:id/waitlist`, `GET /me/event-waitlist`, `DELETE /me/event-waitlist/:id`, `POST …/reconfirm`, `GET/PATCH /organizer/events/:id/waitlist`, `POST …/waitlist/close`, `GET /admin/events/:id/waitlist`, `POST …/waitlist/:entryId/remove` | `GET /events/:id` (ticket type `waitlist`, event `waitlist`), `GET /events/options`, `GET /me/event-orders` (`source`), `POST` order create (409 `waitlist_active`, 409 `unpaid_places_limit`) |
| Analytics | `POST /events/analytics`, `GET /admin/events/health` | `GET /events/options` (`analytics`) |
| Hardening | `POST /organizer/webhook-endpoints/:id/redeliver`, `POST /admin/events/:id/rewards-eligible`, `GET /admin/events/results/disputes`, `GET /admin/reward-redemptions`, `POST /organizer/events/:id/results/:resultId/correct/preview`, `POST /admin/events/:id/registration-state`, `GET /admin/events/organizers` | `GET /events/options` (`payments.blockedReason`), medal template rows (`art.takedown`), event submit (timezone validation 422), `GET /admin/events/:id` (`rewardsEligible`, `waitlist` counts) |

---

## 9. Rule 6 callout list (owner reviews, D35)

**New under `src/auth/*`: none.** The offline desk uses the staff member's existing session; the desk registry is a table, not a credential. `src/auth/jwt.mjs`, `events-authz.mjs`, `org-authz.mjs`, `organizer-api-auth.mjs`, `qr-token.mjs`, `route-guard.mjs`, `functions/checkins.mjs`, `constants.mjs`, the payout engine, pricing constants, `payment-product.mjs`, `admin-payment-service.mjs`, `mobile-money-service.mjs`, `refund-service.mjs` are **not modified** (spec-checked by a "files not touched" list in the PR).

| # | Area | What and why it is rule 6 | Files (proposed) |
|---|---|---|---|
| 1 | Event-day entry logic | A second writer of `EventKitCollection` (method `offline`) with its own trust model; reviewer reads §3.9, §3.10 and §3.7 against the code. | `src/services/events-kit-offline-service.mjs`, `functions/events-kit-offline.mjs`, migration 1, `src/services/events-ops-service.mjs` (H2 only) |
| 2 | Credential-adjacent data on devices | Ticket-token hashes, masked names and bibs downloaded to staff devices; encryption at rest; wipe rules. | snapshot builder in the same service; portal `kit-desk-offline/*` |
| 3 | Order creation by a system actor (inventory and money adjacent) | The promoter calls the registration service's create-order function; the gate adds a 409 to existing order creation for queued ticket types; per-member unpaid cap. No store primitive, payment code or ledger rule changes. | `src/services/events-registration-service.mjs`, `events-waitlist-service.mjs`, `src/shared/events-document.mjs` (availability), `events-discovery-service.mjs` |
| 4 | Payment hold behaviour for waitlist orders | Default: unchanged (D26 extension applies). **Only if D73 alternative is chosen** does `extendHold` in `event-money-store-pg.mjs` change (a lower cap for waitlist-origin orders) and the payment-code review (S4 area) is repeated. | none by default |
| 5 | Analytics ingestion | New authenticated endpoint that accepts client-supplied data into a table; privacy design in §5.2. | `events-analytics-service.mjs`, `functions/events-analytics.mjs`, migration 3 |
| 6 | Retention and anonymisation | Job that rewrites participant personal data; ships unset. | `events-retention-service.mjs` (name proposed), job registration |
| 7 | Rewards | Award engine gate by `Event.rewardsEligible` (value-bearing path; FitFlex-funded digital only, D45). | `src/services/events-award-service.mjs`, `events-admin-service.mjs`, migration 4 |
| 8 | Outbound network and outbox | Webhook batch fairness (H1), redelivery (H4), outbox purge (H3). | `src/services/events-webhook-service.mjs`, retention job |
| 9 | Admin incident powers | Pause registrations (H16), revoke all, disable all, API access, rate change surfaced in a UI. | `events-admin-service.mjs`, portal `admin-events-ops.tsx` |
| 10 | Browser persistence and service worker | First service worker and first encrypted IndexedDB in the portal; scope limited to one route. | portal `public/organizer/kit-desk/sw.js`, `firebase.json` header |
| 11 | Existing response shapes | Additive fields listed in §8; one new 409 on order creation; one new 422 on submit. | as §8 |

---

## 10. Copy: i18n keys (EN and SW draft; native review needed)

Rules: every string goes through `t()` (portal, both maps in `src/lib/i18n.ts` or the events file) or `context.tr()` (mobile, both maps in `lib/shared/i18n.dart`, parity test); server notices are inline `{en, sw}`. Words and numbers in braces are placeholders and must not be translated. Times use the 12-hour clock with day part in Swahili (glossary: "2:05 mchana"); money shows "TSh". Where a key already exists in S5 or S6 it is reused, not redefined.

### 10.1 Portal

**Offline desk (`organizer.kitOffline.*`)**

| Key | EN | SW |
|---|---|---|
| `title` | Kit desk without internet | Dawati la vifaa vya mbio bila intaneti |
| `entry` | Use the offline desk | Tumia dawati la bila intaneti |
| `prepare.title` | Prepare this desk | Andaa dawati hili |
| `prepare.body` | Download this event's ticket list so you can scan without internet. It stays on this phone or computer for up to {hours} hours and is deleted when you sign out. | Pakua orodha ya tiketi za tukio hili ili uweze kuskani bila intaneti. Inabaki kwenye simu au kompyuta hii hadi saa {hours} na hufutwa ukitoka. |
| `prepare.name` | Desk name | Jina la dawati |
| `prepare.nameHint` | For example: Gate 2 or Phone A | Mfano: Mlango 2 au Simu A |
| `prepare.point` | Collection point | Mahali pa kuchukua vifaa vya mbio |
| `prepare.category` | Race | Aina ya mbio |
| `prepare.button` | Download ticket list | Pakua orodha ya tiketi |
| `prepare.progress` | Downloading {done} of {total} | Inapakua {done} kati ya {total} |
| `prepare.done` | Ready. {count} tickets saved at {time}. | Tayari. Tiketi {count} zimehifadhiwa saa {time}. |
| `prepare.tooLarge` | This event has too many tickets for one list. Choose a race. | Tukio hili lina tiketi nyingi mno kwa orodha moja. Chagua aina ya mbio. |
| `prepare.limit` | This event already has {max} desks. Ask an owner to remove one. | Tukio hili tayari lina madawati {max}. Mwombe mmiliki aondoe moja. |
| `prepare.hint` | Open this page once with internet before the event so it works without internet. | Fungua ukurasa huu mara moja ukiwa na intaneti kabla ya tukio ili ufanye kazi bila intaneti. |
| `prepare.ready` | Works without internet | Inafanya kazi bila intaneti |
| `prepare.storage` | This browser may delete saved data when storage runs low. | Kivinjari hiki kinaweza kufuta data iliyohifadhiwa kikiishiwa uhifadhi. |
| `prepare.blocked` | This browser is not allowing saved data (private window?). Use the online desk instead. | Kivinjari hiki hakiruhusu kuhifadhi data (dirisha la faragha?). Tumia dawati la mtandaoni badala yake. |
| `mode.online` | Online | Mtandaoni |
| `mode.offline` | No internet | Hakuna intaneti |
| `mode.weak` | Weak signal, using the saved list | Mawimbi hafifu, inatumia orodha iliyohifadhiwa |
| `mode.sending` | Sending | Inatuma |
| `banner.offline` | No internet. Scans are saved on this desk and are not final until they are sent. | Hakuna intaneti. Skani zinahifadhiwa kwenye dawati hili na si za mwisho hadi zitumwe. |
| `banner.s5` (replaces the S5 "not available yet" text when `ops.kitOffline`) | You are offline. Scanning here needs a connection. Use the offline desk to scan from a saved list. | Hakuna intaneti. Kuskani hapa kunahitaji intaneti. Tumia dawati la bila intaneti kuskani kwa orodha iliyohifadhiwa. |
| `list.from` | List saved {time} | Orodha ilihifadhiwa {time} |
| `list.expired` | This desk's list has expired. Connect to the internet to update it. | Orodha ya dawati hili imeisha muda. Unganisha intaneti ili kuisasisha. |
| `pending.count` | {n} waiting to be sent | {n} zinasubiri kutumwa |
| `pending.oldest` | Oldest: {time} | Ya zamani zaidi: {time} |
| `send.now` | Send now | Tuma sasa |
| `send.progress` | Sending {done} of {total} | Inatuma {done} kati ya {total} |
| `send.done` | {accepted} confirmed, {review} need a check. | {accepted} zimethibitishwa, {review} zinahitaji kukaguliwa. |
| `send.failed` | Couldn't send. We will try again. | Imeshindikana kutuma. Tutajaribu tena. |
| `clock.title` | The clock on this desk looks wrong | Saa ya dawati hili inaonekana si sahihi |
| `clock.body` | Set the correct date and time, then try again. Sending still works. | Weka tarehe na saa sahihi, kisha jaribu tena. Kutuma bado kunafanya kazi. |
| `result.valid` | Ready for kit (from saved list) | Tayari kupewa vifaa vya mbio (kutoka orodha iliyohifadhiwa) |
| `result.handOver` | Hand over kit | Toa vifaa vya mbio |
| `result.saved` | Saved, not final | Imehifadhiwa, si ya mwisho |
| `result.savedBody` | Kit handover for {name} is saved on this desk. It becomes final when it is sent. | Utoaji wa vifaa vya mbio kwa {name} umehifadhiwa kwenye dawati hili. Utakuwa wa mwisho ukitumwa. |
| `result.unknown` | Not on this desk's list | Haipo kwenye orodha ya dawati hili |
| `result.unknownBody` | This ticket may have been bought after the list was saved. Connect to the internet and scan again. | Tiketi hii huenda ilinunuliwa baada ya orodha kuhifadhiwa. Unganisha intaneti kisha skani tena. |
| `result.revoked` | Ticket cancelled (as of {time}) | Tiketi imeghairiwa (kufikia {time}) |
| `result.already` | Kit already collected ({time}) | Vifaa vya mbio vimeshachukuliwa ({time}) |
| `result.alreadyHere` | Already scanned on this desk at {time} | Imeshaskaniwa kwenye dawati hili saa {time} |
| `result.noOverride` | Overrides need internet. Ask an owner or admin. | Kubatilisha kunahitaji intaneti. Mwombe mmiliki au msimamizi. |
| `result.noBib` | No bib yet. Give the kit; the bib is added later. | Bado hakuna namba ya mbio. Mpe vifaa; namba itaongezwa baadaye. |
| `manual.title` | Hand over without a ticket code | Toa bila msimbo wa tiketi |
| `manual.search` | Find a participant in the saved list | Tafuta mshiriki kwenye orodha iliyohifadhiwa |
| `manual.idCheck` | I checked their photo ID | Nimekagua kitambulisho chenye picha |
| `manual.reason.phone_lost` / `no_signal` / `screen_damaged` / `other` | Phone lost / No internet / Screen damaged / Other | Simu imepotea / Hakuna intaneti / Skrini imeharibika / Nyingine |
| `review.title` | Offline scans to check | Skani za bila intaneti za kukaguliwa |
| `review.empty` | Nothing to check. | Hakuna cha kukagua. |
| `review.duplicate` | The kit was already collected | Vifaa vya mbio vilikuwa vimeshachukuliwa |
| `review.revoked` | The ticket was cancelled after the list was saved | Tiketi ilighairiwa baada ya orodha kuhifadhiwa |
| `review.closed` | The event was closed when this was sent | Tukio lilikuwa limefungwa wakati hii inatumwa |
| `review.afterRevoke` | Scanned after this desk was removed | Iliskaniwa baada ya dawati hili kuondolewa |
| `review.suspended` | The organizer was suspended when this was sent | Mwandaaji alikuwa amesimamishwa wakati hii inatumwa |
| `review.check` | Mark as checked | Weka kama imekaguliwa |
| `review.note` | Note | Maelezo |
| `review.noteRequired` | Add a note (10 to 300 characters). | Ongeza maelezo (herufi 10 hadi 300). |
| `review.askOwner` | Ask an owner or admin to check this. | Mwombe mmiliki au msimamizi akague hili. |
| `devices.title` | Offline desks | Madawati ya bila intaneti |
| `devices.empty` | No offline desks yet. | Bado hakuna madawati ya bila intaneti. |
| `devices.col.desk` / `staff` / `status` / `lastSent` / `unsent` / `rows` / `build` | Desk / Staff / Status / Last sent / Unsent (last report) / List size / Version | Dawati / Mfanyakazi / Hali / Mara ya mwisho kutuma / Hazijatumwa (ripoti ya mwisho) / Ukubwa wa orodha / Toleo |
| `devices.status.active` / `revoked` / `expired` | Active / Removed / Expired | Inatumika / Imeondolewa / Imeisha muda |
| `devices.remove` | Remove desk | Ondoa dawati |
| `devices.removeBody` | This desk will stop scanning. It can still send what it saved. | Dawati hili litaacha kuskani. Bado linaweza kutuma ilichohifadhi. |
| `devices.removeReason` | Reason (10 to 300 characters) | Sababu (herufi 10 hadi 300) |
| `removed.banner` | This desk was removed. Send your saved scans, then the list will be deleted. | Dawati hili limeondolewa. Tuma skani ulizohifadhi, kisha orodha itafutwa. |
| `update.banner` / `update.button` | A new version is needed. / Refresh | Toleo jipya linahitajika. / Onyesha upya |
| `wipe.link` | Remove saved list from this desk | Futa orodha iliyohifadhiwa kwenye dawati hili |
| `discard.title` | Discard unsent scans? | Futa skani ambazo hazijatumwa? |
| `discard.body` | Type {n} to discard {n} unsent scans. The owner will see that scans were discarded. | Andika {n} ili kufuta skani {n} ambazo hazijatumwa. Mmiliki ataona kuwa skani zilifutwa. |
| `signedAs` | Signed in as {name} (saved) | Umeingia kama {name} (imehifadhiwa) |

**Waitlist, organizer and admin (`organizer.waitlist.*`, `admin.events.waitlist.*`)**

| Key | EN | SW |
|---|---|---|
| `title` | Waitlist | Orodha ya kusubiri |
| `toggle` | Accept new waitlist sign-ups | Pokea wanaojiunga na orodha ya kusubiri |
| `note` | You see counts only. People are offered a ticket in the order they joined. | Unaona idadi tu. Watu hupewa tiketi kwa mpangilio waliojiunga. |
| `col.waiting` / `offered` / `converted` / `expired` / `left` | Waiting / Tickets held / Bought / Time ran out / Left | Wanasubiri / Tiketi zilizoshikiliwa / Zilizonunuliwa / Muda uliisha / Walioondoka |
| `empty` | Nobody is waiting. | Hakuna anayesubiri. |
| `close` | Close waitlist | Funga orodha ya kusubiri |
| `closeBody` | This ends the line and tells everyone waiting. It can't be undone. | Hii inamaliza orodha na kuwajulisha wote wanaosubiri. Haiwezi kutenguliwa. |
| `closeTyped` | Type CLOSE to confirm | Andika FUNGA ili kuthibitisha |
| `closedAt` | Waitlist closed {time} | Orodha ilifungwa {time} |
| `admin.remove` | Remove from waitlist | Ondoa kwenye orodha ya kusubiri |
| `admin.reason` / `admin.reasonSw` | Reason (10 to 300 characters) / Reason in Swahili (optional, shown to the person) | Sababu (herufi 10 hadi 300) / Sababu kwa Kiswahili (si lazima, inaonyeshwa kwa mtu) |

**Admin Health and Operations (`admin.events.health.*`, `admin.events.ops.*`)**

| Key | EN | SW |
|---|---|---|
| `health.tab` / `ops.tab` / `disputes.tab` | Health / Operations / Result questions | Hali ya mfumo / Uendeshaji / Maswali kuhusu matokeo |
| `health.period.1` / `7` / `30` | Last 24 hours / Last 7 days / Last 30 days | Saa 24 zilizopita / Siku 7 zilizopita / Siku 30 zilizopita |
| `health.countsNote` | These are counts of events, not people. | Hizi ni idadi ya matukio, si watu. |
| `health.updated` | Updated {time} | Imesasishwa {time} |
| `health.group.funnel` / `payments` / `refunds` / `webhooks` / `kit` / `results` / `rewards` / `waitlist` / `jobs` / `errors` / `setup` | From browsing to paying / Payments / Refunds / Webhooks / Kit collection / Results / Rewards / Waitlist / Background jobs / Errors / Setup | Kutoka kutazama hadi kulipa / Malipo / Marejesho / Webhooks / Kuchukua vifaa vya mbio / Matokeo / Zawadi / Orodha ya kusubiri / Kazi za usuli / Hitilafu / Mipangilio |
| `health.oldest` | Oldest: {age} | Ya zamani zaidi: {age} |
| `health.late` | Late | Imechelewa |
| `health.notConfigured` | Not configured | Haijawekwa |
| `health.on` / `off` | On | Imewashwa / Imezimwa |
| `health.empty` | No activity in this period. | Hakuna shughuli katika kipindi hiki. |
| `health.alertsOff` | Alert emails are off because no recipients are set. | Barua pepe za tahadhari zimezimwa kwa sababu hakuna wapokeaji waliowekwa. |
| `ops.setupNote` | Feature switches are changed in the server settings by the owner, not here. | Swichi za vipengele hubadilishwa kwenye mipangilio ya seva na mmiliki, si hapa. |
| `ops.orgs.title` | Organizer integrations | Miunganisho ya waandaaji |
| `ops.apiOn` / `apiOff` | Turn on API access / Turn off API access | Washa ufikiaji wa API / Zima ufikiaji wa API |
| `ops.revokeAll` | Revoke all API clients | Batilisha wateja wote wa API |
| `ops.disableAll` | Turn off all webhooks | Zima webhook zote |
| `ops.rate` | Rate limit (requests per minute) | Kikomo cha maombi (kwa dakika) |
| `ops.reason` / `reasonSw` | Reason (10 to 300 characters) / Reason in Swahili (optional, shown to the organizer) | Sababu (herufi 10 hadi 300) / Sababu kwa Kiswahili (si lazima, inaonyeshwa kwa mwandaaji) |
| `ops.typeName` | Type the organizer name to confirm | Andika jina la mwandaaji ili kuthibitisha |
| `ops.pause` / `resume` | Pause registrations / Resume registrations | Sitisha usajili / Endelea na usajili |
| `ops.pauseBody` | New sign-ups and orders stop. People who already paid are not affected. The organizer is told. | Usajili mpya na oda mpya zinasimama. Waliolipa tayari hawaathiriwi. Mwandaaji ataarifiwa. |
| `ops.rewards.title` / `switch` / `help` | Rewards for this event / Allow rewards / Medals are always given. Rewards are given only when this is on. | Zawadi kwa tukio hili / Ruhusu zawadi / Medali hutolewa daima. Zawadi hutolewa tu hili likiwa limewashwa. |
| `disputes.mayResolve` | May resolve | Unaweza kuyatatua |
| `disputes.chip.open` / `old` / `suspended` | Open / Older than 7 days / Organizer suspended | Yaliyo wazi / Zaidi ya siku 7 / Mwandaaji amesimamishwa |
| `disputes.empty` | No open questions. | Hakuna maswali yaliyo wazi. |
| `redemptions.title` | Recent redemptions | Zawadi zilizodaiwa hivi karibuni |

**Results follow-ups and payments banner**

| Key | EN | SW |
|---|---|---|
| `organizer.results.perRace.title` | Per race settings | Mipangilio kwa kila aina ya mbio |
| `organizer.results.perRace.same` | Same for all races | Sawa kwa aina zote za mbio |
| `organizer.results.perRace.locked` | These can't change after the official release, except a longer time to ask. | Haya hayawezi kubadilishwa baada ya kutolewa rasmi, isipokuwa muda mrefu zaidi wa kuuliza. |
| `organizer.results.preview.button` | Preview effect | Angalia athari |
| `organizer.results.preview.body` | Rank changes from {a} to {b}. {n} other runners shift. {m} medals affected. | Cheo kinabadilika kutoka {a} hadi {b}. Wakimbiaji wengine {n} wanabadilika. Medali {m} zinaathirika. |
| `organizer.medals.takedown` | FitFlex removed your design for {medal}: {reason}. The built-in design is shown instead. | FitFlex imeondoa muundo wako wa {medal}: {reason}. Muundo uliopo ndani ya app unaonyeshwa badala yake. |
| `organizer.medals.uploadNew` | Upload a new design | Pakia muundo mpya |
| `events.payments.blocked.second_approver_off` | Payments are off because two approvers are not turned on yet. | Malipo yamezimwa kwa sababu waidhinishaji wawili bado hawajawashwa. |
| `events.payments.blocked.no_ticket_secret` | Payments are off until the ticket key is set. | Malipo yamezimwa hadi ufunguo wa tiketi uwekwe. |
| `events.payments.blocked.flag_off` | Payments are not open yet. | Malipo bado hayajafunguliwa. |

### 10.2 Mobile (`lib/shared/i18n.dart`, both maps, parity test)

| Key | EN | SW |
|---|---|---|
| `events.waitlist.cta.join` | Join waitlist | Jiunge na orodha ya kusubiri |
| `events.waitlist.cta.hint` | No payment now. We will tell you if a ticket becomes available. | Hakuna malipo sasa. Tutakuambia tiketi ikipatikana. |
| `events.waitlist.cta.joined` | On the waitlist | Uko kwenye orodha ya kusubiri |
| `events.waitlist.join.title` | Join the waitlist | Jiunge na orodha ya kusubiri |
| `events.waitlist.join.rules` | Waiting is free. If a ticket opens up, we hold it for you for {hours} hours and you pay as usual. Tickets are offered in the order people joined. | Kusubiri ni bure. Tiketi ikipatikana, tutakushikilia kwa saa {hours} nawe utalipa kama kawaida. Tiketi hutolewa kwa mpangilio wa waliojiunga. |
| `events.waitlist.join.one` | One ticket per person, for you only. | Tiketi moja kwa mtu, kwa ajili yako tu. |
| `events.waitlist.join.price` | Price today: {amount} | Bei ya leo: {amount} |
| `events.waitlist.join.button` | Join waitlist | Jiunge na orodha ya kusubiri |
| `events.waitlist.join.busy` | Joining... | Inajiunga... |
| `events.waitlist.joined.title` | You're on the waitlist | Uko kwenye orodha ya kusubiri |
| `events.waitlist.joined.position` | Your number on the list: {n} | Namba yako kwenye orodha: {n} |
| `events.waitlist.joined.body` | We will send a notification if a ticket is held for you. Keep notifications on. | Tutakutumia arifa ikiwa tiketi imeshikiliwa kwa ajili yako. Acha arifa zikiwa zimewashwa. |
| `events.waitlist.joined.view` / `back` | View my waitlist / Back to event | Tazama orodha yangu / Rudi kwenye tukio |
| `events.waitlist.status.waiting` / `offered` / `converted` / `expired` / `declined` / `left` / `removed` / `closed` | Waiting / Ticket held for you / Ticket bought / Time ran out / You gave it up / You left the list / Removed by FitFlex / Waitlist closed | Inasubiri / Tiketi imeshikiliwa kwa ajili yako / Tiketi imenunuliwa / Muda umeisha / Uliiachia / Uliondoka kwenye orodha / Imeondolewa na FitFlex / Orodha imefungwa |
| `events.waitlist.offer.title` | A ticket is held for you | Tiketi imeshikiliwa kwa ajili yako |
| `events.waitlist.offer.body` | Pay before {time} or it goes to the next person. | Lipa kabla ya {time} la sivyo itapewa mtu anayefuata. |
| `events.waitlist.offer.pay` | Pay now | Lipa sasa |
| `events.waitlist.offer.chip` | From the waitlist | Kutoka orodha ya kusubiri |
| `events.waitlist.offer.passed` | Your turn passed. If you already paid, we will refund you. | Zamu yako imepita. Ikiwa ulishalipa, tutakurejeshea pesa. |
| `events.waitlist.leave.button` | Leave waitlist | Ondoka kwenye orodha |
| `events.waitlist.leave.title` / `body` | Leave the waitlist? / You will lose your number on the list. You can join again, at the end. | Kuondoka kwenye orodha? / Utapoteza namba yako kwenye orodha. Unaweza kujiunga tena, mwishoni. |
| `events.waitlist.leave.offeredBody` | This gives up your held ticket. Nothing has been charged. | Hii inaachia tiketi yako iliyoshikiliwa. Hakuna kilichotozwa. |
| `events.waitlist.error.not_sold_out` | Tickets are available now. Register instead. | Tiketi zinapatikana sasa. Jisajili badala yake. |
| `events.waitlist.error.already_registered` | You already have a ticket in this race. | Tayari una tiketi katika aina hii ya mbio. |
| `events.waitlist.error.full` | The waitlist is full. | Orodha ya kusubiri imejaa. |
| `events.waitlist.error.lapse_limit` | You gave up too many held tickets for this event, so you can't rejoin. | Umeacha tiketi nyingi zilizoshikiliwa kwa tukio hili, kwa hivyo huwezi kujiunga tena. |
| `events.waitlist.error.limit` | You are on the most waitlists allowed. | Uko kwenye idadi ya juu ya orodha zinazoruhusiwa. |
| `events.waitlist.error.verification` | Verify your phone number or email to join. | Thibitisha namba yako ya simu au barua pepe ili ujiunge. |
| `events.waitlist.error.unavailable` | The waitlist isn't open right now. | Orodha ya kusubiri haijafunguliwa kwa sasa. |
| `events.waitlist.error.payment_pending` | A payment is waiting for confirmation. Cancel the order instead. | Malipo yanasubiri uthibitisho. Ghairi oda badala yake. |
| `events.waitlist.error.rate` | Too many tries. Wait a little and try again. | Majaribio mengi mno. Subiri kidogo kisha jaribu tena. |
| `events.waitlist.offline` | No internet. You need a connection to join or leave. | Hakuna intaneti. Unahitaji intaneti ili ujiunge au uondoke. |
| `events.waitlist.reconfirm.banner` | The terms changed. Review them to stay on the list. | Vigezo vimebadilika. Vipitie ili uendelee kuwa kwenye orodha. |
| `events.waitlist.reconfirm.button` | Review terms | Pitia vigezo |
| `events.waitlist.list.title` | Waitlist | Orodha ya kusubiri |
| `events.waitlist.list.empty` | You're not on any waitlist. | Hauko kwenye orodha yoyote ya kusubiri. |
| `events.waitlist.sem.position` | Number {n} on the list | Namba {n} kwenye orodha |
| `events.privacy.analytics` (app privacy text, draft) | We count how the events screens are used, without your name or account. | Tunahesabu jinsi skrini za matukio zinavyotumika, bila jina lako wala akaunti yako. |

Reused, unchanged: `events.offline.*`, `events.cta.soldOut`, `events.ticket.kit.staleHint`, `error.offlineTitle`. The sold-out hint `events.cta.soldOutHint` is replaced by `events.waitlist.cta.hint` only when the server reports an open waitlist.

### 10.3 Server notices (inline `{en, sw}`; class per §4.8 and D56)

| Type | EN title / body | SW title / body |
|---|---|---|
| `event_waitlist_joined` | You're on the waitlist / {title}: we will tell you if a ticket is held for you. | Uko kwenye orodha ya kusubiri / {title}: tutakuambia tiketi ikishikiliwa kwa ajili yako. |
| `event_waitlist_offer` | A ticket is held for you / A ticket for {title} is held for you. Pay before {time} to keep it. | Tiketi imeshikiliwa kwa ajili yako / Tiketi ya {title} imeshikiliwa kwa ajili yako. Lipa kabla ya {time} ili kuipata. |
| `event_waitlist_offer_reminder` | 1 hour left to pay / Your held ticket for {title} goes to the next person at {time}. | Saa 1 imebaki kulipa / Tiketi yako iliyoshikiliwa ya {title} itapewa mtu anayefuata saa {time}. |
| `event_waitlist_offer_expired` | Your turn has passed / The held ticket for {title} was not paid in time. If you already paid, we will refund you. | Zamu yako imepita / Tiketi iliyoshikiliwa ya {title} haikulipiwa kwa wakati. Ikiwa ulishalipa, tutakurejeshea pesa. |
| `event_waitlist_closed` | Waitlist closed / The waitlist for {title} has closed. | Orodha ya kusubiri imefungwa / Orodha ya kusubiri ya {title} imefungwa. |
| `event_waitlist_removed` | Removed from the waitlist / FitFlex removed you from the waitlist for {title}. {reason} | Umeondolewa kwenye orodha ya kusubiri / FitFlex imekuondoa kwenye orodha ya kusubiri ya {title}. {reason} |
| `organizer_kit_offline_invalid_burst` (essential) | Offline desk sent many unrecognised tickets / Desk {desk} sent many tickets we do not recognise. Check who is using it. | Dawati limetuma tiketi nyingi zisizotambulika / Dawati {desk} limetuma tiketi nyingi ambazo hatuzitambui. Angalia nani analitumia. |
| `organizer_registration_paused` / `…_resumed` (essential) | Registrations paused / FitFlex paused registrations for {title}. {reason} (resumed: Registrations resumed) | Usajili umesitishwa / FitFlex imesitisha usajili wa {title}. {reason} (resumed: Usajili umeendelea) |
| `organizer_rewards_eligibility_changed` (essential) | Rewards setting changed / Rewards for {title} are now {state}. | Mpangilio wa zawadi umebadilika / Zawadi za {title} sasa {state}. |

**Admin-typed reasons that reach a person** (waitlist removal, pause or resume registrations, rewards eligibility, desk removal notices to staff): each dialog has an optional Swahili reason field; when it is empty the Swahili notice shows the English reason prefixed "(kwa Kiingereza)", the rule S4 set for admin-typed notes. The `reasonSw` field is part of those request bodies (optional, 10 to 300 characters).

### 10.4 Glossary proposals (for `i18n-swahili-auditor` and the owner; add to `docs/localization/fitflex-terminology-glossary.md` once accepted)

| Concept | Proposed term | Note |
|---|---|---|
| Waitlist | orodha ya kusubiri | "foleni" avoided (not used elsewhere) |
| Desk (kit desk, scan desk) | dawati | "kifaa" is **not** used for a phone or computer because "vifaa vya mbio" means the kit |
| Offline desk | dawati la bila intaneti | |
| Provisional (scan) | imehifadhiwa, si ya mwisho | |
| Send (sync) | kutuma (zinasubiri kutumwa) | glossary row "Sync (offline sales)" |
| Needs a check | inahitaji kukaguliwa | |
| Held (ticket) | imeshikiliwa | D22 |
| Offer "ofa" | **not used** for a held ticket | "ofa" means a shop promotion |
| Position in line | namba yako kwenye orodha | "nafasi" is reserved for roles |

Known inconsistencies found while reading existing strings (not changed here, for the auditor): mobile `error.offlineTitle` SW reads "Hauko mtandaoni" but the glossary says "Hakuna intaneti"; mobile `events.cta.soldOutHint` SW says "Rudi kuangalia nafasi zitakazoachwa" and uses "nafasi" for places; rank wording ("Cheo" above) must match the S6 rank strings.

---

## 11. Accessibility, touch and layout (all new screens)

- Every actionable control has a visible label or an `aria-label` / `Semantics` label; icon-only buttons are named ("Scan next", "Remove desk", "Copy"). Status is text plus icon plus colour, never colour alone.
- Touch targets: 44 px minimum (portal), 48 dp (mobile), 56 px for desk primary actions. Swahili strings wrap; no fixed-width buttons or chips; monospace values wrap with `break-all`.
- Offline desk: the mode chip, pending counter, result heading and "Saved, not final" are `role="status"` or `aria-live` (assertive for results, polite for counters); focus moves to the result heading, `Hand over kit` is focused on a valid result, `Esc` cancels, the manual box keeps focus after each submit for USB scanners. The camera preview has an `aria-label`; the page is usable with the manual box alone. The clock banner and the removed-desk banner are `role="alert"`. `prefers-reduced-motion` respected (no flashing frames). Contrast: tone-800 on tone-50 pairs already used by `scan/page.tsx`, at least 4.5:1 for text and 3:1 for icons. Strong outdoor-light option: the result card uses large type (name 28 px, bib 48 px) as S5.
- Waitlist: position and deadline are real text (not images); countdown announced politely at 1 hour, 15 minutes and 5 minutes left (no per-second announcements); the confirm dialogs are `ConfirmDialog`/`AlertDialog` with labelled buttons; no timer-only information.
- Health and Operations: charts (if any) have a table alternative; each `MetricCard` is a labelled region; dialogs trap and return focus; destructive confirmations need the typed text, announced by the field label.
- Layout: phone about 375 px single column; Flutter web desktop and portal desktop two or three columns from 840 or 1024 px; tables scroll inside their labelled region, never the page; document titles `"{page} · FitFlex"`.
- Mobile web (Flutter web exposes the accessibility tree): every new control has a `Semantics` label; headings use `header: true`; the join form announces field errors.

---

## 12. Slice split for builders (stop after each; PRs into `release-candidate`, flags off)

| Stage | Builder | Content | Depends on | Stop point |
|---|---|---|---|---|
| **B3 Analytics and health** (first, so everything after is observable) | backend-builder | Migration 3; `track` helper; allowlist; roll-up job; `POST /events/analytics`; `GET /admin/events/health`; alert job and rules; `api_error` counter in the shared route wrapper; options fields; specs (allowlist drops unknown keys and PII-like values, rate limits, idempotent roll-up, no caller stored) | S6 on RC | privacy review |
| **B1 Offline kit core** | backend-builder | Migration 1; device registry; snapshot and delta; heartbeat; sync (per-item transaction, replay, every outcome); review and check; admin read and revoke; `method offline`; audit; specs (§13 AC-O*) incl. concurrency of two desks syncing one ticket | S5 on RC | **owner review (rule 6 #1, #2) + security review before P1 merges** |
| **B2 Waitlist core** | backend-builder | Migration 2; store and service; join rules; promoter job (system create-order, offer window, quiet hours, skips); gate and availability; reconcile (converted, expired, declined); purge; notices; organizer and admin routes; specs (§13 AC-W*) incl. two buyers and one place, queue gate, promoter races, D26 interplay | S6 on RC | **owner review (rule 6 #3, #4) + security review** |
| **B4 Hardening** | backend-builder | Migration 4; H1 to H17; retention job (unset); consent draft; organizer status sweep; specs per H item | S6 on RC | security review |
| **P1 Offline desk** | portal-builder | Route, service worker, encrypted IndexedDB, scan pipeline, manual path, sync UI, review list, desks panel, Playwright with offline mode | B1 contract | design-qa + security review of the storage and worker |
| **P2 Waitlist (organizer, admin)** | portal-builder | Registrations tab card, close dialog, admin block, Playwright (flag on/off) | B2 contract | design-qa |
| **P3 Admin Health and Operations** | portal-builder | Health tab, Operations tab, disputes tab, redemptions table, event view blocks (pause, rewards switch, integrations) | B3, B4 contract | design-qa |
| **P4 Results follow-ups and banners** | portal-builder | Per race settings, correction preview, takedown banner, payments-off banner | B4 H12, H13, H14 (fixtures first) | design-qa |
| **M1 Waitlist (member)** | mobile-builder | CTA states, join flow in register page, My waitlist, offer states, notification routing, cache, tests | B2 contract | design-qa + uat-tester |
| **M2 Analytics wiring and offline ticket tests** | mobile-builder | `EventsAnalyticsTransport`, allowlist, buckets, options gating, offline ticket tests | B3 contract | design-qa |

Parallel work is possible once the B1 and B2 contracts are merged (portal and mobile against fixtures). Review sequence: contract-checker, i18n-swahili-auditor and security-and-privacy-reviewer on each backend PR; release-captain merges to RC in the order functions, portal, mobile; the pilot (Appendix C) starts only after all ten are on RC. `docs-and-tracker-sync` last: it copies Appendices A, B and C into `docs/marathon/go-live-checklist.md`, `docs/marathon/runbooks.md` and `docs/marathon/pilot-plan.md` (the PRD names `docs/marathon-go-live-checklist.md`; the `docs/marathon/` folder is used here so the module's documents stay together), writes `docs/marathon/s7-asbuilt.md`, updates `docs/server-env-checklist.md`, and refreshes the launch tracker.

---

## 13. Acceptance criteria (check one by one; `design-qa`, `uat-tester`)

**Offline kit scanning (flag `EVENTS_KIT_OFFLINE`)**
1. AC-O1: With the flag off, no offline entry point renders, every `/kit-offline/*` route returns 404 `feature_disabled`, and the S5 kit desk (including its "offline scanning is not available yet" text) is unchanged.
2. AC-O2: Owner, admin and ops can prepare a desk; timing and finance get 403 `forbidden_role`; the 11th active desk of an event and a 3rd desk for one staff user are refused with 409 `device_limit_reached`.
3. AC-O3: The ticket list contains no phone, email, date of birth, gender, emergency contact, payer or payment data, user id, token or MAC; it contains `tokenHash` only for active tickets; it is served `no-store`; above `EVENTS_OFFLINE_MAX_ROWS` it returns 413 `snapshot_too_large` and the portal asks for a race.
4. AC-O4: Offline, scanning a listed ticket shows "Ready for kit (from saved list)"; Hand over kit shows "Saved, not final" and never "Kit recorded"; the server has **no** `EventKitCollection` for it until the desk sends.
5. AC-O5: An unsent scan survives reload, closing and reopening the browser, and killing the tab immediately after tapping Hand over kit.
6. AC-O6: Scanning the same ticket twice on one desk is refused ("Already scanned on this desk at {time}"); there is no override control offline.
7. AC-O7: A token not in the list is refused "Not on this desk's list" and nothing is stored; a listed ticket marked cancelled is refused with its reason; a gym QR is refused locally and never stored.
8. AC-O8: Sending creates one official collection per accepted item (`method offline`, `offlineBatchId` set, kit status updated), one `kit.collected` outbox row and one member notice each; sending the same batch or `clientRef` again returns the same outcomes with `replayed` and creates nothing.
9. AC-O9: Two desks scan the same ticket offline and both send: exactly one collection exists; the other item is `duplicate` in the review list with the winner's time and desk; no second webhook or notice.
10. AC-O10: A ticket cancelled or refunded after the list was taken syncs as `revoked_after_scan`: no collection, shown in review with the reason and the masked name.
11. AC-O11: A ticket whose token was replaced (claim) after the list was taken is accepted at sync; a token replaced before the list was taken is not on the list and is refused offline.
12. AC-O12: A forged or garbled payload syncs as `invalid_token`, creates nothing and stores no payload text; more than 20 in one batch writes the burst audit row and notifies the owner.
13. AC-O13: A desk whose clock is more than 5 minutes wrong, or moved backwards, cannot scan and shows the clock banner; an item with a device time outside the allowed window is accepted with its time clamped and `clock_adjusted` set; sending is never blocked by the clock.
14. AC-O14: Removing a desk shows the removed banner at its next contact; sending is allowed; items timed after the removal go to review as `after_revoke`; afterwards the list is wiped.
15. AC-O15: After `validUntil` scanning is refused and sending still works; the list is wiped only after nothing is unsent.
16. AC-O16: Signing out removes the list but keeps unsent scans; "Remove saved list" behaves the same; "Discard unsent scans" needs the typed count and appears in the next heartbeat as `discardedReported`.
17. AC-O17: Owner and admin can mark review items as checked (note required, 10 to 300 characters, for `revoked_after_scan`); ops see only their own desks and outcomes and cannot check; each check writes an audit row and updates the counts.
18. AC-O18: After one online visit the offline desk page opens and scans with the network disabled (service worker); scanning makes no network call; a new version is applied only when nothing is sending.
19. AC-O19: Offline manual handover requires a reason and the ID-check tick; accepted manual offline items appear in the review list under the Manual filter after sync.
20. AC-O20: On the member ticket page the kit stays "ready" until the desk sends; after sync it reads "collected" and the member gets the notice; the saved ticket and its QR open with no signal with the "saved copy" line.
21. AC-O21: All offline strings exist in EN and SW, render at 375 px and at 320 dp text scale 1.3 without overflow, and keys have parity.
22. AC-O22: The desk is fully operable by keyboard (manual box, search, hand over, send); results are announced by `aria-live`; targets are at least 44 px (56 px for primary desk actions).
23. AC-O23: Staff of organizer B get 404 on organizer A's desks, snapshot, sync and review; a ticket of another event or organizer synced through your desk is `unknown_ticket` or `wrong_event` and reveals nothing.
24. AC-O24: A FitFlex admin can read desks and review counts and remove a desk with a reason (optional Swahili reason); the organizer is told.

**Waitlist (flag `EVENTS_WAITLIST`)**
25. AC-W1: With the flag off, ticket types carry no `waitlist` field, the sold-out CTA is unchanged, and every waitlist route returns 404.
26. AC-W2: Joining works only while the ticket type is sold out; otherwise 409 `not_sold_out` and the app offers Register; a priced ticket cannot be joined while event payments are unavailable.
27. AC-W3: Joining needs a verified phone or email; a second entry for the same ticket type, an entry on another account with the same normalised phone or email, a 6th live entry, a 501st entry in a ticket type and the 11th join in an hour are refused with the named errors.
28. AC-W4: Joining changes no capacity: `held`, `sold`, orders and payments are untouched and no money is requested.
29. AC-W5: When a place frees (cancellation, hold expiry, capacity increase), within about one minute the first eligible entry gets an order in `awaiting_payment` whose hold equals the offer window; `held` rises by one; the entry is `offered` with `orderId`; the member gets the essential notice; later entries are untouched.
30. AC-W6: With five waiting and three places free, entries 1 to 3 (by join order) are offered, entry 4 and 5 stay waiting, and positions update; a blocked or skipped entry never loses its place in line.
31. AC-W7: While any entry is waiting or offered for a ticket type, a new order for that type (member, corporate coordinator or admin) is refused 409 `waitlist_active`; the app shows the waitlist button; an old app build shows "Sold out" (availability is `sold_out`), never "Open".
32. AC-W8: With the queue non-empty and one place free, two buyers racing for it both get `waitlist_active` and exactly one order exists: the promoter's.
33. AC-W9: An unpaid offer ends when its hold lapses: the order is `expired`, the entry `expired`, the next entry is offered, the member is told; two expired offers on one event block joining that event (`waitlist_lapse_limit`) but never block normal registration while tickets are on sale.
34. AC-W10: Paying an offer uses the unchanged manual path: the admin types the amount, a second approver where required, the order confirms, tickets are issued and the entry becomes `converted`.
35. AC-W11: After a transaction id is sent the existing hold extension applies (entry stays `offered`); a rejected payment resets the hold without a further extension; a late payment after the offer ended is re-reserved only if a place is free, otherwise refunded in full, with no priority over the line, and the notice says so.
36. AC-W12: Leaving while waiting shifts positions; leaving while offered cancels the unpaid order and gives the place to the next entry; leaving is refused 409 `payment_pending` while a payment waits for confirmation.
37. AC-W13: No offer is made between 21:00 and 07:00 in the event timezone unless registration closes before the offer would end; the offer window is never under 2 hours and never past registration close; no offer is made with fewer than 120 minutes to close; at registration close entries end as `closed` with a notice.
38. AC-W14: Cancelling the event closes every entry with a notice; offered orders follow the S4 event-cancel refund batch.
39. AC-W15: The organizer sees counts only (no names, no positions, no promote or reorder controls); owner and admin can stop new sign-ups; closing needs the typed word and tells everyone waiting; ops cannot close; timing and finance cannot change anything.
40. AC-W16: A FitFlex admin can remove an entry with a reason (optional Swahili reason); the person is told in their language; an unpaid offered order is cancelled.
41. AC-W17: When the consent text version changes, waiting entries are skipped without losing their place until the member reconfirms in the app, then promotion resumes.
42. AC-W18: Stored registration details are cleared within 24 hours of an entry ending; ended entries are deleted after `EVENTS_WAITLIST_KEEP_DAYS`; deleting the account removes the member's entries.
43. AC-W19: With event payments off (D32) priced entries wait and no order is created; a free ticket type is still offered.
44. AC-W20: Two promoter runs at once create at most one order per entry (idempotency key `wl:<entryId>`, `SKIP LOCKED`).
45. AC-W21: A member who already holds a place in the category when their turn comes has the entry closed (`registered_elsewhere`) and the next entry is offered.
46. AC-W22: Mobile: the join flow has no payment step and shows the price today, the three rules and the position afterwards; the offer card shows the deadline in the event timezone and **Pay now** opens the existing payment page; offline shows the saved copy and disables join and leave with the offline message; all strings fit in Swahili; every control has a `Semantics` label.

**Analytics, health and alerts (flag `EVENTS_ANALYTICS`)**
47. AC-N1: With the flag off, `POST /events/analytics` returns 404, the app sends nothing and the roll-up does nothing.
48. AC-N2: The endpoint keeps only allowlisted names and dimensions, turns values outside the closed set into `other`, stores no user, session, device or IP data (inspect the table), and answers 202 with `accepted` and `dropped`.
49. AC-N3: Mobile payloads never contain order id, registration id, amounts or names; the queue is memory-only; events recorded offline are dropped; analytics never blocks or delays a screen.
50. AC-N4: Running the roll-up twice gives the same counters; S3 to S6 `analytics.*` audit rows are counted under the PRD names.
51. AC-N5: No counter has `categoryId`, age, gender or any minor marker; a minor's registration produces the same dimensions as an adult's.
52. AC-N6: The Health tab renders every group with seed data; payment cards are hidden without the `payments` scope; one failing group shows its own error while the rest render; each number equals a direct count from the tables for the sample period; the "counts of events, not people" note is visible.
53. AC-N7: Each alert rule A1 to A13 fires in a test when its threshold is crossed and not before, once per 6 hours per subject; with `OPS_ALERT_EMAILS` unset nothing is emailed and the Health tab shows the banner; emails contain counts and ids only.

**Hardening and admin tools**
54. AC-H1: One slow webhook receiver does not delay deliveries to other organizers' endpoints beyond the per-host cap.
55. AC-H2: If a notice throws after a kit handover commits, retrying with the same `Idempotency-Key` returns the original 201 with `replayed`, never `already_collected`.
56. AC-H3: The outbox retention removes rows older than 90 days (published or not) and leaves newer ones; the change feed cursor stays valid.
57. AC-H4: Redelivery is owner only, limited to 7 days and 5,000 rows, rate limited, audited, and never touches another organizer's rows.
58. AC-H5: A member with 4 unpaid places cannot create a 5th (409 `unpaid_places_limit`); organisation orders are exempt.
59. AC-H6: A new event is `rewardsEligible = false`; with it false medals are awarded and no reward is earned; an admin can switch it with a reason; the change is audited and the organizer is told in EN and SW.
60. AC-H7: A failed KYC-to-organizer hook is corrected by the hourly sweep, audited, and visible on the Health tab.
61. AC-H8: Submit refuses an event timezone not in `options.timezones` with a field error.
62. AC-H9: Team join by code inside quote and order shares the lookup limiter.
63. AC-H10: The admin disputes tab lists open questions with age and the **May resolve** badge (after 7 days, or organizer suspended or inactive), filters work, and resolving uses the existing resolve route with a reason and notice.
64. AC-H11: Recent redemptions list shows reward, masked person, state and times; no code appears.
65. AC-H12: The correction dialog's preview shows rank change, number shifted and medals affected without names; Confirm stays disabled until the preview matches the current revision.
66. AC-H13: After a take-down the organizer sees the danger banner with the reason in their language until a new design is uploaded; the built-in design shows to members.
67. AC-H14: The payments-off banner names the cause (`second_approver_off`, `no_ticket_secret`, `flag_off`) in EN and SW, only to organizer finance/owner/admin roles and FitFlex admins.
68. AC-H15: The ops job list hides event jobs while `EVENTS_MODULE` is off.
69. AC-H16: Pause registrations moves a published event to registration closed, new orders get 409 `event_not_open`, paid places are unaffected, resume reverses it, both write audit rows and notify the organizer (essential, EN and SW, with the optional Swahili reason).
70. AC-H17: The Operations tab finds organizers by name; Enable and Disable API access, Revoke all clients, Turn off all webhooks and Change rate each need a reason, the dangerous ones need the typed organizer name, each shows the resulting count, each writes an audit row, and an action whose flag is off says "Not available because {feature} is off".
71. AC-H18: Per race settings save per-race time basis, cut-off and tolerance through the existing route; after the first official release they disable with the explanation; "Same for all races" still sets every race.
72. AC-H19: With `EVENTS_RETENTION_MONTHS` unset the anonymise job changes nothing and the Health tab says "Not configured"; with a test value on an isolated database it clears only phone, email, date of birth, gender, emergency contact and claim data of events older than that, keeps first name, last initial, bib and results, and writes one audit row with counts.

**Flags and regression**
73. AC-F1: With the three new flags off and the S6 flags off, `GET /events/options` reports them false, no new route is reachable, no new UI renders, applied migrations change no behaviour, and the S5 and S6 acceptance criteria still pass.
74. AC-F2: `EVENTS_KIT_OFFLINE` cannot be on without `EVENTS_KIT_OPS`; all three need `EVENTS_MODULE` and `EVENTS_REGISTRATION`.
75. AC-F3: An invalid numeric env value falls back to its default and reports only `invalid_config`.

**Documents and pilot**
76. AC-D1: `docs/marathon/go-live-checklist.md`, `docs/marathon/runbooks.md`, `docs/marathon/pilot-plan.md` and `docs/marathon/s7-asbuilt.md` exist, built from Appendices A to C; every checklist row has Status PASS, OPEN or N/A and an evidence link; no PASS without evidence.
77. AC-D2: Every runbook step names a real screen, route or flag; each runbook names an owner role; the incident runbook lists the flag-off order.
78. AC-D3: `docs/server-env-checklist.md` lists every new variable of §7.2 with its default and whether it is required.
79. AC-D4: A Stage A pilot report with the scenario matrix and load numbers is attached before Stage B is proposed to the owner.

---

## 14. Backend confirmations for `fitflex-planner` / `contract-checker` (the builder resolves each in its PR)

1. Portal session storage: where the sign-in token and role are kept, whether an offline reload stays signed in, and that a network error or 401 while offline does not sign the user out (the desk needs the staff user id and role offline).
2. Hosting: `public/organizer/kit-desk/sw.js` is served with `Cache-Control: no-cache`; the `** -> /index.html` rewrite does not swallow it or the route's files; the static export emits `/organizer/kit-desk/index.html`; the worker scope is allowed.
3. Where the queue gate sits relative to the ticket-type row lock in the create-order path (member, corporate, admin-created), so no order can pass it between two promoter runs.
4. Whether `EventCategory.capacity` is enforced anywhere (checkout updates only `EventTicketType`); if not, category `remaining` and category availability can disagree with ticket-type sold-out.
5. Whether a post-commit nudge after cancellation and release can be added without touching the rule 6 transaction code (`hooks.afterExpire` exists for hold expiry); otherwise the one-minute job is the only trigger and that latency is accepted.
6. That reading the `OutboxEvent.seq` high-water mark and the registration rows in one `REPEATABLE READ` read gives a consistent snapshot.
7. How identity V2 exposes "verified phone or email" to services (field names), for the waitlist eligibility check.
8. `AuditLog` indexes (is `(action, at)` indexed) and any retention job that could delete `analytics.%` rows before the roll-up reads them.
9. Whether the platform logs request bodies for `POST /events/analytics` and `POST …/kit-offline/sync` (the latter carries ticket token text) and how headers and paths are redacted (S3 L5 for preview tokens).
10. Whether all event route files share one wrapper (`stamped` or `send`) where the `api_error` counter can live, or each file needs it.
11. Whether an existing admin endpoint already lists organizers (KYC or partner lists) so H17 can reuse it instead of adding one.
12. Whether medal template reads already expose art status and take-down data (S6) or H13 must add them.
13. Whether the results settings read returns per-race `resultRules` (needed by the Per race settings table).
14. Migration timestamps relative to the highest on RC at branch time; the fail-closed `down` pattern; a dry run on a fresh database; the `OutboxEvent.seq` table rewrite window from S5 is already behind us on any database that took S5.
15. Notification sender capacity for hundreds of offers and thousands of event-cancel notices, and essential-notice push behaviour (S4 known gap).
16. The event end timestamp used for "24 hours after the event end" (desk expiry) and the registration close fields used by the offer window (event and category).
17. That the S5 partial unique `collected` index also arbitrates offline inserts (same table, same constraint) and that `assignBibTx` is never reached from the offline path.
18. That `kitStateOf`, `scanningOf`, the S5 verify route and the closed webhook allowlist are unchanged.
19. S6 follow-up: confirm `EventActivityLink` checks `Activity.userId` equals the participant; account deletion: the waitlist `ON DELETE CASCADE` against `purchaserUserId` RESTRICT behaviour on orders created by the promoter.
20. i18n file layout for S7 keys (portal pattern `src/lib/i18n-events-s6.ts`, so `i18n-events-s7.ts`; mobile `TODO(sw-review)` markers).
21. Mobile and portal route names in this spec (`/member/events/:id/register?mode=waitlist`, `/member/events/waitlist`, `/organizer/kit-desk`, `/admin/events?tab=health|operations|disputes`) are proposals; builders follow the existing `AppRoutes` and portal query-parameter patterns and report the final names.

---

## 15. UAT journeys for `uat-tester` (isolated backend and DB, seed accounts only; no real money; Firebase production sign-in blocked per the UAT note; R = needs a real device)

1. **Offline desk day.** Two browser profiles act as two desks for seed event E1 (pre-assigned bibs, two collection points). Prepare both online, take the network away, scan ten listed tickets including one on both desks, one unlisted, one cancelled online after the lists were taken, one manual handover; reload one desk mid-way; reconnect; send; read the outcomes; open Offline scans to check; mark as checked; confirm participants see "collected" and one notice each. Expect AC-O4 to O12, O16, O17, O19, O20.
2. **Clock and removal.** Skew one desk's clock (browser emulation), see the block; remove a desk from the panel while it holds unsent scans; reconnect it; its scans after the removal time land in review; list wiped. Expect AC-O13 to O16, O24.
3. **Waitlist.** Event E3 with capacity 3, all sold. Five seed members join (one without a verified contact is refused). A paid member cancels; within a minute member 1 is offered (R: push); member 1 pays by the manual path; admin confirms; member 2 lets the offer lapse (UAT backend uses the shortest offer window and DB-aged hold); member 3 is offered next. Expect AC-W2 to W12.
4. **Queue gate and corporate.** While E3 has a queue, a coordinator and a second member try to buy; both are refused and see the waitlist button; the old-build check shows "Sold out". Expect AC-W7, W8.
5. **Payment interplay.** Offered member sends a transaction id (hold extends), admin rejects (hold resets, no further extension), member resends, admin confirms; separate case: offer expires, late transaction id sent, no place left, refund created. Expect AC-W10, W11.
6. **Quiet hours and closing.** Move the event timezone clock (UAT env) to 23:30 and free a place; nothing happens until 07:00; set registration to close in 100 minutes and free a place; no offer is made. Expect AC-W13.
7. **Analytics and Health.** Use the app for a funnel (list, detail, start, order, pay); admin opens Health and compares with table counts; lower the confirmation SLA via env on the UAT backend and leave a payment waiting to see alert A1; leave free capacity with a waiting entry and stop the promoter job to see A7; recipient unset shows the banner. Expect AC-N1 to N7.
8. **Admin Operations drill.** Disable one organizer's webhooks, revoke all API clients, turn off API access, pause and resume registrations of an event, switch rewards eligibility; organizer sees each notice in their language; Audit tab shows each row. Expect AC-H16, H17, H6.
9. **Results follow-ups.** Seed an aged dispute: admin sees it on the Disputes tab with May resolve and resolves it; organizer edits per-race settings, then after an official release sees them locked; correction preview; take-down banner; recent redemptions. Expect AC-H10 to H13, H18.
10. **Privacy and roles.** Organizer B cannot reach A's desks or waitlist counts (404); waitlist counts show no names; a minor registration produces the same analytics dimensions; offline list inspected for forbidden fields; ops cannot close a waitlist or check a review item. Expect AC-O3, O17, O23, W15, N5.
11. **Flags.** Walk the matrix: all new flags off (regression of S5 and S6), each on alone, KIT_OFFLINE without KIT_OPS refused. Expect AC-F1 to F3.
12. **Real device pass (R).** Android Chrome: install nothing, open the desk once online, airplane mode, scan with the camera, reload, restore network, send; iPhone Safari: same, note storage persistence and the idle eviction behaviour; push for a waitlist offer and its deep link to the payment page; Swahili at the largest system font. Record results; failures here are expected to be platform findings, not spec failures.
13. **Pilot Stage A scenario drill.** Run the 20 PRD scenarios in Appendix C and attach evidence.

Needs a real device: camera scanning and focus in sunlight, service worker and storage persistence on Safari and Chrome, airplane mode behaviour, push delivery and deep links, share sheets, Android GPS recording.

---

## 16. Appendix A: go-live checklist (source for `docs/marathon/go-live-checklist.md`)

Rules: Status is **PASS**, **OPEN** or **N/A**. A row is PASS only with a link to a test run, log, source line or screenshot in the Evidence column; "reviewed" is not evidence. Every row starts **OPEN** except those that cannot apply (stated). The checklist is filled in by `docs-and-tracker-sync` and `release-captain` from the S7 as-built note and the pilot report; the owner signs the final column. Source of the gates: PRD §15, `s4-asbuilt.md`, `s5-asbuilt.md`, `s6-asbuilt.md`, D43, D35.

| # | Gate | Evidence that counts | Owner role | Initial |
|---|---|---|---|---|
| C1 | Reuse and gap report approved; owner answers to PRD §17 (provider, merchant of record, manual path, organizer evidence, fees, retention, timing partners, reward funding, offline constraints) recorded in `decisions.md` | decisions.md rows D1 to D10, D63 to D85 with status | Owner | OPEN |
| C2 | Migrations reviewed; backup taken; rollback or forward-fix plan; ordering dry run on a fresh isolated database; `OutboxEvent.seq` rewrite window scheduled; Postgres 15+ confirmed | dry-run log (144+ migrations up, up/down/up of S5 to S7), backup id, `SELECT version()` output | release-captain | OPEN |
| C3 | Organizer verification and event moderation work end to end (S2) | UAT journey log + Playwright run | uat-tester | OPEN |
| C4 | All registration modes create independent participants and tickets (S3, S4) | UAT journeys 1 to 4 of S3/S4 specs + backend spec run | uat-tester | OPEN |
| C5 | Capacity concurrency proofs, including waitlist races | spec names and results for last-place checkout, promoter, queue gate (AC-W8, W20) | backend-builder | OPEN |
| C6 | Payments: labelled manual path; `MONEY_SECOND_APPROVER` on (D32); instant-payment claims off; Tunzaa sandbox | env evidence for the second-approver flag and `EVENT_TICKET_SECRET` set; Tunzaa rows **N/A** while D34 stands (provider changing) | Owner | OPEN (Tunzaa N/A) |
| C7 | Organizer API scopes, webhook signing, retries, replay, rotation, revocation, audit (S5, S6); owner reviewed `src/auth/organizer-api-auth.mjs` (D35); D43 gates (Node SNI, `docs/api` shipped, forwarded IP, secret key set) | review sign-off, deploy log, `GET /v1/organizer/openapi.json` check | Owner, release-captain | OPEN |
| C8 | Kit duplicate prevention online and offline reconciliation (S5, S7); owner reviewed §3 | AC-O* results, scenario 11 and 12 evidence | uat-tester | OPEN |
| C9 | Result provenance and official verification rules enforced (S6, D46, D47) | AC-S* results from S6 + scenario 15 to 18 evidence | uat-tester | OPEN |
| C10 | Reward ledger and reversal; reward eligibility (H6); faces-in-medal-art policy stated; medal-art security review | spec results, owner policy text | Owner, security reviewer | OPEN |
| C11 | EN and SW complete; native Swahili review done (all slices); glossary additions accepted | auditor report, review sign-off | i18n auditor, Owner | OPEN |
| C12 | Security and privacy review, including participant data sharing, offline desk data, analytics, waitlist details, route and token traces in logs | reviewer reports, platform log check (confirmation 9) | security-and-privacy-reviewer | OPEN |
| C13 | Backend and portal tests on a clean isolated database; Flutter analyze and tests | CI run links; DB name printed before writes; the shared `fitflex_ci` database is dirty, use a fresh one | release-captain | OPEN |
| C14 | **Retention and consent**: retention period set by counsel and owner; consent text rewritten (shares, kit status, bib, public results clause), `EVENTS_CONSENT_TEXT_VERSION` bumped; app privacy text updated; gate for `EVENTS_KIT_OPS`, `EVENTS_KIT_OFFLINE`, roster API and export in production | counsel note, env values, version string, screenshot | Owner, counsel | OPEN |
| C15 | Monitoring, support ownership, incident response, reconciliation runbook | Health tab live, alert recipients set, runbooks R1 to R12 present, named people for the pilot | Owner | OPEN |
| C16 | Pilot organizer and pilot event through the full workflow (Appendix C Stages A and B) | pilot report | Owner, uat-tester | OPEN |
| C17 | Production environment variables set and recorded in `docs/server-env-checklist.md` | checklist diff, console screenshot (values hidden) | Owner | OPEN |
| C18 | Deploy order and flag order agreed: functions (migrations first), portal, mobile, flags last, one at a time | release plan, owner go-ahead in chat per release | release-captain, Owner | OPEN |
| C19 | Platform checks: Node supports pinned lookup with SNI; `PUBLIC_API_URL` set and OpenAPI server URL correct; forwarded-IP behaviour; Postgres version; platform logs hold no ticket or preview tokens in paths | command output, log search | release-captain | OPEN |
| C20 | Counsel (Tanzania) review of: organizer terms, event terms and refund policy baseline, claim and consent texts, SLA promises, rights-confirmation text, API terms, cross-border transfer position, results consent clause. All legal text is draft until then | counsel letter or owner's written decision to pilot under disclosed drafts | Owner | OPEN |
| C21 | Organizer payout process (Runbook R2) agreed; settlement statements are **not built** | signed process, named approvers | Owner | OPEN |
| C22 | Real-device checks (camera, push, GPS recording, share sheets, offline desk on Android Chrome and iPhone Safari, storage persistence) | device log with model and OS | uat-tester | OPEN |
| C23 | Load and soak numbers recorded (no targets): 20,000-row ticket list, 5,000-row import, official release to 5,000 results, cancel with 2,000 paid places (notifications and refund batch), promoter with 500 waiting, 2,000 offline scans from 10 desks, analytics at 200 events a minute | measured table in the pilot report | backend-builder | OPEN |
| C24 | Client adoption before payments: both client builds with S4 payment screens have reached users (old S3 builds cannot pay and show paid orders as unpaid) | store version stats | Owner | OPEN |
| C25 | Accessibility and Swahili layout pass on all new screens (design-qa) | design-qa report | design-qa | OPEN |
| C26 | Support: named owner, hours, escalation path, canned answers (R12) | support rota | Owner | OPEN |

---

## 17. Appendix B: runbooks (source for `docs/marathon/runbooks.md`)

Common rules: never run anything against the live database for rehearsal (rule 3, rule 9); use the admin screens and routes named here; flags are changed by the owner in the server settings (BFast console), never by an agent without the owner's explicit go-ahead in chat; every action that moves money needs two people where `MONEY_SECOND_APPROVER` is on; note the time, the actor and the reason in the incident log; tell affected organizers and members in both languages. Roles: **Owner** (decisions, flags, counsel), **Events admin** (scope `events`), **Payments admin** (scope `payments`), **Release captain** (deploys), **Support** (member and organizer questions).

**R1 Incident (anything affecting money, data exposure, or many users)**
Trigger: an alert A5, A7 or A10, a report of wrong money state, a participant data complaint, sustained errors.
1. Events admin opens Health and Operations; note which group is red and since when.
2. Stop the bleeding with the narrowest tool first: **Pause registrations** for one event (Operations, or admin event view); **Turn off all webhooks** or **Revoke all API clients** for one organizer; remove one offline desk; remove a waitlist entry. Each needs a reason and tells the organizer.
3. If the problem is feature-wide, the **owner** switches flags off, last-on first: `EVENTS_RESULTS_PUBLIC`, `EVENTS_MEDAL_ART`, `EVENTS_REWARDS`, `EVENTS_RUNS`, `EVENTS_RESULTS`, `EVENTS_WAITLIST`, `EVENTS_KIT_OFFLINE`, `EVENTS_ORGANIZER_API`, `EVENTS_WEBHOOKS`, `EVENTS_KIT_OPS`, then `EVENTS_ANALYTICS` last. Before touching `EVENTS_PAYMENTS_MANUAL`, `EVENTS_REGISTRATION` or `EVENTS_MODULE` confirm what members who already paid will see (tickets and cancel need `EVENTS_REGISTRATION`; payment intake needs the payments flag; S4): prefer pausing registrations for the affected events.
4. Check that the jobs are still running (Health, Jobs) and that nothing is stuck (alerts A1 to A8).
5. Suspected personal data exposure: stop the exposing path, record what, who, since when, and tell the owner immediately; the owner decides about counsel and notices. Do not delete evidence.
6. Communicate: organizer notices go out automatically for pause and resume; add a short member message through the existing communications module if members are affected (EN and SW).
7. Close: write the cause, the fix, the follow-up in the incident log; add a spec for it.
Verify: Health group green, alert cleared, a test order or scan works on the isolated backend before resuming.

**R2 Organizer payout (manual; settlement statements are NOT built)**
Trigger: the event's payout schedule (`biweekly` or `monthly`, D33) comes round, or the event is complete. Who: a Payments admin prepares, a second Payments admin checks.
1. Open the admin event Finance view and the organizer's Finance totals. Confirm the event is completed or the period has ended, and the schedule label.
2. Hold back anything with open refund requests, open refund batches, `reconciliation_required` payments or open result disputes involving money; note the amounts.
3. Compute in the agreed payout sheet: confirmed paid total, refunds paid, refunds open, FitFlex commission at the organizer's agreed rate (D2; configuration, not code), amount to pay. The system does not calculate or record a payable amount; no payout engine is involved or changed.
4. Check the destination is the organizer's **approved KYC settlement account**; never one sent by chat or email.
5. Second person recomputes from the same screens and signs the sheet. Pay outside the system (bank or mobile money). Record the bank or mobile money reference in the sheet and attach the sheet to the incident-free log.
6. Tell the organizer the paid amount and the held-back amounts in plain language.
Verify: the sheet totals equal the Finance totals; the second signature exists. Gap: there is no system record of the payout (owner decision D82); until settlement statements exist, this runbook is the control.

**R3 Result questions (disputes) and wrong results (D46, D47, D59)**
1. Admin opens **Result questions**; filter Older than 7 days or Organizer suspended.
2. The organizer resolves first. An admin may resolve only when the badge says **May resolve** (after 7 days, or the organizer is suspended or inactive). Contact the organizer through the event's organizer notice and note it.
3. Open the result, read the revision history, decide; record a reason (and Swahili reason for the participant); the participant and organizer are told (essential notices).
4. Corrections create a new revision, recompute ranks, and revoke or re-award medals and reversible rewards; an open question never suspends medals (D47).
5. A wrong **provisional** release: organizer withdraws it. A wrong **official** release cannot be withdrawn: correct each result, or the admin uses the audited exception (reason, organizer notice). Never edit the database.
6. A bad import: the same file replays as a no-op; a corrected file is a new import; ranks in files are ignored (D52).
Verify: board and participant views show the corrected result, ledger shows reversal entries, audit rows exist.

**R4 Webhook and API incidents**
1. One receiver failing: organizer sees health and delivery log; deliveries retry with backoff and the endpoint auto-disables at the limit; organizer fixes the URL, verifies, enables, then uses **Redeliver** (owner only) for the time range missed (7 days maximum).
2. Compromise or abuse: Operations tab: **Revoke all API clients**, **Turn off all webhooks**, or **Turn off API access** for that organizer; organizer owner then rotates secrets (grace 0) and re-enables after verification.
3. Platform-wide: owner turns `EVENTS_WEBHOOKS` off; deliveries pause, outbox rows stay and the change feed keeps working; when turned on again the dispatcher drains the backlog; watch oldest pending age on Health.
4. After any of these: check A4 cleared, spot check one delivery in the log, record in the incident log.
Never share signing secrets in chat or email; they are shown once.

**R5 Event day with offline desks**
T-7 to T-3: pre-assign bibs (bulk or CSV); configure collection points and kit instructions; train staff (30 minutes: scan, hand over, offline wording, send, what "Saved, not final" means); decide desk names. T-1: each desk opens `/organizer/kit-desk` **online**, waits for "Works without internet", downloads the list, refreshes by delta in the evening; spare phone or laptop with signal at every point; devices charged; browser data not cleared; staff stay signed in.
Day: use the online desk when there is signal; offline mode starts by itself when requests fail; keep the clock correct; never scan a gym QR.
When a desk shows **No internet**: continue; every handover reads "Saved, not final"; do not override; for a lost phone use manual handover (ID check, reason).
After: every desk connects and presses **Send now** until pending is 0; owner opens Desks panel (Unsent = 0) and the review list; check or note each item (R8); remove desks; confirm the saved lists are gone.
Problems: dead phone with unsent scans (owner sees last reported count; recover the device or record manual handovers with reason `other` and a note after checking who collected); lost or stolen phone (**Remove desk now**, note the time; scans after that time are held for review; no contact data was on the phone); wrong clock (fix it and scan again); update needed (refresh the page).

**R6 Manual payment backlog (alerts A1, A3)**
1. Payments admin opens the admin payments list filtered to event orders; sort by age.
2. For each, check the transaction id and payer phone against the Lipa Namba statement, **type the amount received** (a mismatch refuses and writes nothing), confirm; a second approver confirms where required.
3. Orders whose hold ended: a late payment is re-reserved only if places remain, else an automatic full refund is created (D26); do not override.
4. `reconciliation_required`: use the order's repair route (`repair-payment`, scope `payments` and a second admin); never mark succeeded by hand.
5. If no second approver is available the system will not confirm (D32): tell the owner; do not switch the second-approver flag off to clear a backlog.
Verify: A1 and A3 clear, members' tickets issued.

**R7 Refunds (alert A2, batches)**
1. Refunds list filtered to event orders; each refund shows expected amount; pay by hand (mobile money or bank) and record the reference with the second approver where on.
2. Event-cancel batches: open the event's refund batch view, resume a stuck batch (scope `payments`, second admin; the hourly sweep also resumes it); the expected total must be typed.
3. Custom refund policy: "policy" refunds return `policy_not_evaluable` (D29); the admin chooses full or none with a reason.
4. Tell members the target ("usually within 5 working days") only as the app already says; do not promise dates.

**R8 Kit duplicates and offline conflicts**
Review list outcomes: `duplicate` (a kit may have been handed out twice: organizer decides, notes stock difference, marks checked); `revoked_after_scan` (kit given to someone whose ticket was cancelled or refunded: organizer notes and marks checked; FitFlex does not require recovery; if a refund was paid for a collected kit, tell the Payments admin); `event_closed`, `organizer_suspended`, `after_revoke` (note and mark checked). Wrong online handover: owner or admin **Void handover** from the registration drawer with a reason. Invalid-token burst: check who used the desk; remove it if suspicious.

**R9 Awards and rewards**
Failed award task: admin desk Award tasks, **Retry** after reading the reason. Duplicate-prevention incident (A11): the guard worked; check the ledger shows one entry per award; investigate how a duplicate attempt arose. Wrong reward: organizer corrects the result (reversal entries); never edit the ledger. Stop: owner switches `EVENTS_REWARDS` off (jobs no-op, nothing is lost). Perk redemption at the admin desk: look up by code, verify, redeem or cancel with reason.

**R10 Medal art take-down**
Admin Medal art queue: review, **Take down** with reason (and Swahili reason); the hash is blocked from re-upload; the organizer sees the banner; members see the built-in design and get the essential notice. Faces and brands follow the owner's policy; a legal or rights complaint goes to the owner and counsel the same day.

**R11 Deployment, rollback and recovery**
Before: backup; migration dry run on a fresh database; deploy order functions (migrations first), portal, mobile, then flags one at a time with the owner's go-ahead (approval does not carry to the next release). Rollback: switch the new flag off first; code rollback is a redeploy of the previous release; migrations' `down` **fails closed once S7 data exists** (offline devices, waitlist entries, counters) so the path is forward-fix or restore from backup (owner and BFast). After a restore: re-run payment reconciliation (`event-payment-reconciliation`), check hold expiry, drain webhooks, reissue nothing manually. Never run tests or specs against the live database.

**R12 Support quick answers**
| Question | Answer and where |
|---|---|
| I paid but have no ticket | Manual payments are confirmed within the quoted time; check the order in the admin payments list; late payments are handled by R6 |
| My phone is lost, I need my ticket | Sign in on the new phone: the ticket is in My tickets; at the desk staff can use manual lookup with ID |
| My waitlist turn passed but I paid | A late payment is refunded in full if the place is gone (R7); tell them the target time |
| I want to cancel | The refund policy line on the order page is the rule; nothing else is promised |
| My name or time is wrong in results | Use "Ask about this result" inside the window; the organizer resolves (R3) |
| Hide my name | Result visibility setting on the result page |
| Medal or reward missing | Medals appear at official release; check the result is verified and the event is rewards-eligible (H6) |
| I cannot delete my account | Organizer owners must transfer ownership first (409 `organizer_owner`) |
| The desk says Saved, not final | Normal offline behaviour; send when online (R5) |

---

## 18. Appendix C: pilot plan on RC (source for `docs/marathon/pilot-plan.md`)

Two stages. **Stage A** is a rehearsal on release-candidate builds against an isolated backend and database with seed accounts and no real money or people; it needs no promotion and can start as soon as B1 to B4, P1 to P4 and M1 to M2 are merged into RC. **Stage B** is a controlled live pilot; it happens only after the owner's explicit go-ahead in chat for each release, after promotion in the order functions, portal, mobile and the parent re-point, and after the checklist rows it depends on are PASS or explicitly accepted by the owner. Stage B is not scheduled by this document.

### 18.1 Stage A: RC rehearsal

**Environment.** Worktrees of `release-candidate` per repo (CLAUDE.md "Running RC locally"); backend on an isolated database (`FITFLEX_USE_CI_DB=1`, `DATABASE_URL_CI`; print and check the database name before anything writes; a fresh database, not the shared dirty `fitflex_ci`); `VERIFICATION_EMAIL_PROVIDER=fake`, `IDENTITY_V2`, `V2_PIN_LOGIN`, Firebase hosts blocked (the 2026-10-29 UAT incident note); Flutter web on `--web-port 7357` with `API_BASE`; portal `npm run dev`. All `EVENTS_*` flags on **only** on this local backend; `MONEY_SECOND_APPROVER` on; `EVENT_TICKET_SECRET` and `EVENTS_WEBHOOK_SECRET_KEY` set to test values; UAT may shorten the waitlist offer window and the manual-confirmation SLA through env on this backend only.

**Seed.**
- Organizer "Pilot Runners" (KYC approved) with staff: owner, admin, ops (two), timing, finance; a second organizer "Other Org" for isolation tests.
- FitFlex admins: two with `events`, two with `payments`.
- 40 verified seed members, one unverified member, one minor registration, one corporate coordinator with a 25-row roster file (3 deliberate errors).
- Events: **E1** in person, 10K (capacity 30) and 5K (capacity 20), kit provided, two collection points, 60 % of bibs pre-assigned; **E2** virtual run; **E3** one race of capacity 3 (waitlist); **E4** published with 15 paid registrations then cancelled by an admin.

**Schedule (5 working days).** Day 1 setup and smoke; Day 2 registration, payments and waitlist; Day 3 event day (offline desks, two real devices); Day 4 results, medals, rewards, disputes; Day 5 incident drills, load tests, report.

**Scenario matrix (PRD §13) with where each is proven.**

| # | Scenario | Layer | Evidence to attach |
|---|---|---|---|
| 1 | Individual registration paid | UAT + Playwright | order, ticket, notice |
| 2 | Register another participant, claim | UAT | claim log |
| 3 | Group checkout with purchaser | UAT | order with 4 places |
| 4 | Corporate bulk with row errors | UAT | error list, final order |
| 5 | Two buyers, last ticket (and with a queue) | backend spec + two browsers | spec output, AC-W8 |
| 6 | Provider callback twice | **N/A** while manual (D34); manual: confirming the same payment twice is a no-op | spec output for the manual equivalent |
| 7 | Payment after client timeout | UAT (late transaction id) | AC-W11 evidence |
| 8 | Amount mismatch | UAT (typed amount refuses) | screenshot, no write |
| 9 | Order expires while payment unknown | UAT (extension, reconciliation) | order timeline |
| 10 | Event cancelled with paid registrations | UAT on E4 | refund batch, notices, totals |
| 11 | QR replay, repeated kit collection | UAT online desk | already_collected, override audit |
| 12 | Offline scan syncs and detects duplicate | UAT journey 1 | review list |
| 13 | Webhook endpoint times out then recovers | spec + local stub receiver | delivery log, per-host cap |
| 14 | Webhook invalid or replayed signature | spec | receiver rejects |
| 15 | Duplicate result import | UAT | no-op message |
| 16 | GPS run submitted, not official | UAT web evidence; GPS recording (R) | status labels |
| 17 | Verified result awards one medal and reward | UAT | ledger |
| 18 | Corrected result reverses reward | UAT | ledger reversal |
| 19 | Cross-event, cross-organizer roster access | UAT + spec | 404 evidence |
| 20 | Reward double redemption under concurrency | spec (parallel) | one redemption |

**Load and soak (record numbers, set no targets):** L1 ticket list for 20,000 rows and a 5,000-row bib import; L2 official release over 5,000 results; L3 event cancel with 2,000 paid places (time to last notice, refund batch resume); L4 promoter with 500 waiting and 50 places freed; L5 2,000 offline scans from 10 desks sent concurrently (conflicts correct, no lock timeouts); L6 analytics ingestion at 200 events a minute.

**Drills.** One drill each of R1, R4, R5, R6 and R8 with a named person per role; time each; fix the runbook where it was wrong.

**Exit criteria for Stage A.** All UAT journeys pass or each failure has an owner-accepted written reason; no P0 or P1 defect open; every acceptance criterion in §13 checked with evidence; contract-checker, i18n-swahili-auditor and security-and-privacy-reviewer reports returned with no open high finding; real-device items done or listed as blockers; the report attached to the checklist rows C3 to C5, C8, C9, C13, C22, C23, C25.

### 18.2 Stage B: controlled live pilot (needs the owner's explicit go-ahead; not part of S7 delivery)

- **Prerequisites:** D35 reviews done; C6, C7 (for any API use), C14, C17, C19 and C24 PASS; the owner's written decision on drafts of legal text (C20); alerts recipients set; support rota named; backup taken; the second-approver flag on.
- **Organizer and event:** one friendly organizer, KYC approved, one event of at most 150 places, one or two distances, labelled manual payments, results by CSV. API access only if the organizer asks (D39 allowlist).
- **Features on:** `EVENTS_ANALYTICS` first; `EVENTS_KIT_OPS`; `EVENTS_KIT_OFFLINE` with an online fallback desk at every collection point; `EVENTS_WAITLIST` only if Stage A passed its waitlist journeys; `EVENTS_RESULTS` and `EVENTS_RUNS`; `EVENTS_REWARDS` with certificates only and the event marked rewards-eligible. **Off:** `EVENTS_RESULTS_PUBLIC` (counsel gate, D48), `EVENTS_MEDAL_ART` (faces policy, security review), Tunzaa path.
- **Timeline:** T-14 days go/no-go meeting with the checklist; T-7 organizer training and desk drill; T-3 desks prepared; T-1 delta refresh and spare desk check; T day event; T+1 sync and review closed; T+3 results provisional release; T+7 official release and payout per R2; T+14 pilot review.
- **What to record (no targets):** funnel counts; payment confirmation time (median and longest) and manual backlog age; refunds and time to pay; kit throughput per desk per hour and the share of scans made offline; duplicates and review items and how they were resolved; waitlist offers made, bought and lapsed; results time to verify; questions and outcomes; support contacts by topic; crash and API error rates from the platform; every incident with its runbook.
- **Stop conditions (any one: pause registrations or switch the feature off, then R1):** a kit counted twice with no explanation; a wrong money state; any personal data shown to the wrong party; sustained 5xx; manual payments older than twice the quoted time with nobody to confirm; a legal complaint. The owner can stop the pilot at any moment.
- **Exit to broad release:** a written pilot report with evidence for every checklist row PASS, or blocked with an owner and a safe fallback (PRD Phase 7 exit); the owner decides. No conversion or latency targets are set until this baseline exists.

---

## 19. Known gaps and reminders (rule 8, stated plainly)

- **Organizer settlement statements are not built** (data seam only); the payout runbook is manual and leaves no system record (D82). **Vendor and trainer settlement have never been exercised against real accounts.**
- **All legal text is draft pending Tanzanian counsel:** event terms and refund policy baseline, claim and consent texts, rights-confirmation text, SLA promises, retention period, API terms, results consent clause, the new analytics sentence. Organizers sign only the KYC consent; no organizer partner terms exist.
- **All flags are off**, including the three new ones; nothing in this slice is on `main`; the S5 and S6 launch gates (D43, faces policy, D35 review) still apply.
- **Swahili:** every string here is a draft; no native review of any slice has happened; glossary clashes listed in §10.4 remain.
- **Offline desk is web only.** Safari on iPhone may evict site storage after a week of inactivity and has stricter service worker limits; Android Chrome is the recommended desk. No native staff scanner exists (D63). Camera performance outdoors is unverified.
- **Not verified by this design:** any behaviour on a real device; the portal and mobile against a live backend; load numbers; the BFast platform parser for raw bodies; Postgres 15+ on production; forwarded-IP behaviour; whether platform logs hold request bodies; push and SMS delivery.
- **Payment provider is changing (D34):** Tunzaa remains unexercised against a sandbox; refunds are paid by hand; provider refunds are not built.
- **Per-member abuse limits and rate windows are in memory per server** (as S5); the real allowance is servers times the limit.
- **Stored in the database after account deletion:** registration personal data persists until the retention job is configured (§6.2); the deletion path for ledger and organizer ownership is as S6.
- **Waitlist stall risk:** one bogus manual transaction id can hold a place for up to 48 hours (D26); mitigated by the unpaid-places cap, not eliminated (D73).
- **Shared `fitflex_ci` database is dirty:** use a fresh isolated database per run.
- **Not built in S7:** offline bib assignment, waitlist for groups, SMS offers, organizer analytics, per-event SLO targets, staff phone app, results age-group rankings, provider refunds.

---

## 20. Open decisions D63 and up (owner; each has a recommended default; none is applied until accepted)

| # | Decision | Recommended default | Effect if changed |
|---|---|---|---|
| **D63** | Where does offline kit scanning live? | A web desk route in the portal (works on a phone browser or laptop); the native staff scanner stays deferred. | A native scanner needs an organizer persona in the mobile app, `mobile_scanner` and an on-device queue; a second implementation of §3. |
| **D64** | How is a ticket verified offline? | SHA-256 lookup in a list the server provides; no secret or MAC code on any device; the server re-verifies at sync. | Public-key signed tickets would verify offline but need a token format v2 and reissued QR codes. |
| **D65** | Conflict rule for two offline scans of one ticket | First item processed wins; later ones are kept as duplicates for a human; nothing is auto-voided. | Earliest device time winning would trust device clocks. |
| **D66** | Bib assignment offline | Not allowed; bibs are pre-assigned. | Allowing it needs global bib uniqueness at sync and a conflict path. |
| **D67** | Manual handover offline (lost phone) | Allowed with reason and ID-check tick; listed in the post-event review. | Forbidding it sends every lost-phone case to an online desk. |
| **D68** | Offline limits | List valid 36 h; 10 desks per event; 2 per staff user; 2,000 unsent scans per desk; clock tolerance 5 minutes. | Longer lists and more desks widen exposure of masked data. |
| **D69** | Ticket not on the desk's list (bought after the list) | Refused offline; no "accept unverified". | An unverified accept would let a forged code take a kit until sync. |
| **D70** | Waitlist scope | Signed-in verified member, one place, self only; no groups, guests, teams or corporate. | Groups need a quantity-aware queue and head-of-line rules. |
| **D71** | Waitlist mechanism | An offer is a real order created by a system actor from stored registration details; strict first-in-first-out per ticket type; a queue gate stops new buyers taking places. | A separate offer or hold object would add inventory paths in rule 6 code. |
| **D72** | Offer window and timing | 12 h, shortened to a quarter of the time left before registration closes (minimum 2 h); no offers in the last 2 h before close; no offers 21:00 to 07:00 event time. | Fixed 24 h windows slow the queue; no quiet hours disadvantage people asleep. |
| **D73** | Payment interplay and place-hoarding | Follow D26 as is (a paid member keeps the hold up to 48 h); limit unpaid places per member to 4. Alternative: a shorter cap (for example 24 h) for waitlist orders, which edits payment hold code and repeats the S4 payment review. | The alternative removes the 48 h stall but touches rule 6 payment code. |
| **D74** | Waitlist abuse limits | 5 live entries per member, 500 per ticket type, 10 joins an hour, 2 lapses end joining for that event, one entry per normalised phone or email per ticket type. | Looser limits invite queue farming; tighter ones hurt honest members. |
| **D75** | Organizer waitlist controls | Counts only; stop new sign-ups; close with notice; no names, no reordering, no manual promotion. | Names or promotion rights invite favouritism and expose personal data (D36). |
| **D76** | Offer channel | Push and in-app only; no SMS. | SMS costs money (Beem) and is the safer channel for people without the app open; revisit after the pilot. |
| **D77** | Analytics model | Aggregate daily counters, no per-event rows, no user, session or device ids, closed allowlist, admin-only dashboard; no organizer-facing analytics. | Per-person funnels need consent, retention and minors review. |
| **D78** | Alert thresholds | Tied to existing promises (24 h confirmation, 5 working day refunds, job cadence); email to `OPS_ALERT_EMAILS`; no conversion or latency targets until pilot data. | Invented numeric targets would be wrong and would train people to ignore alerts. |
| **D79** | Retention and consent | Ship the anonymisation job unset; counsel and the owner set the months; consent text rewritten and version bumped before `EVENTS_KIT_OPS` or `EVENTS_KIT_OFFLINE` go on in production. | Turning kit operations on first would hold more data under a consent that over-states and omits. |
| **D80** | Reward farming guard (S6 M6) | Per-event `rewardsEligible`, default false, set by a FitFlex admin; medals unaffected. | Without it any organizer can create events to farm rewards (S6 open item). |
| **D81** | Pilot structure | Stage A rehearsal on RC (seed data, local flags), then Stage B live pilot of at most 150 places with one friendly organizer, after promotion and the owner's go-ahead. | A larger or earlier pilot raises exposure before the runbooks are proven. |
| **D82** | Organizer payout during the pilot | Manual, two-person, per Runbook R2, with a signed sheet (no system record). Alternative: a pilot with free or very low-priced tickets, or building settlement statements first. | Building settlement first delays the pilot; a manual payout with no record is a control weakness. |
| **D83** | Offline scanning for API clients | No; portal desk only. | API offline would need device-level credentials, a rule 6 change. |
| **D84** | Admin incident controls | Reason required for all; typed confirmation for revoke-all and disable-all; no second person (all reversible); Swahili reason optional. | Four-eyes would slow an incident response. |
| **D85** | Admin pause of an event's registrations | Added (`published <-> registration_closed`, reason, organizer notified, audited). | Without it the only fast stop is a feature flag, which affects every event. |
