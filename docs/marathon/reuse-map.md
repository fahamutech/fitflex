# Marathon & Running Events module — reuse map and gap report (Phase 0)

**Date:** 2026-10-22
**Source PRD:** [PRD-v1.0-2026-10-21.md](PRD-v1.0-2026-10-21.md) (§16 Phase 0)
**Inspected:** `fitflex-functions` @ `94d42c0`, `fitflex-portal` @ `df93cd3`, `fitflexmobile` @ `c2e94d8` — all the `release-candidate` heads on 2026-10-22, read in detached worktrees. No application code or migration was changed.
**Method:** targeted inspection of routers, auth, stores, migrations, payments, activities, challenges, B2B, notifications, QR, portal and mobile component libraries, i18n and tests. Anything not listed as inspected should be treated as uninspected.

Paths are relative to each repo root.

---

## 0. Headline findings

1. **Nothing event-shaped exists.** No event, race, ticket, bib, registration or result table, route or screen in any repo. The only trace is the shop product category `events` ("Events & tickets", `src/shared/product-categories.mjs:2-11`), which sells ordinary stock-counted shop products. The module is greenfield at the domain level but can sit on a lot of existing plumbing.
2. **No automatic payment exists for anything except passes.** Tunzaa (Malipo) is the only provider with a server-initiated charge and a signed callback, and it is wired only for FitFlex Pass, upgrades and gym plans (`src/services/mobile-money-service.mjs` `PAYABLE`). Shop orders and trainer sessions are confirmed by an admin by hand (Lipa Namba + transaction ID). Selcom is a token-gated webhook stub with no outbound client and no signature verification. The PRD's payment gate is a build item, not a verification step.
3. **Conventions differ from the PRD's proposals in four places** and the PRD says to follow the repo: money is whole shillings in integer `*Tzs` columns, not minor units; errors are `{ error: '<snake_code>', ...extra }`, not `{ error: { code, message } }`; there is no `/api/v1` prefix (routes are `/me/...`, `/admin/...`, `/vendor/...`); pagination is an offset "cursor" in most places with keyset cursors only in the newest stores.
4. **Three infrastructure pieces the PRD needs do not exist at all:** a transactional outbox / outbound webhook delivery, third-party API-key authentication, and a shared rate-limit middleware. These are the largest pure-infrastructure gaps.
5. **The portal is a static export** (`output: 'export'`, no middleware, no dynamic `[id]` routes). Detail pages use query parameters (`/admin/kyc?case=<id>`). All route guarding is client-side in `src/components/Shell.tsx`; the backend is the real authority.
6. **GPS run recording is Android-only** (`GeolocatorGpsSource.isSupported`). iOS has no run recorder today. "Start Run" for events inherits that.
7. **An organizer is a new kind of partner.** The closest existing shapes are vendor (`vendor` / `vendor_staff` user types, `Vendor` + `OrgMembership`, partner KYC case) and B2B organization. Adding an organizer role touches `src/auth/*` (CLAUDE.md rule 6 — must be called out in the PR).

---

## 1. Current capability by area (with evidence)

### 1.1 Backend (`fitflex-functions`)

