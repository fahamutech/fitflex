# Shop home Phase 2 — design addendum (banners, personalisation, near you, flash sales)

**Status:** Draft for owner review (slice 0 of Phase 2; STOP after this) · **Date:** 2026-10-20 · **Author:** design-agent
**Builds on:** `docs/design/shop-home.md` (Phase 1 spec, parent PR fitflex#65, branch `docs/design-shop-home`, **not yet on parent `release-candidate`**) and `docs/design/photo-hero-screens.md` §32.5 (Shop band coexistence rule). Section numbers like "P1 §6.3" point at the Phase 1 spec; "PH §32.5" at the photo-hero spec.
**Repos affected:** `fitflexmobile` (member shop, vendor app), `fitflex-portal` (vendor web portal, admin), `fitflex-functions` (fields only, §13). No app code here.
**Ships:** dormant behind four backend flags (§14). Owner decision 2026-10-20: personalisation and near-you flags may go on in production right after QA.
**Not in scope:** paid vendor placement (owner: none now), checkout delivery blocking (owner: badge only), a vendor buying flow, sponsor/B2B rails, portal vendor profile editing (§9.4, Q-7).

Sources read on 2026-10-20 (from `origin/release-candidate` unless noted): mobile `lib/shared/widgets/shop_home/*` (`shop_home_page.dart`, `shop_product_card.dart`, `shop_product_rail.dart`), `lib/shared/widgets/shop_browse_page.dart` (filter sheet `shop-filter-distance`, `vendorId` query, `VendorStoreSheet`), `lib/screens/vendor/vendor_home_page.dart` (tabs, `VendorProductForm`, `VendorProfileForm`), `lib/screens/member/member_privacy_page.dart`, `lib/screens/member/member_gyms_tab.dart` / `member_home_tab.dart` (location permission today), `lib/shared/components/*` (`FFPhotoHero`, `FFBadge` incl. `fuel` tone, `FFSheet`, `FFActionTile`, `FFSegmented`), `lib/shared/i18n.dart`; portal `app/admin/promotions/page.tsx`, `src/components/promotion-detail.tsx` (`ActionDialog` with reason), `src/components/hero-image-manager.tsx` (rights confirmations, `FocalPointPicker`), `src/components/area-picker.tsx`, `src/components/image-upload.tsx`, `app/vendor/*` (products are "edit in app"), `src/components/Shell.tsx`, `src/lib/i18n.ts`; functions `db/migrations/20261126090000-moderation-promotion.cjs` (`GeoArea`), `src/services/promotion-service.mjs` (`cannot_approve_own_submission`), `src/shared/audience.mjs` (`gender` male/female/other, `ageOn(dateOfBirth)`), `src/services/shop-service.mjs` (order lines carry `priceTzs` + `discountPriceTzs`; variants share the product price); parent `canon/04-marketing/design-system.md` (V2), `docs/localization/fitflex-terminology-glossary.md`; memory notes `shop-home-v2-personalised`, `design-system-redesign`, `design-system-v2-accents`.

---

## 1. Slices at a glance

| Slice | What the user sees | Surfaces | Flag (backend) | Branch (planner) |
|---|---|---|---|---|
| **S1 Banners** | Hero carousel of approved banners on Shop home; vendors propose banners; staff approve, reject, end or create | member/owner/trainer Shop home (app, Flutter web); vendor app; vendor web portal; admin portal | `SHOP_BANNERS` | `feat/shop-banners` |
| **S2 Personalisation** | "Personalised shop" switch (Why sheet + member Privacy tile); purchase history reorders rails; gender/age reorder vendor-tagged products in member mode; vendor "Made for" / "Age group" product fields | Shop home (app); member Privacy; vendor product form (app) | `SHOP_PERSONALISATION` | `feat/shop-personalisation` |
| **S3 Near you** | Location invite card + rationale sheet; "Popular near you" rail; "Delivers to your area" badge; vendor "Based in" + "Delivers to" pickers; vendor-typed distance filter hidden | Shop home + Results + product sheet (app); vendor profile form (app) | `SHOP_NEAR_YOU` | `feat/shop-near-you` |
| **S4 Flash sales** | Flash sale rail with countdown; struck "was" price; price-changed sheet at checkout; vendors propose sales with live % and the 14-day rule; staff approve | Shop home, Results, product sheet, checkout (app); vendor app; vendor web portal; admin portal | `SHOP_FLASH_SALES` (pricing path, security review) | `feat/shop-flash-sales` |

Each slice is usable on its own; S1 and S4 share the proposal lifecycle (§4) and the admin queue (§5.3, §8.5).

---

## 2. Decisions

### 2.1 Owner decisions (final, 2026-10-20) this spec implements
| # | Decision |
|---|---|
| O-1 | Vendors **propose** banners and flash sales (vendor app + vendor web portal). Staff **approve**; the creator can never approve their own item. Staff can also create (and another staff member approves). |
| O-2 | **No paid placement.** Vendor banners show "From {vendor}". The word "Sponsored" never appears on a banner. |
| O-3 | Banner images may show models in product shots, but are **never framed as FitFlex members, trainers or partners**. The uploader confirms rights and the people rule. |
| O-4 | Flash sales: **no maximum discount; minimum 5%**. A sale is **refused if the product's price was raised in the 14 days before the sale starts**. |
| O-5 | Proposals **expire after 14 days, or at their start time**, whichever is first, if not decided. |
| O-6 | Personalisation (purchase history + gender/age) is **on by default** with **one opt-out, "Personalised shop"** (member Privacy page tile + Why sheet switch). Gender/age only **reorder** products a vendor tagged ("Made for", "Age group"), **member mode only**, **never for under-18s**. |
| O-7 | "Popular near you" uses **device GPS with permission**. An **in-app rationale sheet comes before the OS prompt**, and is shown even if the OS permission was already granted (for gyms). The area is worked out **on the device**; only `areaId` is sent. The rail is **hidden if location is denied**. |
| O-8 | Vendors set **"Based in"** (one area) and **"Delivers to"** (many areas). No checkout delivery block: only a **"Delivers to your area"** badge. The vendor-typed distance filter is **hidden once areas exist**. |
| O-9 | Flags may go on right after QA (privacy text is still a draft pending Tanzanian counsel; the owner accepted that risk). |
| O-10 | Swahili "banner" = **"Bango" / "Mabango"** (native review). Currency display **TSh**. Rails need **at least 4** products. Text scale is capped at **130%** app-wide (P1 AC-47). |

### 2.2 Design decisions (proposed; owner may overrule)
| # | Decision | Why |
|---|---|---|
| DD-P2-1 | **Banner CTA labels come from a fixed list**, chosen by the target (vendor: "View product" / "Visit store"; staff also "Shop now", "See the sale", "View all"). No free-text CTA. | Guarantees both languages, ≤24 characters and honest wording. |
| DD-P2-2 | **Banner text may not contain prices, percentages or "/=" amounts** (server rule `banner_text_has_price`). Deals go through flash sales, which the server prices. | A price painted into a banner goes stale and cannot be enforced at checkout. P1 already bars prices on the fallback slide. |
| DD-P2-3 | **Banner and flash-sale copy written by vendors is required in English and Swahili.** The form shows both fields side by side; the admin checks both. | CLAUDE.md rule 5. Vendor text is data, but members still read it in their language. See Q-1. |
| DD-P2-4 | **While a flash sale is approved or live, the product's regular price is locked** in the vendor product form (read-only with a reason). | Otherwise a vendor could raise the "was" price under a running sale, which is exactly what the 14-day rule prevents before the start. |
| DD-P2-5 | A flash sale's % is computed against the product's **regular price** (`priceTzs`), floored, and the sale price must also be **below any standing seller discount** (`discountPriceTzs`). | Otherwise a "flash sale" could be more expensive than the product's normal reduced price. Q-3. |
| DD-P2-6 | **Members never see upcoming sales or banners.** Only live items render. | Avoids teasing prices that may still be rejected. |
| DD-P2-7 | **Location is asked through an invite card in the "Popular near you" slot**, which opens the rationale sheet. No sheet pops up by itself on opening the shop. | Meets O-7 (sheet before the OS prompt) without interrupting the shop. Q-5. |
| DD-P2-8 | "Personalised shop" off also turns off **near you** (the location is not read at all). | The owner wants one opt-out; location is personal data. |
| DD-P2-9 | The in-app "Use my location in the shop" choice is **per device**, stored on the device only; the server never learns it beyond the `areaId` it receives. | Data minimisation. |
| DD-P2-10 | One admin queue for both banners and flash sales at **`/admin/shop-merch`**, modelled on `/admin/promotions` (tabs, table, `?item=` detail, reason dialogs). | Reuses a working, tested pattern; one place to review. |
| DD-P2-11 | Banner audience: the proposer picks **Members / Trainers / Gym owners** (at least one; default all three). **At most 5 live banners per audience** at any moment; approving a 6th is blocked with a message naming the clash. | P1 §5.1 says 1–5 slides. Q-4. |
| DD-P2-12 | **Flash sale length 1 hour to 7 days.** One flash sale per product at a time (no overlapping windows, counting scheduled ones). | Keeps "flash" meaning short; avoids stacking prices. Q-3. |

---

## 3. Component reuse map

| Need | Use | Change needed |
|---|---|---|
| Hero carousel (member) | **`FFHeroCarousel`** (new in P1 §3, not built yet) rendering each slide with `FFPhotoHero` (`band` on phone, `panel` + `rounded` ≥840) | `FFPhotoHero` today only takes bundled `FFHeroPhoto` assets ("never fetched from the network"). Add a **network image source** (`FFRemoteImage` underneath, same scrim, same focal alignment). Bundled-only screens keep the current constructor. |
| "From {vendor}" chip on a slide | `FFBadge` | New `onPhoto` look: white text on slate-950 at 75% (9.68:1 even over a white photo). No new component. |
| Countdown | **`FFCountdown`** (new in P1 §3) | None beyond P1 §11.2. |
| Discount badge, sale price | `FFBadge(tone: fuel)` (exists), Fuel text tokens | None. |
| Sheets (Why, rationale, price changed, Personalised shop) | `FFSheet` | None. |
| Switch rows | `SwitchListTile` themed as in the Activity sharing page | None. |
| Privacy tile | `FFActionTile` | None. |
| Status chips (vendor lists) | `FFBadge` tones (§4.2) | None. |
| Vendor lists, empty/error | `FFEmptyState`, `FFErrorState`, `FFSkeleton` | None. |
| Vendor forms | `FFTextField`, `FFChoiceTile`, `FFButton`, `ProductCategoryPicker` pattern, `FFPhotoPickerField` | None. |
| Date/time in app | existing Material date + time pickers used by challenge forms | None. |
| **Area picker (app)** | — | **New `FFAreaPicker`** (single and multi mode): a searchable sheet listing the area tree. Nothing in the app picks from a list of areas; `LocationPicker` is a map pin. Mirrors the portal `AreaPicker` rules ("an area covers everything beneath it"). |
| Portal queue + detail | `app/admin/promotions/page.tsx` layout, `Table`, `Badge`, `Alert`, `Dialog`, `ActionDialog` pattern from `promotion-detail.tsx` | Copy the pattern into a `shop-merch` page; extract nothing unless both pages need it. |
| Portal image + rights | `ImageUpload`, `FocalPointPicker`, the `Confirmations` block of `hero-image-manager.tsx` | Banner people options differ (§5.2.3): pass options in rather than reading `HERO_PEOPLE_ALLOWED`. |
| Portal dates | `DateTimeInput` | None. |
| Portal areas | `AreaPicker` | Not used in Phase 2 (vendor areas are app-only, Q-7). |

New components in this addendum: **`FFAreaPicker`** only (plus the two P1 ones it depends on, `FFHeroCarousel` and `FFCountdown`, and the network source on `FFPhotoHero`).

---

## 4. Proposal lifecycle (shared by banners and flash sales)

### 4.1 States

| State (wire) | Meaning | Who moves it | Next |
|---|---|---|---|
| `pending_approval` | Sent by a vendor (or created by staff), waiting for a decision | vendor submit / staff create | approved, rejected, expired, withdrawn |
| `approved` | Approved, start time in the future. Shown as **Scheduled** | staff (not the creator) | live (at start), withdrawn (vendor, before start), ended (staff "End now") |
| `live` | Approved and now inside its window (derived from time) | time | ended |
| `ended` | Window passed, or ended early by the vendor or by staff (`endedBy`, `endedReason`) | time / vendor "End now" / staff "End now" | — |
| `rejected` | Staff said no, with a reason the vendor sees | staff | — (vendor may copy into a new proposal) |
| `expired` | Not decided within 14 days of sending, or the start time came first | time | — (copy) |
| `withdrawn` | The proposer took it back before it went live | vendor / creating staff | — (copy) |

Edits: a `pending_approval` item can be edited by its proposer (stays pending; history records the edit; the 14-day clock keeps its original start). Editing an `approved` item sends it back to `pending_approval`. `live`, `ended`, `rejected`, `expired`, `withdrawn` cannot be edited.

A suspended vendor's items stop rendering for buyers at once (same rule as `suspended-vendor-off-sale`), whatever their state; the queue shows a "Seller suspended" warning on them.

### 4.2 Status display (app + portal)

| State | Label EN | Label SW [SW review] | Tone | Extra line on the vendor card |
|---|---|---|---|---|
| pending | Waiting for approval | Inasubiri idhini | warning | "Expires {date} if not reviewed" |
| approved | Scheduled | Imepangwa | brand / info | "Starts {date, time}" |
| live | Live | Inaendelea | success | "Ends {date, time}" (sale: countdown text) |
| ended | Ended | Imeisha | neutral | "Ended {date}" + "by FitFlex: {reason}" when staff ended it |
| rejected | Rejected | Imekataliwa | danger | "Reason: {reason}" |
| expired | Expired | Imeisha muda | gray | "Not reviewed in time" |
| withdrawn | Withdrawn | Imeondolewa | gray | "You withdrew this" |

Status is never colour-only: the label text is always present. The SW labels reuse portal `pro.status.*` where they exist (`Inasubiri idhini`, `Imepangwa`, `Inaendelea`, `Imekataliwa`, `Imeisha muda`).

### 4.3 Vendor notifications (server strings; listed so the copy is bilingual)

| Event | EN | SW [SW review] | Opens |
|---|---|---|---|
| approved | Your {banner / flash sale} "{title}" is approved. It goes live {date}. | {Bango lako / Ofa yako ya muda mfupi} "{title}" imeidhinishwa. Itaanza {date}. | `/vendor/merch?item=<id>` |
| rejected | Your {…} "{title}" wasn't approved. See why. | {…} "{title}" haikuidhinishwa. Tazama sababu. | same |
| expired | Your {…} "{title}" expired before review. | {…} "{title}" imeisha muda kabla ya kukaguliwa. | same |
| ended by FitFlex | FitFlex ended your {…} "{title}". | FitFlex imesimamisha {…} "{title}". | same |

`{title}` = headline for banners, product name for sales. Partner notification plumbing exists (`partner-notifications`); the planner confirms the channel.

---

## 5. S1 — Banners

### 5.1 Member-facing hero carousel (Shop home slot 3)

**Purpose:** show up to 5 approved, live banners for the role the user is shopping as.

**Delta to P1 §6.3 (everything else in P1 §6.1–6.3, §11 stays):**
- **Who rendered it:** a vendor banner shows a **"From {vendorName}"** chip top-left (16 inset), `FFBadge` on-photo look (white on slate-950 75%, 12/16 w600, 2 lines max). Staff banners have no chip. **No `FFPromotionBadge`, no "Sponsored"** on any banner (O-2).
- **Coexistence with the photo band (PH §32.5 rule 4, restated testably):** ≥1 live banner for this role → carousel in slot 3, band **not in the tree**. 0 banners or the banners request failed → the member band (when `PHOTO_HERO_UI` on) or the P1 navy fallback slide (when off). Never both. Owner and trainer shops never show the band, so with 0 banners they show the P1 fallback slide.
- **Slide order:** staff banners first, then vendor banners by start time (earliest first). Server decides; the client renders in the order received.
- **Slide content:** network image (`BoxFit.cover`, focal point from upload), scrim per PH §5, headline lead + accent, optional subline, CTA from the fixed list (DD-P2-1). The image is decorative (excluded from semantics); the headline carries the meaning.
- **CTA targets:** product → product details sheet (`?product=<id>`); store → Results view filtered `?vendorId=<id>` (the existing query) with the header "{vendorName}"; staff targets also category, section, results, flash sale (P1 §12).
- **When a target is gone** (product removed, out of stock, vendor suspended): the server drops that banner. If it was already on screen, the tap shows "This product is no longer available" (P1 `shop.home.productGone`) and the home stays.
- **Desktop ≥1024:** P1 §6.2 (3:1, max height 360, arrows). The chip stays top-left.

States (banner area only):

| State | Shows |
|---|---|
| Loading | P1 skeleton hero block |
| Live banners | carousel; 1 slide = no dots/arrows |
| No live banners / `SHOP_BANNERS` off | band (member + `PHOTO_HERO_UI`) or P1 fallback slide |
| Banner request failed, rest loaded | same as "no live banners"; no error shown |
| Offline with cache | cached slides stay; CTA taps that need the network show the existing offline snackbar |
| One image fails to load | that slide keeps its text on the `heroPlaceholder` ground (navy); still readable |
| Role-restricted target (owners-only product) | P1 §9 role-restricted sheet |

### 5.2 Vendor: banner proposals (app + vendor web portal)

#### 5.2.1 Entry points
- **App:** Products tab (tab 0), first row above the list: `FFActionTile` key `vendor-merch-entry`, icon `Icons.campaign_outlined`, title "Banners & flash sales", subtitle "{n} waiting for approval" / "Promote your products in the FitFlex shop". Opens **`/vendor/merch`** (new route) with an `FFSegmented` "Flash sales | Banners" (`?tab=sales|banners`). Shown only when the server reports the tool (`me.tools.shopBanners` or `.flashSales`, §13).
- **Vendor web portal:** new sidebar item **`/vendor/merch`**, label "Banners & sales" (icon `Megaphone`), after Products. Same two tabs as page tabs.
- Deep link from notifications: `/vendor/merch?item=<id>` opens the detail.

#### 5.2.2 List (`/vendor/merch?tab=banners`)
- Header row: title "Banners", button **"Propose a banner"** (`FFButton` primary, md, full width on phone; right-aligned on ≥840).
- Cards, newest first, grouped: **Live** · **Scheduled** · **Waiting for approval** · **Past** (ended, rejected, expired, withdrawn; collapsed after 10 with "Show more").
- Card: 16:10 thumbnail (radius 12), headline (2 lines), status badge (§4.2), dates line, extra line (§4.2), target line "Links to: {product name}" / "Links to: your store", audience line "Shown to: Members, Trainers".
- Card actions (text buttons, ≥48 tall): pending → **Edit**, **Withdraw**; scheduled → **Edit** (warns it goes back for approval), **Withdraw**; live → **End now**; past → **Copy to new**.
- Phone 375: one column. Desktop ≥840: 2-column grid in a ≤960 column.

States:

| State | What shows |
|---|---|
| Loading | 3 card skeletons (thumbnail + 2 lines) |
| Empty (never proposed) | `FFEmptyState` `Icons.campaign_outlined`: "No banners yet" / "Propose a banner to show your products at the top of the FitFlex shop." + "Propose a banner" |
| Error | `FFErrorState` "Banners didn't load" + Try again |
| Offline, nothing loaded | `FFErrorState` `wifi_off` "No internet connection" / "Connect to see your banners." + Try again |
| Offline, cached | content stays; actions disabled with the existing offline bar; "Propose" disabled with hint "Needs internet" |
| Vendor pending approval (KYC/business) | `FFEmptyState`: "Available once your business is approved" / "You can propose banners and flash sales after FitFlex approves your business." + "Open Verification centre" (existing KYC entry) |
| Staff without `products` permission | the existing restricted state (`_restrictedTab`) |
| Vendor suspended | `FFAlert` danger at top: "Your account is suspended. Your banners and flash sales are not shown in the shop." Propose disabled |
| Feature off | entry tile and nav item hidden; a deep link shows "This tool isn't available yet" + Back |

#### 5.2.3 Banner form (`/vendor/merch/banner/new`, `/vendor/merch/banner/<id>/edit`)
One scrolling form on phone; on ≥1024 two columns: form (max 560) + sticky live preview (400). Portal: same fields, same order, same validation messages.

| # | Field | Control | Rules / validation message |
|---|---|---|---|
| 1 | **Image** (required) | `FFPhotoPickerField` / portal `ImageUpload` (1 file) + focal-point picker | JPG, PNG or WebP; at least **1600×1000 px**; at most **5 MB**. Errors: "Use a JPG, PNG or WebP image." · "The image must be at least 1600 × 1000 pixels." · "The image must be 5 MB or smaller." Help text: "Show the product. No prices, phone numbers or text in the photo." |
| 2 | **People in the photo** (required) | radio (`FFChoiceTile`) | "No people" · "Models showing the product". |
| 3 | **Confirmations** (required) | checkboxes | (a) always: "I have the right to use this image, and FitFlex may show it in its apps and portal." (b) when "Models…" is picked: "The people are models showing the product. The banner does not present them as FitFlex members, trainers or partners, and has no names or quotes from them." Unticked → "Tick this box to confirm." |
| 4 | **Headline: first part** EN + SW (required) | `FFTextField` ×2 | Counter. Lead + accent ≤ **32** characters (EN) and ≤ **42** (SW). "Keep the headline to {n} characters." |
| 5 | **Headline: highlighted words** EN + SW (required) | `FFTextField` ×2 | Shown in the accent colour; 1–3 words. Same combined limit. |
| 6 | **Subline** EN + SW (optional) | `FFTextField` ×2 | ≤ 70 EN / ≤ 90 SW. If one language is filled, the other is required: "Add the {Swahili / English} text too." |
| 7 | **Links to** (required) | radio: "One of my products" (opens own-product picker: active, approved, in stock) · "My store" | Button label set automatically: "View product" / "Visit store" (shown read-only under the field: "Button: View product"). Picked product later out of stock → note on the card: "Hidden while {product} is out of stock". |
| 8 | **Show to** (required, ≥1) | checkboxes: Members · Trainers · Gym owners (all ticked by default) | "Pick at least one." |
| 9 | **Starts** / **Ends** (required) | date + time (Tanzania time, shown as such) | Start at least 1 hour from now: "Pick a start at least an hour from now." End after start: "The end must be after the start." Length ≤ 30 days: "A banner can run for up to 30 days." |
| — | Text rule (all text fields) | server + inline | No prices or percentages (DD-P2-2): "Banners can't show prices or discounts. Use a flash sale for a deal." No URLs/phone numbers: "Remove links and phone numbers." |

Under the form: info `FFAlert`: "FitFlex reviews every banner. If it isn't reviewed within 14 days, or before it starts, it expires." Buttons: **"Send for approval"** (primary, full width on phone) and **"Cancel"** (ghost). Editing a scheduled banner: confirm dialog "Send this banner back for approval? It won't go live until FitFlex approves it again." ("Send again" / "Keep as is").

**Live preview:** the slide at phone width with the "From {your business}" chip, toggles "English / Kiswahili" and "Light / Dark" (so the vendor sees the accent in green and in Volt). Updates as they type. Semantic label: "Preview of your banner".

Submit states: sending (button spinner, fields disabled) · success → back to the list with snackbar "Sent for approval" and the new card under "Waiting for approval" · validation error from server → message under the field, focus moves to the first invalid field · offline → snackbar "No internet connection. Your banner wasn't sent." (form kept) · upload failure → under the image "Upload failed. Try again." with retry.

Withdraw: confirm dialog "Withdraw this banner?" / "It won't be reviewed or shown." ("Withdraw" danger / "Keep"). End now (live): "End this banner now?" / "It leaves the shop within a minute." ("End now" danger / "Keep").

### 5.3 Admin: merch queue (`/admin/shop-merch`, portal)

**Who:** list and detail with scope `promotions`; Approve, Reject and End with **`promotions_approve`**; Create with `promotions`. Sidebar item "Banners & flash sales" in the Promotion group (`admin.nav.shopMerch`).

#### 5.3.1 List
- `PageHeader` "Shop banners & flash sales" / description "Review what sellers propose for the shop home. You can't approve something you created."; actions: Refresh, **"Create banner"**, **"Create flash sale"**.
- Tabs (counts in pills, as on Promotions): **Requests** (pending, oldest first, expiring-soonest highlighted) · **Scheduled** · **Live** · **Closed** (ended, rejected, expired, withdrawn).
- Type filter (segmented): All · Banners · Flash sales. Search by seller or product.
- Table columns: Item (thumbnail or product image + headline/product name) · Type · Seller ("FitFlex" for staff) · Dates · Discount (sales: "−24% · TSh 69,000") · Status · Sent (relative, with "Expires in 2 days" in warning tone under 72h).
- Rows: keyboard focusable, Enter opens `?item=<id>` (Promotions pattern). Phones: rows become stacked cards.
- States: loading spinner card; empty per tab ("No requests waiting", "Nothing scheduled", "Nothing live", "Nothing closed yet"); error `Alert` + Retry; 403 → existing "You don't have access" page.

#### 5.3.2 Detail (`?item=<id>`)
Left column (≥1024; stacked on phone):
1. **Preview.** Banner: phone slide (375) and desktop crop (3:1) side by side, both themes toggle, EN/SW toggle. Flash sale: the product card in sale state (badge, Fuel price, struck price, countdown text).
2. **Details.** Banner: headline/subline both languages, target (link opens the product in a new tab), audience, dates, people choice, the uploader's confirmations "Confirmed by {name}, {date time}". Flash sale: product, regular price now, sale price, % off, saving, dates, **price check** (§8.5).
3. **History** (created, edited, submitted, approved/rejected, ended), same component style as promotion history.

Right column, **Actions** card:
- **Approve** (primary). Opens a dialog with a required **review checklist** (portal `Checkbox`es):
  - Banners: "No one is presented as a FitFlex member, trainer or partner." · "No prices, discounts, phone numbers or links in the image or text." · "Both languages say the same thing."
  - Flash sales: "The product and price look right." (the 14-day check is automatic and shown, not ticked).
  Confirm "Approve". Server rechecks everything; on a clash it shows the error (§13 error table).
- **Reject** (secondary danger). Dialog: reason chips (one required) "Image quality" · "People framed as members or partners" · "Text or prices in the image" · "Misleading claim" · "Wrong link or product" · "Other", plus a note (required for "Other", 10–500 characters): "The seller sees this reason."
- **End now** (live or scheduled). Dialog with a required reason (10–500): banner "It leaves the shop within a minute." · sale "Buyers pay the regular price from now. Carts with this item will show the new price at checkout."
- **Own item:** when the viewer created or submitted it, Approve and Reject are **disabled** and the card shows, as visible text (not only a tooltip): "You created this, so another admin must approve it." The creator gets **Withdraw** instead of Reject. **End now** stays available to everyone with `promotions_approve` (stopping is always safe).
- **No `promotions_approve`:** the actions card shows "You can view this. Approving needs the 'Approve promotions' permission."
- After an action: toast "Approved" / "Rejected" / "Ended", the item moves tab, the page stays on the detail.

#### 5.3.3 Staff create
Same form fields as §5.2.3 (and §8.3 for sales) with three differences: the seller is "FitFlex" (banner) or any vendor's product (sale, product search across sellers; the sale is recorded as created by staff for that vendor, and the vendor is notified "FitFlex scheduled a flash sale on {product}" — Q-8); extra targets for banners (category, section, flash sale, all products) and CTA list "Shop now / See the sale / View all"; banners have **no "From" chip**. Submitting puts it in Requests for **another** admin.

---

## 6. S2 — Personalisation

### 6.1 Rules (what the server may do; the UI must reflect it)
- **Switch on (default):** purchase history (paid orders, 365 days) reorders and fills "Recommended for you"; gender/age may reorder products whose vendor tagged them; area (S3) feeds "Popular near you".
- **Member mode only** for gender/age. Trainer, owner and vendor-personal modes never use them.
- **Under 18 or no date of birth:** age is never used; under 18 gender is never used either (O-6). Q-6 asks whether history and area should also be off for under-18s.
- Gender `other` or unset: gender not used.
- **Reorder only:** a tagged product moves up within a rail; untagged products and products tagged for other groups still appear. No section title or reason ever names a gender or age group ("For women", "Over 45").
- **Switch off:** P1 §8.2 (rail becomes "Popular in the shop"; no reason mentions purchases, gender, age or area), plus near-you off and location not read (DD-P2-8).

### 6.2 Vendor product form: target fields (app only; portal products are "edit in app")
Placed in `VendorProductForm` after Category, under a section title "Who it's for (optional)" with hint "Helps FitFlex show it first to the right members. Everyone can still find and buy it."

| Field | Control | Values EN / SW [SW review] | Default |
|---|---|---|---|
| **Made for** | single-select chips (`FFFilterChip` group, wraps) | Everyone · Women · Men / Wote · Wanawake · Wanaume | Everyone |
| **Age group** | multi-select chips | All ages · 18–29 · 30–44 · 45–59 · 60+ / Umri wote · 18–29 · 30–44 · 45–59 · 60+ | All ages ("All ages" clears the others; picking a band clears "All ages") |

Semantics: each chip "Made for, Women, selected" / "Age group, 30 to 44, not selected". Chip height 48. Values on the wire per §13 B-P2-6. Product list rows show nothing new.

### 6.3 Why sheet with switch (update of P1 §8.1–8.2)
`FFSheet` "Why am I seeing this?" content, top to bottom:
1. Reasons for this rail (closed list, P1 §8.3 plus `profile_age`, and `delivers_to_area` worded "your current area").
2. Role line (existing `shop.why.role*`).
3. Featured: disclosure paragraph (existing).
4. **Switch "Personalised shop"** (key `shop-why-personalised`), hint "Use my purchases, my profile's gender and age, and my current area to order the shop for me." Shown in every mode. In trainer/owner modes the hint is "Use my purchases and my current area to order the shop for me." (gender/age are never used there).
5. Location line (S3; only when `SHOP_NEAR_YOU` on and the switch is on): "Popular near you: On · {area name}" with **"Turn off"**, or "Popular near you: Off" with **"Turn on"** (opens the rationale sheet §7.2).
6. Member only: link "Privacy & data" → `/member/privacy`.

Switch behaviour: P1 §8.2 (saves at once, disabled with spinner while saving, "Shop updated" snackbar, home reloads behind the sheet; failure reverts with "Couldn't save. Try again."). The setting is per account across roles.

### 6.4 Member Privacy tile
`/member/privacy`, between "Message preferences" and "Activity sharing": `FFActionTile` key `privacy-shop`, icon `Icons.storefront_outlined`, title **"Personalised shop"**, subtitle "On" / "Off". Opens an `FFSheet` with the same switch and hint (§6.3 item 4), the location line (item 5), and a short "What we use" list: "What you bought on FitFlex in the last year" · "Gender and age from your profile, to show tagged products first (never used for under-18s)" · "Your current area, only if you allow location" · "We never use your activity, health, training or company data." Footer note (muted): "This text is a draft and may change." (removed when counsel approves; see §16).

States: loading (tile subtitle skeleton line), error (subtitle "Couldn't load", tap retries), offline (tile disabled, subtitle "Needs internet"), saving (switch disabled + spinner).

### 6.5 Shop home under S2
| State | Shows |
|---|---|
| On, with history | "Recommended for you" (person icon), reasons `bought_category` / `bought_product` |
| On, no history | "Popular with {role}" (P1 §8.5) |
| On, member with tagged matches | order changes only; reason line `profile_gender` / `profile_age` appears **only if the server used it** |
| Off | "Popular in the shop"; no personal reasons; no near-you rail or invite |
| `SHOP_PERSONALISATION` off | P1 behaviour; the switch is hidden in the Why sheet and the Privacy tile is hidden |
| Preference request failed | treat as on for display (server decides), switch shows the server value once it loads; if it never loads, the switch row shows "Couldn't load your setting" + Try again |

---

## 7. S3 — Popular near you

### 7.1 Flow
```
Shop home loads (member/trainer/owner mode, Personalised shop ON, SHOP_NEAR_YOU on)
 ├─ device choice = "on" and OS permission granted → read position once per session
 │     → map to area on device → send areaId with /shop/home → rail (≥4 items) or nothing
 ├─ device choice = not asked → INVITE CARD in the near-you slot
 │     → "Use my location" → RATIONALE SHEET
 │          → "Use my location" → OS permission already granted? → yes: read position
 │                                                              → no: OS prompt → granted: read position
 │                                                                              → denied: card gone, snackbar
 │          → "Not now" → card gone (device choice = "off"); re-offer only from the Why sheet / Privacy sheet
 └─ device choice = "off" → nothing in the slot
```
- Position is read **at most once per app session** and on pull-to-refresh. Coordinates are never stored or sent; only the computed `areaId` is held in memory and sent.
- **Mapping on device:** from `GET /shop/areas` (cached for the session), pick the **most specific area** (district > city > region) whose centre is within its `radiusKm` of the position. None matches → no `areaId`, rail hidden, Why sheet location line says "No sellers listed for your area yet".
- **Slot position:** "Popular near you" sits after "Recommended for you / Popular with…" and before "Essentials" (server order; P1 §5.1 8a).

### 7.2 Invite card and rationale sheet
**Invite card** (key `shop-near-you-invite`): full-width `FFCard` inside the gutter, min height 96: icon `Icons.near_me_outlined` (24, text-strong), title "See what's popular near you", body "Find products from sellers who deliver to your area.", button **"Use my location"** (secondary, sm, ≥48 tall) and a close icon button "Not now" (48 hit area). Not a rail; no products; no Fuel.

**Rationale sheet** (`FFSheet`, key `shop-location-sheet`), shown every time before using location in the shop, even when the OS already allows FitFlex location for gyms:
- Title: "Use your location in the shop?"
- Three short points (icons excluded from semantics):
  1. "Your phone works out your area, such as your city or district."
  2. "Only the area is sent to FitFlex. Your exact location stays on your phone."
  3. "You can turn this off any time in the shop or in Privacy & data."
- When the OS permission is already granted, one more line: "Your phone already lets FitFlex see your location for gyms. We're asking again because the shop is a different use."
- Buttons: **"Use my location"** (primary, full width) · **"Not now"** (ghost).
- Flutter web: same sheet; the browser prompt follows.

Outcomes:

| Outcome | What the user sees |
|---|---|
| Granted, area found | sheet closes; skeleton rail (1 header + 3 cards) in the slot; then the rail, or nothing if <4 items (no message) |
| Granted, no area matches | snackbar "No sellers are listed for your area yet." Slot empty |
| Position unavailable / timeout (10 s) | snackbar "Couldn't find your area. Try again later." Choice stays "on"; retried next session |
| OS denied | snackbar "Location is off, so Popular near you is hidden." Choice = "off" |
| OS denied forever / blocked in browser | snackbar as above with action **"Open settings"** (app settings on phones; on web the action is omitted and the text says "Allow location for this site in your browser settings.") |
| Location services off on the phone | snackbar "Turn on location on your phone to see Popular near you." |
| Offline | invite button disabled with hint "Needs internet" |

### 7.3 "Popular near you" rail and the area badge
- Rail header: icon `Icons.place_outlined`, title "Popular near you" (existing `shop.section.popular_near_you`), Why button. Why reasons: `delivers_to_area` → **"It delivers to your current area."** and `popular_with_role`.
- **Badge "Delivers to your area"** (neutral `FFBadge`, icon `Icons.local_shipping_outlined` excluded from semantics): on the **product details sheet** under the seller line, and on **Results view list tiles**, when the client sent an `areaId` and the product's vendor delivers there. Not on home rail cards (space; the near-you rail implies it). Never a "doesn't deliver" message, and checkout is unchanged (O-8).
- **Distance filter:** with `SHOP_NEAR_YOU` on and `GET /shop/areas` returning areas, the filter sheet field `shop-filter-distance` ("Maximum distance") is **not rendered**, any `maxDistanceKm` query is ignored, and no vendor-typed "{n} km" text shows on product tiles or sheets.

### 7.4 Vendor area pickers (app, `VendorProfileForm`)
After "Address", a section "Where you sell":

| Field | Control | Rule / message |
|---|---|---|
| **Based in** (required once `SHOP_NEAR_YOU` is on; optional before) | tap row → `FFAreaPicker` single mode | Lists cities and districts (not regions or country). Row shows "Based in: {district}, {city}". Missing: "Pick where your business is based." |
| **Delivers to** | tap row → `FFAreaPicker` multi mode | Any level except country. Picking a region or city covers everything beneath it (children shown ticked and disabled, with "Included in {parent}"). Row shows "Delivers to: Dar es Salaam, Arusha (+2)". Empty is allowed: hint "Leave empty if you don't deliver. Buyers can still order and arrange collection." |

`FFAreaPicker` sheet: title, search field ("Search areas"), tree list (indent 16 per level, max 4), rows ≥48 tall, checkbox or radio by mode, a "Selected: …" summary line at the bottom, buttons "Done" / "Cancel". Search filters to matching names and keeps their parents visible. Semantics: row "Kinondoni, district in Dar es Salaam, selected". Empty list (no areas from server) → "Areas aren't set up yet." and the fields hide. Load error → "Couldn't load areas. Try again."

Existing vendors with no "Based in": a one-time `FFAlert` info on the Business tab: "Add where you're based and where you deliver, so buyers nearby find you." + "Add now". Their products still sell; they just don't enter near-you.

---

## 8. S4 — Flash sales

### 8.1 Member: flash sale rail, card and product sheet
P1 §5.1 slot 5, §7.2–7.3, §9 (sale ended live, sale ended in cart), §11.2 apply unchanged. Additions:
- **Source:** only `live` flash sales (DD-P2-6). Rail needs ≥4 items like any rail; with 1–3 live sales there is no rail and the items still show their sale state in other rails and Results.
- **Price display:** sale price 16 w800 Fuel (`#B8452C` light, `#FF8A6B` dark); "was" price 12, struck, muted (slate-500 light 4.76:1 / slate-400 dark 6.96:1), on its own line; Fuel `FFBadge` "−24%". Discount = `floor((regular − sale) / regular × 100)`.
- **Countdown placement:** rail header (P1 §6.1, wraps under the title in Swahili) and on the **product details sheet** under the price: "Sale ends in 2 h 14 min" text (no chips; Fuel text on surface: 5.35:1 light, 7.74:1 dark) and, over 24 h, "Sale ends {weekday} {time}".
- **Results view and list tiles** show the same price block and "−N%" badge.
- **Semantics (load-bearing):**
  - Card/tile: one merged label containing "Sale price {sale}, was {old}, {pct} percent off" (`shop.a11y.salePrice`). The struck `Text` and the badge are excluded so the old price is read once.
  - Countdown container: label at minute precision ("Sale ends in 2 hours 14 minutes"), updated at most once a minute, **not a live region**; chips excluded; one polite announcement "Sale ended" at zero.
  - Over 24 h the label is the visible text ("Sale ends Friday 6:00 pm").

### 8.2 Price-changed sheet (checkout)
**Trigger:** the checkout request carries each line's `expectedPriceTzs`; the server answers `409 price_changed` when any line differs (sale ended, sale started, staff ended a sale, regular price changed).

`FFSheet` key `shop-price-changed`, not dismissible by tapping outside (drag handle and Back = "Back to cart"):
- Title: **"Prices have changed"**
- Body: "Some prices changed after you added them to your cart. Check the new total before you continue."
- One row per changed line (key `price-changed-<productId>[-<variant>]`): image 48, name (2 lines) + variant, then "TSh 85,000" struck/muted and "TSh 69,000" text-strong on the next line, and a reason chip: "Sale ended" · "Sale started" · "Price changed". Unchanged lines are not listed.
- Totals: "Total was {old}" (muted) / **"New total {new}"** (titleMedium w700).
- Buttons: **"Continue with {new total}"** (primary, full width; resends with the new expected prices) · **"Back to cart"** (ghost).
- If the price changes again during the retry, the sheet refreshes in place with a polite announcement "Prices changed again" (no second sheet stacked).
- Semantics: each row one node "{name}, was {old}, now {new}, {reason}"; totals one node "Total was {old}, new total {new}".
- Focus: sheet title → rows → totals → Continue → Back to cart. Opening moves focus to the title.
- Offline during retry: snackbar "No internet connection" and the sheet stays.
- Phone: full-height when >4 rows (rows scroll; buttons pinned). Desktop: 480 wide centred dialog-style sheet.

The P1 "sale ended, item in cart" alert above the cart bar (P1 §9) stays; this sheet is the hard stop at payment.

### 8.3 Vendor: flash sale proposal (app + vendor web portal)
Entry: `/vendor/merch?tab=sales` "Propose a flash sale", and on each product in the vendor Products list/edit form an action **"Start a flash sale"** (pre-fills the product). List, card actions and states as §5.2.2, with the card showing product image, name, "TSh 69,000 · −24%" (Fuel badge), regular price struck, dates.

Form (`/vendor/merch/sale/new`, `/vendor/merch/sale/<id>/edit`):

| # | Field | Control | Rules / messages |
|---|---|---|---|
| 1 | **Product** (required) | own-product picker (active, approved). Out of stock allowed with warning "This product is out of stock. The sale won't show until you add stock." | One flash sale per product at a time: "This product already has a flash sale from {start} to {end}." |
| 2 | **Regular price** | read-only row "Regular price TSh 85,000" (+ "Your current discount price TSh 79,000" when set) | — |
| 3 | **Sale price (TSh)** (required) | numeric `FFTextField`, `TSh` prefix, thousands separator | Live helper under the field, updating on each keystroke: **"24% off · buyers save TSh 16,000"** (Fuel text when valid). Errors: empty/0: "Enter a sale price." · less than 5% off: "The sale price must be at least 5% below the regular price: TSh {max} or less." · not below the current discount price (DD-P2-5): "The sale price must be lower than your current discount price of TSh {discount}." |
| 4 | **Starts** / **Ends** (required) | date + time (Tanzania time) | Start ≥ 1 hour from now; end after start; length 1 hour to 7 days: "A flash sale runs for 1 hour to 7 days." |
| — | **14-day rule** | checked as soon as product + start are set (server `GET …/price-check`), shown inline above the buttons | Pass: nothing extra. Fail: `FFAlert` danger: **"You raised this product's price on {date}. A flash sale can start on {earliest date} or later."** + button "Start on {earliest date}" (sets the start). Submit disabled until it passes. |

Always-visible info `FFAlert` (info) above the buttons:
- "You pay for the discount. Your commission is worked out on the sale price."
- "A flash sale can't start within 14 days of a price rise. While it's scheduled or live, you can't change this product's price."
- "FitFlex reviews every sale. If it isn't reviewed within 14 days, or before it starts, it expires."

Buttons "Send for approval" / "Cancel"; submit, offline and error states as §5.2.3.

**Price lock (DD-P2-4)** in `VendorProductForm`: while a sale is scheduled or live, the Price field is read-only with helper "Locked while your flash sale runs ({start}–{end})." and a link "View sale". Discount price also locked. Stock, variants and other fields stay editable.

### 8.4 Flash sale and other price sources
- During a live flash sale the effective price is the sale price; the product's own `discountPriceTzs` is not shown.
- Phase 1 "Deals" rail (seller discount) excludes products in a live flash sale (no product in two rails, P1 DD-7).
- Promotions/Featured keep their disclosure badge; a product can be featured and on sale (badge order: disclosure under the image, Fuel % badge on the image).

### 8.5 Admin: flash sale detail extras
In the detail (§5.3.2) a **"Price check"** block: regular price now; price history for the last 30 days as a short list ("12 Oct: TSh 80,000 → TSh 85,000 (raised)"); result line with icon + text: "Passes the 14-day rule" (success) or "Fails: price raised on {date}; earliest start {date}" (danger; Approve disabled with that text). Discount line "−24% (TSh 16,000 off), seller pays". If the vendor's product price changed since submission (should be impossible with the lock, but checked): danger alert "The regular price changed since this was sent. Ask the seller to send it again." and Approve disabled.

---

## 9. Navigation

| From | To | Back / after |
|---|---|---|
| Shop home banner CTA (product) | product details sheet, `?product=<id>` | Back closes the sheet |
| Banner CTA (store) | Results view `?vendorId=<id>` titled with the store name | Back → Shop home |
| Flash sale rail "View all" | Results `?section=flash_sale` | Back → Shop home |
| Push "Flash sale" (future) | `?sale=<id>`; ended → home + snackbar "This sale has ended" | — |
| Why sheet → "Privacy & data" (member) | `/member/privacy` | Back → shop |
| Near-you invite → rationale sheet → OS prompt | stays on Shop home | sheet closes itself |
| Price-changed sheet "Continue" | checkout continues → existing success (My orders, snackbar) | "Back to cart" → cart sheet |
| Vendor Products tab tile / portal nav | `/vendor/merch?tab=sales|banners` | Back → Products tab (app) / browser history (portal) |
| Vendor list "Propose…" | form route | Cancel/Back with unsaved changes → dialog "Discard changes?" ("Discard" / "Keep editing"); after send → list with snackbar |
| Vendor notification | `/vendor/merch?item=<id>` (detail sheet over the list) | Back → list |
| Product form "Start a flash sale" | sale form with the product pre-filled | after send → back to the product form |
| Admin sidebar | `/admin/shop-merch?tab=requests` | `?item=` detail; "Back to list" and browser Back return to the same tab and scroll |
| Admin "Create…" | `?new=banner` / `?new=sale` | after create → the new item's detail |

Deep-link guards: a vendor opening another vendor's `?item=` → "This item isn't available" + Back. A member opening `/vendor/merch` → existing role guard.

---

## 10. Copy (English + Swahili)

All Swahili is a **draft for native review** `[SW]`, written against the glossary (trainer stays "trainer", never "mkufunzi"/"kocha"; approve = idhini/kuidhinisha; pending = inasubiri; expired = imeisha muda; failure = "Imeshindikana … Jaribu tena."; no connection = "Hakuna intaneti"; "gusa" in the app, "bonyeza" in the portal; banner = bango/mabango; delivery stays English). Keys are proposals for `i18n-swahili-auditor`. Mobile keys live in `lib/shared/i18n.dart`, portal keys in `src/lib/i18n.ts`; shared wording should match between them.

**Fix to existing copy (P1 / built):** `shop.why.deliversToArea` EN "It delivers to the area in your profile." → **"It delivers to your current area."**; SW "Ina delivery kwenye eneo lililo kwenye wasifu wako." → **"Ina delivery kwenye eneo ulipo sasa."** [SW]. The P1 spec table (§10.6) still lists `shop.why.roleTrainer` SW as "Unanunua kama mkufunzi" and `offTrainer` with "mkufunzi"; the built app already says "trainer" — the P1 spec text should be corrected to "Unanunua kama trainer." when fitflex#65 is next updated.

Swahili length check: the longest new strings run +20–45% (e.g. "Mabango na ofa za muda mfupi" vs "Banners & flash sales" +33%). Every label in §10 wraps; nothing is truncated except product names (2 lines).

### 10.1 Banners (member)
| Key | EN | SW [SW] |
|---|---|---|
| `shop.banner.from` | From {vendor} | Kutoka {vendor} |
| `shop.banner.cta.viewProduct` | View product | Tazama bidhaa |
| `shop.banner.cta.visitStore` | Visit store | Tembelea duka |
| `shop.banner.cta.shopNow` (= `shop.home.shopNow`) | Shop now | Nunua sasa |
| `shop.banner.cta.seeSale` | See the sale | Tazama ofa |
| `shop.banner.cta.viewAll` (= `shop.home.viewAll`) | View all | Tazama zote |
| `shop.home.bannerOf` | Banner {n} of {total} | Bango {n} kati ya {total} |
| `shop.home.prevBanner` / `nextBanner` | Previous banner / Next banner | Bango lililotangulia / Bango linalofuata |

(P1 §10.1 had "Tangazo" for these three; replace with "Bango" per O-10.)

### 10.2 Vendor: lists and states (app + portal)
| Key | EN | SW [SW] |
|---|---|---|
| `merch.entry.title` | Banners & flash sales | Mabango na ofa za muda mfupi |
| `merch.entry.subtitle` | Promote your products in the FitFlex shop | Tangaza bidhaa zako kwenye duka la FitFlex |
| `merch.entry.waiting` | {n} waiting for approval | {n} zinasubiri idhini |
| `merch.nav` (portal) | Banners & sales | Mabango na ofa |
| `merch.tab.sales` / `merch.tab.banners` | Flash sales / Banners | Ofa za muda mfupi / Mabango |
| `merch.group.live` / `scheduled` / `waiting` / `past` | Live / Scheduled / Waiting for approval / Past | Zinaendelea / Zimepangwa / Zinasubiri idhini / Zilizopita |
| `merch.status.pending` | Waiting for approval | Inasubiri idhini |
| `merch.status.approved` | Scheduled | Imepangwa |
| `merch.status.live` | Live | Inaendelea |
| `merch.status.ended` | Ended | Imeisha |
| `merch.status.rejected` | Rejected | Imekataliwa |
| `merch.status.expired` | Expired | Imeisha muda |
| `merch.status.withdrawn` | Withdrawn | Imeondolewa |
| `merch.line.expires` | Expires {date} if not reviewed | Itaisha muda {date} isipokaguliwa |
| `merch.line.starts` / `ends` / `endedOn` | Starts {date} / Ends {date} / Ended {date} | Inaanza {date} / Inaisha {date} / Iliisha {date} |
| `merch.line.endedByFitflex` | Ended by FitFlex: {reason} | Imesimamishwa na FitFlex: {reason} |
| `merch.line.reason` | Reason: {reason} | Sababu: {reason} |
| `merch.line.notReviewed` | Not reviewed in time | Haikukaguliwa kwa wakati |
| `merch.line.youWithdrew` | You withdrew this | Uliiondoa |
| `merch.line.linksProduct` / `linksStore` | Links to: {product} / Links to: your store | Inaelekeza: {product} / Inaelekeza: duka lako |
| `merch.line.shownTo` | Shown to: {audiences} | Inaonyeshwa kwa: {audiences} |
| `merch.line.hiddenOos` | Hidden while {product} is out of stock | Imefichwa wakati {product} imeisha |
| `merch.audience.member` / `trainer` / `owner` | Members / Trainers / Gym owners | Wanachama / Ma-trainer / Wamiliki wa gym |
| `merch.action.edit` / `withdraw` / `endNow` / `copy` / `showMore` | Edit / Withdraw / End now / Copy to new / Show more | Hariri / Ondoa / Simamisha sasa / Nakili kuwa mpya / Onyesha zaidi |
| `merch.banners.title` / `propose` | Banners / Propose a banner | Mabango / Pendekeza bango |
| `merch.banners.emptyTitle` / `emptyBody` | No banners yet / Propose a banner to show your products at the top of the FitFlex shop. | Bado hakuna mabango / Pendekeza bango ili bidhaa zako zionekane juu kwenye duka la FitFlex. |
| `merch.banners.error` | Banners didn't load | Mabango hayakupakia |
| `merch.sales.title` / `propose` | Flash sales / Propose a flash sale | Ofa za muda mfupi / Pendekeza ofa ya muda mfupi |
| `merch.sales.emptyTitle` / `emptyBody` | No flash sales yet / Run a short sale on one of your products. FitFlex shows it with a countdown. | Bado hakuna ofa za muda mfupi / Weka ofa fupi kwa bidhaa yako moja. FitFlex itaionyesha pamoja na muda unaohesabika. |
| `merch.sales.error` | Flash sales didn't load | Ofa hazikupakia |
| `merch.offlineTitle` / `offlineBody` | No internet connection / Connect to see your banners and sales. | Hakuna intaneti / Unganisha intaneti uone mabango na ofa zako. |
| `merch.needsInternet` | Needs internet | Inahitaji intaneti |
| `merch.pendingTitle` / `pendingBody` | Available once your business is approved / You can propose banners and flash sales after FitFlex approves your business. | Itapatikana biashara yako ikiidhinishwa / Utaweza kupendekeza mabango na ofa baada ya FitFlex kuidhinisha biashara yako. |
| `merch.suspended` | Your account is suspended. Your banners and flash sales are not shown in the shop. | Akaunti yako imesimamishwa. Mabango na ofa zako hazionyeshwi dukani. |
| `merch.unavailable` | This tool isn't available yet | Huduma hii bado haipatikani |
| `merch.notYours` | This item isn't available | Kipengee hiki hakipatikani |
| `merch.sent` | Sent for approval | Imetumwa kwa idhini |
| `merch.notSentOffline` | No internet connection. It wasn't sent. | Hakuna intaneti. Haijatumwa. |
| `merch.withdraw.title` / `body` / `confirm` / `keep` | Withdraw this? / It won't be reviewed or shown. / Withdraw / Keep | Uiondoe? / Haitakaguliwa wala kuonyeshwa. / Ondoa / Iache |
| `merch.endBanner.title` / `body` | End this banner now? / It leaves the shop within a minute. | Usimamishe bango hili sasa? / Litaondoka dukani ndani ya dakika moja. |
| `merch.endSale.title` / `body` | End this sale now? / Buyers pay the regular price from now. | Usimamishe ofa hii sasa? / Wanunuzi watalipa bei ya kawaida kuanzia sasa. |
| `merch.resend.title` / `body` / `confirm` | Send back for approval? / It won't go live until FitFlex approves it again. / Send again | Itume tena kwa idhini? / Haitaanza hadi FitFlex iidhinishe tena. / Tuma tena |
| `merch.discard.title` / `confirm` / `keep` | Discard changes? / Discard / Keep editing | Uache mabadiliko? / Acha / Endelea kuhariri |
| `merch.reviewNote` | FitFlex reviews every {banner / sale}. If it isn't reviewed within 14 days, or before it starts, it expires. | FitFlex hukagua kila {bango / ofa}. Isipokaguliwa ndani ya siku 14, au kabla ya kuanza, itaisha muda. |
| `merch.send` | Send for approval | Tuma kwa idhini |

### 10.3 Vendor: banner form
| Key | EN | SW [SW] |
|---|---|---|
| `merch.banner.image` / `imageHelp` | Image / Show the product. No prices, phone numbers or text in the photo. | Picha / Onyesha bidhaa. Usiweke bei, namba za simu wala maandishi kwenye picha. |
| `merch.banner.imageType` | Use a JPG, PNG or WebP image. | Tumia picha ya JPG, PNG au WebP. |
| `merch.banner.imageSize` | The image must be at least 1600 × 1000 pixels. | Picha iwe angalau pikseli 1600 × 1000. |
| `merch.banner.imageWeight` | The image must be 5 MB or smaller. | Picha isizidi MB 5. |
| `merch.banner.uploadFailed` | Upload failed. Try again. | Imeshindikana kupakia. Jaribu tena. |
| `merch.banner.people` / `peopleNone` / `peopleModels` | People in the photo / No people / Models showing the product | Watu kwenye picha / Hakuna watu / Wanamitindo wanaoonyesha bidhaa |
| `merch.banner.rights` | I have the right to use this image, and FitFlex may show it in its apps and portal. | Nina haki ya kutumia picha hii, na FitFlex inaweza kuionyesha kwenye app na portal zake. |
| `merch.banner.modelsConfirm` | The people are models showing the product. The banner does not present them as FitFlex members, trainers or partners, and has no names or quotes from them. | Watu hawa ni wanamitindo wanaoonyesha bidhaa. Bango haliwaonyeshi kama wanachama, ma-trainer au washirika wa FitFlex, na halina majina wala maneno yao. |
| `merch.confirmRequired` | Tick this box to confirm. | Weka alama kwenye kisanduku hiki kuthibitisha. |
| `merch.banner.lead` / `accent` / `accentHelp` | Headline: first part / Headline: highlighted words / Shown in the accent colour. 1 to 3 words. | Kichwa: sehemu ya kwanza / Kichwa: maneno ya kuangaziwa / Yanaonyeshwa kwa rangi maalum. Maneno 1 hadi 3. |
| `merch.banner.subline` | Subline (optional) | Maelezo mafupi (si lazima) |
| `merch.field.en` / `sw` | English / Kiswahili | Kiingereza / Kiswahili |
| `merch.banner.tooLong` | Keep the headline to {n} characters. | Kichwa kisizidi herufi {n}. |
| `merch.banner.otherLanguage` | Add the {language} text too. | Ongeza maandishi ya {language} pia. |
| `merch.banner.target` / `targetProduct` / `targetStore` | Links to / One of my products / My store | Inaelekeza / Bidhaa yangu moja / Duka langu |
| `merch.banner.button` | Button: {label} | Kitufe: {label} |
| `merch.banner.showTo` / `pickOne` | Show to / Pick at least one. | Ionyeshwe kwa / Chagua angalau mmoja. |
| `merch.dates.starts` / `ends` / `tzNote` | Starts / Ends / Tanzania time | Inaanza / Inaisha / Saa za Tanzania |
| `merch.dates.startSoon` | Pick a start at least an hour from now. | Chagua muda wa kuanza angalau saa moja kuanzia sasa. |
| `merch.dates.endAfter` | The end must be after the start. | Mwisho uwe baada ya mwanzo. |
| `merch.banner.maxDays` | A banner can run for up to 30 days. | Bango linaweza kukaa hadi siku 30. |
| `merch.banner.noPrices` | Banners can't show prices or discounts. Use a flash sale for a deal. | Mabango hayawezi kuonyesha bei wala punguzo. Tumia ofa ya muda mfupi kwa punguzo. |
| `merch.banner.noLinks` | Remove links and phone numbers. | Ondoa viungo na namba za simu. |
| `merch.banner.preview` / `previewA11y` | Preview / Preview of your banner | Hakiki / Hakiki ya bango lako |
| `merch.preview.light` / `dark` | Light / Dark | Mwanga / Giza |

### 10.4 Vendor: flash sale form and price lock
| Key | EN | SW [SW] |
|---|---|---|
| `merch.sale.product` | Product | Bidhaa |
| `merch.sale.oos` | This product is out of stock. The sale won't show until you add stock. | Bidhaa hii imeisha. Ofa haitaonekana hadi uongeze Stock. |
| `merch.sale.overlap` | This product already has a flash sale from {start} to {end}. | Bidhaa hii tayari ina ofa ya muda mfupi kuanzia {start} hadi {end}. |
| `merch.sale.regular` / `currentDiscount` | Regular price {price} / Your current discount price {price} | Bei ya kawaida {price} / Bei yako ya punguzo ya sasa {price} |
| `merch.sale.price` | Sale price (TSh) | Bei ya ofa (TSh) |
| `merch.sale.live` | {pct}% off · buyers save {saving} | Punguzo la {pct}% · wanunuzi wanaokoa {saving} |
| `merch.sale.enterPrice` | Enter a sale price. | Weka bei ya ofa. |
| `merch.sale.min5` | The sale price must be at least 5% below the regular price: {max} or less. | Bei ya ofa iwe chini ya bei ya kawaida kwa angalau 5%: {max} au chini zaidi. |
| `merch.sale.belowDiscount` | The sale price must be lower than your current discount price of {discount}. | Bei ya ofa iwe chini ya bei yako ya punguzo ya sasa, {discount}. |
| `merch.sale.length` | A flash sale runs for 1 hour to 7 days. | Ofa ya muda mfupi hudumu saa 1 hadi siku 7. |
| `merch.sale.raised` | You raised this product's price on {date}. A flash sale can start on {earliest} or later. | Uliongeza bei ya bidhaa hii tarehe {date}. Ofa ya muda mfupi inaweza kuanza {earliest} au baadaye. |
| `merch.sale.startOn` | Start on {date} | Anza {date} |
| `merch.sale.youPay` | You pay for the discount. Your commission is worked out on the sale price. | Wewe unalipia punguzo. Kamisheni yako inahesabiwa kwa bei ya ofa. |
| `merch.sale.rule14` | A flash sale can't start within 14 days of a price rise. While it's scheduled or live, you can't change this product's price. | Ofa ya muda mfupi haiwezi kuanza ndani ya siku 14 baada ya kuongeza bei. Ikiwa imepangwa au inaendelea, huwezi kubadilisha bei ya bidhaa hii. |
| `merch.sale.start` (product action) | Start a flash sale | Anzisha ofa ya muda mfupi |
| `vendor.priceLocked` | Locked while your flash sale runs ({start}–{end}). | Imefungwa wakati ofa yako inaendelea ({start}–{end}). |
| `vendor.viewSale` | View sale | Tazama ofa |

### 10.5 Vendor: product target fields and areas
| Key | EN | SW [SW] |
|---|---|---|
| `vendor.target.title` / `hint` | Who it's for (optional) / Helps FitFlex show it first to the right members. Everyone can still find and buy it. | Ni kwa ajili ya nani (si lazima) / Inasaidia FitFlex kuionyesha kwanza kwa wanachama wanaofaa. Kila mtu bado anaweza kuiona na kuinunua. |
| `vendor.target.madeFor` | Made for | Imetengenezwa kwa |
| `vendor.target.everyone` / `women` / `men` | Everyone / Women / Men | Wote / Wanawake / Wanaume |
| `vendor.target.ageGroup` | Age group | Kundi la umri |
| `vendor.target.allAges` | All ages | Umri wote |
| `vendor.target.band.18_29` … `60_plus` | 18–29 / 30–44 / 45–59 / 60+ | same digits |
| `vendor.target.a11yBand` | {from} to {to} | {from} hadi {to} |
| `vendor.areas.title` | Where you sell | Unapouzia |
| `vendor.areas.basedIn` / `basedInRow` / `basedInMissing` | Based in / Based in: {area} / Pick where your business is based. | Ipo / Ipo: {area} / Chagua mahali biashara yako ilipo. |
| `vendor.areas.deliversTo` / `deliversRow` / `deliversMore` | Delivers to / Delivers to: {areas} / (+{n}) | Ina delivery hadi / Ina delivery hadi: {areas} / (+{n}) |
| `vendor.areas.deliversEmpty` | Leave empty if you don't deliver. Buyers can still order and arrange collection. | Acha wazi kama huna delivery. Wanunuzi bado wanaweza kuagiza na kupanga kuchukua. |
| `vendor.areas.included` | Included in {parent} | Imo ndani ya {parent} |
| `vendor.areas.search` / `selected` / `done` | Search areas / Selected: {areas} / Done | Tafuta maeneo / Uliyochagua: {areas} / Maliza |
| `vendor.areas.a11yRow` | {area}, {level} in {parent} | {area}, {level} ndani ya {parent} |
| `vendor.areas.level.region` / `city` / `district` | region / city / district | mkoa / jiji / wilaya |
| `vendor.areas.none` / `failed` | Areas aren't set up yet. / Couldn't load areas. Try again. | Maeneo bado hayajawekwa. / Imeshindikana kupakia maeneo. Jaribu tena. |
| `vendor.areas.nudge` / `nudgeAction` | Add where you're based and where you deliver, so buyers nearby find you. / Add now | Ongeza mahali ulipo na unapopeleka delivery, ili wanunuzi walio karibu wakupate. / Ongeza sasa |

### 10.6 Personalisation (Why sheet, Privacy)
| Key | EN | SW [SW] |
|---|---|---|
| `shop.why.switch` | Personalised shop | Duka kwa ajili yako |
| `shop.why.switchHintMember` | Use my purchases, my profile's gender and age, and my current area to order the shop for me. | Tumia manunuzi yangu, jinsia na umri kwenye wasifu wangu, na eneo nililopo sasa kupanga duka kwa ajili yangu. |
| `shop.why.switchHintPartner` | Use my purchases and my current area to order the shop for me. | Tumia manunuzi yangu na eneo nililopo sasa kupanga duka kwa ajili yangu. |
| `shop.why.age` | The age in your profile. | Umri ulioweka kwenye wasifu wako. |
| `shop.why.deliversToArea` (fixed) | It delivers to your current area. | Ina delivery kwenye eneo ulipo sasa. |
| `shop.why.saved` | Shop updated | Duka limesasishwa |
| `shop.why.saveFailed` | Couldn't save. Try again. | Imeshindikana kuhifadhi. Jaribu tena. |
| `shop.why.loadFailed` | Couldn't load your setting | Imeshindikana kupakia mpangilio wako |
| `shop.why.privacyLink` | Privacy & data | Faragha na data (= `privacy.title`) |
| `shop.why.nearOn` / `nearOff` / `nearNoArea` | Popular near you: On · {area} / Popular near you: Off / No sellers listed for your area yet | Maarufu karibu nawe: Imewashwa · {area} / Maarufu karibu nawe: Imezimwa / Bado hakuna wauzaji kwenye eneo lako |
| `shop.why.turnOn` / `turnOff` | Turn on / Turn off | Washa / Zima |
| `privacy.shop.title` / `on` / `off` | Personalised shop / On / Off | Duka kwa ajili yako / Imewashwa / Imezimwa |
| `privacy.shop.usesTitle` | What we use | Tunachotumia |
| `privacy.shop.uses1` | What you bought on FitFlex in the last year | Ulichonunua kwenye FitFlex mwaka uliopita |
| `privacy.shop.uses2` | Gender and age from your profile, to show tagged products first (never used for under-18s) | Jinsia na umri kwenye wasifu wako, kuonyesha kwanza bidhaa zilizowekewa lebo (hazitumiki kwa walio chini ya miaka 18) |
| `privacy.shop.uses3` | Your current area, only if you allow location | Eneo ulipo sasa, ukiruhusu mahali ulipo tu |
| `privacy.shop.never` | We never use your activity, health, training or company data. | Hatutumii kamwe data za shughuli, afya, mazoezi au kampuni yako. |
| `privacy.shop.draft` | This text is a draft and may change. | Maandishi haya ni rasimu na yanaweza kubadilika. |

### 10.7 Near you
| Key | EN | SW [SW] |
|---|---|---|
| `shop.near.inviteTitle` | See what's popular near you | Ona kinachopendwa karibu nawe |
| `shop.near.inviteBody` | Find products from sellers who deliver to your area. | Pata bidhaa kutoka kwa wauzaji wenye delivery kwenye eneo lako. |
| `shop.near.use` | Use my location | Tumia mahali nilipo |
| `shop.near.notNow` | Not now | Si sasa |
| `shop.near.sheetTitle` | Use your location in the shop? | Tumia mahali ulipo dukani? |
| `shop.near.point1` | Your phone works out your area, such as your city or district. | Simu yako inatambua eneo lako, kama jiji au wilaya yako. |
| `shop.near.point2` | Only the area is sent to FitFlex. Your exact location stays on your phone. | FitFlex inapokea eneo tu. Mahali hasa ulipo panabaki kwenye simu yako. |
| `shop.near.point3` | You can turn this off any time in the shop or in Privacy & data. | Unaweza kuzima hili wakati wowote dukani au kwenye Faragha na data. |
| `shop.near.alreadyAllowed` | Your phone already lets FitFlex see your location for gyms. We're asking again because the shop is a different use. | Simu yako tayari inairuhusu FitFlex kuona mahali ulipo kwa ajili ya gym. Tunauliza tena kwa sababu duka ni matumizi tofauti. |
| `shop.near.noArea` | No sellers are listed for your area yet. | Bado hakuna wauzaji walioorodheshwa kwenye eneo lako. |
| `shop.near.failed` | Couldn't find your area. Try again later. | Imeshindikana kupata eneo lako. Jaribu tena baadaye. |
| `shop.near.denied` | Location is off, so Popular near you is hidden. | Mahali ulipo pamezimwa, kwa hiyo "Maarufu karibu nawe" imefichwa. |
| `shop.near.openSettings` | Open settings | Fungua mipangilio |
| `shop.near.browserBlocked` | Allow location for this site in your browser settings. | Ruhusu mahali ulipo kwa tovuti hii kwenye mipangilio ya kivinjari. |
| `shop.near.servicesOff` | Turn on location on your phone to see Popular near you. | Washa mahali ulipo kwenye simu yako uone "Maarufu karibu nawe". |
| `shop.near.badge` | Delivers to your area | Ina delivery eneo lako |

### 10.8 Flash sale (member) and price-changed sheet
| Key | EN | SW [SW] |
|---|---|---|
| `shop.sale.endsIn` | Sale ends in {h} h {m} min | Ofa inaisha baada ya saa {h} dakika {m} |
| `shop.sale.endsInMin` | Sale ends in {m} min | Ofa inaisha baada ya dakika {m} |
| `shop.sale.endsOn` | Sale ends {day} {time} | Ofa inaisha {day} {time} |
| `shop.sale.gone` | This sale has ended | Ofa hii imeisha |
| `shop.priceChanged.title` | Prices have changed | Bei zimebadilika |
| `shop.priceChanged.body` | Some prices changed after you added them to your cart. Check the new total before you continue. | Baadhi ya bei zimebadilika baada ya kuziweka kwenye kikapu. Angalia jumla mpya kabla ya kuendelea. |
| `shop.priceChanged.saleEnded` / `saleStarted` / `changed` | Sale ended / Sale started / Price changed | Ofa imeisha / Ofa imeanza / Bei imebadilika |
| `shop.priceChanged.totalWas` / `newTotal` | Total was {total} / New total {total} | Jumla ilikuwa {total} / Jumla mpya {total} |
| `shop.priceChanged.continue` | Continue with {total} | Endelea na {total} |
| `shop.priceChanged.back` | Back to cart | Rudi kwenye kikapu |
| `shop.priceChanged.again` | Prices changed again | Bei zimebadilika tena |
| `shop.a11y.priceChangedRow` | {name}, was {old}, now {new}, {reason} | {name}, ilikuwa {old}, sasa {new}, {reason} |
| `shop.a11y.priceChangedTotal` | Total was {old}, new total {new} | Jumla ilikuwa {old}, jumla mpya {new} |

Reused: `shop.a11y.salePrice`, `shop.a11y.countdown`, `shop.a11y.countdownMinutes`, `shop.home.saleEnded`, `shop.home.flashSale` ("Ofa ya muda mfupi"), `shop.home.productGone`, `common.retry`.

### 10.9 Admin merch queue (portal; "bonyeza" wording if any instruction is needed)
| Key | EN | SW [SW] |
|---|---|---|
| `admin.nav.shopMerch` | Banners & flash sales | Mabango na ofa za muda mfupi |
| `merchAdmin.title` / `description` | Shop banners & flash sales / Review what sellers propose for the shop home. You can't approve something you created. | Mabango na ofa za duka / Kagua wanachopendekeza wauzaji kwa ukurasa wa duka. Huwezi kuidhinisha ulichokiunda mwenyewe. |
| `merchAdmin.createBanner` / `createSale` | Create banner / Create flash sale | Unda bango / Unda ofa ya muda mfupi |
| `merchAdmin.tab.requests` / `scheduled` / `live` / `closed` | Requests / Scheduled / Live / Closed | Maombi / Zilizopangwa / Zinaendelea / Zilizofungwa |
| `merchAdmin.type.all` / `banner` / `sale` | All / Banners / Flash sales | Zote / Mabango / Ofa za muda mfupi |
| `merchAdmin.col.item` / `type` / `seller` / `dates` / `discount` / `status` / `sent` | Item / Type / Seller / Dates / Discount / Status / Sent | Kipengee / Aina / Muuzaji / Tarehe / Punguzo / Hali / Ilitumwa |
| `merchAdmin.expiresIn` | Expires in {n} days | Itaisha muda baada ya siku {n} |
| `merchAdmin.empty.requests` / `scheduled` / `live` / `closed` | No requests waiting / Nothing scheduled / Nothing live / Nothing closed yet | Hakuna maombi yanayosubiri / Hakuna kilichopangwa / Hakuna kinachoendelea / Bado hakuna kilichofungwa |
| `merchAdmin.sellerFitflex` | FitFlex | FitFlex |
| `merchAdmin.sellerSuspended` | Seller suspended | Muuzaji amesimamishwa |
| `merchAdmin.confirmedBy` | Confirmed by {name}, {date} | Imethibitishwa na {name}, {date} |
| `merchAdmin.approve` / `reject` / `end` | Approve / Reject / End now | Idhinisha / Kataa / Simamisha sasa |
| `merchAdmin.check.people` | No one is presented as a FitFlex member, trainer or partner. | Hakuna mtu anayeonyeshwa kama mwanachama, trainer au mshirika wa FitFlex. |
| `merchAdmin.check.text` | No prices, discounts, phone numbers or links in the image or text. | Hakuna bei, punguzo, namba za simu wala viungo kwenye picha au maandishi. |
| `merchAdmin.check.languages` | Both languages say the same thing. | Lugha zote mbili zinasema kitu kimoja. |
| `merchAdmin.check.sale` | The product and price look right. | Bidhaa na bei ziko sawa. |
| `merchAdmin.reason.image` / `people` / `text` / `claim` / `link` / `other` | Image quality / People framed as members or partners / Text or prices in the image / Misleading claim / Wrong link or product / Other | Ubora wa picha / Watu wameonyeshwa kama wanachama au washirika / Maandishi au bei kwenye picha / Dai linalopotosha / Kiungo au bidhaa si sahihi / Nyingine |
| `merchAdmin.reason.note` / `noteHint` | Note / The seller sees this reason. | Maelezo / Muuzaji ataona sababu hii. |
| `merchAdmin.end.bannerHint` / `saleHint` | It leaves the shop within a minute. / Buyers pay the regular price from now. Carts with this item will show the new price at checkout. | Litaondoka dukani ndani ya dakika moja. / Wanunuzi watalipa bei ya kawaida kuanzia sasa. Vikapu vyenye bidhaa hii vitaonyesha bei mpya wakati wa kulipa. |
| `merchAdmin.ownItem` | You created this, so another admin must approve it. | Wewe ndiye uliyeunda hiki, kwa hiyo admin mwingine lazima akiidhinishe. |
| `merchAdmin.noApprove` | You can view this. Approving needs the "Approve promotions" permission. | Unaweza kuona hiki. Kuidhinisha kunahitaji ruhusa ya "Kuidhinisha promosheni". |
| `merchAdmin.priceCheck` / `pass` / `fail` | Price check / Passes the 14-day rule / Fails: price raised on {date}; earliest start {earliest} | Ukaguzi wa bei / Inakidhi sheria ya siku 14 / Haikidhi: bei iliongezwa {date}; mwanzo wa mapema {earliest} |
| `merchAdmin.priceMoved` | The regular price changed since this was sent. Ask the seller to send it again. | Bei ya kawaida imebadilika tangu hiki kitumwe. Mwombe muuzaji akitume tena. |
| `merchAdmin.sellerPays` | −{pct}% ({saving} off), seller pays | −{pct}% (punguzo {saving}), muuzaji analipia |
| `merchAdmin.done.approved` / `rejected` / `ended` | Approved / Rejected / Ended | Imeidhinishwa / Imekataliwa / Imesimamishwa |
| `merchAdmin.capacity` | {audience} already have 5 live banners from {start} to {end}. End one or pick other dates. | {audience} tayari wana mabango 5 yanayoendelea kuanzia {start} hadi {end}. Simamisha moja au chagua tarehe nyingine. |

---

## 11. Accessibility

### 11.1 Targets and contrast
- Every control ≥48×48 (≥44 absolute minimum): banner CTA 48, carousel arrows 48, dots 44, invite card button 48 and close 48, sheet buttons 48, chips 48, picker rows 48, card text actions 48, portal buttons `min-h-11` (44) or more, table rows ≥44.
- New contrast (WCAG 2.x, computed 2026-10-20): "From {vendor}" chip white on slate-950 75% over a pure-white photo **9.68:1**; Fuel text on white **5.35:1**, on portal Calm **4.91:1**; `#FF8A6B` on slate-900 **7.74:1**, on slate-800 **6.34:1**; white on Fuel badge **5.35:1**; struck price slate-500/white **4.76:1**, slate-400/slate-900 **6.96:1**; Fuel on Fuel-50 tint **4.95:1** (if a Fuel-tinted helper box is used). Hero text per P1 §4 / PH §5.
- **No Volt on light surfaces** (vendor preview "Light" toggle shows the green accent; Volt only in "Dark").

### 11.2 Semantics (Flutter web accessibility tree; every actionable control labelled in both languages)
- Banner slide: "From {vendor}. {headline}. {subline}. Banner {n} of {total}" (no "From" for staff banners); CTA its own button; image excluded.
- Countdown, struck price: §8.1.
- Invite card: header node "See what's popular near you"; button "Use my location"; close "Not now".
- Rationale sheet: title is a header; points are one text node each; icons excluded.
- Switches: label "Personalised shop", hint read as description, value On/Off.
- Vendor status badges are text; card actions labelled with the item ("Withdraw banner {headline}", "End sale on {product}").
- Live % helper is a polite live region, **debounced to 500 ms** after typing stops (not on every key).
- 14-day alert: announced once when it appears (assertive is not used).
- Area picker rows: §7.4.
- Portal: tables have `aria-label`; tabs `role=tab` + `aria-selected` (existing pattern); dialogs trap focus and return it to the opener; disabled Approve has `aria-describedby` pointing at the visible "You created this…" text.

### 11.3 Focus order
- **Shop home:** P1 §11.3 / PH §32.5, with: banner slide (CTA) → arrows → … rails … where the near-you slot sits: invite card button → Not now (or the rail).
- **Rationale sheet:** title → points → Use my location → Not now. Opens with focus on the title; closing returns focus to the invite card button (or the Why sheet "Turn on").
- **Price-changed sheet:** §8.2.
- **Vendor list:** segment → Propose → groups in order → per card: open → actions left to right.
- **Vendor banner form:** image → focal point → people → confirmations → headline EN → SW → accent EN → SW → subline EN → SW → links to → product picker → show to → starts → ends → preview toggles → Send → Cancel. On a failed submit, focus moves to the first invalid field and its message is announced.
- **Vendor sale form:** product → sale price → starts → ends → 14-day alert action (when shown) → Send → Cancel.
- **Admin detail:** Back to list → preview toggles → details → price check → actions (Approve, Reject, End) → history.

### 11.4 Text scale, motion, themes
- 130% app-wide cap (owner): design-qa checks at 100% and 130%, Swahili, 375 px, both themes; nothing clipped. Vendor form EN/SW field pairs stack vertically on phone at any scale.
- Reduced motion: no slide animation, no countdown digit animation, sheets appear without spring.
- Light + dark for all app screens; portal light (Calm canvas) + dark sidebar per V2.

---

## 12. Layout summary (phone ~375 / Flutter web desktop)

| Screen | Phone 375 | Desktop (≥1024; Flutter web or portal) |
|---|---|---|
| Shop home additions | P1 §6.1; invite card full width in the 16 gutter | P1 §6.2; invite card ≤ 560 wide, left-aligned in the 1200 column |
| Rationale / Why / Personalised shop / price-changed sheets | bottom sheet, full width, ≤ 90% height | centred sheet 480 wide |
| Vendor merch list | single column cards | ≤ 960 column, 2-column grid |
| Vendor forms | single column; EN above SW | form 560 + sticky preview 400 |
| Area picker | full-height sheet | 480 wide dialog sheet, list max 60vh |
| Admin queue | stacked row cards | table in Card; detail 2 columns (8/4) |

---

## 13. Backend fields needed (for `fitflex-planner` / `contract-checker` to confirm)

Nothing below exists unless marked **exists**. Names are suggestions; shape is what matters.

**Exists, reused:** `GeoArea {id, level: country|region|city|district, name, parentId, lat, lng, radiusKm, active}` (moderation-promotion migration); `memberProfile.gender` (`male|female|other`) and `memberProfile.dateOfBirth`; `ShopProduct.priceTzs`, `discountPriceTzs`, `vendorId`, `variants[]` (variants share the product price); `/shop/home` sections + `reasonCodes` + `serverNow`; Results `vendorId` query; `promotions_approve` scope and the `cannot_approve_own_submission` pattern; vendor `me.permissions` (`products`) and `me.tools`; image upload pipeline (HeroImage) and focal point.

| # | Slice | Need | Proposed shape |
|---|---|---|---|
| B-P2-1 | S1 | Banner entity | `ShopBanner {id, source: vendor|staff, vendorId?, image {url, width, height, focal{x,y}}, people: none|product_models, rightsConfirmedBy/At, peopleConfirmedBy/At?, headlineLead{en,sw}, headlineAccent{en,sw}, subline{en,sw}?, target {type: product|store|category|section|sale|results, value}, ctaKey, audienceRoles[], startsAt, endsAt, status (§4.1), submittedAt, submittedBy, createdBy, expiresAt, decidedBy/At, rejectReason {code, note}, endedBy/At, endedReason, history[]}` |
| B-P2-2 | S1 | Banners in the home feed | `GET /shop/home` → `banners[]: {id, imageUrl, focal, headlineLead, headlineAccent, subline?, ctaKey, target, from: {vendorName}|null}` already resolved to the request language or `{en,sw}`; only `live`, for the token's active role, target still valid, vendor not suspended, max 5 |
| B-P2-3 | S1+S4 | Vendor endpoints | `GET/POST /vendor/shop-banners`, `PATCH /:id`, `POST /:id/withdraw`, `POST /:id/end`; same for `/vendor/flash-sales`; `GET /vendor/flash-sales/price-check?productId&startsAt` → `{ok, raisedOn?, earliestStart?}` |
| B-P2-4 | S1+S4 | Admin endpoints | `GET /admin/shop-merch?tab&type&q`, `GET /:id` (incl. history, price history for sales), `POST /:id/approve {checks[]}`, `POST /:id/reject {code, note}`, `POST /:id/end {reason}`, `POST /admin/shop-merch {type, …}` |
| B-P2-5 | S2 | Preference | `ShopPreference {userId, personalised: boolean = true}`; `GET/PUT /me/shop-preferences`; `/shop/home` returns `personalisation: {enabled, available}` (`available` = flag on) |
| B-P2-6 | S2 | Product targets | `Product.targetGender: 'women'|'men'|null` (null = everyone); `Product.targetAgeBands: ('18_29'|'30_44'|'45_59'|'60_plus')[]` (empty = all ages); accepted on vendor create/update |
| B-P2-7 | S2 | Reasons | add `profile_age`; `profile_gender`/`profile_age` only when actually applied; never in member under-18 or non-member modes |
| B-P2-8 | S3 | Areas for the app | `GET /shop/areas` → `[{id, level, name, parentId, lat, lng, radiusKm}]` (active only), cacheable |
| B-P2-9 | S3 | Vendor areas | `VendorProfile.baseAreaId` (city or district), `deliveryAreaIds[]` (any level except country); on `/vendor/me` + profile update |
| B-P2-10 | S3 | Area in requests | `/shop/home?areaId=` and Results `?areaId=`; server **never logs or stores** it (security review); items carry `deliversToArea: boolean` when an `areaId` was sent |
| B-P2-11 | S4 | Flash sale entity | `FlashSale {id, vendorId, productId, salePriceTzs, regularPriceTzsAtSubmit, startsAt, endsAt, status, …same audit fields as B-P2-1}` |
| B-P2-12 | S4 | Price history | per product: `priceChanges[] {at, fromTzs, toTzs}` (or `lastPriceRaiseAt`) for the 14-day rule and the admin price check |
| B-P2-13 | S4 | Feed + product sale state | items: `sale {id, salePriceTzs, regularPriceTzs, pct, endsAt}`; `flash_sale` section; `serverNow` (exists) |
| B-P2-14 | S4 | Checkout guard | request lines `expectedPriceTzs`; `409 {error: 'price_changed', lines: [{productId, variant?, expectedPriceTzs, currentPriceTzs, reason: sale_ended|sale_started|price_changed}], expectedTotalTzs, totalTzs}` |
| B-P2-15 | S4 | Price lock | vendor product update rejects `priceTzs` / `discountPriceTzs` changes while a sale is approved/live: `409 price_locked_by_flash_sale {saleId, startsAt, endsAt}` |
| B-P2-16 | all | Capabilities | `/vendor/me.tools.{shopBanners, flashSales, shopAreas}`; `/shop/home.capabilities.{banners, nearYou, flashSales}` so the app hides UI when a flag is off |

Error codes the UI maps (anything else → generic "Couldn't save. Try again."): `banner_text_has_price`, `banner_text_has_contact`, `image_too_small`, `image_too_large`, `image_type`, `rights_confirmation_required`, `people_confirmation_required`, `headline_too_long`, `translation_required`, `start_too_soon`, `end_before_start`, `too_long`, `discount_below_minimum {maxSalePriceTzs}`, `not_below_discount {discountPriceTzs}`, `price_raised_recently {raisedOn, earliestStart}`, `sale_overlaps {startsAt, endsAt}`, `product_not_eligible`, `cannot_approve_own_submission`, `banner_capacity_full {audience, startsAt, endsAt}`, `not_editable`, `vendor_not_approved`, `vendor_suspended`.

Deploy order: functions → portal / mobile. The app must keep working against a backend without these fields (P1 §13 degrade rule): no banners → band/fallback; no preference → no switch; no areas → no invite card and the distance filter stays; no sale fields → no flash sale UI.

---

## 14. Flags
| Flag | Off | On |
|---|---|---|
| `SHOP_BANNERS` | no banners in the feed; vendor/admin banner screens hidden | §5 |
| `SHOP_PERSONALISATION` | P1 behaviour; no switch, no Privacy tile | §6 |
| `SHOP_NEAR_YOU` | no invite, no rail, no badge; distance filter as today; vendor area fields optional/hidden | §7 |
| `SHOP_FLASH_SALES` | no sale fields, no rail, no price lock, no 409 guard | §8 |

Owner (O-9): flags may go on right after QA. `SHOP_FLASH_SALES` is a pricing-path change and needs the security review called out in its PR (CLAUDE.md rule 6).

---

## 15. Acceptance criteria

Checked one by one by `design-qa` (visual/system) and `uat-tester` (journeys) on Flutter web built from RC and the portal from RC, against an isolated backend with seed accounts. "Phone" = 375×812, "desktop" = 1280×800. Unless stated: light + dark, English + Swahili, 100% and 130% text. Seed needs: two vendor accounts (A approved with areas, B approved without areas), one pending vendor, two admins (X, Y) with `promotions_approve`, one admin without it, members (adult female with DOB, adult with no DOB, 16-year-old), a trainer, a gym owner, products tagged and untagged.

### S1 — Banners
- **S1-AC-01** With `SHOP_BANNERS` off, Shop home, vendor app, vendor portal and admin look exactly as on RC before S1 (no entry tile, no nav item, no carousel).
- **S1-AC-02** Vendor A sees the "Banners & flash sales" tile on the Products tab (app) and "Banners & sales" in the portal sidebar; both open `/vendor/merch` with Flash sales / Banners tabs.
- **S1-AC-03** The pending vendor sees "Available once your business is approved" and cannot open the form; staff without `products` see the existing restricted state.
- **S1-AC-04** The banner form rejects: a 1200×800 image, a 6 MB image, a GIF, missing rights tick, "Models…" without the people tick, a 40-character English headline, SW missing when EN subline is filled, "TSh 50,000" or "20%" in any text, a phone number, start in 30 minutes, end before start, a 31-day run — each with the exact message in §10.3 under the right field, and focus moves to the first error.
- **S1-AC-05** The CTA cannot be typed: picking "One of my products" shows "Button: View product"; "My store" shows "Button: Visit store". The product picker lists only the vendor's own active, approved products.
- **S1-AC-06** The live preview updates while typing, shows "From {business}", and its Light/Dark toggle shows green accent in light and Volt in dark; no Volt on any light surface.
- **S1-AC-07** "Send for approval" → snackbar "Sent for approval"; the card appears under "Waiting for approval" with "Expires {date} if not reviewed", where date = the earlier of sent + 14 days and the start.
- **S1-AC-08** Edit on a pending banner saves and keeps it pending; Edit on a scheduled banner asks "Send back for approval?" and moves it to pending; Withdraw asks and moves it to Past with "Withdrawn".
- **S1-AC-09** In `/admin/shop-merch`, Requests lists the banner; the detail shows phone and desktop previews in both languages and themes, and the uploader's confirmations with name and time.
- **S1-AC-10** Admin X creates a banner; on that item X sees Approve disabled with the visible text "You created this, so another admin must approve it."; admin Y can approve it. The API also refuses X (403 `cannot_approve_own_submission`).
- **S1-AC-11** Approve requires ticking all three checks; Reject requires a reason chip (and a note for "Other"); the vendor's card then shows "Rejected · Reason: {reason}" and a notification opens `/vendor/merch?item=<id>`.
- **S1-AC-12** An admin without `promotions_approve` sees the item but no enabled Approve/Reject/End, with the permission text.
- **S1-AC-13** A pending banner left 14 days (time-shifted fixture) or past its start shows "Expired" for the vendor and in Closed for admins; it never appeared in the shop.
- **S1-AC-14** Once live, member, trainer and owner shops (only the audiences ticked) show the slide with "From {vendor}", the headline accent, and the CTA; no "Sponsored" anywhere on any banner; staff banners have no "From" chip and come first.
- **S1-AC-15** With ≥1 live banner, the member photo band (`PHOTO_HERO_UI` on) is not in the widget tree; with 0 banners the band (member) or the P1 fallback slide (owner/trainer) shows; never both.
- **S1-AC-16** "View product" opens the product sheet with `?product=<id>`; "Visit store" opens Results filtered to that vendor; browser Back returns to Shop home.
- **S1-AC-17** Admin "End now" (with reason) removes the slide within a minute (after refresh); the vendor card shows "Ended by FitFlex: {reason}".
- **S1-AC-18** Approving a 6th overlapping banner for Members is blocked with the capacity message naming the audience and dates.
- **S1-AC-19** Suspending vendor A hides A's live banner from the shop and shows the suspended alert on A's merch page.
- **S1-AC-20** Screen reader on a slide reads "From {vendor}. {headline}. {subline}. Banner n of total"; the image is not announced.

### S2 — Personalisation
- **S2-AC-01** With `SHOP_PERSONALISATION` off: no switch in the Why sheet, no Privacy tile, P1 behaviour.
- **S2-AC-02** New and existing accounts start **on**: the Privacy tile "Personalised shop" says "On"; the Why sheet switch is on.
- **S2-AC-03** Turning the switch off (Why sheet or Privacy sheet) saves at once ("Shop updated"), the rail becomes "Popular in the shop", no reason mentions purchases, gender, age or area, the near-you invite/rail disappears, and the setting is still off after reload and on another browser and in another role of the same account.
- **S2-AC-04** A failed save reverts the switch and shows "Couldn't save. Try again."
- **S2-AC-05** Vendor product form shows "Who it's for (optional)" with Made for (Everyone/Women/Men, single) and Age group (All ages + 4 bands, multi; All ages clears bands and vice versa); values persist on reload.
- **S2-AC-06** Adult female member, on: a product tagged Women in a rail moves earlier compared with personalisation off; every untagged and Men-tagged product that was in the rail is still in it; no title or reason names a gender or age group; the Why sheet shows "The gender in your profile." only for that rail.
- **S2-AC-07** The same account in trainer or owner mode: order identical to personalisation-off for tagged products; no gender/age reason; the switch hint is the partner wording.
- **S2-AC-08** 16-year-old member: no `profile_gender` / `profile_age` reason anywhere and tagged products are not reordered. Member with no date of birth: no `profile_age`.
- **S2-AC-09** Privacy sheet lists the four "What we use" lines and the draft note in both languages.
- **S2-AC-10** All new strings resolve in both maps (`i18n-swahili-auditor`), and `shop.why.deliversToArea` reads "It delivers to your current area." / "Ina delivery kwenye eneo ulipo sasa."; no "mkufunzi" or "kocha" in any new or touched string.

### S3 — Near you
- **S3-AC-01** With `SHOP_NEAR_YOU` off: no invite card, no rail, no badge; the distance filter is present as today.
- **S3-AC-02** With it on and personalisation on, a member who has never answered sees the invite card in the near-you slot; tapping "Use my location" opens the rationale sheet **before** any browser/OS prompt.
- **S3-AC-03** With the OS/browser permission already granted (from the gyms page), the rationale sheet still appears and shows the "already lets FitFlex…" line; "Use my location" then proceeds with no OS prompt.
- **S3-AC-04** Network panel: the only location-derived value sent is `areaId` (on `/shop/home` and Results); no latitude/longitude in any request.
- **S3-AC-05** Position inside a seeded district where vendor A delivers and ≥4 products qualify → "Popular near you" rail; Why lists "It delivers to your current area."; product sheet and Results tiles of A's products show "Delivers to your area"; B's products don't; checkout for B's products is not blocked.
- **S3-AC-06** Denying the prompt hides the card and rail with "Location is off, so Popular near you is hidden."; reloading does not ask again; the Why/Privacy sheet shows "Popular near you: Off" with "Turn on", which reopens the rationale sheet.
- **S3-AC-07** Blocked in the browser → the browser-settings message, no "Open settings" action on web.
- **S3-AC-08** A position matching no area → "No sellers are listed for your area yet."; no rail; no `areaId` sent.
- **S3-AC-09** "Not now" on the card or sheet: card gone for this device; no prompt; the rail never shows until turned on.
- **S3-AC-10** Personalisation off → no invite, no rail, and no geolocation call (check the browser's location indicator/permission log).
- **S3-AC-11** With areas available, the filter sheet has no "Maximum distance" field, `?maxDistanceKm=` in the URL has no effect, and no vendor-typed "km" text shows on shop products.
- **S3-AC-12** Vendor profile form: "Based in" single picker lists only cities and districts; "Delivers to" multi picker shows children of a ticked region as ticked/disabled "Included in {region}"; summary rows read as in §7.4; search keeps parents visible; values persist.
- **S3-AC-13** Vendor B sees the one-time "Add where you're based…" alert on the Business tab; "Add now" opens the profile form at "Where you sell".
- **S3-AC-14** Picker rows, invite buttons and sheet buttons are ≥48 tall; the picker reads "{area}, {level} in {parent}, selected".

### S4 — Flash sales
- **S4-AC-01** With `SHOP_FLASH_SALES` off: no sale fields, rail, lock or price-changed sheet; checkout as on RC.
- **S4-AC-02** Vendor sale form: typing a sale price updates "{pct}% off · buyers save TSh {saving}" with pct = floor((regular − sale)/regular × 100); at 4% off it shows the 5% message with the correct "TSh {max} or less"; at 90% off it is accepted (no maximum).
- **S4-AC-03** For a product with a seller discount price, a sale price at or above it shows the "lower than your current discount price" message.
- **S4-AC-04** For a product whose price was raised 5 days ago, picking a start tomorrow shows "You raised this product's price on {date}. A flash sale can start on {date + 14} or later.", Send is disabled, and "Start on {date}" sets a valid start; the server refuses the same request with `price_raised_recently`.
- **S4-AC-05** A second sale overlapping an existing scheduled sale on the same product is refused with the overlap message; a 30-minute or 8-day sale is refused with the length message.
- **S4-AC-06** The always-visible notes (seller pays, 14-day rule + lock, review/expiry) are shown in both languages.
- **S4-AC-07** Admin detail shows the price check ("Passes the 14-day rule" or the fail line), 30-day price history, "−N% (TSh … off), seller pays"; the creator can't approve their own.
- **S4-AC-08** While the sale is scheduled or live, the vendor product form shows Price and Discount price read-only with "Locked while your flash sale runs ({start}–{end})."; the API refuses a price change with `price_locked_by_flash_sale`.
- **S4-AC-09** A scheduled sale is not visible to members before it starts (no rail, no badge, normal price).
- **S4-AC-10** Live: rail with Fuel badge, Fuel sale price, muted struck "was" price on its own line, countdown chips (≤24 h) or "Ends in N days"; product sheet shows "Sale ends in {h} h {m} min"; Results tiles show the same price block.
- **S4-AC-11** Screen reader on a sale card reads "Sale price TSh 69,000, was TSh 85,000, 18 percent off" once (the struck price is not read separately); the countdown is read at minute precision and does not announce each second over 60 s; "Sale ended" is announced once at zero.
- **S4-AC-12** Add a sale item, let the sale end (or admin ends it), then check out: the price-changed sheet lists the item "was TSh 69,000, now TSh 85,000, Sale ended", "Total was …" and "New total …"; "Continue with {new total}" completes and the order total equals the server price; "Back to cart" returns to the cart.
- **S4-AC-13** If the price changes again during "Continue", the same sheet refreshes and announces "Prices changed again"; no second sheet stacks.
- **S4-AC-14** A product in a live flash sale does not also appear in the "Deals" rail or any other home rail.
- **S4-AC-15** Measured contrast matches §11.1 for sale price, struck price, badge and countdown text in both themes.

### Cross-cutting
- **X-AC-01** Every new interactive element has a non-empty semantics/ARIA label in both languages (Flutter web tree and portal axe run: zero unlabelled buttons/inputs).
- **X-AC-02** All touch targets ≥48×48 in the app; portal controls ≥44.
- **X-AC-03** At 375 px, 130% text, Swahili: no clipping or overlap on the vendor list cards, both forms (EN/SW pairs stacked), the rationale sheet, the price-changed sheet, the admin queue cards, and the carousel slide with the "Kutoka {vendor}" chip.
- **X-AC-04** Keyboard focus order matches §11.3 on Flutter web and portal; focus is always visible; Volt fills use an outline.
- **X-AC-05** Offline: vendor lists keep cached content and disable actions; forms keep their input and show "No internet connection. It wasn't sent."; the Shop home behaves per P1 §9.
- **X-AC-06** Prices everywhere read "TSh 69,000" in both languages.

Needs a real device (not checkable on Flutter web): Android/iOS OS location prompt wording and the "Open settings" action, GPS accuracy and the 10 s timeout, TalkBack/VoiceOver gestures on the carousel, image upload from the camera roll.

---

## 16. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Must vendors write banner/sale text in **both** English and Swahili (DD-P2-3), or may they write one language and FitFlex shows it in both? | Both required. Admin rejects mismatches. |
| Q-2 | Banner text rule: block any price, % or "/=" in banner text (DD-P2-2)? | Yes; deals belong in flash sales where the server sets the price. |
| Q-3 | Flash sale rules beyond your decisions: sale must beat a standing discount price (DD-P2-5); length 1 hour to 7 days and one sale per product at a time (DD-P2-12); price locked during a sale (DD-P2-4). Agree? | Yes to all four. |
| Q-4 | Max 5 live banners per audience; approval blocked beyond that (DD-P2-11)? Banner max length 30 days? | Yes / yes. |
| Q-5 | Location ask: invite card in the near-you slot opening the rationale sheet (DD-P2-7), rather than a sheet that pops up on first shop visit? | Invite card. |
| Q-6 | Under-18 members: gender/age are never used (decided). Should purchase history and area also be off for them? | Yes, treat under-18 as personalisation off (safer; counsel to confirm). |
| Q-7 | Vendor "Based in"/"Delivers to" and product "Made for"/"Age group" are **app-only** (the portal's products page says "edit in app"; there is no portal vendor profile form). OK for now? | Yes; add to the portal with the vendor-profile work later. |
| Q-8 | When staff create a flash sale on a vendor's product, does the vendor need to agree first (they pay the discount)? | Yes: staff-created sales go to the **vendor** to accept, then to a second admin. Until decided, staff can create banners only. |
| Q-9 | Age bands: 18–29 / 30–44 / 45–59 / 60+? Should vendors be able to mark kids' products (which would never be personalised)? | These four; no kids band now. |
| Q-10 | Who in a vendor business may propose: owner + staff with `products` permission? | Yes. |
| Q-11 | "Personalised shop" Swahili: "Duka kwa ajili yako"? | Native review to confirm. |

## 17. Known gaps (reminder)
- Shop payments are still **manual confirmation only**; flash sales add urgency to a flow that waits for a person. The price-changed sheet protects the price, not the payment timing.
- **Vendor settlement is built but has never been exercised with real accounts**; trainer payouts likewise. Flash-sale commission on the sale price relies on it.
- The personalisation and location privacy text is a **draft pending Tanzanian counsel**; the owner chose to switch the flags on after QA anyway (O-9).
- All four flags start **off**.
- The P1 spec (fitflex#65) is not on parent `release-candidate`; merge it first or alongside, and correct its "mkufunzi" Swahili (§10).
- Swahili in this addendum needs native review; the glossary's "Hakuna intaneti" wording differs from the built P1 offline strings ("Huna mtandao"), which are left as they are.
- `GeoArea` seed is thin (few districts); "Popular near you" will mostly resolve to a city until more districts are added in the admin areas screen.
