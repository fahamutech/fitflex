# Vendor stock ledger (S1): design spec

Status: DRAFT for review. Date: 2026-10-19. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0–1, S1, §4 (approved 2026-10-19).
Read from: fitflexmobile `origin/release-candidate` (`lib/screens/vendor/vendor_home_page.dart`, `lib/shared/components/*`, `lib/shared/inbox/inbox_controller.dart`, `lib/main.dart`), canon `04-marketing/design-system.md` (V2, 2026-10-18).
Platform: Flutter mobile, vendor and vendor_staff. Portal: none in S1.

## 0. Scope, gating, reuse

**Gating.** On entry to the vendor home (and on pull-to-refresh), call `GET /vendor/tools/options` once per session.
- `stockLedger: true`: everything in this spec.
- `stockLedger: false`, request failed, or field missing: the current behaviour, unchanged (form sends `stock`, comma-separated variants field, no Adjust stock, no history, no low-stock filter or badge). This fails closed. No error is shown for a failed options call. It retries on the next refresh.
- Never show a "feature off" message. The new UI is simply not there.

**Permission.** All new UI requires `products`. The vendor (owner) always has it. Vendor staff need `vendor.permission.products`. Today, staff without it never see the Products tab (`_sections`). The same rule hides every entry point here. Section 5 covers the deep-link case.

**Components reused (no new shared component).**

| Need | Reuse |
|---|---|
| Sheets (product form, adjust stock) | `showFFSheet` / `FFSheet` (title, close, keyboard inset, 90% max height). The product form moves from the raw `showModalBottomSheet` to `showFFSheet`. |
| Reason chips, direction choice | `FFPill(filled: selected, onTap:)` in a `Wrap`, wrapped in `Semantics(selected:, inMutuallyExclusiveGroup: true)`. FFPill already has a 48dp hit area. |
| Date range, All/Low filter | `FFSegmented` for the 7d/30d/custom range. Filter chips use `FFPill` (they wrap, which matters for Swahili; see §7). |
| Inputs | `FFTextField` (`keyboardType: number`, `FilteringTextInputFormatter.digitsOnly`, `maxLength: 200` for notes) |
| Inline errors and warnings | `FFAlert` (error / warning / info) |
| Low badge | `FFBadge(tone: FFBadgeTone.warning)` on cards, Material `Badge` on the Products `NavigationDestination` |
| Loading | `FFSkeletonList(semanticLabel:)`, `FFSpinner` inside buttons |
| Empty / error | `FFEmptyState`, `FFErrorState(onRetry:)` |
| Feedback | `FFSnack.success/error` |
| Buttons | `FFButton` primary / secondary / ghost |
| Cards | `FFCard` |

New files go under `lib/screens/vendor/stock/`: `adjust_stock_sheet.dart`, `stock_history_page.dart`, `variant_rows_editor.dart`, `stock_options.dart` (options fetch and cache). `vendor_home_page.dart` gets only entry points (menu items, filter, badge, form wiring).

**Colour.** Light theme: brand green `#1F7A3A` ramp for primary actions. Dark theme: Volt `#C8F04A` primary with on-volt `#020617`. Volt must never appear as text or icons on light grounds. Low stock = warning (Amber tones from `FFToneTheme`). Do not use Fuel or danger for it, because low stock is a nudge and not an error. Positive deltas use success tone. Negative deltas use the strong text colour. The sign (+/−) and the before→after text carry the meaning, so colour is never the only signal.

## 1. Product form (`VendorProductForm`)

Purpose: set price, stock, cost and reorder levels per product and per variant, without overwriting stock that moved since the form opened.

### 1.1 Layout (375px; web: sheet constrained to max width 560, centred)
Order of fields (unchanged fields keep their place):
1. Photos, name, brand, description, category, as today.
2. Row: **Price** | **Stock** (see 1.2).
3. Row: **Cost price** (`vendor.costPrice`, optional, helper `vendor.costPriceHelp`) | **Reorder level** (`vendor.stock.reorderLevel`, optional, helper `vendor.stock.reorderHelp`). At text scale ≥1.3 or in Swahili, two-up rows stack to one column when each field would be <160px wide.
4. Discount price, SKU/weight, as today.
5. **Variants** section (replaces the comma field). The section title is `vendor.variants` and it has an "Add variant" ghost button (`vendor.variant.add`, icon `add`). Each variant is an `FFCard` row:
   - Line 1: Variant name (full width) + remove icon button (48×48, tooltip/semantics `vendor.variant.remove` with name).
   - Line 2: Stock | Cost price | Reorder level. At 375px these become 2 + 1 lines: Stock and Cost on one row, Reorder below. Desktop shows 3 in a row.
