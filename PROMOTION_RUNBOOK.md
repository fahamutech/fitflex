# Moderation & Promotion — Runbook

Operating guide for the Moderation & Promotion module (built 2026-10-07 to 2026-10-09). Written for whoever runs the platform day to day, and for the engineer who gets the page when something looks wrong. Everything here describes what the code does today; where something is a decision or a gap, it says so.

Repos: `fitflex-functions` (backend), `fitflex-portal` (admin web), `fitflexmobile` (app). Memory/decision log: `moderation-promotion-module.md`.

---

## 1. What it does, in one page

- **Moderation** decides whether a gym, trainer, vendor or product may be shown and promoted. It is an overlay on KYC: KYC still decides verification and payouts; moderation decides visibility. A listing with no moderation decision is **approved**, so nothing existing changes until someone decides.
- **Promotions** highlight a listing that is already eligible: *Featured* (a labelled section above results), *Promoted*, *Sponsored* (always commercial), *Recommended by FitFlex* (never commercial), *Campaign*. A promotion has a placement, a priority, a period, a geographic scope and a commercial context.
- **Discovery** (`/discover/gyms|trainers|products`) ranks by match, nearness, quality and popularity, then applies promotions **only to results that already match the customer's search and filters**. A promotion never adds an irrelevant result.
- **Analytics** counts impressions, taps, views, saves, booking/subscription taps and the conversions that follow (purchases, bookings, subscriptions). Only events that **proved they were served** (signed token) are counted.

The rule that matters most: **promotion influences order, never eligibility.** Hidden, suspended, rejected, pending, out-of-area, expired, paused and filter-failing listings cannot be shown or boosted, whatever is paid.

---

## 2. Who can do what (admin permissions)

Staff are given scopes on the **Portal Users** page. A full admin (not a "portal user") has all of them.

| Scope (label on the Users page) | Opens |
|---|---|
| `moderation` — Moderation: view | Listing moderation queue and detail (Moderation & Promotion → Listing moderation) |
| `moderation_decide` — Moderation: approve, reject, suspend, hide | Decide: approve, reject, suspend, hide, restore, reopen, send for review |
| `promotions` — Promotions: create and run | Promotions list/detail, create and edit, submit, pause, resume, cancel, complete; wizard lookups |
| `promotions_approve` — Promotions: approve and activate | Approve, reject, schedule, activate; **change priority/boost weight of an approved promotion** |
| `campaigns` — Campaigns and placement limits | Create/edit/start/end/cancel campaigns; edit placement limits; add geographic areas |
| `promotion_analytics` — Promotion analytics | The Promotion performance page and its three API reads. **Nothing else** (no promotion notes, references or history) |

Rules enforced on the server (not only in the UI):
- **Four eyes.** Whoever created or submitted a promotion cannot approve it (`cannot_approve_own_submission`). The database also refuses it.
- **Ranking is the approver's.** Once a promotion is approved, changing `priority` or `boostWeight` needs `promotions_approve` (a `promotions`-only user can still change end date, commercial reference and notes).
- **Reasons required** for reject, suspend, hide, send-for-review, and for rejecting/cancelling a promotion.
- Every action is written to the audit log with who, before and after.

Typical role bundles (suggestion): *Content moderator* = `moderation` + `moderation_decide`. *Marketing* = `promotions` + `campaigns`. *Marketing lead* = marketing + `promotions_approve`. *Finance/BI* = `promotion_analytics`.

---

## 3. Everyday procedures

### 3.1 Moderate a listing
1. Listing moderation → pick the type (Gyms, Trainers, Vendors, Products) and a status tab.
2. Open a listing: it shows whether it can be listed and promoted **and why not**, the actions available, and the decision history.
3. Decide with a reason. Effects:
   - `suspend` / `hide` / `reject` / `send for review`: the listing disappears from public lists (`/gyms`, `/trainers`, shop, `/discover/*`), cannot be opened by id, and (trainers/products) cannot be newly booked, connected with, engaged or ordered. **Its running or scheduled promotions are paused automatically** (the answer says how many).
   - `restore`: back to approved. **Paused promotions are not resumed automatically** — resume them from Promotions if still wanted.
4. Existing members' subscriptions, existing bookings and check-ins at a hidden gym/trainer are **not** touched.

KYC cases are separate: Partner verification (`/admin/kyc`). Moderation never changes KYC.

