# Photo hero screens: pre-sign-in, member Home, portal login. Design spec

> **Owner decisions 2026-10-19** (override anything below):
> 1. Photos: use the licensed people-free Pexels stock in `social/brand/photos` (§8.4) for now. No shoot yet.
> 2. People: only backs, hands, or people whose faces are not clear. No identifiable faces.
> 3. Headlines approved as written (incl. "Let's get you training." / "Tuanze mazoezi."), **but remove "Dar es Salaam · Tanzania"** everywhere (no place footer, no `hero.footer.place` / `login.hero.footer` keys).
> 4. Fuel "ends soon" / "few visits" chip on Home: approved.
> 5. Fix the existing problems F-1..F-4, F-7 now, separately from the flagged redesign.
> Other open questions (§16) take the spec's proposed defaults.
>
> **Owner decisions 2026-10-19, second review** (after seeing the preview on a phone; override anything below, details in §18–§30):
> 1. Photo hero approach is OK. **Remove "Pamoja tuna nguvu"** (the Swahili tagline line) from the Language screen hero. Nothing replaces it (§19).
> 2. Apply the photo hero to the member **Profile** tab (§21).
> 3. Apply it to the **PIN entry** screen; the PIN setup / reset / register screens follow for consistency (§22).
> 4. Apply it to the **Upgrade plan** screen (§23).
> 5. Apply it to **Activity**, with a **different photo for each section**: Today, Training, Challenges, Progress (§24).
> 6. Apply it to the **Trainer, Vendor and Gym owner home** screens (§25).
> Earlier decisions still apply: licensed people-free stock for now; people only as backs, hands or unclear faces; no "Dar es Salaam · Tanzania"; Fuel chip OK; flag `PHOTO_HERO_UI`, build-time, off by default.
>
> **Owner decisions 2026-10-19, third request** (plan `docs/plans/photo-hero-sections-footer-admin-plan.md`; override anything below, details in §31–§38):
> D-1 gym detail and trainer detail get the **footer only**, no stock top hero · D-2 footer = FitFlex wordmark + "That's all for now." / "Hiyo ndiyo yote kwa sasa.", plus **Back to top** on Gyms, Trainers and Shop · D-3 section heroes on **member** screens only · D-4 any admin with the `brand_media` scope **publishes alone** (audit log + one-click rollback) · D-5 photo rotation **per day** · the photo manager (portal "App photos" + backend + app download) is built now behind flags and ships in the next release only if it passes security review in time.

**Status:** Draft for owner review · **Date:** 2026-10-19 · **Author:** design-agent
**Request:** owner, chat 2026-10-18/19: *"I like this kind of UI where real pictures lie on the background instead of plain white/navy backgrounds"* (the investor/partner deck hero), and *"the home needs this taste too since it's where the user lands after registration. We need a strong impression when it comes to design."*
**Repos affected:** `fitflexmobile` (Flutter, mobile + Flutter web) and `fitflex-portal` (Next.js static export). **No backend change is required** (§14).
**Ships:** dormant behind `PHOTO_HERO_UI` (mobile) and `NEXT_PUBLIC_PHOTO_HERO_UI` (portal), both default **off** (§13). With the flags off, today's screens render unchanged.
**Not in scope:** app code; member onboarding (`/member/onboarding`); the pending-approval screen; the Shop home (separate spec, §3.3). (Owner/trainer/vendor homes, Profile, PIN, Upgrade plan and Activity were added by the 2026-10-19 addendum, §18+. Gyms, Trainers, Shop home, the page footer band and the admin "App photos" screen were added by addendum 2, §31+.)

Sources read (all from `origin/main` unless noted): `canon/04-marketing/design-system.md` (incl. V2 accents, 2026-10-18); memory notes `design-system-redesign`, `design-system-v2-accents`, `pass-card-ring-wording`, `swahili-review`; mobile `lib/shared/design_tokens.dart`, `lib/shared/components/*`, `lib/screens/language_screen.dart`, `auth_screen.dart`, `sign_up_screen.dart`, `role_screen.dart`, `member/member_home_tab.dart`, `member/home_feed.dart`, `member/member_shell.dart`, `member/widgets/home_cards.dart`, `member/widgets/pass_summary_card.dart`, `member/widgets/pass_state.dart`, `lib/shared/i18n.dart`, `lib/shared/splash/kinetic_splash.dart`, `pubspec.yaml`; portal `app/login/page.tsx`, `src/components/Shell.tsx`, `src/components/brand-logo.tsx`, `app/globals.css`, `next.config.mjs`, `src/lib/i18n.ts`; parent `social/brand/photos/README.md` (on `release-candidate`); the unmerged Shop home spec `docs/design/shop-home.md` (branch `docs/design-shop-home`).

Reference image: `~/FitFlex/docs/design/assets/placeholder-owner-deck-hero.webp`. **Mood reference only. It is not licensed for the apps, must not be committed to an app repo, and must not ship.**

---

## 1. What exists today

| Screen | Today | Route / file |
|---|---|---|
| Language | Plain `Scaffold` with a centred "Choose language" title, two bordered tiles (English / Swahili), Continue at the bottom. Theme toggle in the app bar. Fade + 5% slide on enter. | `/language`, `language_screen.dart` |
| Sign in | Back arrow, prefs buttons. Title "Sign in", Google button, OR divider, email-or-phone field, CONTINUE, "Don't have an account? Create account" (→ role). Max width 420. | `/auth`, `auth_screen.dart` |
| Choose role | Title "Welcome to FitFlex", subtitle, 5 role tiles (member, gym owner, trainer, vendor, gym staff), Continue → sign up. | `/role`, `role_screen.dart` |
| Create account | Same layout as sign in with "Sign up" title. Reached **after** the role is chosen, so the role is known. | `/auth/signup`, `sign_up_screen.dart` |
| Member Home | Shell app bar (FitFlex title, inbox bell, prefs), offline banner under it, then a `ListView`: `FFPageHeader` (name + time-of-day greeting), then up to 4 ranked cards. The **pass card** (`PassSummaryCard`) always leads; it holds the visits ring ("11 / left", beside it "7 of 18 used", then "Ends {date}"), Show my QR and Upgrade plan. | `/member` (`AppRoutes.memberHome`), `member_home_tab.dart` |
| Portal login | Shell login layout: 64px white header (logo + "FitFlex Af", language toggle), Calm canvas, centred 384px column: a green "FF" text square, "Operator / Admin login", white card with Google / email / HR / verify steps, footer "No self-registration…". | `/login`, `app/login/page.tsx` |

Flow after registration: language → sign in → *Create account* → role → sign up → (code / PIN) → member onboarding → **Home**. Home is the first designed screen the new member sees.

### 1.1 Existing problems this work touches (for planner; fix inside the flagged work or separately)
- **F-1 (i18n).** `language_screen.dart` hardcodes English: "Choose language", "Chagua lugha unayoipenda", "International Standard", "Swahili", "Continue", although `lang.title`, `lang.slogan`, `lang.continue` keys exist in both maps.
- **F-2 (i18n).** `auth_screen.dart` and `sign_up_screen.dart` `_showErrorDialog` hardcode "Authentication Error" and "Close".
- **F-3 (a11y, Flutter web).** Language and role tiles are bare `GestureDetector`s. They are not keyboard-focusable and expose no role, label or selected state in the accessibility tree.
- **F-4 (wrong state).** `PassSummaryCard`: when `data.me == null && data.offline`, it skips the loading branch and falls through to `PassState.none`, so an offline member who has a pass is told "No pass yet / Choose a pass".
- **F-5 (canon).** `PassSummaryCard` colours ending-soon and low-visits with the amber `warning` tone. Canon V2 assigns expiring passes to **Fuel**.
- **F-6 (canon).** Role tiles: trainer icon uses the theme primary and vendor uses indigo. The canon role colours are trainer `#3B82F6` and vendor `#A855F7`. Minor.
- **F-7 (brand).** The portal login shows a green "FF" text square instead of the logo; `BrandLogo` exists.
- **F-8 (question).** `MemberData.sponsoredGymAccess` exists (`canCheckIn = hasActivePass || sponsoredGymAccess`), but `passStateFor` does not read it. How Home should present sponsored access is open (O-11).

---

## 2. Design decisions (proposed; owner may overrule)

| # | Decision | Why |
|---|---|---|
| DD-1 | **The photo is an "always-dark island".** In both themes the hero is a dark photo under a slate-950 scrim with light text. Everything functional (forms, role list, pass card, QR, lists) stays on solid theme surfaces. | Canon is dark-first and builds brand colour on slate. Text on a photo is only safe on a dark scrim. Functional parts must stay fast to read (owner brief). |
| DD-2 | **Dark theme:** the scrim fades into `#020617` (the page ground), so the hero melts into the content. **Light theme:** the scrim stops at 80%, and the light content sheet overlaps the hero by 24px with 24px top corners. | A dark gradient fading into a light grey page looks muddy. The overlapping sheet makes a clean edge in light theme. |
| DD-3 | **No gradient text in the apps or the portal.** The deck's green→amber "limits." stays a marketing treatment. In product, the accent word is **one solid colour**: **Volt `#C8F04A`** in dark theme; **`FFTokens.fgBrand` `#17B26A`** (portal `--color-brand-500`) in light theme and on the portal, **large text only** (≥24px, weight ≥800). | Canon forbids the logo gradient as a UI fill. Along the deck gradient, the green end (`#1F7A3A`) measures 1.5:1 on the scrim and fails. Canon also forbids Volt next to green CTAs on the same screen (two primaries). The split matches Shop home DD-5, so the two specs share one rule. |
| DD-4 | **Numbers and dates are said once, on the pass card.** The Home hero may name the state in ≤3 words (e.g. "PASS ENDS SOON"). It never repeats visits left, used-of or the end date. | Owner rule (2026-10-14): no duplicated information on the pass card. |
| DD-5 | **One owner per message on Home.** In states with **no QR** (no pass, payment pending, ended), the hero carries the state sentence and the primary action, and the pass card is **not shown** (it would repeat both). In **QR states** (active, low visits, ending soon), the pass card shows as today and the hero carries the greeting and a *different* action ("Find a gym" / "Choose your next pass"). | Avoids two identical "Choose a pass" buttons. The QR always stays on the solid card. |
| DD-6 | **Photos are bundled assets, never fetched from the network.** WebP on Flutter (mobile and web); AVIF with WebP fallback on the portal. | Owner constraint: no network fetch on first launch. Flutter's mobile image codecs do not decode AVIF. |
| DD-7 | **No Ken Burns or autoplay motion.** Only a 250ms photo fade-in and the existing text rise. An optional scroll parallax on Home (factor 0.3) is off under reduced motion and on Flutter web. | Keeps low-end Android smooth. Moving backgrounds distract and need a pause control. |
| DD-8 | **No stock people in app heroes.** Until an own shoot exists, interim heroes use people-free licensed photos (equipment, spaces). | Canon: stock people are never presented as FitFlex members or partners. A person on a member's Home reads as a member. |
| DD-9 | **The scrim guarantee does not depend on the photo.** All contrast is computed against a pure-white photo pixel (relative luminance 1.0), the worst possible case (§5). | Partner gyms will supply different photos over time. The rule must hold for any of them. |

---

## 3. Components and tokens

### 3.1 Reuse map

| Need | Use | Change |
|---|---|---|
| Buttons | `FFButton` (primary / secondary / ghost; sm 40 with 48 hit area, md 48, lg 52) | Add `FFButtonVariant.onPhoto` (§3.2) for the light-theme secondary action on the scrim; otherwise none. |
| Text field, Google button, divider | `FFTextField`, `FFGoogleSignInButton`, `FFDividerLabel` | None. |
| Pass card | `PassSummaryCard` | Under the flag: hidden in `none`/`pending`/`ended` (DD-5); Fuel tone for `lowVisits`/`endingSoon` (F-5); fix F-4. |
| Loading | `FFSkeleton`, `FFSkeletonLine`, `FFSpinner` | None. |
| Error / offline | `FFErrorState`, shell `_OfflineBanner` | None. |
| Badge / chip | `FFBadge` | Needs a **fuel** tone. Add `fuel` to `FFToneTheme` (the Shop home spec asks for the same addition; build it once). |
| Section title / steps card | `FFSectionTitle`, `FFCard` | None. |
| Empty state | `FFEmptyState` | Optional `band` image parameter (§10). |
| Portal card, button, field, alert | `Card`, `Button`, `Field`, `Alert` (`src/components/shared.tsx`) | None. |
| Logo | mobile `assets/brand/logo-runner.png` + wordmark; portal `BrandLogo` | Use the **athlete mark without the navy pin** on the photo. The navy pin `#111E30` disappears on a dark scrim. Reuse the splash wordmark (`KineticLogo` in `lib/shared/splash/kinetic_splash.dart`) if it can render statically at small size; otherwise extract a small `FFWordmark` (white "FitFlex", gold `#FDBE34` "Af"). |

### 3.2 New components (nothing existing fits)

1. **`FFPhotoHero`** (mobile, `lib/shared/components/ff_photo_hero.dart`). A photo + scrim + content slot. No existing component draws an image under text.
   - Props: `asset` (`FFHeroPhoto` enum, §8), `variant` (`full` | `compact` | `panel`), `eyebrow`, `headlineLead`, `headlineAccent`, `subline`, `chip` (optional Fuel chip), `primary` / `secondary` actions, `footer` (mono line), `showLogo`, `fadeInto` (`ground` | `sheet`, from the theme).
   - Builds the scrim from the **measured** text block, so the ≥80% zone always covers every text pixel at any text scale (§5.2).
   - The photo is `ExcludeSemantics`. The eyebrow, headline and subline merge into **one** semantics node with `header: true`. Actions are separate nodes.
   - Precaches its asset (`precacheImage`) and decodes at display size (`cacheWidth` = logical width × device pixel ratio).
   - Falls back to a solid `heroPlaceholder` ground (no photo) under high contrast (`MediaQuery.highContrastOf`) and when the asset fails to decode.
2. **`FFButtonVariant.onPhoto`** (extend `FFButton`, not a new widget): transparent fill, 1.5px `#F1F5F9` border, `#F1F5F9` label. Used for secondary actions on the scrim in both themes. 10.6:1 against the 80% zone.
3. **`PhotoPanel`** (portal, `src/components/photo-panel.tsx`). The same scrim rules as CSS: `<picture>` (AVIF, WebP) with `alt=""`, eyebrow, headline with accent span, subline, mono footer. No interactive children.

**Coordination with the Shop home spec** (branch `docs/design-shop-home`, unmerged): its `FFHeroCarousel` should render each slide with `FFPhotoHero(variant: compact)` so there is one scrim implementation and one set of tokens. Its §4 contrast values (scrim ≥80%, accent `fgBrand` large-only in light theme) are the same as here.

### 3.3 Token additions

Mobile, `FFTokens` (portal mirrors in `globals.css` as `--hero-*`):

| Token | Value | Use |
|---|---|---|
| `heroScrim` | `#020617` (= `darkBg`) | Scrim colour. |
| `heroScrimTop` | alpha **0.50** | Behind the status bar, app bar icons and logo. |
| `heroScrimText` | alpha **0.80** | Minimum under any text. |
| `heroScrimGround` | alpha **1.00** | Dark theme bottom edge (seamless into `bgPrimary`). |
| `heroScrimPanelLead` | alpha **0.92** | Leading edge of horizontal (desktop / portal) scrim. |
| `heroScrimPanelTail` | alpha **0.30** | Far edge of horizontal scrim (photo-only zone). |
| `heroText` | `#F1F5F9` | Headline, eyebrow. |
| `heroTextBody` | `#CBD5E1` | Subline, footer. **`#94A3B8` is not allowed on a hero** (4.54:1, too close to the limit). |
| `heroAccentDark` | `volt` `#C8F04A` | Accent word, dark theme. |
| `heroAccentLight` | `fgBrand` `#17B26A` | Accent word, light theme and portal. Large text only. |
| `heroChipFuel` | text `fuelOnDark` `#FF8A6B`, 1px border `fuelOnDark` at 60%, fill `#020617` at 40% | State chip on the hero. |
| `heroPlaceholder` | `#0B192C` (canon logo navy deep) | Shown before the photo decodes, under high contrast and on decode failure. |
| `heroSheetOverlap` | 24 | Light theme: sheet overlaps the hero. |
| `heroSheetRadius` | 24 (= `radiusXl`) | Light theme sheet top corners. |
| `heroDisplaySize` | 34 / line height 36 (≥375 wide); 30 / 32 (<375) | Inter 900, tracking −0.03em. |
| `heroDisplaySizeWide` | 48 / 52 (≥1024 wide, panel variant) | Canon h1. |
| `heroEyebrow` | `FFTokens.monoLabel(heroText, size: 11)` with tracking 0.18em | Canon uppercase mono label. |

---

## 4. Typography and copy budgets

- Headline: Inter 900, tracking −0.03em, `heroDisplaySize`. Lead in `heroText`, accent in `heroAccent*`. The accent is always the **last** words of the headline, wraps freely, and is never a separate line by force.
- Eyebrow and footer: JetBrains Mono 11, w500, uppercase, tracking 0.18em. Labels only, never sentences.
- Subline: Inter 16/24 w400 `heroTextBody` (canon base 16, leading 1.5).

**Budgets** (text column 312px on a 360px phone, 24px side padding):

| Element | Max chars EN | Max chars SW | Lines at 1.0× | Lines at 1.3× | Longest single word |
|---|---|---|---|---|---|
| Headline | 26 | 34 | 3 | 4 | ≤11 chars (one 1.3× line at 30px) |
| Subline | 90 | 115 | 3 | 5 | — |
| Eyebrow | 28 (name ellipsised) | 28 | 1 | 2 | — |
| Chip | 16 | 22 | 1 | 2 | — |
| CTA label | 22 | 24 | 1 | 2 (button grows) | — |

All proposed copy (§11) fits these budgets. The longest Swahili headline, "Uza kwa wanaofanya mazoezi.", is 27 characters with a 10-character longest word.

---

## 5. Scrim and contrast

### 5.1 Assumed worst case
- **Guarantee basis:** a pure-white photo pixel (relative luminance **1.0**) anywhere under text. This covers window glare, white walls and flash highlights.
- **Art-direction target (not relied on):** after grading, the text safe zone averages relative luminance ≤0.20 and no area exceeds 0.45 (§8.3). Real contrast is therefore much higher than the minimums below.
- Formula: WCAG 2.x, sRGB alpha compositing of `#020617` at alpha *a* over the photo pixel (script run 2026-10-19).

### 5.2 Rules

| Zone | Scrim alpha (min) | Composited worst case | What may sit there |
|---|---|---|---|
| Top band (status bar, app bar, logo) | **0.50** | `#80828B` | White icons and logo only: `#F1F5F9` icons 3.50:1 (UI ≥3:1). No text other than the wordmark (logo, exempt but still 3.5:1). |
| Text zone | **0.80** | `#353845` | All text. |
| Between | 0.50 → 0.80 | — | Photo only. No text, no controls. |
| Dark theme bottom edge | 0.80 → **1.00** over the last 48px | `#020617` | Seamless join to the page. |
| Light theme bottom edge | stays 0.80; the sheet overlaps 24px | — | — |

Measured against the 0.80 zone over pure white:

| Foreground | Ratio | Required | Result |
|---|---|---|---|
| Headline `#F1F5F9` | 10.63:1 | 4.5 (3 if large) | pass |
| Subline `#CBD5E1` | 7.84:1 | 4.5 | pass |
| Accent Volt `#C8F04A` (dark) | 8.88:1 | 3 (large) | pass, also passes 4.5 |
| Accent `#17B26A` (light / portal) | 4.22:1 (Shop spec figure, same method) | 3 (large only) | pass for large text only; **never below 24px / w800** |
| Fuel chip text `#FF8A6B` | 5.05:1 | 4.5 | pass |
| Volt CTA fill vs scrim (dark theme, non-text) | 8.88:1 | 3 | pass; label on-volt on Volt 15.39:1 |
| Light theme CTA: `FFButton` primary, white on `#067647` | label 5.69:1 | 4.5 | pass (the label identifies the control) |
| `onPhoto` button border / label `#F1F5F9` | 10.63:1 | 3 / 4.5 | pass |
| Muted `#94A3B8` | 4.54:1 | — | **not allowed** (no margin) |
| Brand green `#1F7A3A` | 2.16:1 | — | **not allowed** on a hero |

Horizontal scrim (desktop Flutter web ≥1024 and portal panel): left→right `0% α0.92 → 50% α0.80 → 100% α0.30`, plus a bottom layer `0% α0.85 → 30% α0` for the footer. Text stays in the left 50%. Two stacked layers combine as `1 − (1 − a1)(1 − a2)`; the guarantee uses the single layer under the text, so stacking only raises contrast.

**Implementation rule (testable):** `FFPhotoHero` measures the top of its text block and places the 0.80 stop at `textTop − 24px`. At 1.3× text scale the hero grows and the stop moves with it. A hero with any text pixel above the 0.80 stop fails AC-H3.

---

## 6. Screens A: mobile pre-sign-in

Common to all four:
- **Phone (360–430):** `FFPhotoHero` at the top, behind a transparent app bar (`extendBodyBehindAppBar`), status bar icons light (`SystemUiOverlayStyle.light`). Below it the existing form content on a solid surface (dark: ground; light: overlapping sheet). The whole page scrolls. When the keyboard opens, the focused field scrolls into view and the hero scrolls away; it never shrinks or animates.
- **Short phones (height <700):** hero height uses the lower value of each range below.
- **Tablet / narrow web (600–1023):** hero becomes a 280px band across the top with 24px radius at the bottom corners; content column max 420, centred.
- **Desktop Flutter web (≥1024):** split layout. Left 58%: `FFPhotoHero(variant: panel)` full height, horizontal scrim, logo top-left, headline at 48/52 bottom-left with 64px padding, mono footer. Right 42%: solid ground (dark `#020617` / light `#EEF2F7`) with the existing content column, max 420, vertically centred. App bar actions (theme, language) sit top-right of the right pane.
- **Logo:** athlete mark (24px) + wordmark, top-left inside the safe area, on the 0.50 top band. Shown on Language and Sign in only (Role and Sign up have a back button there).
- **Footer:** none. [OWNER 2026-10-19] No place line ("Dar es Salaam · Tanzania") on any hero.
- **Motion:** hero photo fades in over 250ms from `heroPlaceholder`; the existing content fade + 5% rise stays. Under `MediaQuery.disableAnimationsOf`, both are instant.
- **Back behaviour:** unchanged from today (Sign in back → Language; Role back → pop or Sign in; Sign up back → pop or Sign in). Android system back follows the same.
- **Deep links:** none new. Routes unchanged.