6. Visible switch, Save.

When the product has ≥1 variant, product-level **Stock** shows the sum of variant stocks, read-only, labelled `vendor.stock.totalFromVariants` (O-1). Product-level Cost and Reorder stay editable and are stored with variant `''`.

### 1.2 Stock field by mode
| Mode | Product stock | Existing variant stock | New variant stock |
|---|---|---|---|
| Create | Editable, label `vendor.stock.initial`, integer ≥0, default empty → 0 | n/a | Editable (initial) |
| Edit | Read-only (`readOnly: true`), label `vendor.stock.current`, with trailing `FFButton` ghost "Adjust stock" (`vendor.stock.adjust`) that opens §2 for this product (variant picker preselected to none). Helper `vendor.stock.readOnlyHelp`. | Read-only value + small "Adjust" ghost button (48dp) opening §2 with this variant preselected | Not shown. Info line `vendor.variant.newStartsAtZero`. |

**Request body (flag on).**
- Create sends `stock` and `variants:[{name, stock, costTzs?, reorderLevel?}]`.
- Edit sends **no `stock`** and `variants:[{name, costTzs?, reorderLevel?}]` with no `stock` key. The server merges by name and keeps the stored stock.
- Product-level `costTzs` and `reorderLevel` are sent in both modes. An empty field sends `null`.

### 1.3 Validation (inline `errorText`, Save stays enabled; on Save the first invalid field gets focus)
- Stock / cost / reorder: digits only. A non-integer or negative value is blocked by the formatter. An empty cost or reorder is allowed.
- Variant name required (`vendor.variant.nameRequired`). Names must be unique, case-insensitive (`vendor.variant.duplicateName`).
- Removing an existing variant with stock >0 is blocked. The remove control stays enabled and shows `FFAlert` warning `vendor.variant.removeHasStock` under the row. **Planner to confirm** what the server does with an omitted variant (see Q-2).
- Existing save errors keep `_saveFailedText` (`invalid_stock` etc.).

### 1.4 States
- Saving: Save button shows spinner, form inputs disabled.
- Save success: sheet closes, `vendor.productSaved` snack, list refreshes. Editing only cost or reorder must not send the product back to review (F1). Verified by AC-6.
- Save error / offline: sheet stays open with values kept, `FFSnack.error` (`vendor.saveFailed` or `error.network`).
- Pending-approval vendor: same form. The existing pending banner stays.

## 2. Adjust stock sheet

Purpose: record why stock changed so the ledger stays explainable. Opened from: the product form (1.2), the product card menu (§4), and stock history (§3).

### 2.1 Layout (`showFFSheet`, title `vendor.stock.adjust`; subtitle = product name, 1 line, ellipsis; web max width 560)
1. **Variant** (only when product has ≥1 variant; required): dropdown `vendor.stock.variantLabel`, placeholder `vendor.stock.pickVariant`. Each option shows `name · {stock}`. Product-level adjustment is not offered when variants exist (O-1).
2. **Current stock**: large number (`titleLarge`) labelled `vendor.stock.current`, for the selected variant or the product. Hidden until a variant is picked.
3. **Reason** `vendor.stock.reasonLabel`: chip `Wrap` with 8 chips in this order: Counted, Restocked, Returned, Found, Damaged, Expired, Lost, Other. No default selection. Single select.
4. Body by reason:
   - **Counted** (`count`): field `vendor.stock.counted` (integer ≥0, autofocus). Preview line under it: `vendor.stock.difference` with signed delta (e.g. "Difference: −3"), or `vendor.stock.noDifference` when equal. The preview is a live region (`Semantics(liveRegion: true)`).
   - **Restocked, Returned, Found** (in): field `vendor.stock.quantityIn` (integer ≥1). Preview `vendor.stock.after` = current + qty.
   - **Damaged, Expired, Lost** (out): field `vendor.stock.quantityOut` (integer ≥1). Preview `vendor.stock.after` = current − qty. If the result would go below 0, an inline error `vendor.stock.insufficient` appears and Save is disabled.
   - **Other**: first `vendor.stock.direction` with two chips, Add (`vendor.stock.add`) and Remove (`vendor.stock.remove`), then the in or out field as above. The note becomes required.