### 3.2 Create and run a promotion
1. **Promotions → New promotion.** Steps: listing → type → placement → targeting (areas, categories) → schedule → priority/boost weight → commercial context → review.
   - A listing that cannot be promoted is shown with the reason and cannot be picked.
   - Only placements that suit the listing are offered.
   - **Sponsored** is always commercial; **Recommended** never is. A commercial promotion needs a relationship type and, to submit, a commercial reference or a partner.
   - Review calls the server: eligibility and **room in every placement** for the period and area.
2. **Save as draft**, or **Save and send for approval**.
3. A *different* person with `promotions_approve` approves. Approval needs the listing still eligible and **room in each placement**; it holds a slot for the whole period.
4. Then **Schedule** (goes live by itself at its start) or **Activate now** (period must have started and not ended).
5. Pause / Resume / Cancel (reason) / Complete as needed. A paused promotion has no effect on results until resumed.

Lifecycle: `draft → pending_approval → approved → scheduled → active ⇄ paused → expired → completed`, plus `rejected` (can be reopened to draft) and `cancelled`. **Time is always read at the moment of use**: an expired promotion stops influencing results at its end time even if a job run is late.

Labels customers see: *Featured*, *Promoted*, *Sponsored*, *Recommended by FitFlex*, *Campaign*. A **commercial** promotion always includes "Sponsored" (e.g. a custom label "Top pick" is shown as "Top pick · Sponsored").

### 3.3 Campaigns
Campaigns → New campaign: name, period, areas. A promotion in a campaign must fit inside its dates; a campaign's period cannot move to strand a promotion. Cancelling a campaign does **not** change its promotions; the answer lists the open ones so each can be dealt with.

### 3.4 Placement limits (capacity)
Defaults per placement and type (override on **Placement limits**, `campaigns` scope):

| Type | Default slots | | Setting | Default |
|---|---|---|---|---|
| featured | 5 | | Boost cap (max share of the score range a promotion can add) | 25% |
| promoted | 10 | | Rotation (equal promotions take turns) | time slice, 60 min |
| sponsored | 5 | | Priority range | 1 (strongest) – 100 |
| recommended | 5 | | | |
| campaign | 10 | | | |

- A slot is held from approval until the promotion ends or is cancelled, for the overlapping period **and** overlapping area.
- Approval/schedule/activate/resume and extending an end date are refused with `placement_full` when there is no room (the answer names the placement). Lowering a limit never removes promotions already holding a slot.
- Slot decisions are made one at a time under a database lock, so two admins approving at once cannot both take the last slot.
- Placements: `gym_discovery`, `trainer_discovery`, `vendor_discovery`, `marketplace`, `search_results`, `home`, `campaign_page`. **Today the apps only read `gym_discovery`, `trainer_discovery`, `marketplace` and `search_results`**; `vendor_discovery`, `home` and `campaign_page` take slots but have no visible effect (no public vendor list; the app does not request the others).

### 3.5 Where customers see it
- A typed **search** reads `search_results`; browsing (with or without filters) reads the type's discovery placement (`gym_discovery`, `trainer_discovery`, `marketplace`).
- Picking an explicit **sort** (price, rating, distance…) **turns promotion off** and the answer says so.
- **Featured** appears only if the listing also passes the customer's search and filters.
- **Local promotions** need the viewer's area (`areaId`, or derived from `lat/lng` via the area circles). A viewer with no known location does not see a locally scoped promotion.
- The shop shows Featured products and labels but **keeps its own ordering** (not boosted).

---

## 4. Analytics

**Portal:** Moderation & Promotion → Promotion performance (needs `promotion_analytics`).

What is counted (verified events only):
- *Impressions* (card shown), *search appearances* (impressions in `search_results`), *clicks* (taps), *profile/product views*, *saves*, *booking taps*, *subscription taps*, *unique viewers*.
- Conversions (recorded by the **server**, credited to the promotion whose card the customer tapped):
  - **Purchase** — a paid shop order, tapped in the 7 days before.
  - **Booking** — a trainer booking request that is confirmed (free, or payment approved).
  - **Subscription** — a gym membership paid for that is about a gym (direct plan, or a pass with a home gym).
  - Window: **7 days before the customer asked** (not before staff approved). Only a **verified tap** counts; a page view does not. Latest tap wins. Taken back on reject / cancel / refund / payment reversed.
