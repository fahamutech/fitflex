# Events S4: payments, ticket issuance and event refunds. Design spec

**Status:** Draft for owner review · **Date:** 2026-10-28 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 4 of `docs/marathon/reuse-map.md` §9 (PRD §16 Phase 4)
**Repos:** `fitflex-functions` (routes and money paths in §3), `fitflexmobile` (member pay, tickets, cancel and refund, claim landing; §5), `fitflex-portal` (admin payments and refunds, admin event order panel, organizer finance, corporate payment; §6)
**Ships:** dormant. Server `EVENTS_PAYMENTS_MANUAL` off (needs `EVENTS_MODULE` and `EVENTS_REGISTRATION`); `EVENTS_PAYMENTS_TUNZAA` off and stays off until the owner confirms Tunzaa as the launch provider (D1). With both off, `GET /events/options.payment` stays `'none'` and S3 behaviour is byte-for-byte unchanged (the order page keeps its "coming in the next app update" placeholder).
**Binding inputs:** `docs/marathon/decisions.md` D1 (manual confirmation first, Tunzaa extension behind its own flag), D2 (FitFlex collects, organizers paid weekly through the partner-statement workflow, commission per organizer), D4 (whole TZS integers + `currency`), D5 (`{ error: code, ...extra }`), D6 (approvers = existing admin scopes + `MONEY_SECOND_APPROVER`), D12 (organizer cannot cancel once confirmed registrations exist; admin cancels), D14 (guest "self" place claimed after verification), D15 (claim invitations on payment confirmation), D16/D17, D18 (placing a corporate order needs a billing role), D21 (no member fee unless `EVENTS_FEE_RULE`), D22 ("tiketi"); PRD v1.0 §5.4 PAY-001..014, §5.5 KIT-001 and KIT-010 (ticket token and cancellation communications only; kit scanning is S5), §9 (state machines, happy path, payment safety rules, refund lifecycle), §10 payment and fraud, §12 Epic D, §13 scenarios 6 to 10; `docs/marathon/reuse-map.md` §1.1, §2, §3 (G1), §6; `docs/marathon/follow-ups.md` (S4 section and S3 carried items); `docs/marathon/s3-asbuilt.md` (what S3 shipped, including the `inviteClaims` seam and the missing Android App Link); S3 spec `docs/design/events-s3-registration-and-orders.md` §3.15 and §5.7; S2 spec (§14 conventions).
**Not in scope (later slices):** kit scanning, bibs, organizer roster API and webhooks (S5); runs, results, medals (S6); organizer payout statements (settlement slice; S4 leaves the data seam, §3.14); provider refunds, chargeback handling and automated provider statement reconciliation (not built, §3.11); complimentary or sponsored entries with an approver (PAY-014; free-priced tickets are handled, §3.4.4, approved comps are not); participant transfer (REG-013); deferral on a date change (S4 does not refund on a date change).

---

## 1. What exists today (and what this reuses)