5. **Note**: `FFTextField` multiline (2–4 lines), `maxLength: 200` with counter. Label `vendor.stock.note`, or `vendor.stock.noteRequired` for Other.
6. Primary button full width: `vendor.stock.saveCount` for Counted, otherwise `vendor.stock.save`. Disabled until variant (if any), reason, and a valid quantity (plus note for Other) are set. Secondary: Cancel (`common.cancel`).

### 2.2 Request
`POST /vendor/products/:id/stock-adjustments`:
- `{ variant?, reason, quantity, expectedStock? (count only = the current stock shown), direction? (other only), note?, clientRef }`.
- `reason` values: `count | damaged | expired | lost | found | returned | restock | other`.
- `clientRef` is a UUID created on the first Save tap. It is **reused on every retry** of the same entry and discarded after success or when the sheet closes.

### 2.3 States
| State | Behaviour |
|---|---|
| Loading (current stock refresh on open) | Current stock shows `FFSkeletonLine`. Reason chips are usable. Save is disabled until loaded. |
| Submitting | Save shows a spinner. All inputs are disabled. The sheet cannot be dismissed (`isDismissible: false` while busy). |
| Success (201, or 200 replay) | Sheet closes. `FFSnack.success` shows `vendor.stock.updated` (before → after from `movement`). The product card or history updates from the returned `product` (no full reload needed). |
| 409 `stock_changed` | `FFAlert` warning at the top of the sheet: `vendor.stock.changed`. Current stock updates to `currentStock`. The counted field is **cleared and refocused**. Difference recomputes on new input. A new `clientRef` is used on the next Save, because the entry has changed. The screen reader announces the alert. |
| 409 `insufficient_stock` | Current stock updates to `currentStock`. Inline error `vendor.stock.insufficient` with the new number. The quantity is kept so the user can lower it. |
| 400 `note_required` / `note_too_long` | Inline error on the note (`vendor.stock.noteMissing` / counter). |
| 400 `invalid_quantity` / `invalid_reason` | Inline `vendor.stock.quantityInvalid` / generic `vendor.saveFailed`. |
| 403 `not_your_product` or permission 403 | Sheet closes. `FFSnack.error` shows `vendor.stock.notAllowed`. |
| 404 / product deleted | Sheet closes. `FFSnack.error` shows `vendor.stock.notFound`. The list refreshes. |
| Offline / network / 5xx | The sheet stays open with all values kept. `FFAlert` error shows `error.network` plus `vendor.stock.nothingSaved`. Save becomes "Try again" (`common.retry`) and retries with the **same clientRef**, so a request that actually reached the server is not applied twice. S1 has no offline queue. |
| Role-restricted | Not reachable without `products` (entry points hidden). A 403 is handled as above. |

## 3. Stock history screen (`StockHistoryPage`)

Purpose: show every change to one product's stock in a period, with who did it and why.

Route: `/vendor/products/:productId/stock` (new GoRoute; `productId` checked against the existing `_safeId` pattern). Query params: optional `variant` (preselect for Adjust) and `from=push`.

### 3.1 Layout
- AppBar: title `vendor.stock.history`, subtitle product name (1 line, ellipsis). Back arrow (semantics "Back"). Behaviour in §5.
- Header `FFCard`:
  - Current stock (`titleLarge`) labelled `vendor.stock.current` and reorder level (`vendor.stock.reorderLevel: n` or `—`).
  - `FFBadge` warning `vendor.stock.lowBadge` when low.
  - When there are variants, a compact list `name · stock` with a low badge per variant.
  - Primary button "Adjust stock" (full width at 375, inline right on desktop).
- Range: `FFSegmented` with Last 7 days / Last 30 days (default) / Choose dates. "Choose dates" opens `showDateRangePicker` (localised, EAT dates, max today).
- Summary row: two `FFStatTile`s, `vendor.stock.opening` and `vendor.stock.closing`, from `openingStock` / `closingStock`.
- Rows (newest first), each an `FFCard` / list tile, min height 64:
  - Line 1: reason label (§8.4) · variant name if any. Trailing signed delta (`+5` success tone / `−2` strong text), `titleMedium`, tabular figures.
  - Line 2: `before → after` (e.g. "12 → 10") · time (`19 Oct, 14:05`, EAT, 24h) · actor (`vendor.stock.by` or `vendor.stock.bySystem` when actor is null).
  - Line 3 (when present): note, max 3 lines with expand on tap. The note `product_form` is shown as `vendor.stock.fromProductForm`.
  - Order link: when `document.type == 'order'`, a ghost link button `vendor.stock.order` with `{number}`. It opens the Orders tab (`/vendor/home?open=orders`). It shows only if the user has `orders`. Otherwise it is plain text. There is no order detail screen today. See Q-4.