- Ratios (CTR, view rate, conversion rate) show "—" when the denominator is 0, never 0%. Conversion rate = conversions per tap (can exceed 100% in rare cases).
- Days are **East Africa Time** calendar days; default last 30 days, max 400.
- "N events not counted" = events with no valid proof (older app builds, or forgeries). They are stored but excluded from every total.

API: `GET /admin/promotion-analytics`, `/admin/promotions/:id/analytics`, `/admin/promotion-campaigns/:id/analytics` (`from`, `to`, `type`, `entityType`, `campaignId`, `placement`).

**Not credited:** network passes with no home gym, trainer passes, automatic renewals. Events recorded before 2026-10-09 (before tokens) are unverified and not counted.

---

## 5. Configuration and secrets

| Setting | Where | Meaning |
|---|---|---|
| `PROMOTION_EVENT_TOKENS` | server env | `optional` (default): events without a token are **stored but not counted**. `required`: events without a token are **refused** (`token_required`). **Set to `required` once enough people have the app build with tokens.** |
| `PROMOTION_EVENT_SECRET` | server env (optional) | Signing key for served-card tokens. If unset, a key is derived from `JWT_SECRET` (production already requires it). |
| `PROMOTION_EVENT_SECRET_PREVIOUS` | server env (optional) | The old key, accepted for verification during a rotation. |
| `SERVER_DISCOVERY` | app build (`--dart-define=SERVER_DISCOVERY=false`) | Turns the app's use of `/discover/*` off (falls back to the plain lists with phone-side filtering). Default on. |
| `PROMOTION_ANALYTICS` | app build (`--dart-define=PROMOTION_ANALYTICS=false`) | Turns all app event recording off. Default on. |

**Rotating the token key** (tokens last 24 h):
1. Set `PROMOTION_EVENT_SECRET_PREVIOUS` = the current secret (or leave blank if you were using the `JWT_SECRET`-derived key, then set it to the `JWT_SECRET` value).
2. Set `PROMOTION_EVENT_SECRET` = a new random secret (32+ bytes). Deploy.
3. New cards are signed with the new key; cards already out still verify with the previous one.
4. After 24 h remove `PROMOTION_EVENT_SECRET_PREVIOUS`.

**Turning tokens to required.** Check first that the new app build is out (Section 8.3 below shows how to check how many events arrive without tokens). Set `PROMOTION_EVENT_TOKENS=required` and redeploy. To undo, set it back to `optional`.

Tokens bind a card to the **promotion, listing and the app session** that asked; the app sends `?session=<id>` to `/discover` and the same id with its events. A token is not a login and carries nothing private.

---

## 6. Scheduled jobs

Both run through the existing operations service (locking, run records, exceptions). See them under **B2B operations** in the admin portal (jobs list; run now / pause need the `b2b` scope).

| Job | When | Does |
|---|---|---|
| `promotion-lifecycle` | every 5 minutes | Starts scheduled promotions whose start has arrived; expires those whose end has passed; if the listing was blocked in moderation meanwhile it holds the promotion instead of starting it. Each promotion is moved alone from its **current** state, so an admin's pause is never overwritten. Safe to run twice. |
| `promotion-events-retention` | daily 21:40 UTC (00:40 EAT) | Deletes raw events older than **13 months** (calendar months). |

Because every read checks the clock itself, a stopped lifecycle job never lets an expired promotion keep influencing results; it only leaves the stored status stale until the next run.

---

## 7. Data model (Postgres)

Migrations, in order: `20261126090000-moderation-promotion`, `20261127090000-promotion-events`, `20261128090000-promotion-hardening` (four-eyes CHECK), `20261129090000-promotion-event-verified`. All additive.

| Table | Holds |
|---|---|
| `ModerationState` / `ModerationEvent` | Latest moderation decision per listing (no row = approved) / append-only history |
| `GeoArea` | Country > region > city > district (seeded: Tanzania, Dar es Salaam, Zanzibar + Stone Town, Arusha, Dodoma, Mwanza); `Gym`/`TrainerProfile` have `regionId`/`cityId` (backfilled from address) |
| `Promotion`, `PromotionPlacement` | The promotions and which placements each occupies |
| `PromotionCampaign` | Campaigns |
| `PlacementConfig` | Per placement × type: slots, boost cap, rotation (rows only where an admin changed the default) |
| `PromotionEvent` | Raw analytics events. `verified` = proved it was served. `source = 'server'` rows are conversions the server recorded |