### 6.1 Language (`/language`)
**Purpose:** first screen; pick English or Kiswahili and feel the brand.
**Layout (phone):** `full` hero, 52–60% of the viewport (min 320). Eyebrow `FITFLEX AFRICA`; headline: the English tagline at display size ("Fitness without **limits.**"). **[OWNER 2026-10-19, second review] No Swahili tagline line under it** ("Pamoja tuna nguvu" removed; nothing replaces it). The Swahili speaker is addressed by the bilingual prompt and the "Kiswahili" tile directly below the hero. No footer. Below the hero: a bilingual prompt "Choose your language · Chagua lugha yako" (titleMedium), two tiles, Continue.
**Tiles:** titles in their own language: **English** and **Kiswahili** (today's "Swahili" title and "International Standard" subtitle go away; F-1). Each tile is a radio: `Semantics(inMutuallyExclusiveGroup: true, checked: selected, button: true, label: 'English' / 'Kiswahili')`, keyboard focusable, Space/Enter selects (F-3). Min height 64.
**Continue:** disabled until a tile is chosen. Its label shows in the **selected** language ("Continue" / "Endelea"); before a choice it reads "Continue · Endelea".
**States:** default (nothing selected), selected, no-photo fallback (high contrast / decode failure: `heroPlaceholder` ground, same text). No network on this screen, so no loading, offline or error states.
**After completion:** sets the locale, goes to Sign in (unchanged).
**Focus order:** theme toggle → hero text node ("FitFlex Africa. Fitness without limits.") → prompt → English → Kiswahili → Continue.

### 6.2 Sign in (`/auth`)
**Purpose:** returning users sign in; new users find *Create account*.
**Layout (phone):** `compact` hero, 34–40% of the viewport (min 240): logo, eyebrow `SIGN IN` (`auth.signIn`, uppercased), headline "Welcome **back.**", subline "Your pass, your QR and your progress, in one place." Then the existing form unchanged (Google, OR, identifier, CONTINUE, "Don't have an account? Create account").
**States:**
| State | Hero | Content |
|---|---|---|
| Default | as above | as today |
| Invalid input | unchanged | field error as today |
| Busy (Google / recovering web user) | unchanged; no spinner on the hero | buttons disabled + spinner, as today |
| Error dialog | unchanged | dialog; title and button translated (F-2): "Couldn't sign you in" / "Close" |
| Offline (Google returns `network-request-failed`) | unchanged | existing `auth.networkError` |
| No-photo fallback | navy ground | as today |
**After completion:** `routeForSignedInUser` (unchanged). Pre-cache the Home hero asset at this moment (§9).
**Focus order:** back → prefs buttons → hero text node → Google → identifier → Continue → Create account.

### 6.3 Choose role (`/role`)
**Purpose:** pick the account type before sign up.
**Layout (phone):** `compact` hero at **200px** fixed minimum (grows with text scale), no logo, no subline on the photo: eyebrow `CREATE ACCOUNT` (`auth.createAccount` uppercased), headline "Welcome to **FitFlex**" (`role.welcomeTitle`, accent = brand name; Swahili "Karibu **FitFlex**"). The existing subtitle `role.welcomeSubtitle` moves below the hero onto the solid surface, followed by the five tiles and Continue. The tiles must stay above the fold as much as possible; that is why the hero is small here.
**Tiles:** radio semantics as in 6.1 (F-3); role icon colours per canon (F-6): member `#1F7A3A` light / `#17B26A` dark, owner amber, trainer `#3B82F6`, vendor `#A855F7`, staff amber. Selected border = theme primary.
**States:** default, selected, mock-auth dev panel (unchanged, below tiles, dev builds only).
**After completion:** `auth.setRole`, push Sign up (unchanged).

### 6.4 Create account (`/auth/signup`)
**Purpose:** create the account for the chosen role.
**Layout (phone):** `compact` hero like Sign in (no logo; back button top-left). Eyebrow = the chosen role label uppercased (`role.member` etc.). Headline by role (§11.2), subline = the existing role body string (`role.memberBody` etc.). Then the existing form.
**Photo:** one shared sign-up photo for all roles in v1 (§8, H3); role photos are O-10.
**States:** as Sign in, plus the existing "phone sign-up unavailable" field error.
**After completion:** unchanged (code/PIN flow → onboarding or pending approval).

---

## 7. Screen B: member Home (`/member`)

**Purpose:** the first impression after registration, then the daily start screen: who you are, what your pass lets you do right now, one obvious next step.

### 7.1 Layout

**Phone (360–430):**
1. App bar is **transparent over the hero** on the Home tab only (other tabs unchanged). Title "FitFlex", inbox bell, prefs: icons `#F1F5F9` on the 0.50 top band. When the hero's bottom passes under the app bar, the bar becomes solid `surface` with normal icon colours (150ms; instant under reduced motion), and the status bar style switches back to the theme's.
2. **Offline banner** keeps its place directly under the app bar. On Home it is drawn on a **solid** `surface` strip (not translucent) over the hero top, then its amber tint, so it stays readable.
3. **Hero** (`FFPhotoHero`): `full` variant (min 360, ~50% of viewport) in the **no-pass, pending, ended** states; `compact` variant (min 260) in **QR states**, so the pass card rises above the fold.
4. **Solid content** (dark: ground; light: overlapping sheet with 24px top corners), 24px side padding:
   - QR states: pass card (as today, with F-4/F-5 fixes), then the ranked cards from `pickHomeCards` in today's order.
   - No-pass state: a **"How FitFlex works"** card (3 numbered steps, §11.3), then the ranked cards (today's activity "get started", goal, recommended gyms).
   - Pending / ended: the ranked cards.
5. Bottom navigation unchanged.

**Desktop Flutter web (≥840):** content column max 960, centred. The hero becomes a rounded (24px) banner inside the column, 16:6, horizontal scrim, text bottom-left, actions in a row. Pass card and cards below in the same column. App bar is solid (no transparency) at this width.

**Pull to refresh:** the shell `RefreshIndicator` stays; the hero scrolls with the list.

**Parallax (optional):** the photo moves at 0.3× scroll speed. Off under reduced motion, off on Flutter web, off on Android devices with <3 GB RAM if the builder has an easy check; otherwise off on Android too. If in doubt, ship without parallax.

### 7.2 Hero content by state

The state comes from the existing `passStateFor(data)` plus loading/offline. No new fields.

| State | Trigger (existing data) | Eyebrow | Headline | Subline | Chip | Primary action | Secondary | Pass card |
|---|---|---|---|---|---|---|---|---|
| **No pass (new member)** *(most important)* | `PassState.none` | greeting + name | "Let's get you **training.**" | `pass.state.none` "Pick a pass to open gyms across the network." | — | "Choose a pass" (`pass.state.choose`) → `/member/passes` | "Explore gyms" (`onPhoto`, sm) → `/member/gyms` | hidden; "How FitFlex works" card instead |
| Payment pending | `PassState.pending` | greeting + name | "One step **to go.**" | `pass.state.pending` | — | "View payment" (`pass.state.viewPayment`) → `/member/passes` | — | hidden |
| Ended | `PassState.ended` | greeting + name | "Ready to **come back?**" | `pass.state.ended` (with date; the card is hidden, so the date is said once) | — | "Pay again" (`pass.state.payAgain`) → `/member/passes` | "Explore gyms" | hidden |
| **Active** | `PassState.active` | greeting + name | "Ready to **train?**" | none | — | "Find a gym" → `/member/gyms` | — | shown (ring, used-of, ends, Show my QR, Upgrade plan) |
| **Expiring** | `PassState.endingSoon` | greeting + name | "Ready to **train?**" | none | Fuel "PASS ENDS SOON" | "Choose your next pass" → `/member/passes` | "Find a gym" (`onPhoto`) | shown; ring + badge in **Fuel**; its sentence carries the date |
| Low visits | `PassState.lowVisits` | greeting + name | "Ready to **train?**" | none | Fuel "FEW VISITS LEFT" | "Choose your next pass" | "Find a gym" | shown; ring in Fuel; the ring carries the number |
| Direct gym membership | `subscription.isDirect` | greeting + name | "Ready to **train?**" | none | Fuel chip only when `endingSoon` | "Find a gym" | — | shown as today (dates, days-left bar) |
| **Loading** | `data.me == null && !data.offline` | greeting only (`home.welcome` fallback name) | two `FFSkeletonLine`s, white at 12% (no shimmer under reduced motion) | — | — | none | — | 120px skeleton card (as today) |
| **Offline, data cached** | `offline && me != null` | as the cached state | as the cached state | as the cached state | as cached | as cached (navigation works offline; the destination screens handle their own state) | as cached | as cached |
| **Offline, nothing loaded** | `offline && me == null` | greeting only | "Fitness without **limits.**" (`splash.tagline`) | — | — | none | — | **`FFErrorState`** "We couldn't load your pass." + Retry (fixes F-4). Shell banner also shows. |
| **Error (non-network)** | profile request failed | same as offline-nothing-loaded | same | — | — | none | — | `FFErrorState` with the existing generic error text + Retry |
| Sponsored access | `sponsoredGymAccess && !hasActivePass` | — | **open (O-11)**; until decided, behave exactly as today's card | | | | | |

Greeting + name: `member.goodMorning|goodAfternoon|goodEvening` + ", " + `me.user.resolvedName`, uppercased in the eyebrow style, name ellipsised to fit 28 characters on one line (2 lines at 1.3×). The greeting thresholds stay as today (12:00, 17:00).

**Why the chip names the state but not the facts:** the pass card owns the number and the date (DD-4). The chip gives a Fuel cue at the top of the screen, three words at most. O-5 asks the owner to confirm.

**Not on Home's hero:** the QR, the visits ring, prices, gym counts, visit counts. Prices and counts would need glossary-tagged numbers or new fields.

### 7.3 Navigation
- Entry: after onboarding; the Home tab; app launch for signed-in members; notification deep links that already target `/member`.
- Hero actions use `context.go` to the existing routes, refreshing QR and profile first the same way `PassSummaryCard._go` does.
- Back on Home: unchanged (`handleRootBack`).
- After "Choose a pass" → purchase completes → returning to Home shows the `pending` or `active` hero.

### 7.4 Focus order and semantics
App bar (inbox bell, prefs) → offline banner Retry (when shown) → hero text node (eyebrow, headline, subline, chip read as one: "Good evening, Amina. Ready to train? Pass ends soon.") → hero primary → hero secondary → pass card / steps card → cards → bottom nav. The photo is excluded. The chip has no separate node. The ring keeps its existing label.

---

## 8. Imagery

### 8.1 Rules
1. **Sources, in order of preference:** (a) an own FitFlex shoot in Dar es Salaam; (b) partner gyms' photos with written consent for use in the FitFlex apps; (c) interim only: people-free licensed photos (§8.4).
2. **People:** only with a signed model release that covers in-app use. Until releases exist, use silhouettes, backs, hands, or no people. A person on Home must never be presented as a FitFlex member, trainer or partner unless they are one and have agreed in writing.
3. **Setting:** Tanzanian, preferably recognisable Dar es Salaam light and spaces (partner gym interiors, seafront at dawn). No snow, no foreign signage, no brand logos other than FitFlex. No AI-generated people.
4. **Licence record:** each shipped photo gets one row in `fitflexmobile/assets/photos/hero/LICENCES.md` and `fitflex-portal/public/photos/LICENCES.md`: file, source, photographer, licence, date obtained, model release reference, location/gym consent reference, permitted uses, expiry (if any). Same practice as `social/brand/photos/README.md`. **No row, no ship.**
5. **No text baked into photos.** Copy stays in the app so it can be translated.

### 8.2 Shot list

Safe zones are given as fractions of the delivered frame. "Text zone" must be calm and dark after grading; "focal" is where the subject sits.

| ID | Screen | Subject | Delivered crops | Focal point | Text zone (keep calm) | Logo zone |
|---|---|---|---|---|---|---|
| H1 | Language | Dawn seafront workout in Dar (e.g. a runner or a small warm-up group as backlit silhouettes, ocean light behind) | Phone 4:5 **1080×1350**; desktop panel 3:4 **1200×1600** | upper-right third | bottom 50%, full width | top-left 40% × 15% |
| H2 | Sign in | Partner gym, low-key light: hands chalking or gripping a barbell, no face | 4:5 1080×1350; panel 3:4 1200×1600 | right half, upper-middle | bottom 50% | top-left 40% × 15% |
| H3 | Sign up (all roles) | Arrival at a partner gym: a hand holding a phone at the reception or door, background softly out of focus. Any QR on the phone screen must be a dummy | 4:5 1080×1350; panel 3:4 | upper-right | bottom 50% | — |
| H4 | Choose role | Wide view of a busy gym floor, people small and blurred (or none), equipment rows | 16:9 **1280×720** (band) | top-centre | bottom 60% | — |
| H5 | Home, no pass / pending / ended | The strongest image: energetic movement (battle ropes, sled push, sprint start) in a Dar partner gym with natural window light; subject may be a released model or shot from behind | 4:5 1080×1350; web banner 16:6 **1600×600** | upper-right third | bottom 55% (phone); left 50% (web) | — |
| H6 | Home, QR states | Calmer: gym entrance or a rack of dumbbells at golden hour | 3:2 **1080×720** (compact hero is short); web 16:6 1600×600 | right third | bottom 60% | — |
| P1 | Portal login | A partner gym before opening: lights on, equipment rows, a Dar window view, no people | Panel 3:4 **1440×1800**; band 16:5 **1600×500** | upper-right | left 50% (panel), bottom 60% (band) | — |
| D1 | Empty-state band (optional, §10) | Detail shot (towel and bottle on a bench) | 16:7 **1200×525** | centre | no text on the band | — |

Phone widths 360–430 at 2× need 720–860px; the 1080px masters cover 2.5×. 3× phones get the 2× file scaled up, which is acceptable under an 80% scrim.

### 8.3 Grading
Cool shadows towards slate-navy, warm highlights, no crushed blacks in faces (if any). After grading, the text zone averages relative luminance ≤0.20 with no patch above 0.45. Export sRGB, strip metadata (incl. GPS) before committing.

### 8.4 Interim photos (until the shoot)
People-free photos already licensed and recorded in `social/brand/photos/README.md` (Pexels licence, checked 2026-10-16): `pexels-9545909` / `pexels-9545914` (gym equipment, TUBARONES PHOTOGRAPHY), `pexels-12250460` (treadmills), `pexels-29526371` (equipped gym), `pexels-4716814` (equipment), `pexels-3916766` / `pexels-5312212` (dumbbells). They are **not** Tanzanian, so they are a stop-gap; the owner decides whether to ship the flag with them (O-1). Photos with people from that folder are **not** used in the apps. **[2026-10-19, second review]** Owner decision 2 allows backs, hands and unclear faces, so the addendum (§26) uses four of them **cropped so that no face is in the frame**.

---

## 9. Performance

| Rule | Target |
|---|---|
| Format | Flutter: WebP (lossy, q≈60–70). Portal: AVIF first, WebP fallback via `<picture>`. |
| Size | ≤**150 KB** per hero at 2× (Flutter `2.0x/` variant); 1× variant ≤60 KB. Portal panel AVIF ≤120 KB, WebP ≤150 KB; if the 1440×1800 WebP cannot reach 150 KB, ship 1080×1350 instead. |
| Bundle cost | ≤1.2 MB added to the app for H1–H6 (both variants). Report the APK/IPA/web build size change in the PR. |
| Location | Mobile `assets/photos/hero/` (+ `2.0x/`), declared in `pubspec.yaml`. Portal `public/photos/`. |
| Network | **No remote image request** from any hero, ever. On Flutter web, assets come from the app's own hosting (and its service worker cache); no third-party host. |
| Placeholder | Solid `heroPlaceholder` `#0B192C` painted in the first frame, photo fades in when decoded (250ms, instant under reduced motion). No layout shift: the hero size never depends on the image. |
| Pre-caching | Language/Sign in/Role/Sign up heroes: `precacheImage` during the splash. Home heroes (H5, H6): pre-cache when sign-in or sign-up completes and on app start for signed-in members. |
| Memory | Decode at display size (`cacheWidth`); one hero image alive per screen. |
| Reduced data | Mobile: nothing to save (bundled). Portal: `@media (prefers-reduced-data: reduce)` serves no panel photo (navy ground only). |
| High contrast | Mobile `MediaQuery.highContrastOf` true, or portal `@media (prefers-contrast: more)`: no photo, navy ground, same text. |
| Portal static export | `next/image` optimisation is not available (`output: 'export'`); use plain `<picture>` with explicit `width`/`height` and `decoding="async"`. The login panel image may use `fetchpriority="high"` because it is above the fold. |

---

## 10. Optional D: empty-state photo band

**Recommendation:** extend `FFEmptyState` with an optional `band` (bundled asset, D1). The band is a 16:7 photo strip with 16px top corners **above** the icon, title and body; **no text sits on the photo**, so it needs no scrim and adds no contrast risk. Use it for at most one prominent, screen-level empty state per screen (e.g. "No sessions booked yet" on the member's trainer sessions list), never inside lists or repeated cards. It is hidden under high contrast and when the available height is below 560px. The photo is excluded from semantics. Copy stays the existing empty-state copy per screen.

---

## 11. Copy (English + Swahili)

All Swahili is **draft for native review** (the author is not a native speaker). Glossary followed: gym = "gym", visit = "ziara", pass = "pasi", trainer = "Trainer", tap = "gusa" (app) / "bonyeza" (portal). Accent part in **bold**; builders store lead and accent as separate keys so the accent can be styled.

### 11.1 Reused keys (no new translation)
`splash.tagline` (EN "Fitness Without Limits", SW "Pamoja Tuna Nguvu"; the owner kept this Swahili tagline as-is in the splash work, so it is reused rather than translated literally), `lang.title`, `lang.continue`, `auth.signIn`, `auth.createAccount`, `role.welcomeTitle`, `role.welcomeSubtitle`, `role.member|owner|trainer|vendor|staff`, `role.*Body`, `member.goodMorning|goodAfternoon|goodEvening`, `home.welcome`, `pass.state.none|pending|ended|choose|viewPayment|payAgain`, `home.retry`, `offline.banner`.

For the headline split, the tagline needs lead/accent keys in sentence case (`hero.tagline.lead` / `hero.tagline.accent`): EN "Fitness without" / "**limits.**"; SW "Pamoja tuna" / "**nguvu.**" **[2026-10-19, second review]** The Language screen no longer shows the Swahili value (it shows the English tagline only, §19). The Swahili value is still used by the Home hero in the "offline, nothing loaded" / error state when the app is in Swahili (O-20).

### 11.2 New keys

| Key | English | Swahili (native review) | EN / SW chars |
|---|---|---|---|
| `hero.eyebrow.brand` | FITFLEX AFRICA | FITFLEX AFRICA | 14 / 14 |
| `hero.lang.prompt` | Choose your language · Chagua lugha yako | (same, bilingual by design) | 40 |
| `hero.lang.continueBoth` | Continue · Endelea | (same) | 18 |
| `hero.signIn.lead` / `.accent` | Welcome / **back.** | Karibu / **tena.** | 13 / 12 |
| `hero.signIn.sub` | Your pass, your QR and your progress, in one place. | Pasi yako, QR yako na maendeleo yako, mahali pamoja. | 51 / 52 |
| `hero.role.accent` | (accent = "FitFlex" inside `role.welcomeTitle`) | (accent = "FitFlex") | — |
| `hero.signUp.member` | One pass. / **Many gyms.** | Pasi moja. / **Gym nyingi.** | 20 / 22 |
| `hero.signUp.owner` | Grow your / **gym.** | Kuza / **gym yako.** | 14 / 14 |
| `hero.signUp.trainer` | Coach on / **your terms.** | Fundisha kwa / **njia yako.** | 20 / 23 |
| `hero.signUp.vendor` | Sell to people / **who train.** | Uza kwa / **wanaofanya mazoezi.** | 25 / 27 |
| `hero.signUp.staff` | Welcome to / **the team.** | Karibu / **kwenye timu.** | 20 / 19 |
| `home.hero.none` | Let's get you / **training.** | Tuanze / **mazoezi.** | 23 / 15 |
| `home.hero.pending` | One step / **to go.** | Hatua / **moja tu.** | 15 / 14 |
| `home.hero.ended` | Ready to / **come back?** | Uko tayari / **kurudi?** | 19 / 18 |
| `home.hero.active` | Ready to / **train?** | Tayari kwa / **mazoezi?** | 15 / 19 |
| `home.hero.findGym` | Find a gym | Tafuta gym | 10 / 10 |
| `home.hero.exploreGyms` | Explore gyms | Tazama gym | 12 / 10 |
| `home.hero.nextPass` | Choose your next pass | Chagua pasi yako ijayo | 21 / 22 |
| `home.hero.chip.endingSoon` | PASS ENDS SOON | PASI INAISHA KARIBUNI | 14 / 21 |
| `home.hero.chip.lowVisits` | FEW VISITS LEFT | ZIARA ZIMEBAKI CHACHE | 15 / 21 |
| `home.how.title` | How FitFlex works | Jinsi FitFlex inavyofanya kazi | 17 / 30 |
| `home.how.step1` | Choose a pass that fits your month. | Chagua pasi inayokufaa kwa mwezi wako. | 35 / 38 |
| `home.how.step2` | Show your QR at a partner gym. | Onyesha QR yako kwenye gym mshirika. | 30 / 36 |
| `home.how.step3` | Train, and track every visit here. | Fanya mazoezi, na fuatilia kila ziara hapa. | 34 / 43 |
| `home.passError.title` | We couldn't load your pass. | Hatukuweza kupakia pasi yako. | 27 / 29 |
| `auth.errorDialog.title` (F-2) | Couldn't sign you in | Hatukuweza kukuingiza | 20 / 21 |
| `common.close` (F-2; **exists**, reuse) | Close | Funga | 5 / 5 |
| Portal `login.hero.eyebrow` | FITFLEX PORTAL | PORTAL YA FITFLEX | 14 / 17 |
| Portal `login.hero.lead` / `.accent` | Run it all from / **one place.** | Simamia kila kitu / **mahali pamoja.** | 26 / 32 |
| Portal `login.hero.sub` | Check-ins, members, statements and programmes for FitFlex partners and companies. | Mahudhurio, wanachama, taarifa za malipo na programu kwa washirika wa FitFlex na makampuni. | 81 / 91 |

Notes: "Many gyms" / "Gym nyingi" describes the product (a pass opens gyms across the network, as `pass.state.none` already says) and makes no count claim. "Mshirika" (partner) and "taarifa za malipo" (statements) need native confirmation.

---

## 12. Screen C: portal login (`/login`)

**Purpose:** operators, admins and company HR sign in. A calm, confident first view of the portal.

**Layout:**
- **Desktop (≥1024):** the Shell's 64px white login header stays (logo, "FitFlex Af", language toggle) so the language control does not move. Below it, two columns at full remaining height:
  - Left 55%: `PhotoPanel` with P1, horizontal scrim (§5.2), content bottom-left with 64px padding: eyebrow, headline 48/52 Inter 900 (lead `#F1F5F9`, accent `--color-brand-500`), subline 16/24 `#CBD5E1` (no footer, owner 2026-10-19). **No logo on the panel** (the header has it), so the "logo on busy photo" rule is not engaged.
  - Right 45%: **Calm canvas** `--color-bg-canvas` (`#F7F5F0`) with the existing white `Card`, max width 384, vertically centred. Inside the card, unchanged: `login.heading`, `login.assignedAccount`, Google / email / HR / verify steps. The "FF" square is replaced by nothing (the header carries the logo) (F-7). `login.noSelfRegistration` stays under the card.
- **Tablet (640–1023):** P1 band 16:5 at 220px under the header (bottom scrim, text bottom-left), then the Calm canvas and card.
- **Phone (<640):** band at 160px with only the eyebrow and headline (no subline), then the card. Under `prefers-reduced-data`, no band.
- **Colours:** Calm stays a page ground only; the card is white; inputs, Alerts and focus stay as today. **No Volt** on this page (light page, green CTAs). The focus outline (`--color-brand-600`, 7.96:1 on white, 7.31:1 on Calm) is unchanged. The panel has no focusable elements.
- **Divider fix:** the "or" label background is `--color-bg-primary` (white), which already matches the white card. Unchanged.

**States** (all inside the card; the panel never changes): choose, email, HR, verify (with notice), busy (spinner in button), error `Alert`, session restoring (`ready=false`: the Shell shows only the header today; with the flag on it shows the header plus the navy panel ground without text, so nothing jumps when the page appears), image not yet loaded (navy `#0B192C` panel, photo fades in 250ms, instant with `prefers-reduced-motion`).

**Semantics:** `<picture>` with `alt=""` and `role="presentation"`; panel text in a `<section aria-labelledby>` whose headline is a `<p>` styled large (the page's `<h1>` stays `login.heading` in the card, so there is one h1). Tab order: header language toggle → Google → email method → HR method (→ form fields in each step) → back links. The panel is skipped by Tab.

**Navigation:** unchanged (`handleSuccess` routes admin → `/admin`, org users → their home, HR → `/hr`, others → `/dashboard`).

---

## 13. Flags and fallback

| Flag | Where | Default | Off = | On = |
|---|---|---|---|---|
| `PHOTO_HERO_UI` | mobile, compile-time `--dart-define=PHOTO_HERO_UI=true` (same pattern as `kSplashAnimation`, `kServerDiscovery`) | **off** | today's Language, Sign in, Role, Sign up and Home, unchanged | screens per §6–7 |
| `NEXT_PUBLIC_PHOTO_HERO_UI` | portal, build-time env | **off** | today's login | §12 |

Why compile-time on mobile: the pre-sign-in screens appear before any server call, and the owner asked for no network on first launch. The cost: turning it on in production needs a new build. A server switch (via the existing pre-sign-in `/auth/options` call) is possible later (O-12; backend field B-1).

The F-1…F-4 and F-6 fixes are safe to ship **outside** the flag; the planner decides. F-5 (Fuel on the pass card) ships under the flag because it changes the look of an approved card.

---

## 14. Backend fields

**Nothing new is required.** Fields used, all already read by the app (for `contract-checker` to confirm they are still sent as named):
- `GET /me` → `user.resolvedName`, `hasActivePass`, `visitCap`, `visitsUsed`, `subscription{tier, status, startedAt, expiresAt, isDirect, daysLeft, isExpired, homeGym.name}`, `pendingPayment`, `pendingPayments[]{productType, tier, gymId}`, `needsOnboarding`.
- Member shell state: `sponsoredGymAccess`, `offline`.

Optional, only if O-12 chooses a server switch:
- **B-1** `GET /auth/options` → `photoHeroUi: boolean` (default false). Not built; not needed for v1.

Not used, on purpose: gym counts, prices, member counts (would need glossary-tagged numbers or new endpoints).

---

## 15. Acceptance criteria

Checked on Flutter web built from RC (phone widths 360, 390, 430; desktop 1280) and the portal (375, 768, 1280), light and dark, English and Swahili, text scale 1.0 and 1.3. Items needing a real device are marked **[device]**.

**Flags**
- AC-F1 With `PHOTO_HERO_UI` off, Language, Sign in, Role, Sign up and Home look and behave exactly as on RC before this change (existing widget tests pass unchanged).
- AC-F2 With `NEXT_PUBLIC_PHOTO_HERO_UI` off, `/login` is unchanged and `tests/e2e/login.spec.ts` and `portal-operator-sign-in.spec.ts` pass.
- AC-F3 With the flags on, every existing `Key` used by tests (`login-identifier`, `login-continue`, `langEnglish`, `langKiswahili`, `member-home`, `pass-primary-action`, `pass-visits-ring`, `google-submit`, `email-method-btn`, `hr-method-btn`, …) still exists and works.

**Hero (all screens)**
- AC-H1 The photo is bundled. In the browser network panel, loading any hero screen makes no request to a host other than the app's own origin.
- AC-H2 Every hero asset is ≤150 KB (2× WebP; portal AVIF ≤120 KB); the PR lists the file sizes and the build size change.
- AC-H3 With the hero photo replaced by a pure-white test image, every text element on every hero measures ≥4.5:1 (body) / ≥3:1 (headline, accent), and app bar icons ≥3:1, at text scale 1.0 and 1.3, in both themes.
- AC-H4 No text, chip or control sits in the 0.50→0.80 transition zone; no hero uses `#94A3B8` or `#1F7A3A` for text.
- AC-H5 The accent word is Volt only in dark theme; in light theme and on the portal it is `#17B26A` and only at ≥24px w800. No gradient text anywhere.
- AC-H6 No Volt appears on a light-theme screen (hero or below).
- AC-H7 The photo is absent from the accessibility tree; eyebrow + headline + subline (+ chip) are one node marked as a header; each action is its own labelled button.
- AC-H8 At text scale 1.3 nothing clips or overlaps; the hero grows; the headline wraps to ≤4 lines in both languages.
- AC-H9 With reduced motion on, the photo appears without fade, the content without the rise, and there is no parallax.
- AC-H10 With high contrast on (iOS/Android **[device]**; portal `prefers-contrast: more` in DevTools), the hero shows the navy ground without a photo and the same text.
- AC-H11 The first frame shows the navy placeholder at the final hero size; there is no layout shift when the photo appears.
- AC-H12 Every hero photo has a row in the repo's `LICENCES.md` with source, licence, date, and model/location release references (or "no people").
- AC-H13 No photo in the apps shows an identifiable person without a release reference in `LICENCES.md`.
- AC-H14 All touch targets on and below heroes are ≥44px (FFButton sm keeps its 48px hit area).
- AC-H15 Keyboard focus is visible on every control on and below the hero (V2 outline ring, not an overlay), including the Volt CTA.

**A. Pre-sign-in**
- AC-A1 Language shows the English tagline only (no Swahili tagline line; superseded 2026-10-19, see AC-A10); the tiles read "English" and "Kiswahili"; no hardcoded English remains in `language_screen.dart` (F-1).
- AC-A2 Language tiles are reachable by Tab, selectable with Space/Enter, and announce as selected/not selected radio options (F-3). Same for role tiles.
- AC-A3 Continue on Language is disabled until a choice is made and then shows its label in the chosen language.
- AC-A4 Sign in: the form below the hero is identical in fields, order and behaviour to today; on a 360×640 viewport with the keyboard open (simulated by reducing viewport height to 360), the identifier field and Continue are visible after focusing the field.
- AC-A5 Role: on a 390×844 viewport at 1.0×, the first two role tiles are visible without scrolling.
- AC-A6 Sign up: the eyebrow and headline match the chosen role (§11.2); the subline is the role's existing body string.
- AC-A7 Desktop (≥1024): Language, Sign in, Role and Sign up show the split layout; the form column is ≤420 wide and vertically centred.
- AC-A8 Error dialogs on Sign in/Sign up are fully translated (F-2).
- AC-A9 The logo on the photo is the athlete mark + wordmark with gold "Af", sitting on the 0.50 band, never the navy pin.

**B. Home**
- AC-B1 New member with no pass (seed account with no subscription): full hero, headline "Let's get you training." / "Tuanze mazoezi.", subline = `pass.state.none`, primary "Choose a pass" → `/member/passes`, secondary "Explore gyms" → `/member/gyms`; **no pass card**; "How FitFlex works" card with 3 steps follows.
- AC-B2 Active pass: compact hero "Ready to train?", primary "Find a gym" → `/member/gyms`; pass card shown; **no number, visits count or date appears in the hero**.
- AC-B3 Ending soon (seed pass ending within 3 days): Fuel chip "PASS ENDS SOON" in the hero, primary "Choose your next pass"; the pass card's ring and badge use Fuel; the end date appears **only** on the card.
- AC-B4 Low visits: Fuel chip "FEW VISITS LEFT"; the number of visits appears only inside the ring.
- AC-B5 Pending payment: hero headline "One step to go.", subline = `pass.state.pending`, primary "View payment"; no pass card.
- AC-B6 Ended: hero subline contains the end date; primary "Pay again"; no pass card; the date appears once on the screen.
- AC-B7 Loading: hero photo and greeting visible immediately; skeleton lines instead of the headline; no CTA; pass skeleton below. Never "No pass yet" while loading.
- AC-B8 Offline with nothing loaded: the shell banner shows; the hero shows the tagline and no CTA; the pass slot shows "We couldn't load your pass." with Retry; it never says "No pass yet" (F-4).
- AC-B9 Offline with cached data: the hero shows the cached state; the banner shows; nothing else changes.
- AC-B10 The app bar is transparent over the hero and becomes solid once scrolled past it; icons stay ≥3:1 throughout.
- AC-B11 The QR is never shown on the photo; Show my QR remains on the solid pass card.
- AC-B12 In light theme the content sheet overlaps the hero by 24px with 24px top corners; in dark theme the hero fades into the page ground with no visible edge.
- AC-B13 Desktop web (≥840): the hero is a rounded banner in a ≤960 column; the app bar is solid.
- AC-B14 Every new Home string exists in both maps and differs from English where a translation is expected (existing i18n test pattern).

**C. Portal login**
- AC-C1 At 1280px: photo panel left (~55%), Calm canvas right, white card unchanged inside; the header with logo and language toggle unchanged.
- AC-C2 The page has exactly one `<h1>` (`login.heading`, in the card); the panel image has `alt=""`; Tab never stops in the panel.
- AC-C3 At 768px a 220px band shows above the card; at 375px a 160px band with eyebrow and headline only.
- AC-C4 With `prefers-reduced-data: reduce` emulated, no panel image is requested.
- AC-C5 All four card steps (choose, email, HR, verify) and the error/notice alerts look and work as today.
- AC-C6 No Volt on the page; the accent is `--color-brand-500` at ≥24px.
- AC-C7 Session restore (`ready=false`) shows header + navy panel ground, with no jump when the page becomes ready.

**D. Empty band (if built)**
- AC-D1 No text overlaps the band; the band is hidden under high contrast and below 560px of available height; it is excluded from semantics.

---

## 16. Open questions for the owner

| # | Question | Default if no answer |
|---|---|---|
| O-1 | **Photo source.** Commission an own shoot in Dar es Salaam (partner gyms, seafront), collect partner gym photos with written consent, or ship first with the people-free licensed stock (not Tanzanian)? | Build with interim people-free stock behind the flag; do not turn the flag on until own photos exist. |
| O-2 | **People in heroes.** May identifiable people appear (with model releases covering app use), or silhouettes/backs/hands only? | Silhouettes, backs and hands only. |
| O-3 | **Headline copy.** Approve §11.2, especially Home "Let's get you training." / "Tuanze mazoezi." and the role-specific sign-up headlines. Alternatives for Home: "Your city is your gym." / "Jiji lako ni gym yako." | Use §11.2. |
| O-4 | ~~**Swahili tagline.** Keep "Pamoja tuna nguvu" (as on the splash) for the photo heroes, or use a literal line such as "Siha bila kikomo" (draft, native review)?~~ | **Answered 2026-10-19 (second review):** removed from the Language hero, nothing replaces it. Other uses: O-20. |
| O-5 | **State chip on Home.** For ending-soon and low-visits, is a three-word Fuel chip in the hero acceptable, or should the hero say nothing and leave it all to the card? | Show the chip. |
| O-6 | **Hide the pass card** in no-pass, pending and ended states, with the hero carrying the message and the button? | Hide it. |
| O-7 | **Fuel on the pass card** (ring + badge) for ending soon and low visits, replacing amber, as canon V2 says? | Yes, under the flag. |
| O-8 | **Gradient word in marketing.** Add a canon line: "The green→amber headline gradient is for marketing (decks, social) only, never in product UI"? | Add it after approval. |
| O-9 | **Time-of-day photos** on Home (morning / evening variants, about +300 KB)? | No; one photo per state group. |
| O-10 | **Role-specific sign-up photos** (owner, trainer, vendor) instead of one shared photo (about +450 KB)? | One shared photo. |
| O-11 | **Sponsored members** (gym access through an employer or other sponsor, no own pass): what should the Home hero and pass card say? Today's code does not show sponsorship on the card. | Behave as today until decided. |
| O-12 | **Flag mechanism.** Compile-time (needs a new build to turn on) or a server switch via `/auth/options` (small backend change, B-1)? | Compile-time. |
| O-13 | **Portal headline audience.** "Run it all from one place." speaks to operators, admins and HR together. Prefer an owner-focused line? | Use it as written. |

---

## 17. Known gaps to keep in view
- Legal texts in the app remain drafts pending Tanzanian counsel (not touched here).
- Vendor and trainer settlement exist in code (weekly statements) but vendor settlement has not been tried by hand.
- All new flags stay off. V2 dark-theme QR scanning on a real phone is still not verified **[device]**; this spec keeps the QR off the photo, so it adds no new scanning risk.
- Swahili in this spec is unreviewed by a native speaker.
- The app's brand ramp (`#067647`) still differs from canon `#1F7A3A` (pre-existing, not changed here).

---
---

# Addendum 2026-10-19: more screens (owner's second review)

## 18. Scope and what changed

The owner reviewed the photo-hero preview on a phone on 2026-10-19, said it is OK, and asked for six changes (owner-decision block at the top of this file). This addendum specifies them. Everything in §1–§17 still applies unless a section below says otherwise.

| # | Owner ask | Where in this addendum | Placement | Variant |
|---|---|---|---|---|
| 1 | Remove "Pamoja tuna nguvu" from the Language hero | §19 | unchanged | `full` |
| 2 | Member Profile | §21 | edge-to-edge under the shell's transparent app bar (as Home) | `compact` |
| 3 | PIN entry (+ setup / reset / register, recommended) | §22 | edge-to-edge under the screen's transparent app bar | `compact`; hidden on short screens |
| 4 | Upgrade plan | §23 | inset band under the page's solid app bar | **`band`** (new, §20) |
| 5 | Activity: Today, Training, Challenges, Progress, each with its own photo | §24 | edge-to-edge under the shell's transparent app bar | `compact` |
| 6 | Trainer, Vendor, Gym owner homes | §25 | inset band under the solid app bar | **`band`** |

Real names in the code (read from `fitflexmobile` `origin/main`, 75e9d27):

| Screen | Route | File | Notes |
|---|---|---|---|
| Member Profile | `/member/profile` (shell tab) | `lib/screens/member/member_profile_tab.dart` | Inside the member `ShellRoute`; shell app bar + bottom nav. |
| PIN entry | `/auth/email` (`AppRoutes.emailAuth`) | `lib/screens/email_auth_screen.dart` | `EmailAuthScreen`, modes `signIn` / `signUp`. Own `Scaffold`; `CustomKeypad` (no system keyboard), `PinInputRow`. |
| PIN flows | pushed with `MaterialPageRoute` | `lib/screens/pin_flows.dart` | `RegisterFlowScreen`, `ForgotPinScreen`, `PinSetupScreen` (all via `_flowScaffold`), `ChoosePinStep` (keypad, fixed 300 tall), `CodeStep` (text field). |
| Upgrade plan | `/member/passes` (shell) | `lib/screens/member/member_passes_page.dart` | One route, two modes: **upgrade** (`hasActivePass` → `_UpgradeGate`) and **buy** (`normalList`). Has its own nested `Scaffold` + `AppBar` (back, "FitFlex Pass", `member.planBody` subtitle) inside the shell. Entry: pass card "Upgrade plan" / Home "Choose a pass". |
| Activity | `/member/activity`, `/member/activity/progress` | `lib/screens/member/member_activity_tab.dart` | `FFSegmented` sections `overview` / `workouts` / `challenges` / `progress`, labelled `activity.overview` "Today" / `activity.workouts` "Training" / `activity.challenges` "Challenges" / `activity.progress` "Progress" (SW "Leo" / "Mazoezi" / "Challenges" / "Maendeleo"). |
| Trainer home | `/trainer/home` | `lib/screens/trainer/trainer_home_page.dart` | `IndexedStack`, Home tab = `_dashboardTab()`. Solid app bar `trainer.dashboard` with QR, inbox, prefs. |
| Vendor home | `/vendor/home` | `lib/screens/vendor/vendor_home_page.dart` | No dashboard; lands on **Products** (`_productsTab`) or the first section a staff user may open. Solid app bar with inbox, persona switch, Change PIN, sign out. FAB "Add product" on Products. |
| Gym owner home | `/owner/home` (owner `ShellRoute`) | `lib/screens/owner/owner_home_tab.dart` | App bar is `FFOwnerDashboardBar` (gym picker, avatar). Greeting, date filter, Check-in button, quick actions, metric cards, chart, latest check-ins, tiles. |

---

## 19. Change to the Language screen (owner ask 1)

- Remove the second headline line ("Pamoja tuna **nguvu.**"). The hero shows: eyebrow `FITFLEX AFRICA`, headline "Fitness without **limits.**". **Nothing replaces the removed line** (owner preference). No subline is added.
- The hero keeps its height (52–60% of the viewport, min 320). The text block is about 38px shorter, so more photo shows above it; the 0.80 scrim stop still sits 24px above the eyebrow (§5.2).
- Semantics: the hero node reads "FitFlex Africa. Fitness without limits." (§6.1 updated).
- Code note for the builder: `language_screen.dart` stops passing `secondLead` / `secondAccent`. Nothing else uses them, so remove those two props and their branch from `FFPhotoHero` (dead code), and their test expectations.
- The `hero.tagline.*` Swahili values stay, because the Home hero uses them in its offline / error state when the app is in Swahili. Whether that should change too is O-20.
- §6.1, §11.1, O-4 and AC-A1 are updated in place. New check: AC-A10.

---

## 20. Shared component changes (reuse first)

All screens below reuse `FFPhotoHero`, `FFPhotoHeroPage`, `FFHeroSheet`, `FFOnPhotoTheme`, `FFButton` (`primary` + `onPhoto`), `FFSkeleton` and the scrim tokens (§3.3) as built. The changes are small and each has a reason:

| # | Change | Why nothing existing fits |
|---|---|---|
| C-1 | **New variant `FFHeroVariant.band`**: an inset card inside the page padding. 24px corners (`radiusXl`), no `topInset`, no light-theme sheet overlap (no extra 24px bottom padding), no dark-theme melt (the bottom edge stays at 0.80: it is a card with a visible edge). Same vertical scrim rule as `compact` (0.50 top → 0.80 from `textTop − 24px`). At content width ≥840 the builder passes `panel` + `rounded: true` instead (the existing desktop Home banner). | `compact` assumes it sits under a transparent app bar and under an overlapping sheet. Upgrade and the partner homes keep their solid app bars (§23, §25), so the hero has to be a card in the content. |
| C-2 | **`FFHeroPhoto` gets 10 values and a `focal` alignment** (§26), used as the `Image.alignment` for `BoxFit.cover`. Existing values get `Alignment.center` (no visual change). | One file serves 360–430px phones (≈1.2:1 box) and ≥840 banners (≈3:1 box); without a focal point `cover` cuts the subject (e.g. the hand on the PIN photo). |
| C-3 | **Optional `leading` widget** above the eyebrow, excluded from semantics. Used only by Profile for the avatar (§21). | No slot exists for an image above the text. |
| C-4 | **Photo and text cross-fade when `photo` or the text changes**: `_HeroPhotoLayer` wraps the image in an `AnimatedSwitcher` keyed by `photo` (250ms ease-out); the text column uses a 200ms fade. Both are `Duration.zero` under `MediaQuery.disableAnimationsOf`. Height changes (only possible at large text scales) use `AnimatedSize` 200ms, also instant under reduced motion. | Needed for the Activity section switch (§24). Today the photo layer has no transition between two photos. |
| C-5 | **Remove `secondLead` / `secondAccent`** (§19). | Dead code after owner ask 1. |
| C-6 | **`FFPhotoHeroPage`: optional `heroMinViewportHeight` and `pinnedContent`**. With `pinnedContent: true` the content has a fixed height at the bottom and the hero takes the remaining height (no scroll). When the viewport is shorter than `heroMinViewportHeight`, the page renders **without a hero**: today's solid layout, title on the surface. | The PIN keypad must stay fully on screen (§22). A hero that pushed the OK key below the fold would be a regression. |
| C-7 | **Generalise the member shell's `heroHome`** to a set of hero routes: `memberHome`, `memberActivity` (incl. `/member/activity/progress`) and `memberProfile`, at width <840, flag on. Transparent bar until the hero passes under it, then solid (the existing `HomeHeroAppBarNotification` mechanism; rename to `HeroAppBarNotification` if the builder likes). The offline strip keeps its solid place under the bar on these tabs, as on Home. | The same behaviour Home already has; avoids a second implementation. |

No change to `FFButton`, `FFSegmented`, `CustomKeypad`, `PinInputRow`, `FFOwnerDashboardBar`, `MembershipCard`, `PassSummaryCard`, chart widgets, or the trainer/vendor/owner tiles.

**Colour rules (unchanged, restated for partner homes):** the hero is an always-dark island in both themes. The accent word is **Volt `#C8F04A` in dark theme** and **`#17B26A` in light theme** (≥24px, w800 only). The hero primary button is `FFButton` primary, which in V2 is **Volt fill with on-volt label in dark theme** and **green `#067647` with white label in light theme**; the secondary is `onPhoto`. No Volt on light grounds (AC-H6).

---

## 21. Member Profile (owner ask 2)

**Purpose:** make the member's own space feel personal and premium; who you are and what plan you are on, then settings.

**Layout, phone (<840):**
1. Shell app bar transparent over the hero (C-7); icons `#F1F5F9` on the 0.50 band; solid once the hero passes under it.
2. **Hero** `compact`, `minHeight = clamp(viewport × 0.30, 240, ∞)`, photo `profile` (§26).
   - `leading`: the existing `FFAvatar` (`me.user.photoUrl` or initials), size `lg`, with a 2px `heroText` ring (10.6:1 against the 0.80 scrim, so its edge is visible on any photo). Sits at the top of the text zone, i.e. below the 0.80 stop.
   - Eyebrow: `member.profile` → "PROFILE" / "WASIFU".
   - Headline: the member's name (`me.user.resolvedName`), lead only, **no accent word** (an accent-coloured name reads as a link, and accents are for brand phrases). Max 2 lines, then ellipsis (3 at 1.3×).
   - No subline, no chip, **no actions** (Edit profile already exists as the first settings tile; no duplicate).
3. **Solid content** (`FFHeroSheet`): the plan badge row (the existing `FFBadge` from the profile card: tier / direct plan / pending / "No pass yet", tone from `passState.badgeTone`), then the existing state `FFAlert` (`profile-pass-state`), `MembershipCard`, "Account settings" and all tiles, sign out. The old profile `FFCard` (avatar + name + badge) is **removed under the flag**: avatar and name moved to the hero, the badge stays on the surface.

**Desktop (≥840):** shell bar solid; hero is the rounded `panel` banner (16:6, ≤960 column, as Home §7.1), avatar left of the text block.

**States:**

| State | Trigger (existing) | Hero | Content |
|---|---|---|---|
| Loaded | `me != null` | avatar, "PROFILE", name | as above |
| Loading | `me == null && !offline` | avatar placeholder (initials circle with "?" replaced by an `FFSkeleton` circle), eyebrow, `headlineLoading` (two skeleton lines) | badge slot skeleton; tiles render (they need no data) |
| Offline, cached | `offline && me != null` | as loaded | shell offline strip; as today |
| Offline / error, nothing loaded | `me == null && offline` or profile request failed | eyebrow only, headline = name fallback (F-9) | badge shows `pass.state.noPass` today, which is wrong when offline: under the flag show nothing in the badge slot and keep the shell banner + Retry |
| No photo (high contrast / decode failure) | — | navy `heroPlaceholder`, same text | — |

**F-9 (existing bug, i18n):** `member_profile_tab.dart` falls back to the hardcoded English `'Member'` when there is no name. Fix inside or outside the flag with a new key `member.nameFallback` ("Member" / "Mwanachama").

**Navigation:** entry = Profile tab; deep links unchanged (`/member/profile`). Back = shell root back (unchanged). Tiles route as today.

**Focus order / semantics:** app bar (inbox, prefs) → offline Retry (if shown) → hero node, read once: "Profile. Amina Juma." (avatar excluded) → plan badge → state alert → Membership card → tiles in order → Sign out → bottom nav.

---

## 22. PIN entry and PIN flows (owner ask 3)

### 22.1 PIN entry (`EmailAuthScreen`, `/auth/email`)

**Purpose:** the last step of sign-in (or the "Create PIN" step of sign-up). The keypad is the job; the hero is a calm, branded frame around it.

**Layout, phone:** `FFPhotoHeroPage` with `pinnedContent: true` and `heroMinViewportHeight` (C-6).
- **Hero** (`compact`, photo `pin`, fills the height left above the pinned content, min 200): back button and prefs in the transparent app bar (`FFOnPhotoTheme`), no logo. Eyebrow: `auth.verificationPin` (sign in) / `auth.createPin` (sign up), uppercased. Headline: sign in "One last **step.**"; sign up "A PIN only **you know.**" (§27). **Subline: the identifier echo** (`widget.initialEmail`, the number or email the user typed), `heroTextBody`, max 2 lines, ellipsis. Today this echo is coloured primary on the surface; on the hero it is plain text, 7.8:1.
- **Pinned solid content** (`FFHeroSheet`, max width 400, centred): `PinInputRow` + show/hide toggle (unchanged), then `CustomKeypad` at a **fixed height**: 4 rows of 68px (keys 52px tall + 16px gaps) when the viewport is ≥844 tall, 4 rows of 60px (keys 44px) below that; then "Forgot PIN? Reset" and the recovery links (unchanged conditions).
- **The keypad, the dots, the show/hide toggle and every link sit on the solid sheet, never on the photo.**

**Short screens (the rule, C-6):** the hero is shown only if `viewport height − pinned content height ≥ 200` (phone) at the current text scale. With the pinned content at about 460–500px this means **viewport height ≥ about 760**. Below that (e.g. 360×640, landscape, small desktop windows) the screen renders exactly today's layout (no hero). Text scale above 1.15 also falls back to today's layout if the hero text would not fit. This is deliberate: the OK key must never move below the fold.

**Keyboard:** `CustomKeypad` replaces the system keyboard, so no soft keyboard opens on this screen. If a hardware keyboard is used on Flutter web, behaviour is unchanged (not specified by this spec).

**Tablet / narrow web (600–1023):** 280px band hero only when `height − pinned ≥ 280`; else no hero. **Desktop (≥1024):** split layout as Sign in (§6): `panel` left 58% with eyebrow, headline and the echo; right 42% the dots, keypad (fixed 4 × 68) and links, vertically centred.

**States:**

| State | Hero | Solid content |
|---|---|---|
| Default (0–3 digits) | as above | OK disabled (unchanged) |
| 4 digits | unchanged | OK enabled |
| Busy (`_busy`) | unchanged, no spinner on the photo | keypad `isLoading`, back disabled (unchanged) |
| Wrong PIN / too many tries / reset required / network | unchanged | existing error dialog / messages (translated keys `pin.err*`, `auth.networkError`) |
| Reset offered / not offered | unchanged | links per existing `_resetOffered` + `pinResetEnabled` |
| Recovery pending (`_recoveryToken`) | unchanged | "Check my recovery request" link (unchanged) |
| Short screen / large text | **no hero** | today's layout |
| No photo (high contrast) | navy ground, same text | — |

**Navigation:** unchanged. Back → pop or `/auth`. Success → `routeForSignedInUser`. "Forgot PIN" pushes `ForgotPinScreen` (§22.2). Pre-cache the `pin` photo when the Sign in screen builds (§28).

**Focus order:** back → prefs → hero node ("Verification PIN. One last step. +255 7…") → show/hide PIN → keys 1–9, Delete, 0, OK (existing labels) → Forgot PIN → recovery links.

### 22.2 PIN setup, reset and register (recommended, for consistency)

Recommendation: apply the same hero to the three `_flowScaffold` screens, with **the same `pin` photo**. They are steps of one task that the user moves through in sequence; one photo across the flow reads as continuity, like a wizard. The photo differs from the screens before them (Sign in `signIn`, Create account `signUp`), so the "no same photo on adjacent screens" rule holds at the flow's edges.

- Replace `_flowScaffold`'s `AppBar(title)` + `ListView` with `FFPhotoHeroPage` (`compact`, `phoneFraction 0.30`, min 220). The current app bar title becomes the hero eyebrow; a headline is added per step; the step content goes on the sheet unchanged.
- While the step on screen shows a keypad (`ChoosePinStep`, 300 tall), use `heroMinViewportHeight` so the hero is dropped when it would push the OK key below the fold (same rule as §22.1). While the step shows a text field (`CodeStep`, the contact field in Forgot / Register), the page scrolls; when the soft keyboard opens, the focused field scrolls into view and the hero scrolls away (existing `FFPhotoHeroPage` behaviour; it never shrinks or animates).

| Screen / step | Eyebrow (existing key, uppercased) | Headline (§27) | Subline |
|---|---|---|---|
| Register, contact + code steps | `pin.registerTitle` "CREATE YOUR ACCOUNT" | "Check your **messages.**" (code step); none on the contact step (eyebrow only) | none (the code step's own text says where the code went) |
| Register / Setup / Forgot, choose-PIN step | the screen's title key | "A PIN only **you know.**" | none (`pin.chooseBody` stays on the sheet) |
| Forgot PIN, contact + code steps | `pin.forgotTitle` "RESET YOUR PIN" | "Let's get you **back in.**" | none (`pin.forgotBody` stays on the sheet) |
| PIN setup (one-time check), code step | `pin.setupTitle` "ONE-TIME CHECK" | "Check your **messages.**" | none (`pin.setupBody` stays on the sheet) |

Not included: `InviteStartScreen` (a name form, not PIN), the onboarding role chooser, and the Change PIN dialog (a dialog stays a dialog).

States, errors and navigation inside these flows are unchanged (`pin-flow-error`, resend timer, `pin.err*`).

---

## 23. Upgrade plan (`/member/passes`) (owner ask 4)

**Purpose:** the member chooses a higher plan and pays the difference; make the step feel like progress, while keeping prices and plan cards plain and fast to read.

**Layout, phone:** the page keeps its nested solid `AppBar` (back, title "FitFlex Pass"). Under the flag the app bar's `bottom` subtitle (`member.planBody`) is removed (it moves into the hero in buy mode, below). The first item in the `ListView` (inside the 24px padding) is the hero: **`band`** variant (C-1), `minHeight 180`, photo `upgrade`, then 16px gap, then today's content unchanged.

**Everything with a number stays on the solid surface:** current-plan card (tier, price), option cards (`+ {difference}`), "Adds N more gyms", gym list links, `upgrade.explain` (end date), `upgrade.late` (days left), manual-payment fields, the submit button ("Pay {amount} more"). **The hero shows no price, amount, date, days or gym count.**

**Hero content by state** (all from data the page already has):

| State | Trigger (existing) | Eyebrow | Headline | Subline | Below the hero |
|---|---|---|---|---|---|
| Upgrade, options available | `hasActivePass`, `upgradeOptions` returns `options` non-empty | `member.upgradePlan` "UPGRADE PLAN" / "BORESHA MPANGO" | "Move up **a level.**" / "Panda **ngazi.**" | none | as today |
| Already on the highest plan | `options` empty | same | "You're at **the top.**" / "Uko **kileleni.**" | none | current-plan card; **the `upgrade.highest` alert is hidden under the flag** (the hero says it; one owner per message, DD-5) |
| Loading upgrade options | future not done | same | none (eyebrow only; no skeleton needed for a two-word line) | none | spinner as today (F-10: replace the raw `CircularProgressIndicator` with `FFSpinner`) |
| Upgrade options failed (network) | error, not `ApiException` | same | none | none | `home.passesLoadError` + Retry (unchanged; never falls back to full price) |
| Nothing to upgrade from (server says so) → buy list | `ApiException` → `fallback` | `pay.product.fitflexPass` "FITFLEX PASS" | "One pass. **Many gyms.**" (reuses `hero.signUp.member.*`) | `member.planBody` (moved from the app bar) | pass list as today |
| Buy mode (no active pass) | `!hasActivePass` | "FITFLEX PASS" | "One pass. **Many gyms.**" | `member.planBody` | pass list, note, Continue (unchanged) |
| Pending pass payment | `pendingPass != null` | "FITFLEX PASS" | "One step **to go.**" (reuses `home.hero.pending.*`) | none | `_PendingBlockCard` (unchanged; it carries the details and actions) |
| Passes failed to load | `passesLoaded && passes.isEmpty` | "FITFLEX PASS" | none | none | load error + Retry (unchanged) |
| Submitting | `_sending` | unchanged | unchanged | unchanged | button spinner (unchanged) |

Buy mode is included because it is the same route and the same screen; without it, the one screen would look different depending on whether the member has a pass. If the owner wants the hero only in upgrade mode, that is O-21.

**Desktop (≥840):** `panel` + `rounded` banner, height 200, text in the left half; content below as today.

**Navigation:** entries unchanged (pass card "Upgrade plan", Home "Choose a pass" / "Choose your next pass", payment-pending links). Back → `/member` (unchanged). After a successful upgrade request → `/member` (unchanged), where the Home hero shows the new state.

**Focus order:** page back → (shell app bar controls) → hero node ("Upgrade plan. Move up a level.") → current plan card → "Choose a higher plan" → each option (existing InkWell; name, "+ amount", "View gyms") → explain / late alerts → manual payment fields → submit.

---

## 24. Activity (owner ask 5)

**Purpose:** one place for the member's movement. Each section gets its own photo so switching sections feels like changing room, while numbers, charts and lists stay on solid ground and near the top.

**Layout, phone (<840):**
1. Shell app bar transparent over the hero (C-7); solid once scrolled past it.
2. **Hero** `compact`, photo by section (table below), eyebrow `activity.title` ("ACTIVITY" / "SHUGHULI"), headline by section, **no subline, no chip**. Action: "Log activity" (`logActivity.open`), `FFButton` `onPhoto`, size `sm`, icon `add`, key `activity-log-open`, shown under exactly today's condition (`activityLoaded && (activities.isNotEmpty || section != overview)`). Under the flag the `FFPageHeader` ("Activity" + Log activity) is removed: its title is the eyebrow and its action is on the hero.
3. **Solid sheet**: sample-data badge (if `activityIsSample`), then `FFSegmented` (`activity-sections`), then the section content exactly as today (Today summary, steps, streak, challenge, recent list; Training plan, workouts; challenges; progress charts).

**Height, so charts are not pushed down:** `minHeight = topInset + 228` (dark) / `topInset + 252` (light), where `topInset` = status bar + 56. At text scale 1.0 every section's headline fits two lines in both languages at 360–430px, so **the hero height does not change when switching sections**. On a 390×844 phone the segmented control ends at about 400px from the top and the first content card starts by about 420px. At larger text scales the hero may grow; height changes animate (C-4).

**Sections:**

| Section (`_section`) | Tab label EN / SW | Photo (§26) | Headline EN | Headline SW (native review) |
|---|---|---|---|---|
| `overview` | Today / Leo | `activityToday` (treadmill rows) | Every step **counts.** | Kila hatua **ina thamani.** |
| `workouts` | Training / Mazoezi | `activityTraining` (rope, kettlebells, rower) | Train with **a plan.** | Fanya mazoezi **kwa mpango.** |
| `challenges` | Challenges / Challenges | `activityChallenges` (chalked hands) | Take on **a challenge.** | Shiriki **challenge.** |
| `progress` | Progress / Maendeleo | `activityProgress` (graded dumbbell rack) | See how far **you've come.** | Tazama **ulipofika.** |

**Switching sections:** the photo cross-fades (≤250ms, ease-out) and the headline fades (200ms) (C-4). **Under reduced motion both are instant.** Scroll position behaves as today. All four photos are pre-cached when the Activity tab first builds (and on shell start, after the Home photos), so a switch never shows the navy placeholder. The deep link `/member/activity/progress` opens with the Progress photo and headline on the first frame (no fade from Today).

**States:**

| State | Hero | Sheet |
|---|---|---|
| Loading (`!activityLoaded`) | photo, eyebrow, section headline (static copy, no data needed); no Log activity (today's condition) | spinner as today |
| Empty (no activities) | as loaded; Log activity hidden on Today (today's condition) | existing empty states / get-started cards |
| Sample data | as loaded | sample badge above the segmented control |
| Offline | as loaded | shell offline strip under the bar (solid, as Home) |
| Error | as loaded | existing per-card handling |
| No photo | navy ground, same text | — |

**Desktop (≥840):** shell bar solid; hero = rounded `panel` banner, height 200, text left; Log activity on the banner; segmented control and content below.

**Focus order:** app bar → offline Retry → hero node ("Activity. Every step counts.") → Log activity → segmented control (each option selectable, selected state announced; unchanged widget) → section content in order → bottom nav. When the section changes, focus stays on the segmented control; the hero node's label updates but is not announced on its own (no live region), so screen-reader users hear only the section change they made.

---

## 25. Partner homes: Trainer, Vendor, Gym owner (owner ask 6)

Common rules:
- **Placement:** an inset **`band`** hero (C-1) as the first item in the home tab's scroll view, inside the existing 24px (owner: 24/16) padding. **The app bars stay solid:** they carry working controls used many times a day (gym picker, persona switch, Change PIN, sign out, QR, inbox), and partner homes are work dashboards, so the hero is a welcome band, not a takeover. Shown **only on the home tab** (trainer Home, vendor Products, owner Home); other tabs are unchanged.
- **Size:** `minHeight 200` on phones, grows with text. **≥840:** `panel` + `rounded`, height 220, text in the left half.
- **Colours:** Volt accent + Volt primary button in dark theme; `#17B26A` accent (large only) + green `#067647` primary in light theme; secondary `onPhoto` (§20).
- **On solid ground, always:** QR codes and the QR sheet, metric cards, the membership chart, lists (check-ins, clients, products, orders), filters, notices, tiles.
- **Eyebrow greeting:** `member.goodMorning|goodAfternoon|goodEvening` + ", " + first name (thresholds 12:00 / 17:00, as the owner home already does), uppercased, 28-character limit.

### 25.1 Trainer home (`/trainer/home`, Home tab)

| Element | Content |
|---|---|
| Photo | `trainer` (battle rope and plyo box, one hand on the rope at the edge) |
| Eyebrow | greeting + first name (`_myProfile['displayName']` or `_displayName`, first word) |
| Headline | "Ready to **coach?**" / "Tayari **kufundisha?**" |
| Subline | `checkin.body` "Show your QR at reception, or scan the QR at the gym entrance." (existing) |
| Primary | "Scan gym QR" (`checkin.scan`), icon `qr_code_scanner`, key `trainer-checkin-scan`, calls `_scanGymQr` (camera opens full screen; **needs a real device**) |
| Secondary | "Show my QR" (`checkin.showQr`), `onPhoto`, key `trainer-checkin-qr`, calls `_showMyQr` (the QR opens in its existing solid sheet, never on the photo) |
| Removed under the flag | the "Gym check-in" `FFCard` (`trainer-checkin-card`): its title, body and both buttons now live on the hero (one owner per message) |
| Stays on solid, in today's order | `PartnerNotVerifiedNotice` (first, directly under the hero), `trainer.dashboardBody` line, profile card (name, specialties, rate pill, socials), `ClientsDigest`, linked-gyms metric, Sessions tiles (today, earnings, payouts, enquiries, schedule) |

States: profile loading (`_myProfile == null`) → eyebrow greeting with `_displayName`, hero otherwise complete (no data needed); unverified trainer → hero unchanged, `PartnerNotVerifiedNotice` under it (pending-approval state); profile load error → existing snack, hero unchanged. The app-bar QR icon stays (it works from every tab).

Focus order: app bar (QR, inbox, prefs) → hero node ("Good morning, Juma. Ready to coach? Show your QR at reception, or scan the QR at the gym entrance.") → Scan gym QR → Show my QR → not-verified notice → content → bottom nav.

### 25.2 Vendor home (`/vendor/home`, Products tab)

| Element | Content |
|---|---|
| Photo | `vendor` (stocked gear shelf: medicine balls, boxing gloves, bags; stand-in for a supplements/products shelf, §26) |
| Eyebrow | `_profile['businessName']`, ellipsised; fallback `vendor.title` "Vendor marketplace" |
| Headline | Published / normal: "Stock up. **Sell more.**" / "Ongeza bidhaa. **Uza zaidi.**". Pending approval (`_pendingApproval`): "Almost **ready to sell.**" / "Unakaribia **kuanza kuuza.**" |
| Subline | none (the pending explanation is 180 characters and stays in the existing banner) |
| Primary | "Add product" (`vendor.addProduct`), icon `add`, calls `_editProduct()` (pending vendors can add products, per the 2026-10-11 decision) |
| FAB | Hidden while the hero is on screen (≥50% visible) and shown once it scrolls away (fade 150ms, instant under reduced motion). **Exactly one widget carries the key `vendor-add-product` at a time**: the hero button while the hero is visible, the FAB otherwise. The FAB is removed from the tree, not just made transparent, while hidden. |
| Stays on solid | pending banner card (`vendor-pending-banner`, text + Verification button, unchanged, directly under the hero), staff-disabled alert, low-stock filter, product list, empty state ("No products yet. Add your first product.") |

States:

| State | Hero |
|---|---|
| Loading (`_loading`) | photo, eyebrow fallback, `headlineLoading`; no action; spinner below |
| Empty products | normal hero + Add product; `FFEmptyState` below; no FAB (hero is visible) |
| Pending approval | pending headline + Add product; pending banner below |
| Staff disabled (`_staffDisabled`) | **no hero** (the error alert is the message) |
| Staff without Products access (lands on another section) or "no access" tab | **no hero** (role-restricted: the hero lives on Products only) |
| Low stock | normal hero; low stock stays in the nav badge and filter (no chip) |
| Error loading | normal hero; existing snack / retry |

Focus order: app bar (inbox, persona, Change PIN, sign out) → hero node → Add product → pending banner → filter → products → (FAB, when shown) → bottom nav.

### 25.3 Gym owner home (`/owner/home`)

| Element | Content |
|---|---|
| Photo | `owner` (gym floor from above: dumbbell rows, benches, machines) |
| Eyebrow | greeting + `cleanName` (moved from today's solid greeting text, which is removed under the flag) |
| Headline | Approved: "Keep your gym **moving.**" / "Weka gym yako **ikisonga.**". No approved gym yet (`ownerGyms.isEmpty`): "Welcome to **FitFlex**" (`role.welcomeTitle`, accent = brand name, as §6.3) |
| Subline | none |
| Primary | Approved: "Check-in" (`owner.checkin`), icon `qr_code_scanner`, key `owner-checkin-primary`, `context.push('/owner/scan')` (camera: **needs a real device**). Replaces today's full-width solid Check-in button. No gym yet: no action. |
| Stays on solid, in today's order | `PartnerNotVerifiedNotice`, the date-filter row (left: `owner.gymSnapshot`, right: the filter chip `owner-date-filter`; the gym name is already in the app bar, so it is not repeated), quick actions (Earnings, Trainers if allowed, Members), metric cards, membership chart, latest check-ins, Communications / Challenges / Groups tiles. Pending: `FFGymUnapprovedCard` (unchanged). |

States: dashboard loading → hero complete (greeting needs only `displayName`), content as today; no gym / pending approval → welcome headline, no action, unapproved card below; gym staff persona → same hero, Check-in under today's condition (today it always shows); offline / error → as today (no new handling).

Focus order: owner app bar (gym picker, inbox, avatar) → hero node ("Good afternoon, Rehema. Keep your gym moving.") → Check-in → not-verified notice → date filter → quick actions → metrics → chart → check-ins → tiles → bottom nav.

---

## 26. Photos for the addendum

All from `social/brand/photos/` on `release-candidate` (Pexels licence, pages checked "Free" on 2026-10-16, none marked AI-generated; README there). Each needs a row in `fitflexmobile/assets/photos/hero/LICENSES.md` with the same columns as the existing rows. **No row, no ship.**

Crops are in source pixels `l,t,r,b`. "Focal" is the `Alignment` for `BoxFit.cover` (C-2). The **text safe zone** is the bottom 55% of the frame for `compact` / `band` (vertical scrim) and the left 50% for `panel`; keep it free of bright highlights after grading (§8.3; the contrast guarantee does not depend on it). Sizes below come from a quick Pillow export at WebP q72 with the brightness factor shown; the builder re-exports, and the target is **≤150 KB per 2× file** (all well under).

| `FFHeroPhoto` | File | Source (photographer) | Crop `l,t,r,b` → aspect | 2× delivered (1× = half) | Focal | Grade | People, and why it qualifies | Proto 2× / 1× |
|---|---|---|---|---|---|---|---|---|
| `profile` | `hero_profile.webp` | `pexels-4716814` "Black and Gray Exercise Equipment" (Denys Gromov) | 600,150,1500,750 → 3:2 | 900×600 | (0.3, 0.0) lockers right of centre | ×0.75 (bright room) | none | 26 KB / 11 KB |
| `pin` | `hero_pin.webp` | `pexels-7432872` "A Man in Striped Shirt Using His Mobile Phone" (August de Richelieu) | 250,330,1255,1000 → 3:2 | 1005×670 | (0.3, −0.2) hands and phone | ×0.8 | hands, forearms and shirt only; the crop starts well below the chin, **no face in frame**; the phone screen is blank | 26 KB / 9 KB |
| `upgrade` | `hero_upgrade.webp` | `pexels-4720565` "Man Getting Medicine Ball" (Ketut Subiyanto) | 0,1000,1500,2000 → 3:2 | 1080×720 | (−0.3, −0.4) hand on the ball | ×0.9 | one hand and arm behind the balls; the crop starts about 200px below the chin, **no face in frame** | 26 KB / 10 KB |
| `activityToday` | `hero_activity_today.webp` | `pexels-12250460` "Treadmills at Gym" (Mario García) | 0,125,1500,1125 → 3:2 | 1080×720 | (−0.2, −0.3) treadmill row | ×0.9 | none | 75 KB / 27 KB |
| `activityTraining` | `hero_activity_training.webp` | `pexels-9545909` "Equipments Inside the Gym" (TUBARONES PHOTOGRAPHY) | 700,300,1500,833 → 3:2 | 800×533 | (−0.4, 0.0) rope, kettlebells | ×0.95 | none | 33 KB / 13 KB |
| `activityChallenges` | `hero_activity_challenges.webp` | `pexels-4720518` "Man in Blue Tank Top" (Ketut Subiyanto) | 300,420,1200,1000 → ≈3:2 | 900×580 | (0.0, 0.1) chalked hands | ×0.9 | torso and hands clapping chalk; the crop starts below the chin, **no face in frame** | 23 KB / 8 KB |
| `activityProgress` | `hero_activity_progress.webp` | `pexels-3916766` "Black and Red Dumbbells on Brown Wooden Floor" (Andrea Piacquadio) | 0,0,1458,972 → 3:2 | 1080×720 | (−0.1, −0.3) rack rows | ×0.9 | none | 35 KB / 16 KB |
| `trainer` | `hero_trainer.webp` | `pexels-6388387` "Grayscale Photo of a Woman Using Battle Ropes" (Tima Miroshnichenko) | 0,470,840,1000 → ≈1.6:1 | 840×530 | (0.7, 0.0) hand on the rope | ×0.95 | one hand, forearm and one leg/shoe at the right edge; face and torso are outside the crop (a tighter body crop was tried and rejected as body-focused) | 10 KB / 4 KB |
| `vendor` | `hero_vendor.webp` | `pexels-9545914` "Gym Equipment Inside the Fitness Gym" (TUBARONES PHOTOGRAPHY) | 620,250,1500,837 → 3:2 | 880×587 | (0.0, −0.3) shelves | ×0.95 | none | 38 KB / 16 KB |
| `owner` | `hero_owner.webp` | `pexels-29526371` "Modern well-equipped gym with diverse fitness equipment" (foad shariyati) | 0,1000,1500,2000 → 3:2 | 1080×720 | (−0.3, −0.3) dumbbell rows, benches | ×0.8 (bright floor) | none (the one small, faceless figure in the full frame is outside this crop) | 67 KB / 27 KB |

**2× minimum width:** a 390px-wide hero at device pixel ratio 2 needs 780px; every file meets that. 3× phones get the 2× file scaled under an 80% scrim (acceptable, §8.2).

**Adjacency check (no photo on two adjacent screens):**
- Sign in (`signIn`, 9545909 centre) → PIN (`pin`) → PIN flows (`pin`, same flow, §22.2) → Home: distinct at every step. Create account (`signUp`, 3916766) → Register flow (`pin`): distinct.
- Member tabs: Home (`homeStart` 29526371 / `homePass` 5312212) ↔ Activity Today (12250460) ↔ Profile (4716814); Home → Upgrade (4720565): all distinct. The four Activity sections use four different source photos.
- Sources reused **away from each other**: 9545909 (Sign in, centre crop; Activity Training, right crop), 3916766 (Create account; Activity Progress), 12250460 (Language; Activity Today), 29526371 (Role and member Home start; owner home, different crop and a different role). None of these pairs is one step apart.

**Gaps in the folder (stand-ins used):**
- **Vendor:** there is no supplements or product-shelf photo. Stand-in: the gear shelf in 9545914.
- **Trainer:** there is no whistle, clipboard or coach-hands photo without a face. Stand-in: battle rope + plyo box crop of 6388387.
- None of the photos is Tanzanian (stop-gap, O-1). Several show equipment brand marks (e.g. "Concept2" on rowers in Training and Vendor, "movement" on treadmills in Today), like the heroes already shipped; §8.1 rule 3 is met only when own photos replace them.

**Bundle:** about +0.36 MB at 2× and +0.14 MB at 1× (prototype), so all hero assets together come to about 1.07 MB. **New budget: ≤1.6 MB for all hero assets (both densities)**, replacing the 1.2 MB in §9. Report the build size change in the PR. (Addendum 2 spends part of the remaining 0.54 MB on three section heroes and four footer photos, with per-slot caps for the owner's own photos: §34.2.)

---

## 27. Copy (English + Swahili)

All Swahili is **draft for native review**. The glossary is followed (gym = "gym", challenge = "challenge" as in the tab label, PIN = "PIN"). Each headline is stored as `.lead` / `.accent` keys. Budgets per §4 (headline ≤26 EN / ≤34 SW characters, longest word ≤11).

### 27.1 New keys

| Key (`.lead` / `.accent`) | English | Swahili (native review) | Chars EN / SW | Longest word |
|---|---|---|---|---|
| `hero.pin.signIn` | One last / **step.** | Hatua / **ya mwisho.** | 14 / 16 | 6 |
| `hero.pin.create` | A PIN only / **you know.** | PIN unayoijua / **wewe tu.** | 21 / 22 | 9 |
| `hero.pin.code` | Check your / **messages.** | Angalia / **ujumbe wako.** | 20 / 20 | 9 |
| `hero.pin.reset` | Let's get you / **back in.** | Tukurudishe / **ndani.** | 22 / 18 | 11 |
| `hero.upgrade` | Move up / **a level.** | Panda / **ngazi.** | 16 / 12 | 6 |
| `hero.upgrade.top` | You're at / **the top.** | Uko / **kileleni.** | 18 / 13 | 9 |
| `hero.activity.today` | Every step / **counts.** | Kila hatua / **ina thamani.** | 18 / 22 | 7 |
| `hero.activity.training` | Train with / **a plan.** | Fanya mazoezi / **kwa mpango.** | 18 / 25 | 7 |
| `hero.activity.challenges` | Take on / **a challenge.** | Shiriki / **challenge.** | 20 / 18 | 10 |
| `hero.activity.progress` | See how far / **you've come.** | Tazama / **ulipofika.** | 24 / 17 | 10 |
| `hero.trainer` | Ready to / **coach?** | Tayari / **kufundisha?** | 15 / 18 | 11 |
| `hero.vendor` | Stock up. / **Sell more.** | Ongeza bidhaa. / **Uza zaidi.** | 20 / 25 | 7 |
| `hero.vendor.pending` | Almost / **ready to sell.** | Unakaribia / **kuanza kuuza.** | 21 / 24 | 10 |
| `hero.owner` | Keep your gym / **moving.** | Weka gym yako / **ikisonga.** | 21 / 23 | 9 |
| `member.nameFallback` (F-9) | Member | Mwanachama | 6 / 10 | — |

Words that most need the native reviewer: "Tukurudishe ndani" (let us bring you back in), "ikisonga" (moving), "Unakaribia" (you are close to), "kileleni" (at the top), "ina thamani" (has value; chosen over "inahesabika", which is 12 characters with the full stop).

### 27.2 Reused keys (no new translation)
`member.profile`, `auth.verificationPin`, `auth.createPin`, `pin.registerTitle`, `pin.forgotTitle`, `pin.setupTitle`, `member.upgradePlan`, `pay.product.fitflexPass`, `member.planBody`, `hero.signUp.member.*`, `home.hero.pending.*`, `activity.title`, `logActivity.open`, `member.goodMorning|goodAfternoon|goodEvening`, `checkin.body`, `checkin.scan`, `checkin.showQr`, `vendor.title`, `vendor.addProduct`, `owner.checkin`, `owner.gymSnapshot`, `role.welcomeTitle`.

Eyebrow lengths (uppercased, ≤28): "BORESHA MPANGO" 14, "PIN YA UTHIBITISHO" 18, "FUNGUA AKAUNTI YAKO" 19, "UHAKIKI WA MARA MOJA" 20, "SOKO LA MUUZAJI" 15 (vendor fallback), greetings ≤28 with the name ellipsised. Subline lengths: `checkin.body` 63 EN / 61 SW, `member.planBody` 49 / 47, all within 90 / 115.

---

## 28. Flags, backend fields, performance

- **Flag:** everything in this addendum ships under the same build-time flag `PHOTO_HERO_UI` (off by default). With it off, all screens in §18 are unchanged. F-9 and F-10 are safe to fix outside the flag.
- **Backend: nothing new.** Fields read, all already used by the app (for `contract-checker` to confirm the names):
  - `GET /me`: `user.resolvedName`, `user.photoUrl`, `hasActivePass`, `subscription{tier, plan, isDirect, …}`, `pendingPayment(s)` (Profile, Upgrade, Home).
  - Upgrade options (`api.upgradeOptions()`): `current{tier, priceTzs, expiresAt}`, `options[]{tier, differenceTzs, gymAccess}` (shown only on solid cards, unchanged).
  - Pass tiers (`listSubscriptionTiers` / `listPasses`) (buy mode, unchanged).
  - Activity: member data scope `activityLoaded`, `activities`, `activityIsSample` (unchanged).
  - Trainer profile: `displayName` (unchanged source of the name already on the dashboard).
  - Vendor profile: `businessName`, `status`; auth `pendingApproval` (unchanged).
  - Owner data scope: `displayName`, `ownerGyms`, `activeGymId` (unchanged).
- **Pre-caching (§9 extended):** `pin` when the Sign in screen builds; the three member-tab photos (`activityToday`, `profile`, then the other three Activity photos) after the Home photos on shell start; `upgrade` when the pass card renders; the role's partner photo after sign-in routes to that role. Decode at display size (existing `heroImageProvider`).
- **Memory:** one hero image alive per screen, except during the ≤250ms Activity cross-fade (two).

---

## 29. Acceptance criteria (continued)

Checked on Flutter web built from RC at phone widths 360, 390 and 430 (heights 640, 760 and 844) and desktop 1280×800, light and dark, English and Swahili, text scale 1.0 and 1.3, unless an item says otherwise. **[device]** = needs a real phone.

**Flags and hero (all addendum screens)**
- AC-F4 With `PHOTO_HERO_UI` off, Profile, PIN entry, Register / Forgot / Setup flows, `/member/passes`, Activity, and the trainer, vendor and owner homes look and behave exactly as on RC before this change; existing tests pass unchanged.
- AC-F5 With the flag on, these keys still exist and work: `activity-scroll`, `activity-sections`, `activity-log-open`, `profile-edit`, `profile-pass-state`, `forgot-pin`, `recovery-link`, `recovery-check`, `pin-flow-pin-title`, `pin-flow-error`, `upgrade-submit`, `upgrade-manual-pay`, `trainer-checkin-scan`, `trainer-checkin-qr`, `trainer-appbar-qr`, `owner-checkin-primary`, `owner-date-filter`, `vendor-add-product`, `vendor-pending-banner`, and all `*-nav-*` keys.
- AC-H16 Each of the 10 new hero files is ≤150 KB at 2× and has a `LICENSES.md` row (file, used on, source page, photographer, licence, crop, sizes, people).
- AC-H17 Viewed at 100% at 360, 430 and 1280 wide, no new hero shows any part of a face (eyes, nose, mouth or chin). The `pin`, `upgrade`, `activityChallenges` and `trainer` rows in `LICENSES.md` describe the people visible (hands, arms, torso, legs) and say "no face in frame".
- AC-H18 No two screens one navigation step apart show the same photo (the pairs in §26), except the PIN flow steps, which share `pin` by design.
- AC-H19 On every addendum hero, no price, amount, date, days-left, visit count or gym count appears on the photo; QR codes, the PIN dots and keypad, plan and option cards, lists, filters and charts are on solid surfaces.
- AC-H20 The pure-white test image check (AC-H3) passes for the `band` variant and for Profile's avatar ring (≥3:1).

**A. Language**
- AC-A10 The Language hero shows no Swahili tagline line in either locale ("Pamoja tuna nguvu" is absent from the screen and from the accessibility tree); no other line replaces it; the hero node reads "FitFlex Africa. Fitness without limits."; `FFPhotoHero` has no `secondLead` / `secondAccent`.

**E. Profile**
- AC-E1 Profile tab: transparent shell app bar over a `compact` hero with the `profile` photo, the avatar with a light ring, eyebrow "PROFILE" / "WASIFU", and the member's name as the headline, with no accent colour and no buttons on the hero.
- AC-E2 The old profile card (avatar + name + badge) is gone; the plan badge is the first item on the solid sheet, followed by the state alert (when shown), Membership card and the settings tiles in today's order.
- AC-E3 The name appears once on the screen.
- AC-E4 Loading shows the skeleton headline and never "No pass yet"; offline with nothing loaded never shows "No pass yet" in the badge slot.
- AC-E5 With no name available, the headline is "Member" / "Mwanachama" from `member.nameFallback`; no hardcoded `'Member'` remains in `member_profile_tab.dart` (F-9).
- AC-E6 The app bar turns solid once the hero passes under it; icons are ≥3:1 throughout.
- AC-E7 Screen reader order: app bar → hero node "Profile. {name}." (avatar not announced separately) → badge → alert → Membership card → tiles → Sign out.

**G. PIN**
- AC-G1 At 390×844, sign-in PIN: hero with the `pin` photo, eyebrow "VERIFICATION PIN" / "PIN YA UTHIBITISHO", headline "One last step." / "Hatua ya mwisho.", subline = the identifier typed on Sign in; the dots, keypad, Forgot PIN and recovery links are on the solid sheet, all visible without scrolling, OK key fully on screen.
- AC-G2 Sign-up mode shows eyebrow "CREATE PIN" / "WEKA PIN" and "A PIN only you know." / "PIN unayoijua wewe tu.".
- AC-G3 At 360×640, and at any size where the hero would leave less than 200px above the pinned content, the screen shows today's layout with no hero and the OK key is fully visible without scrolling.
- AC-G4 At text scale 1.3 at 390×844, either the hero text fits without clipping or the screen falls back to the no-hero layout; it never clips text or pushes the keypad below the fold.
- AC-G5 Keypad keys are ≥44px tall at every size (52px when the viewport is ≥844 tall); every key keeps its existing semantics label.
- AC-G6 Desktop 1280×800: split layout; panel left with eyebrow, headline and the identifier; dots, keypad and links on the right, vertically centred.
- AC-G7 Busy, wrong-PIN, too-many-tries and reset-required behave as today; the hero does not change in those states.
- AC-G8 Register, Forgot PIN and PIN setup use the `pin` photo with the eyebrows and headlines in §22.2; on their code / contact steps, focusing the field at 360×640 scrolls the field and its button into view (hero scrolls away, never shrinks); on their choose-PIN step, the AC-G3 rule applies.
- AC-G9 Focus order on PIN entry: back → prefs → hero node → show/hide → keys → Forgot PIN → recovery links.

**I. Upgrade plan**
- AC-I1 A member with an active pass and higher plans available sees a `band` hero (rounded 24px, inside the page padding, under the solid page app bar) with the `upgrade` photo, "UPGRADE PLAN", "Move up a level." / "Panda ngazi."; no subtitle under the app bar title.
- AC-I2 No price, "+ amount", date or day count appears on the hero; current-plan and option cards, explain / late alerts, manual fields and the submit button are unchanged on the solid surface.
- AC-I3 On the highest plan: headline "You're at the top." / "Uko kileleni."; the `upgrade.highest` alert is not shown; the current-plan card is.
- AC-I4 Buy mode (no active pass, or the server says there is nothing to upgrade from): eyebrow "FITFLEX PASS", headline "One pass. Many gyms.", subline = `member.planBody`, shown once on the screen.
- AC-I5 Pending pass payment: headline "One step to go."; the pending card is unchanged below.
- AC-I6 While options load: eyebrow only on the hero, `FFSpinner` below (F-10). On a network error: retry message below; never the full-price list.
- AC-I7 After a successful upgrade request the app goes to `/member` (unchanged).
- AC-I8 Desktop 1280: rounded `panel` banner, text in the left half.

**J. Activity**
- AC-J1 Each section shows its own photo and headline: Today `activityToday` "Every step counts." / "Kila hatua ina thamani."; Training `activityTraining` "Train with a plan." / "Fanya mazoezi kwa mpango."; Challenges `activityChallenges` "Take on a challenge." / "Shiriki challenge."; Progress `activityProgress` "See how far you've come." / "Tazama ulipofika.". The four photos are different files.
- AC-J2 Switching sections cross-fades the photo in ≤250ms and the headline in ≤200ms; with reduced motion on, the switch is instant (no intermediate frame shows both photos).
- AC-J3 At text scale 1.0, switching sections does not change the hero height at 360, 390 or 430 wide, in either language.
- AC-J4 At 390×844, 1.0×, both languages: the segmented control is fully visible with its bottom edge ≤440px from the top, and the first content card starts ≤470px from the top.
- AC-J5 "Log activity" is on the hero as an `onPhoto` small button under exactly today's show condition; the old page header is gone; the segmented control and all charts, lists and cards are on the solid sheet.
- AC-J6 Opening `/member/activity/progress` directly shows the Progress photo and headline on the first frame.
- AC-J7 Switching sections never shows the navy placeholder after the tab has been open once (photos pre-cached).
- AC-J8 Loading shows the photo, eyebrow and section headline with the spinner below; sample-data badge, empty states and the offline strip behave as today.
- AC-J9 After a section change, keyboard focus stays on the segmented control and the hero node's label matches the new section.
- AC-J10 Desktop 1280: rounded `panel` banner with Log activity; the shell app bar is solid.

**K. Partner homes**
- AC-K1 Trainer Home tab: `band` hero with the `trainer` photo, greeting + first name, "Ready to coach?" / "Tayari kufundisha?", subline `checkin.body`, primary "Scan gym QR" (`trainer-checkin-scan`), secondary "Show my QR" (`trainer-checkin-qr`); the old Gym check-in card is gone; the QR opens in its solid sheet **[device for scanning]**.
- AC-K2 Trainer: other tabs (Clients, Shop, Gyms, Profile) have no hero; the not-verified notice is directly under the hero.
- AC-K3 Vendor Products tab: `band` hero with the `vendor` photo, business name eyebrow (fallback "Vendor marketplace" / "Soko la muuzaji"), "Stock up. Sell more." / "Ongeza bidhaa. Uza zaidi.", primary "Add product".
- AC-K4 Vendor: while the hero is visible the FAB is absent from the widget tree; after scrolling the hero away the FAB appears; at any moment exactly one widget has the key `vendor-add-product`.
- AC-K5 Vendor pending approval: headline "Almost ready to sell." / "Unakaribia kuanza kuuza."; the pending banner card is unchanged directly below.
- AC-K6 Vendor: no hero when staff is disabled, on the "no access" tab, or for staff who land on a section other than Products.
- AC-K7 Owner Home: `band` hero with the `owner` photo, greeting + name (not repeated on the surface), "Keep your gym moving." / "Weka gym yako ikisonga.", primary "Check-in" (`owner-checkin-primary`) → scanner **[device for scanning]**; today's full-width Check-in button is gone.
- AC-K8 Owner: the gym picker app bar stays solid; date filter, quick actions, metrics, chart, check-ins and tiles are on the solid surface in today's order; the gym name is not repeated below the hero.
- AC-K9 Owner with no approved gym: headline "Welcome to FitFlex", no action, the unapproved card below.
- AC-K10 Dark theme: accent word and primary button are Volt; light theme: accent `#17B26A` (≥24px, w800) and green primary; no Volt anywhere in light theme.
- AC-K11 Desktop 1280: each partner hero is a rounded `panel` banner, height 220, text in the left half.
- AC-K12 Every partner hero action is ≥44px tall, has a semantics label, and comes right after the hero node in focus order.

---

## 30. Open questions (addendum)

| # | Question | Default if no answer |
|---|---|---|
| O-20 | "Pamoja tuna nguvu" is also the Home hero headline in Swahili when Home cannot load (offline / error), and the splash tagline. Remove it there too? | Language screen only, as asked. Home offline / error and the splash keep it until the owner says otherwise. |
| O-21 | The Upgrade plan route also shows the **buy** list for members without a pass. Show the hero there too ("One pass. Many gyms."), or only when upgrading? | Show it in both modes (one screen, one look). |
| O-22 | Vendor and trainer photos are stand-ins (no supplements shelf, no coach photo in the licensed folder). Source two more licensed people-free photos now, or wait for the own shoot? | Ship the stand-ins behind the flag; replace with the own shoot. |

Known gaps still in view: legal texts remain drafts pending Tanzanian counsel; vendor settlement exists but has not been tried by hand; `PHOTO_HERO_UI` and the other flags stay off; all Swahili above awaits native review; camera scanning and real-device rendering are **[device]** checks.

---
---

# Addendum 2 (2026-10-19): section heroes, footer band, admin-managed photos

## 31. Scope, decisions and what changed

The owner asked for four things on 2026-10-19 after the second phone preview: more photos in the Gyms, Trainers and Shop sections (the owner will send their own photos); a photo band at the bottom of pages, with a different photo from the top; a way for admins to change the photos from the portal; and a fix for the gallery edge lines (shipped separately as mobile#182, not covered here). The planner's plan is `docs/plans/photo-hero-sections-footer-admin-plan.md`; the owner's decisions D-1 to D-5 are in the decision block at the top of this file. Everything in §1–§30 still applies unless a section below says otherwise.

| # | What | Section | Flag | Slice |
|---|---|---|---|---|
| 1 | `band` heroes on member Gyms, Trainers and Shop home | §32 | `PHOTO_HERO_UI` (existing) | 1 (mobile) |
| 2 | `FFPhotoFooter`: a photo band that ends long pages | §33 | `PHOTO_FOOTER_UI` (new, needs `PHOTO_HERO_UI`) | 2 (mobile) |
| 3 | Stand-in photos for 1 and 2, bundle math | §34 | — | 1, 2 |
| 4 | What the owner sends for their own photos | §35 | — | 3 (assets) |
| 5 | Portal admin "App photos" screen | §36 | `NEXT_PUBLIC_HERO_IMAGES_ADMIN` (portal) + `HERO_IMAGES_CMS` (server) | 5 (portal), on 4 (backend) |
| 6 | Copy, backend fields, flags | §37 | — | — |
| 7 | Acceptance criteria AC-L, AC-M, AC-N; open questions | §38 | — | — |

Real names in the code (read from `fitflexmobile` and `fitflex-portal` `origin/release-candidate` on 2026-10-19, mobile `baf155f`, portal `07c327a`):

| Screen | Route | File | Notes |
|---|---|---|---|
| Gyms list | `/member/gyms` (shell tab) | `lib/screens/member/member_gyms_tab.dart` | `CustomScrollView` `gym-page-scroll`: `FFPageHeader` (`member.discoverGyms` + ghost "Trainers" button `member-find-trainer`), search `gym-search`, tier chips, filters panel, Featured strip, section strip ("Discover gyms" + count), grid `gym-card-*`. Empty: `FFEmptyState(member.noData)`. |
| Trainers list | `/member/trainers` (under the Gyms tab) | `lib/screens/member/member_trainers_tab.dart` | `CustomScrollView` `trainer-page-scroll`: `FFPageHeader` (`member.findTrainerTitle`), search `trainer-search`, chips, Featured, "Top rated" strip, grid `trainer-card-*`. |
| Shop home | `/member/shop` | `lib/screens/member/member_shop_tab.dart` → `ShopBrowseBody(mode: member)` (`lib/shared/widgets/shop_browse_page.dart`) → `ShopHomeView` (`lib/shared/widgets/shop_home/shop_home_page.dart`) | `ShopHomeView` renders only when `SHOP_HOME_V2` is on, the Browse segment is selected and the Results view is not open (`_showHome`). Order: segments → search row (`shop-home-search` + cart `shop-home-cart`) → category row → rails `shop-home-section-*` → "Browse all products" `shop-home-browse-all`. The sticky cart bar `shop-home-checkout` is a **sibling below the list** (a `Column`), not an overlay. |
| Gym detail | `/member/gyms/:id` | `member_gym_detail_page.dart` | Own `Scaffold` + `AppBar` inside the shell; `ListView` `gym-detail-scroll` opening with the gym's `PhotoGallery` (`gym-section-gallery`), ending with Trainers and Reviews. |
| Trainer detail | `/member/trainers/:id` | `member_trainer_detail_page.dart` | Own `Scaffold`; pinned action bar `trainer-actions` is the `bottomNavigationBar` (outside the scroll); `ListView` opening with `trainer-section-gallery` when the trainer has photos. |
| Vendor Products | `/vendor/home` | `vendor_home_page.dart` | `FloatingActionButton.extended` `vendor-add-product` **overlays** the list once the hero has scrolled away (§25.2). |

Two corrections to the plan, found in the code:
- **The shop cart bar and the trainer detail action bar need no footer padding.** Both sit outside the scroll view, so the list already ends above them. Only the vendor FAB overlays content (§33.5).
- **Gyms and Trainers have no loading or error state today** (F-12 below). `MemberData` has `gyms` and `trainers` lists but no `gymsLoaded` / `trainersLoaded` flag, and `_refreshGyms` swallows errors, so the tab says "Nothing to show yet." while loading and after a failed request. The plan's rule "footer only after loading finished and the list isn't empty" needs those two client flags (app-side state, **not** a backend field).

### 31.1 Existing problems found (planner decides; safe outside the flag)
- **F-11 (a11y, touch target).** Gym and trainer filter chips (`gym-filter-*`, `gym-filter-more`, trainer chips) are bare `GestureDetector`s 38px tall: not keyboard-focusable on Flutter web, no button/selected semantics, below the 44px minimum. Fix with `ChoiceChip` / `FilterChip` (48px hit area) or wrap in `Semantics(button: true, selected: …)` + `FocusableActionDetector`, keeping the keys.
- **F-12 (wrong state).** See above: loading and failure both render "Nothing to show yet." Add `gymsLoaded`, `gymsLoadFailed`, `trainersLoaded`, `trainersLoadFailed` to `MemberData`, set in `_refreshGyms` / `_refreshTrainers`, and render the states in §32.4 with the flag on **and** off (the off-flag version is the same states without the hero).
- **F-13 (consistency).** The Gyms tab's location spinner is a raw `CircularProgressIndicator`; use `FFSpinner` (as F-10).

---

## 32. Section heroes: Gyms, Trainers, Shop home (member only, D-3)

### 32.1 Common rules
- **Variant `band`** (C-1): an inset card inside the page padding, 24px corners, vertical scrim (0.50 top → 0.80 from `textTop − 24px`), no sheet overlap, no melt. The **shell app bar stays solid** on these tabs (they are not in `heroTabRoutes`), so the search field and filters stay near the top. The band scrolls away with the page. No parallax.
- **Size:** `minHeight 160` on phones; it grows with its text and buttons (the Gyms band is about 210 tall with its button). **≥840 wide:** `panel` + `rounded`, height 200, text in the left half (the existing desktop banner).
- **Member only.** Trainer, owner and vendor-personal shops, the trainer's Gyms tab and any partner list never show these bands.
- **On solid ground, always:** search fields, chips, the filters panel, Featured strips, counts, cards, prices, rails, cart and checkout. **The bands show no number, price, count, rating or gym/trainer name.**
- **Colours:** accent Volt in dark theme, `#17B26A` (≥24px, w800) in light theme; secondary action `onPhoto`; no Volt on light grounds (AC-H6).
- **Semantics:** photo excluded; eyebrow + headline are one header node; each action its own labelled button (AC-H7). The hero gets a `Focus` node with `skipTraversal: true` and `canRequestFocus: true`, so "Back to top" (§33.4) can move focus to it without adding a Tab stop.
- **Search focus (Gyms, Trainers, Shop):** when the search field gains focus and its top edge is lower than 40% of the visible viewport (viewport minus keyboard), the page scrolls so the field's top sits 8px below the app bar (300ms ease-out; instant under reduced motion). The band scrolls away; it never shrinks, collapses or animates its height. On unfocus nothing scrolls back. Typing never hides the band (no layout jump while results change).
- **Pre-cache:** `gyms`, `trainers`, `shop` after the existing member list in `member_shell.dart` (§28 order: Home, Activity Today, Profile, Upgrade, then these three).

### 32.2 Gyms (`/member/gyms`)

| Element | Content |
|---|---|
| Photo | `gyms` (§34.1: weight-stack plates on a cable machine, dark gym) |
| Eyebrow | `member.gyms` "GYMS" / "GYM". **Not** `member.discoverGyms` as the plan suggested: the section strip below the Featured row already says "Discover gyms" with the count, and the owner does not want the same words twice on one screen. |
| Headline | `hero.gyms.lead` / `.accent`: "Find your / **gym.**" · "Pata / **gym yako.**" |
| Subline | none |
| Action | "Trainers" (`member.trainers`), `FFButton` `onPhoto`, size `sm`, icon `sports_gymnastics_outlined`, **key `member-find-trainer` (moved from the page header)** → `context.go(AppRoutes.memberTrainers)` |
| Removed under the flag | the `FFPageHeader` (title and the ghost Trainers button) |
| Below, unchanged order | search `gym-search` → (linear progress while discovering) → tier chips → filters panel → location spinner → Featured strip → section strip → grid |

### 32.3 Trainers (`/member/trainers`)

| Element | Content |
|---|---|
| Photo | `trainers` (§34.1: a seated coach's hands mid-explanation, no face) |
| Eyebrow | `member.trainers` "TRAINERS" / "MA-TRAINER" |
| Headline | `hero.trainers.lead` / `.accent`: "Train with / **a Trainer.**" · "Fanya mazoezi na / **Trainer.**" |
| Subline / action | none (booking, enquiry and interest live on each trainer's page) |
| Removed under the flag | the `FFPageHeader` ("Find a trainer"; the eyebrow and headline replace it) |
| Below, unchanged | search `trainer-search` → chips → Featured → "Top rated" strip → grid |

Back behaviour: unchanged. `/member/trainers` is a root tab route (`handleRootBack`); the bottom-nav Gyms item goes back to Gyms.

### 32.4 Gyms and Trainers states

| State | Trigger (client state; F-12 adds the flags) | Band | Below |
|---|---|---|---|
| Loading, nothing cached | `!gymsLoaded` (`!trainersLoaded`) | shown (static copy, needs no data); action shown | search + chips as usual (usable); grid area = 4 `FFSkeleton` cards in the grid's columns (no shimmer under reduced motion); **no** "Nothing to show yet" |
| Loaded | list non-empty | shown | as today |
| Discovering (server ranking a search) | `_discoveryLoading` | unchanged | existing 2px progress under the search field |
| Empty network | loaded, `gyms.isEmpty`, no search/filter active | shown | `FFEmptyState(member.noData)` (as today) |
| No match | loaded, list non-empty, but the search/filters leave nothing (`gyms.isEmpty && featured.isEmpty` with a search or non-default filter) | shown | `FFEmptyState` title `member.gymsNoMatch` / `member.trainersNoMatch` + ghost button "Clear search and filters" (`member.clearSearchFilters`, key `gym-clear-search` / `trainer-clear-search`) that resets search, chip, price, amenities and verified to defaults |
| Load failed, nothing cached | `gymsLoadFailed && gyms.isEmpty` | shown | `FFErrorState` title `member.gymsLoadError` / `member.trainersLoadError` + Retry (`common.retry`) → `_refreshGyms` / `_refreshTrainers` |
| Offline, cached | shell `offline`, list non-empty | shown | shell offline banner (solid, under the solid bar, as today); list as cached |
| Offline, nothing cached | shell `offline`, list empty | shown | the "Load failed" state above (same Retry); the banner also shows |
| No photo (high contrast / decode failure) | — | navy `heroPlaceholder`, same text | — |

**Focus order, Gyms:** app bar (inbox, prefs) → offline Retry (if shown) → band heading → Trainers → search → clear-search icon (when text) → tier chips (F-11) → Other filters → filters panel controls (when open) → Featured cards → grid cards → (footer, §33) → bottom nav. **Trainers:** the same without the Trainers button.

### 32.5 Shop home (`/member/shop`)

| Element | Content |
|---|---|
| Photo | `shop` (§34.1: hands tapping a phone, white T-shirt, no face) |
| Eyebrow | `member.shopTitle` "FITFLEX SHOP" / "DUKA LA FITFLEX" |
| Headline | `hero.shop.lead` / `.accent`: "Gear up / **for training.**" · "Jiandae / **kwa mazoezi.**" |
| Subline / action | none. The band has **no CTA**: rails, categories and "Browse all products" are the actions, and a CTA here would compete with sponsored banners later. Never prices, discounts or "sale". |
| Position | **slot 3 of the Shop home order** (`docs/design/shop-home.md` §5.1): segments → search row (search + cart) → **band** → category row → rails → Browse all. This is exactly where the Shop spec puts its hero carousel, so the two never stack. Search and cart stay at the top, reachable without scrolling. |
| Width | inside the shop's 16px gutter (`ShopHomeView.gutter`) and its centred ≤1200 column; ≥840 the `panel` + `rounded` banner, height 200. |

**Shop V2 coexistence rule (testable):**
1. `ShopHomeView` gets `showHero` (default **false**); `ShopBrowseBody` gets the same parameter and passes it through. **Only `MemberShopTab` passes `true`.** `owner_shop_page.dart`, the trainer home's `ShopBrowseBody` and the vendor-personal shop keep the default.
2. The band renders only when all are true: `photoHeroUi`, `showHero`, and `ShopHomeView` is on screen (which already means `SHOP_HOME_V2` on, Browse segment, not the Results view, not `_homeUnavailable`).
3. **Not shown** on: the legacy catalogue (`SHOP_HOME_V2` off, or `_homeUnavailable`), the Results view (search, category, View all), My orders, product detail, checkout.
4. **When Shop Phase 3 banners exist** (`FFHeroCarousel`, not built; Shop spec B-1): if the home answer has ≥1 active banner for this role, the carousel takes slot 3 and the band is **not** rendered. With 0 banners, or when banners fail, the band is the carousel's fallback and **replaces** the Shop spec's navy no-photo fallback slide (§6.3 there) while `PHOTO_HERO_UI` is on; with the flag off the Shop spec's own fallback applies. Never both a band and a carousel.
5. Both use one scrim implementation (`FFPhotoHero`), per §3.2.

**Shop states** (the band never changes with them; it needs no data):

| State (existing, `ShopHomeViewState`) | Band | Below |
|---|---|---|
| Loading, no cache (`data == null && _loading`) | shown | `_ShopHomeSkeleton` (unchanged) |
| Loaded | shown | category row, rails, Browse all |
| Error / offline, no cache (`data == null`) | shown | `FFErrorState` `shop-home-error` / `shop-home-offline` (unchanged) |
| Offline / error with cache | shown | `shop-home-offline-bar` alert above the content, which here means **between the search row and the band** (the alert is about the content, and it must not be buried under a photo) |
| Getting ready (`allProductsCount == 0`) | shown | `FFEmptyState` "The shop is getting ready" (unchanged); no footer |
| Cart has items | shown | sticky cart bar below the list (unchanged) |

**Focus order, Shop:** app bar → Browse / My orders segments → search → cart → offline alert (when shown) → band heading → category tiles → each rail (title, Why, View all, cards) → Browse all → (footer) → cart bar (when shown) → bottom nav.

---

## 33. `FFPhotoFooter`: the page-end band (D-1, D-2)

**Purpose:** a quiet branded full stop at the bottom of long pages, so the end of the scroll feels designed rather than abrupt. It carries no information and no action except "Back to top" on the three long lists.

### 33.1 New component (nothing existing fits)
`lib/shared/components/ff_photo_footer.dart`, and `lib/shared/photo_footer_flag.dart` (`PHOTO_FOOTER_UI`, build-time, same pattern as `photo_hero_flag.dart`, with a `debugPhotoFooterUiOverride` for tests; effective value = `photoHeroUi && kPhotoFooterUi`). `FFPhotoHero` cannot be reused as-is: the footer has a uniform scrim, centred content, no eyebrow/headline semantics, and a show/hide rule that depends on the content above it. It reuses `FFWordmark`, `FFButton(onPhoto)`, `heroImageProvider`, the `_HeroPhotoLayer` fade and the hero tokens.

API: `FFPhotoFooter.sliver({required String pageKey, FFHeroPhoto? top, bool backToTop = false, ScrollController? controller, double extraBottom = 0, bool enabled = true})`. `enabled` is the page's "loaded and not empty" condition (§33.3). Pages built on `ListView` switch to `CustomScrollView(slivers: [SliverList(...), FFPhotoFooter.sliver(...)])` **keeping their existing scroll `Key`** (`activity-scroll`, `profile-scroll`, `passes-scroll`, `gym-detail-scroll`, …).

### 33.2 Anatomy (phone, 390 wide)

```
 ─ last content item ─
 32px gap
┌───────────────────────────────────────┐  inset inside the page padding (24; owner home 24/16)
│ photo (BoxFit.cover, focal)           │  24px corners, clipped
│ uniform scrim #020617 @ 0.80          │
│            [athlete] FitFlex Af       │  FFWordmark size 18, centred, ExcludeSemantics
│               8px                     │
│        That's all for now.            │  Inter 16/24 w600 #F1F5F9, centred, max 2 lines (3 at 1.3×)
│               12px                    │
│          ( ↑ Back to top )            │  Gyms / Trainers / Shop only: FFButton onPhoto sm
└───────────────────────────────────────┘
 24px + bottom safe-area inset + extraBottom
```

- **Height:** 160 at text scale 1.0 on phones; 140 when the viewport is <360 wide or <640 tall; it grows with text up to 200 and beyond 200 only if needed to avoid clipping (AC-M8). **≥840 wide:** 220, inside the same ≤960 column as the page content.
- **Scrim:** a single uniform layer at `heroScrimText` (0.80) over the whole band. The band is short and its text is centred, so a gradient would leave no photo-only zone worth having; uniform 0.80 makes every pixel meet the §5.2 text rule over any photo (DD-9). The photo reads as texture, which is the intent.
- **Contrast** (against 0.80 over pure white, composite `#353845`): line `#F1F5F9` 10.63:1; wordmark white 10.63:1, gold "Af" `#FDBE34` 6.98:1; `onPhoto` button border/label 10.63:1. Under high contrast (navy `#0B192C`): 16.11:1, 10.58:1.
- **Motion:** the photo fades in over 250ms from `heroPlaceholder` (instant under reduced motion). No parallax, no scale, no auto-advance.
- **High contrast:** no photo; navy `heroPlaceholder` ground, same wordmark, line and button.
- **Decode failure:** same as high contrast.
- **Theme:** identical in light and dark (always-dark island, DD-1). No Volt anywhere in the footer, so it is safe on light pages (AC-H6).
- **Copy:** `footer.endLine` "That's all for now." / "Hiyo ndiyo yote kwa sasa." (25 SW chars, longest word 5); `footer.backToTop` "Back to top" / "Rudi juu".

### 33.3 When it shows (the short-page rule)
1. **Flag:** `photoHeroUi && kPhotoFooterUi`. Otherwise not in the tree.
2. **Page is in the list (§33.6)** and the page's `enabled` condition holds: content loaded, and for lists the list (or shop content) is not empty. Never in a loading, empty, error, getting-ready or no-access state.
3. **The page scrolls:** shown only when `precedingScrollExtent + footerExtent > viewportMainAxisExtent` (read from the sliver's `SliverConstraints` in a `SliverLayoutBuilder`). The extent above the footer does not depend on the footer, so the decision cannot feed back on itself and cannot flicker. **Hysteresis:** once shown on this page visit, it stays shown until `enabled` turns false (e.g. a search empties the list) or the route changes; it does not hide because an image above it finished loading a few pixels shorter.
4. **Why not on short pages:** a page that does not scroll has no "end" to mark, and the footer would sit next to the top hero or an empty state, putting two photos on one screen.
5. Built lazily (a sliver), so nothing decodes until the user nears the bottom. Decoded at display size via `heroImageProvider` (`cacheWidth` = band width × device pixel ratio).

### 33.4 Back to top (Gyms, Trainers, Shop only)
- `FFButton` `onPhoto`, `sm` (40 visible, **48 hit area**), icon `arrow_upward`, label `footer.backToTop`, key `photo-footer-back-to-top`.
- Pressed: animates the page's scroll controller to offset 0 (400ms ease-out; `jumpTo(0)` under reduced motion), then moves focus to the band hero's `Focus` node (§32.1), so screen readers read the band heading and the next Tab goes to the band's action (Gyms) or the search field (Trainers, Shop: the first control after the heading in their focus order).
- Not on other pages: they are short enough, or have their own top-level controls in reach (owner decision D-2).

### 33.5 Padding next to bottom bars and buttons
- The footer is inside the scroll content, so it always ends above the shell `NavigationBar`, the shop cart bar and the trainer detail action bar (both are outside the scroll view; no extra padding).
- **Bottom padding:** 24 + `MediaQuery.paddingOf(context).bottom` (0 when a bottom bar has already taken the safe area) + `extraBottom`.
- **Vendor Products only:** `extraBottom = 88` (56 FAB + 16 FAB margin + 16 gap), because the `vendor-add-product` FAB overlays the list once the hero has scrolled away, which is exactly when the footer is on screen. No other footer page has a FAB.

### 33.6 Page list, top photo and footer photo

Footer pages get a fixed footer photo while photos are bundled (deterministic and reviewable). The rule behind the table: **the footer never shares a `sourceId` with the page's top photo**, and two pages one step apart do not share a footer photo. When the app later reads photos from the CMS (slice 6), the pick becomes "per day" (D-5): `pool[fnv1a32('$pageKey|$yyyyMMdd') % n]` over the pool minus the top photo's `sourceId`, FNV-1a 32-bit over UTF-8 (not `String.hashCode`, which may differ between web and VM).

| `pageKey` | Screen (only where listed) | Top photo (`sourceId`) | Footer (stand-in) | Back to top | `enabled` when |
|---|---|---|---|---|---|
| `member.home` | member Home (all pass states) | `homeStart` / `homePass` | `footerWindow` | no | `me != null` |
| `member.activity` | Activity, every section (one footer for all four) | `activity*` | `footerBoxing` | no | `activityLoaded` |
| `member.profile` | Profile | `profile` | `footerStairs` | no | `me != null` |
| `member.passes` | Upgrade plan / buy list (`/member/passes`) | `upgrade` | `footerWarmGym` | no | options or pass list loaded and shown; **hidden while the manual-payment fields or the pending-payment card are on screen** (a payment step, §33.7) |
| `member.gyms` | Gyms | `gyms` | `footerBoxing` | **yes** | `gymsLoaded` and grid non-empty |
| `member.trainers` | Trainers | `trainers` | `footerWindow` | **yes** | `trainersLoaded` and grid non-empty |
| `member.shop` | Shop home (member, §32.5 rule) | `shop` | `footerStairs` | **yes** | home loaded with ≥1 rail or the All products grid; after "Browse all products" |
| `member.gymDetail` | Gym detail (footer only, D-1) | none (the gym's own gallery) | `footerWindow` | no | gym found |
| `member.trainerDetail` | Trainer detail (footer only, D-1) | none | `footerStairs` | no | trainer found |
| `trainer.home` | Trainer app, Home tab only | `trainer` | `footerBoxing` | no | always (the dashboard needs no list) |
| `vendor.products` | Vendor app, Products tab, only while the hero rules of §25.2 show a hero | `vendor` | `footerWarmGym` | no | products loaded and ≥1 product |
| `owner.home` | Gym owner app, Home | `owner` | `footerStairs` | no | dashboard loaded |

Adjacency checks for the table: Gyms (`footerBoxing`) → Trainers (`footerWindow`) → trainer detail (`footerStairs`); Gyms → gym detail (`footerWindow`) → trainer card → trainer detail (`footerStairs`); Home (`footerWindow`) ↔ Activity (`footerBoxing`) ↔ Profile (`footerStairs`); Home → Upgrade (`footerWarmGym`); Home → Shop (`footerStairs`). The footer on gym and trainer detail is one of the two least gym-like photos (a misty window, a glass stair rail), so it does not read as that partner's own photo (the DD-8 concern behind D-1).

### 33.7 Never on
Language, Role, Sign in, Sign up, PIN entry and the PIN flows (forms or pinned keypads), onboarding, checkout and payment pages (`member_payment_page.dart`, the shop checkout sheet, manual payment fields), QR screens and sheets, chat and inbox, dialogs and bottom sheets, the shop Results view, My orders, product detail, every non-home tab of the partner apps, the admin portal, and every page not in §33.6.

### 33.8 Semantics and focus
- The photo and the wordmark are excluded (`ExcludeSemantics`; `FFWordmark` has its own "FitFlex" label, which must not be read here).
- The sign-off line is **one plain text node**, not a header, not a live region.
- "Back to top" is a button labelled with its visible text; it is the only focusable element in the footer.
- Focus order: last content control → Back to top (when present) → bottom nav. Screen-reader order: last content → "That's all for now." → Back to top.

---

## 34. Photos for addendum 2 (stand-ins), bundle math

### 34.1 Stand-in crops
Chosen from the **13 photos in `social/brand/photos/` (branch `release-candidate`) not yet used in the apps**: 10376250, 33832204, 34043570, 36510739, 36510744, 4173217, 5592605, 5647574, 5878659, 6388369, 6496099, 6604154, 8612491. All are Pexels licence, pages checked "Free" on 2026-10-16, none marked AI-generated (README there). Every one of them shows a person with a clear face somewhere in the frame, so each crop below was chosen to leave every face out, and was checked at 100% on 2026-10-19. Owner decision 2 applies: people only as backs, hands or unclear faces.

Crops are source pixels `l,t,r,b`; "focal" is the `Alignment` for `BoxFit.cover` (C-2); grade = brightness factor before export. Sizes are from a Pillow export at WebP q72 (`method=6`), sRGB, metadata dropped; the builder re-exports with the same settings and reports real sizes. "Text-zone L" = mean / max relative luminance of the area under text after grading, measured on a 64px-wide sample (bottom 55% for bands, whole frame for footers); §8.3 target ≤0.20 mean, ≤0.45 max. The contrast guarantee does not depend on it (DD-9).

| `FFHeroPhoto` | File | Source (photographer) | Crop → aspect | 2× (1× = half) | Focal | Grade | Text-zone L | People, and why it qualifies | 2× / 1× bytes |
|---|---|---|---|---|---|---|---|---|---|
| `gyms` | `hero_gyms.webp` | `pexels-33832204` "Confident Woman in Gym Exercise Pose" (photobydela) | 0,0,1100,620 → 1.77:1 | 1080×609 | (−0.3, −0.2) plates and pin selector | ×0.75 | 0.030 / 0.515 | **none**: the crop is the weight stack and dark gym above and left of the woman; her raised hand starts about 60px below the crop's bottom edge and her face lower still. One narrow chrome highlight on the left upright measures 0.52 (above the 0.45 art target, inside the 0.50→0.80 photo zone at most widths); the builder may darken it locally. | 15,618 / 6,288 |
| `trainers` | `hero_trainers.webp` | `pexels-36510739` "Fitness Trainer in Busy Gym Environment" (Carbell Sarfo) | 100,650,1100,1000 → 2.86:1 | 1000×350 | (0.15, 0.0) hands | ×0.85 | 0.028 / 0.438 | **hands, forearms and knees** of a seated man; the crop starts about 230px below his chin and below the gym logo on his shirt (another gym's brand, so it is cut out); two phones on the bench show their backs/dark screens. **No face in frame.** The source is only 350px tall, so a 180–220px band at 2× upscales it about 1.26×; acceptable under the scrim, replace with the owner's photo. | 10,932 / 4,600 |
| `shop` | `hero_shop.webp` | `pexels-5592605` "A Young Man in a Yellow Beanie Using a Smartphone" (Thirdman) | 250,1300,1500,2100 → 1.56:1 | 1080×691 | (−0.1, 0.2) hands on the phone | ×0.6 (white shirt and wall) | 0.144 / 0.256 | **two hands, forearms and a white T-shirt**; the crop starts about 220px below the chin. **No face in frame.** The phone shows its yellow case, not a screen. Reads as "shopping on your phone". | 8,650 / 3,672 |

Footer pool (all 16:7, the footer's 160–220px band at 342–912px wide; focal centre unless noted):

| `FFHeroPhoto` | File | Source (photographer) | Crop | 2× (1× = half) | Grade | Text-zone L | People, and why it qualifies | 2× / 1× bytes |
|---|---|---|---|---|---|---|---|---|
| `footerWarmGym` | `footer_warm_gym.webp` | `pexels-36510744` "Focused Gym Trainer in Modern Fitness Center" (Carbell Sarfo) | 820,0,1500,297 | 680×297 | ×0.65 | 0.127 / 0.362 | the warm, out-of-focus gym behind the trainer; one distant **backlit silhouette with no facial features** at the lower left (an "unclear face"); the trainer's head is left of x=820 and outside the crop | 6,640 / 3,172 |
| `footerBoxing` | `footer_boxing.webp` | `pexels-8612491` "A Man in Black Crew Neck T-shirt Smiling at the Camera" (RDNE Stock project) | 960,230,1500,466 | 540×236 | ×0.6 | 0.119 / 0.305 | the blurred boxing gym to the man's left (rowers, speed bags, heavy bag); at most two **tiny out-of-focus figures** with no features; the man's head and shoulder end at x≈900 and are outside the crop | 2,916 / 1,362 |
| `footerWindow` | `footer_window.webp` | `pexels-6388369` "A Woman in Black Tank Top Exercising in the Gym" (Tima Miroshnichenko) | 0,0,1050,460 | 960×421 | ×0.75 | 0.138 / 0.333 | **none**: the misty gym windows above and left of the woman; her hair starts below y≈480 and right of x≈1000 | 2,474 / 1,026 |
| `footerStairs` | `footer_stairs.webp` | `pexels-5647574` "Serious African American manager texting message on smartphone" (Ono Kosuki) | 450,1720,1500,2179 | 960×420 | ×0.85 | 0.086 / 0.315 | **none**: the glass stair rail below the man; his body ends above y≈1600 at this x range | 11,720 / 3,206 |

**Rejected from the 13, and why:** 10376250 (office desk, not fitness), 4173217 (airport corridor, not fitness), 34043570 and 6604154 (only shirtless torsos remain once faces are cut: body-focused, the same reason a 6388387 body crop was rejected in §26), 6496099 (only a torso in a fitted top remains below the face: body-focused), 5878659 (only small blurred corners remain; the clean regions are under 500px wide). The other crops of 36510739 (the backlit people behind the trainer) also qualify but repeat the `trainers` source, so they were not used.

**`sourceId` (new field on every `FFHeroPhoto` value, C-2 extended).** The footer rule compares *scenes*, not files, so photos from the same shoot share one id. Existing values: `language` and `activityToday` `pexels-12250460`; `signIn`, `activityTraining` and `vendor` `scene-tubarones-9545` (9545909 and 9545914 are the same gym); `signUp` and `activityProgress` `pexels-3916766`; `role`, `homeStart` and `owner` `pexels-29526371`; `homePass` `pexels-5312212`; `profile` `pexels-4716814`; `pin` `pexels-7432872`; `upgrade` and `activityChallenges` `scene-ketut-4720` (4720565 and 4720518 are one shoot); `trainer` `scene-tima-6388`. New: `gyms` `pexels-33832204`; `trainers` and `footerWarmGym` `scene-carbell-sarfo-3651` (36510739 and 36510744 are one shoot); `shop` `pexels-5592605`; `footerBoxing` `pexels-8612491`; `footerWindow` `scene-tima-6388` (same shoot as the trainer home photo); `footerStairs` `pexels-5647574`. So `footerWarmGym` must never be picked on Trainers, and `footerWindow` never on the trainer home: the §33.6 table respects this, and the test in AC-M4 checks it for every page.

**Adjacency (no top photo on two screens one step apart, AC-H18):** Gyms (`gyms`) ↔ Trainers (`trainers`) ↔ trainer detail (the trainer's own photos) and Gyms ↔ gym detail (the gym's own photos): distinct. Home (`homeStart` / `homePass`) → Gyms (`gyms`) and → Shop (`shop`): distinct. `shop` and `pin` both show hands on a phone, from different sources, and are never adjacent (PIN is before sign-in).

**Licence rows:** the builder adds one row per file to `fitflexmobile/assets/photos/hero/LICENSES.md` with the existing columns (file, used on, source page, photographer, licence, crop, 2× size, bytes, people) and, for `trainers` and `shop`, the words "no face in frame". **No row, no ship** (§8.1).

**Gaps:** none of these is Tanzanian (O-1). The `trainers` source is low-resolution for a band. Replace all seven with the owner's photos (slice 3, §35).

### 34.2 Bundle math

| | 2× bytes | 1× bytes | Total |
|---|---|---|---|
| On RC today (16 heroes, `LICENSES.md` totals) | — | — | **1,061,970** |
| Stand-ins, 3 section heroes (prototype) | 35,200 | 14,560 | 49,760 |
| Stand-ins, 4 footer photos (prototype) | 23,750 | 8,766 | 32,516 |
| **All hero assets with stand-ins** | | | **≈1,144,246 (1.14 MB)** |
| Budget (§26) | | | **1,600,000** |

The stand-ins are small because they are dark, out of focus or plain. The owner's sharper photos will be bigger, so the budget is held by **per-slot caps** that the plan's estimate (≈1.53 MB) assumes:

| Slot group | 2× cap | 1× cap | × slots | Worst case |
|---|---|---|---|---|
| `gyms`, `trainers`, `shop` | 60 KB | 25 KB | 3 | 255 KB |
| footer pool | 40 KB | 12 KB | 4 | 208 KB |
| **All hero assets, worst case** | | | | **1,061,970 + 463,000 ≈ 1.53 MB** (≤1.6 MB) |

How to meet a cap: export WebP q72; if over, step quality down 72 → 65 → 58 → 50; if still over, reduce the 2× width to 960 (bands) or 860 (footers). If the total ever passes 1.6 MB, drop the footers' 1× files first (Flutter falls back to the 2× file on 1× screens; saves ≈48 KB), as the plan says. The PR reports the measured total and the APK / web build size change.

### 34.3 Owner photo replacement (slice 3)
The owner's photo replaces a stand-in **in place**: same file name, same `FFHeroPhoto` value, new `sourceId`, new focal point, new `LICENSES.md` row (the stand-in row is deleted). The §33.6 footer table is re-checked against the new `sourceId`s; if a replacement shares a scene with a page's top photo, that page's footer moves to the next pool photo in table order.

---

## 35. Owner photo-intake guide (slice 3)

Plain-language guide for the owner and anyone taking photos for FitFlex. The design-agent prepares the crops from these; nothing ships until each photo passes the checks in §35.4.

### 35.1 What to send
| For | How many | Shows | Avoid |
|---|---|---|---|
| Gyms list | 1–3 | A gym space: equipment rows, a rack, the floor, a doorway with daylight | A recognisable single partner gym's name, logo or signage (it would look like we favour that gym on the list of all gyms), unless the owner decides otherwise |
| Trainers list | 1–3 | Coaching without faces: hands guiding a grip, a clipboard or stopwatch, a trainer seen from behind with a client | A trainer's face or name badge |
| Shop | 1–3 | Gear and products: shoes, bottles, bands, supplements on a shelf, hands holding a product | Other brands' logos big enough to read; prices; FitFlex-sold product claims |
| Page footers | up to 4 | Calm, texture-like: a towel on a bench, a window in morning light, chalk on a floor, a rack in shadow | Anything recognisable as one particular gym (footers also show on other gyms' pages) |

Later, with the photo manager (slices 4–6), each place can hold up to five photos and the app rotates them once a day; that adds nothing to the app's size.

### 35.2 How to take them
- **Landscape**, at least **2160px on the long edge** (any phone camera from the last few years). Take a few steps back: we crop, we cannot add.
- Put the subject in the **upper right third**. Keep the **bottom half and the left side calm and darker** (no bright window or lamp there): that is where the text goes.
- Natural light, Dar es Salaam spaces where possible. No flash glare on mirrors or chrome.
- **No text in the photo** (posters, screens, whiteboards); the app adds its own words in English and Swahili.

### 35.3 People
- **No recognisable faces.** Backs, hands, silhouettes and faces that are out of focus or turned away only. Check **mirrors and reflections** too: a face in a gym mirror counts.
- **No children.**
- **No screens** showing names, phone numbers, messages or QR codes; no car number plates.
- If someone is in the photo even from behind, ask them first and tell us who they are (first name is enough) so we can record it.

### 35.4 For each photo, tell us
1. Who took it (name).
2. Where (gym name or place, area of Dar es Salaam).
3. That FitFlex may use it in the apps and on the portal, with no end date (or the end date).
4. **If it was taken inside a partner gym:** that gym's written permission (a short message or email from the owner or manager naming FitFlex and saying the photo may be used in the FitFlex apps). We file it as the consent reference.
5. Whether anyone is in the frame (no one / hands or backs / faces not clear).

### 35.5 How to send
Send the **original files** (JPEG or HEIC straight from the camera) as **files or documents**, for example from Google Drive, email attachments, or WhatsApp "Document". Do **not** send them as WhatsApp photos: WhatsApp shrinks them below what we need.

### 35.6 What the design-agent does with them (checklist)
1. Check at 100% for faces, reflections, screens, plates, logos and children; reject or re-crop.
2. Crop per slot (band 1.6–1.8:1; footer 16:7), set the focal point, grade per §8.3, measure text-zone luminance.
3. Convert to sRGB, **strip all metadata including GPS** (HEIC from iPhones carries location), export per the §34.2 caps.
4. Write the `LICENSES.md` row: file, used on, photographer, place, licence ("Owned by FitFlex" / "Partner consent"), consent reference, "no face in frame", sizes.
5. Hand the files to mobile-builder for the assets-only PR (slice 3) and, if the portal login photo changes, to portal-builder.

---

## 36. Admin "App photos" screen (portal, slice 5)

**Purpose:** let an admin with the `brand_media` scope change the photos behind the app's headings and the portal sign-in page without a new app build, safely: nothing goes public until Publish, every change is recorded, and any earlier version can be put back with one click (D-4).

**Route:** `/admin/hero-images` (`app/admin/hero-images/page.tsx`), component `src/components/hero-image-manager.tsx`. **Nav:** "App photos" (`admin.nav.heroImages`), icon `Images` (lucide), group `nav.group.platform` after Exercises, `aclScope: 'brand_media'`, shown only when `NEXT_PUBLIC_HERO_IMAGES_ADMIN` is on. **Server:** every `/admin/hero-*` call 404s while `HERO_IMAGES_CMS` is off (§36.7).

**Reuse:** `PageHeader`, `Segmented`, `Card`, `Button`, `Badge`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Alert`, `Table`, `EmptyState`, `ErrorState`, `Skeleton*`, `Spinner` (`src/components/shared.tsx`), `Dialog` / `ConfirmDialog` (`src/components/dialog.tsx`), toasts (`src/components/ui/toast.tsx`), and the scrim CSS and `--hero-*` tokens in `app/globals.css` used by `photo-panel.tsx`. **New:** `HeroPreview` (a preview frame that applies the real scrim to a photo at a fixed size, because `PhotoPanel` is a page layout, not a sized frame) and `FocalPointPicker` (no 2-D picker exists). The upload dialog is modelled on `image-upload.tsx` **but must not downscale or re-encode in the browser** (that component shrinks to 1280px WebP; the server needs the original to make the variants and to strip metadata itself).

### 36.1 Layout
**Desktop (≥1024):** `PageHeader` title "App photos", subtitle "Photos behind the headings in the FitFlex app and on the portal sign-in page. Changes go live only when you publish." Actions: **Upload photo** (secondary), **Publish** (primary; disabled with the hint "No changes to publish" when no draft differs from what is published). Below: an info `Alert` (always shown): "The app shows these photos only in builds with remote photos turned on. Until then it keeps its built-in photos." Then a `Segmented` control: **Places** · **Library** · **History**.

**Tablet / phone (<1024):** the same content in one column; header actions wrap under the title; slot cards stack; tables in History scroll horizontally inside their wrapper (existing `Table`).

### 36.2 Places (slots grouped by area)
One `Card` per area, in this order, each slot a row:

| Area | Slots (`slotId` → label) |
|---|---|
| Before sign-in | `language` Language screen · `signIn` Sign in · `signUp` Create account · `role` Choose account type · `pin` PIN screens |
| Members | `homeStart` Home, no active pass · `homePass` Home, active pass · `profile` Profile · `upgrade` Upgrade plan · `activityToday` Activity: Today · `activityTraining` Activity: Training · `activityChallenges` Activity: Challenges · `activityProgress` Activity: Progress · `gyms` Gyms list · `trainers` Trainers list · `shop` Shop home |
| Partners | `trainer` Trainer home · `vendor` Vendor products · `owner` Gym owner home |
| Page footers | `footerPool` Page footers (up to 8) |
| Portal | `portalLogin` Portal sign-in |

The slot ids mirror the `FFHeroPhoto` names (backend registry `src/shared/hero-slots.mjs`); the labels live in the portal's i18n by slot id. A slot id the portal does not know is shown under its raw id in an "Other" card, never hidden.

**Slot row:** label · one line "Shows on …" (`heroImages.slot.<id>.where`) · **Published** thumbnails (64×40, `object-fit: cover` at the image's focal point) or "Using the built-in photo" · **Draft** thumbnails when they differ, with a `Badge` "Changed" (warning tone) · a "Bright" badge on any image whose `textZoneLuminance > 0.20` · actions **Choose photos** (opens the picker dialog) and **Preview** (opens the preview dialog for the first draft image). Count hint "{n} of {max}" when `maxImages > 1`.

**Choose photos dialog:** grid of library images with status Draft or Published (not Retired), multi-select up to the slot's `maxImages` (checkbox on each card, label "Photo by {photographer}, {source}"), the selected ones listed below in order with Move up / Move down buttons (no drag-only reordering), **Use the built-in photo** (clears the slot), **Save** → `PUT /admin/hero-slots/:slotId` with the ordered ids. Saving changes the **draft only**; the dialog says so: "Saved as a draft. Publish to send it to the apps."

### 36.3 Library
Grid of uploaded images (newest first), filter `Select`: All · Draft · Published · Retired. Each card: thumbnail, status `Badge` (Draft neutral, Published success, Retired muted), people `Badge` (No people / Hands or backs only / Faces not clear), photographer and source, "Used in {n} places" (from the slots' draft and published lists), actions **Edit** and **Retire** (Retire is disabled with the hint "Remove it from every place first" while any draft slot uses it; published copies stay until the next publish). Empty: `EmptyState` "No photos uploaded yet" + Upload photo.

Thumbnails come from `GET /admin/hero-images/:id/preview`, which needs the admin's token, so the portal fetches each as a blob with the `Authorization` header and shows an object URL (revoked on unmount); lazy, one request at a time, cached for the session. `alt` = "Photo by {photographer}, {source}".

### 36.4 Upload form (dialog)
Fields, in order (all labels visible, errors under the field, `aria-describedby`):
1. **Photo file**: drop zone + "Choose a file" button. Accepts JPEG, PNG, WebP; up to 15 MB; at least 1080px wide. The browser reads the size and dimensions locally and shows an error at once (the server checks again). Shows the file name, size and pixel size after choosing. HEIC is not accepted here (O-31); the hint says "Convert HEIC to JPEG first."
2. **Source** (`source`, text, required): hint "Where the photo comes from, e.g. FitFlex shoot, partner gym, Pexels."
3. **Photographer** (`photographer`, text, required).
4. **Licence** (`licence`, text, required): hint "e.g. Owned by FitFlex, Partner consent, Pexels licence."
5. **Licence link or reference** (`licenceRef`, optional).
6. **People in the photo** (`people`, radio group, required, no default): No people · Hands or backs only · Faces not clear.
7. **Taken in a partner gym?** checkbox (UI only); when ticked, **Partner consent reference** (`consentRef`) becomes required, hint "The gym's written permission, e.g. an email date or document number."
8. Two **confirmations**, unticked by default, both required:
   - `heroImages.rights.confirm` "I confirm FitFlex has the right to use this photo in its apps and portal."
   - `heroImages.faces.confirm` "No one in this photo can be recognised: only backs, hands or unclear faces."
9. **Upload** (primary) is disabled until 1–8 are valid; **Cancel**.

While uploading: a progress bar with percentage (`aria-valuenow`), fields disabled, Cancel aborts the request. On success: toast "Photo uploaded. Set its focus point next." and the Edit view (§36.5) opens for the new image.

### 36.5 Edit view: focal point and previews
Opens as a full-width dialog (desktop) / full page (phone). Left: the **focal-point picker**; right (below on phones): **previews**; footer: licence fields (same as upload, editable, `PATCH`), **Save**, **Cancel**.

**Focal-point picker (`FocalPointPicker`):**
- The image fit to the column (max 640 wide), with a crosshair: a 28px ring, 2px white plus 2px `#020617` outline so it shows on any photo, and a centre dot.
- **Pointer:** click or tap sets the point; drag moves it.
- **Keyboard:** the picker is one Tab stop (`role="group"`, label "Focus point"); Arrow keys move 5%, Shift+Arrow 1%, Home puts it back to the centre. Focus ring: the portal's `--color-brand-600` outline, 2px offset.
- **Screen readers and fine control:** two labelled range inputs below the image, **Left–right** and **Top–bottom**, −100…100, showing "{n}% from left" / "{n}% from top"; they and the crosshair stay in sync. A polite live region announces the new position after a change (debounced 500ms).
- Value saved as `focal: {x, y}` in −1…1 (Flutter `Alignment`); CSS previews use `object-position: ((x+1)/2·100)% ((y+1)/2·100)%`.
- Hint under the image (`heroImages.focal.hint`): "Click the subject to keep it in view."

**Previews (`HeroPreview`), three fixed sizes, real scrim, sample text:**
| Preview | Size (CSS px) | Scrim (from `--hero-*`) | Text |
|---|---|---|---|
| Phone hero | 390 × 300 | vertical: 0.50 at the top → 0.80 from 24px above the text, text bottom-left (as `FFPhotoHero compact`) | eyebrow "SAMPLE", headline "Every step **counts.**" (accent `--hero-accent-light`) |
| Phone band | 342 × 180 (footer slots: 342 × 160 with uniform 0.80, wordmark and "That's all for now.") | vertical, as `band` | same sample |
| Desktop | 960 × 320 banner (portal sign-in slot: 704 × 800 panel) | horizontal: 0.92 → 0.80 → 0.30, plus the bottom layer (as `photo-panel`) | same sample, text in the left half |
- Each preview has a caption with its size and a toggle "Show 1.3× text" (text scale for the check).
- The brightness `Alert` (warning tone) shows above the previews when `textZoneLuminance > 0.20`: "This photo is bright where the text sits. It will still be readable but will look darker." Publishing is still allowed.
- Under `prefers-reduced-motion`, no transitions in the picker or previews.

### 36.6 Publish and history
**Publish dialog** ("Publish these changes?"): a list, one row per changed slot: slot label · **Before** thumbnails (or "Built-in photo") → **After** thumbnails (or "Built-in photo"); a count line "{n} places change"; **Note** (optional, ≤200 characters, `Textarea`); footer text "Apps pick up the new photos the next time they open, or within a few hours."; buttons **Publish** (primary) and Cancel. While publishing (the server builds the public versions): spinner in the button, dialog not dismissable, up to the request timeout. Success: toast "Published. Version {id}." and History opens.

**History tab:** `Table` of the last 20 publications, newest first: **Version** (`#id`, "Current" badge on the newest) · **Published** (date and time, Africa/Dar_es_Salaam, `dd MMM yyyy, HH:mm`) · **By** (publisher name) · **Note** · **Changes** ("{n} places") · **Put back** (`heroImages.rollback` "Put back this version", on every row except Current; a row created by rollback shows the badge "Put back from #{id}"). Clicking Put back opens a `ConfirmDialog` with the same before/after list (Current → that version) and "Put back" / Cancel; success creates a new publication (toast "Version #{id} is live again.").

### 36.7 States and errors
| State | What the admin sees |
|---|---|
| Loading | `SkeletonCard` × 3 (Places), `SkeletonTable` (History) |
| Server feature off (`GET /admin/hero-images` → 404) | `EmptyState` "App photos are switched off" / body "This feature is turned off on the server." No actions. |
| No access (403, or the scope is missing) | nav item hidden; a direct visit shows the portal's existing no-access page |
| Load failed (network / 5xx) | `ErrorState` "Couldn't load app photos." + Try again |
| Empty library | Places: every slot "Using the built-in photo"; Library: `EmptyState` + Upload photo |
| Nothing to publish | Publish disabled, hint "No changes to publish" |
| Upload: `rights_confirmation_required` / `no_faces_confirmation_required` | field error on the box: "Tick this box to confirm." (the button should have prevented it) |
| Upload: `image_too_small` | "This photo is too small. Use one at least 1080 pixels wide." |
| Upload: `unsupported_file_type` | "This file type isn't supported. Use JPEG, PNG or WebP." |
| Upload: 413 `file_too_large` | "This file is larger than 15 MB." |
| Upload: 503 `storage_service_unavailable` | "Photo storage isn't available right now. Try again in a few minutes." |
| Slot save: `unknown_slot` | "This place no longer exists. Reload the page." |
| Slot save: `too_many_images` | "This place takes up to {max} photos." |
| Slot save: `image_retired` | "One of these photos was retired. Choose another." |
| Publish / rollback failed | `Alert` in the dialog: "Couldn't publish. Nothing has changed in the apps." + Try again |
| Network error anywhere | toast "You're offline or the server can't be reached." (existing pattern) |
| Unknown error code | "Something went wrong ({code})." so support can trace it |

### 36.8 Focus order and semantics
Header (title, Upload photo, Publish) → info alert → Places / Library / History → content of the tab in reading order (area card → slot rows → Choose photos → Preview). Dialogs trap focus, start on the first field (upload) or the dialog title (publish, confirm), Escape closes (except while publishing), and focus returns to the button that opened them. The page has one `<h1>` ("App photos"); area names are `<h2>`. Status badges have text, not colour alone. All controls ≥44px tall.

---

## 37. Copy, backend fields, flags

### 37.1 Mobile copy (all Swahili draft for native review)
| Key | English | Swahili | Chars EN / SW | Longest word |
|---|---|---|---|---|
| `hero.gyms.lead` / `.accent` | Find your / **gym.** | Pata / **gym yako.** | 14 / 14 | 5 |
| `hero.trainers.lead` / `.accent` | Train with / **a Trainer.** | Fanya mazoezi na / **Trainer.** | 21 / 25 | 8 |
| `hero.shop.lead` / `.accent` | Gear up / **for training.** | Jiandae / **kwa mazoezi.** | 21 / 20 | 9 |
| `footer.endLine` | That's all for now. | Hiyo ndiyo yote kwa sasa. | 19 / 25 | 6 |
| `footer.backToTop` | Back to top | Rudi juu | 11 / 8 | 4 |
| `member.gymsLoadError` (F-12) | We couldn't load gyms. | Hatukuweza kupakia gym. | 22 / 23 | 10 |
| `member.trainersLoadError` (F-12) | We couldn't load Trainers. | Hatukuweza kupakia ma-trainer. | 26 / 30 | 10 |
| `member.gymsNoMatch` | No gyms match your search or filters. | Hakuna gym inayolingana na utafutaji au vichujio vyako. | 37 / 55 | 12 |
| `member.trainersNoMatch` | No Trainers match your search or filters. | Hakuna trainer anayelingana na utafutaji au vichujio vyako. | 41 / 59 | 12 |
| `member.clearSearchFilters` | Clear search and filters | Futa utafutaji na vichujio | 24 / 26 | 9 |

Reused (no new translation): `member.gyms`, `member.trainers`, `member.shopTitle`, `member.noData`, `common.retry`, `app.title` (wordmark, not read in the footer). Eyebrow lengths (uppercased, ≤28): "GYMS" / "GYM", "TRAINERS" / "MA-TRAINER", "FITFLEX SHOP" / "DUKA LA FITFLEX". Words for the native reviewer: "Jiandae" (get ready), "inayolingana / anayelingana" (that matches), "vichujio" (filters, as in `shop.clearFilters`).

### 37.2 Portal copy (all Swahili draft for native review; portal uses "bonyeza")
| Key | English | Swahili |
|---|---|---|
| `admin.nav.heroImages` | App photos | Picha za app |
| `heroImages.title` | App photos | Picha za app |
| `heroImages.subtitle` | Photos behind the headings in the FitFlex app and on the portal sign-in page. Changes go live only when you publish. | Picha zilizo nyuma ya vichwa kwenye app ya FitFlex na kwenye ukurasa wa kuingia wa portal. Mabadiliko yanaonekana tu ukichapisha. |
| `heroImages.remoteNote` | The app shows these photos only in builds with remote photos turned on. Until then it keeps its built-in photos. | App inaonyesha picha hizi tu kwenye matoleo yaliyowashwa picha za mtandaoni. Hadi hapo inatumia picha zake zilizomo. |
| `heroImages.tab.places` / `.library` / `.history` | Places / Library / History | Sehemu / Maktaba / Historia |
| `heroImages.area.preSignIn` / `.members` / `.partners` / `.footers` / `.portal` / `.other` | Before sign-in / Members / Partners / Page footers / Portal / Other | Kabla ya kuingia / Wanachama / Washirika / Sehemu za chini za kurasa / Portal / Nyingine |
| `heroImages.slot.language` … `.portalLogin` | the labels in §36.2 | Skrini ya lugha · Kuingia · Kufungua akaunti · Kuchagua aina ya akaunti · Skrini za PIN · Nyumbani, bila pasi hai · Nyumbani, pasi hai · Wasifu · Boresha mpango · Shughuli: Leo · Shughuli: Mazoezi · Shughuli: Challenges · Shughuli: Maendeleo · Orodha ya gym · Orodha ya ma-trainer · Duka · Nyumbani kwa trainer · Bidhaa za muuzaji · Nyumbani kwa mmiliki wa gym · Sehemu za chini za kurasa · Kuingia kwenye portal |
| `heroImages.slot.<id>.where` | one line per slot, e.g. "Shows at the top of the Gyms list." | e.g. "Inaonekana juu ya orodha ya gym." |
| `heroImages.empty` | Using the built-in photo | Inatumia picha iliyomo kwenye app |
| `heroImages.changed` / `.bright` | Changed / Bright | Imebadilishwa / Ina mwanga mwingi |
| `heroImages.countOfMax` | {n} of {max} | {n} kati ya {max} |
| `heroImages.choose` / `.preview` / `.useBuiltIn` / `.save` | Choose photos / Preview / Use the built-in photo / Save | Chagua picha / Hakiki / Tumia picha iliyomo / Hifadhi |
| `heroImages.savedDraft` | Saved as a draft. Publish to send it to the apps. | Imehifadhiwa kama rasimu. Chapisha ili ifike kwenye app. |
| `heroImages.moveUp` / `.moveDown` | Move up / Move down | Sogeza juu / Sogeza chini |
| `heroImages.upload` | Upload photo | Pakia picha |
| `heroImages.file` / `.file.hint` | Photo file / JPEG, PNG or WebP, up to 15 MB, at least 1080 pixels wide. Convert HEIC to JPEG first. | Faili la picha / JPEG, PNG au WebP, hadi MB 15, upana wa angalau pikseli 1080. Badilisha HEIC kuwa JPEG kwanza. |
| `heroImages.chooseFile` | Choose a file | Chagua faili |
| `heroImages.source` / `.source.hint` | Source / Where the photo comes from, e.g. FitFlex shoot, partner gym, Pexels. | Chanzo / Picha imetoka wapi, k.m. upigaji picha wa FitFlex, gym mshirika, Pexels. |
| `heroImages.photographer` | Photographer | Mpiga picha |
| `heroImages.licence` / `.licence.hint` | Licence / e.g. Owned by FitFlex, Partner consent, Pexels licence. | Leseni / k.m. Mali ya FitFlex, Ridhaa ya mshirika, Leseni ya Pexels. |
| `heroImages.licenceRef` | Licence link or reference (optional) | Kiungo au kumbukumbu ya leseni (si lazima) |
| `heroImages.people` | People in the photo | Watu kwenye picha |
| `heroImages.people.none` / `.handsBacks` / `.unclearFaces` | No people / Hands or backs only / Faces not clear | Hakuna watu / Mikono au migongo tu / Nyuso si wazi |
| `heroImages.partnerGym` | Taken in a partner gym? | Imepigwa ndani ya gym mshirika? |
| `heroImages.consentRef` / `.consentRef.hint` | Partner consent reference / The gym's written permission, e.g. an email date or document number. | Kumbukumbu ya ridhaa ya mshirika / Ruhusa ya maandishi ya gym, k.m. tarehe ya barua pepe au namba ya hati. |
| `heroImages.rights.confirm` | I confirm FitFlex has the right to use this photo in its apps and portal. | Nathibitisha kuwa FitFlex ina haki ya kutumia picha hii kwenye app na portal zake. |
| `heroImages.faces.confirm` | No one in this photo can be recognised: only backs, hands or unclear faces. | Hakuna mtu anayeweza kutambulika kwenye picha hii: migongo, mikono au nyuso zisizo wazi tu. |
| `heroImages.uploaded` | Photo uploaded. Set its focus point next. | Picha imepakiwa. Sasa weka sehemu kuu ya picha. |
| `heroImages.focal` / `.focal.hint` | Focus point / Click the subject to keep it in view. | Sehemu kuu / Bonyeza kitu kikuu ili kibaki kionekane. |
| `heroImages.focal.x` / `.focal.y` | Left–right / Top–bottom | Kushoto–kulia / Juu–chini |
| `heroImages.focal.fromLeft` / `.fromTop` | {n}% from left / {n}% from top | {n}% kutoka kushoto / {n}% kutoka juu |
| `heroImages.preview.phone` / `.band` / `.desktop` / `.scale` | Phone hero / Phone band / Desktop / Show 1.3× text | Picha ya simu / Ukanda wa simu / Kompyuta / Onyesha maandishi 1.3× |
| `heroImages.preview.sampleEyebrow` / `.sampleLead` / `.sampleAccent` | SAMPLE / Every step / counts. | MFANO / Kila hatua / ina thamani. |
| `heroImages.brightWarning` | This photo is bright where the text sits. It will still be readable but will look darker. | Picha hii ina mwanga mwingi mahali maandishi yalipo. Bado yatasomeka, ila picha itaonekana nyeusi zaidi. |
| `heroImages.status.draft` / `.published` / `.retired` | Draft / Published / Retired | Rasimu / Imechapishwa / Imestaafishwa |
| `heroImages.usedIn` | Used in {n} places | Inatumika sehemu {n} |
| `heroImages.edit` / `.retire` / `.retire.blocked` | Edit / Retire / Remove it from every place first. | Hariri / Staafisha / Iondoe kwenye kila sehemu kwanza. |
| `heroImages.library.empty` | No photos uploaded yet | Bado hakuna picha zilizopakiwa |
| `heroImages.publish` | Publish | Chapisha |
| `heroImages.publish.none` | No changes to publish | Hakuna mabadiliko ya kuchapisha |
| `heroImages.publish.title` / `.count` / `.note` / `.when` | Publish these changes? / {n} places change / Note (optional) / Apps pick up the new photos the next time they open, or within a few hours. | Chapisha mabadiliko haya? / Sehemu {n} zinabadilika / Maelezo (si lazima) / App zitapata picha mpya zitakapofunguliwa tena, au ndani ya saa chache. |
| `heroImages.before` / `.after` / `.builtIn` | Before / After / Built-in photo | Kabla / Baada / Picha iliyomo |
| `heroImages.published` | Published. Version {id}. | Imechapishwa. Toleo {id}. |
| `heroImages.history.version` / `.when` / `.by` / `.note` / `.changes` / `.current` / `.fromRollback` | Version / Published / By / Note / Changes / Current / Put back from #{id} | Toleo / Imechapishwa / Na / Maelezo / Mabadiliko / La sasa / Limerudishwa kutoka #{id} |
| `heroImages.rollback` / `.rollback.done` | Put back this version / Version #{id} is live again. | Rudisha toleo hili / Toleo #{id} linatumika tena. |
| `heroImages.off.title` / `.off.body` | App photos are switched off / This feature is turned off on the server. | Picha za app zimezimwa / Huduma hii imezimwa kwenye seva. |
| `heroImages.loadError` | Couldn't load app photos. | Hatukuweza kupakia picha za app. |
| `heroImages.error.confirmRequired` | Tick this box to confirm. | Weka alama kwenye kisanduku hiki kuthibitisha. |
| `heroImages.error.imageTooSmall` | This photo is too small. Use one at least 1080 pixels wide. | Picha hii ni ndogo mno. Tumia yenye upana wa angalau pikseli 1080. |
| `heroImages.error.unsupportedFileType` | This file type isn't supported. Use JPEG, PNG or WebP. | Aina hii ya faili haikubaliki. Tumia JPEG, PNG au WebP. |
| `heroImages.error.fileTooLarge` | This file is larger than 15 MB. | Faili hili ni kubwa kuliko MB 15. |
| `heroImages.error.storageUnavailable` | Photo storage isn't available right now. Try again in a few minutes. | Hifadhi ya picha haipatikani sasa hivi. Jaribu tena baada ya dakika chache. |
| `heroImages.error.unknownSlot` | This place no longer exists. Reload the page. | Sehemu hii haipo tena. Pakia ukurasa upya. |
| `heroImages.error.tooManyImages` | This place takes up to {max} photos. | Sehemu hii inachukua hadi picha {max}. |
| `heroImages.error.imageRetired` | One of these photos was retired. Choose another. | Moja ya picha hizi imestaafishwa. Chagua nyingine. |
| `heroImages.error.publishFailed` | Couldn't publish. Nothing has changed in the apps. | Hatukuweza kuchapisha. Hakuna kilichobadilika kwenye app. |
| `heroImages.error.unknown` | Something went wrong ({code}). | Kuna hitilafu ({code}). |

### 37.3 Backend fields (for `fitflex-planner` / `contract-checker`)
**Slices 1–3 (mobile): nothing new.** They read only what the app already reads (`GET /gyms`, `/trainers`, the shop home, `/me`). The F-12 flags are client state.

**Slice 5 (portal) needs from slice 4** (plan §2, slice 4), please confirm the names:
- `GET /admin/hero-images` → `images[]{id, status, width, height, focalX, focalY, variants, textZoneLuminance, source, photographer, licence, licenceRef, people, consentRef, rightsConfirmedBy, rightsConfirmedAt, noFacesConfirmedBy, noFacesConfirmedAt, createdBy, createdAt, updatedAt}`, `slots[]{id, surface, variant, draft[], published[]}`, `publications[]{id, slots, publishedBy, publishedAt, note, rolledBackFrom}`.
- **Needed but not in the plan's response shape:** per slot **`maxImages`** and **`aspectHint`** (in the registry, but the listed GET response omits them; the Choose dialog and previews need them); **display names** for `createdBy` and `publishedBy` (ids alone cannot be shown in History; e.g. `publishedByName`, or a `users{id: name}` map).
- `POST /admin/hero-images` multipart (fields as listed in the plan, `rightsConfirmed=true`, `noFacesConfirmed=true`); error codes `rights_confirmation_required`, `no_faces_confirmation_required`, `image_too_small`, `unsupported_file_type`, `file_too_large` (413), `storage_service_unavailable` (503).
- `GET /admin/hero-images/:id/preview` (auth header; full original, see O-30), `PATCH /admin/hero-images/:id` `{focal{x,y}, source, photographer, licence, licenceRef, people, consentRef, status:'retired'}`, `PUT /admin/hero-slots/:slotId` `{imageIds}` (`unknown_slot`, `too_many_images`, `image_retired`), `POST /admin/hero-slots/publish` `{note}`, `POST /admin/hero-slots/rollback` `{publicationId}`.

**Slice 6 (app)** uses `GET /app/hero-images` exactly as in the plan; each entry's `sourceId` must be the scene id of §34.1 for bundled-equivalent photos, and the upload form has no `sourceId` field, so the backend should default `sourceId` to the image `id` (each upload its own scene). O-32 asks whether admins need to set it.

### 37.4 Flags
| Flag | Where | Default | Gates |
|---|---|---|---|
| `PHOTO_HERO_UI` | mobile, build time (existing) | off | §32 bands |
| `PHOTO_FOOTER_UI` | mobile, build time (new; effective only with `PHOTO_HERO_UI`) | off | §33 footer; add a `photo_footer` input to `distribute-android.yml` (manual runs only, like `photo_hero`) |
| `NEXT_PUBLIC_HERO_IMAGES_ADMIN` | portal, build time (new) | off | §36 nav item and page |
| `HERO_IMAGES_CMS` | server env (new) | off | every `/admin/hero-*` route (404 when off) and `/app/hero-images` (empty list when off) |
| `HERO_IMAGES_REMOTE` / `NEXT_PUBLIC_HERO_IMAGES_REMOTE` | mobile / portal, build time (new) | off | slice 6 / portal login reading remote photos (plan) |

---

## 38. Acceptance criteria (addendum 2) and open questions

Checked on Flutter web built from RC at 360×640, 390×844 and 430×932, and 1280×800, light and dark, English and Swahili, text scale 1.0 and 1.3, against an isolated backend with seed accounts; the portal at 375, 768 and 1280. **[device]** = needs a real phone.

**L. Section heroes (Gyms, Trainers, Shop)**
- AC-L1 With `PHOTO_HERO_UI` off, Gyms, Trainers and Shop home are unchanged; existing tests pass; the keys `gym-page-scroll`, `trainer-page-scroll`, `member-find-trainer`, `gym-search`, `trainer-search`, `gym-filter-*`, `shop-home`, `shop-home-search`, `shop-home-cart`, `shop-home-section-*`, `shop-home-browse-all`, `shop-home-checkout` exist and work.
- AC-L2 Flag on, member Gyms: a `band` hero (24px corners, inside the page padding, under the **solid** shell app bar) with the `gyms` photo, eyebrow "GYMS" / "GYM", headline "Find your gym." / "Pata gym yako.", and an `onPhoto` "Trainers" button with key `member-find-trainer` that opens `/member/trainers`; the old page header is gone; "Discover gyms" appears only once on the screen (the section strip).
- AC-L3 Flag on, member Trainers: `band` hero with the `trainers` photo, "TRAINERS" / "MA-TRAINER", "Train with a Trainer." / "Fanya mazoezi na Trainer."; no action on the band; the "Find a trainer" header is gone.
- AC-L4 Flag on, `SHOP_HOME_V2` on, member Shop: the `band` with the `shop` photo, "FITFLEX SHOP" / "DUKA LA FITFLEX", "Gear up for training." / "Jiandae kwa mazoezi.", no button, placed **after the search row and before the category row**; search and cart are visible without scrolling at 360×640.
- AC-L5 No band on: the trainer, owner and vendor-personal shops; the Shop Results view; My orders; product detail; the legacy shop (`SHOP_HOME_V2` off) and `_homeUnavailable`. (Widget test: `ShopHomeView(showHero: false)` default; only `MemberShopTab` passes true.)
- AC-L6 If the Shop home ever renders a banner carousel, the band is not in the tree (test with a fake carousel slot until Phase 3 exists); never both.
- AC-L7 No band shows a number, price, rating, count, discount, or a gym's or Trainer's name.
- AC-L8 At 390×844, 1.0×, both languages: the Gyms search field's bottom edge is ≤420px from the top of the screen, and the Trainers and Shop search fields' bottom edges are ≤380px; at 1.3× all three are visible without scrolling.
- AC-L9 Focusing a search field at 360×640 with the on-screen keyboard (simulate by reducing viewport height to 360) scrolls the field to 8px under the app bar; the band never changes height; typing does not move the band.
- AC-L10 Gyms / Trainers loading: band shown, 4 skeleton cards in the grid, never "Nothing to show yet." (F-12; also with the flag off, without the band).
- AC-L11 Gyms / Trainers load failure with nothing cached (seed: backend stopped): "We couldn't load gyms." / "We couldn't load Trainers." with Try again, which refetches.
- AC-L12 A search that matches nothing shows "No gyms match your search or filters." (or the Trainers line) and "Clear search and filters", which resets search and every filter and shows the full list.
- AC-L13 Screen reader: the band is one header node read as "Gyms. Find your gym." (no photo node); the Trainers button follows it; focus order matches §32.4 and §32.5.
- AC-L14 Desktop 1280: each band is the rounded `panel` banner, height 200, text in the left half; the shop band stays inside the ≤1200 column.
- AC-L15 The three new hero files are each ≤60 KB at 2× and ≤25 KB at 1× (the §34.2 caps), have `LICENSES.md` rows, and at 100% at 360, 430 and 1280 wide no part of a face (eyes, nose, mouth, chin) and no other gym's logo is visible; the `trainers` and `shop` rows say "no face in frame".
- AC-L16 F-11: every Gyms / Trainers filter chip is reachable by Tab, toggles with Space/Enter, announces its selected state, and has a ≥44px hit area.

**M. Footer (`FFPhotoFooter`)**
- AC-M1 With `PHOTO_FOOTER_UI` off, or `PHOTO_HERO_UI` off, no page has a footer; nothing else changes.
- AC-M2 Flag on, each page in §33.6 ends with the footer when its content is taller than the screen: photo band with 24px corners inside the page padding, the wordmark, "That's all for now." / "Hiyo ndiyo yote kwa sasa."; and on no page in §33.7.
- AC-M3 Gym detail and trainer detail have the footer and **no** stock photo at the top (the partner's own gallery stays first).
- AC-M4 Every footer page's footer photo has a different `sourceId` from that page's top photo (one widget test looping over every `pageKey` and every top photo the page can show, including Home's two and Activity's four); the stand-in mapping equals the §33.6 table.
- AC-M5 Short page: with content shorter than the viewport (e.g. Profile at 430×932 with a small seed, or Trainers with one result), no footer; growing the content past the screen shows it; the footer never appears and disappears while an image above it loads (hysteresis).
- AC-M6 No footer while a list is loading, empty, in error, in the no-match state, or while the shop is "getting ready"; no footer on Upgrade while the manual-payment fields or the pending-payment card are on screen.
- AC-M7 The footer ends above the bottom navigation, the shop cart bar and the trainer detail action bar with 24px to spare; on vendor Products with the FAB showing, the footer's text and band are fully visible above the FAB (88px extra).
- AC-M8 At text scale 1.3 in Swahili at 360 wide, the footer text is not clipped and the band is ≤200 tall unless more is needed to avoid clipping.
- AC-M9 "Back to top" appears only on Gyms, Trainers and Shop; it is ≥44px, labelled "Back to top" / "Rudi juu", scrolls to the top (instantly with reduced motion), and moves focus to the band heading, after which Tab goes to the band's button (Gyms) or the search field (Trainers, Shop).
- AC-M10 Screen reader: the footer exposes exactly one text node ("That's all for now.") and, where present, one button; the photo and the wordmark are not announced ("FitFlex" is not read in the footer).
- AC-M11 High contrast on **[device]** (and the `MediaQuery.highContrast` override in a widget test): navy ground, no photo, same text and button.
- AC-M12 Contrast with the footer photo replaced by a pure-white image: line ≥4.5:1, wordmark and gold "Af" ≥3:1, button border ≥3:1, in both themes.
- AC-M13 The footer photo is not decoded until the footer is within one screen of the viewport (lazy sliver); it fades in over 250ms (instant with reduced motion); no parallax.
- AC-M14 The four footer files are each ≤40 KB at 2× and ≤12 KB at 1×, have `LICENSES.md` rows, and show no face; all hero assets together are ≤1.6 MB (the PR reports the measured total).
- AC-M15 Existing scroll keys (`activity-scroll`, `profile-scroll`, `passes-scroll`, `gym-detail-scroll`, `gym-page-scroll`, `trainer-page-scroll`) still find the scroll view after the switch to `CustomScrollView`.
- AC-M16 `distribute-android.yml` has a `photo_footer` input that is used only on manual runs; pushes to main build with it off.

**N. Admin "App photos" (portal)**
- AC-N1 With `NEXT_PUBLIC_HERO_IMAGES_ADMIN` off, no "App photos" nav item and `/admin/hero-images` shows the portal's not-found or no-access page.
- AC-N2 Flag on: the nav item shows only for super-admins and staff with `brand_media`; staff without it never see it and a direct visit shows no-access.
- AC-N3 With `HERO_IMAGES_CMS` off (API 404), the page shows "App photos are switched off" and no actions.
- AC-N4 Places lists every slot in §36.2 under its area, in order; an empty slot says "Using the built-in photo"; a slot whose draft differs shows "Changed"; a slot id the portal doesn't know appears under "Other".
- AC-N5 Upload is disabled until a valid file, Source, Photographer, Licence and People are set **and both confirmation boxes are ticked**; ticking "Taken in a partner gym?" makes the consent reference required.
- AC-N6 A 900px-wide file, a GIF, and a 16 MB file are rejected in the browser with the §36.7 messages before any request; the same server error codes (mocked) show the same messages.
- AC-N7 The upload sends the original file (no browser downscale or re-encode: request body size equals the file size within multipart overhead).
- AC-N8 Focal point by keyboard: Tab to the picker, Arrow moves 5%, Shift+Arrow 1%, Home centres; the two range inputs and the live region report the same values; the three previews' `object-position` follows.
- AC-N9 The three previews use the real scrim tokens (`--hero-scrim-*`): with a pure-white test image the sample text measures ≥4.5:1 (subline) / ≥3:1 (headline) in every preview, at 1.0× and 1.3×.
- AC-N10 An image with `textZoneLuminance > 0.20` shows the brightness warning and a "Bright" badge, and can still be published.
- AC-N11 Saving a slot changes only the draft; the published thumbnails and `GET /app/hero-images` (mocked) are unchanged until Publish.
- AC-N12 Publish is disabled with no changes; with changes, the dialog lists exactly the changed slots with before and after (including "Built-in photo"), accepts an optional note ≤200 characters, and on success History shows the new version as Current.
- AC-N13 History shows the last 20 versions with date, publisher name, note and change count; "Put back this version" on an older row opens a confirm with the before/after list and, on confirm, creates a new Current version marked "Put back from #id".
- AC-N14 Retire is disabled while any draft slot uses the image, with the hint shown.
- AC-N15 Every error code in §36.7 maps to its English and Swahili text; an unknown code shows "Something went wrong ({code})."
- AC-N16 Keyboard only: every control is reachable in the §36.8 order; dialogs trap focus, Escape closes them (not while publishing), and focus returns to the opener; one `<h1>`; all controls ≥44px.
- AC-N17 The Swahili toggle switches every string on the page, dialogs included; no hardcoded English (i18n auditor).
- AC-N18 Library and Places thumbnails load through authenticated blob requests (no unauthenticated image URL in the DOM for draft images).

### 38.1 Open questions (addendum 2)
| # | Question | Default if no answer |
|---|---|---|
| O-30 | `GET /admin/hero-images/:id/preview` streams the full original (up to 15 MB) and the Library may show 30+ thumbnails. Add a small server-side preview size (e.g. `?w=480`)? | Ask backend-builder to add it in slice 4; until then the portal loads thumbnails lazily, one at a time. |
| O-31 | Accept HEIC uploads in the portal (needs a server image library build with HEIC support)? | No; JPEG, PNG, WebP only, with the "convert first" hint. The design-agent converts the owner's HEIC files for slice 3. |
| O-32 | Should admins set a "same scene as …" link when uploading several photos from one shoot, so the footer rule can tell them apart? | No field; each upload is its own scene (`sourceId = id`). The footer rule still never repeats the exact top photo. |
| O-33 | Gyms band showing one recognisable partner gym: allowed (it could read as promotion)? | Not allowed by default (§35.1); the owner can decide per photo. |

Known gaps still in view: legal texts remain drafts pending Tanzanian counsel; vendor settlement exists but has not been tried by hand; `PHOTO_HERO_UI`, `PHOTO_FOOTER_UI` and every photo-manager flag stay off; all Swahili here awaits native review; real-phone rendering, high contrast and camera scanning are **[device]** checks; the stand-in photos are not Tanzanian.
