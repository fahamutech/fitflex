# Vendor walk-in sales (S3): design spec

Status: DRAFT for review. Date: 2026-10-19. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0, §1, S3, §4, §5 (O-1..O-15 accepted 2026-10-19). Patterns, states and strings reused from `docs/design/vendor-stock-ledger-s1.md` and `docs/design/vendor-portal-s2.md`.
Read from `origin/release-candidate`: mobile b70ada0 (`lib/screens/vendor/vendor_home_page.dart`, `lib/screens/vendor/stock/*`, `lib/shared/components/*`, `lib/shared/i18n.dart`, `lib/shared/formatters.dart`, `pubspec.yaml`), portal 07c327a (`src/components/Shell.tsx` `vendorNav`, `app/vendor/orders/page.tsx`, `src/components/shared.tsx`), functions 39ec024 (`functions/shop.mjs` options sample, `src/services/shop-service.mjs` `STAFF_ROLES`/`STAFF_PERMISSIONS`, `src/shared/feature-flags.mjs`).
Platforms: Flutter (Android + Flutter web; the POS) and Next.js portal (read-mostly). Roles: `vendor`, `vendor_staff` with `sales`.

Owner decisions applied: walk-in sales are recorded with **no commission**, are **not** in vendor settlement, and use the **same stock pool** as app orders. Money never passes through FitFlex, and the UI says so. O-2: a queued offline sale refused for stock (409) goes to a conflict list. O-6: per-vendor continuous receipt numbers `R-000001`. O-14: staff with `sales` may discount and change prices; it is audited and needs no approval. S4 (customers, pay later) and S5 (share links, PDF, VAT) come later. In S3 the receipt is an in-app screen that can be shared as text.

---

## 0. Scope, gating, permissions, reuse

### 0.1 Gating (fail closed, same as S1)
- `VendorTools` gains `walkInSales` (read from `GET /vendor/tools/options` → `walkInSales === true`). If it is false, missing, or the call failed, there is no Sales tab, no routes and no permission checkbox. Never show "feature off".
- Portal: `/vendor/me.tools.walkInSales`. Same rule.
- Exception: sales already **queued on the device** are never deleted because the flag went off. See §6.6.

### 0.2 Permission `sales` (new)
- The vendor account always has it. Staff need `sales` in `vendorPermissions`.
- `sales` covers: POS, sales history, sale detail, void, and the device's sync queue and conflict list.
- Seeing **stock numbers** in the POS needs only `sales` (the POS shows stock for each product). Adjusting stock from a conflict needs `products` (S1 sheet). Without `products` that button is hidden (see §6.4).
- Staff form (`VendorStaffForm`): add the `sales` checkbox (`vendor.permission.sales`) after `orders`, shown only when `walkInSales`. The server backfills `sales` onto `vendorRole='admin'` staff (F8).
- Mobile `_sections` gains Sales. Staff with only `sales` get one section, so no nav bar: the app opens straight on the Sales tab.

### 0.3 Components (reuse; no new shared component)

| Need | Reuse |
|---|---|
| Sheets (variant picker, line edit, discount, payment) | `showFFSheet` / `FFSheet` (web: max width 560, centred) |
| Method chips, discount mode, filters | `FFPill` in a `Wrap` (48dp), `Semantics(selected:, inMutuallyExclusiveGroup:)`; `FFSegmented` for TZS / % and receipt language |
| Inputs | `FFTextField` (digits-only money and qty; `maxLength` 100 for reference, 200 for notes and void reason) |
| Product rows, cart lines, history rows | `FFCard` + `ListTile`; `FFRemoteImage` 40px thumbnails (`excludeFromSemantics`) |
| Totals | `FFStatTile` (history summary), plain rows in an `FFCard` |
| Status | `FFBadge` (voided = neutral, waiting to sync = info, recorded offline = neutral, needs fixing = warning) |
| Banners | `FFAlert` (info: offline / waiting to sync; warning: conflicts; error: refusals) |
| States | `FFSkeletonList`, `FFEmptyState`, `FFErrorState(onRetry:)`, `FFSpinner`, `FFSnack` |
| Confirm (clear sale, void, discard) | `FFDialog` |
| Buttons | `FFButton` primary / secondary / ghost; danger tone for Void and Discard |
| Share | `share_plus` (already a dependency) |

**Two non-visual pieces are new** (they are not shared widgets):
1. `PosCartController`: holds the cart and computes totals.
2. `OfflineSaleQueue`: shared_preferences, keyed by vendorId + personId, following SmartStock's `offline_sale_queue.dart`.

New files go in `lib/screens/vendor/sales/`. `vendor_home_page.dart` gains only the tab, the banner hook and the staff checkbox.

No new mobile dependency:
- There is no `connectivity_plus` and no `uuid` on RC. `clientRef` reuses the S1 `Random.secure()` generator (`newStockClientRef` pattern).
- "Reconnect" is detected as described in §6.2.

### 0.4 Colour and money
- Light theme primary actions use green `#1F7A3A`. Dark theme uses Volt `#C8F04A` with on-volt `#020617`. Volt is never used as text on light grounds.
- Danger tone is only for Void and Discard. Change due uses success tone plus the words "Give change", so colour never carries the meaning alone.
- Money is integer TZS everywhere, shown with `formatCurrency` ("TZS 45,000"). Times are EAT, 24h (`19 Oct, 14:05`).

---

## 1. Navigation and routes

### 1.1 Entry points (mobile)
- **Sales tab** (`vendor-nav-sales`): icon `point_of_sale_outlined` / `point_of_sale`, label `vendor.sales.tab`. Placed after Orders. The owner has 6 destinations (Products, Orders, Sales, Payments, Messages, Business). Every label is ≤8 characters in EN and SW. See Q-1.
- Sales tab FAB: `FloatingActionButton.extended` "New sale" (`vendor-pos-new`, icon `add_shopping_cart`). It shows the cart count when a draft exists ("Continue sale (3)").
- Business tab: a tile "Sales waiting to sync (n)". It shows only when the queue is not empty **and** the Sales tab is hidden (flag went off; §6.6).

### 1.2 Routes (GoRoute; ids checked with `_safeId`)

| Route | Screen | Back |
|---|---|---|
| `/vendor/home?open=sales` | Sales tab (history, §5) | Normal tab behaviour |
| `/vendor/sales/new` | POS (§2) | Pops to the Sales tab. The cart is kept as a draft (§2.5), so back never loses it and never asks. |
| `/vendor/sales/receipt/:saleId` | Receipt (§4), after completion | **Done** and system back both go to `/vendor/sales/new` with an empty cart. Back never returns to a completed cart. |
| `/vendor/sales/receipt/queued/:clientRef` | Receipt of a queued sale (§4) | Same as above |
| `/vendor/sales/:saleId` | Sale detail (§5.3) | Pops to history. With nothing to pop, `go('/vendor/home?open=sales')`. |
| `/vendor/sales/sync` | Waiting to sync + conflicts (§6.4) | Pops; else to the Sales tab |

Deep-link rules:
- `walkInSales` off: go to `/vendor/home`, with no message. Exception: `/vendor/sales/sync` still opens while the queue is not empty.
- No `sales`: first allowed section + `FFSnack.error` `vendor.sales.noAccess`.
- Unknown sale id: not-found state.
- There is no push notification in S3.

### 1.3 Completion
**Complete sale** → receipt. **New sale** (primary on the receipt) opens an empty POS. **Done** (secondary) goes to the Sales tab. The history then shows the new sale at the top, or the "Waiting to sync" row (§5.1).

---

## 2. POS screen (`/vendor/sales/new`)

Purpose: ring up a walk-in sale quickly, one-handed, with correct stock.

### 2.1 Layout, phone (375)
- **AppBar**
  - Title `vendor.pos.title`.
  - Actions: overflow menu (`vendor.pos.more`) with "Clear sale" (enabled when the cart is not empty).
- **Banners**, top, stacked:
  - offline (`vendor.pos.offlineBanner`)
  - waiting to sync count, with a "Sync now" link (§6)
  - conflicts count (warning, link to §6.4)
- **Search field** (sticky): `FFTextField`, prefix `search`, label `vendor.pos.search`, hint `vendor.pos.searchHint`. It has autofocus on web only (on phone the keyboard would cover the cart). The trailing slot is reserved for the S8 scan button. In S3 it is **not rendered** (it appears only with `tools.barcodes`).
- **Product list** (scrolls), filtered client-side by name, brand and SKU. Each row is ≥64dp tall and the whole row is tappable:
  - Thumbnail.
  - Name (2 lines max, ellipsis).
  - Price (`formatCurrency` of the walk-in price, §2.3).
  - Stock: `vendor.pos.left` "{n} left", or `FFBadge` `vendor.pos.outOfStock`.
  - Trailing `add_circle_outline` icon, with semantics label `vendor.pos.add` {name}.
  - Out-of-stock rows stay visible but are disabled (`onTap: null`, semantics "disabled").
