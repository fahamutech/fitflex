# Events S5: tickets at the venue, organizer API and signed webhooks (plus payout schedule). Design spec

**Status:** Draft for owner review · **Date:** 2026-10-29 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 5 of `docs/marathon/reuse-map.md` §9 (PRD §16 Phase 5)
**Repos:** `fitflex-functions` (venue operations, API credentials, `/v1/organizer`, webhook dispatcher; §3 to §7), `fitflex-portal` (kit desk, bibs, export, integrations, wizard payout field; §8), `fitflexmobile` (member ticket wording and bib/kit state, gym-scanner guard; §9)
**Ships:** dormant behind three new server flags: `EVENTS_KIT_OPS`, `EVENTS_ORGANIZER_API`, `EVENTS_WEBHOOKS` (each needs `EVENTS_MODULE` and `EVENTS_REGISTRATION`). With all three off, S4 behaviour is unchanged except the payout-schedule field (§3), which belongs to event setup and ships with `EVENTS_MODULE`.
**Binding inputs:** `docs/marathon/decisions.md` D1 to D35 (D3 organizer identity, D5 error envelope and `/v1/organizer` for API-key callers only, D7 offline scanning deferred to S7, D11, D25 organizers never see payer data, D33 payout schedule, D34 no provider work, D35 the owner personally reviews the rule 6 areas); PRD §5.5 KIT-001..010, §5.6 API-001..012, §8, §10, §11, §12 Epics E and F, §13 scenarios 11 to 14 and 19, §16 Phase 5; `docs/marathon/reuse-map.md` §1.1 to §1.3; `docs/marathon/follow-ups.md` (S5 section and the privacy/retention item); `s3-asbuilt.md`, `s4-asbuilt.md`; S2 to S4 design specs.

**Rule 6 and the owner.** CLAUDE.md rule 6 applies: this slice adds a new authentication path (`src/auth/*`), touches the check-in screens (client side only), changes existing endpoint response shapes (additive) and adds a payout-related field. §11.4 lists every file. Per D35 the owner reviews §5 (credentials, token scheme, rate limits), §7.2 (endpoint URL safety) and §7.3 (secret storage) personally before anything reaches `main`.

**Not in scope:** offline scanning queue and offline roster cache (S7, own flag, D7); a staff phone scanner in the mobile app (deferred, §9.4); results, `results:write` and `result.verified` (S6); organizer settlement statements and any payment-provider work (D34); organizer-to-participant messaging tools; waves, checkpoints and volunteer roles (KIT-009, P1); medal and reward logic.

Sources read (RC heads of 2026-10-28/29 in detached read-only worktrees; no branch switched in the shared checkouts): functions `db/migrations/20270110090400-events-tickets-ops.cjs`, `…090600-integration-platform.cjs`, `…091100-events-payments-tickets.cjs`, `src/infra/event-store-pg.mjs` (`appendOutbox`), `src/infra/event-money-store-pg.mjs`, `src/shared/events-ticket-token.mjs`, `src/services/events-payment-service.mjs` (`ticketBody`, `optionsBlock`), `src/auth/jwt.mjs`, `src/auth/events-authz.mjs`, `src/shared/route-guard.mjs`, `src/shared/vendor-rate-limit.mjs`, `src/shared/events-config.mjs`, `src/shared/feature-flags.mjs`, `functions/events-organizer.mjs`, `functions/events-admin.mjs`, `functions/jobs.mjs`, `src/bootstrap/services.mjs` (job registration); portal `app/scan/page.tsx`, `src/components/organizer/event-views.tsx`, `src/lib/events.ts`, `data-table.tsx`; mobile `owner_qr_scanner_page.dart`, `lib/screens/member/events/tickets/*`, `lib/shared/events/event_ticket.dart`, `i18n.dart` (`events.ticket.*`).

Conventions: **EN** English copy, **SW** Swahili draft (every Swahili string needs native review; Swahili runs 20 to 30 % longer, so no layout may depend on English widths). "Backend field" lines list data the UI needs so `fitflex-planner` and `contract-checker` can confirm them; nothing here claims a field exists unless it says "exists".

---

## 1. What exists today, what this reuses, what is new

| Need | Exists (evidence) | Reuse / gap |
|---|---|---|
| Ticket tokens | `EventTicket` with partial unique one-active-per-registration; derived token `ev1.<keyId>.<ticketId>.<version>.<mac>`, `qrPayload = "FFEV1:" + token`, `sha256(token)` in `tokenHash` (unique), `parseToken`, `verifyToken` (constant time), key ring with `EVENT_TICKET_SECRET_PREVIOUS` (`events-ticket-token.mjs`) | S5 resolves by hashing the payload and looking up `tokenHash`, then verifies the MAC against that ticket's registration and event. **No new token code.** |
| Kit table | `EventKitCollection` (status `collected|exception|corrected`, partial unique `collected` per registration, `supersedesId`, `correctionReason`, `collectionPointId` composite FK to the event, `offlineBatchId` unused) | The one-collection rule is already a database fact. S5 adds a few columns (§11.2). |
| Bib table | `EventBibAssignment` with partial uniques: one live bib per `(eventId, categoryId, bibNumber)` and one live bib per registration; releasing keeps the row | S5 adds an event-wide live-bib unique (recommended, §4.3) and API attribution. |
| Denormalised views | `EventRegistration.kitStatus` (`not_ready|ready|collected|exception`), `bibNumber`, `updatedAt` | Written in the same transaction as the ops row. |
| Outbox | `OutboxEvent` (id `obx_…`, `type`, `aggregateType/Id`, `organizerId`, `eventId`, `payload`, `version`, `publishedAt`); `appendOutbox(trx, …)`. Written today: `registration.created`, `registration.cancelled`, `registration.paid`, `ticket.issued`, `ticket.revoked`, `payment.succeeded`, `refund.requested`, `refund.paid` | S5 adds writers for the missing types (§7.1) and the dispatcher. |
| Integration tables | `ApiClient` (hash only, scopes jsonb, status, expiry, rotated/last used), `WebhookEndpoint` (url https CHECK, `secretHash`, events, status), `WebhookDelivery` (one row per endpoint x outbox event, unique) | `secretHash` cannot sign (§7.3). One mutable delivery row cannot record each attempt, so a new attempt table is added (§7.5). |
| Auth | `signPurpose/verifyPurpose` short-lived purpose tokens that `requireAuth` always rejects as sessions; `requireOrganizer*` guards resolving role from `EventOrganizerStaff`; `routeGuard` for bfast's method-blind prefix mounting | The API token reuses `signPurpose`; **`src/auth/jwt.mjs`, `events-authz.mjs` and `route-guard.mjs` are not modified** (§5.2). |
| Rate limiting | In-memory `createVendorLimiter` / `limitOrNull` -> 429 `{ error: 'rate_limited', retryAfterSeconds }` + `Retry-After` | Reused. In-memory per server (real allowance = servers x limit); stated in docs (§5.7). |
| Jobs | `functions/jobs.mjs` cron exports calling `opsService.runJob(name)`; registration in `src/bootstrap/services.mjs` with advisory lock and `JobRun`; per-minute minimum cadence (`*/5 * * * *` style) | Two new jobs (§7.4). |
| Roster list | `GET /organizer/events/:id/registrations` (owner/admin/ops/timing) with masked names before payment, no contact data | Extended with bib/kit and filters; cursor feed added. |
| Portal scanner | `app/scan/page.tsx` has jsQR + `getUserMedia` + manual token box inline, hard-wired to `api.checkIn` | Extract a reusable `QrScanner` component (§8.2); `/scan` keeps behaviour. |
| Portal tables/forms | `DataTable`, `Dialog`, `ConfirmDialog`, `Field`, `Select`, `Segmented`, `Badge`, `Alert`, `EmptyState`, `ErrorState`, `useToast`, `MetricCard`, `PageHeader`; organizer tabs via `EventViewTabs` | All reused. |
| Member ticket page | `MemberEventTicketPage`; `scanning` and `kit.state` already parsed in `event_ticket.dart`; copy keys `events.ticket.scan.soon` / `.live` exist | Wording becomes server-driven (§9.1). |

**New components (with reason):**
1. Portal `src/components/qr-scanner.tsx`: extracted from `app/scan/page.tsx`; no other reusable camera component exists and the kit desk needs it with different result handling.
2. Portal `src/components/organizer/kit-desk.tsx`, `bibs-view.tsx`, `export-view.tsx`, `registration-drawer.tsx`: nothing similar exists.
3. Portal `app/organizer/integrations/page.tsx` + `src/components/organizer/integrations/*` (api-clients, webhooks, deliveries, secret-once dialog, docs panel): no integration UI exists anywhere in the portal.
4. Portal `src/components/secret-once-dialog.tsx`: generic "copy it now" dialog; reused by API client create/rotate and webhook create/rotate.
5. Backend `src/auth/organizer-api-auth.mjs` (token exchange and guard), `src/shared/webhook-url-guard.mjs` (SSRF), `src/shared/webhook-signing.mjs`, `src/services/events-ops-service.mjs`, `events-integrations-service.mjs`, `events-webhook-service.mjs` (§11.4).

---

## 2. Personas and permissions

| Actor | Identity | Kit desk (verify, collect) | Bibs | Roster / sync | Export | Integrations | Payout schedule |
|---|---|---|---|---|---|---|---|
| Organizer owner / admin | `event_organizer`, `organizer_staff`; role from `EventOrganizerStaff` | all, plus **correct / override** | all, bulk, import, re-assign, release | all | yes | API clients + webhooks (the `webhooks:manage` scope: **owner only**) | edit while the event is `draft` |
| Organizer ops | `organizer_staff` | verify, collect, manual lookup | assign to an unassigned person only | read | no | no | read nothing (no Finance tab) |
| Organizer timing | `organizer_staff` | no (tab hidden, 403 `forbidden_role`) | read | read | no | no | no |
| Organizer finance | `organizer_staff` | no | no | no | no | no | read (Finance tab shows it) |
| FitFlex admin, scope `events` | portal admin | read-only history on the admin event page | read | n/a | n/a | sees client/endpoint counts and can disable an endpoint or revoke a client (§5.8) | **edit after publish**, with reason, audited |
| External integration | `ApiClient` (scoped) | `kit:write` | `bibs:write` | `registrations:read` (+ `registrations:demographics`) | no | `webhooks:manage` | none |
| Member / participant | `member` | none (shows own QR) | sees own bib | sees own kit state | n/a | n/a | n/a |

Least privilege rule: **role names are checked in the service as well as the guard** (the `requireActiveOrganizer('owner','admin','ops')` guard is necessary, not sufficient: correction and re-assignment re-check `role in (owner, admin)`). A suspended organizer is read-only (guards `requireOpenOrganizer` for reads, `requireActiveOrganizer` for writes, as in S2). An organizer suspended after issuing API clients: every `/v1` call and every webhook delivery fails closed (`organizer_suspended`; deliveries are held, not sent).

---

## 3. A. Payout schedule (D33) in event setup

**What D33 says:** per event, two options only, `biweekly` and `monthly`, chosen in event setup, required at submit, shown on the organizer Finance tab; replaces D28's "pay after completion" direction and D2's weekly statements for events. Settlement statements are not built, so the field is a **label that the later settlement slice will read**. The UI and API never promise a date or an amount.

### 3.1 Backend
- **Column:** `Event.payoutSchedule text NULL`, `CHECK ("payoutSchedule" IS NULL OR "payoutSchedule" IN ('biweekly','monthly'))` (migration §11.2). No default and no backfill: existing events stay `NULL`.
- **Required at submit, not at create.** `validateEvent(..., { mode: 'submit' })` adds `{ path: 'payoutSchedule', code: 'required' }` when null. Draft saves may leave it empty. 422 `event_invalid { fields }` as today. Invalid value -> `{ path: 'payoutSchedule', code: 'invalid' }`.
- **Lock policy (recommended):**
  - `draft`: owner/admin edit freely (autosave patch like any wizard field).
  - `submitted`: read-only like every other wizard field; "Withdraw" returns to draft and unlocks it.
  - `published` and later: **organizer cannot change it** (PATCH with the field -> 409 `payout_schedule_locked`; the S2 frozen-field rule). A FitFlex admin with scope `events` changes it through `POST /admin/events/:id/payout-schedule { payoutSchedule, reason (10-300 chars) }`.
  - Reason for locking: the schedule is a commercial term FitFlex has accepted when approving the event; changing it after sales start changes when money moves.
  - Each admin change writes an `AuditLog` row `events.payout_schedule_changed` `{ before, after, reason }`, an `EventChangeLog` row (`field = 'payoutSchedule'`, `material = false`, `actorRole = 'admin'`), and a bilingual in-app notice to the organizer owner and admins (`organizer_payout_schedule_changed`).
- **Not a material change** for ORG-007 (participants do not see it, so no change-note requirement).
- **Pre-D33 events** (published with `NULL`): Finance tab shows "Not set" and a FitFlex admin sets it from the admin event page; nothing blocks sales.
- **API shape additions (all additive):** organizer event document `GET/PATCH /organizer/events/:id` gains `payoutSchedule: 'biweekly'|'monthly'|null`; `GET /organizer/events/:id/finance` gains `payoutSchedule`; `GET /admin/events/:id` and the admin list row gain `payoutSchedule`; `GET /events/options` gains `payoutSchedules: ['biweekly','monthly']` so clients never hard-code the list. Public event endpoints never return it. The `/v1/organizer` events list does not return it either.

### 3.2 Portal: wizard placement and copy
**Step 4 "Ticket types"** (key `tickets`), as a `Card` **above** the per-category ticket groups, titled "Payout schedule". Reason: step 4 is where the organizer sets prices and thinks about money; the field is event-level, so it sits once at the top, not per category. The Review step (7) lists it with an Edit link to step 4, and the validation list links to it. Control: `Radio` fieldset with two rows (44px tall minimum), **nothing pre-selected**, required marker. Help text below the legend, then a muted note. Read-only states (submitted/published) show the chosen value as text with the lock line. Admin event page (`/admin/events?event=<id>`): a "Payout schedule" row in the summary with an "Edit" button (scope `events`, published events only) opening a `Dialog` with the two radios and a required reason `Textarea`.

| Key | EN | SW |
|---|---|---|
| `events.payout.title` | Payout schedule | Ratiba ya malipo |
| `events.payout.help` | How often FitFlex pays you for this event's sales. | Mara ngapi FitFlex inakulipa kwa mauzo ya tukio hili. |
| `events.payout.biweekly` | Every two weeks | Kila wiki mbili |
| `events.payout.monthly` | Once a month | Mara moja kwa mwezi |
| `events.payout.note` | This is the schedule you chose. FitFlex confirms payout dates and amounts in your payout statements, which are not live yet. | Hii ndiyo ratiba uliyochagua. FitFlex itathibitisha tarehe na kiasi cha malipo kwenye taarifa zako za malipo, ambazo bado hazijaanza. |
| `events.payout.required` | Choose a payout schedule before you submit. | Chagua ratiba ya malipo kabla ya kuwasilisha. |
| `events.payout.locked` | This is locked after you submit. To change it, contact FitFlex support. | Imefungwa baada ya kuwasilisha. Ili kuibadilisha, wasiliana na msaada wa FitFlex. |
| `events.payout.notSet` | Not set | Haijawekwa |
| `events.payout.finance` | Payout schedule: {schedule} | Ratiba ya malipo: {schedule} |
| `events.payout.admin.edit` | Change payout schedule | Badilisha ratiba ya malipo |
| `events.payout.admin.reason` | Reason (saved in the audit log) | Sababu (huhifadhiwa kwenye kumbukumbu za ukaguzi) |
| `events.payout.admin.done` | Payout schedule changed. The organizer was told. | Ratiba ya malipo imebadilishwa. Mwandaaji ameambiwa. |
| `events.validation.payoutRequired` | Choose how often you want to be paid. | Chagua mara ngapi unataka kulipwa. |
| `organizer.notice.payoutChanged.title` / `.body` | Payout schedule changed / FitFlex changed the payout schedule for {event} to {schedule}. | Ratiba ya malipo imebadilishwa / FitFlex imebadilisha ratiba ya malipo ya {event} kuwa {schedule}. |

**Finance tab** (`view=finance`): one line under the `PageHeader`: "Payout schedule: Every two weeks" (or "Not set"). The existing info `Alert` ("Payout statements are not live yet...") stays and already prevents a date promise. **Acceptance:** AC-A1..A8 (§13).

### 3.3 Tests
Backend `specs/events-s5-payout-schedule.specs.mjs`: submit without schedule -> 422 with path; invalid value; draft patch accepted; submitted/published patch -> 409 `payout_schedule_locked`; admin change needs scope `events` and reason, writes AuditLog + EventChangeLog + notice; value absent from public/`/v1` payloads; migration CHECK rejects `weekly`. Portal e2e: radio required at Review, nothing pre-selected, Swahili strings, Finance line, admin dialog. Existing wizard specs updated for the new required field.

---

## 4. B. Venue operations

### 4.1 Ticket verification (`POST /organizer/events/:id/tickets/verify`)
Guards: `requireEventsKitOps` (404 `feature_disabled` unless `EVENTS_MODULE`, `EVENTS_REGISTRATION`, `EVENTS_KIT_OPS`), `requireAuth('event_organizer','organizer_staff')`, `requireActiveOrganizer('owner','admin','ops')`, wrapped in `routeGuard('post', …)`. The event must belong to the caller's organizer (404 `event_not_found` otherwise, never 403, so existence is not leaked).

**Request:** `{ payload: string }` (max 200 chars; `FFEV1:` + token, or the bare token). Optional `collectionPointId` only to compute the `outside_collection_window` warning.