- Pagination: `FFButton` ghost "Load more" (`vendor.stock.loadMore`) at the end while `nextCursor != null`. Not infinite scroll, which keeps it accessible and testable. Appended rows keep scroll position.
- Desktop (Flutter web ≥900px): content max width 720, centred. The header card and range sit side by side.

### 3.2 States
| State | Behaviour |
|---|---|
| Loading (first) | Header skeleton + `FFSkeletonList(count: 5, semanticLabel: vendor.stock.loading)` |
| Loading more | Spinner in the Load more button. Existing rows stay. |
| Empty | Summary still shown (opening = closing). `FFEmptyState` icon `history`, title `vendor.stock.historyEmpty`, action "Adjust stock". |
| Error (first load) | `FFErrorState` with `vendor.stock.historyFailed` and retry `common.retry` |
| Error (load more) | Inline `FFAlert` error + retry button. Rows already loaded stay. |
| Offline | Same as error, using `error.network`. Nothing is cached in S1. |
| Product not found / 403 | `FFErrorState` with `vendor.stock.notFound` / `vendor.stock.notAllowed` and a button back to Products |
| Pull to refresh | Reloads header + first page for the current range |
| After an adjustment | Header updates. History reloads page 1 for the current range. |

## 4. Products tab: low stock, entry points

- **Filter row** (flag on, above the list, scrolls with it): two `FFPill`s, `vendor.stock.all` and `vendor.stock.lowFilter` with count. It shows only when the low count is >0, or while the Low filter is selected. Selected = filled. Semantics: selected state + "n" in the label.
- **Low set and count:** `GET /vendor/stock/low` on load and refresh. A product is "low" if it appears in that list (product row or any variant). The client does not recompute low.
- **Card:**
  - Subtitle stays `price · stock in stock`.
  - When low, add `FFBadge` warning `vendor.stock.lowBadge`. For variants add `vendor.stock.lowVariants` (n).
  - Tapping the card (new `onTap`, flag on only) opens Stock history.
  - The overflow menu gains "Adjust stock" and "Stock history", placed after Edit. The menu button has semantics `vendor.productActions` with the name.
- **Nav badge:** the Products `NavigationDestination` icon gets a Material `Badge` with the low count (hidden at 0, "99+" cap). Semantics `vendor.stock.lowNavLabel`.
- **Low filter empty** (count went to 0 while selected): `FFEmptyState` `vendor.stock.lowEmpty` + "Show all" action (`vendor.stock.all`).
- **Low call fails:** no badge, no filter, no error shown. The products list still loads.

## 5. Navigation and deep links

| Entry | Goes to | Back |
|---|---|---|
| Product card tap / menu "Stock history" | `context.push('/vendor/products/:id/stock')` | Pops to Products tab, same filter and scroll |
| Menu / form / history "Adjust stock" | Sheet over the current screen | Closes the sheet. A successful save from the form updates the read-only stock in the still-open form. |
| Push or inbox `vendor_low_stock` (`data.productId`, `data.variant`) | `/vendor/products/:productId/stock?variant=…&from=push` | When nothing to pop: `go('/vendor/home?open=products&filter=low')` |

Deep-link rules:
- `partnerLinkFor` maps `vendor_low_stock` to a new link `lowStock`. `partnerRouteFor` gains `productId` (checked with `_safeId`). `main.dart` passes `data['productId']`.
- If `productId` is missing or invalid, go to `/vendor/home?open=products&filter=low`.
- If `stockLedger` is false, go to `/vendor/home?open=products` and show no new UI.
- Staff without `products` land on their first allowed section with `FFSnack.error` `vendor.stock.noProductsAccess`. They never see a blank screen.
- Product deleted: history shows the not-found state (§3.2).
- Inbox button label: `inbox.open.lowStock`.
- After completion (adjust saved), the user stays where they were. The ledger never navigates on its own.

## 6. Accessibility (Flutter web exposes the semantics tree)
- Touch targets ≥48dp (FFPill, FFButton and IconButton defaults). The small "Adjust" buttons in variant rows must keep 48dp height.
- Every actionable control has a label:
  - Remove variant: `vendor.variant.remove` with name.
  - Variant row fields: label prefixed with variant name, e.g. "Large: Stock".
  - Reason chips: label + selected.
  - Delta: "+5" read as `vendor.stock.deltaIn`/`deltaOut` ("5 added" / "2 removed").
  - History row: merged semantics `vendor.stock.rowLabel`.
  - Nav badge: `vendor.stock.lowNavLabel`.