Existing audit entries: `AuditLog` actions start with `moderation.`, `promotion.`, `campaign.`.

---

## 8. Troubleshooting

### 8.1 "My promotion is not showing"
Work down this list; the **promotion detail page** answers most of it (status, eligibility, room, history).
1. **Effective status** must be *Active* (not Draft, Waiting for approval, Approved-but-not-activated, Paused, Expired). Approved ≠ live: it must be scheduled or activated.
2. **Period**: now must be between start and end.
3. **Listing eligible?** The detail page shows reasons: moderation not approved, gym/trainer/product inactive or switched off, product pending/hidden/deleted, vendor not approved/published/KYC-operational.
4. **Placement**: a typed search reads `search_results`; browsing reads the discovery placement. A promotion on `home` or `vendor_discovery` shows nowhere today.
5. **Area**: a locally scoped promotion needs the viewer's area; no location = not shown.
6. **The customer's search/filters**: Featured and boosts apply only to results that already match. A "Featured" gym that does not match "boxing" will not appear for "boxing".
7. **Sort**: any explicit sort turns promotion off.
8. **Client**: app builds before 2026-10-08 do not call `/discover`; if `SERVER_DISCOVERY=false` the app uses plain lists.
9. **Boost size**: a *Promoted* boost is capped (25% by default) and cannot lift a weak match over a strong one by design.

### 8.2 "Placement full" when approving
The error names the placement. Open **Placement limits** to see used/allowed. Options: raise the limit (`campaigns`), end or cancel another promotion, change dates, or choose a different area/placement. Capacity counts overlapping **period and area**; a long promotion can block several short ones (conservative by design).

### 8.3 "The numbers are zero / lower than expected"
1. The dashboard's **"N events not counted"** notice: those events had no valid token (older app builds, or forgeries). If N is large and tokens are not yet required, the new app build is not widely installed.
2. Events only count if the app sent `?session=` to discovery and the **same session id and the card's token** with each event. Check the app build.
3. `PromotionEvent` rows exist? `select event, verified, count(*) from "PromotionEvent" where "promotionId" = '<id>' and "at" > now() - interval '1 day' group by 1,2;`
4. An event is only accepted if it is about a time the promotion was running (15 min before its start to 6 h after its end).
5. Per-session caps may have dropped taps (below).
6. The date range is in **EAT days**; today is partial.

### 8.4 Event rejection reasons (`POST /events` answer `rejected[].error`)

| Error | Meaning |
|---|---|
| `invalid_token` | Token wrong, tampered, expired (24 h), for another promotion/listing/session, or event earlier than the card was served. Never retry. |
| `token_required` | No token and the server is in `required` mode. |
| `promotion_required` / `promotion_not_found` / `promotion_mismatch` | Event names no promotion / unknown one / one that is not for that listing |
| `promotion_not_served` | Promotion is a draft/pending/rejected (never shown) |
| `outside_promotion_period` | Event time outside the promotion's running period (± slack) |
| `session_limit` | One session exceeded its allowance: 30 taps, 10 saves, 10 booking taps, 10 subscription taps **per promotion per hour**, 600 events per hour in total |
| `invalid_event`, `invalid_event_type`, `invalid_entity_type`, `entity_required`, `session_required`, `invalid_placement` | Malformed event |
| Request level: `events_required` (400), `batch_too_large` (413, max 50), `invalid_source`, `rate_limited` (429) | |

Rate limits (per server instance): 1200 events/min and 6000/hour per caller, 30000/min for everyone. With several instances the real allowance is multiplied. The client address used is the first `X-Forwarded-For` entry; **confirm the proxy setup before relying on it against abuse.**

Repeats count once: an impression per session/promotion/placement/hour (our clock), a detail view per session/promotion/10 minutes. Taps and saves are never de-duplicated.

### 8.5 "A booking or subscription was not credited"
Credit needs **all** of: the member was signed in when they tapped the promoted card; the tap was **verified**; it was on **that trainer/gym** (not another); within 7 days **before they asked**; the booking is confirmed (or the membership paid) and still is; for subscriptions the membership has a **home gym** and is a direct plan or a pass with a home gym. Check: `select * from "PromotionEvent" where "userId" = '<member>' and "entityId" = '<listing>' order by "at" desc;`