**Resolution (server-side only, read-only, no writes except audit of failures):**
1. Payload not matching the token grammar -> `400 { error: 'not_event_ticket' }` (this is how a gym QR or random text is told apart; the client shows its own message). Over-length -> 400 `invalid_payload`.
2. `tokenHash = sha256(token)`; look up `EventTicket` by hash. No row -> `unknown`.
3. Load the registration; `verifyToken(ring, token, { registrationId, eventId })` must pass (constant time); failure -> `unknown` and audit `events.ticket_integrity_failed`.
4. `registration.eventId !== :id`: if that event belongs to the **same organizer** -> `wrong_event` with `otherEvent: { title }`; if it belongs to another organizer -> **`unknown`** (a staff member must learn nothing about another organizer's tickets).
5. Ticket status `revoked` or registration `cancelled` -> `revoked` with `reason` (`cancelled|refunded|event_cancelled|admin|replaced`, closed set, no free text). Registration not confirmed (manual lookup only; unpaid places have no ticket) -> `unpaid`.
6. A `collected` kit row exists -> `already_collected` with `collectedAt`, `collectionPointName`, `byFirstName` (staff first name only).
7. Otherwise `valid`.

**Response 200** (a scan outcome is not an HTTP error):
```
{ result: 'valid'|'already_collected'|'wrong_event'|'revoked'|'unpaid'|'unknown',
  registrationId?,            // only for valid | already_collected | revoked | unpaid
  card?: { displayName,       // "Amina M." first name + last initial; never full name
           ticketCode,        // EventTicket.displayCode
           categoryName, distanceM, ticketTypeName, teamName|null,
           bibNumber|null, kitSize|null,
           kit: { state: 'not_ready'|'ready'|'collected'|'exception', collectedAt?, collectionPointName? },
           payment: 'paid'|'unpaid'|'refunded' },
  warnings: ['bib_missing'|'kit_size_missing'|'outside_collection_window'|'bib_changed_after_collection'|'claim_pending'],
  revokedReason?, otherEvent?: { title },
  canCollect: boolean,        // result == valid and caller role may collect
  canOverride: boolean }      // result == already_collected and role in (owner, admin)
```
Never returned: phone, email, date of birth, gender, emergency contact, purchaser identity, order or payment details, the token. `Cache-Control: no-store`.

**Rate limits (in-memory limiter, key shown):** 120/min per staff user; 600/min per event; **failed outcomes (`unknown`, `wrong_event`, `not_event_ticket`) 30/min per staff user** then 429 `rate_limited` (stops token guessing from a staff account; a 128-bit MAC is not guessable anyway, the limit is for abuse noise).
**Audit:** `events.ticket_verify_failed` for `unknown|wrong_event|revoked` (actor, event, outcome; **no payload**, at most one row per actor per outcome per minute); `valid` and `already_collected` are not audited per read (volume; the collection write is audited).

### 4.2 Kit collection

**Replay safety (KIT-002, scenario 11).** A screenshot works exactly like the real QR: it resolves to the same registration, and the **second** collection fails because of `eventkitcollection_collected_unique`, not because of anything in the token. Verification is never trusted by the write: `POST kit-collections` re-resolves the payload itself.

`POST /organizer/events/:id/kit-collections` (roles owner/admin/ops; header `Idempotency-Key` 8 to 100 chars, **required**):
```
{ method: 'scan' | 'manual',
  payload?: string,              // required for scan
  registrationId?: string,       // required for manual
  manualReason?: 'phone_lost'|'no_signal'|'screen_damaged'|'other',   // required for manual
  collectionPointId?: string,    // required when the event has an active collection point
  kitSize?: string, bibNumber?: string,   // optional, see below
  status?: 'collected' | 'exception', note?: string (<= 300) }       // default collected; exception needs note
```
In one transaction: lock the registration `FOR UPDATE`; re-check ticket active / registration confirmed / event status in `published|registration_closed|in_progress` (completed events: read-only; cancelled: 409 `event_cancelled`); insert the `EventKitCollection` row; set `EventRegistration.kitStatus` (`collected` or `exception`), copy `bibNumber`; optionally set `kitSize` (when the person had none) and/or create a bib assignment (`bibNumber`, same rules as §4.3, roles owner/admin/ops only for an unassigned person); append outbox `kit.collected`; write `AuditLog events.kit_collected`; send the participant notice (§4.6). A kit size that differs from the registered one is stored on the collection row and returned as a warning, never silently overwriting.
Responses: `201 { collection: { id, status, collectedAt, collectionPointId }, card }`; `200` with header `Idempotent-Replayed: true` for the same key and body; `409 already_collected { collectedAt, collectionPointName, byFirstName, canOverride }`; `409 ticket_revoked { reason }`; `409 registration_unpaid`; `409 idempotency_key_reused` (same key, different body) and `409 request_in_progress`; `422 collection_point_required | manual_reason_required | note_required | bib_invalid`; `404 registration_not_found | event_not_found`; `429 rate_limited`.
Manual collection (`method: 'manual'`) is the fallback for lost/dead phones: the desk looks the person up (§4.4), checks an ID document in person, and records the reason. It is audited as `events.kit_manual_collected` with the reason code.
`offlineBatchId` stays null; the S7 sync will use it.

**Correction and override (KIT-004), owner/admin only:** `POST /organizer/events/:id/kit-collections/:collectionId/corrections { action: 'void' | 'recollect', reason (10-300 chars, required) }`.
- `void`: inserts a `corrected` row (`supersedesId = collectionId`, `correctionReason`), the superseded row becomes `exception`, `kitStatus` returns to `ready`. Use when the wrong person collected or a kit was recorded by mistake.
- `recollect`: `void` plus a new `collected` row in the same transaction (a second kit for a lost kit, or a replacement). The earlier rows stay as history.
- Ops staff cannot do either; the desk shows "Ask an owner or admin" (key `events.kit.override.ask`). There is no self-service undo for ops (two-step confirm on the desk makes mis-taps rare; an ops "undo within 60 s" is deliberately not built).
- Audit `events.kit_corrected` `{ action, reason, collectionId }`; outbox `kit.collected` is **not** re-sent for `void`; a `registration.updated` with `changed: ['kit']` is (§7.1).
- 409 `already_corrected` if the row is no longer `collected`; 404 for a collection of another event.

**History:** `GET /organizer/events/:id/kit-collections?cursor&limit&status&collectionPointId` (owner/admin/ops) -> `{ items: [{ id, registrationId, displayName, bibNumber, status, collectedAt, collectionPointName, byFirstName, method, manualReason?, correctionReason? }], nextCursor }`. `GET /organizer/events/:id/kit/summary` -> `{ confirmed, collected, remaining, exceptions, byCategory[], byCollectionPoint[] }` (progress header on the desk).
The collection-point `windows` are guidance: scanning outside them only warns.

### 4.3 Bibs (KIT-007)
- **Uniqueness.** The existing partial uniques cover one live bib per registration and per `(event, category, bibNumber)`. **Recommended addition:** a live unique on `(eventId, bibNumber)` so one number identifies one person at the finish line and in S6 result imports; organizers who want per-distance ranges use a prefix (`bibNumber` is text, 1 to 12 chars, `5K-001`). Allowed characters `[A-Za-z0-9-]`, trimmed, case-folded to upper case.
- **Assign one:** `POST /organizer/events/:id/bib-assignments { registrationId, bibNumber, reason?, replace? }` (+ `Idempotency-Key`). Confirmed registrations only. Registration already has a live bib and `replace` is not true -> 409 `bib_already_assigned { current }`. `replace: true` needs owner/admin and a reason (10-300): one transaction sets `releasedAt` and `reason` on the old row and inserts the new one, updates `EventRegistration.bibNumber`. Taken number -> 409 `bib_taken`.
- **Release:** `POST …/bib-assignments/:assignmentId/release { reason }` (owner/admin). If the kit was collected the response carries a warning `bib_changed_after_collection` for the later assignment and the roster flags the row (the printed bib is already in the participant's hands).
- **Bulk by rule:** `POST …/bib-assignments/bulk/preview { categoryId?, start (int), end?, prefix?, padTo?, order: 'registered_at'|'last_name', onlyUnassigned: true }` -> `{ previewHash, count, first, last, conflicts[], shortfall }`; `POST …/bulk { …same, previewHash }` applies **atomically** (all or nothing) and returns 409 `preview_stale` if the roster or taken numbers changed since the preview. Roles owner/admin. Bulk apply writes one `events.bibs_bulk_assigned` audit row (count, range) and `bib.assigned` outbox rows per registration; participant notices are in-app only (no push storm).
- **CSV import:** `POST …/bib-assignments/import/preview { csv }` and `…/import { csv, previewHash }`. Columns `registrationId` (or `ticketCode`), `bibNumber`; UTF-8, header row required, max 2,000 rows and 512 KB, delimiter `,` or `;`; cells beginning `= + - @ tab CR` are rejected as data for the ID column and neutralised on any value echoed back. Preview returns per-row `{ line, status: ok|error, code, bibNumber }` with codes `registration_not_found | bib_taken | bib_duplicate_in_file | bib_invalid | registration_not_confirmed | already_assigned`. **Apply is all-or-nothing**: any error row means nothing is written; the organizer fixes the file. Roles owner/admin.
- **List:** `GET …/bib-assignments?cursor&limit&categoryId&filter=assigned|unassigned&q` (owner/admin/ops/timing) -> `{ items: [{ registrationId, displayName (full name for confirmed), categoryName, bibNumber|null, assignedAt, kit.state }], nextCursor, counts { assigned, unassigned } }`.
- **Event:** outbox `bib.assigned { registrationId, eventId, categoryId, bibNumber, previousBibNumber|null }`.
- **Participant sees the bib** on the ticket page, the registration page and in an in-app notice (§9). The bib shown to a member is the `EventRegistration.bibNumber` value (same transaction as the assignment).
- Bibs may be assigned before payment? **No**: confirmed registrations only. A cancelled registration's live bib is released automatically in the cancel transaction (backend confirmation 12).

### 4.4 Manual lookup (KIT-006)
`GET /organizer/events/:id/kit/lookup?q=` (owner/admin/ops; `q` at least 3 characters; 60/min per user) searches **confirmed** registrations of that event by exact `registrationId`, exact `bibNumber`, exact ticket `displayCode`, or name prefix (first or last). Max 10 results, no "browse all". Each result is the masked card of §4.1 (`displayName` "Amina M.", category, bib, kit state, `ticketCode`), never full names, phone or email. Unconfirmed places return as `unpaid` only when the exact registration id is typed; a name search never lists them. Zero hits -> `{ items: [] }`.

### 4.5 Roster sync and export (Epic E, API-007)
**Dashboard roster** `GET /organizer/events/:id/registrations` (exists; owner/admin/ops/timing) gains `bibNumber`, `kit { state, collectedAt }`, filters `bib=assigned|unassigned`, `kit=collected|remaining|exception`, `updatedSince` (ISO instant) and a **keyset cursor** (replaces the in-memory 2,000-row cut-off, follow-up S3-L3). Roles keep today's field policy (names masked before payment, no contact data). Field policy per role: owner/admin/ops/timing see `participant.name`, category, ticket type, status, bib, kit, kit size, team name, group label, claimed; **no role sees phone, email, date of birth, gender or emergency contact in S5**.

**Change feed** `GET /organizer/events/:id/registration-changes?cursor=&limit=` (the same service backs `/v1`, §5.4). Source: committed `OutboxEvent` rows of registration-scoped types (`registration.created|updated|paid|cancelled`, `kit.collected`, `bib.assigned`) for the event, ordered by a new monotonic `seq` column (migration §11.2).
- Item: `{ seq, eventType, registrationId, changedAt, status, changed?: [...] }`; `?expand=registration` embeds the current minimised record (bounded to `limit <= 100`).
- **Tombstones:** a cancelled registration appears as `{ eventType: 'registration.cancelled', registrationId, status: 'cancelled', cancelledAt, reasonCode }` and its subsequent records carry no names. Rows are never deleted (RESTRICT FKs).
- **Cursor:** opaque base64url of `seq`; `nextCursor` is always returned (the same cursor when nothing is new), plus `hasMore`. A cursor older than outbox retention (90 days) -> 410 `cursor_expired`; the client does a full resync with `GET registrations?updatedSince=`.
- **Commit visibility:** `seq` is assigned before commit, so a long transaction could commit after a later `seq` was already read. The feed therefore only serves rows older than `EVENTS_FEED_LAG_SECONDS` (default 5). Consumers dedupe on the outbox `id` and may overlap cursors; this is documented.
- `updatedSince` on the list uses `EventRegistration.updatedAt`, which every kit/bib/claim write must bump (confirmation 6).

**CSV export** `GET /organizer/events/:id/exports/registrations.csv` (owner/admin only; 5 per hour per organizer; `EVENTS_EXPORT_MAX_ROWS` default 20,000, streamed with keyset paging):
- Columns (fixed, no chooser in S5): `registrationId, ticketCode, firstName, lastName, categoryName, ticketTypeName, status, bibNumber, kitStatus, kitCollectedAt, kitSize, teamName, groupLabel, claimed`. **No phone, email, date of birth, gender or emergency contact** (the privacy line is shown on the page).
- Confirmed and cancelled-after-confirmed rows only; cancelled rows keep id and status but blank names.
- **Formula-injection safe:** any cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'`; all cells quoted; `"` doubled; line breaks inside cells collapsed to a space; UTF-8 with BOM (Excel); `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<slug>-participants-<yyyymmdd>.csv"`, `Cache-Control: no-store`.
- **Audit:** `events.roster_exported` `{ eventId, rowCount, columns hash, actor }` written **before** streaming starts (an aborted download still leaves the row); in-app notice to the other owners/admins is not sent (noise) but the audit line is visible in the admin event audit.
- The portal downloads with an authenticated `fetch` -> `Blob` (a plain link cannot carry the bearer).

### 4.6 Participant visibility and notifications (KIT-008, KIT-010)
- **Ticket payload** (`GET /me/event-registrations/:id/ticket`, `GET /me/event-tickets`) changes: `scanning` = `true` when `EVENTS_KIT_OPS` is on, the event has `kitProvided`, and its status is `published|registration_closed|in_progress`; `kit { state, collectedAt?, collectionPointName? }` where `state` is **computed**: stored `collected|exception`, else `ready` when the registration is confirmed, the ticket active and the event provides a kit, else `not_ready` (no backfill needed, confirmation 7); `bibNumber|null`; `collectionPoints [{ id, name, address, lat, lng, windows [{opensAt, closesAt}], instructions {en, sw} }]` (public event data, exists on the event document; confirm the ticket payload may embed it). `options.tickets.scanning` mirrors the flag.
- **Notices (bilingual in-app + push through `notify`, ids `ntf_<type>_<registrationId>[_<version>]`):** `event_kit_collected` to the participant (claimed) or the purchaser while unclaimed; `event_bib_assigned` (single assigns push; bulk and import are in-app only); both link to the ticket. EN/SW in §10.2. Corrections do not notify.
- **KIT-010 (cancellation/deferral):** event cancellation notices exist (S4 `event_cancelled_refund`, logged as notifications). **Deferral/reschedule communications and an organizer broadcast are not built** and not in S5 (known gap, §14).
- **Cancel guard:** `events.cancelpaid.blocked.kit_collected` already exists in the apps; S5 makes `kitStatus = 'collected'` feed it (confirmation 13).

### 4.7 Gym scanners must refuse event tickets
Event tickets and gym QR codes can be scanned by the wrong scanner. Neither check-in screen may send an `FFEV1:` payload to the check-in API (no server change under `functions/checkins.mjs`):
- Portal `/scan` (uses the extracted `QrScanner`): payload starting `FFEV1:` -> local result card "This is an event ticket..." (key `scan.eventTicket.*`), no request.
- Mobile `owner_qr_scanner_page.dart` `_onDetect`: same prefix test before `_verify` -> bottom message (key `ownerScan.eventTicket.*`), camera resumes.
- The kit desk does the reverse: a non-`FFEV1:` scan is not sent to `tickets/verify`; it shows "This looks like a gym pass, not an event ticket." (the server 400 `not_event_ticket` covers pasted text).

---

## 5. C. Organizer API and credentials (rule 6; owner reviews)

### 5.1 API clients (JWT-authenticated management, owner/admin)
Routes (all `routeGuard`ed, `requireEventsOrganizerApi`, `requireActiveOrganizer('owner','admin')`):

| Method + path | Purpose |
|---|---|
| `POST /organizer/api-clients` | Create `{ name (1-60), environment: 'live'|'sandbox', scopes[], eventIds?: [], expiresInDays? (1-730, default 365) }` -> 201 `{ client, clientSecret }`. **Secret returned once.** |
| `GET /organizer/api-clients` | List (never any secret material): `{ id, clientId, name, environment, scopes, eventIds, status, expiresAt, lastUsedAt, createdAt, createdBy { name }, rotation { inGrace, graceEndsAt } }` |
| `GET /organizer/api-clients/:id` | Detail + usage `{ days: [{ day, requests, errors, rateLimited }] }` (last 30 days) |
| `PATCH /organizer/api-clients/:id` | `{ name?, scopes?, eventIds?, expiresAt? }` (not the secret, not environment). Scope widening to `webhooks:manage` owner only. |
| `POST /organizer/api-clients/:id/rotate` | `{ graceHours: 0 | 24 | 72 }` (default **24**) -> 200 `{ client, clientSecret }` (new secret once) |
| `POST /organizer/api-clients/:id/revoke` | Immediate; idempotent; `{ reason? }` |

- **Credential format:** `clientId = "ffc_" + 16 hex` (public, unique); `clientSecret = "ffs_live_" | "ffs_test_" + 43 base64url chars (256 bits)`. The recognisable prefix lets secret scanners find leaks. Only `sha256hex(secret)` is stored in `ApiClient.secretHash` (a 256-bit random secret needs no slow hash); comparison is constant time over equal-length digests. The secret never appears in logs, audit rows, analytics or error bodies.
- **Scopes (closed list, validated server-side; unknown -> 422 `invalid_scope`):**

| Scope | Grants | Notes |
|---|---|---|
| `registrations:read` | events list; registration list, detail and change feed with the minimised field set (§5.4) | base scope |
| `registrations:demographics` | adds `gender` and `ageOnEventDay` (derived from date of birth; the date itself is never returned) | explicit opt-in (PRD API-008) |
| `kit:write` | `POST …/kit-collections` | needs `registrations:read` to look people up |
| `bibs:write` | `POST …/bib-assignments` (+ batch) | |
| `webhooks:manage` | webhook endpoint and delivery management over the API | **owner may grant; admin may not**; highest risk scope (a leaked key with it can redirect event data), see Q3 |
| `results:write` | **reserved for S6**; not selectable in S5 (422 `scope_not_available`) | |
- **Event restriction:** `eventIds` (null = all of the organizer's events, now and future). Each route checks event ownership first and then the restriction; failure -> 404 `event_not_found`.
- **Limits:** at most `EVENTS_API_MAX_CLIENTS` (default 10) active clients per organizer; expiry is mandatory (no non-expiring clients); the portal shows expiring-soon badges at 14 days and the server sends an in-app notice at 14 and 3 days (reuse the document-expiry reminder pattern, confirmation 17).
- **Rotation policy.** `graceHours = 0`: the old secret dies now (use after a suspected leak, or simply revoke). `24` or `72`: both secrets authenticate until `previousSecretExpiresAt`; a second rotation during a grace window replaces the previous secret (only one old secret ever lives). Access tokens minted from the old secret die at the end of the grace window (the token carries `sv`, the secret version). `GET` shows "Old secret works until {time}".
- **Per-client rate limit:** `rateLimitPerMinute` (default `EVENTS_API_DEFAULT_RATE` = 120; FitFlex admin can raise to 600 per client; organizers cannot).
- **Audit:** `events.api_client_created|updated|rotated|revoked|expired` with actor, `clientId`, scopes diff, grace; never secrets. Created, rotated and revoked also notify the organizer owner (in-app, bilingual) so a rogue admin is visible.
- **Sandbox clients** (`environment = 'sandbox'`, prefix `ffs_test_`): see §5.6.

### 5.2 Authentication of API-key callers (the scheme)

**Chosen: OAuth-style client credentials with a short-lived bearer token.**
1. `POST /v1/organizer/token` with JSON `{ grant_type: 'client_credentials', client_id, client_secret }` (or HTTP Basic). No other route accepts the secret.
2. Success -> `200 { access_token, token_type: 'Bearer', expires_in: 900 }`. The token is `signPurpose('organizer_api', { sub: apiClient.id, cid: clientId, sv: secretVersion }, '15m')` from the existing `src/auth/jwt.mjs`. Scopes and event restriction are **not** in the token; they are read from the `ApiClient` row on every call, so a scope change, revocation, expiry or organizer suspension takes effect on the next request (one primary-key read; no cache, or at most a 5 s cache that revocation invalidates).
3. Every `/v1/organizer/*` call (except `token` and `openapi.json`) sends `Authorization: Bearer <access_token>`; the guard `requireApiClient(scope…)`: verifies purpose `organizer_api`; loads the client; checks `status = 'active'`, not expired, `sv` equals the current version or (previous version and inside the grace window), organizer `status = 'active'`, `environment`, scope; puts `{ apiClientId, organizerId, scopes, eventIds, environment }` on `req.apiClient`; applies the per-client limiter; stamps `lastUsedAt` at most once a minute.

**Why this over the alternatives**
| Option | Verdict |
|---|---|
| **Client credentials -> 15-minute token (chosen)** | The long-lived secret crosses the network on **one** route, which can have the strictest brute-force limits and is the only place to scrub from logs. Everything else carries an expiring token, so a captured request or log line stops working in 15 minutes. Revocation is immediate because scope and status come from the row. New code under `src/auth/*` is one new file (~100 lines) built on `signPurpose/verifyPurpose`; nothing existing changes. Matches PRD API-002 ("OAuth/client credentials"). |
| Static API key on every request | Simpler for integrators but the secret then lives in every request, proxy and platform log (follow-up L5 already worries about platform logs). Rejected. |
| HMAC-signed requests | Needs the raw secret stored reversibly (not a hash), canonicalisation rules integrators routinely get wrong, and clock sync; spreadsheet/Zapier-style timing partners cannot do it. Rejected. |
| mTLS / OAuth with a full authorisation server | Out of proportion. Rejected. |

- **Token isolation.** A token with `purpose` is **never** a session (`requireAuth` returns 401 for any token with a purpose), and `verifyPurpose(token, 'organizer_api')` rejects sessions and other purposes. A staff JWT on `/v1/organizer/*` -> 401 `invalid_token`; an API token on `/organizer/*` -> 401 `unauthenticated`. Both directions are specced.
- **Replay protection.** Reads are safe to replay. Writes **require `Idempotency-Key`** (8 to 100 chars) so a replayed request returns the recorded response (`Idempotent-Replayed: true`) and never creates a second collection/assignment; the database uniques are the final guard. Tokens are short-lived and TLS-only (HTTPS is enforced by the platform; the server sends `Strict-Transport-Security`). No per-request nonce.
- **Token endpoint abuse controls.** 20 requests/min per IP, 10 failures/min per `client_id`; after 20 consecutive failures for a client the client is locked for 15 minutes (429) and an audit row `events.api_token_failed` (aggregated, one per client per 5 minutes) plus an in-app notice to the owner is written. **All failures return the same body**: `401 { error: 'invalid_client' }`, whether the id is unknown, the secret wrong, the client revoked or expired (the audit row records the real reason). An organizer that is suspended gets 403 `organizer_suspended`.
- **Coexistence with JWT routes and `routeGuard`.** `/v1/organizer/...` is a different path root from the JWT routes (`/organizer/...`), so no `app.use` prefix of one set can match the other. Within `/v1/organizer`, bfast still mounts `onGuard` with method-blind prefix matching (`/v1/organizer/events` would also match `/v1/organizer/events/:id/registrations`), therefore **every `/v1` guard is wrapped in `routeGuard(method, …)`**, and `token` and `openapi.json` have no auth guard (their limits run inside `onRequest`). A spec asserts that for every `/v1` route object a request for a different method or sub-path is not blocked by this route's guard, and that no `/v1` route is mounted without `requireApiClient` except those two.
- **Where the code lives.** `src/auth/organizer-api-auth.mjs` (mint + `requireApiClient` + `registerApiClientLookup`, mirroring `registerOrganizerLookup`), routes in `functions/events-organizer-api.mjs` and `functions/events-integrations.mjs`, service in `src/services/events-integrations-service.mjs`. `jwt.mjs` is **not** edited.
- **Weakness to know:** access tokens are signed with the shared `JWT_SECRET`; a leaked `JWT_SECRET` already compromises every session, so no new secret is introduced. The `purpose` and `cid` claims are what keep the two token families apart. A dedicated `EVENTS_API_TOKEN_SECRET` is possible but adds a rotation duty; not recommended.

### 5.3 Error shapes, status codes and headers
D5 applies: `{ error: code, ...extra }`, not PRD's nested envelope. Every `/v1` response carries `X-Request-Id` (generated or echoed if the caller sent a safe one); 5xx bodies include `requestId`.
`400 invalid_request | invalid_cursor | invalid_limit`, `401 invalid_client | invalid_token | token_expired`, `403 insufficient_scope { requiredScope } | organizer_suspended | client_expired`, `404 event_not_found | registration_not_found`, `409 idempotency_key_reused | request_in_progress | already_collected | bib_taken | bib_already_assigned | ticket_revoked | registration_unpaid`, `410 cursor_expired`, `413 payload_too_large`, `422 invalid_scope | scope_not_available | validation_failed { fields }`, `429 rate_limited { retryAfterSeconds }` + `Retry-After` + `X-RateLimit-Limit` / `X-RateLimit-Remaining`, `503 feature_disabled | tickets_unavailable`. A 404 is used for any object outside the client's organizer or event restriction (never 403) so existence is not leaked (scenario 19).

### 5.4 Endpoints (`/v1/organizer`, JSON, camelCase to match the repo)
Cursor pagination: `?limit` (default 50, max 200) and `?cursor` (opaque); responses `{ items, nextCursor }` (+ `hasMore` on the feed). Deterministic sort (`createdAt, id` or `seq`). IDs are the repo's opaque prefixed ids.

| Method + path | Scope | Purpose |
|---|---|---|
| `POST /token` | none | §5.2 |
| `GET /openapi.json` | none | The OpenAPI 3.1 document (cacheable 1 h) |
| `GET /events` | any | Events of the organizer (restricted by `eventIds`): `{ id, title, slug, status, startsAt, endsAt, timezone, categories [{ id, name, distanceM }], collectionPoints [{ id, name }] }`. No pricing, no payout, no terms. |
| `GET /events/:eventId/registrations` | `registrations:read` | List, filters `status=confirmed|cancelled`, `categoryId`, `bib=assigned|unassigned`, `kit`, `updatedSince` |
| `GET /events/:eventId/registration-changes` | `registrations:read` | The feed of §4.5 |
| `GET /registrations/:registrationId` | `registrations:read` | One record; 404 unless it belongs to an event of the client's organizer and restriction |
| `POST /events/:eventId/kit-collections` | `kit:write` | Same body as §4.2 with `method: 'scan'|'manual'`; `staffUserId` is null and the row records `apiClientId` |
| `POST /events/:eventId/bib-assignments` | `bibs:write` | Single assign; `replace` allowed with `reason`; **bulk-by-rule and CSV import are portal only** |
| `POST /events/:eventId/bib-assignments/batch` | `bibs:write` | `{ items: [{ clientRef, registrationId, bibNumber }] }` (max 500); each item has its own result `{ clientRef, ok, bibNumber | error }`; the Idempotency-Key covers the whole batch; not atomic (per item) |
| `GET/POST /webhook-endpoints`, `PATCH /webhook-endpoints/:id`, `POST …/:id/rotate-secret`, `POST …/:id/test`, `GET /webhook-deliveries`, `POST /webhook-deliveries/:id/retry` | `webhooks:manage` | Same service as the portal (§7) |

**Field minimisation (the registration object):**

| Field | `registrations:read` | + `registrations:demographics` | Notes |
|---|---|---|---|
| `id, eventId, categoryId, categoryName, ticketTypeId, ticketTypeName, orderId, status, createdAt, updatedAt` | yes | | `status` is `confirmed` or `cancelled` only (reserved/unpaid places never appear) |
| `firstName, lastName` | yes (null on cancelled) | | the minimum identity a timing partner needs |
| `bibNumber`, `kit { state, collectedAt }`, `kitSize`, `ticketCode`, `teamId, teamName, groupLabel`, `claimed` | yes | | `ticketCode` is the support code, not a credential |
| `gender`, `ageOnEventDay` | | yes | `ageOnEventDay` computed server-side from `dateOfBirth`, which is never returned |
| `phone`, `email`, `dateOfBirth`, `emergencyContact`, payer or payment data, `participantUserId`, `purchaserUserId`, consent text, claim token state, ticket token or hash, amounts | **never** | **never** | Not a scope in S5; see Q1 and Q2 |

### 5.5 OpenAPI, docs and test fixtures (API-010)
- **Document:** `fitflex-functions/docs/api/organizer-api-v1.openapi.json` (OpenAPI 3.1 as JSON to avoid a YAML dependency, confirmation 18), covering every `/v1/organizer` operation, schemas, error codes, security scheme (`oauth2` client credentials, token URL `/v1/organizer/token`), rate-limit headers, and a `webhooks:` section for each event type (§7.1). Served by `GET /v1/organizer/openapi.json` (the same file; `servers[0].url` from `PUBLIC_API_URL`).
- **Guide:** `fitflex-functions/docs/api/organizer-webhooks.md` (envelope, headers, verification samples in Node, Python and PHP, retry table, IP/egress notes, event catalogue) and `docs/api/organizer-api-guide.md` (auth steps with `curl`, pagination, idempotency, sync loop, error table, rate limits, sandbox).
- **Contract tests:** a spec fails if a mounted `/v1/organizer` route has no OpenAPI operation or vice versa, and every example in `specs/fixtures/organizer-api/*.json` validates against its schema (confirmation 18 for the validator).
- **Sandbox (`environment = 'sandbox'`):** a sandbox client sees one built-in fixture event (`evt_sandbox`: three categories, two collection points; fixture file `specs/fixtures/organizer-api/sandbox-event.json`) with 25 clearly fake registrations (names like "Test Runner 01", no phone, email or dates). Reads return fixture data; writes are validated and answered as if applied (including `409 already_collected` on a repeated registration within one idempotency key window) but **persist nothing**, so there is no way to touch real data and no cleanup. Responses carry `X-FitFlex-Sandbox: true`. A sandbox client cannot be pointed at a real event (`eventIds` forced to `['evt_sandbox']`), and `webhooks:manage` in sandbox only allows endpoint tests that deliver synthetic `*.test` events. The same fixtures are published in the guide.

### 5.6 Portal screens: `/organizer/integrations`
See §8.7.

### 5.7 Rate limits documented
Per client (default 120/min, writes share the bucket), token endpoint 20/min per IP, kit desk limits §4.1, export 5/hour/organizer, lookup 60/min/user. The limiter is in memory per server (like all existing limiters): with N servers the effective allowance is up to N times the stated figure; the guide states limits as "at least", never as exact promises.

### 5.8 FitFlex admin visibility
Admin event page "Integrations" block (scope `events`): number of active API clients and endpoints for the organizer, last delivery failure, buttons "Revoke all API clients" and "Disable all endpoints" (audited, reason required). Used for incident response and suspension. Suspending an organizer already blocks `/v1` and delivery (§2).

---

## 6. Shared write rules: idempotency and request ids (portal staff writes and API writes)

One mechanism serves `kit-collections`, `bib-assignments` (single, batch, bulk, import) and corrections, for both staff (JWT) and API callers.
- Header `Idempotency-Key`, 8 to 100 characters, **required** on every write listed above (400 `idempotency_key_required`). The portal generates one per confirm action and reuses it on retry.
- Storage: `OrganizerIdempotency` (migration §11.2), unique on `(scopeType, scopeId, key, route)` where scope is the staff user or the API client. The row is claimed **first** (`in_progress`), the work runs, then the response status and body are stored (`done`). A second request with the same key and the same body fingerprint returns the stored response with `Idempotent-Replayed: true`; a different body is 409 `idempotency_key_reused`; a request that arrives while the first is running is 409 `request_in_progress` (the client retries after a second). Rows live 7 days. Responses that failed validation (4xx before any write) are not stored, so the caller can fix the request and reuse the key.
- The idempotency table is a convenience for clean replays; **the database uniques are the guarantee** (one `collected` kit row per registration, one live bib per registration and per number).
- Every `/v1` response and every new organizer route returns `X-Request-Id`; audit rows for these actions store it in `after.requestId`.

---

## 7. D. Webhooks

### 7.1 Event types shipped in S5

| Type (PRD API-011) | In the outbox today? | S5 |
|---|---|---|
| `registration.created` | yes (S1/S4: written at confirmation) | **Ship.** Meaning: a paid place exists. |
| `registration.paid` | yes (S4, same transaction as `created`) | **Ship.** Same moment as `created`; documented as informational so integrations subscribe to one of them. |
| `registration.cancelled` | yes (member/admin/event cancel, hold expiry of confirmed places) | **Ship.** |
| `registration.updated` | no | **Add.** Emitted on claim, participant detail edit, team change and kit void. Payload lists **which** groups changed, never values: `changed: ['claimed'|'details'|'team'|'kit']`. |
| `kit.collected` | no | **Add** (§4.2). |
| `bib.assigned` | no | **Add** (§4.3). |
| `event.updated` | no | **Add.** On every save of a published event: `{ eventId, version, changedFields[] (paths only), material }`. |
| `event.cancelled` | no | **Add.** `{ eventId, cancelledAt, reasonCode }` from the single cancel transition. |
| `refund.updated` | internal `refund.requested`, `refund.paid` exist | **Ship via a mapper at fan-out time** (no change to refund code): `{ orderId, eventId, scope, status: 'requested'|'paid' }`, **no amounts, no payer data**. `rejected` is added only if the refund service already writes an outbox row for it (confirmation 9). |
| `payment.succeeded`, `payment.failed` | `payment.succeeded` yes | **Not deliverable to organizers in S5.** D25: organizers never see payment details; `registration.paid` already tells them a place is paid. They stay internal outbox rows; not in the subscribable list. |
| `ticket.issued`, `ticket.revoked` | yes | Internal only (a ticket reference is a credential-adjacent id). |
| `result.verified` | no | S6. |
| `registration.reserved` | no | **Decision: not built.** A reserved place is an unpaid 30-minute hold: it is not a registration the organizer can act on, would expose buyer behaviour and capacity churn, and would tempt integrations to treat unpaid people as registered. Integrations that need availability read the event list. |
| `endpoint.verification`, `endpoint.test` | n/a | Control messages for the handshake and test-send, never stored in the outbox. |

The subscribable list is a closed allowlist `WEBHOOK_EVENT_TYPES` in code; wildcard subscriptions (`*`) are rejected so new types never reach existing endpoints silently. Each type has a **projector** (allowlist of payload keys) so a future addition to an outbox payload cannot leak through by default.

**Envelope** (PRD §8, camelCase to match the repo; confirmation 10):
```json
{ "id": "obx_0123456789abcdef", "type": "kit.collected", "version": "1",
  "createdAt": "2027-03-14T05:41:07.123Z", "organizerId": "eorg_…", "eventId": "evt_…",
  "data": { "registrationId": "ereg_…", "collectionPointId": "ecp_…", "collectedAt": "2027-03-14T05:41:07.100Z" } }
```
`id` is the outbox id: stable across endpoints and retries, the consumer's dedupe key. **No names, phones, emails, amounts or tokens** in any webhook; an integration fetches authorised fields with `GET /v1/organizer/registrations/:id`. Payload JSON is serialised once and signed as sent (§7.3). Maximum body 16 KB.

### 7.2 Endpoint registration and URL safety
Routes (JWT, `requireActiveOrganizer('owner','admin')`, and `webhooks:manage` over the API):
`POST /organizer/webhook-endpoints { url, events[], eventIds?, description? }`, `GET`, `GET /:id`, `PATCH /:id { url?, events?, eventIds?, description? }` (a changed URL re-runs the handshake), `POST /:id/rotate-secret { graceHours }`, `POST /:id/test`, `POST /:id/disable`, `POST /:id/enable`. Endpoints are **disabled, never deleted** (delivery history is kept, S1 rule). Max `EVENTS_WEBHOOK_MAX_ENDPOINTS` (default 5) active per organizer. The same URL may be registered by several organizers; each registration has its own secret.

**URL rules at registration (400 `invalid_url { reason }`, reasons: `not_https`, `credentials_in_url`, `bad_port`, `ip_literal`, `blocked_host`, `blocked_address`, `unresolvable`, `too_long`):**
1. `https:` only, port 443 (any other port rejected), no userinfo, no fragment, length <= 2000, host is a DNS name (IP literals rejected, including decimal/octal/hex forms; the URL is parsed with WHATWG `URL`, the host IDNA-normalised to punycode, trailing dot stripped).
2. Host denylist: `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, `*.home.arpa`, `metadata.google.internal`, and a bare single-label host.
3. DNS: resolve **all** A and AAAA records; if there are none -> `unresolvable`; if **any** address is not public the URL is rejected. Blocked ranges: IPv4 `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16` (includes the cloud metadata address `169.254.169.254`), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`; IPv6 `::/128`, `::1/128`, `::ffff:0:0/96` (checked as the embedded IPv4), `64:ff9b::/96` (embedded IPv4), `100::/64`, `2001::/32`, `2001:db8::/32`, `2002::/16` (embedded IPv4), `fc00::/7`, `fe80::/10`, `ff00::/8`.
4. **Re-validated on every delivery, not just at registration** (DNS can change; this defeats rebinding): resolve at send time, apply rule 3 to every returned address, then **connect to a validated address** using a custom `lookup` on the HTTPS agent so the socket cannot dial a different IP than the one checked, with SNI and `Host` set to the original name and normal certificate validation (never `rejectUnauthorized: false`). A blocked address at delivery time records an attempt with outcome `blocked_address`, retries on the normal schedule, and counts towards auto-disable.
5. **Redirects are never followed** (any 3xx is a failed attempt, outcome `redirect_not_followed`); no proxy; request timeout 10 s total (`EVENTS_WEBHOOK_TIMEOUT_MS`); response body read capped at 4 KB then dropped; no cookies; fixed headers (below); no custom headers from the organizer.
6. The resolver is injected so specs can run without the network; there is **no environment switch that allows private addresses** (confirmation 11).

**Verification handshake.** On create (and on URL change, and on re-enable after an auto-disable) the endpoint is `status = 'active'` with `verifiedAt = NULL` and receives **nothing** but a signed control request `{ "type": "endpoint.verification", "challenge": "<32 random chars>" }`. It must answer `200` with JSON `{ "challenge": "<same>" }` within 10 s. On success `verifiedAt` is set; on failure the endpoint stays unverified and the portal shows "Verify again". Unverified endpoints are skipped by the fan-out. (The handshake proves control of the URL and also exercises signature verification on their side.)

**Test-send:** `POST /:id/test { type? }` sends a synthetic `*.test` event (`id: "obx_test_…"`, `data.test: true`) once, shows the result inline, writes an attempt row with `trigger = 'test'`; 10 per hour per endpoint.

**Secret:** `whsec_` + 43 base64url chars, returned once at create and at rotate. See §7.3 for storage.

### 7.3 Signing and secret storage
- **Headers on every delivery:** `Content-Type: application/json`, `User-Agent: FitFlex-Webhooks/1`, `X-FitFlex-Event-Id: <outbox id>`, `X-FitFlex-Event-Type`, `X-FitFlex-Timestamp: <unix seconds>`, `X-FitFlex-Delivery-Attempt: <n>`, `X-FitFlex-Signature: v1=<hex>[,v1=<hex>]`.
- **Algorithm:** `signature = hex(HMAC_SHA256(secret, timestamp + "." + rawBody))` where `rawBody` is exactly the bytes sent. The timestamp and signature are recomputed on **every attempt**; the event id never changes. During a secret-rotation grace window the header carries two `v1=` values (new secret first, old second); consumers accept if any matches.
- **Consumer rules (documented with code samples and test vectors):** verify on the raw body before parsing; recompute and compare in constant time (`crypto.timingSafeEqual`, `hmac.compare_digest`, `hash_equals`); reject if `|now - timestamp| > 300` seconds (replay window); dedupe on `X-FitFlex-Event-Id` because delivery is at-least-once; answer 2xx quickly and process asynchronously. A **known-answer vector** (fixed secret, timestamp, body -> expected hex) is in the guide and in `specs` so every language sample is testable.
- **Why the secret cannot be only a hash.** HMAC needs the raw key at signing time; a hash would only allow verification of something the organizer sends. `WebhookEndpoint.secretHash` (S1) stays as a **fingerprint** (sha256 of the secret, shown as `whsec_…abcd` last four) and a new column `secretCiphertext` stores the secret **encrypted at rest with AES-256-GCM** under `EVENTS_WEBHOOK_SECRET_KEY` (32 bytes base64) with `secretKeyId` and a `EVENTS_WEBHOOK_SECRET_KEY_PREVIOUS` ring, the same key-ring pattern as `EVENT_TICKET_SECRET`. A database leak alone yields no usable secret. A derived-secret design (HMAC of the endpoint id under a master key) was considered and rejected: rotating the master would silently change every customer's secret. The ciphertext is never returned by any route; decryption happens only inside the dispatcher. If the key is missing, `options.ops.webhooks` is false and the dispatcher does nothing (fail closed). The key is distinct from `EVENT_TICKET_SECRET` and `JWT_SECRET`.

### 7.4 Dispatcher (jobs on the existing ops framework)
Two cron jobs in `functions/jobs.mjs`, registered in `src/bootstrap/services.mjs` like `event-hold-expiry` (advisory lock + `JobRun`, skipped when `EVENTS_WEBHOOKS` is off, safe to overlap):

**`event-webhook-fanout` (every minute).** In one transaction: `SELECT … FROM "OutboxEvent" WHERE "publishedAt" IS NULL AND "createdAt" < now() - lag ORDER BY "createdAt", id LIMIT 200 FOR UPDATE SKIP LOCKED`. For each row with a non-null `organizerId` and a type in the allowlist (after the refund mapper), insert deliveries with a single guarded statement:
`INSERT INTO "WebhookDelivery" … SELECT … FROM "WebhookEndpoint" e WHERE e."organizerId" = $row.organizerId AND e.status = 'active' AND e."verifiedAt" IS NOT NULL AND e.events ? $type AND (e."eventIds" IS NULL OR e."eventIds" ? $row.eventId) AND e."createdAt" <= $row.createdAt ON CONFLICT ("endpointId","outboxEventId") DO NOTHING`.
Then set `publishedAt`. Rows with no organizer, an internal-only type or no matching endpoint are just marked published. Endpoints created later never receive older events. **The organizer match is in the SQL join, not in application code** (follow-up S5 fan-out guard), and the deliver step re-checks `endpoint.organizerId = outbox.organizerId` and that the event belongs to that organizer before sending; a mismatch marks the delivery `dead` with outcome `organizer_mismatch` and writes a high-severity audit row.

**`event-webhook-deliver` (every minute, loops up to ~50 s).** Claim due rows without holding a transaction open during HTTP: `UPDATE "WebhookDelivery" SET "leaseUntil" = now() + interval '60 seconds' WHERE id IN (SELECT id … WHERE status IN ('pending','failed') AND "nextAttemptAt" <= now() AND ("leaseUntil" IS NULL OR "leaseUntil" < now()) ORDER BY "nextAttemptAt" LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING …`. Deliver with concurrency 10 overall and at most 2 in flight per endpoint host; one slow endpoint cannot starve the others. Each attempt writes a `WebhookDeliveryAttempt` row and updates the summary row.
- **Ordering:** at-least-once, **not strictly ordered**. Rows are claimed oldest-first per endpoint, but retries interleave. The envelope carries `createdAt` and the guide tells integrations to treat the API as truth (`GET registration`) and use `createdAt` / `updatedAt` to ignore stale events. Per-endpoint strict ordering is not offered because one failing event would block everything behind it.
- **Retry schedule** (jittered +-20 %): attempt 1 now, then +1 min, +5 min, +15 min, +1 h, +3 h, +6 h, +12 h, +24 h; `EVENTS_WEBHOOK_MAX_ATTEMPTS` default 10 (about 47 hours). 2xx = delivered. Retry on every other outcome (3xx, 4xx including 408/429, 5xx, timeout, network, TLS, blocked address). Exception: `410 Gone` -> `dead` at once and the endpoint is disabled with reason `endpoint_gone`. After the last attempt -> `dead` (the dead-letter view).
- **Auto-disable.** An endpoint with 30 consecutive failed attempts and no success for 24 hours (or no success for 72 hours with at least 10 failed deliveries) is set `disabled` (`disabledReason = 'auto_failures'`, `disabledAt`). The organizer owner and admins get a bilingual in-app notice (push on) and the Integrations page shows an `Alert`. Events that occur while it is disabled are **not** fanned out to it (they stay available through the change feed and API). Re-enabling requires a successful verification handshake and offers "Redeliver missed events" (events from the last 7 days, created after `disabledAt`, queued once).
- **Manual retry:** `POST /organizer/webhook-deliveries/:id/retry` (owner/admin; `webhooks:manage` over the API). Allowed for `failed|dead`; sets `status = 'pending'`, `nextAttemptAt = now`, increments `manualRetryCount`. Bounded: 5 manual retries per delivery per 24 h and 30 per endpoint per hour (429). Idempotent: if the delivery is already pending/leased it returns 200 `{ alreadyQueued: true }`. The event id is unchanged, so consumers dedupe. Attempt rows are tagged `trigger = 'manual'`.
- **Job metrics** to `JobRun` stats: fanned out, delivered, failed, dead, auto-disabled, oldest pending age.

### 7.5 Delivery log, redaction, retention, health
- **`WebhookDeliveryAttempt`** (new): `id, deliveryId (ON DELETE CASCADE), endpointId, attemptNo, trigger ('auto'|'manual'|'test'|'verify'), startedAt, durationMs, outcome ('success'|'http_error'|'timeout'|'network_error'|'tls_error'|'blocked_address'|'redirect_not_followed'|'organizer_mismatch'), responseCode, responseSnippet (<= 200 chars), errorCode, nextAttemptAt`. `WebhookDelivery` stays the summary (`status, attemptCount, lastAttemptAt, responseCode, lastError, nextAttemptAt, deliveredAt, manualRetryCount, leaseUntil`). This satisfies API-005 (every attempt, response code, retry schedule, last error).
- **Redaction:** response snippet only for text content types, control characters stripped, truncated to 200 chars, and any substring matching `whsec_…`, `ffs_…`, `Bearer …`, JWT shape, 24+ character base64/hex runs, email addresses or phone-like numbers is replaced by `[redacted]`; `lastError` is a code (`timeout`, `dns_failure`, `connection_refused`, `tls_error`, `http_503`), never an exception message; request headers and bodies are not stored (the body is reproducible from the outbox row and is PII-free); organizer-visible views show the payload through the projector, not raw columns.
- **Retention:** attempts 30 days, deliveries 90 days, published outbox rows 90 days (also the feed cursor lifetime), via a daily job `event-webhook-retention`. Usage counters 90 days.
- **Health summary (ORG-010):** `GET /organizer/webhook-endpoints` returns per endpoint `{ status, verifiedAt, lastSuccessAt, last24h { delivered, failed, dead }, pending, oldestPendingAgeSeconds, consecutiveFailures, health: 'healthy'|'degraded'|'failing'|'disabled'|'unverified' }` (healthy: no failure in the last hour; degraded: failures but success within 24 h and pending age < 1 h; failing: otherwise). `GET /organizer/integrations/health` returns the aggregate for the Overview card and the event page: `{ endpoints, healthy, degraded, failing, disabled, deadLast24h, apiClients { active, expiringSoon } }`.
- **Deliveries list:** `GET /organizer/webhook-deliveries?endpointId&status&eventId&cursor` -> `{ items: [{ id, endpointId, eventType, eventId (outbox id), status, attemptCount, createdAt, lastAttemptAt, nextAttemptAt, responseCode, lastError }], nextCursor }` and `GET /…/:id` adds `attempts[]` and the payload (projected).

---

## 8. Portal (`fitflex-portal`)

### 8.1 Navigation, routes, flags
- Event tabs (`EventViewTabs`) gain, by role and options: **Kit collection** `view=kit` (owner/admin/ops), **Bib numbers** `view=bibs` (owner/admin/ops/timing; write controls by role), **Export** `view=export` (owner/admin). They appear only when `useEventsOptions().ops.kit` is true and the event `hasRegistrationData`. At 375 px the `Segmented` control scrolls horizontally (never wraps); the active tab is scrolled into view.
- Organizer nav gains **Integrations / Miunganisho** (`/organizer/integrations`, owner/admin, `ops.api || ops.webhooks`, organizer status `active`). Overview gains an "Integration health" `MetricCard` (§8.7).
- `GET /events/options` gains `ops: { kit, api, webhooks }` and `tickets.scanning`; the portal never infers availability from the build flag alone. 404 `feature_disabled` renders the existing "not available yet" state.
- Deep links: `/organizer/events?event=<id>&view=kit|bibs|export`, `&registration=<id>` opens the drawer (§8.5), `/organizer/integrations?tab=clients|webhooks|deliveries|docs[&endpoint=<id>]`. Back goes to the previous view of the same event, then to the events list. After a completed action the user stays on the page (desk, bibs); creating a client or endpoint ends on its detail row with the secret dialog first.

### 8.2 Component: `QrScanner` (extracted from `app/scan/page.tsx`)
Props `{ active: boolean; onDecode(text: string): void; cooldownMs?: number (default 2000, same text suppressed); labels }`. Owns: `getUserMedia({ video: { facingMode: 'environment' } })`, canvas + `jsQR` tick loop, stopping tracks on unmount, on `active=false` and on `visibilitychange` hidden. Exposes a state through `onState`: `idle | requesting | active | denied | unsupported | insecure | no_camera | error`. `unsupported` = no `navigator.mediaDevices`; `insecure` = `!window.isSecureContext`. It does **no** network call and knows nothing about check-in or tickets. `/scan` is refactored to use it with unchanged behaviour (existing Playwright specs for `/scan` must pass untouched; this is a rule 6 adjacent change, §11.4).
Accessibility: the `<video>` has `aria-label` "Camera preview" and `playsInline muted`; start/stop is a real `Button`; state text is rendered in a `role="status"` region; a `prefers-reduced-motion` aware viewfinder frame (no flashing).

### 8.3 Page: Kit collection (`view=kit`)
**Purpose:** let desk staff verify tickets and record handovers quickly and correctly.

**Layout, desktop (>= 1024 px):** `PageHeader` (event title + status badge + "Back"), `EventViewTabs`, then a top bar: **Collection point** `Select` (remembered per event in `sessionStorage`; required when the event has active points), a progress chip "412 of 1,250 collected" (`GET kit/summary`, refreshed after each handover and every 60 s), and an offline indicator. Below, two columns: left (5/12) **Camera** card (`QrScanner`, 4:3, Start/Stop button) with a **manual box** (`Field` "Ticket code or QR text" + "Check ticket" button) and a **Find a participant** search `Input` (min 3 chars, results list of masked cards); right (7/12) the **Result card**.
**Phone (375 px):** single column in this order: top bar, camera (max 40 vh, sticky while scrolling), result card, manual and search below. Primary buttons are full width, 56 px tall; every control at least 44 px.

**Result card (the large state panel).** A full-width panel with icon + a big plain-language word, then the details. Colour is never the only signal.
| Result | Tone / icon | Heading | Body and actions |
|---|---|---|---|
| `valid` | success, `CheckCircle2` | Ready for kit | Name (28 px semibold), **bib in 48 px bold** (or "No bib yet" warning chip), category + distance, kit size, ticket code. Warning chips. Primary **Hand over kit** (autofocused); if `bib_missing` and role may assign, inline "Assign bib" field. Secondary "Cancel". |
| `already_collected` | warning, `AlertTriangle` | Kit already collected | "Collected {time} at {point} by {name}". Owner/admin: **Record again (override)** opens the reason dialog. Ops: text "Ask an owner or admin to override." No collect button. |
| `wrong_event` | warning | Ticket for a different event | "This ticket is for {title}." (same organizer only). |
| `revoked` | danger, `XCircle` | Ticket cancelled | Reason line (cancelled / refunded / event cancelled). No collect button. |
| `unpaid` | danger | Not paid yet | Only reachable from manual lookup. |
| `unknown` / 400 `not_event_ticket` | danger | Code not recognised | "Try again or search by name." |
| Gym QR scanned | info, `Info` | This looks like a gym pass | Not sent to the server. |
After a successful handover the card turns to a success state "Kit recorded for {name}" for 2 s with `aria-live`, then clears and the scanner resumes; **Scan next** is a real button to skip the wait. Failure to save (network/5xx): card stays on screen, error `Alert` with **Retry** (same `Idempotency-Key`, so a retry cannot double-record).
**Flow:** scan or paste -> `POST tickets/verify` (loading skeleton in the card, camera paused) -> result card -> confirm -> `POST kit-collections` (generates one `Idempotency-Key` per confirm attempt, reused on retry) -> success -> resume. Manual lookup selection -> `Manual handover` dialog: reason `Select` (phone lost / no signal / screen damaged / other), "I checked their photo ID" checkbox (required, copy only; not stored beyond the reason code), then confirm.
**Override dialog** (owner/admin): title "Record a second handover?", body, required reason `Textarea` (10 to 300, counter), confirm button disabled until valid; calls `corrections { action: 'recollect' }`. A separate row action "Void handover" lives in the registration drawer (§8.5).

**States:** loading (skeleton for top bar and card), no collection points configured (point select hidden, helper "This event has no collection points; handovers are recorded without one"), event not open for kit (`EmptyState` "Kit collection opens when the event is published"), event completed (read-only history, scanner disabled), event cancelled (`Alert` danger, scanner disabled), **offline** (`navigator.onLine` false or a network error: sticky `Alert` warning "You are offline. Scanning needs a connection. Offline scanning is not available yet."; verify and confirm buttons disabled; **nothing is queued**), camera denied/unsupported/insecure/none (card text + the manual box becomes the primary path), error (`ErrorState` + retry), forbidden role (`Forbidden`; tab hidden), 429 (`Alert` "Too many scans. Wait {n} seconds."), partial (summary failed to load: header chip hidden, scanning still works), pending-approval/suspended organizer (read-only banner; confirm disabled).
**Keyboard and focus:** tab order is point select -> Start camera -> manual box -> Check ticket -> search -> result card actions. After a result appears focus moves to the result heading (`tabIndex=-1`, announced via `role="status" aria-live="assertive"` on the heading text); with a `valid` result focus goes to **Hand over kit**. After a handover focus returns to the manual box. `Esc` cancels the current result. The scanner is fully usable with a USB/Bluetooth barcode reader typing into the manual box followed by Enter (the box keeps focus and clears after each submit): a common desk setup and the keyboard-accessible path.

### 8.4 Page: Bib numbers (`view=bibs`)
`PageHeader`, tabs, then a summary strip (`MetricCard`s: Assigned, Unassigned, per category counts) and an action row: **Assign in bulk** (owner/admin), **Import CSV** (owner/admin), **Download sample CSV**. `DataTable` (`label="events.bibs.tableLabel"`, server cursor paging via "Load more"), columns: Participant (name), Category, Bib (inline edit button "Assign" / the number), Kit, Assigned at. Filters: category, assigned/unassigned, search (name/bib/code). Row actions by role: ops "Assign" only when unassigned; owner/admin "Change", "Release". **Assign / Change dialog:** bib input (uppercase, `[A-Za-z0-9-]`, <= 12), reason `Textarea` when changing (10 to 300), inline error `bib_taken` with the current holder's name masked. **Bulk dialog:** category select (or all), start, optional end, prefix, zero padding, order (by registration time / by last name), "Only people without a bib" (on, locked in S5); **Preview** -> table of the first/last 5 and counts, conflicts list, shortfall `Alert`; **Apply** disabled until a fresh preview; 409 `preview_stale` -> "Registrations changed. Preview again." **CSV dialog:** file input (CSV only, <= 512 KB), parse nothing locally except size/type, upload text to `import/preview`, show `{ok} ready, {bad} with problems`, a problems table (line, code, message), **Apply** enabled only when `bad = 0`, then toast. All writes show a result toast; success announces count via `aria-live`.
States: loading skeleton; empty "No confirmed registrations yet"; error + retry; read-only for timing (no actions); suspended organizer (read-only); partial (bib set but kit collected -> warning badge "Bib changed after kit handover").

### 8.5 Registration drawer (ticket detail for staff)
`/organizer/events?event=<id>&view=registrations&registration=<id>` (also opened from the kit desk, bibs and roster rows). A right-side `Dialog` panel (full screen on phone). Contents: masked-card header (name, ticket code, category, status badge), **Ticket** (state active/revoked + reason; "Ticket codes are never shown to organizers" line), **Kit** timeline (collected / voided / corrected rows with time, point, staff first name, reason), **Bib** history (assigned, released, reason), actions by role (ops: Assign bib if none; owner/admin: Change/Release bib, Record kit manually, **Void handover**, Record again), and, for owner/admin, "Activity" lines from the audit (kit and bib events for this registration only). No phone, email, date of birth or emergency contact. 404 -> "This registration isn't part of this event" (the same state as another event's id, scenario 19).

### 8.6 Page: Export (`view=export`)
`Card` with the purpose line, the **fixed column list** (chips), the privacy line (key `events.export.privacy`), a row count preview from `registrations/summary`, **Download CSV** (owner/admin), and the audit notice. States: downloading (button loading), success toast "Download started", 429 (5 per hour) message with the retry time, too large (> `EVENTS_EXPORT_MAX_ROWS`) message, error + retry, forbidden. The file opens in Excel with correct Swahili characters (BOM).

### 8.7 Page: Integrations (`/organizer/integrations`)
Tabs (`Segmented`): **API clients**, **Webhooks**, **Delivery log**, **Docs**. Owner/admin only (others see `Forbidden`). `PageHeader` actions: "New API client" / "Add endpoint" depending on the tab.

**API clients tab.** `DataTable` (`label`): Name, Client ID (copy button, monospace), Environment badge (Live / Test), Scopes (up to 2 chips + "+n"), Expires (badge "Expires in 12 days" warning under 14 days, "Expired" danger), Last used ("Never used" / relative), Status badge (Active / Revoked / Expired / Rotation in progress). Row actions: Details, Rotate, Revoke.
- **Create dialog:** name `Input`; environment `Radio` (Test is the default; "Live" needs the second confirmation line "Live clients can read real participants"); **scope picker**: `Checkbox` list, each row with a plain-language description and a risk chip (Read / Write / High risk); `registrations:demographics` shows the line "Adds gender and age on event day"; `webhooks:manage` is shown disabled with "Only the owner can grant this" for admins; `results:write` listed as "Coming soon" (disabled); event restriction `Radio` (All events / Selected events with a multi-select); expiry `Select` (30, 90, 180, 365 days).
- **Secret-once dialog** (`SecretOnceDialog`, shared): shows Client ID (copy) and Client secret (monospace, selectable, `Copy` button with confirmation text "Copied", not a toast alone), the warning "Copy your secret now. You won't be able to see it again.", links to the guide, a required checkbox **"I have saved the secret"** enabling **Done**. `Esc` and backdrop click are disabled until the box is ticked (to avoid accidental loss); the secret is held only in component state, cleared on close, never written to storage, URL, logs or analytics, and the dialog sets `aria-describedby` to the warning. Focus returns to the table row.
- **Rotate:** `ConfirmDialog` with `graceHours` radio (No overlap, old secret stops now / 24 hours overlap (default) / 72 hours overlap) and the explanation, then the secret-once dialog. **Revoke:** `ConfirmDialog` (danger) "Revoke {name}? Anything using it stops working immediately. This can't be undone." with a typed confirmation of the client name.
- **Details panel:** the fields, **usage** (last 30 days requests/errors/rate-limited as a small bar chart with a table alternative for screen readers), "Old secret works until {time}" when in grace, curl example for the token call, and an audit list (create/rotate/revoke with actor and time).
- Empty: "No API clients yet" + body + "New API client". Max reached: the action is disabled with explanation.

**Webhooks tab.** `DataTable`: URL (host shown, full URL in `title`), Events (count + popover list), Health badge (Healthy / Degraded / Failing / Disabled / Not verified), Last success, Pending, Failed (24 h), actions (Details, Send test, Disable/Enable, Rotate secret). Create dialog: URL `Input` type url (inline `invalid_url` reasons in plain language), events `Checkbox` list grouped (Registrations / Kit and bibs / Event) with "Select all" (explicit selection, no wildcard), event restriction, description. After create: secret-once dialog, then the endpoint shows **Not verified** with a "Verify now" button that runs the handshake and reports pass/fail inline ("We sent a challenge to {host}. It answered correctly." or the failure reason code in words). **Auto-disabled** endpoints show a danger `Alert` with the reason, time and "Enable again" (runs verification, then offers "Redeliver missed events"). Details panel: health numbers, last 10 attempts, signing instructions link, "Send test" result.

**Delivery log tab.** Filters: endpoint, status, event type, event id, date. `DataTable`: Time, Event type, Event id (copy), Endpoint, Status badge (Delivered / Retrying / Failed / Gave up), Attempts, Response code, Next attempt. Row -> detail drawer with the attempt list (time, duration, outcome in words, code, redacted snippet) and the projected payload (no PII exists in it) and **Retry now** (disabled for delivered; shows remaining manual retries; 429 message). Dead-letter filter chip "Gave up".

**Docs tab.** Static content: base URL, 5-step quick start (create a test client, get a token, list events, read changes, verify a webhook) with copy buttons, rate limits table, error table, signature verification snippets (tabs Node / Python / PHP), link to download `openapi.json`, sandbox explanation. All strings through `t()`; code samples are not translated.

**Overview card (ORG-010):** `MetricCard` "Integrations" with "3 healthy, 1 failing" and a link; the event page shows a small badge when a webhook is failing.

**States (all tabs):** loading skeleton, empty, error + retry, forbidden, not available (flag off / missing key `ops.webhooks=false` -> "Webhooks aren't available yet"), suspended organizer (read-only, banner), partial (health fetch failed -> table without health badges plus a muted notice).

### 8.8 Accessibility and responsive rules (all new portal screens)
Every actionable control has a visible label or `aria-label` (icon-only buttons: "Copy client ID", "Copy secret", "Remove", "Scan next"); tables use `label`; dialogs trap focus and return it (existing `Dialog`); status is text + icon + colour; error messages use `role="alert"` or the field `aria-describedby`; result announcements `aria-live`; targets >= 44 px (56 px for desk primary actions); contrast follows existing tokens (text-800 on tone-50, the pairs `scan/page.tsx` already uses, >= 4.5:1); no horizontal page scroll at 375 px (tables scroll inside their labelled region); Swahili strings may wrap, no fixed-width buttons; monospace values wrap with `break-all`. Document titles `"{page} · FitFlex"`.

---

## 9. Mobile (`fitflexmobile`, member)

### 9.1 Member ticket page (`MemberEventTicketPage`) changes
Driven by the server: the ticket payload's `scanning` (mirrors `options.tickets.scanning`) and `kit.state`.
- `scanning == false`: unchanged S4 info alert (`events.ticket.scan.soon`: "Kit collection scanning isn't live yet...").
- `scanning == true`: the alert is replaced by the live wording `events.ticket.scan.live` ("Show this code at the kit collection point.") **plus** a kit block.
- **Kit block (new, below the QR):** state chip from `kit.state`: `not_ready` "Kit not ready yet", `ready` "Kit ready to collect", `collected` "Kit collected", `exception` shown as `not_ready` (staff exceptions are internal; the participant is told to ask the organizer: `events.ticket.kit.exception`). When `ready`: collection point name, address, today's/next opening window in the event timezone and the organizer's instructions (language by locale), and a "Directions" text button only if `lat/lng` exist (open maps intent; needs a real device). When `collected`: "Collected {date} at {point}" and the QR stays visible with a "Collected" badge and the note "You don't need to show this code again." (the QR is not removed: the code is still the entry credential for later slices, and hiding it would confuse people).
- **Bib:** when `bibNumber != null`, a large "Bib {number}" row (display type, `Semantics` label "Bib number {number}") above the kit block; also on `MemberEventRegistrationPage` and the tickets list row ("Bib 1042" in the subtitle). No bib: "Bib number will appear here once the organizer assigns it".
- **States:** loading / error / offline-with-cache / revoked / claimed-elsewhere / not issued remain as in S4 §5.5. The cached ticket stores `kit` and `bib`; offline the chip shows "Saved on this phone · updated {time}" and the kit state may be stale (the line `events.ticket.kit.staleHint`: "Kit status may have changed. Connect to refresh."). Pull-to-refresh re-fetches; the page refetches on app resume and when a push `event_kit_collected` arrives.
- **Notifications:** `event_kit_collected` and `event_bib_assigned` open the ticket (add both to `memberRouteFor`).
- **Layout:** phone single column; >= 840 px (Flutter web desktop) two columns: QR left, kit/bib right; Swahili strings wrap; targets >= 48 dp; every chip and the bib row has `Semantics`.

### 9.2 Staff scanning on a phone (decision)
**Not in S5.** A web scanner in the portal covers desk work (laptop, tablet or phone browser, plus USB scanners), is reviewable without an app release, and avoids a second scanning implementation. Mobile staff scanning is deferred and **listed**: it would need an organizer persona in the mobile app (today organizers are portal-first; the mobile app has no `event_organizer` shell), a camera flow on top of `mobile_scanner`, and the S7 offline queue, which is the real driver for a native scanner. Recorded in §14 and the owner can pull it forward.

### 9.3 Gym scanner guard (client only)
`owner_qr_scanner_page.dart`: before `_verify`, if `code.startsWith('FFEV1:')` show the message (`ownerScan.eventTicket.title` / `.body`), do not call `operatorVerifyQr`, resume the camera after 2 s. Test: a unit test over a pure helper `isEventTicketPayload(String)` and a widget test with a fake scan.

### 9.4 Mobile tests (`test/events/*`)
`event_ticket_test`: parses `kit` with `collectedAt/point`, `bibNumber`, collection points; `member_event_ticket_page_test`: scanning false shows the soon alert; scanning true shows live wording; each kit state label; bib row and semantics; collected badge keeps the QR; stale cache hint offline; Swahili render with long strings (no overflow at 320 dp); notification routing for the two new types; `owner_qr_scanner_test`: `FFEV1:` is refused locally; i18n parity test picks up new keys.

---

## 10. Copy: i18n keys (EN and SW draft; native review needed)

### 10.1 Portal (`src/lib/i18n.ts`, both maps; every string through `t()`)
Payout keys are in §3.2. Interpolation uses `{name}` style as elsewhere.

| Key | EN | SW |
|---|---|---|
| `organizer.events.view.kit` | Kit collection | Uchukuaji wa vifaa |
| `organizer.events.view.bibs` | Bib numbers | Namba za mbio |
| `organizer.events.view.export` | Export | Pakua orodha |
| `organizer.nav.integrations` | Integrations | Miunganisho |
| `events.kit.title` | Kit collection | Uchukuaji wa vifaa |
| `events.kit.point.label` | Collection point | Kituo cha kuchukulia |
| `events.kit.point.required` | Choose where you are working | Chagua mahali unapofanyia kazi |
| `events.kit.progress` | {done} of {total} collected | {done} kati ya {total} wamechukua |
| `events.kit.camera.start` / `.stop` | Start camera / Stop camera | Washa kamera / Zima kamera |
| `events.kit.camera.preview` | Camera preview | Mwonekano wa kamera |
| `events.kit.camera.denied` | Camera access is blocked. Allow the camera in your browser settings, or type the ticket code below. | Kamera imezuiwa. Ruhusu kamera kwenye mipangilio ya kivinjari, au andika msimbo wa tiketi hapa chini. |
| `events.kit.camera.unsupported` | This browser can't use the camera here. Use the code box below. | Kivinjari hiki hakiwezi kutumia kamera hapa. Tumia kisanduku cha msimbo hapa chini. |
| `events.kit.camera.insecure` | The camera needs a secure (https) page. | Kamera inahitaji ukurasa salama (https). |
| `events.kit.camera.none` | No camera was found on this device. | Hakuna kamera kwenye kifaa hiki. |
| `events.kit.manual.label` | Ticket code or QR text | Msimbo wa tiketi au maandishi ya QR |
| `events.kit.manual.submit` | Check ticket | Kagua tiketi |
| `events.kit.search.label` | Find a participant | Tafuta mshiriki |
| `events.kit.search.hint` | Name, bib number or ticket code. At least 3 characters. | Jina, namba ya mbio au msimbo wa tiketi. Angalau herufi 3. |
| `events.kit.search.none` | No match. Check the spelling or the code. | Hakuna kilichopatikana. Angalia tahajia au msimbo. |
| `events.kit.result.valid` | Ready for kit | Tayari kuchukua vifaa |
| `events.kit.result.already_collected` | Kit already collected | Vifaa vimeshachukuliwa |
| `events.kit.result.wrong_event` | Ticket for a different event | Tiketi ya tukio lingine |
| `events.kit.result.wrong_event.body` | This ticket is for {title}. | Tiketi hii ni ya {title}. |
| `events.kit.result.revoked` | Ticket cancelled | Tiketi imeghairiwa |
| `events.kit.result.revoked.cancelled` / `.refunded` / `.event_cancelled` / `.admin` / `.replaced` | Cancelled by the participant / Refunded / The event was cancelled / Cancelled by the organizer / Replaced by a new code | Imeghairiwa na mshiriki / Imerejeshewa pesa / Tukio limeghairiwa / Imeghairiwa na mwandaaji / Imebadilishwa na msimbo mpya |
| `events.kit.result.unpaid` | Not paid yet | Bado hajalipa |
| `events.kit.result.unknown` | Code not recognised | Msimbo haujatambuliwa |
| `events.kit.result.unknown.body` | Scan again or search by name. | Skani tena au tafuta kwa jina. |
| `events.kit.result.gymPass` | This looks like a gym pass, not an event ticket. | Hii inaonekana kuwa pasi ya gym, si tiketi ya tukio. |
| `events.kit.confirm` | Hand over kit | Kabidhi vifaa |
| `events.kit.next` | Scan next | Skani inayofuata |
| `events.kit.recorded` | Kit recorded for {name} | Vifaa vimerekodiwa kwa {name} |
| `events.kit.already.body` | Collected {time} at {point} by {name}. | Vilichukuliwa {time} katika {point} na {name}. |
| `events.kit.noBib` | No bib yet | Bado hana namba ya mbio |
| `events.kit.bib` | Bib {number} | Namba {number} |
| `events.kit.size` | Kit size {size} | Saizi ya vifaa {size} |
| `events.kit.warn.bib_missing` | No bib assigned yet | Bado hajapewa namba ya mbio |
| `events.kit.warn.kit_size_missing` | No kit size on file | Hakuna saizi ya vifaa iliyohifadhiwa |
| `events.kit.warn.outside_collection_window` | Outside this point's opening hours | Nje ya saa za kufungua za kituo hiki |
| `events.kit.warn.bib_changed_after_collection` | Bib changed after the kit was handed over | Namba ilibadilishwa baada ya vifaa kukabidhiwa |
| `events.kit.warn.claim_pending` | Ticket not claimed by the runner yet | Mshiriki bado hajadai tiketi |
| `events.kit.override.button` | Record again (override) | Rekodi tena (kuvuka kanuni) |
| `events.kit.override.ask` | Ask an owner or admin to override. | Mwombe mmiliki au msimamizi aruhusu. |
| `events.kit.override.title` | Record a second handover? | Rekodi ukabidhiwaji wa pili? |
| `events.kit.override.body` | The first handover stays in the history. Use this only when a kit was lost or handed over by mistake. | Ukabidhiwaji wa kwanza utabaki kwenye historia. Tumia hili tu kama vifaa vilipotea au vilikabidhiwa kimakosa. |
| `events.kit.reason.label` | Reason | Sababu |
| `events.kit.reason.hint` | At least 10 characters. Saved in the audit log. | Angalau herufi 10. Huhifadhiwa kwenye kumbukumbu za ukaguzi. |
| `events.kit.void` | Void handover | Batilisha ukabidhiwaji |
| `events.kit.manual.title` | Hand over without a scan | Kabidhi bila kuskani |
| `events.kit.manual.reason.label` | Why isn't the code scanned? | Kwa nini msimbo haujaskaniwa? |
| `events.kit.manual.reason.phone_lost` / `.no_signal` / `.screen_damaged` / `.other` | Phone lost or off / No signal / Screen damaged / Other | Simu imepotea au imezima / Hakuna mtandao / Skrini imeharibika / Nyingine |
| `events.kit.manual.idCheck` | I checked their photo ID | Nimekagua kitambulisho chenye picha |
| `events.kit.offline` | You are offline. Scanning needs a connection. Offline scanning is not available yet. | Huna mtandao. Kuskani kunahitaji mtandao. Kuskani bila mtandao bado hakupatikani. |
| `events.kit.notOpen` | Kit collection opens when the event is published. | Uchukuaji wa vifaa unaanza tukio likichapishwa. |
| `events.kit.completed` | The event has ended. Handovers are read-only. | Tukio limeisha. Ukabidhiwaji unaweza kusomwa tu. |
| `events.kit.cancelled` | This event was cancelled. Handovers are closed. | Tukio hili limeghairiwa. Ukabidhiwaji umefungwa. |
| `events.kit.noPoints` | This event has no collection points. Handovers are saved without one. | Tukio hili halina vituo vya kuchukulia. Ukabidhiwaji huhifadhiwa bila kituo. |
| `events.kit.rateLimited` | Too many scans. Wait {seconds} seconds. | Skani nyingi mno. Subiri sekunde {seconds}. |
| `events.kit.saveFailed` | Couldn't save. Try again; it won't be recorded twice. | Haikuhifadhiwa. Jaribu tena; haitarekodiwa mara mbili. |
| `scan.eventTicket.title` | This is an event ticket | Hii ni tiketi ya tukio |
| `scan.eventTicket.body` | Scan it under Kit collection in the organizer portal, not here. | Iskani kwenye Uchukuaji wa vifaa kwenye tovuti ya mwandaaji, si hapa. |
| `events.bibs.title` | Bib numbers | Namba za mbio |
| `events.bibs.tableLabel` | Bib numbers by participant | Namba za mbio kwa mshiriki |
| `events.bibs.col.bib` / `.assignedAt` | Bib / Assigned | Namba / Imetolewa |
| `events.bibs.assign` / `.change` / `.release` | Assign / Change / Release | Toa / Badilisha / Ondoa |
| `events.bibs.input.label` | Bib number | Namba ya mbio |
| `events.bibs.input.hint` | Letters, numbers and dashes, up to 12 characters. | Herufi, namba na vistari, hadi herufi 12. |
| `events.bibs.filter.assigned` / `.unassigned` | With a bib / Without a bib | Wenye namba / Wasio na namba |
| `events.bibs.counts` | {assigned} assigned · {unassigned} without a bib | {assigned} wamepewa · {unassigned} hawana namba |
| `events.bibs.bulk.title` | Assign in bulk | Toa kwa wingi |
| `events.bibs.bulk.start` / `.end` / `.prefix` / `.pad` | First number / Last number (optional) / Prefix (optional) / Digits | Namba ya kwanza / Namba ya mwisho (si lazima) / Kiambishi (si lazima) / Idadi ya tarakimu |
| `events.bibs.bulk.order` | Order | Mpangilio |
| `events.bibs.bulk.order.registered_at` / `.last_name` | By registration time / By last name | Kwa muda wa usajili / Kwa jina la ukoo |
| `events.bibs.bulk.preview` / `.apply` | Preview / Apply | Hakiki / Tekeleza |
| `events.bibs.bulk.summary` | {count} people get {first} to {last}. | Watu {count} watapewa {first} hadi {last}. |
| `events.bibs.bulk.shortfall` | The range is too small for {count} people. | Mpangilio huu ni mdogo kwa watu {count}. |
| `events.bibs.bulk.stale` | Registrations changed. Preview again. | Usajili umebadilika. Hakiki tena. |
| `events.bibs.import.title` | Import bib numbers (CSV) | Ingiza namba za mbio (CSV) |
| `events.bibs.import.help` | Columns: registrationId (or ticketCode) and bibNumber. Up to 2,000 rows. | Safu: registrationId (au ticketCode) na bibNumber. Hadi safu 2,000. |
| `events.bibs.import.sample` | Download sample file | Pakua faili la mfano |
| `events.bibs.import.result` | {ok} rows ready · {bad} with problems | Safu {ok} ziko tayari · {bad} zina matatizo |
| `events.bibs.import.fix` | Nothing is saved until every row is fixed. | Hakuna kitakachohifadhiwa hadi safu zote zirekebishwe. |
| `events.bibs.error.bib_taken` | That number is already used. | Namba hiyo tayari imetumika. |
| `events.bibs.error.bib_invalid` | Use letters, numbers and dashes only. | Tumia herufi, namba na vistari tu. |
| `events.bibs.error.bib_duplicate_in_file` | The same number appears twice in the file. | Namba ileile imejitokeza mara mbili kwenye faili. |
| `events.bibs.error.registration_not_found` | No such registration in this event. | Hakuna usajili huo kwenye tukio hili. |
| `events.bibs.error.registration_not_confirmed` | This place isn't paid yet. | Tiketi hii bado haijalipiwa. |
| `events.bibs.error.bib_already_assigned` | This person already has a bib. Use Change. | Mtu huyu tayari ana namba. Tumia Badilisha. |
| `events.bibs.changeReason` | Why are you changing it? | Kwa nini unaibadilisha? |
| `events.export.title` | Export participants | Pakua orodha ya washiriki |
| `events.export.columns` | Included columns | Safu zilizojumuishwa |
| `events.export.privacy` | Phone, email, date of birth and emergency contact are never included. | Simu, barua pepe, tarehe ya kuzaliwa na mawasiliano ya dharura havijumuishwi kamwe. |
| `events.export.audit` | Each download is saved in the audit log. | Kila upakuaji huhifadhiwa kwenye kumbukumbu za ukaguzi. |
| `events.export.download` | Download CSV | Pakua CSV |
| `events.export.started` | Download started | Upakuaji umeanza |
| `events.export.limited` | You can export 5 times an hour. Try again at {time}. | Unaweza kupakua mara 5 kwa saa. Jaribu tena saa {time}. |
| `events.reg.drawer.title` | Registration | Usajili |
| `events.reg.drawer.ticketNote` | Ticket codes are never shown to organizers. | Misimbo ya tiketi haionyeshwi kamwe kwa waandaaji. |
| `events.reg.drawer.kitHistory` / `.bibHistory` | Kit history / Bib history | Historia ya vifaa / Historia ya namba |
| `integrations.title` | Integrations | Miunganisho |
| `integrations.tab.clients` / `.webhooks` / `.deliveries` / `.docs` | API clients / Webhooks / Delivery log / Docs | Wateja wa API / Webhook / Kumbukumbu za utumaji / Nyaraka |
| `integrations.clients.new` | New API client | Mteja mpya wa API |
| `integrations.clients.empty` | No API clients yet. Create one to connect your timing or registration system. | Hakuna wateja wa API bado. Unda mmoja kuunganisha mfumo wako wa muda au usajili. |
| `integrations.clients.name` | Name | Jina |
| `integrations.clients.environment` / `.test` / `.live` | Environment / Test / Live | Mazingira / Majaribio / Halisi |
| `integrations.clients.live.warn` | Live clients can read real participants. | Wateja halisi wanaweza kusoma washiriki halisi. |
| `integrations.clients.scopes` | What can this client do? | Mteja huyu anaweza kufanya nini? |
| `integrations.scope.registrations:read` | Read registrations: names, categories, status, bib, kit | Kusoma usajili: majina, makundi, hali, namba, vifaa |
| `integrations.scope.registrations:demographics` | Also read gender and age on event day | Pia kusoma jinsia na umri siku ya tukio |
| `integrations.scope.kit:write` | Record kit handovers | Kurekodi ukabidhiwaji wa vifaa |
| `integrations.scope.bibs:write` | Assign bib numbers | Kutoa namba za mbio |
| `integrations.scope.webhooks:manage` | Manage webhooks (owner only) | Kudhibiti webhook (mmiliki tu) |
| `integrations.scope.results:write` | Submit results (coming soon) | Kuwasilisha matokeo (inakuja) |
| `integrations.risk.read` / `.write` / `.high` | Read / Write / High risk | Kusoma / Kuandika / Hatari kubwa |
| `integrations.clients.events.all` / `.selected` | All events / Selected events | Matukio yote / Matukio yaliyochaguliwa |
| `integrations.clients.expiry` | Expires after | Inaisha baada ya |
| `integrations.clients.expiresIn` | Expires in {days} days | Inaisha baada ya siku {days} |
| `integrations.clients.expired` / `.revoked` | Expired / Revoked | Imeisha muda / Imefutwa |
| `integrations.clients.lastUsed` / `.never` | Last used {time} / Never used | Ilitumika mwisho {time} / Haijawahi kutumika |
| `integrations.clients.inGrace` | Old secret works until {time} | Siri ya zamani inafanya kazi hadi {time} |
| `integrations.secret.title` | Save your secret | Hifadhi siri yako |
| `integrations.secret.warn` | Copy your secret now. You won't be able to see it again. | Nakili siri yako sasa. Hutaweza kuiona tena. |
| `integrations.secret.copy` / `.copied` | Copy secret / Copied | Nakili siri / Imenakiliwa |
| `integrations.secret.saved` | I have saved the secret | Nimehifadhi siri |
| `integrations.rotate.title` | Rotate secret | Badilisha siri |
| `integrations.rotate.grace.0` / `.24` / `.72` | No overlap: the old secret stops now | Bila muda wa pamoja: siri ya zamani inaacha sasa |
| | 24 hours overlap (recommended) | Muda wa pamoja wa saa 24 (inapendekezwa) |
| | 72 hours overlap | Muda wa pamoja wa saa 72 |
| `integrations.revoke.title` | Revoke {name}? | Futa ruhusa ya {name}? |
| `integrations.revoke.body` | Anything using it stops working immediately. This can't be undone. | Kila kinachoitumia kitaacha kufanya kazi mara moja. Hili haliwezi kutenduliwa. |
| `integrations.revoke.type` | Type the name to confirm | Andika jina ili kuthibitisha |
| `integrations.usage.title` | Usage, last 30 days | Matumizi, siku 30 zilizopita |
| `integrations.usage.requests` / `.errors` / `.limited` | Requests / Errors / Rate limited | Maombi / Hitilafu / Yaliyozuiwa kwa kikomo |
| `integrations.webhooks.new` | Add endpoint | Ongeza anwani |
| `integrations.webhooks.empty` | No webhook endpoints yet. Add one to get live updates. | Hakuna anwani za webhook bado. Ongeza moja kupata taarifa papo hapo. |
| `integrations.webhooks.url` | Endpoint URL (https only) | Anwani ya URL (https tu) |
| `integrations.webhooks.events` | Events to send | Matukio ya kutuma |
| `integrations.webhooks.group.registrations` / `.kit` / `.event` | Registrations / Kit and bibs / Event | Usajili / Vifaa na namba / Tukio |
| `integrations.webhooks.verify` | Verify now | Thibitisha sasa |
| `integrations.webhooks.verify.pending` | We will send a test request to confirm this address is yours. | Tutatuma ombi la majaribio kuthibitisha anwani hii ni yako. |
| `integrations.webhooks.verify.ok` | {host} answered correctly. | {host} imejibu ipasavyo. |
| `integrations.webhooks.verify.fail` | {host} did not answer correctly: {reason}. | {host} haikujibu ipasavyo: {reason}. |
| `integrations.webhooks.test` | Send test | Tuma jaribio |
| `integrations.webhooks.disable` / `.enable` | Disable / Enable | Zima / Washa |
| `integrations.webhooks.autoDisabled` | Turned off after repeated failures at {time}. Fix your server, then enable it again. | Imezimwa baada ya kushindwa mara nyingi saa {time}. Rekebisha seva yako, kisha uiwashe tena. |
| `integrations.webhooks.redeliver` | Send the events it missed (last 7 days) | Tuma matukio iliyokosa (siku 7 zilizopita) |
| `integrations.health.healthy` / `.degraded` / `.failing` / `.disabled` / `.unverified` | Healthy / Slow / Failing / Off / Not verified | Nzuri / Polepole / Inashindwa / Imezimwa / Haijathibitishwa |
| `integrations.health.summary` | {healthy} healthy · {failing} failing | {healthy} nzuri · {failing} zinashindwa |
| `integrations.url.error.not_https` | Use an https:// address. | Tumia anwani ya https://. |
| `integrations.url.error.blocked_address` | This address points to a private or internal network. | Anwani hii inaelekeza mtandao wa ndani au binafsi. |
| `integrations.url.error.unresolvable` | We couldn't find this address. | Hatukuweza kupata anwani hii. |
| `integrations.url.error.bad_port` / `.credentials_in_url` / `.ip_literal` / `.blocked_host` / `.too_long` | Only the standard https port is allowed. / Remove the username and password from the address. / Use a domain name, not an IP number. / This host name isn't allowed. / The address is too long. | Bandari ya kawaida ya https pekee inaruhusiwa. / Ondoa jina la mtumiaji na nenosiri kwenye anwani. / Tumia jina la kikoa, si namba ya IP. / Jina hili la mwenyeji haliruhusiwi. / Anwani ni ndefu mno. |
| `integrations.deliveries.title` | Delivery log | Kumbukumbu za utumaji |
| `integrations.deliveries.status.delivered` / `.retrying` / `.failed` / `.dead` | Delivered / Retrying / Failed / Gave up | Imewasilishwa / Inajaribu tena / Imeshindwa / Imeachwa |
| `integrations.deliveries.retry` | Retry now | Jaribu tena sasa |
| `integrations.deliveries.retry.left` | {n} manual retries left today | Majaribio {n} ya mkono yamebaki leo |
| `integrations.deliveries.outcome.timeout` / `.http_error` / `.network_error` / `.tls_error` / `.blocked_address` / `.redirect_not_followed` | Timed out / Your server returned an error / Couldn't connect / Certificate problem / Blocked address / Redirects aren't followed | Muda uliisha / Seva yako ilirudisha hitilafu / Haikuweza kuunganisha / Tatizo la cheti / Anwani imezuiwa / Uelekezaji hauruhusiwi |
| `integrations.docs.openapi` | Download OpenAPI (JSON) | Pakua OpenAPI (JSON) |
| `integrations.unavailable` | Integrations aren't available yet. | Miunganisho bado haipatikani. |
| `integrations.audit.title` | Recent changes | Mabadiliko ya hivi karibuni |
| `errors.events.not_event_ticket` | That isn't an event ticket code. | Huo si msimbo wa tiketi ya tukio. |
| `errors.events.already_collected` | This kit was already collected. | Vifaa hivi vimeshachukuliwa. |
| `errors.events.payout_schedule_locked` | The payout schedule can't be changed now. Contact FitFlex support. | Ratiba ya malipo haiwezi kubadilishwa sasa. Wasiliana na msaada wa FitFlex. |
| `errors.events.rate_limited` | Too many requests. Wait a moment and try again. | Maombi mengi mno. Subiri kidogo kisha ujaribu tena. |
| `errors.events.preview_stale` | Registrations changed. Preview again. | Usajili umebadilika. Hakiki tena. |
| `errors.events.cursor_expired` | The sync position is too old. Start a full sync. | Mahali pa usawazishaji ni pa zamani mno. Anza usawazishaji kamili. |

(Error codes in §5.3 and §4 not listed here fall back to the existing generic message; the portal `ERRORS` map must have an entry per code the UI can surface: `bib_taken`, `bib_already_assigned`, `preview_stale`, `ticket_revoked`, `registration_unpaid`, `collection_point_required`, `manual_reason_required`, `note_required`, `idempotency_key_reused`, `request_in_progress`, `forbidden_role`, `organizer_suspended`, `invalid_scope`, `scope_not_available`, `invalid_url`, `cursor_expired`.)

### 10.2 Mobile (`lib/shared/i18n.dart`, both maps; parity test)
Existing keys kept: `events.ticket.scan.soon`, `events.ticket.scan.live`.
| Key | EN | SW |
|---|---|---|
| `events.ticket.kit.title` | Your kit | Vifaa vyako |
| `events.ticket.kit.not_ready` | Kit not ready yet | Vifaa bado havijawa tayari |
| `events.ticket.kit.ready` | Kit ready to collect | Vifaa viko tayari kuchukuliwa |
| `events.ticket.kit.collected` | Kit collected | Vifaa vimechukuliwa |
| `events.ticket.kit.collectedAt` | Collected {date} at {point} | Vilichukuliwa {date} katika {point} |
| `events.ticket.kit.noNeed` | You don't need to show this code again. | Huhitaji kuonyesha msimbo huu tena. |
| `events.ticket.kit.exception` | Please ask the organizer about your kit. | Tafadhali muulize mwandaaji kuhusu vifaa vyako. |
| `events.ticket.kit.where` | Where to collect | Mahali pa kuchukulia |
| `events.ticket.kit.when` | Opening hours | Saa za kufungua |
| `events.ticket.kit.directions` | Directions | Maelekezo ya njia |
| `events.ticket.kit.staleHint` | Kit status may have changed. Connect to refresh. | Hali ya vifaa inaweza kuwa imebadilika. Unganisha mtandao kusasisha. |
| `events.ticket.bib` | Bib {number} | Namba {number} |
| `events.ticket.bib.a11y` | Bib number {number} | Namba ya mbio {number} |
| `events.ticket.bib.none` | Your bib number will appear here once the organizer assigns it. | Namba yako ya mbio itaonekana hapa mwandaaji akikupa. |
| `events.notify.kitCollected.title` / `.body` | Kit collected / You collected your kit for {event}. | Vifaa vimechukuliwa / Umechukua vifaa vyako vya {event}. |
| `events.notify.bibAssigned.title` / `.body` | Your bib number is ready / Your bib for {event} is {number}. | Namba yako ya mbio iko tayari / Namba yako ya {event} ni {number}. |
| `ownerScan.eventTicket.title` | This is an event ticket | Hii ni tiketi ya tukio |
| `ownerScan.eventTicket.body` | Event tickets are scanned at Kit collection in the organizer portal, not here. | Tiketi za matukio huskaniwa kwenye Uchukuaji wa vifaa kwenye tovuti ya mwandaaji, si hapa. |
Server-built notices (`event_kit_collected`, `event_bib_assigned`, `organizer_payout_schedule_changed`, `organizer_api_client_*`, `organizer_webhook_auto_disabled`) are bilingual on the server (`titleSw/bodySw`) with the same texts; organizer-facing notices: API client created/rotated/revoked ("An API client {name} was created/rotated/revoked by {actor}" / "Mteja wa API {name} ameundwa/amebadilishwa siri/amefutwa na {actor}"), webhook auto-disabled ("Webhook {host} was turned off after repeated failures" / "Webhook {host} imezimwa baada ya kushindwa mara nyingi"), client expiry ("API client {name} expires in {days} days" / "Mteja wa API {name} anaisha baada ya siku {days}").

---

## 11. E. Shared

### 11.1 Flags and options
| Flag | Gates |
|---|---|
| `EVENTS_KIT_OPS` | tickets/verify, kit collections, lookup, summary, corrections, bibs, export, `scanning: true` in options and ticket payloads, kit/bib in member payloads |
| `EVENTS_ORGANIZER_API` | `/organizer/api-clients`, `/v1/organizer/*`, usage counters, `openapi.json` |
| `EVENTS_WEBHOOKS` | `/organizer/webhook-endpoints`, deliveries, health, both dispatcher jobs, retention job |
All three need `EVENTS_MODULE` and `EVENTS_REGISTRATION` (new guards `requireEventsKitOps`, `requireEventsOrganizerApi`, `requireEventsWebhooks` in `feature-flags.mjs`: 404 `feature_disabled`). `GET /events/options` gains `ops: { kit, api, webhooks }` (`webhooks` is false when the secret key is missing, `api` is false when `JWT_SECRET` fallback is the dev default in production), `payoutSchedules`, and `tickets.scanning`. Portal: `NEXT_PUBLIC_EVENTS_MODULE` only; the rest comes from options. Mobile: no new dart-define; wording follows the server flag.

### 11.2 Migrations (additive; sort after the highest existing timestamp at branch time, currently `20270121090000`; confirmation 1)
1. `20270122090000-events-ops-s5.cjs`
   - `Event.payoutSchedule` + CHECK (nullable).
   - `EventKitCollection`: `method text NOT NULL DEFAULT 'scan'` CHECK in (`scan`,`manual`,`api`); `manualReason text NULL` CHECK closed set; `note text NULL (<= 300)`; `apiClientId text NULL`; CHECK `NOT ("staffUserId" IS NOT NULL AND "apiClientId" IS NOT NULL)`; index `(eventId, collectedAt)`.
   - `EventBibAssignment`: `assignedByApiClientId text NULL`; **live unique** `(eventId, bibNumber) WHERE releasedAt IS NULL` (aborts with a clear message if existing live data would violate it; the module is dormant so none expected); index `(eventId, registrationId)`.
   - `EventRegistration`: index `(eventId, "updatedAt", id)`.
   - `OutboxEvent`: `seq bigint GENERATED ALWAYS AS IDENTITY` + unique index; index `(eventId, seq)`; index `(organizerId, seq)`.
   - `OrganizerIdempotency` (new): `id, scopeType ('staff'|'api'), scopeId, key, route, fingerprint, state ('in_progress'|'done'), status int, response jsonb, createdAt, expiresAt`; unique `(scopeType, scopeId, key, route)`; retention 7 days via the daily job.
2. `20270122090100-events-integrations-s5.cjs`
   - `ApiClient`: `name text`, `environment text DEFAULT 'live'` CHECK, `eventIds jsonb NULL`, `createdBy text NULL REFERENCES "User" ON DELETE SET NULL`, `secretVersion int DEFAULT 1`, `previousSecretHash text NULL`, `previousSecretExpiresAt timestamptz NULL`, `rateLimitPerMinute int DEFAULT 120` CHECK 1..600; CHECK on `eventIds` array; index `(ownerId, status)` exists.
   - `ApiClientUsageDay` (new): `(apiClientId, day)` unique, `requests, errors, rateLimited` ints.
   - `WebhookEndpoint`: `description`, `secretCiphertext`, `secretKeyId`, `previousSecretCiphertext`, `previousSecretKeyId`, `previousSecretExpiresAt`, `verifiedAt`, `eventIds jsonb NULL`, `disabledReason` (CHECK closed set), `disabledAt`, `consecutiveFailures int DEFAULT 0`, `createdBy`. Existing `secretHash` stays (fingerprint).
   - `WebhookDelivery`: `leaseUntil`, `lastAttemptAt`, `manualRetryCount int DEFAULT 0`; index `(status, nextAttemptAt)` exists; partial index on due rows.
   - `WebhookDeliveryAttempt` (new, §7.5).
   - Both `down`s **fail closed**: refuse while any `payoutSchedule` is set, any kit/bib/attempt/API client/endpoint row exists, or any outbox row has been published; on an empty module they restore the S4 shape exactly. Treat `down` as dev-only once real data exists (S3 L11 note).
   - Dry-run both on the CI database before the functions deploy; run migrations before the functions deploy (S2/S3/S4 pattern).

### 11.3 Environment (add all to `docs/server-env-checklist.md` before enabling)
`EVENTS_WEBHOOK_SECRET_KEY` (32 bytes base64, required for webhooks), `EVENTS_WEBHOOK_SECRET_KEY_ID` (default `k1`), `EVENTS_WEBHOOK_SECRET_KEY_PREVIOUS` (JSON ring), `EVENTS_API_TOKEN_TTL_SECONDS` (900), `EVENTS_API_MAX_CLIENTS` (10), `EVENTS_API_DEFAULT_RATE` (120), `EVENTS_WEBHOOK_MAX_ENDPOINTS` (5), `EVENTS_WEBHOOK_TIMEOUT_MS` (10000), `EVENTS_WEBHOOK_MAX_ATTEMPTS` (10), `EVENTS_WEBHOOK_BATCH` (50), `EVENTS_FEED_LAG_SECONDS` (5), `EVENTS_EXPORT_MAX_ROWS` (20000), `EVENTS_API_ORGANIZER_ALLOWLIST` (optional comma list of organizer ids; when set, only those organizers can create API clients: the pilot gate, see Q4). Existing and required: `EVENT_TICKET_SECRET`, `JWT_SECRET` (non-dev), `PUBLIC_API_URL`. A malformed value reports `invalid_config` without the variable name or value (S3 L8 rule).

### 11.4 Rule 6 callout list (owner reviews, D35)
**New under `src/auth/*`:** `src/auth/organizer-api-auth.mjs` (token exchange, `requireApiClient`, client lookup registration). **Not modified:** `src/auth/jwt.mjs`, `src/auth/events-authz.mjs`, `src/auth/org-authz.mjs`, `src/auth/qr-token.mjs`, `src/shared/route-guard.mjs`, `functions/checkins.mjs`, payout engine, pricing constants, `constants.mjs`, refund and payment code (the refund event is mapped at fan-out; confirmation 9 covers the single exception).
**New public (unauthenticated) endpoints:** `POST /v1/organizer/token`, `GET /v1/organizer/openapi.json`. **New outbound network code:** webhook delivery (SSRF surface). **New secret storage:** `ApiClient.secretHash`, `WebhookEndpoint.secretCiphertext`.
**Existing endpoints or services changed (additive responses unless stated):**
- `GET /events/options` (+`ops`, `payoutSchedules`, `tickets.scanning`).
- `GET/PATCH /organizer/events/:id`, `POST /organizer/events/:id/submit` (**behaviour change**: new 422 `payoutSchedule required`), `validateEvent` in `events-organizer-service.mjs`; wizard field lists.
- `GET /organizer/events/:id/registrations` (+bib/kit fields, filters, keyset cursor), `events-roster-service.mjs`.
- `GET /organizer/events/:id/finance` (+`payoutSchedule`), `GET /admin/events/:id` and list (+`payoutSchedule`), new `POST /admin/events/:id/payout-schedule`.
- `GET /me/event-tickets`, `GET /me/event-registrations/:id/ticket`, registration views (+`kit`, `bibNumber`, `collectionPoints`, `scanning` now real), `events-payment-service.mjs` `ticketBody`/`optionsBlock`.
- Cancel paths (`events-registration-service.mjs`, `events-money-store-pg.mjs`): release a live bib when a confirmed place is cancelled; `kit_collected` guard fed by `kitStatus`. These sit next to S4 payment code: review as rule 6.
- `events-organizer-service.mjs` save/transition and `events-admin-service.mjs` cancel: add `event.updated` / `event.cancelled` outbox rows in the same transaction.
- Claim/participant-edit/team paths: add `registration.updated` outbox rows.
- `notification-service`/`partner-notifier` use only (no change); mobile `memberRouteFor` (+2 types).
- `functions/jobs.mjs` and `src/bootstrap/services.mjs` (3 new jobs).
- Portal `app/scan/page.tsx` (refactor onto `QrScanner`, plus `FFEV1:` guard) and mobile `owner_qr_scanner_page.dart` (prefix guard): **check-in screens, client behaviour only**.
**Security review focus:** token endpoint abuse, row-level scope enforcement on every `/v1` route, SSRF and DNS pinning, redirect refusal, secret handling and logs, fan-out isolation, CSV injection, replay on kit writes, audit coverage.

### 11.5 Audit events (`AuditLog`, actor + before/after, no secrets, no tokens, no payloads)
`events.ticket_verify_failed`, `events.ticket_integrity_failed`, `events.kit_collected`, `events.kit_manual_collected`, `events.kit_corrected`, `events.bib_assigned`, `events.bib_reassigned`, `events.bib_released`, `events.bibs_bulk_assigned`, `events.bibs_imported`, `events.roster_exported`, `events.payout_schedule_changed`, `events.api_client_created|updated|rotated|revoked|expired`, `events.api_token_failed` (aggregated), `events.webhook_endpoint_created|updated|verified|disabled|enabled|secret_rotated`, `events.webhook_auto_disabled`, `events.webhook_delivery_retried`, `events.webhook_organizer_mismatch` (alert), `events.admin_api_clients_revoked`, `events.admin_webhooks_disabled`. Admin event audit (`/admin/events/:id/audit`) shows the `events.*` rows of an event as today.

### 11.6 Analytics (server-side `analytics.<name>`, ids and counts only, no personal data)
Required: `kit_collected` `{ eventId, categoryId, method, collectionPointId }`, `bib_assigned` `{ eventId, mode: single|bulk|import|api, count }`, `webhook_delivery_failed` `{ endpointId, eventType, outcome, attemptNo }` (sampled to first failure and dead only). Suggested: `ticket_verified` `{ result }`, `roster_exported` `{ eventId, rowCount }`, `api_client_created` `{ environment, scopeCount }`, `webhook_endpoint_auto_disabled`.

### 11.7 Deploy order
functions migrations (dry-run on CI DB first) -> functions -> portal -> mobile -> flags last. `EVENTS_KIT_OPS` can be switched on once the portal build with the kit desk and the mobile build with the wording are adopted (old S4 mobile builds show the "soon" wording only because `scanning` was false; with it true they still work, only their kit block is missing). `EVENTS_ORGANIZER_API` and `EVENTS_WEBHOOKS` are switched on only after the owner's rule 6 review (D35), the env keys are set, and a retention/anonymisation position on participant data exists (§11.9). Nothing here is switched on by the PRs.

### 11.8 Backend spec expectations (`specs/events-s5-*.specs.mjs`, CI DB only; verify the DB name first)
Files: `events-s5-payout-schedule`, `events-s5-verify`, `events-s5-kit`, `events-s5-bibs`, `events-s5-roster-sync`, `events-s5-export`, `events-s5-api-clients`, `events-s5-api-auth`, `events-s5-api-endpoints`, `events-s5-webhook-url-guard`, `events-s5-webhook-signing`, `events-s5-webhook-dispatch`, `events-s5-fanout-isolation`, `events-s5-openapi-contract`, `events-s5-routeguard`.

**Scenario 11 (QR screenshot replay / repeated kit collection):** same payload collected twice in sequence and **concurrently** (two parallel requests with different keys): exactly one `collected` row, the other `409 already_collected`; same key twice -> the original response with `Idempotent-Replayed`; same key different body -> 409 `idempotency_key_reused`; a rotated token (old screenshot) -> `unknown`; revoked ticket -> `revoked`; cancelled-after-collection; ops cannot correct (403); owner `recollect` creates `corrected` + new `collected`; `kitStatus` and outbox rows consistent; override without reason -> 422.
**Scenario 12 (offline scan syncs and detects duplicate):** **S7, not built.** S5 specs cover the primitives the S7 sync will rely on: a second `collected` insert fails on the partial unique, `offlineBatchId` stays null, the duplicate response carries the first collection's time and point.
**Scenario 13 (webhook endpoint times out then recovers):** fake receiver times out for N attempts then returns 200: attempt rows 1..N `timeout`, then `success`, `WebhookDelivery` ends `delivered` with `attemptCount = N+1`, backoff times follow the schedule (fake clock), the same event id on every attempt, the timestamp/signature changes per attempt, 410 -> dead + endpoint disabled, max attempts -> `dead`, auto-disable after sustained failure with a notification, manual retry bounded and idempotent, a disabled endpoint receives nothing and re-enable runs the handshake.
**Scenario 14 (webhook signature invalid or replayed):** the known-answer vector; a reference verifier (the one in the guide) accepts a good delivery, rejects a tampered body, a wrong secret, a timestamp older than 300 s, and accepts either `v1=` during rotation grace; header names and format; unverified endpoints get only the challenge.
**Scenario 19 (organizer attempts cross-event roster access):** organizer A's staff (every role) and A's API client against B's event id on every list/detail/feed/export/kit/bib/lookup route -> 404 `event_not_found`/`registration_not_found`, no body difference between "does not exist" and "belongs to B"; `eventIds`-restricted client against another of A's own events -> 404; ticket of B scanned at A's event -> `unknown`; ticket of A's other event -> `wrong_event`; webhook fan-out: an outbox row for organizer B never produces a delivery for A's endpoints (explicit SQL isolation spec plus the deliver-step mismatch guard); API token from client of A cannot be used after A is suspended.
Also: SSRF table (every blocked range, IPv4-mapped IPv6, decimal/octal/hex IP forms, DNS returning mixed public/private, rebinding between validation and delivery via the injected resolver, redirect 302 refused); CSV export injection cells; export audit row exists even if the stream aborts; bulk preview/apply atomicity and `preview_stale`; field minimisation per scope (no key named phone/email/dateOfBirth/emergencyContact anywhere in `/v1` output, asserted by a recursive key scan); rate limits (token endpoint, per client, failures); `routeGuard` hazard spec (§5.2); OpenAPI parity; migrations up/down on an empty and a populated CI DB; flags off -> every new route 404 `feature_disabled` and S4 specs unchanged.
Portal Playwright `tests/e2e/events-s5.spec.ts` (self-contained, mocked backend like S2 to S4): kit desk result cards for all six results, manual fallback, override dialog, offline banner, camera-denied state (stubbed `getUserMedia`), role gating, bibs bulk/import preview/apply, export download, integrations create/rotate/revoke with secret-once behaviour, webhook verify/auto-disabled/retry, payout radio in the wizard and admin dialog, Swahili run, 375 px run, `/scan` regression after the extraction.

### 11.9 Privacy notes
- Organizers receive: first/last name (dashboard and API), category, bib, kit state, kit size, team/group labels. They do **not** receive phone, email, date of birth, gender (except via the explicit demographics scope), emergency contact, payer details or amounts per person (D25 holds).
- Verification cards show first name + last initial only; unpaid names are never listed; cancelled registrations lose names in the feed and export.
- Webhooks carry ids and states only.
- Consent: the participant consent text must say that name, category, bib and kit status are shared with the organizer (S3 `kushirikisha` wording); confirm the current text covers kit and bib status, otherwise update the draft text and the version (`EVENTS_CONSENT_TEXT_VERSION`) before enabling.
- **Launch gate (follow-up "Privacy / retention (before organizer roster API)"):** `EventRegistration` keeps name, phone, email, date of birth, gender and emergency contact after the user is deleted. Before `EVENTS_ORGANIZER_API` or exports go live, a retention/anonymisation rule is decided (recommend: organizer-visible fields anonymised on account deletion, and the feed emits `registration.updated` with `changed: ['anonymised']`). Counsel review of cross-border transfer for API consumers is also open (PRD §10); texts remain drafts.
- Logs: no token, secret, payload text or QR payload is logged; request bodies of `verify`, `kit-collections` and `token` are excluded from any request logging; analytics carry ids only.
- Retention: attempts 30 days, deliveries and outbox 90 days, usage 90 days, idempotency 7 days, audit rows indefinite as today.

---

## 12. Acceptance criteria (check one by one; `design-qa`, `uat-tester`)

**A. Payout schedule**
- AC-A1 Wizard step 4 shows a "Payout schedule" card above the category groups with two radios, nothing pre-selected, in EN and SW.
- AC-A2 Review step lists the value (or an error link) and blocks submit with `events.validation.payoutRequired` until chosen; the server also returns 422 with path `payoutSchedule`.
- AC-A3 A draft saves without a schedule; the value autosaves like other fields.
- AC-A4 After submit the field is read-only with the lock line; after publish an organizer PATCH returns 409 `payout_schedule_locked`.
- AC-A5 A FitFlex admin with scope `events` can change it on a published event only with a reason; an AuditLog and EventChangeLog row exist and the organizer gets a notice; without the scope the control is absent and the API returns 403.
- AC-A6 The Finance tab shows "Payout schedule: ..." or "Not set" and still says statements are not live; no date or amount appears anywhere.
- AC-A7 The admin event page shows the value.
- AC-A8 The value is absent from public event payloads and from `/v1/organizer` output.

**B. Venue**
- AC-B1 Scanning a valid ticket shows "Ready for kit" with first name + initial, category, bib or "No bib yet", kit size and a Hand over button; no phone, email, DOB or full name appears in the DOM or the network response.
- AC-B2 Confirming records exactly one handover; the second attempt (same or another desk, or a screenshot) shows "Kit already collected" with time and point and creates no row.
- AC-B3 Each of valid, already_collected, wrong_event, revoked, unpaid and unknown has its own heading, icon and text, readable without colour.
- AC-B4 A ticket of another organizer's event shows "Code not recognised", not "different event".
- AC-B5 A gym QR scanned at the desk is not sent to the server and shows the gym-pass message; an event ticket scanned at `/scan` or in the mobile owner scanner is not sent to check-in and shows the event-ticket message.
- AC-B6 Camera denied, unsupported, insecure and no-camera each show their message and leave the manual box usable; stopping or leaving the page stops the camera tracks.
- AC-B7 Offline shows the "not available yet" banner, disables verify/confirm and queues nothing.
- AC-B8 Manual lookup (3+ chars) finds by name, bib, code or registration id, returns at most 10 masked cards, and a manual handover requires a reason and the ID checkbox.
- AC-B9 Ops cannot override or void; owner/admin can with a 10+ character reason; history keeps every row.
- AC-B10 Bib assign rejects duplicates inside the event; change needs a reason; release works; bulk preview then apply is atomic and `preview_stale` is handled; CSV preview shows per-row problems and apply is blocked until none remain.
- AC-B11 `bib.assigned` and `kit.collected` outbox rows exist for each write (and none for failed writes).
- AC-B12 Roster pages by cursor beyond 2,000 rows; `updatedSince` returns only changed rows; the change feed returns cancelled registrations as tombstones with no names and a repeated cursor returns the same position.
- AC-B13 The CSV has the fixed columns, no contact/DOB/gender/emergency data, neutralises `=`,`+`,`-`,`@` cells, opens in Excel with correct characters, and creates an audit row at download start; 6th download in an hour returns 429.
- AC-B14 Member ticket page: with `scanning=false` it shows the "soon" wording; with `true` it shows "Show this code at the kit collection point", the kit state chip, collection point info and, once assigned, a large bib; after collection it shows "Kit collected" and keeps the QR.
- AC-B15 The participant gets a bilingual notice on kit collection and on bib assignment, linking to the ticket.
- AC-B16 Timing role has no Kit tab; finance has no Kit/Bibs/Export; roles are enforced by the server (403 `forbidden_role`).
- AC-B17 A suspended organizer's desk is read-only.

**C. API**
- AC-C1 Creating a client shows the secret once in a dialog that cannot be dismissed before "I have saved the secret"; reload shows no secret; the list/detail/audit never contain it.
- AC-C2 Token exchange returns a 15-minute bearer; wrong id, wrong secret, revoked and expired clients all return the identical `401 invalid_client`.
- AC-C3 Revoking a client makes the next `/v1` call fail even with an unexpired token; rotation with 24 h overlap accepts both secrets until the window ends and then only the new one.
- AC-C4 A staff JWT on `/v1/organizer/*` is 401; an API token on `/organizer/*` is 401.
- AC-C5 A client lacking `kit:write` gets 403 `insufficient_scope { requiredScope }`; without `registrations:demographics` no gender/age keys exist; no `/v1` response ever contains phone, email, dateOfBirth or emergencyContact.
- AC-C6 Another organizer's or an unlisted event/registration returns 404 with an identical body to a nonexistent id.
- AC-C7 Writes without `Idempotency-Key` are 400; a replay returns the original; a reused key with a different body is 409.
- AC-C8 429 includes `Retry-After` and `retryAfterSeconds`; the limits in the docs match the code.
- AC-C9 `GET /v1/organizer/openapi.json` documents every route; the guide's sync loop works end-to-end against a sandbox client; sandbox writes persist nothing.
- AC-C10 Integrations page: scope picker with risk chips, admin cannot grant `webhooks:manage`, expiry badges, usage table, revoke needs the typed name.

**D. Webhooks**
- AC-D1 Only https URLs on 443 with public DNS are accepted; each blocked range/host/form returns `invalid_url` with a plain-language reason; redirects are never followed; a hostname that later resolves privately fails delivery with `blocked_address`.
- AC-D2 A new endpoint receives only the challenge until it answers it; unverified endpoints get no events.
- AC-D3 Every delivery carries the four headers, the signature verifies with the documented algorithm and vector, the timestamp/signature change per attempt and the event id does not.
- AC-D4 A committed registration, kit, bib, event or refund change produces exactly one delivery per subscribed, verified, same-organizer endpoint; none for another organizer; none for unsubscribed types; no payload contains a name, phone, email, amount or token.
- AC-D5 A failing endpoint is retried on the schedule, shown as Retrying then Gave up; a recovered endpoint gets the delivery and the log shows every attempt with a redacted snippet.
- AC-D6 After sustained failure the endpoint auto-disables, the owner/admins are notified, the page shows the reason, and Enable again requires verification and offers redelivery.
- AC-D7 Manual retry works for failed/dead, is bounded (429 after the limit) and idempotent.
- AC-D8 Rotating the secret shows it once; both signatures are sent during the grace window.
- AC-D9 The Overview and Webhooks views show health (Healthy/Slow/Failing/Off/Not verified) that matches the data.
- AC-D10 `registration.reserved` and payment events are not offered in the type picker.

**E. Shared**
- AC-E1 With all three flags off every new route is 404 `feature_disabled`, S4 specs pass, and the apps show no new UI.
- AC-E2 Every new string exists in EN and SW in both apps, with parity tests green and no overflow at 375 px / 320 dp with Swahili.
- AC-E3 Every actionable control has an accessible name; keyboard-only completion of the desk flow, the secret dialog and the endpoint form works; focus order matches §8.3.
- AC-E4 Rule 6 list in the PR descriptions matches §11.4 exactly.

---

## 13. Backend confirmations for `fitflex-planner` / `contract-checker` (the builder resolves these in the PR)

1. Highest migration timestamp at branch time (S4 note: `…091100` sorts before applied `…0111/…0120/…0121`); S5 migrations must sort last and be dry-run on the CI DB.
2. `EventTicket` columns S4 added (`tokenVersion`, `tokenKeyId`, `displayCode`, `rotatedAt`, `issuedForUserId`) are the ones named here; whether `displayCode` is unique enough to search by (a collision returns up to two cards).
3. `EventKitCollection.status` semantics: confirm a `corrected` row plus the superseded row going to `exception` is allowed by the S1 CHECKs and the `collected` partial unique in one transaction (order of operations).
4. Whether `EventRegistration.kitStatus = 'exception'` should be set by an `exception`-status collection and cleared by a void; confirm the S1 CHECK allows `ready` after `collected`.
5. Collection points are included in the participant ticket payload safely (public fields only) and the S2 `instructions {en, sw}` shape.
6. Every write that changes a registration-visible fact (kit, bib, claim, team, cancel) bumps `EventRegistration.updatedAt` (no trigger exists today?).
7. `kit.state` is computed (`ready` when confirmed + active ticket + `kitProvided`); confirm `kitProvided` is a stored Event field and not only a wizard flag.
8. `OutboxEvent.seq` identity column is acceptable for the table size and the `EVENTS_FEED_LAG_SECONDS` approach is enough (or choose an `xmin`-based horizon).
9. Refund outbox rows: whether a `refund.rejected`/`approved` row exists; confirm the mapper needs no change to `refund-service.mjs`/`events-money-store-pg.mjs` (rule 6).
10. Case of keys: webhook envelope and `/v1` JSON are camelCase (repo convention) although the PRD sample is snake_case; `contract-checker` confirms nothing external expects snake_case.
11. No env escape for private addresses in the SSRF guard; the resolver and HTTP client are injectable for specs; confirm the Node `https.Agent` `lookup` pinning works with SNI as designed on the production Node version.
12. Cancelling a confirmed registration releases its live bib in the same transaction and appends `bib.released`-style data inside `registration.cancelled`/`registration.updated` (no new subscribable type).
13. The S4 cancel flow's `kit_collected` block reads `kitStatus = 'collected'`; confirm where the 409 is produced today.
14. Where `registration.updated` should be emitted (claim, participant detail edit, team join/leave) and that no existing path writes registration changes without a transaction that can carry the outbox row.
15. Member notices `event_kit_collected` / `event_bib_assigned`: capacity of the notifier for bulk assigns of thousands (in-app only for bulk) and `memberRouteFor` additions.
16. The `Idempotency-Key` conventions (8 to 100 chars) match `POST /me/shop-orders`; `OrganizerIdempotency` replaces per-table columns; retention job location.
17. Reuse of the KYC document-expiry reminder pattern for API client expiry notices (30-day jobs?), or a new small sweep inside `event-webhook-retention`.
18. OpenAPI as JSON in `fitflex-functions/docs/api/` (is `docs/` present and shipped?), a JSON-schema validator already in dependencies (ajv?), otherwise a minimal structural check.
19. Whether the bfast platform terminates TLS and exposes `X-Forwarded-For` for the per-IP token limiter; which header to trust and how.
20. Does the platform log request paths/headers/bodies for `/v1/organizer/token` (follow-up L5 pattern): the secret travels in the body; confirm redaction or accept Basic auth header redaction.
21. `ApiClient.ownerType` CHECK stays `organizer`; `ownerId` is `EventOrganizer.id` and is checked on every request against `Event.organizerId`.
22. Cron cadence: a one-minute rule and a job loop of about 50 s are allowed by the ops framework and advisory locks (no overlap on multiple servers).
23. `GET /events/options` caching (portal `useEventsOptions`) so `ops.*` flips appear without redeploy.
24. Admin event page route and ACL for the payout edit and the "Integrations" block (`events` scope; `ALL_ACL_SCOPES` unchanged).
25. Public event payload and the `/v1` events list must not leak `payoutSchedule`, `termsSnapshot` or commission data.
26. Consent text currently covers sharing of kit and bib status with the organizer (§11.9).
27. Whether account deletion or `Person` anonymisation paths exist that the feed must announce (`changed: ['anonymised']`).
28. Rate limit keys use `req.user.sub` (staff) and `req.apiClient.id` (API), never the IP alone, except on the token route.

---

## 14. Known gaps and reminders (rule 8)

- **Offline scanning and offline roster cache are S7** (D7): the desk needs a connection; S5 queues nothing.
- **A staff phone scanner is not built**; web scanner only (§9.2).
- **Organizer settlement statements are not built**; `payoutSchedule` is a label. Trainer and vendor settlement have also never been exercised against real accounts. D28 payout timing is superseded by D33 but the settlement slice will need to define the actual dates.
- Payment provider: D34 says the owner may change provider; manual confirmation remains the launch path; this slice does nothing for it. Event payments still fail closed until `MONEY_SECOND_APPROVER` is on.
- Deferral/reschedule communication and organizer broadcast to registrants (KIT-010 second half) are not built; cancellation notices exist from S4.
- KIT-009 checkpoints, waves and volunteer roles (P1) not built.
- Contact data (phone/email), emergency contact and date of birth for organizers: deliberately absent (Q1, Q2).
- Per-server in-memory rate limits (multi-server allowance is larger than stated).
- Legal text (consent wording, organizer terms, API terms of use) is draft pending Tanzanian counsel; no API terms exist and an organizer-facing "acceptable use of the API" line is needed before general release. Swahili needs native review (new terms: "Uchukuaji wa vifaa", "Namba za mbio", "Miunganisho", "webhook", "mteja wa API", "siri").
- All new flags are off; nothing is switched on by these PRs.
- Not verifiable in UAT without a real device or public network: browser camera permission prompts on real devices, push delivery, and webhooks to a public HTTPS receiver (the SSRF guard blocks local receivers by design).

---

## 15. UAT journeys for `uat-tester` (isolated backend/DB, seed accounts only; camera and push are "needs a real device")

Setup: backend with the three flags on, an organizer with owner/admin/ops/timing/finance accounts, a published event with two categories and two collection points, 6 paid registrations (one cancelled/refunded, one unpaid, one claimed by a member account), a second organizer with its own event, a public HTTPS webhook receiver (a throwaway request-catcher; local receivers are blocked), and Flutter web for the member app.

1. **Set the payout schedule.** Organizer owner creates an event; Review blocks submit without a schedule; choose "Every two weeks"; submit; field read-only. Admin approves, then changes it to monthly with a reason; organizer sees the notice; Finance tab shows "Once a month" and no dates. Check Swahili.
2. **Desk happy path (paste fallback).** Ops logs in, opens Kit collection, picks a collection point, pastes a member's `FFEV1:` payload (copied from the member's ticket page on Flutter web), sees "Ready for kit", hands over; the member app (refresh) shows "Kit collected" and a notice.
3. **Screenshot replay.** Paste the same payload again (and from a second browser as another ops user): "Kit already collected" with time and point; roster count unchanged; ops sees "Ask an owner or admin".
4. **Wrong, revoked, unpaid, unknown, foreign.** Paste a ticket of the same organizer's other event (wrong event), a refunded place's old code (cancelled), search the unpaid person by exact id (not paid yet), garbage text (not recognised), and organizer B's ticket (not recognised, not "different event"), and a gym QR payload (gym-pass message).
5. **Manual handover and override.** Search by name/bib/code, manual handover with a reason; owner records again with a reason, then voids; history shows all rows; ops cannot.
6. **Bibs.** Assign one; change with a reason; try a duplicate; bulk preview/apply for a category; import a CSV with one bad row (nothing applied), fix, apply; the member sees the bib on the ticket and a notice; the desk card shows the bib.
7. **Roster and export.** Roster filters (bib, kit), load beyond one page, export CSV (check columns, a participant named `=cmd` is neutralised, no contact data), 6th download is refused, audit visible to admin.
8. **Role and tenancy checks.** Timing/finance cannot open Kit; organizer A types organizer B's event id and registration id in the URL and API: forbidden/not found, identical to a fake id; suspended organizer is read-only.
9. **API client lifecycle.** Owner creates a test client with `registrations:read`; copy the secret; get a token with `curl`; list events/registrations; follow the change feed with a cursor; try a missing scope (403), wrong secret (401, identical for revoked), rotate with 24 h overlap (both work), revoke (token dies); run the sandbox client and confirm no data persists.
10. **API writes and idempotency.** A `kit:write` + `bibs:write` live client records a collection and a bib with `Idempotency-Key`; replay returns the original; a reused key with another body is 409; rate-limit burst returns 429 with `Retry-After`.
11. **Webhook handshake and delivery.** Add the receiver URL; reject `http://`, `https://localhost`, `https://127.0.0.1`, `https://169.254.169.254`; verify; trigger a kit handover and a bib assignment; the receiver gets signed events (verify the signature with the guide's sample, see the event id stay stable); the delivery log shows attempts; cross-check no names/emails are in the payload.
12. **Failure, recovery, auto-disable.** Make the receiver return 500 / time out: log shows retrying then (after the schedule is accelerated by the test config) gave up; manual retry succeeds after the receiver recovers; a long outage auto-disables the endpoint with the notice; enable again requires verification and offers redelivery; rotate the secret and see both signatures during overlap; a second organizer's endpoint receives nothing from the first organizer's activity.

---

## 16. Owner questions (only those that change behaviour; each has a default)

1. **Contact data for organizers.** Default: none. Organizers (dashboard, export, API) never receive participant phone or email; they reach people through FitFlex notices. The alternative is a `registrations:contact` scope with masked phone in the dashboard. Do you want the alternative? (Changes what an integration such as an SMS reminder tool can do; needs consent-text and counsel review.)
2. **Emergency contact at the venue.** Default: never exposed in S5. A medical-incident lookup (single record, owner/admin, reason required, audited) could be added as its own flow. Wanted before the first live event?
3. **Who may let an integration manage webhooks over the API?** Default: only the organizer owner can grant `webhooks:manage` (a leaked key with it could redirect event data). Alternative: webhooks are managed in the portal only, with no API route for it.
4. **API pilot gate.** Default: any active (KYC-approved) organizer owner can create API clients once `EVENTS_ORGANIZER_API` is on. Recommended for the first events: set `EVENTS_API_ORGANIZER_ALLOWLIST` so FitFlex enables organizers one by one. Allowlist for the pilot, or open to all?
5. **Bib numbers unique across the whole event (recommended) or only within each category.** Whole event avoids two runners with the same number at the finish line; organizers use prefixes for per-distance ranges. Confirm.

(Not asked, decided here with reasons: payout schedule locked after submit with admin-only change after publish; `registration.reserved` not built; payment events not sent to organizers; web scanner first, mobile staff scanner deferred; no ops self-undo.)
