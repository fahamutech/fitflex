
# FitFlex Africa — Marathon & Running Events Module
## Product Requirements Specification (PRS/PRD)
**Version:** 1.0  
**Date:** 21 October 2026  
**Status:** Product baseline for repository-aware implementation planning  
**Product:** FitFlex Africa  
**Launch context:** Tanzania first; extensible to East Africa

---

## 1. Executive summary

FitFlex will add a first-class **Events & Running** capability inside the existing FitFlex ecosystem. It will support road marathons, half-marathons, 5K/10K races, trail runs, fun runs, charity runs, virtual running challenges, and other approved running events.

The product connects the full lifecycle:

1. Discover an event and review its details.
2. Register for oneself, another participant, a group, a club, or a corporate team.
3. Pay using a supported payment method and receive an individual ticket for every participant.
4. Receive event updates and collect the race kit.
5. Start/record a run when the event supports it.
6. Receive verified results, digital medals and FitFlex achievements.
7. Earn and redeem eligible rewards.
8. Give organizers operational tools, live participant synchronization, a secure API and webhooks.

The module must reuse the existing FitFlex Flutter app, run recorder, API client, Firebase authentication, localization, design tokens, operator/admin portal, vendor/business onboarding patterns, notifications, payment request patterns, database/migration conventions and test infrastructure.

### Confirmed product decisions
- **Event scope:** all running events, including trail runs and fun runs.
- **Registration:** individual, register-for-others, group, club/team and corporate bulk registration from launch.
- **Rewards:** digital achievements plus redeemable rewards.
- **Organizer access:** dashboard, secure API and webhooks from launch.
- **Implementation principle:** inspect the current repository and design system before changing code; extend existing capabilities instead of duplicating them.

### Critical launch constraint
The accessible marketplace readiness documentation says shop-order payment initiation is not yet integrated with a payment provider and manual confirmation is currently used. Do not treat this as proof that marathon payment integration exists. Provider choice, sandbox credentials, charge creation, callback/signature verification, refunds and reconciliation must be verified and delivered as an explicit launch gate. Never issue a paid ticket based only on a client-side success screen or participant-entered reference.

---

## 2. Repository baseline and implementation guardrails

Repository inspection was performed against the accessible FitFlex repositories on 21 October 2026. This is a targeted inspection, not a full code audit.

| Area | Observed baseline | Requirement |
|---|---|---|
| Mobile | Flutter app; `GoRouter`; shared `ApiClient`; Firebase Auth; localization; QR, map/location, permission and activity packages | Add routes/screens using existing router, API client, auth and permissions |
| Running | `lib/shared/activity/run_recorder.dart`; activity types already include running, jogging and hiking; run metrics and GPS source exist | Extend/link the existing run recorder; do not build a parallel GPS recorder |
| Design system | Mobile `lib/shared/design_tokens.dart`; portal `app/globals.css`; portal README says tokens must stay in sync | Reuse tokens/components/type scale/semantic colors; no ad-hoc palette |
| Portal | Next.js 15 App Router, TypeScript, Tailwind v4, Firebase web auth, Radix UI components, Playwright tests; English and Swahili strings in `src/lib/i18n.ts` | Add organizer workflows to existing portal and extend i18n |
| Backend | `fitflex-functions`; JavaScript ES modules; BFast Functions; PostgreSQL/Knex migrations; service layer and Node test specs | Add domain services, migration files, route wiring, transactional stores and tests following local conventions |
| Existing marketplace | Vendor onboarding, payment requests, order state machine, refunds and reconciliation patterns; marketplace payment documentation says shop provider integration is absent | Reuse safe concepts, not unverified provider functionality; isolate race payments from shop orders |
| Corporate/B2B | Existing corporate accounts, organization users/beneficiaries and corporate HR routes | Integrate bulk registration with current organization model where suitable; avoid a second corporate identity model |
| Activity model | Existing Activity/ActivityRoute concepts and source/provenance distinctions | Link event-run records to activities without conflating tracked activity with official race results |

### Mandatory repository-first checklist
Before implementation, Claude Code must:
1. Read the root README and relevant architecture docs in all three repositories.
2. Inspect router, navigation, auth/role claims, `ApiClient`, localization, design tokens and shared UI components.
3. Inspect current database migrations, `knex-store`, transaction-specific stores, route registration and service bootstrap.
4. Inspect current payment-request lifecycle, refund flow, provider integration and webhook verification; report what is implemented vs absent.
5. Inspect `run_recorder.dart`, activity model, run validation and any existing challenges/rewards/leaderboard implementation.
6. Inspect portal route groups, layout, permission guards, form/table/dialog patterns and Playwright setup.
7. Produce a **reuse map** and **gap report** before changing code.
8. Avoid broad refactors, schema rewrites, renaming existing fields, or replacing shared components unless justified and separately approved.
9. Add backward-compatible migrations and feature flags where useful.
10. Never put credentials, secrets, real participant data or production payment payloads in source, logs or fixtures.

---

## 3. Product vision, goals and non-goals

### Vision
Make FitFlex the place where runners discover events, register individually or together, manage event participation, prove achievements and continue their fitness journey after race day—while giving organizers efficient event operations and reliable integrations.

### Business goals
- Increase meaningful member engagement and repeat activity inside FitFlex.
- Help organizers reach participants and reduce manual registration/kit collection work.
- Create a trusted source of event listings and participant registration records.
- Enable transparent ticket revenue, fees, refunds and organizer settlement.
- Build a durable participation/achievement history that can power challenges, rewards, corporate wellness and sponsor campaigns.

### User goals
- Discover relevant events with clear dates, distances, prices and requirements.
- Complete registration quickly without re-entering known details unnecessarily.
- Register friends/colleagues with consent and correct participant details.
- Get an individual ticket and clear kit collection instructions.
- Track supported runs and see which results are official vs self-recorded.
- Earn fair, explainable medals and rewards.
- Organize an event without spreadsheets becoming the source of truth.

### Non-goals for the first launch
- Building a separate marathon-only mobile app.
- Replacing professional timing systems.
- Treating GPS alone as proof of an official in-person result.
- Issuing physical medals or shipping kits on behalf of organizers.
- Holding participant money in an unregulated wallet or implementing stored-value balances without legal and payment review.
- Creating an unrestricted public API with access to every participant field.
- Promising automatic payment processing before a provider is chosen, integrated and certified.
- Medical advice, emergency response dispatch or guarantees about route safety.

---

## 4. Personas and permissions

### Personas
1. **Runner/member:** discovers events, registers, pays, manages tickets, records supported runs, views results and rewards.
2. **Purchaser/group captain:** pays for one or more entries and manages the order; may not be a participant.
3. **Team/corporate coordinator:** uploads or enters roster, manages team registration, reconciles entries and sees team-level reporting.
4. **Organizer owner/admin:** manages organization profile, events, pricing, capacity, participant list, staff, integrations, kit collection and results.
5. **Organizer operations staff:** limited event access for roster lookup, QR scan, kit handover and bib assignment.
6. **Timing partner:** submits permitted bib/checkpoint/official result data for assigned events.
7. **FitFlex event reviewer/admin:** verifies organizers, moderates events, manages disputes, fees, refunds/exception approvals and audit access.
8. **Reward partner:** manages approved offers/redemption rules only for its own rewards.

### Role rules
- A person may have more than one role, but authorization must be explicit per organization and event.
- Organizer access is scoped to events owned or assigned to that organizer.
- Event staff can access only the fields needed for their assigned task.
- Corporate HR can manage only their organization’s roster and approved aggregate reports.
- Timing partners can submit or read only assigned race data.
- FitFlex admin privileges must use existing role/ACL conventions and be audited.
- Do not rely on hidden UI controls as authorization; enforce every permission server-side.

---

## 5. Scope and functional requirements