| Area | What exists | Key files |
|---|---|---|
| Route registration | No central router. Any `functions/*.mjs` export shaped `{ method, path, onGuard?, onRequest }` is mounted by bfast. Guards must be wrapped in `routeGuard(method, guards)` because bfast mounts guards with `app.use(path)` (method-blind, prefix-matched). 679 routes. | `functions/index.mjs:1-13`, `src/shared/route-guard.mjs` |
| Composition root | All services built once; later-defined deps passed as lazy closures | `src/bootstrap/services.mjs` |
| Service shape | `createXService({deps})` returning `{ error, status, ...extra }` or data; business errors never throw | e.g. `src/services/refund-service.mjs` |
| DB layer (legacy) | `collection(name)` API; `filterAsync` loads whole table; new tables need `TABLE_MAP` + `ALLOWED_FIELDS` entries (unknown fields silently dropped) | `src/infra/knex-store.mjs:35,633`, `src/bootstrap/collections.mjs` |
| DB layer (newer) | Per-domain Postgres stores using Knex transactions, `forUpdate()`, conditional UPDATE, map 23505/23514 to results; advisory locks for cross-server serialisation | `src/infra/shop-order-store-pg.mjs:11-12,127-160`, `vendor-sale-store-pg.mjs`, `vendor-customer-store-pg.mjs` |
| IDs | No shared helper; newest stores use `` `${prefix}_${randomUUID().replace(/-/g,'').slice(0,16)}` `` | `vendor-sale-store-pg.mjs:44` |
| Migrations | `YYYYMMDDHHMMSS-kebab.cjs` in `db/migrations/`, 114 files, raw-SQL CHECKs and partial unique indexes named `<table>_<rule>`, `stamps(t)` helper, composite FKs on `(id, vendorId)` for tenancy, each with `down`. **Latest timestamp is `20270104090000` (ahead of wall-clock); new ones must sort after it.** | `20270101090000-vendor-customers.cjs:12-13,67-83`, `20261010090000-partner-kyc.cjs:76-80` |
| Feature flags | `on(name)`; off unless set; disabled route returns `404 feature_disabled`; umbrella flags (`VENDOR_TOOLS`) | `src/shared/feature-flags.mjs` |
| Error shape | `res.status(s).json({ error: code, ...extra })` | `functions/refunds.mjs:10-16` |
| Pagination | Offset cursor `{items,total,nextCursor}` (limit 20, max 100); keyset base64url `[createdAt,id]` in newest stores | `src/shared/pagination.mjs`, `vendor-sale-store-pg.mjs:377-459` |
| Tests | `specs/<feature>.specs.mjs`, `node:test`; `npm test` sets `FITFLEX_USE_CI_DB=1` → `DATABASE_URL_CI`; specs call route objects directly with fake req/res after running `onGuard`; JWTs via `sign()` | `package.json`, `specs/vendor-customers.specs.mjs:1-70`, `src/auth/jwt.mjs` |
| Auth | Firebase ID token → FitFlex HS256 JWT (7 days); `requireAuth(...userTypes)`, `requireAcl(scope)` for portal staff, `requireGymAcl`, `optionalSessionClaims`, `signPurpose/verifyPurpose` | `src/auth/firebase.mjs`, `src/auth/jwt.mjs`, `functions/auth.mjs:63-81` |
| User types | `member, trainer, gym_operator, gym_staff, vendor, vendor_staff, corporate_hr, admin`; portal scopes in `PORTAL_ACL_SCOPES` (kept honest by `specs/portal-acl-scopes.specs.mjs`) | `src/services/portal-user-service.mjs:8-25` |
| Tenancy | `requireGymAccess`, `OrgMembership(orgType gym|vendor)`, `orgAuthzMode()` off/shadow/enforce; services return `not_your_*` 403s | `src/auth/org-authz.mjs`, `20261105090000-org-membership.cjs` |
| Audit | `AuditLog(id, at, actor, action, target, before, after)`; inline inserts, no service; some domains keep own event tables (`PartnerKycEvent`, `ModerationEvent`) | `20260805120000_init_schema.cjs:258-270` |
| Partner onboarding / KYC | `PartnerKycCase` (types `gym_owner|trainer|vendor|corporate`; statuses `draft, submitted, in_review, info_requested, approved, rejected, suspended`), `PartnerPerson`, `PartnerDocument` (Zebra private storage), `PartnerCheck`, `PartnerSettlementAccount` (bank/mobile money), `PartnerAgreement`, `PartnerKycEvent`; `/me/kyc/*` and `/admin/kyc/*`; `partner-gate.mjs` enforcement; payout eligibility | `20261010090000-partner-kyc.cjs`, `src/services/partner-kyc-service.mjs`, `functions/partner-kyc.mjs:15,69-273`, `src/shared/partner-gate.mjs` |
| Vendor approval | vendor starts `pending_approval`; `/admin/role-approvals`, `/admin/vendors` | `auth-service.mjs:36-40`, `functions/admin-approvals.mjs`, `functions/shop.mjs:278-285` |
| Payments – request | `PaymentRequest(memberId, subscriptionId|bookingGroupId|orderId, amountTzs, currency, status pending/approved/rejected, provider, reference, memberReference, payerPhone, verifiedBy/At, decidedAt/By)`; product type derived from FKs, not stored; partial unique on approved `reference` | `init_schema.cjs:92-109`, `src/shared/payment-product.mjs`, `20261224123000-order-payment-reference-unique.cjs` |
| Payments – manual | `/admin/payment-requests[/:id/decision|verify|change-request]`; `MONEY_SECOND_APPROVER` maker-checker; `MANUAL_PAY_INSTRUCTIONS` Lipa Namba + member-typed transaction ID | `src/services/admin-payment-service.mjs`, `functions/admin-payments.mjs`, `src/shared/manual-payment.mjs`, `infra/payment-reference-store.mjs` |
| Payments – Tunzaa | token, initiate USSD push, check-status, `verifySignature` (HMAC-SHA256 sorted-key JSON, constant-time); callback is a trigger only — service re-reads status then calls `adminPaymentService.decide`; in-memory rate limits; flags `TUNZAA_PAYMENTS`, `TUNZAA_SANDBOX_SETTLES`; **Pass/upgrade/gym plans only; no lost-callback sweep; no refunds/payouts** | `src/integrations/payments/tunzaa.mjs:69-80`, `src/services/mobile-money-service.mjs`, `functions/mobile-money.mjs`, `functions/webhooks.mjs:40-53`, `PAYMENTS_TUNZAA.md` |
| Payments – Selcom | `POST /webhooks/selcom` behind shared `SELCOM_WEBHOOK_SECRET`; subscriptions only; `WebhookSeen` replay guard; no client, no signature (OI-004) | `functions/webhooks.mjs:9-38`, `src/services/webhook-service.mjs`, `README.md:81` |
| Refunds | `Refund(kind subscription|trainer_booking|shop_order; status requested|approved|paid|rejected)`; payout = manual "mark paid" with reference | `20261112090000-refunds-cancellations.cjs`, `src/services/refund-service.mjs`, `functions/refunds.mjs` |
| Settlement | Gym engine (monthly, `SETTLEMENT_MODE`); trainer and vendor weekly statements on shared `partner-statement-workflow.mjs` (draft → submitted → approved → payable → paid / voided; maker-checker; holds). Payouts recorded by hand. | `src/shared/settlement-engine.mjs`, `src/services/partner-statement-workflow.mjs`, `functions/*-settlements.mjs` |
| Money | Integer whole TZS in `*Tzs` columns, `currency = 'TZS'`; display via `formatTsh` ("TSh") | `src/shared/money-display.mjs` |
| Shop orders | Lifecycle rules in `order-lifecycle.mjs`; per-vendor fulfilments JSON; separate payment status `pending|paid|failed|cancelled|refund_pending|refunded`; lines as JSON in `ShopOrder.items` | `src/shared/order-lifecycle.mjs`, `docs/marketplace-order-state-machine.md` |
| Stock holds | `ShopOrder.stockState reserved|released`, `reservationExpiresAt`, `reservationCycle`; `ShopStockMovement` append-only ledger; `Product.stock >= 0` CHECK; `shopReservationExpiry` job every 10 min (default TTL 48 h); reserve + order + PaymentRequest in one transaction | `20261224103000-shop-order-integrity.cjs`, `shop-order-store-pg.mjs` |
| Idempotency | `Idempotency-Key` header on `POST /me/shop-orders` (8–100 chars, body fingerprint, partial unique `(buyerId, idempotencyKey)`, replay returns original, mismatch 409 `idempotency_key_reused`); vendor writes use body `clientRef` (409 `client_ref_reused`); `WebhookSeen`; `SmsLog.dedupeKey`; notification `id`; `Activity (userId, devicePlatform, externalId)` unique. **Run upload has no idempotency key.** | `functions/shop.mjs:355-363`, `shop-order-store-pg.mjs:67-74` |
| Conditional update | `updateIf` compare-and-set helper | `src/shared/conditional-update.mjs` |
| Activities | `Activity(type, source device|fitflex|manual|trainer|gym, devicePlatform, externalId, movingSeconds, elevationGainM, splits, hasRoute, shareWith)`; `ActivityRoute(id=activity.id, userId, segments jsonb [lat,lng,alt,tMs,acc])`, member-only reader | `20260924100000-activity-goals.cjs`, `20260930090000-recorded-runs.cjs`, `src/services/activity-service.mjs:7-13` |
| Run validation | drops points >30 m accuracy or >12 m/s; `recordRun` enforces type running, ≤30k points, ≤7 days old, ≥50 m & ≥60 s, ≤300 km, avg ≤25 km/h; source set to `fitflex` | `src/shared/run-metrics.mjs`, `activity-service.mjs:244-305` |
| Sharing | `shareWith {followers, groups[], company}`; `Follow`, `Block`, `SocialGroup` (owner member/trainer/gym/company), kudos/comments/views/reports; owner decision 2026-10-19: sharing on by default | `20261001090000-social-sharing.cjs` |
| Challenges | `Challenge`, `ChallengeParticipant`, `ChallengeTeam`, `ChallengeReward`; types `steps|distance_km|workouts|active_minutes|consistency|gym_attendance`; creators fitflex/trainer/gym/corporate/organization/partner; modes individual/teams/gym_vs_gym/department; opt-in leaderboards; progress computed, not stored; reward statuses pending→approved→issued/rejected; `REWARD_TYPES` include `points`, `badge` as **labels only** | `src/services/challenge-service.mjs:37-55`, `challenge-reward-service.mjs`, `functions/challenges.mjs` |
| Achievements / points / badges tables | **Absent.** Unused `CreditsWallet`/`CreditsTransaction` exist from init schema (forfeiture blocked, OI-009) | `src/shared/credits.mjs` |
| B2B | `B2BOrganization`, `B2BOrganizationUser` (owner/admin/manager/hr/finance/analyst/viewer), `B2BBeneficiary`, programmes, benefits, consumption, billing; legacy `CorporateAccount/Employee/Bill` | `20261101090000-b2b-foundation.cjs`, `src/shared/b2b.mjs:47-79` |
| Roster CSV import | hand-rolled CSV parse with header aliases, ≤2000 rows, `dryRun`, idempotent re-import, non-members become `B2BBeneficiaryInvite` with email/SMS invite + matching job | `src/services/b2b-beneficiary-import-service.mjs:75`, `functions/b2b.mjs:935` |
| Notifications | `notify(userId, {id?, type, title, body, data})` writes in-app row, best-effort FCM push (`PUSH_NOTIFICATIONS=on`), optional WhatsApp; caller-chosen `id` makes it idempotent; SMS via Beem (`SMS_PROVIDER`), email via Mailgun; campaign engine with dispatcher | `src/services/notification-service.mjs:80-137`, `src/integrations/sms/*`, `src/infra/verification-senders.mjs:43-61` |
| Server EN/SW | No framework; inline `{en, sw}` objects or catalogue entries; locale from `CommunicationPreference.locale`, `?lang=`, or `Accept-Language`; push carries `titleSw/bodySw` | `src/shared/communication-templates.mjs:18-25`, `partner-notifier.mjs:193-280` |
| Deep links | Fixed list `DEEP_LINKS` for campaigns; event notifications put IDs in `data`; no URL scheme | `src/shared/communications.mjs:123` |
| QR | Member token `userId.bucket.sig` (HMAC-SHA256, 16 chars, 60 s buckets, current+previous accepted, `QR_HMAC_SECRET`); static entrance QR; **no single-use nonce — replayable ~2 min**; duplicates stopped by one-visit-per-member-gym-day partial unique index; **no offline check-in** | `src/auth/qr-token.mjs`, `20261114090000-checkin-one-visit-per-day.cjs`, `functions/checkins.mjs` |
| Jobs | bfast cron exports; `JobRun`, advisory locks, missed-run catch-up with backoff, pause, `OpsException` | `functions/jobs.mjs`, `src/services/ops-service.mjs` |
| Outbox / outbound webhooks / third-party API keys | **Absent.** `CommunicationMessage` is a message queue only | — |
| Rate limiting | No middleware; in-memory `createVendorLimiter`/`limitOrNull` → 429 `rate_limited {retryAfterSeconds}`; ad-hoc maps in mobile-money; `AuthAttempt` table for PIN | `src/shared/vendor-rate-limit.mjs` |
| HMAC | No shared utility; separate copies in `qr-token.mjs`, `promotion-token.mjs`, `tunzaa.mjs`, `identifier-service.mjs:56`, `pin-auth-service.mjs:56` | — |

