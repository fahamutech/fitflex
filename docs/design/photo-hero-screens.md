# Photo hero screens: pre-sign-in, member Home, portal login. Design spec

**Status:** Draft for owner review · **Date:** 2026-10-19 · **Author:** design-agent
**Request:** owner, chat 2026-10-18/19: *"I like this kind of UI where real pictures lie on the background instead of plain white/navy backgrounds"* (the investor/partner deck hero), and *"the home needs this taste too since it's where the user lands after registration. We need a strong impression when it comes to design."*
**Repos affected:** `fitflexmobile` (Flutter, mobile + Flutter web) and `fitflex-portal` (Next.js static export). **No backend change is required** (§14).
**Ships:** dormant behind `PHOTO_HERO_UI` (mobile) and `NEXT_PUBLIC_PHOTO_HERO_UI` (portal), both default **off** (§13). With the flags off, today's screens render unchanged.
**Not in scope:** app code; member onboarding (`/member/onboarding`); the pending-approval screen; owner/trainer/vendor homes; the Shop home (separate spec, §3.3).

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
- **Footer:** mono `DAR ES SALAAM · TANZANIA` at the hero bottom (panel variant and Language only).
- **Motion:** hero photo fades in over 250ms from `heroPlaceholder`; the existing content fade + 5% rise stays. Under `MediaQuery.disableAnimationsOf`, both are instant.
- **Back behaviour:** unchanged from today (Sign in back → Language; Role back → pop or Sign in; Sign up back → pop or Sign in). Android system back follows the same.
- **Deep links:** none new. Routes unchanged.

### 6.1 Language (`/language`)
**Purpose:** first screen; pick English or Kiswahili and feel the brand.
**Layout (phone):** `full` hero, 52–60% of the viewport (min 320). Eyebrow `FITFLEX AFRICA`; headline shows **both languages**, because no language is chosen yet: English tagline at display size ("Fitness without **limits.**"), then the Swahili tagline below it at 22/28 w800 in `heroTextBody` ("Pamoja tuna **nguvu.**", accent in the same accent colour). Footer line. Below the hero: a bilingual prompt "Choose your language · Chagua lugha yako" (titleMedium), two tiles, Continue.
**Tiles:** titles in their own language: **English** and **Kiswahili** (today's "Swahili" title and "International Standard" subtitle go away; F-1). Each tile is a radio: `Semantics(inMutuallyExclusiveGroup: true, checked: selected, button: true, label: 'English' / 'Kiswahili')`, keyboard focusable, Space/Enter selects (F-3). Min height 64.
**Continue:** disabled until a tile is chosen. Its label shows in the **selected** language ("Continue" / "Endelea"); before a choice it reads "Continue · Endelea".
**States:** default (nothing selected), selected, no-photo fallback (high contrast / decode failure: `heroPlaceholder` ground, same text). No network on this screen, so no loading, offline or error states.
**After completion:** sets the locale, goes to Sign in (unchanged).
**Focus order:** theme toggle → hero text node ("FitFlex Africa. Fitness without limits. Pamoja tuna nguvu.") → prompt → English → Kiswahili → Continue.

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
People-free photos already licensed and recorded in `social/brand/photos/README.md` (Pexels licence, checked 2026-10-16): `pexels-9545909` / `pexels-9545914` (gym equipment, TUBARONES PHOTOGRAPHY), `pexels-12250460` (treadmills), `pexels-29526371` (equipped gym), `pexels-4716814` (equipment), `pexels-3916766` / `pexels-5312212` (dumbbells). They are **not** Tanzanian, so they are a stop-gap; the owner decides whether to ship the flag with them (O-1). Photos with people from that folder are **not** used in the apps.

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

For the headline split, the tagline needs lead/accent keys in sentence case (`hero.tagline.lead` / `hero.tagline.accent`): EN "Fitness without" / "**limits.**"; SW "Pamoja tuna" / "**nguvu.**"

### 11.2 New keys

| Key | English | Swahili (native review) | EN / SW chars |
|---|---|---|---|
| `hero.eyebrow.brand` | FITFLEX AFRICA | FITFLEX AFRICA | 14 / 14 |
| `hero.footer.place` | DAR ES SALAAM · TANZANIA | DAR ES SALAAM · TANZANIA | 24 / 24 |
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
| Portal `login.hero.footer` | DAR ES SALAAM · TANZANIA | DAR ES SALAAM · TANZANIA | 24 / 24 |

Notes: "Many gyms" / "Gym nyingi" describes the product (a pass opens gyms across the network, as `pass.state.none` already says) and makes no count claim. "Mshirika" (partner) and "taarifa za malipo" (statements) need native confirmation.

---

## 12. Screen C: portal login (`/login`)

**Purpose:** operators, admins and company HR sign in. A calm, confident first view of the portal.

**Layout:**
- **Desktop (≥1024):** the Shell's 64px white login header stays (logo, "FitFlex Af", language toggle) so the language control does not move. Below it, two columns at full remaining height:
  - Left 55%: `PhotoPanel` with P1, horizontal scrim (§5.2), content bottom-left with 64px padding: eyebrow, headline 48/52 Inter 900 (lead `#F1F5F9`, accent `--color-brand-500`), subline 16/24 `#CBD5E1`, mono footer. **No logo on the panel** (the header has it), so the "logo on busy photo" rule is not engaged.
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
- AC-A1 Language shows the English tagline and the Swahili tagline at once; the tiles read "English" and "Kiswahili"; no hardcoded English remains in `language_screen.dart` (F-1).
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
| O-4 | **Swahili tagline.** Keep "Pamoja tuna nguvu" (as on the splash) for the photo heroes, or use a literal line such as "Siha bila kikomo" (draft, native review)? | Keep "Pamoja tuna nguvu". |
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