Priority labels: **P0 = launch-critical**, **P1 = required early**, **P2 = later enhancement**. Because the selected launch scope includes all registration modes and organizer APIs, corporate/group registration and secure integration are P0, not deferred.

### 5.1 Event discovery and detail
- **EVT-001 (P0):** List published, approved, non-cancelled upcoming events.
- **EVT-002 (P0):** Search by event name, location, organizer, route type and keyword.
- **EVT-003 (P0):** Filter by date range, distance/category, event type (road, trail, fun, charity, virtual), location, price and registration status.
- **EVT-004 (P0):** Event details include description, organizer, start/end dates and times, timezone, venue, route/map or route link, distance categories, capacity/availability, entry prices, inclusions, eligibility, accessibility notes, kit collection, schedule, sponsors, contact, terms, cancellation/refund policy and last-updated time.
- **EVT-005 (P0):** Show a clear registration deadline and sold-out/closed status; never accept entries past configured cutoffs.
- **EVT-006 (P0):** Display TZS by default for Tanzania and store currency explicitly. Do not assume all events use TZS.
- **EVT-007 (P1):** Save/favourite events and share event links.
- **EVT-008 (P1):** Event reminders and changes through existing notification channels, respecting preferences.
- **EVT-009 (P1):** Lightweight mobile experience and graceful states for slow/failed connections.
- **EVT-010 (P0):** Support English and Swahili strings in existing localization architecture.

### 5.2 Organizer onboarding and event publishing
- **ORG-001 (P0):** Organizer signs in through existing account/auth model and requests organizer capability; do not create a parallel login system.
- **ORG-002 (P0):** Capture legal/trading name, contact person, verified phone/email, address, registration identifiers where applicable, payout details through approved secure workflow, and supporting evidence as required.
- **ORG-003 (P0):** Organizer status states: `draft`, `pending_review`, `active`, `rejected`, `suspended`; transitions audited.
- **ORG-004 (P0):** Active organizer can create draft events and configure event types, categories, ticket tiers, capacity, group rules, prices, deadlines, terms, route, schedule, kit and collection locations.
- **ORG-005 (P0):** Publishing requires validation and review. Initial launch should use FitFlex approval unless an explicitly approved trust policy allows trusted organizers to publish directly.
- **ORG-006 (P0):** Event lifecycle: `draft`, `submitted`, `published`, `registration_closed`, `in_progress`, `completed`, `cancelled`, `archived`. Enforce valid transitions server-side.
- **ORG-007 (P0):** Edit published events with change history. Material changes (date, route, distance, price, cancellation) notify registered participants and may trigger refund/consent workflows.
- **ORG-008 (P0):** Event capacity and ticket availability must be concurrency-safe.
- **ORG-009 (P0):** Organizer can manage event staff and assign least-privilege roles.
- **ORG-010 (P0):** Organizer dashboard shows registrations, paid/unpaid entries, ticket categories, revenue/fees, refunds, roster, kit collection, bibs and integration health.
- **ORG-011 (P1):** Organizer can export permitted CSV/XLSX files with audit logging and access controls.
- **ORG-012 (P0):** Organizer can configure API credentials/webhook endpoints and rotate/revoke secrets securely; secrets displayed only once.

### 5.3 Registration modes
Every purchase/order is separate from participant registrations.

- **REG-001 (P0):** Register self.
- **REG-002 (P0):** Register one or more other participants; purchaser can be different from participant.
- **REG-003 (P0):** Group purchase with multiple participant records under one order.
- **REG-004 (P0):** Team/club registration with team name and optional captain.
- **REG-005 (P0):** Corporate bulk registration with organization identity, coordinator, participant roster, cost centre/reference and approved discount or invoicing terms if configured.
- **REG-006 (P0):** Each participant has their own registration ID, ticket/QR token, race category, kit choices, check-in status and result.
- **REG-007 (P0):** Group order can mix purchaser participation and other participants if event rules allow.
- **REG-008 (P0):** Participant data collection is event-configurable but constrained to approved fields; collect only necessary data.
- **REG-009 (P0):** Validate required fields, contact format, age/eligibility, duplicate registration rules, race-category capacity and terms acceptance.
- **REG-010 (P0):** Store consent/authorization basis when purchaser registers another adult; send participant invitation/claim flow where appropriate. Do not silently merge another person's registration into an account based only on name or phone.
- **REG-011 (P0):** Support unclaimed participant registration and safe claim/linking after identity verification.
- **REG-012 (P0):** Ticket is not valid for entry until payment is confirmed or an authorized complimentary/sponsored entry is approved.
- **REG-013 (P0):** Participant change/transfer policy is configurable, logged and closes at configured deadline.
- **REG-014 (P0):** Sold-out or concurrent last-slot checkout must not oversell. Hold inventory only for a defined, expiring checkout window.
- **REG-015 (P1):** Waitlist with controlled promotion and payment deadline.
- **REG-016 (P0):** Corporate/team roster import validates rows, reports errors and prevents duplicates before order finalization.

### 5.4 Payments, orders, refunds and settlement
- **PAY-001 (P0):** Price is calculated server-side from a published ticket price snapshot, quantity, discounts, fees, taxes if applicable and currency.
- **PAY-002 (P0):** Checkout shows an itemized amount and organizer cancellation/refund policy before payment.
- **PAY-003 (P0):** Use a payment adapter behind an interface; integrate only the provider actually selected and supported for launch.
- **PAY-004 (P0):** Initiate payment server-side; never trust client-reported success.
- **PAY-005 (P0):** Confirm payment through verified provider callback/status lookup or a documented audited manual fallback explicitly labelled as manual.
- **PAY-006 (P0):** Verify provider signature/authentication, amount, currency, merchant reference, order, status and uniqueness before confirming.
- **PAY-007 (P0):** Idempotent processing: duplicate callback or retry cannot create duplicate payment, tickets, reward entries or registrations.
- **PAY-008 (P0):** Failed, pending, expired, cancelled, paid, refund-pending and refunded states are distinct.
- **PAY-009 (P0):** Paid registration/ticket activation and inventory commitment occur atomically or via an idempotent, recoverable workflow.
- **PAY-010 (P0):** Refund request/approval/payout is auditable; do not change a confirmed payment back to unpaid. Use a separate refund record.
- **PAY-011 (P0):** Reconcile provider settlements with internal payment ledger and organizer balances.
- **PAY-012 (P0):** Define payout schedule, reserve/chargeback policy, fee ownership and cancellation handling before public sale.
- **PAY-013 (P0):** Payment references and provider payloads are redacted from logs; never store card credentials.
- **PAY-014 (P0):** Complimentary/sponsored entries require explicit reason, approver, audit record and inventory handling.

### 5.5 Tickets, QR, kit collection and race operations
- **KIT-001 (P0):** Generate unguessable signed or opaque QR token for each active participant ticket; QR must not encode unnecessary personal information.
- **KIT-002 (P0):** Scan resolves server-side registration and event scope; screenshot replay must not allow multiple kit collections.
- **KIT-003 (P0):** Kit handover captures status, timestamp, collection point, staff actor and optional kit/bib details.
- **KIT-004 (P0):** Default one collection per registration; corrections require authorized override and audit reason.
- **KIT-005 (P0):** Offline scanning queue is allowed only if token validation/cached event roster policy is safe; mark provisional scans and reconcile duplicates on sync.
- **KIT-006 (P0):** Search fallback by registration ID, bib or limited identifying fields; mask sensitive values.
- **KIT-007 (P0):** Bib assignment is unique within the relevant event/category rules and supports re-assignment with audit trail.
- **KIT-008 (P0):** Participant can see ticket state, kit status, location/time instructions and event updates.
- **KIT-009 (P1):** Checkpoints, wave starts and volunteer roles where event needs them.
- **KIT-010 (P0):** Cancellation/deferral communications must reach affected registrants and be logged.

