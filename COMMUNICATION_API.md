# Communications — API

Base URL: the fitflex-functions API. Auth is the usual `Authorization: Bearer <FitFlex JWT>`. Errors come back as `{ "error": "snake_case_code", "detail"?: "…" }`, following the rest of the API.

| Who | Guard |
|---|---|
| Gym owners, and gym staff with the `communications` scope | `requireAuth('gym_operator','gym_staff')` + `requireGymAcl('communications')` |
| FitFlex admins; portal staff need the `communications` scope | `requireAuth('admin')` + `requireAcl('communications')` |

---

## Audiences (M2)

### `GET /owner/communications/segments`
### `GET /admin/communications/segments`

Returns the catalogue used to build audiences: preset keys with their filters, the filter fields (type, operators, allowed values) and limits. Gym and admin catalogues differ, because `area`, `subscriptionType` and `passTier` are for FitFlex admins only.

```json
{ "scope": "gym",
  "presets": [{ "key": "expiring", "filter": { "all": [{ "field": "status", "op": "eq", "value": "expiring_soon" }] } }],
  "fields": [{ "key": "daysUntilExpiry", "type": "number", "ops": ["eq","gte","lte","between","exists"] }],
  "limits": { "maxDepth": 3, "maxConditions": 25 } }
```

### `POST /owner/communications/audience/preview`

Body: `{ gymId?, preset?, filter?, purpose? }`. At least one of `preset` or `filter` is required; when both are given they're AND-ed.

- **`gymId`:** optional. It must be one of the owner's gyms, otherwise `403 not_your_gym`. Without it, the audience covers all of the owner's gyms.
- **The audience is always the owner's own direct members.** A direct member has a `direct_sub` at one of the owner's gyms. FitFlex pass holders who visit are never included.
- **`purpose`:** one of promotion, engagement, general (these three are **marketing**), or renewal, payment, announcement (**transactional**). It sets which preference rules apply to channel reach. Without it, the marketing rules apply.

```json
{ "senderType": "gym", "gymIds": ["gym_1"], "category": "transactional", "count": 84,
  "channels": {
    "in_app":   { "eligible": 84, "excluded": {} },
    "push":     { "eligible": 51, "excluded": { "no_device": 33 } },
    "whatsapp": { "eligible": 0,  "excluded": { "whatsapp_not_configured": 84 } } },
  "sample": [{ "id": "usr_x", "displayName": "Amina Said", "status": "expiring_soon" }],
  "filter": { "all": [ … ] } }
```

- **`sample`:** the first 5 members by name, with no contact details.
- **Channel exclusion reasons:**
  - Setup: `push_disabled` (the server's `PUSH_NOTIFICATIONS` isn't `on`), `whatsapp_not_configured` (until the WhatsApp provider is set up, M7).
  - Member preferences: `in_app_marketing_off`, `push_marketing_off`, `whatsapp_marketing_not_opted_in`, `whatsapp_opted_out`, `whatsapp_transactional_off`.
  - Contact: `no_device`, `no_phone`.

Errors:
- `400 invalid_audience` with `detail`, e.g. `field_not_allowed:area`, `unknown_field:x`, `bad_operator:age:contains`, `bad_value:status`, `unknown_preset:x`, `audience_required`, `too_deep`, `too_many_conditions`.
- `400 invalid_purpose`
- `400 owner_has_no_gyms`
- `403 not_your_gym`
- `403 acl_forbidden`

### `POST /admin/communications/audience/preview`

Body: `{ preset?, filter?, purpose? }`. It covers all FitFlex members and returns the same shape, with `senderType: "platform"` and `gymIds: null`.

---

## Filters

A filter is a group, either `{ "all": [ … ] }` (AND) or `{ "any": [ … ] }` (OR). A group's items are conditions `{ field, op, value }` or nested groups, up to 3 levels and 25 conditions.