- Focus order in the sheet: close → variant → reason chips (left to right) → direction (Other) → quantity → note → Save → Cancel. After a 409, focus moves to the alert and then the counted field.
- Contrast:
  - Warning badge text must be ≥4.5:1 in light and dark. Use `warning700` on `warning50` in light, and the FFToneTheme dark pair in dark.
  - Success delta: `success700` on light.
  - Volt only in dark.
  - Check the read-only stock field text against the disabled style. It must stay ≥4.5:1 because it is information, not a disabled control. Use `readOnly`, not `enabled: false`.
- Text scale 200%: no clipped labels. Two-up rows stack. Chips wrap. Numbers never truncate.
- Live regions: difference/after preview, 409 alert, success snack.

## 7. Swahili length and overflow
- Swahili runs 20–30% longer. Worst cases:
  - `vendor.stock.low` "Stock inakaribia kuisha" (23 chars). Use it only in headings and the push. Badges and filters use the short `lowBadge` / `lowFilter` "Stock chache".
  - Reason chips: "Muda wake umeisha" and "Stock imeongezwa" are each ~17 chars. The chips `Wrap` onto 3 lines at 375px and never scroll horizontally.
  - `vendor.stock.changed` is ~50 chars and must wrap inside the `FFAlert`.
- Product name subtitle: 1 line with ellipsis. The full name goes in semantics.
- Range segmented: "Siku 7 zilizopita" / "Siku 30 zilizopita" / "Chagua tarehe". If any label overflows at 375px, FFSegmented switches to compact. If it still overflows, show "7d / 30d" style short labels `range.7dShort`, which are not needed in EN. design-qa checks this at 375 in SW.
- Number format: no thousands separator under 10,000. Above that, use `formatCurrency`-style grouping without the currency.

## 8. Strings (EN + SW)

All SW are **drafts for native review** unless they come from plan §4 (also drafts). "Stock" stays English (glossary). "Variant" = "aina" (existing `vendor.variants` "Aina mbadala"). Placeholders: `{n}`, `{name}`, `{before}`, `{after}`, `{delta}`, `{ref}`.

### 8.1 Form
| Key | EN | SW (draft) |
|---|---|---|
| vendor.costPrice | Cost price | Bei ya kununua |
| vendor.costPriceHelp | Only you and your staff see this. | Wewe na wafanyakazi wako tu mnaona hii. |
| vendor.stock.reorderLevel | Reorder level | Kiwango cha kuagiza tena |
| vendor.stock.reorderHelp | We'll alert you when stock falls to this number. | Tutakujulisha Stock ikifika idadi hii. |
| vendor.stock.initial | Starting stock | Stock ya kuanzia |
| vendor.stock.current | In stock now | Stock iliyopo sasa |
| vendor.stock.readOnlyHelp | To change stock, use Adjust stock so the change is recorded. | Kubadilisha Stock, tumia Rekebisha Stock ili mabadiliko yarekodiwe. |
| vendor.stock.totalFromVariants | Total from variants | Jumla ya aina zote |
| vendor.variant.add | Add variant | Ongeza aina |
| vendor.variant.name | Variant name | Jina la aina |
| vendor.variant.remove | Remove variant {name} | Ondoa aina {name} |
| vendor.variant.newStartsAtZero | New variants start at 0. Save, then use Adjust stock to add stock. | Aina mpya zinaanza na 0. Hifadhi, kisha tumia Rekebisha Stock kuongeza Stock. |
| vendor.variant.removeHasStock | Bring this variant's stock to 0 with Adjust stock before removing it. | Punguza Stock ya aina hii hadi 0 kwa Rekebisha Stock kabla ya kuiondoa. |
| vendor.variant.nameRequired | Enter a name for each variant. | Weka jina kwa kila aina. |
| vendor.variant.duplicateName | Two variants have the same name. | Aina mbili zina jina moja. |
| vendor.form.wholeNumber | Enter a whole number, 0 or more. | Weka namba kamili, 0 au zaidi. |