- **Cart bar** (bottom, above the system inset, 64dp):
  - Shows `vendor.pos.items` {n} · total, with a primary button **Charge {total}** (`vendor-pos-charge`).
  - Tapping the bar (not the button) expands the **cart sheet**: a draggable `FFSheet`, 90% max height.
  - Disabled while the cart is empty.
- **Cart sheet** contents:
  - One row per line:
    - name + variant (`vendor.orders.variant`)
    - qty stepper
    - line total
    - if the price was changed: muted text `vendor.pos.priceChanged`
    - if discounted: a "−X" discount line
  - Tap a row's name to open **Line edit** (§2.4).
  - Under the lines:
    - **Add discount** (ghost, opens Sale discount, §2.4)
    - Subtotal, Discounts, **Total**
    - Note (optional, ≤200, collapsed under "Add note")
    - **Charge {total}** (full width)

### 2.2 Layout, Flutter web ≥900px
- Two panes: products on the left (flex), cart on the right (fixed 400px, always visible, own scroll). Banners span the top.
- The search field has autofocus.
- **Enter** in search adds the product when exactly one product matches the text, or when an exact SKU match exists. Products with variants open the variant picker. This also serves USB barcode scanners that type and press Enter.
- Tab order: banners → search → product list → cart lines → Add discount → Note → Charge.

### 2.3 Adding items
- **Walk-in price** = the server's sellable price: `discountPriceTzs` if set, else `priceTzs` (Q-3). The server snapshots it as `listPriceTzs`.
- **Which products appear:** every product of the vendor that is not archived, whatever its approval status. These are the vendor's own goods and a walk-in sale is not a marketplace listing (Q-4). Archived products are hidden.
- **Product without variants:** a tap adds qty 1, or +1 if it is already in the cart. A light haptic plays and `vendor.pos.added` is announced (polite live region; no snack, to keep it quiet).
- **Product with variants:** a tap opens the **variant picker** sheet (title = product name, `vendor.pos.pickVariant`). It has one 56dp row per variant: name · `{n} left`. Variants with 0 stock are disabled. Picking a variant adds it and closes the sheet.
- **Stock cap:**
  - The stepper `+` is disabled at the known available stock, and inline text `vendor.pos.onlyLeft` shows on that line.
  - Known available = last loaded stock, minus queued unsynced sales on this device, minus the cart.
  - The server is the authority (§3.4).
  - The cap is 1000 per line (`MAX_QTY_PER_LINE`).

### 2.4 Line edit and discounts (O-14)
**Line edit sheet** (title `vendor.pos.editLine` {name}):
- **Quantity** stepper plus a numeric field.
- **Price each** (`vendor.pos.priceEach`), prefilled with the walk-in price. Helper `vendor.pos.listPrice` {amount}. It may go up or down; 0 is not allowed.
- **Discount on this item**: `FFSegmented` TZS | %, then the amount field. % is converted to whole TZS, rounded down, on the line total (qty × price each). The line discount is a total for the line, not per unit (Q-5).
- Validation: discount ≤ qty × price each. Otherwise inline `vendor.pos.discountTooBig` and Save is disabled.
- Info line (muted, always shown): `vendor.pos.discountAudited`.
- Buttons: **Save** (primary), **Remove item** (ghost danger, `vendor.pos.removeLine`), Cancel.

**Sale discount sheet** (`vendor.pos.saleDiscount`):
- The same TZS | % control, applied to the total after line discounts.
- Must be ≤ that amount. "Remove discount" appears when one is set.

**Totals** (client preview; the server recomputes and wins):
- subtotal = Σ qty × price each
- discounts = Σ line discounts + sale discount
- total = subtotal − discounts

If the server's totals differ from the preview, the receipt shows the server values. The receipt never shows client-only math.

### 2.5 Draft cart
- The cart is saved to shared_preferences on every change, under (vendorId, personId).
- It survives app kill. This matters when the seller leaves the app to check an M-Pesa SMS.
- It is cleared on successful completion or queueing, and on **Clear sale** (confirm `FFDialog` `vendor.pos.clearConfirm`).
- On reopen with a draft, a snack `vendor.pos.draftKept` shows.
- Stored per line: productId, variant, name, qty, price, discount.

### 2.6 POS states

| State | Behaviour |
|---|---|
| Loading products (first open) | `FFSkeletonList(count: 6, semanticLabel: vendor.pos.loading)`. If a local cache exists, show it at once and refresh in place (no skeleton). |
| No products | `FFEmptyState` `vendor.pos.noProducts`. Action "Go to Products" when the user has `products`. |
| No search match | Inline `vendor.pos.noResults` {q} |
| Load error with no cache | `FFErrorState` `vendor.pos.loadFailed` + Try again |
| Offline with cache | Info banner `vendor.pos.offlineBanner` {time of cache}. Selling works (§6). |
| Offline with no cache | `FFErrorState` `vendor.pos.noCache` + Try again |
| Pending-approval vendor | POS works. The existing pending banner stays on the vendor home and is not repeated here (Q-4). |
| Suspended vendor | Pending Q-6. Recommendation: POS works and the suspended banner shows. |
| Staff disabled (403 `vendor_staff_inactive`) | Existing staff-disabled alert. POS buttons disabled. Queued sales stay. |
| No `sales` | Not reachable (§1.2) |

---

## 3. Payment sheet (Charge)

Purpose: record how the customer paid, possibly with several methods, and work out change.

### 3.1 Layout (`showFFSheet`, title `vendor.pos.payTitle`, not dismissible while saving)
1. **To pay**: total, `headlineSmall`, tabular figures.
2. **Payment rows.** The first row starts as Cash with amount = total. Each row has:
   - **Method** chips (`FFPill`, wrap, single select), in this order: Cash, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, Card, Bank transfer, Other. Methods already used in another row stay selectable (two M-Pesa payments are allowed).
   - **Amount** (digits only). For Cash the label is `vendor.pos.cashReceived`, and quick chips show below it: **Exact**, plus up to three round-ups (next 1,000 / 5,000 / 10,000 above the remaining amount, duplicates dropped).
   - **Reference** (non-cash only), label `vendor.pos.reference`, helper `vendor.pos.referenceHint`, ≤100 characters, `textCapitalization.characters`. **Required** for M-Pesa, Airtel Money, Mixx by Yas, HaloPesa and Bank transfer. **Optional** for Card and Other. See Q-7.
   - Remove row icon (48×48, `vendor.pos.removePayment` {method}). Shown when there are ≥2 rows.
3. **Add another payment** (ghost). It adds a row prefilled with the remaining amount and method unset. Hidden when nothing remains.
4. **Status line** (live region):
   - Remaining > 0: `vendor.pos.remaining` {amount} (warning text).
   - Exactly paid: nothing.
   - Cash over: `vendor.pos.changeDue` {amount} (success tone, `titleMedium`).
   - Non-cash over: `vendor.pos.overNonCash` {method}.
5. **Money notice** (`FFAlert` info, always shown): `vendor.pos.moneyNotice`.
6. **Complete sale** (primary, full width). Disabled while:
   - remaining > 0 (S3 has no pay-later; that is S4), or
   - non-cash payments exceed the remaining amount, or
   - a required reference is empty.

### 3.2 Rules (client mirrors the server)
- Σ payments ≥ total.
- Only cash may be more than its share. Change = Σ payments − total, and must be ≤ the cash amount.
- Amounts are integers > 0.
- **Total 0** (fully discounted): the payment rows hide and the line `vendor.pos.nothingToPay` shows. The request sends `payments: []` (Q-8).

### 3.3 Request
`POST /vendor/sales`:
```
{ clientRef, soldAt, lines:[{productId, variant?, qty, unitPriceTzs?, discountTzs?}], discountTzs?, payments:[{method, amountTzs, reference?}], note? }
```
- `clientRef`: a UUID made when Complete is first tapped. It is reused on every retry of this sale, and fixed once queued.
- `soldAt`: device time when Complete was first tapped (ISO with offset).
- `unitPriceTzs`: sent only when the price was changed. `discountTzs` per line: sent only when > 0.
- `method` values: `cash|mpesa|airtel_money|mixx|halopesa|card|bank|other`.

### 3.4 Responses