### 5.6 API and webhook integration
- **API-001 (P0):** Versioned API under `/api/v1` or the repo's established equivalent; follow existing route naming conventions after inspection.
- **API-002 (P0):** API access uses OAuth/client credentials or equivalent established secure service identity; per-organizer/event scopes, expiry/rotation/revocation and rate limits.
- **API-003 (P0):** Webhook endpoints must be HTTPS; each delivery is signed using HMAC or provider-supported signature, includes timestamp and unique event ID, and rejects replay outside a bounded window.
- **API-004 (P0):** Deliveries are at-least-once; consumers must deduplicate on event ID. Retry transient errors with backoff and dead-letter/failed-delivery view.
- **API-005 (P0):** Store delivery attempts, response code, retry schedule and last error with sensitive content redacted.
- **API-006 (P0):** Organizers can test endpoint, view delivery history, rotate secret and disable endpoint.
- **API-007 (P0):** API supports pagination/cursor sync, stable IDs, filters and `updated_since`/cursor semantics; never require full roster download for every update.
- **API-008 (P0):** API returns only authorized fields; field minimization by integration scope.
- **API-009 (P0):** Idempotency key required for write operations that can create payments, registrations, check-ins, bib assignments or results.
- **API-010 (P0):** Publish OpenAPI spec and sandbox/test fixtures; document rate limits and error format.
- **API-011 (P0):** Webhook event types include `registration.created`, `registration.updated`, `registration.paid`, `registration.cancelled`, `payment.succeeded`, `payment.failed`, `refund.updated`, `kit.collected`, `bib.assigned`, `result.verified`, `event.updated`, `event.cancelled`.
- **API-012 (P0):** Use transactional outbox or equivalent durable queue so a database commit cannot succeed while its webhook event is silently lost.

### 5.7 Run tracking, results and achievements
- **RUN-001 (P0):** Event page may offer Start Run when event and device mode support it; reuse existing `RunRecorder`.
- **RUN-002 (P0):** Ask for location/health permissions contextually and explain why; app must remain usable for ticketing when permission is declined.
- **RUN-003 (P0):** Store run activity separately from official result; link with event/registration only when authorized and appropriate.
- **RUN-004 (P0):** Result provenance values include `timing_provider`, `organizer_verified`, `fitflex_gps`, `manual_unverified` or the established equivalent. Display provenance.
- **RUN-005 (P0):** Official in-person result requires authorized timing provider or organizer confirmation; GPS alone is not official.
- **RUN-006 (P0):** Result includes distance/category, elapsed time, finish status, source, verification status and verified timestamp. Personal-best comparison must use comparable distance/course rules.
- **RUN-007 (P0):** Virtual events have separate event rules and allowed evidence methods; label results appropriately.
- **RUN-008 (P0):** Handle DNF, DNS, disqualification and corrected results without deleting the audit history.
- **RUN-009 (P0):** Results can be corrected by authorized roles; changes trigger medal/reward recalculation or reversal.
- **RUN-010 (P1):** Optional race route, splits and checkpoints only when provided by an authorized source and participant privacy rules permit.

### 5.8 Digital medals, achievements and redeemable rewards
- **RWD-001 (P0):** Medal templates can be assigned per event/distance/category and configured by organizer.
- **RWD-002 (P0):** FitFlex achievements are separate from event-specific medals.
- **RWD-003 (P0):** Achievement awards require deterministic eligibility rules and a unique idempotency key.
- **RWD-004 (P0):** Do not award a finisher medal for purchase alone; require verified completion under event policy.
- **RWD-005 (P0):** Rewards use an immutable ledger: earn, redeem, expire, reverse; never edit the balance without a ledger event.
- **RWD-006 (P0):** Each reward rule specifies sponsor/issuer, eligible event/action, audience, start/end, quantity/cap, points/value, redemption terms, expiry and reversal policy.
- **RWD-007 (P0):** Redemption uses one-time code/QR or another atomic claim mechanism; prevent double redemption under concurrent requests.
- **RWD-008 (P0):** Reward inventory and funding are explicit; never promise an unfunded cash reward.
- **RWD-009 (P0):** Participant sees why a reward was earned, status, expiry and terms.
- **RWD-010 (P0):** Reversals for fraud, cancelled events or corrected results must be traceable and must not silently erase history.
- **RWD-011 (P1):** Sponsor offers, gym day passes, trainer discounts, vendor vouchers and corporate wellness challenges.
- **RWD-012 (P1):** Leaderboards require clear eligibility, privacy settings and anti-cheat rules.

### 5.9 Notifications and support
- **COM-001 (P0):** Use existing push/in-app/email/SMS channels where configured; do not add a second notification platform.
- **COM-002 (P0):** Notify on registration/payment outcome, ticket issuance, event changes, kit instructions, result verification, medal/reward award and refund status.
- **COM-003 (P0):** Avoid duplicate messages on webhook retries; notifications must be idempotent.
- **COM-004 (P0):** User can control non-essential notifications; critical transactional notices follow applicable terms/law.
- **COM-005 (P0):** Provide support/dispute route for payment, registration, kit and result issues.
- **COM-006 (P0):** Support English/Swahili and clear failure/retry messaging.

---

## 6. UX and navigation requirements

### Member app
Add an **Events / Run** entry point using the existing navigation patterns. Exact route names must be confirmed against the current router before coding.

Suggested screens:
1. Events discovery/list and filters.
2. Event detail.
3. Ticket/category selection.
4. Registration mode selector.
5. Participant roster form (repeatable, with draft save).
6. Review and checkout.
7. Payment status/retry.
8. My event registrations and ticket wallet.
9. QR ticket detail.
10. Kit collection and event updates.
11. Event run / Start Run.
12. Result detail and verification label.
13. Medals/achievements.
14. Rewards wallet and redemption.
15. Team/corporate registration status.

### Organizer portal
Suggested routes under the established portal conventions:
1. Organizer onboarding/status.
2. Organizer overview dashboard.
3. Events list/create/edit.
4. Event publishing/review status.
5. Ticket categories/pricing/capacity.
6. Registrations and participant roster.
7. Group/corporate roster import and validation.
8. QR scan/kit collection.
9. Bib management.
10. Results import/verification.
11. API credentials/webhooks.
12. Integration delivery log.
13. Finance, refunds and payout reconciliation.
14. Staff and permissions.
15. Audit history.

### Design system rules
- Use mobile `FFTokens` and portal `@theme` tokens; preserve the canonical green ramp, semantic colors and contrast notes.
- Reuse existing form fields, cards, buttons, dialogs, tables, status badges, loading/empty/error states, navigation and QR scanner patterns.
- Keep gold for highlight/graphics rather than low-contrast body text.
- Do not introduce a new font, color palette, component library or navigation framework without approval.
- Use the shared English/Swahili localization patterns; no hardcoded user-facing strings.
- Design for low-bandwidth usage and narrow screens, with clear progress, recoverable failures and accessible touch targets.
- Make status labels text-first; color alone must not communicate paid/pending/verified/cancelled.

---

## 7. Data model proposal

This is a **proposed domain model**, not a claim that these tables already exist. Inspect existing tables and naming conventions before finalizing migration names. Follow local conventions for text IDs with prefixes, `createdAt`/`updatedAt`, closed status checks, partial unique indexes, and foreign-key actions.

### Core entities

