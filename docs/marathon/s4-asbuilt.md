# Marathon module — Slice 4 as built (2026-10-29)

Payments (manual-confirmed first, Tunzaa path dormant), ticket issuance, late-payment recovery, event refunds, organizer finance read. This slice touches payment code paths (rule 6). Everything dormant.

## PRs (all into `release-candidate`, not `main`)
| Repo | PR | Final head | Tests |
|---|---|---|---|
| fitflex-functions | #270 `feat/events-s4-payments-1028` | fa1d3fb | full suite 3021/3021 on an isolated CI database; 158 existing payment specs green |
| fitflex-portal | #161 | 1c35c78 | tsc, build, events Playwright 137 (flag on) + 7 (off); existing money specs 71 under a mock-only config |
| fitflex-mobile | #240 | 223ce98 | analyze clean, full suite 3384, events 403 |
| fitflex (docs) | #90 | — | — |

## Launch gates (read before enabling anything)
1. **Run migration `20270110091100-events-payments-tickets.cjs` before the functions deploy.** It sorts before already-applied `20270111…`, `20270120…`, `20270121…` migrations; it should still run under `knex migrate:latest` but dry-run it on the CI DB first (not done).
2. **Set `EVENT_TICKET_SECRET` (32+ chars), `EVENT_TICKET_KEY_ID`, `EVENT_TICKET_SECRET_PREVIOUS`.** Without the secret, payment mode stays `none`. Keep any retired key in `EVENT_TICKET_SECRET_PREVIOUS` while tickets exist.
3. **Event payments fail closed unless `MONEY_SECOND_APPROVER` is on** (override `EVENTS_ALLOW_SINGLE_APPROVER=1`, default off). Owner must switch the second-approver flag on before enabling `EVENTS_PAYMENTS_MANUAL`. Add all new env vars to `docs/server-env-checklist.md`.
4. Keep `EVENTS_PAYMENTS_MANUAL` and `EVENTS_PAYMENTS_TUNZAA` off until both client builds have reached users (old S3 builds cannot pay and show paid orders as unpaid).
5. Deploy order: functions (migration first) → portal → mobile → flags last.

## What was built
- Manual payment: member submits Lipa Namba transaction id and payer phone; an admin with `payments` scope types the amount received (mismatch refuses and writes nothing), second approver where enabled; confirmation commits the order, issues tickets (HMAC-derived static token, hash stored, rotated on claim, revoked on cancel/refund), writes outbox events and notifications, and sends claim invitations (SMS/email) in the recipient's language.
- Late payment: a transaction id may be sent for 24 hours after a hold expires; approval re-reserves places if available, else an automatic full refund; refunded payments can never be re-confirmed (sweep and repair excluded).
- Hold extension while a manual payment waits: +24 h capped at 48 h from the order (organisations 5 days).
- Refunds: `Refund.kind='event_order'`; five presets (`no_refund`, `refund_until_close`, `full_until_days`, `tiered`, `custom`); server-built bilingual policy line is the single source; member cancel of a paid place/order creates a refund; organizer/admin event cancel runs a per-order refund batch (resumable, swept hourly); payouts recorded by hand.
- Organizer finance tab: totals only, roles finance/owner/admin of that organizer.
- Tunzaa: event orders payable behind `EVENTS_PAYMENTS_TUNZAA` (callback re-reads status, amount/currency/reference compared, `WebhookSeen`, lost-callback sweep). Not exercised against the real sandbox.

## Rule 6 callouts (existing code changed; all additive, regression-tested)
`payment-product.mjs` (`EVENT_ORDER`), `admin-payment-service.mjs` (four paid-order guards widened to `orderId || eventOrderId`; decision/update/change responses for event requests add `event` and nest `paymentRequest`; list gains `productType`/`status`/`limit`), `mobile-money-service.mjs` and `functions/mobile-money.mjs`, `refund-service.mjs` and `functions/refunds.mjs` (event refund kind, nullable event columns, bilingual notices for the new kind), `functions/admin-payments.mjs`, `knex-store.mjs` (new allowed fields), `subscription-service.mjs`, `finance-service.mjs` (bookKeeping skips event-order payment requests), `GET /payments/options` (`mobileMoney`), `GET /me` pendingPayments (event title/reference), `GET /events/options`. S3 event routes change behaviour even with the flags off: cancelling a paid target needs `expectedRefundTzs` and creates a refund; admin event cancel now requires `expectedRefundableTzs` when paid orders exist and runs the refund batch by default; a claimed participant gets 403 `purchaser_only` on purchaser actions. Untouched: `src/auth/*`, `constants.mjs`, payout engine, check-in.

## Reviews
- Security (functions#270): one high (a refunded late payment could be re-confirmed by the sweep) plus M1–M6 and L1–L10: all fixed except L6 (hoarding via manual-pay holds), carried. Rulings D29–D32.
- Contract checks: two rounds; remaining findings fixed in the PRs (batch resume stale total, order dialog shapes, cancel-preview route and shape, refund-policy blank on mobile, `rotate_required`, Swahili refund notes, corporate gate, repairable).
- Swahili: glossary fixes in all three; 12-hour clock in portal; admin-typed notes get a Swahili field or a labelled English fallback. Native review pending for "Uthibitisho wa mkono", refund and unfulfilled-payment wording.

## Known gaps
- Organizer settlement statements are NOT built (data seam only); payout timing direction D28 awaits owner confirmation. Vendor and trainer settlement have never been exercised against real accounts.
- Refund payouts are manual; provider refunds not built.
- Ticket scanning and kit collection are Slice 5; tickets say "valid for entry once kit collection ships".
- Portal has no banner for "payments off because second approver is off" (needs an options field).
- Notification sender capacity for cancellations at thousands of places not verified.
- Legal text (refund policy wording, SLA promises, claim and consent texts) is draft pending Tanzanian counsel; Swahili needs native review.
- Not verified: portal and mobile against a live backend; Tunzaa sandbox; SMS/email delivery; device-only items.
