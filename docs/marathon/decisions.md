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

Defaults marked "Open (default)" are implemented as configuration or flags so they can change without a schema rewrite.