| Entity | Purpose and key fields |
|---|---|
| `EventOrganizer` or existing organization model | `id`, `userId`/organization link, legal/trading name, contact, verification status, status reason, payout profile reference, timestamps |
| `Event` | `id`, `organizerId`, slug, title, description, event type, status, start/end timestamps, timezone, venue/location, route metadata, terms/refund policy snapshot, publishedAt, timestamps |
| `EventCategory` | `id`, `eventId`, name, distanceMeters, routeType, startTime, eligibility, capacity, registration cutoff, result rules |
| `EventTicketType` | `id`, `eventId`, `categoryId`, name, priceMinor, currency, capacity, sold/held counts or derived inventory, sale window, group limits, active status |
| `EventOrder` | `id`, purchaserUserId nullable for approved guest/corporate flow, organizationId nullable, eventId, status, currency, subtotal, discount, fees, total, price snapshot, idempotency key |
| `EventOrderLine` | `id`, `orderId`, `ticketTypeId`, quantity, unit price snapshot, fees/discount snapshot, line total |
| `EventRegistration` | `id`, `eventId`, `categoryId`, `ticketTypeId`, `orderId`, `orderLineId`, participantUserId nullable until claimed, purchaserUserId, participant identity fields, consent basis, status, bibNumber nullable, kit status, result status |
| `EventTeam` | `id`, `eventId`, `organizationId` nullable, name, captainRegistrationId/userId, team type (`club`, `corporate`, `community`), status |
| `EventTeamMember` | `id`, `teamId`, `registrationId`, role, status |
| `EventPayment` | `id`, `orderId`, existing payment-request link if appropriate, provider, providerTransactionId, merchantReference, amountMinor, currency, status, verifiedAt, idempotency key |
| `EventRefund` | `id`, `paymentId`, `orderId`, amountMinor, currency, reason, status, requestedBy, approvedBy, providerReference, paidAt |
| `EventTicket` | `id`, `registrationId`, opaqueTokenHash or token reference, status, issuedAt, revokedAt |
| `EventKitCollection` | `id`, `registrationId`, collectionPointId, status, collectedAt, staffUserId, bibNumber, kitSize, offlineBatchId, correctionReason |
| `EventCollectionPoint` | `id`, `eventId`, name, address, geo, opening windows, instructions, status |
| `EventResult` | `id`, `registrationId`, sourceType, sourceReference, distanceMeters, elapsedMs, finishStatus, rank/category rank, verificationStatus, verifiedBy, verifiedAt, correctionReason |
| `EventActivityLink` | `id`, `registrationId`, existing activityId, linkType, match/verification status |
| `EventMedalAward` | `id`, `registrationId`, medalTemplateId, awardStatus, sourceResultId, awardedAt, revokedAt, reason |
| `AchievementDefinition` | `id`, key, title/i18n key, rule version, criteria, active status |
| `UserAchievement` | `id`, userId, achievementDefinitionId, sourceRegistrationId/activityId, status, awardedAt, unique award key |
| `RewardDefinition` | `id`, issuer/partnerId, title, type, value/points, terms, start/end, cap, eligibility rules, expiry |
| `RewardLedgerEntry` | `id`, userId, rewardDefinitionId, entryType (`earn`, `redeem`, `expire`, `reverse`), amount/points, sourceType/sourceId, idempotencyKey, occurredAt |
| `RewardRedemption` | `id`, userId, rewardDefinitionId, codeHash, status, reservedAt, redeemedAt, partner/actor, idempotencyKey |
| `OrganizerApiClient` | `id`, organizerId, clientId, secretHash/credential reference, scopes, status, lastUsedAt, expiresAt, rotatedAt |
| `WebhookEndpoint` | `id`, organizerId, url, secret reference, subscribed events, status, createdAt, lastSuccessAt |
| `WebhookDelivery` | `id`, endpointId, eventId, eventType, payloadVersion, status, attemptCount, nextAttemptAt, responseCode, lastError, deliveredAt |
| `EventAuditLog` | `id`, actorId, organizerId, eventId, action, targetType/targetId, reason, safe metadata, createdAt |
| `EventWaitlistEntry` (P1) | `id`, event/category/ticketType, user/contact, queuePosition, status, promotedAt, expiresAt |

### Relationships
- Organizer 1—many Events.
- Event 1—many Categories, Ticket Types, Collection Points, Results policy/medal definitions.
- EventOrder 1—many OrderLines and Registrations.
- Each EventRegistration has at most one active EventTicket and may have zero/one current official result, with result revisions preserved.
- Team 1—many EventTeamMembers; each team member points to a registration.
- Payment may have multiple attempts; a successful order payment is unique according to order/payment policy.
- RewardLedgerEntry is append-only; the displayed balance is derived or cached from ledger entries.
- WebhookDelivery records each delivery attempt for a durable event.

### Database constraints and indexes
- Unique stable IDs and unique ticket tokens/token hashes.
- Unique `(eventId, categoryId, bibNumber)` when bib is assigned, according to category rules.
- Unique idempotency keys within operation scope.
- Unique provider transaction/reference where the provider guarantees uniqueness.
- Unique active registration per participant/category only if event policy forbids duplicates; encode as policy, not a universal assumption.
- Capacity hold/sale updates must be transactional and concurrency-safe.
- Foreign keys and deletion behavior must preserve payment/audit history. Prefer status changes/soft removal over destructive deletion for financial/event records.
- Index event status/start date/location, event category availability, organizer/event registrations, order/payment references, webhook retry schedule, result verification and reward ledger user/time.
- Store money as integer minor units plus ISO currency; do not use floating point for money. For TZS, follow the project's established money conventions and document the unit.
- Use UTC timestamps for persistence plus explicit IANA timezone for display/event scheduling.
- Store precise route traces separately with strict privacy/retention rules; do not expose them in organizer APIs by default.

---

## 8. API contracts (proposed)

Exact route mounting and response conventions must be adapted to the current BFast Functions router. These contracts describe behavior, not currently deployed endpoints. All write routes require authorization, schema validation, rate limits where appropriate, and audit/idempotency behavior.

### Public/member APIs

| Method + path | Purpose | Key behavior |
|---|---|---|
| `GET /api/v1/events` | Search/list events | Filter, cursor pagination, published only by default |
| `GET /api/v1/events/{eventId}` | Event details | Public fields and live availability |
| `GET /api/v1/events/{eventId}/categories` | Categories/ticket availability | No oversell guarantee based on stale display data |
| `POST /api/v1/event-orders/quote` | Quote checkout | Server-calculated prices, quote expiry, itemized totals |
| `POST /api/v1/event-orders` | Create order and hold capacity | Idempotency key; validate roster and policy |
| `GET /api/v1/me/event-orders` | Purchaser order history | Purchaser-scoped |
| `GET /api/v1/me/event-registrations` | My registrations | Claimed user records and authorized registrations |
| `GET /api/v1/event-registrations/{id}` | Registration/ticket details | Participant/purchaser policy checked |
| `POST /api/v1/event-orders/{id}/payment-attempts` | Initiate provider payment | Server initiates; return provider instructions/status |
| `GET /api/v1/event-orders/{id}/payment-status` | Refresh payment status | Provider status lookup where supported |
| `POST /api/v1/event-registrations/{id}/claim` | Claim an unclaimed registration | Identity verification and conflict handling |
| `POST /api/v1/event-registrations/{id}/cancel` | Request cancellation | Enforce event policy and refund workflow |
| `GET /api/v1/me/achievements` | Achievements/medals | Only user's records |
| `GET /api/v1/me/rewards` | Reward balance/history | Derived from ledger |
| `POST /api/v1/me/reward-redemptions` | Redeem a reward | Atomic eligibility/cap check; idempotent |
| `POST /api/v1/events/{id}/start-run` | Link/start event activity where applicable | Reuse run recorder and enforce event rules |
| `POST /api/v1/event-activities/{id}/submit` | Submit completed tracked run | Server validates; not official result by default |

### Organizer APIs

