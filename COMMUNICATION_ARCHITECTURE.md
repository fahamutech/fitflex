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
| `CommunicationTemplate` | `communicationTemplates` | FitFlex message templates | `gymId` null = system template. `bodies` = `{ en: {title, body}, sw: {title, body} }`. Keys are unique per gym, and among system templates (partial index). |
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