| Need | Reused | Notes |
|---|---|---|
| Payment record the admins already work | `PaymentRequest` (`memberId`, `amountTzs`, `currency`, `status` pending/approved/rejected/cancelled, `provider`, `reference`, `memberReference`, `memberReferenceKey`, `payerPhone`, `verifiedBy/At`, `changeRequested*`, `decidedBy/At`, `note`) with `eventOrderId` already added by `20270110090300-events-payments.cjs` | The event order is one more product on the table the admin Payments page already lists. **`payment_requests` in `src/infra/knex-store.mjs` `ALLOWED_FIELDS` does not list `eventOrderId`: writes through the collection API silently drop it. Add it (§8, item 2).** |
| Member-typed transaction ID and payer phone | `src/shared/manual-payment.mjs` (`normalizePaymentReference`, `normalizePayerPhone`, `referenceKey`, `REFERENCE_HOLDING_STATUSES`, `DUPLICATE_ATTEMPT_LIMIT`), `payment-reference-store.mjs` (`holders`, `duplicateAttemptsSince`), the partial unique index on `memberReferenceKey` for pending/approved | One transaction ID confirms one payment, across every product (shop, pass, event). Same validators, same 429 `too_many_attempts` and 409 `payment_reference_duplicate`. |
| Lipa Namba instructions | `GET /payments/options` `manual` block (`enabled`, `lipaNamba`, `accountName`, `network`, `instructions {en, sw}`, `referenceRequired`, `payerPhoneRequired`), served only while `MANUAL_PAY_INSTRUCTIONS` is on and details are configured; mobile `ManualPayment.fromOptions`, `ManualPaymentSteps`, `ManualPaymentFields`, `TransactionIdField`, `manualPayCopier`, `keepTogether` | The event payment page renders these unchanged; only the surrounding copy is new (labelled-manual copy rules, §5.11). |
| Admin decision | `admin-payment-service` `decide`, `update`, `verify`, `requestChange`, `confirmChange`, `cancelChange`; `MONEY_SECOND_APPROVER`; `updateIf` compare-and-set; `onOrderPayment` / `beforeOrderPayment` hooks (shop) | Event orders get their own pair of hooks, wired in `src/bootstrap/services.mjs` (§3.7). The hooks run **after** the conditional write of the request and are idempotent, the pattern the shop uses (`applyPaymentToOrder`, `repairOrderPayment`). |
| Product typing | `src/shared/payment-product.mjs` (`PRODUCT_TYPES`, `productTypeOfPayment`, `MEMBER_ACCESS_PRODUCTS`) | Add `EVENT_ORDER`; **not** added to `MEMBER_ACCESS_PRODUCTS` (a pending event payment must never hold the member's single "pending pass/plan payment" slot or show as one). |
| Mobile money | `mobile-money-service` (`PAYABLE`, `pay`, `refresh`, `settle`, `handleCallback`), `tunzaa.mjs` (`initiatePayment`, `checkStatus`, `verifySignature`, `amountToTzs`, `maybeSent`), `POST /me/payments/:id/mobile-money[/refresh]`, `POST /webhooks/tunzaa`, mobile `offerMobileMoney`, `MobileMoneyPayPanel`, `MomoStage`, `momoOffers` | Callback-as-trigger plus status re-read is kept. Dormant behind `EVENTS_PAYMENTS_TUNZAA` (§3.11). |
| Refunds | `Refund` table and `refund-service` (`raise`, `decide`, `markPaid`, `liveFor`, `adminList`, `onPaid` hook), `/me/refunds`, `/admin/refunds[/:id/decision|paid]`, two-person rules under `MONEY_SECOND_APPROVER` (`cannot_approve_own_request`, `cannot_pay_own_approval`, `cannot_pay_own_request`) | New `kind = 'event_order'` with its own source columns (§3.12). Money still leaves by hand; "paid" records the payout reference. |
| Inventory and order store | `event-store-pg.mjs` (`commitOrder`, `releaseOrder`, `releaseRegistration`, `expireHolds`, `appendOutbox`, `movementKeyOf`, hooks), `events-lifecycle.mjs` machines | `commitOrder` runs its own transaction and cannot be composed into a larger one; S4 adds composable primitives that take a caller transaction (`confirmPaidOrder`, `rehold`, `cancelPaidRegistration`, §3.8, §3.9, §3.12). |
| Claim links | `inviteClaims({ orderId })` (S3 seam, refuses unless the order is `confirmed`), claim token hash, `/event-claim/#<token>`, `EventClaimPage`, `KeptLinkToken` | Called after the confirmation commit (§3.10). The Android App Link for `/event-claim/*` ships with this slice. |
| Settlement | `partner-statement-workflow.mjs`, `EventOrganizer.commissionPct` (whole percent) | Data seam only (§3.14). |
| Org billing payment details | `B2BPaymentInstruction` (bank and Lipa Namba, admin-maintained with a second-admin confirm), `/b2b/organizations/:id/payment-notices` pattern, `billing.pay` permission | The corporate event payment shows these details and records a payment notice shaped like a B2B one (§3.4.3). |
| Notifications | `notify`, `bilingualNotify` / `localeOf` (S3 `data.titleEn/bodyEn/titleSw/bodySw`), idempotent `id` | All S4 messages are bilingual this way. The existing `refund-service.tell` is English only; event refunds get bilingual copy (§3.16). |
| QR rendering | mobile `FFQrCode` (fixed `qrInk`/`qrBackground`, dark on white) | Ticket detail. The gym QR (`qr-token.mjs`, 60 s time bucket, replayable about two minutes) is **not** reused (R8 in the reuse map). |
| Portal shells | `DataTable`, `Dialog`, `ConfirmDialog`, `MetricCard`, `Badge`, `Alert`, `Segmented`, `Field`, `Select`; `money-approval.ts` (`PAYMENT_STAGE_TONE`, `errorCode`, `expectedAmount`, `FLAG_ON_ONLY_ERRORS`), `member-reference.tsx` (`ApproveWithReferenceDialog`, `TransactionIdCell`), `event-orders-table.tsx`, `event-corporate-order.tsx`, `event-lifecycle.tsx` (`LifecycleDialogs`) | Extended, not replaced (§6). |

**New components proposed (with reason):**
1. Backend `src/services/events-payment-service.mjs` (initiate, status, withdraw-free, confirm, reject, repair, sweep), `src/services/events-refund-service.mjs` (policy evaluation, cancel preview, member/org/admin cancel, event-cancellation batch, `onPaid`), `src/shared/events-refund-policy.mjs` (pure: presets, `evaluateRefund`, per-place apportionment), `src/shared/events-ticket-token.mjs` (pure: derive, hash, parse), `src/shared/events-payment-redact.mjs` (pure allowlist redactor). Greenfield: no event-shaped payment code exists, and keeping it out of `admin-payment-service` / `subscription-service` limits what changes in the older payment paths to the hooks (§7.3).
2. Mobile `lib/screens/member/events/pay/member_event_payment_page.dart` (instructions plus form, one page), `lib/screens/member/events/tickets/member_event_tickets_view.dart` (wallet segment) and `member_event_ticket_page.dart` (QR), `lib/screens/member/events/cancel/member_event_cancel_page.dart` (preview plus reason plus confirm), `lib/shared/events/event_payment.dart` and `event_ticket.dart` / `event_refund.dart` models, `events_ticket_cache.dart` (last good ticket payload on the device). No new shared widget: copy rules and status cards are compositions of `FFCard`, `FFAlert`, `FFBadge`, `FFSectionTitle`.
3. Portal `src/components/event-payment-panel.tsx` (order payment timeline, used by admin order dialog and the corporate order page), `event-finance.tsx` (organizer and admin totals), `event-refund-batch-dialog.tsx` (cancellation refund step); the existing `app/admin/payments/page.tsx` and `app/admin/refunds/page.tsx` are extended in place.

---

## 2. Personas and what each can do in S4

| Actor | Identity | Can in S4 |
|---|---|---|
| Purchaser (member) | `member` | Start a payment for their own awaiting order (manual or provider), see payment status, retry after a rejection while the hold stands, submit a late payment after expiry within the grace window, see tickets for places they hold or bought-and-not-yet-claimed, rotate a ticket code, cancel a paid place or order and see the refund, resend a claim invitation. |
| Claimed participant | `member` | See their own ticket and rotate its code. Cannot pay or cancel; asks the purchaser (S3 rule). After claiming, the purchaser's ticket access ends and the code rotates (§3.8.5). |
| Participant without an account | none | Receives the claim SMS or email after payment is confirmed (D15); nothing else. |
| Corporate billing user | org user with `billing.pay` (owner, admin, finance; D18) | Record that the organisation paid (bank or mobile money) against an order, see its status, cancel and see the refund. Cannot see tickets (employees claim them). |
| Admin with scope `payments` | portal admin | Verify, approve, reject event payments (second approver when `MONEY_SECOND_APPROVER`), repair a confirmed-but-unapplied payment, approve and mark refunds paid. |
| Admin with scope `events` | portal admin | See an order's payment panel with the payer details masked, cancel a paid order with a refund mode (the refund is then a `payments` step), cancel an event and start its refund batch. |
| Organizer owner / admin / finance | `event_organizer`, `organizer_staff` | Read-only finance totals of their own events (`finance`, `owner`, `admin`); never payer phone, transaction ID or any payment detail (§7.4). |
| Organizer ops / timing | same | Nothing new. |
| System | jobs | Hold extension bookkeeping, reconciliation sweep, repair, claim-invitation retry. |

---

## 3. Backend contract

Conventions: S2 §14 and S3 §3 (no `/api/v1`; envelope `{ error: code, ...extra }`; `{ items, nextCursor }`; UTC ISO timestamps; whole TZS + `currency`; `routeGuard(method, [...])`; 404 `feature_disabled`). Rules for flags: payment **intake** routes (initiate, provider prompt, corporate payment notice) need `EVENTS_MODULE` and `EVENTS_REGISTRATION` and `EVENTS_PAYMENTS_MANUAL` or `EVENTS_PAYMENTS_TUNZAA`. **Reads, tickets, cancellation, refunds and finance need only `EVENTS_MODULE` and `EVENTS_REGISTRATION`**: switching payment intake off later must never strand a member who already paid, or block money going back.

### 3.1 Options probe (extends S3 §3.1)
`GET /events/options` (public, never 404) changes `payment` from the S3 constant and adds keys, only when `EVENTS_REGISTRATION` is on:
```
payment: 'none' | 'manual' | 'provider',   // see rule below
manualConfirmHours: 24,                     // EVENTS_MANUAL_CONFIRM_SLA_HOURS: the target the app quotes; present when payment = 'manual'
refundDays: 5,                              // EVENTS_REFUND_TARGET_DAYS: working days FitFlex quotes for sending a refund
hold: { manualExtendHours: 24, manualMaxHours: 48, providerExtendMinutes: 10, lateGraceHours: 24 },
tickets: { qr: true, scanning: false },     // scanning flips true with S5 (EVENTS_KIT_OPS); the ticket page wording depends on it
```
Rule for `payment`: `'provider'` when `EVENTS_PAYMENTS_TUNZAA` is on **and** the Tunzaa client is configured **and** `canSettle()` (sandbox only with `TUNZAA_SANDBOX_SETTLES`); else `'manual'` when `EVENTS_PAYMENTS_MANUAL` is on **and** `MANUAL_PAY_INSTRUCTIONS` is on **and** Lipa Namba and account name are configured; else `'none'`. In every case `'none'` is also returned when `EVENT_TICKET_SECRET` is missing or shorter than 32 characters: **fail closed**, a payment that cannot produce tickets must not be taken. Only one mode is offered at a time (no "choose how to pay" on an order): two live payment attempts on one order is the double-charge risk. Naming note: S3 shipped `next.payment` (string) on order responses and the options key `payment`; S4 keeps both names. "Mode" in this spec means that value.

### 3.2 Migration `20270110091100-events-payments-tickets.cjs` (additive; sorts after `20270110091000-person-declared-details.cjs`; `down` fails closed once money rows exist, like `events-payments` down)
Names and CHECK sets are for `backend-builder` / `contract-checker` to confirm.

| Table | Change | Why |
|---|---|---|
| `EventPayment` | add `eventId` text, `organizerId` text (both denormalised, set at creation), `submittedAt` timestamp(3), `method` text CHECK in (`manual`, `provider`, `free`) (the existing `provider` column keeps `manual` / `tunzaa` / `free`; `method` is the member-facing mode), `rejectCode` text nullable, `lateOrder` boolean default false, `refundId` text nullable, `settledNote` text nullable, and for organisation payments `organizationId` text nullable, `payerMethod` text nullable CHECK in (`bank_transfer`, `mobile_money`), `paidOn` date nullable | Finance and the settlement seam read payments without joining orders; reason codes; late-payment flag. |
| `EventPayment` | partial unique `eventpayment_one_live_per_order` on `(orderId)` WHERE status IN (`created`,`pending`,`reconciliation_required`); partial unique `eventpayment_one_succeeded_per_order` on `(orderId)` WHERE status = `succeeded` | One live attempt per order; **one success per order, enforced by the database** (PAY-007). `reconciliation_required` counts as live so a held payment blocks a second prompt. |
| `EventPayment` | extend `idempotencyKey` convention: stored as `${orderId}:${key}` (the column is globally unique; the key is per order) | Replays. |
| `EventOrder` | add `organizerId` text, `commissionPctSnapshot` integer nullable (CHECK 0..100), `holdCapAt` timestamp(3) nullable, `holdExtendedAt` timestamp(3) nullable, `holdExtensions` integer default 0, `refundedTzs` integer default 0 (CHECK >= 0, <= totalTzs), `paymentMethod` text nullable, `settlementStatementId` text nullable (no FK; the settlement slice adds it) | `organizerId` and `commissionPctSnapshot` are stamped at confirmation (settlement seam, §3.14); hold bookkeeping (§3.6); `refundedTzs` is a running total updated in the refund-paid transaction. |
| `EventRegistration` | add `paidAmountTzs` integer nullable (CHECK >= 0), `paidAt` timestamp(3) nullable, `refundedTzs` integer default 0, `refundId` text nullable (the one live refund covering this place) | Exact per-place money for partial refunds (apportionment, §3.13), set once at confirmation; `refundId` makes "one live refund per place" a database fact even for order-level refunds. |
| `EventTicket` | add `tokenVersion` integer default 1, `tokenKeyId` text nullable, `displayCode` text, `rotatedAt` timestamp(3), `issuedForUserId` text nullable (FK User SET NULL; the participant at issue, informational) (`displayCode` is a support aid, not a key: no unique index) | Ticket token mechanism (§3.8.3). `tokenHash` (existing, unique) stays the lookup key. |
| `EventInventoryMovement` | widen `kind` CHECK to (`hold`, `release`, `commit`, `uncommit`) | A paid place given back (`sold − 1`) is a new movement kind so the ledger still balances: `Σhold − Σrelease − Σcommit = held`, `Σcommit − Σuncommit = sold`. |
| `Refund` | widen `kind` CHECK (the single named constraint `refund_ck`: drop and recreate with identical predicates plus `event_order`); add `eventId`, `eventOrderId`, `eventRegistrationId`, `organizerId`, `organizationId` (all text, nullable), `scope` text CHECK in (`registration`, `order`, `event_cancelled`, `unfulfilled_payment`), `policySnapshot` jsonb, `batchId` text, `eventPaymentId` text | Event refunds (§3.12). `memberId` stays NOT NULL (corporate: the coordinator who placed the order; `organizationId` says who is owed). |
| `Refund` | partial uniques (all `WHERE kind = 'event_order' AND status <> 'rejected'`): `(eventRegistrationId)` for `scope = 'registration'`; `(eventOrderId)` for `scope = 'event_cancelled'`; `(eventOrderId)` for `scope = 'unfulfilled_payment'` | One live refund per place, per cancelled event order, per unfulfilled payment (duplicate refunds are a PRD §10 fraud item). Indexes on `eventId`, `batchId`. |
| `PaymentRequest` | (existing `eventOrderId`) add nothing; `tier` and other legacy NOT NULL columns must be satisfied the way the shop insert satisfies them (confirm: `shop-order-store-pg.mjs` `paymentRow`) | See §8 item 3. |
| `EventPayment.rawRedacted` | no schema change; the redactor (§3.15) is mandatory before any write | Follow-up S4. |

### 3.3 Status vocabulary and state machines
Machines live in `src/shared/events-lifecycle.mjs` and in DB CHECKs. **Widenings S4 needs** (each documented with a comment in the file and covered by `events-lifecycle` table tests):

| Machine | Today | S4 adds | Guard |
|---|---|---|---|
| order | `expired: []`, `refund_pending: [refunded, confirmed]`, `partially_cancelled: [cancelled, refund_pending]` | `expired → confirmed` (late payment, only through `rehold`, §3.9); `refund_pending → cancelled` (a refund refused after the places were already given back); `partially_cancelled → refunded` | `rehold` is the only caller of `expired → confirmed`; table tests assert no route can call `assertTransition('order','expired','confirmed')` directly |
| registration | `cancelled: [refunded]` | `cancelled → reserved` (rehold revives a place cancelled by `expired`) | Only when the registration's `cancelReason = 'expired'` **and** its order `closeReason = 'expired'`, enforced in the `rehold` primitive |
| paymentAttempt | `failed: []` | `failed → succeeded` for `method = 'manual'` only | Only through `confirmChange` (two-person) of a mistaken rejection (§3.7.6) |
| ticket | as is | none | A revoked ticket is replaced by a new row, never reactivated |

**Order status in S4** (member and portal pills, text-first):

| `order.status` | Meaning in S4 | Pill (EN / SW) |
|---|---|---|
| `awaiting_payment` | Held; payment not confirmed (may have a submitted payment) | Awaiting payment / Inasubiri malipo; with a submitted payment the card, not the pill, says "Under review" |
| `confirmed` | Paid, tickets issued | Paid / Imelipwa |
| `partially_cancelled` | At least one paid place cancelled, others live | Partly cancelled / Imeghairiwa kwa sehemu |
| `refund_pending` | Whole order cancelled, refund owed and not all paid out | Refund pending / Marejesho yanasubiriwa |
| `refunded` | All owed refunds paid | Refunded / Imerejeshwa |
| `cancelled` | Cancelled with nothing owed (unpaid, or paid with a no-refund policy) | Cancelled / Imeghairiwa |
| `expired` | Hold lapsed | Expired / Muda umeisha |

Order status after any cancel or refund event is derived by one pure function `deriveOrderStatus(order, registrations, refunds)` (table-tested): any live (`confirmed`) registration → `confirmed` if none were cancelled, else `partially_cancelled`; no live registration and an unpaid refund (`requested` or `approved`) → `refund_pending`; no live registration, at least one refund `paid` and none open → `refunded`; no live registration and no refund rows → `cancelled`.

**Registration:** `reserved → confirmed` at payment; `confirmed → cancelled` (member, admin, event cancelled); `cancelled → refunded` when its refund is paid (set by the refund `onPaid` hook; the hook is idempotent).

**EventPayment status in S4** (the PRD vocabulary; `reversed` is **never set by S4**: it is reserved for provider reversals, which nothing here detects, and PAY-010 forbids rewriting a confirmed payment because of a refund):

| `EventPayment.status` | When | Member state (`payment.state`) |
|---|---|---|
| `created` | Provider mode: row exists, no prompt sent yet; free flow transient | `none` |
| `pending` | Manual: submitted, not decided. Provider: prompt out | manual `submitted`, provider `processing` |
| `succeeded` | The request was approved (admin) or the provider confirmed with matching amount, **and** the order confirmation transaction committed | `confirmed` |
| `failed` | Admin rejected the manual payment; provider answered FAILED; or `reconciliation_required` ended in a refund (`rejectCode` / `failureReason` say which) | `rejected` (manual, with reason) or `failed` (provider) |
| `cancelled` | Admin cancelled the request; or the order was cancelled by an admin before a decision | `failed` with "cancelled" text |
| `expired` | Provider prompt not completed within 30 minutes (sweep) | `expired` |
| `reconciliation_required` | Provider answer unknown after a timeout, or callback amount / transaction mismatch (held), **or** money was confirmed but the order cannot be honoured (late, capacity gone, order cancelled, event cancelled): `failureReason` = `provider_unknown`, `amount_mismatch`, `transaction_mismatch`, `capacity_unavailable`, `order_cancelled`, `event_unavailable` | `needs_attention` (copy differs when a refund exists) |
| `reversed` | not set in S4 | — |

`payment.state` wire value set: `none | submitted | processing | confirmed | rejected | failed | expired | needs_attention`. The server derives it; the apps never infer money state from anything else.

### 3.4 Payment initiation

#### 3.4.1 `POST /me/event-orders/:id/payment` (member)
Guards: `requireAuth('member')`, `routeGuard('post', …)`, intake flags (§3 intro), the caller is the order's purchaser (404 `order_not_found` for anyone else, never 403). Headers: `Idempotency-Key` **required** (400 `idempotency_key_required`; shape 8 to 100 characters `[A-Za-z0-9._:-]`, same helper as S3). Fingerprint = sha256 of the canonical body; same key with a different body → 409 `idempotency_key_reused`; replay → 200 with `replayed: true` and the original payment (even if it has since been decided).

Body depends on the server mode (§3.1); the client never sends amount, currency, order total or provider:
- `payment = 'manual'`: `{ reference, payerPhone }` (the member's transaction ID and the number they paid from, required exactly as for passes: `manual.referenceRequired` / `payerPhoneRequired`).
- `payment = 'provider'`: `{}` (the payer's phone is given to the existing `POST /me/payments/:id/mobile-money`).
- A body that disagrees with the mode → 409 `payment_mode_mismatch { mode }` (the app re-reads options).

Server steps (one DB transaction through the event store; raw trx insert into `PaymentRequest`, as `shop-order-store-pg.placeOrder` does):
1. Lock the order `FOR UPDATE`. Status `awaiting_payment` → continue. `expired` and `closeReason = 'expired'` and `closedAt` within `EVENTS_LATE_PAYMENT_GRACE_HOURS` (24) → continue as a **late** payment (`lateOrder = true`, no hold extension; approving it will `rehold`, §3.9). Any other status → 409 `order_not_payable { status }`; expired beyond the grace → 409 `hold_expired`.
2. Event must be `published` or `registration_closed` and not past its start (`registration_closed` is allowed: the places were bought in time) else 409 `event_not_open`.
3. `order.currency !== 'TZS'` → 409 `unsupported_currency`. `order.totalTzs === 0` → free flow (§3.4.4).
4. A live payment exists (`created | pending | reconciliation_required`) → 409 `payment_in_progress { payment }` (a different key does not create a second attempt).
5. Manual only: `normalizePaymentReference`, `normalizePayerPhone` (400 `payment_reference_required|invalid`, `payer_phone_required|invalid`); duplicate-attempt limiter (>= 5 refused duplicates in an hour → 429 `too_many_attempts`); `references.holders(key)` non-empty → audit `payment_reference_duplicate`, 409 `payment_reference_duplicate`. The partial unique index is the final arbiter (23505 → the same 409).
6. Insert `PaymentRequest { id, memberId: me, eventOrderId, amountTzs: order.totalTzs, currency: 'TZS', status: 'pending', provider: 'admin_approved', memberReference, memberReferenceKey, payerPhone, requestedAt, note: 'event_order:<order.reference>' }` and `EventPayment { id: 'evp_…', orderId, eventId, organizerId, paymentRequestId, provider: 'manual' | 'tunzaa', method, merchantReference: <evp id>, amountTzs: order.totalTzs, currency, status: 'pending' (manual) | 'created' (provider), idempotencyKey: '<orderId>:<key>', submittedAt: now (manual), lateOrder }`. Amount and currency come from the order row read under the lock (its server snapshot), **never** from the body.
7. Manual and not late: extend the hold (§3.6). Audit `events.payment_submitted` (ids and key only).
8. After commit: notification 1 (§3.16), analytics `payment_initiated`.

201:
```
{ payment: PaymentView,                  // §3.5
  order: { id, reference, status, totalTzs, currency, holdExpiresAt },
  next: { payment: 'manual' | 'provider', paymentRequestId, instructions: null },
  late: bool, replayed: false }
```
Manual instructions are **not** repeated in this response: the app already holds them from the order response or `GET /payments/options` before the member pays (they pay first, then submit). The order and order-detail responses carry them (§3.5).

Errors added: `payment_mode_mismatch`, `order_not_payable`, `hold_expired`, `payment_in_progress`, `unsupported_currency`, `payment_reference_*`, `payer_phone_*`, `too_many_attempts`, `tickets_unavailable` (503, `EVENT_TICKET_SECRET` missing at initiation: defence in depth behind the options rule), `rate_limited`.

#### 3.4.2 Provider mode follow-up
The app calls the existing `POST /me/payments/:paymentRequestId/mobile-money { phone }` and polls `POST /me/payments/:id/mobile-money/refresh` (via `offerMobileMoney(productType: 'EVENT_ORDER')`) and `GET /me/event-orders/:id/payment-status`. Behaviour and checks in §3.11.

#### 3.4.3 Corporate: `POST /b2b/organizations/:id/event-orders/:orderId/payment`
Guard: the B2B organisation guard with `billing.pay` (owner, admin, finance; D18 and the S3 billing gate), organisation `active`. Idempotency as above, scoped `(organizationId, orderId, key)`. Body `{ method: 'bank_transfer' | 'mobile_money', reference, paidOn (EAT day, not in the future), note? ≤ 300 }`. No payer phone (an organisation). `reference` uses `normalizePaymentReference` (bank references such as `CRDB-TRF-00917` pass). Creates the same two rows with `PaymentRequest.memberId = order.createdByUserId` (the coordinator; `purchaserUserId` is null for corporate orders) and `payerPhone = null`, `provider: 'admin_approved'`, `note: 'event_order:<ref>'`; the organisation, method and paid-on day live on the `EventPayment` row (`organizationId`, `payerMethod`, `paidOn`), not packed into the note (§8 item 4). Provider mode is **never** offered to organisations (`not_payable_by_role` if they try), because USSD push needs a person's handset.
Payment instructions for organisations come from the B2B payment details (bank name, account, branch, Lipa Namba) in `next.instructions`; the response shape is `{ kind: 'organisation', bankName, accountName, accountNumber, branch, lipaNamba, lipaNambaName, notes, reference: <order reference>, amountTzs }`. Corporate holds follow the manual rules (§3.6) with the same extension, because bank transfers take days: `EVENTS_ORG_HOLD_MAX_HOURS` default 120 (5 days) replaces the 48 h cap for organisation orders only (owner question 4).

#### 3.4.4 Free orders (total 0)
`POST …/payment` on an order whose `totalTzs` is 0 (a free-priced ticket, or a 100% organisation discount) creates **no** `PaymentRequest`. It writes `EventPayment { provider: 'free', method: 'free', amountTzs: 0, status: 'succeeded', verifiedAt: now }` and runs the confirmation transaction (§3.8) at once; response `next: { payment: 'none' }`, `payment.state: 'confirmed'`. Requires the same intake flag (`EVENTS_PAYMENTS_MANUAL` or `TUNZAA`, the flag that means "event payments are on"). Quote and order for free tickets are unchanged from S3. Not a complimentary entry (PAY-014): the organizer priced it at zero.

### 3.5 Reads
- `GET /me/event-orders/:id/payment-status` (purchaser; corporate twin `GET /b2b/organizations/:id/event-orders/:orderId/payment-status`; 120 requests per hour per user) → `{ order: { id, status, holdExpiresAt, totalTzs, currency }, payment: PaymentView | null, refund: RefundView | null }`. Cheap, single-order, safe to poll every 30 s while the screen is open.
- `PaymentView`:
```
{ id, state: 'submitted'|'processing'|'confirmed'|'rejected'|'failed'|'expired'|'needs_attention',
  method: 'manual'|'provider'|'free', amountTzs, currency,
  reference: "QGH7XK2L9P" | null,          // the member's own transaction ID, back to the member who typed it (also to the coordinator for corporate). Never to anyone else.
  payerPhoneMasked: "+255 7•• ••• 678" | null,
  submittedAt, decidedAt | null,
  confirmTargetAt: ISO | null,             // submittedAt + manualConfirmHours: a target to quote, never a promise
  rejectCode: 'reference_not_found'|'amount_mismatch'|'wrong_account'|'duplicate_reference'|'other' | null,
  memberNote: string | null,               // optional admin note written for the member, ≤ 140 chars; the internal decision note is never returned
  late: bool, canRetry: bool,              // retry = order awaiting_payment, hold not expired, no live payment
  refundId: string | null }
```
  Never returned to a member: `verifiedBy`, `decidedBy`, staff names, change-request data, `approvalStage` (internal), provider payloads.
- `GET /me/event-orders/:id` (S3 §3.6) gains: `payment: PaymentView | null` (latest), `next: { payment, instructions, paymentRequestId }` where for `manual` `instructions` = `{ lipaNamba, accountName, network, instructions {en, sw}, amountTzs, reference: <order reference>, referenceRequired, payerPhoneRequired }` (shaped like `/payments/options.manual`, plus the order's amount and reference so the app shows "pay exactly TSh 120,000"), `refunds: [RefundView]`, per registration `ticket: { state: 'active'|'revoked'|'none', displayCode } | null` (no token), and `allowedActions` extended: `['pay']`, `['cancel']`, `['cancel_refund']`, `[]`. A purchaser-masked view after a claim (S3 default M5) is unchanged.
- `RefundView` = `{ id, status: 'requested'|'approved'|'paid'|'rejected', scope, amountTzs, currency, requestedAt, decidedAt, paidAt, paidTo (masked), paymentReference | null (only when paid; the payout reference the member can quote), rejectionNote | null (the member-visible note, as for other refunds) }`.

### 3.6 Hold extension while a manual payment is unreviewed
Why: a 30-minute hold (D16) cannot cover a staff review. Rules, applied in the initiation transaction:
- On a **manual** submission for an `awaiting_payment` order: `holdCapAt` is set once to `order.createdAt + EVENT_MANUAL_HOLD_MAX_HOURS` (default 48; organisation orders `EVENTS_ORG_HOLD_MAX_HOURS`, default 120) and never moves. New `holdExpiresAt = min(holdCapAt, event.startsAt, max(current holdExpiresAt, now + EVENT_MANUAL_HOLD_EXTEND_HOURS (24)))`. `holdExtendedAt = now`, `holdExtensions += 1`. Audit `events.hold_extended`.
- **Provider** prompt out: `holdExpiresAt = max(current, now + EVENTS_PROVIDER_HOLD_EXTEND_MINUTES (10))`, same cap. A FAILED prompt does not shorten the hold.
- **Rejection:** the hold is set to `min(holdCapAt, max(current, now + EVENTS_REJECTED_RETRY_MINUTES (60)))` so the member can correct a typo; if the cap has passed the order simply keeps its expiry and the payment page says so.
- Abuse limits: S3's one live unpaid order per user per event stands; a rejection followed by a new submission extends again but never past `holdCapAt`; the duplicate-reference limiter applies; admins can cancel an unreviewed order at any time (§3.7.7). The Payments queue sorts oldest first and shows the order's hold end so staff can see which places are blocking sales.
- A submitted manual payment **blocks the member's own cancel** of the unpaid order: 409 `payment_submitted` ("your payment is being checked"). After the decision the normal rules apply.
- The expiry job (`event-hold-expiry`) is unchanged; it does **not** cancel the order's pending `PaymentRequest` (the shop's expiry does, which would be wrong here because the member may really have paid). The request stays pending for staff; approving it later takes the late path (§3.9).

### 3.7 Admin confirmation (`admin-payment-service` with `EVENT_ORDER`)
Routes are the existing `/admin/payment-requests*` (scope `payments`). What changes inside:

1. **Typing.** `productTypeOfPayment`: `if (request.eventOrderId) return PRODUCT_TYPES.EVENT_ORDER` **before** the `orderId` and subscription fallbacks. `list()` rows gain `productType: 'EVENT_ORDER'` and an `eventOrder` projection (batched, one query for all rows): `{ orderId, reference, status, eventId, eventTitle, placesCount, holdExpiresAt, totalTzs, expectedTzs, organizationName | null, lateOutcome: 'none' | 'would_rehold' | 'would_refund' }` (`lateOutcome` is a non-locking preview for the dialog only; the decision re-checks under lock). Admin sees full payer phone and the member's reference (existing behaviour of this page).
2. **Hooks** (new deps of `createAdminPaymentService`, defaulted to no-ops so other products are untouched): `beforeEventOrderPayment(request, { amountTzs })` runs inside `checkConfirmation`; `onEventOrderPayment(request, status, { actorId, reasonCode })` is a new branch in `applyPaymentStatusToSubscription` placed first (`if (request.eventOrderId) …`). Guards that today test `request.orderId` to protect a paid shop order are extended to `request.orderId || request.eventOrderId`: `update` ("not edited back", `payment_already_confirmed`), `requestChange`, `confirmChange`, and `referenceInUse`. List each in the PR (§7.3).
3. **`beforeEventOrderPayment`** (read-only, returns `null` or `{ error, status, … }`):
   - order exists (`order_not_found` 409); the request's `memberId` equals the order's `purchaserUserId` (or `createdByUserId` for corporate) else `order_buyer_mismatch`;
   - `request.currency` is `TZS` (`currency_mismatch`); `request.amountTzs === order.totalTzs` (`order_amount_mismatch { expectedTzs }`); the linked `EventPayment` exists, is `pending` or `reconciliation_required` (or `failed` for a two-person change), and its `amountTzs` equals both (`payment_row_mismatch`);
   - **the amount actually received is mandatory for event payments**: `amountTzs` missing on a manual approval → 400 `amount_required`; present and different from `request.amountTzs` → 409 `amount_mismatch { expectedTzs }` and **nothing is written** (scenario 8). Provider-confirmed approvals pass the provider's read-back amount (`automated: true`);
   - reference rules exactly as for other products (`reference_already_used`, A3 final-key check, A1 verbatim check, `reference_locked_provider`).
4. **Maker-checker.** Unchanged: with `MONEY_SECOND_APPROVER` on, the verifier and the approver must differ (`verification_required`, `cannot_approve_own_verification`, `reference_differs_from_verification`). Provider-confirmed payments are `automated` and need no second admin. Event approvals are **not** exempt in any mode.
5. **Rejection.** `decision: 'reject'` for an event request accepts `reasonCode` (closed set `reference_not_found | amount_mismatch | wrong_account | duplicate_reference | other`) and an optional `memberNote` (≤ 140); `other` requires `memberNote` (400 `note_required`). Missing code → 400 `reason_code_required { allowed }`. Stored: `PaymentRequest.note` (internal note), `EventPayment.rejectCode`, `failureReason = 'rejected:<code>'`, `status = 'failed'`. The hold is reset per §3.6 and the member is notified (notification 3). A rejected request frees its transaction ID key (existing behaviour), so the member can correct and resubmit.
6. **Change-request flow reuse.** Applies to the `PaymentRequest` as for any product with these event rules: approved → anything is refused (`payment_already_confirmed`; money back is a refund, PAY-010); `rejected → approved` is allowed through the two-person `requestChange` / `confirmChange` (a mistaken rejection), executed as: PaymentRequest approved, `EventPayment failed → succeeded` (the one widened move, §3.3, manual only), then the confirmation transaction including the late path; `rejected | pending → cancelled` and `cancelled → pending` are plain status changes with the EventPayment following (`cancelled`, or `pending` again with `verifiedBy` cleared as today). `confirmChange` to `approved` requires `amountTzs` (existing `amount_required` rule, now also for events).
7. **Admin order cancel with a pending payment.** `POST /admin/events/:eventId/orders/:id/cancel` (S3, scope `events`) on an order with a pending manual payment: allowed with the note; the request and EventPayment are set `cancelled` in the same transaction as the release (the admin has decided the money is not for these places) and the audit says so. If the member really paid, staff raise a refund from the Payments page (`unfulfilled_payment`, §3.12.5). Never silent.
8. **Repair.** `onEventOrderPayment` runs after the conditional write of the request, so a crash between the two leaves `PaymentRequest.approved` with the order still unconfirmed. Recovery, all idempotent: (a) the hourly `eventPaymentReconciliation` sweep re-applies every approved event request whose EventPayment is not `succeeded` (and is not `reconciliation_required` with a refund); (b) `POST /admin/events/:eventId/orders/:orderId/repair-payment` (scope `payments`) does the same for one order and audits `events.order_repaired`; (c) the admin order panel and Payments row show **"Payment confirmed, order not updated"** with the Repair button until it succeeds; (d) an ops exception is raised if an order stays in this state for more than one sweep. If `backend-builder` can pass a transaction into `writeDecision` so the request write and the confirmation share one transaction, that is preferred; the acceptance criteria hold either way (§3.19 item 12).
9. **Audit.** The existing `payment_approved|rejected|verified|change_*` rows stay (they carry the whole request in `before`/`after`, an existing behaviour for admins); S4 adds `events.order_confirmed`, `events.order_reheld`, `events.payment_reconciliation_required`, `events.order_repaired`, `events.hold_extended`, `events.claim_invitations_sent` with ids and codes only.

### 3.8 The confirmation transaction and ticket issuance

#### 3.8.1 `confirmPaidOrder` (event store primitive; takes an optional caller transaction)
Input `{ orderId, eventPaymentId, source: 'admin' | 'provider' | 'free' | 'repair', actorId }`. Idempotent: calling it again for an already confirmed order with a `succeeded` payment changes nothing and returns `{ changed: false }` (duplicate callbacks, double clicks, retried repair). Inside **one** transaction, under `FOR UPDATE` on the order, the payment and the ticket types:
1. Preconditions: the `EventPayment` is `pending`, `reconciliation_required` or (manual two-person change) `failed`; its `amountTzs` and `currency` equal the order's `totalTzs` and `currency` (else `payment_amount_mismatch`, payment → `reconciliation_required`, nothing else written). **Order commit is driven only by a succeeded `EventPayment` with matching amount and currency** (follow-up S4).
2. Order `awaiting_payment` → commit: the S1 `commit` movements (`held → sold`, keyed by cycle and ticket type), order `confirmed`, `holdExpiresAt = null`, `confirmedAt = now`, `organizerId`, `commissionPctSnapshot` (from `EventOrganizer.commissionPct` at this moment), `paymentMethod`.
   Order `expired` → `rehold` (§3.9). Order `cancelled` or the event cancelled / past start → no commit: payment `reconciliation_required` (`order_cancelled` / `event_unavailable`) and the unfulfilled-payment refund (§3.12.5), in the same transaction.
3. EventPayment → `succeeded`, `verifiedAt = now`, `rawRedacted` (provider only, §3.15), `refundId` null.
4. Registrations `reserved` → `confirmed` with `paidAmountTzs` (apportionment, §3.13) and `paidAt`.
5. Tickets: one `EventTicket` per confirmed registration (§3.8.2); outbox rows (§3.16).
6. Audit `events.order_confirmed` (one row: order id, payment id, source, counts).
After commit (best effort, failures logged by id only, never undo): notifications 2, claim invitations (§3.10), analytics `payment_confirmed`, `ticket_issued`.

`commitOrder` (S1) stays for tests and is re-expressed as `confirmPaidOrder` without a payment only in specs; **no route may call it** (§3.19 item 15a).

#### 3.8.2 Ticket rows
Per confirmed registration insert `EventTicket { id: 'etk_<16 hex>', registrationId, tokenVersion: 1, tokenKeyId, tokenHash, displayCode, status: 'active', issuedAt: now, issuedForUserId: participantUserId }`. The partial unique index (one active ticket per registration) makes a double issue impossible. If `EVENT_TICKET_SECRET` is missing at this point the whole transaction aborts with `tickets_unavailable` (nothing half-written); for a provider-confirmed payment this surfaces as `held` / `reconciliation_required` and an ops exception, and the repair sweep completes it once the secret is set (the options rule in §3.1 prevents getting here in normal operation).

#### 3.8.3 Token mechanism (KIT-001): derived, never stored in plaintext
- `secret = EVENT_TICKET_SECRET` (>= 32 characters; **not** `QR_HMAC_SECRET`, so the gym QR and tickets can be rotated independently); `keyId = EVENT_TICKET_KEY_ID` (default `k1`); older keys for verification and display in `EVENT_TICKET_SECRET_PREVIOUS` (JSON `{ "k0": "…" }`).
- `mac = base64url(HMAC_SHA256(secret, "fitflex.event.ticket.v1|" + ticketId + "|" + tokenVersion + "|" + registrationId + "|" + eventId))`, first 22 characters (128 bits). The registration and event ids are inside the MAC input, so a token cannot be replayed against another registration, but they are not in the token.
- `token = "ev1." + keyId + "." + ticketId + "." + tokenVersion + "." + mac`. It carries **no personal data**. `tokenHash = sha256hex(token)` is stored (the existing unique column). The QR payload is `"FFEV1:" + token` (the prefix lets the S5 scanner tell it from a gym QR, `userId.bucket.sig`).
- **How the app gets the payload without a stored plaintext:** `GET /me/event-registrations/:id/ticket` re-derives the token from the secret plus the stored `ticketId`, `tokenVersion`, `tokenKeyId`, checks `sha256(token) = tokenHash` (integrity; mismatch → 500 audit `events.ticket_integrity_failed`, never return a token) and returns it. A database leak yields hashes only; forging needs the server secret.
- **Static, not time-bucketed:** kit collection happens at a venue with poor connectivity and must work from a cached code (§5.8); replay is stopped by the S5 constraint of one `collected` kit row per registration, not by token expiry. Hence the ticket page makes no "valid for X minutes" claim.
- **Rotation:** `tokenVersion + 1`, new hash, `rotatedAt = now`; the old token no longer matches any hash. Triggers: the holder asks (`POST /me/event-registrations/:id/ticket/rotate`, 5 per day per ticket), a place is claimed by someone other than the viewer who had access (§3.8.5), admin action (S5). Secret rotation: change `keyId`; tickets keep their `tokenKeyId` until rotated, so old keys stay in `…_PREVIOUS` until every ticket is rotated or the event ends.
- **Revocation:** ticket `active → revoked` (`revokedAt`, `revokeReason` in `cancelled | refunded | event_cancelled | admin | replaced`). The token stops resolving to an active ticket. A replacement (never reactivation) is a new row.
- Responses carrying a token send `Cache-Control: no-store`; tokens are never logged (request logging already redacts bodies; the route does not put tokens in paths or queries); analytics carry ticket ids only.

#### 3.8.4 Ticket routes (member; `EVENTS_MODULE` + `EVENTS_REGISTRATION`; not gated by the intake flags)
- `GET /me/event-tickets?cursor&limit` → `{ items: [{ registrationId, ticketId, displayCode, state: 'active'|'revoked', event: EventSummary, category: { name, distanceM, startsAt }, ticketType: { name }, participant: { firstName, lastName }, relation: 'self'|'purchased'|'claimed', orderReference, issuedAt, kit: { state: 'not_ready'|'ready'|'collected' | null } }], nextCursor }` — soonest event first; revoked tickets after, past events last. **No token in the list.**
- `GET /me/event-registrations/:id/ticket` → `{ ticket: { id, displayCode, state, issuedAt, rotatedAt }, token, qrPayload, event: EventSummary, category, participant: { firstName, lastName }, scanning: false, kit: {…} | null }`. 404 `registration_not_found` when the caller has no right (never 403); 409 `ticket_revoked { reason }` for a revoked one (so the app can show why); 409 `ticket_not_issued` for a reserved place. 60 per hour per user.
- `POST /me/event-registrations/:id/ticket/rotate` → same body with the new token. 409 `ticket_revoked`. 5 per day per ticket (`rate_limited`).
- `scanning` mirrors `options.tickets.scanning` so the page wording is correct even if the options cache is stale.

#### 3.8.5 Who may see a ticket
| Caller | Place unclaimed (purchaser's own `self` place, or not yet claimed) | After a claim by someone else |
|---|---|---|
| Purchaser who is also the participant (`self`) | sees | sees |
| Purchaser who bought for another, unclaimed | sees (so they can hand it over) | **loses access; the token rotates at the moment of the claim** (screenshots they hold die) |
| Claimed participant | — | sees |
| Corporate coordinator / organisation | never (portal has no ticket view) | never |
| Organizer, admin | no token ever (S5 resolves scans server-side) | no token ever |

### 3.9 Late confirmation: the `rehold` primitive (follow-up S4)
`rehold(trx, order, { source })`, only called from `confirmPaidOrder`, under the order and ticket-type locks, for an order `expired` whose payment is being confirmed:
1. Preconditions: event `published` or `registration_closed` and `startsAt` in the future. Sale windows and category registration cut-offs are **not** re-checked (the purchase was made in time and the money is in).
2. `holdCycle + 1`; for each line a conditional update `held = held + qty WHERE capacity − sold − held >= qty`; if any line fails, **nothing** is written for any line and the primitive returns `capacity_unavailable { ticketTypeId }`. One `hold` movement per line keyed `${orderId}:${cycle+1}:hold:${ticketTypeId}`.
3. Registrations `cancelled → reserved` (the guarded move, §3.3); order `expired → confirmed` through the same commit step as §3.8.1 (the `commit` movements at the new cycle), outbox `registration.created` per revived place (their earlier `registration.cancelled` stays in the log), audit `events.order_reheld`.
4. On `capacity_unavailable` (or an order `cancelled`, or the event unavailable): no inventory touched; `EventPayment → reconciliation_required` (`failureReason` accordingly, `settledNote` null); a `Refund` with `scope = 'unfulfilled_payment'` for the full `totalTzs`, `reasonCode = 'payment_error'`, `status = 'approved'` (decided by `policy`, `requestedBy = 'system'`, `requestedRole = 'system'`; money owed in full needs no judgement; paying it out still follows the two-person rules) is inserted in the **same** transaction; `EventPayment.refundId` set; ops exception raised. The manual-confirmation route **returns** the outcome (`{ paymentRequest, event: { outcome: 'confirmed' | 'reheld' | 'refund_raised', reason? } }`) so the admin UI shows it; it never swallows it.
5. When that refund is marked paid, the `onPaid` hook moves the EventPayment `reconciliation_required → failed` (`failureReason = 'refunded_after_late_payment'`). The `PaymentRequest` stays `approved` (the money did arrive; PAY-010).
6. Cancelled-by-person orders are **not** revived (a person's cancellation stands): they take the refund path. Orders expired on their own are revived when capacity allows (the same distinction the shop makes).

### 3.10 Claim invitations on confirmation (D15)
After the confirmation commit the payment service calls `inviteClaims({ orderId })` (the S3 seam; it already refuses unless the order is `confirmed`, 409 `order_not_confirmed`). Per place it still does what S3 built: skips `self` places, claimed places and places with no contact; mints a fresh 32-byte base64url token, sends **one** SMS (Beem) else one email (Mailgun) with the bilingual text, and only on a successful send replaces `claimTokenHash`, sets `claimTokenExpiresAt = now + EVENTS_CLAIM_TOKEN_DAYS (90)`, `claimInvitedAt`, `claimInviteCount + 1`.
- **Link format:** `${shareBase}/event-claim/#<token>` (fragment, never reaches a server; same host as friend invites; the app keeps the token 24 h on the device). SMS text EN "{purchaser} registered you for {event} ({category}). Claim your place in the FitFlex app: {link}", SW "{purchaser} amekusajili kwa {event} ({category}). Chukua tiketi yako kwenye app ya FitFlex: {link}" (S3 §3.14; both sent when the recipient's language is unknown).
- Corporate orders: each employee with a contact gets the same invitation with the organisation's name as the purchaser.
- **Failure handling:** a send failure never fails or delays the confirmation. The sweep retries places with `claimInvitedAt IS NULL` once, one hour after confirmation, then stops (cost bound: at most 2 sends per place automatically). Beyond that the purchaser can resend (below).
- **Resend:** `POST /me/event-orders/:id/claim-invitations { registrationId }` (purchaser; corporate twin for billing users) → `{ sent: bool, channel: 'sms'|'email'|null, nextAllowedAt }`. Allowed only for a confirmed, unclaimed, non-self place; 3 per day per registration and `claimInviteCount` capped at 5 (`resend_limit_reached`). It mints a new token, which **invalidates the previous link** (S3 stores one hash); the response says so and the app tells the purchaser.
- The in-app "Is this you?" notice for matching verified members (S3 notification 3) was already sent once per registration at order creation; S4 does not repeat it. Those members get the normal participant notification on confirmation (§3.16, notification 6).

### 3.11 Tunzaa path (built, dormant, `EVENTS_PAYMENTS_TUNZAA`)
Effective only when `EVENTS_MODULE`, `EVENTS_REGISTRATION`, `EVENTS_PAYMENTS_TUNZAA`, `TUNZAA_PAYMENTS`, the client and `canSettle()` are all true. Changes in `mobile-money-service.mjs` (every one is a rule-6 item):
1. **`PAYABLE`**: `EVENT_ORDER` joins the member's payable set only while the flag above is effective; `ROLE_PRODUCTS.member` includes it (a trainer never; an organisation never: `not_payable_by_role`). `payableProducts('member')` returns it, so `GET /payments/options` `mobileMoney.products` lists `EVENT_ORDER` and the app's `momoOffers` works unchanged.
2. **`pay()`**: after `productOf`, a new `beforeEventOrderPayment`-based check for event products: order `awaiting_payment` and not expired (provider mode is not offered late; a late member uses the manual path if on, else registers again), event open, `request.amountTzs === order.totalTzs`, `EventPayment` exists and is `created`/`pending`; amount is the request's own (server snapshot). Existing refusals stay (`manual_payment_submitted` 409 when a manual ID was given: **in provider mode no ID is asked for, so it never trips**). On a prompt sent: `EventPayment → pending`, `providerTransactionId` set (`(provider, providerTransactionId)` unique), hold extended (§3.6).
3. **Callback is a trigger only (unchanged):** `POST /webhooks/tunzaa` checks the HMAC signature, `handleCallback` finds the request by our `reference_id` (`<request id>.<attempt>`), `settle()` re-reads `checkStatus(transaction)` and **never trusts the callback's own status or amount**.
4. **Comparisons on COMPLETED** (existing: remote amount equals `request.amountTzs`; transaction equals the recorded prompt; reference not used elsewhere; `canSettle()`), plus for events: currency `TZS`; `request.amountTzs`, `EventPayment.amountTzs` and `order.totalTzs` all equal; order state allows commit or a late path; mismatch of any → state `held`, audit `payment_mobile_money_held`, `EventPayment → reconciliation_required` (`amount_mismatch` | `transaction_mismatch`), ops exception, **no ticket, no commit**.
5. **Then** `adminPaymentService.decide({ automated: true, … })` → the event branch → `confirmPaidOrder(source: 'provider')`. A FAILED answer releases the attempt (the request returns to manual provider, `EventPayment → failed`), the hold keeps running, the member can retry.
6. **Webhook idempotency (`WebhookSeen`):** after a callback has been fully processed (not on receipt, so a crash mid-way does not swallow the retry), insert `WebhookSeen { id: 'tunzaa:<transaction_id>:<status>' }`; a repeat finds it and answers `200 { ok: true, duplicate: true }` without calling Tunzaa. This is a belt: the guarantees are the state machine, `eventpayment_one_succeeded_per_order`, `(provider, providerTransactionId)` uniqueness and the idempotent `confirmPaidOrder`. A duplicate callback therefore cannot create a second payment, ticket, registration confirmation or outbox row (scenario 6).
7. **Lost callbacks:** job `eventPaymentReconciliation`, hourly, flag-gated like the rest, bounded to 100 rows per run, `FOR UPDATE SKIP LOCKED`, advisory-locked across servers, recorded in `JobRun`. Selects `EventPayment` with `provider = 'tunzaa'` and status `pending` older than 5 minutes or `reconciliation_required` with `failureReason = 'provider_unknown'`; for each calls the same `settle(request)` the refresh route uses. Not COMPLETED after 30 minutes → `expired` (the member sees "ask for a new prompt"); COMPLETED → confirmation. It also runs the manual repair (§3.7.8) and the claim-invitation retry (§3.10), which are not provider-specific and run with `EVENTS_PAYMENTS_MANUAL` too.
8. **Not done in S4:** provider refunds (Tunzaa has no refund API in the integration; refunds are recorded by hand as today), provider reversals and chargebacks, a daily statement-versus-ledger reconciliation (PAY-011 is only partly met: per-payment re-read, no statement import), any provider other than Tunzaa. State this plainly in the PR and to the owner.
9. **Sandbox:** with `TUNZAA_SANDBOX_SETTLES` off, `options.payment` is never `'provider'` against the sandbox.


### 3.12 Refunds and cancellation of paid places

#### 3.12.1 Policy model (frozen at event submission, S2 `refundPolicySnapshot`)
S2 shipped presets `no_refund`, `refund_until_close`, `custom` (free text EN/SW). Free text cannot be evaluated by a machine, so S4 adds two evaluable presets and keeps the others (existing submitted events keep working untouched; `REFUND_PRESETS` in `src/shared/events-document.mjs` and the S2 wizard Terms step widen, §6.7):

| `refundPolicy.preset` | Extra fields | Evaluation at cancel time `now` (instants; deadlines are shown in the event's time zone) |
|---|---|---|
| `no_refund` | — | 0% always |
| `refund_until_close` | — | 100% while `now` < the category's `registrationClosesAt` (else the event's `registrationClosesAt`); 0% after. If neither exists the preset behaves as `no_refund` and the server audits `events.refund_policy_no_deadline` (§8 item 6) |
| `full_until_days` (new) | `days` 1..365 | 100% while `now` <= `startsAt − days × 24 h`; 0% after |
| `tiered` (new) | `tiers` 1..3 of `{ daysBefore, percent }`, `daysBefore` strictly decreasing, `percent` 1..100 and non-increasing | The first tier (largest `daysBefore` first) whose time has not passed gives its percent; 0% after the last |
| `custom` | `text` EN/SW (existing) | Not evaluable: **manual review** (§3.12.3) |

`evaluateRefund({ policy, event, category, now, paidTzs })` is pure and table-tested; it returns `{ mode: 'auto' | 'none' | 'manual_review' | 'closed', percent, refundTzs, deadlineAt, tierIndex, reason }`. `mode = 'closed'` when `now >= event.startsAt` (`cancellation_window_closed`), when the event is `in_progress`/`completed`, or (S5) when the kit was collected (`kit_collected`, reserved code). Percent never rounds up: `refundTzs = floor(paidTzs × percent / 100)` per place (§3.13). The text shown to members is the organizer's snapshot text **plus** a plain line generated from the structured fields (so the preset and the words cannot disagree).

#### 3.12.2 Member cancels a paid place or order
- Previews (read-only, 60 per hour): `GET /me/event-registrations/:id/cancel-preview` and `GET /me/event-orders/:id/cancel-preview` → `{ eligible: bool, mode, percent, paidTzs, refundTzs, currency, deadlineAt, policy: { preset, text {en, sw} }, places: [{ registrationId, name, paidTzs, refundTzs }], releaseInventory: bool, blocked: null | 'payment_submitted' | 'refund_in_progress' | 'cancellation_window_closed' | 'event_cancelled' | 'purchaser_only' | 'kit_collected' }`.
- `POST /me/event-registrations/:id/cancel { reason, expectedRefundTzs }` (S3 route, now also for `confirmed`) and `POST /me/event-orders/:id/cancel { reason, expectedRefundTzs }`. `reason` stays the S3 closed set (`invalid_reason`). `expectedRefundTzs` is **required** for a confirmed target and is only an equality check against a fresh evaluation (409 `refund_changed { refundTzs }` if the percent tier moved while the member read the screen); it never sets the amount. Purchaser only (a claimed participant gets 403 `purchaser_only`, the app tells them to ask the purchaser, S3 rule). Corporate twin `POST /b2b/organizations/:id/event-orders/:orderId/cancel` (billing roles; whole order only).
- Behaviour by `mode`:
  - `auto` (refund > 0): one transaction `cancelPaidRegistration` / `cancelPaidOrder`: locks order, registration(s), ticket type(s); registration `confirmed → cancelled` (`cancelReason` = the person's reason); ticket `active → revoked` (`cancelled`); if `releaseInventory` (event `published`, category registration still open: the place can be sold again) one `uncommit` movement per place (`sold − 1`), else `sold` stays (the place cannot be resold, the organizer keeps the sale of a place nobody can take); order status derived (§3.3); `EventOrder.refundedTzs` and `EventRegistration.refundedTzs` are **not** moved yet (they move when the refund is paid); every covered registration gets `refundId` set by a conditional update (`WHERE refundId IS NULL`; zero rows updated aborts the whole transaction with 409 `refund_in_progress`); a `Refund` row is inserted **in the same transaction**: `kind 'event_order'`, `scope 'registration'` or `'order'`, `amountTzs`, `status 'approved'`, `decidedBy 'policy'`, `requestedBy me`, `requestedRole 'member'` (the coordinator, for corporate too), `reasonCode 'member_cancelled'`, `policySnapshot { preset, percent, deadlineAt, evaluatedAt }`, `eventId/eventOrderId/eventRegistrationId/organizerId/eventPaymentId` (+ `organizationId` for corporate). Refund audit and notification run after commit through `refund-service`. There is never a committed cancellation without its refund row when `refundTzs > 0` (§3.19 item 10).
  - `none` (policy gives 0): the same transaction without a `Refund` row; the preview showed "No refund" and the app asked for an explicit confirmation; `reasonCode` for analytics `cancel_no_refund`.
  - `manual_review` (`custom`): **nothing is cancelled yet.** A `Refund { status 'requested', scope, amountTzs: paidTzs (the most that can be granted), reasonCode 'member_cancelled', note: the member's reason }` is created and the response says `{ requested: true }`. The place stays confirmed and the ticket active until staff decide. Approving (the `decide` route gains an `onApproved(refund)` dep for `event_order`) runs the same cancellation transaction with the approved amount (<= requested); rejecting changes nothing and the member sees the note.
  - `closed`: 409 with the blocked code.
- Concurrency: the cancel transaction takes the order `FOR UPDATE`; a second cancel of the same place finds it `cancelled` and returns the first result (`changed: false`, 200). The refund live-unique indexes (§3.2) make a duplicate refund impossible even if two paths race (member cancel vs admin cancel vs event cancel).
- Participants: a claimed participant whose place the purchaser cancels is notified (notification 9). Team membership follows the registration (S3 rule).

#### 3.12.3 Admin cancels a paid order
`POST /admin/events/:eventId/orders/:id/cancel { note (>= 5 chars), refundMode: 'full' | 'policy' | 'none' }` (scope `events`; S3 refused confirmed orders with 409, S4 allows them). `full` = 100% of what was paid for the live places, `policy` = evaluate as for the member, `none` = no refund. The refund is `requested` with `requestedRole 'admin'` (a second admin approves under `MONEY_SECOND_APPROVER`, existing `cannot_approve_own_request`); audit `events.order_cancelled` with the mode and note. Inventory follows `releaseInventory` as above (admin cancel of a live event frees places only if the category is still open).

#### 3.12.4 Organizer-cancelled or admin-cancelled event: refund batch (scenario 10)
Only admins cancel an event that has confirmed registrations (D12). Extending the S2 route `POST /admin/events/:eventId/cancel { reason, note, refundPaidOrders }` (`refundPaidOrders` default `true`; the S2 body stays valid):
1. Existing `moveEvent(… 'cancelled')` runs first (its own transaction and audit). If it fails nothing else happens.
2. `GET /admin/events/:eventId/cancel-preview` (before the dialog confirms) → `{ awaitingOrders, awaitingWithSubmittedPayment, paidOrders, paidPlaces, totalPaidTzs, alreadyRefundedTzs, refundableTzs, openRefunds }` so the dialog can state the money; the cancel body then carries `expectedRefundableTzs` (equality check, 409 `refundable_changed`).
3. Awaiting orders: `releaseOrder(id, 'admin')` each (notification: places released because the event was cancelled). A pending **manual** payment on such an order stays pending for staff; approving it takes the unfulfilled-payment path (`event_unavailable`, §3.9), and the Payments row says "Event cancelled" so staff know.
4. Paid orders: every live registration `confirmed → cancelled` (`cancelReason 'event_cancelled'`), tickets revoked (`event_cancelled`), `sold` unchanged; one `Refund` per order, `scope 'event_cancelled'`, `amountTzs = Σ paidAmountTzs of the live places` (never above paid minus already refunded), `status 'requested'`, `requestedRole 'admin'`, `requestedBy = actor`, `reasonCode 'cancelled_by_fitflex'`, `batchId = evb_<id>`; order → `refund_pending`. Refunds are the **full amount paid including any fee** regardless of preset (owner question 5). Idempotent and resumable: chunks of 200 orders, unique live index per order; `POST /admin/events/:eventId/refund-batch` (scope `payments`, body `{ note?, expectedRefundableTzs }`) runs or resumes it and returns `{ batchId, created, existing, remaining, amountTzs }`.
5. Approval and payout stay per refund through the existing routes. Helpers: `POST /admin/refunds/batch-decision { batchId, decision: 'approve', expectedTotalTzs, expectedCount }` approves every `requested` refund of the batch (each row applies the same rule checks; under `MONEY_SECOND_APPROVER` the admin who started the batch gets 403 `cannot_approve_own_request` for all rows); rejection is per refund only. `POST /admin/refunds/batch-paid { batchId, items: [{ refundId, paymentReference, paidTo }] }` (<= 200 items) records payouts row by row with the existing `markPaid` rules and returns per-item results (partial success reported, never silent).
6. Communications (KIT-010): purchasers always; claimed participants; unclaimed places with a contact get one bounded SMS or email ("{event} has been cancelled. {purchaser} will be refunded by FitFlex."); counts audited as `events.cancellation_notified`. Copy never states a payout date.
7. **Date or venue changes are not cancellations.** S4 adds no refund right on a material change (S2 change log); an event can still be cancelled by admin if that is the outcome.

#### 3.12.5 Unfulfilled payment (money in, place not possible)
`scope 'unfulfilled_payment'`, §3.9. Also raised by an admin on any approved event payment whose order is not `confirmed` via `POST /admin/refunds` with `eventPaymentId` (the existing admin-raise route learns `kind 'event_order'` for that case only: body `{ eventPaymentId, amountTzs?, reasonCode: 'payment_error', note }`, `amountTzs <= payment amount`, 409 `payment_not_unfulfilled` if the order is confirmed: use the cancel route then).

#### 3.12.6 Refund state machine and what happens on each step
`requested → approved → paid`, `requested → rejected` (the existing `refund-service`; maker-checker flags unchanged). New dependencies of `createRefundService` (defaulted to no-ops): `onApproved(refund)` (§3.12.2 manual-review cancellation) and `onPaid(refund)` (extended: for `event_order` it runs one transaction: registrations in scope `cancelled → refunded`, `EventRegistration.refundedTzs`, `EventOrder.refundedTzs`, EventPayment `reconciliation_required → failed` for `unfulfilled_payment`, derived order status, outbox `refund.paid`, audit). `onPaid` is idempotent; a failure is audited as the existing `refund_paid_source_not_updated` and the sweep re-applies it. `rejected` for an auto-cancelled place leaves the cancellation in place (the place was given back; the organizer's policy granted it) and derives the order to `cancelled`; the rejection note is mandatory and member-visible, and the app tells the member to contact support. There is no automatic reinstatement of a cancelled place.
`paidTo` defaults to the original payer phone (the admin dialog prefills it from the linked `PaymentRequest.payerPhone`; corporate: blank, the admin enters the account). Payout stays manual: `paymentReference` is the payout reference (PAY-010).

#### 3.12.7 What each audience sees
Member: refund rows in `GET /me/refunds` (kind label, event and order reference, scope, amount, status, payout reference when paid), the `refunds[]` on order detail. Organizer: totals only (§3.14). Admin: Refunds page rows with event, order, scope, policy snapshot, batch (§6.3).

### 3.13 Money rules (TZS integers; fee and commission treatment)
1. **Source of truth:** the order's server snapshot (`totalTzs`, `currency`, `lines.lineTotalTzs`). The client sends no amount anywhere in S4 (`expectedRefundTzs` is an equality check, §3.12.2). Admin-typed `amountTzs` is a verification input, never a price.
2. **Types:** integers in whole TZS; `Number()` on both sides of every comparison; no floating arithmetic except the single percent step, which is `Math.floor(paid × percent / 100)` on integers (paid < 2^31 so the product is exact). `currency` must be `TZS` for payment and refund (409 `unsupported_currency` otherwise).
3. **Per-place paid amount (`paidAmountTzs`):** for a line with total `T` and quantity `q`, each place gets `floor(T / q)` and the first `T mod q` places (registrations ordered by id) get one extra shilling. Sum over the line equals `T`; over the order equals `totalTzs`. Written once at confirmation, never recomputed.
4. **Refund bounds:** a place is covered by at most one live refund (`EventRegistration.refundId`, set by a conditional update inside the transaction and cleared when that refund is rejected), a refund never exceeds the `paidAmountTzs` of the places it covers, and `refundedTzs` (moved only when a refund is paid) never exceeds `paidAmountTzs` per place or `totalTzs` per order (CHECKs). A partial percent refund leaves the remainder with the organizer.
5. **Fee treatment:** D21 stands: no member-facing fee unless `EVENTS_FEE_RULE` is set. If one is set, `feesTzs` is already inside each line total, so partial-policy percentages apply to the whole paid amount of the place (simple to explain), and organizer-cancelled events refund fees in full. Whether fees should be non-refundable on member cancellations is owner question 5.
6. **Commission (D2):** FitFlex's commission comes out of the organizer payout, never added to the member price. It applies to money the organizer **keeps**: `commission = round((paid − refunded) × pct / 100)` per order using the `commissionPctSnapshot` stamped at confirmation (rounding half up, whole shillings). Refunded money carries no commission. A later change to the organizer's rate does not touch confirmed orders.
7. **No money in logs:** amounts may be logged; references, phones and tokens may not (§3.15).

### 3.14 Organizer settlement seam and the finance view (data only; no statements in S4)
**Seam, written at confirmation / refund time so the settlement slice reads rows instead of re-deriving:**
- `EventOrder`: `organizerId`, `eventId`, `confirmedAt`, `totalTzs`, `currency`, `commissionPctSnapshot`, `refundedTzs`, `settlementStatementId` (null until a statement takes it).
- `EventPayment`: `status = 'succeeded'`, `verifiedAt`, `amountTzs`, `organizerId`, `eventId`.
- `EventRegistration`: `paidAmountTzs`, `refundedTzs`, `status`.
- `Refund` (`kind = 'event_order'`): `organizerId`, `eventId`, `eventOrderId`, `scope`, `status`, `amountTzs`, `paidAt`. `unfulfilled_payment` rows are **excluded** from organizer money (they never were the organizer's sale).
A later statement line = one confirmed order: `gross = totalTzs`, `refunds = Σ refunds paid or approved for it excluding unfulfilled`, `commissionPct`, `net = (gross − refunds) − round((gross − refunds) × pct / 100)`. The statement workflow (draft → submitted → approved → payable → paid, maker-checker, holds) is reused unchanged by that slice. S4 builds none of it. Payout timing relative to the event date is owner question 6.

**`GET /organizer/events/:id/finance`** (`requireOpenOrganizer('finance','owner','admin')`: other roles get 403 `forbidden_role`, a foreign event 404 `event_not_found`; suspended organizers may read) →
```
{ eventId, currency: 'TZS', asOf,
  paidTzs,                 // Σ succeeded EventPayment for this event's orders (gross)
  refundedTzs,             // Σ refunds paid, excl. unfulfilled
  refundPendingTzs,        // Σ refunds requested or approved, excl. unfulfilled
  awaitingPaymentTzs,      // Σ totalTzs of orders awaiting payment (held, not income yet)
  commissionPct,           // the organizer's current rate (whole percent)
  commissionTzs,           // Σ per order from snapshots on money kept (paid − paid-or-pending refunds)
  expectedNetTzs,          // paidTzs − refundedTzs − refundPendingTzs − commissionTzs
  orders: { paid, refunded, partlyRefunded },
  byTicketType: [{ ticketTypeId, name, sold, grossTzs }],
  settlement: { state: 'not_started' } }
```
Totals only: no per-order rows (the S3 organizer Orders tab already shows per-order totals with masked purchasers; owner question 3 decides whether that stays), never payer phone, transaction ID, payment method, payer name or refund destinations. Admin twin `GET /admin/events/:id/finance` (scope `events`) returns the same plus `unfulfilledTzs` and open reconciliation counts. 60 per hour per user.

### 3.15 `rawRedacted`, audit, analytics, rate limits
- **Redactor** `redactProviderPayload(provider, payload)` in `src/shared/events-payment-redact.mjs`, the only code allowed to produce `EventPayment.rawRedacted`: an **allowlist per provider**, unknown keys dropped (not masked). Tunzaa: `transaction_id`, `reference_id`, `status`, `amount`, `payment_date`, `timestamp`, `remark` (trimmed to 200 characters), plus `provider`. Values must be strings or finite numbers (objects, arrays and nulls dropped); any string of 9 or more digits, or starting `+255`/`255`/`0` followed by 9 digits, is replaced by its last three digits; the signature header, tokens, MSISDN and merchant secrets are never in the allowlist; result serialised <= 2 KB or dropped entirely. `manual` and `free` write `null`. Property tests feed hostile payloads (nested objects, long strings, phone numbers in allowed keys, `__proto__`).
- **Logs:** payment code logs ids, status and error codes only; never references, phones, tokens, Authorization or provider payloads (PAY-013). Same rule as the S3 registration service.
- **Audit rows** (`AuditLog`): see §3.7.9 and refunds' existing `refund_*` actions; plus `events.ticket_rotated`, `events.ticket_revoked` (counts), `events.registration_cancelled_paid`, `events.refund_batch_created`, `events.payment_integrity_failed`.
- **Analytics** (server truth; no-op hook until S7 connects a pipeline; no personal data): `payment_initiated { orderId, eventId, method, late }`, `payment_confirmed { orderId, eventId, method, source, rehold: bool }`, `payment_failed { orderId, eventId, method, code }`, `refund_requested { eventId, scope, mode }`, `refund_completed { eventId, scope }`, `ticket_issued { eventId, count }`. Mobile/portal names in §5.13 and §6.9.
- **Rate limits** (429 `rate_limited { retryAfterSeconds }`; in-memory per server like S3, so the real ceiling is the number of servers times the limit; the unique indexes, not the limiters, protect money): payment initiation 10 per hour per user (and 20 per hour per order); duplicate-reference refusals 5 per hour per user (existing); payment-status 120 per hour per user; ticket read 60 per hour per user; ticket rotate 5 per day per ticket; cancel/refund previews 60 per hour; cancel/refund requests 10 per day per user; claim resend 3 per day per registration; corporate payment notice 10 per hour per organisation.

### 3.16 Notifications and outbox
**Notifications** (in-app plus push through `notify`, bilingual with `localeOf`; ids `ntf_<type>_<paymentId|refundId|registrationId>` so retries do not duplicate; deep links in `data`):

| # | Type | To | EN title / body | SW title / body | Link |
|---|---|---|---|---|---|
| 1 | `event_payment_submitted` | purchaser (corporate: coordinator) | Payment received · being checked / We have your transaction ID. FitFlex confirms payments within {hours} hours. Your places for {event} are held until {time}. | Malipo yamepokelewa · yanakaguliwa / Tumepokea namba yako ya muamala. FitFlex huthibitisha malipo ndani ya saa {hours}. Tiketi zako za {event} zimeshikiliwa hadi {time}. | order |
| 2 | `event_payment_confirmed` | purchaser | Payment confirmed · tickets ready / {n} ticket(s) for {event} are ready. | Malipo yamethibitishwa · tiketi ziko tayari / Tiketi {n} za {event} ziko tayari. | tickets (own) or order |
| 3 | `event_payment_rejected` | purchaser | We couldn't confirm your payment / {reasonText} You can try again until {time}. | Hatukuweza kuthibitisha malipo yako / {reasonText} Unaweza kujaribu tena hadi {time}. | pay page |
| 4 | `event_payment_refund_due` | purchaser | Your places weren't available / We received your payment of {amount} but could not keep your places for {event}. A full refund is being prepared. | Tiketi hazikuwepo / Tumepokea malipo yako ya {amount} lakini hatukuweza kuhifadhi tiketi zako za {event}. Marejesho kamili yanaandaliwa. | order |
| 5 | `event_payment_late_received` | purchaser | Payment received after your hold ended / We'll try to re-reserve your places; if they are gone we'll refund you in full. | Malipo yamepokelewa baada ya muda kuisha / Tutajaribu kukuwekea tiketi tena; zikiwa zimeisha tutakurejeshea pesa zote. | order |
| 6 | `event_ticket_ready` | participant who is a member and not the purchaser | Your ticket is ready / Your ticket for {event} ({category}) is ready. | Tiketi yako iko tayari / Tiketi yako ya {event} ({category}) iko tayari. | ticket |
| 7 | `event_refund_requested` / `_approved` / `_paid` / `_rejected` | refund `memberId` | Refund request received · Refund approved · Refund sent · Refund not approved (bodies carry the amount; paid carries the payout reference; rejected carries the member-visible note) | Ombi la marejesho limepokelewa · Marejesho yameidhinishwa · Marejesho yametumwa · Marejesho hayajaidhinishwa | order |
| 8 | `event_cancelled_refund` | purchaser, claimed participants | {event} has been cancelled / FitFlex will refund what you paid for this event ({amount}). We'll tell you when it is sent. (participants: "Your place in {event} was cancelled.") | {event} imeghairiwa / FitFlex itarejesha ulicholipa kwa tukio hili ({amount}). Tutakuarifu itakapotumwa. (washiriki: "Tiketi yako ya {event} imeghairiwa.") | order |
| 9 | `event_place_cancelled_by_purchaser` | claimed participant | {purchaser} cancelled your place in {event}. | {purchaser} ameghairi tiketi yako ya {event}. | registrations list |

Rejection reason text (also used in the apps, §5.12): `reference_not_found`, `amount_mismatch`, `wrong_account`, `duplicate_reference`, `other` (+ the member note). The refund-service `tell()` becomes bilingual for `kind = 'event_order'` through `data.titleEn/bodyEn/titleSw/bodySw`; the English-only pushes of the other kinds are a known platform gap and are not changed here. Mobile `memberRouteFor` allowlist gets a case for every type above (each event notification type needs one; reuse-map §1.3).

**Outbox** (`appendOutbox` inside the same transaction as the change; payloads carry ids, status, category and ticket type, **never** payer phone, transaction ID, payment method or names): `payment.succeeded { paymentId, orderId, eventId, amountTzs, currency }` and `registration.paid { registrationId, orderId, eventId, categoryId, ticketTypeId }` at confirmation, plus the existing `registration.created` (S1 meaning kept: a paid place now exists; `contract-checker`/S5 decide whether integrations get both), `ticket.issued { ticketId, registrationId, eventId }`, `ticket.revoked { …, reason }`, `registration.cancelled` (existing) on paid cancellation, `refund.requested` / `refund.paid { refundId, orderId, eventId, scope }` (amounts omitted). Nothing is delivered to organizers in S4 (webhooks are S5); the rows exist so S5 starts with history.

### 3.17 Error codes surfaced to users (added to the S2 and S3 lists)
`payment_mode_mismatch`, `order_not_payable`, `hold_expired`, `payment_in_progress`, `payment_submitted`, `unsupported_currency`, `tickets_unavailable`, `payment_reference_required`, `payment_reference_invalid`, `payment_reference_duplicate`, `payer_phone_required`, `payer_phone_invalid`, `too_many_attempts`, `amount_required`, `amount_mismatch`, `order_amount_mismatch`, `order_buyer_mismatch`, `currency_mismatch`, `payment_row_mismatch`, `payment_already_confirmed`, `reference_already_used`, `reason_code_required`, `note_required`, `capacity_unavailable` (late path, as an outcome), `event_unavailable`, `ticket_revoked`, `ticket_not_issued`, `refund_changed`, `refund_in_progress`, `cancellation_window_closed`, `event_cancelled`, `kit_collected` (reserved for S5), `purchaser_only`, `refundable_changed`, `payment_not_unfulfilled`, `resend_limit_reached`, `not_payable_by_role`, `not_payable_this_way`, `order_not_confirmed`, `rate_limited`, plus the existing money-approval codes (`verification_required`, `cannot_approve_own_verification`, `reference_differs_from_verification`, `change_requires_confirmation`, `cannot_approve_own_request`, `cannot_pay_own_approval`, `cannot_pay_own_request`, `reference_locked_provider`, `already_decided`, `payment_changed`). Mobile: `error.reason.*` entries (§5.12). Portal: `EVENTS_ERRORS` in `src/lib/events.ts` and `money2.err.*` (already has most money codes; add the event ones, §6.9).

### 3.18 Flags and environment
| Name | Where | Default | Effect |
|---|---|---|---|
| `EVENTS_PAYMENTS_MANUAL` | server flag | off | Payment intake on the labelled manual path; needs `EVENTS_MODULE`, `EVENTS_REGISTRATION`, `MANUAL_PAY_INSTRUCTIONS` and configured Lipa Namba and `EVENT_TICKET_SECRET` to show `payment: 'manual'`. Off: S3 placeholder remains. |
| `EVENTS_PAYMENTS_TUNZAA` | server flag | off, stays off until the owner confirms Tunzaa (D1) | Event orders become mobile-money payable (§3.11); `payment: 'provider'` when effective. |
| `EVENT_TICKET_SECRET` (>= 32 chars), `EVENT_TICKET_KEY_ID` (`k1`), `EVENT_TICKET_SECRET_PREVIOUS` (JSON) | server secret store (BFast console) | unset | Ticket token derivation (§3.8.3). Unset: `payment` is `'none'` and initiation answers 503 `tickets_unavailable`. Not `QR_HMAC_SECRET`. |
| `EVENT_MANUAL_HOLD_EXTEND_HOURS` 24, `EVENT_MANUAL_HOLD_MAX_HOURS` 48, `EVENTS_ORG_HOLD_MAX_HOURS` 120, `EVENTS_PROVIDER_HOLD_EXTEND_MINUTES` 10, `EVENTS_REJECTED_RETRY_MINUTES` 60, `EVENTS_LATE_PAYMENT_GRACE_HOURS` 24 | server env (config) | as shown | Hold rules (§3.6, §3.4.1). |
| `EVENTS_MANUAL_CONFIRM_SLA_HOURS` 24, `EVENTS_REFUND_TARGET_DAYS` 5 | server env (config) | as shown | Quoted in app copy only; no code enforces them. |
| `MONEY_SECOND_APPROVER` (existing) | server flag | per prod | Applies to event payments and event refunds exactly as to others. Not changed. |
| `NEXT_PUBLIC_EVENTS_MODULE` | portal build | off | The new portal surfaces also read `options.payment`, `options.tickets`. |
| mobile | — | — | **No new dart-define.** Everything keys off `GET /events/options` (`payment`, `tickets`, `hold`, `manualConfirmHours`, `refundDays`) and `EVENTS_DISCOVERY`. |
Dormant check: with both payment flags off `GET /events/options.payment === 'none'`, no new route is reachable except reads (empty lists), and S3 order pages render as shipped.

### 3.19 Backend spec expectations (`specs/events-s4-*.specs.mjs`, CI DB only; PRD §13 scenarios 6 to 10 and the carried S3 items)
1. **Migration:** up/down; additive; `down` refuses while any `EventPayment`, `PaymentRequest.eventOrderId`, ticket or event `Refund` exists; `refund_ck` rewritten with identical predicates plus the new kind; the new partial unique indexes exist; `uncommit` accepted by the movement CHECK.
2. **Lifecycle tables:** each widening in §3.3 is allowed exactly where stated and nowhere else; `deriveOrderStatus` table; `evaluateRefund` table (each preset at boundary instants: 1 ms before and after a deadline, DST-free because instants, event timezone only for display); apportionment sums (T mod q) for many (T, q).
3. **Initiation:** manual happy path creates `PaymentRequest` + `EventPayment` with amount and currency from the order, ignoring any `amountTzs`/`currency`/`provider` in the body; replay with the same key returns the same payment (`replayed: true`), same key with another body is 409 `idempotency_key_reused`; a second attempt with a new key while one is live is 409 `payment_in_progress`; duplicate transaction ID across a shop order, a pass and an event is 409 `payment_reference_duplicate`; the sixth refused duplicate in an hour is 429; `payer_phone` and reference validators; a foreign user gets 404; flags off gives 404 `feature_disabled`; options `payment` is `'none'` without `EVENT_TICKET_SECRET` and initiation is 503.
4. **Hold:** extension on submission (to `min(cap, startsAt, now + 24 h)`), cap never exceeded across repeated rejections, provider +10 minutes, rejection retry window, expiry job does not cancel the pending request, member cancel while submitted is 409 `payment_submitted`.
5. **Scenario 6, callback twice:** two identical Tunzaa callbacks (and two admin approve clicks) produce one `succeeded` payment, one order commit, one ticket per registration, one set of outbox rows, one notification each; the second is `{ duplicate: true }` or 409 `already_decided`; `WebhookSeen` written after processing; a callback whose processing crashed midway is processed on retry.
6. **Scenario 7, success after client timeout:** the initiation response is lost; replay returns the same payment; a provider callback arriving after the app gave up confirms the order; `payment-status` then reports `confirmed`; the member does not have to act.
7. **Scenario 8, mismatch:** admin approval with `amountTzs` different from the order, or omitted, is 409 `amount_mismatch` / 400 `amount_required` with **nothing written**; a tampered `PaymentRequest.amountTzs` is `order_amount_mismatch`; a Tunzaa COMPLETED with a different amount or transaction is `held`, EventPayment `reconciliation_required`, no commit, no ticket, audit row; currency other than TZS refused; the `EventPayment`/order/request triple must agree.
8. **Scenario 9, order expires while payment unknown:** hold lapses (cap reached) with a pending payment: order `expired`, request stays pending; approval later → `rehold` succeeds (cycle + 1, `hold` then `commit` movements keyed by cycle, registrations revived, tickets issued, ledger balances) **or**, with the capacity taken by someone else meanwhile, `capacity_unavailable`: nothing oversold (`sold + held <= capacity` at every step), EventPayment `reconciliation_required`, an `unfulfilled_payment` refund approved by policy in the same transaction, ops exception raised, the admin route returns `outcome: 'refund_raised'`; a person-cancelled order is never revived; two concurrent late approvals for the last place: one rehold, one refund.
9. **Scenario 10, event cancellation:** admin cancel with N paid orders: awaiting orders released, registrations cancelled, tickets revoked, one `event_cancelled` refund per order with the right sums, orders `refund_pending`, batch id shared, re-running the batch creates nothing new, `expectedRefundableTzs` mismatch is 409, `batch-decision` under `MONEY_SECOND_APPROVER` is refused for the starter and works for another admin, refund paid → registrations `refunded` and order `refunded`, notifications once each.
10. **Member refunds:** each preset's tiers; `refund_changed` when the tier moves; `none` cancels without a refund row; `manual_review` creates only a request, approval cancels, rejection changes nothing; partial cancellation of a multi-place order (order `partially_cancelled`); double cancel is idempotent; refund bounds and live-unique indexes hold under concurrent member + admin + event cancellation; inventory `uncommit` only when `releaseInventory`.
11. **Tickets:** one active ticket per confirmed registration; token never persisted in plaintext (grep the row dump); derived token verifies against `tokenHash`; rotation invalidates the old token; revocation on cancel/refund/event cancel; claim by another person rotates and removes the purchaser's access; `no-store` header; wrong-registration token fails the MAC.
12. **Admin paths:** `productType EVENT_ORDER` in list; `beforeEventOrderPayment` cases; second approver rules unchanged; reject needs a code; `rejected → approved` change request works end to end (EventPayment `failed → succeeded`); approved payments cannot be edited back (`update`, `requestChange`, `confirmChange`); repair route and sweep fix approved-but-unconfirmed; `EVENT_ORDER` never occupies `pendingPayment` in `/me`.
13. **Tunzaa gating:** `PAYABLE` includes `EVENT_ORDER` only with the flag effective; organisation and trainer callers refused; sandbox without `TUNZAA_SANDBOX_SETTLES` never reports `provider`; the sweep confirms a lost callback and expires a stale prompt.
14. **Redactor:** allowlist property tests (§3.15). **Privacy:** organizer routes never return payer fields (snapshot test of the finance and orders payloads); `payment-status` never returns staff fields.
15. **Carried items closed:** (a) `commitOrder` has no route caller; (b) routes ignore client `holdTtlMinutes`, `feeRule`, discounts, `participantUserId`, `amountTzs`; (c) `inviteClaims` refuses unless confirmed (`order_not_confirmed`) and runs after commit only; (d) a failure creating the `PaymentRequest` rolls back the `EventPayment` and the hold extension (one transaction): the route answers 503 with nothing written, and a failed Tunzaa call at `pay()` leaves the request as it was; (e) `Refund.kind = 'event_order'` accepted by the CHECK.


---

## 4. Navigation map (mobile)

Additions to the S3 map. All inside the Member `ShellRoute` (bottom nav stays) except `/event-claim`.

| Route (`AppRoutes`) | Page | Entry points | Back and completion |
|---|---|---|---|
| `/member/events/orders/:orderId` (S3) | `MemberEventOrderPage`, now with the payment states of §5.1 | order placed, orders list, notifications 1 to 5, 7, 8 | orders list (cold: Activity) |
| `/member/events/orders/:orderId/pay` | `MemberEventPaymentPage` (§5.2, §5.3) | order page "Pay" bar, "Try again" on a rejection, "I already paid" on an expired order within the grace window, notification 3 | system back / "Back to order" → the order page. After a successful submit: `pop(true)`, the order page reloads and shows "Payment sent for checking" (the pay page is never left in the stack once submitted). A cold start on this route (notification) builds the stack Activity → order → pay |
| `/member/events/tickets` | `MemberEventOrdersPage` with the **Tickets** segment selected (§5.4) | Activity › Events › "My registrations" chip, Profile › "Event registrations", notifications 2 and 6, order page after confirmation ("Open my tickets") | pop; cold → Activity |
| `/member/events/registrations/:registrationId/ticket` | `MemberEventTicketPage` (§5.5) | tickets list, registration page Ticket card, order page participant rows, notification 2/6, after a claim | tickets list (cold: the registration page, then Activity) |
| `/member/events/registrations/:registrationId/cancel`, `/member/events/orders/:orderId/cancel` | `MemberEventCancelPage` (§5.7) | registration page / order page "Cancel and refund" (only when `allowedActions` has `cancel_refund`) | pop to where it came from; after completion `pushReplacement` to the order page (refund card visible) |
| `/event-claim` (+ `/event-claim/#<token>`) | `EventClaimPage` link mode, now with real invitations (§5.9) | the claim SMS or email, **Android App Link** | after claim → the **ticket** page when the ticket is active, else the registration page; dismiss → Activity |

Deep links from pushes: `memberRouteFor` gains one case per notification type of §3.16 (orders → order page; tickets → ticket page; refund types → order page; `event_place_cancelled_by_purchaser` → registrations list). Android App Link: `AndroidManifest.xml` adds an intent filter for `${shareBase}/event-claim/*` beside `/friend-invite/` (S3 as-built known gap; ships here). Flag off (`options.payment == 'none'`): `/…/pay` redirects to the order page (which shows the S3 placeholder); tickets and cancel routes need only `registration: true`, so a member who already paid keeps access if intake is switched off.

---

## 5. Mobile (member)

### 5.1 Order page (`MemberEventOrderPage`) by state
Header and reference as S3 §5.7. The S3 "Payment instructions: coming in the next app update" card (key `order-payment-placeholder`) renders **only** when the order response says `next.payment == 'none'` and `options.payment == 'none'`. Otherwise the payment slot is a **status card** chosen from `payment.state` (and `order.status`); the full instructions live on the pay page, not here, so the order page stays short and re-readable.

| `order.status` + `payment.state` | Card (tone) | Content | Primary action | Other |
|---|---|---|---|---|
| `awaiting_payment`, no payment | info | Countdown and hold line (S3). Amount due | **Pay · {amount}** in the sticky bar (hidden for `next.payment == 'none'`) | Cancel order (S3) |
| `awaiting_payment`, `submitted` | info, title "Payment sent for checking" | Transaction ID with copy, "Sent {time} from {phone masked}", "FitFlex confirms payments within {hours} hours", "Held until {time}" (extended hold) | — | No cancel (`payment_submitted`): line "You can't cancel while we check your payment." Poll 30 s |
| `awaiting_payment`, `processing` | info, "Approve the payment on your phone" | phone and amount; stage text | "Check status" (refresh) | "Resend prompt" is **not** offered (the server refuses a second prompt); after 2 minutes the `slow` stage wording of `MobileMoneyPayPanel` |
| `awaiting_payment`, `rejected` | warning | Reason text by `rejectCode` (§5.12) plus `memberNote` verbatim; "Held until {time}" or "Your hold has ended" | **Try again** (if `canRetry`) → pay page prefilled | Cancel order |
| `awaiting_payment`, `failed` or `expired` (provider) | warning | "The payment didn't go through" + support line with the reference | **Try again** | Cancel order |
| `expired`, no payment | gray (S3) | S3 expired view | Register again (S3); inside the grace window also text link **I already paid** → pay page in late mode | — |
| `expired`, `submitted` (late) | warning | "Your hold ended while we were checking" + refund-in-full promise wording of §5.11 | — | — |
| any, `needs_attention` + refund | danger-neutral (never green) | "Your places weren't available. A full refund of {amount} is being prepared." + refund card | — | — |
| `confirmed`, `confirmed` | success, "Payment confirmed" | "{n} ticket(s) for {event} are ready" | **Open my tickets** | Participants list with ticket state per row and invitation chips (below) |
| `partially_cancelled`, `refund_pending`, `refunded`, `cancelled` (paid) | by status pill | Refund cards (§5.7) | — | — |

Participants list (confirmed and later): per row name, category, status pill (§5.10), chips You / Claimed / Awaiting claim, and for places the viewer can see a **Show ticket** button; for unclaimed non-self places the chip line adds "Invitation sent {date}" or "No invitation sent yet" with **Send invitation again** (opens a confirm dialog: "This creates a new link. The old link stops working."). A place whose participant has claimed it shows the S3 masked purchaser view and no ticket button (§3.8.5). Polling: 60 s while `awaiting_payment` with no live payment (S3), **30 s while a payment is live**, stop at a decided state; refresh on resume. Offline: last cached order with an `FFAlert` "You're offline"; actions disabled.
Semantics: the status card is a polite live region (`liveRegion: true`); a state change is announced once ("Payment confirmed. 2 tickets ready."). The sticky Pay bar is a button labelled "Pay {amount} for order EV-…".

### 5.2 Payment page, manual mode (`MemberEventPaymentPage`)
Phone (375 px): single column, 16 dp gutters, sticky bottom bar (64 dp). Flutter web >= 840 px: content column max 640 px centred, bar spans the column.
Layout top to bottom:
1. `FFPageHeader(title: Pay for your tickets, subtitle: event title)`.
2. **Labelled-manual `FFAlert.info`** (non-dismissible, always first): title "Manual confirmation: FitFlex checks your payment", body with the hours from `options.manualConfirmHours`. Copy rules in §5.11.
3. Order recap `FFCard`: reference with copy, "{n} places", **Pay exactly TSh 120,000** (large, tabular figures), hold countdown (`FFCountdownText`, polite live region).
4. **Steps** — `ManualPaymentSteps(manual: ManualPayment.fromOptions({'manual': next.instructions}), amountLabel)`: the Lipa Namba large with copy button, account name, network, admin instructions in the member's language (falls back to the other). Unchanged widget, unchanged `manualPay.*` keys.
5. **Form** — `ManualPaymentFields` (`TransactionIdField` + payer phone, validators `transactionIdError`, `payerPhoneError`; phone prefilled from the profile through `prefillPhone`). Helper text of the existing keys.
6. Confirmation checkbox row (48 dp): "I paid {amount} to {name} from this number". Submit stays disabled until both fields validate and the box is ticked.
7. Bottom bar: ghost **Back to order**, primary **I have paid · Send for checking** (`loading` while sending). On web, Enter in the last field submits.

States:
- **Loading** (options/order): `FFSkeletonList`; **error**: `FFErrorState` with retry.
- **Offline**: form readable, submit disabled, `FFAlert` "You're offline".
- **Submitting**: one request per tap (button disabled); `Idempotency-Key` created with `newCheckoutKey()` and **reused** for an identical signature (reference + phone), renewed when either changes (`CheckoutAttempt.forPurchase` pattern). 5xx or timeout → `orderOutcomeUnknown` dialog: "We couldn't tell if it was sent. Check your order before sending again." with **Open my order** (the order page shows "Payment sent for checking" if the server recorded it); the form is not cleared.
- **Server refusals** inline: `payment_reference_invalid|required|duplicate` on the transaction ID field (`TransactionIdField` error), `payer_phone_*` on the phone, `too_many_attempts` as an `FFAlert` with the wait, `payment_in_progress` → go to the order page, `hold_expired` → expired view, `order_not_payable`, `payment_mode_mismatch` → reload options and re-render the right mode, `unsupported_currency`/`tickets_unavailable` → "Payment isn't available right now" (nothing is submitted).
- **Late mode** (order expired within the grace window): extra `FFAlert.warning` (§5.12 `events.pay.late.*`) above the steps; the Steps card and the amount stay (they may still need to pay, but the banner tells them to send the ID **only if they already paid**); primary label **Send my transaction ID**.
- **Success**: `pop(true)`; order page shows "Payment sent for checking"; `FFSnack.success` "Sent for checking". Never a green "paid" visual here.

### 5.3 Variants: provider mode and free orders
- **Provider mode** (`options.payment == 'provider'`, hidden otherwise): the page shows items 1, 3 and a single primary **Pay with mobile money · {amount}** (no Lipa Namba, no transaction ID field). Tap → `POST /me/event-orders/:id/payment` (`Idempotency-Key`, empty body) → `offerMobileMoney(context, paymentRequestId, amountTzs, productType: 'EVENT_ORDER')`, the existing sheet (`MobileMoneyPayPanel`, stages input / sending / waiting / success / failed / held / slow, sandbox test-mode notice). `momoOffers` false (role, flag, unreachable) → the page shows `events.pay.provider.unavailable` and no other path (never silently falls back to Lipa Namba: the mode is the server's choice). On sheet success the order page reloads; a sheet dismissed mid-flight leaves the order page at `processing`. The sheet copy stays the existing `momo.*` keys; it never says "instant". The labelled-manual banner is **not** shown in this mode.
- **Free order** (`totalTzs == 0`): the order page's bar says **Confirm free registration**; one tap → `POST …/payment {}` → confirmed state. No instructions or fields.

### 5.4 Tickets wallet (segment on `MemberEventOrdersPage`)
`FFSegmented` becomes **Tickets** / Tiketi · **Registrations** / Usajili · **Orders** / Oda when `options.tickets.qr`; default Tickets when the member has at least one active ticket, else Registrations (S3 default). Three segments of SW labels fit 343 dp at 1.3×.
List from `GET /me/event-tickets` (`RefreshIndicator`, `FFSkeletonList(3)`, infinite scroll, `FFErrorState`, offline → cached list + `FFAlert`). Sections "Upcoming" / "Past and cancelled". Card (single button): event title, date and time in the event's zone, category and ticket type, participant name, relation chip (You / Registered by you / …), state badge (**Ticket ready** success / **Cancelled** gray / **Event cancelled** gray), displayCode muted, trailing "Show ticket". Semantics "Dar Half Marathon, 10K, Asha Mollel, Ticket ready, button". Empty: `FFEmptyState` icon `confirmation_number`, "No tickets yet", body "Your tickets appear here once your payment is confirmed.", action "Browse events". Revoked rows open the ticket page in its explanation state (§5.5).

### 5.5 Ticket page (`MemberEventTicketPage`)
Contents: `FFPageHeader` (event title, date/time in the event zone), the **QR** in a white `FFCard` at the fixed `qrInk`/`qrBackground` colours via `FFQrCode`, min 240 dp, up to 320 dp on wide layouts, 24 dp quiet zone (contrast is fixed; dark theme still shows the white card), below it participant name, category, ticket type, **ticket number** `T-3F9A2B` with a copy `IconButton` (tooltip), state badge, then:
- `FFAlert.info`: while `scanning == false`: "Kit collection scanning isn't live yet. Keep this code; the organizer will confirm where and when to collect your kit." (**S4 makes no claim that the code gets anyone into anything.** When S5 flips `tickets.scanning` the wording becomes "Show this code at the kit collection point."). 
- Purchaser-for-another, unclaimed: `FFAlert.info` "You can see this ticket until {name} claims it."
- Actions: ghost **Get a new code** (confirm dialog; `POST …/ticket/rotate`; snack "New code ready"; the QR re-renders), text link **View registration**. No share button (the QR is a bearer for a one-time handover; sharing is by claim invitation).
States: loading skeleton; **error** `FFErrorState`; **offline with cache** → cached QR plus chip "Saved on this phone · updated {time}" and `FFAlert` "You're offline. Showing the saved code."; **offline, no cache** → `FFErrorState`; **revoked** (409 `ticket_revoked { reason }`) → the QR is **not drawn**; a gray card "Ticket cancelled" / "Event cancelled" / "Ticket refunded" with "This code no longer works."; **claimed elsewhere** (404 after the purchaser lost access) → "{name} claimed this ticket. It is now in their app." with the cache entry deleted; **not issued** → back to the order page. The ticket number and the full state are readable text so a screen-reader user never depends on the QR.

### 5.6 Registration page changes (S3 §5.9)
Ticket card: active → compact QR thumbnail is **not** shown (privacy on shared screens); instead state badge, ticket number and **Show ticket**; revoked → reason; reserved → the S3 placeholder sentence (kept); confirmed-without-ticket (should not happen) → "Your ticket is being prepared" with a refresh. Status banner for `confirmed`: success "Confirmed · paid". Actions for the purchaser: **Cancel and refund** (when `allowedActions` has it) and, for an unclaimed non-self place, **Send invitation again**. Refund card when a refund exists for this place. The S3 emergency-contact and masked-view rules are unchanged.

### 5.7 Cancel and refund (`MemberEventCancelPage`)
One page for a single place (from the registration page) or the whole order (from the order page; corporate is portal only).
1. **Loading** the preview (`cancel-preview`); skeleton; error with retry.
2. **Summary** `FFCard`: what is cancelled (participants list for an order), the organizer's refund policy (snapshot text in the member's language, then the generated line, e.g. "Full refund until 12 Nov 2026", "50% until 5 Dec"), and the **refund amount** large: "You'll get back TSh 40,000" / "…TSh 20,000 (50% of TSh 40,000)" / "No refund…" / "needs review…". Deadline line when relevant.
3. **Reason** `FFChoiceTile` group (S3 closed set). **No-refund** adds an acknowledgement checkbox. **Review** mode relabels the action "Ask for a refund".
4. **Action** (destructive `FFButton`, label by mode, full width in the bar) → confirmation `FFDialog` ("This can't be undone. Your place may be given to someone else.") → `POST …/cancel { reason, expectedRefundTzs }`.
5. **Blocked** states (from `blocked`): `FFAlert` with the specific text of §5.12 and no action (`payment_submitted`, `refund_in_progress`, `cancellation_window_closed`, `event_cancelled` (shows the refund promise), `purchaser_only` (names the purchaser), `kit_collected`).
6. **Result**: `refund_changed` → alert "The refund amount changed" and the preview re-renders for a second confirmation; success → `pushReplacement` to the order page with the refund card; a snack states the outcome.
**Refund card** (shared by order and registration pages): status badge (Requested / Approved / Sent / Not approved, text first), amount, scope label, requested date, "FitFlex sends refunds by hand, usually within {days} working days" while open, "Sent to {phone masked} · reference {ref}" when paid, the rejection note when rejected plus "Contact support". Never green until paid.

### 5.8 Ticket cache on the device
`events_ticket_cache.dart` keeps the last successful `GET …/ticket` payload per registration (token, state, display fields, `savedAt`) in the same app-private storage the kept link tokens use (security reviewer to confirm that storage; no new package). Written on every successful read and after rotation; **deleted** on sign-out, on a revoked or claimed-elsewhere answer, and 30 days after the event. Never written to logs, analytics, screenshots of the task switcher are not prevented (the QR is a kit-handover bearer, not an access credential; stated to the owner). The list (`GET /me/event-tickets`) is cached like other event lists (`events_cache.dart`) without tokens.

### 5.9 Claim landing, now live
`EventClaimPage` link mode is unchanged in mechanics (S3 §5.11): `/event-claim/#<token>` kept 24 h by `KeptLinkToken`, sign-in redirect, masked preview. Changes: (1) the preview `status == 'confirmed'` adds "This place is paid and confirmed. Claim it to get your ticket."; a `reserved` preview (a link minted by a resend before payment cannot exist, but handle it) keeps the S3 text; (2) success → snack "Place claimed" and `pushReplacement` to the **ticket page** when the ticket is active; (3) `claim_token_expired` gains "Ask {purchaserFirst} to send the invitation again" (the resend of §3.10); (4) `registration_closed_state` covers cancelled and refunded places ("This registration is no longer active"); (5) Android App Link opens the app straight on `/event-claim`; Flutter web opens the same route in the browser. Everything else (verified-contact rule, `claim_not_verified`, `already_claimed`, `claim_own_contact`) is as shipped.

### 5.10 Status vocabulary (extends S3 §5.10)
| State | Tone | EN | SW |
|---|---|---|---|
| Order `confirmed` | success | Paid | Imelipwa |
| Order `partially_cancelled` | warning | Partly cancelled | Imeghairiwa kwa sehemu |
| Order `refund_pending` | warning | Refund pending | Marejesho yanasubiriwa |
| Order `refunded` | gray | Refunded | Imerejeshwa |
| Registration `confirmed` | success | Confirmed | Imethibitishwa |
| Registration `refunded` | gray | Refunded | Imerejeshwa |
| Payment `submitted` | info | Under review | Inakaguliwa |
| Payment `processing` | info | Waiting for your phone | Inasubiri simu yako |
| Payment `rejected` / `failed` | warning | Not confirmed / Didn't go through | Haijathibitishwa / Imeshindikana |
| Payment `needs_attention` | warning | Being checked | Inachunguzwa |
| Ticket active / revoked | success / gray | Ticket ready / Ticket cancelled | Tiketi iko tayari / Tiketi imeghairiwa |
| Refund requested / approved / paid / rejected | info / info / success / warning | Requested / Approved / Sent / Not approved | Imeombwa / Imeidhinishwa / Imetumwa / Hayajaidhinishwa |
Order = "oda" (glossary); the pills use the i-class forms as in S3; "tiketi" for both a bought place and the entry code (D22). A green tone is used **only** for `confirmed` order/registration, `Ticket ready` and a refund that has been sent.

### 5.11 Copy rules for the labelled manual path (PAY-005, PRD §9 payment safety; testable)
1. Every screen where a member can pay or has paid manually shows the badge "Manual confirmation" / "Uthibitisho wa mkono" and states who confirms and the target time ("FitFlex staff", "within {hours} hours").
2. **Forbidden** in any string under `events.pay.*`, `notification` bodies for payments, and the ticket/cancel/refund strings: EN "instant", "instantly", "immediately", "automatic", "automatically", "real-time", "payment successful", "paid" used to say that FitFlex has received the money (allowed only as the member's own first-person claim: "I paid", "I have paid", "I already paid", "if you already paid"; as the order status "Paid" after server confirmation; and in "paid and confirmed" about a confirmed place); SW "papo hapo", "mara moja", "kiotomatiki", "malipo yamefanikiwa" (before confirmation). A unit test scans these key groups for the forbidden stems (`test/events/events_copy_rules_test.dart`).
3. After submitting, the screen says "sent for checking", never "paid" or "successful"; the badge is "Under review"; no ticket is drawn; no green.
4. Tickets and the "Payment confirmed" state appear **only** from server state (`order.status == confirmed`, a ticket row), never from the app's own action or a returning navigation.
5. The refund promise on a late or unfulfilled payment is stated exactly as the server behaves (re-reserve if possible, otherwise refund in full) and never says when money will arrive beyond the configured working-days target.
6. Provider mode may say "approve on your phone" but follows rules 2 to 4; the existing `momo.*` strings are checked by the same test.

### 5.12 Mobile i18n keys (`lib/shared/i18n.dart`, both maps; parity test picks them up). Swahili drafts need native review
Prefixes `events.pay.*`, `events.ticket.*`, `events.tickets.*`, `events.cancelpaid.*`, `events.refund.*`, `events.invite.*`, `error.reason.*`. Existing `manualPay.*`, `momo.*`, `common.copy`, `common.copied` are reused as they are. `{x}` placeholders go through the existing formatter.

| Key | EN | SW (draft) |
|---|---|---|
| `events.pay.title` | Pay for your tickets | Lipia tiketi zako |
| `events.pay.cta` | Pay · {amount} | Lipa · {amount} |
| `events.pay.cta.a11y` | Pay {amount} for order {ref} | Lipa {amount} kwa oda {ref} |
| `events.pay.manual.badge` | Manual confirmation | Uthibitisho wa mkono |
| `events.pay.manual.banner.title` | Manual confirmation: FitFlex checks your payment | Uthibitisho wa mkono: FitFlex inakagua malipo yako |
| `events.pay.manual.banner.body` | You pay the Lipa Namba from your phone, then send us the transaction ID. FitFlex staff check it against the till statement, within {hours} hours. Your tickets appear after FitFlex confirms it. | Unalipa Lipa Namba kwa simu yako, kisha unatutumia namba ya muamala. Wafanyakazi wa FitFlex wanaikagua kwenye taarifa ya Lipa Namba, ndani ya saa {hours}. Tiketi zako zitaonekana baada ya FitFlex kuthibitisha. |
| `events.pay.recap.title` | Your order | Oda yako |
| `events.pay.exact` | Pay exactly {amount} | Lipa kiasi kamili: {amount} |
| `events.pay.confirmCheck` | I paid {amount} to {name} from this number | Nimelipa {amount} kwa {name} kutoka namba hii |
| `events.pay.submit` | I have paid · Send for checking | Nimelipa · Tuma ikaguliwe |
| `events.pay.sending` | Sending… | Inatuma… |
| `events.pay.sent.snack` | Sent for checking | Imetumwa ikaguliwe |
| `events.pay.late.banner.title` | Your hold ended | Muda wa kushikilia umeisha |
| `events.pay.late.banner.body` | Send your transaction ID only if you already paid. We'll try to re-reserve your places; if they are gone we'll refund you in full. Don't pay again. | Tuma namba ya muamala ikiwa tayari umelipa tu. Tutajaribu kukuwekea tiketi tena; zikiwa zimeisha tutakurejeshea pesa zote. Usilipe tena. |
| `events.pay.late.cta` | Send my transaction ID | Tuma namba yangu ya muamala |
| `events.pay.alreadyPaid` | I already paid | Nimeshalipa |
| `events.pay.uncertain.title` | We couldn't tell if it was sent | Hatukuweza kujua kama imetumwa |
| `events.pay.uncertain.body` | Check your order before sending again. If it says "Payment sent for checking", you're done. | Angalia oda yako kabla ya kutuma tena. Ikisema "Malipo yametumwa kukaguliwa", umemaliza. |
| `events.pay.uncertain.open` | Open my order | Fungua oda yangu |
| `events.pay.provider.cta` | Pay with mobile money · {amount} | Lipa kwa simu · {amount} |
| `events.pay.provider.unavailable` | Mobile money isn't available right now. Try again later. | Malipo kwa simu hayapatikani kwa sasa. Jaribu tena baadaye. |
| `events.pay.free.cta` | Confirm free registration | Thibitisha usajili wa bure |
| `events.pay.free.done` | Registered. Your tickets are ready. | Umesajiliwa. Tiketi zako ziko tayari. |
| `events.pay.submitted.title` | Payment sent for checking | Malipo yametumwa kukaguliwa |
| `events.pay.submitted.body` | We have your transaction ID {ref}. FitFlex confirms payments within {hours} hours. Your places are held until {time}. | Tumepokea namba yako ya muamala {ref}. FitFlex huthibitisha malipo ndani ya saa {hours}. Tiketi zako zimeshikiliwa hadi {time}. |
| `events.pay.submitted.sent` | Sent {time} from {phone} | Imetumwa {time} kutoka {phone} |
| `events.pay.submitted.noCancel` | You can't cancel while we check your payment. | Huwezi kughairi tunapokagua malipo yako. |
| `events.pay.processing.title` | Approve the payment on your phone | Thibitisha malipo kwenye simu yako |
| `events.pay.processing.body` | We asked {phone} to approve {amount}. This page updates when the network answers. | Tumeomba {phone} kuthibitisha {amount}. Ukurasa huu utasasishwa mtandao ukijibu. |
| `events.pay.rejected.title` | We couldn't confirm your payment | Hatukuweza kuthibitisha malipo yako |
| `events.pay.rejected.reference_not_found` | We couldn't find that transaction ID on our statement. Check it and send it again. | Hatukupata namba hiyo ya muamala kwenye taarifa yetu. Iangalie na uitume tena. |
| `events.pay.rejected.amount_mismatch` | The amount we received was different from {amount}. | Kiasi tulichopokea kilikuwa tofauti na {amount}. |
| `events.pay.rejected.wrong_account` | The payment went to a different number. Pay the Lipa Namba shown, then send the new ID. | Malipo yalikwenda namba nyingine. Lipa Lipa Namba iliyoonyeshwa, kisha tuma namba mpya ya muamala. |
| `events.pay.rejected.duplicate_reference` | That transaction ID was already used for another payment. | Namba hiyo ya muamala ilishatumika kwa malipo mengine. |
| `events.pay.rejected.other` | Please check the details and try again, or contact support. | Tafadhali angalia taarifa na ujaribu tena, au wasiliana na msaada. |
| `events.pay.rejected.retry` | Try again · held until {time} | Jaribu tena · imeshikiliwa hadi {time} |
| `events.pay.rejected.noHold` | Your hold has ended, so these places were released. | Muda wa kushikilia umeisha, kwa hiyo tiketi zimeachiliwa. |
| `events.pay.failed.title` | The payment didn't go through | Malipo yameshindikana |
| `events.pay.failed.body` | If money left your phone, contact support with {ref}. | Ikiwa pesa zilitoka kwenye simu yako, wasiliana na msaada ukiwa na {ref}. |
| `events.pay.confirmed.title` | Payment confirmed | Malipo yamethibitishwa |
| `events.pay.confirmed.body` | {n} ticket(s) for {event} are ready. | Tiketi {n} za {event} ziko tayari. |
| `events.pay.confirmed.open` | Open my tickets | Fungua tiketi zangu |
| `events.pay.expiredPending.title` | Your hold ended while we were checking | Muda wa kushikilia uliisha tulipokuwa tukikagua |
| `events.pay.expiredPending.body` | If your payment checks out we'll try to re-reserve your places; if they are gone we'll refund you in full. Don't pay again. | Malipo yako yakithibitishwa tutajaribu kukuwekea tiketi tena; zikiwa zimeisha tutakurejeshea pesa zote. Usilipe tena. |
| `events.pay.refundDue.title` | Your places weren't available | Tiketi hazikuwepo |
| `events.pay.refundDue.body` | We received your payment but couldn't keep your places. A full refund of {amount} is being prepared. | Tumepokea malipo yako lakini hatukuweza kuhifadhi tiketi zako. Marejesho kamili ya {amount} yanaandaliwa. |
| `events.order.status.partiallyCancelled` | Partly cancelled | Imeghairiwa kwa sehemu |
| `events.order.status.refundPending` | Refund pending | Marejesho yanasubiriwa |
| `events.order.status.refunded` | Refunded | Imerejeshwa |
| `events.payment.status.submitted` | Under review | Inakaguliwa |
| `events.payment.status.processing` | Waiting for your phone | Inasubiri simu yako |
| `events.payment.status.rejected` | Not confirmed | Haijathibitishwa |
| `events.payment.status.failed` | Didn't go through | Imeshindikana |
| `events.payment.status.needs_attention` | Being checked | Inachunguzwa |
| `events.tickets.title` | Tickets | Tiketi |
| `events.tickets.section.upcoming` | Upcoming | Zijazo |
| `events.tickets.section.past` | Past and cancelled | Zilizopita na zilizoghairiwa |
| `events.tickets.empty.title` | No tickets yet | Bado hakuna tiketi |
| `events.tickets.empty.body` | Your tickets appear here once your payment is confirmed. | Tiketi zako zitaonekana hapa malipo yako yakithibitishwa. |
| `events.ticket.ready` | Ticket ready | Tiketi iko tayari |
| `events.ticket.show` | Show ticket | Onyesha tiketi |
| `events.ticket.number` | Ticket number {code} | Namba ya tiketi {code} |
| `events.ticket.copy` | Copy ticket number | Nakili namba ya tiketi |
| `events.ticket.qr.a11y` | Entry QR code for {name}, {category}. It cannot be read aloud; your ticket number is {code}. | Msimbo wa QR wa kuingia wa {name}, {category}. Hauwezi kusomwa kwa sauti; namba ya tiketi yako ni {code}. |
| `events.ticket.scan.soon` | Kit collection scanning isn't live yet. Keep this code; the organizer will confirm where and when to collect your kit. | Uskanaji wa kuchukua vifaa vya mbio bado haujaanza. Hifadhi msimbo huu; mwandaaji atathibitisha wapi na lini utachukua vifaa vyako vya mbio. |
| `events.ticket.scan.live` | Show this code at the kit collection point. | Onyesha msimbo huu mahali pa kuchukua vifaa vya mbio. |
| `events.ticket.cached` | Saved on this phone · updated {time} | Imehifadhiwa kwenye simu hii · ilisasishwa {time} |
| `events.ticket.offline` | You're offline. Showing the saved code. | Huna mtandao. Inaonyesha msimbo uliohifadhiwa. |
| `events.ticket.handover` | You can see this ticket until {name} claims it. | Unaweza kuona tiketi hii hadi {name} aichukue. |
| `events.ticket.claimedElsewhere` | {name} claimed this ticket. It is now in their app. | {name} ameichukua tiketi hii. Sasa iko kwenye app yake. |
| `events.ticket.revoked.cancelled` | Ticket cancelled | Tiketi imeghairiwa |
| `events.ticket.revoked.event_cancelled` | Event cancelled | Tukio limeghairiwa |
| `events.ticket.revoked.refunded` | Ticket refunded | Tiketi imerejeshewa |
| `events.ticket.revoked.body` | This code no longer works. | Msimbo huu hautumiki tena. |
| `events.ticket.rotate` | Get a new code | Pata msimbo mpya |
| `events.ticket.rotate.title` | Get a new code? | Pata msimbo mpya? |
| `events.ticket.rotate.body` | The old code stops working, including any screenshot. Use this if you shared it by mistake. | Msimbo wa zamani utaacha kufanya kazi, pamoja na picha za skrini. Tumia hii ukiwa umeushiriki kimakosa. |
| `events.ticket.rotate.done` | New code ready | Msimbo mpya uko tayari |
| `events.cancelpaid.title` | Cancel and refund | Ghairi na rejesha |
| `events.cancelpaid.policy` | The organizer's refund policy | Sera ya marejesho ya mwandaaji |
| `events.cancelpaid.refund.full` | You'll get back {amount}. | Utarejeshewa {amount}. |
| `events.cancelpaid.refund.partial` | You'll get back {amount} ({percent}% of {paid}). | Utarejeshewa {amount} ({percent}% ya {paid}). |
| `events.cancelpaid.refund.until` | This refund is available until {date}. | Marejesho haya yanapatikana hadi {date}. |
| `events.cancelpaid.refund.none` | No refund. The organizer's policy gives no refund at this time. | Hakuna marejesho. Sera ya mwandaaji haitoi marejesho kwa wakati huu. |
| `events.cancelpaid.refund.review` | The organizer's policy needs a person to review your request. We'll tell you what you can get back. | Sera ya mwandaaji inahitaji mtu akague ombi lako. Tutakuambia kiasi utakachorejeshewa. |
| `events.cancelpaid.ack` | I understand I won't get money back | Naelewa sitarejeshewa pesa |
| `events.cancelpaid.reason` | Why are you cancelling? | Kwa nini unaghairi? |
| `events.cancelpaid.cta.refund` | Cancel · refund {amount} | Ghairi · rejesha {amount} |
| `events.cancelpaid.cta.none` | Cancel ticket · no refund | Ghairi tiketi · bila marejesho |
| `events.cancelpaid.cta.review` | Ask for a refund | Omba marejesho |
| `events.cancelpaid.warn` | This can't be undone. Your place may be given to someone else. | Hili haliwezi kutenduliwa. Tiketi yako inaweza kupewa mtu mwingine. |
| `events.cancelpaid.changed` | The refund amount changed. Check it and confirm again. | Kiasi cha marejesho kimebadilika. Kiangalie na uthibitishe tena. |
| `events.cancelpaid.done.refund` | Ticket cancelled. Refund of {amount} requested. | Tiketi imeghairiwa. Marejesho ya {amount} yameombwa. |
| `events.cancelpaid.done.none` | Ticket cancelled. | Tiketi imeghairiwa. |
| `events.cancelpaid.done.review` | Request sent. We'll reply soon. | Ombi limetumwa. Tutajibu hivi karibuni. |
| `events.cancelpaid.blocked.payment_submitted` | We're still checking your payment. You can cancel once it's confirmed. | Bado tunakagua malipo yako. Unaweza kughairi yakishathibitishwa. |
| `events.cancelpaid.blocked.refund_in_progress` | A refund for this ticket is already in progress. | Marejesho ya tiketi hii tayari yanaendelea. |
| `events.cancelpaid.blocked.cancellation_window_closed` | Cancellations have closed for this event. | Kughairi kumefungwa kwa tukio hili. |
| `events.cancelpaid.blocked.event_cancelled` | This event was cancelled. FitFlex will refund what you paid. | Tukio hili limeghairiwa. FitFlex itarejesha ulicholipa. |
| `events.cancelpaid.blocked.purchaser_only` | Only {name}, who paid, can cancel this ticket. | {name} aliyelipa pekee ndiye anaweza kughairi tiketi hii. |
| `events.cancelpaid.blocked.kit_collected` | The kit for this ticket has been collected. | Vifaa vya mbio vya tiketi hii vimeshachukuliwa. |
| `events.refund.title` | Refund | Marejesho |
| `events.refund.status.requested` | Requested | Imeombwa |
| `events.refund.status.approved` | Approved | Imeidhinishwa |
| `events.refund.status.paid` | Sent | Imetumwa |
| `events.refund.status.rejected` | Not approved | Hayajaidhinishwa |
| `events.refund.eta` | FitFlex sends refunds by hand, usually within {days} working days. | FitFlex hutuma marejesho kwa mkono, kwa kawaida ndani ya siku {days} za kazi. |
| `events.refund.sentTo` | Sent to {phone} · reference {ref} | Imetumwa kwa {phone} · kumbukumbu {ref} |
| `events.refund.rejected.help` | Contact support if you think this is wrong. | Wasiliana na msaada ikiwa unadhani si sahihi. |
| `events.refund.scope.registration` | One ticket | Tiketi moja |
| `events.refund.scope.order` | Whole order | Oda nzima |
| `events.refund.scope.event_cancelled` | Event cancelled | Tukio limeghairiwa |
| `events.refund.scope.unfulfilled_payment` | Payment returned | Malipo yamerudishwa |
| `events.invite.sent` | Invitation sent {date} | Mwaliko ulitumwa {date} |
| `events.invite.notSent` | No invitation sent yet | Hakuna mwaliko uliotumwa bado |
| `events.invite.resend` | Send invitation again | Tuma mwaliko tena |
| `events.invite.resend.body` | This creates a new link. The old link stops working. | Hii inatengeneza kiungo kipya. Kiungo cha zamani kitaacha kufanya kazi. |
| `events.invite.resent` | Invitation sent | Mwaliko umetumwa |
| `events.invite.limit` | You've reached the limit for sending this invitation. | Umefikia kikomo cha kutuma mwaliko huu. |
| `events.claim.paid` | This place is paid and confirmed. Claim it to get your ticket. | Tiketi hii imelipiwa na kuthibitishwa. Ichukue upate tiketi yako. |
| `error.reason.payment_in_progress` | A payment for this order is already in progress. | Malipo ya oda hii tayari yanaendelea. |
| `error.reason.order_not_payable` | This order can't be paid any more. | Oda hii haiwezi kulipiwa tena. |
| `error.reason.hold_expired` | The hold on these places has ended. | Muda wa kushikilia tiketi hizi umeisha. |
| `error.reason.payment_submitted` | We're checking your payment. | Tunakagua malipo yako. |
| `error.reason.tickets_unavailable` | Payments aren't available right now. | Malipo hayapatikani kwa sasa. |
| `error.reason.unsupported_currency` | This order can't be paid in the app. | Oda hii haiwezi kulipiwa kwenye app. |
| `error.reason.payment_mode_mismatch` | The way to pay changed. We're refreshing. | Njia ya kulipa imebadilika. Tunasasisha. |
| `error.reason.ticket_revoked` | This ticket was cancelled. | Tiketi hii imeghairiwa. |
| `error.reason.ticket_not_issued` | Your ticket isn't ready yet. | Tiketi yako bado haijawa tayari. |
| `error.reason.refund_changed` | The refund amount changed. | Kiasi cha marejesho kimebadilika. |
| `error.reason.refund_in_progress` | A refund is already in progress. | Marejesho yanaendelea tayari. |
| `error.reason.cancellation_window_closed` | Cancellations have closed. | Kughairi kumefungwa. |
| `error.reason.purchaser_only` | Only the person who paid can do this. | Aliyelipa pekee ndiye anaweza kufanya hili. |
| `error.reason.resend_limit_reached` | You've reached the limit for this invitation. | Umefikia kikomo cha mwaliko huu. |

### 5.13 Accessibility and analytics
- **Semantics:** every actionable control is labelled: Pay bar ("Pay TSh 120,000 for order EV-…, button"), copy buttons (tooltip + label), transaction-ID and phone fields (labels from `TransactionIdField`), the confirmation checkbox (checked state), "Send for checking", ticket cards (composed label), "Show ticket", "Get a new code", the cancel reason radios (radio group), refund cards (heading + status text). The status card is a polite live region and announces a change once; the countdown is a polite live region at minute granularity; errors are `assertive` once.
- **Focus order:** page heading → labelled-manual alert → recap → steps (Lipa Namba copy) → transaction ID → phone → checkbox → bottom bar (Back, Submit) last. On route entry focus moves to the heading (`FocusNode` + `Semantics(header: true)`). After a successful submit, focus on the order page lands on the status card heading. Dialogs trap focus and restore it.
- **The QR is not the only carrier of information:** the ticket number, state and participant are text; the painted code is `ExcludeSemantics` with the page's `events.ticket.qr.a11y` label on its container; contrast of the code is fixed ink on white (not theme-driven); a 24 dp quiet zone.
- **Touch targets** >= 44 dp (checkbox rows 48, segments 44, copy buttons 44 × 44, list cards 56+). **Contrast** body >= 4.5:1 in light and dark; Fuel only for "act soon" text (countdown under 5 minutes), never for money state; no state is conveyed by colour alone (text + icon).
- **Swahili length:** "Nimelipa · Tuma ikaguliwe" and "Ghairi · rejesha TSh 1,250,000" must fit the 64 dp bar at 375 px and 1.3× font scale (wrap to two lines allowed, the bar grows); the three segments fit; goldens at 375 px.
- **Analytics** (no personal data; no-op hook until S7): `payment_started { orderId, mode, late }`, `payment_submitted { orderId, late }`, `payment_state_seen { orderId, state }` (once per state), `ticket_opened { registrationId }`, `ticket_rotated`, `cancel_preview_viewed { scope, mode }`, `cancel_confirmed { scope, mode }`, `invitation_resent`. Server events of §3.15 are the truth.

### 5.14 Widget tests (`test/events/*`, `RecordingApi` + `pumpPage`, fixtures extended)
- `member_event_order_page_test.dart` (extend): placeholder only when `payment == 'none'`; each row of the §5.1 table renders its card, tone and primary action; `submitted` hides cancel; polling 30 s vs 60 s; confirmed shows ticket buttons and invitation chips; no green anywhere before `confirmed`.
- `member_event_payment_page_test.dart`: labelled-manual alert first; steps use `next.instructions`; submit disabled until valid and checked; idempotency key created, **reused** for an identical retry, renewed on change; amount and currency never in the request body; 5xx → uncertain dialog and form kept; each server refusal maps to its field/alert; late mode copy and label; provider mode shows the single button, no Lipa Namba, and calls `offerMobileMoney` with `EVENT_ORDER`; free order button; offline disables submit; focus order.
- `events_copy_rules_test.dart`: forbidden stems absent from the §5.11 key groups in EN and SW; every `events.pay.*` key present in both maps.
- `member_event_tickets_test.dart`: segment appears with `tickets.qr`; list sections, states, empty/error/offline; card semantics.
- `member_event_ticket_page_test.dart`: QR drawn from `qrPayload`, ticket number readable, scan note by `scanning`; revoked draws **no** QR; rotate confirm and re-render; cache write/read/delete (sign-out, revoked, claimed elsewhere); offline with and without cache; handover note.
- `member_event_cancel_page_test.dart`: preview by mode (full, partial, none with acknowledgement, review), blocked reasons, `expectedRefundTzs` sent, `refund_changed` re-confirm, success navigation, refund card states.
- `event_claim_page_test.dart` (extend): paid-and-confirmed copy, success → ticket page, expired → "ask to send again", cancelled → inactive text.
- `events_i18n_router_test.dart` (extend): new routes build, flag-off redirects, `memberRouteFor` cases, i18n parity.

### 5.15 Acceptance criteria (M-P-)
- M-P-1 With `options.payment == 'none'` the order page shows the S3 placeholder and nothing from this spec renders (byte-identical S3 behaviour); with `'manual'` or `'provider'` it never shows the placeholder.
- M-P-2 The pay page in manual mode starts with the "Manual confirmation" alert and shows the Lipa Namba, account name, network, the admin's instructions in the member's language, the exact amount, the order reference, a transaction-ID field, a payer-phone field (prefilled) and the confirmation checkbox; Submit is disabled until all are valid.
- M-P-3 No string on the manual path claims instant or automatic payment, success before confirmation, or "paid" about the submission; the copy-rules test passes in EN and SW.
- M-P-4 Submitting sends `Idempotency-Key`; a retry of the same entries reuses the key; the body has no amount, currency or provider; a 5xx shows the "couldn't tell" dialog and keeps the form; a duplicate transaction ID shows the field error.
- M-P-5 After submit the order page shows "Payment sent for checking" with the masked phone, the transaction ID, the target hours and the extended hold time, hides Cancel, and refreshes at 30 s; no ticket and no green anywhere.
- M-P-6 When the server confirms, the order page turns to "Payment confirmed" with the tickets, and the ticket wallet shows one ticket per place the member may see; the announcement is made once.
- M-P-7 A rejection shows the reason text (and the admin's note) and "Try again" while `canRetry`; the pay page is prefilled; after the hold ends the order shows the expired view.
- M-P-8 An expired order inside the grace window offers "I already paid"; the late pay page carries the warning, and an expired order with a submitted payment shows the "we'll try to re-reserve, otherwise full refund" card; a `needs_attention` order with a refund shows the refund-due card (never green).
- M-P-9 Provider mode (flag on): one "Pay with mobile money" button, the existing sheet, no Lipa Namba; with `momoOffers` false the page says it is unavailable; with the mode off none of it renders.
- M-P-10 A free order is confirmed with one tap and shows tickets.
- M-P-11 The ticket page draws the QR from the server payload, shows ticket number, participant, category and state as text, and the correct kit-scanning wording for `scanning` false/true; Get a new code works after confirmation and the old code is dropped from the cache.
- M-P-12 A revoked ticket draws no QR and says why; a claimed-elsewhere ticket disappears for the purchaser with the explanation; sign-out clears the ticket cache.
- M-P-13 Offline, the ticket page shows the saved code with the "Saved on this phone" chip; with no cache it shows the error state.
- M-P-14 Cancel and refund shows the policy text, the amount the member would get (full, partial, none, review), the deadline, a reason, and a destructive confirmation; "no refund" requires the acknowledgement; a changed tier shows "refund amount changed" and needs a second confirmation.
- M-P-15 Blocked states (payment under review, refund in progress, window closed, event cancelled, not the purchaser) show the specific text and no action.
- M-P-16 After a cancel the order page shows the refund card (Requested/Approved/Sent/Not approved), the amount, the working-days target, and the payout reference once sent.
- M-P-17 The unclaimed-place rows show invitation status; "Send invitation again" warns that the old link stops working and respects the server limit.
- M-P-18 The claim link opened from the SMS (Android App Link and web) keeps the token, survives sign-in, shows "paid and confirmed" and lands on the ticket after claiming.
- M-P-19 Flutter web: first focus on each page's heading, focus order per §5.13, every icon button has a tooltip, status changes are announced once, the QR container has a text alternative.
- M-P-20 Light and dark screenshots at 375×812 and 1280×800, EN and SW at 1.0× and 1.3×, show no overflow and no text under 4.5:1; the green tone appears only for Paid, Confirmed, Ticket ready and a sent refund.
- M-P-21 With `options.payment` returning to `'none'` after a member has paid, the member still reaches tickets, cancel and refund screens.


---

## 6. Portal

### 6.1 Areas, navigation, guards
No new top-level pages except the finance tab and extensions to four existing surfaces. Everything is read through `useApp()` and `hasPermission(scope)`; the backend is the authority.
- **Admin:** `/admin/payments` (scope `payments`) and `/admin/refunds` (scope `payments`) are extended in place; `/admin/events?event=<id>&tab=orders&order=<id>` (scope `events`) gains the payment panel and the paid-order cancel; the event cancel dialog gains the refund step. A user with `events` but not `payments` sees the payment panel read-only with the payer phone masked and no links into Payments.
- **Organizer:** `/organizer/events?event=<id>&view=finance`, a third tab beside `registrations` and `orders`, visible to `finance`, `owner`, `admin` only (S3 §6.1 rules for draft/submitted/suspended events apply).
- **Org / HR:** `/org/events?order=<id>` and `/hr/events?order=<id>` order detail gets the payment panel (corporate variant, §6.8).
- Flags: portal `NEXT_PUBLIC_EVENTS_MODULE` plus `GET /events/options` (`payment`, `tickets`); payment surfaces render only while the options say `payment != 'none'`, **except** read-only history (payment panel of an already-paid order, refunds, finance) which stays visible whenever registration is on.

### 6.2 Admin Payments page (`app/admin/payments/page.tsx`)
Reuse everything the page already does (verify, second approval, change requests, `ApproveWithReferenceDialog`, `TransactionIdCell`, stage badges); event rows add:
- **Kind badge** `EVENT TICKETS` / `TIKETI ZA TUKIO` (`payments.kind.eventOrder`, via `paymentKindLabel` branch `if (payment.productType === 'EVENT_ORDER')`; the check precedes the `orderId` shop branch). Detail line under it: event title, order reference `EV-…`, "{n} places", and for organisations the organisation name with a `Badge` "Organisation". "Open order" link to the admin event order (only with scope `events`).
- **Hold cell** in the detail line: "Held until {time}" (warning when under 2 hours), or `Badge` warning "Hold ended: late payment" when the order is `expired`, or "Event cancelled" danger when the event is cancelled, so staff see which payments are blocking places or will become refunds. A product filter `Select` (All / Event tickets / …) and "Hold ends" sort make the queue manageable during a sale; default order for the Event tickets filter is oldest request first.
- **Verify** (two-admin flag on) as today; the verify dialog shows the event facts block (event, order status, expected amount, member's transaction ID and payer phone).
- **Approve dialog (event rows)** — `ApproveWithReferenceDialog` extended with: an `Alert` (info) summarising event, order, places and **Expected amount: TSh X**; the field **Amount received (TSh)**, required, **empty by default** (the point is that a person reads the statement, not that the page rubber-stamps), hint "Type the amount on the till statement"; the reference field prefilled with the member's ID; for `lateOutcome = 'would_rehold'` an info `Alert` "This order's hold ended. Approving will try to re-reserve the places."; for `'would_refund'` a warning `Alert` "The places are no longer available. Approving will not issue tickets: a full refund of TSh X will be raised for you to approve and send." The primary button is "Confirm payment" (second approver rules unchanged: disabled with the existing hint when the verifier is the same person).
- **Outcome toast** from the decision response `event.outcome`: `confirmed` → "Payment confirmed. {n} tickets issued." ; `reheld` → "Payment confirmed and places re-reserved." ; `refund_raised` → warning toast "Payment recorded, places unavailable. A refund was raised." with a link to the refund. An `amount_mismatch` / `amount_required` / `order_amount_mismatch` / `reference_already_used` error shows in the dialog (existing mapping `money2.err.*` plus the new keys) and nothing changes.
- **Reject dialog (event rows)**: `Select` reason (five codes, required), member note `Textarea` (<= 140, required for `other`, hint "The member sees this"), internal note (existing). Hint: "The member can try again with a corrected ID while their places are held."
- **Repair state**: a row whose request is approved but `eventOrder.repairable` is true shows a danger `Badge` "Confirmed, order not updated" and a **Repair** button (`POST …/repair-payment`, spinner, success toast, error text). The row also appears in a "Needs attention" count in the page summary line.
- **Needs attention rows** (`reconciliation_required`): `Badge` warning "Needs attention" + reason ("Amount differed", "Network answer unclear", "Places unavailable", "Order cancelled", "Event cancelled") and, when a refund exists, a link to it.
- The existing per-row Refund icon (pass/plan refunds) is **not** shown for event rows (refunds go through cancel or the unfulfilled-payment action in the order panel).
- Change-request flow: as today; for event rows the target `approved` from `rejected` is allowed, `approved → …` is hidden (`payment_already_confirmed`), the confirm dialog requires the amount received.
- States: loading `SkeletonTable`, error `PageError` with retry, empty "No payments yet", forbidden when scope missing (existing `Forbidden`). Keyboard: all row actions are buttons with `aria-label`; dialogs trap focus.

### 6.3 Admin Refunds page (`app/admin/refunds/page.tsx`)
- `KIND` gains `event_order: 'refunds.kind.event_order'`; the "what" cell shows the kind badge, a **scope** label (One ticket / Whole order / Event cancelled / Payment returned), the event title and order reference, and the reason text. `GET /admin/refunds` rows carry `event: { id, title }`, `orderReference`, `scope`, `batchId`, `policySnapshot`, `payerPhone`, `organizationName`.
- **Filters:** status (existing) plus Batch (`?batch=<id>` in the URL, also set by the event cancel flow) and Scope. With a batch selected a **summary strip** shows count, total, and counts per status.
- **Approve dialog:** amount field limited to the requested amount (existing rule), `policySnapshot` shown ("Policy: tiered, 50% evaluated on 3 Nov"), for **manual-review** requests (custom policy) a warning "Approving will cancel the member's place and revoke the ticket" and the amount is required (<= the paid amount). Reject needs a member-visible note (existing).
- **Mark paid dialog:** reference required, `paidTo` prefilled with the payer phone of the original payment (corporate: empty, the admin types the account), hint with the working-days target.
- **Batch actions** (only with a batch selected, scope `payments`): **Approve all requested** (`ConfirmDialog`: "Approve {count} refunds totalling TSh {total}?", sends `expectedTotalTzs` and `expectedCount`; under `MONEY_SECOND_APPROVER` the starter sees the existing `cannot_approve_own_request` text and the button explains why it is disabled) and **Record payouts** (dialog listing up to 50 approved rows with a reference and `paidTo` input each; posts `batch-paid`; the result table shows saved / failed per row with the error text; failed rows stay open).
- Two-admin stage badges (`awaiting_approval`, `awaiting_payment`) as today. A refund created by policy (member cancellation) shows "Approved by policy" and the second-admin rule on paying (`cannot_pay_own_approval` / `cannot_pay_own_request`) is unchanged.
- States as the page already has; a refund whose source order was repaired or changed shows the current order status.

### 6.4 Admin event order panel (`/admin/events?event=<id>&tab=orders&order=<id>`)
The S3 side `Dialog` (lines, participants, consent, hold info, Cancel order) gains:
- **Payment** section (`event-payment-panel.tsx`): status badge, method, expected vs received amount, reference and payer phone (full with `payments` scope, masked without), a **timeline** of rows with actor names and times (Submitted → Verified (two-admin flag) → Approved or Rejected (reason) → Tickets issued), the hold history ("extended to {time}"), links "Open in Payments" and, when repairable, **Repair**. A `needs_attention` banner explains the reason and links to the refund.
- **Tickets** line: "{n} issued, {m} cancelled" and per participant a state chip (no token, no QR ever).
- **Refunds** list: status, scope, amount, link to the Refunds page filtered to the order.
- **Cancel order** now works for paid orders: the dialog fetches the member-style preview for the admin (`refundMode` radio **Full refund / Per the event's policy / No refund**, each with the computed amount), a required note (>= 5 characters), and explains that a second admin approves the refund. Unpaid orders keep the S3 dialog.
- States: panel skeleton, error retry, `Forbidden` when the scope is missing, read-only when the event is archived.

### 6.5 Event cancellation and the refund batch (`LifecycleDialogs` cancel, admin only)
The existing cancel dialog (reason `Select`, note) stays the first step. If `cancel-preview` reports paid orders, a second section appears before the confirm button:
- A summary: "{awaiting} unpaid orders will be released. {paid} paid orders ({places} places, TSh {total}) will be cancelled and their tickets revoked." If `awaitingWithSubmittedPayment > 0` a warning lists that those payments stay in the Payments queue as "Event cancelled" rows.
- Checkbox (default on) **Raise refunds for {paid} paid orders (TSh {total})**, with the sentence "Refunds are created as requests. A second admin approves them and you record each payout. Members are told FitFlex will refund them."
- The confirm button reads **Cancel event and raise refunds** (or **Cancel event** when unchecked or no paid orders) and opens a `ConfirmDialog` repeating the numbers. The request carries `expectedRefundableTzs`; `refundable_changed` refreshes the numbers and asks again.
- Result: success `Alert` "Event cancelled. {created} refunds raised." with **Review refunds** (→ `/admin/refunds?batch=<id>`); if `remaining > 0` an inline **Continue raising refunds** button (calls `refund-batch`) with progress; any failure is shown, never swallowed.
- Organizer view: unchanged `has_registrations` (D12) message with the added line "Contact FitFlex to cancel an event that has paid registrations. FitFlex handles the refunds."

### 6.6 Organizer finance tab (`view=finance`)
Roles `finance`, `owner`, `admin`. `PageHeader` "Finance" with the event title and "As of {time}" plus a Refresh button. `MetricCard`s: **Paid** (collected from participants), **Refunded**, **Refunds pending**, **Awaiting payment** (held, not income), **FitFlex commission** ({pct}%), **Expected net** (emphasised). Below: a `DataTable` by ticket type (name, sold, collected) and an `Alert` info: "Payout statements are not live yet. These totals are what FitFlex has collected for this event, less refunds and FitFlex's commission." and a muted privacy line "Payer details are never shown to organizers." States: skeleton, error with retry, **empty** (all zeros) "No payments yet. Totals appear once participants pay." (not a zero-filled grid with no explanation), draft/submitted event → the S3 "once published" empty state, forbidden role → `Forbidden` (the tab is also hidden). Numbers use `money()`; percentages are whole numbers; no per-order or per-person rows. The Orders tab (S3 §6.3) keeps its columns, its status filter gains **Paid**, **Refund pending**, **Refunded**, **Partly cancelled**, and its footer line "Totals are what purchasers pay; your payout statement comes with payments (next release)" is replaced by "Totals are what purchasers paid. Your payout statement comes in a later release." (SW below).

### 6.7 Organizer wizard, Terms step: structured refund policy (S2 `event-wizard-steps/terms.tsx`)
`POLICY_PRESETS` becomes `['no_refund','refund_until_close','full_until_days','tiered','custom']`. Radio rows with a one-line description each; **Full refund until N days before the event** shows a number input (1 to 365); **Tiered refunds** shows up to three rows `[days before] [percent]` with rules (days strictly decreasing, percent 1 to 100 and non-increasing), "Add tier" / remove, and an inline example "100% until 30 days before, 50% until 14 days before, then no refund"; **Custom** keeps the EN/SW text (50 to 5000). Below the radios a read-only **generated policy line** in the active language (the same string members see). Validation messages inline, `aria-describedby`. Material field on a published event: the existing change-note dialog. Banner: "Refund policy text is a draft pending review by Tanzanian counsel." The review step shows the generated line. Stored fields: `refundPolicy { preset, text, days?, tiers? }` (server validates; unknown presets 400).

### 6.8 Corporate order payment (`/org/events?order=<id>`, `/hr/events`, `event-payment-panel.tsx` variant)
Who: `billing.pay` roles (owner, admin, finance; the S3 `corp-billing-gate` rule). Others see an info `Alert` "A billing user (owner, admin or finance) pays for this order."
By state:
- **Awaiting payment, nothing sent:** an invoice-style `Card` "How to pay": order reference (copy), event, places, **amount due** (copy), FitFlex's bank account (bank, account name, number, branch) and Lipa Namba from the organisation payment details (`next.instructions`), the steps "1 Pay by bank transfer or mobile money and use the order reference EV-… as the payment reference. 2 Then tell us below." and a **Print payment summary** button (browser print; no new document service). Form: Method `Select` (Bank transfer / Mobile money), Reference or transaction ID (required), Paid on (date, not in the future), Note (<= 300). Alert info (labelled manual): "Manual confirmation: FitFlex finance checks payments against the bank or mobile-money statement. Bank transfers can take longer. Your places stay held until {time}." Primary **I've paid · Send for checking**. If the organisation payment details are not configured, the card shows "Payment details are not available yet. Contact FitFlex." and the form is disabled (never an empty Lipa Namba).
- **Submitted:** card "Payment sent for checking" with method, reference, paid-on date, sent time and the hold time; no cancel button (`payment_submitted`).
- **Rejected:** reason text (same five codes, portal keys), the admin's note, **Try again** while the hold stands (the form returns, prefilled).
- **Expired** inside the grace window: "I already paid" shows the form with the late warning; **expired with a submitted payment:** the "we'll try to re-reserve, otherwise full refund" text.
- **Confirmed:** success `Alert` "Payment confirmed. Employees are invited to claim their places by SMS or email." The participants table gains **Invitation** (sent date or "No contact") and a row action **Send again** (billing roles; warns the old link stops working; honours `resend_limit_reached`); contact columns stay masked (S3). A **Cancel order** button opens the cancel preview dialog (policy text, amount, no-refund acknowledgement, reason `Select`, `expectedRefundTzs`) → result and a **Refund** `Card` (status, amount, "Refunds go to your organisation. FitFlex finance will contact the billing email to confirm where to send it.").
- Cancelled, refund pending, refunded: pills and the refund card. Errors map through `EVENTS_ERRORS`; `organization_not_active` notice as S3.

### 6.9 Portal i18n keys (`src/lib/i18n.ts`, EN + SW draft; every new string through `t()`, no raw English)
| Key | EN | SW (draft) |
|---|---|---|
| `payments.kind.eventOrder` | Event tickets | Tiketi za tukio |
| `payments.event.expected` | Expected amount | Kiasi kinachotarajiwa |
| `payments.event.amountReceived` | Amount received (TSh) | Kiasi kilichopokelewa (TSh) |
| `payments.event.amountReceived.hint` | Type the amount on the till statement. | Andika kiasi kilichopo kwenye taarifa ya Lipa Namba. |
| `payments.event.hold` | Held until {time} | Imeshikiliwa hadi {time} |
| `payments.event.holdEnded` | Hold ended: late payment | Muda wa kushikilia umeisha: malipo ya kuchelewa |
| `payments.event.cancelledEvent` | Event cancelled | Tukio limeghairiwa |
| `payments.event.late.rehold` | This order's hold ended. Approving will try to re-reserve the places. | Muda wa kushikilia oda hii umeisha. Kuidhinisha kutajaribu kuhifadhi tiketi tena. |
| `payments.event.late.refund` | The places are no longer available. Approving will not issue tickets: a full refund of {amount} will be raised for you to approve and send. | Tiketi hazipo tena. Kuidhinisha hakutatoa tiketi: marejesho kamili ya {amount} yataandaliwa uyaidhinishe na kuyatuma. |
| `payments.event.confirm` | Confirm payment | Thibitisha malipo |
| `payments.event.outcome.confirmed` | Payment confirmed. {n} tickets issued. | Malipo yamethibitishwa. Tiketi {n} zimetolewa. |
| `payments.event.outcome.reheld` | Payment confirmed and places re-reserved. | Malipo yamethibitishwa na tiketi zimehifadhiwa tena. |
| `payments.event.outcome.refund` | Payment recorded, places unavailable. A refund was raised. | Malipo yamerekodiwa, tiketi hazipo. Marejesho yameandaliwa. |
| `payments.event.reject.reason` | Reason | Sababu |
| `payments.event.reject.memberNote` | Note for the member | Ujumbe kwa mwanachama |
| `payments.event.reject.memberNote.hint` | The member sees this. | Mwanachama ataona hili. |
| `payments.event.reject.reference_not_found` | Transaction ID not found | Namba ya muamala haikupatikana |
| `payments.event.reject.amount_mismatch` | Amount differs | Kiasi ni tofauti |
| `payments.event.reject.wrong_account` | Paid to a different number | Imelipwa kwa namba nyingine |
| `payments.event.reject.duplicate_reference` | Transaction ID already used | Namba ya muamala ilishatumika |
| `payments.event.reject.other` | Other | Nyingine |
| `payments.event.repair.badge` | Confirmed, order not updated | Imethibitishwa, oda haijasasishwa |
| `payments.event.repair.action` | Repair | Rekebisha |
| `payments.event.repair.done` | Order updated. | Oda imesasishwa. |
| `payments.event.attention` | Needs attention | Inahitaji uangalizi |
| `payments.event.attention.amount_mismatch` | Amount differed | Kiasi kilikuwa tofauti |
| `payments.event.attention.provider_unknown` | Network answer unclear | Jibu la mtandao halieleweki |
| `payments.event.attention.capacity_unavailable` | Places unavailable | Tiketi hazipo |
| `payments.event.attention.order_cancelled` | Order cancelled | Oda imeghairiwa |
| `payments.event.attention.event_unavailable` | Event cancelled | Tukio limeghairiwa |
| `payments.event.filter` | Event tickets | Tiketi za tukio |
| `payments.event.openOrder` | Open order | Fungua oda |
| `refunds.kind.event_order` | Event tickets | Tiketi za tukio |
| `refunds.scope.registration` | One ticket | Tiketi moja |
| `refunds.scope.order` | Whole order | Oda nzima |
| `refunds.scope.event_cancelled` | Event cancelled | Tukio limeghairiwa |
| `refunds.scope.unfulfilled_payment` | Payment returned | Malipo yamerudishwa |
| `refunds.policy.line` | Policy: {preset}, {percent}% evaluated on {date} | Sera: {preset}, {percent}% ilitathminiwa {date} |
| `refunds.review.warn` | Approving will cancel the member's place and revoke the ticket. | Kuidhinisha kutaghairi tiketi ya mwanachama na kufuta tiketi. |
| `refunds.batch.filter` | Batch | Kundi |
| `refunds.batch.summary` | {count} refunds · TSh {total} · {requested} requested · {approved} approved · {paid} sent | Marejesho {count} · TSh {total} · {requested} yameombwa · {approved} yameidhinishwa · {paid} yametumwa |
| `refunds.batch.approveAll` | Approve all requested | Idhinisha yote yaliyoombwa |
| `refunds.batch.approveAll.confirm` | Approve {count} refunds totalling TSh {total}? | Idhinisha marejesho {count} yenye jumla ya TSh {total}? |
| `refunds.batch.recordPayouts` | Record payouts | Rekodi malipo yaliyotumwa |
| `refunds.batch.result.saved` | Saved | Imehifadhiwa |
| `refunds.batch.result.failed` | Not saved | Haikuhifadhiwa |
| `events.order.payment.title` | Payment | Malipo |
| `events.order.payment.timeline.submitted` | Submitted | Imetumwa |
| `events.order.payment.timeline.verified` | Verified | Imehakikiwa |
| `events.order.payment.timeline.approved` | Approved | Imeidhinishwa |
| `events.order.payment.timeline.rejected` | Rejected | Imekataliwa |
| `events.order.payment.timeline.tickets` | Tickets issued | Tiketi zimetolewa |
| `events.order.payment.maskedPhone` | Payer phone hidden (needs Payments access) | Simu ya mlipaji imefichwa (inahitaji ruhusa ya Malipo) |
| `events.order.tickets.summary` | {n} issued, {m} cancelled | {n} zimetolewa, {m} zimeghairiwa |
| `events.order.cancelPaid.mode.full` | Full refund | Marejesho kamili |
| `events.order.cancelPaid.mode.policy` | Per the event's policy | Kulingana na sera ya tukio |
| `events.order.cancelPaid.mode.none` | No refund | Bila marejesho |
| `events.order.cancelPaid.secondAdmin` | A second admin approves the refund. | Msimamizi wa pili ataidhinisha marejesho. |
| `events.cancel.impact` | {awaiting} unpaid orders will be released. {paid} paid orders ({places} places, TSh {total}) will be cancelled and their tickets revoked. | Oda {awaiting} ambazo hazijalipwa zitaachiliwa. Oda {paid} zilizolipwa (tiketi {places}, TSh {total}) zitaghairiwa na tiketi zao kufutwa. |
| `events.cancel.submittedWarning` | {n} orders have a payment waiting for review. They stay in Payments as "Event cancelled". | Oda {n} zina malipo yanayosubiri ukaguzi. Zitabaki kwenye Malipo kama "Tukio limeghairiwa". |
| `events.cancel.raiseRefunds` | Raise refunds for {paid} paid orders (TSh {total}) | Andaa marejesho kwa oda {paid} zilizolipwa (TSh {total}) |
| `events.cancel.raiseRefunds.hint` | Refunds are created as requests. A second admin approves them and you record each payout. Members are told FitFlex will refund them. | Marejesho huundwa kama maombi. Msimamizi wa pili huyaidhinisha na wewe unarekodi kila malipo. Wanachama wanaambiwa FitFlex itawarejeshea. |
| `events.cancel.confirmRefund` | Cancel event and raise refunds | Ghairi tukio na uandae marejesho |
| `events.cancel.done` | Event cancelled. {created} refunds raised. | Tukio limeghairiwa. Marejesho {created} yameandaliwa. |
| `events.cancel.reviewRefunds` | Review refunds | Kagua marejesho |
| `events.cancel.continue` | Continue raising refunds | Endelea kuandaa marejesho |
| `events.cancel.organizerHint` | Contact FitFlex to cancel an event that has paid registrations. FitFlex handles the refunds. | Wasiliana na FitFlex kughairi tukio lenye usajili uliolipwa. FitFlex hushughulikia marejesho. |
| `events.finance.title` | Finance | Fedha |
| `events.finance.asOf` | As of {time} | Hadi {time} |
| `events.finance.paid` | Paid | Zilizolipwa |
| `events.finance.refunded` | Refunded | Zilizorejeshwa |
| `events.finance.refundPending` | Refunds pending | Marejesho yanayosubiri |
| `events.finance.awaiting` | Awaiting payment (held) | Zinazosubiri malipo (zimeshikiliwa) |
| `events.finance.commission` | FitFlex commission ({pct}%) | Kamisheni ya FitFlex ({pct}%) |
| `events.finance.net` | Expected net | Kiasi unachotarajia |
| `events.finance.byTicket` | By ticket type | Kwa aina ya tiketi |
| `events.finance.note` | Payout statements are not live yet. These totals are what FitFlex has collected for this event, less refunds and FitFlex's commission. | Taarifa za malipo kwa waandaaji bado hazijaanza. Jumla hizi ni kile FitFlex imekusanya kwa tukio hili, ukiondoa marejesho na kamisheni ya FitFlex. |
| `events.finance.privacy` | Payer details are never shown to organizers. | Taarifa za mlipaji hazionyeshwi kamwe kwa waandaaji. |
| `events.finance.empty` | No payments yet. Totals appear once participants pay. | Bado hakuna malipo. Jumla zitaonekana washiriki wakilipa. |
| `events.orders.footer` | Totals are what purchasers paid. Your payout statement comes in a later release. | Jumla ni kile wanunuzi walicholipa. Taarifa ya malipo yako itakuja kwenye toleo la baadaye. |
| `events.terms.policy.full_until_days` | Full refund until N days before the event | Marejesho kamili hadi siku N kabla ya tukio |
| `events.terms.policy.tiered` | Tiered refunds | Marejesho ya viwango |
| `events.terms.policy.days` | Days before the event | Siku kabla ya tukio |
| `events.terms.policy.percent` | Refund percent | Asilimia ya marejesho |
| `events.terms.policy.addTier` | Add tier | Ongeza kiwango |
| `events.terms.policy.example` | 100% until 30 days before, 50% until 14 days before, then no refund | 100% hadi siku 30 kabla, 50% hadi siku 14 kabla, kisha hakuna marejesho |
| `events.terms.policy.generated` | Policy as members will read it | Sera kama wanachama watakavyoisoma |
| `events.terms.policy.draft` | Refund policy text is a draft pending review by Tanzanian counsel. | Maandishi ya sera ya marejesho ni rasimu inayosubiri ukaguzi wa wakili wa Tanzania. |
| `corp.events.pay.title` | How to pay | Jinsi ya kulipa |
| `corp.events.pay.steps` | Pay by bank transfer or mobile money and use the order reference {ref} as the payment reference. Then tell us below. | Lipa kwa uhamisho wa benki au pesa mtandao na utumie kumbukumbu ya oda {ref} kama kumbukumbu ya malipo. Kisha utuambie hapa chini. |
| `corp.events.pay.print` | Print payment summary | Chapisha muhtasari wa malipo |
| `corp.events.pay.method` | Method | Njia |
| `corp.events.pay.method.bank` | Bank transfer | Uhamisho wa benki |
| `corp.events.pay.method.momo` | Mobile money | Pesa mtandao |
| `corp.events.pay.reference` | Reference or transaction ID | Kumbukumbu au namba ya muamala |
| `corp.events.pay.paidOn` | Paid on | Imelipwa tarehe |
| `corp.events.pay.manual` | Manual confirmation: FitFlex finance checks payments against the bank or mobile-money statement. Bank transfers can take longer. Your places stay held until {time}. | Uthibitisho wa mkono: fedha za FitFlex hukagua malipo kwenye taarifa ya benki au ya pesa mtandao. Uhamisho wa benki unaweza kuchukua muda zaidi. Tiketi zenu zimeshikiliwa hadi {time}. |
| `corp.events.pay.submit` | I've paid · Send for checking | Tumelipa · Tuma ikaguliwe |
| `corp.events.pay.notConfigured` | Payment details are not available yet. Contact FitFlex. | Taarifa za malipo bado hazipatikani. Wasiliana na FitFlex. |
| `corp.events.pay.billingOnly` | A billing user (owner, admin or finance) pays for this order. | Mtumiaji wa bili (mmiliki, msimamizi au fedha) ndiye hulipia oda hii. |
| `corp.events.pay.submitted` | Payment sent for checking | Malipo yametumwa kukaguliwa |
| `corp.events.pay.confirmed` | Payment confirmed. Employees are invited to claim their places by SMS or email. | Malipo yamethibitishwa. Wafanyakazi wanaalikwa kuchukua tiketi zao kwa SMS au barua pepe. |
| `corp.events.col.invitation` | Invitation | Mwaliko |
| `corp.events.invite.resend` | Send again | Tuma tena |
| `corp.events.invite.resend.warn` | This creates a new link. The old link stops working. | Hii inatengeneza kiungo kipya. Kiungo cha zamani kitaacha kufanya kazi. |
| `corp.events.refund.note` | Refunds go to your organisation. FitFlex finance will contact the billing email to confirm where to send it. | Marejesho huenda kwa shirika lenu. Fedha za FitFlex zitawasiliana na barua pepe ya bili kuthibitisha mahali pa kutuma. |
Error keys added to `EVENTS_ERRORS` and `money2.err.*`: every code of §3.17 that a portal surface can receive, EN and SW, with the member-style wording of §5.12 for the shared ones. Portal analytics (no personal data): `payment_panel_viewed`, `event_payment_decided { outcome }`, `refund_batch_created { count }`, `finance_viewed`.

### 6.10 Portal e2e (Playwright, `tests/e2e/events-s4.spec.ts`, self-contained like the S2/S3 specs; backend mocked by route interception)
- **Admin payments:** an event row shows the kind badge, event and order line, hold cell and filter; approve requires a typed amount (empty by default), shows expected amount, sends `amountTzs`, handles `amount_mismatch` (dialog error, nothing changes); late `would_rehold` and `would_refund` alerts; outcome toasts (`confirmed`, `reheld`, `refund_raised`); reject with each reason code, `other` requires the note; two-admin flag: verify then second approver, same-admin errors; repair badge and button; needs-attention row and link; change request `rejected → approved`; the pass/plan refund icon is absent on event rows; scope `payments` missing → forbidden.
- **Admin refunds:** `event_order` rows (kind, scope, event, order), batch filter and summary strip, approve with amount limit, custom-policy warning, mark paid with prefilled payer phone, approve-all confirm sends expected totals, own-batch refusal text, record payouts per-row results.
- **Admin event order panel:** payment timeline and masked phone without `payments` scope, tickets summary (no token), refund list, cancel paid order with each mode and the note rule, repair link.
- **Event cancellation:** impact summary from the preview, checkbox default, confirm dialog numbers, `refundable_changed` refresh, result with link and Continue button, organizer `has_registrations` hint.
- **Organizer finance:** tab visible for finance/owner/admin only; metrics, per-ticket table, note and privacy line; empty, draft, error and retry; no payer fields anywhere in the DOM; Orders tab filter values and footer.
- **Terms step:** all five presets, number and tier validation (ordering, percent), generated line, change-note dialog on a published event.
- **Corporate:** billing role sees how-to-pay card, bank and Lipa Namba from the mock, form validation, idempotency key on submit and retry, submitted/rejected/confirmed/expired-late states, invitation column and resend warning, cancel preview and refund card; non-billing role sees the gate; missing payment details disables the form; print button calls `window.print`.
- **Accessibility:** axe on the payments dialogs, refunds dialogs, order panel, finance tab and corporate panel (no serious violations); keyboard-only run through approve and cancel-event; Swahili locale run asserting no raw keys and no header truncation at 1280 px.

### 6.11 Acceptance criteria (P-)
- P-P-1 An `EVENT_ORDER` row on Payments shows the event title, order reference, places, hold state and a working "Open order" link (scope `events` only); the pass/plan refund icon is not shown for it.
- P-P-2 Approving an event payment requires typing the amount received (empty by default); a different amount shows the expected amount and writes nothing; the second-approver rules behave exactly as for other products.
- P-P-3 Late payments show the "would re-reserve" or "would refund" alert before approval and the actual outcome after; an unfulfilled payment ends as a raised refund, never as silent success.
- P-P-4 Rejecting needs a reason code (and a member note for "other"); the member-visible note is labelled as visible to the member.
- P-P-5 An approved payment whose order was not updated is flagged and can be repaired by one click; the flag disappears after success.
- P-R-1 The Refunds page labels `event_order` refunds with scope, event and order; approving a custom-policy request warns that it cancels the place; mark paid prefills the payer phone.
- P-R-2 With a batch selected the page shows count, total and per-status counts; "Approve all requested" confirms count and total, is refused for the admin who started it under `MONEY_SECOND_APPROVER`, and "Record payouts" reports success or failure per row.
- P-A-1 The admin order panel shows the payment timeline, tickets summary (never a token), refunds, and masks the payer phone without `payments` scope; cancelling a paid order requires a refund mode and a note.
- P-A-2 Cancelling an event with paid orders shows the numbers, defaults to raising refunds, repeats the numbers on confirm, and ends on a link to the batch; a partial batch can be continued; the organizer gets the contact-FitFlex hint.
- P-O-1 The finance tab is visible only to finance, owner and admin; it shows paid, refunded, pending, held, commission and expected net, a ticket-type table, the payout-not-live note and the privacy line; it never shows payer phone, reference, method or per-order rows.
- P-O-2 The finance tab has clear loading, error, empty and "once published" states; numbers match the API response exactly.
- P-W-1 The Terms step offers the five refund presets with validation, a generated policy line in the active language and the draft-pending-counsel banner; unknown input is refused with inline messages.
- P-C-1 A billing user sees how to pay (reference, amount, bank and Lipa Namba) and can send "I've paid" with method, reference and date; non-billing users see the gate; missing payment details disable the form.
- P-C-2 The corporate order page shows submitted, rejected, confirmed, expired-late and refund states with the right actions; confirmed shows invitation status and a warned "Send again".
- P-ALL-1 Every new string resolves in EN and SW (no raw keys); Swahili fits tables and dialogs at 1280 px without truncating headers or buttons.
- P-ALL-2 axe reports no serious violations on the new dialogs, panel and tab; every action is reachable by keyboard and has an accessible name.


---

## 7. Shared

### 7.1 Flags, deploy order and switch-on checklist
Flags and env are in §3.18. Everything ships dormant: with `EVENTS_PAYMENTS_MANUAL` and `EVENTS_PAYMENTS_TUNZAA` off, `options.payment` is `'none'`, S3 pages render as shipped, and the only live S4 code is read-only (empty ticket and refund lists).
**Deploy order:** `fitflex-functions` (migration `20270110091100-events-payments-tickets.cjs` **first**, then code; the `refund_ck` rewrite and the `knex-store` field lists must be live before any money row is written) → `fitflex-portal` → `fitflexmobile` (the Android App Link and the new routes need a store release) → flags last. Old S3 mobile builds read `next.payment = 'manual'` as "not supported by this release" (the S3 `order-payment-unsupported` branch), so members on those builds cannot pay: switch `EVENTS_PAYMENTS_MANUAL` on only after the client builds are adopted, as for S3.
**Before switching `EVENTS_PAYMENTS_MANUAL` on** (the owner decides, nothing here switches anything): `MANUAL_PAY_INSTRUCTIONS` on with Lipa Namba and account name set; `EVENT_TICKET_SECRET` set in the BFast console (and added to `docs/server-env-checklist.md`); every organizer who will sell has `commissionPct` set (D2); the `MONEY_SECOND_APPROVER` setting for production confirmed; the admins who will confirm event payments briefed on the amount-received rule; the working-days refund target and confirm-within hours agreed (owner questions 1 and 2); a UAT pass on Flutter web against an isolated backend with fixture accounts (camera, push and native payments remain "needs a real device"). `EVENTS_PAYMENTS_TUNZAA` stays off until the owner confirms Tunzaa is the launch provider and the sandbox behaviour has been exercised.

### 7.2 Analytics
Names are listed with their surfaces: server §3.15, mobile §5.13, portal §6.9. No personal data, no payment references, no amounts below the order level.

### 7.3 Rule-6 callouts for the PRs (CLAUDE.md rule 6: pricing, payout engine, check-in, `src/auth/*`, endpoint signatures)
These are payment code paths. List them in the PR description; `security-and-privacy-reviewer` and `contract-checker` review all of them. **Not touched:** `src/auth/*`; pricing constants (`events-pricing.mjs` is read, never written); the payout engine and statement workflow (`partner-statement-workflow.mjs`, settlement engines); check-in logic and `qr-token.mjs`; `manual-payment.mjs` and `payment-reference-store.mjs` (reused as they are).

**Existing files touched, and why**
| File | Change | Risk to existing products |
|---|---|---|
| `fitflex-functions/src/shared/payment-product.mjs` | `EVENT_ORDER` product type; `productTypeOfPayment` checks `eventOrderId` first | None if the order of checks is kept; `MEMBER_ACCESS_PRODUCTS` unchanged |
| `src/services/admin-payment-service.mjs` | new optional deps `beforeEventOrderPayment`, `onEventOrderPayment` (no-op defaults); event branch first in `applyPaymentStatusToSubscription`; event checks in `checkConfirmation`; `orderId` guards in `update`, `requestChange`, `confirmChange`, `referenceInUse` widened to `orderId \|\| eventOrderId`; `list()` adds the `eventOrder` projection; `decide` accepts `reasonCode`/`memberNote` for event requests | This is **the admin decision path**: every product passes through it. Regression specs for pass, plan, trainer and shop approvals must stay green; the event branch must be unreachable for a request without `eventOrderId` |
| `src/bootstrap/services.mjs` | wire the two hooks, `events-payment-service`, `events-refund-service`, refund `onApproved`/`onPaid` | composition only |
| `src/services/mobile-money-service.mjs` | `EVENT_ORDER` in the payable set and the member role map while the flag is effective; event pre-check in `pay()`; hold extension on prompt | Dormant flag; the existing products' branches must be byte-identical when the flag is off |
| `functions/mobile-money.mjs` | `mobileMoney.products` may list `EVENT_ORDER` (additive); descriptions | additive response value |
| `functions/webhooks.mjs` | `WebhookSeen` duplicate guard after processing; callback payload passed through the redactor before any store | behaviour for other products unchanged except the duplicate no-op |
| `src/services/refund-service.mjs`, `functions/refunds.mjs` | `REFUND_KINDS` + `SOURCE_FIELD` for `event_order`, new `raise` inputs, `onApproved`/`onPaid`, bilingual `tell` for the new kind, `adminList`/`listMine` projections, `POST /admin/refunds` accepts `eventPaymentId`, new batch routes | other kinds untouched; the live-refund lookup must not collide with shop `orderId` |
| `db/migrations/20270110091100-…cjs` | rewrite constraint `refund_ck` (kind list), new columns and partial uniques on `Refund`, `EventPayment`, `EventOrder`, `EventRegistration`, `EventTicket`, `EventInventoryMovement` | money tables: additive, `down` fails closed |
| `src/infra/knex-store.mjs` | `ALLOWED_FIELDS` for `payment_requests` (`eventOrderId`) and `refunds` (new columns) | without this the collection API silently drops the fields |
| `src/infra/event-store-pg.mjs`, `src/shared/events-lifecycle.mjs` | `confirmPaidOrder`, `rehold`, `cancelPaidRegistration`, `cancelPaidOrder`, `uncommit` movements, machine widenings (§3.3) | inventory integrity: concurrency specs (§3.19) |
| `src/shared/events-document.mjs`, S2 organizer routes | structured refund presets and validation | published events with the old presets keep working |
| `src/services/events-registration-service.mjs`, `events-admin-service.mjs`, `functions/events-registration.mjs`, `functions/events-admin.mjs` | `next.payment`, order detail payment/refunds, cancel for confirmed targets, admin paid-order cancel, event-cancel batch, `inviteClaims` call after commit | S3 behaviour with payment off unchanged |
| `src/shared/feature-flags.mjs`, `src/shared/events-config.mjs`, `functions/jobs.mjs` (+ ops job list) | flags, config, job `eventPaymentReconciliation` | job does nothing while flags are off |
| `src/services/subscription-service.mjs` | none functional; `describePayment` output gains the event label inputs if the `/me` projection is extended (§8 item 11) | `pendingPayment` selection must not change |
| `fitflex-portal`: `app/admin/payments/page.tsx`, `app/admin/refunds/page.tsx`, `src/lib/money-approval.ts`, `src/components/member-reference.tsx`, `src/lib/api.ts`, `src/lib/i18n.ts`, `src/lib/events.ts`, `event-lifecycle.tsx`, `event-orders-table.tsx`, `event-corporate-order.tsx`, `event-wizard-steps/terms.tsx`, `app/organizer/events/page.tsx` | per §6 | the money pages are shared with every product; the existing e2e (`admin-manual-payment.spec.ts` and the refunds specs) must stay green |
| `fitflexmobile`: `lib/shared/payment_labels.dart`, `lib/screens/member/widgets/mobile_money_pay.dart` (`MomoProduct`, `momoOffers`, success key), `lib/router.dart`, `lib/shared/api_client.dart`, `lib/shared/i18n.dart`, `inbox_controller.dart` (`memberRouteFor`), `member_event_order_page.dart`, `member_event_registration_page.dart`, `member_event_orders_page.dart`, `event_claim_page.dart`, `android/app/src/main/AndroidManifest.xml` | per §4 and §5 | the pass and shop payment flows share `momoOffers` and `payment_labels`; their tests must stay green |

**Endpoint changes (all additive, none removes or renames):** new routes listed in §3 (`…/payment`, `…/payment-status`, ticket routes, cancel previews, claim resend, admin repair, refund batch routes, finance reads, corporate payment routes); extended bodies: `POST /admin/payment-requests/:id/decision` (`reasonCode`, `memberNote`), `POST /admin/events/:eventId/cancel` (`refundPaidOrders`, `expectedRefundableTzs`), `POST /admin/events/:eventId/orders/:id/cancel` (`refundMode`), `POST /me/event-registrations/:id/cancel` and `POST /me/event-orders/:id/cancel` (`expectedRefundTzs`, now valid for confirmed targets), `POST /admin/refunds` (`eventPaymentId`, for the `event_order` unfulfilled-payment case only); extended responses: `GET /events/options`, `GET /me/event-orders/:id`, `GET /admin/payment-requests` rows, `GET /admin/refunds` rows, `GET /me/refunds` rows, `GET /payments/options` (`mobileMoney.products`), `GET /me` `pendingPayments` rows (new productType value).

### 7.4 Privacy notes (PRD §10)
- **What organizers see about money: totals only** (paid, refunded, pending, held, commission, expected net, by ticket type). Never payer name, phone, transaction ID, payment method, refund destination or provider data, in any list, summary, export (S5) or webhook payload. The S3 Orders tab already shows per-order totals with masked purchasers; owner question 3 decides whether that stays.
- **Admins** see the payer phone and the member's transaction ID on the Payments page (existing behaviour); `events`-scope users without `payments` see the phone masked in the order panel. Staff names appear only in the admin audit, never to members.
- **Members** see their own transaction ID and masked phone, the reason code and optional note of a rejection, the refund and payout reference. Never staff identity, internal notes or provider payloads.
- **Tickets:** tokens derived on demand, hashed at rest, never logged, `no-store`, absent from lists, analytics and outbox; cached only on the holder's device with deletion rules (§5.8).
- **Logs and audit:** ids, statuses and codes only; the existing audit rows that embed the whole `PaymentRequest` for admin actions are unchanged (admin-only).
- **Cancellation communications** (KIT-010): unclaimed places with a contact get one bounded message; counts audited; no personal data in the audit row.
- **Retention:** payment, refund and audit rows are financial records and are kept; the deletion path for participant personal fields after account deletion stays open (follow-ups "Privacy / retention"). `EventPayment.rawRedacted` carries only the allowlisted fields.
- **Consent texts, refund policy text and organizer terms are drafts pending Tanzanian counsel.**

### 7.5 What the security review should look at
Amount equality at every step and the database-level single success (`eventpayment_one_succeeded_per_order`); idempotency scoping and fingerprint; reference uniqueness across products and the 5-per-hour limiter; maker-checker on payments and refunds (and that event approvals are not exempt); the amount-received rule; the repair route and sweep being idempotent and not able to confirm an unapproved payment; the ticket token (HMAC input, constant-time comparison, secret separation from `QR_HMAC_SECRET`, rotation, purchaser access loss at claim, 404-not-403 for foreign ids); refund duplicate races across member, admin and event cancellation; `uncommit` accounting; the late-payment grace window as a workload vector (fake IDs on expired orders: limiter and duplicate detection); hold-extension abuse; the redactor allowlist; in-memory rate limits per server; claim-invitation resend invalidating links; organizer payload minimisation (snapshot tests); corporate payment guard (`billing.pay`) and the `memberId = createdByUserId` convention.

### 7.6 Reminders for the owner (CLAUDE.md rule 8)
- **Organizer settlement is not built.** S4 collects and records money and leaves the data seam; nobody is paid out by this slice. Trainer weekly statements and vendor weekly statements exist (trainer live since 2026-10-03; vendor live since 2026-10-10 and not yet tried by hand); the organizer path reuses their workflow in a later slice.
- **Refunds are manual.** FitFlex staff send each refund and record the reference; there is no provider refund and no bulk bank file (the batch helpers only record).
- **Legal text is draft** pending Tanzanian counsel: consent texts, event terms, the refund policy lines and any organizer terms.
- **All flags are off.** Nothing in this slice is live until the owner switches the payment flags on.
- **Not verified in this design:** field names against a live schema, the Tunzaa sandbox (callback fields and timing are as `PAYMENTS_TUNZAA.md` and the client describe them; sandbox behaviour was not exercised), the org-readable B2B payment details route, delivery of SMS and email, and anything on a real device (camera, push, native payments).

---

## 8. Backend fields and confirmations needed (for `fitflex-planner` / `contract-checker` / `backend-builder`)
1. Migration §3.2: table and column names, CHECK sets, the `refund_ck` drop-and-recreate (same predicates plus `event_order`), the partial unique indexes, `down` failing closed, `uncommit` in the movement CHECK. PostgreSQL version for the partial indexes and the S3 `ON DELETE SET NULL (col)` note (>= 15, follow-up L10) is unchanged by this migration.
2. `src/infra/knex-store.mjs` `ALLOWED_FIELDS`: `payment_requests` has no `eventOrderId` and `refunds` lacks the new columns; the collection API drops unknown fields silently. Add them, and add a spec that a `PaymentRequest` written through the collection API keeps `eventOrderId`.
3. Legacy NOT NULL columns on `PaymentRequest` (`subscriptionId`, `tier` in the init schema; later relaxed for shop orders): confirm exactly what `shop-order-store-pg.mjs` `paymentRow` writes and mirror it for events.
4. Corporate payments: `PaymentRequest.memberId` = `EventOrder.createdByUserId`; organisation, method and paid-on day on `EventPayment` (`organizationId`, `payerMethod`, `paidOn`). Confirm the coordinator is always a `User` and that `billing.pay` is the permission name in `b2b-collections-service` (it is `BILLING_PAY` in code).
5. An org-readable route for the B2B payment details (`B2BPaymentInstruction`, bank and Lipa Namba) for users with `billing.pay`; the admin routes `/admin/b2b/payment-instructions` exist, an organisation-side read was not located. Embed in `next.instructions` if no route exists.
6. `refund_until_close` when neither the category nor the event has `registrationClosesAt`: spec treats it as `no_refund` and audits. Confirm whether S2 validation already requires a close time (then the case cannot occur).
7. `EventOrganizer.commissionPct`: whole percent, nullable? If null at confirmation: stamp `null`, treat as 0 in finance and show "Not set" (owner should set it before selling).
8. ACL: refund batch routes, repair and corporate reconciliation use `requireAcl('payments')`; event cancel preview and paid-order cancel use `events`. No new scope, so `portal-acl-scopes.specs.mjs` is unchanged.
9. **Atomicity option:** whether `writeDecision` can take a transaction so the request approval and `confirmPaidOrder` commit together. If yes, use it; if not, the repair design in §3.7.8 stands.
10. `GET /payments/options` `mobileMoney.products` (B6a block) and mobile `MomoProduct`/`momoOffers`: `EVENT_ORDER` must appear only while the Tunzaa event flag is effective, and the legacy fallback list (members, `_legacyMemberProducts`) must not include it.
11. `/me` `pendingPayments`: event requests will appear with `productType: 'EVENT_ORDER'`; confirm `pendingPayment` (the single access slot) still ignores them and add `eventTitle` / `eventOrderReference` to `describePayment` so mobile `paymentProductLabel` can say "Event tickets · {event}".
12. `refund-service`: `SOURCE_FIELD` mapping for `event_order` (per scope: registration id, order id, payment id), `liveFor`, the reasons used (`member_cancelled`, `cancelled_by_fitflex`, `payment_error` exist), `adminList`/`listMine` projections (`event`, `orderReference`, `scope`, `batchId`, `policySnapshot`, `payerPhone`, `organizationName`), `onApproved` and `onPaid` deps, bilingual `tell` for the new kind.
13. Share host for `/event-claim/#` (same as S2/S3 `shareUrl`) and the Android App Link entry for `/event-claim/*`.
14. Notification types and the mobile `memberRouteFor` allowlist (§3.16); the org coordinator has no portal inbox (S3 gap): confirm the email fallback through the existing B2B email path.
15. Team membership on paid cancellation follows the registration (S3 rule): confirm `EventTeamMember` status handling when a captain's place is cancelled.
16. `rehold` reads event status inside the store transaction; confirm the store (not the catalogue) can read `Event.status`/`startsAt` there.
17. Jobs: `eventPaymentReconciliation` registered in `functions/jobs.mjs` and the ops job list (hourly), `JobRun` recording, advisory lock, `OpsException` types `events_payment_reconciliation` and `events_order_unconfirmed`; gating by flags (the repair and invitation-retry parts run with `EVENTS_PAYMENTS_MANUAL` too).
18. `GET /admin/payment-requests` returns every payment request (a known N+1-fixed but unbounded list): add a `?productType=EVENT_ORDER` filter (and `limit`) on the server so the event queue does not load the whole table during a sale.
19. Outbox vocabulary (§3.16): `registration.paid` next to the existing `registration.created`; confirm against the PRD §8 webhook envelope before S5.
20. `EVENT_TICKET_SECRET*` in `docs/server-env-checklist.md`; and a decision on whether a missing secret at confirmation (provider path) should raise an ops exception (spec: yes).
21. Idempotency-key shape and helper reuse (`readIdempotencyKey` from the S3 registration service) for the payment routes; `Idempotency-Key` stored as `${orderId}:${key}`.
22. Sender capacity for cancellation notices: Beem and Mailgun volumes for an event with thousands of unclaimed places (bounded to one message per place; throttle in the batch).

---

## 9. Open questions for the owner (only those that change behaviour)
1. **Manual confirmation wording and target.** The app says "FitFlex staff confirm payments within **24 hours**" and refunds are "sent by hand, usually within **5 working days**" (config `EVENTS_MANUAL_CONFIRM_SLA_HOURS`, `EVENTS_REFUND_TARGET_DAYS`). Confirm the numbers, whether "within 24 hours" is acceptable outside business hours, and whether the Swahili "Uthibitisho wa mkono" is the label you want.
2. **Refund presets offered at launch.** Spec: `no_refund`, `refund_until_close`, **full refund until N days before**, **tiered (up to three steps, e.g. 100% / 50% / 0%)**, and `custom` (free text, handled by a person). Offer all five, or only the first three and keep custom for exceptional events?
3. **Does the organizer see per-order amounts?** Today (S3) the Orders tab shows each order's total next to a masked purchaser. Spec keeps it; the new Finance tab is totals only. Alternative: totals only everywhere until payout statements exist.
4. **Who confirms event payments, and how long may unpaid places be held?** Default (D6): the same admins with the `payments` scope and the second approver where `MONEY_SECOND_APPROVER` is on; they must type the amount received. Hold while a manual payment waits: extended by 24 hours, capped at 48 hours from the order (organisations: up to 5 days, because bank transfers are slow); a member whose hold already ended may still send a transaction ID for 24 hours and is re-reserved if places remain, otherwise refunded in full. Accept, or want a dedicated finance scope or different limits?
5. **Organizer-cancelled event and fees.** Spec: a full refund of everything paid (including any fee) whatever the refund preset; FitFlex takes no commission on refunded money; for member cancellations a partial-percentage policy applies to the whole paid amount of the place (fees included). Confirm, in particular whether a fee, if you ever set one, should be non-refundable on member cancellations.
6. **Payout timing.** Should organizers be paid only after the event is complete (plus a few days for refunds and disputes), rather than weekly from the first sale? It changes what the Finance tab promises and how much refund exposure FitFlex carries when an event is cancelled after partial payout. Decide before the settlement slice, but the answer affects the copy now.

---

## 10. Role journeys for `uat-tester` (Flutter web from release-candidate, isolated backend and DB, fixture accounts only)
Camera, push and native payments are "needs a real device". The Tunzaa path can only be exercised with the sandbox and `TUNZAA_SANDBOX_SETTLES`; it is not part of the web UAT unless the owner enables it. Each journey maps to acceptance criteria above.
| # | Journey | Steps (actors) | Pass when |
|---|---|---|---|
| J1 | Manual payment, happy path (PRD scenario 1 payment half) | member orders (S3) → pays Lipa Namba off-app → pay page: ID + phone → submitted; admin A verifies, admin B approves with the amount received | M-P-2..6, P-P-1..2; one ticket per place; notifications 1 and 2 once |
| J2 | Rejection and retry | admin rejects with `reference_not_found` + note → member sees the reason, corrects the ID within the hold, admin approves | M-P-7, P-P-4; hold window respected; no second payment row live at once |
| J3 | Late payment, places still free (scenario 9) | member's hold lapses with a payment pending (short TTL on the UAT backend) → admin approves | order re-reserved and confirmed; ledger balanced; M-P-8 |
| J4 | Late payment, places gone (scenario 9) | as J3 but another member buys the last place first | no ticket; refund raised and shown in Payments, Refunds and the member's order (never green); P-P-3 |
| J5 | Amount mismatch (scenario 8) | admin types a different amount | refusal, nothing changed; P-P-2 |
| J6 | Cancel with refund | member cancels one place of two under a tiered policy; admin approves, then a different admin marks paid | M-P-14..16, P-R-1; order `partially_cancelled`; ticket revoked; place resellable when allowed |
| J7 | Event cancellation (scenario 10) | admin cancels a published event with 3 paid orders and 1 unpaid | P-A-2, P-R-2; refunds approved by a second admin, payouts recorded; participants notified once |
| J8 | Claim after payment (scenario 2 half) | purchaser pays for a friend; invitation shows as sent; friend claims by link with a verified phone | M-P-17..18; ticket moves to the friend; purchaser's access ends and the code rotates |
| J9 | Corporate order payment | billing user places an order, sends a payment notice; admin confirms; employee claims | P-C-1..2; employee tickets; coordinator sees invitation status |
| J10 | Ticket handling | member opens the ticket, goes offline, rotates the code, sees a revoked ticket after cancelling | M-P-11..13 |
| J11 | Organizer view | finance staff opens Finance; ops staff cannot | P-O-1..2; no payer data anywhere |
| J12 | Payments flag off | switch `EVENTS_PAYMENTS_MANUAL` off after J1 | M-P-1, M-P-21: S3 placeholder for new orders; paid members keep tickets, cancel and refund |