| Method + path | Purpose | Key behavior |
|---|---|---|
| `POST /api/v1/organizers` | Request organizer capability | Reuse existing identity/business onboarding where possible |
| `GET /api/v1/organizer/events` | List organizer's events | Organizer scoped |
| `POST /api/v1/organizer/events` | Create draft | Permission and validation checks |
| `PATCH /api/v1/organizer/events/{id}` | Update draft/event | Allowed transitions; change audit |
| `POST /api/v1/organizer/events/{id}/submit` | Submit for review | Validation checklist |
| `POST /api/v1/organizer/events/{id}/publish` | Publish approved event | Only authorized state transition |
| `GET /api/v1/organizer/events/{id}/registrations` | Roster retrieval | Cursor pagination; field-level access |
| `GET /api/v1/organizer/events/{id}/registration-changes?cursor=...` | Incremental sync | Stable cursor and tombstones/status changes |
| `GET /api/v1/organizer/registrations/{id}` | Authorized entry detail | Event-scoped |
| `POST /api/v1/organizer/events/{id}/kit-collections` | Record collection | Idempotency, duplicate prevention |
| `POST /api/v1/organizer/events/{id}/bib-assignments` | Assign bib | Unique constraints and audit |
| `POST /api/v1/organizer/events/{id}/results/imports` | Submit/import results | Validate source, schema and duplicate rows |
| `POST /api/v1/organizer/events/{id}/results/{resultId}/verify` | Verify result | Authorized actor and audit reason |
| `POST /api/v1/organizer/events/{id}/cancel` | Cancel event | Participant notification/refund workflow |
| `POST /api/v1/organizer/api-clients` | Create API client | Show secret once; store hash/reference, scoped |
| `POST /api/v1/organizer/api-clients/{id}/rotate` | Rotate credential | Grace window only if safe; revoke old secret |
| `POST /api/v1/organizer/webhook-endpoints` | Configure webhook | HTTPS allowlist/SSRF controls, challenge/verification |
| `GET /api/v1/organizer/webhook-deliveries` | Delivery history | Redacted payload and retry state |
| `POST /api/v1/organizer/webhook-deliveries/{id}/retry` | Retry failed delivery | Authorized, bounded and idempotent |

### FitFlex admin APIs
Use existing admin route/ACL conventions. Capabilities: organizer verification/suspension; event moderation; event cancellation exception; payment/refund exception approval; manual payment reconciliation if retained; reward/medal rule approval; audit review. Every financial or trust-sensitive action requires actor, reason and before/after state.

### Webhook envelope
```json
{
  "id": "evtmsg_opaque_id",
  "type": "registration.paid",
  "version": "1",
  "created_at": "2026-10-21T09:00:00Z",
  "organizer_id": "org_opaque_id",
  "event_id": "event_opaque_id",
  "data": {
    "registration_id": "reg_opaque_id",
    "order_id": "order_opaque_id",
    "status": "paid",
    "category_id": "category_opaque_id",
    "updated_at": "2026-10-21T09:00:00Z"
  }
}
```
Use a signature header such as `X-FitFlex-Signature`, timestamp header and unique event ID. Exact signing algorithm and header format must be documented in the integration guide and tested. Do not include unnecessary participant PII in the webhook; the organizer can retrieve authorized fields through the API.

### Standard error envelope
```json
{
  "error": {
    "code": "capacity_unavailable",
    "message": "This ticket category is no longer available.",
    "request_id": "req_opaque_id",
    "details": {}
  }
}
```
Match the current backend's established error shape if different; do not introduce incompatible response conventions across the app.

### HTTP and integration semantics
- `200` read/update success, `201` created, `202` asynchronous payment/import accepted, `400` invalid input, `401` unauthenticated, `403` unauthorized, `404` not found/out of scope, `409` state/idempotency/capacity conflict, `422` domain validation, `429` rate limited, `5xx` transient failure.
- Use opaque stable IDs; never expose sequential internal database IDs.
- Cursor pagination, bounded page size, deterministic sorting.
- `Idempotency-Key` on create/order/payment/check-in/result/reward operations.
- Use optimistic concurrency/version field or conditional update for sensitive state transitions.
- Add contract tests for API and webhook schemas.

---

## 9. Order/payment/registration lifecycle

### Distinct state machines
Do not overload one `status` field to represent payment, order, registration, ticket, kit and result.

**Order status:** `draft`, `awaiting_payment`, `confirmed`, `partially_cancelled`, `cancelled`, `expired`, `refund_pending`, `refunded`.

**Payment attempt status:** `created`, `pending`, `succeeded`, `failed`, `cancelled`, `expired`, `reversed`, `unknown/reconciliation_required`.

**Registration status:** `draft`, `reserved`, `confirmed`, `cancelled`, `transferred`, `refunded`, `disqualified`.

**Ticket status:** `not_issued`, `active`, `revoked`, `used_for_entry` (if entry scan is distinct from kit collection).

**Kit status:** `not_ready`, `ready`, `collected`, `exception`.

**Result status:** `not_submitted`, `pending_verification`, `verified`, `rejected`, `corrected`, `disqualified`, `dnf`, `dns`.

### Happy path
1. Client requests quote; server validates event, ticket price, capacity, roster and cutoffs.
2. Client submits order with idempotency key.
3. Backend atomically creates order/lines/registrations and temporary capacity holds.
4. Backend creates payment attempt through selected provider adapter.
5. Provider returns pending/success/failure; app displays pending until server confirms.
6. Verified callback/status query is authenticated and validated against amount/currency/order/reference.
7. Payment and order transition once; registrations become confirmed; tickets are issued; outbox events are written in the same transaction or via recoverable orchestration.
8. Webhooks and participant notifications are delivered asynchronously and idempotently.
9. Expired holds are released safely; late payment events enter reconciliation and must not silently oversell or create duplicate tickets.

### Payment safety rules
- Never trust redirect/deep-link return as final payment confirmation.
- Never accept amount/currency from the client as authoritative.
- Do not treat provider timeout as failure; use `unknown/reconciliation_required` and query provider.
- A duplicate callback must be a no-op after the first successful transition.
- Confirmed payment is not edited back to pending. Refunds are separate records and transactions.
- Ticket issue, registration confirmation, inventory and ledger effects must be transactionally safe or recoverable with idempotent outbox processing.
- Store provider payloads only when required, encrypted/redacted with strict retention.
- If provider integration is not ready, use a controlled, clearly labelled manual reconciliation process and block any copy that claims instant automatic payment.

### Refund/cancellation lifecycle
1. Request cancellation/refund with reason.
2. Evaluate event policy, cutoff, event status and any applicable organizer/FitFlex approval.
3. Create refund record; mark payment/order `refund_pending` without rewriting the original payment.
4. Initiate provider refund or record authorized manual payout.
5. Confirm result and update registration/ticket/seat inventory according to event policy.
6. Record provider reference, actor, timestamps and reconciliation result.
7. Notify purchaser and participant; if a result/medal/reward is no longer eligible, issue a traceable reversal.

---

## 10. Security, privacy, safety and compliance requirements

### Authentication and authorization
- Reuse existing Firebase identity and backend token verification conventions.
- Enforce object-level authorization on every event, registration, payment, result, API client and webhook route.
- Organizer staff access is event-scoped and role-scoped.
- Admin/finance actions use existing ACL scopes and audit logging.
- Use least privilege; separate organizer operations, finance, timing and API management permissions.

### API/webhook security
- Store client secret hashes or managed secret references, never plaintext secrets.
- Support rotation/revocation; show generated secret once.
- HTTPS only; prevent SSRF in webhook URL validation (block loopback, private/link-local and cloud metadata ranges; revalidate DNS/redirects).
- Sign webhook body, include timestamp and message ID, reject replay and compare signatures in constant time.
- Retry with bounded exponential backoff; prevent unbounded retry storms.
- Rate-limit login, order creation, payment initiation, QR scans, result import and reward redemption.
- Validate MIME type, file size, schema, CSV formula injection, uploaded image metadata and file storage permissions.
- Do not leak whether a private registration exists when caller lacks access.

### Payment and fraud
- Server-side price calculation; immutable price snapshots; provider verification and reconciliation.
- Unique constraints for provider references and idempotency keys.
- Protect against race-condition overselling and duplicate refunds.
- Monitor unusual bulk registration, rapid refund patterns, reward farming and repeated GPS anomalies.
- Avoid hard-coded payment provider assumptions; secrets in environment/secret manager.
- Do not store card data; follow provider and applicable payment compliance requirements.