### 8.6 Everything just got slow
Run the benchmark (Section 9). Public paths scale with the number of gyms/trainers/products (each discover call loads the table, as `/gyms` does) and live promotions; the analytics summary scales with events. At 3,000 gyms/300 promotions/500k events: `/gyms` ~25 ms, discovery 30–60 ms, analytics summary ~0.5 s. At 15,000/1,500/1M everything is about 5–6× (discovery ~150 ms). Nothing is cached yet.

### 8.7 Rolling back
- **Stop promotions affecting customers immediately:** pause them (Promotions → Pause) or set the placement's slots to 0 for new ones. There is no global off switch in the server; the app can be built with `SERVER_DISCOVERY=false`.
- **Stop counting/collecting events:** build the app with `PROMOTION_ANALYTICS=false`; the server accepts but ignores nothing it is not sent. Existing rows are deleted by the retention job after 13 months, or on request per user (below).
- **Moderation mistakes:** `restore` the listing; resume its promotions by hand.

### 8.8 Privacy requests
`PromotionEvent.userId` holds the id of a signed-in customer (no names, no IPs). **Deleting an account unlinks the user from their events** (counts kept). To do it by hand: `update "PromotionEvent" set "userId" = null where "userId" = '<id>';`

---

## 9. Tools

- **Benchmark:** `FITFLEX_USE_CI_DB=1 KYC_ENFORCEMENT=off node scripts/promotion-bench.mjs [gyms] [promotions] [events]` in `fitflex-functions`. Seeds `bench_*` rows in the **CI database** (never production), times the hot paths and deletes what it created.
- **Tests:** backend `npm test` (≈1,670 tests; `node --test` against a Postgres CI database); portal `npx playwright test` (mocked API; the bundled browser may need installing, or use `channel: 'chrome'`); app `flutter test`.
- **Admin pages:** Moderation & Promotion → Overview, Listing moderation, Promotions, Campaigns, Placement limits, Promotion performance.

---

## 10. Known limits and open decisions (as of 2026-10-09)

- New listings start approved (nothing creates `pending` rows automatically): decide whether new gyms/trainers/products should start pending.
- Promotions target the **viewer's** area, not the listing's own.
- Vendor promotions and the `home`, `vendor_discovery`, `campaign_page` placements have no visible effect yet.
- Shop results are labelled but not re-ordered by promotion.
- Token proof is not absolute: scripting `/discover` with a fresh session per fake device still mints tokens (stronger proof needs device attestation).
- Booking/subscription conversion rate can exceed 100% (several bookings after one tap); network passes, trainer passes and renewals are not credited.
- App impressions are "card built", not "fully visible".
- Capacity counts overlapping promotions pairwise (conservative); live promotions list is not cached.
- Mobile app layout and tracking have not been verified on a physical device.
- Swahili wording for the new screens and strings has not had a native review.
- The legal documents may need a line about analytics data (user id, 13-month retention).

---

## 11. Code map

- Backend rules (pure): `src/shared/promotion-config.mjs`, `promotion-rules.mjs`, `promotion-events.mjs`, `discovery-scoring.mjs`; tokens: `src/auth/promotion-token.mjs`.
- Backend services: `src/services/moderation-service.mjs`, `moderation-gate.mjs`, `promotion-service.mjs`, `promotion-entities.mjs`, `discovery-service.mjs`, `promotion-events-service.mjs`, `promotion-analytics-service.mjs`.
- Routes: `functions/moderation.mjs`, `promotions.mjs`, `discover.mjs`, `promotion-events.mjs`; jobs in `functions/jobs.mjs` and `src/services/b2b-jobs.mjs`.
- Hooks into existing flows: shop `onOrderPaid`/`onOrderCancelled`, trainer booking `onBookingConversion`, payments `onSubscriptionActivated`/`onSubscriptionPaymentReversed`, account deletion `onAccountDeleted`, the moderation gate on `/gyms`, `/trainers`, shop and the trainer/shop transaction routes.
- Portal: `app/admin/{moderation,promotions,promotion-campaigns,promotion-limits,promotion-overview,promotion-analytics}`, components `moderation-entity`, `promotion-wizard`, `promotion-detail`, `promotion-analytics`, labels in `src/lib/{promotions,moderation}.ts`.
- App: `lib/shared/{promotion,discovery_loader,promotion_events}.dart`, `lib/shared/components/ff_promotion_badge.dart`, `ff_featured_strip.dart`, gym/trainer tabs and the shop.