### 1.2 Portal (`fitflex-portal`)

| Area | What exists | Key files |
|---|---|---|
| Stack | Next 15.5.15, React 19, Tailwind v4, TypeScript, lucide, recharts, jsqr, leaflet. Radix listed but unused. **Static export** (`output:'export'`, `trailingSlash`), Firebase Hosting rewrites all to `/index.html` | `package.json`, `next.config.mjs`, `firebase.json` |
| Layout / areas | One `app/layout.tsx` → `Providers` + `Shell`. Areas are plain folders: `app/admin/*`, `app/owner/*` (+ `dashboard`, `scan`, `checkins`), `app/hr/*`, `app/org/*`, `app/vendor/*`. No route groups, no nested layouts, no middleware, no `[id]` routes | `app/providers.tsx`, `src/components/Shell.tsx` |
| Nav / sections | `ADMIN_NAV` (155-200), `OPERATOR_NAV`, `HR_NAV`, `orgNav()`, `vendorNav()`; `NavItem {href, labelKey, icon, groupKey?, aclScope?, aclAny?, count?}`; groups platform/promotion/finance/operations/system; vendor areas via `VENDOR_AREAS` + `vendorAreaOpen()` (permission + server tool flag, fail closed); flag gates like `useShopBannersAvailable` | `Shell.tsx`, `src/lib/vendor.ts:158-182`, `src/components/shop-banners-gate.tsx`, `src/lib/flags.ts` |
| Guards | `Shell.tsx` `redirectTo` (466-499) only: vendors confined to `/vendor`, org to `/org`, HR to `/hr`, non-admins off `/admin`, staff without scope redirected | `Shell.tsx:466-499` |
| Roles/scopes client-side | `useApp()` → `user.userType`, `portalUser`, `aclPermissions`, `organizationUser`, `organizationRoles`; `hasPermission(scope)`; full scope list `ALL_ACL_SCOPES` (**must add new scope here and in `ADMIN_NAV`**); vendor perms from `useVendor()` (`/vendor/me`) | `app/providers.tsx`, `app/admin/users/page.tsx:13-48`, `src/components/vendor-context.tsx` |
| Auth | Firebase web (Google via GIS, email/password with `fitflex-pin:` retry), `api.portalSession(idToken)` tries admin → gym_operator → gym_staff → vendor → vendor_staff → B2B; backend JWT in `localStorage` | `src/lib/firebase.ts`, `src/lib/api.ts:286-318`, `app/login/page.tsx` |
| API client | `request<T>(path, opts, token)`; headers `x-fitflex-client: identity-v2`, Bearer; `ApiError(status, body)`; 401 → sign-out; `qs()`, `userContact()`, `api.uploadFile()`; one big `api` object, some per-feature modules | `src/lib/api.ts`, `src/lib/shop-banners.ts`, `src/lib/vendor-documents.ts` |
| i18n | `src/lib/i18n.ts` (6,755 lines) `messages = {en, sw}`, flat dotted keys, `t(locale,key)` with en fallback, `{name}` via `fmt()`; **vendor/Shell/promotions/payments use `t()`; most admin, B2B, HR, org pages are hard-coded English** | `src/lib/i18n.ts:6,3376`, `src/lib/vendor.ts:10` |
| Money/dates | `money(v,'TZS')` → "TSh 279,000"; EAT helpers `eatDateTime/eatDay/dayMonth/eatToday/addDays` (`Africa/Dar_es_Salaam`); `datetime-input.tsx` | `src/lib/admin-utils.ts`, `src/lib/vendor.ts:89-118` |
| Tokens | `app/globals.css` `@theme` 18-165: brand green ramp (600 primary), gray, error/warning/success/info, accent gold, `--color-volt`, `--color-fuel*`, `--color-calm-*`, fg/bg/border aliases, radius, shadow, Inter | `app/globals.css`, `docs/design-system.md` |
| Primitives | `shared.tsx`: Button(loading), Card*, MetricCard, Badge (default/success/danger/warning/brand/gray), Field/Input/Select/Textarea/Checkbox/Radio, Table*, EmptyState, ErrorState, Skeleton*, Spinner, PageHeader, Alert, Avatar, Segmented, Stat, Toast; `dialog.tsx` (Dialog, ConfirmDialog, custom not Radix); `data-table.tsx` (sort/filter/paginate, custom); `stepper.tsx`, `searchable-select.tsx`, `location-picker.tsx`, `area-picker.tsx`, `image-upload.tsx` (WebP compress → `api.uploadFile`) | `src/components/*` |
| Status mapping | per-area `statusTone/statusLabel`, `CASE_STATUS`, `STATEMENT_STATUS`, `STATUS_TONE/STATUS_KEY` | `admin-utils.ts`, `src/lib/kyc.ts`, `settlements.ts`, `moderation.ts` |
| CSV import | `PeopleImport` (dry run → apply); exercise import dialog with preview + `saveCsv()` export | `src/components/b2b-people-import.tsx`, `exercise-manager.tsx` |
| Forms | controlled `useState`; no react-hook-form/zod | — |
| QR scanner | inline only in `app/scan/page.tsx` (getUserMedia + rAF canvas + jsQR + manual token fallback + refusal-code → i18n map); **not a reusable component** | `app/scan/page.tsx` |
| Tests | Playwright, Chromium, 1 worker; `webServer` starts backend from sibling `../fitflex-functions` (`bfast fs serve`) + `next dev -p 3001`; 63 specs; most inject session via `addInitScript` (`localStorage` token/user/locale) and mock with `page.route`; fixtures `helpers/b2b-mock.ts`, `promotion-mock.ts`, `hero-mock.ts`; CI runs `tsc --noEmit` + build only (no e2e, no backend); `npm run lint` has no ESLint config | `playwright.config.ts`, `tests/e2e/*`, `.github/workflows/portal-checks.yml` |
| Reusable pages | KYC queue/case (`/admin/kyc?case=`), approvals (`DataTable` + `ConfirmDialog`, `money-approval.ts` second approver), B2B People/Programmes, gym bulk invites, settlements/statements/partner payouts, moderation entity (`allowedActions`), exercise import/export, challenge manager, vendor S1–S5 (products, POS, customers, documents + share menu) | see §3 |