### Participant privacy
- Data minimization: collect only data needed for event operations, safety and legally required reporting.
- Do not expose a user's private GPS route to organizers by default.
- Explicitly disclose which participant data is shared with an event organizer and why.
- Provide participant claim, correction and support process for registrations made by others.
- Restrict emergency contact data and never expose it in general roster exports or webhooks unless necessary and authorized.
- Provide retention/deletion policy for participant data, route traces, documents, logs and webhook payloads; preserve financial/audit records as required.
- Encrypt data in transit and at rest according to platform capabilities.
- Assess applicable Tanzania privacy/data protection obligations and cross-border transfer rules with qualified counsel before launch; this specification is not legal advice.

### Running safety and truthful status
- Explain location permission use and battery implications; do not require location permission just to buy a ticket.
- Provide pause/stop controls, signal-loss handling and clear unsaved-run recovery using existing run recorder behavior.
- Do not describe a GPS run as an official race result unless verified by an approved source.
- Make event route, cutoff, eligibility and organizer responsibility clear.
- Include participant-facing disclaimers and emergency contact instructions supplied/approved by the organizer; do not claim FitFlex provides emergency response.
- For minors or age-restricted categories, implement event-specific guardian/eligibility requirements and legal review before enabling.

### Audit and observability
Audit event publication/changes, organizer verification, roster exports, staff access, participant edits, bib changes, kit corrections, result imports/corrections, payment decisions, refunds, API credential changes, webhook configuration and reward ledger reversals. Logs must have request IDs and safe error context without tokens, secrets, payment credentials or unnecessary PII.

---

## 11. Non-functional requirements

- **Reliability:** no duplicate charge confirmation, registration, ticket, kit collection, result award or reward ledger entry under retries.
- **Consistency:** inventory, order and payment transitions use transactions/conditional updates and database constraints.
- **Performance:** event list should be paginated; no full-table scans for high-volume organizer roster access. Define and measure launch SLOs after baseline load testing.
- **Availability:** member browsing may degrade gracefully; payment confirmation and financial actions must fail closed and reconcile.
- **Connectivity:** preserve safe offline scanning workflows with provisional states and conflict resolution.
- **Accessibility:** readable type, sufficient contrast, semantic labels, keyboard support in portal and accessible error states.
- **Localization:** EN/SW strings, timezone-aware dates, TZS formatting, pluralization and local phone formatting.
- **Maintainability:** domain services, clear migrations, documented state machines, OpenAPI contracts, feature flags where appropriate and focused tests.
- **Portability:** provider adapters and event types should avoid hard-coding one payment provider or one event format.
- **Data integrity:** append-only audit/reward/payment history where applicable; soft-delete or status-change financial records.
- **Backup/recovery:** migration rollback strategy, backup before production migrations, and recovery steps for webhook backlog/payment reconciliation.

---

## 12. User stories and acceptance criteria

### Epic A — Discover events
**US-EVT-01:** As a runner, I want to browse upcoming events so I can find a suitable race.  
**Acceptance:** Given published events exist, when I open Events, then I see only public events that are eligible for discovery, with date, location, event type, available categories and starting price; cancelled/unpublished events are excluded from the default list.

**US-EVT-02:** As a runner, I want to filter by distance, type, location, date and price.  
**Acceptance:** Filters combine correctly, survive pagination, and show a useful empty state when no events match.

**US-EVT-03:** As a runner, I want full event details and clear rules before registering.  
**Acceptance:** The detail page shows organizer, date/timezone, categories, prices, deadlines, capacity state, kit collection, inclusions, eligibility and refund/cancellation terms; unavailable or expired categories cannot be selected.

### Epic B — Organizer onboarding and publishing
**US-ORG-01:** As an organizer, I want to request an organizer account and verify my organization.  
**Acceptance:** Unverified organizers cannot publish; admins can approve/reject with reason; all decisions are audited.

**US-ORG-02:** As an organizer, I want to create an event draft and submit it for review.  
**Acceptance:** Required fields are validated; only an authorized state transition can publish; drafts are not publicly discoverable.

**US-ORG-03:** As an organizer, I want to update event details and notify participants when important information changes.  
**Acceptance:** Material changes create audit entries and trigger idempotent notifications; changes that affect paid entries invoke the configured consent/refund policy.

### Epic C — Individual, group and corporate registration
**US-REG-01:** As a runner, I want to register myself.  
**Acceptance:** The system validates eligibility and availability, creates one registration and after verified payment issues one ticket.

**US-REG-02:** As a purchaser, I want to register other people.  
**Acceptance:** Each participant has an independent registration and ticket; purchaser and participant identity remain distinct; claim/linking requires verification.

**US-REG-03:** As a group captain, I want to buy several entries in one checkout.  
**Acceptance:** One order can contain multiple participants, but each has a unique registration/ticket; partial validation errors are clear; no capacity oversell occurs under concurrent requests.

**US-REG-04:** As a corporate coordinator, I want to register a team in bulk.  
**Acceptance:** Roster upload/entry validates each row, flags duplicates and missing fields, supports approved company references/discounts, and creates participant-level records only after confirmation.

**US-REG-05:** As a purchaser, I want to recover from a failed or pending payment.  
**Acceptance:** Pending is not shown as paid; retry does not create duplicate orders or charges; final status comes from backend/provider verification.

### Epic D — Payments, refunds and reconciliation
**US-PAY-01:** As a purchaser, I want to see the full amount before paying.  
**Acceptance:** Server-calculated itemized totals include currency, ticket prices, discounts and fees; client-submitted prices are ignored.

**US-PAY-02:** As FitFlex finance, I want payment confirmation to be idempotent and auditable.  
**Acceptance:** Duplicate callbacks produce one paid transition, one registration confirmation and one ticket; mismatched amount/currency/reference is rejected and logged safely.

**US-PAY-03:** As a purchaser, I want a refund request handled transparently.  
**Acceptance:** Refund follows the configured policy, remains a separate record, has a traceable status and notifies the purchaser on each meaningful transition.

### Epic E — Tickets, kits and organizer operations
**US-KIT-01:** As a runner, I want an individual QR ticket.  
**Acceptance:** QR contains no unnecessary PII, maps to one registration and can be revoked if the registration is cancelled/refunded.

**US-KIT-02:** As kit staff, I want to scan and record kit handover.  
**Acceptance:** Authorized staff can scan only assigned events; the first collection succeeds; repeated scans show already collected and cannot create another handover unless an authorized override is recorded.

**US-KIT-03:** As an organizer, I want a current roster through dashboard/API.  
**Acceptance:** Roster includes only permitted fields, supports pagination/cursor sync, and changes become available after committed transactions.

### Epic F — API and webhooks
**US-API-01:** As an organizer integration, I want instant registration updates.  
**Acceptance:** A committed registration/payment change creates a durable outbox event; delivery is signed, retried, deduplicable and visible in delivery logs.

**US-API-02:** As an organizer admin, I want to rotate/revoke credentials.  
**Acceptance:** Secret is shown once, old credentials stop working after revocation/rotation policy, scopes are enforced and all actions are audited.

**US-API-03:** As a timing partner, I want to submit results for assigned events.  
**Acceptance:** Unauthorized event submissions are rejected; duplicate imports are idempotent; malformed rows are reported without silently corrupting valid records.

### Epic G — Runs, results, medals and rewards
**US-RUN-01:** As a participant, I want to start a supported run from my event.  
**Acceptance:** The app reuses the existing recorder; location permission is optional for ticketing; interrupted runs recover according to existing behavior; saved GPS activity is not automatically labelled official.

**US-RUN-02:** As a participant, I want to see whether my result is verified.  
**Acceptance:** Result shows source and status; only authorized organizer/timing source can mark official; corrected results preserve audit history.