| Field | Type | Meaning |
|---|---|---|
| `status` | enum: active, expiring_soon, expired, suspended, none | Same rules as the owner Members list. `expiring_soon` means expiring within 7 days. `none` (FitFlex only) means no paid subscription. |
| `plan` | enum: daily, weekly, monthly | Plan of the member's subscription |
| `tier` | text | Tier of the member's subscription |
| `paymentStatus` | enum: approved, pending, rejected, cancelled, none | Latest payment request for that subscription |
| `expiresOn` | date (YYYY-MM-DD, East Africa Time) | |
| `daysUntilExpiry` / `daysSinceExpiry` | number | `daysSinceExpiry` is present only once the subscription has expired |
| `joinedDaysAgo` | number | Gym: first direct subscription at the owner's gyms. FitFlex: account created. |
| `homeGymId` | text | Gym audiences can only narrow within the owner's own gyms |
| `lastVisitDaysAgo` | number | Last check-in, at the owner's gyms for a gym audience. Missing if the member has never visited. |
| `visitsLast30Days` | number | Days with a visit, counted as on the owner engagement dashboard |
| `totalVisits` | number | Check-ins |
| `engagement` | enum: active, slipping, at_risk, lapsed, none | The owner engagement dashboard bands |
| `age`, `gender` | number, enum: male, female, other | Only when the member entered them |
| `subscriptionType`, `passTier` | FitFlex only | |
| `area` | FitFlex only; ops `contains` (gym location text) and `within_km` `{gymId, km}` | The member's home gym, or else the gym they visited most in the last 90 days. Phone GPS is never used or stored. |

- **Operators:**
  - enum/text: `eq`, `neq`, `in`, `not_in`, `exists`
  - number: `eq`, `gte`, `lte`, `between`, `exists`
  - date: `before`, `after`, `between`, `exists`
- **Missing facts:** a condition on a fact the member doesn't have (no birth date, never visited) matches only `exists: false`.
- **Presets:**
  - Gym: `all` (everyone except suspended), `active` (active + expiring soon), `expiring`, `expired`, `recently_expired` (≤30 days), `new` (joined ≤30 days, valid membership), `inactive` (valid membership and no visit for 14+ days, or never visited after 14+ days as a member).
  - FitFlex: the same set plus `pass_holders` and `no_plan`.

---

## Campaigns (M4)