### 1.3 Mobile (`fitflexmobile`)

| Area | What exists | Key files |
|---|---|---|
| Layout | `lib/screens/{member,owner,trainer,vendor,partner}/`, `lib/shared/{components,widgets,activity,inbox,hero_images}`, `api_client.dart`, `models.dart`, `i18n.dart`; `AppScope` InheritedWidget DI (`api`, `auth`, activity repos, `runRecorder`, `inbox`) | `lib/app_scope.dart` |
| Router | single `lib/router.dart`: `AppRoutes` constants (73-193), `buildRouter()` (439), one global `redirect` (auth/onboarding/pending/personas), id regexes (`_safeId`) | `lib/router.dart` |
| Member nav | `ShellRoute` → `MemberShell`; 5 hard-coded tabs Home/Activity/Gyms/Shop/Profile (`_tabIndex` 197, `_onTab` 673, destinations 835, `isRootTab` 779); Activity tab has `FFSegmented` Overview/Workouts/Challenges/Progress | `member_shell.dart`, `member_activity_tab.dart:147` |
| Owner nav | `_kOwnerTabs` list of `_OwnerTabDef` with optional ACL `scope`; `kGymStaffAclScopes`; `OwnerData.canAccess` | `owner_shell.dart:19,116-155` |
| Trainer / vendor nav | `IndexedStack` + `?open=` sections; vendor destinations conditional on server tool flags + permissions; vendor sub-pages top-level routes | `trainer_home_page.dart:84,327-377`, `vendor_home_page.dart:270-300,985-1045`, `router.dart:216-241,531-545,744-906` |
| Deep links | Android App Link only for `/friend-invite/`; tokens kept on device (`PendingFriendInvite`, `PendingOrgInvite`), not in URL; no iOS schemes | `AndroidManifest.xml:51-56`, `lib/shared/pending_org_invite.dart`, `kept_link_token.dart`, `router.dart:464-495` |
| ApiClient | 3,255 lines; `_request(method, path, body:, extraHeaders:)`; 12 s timeout; 2 retries on reset/DNS only; `x-fitflex-client`, Bearer; `ApiException(status, body).code = body['error'] ?? body['failure']`; 401 → sign-out; `createShopOrder(idempotencyKey:)` sends `Idempotency-Key` | `lib/shared/api_client.dart:1882-1907` |
| Error display | `errorMessage(locale, e)` maps codes via `_knownReason` → `error.reason.*`, 409 → `error.conflict`; per-feature maps (`shopCheckoutErrorKey`, `runSaveFailureKey`) | `lib/shared/api_error_message.dart`, `shop_checkout.dart`, `run_recorder.dart:15-40` |
| API_BASE / flags | `--dart-define=API_BASE` → `.env` → `kLiveApiBase`; dart-define flags with `debug*Override` for tests (`PHOTO_HERO_UI`, `SHOP_HOME_V2`, `SHOP_EVENTS`…); server-side via option endpoints (`/payments/options`, `/vendor/tools/options`, `/auth/options`) and 404/`feature_disabled` probes; **no general remote-config** | `lib/shared/photo_hero_flag.dart`, `shop_home.dart`, `stock_options.dart:117-137` |
| Tokens | `FFTokens` (brand ramp, semantic, spacing, radius, icon, motion, hero scrim, role colours); V2 accents Volt `0xFFC8F04A` (member dark primary), Fuel `0xFFB8452C` ("act soon"), Calm; fixed `qrInk/qrBackground`; `buildDarkTheme()` 363, `buildTheme()` 713 | `lib/shared/design_tokens.dart:180-193`, `docs/design-system.md` |
| Components | `FFButton` (primary/secondary/ghost/destructive/onPhoto; sm/md/lg; loading), `FFCard*`, `FFActionTile`, `FFStatTile`, `FFMetricCard`, `FFFeaturedStrip`, `FFRowGrid`, `FFFilterChip`, `FFSegmented`, `FFChoiceTile`, `FFPill`, `FFBadge` (default/gray/brand/success/danger/warning/fuel/onPhoto), `FFEmptyState`, `FFErrorState`, `FFSkeleton*`, `FFSpinner`, `FFAlert`, `FFSnack`, `showFFConfirmDialog`, `FFSheet`/`showFFSheet`, `FFTextField`, `FFDropdownField`, photo picker fields, `FFSectionTitle`, `FFPageHeader` | `lib/shared/components/*` |
| Photo hero | `FFHeroPhoto` enum of bundled webp + `FFHeroNetworkImage`; `FFPhotoHero` (full/compact/panel/band), `FFHeroBand`, `FFOnPhotoTheme`; remote slots in `hero_images/hero_slots.dart` (`HERO_IMAGES_REMOTE`); flags currently OFF | `ff_photo_hero.dart:1434`, `hero_slots.dart` |
| i18n | custom single file `lib/shared/i18n.dart`: `en` 70-5296, `sw` 5297-10590; `context.tr('key')`; sw→en→key fallback; parity tests via `FFLocale.keysOf`; **Swahili glossary file not in this repo** (referenced by `TODO(sw-review)` comments) | `lib/shared/i18n.dart:10608`, `test/photo_hero_test.dart:738` |
| Run recorder | `RunRecorder` ChangeNotifier: `RunState idle/recording/paused/finished`; start/pause/resume/finish/save/discard; metrics in `run_metrics.dart`; `GpsSource` interface (`GpsAccess granted/denied/deniedForever/serviceOff`); `GeolocatorGpsSource` **Android-only**, foreground service + wake lock + ongoing notification, while-in-use permission; persisted every 10 points under `run_in_progress_v1`, `restore()` → paused with `restored` flag; `_AccessAlert` links to settings; `api.recordRun` → `POST /me/activities/runs {type:'running', segments, notes?, shareWith?}` | `lib/shared/activity/run_recorder.dart`, `gps_source.dart`, `providers/geolocator_gps_source.dart`, `member_record_run_page.dart:343`, `main.dart:144` |
| Activity model | `ActivityType` (15), `ActivitySource device/fitflex/manual/trainer/gym`, `DataOrigin`, `DevicePlatform`, `externalId`, run fields, `shareWith`; `RunMap` (flutter_map), `RunSummaryGrid`, `RunSplits` | `lib/shared/activity/activity.dart`, `widgets/run_widgets.dart` |
| Commerce | Shop: `ShopCart`, `_checkout()`, `_CheckoutSheet`; `CheckoutAttempt`/`newCheckoutKey`/`checkoutSignature`, `orderOutcomeUnknown`, `ShopOrderPayment`; Passes: `requestPass`/`subscribeDirect`/`upgradePass`, `_UpgradeGate`; **payment flow = create PaymentRequest → if manual off, `offerMobileMoney(paymentRequestId)` → refresh** | `shop_browse_page.dart:163,770,2138`, `shop_checkout.dart`, `member_passes_page.dart:290-400` |
| Manual payment UI | `PaymentModes`/`ManualPayment` from `GET /payments/options` (Lipa Namba, EN/SW instructions); `ManualPaymentSteps`, `ManualPaymentFields`, `TransactionIdField`; validators; `MomoStage`, `offerMobileMoney` (Tunzaa) | `lib/shared/manual_payment.dart:78`, `widgets/mobile_money_pay.dart:331` |
| Payment status | `PaymentRequest.productType` enum (FITFLEX_PASS, GYM_SUBSCRIPTION, TRAINER_SERVICE, TRAINER_GYM_PASS, SHOP_ORDER) — **event type needs new case** in `payment_labels.dart`; `MemberData.pendingPayments`; `PassState` | `models.dart:621`, `payment_labels.dart`, `member_shell.dart:125-153` |
| Provider SDK | **None.** All payment server-driven | `pubspec.yaml` |
| QR | `qr_flutter` display via `FFQrCode` (dark on white); `MemberQrTab` 30 s token refresh; `mobile_scanner` in `owner_qr_scanner_page.dart` (verify → check-in, camera-error fallback) and `member_scan_gym_page.dart`; **vendor POS has no camera scan** (USB/Enter only) | `ff_qr_code.dart`, `member_qr_tab.dart`, `owner_qr_scanner_page.dart`, `pos_page.dart:1011` |
| Challenges / rewards | `Challenge`, `ChallengeStanding`, `LeaderboardEntry`, `TeamStanding`; `RewardRule finishers/top/team`, `RewardStatus pending/approved/issued/rejected`, `rewardTypes` incl. `badge`, `certificate`; `EarnedReward` from `GET /me/rewards`; member challenge page + leaderboard + rewards widgets; creator `challenge_manager_page.dart`; client-only milestones; **no medal/achievement model or screen** | `lib/shared/activity/challenge.dart`, `challenge_reward.dart`, `progress_engine.dart:203-260` |
| Groups / community | `GroupPage`, `GroupManagerPage`, community Feed/Explore/People/Groups | `member_group_page.dart`, `member_community_page.dart` |
| B2B | member side only (`/member/benefits`, `GET /b2b/me/benefits`); **no corporate admin surface in mobile** | `member_benefits_page.dart` |
| Notifications | FCM Android-only (`push_service.dart`, `POST /me/device-tokens`); `_openFromPush`/`_onForegroundPush`; inbox (`/inbox`, bell); deep-link **allowlists** `memberRouteFor` / `partnerRouteFor` — each event notification type needs a new case | `lib/shared/push_service.dart`, `inbox/inbox_controller.dart:100-151,184-296`, `main.dart:214` |
| Tests | 142 entries; `pumpFF()` widget harness; `RecordingApi` + `apiTest()`/`pumpPage()` fake at HTTP layer (`api.on('GET /path', json)`, `api.fail`); fake `GpsSource`/`StepStore` in `record_run_test.dart`; flags via `debug*Override`; CI `flutter analyze` + `flutter test` on Flutter 3.44.2 | `test/support/recording_api.dart`, `ff_harness.dart`, `record_run_test.dart`, `.github/workflows/build-flutter.yml:63-67` |