### 8.2 Adjust sheet
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.adjust | Adjust stock | Rekebisha Stock |
| vendor.stock.variantLabel | Variant | Aina |
| vendor.stock.pickVariant | Choose a variant | Chagua aina |
| vendor.stock.reasonLabel | Why is stock changing? | Kwa nini Stock inabadilika? |
| vendor.stock.reason.count | Counted | Imehesabiwa |
| vendor.stock.reason.damaged | Damaged | Imeharibika |
| vendor.stock.reason.expired | Expired | Muda wake umeisha |
| vendor.stock.reason.lost | Lost | Imepotea |
| vendor.stock.reason.found | Found | Imepatikana |
| vendor.stock.reason.returned | Returned | Imerudishwa |
| vendor.stock.reason.restock | Restocked | Stock imeongezwa |
| vendor.stock.reason.other | Other | Nyingine |
| vendor.stock.counted | Counted quantity | Idadi uliyohesabu |
| vendor.stock.difference | Difference: {delta} | Tofauti: {delta} |
| vendor.stock.noDifference | Matches current stock | Inalingana na Stock iliyopo |
| vendor.stock.direction | Add or remove? | Ongeza au ondoa? |
| vendor.stock.add | Add | Ongeza |
| vendor.stock.remove | Remove | Ondoa |
| vendor.stock.quantityIn | Quantity to add | Idadi ya kuongeza |
| vendor.stock.quantityOut | Quantity to remove | Idadi ya kuondoa |
| vendor.stock.after | Stock after: {n} | Stock itakuwa: {n} |
| vendor.stock.note | Note (optional) | Maelezo (si lazima) |
| vendor.stock.noteRequired | Note (required) | Maelezo (lazima) |
| vendor.stock.noteMissing | Add a note to explain this change. | Ongeza maelezo ya mabadiliko haya. |
| vendor.stock.quantityInvalid | Enter a whole number greater than 0. | Weka namba kamili zaidi ya 0. |
| vendor.stock.save | Save change | Hifadhi mabadiliko |
| vendor.stock.saveCount | Save count | Hifadhi hesabu |
| vendor.stock.changed | Stock changed while you were counting. Count again. | Stock imebadilika ulipokuwa ukihesabu. Hesabu tena. |
| vendor.stock.insufficient | Only {n} in stock. You can't remove more than that. | Zipo {n} tu. Huwezi kuondoa zaidi ya hizo. |
| vendor.stock.nothingSaved | Nothing was saved. | Hakuna kilichohifadhiwa. |
| vendor.stock.updated | Stock updated: {before} → {after} | Stock imesasishwa: {before} → {after} |
| vendor.stock.notAllowed | You don't have permission to change stock. | Huna ruhusa ya kubadilisha Stock. |
| vendor.stock.notFound | This product is no longer available. | Bidhaa hii haipatikani tena. |

Reused (exist today): `common.cancel`, `common.retry`, `error.network`, `vendor.saveFailed`, `vendor.productSaved`, `vendor.variants`, `vendor.inStock`.

### 8.3 History
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.history | Stock history | Historia ya Stock |
| vendor.stock.opening | Opening stock | Stock mwanzoni |
| vendor.stock.closing | Closing stock | Stock mwishoni |
| vendor.stock.range.7d | Last 7 days | Siku 7 zilizopita |
| vendor.stock.range.30d | Last 30 days | Siku 30 zilizopita |
| vendor.stock.range.custom | Choose dates | Chagua tarehe |
| vendor.stock.loading | Loading stock history | Inapakia historia ya Stock |
| vendor.stock.historyEmpty | No stock changes in these dates. | Hakuna mabadiliko ya Stock katika tarehe hizi. |
| vendor.stock.historyFailed | Could not load stock history. | Imeshindikana kupakia historia ya Stock. |
| vendor.stock.loadMore | Load more | Pakia zaidi |
| vendor.stock.by | By {name} | Na {name} |
| vendor.stock.bySystem | FitFlex (automatic) | FitFlex (moja kwa moja) |
| vendor.stock.order | Order {ref} | Oda {ref} |
| vendor.stock.fromProductForm | Changed in the product form | Imebadilishwa kwenye fomu ya bidhaa |
| vendor.stock.deltaIn | {n} added | {n} zimeongezwa |
| vendor.stock.deltaOut | {n} removed | {n} zimeondolewa |
| vendor.stock.rowLabel | {reason}, {delta}, from {before} to {after}, {time}, {actor} | {reason}, {delta}, kutoka {before} hadi {after}, {time}, {actor} |

### 8.4 Ledger reason labels (history rows; S1 shows these, later slices add more)
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.reason.reserve | Order placed | Oda imewekwa |
| vendor.stock.reason.release | Order cancelled, back in stock | Oda imeghairiwa, imerudi kwenye Stock |
| vendor.stock.reason.unknown | Stock change | Badiliko la Stock |

