# Vendor reports + CSV/PDF export (S6): design spec

Status: DRAFT for review. Date: 2026-10-22. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0, §1, S6, §4, §5 (O-1..O-15 accepted 2026-10-19; **O-4 pdfkit**; D-6 no partial refunds on app orders stands).
Builds on: `vendor-stock-ledger-s1.md`, `vendor-portal-s2.md`, `vendor-walkin-sales-s3.md`, `vendor-customers-s4.md`, `vendor-documents-s5.md` (components, states, terms, PDF chrome reused; nothing here overrides them unless stated).
Read from `origin/release-candidate`: functions c142838, portal 61ecc46, mobile aa09412. Facts used:
- `feature-flags.mjs`: `reports: vendorToolsFlag('VENDOR_REPORTS')` already in `/vendor/tools/options` and `/vendor/me.tools`.
- `shop-service.mjs` `canSeeCost(claims)` = vendor account, `vendor_staff` with `vendorRole === 'admin'`, FitFlex admin with `shop` scope; exposed as `tools.canSeeCost`. `canSeeOrderMoney(claims)` = vendor, admin staff, staff with `payments`, FitFlex admin (commission / payout per order). `STAFF_PERMISSIONS` has `reports`.
- `/vendor/payments` is guarded by `payments`; `/vendor/payments/statement` (CSV) by `reports`. The `csv()` helper in shop-service quotes commas/quotes but is **not** formula-injection safe.
- `vendor-settlement-service.mjs`: weekly statement = Monday–Sunday EAT, by **delivered** date (`deliveredOn`), uses `vendorShareOfOrder` (salesTzs, commissionTzs, payoutTzs). Vendor sees statements from `submitted` on.
- `ShopOrder` has **no `paidAt`** column (`markPaid` sets `paymentStatus` only). `ShopOrderLineCost.createdAt` is written on paid (best effort).
- `VendorSale`: `soldAt`, `clientSoldAt`, `subtotalTzs`, `lineDiscountTzs`, `discountTzs`, `vatIncludedTzs`, `totalTzs`, `status completed|voided`, `voidedAt`, `kind cash|credit`. `VendorSaleLine.unitCostTzs` null = cost unknown. `VendorOrderInvoice.vatIncludedTzs` (S5) for app orders.
- Portal has `recharts` (pattern: `b2b-insights.tsx`, period `Select` + date inputs + `Table`). Mobile has no chart package; `lib/screens/member/widgets/activity_bar_chart.dart` (`ActivityBarChart`, `BarDatum` with spoken description) is a plain-widget bar chart.
- Mobile vendor tab 2 = "Payments" (shown with `payments` or `reports`): today/week/month tiles + Download statement.

Platforms: Next.js portal (main home for reports) and Flutter (Android + Flutter web). Roles: `vendor`, `vendor_staff` with `reports`.

Ground rules:
- **Money display "TSh 1,250,000"** (glossary, owner 2026-10-19/20). "TZS" only in data and CSV column headers. Full figures, no "1.2M" abbreviations (SW has no agreed short form); figures wrap rather than truncate.
- **EAT calendar days everywhere.** A day is 00:00–24:00 EAT (21:00 UTC → 21:00 UTC). A week is Monday–Sunday EAT (same as payout statements). A month is the EAT calendar month. `from`/`to` are inclusive EAT dates.
- **Cost is private.** Cost price, stock value at cost, profit and margin are returned, shown and exported **only** when `canSeeCost`. The server omits the fields (not null, absent) and the CSV/PDF columns for anyone else.
- **Unknown cost is never 0.** Lines sold without a cost snapshot are reported in their own row; profit and margin cover costed lines only and say so.
- **Walk-in money never passes through FitFlex** (reports describe what the vendor recorded).
- Reports are **online only**; nothing is cached on the device beyond the open screen.

---

## 0. Scope, gating, permissions, reuse

### 0.1 Gating (fail closed, as S1–S5)
- Whole area: `tools.reports === true` **and** permission `reports`. False, missing or options failing: no Reports nav (portal), no Reports segment (mobile), deep links go to vendor home with no message. Never show "feature off".
- Walk-in channel: shown when `tools.walkInSales` is on **or** the response says walk-in data exists in the period (`channels.walkIn: true`) — switching POS off later must not hide past figures.
- Customers section: also needs `tools.customers` and `customers`.
- Refunds section: only when `tools.refunds` (S7). Until then **no placeholder**; app-order refunds already appear in Sales (§3).
- Stock value: needs `tools.stockLedger` (stock numbers are only reliable with the ledger).

### 0.2 Permissions

| Section | Needs | Without it |
|---|---|---|
| Overview, Sales, Products, Payment methods | `reports` | Nav/segment hidden |
| Stock value at selling price, units, cost-unknown count | `reports` | — |
| Stock value at cost, cost columns | `reports` + `canSeeCost` | Cost columns absent; tile shows selling-price value only |
| Profit (whole section) | `reports` + `canSeeCost` | Section absent from nav, overview and PDF; API 403 `cost_not_allowed` |
| App sales after commission (marketplace net) | `reports` + `canSeeOrderMoney` | Section absent; API 403 `payout_not_allowed` |
| Customers & money owed | `reports` + `customers` + `tools.customers` | Section absent |
| Refunds (S7) | `reports` + `tools.refunds` | Section absent |
| Export CSV/PDF | same as the section exported | Export contains only permitted sections/columns |

Rules: rights are read from the stored staff record (as `canSeeCost`), never from the token. Recommendation: no new permission; `reports` exists and admin-role staff already carry it.

### 0.3 Components (reuse; one promoted widget)

| Need | Mobile | Portal |
|---|---|---|
| Headline figures | `FFStatTile`, `FFMetricCard` | `MetricCard`, `Stat` |
| Cards | `FFCard`, `FFSectionTitle` | `Card`, `CardHeader`, `CardContent` |
| Period / channel / grouping | `FFPill` wrap (`Semantics(selected:)`), `FFSegmented`; dates via `showDateRangePicker` | `Segmented`, `Select`, `Input type="date"` (b2b-insights pattern) |
| Bar chart | `ActivityBarChart` (+ `BarDatum` descriptions). **Promote** to `lib/shared/components/ff_bar_chart.dart` (move + re-export, no visual change) because a vendor screen should not import from `screens/member`. Two series (app / shop) shown as two charts or the channel filter, not stacked (widget is single-series). | `recharts` `BarChart` (stacked app / shop), colours from tokens (not hardcoded; known open item) |
| Tables | `FFCard` rows (≥56dp) with merged semantics; ≥900 a `Table`-like `FFRowGrid` | `Table` (`aria-label`), `Th scope`, sortable headers with `aria-sort`; cards below `md` |
| Bars for shares (payment methods) | `LinearProgressIndicator`-style bar + amount + % text | Horizontal `BarChart` + table |
| States | `FFSkeleton`, `FFEmptyState`, `FFErrorState(onRetry:)`, `FFAlert`, `FFSnack` | `SkeletonCard`, `SkeletonTable`, `EmptyState`, `ErrorState`, `Alert`, toast |
| Export | `FFButton` + `showFFSheet` (CSV / PDF), `share_plus` `XFile` (web: browser download) | `Button` + menu (`Dialog` at 375) |
| Status | `FFBadge` / `Badge`: Paid out = success, Awaiting payout = info, Not delivered yet = neutral, Voided = neutral, Cost unknown = warning | |

