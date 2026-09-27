# Gym Communication & Member Engagement — Architecture

**Status:** M1–M2 are in fitflex-functions#17. M3–M5 are on branches `feat/communications-campaigns` (functions, stacked on #17) and `feat/communication-center` (mobile and portal). Later milestones extend this document.
**Related:** `COMMUNICATION_IMPLEMENTATION_AUDIT.md` (decisions in §16), `COMMUNICATION_IMPLEMENTATION_PLAN.md`.

---

## 1. Senders and audiences

| Sender | `senderType` | `gymId` | Who they can reach |
|---|---|---|---|
| A gym (owner, or staff with the `communications` gym scope) | `gym` | required | **That gym's direct members only.** A direct member has a `direct_sub` subscription at the gym, in any status. FitFlex pass holders who visit the gym stay visible on the owner's Members list, tagged `fitflex`, but can't be messaged by the gym (D1). |
| FitFlex (admins with the `communications` portal scope) | `platform` | must be null | All members. |

The database enforces the `senderType`/`gymId` pairing with CHECK constraints on campaigns, automations and messages. The "direct members only" rule belongs to the segment service (M2), and is also enforced server-side.

## 2. Data model (migration `20261002090000-communications.cjs`)

```
CommunicationCampaign ──< CommunicationMessage >── User (member)
        │                        │    └── Notification (in-app inbox row)
        └── CommunicationTemplate ── WhatsAppTemplate (provider-approved)
CommunicationAutomation ──< AutomationRun ──< CommunicationMessage
CommunicationPreference (1 per member)      JobRun (scheduled-job log)
```

