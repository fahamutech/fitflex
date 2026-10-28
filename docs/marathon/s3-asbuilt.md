# Marathon module — Slice 3 as built (2026-10-28)

Registration modes and checkout order foundation. No payment path yet. Everything dormant.

## PRs (all into `release-candidate`, not `main`)
| Repo | PR | Final head | Tests |
|---|---|---|---|
| fitflex-functions | #265 `feat/events-s3-registration-1022` | 9b6a147 | full suite 2903/2903 on an isolated CI database |
| fitflex-portal | #158 `feat/events-s3-corporate-roster-1022` | d1092f1 | tsc, build, events Playwright 68 (flag on) + 5 (flag off) |
| fitflex-mobile | #237 `feat/events-s3-registration-1022` | 31226e3 | analyze clean, full suite 2998, events 208 |
| fitflex (docs) | #89 | — | — |

## Flags and env (all off or defaulted)
`EVENTS_REGISTRATION` (needs `EVENTS_MODULE`), `EVENTS_MAX_PARTICIPANTS_PER_ORDER` 10, `EVENTS_CORPORATE_MAX_ROWS` 500, `EVENTS_TEAM_MAX_MEMBERS` 50, `EVENTS_CLAIM_TOKEN_DAYS` 90, `EVENTS_CONSENT_TEXT_VERSION` `2026-10-draft`, `EVENTS_FEE_RULE` none, `EVENTS_ORG_DISCOUNTS` `{}`. A malformed fee rule or discount config makes quote and order return `invalid_config`. Portal `NEXT_PUBLIC_EVENTS_MODULE`; mobile uses the options probe (`registration`, `teams`, `corporate`) plus `EVENTS_DISCOVERY`.

## Migration
`20270110090900-events-registration-fields.cjs`, additive. Run before deploying functions: the S2 event column lists now include `participantFields` and `duplicatePolicy`. `down` drops consent evidence columns, so treat it as dev-only once real registrations exist. The team FK uses the column-list `SET NULL` form (PostgreSQL 15+; CI runs 16; confirm production).

## Rule 6 callouts
No `src/auth/*`, pricing-constant, payout, check-in or existing endpoint signature changes. Shared-code touch: `splitCsv` exported from the B2B beneficiary import service. Additive response keys on existing events endpoints (`/events/options`, `/events/:idOrSlug`, organizer event GET/PATCH, `/organizer/summary` totals now real). The corporate routes reuse the B2B guard; placing needs owner, admin or finance (D18), validating needs `beneficiaries.manage`.

## Reviews
- Security (functions#265): no high finding. M1 (duplicate-check identity leak), M2 (optional total), M3 (unbounded holds), M4 (quadratic email regex), M5 (purchaser access after claim) and lows L1, L2, L4, L7, L8, L9 fixed in the PR. L3, L5, L6, L10, L11 carried in `follow-ups.md`.
- Contract check: one flow-breaker (corporate place sent ids, backend resolved names only) fixed on both sides; degrades fixed in all three PRs.
- Swahili: Order is "oda" (glossary), order pills use i-class forms; "kushirikisha" for sharing data with an organiser; many glossary fixes. Native review pending.

## Behaviour decisions taken as defaults
Purchaser sees a masked view after the participant claims; participant is notified if the purchaser cancels an unpaid claimed place; one live unpaid order per user per event; corporate orders exempt from the per-user cap; D15 to D22 in `decisions.md`.

## Known gaps
- Unpaid orders expire after 30 minutes (`EVENT_HOLD_TTL_MINUTES`) because there is no payment path until S4; UAT may set 120.
- Claim invitations by SMS and email are built but never sent until S4 (`inviteClaims` seam), so token-link claims cannot be tested yet; the in-app "Is this you?" claim works.
- Android App Link for `/event-claim/*` not added (ships with S4).
- DOB is required on every row once any category has `minAge`; the portal inbox notice for the corporate coordinator is not built.
- Rate limits are in memory per server.
- The finance role can place a corporate order but cannot validate (needs `beneficiaries.manage`); matches D18 but worth knowing.
- Consent and claim texts are drafts pending Tanzanian counsel; all Swahili needs native review.
- Not verified: portal and mobile against a live backend; SMS and email delivery; device-only items.

## Deploy order
functions (migration first) then portal then mobile; flags last, and only after both client builds are adopted, because old S2 builds have an inert Register button.