No new visual component. New non-visual: `ReportsRepository` (mobile, in-memory only), `ReportPeriod` (preset → from/to/groupBy in EAT, shared logic mirrored in portal `src/lib/report-period.ts`).

### 0.4 Colour and charts
- Series: App = brand primary (`#1F7A3A` ramp); Shop (walk-in) = neutral slate ramp. Legend always has text; tables carry the numbers. In dark mode Volt may mark the selected bar only (V2 rule: Volt never as text on light).
- Negative figures (refunds, commission) use a minus sign and the word, never red alone.
- Cost unknown / "not counted" uses `warning` tone + text.

---

## 1. Definitions (server computes; client never sums pages)

| Figure | Walk-in (VendorSale, status completed) | App order (vendor's own lines) |
|---|---|---|
| Date | `soldAt` (EAT) | **paid date** (`paidAt`, Q-2) |
| Gross sales | Σ qty × `unitPriceTzs` (after price override, before discounts) = `subtotalTzs` | Σ qty × `priceTzs` |
| Discounts | `lineDiscountTzs + discountTzs` | 0 (app has no vendor discounts) |
| Refunds | S7 credit notes, on the refund date | Paid order later cancelled/refunded: whole vendor share, on the **cancellation date** (D-6, Q-4) |
| Net sales | Gross − Discounts − Refunds | Gross − Refunds |
| VAT included | `vatIncludedTzs` (part of net, never added) | `VendorOrderInvoice.vatIncludedTzs` when issued, else 0 |
| Voided | Excluded from every total, on the original day; shown as "Voided (not counted): n · TSh X" | n/a (cancelled-before-paid orders never count) |
| Credit (pay later) | Counted in full on the sale date; collections appear in Payment methods | n/a |
| Cost (profit) | Σ qty × `VendorSaleLine.unitCostTzs` (null → uncosted) | Σ qty × `ShopOrderLineCost.unitCostTzs` (missing/null → uncosted) |
| Commission | 0 | `commissionTzs` on the line |
| Profit | Net ex-VAT − cost | Net ex-VAT − commission − cost (Q-7) |

- Margin % = Profit ÷ Net ex-VAT on **costed lines only**, one decimal.
- Products are grouped by `productId + variant`; name = current product name, else the line snapshot with "(removed)".
- Late-recorded and offline-synced sales count on their `soldAt`, so a past day can change; every report shows "Updated {time}".
- Marketplace net (§7) uses the **delivered** date so it matches payout statements. It is the only section dated by delivery; the screen says so.

---

## 2. Navigation

### 2.1 Portal (main home)
- `vendorNav` gains **Reports** (`/vendor/reports/`, lucide `BarChart3`, `vendor.nav.reports`) after Customers; shown when `tools.reports` and `reports`.
- One page with a view switch in the URL: `/vendor/reports/?view=overview|sales|products|stock|profit|payouts|customers|methods|refunds&from=YYYY-MM-DD&to=YYYY-MM-DD&channel=all|app|walk_in&groupBy=day|week|month`. Static export, query strings (S2 pattern). Missing/invalid params fall back to This month / all / auto grouping, URL rewritten with `replace`.
- Dashboard (S2 §3): a **Reports** link in the page header ("See reports") when allowed. No new dashboard cards.
- Back: browser back moves between views (each view change is a `push`); period/channel changes use `replace`.

### 2.2 Mobile
- Tab 2 today = "Payments" (shown with `payments` or `reports`). With `tools.reports` and `reports`, tab 2 is labelled **Reports** (`vendor.reports.tab` "Reports / Ripoti") with `FFSegmented` **Reports | Payouts** (Payouts only with `payments`; it is today's Payments content unchanged). Without `reports` or flag off: tab unchanged (Q-1).
- Routes (GoRoute):

| Route | Screen | Back |
|---|---|---|
| `/vendor/home?open=reports` | Reports segment (cards, §9) | Tab behaviour |
| `/vendor/reports/:section?from&to&channel` (`section` ∈ sales, products, stock, profit, payouts, customers, methods) | Section detail | Pops; nothing to pop → `go('/vendor/home?open=reports')` |

- Deep-link rules: flag off → `/vendor/home`, no message. No `reports` → first allowed section + snack `vendor.reports.noAccess`. Section not allowed (e.g. profit without cost) → Reports home + same snack. Unknown section → Reports home.
- Entry points: Reports segment; Payouts segment link "See app sales after commission" (`payments` + `reports`); low-stock list link "Stock value" (`products` + `reports`).

### 2.3 After completion
- Export CSV/PDF: mobile opens the system share sheet with the file (Flutter web: browser download); snack `vendor.reports.exported`. Portal: browser download; toast `vendor.reports.exported`. The screen stays where it was.
- Changing period/channel keeps the current view and scroll position at top.

---

## 3. Period, channel and grouping controls (both surfaces)

- Presets (`FFPill` / `Segmented`): **Today · Yesterday · This week · Last week · This month · Last month · Custom**. Default This month.
- Custom: date range picker, EAT dates, `to` ≤ today, range ≤ 366 days; beyond → inline error `vendor.reports.rangeTooLong`, Apply disabled.
- Grouping (Sales and Profit only): **Day · Week · Month**; auto = Day for ≤31 days, Week for ≤26 weeks, else Month. Choices that would give >120 bars are disabled with a tooltip/helper `vendor.reports.groupTooMany`.
- Channel: **All · App · Shop** (`vendor.reports.channel.*`). Hidden when there is no walk-in channel (§0.1). Ignored by Stock value, Marketplace net and Customers (they say "All channels" / "App only" in the header).
- Header line always shows the resolved period in words: "1–31 Oct 2026 · All sales · Updated 14:05" (SW: "1–31 Okt 2026 · Mauzo yote · Imesasishwa 2:05 mchana").
- "Today" and "This week/month" include the current day; header adds `vendor.reports.inProgress` "(so far)".

---

## 4. Overview (`view=overview`; mobile Reports segment, §9)

Purpose: the five numbers a shop owner checks, then where to look next.

Desktop (≥1024): `MetricCard` row of 4 — **Net sales** (sub: "Gross {g} · Discounts {d}"), **Items sold**, **Profit** (canSeeCost; sub "on items with a cost price"), **Owed to you** (customers). Without cost: 4th card = **Sales count**. Then two cards: **Net sales by {day|week|month}** chart (2/3 width) + **Top 5 products** (1/3). Then **Payment methods** compact list and, with `canSeeOrderMoney`, **App sales after commission** card (gross, commission, you receive, paid out vs waiting).
375px: one column, same order; MetricCards 2 per row.

---

## 5. Sales (`view=sales`)

Purpose: how much was sold, by period and channel, and what came off.

Layout (desktop):
1. Totals strip (`Stat` row): Gross sales · Discounts · Refunds · **Net sales** · VAT included (only when any VAT > 0) · Sales count (walk-in receipts + app orders) · Items sold.
2. "Voided (not counted): {n} sales · TSh X" small `Alert` (neutral) when n > 0, link to `/vendor/sales/?status=voided` (`sales` permission only; else plain text).
3. Chart: stacked bars Net sales per bucket (App / Shop). `role="img"`, `aria-label` = `vendor.reports.chartSummary` ("Net sales by day, 1–31 Oct 2026. Highest: 12 Oct, TSh 450,000. Total TSh 3,200,000. Table below."). Tooltip shows both series + total.
4. Table (`aria-label` `vendor.reports.sales.table`), always visible (it is the chart's text alternative): Period · App net · Shop net · Gross · Discounts · Refunds · Net · VAT included · Count. Footer totals row = strip totals.
5. Channel split card: App vs Shop with net, share %, count.

375px: strip as 2-column `Stat` grid; chart 200px tall, horizontal scroll disabled (bars thin out; >31 buckets → chart hidden, table only, note `vendor.reports.chartTooMany`); table becomes cards per bucket ("12 Oct · Net TSh 450,000 · App 300,000 · Shop 150,000 · 14 sales").

---

## 6. Products (`view=products`)

Purpose: what sells, what sits, and how long stock lasts.

- Segmented: **Best sellers** (by net revenue, default) · **Most units** · **Slow sellers**.
- Search by name (client-side filter of the loaded page; server `q` when >200 rows).
- Table: Product (name + variant) · Units sold (App / Shop on hover/second line) · Net revenue · Last sold (EAT date, "—" if never) · In stock · **Days of cover** · (canSeeCost) Profit.
- **Days of cover** = stock ÷ average units sold per day over the **last 30 days** (both channels, ending today, independent of the chosen period; Q-9). Shown as "{n} days", "Less than 1 day", "No sales in 30 days" (when average = 0 and stock > 0), "Out of stock" (stock = 0), "—" (stock not tracked). ≤7 days → `warning` badge "Reorder soon" plus text.
- **Slow sellers** = products with stock > 0 sorted by fewest units sold in the period, then oldest Last sold; includes products with 0 sales in the period (labelled "No sales in this period").
- Load more (cursor), 50 per page. Totals row only on Best sellers (sum of the period, from the server).
- 375px: card per product: name · units · revenue · "Last sold 12 Oct" · cover badge.

---

## 7. App sales after commission (`view=payouts`; marketplace net)

Purpose: what FitFlex app orders earned the vendor and where the money is. Reconciles with weekly payout statements.

Header note `vendor.reports.payouts.basis`: "App orders only. Counted by delivery date, the same as your payout statements."
1. Totals: App sales (gross) · Commission · **You receive** (payout).
2. Status breakdown (`Stat` row, each with count of orders): **Paid, not delivered yet** (not payable) · **Delivered, waiting for payout** · **Paid out** — computed now, for orders delivered in the period (first one: paid in period, not delivered).
3. Table by statement week (Mon–Sun EAT): Week · Orders · App sales · Commission · You receive · Statement (badge: Paid out / Awaiting payout / Not on a statement yet; link to the statement in Payouts when visible to the vendor).
4. Footnote: `vendor.reports.payouts.reconcile` "A paid-out week matches its payout statement. Draft statements are not shown until FitFlex sends them for approval."

Rules: figures come from the order lines' `commissionTzs`/`vendorPayoutTzs` (`vendorShareOfOrder`), read only; payout engine unchanged. Refunded/cancelled orders are excluded (never delivered).

---

## 8. Other sections

### 8.1 Stock value (`view=stock`) — "as of now", not the period
- Totals: **At selling price** TSh X · (canSeeCost) **At cost** TSh Y · Units in stock · Products.
- `Alert` warning when any in-stock item has no cost (canSeeCost only): `vendor.reports.stock.costUnknown` "{n} products in stock have no cost price, so they are not in the cost value. Add cost prices." → link to `/vendor/products/?filter=noCost` (portal) / products tab (mobile) with `products` permission.
- Without canSeeCost: shows only selling-price value and units; no cost wording at all.
- Table: Product · Variant · In stock · Selling price · Value at selling price · (canSeeCost) Cost price ("Unknown" badge) · Value at cost. Sort by value (default), stock, name.
- Header note: "As of {time} today. The period you picked does not apply." Period controls disabled (visually and `aria-disabled`) on this view.
- Products with stock 0 are omitted; variant products show one row per variant when variants track stock.

### 8.2 Profit (`view=profit`, canSeeCost only)
- Totals: Net sales ex-VAT (costed lines) · Commission (app) · Cost of goods · **Profit** · Margin %.
- **Separate block, never merged**: `vendor.reports.profit.uncosted` "Sold without a cost price: {n} items · TSh X. Not in profit." with a link to the products list (filter: no cost).
- Chart + table by bucket (as Sales): Profit per bucket; table columns Period · Net ex-VAT · Commission · Cost · Profit · Margin · Uncosted sales.
- By-product table: Product · Units · Net ex-VAT · Cost · Profit · Margin; uncosted products listed under their own heading "No cost price" with revenue only.
- Header note when VAT exists: "Profit is worked out without VAT."
- Refunds (S7): revenue reduced on the refund date; cost reversed only for refunded units put back in stock (Q-5).

### 8.3 Customers & money owed (`view=customers`)
- From S4 (`customers`): Owed to you now · Overdue now · Pay-later sales in period (count, TSh) · Collected from customers in period (PMT, TSh) · Customers who bought in period (shop + app). Link "Open Owed to you" → S4 Owed view. Aging line (5 buckets as text). No customer list here (S4 has it).

### 8.4 Payment methods (`view=methods`)
- Two groups, never added together without a label:
  - **Collected by you** (walk-in): Cash (net of change) · M-Pesa · Airtel Money · Mixx by Yas · HaloPesa · Card · Bank · Other — from sale payments on the sale date **plus** customer payments (PMT) on their received date. Credit balances not yet paid are not money received.
  - **Paid through FitFlex** (app orders): by `paymentMethod`, on paid date.
- Each row: method · amount · % of group · count. Horizontal bars with the % as text. Footnote `vendor.pos.moneyNotice` (S3) for the first group.

### 8.5 Refunds (`view=refunds`, S7)
Shown only when `tools.refunds`. Totals: refunds count, amount, restocked units; table by credit note (CN- number, date, sale R-, amount, method, restocked). Until S7 ships nothing is rendered and the API answers `{ rows: [] }`.

---

## 9. Mobile layout (phone 375; Flutter web ≥900)

Reports segment, top to bottom:
1. Period pills (wrap) + channel pills (when shown). Custom → range picker.
2. Header line (§3) + "Updated {time}" + refresh icon button (`vendor.reports.refresh`).
3. Pending-sync banner when this device's S3 offline queue has items: `vendor.reports.pendingSync` "{n} sales on this phone are waiting to sync and are not in these figures."
4. Cards (`FFCard`, whole card tappable → section detail, chevron):
   - **Sales**: Net sales (large) · "Gross {g} · Discounts {d} · Refunds {r}" · bar chart (≤31 buckets) · "{n} sales · {u} items".
   - **Top products**: 3 rows (name · units · revenue) + "Slow sellers: {n}".
   - **Stock value** (stockLedger): at selling price (+ at cost when allowed) + cost-unknown line.
   - **Profit** (canSeeCost): profit · margin · uncosted line.
   - **App sales after commission** (canSeeOrderMoney): you receive · paid out · waiting.
   - **Customers** (customers): owed · overdue · collected.
   - **Payment methods**: top 3 methods with bars.
5. **Export** button (secondary, full width) → sheet: "Summary (PDF)" · "{section} (CSV)" list of allowed sections · language note "Exports use {language}." Each option shows a spinner row while preparing.

Section detail screens: same content as the portal view (§5–§8) in card lists; Export icon button in the app bar (CSV of this section, PDF summary).

Flutter web ≥900: cards in a 2-column grid, max width 1100, centred; detail screens show tables (`FFRowGrid`) instead of cards.

---

## 10. Export (CSV and PDF)

### 10.1 CSV
- Endpoint: same report URL with `?format=csv&lang=en|sw`. One CSV per section; Overview has no CSV.
- File name: `{business-slug}_{section}_{from}_{to}.csv` (ASCII, no customer names).
- Encoding UTF-8 **with BOM** (Excel shows Swahili correctly), comma separator, CRLF, header row in the chosen language, money columns end with "(TZS)" (`Net sales (TZS)` / `Mauzo halisi (TZS)`).
- Numbers raw integers (no separators, no "TSh"); margin as `12.5`; dates `YYYY-MM-DD` (EAT); times `YYYY-MM-DD HH:mm` EAT.
- **Injection safety**: every text cell (product names, variants, notes, customer names, method "other" labels) that begins with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`; then RFC 4180 quoting. Numeric cells are written by the server from integers only. The same helper should replace `csv()` in `/vendor/payments/statement` (backend note).
- Permission-filtered: cost/profit columns absent without canSeeCost; payout columns absent without canSeeOrderMoney.
- Row 1 is the header and every other row is data (no title or footer rows), so the file opens as a plain table. The period is in the file name.

### 10.2 PDF summary (pdfkit, S5 §8 chrome)
- `GET /vendor/reports/summary?format=pdf&from&to&channel&lang`. A4 portrait, S5 margins/fonts, tagged, `lang` set.
- Content: business name; title "Sales report" + period in words; "Generated {date time} by {name}"; then each **permitted** section as a heading + table (no charts): Sales totals + by-bucket table (max 31 rows, else by week), Top 10 products, Slow sellers (10), Stock value, Profit (canSeeCost), App sales after commission (canSeeOrderMoney), Customers (customers), Payment methods. Footer every page: "Figures are from FitFlex records; not a tax document." · "Page {n} of {m}".
- File name `{business-slug}_report_{from}_{to}.pdf`.

### 10.3 Export states
| State | Mobile | Portal |
|---|---|---|
| Preparing | Sheet row spinner, label "Preparing…" (polite live region); other rows disabled | Button spinner, `aria-busy` |
| Done | Share sheet / download; snack `vendor.reports.exported` | Download; toast |
| Too large (413 `export_too_large`) | `FFAlert` `vendor.reports.exportTooLarge` | `Alert` same |
| Error / offline | Snack `vendor.reports.exportFailed` / `error.network` | Toast same |
| Not allowed (403) | Option not shown; if raced, snack `vendor.reports.noAccess` | Same |

Recommendation: each export is written to the audit log (actor, section, period, format, includedCost) — cheap and useful if data leaks.

---

## 11. States (every report view and card)

| State | Behaviour |
|---|---|
| Loading | Skeleton per card / `SkeletonTable`; header and controls usable; `semanticLabel` `vendor.reports.loading` |
| Empty (no sales in period) | `EmptyState` `vendor.reports.empty` "No sales in {period}." + "Try another period" (focuses the period control). Stock value still shows (it is not period-based). |
| Empty, brand-new vendor (no sales ever) | `vendor.reports.emptyFirst` "Your reports fill up as you sell in the app or record shop sales." + (sales) "Record a sale" / (products) "Add products" |
| Error | Per card / view: `ErrorState` `vendor.reports.failed` + Try again; other cards keep working |
| Offline (mobile) | Whole segment: `FFErrorState` with `error.network` ("Hakuna intaneti"), Try again; no cached figures shown |
| Partial | (a) some cards failed → only those show error; (b) uncosted lines → profit uncosted block + overview sub-label; (c) pending offline sales on device → banner §9.3; (d) late-synced sales may change past days → "Updated {time}" |
| Success | As specified |
| Pending-approval vendor | Works on own data; existing pending banner (S3 Q-4) |
| Suspended vendor / staff disabled | Existing banners; reports readable; Export disabled for disabled staff (`vendor.reports.staffDisabled`) |
| Role-restricted | Sections absent per §0.2; never a disabled or blurred cost column. If a staff member has `reports` but nothing else, Overview shows Sales, Products, Payment methods only |
| Range invalid | Inline error on the date control; previous figures stay |
| Stale request | Changing the period cancels the in-flight request; only the latest response renders |

---

## 12. Accessibility
- Targets: mobile ≥48dp (pills, segment, card taps, export rows, refresh); portal ≥44px (segments, menu items, sortable headers).
- **Charts:** every chart has a text summary (`aria-label` / `Semantics(label:)`) and the full numbers in a visible table or card list directly below. Mobile bars use `BarDatum.description` ("12 Oct: net sales TSh 450,000, 14 sales"). No information only in colour or only in the chart.
- **Labels (Flutter web tree):** period pills "Period: This month, selected"; channel pills "Channel: Shop, not selected"; cards merged ("Sales report card. Net sales TSh 3,200,000 for 1–31 Oct. Open details"); export rows "Download sales report as CSV for 1–31 Oct 2026"; refresh "Refresh reports, updated 2:05 pm"; cover badges spoken as text.
- **Tables (portal):** `Table aria-label`, `Th scope="col"`, row header (`scope="row"`) on the period/product cell, `aria-sort` on sortable headers, totals in `<tfoot>`. Numbers right-aligned, tabular figures.
- **Focus order (portal view):** page heading → view switch → period presets → dates → channel → grouping → Export → totals → chart (single tab stop, summary read) → table. View change moves focus to the view heading (`h2`). Export menu: focus trap, Escape closes, focus returns to the trigger.
- **Focus order (mobile segment):** segment → period pills → channel pills → refresh → banner → cards top to bottom → Export.
- **Live regions:** "Updated {time}" after refresh (polite); export preparing (polite); errors (assertive).
- Contrast ≥4.5:1 light and dark (chart labels and axis text included; series colours ≥3:1 against background and each other, plus legend text).
- Text scale 200%: stat grids 1 per row; cards stack figure over label; portal tables switch to cards below `md`; no horizontal scroll except wide tables inside their own scroll container with a visible "Scroll for more columns" hint.

---

## 13. Strings (EN + SW; every SW string is a draft for native review)

Terms: report = ripoti; sales = mauzo; net sales = mauzo halisi; gross = mauzo ya jumla; discount = punguzo; refund = marejesho; voided = yamebatilishwa; profit = faida; cost = gharama / bei ya kununua; commission = kamisheni; you receive = unapokea; paid out = yamelipwa; period = kipindi; stock stays "Stock"; app stays "app"; shop sales = mauzo ya dukani; download = pakua. Reused: S3 `vendor.pos.method.*`, `vendor.pos.moneyNotice`; S4 `vendor.owed.*`; `error.network`; `common.*`. Placeholders: `{n} {amount} {period} {time} {date} {section} {name} {language} {g} {d} {r} {u}`.

### 13.1 Navigation and controls
| Key | EN | SW (draft) |
|---|---|---|
| vendor.nav.reports | Reports | Ripoti |
| vendor.reports.tab | Reports | Ripoti |
| vendor.reports.seg.reports / seg.payouts | Reports / Payouts | Ripoti / Malipo yako |
| vendor.reports.title | Reports | Ripoti |
| vendor.reports.dashLink | See reports | Angalia ripoti |
| vendor.reports.noAccess | You don't have access to this report. | Huna ruhusa ya kuona ripoti hii. |
| vendor.reports.view.overview | Overview | Muhtasari |
| vendor.reports.view.sales | Sales | Mauzo |
| vendor.reports.view.products | Products | Bidhaa |
| vendor.reports.view.stock | Stock value | Thamani ya Stock |
| vendor.reports.view.profit | Profit | Faida |
| vendor.reports.view.payouts | App sales after commission | Mauzo ya app baada ya kamisheni |
| vendor.reports.view.customers | Customers and money owed | Wateja na madeni |
| vendor.reports.view.methods | Payment methods | Njia za malipo |
| vendor.reports.view.refunds | Refunds | Marejesho |
| vendor.reports.period | Period | Kipindi |
| vendor.reports.preset.today / yesterday | Today / Yesterday | Leo / Jana |
| vendor.reports.preset.thisWeek / lastWeek | This week / Last week | Wiki hii / Wiki iliyopita |
| vendor.reports.preset.thisMonth / lastMonth | This month / Last month | Mwezi huu / Mwezi uliopita |
| vendor.reports.preset.custom | Choose dates | Chagua tarehe |
| vendor.reports.group / group.day / week / month | Show by / Day / Week / Month | Onyesha kwa / Siku / Wiki / Mwezi |
| vendor.reports.groupTooMany | Too many bars. Pick a longer grouping. | Ni nyingi mno. Chagua kipindi kirefu zaidi. |
| vendor.reports.rangeTooLong | Choose up to 366 days. | Chagua hadi siku 366. |
| vendor.reports.channel | Channel | Njia ya mauzo |
| vendor.reports.channel.all / app / walkIn | All / App / Shop | Yote / App / Dukani |
| vendor.reports.channel.allSales | All sales | Mauzo yote |
| vendor.reports.inProgress | (so far) | (hadi sasa) |
| vendor.reports.updated | Updated {time} | Imesasishwa {time} |
| vendor.reports.refresh | Refresh reports | Sasisha ripoti |
| vendor.reports.weekOf | Week of {date} | Wiki ya {date} |

### 13.2 Figures
| Key | EN | SW (draft) |
|---|---|---|
| vendor.reports.gross | Gross sales | Mauzo ya jumla |
| vendor.reports.discounts | Discounts | Punguzo |
| vendor.reports.refunds | Refunds | Marejesho |
| vendor.reports.net | Net sales | Mauzo halisi |
| vendor.reports.vatIncluded | VAT included | VAT iliyomo |
| vendor.reports.salesCount | Sales | Idadi ya mauzo |
| vendor.reports.itemsSold | Items sold | Bidhaa zilizouzwa |
| vendor.reports.grossLine | Gross {g} · Discounts {d} · Refunds {r} | Jumla {g} · Punguzo {d} · Marejesho {r} |
| vendor.reports.countLine | {n} sales · {u} items | Mauzo {n} · bidhaa {u} |
| vendor.reports.voided | Voided (not counted): {n} sales · {amount} | Yamebatilishwa (hayahesabiwi): mauzo {n} · {amount} |
| vendor.reports.chartSummary | {figure} by {group}, {period}. Highest: {date}, {amount}. Total {total}. Table below. | {figure} kwa {group}, {period}. Juu zaidi: {date}, {amount}. Jumla {total}. Jedwali liko chini. |
| vendor.reports.chartTooMany | Too many days for a chart. See the table. | Siku ni nyingi mno kwa chati. Angalia jedwali. |
| vendor.reports.sales.table | Sales by period | Mauzo kwa kipindi |
| vendor.reports.appNet / shopNet | App net / Shop net | Halisi ya app / Halisi ya dukani |
| vendor.reports.share | Share | Sehemu |

### 13.3 Products and stock
| Key | EN | SW (draft) |
|---|---|---|
| vendor.reports.best / mostUnits / slow | Best sellers / Most units / Slow sellers | Zinazouzika zaidi / Idadi kubwa zaidi / Zinazouzika polepole |
| vendor.reports.unitsSold | Units sold | Idadi iliyouzwa |
| vendor.reports.revenue | Net revenue | Mapato halisi |
| vendor.reports.lastSold | Last sold | Iliuzwa mwisho |
| vendor.reports.never | Never | Haijawahi |
| vendor.reports.inStock | In stock | Stock iliyopo |
| vendor.reports.cover | Days of cover | Siku Stock itakazotosha |
| vendor.reports.coverDays | {n} days | Siku {n} |
| vendor.reports.coverUnderOne | Less than 1 day | Chini ya siku 1 |
| vendor.reports.coverNoSales | No sales in 30 days | Hakuna mauzo siku 30 |
| vendor.reports.outOfStock | Out of stock | Imeisha |
| vendor.reports.reorderSoon | Reorder soon | Agiza tena karibuni |
| vendor.reports.noSalesPeriod | No sales in this period | Hakuna mauzo kipindi hiki |
| vendor.reports.removed | (removed) | (imeondolewa) |
| vendor.reports.stock.atRetail | At selling price | Kwa bei ya kuuza |
| vendor.reports.stock.atCost | At cost | Kwa bei ya kununua |
| vendor.reports.stock.units | Units in stock | Idadi ya Stock |
| vendor.reports.stock.asOf | As of {time} today. The period you picked does not apply. | Kufikia {time} leo. Kipindi ulichochagua hakitumiki hapa. |
| vendor.reports.stock.costUnknown | {n} products in stock have no cost price, so they are not in the cost value. | Bidhaa {n} zilizopo kwenye Stock hazina bei ya kununua, kwa hiyo hazimo kwenye thamani kwa bei ya kununua. |
| vendor.reports.addCost | Add cost prices | Weka bei za kununua |
| vendor.reports.unknown | Unknown | Haijulikani |

### 13.4 Profit, payouts, customers, methods
| Key | EN | SW (draft) |
|---|---|---|
| vendor.reports.profit | Profit | Faida |
| vendor.reports.profitHint | On items with a cost price | Kwa bidhaa zenye bei ya kununua |
| vendor.reports.margin | Margin | Asilimia ya faida |
| vendor.reports.cogs | Cost of goods | Gharama ya bidhaa |
| vendor.reports.netExVat | Net sales without VAT | Mauzo halisi bila VAT |
| vendor.reports.profit.noVat | Profit is worked out without VAT. | Faida imehesabiwa bila VAT. |
| vendor.reports.profit.uncosted | Sold without a cost price: {n} items · {amount}. Not in profit. | Zimeuzwa bila bei ya kununua: bidhaa {n} · {amount}. Hazimo kwenye faida. |
| vendor.reports.profit.noCostHeading | No cost price | Hakuna bei ya kununua |
| vendor.reports.commission | Commission | Kamisheni |
| vendor.reports.youReceive | You receive | Unapokea |
| vendor.reports.payouts.basis | App orders only. Counted by delivery date, the same as your payout statements. | Oda za app pekee. Zimehesabiwa kwa tarehe ya delivery, sawa na taarifa zako za malipo. |
| vendor.reports.payouts.notDelivered | Paid, not delivered yet | Zimelipiwa, bado delivery |
| vendor.reports.payouts.waiting | Delivered, waiting for payout | Zimefikishwa, zinasubiri malipo |
| vendor.reports.payouts.paidOut | Paid out | Yamelipwa |
| vendor.reports.payouts.noStatement | Not on a statement yet | Bado haiko kwenye taarifa |
| vendor.reports.payouts.reconcile | A paid-out week matches its payout statement. Draft statements are not shown until FitFlex sends them for approval. | Wiki iliyolipwa inalingana na taarifa yake ya malipo. Taarifa za rasimu hazionyeshwi hadi FitFlex izitume kwa idhini. |
| vendor.reports.payouts.link | See app sales after commission | Angalia mauzo ya app baada ya kamisheni |
| vendor.reports.cust.creditSales | Pay-later sales | Mauzo ya mkopo |
| vendor.reports.cust.collected | Collected from customers | Yaliyokusanywa kutoka kwa wateja |
| vendor.reports.cust.buyers | Customers who bought | Wateja walionunua |
| vendor.reports.cust.openOwed | Open Owed to you | Fungua Unachodai |
| vendor.reports.methods.byYou | Collected by you | Uliyopokea wewe |
| vendor.reports.methods.viaFitFlex | Paid through FitFlex | Yaliyolipwa kupitia FitFlex |
| vendor.reports.methods.netOfChange | Cash after change | Taslimu baada ya chenji |

### 13.5 States and export
| Key | EN | SW (draft) |
|---|---|---|
| vendor.reports.loading | Loading reports | Inapakia ripoti |
| vendor.reports.empty | No sales in {period}. | Hakuna mauzo {period}. |
| vendor.reports.tryPeriod | Try another period | Jaribu kipindi kingine |
| vendor.reports.emptyFirst | Your reports fill up as you sell in the app or record shop sales. | Ripoti zako zitajaa kadiri unavyouza kwenye app au kurekodi mauzo ya dukani. |
| vendor.reports.failed | This report could not load. | Ripoti hii imeshindwa kupakia. |
| vendor.reports.pendingSync | {n} sales on this phone are waiting to sync and are not in these figures. | Mauzo {n} kwenye simu hii yanasubiri kutumwa na hayamo kwenye takwimu hizi. |
| vendor.reports.staffDisabled | Your account is disabled, so you can't download reports. | Akaunti yako imezuiwa, huwezi kupakua ripoti. |
| vendor.reports.export | Download | Pakua |
| vendor.reports.exportCsv | {section} (CSV) | {section} (CSV) |
| vendor.reports.exportPdf | Summary (PDF) | Muhtasari (PDF) |
| vendor.reports.exportLang | Downloads use {language}. | Upakuaji unatumia {language}. |
| vendor.reports.preparing | Preparing… | Inaandaa… |
| vendor.reports.exported | Report downloaded. | Ripoti imepakuliwa. |
| vendor.reports.exportFailed | The report could not be downloaded. Try again. | Ripoti imeshindwa kupakuliwa. Jaribu tena. |
| vendor.reports.exportTooLarge | This report is too big to download. Choose a shorter period. | Ripoti hii ni kubwa mno kupakua. Chagua kipindi kifupi zaidi. |
| vendor.reports.a11y.exportRow | Download {section} as {format} for {period} | Pakua {section} kama {format} kwa {period} |
| vendor.reports.a11y.card | {section} report card. {summary}. Open details | Kadi ya ripoti ya {section}. {summary}. Fungua maelezo |

### 13.6 Server (CSV headers and PDF, `report.*` in both languages)
Every on-screen column label above is reused for CSV headers with " (TZS)" on money columns; PDF uses `report.title` "Sales report / Ripoti ya mauzo", `report.generated` "Generated {date} {time} by {name} / Imetengenezwa {date} {time} na {name}", `report.footer` "Figures are from FitFlex records; not a tax document. / Takwimu ni kutoka kumbukumbu za FitFlex; si hati ya kodi.", `doc.pageOf` (S5).

### 13.7 Swahili overflow
- Nav "Ripoti" (6) fits; segment "Ripoti | Malipo yako" fits at 375 (≈170dp each).
- View switch on portal 375: 9 views → horizontal scroll `Segmented` is not allowed; use a `Select` below `md` ("Mauzo ya app baada ya kamisheni", 31 chars, fits a full-width select).
- Mobile card title "Mauzo ya app baada ya kamisheni" wraps to 2 lines; card height grows.
- Period pills "Mwezi uliopita" (14), "Wiki iliyopita" (14), "Chagua tarehe" (13) wrap to a second row at 375; never truncate.
- Column headers "Siku Stock itakazotosha" (23), "Asilimia ya faida" (17) wrap to 2 lines in tables; portal table min column width 96px.
- Long alerts (`stock.costUnknown`, `pendingSync`, `payouts.reconcile` ~120–150 chars SW) wrap inside `FFAlert`/`Alert`.
- Figures never wrap mid-number (`softWrap` on label only; amount on its own line at 200% text).

---

## 14. Backend fields needed (for fitflex-planner / contract-checker)

All endpoints: permission `reports` (+ extras below), VENDOR_TOOLS + VENDOR_REPORTS (off → 404 `feature_disabled`), vendor-scoped, SQL aggregates on Postgres stores (no `filterAsync`), query `from, to` (EAT dates inclusive), `channel=all|app|walk_in`, `format=json|csv|pdf`, `lang=en|sw`. Common response head `{ from, to, channel, groupBy?, generatedAt, timezone:'Africa/Dar_es_Salaam', channels:{ app:bool, walkIn:bool } }`. Errors: 400 `invalid_range` (to < from, > 366 days, future `to`), 403 permission codes, 413 `export_too_large`.

| Endpoint / data | Fields | Status |
|---|---|---|
| `/vendor/tools/options`, `/vendor/me.tools` | `reports`, `canSeeCost` (exist); **`canSeeOrderMoney`** (bool) | `reports`/`canSeeCost` exist; **`canSeeOrderMoney` requested** |
| `GET /vendor/reports/summary` | `{ sales{grossTzs, discountTzs, refundTzs, netTzs, vatIncludedTzs, saleCount, orderCount, itemsSold, voided{count,totalTzs}, buckets[{start,netTzs}]}, topProducts[5], slowCount, stock?{atRetailTzs, atCostTzs?, costUnknownCount?}, profit?{profitTzs, marginPct, uncosted{qty, revenueTzs}}, payouts?{payoutTzs, paidOutTzs, waitingTzs}, customers?{owedTzs, overdueTzs, collectedTzs}, methods{byYou[3], viaFitFlex[3]} }`; sections absent when not permitted; `format=pdf` = §10.2 | **new, requested** (one call for mobile Reports and portal Overview; PDF target) |
| `GET /vendor/reports/sales` | `groupBy=day|week|month`; `totals{grossTzs, discountTzs, refundTzs, netTzs, vatIncludedTzs, saleCount, orderCount, itemsSold, voided{count,totalTzs}}`, `byChannel{app{…}, walkIn{…}}`, `buckets[{start, end, app{grossTzs, discountTzs, refundTzs, netTzs, vatIncludedTzs, count}, walkIn{…}}]` | plan endpoint; **shape requested** |
| `GET /vendor/reports/products` | `sort=revenue|units|slow, q, cursor, limit`; `rows[{productId, variant, name, removed, unitsSold, appUnits, walkInUnits, netRevenueTzs, lastSoldAt|null, stock|null, avgDailyUnits30, daysOfCover|null, coverState: ok|soon|none|out|untracked, profitTzs? }]`, `totals{unitsSold, netRevenueTzs}`, `nextCursor` | plan; **days-of-cover basis + fields requested** |
| `GET /vendor/reports/stock-value` (+ `tools.stockLedger`) | `asOf, totals{atRetailTzs, atCostTzs?, units, products}, costUnknown?{count, units, retailTzs}`, `rows[{productId, variant, name, stock, priceTzs, valueAtRetailTzs, costTzs?|null, valueAtCostTzs?|null}]` | plan; **shape requested**; products-list filter `noCost` for the link (**requested**) |
| `GET /vendor/reports/profit` (canSeeCost else 403 `cost_not_allowed`) | `totals{netExVatTzs, commissionTzs, costTzs, profitTzs, marginPct}` (costed lines only), `uncosted{lineCount, qty, revenueTzs}`, `buckets[…]`, `byProduct[…]`, `byChannel` | plan; **shape + 403 code requested** |
| `GET /vendor/reports/marketplace-net` (canSeeOrderMoney else 403 `payout_not_allowed`) | by delivered date: `totals{grossTzs, commissionTzs, payoutTzs, orderCount}`, `status{notDelivered{orders,payoutTzs}, waiting{…}, paidOut{…}}`, `weeks[{periodStartDate, periodEndDate, orderCount, grossTzs, commissionTzs, payoutTzs, statement{id, status, finalNetTzs}|null}]` (statement only when visible to vendor) | plan; **shape + 403 requested**; spec: equals `VendorSettlement` for a prepared week |
| `GET /vendor/reports/payment-methods` | `byYou[{method, amountTzs, count, sharePct}]` (cash net of change; sale payments by sale date + PMT by `receivedOn`), `viaFitFlex[{paymentMethod, amountTzs, count, sharePct}]` | **new, requested** (not in plan) |
| `GET /vendor/reports/customers` (+ `customers`, `tools.customers`) | `owedTzs, overdueTzs, aging{current,d1_30,d31_60,d61_90,d90plus}, asOf, creditSales{count, totalTzs}, collectedTzs, buyers{shop, app}` | **new, requested** (or extend `/vendor/receivables/aging`) |
| `GET /vendor/reports/refunds` (+ `tools.refunds`) | `rows[{refundId, number, refundedAt, saleId, saleNumber, amountTzs, method, restockedUnits, status}]`, totals; `{rows:[]}` before S7 | plan |
| `ShopOrder.paidAt` | timestamp set by `markPaid`/revive; **backfill** (PaymentRequest confirm time → `ShopOrderLineCost.createdAt` → `createdAt`) | **new column requested** (Q-2) |
| Cancellation date of a paid order | from `timeline` `cancelled` entry (or new `cancelledAt`) | **confirm** |
| App-order VAT | `VendorOrderInvoice.vatIncludedTzs` per order/vendor; 0 when no invoice | **confirm** this is the source |
| `GET /vendor/payments` | additive `todayNetTzs, weeklyNetTzs, monthlyNetTzs, pendingSettlementNetTzs, settledNetTzs` (read-only `vendorShareOfOrder`; payout engine unchanged) — Payouts segment shows "You receive" when present | plan (**call out in PR**) |
| CSV helper | formula-injection-safe quoting, BOM, CRLF; reused by `/vendor/payments/statement` | **requested** |
| Audit | `vendor_report_exported {section, from, to, format, includedCost}` | **requested** (Q-14) |
| Offline queue count | mobile local S3 queue (no backend) | exists on device |

---

## Open questions — decided 2026-10-22 (lead applied every recommendation below; owner may override)

- **Q-1 Mobile placement.** Rec: tab 2 becomes "Reports" with Reports | Payouts segments when the flag is on and the user has `reports`; no new tab (owner already has 6). Alt: a Reports tile in Business.
- **Q-2 App orders by date.** Rec: Sales/Products/Profit/Methods use the **paid date** (needs `ShopOrder.paidAt` + backfill); App sales after commission uses the **delivered date** (matches statements). Alt: placed date (`createdAt`, no migration; matches today's `todaySalesTzs`) — slightly wrong for late payments.
- **Q-3 Voids and late sales.** Rec: voids removed from the original day and shown as "Voided (not counted)"; offline/late-recorded sales count on `soldAt`, so past days can change ("Updated {time}").
- **Q-4 App refunds/cancellations after payment.** Rec: deducted as Refunds on the cancellation date; the paid day stays as it was (closed periods do not change, same rule as S7 credit notes). Alt: restate the paid day (simpler maths, but last month's export stops matching).
- **Q-5 Partial refunds (S7) in profit.** Rec: revenue reduced on the refund date; cost reversed only for units put back in stock; non-restocked units stay as a cost (a real loss).
- **Q-6 VAT in profit.** Rec: profit and margin on net ex-VAT; Sales shows VAT included as information.
- **Q-7 App channel profit.** Rec: subtract commission (profit = what the vendor keeps). Alt: show gross margin only and commission separately.
- **Q-8 Pay-later sales.** Rec: counted as sales on the sale date; money received shows in Payment methods when paid.
- **Q-9 Days of cover.** Rec: last 30 days, both channels, independent of the chosen period; ≤7 days = "Reorder soon".
- **Q-10 Caching and limits.** Rec: no device cache; server may cache closed periods (to < today EAT) for 10 minutes keyed by vendor + params + cost/payout visibility; never cache ranges that include today; range ≤ 366 days; buckets ≤ 120; CSV ≤ 50,000 rows else 413. Add indexes `ShopOrder(paidAt)` and use existing `VendorSale(vendorId, soldAt)`.
- **Q-11 CSV headers.** Rec: headers in the chosen language with "(TZS)"; raw integers; ISO dates in EAT. Alt: fixed English snake_case headers for accounting imports (could be added later as `lang=raw`).
- **Q-12 Historical stock value.** Rec: "as of now" only in v1 (replaying the ledger per date is heavy). Ask if month-end stock value is needed for accounts.
- **Q-13 FitFlex admin view of a vendor's reports.** Rec: not in S6 (admins already see cost via `shop` scope in admin products); add an admin read-only view later if support needs it.
- **Q-14 Export audit.** Rec: log each export (who, section, period, format, cost included).
- **Q-15 Payout visibility.** Rec: App sales after commission needs `canSeeOrderMoney` in addition to `reports`, so a `reports`-only staff member does not see commission (keeps S2 Q-5 rule).
- **Q-16 Time zone edges.** Rec: server owns EAT bucketing (`AT TIME ZONE 'Africa/Dar_es_Salaam'`); clients send dates, never timestamps; specs pin the clock at 21:30 UTC and 23:59 EAT to avoid the known 21:00–22:00 UTC flake.
- **Q-17 Compare with previous period.** Rec: not in v1; ask after vendors use it.

---

## 15. Acceptance criteria (UAT on portal and Flutter web from RC; isolated backend; seed: vendor owner, staff `vendorRole=admin`, staff with `reports` only, staff with `reports`+`payments`, staff with `reports`+`customers`, staff without `reports`; products with and without cost; walk-in sales incl. a void, a discount, a credit sale, a late-recorded sale; app orders paid, delivered, cancelled-after-payment; a paid-out vendor statement week)

Gating and permissions
1. With `reports: false` or options failing: no Reports nav (portal), tab 2 reads "Payments" with no segments (mobile), `/vendor/reports/?view=sales` and `/vendor/reports/sales` redirect to vendor home with no message; API answers 404 `feature_disabled`.
2. Flag on, owner: portal nav shows Reports after Customers; mobile tab 2 reads "Reports / Ripoti" with Reports | Payouts; Payouts shows today's payments content.
3. Staff without `reports`: no Reports nav/segment; deep link → first allowed section + "You don't have access to this report."
4. Staff with `reports` only: sees Overview, Sales, Products, Stock value (selling price only), Payment methods; no Profit, no App sales after commission, no Customers; no cost words anywhere; `/vendor/reports/profit` returns 403 `cost_not_allowed`, `/marketplace-net` 403 `payout_not_allowed`; the JSON for products/stock-value contains no `costTzs`, `valueAtCostTzs`, `profitTzs` keys.
5. Staff `vendorRole=admin` and the owner see Profit and cost columns; staff with `reports`+`payments` see App sales after commission but not Profit.
6. CSV and PDF exported by the `reports`-only staff contain no cost, profit, commission or payout columns or sections.

Figures (seeded data; compare with hand totals)
7. Sales for the seed month: Gross, Discounts, Refunds, Net and Count equal the sum of seeded lines; Net = Gross − Discounts − Refunds; table footer = strip totals = chart total.
8. The voided walk-in sale is in no total and appears as "Voided (not counted): 1 sales · TSh X".
9. The app order cancelled after payment counts as sales on its paid date and as a Refund on its cancellation date (Q-4).
10. VAT included shows only when a sale had VAT, and Net does not change when VAT is shown.
11. Channel App / Shop filters every figure; App + Shop = All for every bucket.
12. Credit (pay-later) sale counts in full on its sale date; only its paid-now part appears under Payment methods for that day; a later PMT appears on its received date.
13. A late-recorded walk-in sale counts on its sale day, not its recording day.

Dates and EAT
14. A walk-in sale at 23:30 EAT on 14 Oct (20:30 UTC) is on 14 Oct; one at 00:30 EAT on 15 Oct (21:30 UTC 14 Oct) is on 15 Oct — on portal, mobile, CSV and PDF, including when checked between 21:00 and 24:00 UTC.
15. Week grouping runs Monday–Sunday EAT; month grouping by EAT calendar month; Today covers 00:00–now EAT.
16. Custom range over 366 days or with a future end date cannot be applied; the error is shown and read out.

Products and stock
17. Best sellers sorts by net revenue; Most units by units; Slow sellers lists in-stock products with the fewest units, including "No sales in this period".
18. Days of cover: product with stock 30 and 60 units sold in the last 30 days shows "30 days"; stock 5 with 30 units → "5 days" + "Reorder soon"; stock 10 with no sales → "No sales in 30 days"; stock 0 → "Out of stock".
19. Stock value at selling price = Σ stock × price; at cost = Σ stock × cost over costed items only; the alert says "{n} products in stock have no cost price…" and links to products filtered by no cost.
20. Stock value ignores the period (controls disabled, "As of … today" shown).

Profit
21. Profit = net ex-VAT − commission (app) − cost on costed lines; margin = profit ÷ net ex-VAT on costed lines, one decimal.
22. Lines without a cost appear only in "Sold without a cost price: {n} items · TSh X. Not in profit." and are never counted as zero cost (profit does not rise when a cost is missing).

App sales after commission
23. For the seeded paid-out week, App sales, Commission and You receive equal that vendor statement's `salesTzs`, `commissionTzs`, `finalNetTzs`; the row badge reads "Paid out" and links to the statement.
24. A paid, undelivered order appears under "Paid, not delivered yet" and in no week row; a cancelled order appears nowhere.
25. A draft statement week shows "Not on a statement yet" (draft not visible to the vendor).

Customers and payment methods
26. Customers section (owner / `reports`+`customers`) shows Owed and Overdue equal to S4 Owed to you; Collected = sum of PMT in the period.
27. Payment methods show "Collected by you" and "Paid through FitFlex" as separate groups; Cash is after change; percentages add to 100% (±0.1) per group.

Export
28. CSV opens in Excel/Sheets with Swahili characters intact; money columns end "(TZS)"; numbers have no separators; dates are YYYY-MM-DD.
29. A product named `=HYPERLINK("x")` or `+255…` exports as text starting with `'`; no formula runs.
30. PDF summary lists only permitted sections, has tables (no charts), page numbers, the not-a-tax-document footer, and is tagged with the chosen language.
31. Mobile Export opens the share sheet with the file (Flutter web: the file downloads); portal Export downloads; a period that exceeds the row limit shows "This report is too big to download. Choose a shorter period."
32. Each export creates one audit row with section, period, format and whether cost was included (server spec).

States
33. Loading shows skeletons per card; one failing endpoint shows an error with Try again in that card only.
34. A period with no sales shows "No sales in {period}." with Try another period; a brand-new vendor sees the first-use message with the right action for their permissions.
35. Mobile offline: the Reports segment shows "No connection" with Try again and no old figures.
36. With 2 offline sales queued on the device, the banner "2 sales on this phone are waiting to sync…" shows; after sync and refresh the banner goes and totals include them.
37. Changing the period quickly twice renders only the last period's figures.

Accessibility and language
38. Every chart has a spoken summary and a table/card list with the same numbers; no figure is shown only in a chart or only by colour.
39. Every control (presets, dates, channel, grouping, view switch, sortable headers, export options, refresh, cards) has a screen-reader label in the Flutter web tree / DOM; sortable headers expose `aria-sort`; view change moves focus to the view heading.
40. Touch targets ≥48dp mobile / ≥44px portal; contrast ≥4.5:1 for text and ≥3:1 for chart series in light and dark.
41. In Kiswahili at 375px and 200% text: no clipped text in nav, segments, pills, cards, alerts, tables or export sheet; portal view switch is a Select below `md`; no English except "Stock", "app", "VAT", "CSV", "PDF", "TZS", method brand names, product names and user-entered text.

Not verifiable on Flutter web (needs a real device): Android share sheet with the CSV/PDF file into WhatsApp/Drive, the device offline queue banner on a real network drop.

Standing reminders: VENDOR_TOOLS + VENDOR_REPORTS stay off until the owner says otherwise; vendor settlement has never been exercised by hand (App sales after commission depends on it); shop payments are manual (D-9); VAT DR-05 open; vendor terms (data ownership, report exports) are drafts pending Tanzanian counsel; all Swahili above is draft for native review.
