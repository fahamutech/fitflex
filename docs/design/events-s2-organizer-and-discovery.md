# Events S2: organizer onboarding, event management (portal) and member discovery (mobile). Design spec

**Status:** Draft for owner review · **Date:** 2026-10-22 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 2 of `docs/marathon/reuse-map.md` §9
**Repos:** `fitflex-portal` (organizer area + `/admin/events`), `fitflexmobile` (member discovery + detail), `fitflex-functions` (routes this spec expects, §14)
**Ships:** dormant. Server `EVENTS_MODULE` off; mobile `EVENTS_DISCOVERY` dart-define off; portal `NEXT_PUBLIC_EVENTS_MODULE` off (§13). With the flags off nothing in this spec renders.
**Binding inputs:** `docs/marathon/decisions.md` D1–D5 (approved), D6–D10 (defaults); PRD v1.0 §5.1 EVT-*, §5.2 ORG-*, §6, §12 Epics A and B; reuse map §1.2, §1.3, §2, §5.3, §5.4, §7.
**Not in scope (later slices):** registration, quotes, orders, payment (S3/S4); roster, kit, bibs, API keys, webhooks (S5); runs, results, medals, rewards (S6). The member "Register" button exists here but is disabled (§11.6).

Sources read (RC heads of 2026-10-20/22 in detached worktrees; no branch switched): portal `src/components/shared.tsx`, `stepper.tsx`, `dialog.tsx`, `data-table.tsx`, `datetime-input.tsx`, `image-upload.tsx`, `location-picker.tsx`, `Shell.tsx`, `src/lib/vendor.ts` (`VENDOR_AREAS`), `src/lib/kyc.ts`, `src/lib/api.ts` (`userContact`, `kycCases`), `src/lib/i18n.ts`, `docs/design-system.md`; mobile `docs/design-system.md`, `lib/shared/design_tokens.dart`, `components/ff_badge.dart`, `ff_pill.dart`, `ff_filter_chip.dart`, `ff_segmented.dart`, `ff_photo_hero.dart` (`FFHeroBand`), `hero_images/hero_slots.dart`, `member_activity_tab.dart`, `member_gyms_tab.dart`, `widgets/gym_filters.dart`, `gym_card.dart`, `home_feed.dart`, `discovery_loader.dart`, `api_error_message.dart`, `formatters.dart`, `router.dart`, `i18n.dart`; functions `functions/partner-kyc.mjs`, `src/shared/partner-kyc-requirements.mjs`, `pagination.mjs`, `feature-flags.mjs`; `canon/04-marketing/design-system.md`; memory notes `design-system-redesign`, `design-system-v2-accents`, `swahili-review`.

Conventions in this document: **EN** = English copy, **SW** = Swahili draft (**every Swahili string needs native review**; plan for 20–30 % more length). "Backend field" lines list data this UI needs so `fitflex-planner` / `contract-checker` can confirm them; nothing here is a claim that a field exists.

---

## 1. What exists today (and what this reuses)

| Need | Reused as is | Why not something new |
|---|---|---|
| Portal partner area with role-gated nav | `VENDOR_AREAS` + `vendorAreaOpen()` + `vendorNav()` pattern in `Shell.tsx` / `src/lib/vendor.ts`; `NavItem.aclScope` for admin | Same shape: a list of `{href, permission}` filtered by what `/organizer/me` returns. New list `ORGANIZER_AREAS` in `src/lib/organizer.ts`. |
| Partner verification | Partner KYC (`/me/kyc/*`, `/admin/kyc?case=`), `src/lib/kyc.ts` labels, `kyc-case.tsx` admin view | D3/D10: organizer = `PartnerKycCase.partnerType = 'event_organizer'`, vendor checklist + `event_permit` document. The admin side needs only a new partner-type label. |
| Wizard | `Stepper` (`src/components/stepper.tsx`): clickable up to `maxReached`, `aria-current="step"`, mobile "n / N · label" line | Fits a 7-step form exactly. |
| Lists | `DataTable` (sort, filter, page sizes 10/25/50, `label`, `stickyActions`, `dense`) | |
| Confirmations | `Dialog`, `ConfirmDialog` (focus trap, Esc, returns focus) | |
| Form controls | `Field`/`Input`/`Select`/`Textarea`/`Checkbox`/`Radio`, `DateTimeInput` (ISO instant in/out), `LocationPicker` (`lat`,`lng`,`onChange`), `ImageUpload` (WebP compress, `maxFiles`), `SearchableSelect` | |
| Status chips | `Badge` tones `default/gray/brand/success/danger/warning/info`, always with text | PRD §6 "text-first". |
| Feedback | `useToast()`, `Alert`, `EmptyState`, `ErrorState`, `Skeleton*`, `MetricCard`, `PageHeader` | |
| Money / dates | portal `money(v, 'TZS')` → "TSh 25,000"; mobile `formatCurrency` → "TSh 25,000", `formatDate`/`formatDayMonth`/`formatTimeOfDay` (EN/SW month names) | Event times must show in the **event's** timezone (§12). |
| Mobile list screen | `member_gyms_tab.dart`: search field, `FFFilterChip` rows, `FFSkeletonList`, `FFErrorState`, `FFEmptyState`, `RefreshIndicator`, `GymFilter` pure model, `DiscoveryLoader` debounce | Events discovery copies the structure with an `EventFilter` model. |
| Mobile card imagery | `FFRemoteImage` (as `gym_card.dart`), `FFBadge` tones incl. `fuel` and `onPhoto` | |
| Mobile hero | `FFHeroBand(photo:)` (band on phones, rounded panel ≥ 840 wide), `FFHeroPhoto` enum + `heroSlotOf` | Needs one new slot `events` (§11.1) and one new optional parameter (§11.5). |
| Mobile section switcher | `FFSegmented` (tightens, then scrolls when a word does not fit) | Activity tab gets a fifth option. |
| Flags | server `on(name)` → 404 `feature_disabled`; mobile dart-define + `debug*Override`; `GET /<feature>/options` probe | §13. |
| Error copy | mobile `errorMessage()` → `error.reason.*`; portal per-area `ERRORS` map (`kyc.ts`) | New codes in §14.6 get entries in both. |

**New components proposed (with reason):**
1. Portal `src/components/organizer-kyc.tsx`: a self-serve verification checklist (business, people, documents, settlement account, agreements, submit) over `/me/kyc/*`. No self-serve KYC UI exists in the portal (vendors do it in the mobile Verification centre); organizers are a portal-first persona.
2. Portal `src/components/event-wizard.tsx` (+ `event-wizard-steps/*.tsx`): the 7-step event form. Nothing similar exists (`promotion-wizard.tsx` is 3 steps with different fields; reuse its save-indicator approach only).
3. Mobile `lib/screens/member/events/` : `events_discovery_view.dart`, `event_card.dart`, `event_filters.dart` (pure model + sheet), `member_event_detail_page.dart`, `event_status.dart` (availability → tone/label). Greenfield domain.
4. Mobile `FFHeroBand.networkImage` optional parameter (§11.5): the detail hero shows the **event's own photo**, not a bundled stock slot.

---

## 2. Personas, roles and what each can do in S2