| Response | Behaviour |
|---|---|
| 201, or 200 replay | Sheet closes. Draft cleared. Go to the receipt with the server sale. Snack `vendor.pos.saleSaved` {number}. |
| 409 `insufficient_stock {productId, variant, available}` | Sheet closes. The cart opens with that line highlighted (warning border) and inline `vendor.pos.err.stock` {available} {name}. Stock caches update. Focus goes to that line's stepper. **New clientRef** on the next Complete. |
| 409 `payment_short` | Sheet stays. Status line shows the server message `vendor.pos.short`. |
| 400 `discount_exceeds_price` | Sheet closes. The cart opens and the offending line or sale discount shows `vendor.pos.discountTooBig`. |
| 400 `invalid_payment` / `reference_required` | Inline on the payment rows `vendor.pos.err.payment` / `vendor.pos.referenceRequired` |
| 404/409 product gone or unsellable (`product_not_found`, `product_unavailable`) | Line highlighted with `vendor.pos.err.unavailable` {name} and a Remove action |
| 403 permission / staff inactive | Sheet closes. `FFSnack.error` `vendor.pos.err.notAllowed`. The draft is kept. |
| 404 `feature_disabled` | Sheet closes. Snack `vendor.sync.featureOff`. Draft kept. The Sales tab disappears on the next options refresh. |
| **Network failure / timeout** (no response) | **Queued** automatically (§6.1). Go to the queued receipt. Snack `vendor.pos.savedOffline`. |
| 5xx | Sheet stays. `FFAlert` error `vendor.pos.err.server`. Buttons: **Try again** (same clientRef) and secondary **Save and sync later** (queues, §6.1). See Q-9. |

---

## 4. Receipt screen

Purpose: show the customer what they bought and paid. It can be shared as text. It is not a fiscal (TRA) receipt (S10).

### 4.1 Layout (375: full width; web: centred card, max width 480)
- **Header**
  - Business name (`/vendor/profile.businessName`), contact number and address when set.
  - `vendor.pos.receiptNo` {number}, e.g. "Receipt R-000123".
  - **Queued sale:** `FFBadge` info `vendor.pos.waitingSync`, plus `vendor.pos.tempRef` {last 6 characters of clientRef, uppercase} and body `vendor.pos.waitingSyncBody`. The screen updates in place when sync assigns the number.
  - Date and time (`soldAt`, EAT). Served by (`vendor.pos.servedBy` {name}).
- **Lines:** `{qty} × {name} ({variant})`, line total right-aligned. Under a line, as applicable:
  - `@ {price each}` when qty > 1 or the price was changed
  - discount line `vendor.pos.lineDiscountShort` −{amount}
- **Totals:** Subtotal, Discounts (only if > 0), **Total**.
- **Payments:** one row per payment (`{method}`, amount, reference when present), then Change (when > 0).
- **Footer:** `vendor.pos.receiptFooter` {business}. Under it, a muted line `vendor.pos.notFiscal` ("This is not a TRA fiscal receipt.") (Q-10).
- **Receipt language** `FFSegmented` English | Kiswahili. It defaults to the app language and changes both the preview and the share text. It does not change the app language.
- **Actions** (sticky bottom):
  - **New sale** (primary)
  - **Share receipt** (secondary, icon `share`)
  - **Done** (ghost)
  - Phone layout: New sale full width, Share and Done side by side below it. They stack when either label would be <120dp wide.

### 4.2 Share as text (`share_plus`, `Share.share(text, subject: '{business} {receiptNo}')`)
Template (EN; SW uses the same structure with SW labels). Plain text, no markup, lines ≤32 characters where possible for WhatsApp on phones:
```
{business}
Receipt R-000123
19 Oct 2026, 14:05
--------------------
2 x Whey 1kg (Chocolate)
   @ 45,000        90,000
   Discount        -5,000
1 x Shaker         10,000
--------------------
Subtotal          100,000
Discounts          -5,000
Total         TZS 95,000
Cash               60,000
M-Pesa (QK12AB34)  40,000
Change              5,000
--------------------
Served by Asha
Payment received by {business}.
Not a TRA fiscal receipt.
```
- **Queued sale:** the number line reads `vendor.pos.shareProvisional` "Provisional receipt, number to follow (ref {tempRef})" (Q-11).
- Voided sales cannot be shared (button hidden). Instead, the receipt shows the voided banner (§5.3).
- No customer phone or name (S4) and no FitFlex marketing line.

### 4.3 States
- Opening a synced sale by id: skeleton, then the content. On 404: not-found state.
- A queued receipt whose sale later becomes a conflict: the badge changes to warning `vendor.sync.needsFixing`, with a button "Fix" → §6.4.

---

## 5. Sales history and sale detail (Sales tab)

### 5.1 Sales tab layout
1. Banners: waiting to sync (info, `vendor.sync.banner` {n} + **Sync now**), conflicts (warning, `vendor.sync.conflicts` {n} → §6.4).
2. Range `FFSegmented`: **Today** (default) / Last 7 days / Last 30 days / Choose dates. Reuse the S1 range keys plus `vendor.sales.today`. EAT dates.
3. Filter pills (wrap): All / Completed / Voided, plus **Only mine** (toggle; shown to the vendor and to staff).
4. **Summary card** (from server `summary`):
   - `FFStatTile`s: Sales count, Total (completed only, net of voids).
   - Below: "By payment method" (`vendor.sales.byMethod`), one compact row per method with an amount.
   - The card hides when the server sends no `summary` (Q-12).
5. **Queued rows first** (local, this device only): "Waiting to sync" badge, temp ref, total, time. Tap → queued receipt.
6. **Server rows** (newest first; each `FFCard` row ≥64dp):
   - Line 1: `R-000123` · total (right, `titleMedium`, tabular figures).
   - Line 2: time · method summary ("Cash + M-Pesa") · served by.
   - Badges: Voided (neutral, and the total is struck through with "voided" in semantics), Recorded offline (when `recordedAt − soldAt` > 5 min).
   - Merged semantics `vendor.sales.rowLabel`.
7. **Load more** (ghost) while `nextCursor` is set. Not infinite scroll.
8. FAB **New sale** / **Continue sale (n)**.

Web ≥900: content max width 960. Summary and filters sit in a left column (320px), rows on the right.

### 5.2 History states

| State | Behaviour |
|---|---|
| Loading | Summary skeleton + `FFSkeletonList(semanticLabel: vendor.sales.loading)` |
| Empty, never sold | `FFEmptyState` `vendor.sales.emptyFirst`, action **New sale** |
| Empty range or filter | `FFEmptyState` `vendor.sales.empty` |
| Error | `FFErrorState` `vendor.sales.failed` + Try again. Queued rows still show above it. |
| Offline | Same as error with `error.network`. Queued rows still show. **New sale** still works. |
| Load more error | Inline `FFAlert` + retry. Loaded rows stay. |
| Pull to refresh | Reloads options, summary, page 1, and triggers a sync attempt |

### 5.3 Sale detail (`/vendor/sales/:saleId`)
- Same content as the receipt (§4.1), plus:
  - status, recorded time (`recordedAt`) when the sale was recorded offline
  - note
  - for each line where `unitPriceTzs ≠ listPriceTzs`: the shop price, "Price changed by {name}" (the audit trail; O-14)
  - for voided sales: an `FFAlert` neutral `vendor.sales.voidedBy` {name} {time} {reason}
- Cost and profit are **not** shown (S6).
- Actions:
  - **Share receipt**: completed sales only.
  - **Void sale**: danger secondary. Shown for completed sales when the user has `sales`. Hidden for voided sales.
- **Void flow:** an `FFDialog` with:
  - title `vendor.sales.voidTitle` {number}
  - body `vendor.sales.voidBody`
  - **Reason** (required, 3–200 characters, `vendor.sales.voidReason`)
  - **Void sale** (danger, disabled until a reason is entered), Cancel

  Request: `POST /vendor/sales/:id/void {reason}`.

  | Response | Behaviour |
  |---|---|
  | Success | Dialog closes. Snack `vendor.sales.voided` {number}. Detail and history update from the response. |
  | 409 `already_voided` | Reload. Snack `vendor.sales.alreadyVoided`. |
  | 409 `has_refunds` (S7 later) | `vendor.sales.voidHasRefunds` |
  | 400 `reason_required` | Inline error on the reason |
  | 403 | `vendor.pos.err.notAllowed` |
  | Network | Dialog stays. `FFAlert` `vendor.sales.voidOffline`, Try again. Voids are **never queued**. |

- A queued (unsynced) sale has no Void, only **Discard** in §6.4, because the server has no record of it.

### 5.4 Stock history link (S1 screen)
- New reason labels: `vendor.stock.reason.sale`, `vendor.stock.reason.sale_void`.
- Rows with `document.type == 'sale'` show a ghost link `vendor.stock.sale` {number}. It opens the sale detail when the user has `sales`; otherwise it is plain text.