**US-RWD-01:** As a finisher, I want to receive a digital medal.  
**Acceptance:** Medal is awarded only after configured completion verification; duplicate result imports do not duplicate awards; corrected/disqualified results create traceable reversal.

**US-RWD-02:** As a participant, I want to earn and redeem a reward.  
**Acceptance:** Reward rules, expiry and terms are visible; redemption is atomic; a concurrent duplicate redemption cannot exceed inventory or spend the same reward twice.

### Epic H — Security, localization and support
**US-SEC-01:** As a participant, I want my personal data visible only to authorized parties.  
**Acceptance:** Object-level authorization tests cover other users, other organizers and unrelated events; roster exports/webhooks exclude fields outside the integration scope.

**US-I18N-01:** As a user, I want to use the feature in English or Swahili.  
**Acceptance:** All new user-facing strings use existing localization files and no critical error/checkout state is untranslated.

---

## 13. QA strategy and test matrix

### Backend tests
- Unit tests for event/registration/payment/result/reward state transitions.
- PostgreSQL integration tests for concurrent capacity holds, unique bibs, duplicate payment references, conditional updates and reward redemption.
- API authorization tests across member, purchaser, organizer owner, event staff, corporate HR, timing partner and admin.
- Provider adapter contract tests with sandbox/test doubles; never rely only on mocked client redirect.
- Webhook signature, replay, duplicate delivery, timeout, retry, dead-letter and endpoint-disable tests.
- Migration up/down or forward-recovery checks following repository conventions.
- Idempotency tests for all write operations.
- Data export, PII minimization and audit log tests.

### Mobile tests
- Widget tests for discovery, filters, registration roster, checkout states, tickets, kit status, result provenance, medals and rewards.
- API client error/retry tests.
- Run-recorder integration and permission-denied tests.
- Offline/weak-network handling.
- English/Swahili localization and TZS formatting.
- QR display and share/deep-link behavior.

### Portal tests
- Playwright end-to-end: organizer onboarding → event draft → approval → publish → registration → roster sync → kit scan → result import → medal/reward.
- Role isolation: organizer A cannot access organizer B; event staff cannot access finance/API secrets.
- Webhook secret create/rotate/revoke and delivery retry.
- Corporate roster upload with valid, invalid and duplicate rows.
- Keyboard navigation, responsive layout and empty/error/loading states.

### Required end-to-end scenarios
1. Individual registration paid successfully.
2. Register for another participant and claim ticket.
3. Group checkout with purchaser included.
4. Corporate bulk registration with row errors.
5. Two buyers competing for the final ticket.
6. Payment callback arrives twice.
7. Payment succeeds after client timeout.
8. Payment callback amount/currency mismatch.
9. Order expires while payment remains unknown.
10. Event cancellation with paid registrations and refunds.
11. QR screenshot replay / repeated kit collection.
12. Offline kit scan syncs and detects duplicate.
13. Webhook endpoint times out then recovers.
14. Webhook signature invalid or replayed.
15. Duplicate result import.
16. GPS run submitted but not officially verified.
17. Verified result awards one medal and reward.
18. Corrected result reverses reward without erasing ledger history.
19. Organizer attempts cross-event roster access.
20. Reward double redemption under concurrency.

---

## 14. Analytics and launch metrics

Capture events with minimal personal data and consistent names:
- `event_list_viewed`, `event_detail_viewed`, `event_saved`
- `registration_started`, `registration_roster_validated`, `checkout_quote_created`
- `order_created`, `payment_initiated`, `payment_confirmed`, `payment_failed`, `refund_requested`, `refund_completed`
- `ticket_issued`, `kit_collected`, `bib_assigned`
- `run_started`, `run_saved`, `result_submitted`, `result_verified`
- `medal_awarded`, `reward_earned`, `reward_redeemed`
- `organizer_event_submitted`, `event_published`, `webhook_delivery_failed`

### Launch dashboard
- Event page views → registration starts → orders → verified paid registrations conversion.
- Payment success/failure/pending/unknown rates.
- Registration completion and abandonment by mode.
- Number of participants per group/corporate order.
- Organizer roster sync latency and webhook delivery success.
- Kit collection completion and exception rate.
- Result verification latency.
- Medal/reward duplicate-prevention incidents.
- Refund rate, dispute rate and organizer payout reconciliation status.
- App crash/API error rate and support tickets.

Set numeric SLO/targets only after baseline and pilot evidence. Do not invent conversion targets without a validated baseline.

---

## 15. Release gates and definition of done

A feature is not done merely because a screen exists. Each phase must include backend validation, authorization, persistence, tests, localization, error states and documentation.

### Production launch gates
- [ ] Repository reuse/gap report completed and approved.
- [ ] Data model/migrations reviewed; backup and rollback/recovery plan exists.
- [ ] Organizer verification and event moderation work end-to-end.
- [ ] All registration modes create independent participant records and tickets.
- [ ] Capacity concurrency tests prove no overselling.
- [ ] Payment provider selected, sandbox tested, signature verification implemented, status reconciliation and refunds tested; otherwise controlled manual payment is clearly labelled and instant-payment claims are disabled.
- [ ] Organizer API scopes, webhook signatures, retries, idempotency, rotation and audit logging tested.
- [ ] Kit collection duplicate prevention and offline reconciliation tested.
- [ ] Result provenance and official verification rules enforced.
- [ ] Reward ledger and reversal rules tested.
- [ ] English/Swahili strings complete and design tokens reused.
- [ ] Security/privacy review completed, including participant data sharing and route trace handling.
- [ ] Portal E2E and backend integration tests pass on clean test database.
- [ ] Monitoring, support ownership, incident response and reconciliation runbook prepared.
- [ ] Pilot organizer and pilot event run through the full workflow before broad release.

---

## 16. Phased Claude Code implementation plan

**Working rule for every phase:** Claude Code must inspect the current repository before coding, reuse existing architecture/design tokens, report assumptions and touched files, implement only the named phase, run relevant tests, and stop with a concise report. Do not let it implement every phase in one unreviewed change.

### Phase 0 — Repository reconnaissance and implementation plan (no production code changes)
**Goal:** produce a factual reuse map and gap report.

**Prompt to Claude Code:**
> You are the staff engineer for FitFlex Africa. Before changing code, inspect the existing `fitflex-mobile`, `fitflex-portal`, and `fitflex-functions` repositories. Read relevant README/docs, router/navigation, Firebase auth and backend token verification, shared API client, mobile and portal design tokens, i18n, portal layouts/components, activity/run recorder, challenge/reward implementation, vendor/organizer onboarding patterns, corporate/B2B models, payment request/provider/webhook/refund flows, route registration, database migrations/store conventions and tests. Do not assume that a provider integration exists: prove its current status from code and docs. Produce `docs/marathon-reuse-map.md` with (1) current capability and file references, (2) reusable components/services, (3) missing capabilities, (4) risks/unknowns, (5) proposed migrations/routes/screens, (6) payment provider prerequisites, (7) design token/i18n plan, (8) test plan and (9) smallest safe implementation sequence. Do not modify application code or migrations in this phase. If a source is inaccessible, mark it uninspected rather than guessing.

**Exit criteria:** repo/file evidence is documented; unknowns are explicit; no app code changed.

### Phase 1 — Domain model, state machines and database foundation
**Goal:** add minimal safe persistence and domain contracts.