Any reason without a key (e.g. `sale`, `stock_in` before their slices) shows `reason.unknown`, never the raw code.

### 8.5 Low stock, products tab, deep link, push
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.low | Low stock | Stock inakaribia kuisha |
| vendor.stock.lowBadge | Low stock | Stock chache |
| vendor.stock.lowFilter | Low stock ({n}) | Stock chache ({n}) |
| vendor.stock.all | All products | Bidhaa zote |
| vendor.stock.lowEmpty | Nothing is low on stock. | Hakuna bidhaa yenye Stock chache. |
| vendor.stock.lowVariants | {n} variants low | Aina {n} zina Stock chache |
| vendor.stock.lowNavLabel | Products, {n} low on stock | Bidhaa, {n} zina Stock chache |
| vendor.productActions | Actions for {name} | Vitendo vya {name} |
| vendor.stock.noProductsAccess | You don't have access to products. | Huna ruhusa ya kuona bidhaa. |
| inbox.open.lowStock | View stock | Angalia Stock |
| (server) vendor_low_stock title | Low stock: {product} | Stock inakaribia kuisha: {product} |
| (server) vendor_low_stock body | Only {n} left. Time to restock. | Zimebaki {n} tu. Ni wakati wa kuongeza Stock. |

For a variant, the server title is `{product} ({variant})`. The push strings live in the functions notification templates (backend-builder). They are listed here so i18n-swahili-auditor checks both.

## 9. Backend fields needed (for fitflex-planner / contract-checker to confirm)
- `GET /vendor/tools/options` → `stockLedger: bool`.
- `GET /vendor/products` items:
  - `id, name, stock, status, approvalStatus`
  - `costTzs|null`, `reorderLevel|null`
  - `variants:[{ name, stock|null, costTzs|null, reorderLevel|null }]`
- `PUT/POST /vendor/products[/:id]` accepts the above. On edit it accepts a body without `stock` and without `variants[].stock`.
- `POST /vendor/products/:id/stock-adjustments`: as in plan S1, including `movement.stockBefore/stockAfter`, `product.stock/variants`, and 409 bodies with `currentStock`.
- `GET /vendor/products/:id/stock-movements`:
  - `openingStock, closingStock, nextCursor`
  - `rows[]: { id, reason, variant, delta, stockBefore, stockAfter, note, actor:{id,name}|null, createdAt, document:{type,id,number}|null }`
  - `from`/`to` as EAT dates (`YYYY-MM-DD`).
- `GET /vendor/stock/low` → `[{ productId, name, variant, stock, reorderLevel }]`.
- Push/inbox `vendor_low_stock` data: `type, productId, variant, stock`.

## 10. Open questions — answered 2026-10-19 (owner delegated; recorded by lead session)

Answers:
- **Q-1:** Yes — a variant with no own value inherits the product-level `costTzs` / `reorderLevel` (resolved server-side).
- **Q-2:** Omitting an existing variant on save removes it; refused with 409 `variant_has_stock` if its stock > 0.
- **Q-3:** `vendor_low_stock` fires only when `VENDOR_TOOLS` + `VENDOR_STOCK_LEDGER` are on.
- **Q-4:** Order-linked rows carry `document:{type:'order', id, number}`; `number` may be null — fall back to a short id.
- **Q-5:** Yes, history accepts an optional `variant` filter.
- **Q-6:** No mixing — all variants track stock or none; mixed is rejected with 400 `variant_stock_mixed`.

Original questions:
- **Q-1:** Does a variant row inherit the product-level `reorderLevel` / `costTzs` when its own is null (for low-stock and cost snapshot)? The spec shows them as separate and does not imply inheritance.
- **Q-2:** What does `PUT` do with an existing variant omitted from `variants`? Delete it, and what happens to its stock and ledger? The spec blocks removing a variant with stock >0 until this is confirmed.
- **Q-3:** Is the `vendor_low_stock` notification gated by `VENDOR_STOCK_LEDGER`? Ledger rows are not flagged. The spec handles it either way (§5).
- **Q-4:** Order link in history: there is no vendor order detail screen, so it opens the Orders tab. Does `document.number` exist for orders (the order reference shown to vendors)?
- **Q-5:** Should `stock-movements` take a `variant` filter? Not specified, and not used in S1.
- **Q-6:** Can a variant have untracked stock (`stock: null`) while others are tracked? If yes, Adjust stock needs a rule for it. The spec assumes all variants are tracked once the ledger is on.