---

## 6. Offline queue and sync

### 6.1 When a sale is queued
- Only on **network failure or timeout** (no HTTP response), or when the user explicitly picks **Save and sync later** after a 5xx.
- 4xx responses are never queued.
- The queue entry holds:
  - the exact request body (with `clientRef` and `soldAt`)
  - a display snapshot (business name, line names, served-by name)
  - `queuedAt`, `attempts`, `lastAttemptAt`, `state` (`waiting|syncing|conflict`), `error` (code + body)
- Storage: shared_preferences key `vendor_sale_queue.<vendorId>.<personId>`. On Flutter web this is localStorage. It is not encrypted, so it holds no cost price and no customer data (S3 has none).
- The cached product list used offline (`vendor_pos_products.<vendorId>`) stores only: id, name, brand, SKU, image URL, price, discount price, status, variants {name, stock}, stock, `cachedAt`. It never stores `costTzs`.

### 6.2 When sync runs
- Queued sales sync **one at a time, oldest first**, so stock is taken in the order things were sold.
- Sync is triggered by:
  1. App resume (`AppLifecycleState.resumed`).
  2. Any successful vendor API call: a sign we are online.
  3. A 60-second timer while the queue is not empty and the app is in the foreground.
  4. **Sync now** buttons.
  5. Pull to refresh.
  6. Sign-in as the same vendor persona.
- Only one sync loop runs at a time.
- Back-off after network failure: 60s → 2m → 5m (cap). It resets on any success.

### 6.3 Results per item

| Server answer | Item becomes |
|---|---|
| 201 / 200 replay | Removed from the queue and replaced by the server sale (number assigned). The open receipt or detail updates in place. History refreshes. A polite announcement `vendor.sync.synced` {number} plays. |
| Network / 5xx | Stays `waiting`. `attempts` +1. |
| 409 `insufficient_stock` | `conflict` (O-2). Shows `vendor.sync.conflictStock`. |
| other 409 / 400 (`payment_short`, `discount_exceeds_price`, `invalid_payment`, `product_unavailable`, `sold_at_out_of_range`, `client_ref_reused`) | `conflict`, with the matching message (§9.6) |
| 403 (permission removed, staff inactive) | `conflict` `vendor.sync.conflictNotAllowed`. The loop stops for this user. |
| 404 `feature_disabled` | Stays `waiting`. The loop pauses until options say `walkInSales` again (§6.6). |
| 401 | The loop stops. Normal re-sign-in happens and the queue stays. |

A conflict does not block later items (they are independent sales). The loop continues with the next one.

### 6.4 Waiting to sync and conflicts screen (`/vendor/sales/sync`)
- **Header:** count waiting, last attempt time (`vendor.sync.lastTry`), **Sync now** (primary; spinner while syncing; `vendor.sync.syncing`).
- **Section "Needs fixing"** (warning), one `FFCard` per conflict:
  - temp ref, sold time, total, the reason message with product/variant names, available vs sold qty
  - actions, in a wrap:
    - **Count stock**: needs `products`. Opens the S1 Adjust stock sheet for the short product/variant, with Counted preselected.
    - **Try again**: same `clientRef`. Sends the unchanged sale. Right after a count, this is the usual fix.
    - **Edit sale**: loads the lines and payments into the POS as the draft. Allowed only when the cart is empty; otherwise snack `vendor.sync.finishCurrent`. The conflict item is removed once the edited sale completes or queues. The edited sale gets a **new** clientRef and keeps the original `soldAt`.
    - **Discard** (danger ghost): `FFDialog` `vendor.sync.discardTitle` / `vendor.sync.discardBody`. Removes the item locally. Nothing is sent and no audit row exists, because the server never had it (Q-13).
  - Staff without `products` see `vendor.sync.askOwnerToCount` instead of Count stock.
- **Section "Waiting"**: rows as in §5.1. Each row opens its queued receipt.
- **Empty:** `FFEmptyState` `vendor.sync.done`. Back returns to the Sales tab.

### 6.5 Sign-out and persona switch
- With queued sales, sign-out and persona switch show a `FFDialog` with:
  - `vendor.sync.signOutWarn` {n}
  - **Sync now**, **Sign out anyway**, Cancel
- **Sign out anyway** keeps the queue on the device, keyed by vendorId + personId. It syncs the next time that person signs in to that vendor.
- Another person signing in on the same device never sees or sends someone else's queue.

### 6.6 Feature switched off with items queued
- The Sales tab and POS disappear.
- The Business-tab tile "Sales waiting to sync (n)" opens `/vendor/sales/sync`, which shows the info alert `vendor.sync.featureOff`. Sync now stays disabled while the server answers `feature_disabled`.
- Items are never auto-deleted. Discard stays available.

---

## 7. Portal: `/vendor/sales/` (read-mostly)

### 7.1 Recommendation: no desktop POS in the portal in S3
Vendors already get a desktop POS from the same Flutter code on Flutter web (§2.2): two panes, keyboard and USB scanner support, the same offline queue and the same tests. A second POS in Next.js would duplicate the cart, payment rules, queue and strings in another stack, and the static export has no offline story. The portal shows sales, details and void, plus a pointer `vendor.sales.recordInApp`. Revisit after S8 if vendors ask for it (Q-2).

### 7.2 Nav, route, gating
- `vendorNav` gains **Sales** (`/vendor/sales`, lucide `Receipt`, `vendor.nav.sales`) after Orders.
- It shows only when `tools.walkInSales` and `sales` are both true. Otherwise the S2 guard redirects with `vendor.noAccess`.
- Detail uses a query string: `/vendor/sales/?id=<saleId>` (static export, S2 pattern).

### 7.3 List
- `PageHeader`: title `vendor.nav.sales`, description `vendor.sales.portalDescription`, actions **Refresh**. A muted hint under the header reads `vendor.sales.recordInApp`.
- Filters, mirrored in the URL (`?range=today|7d|30d|custom&from&to&status&mine=1`):
  - `Segmented` Today / 7 days / 30 days / Custom (two `type="date"` inputs, EAT)
  - status `Select` (All / Completed / Voided)
  - **Only mine** `Checkbox`
- Summary: `Stat` row with Sales, Total, and one `Stat` per payment method present.
- Desktop table (`aria-label` `vendor.nav.sales`): Receipt · Time · Items · Payment · Served by · Total · Status (`Badge`: Completed success, Voided gray). The receipt cell is the `<a>` to `?id=`. Voided totals are struck through, and the status badge says "Voided" in text.
- 375px: cards (receipt + status, total, time, payment summary).
- **Load more** button.
- States:
  - loading `SkeletonTable`
  - empty `EmptyState` `vendor.sales.empty`, or `vendor.sales.emptyFirst` with the hint `vendor.sales.recordInApp`
  - error `ErrorState` + Try again

### 7.4 Detail and void
- Desktop: right panel 480px. 375px: full page. Focus moves to the heading on open; **Back to sales** returns focus to the row.
- Content: same as mobile §5.3, including the price-change audit lines and the voided block.
- **Void sale** (danger) opens a `Dialog`:
  - `vendor.sales.voidTitle`, `vendor.sales.voidBody`
  - required `Textarea` reason (≤200, counter)
  - **Void sale** (disabled until there is a reason), Cancel
  - Escape closes the dialog and returns focus to the button.
  - Response handling as in mobile §5.3. Success shows a toast and the panel and row update.
- **Copy receipt text** (secondary). Uses the same template as §4.2, in the portal language. Toast `vendor.sales.copied`. This is the portal's share in S3.

### 7.5 Dashboard
- New `MetricCard` **Shop sales today** (`vendor.dash.shopSalesToday`), sub `vendor.dash.shopSalesHint`, from `GET /vendor/sales?from=today&to=today` `summary.totalTzs`.
- Shown when `walkInSales` + `sales`. It links to `/vendor/sales/`.
- The existing app-order card stays separate, so the two are never summed.

---

## 8. Accessibility and Swahili overflow

### 8.1 Touch targets
- Mobile: ≥48dp everywhere, including steppers (48×48 each), payment chips, quick-cash chips, remove-row icons and the cart bar.
- Portal: ≥44px.

### 8.2 Labels (Flutter web semantics tree)
Every control has a label:

