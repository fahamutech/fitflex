# Events S3: registration modes and checkout order creation. Design spec

**Status:** Draft for owner review · **Date:** 2026-10-22 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 3 of `docs/marathon/reuse-map.md` §9 (PRD §16 Phase 3)
**Repos:** `fitflex-functions` (routes in §3), `fitflexmobile` (member registration, orders, claim, teams; §5), `fitflex-portal` (corporate bulk under `/org` and `/hr`, organizer roster and orders, admin visibility; §6)
**Ships:** dormant. Server `EVENTS_REGISTRATION` off (needs `EVENTS_MODULE` too); `GET /events/options.registration` stays `false`, so the S2 "Register" button stays disabled and nothing in this spec renders (§7.1).
**Binding inputs:** `docs/marathon/decisions.md` D1–D14 (D12 organizer cancel blocked once confirmed registrations exist; D14 guest/purchaser "self" place is claimed after verification); PRD v1.0 §5.3 REG-001…016, §5.4 PAY-001/002 (quote only), §7, §8, §9 (happy path steps 1–3), §12 Epic C, §13 scenarios 1–5; `docs/marathon/follow-ups.md` S3 section; `docs/marathon/s2-asbuilt.md`; S2 spec `docs/design/events-s2-organizer-and-discovery.md` (§11.6 CTA states, §12 money/dates, §13 flags, §14 API conventions) which this spec extends.
**Not in scope (later slices):** payment confirmation, provider adapter, refunds (S4); tickets/QR, kit, bibs, organizer API, webhooks, roster export (S5); runs, results, medals (S6); waitlist (REG-015, P1, not scheduled); participant transfer (REG-013, after S4).

Sources read (RC heads of 2026-10-22, read with `git show origin/release-candidate:<path>`; no branch switched): functions `src/infra/event-store-pg.mjs` (`createOrderWithHolds`, `releaseOrder`, `expireHolds`, `RELEASE_REASONS`, `referenceOf`, `holdTtlMinutes`), `src/shared/events-pricing.mjs` (`quoteLines`, fee rule), `src/shared/events-lifecycle.mjs`, `src/shared/events-document.mjs`, `src/auth/events-authz.mjs`, `db/migrations/20270110090100-events-core.cjs`, `20270110090200-events-orders.cjs`, `20270110090800-events-document-fields.cjs`, `20270110091000-person-declared-details.cjs`, `functions/events-public.mjs`, `events-organizer.mjs`, `events-admin.mjs`, `b2b.mjs` (`/b2b/organizations/:id/beneficiaries/import`), `friend-invitations.mjs`, `personal-details.mjs`, `mobile-money.mjs` (`/payments/options.manual`), `src/services/b2b-beneficiary-import-service.mjs`, `friend-invitation-service.mjs` (`maskName`, `parseContact`, token shape), `notification-service.mjs` (`notify`, bilingual `titleEn/titleSw` data pattern), `src/shared/verified-contacts.mjs`, `manual-payment.mjs`, `feature-flags.mjs`; mobile `lib/shared/shop_checkout.dart` (`CheckoutAttempt`, `newCheckoutKey`, `orderOutcomeUnknown`), `manual_payment.dart` (`ManualPayment`, `ManualPaymentSteps`), `kept_link_token.dart`, `pending_friend_invite.dart`, `date_of_birth.dart`, `events_flag.dart`, `events/*.dart`, `screens/member/events/*.dart`, `router.dart`, `components/components.dart`, `i18n.dart`; portal `app/org/*`, `app/hr/*`, `app/organizer/*`, `app/admin/events/page.tsx`, `src/components/b2b-people-import.tsx`, `event-wizard.tsx`, `event-wizard-steps/*`, `organizer-context.tsx`, `organizer/page-states.tsx`, `Shell.tsx` (`orgNav`, `hrNav`, organizer nav), `src/lib/events.ts`, `src/lib/i18n.ts`.

Conventions as in the S2 spec: **EN** / **SW** (every Swahili string needs native review; plan for 20–30 % more length). "Backend field" lines list data this UI needs; a field is not claimed to exist unless it appears in a migration named above. Glossary applied: "app" (never "programu"), "vifaa vya mbio" (race kit), "imeghairiwa" (cancelled), "imeshindikana" (failed), li- noun class for a single event's states (limeghairiwa, limefungwa); **"nafasi" is reserved for "role"**, so a bought place is "tiketi" (ticket) and a held place is "tiketi iliyoshikiliwa", never "nafasi".

---

## 1. What exists today (and what this reuses)

