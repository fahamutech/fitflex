# Gym Communication & Member Engagement — Implementation Plan

**Based on:** `COMMUNICATION_IMPLEMENTATION_AUDIT.md` (26 Sep 2026)
**Status:** M0 complete. Decisions D1–D6 recorded 26 Sep 2026 (audit §16). **M1 and M2 built** on `fitflex-functions` branch `feat/communications-foundation` (see `COMMUNICATION_ARCHITECTURE.md`, `COMMUNICATION_API.md`). They ship as one PR (fitflex-functions#17). **M3–M5 built** (see the M3/M4 and M5 results below). M6 is next.
**Repos:** `fitflex-functions` (backend, merged first), `fitflexmobile` (owner Communication Center and member inbox), `fitflex-portal` (owner/staff Communication Center on the operator side, and admin platform communications, each gated by role and ACL).
**Release rule (existing):** every merge to `main` deploys. Backend PRs merge and are confirmed live before the mobile or portal PRs that call them.

---

## Guiding choices

1. **Extend `notification-service`; don't replace it.** The `Notification` table stays the in-app inbox. A new `CommunicationMessage` ledger records every channel attempt per recipient, and `notify()` becomes one of several channel adapters behind a new `communication-service`.
2. **Use SQL for anything gym-wide.** The collection store's `filterAsync` loads whole tables, so segmentation, dispatch and analytics get a small query module. It takes the existing Knex `db` through DI in `services.mjs`, the same composition root. Row reads and writes for the new tables still go through `collection()`, with `TABLE_MAP` and `ALLOWED_FIELDS` entries.
3. **One definition of member status.** Pull the status rules (`active / expiring_soon / expired / suspended`, and `EXPIRING_SOON_DAYS = 7`) out of `member-management-service` into `src/shared/member-status.mjs`. The Members list and the segment service then share them, and a test pins them to each other.
4. **The ledger drives sending.** Creating a campaign writes `queued` ledger rows. A dispatcher cron that runs every minute sends them in batches (`FOR UPDATE SKIP LOCKED`). That gives retries, partial failure, scheduling, resumability and duplicate protection from one mechanism.
5. **Idempotency comes from unique constraints, not code paths:**
   - `CommunicationMessage (campaignId, memberId, channel)` for campaigns
   - `AutomationRun (automationId, memberId, occurrenceKey)` for automations, e.g. `sub_123:T-7`
   - `CommunicationCampaign.sendRequestId` for the owner's Send button
6. **Provider-agnostic channels.** Each channel is an adapter `{ canSend(recipient, message), send(...) }`. WhatsApp sits behind a `WhatsAppProvider` interface (`sendTemplate`, `sendMessage`, `getDeliveryStatus`, `validateRecipient`) with a `FakeWhatsAppProvider` for tests and development. SMS or email later are just new adapters.

---

## M1 — Domain and data foundation (backend)

**Migration `2026100x-communications.cjs`:**

| Table | Key columns | Constraints / indexes |
|---|---|---|
| `CommunicationCampaign` | id, senderType (gym/platform), gymId (null for platform), name, purpose (promotion/renewal/payment/announcement/engagement/general), category (transactional/marketing, derived from purpose), status (draft/scheduled/sending/sent/partially_failed/failed/cancelled), audience jsonb, content jsonb (title, body, cta, deepLink, variables, templateId), channels text[], scheduledAt, sendRequestId, createdBy, counts jsonb, createdAt, updatedAt, sentAt | idx (gymId, createdAt); unique (gymId, sendRequestId) |
| `CommunicationMessage` | id, campaignId?, automationRunId?, gymId, memberId, channel (in_app/push/whatsapp), category, messageType, renderedTitle, renderedBody, locale, notificationId?, status (queued/sending/sent/delivered/read/clicked/failed/skipped), skipReason, providerMessageId, attempts, nextAttemptAt, sentAt, deliveredAt, openedAt, clickedAt, failedAt, failureReason, failurePermanent, createdAt | unique (campaignId, memberId, channel) where campaignId not null; idx (status, nextAttemptAt); idx (gymId, memberId, createdAt); idx (providerMessageId) |
| `CommunicationTemplate` | id, gymId (null = system), key, name, category, purpose, channel, bodies jsonb `{en:{title,body}, sw:{title,body}}`, variables text[], whatsappTemplateId?, status, createdAt, updatedAt | unique (gymId, key) |
| `WhatsAppTemplate` | id, provider, providerTemplateName, language, category (utility/marketing), variables text[], approvalStatus (pending/approved/rejected/paused), lastSyncedAt | unique (provider, providerTemplateName, language) |
| `CommunicationPreference` | id = memberId (pk), inAppMarketing, pushMarketing, whatsappTransactional, whatsappMarketing, whatsappMarketingConsentAt, whatsappMarketingConsentSource, whatsappOptedOutAt, locale, updatedAt | Transactional in-app has no switch by design |
| `CommunicationAutomation` | id, gymId, trigger, offsetDays, conditions jsonb, templateId, channels text[], status (enabled/disabled), createdAt, updatedAt | unique (gymId, trigger, offsetDays) |
| `AutomationRun` | id, automationId, gymId, memberId, occurrenceKey, status, messageIds text[], createdAt | **unique (automationId, memberId, occurrenceKey)** |
| `JobRun` | id, job, startedAt, finishedAt, stats jsonb, error | Observability |
| `Notification` (alter) | + category, gymId, campaignId, clickedAt (all nullable) | Backwards compatible. Existing rows are untouched. |

**Code:**
- Register the collections in `collections.mjs`, `TABLE_MAP` and `ALLOWED_FIELDS`, with jsonb columns listed.
- `src/shared/member-status.mjs`, extracted from `member-management-service`, with its behaviour unchanged.
- ~~Fix the `phoneNumber`/`phone` bug~~. **Moved to M7.** Fixing it alone would make the unguarded ad-hoc WhatsApp routes (audit S2) able to reach members, so the two fixes ship together.
- Add the `communications` scope to `GYM_STAFF_ACL_SCOPES`. The mobile `kGymStaffAclScopes` list and the portal Users page scope list are UI, so they move to M3.
- Add a `communications` **admin** ACL scope for portal staff, next to `analytics`, `challenges` and the rest.

**Tests:** migration up/down on CI Postgres; `member-status` parity with the existing `membership-expiry` specs; store round-trip for jsonb and array columns.

**M1 result (26 Sep 2026):**
- **Tests:** 437/437 backend specs pass, 20 of them new: `communications-rules` and `communications-schema`.
- **Migration:** applies, rolls back and re-applies cleanly on the CI database.
- **Loading:** all 336 endpoints and jobs load.
- **Change from plan:** the preference column is `pushMarketing`, not `pushEnabled`. Transactional push has no switch (D3). The table also gained `whatsappOptedOutAt`.

## M2 — Audience segmentation (backend)

- `segment-service.mjs` with a small **filter DSL**, validated server-side:
  `{ all: [ {field:'status', op:'in', value:['active']}, {field:'daysUntilExpiry', op:'between', value:[0,7]} ] }`
  - Fields: status, plan, tier, paymentStatus, expiresAt, daysUntilExpiry, daysSinceExpiry, joinedDaysAgo (new member), lastCheckinDaysAgo, visitsInLastNDays, age, gender, homeGymId.
  - Ops: eq, in, between, lte, gte.
  - `any` groups nest one level.
- ~~Everything compiles to one SQL query~~. **As built:** scoped SQL reads the records, and the shared JS rules derive the facts and apply the filter. This avoids re-writing the Members-list status rules in SQL (the brief says not to duplicate business logic).
  - The gym scope comes from `ownerGymIdsOf(owner)` ∩ the requested `gymId`, and is **always injected server-side**. Owners can't send gym ids in the filter.
  - **Gym base set (D1):** the latest `direct_sub` per member at the owner's gyms. FitFlex (roaming) members are **never** in a gym audience, whatever the filter. The Members list keeps showing them, tagged `fitflex`.
  - **Platform base set (admin only):** all members, with extra fields: pass tier, subscription type, home gym, and **area**. Area is derived from the location of the member's home gym, or their most-visited gym in the last 90 days (D6). Area filters use gym `location`, plus a radius around a gym's `coordinates`. No device GPS is stored.
  - Joins a check-in aggregate. Days are counted in EAT.
- Presets: All, Active, Expiring (≤7d), Expired (≤30d ago), New (≤14d), Inactive (no check-in ≥14d).
- `previewAudience` returns a count, eligible counts per channel (after preferences, phone and opt-out), and a sample of 5 names.
- **Endpoints:**
  - `GET /owner/communications/segments`, returning the presets and field catalogue
  - `POST /owner/communications/audience/preview`
  - `GET /admin/communications/segments`, `POST /admin/communications/audience/preview`, behind `requireAuth('admin')` + `requireAcl('communications')`
- **Tests:**
  - Each preset
  - The brief's compound examples
  - No matches
  - Two gyms / two owners, where owner A's filter can never return B's members even with B's gymId passed
  - Parity: the Active and Expiring counts equal the Members-list stats

**M2 result (26 Sep 2026):**
- **Tests:** 464/464 backend specs pass, 27 of them new: `communications-audience` (15 pure) and `communications-segments` (12 against the CI database, through the endpoints).
- **Tenancy check:** a deliberately broken gym-scope check makes the cross-gym test fail.
- **Loading:** all 340 endpoints load, with no route clashes.
- **Changes from plan:**
  - Presets `new` and `recently_expired` use a 30-day window.
  - `all` excludes suspended members.
  - A request for another owner's gym is refused (`403 not_your_gym`); the Members list instead silently falls back to all of the owner's gyms.
- **Open question for the product owner:** the Members list, and therefore segments, show a direct subscription as `active` while its payment is `pending` or `rejected`. Owners can exclude those with `paymentStatus`.

## M3 — Communication Center shell (mobile + portal)

- **Portal (D5):**
  - `/owner/communications` on the operator nav, for owners and for staff with the `communications` gym scope.
  - `/admin/communications` on the admin nav, with `aclScope: 'communications'`, for platform campaigns, the WhatsApp status and template registry, the kill switch and caps.
  - Both pages call the same backend services as the app. Strings go in `src/lib/i18n.ts` (en/sw).

**Mobile:**

- New owner route `/owner/communications`, opened from a Home card and the Members page app bar. The owner bell stops being a stub and opens the owner's own inbox.
- Tabs as `FFSegmented`: **Overview · Campaigns · Templates · Automations**. The brief's Members, WhatsApp, Analytics and Settings sections fold in:
  - Members → segments inside the composer
  - WhatsApp → a status card on Overview
  - Analytics → Campaign detail and an Overview summary
  - Settings → Automations and caps
- `GET /owner/communications/overview`: counts, recent campaigns, WhatsApp status and the remaining cap.
- A `CommunicationsController` (ChangeNotifier), following `members/member_controller.dart`.
- All strings go in `i18n.dart` in `en` and `sw`.

## M4 — Campaign creation (backend + mobile)

- **Backend (`communication-service.mjs`):**
  - Operations: createDraft, updateDraft, cancel, schedule, sendNow and duplicate. The state machine lives in the service.
  - Variables render per recipient. Variables with no value are either blocked at preview or fall back to a stated default.
  - `send` requires `sendRequestId`, and a replay returns the same campaign.
  - Audiences over the **large-send threshold** (default 200) need `confirmLargeSend: true`.
  - The per-gym weekly marketing cap is enforced when the campaign is queued.
- **Endpoints** under `/owner/communications/campaigns` (list, create, get, patch, `/:id/schedule`, `/:id/send`, `/:id/cancel`), all guarded with `requireAuth('gym_operator','gym_staff')` + `requireGymAcl('communications')`. Every read re-checks the campaign's gymId against the owner's gyms and returns 404 on a mismatch.
- **Mobile:** a 7-step flow in one page with a stepper: Purpose → Audience (live count) → Message (variables chips, CTA, deep link picker from a fixed list) → Channels (eligible count per channel) → Schedule → Preview (in-app card, push banner, WhatsApp bubble) → Confirm. Send is disabled while in flight, and the same request id is reused on retry.
- Reusable widgets: `AudienceSelector`, `MessageComposer`, `ChannelSelector`, `CampaignPreview`, `CampaignStatusPill`, all built on `FFCard`, `FFPill` and `FFMetricCard`.

**M3–M4 result (26 Sep 2026):**
- **Backend** (`feat/communications-campaigns`, stacked on #17, with `main` merged in):
  - Campaign service and 12 owner + 12 admin endpoints.
  - 487/487 specs pass, 18 of them new in `communications-campaigns`.
- **Flutter** (`feat/communication-center`): Communication Center, the 7-step composer and campaign detail. `flutter analyze` is clean, and 379/379 tests pass, 12 of them new.
- **Portal** (`feat/communication-center`): owner and admin Communication Center. `tsc` is clean and `next build` succeeds. The portal has no ESLint config.
- **Checked end to end in a browser** (local API, CI database, demo gym), on the portal as owner and as admin in Swahili, and in the Flutter web build at phone size:
  - audience counts matched the demo members;
  - the preview rendered a real member's values;
  - the ledger held one row per member per channel.
- **Found and fixed during that check:** a fast double-click on the portal's Send could create a stray second draft. It never sent twice, because the server's guards held. A synchronous guard fixes it. The Flutter controller was already safe.
- **Changes from plan:**
  - The Templates and Automations tabs aren't shown until M6 and M9, so there are no empty screens.
  - In the portal, "Members / WhatsApp / Analytics / Settings" fold into Overview and the composer, as in the app.
- **Until M5 ships:** a sent campaign shows "Sending" and its messages wait in the ledger as `queued`. Nothing reaches members until the M5 dispatcher runs, so merge M4 together with M5, or leave it unmerged.

## M5 — In-app and push delivery

- **Dispatcher** (`communicationDispatcher` cron, every minute):
  - Claims due `queued` messages in batches of 100 per gym.
  - Calls the channel adapter.
  - Records the result.
  - Retries transient failures with backoff (1m, 5m, 30m; at most 3 attempts).
  - Marks permanent failures once.
  - Rolls up campaign counts and final status (`sent` / `partially_failed` / `failed`).
  - Writes a `JobRun` row.
- **The scheduler** is the same cron: `scheduled` campaigns with `scheduledAt ≤ now` expand into ledger rows. The expansion is idempotent through the unique constraint.
- **In-app adapter:** writes the `Notification` row with category, gymId, campaignId and `data.deepLink`.
- **Push adapter:** reuses `sendPush` and records the result. It's skipped when `channelAllowed` refuses it (marketing with `pushMarketing` off) or the member has no tokens.
- **Member endpoints:**
  - `POST /me/notifications/:id/click`
  - `GET/PUT /me/communication-preferences`
  - Marking a message read also updates the ledger's `openedAt`.
- **Mobile member side:**
  - A **Messages inbox** (bell on member Home, with an unread badge), with category filters: Membership, Payments, Offers, Announcements.
  - Deep-link routing through a whitelist map: `membership` → Passes, `renewal` → Passes/renew, `payment` → Payment page, `announcement` → message detail, `gym:<id>` → gym page.
  - `PushService` gains `onMessageOpenedApp` and `getInitialMessage` handlers that use the same router.
  - The preferences screen goes under Profile → Privacy & data.
- **Decision already recorded:** push stays off until `PUSH_NOTIFICATIONS=on`. Rollout needs that flag turned on in production.

**M5 result (26 Sep 2026):**
- **Backend:** 501/501 specs pass, 14 of them new in `communications-delivery`. The locking test fails if `SKIP LOCKED` is removed.
- **Flutter:** analyze is clean, and 392/392 tests pass, 13 of them new in `inbox_test`, including a Swahili completeness check.
- **Portal:** `tsc` is clean.
- **Checked end to end** (local API, CI database, demo member):
  - Two campaigns were sent and one dispatcher tick delivered both to the inbox and closed them as `sent`.
  - In the Flutter web build at phone size: the bell showed 2, the inbox showed both messages with sender and Offers tag, opening one marked it read, and "Renew now" opened Passes. The ledger showed the renewal `clicked` and the promotion untouched.
- **Bugs found and fixed while testing:**
  - The inbox pages notified listeners during build (caught by a widget test).
  - Links pushed member-shell screens from outside the shell, leaving a blank page. They now use `go`, as the rest of the app does.
- **Changes from plan:**
  - Scheduling a large audience now needs the same confirmation as sending one; previously it didn't.
  - Push delivery or open receipts from FCM aren't available. Push is `sent` when FCM accepts it, and `read` once the member opens it.
- **Still to do before production:**
  - `PUSH_NOTIFICATIONS=on` in production.
  - Push is Android-only, as before; iOS and web push aren't configured.

## M6 — Templates

- Seed about 18 **system templates** from the brief (membership, payment, marketing and engagement), each with `en` and `sw` bodies. The Swahili gets the same native-speaker review as the existing strings.
- Owners can clone a system template into a gym template and edit it. System templates are read-only.
- Each template shows whether a matching approved `WhatsAppTemplate` exists. WhatsApp is offered only for templates that map to one; free text is never sent as WhatsApp.
- **Endpoints:** `GET /owner/communications/templates`, plus POST, PATCH and archive.

## M7 — WhatsApp provisioning, plug and play (D2/D3)

There's no WhatsApp Business account yet, so M7 builds everything **except** a real provider adapter:

- `src/integrations/whatsapp/provider.mjs` holds the interface (`sendTemplate`, `sendMessage`, `getDeliveryStatus`, `validateRecipient`), plus:
  - `NotConfiguredWhatsAppProvider`: the default. It returns `whatsapp_not_configured`, and ledger rows are `skipped`, not `failed`.
  - `FakeWhatsAppProvider`: for tests and development. It can simulate delivered, failed, rejected-template and opted-out results.
  - A provider registry chosen by `WHATSAPP_PROVIDER`.
- The channel shows as **"WhatsApp — coming soon"** in the composers. Consent capture and the template registry work now, so opt-ins build up before launch.
- **Go-live, once the account is confirmed (a later PR):**
  1. Write the real adapter against the provider's documented API, and check it with a sandbox send.
  2. Register the approved templates in the registry.
  3. Set credentials and `WHATSAPP_PROVIDER`.
  4. Route the legacy `whatsapp-service` callers through the provider.
- Campaign, automation and preference code needs no changes at go-live.
- **Recipient checks:** has a phone, the phone normalises, not opted out, and the category is allowed by preferences.
- **Delivery-status webhook:**
  - Route `POST /webhooks/whatsapp/status`, authenticated with a shared secret as the Selcom webhook is.
  - Updates the ledger by `providerMessageId`.
  - **STOP / "ACHA"** replies set `whatsappMarketing=false` and `whatsappTransactional=false`.
- **Admin:**
  - A portal page for WhatsApp status and the template approval registry, behind a new `communications` admin ACL.
  - A global kill switch (`PlatformSettings.communications.whatsappEnabled`).
- **Pre-flight:** fix audit finding **S2** by adding relationship checks to, or removing, the ad-hoc trainer, operator and vendor WhatsApp routes, and close `/test/whatsapp`.

## M8 — Communication history

- `GET /owner/members/:memberId/communications`: this gym's messages only, grouped per message across channels, with status per channel.
- `GET /owner/communications/campaigns/:id/recipients`: paginated, filterable by status.
- **Mobile:** a "Messages" section on the owner member detail page (`CommunicationTimeline`), and a recipients list on campaign detail.
- **Fix audit finding S1:** scope member payment history to the owner's gyms.

## M9 — Automation engine

- Default automations are created per gym, disabled until the owner reviews them. Alternatively they could default to enabled; I'll ask when we get there.
- **Triggers:**
  - `membership_activated`: event-driven, from `adminPaymentService.decide` approval of a `direct_sub`, and from owner `createMember` and `renewMember`
  - `expiry_T-7`, `expiry_T-3`, `expiry_T-1`, `expired`: daily cron at 06:00 EAT, using a SQL date window on `expiresAt` in EAT
  - `payment_failed`: event-driven, from the rejection branch of `decide()`
  - `inactive_14d`: daily cron
- Each firing inserts an `AutomationRun` with `occurrenceKey`, e.g. `sub_123:T-7` or `inactive:2026-10-01`. A unique-violation means it already fired, so the member is skipped. Retries and double cron runs can't double-send.
- **Runaway guards:**
  - At most 1 automation message per member per day per gym.
  - If a run would target more than N members, it's held and logged.
- **Gym reminders take over from the platform renewal notifier (D4).** For a `direct_sub`, it skips members whose gym has an enabled expiry automation. It keeps sending if the gym has none. The notifier also gets a dedupe key, so a rerun can't send twice.

## M10 — Analytics

- `GET /owner/communications/campaigns/:id/analytics`, in three separate groups:
  - **Delivery:** targeted, sent, delivered (WhatsApp only, and only when the provider reports it), failed and skipped, with reasons.
  - **Engagement:** opened (in-app read), clicked (CTA taps). Push opens count only once the tap handler exists.
  - **Conversion:** renewed and paid. These are members with an approved `PaymentRequest` for a `direct_sub` at this gym within the attribution window after a click. Attributed revenue is the sum of those `amountTzs`, and is labelled "attributed (last touch, 7 days)".
- Nothing is estimated. A metric with no data source shows "—".
- The Overview gets 30-day totals.

## M11 — Security and edge cases

- A cross-gym spec suite covering every new endpoint: owner A vs gym B for campaign ids, member ids, template ids and automation ids.
- Staff without the `communications` scope get 403.
- Suspended members are excluded. Deleted accounts cascade. Members with no phone or no tokens are skipped with a reason.
- Also covered: caps, the large-send confirmation, the kill switch, and payload limits (title 65 characters, body 1,000, and the WhatsApp variable limits).
- Close out audit findings S1–S3 if they haven't already been done.

## M12 — QA and production readiness

- API: full `npm test`; `role-smoke.mjs` extended with communication checks.
- Mobile: widget tests and a Patrol flow (owner creates, previews and sends; member reads and taps the deep link).
- Portal: a Playwright test for the admin WhatsApp page.
- Docs: `COMMUNICATION_ARCHITECTURE.md`, `_API.md`, `_AUTOMATIONS.md`, `_TEST_PLAN.md`, `_SETUP.md` (env variable names only, no secrets).
- **Rollout:**
  1. Backend merges.
  2. Confirm the live routes answer (401, not 404).
  3. Mobile and portal merge.
  4. Turn on `PUSH_NOTIFICATIONS=on`.
  5. Enable WhatsApp only after the provider is checked and templates are approved.

---

## Pull-request slicing (per repo, in order)

| # | Repo | Contents |
|---|---|---|
| 1 | functions | M1 schema + member-status extraction + phone-field fix + ACL scope |
| 2 | functions | M2 segments + preview endpoints |
| 3 | functions | M4/M5 campaigns, ledger, dispatcher, member click/preferences endpoints |
| 4 | mobile | M3/M4 Communication Center + composer; M5 member inbox, deep links, preferences |
| 4b | portal | M3/M4 `/owner/communications` (operator nav) + `/admin/communications` (platform campaigns, area segments) |
| 5 | functions + mobile | M6 templates |
| 6 | functions + portal | M7 WhatsApp provider seam (not-configured + fake), consent, template registry, status webhook, S2 fix. No live adapter yet. |
| 7 | functions + mobile | M8 history + S1 fix |
| 8 | functions + mobile | M9 automations + renewal-notifier change |
| 9 | functions + mobile | M10 analytics |
| 10 | all | M11/M12 hardening, docs |

## Environment variables (names only)

- **Existing:** `PUSH_NOTIFICATIONS`, `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_URL`, `WHATSAPP_SERVICE_URL`, `FITFLEX_INTERNAL_TOKEN`
- **Planned:** `WHATSAPP_PROVIDER` (fake/africastalking/…), `WHATSAPP_STATUS_WEBHOOK_SECRET`, `COMMS_LARGE_SEND_THRESHOLD`, `COMMS_MARKETING_WEEKLY_CAP`

## Risks

- **Whole-table reads** in legacy code: this module avoids them, but it calls `member-management` helpers only after they move to SQL or the shared status helper.
- **WhatsApp:** Meta template approval takes days. Marketing templates cost more per message and have stricter opt-in rules. The campaign flow can run on in-app and push alone meanwhile.
- **Push reach:** Android only, off by default. In-app will be the dependable channel at launch.
- **Swahili quality:** the new templates join the existing native-speaker review item.
