# Gym Communication & Member Engagement — Codebase Audit (M0)

**Date:** 26 Sep 2026
**Scope:** Read-only inspection of `fitflex-functions` (API), `fitflexmobile` (Flutter app, which includes the gym-owner app) and `fitflex-portal` (admin/HR web). **No code was changed.**
**Baseline:** Each repo's `main` as of the 25 Sep 2026 release, plus the open social-sharing PRs (functions#15, mobile#20, portal#6). None of these PRs affect this module.

---

## 1. Current architecture

| Layer | What exists | Notes that matter for this module |
|---|---|---|
| **API** | Node ESM on **bfast-function** (`bfast fs serve`). Each file in `functions/*.mjs` exports endpoint objects shaped `{ method, path, onGuard, onRequest }`, or cron jobs shaped `{ rule, onJob }`. | Thin REST modules call services. All wiring is in `src/bootstrap/services.mjs`, the single composition root with DI. |
| **Services** | `src/services/*-service.mjs`, each built by `createXService({ deps })`. They return `{ error, status }` instead of throwing. | New services must follow this pattern: factory, injected collections, and `{error,status}` results. |
| **Data** | PostgreSQL with **Knex migrations** (`db/migrations/*.cjs`, 28 so far). Migrations run on deploy through `postinstall`. | Tables are PascalCase with camelCase columns and text ids like `ntf_xxxxxxxx`. |
| **Data access** | `src/infra/knex-store.mjs` exposes a `collection(name)` API. New tables must be added to **`TABLE_MAP`** and **`ALLOWED_FIELDS`**; columns not listed are silently dropped on write. | ⚠️ `filterAsync(pred)` / `findAsync(pred)` **load the whole table, then filter in JS**. Only `findByIdAsync`, `findByColumnAsync`, `filterByColumnAsync` and `filterByColumnInAsync` run real SQL. The raw Knex `db` is exported, but no service uses it yet. |
| **Auth** | JWT (`src/auth/jwt.mjs`): `requireAuth(...roles)`, `requireAcl(scope)` for portal staff, and `requireGymAcl(scope)` for gym staff. | Owners (`gym_operator`) are unrestricted. Gym staff (`gym_staff`) need a scope from `GYM_STAFF_ACL_SCOPES = members, checkins, payments, trainers, gyms, shop` in `owner-staff-service.mjs`. |
| **Mobile** | Flutter 3.x, `go_router`, `ChangeNotifier` state, a hand-rolled `ApiClient`, and a component kit in `lib/shared/components` (`FFCard`, `FFMetricCard`, `FFStatTile`, `FFPill`, `FFSegmented`, `FFEmptyState`, `FFPageHeader`…). Design tokens are in `design_tokens.dart`. | The **gym-owner experience lives here** (`lib/screens/owner/*`). Bottom nav: Home · Gyms · Members · Trainers, with pushed pages for Earnings, Shop, Staff, Check-ins and Member detail. The web build ships the same UI. |
| **Portal** | Next.js 15 static export on Firebase Hosting, with Tailwind 4, Radix and recharts. Areas: `/admin/*` (ACL-scoped), `/hr/*`, and a minimal `/owner/manage` page. | Owners and operators also sign in here. Their nav is Dashboard · Scan · Check-ins · Manage gym. Admin nav items are gated per `aclScope` in `src/components/Shell.tsx`. |
| **Tests** | API: `node:test` specs in `specs/*.specs.mjs`, with in-memory `memStore` fakes for unit tests and a CI Postgres (`FITFLEX_USE_CI_DB=1`) for API tests. `scripts/role-smoke.mjs` runs 33 live role checks. Mobile: `flutter_test` plus Patrol integration tests. Portal: Playwright e2e. | CI runs `backend-tests.yml`. Every merge to `main` deploys automatically. |

## 2. Relevant existing models