| Control | Label |
|---|---|
| Add product | `vendor.pos.add` {name} |
| Stepper | `vendor.pos.increase` / `vendor.pos.decrease` {name}, value announced as "{qty}" |
| Remove line | `vendor.pos.removeLine` |
| Method chips | method name + selected state, in a mutually exclusive group per row |
| Remove payment | `vendor.pos.removePayment` |
| Cart bar | `vendor.pos.cartBarLabel` ("{n} items, total {amount}, open sale items") |
| Charge | includes the amount |
| Receipt row | merged semantics |
| History row | `vendor.sales.rowLabel` |

### 8.3 Live regions (polite)
- item added
- remaining / change status line
- sync result
- 409 line errors (assertive)

### 8.4 Focus order
- **Payment sheet:** close → method chips → amount → quick-cash chips → reference → remove row → Add another payment → Complete.
- **After a 409:** focus moves to the highlighted cart line.
- **After completion:** focus moves to the receipt number heading.

### 8.5 Contrast
- Text ≥4.5:1 in light and dark. Change due uses `success700` on light.
- Warning banners use `warning700` on `warning50`.
- Badges carry text. A struck-through voided total also has the "Voided" badge.
- Volt only in dark.

### 8.6 Text scale 200%
- The cart bar grows in height and never clips: item count above the button, with the button full width.
- Product rows wrap the price under the name.
- Payment rows stack amount over reference.

### 8.7 Swahili length (runs 20–30% longer)
- **Long strings:** `vendor.pos.moneyNotice` SW is about 130 characters. It wraps in `FFAlert` and must never be truncated.
- **Charge button:** `vendor.pos.charge` "Pokea TZS 125,000" fits at 375 with the count. If the count and button would overlap, the count moves above.
- **Method chips:** "Uhamisho wa benki" (17 characters) is the longest. The chips wrap onto 3 lines at 375.
- **Range labels:** reuse S1's fallback, which goes compact on overflow.
- **Nav (6 tabs at 375, about 62dp each):** "Biashara" and "Products"/"Payments"/"Messages" are 8 characters and fit at text scale 1.0. Above that they ellipsize, while semantics keep the full label. design-qa checks this in SW at 375 (Q-1).
- **Receipt share text:** SW labels are kept short ("Jumla", "Chenji", "Punguzo") so the columns hold at 32 characters.

---

## 9. Strings (EN + SW)

All SW are **drafts for native review**. "Stock" stays English. Variant = chaguo / machaguo. Receipt = risiti. Keys go in mobile `lib/shared/i18n.dart` and, where the portal uses them, in `src/lib/i18n.ts` with the same text. Placeholders: `{n}`, `{name}`, `{amount}`, `{number}`, `{ref}`, `{time}`, `{method}`, `{q}`, `{available}`, `{qty}`, `{business}`, `{reason}`.
Reused: `common.cancel`, `common.retry`, `error.network`, `payment.method.mpesa|airtel_money|mixx|card|bank`, `vendor.orders.variant`, `vendor.stock.range.7d|30d|custom`, `vendor.stock.loadMore`, `vendor.noAccess`.

### 9.1 Tab, permission, POS
| Key | EN | SW (draft) |
|---|---|---|
| vendor.sales.tab | Sales | Mauzo |
| vendor.permission.sales | Shop sales | Mauzo ya dukani |
| vendor.sales.noAccess | You don't have access to shop sales. | Huna ruhusa ya mauzo ya dukani. |
| vendor.pos.title | Shop sale | Mauzo ya dukani |
| vendor.pos.newSale | New sale | Mauzo mapya |
| vendor.pos.continueSale | Continue sale ({n}) | Endelea na mauzo ({n}) |
| vendor.pos.more | More actions | Vitendo zaidi |
| vendor.pos.search | Search products | Tafuta bidhaa |
| vendor.pos.searchHint | Name, brand or SKU | Jina, chapa au SKU |
| vendor.pos.loading | Loading products | Inapakia bidhaa |
| vendor.pos.loadFailed | Could not load your products. | Imeshindikana kupakia bidhaa zako. |
| vendor.pos.noProducts | You have no products yet. Add them in Products first. | Bado huna bidhaa. Ziongeze kwanza kwenye Bidhaa. |
| vendor.pos.goToProducts | Go to Products | Nenda kwenye Bidhaa |
| vendor.pos.noResults | No products match "{q}". | Hakuna bidhaa inayolingana na "{q}". |
| vendor.pos.left | {n} left | Zimebaki {n} |
| vendor.pos.outOfStock | Out of stock | Stock imeisha |
| vendor.pos.add | Add {name} to the sale | Ongeza {name} kwenye mauzo |
| vendor.pos.added | {name} added | {name} imeongezwa |
| vendor.pos.pickVariant | Choose a variant | Chagua chaguo |
| vendor.pos.items | {n} items | Bidhaa {n} |
| vendor.pos.cartBarLabel | {n} items, total {amount}. Open sale items. | Bidhaa {n}, jumla {amount}. Fungua bidhaa za mauzo. |
| vendor.pos.cartEmpty | Add products to start a sale. | Ongeza bidhaa kuanza mauzo. |
| vendor.pos.increase | Add one {name} | Ongeza moja {name} |
| vendor.pos.decrease | Remove one {name} | Punguza moja {name} |
| vendor.pos.onlyLeft | Only {n} in stock. | Zipo {n} tu kwenye Stock. |
| vendor.pos.editLine | Edit {name} | Hariri {name} |
| vendor.pos.qty | Quantity | Idadi |
| vendor.pos.priceEach | Price each | Bei ya moja |
| vendor.pos.listPrice | Shop price: {amount} | Bei ya duka: {amount} |
| vendor.pos.priceChanged | Price changed from {amount} | Bei imebadilishwa kutoka {amount} |
| vendor.pos.priceChangedBy | Price changed by {name} (shop price {amount}) | Bei imebadilishwa na {name} (bei ya duka {amount}) |
| vendor.pos.lineDiscount | Discount on this item | Punguzo kwa bidhaa hii |
| vendor.pos.lineDiscountShort | Discount | Punguzo |
| vendor.pos.saleDiscount | Discount on the whole sale | Punguzo kwa mauzo yote |
| vendor.pos.addDiscount | Add discount | Weka punguzo |
| vendor.pos.removeDiscount | Remove discount | Ondoa punguzo |
| vendor.pos.discountTzs | TZS | TZS |
| vendor.pos.discountPct | % | % |
| vendor.pos.discountTooBig | The discount can't be more than {amount}. | Punguzo haliwezi kuzidi {amount}. |
| vendor.pos.discountAudited | Discounts and price changes are saved with your name. | Punguzo na mabadiliko ya bei huhifadhiwa pamoja na jina lako. |
| vendor.pos.removeLine | Remove {name} from the sale | Ondoa {name} kwenye mauzo |
| vendor.pos.subtotal | Subtotal | Jumla ndogo |
| vendor.pos.discounts | Discounts | Punguzo |
| vendor.pos.total | Total | Jumla |
| vendor.pos.charge | Charge {amount} | Pokea {amount} |
| vendor.pos.addNote | Add note | Ongeza maelezo |
| vendor.pos.note | Note (optional) | Maelezo (si lazima) |
| vendor.pos.clearSale | Clear sale | Futa mauzo |
| vendor.pos.clearConfirm | Remove all items from this sale? | Uondoe bidhaa zote kwenye mauzo haya? |
| vendor.pos.draftKept | Your unfinished sale was kept. | Mauzo yako ambayo hayajakamilika yamehifadhiwa. |
| vendor.pos.offlineBanner | You're offline. Stock shown is from {time} and may be out of date. | Uko nje ya mtandao. Stock inayoonyeshwa ni ya {time} na huenda si sahihi. |
| vendor.pos.noCache | Connect to the internet once to load your products. | Unganisha mtandao mara moja ili kupakia bidhaa zako. |