---

## 2. Reusable components and services (what the module extends)

| Marathon need | Reuse | Notes |
|---|---|---|
| Organizer identity & onboarding | Vendor pattern (`vendor`/`vendor_staff` user types, `Vendor` + `OrgMembership`, `pending_approval`, `/admin/role-approvals`) + Partner KYC (`PartnerKycCase` with a new `partnerType = 'event_organizer'`, `PartnerSettlementAccount` for payout details, `PartnerAgreement` for organizer terms) | Adds a user type → touches `src/auth/jwt.mjs`, `auth-service.mjs`, `portalSession` order, mobile/portal persona lists. **Rule 6 callout.** |
| Organizer verification UI | `/admin/kyc` queue + case view (`kyc-case.tsx`, `src/lib/kyc.ts`) | add organizer partner type to labels |
| Event moderation / publish approval | Moderation entity pattern with server `allowedActions` (`moderation-entity.tsx`, `ModerationEvent`) | event lifecycle transitions server-side |
| Event capacity holds | Shop stock-hold design: `stockState`, `reservationExpiresAt`, `reservationCycle`, append-only movement ledger, expiry job, reserve+order+payment in one transaction | copy the design, not the tables (keep race payments isolated from shop orders as PRD §2 requires) |
| Idempotent order creation | `Idempotency-Key` header + body fingerprint + partial unique index pattern | `functions/shop.mjs:355-363`, `shop-order-store-pg.mjs:67-74` |
| Conditional state transitions | `updateIf`, `.forUpdate()`, 23505/23514 mapping | `src/shared/conditional-update.mjs` |
| Payment request & manual confirmation | `PaymentRequest` + `admin-payment-service` + Lipa Namba manual flow + `MONEY_SECOND_APPROVER` | needs `eventOrderId` FK (or generic `productType` column) and a new case in `payment-product.mjs` and mobile `payment_labels.dart` |
| Automatic payment (when chosen) | Tunzaa client + `mobile-money-service` (`PAYABLE` extension) | callback-as-trigger + status re-read is the right safety pattern; missing: lost-callback sweep, refunds via provider |
| Refunds | `Refund` table with new `kind = 'event_order'`; `refund-service` | payout still manual |
| Organizer settlement | `partner-statement-workflow.mjs` (as trainer/vendor weekly statements) + `PartnerSettlementAccount` | fee/commission and schedule are owner decisions (PRD §17.5) |
| Participant roster CSV | `b2b-beneficiary-import-service` parse/dry-run/idempotent pattern; portal `PeopleImport` dry-run → apply; `exercise-manager` preview + `saveCsv` | corporate roster: link `B2BOrganization` + `B2BOrganizationUser` roles as coordinator |
| Corporate identity | `B2BOrganization`, `B2BOrganizationUser` (hr/admin/finance), `B2BBeneficiary`; `org` portal area | do not create a second corporate model |
| QR ticket token | `qr-token.mjs` HMAC pattern, `FFQrCode`, `MemberQrTab` refresh; owner scanner page (`mobile_scanner`) and portal `app/scan` jsQR loop | **ticket tokens must be opaque single-use-per-purpose (kit collection once) — new design, see gaps** |
| Event run | `RunRecorder` + `recordRun` with an added `eventRegistrationId` (or link table `EventActivityLink`) | Android-only GPS; keep `source = fitflex`, never mark official |
| Results / leaderboards | `LeaderboardEntry`, `TeamStanding`, `challenge_leaderboard.dart` | result provenance is new |
| Medals / rewards UI | `EarnedReward`, `RewardStatus`, `challenge_rewards.dart` (badge/certificate types) | ledger + achievement tables are new |
| Teams | `ChallengeTeam` shape, `SocialGroup` for clubs | `EventTeam` new but modelled on these |
| Notifications | `notificationService.notify` with caller `id` for idempotency; `{en, sw}` inline bodies; push `titleSw/bodySw`; Beem SMS; Mailgun email | add deep-link cases in mobile `memberRouteFor`/`partnerRouteFor` |
| Jobs | bfast cron + `ops-service` locks/catch-up | hold expiry, webhook delivery, reconciliation sweeps |
| Rate limiting | `createVendorLimiter`/`limitOrNull` | adequate for launch; in-memory per instance |
| Portal nav / scope | `NavItem` + `aclScope` in `ADMIN_NAV`; new ACL scope `events` in `PORTAL_ACL_SCOPES` + `ALL_ACL_SCOPES`; organizer area modelled on `VENDOR_AREAS` + `useVendor()` context | |
| Portal UI | `DataTable`, `Dialog/ConfirmDialog`, `Stepper` (event wizard), `Field/Input`, `Badge` tones, `EmptyState/ErrorState/Skeleton`, `ImageUpload`, `location-picker.tsx` (venue), `datetime-input.tsx`, `money()`, `eatDateTime` | |
| Mobile UI | member Activity tab `FFSegmented` gets an **Events** section (or a Home entry); `discovery_loader.dart` + gym directory filter pattern for discovery; `FFHeroBand` for event detail; `FFSheet` for category picker; shop `_CheckoutSheet` + `CheckoutAttempt` for checkout; `ManualPaymentFields`/`offerMobileMoney` for payment; `FFQrCode` for ticket; owner scanner for kit collection | |
| Tests | backend `specs/*.specs.mjs` on CI DB; portal `addInitScript` + `page.route` mocks; mobile `RecordingApi`/`pumpPage`, fake `GpsSource` | |