| Concept | Table / field | How it's defined today |
|---|---|---|
| User / role | `User` (`userType`: member, gym_operator, gym_staff, trainer, vendor, admin…; `aclPermissions TEXT[]`) | Phone is stored in **`User.phone`**. Owner→gym mapping is `User.gymIds[]` / `User.gymId`. |
| Gym | `Gym` | Has `name`, `tier`, `location`, rates (`ratePerDay/Week/Month`), `classes`, `trainerPass`. |
| Gym owner | `User` with `userType='gym_operator'` (collection `gym_owners` is a filtered view) | `ownerGymIdsOf(owner) = owner.gymIds \|\| [owner.gymId]`. |
| **Gym member** | There is no membership table. `member-management-service.mjs` derives two kinds: **direct** members (`Subscription.type='direct_sub'` with `homeGymId` ∈ owner gyms) and **FitFlex roaming** members (anyone with a `platform_pass`/`roaming_topup` check-in at an owner gym). | ⚠️ Ownership is decided by `membershipOwnership()`: a direct sub **or any check-in**. See Decision D1. |
| Membership / subscription | `Subscription` (`type` = direct_sub · platform_pass · trainer_pass · credits…, `tier`, `plan`, `status`, `startedAt`, `renewsAt`, `expiresAt`, `homeGymId`) | Status comes from `effectiveSubscriptionStatus()`, which returns `expired` once `expiresAt` has passed, even if the stored status says otherwise. Member rows show `active · expiring_soon (≤7d) · expired · suspended · checked_in`. |
| Payment | `PaymentRequest` (`status` pending/approved/rejected/cancelled, `provider` admin_approved/admin_manual, `amountTzs`, `gymId`, `subscriptionId`, `bookingGroupId`) | See §6. |
| Check-in | `Checkin` (`memberId`, `gymId`, `timestamp`, `subscriptionType`, `visitConsumed`) | Indexed on `(gymId, timestamp)` and `(memberId, timestamp)`. This is the basis for inactivity and visit counts. |
| Demographics | `User.memberProfile` jsonb: `dateOfBirth`, `gender`, `heightCm`, `weightKg`, `fitnessGoal`… | Optional and entered by the member. There is **no member location field**. |
| Member engagement | `gym-sharing-service.ownerEngagement()` | Engagement bands from check-ins: active ≤7d · slipping 8–14 · at_risk 15–30 · lapsed 30+. |
| Member ↔ gym consent | `GymMemberSharing` (classAttendance, gymWorkouts, challenges) | All off by default. This is about **activity data**, not messaging. |

## 3. Existing APIs relevant to this module

| Endpoint | Purpose | Reuse |
|---|---|---|
| `GET /owner/members` (`?gymId, memberType, status, search`) | Owner member list plus stats (`totalMembers`, `activeToday`, `expiringSoon`) | Its row builder is the **canonical definition** of a gym member and their status. Segmentation must match it. |
| `GET /owner/members/:id` (+ `/checkins`, `/payments`, `/checkin-summary`) | Member profile, checks ownership | Add a `/communications` timeline beside these. |
| `GET /owner/engagement` | Engagement bands | Reuse its band thresholds for the "Inactive" segment. |
| `GET /me/notifications`, `POST /me/notifications/:id/read` | Member inbox plus unread count | Reuse as the in-app channel. |
| `POST /me/device-tokens` (+ `/remove`) | FCM token registration | Reuse. |
| `POST /whatsapp/webhook` | Inbound WhatsApp messages (unauthenticated) | Needs rework; see §8. |
| `/trainer/send-message/:memberId`, `/operator/send-payment-notification`, `/vendor/send-order-*`, `/admin/send-*reengagement*` | Ad-hoc WhatsApp sends | ⚠️ No relationship checks (§10). Don't reuse them. |

## 4. Existing screens

- **Owner app (Flutter):** Home dashboard (`owner_home_tab.dart`), Members list, detail and history (`screens/owner/members/*`), Manage gyms, Trainers, Staff, Earnings, Shop, and the QR scanner. The owner app bar (`FFOwnerDashboardBar`) has a **notification bell that only shows a "no notifications" SnackBar** (`owner_shell.dart:347`).
- **Member app:** Home, Activity, Gyms, Shop and Profile tabs, plus Passes, Payment and Privacy pages. **There is no inbox screen.** `ApiClient.notifications()` and `markNotificationRead()` exist but nothing calls them.
- **Portal:** admin pages (members, payments, analytics, challenges, rewards, settings…) and HR pages. There is no communication UI.

