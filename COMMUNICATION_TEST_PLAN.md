# Communications — Test Plan (M12)

This plan maps every case in the QA brief (Phase 12) and every item in the Definition of Done to the automated test that proves it. It also lists what only a person can check.

**Where the tests live:**
- **Backend:** `fitflex-functions/specs/communications-*.specs.mjs`. They run against the local CI database with `npm test`.
- **Flutter:** `fitflexmobile/test/`.
- **Portal:** `fitflex-portal/tests/e2e/`, using Playwright with the API mocked.

**Suites** (all figures as of 29 Sep 2026):

| Suite | What it covers |
|---|---|
| `communications-qa` (new in M12) | The brief's gaps, plus the Definition of Done walked end to end |
| `communications-security` (M11) | Tenant isolation across every owner route |
| `-segments`, `-audience` | Audiences |
| `-campaigns`, `-delivery` | Campaigns and the dispatcher |
| `-templates` | Templates |
| `-whatsapp` | WhatsApp, via a fake provider |
| `-history` | History |
| `-automations` | Automations |
| `-analytics` | Results and attribution |
| `-rules`, `-schema`, `-trainers` | Shared rules, the schema, and trainer audiences |

**Results:**
- Backend: 759/759.
- Flutter: 484/484.
- Portal: `tsc`, `next build`, and 4 communications Playwright specs.
- `scripts/role-smoke.mjs`: 38/38 against a local server, 5 of them communications checks.

## QA brief → tests

### Audience

| Case | Test |
|---|---|
| Active member | segments: *each preset finds the right direct members*; audience: *gym presets: all leaves out suspended; active includes expiring soon* |
| Expired member | segments: *each preset…* (expired, recently expired); audience: *status = EXPIRED AND expired between 0 and 30 days ago* |
| Expiring member | audience: *status = ACTIVE AND expiry within 7 days*; rules: *expiring soon covers today through 7 days* |
| Multiple gyms | qa: *an owner with several gyms: all of them by default, one when chosen, never double-counted*; security: *without naming a gym, owner A gets only gym A* |
| No matching members | segments: *custom and compound audiences, and one that matches no one*; campaigns: *an empty audience is refused* |
| Large audience | qa: *a large audience (1,200 members): counted, confirmed, queued in chunks and delivered in batches*; campaigns: *large audiences need an explicit confirmation*; delivery: *scheduling a large audience needs the same confirmation*; Flutter: *a large audience must be confirmed before sending* |

### Campaign

| Case | Test |
|---|---|
| Draft | campaigns: *a draft needs only a purpose…*, *a draft can be edited and deleted; a sent campaign can't*; Flutter: *editing a draft keeps its id and saves only what changed* |
| Send now | campaigns: *send queues each member's…*; Flutter: *the full flow: purpose → … → send*; qa: Definition of Done |
| Schedule | campaigns: *schedule, unschedule and cancel*; delivery: *a scheduled campaign goes out when due, once*; Flutter: *scheduling needs a time at least 5 minutes ahead* |
| Cancel scheduled campaign | delivery: *…a cancelled one never does*; campaigns: *schedule, unschedule and cancel* |
| Duplicate campaign | "Use it again" (new in M12): qa: *duplicate: any campaign becomes a new draft…*; Flutter: *a sent campaign can be used again*; portal e2e: *…and uses it again*; security: duplicating another gym's campaign is refused. "Never sent twice": qa: *pressing Send twice, or sending a copy, never messages a member twice*; campaigns: *pressing Send again, or on two devices at once, never sends twice*; schema: *a second Send with the same request id is refused* |
| Invalid content | campaigns: *message content: variables must exist…*, *drafts reject bad audiences, content and channels*; templates: *gym templates are checked like campaign messages*; security: *message limits: title 65, body 1000*; qa: *every deep link… nothing else is accepted* |

### In-app