---

## 3. Missing capabilities (gap report)

Ordered by how much they block launch.

| # | Gap | PRD refs | Severity | Notes |
|---|---|---|---|---|
| G1 | **Automatic payment for a new product type.** Tunzaa charges only Pass/upgrade/gym plans; Selcom is a stub; shop pays manually. No provider refunds, no lost-callback sweep. | PAY-003..012, §17.1-3 | Launch gate | Options: (a) extend Tunzaa `PAYABLE` + `mobile-money-service` to event orders behind a flag; (b) launch on labelled manual Lipa Namba confirmation (as shop does, owner decision D-9 2026-10-15); (c) build Selcom properly. Needs owner decision. |
| G2 | **Transactional outbox + outbound webhook delivery** (signing, retries, backoff, dead-letter, delivery log, SSRF-safe URL validation). Nothing exists. | API-003..006, API-012 | P0 new infra | Design once, reusable platform-wide. |
| G3 | **Third-party API credentials** (client id/secret hash, scopes, rotation/revocation, rate limits) and a versioned organizer API namespace. Nothing exists. | API-001, 002, 007-010 | P0 new infra | Propose `/v1/organizer/...` prefix for API-key callers only; JWT routes keep existing style. |
| G4 | **Event domain tables** — all of PRD §7. | §7 | P0 | Greenfield. ~22 tables; split across 5-6 migrations. |
| G5 | **Organizer role/user type** and portal session role. | ORG-001..003 | P0 | Touches `src/auth/*`, `portalSession`, persona lists. |
| G6 | **Single-use / purpose-bound QR tokens.** Current member QR is time-bucket HMAC replayable ~2 min with duplicates only caught by a daily index. Kit collection needs an opaque per-ticket token + one-collection-per-registration constraint + authorized override. | KIT-001..005 | P0 | New `EventTicket.tokenHash` design; no offline scanning exists at all (KIT-005 is P0 but should be a deliberate, flagged slice). |
| G7 | **Achievements, medals, reward ledger, redemption.** Only `ChallengeReward` labels exist; `CreditsWallet` is unused and blocked (OI-009). | RWD-001..010 | P0 | New append-only tables. |
| G8 | **Result provenance model.** Activities have `source` but no "official result" concept, verification, or correction history. | RUN-003..009 | P0 | New `EventResult` + revision history. |
| G9 | **Run upload idempotency.** `recordRun` has none; a retried event-run submit would create duplicates. | RUN-001, PAY-007 analog | P0 for event runs | Add `clientRef`/`Idempotency-Key` to event-run submit (and ideally to plain runs). |
| G10 | **GPS recorder is Android-only.** | RUN-001, 002 | Known limit | "Start Run" on iOS must degrade to "not available on this device"; ticketing unaffected. Not a marathon-module fix. |
| G11 | **Portal translation is uneven**; new organizer/admin pages must use `t()` from the start (rule 5), unlike most admin pages. | EVT-010, I18N | P0 hygiene | Also no ESLint config in portal. |
| G12 | **No shared ID helper, HMAC utility or rate-limit middleware.** | — | Low | Either adopt the newest-store `newId` pattern inline or add small shared helpers; do not refactor existing copies. |
| G13 | **No general remote feature-flag service in mobile.** | §2.9 | Low | Use the established `GET /<feature>/options` endpoint pattern (`/events/options`) plus a dart-define for UI gating. |
| G14 | **Corporate coordinator has no mobile surface.** | REG-005 | Scope | Corporate bulk registration lives in the portal `org`/`hr` area; mobile shows the participant their claimed ticket only. |
| G15 | **Portal QR scanner is inline**, not a component. | KIT-002 | Low | Extract from `app/scan/page.tsx` when building kit collection. |
| G16 | **Deep links** are allowlists with no URL scheme; event share links (EVT-007) need the web.app App Link pattern used by friend invites. | EVT-007, COM | P1 | |
| G17 | **Money convention mismatch with PRD.** Repo stores whole TZS integers in `*Tzs` columns; PRD asks for minor units + ISO currency. | EVT-006, §7 | Decision | Recommend: follow repo (`priceTzs` integer + `currency` column, document that TZS has no subunit in use). Multi-currency later would need a `priceMinor` migration anyway; flag, do not pre-build. |
| G18 | **Error envelope mismatch with PRD.** | §8 | Decision | Follow repo: `{ error: code, ...extra }`. Add `message` only where other routes do. |

---

## 4. Risks and unknowns

- **R1 Payment provider undecided.** Everything after Phase 3 depends on it. The Tunzaa integration is real but narrow and has no refund API; Selcom has only a stub. Memory: owner chose manual confirmation for the marketplace controlled launch (2026-10-15). The same choice is available here and should be made explicitly.
- **R2 Fee ownership and merchant of record** (PRD §17.2, §17.5) are not represented anywhere in code today; organizer settlement cannot be designed until decided. The vendor commission model (per-vendor rate, weekly statements) is the nearest analogue.
- **R3 Auth change.** A new `event_organizer` user type (and `organizer_staff`) changes `requireAuth` call sites, `portalSession` role probing, `approvalStatusForRole`, persona switching and mobile role routing. Alternative with less auth surface: organizers are B2B-style organizations whose members are ordinary users with an `OrgMembership(orgType='organizer')`. Recommend the vendor-style user type for consistency with how the portal and KYC already treat partners, but this needs the security reviewer early.
- **R4 Migration ordering.** Latest migration timestamp is `20270104090000`, in the future relative to the clock. New files must sort after it or they will never run on existing databases.
- **R5 Legacy collection store silently drops unknown fields** (`ALLOWED_FIELDS`). Use the newer per-domain Postgres store pattern for every event table to avoid silent data loss.
- **R6 bfast guard mounting is method-blind and prefix-matched.** Every new route must use `routeGuard`; a `/v1/organizer` prefix shared between JWT and API-key routes could leak a guard across methods if not wrapped.
- **R7 Static-export portal** cannot do server-side redirects or dynamic segments; organizer pages must use query parameters and client guards, with the backend as the only authority (already the house rule).
- **R8 QR replay.** The current check-in QR is deliberately replayable within 2 minutes; ticket tokens must not reuse that design.
- **R9 Offline kit scanning (KIT-005)** has no precedent in the platform except back-dated vendor walk-in sales. Treat as a separately flagged slice with provisional states; do not ship in the first kit-collection PR.
- **R10 Swahili.** Server strings are inline `{en, sw}`; the Swahili glossary file referenced by mobile comments is not in the mobile repo (location to confirm). All new copy needs native review (standing gap).
- **R11 Legal.** Organizer terms, participant waiver, emergency-contact handling and minors' eligibility need the Tanzanian counsel review that is still pending for all legal texts.
- **R12 Uninspected:** iOS project beyond `Info.plist`; Zebra storage service internals; the actual Tunzaa sandbox behaviour; production env (BFast console) flag inventory beyond `docs/server-env-checklist.md`; portal `app/org` finance pages in detail.