| Actor | Identity (D3) | Can in S2 |
|---|---|---|
| Organizer owner | `event_organizer` persona; `EventOrganizerStaff.role = owner` (created with the organizer) | Everything below. Only role that edits onboarding/KYC and payout details, and removes admins. |
| Organizer admin | `organizer_staff`, role `admin` | Create/edit/submit/withdraw/cancel/archive events; manage staff (not owner, not other admins' removal → owner only). Cannot open `/organizer/onboarding` edit mode (read-only status view). |
| Organizer ops / finance / timing | `organizer_staff` | S2: overview (read) + events list (read-only, no edit controls). Their real screens arrive in S5/S4/S6. |
| FitFlex admin, scope `events` | portal `admin` with ACL scope `events` (new in `PORTAL_ACL_SCOPES` and `ALL_ACL_SCOPES`) | Moderation queue: approve (publish) / reject / cancel / archive; view change log and audit; link to the organizer's KYC case (KYC decisions still need the `kyc` scope). Super-admin has every scope. |
| Member | `member` | Browse, search, filter, open detail, save/share (flagged). Cannot register yet. |

**Organizer status gates (ORG-003), text-first:**

| `organizer.status` | Badge tone | EN | SW | Unlocks |
|---|---|---|---|---|
| `draft` | gray | Not submitted | Haijawasilishwa | Onboarding checklist only. Events area hidden in nav; deep link shows §4.4 "Finish verification first". |
| `pending_review` | warning | Under review | Inakaguliwa | Same as draft, checklist read-only (except when KYC case is `info_requested`, which reopens the items the reviewer flagged). |
| `active` | success | Verified | Imethibitishwa | Events (create, edit, submit), staff, overview. |
| `rejected` | danger | Rejected | Imekataliwa | Status page with the reviewer's reason and "Contact support". Nothing else. |
| `suspended` | danger | Suspended | Imesimamishwa | Read-only everywhere: events list visible, no create/edit/submit; published events stay published (admin decides to cancel them separately). Banner on every organizer page. |

`organizer.status` is derived server-side from the KYC case (`draft`→draft, `submitted|in_review|info_requested`→pending_review, `approved`→active, `rejected`→rejected, `suspended`→suspended). The portal never maps it itself.

---

## 3. Portal: area, navigation, guards

- **Area root:** `/organizer`. Added to `ROOTS` in `Shell.tsx`; `redirectTo` sends `event_organizer` / `organizer_staff` users to `/organizer` and keeps them out of `/admin`, `/vendor`, `/hr`, `/org` (same rule as vendors). Backend remains the authority.
- **Session:** `api.portalSession` probe order gains `event_organizer` → `organizer_staff` after `vendor_staff` (backend-builder; call out under rule 6).
- **Context:** `useOrganizer()` (new `src/components/organizer-context.tsx`, modelled on `vendor-context.tsx`) loads `GET /organizer/me` once and exposes `{organizer, role, permissions, loading, error, reload}`.
- **Nav (`organizerNav()`), labels via `t()`:**

| href | Label EN / SW | Icon (lucide) | Shown when |
|---|---|---|---|
| `/organizer` | Overview / Muhtasari | `LayoutDashboard` | always |
| `/organizer/onboarding` | Verification / Uthibitisho | `ShieldCheck` | always (read-only for non-owners) |
| `/organizer/events` | Events / Matukio | `Flag` | `status in (active, suspended)` |
| `/organizer/staff` | Staff / Wafanyakazi | `Users` | `status = active` and role `owner|admin` |

- **Admin nav:** `{ href: '/admin/events', labelKey: 'admin.nav.events', icon: Flag, groupKey: 'nav.group.platform', aclScope: 'events' }` placed after `admin.nav.challenges`. Count badge = number of `submitted` events (`NavItem.count`, from `GET /admin/events/summary`).
- **Build flag:** `NEXT_PUBLIC_EVENTS_MODULE` (`src/lib/flags.ts`). Off: no nav items, and the four organizer pages plus `/admin/events` render the §4.4 "not available yet" state. On but server `EVENTS_MODULE` off: every call returns 404 `feature_disabled` → same state. (Mirror of `useShopBannersAvailable`.)
- **Responsive:** sidebar collapses under 1024px as today. All pages are single column ≤ 768px; tables switch to `DataTable` horizontal scroll with `label`; the wizard's `Stepper` shows the "n / N · step" line.
- **Headings:** every page uses `PageHeader` (h1) and section `h2`s; `document.title` = `"{page} · FitFlex"`.
- **Page states shared by every portal page in this spec:**
  - loading: `SkeletonCard`/`SkeletonTable` inside `aria-busy`;
  - error: `ErrorState` with `common.somethingWrong` / `common.errorBody` / retry;
  - forbidden (403 `not_your_organizer`, `forbidden`): `EmptyState` icon `Lock`, `organizer.forbidden.title` / `.body`, action "Back to overview";
  - not available (flag off): `EmptyState` icon `Flag`, `events.unavailable.title` / `.body`.

---

## 4. Portal page: `/organizer/onboarding` (organizer onboarding and status)

### 4.1 Purpose
Request the organizer capability (ORG-001), complete verification (ORG-002, via the existing partner KYC flow), and see the status and what it unlocks (ORG-003).

### 4.2 Entry
- Login page gains one link under the form: **"Organize running events on FitFlex" / "Andaa matukio ya kukimbia kwenye FitFlex"** → `/organizer/onboarding` (shown only with the build flag on).
- A signed-in person with no organizer persona lands on **state A (intro)**. A person with one lands on **state B (checklist)** or **C (status)**.
- Deep link with the flag off → §3 not-available state.

### 4.3 Layout
Desktop: `PageHeader` (title "Organizer verification" / "Uthibitisho wa mwandaaji", status `Badge` from §2 at the right) → two columns 2:1. Left: the checklist card. Right: "What happens next" card (3 numbered steps) + "Need help?" card (support contact from `common.*`). ≤ 768px: single column, status badge under the title, help cards below the checklist.

**State A: intro (no organizer yet).** Card with: h2 `organizer.intro.title`, body `organizer.intro.body`, bullet list of what is needed (business registration, TIN certificate if registered for tax, representative's ID, event permit when available, payout account), `Field` **Organization name** (`Input`, required, 2–80 chars), `Field` **Timezone** (`Select`, default `Africa/Dar_es_Salaam`, list from `GET /events/options.timezones`), `Field` **Contact phone** (`Input` type tel, Tanzanian format `+255…` or `0…`, required) and **Contact email** (optional, format check). Primary `Button` **"Request organizer access" / "Omba ufikiaji wa mwandaaji"**. Submits `POST /me/organizer`. On success: toast `organizer.intro.created`, reload context → state B.
Errors: 409 `organizer_exists` → reload (someone else already did it in another tab); 400 `invalid_name` → field error; 403 `persona_not_allowed` → `Alert` tone error `organizer.intro.notAllowed`.

**State B: checklist (`draft`, or `pending_review` with KYC `info_requested`).** Reuse the item/section vocabulary of `src/lib/kyc.ts` (`SECTION_LABEL`, `itemLabel`, `ITEM_STATUS`) so the organizer sees exactly what the reviewer sees. Sections, each a collapsible `Card` with the section's `Badge` (`ITEM_STATUS` tone) and item rows:

| Section (`section` key) | Items (requirement keys from backend, D10) | Control |
|---|---|---|
| Business (`business`) | `legalName`, `tradingName`, `registrationNumber`, `tin`, `registeredAddress` | one inline form, `PUT /me/kyc/business` |
| Representative (`representative`) | `fullName`, `idNumber`, `phone`, `email`, `position` | `PUT /me/kyc/people/representative` |
| Documents (`documents`) | `business_registration`, `tin_certificate`, `business_licence`, `representative_id`, **`event_permit`** (optional until an event is submitted; the wizard's Review step re-checks it) | file row: name, status badge, "Upload" (`api.uploadFile` → `POST /me/kyc/documents/:key/file`), accepted JPG/PNG/PDF ≤ 10 MB |
| Payout (`settlement`) | `payout_account` (bank or mobile money) | `POST /me/kyc/settlement-accounts`; masked after save ("M-Pesa · •••• 123") |
| Agreements (`agreements`) | `partner_terms`, `kyc_consent` | `Checkbox` each with a link that opens the text in a `Dialog`; `POST /me/kyc/agreements` |

Footer: primary **"Submit for review" / "Wasilisha ikaguliwe"** enabled only when every required item is `complete` (server list `case.missing` is empty); otherwise disabled with hint `organizer.kyc.missingHint` listing the missing labels. `ConfirmDialog` title `organizer.kyc.submitTitle`, body `organizer.kyc.submitBody`. On 409 `kyc_incomplete` → re-fetch and show the hint.
`info_requested`: `Alert` tone warning at the top with the reviewer's note (`case.reviewNote`), flagged items get the `warning` badge "Incomplete" and are editable; everything else read-only.

**State C: status (`pending_review` without info request, `active`, `rejected`, `suspended`).** The checklist is shown read-only (collapsed by default) under a status card:
- `pending_review`: icon `Clock`, `organizer.status.pendingTitle/Body` ("We usually reply within a few working days" — no SLA number, D10), "Withdraw submission" secondary button (`POST /me/kyc/withdraw`, `ConfirmDialog`) only while KYC is `submitted`.
- `active`: icon `BadgeCheck`, `organizer.status.activeTitle/Body`, primary "Create your first event" → `/organizer/events?event=new` (owner/admin) and "Invite staff" → `/organizer/staff`.
- `rejected`: icon `XCircle`, reason from `case.decisionReason` via `REASON_LABEL` (needs EN/SW; see §9), `organizer.status.rejectedBody`, "Contact support" (mailto from `common.supportEmail` if present, else the help card).
- `suspended`: icon `Ban`, `organizer.status.suspendedTitle/Body`, reason, support link.

### 4.4 Guard states
- Non-owner staff: state C only; forms hidden, `organizer.kyc.ownerOnly` note.
- Organizer `draft`/`pending_review` opening `/organizer/events` or `/organizer/staff`: `EmptyState` icon `ShieldCheck` `organizer.gate.title` ("Finish verification first") / `.body`, action → `/organizer/onboarding`.

### 4.5 Accessibility
Keyboard order: page header → status badge (not focusable) → each section header button (`aria-expanded`) → its fields in reading order → section save → next section → Submit. File inputs are real `<input type=file>` behind a `Button` (label "Upload {item}"). Every field via `Field` (id, describedby, invalid). Status changes after save announced through the toast `role=status`. Minimum text 14px; badges 12px are never the only carrier of meaning (label text + section heading).

### 4.6 Acceptance criteria (P-ON)
- P-ON-1 With `NEXT_PUBLIC_EVENTS_MODULE` off, `/organizer/onboarding` shows the "not available" state and the login link is absent.
- P-ON-2 A signed-in person with no organizer persona sees state A; submitting a 2–80 char name and a valid phone creates the organizer and shows state B without a page reload.
- P-ON-3 Submit for review is disabled until the server reports no missing items; the hint lists them by `itemLabel`.
- P-ON-4 After submit the page shows "Under review" (EN) / "Inakaguliwa" (SW) and the checklist is read-only.
- P-ON-5 With KYC `info_requested`, the reviewer note is shown and only flagged items are editable.
- P-ON-6 `rejected` and `suspended` show the reason text and a support link; no event or staff controls are reachable (nav hidden, deep links gated).
- P-ON-7 All strings switch EN ↔ SW with the language toggle; no English remains in SW mode (i18n-auditor check).
- P-ON-8 Keyboard-only: every control reachable and operable in the order of §4.5; focus returns to the opener after dialogs.

---

## 5. Portal page: `/organizer` (overview)

### 5.1 Layout
`PageHeader` "Overview" / "Muhtasari" with the organizer name as subtitle and the status `Badge`. Suspended → `Alert` tone error `organizer.suspendedBanner` across the top of this and every organizer page.
Row of four `MetricCard`s (grid 4 → 2 → 1 columns at ≥1280 / ≥768 / phone):

| Card | Value source | S2 behaviour |
|---|---|---|
| Events / Matukio | `summary.eventsTotal` with `sub` "{published} published" | real count |
| Registrations / Usajili | `summary.registrationsTotal` | **0**, `sub` = `organizer.overview.comingSoon` ("Available once registration opens" / "Itapatikana usajili ukifunguliwa") |
| Awaiting payment / Zinasubiri malipo | `summary.awaitingPaymentTotal` | 0, same sub |
| Confirmed / Zilizothibitishwa | `summary.confirmedTotal` | 0, same sub |

Below: card **"Next up" / "Zinazofuata"**: the three soonest events (any status except archived) as rows: title, status badge (§7.3), start date in the event's timezone, "Open" link. Empty: `EmptyState` icon `Flag` `organizer.overview.noEvents.title/body` with action "Create an event" (owner/admin, status active). Then card **"Get started" / "Anza"** checklist (static, three links: verification, create event, invite staff) shown until the organizer has ≥1 published event.

Backend field: `GET /organizer/summary` → `{ eventsTotal, publishedTotal, registrationsTotal, awaitingPaymentTotal, confirmedTotal, nextEvents: EventRow[3] }` (the three totals are 0 in S2).

### 5.2 Acceptance criteria (P-OV)
- P-OV-1 Four metric cards render with tabular numbers; the three registration cards show 0 and the "coming soon" sub in both languages.
- P-OV-2 With no events the "Next up" card shows the empty state; with events it lists at most three, soonest first, each opening `/organizer/events?event=<id>`.
- P-OV-3 `suspended` shows the banner and hides "Create an event".
- P-OV-4 At 375px wide the cards stack in one column with no horizontal scroll.

---

## 6. Portal page: `/organizer/events` (list) and `?event=<id>` (wizard)

### 6.1 List
`PageHeader` "Events" / "Matukio", primary `Button` **"New event" / "Tukio jipya"** (owner/admin, status active). Filter row (`extraFilters` of `DataTable`): status `Select` (All + the eight statuses), type `Select`. `DataTable` `label="events.list.tableLabel"`, `defaultSort` start date desc, `stickyActions`, columns:

| key | Header EN / SW | Cell |
|---|---|---|
| `title` | Event / Tukio | title (2-line clamp), slug muted under it |
| `startsAt` | Starts / Huanza | date + time in event tz, tz abbreviation ("14 Mar 2027, 06:30 EAT") |
| `type` | Type / Aina | `events.type.<type>` |
| `status` | Status / Hali | §7.3 badge |
| `categories` | Categories / Makundi | count + distances ("3 · 5K 10K 21K") |
| `updatedAt` | Updated / Imesasishwa | relative ("2 h ago") with full timestamp in `title` |

Row click → `?event=<id>`. Actions column: "Open", and the lifecycle actions allowed for the row (§7.2) as a kebab `Dialog` menu (ghost `Button`s). Empty: `EmptyState` `events.list.empty.title/body` + "New event". Phone: table scrolls horizontally inside the labelled region; the title column is 50 % min width.

### 6.2 Wizard (`?event=new` or `?event=<id>[&step=<key>]`)
Full-width page: `PageHeader` with the event title (or "New event"), status badge, **save indicator** (`<p role="status">`: "Saving…" / "Saved 14:02" / "Not saved — Retry" link) and a "Back to events" ghost button. `Stepper` with steps:

| # | key | EN | SW |
|---|---|---|---|
| 1 | `basics` | Basics | Msingi |
| 2 | `venue` | Venue & route | Mahali na njia |
| 3 | `categories` | Categories | Makundi |
| 4 | `tickets` | Ticket types | Aina za tiketi |
| 5 | `kit` | Kit & collection | Kiti na uchukuaji |
| 6 | `terms` | Terms & refunds | Masharti na marejesho |
| 7 | `review` | Review & submit | Kagua na uwasilishe |

Below the stepper: the step's `Card`; footer with "Back" (ghost), "Save draft" (secondary; explicit save), "Next" (primary). The last step's primary is "Submit for review". ≤ 768px: footer sticks to the bottom (`position: sticky`), buttons full width in a row.

`maxReached` = highest step whose predecessors are valid; the organizer can always go **back**. A step with errors marks its stepper item with a visually hidden " · has errors" suffix in the `aria-label` and an error `Badge` count next to the step card title.

**Draft autosave.** `?event=new` creates the draft on first blur of a valid title (`POST /organizer/events {title}` → id, URL replaced to `?event=<id>` via `history.replaceState`). Afterwards every change debounced 1.5 s → `PATCH /organizer/events/:id` with the changed step's fields and the current `version`. 409 `version_conflict` → `Alert` tone warning "This event was changed elsewhere. Reload to see the latest." with a Reload button; the local edits stay in the form until reload. Network failure → indicator "Not saved — Retry" (retry reuses the same payload). Autosave is **off** for published events: edits are explicit "Save changes" with the §7.4 material-change dialog.

**Step fields and validation** (client validation mirrors the server list in §14.6; the server is the authority; messages via `events.validation.*`):

**1 Basics**
| Field | Control | Rules |
|---|---|---|
| Title / Jina la tukio | `Input` | required, 3–80 chars |
| Event type / Aina | `Radio` fieldset: road, trail, fun, charity, virtual (`events.type.*`) | required |
| Description EN / Maelezo (Kiingereza) | `Textarea` rows 6 | required, 40–4000 chars, counter |
| Description SW / Maelezo (Kiswahili) | `Textarea` rows 6 | required, 40–4000; hint "Members who use Swahili see this text" |
| Timezone / Saa za eneo | `Select` | required, IANA list from options, default organizer timezone |
| Starts / Huanza | `DateTimeInput` | required, ≥ now + 24 h on submit (draft may be earlier) |
| Ends / Huisha | `DateTimeInput` | required, > starts, ≤ starts + 7 days |
| Registration opens / Usajili hufunguliwa | `DateTimeInput` | optional; default = publish time (hint) |
| Registration closes / Usajili hufungwa | `DateTimeInput` | required, > opens (if set), ≤ starts |
| Cover image / Picha ya jalada | `ImageUpload maxFiles=1` | optional; 16:9 recommended, ≥ 1200×675, ≤ 2 MB after compression; alt text `Input` required when an image is set (≤ 120 chars) |
`DateTimeInput` works in the browser's local time; show the computed event-tz time next to it ("= 06:30 EAT") so a Dar organizer on a laptop set to UTC is not confused.

**2 Venue & route**
| Field | Control | Rules |
|---|---|---|
| Venue name / Jina la mahali | `Input` | required (virtual: optional, hint "Leave empty for a virtual event") |
| Address / Anwani | `Input` | required unless virtual, ≤ 200 |
| City & region / Mji na mkoa | `Input` + `Select` region (options list) | region required unless virtual |
| Map pin / Alama ya ramani | `LocationPicker` (height 260) | required unless virtual; lat/lng within TZ bounding box by default, override checkbox "Event is outside Tanzania" |
| Route link / Kiungo cha njia | `Input` type url | optional, https only |
| Route map image / Picha ya ramani ya njia | `ImageUpload maxFiles=1` | optional, ≤ 2 MB, alt text required |
| Accessibility notes EN / SW / Maelezo ya ufikivu | `Textarea` ×2 | optional, ≤ 1000 each; both or neither |

**3 Categories** (repeatable rows, min 1, max 12; "Add category" button; each row a `Card` with a remove `Button` `aria-label="Remove {name}"`)
| Field | Rules |
|---|---|
| Name / Jina (e.g. "21K Half Marathon") | required, ≤ 60, unique within the event |
| Distance (km) / Umbali | required, 0.5–250, 1 decimal; stored as `distanceM` |
| Start time / Muda wa kuanza | `DateTimeInput`, ≥ event starts, ≤ event ends |
| Capacity / Uwezo | integer 1–100 000; blank = unlimited (checkbox "No limit") |
| Eligibility notes EN / SW / Masharti ya kustahiki | optional ≤ 500 each; both or neither |
| Minimum age / Umri wa chini | optional integer 5–99; hint about guardian rules pending counsel (R11) |

**4 Ticket types** (grouped under each category; min 1 per category; max 6 per category)
| Field | Rules |
|---|---|
| Name / Jina ("Early bird", "Standard") | required ≤ 40, unique within the category |
| Price (TSh) / Bei | integer ≥ 0, whole shillings (D4); `Input inputMode=numeric` with thousands separators on blur; 0 shows a "Free" badge preview |
| Capacity / Uwezo | integer 1–100 000 or "No limit"; sum of ticket capacities may exceed the category capacity (category caps wins) — show hint |
| Sale opens / closes / Mauzo hufunguliwa / hufungwa | `DateTimeInput`; within [registration opens, registration closes] |
| Min per order / Chini kwa oda | 1–50, default 1 |
| Max per order / Juu kwa oda | min–50, default 10 |
Currency is fixed to `TZS` in S2 and shown as "TSh" (EVT-006: the field exists in the API; the UI does not offer other currencies yet).

**5 Kit & collection points** (0–10 rows; required when any ticket includes a kit — a checkbox "This event hands out a race kit" at the top of the step; off → step shows the note "No kit collection" and passes)
| Field | Rules |
|---|---|
| Point name / Jina la kituo | required ≤ 60 |
| Address / Anwani | required ≤ 200 |
| Map pin | `LocationPicker`, optional |
| Windows / Muda wa kuchukua | 1–5 `{opensAt, closesAt}` pairs, each < event starts, closes > opens |
| Instructions EN / SW / Maelekezo | required ≤ 600 each |
| Inclusions EN / SW / Vilivyomo (what the kit contains) | once per event, optional ≤ 600 each |

**6 Terms & refund policy**
| Field | Rules |
|---|---|
| Event terms EN / SW / Masharti ya tukio | `Textarea` rows 10, required 100–20 000 each; snapshot on submit (`termsSnapshot`) |
| Cancellation & refund policy / Sera ya kughairi na marejesho | `Radio` preset: `no_refund`, `refund_until_close` (full refund until registration closes), `custom` + `Textarea` EN/SW required 50–5000 when custom; snapshot on submit |
| Contact email / phone / WhatsApp for participants | email required, phone optional (TZ format), WhatsApp optional |
| Sponsors / Wadhamini | 0–10 rows: name (≤ 60), logo `ImageUpload`, link (https) |
| Schedule / Ratiba | 0–20 rows: time (`DateTimeInput` within event window) + label EN/SW ≤ 80 |
Legal note under the terms field (`events.terms.legalNote`): the texts are the organizer's; FitFlex's own participant terms are still draft pending Tanzanian counsel (rule 8).

**7 Review & submit**
Read-only summary of every step in the member's order (title, dates in event tz, venue, categories table with prices "from TSh X", kit points, policy preset, contacts), each section with an "Edit" link to its step. A validation list (`<ul role="list">`) shows remaining problems as links. The `event_permit` document status is shown here: missing → warning `Alert` `events.review.permitMissing` (submission still allowed, D10 default; admin sees the same warning in the queue). Checkbox `events.review.confirm` ("The information is accurate and I have the right to organize this event" / "Taarifa ni sahihi na nina haki ya kuandaa tukio hili"), required. Primary **"Submit for review" / "Wasilisha ikaguliwe"** → `ConfirmDialog` → `POST /organizer/events/:id/submit`. Success toast `events.submitted.toast` and the page shows the §7 status card for `submitted`.

### 6.3 Accessibility (wizard)
- Stepper buttons already expose `aria-current` and numbered labels; the step card title is an `h2` with `tabIndex=-1` that receives focus on step change (announced).
- Repeatable rows: each row's card has `aria-labelledby` its name field; "Add" appends and moves focus to the new row's first field; "Remove" moves focus to the previous row's name (or the Add button).
- Date fields: native `datetime-local` (keyboard and screen-reader friendly); the derived "= 06:30 EAT" text is `aria-live="polite"`.
- Money input: `inputMode="numeric"`, `aria-describedby` hint "Whole shillings, no decimals".
- Colour: validation errors use `error-700` text + icon + message; the stepper error badge carries text ("2").

### 6.4 Acceptance criteria (P-EV)
- P-EV-1 "New event" creates the draft when the title loses focus and the URL becomes `?event=<id>` without a reload.
- P-EV-2 Edits autosave within ~2 s; the indicator cycles Saving… → Saved hh:mm; a simulated network failure shows "Not saved — Retry" and the retry succeeds.
- P-EV-3 A 409 `version_conflict` shows the warning with Reload; local edits are not silently lost before reload.
- P-EV-4 Each validation rule in §6.2 blocks "Next"/"Submit" with the message from `events.validation.*` in the active language.
- P-EV-5 Review step lists every unresolved problem as a link that focuses the field in its step.
- P-EV-6 Submit requires the confirmation checkbox; after `POST …/submit` the status badge reads "Submitted" / "Imewasilishwa" and all fields become read-only.
- P-EV-7 At 375px the stepper shows the "n / 7 · step" line, the footer sticks to the bottom, and no input is narrower than 44px tall.
- P-EV-8 Keyboard-only completion of all seven steps is possible; focus lands on the step heading after each step change.
- P-EV-9 Prices entered as "25,000" or "25000" both save as `25000`; "25000.50" is rejected with `events.validation.wholeShillings`.
- P-EV-10 Playwright: organizer A opening `?event=<id of B>` sees the forbidden state (mocked 403 `not_your_organizer`).

---

## 7. Lifecycle controls

### 7.1 State machine (ORG-006, server-enforced)
```
draft ──submit──▶ submitted ──approve(admin)──▶ published ──(auto at registrationClosesAt)──▶ registration_closed
  ▲                  │ reject(admin)/withdraw(org)          │                                   │
  └──────────────────┘                                      │ (auto at startsAt)                ▼
                                                            └────────────────────────────▶ in_progress ──(auto at endsAt, or organizer "Mark completed")──▶ completed ──archive──▶ archived
published | registration_closed | in_progress ──cancel──▶ cancelled ──archive──▶ archived
draft | submitted ──delete (organizer, draft only)
```
Automatic transitions are the server's job (`eventLifecycle` job, S2 backend). The UI shows the automatic ones as "scheduled" hints ("Registration closes automatically on 12 Mar, 23:59 EAT").

### 7.2 Who may do what

| Action | Organizer owner/admin | Admin (`events`) | Dialog |
|---|---|---|---|
| Submit | draft → submitted | — | §6.2 |
| Withdraw | submitted → draft | — | `ConfirmDialog` `events.withdraw.*` |
| Approve → publish | — | submitted → published | `Dialog` with optional note to organizer; "Publish" |
| Reject | — | submitted → draft | `Dialog`, reason `Select` (`events.rejectReason.*`: `incomplete_details`, `permit_missing`, `pricing_unclear`, `terms_unclear`, `duplicate_event`, `policy_violation`, `other`) + required note ≤ 500; "Reject" destructive |
| Edit published | yes (material-change dialog §7.4) | yes (same dialog, reason required) | |
| Cancel | published / registration_closed / in_progress → cancelled | same | `ConfirmDialog` destructive, reason `Select` (`weather`, `permit`, `safety`, `low_turnout`, `organizer_decision`, `other`) + note; body warns that participants will be notified and refunds follow the policy (text present in S2, behaviour in S4). Organizer cancel is **blocked by the server** once confirmed registrations exist (S3+) → 409 `has_registrations` → copy "Ask FitFlex to cancel this event" with a support link. |
| Mark completed | in_progress → completed | same | `ConfirmDialog` |
| Archive | completed / cancelled → archived | same | `ConfirmDialog`; archived events leave the default list filter |
| Delete draft | draft only | — | `ConfirmDialog` destructive |
| Suspend organizer | — | via KYC case (`/admin/kyc?case=`) | existing KYC decision dialog |

Ops / finance / timing staff see no lifecycle buttons.

### 7.3 Event status badges (shared by organizer list, wizard header, admin queue, mobile organizer-facing copy)

| status | Tone | EN | SW |
|---|---|---|---|
| `draft` | gray | Draft | Rasimu |
| `submitted` | warning | Submitted | Imewasilishwa |
| `published` | success | Published | Imechapishwa |
| `registration_closed` | info | Registration closed | Usajili umefungwa |
| `in_progress` | brand | In progress | Inaendelea |
| `completed` | default | Completed | Imekamilika |
| `cancelled` | danger | Cancelled | Imeghairiwa |
| `archived` | gray | Archived | Imehifadhiwa |

Mapping lives in `src/lib/events.ts` (`EVENT_STATUS: Record<status, {key, tone}>`), labels via `t('events.status.<status>')`.

### 7.4 Material changes on published events (ORG-007)
Fields flagged material: `startsAt`, `endsAt`, `timezone`, venue (`name`, `address`, `lat/lng`), `routeUrl`/route image, any category `distanceM` or `startsAt`, any ticket `priceTzs`, `registrationClosesAt`, cancellation policy. Saving a published event with a material diff opens `Dialog` **"This change affects participants" / "Mabadiliko haya yanawahusu washiriki"** listing the changed fields (before → after), a required **change note** `Textarea` EN + SW (≤ 500 each; sent to participants from S4), and a checkbox "I understand registered participants will be notified" (text-only in S2: no registrations exist). Primary "Save and notify" / "Hifadhi na uwajulishe". Non-material edits (description, inclusions, sponsors, schedule labels, contacts) save with a plain toast. Every save on a published event writes an `EventChangeLog` row.

### 7.5 Change log view (`?event=<id>&view=changes`)
Link "Change log" / "Kumbukumbu ya mabadiliko" in the wizard header (published or later). `DataTable` columns: When (event tz), Who (display name + role), Fields (chips), Material? (badge warning "Material" / "Muhimu" or gray "Minor" / "Ndogo"), Note. Row expands to a before/after list. Empty: `events.changes.empty`.

### 7.6 Acceptance criteria (P-LC)
- P-LC-1 Only the actions in §7.2 appear for the signed-in role and the row's status (Playwright over mocked `GET /organizer/events/:id.allowedActions`).
- P-LC-2 Reject requires a reason code and a note; the organizer then sees the event as Draft with the reason in a warning `Alert` at the top of the wizard.
- P-LC-3 Editing a material field on a published event opens the dialog; cancelling it leaves the form dirty and unsaved; confirming saves and writes a change-log row that the view lists as "Material".
- P-LC-4 Editing a non-material field saves with a toast and no dialog.
- P-LC-5 Cancel on a published event asks for a reason; a mocked 409 `has_registrations` shows the "ask FitFlex" copy.
- P-LC-6 Badge labels match §7.3 in both languages.

---

## 8. Portal page: `/admin/events` (moderation queue)

### 8.1 Layout
`PageHeader` "Events" / "Matukio" with `Segmented` tabs (`Segmented` from shared): **Submitted** (count) · Published · Cancelled · All. `DataTable` `label="admin.events.tableLabel"`, `dense`, columns: Event (title + organizer name under it), Organizer status (§2 badge, from KYC), Starts (event tz), Categories, Submitted at (relative), Permit (`Badge` success "On file" / warning "Missing"), Status (§7.3). Row click → `?event=<id>`.

Detail (`?event=<id>`): two columns 2:1 (stack ≤ 768px). Left: read-only review in the member's order (same `EventReviewSummary` component as wizard step 7, with a **"Preview as member"** toggle that renders the SW description when the admin's language is SW). Right: **Decision card** (approve / reject per §7.2, only while `submitted`; `cancel`/`archive` for later statuses), **Organizer card** (name, status badge, "Open verification case" → `/admin/kyc?case=<kycCaseId>`, requires `kyc` scope else disabled with tooltip), **Audit card** listing `GET /admin/events/:id/audit` rows (when, actor, action, reason) and a link to the change log view.

Audit list tab `?tab=audit` (page level): `DataTable` of all event audit rows (filter by action), for the `events` scope.

### 8.2 States
Loading skeleton table; empty per tab (`admin.events.empty.<tab>`); error; forbidden (no `events` scope → Shell redirect as for other scopes). Decision in flight: buttons `loading`; conflict 409 `invalid_transition` → toast error `admin.events.error.invalidTransition` ("This event has already moved on. Refresh.") and reload.

### 8.3 Acceptance criteria (P-AD)
- P-AD-1 Staff without the `events` scope cannot open `/admin/events` (redirected like other scoped pages); nav item absent.
- P-AD-2 Submitted tab lists submitted events with the Permit badge; approving moves the row to Published and shows a success toast; the organizer's list reflects "Published" on reload.
- P-AD-3 Reject requires reason + note; both appear in the audit card.
- P-AD-4 "Open verification case" links to the right KYC case and is disabled without the `kyc` scope.
- P-AD-5 "Preview as member" shows the Swahili description when SW is active.
- P-AD-6 Every string on the page is from `admin.events.*` / `events.*` and switches language.

---

## 9. Portal page: `/organizer/staff`

### 9.1 Layout
`PageHeader` "Staff" / "Wafanyakazi", primary **"Invite" / "Alika"**. `DataTable` columns: Person (name, masked contact "+255 7•• ••• 123" / "a•••@example.com"), Role (`organizer.role.<role>` badge brand), Status (`invited` warning "Invited" / "Amealikwa", `active` success "Active" / "Anatumika", `removed` gray), Added (date), Actions (Change role, Remove — owner/admin; owner row has no actions; an admin cannot remove another admin).

Invite `Dialog`: `Field` **Email or phone** (`Input`; parsed with `userContact()` → `{email}` / `{phone}` / `{userId}`), **Role** `Radio` fieldset with one-line descriptions:

| role | EN label — description | SW label — description |
|---|---|---|
| `admin` | Admin — manages events, staff and settings | Msimamizi — husimamia matukio, wafanyakazi na mipangilio |
| `ops` | Operations — kit collection and participant lookup on event day | Uendeshaji — kuchukua vifaa vya mbio na kutafuta washiriki siku ya tukio |
| `finance` | Finance — statements and payouts | Fedha — taarifa za fedha na malipo |
| `timing` | Timing — submits and verifies results | Muda — huwasilisha na kuthibitisha matokeo |

Primary "Send invitation" → `POST /organizer/staff {contact, role}`. The invitee receives the existing start-PIN invitation flow (Identity V2 I6a/I7; token stays off the URL per `invite-link-token-hardening`). 409 `already_staff` → field error; 400 `invalid_contact` → field error; 422 `cannot_invite_self`.
Remove: `ConfirmDialog` destructive `organizer.staff.remove.*` → `DELETE /organizer/staff/:id`. Change role: `Dialog` with the same radio group → `PATCH /organizer/staff/:id {role}`.

Role note under the table (`organizer.staff.s2Note`): "Operations, finance and timing tools arrive with later releases; these roles can sign in and see the overview now." / "Zana za uendeshaji, fedha na muda zitakuja katika matoleo yajayo; majukumu haya yanaweza kuingia na kuona muhtasari sasa."

### 9.2 Acceptance criteria (P-ST)
- P-ST-1 Owner and admin see Invite; ops/finance/timing get the §3 forbidden state on this page and no nav item.
- P-ST-2 "0712 345 678", "+255712345678" and "name@example.com" are accepted; "abc" shows `organizer.staff.invalidContact`.
- P-ST-3 A mocked 409 `already_staff` shows the inline error and keeps the dialog open.
- P-ST-4 The owner row shows no actions; an admin sees no Remove on other admin rows.
- P-ST-5 Contacts are masked in the table in both languages.

---

## 10. Portal i18n keys (EN and SW draft; Swahili needs native review)

All keys go in `src/lib/i18n.ts` `en` and `sw`. `{x}` placeholders via `fmt()`. The list is complete for the pages above except validation messages that reuse `common.*`.

| Key | EN | SW (draft) |
|---|---|---|
| `nav.organizer.overview` | Overview | Muhtasari |
| `nav.organizer.onboarding` | Verification | Uthibitisho |
| `nav.organizer.events` | Events | Matukio |
| `nav.organizer.staff` | Staff | Wafanyakazi |
| `admin.nav.events` | Events | Matukio |
| `login.organizerLink` | Organize running events on FitFlex | Andaa matukio ya kukimbia kwenye FitFlex |
| `events.unavailable.title` | Events aren't available yet | Matukio bado hayapatikani |
| `events.unavailable.body` | This part of FitFlex is switched off for now. | Sehemu hii ya FitFlex imezimwa kwa sasa. |
| `organizer.forbidden.title` | You can't open this page | Huwezi kufungua ukurasa huu |
| `organizer.forbidden.body` | Ask the organizer owner for access. | Muulize mmiliki wa mwandaaji akupe ufikiaji. |
| `organizer.backToOverview` | Back to overview | Rudi kwenye muhtasari |
| `organizer.gate.title` | Finish verification first | Kamilisha uthibitisho kwanza |
| `organizer.gate.body` | Events and staff open once FitFlex has verified your organization. | Matukio na wafanyakazi hufunguka baada ya FitFlex kuthibitisha shirika lako. |
| `organizer.gate.action` | Go to verification | Nenda kwenye uthibitisho |
| `organizer.suspendedBanner` | Your organizer account is suspended. You can view but not change anything. Reason: {reason} | Akaunti yako ya mwandaaji imesimamishwa. Unaweza kuona lakini huwezi kubadilisha chochote. Sababu: {reason} |
| `organizer.status.draft` | Not submitted | Haijawasilishwa |
| `organizer.status.pending_review` | Under review | Inakaguliwa |
| `organizer.status.active` | Verified | Imethibitishwa |
| `organizer.status.rejected` | Rejected | Imekataliwa |
| `organizer.status.suspended` | Suspended | Imesimamishwa |
| `organizer.onboarding.title` | Organizer verification | Uthibitisho wa mwandaaji |
| `organizer.intro.title` | Organize events on FitFlex | Andaa matukio kwenye FitFlex |
| `organizer.intro.body` | Tell us about your organization. FitFlex checks every organizer before events go live. | Tueleze kuhusu shirika lako. FitFlex hukagua kila mwandaaji kabla matukio hayajaanza kuonekana. |
| `organizer.intro.needList` | You will need: business registration, TIN certificate (if registered), the representative's ID, an event permit when you have one, and a payout account. | Utahitaji: usajili wa biashara, cheti cha TIN (kama umesajiliwa), kitambulisho cha mwakilishi, kibali cha tukio ukiwa nacho, na akaunti ya malipo. |
| `organizer.intro.name` | Organization name | Jina la shirika |
| `organizer.intro.timezone` | Timezone | Saa za eneo |
| `organizer.intro.phone` | Contact phone | Simu ya mawasiliano |
| `organizer.intro.email` | Contact email (optional) | Barua pepe ya mawasiliano (si lazima) |
| `organizer.intro.submit` | Request organizer access | Omba ufikiaji wa mwandaaji |
| `organizer.intro.created` | Organizer created. Complete the checklist to submit for review. | Mwandaaji ameundwa. Kamilisha orodha ili kuwasilisha ikaguliwe. |
| `organizer.intro.notAllowed` | This account can't become an organizer. Contact support. | Akaunti hii haiwezi kuwa mwandaaji. Wasiliana na msaada. |
| `organizer.kyc.sectionBusiness` | Business | Biashara |
| `organizer.kyc.sectionRepresentative` | Representative | Mwakilishi |
| `organizer.kyc.sectionDocuments` | Documents | Nyaraka |
| `organizer.kyc.sectionPayout` | Payout account | Akaunti ya malipo |
| `organizer.kyc.sectionAgreements` | Agreements | Makubaliano |
| `organizer.kyc.upload` | Upload {item} | Pakia {item} |
| `organizer.kyc.replace` | Replace | Badilisha |
| `organizer.kyc.fileRules` | JPG, PNG or PDF up to 10 MB | JPG, PNG au PDF hadi MB 10 |
| `organizer.kyc.eventPermit` | Event permit | Kibali cha tukio |
| `organizer.kyc.eventPermitHint` | Optional now; FitFlex asks for it before an event is published. | Si lazima sasa; FitFlex huiomba kabla tukio halijachapishwa. |
| `organizer.kyc.submit` | Submit for review | Wasilisha ikaguliwe |
| `organizer.kyc.submitTitle` | Submit for review? | Uwasilishe ikaguliwe? |
| `organizer.kyc.submitBody` | You won't be able to edit these details while FitFlex reviews them. | Hutaweza kuhariri maelezo haya wakati FitFlex inayakagua. |
| `organizer.kyc.missingHint` | Still needed: {items} | Bado inahitajika: {items} |
| `organizer.kyc.ownerOnly` | Only the organizer owner can edit verification details. | Mmiliki wa mwandaaji pekee ndiye anayeweza kuhariri maelezo ya uthibitisho. |
| `organizer.kyc.withdraw` | Withdraw submission | Ondoa uwasilishaji |
| `organizer.kyc.withdrawTitle` | Withdraw and keep editing? | Uondoe na uendelee kuhariri? |
| `organizer.kyc.reviewNote` | Note from the reviewer | Ujumbe kutoka kwa mkaguzi |
| `organizer.status.pendingTitle` | Under review | Inakaguliwa |
| `organizer.status.pendingBody` | FitFlex is checking your details. We'll tell you by SMS and in the portal. | FitFlex inakagua maelezo yako. Tutakujulisha kwa SMS na kwenye tovuti. |
| `organizer.status.activeTitle` | You're verified | Umethibitishwa |
| `organizer.status.activeBody` | You can now create events and invite staff. | Sasa unaweza kuunda matukio na kualika wafanyakazi. |
| `organizer.status.createFirst` | Create your first event | Unda tukio lako la kwanza |
| `organizer.status.inviteStaff` | Invite staff | Alika wafanyakazi |
| `organizer.status.rejectedTitle` | Verification rejected | Uthibitisho umekataliwa |
| `organizer.status.rejectedBody` | Reason: {reason}. If you think this is a mistake, contact support. | Sababu: {reason}. Ukidhani ni kosa, wasiliana na msaada. |
| `organizer.status.suspendedTitle` | Account suspended | Akaunti imesimamishwa |
| `organizer.status.suspendedBody` | Reason: {reason}. Contact support to resolve this. | Sababu: {reason}. Wasiliana na msaada kutatua hili. |
| `organizer.status.contactSupport` | Contact support | Wasiliana na msaada |
| `organizer.next.title` | What happens next | Kitakachofuata |
| `organizer.next.step1` | Complete the checklist and submit. | Kamilisha orodha na uwasilishe. |
| `organizer.next.step2` | FitFlex reviews your documents. | FitFlex hukagua nyaraka zako. |
| `organizer.next.step3` | Once verified, create events and submit them for publishing. | Ukishathibitishwa, unda matukio na uyawasilishe yachapishwe. |
| `organizer.overview.title` | Overview | Muhtasari |
| `organizer.overview.events` | Events | Matukio |
| `organizer.overview.published` | {n} published | {n} yamechapishwa |
| `organizer.overview.registrations` | Registrations | Usajili |
| `organizer.overview.awaitingPayment` | Awaiting payment | Zinasubiri malipo |
| `organizer.overview.confirmed` | Confirmed | Zilizothibitishwa |
| `organizer.overview.comingSoon` | Available once registration opens | Itapatikana usajili ukifunguliwa |
| `organizer.overview.nextUp` | Next up | Zinazofuata |
| `organizer.overview.noEvents.title` | No events yet | Hakuna matukio bado |
| `organizer.overview.noEvents.body` | Create a draft, submit it, and FitFlex publishes it after review. | Unda rasimu, iwasilishe, na FitFlex itaichapisha baada ya ukaguzi. |
| `organizer.overview.getStarted` | Get started | Anza |
| `events.list.title` | Events | Matukio |
| `events.list.new` | New event | Tukio jipya |
| `events.list.tableLabel` | Your events | Matukio yako |
| `events.list.filterStatus` | Status | Hali |
| `events.list.filterType` | Type | Aina |
| `events.list.allStatuses` | All statuses | Hali zote |
| `events.list.col.title` | Event | Tukio |
| `events.list.col.starts` | Starts | Huanza |
| `events.list.col.type` | Type | Aina |
| `events.list.col.status` | Status | Hali |
| `events.list.col.categories` | Categories | Makundi |
| `events.list.col.updated` | Updated | Imesasishwa |
| `events.list.empty.title` | No events yet | Hakuna matukio bado |
| `events.list.empty.body` | Your drafts and published events will appear here. | Rasimu zako na matukio yaliyochapishwa yataonekana hapa. |
| `events.list.open` | Open | Fungua |
| `events.type.road` | Road | Barabara |
| `events.type.trail` | Trail | Njia ya porini |
| `events.type.fun` | Fun run | Mbio za burudani |
| `events.type.charity` | Charity | Hisani |
| `events.type.virtual` | Virtual | Mtandaoni |
| `events.status.draft` | Draft | Rasimu |
| `events.status.submitted` | Submitted | Imewasilishwa |
| `events.status.published` | Published | Imechapishwa |
| `events.status.registration_closed` | Registration closed | Usajili umefungwa |
| `events.status.in_progress` | In progress | Inaendelea |
| `events.status.completed` | Completed | Imekamilika |
| `events.status.cancelled` | Cancelled | Imeghairiwa |
| `events.status.archived` | Archived | Imehifadhiwa |
| `events.wizard.newTitle` | New event | Tukio jipya |
| `events.wizard.back` | Back to events | Rudi kwenye matukio |
| `events.wizard.step.basics` | Basics | Msingi |
| `events.wizard.step.venue` | Venue & route | Mahali na njia |
| `events.wizard.step.categories` | Categories | Makundi |
| `events.wizard.step.tickets` | Ticket types | Aina za tiketi |
| `events.wizard.step.kit` | Kit & collection | Kiti na uchukuaji |
| `events.wizard.step.terms` | Terms & refunds | Masharti na marejesho |
| `events.wizard.step.review` | Review & submit | Kagua na uwasilishe |
| `events.wizard.hasErrors` | has errors | ina makosa |
| `events.wizard.prev` | Back | Rudi |
| `events.wizard.next` | Next | Endelea |
| `events.wizard.saveDraft` | Save draft | Hifadhi rasimu |
| `events.wizard.saving` | Saving… | Inahifadhi… |
| `events.wizard.savedAt` | Saved {time} | Imehifadhiwa {time} |
| `events.wizard.notSaved` | Not saved | Haijahifadhiwa |
| `events.wizard.retry` | Retry | Jaribu tena |
| `events.wizard.conflict` | This event was changed elsewhere. Reload to see the latest. | Tukio hili limebadilishwa mahali pengine. Pakia upya kuona la hivi karibuni. |
| `events.wizard.reload` | Reload | Pakia upya |
| `events.wizard.readOnly` | This event is {status}. Fields can't be changed. | Tukio hili ni {status}. Sehemu haziwezi kubadilishwa. |
| `events.basics.title` | Event title | Jina la tukio |
| `events.basics.type` | Event type | Aina ya tukio |
| `events.basics.descriptionEn` | Description (English) | Maelezo (Kiingereza) |
| `events.basics.descriptionSw` | Description (Swahili) | Maelezo (Kiswahili) |
| `events.basics.descriptionSwHint` | Members who use Swahili see this text. | Wanachama wanaotumia Kiswahili huona maandishi haya. |
| `events.basics.timezone` | Timezone | Saa za eneo |
| `events.basics.starts` | Starts | Huanza |
| `events.basics.ends` | Ends | Huisha |
| `events.basics.regOpens` | Registration opens | Usajili hufunguliwa |
| `events.basics.regOpensHint` | Leave empty to open when published. | Acha wazi ili kufunguka tukio likichapishwa. |
| `events.basics.regCloses` | Registration closes | Usajili hufungwa |
| `events.basics.cover` | Cover image | Picha ya jalada |
| `events.basics.coverHint` | 16:9, at least 1200×675 px. | 16:9, angalau pikseli 1200×675. |
| `events.basics.coverAlt` | Image description | Maelezo ya picha |
| `events.basics.inEventTz` | = {time} {tz} | = {time} {tz} |
| `events.venue.name` | Venue name | Jina la mahali |
| `events.venue.nameVirtualHint` | Leave empty for a virtual event. | Acha wazi kwa tukio la mtandaoni. |
| `events.venue.address` | Address | Anwani |
| `events.venue.city` | City | Mji |
| `events.venue.region` | Region | Mkoa |
| `events.venue.pin` | Map pin | Alama ya ramani |
| `events.venue.outsideTz` | Event is outside Tanzania | Tukio liko nje ya Tanzania |
| `events.venue.routeUrl` | Route link | Kiungo cha njia |
| `events.venue.routeImage` | Route map image | Picha ya ramani ya njia |
| `events.venue.accessEn` | Accessibility notes (English) | Maelezo ya ufikivu (Kiingereza) |
| `events.venue.accessSw` | Accessibility notes (Swahili) | Maelezo ya ufikivu (Kiswahili) |
| `events.categories.add` | Add category | Ongeza kundi |
| `events.categories.remove` | Remove {name} | Ondoa {name} |
| `events.categories.name` | Category name | Jina la kundi |
| `events.categories.distance` | Distance (km) | Umbali (km) |
| `events.categories.start` | Start time | Muda wa kuanza |
| `events.categories.capacity` | Capacity | Uwezo |
| `events.categories.noLimit` | No limit | Bila kikomo |
| `events.categories.eligibilityEn` | Eligibility notes (English) | Masharti ya kustahiki (Kiingereza) |
| `events.categories.eligibilitySw` | Eligibility notes (Swahili) | Masharti ya kustahiki (Kiswahili) |
| `events.categories.minAge` | Minimum age | Umri wa chini |
| `events.categories.minAgeHint` | Rules for minors are pending legal review. | Sheria za watoto zinasubiri ukaguzi wa kisheria. |
| `events.tickets.add` | Add ticket type | Ongeza aina ya tiketi |
| `events.tickets.name` | Ticket name | Jina la tiketi |
| `events.tickets.price` | Price (TSh) | Bei (TSh) |
| `events.tickets.priceHint` | Whole shillings, no decimals. 0 = free. | Shilingi kamili, bila desimali. 0 = bure. |
| `events.tickets.free` | Free | Bure |
| `events.tickets.capacity` | Capacity | Uwezo |
| `events.tickets.capacityHint` | The category capacity still applies. | Uwezo wa kundi bado unatumika. |
| `events.tickets.saleOpens` | Sale opens | Mauzo hufunguliwa |
| `events.tickets.saleCloses` | Sale closes | Mauzo hufungwa |
| `events.tickets.minPerOrder` | Min per order | Chini kwa oda |
| `events.tickets.maxPerOrder` | Max per order | Juu kwa oda |
| `events.kit.toggle` | This event hands out a race kit | Tukio hili hutoa vifaa vya mbio |
| `events.kit.none` | No kit collection for this event. | Hakuna kuchukua vifaa vya mbio kwa tukio hili. |
| `events.kit.add` | Add collection point | Ongeza kituo cha uchukuaji |
| `events.kit.pointName` | Point name | Jina la kituo |
| `events.kit.windows` | Collection windows | Nyakati za kuchukua |
| `events.kit.addWindow` | Add window | Ongeza muda |
| `events.kit.instructionsEn` | Instructions (English) | Maelekezo (Kiingereza) |
| `events.kit.instructionsSw` | Instructions (Swahili) | Maelekezo (Kiswahili) |
| `events.kit.inclusionsEn` | What the kit includes (English) | Vifaa vina nini (Kiingereza) |
| `events.kit.inclusionsSw` | What the kit includes (Swahili) | Vifaa vina nini (Kiswahili) |
| `events.terms.termsEn` | Event terms (English) | Masharti ya tukio (Kiingereza) |
| `events.terms.termsSw` | Event terms (Swahili) | Masharti ya tukio (Kiswahili) |
| `events.terms.legalNote` | These are your terms. FitFlex's participant terms are still being reviewed by counsel. | Haya ni masharti yako. Masharti ya washiriki ya FitFlex bado yanakaguliwa na wanasheria. |
| `events.terms.policy` | Cancellation & refund policy | Sera ya kughairi na marejesho |
| `events.terms.policy.no_refund` | No refunds | Hakuna marejesho |
| `events.terms.policy.refund_until_close` | Full refund until registration closes | Marejesho kamili hadi usajili ufungwe |
| `events.terms.policy.custom` | Custom policy | Sera maalum |
| `events.terms.policyEn` | Policy text (English) | Maandishi ya sera (Kiingereza) |
| `events.terms.policySw` | Policy text (Swahili) | Maandishi ya sera (Kiswahili) |
| `events.terms.contactEmail` | Contact email for participants | Barua pepe kwa washiriki |
| `events.terms.contactPhone` | Contact phone | Simu ya mawasiliano |
| `events.terms.contactWhatsapp` | WhatsApp (optional) | WhatsApp (si lazima) |
| `events.terms.sponsors` | Sponsors | Wadhamini |
| `events.terms.addSponsor` | Add sponsor | Ongeza mdhamini |
| `events.terms.sponsorName` | Sponsor name | Jina la mdhamini |
| `events.terms.sponsorLogo` | Logo | Nembo |
| `events.terms.sponsorUrl` | Link | Kiungo |
| `events.terms.schedule` | Schedule | Ratiba |
| `events.terms.addSchedule` | Add schedule item | Ongeza kipengele cha ratiba |
| `events.terms.scheduleTime` | Time | Muda |
| `events.terms.scheduleLabelEn` | Label (English) | Kichwa (Kiingereza) |
| `events.terms.scheduleLabelSw` | Label (Swahili) | Kichwa (Kiswahili) |
| `events.review.title` | Review | Kagua |
| `events.review.edit` | Edit | Hariri |
| `events.review.problems` | Fix these before submitting | Rekebisha haya kabla ya kuwasilisha |
| `events.review.permitMissing` | No event permit on file. FitFlex may ask for it before publishing. | Hakuna kibali cha tukio kilichopakiwa. FitFlex inaweza kukiomba kabla ya kuchapisha. |
| `events.review.confirm` | The information is accurate and I have the right to organize this event. | Taarifa ni sahihi na nina haki ya kuandaa tukio hili. |
| `events.review.submit` | Submit for review | Wasilisha ikaguliwe |
| `events.review.submitTitle` | Submit this event? | Uwasilishe tukio hili? |
| `events.review.submitBody` | FitFlex reviews it before members can see it. You can withdraw it while it waits. | FitFlex huikagua kabla wanachama hawajaliona. Unaweza kuliondoa likiwa linasubiri. |
| `events.submitted.toast` | Submitted. FitFlex will review it. | Limewasilishwa. FitFlex italikagua. |
| `events.submitted.card` | Waiting for FitFlex review | Linasubiri ukaguzi wa FitFlex |
| `events.rejected.banner` | Returned by FitFlex: {reason}. {note} | Limerudishwa na FitFlex: {reason}. {note} |
| `events.withdraw.action` | Withdraw | Ondoa |
| `events.withdraw.title` | Withdraw from review? | Uliondoe kwenye ukaguzi? |
| `events.withdraw.body` | The event goes back to draft so you can edit it. | Tukio hurudi kuwa rasimu ili uweze kulihariri. |
| `events.cancel.action` | Cancel event | Ghairi tukio |
| `events.cancel.title` | Cancel this event? | Ughairi tukio hili? |
| `events.cancel.body` | Registered participants will be told and refunds follow your policy. This can't be undone. | Washiriki waliosajiliwa watajulishwa na marejesho yatafuata sera yako. Hili haliwezi kutenduliwa. |
| `events.cancel.reason` | Reason | Sababu |
| `events.cancel.reason.weather` | Weather | Hali ya hewa |
| `events.cancel.reason.permit` | Permit not granted | Kibali hakikutolewa |
| `events.cancel.reason.safety` | Safety | Usalama |
| `events.cancel.reason.low_turnout` | Low turnout | Washiriki wachache |
| `events.cancel.reason.organizer_decision` | Organizer decision | Uamuzi wa mwandaaji |
| `events.cancel.reason.other` | Other | Nyingine |
| `events.cancel.note` | Note to participants | Ujumbe kwa washiriki |
| `events.cancel.hasRegistrations` | This event has confirmed participants. Ask FitFlex to cancel it. | Tukio hili lina washiriki waliothibitishwa. Omba FitFlex ilighairi. |
| `events.complete.action` | Mark completed | Weka limekamilika |
| `events.complete.title` | Mark this event completed? | Uweke tukio hili limekamilika? |
| `events.archive.action` | Archive | Hifadhi |
| `events.archive.title` | Archive this event? | Uhifadhi tukio hili? |
| `events.archive.body` | It leaves your main list. You can still find it with the status filter. | Litaondoka kwenye orodha kuu. Bado unaweza kulipata kwa kichujio cha hali. |
| `events.delete.action` | Delete draft | Futa rasimu |
| `events.delete.title` | Delete this draft? | Ufute rasimu hii? |
| `events.autoHint.regCloses` | Registration closes automatically on {when}. | Usajili hufungwa wenyewe tarehe {when}. |
| `events.material.title` | This change affects participants | Mabadiliko haya yanawahusu washiriki |
| `events.material.body` | Registered participants will be notified about: | Washiriki waliosajiliwa watajulishwa kuhusu: |
| `events.material.noteEn` | Change note (English) | Ujumbe wa mabadiliko (Kiingereza) |
| `events.material.noteSw` | Change note (Swahili) | Ujumbe wa mabadiliko (Kiswahili) |
| `events.material.ack` | I understand registered participants will be notified. | Naelewa washiriki waliosajiliwa watajulishwa. |
| `events.material.save` | Save and notify | Hifadhi na uwajulishe |
| `events.saved.toast` | Changes saved | Mabadiliko yamehifadhiwa |
| `events.changes.link` | Change log | Kumbukumbu ya mabadiliko |
| `events.changes.when` | When | Lini |
| `events.changes.who` | Who | Nani |
| `events.changes.fields` | Fields | Sehemu |
| `events.changes.material` | Material | Muhimu |
| `events.changes.minor` | Minor | Ndogo |
| `events.changes.note` | Note | Ujumbe |
| `events.changes.empty` | No changes recorded yet. | Hakuna mabadiliko yaliyorekodiwa bado. |
| `events.validation.required` | This is required. | Hii inahitajika. |
| `events.validation.length` | Use between {min} and {max} characters. | Tumia herufi kati ya {min} na {max}. |
| `events.validation.wholeShillings` | Enter whole shillings without decimals. | Weka shilingi kamili bila desimali. |
| `events.validation.range` | Enter a number from {min} to {max}. | Weka namba kuanzia {min} hadi {max}. |
| `events.validation.endAfterStart` | Must be after the start. | Lazima iwe baada ya kuanza. |
| `events.validation.closeBeforeStart` | Must be on or before the event start. | Lazima iwe kabla au wakati tukio linaanza. |
| `events.validation.withinEvent` | Must be within the event dates. | Lazima iwe ndani ya tarehe za tukio. |
| `events.validation.withinRegistration` | Must be within the registration window. | Lazima iwe ndani ya kipindi cha usajili. |
| `events.validation.beforeEvent` | Must be before the event starts. | Lazima iwe kabla tukio halijaanza. |
| `events.validation.startsTooSoon` | The event must start at least 24 hours from now. | Tukio lazima lianze angalau saa 24 kuanzia sasa. |
| `events.validation.tooLong` | An event can last at most 7 days. | Tukio linaweza kudumu si zaidi ya siku 7. |
| `events.validation.unique` | Each name must be different. | Kila jina lazima liwe tofauti. |
| `events.validation.bothLanguages` | Fill in both English and Swahili, or leave both empty. | Jaza Kiingereza na Kiswahili, au acha zote wazi. |
| `events.validation.httpsOnly` | Use a link that starts with https://. | Tumia kiungo kinachoanza na https://. |
| `events.validation.phone` | Enter a valid Tanzanian phone number. | Weka namba sahihi ya simu ya Tanzania. |
| `events.validation.email` | Enter a valid email address. | Weka barua pepe sahihi. |
| `events.validation.minCategory` | Add at least one category. | Ongeza angalau kundi moja. |
| `events.validation.minTicket` | Each category needs at least one ticket type. | Kila kundi linahitaji angalau aina moja ya tiketi. |
| `events.validation.maxGteMin` | Max per order must be at least the minimum. | Juu kwa oda lazima iwe angalau sawa na chini. |
| `events.validation.pinRequired` | Drop a pin on the map. | Weka alama kwenye ramani. |
| `events.validation.altRequired` | Describe the image for people who can't see it. | Eleza picha kwa watu wasioweza kuiona. |
| `events.error.not_your_organizer` | This event belongs to another organizer. | Tukio hili ni la mwandaaji mwingine. |
| `events.error.invalid_transition` | This event has already moved on. Reload. | Tukio hili tayari limesonga mbele. Pakia upya. |
| `events.error.organizer_not_active` | Your organizer account isn't verified yet. | Akaunti yako ya mwandaaji bado haijathibitishwa. |
| `events.error.organizer_suspended` | Your organizer account is suspended. | Akaunti yako ya mwandaaji imesimamishwa. |
| `events.error.event_invalid` | Some details are missing or invalid. | Baadhi ya maelezo hayapo au si sahihi. |
| `admin.events.title` | Events | Matukio |
| `admin.events.tableLabel` | Events for review | Matukio ya kukaguliwa |
| `admin.events.tab.submitted` | Submitted | Yaliyowasilishwa |
| `admin.events.tab.published` | Published | Yaliyochapishwa |
| `admin.events.tab.cancelled` | Cancelled | Yaliyoghairiwa |
| `admin.events.tab.all` | All | Yote |
| `admin.events.tab.audit` | Audit | Ukaguzi |
| `admin.events.col.organizer` | Organizer | Mwandaaji |
| `admin.events.col.organizerStatus` | Organizer status | Hali ya mwandaaji |
| `admin.events.col.submittedAt` | Submitted | Imewasilishwa |
| `admin.events.col.permit` | Permit | Kibali |
| `admin.events.permit.onFile` | On file | Kipo |
| `admin.events.permit.missing` | Missing | Hakipo |
| `admin.events.empty.submitted` | Nothing waiting for review. | Hakuna kinachosubiri ukaguzi. |
| `admin.events.empty.other` | No events here. | Hakuna matukio hapa. |
| `admin.events.previewAsMember` | Preview as member | Angalia kama mwanachama |
| `admin.events.decision` | Decision | Uamuzi |
| `admin.events.approve` | Publish | Chapisha |
| `admin.events.approveTitle` | Publish this event? | Uchapishe tukio hili? |
| `admin.events.approveBody` | Members will see it in Events right away. | Wanachama wataliona kwenye Matukio mara moja. |
| `admin.events.approveNote` | Note to organizer (optional) | Ujumbe kwa mwandaaji (si lazima) |
| `admin.events.reject` | Reject | Kataa |
| `admin.events.rejectTitle` | Return this event to the organizer? | Ulirudishe tukio hili kwa mwandaaji? |
| `admin.events.rejectReason` | Reason | Sababu |
| `admin.events.rejectNote` | Note to organizer | Ujumbe kwa mwandaaji |
| `admin.events.rejectReason.incomplete_details` | Incomplete details | Maelezo hayajakamilika |
| `admin.events.rejectReason.permit_missing` | Event permit missing | Kibali cha tukio hakipo |
| `admin.events.rejectReason.pricing_unclear` | Pricing unclear | Bei haiko wazi |
| `admin.events.rejectReason.terms_unclear` | Terms unclear | Masharti hayako wazi |
| `admin.events.rejectReason.duplicate_event` | Duplicate event | Tukio limerudiwa |
| `admin.events.rejectReason.policy_violation` | Policy violation | Ukiukaji wa sera |
| `admin.events.rejectReason.other` | Other | Nyingine |
| `admin.events.organizerCard` | Organizer | Mwandaaji |
| `admin.events.openKyc` | Open verification case | Fungua kesi ya uthibitisho |
| `admin.events.openKycNoScope` | Needs the verification (KYC) permission. | Inahitaji ruhusa ya uthibitisho (KYC). |
| `admin.events.audit` | Audit | Ukaguzi |
| `admin.events.audit.when` | When | Lini |
| `admin.events.audit.actor` | By | Na |
| `admin.events.audit.action` | Action | Kitendo |
| `admin.events.audit.reason` | Reason | Sababu |
| `admin.events.published.toast` | Published. | Limechapishwa. |
| `admin.events.rejected.toast` | Returned to the organizer. | Limerudishwa kwa mwandaaji. |
| `admin.events.error.invalidTransition` | This event has already moved on. Refresh. | Tukio hili tayari limesonga mbele. Onyesha upya. |
| `organizer.staff.title` | Staff | Wafanyakazi |
| `organizer.staff.invite` | Invite | Alika |
| `organizer.staff.tableLabel` | Organizer staff | Wafanyakazi wa mwandaaji |
| `organizer.staff.col.person` | Person | Mtu |
| `organizer.staff.col.role` | Role | Jukumu |
| `organizer.staff.col.status` | Status | Hali |
| `organizer.staff.col.added` | Added | Aliongezwa |
| `organizer.staff.status.invited` | Invited | Amealikwa |
| `organizer.staff.status.active` | Active | Anatumika |
| `organizer.staff.status.removed` | Removed | Ameondolewa |
| `organizer.role.owner` | Owner | Mmiliki |
| `organizer.role.admin` | Admin | Msimamizi |
| `organizer.role.ops` | Operations | Uendeshaji |
| `organizer.role.finance` | Finance | Fedha |
| `organizer.role.timing` | Timing | Muda |
| `organizer.role.admin.desc` | Manages events, staff and settings | Husimamia matukio, wafanyakazi na mipangilio |
| `organizer.role.ops.desc` | Kit collection and participant lookup on event day | Kuchukua vifaa vya mbio na kutafuta washiriki siku ya tukio |
| `organizer.role.finance.desc` | Statements and payouts | Taarifa za fedha na malipo |
| `organizer.role.timing.desc` | Submits and verifies results | Huwasilisha na kuthibitisha matokeo |
| `organizer.staff.inviteTitle` | Invite a staff member | Alika mfanyakazi |
| `organizer.staff.contact` | Email or phone | Barua pepe au simu |
| `organizer.staff.contactHint` | They get an SMS or email to join. | Atapata SMS au barua pepe ili kujiunga. |
| `organizer.staff.role` | Role | Jukumu |
| `organizer.staff.send` | Send invitation | Tuma mwaliko |
| `organizer.staff.sent` | Invitation sent. | Mwaliko umetumwa. |
| `organizer.staff.invalidContact` | Enter an email address or a Tanzanian phone number. | Weka barua pepe au namba ya simu ya Tanzania. |
| `organizer.staff.alreadyStaff` | This person is already on your staff. | Mtu huyu tayari ni mfanyakazi wako. |
| `organizer.staff.cannotInviteSelf` | You can't invite yourself. | Huwezi kujialika mwenyewe. |
| `organizer.staff.changeRole` | Change role | Badilisha jukumu |
| `organizer.staff.remove.action` | Remove | Ondoa |
| `organizer.staff.remove.title` | Remove {name}? | Umwondoe {name}? |
| `organizer.staff.remove.body` | They lose access to this organizer right away. | Atapoteza ufikiaji wa mwandaaji huyu mara moja. |
| `organizer.staff.removed` | Removed. | Ameondolewa. |
| `organizer.staff.s2Note` | Operations, finance and timing tools arrive with later releases; these roles can sign in and see the overview now. | Zana za uendeshaji, fedha na muda zitakuja katika matoleo yajayo; majukumu haya yanaweza kuingia na kuona muhtasari sasa. |

Swahili length notes: "Usajili umefungwa" (17) vs "Registration closed" (19) is fine, but "Zinasubiri malipo" and "Zilizothibitishwa" (17) exceed their MetricCard labels' English; `MetricCard` truncates the label (`truncate`), so builders must set `title` on the label `<p>` or allow two lines (`whitespace-normal`): **allow two lines**. `Badge` text must never truncate. Stepper labels are hidden on phones (the "n / 7" line shows them), so "Kiti na uchukuaji" fits on desktop (`sm:flex-wrap`).

---

## 11. Mobile (member): discovery and detail

### 11.1 Entry points, routes, flags
- **Activity tab:** `FFSegmented` options become `overview / workouts / challenges / progress / events` with label `activity.events` ("Events" / "Matukio"). The fifth option is appended only when `eventsDiscoveryEnabled` (§13). `FFSegmented` already tightens to 12.5sp and then scrolls; at 375px with five Swahili labels ("Muhtasari · Mazoezi · Changamoto · Maendeleo · Matukio") the longest word "Changamoto" is ~75px at 12.5sp so the control stays in one row at 1.0× and scrolls at 1.3×. Selecting it renders `EventsDiscoveryView` inline under the Activity hero (the Activity hero photo set stays as is; owner waits for own photos, no new Activity hero).
- **Home card** "Upcoming events" / "Matukio yajayo": new `HomeCardKind.events` in `home_feed.dart` `pickHomeCards`, score just below `recommendation`, present only when `MemberData.upcomingEvents` (from `GET /events?limit=2&availability=open`) has ≥1 item and the flag is on; hidden when none, when the probe fails, or offline with no cache. Card: `FFCard` with header "Upcoming events" + "See all" ghost `FFButton` (→ `/member/events`), then one or two compact rows (date chip, title, location, "from TSh X") each tappable → detail. Semantics: the card is a group labelled "Upcoming events, 2 items".
- **Routes** (`AppRoutes`): `memberEvents = '/member/events'` (full-page list; app bar "Events", back = pop to the tab that pushed it, or Activity when opened cold), `memberEventDetail = '/member/events/:eventId'` (`_safeId` regex). Both live inside the Member `ShellRoute` so the bottom nav remains; `isRootTab` false. Deep link / cold start to a detail with the flag off → redirect to `/member/activity` with `FFSnack.info(events.unavailable)`.
- **Share link (flagged, §11.7):** the detail's `shareUrl` comes from the API (`EventDetail.shareUrl`); the client never builds it. Android App Link for `/member/events/*` follows the `/friend-invite/` pattern in `AndroidManifest.xml` (backend/mobile builders: same host as friend invites; iOS no scheme yet, R12).
- **Hero slot:** new `FFHeroPhoto.events('hero_events', 3 / 2, <licensed people-free stock, no faces>)` + `heroSlotOf` entry `'events'` added to `_memberSlots`. Used only as the **fallback** hero when an event has no cover image.

### 11.2 Discovery list (`EventsDiscoveryView`, used inline and at `/member/events`)
Structure, top to bottom (phone 375px; Flutter web ≥ 840 wide uses a two-column grid of cards, max content width 960 centred, filter chips stay one row):

1. **Search** `FFTextField` with search icon, hint `events.search.hint` ("Search events, places, organizers" / "Tafuta matukio, maeneo, waandaaji"), clear button (`a11y.clear` tooltip), `semanticsLabel = a11y.search`. Debounced 350 ms through `DiscoveryLoader` (reuse) → `GET /events?q=`.
2. **Chip row** (horizontal scroll, `FFFilterChip` tone `solid`): "Open now" / "Yaliyofunguliwa" (`availability=open`), "This month" / "Mwezi huu", "5K", "10K", "21K", "42K", and a trailing **"Filters" / "Vichujio"** chip with a count badge ("Filters · 2") that opens the sheet (3). Chips are 48dp targets (`FFFilterChip.minTarget`).
3. **Filter sheet** (`showFFSheet`, title `events.filters.title`): sections with `FFSectionTitle`:
   - Date / Tarehe: `FFChoiceTile` group `anytime`, `this_month`, `next_3_months`, `custom` (reveals two date pickers "From" / "To").
   - Distance / Umbali: multi-select `FFFilterChip` tone `tint`: `5k` (≤ 5 km), `10k` (5–10), `21k` (10–21.1), `42k` (21.1–42.2), `other` (everything else incl. ultra and fun runs under 5 km → label "Other" / "Nyingine").
   - Type / Aina: multi-select chips `road, trail, fun, charity, virtual`.
   - Location / Mahali: `FFDropdownField` of regions from `GET /events/options.regions` (+ "Anywhere" / "Popote").
   - Price / Bei: single-select `free`, `under_20k` ("Under TSh 20,000"), `under_50k`, `any`.
   - Registration / Usajili: switch "Open for registration only" / "Yaliyofunguliwa kwa usajili tu".
   Footer: "Clear all" (ghost) + "Show results" (primary, label includes the count when known: "Show 12 events" / "Onyesha matukio 12"). The sheet applies on "Show results" only (not live), so slow networks do not refetch per tap. Model: pure `EventFilter` (`copyWith`, `toQuery()`, `activeCount`) in `event_filters.dart`, unit-tested like `GymFilter`.
4. **Result header** `events.results.count` ("{n} events" / "Matukio {n}") as a live region, and sort `FFDropdownField` (`soonest` default, `price_low`, `newest`).
5. **List** of `EventCard`s, `ListView.builder`, `RefreshIndicator`, infinite scroll: when the last item is within 3 of the end and `nextCursor != null`, fetch the next page; a trailing row shows `FFSpinner` (semantics "Loading more") or a "Load more" `FFButton` secondary after a page error. Pages are keyed by the filter signature; a filter change resets to page 1 and scrolls to top.

**Card anatomy (`EventCard`, 16dp radius `radiusLg`, `FFCard`):**
- Top: image 16:9 (`FFRemoteImage` of `heroThumbUrl`, 600×338 WebP) with a **date chip** overlay bottom-left (`FFBadge` tone `onPhoto`, "Sat 14 Mar" / "Jumamosi 14 Mac" via `formatDayMonth` + weekday (SW uses full weekday names per `formatters.dart`; no abbreviations)) and the **status pill** top-right (§11.3). No image → placeholder: slate ground (`FFTokens.heroPlaceholder`) with a Lucide-style `directions_run` icon at 40dp and the type label; the date chip and pill render the same.
- Body: title (`titleMedium`, 2 lines, ellipsis), location line (icon `place` + "{venue.city}, {venue.region}", 1 line), **distance chips** (`FFPill` not filled, "5K · 10K · 21K" as up to 4 pills + "+1"), price line "from TSh 25,000" / "kuanzia TSh 25,000" (`bodyMedium`, bold amount; free → "Free" / "Bure"), and the organizer name muted with a verified check when `organizer.verified` (icon has `semanticsLabel: 'Verified organizer'`).
- Whole card is one `InkWell` with `Semantics(button: true, label: "{title}, {date}, {city}, from TSh 25,000, {status}")`; children are `ExcludeSemantics`. Min height 48dp; the card is ~300dp tall.
- Dark theme: card surface `colorScheme.surface`, pill colours via `FFToneTheme`; Volt is used only for the selected sort/chips (primary), never for text on the photo.

**States:**
- Loading (first page): `FFSkeletonList(count: 3)` of card-shaped skeletons (`FFSkeletonCard`), semantics `common.loading`.
- Empty (no filters): `FFEmptyState` icon `event`, `events.empty.title` ("No events yet" / "Hakuna matukio bado"), body `events.empty.body` ("Upcoming running events will appear here." / "Matukio yajayo ya kukimbia yataonekana hapa.").
- Empty (with filters): `events.empty.filtered.title` ("No events match" / "Hakuna tukio linalolingana"), body, action "Clear filters" / "Futa vichujio".
- Error: `FFErrorState(onRetry)` with `errorMessage()`; offline (`isNetworkError`) → `FFErrorState` title `error.offlineTitle` ("You're offline" / "Hauko mtandaoni"), body `events.offline.body` ("Showing what we have. Pull to refresh when you're back online." / "Tunaonyesha tulichonacho. Vuta kuonyesha upya ukirudi mtandaoni.") shown as an `FFAlert` above the **cached list** when a cache exists (§11.8), else as the full error state.
- Partial (page 2+ failed): inline "Couldn't load more" + Load more button; the loaded items stay.
- Feature off (404 `feature_disabled` from the probe or list): `FFEmptyState` `events.unavailable.title/body`.

### 11.3 Availability pills (server field `availability`, EVT-005)

| `availability` | `FFBadgeTone` | EN | SW | Member CTA (§11.6) |
|---|---|---|---|---|
| `open` | success | Open | Wazi | Register (S3) |
| `closing_soon` | fuel | Closing soon | Inafungwa karibuni | Register, label "Closing soon · Register" (S3) |
| `sold_out` | gray | Sold out | Zimeisha | disabled "Sold out" |
| `closed` | gray | Closed | Umefungwa | disabled "Registration closed" |
| `not_yet_open` | defaultTone | Opens {date} | Hufunguliwa {date} | disabled "Opens {date}" |
| `cancelled` | danger | Cancelled | Limeghairiwa | disabled "Event cancelled" |
| `in_progress` / `completed` (detail only) | gray | In progress / Finished | Inaendelea / Limemalizika | hidden |

Fuel on dark uses `fuelOnDark` text per `FFBadgeTone.fuel` (white on Fuel 5.35:1, same in both themes). The pill always carries text; colour alone never signals state. "Inafungwa karibuni" (19 chars) is the longest pill: pills `wrap: false`, so the card reserves 140dp for the pill at 1.0× and lets the title shift down at 1.3×.

### 11.4 Event detail (`/member/events/:eventId`)
`CustomScrollView`:
1. **Hero** (§11.5): the event's `heroImageUrl` (1200×675 WebP) with scrim; eyebrow = type + date ("ROAD · SAT 14 MAR 2027"), headline = title (lead words) with the last word in accent (`headlineAccent`, Volt on dark / `fgBrand` on light, as `FFHeroBand` does), subline = "{venue.name} · {city}". Hero `actions`: Save (§11.7) and Share icon buttons (`FFButton.onPhoto` variant, tooltips `events.save` / `common.share`). If `PHOTO_HERO_UI` is off: an `FFRemoteImage` 16:9 card followed by `FFPageHeader(title)` with the same eyebrow/subline as plain text. Status pill under the header in both modes.
2. **Key facts row** (`FFRowGrid`, 2 columns): Starts (date + time in event tz + abbr), Registration closes (same format, Fuel-coloured text when `closing_soon`), Distances (pills), From price.
3. Sections in this order (each `FFSectionTitle` h2 + body; a section is omitted when its data is empty, except Categories, Terms, Refund policy, Organizer, Last updated which always render):
   - **About** / Kuhusu: description in the active language (`description.sw` when locale SW and non-empty, else `description.en` with a one-line note "Swahili text not provided" / —). "Read more" after 8 lines.
   - **Organizer** / Mwandaaji: `FFAvatar(name)` + name + verified badge (`FFBadge` success "Verified organizer" / "Mwandaaji aliyethibitishwa") + "Contact" row below in Contact section.
   - **Date & time** / Tarehe na muda: start, end, timezone line "Times are in {tz abbr} ({IANA})" / "Nyakati ni kwa {abbr} ({IANA})"; if the device zone differs by offset, add "That's {local time} where you are" / "Hiyo ni {saa} ulipo".
   - **Venue & route** / Mahali na njia: name, address, static map preview (`flutter_map` tile 16:9 as `RunMap` does, with a marker; tap → "Open in maps" external intent `geo:` / Google Maps URL), route image (tap → full-screen `InteractiveViewer`), route link (external, `open_in_new` icon, tooltip "Opens in browser").
   - **Categories & prices** / Makundi na bei: one `FFCard` per category: name, distance pill, start time, then ticket rows "Early bird · TSh 20,000 · until 1 Mar" with each row's availability pill; a sold-out row is `gray` and its text `onSurfaceVariant`; `remaining` ≤ 10 shows "{n} left" / "zimebaki {n}" in Fuel text. Rows are not tappable in S2 (S3 adds selection → `FFSheet`).
   - **What's included** / Vilivyomo: `inclusions` text.
   - **Eligibility** / Masharti ya kustahiki: per category notes + min age.
   - **Accessibility** / Ufikivu: `accessibility` text.
   - **Kit collection** / Kuchukua vifaa vya mbio: one card per collection point: name, address, windows ("Fri 12 Mar, 09:00–18:00 EAT"), instructions; "Open in maps" when geo present.
   - **Schedule** / Ratiba: timeline list (time + label).
   - **Sponsors** / Wadhamini: horizontal row of logos (`FFRemoteImage` 120×60 contain, `semanticsLabel` = name) or names when no logo.
   - **Contact** / Mawasiliano: email (mailto), phone (tel), WhatsApp (wa.me) as `FFActionTile`s.
   - **Terms** / Masharti and **Refund policy** / Sera ya marejesho: collapsed `ExpansionTile`-style `FFCard` with the first 3 lines visible, "Show all"; policy preset gets a one-line summary first ("Full refund until registration closes").
   - **Last updated** / Imesasishwa: "Updated 2 Mar 2027" muted, plus "Report a problem" ghost link (mailto support; S7 may replace).
4. **Sticky bottom CTA** (§11.6) inside `SafeArea`, 64dp bar, surface with top hairline (`outline`), content padding `spacingMd`.

States: loading skeleton (hero placeholder + 6 lines); error `FFErrorState`; offline with cache → content + `FFAlert` warning "Showing a saved copy from {time}"; 404 `event_not_found` → `FFEmptyState` icon `event_busy`, `events.detail.gone.title` ("This event isn't available" / "Tukio hili halipatikani"), body ("It may have been removed or isn't published yet." / "Huenda limeondolewa au bado halijachapishwa."), action "Back to events". Cancelled → `FFAlert` error at the top of the sheet "This event was cancelled" / "Tukio hili limeghairiwa" + reason note if public.

Semantics / focus (Flutter web): hero heading gets `headingFocusNode` focus on open (announced "Dar Half Marathon, heading"); then Save, Share, the facts, each section heading (h2 via `FFSectionTitle`), links, then the bottom CTA (it is the last focusable element; `FocusTraversalOrder` ensures it is not first). All icon buttons have tooltips; external links announce "opens in browser". Contrast: all body text ≥ 4.5:1 on `surface`; Fuel text on light uses `fuel` (#B8452C, 5.3:1 on white) and `fuelOnDark` on dark; amounts use `tabular` figures.

### 11.5 Hero widget change
`FFHeroBand` gains `networkImage: FFHeroNetworkImage?` (nullable). When set, the photo layer renders the remote image (`FFRemoteImage` with fade-in) and keeps the identical scrim rules (top 0.46, text 0.86, bottom ramp) and typography; when null or the image fails, it falls back to `photo` (the `events` slot). Justification: the event cover is content, not a themed stock slot; every other `FFHeroBand` caller is unaffected (parameter optional). The scrim guarantees text contrast on any photo (photo-hero spec §5.1), so organizer-supplied images cannot break legibility.

### 11.6 Sticky CTA states (S2 shows the first row's disabled form; S3 enables)

| State | Button | Label EN / SW | Secondary text above button |
|---|---|---|---|
| S2 everywhere (`registration` flag off) | `FFButton.primary`, `onPressed: null`, `fullWidth` | Register / Jisajili | "Registration opens soon in the app" / "Usajili utafunguliwa hivi karibuni kwenye app" (`events.cta.soon`) |
| `open` (S3) | primary enabled | Register · from TSh 25,000 / Jisajili · kuanzia TSh 25,000 | "Closes 12 Mar" / "Hufungwa 12 Mac" |
| `closing_soon` (S3) | primary enabled, leading `schedule` icon in Fuel | Register / Jisajili | Fuel text "Closing soon · 2 days left" / "Inafungwa karibuni · zimebaki siku 2" |
| `sold_out` | disabled | Sold out / Zimeisha | "Check back for cancellations" / "Rudi kuangalia nafasi zitakazoachwa" (S3 may add waitlist) |
| `closed` | disabled | Registration closed / Usajili umefungwa | — |
| `not_yet_open` | disabled | Opens {date} / Hufunguliwa {date} | — |
| `cancelled` | disabled | Event cancelled / Tukio limeghairiwa | — |
| `in_progress`, `completed` | bar hidden | — | — |
Disabled buttons keep ≥ 3:1 contrast for the label (`onSurface` at 38 % is below that; use the theme's disabled style with `onSurfaceVariant` text and a bordered ghost look so the label remains readable: the spec's requirement is that the disabled label be legible at ≥ 4.5:1). The bar is 64dp tall; the button is 48dp.

### 11.7 Save / favourite and share (EVT-007, P1, flag `EVENTS_FAVOURITES`, S2 optional)
- **Save:** heart `IconButton` in the hero actions and in the card's top-left (over the image, 44dp target, `onPhoto` styling). Tooltip "Save event" / "Hifadhi tukio" and "Saved" / "Limehifadhiwa"; `Semantics(toggled:)`. Optimistic toggle → `PUT /me/event-favourites/:eventId` / `DELETE`; on failure revert + `FFSnack.error`. List filter chip "Saved" / "Yaliyohifadhiwa" appears when the flag is on (`GET /events?saved=1`). Analytics `event_saved`.
- **Share:** `share_plus` is not in `pubspec` (checked: not listed in reuse map) → use the existing vendor documents "share menu" pattern if it exists on mobile, else copy-to-clipboard with `FFSnack.success(common.copied)`; builder to confirm which (listed in §16). Share text: "{title} · {date} · {shareUrl}".
- Both are hidden when `GET /events/options.favourites` is false. Everything else in this spec works without them.

### 11.8 Low bandwidth (EVT-009)
- Image sizes from the API: `heroThumbUrl` 600×338 (≤ 40 KB WebP), `heroImageUrl` 1200×675 (≤ 150 KB), sponsor logos ≤ 20 KB, route image ≤ 300 KB (loaded inline, but only after the first paint of the text sections). Backend generates the sizes at upload time (field list §14.3).
- `FFRemoteImage` memory + disk cache (as it is used today); list images use `heroThumbUrl` only; the detail reuses the thumb as a placeholder while the hero loads (blur-up).
- Last successful list (page 1, per filter signature "default") and the last 10 opened details are cached in `SharedPreferences`/`hive`-equivalent already used by the app (builder: reuse whatever `member_gyms_tab` uses for its offline list; if nothing, in-memory only and say so).
- Without images everything renders: placeholders, text, pills; no layout depends on image dimensions (fixed 16:9 boxes).
- All list calls carry `limit=20`; detail JSON ≤ 30 KB (descriptions capped at 4000 chars each language).

### 11.9 Mobile i18n keys (`lib/shared/i18n.dart`, both maps; parity test `keysOf` covers them)

| Key | EN | SW (draft) |
|---|---|---|
| `activity.events` | Events | Matukio |
| `home.events.title` | Upcoming events | Matukio yajayo |
| `home.events.seeAll` | See all | Ona yote |
| `home.events.semantics` | Upcoming events, {n} items | Matukio yajayo, vipengele {n} |
| `events.title` | Events | Matukio |
| `events.search.hint` | Search events, places, organizers | Tafuta matukio, maeneo, waandaaji |
| `events.chip.open` | Open now | Yaliyofunguliwa |
| `events.chip.thisMonth` | This month | Mwezi huu |
| `events.chip.filters` | Filters | Vichujio |
| `events.chip.filtersCount` | Filters · {n} | Vichujio · {n} |
| `events.chip.saved` | Saved | Yaliyohifadhiwa |
| `events.filters.title` | Filter events | Chuja matukio |
| `events.filters.date` | Date | Tarehe |
| `events.filters.date.anytime` | Any time | Wakati wowote |
| `events.filters.date.thisMonth` | This month | Mwezi huu |
| `events.filters.date.next3` | Next 3 months | Miezi 3 ijayo |
| `events.filters.date.custom` | Choose dates | Chagua tarehe |
| `events.filters.from` | From | Kuanzia |
| `events.filters.to` | To | Hadi |
| `events.filters.distance` | Distance | Umbali |
| `events.filters.distance.other` | Other | Nyingine |
| `events.filters.type` | Type | Aina |
| `events.filters.location` | Location | Mahali |
| `events.filters.anywhere` | Anywhere | Popote |
| `events.filters.price` | Price | Bei |
| `events.filters.price.free` | Free | Bure |
| `events.filters.price.under20k` | Under TSh 20,000 | Chini ya TSh 20,000 |
| `events.filters.price.under50k` | Under TSh 50,000 | Chini ya TSh 50,000 |
| `events.filters.price.any` | Any price | Bei yoyote |
| `events.filters.openOnly` | Open for registration only | Yaliyofunguliwa kwa usajili tu |
| `events.filters.clear` | Clear all | Futa vyote |
| `events.filters.show` | Show results | Onyesha matokeo |
| `events.filters.showCount` | Show {n} events | Onyesha matukio {n} |
| `events.results.count` | {n} events | Matukio {n} |
| `events.sort` | Sort | Panga |
| `events.sort.soonest` | Soonest first | Yanayokaribia kwanza |
| `events.sort.priceLow` | Lowest price | Bei ya chini |
| `events.sort.newest` | Newly added | Yaliyoongezwa karibuni |
| `events.type.road` | Road | Barabara |
| `events.type.trail` | Trail | Njia ya porini |
| `events.type.fun` | Fun run | Mbio za burudani |
| `events.type.charity` | Charity | Hisani |
| `events.type.virtual` | Virtual | Mtandaoni |
| `events.card.from` | from {amount} | kuanzia {amount} |
| `events.card.free` | Free | Bure |
| `events.card.verifiedOrganizer` | Verified organizer | Mwandaaji aliyethibitishwa |
| `events.availability.open` | Open | Wazi |
| `events.availability.closing_soon` | Closing soon | Inafungwa karibuni |
| `events.availability.sold_out` | Sold out | Zimeisha |
| `events.availability.closed` | Closed | Umefungwa |
| `events.availability.not_yet_open` | Opens {date} | Hufunguliwa {date} |
| `events.availability.cancelled` | Cancelled | Limeghairiwa |
| `events.availability.in_progress` | In progress | Inaendelea |
| `events.availability.completed` | Finished | Limemalizika |
| `events.loadMore` | Load more | Pakia zaidi |
| `events.loadMoreFailed` | Couldn't load more | Imeshindwa kupakia zaidi |
| `events.empty.title` | No events yet | Hakuna matukio bado |
| `events.empty.body` | Upcoming running events will appear here. | Matukio yajayo ya kukimbia yataonekana hapa. |
| `events.empty.filtered.title` | No events match | Hakuna tukio linalolingana |
| `events.empty.filtered.body` | Try fewer filters or another date range. | Jaribu vichujio vichache au tarehe nyingine. |
| `events.empty.filtered.action` | Clear filters | Futa vichujio |
| `events.offline.body` | Showing what we have. Pull to refresh when you're back online. | Tunaonyesha tulichonacho. Vuta kuonyesha upya ukirudi mtandaoni. |
| `events.offline.savedCopy` | Showing a saved copy from {time} | Tunaonyesha nakala iliyohifadhiwa saa {time} |
| `events.unavailable.title` | Events aren't available yet | Matukio bado hayapatikani |
| `events.unavailable.body` | This part of FitFlex is switched off for now. | Sehemu hii ya FitFlex imezimwa kwa sasa. |
| `events.detail.starts` | Starts | Huanza |
| `events.detail.ends` | Ends | Huisha |
| `events.detail.regCloses` | Registration closes | Usajili hufungwa |
| `events.detail.distances` | Distances | Umbali |
| `events.detail.fromPrice` | From | Kuanzia |
| `events.detail.about` | About | Kuhusu |
| `events.detail.readMore` | Read more | Soma zaidi |
| `events.detail.readLess` | Show less | Onyesha kidogo |
| `events.detail.noSwahili` | Swahili text not provided by the organizer. | Mwandaaji hajatoa maandishi ya Kiswahili. |
| `events.detail.organizer` | Organizer | Mwandaaji |
| `events.detail.dateTime` | Date & time | Tarehe na muda |
| `events.detail.timezoneNote` | Times are in {abbr} ({zone}) | Nyakati ni kwa {abbr} ({zone}) |
| `events.detail.localTime` | That's {time} where you are | Hiyo ni {time} ulipo |
| `events.detail.venue` | Venue & route | Mahali na njia |
| `events.detail.openMaps` | Open in maps | Fungua kwenye ramani |
| `events.detail.routeLink` | View route | Angalia njia |
| `events.detail.routeImage` | Route map | Ramani ya njia |
| `events.detail.opensBrowser` | Opens in browser | Hufungua kwenye kivinjari |
| `events.detail.categories` | Categories & prices | Makundi na bei |
| `events.detail.until` | until {date} | hadi {date} |
| `events.detail.left` | {n} left | zimebaki {n} |
| `events.detail.inclusions` | What's included | Vilivyomo |
| `events.detail.eligibility` | Eligibility | Masharti ya kustahiki |
| `events.detail.minAge` | Minimum age {n} | Umri wa chini {n} |
| `events.detail.accessibility` | Accessibility | Ufikivu |
| `events.detail.kit` | Kit collection | Kuchukua vifaa vya mbio |
| `events.detail.schedule` | Schedule | Ratiba |
| `events.detail.sponsors` | Sponsors | Wadhamini |
| `events.detail.contact` | Contact | Mawasiliano |
| `events.detail.terms` | Terms | Masharti |
| `events.detail.refundPolicy` | Refund policy | Sera ya marejesho |
| `events.detail.policy.no_refund` | No refunds | Hakuna marejesho |
| `events.detail.policy.refund_until_close` | Full refund until registration closes | Marejesho kamili hadi usajili ufungwe |
| `events.detail.showAll` | Show all | Onyesha yote |
| `events.detail.updated` | Updated {date} | Imesasishwa {date} |
| `events.detail.report` | Report a problem | Ripoti tatizo |
| `events.detail.gone.title` | This event isn't available | Tukio hili halipatikani |
| `events.detail.gone.body` | It may have been removed or isn't published yet. | Huenda limeondolewa au bado halijachapishwa. |
| `events.detail.back` | Back to events | Rudi kwenye matukio |
| `events.detail.cancelledBanner` | This event was cancelled. | Tukio hili limeghairiwa. |
| `events.cta.register` | Register | Jisajili |
| `events.cta.registerFrom` | Register · from {amount} | Jisajili · kuanzia {amount} |
| `events.cta.soon` | Registration opens soon in the app | Usajili utafunguliwa hivi karibuni kwenye app |
| `events.cta.closes` | Closes {date} | Hufungwa {date} |
| `events.cta.closingSoon` | Closing soon · {n} days left | Inafungwa karibuni · zimebaki siku {n} |
| `events.cta.soldOut` | Sold out | Zimeisha |
| `events.cta.soldOutHint` | Check back for cancellations | Rudi kuangalia nafasi zitakazoachwa |
| `events.cta.closed` | Registration closed | Usajili umefungwa |
| `events.cta.opens` | Opens {date} | Hufunguliwa {date} |
| `events.cta.cancelled` | Event cancelled | Tukio limeghairiwa |
| `events.save` | Save event | Hifadhi tukio |
| `events.saved` | Saved | Limehifadhiwa |
| `events.unsave` | Remove from saved | Ondoa kwenye yaliyohifadhiwa |
| `events.share` | Share event | Shiriki tukio |
| `events.share.text` | {title} · {date} · {url} | {title} · {date} · {url} |
| `error.reason.event_not_found` | This event isn't available. | Tukio hili halipatikani. |
| `error.offlineTitle` (if absent) | You're offline | Hauko mtandaoni |

Swahili overflow notes: "Usajili utafunguliwa hivi karibuni kwenye app" (49 chars) above the CTA wraps to two lines at 375px: the CTA bar grows to 84dp in that case (do not clip). "Inafungwa karibuni · zimebaki siku 2" fits one line at 1.0×, two at 1.3×. Filter sheet chip labels ≤ 18 chars. Segment label "Matukio" is short; "Changamoto" (existing) sets the width.

### 11.10 Dark theme (Volt primary) notes
- Selected `FFFilterChip` (solid) and the primary CTA use the theme primary = Volt on dark with `onVolt` `#020617` text; the availability pill `success` tone uses `FFToneTheme.success` dark variant, never Volt.
- Fuel pill is the same solid Fuel in both themes (white text); Fuel **text** (facts row, "{n} left") uses `fuelOnDark` `#FF8A6B` on dark and `fuel` on light.
- Hero accent word is Volt on dark, `fgBrand` on light (as other heroes); never Volt over the light-theme photo text zone.
- Map tiles: use the same tile layer as `RunMap`; no dark-tile variant exists, so the map card keeps a 1px `outline` border on dark to separate it from the surface.

### 11.11 Acceptance criteria (M-)
- M-EN-1 With `EVENTS_DISCOVERY=false` (or options `discovery=false`) the Activity switcher has four options, no Home card appears, and `/member/events` redirects to Activity with the info snack.
- M-EN-2 With both on, the switcher shows "Events"/"Matukio" fifth; selecting it renders the list inline; the Home card appears only when the server returns ≥1 open event.
- M-LI-1 First paint shows 3 card skeletons; then cards with image-or-placeholder, date chip, title (≤2 lines), location, distance pills, "from TSh X" / "Free", availability pill with text.
- M-LI-2 Typing in search debounces (one request per pause) and the result count updates; clearing restores the unfiltered list.
- M-LI-3 Filter sheet: choices apply only on "Show results"; the Filters chip shows the active count; "Clear all" resets; filters survive pagination (page 2 request carries the same query).
- M-LI-4 Infinite scroll loads page 2 when `nextCursor` is present and stops when null; a failed page 2 shows "Couldn't load more" + Load more without losing page 1.
- M-LI-5 Empty, filtered-empty, error, offline-with-cache (alert + cached cards) and offline-without-cache states render as specified.
- M-LI-6 Every card is a single button with the composed semantics label; no nested focusable children.
- M-DE-1 Detail shows the hero (network image with scrim when `PHOTO_HERO_UI` on; image card + header when off), facts row, and the sections of §11.4 in order, omitting empty optional sections.
- M-DE-2 All times render in the event timezone with the abbreviation; when the device offset differs, the "where you are" line appears.
- M-DE-3 Description follows the locale (`sw` when present, else `en` + note).
- M-DE-4 Categories list ticket rows with price "TSh 20,000" or "Free", sale-window text and per-row availability pill; sold-out rows are visually muted and still readable (≥ 4.5:1).
- M-DE-5 The bottom bar shows a disabled "Register" with the "opens soon" line in S2; the state table of §11.6 is implemented behind the `registration` option so S3 only flips data.
- M-DE-6 404 `event_not_found` renders the "isn't available" state with Back; cancelled renders the banner.
- M-DE-7 Flutter web: first focus lands on the title heading; Tab order follows §11.4; every icon button has a tooltip; external links announce "opens in browser".
- M-DE-8 Light and dark screenshots at 375×812 and 1280×800 show no text under 4.5:1 and no clipped Swahili.
- M-FV-1 With `favourites=true`, the heart toggles optimistically, reverts on error with a snack, and the "Saved" chip filters; with `false`, neither heart nor Share is rendered.
- M-LB-1 With images blocked (test: `FFRemoteImage` fails), cards and detail still lay out identically with placeholders.

### 11.12 Widget-test expectations (`test/events/*`, `RecordingApi` + `pumpPage`)
- `event_filters_test.dart`: `EventFilter.toQuery()` for each option; `activeCount`; `copyWith`.
- `events_discovery_test.dart`: skeleton → cards from a fixture of 3; search debounce (fake timer) issues one request; filter sheet apply builds the right query; pagination with `nextCursor`; empty/filtered-empty; `api.fail` → error state with retry; `feature_disabled` → unavailable state; semantics label of a card.
- `event_card_test.dart`: pill tone/label per `availability`; free price; placeholder without image; Swahili labels fit (golden at 375 with `textScaleFactor` 1.3 asserting no overflow errors).
- `member_event_detail_test.dart`: section order; timezone formatting (fixture `timezone: Africa/Nairobi`, `utcOffsetMinutes: 180`, device UTC → "where you are" line); SW description fallback; CTA disabled + "opens soon"; each §11.6 state with `registration: true` fixtures; 404 state; cancelled banner; hero fallback when `heroImageUrl` null.
- `home_events_card_test.dart`: card hidden when list empty / flag off; shows 2 rows; "See all" navigates.
- `activity_tab_events_test.dart`: fifth segment present only with the flag; selecting renders the discovery view.
- i18n parity: `FFLocale.keysOf('en')` equals `keysOf('sw')` (existing test picks up the new keys).
- Router: `/member/events/evt_123` builds the detail page; flag off redirects.

---

## 12. Dates, times, money (both apps)

- API timestamps are UTC ISO-8601. Every event payload carries `timezone` (IANA), `utcOffsetMinutes` (at `startsAt`) and `timezoneAbbr` ("EAT"), so mobile formats by applying the offset with the existing `formatDate`/`formatTimeOfDay` (no tz package added); portal uses `Intl.DateTimeFormat(locale, { timeZone })`.
- Format: EN "Sat 14 Mar 2027, 06:30 EAT"; SW "Jumamosi 14 Mac 2027, 06:30 EAT" (full weekday names, per the app rule in `formatters.dart`; abbreviations rejected by the 2026-10-22 audit). Ranges on one day "09:00–18:00 EAT".
- Money: whole TZS (D4). Portal `money(v, 'TZS')`; mobile `formatCurrency(v, currency: e.currency)`. "TSh" in both languages (D-8). Free = 0.

---

## 13. Feature flags

| Flag | Where | Default | Effect |
|---|---|---|---|
| `EVENTS_MODULE` | server env | off | All `/events*`, `/me/organizer`, `/organizer/*`, `/admin/events*` routes 404 `feature_disabled`; `GET /events/options` still answers `{ discovery:false, … }` when off (cheap probe, never 404) |
| `EVENTS_DISCOVERY` | mobile dart-define (`debugEventsDiscoveryOverride` for tests) | false | Shows Activity segment, Home card, routes. UI also requires options `discovery: true` |
| `EVENTS_FAVOURITES` | server env → options `favourites` | off | Save heart, Saved chip, Share |
| `EVENTS_REGISTRATION` | server env → options `registration` | off (S3) | CTA enablement only; S2 renders disabled regardless |
| `NEXT_PUBLIC_EVENTS_MODULE` | portal build | off | Nav items, login link, pages |

`GET /events/options` (public, no auth) → `{ discovery: bool, favourites: bool, registration: bool, currency: 'TZS', closingSoonHours: 72, regions: [{code,name:{en,sw}}], timezones: ['Africa/Dar_es_Salaam', …] }`.

---

## 14. API shapes the UIs expect (fields only; backend-builder implements, contract-checker confirms)

Route names follow reuse map §5.2 (no `/api/v1`; D5 error envelope `{ error: code, ...extra }`). Pagination: `{ items, nextCursor }` with `nextCursor: string | null` (opaque; offset or keyset is the backend's choice) and `total` when cheap. `limit` default 20, max 50.

### 14.1 `GET /events` (public; optional auth for `isSaved`)
Query: `q, from, to, type[] , distance[] (5k|10k|21k|42k|other), region, price (free|under_20k|under_50k|any), availability (open), saved (1), sort (soonest|price_low|newest), cursor, limit`.
Item (`EventSummary`): `id, slug, title, type, status, startsAt, endsAt, timezone, utcOffsetMinutes, timezoneAbbr, registrationOpensAt, registrationClosesAt, availability, venue {name, city, region}, heroThumbUrl, heroImageAlt, distancesM: number[], fromPriceTzs, currency, organizer {id, name, verified}, isSaved?, updatedAt`.
Only `published | registration_closed | in_progress` events appear by default (EVT-001); `cancelled` only via `GET /events/:id`.

### 14.2 `GET /events/:id` (public; also accepts slug)
`EventDetail` = summary + `description {en, sw}, heroImageUrl, coverAlt, routeUrl, routeImageUrl, routeImageAlt, venue {address, lat, lng}, accessibility {en, sw}, inclusions {en, sw}, categories: [{id, name, distanceM, startsAt, capacity, availability, remaining (null unless ≤ 10), eligibility {en, sw}, minAge, ticketTypes: [{id, name, priceTzs, currency, saleOpensAt, saleClosesAt, minPerOrder, maxPerOrder, availability}]}], collectionPoints: [{id, name, address, lat, lng, windows: [{opensAt, closesAt}], instructions {en, sw}}], schedule: [{at, label {en, sw}}], sponsors: [{name, logoUrl, url}], contact {email, phone, whatsapp}, terms {en, sw}, refundPolicy {preset, text {en, sw}}, cancellation {reason, note {en, sw}} | null, shareUrl, publishedAt, updatedAt, version`.
Errors: 404 `event_not_found` (also for drafts/unpublished/archived to non-owners; never reveal existence), 404 `feature_disabled`.

### 14.3 Organizer
- `GET /organizer/me` → `{ organizer: {id, name, status, timezone, kycCaseId, kycStatus, statusReason}, role, permissions: string[] }`; 404 `no_organizer` when the person has none.
- `POST /me/organizer {name, timezone, contactPhone, contactEmail?}` → 201 `{ organizer, kycCaseId }`; 409 `organizer_exists`, 400 `invalid_name|invalid_phone`, 403 `persona_not_allowed`. Creates the `event_organizer` persona, `EventOrganizer` (`draft`), `EventOrganizerStaff` owner row and the `PartnerKycCase(partnerType='event_organizer')`. **Auth-touching (rule 6, D3).**
- KYC: existing `/me/kyc/*` with `event_permit` added to `partner-kyc-requirements.mjs` for `event_organizer` (optional for approval, D10).
- `GET /organizer/summary` (§5.1).
- `GET /organizer/events?status&type&cursor&limit` → rows: summary fields + `status, categoriesCount, distancesM, updatedAt, allowedActions: string[]`.
- `POST /organizer/events {title}` → 201 `{id, version}`; 403 `organizer_not_active | organizer_suspended | forbidden_role`.
- `GET /organizer/events/:id` → full editable document: all §14.2 fields (both languages always), plus `status, version, allowedActions, submittedAt, rejection {reason, note, at} | null, changeLogCount`.
- `PATCH /organizer/events/:id {version, …partial fields incl. nested categories/ticketTypes/collectionPoints/schedule/sponsors with ids for upsert, changeNote {en,sw}?}` → `{version, updatedAt, material: bool}`; 409 `version_conflict`, 422 `event_invalid {fields: [{path, code}]}` (codes = §10 `events.validation.*` suffixes), 409 `change_note_required` for material edits on published, 403 `not_your_organizer`.
- `POST /organizer/events/:id/{submit|withdraw|cancel|complete|archive}` (`cancel {reason, note{en,sw}}`) → `{status}`; 409 `invalid_transition`, 422 `event_invalid`, 409 `has_registrations`.
- `DELETE /organizer/events/:id` (draft only).
- `GET /organizer/events/:id/changes?cursor` → `{items: [{id, at, actor {name, role}, fields: string[], material, note {en,sw}, before, after}], nextCursor}`.
- Uploads: existing `api.uploadFile` → returns `{url, thumbUrl}`; backend derives `heroImageUrl` 1200×675 and `heroThumbUrl` 600×338 WebP.
- Staff: `GET /organizer/staff` → `{items: [{id, userId, displayName, maskedContact, role, status, addedAt}]}`; `POST /organizer/staff {email|phone|userId, role}` → 201 (sends the start-PIN invitation); 409 `already_staff`, 400 `invalid_contact`, 422 `cannot_invite_self`, 403 `forbidden_role`; `PATCH /organizer/staff/:id {role}`; `DELETE /organizer/staff/:id` (409 `cannot_remove_owner`).

### 14.4 Admin (scope `events`)
- `GET /admin/events?status&cursor` → rows + `organizer {id, name, status, kycCaseId}`, `permitOnFile: bool`, `submittedAt`.
- `GET /admin/events/summary` → `{ submitted: n }` (nav count).
- `GET /admin/events/:id` → §14.3 document + organizer + `allowedActions`.
- `POST /admin/events/:id/decision {decision: 'approve'|'reject', reason?, note?}` → `{status}`; 409 `invalid_transition`, 400 `reason_code_required`, 400 `note_required` (reject).
- `POST /admin/events/:id/{cancel|archive}` as organizer's.
- `GET /admin/events/:id/audit`, `GET /admin/events/audit?action&cursor` → `{items: [{at, actor {id, name}, action, target, reason, note}]}`.

### 14.5 Favourites (flag)
`PUT /me/event-favourites/:eventId` → 204; `DELETE` → 204; 404 `event_not_found`.

### 14.6 Error codes surfaced to users (and where the copy lives)
`feature_disabled`, `event_not_found`, `not_your_organizer`, `organizer_not_active`, `organizer_suspended`, `forbidden_role`, `invalid_transition`, `version_conflict`, `event_invalid`, `change_note_required`, `has_registrations`, `organizer_exists`, `persona_not_allowed`, `already_staff`, `invalid_contact`, `cannot_invite_self`, `cannot_remove_owner`, `kyc_incomplete`, `rate_limited`. Portal: `src/lib/events.ts` `EVENTS_ERRORS` → `events.error.*` keys (§10); mobile: `error.reason.*` entries (§11.9) with `errorMessage()` fallback.

---

## 15. Analytics (PRD §14, S2 subset)
Names reserved: `event_list_viewed {filtersActive: n, resultCount}`, `event_detail_viewed {eventId, availability}`, `event_saved {eventId, saved: bool}` (mobile); `organizer_event_submitted {eventId}`, `event_published {eventId}` (server-side on the transition, not the portal). The reuse map lists no client analytics pipeline; builders wire these to whatever hook exists (`contract-checker` to confirm) and otherwise leave named no-op calls so S7 can connect them. No personal data in payloads.

---

## 16. Backend fields and confirmations needed (for planner / contract-checker)
1. `availability` computed server-side with `closingSoonHours` config (default 72) and capacity (sold out when every ticket type of every category is exhausted or sale windows passed).
2. `utcOffsetMinutes` + `timezoneAbbr` on every event payload (mobile has no tz database).
3. Image derivatives (`heroImageUrl`, `heroThumbUrl`) at upload; alt text fields `coverAlt`, `routeImageAlt`.
4. `shareUrl` on detail, built from the App Link host used by friend invites.
5. `allowedActions` on organizer and admin event documents (same vocabulary as §7.2 action names).
6. `event_permit` requirement key for `partnerType = 'event_organizer'`; organizer `status` derived from the KYC case as in §2.
7. `portalSession` probe order and `event_organizer` / `organizer_staff` user types (rule 6 callout + security review before merge).
8. Start-PIN invitation reuse for organizer staff (`POST /organizer/staff`) — confirm the invitation service accepts a new org type `organizer`.
9. Whether a mobile share sheet dependency exists (`share_plus` or the vendor documents share pattern) — else clipboard fallback.
10. Offline cache store used by `member_gyms_tab` (to reuse) — else in-memory only in S2.
11. `GET /events/options` is unauthenticated and answers with the flag off.

---

## 17. Open design questions for the owner
1. **Who may publish (ORG-005):** this spec makes FitFlex admin approval mandatory for every event. Should trusted organizers later publish directly (a per-organizer `trusted` flag)? Not built in S2 either way.
2. **Organizer cancel with registrations:** spec blocks organizer self-cancel once confirmed registrations exist (admin cancels). Confirm, or allow organizer cancel with automatic refunds per policy (S4).
3. **Event permit:** optional at organizer approval and at event submission (D10 default), shown as a warning to the admin. Should it be **required** before publishing?
4. **Home card:** shows the two soonest open events for everyone (a soft promotion). Prefer saved/registered events only (empty for most members until S3)?
5. **Hero photo for the Events area:** which licensed people-free stock from `social/brand/photos` to cut for the `events` slot (needed only as the no-cover fallback). Owner has preferred to wait for own photos elsewhere.
6. All SW strings above need native review before UAT sign-off (weekday abbreviations withdrawn 2026-10-22: full names are used).