## 5. Existing notification infrastructure

`src/services/notification-service.mjs` is a clean base to build on:

- `notify(userId, {type, title, body, data, whatsapp?})` **always writes a `Notification` row**, the in-app inbox. It then tries FCM push, then WhatsApp through an optional callback. It never throws.
- `Notification` columns: `id, userId, type, title, body, data jsonb, readAt, createdAt`. There is **no** gymId, campaignId, category, delivery status, clickedAt or locale.
- Push results (sent/failed counts) are **returned but not persisted**. There's no per-message delivery record.
- Domain events already wired: trainer booking requested/confirmed, subscription activated, and T‑3/T‑1/T‑0 renewal. Social, challenge-reward and trainer-client services also call `notify`.
- **All notification text is hardcoded English on the server.** No member language is stored server-side; the app keeps the locale on the device only.

## 6. Existing membership expiry and payment events

| Event | Where it happens | Hook today |
|---|---|---|
| Subscription activated (payment approved) | `admin-payment-service.decide()` calls `onSubscriptionActivated` | ✅ `notifySubscriptionActivated` |
| Payment **rejected** | `decide()` sets the sub to `payment_rejected` | ❌ No hook. This is the only "payment failed" signal that exists. |
| Payment pending | `subscribeDirect()` creates a `payment_pending` sub and a `pending` PaymentRequest | ❌ No hook |
| Owner-recorded payment | `createMember` / `renewMember` insert `admin_manual` PaymentRequests, **always approved** | ❌ No hook |
| Selcom webhook | `webhook-service.handleSelcom()` can activate a `payment_pending` sub | ❌ No notification. The failure status is ignored. |
| Expiry | **Derived at read time** (`effectiveSubscriptionStatus`). No sweep flips status or emits an event. | ❌ No "expired" event |
| Upcoming renewal | `jobs.mjs/renewalNotifier` runs daily at 09:00 UTC and handles T‑3/1/0 for **every active sub, including direct gym subs** | ⚠️ Not idempotent: a rerun sends again. It loads the whole `Subscription` table. It uses `renewsAt`, while gym-member status uses `expiresAt`. |

**Implications:**
- For gym members, "payment failed" can only mean an admin-rejected in-app payment request.
- Owner-recorded payments are cash or manual, so they never fail.
- Revenue attribution can be calculated reliably from `PaymentRequest(status='approved', subscriptionId → direct_sub at this gym)`.

## 7. Existing check-in events

`check-in-service.mjs` inserts `Checkin` rows for staff scans, member self-scans and owner manual check-ins. It has **no event emission or hook**, and none is needed. Inactivity and visit segments can be calculated from `Checkin` with indexed SQL. A "welcome back" trigger would need a small post-insert hook.

## 8. Existing WhatsApp capability

There are **two parallel, partly broken integrations:**