### 9.2 Payment
| Key | EN | SW (draft) |
|---|---|---|
| vendor.pos.payTitle | Payment | Malipo |
| vendor.pos.amountDue | To pay | Kiasi cha kulipa |
| vendor.pos.method | Payment method | Njia ya malipo |
| vendor.pos.method.cash | Cash | Taslimu |
| vendor.pos.method.halopesa | HaloPesa | HaloPesa |
| vendor.pos.method.other | Other | Nyingine |
| vendor.pos.amount | Amount (TZS) | Kiasi (TZS) |
| vendor.pos.cashReceived | Cash received (TZS) | Taslimu iliyopokelewa (TZS) |
| vendor.pos.exact | Exact | Kamili |
| vendor.pos.reference | Transaction reference | Namba ya muamala |
| vendor.pos.referenceOptional | Reference (optional) | Kumbukumbu (si lazima) |
| vendor.pos.referenceHint | From the payment SMS or card slip. | Kutoka SMS ya malipo au risiti ya kadi. |
| vendor.pos.referenceRequired | Enter the transaction reference. | Weka namba ya muamala. |
| vendor.pos.addPayment | Add another payment | Ongeza malipo mengine |
| vendor.pos.removePayment | Remove {method} payment | Ondoa malipo ya {method} |
| vendor.pos.remaining | Still to pay: {amount} | Bado kulipwa: {amount} |
| vendor.pos.changeDue | Give change: {amount} | Rudisha chenji: {amount} |
| vendor.pos.change | Change | Chenji |
| vendor.pos.overNonCash | Only cash can be more than the total. Lower the {method} amount. | Taslimu pekee inaweza kuzidi jumla. Punguza kiasi cha {method}. |
| vendor.pos.nothingToPay | Nothing to pay for this sale. | Hakuna cha kulipa kwa mauzo haya. |
| vendor.pos.moneyNotice | FitFlex does not handle this money: you receive it directly. No commission is charged and it is not part of your FitFlex payouts. | FitFlex haishughulikii pesa hii: unaipokea moja kwa moja. Hakuna kamisheni na haiko kwenye malipo yako ya FitFlex. |
| vendor.pos.complete | Complete sale | Kamilisha mauzo |
| vendor.pos.completing | Saving sale | Inahifadhi mauzo |
| vendor.pos.short | {amount} still to pay. | Bado {amount} kulipwa. |
| vendor.pos.err.stock | Only {available} of {name} left. Lower the quantity. | Zimebaki {available} tu za {name}. Punguza idadi. |
| vendor.pos.err.payment | Check the payment details. | Angalia taarifa za malipo. |
| vendor.pos.err.unavailable | {name} can't be sold now. Remove it from the sale. | {name} haiwezi kuuzwa sasa. Iondoe kwenye mauzo. |
| vendor.pos.err.notAllowed | You don't have permission to record sales. | Huna ruhusa ya kurekodi mauzo. |
| vendor.pos.err.server | Could not save the sale. Nothing is recorded yet. | Imeshindikana kuhifadhi mauzo. Hakuna kilichorekodiwa bado. |
| vendor.pos.syncLater | Save and sync later | Hifadhi, tuma baadaye |
| vendor.pos.saleSaved | Sale saved: {number} | Mauzo yamehifadhiwa: {number} |
| vendor.pos.savedOffline | No connection. The sale is saved on this phone and will sync. | Hakuna mtandao. Mauzo yamehifadhiwa kwenye simu hii na yatatumwa. |

### 9.3 Receipt
| Key | EN | SW (draft) |
|---|---|---|
| vendor.documents.receipt | Receipt | Risiti |
| vendor.pos.receiptNo | Receipt {number} | Risiti {number} |
| vendor.pos.waitingSync | Waiting to sync | Inasubiri kutumwa |
| vendor.pos.waitingSyncBody | Saved on this device. It gets a receipt number when you're back online. | Imehifadhiwa kwenye kifaa hiki. Itapata namba ya risiti ukirudi mtandaoni. |
| vendor.pos.tempRef | Temporary ref {ref} | Kumbukumbu ya muda {ref} |
| vendor.pos.servedBy | Served by {name} | Muhudumu: {name} |
| vendor.pos.receiptFooter | Payment received by {business}. | Malipo yamepokelewa na {business}. |
| vendor.pos.notFiscal | This is not a TRA fiscal receipt. | Hii si risiti ya kodi ya TRA. |
| vendor.pos.receiptLanguage | Receipt language | Lugha ya risiti |
| vendor.pos.share | Share receipt | Tuma risiti |
| vendor.pos.shareProvisional | Provisional receipt, number to follow (ref {ref}) | Risiti ya muda, namba itafuata (kumb. {ref}) |
| vendor.pos.done | Done | Maliza |

### 9.4 History, detail, void
| Key | EN | SW (draft) |
|---|---|---|
| vendor.sales.title | Sales | Mauzo |
| vendor.sales.today | Today | Leo |
| vendor.sales.filter.all | All | Zote |
| vendor.sales.filter.completed | Completed | Yamekamilika |
| vendor.sales.filter.voided | Voided | Yamebatilishwa |
| vendor.sales.filter.mine | Only mine | Yangu tu |
| vendor.sales.count | Sales | Mauzo |
| vendor.sales.total | Total | Jumla |
| vendor.sales.byMethod | By payment method | Kwa njia ya malipo |
| vendor.sales.loading | Loading sales | Inapakia mauzo |
| vendor.sales.empty | No sales in these dates. | Hakuna mauzo katika tarehe hizi. |
| vendor.sales.emptyFirst | No shop sales yet. Record your first sale. | Bado hakuna mauzo ya dukani. Rekodi mauzo yako ya kwanza. |
| vendor.sales.failed | Could not load sales. | Imeshindikana kupakia mauzo. |
| vendor.sales.rowLabel | Receipt {number}, {amount}, {time}, {status} | Risiti {number}, {amount}, {time}, {status} |
| vendor.sales.voidedBadge | Voided | Imebatilishwa |
| vendor.sales.offlineBadge | Recorded offline | Ilirekodiwa bila mtandao |
| vendor.sales.recordedAt | Reached FitFlex {time} | Ilifika FitFlex {time} |
| vendor.sales.notFound | This sale is not available. | Mauzo haya hayapatikani. |
| vendor.sales.void | Void sale | Batilisha mauzo |
| vendor.sales.voidTitle | Void sale {number}? | Ubatilishe mauzo {number}? |
| vendor.sales.voidBody | The items go back into stock and the sale stays in your history as voided. FitFlex does not refund the customer; give back any money yourself. | Bidhaa zitarudi kwenye Stock na mauzo yatabaki kwenye historia kama yamebatilishwa. FitFlex haimrudishii mteja pesa; rudisha pesa wewe mwenyewe. |
| vendor.sales.voidReason | Reason (required) | Sababu (lazima) |
| vendor.sales.voidReasonMissing | Say why you are voiding this sale. | Eleza kwa nini unabatilisha mauzo haya. |
| vendor.sales.voided | Sale {number} voided. Items are back in stock. | Mauzo {number} yamebatilishwa. Bidhaa zimerudi kwenye Stock. |
| vendor.sales.voidedBy | Voided by {name}, {time}: {reason} | Yamebatilishwa na {name}, {time}: {reason} |
| vendor.sales.alreadyVoided | This sale was already voided. | Mauzo haya yalishabatilishwa. |
| vendor.sales.voidHasRefunds | This sale has refunds, so it can't be voided. | Mauzo haya yana marejesho, hivyo hayawezi kubatilishwa. |
| vendor.sales.voidOffline | Voiding needs a connection. Nothing was changed. | Kubatilisha kunahitaji mtandao. Hakuna kilichobadilishwa. |
| vendor.stock.reason.sale | Shop sale | Mauzo ya dukani |
| vendor.stock.reason.sale_void | Sale voided, back in stock | Mauzo yamebatilishwa, imerudi kwenye Stock |
| vendor.stock.sale | Receipt {number} | Risiti {number} |