## 11. Acceptance criteria (UAT on Flutter web from RC, isolated backend, seed vendor accounts)

Gating
1. With `stockLedger: false`, the product form, product cards, menu, nav bar and push routing look and behave exactly as on current RC. No Adjust stock, history, low filter or badge appears anywhere.
2. If `/vendor/tools/options` fails (e.g. blocked in devtools), the app behaves as AC-1 and shows no error.

Product form (flag on)
3. Create: Stock is editable. Adding variants "Small" (5) and "Large" (3) and saving shows the product with stock 8, and both variants appear in history as initial stock.
4. Edit: product Stock and existing variant stock are read-only and show "Adjust stock". The PUT request body (network tab) contains no `stock` key at product or variant level.
5. Edit: a new variant has no stock field and shows the "start at 0" message. After saving it has stock 0.
6. Edit: changing only cost price or reorder level saves, and the product remains visible in the member shop (not re-queued for approval).
7. Duplicate or empty variant names show inline errors and the save is not sent.
8. Removing a variant with stock >0 shows the warning and does not remove it.
9. Cost price never appears in any member shop screen or `/shop/*` response for that product.

Adjust stock
10. Reason chips appear in the order Counted, Restocked, Returned, Found, Damaged, Expired, Lost, Other. None is preselected and Save is disabled until a reason and a valid quantity are set.
11. Counted: entering 7 when current is 10 shows "Difference: −3". Save records a `count` row 10 → 7.
12. Damaged 2 from 7 shows "Stock after: 5" and records −2. Restocked 4 records +4.
13. Removing more than current shows the insufficient message and disables Save.
14. Other requires choosing Add/Remove and a note. Saving without a note shows the note error.
15. Note is capped at 200 characters with a visible counter.
16. Product with variants: Save is disabled until a variant is picked. Current stock shows the picked variant's stock.
17. Stale count: open Counted, change the same product's stock in another session, then save. The warning "Stock changed while you were counting. Count again." appears, current stock shows the new number, and the counted field is empty and focused.
18. Offline: with network off, Save shows the network error and "Nothing was saved". The entered values stay. With network back, "Try again" succeeds, and history shows exactly one row for that entry.
19. Success shows "Stock updated: X → Y" and the product card and open form show the new stock without a manual refresh.

History
20. Card tap and menu "Stock history" open the history for that product. Back returns to the same tab, filter and scroll.
21. Default range is Last 30 days. Opening and closing stock are shown. Switching to 7 days or a custom range reloads rows.
22. Each row shows reason, signed delta, before → after, time (EAT), actor name (or "FitFlex (automatic)"), and the note when present. A change made through the old-app path shows "Changed in the product form".
23. With more than 50 rows, "Load more" appends the next page without losing position and disappears at the end.
24. A row linked to an order shows "Order {ref}". Tapping it opens the Orders tab (user with `orders`). For a user without `orders` it is plain text.
25. Empty range shows the empty state with an Adjust stock action. A failed load shows the error state with "Try again".

Low stock
26. With reorder level 5 and stock 5 or less, the card shows the "Low stock" badge, the Products nav icon shows the count, and the "Low stock (n)" filter shows only low products.
27. Restocking above the reorder level removes the badge and lowers the count after the update.
28. Push/inbox `vendor_low_stock` opens that product's stock history (real device for push; on web use the inbox message). Back with no history goes to Products with the Low filter on.
29. Deep link with a deleted product shows the not-found state. Deep link for staff without `products` lands on their first section with the "no access to products" message.

Permissions
30. Vendor staff without `products` see no Products tab and no stock UI anywhere. Staff with `products` can adjust stock and see history.

Accessibility and language
31. Every control in the form, sheet, history and filter has a screen-reader label (check the web semantics tree). Reason chips announce selected state. The difference preview and the 409 alert are announced.
32. All touch targets are ≥48dp, including the variant row "Adjust" and remove buttons.
33. Text contrast ≥4.5:1 in light and dark, including the low badge, deltas and read-only stock. Volt appears only in dark.
34. In Swahili at 375px and at text scale 200%: no clipped or overlapping text in chips, filter, segmented range, form rows, alerts or history rows. Two-up fields stack.
35. No English appears in Swahili mode on these screens, except "Stock", product and variant names, and user notes.

Not verifiable on Flutter web (needs a real device): push delivery and tap for `vendor_low_stock`, true offline (airplane mode) behaviour on Android.