---

## 5. Proposed migrations, routes and screens

### 5.1 Migrations (fitflex-functions, all after `20270104090000`, all with `down`, raw-SQL CHECKs, partial unique indexes, composite FKs for tenancy, new-style Postgres stores)

| File | Tables |
|---|---|
| `20270110090000-events-organizers.cjs` | `EventOrganizer` (id, ownerUserId, name, status draft/pending_review/active/rejected/suspended, kycCaseId, settlementAccountId, timezone), `EventOrganizerStaff` (organizerId, userId, role owner/admin/ops/finance/timing, status); `OrgMembership.orgType` gains `organizer`; `PartnerKycCase.partnerType` gains `event_organizer` |
| `20270110090100-events-core.cjs` | `Event` (slug unique, status enum, startsAt/endsAt UTC, timezone, venue, geo, routeMeta jsonb, termsSnapshot jsonb, refundPolicySnapshot jsonb, publishedAt, version), `EventCategory`, `EventTicketType` (priceTzs integer, currency, capacity, sold, held, saleOpensAt/closesAt, minPerOrder/maxPerOrder), `EventCollectionPoint`, `EventChangeLog` |
| `20270110090200-events-orders.cjs` | `EventOrder` (purchaserUserId nullable, organizationId nullable, status, currency, subtotalTzs/discountTzs/feesTzs/totalTzs, priceSnapshot jsonb, idempotencyKey + fingerprint, holdExpiresAt, holdCycle), `EventOrderLine`, `EventRegistration` (participantUserId nullable, participant fields, consentBasis, status, bibNumber, kitStatus, resultStatus, claimTokenHash), `EventTeam`, `EventTeamMember`, `EventInventoryMovement` (append-only hold/release/commit ledger with unique movement key) |
| `20270110090300-events-payments.cjs` | `EventPayment` (orderId, paymentRequestId FK to existing `PaymentRequest`, provider, providerTxnId unique where not null, merchantReference unique, amountTzs, currency, status, verifiedAt, idempotencyKey), `EventRefund` (or extend `Refund.kind` with `event_order` — **prefer extending `Refund`**), `PaymentRequest.eventOrderId` column; `WebhookSeen` reused |
| `20270110090400-events-tickets-ops.cjs` | `EventTicket` (registrationId, tokenHash unique, status, issuedAt, revokedAt), `EventKitCollection` (unique partial index one `collected` per registration; override reason), `EventBibAssignment` history + unique `(eventId, categoryId, bibNumber)` partial, `EventResult` + `EventResultRevision`, `EventActivityLink` |
| `20270110090500-events-rewards.cjs` | `EventMedalTemplate`, `EventMedalAward` (unique `(registrationId, medalTemplateId)`), `AchievementDefinition`, `UserAchievement` (unique award key), `RewardDefinition`, `RewardLedgerEntry` (append-only, unique idempotencyKey), `RewardRedemption` (codeHash unique, atomic claim) |
| `20270110090600-integration-platform.cjs` | `ApiClient` (ownerType/ownerId, clientId unique, secretHash, scopes, status, expiresAt, rotatedAt, lastUsedAt), `OutboxEvent` (id, type, aggregate, payload jsonb, createdAt, publishedAt), `WebhookEndpoint` (url, secretRef, events[], status), `WebhookDelivery` (endpointId, outboxEventId, attempt, status, nextAttemptAt, responseCode, lastError) |

### 5.2 Routes (fitflex-functions; existing style — no `/api` prefix; JWT routes under `/me`, `/organizer`, `/admin`; API-key routes under `/v1/organizer`)

- Public/member: `GET /events`, `GET /events/options`, `GET /events/:id`, `GET /events/:id/categories`, `POST /me/event-orders/quote`, `POST /me/event-orders` (Idempotency-Key), `GET /me/event-orders`, `GET /me/event-registrations`, `GET /me/event-registrations/:id`, `POST /me/event-registrations/:id/claim`, `POST /me/event-registrations/:id/cancel`, `POST /me/event-orders/:id/pay` (creates `PaymentRequest`; then existing `/me/payments/:id/mobile-money` or manual), `GET /me/event-orders/:id/payment-status`, `POST /me/event-registrations/:id/runs` (event-linked `recordRun` with `clientRef`), `GET /me/achievements`, `GET /me/reward-ledger`, `POST /me/reward-redemptions`.
- Organizer (JWT, user type `event_organizer`/staff): `POST /me/organizer` (request capability → KYC case), `GET/POST /organizer/events`, `PATCH /organizer/events/:id`, `POST /organizer/events/:id/{submit,publish,cancel}`, categories/ticket-types CRUD, `GET /organizer/events/:id/registrations` (keyset cursor + `updatedSince`), kit-collections, bib-assignments, results imports/verify, staff, `POST /organizer/api-clients[/:id/rotate|revoke]`, webhook-endpoints CRUD + test, `GET /organizer/webhook-deliveries`, `POST .../retry`.
- Organizer API (API-key, `/v1/organizer/...`): read registrations/changes, write kit-collections, bib-assignments, results — each requiring `Idempotency-Key`; scopes `registrations:read`, `kit:write`, `bibs:write`, `results:write`.
- Admin (portal ACL scope `events`): organizer review via existing `/admin/kyc` (partner type) + `/admin/events/*` moderation/cancellation/exceptions; payments via existing `/admin/payment-requests`; refunds via existing `/admin/refunds`.
- Webhooks in: reuse `/webhooks/tunzaa` (extend `PAYABLE`) when provider chosen.
- Jobs: `eventHoldExpiry` (every 5 min), `webhookDispatcher` (every minute, `SKIP LOCKED`), `eventPaymentReconciliation` (hourly when provider on), `eventReminders` (daily).

### 5.3 Portal screens (static export, query-param detail pages, `t()` everywhere, new ACL scope `events`, new persona `event_organizer`)

`/organizer` (overview), `/organizer/onboarding` (KYC via existing partner flow), `/organizer/events?event=<id>` (list + wizard with `Stepper`), `/organizer/events/categories`, `/organizer/registrations` (DataTable, filters, CSV export audited), `/organizer/roster-import` (dry-run → apply), `/organizer/kit` (scanner extracted from `app/scan`), `/organizer/bibs`, `/organizer/results`, `/organizer/integrations` (API clients, webhooks, delivery log), `/organizer/finance`, `/organizer/staff`, `/organizer/audit`; `/admin/events` (moderation queue); `/org/events` and `/hr/events` (corporate bulk registration on the existing org/hr areas).

### 5.4 Mobile screens (member; routes under `/member/events/...` in the Member `ShellRoute`; Events section in the Activity tab plus a Home card)

Discovery list + filters, event detail (hero band), category/ticket picker (`FFSheet`), registration mode selector, participant roster form (draft saved locally), review & checkout (reuse `CheckoutAttempt`), payment status (reuse manual/momo widgets), my registrations + ticket wallet, QR ticket (`FFQrCode`), kit & updates, Start Run (gated on `GpsSource.isSupported`), result detail with provenance badge, medals/achievements, rewards wallet + redemption code, team status. Organizer mobile tooling (kit scanning on a phone) can follow in a later slice using the owner scanner pattern.

---

## 6. Payment provider prerequisites (launch gate)