| Case | Test |
|---|---|
| Delivered | delivery: *each member gets their own message in the inbox and by push, once*; qa: *in-app — delivered, unread, read, CTA tapped and the deep link* |
| Read | qa: same test (through `/me/notifications/:id/read`); delivery: *reading and tapping a message move its ledger rows forward*; Flutter: *reading a message once counts once* |
| Unread | qa: same test (unread count goes up and back down); Flutter: *loads messages and the unread count*, *the bell shows how many messages are unread* |
| CTA | qa: same test (`/click` → `clicked`, `clickedAt`; a stranger gets 404); Flutter: *open a message, read it, and follow its button*; analytics: *CTA completed follows the button* |
| Deep linking | qa: *every deep link a sender can choose reaches the member as that link*; Flutter: *links go only to fixed member screens*, *a message that links nowhere has no button*; push tap → inbox copy: Flutter inbox `openFromPush` tests, qa (push `notificationId`) |

### WhatsApp

Production has no WhatsApp provider yet, so these run on the fake provider.

| Case | Test |
|---|---|
| Valid number | whatsapp: *a WhatsApp campaign sends the approved template, in each member's language*; qa: *one campaign on every channel* |
| Missing number | whatsapp and templates: `no_phone` skip; qa: *one campaign on every channel* (no phone), *a number removed after the message was queued is skipped* |
| Opted-out member | whatsapp: *a provider opt-out stops WhatsApp*, *STOP or ACHA opts the member out…*; rules: *a WhatsApp opt-out blocks every WhatsApp message but not in-app or push*; qa: *one campaign on every channel* |
| Provider failure | whatsapp: *provider results: bad numbers fail for good, outages are retried…* |
| Template unavailable | whatsapp: *right before sending… template approval*; templates: *WhatsApp takes only provider-approved templates*; Flutter: *WhatsApp needs an approved template…* |
| Delivery failure | whatsapp: *delivery receipts move the ledger forward, never back*; delivery: *a temporary push failure is retried with back-off*, *permanent problems fail straight away* |

### Automation

| Case | Test |
|---|---|
| 7 days | qa: *7, 3 and 1 day, expired, payment failed and inactive: each fires its own message, once*; automations: *each trigger has a window…*, *the hourly run sends each due reminder once* |
| 3 days | qa: same test |
| 1 day | qa: same test; automations: *each trigger has a window…* |
| Expired | qa: same test; automations: *each trigger has a window…* |
| Payment failed | qa: same test; automations: *a rejected payment sends a recovery message with the amount*, *Selcom: … a failed payment the payment event* |
| Inactive | qa: same test; automations: *each trigger has a window…* (14 days, never visited), *a member gets at most one automation message a day* |

### Security

