# Shop home redesign (fitflexmobile) — design spec

**Status:** Draft for owner review · **Date:** 2026-10-18 · **Author:** design-agent
**Request:** owner, 2026-10-18 — redesign the member-facing Shop home after a reference e-commerce layout, personalised by role and attributes.
**Repo affected:** `fitflexmobile` (Flutter, mobile + web). Backend fields are listed in §13 for `fitflex-planner` / `contract-checker` to confirm; nothing here is a confirmed contract.
**Ships:** dormant behind flags (§14). With the flags off, today's shop renders unchanged.
**Not in scope:** app code, the portal, vendor-side screens, checkout sheet internals, the My orders list.

Design system sources used: `canon/04-marketing/design-system.md` (V2 accents, 2026-10-18), `fitflexmobile/lib/shared/design_tokens.dart`, `lib/shared/components/*`, memory notes `design-system-redesign` and `design-system-v2-accents`.

---

## 1. What exists today (read from `release-candidate`)

| Area | Today | Source |
|---|---|---|
| Shop body | One shared widget `ShopBrowseBody` serves **member** (`/member/shop`), **gym owner** (`/owner/shop`, a bottom tab since mobile#106) and **trainer** (tab index 2 inside `TrainerHomePage`, no route). | `lib/shared/widgets/shop_browse_page.dart`, `lib/router.dart`, `lib/screens/trainer/trainer_home_page.dart` |
| Vendor | Vendors have **no buying shop**. Their app is for selling. | `lib/screens/vendor/*` |
| Layout | Segmented "Browse / My orders", search, category `FilterChip`s, sort dropdown, filter sheet, Delivery/Promotions chips, a Featured strip (`FFFeaturedStrip`, fixed 210px tall), then a vertical list of `_ProductTile`. | same file |
| Categories | 8 server categories from `GET /shop/categories` (compiled fallback in `lib/shared/product_categories.dart`): `supplements_nutrition`, `sportswear_footwear`, `equipment`, `accessories_gear`, `food_drinks`, `health_recovery`, `events`, `other`. | `fitflex-functions/src/shared/product-categories.mjs` |
| Ranking | `GET /discover/products` returns `featured[]` + ranked `items[]` with a `promotion` tag (featured / promoted / sponsored / recommended / campaign) and placement. Organic score = match, location, quality, popularity. No per-user personalisation. | `src/services/discovery-service.mjs`, `src/shared/discovery-scoring.mjs` |
| Sale price | `discountPriceTzs` is the only sale field. **No sale start/end time exists.** | `shop-service.mjs` |
| Banners | **No banner/hero entity exists.** | — |
| Personalisation | **None.** No preference field and no opt-out. Member `gender` exists in `memberProfile` (used for messaging audiences in `src/shared/audience.mjs`). | — |
| Price format | `formatCurrency` prints `TZS 279,000`. | `lib/shared/formatters.dart` |

### Problems found that this redesign depends on (for planner)
- **P-1 (fabricated ratings risk, backend).** `shopService.upsertProduct` on **create** stores `rating`, `reviewCount` and `soldCount` from the request body (`rating: Number(input.rating || 0)` …). A vendor can seed a rating or a sold count. The update path ignores them, and `reviewProduct` recomputes them correctly from real reviews. The owner's rule "show a rating only when real reviews exist" cannot be honoured until create ignores these three fields (and existing rows are recomputed from `ProductReview` / delivered orders). **Blocker for showing ratings and "Best sellers".** Route to `security-and-privacy-reviewer` + `backend-builder`.
- **P-2 (UI).** `_ProductTile` shows `★ 0.0` for products with no reviews. That is a misleading rating today, before this redesign.
- **P-3 (UI).** On any `ApiException` (including offline), `_load()` leaves an empty list, so the shop says "No products available yet." while offline. That is the wrong state.
- **P-4 (data).** `distanceKm` on a product is typed in by the vendor, not computed from the buyer. No "Near you" claim may rely on it.
- **P-5 (UI).** `FFFeaturedStrip` has a fixed height, so cards clip at large text scale.
- **P-6 (copy).** The owner wants `TSh 279,000`; the app prints `TZS 279,000` everywhere. See D-8.

---

## 2. Design decisions (proposed; owner may overrule)

| # | Decision | Why |
|---|---|---|
| DD-1 | The **Shop home** is a new browse landing inside the existing "Browse" segment. As soon as the user searches, picks a category, taps "View all" or opens filters, the existing **Results view** (today's list, filters and sort) takes over, with a "Back to shop" chip. | Reuses the working search/filter/sort/cart code. The home page only adds discovery. |
| DD-2 | Keep the "Browse / My orders" segmented control at the top. | Users and tests rely on it (`shop-checkout`, `order-*` keys). Not part of the request. |
| DD-3 | **Flash sale uses Fuel `#B8452C`**, not generic red, for the discount badge, the sale price and the countdown chips. Error red stays for errors only. | Canon V2: Fuel is the "act soon" nudge and is explicitly *not* an error colour. Red would read as a failure. |
| DD-4 | **Product images sit on a white `#FFFFFF` well in both themes.** In dark theme the well gets a 1px `slate-700` edge and 12px radius. | Owner request. Vendor photos are usually shot on white. This is not "brand colour on white", so canon allows it. |
| DD-5 | Hero accent word: **Volt `#C8F04A` in dark theme; brand-on-dark green `FFTokens.fgBrand` in light theme.** Both sit on the photo scrim (§5), never on a light ground. | Volt is the dark theme's only primary and must not appear on a light-theme screen next to green CTAs (canon: no Volt + green as two primaries). |
| DD-6 | **No auto-advance** on the hero carousel. Swipe, dots and (on wide screens) arrows only. | WCAG 2.2.2: moving content needs a pause control. No auto-advance keeps it simple and predictable for screen-reader and low-data users. |
| DD-7 | **A rail needs at least 3 products to show.** Below that it is hidden; no empty rails. A product appears in **at most one rail** on the home, in this priority: Flash sale > Featured > Best sellers > Recommended. | Avoids a half-empty page in a small catalogue and avoids repeating the same items. |
| DD-8 | **Ratings show only when `reviewCount ≥ 1` and the backend confirms the rating comes from real reviews (P-1 fixed).** With no reviews, nothing is shown: no stars, no "0.0", no "No reviews". | Owner rule: no fabricated ratings. |
| DD-9 | **"Recommended for you" is organic.** Paid placements (sponsored / promoted) do not enter it. Featured/sponsored items live in the Featured rail with their disclosure badge (`FFPromotionBadge`), as today. | Keeps "for you" honest and separate from "Recommended by FitFlex" (the editorial promotion label `promo.recommended`). |
| DD-10 | Role is **context**, not personal data. With personalisation off, the shop still adapts to the role the user is shopping as, but uses no purchase history, gender or location. | The user chose the role by opening that app area. The Why sheet says this plainly. |
| DD-11 | **Sensitive attributes:** gender only if the user set it in their profile **and** personalisation is on; it may reorder products, never hide them, and it never appears in a section title ("For women" etc.). Health, activity, step, training-plan, age, B2B sponsor and KYC data are **not used**. | Data minimisation. Owner decision D-3 confirms gender use at all. |
| DD-12 | The vendor role gets **no shop home** in this slice (there is no entry point). When a vendor shops as a member, trainer or owner, their **own products are excluded** from the home rails and show a "Your product" badge in results. | No vendor buying flow exists. D-6 asks the owner whether one is wanted. |

---

## 3. Component reuse map

| Need | Use | Change needed |
|---|---|---|
| Section header + horizontal rail | `FFFeaturedStrip` | **Extend**, not replace: optional leading `icon`, optional `trailing` widget (countdown, "View all", Why button), optional desktop prev/next arrows, and height computed from content at the current text scale (fixes P-5). Existing callers keep working. |
| Product card (vertical) | `_FeaturedProductCard` (private, in `shop_browse_page.dart`) | **Evolve** into the card in §7. It already wraps `PromotionTracked` and `trackPromotionClick`, which must be kept. It stays private to the shop file unless another screen needs it. |
| Product list (Results view) | `_ProductTile` | Keep. Apply DD-8 (hide the rating with no reviews), the price block from §7.3 and the stock badges from §7.4. |
| Loading | `FFSkeleton`, `FFSkeletonLine` | None. The layout is in §9.1. |
| Empty | `FFEmptyState` | None. |
| Error / offline | `FFErrorState` | None (pass `icon: Icons.wifi_off` for offline). |
| Offline banner | member shell `_OfflineBanner` (`offline.banner`) | None. Owner/trainer shells have none; see §9.4. |
| Badges | `FFBadge`, `FFPromotionBadge` | `FFBadge` needs a **Fuel tone** for the discount badge. `FFToneTheme` has no fuel family today. Add `fuel` to `FFToneTheme` rather than hard-coding colours in the card. |
| Buttons | `FFButton` (primary/secondary/ghost; sm/md/lg) | The hero "Shop now" pill uses `FFButton` primary with `trailingIcon: Icons.arrow_forward`. If `FFButton` cannot take a pill radius, add a `shape`/`pill` option to it; do not add a new button. |
| Sheets | `FFSheet` | Used for "Why am I seeing this?" and the settings sheet. |
| Settings row | `FFActionTile` | One row on the member Privacy page (§8.4). |
| Snackbars | `FFSnack` | "Added to cart" with a "View cart" action. |
| Images | `FFRemoteImage` | None (fallback icon on white). |

**New components (nothing existing fits):**
1. **`FFHeroCarousel`** — a swipeable banner pager with dots, optional arrows and a scrimmed photo. No pager component exists. Shared, because owner/member Home may want it later.
2. **`FFCategoryTile`** — a round icon tile with a 2-line label below. `FFActionTile` is a full-width list row, and `FFPill` is a text chip; neither is a round icon tile.
3. **`FFCountdown`** — HH:MM:SS chips with an accessible minute-level label (§11.3). Nothing like it exists.

---

## 4. Colour, type and contrast

All ratios computed with the WCAG 2.x formula (script run 2026-10-18).

| Element | Light theme | Dark theme | Ratio |
|---|---|---|---|
| Discount badge "−29%" | white on Fuel `#B8452C` | same | 5.35:1 |
| Sale price | Fuel `#B8452C` on white card | `fuelOnDark #FF8A6B` on slate-900 card | 5.35 / 7.74:1 |
| Countdown chip | white on Fuel, JetBrains Mono 13 w600 | same | 5.35:1 |
| Old (struck) price | slate-500 `#64748B` on white | slate-400 `#94A3B8` on slate-900 | 4.76 / 6.96:1 |
| Regular price | text-strong (`onSurface`) | text-strong | ≥17:1 |
| Rating star (decorative; the number carries the meaning) | accent-700 `#854A0E` | gold `#EAAA08` | 7.04 / 8.72:1 |
| Hero headline (white) on scrim ≥80% | white | white | ≥11.6:1 (worst case: white photo under scrim) |
| Hero accent word | `fgBrand #17B26A` on scrim ≥80% (**large text only**: ≥24px, w800+) | Volt on scrim | 4.22:1 (passes 3:1 large) / 8.88:1 |
| Hero subline | slate-300 `#CBD5E1` | slate-300 | 7.84:1 |
| Hero "Shop now" pill | `FFButton` primary: white on brand green | onVolt on Volt | 5.69 / 15.39:1 |
| Inactive carousel dot | white 50% on scrim | same | 4.24:1 (non-text ≥3:1) |
| Category tile icon | slate-700 on slate-100 circle | slate-200 on slate-800 circle | 9.45 / 11.87:1 |
| "Out of stock" badge | white on slate-700 | same | 10.35:1 |
| Image well edge (dark) | — | slate-700 on slate-900 (decorative; the white well itself is 17.85:1 against the card) | — |

Rules:
- **Volt never appears on a white or light surface**, including the white image well, the price, the cart button in light theme and the countdown. A design-qa check (AC-31) covers this.
- The tile circle against the page (1.03–1.10:1) is decorative; the icon and label identify the control, so WCAG 1.4.11 is met by the icon (≥3:1).
- Type: Inter for everything except the countdown digits, which use JetBrains Mono (canon "telemetry"), with tabular figures so digits do not shift.
- Hero headline: Inter 900, 28/30 on phone, 40/43 at ≥1024px, tracking −0.03em. Section titles: `titleMedium` w700. Card name: 14/20 w600, 2 lines max with ellipsis.

---

## 5. Information architecture

### 5.1 Shop home order (top to bottom)
1. Segmented "Shop / My orders" (existing).
2. Search field (existing `shop-search`). Typing opens the Results view.
3. **Hero carousel** (1–5 slides).
4. **Shop by category** — round tiles.
5. **Flash sale** — only while a sale is live.
6. **Featured** — title depends on role (§5.2).
7. **Best sellers**.
8. **Recommended for you** (personalised) or **Popular with …** (cold start / opted out).
9. "Browse all products" ghost button → Results view, no filter.
10. Sticky **cart bar** above the bottom nav while the cart has items (replaces the in-list checkout button on the home; the Results view keeps today's button).

### 5.2 How sections adapt by role

The server decides content (§13); the client renders what it gets. This table is the intended behaviour for the planner and for UAT fixtures.

| Section | Member | Trainer | Gym owner |
|---|---|---|---|
| Hero slides | slides whose audience includes `member` | `trainer` | `owner` |
| Category order | Sportswear & footwear, Supplements & nutrition, Health & recovery, Food & drinks, Events, Accessories, Equipment, Other | Accessories & gear, Equipment, Sportswear, Supplements, Health & recovery, Events, Food & drinks, Other | Equipment, Accessories & gear, Health & recovery, Supplements, Food & drinks, Sportswear, Events, Other |
| Rail 6 title | **Featured gear** | **Featured coaching gear** | **Featured equipment** |
| Rail 6 focus | apparel, footwear, supplements, recovery | bands, timers, cones, small equipment (accessories_gear + equipment) | commercial/bulk equipment (equipment; `audience` incl. owner, D-5) |
| Best sellers | most bought by everyone (30 days), role-focus categories ranked first | same | same |
| Personalised rail (on, with history) | Recommended for you | Recommended for you | Recommended for you |
| Cold start / no history | Popular with members | Popular with trainers | Popular with gym owners |
| Personalisation off | Popular in the shop | Popular in the shop | Popular in the shop |
| Pending approval (trainer unverified, owner with gym pending) | — | role defaults; no gym- or client-specific signal | role defaults; no gym-specific signal |

Categories with **zero listable products for this user are hidden**; "Other" is always last. Category labels come from the server (`en`/`sw`), with short tile labels on the client (§10.2).

### 5.3 Owner's suggested categories vs the real list

| Owner's reference tile | Real category key | Note |
|---|---|---|
| Gym equipment | `equipment` | match |
| Fitness apparel | `sportswear_footwear` | match (label "Apparel & shoes") |
| Supplements | `supplements_nutrition` | match |
| Accessories | `accessories_gear` | match |
| Recovery | `health_recovery` | match |
| Yoga & wellness | — | **no category.** Closest is `health_recovery`. See D-4. |
| Sports gear | — | **no category;** overlaps `accessories_gear` / `equipment`. See D-4. |
| — | `food_drinks`, `events`, `other` | real categories the reference lacks; shown. |

The design shows the **8 real categories** and invents none. Adding categories is a backend + vendor-form change (D-4).

---

## 6. Screen: Shop home

**Purpose:** let a buyer find something worth buying in one or two taps, see time-limited deals honestly, and understand why products are suggested.

### 6.1 Phone (~375px)
- Page horizontal padding 16 (rails scroll edge to edge with a 16 inset so the third card peeks).
- **Hero:** width 343, aspect 16:10 (≈214 tall), min height 200, grows with text (never clips), radius 24 (`radiusXl`). Content padding 20, left-aligned, bottom-anchored:
  - headline (3 lines typical, up to 4 in Swahili), last word or phrase in the accent colour (DD-5);
  - subline 14/20, max 2 lines;
  - "Shop now →" pill (`FFButton` primary, size md, min height 48);
  - dots row bottom-right, hidden when there is 1 slide. Active dot = 20×8 pill, white (light theme) or Volt (dark theme); inactive = 8×8, white 50%.
  - Scrim: a left-to-right gradient `rgba(2,6,23,.80)` → `rgba(2,6,23,.35)`. The text block always sits in the ≥80% zone.
- **Categories:** title row "Shop by category". Horizontal scroll of `FFCategoryTile`: circle 64, icon 28, column width 76, gap 8, label 12/16, 2 lines max centred. About 4.5 tiles are visible, which hints that the row scrolls.
- **Rails:** header row = icon (20) + title + trailing slot, min height 48. Card width 156, gap 12. Rail height = tallest card at the current text scale.
- **Cart bar:** full-width `FFButton` primary, `"{count} items · {total}"`, trailing arrow, pinned above the bottom nav with 8px margin, safe-area aware.

### 6.2 Flutter web desktop (≥1024px; tablet 600–1023 in brackets)
- Content max width 1200, centred.
- Hero: aspect 3:1 (2:1), max height 360, headline 40/43, **prev/next arrow buttons** inside the hero edges (48px, white 90% circle, slate-900 icon), always visible on web and wide screens.
- Categories: all 8 tiles in one non-scrolling row, spaced evenly (on tablet they scroll).
- Rails: card width 200 (180). Header trailing slot adds prev/next "Show more" arrow buttons (48px) when the rail overflows. Mouse-wheel horizontal scroll and drag both work.
- Cart bar becomes a right-aligned 360px floating bar at the bottom of the content column.

### 6.3 Hero slide content
Each slide: photo, `headlineLead`, `headlineAccent`, `subline`, CTA label, CTA target, audience roles, schedule, and optional promotion disclosure (§13 B-1). Rules:
- **Photos:** product or place photography. **No stock-photo people may be presented as FitFlex members, trainers or partners**: no captions, names or quotes on people who are not real, consenting FitFlex users. A model in a product shot is allowed only without any member/partner framing. Banner approval (admin) is where this is checked (AC-40).
- If a slide is a paid placement it shows the `FFPromotionBadge` ("Sponsored") top-left.
- **Fallback slide** when there are no banners or they fail to load: no photo, navy `#0B192C` ground with a soft brand glow, text from §10 (`shop.home.fallback*`), CTA "Browse all products" → Results view. The fallback must never show prices or discounts.
- Headline limits for the banner editor (backend/portal validation): lead + accent ≤ 32 characters English and ≤ 42 Swahili; subline ≤ 70 / ≤ 90.

---

## 7. Product card

### 7.1 Anatomy (phone, 156 wide)
1. **Image well** 156×156, white, radius 12, `BoxFit.contain` with 8 padding. Fallback: `Icons.shopping_bag_outlined` slate-400 on white.
2. **Discount badge** top-left on the well, 8 inset: Fuel `FFBadge` "−29%". Shown only when a sale is active (§7.3).
3. **Stock badge** top-left (replaces the discount badge when out of stock): "Out of stock" (white on slate-700). The image is dimmed with a 40% white veil in light theme and a 40% slate-950 veil in dark theme; the badge is not dimmed.
4. **Round cart button** bottom-right on the well, 8 inset: visual 40, **hit area 48**. Light theme: brand green fill, white `Icons.add_shopping_cart` (white on green 5.69:1; green vs white well 5.69:1). Dark theme: **slate-900 fill with a Volt icon** (Volt on slate-900 is allowed; slate-900 vs the white well is 17.85:1). A Volt *fill* is not used here because the button sits on the white well, and Volt on white is forbidden. When qty ≥ 1 it shows the quantity as a number (same colours) instead of the icon.
5. Promotion disclosure (`FFPromotionBadge`) if the product is promoted, under the image.
6. Name, 2 lines.
7. Rating row (DD-8): `★ 4.6 (23)`; star 14, numbers 12. Hidden without real reviews.
8. Price block (§7.3).
9. Low-stock line, when it applies: "Only 3 left" in Fuel, 12 w600.

The whole card opens product details (existing `_openProduct` sheet). The cart button is a separate control and does not open details.

### 7.2 Card variants

| Variant | Visual | Cart button | Screen-reader label (EN) |
|---|---|---|---|
| Regular | price only | enabled | "Whey Protein 1kg. Price TSh 85,000. Rated 4.6 out of 5 from 23 reviews." |
| On sale | Fuel badge, sale price + struck old price | enabled | "Whey Protein 1kg. Sale price TSh 69,000, was TSh 85,000, 18 percent off." |
| No reviews | no rating row | enabled | label omits rating |
| Low stock (1–5) | "Only 3 left" | enabled | "…Only 3 left." |
| Out of stock | dimmed image + "Out of stock" badge, no discount badge | **hidden** (not just disabled) | "…Out of stock." |
| Has options | same as regular | opens the existing "Choose option" dialog | "Add Running shoes to cart, choose a size" |
| In cart (qty n) | button shows n | adds one more | "Whey Protein 1kg, 2 in cart. Add one more." |
| Promoted | `FFPromotionBadge` | enabled | badge text read first: "Sponsored. Whey…" |
| Sale ended (live) | discount badge becomes neutral "Sale ended"; struck price removed; sale price shown in text-strong; cart button disabled until refreshed | disabled | "…Sale ended. Updating price." |
| Own product (vendor shopping) | "Your product" neutral badge (Results view only; excluded from home rails) | hidden | "Your product." |

### 7.3 Price block
- Sale is active only when `discountPriceTzs > 0`, `discountPriceTzs < priceTzs`, and (once B-3 exists) `now` is inside the sale window by server time.
- Discount % = `floor((price − sale) / price × 100)`. Floor so the claim is never overstated. Show the badge only when ≥ 1%.
- Layout: sale price 16 w800 Fuel on line 1; old price 12 slate-500/400 with strikethrough on line 2. Never side by side on phone (no room at Swahili/large text).
- Format: `TSh 279,000` (D-8). Same in Swahili.
- Strikethrough is never the only signal: the old price is smaller, muted and second, and the semantics say "was" (§11.2).

### 7.4 Rules for which products appear on the home
- Out-of-stock products are **excluded from all home rails** (server) but still appear in search and category results with the out-of-stock variant.
- Pending/rejected/hidden products and blocked vendors are excluded (existing `listProducts` rules).
- Max 12 cards per rail; "View all" appears when the server reports more.

---

## 8. Personalisation transparency and control

### 8.1 "Why am I seeing this?"
- An info icon button (`Icons.info_outline`, 48 hit area) in the header of **Featured**, **Best sellers** and the **Recommended/Popular** rail. Label: "Why am I seeing these suggestions?"
- In the **product details sheet** of an item opened from the personalised rail, one line under the price: the item's reason, e.g. "Suggested because you bought running shoes", with a "Why?" text button opening the same sheet.
- Tapping opens an `FFSheet` titled "Why am I seeing this?" with:
  1. the reasons that apply to this rail, as a bulleted list built from server reason codes (§10.6). **The client never shows free text from the server here.**
  2. the role line, e.g. "You're shopping as a gym owner."
  3. for Featured: the promotion disclosure paragraph (paid placements are labelled Sponsored);
  4. a `Switch` "Personalised suggestions" with the hint "Use my purchases and profile to suggest products";
  5. on member accounts, a link "Shop suggestion settings" → member Privacy page.

### 8.2 Switch behaviour
- Changing the switch saves straight away (B-5). While saving, the switch is disabled with a small spinner. On success: snackbar "Suggestions updated", sheet stays open, and the home reloads behind it. On failure: the switch reverts and shows "Couldn't save. Try again."
- Off → the personalised rail becomes "Popular in the shop", and reasons that use personal data disappear. The sheet shows "Personalised suggestions are off. You see the same suggestions as everyone shopping as a {role}."
- The setting is **per account, across roles** (D-2).

### 8.3 What the reasons may say (closed list)
`role_context`, `popular_with_role`, `bought_category {category}`, `bought_product {productName}`, `profile_gender` (only per DD-11), `delivers_to_area`, `featured_disclosure`, `flash_sale_seller_discount`, `best_sellers_30d`. Anything else falls back to the generic "Suggested from what's popular on FitFlex." "Near you" is **not** allowed until the distance is computed from the buyer (P-4).

### 8.4 Settings entry points
- **Member:** a new `FFActionTile` on `/member/privacy` (between Message preferences and Activity sharing): icon `Icons.storefront_outlined`, title "Shop suggestions", subtitle "Personalised" / "Off". It opens the same switch in an `FFSheet`.
- **Trainer, gym owner:** no privacy page exists, so the switch is reachable only from the Why sheet in the shop. Noted as a gap (D-7).
- The privacy text describing this processing is a **draft pending Tanzanian counsel**, like the other legal text.

### 8.5 Cold start
- Signed in with no purchase history: "Popular with {role}", header icon `Icons.trending_up`, Why = `popular_with_role` + `role_context`.
- Tiny catalogue (fewer than 3 listable products in total): no rails; show the categories and a 2-column grid of all products under "All products".
- Fewer than 3 items for a rail: hide that rail (DD-7). If **every** rail is hidden but products exist, show the "All products" grid.

---

## 9. States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| **Loading (first)** | home request in flight, nothing cached | Skeleton: hero block 343×214 r24; 5 skeleton circles 64 with 40px label lines; 2 rails × 3 card skeletons (156×156 + 2 lines). One semantics node: "Loading the shop". No spinner. | none |
| **Refreshing** | pull-to-refresh with content shown | content stays; `RefreshIndicator` | — |
| **Success** | data loaded | §5–7 | all |
| **Partial** | home sections fail but `/shop/products` works, or one section fails | Fallback hero + categories + "All products" grid; a failed single rail is just hidden; one failed image shows the fallback icon on white | all |
| **Error** | non-network failure, nothing cached | `FFErrorState`: "The shop didn't load" / "Check your connection and try again." + "Try again" | retry |
| **Offline, nothing cached** | network error | `FFErrorState` with `Icons.wifi_off`: "You're offline" / "Connect to the internet to browse the shop." + "Try again". **Never** "No products available yet." (P-3). | retry |
| **Offline, cached** | network error after a successful load this session | Content stays; member shell banner (`offline.banner`) or, for owner/trainer, an inline `FFAlert` info bar with the same text. Cart buttons still work locally; the cart bar shows "Checkout needs a connection" and is disabled. Countdown keeps ticking from the last server offset. | retry |
| **No products (catalogue empty)** | 0 listable products | `FFEmptyState` `Icons.storefront_outlined`: "The shop is getting ready" / "Sellers are adding products. Check back soon." No hero, no rails. | none |
| **Category empty** | deep link or stale tile to a category with 0 items | Results view `FFEmptyState`: "Nothing in {category} yet" + "Back to shop" | back |
| **Flash sale live** | sale with `endsAt` in the future | rail with countdown | add to cart |
| **Flash sale, more than 24h left** | — | text "Ends in 2 days" instead of chips | — |
| **Sale ended (live)** | countdown reaches 00:00:00 while open | chips show 00:00:00 and then the header reads "Sale ended"; cards switch to the sale-ended variant; the client refetches once (with jitter 0–3s); after the refetch the rail disappears if no sale is live | — |
| **Sale ended, item in cart** | cart holds a sale item whose sale ended | `FFAlert` warning above the cart bar: "The sale on an item in your cart has ended. You'll pay the current price." Checkout still uses the server price (existing "order total is" message). | checkout |
| **Out of stock** | stock 0 | card variant §7.2; product sheet "Add to cart" disabled with "Out of stock" | open details |
| **Pending approval** | trainer unverified / owner's gym pending / vendor pending | normal shop, role defaults only (§5.2); no banner about approval here (the shell already shows it) | all |
| **Role-restricted product** | product limited to owners (B-4) opened by a member/trainer, e.g. via deep link | Details sheet without price actions: "This item is sold to gym businesses only." / "Switch to your gym owner role to buy it." (the second line only if the account has an owner role; then a "Switch role" button using the existing persona switcher) | switch role / close |
| **Product gone** | deep link to a removed/blocked product | snackbar "This product is no longer available" and the home stays | — |
| **Personalisation off** | user opted out | §8.2 | toggle back on |
| **Flags off** | `SHOP_HOME_V2` off | today's shop, unchanged | — |

---

## 10. Copy (English + Swahili)

All Swahili below is a **draft for native review** (`[SW review]`), to be checked against the agreed 42-term glossary (`swahili-review` memory). Keys are proposals; `i18n-swahili-auditor` confirms placement in `lib/shared/i18n.dart`. Existing keys are reused where marked.

### 10.1 Page and hero
| Key | English | Swahili [SW review] | Notes |
|---|---|---|---|
| `member.shopTitle` (existing) | FitFlex Shop | Duka la FitFlex | reuse |
| `shop.browse` (existing) | Browse | Bidhaa | segment label; consider "Shop"/"Duka" (D-9) |
| `shop.home.fallbackLead` | Everything you need to | Kila unachohitaji ili | lead of fallback headline |
| `shop.home.fallbackAccent` | train | ufanye mazoezi | accent part; SW is 3× longer, so it wraps to its own line |
| `shop.home.fallbackSub` | Equipment, apparel and nutrition from FitFlex sellers. | Vifaa, mavazi na lishe kutoka kwa wauzaji wa FitFlex. | +12% |
| `shop.home.shopNow` | Shop now | Nunua sasa | pill |
| `shop.home.browseAll` | Browse all products | Tazama bidhaa zote | +5% |
| `shop.home.bannerOf` | Banner {n} of {total} | Tangazo {n} kati ya {total} | semantics |
| `shop.home.prevBanner` | Previous banner | Tangazo lililotangulia | arrow tooltip |
| `shop.home.nextBanner` | Next banner | Tangazo linalofuata | arrow tooltip |

### 10.2 Categories (short tile labels; full server name stays the semantics label)
| Key | English | Swahili [SW review] |
|---|---|---|
| `shop.home.categories` | Shop by category | Nunua kwa aina |
| `shop.cat.short.supplements_nutrition` | Supplements | Virutubisho |
| `shop.cat.short.sportswear_footwear` | Apparel & shoes | Mavazi na viatu |
| `shop.cat.short.equipment` | Equipment | Vifaa vya gym |
| `shop.cat.short.accessories_gear` | Accessories | Vifaa vidogo |
| `shop.cat.short.food_drinks` | Food & drinks | Chakula na vinywaji |
| `shop.cat.short.health_recovery` | Recovery | Afya na kupona |
| `shop.cat.short.events` | Events | Matukio |
| `shop.cat.short.other` | Other | Nyingine |
An unknown server key uses the server's full name (2 lines, ellipsis).

### 10.3 Sections
| Key | English | Swahili [SW review] | Length |
|---|---|---|---|
| `shop.home.flashSale` | Flash sale | Ofa ya muda mfupi | **+70%**, the longest header; the countdown wraps under the title on phone (§11.4) |
| `shop.home.endsIn` | Ends in | Inaisha baada ya | +100% |
| `shop.home.endsInDays` | Ends in {n} days | Inaisha baada ya siku {n} | |
| `shop.home.endsInOneDay` | Ends in 1 day | Inaisha baada ya siku 1 | |
| `shop.home.saleEnded` | Sale ended | Ofa imeisha | |
| `shop.home.viewAll` | View all | Ona zote | |
| `shop.home.featuredMember` | Featured gear | Vifaa vilivyoangaziwa | +50% |
| `shop.home.featuredTrainer` | Featured coaching gear | Vifaa vya ukocha vilivyoangaziwa | +45%, 2 lines on phone |
| `shop.home.featuredOwner` | Featured equipment | Vifaa vya gym vilivyoangaziwa | +55% |
| `shop.home.bestSellers` | Best sellers | Zinazouzwa zaidi | +35% |
| `shop.home.recommended` | Recommended for you | Zilizopendekezwa kwako | +15% |
| `shop.home.popularMember` | Popular with members | Maarufu kwa wanachama | |
| `shop.home.popularTrainer` | Popular with trainers | Maarufu kwa wakufunzi | |
| `shop.home.popularOwner` | Popular with gym owners | Maarufu kwa wamiliki wa gym | +25% |
| `shop.home.popularAll` | Popular in the shop | Maarufu dukani | |
| `shop.home.allProducts` | All products | Bidhaa zote | |
| `shop.home.backToShop` | Back to shop | Rudi dukani | chip in Results view |

### 10.4 Card and cart
| Key | English | Swahili [SW review] |
|---|---|---|
| `shop.outOfStock` (existing) | Out of stock | Zimeisha |
| `shop.home.onlyLeft` | Only {n} left | Zimebaki {n} tu |
| `shop.home.yourProduct` | Your product | Bidhaa yako |
| `shop.addToCart` (existing) | Add to cart | Ongeza kwenye kikapu |
| `shop.home.added` | Added to cart | Imeongezwa kwenye kikapu |
| `shop.home.viewCart` | View cart | Tazama kikapu |
| `shop.home.cartBar` | {count} items · {total} | Bidhaa {count} · {total} |
| `shop.home.cartBarOne` | 1 item · {total} | Bidhaa 1 · {total} |
| `shop.home.checkoutOffline` | Checkout needs a connection | Kukamilisha ununuzi kunahitaji mtandao |
| `shop.home.saleEndedInCart` | The sale on an item in your cart has ended. You'll pay the current price. | Ofa ya bidhaa iliyo kwenye kikapu chako imeisha. Utalipa bei ya sasa. |
| `shop.home.saleEndedInCartMany` | The sale on {n} items in your cart has ended. You'll pay the current prices. | Ofa ya bidhaa {n} zilizo kwenye kikapu chako imeisha. Utalipa bei za sasa. |

### 10.5 States
| Key | English | Swahili [SW review] |
|---|---|---|
| `shop.home.loading` | Loading the shop | Inapakia duka |
| `shop.home.errorTitle` | The shop didn't load | Duka halikufunguka |
| `shop.home.errorBody` | Check your connection and try again. | Angalia mtandao wako kisha ujaribu tena. |
| `common.retry` (existing) | Try again | Jaribu tena |
| `shop.home.offlineTitle` | You're offline | Huna mtandao |
| `shop.home.offlineBody` | Connect to the internet to browse the shop. | Unganisha intaneti ili kuvinjari duka. |
| `offline.banner` (existing) | You're offline. Showing what was last loaded. | Huna mtandao. Unaona kilichopakiwa mara ya mwisho. |
| `shop.home.emptyTitle` | The shop is getting ready | Duka linaandaliwa |
| `shop.home.emptyBody` | Sellers are adding products. Check back soon. | Wauzaji wanaongeza bidhaa. Rudi baadaye. |
| `shop.home.categoryEmpty` | Nothing in {category} yet | Bado hakuna bidhaa katika {category} |
| `shop.home.productGone` | This product is no longer available | Bidhaa hii haipatikani tena |
| `shop.home.ownersOnly` | This item is sold to gym businesses only. | Bidhaa hii inauzwa kwa biashara za gym pekee. |
| `shop.home.switchToOwner` | Switch to your gym owner role to buy it. | Badilisha kwenda jukumu lako la mmiliki wa gym ili uinunue. |

### 10.6 Why sheet and settings
| Key | English | Swahili [SW review] |
|---|---|---|
| `shop.why.title` | Why am I seeing this? | Kwa nini naona hii? |
| `shop.why.a11y` | Why am I seeing these suggestions? | Kwa nini naona mapendekezo haya? |
| `shop.why.roleMember` | You're shopping as a member. | Unanunua kama mwanachama. |
| `shop.why.roleTrainer` | You're shopping as a trainer. | Unanunua kama mkufunzi. |
| `shop.why.roleOwner` | You're shopping as a gym owner. | Unanunua kama mmiliki wa gym. |
| `shop.why.popularWithRole` | It's popular with others shopping in this role. | Ni maarufu kwa wengine wanaonunua katika jukumu hili. |
| `shop.why.boughtCategory` | You've bought {category} before. | Uliwahi kununua {category}. |
| `shop.why.boughtProduct` | Suggested because you bought {product}. | Imependekezwa kwa sababu ulinunua {product}. |
| `shop.why.gender` | The gender in your profile. | Jinsia uliyoweka kwenye wasifu wako. |
| `shop.why.deliversToArea` | It delivers to the area in your profile. | Inafikishwa kwenye eneo lililo kwenye wasifu wako. |
| `shop.why.featured` | Featured products are chosen by FitFlex or paid for by sellers. Paid ones are labelled Sponsored. | Bidhaa zilizoangaziwa huchaguliwa na FitFlex au hulipiwa na wauzaji. Zilizolipiwa zimeandikwa "Imedhaminiwa". |
| `shop.why.flashSale` | The seller has set a discount for a limited time. | Muuzaji ameweka punguzo kwa muda maalum. |
| `shop.why.bestSellers` | The most bought on FitFlex in the last 30 days. | Zilizonunuliwa zaidi kwenye FitFlex katika siku 30 zilizopita. |
| `shop.why.generic` | Suggested from what's popular on FitFlex. | Imependekezwa kutokana na kinachopendwa kwenye FitFlex. |
| `shop.why.offMember` / `offTrainer` / `offOwner` | Personalised suggestions are off. You see the same suggestions as everyone shopping as a {member / trainer / gym owner}. | Mapendekezo binafsi yamezimwa. Unaona mapendekezo sawa na kila mtu anayenunua kama {mwanachama / mkufunzi / mmiliki wa gym}. |
| `shop.why.switch` | Personalised suggestions | Mapendekezo binafsi |
| `shop.why.switchHint` | Use my purchases and profile to suggest products | Tumia manunuzi na wasifu wangu kunipendekezea bidhaa |
| `shop.why.settingsLink` | Shop suggestion settings | Mipangilio ya mapendekezo ya duka |
| `shop.why.saved` | Suggestions updated | Mapendekezo yamesasishwa |
| `shop.why.saveFailed` | Couldn't save. Try again. | Imeshindikana kuhifadhi. Jaribu tena. |
| `shop.why.privacyTile` | Shop suggestions | Mapendekezo ya duka |
| `shop.why.privacyOn` / `privacyOff` | Personalised / Off | Binafsi / Yamezimwa |

Check: `shop.why.featured` quotes the Swahili "Sponsored" label. It must match the existing `promo.sponsored` Swahili exactly; the auditor confirms.

### 10.7 Accessibility labels
| Key | English | Swahili [SW review] |
|---|---|---|
| `shop.a11y.price` | Price {price} | Bei {price} |
| `shop.a11y.salePrice` | Sale price {sale}, was {old}, {pct} percent off | Bei ya ofa {sale}, awali {old}, punguzo la asilimia {pct} |
| `shop.a11y.rating` | Rated {rating} out of 5 from {count} reviews | Ukadiriaji {rating} kati ya 5 kutoka maoni {count} |
| `shop.a11y.ratingOne` | Rated {rating} out of 5 from 1 review | Ukadiriaji {rating} kati ya 5 kutoka maoni 1 |
| `shop.a11y.addToCart` | Add {name} to cart | Ongeza {name} kwenye kikapu |
| `shop.a11y.addWithOption` | Add {name} to cart, choose an option | Ongeza {name} kwenye kikapu, chagua aina |
| `shop.a11y.inCart` | {name}, {qty} in cart. Add one more | {name}, {qty} kwenye kikapu. Ongeza moja zaidi |
| `shop.a11y.countdown` | Sale ends in {h} hours {m} minutes | Ofa inaisha baada ya saa {h} na dakika {m} |
| `shop.a11y.countdownMinutes` | Sale ends in {m} minutes | Ofa inaisha baada ya dakika {m} |
| `shop.a11y.category` | {category}, category | Aina: {category} |
| `shop.a11y.viewAll` | View all, {section} | Ona zote, {section} |
| `shop.a11y.showMore` / `showPrevious` | Show more, {section} / Show previous, {section} | Onyesha zaidi, {section} / Onyesha zilizotangulia, {section} |
| `shop.a11y.cartBar` | View cart, {count} items, total {total} | Tazama kikapu, bidhaa {count}, jumla {total} |

### 10.8 Swahili overflow plan
- Every title and label wraps; **nothing is truncated** except product names (2 lines) and category tile labels (2 lines, full name in semantics).
- Section header: if the title plus trailing controls do not fit on one line, the trailing countdown/"View all" moves to a second line, right-aligned. Design-qa checks "Ofa ya muda mfupi" with the chips at 375px and 130% text scale.
- Hero: up to 4 headline lines; the hero grows rather than shrinking the type.
- Card: fixed width; the height grows; all cards in a rail match the tallest.
- Cart bar label: one line at 100%; wraps to 2 lines at ≥130%, and the bar grows.

---

## 11. Accessibility

### 11.1 Touch targets
Every control ≥ 48×48 (≥44 minimum): cart button 48 hit area (40 visual), category tile ≥ 76×100, dots 44×44 each (8px visual, active 20×8 pill), Why button 48, "View all" text button min height 48, arrows 48, cart bar ≥ 48 tall.

### 11.2 Semantics (Flutter web exposes the tree; every actionable control is labelled)
- **Hero:** each slide is one `Semantics` container: "{headline full text}. {subline}. Banner {n} of {total}". The CTA is a separate button labelled with its visible text. The dots are excluded from semantics; the slide label carries the position. A paid slide's label starts with "Sponsored".
- **Carousel navigation for screen readers:** on all widths, the slide container exposes `onIncrease` / `onDecrease` (next/previous) so TalkBack/VoiceOver swipe-up/down and web arrow keys change slides. On web/wide screens the visible arrow buttons are labelled "Previous banner" / "Next banner".
- **Category tile:** button, label = full server category name ("Supplements & nutrition, category"). The icon is excluded.
- **Card:** one merged node for the open-details action whose label is name + price label (§10.7) + rating label (if any) + stock text + promotion label first if promoted. **Struck-through price:** the visual old-price `Text` is excluded from semantics; the merged label says "was {old}". The discount badge is excluded (the % is in the price label).
- **Cart button:** a separate button node, label per §7.2, not merged into the card.
- **Countdown:** `ExcludeSemantics` on the chips. The countdown container has a label at **minute precision**, updated at most once a minute, and it is **not** a live region (no per-second announcements). At the end, one polite announcement: "Sale ended".
- **Section headers:** `Semantics(header: true)` on titles.
- **Skeletons:** one node "Loading the shop"; the skeleton shapes are excluded.
- **Why sheet switch:** `Switch` with label "Personalised suggestions" and hint text read as the description.

### 11.3 Focus order (keyboard / switch access / web Tab)
1. Segmented control → 2. Search → 3. Hero slide (CTA) → 4. Hero prev/next (wide) → 5. category tiles left to right → 6. for each rail: header actions (Why, View all, arrows) then cards left to right, each card = [open details] then [cart button] → 7. "Browse all products" → 8. cart bar.
Focus is visible on every control. On Volt fills use the outline focus indicator (canon), not an overlay. When the focused card scrolls out of view, the rail scrolls to keep it visible.

### 11.4 Text scale, motion and theme
- Works at 100–200% text scale with no clipping. At ≥160% the rail cards are 180 wide.
- `MediaQuery.disableAnimations`: page changes snap instead of sliding; skeleton shimmer stops (static tint); countdown digits do not animate.
- Both themes, both languages. No colour is the only signal: sale = badge text + "was" price; out of stock = text badge; low stock = text.

---

## 12. Navigation

| From | To | Behaviour |
|---|---|---|
| Member bottom nav "Shop" | `/member/shop` (home) | existing route |
| Owner bottom nav "Shop" | `/owner/shop` (home) | existing route |
| Trainer tab "Shop" | trainer shop tab (home) | no route today; D-10 proposes `/trainer/shop` for deep links |
| Hero CTA / "View all" / category tile | Results view in the same tab, with query state in the URL: `?category=<key>`, `?section=<sectionKey>`, `?sale=<saleId>` | pushes a history entry on web |
| Card tap | existing product details sheet | `?product=<id>` added on web so a refresh reopens it |
| Deep link `/member/shop?product=<id>` (also owner/trainer) | home + details sheet | gone → snackbar §9; owners-only → role-restricted sheet |
| Push / inbox "Flash sale" (future) | `?sale=<id>` | if ended → home + snackbar "Sale ended" |
| **Back** from Results view | Shop home (search cleared, filters kept until reset) | system back and browser back |
| **Back** from details sheet | closes the sheet | |
| **Back** on Shop home | existing root back handling (`handleRootBack`) | unchanged |
| Cart bar | existing checkout sheet | unchanged |
| After checkout succeeds | existing: cart cleared, "My orders" segment, snackbar | unchanged |
| Why sheet → "Shop suggestion settings" (member) | `/member/privacy` | back returns to the shop |

---

## 13. Backend fields needed (for `fitflex-planner` / `contract-checker` to confirm)

Nothing below exists unless marked **exists**. Names are suggestions; the shape is what matters.

**Existing, reused:** `ShopProduct` fields `id, vendorId, name, category, brand, priceTzs, discountPriceTzs, stock, images[], rating, reviewCount, soldCount, variants[], promotion{type,label,commercial,token}` (**exists**); `GET /shop/categories` `{key,en,sw}` (**exists**); `GET /discover/products` featured + items + placement (**exists**); member `memberProfile.gender` (**exists**); `PATCH`/`GET` member privacy endpoints for other settings (exist; the new field is B-5).

| # | Need | Proposed shape | Why |
|---|---|---|---|
| **B-0** | Fix P-1: ignore `rating`, `reviewCount`, `soldCount` on product create; recompute existing rows from `ProductReview` and delivered order lines. Add `ratingSource: 'reviews'` or simply guarantee it in the contract. | — | DD-8, Best sellers honesty. **Blocker.** |
| **B-1** | Banners | `banners[]: {id, imageUrl, imageAlt{en,sw}, headlineLead{en,sw}, headlineAccent{en,sw}, subline{en,sw}, ctaLabel{en,sw}?, target{type:'category'|'product'|'section'|'sale'|'results', value}, audienceRoles[], startsAt, endsAt, promotion?}` plus admin create/approve (portal; out of this spec) | §6.3 |
| **B-2** | Home sections in one call | `GET /shop/home?lang=` → `{serverNow, personalisation:{enabled}, categories:[{key, count}], sections:[{key:'flash_sale'|'featured'|'best_sellers'|'recommended'|'popular_role'|'popular_all', titleKey, items:ShopProduct[], hasMore, viewAll:{section|category|sort}, reasons:[{code, params}]}]}`. The **role comes from the token's active persona, never from a query parameter the client can set.** | §5, §8 |
| **B-3** | Sale window | per product `saleStartsAt`, `saleEndsAt` (or a `FlashSale {id, startsAt, endsAt, productIds[]}`); `discountPriceTzs` applies only inside the window, **enforced by the server price at checkout** | countdown, sale ended |
| **B-4** | Product audience (optional) | `audienceRoles: ('member'|'trainer'|'owner')[]`, default all; checkout rejects a product outside the buyer's role | owner "commercial equipment", role-restricted |
| **B-5** | Personalisation preference | `shopPersonalisation: boolean` on the account (default per D-1), `GET/PUT` under `/me/...`; respected by B-2 | §8 |
| **B-6** | Per-item reason (personalised rail) | `items[].reason {code, params}` with codes from §8.3 only | details-sheet line |
| **B-7** | Exclude the viewer's own products from home rails when the viewer is also a vendor | server-side | DD-12 |
| **B-8** | Time | `serverNow` (ISO) in B-2 so the countdown ignores device clock skew | countdown |
| **B-9** | Real distance (later) | buyer area/location vs vendor location | needed before any "Near you" (P-4) |

Contract notes for `contract-checker`: B-2 must degrade. The app must still work against a backend without it (falls back to today's `/shop/products` + `/discover/products`, with Flash sale and Recommended hidden). Deploy order: functions → mobile.

---

## 14. Flags and rollout
- `SHOP_HOME_V2` (client-visible, default **off**): off = today's shop unchanged.
- `SHOP_PERSONALISATION` (backend, default **off**): off = B-2 returns role defaults only, the personalised rail shows "Popular with {role}", and the Why sheet hides the switch.
- `SHOP_FLASH_SALES` (backend, default **off**) until B-3 and checkout enforcement are tested.
- Ratings stay hidden in the new card until B-0 is merged (`design-qa` checks this).

---

## 15. Acceptance criteria

Each line is meant to be checked on its own by `design-qa` (visual/system) or `uat-tester` (journey), on Flutter web built from RC against the isolated backend with seed accounts. "Phone" = 375×812; "desktop" = 1280×800. Unless stated, check in light + dark and English + Swahili.

**Flags and fallback**
- AC-01 With `SHOP_HOME_V2` off, member, owner and trainer shops look and behave exactly as on RC before this change.
- AC-02 With the flag on but `GET /shop/home` missing or failing, the shop shows the fallback hero, categories and an "All products" grid; no error is shown, and search/cart/checkout work.

**Layout**
- AC-03 Phone: section order matches §5.1; no horizontal page overflow; the third rail card peeks.
- AC-04 Desktop: content max 1200 and centred; all 8 category tiles in one row; hero arrows and rail "Show more" arrows are visible and work with mouse and keyboard.
- AC-05 Hero: 1 slide shows no dots; 2–5 slides show dots; swiping changes the slide; there is no auto-advance after 30s idle.
- AC-06 Hero text sits on a scrim; on a white test photo, white headline text measures ≥ 4.5:1 and the accent word ≥ 3:1.
- AC-07 Category tiles show the 8 server categories (short labels), hide categories with 0 products, and put "Other" last; tapping opens Results filtered to that category.
- AC-08 A rail with fewer than 3 products is not rendered; no product appears in two home rails.
- AC-09 Product images render on white wells in both themes; a broken image URL shows the bag icon on white.

**Card and price**
- AC-10 A sale product shows a Fuel "−N%" badge where N = floor((price−sale)/price×100), the sale price in Fuel (light) / `#FF8A6B` (dark) and the old price struck through on a second line.
- AC-11 Prices read "TSh 279,000" (per D-8) in both languages.
- AC-12 A product with `reviewCount` 0 shows no stars, no number and no "0.0" (home and Results view).
- AC-13 A product with reviews shows "★ 4.6 (23)" matching the seeded real reviews.
- AC-14 An out-of-stock product never appears on home rails; in Results it shows the "Out of stock" badge, a dimmed image and no cart button.
- AC-15 Stock 1–5 shows "Only N left" (Swahili "Zimebaki N tu").
- AC-16 Tapping the cart button adds 1 (the option dialog first for products with options), shows "Added to cart" with "View cart", and the button shows the quantity; it does not open details.
- AC-17 Promoted products keep their `FFPromotionBadge` on every card, and the promotion impression/click events still fire (compare event counts with RC for the same journey).
- AC-18 No sponsored/promoted product appears in "Recommended for you".

**Flash sale**
- AC-19 With a seeded sale ending in 2h, the rail shows Fuel HH:MM:SS chips that count down each second in mono digits.
- AC-20 With a sale ending in more than 24h, "Ends in N days" text shows instead of chips.
- AC-21 With the device clock set 1h wrong, the countdown still matches `serverNow`.
- AC-22 When the countdown reaches 0 on screen, the header reads "Sale ended", the cards show the sale-ended variant and cart buttons are disabled, and after the refetch the rail disappears.
- AC-23 A sale item added before the end and checked out after: the cart shows the sale-ended notice, and the order total equals the server's current price.
- AC-24 No flash sale data → no Flash sale rail and no empty header.

**Personalisation**
- AC-25 Seed account member with purchases in `sportswear_footwear`: the rail is titled "Recommended for you" with a person icon, and the Why sheet lists "You've bought Sportswear & footwear before." and "You're shopping as a member."
- AC-26 Same person switched to the gym owner role: rail 6 is "Featured equipment", category order starts with Equipment, and the Why sheet says "You're shopping as a gym owner."
- AC-27 Trainer seed account: rail 6 is "Featured coaching gear".
- AC-28 A new account with no purchases sees "Popular with {role}" with a trending icon, and no "Recommended for you".
- AC-29 Turning the switch off: snackbar "Suggestions updated"; the rail becomes "Popular in the shop"; no reason mentions purchases, gender or area; after reload and sign-in on another browser the setting is still off.
- AC-30 A failed save reverts the switch and shows "Couldn't save. Try again."
- AC-31 Member Privacy page shows a "Shop suggestions" row with the current state; it opens the same switch.
- AC-32 A member with gender set and personalisation on: no section title or reason mentions a gender group; the Why sheet's gender line appears only if the server used it. With gender unset, it never appears.
- AC-33 A vendor account shopping as a member does not see its own products in home rails; in Results they carry "Your product" and have no cart button.

**States**
- AC-34 First load shows the skeleton layout of §9 (no spinner), announced once as "Loading the shop".
- AC-35 Offline with nothing loaded shows "You're offline" with Try again, **not** "No products available yet."
- AC-36 Going offline after a load keeps content, shows the offline banner/bar, and disables the cart bar with "Checkout needs a connection".
- AC-37 An empty catalogue shows "The shop is getting ready" with no hero and no rails.
- AC-38 Deep link to a removed product: home + "This product is no longer available".
- AC-39 (if B-4 ships) Member opening an owners-only product sees "This item is sold to gym businesses only." and no add-to-cart; with an owner role on the account, "Switch role" switches and reopens the product.
- AC-40 Seed banners contain no captions, names or testimonials attached to people; the fallback hero has no person imagery and no prices.

**Accessibility**
- AC-41 Every interactive element on the home has a non-empty semantics label in both languages (Flutter web accessibility tree; zero unlabeled buttons).
- AC-42 Screen reader on a sale card reads "… Sale price TSh 69,000, was TSh 85,000, 18 percent off"; the struck price is not read twice.
- AC-43 The countdown is read at minute precision and does not announce every second (leave the reader on it for 60s).
- AC-44 Hero slides change with screen-reader increase/decrease gestures and with keyboard on web; each slide reads "Banner n of total".
- AC-45 Keyboard Tab order follows §11.3; every control shows a visible focus indicator, and Volt-filled controls use an outline.
- AC-46 All touch targets ≥ 48×48 (cart button, dots, Why, View all, arrows, tiles).
- AC-47 At 200% text scale on phone, nothing is clipped or overlapping (hero, headers with countdown, cards, cart bar) in Swahili.
- AC-48 No Volt anywhere on a light surface (light theme screens, white image wells), and no Volt + green primary on the same light-theme screen.
- AC-49 Measured contrast matches §4 for the sale price, old price, discount badge, countdown chip and hero text.
- AC-50 With reduce-motion on: no slide animation, no shimmer, no digit animation.

**Navigation**
- AC-51 Category / View all / hero CTA open Results with the URL query (§12); browser Back returns to Shop home; Back again follows the existing root behaviour.
- AC-52 Reloading `/member/shop?product=<id>` reopens that product's sheet.
- AC-53 After checkout, the app lands on My orders with the existing snackbar.

**Copy**
- AC-54 No hardcoded English: every string in §10 resolves in both maps (`i18n-swahili-auditor`), and the Swahili strings are marked for native review.

Needs a real device (not checkable on Flutter web): TalkBack/VoiceOver gesture behaviour on hero and cards, native haptics on add-to-cart, and image memory use with many rails.

---

## 16. Open decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D-1 | Personalisation **on or off by default** for existing accounts? | Off until the privacy text is approved by counsel; on for new accounts after that. |
| D-2 | One setting per account across roles, or per role? | Per account (simpler, matches user expectation). |
| D-3 | May gender influence product order at all? | Allowed only per DD-11, or not used in v1. Recommend **not used in v1**. |
| D-4 | Add "Yoga & wellness" and "Sports gear" as categories? | Not now; "Recovery" covers wellness. Adding them changes vendor forms and existing listings. |
| D-5 | Do we need owners-only (commercial) products (B-4)? | Yes if commercial vendors exist; otherwise owner focus by category only. |
| D-6 | Should vendors be able to buy in the shop? | Not in this slice. |
| D-7 | Trainers and owners have no privacy page; is the Why-sheet switch enough? | Acceptable for v1; add a settings row in their profile later. |
| D-8 | Show money as `TSh 279,000` app-wide, or only in the shop? | **App-wide** in a separate small slice; mixing "TZS" and "TSh" in one app looks wrong. |
| D-9 | Rename segment "Browse/Bidhaa" to "Shop/Duka"? | Yes, it reads better above a home page. |
| D-10 | Add a `/trainer/shop` route for deep links? | Yes. |
| D-11 | Who creates and approves hero banners (portal admin, `shop`/`moderation` scope)? | Admins with the moderation scope, reusing promotion approval. |

## 17. Known gaps (reminder)
- Shop payments: **manual confirmation only** for the controlled launch (marketplace D-9); no payment provider for shop orders. Flash sales add urgency to a flow that still waits for manual confirmation. Consider holding `SHOP_FLASH_SALES` until that is settled.
- Vendor settlement is built but **never exercised against real accounts**; trainer and vendor payouts likewise.
- Privacy and legal text for personalisation is a **draft pending Tanzanian counsel**.
- All new flags stay off; marketplace items D-5, D-11, D-12 and `SHOP_RESERVATION_EXPIRY` remain open.
- Swahili in this spec needs native review.
