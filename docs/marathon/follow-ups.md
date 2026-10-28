# Marathon module — carried follow-ups by slice

Items raised in reviews that belong to a later slice. Fixed-in-place items are not listed. Source: security review of fitflex-functions#242 (S1), 2026-10-22.

## S2 — organizer + discovery
- Widen `invitation_org_type_check` (`20261106090000-identity-invitations.cjs`) and `org_membership_one_org_check` / `_role_check` for `organizer` memberships (D3).
- Organizer/event write routes must strip `status`, `publishedAt`, `cancelledAt`, `version`, `slug`, `termsSnapshot`, `refundPolicySnapshot` (the store refuses frozen fields after S1 fixes; routes should not even forward them).
- `transitionEvent → published` requires an active organizer whose KYC case is approved.
- Security review of the new `event_organizer` / `organizer_staff` user types (touches `src/auth/*`; rule 6 callout).

## S3 — registration & orders
- Routes never forward `holdTtlMinutes`, `feeRule`, per-line discounts or `participantUserId` from the client (store already ignores them after S1 fixes; keep it that way).
- Discounts/vouchers: server-side evaluation only.
- Corporate bulk orders rely on `(organizationId, idempotencyKey)` scoping; confirm coordinator identity is bound to the organization before accepting.
- `reason` on cancellation constrained to the closed set.

## S4 — payments
- Late confirmation after hold expiry: implement a `rehold` primitive (cycle+1, conditional capacity) with `capacity_unavailable` → refund path; manual-confirmation route must surface the refusal, not swallow it.
- `commitOrder` driven only by a `succeeded` `EventPayment` whose `amountTzs`/`currency` equal the order's.
- `EventPayment.rawRedacted`: allowlist redactor before anything writes it.
- Extend `Refund.kind` with `event_order`.

## S5 — tickets, kit, API, webhooks
- Webhook fan-out strictly on `WebhookEndpoint.organizerId = OutboxEvent.organizerId` (no DB guard).
- SSRF validation of `WebhookEndpoint.url` (today only `https://` is checked by CHECK).
- Per-attempt delivery log if PRD §7 "records each delivery attempt" is to be met (`WebhookDelivery` is one mutable row per endpoint × event); decide whether to add `WebhookDeliveryAttempt`.
- Decide whether a `registration.reserved` outbox event is wanted (only `created` on commit and `cancelled` on release exist).
- Roster API/export: exclude `emergencyContact` by default; field minimisation by scope.

## S6 — runs, results, rewards
- `EventActivityLink`: service must check `Activity.userId` equals the registration's participant.
- Account deletion for users with `EventOrganizer.ownerUserId` / `RewardLedgerEntry.userId` (RESTRICT) needs a defined path.

## Privacy / retention (before organizer roster API)
- `EventRegistration` keeps name/phone/email/DOB/gender/emergency contact after `purchaserUserId`/`participantUserId` are nulled on user deletion; define retention and anonymisation.

## Ops
- Append-only triggers guard against application bugs only; a DB role can `DISABLE TRIGGER`. Note in the runbook.
- `event-hold-expiry` appears in the ops job list while `EVENTS_MODULE` is off (cosmetic; runs record `skipped: flag_off`).

## From the S2 backend security review (functions#249, 2026-10-22) — carried
- L6: validate `Event.timezone` against the published `GET /events/options.timezones` list, not just Intl.
- L9: the KYC → organizer-status hook is fail-open on a DB error; add a periodic re-derivation sweep (or derive on `organizerForUser`).
- L10: no per-organizer cap on staff invitations (same as vendors): an approved organizer can trigger unlimited SMS/email sends. Platform-wide fix with the invitation limits.
- Legal: organizers sign only the KYC consent; no organizer partner terms exist, and event-level terms/refund policy are organizer free text with no FitFlex baseline. Needs counsel before any public event.
- Pre-existing English-only server pushes now reaching organizers: KYC status notices and document-expiry reminders (`partner-kyc-service.mjs`). Platform-wide bilingual follow-up.

## From the S3 backend security review (functions#265, 2026-10-27) — carried
- L3: roster and order lists silently stop at 2,000 rows; paginate in SQL before large events.
- L5: preview-token redaction via overwriting `req.originalUrl` may be too late if a platform logger runs first; check platform logs for tokens in paths.
- L6: team join by code inside quote/order skips the lookup limiter (40-bit code, impractical to guess); share the limiter.
- L10: migration FK `ON DELETE SET NULL ("teamId")` column-list form needs PostgreSQL 15+; CI runs 16; confirm production version before promotion.
- L11: S3 migration `down` drops consent evidence columns; treat down as dev-only once real registrations exist.
- Owner decisions taken as defaults 2026-10-27: purchaser sees a masked view after the participant claims (M5); order term is "oda" (glossary), not "agizo".
- Swahili still needing native review: consent texts, "kituo cha gharama" (cost centre), "namba ya kumbukumbu", "orodha" (roster), server push titles.

## From the S4 reviews (functions#270, portal#161, mobile#240; 2026-10-28) — carried
- L6: manual-pay holds can hoard inventory (48 h hold with a bogus reference); cap concurrent unpaid places per user.
- Organizer settlement statements still not built (S4 left the data seam only); payout timing direction D28 awaits owner confirmation.
- Refunds are paid by hand; provider refunds not built.
- `EVENT_TICKET_SECRET` (32+ chars), `EVENT_TICKET_KEY_ID`, `EVENT_TICKET_SECRET_PREVIOUS` must be added to `docs/server-env-checklist.md` before payments are enabled.
- Migration `20270110091100` sorts before an already-merged `20270111...` migration: confirm RC/CI apply it in order.
- Pre-existing portal helpers `eventDateTime`/`eventTime` used a 24-hour clock in Swahili (fixed in S4 portal round); check other portal helpers.
- Native Swahili review: "Uthibitisho wa mkono", refund and unfulfilled-payment wording, payment rejection labels.
- Shop bookkeeping has the same income-booking flaw for shop payment requests (finance-service); out of scope for events.