| Item | Current state | Needed before automatic payment |
|---|---|---|
| Provider selection | Tunzaa live for passes; Selcom stub; shop manual | Owner decision (PRD §17.1) |
| Sandbox credentials | Tunzaa env in BFast console (per `docs/server-env-checklist.md`) | Confirm sandbox vs live; `TUNZAA_SANDBOX_SETTLES` semantics |
| Charge creation | `tunzaa.mjs` initiate | Extend `PAYABLE` to `EVENT_ORDER`; amount from server snapshot |
| Callback verification | HMAC sorted-key JSON, constant-time (Tunzaa) | Reuse; add amount/currency/reference comparison to event order |
| Status lookup | `check-status` exists | Add reconciliation sweep for `unknown` |
| Refunds | None via any provider; manual mark-paid only | Decide: manual payout (as today) or provider refund API |
| Reconciliation | None automated | Daily job comparing `EventPayment` vs provider statement |
| Manual fallback | Lipa Namba + transaction ID + admin decision + optional second approver | Already exists; label as manual in all copy |
| Merchant of record / fees / payout schedule | Not modelled | Owner decision (PRD §17.2, §17.5) |

Recommendation: build Phase 4 provider-neutral with the existing `PaymentRequest` as the bridge, enable the labelled manual path first (same posture as the marketplace), and extend Tunzaa behind `EVENT_PAYMENTS_TUNZAA` once the owner confirms it is the launch provider.

---

## 7. Design token and i18n plan

- **Mobile:** `FFTokens` only; event status badges via `FFBadge` tones with text labels (`paid`, `pending`, `verified` never colour-only); Fuel accent for "registration closes soon"; Volt primary in member dark theme; `FFHeroBand` for event detail with the existing dark scrim (hero flags are OFF in prod; design for both states). New hero slot + bundled asset for Events. All strings in `lib/shared/i18n.dart` `en` and `sw` with the parity test extended; Swahili marked for native review.
- **Portal:** `@theme` tokens only; `Badge` tones + text; `DataTable`, `Stepper`, `Dialog`; every new page uses `t()` with `events.*` and `organizer.*` keys in `src/lib/i18n.ts` (both locales). Money via `money()`, dates via `eatDateTime` with the event's IANA timezone for display.
- **Backend:** notification bodies as inline `{en, sw}`; event-facing catalogue strings (category names, statuses) as `{en, sw}` objects in `src/shared/event-catalogue.mjs`.
- **Currency:** `priceTzs` integer + `currency` column (default `TZS`), display "TSh"; document the whole-shilling unit in the migration comment.

---

## 8. Test plan

- **Backend (`specs/`, CI DB):** migration up/down for each file; state-machine unit tests (order, payment, registration, ticket, kit, result); Postgres concurrency: two orders for the last slot (parallel transactions), duplicate `Idempotency-Key` replay and mismatch, hold expiry while payment pending, duplicate payment callback, amount/currency mismatch rejected, bib uniqueness, one kit collection per registration + override, reward double-redemption, ledger reversal; authorization matrix (member, purchaser, organizer A vs B, staff role, corporate coordinator, API-key scopes, admin); webhook signing, replay window, retry/backoff, dead-letter, SSRF URL rejection; `portal-acl-scopes.specs.mjs` updated for the `events` scope.
- **Portal (`tests/e2e`, mocked API via `page.route`):** organizer onboarding → draft → submit → admin approve → publish; roster import valid/invalid/duplicate rows; kit scan duplicate; API client create/rotate/revoke (secret shown once); webhook delivery log + retry; role isolation (organizer A cannot open B's event via `?event=`); EN/SW toggle on every new page; keyboard navigation of the wizard.
- **Mobile (`test/`, `RecordingApi`):** discovery filters + empty state; checkout `CheckoutAttempt` idempotency; pending-not-paid rendering; ticket QR renders from token; Start Run hidden when `GpsSource.isSupported` false and when permission denied; result provenance badge text; medals/rewards lists; `keysOf('en')` == `keysOf('sw')` for new keys; deep-link cases in `memberRouteFor`.
- **UAT (Flutter web from RC, isolated DB):** PRD §13 scenarios 1-5, 9-11, 15-19; camera, push and GPS marked "needs a real device".

---

## 9. Smallest safe implementation sequence

Each slice is a PR set into `release-candidate`, dormant behind flags, with its own specs. Stop for owner review after each.

| Slice | Content | Flags | Repos |
|---|---|---|---|
| **S0 (this doc)** | Reuse map, gap report, decisions list | — | parent |
| **S1 Foundation** | Migrations §5.1 (organizers, core, orders, tickets/ops, rewards skeleton, integration platform tables); pure state machines in `src/shared/events-lifecycle.mjs`; new-style Postgres stores; capacity hold primitive + expiry job; specs for invariants and concurrency. No routes exposed. | `EVENTS_MODULE` (off) | functions |
| **S2 Organizer + discovery** | `event_organizer` user type + KYC partner type (security review); organizer event CRUD + lifecycle + admin moderation; public discovery/detail; portal organizer area + `/admin/events`; mobile discovery + detail (read-only, no register button) | `EVENTS_MODULE`, `EVENTS_DISCOVERY` | all three |
| **S3 Registration & orders** | quote, order with Idempotency-Key, holds, roster validation, claim/consent, teams, corporate bulk via `org`/`hr` portal import; mobile registration → checkout → "awaiting payment" (no payment yet) | `EVENTS_REGISTRATION` | all three |
| **S4 Payments** | `PaymentRequest.eventOrderId`, manual labelled path, `Refund.kind=event_order`, ticket issuance on confirmed payment, outbox events written; Tunzaa extension behind its own flag only if owner confirms provider | `EVENTS_PAYMENTS_MANUAL`, `EVENTS_PAYMENTS_TUNZAA` | functions, mobile, portal (admin labels) |
| **S5 Tickets, kit, API & webhooks** | QR tickets, kit collection + bibs (online only), organizer roster sync API, API clients, webhook endpoints + dispatcher + delivery log, OpenAPI doc | `EVENTS_KIT_OPS`, `EVENTS_ORGANIZER_API` | all three |
| **S6 Runs, results, medals, rewards** | event-linked runs with `clientRef`, result import/verify/correct, medals, achievements, reward ledger + redemption | `EVENTS_RESULTS`, `EVENTS_REWARDS` | all three |
| **S7 Hardening & pilot** | offline kit scanning (provisional), waitlist (P1), analytics events, go-live checklist, runbooks, pilot event on RC | per-feature | all three |

---

## 10. Decisions needed from the owner before S1 can be finalised

1. **Payment provider for events** (PRD §17.1): extend Tunzaa, launch manual-only (as marketplace), or build Selcom? Recommendation: manual-only first, Tunzaa extension flagged.
2. **Merchant of record, fee/commission, payout schedule** (§17.2, §17.5). Recommendation: FitFlex collects, organizer paid weekly via the existing partner-statement workflow, commission % per organizer like vendors.
3. **Organizer identity model**: new `event_organizer` user type (vendor-style; recommended) vs organizer as B2B-style organization membership.
4. **Money representation**: keep repo convention (integer whole TZS + `currency` column; recommended) vs PRD minor units.
5. **Error envelope and route prefix**: keep repo conventions (recommended); `/v1/organizer` only for API-key callers.
6. **Manual payment approvers** for event orders (§17.3): same admin roles + `MONEY_SECOND_APPROVER` as today?
7. **Offline kit scanning** in launch scope or S7?
8. **Timing providers / results format** (§17.7): CSV upload first?
9. **Reward funding** (§17.8): FitFlex-funded digital-only at launch?
10. **Organizer verification evidence and SLA** (§17.4): same checklist as vendor KYC plus event permit?