### 9.5 Sync and conflicts
| Key | EN | SW (draft) |
|---|---|---|
| vendor.sync.banner | {n} sales waiting to sync | Mauzo {n} yanasubiri kutumwa |
| vendor.sync.tile | Sales waiting to sync ({n}) | Mauzo yanayosubiri kutumwa ({n}) |
| vendor.sync.now | Sync now | Tuma sasa |
| vendor.sync.syncing | Syncing… | Inatuma… |
| vendor.sync.synced | Sale synced: {number} | Mauzo yametumwa: {number} |
| vendor.sync.done | All sales are synced. | Mauzo yote yametumwa. |
| vendor.sync.lastTry | Last try {time} | Jaribio la mwisho {time} |
| vendor.sync.conflicts | {n} sales need fixing | Mauzo {n} yanahitaji kurekebishwa |
| vendor.sync.title | Sales on this device | Mauzo kwenye kifaa hiki |
| vendor.sync.needsFixing | Needs fixing | Inahitaji kurekebishwa |
| vendor.sync.waiting | Waiting | Yanasubiri |
| vendor.sync.conflictStock | Not enough stock for {name}: {available} left, this sale has {qty}. | Stock haitoshi kwa {name}: zimebaki {available}, mauzo haya yana {qty}. |
| vendor.sync.conflictOther | FitFlex couldn't record this sale: {reason} | FitFlex imeshindwa kurekodi mauzo haya: {reason} |
| vendor.sync.conflictNotAllowed | You no longer have permission to record sales. | Huna tena ruhusa ya kurekodi mauzo. |
| vendor.sync.conflictTooOld | This sale is too old to record. | Mauzo haya ni ya zamani mno kurekodiwa. |
| vendor.sync.howToFix | Count the stock, then try again, or edit the sale. | Hesabu Stock, kisha jaribu tena, au hariri mauzo. |
| vendor.sync.askOwnerToCount | Ask someone with Products access to count the stock, then try again. | Muombe mwenye ruhusa ya Bidhaa ahesabu Stock, kisha jaribu tena. |
| vendor.sync.countStock | Count stock | Hesabu Stock |
| vendor.sync.retry | Try again | Jaribu tena |
| vendor.sync.edit | Edit sale | Hariri mauzo |
| vendor.sync.finishCurrent | Finish or clear the current sale first. | Maliza au futa mauzo ya sasa kwanza. |
| vendor.sync.discard | Discard | Tupa |
| vendor.sync.discardTitle | Discard this sale? | Utupe mauzo haya? |
| vendor.sync.discardBody | It will not be recorded and its items stay in stock. If you took money for it, record it again or give the money back. | Hayatarekodiwa na bidhaa zake zitabaki kwenye Stock. Kama ulipokea pesa, yarekodi upya au rudisha pesa. |
| vendor.sync.signOutWarn | {n} sales on this device are not synced yet. They stay here and sync next time you sign in. | Mauzo {n} kwenye kifaa hiki bado hayajatumwa. Yatabaki hapa na kutumwa utakapoingia tena. |
| vendor.sync.signOutAnyway | Sign out anyway | Toka hata hivyo |
| vendor.sync.featureOff | Shop sales are switched off right now. Your saved sales stay on this device. | Mauzo ya dukani yamezimwa kwa sasa. Mauzo yako yaliyohifadhiwa yanabaki kwenye kifaa hiki. |

### 9.6 Error-code → message (sync conflicts and inline)
`insufficient_stock` → `vendor.sync.conflictStock` / `vendor.pos.err.stock`; `payment_short` → `vendor.pos.short`; `discount_exceeds_price` → `vendor.pos.discountTooBig`; `invalid_payment` / `reference_required` → `vendor.pos.err.payment`; `product_not_found` / `product_unavailable` → `vendor.pos.err.unavailable`; `sold_at_out_of_range` → `vendor.sync.conflictTooOld`; anything else → `vendor.sync.conflictOther` with `vendor.saveFailed` as `{reason}`. The raw code is never shown.

### 9.7 Portal-only
| Key | EN | SW (draft) |
|---|---|---|
| vendor.nav.sales | Sales | Mauzo |
| vendor.sales.portalDescription | Sales you record at your shop counter. | Mauzo unayorekodi kwenye kaunta ya duka lako. |
| vendor.sales.recordInApp | Record new sales in the FitFlex app (phone or web). | Rekodi mauzo mapya kwenye programu ya FitFlex (simu au mtandao). |
| vendor.sales.colReceipt / colTime / colItems / colPayment / colServedBy / colTotal / colStatus | Receipt / Time / Items / Payment / Served by / Total / Status | Risiti / Muda / Bidhaa / Malipo / Muhudumu / Jumla / Hali |
| vendor.sales.back | Back to sales | Rudi kwenye mauzo |
| vendor.sales.copyText | Copy receipt text | Nakili maandishi ya risiti |
| vendor.sales.copied | Receipt copied | Risiti imenakiliwa |
| vendor.dash.shopSalesToday | Shop sales today | Mauzo ya dukani leo |
| vendor.dash.shopSalesHint | Counter sales; not in FitFlex payouts | Mauzo ya kaunta; si sehemu ya malipo ya FitFlex |

---

## 10. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields read or sent | Status |
|---|---|---|
| `GET /vendor/tools/options`, `/vendor/me.tools` | `walkInSales: bool` | exists (sample in functions/shop.mjs) |
| Auth user / `/vendor/me` | `vendorPermissions[]` / `permissions[]` include `sales`; admin-role backfill | **new permission** (`STAFF_PERMISSIONS` lacks `sales` on RC) |
| Staff create/update | accepts `sales` in `permissions` | new |
| `GET /vendor/products` | `id, name, brand, sku?, images[0], priceTzs, discountPriceTzs, stock, status, approvalStatus, variants[{name, stock}]` | exists; **confirm `sku` and `brand` are on the row** (search uses them; else name only) |
| `GET /vendor/profile` | `businessName, contactNumber, address` (receipt header) | exists |
| `POST /vendor/sales` request | as §3.3; `method` enum incl. `halopesa`, `other`; `soldAt` in the past accepted | plan S3; **confirm `soldAt` window** (Q-14) |
| `POST /vendor/sales` errors | `insufficient_stock{productId, variant, available}`, `payment_short`, `discount_exceeds_price{productId?, variant?}`, `invalid_payment{index?}`, `reference_required{index}`, `product_not_found|product_unavailable{productId}`, `client_ref_reused`, `sold_at_out_of_range`, 404 `feature_disabled`, 403 | plan has the first four; **the rest are requested**; `{productId, variant}` on `discount_exceeds_price` lets the app highlight the line |
| Sale object (`POST` response, `GET /vendor/sales/:id`) | `id, number, status, kind, soldAt, recordedAt (server createdAt), clientRef, subtotalTzs, discountTzs (sale-level), lineDiscountTzs? (sum), totalTzs, paidTzs, changeTzs, note, createdBy{id,name}, voidedBy{id,name}|null, voidedAt, voidReason, lines[{id, productId, variant, nameSnapshot, qty, listPriceTzs, unitPriceTzs, discountTzs, lineTotalTzs}], payments[{method, amountTzs, reference}]` | plan has columns; **confirm `recordedAt`, `createdBy`/`voidedBy` as `{id,name}`, and whether `subtotalTzs` is before or after line discounts** (Q-5). `unitCostTzs` must **not** be sent to users without `canSeeCost` (not shown in S3 at all). |
| `GET /vendor/sales` | query `from, to` (EAT `YYYY-MM-DD`), `status`, `createdBy=me`, `cursor`, `limit=50`; rows `{id, number, soldAt, recordedAt, status, totalTzs, itemCount, methods[], createdBy{id,name}}`; `nextCursor`; `summary{count, totalTzs, voidedCount, byMethod[{method, amountTzs}]}` | list in plan; **`summary`, `createdBy=me`, `itemCount`, `methods[]` requested** (Q-12) |
| `POST /vendor/sales/:id/void` | `{reason}` → sale; errors `already_voided`, `has_refunds`, `reason_required` | plan; error codes requested |
| `GET /vendor/products/:id/stock-movements` rows | reasons `sale`, `sale_void` with `document{type:'sale', id, number}` | S1 shape; confirm `type:'sale'` |
| `GET /vendor/payments.todaySalesTzs` and settlement | exclude walk-in sales | plan states settlement ignores them; confirm the payments summary does too |

---

## 11. Open questions — decided 2026-10-19 (lead applied every recommendation below; owner may override)