**Prompt:**
> Implement only the reviewed Phase 1 design for the FitFlex Marathon module. Follow the existing JavaScript ES module/service conventions, PostgreSQL/Knex migration naming, ID prefixes, timestamp and CHECK/index conventions, test patterns and current route architecture. Before writing migrations, compare the proposed entities with existing tables and reuse existing identity/organization/activity/payment models where appropriate. Add the minimum domain tables and constraints for organizers/events/categories/ticket types/orders/order lines/registrations/payments/refunds/tickets/kit collection/results/medals/reward ledger/API clients/webhooks/audit, but split migrations sensibly and avoid duplicating existing tables. Implement pure state-transition/domain validation functions and PostgreSQL integration tests for invariants. Do not yet build the full UI or enable live payments. Include forward recovery/rollback notes, indexes, uniqueness, foreign-key behavior, and concurrency-safe capacity primitives. Run relevant tests and report changed files, migration commands, test output and open questions.

**Exit criteria:** migrations and core domain tests pass; no public sale/payment enabled.

### Phase 2 — Organizer onboarding, event management and member discovery
**Goal:** create events from the portal and browse them in the mobile app.

**Prompt:**
> Implement organizer capability using existing FitFlex account/business/vendor/organization onboarding and portal access controls; do not create a parallel auth system. Add organizer verification states, event draft/edit/submit/review/publish lifecycle, category/ticket configuration, capacity and event details. Add member event discovery/detail APIs and Flutter screens using existing `GoRouter`, `ApiClient`, `FFTokens`, portal `@theme`, reusable components and EN/SW localization. Follow existing portal patterns and add Playwright/widget/API tests. Keep unpublished events private and enforce state transitions and organizer ownership server-side. Do not implement payment confirmation by assuming a provider exists. Report all touched files and test evidence.

**Exit criteria:** verified organizer can publish an approved event; members can browse it; unpublished events remain private.

### Phase 3 — All registration modes and checkout order foundation
**Goal:** individual, other-person, group, club/team and corporate registration.

**Prompt:**
> Implement participant registration and checkout order creation for self, register-for-others, group/team and corporate bulk registration. One order must contain multiple independent participant registrations; each registration gets its own ID and eventual ticket. Reuse existing corporate organization/beneficiary patterns where suitable, but do not alter existing corporate flows without tests. Add roster forms/import validation, participant claim/link flow, consent/authorization capture, eligibility checks, server-side quote and price snapshots, idempotency keys, expiring capacity holds, and concurrency-safe inventory updates. Add tests for duplicate entries, mixed purchaser/participants, invalid bulk rows, final-slot contention and retry behavior. Do not mark any order paid or issue active tickets yet. Reuse design system and localization.

**Exit criteria:** valid order/participant records are created safely, capacity does not oversell, and no paid tickets can be forged.

### Phase 4 — Payment provider adapter, payment lifecycle, refunds and reconciliation
**Goal:** verified payment confirmation before ticket issuance.

**Prompt:**
> First inspect the current provider integration and its status. Implement a provider adapter only for the provider selected and configured by the project owner; do not invent endpoints, credentials or callback semantics. If provider choice or sandbox credentials are unavailable, implement and test the provider-neutral lifecycle plus an explicitly labelled, audited manual reconciliation fallback, and leave live automatic payment disabled. Server must initiate charges, verify callback signatures/status, compare amount/currency/order/reference, handle pending/unknown/late callbacks, enforce idempotency, create durable outbox events, and separate refunds from payment status. Add tests for duplicate callbacks, bad signature, amount mismatch, timeout, late success, cancellation, refund and reconciliation. Never trust client redirects. Document environment variables without exposing secrets.

**Exit criteria:** paid status is server-authoritative; only verified paid/approved complimentary entries can issue active tickets; provider readiness is explicitly recorded.

### Phase 5 — Tickets, QR kit collection, organizer API and webhooks
**Goal:** live participant synchronization and event-day operations.

**Prompt:**
> Implement per-participant QR tickets, organizer roster/dashboard, kit collection and bib management, plus the secure versioned organizer API and webhook system. Reuse existing QR scanning and portal table/form patterns. Use event-scoped authorization, minimum participant fields, cursor-based roster sync, durable outbox, signed timestamped webhooks, replay protection, idempotent consumers, bounded retries, delivery logs, secret rotation/revocation and rate limits. Implement offline scanning only with provisional states and safe synchronization/duplicate resolution. Validate webhook URLs against SSRF and private-network access. Publish OpenAPI and webhook contract docs. Add API/portal/mobile tests for duplicate scans, offline sync, cross-organizer access, webhook retries and secret revocation.

**Exit criteria:** organizers can retrieve authorized registrations promptly and manage kits without duplicate collection or data leakage.

### Phase 6 — Run linking, result import, medals and rewards
**Goal:** connect event participation to the FitFlex activity ecosystem.

**Prompt:**
> Extend the existing run recorder/activity model; do not create a parallel GPS recorder. Link supported event runs to registrations while keeping activity provenance separate from official race result verification. Add result import and organizer/timing-provider verification, result correction history, DNF/DNS/disqualification, medal rules, FitFlex achievements, append-only reward ledger, atomic redemption and traceable reversals. GPS-submitted activity must not become an official in-person result by default. Rewards must be idempotent and funded/configured, with visible terms and expiry. Add tests for duplicate result import, unauthorized verification, personal-best comparability, duplicate awards, reward double redemption and reversal.

**Exit criteria:** only configured verified completion earns a finisher medal; reward ledger remains consistent under retries/corrections.

### Phase 7 — Hardening, analytics, pilot and release
**Goal:** production readiness.

**Prompt:**
> Run a marathon-specific production-readiness review across mobile, portal and backend. Inspect the complete diff and migrations; run backend tests on a clean database, portal build/lint/E2E, Flutter analyze/tests/build as supported. Test security/authorization, privacy, provider callbacks, refunds, race-capacity concurrency, webhook retry/replay, offline kit collection, localization, accessibility and low-connectivity states. Add minimal telemetry and dashboards for funnel, payment reconciliation, webhook latency, kit collection, result verification, rewards and errors. Produce `docs/marathon-go-live-checklist.md`, deployment/rollback/recovery instructions, support playbook, data retention notes and explicit PASS/OPEN/N/A status with evidence. Do not mark a gate PASS without test/log/source evidence. Do not deploy or change production configuration without explicit approval.

**Exit criteria:** all launch-critical gates pass or are explicitly blocked with an owner and safe fallback.

### Claude Code execution protocol
At the end of every phase, require:
1. Summary of behavior implemented.
2. Files changed and why.
3. Migrations added and commands to apply/test them.
4. Tests run with exact results.
5. Security/privacy and backward-compatibility notes.
6. Known gaps and decisions needed.
7. A proposed next phase, but no implementation of that phase until explicitly requested.

---

## 17. Decisions still requiring owner/provider confirmation

The product decisions supplied by the owner are locked. The following are implementation dependencies, not requests to reconsider the product scope:
1. Which payment provider will support event payments/refunds in production, and what sandbox credentials/docs are available?
2. Who is merchant of record and who bears refunds, chargebacks, taxes and settlement obligations?
3. Is manual payment confirmation allowed as a controlled fallback at launch, and which staff roles may approve it?
4. Organizer verification evidence and approval SLA.
5. Ticket fee/commission and organizer payout schedule.
6. Data retention and legal/privacy review for participant and emergency-contact data.
7. Which timing providers will be supported first; whether results are CSV upload, API integration or both.
8. Reward funding source and partner redemption terms.
9. Offline scanning constraints and device management for event-day staff.

No undocumented assumption should be silently hard-coded. Represent unresolved choices as configuration or an explicit launch blocker.

---

## 18. Final product recommendation

Build the Marathon module as a connected FitFlex capability, not a separate app. Reuse the existing Flutter run recorder and design system; extend the existing operator portal; use PostgreSQL-backed domain services and migrations; model orders separately from participants; make organizer API/webhooks first-class; and treat payment verification, privacy, concurrency and auditability as launch-critical.

The launch promise should be simple and credible: **discover an event, register individually or together, get a valid ticket, collect your kit, and preserve verified achievements in FitFlex.** The organizer promise is equally important: **one reliable roster, timely updates, secure integration and an auditable event-day workflow.**