| Need | Reused as is | Notes |
|---|---|---|
| Order, hold, registration primitive | S1 `createOrderWithHolds` (one transaction, `held` raised by conditional UPDATE, order `awaiting_payment` with `holdExpiresAt`, registrations `reserved`, one `hold` movement per line, idempotency scoped purchaser → organisation → event, fingerprint check → 409 `idempotency_key_reused`) | Routes call it; they never forward `holdTtlMinutes`, `feeRule`, `discounts` or `participantUserId` from the body (follow-ups S3). |
| Release before payment | S1 `releaseOrder(orderId, reason)` with `RELEASE_REASONS = cancelled, expired, payment_failed, admin`; `expireHolds` job (`event-hold-expiry`) | Member/corporate cancel passes `cancelled`; admin cancel passes `admin`. The person's own reason is stored separately (§3.9). |
| Price | `quoteLines(ticketTypes, lines, { feeRule })`, whole TZS, fee rule from config | The quote route and the order route use the same function and the same fee rule (`EVENTS_FEE_RULE` JSON env, default none) so the quote and the order never differ. |
| Statuses | `events-lifecycle.mjs` order / registration machines; mobile `event_status.dart` pattern for availability → tone/label | §3.12 shows the S3 subset. |
| Verified identity for claims | `verified-contacts.mjs` (`personFor`, `findMember`; `LoginIdentifier.verifiedAt`; fail closed) | REG-010/011, D14: a claim needs a **verified** contact of the claiming account; `User.phone/email` typed on a profile count for nothing. |
| Token in link, kept on device | friend invites: `/friend-invite/#<token>` (fragment), `KeptLinkToken` (24 h), `friendInviteTokenShape`, server `sha256` hash, `GET /friend-invitations/preview/:token` rate-limited | Claim links copy the pattern: `/event-claim/#<token>` (§3.7, §5.9). |
| Idempotent checkout from the app | `CheckoutAttempt.forPurchase(current, signature)`, `newCheckoutKey()` (`chk_` + 32 hex, within the server's 8–100 rule), `orderOutcomeUnknown(error)` | Reused unchanged; the signature is the registration payload (§5.6). |
| Manual payment UI | `ManualPayment.fromOptions`, `ManualPaymentSteps`, `TransactionIdField` (mobile); `manual-payment-settings.tsx` (portal) | **Not rendered in S3.** The awaiting-payment screen reserves the slot (§5.7); S4 fills it from `next.payment`. |
| Bulk roster import | `b2b-beneficiary-import-service.mjs` (`splitCsv`, header aliases, `dryRun`, per-row problems, `listed_twice`, 2,000-row cap, 2 MB file) and `b2b-people-import.tsx` (paste or file, preview cards, problem table) | New service `events-roster-service.mjs` copies the parsing and dry-run shape with event columns (§3.10); portal `event-roster-import.tsx` copies the component (§6.2). |
| Bilingual notifications | `notification-service.notify` with `data.titleEn/bodyEn/titleSw/bodySw` + `localeOf(userId)` (trainer "missed session" pattern) | Every S3 message is sent this way (§3.14). |
| Date of birth | server `/me/personal-details` (`Person.dateOfBirth`, `gender`; flag `PARTNER_DOB_REQUIRED`), mobile `date_of_birth.dart` (`showDateOfBirthPicker`, `parseDateOfBirth`, `dateOfBirthProblemKey`, East-Africa "today") | "Myself" prefill (§5.5) and the participant DOB field. Age is computed server-side (§3.11). |
| Masking | `maskName` ("N**** A*******") from the friend-invitation service | Organizer roster for reserved rows and claim previews. |
| Money / dates | portal `money(v,'TZS')`, mobile `formatCurrency`; event-timezone formatting of S2 §12 | Unchanged. |
| Portal shells | `orgNav` / `hrNav` in `Shell.tsx`, `Stepper`, `DataTable`, `Dialog`/`ConfirmDialog`, `MetricCard`, `Badge`, `Alert`, `EmptyState`, `ErrorState`, `Skeleton*`, `SearchableSelect` | §6. |
| Mobile components | `FFCard`, `FFChoiceTile`, `FFTextField`, `FFDropdownField`, `FFButton`, `FFBadge`, `FFPill`, `FFAlert`, `FFSheet`, `FFDialog`, `FFSnack`, `FFSegmented`, `FFSectionTitle`, `FFPageHeader`, `FFEmptyState`, `FFErrorState`, `FFSkeletonList`, `FFActionTile`, `FFAvatar` | §5. |

**New components proposed (with reason):**
1. Mobile `lib/screens/member/events/register/` — `member_event_register_page.dart` (4-step flow, §5.3–5.6), `ticket_picker.dart`, `participant_form.dart` (one repeatable card), `registration_mode_tiles.dart`, `quote_summary.dart`; `lib/shared/events/registration_draft.dart` (local draft model + storage), `event_order.dart` / `event_registration.dart` models, `events_checkout.dart` (signature + attempt glue over `CheckoutAttempt`). Greenfield: no existing form collects several people's details in one checkout (shop checkout is one buyer, B2B import is portal-only).
2. Mobile `FFQuantityStepper` (`lib/shared/components/ff_quantity_stepper.dart`): minus / value / plus, 44 dp targets, `Semantics(value:, increasedValue:, decreasedValue:)`. The shop uses an inline `-`/`+` pair inside its cart tile that is not reusable; the ticket picker, the corporate portal and S5 kit counts all need one.
3. Mobile `FFCountdownText` (`lib/shared/components/ff_countdown_text.dart`): "27 min left" from a `DateTime`, re-renders each minute (each second under 60 s), `Semantics(liveRegion: true)`. Nothing similar exists (the shop reservation shows a fixed time only).
4. Mobile `member_event_orders_page.dart` (Registrations | Orders), `member_event_order_page.dart` (awaiting payment), `member_event_registration_page.dart`, `event_claim_page.dart`, `event_team_sheet.dart`.
5. Portal `src/components/event-roster-import.tsx` (copy of `b2b-people-import.tsx` with event columns and the quote step), `event-corporate-order.tsx` (wizard + order detail), `event-registrations-table.tsx`, `event-orders-table.tsx` (used by organizer and admin views with a `fieldPolicy` prop).
6. Backend `src/services/events-registration-service.mjs` (quote, order, cancel, claim, teams, my lists), `events-roster-service.mjs` (corporate parse + validate), `src/shared/events-participants.mjs` (pure: field policy, eligibility, duplicates, masking, consent text), migration `20270110090900-events-registration-fields.cjs` (§3.2). Wizard: one new section in the existing Terms step (§6.4).

---

## 2. Personas and what each can do in S3

| Actor | Identity | Can in S3 |
|---|---|---|
| Member (purchaser) | `member` | Quote, place an order for self / others / group / team, see own orders and registrations, cancel before payment, create or join a team, claim a place registered by someone else. |
| Participant without an account | — | Nothing until they sign up and verify the contact the purchaser gave; then claim (§3.7). |
| Guest purchaser | not built in S3 | `purchaserUserId = null` orders exist in S1 for a future guest flow; S3 exposes no guest route (every member route needs `requireAuth('member')`). D14 still applies to a signed-in purchaser's "self" place: `participantUserId` = purchaser at creation (S1 does this), nothing to claim. |
| Corporate coordinator | org user of a `B2BOrganization` (`/org`) or company HR (`/hr`) with the roster permission (§3.10) | Validate a roster, place a corporate order (organisation consent basis, cost centre, reference), see and cancel the organisation's unpaid orders. |
| Organizer owner / admin / ops / timing | `event_organizer`, `organizer_staff` | Read the roster of their own events (masked per §3.13). |
| Organizer owner / admin / finance | same | Read orders of their own events (amounts, status, purchaser type). |
| FitFlex admin, scope `events` | portal admin | Orders and registrations of any event (full names), cancel an unpaid order with reason `admin`. Payment confirmation stays S4 (D6). |

---

## 3. Backend contract (routes, fields, rules)

Conventions: S2 §14 (no `/api/v1`; D5 envelope `{ error: code, ...extra }`; `{ items, nextCursor }` pagination, `limit` default 20 max 50; UTC ISO timestamps; whole TZS + `currency`). Every S3 route is wrapped in `routeGuard(method, [...])`, requires `EVENTS_MODULE` **and** `EVENTS_REGISTRATION` (either off → 404 `feature_disabled`), then `requireAuth(...)`. Member routes: `requireAuth('member')`. Organizer routes: `requireOpenOrganizer(...roles)` from `events-authz.mjs` (suspended organizers read, nothing else). Corporate routes: the existing B2B organisation guard (the caller holds a membership of `:id`; §3.10 permission). Admin: `requireAdmin` + ACL scope `events`.

### 3.1 Options probe (extends S2 §13)
`GET /events/options` (public, never 404) adds, when `EVENTS_REGISTRATION` is on:
```
registration: true,
holdTtlMinutes: 30,                 // EVENT_HOLD_TTL_MINUTES (S1)
maxParticipantsPerOrder: 10,        // EVENTS_MAX_PARTICIPANTS_PER_ORDER (new config, default 10; bounded below by ticket maxPerOrder)
payment: 'none',                    // 'none' | 'manual' | 'provider' — S3 always 'none'; S4 derives it from MANUAL_PAY_INSTRUCTIONS / EVENTS_PAYMENTS_TUNZAA
teams: true, corporate: true,       // both ride EVENTS_REGISTRATION in S3; separate keys so they can be split later without an app change
claim: { smsCodes: bool, emailCodes: bool },  // copied from /auth/options so the claim screen can say which contact can be verified in the app
consentTextVersion: '2026-10-draft' // EVENTS_CONSENT_TEXT_VERSION
```
When the flag is off the keys are absent and `registration: false` (the S2 model already defaults them).

### 3.2 Migration `20270110090900-events-registration-fields.cjs` (additive: every new column is nullable or defaulted; `down` drops them without a fail-closed guard, since no data would be orphaned)
These are the fields this spec needs that are **not** in S1/S2. `fitflex-planner` / `backend-builder` confirm names.

| Table | Column | Type / rule | Why |
|---|---|---|---|
| `Event` | `participantFields` | jsonb, default `{}` → effective defaults in §3.11 | REG-008: which fields are collected (name is always required and not configurable). |
| `Event` | `duplicatePolicy` | text, CHECK in (`one_per_category`, `allow`), default `one_per_category` | REG-009 "duplicate registration rules … encode as policy". |
| `EventOrder` | `createdByUserId` | FK User, SET NULL | Corporate orders have `purchaserUserId = null` (S1 scoping); the coordinator is recorded here for audit. |
| `EventOrder` | `costCentre`, `purchaserReference` | text ≤ 80 each, nullable | REG-005. |
| `EventOrder` | `termsAcceptedAt`, `consentTextVersion` | timestamp(3), text | PAY-002 / REG-010 proof of acceptance. |
| `EventOrder` | `teamId` | FK `EventTeam` (id, eventId) composite, SET NULL | An order placed for / into a team. |
| `EventRegistration` | `kitSize` | text, CHECK in (`xs`,`s`,`m`,`l`,`xl`,`xxl`,`xxxl`), nullable | REG-006 "kit choices"; only asked when `participantFields.kitSize ≠ off`. |
| `EventRegistration` | `consentTextVersion`, `consentAt` | text, timestamp(3) | REG-010. |
| `EventRegistration` | `claimTokenExpiresAt`, `claimInvitedAt`, `claimInviteCount` | timestamp(3), timestamp(3), int default 0 | Claim link lifetime (default 90 days, `EVENTS_CLAIM_TOKEN_DAYS`) and send bookkeeping (S4 sends). |
| `EventRegistration` | `phoneNormalized`, `emailNormalized` | text, indexed with `(categoryId)` | Duplicate detection and claim matching without re-normalising rows; written by the service from `phone` / `email`. |
| `EventTeam` | `joinCodeHash`, `maxMembers`, `createdByUserId` | text unique, int nullable (null = event default `EVENTS_TEAM_MAX_MEMBERS` 50), FK User | Join by code. Store the code in clear as `joinCode` text unique (it is a low-value invite code like gym codes, not a credential); it is returned on creation and on `GET /me/event-teams/:id` to the captain only. A hashed variant is acceptable if backend-builder prefers it; the UI is the same. |

No new tables. `EventTeamMember` and `EventInventoryMovement` are unchanged.

### 3.3 Field policy and participant payload (REG-008, data minimisation)
`participantFields` keys and allowed values `required | optional | off`:

| Key | Default | Rule |
|---|---|---|
| `phone` | `required` | At least one of phone / email is always required for a non-self participant (how they claim and are contacted); the organizer may make both optional only if `allowContactless: true` is set by admin (not in S3 UI → effectively one contact is required). |
| `email` | `optional` | |
| `dateOfBirth` | `required` if any category has `minAge`, else `off` | Age eligibility (§3.11) cannot be checked without it; otherwise not collected. |
| `gender` | `off` | Organizers that run gender categories set `optional` or `required`. |
| `emergencyContact` | `optional` | `{ name, phone }`; never in lists, exports or webhooks (§8.3). |
| `kitSize` | `optional` when `Event.kitProvided`, else `off` | |

Participant wire shape (quote, order, roster rows):
```
{ ticketTypeId, firstName, lastName, phone?, email?, dateOfBirth? ("YYYY-MM-DD"), gender? (male|female|other),
  emergencyContact? { name, phone }, kitSize?, consentBasis: 'self' | 'purchaser_authorised' | 'organisation' }
```
`participantUserId` is never accepted (the store ignores it; the route strips it). At most one `self` per order (store rule). Corporate rows are always `organisation`.

### 3.4 `POST /me/event-orders/quote`
Body: `{ eventId, lines: [{ ticketTypeId, quantity }], participants: [...§3.3], team?: { create: { name, teamType: 'club'|'community' } } | { joinCode } , organizationId?: null }` (members never send `organizationId`; it is refused 400 `organization_not_allowed` on this route; corporate quotes go through §3.10).
Behaviour: validates everything the order route will validate **without locking or holding** (reads live ticket rows), prices with `quoteLines` and the configured fee rule, computes server-side discounts (none for members in S3), and reports per-participant problems so the app can show all of them at once.
200:
```
{ valid: bool,
  quote: { currency, lines: [{ ticketTypeId, ticketTypeName, categoryId, categoryName, quantity, unitPriceTzs, discountTzs, feesTzs, lineTotalTzs }],
           subtotalTzs, discountTzs, feesTzs, totalTzs, feeLabel: { en, sw } | null },
  quoteExpiresAt,                       // now + 5 min; informational (prices are re-read at order time; the order fails if they changed: 409 price_changed — see §3.5)
  holdTtlMinutes,
  availability: { [ticketTypeId]: { availability, remaining } },   // same vocabulary as S2 §11.3; remaining null unless ≤ 10
  participants: [{ index, ok, problems: [{ field, code }] }],      // codes §3.11
  problems: [{ code, ...extra }],                                   // order-level codes (quantity_out_of_range, too_many_participants, team_*)
  team: { mode: 'create'|'join'|null, name, memberCount, maxMembers, ok, problems } | null,
  fields: { ...effective participantFields },                       // the app renders the form from this, not from its own defaults
  refundPolicy: { preset, text: { en, sw } }, termsVersion: event.version,
  consentText: { version, en, sw } }                               // §3.11 consent copy
```
Errors (not 200): 404 `event_not_found` / `feature_disabled`, 409 `event_not_open` (`eventStatus`), 409 `registration_closed`, 400 `invalid_lines`, 400 `participants_mismatch`, 429 `rate_limited` (60/min per user).

### 3.5 `POST /me/event-orders` (REG-001…004, 007, 009, 014; PRD §9 steps 2–3)
Headers: `Idempotency-Key` **required** (400 `idempotency_key_required`; shape 8–100 chars `[A-Za-z0-9._:-]`). Fingerprint = sha256 of the canonical body (sorted keys); same key + different body → 409 `idempotency_key_reused` (S1). Replay → 200 with `replayed: true` and the original order (even if it has since expired — the app then reads its status).
Body: quote body + `{ acceptedTerms: true, consentTextVersion }`.
Server steps: (1) field policy + eligibility + duplicates (§3.11) → 422 `participant_invalid { participants: [{ index, problems }] }` listing **every** row's problems; (2) `acceptedTerms !== true` → 400 `terms_not_accepted`; `consentTextVersion` ≠ current → 409 `consent_version_stale` (app re-fetches the quote); (3) total participants > `maxParticipantsPerOrder` → 400 `too_many_participants { max }`; (4) team: resolve `joinCode` → `team_not_found` 404 / `team_full` 409 / `team_disbanded` 409; `create` → name unique per event else 409 `team_name_taken`; (5) `createOrderWithHolds({ eventId, purchaserUserId: me, lines, participants, idempotencyKey, fingerprint })` — the route passes **no** `discounts`, `holdTtlMinutes`, `feeRule`; (6) in the same transaction (store gains an optional `afterCreate(trx, result)` hook, or the service wraps: backend-builder decides, must stay atomic): write `termsAcceptedAt`, `consentTextVersion` on the order and `consentTextVersion`, `consentAt`, `phoneNormalized`, `emailNormalized`, `kitSize`, `claimTokenHash` + `claimTokenExpiresAt` (non-self rows only) on each registration; create the team (`create`) with `captainRegistrationId` = the `self` registration if any, else the first participant; insert `EventTeamMember` rows (`captain` / `member`); (7) after commit: notifications (§3.14), analytics `order_created`.
Price drift: the client sends `expectedTotalTzs` (the total from its quote). `createOrderWithHolds` gains an optional `expectedTotalTzs`; after `quoteLines` runs on the locked rows and **before** any hold is written, a mismatch is refused with 409 `price_changed { quotedTotalTzs, totalTzs }` and nothing is written. `expectedTotalTzs` is the only money the client sends and it is used solely for this equality check; it never influences the price.
201:
```
{ order: { id, reference, eventId, status: 'awaiting_payment', currency, subtotalTzs, discountTzs, feesTzs, totalTzs, holdExpiresAt, holdCycle, createdAt, teamId },
  lines: [...as quote.lines], registrations: [{ id, ticketTypeId, categoryId, firstName, lastName, status: 'reserved', consentBasis, isSelf, claimState }],
  holdExpiresAt,
  next: { payment: 'none', instructions: null },     // S4: 'manual' + { lipaNamba, accountName, network, instructions {en,sw}, referenceRequired, payerPhoneRequired, amountTzs, reference } or 'provider' + attempt
  event: EventSummary (S2 §14.1), replayed: false }
```
`claimState` per registration: `self` (purchaser's own, already linked), `unclaimed`, `claimed`. Errors from the store pass through unchanged: 404 `event_not_found`, `ticket_type_not_found`; 409 `event_not_open`, `registration_closed`, `sale_not_open`, `sale_closed`, `ticket_type_inactive`, `category_inactive`, `capacity_unavailable { ticketTypeId }`, `idempotency_key_reused`; 400 `quantity_out_of_range { min, max }`, `invalid_lines`, `participants_mismatch`, `invalid_participant`, `multiple_self_participants`.

### 3.6 Reads
- `GET /me/event-orders?status=awaiting_payment|confirmed|cancelled|expired&cursor&limit` → `{ items: [{ id, reference, status, event: { id, slug, title, startsAt, timezone, utcOffsetMinutes, timezoneAbbr, heroThumbUrl }, placesCount, totalTzs, currency, holdExpiresAt, createdAt, closedAt, closeReason }], nextCursor }`, newest first. Purchaser-scoped (`purchaserUserId = me`).
- `GET /me/event-orders/:id` → `{ order, lines, registrations: [full participant fields incl. emergencyContact (the purchaser typed them), claimState, cancelReason], event: EventSummary + { refundPolicy, contact }, team: { id, name, teamType, memberCount, joinCode (captain only) } | null, next: { payment, instructions }, allowedActions: ['cancel'] | [] }`. 404 `order_not_found` for anyone but the purchaser (never 403; do not reveal existence).
- `GET /me/event-registrations?cursor&limit` → places where `participantUserId = me` **or** `purchaserUserId = me`: `{ items: [{ id, relation: 'self' | 'purchased' | 'claimed', participant: { firstName, lastName }, event (summary), category: { id, name, distanceM, startsAt }, ticketType: { name }, status, orderId, orderReference, orderStatus, holdExpiresAt, claimState, team: { name } | null }], nextCursor }`, soonest event first, cancelled/expired after. `relation = claimed` when I am the participant and someone else purchased.
- `GET /me/event-registrations/:id` → the row above + `kitSize`, `dateOfBirth`, `gender`, `phone`, `email`, `emergencyContact` (visible to the purchaser and to the claimed participant; a participant who is not the purchaser sees the purchaser as `purchaser: { nameMasked }`), `consentBasis`, `consentAt`, `allowedActions: ['cancel'] | []`, `ticket: null` (S5). 404 `registration_not_found` otherwise.
- `GET /me/event-registrations/claimable` → `{ items: [{ id, event (summary), category: { name }, participant: { firstNameMasked: "A***", lastInitial }, purchaser: { nameMasked }, matchedContact: { type: 'phone'|'email', masked: '••• 678' }, status }] }`: unclaimed registrations (status `reserved` or `confirmed`) whose `phoneNormalized` / `emailNormalized` equals one of **my verified** contacts (`LoginIdentifier.verifiedAt`, via `verified-contacts.mjs`). Nothing matched by name. Expired/cancelled rows excluded.

### 3.7 Claim (REG-010, REG-011, D14)
- `GET /event-claims/preview/:token` (public, rate-limited 40/h per IP like friend previews) → `{ event: { title, startsAt, timezone… }, category: { name }, participant: { firstNameMasked, lastInitial }, purchaser: { nameMasked }, contact: { type, masked }, status: 'reserved'|'confirmed'|'cancelled'|'expired', claimState }`; 404 `claim_token_invalid` (unknown or wrong shape), 410 `claim_token_expired`. Returns only masked data: the token proves possession of a link, not identity.
- `POST /me/event-registrations/:id/claim { token? }` → 200 `{ registration }` with `participantUserId = me`, `claimedAt = now`, `claimTokenHash = null`. Rules, all enforced server-side: (a) registration exists, `participantUserId` null, status `reserved` or `confirmed`; (b) **the registration's `phoneNormalized` or `emailNormalized` equals a verified contact of the caller** (mandatory, token or not — REG-010 "never on name only"; the token alone does not identify a person); (c) if `token` is given, `sha256(token) = claimTokenHash` and not expired (so a link opens the right registration without exposing the id to search); without a token the id must have come from `claimable` (the match in (b) is re-checked anyway); (d) the caller is not the purchaser claiming a place they entered for someone else with a contact that is their own (`consentBasis = purchaser_authorised` and the matched contact is also the purchaser's → 409 `claim_own_contact`: "You registered this place for someone else with your own number"); (e) single compare-and-set on `participantUserId IS NULL`. Errors: 404 `registration_not_found`, 409 `already_claimed` (by another account; support path), 403 `claim_not_verified { contact: { type, masked }, verifiable: bool }` (the matching contact is on my profile but not verified, or not on my profile at all; `verifiable` = the app can verify that type of contact now, from `claim.smsCodes/emailCodes`), 409 `registration_closed_state` (cancelled/expired/refunded), 400 `claim_token_invalid`, 410 `claim_token_expired`.
- After a claim: the registration appears in the participant's list with `relation: claimed`; the purchaser keeps read access and the cancel right while unpaid; notification to the purchaser "{name} claimed their place" (§3.14).
- Claim links: `${shareBase}/event-claim/#<token>` (same host as friend invites; fragment never reaches the server). Token: 32 random bytes base64url (43 chars), hash stored. **S3 generates and stores the token; S3 does not send it** (§3.14, Q1).

### 3.8 Cancel before payment (S3 scope; refunds S4)
- `POST /me/event-orders/:id/cancel { reason }` → 200 `{ order (cancelled), registrations (cancelled) }`. Allowed when `status = awaiting_payment` and caller is the purchaser (corporate: §3.10). Store call `releaseOrder(id, 'cancelled')`; the person's `reason` is stored as `EventRegistration.cancelReason` on every released row. Closed set `MEMBER_CANCEL_REASONS = changed_mind | wrong_details | duplicate | other`; anything else 400 `invalid_reason`. 409 `invalid_transition` (confirmed → "cancellation and refunds come with the next release", S4), 409 `already_closed` → returned as `changed: false` 200 by the store: the route answers 200 with the current order (idempotent).
- `POST /me/event-registrations/:id/cancel { reason }` → one place out of an unpaid order. Allowed to the purchaser (not to a claimed participant in S3: they ask the purchaser). If the registration is the only live one in its order → same as order cancel. Otherwise the store needs a new primitive **`releaseRegistration(orderId, registrationId, reason)`**, in one transaction under `FOR UPDATE` on the order and the ticket-type row: `held = held − 1` on that line's ticket type; one `release` movement of quantity 1 with key `${orderId}:${cycle}:release:${ticketTypeId}:${registrationId}` (the registration id keeps the key unique across several single releases in one cycle); the line's `quantity − 1` with its money re-derived from `priceSnapshot` through `quoteLines`; order totals updated under the money CHECK; the registration `cancelled` with `cancelReason`; a `registration.cancelled` outbox row (as `releaseInTrx` writes). A line is only ever reduced, never to 0 (`EventOrderLine.quantity > 0`, and `EventRegistration.orderLineId` is RESTRICT): removing the **last place of a line** while other lines remain is refused with 409 `remove_whole_line`, and the app offers "Cancel the whole order and register again" (rare: it needs two ticket types in one order). Team member rows stay (membership lists filter on live statuses). 409 `invalid_transition` if the order is not `awaiting_payment`.
- Admin: `POST /admin/events/:eventId/orders/:id/cancel { note }` (scope `events`) → `releaseOrder(id, 'admin')`, audit row `events.order_cancelled` with the note. Confirmed orders → 409 (S4).
- Organizer: no cancel route in S3 (D12).

### 3.9 Teams (REG-004)
- `POST /me/event-teams { eventId, name, teamType: 'club'|'community' }` → 201 `{ team: { id, eventId, name, teamType, joinCode, memberCount: 0, maxMembers, captainRegistrationId: null, createdByUserId: me } }`. Name 1–120 chars, unique per event (409 `team_name_taken`), event must be `published` (409 `event_not_open`). Rate 10/day per user. The creator becomes captain when their own registration joins (first `self` registration placed into the team). A team with no live members after `EVENTS_TEAM_EMPTY_DAYS` (7) is disbanded by a sweep (S7; note only).
- `POST /me/event-teams/lookup { eventId, joinCode }` → `{ team: { id, name, teamType, memberCount, maxMembers, captain: { firstName, lastInitial } | null } }`; 404 `team_not_found` (also for a wrong event), 409 `team_full`, `team_disbanded`. Rate 30/h per user (codes are guessable otherwise). Codes: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, shown grouped "AB12-CD34", normalised case-insensitively without the dash.
- `GET /me/event-teams/:id` → team + `members: [{ registrationId, participant: { firstName, lastInitial }, role, status }]` (live statuses only), `joinCode` only for the captain or creator, `isCaptain`. Visible to anyone whose registration is a member; 404 otherwise.
- Joining happens only through an order (`team: { joinCode }` on quote/order, §3.5) so every member is a registration; capacity check `memberCount + newPlaces ≤ maxMembers` inside the order transaction.
- Corporate: the corporate order's optional `team: { create: { name } }` makes a `corporate` team with `organizationId` set; all its registrations join (§3.10).

### 3.10 Corporate bulk (REG-005, REG-016) — portal only
Guard: caller is a user of `B2BOrganization :id` with permission **`beneficiaries.manage`** (the roster permission that already governs who may add people in `b2b-beneficiary-import-service.mjs`) — **confirm** that this is the right permission or whether billing roles (`ORG_BILLING` set in `Shell.tsx`) must also hold; the UI shows the pages to `beneficiaries.manage` and places the order with the same permission in S3 (Q4). Company-HR (`/hr`) users act through the same organisation id they manage today. The organisation must be `active` (409 `organization_not_active`). Coordinator identity is bound to the organisation by the guard before the idempotency scope `(organizationId, key)` is used (follow-ups S3).
- `POST /b2b/organizations/:id/event-orders/roster/validate` — body `{ eventId, rows?: [...], rawText?: string }`. Columns (header aliases, any order; without a header: `first name, last name, phone, email, category, date of birth, gender, kit size, group`): `firstName` (aliases `first name`, `given name`), `lastName` (`last name`, `surname`, `family name`), `name` (one column "Asha Mollel" → split on the last space; a single word → `name_incomplete`), `phone` (`mobile`, `mobile number`), `email`, `category` (`distance`, `race`; matches `EventCategory.name` case-insensitively or a distance like "10K"/"21km"), `ticketType` (optional; default = the category's cheapest active ticket type on sale), `dateOfBirth` (`dob`, `date of birth`; `YYYY-MM-DD` or `DD/MM/YYYY`), `gender`, `kitSize` (`t-shirt`, `shirt size`), `group` (`department`, kept on the registration? **No column exists** → `group` is accepted and ignored in S3 with a `group_ignored` notice; listed in §9). Up to `EVENTS_CORPORATE_MAX_ROWS` (500; 413 `too_many_rows`); file ≤ 2 MB (client).
  Response: `{ rows: [{ index, ok, participant (normalised), categoryId, ticketTypeId, problems: [{ field, code }] }], duplicates: [{ index, kind: 'in_list' | 'already_registered', otherIndex?, registrationStatus? }], summary: { total, ok, problems, duplicates }, lines: [{ ticketTypeId, quantity }], quote (as §3.4, for the ok rows only; `null` when none), availability, fields, consentText, refundPolicy, capacityShort: [{ ticketTypeId, requested, remaining }] }`. Problem codes = §3.11 plus `category_unknown`, `category_closed`, `ticket_type_unknown`, `name_incomplete`, `listed_twice` (in_list duplicate). An `already_registered` duplicate (same phone/email already `reserved`/`confirmed` in that category) is reported as a problem on the row (`duplicate_participant`) when the policy is `one_per_category`.
- `POST /b2b/organizations/:id/event-orders` — headers `Idempotency-Key`; body `{ eventId, rows (the validated, ok rows as the client holds them) , costCentre?, purchaserReference?, team?: { create: { name } } , acceptedTerms: true, consentTextVersion, expectedTotalTzs }`. The server re-validates every row (never trusts the dry-run), builds `lines` by ticket type, sets `consentBasis: 'organisation'` on every participant, calls `createOrderWithHolds({ eventId, purchaserUserId: null, organizationId: id, …, idempotencyKey, fingerprint, discounts })` with `discounts` computed from server config only: `EVENTS_ORG_DISCOUNTS` (JSON env `{ "<organizationId>": { "pct": 10 } }`, default `{}`; shown in the quote as a discount line labelled "Approved organisation discount"; per-agreement rates are a later slice), and with a server-side `bulk: true` option that lifts `maxPerOrder` to `EVENTS_CORPORATE_MAX_ROWS` for this call (store change: `maxPerOrder` check skipped when `bulk` and the caller is the service — **confirm**). Writes `createdByUserId`, `costCentre`, `purchaserReference`, terms/consent columns, team. 201 as §3.5 plus `organizationId`. Rows that fail → 422 `participant_invalid` with every row's problems (nothing written). Capacity short → 409 `capacity_unavailable { ticketTypeId, requested, remaining }` (nothing written, S1 all-or-nothing).
- `GET /b2b/organizations/:id/event-orders?status&cursor` and `GET /b2b/organizations/:id/event-orders/:orderId` → as §3.6 with `createdBy: { name }`, `costCentre`, `purchaserReference`, full participant list (the organisation typed it), `allowedActions`.
- `POST /b2b/organizations/:id/event-orders/:orderId/cancel { reason }` → as §3.8 (order-level only; no per-row removal for corporate in S3: "fix the list and place a new order").
- A corporate order's registrations are claimable by employees exactly as §3.7 (consent basis `organisation`); invitations are sent at confirmation (S4).

### 3.11 Validation rules (REG-009), codes and consent copy
Per-participant codes (`field` names the wire key; the apps map `events.validation.<code>`):

| Code | When |
|---|---|
| `required` | a field whose policy is `required` is empty |
| `not_collected` | a field whose policy is `off` was sent (dropped, reported as a warning `ok: true`, so a stale app never blocks a purchase) |
| `name_invalid` | first/last name not 1–80 chars after trim, or contains digits/`@` |
| `phone_invalid` / `email_invalid` | `normalizePhone` / email regex fail (same helpers as B2B import) |
| `contact_required` | non-self participant with neither phone nor email |
| `dob_invalid` | not a real date 1901-01-01…today (East Africa day), same rule as `/me/personal-details` |
| `dob_required` | category has `minAge` and DOB missing |
| `age_not_eligible { minAge, ageOnEventDay }` | age on the **event start day in the event's timezone** < `category.minAge` |
| `gender_invalid`, `kit_size_invalid` | outside the closed sets |
| `emergency_contact_invalid` | name missing or phone invalid when the object is sent |
| `duplicate_participant { registrationId? }` | policy `one_per_category` and the same `phoneNormalized` or `emailNormalized` is on a `reserved`/`confirmed` registration of the same category (any order, any purchaser), **or** twice within this request (`listed_twice` for rosters) |
| `self_contact_mismatch` | `consentBasis: self` with a phone/email that is not one of the purchaser's own contacts (the self row is prefilled; a different contact means it is not "self") |
| `consent_basis_invalid` | not in the set, or `organisation` on a member order, or anything but `organisation` on a corporate order |

Age: `floor((eventStartDate − dateOfBirth) in years)` computed from calendar dates in the event's timezone; a participant turning `minAge` on event day is eligible.
Consent text (served by the quote, `EVENTS_CONSENT_TEXT_VERSION`, **draft pending Tanzanian counsel**; the apps render it next to the checkbox, never hard-code it):
- EN, `self`: "I agree to the event terms and refund policy and to FitFlex sharing my registration details (name, contact, date of birth, kit size) with the organizer for this event."
- EN, `purchaser_authorised`: "I confirm I have each listed person's permission to register them and to share their details with FitFlex and the organizer. They will be invited to claim their place."
- EN, `organisation`: "We confirm our organisation has each listed person's permission to register them for this event and to share their details with FitFlex and the organizer."
- SW drafts: "Nakubali masharti ya tukio na sera ya marejesho, na FitFlex kushiriki taarifa zangu za usajili (jina, mawasiliano, tarehe ya kuzaliwa, saizi ya vifaa vya mbio) na mwandaaji wa tukio hili." / "Nathibitisha nina ruhusa ya kila mtu aliyeorodheshwa kumsajili na kushiriki taarifa zake na FitFlex na mwandaaji. Wataalikwa kuchukua tiketi yao." / "Tunathibitisha shirika letu lina ruhusa ya kila mtu aliyeorodheshwa kumsajili kwenye tukio hili na kushiriki taarifa zake na FitFlex na mwandaaji."

### 3.12 State machines used in S3 (subset of `events-lifecycle.mjs`)
- Order: `awaiting_payment` → `cancelled` (purchaser / corporate / admin cancel, `closeReason` = store reason) · → `expired` (job, `closeReason: expired`). `draft` is never persisted in S3 (drafts live on the device). `confirmed` and the refund states are S4.
- Registration: `reserved` → `cancelled` (with the order, or alone §3.8). `confirmed` is S4. `participantUserId` set by claim does not change status.
- Team: `active` only; `disbanded` not reachable in S3.
Transitions are refused with the store's 409 `invalid_transition { kind, from, to, allowed }`.

### 3.13 Organizer and admin reads (first version; export S5)
- `GET /organizer/events/:id/registrations?status&categoryId&q&cursor&limit` (roles owner, admin, ops, timing) → `{ items: [{ id, participant: { name }, categoryName, ticketTypeName, status, orderReference, teamName, kitSize, createdAt, claimed: bool }], nextCursor, total }`.
  Field policy before payment vs after (PRD §10 privacy, follow-ups S5 "field minimisation by scope"): `reserved` rows → `name` masked with `maskName` ("A*** M*****"), no `kitSize`; `confirmed`/`cancelled` (after confirm) rows → full name, `kitSize`. **Never** phone, email, DOB, gender, emergency contact in the list (S5 decides contact fields per role for the detail view and export). `q` searches the full name of confirmed rows only; `status` filter values `reserved | confirmed | cancelled`. Default sort: created desc.
- `GET /organizer/events/:id/registrations/summary` → `{ byStatus: { reserved, confirmed, cancelled }, byCategory: [{ categoryId, name, capacity, sold, held }] }`.
- `GET /organizer/events/:id/orders?status&cursor` (roles owner, admin, finance) → `{ items: [{ id, reference, status, purchaser: { type: 'member'|'organization', label } , placesCount, totalTzs, feesTzs, currency, createdAt, holdExpiresAt, closedAt, closeReason }], nextCursor }`. `label` = `maskName(displayName)` for members, the organisation's name for corporate. Money shown is the order total; the organizer's payout view is S4/settlement.
- `GET /admin/events/:id/orders[/:orderId]`, `GET /admin/events/:id/registrations` (scope `events`): same shapes with **full** names and the purchaser's display name; order detail includes lines and registrations (no emergency contact — admins do not need it; it stays reachable only via the support process, S7). All three organizer/admin list routes refuse events outside the caller's organizer with 404 `event_not_found` (scenario 19).

### 3.14 Outbox and notifications
- **Outbox:** S1 writes `registration.created` only on commit and `registration.cancelled` on release. **S3 adds no `registration.reserved` outbox event** (carried in follow-ups S5; an organizer integration sees paid places only, which matches REG-012). A single-place cancel (§3.8) writes `registration.cancelled` exactly like a whole release.
- **Notifications (in-app inbox + push through `notify`, bilingual via `localeOf`):**
  1. Purchaser, on order creation: type `event_order_created`. EN "Registration received · payment pending" / "Your {n} place(s) for {event} are held until {time}. Payment instructions follow in the next app update." SW "Usajili umepokelewa · malipo yanasubiriwa" / "Tiketi zako {n} za {event} zimeshikiliwa hadi {time}. Maelekezo ya malipo yatafuata kwenye toleo lijalo la app." Data `{ orderId }` → deep link `/member/events/orders/{id}`. (S4 replaces the second sentence with the instructions.)
  2. Purchaser, on expiry (hook in `expireHolds`, after each release): type `event_order_expired`. EN "Your places were released" / "The 30-minute hold for {event} ended before payment. You can register again if places remain." SW "Tiketi zako zimeachiliwa" / "Muda wa dakika 30 wa kushikilia tiketi za {event} umeisha kabla ya malipo. Unaweza kujisajili tena kama bado kuna tiketi."
  3. Matched member, on order creation and on claim-eligible confirmation (S4): type `event_claim_available`, only when `claimable` finds a **verified** match at creation time. EN "Is this you? A place for {event}" / "{purchaserMasked} registered someone with your number for {event}. Claim it if it's you." SW "Ni wewe? Tiketi ya {event}" / "{purchaserMasked} amesajili mtu mwenye namba yako kwa {event}. Chukua tiketi kama ni wewe." Data `{ registrationId }` → `/member/events/claim/{id}`. Sent once per registration.
  4. Purchaser, on claim: type `event_place_claimed`. EN "{firstName} claimed their place" / SW "{firstName} amechukua tiketi yake".
  5. Corporate coordinator: 1 and 2 as in-app notices to `createdByUserId` (portal inbox pattern as other B2B notices; **confirm** the portal has an inbox for org users — otherwise email via the existing B2B email path).
- **SMS / email claim invitations to people without an account are built (templates below) but sent only on payment confirmation (S4).** Reason: before payment the place is a 30-minute hold; paid SMS (Beem) to a stranger for a place that may expire is waste and noise. Template EN "{purchaser} registered you for {event} ({category}). Claim your place in the FitFlex app: {link}" (≤ 160 chars with the short host), SW "{purchaser} amekusajili kwa {event} ({category}). Chukua tiketi yako kwenye app ya FitFlex: {link}". Q1 asks the owner to confirm.

### 3.15 What S4 changes (so builders leave the seams)
`next.payment` becomes `manual` (D1) with the `instructions` block shaped like `/payments/options.manual` plus `amountTzs` and `reference`; new `POST /me/event-orders/:id/payment-attempts` and `GET /me/event-orders/:id/payment-status`; admin confirmation → `commitOrder` → registrations `confirmed`, claim SMS/email sent, `registration.created` outbox; late confirmation after expiry → `rehold` (follow-ups S4); cancel after payment → refund records; organizer roster shows full names for confirmed rows (already specified above). The app's awaiting-payment screen only swaps its placeholder for `ManualPaymentSteps` (§5.7).

### 3.16 Backend spec expectations (`specs/events-s3-*.specs.mjs`, CI DB only; PRD §13 scenarios 1–5)
1. **Individual (scenario 1, S3 part):** quote → order with `Idempotency-Key` → `awaiting_payment`, one `reserved` registration with `participantUserId = purchaser`, `held` +1, one `hold` movement; replay with the same key and body returns the same order (`replayed: true`); same key + different body → 409 `idempotency_key_reused`; `expectedTotalTzs` mismatch → 409 `price_changed` and no rows written.
2. **Register another person + claim (scenario 2):** order with one `purchaser_authorised` row → `participantUserId` null, `claimTokenHash` set; `GET /event-claims/preview/:token` returns masked fields only; claim by a user whose **verified** phone matches → 200 and `claimedAt` set; a user with the same phone only on `User.phone` (unverified) → 403 `claim_not_verified`; a second claim by another verified-match account → 409 `already_claimed`; name-only match never appears in `claimable`; purchaser claiming their own-contact row → 409 `claim_own_contact`.
3. **Group with purchaser (scenario 3):** 1 self + 2 others across two ticket types → 3 registrations, 2 lines, 2 hold movements; `multiple_self_participants` refused; `participant_invalid` lists every bad row (not just the first); `releaseRegistration` on one of two same-line places reduces the line and totals and writes one `registration.cancelled` outbox row; on the last place of a line with another line present → 409 `remove_whole_line`; whole-order cancel releases everything and stores `cancelReason`.
4. **Corporate rows with errors (scenario 4):** `roster/validate` with CSV (header aliases, DD/MM/YYYY dates, "10K" category) reports per-row problems, `listed_twice`, `already_registered`, `capacityShort`, and a quote for the ok rows only; placing with any bad row → 422 and nothing written; a clean roster of 50 rows passes with `bulk` even though `maxPerOrder` is 10; idempotency is scoped `(organizationId, key)`; a user without the organisation membership → 403/404 before any scope check.
5. **Two buyers, last ticket (scenario 5):** two concurrent orders for the last place: exactly one 201, the other 409 `capacity_unavailable`, `sold + held ≤ capacity` holds; a third order after the first expires (`expireHolds`) succeeds; expiry writes `closeReason: expired` and triggers notification 2 once.
6. **Rules:** age computed on the event start day in the event timezone (boundary: birthday on event day is eligible); `participantFields` policy `off` drops the field with a warning; duplicate detection by normalised phone/email across orders in the same category; organizer roster masks `reserved` names and never returns contact fields; organizer of another event → 404; options probe exposes `registration`, `payment: 'none'`, `teams`, `corporate` only with the flag; every S3 route is 404 `feature_disabled` with the flag off.

### 3.17 Error codes surfaced to users (added to S2 §14.6)
`idempotency_key_required`, `idempotency_key_reused`, `participant_invalid`, `terms_not_accepted`, `consent_version_stale`, `too_many_participants`, `price_changed`, `capacity_unavailable`, `quantity_out_of_range`, `event_not_open`, `registration_closed`, `sale_not_open`, `sale_closed`, `ticket_type_inactive`, `category_inactive`, `order_not_found`, `registration_not_found`, `invalid_reason`, `remove_whole_line`, `team_not_found`, `team_full`, `team_disbanded`, `team_name_taken`, `claim_token_invalid`, `claim_token_expired`, `claim_not_verified`, `already_claimed`, `claim_own_contact`, `registration_closed_state`, `organization_not_active`, `organization_not_allowed`, `too_many_rows`, `rate_limited`. Mobile: `error.reason.*` entries (§5.12); portal: `EVENTS_ERRORS` in `src/lib/events.ts` (§6.6).

---

## 4. Navigation map (mobile)

| Route (`AppRoutes`) | Page | Entry points | Back |
|---|---|---|---|
| `/member/events/:eventId` (S2) | detail; CTA now enabled (§5.1) | list, Home card, share link, notifications | as S2 |
| `/member/events/:eventId/register` | `MemberEventRegisterPage` (4 steps in one page) | detail CTA; a ticket row tap on the detail (preselects that ticket type) | step > 1 → previous step (`PopScope` intercepts system back); step 1 → detail. Leaving with entered data → draft kept (§5.5), snack "Draft saved" |
| `/member/events/orders` | `MemberEventOrdersPage` (Registrations / Orders) | Activity › Events header chip "My registrations" (shown when the member has ≥ 1 registration or order, from a cheap `GET /me/event-registrations?limit=1`), Profile › "Event registrations" row (always when flag on), notifications | pop to where it came from; cold start → Activity |
| `/member/events/orders/:orderId` | `MemberEventOrderPage` (awaiting payment / cancelled / expired) | after placing an order (`pushReplacement`), orders list, notification 1/2 | orders list (cold: Activity) |
| `/member/events/registrations/:registrationId` | `MemberEventRegistrationPage` | registrations list, order page rows, notification 4 | list |
| `/member/events/claim/:registrationId` | `EventClaimPage` (in-app match) | notification 3, "Is this you?" card on the registrations list | registrations list |
| `/event-claim` (+ `/event-claim/#<token>`, legacy `/event-claim/<token>`) | `EventClaimPage` (link mode) | SMS/email link (S4 sends), App Link | after claim → registration page; dismiss → Activity |
| `/member/events/teams/:teamId` | `EventTeamPage` | registration page "Team" row, order page | back |

All inside the Member `ShellRoute` (bottom nav stays) except `/event-claim`, which sits beside `/friend-invite` (pre-sign-in capable: keeps the token, then redirects to sign-in and back, exactly as `pending_friend_invite.dart`). Flag off (`eventsDiscoveryEnabled` false **or** options `registration: false`): every S3 route redirects to `/member/activity` with `FFSnack.info(events.register.unavailable)`; `/event-claim` keeps the token anyway (24 h) so a link opened before the flag flips still works.

---

## 5. Mobile (member)

### 5.1 Detail CTA (S2 §11.6, now live)
With options `registration: true`, the `open` / `closing_soon` rows get `onPressed` → `/member/events/:eventId/register` and the analytics event `registration_started { eventId, source: 'cta' }`. Ticket rows inside "Categories & prices" become tappable (`InkWell`, min 48 dp, semantics "Early bird, TSh 20,000, open, button") and open the same page with that ticket type preselected at its `minPerOrder` (`source: 'ticket_row'`). Sold-out and closed rows stay non-tappable. A signed-out visitor (web deep link) tapping Register is sent to sign-in and returned to the register route (existing `redirect` pattern).

### 5.2 Register page frame
`Scaffold` with `FFPageHeader(title: event title, subtitle: "Step {n} of 4 · {step name}")` and a 4 dp `LinearProgressIndicator` (value n/4, `semanticsLabel: "Step {n} of 4"`), body per step, sticky bottom bar (64 dp, as the detail CTA bar) with "Back" ghost (hidden on step 1) and the primary action. Phone: single column, 16 dp gutters. Flutter web ≥ 840 px: content column max 640 px centred; the bottom bar spans the column. Web focus: on each step change focus moves to the step heading (`FocusNode` + `Semantics(header: true)`), announced "Step 2 of 4, Who is registering, heading".
Steps: **1 Tickets → 2 Who → 3 Participants → 4 Review**.

### 5.3 Step 1 — Tickets (`TicketPicker`)
- One `FFCard` per active category (name, distance pill, start time, `minAge` line "Age {n}+" / "Umri {n}+" when set, `remaining ≤ 10` → Fuel text "{n} left" / "zimebaki {n}"). Inside, one row per ticket type on sale: name, price ("TSh 20,000" / "Free" → "Bure"), sale-window line, `FFQuantityStepper` (0…`maxPerOrder`, step from 0 jumps to `minPerOrder`; decrement below `minPerOrder` goes to 0). Rows with `availability ≠ open|closing_soon` show the S2 pill and a disabled stepper.
- Footer line (live region): "{total} participant(s) · TSh {sum}" / "Washiriki {total} · TSh {sum}" (client-side sum of unit prices, labelled "estimate" until the quote; the final figure comes from the server on step 4).
- Primary "Continue" / "Endelea" disabled until total ≥ 1; `maxParticipantsPerOrder` reached → stepper plus disabled + hint "Up to {max} people per order. For more, use a corporate order." / "Hadi watu {max} kwa agizo moja. Kwa zaidi, tumia agizo la shirika."
- States: loading (detail already loaded; this step is instant); event became `sold_out`/`closed` after opening (quote later refuses) handled on step 4.

### 5.4 Step 2 — Who (`RegistrationModeTiles`, `FFChoiceTile` group, radio semantics)
Options depend on the total `N` from step 1:
| Tile | Shown when | Effect |
|---|---|---|
| **Myself** / Mimi mwenyewe — "Prefilled from your profile" | N = 1 | participant 1 = self |
| **Myself and others** / Mimi na wengine — "You take one place; add the rest" | N ≥ 2 | participant 1 = self, 2…N others |
| **Other people** / Watu wengine — "You're paying, not running" | always | all `purchaser_authorised` |
| **Team** / Timu — "Create a team or join one with a code" | options `teams` | reveals a sub-card: `FFSegmented` Create / Join; Create → team name field + type (`club` "Club", `community` "Community / friends"); Join → code field (`AB12-CD34` mask, uppercase, 44 dp "Check" button → `lookup` → shows "{name} · {memberCount}/{maxMembers} members"). Team is **in addition to** one of the first three choices (a second group below: "Who is running?" with Myself / Myself and others / Other people). |
| **Corporate** / Shirika — info card, not selectable: "Registering staff for a company or organisation? Use the FitFlex portal (org or HR login) to upload a list and pay as the organisation." / "Unasajili wafanyakazi wa kampuni au shirika? Tumia tovuti ya FitFlex (kuingia kwa shirika au HR) kupakia orodha na kulipa kama shirika." with a "Copy portal link" ghost button (`common.copied`). | options `corporate` | — |
Default selection: Myself (N = 1) or Myself and others (N ≥ 2). Primary "Continue".

### 5.5 Step 3 — Participants (`ParticipantForm` × N)
- A vertical list of expandable `FFCard`s, "Participant 1 of 3 · 10K · Early bird" (header is a 48 dp button with `Semantics(expanded:)`). The first incomplete card is open; completing it opens the next; completed cards collapse to a summary line "Asha Mollel · +255 7•• ••• 678 · ✓". A card with problems shows a Fuel error count in its header ("2 to fix" / "2 za kurekebisha").
- Fields rendered from `quote.fields` (fetched on entering step 3 with a provisional quote call; until it answers the form uses the detail's `minAge` to show DOB and shows a skeleton for the others — the quote is cheap and usually back within a second): First name, Last name (`FFTextField`, `textCapitalization: words`, maxLength 80), Phone (`keyboardType: phone`, prefix picker not needed: `normalizePhone` accepts local `07…` and `+255`), Email, Date of birth (`FFTextField` read-only + `showDateOfBirthPicker`, typed entry allowed as in Edit profile; helper "Needed to check the age rule for {category}" / "Inahitajika kuthibitisha sharti la umri la {category}"), Gender (`FFDropdownField` with `onboarding.gender_*` keys + "Prefer not to say" / "Sipendi kusema"), Emergency contact (name + phone, section note "Only shared with the organizer for safety; never shown in lists" / "Hushirikiwa na mwandaaji kwa usalama tu; haionyeshwi kwenye orodha"), Kit size (`FFDropdownField` XS…3XL, label "T-shirt / kit size" / "Saizi ya fulana / vifaa vya mbio"). Required fields carry " *" and `Semantics(label: "… required")`.
- **Self card:** prefilled from `MemberData` (`displayName` split, verified phone/email from the profile; DOB/gender from `GET /me/personal-details` when `PARTNER_DOB_REQUIRED` answers, else from the member profile's `dateOfBirth` if present). Name editable; phone and email **read-only** with a lock icon and hint "From your verified profile" / "Kutoka kwenye wasifu wako uliothibitishwa" (changing them means it is not "self" — `self_contact_mismatch`). If the profile has no verified phone or email, the card shows an `FFAlert` warning "Add a verified phone number to register yourself" / "Ongeza namba ya simu iliyothibitishwa ili ujisajili" with a link to Edit profile, and the step cannot continue.
- **Others:** blank; a "Copy my emergency contact" ghost link when the self card has one. Consent checkbox **per card** (`purchaser_authorised` text from `consentText`, 44 dp row, required).
- Validation runs locally on blur (format, required, DOB sanity via `dateOfBirthProblemKey`, age vs `minAge` using the event start date, duplicate phone/email within the form → `listed_twice`), and from the server on step 4 (`participants[].problems` → card headers + inline messages via `events.validation.*`).
- **Draft (local only):** every change debounced 500 ms → `SharedPreferences` key `events.registrationDraft.<eventId>` as JSON `{ savedAt, step, lines, mode, team, participants }` (emergency contact included; the device is the member's). Expires after 7 days; cleared on order creation, on "Discard" and on 410-type refusals (event closed). Re-entering the flow with a draft → `FFDialog` "Continue where you left off?" / "Uendelee pale ulipoishia?" with "Continue" / "Start over". Nothing is sent to the server before step 4. (Draft contents are not shown in any list and never synced.)
- Primary "Review order" / "Kagua agizo" enabled when every card passes local validation.

### 5.6 Step 4 — Review (`QuoteSummary`)
- On entry: `POST /me/event-orders/quote` (loading: skeleton of 4 lines + disabled button; error → `FFErrorState` inline with Retry; `participant_invalid`/problems → banner "Some details need fixing" / "Baadhi ya taarifa zinahitaji kurekebishwa" with "Go back" that opens the first problem card; `capacity_unavailable`/`sold_out` availability → banner "Only {n} left for {ticket}" with "Change tickets" → step 1).
- Layout: **Tickets** table (name × qty, line total), discount line when > 0, fee line labelled with `feeLabel` (e.g. "Service fee" / "Ada ya huduma") when > 0, **Total** bold tabular (`formatCurrency`); **Participants** compact rows (name, category, "You" badge or "Will be invited to claim" / "Ataalikwa kuchukua tiketi"); **Team** row when set; **Refund policy** summary (preset line + expandable text, same component as the detail); **Terms** expandable; one checkbox "I accept the event terms and refund policy" (required) and, for others/team/organisation, the consent line from `consentText` is shown under the participants (already ticked per card; shown read-only here); hold notice `FFAlert.info` "Your places are held for {holdTtlMinutes} minutes after you place the order. Payment instructions arrive in the next app update; you won't be charged now." / "Tiketi zako zitashikiliwa kwa dakika {holdTtlMinutes} baada ya kuweka agizo. Maelekezo ya malipo yatakuja kwenye toleo lijalo la app; hutatozwa sasa." (S4 swaps the second sentence for "You then have {n} minutes to pay").
- Primary **"Place order · TSh 75,000"** / "Weka agizo · TSh 75,000" (free order: "Register · Free" / "Jisajili · Bure"). On tap: `CheckoutAttempt.forPurchase(current, signature)` where `signature` = canonical JSON of the full request body (`eventId`, `lines`, every participant field including emergency contact, `team`, `consentTextVersion`), i.e. exactly what the server fingerprints, so any edit yields a new key; `POST /me/event-orders` with `Idempotency-Key: attempt.key` and `expectedTotalTzs`. Button shows `FFSpinner` and is disabled while in flight; a second tap is ignored. Analytics `checkout_quote_created` on the quote, `order_created { orderId, placesCount, totalTzs }` on 201.
- Outcomes: 201/200 → clear draft, `pushReplacement` to `/member/events/orders/:id`; `price_changed` → re-quote, banner "Prices were updated. Please review the new total." / "Bei zimebadilishwa. Tafadhali kagua jumla mpya."; `capacity_unavailable` → banner + "Change tickets"; `participant_invalid` → as above; `consent_version_stale` → silent re-quote then retry once; `idempotency_key_reused` → the signature changed under the same key (should not happen; new attempt and retry once); `orderOutcomeUnknown` (5xx/timeout) → `FFDialog` "We couldn't confirm your order was placed. Check My registrations before trying again." / "Hatukuweza kuthibitisha kama agizo limewekwa. Angalia Usajili wangu kabla ya kujaribu tena." with "Open My registrations" and "Try again" (same key).

### 5.7 Order page — awaiting payment (`MemberEventOrderPage`)
Header: event title, `FFBadge` status (table §5.10), reference "EV-3F9A2B7C1D" with a copy `IconButton` (tooltip `common.copy`; snack `common.copied`).
Body by `order.status`:
- **awaiting_payment:** `FFCard` "Held until 14:32 EAT" + `FFCountdownText` "27 min left" / "zimebaka dakika 27" (Fuel text under 5 min; at 0 → re-fetch; if the server says `expired` → expired view). Then **"Payment instructions"** `FFCard` with an `FFAlert.info`: title "Coming in the next app update" / "Inakuja kwenye toleo lijalo la app", body "This release lets you reserve places. Paying for them arrives in the next update; you won't be charged now and nothing is confirmed until you pay." / "Toleo hili linakuwezesha kuhifadhi tiketi. Kulipa kutakuja kwenye toleo lijalo; hutatozwa sasa na hakuna kinachothibitishwa hadi ulipe." — this is the S4 slot: when `next.payment == 'manual'` the builder renders `ManualPaymentSteps` here instead; when `'provider'`, the provider button. Then the itemised quote (as step 4), **Participants** list (rows tappable → registration page; per row: name, category, status pill, "You" / "Awaiting claim" / "Claimed" chips; purchaser-only "Remove" overflow action → §5.9), **Team** row, **Refund policy** summary, and a ghost-danger "Cancel order" / "Ghairi agizo" (→ `FFDialog` with reason radio: "Changed my mind" / "Nimebadili nia", "Wrong details" / "Taarifa si sahihi", "Registered twice" / "Nimesajili mara mbili", "Other" / "Nyingine"; confirm "Cancel order"; on 200 → cancelled view + snack "Order cancelled. Places released." / "Agizo limeghairiwa. Tiketi zimeachiliwa.").
- **expired:** `FFAlert.warning` "The hold ended before payment. Places were released." / "Muda wa kushikilia umeisha kabla ya malipo. Tiketi zimeachiliwa." + primary "Register again" / "Jisajili tena" (→ register page, draft from this order's participants prefilled, **not** including the hold) when the event is still open, else disabled with the S2 availability label.
- **cancelled:** `FFAlert` neutral "You cancelled this order on {date}." / "Uliighairi agizo hili tarehe {date}." (admin cancel: "This order was cancelled by FitFlex." / "Agizo hili limeghairiwa na FitFlex.") + "Register again" as above.
- **confirmed / refund states:** S4 (render the status pill and the same lists; no actions).
Polling: while `awaiting_payment` and the page is visible, refresh every 60 s and on resume (so an admin/job change shows without a restart); a 404 after creation → "isn't available" state.
Semantics: countdown is a polite live region updated per minute; the status pill text is read with the title ("Order EV-…, Awaiting payment, heading").

### 5.8 My registrations and orders (`MemberEventOrdersPage`)
`FFSegmented` **Registrations** / Usajili · **Orders** / Maagizo (default Registrations). Both lists: `RefreshIndicator`, `FFSkeletonList(3)`, infinite scroll with `nextCursor`, `FFErrorState` with retry, offline → last cached page + `FFAlert`.
- **Registrations:** top section "Is this you?" when `claimable` returns items: one `FFCard` per item: "{purchaserMasked} registered **A*** M.** for {event} · {category}" + matched contact line "Matches your number ending 678" / "Inalingana na namba yako inayoishia 678" + buttons "That's me" / "Ni mimi" (→ `/member/events/claim/:id`) and "Not me" / "Si mimi" (local dismiss, remembered on device). Then registration cards: event title + date, category pill, participant line ("You" `FFBadge` brand / "Registered by you" / "Registered by {purchaserMasked}"), status pill (§5.10), order ref muted, team name when any. Empty: `FFEmptyState` icon `confirmation_number`, "No registrations yet" / "Bado hakuna usajili", body "Events you register for appear here." / "Matukio unayojisajili yataonekana hapa.", action "Browse events" / "Angalia matukio".
- **Orders:** card: reference, event, "{n} places" / "tiketi {n}", total, status pill, countdown when awaiting. Empty: "No orders yet" / "Bado hakuna maagizo".
Cards are single buttons with composed semantics ("Dar Half Marathon, 10K, Asha Mollel, Awaiting payment, button").

### 5.9 Registration page (`MemberEventRegistrationPage`) and cancel one place
Sections: status banner (reserved: `FFAlert.info` "Awaiting payment · held until {time}" with link "Open order EV-…"; cancelled; expired; confirmed is S4), **Ticket** card placeholder: "Your entry QR appears here once payment is confirmed" / "QR ya kuingia itaonekana hapa baada ya malipo kuthibitishwa" (muted, with a dashed 120 dp box, `ExcludeSemantics` on the box, text read), **Participant** (name, phone, email, DOB as a date, gender, kit size, emergency contact — all unmasked for both the purchaser, who typed them, and the claimed participant, whose own details they are), **Event** (title, date, category, start time → tap opens detail), **Team** row → team page, **Order** row → order page, **Consent** line "Registered by {purchaserName or You} on {date} · {consentBasis label}". Actions (purchaser, reserved): "Remove this person from the order" / "Mwondoe mtu huyu kwenye agizo" (ghost danger → dialog with reason → `POST /me/event-registrations/:id/cancel`; `remove_whole_line` → dialog "This is the last {ticket} place in the order. Cancel the whole order and register again." / "Hii ndiyo tiketi ya mwisho ya {ticket} kwenye agizo. Ghairi agizo lote na ujisajili tena." with "Open order"). Claimed participants (not purchaser) see "Ask {purchaserFirstName} to change or cancel this registration" / "Muombe {purchaserFirstName} abadilishe au aghairi usajili huu".

### 5.10 Status vocabulary (mobile + portal; text-first, tone from `FFBadge`)
| Registration status (+ order state) | Tone | EN | SW |
|---|---|---|---|
| `reserved` + order `awaiting_payment` | warning | Awaiting payment | Inasubiri malipo |
| `reserved` + order `expired` (job lag) / `cancelled` | gray | Expired / Cancelled | Muda umeisha / Imeghairiwa |
| `cancelled` | gray | Cancelled | Imeghairiwa |
| `confirmed` (S4) | success | Confirmed | Imethibitishwa |
| claim chips | brand / default | You · Claimed · Awaiting claim | Wewe · Imechukuliwa · Inasubiri kuchukuliwa |
| Order `awaiting_payment` | warning | Awaiting payment | Linasubiri malipo |
| Order `expired` | gray | Expired | Muda umeisha |
| Order `cancelled` | gray | Cancelled | Limeghairiwa |
| Order `confirmed` (S4) | success | Paid | Limelipwa |
(Order = "agizo", li- class; registration = "usajili", u- class → "umeghairiwa" would be grammatical, but the table uses the status noun as a label, so the i- forms above are used consistently for registration pills. Native review to settle.)

### 5.11 Claim page (`EventClaimPage`)
Two modes, one page:
- **Link mode** (`/event-claim`): token kept by `KeptLinkToken(tokenKey: 'eventClaim.token', savedAtKey: 'eventClaim.savedAt')` from `/event-claim/#<tok>` (and legacy path form), router redirect exactly as friend invites (`pending_friend_invite.dart`): signed out → sign-in/registration → back here. On open: `GET /event-claims/preview/:token` → card "**{purchaserMasked}** registered **A*** M.** for **{event}** ({category}, {date})" + "To claim it, the number/email ending {masked} must be verified on your account." / "Ili kuichukua, namba/barua pepe inayoishia {masked} lazima iwe imethibitishwa kwenye akaunti yako." Primary "Yes, this is me — claim my place" / "Ndiyo, ni mimi — chukua tiketi yangu" → **`POST /me/event-registrations/claim { token }`** (the preview returns no id, so this alias resolves the registration from the token hash; the `:id` form of §3.7 is for in-app matches). Secondary "Not me" (clears the token, → Activity).
- **In-app mode** (`/member/events/claim/:registrationId`): same card from `claimable` data; claim without token.
- Outcomes: 200 → snack "Place claimed" / "Tiketi imechukuliwa", `pushReplacement` registration page, analytics `registration_claimed`. `claim_not_verified` → `FFAlert.warning` "Verify {masked} to claim" + button "Verify now" → the existing contact verification flow (Edit profile → change/verify phone) when `verifiable`, else text "Email verification isn't available in the app yet; ask {purchaserFirst} to use your phone number instead." / "Uthibitisho wa barua pepe bado haupatikani kwenye app; muombe {purchaserFirst} atumie namba yako ya simu badala yake." `already_claimed` → "This place was already claimed by another account. Contact support." / "Tiketi hii tayari imechukuliwa na akaunti nyingine. Wasiliana na msaada." `claim_token_expired` → "This link has expired. Ask the person who registered you to send a new one." / "Kiungo hiki kimeisha muda. Muombe aliyekusajili akutumie kipya." `registration_closed_state` → "This registration is no longer active." 404 → "This link isn't valid."

### 5.12 Mobile i18n keys (`lib/shared/i18n.dart`, both maps; parity test picks them up)
Prefix `events.register.*` (flow), `events.order.*`, `events.reg.*` (registration), `events.claim.*`, `events.team.*`, `events.validation.*`, `error.reason.*`. Keys with `{x}` go through the existing placeholder formatting.

| Key | EN | SW (draft) |
|---|---|---|
| `events.register.unavailable` | Registration isn't available yet | Usajili bado haupatikani |
| `events.register.title` | Register | Jisajili |
| `events.register.step` | Step {n} of 4 · {name} | Hatua {n} kati ya 4 · {name} |
| `events.register.step.tickets` | Tickets | Tiketi |
| `events.register.step.who` | Who is registering | Nani anajisajili |
| `events.register.step.participants` | Participants | Washiriki |
| `events.register.step.review` | Review | Kagua |
| `events.register.continue` | Continue | Endelea |
| `events.register.back` | Back | Rudi |
| `events.register.review` | Review order | Kagua agizo |
| `events.register.place` | Place order · {amount} | Weka agizo · {amount} |
| `events.register.placeFree` | Register · Free | Jisajili · Bure |
| `events.register.minAge` | Age {n}+ | Umri {n}+ |
| `events.register.left` | {n} left | zimebaki {n} |
| `events.register.estimate` | {n} participant(s) · {amount} (estimate) | Washiriki {n} · {amount} (makadirio) |
| `events.register.maxPerOrder` | Up to {max} people per order. For more, use a corporate order. | Hadi watu {max} kwa agizo moja. Kwa zaidi, tumia agizo la shirika. |
| `events.register.qty` | Quantity for {ticket} | Idadi ya {ticket} |
| `events.register.qty.add` | Add one | Ongeza moja |
| `events.register.qty.remove` | Remove one | Punguza moja |
| `events.register.mode.self` | Myself | Mimi mwenyewe |
| `events.register.mode.self.hint` | Prefilled from your profile | Imejazwa kutoka wasifu wako |
| `events.register.mode.selfOthers` | Myself and others | Mimi na wengine |
| `events.register.mode.selfOthers.hint` | You take one place; add the rest | Wewe unachukua tiketi moja; ongeza wengine |
| `events.register.mode.others` | Other people | Watu wengine |
| `events.register.mode.others.hint` | You're paying, not running | Unalipa, huukimbii |
| `events.register.mode.team` | Team | Timu |
| `events.register.mode.team.hint` | Create a team or join one with a code | Unda timu au jiunge kwa kutumia msimbo |
| `events.register.mode.whoRuns` | Who is running? | Nani anakimbia? |
| `events.register.mode.corporate` | Corporate / organisation | Kampuni / shirika |
| `events.register.mode.corporate.body` | Registering staff for a company or organisation? Use the FitFlex portal (org or HR login) to upload a list and pay as the organisation. | Unasajili wafanyakazi wa kampuni au shirika? Tumia tovuti ya FitFlex (kuingia kwa shirika au HR) kupakia orodha na kulipa kama shirika. |
| `events.register.mode.corporate.copy` | Copy portal link | Nakili kiungo cha tovuti |
| `events.team.create` | Create a team | Unda timu |
| `events.team.join` | Join with a code | Jiunge kwa msimbo |
| `events.team.name` | Team name | Jina la timu |
| `events.team.type` | Team type | Aina ya timu |
| `events.team.type.club` | Club | Klabu |
| `events.team.type.community` | Community / friends | Jumuiya / marafiki |
| `events.team.type.corporate` | Corporate | Shirika |
| `events.team.code` | Team code | Msimbo wa timu |
| `events.team.check` | Check | Angalia |
| `events.team.found` | {name} · {n}/{max} members | {name} · wanachama {n}/{max} |
| `events.team.members` | Members | Wanachama |
| `events.team.captain` | Captain | Kapteni |
| `events.team.shareCode` | Share this code with your team | Shiriki msimbo huu na timu yako |
| `events.team.yourCode` | Your team code | Msimbo wa timu yako |
| `events.participant.title` | Participant {i} of {n} · {category} · {ticket} | Mshiriki {i} kati ya {n} · {category} · {ticket} |
| `events.participant.toFix` | {n} to fix | {n} za kurekebisha |
| `events.participant.firstName` | First name | Jina la kwanza |
| `events.participant.lastName` | Last name | Jina la ukoo |
| `events.participant.phone` | Mobile number | Namba ya simu |
| `events.participant.email` | Email | Barua pepe |
| `events.participant.dob` | Date of birth | Tarehe ya kuzaliwa |
| `events.participant.dob.hint` | Needed to check the age rule for {category} | Inahitajika kuthibitisha sharti la umri la {category} |
| `events.participant.gender` | Gender | Jinsia |
| `events.participant.gender.none` | Prefer not to say | Sipendi kusema |
| `events.participant.emergency` | Emergency contact | Mtu wa kuwasiliana naye dharura |
| `events.participant.emergency.name` | Contact name | Jina la mtu |
| `events.participant.emergency.phone` | Contact number | Namba ya mtu |
| `events.participant.emergency.note` | Only shared with the organizer for safety; never shown in lists | Hushirikiwa na mwandaaji kwa usalama tu; haionyeshwi kwenye orodha |
| `events.participant.emergency.copy` | Use my emergency contact | Tumia mtu wangu wa dharura |
| `events.participant.kitSize` | T-shirt / kit size | Saizi ya fulana / vifaa vya mbio |
| `events.participant.fromProfile` | From your verified profile | Kutoka kwenye wasifu wako uliothibitishwa |
| `events.participant.needVerified` | Add a verified phone number to register yourself | Ongeza namba ya simu iliyothibitishwa ili ujisajili |
| `events.participant.editProfile` | Edit profile | Hariri wasifu |
| `events.participant.consent` | I have this person's permission to register them and share their details with FitFlex and the organizer | Nina ruhusa ya mtu huyu kumsajili na kushiriki taarifa zake na FitFlex na mwandaaji |
| `events.participant.you` | You | Wewe |
| `events.participant.willInvite` | Will be invited to claim | Ataalikwa kuchukua tiketi |
| `events.draft.saved` | Draft saved on this phone | Rasimu imehifadhiwa kwenye simu hii |
| `events.draft.resume.title` | Continue where you left off? | Uendelee pale ulipoishia? |
| `events.draft.resume.body` | You started registering for {event} on {date}. | Ulianza kujisajili kwa {event} tarehe {date}. |
| `events.draft.resume.continue` | Continue | Endelea |
| `events.draft.resume.discard` | Start over | Anza upya |
| `events.review.tickets` | Tickets | Tiketi |
| `events.review.discount` | Discount | Punguzo |
| `events.review.fee` | Service fee | Ada ya huduma |
| `events.review.total` | Total | Jumla |
| `events.review.participants` | Participants | Washiriki |
| `events.review.team` | Team | Timu |
| `events.review.refund` | Refund policy | Sera ya marejesho |
| `events.review.terms` | Event terms | Masharti ya tukio |
| `events.review.accept` | I accept the event terms and refund policy | Nakubali masharti ya tukio na sera ya marejesho |
| `events.review.hold` | Your places are held for {n} minutes after you place the order. Payment instructions arrive in the next app update; you won't be charged now. | Tiketi zako zitashikiliwa kwa dakika {n} baada ya kuweka agizo. Maelekezo ya malipo yatakuja kwenye toleo lijalo la app; hutatozwa sasa. |
| `events.review.fix` | Some details need fixing | Baadhi ya taarifa zinahitaji kurekebishwa |
| `events.review.goBack` | Go back | Rudi nyuma |
| `events.review.priceChanged` | Prices were updated. Please review the new total. | Bei zimebadilishwa. Tafadhali kagua jumla mpya. |
| `events.review.onlyLeft` | Only {n} left for {ticket} | Zimebaki {n} tu za {ticket} |
| `events.review.changeTickets` | Change tickets | Badilisha tiketi |
| `events.review.uncertain.title` | We couldn't confirm your order | Hatukuweza kuthibitisha agizo lako |
| `events.review.uncertain.body` | Check My registrations before trying again, so you don't register twice. | Angalia Usajili wangu kabla ya kujaribu tena, ili usijisajili mara mbili. |
| `events.review.openMine` | Open My registrations | Fungua Usajili wangu |
| `events.review.tryAgain` | Try again | Jaribu tena |
| `events.order.title` | Order {ref} | Agizo {ref} |
| `events.order.heldUntil` | Held until {time} | Zimeshikiliwa hadi {time} |
| `events.order.left` | {n} min left | zimebaki dakika {n} |
| `events.order.leftSeconds` | {n} s left | zimebaki sekunde {n} |
| `events.order.payment.title` | Payment instructions | Maelekezo ya malipo |
| `events.order.payment.soon.title` | Coming in the next app update | Inakuja kwenye toleo lijalo la app |
| `events.order.payment.soon.body` | This release lets you reserve places. Paying for them arrives in the next update; you won't be charged now and nothing is confirmed until you pay. | Toleo hili linakuwezesha kuhifadhi tiketi. Kulipa kutakuja kwenye toleo lijalo; hutatozwa sasa na hakuna kinachothibitishwa hadi ulipe. |
| `events.order.places` | {n} places | tiketi {n} |
| `events.order.cancel` | Cancel order | Ghairi agizo |
| `events.order.cancel.title` | Cancel this order? | Ughairi agizo hili? |
| `events.order.cancel.body` | Your held places go back on sale. | Tiketi zilizoshikiliwa zitarudi sokoni. |
| `events.order.cancel.reason` | Reason | Sababu |
| `events.order.cancel.reason.changed_mind` | Changed my mind | Nimebadili nia |
| `events.order.cancel.reason.wrong_details` | Wrong details | Taarifa si sahihi |
| `events.order.cancel.reason.duplicate` | Registered twice | Nimesajili mara mbili |
| `events.order.cancel.reason.other` | Other | Nyingine |
| `events.order.cancelled.snack` | Order cancelled. Places released. | Agizo limeghairiwa. Tiketi zimeachiliwa. |
| `events.order.expired.body` | The hold ended before payment. Places were released. | Muda wa kushikilia umeisha kabla ya malipo. Tiketi zimeachiliwa. |
| `events.order.cancelled.body` | You cancelled this order on {date}. | Uliighairi agizo hili tarehe {date}. |
| `events.order.cancelledByAdmin` | This order was cancelled by FitFlex. | Agizo hili limeghairiwa na FitFlex. |
| `events.order.again` | Register again | Jisajili tena |
| `events.order.gone.title` | This order isn't available | Agizo hili halipatikani |
| `events.status.awaiting` | Awaiting payment | Inasubiri malipo |
| `events.status.order.awaiting` | Awaiting payment | Linasubiri malipo |
| `events.status.expired` | Expired | Muda umeisha |
| `events.status.cancelled` | Cancelled | Imeghairiwa |
| `events.status.order.cancelled` | Cancelled | Limeghairiwa |
| `events.status.confirmed` | Confirmed | Imethibitishwa |
| `events.status.order.paid` | Paid | Limelipwa |
| `events.claim.chip.claimed` | Claimed | Imechukuliwa |
| `events.claim.chip.pending` | Awaiting claim | Inasubiri kuchukuliwa |
| `events.mine.title` | My registrations | Usajili wangu |
| `events.mine.registrations` | Registrations | Usajili |
| `events.mine.orders` | Orders | Maagizo |
| `events.mine.empty.title` | No registrations yet | Bado hakuna usajili |
| `events.mine.empty.body` | Events you register for appear here. | Matukio unayojisajili yataonekana hapa. |
| `events.mine.empty.action` | Browse events | Angalia matukio |
| `events.mine.orders.empty` | No orders yet | Bado hakuna maagizo |
| `events.mine.byYou` | Registered by you | Umesajiliwa na wewe |
| `events.mine.by` | Registered by {name} | Umesajiliwa na {name} |
| `events.claim.isThisYou` | Is this you? | Ni wewe? |
| `events.claim.card` | {purchaser} registered {name} for {event} · {category} | {purchaser} amemsajili {name} kwa {event} · {category} |
| `events.claim.matches` | Matches your {type} ending {masked} | Inalingana na {type} yako inayoishia {masked} |
| `events.claim.type.phone` | number | namba |
| `events.claim.type.email` | email | barua pepe |
| `events.claim.yes` | That's me | Ni mimi |
| `events.claim.no` | Not me | Si mimi |
| `events.claim.title` | Claim your place | Chukua tiketi yako |
| `events.claim.needVerified` | To claim it, the {type} ending {masked} must be verified on your account. | Ili kuichukua, {type} inayoishia {masked} lazima iwe imethibitishwa kwenye akaunti yako. |
| `events.claim.confirm` | Yes, this is me — claim my place | Ndiyo, ni mimi — chukua tiketi yangu |
| `events.claim.done` | Place claimed | Tiketi imechukuliwa |
| `events.claim.verifyNow` | Verify now | Thibitisha sasa |
| `events.claim.emailNotYet` | Email verification isn't available in the app yet; ask {name} to use your phone number instead. | Uthibitisho wa barua pepe bado haupatikani kwenye app; muombe {name} atumie namba yako ya simu badala yake. |
| `events.reg.title` | Registration | Usajili |
| `events.reg.ticketSoon` | Your entry QR appears here once payment is confirmed | QR ya kuingia itaonekana hapa baada ya malipo kuthibitishwa |
| `events.reg.awaiting` | Awaiting payment · held until {time} | Inasubiri malipo · imeshikiliwa hadi {time} |
| `events.reg.openOrder` | Open order {ref} | Fungua agizo {ref} |
| `events.reg.participant` | Participant | Mshiriki |
| `events.reg.event` | Event | Tukio |
| `events.reg.order` | Order | Agizo |
| `events.reg.consent` | Registered by {name} on {date} | Umesajiliwa na {name} tarehe {date} |
| `events.reg.consent.self` | Registered by you on {date} | Umejisajili tarehe {date} |
| `events.reg.remove` | Remove this person from the order | Mwondoe mtu huyu kwenye agizo |
| `events.reg.remove.title` | Remove {name}? | Umwondoe {name}? |
| `events.reg.remove.body` | Their place goes back on sale and the order total is reduced. | Tiketi yake itarudi sokoni na jumla ya agizo itapungua. |
| `events.reg.remove.lastLine` | This is the last {ticket} place in the order. Cancel the whole order and register again. | Hii ndiyo tiketi ya mwisho ya {ticket} kwenye agizo. Ghairi agizo lote na ujisajili tena. |
| `events.reg.askPurchaser` | Ask {name} to change or cancel this registration | Muombe {name} abadilishe au aghairi usajili huu |
| `events.validation.required` | Required | Inahitajika |
| `events.validation.name_invalid` | Letters only, up to 80 characters | Herufi tu, hadi herufi 80 |
| `events.validation.phone_invalid` | That mobile number doesn't look right | Namba hiyo ya simu si sahihi |
| `events.validation.email_invalid` | That email doesn't look right | Barua pepe hiyo si sahihi |
| `events.validation.contact_required` | Add a mobile number or email | Ongeza namba ya simu au barua pepe |
| `events.validation.dob_invalid` | Enter a real date (YYYY-MM-DD) | Weka tarehe halisi (MWAKA-MM-SS) |
| `events.validation.dob_required` | Date of birth is needed for this category | Tarehe ya kuzaliwa inahitajika kwa kundi hili |
| `events.validation.age_not_eligible` | Must be {minAge}+ on event day (will be {age}) | Lazima awe na miaka {minAge}+ siku ya tukio (atakuwa na {age}) |
| `events.validation.duplicate_participant` | Already registered in this category | Tayari amesajiliwa kwenye kundi hili |
| `events.validation.listed_twice` | Listed twice | Ameorodheshwa mara mbili |
| `events.validation.self_contact_mismatch` | Use your own verified contact for yourself | Tumia mawasiliano yako uliyothibitisha kwa ajili yako mwenyewe |
| `events.validation.emergency_contact_invalid` | Add a name and a valid number | Weka jina na namba sahihi |
| `events.validation.kit_size_invalid` | Choose a size | Chagua saizi |
| `error.reason.capacityUnavailable` | Not enough places left for that ticket | Hakuna tiketi za kutosha zilizobaki |
| `error.reason.eventNotOpen` | This event isn't open for registration | Tukio hili halijafunguliwa kwa usajili |
| `error.reason.registrationClosed` | Registration has closed | Usajili umefungwa |
| `error.reason.saleClosed` | That ticket is no longer on sale | Tiketi hiyo haiuzwi tena |
| `error.reason.saleNotOpen` | That ticket isn't on sale yet | Tiketi hiyo bado haijaanza kuuzwa |
| `error.reason.quantityOutOfRange` | Choose between {min} and {max} of that ticket | Chagua kati ya {min} na {max} za tiketi hiyo |
| `error.reason.tooManyParticipants` | Up to {max} people per order | Hadi watu {max} kwa agizo moja |
| `error.reason.termsNotAccepted` | Accept the terms to continue | Kubali masharti ili uendelee |
| `error.reason.orderNotFound` | We couldn't find that order | Hatukupata agizo hilo |
| `error.reason.registrationNotFound` | We couldn't find that registration | Hatukupata usajili huo |
| `error.reason.teamNotFound` | No team with that code for this event | Hakuna timu yenye msimbo huo kwa tukio hili |
| `error.reason.teamFull` | That team is full | Timu hiyo imejaa |
| `error.reason.teamDisbanded` | That team no longer exists | Timu hiyo haipo tena |
| `error.reason.teamNameTaken` | A team with that name already exists for this event | Timu yenye jina hilo tayari ipo kwa tukio hili |
| `error.reason.alreadyClaimed` | This place was already claimed by another account. Contact support. | Tiketi hii tayari imechukuliwa na akaunti nyingine. Wasiliana na msaada. |
| `error.reason.claimTokenInvalid` | This link isn't valid | Kiungo hiki si sahihi |
| `error.reason.claimTokenExpired` | This link has expired. Ask the person who registered you to send a new one. | Kiungo hiki kimeisha muda. Muombe aliyekusajili akutumie kipya. |
| `error.reason.claimOwnContact` | You registered this place for someone else with your own contact | Ulisajili tiketi hii kwa mtu mwingine ukitumia mawasiliano yako |
| `error.reason.registrationClosedState` | This registration is no longer active | Usajili huu haupo tena |
| `error.reason.removeWholeLine` | Cancel the whole order to remove this place | Ghairi agizo lote ili uondoe tiketi hii |
| `error.reason.invalidTransition.events` | This order can't be changed any more | Agizo hili haliwezi kubadilishwa tena |

Notification strings (server-side, §3.14) live in the backend, bilingual via `titleEn/titleSw`.

### 5.13 Accessibility (Flutter web exposes the tree)
- Every control labelled: quantity stepper (`"Quantity for Early bird, 2, button Add one / Remove one"`), choice tiles are radios in a group ("Who is registering, radio group"), participant cards are expandable buttons with `expanded`, copy buttons have tooltips, countdown is a polite live region (minute granularity to avoid chatter), the status pill text is part of the heading.
- Focus order per step: heading → fields top-to-bottom → bottom bar (Back, Primary) last. Inline errors use `FFTextField.errorText` so screen readers read them with the field; the "to fix" banner is `assertive` once per quote.
- Touch targets ≥ 44 dp (steppers 44 × 44, tiles 56, list rows 56, checkbox rows 48).
- Contrast: body ≥ 4.5:1; Fuel text (`{n} left`, countdown under 5 min) uses `fuel` on light / `fuelOnDark` on dark; disabled labels use the S2 §11.6 readable-disabled style.
- Swahili length: the longest button "Weka agizo · TSh 1,250,000" fits 343 dp at 1.3× in one line (verified by golden at 375 px); mode-tile hints wrap to two lines; the "Participant 1 of 3 · 10K · Early bird" header ellipsises the ticket name last.
- Dark theme: status tones from `FFToneTheme`; Volt only on the primary button and selected tiles.

### 5.14 Widget tests (`test/events/*`, `RecordingApi` + `pumpPage`, fixtures in `fixtures.dart`)
- `ticket_picker_test.dart`: min/max jumps, sold-out rows disabled, estimate line, `maxParticipantsPerOrder` hint.
- `registration_mode_test.dart`: options by N; team sub-card create/join; corporate card copies link; `teams:false` hides Team.
- `participant_form_test.dart`: fields rendered from `fields`; self prefilled, read-only contact, missing-verified warning; per-card consent required; DOB picker; local validation incl. `listed_twice` and age vs `minAge` with event date; server problems map to cards.
- `registration_draft_test.dart`: save/restore/expiry/clear; resume dialog; nothing in the draft is sent before the quote.
- `review_step_test.dart`: quote call on entry; totals/fee/discount rows; terms checkbox gating; `Idempotency-Key` sent and **reused** on retry with the same signature, renewed when the signature changes; `expectedTotalTzs` equals the quote; `price_changed`, `capacity_unavailable`, `participant_invalid`, 5xx "uncertain" dialog; success navigates and clears the draft; analytics names recorded.
- `member_event_order_page_test.dart`: awaiting state with countdown ticking (fake clock), placeholder card present and `ManualPaymentSteps` **absent** when `payment:'none'`; cancel dialog → request body `{ reason }` → cancelled view; expired view with "Register again"; polling on resume.
- `member_event_orders_page_test.dart`: both tabs, empty states, claimable cards with "Not me" dismissal persisted, card semantics.
- `member_event_registration_page_test.dart`: sections by relation (purchaser vs claimed), QR placeholder, remove flow incl. `remove_whole_line`.
- `event_claim_page_test.dart`: link mode keeps token from `/event-claim/#tok` and legacy path, signed-out redirect, preview card, claim success, `claim_not_verified` with `verifiable` true/false, expired/invalid.
- `event_team_test.dart`: create, lookup, code formatting, team page members and captain-only code.
- `events_i18n_router_test.dart` (extend): new routes build; flag-off redirects; i18n parity.

### 5.15 Acceptance criteria (M-)
- M-R-1 With options `registration:true` the detail's Register CTA opens the 4-step page; with `false` it stays disabled with the S2 "opens soon" line.
- M-R-2 Step 1 enforces `minPerOrder`/`maxPerOrder`/`maxParticipantsPerOrder`; sold-out rows cannot be selected; the estimate line updates live and is announced.
- M-R-3 Step 2 offers exactly the tiles of §5.4 for the chosen N; Team appears only with `teams:true`; the corporate card is informational.
- M-R-4 Step 3 renders fields from the server's `fields` (a field with policy `off` is not shown); the self card is prefilled with read-only verified contact; others require the consent checkbox; local validation blocks Review until clean.
- M-R-5 Leaving the flow keeps a device-only draft that is offered on return and cleared after a successful order.
- M-R-6 Step 4 shows the server quote itemised (tickets, discount if any, fee if any, total) and the refund policy before the order can be placed; the terms checkbox is required.
- M-R-7 Placing the order sends `Idempotency-Key`; a retry after a timeout reuses the key; changing any detail creates a new key; the "uncertain" dialog appears on 5xx and links to My registrations.
- M-R-8 After 201 the order page shows Awaiting payment, the hold countdown in event time, the reference with copy, and the clearly labelled "coming in the next app update" payment placeholder; no Lipa Namba or provider UI is rendered.
- M-R-9 Cancel order asks for a reason from the closed set and shows the cancelled view; the server response status is reflected without a manual refresh.
- M-R-10 When the hold lapses the page shows Expired with "Register again" (only while the event is open).
- M-R-11 My registrations lists self, purchased and claimed places with the right chips and status pills; Orders lists orders with countdown; both have the specified empty/error/offline states.
- M-R-12 "Is this you?" cards appear only for `claimable` matches; "Not me" hides the card persistently on the device; "That's me" leads to the claim page.
- M-R-13 Claim via link keeps the token out of the URL after the first navigation, survives sign-in, shows masked preview data only, and after success shows the registration as "You".
- M-R-14 `claim_not_verified` offers "Verify now" only when the contact type is verifiable per options; otherwise the explanatory text appears.
- M-R-15 Registration page never shows a QR in S3; the placeholder text is present for reserved rows; emergency contact is visible to the purchaser and the claimed participant only.
- M-R-16 Remove one place works for a multi-place order and reduces the total; the last place of a line triggers the "cancel whole order" dialog.
- M-R-17 Team create returns a code shown once with copy; join by code validates before the order; the team page lists members by first name + initial and shows the code to the captain only.
- M-R-18 Flutter web: first focus on each step's heading; Tab order matches §5.13; every icon button has a tooltip; countdown is a polite live region.
- M-R-19 Light and dark screenshots at 375×812 and 1280×800 (EN and SW, 1.0× and 1.3×) show no overflow and no text under 4.5:1.
- M-R-20 With the flag off every S3 route redirects to Activity with the info snack; `/event-claim` still keeps a token.

---

## 6. Portal

### 6.1 Area, navigation, guards
- **Org / HR:** `orgNav` gains `{ href: '/org/events', labelKey: 'org.nav.events', icon: Flag }` after Programmes for roles in `ORG_PEOPLE` (the roster roles; Q4), and `hrNav` gains `{ href: '/hr/events', labelKey: 'org.nav.events' }`. Both only when `NEXT_PUBLIC_EVENTS_MODULE` is on **and** `GET /events/options` answers `registration:true && corporate:true` (probe cached in the app provider like `options` for the organizer area). Pages: `app/org/events/page.tsx`, `app/hr/events/page.tsx`, both rendering `<CorporateEventOrders orgId=…>` from `src/components/event-corporate-order.tsx` (the HR page passes the company's organisation id the way `/hr/people` does).
- **Organizer:** `/organizer/events?event=<id>&view=registrations` and `&view=orders` are two new tabs in the existing event page header (next to `changes`), visible per role: registrations → owner, admin, ops, timing; orders → owner, admin, finance. Suspended organizers: read-only anyway. Events in `draft`/`submitted` show the tabs with an empty state "Registrations appear once the event is published" / "Usajili utaonekana baada ya tukio kuchapishwa".
- **Admin:** `/admin/events?event=<id>` gains tabs **Orders** and **Registrations** (scope `events`).
- Guard states reuse `organizer/page-states.tsx` (`FeatureOff`, `Forbidden`, `Gate`) and the B2B pages' own `organization_not_active` notice.

### 6.2 Corporate bulk registration (`/org/events`, `/hr/events`)
**List view (default):** `PageHeader` "Event registrations" / "Usajili wa matukio" + primary "Register people" / "Sajili watu". `DataTable` of the organisation's event orders (`GET /b2b/organizations/:id/event-orders`): Reference, Event (title + date in event tz), Places, Total, Status (`Badge` per §5.10 order vocabulary), Held until (countdown text "27 min", refreshed each minute; blank otherwise), Created by, Created. Row click → `?order=<id>`. Empty: `EmptyState` "No event orders yet" / "Bado hakuna maagizo ya matukio", body "Register your staff for a published running event in bulk." / "Sajili wafanyakazi wako kwa wingi kwenye tukio la kukimbia lililochapishwa.", action "Register people". Loading: `SkeletonTable`. Error: `ErrorState` with retry.

**Wizard (`?new=1`, `Stepper` with 4 steps; mobile "n / N · label" line; draft kept in component state only — a reload loses it, stated in a hint on step 2):**
1. **Event** / Tukio — `SearchableSelect` over `GET /events?availability=open&limit=50` (title · date · city), then the chosen event's summary card (date, venue, categories with price range and availability pills, refund-policy preset line, link "View public page" opening the member share URL). Continue requires a selection. Closed/sold-out events are not listed; one that closes mid-flow fails at step 3/4 with the S2 availability message.
2. **People** / Watu — copy of `PeopleImport` entry: a textarea for pasted rows, "Upload CSV" (`.csv`, ≤ 2 MB, ≤ 500 rows), "Download example" (`events-roster-example.csv` with the header `first name,last name,phone,email,category,date of birth,gender,kit size`), and a help block listing the columns and what is required for this event (from `fields`: "Required: first name, last name, mobile number, category, date of birth (10K and 21K have an age rule)"). A small "Add a row" inline form (`Field`s in a row: first, last, phone, email, category `Select`, DOB, gender, kit) appends to the textarea as CSV so one source of truth remains. Primary "Check list" / "Kagua orodha" → `roster/validate` (dry run). Category names in the help block are the event's; the `Select` lists active categories only.
3. **Check** / Hakiki — four `MetricCard`s: "Ready to register" / "Tayari kusajiliwa" (ok rows), "Need fixing" / "Zinahitaji kurekebishwa", "Duplicates" / "Zilizorudiwa", "Places left" (min `remaining` across the requested ticket types; "Not enough places" in danger tone when `capacityShort` is non-empty, with the per-ticket shortfall). Then a `DataTable` (dense, sticky actions) of **every** row: #, Name, Mobile, Email, Category → ticket, DOB, Kit, Status (`Badge` OK / Fix / Duplicate), Problem (joined `events.validation.*` texts, with the field name). Filters: "Show problems only". Fixing happens on step 2 (button "Edit list" returns with the textarea intact); re-check reruns the dry run. Continue is enabled only when `summary.problems === 0 && duplicates.length === 0 && capacityShort.length === 0` (a corporate order is all-or-nothing: the server would refuse it anyway). A row marked `already_registered` shows "Already registered for {category} ({status})" and must be removed from the list.
4. **Confirm** / Thibitisha — quote table (ticket type × quantity, unit, discount line "Approved organisation discount" when > 0, fee, **Total**), `Field`s: Cost centre (optional, ≤ 80), Your reference (optional, ≤ 80; hint "Shows on the order and the invoice later"), Team name (optional; default the organisation's name; creates a `corporate` team), the organisation consent checkbox (`consentText.organisation`), the terms checkbox ("We accept the event terms and refund policy" / "Tunakubali masharti ya tukio na sera ya marejesho"), hold notice (`Alert` info, same wording as mobile §5.6 with "the portal" instead of "the app": "Payment instructions arrive in the next portal release; nothing is charged now."), primary "Place order · TSh 2,500,000". Submit: `Idempotency-Key` created once per wizard run and reused for retries (`crypto.randomUUID()` prefixed `cor_`), `expectedTotalTzs` from the quote. Errors: `participant_invalid` (rows changed server-side, e.g. a duplicate appeared) → back to step 3 with the fresh problems; `capacity_unavailable` → step 3 cards updated + `Alert` danger; `price_changed` → quote refreshed on step 4 with an `Alert`; `idempotency_key_reused` → new key, retry once; network/5xx → `Alert` "We couldn't confirm the order was placed. Open the orders list before trying again." with a link.
**Order detail (`?order=<id>`):** `PageHeader` "Order EV-… · {event}" with status `Badge`; `Alert` per state (awaiting: "Held until {time} · {n} min left" + the labelled **"Payment instructions: coming in the next release"** block, S4 slot; expired; cancelled); summary grid (Places, Total, Cost centre, Reference, Created by, Team); `DataTable` of participants (name, mobile masked to last 3, email masked, category, kit, status, claimed "Yes/No"); "Cancel order" (danger, `ConfirmDialog` with reason `Select` from the closed set) while awaiting; "Download list" is **not** offered (export S5). Auto-refresh every 60 s while awaiting.

### 6.3 Organizer roster and orders (`/organizer/events?event=<id>&view=registrations|orders`)
- **Registrations:** summary strip of `MetricCard`s from `registrations/summary` (Confirmed, Reserved (unpaid), Cancelled, and per category "sold / capacity" as a compact list). `DataTable`: Name (masked for reserved rows, full for confirmed, with a `title` tooltip "Full name shows once paid" on masked cells), Category, Ticket, Status (`Badge`: Reserved = warning "Awaiting payment", Confirmed = success, Cancelled = gray), Order ref, Team, Kit size (confirmed only, else "—"), Claimed (✓ / —), Created. Filters: Status `Select`, Category `Select`, search (name; applies to confirmed rows, the hint says so). Sort by created desc default; page sizes 25/50. Empty: "No registrations yet" / "Bado hakuna usajili" (published) or the draft message (§6.1). Error/loading as usual. No export, no row detail in S3 (S5 adds the detail drawer with role-scoped contact fields). Banner `Alert` info (dismissable per session): "Names of unpaid registrations are masked. Contact details and emergency contacts are never listed here." / "Majina ya usajili ambao haujalipwa yamefichwa. Mawasiliano na watu wa dharura hayaonyeshwi hapa kamwe."
- **Orders:** `DataTable`: Reference, Purchaser (masked member name or organisation name with a `Badge` "Organisation"), Places, Total, Fees (FitFlex fee line, informational), Status, Held until / Closed (date), Created. Filter by status. Footer line "Totals are what purchasers pay; your payout statement comes with payments (next release)." / "Jumla ni kile wanunuzi wanacholipa; taarifa ya malipo yako itakuja pamoja na malipo (toleo lijalo)."

### 6.4 Organizer wizard addition (Terms step): "Participant details" section
Below the refund policy in `event-wizard-steps/terms.tsx`: heading "Participant details you collect" / "Taarifa za washiriki unazokusanya", intro "Collect only what the event needs. Name is always required." / "Kusanya tu kinachohitajika na tukio. Jina huhitajika kila mara.", then one row per key of §3.3 with a 3-way `Radio` group Required / Optional / Not collected (`Haihitajiki`, `Hiari`, `Haikusanywi`): Mobile number, Email, Date of birth (locked to Required with the note "Needed because {category} has a minimum age" when any category has `minAge`), Gender, Emergency contact, T-shirt / kit size (hidden unless `kitProvided` on the Kit step; then default Optional). Validation: phone and email cannot both be "Not collected" (`events.validation.contact_policy`). Also **Duplicate policy** `Radio`: "One place per person per category (recommended)" / "Allow the same person twice" — saved as `duplicatePolicy`. Both are material changes on a published event (ORG-007: they change what members must enter) → the change-note dialog applies. PATCH sends `participantFields` and `duplicatePolicy`; the backend's `parseEventPatch` must accept them (§9).

### 6.5 Admin (`/admin/events?event=<id>`, scope `events`)
Tabs **Orders** (`GET /admin/events/:id/orders`) and **Registrations** with full names and purchaser display names, same tables as §6.3 plus an order row click → side `Dialog` with lines, participants (name, masked contact, category, status, claimed), terms/consent timestamps, hold info, and "Cancel order" (reason note required ≥ 5 chars) → `POST /admin/events/:id/orders/:orderId/cancel`; audit entry `events.order_cancelled` shows in the existing audit view. No payment actions (S4, D6).

### 6.6 Portal i18n keys (`src/lib/i18n.ts`, EN + SW draft)
| Key | EN | SW (draft) |
|---|---|---|
| `org.nav.events` | Events | Matukio |
| `corp.events.title` | Event registrations | Usajili wa matukio |
| `corp.events.register` | Register people | Sajili watu |
| `corp.events.empty.title` | No event orders yet | Bado hakuna maagizo ya matukio |
| `corp.events.empty.body` | Register your staff for a published running event in bulk. | Sajili wafanyakazi wako kwa wingi kwenye tukio la kukimbia lililochapishwa. |
| `corp.events.col.reference` | Reference | Kumbukumbu |
| `corp.events.col.event` | Event | Tukio |
| `corp.events.col.places` | Places | Tiketi |
| `corp.events.col.total` | Total | Jumla |
| `corp.events.col.status` | Status | Hali |
| `corp.events.col.heldUntil` | Held until | Zimeshikiliwa hadi |
| `corp.events.col.createdBy` | Created by | Imewekwa na |
| `corp.events.col.created` | Created | Tarehe |
| `corp.events.step.event` | Event | Tukio |
| `corp.events.step.people` | People | Watu |
| `corp.events.step.check` | Check | Hakiki |
| `corp.events.step.confirm` | Confirm | Thibitisha |
| `corp.events.pickEvent` | Choose a published event | Chagua tukio lililochapishwa |
| `corp.events.viewPublic` | View public page | Ona ukurasa wa umma |
| `corp.events.paste` | Paste your list (one person per line) | Bandika orodha yako (mtu mmoja kwa kila mstari) |
| `corp.events.upload` | Upload CSV | Pakia CSV |
| `corp.events.example` | Download example | Pakua mfano |
| `corp.events.columns` | Columns: first name, last name, mobile number, email, category, date of birth, gender, kit size | Safu: jina la kwanza, jina la ukoo, namba ya simu, barua pepe, kundi, tarehe ya kuzaliwa, jinsia, saizi ya vifaa vya mbio |
| `corp.events.requiredFor` | Required for this event: {list} | Zinazohitajika kwa tukio hili: {list} |
| `corp.events.addRow` | Add a row | Ongeza mstari |
| `corp.events.check` | Check list | Kagua orodha |
| `corp.events.noReload` | The list stays in this tab until you place the order; reloading the page clears it. | Orodha hubaki kwenye kichupo hiki hadi uweke agizo; kupakia upya ukurasa huifuta. |
| `corp.events.ready` | Ready to register | Tayari kusajiliwa |
| `corp.events.fix` | Need fixing | Zinahitaji kurekebishwa |
| `corp.events.duplicates` | Duplicates | Zilizorudiwa |
| `corp.events.placesLeft` | Places left | Tiketi zilizobaki |
| `corp.events.notEnough` | Not enough places: {ticket} needs {requested}, {remaining} left | Tiketi hazitoshi: {ticket} inahitaji {requested}, zimebaki {remaining} |
| `corp.events.problemsOnly` | Show problems only | Onyesha zenye matatizo tu |
| `corp.events.editList` | Edit list | Hariri orodha |
| `corp.events.alreadyRegistered` | Already registered for {category} ({status}) | Tayari amesajiliwa kwa {category} ({status}) |
| `corp.events.costCentre` | Cost centre | Kituo cha gharama |
| `corp.events.reference` | Your reference | Kumbukumbu yako |
| `corp.events.reference.hint` | Shows on the order and on the invoice later | Huonekana kwenye agizo na baadaye kwenye ankara |
| `corp.events.teamName` | Team name | Jina la timu |
| `corp.events.teamName.hint` | Participants are grouped as one corporate team | Washiriki huwekwa kama timu moja ya shirika |
| `corp.events.discount` | Approved organisation discount | Punguzo lililoidhinishwa la shirika |
| `corp.events.fee` | Service fee | Ada ya huduma |
| `corp.events.acceptTerms` | We accept the event terms and refund policy | Tunakubali masharti ya tukio na sera ya marejesho |
| `corp.events.hold` | Places are held for {n} minutes after you place the order. Payment instructions arrive in the next portal release; nothing is charged now. | Tiketi zitashikiliwa kwa dakika {n} baada ya kuweka agizo. Maelekezo ya malipo yatakuja kwenye toleo lijalo la tovuti; hakuna kinachotozwa sasa. |
| `corp.events.place` | Place order · {amount} | Weka agizo · {amount} |
| `corp.events.uncertain` | We couldn't confirm the order was placed. Open the orders list before trying again. | Hatukuweza kuthibitisha kama agizo limewekwa. Fungua orodha ya maagizo kabla ya kujaribu tena. |
| `corp.events.order.title` | Order {ref} · {event} | Agizo {ref} · {event} |
| `corp.events.order.heldLeft` | Held until {time} · {n} min left | Zimeshikiliwa hadi {time} · zimebaki dakika {n} |
| `corp.events.order.paySoon.title` | Payment instructions: coming in the next release | Maelekezo ya malipo: yanakuja kwenye toleo lijalo |
| `corp.events.order.paySoon.body` | This release reserves places. Paying for them arrives next; nothing is confirmed until payment. | Toleo hili huhifadhi tiketi. Kulipa kutakuja baadaye; hakuna kinachothibitishwa hadi malipo yafanyike. |
| `corp.events.order.expired` | The hold ended before payment. Places were released. | Muda wa kushikilia umeisha kabla ya malipo. Tiketi zimeachiliwa. |
| `corp.events.order.cancelled` | Cancelled on {date} by {name} | Limeghairiwa tarehe {date} na {name} |
| `corp.events.order.cancel` | Cancel order | Ghairi agizo |
| `corp.events.order.cancel.body` | Held places go back on sale. The list is not kept. | Tiketi zilizoshikiliwa zitarudi sokoni. Orodha haitahifadhiwa. |
| `corp.events.order.claimed` | Claimed | Imechukuliwa |
| `events.cancelReason.changed_mind` | Changed our mind | Tumebadili nia |
| `events.cancelReason.wrong_details` | Wrong details | Taarifa si sahihi |
| `events.cancelReason.duplicate` | Registered twice | Tumesajili mara mbili |
| `events.cancelReason.other` | Other | Nyingine |
| `organizer.events.view.registrations` | Registrations | Usajili |
| `organizer.events.view.orders` | Orders | Maagizo |
| `organizer.reg.notPublished` | Registrations appear once the event is published | Usajili utaonekana baada ya tukio kuchapishwa |
| `organizer.reg.confirmed` | Confirmed | Zilizothibitishwa |
| `organizer.reg.reserved` | Reserved (unpaid) | Zilizoshikiliwa (hazijalipwa) |
| `organizer.reg.cancelled` | Cancelled | Zilizoghairiwa |
| `organizer.reg.capacity` | {sold} / {capacity} sold | {sold} / {capacity} zimeuzwa |
| `organizer.reg.col.name` | Name | Jina |
| `organizer.reg.col.category` | Category | Kundi |
| `organizer.reg.col.ticket` | Ticket | Tiketi |
| `organizer.reg.col.status` | Status | Hali |
| `organizer.reg.col.order` | Order | Agizo |
| `organizer.reg.col.team` | Team | Timu |
| `organizer.reg.col.kit` | Kit size | Saizi ya vifaa |
| `organizer.reg.col.claimed` | Claimed | Imechukuliwa |
| `organizer.reg.col.created` | Registered | Tarehe |
| `organizer.reg.masked` | Full name shows once paid | Jina kamili huonekana baada ya malipo |
| `organizer.reg.search` | Search confirmed names | Tafuta majina yaliyothibitishwa |
| `organizer.reg.empty` | No registrations yet | Bado hakuna usajili |
| `organizer.reg.privacy` | Names of unpaid registrations are masked. Contact details and emergency contacts are never listed here. | Majina ya usajili ambao haujalipwa yamefichwa. Mawasiliano na watu wa dharura hayaonyeshwi hapa kamwe. |
| `organizer.orders.col.purchaser` | Purchaser | Mnunuzi |
| `organizer.orders.organisation` | Organisation | Shirika |
| `organizer.orders.col.fees` | FitFlex fee | Ada ya FitFlex |
| `organizer.orders.col.closed` | Closed | Limefungwa |
| `organizer.orders.footer` | Totals are what purchasers pay; your payout statement comes with payments (next release). | Jumla ni kile wanunuzi wanacholipa; taarifa ya malipo yako itakuja pamoja na malipo (toleo lijalo). |
| `organizer.orders.empty` | No orders yet | Bado hakuna maagizo |
| `events.status.awaiting_payment` | Awaiting payment | Inasubiri malipo |
| `events.status.reserved` | Reserved | Imeshikiliwa |
| `events.status.confirmed` | Confirmed | Imethibitishwa |
| `events.status.cancelled` | Cancelled | Imeghairiwa |
| `events.status.expired` | Expired | Muda umeisha |
| `events.terms.fields.title` | Participant details you collect | Taarifa za washiriki unazokusanya |
| `events.terms.fields.intro` | Collect only what the event needs. Name is always required. | Kusanya tu kinachohitajika na tukio. Jina huhitajika kila mara. |
| `events.terms.fields.required` | Required | Inahitajika |
| `events.terms.fields.optional` | Optional | Hiari |
| `events.terms.fields.off` | Not collected | Haikusanywi |
| `events.terms.fields.phone` | Mobile number | Namba ya simu |
| `events.terms.fields.email` | Email | Barua pepe |
| `events.terms.fields.dob` | Date of birth | Tarehe ya kuzaliwa |
| `events.terms.fields.dob.locked` | Needed because {category} has a minimum age | Inahitajika kwa sababu {category} lina umri wa chini |
| `events.terms.fields.gender` | Gender | Jinsia |
| `events.terms.fields.emergency` | Emergency contact | Mtu wa dharura |
| `events.terms.fields.kit` | T-shirt / kit size | Saizi ya fulana / vifaa vya mbio |
| `events.terms.duplicate` | Duplicate registrations | Usajili unaorudiwa |
| `events.terms.duplicate.one` | One place per person per category (recommended) | Tiketi moja kwa mtu kwa kila kundi (inashauriwa) |
| `events.terms.duplicate.allow` | Allow the same person more than once | Ruhusu mtu mmoja zaidi ya mara moja |
| `events.validation.contact_policy` | Mobile number and email can't both be "Not collected" | Namba ya simu na barua pepe haziwezi zote kuwa "Haikusanywi" |
| `admin.events.view.orders` | Orders | Maagizo |
| `admin.events.view.registrations` | Registrations | Usajili |
| `admin.events.order.cancel` | Cancel order (FitFlex) | Ghairi agizo (FitFlex) |
| `admin.events.order.cancel.note` | Reason (shown in the audit log) | Sababu (huonekana kwenye kumbukumbu ya ukaguzi) |
| `admin.events.audit.order_cancelled` | Order cancelled | Agizo limeghairiwa |
| `events.error.participant_invalid` | Some rows need fixing | Baadhi ya mistari inahitaji kurekebishwa |
| `events.error.capacity_unavailable` | Not enough places left | Tiketi hazitoshi |
| `events.error.price_changed` | Prices were updated; review the new total | Bei zimebadilishwa; kagua jumla mpya |
| `events.error.too_many_rows` | More than 500 people; split the list | Zaidi ya watu 500; gawa orodha |
| `events.error.organization_not_active` | Your organisation isn't active yet | Shirika lako bado halijawashwa |
| `events.error.terms_not_accepted` | Accept the terms to continue | Kubali masharti ili uendelee |
| `events.error.event_not_open` | This event isn't open for registration | Tukio hili halijafunguliwa kwa usajili |
| `events.error.registration_closed` | Registration has closed | Usajili umefungwa |
| `events.error.invalid_transition_order` | This order can't be changed any more | Agizo hili haliwezi kubadilishwa tena |
The `events.validation.*` portal keys mirror the mobile list in §5.12 (same codes, same EN/SW) and are added to the same map.

### 6.7 Portal e2e (Playwright, `tests/e2e/events-s3.spec.ts`, self-contained like the S2 events spec; backend mocked by route interception)
- Corporate: nav item appears only with flag + options; wizard happy path (pick event → paste 3 rows → check shows 3 ready → confirm → order page awaiting with placeholder block and no Lipa Namba text); dry-run with problems (2 fix, 1 duplicate) blocks Continue and the problems-only filter works; capacity short shows the danger card; `Idempotency-Key` header present and identical across a retried submit; `price_changed` refresh; cancel order dialog with reason; expired state; HR page renders the same component.
- Organizer: registrations tab role-gated (finance sees orders only; ops sees registrations only); masked names for reserved, full for confirmed; search hint; summary strip numbers; orders tab columns; draft event shows the "once published" empty state; cross-event id → not-found state.
- Wizard Terms step: the participant-details radios save `participantFields`; DOB locked when a category has `minAge`; both-off validation message; duplicate policy saved; change note required on a published event.
- Admin: orders/registrations tabs with full names; cancel with note calls the admin route; flag-off hides everything.
- Accessibility: axe on the wizard steps and tables (no serious violations); keyboard-only run through the wizard.

### 6.8 Acceptance criteria (P-)
- P-C-1 `/org/events` and `/hr/events` exist only with the portal flag and `registration && corporate` options; otherwise the nav item is absent and the pages show `FeatureOff`.
- P-C-2 The wizard cannot proceed past Check with any problem, duplicate or capacity shortfall; every row's problems are listed with field names in the active language.
- P-C-3 The CSV example downloads; header aliases in any order parse; a single-word name is flagged `name_incomplete`.
- P-C-4 Confirm shows the itemised quote (discount only if the server returned one), cost centre/reference inputs, the organisation consent and terms checkboxes, and the hold notice; Place order is disabled until both boxes are ticked.
- P-C-5 The order is created with an `Idempotency-Key` reused on retry; after creation the order page shows Awaiting payment, the countdown, the participants table with masked contacts, and the clearly labelled "coming in the next release" payment block.
- P-C-6 Cancel order asks for a reason and shows the cancelled state; expired orders show the expired state; the list reflects statuses on refresh.
- P-O-1 Organizer registrations tab masks reserved names and shows full confirmed names; no phone, email, DOB, gender or emergency contact column exists; the privacy banner is shown.
- P-O-2 Role gating of the two tabs matches §6.1; a draft event shows the "once published" empty state; an event of another organizer renders not-found.
- P-O-3 Orders tab shows purchaser as masked name or organisation badge, totals, fees, status and hold/closed times; the footer line is present.
- P-W-1 The Terms step saves `participantFields` and `duplicatePolicy`; DOB is locked to Required when any category has a minimum age; phone+email both off is refused; on a published event the change-note dialog appears.
- P-A-1 Admin sees orders and registrations with full names and can cancel an unpaid order with a note; the audit log shows `Order cancelled`.
- P-ALL-1 Every new string resolves in EN and SW (no raw keys); Swahili fits the tables at 1280 px without truncating headers.
- P-ALL-2 axe reports no serious violations on the wizard and tables; all table actions are reachable by keyboard.

---

## 7. Shared

### 7.1 Flags
| Flag | Where | Default | Effect |
|---|---|---|---|
| `EVENTS_REGISTRATION` | server env | off | All §3 routes 404 `feature_disabled`; `GET /events/options.registration` true/false plus the §3.1 keys. Needs `EVENTS_MODULE`. |
| `EVENTS_MAX_PARTICIPANTS_PER_ORDER`, `EVENTS_CORPORATE_MAX_ROWS`, `EVENTS_TEAM_MAX_MEMBERS`, `EVENTS_CLAIM_TOKEN_DAYS`, `EVENTS_CONSENT_TEXT_VERSION`, `EVENTS_FEE_RULE` (JSON), `EVENTS_ORG_DISCOUNTS` (JSON) | server env (config, not flags) | 10 / 500 / 50 / 90 / `2026-10-draft` / none / `{}` | §3 |
| `EVENT_HOLD_TTL_MINUTES` | server env (S1) | 30 | hold length; surfaced as `holdTtlMinutes` |
| mobile | — | — | **No new dart-define.** `EVENTS_DISCOVERY` (S2) + options `registration` gate everything; `teams` / `corporate` option keys gate their UI. |
| `NEXT_PUBLIC_EVENTS_MODULE` | portal build | off | plus options `registration`/`corporate` at runtime |
Dormant check: with `EVENTS_REGISTRATION` off, S2 behaviour is byte-for-byte unchanged (the CTA reads the same `registration:false`).

### 7.2 Analytics (PRD §14; names reserved, no personal data)
Mobile: `registration_started { eventId, source }`, `checkout_quote_created { eventId, placesCount, totalTzs, mode }`, `order_created { orderId, eventId, placesCount, totalTzs, mode, team: bool }`, `order_cancelled { orderId, reason }`, `registration_claimed { registrationId, via: 'link'|'in_app' }`. Portal (corporate): `registration_started { eventId, source: 'corporate' }`, `registration_roster_validated { eventId, rows, ok, problems, duplicates }`, `checkout_quote_created`, `order_created { …, mode: 'corporate' }`. Server-side (truth): `order_created`, `order_expired`, `order_cancelled` from the service/job. Same no-op-hook rule as S2 §15 until S7 connects a pipeline.

### 7.3 Privacy notes (PRD §10)
- Before payment the organizer sees **counts and masked names only**; after payment full names and kit size; **never** phone, email, DOB, gender or emergency contact in any list, summary, export or webhook (export and per-row detail are S5 with role scoping). Emergency contact is visible to the purchaser, the claimed participant and — through the support process only — FitFlex staff; it is excluded from admin list/detail views in S3.
- Claim previews return masked data only; claiming requires a verified contact; name alone never links anyone (REG-010). Tokens are hashed at rest, carried in URL fragments, kept on the device ≤ 24 h, and expire after 90 days.
- Drafts never leave the device; corporate lists live in the browser tab only until the order is placed.
- Consent basis, consent text version and timestamps are stored per registration and per order; the consent copy is a draft pending Tanzanian counsel (owner reminder: legal texts are drafts).
- Retention/anonymisation of participant fields after account deletion stays open (follow-ups "Privacy / retention"); S3 adds no deletion path. Logs: the registration service logs ids and codes only, never participant fields (same rule as the REST-logging fix on mobile).

### 7.4 Rule-6 and review callouts for the PRs
No pricing constants, payout engine, check-in logic or `src/auth/*` changes expected. New money-adjacent code: order totals derive from `quoteLines` + config; `expectedTotalTzs` is an equality check only. Security review should look at: idempotency scoping for corporate `(organizationId, key)` with the organisation guard; claim rules (verified contact mandatory); rate limits on `lookup`, `preview`, `quote`; `bulk` option not reachable from member routes; organizer roster masking by status; admin cancel audit.

---

## 8. Backend fields and confirmations needed (for `fitflex-planner` / `contract-checker` / `backend-builder`)
1. Migration §3.2 (all additive) — names and CHECK sets; `EventTeam.joinCode` clear vs hash (either is fine for the UI).
2. `parseEventPatch` / `validateEvent` accept `participantFields` and `duplicatePolicy`; they are material fields (ORG-007); `detailView` exposes the effective `fields` so the quote can echo it.
3. Store additions: `expectedTotalTzs` option on `createOrderWithHolds` (409 `price_changed`, nothing written); `bulk: true` server-side option lifting `maxPerOrder` for corporate orders; an atomic post-create hook (or service-level transaction) for the extra columns, claim tokens and team rows; `releaseRegistration` primitive with the per-registration movement key (§3.8) and the `remove_whole_line` refusal; `expireHolds` hook for notification 2.
4. `POST /me/event-registrations/claim { token }` alias that resolves the registration from the token (preview returns no id).
5. `GET /events/options` additions (§3.1), incl. copying `smsCodes`/`emailCodes` from `/auth/options`.
6. Corporate permission: `beneficiaries.manage` for both validate and place (Q4), organisation `active` check, and whether org users have a portal inbox for notifications 1/2 (else email).
7. `/me/personal-details` is behind `PARTNER_DOB_REQUIRED`; the self prefill falls back to the member profile DOB when that flag is off — confirm the member profile field name (`MemberData.dateOfBirth`?) or accept "no prefill" when neither exists.
8. Verified-contact lookup for the purchaser's own contacts (`self_contact_mismatch`) and for `claimable` (`LoginIdentifier` by person).
9. Rate limits: quote 60/min, lookup 30/h, preview 40/h per IP, team create 10/day, claim 20/h.
10. Notification types and bilingual payloads of §3.14; `localeOf` wiring for members (exists) and org users (confirm).
11. Share host for `/event-claim/#` links (same `FRIEND_INVITE_BASE_URL` / `APP_DOWNLOAD_LINK` as S2 `shareUrl`); Android App Link entry for `/event-claim/*` (carried like S2's `/member/events/*`).
12. Fee rule config `EVENTS_FEE_RULE` and `feeLabel` text (owner decides whether a fee is charged at all; default none).
13. `group` roster column accepted and ignored (no column) — or add `EventRegistration.groupLabel` now (cheap) so corporate lists can be filtered later (Q5).

---

## 9. Open questions for the owner (only those that change behaviour)
1. **When do participant invitations go out?** Spec: SMS/email claim invitations are sent on **payment confirmation (S4)**, not when the unpaid order is placed; in-app "Is this you?" notices go at order creation to members with a verified matching contact. Alternative: send at order creation (costs SMS for places that may expire in 30 minutes).
2. **Hold length for S3 UAT.** With no payment path in S3 every order expires after `EVENT_HOLD_TTL_MINUTES` (30). Keep 30 for realism, or set 120 on the UAT backend so testers can walk the awaiting-payment screens?
3. **Per-place removal before payment.** Spec allows the purchaser to remove one person from an unpaid multi-place order (new store primitive), except the last place of a ticket line. Simpler alternative: whole-order cancel only in S3 (register again); removal arrives with S4 refunds.
4. **Who may place a corporate order?** Spec: anyone with the roster permission (`beneficiaries.manage`) can validate **and** place (no money moves in S3). Should placing require a billing role (`ORG_BILLING`) from the start, since S4 will attach an invoice/payment?
5. **Keep a "group / department" label on corporate rows?** Spec drops it in S3 (no column). Adding `groupLabel` now is cheap and lets HR filter by department later.
6. **Duplicate policy default.** Spec default: one place per person per category, matched on phone or email as entered (not verified). Confirm, or default to "allow" and let organizers switch it on.
7. **Fee line.** No FitFlex service fee is charged unless `EVENTS_FEE_RULE` is set (D2 says the organizer commission is taken from the payout, not added to the member's price). Confirm that members see no fee line at launch.
8. All SW strings need native review before UAT; "tiketi" for a bought place and "zimeshikiliwa" for a hold are proposed to keep "nafasi" for roles.
