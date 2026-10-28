# Marathon module — decision log

| # | Decision | Status | Date | Notes |
|---|---|---|---|---|
| D1 | Payment provider for events | **Approved** | 2026-10-22 | Launch on the labelled manual confirmation path (Lipa Namba + transaction ID + admin decision, as the marketplace does). Tunzaa extension to event orders is built behind `EVENTS_PAYMENTS_TUNZAA`, off until the owner confirms it as the launch provider. Selcom not pursued. |
| D2 | Merchant of record, fees, payout | **Approved** | 2026-10-22 | FitFlex collects ticket money. Organizers are paid weekly through the existing partner-statement workflow (draft → submitted → approved → payable → paid, maker-checker), with a commission rate per organizer like vendors. Rate value and payout day are configuration, not code. |
| D3 | Organizer identity model | **Approved** | 2026-10-22 | New vendor-style user types `event_organizer` and `organizer_staff`; `OrgMembership.orgType = 'organizer'`; partner KYC case with `partnerType = 'event_organizer'`. Touches `src/auth/*` (rule 6 callout + security review in S2). |
| D4 | Money representation | Default applied | 2026-10-22 | Repo convention: integer whole TZS in `*Tzs` columns plus `currency` column (default `TZS`). PRD minor-units proposal not adopted. |
| D5 | Error envelope and route prefix | Default applied | 2026-10-22 | Repo convention `{ error: code, ...extra }`; no `/api/v1`. `/v1/organizer/...` reserved for API-key callers only. |
| D6 | Manual payment approvers for event orders | Open (default) | — | Same admin scopes and `MONEY_SECOND_APPROVER` behaviour as other payment requests until told otherwise. |
| D7 | Offline kit scanning | Open (default) | — | Deferred to S7 behind its own flag. |
| D8 | Timing providers / results format | Open (default) | — | CSV import first; API submission via organizer API keys. |
| D9 | Reward funding | Open (default) | — | FitFlex-funded digital-only rewards at launch; sponsor-funded rewards need issuer + funding fields (modelled, unused). |
| D10 | Organizer verification evidence and SLA | Open (default) | — | Vendor KYC checklist plus event permit document type; no SLA encoded. |
| D11 | Publish approval | **Approved** | 2026-10-22 | FitFlex admin approval mandatory for every publish. No trusted-organizer direct publish (not built). |
| D12 | Organizer cancel with registrations | **Approved** | 2026-10-22 | Organizer self-cancel blocked once confirmed registrations exist (409 `has_registrations`); admin cancels; refunds per policy from S4. |
| D13 | Event permit | **Approved** | 2026-10-22 | Optional at organizer approval and at event submission; admin sees a warning (`permitOnFile`). Not required to publish. |
| D14 | Guest self-registration | **Approved** | 2026-10-22 | A guest purchaser's own "self" place has no `participantUserId`; it is claimed after verification (S3 claim flow). |
| D15 | Participant invitations timing | Default applied | 2026-10-22 | SMS/email claim invitations go out on payment confirmation (S4); in-app "Is this you?" notices at order creation for verified matching contacts. |
| D16 | Hold length | Default applied | 2026-10-22 | `EVENT_HOLD_TTL_MINUTES` stays 30 in code; UAT backend may set 120 via env. |
| D17 | Per-place removal before payment | Default applied | 2026-10-22 | Purchaser may remove one person from an unpaid multi-place order (except the last place of a line). |
| D18 | Who places a corporate order | Default applied | 2026-10-22 | Roster permission (`beneficiaries.manage`) validates; placing requires an `ORG_BILLING` role (consistent with B2B two-admin money). |
| D19 | Corporate group label | Default applied | 2026-10-22 | `groupLabel` column added to corporate registrations (department filter later). |
| D20 | Duplicate policy default | Default applied | 2026-10-22 | One place per person per category, matched on normalised phone or email as entered; organizers can relax it. |
| D21 | Member-facing fee line | Default applied | 2026-10-22 | No FitFlex service fee shown to members unless `EVENTS_FEE_RULE` is set; organizer commission comes from the payout (D2). |
| D22 | Swahili terms for S3 | Default applied | 2026-10-22 | "tiketi" = a bought place, "zimeshikiliwa" = held; "nafasi" stays reserved for roles. Native review pending. |
| D23 | Manual confirmation wording | Default applied | 2026-10-28 | App says FitFlex staff confirm payments within 24 hours (`EVENTS_MANUAL_CONFIRM_SLA_HOURS`) and refunds are sent by hand, usually within 5 working days (`EVENTS_REFUND_TARGET_DAYS`); label "Uthibitisho wa mkono" pending native review. Manual path is always labelled manual (PRD §9). |
| D24 | Refund presets at launch | Default applied | 2026-10-28 | All five offered: `no_refund`, `refund_until_close`, `full_until_days`, `tiered` (up to three steps), `custom` (free text, handled by a person). Default preset in the wizard: `refund_until_close`. |
| D25 | Organizer sees per-order amounts | Default applied | 2026-10-28 | Orders tab keeps each order total beside a masked purchaser; Finance tab is totals only. Never payer phone or payment reference. |
| D26 | Who confirms event payments; hold while under review | Default applied | 2026-10-28 | Admins with the `payments` scope plus the second approver where `MONEY_SECOND_APPROVER` is on; they must type the amount received. Hold extended 24 h while a manual payment waits, capped at 48 h from the order (organisations up to 5 days). A member whose hold ended may send a transaction id for 24 h; places are re-reserved if available, else full refund. |
| D27 | Fees on cancellation | Default applied | 2026-10-28 | Organizer-cancelled event: full refund of everything paid including any fee; FitFlex takes no commission on refunded money. Member cancellations: the policy percentage applies to the whole paid amount of the place, fees included. No member fee exists unless `EVENTS_FEE_RULE` is set (D21). |
| D28 | Organizer payout timing | Default applied (copy only) | 2026-10-28 | Finance tab makes NO promise about payout timing. Direction for the settlement slice: pay after the event is completed plus a refunds/disputes window, rather than weekly from the first sale (this refines D2; owner to confirm before the settlement slice). |

Defaults marked "Open (default)" are implemented as configuration or flags so they can change without a schema rewrite.
