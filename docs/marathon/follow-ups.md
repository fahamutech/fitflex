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