| Table | Collection | Purpose | Key rules |
|---|---|---|---|
| `CommunicationCampaign` | `communicationCampaigns` | One send, now or scheduled | `status` starts at `draft`; allowed changes are in `canTransitionCampaign`. `sendRequestId` is unique, so a double-tapped Send is refused. `audience`, `content` and `counts` are jsonb. `channels` is `text[]`. |
| `CommunicationMessage` | `communicationMessages` | **Delivery ledger and send queue**: one row per member, per channel, per source | Unique `(campaignId, memberId, channel)` and `(automationRunId, channel)`, so a retried job can't message anyone twice. `channel` ∈ in_app/push/whatsapp and `category` ∈ transactional/marketing are CHECK-constrained. Delivery timestamps: sent, delivered, opened, clicked, failed. `failurePermanent` stops retries. |
| `Notification` (existing, extended) | `notifications` | The member's in-app inbox | New nullable columns: `category`, `gymId`, `campaignId` (set to null if the campaign is deleted) and `clickedAt`. Existing inbox rows and APIs are unchanged. |
| `CommunicationTemplate` | `communicationTemplates` | FitFlex and gym message templates | `gymId` null = system template. `bodies` = `{ en: {title, body, ctaLabel?}, sw: {…} }`. Keys are unique per gym, and among system templates (partial index). M6 (`20261004090000-communication-template-details.cjs`) adds `group` (membership/payment/marketing/engagement/general), `deepLink` and `basedOn` (the template a copy came from; set to null if that's deleted). |
| `WhatsAppTemplate` | `whatsappTemplates` | Registry of provider-approved WhatsApp templates | `approvalStatus` pending/approved/rejected/paused. A FitFlex template goes out on WhatsApp only through an **approved** mapping. Deleting a registry row unlinks templates, but doesn't delete them. |
| `CommunicationPreference` | `communicationPreferences` | Per member; `id` = the member's user id | Defaults: in-app and push marketing on, WhatsApp transactional on, **WhatsApp marketing off**. Consent is recorded (`whatsappMarketingConsentAt/Source`), as is a STOP opt-out (`whatsappOptedOutAt`). `locale` en/sw. |
| `CommunicationAutomation` | `communicationAutomations` | Lifecycle triggers | Starts `disabled`. `trigger` + `offsetDays` (e.g. `membership_expiring`, 7) is unique per gym, and per platform (partial index). |
| `AutomationRun` | `automationRuns` | One firing per member per occurrence | **Unique `(automationId, memberId, occurrenceKey)`**, e.g. `sub_123:T-7`. A rerun hits the constraint instead of sending again. |
| `JobRun` | `jobRuns` | Scheduled-job observability | status running/ok/failed, stats jsonb, error |

Deletion behaviour: every row cascades from its gym or member. Links to templates, creators and notifications are set to null.

## 3. Shared rules

- **`src/shared/communications.mjs`** holds the vocabulary: senders, channels, categories, purposes, statuses, triggers and template variables. It also holds these rules:
  - `categoryForPurpose`: renewal, payment and announcement are transactional. Promotion, engagement and general are **marketing**, so a message can't be labelled "general" to get past an opt-out.
  - `canTransitionCampaign`: finished campaigns never change. Only the dispatcher moves a campaign out of `sending`.
  - `validSender`
  - `effectivePreferences`
  - `channelAllowed(prefs, channel, category)`: transactional in-app and push are always allowed. Marketing needs the channel's marketing switch. WhatsApp marketing needs opt-in, and a STOP opt-out blocks all WhatsApp.
- **`src/shared/member-status.mjs`** is the single definition of direct-member status (`suspended / expired / expiring_soon (≤7 days) / active`), plus `daysLeft`, `DIRECT_SUB_TYPE` and `FITFLEX_VISIT_TYPES`. It's extracted unchanged from `member-management-service`, which now uses it. The M2 audience segments will use the same rules, so the owner's Members list and a campaign audience can't disagree.

## 4. Access control

- Gym staff scope: `communications` has been added to `GYM_STAFF_ACL_SCOPES`. Owners (`gym_operator`) are always allowed.
- Portal (admin) scope: `communications` has been added to `PORTAL_ACL_SCOPES`.
- The mobile staff-permission list (`kGymStaffAclScopes`) and the portal Users page scope list are UI, so they change in M3.

## 5. Channels

- **In-app** is the dependable channel: `Notification` plus `/me/notifications`.
- **Push** reuses the FCM fan-out in `notification-service`. It's Android only, and off unless `PUSH_NOTIFICATIONS=on`.
- **WhatsApp**: there's no WhatsApp Business account yet (D2). The provider seam and the consent and template registry are in place, and live sending comes later.
  - The known `phoneNumber`/`phone` bug in `whatsapp-service` is **deliberately not fixed yet**. Fixing it would make the ad-hoc trainer, operator and vendor WhatsApp routes actually reach members, and those routes have no relationship checks (audit S2).
  - Both fixes land together in M7.

## 6. Audiences (M2)

- **`src/shared/audience.mjs`** (pure): the field catalogue, gym and FitFlex presets, `validateFilter` (a whitelist of fields, operators and values, with depth and size limits), `buildAudienceFilter` (preset AND filter) and `matchesFilter`.
- **`src/services/segment-service.mjs`** builds each member's facts, then applies the filter.
  - **Gym:** the owner's direct members only. `latestDirectSubscriptionsByMember` is the same function the Members list uses.
  - **FitFlex:** all members, using `currentSubscription`, the same function the member's own app uses.
  - Records are read with scoped SQL: subscriptions at the owner's gyms, check-ins at those gyms, and payment requests for those subscriptions.
  - Facts are derived only through shared rules:
    - status and expiry from `directMembershipStatus` / `daysLeft`
    - engagement and 30-day visits from `engagementFrom`, the owner engagement dashboard
    - EAT days from `localDay` / `daysBetween`
- **Consolidated rules** that existing code also moved onto:
  - `ownerGymIds`, `latestDirectSubscription[sByMember]` (member-management)
  - `currentSubscription` (subscription-service `me()`)
  - `daysBetween` (gym-sharing)
- **Gym scope:** it comes from the signed-in owner or staff member. A request `gymId` can only narrow it, or is refused with `403`. A `homeGymId` condition can only narrow within the owner's gyms.
- **Channel reach** applies `channelAllowed` with the member's preference row. It also checks device tokens (push), a phone number (WhatsApp), and whether the channel is set up on the server (push flag; WhatsApp is not configured until M7).
- **Scale:** a gym audience reads that gym's rows only. A FitFlex-wide audience reads all members' subscriptions plus 90 days of check-ins. That's fine at pilot scale; revisit with SQL-side aggregation if member counts grow into the tens of thousands.
- **API:** see `COMMUNICATION_API.md`.

## 7. Campaigns (M4)

- **`src/services/campaign-service.mjs`:** create, update, remove, schedule, unschedule, cancel, preview, send, list, get and overview. One service serves both senders; the sender always comes from the signed-in user.
- **`plan(sender, campaign)`:** resolves the audience, asks the segment service for per-member channel decisions (`reachByMember`), applies the weekly marketing cap, and renders each member's own message (`messageValues` / `renderText` in `shared/communications.mjs`). Preview and send both use it, so a preview always matches what Send queues.
- **Send runs in one transaction:**
  1. A conditional status change, `draft|scheduled → sending`, together with `sendRequestId` and `counts`.
  2. An insert of the ledger rows with `ON CONFLICT DO NOTHING`.
- **Scheduled campaigns** are stored with `scheduledAt`. The M5 dispatcher expands them at that time, using the same `plan`.

## 8. Screens (M3–M4)

- **Flutter owner app** (`lib/screens/owner/communications/`):
  - Layout follows the Members feature: `data/` (models and repository), `communication_controller.dart` (ChangeNotifier controllers), pages, and `widgets/`: `AudienceSelector`, `MessageComposer`, `ChannelSelector`, `CampaignPreviewView` / `InAppMessageCard`, `CampaignStatusPill` / `CampaignTile`, `DeliveryStats`.
  - Entry: a Home tile ("Messages to members"), shown to owners, and to staff with the `communications` permission (added to the staff permission list).
  - Routes: `/owner/communications`, `/owner/communications/new`, `/owner/communications/campaigns/:id`, and `…/edit`.
  - The composer creates one `sendRequestId` per message and sets its "submitting" flag before any network call, so double taps and retries can't send twice.
- **Portal** (`src/components/communication-center.tsx`):
  - One component serves `/owner/communications` (operator nav; gym staff need `communications`) and `/admin/communications` (admin nav, `aclScope: 'communications'`, which is also added to the Users page scope list).
  - Views switch inside the page, because the static export can't serve `[id]` routes.
  - Admins also get the FitFlex-only presets and an area filter.
- **Strings:** all new strings are in both apps' i18n files, in English and Swahili. A Flutter test fails if a `comms.*` key lacks Swahili.

## 9. Delivery (M5)

- **`src/services/delivery-service.mjs`** is the dispatcher. It delivers through the **existing** `notification-service`, which gained two primitives: `writeInbox` (the inbox writer `notify()` now also uses) and `sendPush` (its FCM fan-out, now exported).
  - `notify()` behaves exactly as before, and existing notifications are untouched.
  - The inbox now reads one member's rows instead of the whole table.
- **Claiming:** `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`. Due `queued` rows and rows stuck in `sending` for more than 10 minutes are claimed; the attempt count goes up.
  - A test holds a row lock and shows the claim skips it rather than waiting. It fails if `SKIP LOCKED` is removed.
- **Idempotency:**
  - In-app messages get inbox id `ntf_<messageId>`, so a retry finds the existing row.
  - Push is at-least-once: a crash between FCM accepting the push and the ledger update can repeat that one push.
- **Scheduled campaigns:** `campaignService.releaseDue()` works out the audience at release time and queues it in the same transaction as leaving `scheduled`. It runs as the campaign's sender (the gym, or FitFlex), not the person who pressed Schedule.
- **Opens and taps:** the notification service calls `onOpened` / `onClicked` hooks. The delivery service uses them to move ledger rows forward, never backwards: `delivered → read → clicked`.
  - Opening a push marks the push opened and its inbox copy read; it doesn't count as a click.
- **Preferences:** `communication-preference-service.mjs`.

**App side:**
- **Inbox** (`lib/shared/inbox/`): one `InboxController` for the whole app, provided through `AppScope.inbox` and loaded on sign-in, cleared on sign-out.
  - Screens: `InboxPage` (filters), `InboxMessagePage` (marks read; its button records a click and opens a fixed screen: membership/renewal → Passes, payment → Payment, gym → the gym's page), and `InboxBellButton` (unread badge) in the member app bar and the owner bar.
  - Before this, the owner bar's bell always showed a dot and a "no notifications" note.
- **Push taps:** `PushService.onOpen` / `onForeground` use `onMessageOpenedApp`, `getInitialMessage` and `onMessage`. The app root opens the message, or the linked screen for a push with no inbox copy. Member-shell screens are opened with `go`, like the rest of the app.
- **Settings:** `MemberMessageSettingsPage` is at Privacy & data → Messages & offers.

## 10. Templates (M6)

- **Catalogue:** `src/shared/communication-templates.mjs` defines 18 FitFlex templates in five groups, each with English and Swahili text, a purpose, a screen to open, and the WhatsApp template name it would map to (`fitflex_<key>`).
  - `templateService.syncSystemTemplates()` upserts them into `CommunicationTemplate` with id `tpl_sys_<key>` and `gymId` null. It runs once per process, before the first template read.
  - Changing the catalogue in code updates the rows. Gym templates are never touched.
- **Gym templates:** owners create their own or copy a FitFlex one (`basedOn` records the source), then edit or archive them. FitFlex templates are read-only (`403 system_template_read_only`). Admins can browse, preview and use templates, but only gyms create them.
- **Starting a message from a template:** the campaign stores `templateId` and **its own copy** of the text. Editing or archiving the template later doesn't change a draft or a sent message.
  - The owner's language becomes the main text and the other language goes in `content.translations`.
  - The purpose comes from the template. Offer values (`offerName`, `discount`, `amountTzs`) are passed as `templateValues`.
- **One message, two languages:** `content = { title, body, ctaLabel?, locale, translations?: { <other>: { title, body, ctaLabel? } } }`. Each language is checked like the main one: variables, lengths, and both title and body present.
  - When a campaign is sent, `segmentService.localesByMember` reads each member's `CommunicationPreference.locale`. The ledger row is written in that language and records it in `CommunicationMessage.locale`.
  - Members with no known language get the main text. Plan names are localized (Kila mwezi, …).
  - The apps save the member's app language to `/me/communication-preferences` on sign-in and whenever it changes.
- **Preview:** `POST …/templates/:id/preview` (and `…/templates/preview` for an unsaved template) renders every language for a sample member ("Amina", Monthly plan) with the sender's gym name.
  - It returns the in-app message and the push as the phone would show it: a 65-character title, the body cut at 178 characters, and a `truncated` flag.
  - Offer values not yet filled in show as `[discount]`, and `needsValues` lists them.
- **WhatsApp (no integration yet, D2):** every template reports `whatsapp: { ready, byLocale }` from the `WhatsAppTemplate` registry.
  - A campaign can include the WhatsApp channel only if it started from a template with an **approved** mapping in the needed language (`400 whatsapp_template_required`). This is checked on send, on schedule, and again when a scheduled campaign is released.
  - Free text never goes to WhatsApp. M7 adds the provider.
- **Screens:**
  - **Flutter:** a Templates tab in the Communication Center, filtered by category. It opens `TemplateDetailPage` (preview per language; use, copy, edit, archive) or `TemplateEditorPage`.
    - Routes: `/owner/communications/templates/new`, `/templates/:templateId` and `/templates/:templateId/edit`.
    - The composer's message step has "Start from a template" (a bottom-sheet picker listing the message's purpose first) and English/Swahili tabs.
  - **Portal:** the same in `communication-templates.tsx`: a Templates tab, the detail page, the owner-only editor with a live preview, the picker dialog, and a `BilingualText` field set shared with the composer.

## 11. WhatsApp (M7)

There is still no WhatsApp Business account (D2), so WhatsApp is built end to end **except** a real provider adapter. Going live is then configuration.

- **The existing WhatsApp code:**
  - `whatsapp-service.mjs` (Africa's Talking) has an unverified API contract and reads a phone field that doesn't exist.
  - The `fitflex-whatsapp` hook is never called.
  - Neither was reused for campaigns. The legacy service still serves the internal OTP route and admins' re-engagement sends. Routing those through the provider is a go-live step.
- **Provider seam** (`src/integrations/whatsapp/provider.mjs`):
  - The contract is `validateRecipient`, `sendTemplate`, `sendMessage`, `getDeliveryStatus`, `listTemplates`, `parseWebhook` and an optional `verifyWebhook`. Results are normalised: `{ ok, providerMessageId }` or `{ ok: false, error, retryable }`.
  - `WHATSAPP_PROVIDER` picks the provider:
    - unset → `not_configured` (the default; nothing is sent);
    - `fake` → development only, refused when `NODE_ENV=production`.
  - A real adapter is added with `registerWhatsAppProvider(name, create, { requiredEnv })`. Its credentials come only from the environment. If a variable is missing, WhatsApp stays off and the admin page names the variable, never its value. An unknown provider name also leaves WhatsApp off.
- **Phone numbers:** `src/shared/phone.mjs` turns any way a member typed their number into E.164 (a local number is taken as Tanzanian). The audience count already skips members with no number or an unusable one (`no_phone`, `invalid_phone`).
- **Sending a campaign:**
  - A WhatsApp ledger row stores `payload = { templateName, language, parameters }` (new jsonb column). The parameters are the member's values, in the order the provider template numbers them.
  - The language is the member's own if that version is approved, otherwise one that is.
  - WhatsApp carries the **approved wording**, not the sender's edits, and the row's title and body record that wording.
  - Approvals count only for the provider in use.
- **Delivery** (`whatsapp-channel-service.mjs`, called by the dispatcher): right before sending it checks again that WhatsApp is configured and switched on, the member still allows it, the number is usable, and the template is still approved.
  - If any check fails, the row is **skipped** with a reason (`whatsapp_disabled`, `whatsapp_opted_out`, `whatsapp_template_not_approved`, …), not failed.
  - Provider results:
    - `retryable` errors retry on the M5 schedule;
    - other errors fail the row for good;
    - `recipient_opted_out` opts the member out.
  - Sending is at-least-once, like push. The ledger id is passed as `reference` so a provider that supports it can drop a repeat.
- **Webhook:** `POST /webhooks/whatsapp/status`. The old inbound URL `/whatsapp/webhook` does the same. Both require `WHATSAPP_WEBHOOK_SECRET` as `?token=` or `x-whatsapp-webhook-token`, and refuse every call when it's unset.
  - Receipts move ledger rows forward by `providerMessageId`: `sent → delivered → read`. A late `failed` never undoes a delivered message.
  - **STOP / STOPALL / UNSUBSCRIBE / CANCEL / ACHA / SITISHA** sets `whatsappOptedOutAt` and turns both WhatsApp switches off for every member with that number. Queued WhatsApp rows are skipped, and a confirmation goes back in the member's language.
  - **START / ANZA / UNSTOP** lifts the opt-out and turns service messages back on. Offers stay off until the member turns them on in the app, which records consent (D3).
- **Kill switch:** `PlatformSettings.communications.whatsappEnabled` (new jsonb column).
  - It is read with SQL and cached for 30 seconds, so every server follows it. It is kept out of the settings collection, whose admin save writes back its cached row.
  - When off, the audience count shows WhatsApp as unavailable and the dispatcher skips WhatsApp rows.
- **Admin** (`/admin/communications/whatsapp…`, `communications` ACL):
  - Status: provider, setup reason, missing variable names, kill switch, webhook secret set or not, members opted in or out, template approvals, the last 7 days.
  - The template registry: what each FitFlex template needs per language (provider name, category, numbered variables). Admins can register it, change its approval status, or sync from the provider.
  - A test send.
  - Everything is audit-logged; test sends log a masked phone number.
- **Security (audit S2/S3):**
  - Removed `/trainer/send-message/:memberId`, `/trainer/send-booking-reminder/:bookingId`, `/vendor/send-order-confirmation|ready/:orderId`, `/operator/send-payment-notification`, the placeholder `/admin/send-bulk-reengagement` and the open `/test/whatsapp`. They let any trainer, vendor or operator WhatsApp any user, and no app called them.
  - The inbound webhook is no longer unauthenticated.
- **Apps:** WhatsApp can be picked only when it's available **and** the message started from a template approved for it. Both composers explain why otherwise. The portal's admin Communication Center has a WhatsApp tab.

## 12. Communication history (M8)

**No second history store.** The `CommunicationMessage` ledger has been the record since M1: one row per member, per channel, per campaign (or automation run). Each row holds status, every timestamp (`createdAt`, `sentAt`, `deliveredAt`, `openedAt`, `clickedAt`, `failedAt`, `nextAttemptAt`), `failureReason`/`failurePermanent`, `skipReason`, `attempts`, the rendered `title`/`body`/`locale`, `notificationId` (the inbox copy), `providerMessageId`, and `payload` (provider details).
- M8 adds a read layer, `communication-history-service.mjs`, and fills the one gap: **FCM message IDs** were being thrown away.
- `sendPush` now also returns `messageIds` and `errors`, which is additive; the inbox and `notify()` are unchanged.
- Push rows store the first FCM ID as `providerMessageId` and `payload.fcm = { messageIds, failed, errors }`.
- A push FCM refuses still fails as `push_failed`, with FCM's error codes kept in `payload.fcm.errors`.

**Data flow:**
```
campaign send ──► ledger rows (queued / skipped + reason)
dispatcher    ──► sent / delivered / failed (+ reason, provider id, FCM ids, retries)
inbox read/tap, WhatsApp receipts ──► read / clicked / delivered (openedAt, clickedAt)
                         │
history service (SQL, scoped) ──► campaign list & detail stats, recipients,
                                  member timeline, message log, one message,
                                  summary (by channel / status / day) ──► M10
```

**Views:**
- **Campaign history:** the existing campaign list and detail, extended.
  - Filters: status (comma list), purpose, channel, created from/to, and a search over name and title.
  - Keyset paging.
  - Each campaign gets `createdByName` and live `stats` from the ledger: `targeted` (distinct members), `messages`, `byChannel[status]` and `totals`.
  - `totals` are: `sent` = sent, delivered, read or clicked; `delivered` = delivered or later; `opened`; `clicked`; `failed`; `skipped`; `pending`.
  - Push only ever reaches `sent`, because FCM doesn't confirm delivery.
  - Detail also gets `template`.
- **Recipients:** one row per member with each channel's row and an `outcome` (`reached` > `pending` > `failed` > `skipped`). Filterable by channel, status and name; paged alphabetically.
- **Member timeline:** one item per communication (campaign or automation run), newest first, with its channels side by side. Filterable by channel, category, purpose, status and dates.
- **Message log:** flat rows, newest first. Filters: member, campaign, channel, category, purpose, status (a ledger status, or `pending` | `reached` | `opened`), created from/to (a bare date means the whole day), member-name search and `gymId`. This is the feed M10 reads.
- **One message:** everything above, plus the campaign, the template, the WhatsApp parameters, and FCM device and error counts.
- **Summary:** totals by channel and status, and messages per day, for any filter window. These are the raw numbers for M10, not a dashboard.
- **Paging:** opaque cursors on (createdAt truncated to milliseconds, id), so rows written in the same millisecond are never skipped or repeated.

**Authorisation** (in the service, never the client):
- **Gym owners and staff** (`requireGymAcl('communications')`) see rows with `senderType = 'gym'` whose `gymId` is one of their gyms. A `gymId` filter must be one of theirs (`403 not_your_gym`).
- **FitFlex admins** (`requireAcl('communications')`) see `senderType = 'platform'` only.
- Another gym's campaign or message answers `404 not_found`.
- A member timeline also requires the gym to know the member (a membership, a visit, or a message from one of its gyms), otherwise `403 not_your_member`. Staff without the communications scope get 403, and the app hides the section.
- No credentials exist in the ledger, so none can be shown: only provider names and message references.

**Audit S1** is fixed here, as planned. Owner member detail and payment history now show only payments for subscriptions at the owner's gyms, not the member's FitFlex pass, trainer sessions or payments to other gyms.

**Screens:**
- **Flutter:**
  - A Messages card on the owner's member detail page (latest three, "View all"), opening a timeline with filters.
  - Campaign detail shows the numbers, creator and template, and a "See who got it" recipients page.
  - Any message opens in full in a bottom sheet.
  - Campaign list rows show sent, opened and failed.
- **Portal:**
  - A History tab (the message log) with filters.
  - The campaign list gets filters and "load more".
  - Campaign detail gets its numbers and recipients.
  - Member timelines and a message dialog, reached from the log or the recipients.