| Case | Test |
|---|---|
| Owner A cannot see Owner B's members | security: *owner A never reads or changes gym B's data* (all 36 owner routes, with gym B's ids), *without naming a gym…*; segments: *an owner never sees or targets another gym's…*, *a FitFlex pass holder who visits the gym is never in its audience*; history: *timeline… members the gym doesn't know* |
| Owner A cannot message Owner B's members | security: *a campaign's audience is the gym's own direct members, whatever the filter*, *a gym message for someone who isn't that gym's member is never stored or sent*; campaigns: *another gym's…* |
| Admin permissions work correctly | security: *FitFlex routes need an admin, with the permission on their account now*; segments: *portal staff need the communications scope*; trainers: *gym owners cannot address trainers*; smoke: *members and trainers are refused the Communication Center* |

## Definition of Done → tests

qa's *Definition of Done* test walks most of this through the real endpoints, with production's settings today (push and WhatsApp off).

**Gym owner can:**

| Item | Proven by |
|---|---|
| select a gym | DoD (overview `?gymId`); qa *several gyms*; portal e2e (gym picker) |
| view members | DoD (`/owner/members`) |
| segment members | DoD (catalogue, expiring and expired previews); segments and audience suites |
| create a campaign | DoD (from a template) |
| preview the message | DoD (a real member's copy) |
| select in-app/WhatsApp | DoD (in-app; WhatsApp refused until set up); qa *one campaign on every channel* (with WhatsApp on) |
| send immediately | DoD |
| schedule a campaign | DoD; delivery suite |
| view campaign status | DoD (`sending` → `sent`) |
| see delivery results | DoD (campaign analytics); analytics suite; portal e2e |
| view communication history | DoD (campaign list, message log, member timeline); history suite |
| create/use templates | DoD; templates suite |
| configure automations | DoD (switch on) |

**Member can:**

| Item | Proven by |
|---|---|
| receive in-app communication | DoD; qa in-app test |
| receive push where enabled | qa in-app test and *every channel* (wired world); delivery suite |
| receive WhatsApp where eligible/consented | qa *every channel*; whatsapp suite (marketing needs opt-in) |
| open the relevant FitFlex screen | DoD (deep link `renewal`); qa deep links; Flutter routes |
| manage communication preferences | DoD (switching offers off → the next promotion skips them with `in_app_marketing_off`); delivery: *preferences…* |

**System can:**

| Item | Proven by |
|---|---|
| identify expiring memberships | DoD (expiring preset) |
| identify expired memberships | DoD (expired preset) |
| trigger automated messages | DoD; qa automation matrix |
| prevent duplicate automated messages | DoD (second run fires 0); qa automation matrix; schema: *an automation fires once per member per occurrence* |
| log delivery status | DoD (log shows `clicked`); history suite |
| isolate gyms | DoD (no gym A message to anyone else); security suite |
| handle failures | delivery: *permanent problems fail straight away*; whatsapp: *provider results…*; qa: *a number removed after queueing* |
| retry transient failures | delivery: *a temporary push failure is retried with back-off, then given up*; whatsapp: *outages are retried* |
| provide audit logs | DoD (`communication_campaign_sent`, `_scheduled`, `automation_updated`); qa duplicate (`communication_campaign_duplicated`) |

## Running them

- **Backend (all):**
  ```bash
  cd fitflex-functions && npm test
  ```
  Needs the local CI Postgres.
- **Backend (one suite):**
  ```bash
  FITFLEX_USE_CI_DB=1 KYC_ENFORCEMENT=off node --test --test-force-exit specs/communications-qa.specs.mjs
  ```
- **Smoke test:** start a local server, then run `scripts/role-smoke.mjs` against it. It refuses anything but localhost.
  ```bash
  FITFLEX_USE_CI_DB=1 bfast fs serve --port 3000
  ```
  ```bash
  node scripts/role-smoke.mjs
  ```
- **Flutter:**
  ```bash
  cd fitflexmobile && flutter analyze && flutter test
  ```
- **Portal:** the API is mocked, so only `next dev` is needed.
  ```bash
  cd fitflex-portal && npx playwright test owner-communications admin-whatsapp admin-comms-trainers
  ```
  - Playwright isn't part of CI.
  - The Playwright config starts a backend from `../fitflex-functions` unless one is already running on port 3000.

## Checked by a person, before and after rollout

Automated tests can't cover these:

1. **Push on real phones.**
   - Set `PUSH_NOTIFICATIONS=on` in production; it's still off.
   - Send a small in-app + push campaign to test accounts on Android and iOS.
   - Tapping the push should open the inbox message and then the linked screen.
2. **WhatsApp with a real provider**, once one is chosen:
   - Register and approve the templates; the admin WhatsApp page shows what's missing.
   - Send a test from that page.
   - Confirm that delivery receipts arrive through the webhook, and that STOP and ACHA opt the member out.
3. **Swahili wording** of the new strings in both apps and the portal. This is still open from earlier milestones.
4. **Small screens:** check the composer, campaign detail (including "Use again") and the results card on a small Android phone.
5. **Time zone:** automations send only between 08:00 and 20:00 Dar es Salaam time. Check the first real run's `JobRun` row and the times in the member's inbox.