- **Q-1 Six bottom-nav tabs for the owner.** Recommendation: accept 6 with labels always shown (all ≤8 characters EN/SW), checked by design-qa at 375 SW. Alternative: fold Messages into Business.
- **Q-2 Desktop POS in the portal.** Recommendation: not in S3. Flutter web already gives a desktop POS (§7.1). Revisit after S8.
- **Q-3 Walk-in price.** Recommendation: `discountPriceTzs` when set, else `priceTzs`, resolved server-side as `listPriceTzs`.
- **Q-4 Sellable products.** Recommendation: any non-archived product, including paused, pending-approval and rejected listings, and pending-approval vendors may sell, because a walk-in sale is not a marketplace listing. The server must accept the same.
- **Q-5 Discount semantics.** Recommendation: line `discountTzs` is the total for the line; `subtotalTzs` = Σ qty × unit price (before discounts); the response also gives the summed line discounts. The server decides how the sale discount is allocated to lines (for S6 profit).
- **Q-6 Suspended vendor.** Recommendation: may still record walk-in sales (their own business; marketplace stays off) with the suspended banner. Needs a security-reviewer view.
- **Q-7 Reference rules.** Recommendation: required for M-Pesa, Airtel Money, Mixx by Yas, HaloPesa and Bank (in line with the owner's "transaction ID required" rule of 2026-10-19), optional for Card and Other. The server enforces the same with `reference_required`.
- **Q-8 Zero-total sale.** Recommendation: allowed (a giveaway still moves stock), with `payments: []`.
- **Q-9 5xx handling.** Recommendation: offer "Save and sync later" on 5xx too (the customer is waiting). The plan says queue on network failure only; this is an explicit user choice and is safe because of `clientRef`.
- **Q-10 "Not a TRA fiscal receipt" line.** Recommendation: show it until S10, so vendors do not hand it out as a fiscal receipt. Wording to counsel with the vendor terms.
- **Q-11 Sharing a provisional (queued) receipt.** Recommendation: allow it, clearly marked provisional. The alternative is no share until synced.
- **Q-12 Sales summary.** Recommendation: the server returns `summary` (SQL aggregate, EAT), so the app never sums pages. Without it the summary card is hidden.
- **Q-13 Discarded queued sales.** Recommendation: local only in S3. A later slice could post a "discarded offline sale" audit event if the owner wants it.
- **Q-14 `soldAt` window.** Recommendation: accept a `soldAt` up to 7 days in the past and ≤5 minutes in the future; reject older with `sold_at_out_of_range`; the receipt number follows sync order, not `soldAt`.
- **Q-15 Existing staff role `sales`** (in `STAFF_ROLES` but with no matching permission today). Recommendation: when the role is picked in the staff form, preselect the `sales` permission; backfill `sales` onto existing role-`sales` staff as well as admin staff.
- **Q-16 Who sees which sales.** Recommendation: anyone with `sales` sees all of the vendor's walk-in sales (small shops), with an "Only mine" filter; void allowed on any sale (audited).

---

## 12. Acceptance criteria (UAT on Flutter web and portal from RC, isolated backend, seed vendor + staff accounts)

Gating and permissions
1. With `walkInSales: false` (or `/vendor/tools/options` failing), the mobile app shows no Sales tab, no POS route, and no `sales` checkbox in the staff form; the portal shows no Sales nav or dashboard card. `/vendor/sales/new` redirects to vendor home without an error.
2. With the flag on, the vendor account sees the Sales tab after Orders and the `Shop sales` permission checkbox in the staff form.
3. Staff with only `sales` open straight on the Sales tab with no bottom nav; staff without `sales` see no Sales tab, and a deep link to `/vendor/sales/new` lands on their first section with "You don't have access to shop sales."
4. Portal: `/vendor/sales/` is reachable only with `walkInSales` and `sales`; otherwise redirected with "You don't have access to that."

POS
5. Search filters products by name (and brand/SKU when present); no match shows `No products match "…"`.
6. Out-of-stock products are visible but cannot be added; screen readers announce them as disabled.
7. Tapping a product without variants adds qty 1; tapping again makes it 2. A product with variants opens the variant picker with stock per variant; 0-stock variants are disabled.
8. The `+` stepper stops at the available stock and shows "Only {n} in stock."
9. Line edit: changing Price each to a lower value updates the line total and shows "Price changed from {shop price}"; a line discount above the line total shows the "can't be more than" error and Save is disabled. A 10% discount on a 45,000 line gives −4,500.
10. A sale discount is applied after line discounts; Subtotal, Discounts and Total on the cart match the receipt after completion.
11. Leaving the POS with items and coming back (or reloading the web page) shows the same cart and "Your unfinished sale was kept." Clear sale asks for confirmation and empties it.
12. Flutter web ≥900px shows products and cart side by side; typing an exact SKU and pressing Enter adds that product.
13. No scan button appears in S3.

Payment
14. The payment sheet always shows the FitFlex money notice.
15. Cash exact: Complete enabled; receipt shows Change 0 (or no change line).
16. Cash 50,000 on a 45,000 total shows "Give change: TZS 5,000"; the receipt shows Change 5,000.
17. Split: Cash 20,000 + M-Pesa 25,000 on 45,000 completes; the receipt lists both payments with the M-Pesa reference.
18. M-Pesa without a reference keeps Complete disabled with "Enter the transaction reference."; Card without a reference completes.
19. M-Pesa 50,000 on a 45,000 total shows "Only cash can be more than the total…" and Complete is disabled.
20. Paying less than the total keeps Complete disabled and shows "Still to pay: …".
21. Methods offered, in order: Cash, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, Card, Bank transfer, Other.

Completion and receipt
22. A completed sale shows a receipt numbered R-000001 for a new vendor; the next sale is R-000002 (no gaps, also with two staff selling at once).
23. The receipt shows business name, number, date/time (EAT), served by, lines, discounts, totals, payments, change, "Payment received by {business}." and "This is not a TRA fiscal receipt."
24. Receipt language toggle switches the receipt between English and Kiswahili without changing the app language; Share opens the system share sheet with the text from §4.2 in the chosen language.
25. New sale opens an empty POS; Done goes to the Sales tab; back from the receipt never returns to the completed cart.
26. The sold quantity is gone from stock: the product's stock history shows a "Shop sale" row linked to "Receipt R-…", and the member shop's available stock dropped by the same amount.
27. A stock 409 at completion (sell the last unit from another session first) highlights the line with "Only {n} of {name} left" and focus moves to it; nothing is recorded.
28. The sale does not appear in vendor payouts/statements, carries no commission, and does not change `/vendor/payments` app-order figures.

Offline queue (web: devtools offline; Android: airplane mode needs a real device)
29. With the network off and products loaded once, the POS shows the offline banner with the cache time and a sale can be completed; the receipt shows "Waiting to sync" and a temporary ref, and the Sales tab shows the queued row first.
30. Restoring the network syncs the sale within about 60 seconds (or at once with Sync now / resume); the open receipt updates to its R-number; history shows it with "Recorded offline" when sold >5 min before it reached FitFlex.
31. Syncing the same queued sale twice (e.g. retry after a lost response) records exactly one sale and one stock movement.
32. Two queued sales sync oldest first.
33. Offline sale whose stock ran out meanwhile: after sync it is listed under "Needs fixing" with "Not enough stock for {name}: {available} left, this sale has {qty}."; it is not recorded and stock is not negative.
34. Conflict → Count stock (user with `products`) opens Adjust stock with Counted preselected; after counting up, Try again records the sale with the original sale time.
35. Conflict → Edit sale loads it into the POS; after lowering the quantity and completing, the conflict disappears and one sale is recorded.
36. Conflict → Discard asks for confirmation with the "If you took money…" text and removes it; nothing is recorded.
37. Staff without `products` see "Ask someone with Products access…" instead of Count stock.
38. Sign out with queued sales shows the warning with Sync now / Sign out anyway; after Sign out anyway and signing in as another user on the same device, that user sees no queued sales; signing back in as the first user syncs them.
39. Server 5xx at completion shows the error with Try again and "Save and sync later"; the latter queues the sale.
40. Turning `walkInSales` off with a sale queued: the Sales tab disappears, Business shows "Sales waiting to sync (1)", and the sync screen shows the switched-off notice; nothing is deleted.

History, detail, void
41. Sales tab defaults to Today with summary count, total and per-method totals; 7 days / 30 days / Choose dates and All / Completed / Voided / Only mine filter correctly; Load more appends.
42. Empty states: a vendor with no sales sees "No shop sales yet…" with New sale; an empty range shows "No sales in these dates."
43. Sale detail shows "Price changed by {name} (shop price …)" for an overridden line.
44. Void requires a reason; after voiding, the sale shows Voided, "Voided by {name}, {time}: {reason}", Share is hidden, totals are excluded from the summary, and stock history shows "Sale voided, back in stock" exactly once. A second void attempt shows "This sale was already voided."
45. Void with the network off shows "Voiding needs a connection. Nothing was changed." and is not queued.
46. Portal: list, filters (URL keeps them), detail panel, Copy receipt text, and Void behave as on mobile; focus moves to the detail heading and back to the row; Escape closes the void dialog.
47. Portal dashboard shows "Shop sales today" separate from app-order sales.

Privacy and data
48. The offline queue and product cache in local storage (devtools) contain no `costTzs`; sale responses for staff without cost access contain no `unitCostTzs`.
49. Vendor A cannot open vendor B's sale id (not-found state) on mobile or portal.

Accessibility and language
50. Every control on the POS, cart, payment sheet, receipt, history, sync screen and portal pages has a screen-reader label (web semantics tree / axe), including steppers with the product name and method chips with selected state; change-due/remaining and sync results are announced.
51. Touch targets ≥48dp on mobile (steppers, chips, remove icons, cart bar) and ≥44px on the portal.
52. Text contrast ≥4.5:1 in light and dark (change due, warning banners, badges); voided status is shown in text, not only by strike-through or colour; Volt only in dark.
53. In Kiswahili at 375px and text scale 200%: no clipped text in the nav (labels may ellipsize with full semantics), cart bar, payment chips, money notice, receipt or history rows; no English except "Stock", "SKU", product/variant names, method brand names and user notes.

Not verifiable on Flutter web (needs a real device): Android airplane-mode queue and resume sync, app-kill draft recovery on Android, system share sheet into WhatsApp/SMS, haptics.