1. **`src/services/whatsapp-service.mjs` (Africa's Talking, direct).** `notificationService` uses this one.
   - 🐞 **Bug:** it reads `user.phoneNumber`, but the column is **`User.phone`**. Every send to a real user returns `user_no_phone`. The specs use `phoneNumber` fixtures, so tests pass anyway.
   - ⚠️ **Unverified API contract:** it POSTs form-encoded data to `{apiUrl}/version1/messaging` with `type=WhatsApp&templateId=…`. Africa's Talking documents its WhatsApp API at `https://chat.africastalking.com/whatsapp/message/send`, with a JSON body. The current code has probably never delivered a message. It needs to be checked against the provider docs or a live account before relying on it.
   - It has 9 hardcoded template names. `WHATSAPP_SETUP.md` shows they were **never confirmed approved**; the checklist items are still open.
   - There's no delivery-status handling, no opt-out/STOP handling and no message ledger. The audit log is written only on success.
   - `handleInboundMessage` scans every user to match a phone number.
2. **`src/integrations/whatsapp-hooks.mjs` (`createWhatsAppNotifier`).** This is a thin client for a separate **`fitflex-whatsapp` service** (`WHATSAPP_SERVICE_URL`, `FITFLEX_INTERNAL_TOKEN`). It has a template catalogue that includes `subscription_renewal`, `subscription_expired` and `subscription_payment_failed`, and supports `language`. It's **instantiated but never called**. That service isn't in this workspace, and I can't tell whether it's deployed.

**Configuration:** `AFRICAS_TALKING_API_KEY/URL/USERNAME` and `WHATSAPP_SERVICE_URL` + `FITFLEX_INTERNAL_TOKEN`. With neither set, sends are skipped cleanly (`503 whatsapp_not_configured`). I couldn't see production env values.

**`/whatsapp/webhook`** has no authentication or signature check, and only handles inbound text.

## 9. Firebase / FCM capability

- **Server:** `firebase-admin` `sendEachForMulticast` with dead-token cleanup. It's gated by `PUSH_NOTIFICATIONS=on`, so it's off by default. `notificationId` and `type` go in the data payload.
- **Mobile:** `PushService` registers the token on sign-in, on **Android only**. Web push (VAPID/service worker) and iOS aren't set up.
- **There are no `onMessage`, `onMessageOpenedApp` or `getInitialMessage` handlers**, so tapping a push does nothing beyond opening the app, and there's no deep-link routing.

## 10. Security and tenancy findings

| # | Finding | Severity | Impact on this module |
|---|---|---|---|
| S1 | Owner member detail and payment history return **all of a member's payments** (`paymentRequests.filterAsync(p => p.memberId === memberId)`), not just this gym's. For roaming members that exposes their FitFlex pass and trainer payments to any gym they once visited. | Medium, existing | The history/timeline endpoints must not copy this. Fix it in M11. |
| S2 | `/trainer/send-message/:memberId`, `/trainer/send-booking-reminder`, `/operator/send-payment-notification` and `/vendor/send-order-*` let **any** trainer, operator or vendor WhatsApp **any** user id. There's no relationship check. | High, existing (masked by bug §8.1) | These are cross-tenant messaging holes. Fixing S2 is a precondition for enabling live WhatsApp. |
| S3 | `/whatsapp/webhook` is unauthenticated. `/test/whatsapp` is open in any non-production `NODE_ENV`. | Medium | Delivery-status webhooks need a verified callback: a secret token, as the Selcom webhook uses. |
| S4 | "Owns member" is true after **one check-in**. | Design | This drives Decision D1. |

Good existing patterns to copy: every owner member endpoint uses `requireAuth('gym_operator','gym_staff')` and `requireGymAcl(...)`, and then re-checks ownership inside the service (`not_your_member 403`). There's a dedicated `owner-gym-scoping.specs.mjs`.

## 11. Scheduled and background processing

- bfast cron jobs in `functions/jobs.mjs`: `renewalNotifier` (09:00 UTC) and `challengeRewardSettler` (21:30 UTC).
- There is **no queue, job-run table, lock, retry or dedupe store.** Idempotency exists only in services that check their own rows (e.g. challenge rewards).
- Jobs use UTC. Analytics and member progress use **EAT day boundaries** (`T00:00:00+03:00`).
- Bulk work runs inline inside the cron handler. A large campaign needs chunked, resumable processing, driven by a ledger table and a frequent cron tick.

## 12. Localization

- **Mobile:** `lib/shared/i18n.dart`, the `FFLocale` map with `en` + `sw` (~1,900 keys each), used as `context.tr('key')`. Swahili exists for every key. A native-speaker review of recent strings is still an open item.
- **Portal:** `src/lib/i18n.ts`, the same key-map approach with `en` + `sw`.
- **Server:** English-only hardcoded strings, and no member locale. The `fitflex-whatsapp` hook supports `language`.

## 13. Analytics

- Admin product analytics (`analytics-service.mjs`) covers counts only, over 7/30/90 days in EAT.
- The owner app has an engagement card and a member stats card. There is no messaging analytics anywhere.

## 14. Error handling conventions

Services return `{ error: 'snake_case_code', status }`, and routes map that to `res.status(status).json({ error })`. Notifications are best-effort and never fail the triggering action. The mobile app translates error codes through `api_error_message.dart` in en/sw.

---

## 15. Requirement vs existing

| Requirement | Existing | Gap | Reuse / Change |
|---|---|---|---|
| Owner sees only their members | `member-management-service` scoping plus `requireGymAcl('members')`, re-checked in the service | Loose "owns" rule (S4); payment leak (S1) | **Reuse** the scoping. Add a `communications` staff scope. Decide D1. |
| Member segmentation (status, expiry, plan) | Status and daysLeft are calculated per row in JS, one member at a time (N+1, whole-table loads) | No reusable filter model, no count preview, doesn't scale | **New** SQL-backed `segment-service`, matching the list's status rules. Share the status helper so the list and segments never disagree. |
| Engagement segments (last check-in, visits, inactive N days) | `Checkin` indexes; engagement bands | Not queryable as a filter | **New**, in the segment service, reusing the band thresholds |
| Demographics (age, gender, location) | `memberProfile.dateOfBirth/gender` (optional) | **No member location**; sparse data | Age and gender from jsonb. **Location: not supported.** Offer "home gym" instead, or defer. |
| Campaigns (draft→schedule→send) | — | Everything | **New** `CommunicationCampaign` |
| Per-recipient delivery ledger | `Notification` row (inbox only); push counts discarded | No channel status, providerMessageId, failure reason or retry | **New** `CommunicationMessage`. Keep `Notification` as the inbox and link via `notificationId`. |
| In-app inbox | `Notification` + `/me/notifications` API | No member inbox UI; no category, deep link or click tracking; owner bell is a stub | **Reuse** the table and API. Add nullable `category/gymId/campaignId/clickedAt` columns. **New** Flutter inbox screen. |
| Push (FCM) | Server multicast plus Android token registration | Off by default; no tap or deep-link handling; no delivery record; iOS/web absent | **Reuse** the server side. Add open/tap handlers in `PushService`. Record per-message results. |
| WhatsApp | Two integrations, neither working (§8) | Provider contract unverified; phone bug; no ledger, status webhook, opt-out or approved templates | **Change:** a new `WhatsAppProvider` abstraction (sendTemplate/sendMessage/getDeliveryStatus/validateRecipient). Pick one adapter (D2). Fix the phone field. |
| Templates (FitFlex vs WhatsApp-approved) | Hardcoded strings; hardcoded AT template ids | No template store; no en/sw variants; no approval registry | **New** `CommunicationTemplate` (system + gym). Separate `WhatsAppTemplate` registry with approval status. |
| Preferences (transactional vs marketing) | None | Everything | **New** `CommunicationPreference`. Transactional can't be switched off in-app; WhatsApp marketing is opt-in. |
| Automations (activation, T‑7/3/1, expired, payment failed, inactive 14d) | `renewalNotifier` (T‑3/1/0, not idempotent); activation hook | No expiry event, rejection hook, dedupe or execution history | **New** `CommunicationAutomation` plus a unique dedupe key per (automation, member, occurrence). Hook into `decide()`. Retire the platform renewal notifier for `direct_sub` (D5). |
| Scheduled campaigns | bfast cron | No queue or lock | **New** 5-minute dispatcher cron over the ledger, using `FOR UPDATE SKIP LOCKED` batches |
| Communication history (member timeline, campaign history) | Member detail page | — | **New** endpoint plus a timeline section on the owner member detail screen |
| Analytics (delivery / engagement / conversion) | None for messaging | — | **New**, from ledger timestamps. Conversion = approved `PaymentRequest` for a `direct_sub` at the gym within the attribution window after a click. |
| Idempotency and duplicate-send protection | None | — | **New:** client `idempotencyKey` on send, unique constraints, campaign state machine |
| Rate limiting and safety | None | — | **New:** per-gym daily cap, large-send confirmation, global kill switch, provider throttle |
| Localization | en/sw maps in the app and portal | Server messages English-only; no member locale | Owner UI strings in `i18n.dart`. Templates carry `en` + `sw` bodies. Store the member locale (sent at token registration or profile save). |
| Staff access | `GYM_STAFF_ACL_SCOPES` | No comms scope | Add a `communications` scope (backend list plus `kGymStaffAclScopes` in mobile) |
| Tests | node:test + memStore; CI Postgres; flutter_test; Playwright; role-smoke | — | **Reuse** all of them. Add a cross-gym spec modelled on `owner-gym-scoping.specs.mjs`. |

---

## 16. Decisions (recorded 26 Sep 2026)

| # | Question | Decision | Effect on the build |
|---|---|---|---|
| **D1** | Who is a gym's member? | **Messaging:** gyms can reach **direct members only** (a `direct_sub` at one of their gyms, in any status). **Tracking:** owners keep seeing both direct and FitFlex members, tagged so they can tell them apart. The aim is to show gyms that FitFlex brings them extra traffic rather than taking their members. | The Members list already tags each row `memberType: direct \| fitflex`; that stays as it is. The segment service's base set for gym campaigns is **direct members only**, enforced server-side. FitFlex members can't be picked, even in a custom segment. FitFlex members are reached only through **platform (admin) campaigns** (see D5/D6). |
| **D2** | WhatsApp route and number | There's **no WhatsApp Business account yet.** Build in-app (and push) now, and prepare WhatsApp without sending live. | Build the `WhatsAppProvider` interface, a `FakeWhatsAppProvider` and a "not configured" provider (the default). Templates get a WhatsApp mapping field, and channel pickers show WhatsApp as "not available yet". No real adapter is written until the account and provider are confirmed. |
| **D3** | Consent defaults | Accepted: WhatsApp marketing stays off until the member opts in, and transactional in-app messages can't be switched off. It must be **plug and play** once the WhatsApp account is confirmed. | Preferences and consent capture (timestamp and source) ship in M1/M5, so opt-ins already exist when WhatsApp switches on. Going live is then configuration only: `WHATSAPP_PROVIDER`, credentials, and approved template ids in the registry. |
| **D4** | Duplicate renewal reminders | Gym reminders **take over** from platform reminders. | For a `direct_sub`, the platform `renewalNotifier` skips any member whose gym has an enabled expiry automation. If the gym has none, the platform reminder still goes out, so nobody goes without a reminder. |
| **D5** | Where the Communication Center lives | **Both** the Flutter owner app **and the portal**, controlled by role and permission. | **Owner/staff Communication Center:** in the Flutter owner app, and on the portal's operator side (`/owner/communications`, beside Dashboard · Scan · Check-ins · Manage gym). Owners always have access; staff need the new `communications` gym ACL scope. **Admin platform communications:** `/admin/communications`, behind a new `communications` admin ACL scope (the portal nav already supports `aclScope`). It covers platform campaigns, WhatsApp status, the template registry, the kill switch and per-gym caps. Both portal areas and the app call the **same backend services**. |
| **D6** | Location segment | Keep location in scope **for admin (platform) campaigns**. | **Fact:** "nearest gyms" uses the phone's GPS **on the device only**. It sorts the list in the app, and the position is **never sent to or stored on the server**. The server knows only gym locations (`Gym.location` text + `coordinates`). **Recommended source for v1:** a member's area is the location of their **home gym**, or their most-visited gym in the last 90 days. That needs no new personal-data collection. **Optional later:** an area (region/district) the member picks in their profile. **Not recommended:** storing device GPS for marketing. Gym campaigns don't get a location filter, since direct members are all local to the gym. |

### New scope from these decisions

- **Platform campaigns (admin).** FitFlex admins can target all FitFlex members, including pass holders, by status, pass tier, engagement, demographics and location.
  - Same campaign engine, ledger, templates and analytics as gym campaigns, with `gymId = null` and `ownerType = platform`.
  - Consent rules are the same.
  - This gives FitFlex members a single sender for marketing: FitFlex, not a gym they visited once.

### Defaults I'll use unless you say otherwise

- Attribution: last touch, 7 days after a click, falling back to 3 days after an open.
- Inactive: no check-in at this gym for 14 days.
- Day boundaries in EAT.
- Marketing cap: 2 marketing messages per member per week, **counted across gym and platform senders together**.
- Large-send confirmation above 200 recipients.
- A gym's default automations are created **disabled**, so the owner reviews and turns them on. The platform reminder covers members until then (D4).