The same routes exist under `/owner/communications` (a gym → its direct members; the gym is always one of the signed-in owner's) and `/admin/communications` (FitFlex → any member). Another gym's campaign, or a FitFlex one, answers `404 not_found` to an owner.

| Method & path | What it does |
|---|---|
| `GET …/overview?gymId` | Members reachable (`preset: all`), campaigns by status, 5 most recent campaigns, channels available (`{ in_app, push, whatsapp }`), limits (`largeSendThreshold`, `marketingWeeklyCap`) |
| `GET …/campaigns?gymId&status&limit` | Newest first. List rows carry `title` and `preset` instead of the full content. |
| `POST …/campaigns` | Saves a draft. Body: `{ gymId?, name?, purpose, audience?: { preset?, filter? }, content?, channels? }`. Only `purpose` is required for a draft. `gymId` is required for owners with more than one gym (`400 gym_required`). |
| `POST …/campaigns/preview` | Previews an unsaved campaign (same body as create): `{ category, counts: { targeted, queued, skipped: {reason: n}, byChannel }, example: { memberName, title, body, ctaLabel, deepLink }, warnings: [{ code, count?, channel? }], largeSendThreshold }` |
| `GET …/campaigns/:id` | `{ campaign, progress: { channel: { status: n } } }` from the delivery ledger |
| `PATCH …/campaigns/:id` | Edits a draft (`409 not_editable` otherwise) |
| `DELETE …/campaigns/:id` | Deletes a draft (`409 only_drafts_can_be_deleted`) |
| `POST …/campaigns/:id/preview` | Previews a saved campaign |
| `POST …/campaigns/:id/schedule` | `{ scheduledAt }`, 5 minutes to 90 days ahead (`400 schedule_too_soon` / `schedule_too_far`) |
| `POST …/campaigns/:id/unschedule` | Scheduled → draft |
| `POST …/campaigns/:id/cancel` | Draft or scheduled → cancelled |
| `POST …/campaigns/:id/send` | `{ sendRequestId, confirmLargeSend? }` → `{ campaign }` with status `sending` and `counts` |

**Content:** `{ title (≤65), body (≤1000), ctaLabel? (≤25), deepLink?: message | membership | renewal | payment | gym, offerName?, discount?, amountTzs? }`.
- Variables: `{{member_name}} {{gym_name}} {{plan_name}} {{expiry_date}} {{amount}} {{discount}} {{offer_name}}`, plus `{{renewal_link}}` when `COMMS_RENEWAL_URL` is set.
- `{{amount}}`, `{{discount}}` and `{{offer_name}}` need their value filled in (`400 invalid_content`, `detail: missing_value:discount`). Unknown variables are refused (`unknown_variable:x`).
- Dates render as DD/MM/YYYY and amounts as `TZS 50,000`.

**Send safety:**
- **Idempotent request:** `sendRequestId` is a client-generated id, 8–100 characters. Repeating it returns `{ campaign, replayed: true }`. Using it on a different campaign gives `409 duplicate_send_request`.
- **No double send:** the move out of draft/scheduled is conditional, so two simultaneous sends can't both queue. The loser gets `409 invalid_state`.
- **Large-send confirmation:** an audience at or above `COMMS_LARGE_SEND_THRESHOLD` (default 200) needs `confirmLargeSend: true`. Without it: `409 confirm_large_send` with `count`.
- **Other refusals:** `409 empty_audience`, `409 nobody_reachable` (with `skipped`), `400 channel_unavailable` (e.g. WhatsApp before M7).
- **Weekly marketing cap:** marketing campaigns skip members who already got `COMMS_MARKETING_WEEKLY_CAP` (default 2) marketing campaigns in 7 days, from any gym or FitFlex, with reason `marketing_cap`. Service messages are never capped.

**What a send writes:** one `CommunicationMessage` row per member per chosen channel.
- `queued`: the member can be reached. The dispatcher (M5) delivers these.
- `skipped`: the member can't be reached, with `skipReason`, e.g. `no_device`, `in_app_marketing_off`, `marketing_cap`.

---

## Templates (M6)

List, get and preview exist under both `/owner/communications` and `/admin/communications`. Create, edit, copy and archive are owner-only.

| Method & path | What it does |
|---|---|
| `GET …/templates?group&purpose&gymId` | `{ templates, groups }`: the gym's own first (newest first), then FitFlex's in catalogue order. Archived templates are left out. `403 not_your_gym`. |
| `GET …/templates/:id` | `{ template }` plus `whatsapp: { ready, byLocale: { en: { ready, reason? } } }`. Another gym's template answers `404 not_found`. |
| `POST …/templates/:id/preview` | `{ gymId?, values?: { offerName?, discount?, amountTzs? } }` → `{ senderName, sampleMember, byLocale: { en: { in_app: { title, body, ctaLabel, deepLink }, push: { title, body, truncated } }, sw: … }, whatsapp, needsValues }` |
| `POST …/templates/preview` | Previews an unsaved template: `{ gymId?, name, purpose, group?, deepLink?, bodies, values? }` |
| `POST /owner/communications/templates` | Saves a gym template: `{ gymId?, name (≤60), purpose, group?, deepLink?, bodies: { en?: { title, body, ctaLabel? }, sw?: … } }`. At least one language is required, and each must pass the content rules (`detail: "sw:missing_value:discount"`). |
| `PATCH /owner/communications/templates/:id` | Edits a gym template. `403 system_template_read_only`, `409 template_archived`. |
| `POST /owner/communications/templates/:id/duplicate` | `{ gymId?, name? }` copies a template into the gym's own (`basedOn` = the source). The apps send the name in the owner's language; without one, a FitFlex template's key becomes a readable name ("We miss you"). |
| `POST /owner/communications/templates/:id/archive` | Hides a gym template. Campaigns keep their own copy of its text. |

**Template fields:** `{ id, key, system, gymId, name, group, purpose, category, deepLink, bodies, variables, channels, status, basedOn, updatedAt }`. `group` is one of membership, payment, marketing, engagement or general. FitFlex templates have ids `tpl_sys_<key>`; the apps show their names from their own translations (`comms.tpl.<key>`).

**Campaigns from a template:** `POST …/campaigns` (and preview) also take `templateId`, `templateValues` and `locale`.
- With no `content`, the template's text is copied in with `locale` as the main language. `purpose` becomes optional.
- The campaign keeps `templateId` (it's in the campaign view) and its own copy of the text.
- Errors: `404 template_not_found` (missing, archived or another gym's). Including `whatsapp` without an approved WhatsApp template gives `400 whatsapp_template_required`.

**Content in two languages:** `content` also takes `locale` (`en`\|`sw`, default `en`) and `translations: { <other>: { title, body, ctaLabel? } }`.
- Translations are checked like the main text. Errors: `unknown_locale`, `translation_same_as_main`, `bad_translations`, `sw_title_required`, `sw:unknown_variable:x`, ….
- Each member gets the language in their communication preferences, or else the main one. Ledger rows record which one they got (`locale`).

---

## WhatsApp (M7)

| Method & path | Who | What it does |
|---|---|---|
| `GET /admin/communications/whatsapp` | admin (`communications`) | `{ provider: { name, configured, setup?: { reason, wanted, missing: [envVarNames] } }, enabled, available, webhook: { path, secretSet }, members: { withPhone, marketingOptedIn, optedOut }, templates: { pending, approved, rejected, paused }, last7Days: { status: n } }`. Never includes credential values. |
| `PUT /admin/communications/whatsapp` | admin | Kill switch: `{ enabled: boolean }` (`400 invalid_enabled`). Every server follows within about 30 seconds. |
| `GET /admin/communications/whatsapp/templates` | admin | `{ provider, templates: [registry rows], expected: [{ templateKey, providerTemplateName, language, category, variables, body, registered: { id, approvalStatus } \| null }] }`. `expected` lists what each FitFlex template needs registered with the provider. |
| `POST /admin/communications/whatsapp/templates` | admin | Registers or updates `{ providerTemplateName (a–z, 0–9, _), language: en\|sw, category: utility\|marketing\|authentication, variables: [campaign variables, in order], approvalStatus?, provider? }`. Unique on provider + name + language. |
| `PATCH /admin/communications/whatsapp/templates/:id` | admin | `{ approvalStatus?, category?, variables? }` |
| `POST /admin/communications/whatsapp/templates/sync` | admin | Pulls approval statuses from the provider (`409 whatsapp_not_configured`). |
| `POST /admin/communications/whatsapp/test` | admin | `{ phone, templateName, language, parameters: [strings] }` sends one approved template. Errors: `409 whatsapp_not_configured` / `whatsapp_disabled`, `400 invalid_phone` / `whatsapp_template_not_approved`. |
| `POST /webhooks/whatsapp/status` | provider | Needs `?token=<WHATSAPP_WEBHOOK_SECRET>` or the `x-whatsapp-webhook-token` header (`403` otherwise, and always when unset). The body is parsed by the provider adapter; the fake provider and tests use `{ statuses: [{ id, status: sent\|delivered\|read\|failed, timestamp?, error? }], messages: [{ from, text }] }`. Returns `{ ok, statuses, unknown, optedOut, optedIn, ignored }`. |
| `GET /webhooks/whatsapp/status` | provider | URL check, for providers that verify with a GET. Same secret. |
| `POST /whatsapp/webhook` | provider | The old address; same as the POST above, and now needs the secret. |

**Removed (audit S2/S3):** `/trainer/send-message/:memberId`, `/trainer/send-booking-reminder/:bookingId`, `/vendor/send-order-confirmation/:orderId`, `/vendor/send-order-ready/:orderId`, `/operator/send-payment-notification`, `/admin/send-bulk-reengagement` and `/test/whatsapp`.

**Campaigns:** the WhatsApp channel needs a template approved for the provider in use. WhatsApp ledger rows carry `payload: { templateName, language, parameters }`. New skip reasons:
- when the campaign is sent: `invalid_phone` and `whatsapp_template_not_approved`;
- at delivery: `whatsapp_disabled`, `whatsapp_opted_out` and `whatsapp_not_configured`.

**Environment:**
- `WHATSAPP_PROVIDER`: unset = not configured; `fake` for development only.
- `WHATSAPP_WEBHOOK_SECRET`.
- A real provider's credential variables are named by its adapter.

---

## History (M8)

The same routes exist under `/owner` (a gym's own messages) and `/admin` (FitFlex's own messages). Scope is enforced server-side.

| Method & path | What it does |
|---|---|
| `GET …/communications/campaigns` | Campaign history (extended): `?gymId&status (comma list)&purpose&channel&from&to&search&cursor&limit` → `{ campaigns: [{ …, createdByName, stats }], nextCursor }` |
| `GET …/communications/campaigns/:id` | Now also returns `stats` and `campaign.createdByName` / `campaign.template` |
| `GET …/communications/campaigns/:id/recipients` | `?channel&status&search&cursor&limit` → `{ recipients: [{ memberId, memberName, outcome, channels: [message] }], nextCursor }` |
| `GET …/communications/messages` | The message log: `?memberId&campaignId&channel&category&messageType&status&from&to&search&gymId&cursor&limit` → `{ messages: [message], nextCursor }` |
| `GET …/communications/messages/:id` | One message in full: `{ message: { …, notificationId, campaign, template, provider: { …, parameters \| failedDevices, errors } } }` |
| `GET …/communications/summary` | Same filters as the log → `{ messages, byChannel: { ch: { status: n, opened } }, totals, byDay: [{ day, messages }] }`. The raw numbers for M10. |
| `GET /owner/members/:memberId/communications` | A member's timeline from the owner's gyms: `?channel&category&messageType&status&from&to&gymId&cursor&limit` → `{ memberId, items: [{ key, campaignId, campaignName, messageType, category, title, body, createdAt, outcome, channels: [message] }], nextCursor }`. `403 not_your_member` if the gym has nothing to do with them. |
| `GET /admin/members/:memberId/communications` | The same, for FitFlex's own messages. |

**A message** is `{ id, campaignId, automationRunId, campaignName, senderType, gymId, memberId, memberName, channel, category, messageType, title, body, locale, deepLink, status, skipReason, failureReason, failurePermanent, attempts, provider: { name: inbox|fcm|whatsapp, messageId, templateName?, language?, devices? }, createdAt, sentAt, deliveredAt, openedAt, clickedAt, failedAt, nextAttemptAt }`.

**Errors and limits:**
- A bad filter answers `400 invalid_filter` with `detail` naming the field.
- `limit` defaults to 20, with a maximum of 100.
- Cursors are opaque.

**Also changed:** `GET /owner/members/:memberId` and `/payments` return only payments at the owner's gyms (audit S1).

---

## Automations (M9) — owners and staff with the `communications` scope

| Method & path | What it does |
|---|---|
| `GET /owner/communications/automations?gymId` | `{ automations: [{ id, gymId, name, trigger, offsetDays, conditions, channels, status: enabled\|disabled\|paused, pausedReason, template: { id, key, name, system, purpose }, lastRunAt, stats: { fired, skipped, messages, reached, failed, opened } }] }`. `stats` cover the last 30 days. Defaults are created (switched off) on the first call. |
| `GET /owner/communications/automations/:id` | One automation (`404` if it isn't this gym's). |
| `PATCH /owner/communications/automations/:id` | `{ status?: enabled\|disabled, channels?: [in_app\|push\|whatsapp], templateId? }`. Turning it on clears an automatic pause. Errors: `400 invalid_status` / `invalid_channels`; `400 template_needs_values` for templates needing offer details, or an amount outside the payment trigger; `404 template_not_found`. |
| `GET /owner/communications/automations/:id/runs?limit&before` | Recent firings: `{ runs: [{ id, memberId, memberName, occurrenceKey, status: queued\|skipped, context, createdAt, channels: [{ id, channel, status, reason }] }] }` |
| `POST /owner/communications/automations/:id/preview` | The template preview for a sample member (same shape as M6). |

**Job:** `communicationAutomations`, hourly at :10. Scheduled sends go out 08:00–20:00 EAT. Each run records a `JobRun` with `job: "communication_automations"`.

**Environment:**
- `COMMS_AUTOMATION_MAX_PER_RUN` (default 300): the runaway guard.
- `COMMS_MARKETING_WEEKLY_CAP`: shared with campaigns.

**History:** automation messages appear in the message log and member timelines with `automationRunId` set and `campaignId` null.

---

## Delivery and member endpoints (M5)

| Method & path | Who | What it does |
|---|---|---|
| `GET /me/notifications` | any signed-in user | The inbox, as before. Rows may now carry `category`, `gymId`, `campaignId`, `clickedAt`. Campaign rows have `type: "campaign"` and `data: { source: "communication", messageId, campaignId, deepLink, gymId, category, ctaLabel, senderName }`. |
| `POST /me/notifications/:id/read` | any | As before. For a campaign message it also records the open in the ledger. |
| `POST /me/notifications/:id/click` | any | The member tapped the button. Body `{ via: "inbox" \| "push" }`. Marks it read and clicked, and moves the ledger row to `clicked`. |
| `POST /me/communications/messages/:id/opened` | any | A campaign push was opened. `:id` is the push's `messageId`. Records the open, including for a push with no inbox copy. |
| `GET /me/communication-preferences` | any | `{ preferences: { inAppMarketing, pushMarketing, whatsappTransactional, whatsappMarketing, whatsappOptedOut, locale, alwaysOn: ["in_app_transactional","push_transactional"], whatsappAvailable } }` |
| `PUT /me/communication-preferences` | any | Any of the four switches (booleans) and `locale` (`en`\|`sw`\|null). Turning `whatsappMarketing` on records consent time and source. `400 invalid_preference` / `invalid_locale`. |
| `POST …/campaigns/:id/schedule` | owner/admin | Now also takes `confirmLargeSend`, like send (`409 confirm_large_send` otherwise). |

**Push data** (FCM data message, all strings): the campaign data above plus `notificationId`, which is the inbox copy to open. It is empty when the in-app copy was skipped.

**Dispatcher:** `communicationDispatcher` job, every minute. It releases due scheduled campaigns, delivers up to `COMMS_DISPATCH_BATCH` (default 200) queued messages, and closes finished campaigns. Each run writes a `JobRun` row with `job: "communication_dispatcher"`.
- **Retries:** after 1, 5 and 30 minutes, then the message fails.
- **Permanent failures:** `no_device`, `push_disabled`, `push_unavailable`.
- **Campaign end states:** `sent`, `partially_failed` (some failed) or `failed` (none delivered).
