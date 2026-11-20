# Suppliers, receive stock and payables with instalments (S9): design spec

Status: APPROVED 2026-11-04 — owner accepted all recommendations (Q-1..Q-7). Date: 2026-11-04. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §1 (flags `VENDOR_TOOLS` + `VENDOR_PURCHASES`, `/vendor/tools/options.purchases`, new permission `purchases` backfilled onto `vendorRole='admin'` staff, integer TZS, EAT), S9, §4 (Msambazaji, Pokea Stock), §5 (**O-6** GRN- numbers continuous per vendor, no yearly reset; **O-8** no credit balance, mirrored here for suppliers; **O-9** stock-in sets the cost price to the last purchase cost), §7. **FitFlex moves no money for payables. They are tracked only.**
Builds on: `vendor-stock-ledger-s1.md` (ledger, `ProductPrivate`, variant invariant O-1, low-stock crossing), `vendor-portal-s2.md`, `vendor-walkin-sales-s3.md` (numbering, void pattern, M2 staff rule, payment methods, clientRef), `vendor-customers-s4.md` (aging buckets in EAT, archive rule, payment sheet), `vendor-documents-s5.md`, `vendor-reports-s6.md` (stock value, profit cost basis, payment methods), `vendor-refunds-s7.md` (format, money rules). Components, states and strings from those specs are reused. This spec overrides them only where it says so.

Read from `origin/release-candidate` (read only): functions 3b346b8, portal 49f69ea, mobile 1148a7d.

Platforms: Flutter (Android and Flutter web: receiving at the back door) and the Next.js portal (suppliers, purchases, payables, receive stock at a desk). Roles: `vendor`, and `vendor_staff` with `purchases`.

S8 (barcodes) is not built. Scanning in Receive stock is **out of scope** for S9. The product picker searches by name and SKU, and a scan button can be added later without changing this contract (§4.3).

---

## What already exists in code (so builders don't duplicate it)

| Area | Exists on RC | S9 still has to add |
|---|---|---|
| Flag | `VENDOR_PURCHASES` is in `VENDOR_TOOLS_FLAGS`. `vendorToolsOptions()` already returns `purchases: vendorToolsFlag('VENDOR_PURCHASES')`, so `/vendor/tools/options` and `/vendor/me.tools` carry it (`src/shared/feature-flags.mjs` l.220–257) | A `vendorPurchasesOn()` helper that **also needs `VENDOR_STOCK_LEDGER`** (§0.2; options value changes accordingly, call out). Mobile `VendorTools` (`lib/screens/vendor/stock/stock_options.dart`) has **no `purchases` field**. Portal `VendorTools` (`src/lib/api.ts` l.2366) has only the index signature, so add a typed `purchases?: boolean` |
| Permission | **Not present.** `STAFF_PERMISSIONS = products, orders, sales, customers, reports, payments, staff` (`shop-service.mjs` l.35). `createVendorStaff` gives `role admin` the whole set at creation time. `vendorMe.permissions` is built from the set | Add `purchases` to `STAFF_PERMISSIONS`. Backfill in the migration (§2.1), copying the S3 pattern in `20261230120000-vendor-walkin-sales.cjs` l.153–163: `User.vendorPermissions`, `OrgMembership.aclPermissions` and pending vendor `Invitation.aclPermissions`, for `vendorRole='admin'` only (Q-2). Mobile and portal staff forms read `vendor.permission.<p>`, so add the label (§8.1) |
| Stock ledger | `ShopStockMovement.reason` CHECK already allows `stock_in` and `stock_in_void`. `kind` CHECK allows `stock_in` and `stock_in_void`. Unique `(sourceId, productId, variant, reason) WHERE sourceId IS NOT NULL` (S3 migration). Unique `(vendorId, clientRef)` | Writing those rows. `movementView` (`vendor-stock-store-pg.mjs` l.37–42) maps only `order`, `sale`/`sale_void` and `refund`/`refund_revert` to a `document`, so add `purchase`. **No client label exists** for `vendor.stock.reason.stock_in` / `stock_in_void` (mobile or portal) |
| Stock moves | The conditional-update pattern and helpers `VARIANT_HAS_STOCK`, `variantStockAdjusted('+'|'-')`, `variantStockOf` (`shop-order-store-pg.mjs`), used by S3 sale/void and S7 refund/undo. Products locked in id order. `afterStockMoved(productIds)` for low-stock crossings | Reuse as is for stock-in (+) and void (−) |
| Cost price | `ProductPrivate (productId, variant '', vendorId, costTzs, reorderLevel, lowStockAlertedAt, vatCode, updatedAt)`. `writePrivates` upserts per (productId, variant). Sales snapshot cost as "variant's own, else product's" (`vendor-sale-store-pg.mjs` l.239–244). `canSeeCost` = vendor account, `vendorRole=admin` staff, FitFlex admin with `shop` | New columns `costSourceId`, `costUpdatedAt` (§1 P-6). The product form and admin listing writes set `costSourceId = null` |
| Numbering | `VendorDocumentSequence (vendorId, docType, next)`, row-locked `INSERT … ON CONFLICT DO UPDATE … RETURNING next − 1` (S3/S4/S5/S7). No CHECK on `docType` | docType `purchase` → `GRN-000001` helper |
| Product list | `GET /vendor/products` accepts `products` OR `sales` (`requireAnyVendorPermission('products','sales')`, `functions/shop.mjs` l.129–130); cost fields only for `canSeeCost` | Add `purchases` to the accepted list (read only; **call out**) |
| Payment methods | `PAYMENT_METHODS` and `REFERENCE_REQUIRED` (`src/shared/vendor-sale.mjs` l.17–18), `CLIENT_REF` regex | Reuse |
| Aging | `agingBucket`, `eatToday` (`src/shared/vendor-customer.mjs`), receivables aging SQL (`vendor-customer-store-pg.mjs` l.572+) | Mirror for payables (§2.9) |
| Reports | Stock value reads current `ProductPrivate.costTzs` (`vendor-report-store-pg.mjs` `productsOf`). Profit reads sale-line / order-line cost snapshots. `paymentMethods()` returns `salePayments`, `customerPayments`, `paidBack`, `app` | A `paidToSuppliers` group (§2.11). Nothing else |
| Guards | `requireSalesPermission` in `functions/vendor-sales.mjs` (stored staff record; suspended vendor → 403 `vendor_suspended`), `voidsAny(user)` | `requirePurchasesPermission` with the same shape; reuse `voidsAny` for the M2 rule |
| Clients | Nothing for suppliers, purchases or payables in `app/vendor/*`, `src/components/vendor/*`, `lib/screens/vendor/*` or either i18n file. The portal has `VENDOR_AREAS` + `vendorNav` in `Shell.tsx`; mobile tab 0 is Products (`_sections`) and tab 2 already uses an `FFSegmented` (Reports \| Payouts) | Everything in §3–§5 |

No table, route or screen for suppliers or purchases exists on RC.

---

## Ground rules

- **FitFlex moves no money.** Payables are records of what the vendor owes a supplier and what they say they paid. No PaymentRequest, no Selcom, no settlement row, no payout change. The UI says so wherever money appears (`vendor.purchases.moneyNotice`).
- **Stock goes in only through a purchase or an S1 adjustment.** A purchase is one transaction: stock in, ledger, cost price, number, money record.
- **A purchase is never edited.** Wrong lines → void and receive again. Only the instalment plan can change (§2.6), and payments can be voided.
- **Money display "TSh 45,000"**. "TZS" only in data and CSV headers. Integer shillings.
- **EAT.** `receivedOn`, `paidOn` and due dates are EAT calendar dates. Aging uses the EAT day (00:00 EAT = 21:00 UTC).
- **Online only** (§4.8), with a local draft so typed lines are not lost.
- **Dormant**: everything needs `VENDOR_TOOLS` + `VENDOR_STOCK_LEDGER` + `VENDOR_PURCHASES`.

---

## 0. Scope, gating, permissions, reuse

### 0.1 In scope
- Suppliers: add, edit, archive / restore, search; profile with what you owe and history.
- Receive stock (goods received note `GRN-000001`): one or more product lines with quantity and unit cost; stock rises; cost price updates (O-9).
- Pay at receipt (in full, part, or nothing), and an instalment plan for the rest.
- Record payments later, void a payment, change the instalment plan.
- Void a whole purchase (stock comes back out only if it is still there).
- Owed to suppliers (payables aging) per supplier.
- Effects on stock history, low stock, cost price, S6 reports.

Out of scope: barcode scanning (S8); returning part of a delivery to the supplier (Q-6); purchase orders before delivery; landed costs (transport, supplier discounts as separate lines: enter the effective unit cost); input VAT on purchases; supplier-level payments spread over several purchases (Q-3); a printable or shareable GRN document through S5 (Q-4); reminders by push (Q-7); offline receiving (Q-5); attachments (photo of the supplier's invoice).

### 0.2 Gating (fail closed, as S1–S7)
- Server: `vendorPurchasesOn()` = `VENDOR_TOOLS && VENDOR_STOCK_LEDGER && VENDOR_PURCHASES`. Receiving stock depends on ledger semantics (conditional updates, variant stock, low stock), so the slice is never on without the ledger. `vendorToolsOptions().purchases` returns this value (**changed meaning, call out**; today it ignores the ledger flag).
- Client: `purchasesOn` = `tools.purchases === true`. False, missing or options failed: no Purchases segment or nav item, no Receive stock action, no supplier screens, no "Owed to suppliers" tile; deep links go to the vendor home with no message. Never show "feature off".
- **Flag goes off after use (decision):** every purchase, supplier and payables endpoint answers 404 `feature_disabled`; screens disappear. Data is kept and comes back when the flag is on. Stock already received stays (it is stock). Stock history rows keep their reason label "Received from supplier" and show the GRN number as plain text, not a link. Reports keep using the cost prices purchases set. Rationale: this flag is the owner's switch, and unlike S7 there is no other record (a sale) that would look wrong without it.

### 0.3 Permissions

| Action | Needs | Notes |
|---|---|---|
| Suppliers list, profile; add / edit / archive / restore | `purchases` | |
| Receive stock | `purchases` | Does **not** need `products` |
| Product picker in Receive stock | `purchases` | `GET /vendor/products` gains `purchases` (read only). Cost fields still only for `canSeeCost` |
| Purchase list and detail, unit costs on purchase lines, last purchase cost | `purchases` | Q-1: purchase costs are visible to `purchases`; `canSeeCost` is unchanged |
| "Cost price will change from X to Y" preview, `previousCostTzs` | `purchases` + `canSeeCost` | Others see "Cost price will be set to Y" |
| Record a payment, change the instalment plan | `purchases` | |
| Void a purchase, void a payment | `purchases` + the **M2 rule** | Owner and `vendorRole=admin` staff: any. Other `purchases` staff: a record **they made, on the EAT day they made it** (`createdAt`). Else 403 `void_not_allowed {reason: not_own \| too_old}` |
| Owed to suppliers (aging), CSV | `purchases` | |
| "Paid to suppliers" in S6 Payment methods | `reports` + `purchases` | Absent otherwise |
| Stock history link to a GRN | `products` (to see history) + `purchases` (to open the GRN) | Without `purchases`: plain text "GRN-000012" |

- Rights come from the stored staff record (S3 `requireSalesPermission` pattern), never from the token. Staff of a suspended vendor → 403 `vendor_suspended`. Disabled staff → 403 as today.
- A void (purchase or payment) by staff notifies the vendor account (§2.12).
- `createVendorStaff` with `role admin` gets `purchases` automatically (the set grows). Other roles get it only when ticked (Q-2).

### 0.4 Components (reuse; no new shared component)

| Need | Mobile | Portal |
|---|---|---|
| Hub, lists, rows | `FFCard`, `FFSectionTitle`, `FFStatTile`, list tiles ≥56dp with merged semantics | `Card`, `Table` (cards below `md`), `MetricCard` |
| Segments / filters | `FFSegmented`, `FFPill` wrap with `Semantics(selected:)` | `Segmented`, chip buttons |
| Pickers | `showFFSheet` + `FFTextField` search (S4 customer picker pattern) | `Combobox`-style `Input` + listbox (S4 portal customer picker pattern) |
| Qty / cost inputs | `FFTextField` digits only + S3 48×48 stepper | `Input type="number"` + − / + `Button`s |
| Dates | `showDatePicker` (localised, EAT) | `Input type="date"` |
| Method + reference | S3 method `FFPill` wrap + `FFTextField` | S3 method chips + `Input` |
| Aging | 5 `FFStatTile`s (S4 §10) | `Stat` row + `Table` (S4 `owed-view.tsx`) |
| Dialogs | `FFDialog`, `FFSheet` | `Dialog`, `ConfirmDialog` |
| Status | `FFBadge`: Received = success, Voided = neutral, Paid = success, Part paid = info, Unpaid = neutral, Overdue = warning | `Badge`, same tones |
| States | `FFSkeleton*`, `FFEmptyState`, `FFErrorState(onRetry:)`, `FFAlert`, `FFSnack` | `SkeletonCard`/`SkeletonTable`, `EmptyState`, `ErrorState`, `Alert`, toast |
| Text share | `share_plus` (S3 receipt text pattern) | Copy to clipboard + `window.print()` with print CSS |

New non-visual pieces: `PurchaseDraftController` (mobile; lines, payment choice, schedule, local draft persistence) and `scheduleFor(total, paidNow, n, firstDue, everyDays)` (even split helper; the last instalment takes the remainder). Mobile files in `lib/screens/vendor/purchases/`. Portal: `app/vendor/purchases/page.tsx`, `app/vendor/purchases/receive/page.tsx`, components in `src/components/vendor/purchases/`.

---

## 1. Purchase and payables rules (decided in this spec)

These are decisions, not open questions. design-qa and the specs check them one by one.

**P-1 Lines and totals.** A line is `{productId, variant, qty 1–100000, unitCostTzs 0–100,000,000}`. `lineTotalTzs = qty × unitCostTzs` (exact integers, no rounding). `totalTzs = Σ lineTotalTzs`, capped at 1,000,000,000 (`total_too_large`). One line per (product, variant) per purchase (`duplicate_line`): add the quantities instead. 1–200 lines. The server computes every total; the client never sends one.

**P-2 Which products.** Any of the vendor's products that is not deleted and not archived (`product_unavailable` for archived; paused, pending and rejected listings can be received). Variant rules as S3: when the product's variants track stock, `variant` is required (`variant_required`) and stock goes to that variant (product stock = sum, O-1). An untracked variant name may be given; stock goes to the product count.

**P-3 Supplier.** Required when anything is left owing (`supplier_required`). Optional when the purchase is paid in full at receipt or the total is 0 (bought at the market for cash). An archived supplier cannot be used (`supplier_archived`).

**P-4 Paying at receipt.** `paidNow {amountTzs, method, reference?}`:
- 0 or absent → nothing paid.
- `amountTzs` ≤ `totalTzs`; more → 400 `overpayment {totalTzs}` (O-8 mirrored: no supplier credit balance).
- Methods and reference rules as S3 (`REFERENCE_REQUIRED` for mpesa, airtel_money, mixx, halopesa, bank: the vendor's outgoing transaction id).
- It is recorded as a normal payment (`VendorPurchasePayment`, `atReceipt: true`, `paidOn = receivedOn`).

**P-5 Instalment plan.** The plan always covers the **whole total**: active instalments `Σ amountTzs = totalTzs`.
- Payment at receipt → instalment 1 = that amount, due `receivedOn`.
- The rest is either one instalment due `dueDate` (default `receivedOn + 30 days`) or a `schedule` of 1–12 instalments `{dueDate, amountTzs ≥ 1}` with `Σ = totalTzs − paidNow` (`schedule_mismatch {expectedTzs, scheduledTzs}`). Due dates from `receivedOn` to `receivedOn + 365` (`due_date_out_of_range`), sorted by the server (date, then given order).
- Payments are applied to instalments **oldest due first** (date, then seq). An instalment's state is derived, never stored: `covered = min(amount, max(0, paidTzs − Σ earlier amounts))`; Paid when covered = amount, Part paid when 0 < covered < amount, otherwise Due or Overdue.
- Because it is derived, a payment voided later reopens the earliest instalments first, with their original due dates. This is honest: the money is owed again and may be overdue.

**P-6 Cost price update (O-9) and void.** For each line with `unitCostTzs > 0`, in the receive transaction:
- Target row = `ProductPrivate (productId, line.variant || '')`. A variant line writes the **variant's own** cost; the product-level cost (`''`) is left alone. A product without variants writes `''`.
- If the target's `costTzs` differs from `unitCostTzs`: store `previousCostTzs` and `previousCostSourceId` on the line, set `costTzs = unitCostTzs`, `costSourceId = purchaseId`, `costUpdatedAt = now`, `line.costUpdated = true`. If equal: nothing changes, `costUpdated = false`.
- `unitCostTzs = 0` (free goods, samples, a bonus unit) **never** changes the cost price. The line says "Free, cost price unchanged".
- Manual cost edits (product form, admin listing) set `costSourceId = null`.
- **On void:** for each line with `costUpdated`, if the row's `costSourceId` is still this purchase (nothing changed it since), restore `previousCostTzs` and `previousCostSourceId` (null clears). Otherwise (a later purchase or a manual edit changed it) leave it. The void response lists which cost prices were restored and which were kept.
- Sales and app orders already made keep their cost snapshots. Only later sales use the new cost (S6 profit is never restated).

**P-7 Stock on receive.** Per line: `Product.stock + qty` (and the variant's stock in the same statement, `variantStockAdjusted('+')`), ledger row `reason stock_in`, `kind stock_in`, `sourceId = purchaseId`, `delta +qty`, `stockAfter`, `actorId`, `note = GRN number`. Adding stock cannot fail on quantity. After commit, `afterStockMoved(productIds)` (an item going back above its reorder level clears `lowStockAlertedAt`, S1).

**P-8 Void a purchase.** Body `{reason}` (3–200). All or nothing:
- Every line's quantity must still be in stock: conditional `stock >= qty` (and the variant's own stock). Otherwise 409 `insufficient_stock {lines:[{productId, variant, name, receivedQty, available}]}` and nothing changes. The vendor counts the stock (S1 Counted) or sells less, then voids.
- Units leave: ledger `stock_in_void` / `stock_in_void`, `delta −qty`, same `sourceId` (unique index → once).
- Cost prices restored per P-6.
- **Payments on it are voided with it** in the same transaction (decision): a purchase's payments belong only to that purchase, so nothing is reallocated. The dialog says so and reminds the vendor to get any money back from the supplier themselves. (S4 refused instead, because customer payments can spread over several sales; supplier payments cannot in v1.)
- The GRN number is kept and the purchase shows Voided. Nothing counts as owed.
- After commit, `afterStockMoved` (the void may cross the reorder level and send `vendor_low_stock`).

**P-9 Record a payment later.** `{clientRef, amountTzs ≥ 1, paidOn, method, reference?, note?}`. `amountTzs ≤ balanceTzs` else 409 `overpayment {balanceTzs}`. `balanceTzs = 0` → 409 `nothing_owed`. `paidOn` from `receivedOn` to today EAT (no future). Applied oldest due first (P-5). The response shows which instalments it covered.

**P-10 Void a payment.** Body `{reason}`. Payment → `voided`; `paidTzs −= amount`; `balanceTzs += amount`; coverage recomputes (P-5). M2 rule (§0.3). A purchase without a supplier cannot go into debt: 409 `supplier_required` (void the whole purchase instead).

**P-11 Change the instalment plan.** `PUT /vendor/purchases/:id/instalments {schedule}` replaces only the part not yet paid:
- Instalments fully covered by payments are kept as they are.
- A partly covered instalment is split: the covered part stays (same due date), and the rest is replaced.
- The new `schedule` (1–12 rows) must add up to `balanceTzs`. Due dates from today EAT to `receivedOn + 365`.
- Replaced rows get `status = replaced`, `replacedAt`, `replacedBy` and stay for history. There is no M2 rule: no money moves. It is audited.

**P-12 Supplier archive.** Refused while the supplier is owed anything: 409 `supplier_has_balance {owedTzs}` (S4 rule). Archived suppliers are hidden from the picker; their purchases stay readable; restore is always allowed. No delete.

**P-13 Numbering (O-6).** `GRN-000001…` per vendor from `VendorDocumentSequence` docType `purchase`, row-locked in the receive transaction. A refused or rolled-back receive gives its number back. A void keeps the number. Payments have no number (Q-4); their id is shown shortened only in support views.

**P-14 Received date.** `receivedOn` (EAT date) defaults to today, may be up to 30 days back (late paperwork), never in the future (`received_on_out_of_range {earliest, latest}`). Stock and the ledger row are dated **now** (`createdAt`), because that is when the count changes. The purchase shows both ("Received 1 Nov · recorded 3 Nov, 10:05") when they differ by a day or more.

---

## 2. Backend contract (for backend-builder, contract-checker, security-and-privacy-reviewer)

All routes: `requireAuth('vendor','vendor_staff')` + `requirePurchasesPermission` (stored staff record; suspended vendor → 403 `vendor_suspended`; missing → 403 `vendor_permission_forbidden {requiredPermission: 'purchases'}`). `vendorPurchasesOn()` false → 404 `feature_disabled`. Every query is vendor-scoped and parameterised, on a dedicated Postgres store (`src/infra/vendor-purchase-store-pg.mjs`), never `filterAsync`. Writes share a per-vendor limiter of 120/min (`vendor-rate-limit.mjs`) → 429 `rate_limited {retryAfterSeconds}`. Files: `functions/vendor-purchases.mjs`, `src/services/vendor-purchase-service.mjs`, `src/shared/vendor-purchase.mjs` (parsing, `grnNumber`, coverage maths).

### 2.1 Migration `<after 20270202090400>-vendor-purchases.cjs` (**rule 6: money records, cost writes, permission backfill**)

**`VendorSupplier`**
| Column | Notes |
|---|---|
| id text PK | `vsp_` + 16 hex |
| vendorId text not null | unique `(id, vendorId)` (for composite FKs) |
| name text not null | CHECK 2–120 |
| phone, email, contactPerson, address, tin, note | null; CHECK lengths: phone ≤ 20 (stored E.164 `+255…` when it parses as TZ), email ≤ 254, contactPerson ≤ 120, address ≤ 300, tin ≤ 20, note ≤ 500 |
| archivedAt, archivedBy | null |
| createdBy, createdAt, updatedAt | |
Indexes: `(vendorId, lower(name))` (search); unique `(vendorId, lower(name)) WHERE archivedAt IS NULL` → 409 `duplicate_supplier {supplierId}`.

**`VendorPurchase`**
| Column | Notes |
|---|---|
| id text PK | `vpo_` + 16 hex |
| vendorId, seq int, number text | `GRN-000001`; unique `(vendorId, seq)`, `(vendorId, number)` |
| supplierId text null | FK `(supplierId, vendorId)` → `VendorSupplier(id, vendorId)` |
| status text not null | CHECK `received \| voided` |
| receivedOn date not null | P-14 |
| supplierInvoiceRef text null | CHECK ≤ 60 (the supplier's own invoice / delivery note number) |
| note text null | ≤ 200 |
| totalTzs, paidTzs, balanceTzs int not null | CHECK all ≥ 0; CHECK `paidTzs + balanceTzs = totalTzs`; CHECK `totalTzs ≤ 1000000000` |
| | CHECK `supplierId IS NOT NULL OR balanceTzs = 0 OR status = 'voided'` |
| clientRef, fingerprint text not null | unique `(vendorId, clientRef)` |
| createdBy, createdAt, updatedAt | createdAt = when it was recorded |
| voidedBy, voidedAt, voidReason | CHECK all set iff `status = voided`; voidReason 3–200 |
Indexes: `(vendorId, receivedOn, id)`, `(vendorId, supplierId, receivedOn)`, `(vendorId) WHERE status='received' AND balanceTzs > 0`.

**`VendorPurchaseLine`**
| Column | Notes |
|---|---|
| id, purchaseId (FK cascade), vendorId, lineNo | unique `(purchaseId, lineNo)`, unique `(purchaseId, productId, variant)` |
| productId text not null, variant text not null default '' , variantTracked bool | |
| nameSnapshot text not null | product name at receipt |
| qty int | CHECK 1–100000 |
| unitCostTzs int | CHECK 0–100000000 |
| lineTotalTzs int | CHECK `= qty * unitCostTzs` |
| costUpdated bool not null default false | P-6 |
| previousCostTzs int null, previousCostSourceId text null | P-6; CHECK `costUpdated OR (previousCostTzs IS NULL AND previousCostSourceId IS NULL)` |
| costRestoredOnVoid bool null | set on void (true/false for costUpdated lines) |

**`VendorPurchaseInstalment`** (the plan)
| Column | Notes |
|---|---|
| id, purchaseId (FK cascade), vendorId, seq | unique `(purchaseId, seq)` |
| dueDate date not null | |
| amountTzs int | CHECK ≥ 1 |
| status text not null default `active` | CHECK `active \| replaced` |
| replacedAt, replacedBy | CHECK set iff replaced |
| createdBy, createdAt | |
Index `(vendorId, dueDate) WHERE status='active'`.

**`VendorPurchasePayment`** (money records; **added to the plan's list**: the plan put `paidAt, method, reference` on the instalment. A separate payment row lets one payment cover more than one instalment, lets a payment be voided as one record, and keeps the plan replaceable. See Q-3.)
| Column | Notes |
|---|---|
| id text PK | `vpp_` + 16 hex |
| vendorId, purchaseId (FK `(purchaseId, vendorId)`), supplierId null (snapshot) | |
| amountTzs int | CHECK ≥ 1 |
| paidOn date not null | |
| method text not null, reference text null | CHECK method in S3 list; reference ≤ 100 |
| note text null | ≤ 200 |
| atReceipt bool not null default false | |
| status text not null default `recorded` | CHECK `recorded \| voided` |
| clientRef, fingerprint | unique `(vendorId, clientRef)`; for `atReceipt` rows clientRef = purchase clientRef + `:paid` |
| recordedBy, createdAt | |
| voidedBy, voidedAt, voidReason | CHECK all set iff voided. `voidReason` = the purchase void reason when voided with the purchase (`voidedWithPurchase bool`) |
Index `(vendorId, paidOn)`, `(purchaseId)`.

**`ProductPrivate` gains** `costSourceId text null` (a purchase id; null = set by hand or unknown) and `costUpdatedAt timestamptz(3) null`. Existing rows: both null.

**Permission backfill** (S3 pattern, idempotent, prints counts): add `purchases` to `User.vendorPermissions` where `userType='vendor_staff' AND vendorRole='admin'`; to `OrgMembership.aclPermissions` for those users' vendor memberships; to pending vendor `Invitation.aclPermissions` with `payload->>'vendorRole' = 'admin'`.

**Down:** refuses while any `VendorPurchase` row exists (prints the count; S4/S7 pattern). Otherwise removes `purchases` from users, memberships and invitations, drops the two `ProductPrivate` columns, drops the five tables, and deletes `VendorDocumentSequence` rows with docType `purchase`.

### 2.2 Suppliers
- `GET /vendor/suppliers?q&filter=active|owing|overdue|archived&sort=name|owed|recent&limit=50&cursor` → `{ suppliers:[{ id, name, phone|null, contactPerson|null, owedTzs, overdueTzs, nextDueDate|null, lastReceivedOn|null, archived }], nextCursor }`. `q` matches name, phone, contact person (≥ 2 chars). Default `filter=active`, `sort=name`.
- `POST /vendor/suppliers {name, phone?, email?, contactPerson?, address?, tin?, note?}` → 201 `{supplier}`.
- `GET /vendor/suppliers/:id` → `{ supplier:{ id, name, phone, email, contactPerson, address, tin, note, archivedAt, createdAt, updatedAt }, totals:{ purchasedTzs, purchaseCount, paidTzs, lastReceivedOn }, owedTzs, overdueTzs, aging:{current, d1_30, d31_60, d61_90, d90plus}, asOf, openInstalments:[{ purchaseId, number, seq, dueDate, openTzs, daysOverdue }] }` (totals exclude voided purchases).
- `PUT /vendor/suppliers/:id` partial (`null` clears an optional field; `name` cannot be null) + `archived: true|false`. Archive → P-12.
- Errors: 400 `name_required {min}`, `name_too_long {max}`, `invalid_phone`, `invalid_email`, `field_too_long {field, max}`, `invalid_field {field}`; 404 `supplier_not_found` (unknown or another vendor's); 409 `duplicate_supplier {supplierId}` (an active supplier with the same name, case-insensitive; on restore too); 409 `supplier_has_balance {owedTzs}`.

### 2.3 `POST /vendor/purchases` — receive stock (new; **rule 6**)
Request:
```
{ clientRef, supplierId?, receivedOn? (YYYY-MM-DD, default today EAT), supplierInvoiceRef?, note?,
  lines:[{ productId, variant?, qty, unitCostTzs }],
  paidNow?: { amountTzs, method, reference? },
  dueDate? | schedule?: [{ dueDate, amountTzs }] }
```
- `dueDate` and `schedule` are mutually exclusive (`invalid_field {field: schedule}`), and both are ignored (not an error) when nothing is left owing.

→ **201** `{ purchase, costChanges:[{ productId, variant|null, name, fromTzs?, toTzs }] }` (`fromTzs` only for `canSeeCost`). Replay of the same clientRef with the same body → **200** with the same purchase (answered first, flag still required). Same clientRef with a different body → 409 `client_ref_reused`.

`purchase` shape (used by every purchase response):
```
{ id, number, status, supplier{id, name, archived}|null, receivedOn, recordedAt, supplierInvoiceRef|null, note|null,
  createdBy{id,name}, totalTzs, paidTzs, balanceTzs, overdueTzs,
  paymentState: paid | part_paid | unpaid, nextDue{dueDate, openTzs, daysOverdue}|null,
  lines[{ id, productId, variant|null, nameSnapshot, qty, unitCostTzs, lineTotalTzs, costUpdated, free,
          previousCostTzs? (canSeeCost only), costRestoredOnVoid|null }],
  instalments[{ id, seq, dueDate, amountTzs, coveredTzs, openTzs, state: paid|part_paid|due|overdue, daysOverdue }]  (active only),
  payments[{ id, amountTzs, paidOn, method, reference|null, note|null, atReceipt, recordedBy{id,name}, recordedAt,
             status, voidedBy{id,name}|null, voidedAt|null, voidReason|null, voidedWithPurchase }],
  voidedBy{id,name}|null, voidedAt|null, voidReason|null }
```
Never `fingerprint`, `clientRef`, `costSourceId` or internals.

**Order of checks** (one transaction, §2.8):
1. Replay.
2. Parse (400s).
3. Supplier (404 / 409 archived).
4. Lock and check products (404 / 400 variant / unavailable).
5. Money: P-3, P-4, P-5.
6. Stock in.
7. Cost.
8. Number.
9. Writes and audit.

### 2.4 Errors (receive)

| Status | Code | Extra |
|---|---|---|
| 404 | `feature_disabled` | |
| 403 | `vendor_permission_forbidden` | `requiredPermission: 'purchases'` |
| 403 | `vendor_suspended` | |
| 400 | `invalid_client_ref`, `lines_required`, `too_many_lines {max: 200}`, `invalid_line {index, field}`, `invalid_quantity {index, max}`, `invalid_cost {index, max}`, `duplicate_line {productId, variant}` | |
| 400 | `variant_required {productId, variants}`, `product_unavailable {productId}` | |
| 404 | `product_not_found {productId}`, `variant_not_found {productId, variant, variants}` | |
| 400 | `received_on_out_of_range {earliest, latest}`, `supplier_invoice_ref_too_long {max}`, `note_too_long {max}`, `total_too_large {max}` | |
| 404 / 409 | `supplier_not_found` / `supplier_archived {supplierId}` | |
| 400 | `supplier_required` | something left owing without a supplier |
| 400 | `invalid_payment {field}`, `invalid_method`, `reference_required {method}`, `reference_too_long {max}`, `overpayment {totalTzs}` | P-4 |
| 400 | `invalid_schedule {reason: count \| amount \| date}`, `schedule_mismatch {expectedTzs, scheduledTzs}`, `due_date_out_of_range {earliest, latest}` | P-5 |
| 409 | `client_ref_reused` | |
| 429 | `rate_limited {retryAfterSeconds}` | |

### 2.5 `POST /vendor/purchases/:id/void` (new; **rule 6**)
Body `{reason}` → 200 `{ purchase, costRestored:[{productId, variant, name}], costKept:[{productId, variant, name}], paymentsVoided: n }`.
| Status | Code | Extra |
|---|---|---|
| 404 | `purchase_not_found` | |
| 403 | `void_not_allowed` | `reason: not_own \| too_old` (checked first, as S3) |
| 409 | `void_not_allowed` | `reason: has_others_payments` — as built (security review L-2): staff without voidsAny can't void a purchase with active payments recorded by someone else; clients hide Void in that case |
| 409 | `already_voided` | `voidedAt` |
| 409 | `insufficient_stock` | `lines:[{productId, variant, name, receivedQty, available}]` (nothing changes) |
| 400 | `reason_required {min}`, `reason_too_long {max}` | |
No clientRef: a repeat answers `already_voided` (the client treats it as done).

### 2.6 Payments and the plan (new; **rule 6**)
- `POST /vendor/purchases/:id/payments {clientRef, amountTzs, paidOn?, method, reference?, note?}` → 201 `{ purchase, payment, covered:[{seq, dueDate, amountTzs}] }`; replay 200. Errors: 404 `purchase_not_found`; 409 `purchase_voided`, `nothing_owed`, `overpayment {balanceTzs}`, `client_ref_reused`; 400 `invalid_amount`, `invalid_method`, `reference_required {method}`, `reference_too_long`, `note_too_long`, `paid_on_out_of_range {earliest, latest}`, `invalid_client_ref`.
- `POST /vendor/purchases/:id/payments/:paymentId/void {reason}` → 200 `{ purchase }`. Errors: 404 `payment_not_found`; 403 `void_not_allowed {reason}` (on the payment's recordedBy/createdAt); 409 `already_voided`, `purchase_voided`, `supplier_required`, `supplier_archived {supplierId}` (as built: an archived supplier can owe nothing); 400 reason. Later payments: a `clientRef` ending in `:paid` → 400 `invalid_client_ref` (as built, L-5).
- `PUT /vendor/purchases/:id/instalments {schedule:[{dueDate, amountTzs}]}` → 200 `{ purchase }`. Errors: 409 `purchase_voided`, `nothing_owed`; 400 `invalid_schedule`, `schedule_mismatch {expectedTzs: balanceTzs, scheduledTzs}`, `due_date_out_of_range`.
- (The plan's `/instalments` and `/instalments/:iid/pay` become these three routes; Q-3.)

### 2.7 Reads
- `GET /vendor/purchases?from&to&supplierId&status=received|voided|all&payment=open|overdue|paid|all&createdBy=me&limit=50&cursor&format=json|csv` → `{ purchases:[{ id, number, status, receivedOn, recordedAt, supplier{id,name}|null, totalTzs, paidTzs, balanceTzs, overdueTzs, paymentState, nextDueDate, lineCount, units, createdBy{id,name} }], nextCursor, summary:{ count, totalTzs, paidTzs, balanceTzs, units } }` (summary over the whole filter, received only). EAT `from/to` on `receivedOn`. Newest first. CSV with the S6 formula-injection-safe escaping and headers in the chosen language (`lang`), ≤ 50,000 rows.
- `GET /vendor/purchases/:id` → `{ purchase }`.
- `GET /vendor/purchases/last-costs?productIds=a,b` (≤ 100) → `{ rows:[{ productId, variant|null, unitCostTzs, receivedOn, supplierName|null, number }] }`: the latest non-voided, non-free line per product/variant (the prefill and hint in Receive stock; Q-1).
- `GET /vendor/payables/aging` (§2.9).
- **Changed (additive; call out):** stock movements of kind `stock_in`/`stock_in_void` carry `document: { type: 'purchase', id, number }`. `GET /vendor/products` accepts `purchases` (read only).

### 2.8 Concurrency (one transaction each)
Lock order everywhere: **supplier → purchase → products** (products in the fixed `productId\0variant` order S3 uses), then `ProductPrivate` rows, then the sequence. App orders and POS sales lock products only, and S7 locks sale → products, so there is no cycle.

**Receive:**
1. Supplier `FOR SHARE` (archive takes `FOR UPDATE`, so archiving cannot race a new debt).
2. Each product `FOR UPDATE` in order. Re-check vendor, deleted and archived.
3. `stock = stock + q` (variant too). Ledger row per line.
4. `ProductPrivate` rows `FOR UPDATE` (insert-on-conflict for a missing row). P-6.
5. GRN number.
6. Insert purchase, lines, instalments, payment (if any). Audit.

**Void:**
1. Supplier `FOR SHARE` when set.
2. Purchase `FOR UPDATE`. Status must be received. M2 rule.
3. Products in order: conditional `stock >= q` (and the variant). Any miss → refusal with every short line (the store collects all lines before throwing, so the message lists them all).
4. Ledger `stock_in_void`.
5. ProductPrivate restore (P-6).
6. Payments → voided (`voidedWithPurchase`).
7. Purchase → voided (`paidTzs` unchanged as history; `balanceTzs` unchanged; voided purchases are excluded from every owed figure). Audit.

**Payment:** supplier `FOR SHARE` → purchase `FOR UPDATE` (re-read balance) → insert payment, update `paidTzs`/`balanceTzs`. **Payment void / plan change:** the same locks.

| Race | Result |
|---|---|
| Receive vs POS sale / app checkout of the same product | Product row lock; both succeed in some order; stock is exact (receive only adds) |
| Void vs a sale of the received units | Product row lock; whichever is second sees the real stock. A void that loses gets `insufficient_stock`; a sale that loses gets the S3/app `insufficient_stock` |
| Void vs app reservation | Reservations already took stock off `Product.stock`, so reserved units are not "available" to the void. It needs the units physically unsold and unreserved |
| Two payments on one purchase | Purchase lock; the second sees the reduced balance → `overpayment {balanceTzs}` if it no longer fits |
| Payment vs void | Purchase lock; a void that wins → `purchase_voided`; a payment that wins is voided with the purchase |
| Plan change vs payment | Purchase lock; the plan is checked against the balance read under the lock (`schedule_mismatch` with fresh numbers) |
| Archive supplier vs receive with balance | Supplier lock; the archive sees the new debt (`supplier_has_balance`) or the receive sees `supplier_archived` |
| Two receives updating the same cost | ProductPrivate row lock; the later one wins and becomes `costSourceId`; voiding the earlier one keeps the later cost (P-6) |
| Manual product-form cost edit vs receive | Row lock; whichever commits last is the cost; `costSourceId` tells the void what to do |
| Replay after a lost response | Unique `(vendorId, clientRef)` → 200 with the stored record. A unique violation inside the transaction is answered as a replay (S3 pattern) |

Ledger exactly once: at most one `stock_in` and one `stock_in_void` row per (purchase, product, variant), guaranteed by the existing `shopstockmovement_source_unique` index and the one-line-per-product rule (P-1).

### 2.9 Payables aging (`GET /vendor/payables/aging?bucket&sort=overdue|owed|name&limit&cursor&format=json|csv`)
- Per active instalment of a received purchase: `openTzs = amount − covered` (P-5). `daysOverdue = EAT today − dueDate`. Buckets as S4 §10.2: ≤ 0 Not due yet (due today = not due yet), 1–30, 31–60, 61–90, ≥ 91 Over 90 days. Server-computed in SQL (window sum over instalments ordered by dueDate, seq), never summed on the client.
- → `{ asOf, totals:{ owedTzs, overdueTzs, supplierCount, overdueSupplierCount, dueIn7DaysTzs, current, d1_30, d31_60, d61_90, d90plus }, rows:[{ supplierId, name, owedTzs, overdueTzs, oldestDueDate, maxDaysOverdue, current, d1_30, d31_60, d61_90, d90plus }], nextCursor }`. Totals cover all suppliers (not the filter or page). Archived suppliers owe nothing by P-12.
- Specs pin the clock at 21:30 UTC and 23:59 EAT (avoid the known 21:00–22:00 UTC flake).

### 2.10 Audit (`AuditLog`, same transaction, append-only)
- `vendor_supplier_created` / `_updated` (before/after fields) / `_archived` / `_restored`.
- `vendor_purchase_received`: `after {vendorId, number, supplierId, receivedOn, totalTzs, paidNowTzs, lines[{productId, variant, qty, unitCostTzs}], costChanges[{productId, variant, fromTzs, toTzs}]}`.
- `vendor_purchase_voided`: `before {status, totalTzs, paidTzs}`, `after {reason, costRestored[], costKept[], paymentsVoided}`.
- `vendor_purchase_payment_recorded` / `_voided`: amount, method, reference, paidOn, reason.
- `vendor_purchase_plan_changed`: `before {instalments}`, `after {instalments}`.

### 2.11 Effects on other slices
- **Stock history (S1):** rows "Received from supplier" (+q) and "Purchase voided" (−q) with the GRN link (§2.7). The S1 "Restocked" reason stays for adjustments. With `purchasesOn` and `purchases`, the adjust sheet shows the helper `vendor.purchases.adjustHint` with a link to Receive stock.
- **Low stock (S1):** receiving clears the alert once stock is above the level; a void may send `vendor_low_stock`. No new notification type.
- **Sales and app orders (S3, S1):** new sales snapshot the new cost (`costOf` reads `ProductPrivate`); paid app orders snapshot it in `ShopOrderLineCost`. No code change needed; a spec proves it.
- **Reports (S6):**
  - **Stock value** at cost changes at once (current cost × stock, "as of now"). The `costUnknown` count falls as purchases fill missing costs. No historical stock value (S6 Q-12 stands).
  - **Profit:** never restated. Past lines keep their snapshot; later sales use the new cost. A void that restores a cost affects only later sales.
  - **Payment methods:** a fourth group **"Paid to suppliers (by you)"** `paidToSuppliers[{method, amountTzs, count}]` from recorded payments by `paidOn` minus none (a voided payment drops out of every period, because it records no money; this differs from S7, whose undo is dated). Shown only with `reports` + `purchases` + `tools.purchases`. It is never summed with money in.
  - **Overview / Products / Sales:** unchanged.
- **Settlement, commission, payouts, pricing: untouched.** A spec asserts `VendorSettlement` prepare output is identical with purchases present.

### 2.12 Notifications (vendor account only, after commit, best effort; only when the actor is staff)
- `vendor_purchase_voided {purchaseId, number, totalTzs, byName, reason}`.
- `vendor_purchase_payment_voided {purchaseId, number, amountTzs, byName, reason}`.
Push `data`: `purchaseId, number`. Tap → `/vendor/purchases/:purchaseId`. Templates EN/SW §8.8. Nothing goes to the supplier. No due-date reminders in v1 (Q-7).

---

## 3. Navigation

### 3.1 Mobile (GoRoute; ids checked with `_safeId`)
**Placement (decision).** No new bottom tab (the owner already has up to six). Tab 0 **Products** gains an `FFSegmented` **Products | Purchases** (the tab 2 Reports | Payouts pattern) when `purchasesOn` and `purchases`. Tab 0 is shown when the user has `products` **or** (`purchasesOn` and `purchases`). A `purchases`-only staff member sees tab 0 labelled "Purchases" (`vendor.purchases.tab`) with only that view and no segment control.

| Route | Screen | Back |
|---|---|---|
| `/vendor/home?open=products&view=purchases` | Purchases hub (§4.1) | Tab root |
| `/vendor/purchases/receive?supplierId=` | Receive stock (§4.2) | With anything entered: `FFDialog` `vendor.purchases.leaveTitle` (Keep draft / Discard / Cancel). Nothing to pop → hub |
| `/vendor/purchases/:purchaseId` | Purchase detail (§4.4) | Pops. Opened right after saving, back goes to the hub (receive screen replaced). Nothing to pop → hub |
| `/vendor/suppliers` | Suppliers list (§4.6) | Pops → hub |
| `/vendor/suppliers/new`, `/vendor/suppliers/:supplierId/edit` | Supplier form | Pops (discard dialog if edited) |
| `/vendor/suppliers/:supplierId` | Supplier profile (§4.7) | Pops → suppliers list |
| `/vendor/payables` | Owed to suppliers (§4.8) | Pops → hub |

Deep-link rules: `purchasesOn` false → `/vendor/home` with no message. No `purchases` → first allowed section + snack `vendor.purchases.noAccess`. Unknown or another vendor's id → not-found state. Push → `/vendor/purchases/:purchaseId`.

Entry points: hub (Receive stock, recent purchases, Suppliers, Owed to suppliers), supplier profile (Receive stock from {name}, open instalment rows), stock history rows (`document.type == 'purchase'`), the S1 adjust-sheet hint, S6 Payment methods "Paid to suppliers" row → `/vendor/payables`, push.

### 3.2 Portal
- New area in `VENDOR_AREAS`: `{ href: '/vendor/purchases', permission: 'purchases', tool: 'purchases', quietWhenOff: true, noAccessKey: 'vendor.purchases.noAccess' }`, nav label `vendor.nav.purchases` "Purchases", icon `Truck`, placed after Products.
- One page `/vendor/purchases/` with `Segmented` views (query `view=`): **Purchases** (default) · **Suppliers** · **Owed to suppliers**. Detail by query (static export): `?id=<purchaseId>`, `?supplier=<supplierId>`.
- Receive stock: `/vendor/purchases/receive/?supplier=` (full page, not a dialog: it can hold many lines).
- Dashboard `/vendor`: tile "Owed to suppliers {amount} · due in 7 days {amount}" (with `purchases`) → `?view=payables`.

### 3.3 After completion
- **Stock received** → mobile replaces the receive screen with the purchase detail, snack `vendor.purchases.saved` {number}, focus on the GRN heading. The local draft is deleted. Portal: navigates to `?id=`, toast, focus on the heading.
- **Payment saved** → sheet/dialog closes, detail updates in place, snack/toast `vendor.purchases.paySaved` {amount}, focus to the Payments section heading.
- **Plan changed** → detail updates, snack `vendor.purchases.planSaved`.
- **Voided** → detail updates (Voided banner), snack `vendor.purchases.voided` {number}, focus to the status heading.
- **Supplier saved** → profile (new) or back to profile (edit), snack `vendor.suppliers.saved`. Quick-add from the picker returns to Receive stock with the supplier selected.

---

## 4. Mobile

### 4.1 Purchases hub (tab 0, view `purchases`)
Purpose: start a delivery fast and see what you owe.
1. **Owed card** (`FFCard`): "You owe suppliers" {owedTzs} (titleLarge) · "Overdue" {overdueTzs} (warning text + word) · "Due in the next 7 days" {dueIn7DaysTzs}. Tap → Owed to suppliers. Hidden figures when 0 show "Nothing owed" (`vendor.payables.nothingOwed`).
2. **Receive stock** primary button, full width (`key: purchases-receive`, icon `local_shipping`).
3. Two secondary tiles side by side (stack at 200% / Swahili < 160dp): **Suppliers** · **Owed to suppliers**.
4. **Recent purchases** (`FFSectionTitle`): last 20 rows: GRN number · supplier (or "No supplier") · received date · total · payment badge (Paid / Part paid / Unpaid / Overdue) · Voided badge. Row ≥ 64dp, merged semantics `vendor.purchases.rowLabel`. "See all" → full list with filters (pills: All · Owing · Overdue · Voided; date range as S1).
5. Pull to refresh.

Web ≥900: max width 960; owed card and buttons left column (40%), recent list right (60%).

### 4.2 Receive stock (`/vendor/purchases/receive`) — layout, phone 375
Purpose: record a delivery in under two minutes: who it came from, what came, what it cost, what was paid.

- **AppBar** `vendor.purchases.receive` "Receive stock" + close (`vendor.purchases.close`). A "Draft saved" muted line appears after the first change (§4.9).
- **Section 1 · Supplier** (`vendor.purchases.supplier`):
  - Chip/button "Choose supplier" → picker sheet (search name/phone, active suppliers, recent first; **Add supplier** quick form with name (required) + phone; **No supplier** option with helper `vendor.purchases.noSupplierHelp` "Only if you paid in full").
  - Chosen: name + phone ending + "Change". When the supplier already owes, a muted line "You already owe {amount}" (info).
- **Section 2 · Items** (`vendor.purchases.items`):
  - **Add item** ghost button → product picker sheet: search by name or SKU, tabs-free list showing name, variant count, current stock; tracked variants open a variant chooser (name · stock). Already-added items show "Added" and focus that line instead.
  - One `FFCard` per line:
    - name (variant), remove icon (48×48, `vendor.purchases.removeLine` {name})
    - **Quantity** stepper + field (1–100000)
    - **Unit cost** money field (digits; "TSh" prefix). Prefill: last purchase cost (`last-costs`), else the product's cost when `canSeeCost`, else empty. Hint `vendor.purchases.lastCost` "Last time: TSh 9,500 from Juma Supplies, 3 Nov".
    - Line total right-aligned, and "Stock {before} → {after}".
    - Cost notice (info, small): unit cost 0 → `vendor.purchases.freeLine`; differs and `canSeeCost` → `vendor.purchases.costWillChange` {from} {to}; differs without canSeeCost → `vendor.purchases.costWillBeSet` {to}; equal → nothing.
  - Empty: `FFEmptyState` small, `vendor.purchases.noItems` + Add item.
- **Section 3 · Details** (collapsed summary row "Received today · no invoice number", tap to expand): **Received on** date (today … 30 days back), **Supplier's invoice number** (optional, ≤ 60), **Note** (optional, ≤ 200, counter).
- **Section 4 · Payment** (shown once a line exists):
  - Total {amount} (bold).
  - `FFSegmented` **Paid in full · Paid part · Not paid yet** (default Paid in full when no supplier, else Not paid yet).
  - Paid in full / part: method pills (S3 order, default Cash) + reference (required marker for the five methods); part: **Amount paid now** field (1 … total − 1).
  - Left to pay (part / not paid): "Left to pay {amount}", then **Pay by** date (default received + 30 days) **or** "Split into instalments" link → instalment editor: number of instalments (2–12 stepper), first due date, every (2 weeks / month), **Split evenly** fills the rows; each row = due date + amount, editable; live line "Instalments add up to {sum} of {left}" (polite live region; error tone when different).
  - Money notice `FFAlert` info `vendor.purchases.moneyNotice` (always).
- **Primary (sticky bottom): Review {total}** (`vendor.purchases.review`). Disabled until: ≥ 1 line with a valid qty and cost; supplier chosen or paid in full; payment fields valid; instalments add up. The first missing thing shows as helper text above the button.

Flutter web ≥900: max width 1100; Supplier + Items left (60%), Details + Payment right (40%, sticky). Lines become a table: Item · Stock now · Qty · Unit cost · Line total · remove.

Tab order: close → supplier → Add item → each line (qty −, qty, +, unit cost, remove) → details → payment segment → method → reference → amount → pay by / instalment rows → Review.

### 4.3 Product picker and scanning
- Search is client-side over `GET /vendor/products` (already loaded for the vendor; paginated server search if > 500 products, same as the POS picker). Archived and deleted products are not listed. Paused/pending ones are, with a muted badge.
- **No scan button in S9.** When S8 ships, a scan icon in the search field calls `GET /vendor/products/lookup?code=` and adds the line (or +1 qty). Nothing in this contract changes.

### 4.4 Confirm (`FFDialog`)
- Title `vendor.purchases.confirmTitle` "Receive {units} items from {supplier}?" (no supplier: "Receive {units} items?").
- Body: lines "{qty} × {name} · {lineTotal}", total, paid now (method), left to pay with the plan ("2 instalments: 15 Dec TSh 50,000, 15 Jan TSh 50,000"), cost price changes count ("Cost price changes for 3 items").
- Buttons **Receive stock** (primary), Back.
- Saving: spinner `vendor.purchases.saving`, not dismissible. `clientRef` made on the first Confirm tap (S3 generator) and reused on Try again.

### 4.5 Purchase detail (`/vendor/purchases/:purchaseId`)
- Heading `vendor.purchases.grnTitle` "Stock received GRN-000012" (focus target) + badges (Received/Voided, payment state).
- Meta: supplier (link to profile), received on (+ recorded time when different, P-14), supplier's invoice number, recorded by, note.
- **Items**: qty × name (variant) · unit cost · line total; "Free" tag; "Cost price updated" tag when `costUpdated` (with "from X" for canSeeCost); after a void: "Cost price put back" / "Cost price kept (changed since)".
- **Money**: Total · Paid · **Left to pay** (bold) · Overdue (warning + word).
- **Instalments** card: rows "1 · 15 Dec · TSh 50,000 · Paid / Part paid TSh 20,000 of 50,000 / Due in 5 days / Overdue 3 days" (state in words). **Change instalments** ghost button (when balance > 0).
- **Payments** card: date · method (reference) · amount · by · "Paid at delivery" tag; voided rows struck through + "Voided" word + reason. Each row's overflow: **Void payment** (M2 visibility; online only).
- Money notice.
- **Actions** (sticky): **Record payment** (primary when balance > 0), **Share as text** (secondary; §6), overflow **Void purchase** (danger; M2 visibility; online only).
- Voided: `FFAlert` neutral "Voided by {name}, {time}: {reason}"; no actions except Share.

**Record payment sheet** (`showFFSheet`, title `vendor.purchases.payTitle` "Record payment to {supplier}"):
- Amount (default = the next instalment's open amount; helper "Left to pay {balance}"); **Pay all** ghost.
- Paid on (today default; received date … today).
- Method pills + reference.
- Note.
- Preview (polite live region): `vendor.purchases.payCovers` "Covers instalment 1 (15 Dec) and TSh 20,000 of instalment 2".
- Money notice.
- **Save payment {amount}**. 409 `overpayment` → amount field error with the fresh balance.

**Change instalments sheet:** "Paid so far {paid}"; kept rows shown read-only; editable rows for the rest with the same editor as §4.2; "Must add up to {balance}"; Save.

**Void purchase dialog:**
- Title `vendor.purchases.voidTitle` {number}.
- Body: `vendor.purchases.voidBody` (stock comes back out; GRN stays as voided), plus `vendor.purchases.voidPayments` {n} {amount} when payments exist, plus `vendor.purchases.voidCost` when cost prices changed.
- Reason (3–200, required). **Void purchase** (danger, disabled until reason), Cancel.
- 409 `insufficient_stock` → dialog stays, `FFAlert` error `vendor.purchases.err.voidStock` listing "{name}: received {received}, in stock {available}", plus **Count stock** link per line (needs `products`; S1 sheet, Counted preselected).

**Void payment dialog:** title {amount} {date}; body `vendor.purchases.voidPaymentBody`; reason; **Void payment** (danger). 409 `supplier_required` → `vendor.purchases.err.noSupplierDebt`.

### 4.6 Suppliers list (`/vendor/suppliers`)
- Search field (`vendor.suppliers.search`), filter pills **All · Owe money · Overdue · Archived**, sort menu (Name · Most owed · Recent).
- Rows: name · contact person or phone · "You owe {amount}" (or "Nothing owed") · overdue badge "{n} days overdue". Merged semantics `vendor.suppliers.rowLabel`. Load more.
- **Add supplier** FAB (extended, label always shown).
- Empty: `FFEmptyState` `vendor.suppliers.empty` + Add supplier. Filter empty: `vendor.suppliers.emptyFilter`.

**Supplier form** (page): Name (required), Phone (tel keyboard; helper "e.g. 0712 345 678"), Contact person, Email, Address, TIN (optional), Note. Save. 409 `duplicate_supplier` → name field error + "Open {name}" link.

### 4.7 Supplier profile (`/vendor/suppliers/:supplierId`)
- Header: name (h1, focus target), contact person, phone with **Call** (`tel:`, 48dp, label "Call {name}"), email, address, TIN, note.
- **Owed card**: You owe {owed} · Overdue {overdue}; 5 aging tiles (S4 layout); `As of {date}`.
- **Open instalments**: GRN · due date · open amount · state; tap → purchase.
- **Purchases**: list (as hub rows) with Load more; totals line "Bought {purchasedTzs} in {count} deliveries · paid {paidTzs}".
- Actions: **Receive stock from {name}** (primary), **Edit**, overflow **Archive** / **Restore**. Archive disabled when owed > 0, with helper `vendor.suppliers.archiveOwes` {amount}; the server still enforces it.
- Archived: `FFAlert` neutral "Archived. Restore to receive stock from them."; Receive hidden.

### 4.8 Owed to suppliers (`/vendor/payables`)
Mirror of S4 §10 with supplier wording:
1. Summary tiles: **Total you owe** · **Overdue** · **Suppliers you owe** · **Due in the next 7 days**; `As of {EAT date}`.
2. 5 bucket tiles as filter toggles (`Semantics(selected:)`), **All** pill to clear.
3. Rows (default: most overdue first, then most owed): name · owed · overdue · oldest due date · "{n} days overdue" badge. Tap → supplier profile.
4. Empty: `vendor.payables.empty` "You don't owe any supplier."

### 4.9 Offline and drafts (recommendation, Q-5)
- **Receiving, payments, voids and plan changes are online only.** The receive needs the server's product locks, the GRN number, and the current cost. A provisional GRN in a two-device shop would invite double entries. A delivery can wait a few minutes for a connection, unlike a customer at the till.
- **The draft is kept on the device**: `PurchaseDraftController` saves the receive form to `shared_preferences` (key per vendor and user) on every change, debounced 500 ms. It holds product ids, variants, quantities, costs, supplier id, details and payment choice. It never holds a clientRef that was sent. On open with a draft: `FFAlert` "You have an unfinished delivery from {time}" with **Continue** / **Start again**. The draft is deleted on success, on Discard, and **on sign-out** (it contains cost figures).
- Offline at Review: the button is disabled with helper `vendor.purchases.offline`; the draft stays. A network failure at Confirm keeps the dialog with **Try again** (same clientRef).

### 4.10 States

| State | Behaviour |
|---|---|
| Hub / lists loading | `FFSkeletonList(semanticLabel:)`; owed card skeleton |
| Empty (no purchases yet) | Hub: owed card "Nothing owed", Receive stock, `FFEmptyState` `vendor.purchases.empty` "No deliveries recorded yet." |
| Error | `FFErrorState` + Try again (per card: owed card failure does not hide recent purchases) |
| Offline | Lists: `FFErrorState` `error.network`; Receive: works on the draft, Review disabled (§4.9) |
| Partial | Purchase with some instalments paid: per-row states; voided payments listed struck through |
| Pending-approval vendor | Works (own records); existing pending banner |
| Suspended vendor / staff disabled | Existing banners; write buttons disabled; server 403 |
| Role-restricted | No `purchases`: no segment/nav/tiles; crafted route → first allowed section + snack. M2: Void hidden with muted `vendor.purchases.askOwner` |
| Flag off | Nothing shown; routes go home; stock-history GRN as plain text |
| Saving | Primary spinner; inputs disabled; not dismissible |
| 201 / 200 replay | §3.3 (a replay looks identical to success) |
| 400 field errors | Inline on the field; focus to the first; `duplicate_line` merges the lines on the client before it can happen |
| 404 `product_not_found` / 400 `product_unavailable` | That line gets an error "{name} can't be received any more" + remove button; focus there |
| 409 `supplier_archived` | Supplier chip error + Change; focus there |
| 409 `overpayment` / `schedule_mismatch` | Payment section error with the server's figures |
| 409 `insufficient_stock` (void) | §4.5 |
| 403 `void_not_allowed` | Snack `vendor.purchases.askOwner` |
| 404 `feature_disabled` | Snack `vendor.purchases.unavailable`; back to the vendor home |
| Network / 5xx at save | Dialog stays; `FFAlert` `vendor.purchases.offline` / `err.server`; Try again with the same clientRef; never queued |

---

## 5. Portal

### 5.1 Purchases view (`/vendor/purchases/`)
- Header: title "Purchases", primary **Receive stock** (`data-testid="purchases-receive"`), `Segmented` Purchases · Suppliers · Owed to suppliers.
- Metric row: You owe · Overdue · Due in 7 days · Received this month.
- Filters: date range (EAT), supplier `Select`, status, payment (Open / Overdue / Paid), Mine only; **Export CSV**.
- `Table aria-label="Purchases"`: GRN · Received · Supplier · Items · Total · Paid · Left to pay · Payment (badge) · Recorded by. Rows link to `?id=`. Cards below `md`. Pagination "Load more".

### 5.2 Receive stock page (`/vendor/purchases/receive/`)
Same sections as mobile §4.2 in two columns (≥ `lg`: items 2/3, supplier/details/payment 1/3 sticky), one column below.
- Items table: Item (combobox search name/SKU; variant `Select` when tracked) · Stock now → after · Qty (number + − / +) · Unit cost · Line total · remove (`aria-label` with name). **Add row** button; Enter in the last cost field adds a row.
- Supplier combobox with "Add supplier" option (opens `supplier-form-dialog.tsx`) and "No supplier".
- Payment and instalment editor as mobile; live sum in `aria-live="polite"`.
- **Review** → `ConfirmDialog` with the §4.4 summary → **Receive stock**.
- Leaving with changes: `beforeunload` + in-app confirm. Draft in `localStorage` (same rules as §4.9, cleared on sign-out).

### 5.3 Purchase detail (`?id=`)
Panel with the §4.5 content as `Card`s (Items `Table`, Instalments `Table`, Payments `Table`), actions: Record payment (`Dialog`), Change instalments (`Dialog`), Copy as text, Print (print CSS: hides the shell, shows business name, GRN, supplier, lines, totals, plan, payments, "This is not a TRA fiscal receipt."), Void purchase (`ConfirmDialog` with required `Textarea`). `insufficient_stock` lists lines with links to the product's stock adjust (`adjust-stock-dialog.tsx`, needs `products`).

### 5.4 Suppliers view and profile (`?view=suppliers`, `?supplier=`)
List table: Name · Contact · Phone · You owe · Overdue · Last delivery; search, filters, Add supplier (`Dialog`). Profile: as mobile §4.7 (aging `Stat` row, open instalments `Table`, purchases `Table`), Edit (`Dialog`), Archive / Restore.

### 5.5 Owed to suppliers (`?view=payables`)
S4 `owed-view.tsx` layout: summary `Stat`s, bucket filter chips, table Supplier · Not due yet · 1–30 · 31–60 · 61–90 · 90+ · Total owed · Oldest due, totals footer, sortable headers with `aria-sort`, **Export CSV**.

### 5.6 Portal states
As §4.10, with toasts instead of snacks, `SkeletonTable` for tables, `ErrorState` per card, and the receive page keeping its values on any error. Focus: page load → h1; dialog open → heading; error → first invalid field; Escape closes dialogs when not saving and returns focus to the trigger.

---

## 6. Text share and print (no S5 document; Q-4)
`Share as text` (mobile `share_plus`) / `Copy as text` (portal), ≤ 32 characters per line where possible:
```
{business}
Stock received GRN-000012
From Juma Supplies
Received 3 Nov 2026
Supplier invoice: INV-4471
--------------------
10 x Whey 1kg (Chocolate)
   @ 9,500        95,000
--------------------
Total           TSh 95,000
Paid (Cash)         45,000
Left to pay         50,000
 15 Dec 2026        50,000
--------------------
Not a TRA fiscal receipt.
```
In the chosen language (`Imepokelewa`, `Kutoka`, `Jumla`, `Imelipwa`, `Kiasi kilichobaki`). Never includes previous cost prices, the note or who recorded it.

---

## 7. Accessibility

- **Targets:** mobile ≥ 48dp (steppers, remove, pills, segments, bucket tiles, rows ≥ 56dp, Call, overflow items); portal ≥ 44px (`min-h-11` on buttons, inputs, chips, row actions).
- **Semantics labels (Flutter web tree), every actionable control:**

| Control | Label |
|---|---|
| Receive stock | `vendor.purchases.receive` (+ "from {name}" on the profile) |
| Choose supplier | `vendor.purchases.chooseSupplier`; chosen: "Supplier {name}, change" |
| Add item | `vendor.purchases.addItem` |
| Qty stepper + / − | "One more {name}" / "One fewer {name}"; value "{qty} received" |
| Unit cost field | "Unit cost for {name}, Tanzanian shillings" |
| Remove line | `vendor.purchases.removeLine` {name} |
| Payment segment, method pills | label + selected state, mutually exclusive group |
| Instalment rows | "Instalment {n} due date" / "Instalment {n} amount" |
| Review / Receive / Save payment | include the amount |
| Purchase row | merged `vendor.purchases.rowLabel` "{number}, {supplier}, {date}, {total}, {state}" |
| Supplier row | merged `vendor.suppliers.rowLabel` "{name}, you owe {amount}, {overdue}" |
| Bucket tile | "{bucket}, {amount}, selected / not selected" |
| Void purchase / payment | "Void {number}" / "Void payment of {amount} on {date}" |

- **Live regions:** total and "left to pay" (polite), instalment sum check (polite; assertive when it turns into an error at Review), payment coverage preview (polite), save results (polite), errors (assertive).
- **Focus order:** §4.2, §5.2. After save → GRN heading. After a 409 → the field or line concerned.
- **Contrast** ≥ 4.5:1 light and dark. Overdue uses warning700 on warning50 with the word "Overdue"; Paid/Part paid/Unpaid/Voided always in words. Volt only in dark, never as text on light.
- **Text scale 200%:** line cards stack name / qty / cost / total; two-up tiles stack; the sticky Review grows (never clips); portal tables become cards below `md`.

---

## 8. Strings (EN + SW; every SW string is a DRAFT for native review)

Terms: supplier = **msambazaji** (wasambazaji); receive stock = **Pokea Stock** (Stock stays English); purchase / purchases = **ununuzi**; delivery = **mzigo** in "deliveries" counts (draft; "delivery" stays English only for order delivery, glossary 5a); GRN = **Hati ya kupokea Stock**; unit cost = **bei ya kununua kwa kimoja**; cost price = **bei ya kununua** (S1); instalment = **awamu**; you owe = **unadaiwa** (glossary: "wanaokudai" = people you owe; never "unachodai", which is money owed **to** you); void = **batilisha**; archive = **weka kando**; due date / overdue = **tarehe ya mwisho ya kulipa / imechelewa**. Reused: S3 `vendor.pos.method.*`, `vendor.pos.reference*`, S4 `vendor.aging.*`, `error.network`, `common.*`. Placeholders: `{number} {amount} {name} {supplier} {n} {qty} {units} {date} {time} {from} {to} {received} {available} {sum} {left} {balance} {reason} {business}`.

### 8.1 Navigation, permission, hub
| Key | EN | SW (draft) |
|---|---|---|
| vendor.permission.purchases | Suppliers and stock in | Wasambazaji na kupokea Stock |
| vendor.permission.purchasesHint | Suppliers, receiving stock, cost prices from deliveries and what you owe | Wasambazaji, kupokea Stock, bei za kununua na madeni yako |
| vendor.nav.purchases / vendor.purchases.tab | Purchases | Ununuzi |
| vendor.purchases.segProducts / segPurchases | Products / Purchases | Bidhaa / Ununuzi |
| vendor.purchases.receive | Receive stock | Pokea Stock |
| vendor.purchases.receiveFrom | Receive stock from {name} | Pokea Stock kutoka kwa {name} |
| vendor.purchases.recent | Recent deliveries | Mizigo ya karibuni |
| vendor.purchases.empty | No deliveries recorded yet. | Bado hujarekodi mzigo wowote. |
| vendor.purchases.noAccess | You don't have access to purchases. Ask the owner. | Huna ruhusa ya ununuzi. Muulize mmiliki. |
| vendor.purchases.unavailable | Purchases aren't available right now. | Ununuzi haupatikani kwa sasa. |
| vendor.purchases.rowLabel | {number}, {supplier}, {date}, {amount}, {state} | {number}, {supplier}, {date}, {amount}, {state} |
| vendor.purchases.noSupplier | No supplier | Hakuna msambazaji |
| vendor.payables.youOwe | You owe suppliers | Unadaiwa na wasambazaji |
| vendor.payables.title | Owed to suppliers | Madeni kwa wasambazaji |
| vendor.payables.dueSoon | Due in the next 7 days | Yanadaiwa ndani ya siku 7 |
| vendor.payables.nothingOwed | Nothing owed | Hakuna deni |
| vendor.payables.empty | You don't owe any supplier. | Hudaiwi na msambazaji yeyote. |
| vendor.payables.suppliersYouOwe | Suppliers you owe | Wasambazaji wanaokudai |
| vendor.payables.total | Total you owe | Jumla unayodaiwa |

### 8.2 Receive stock
| Key | EN | SW (draft) |
|---|---|---|
| vendor.purchases.close | Close receive stock | Funga kupokea Stock |
| vendor.purchases.supplier | Supplier | Msambazaji |
| vendor.purchases.chooseSupplier | Choose supplier | Chagua msambazaji |
| vendor.purchases.noSupplierHelp | Only if you paid in full | Pale tu ulipolipa yote |
| vendor.purchases.alreadyOwe | You already owe {amount} | Tayari unadaiwa {amount} |
| vendor.purchases.items | What came in? | Nini kimeingia? |
| vendor.purchases.addItem | Add item | Ongeza bidhaa |
| vendor.purchases.noItems | Add the items in this delivery. | Ongeza bidhaa zilizo kwenye mzigo huu. |
| vendor.purchases.added | Added | Imeongezwa |
| vendor.purchases.qty | Quantity received | Idadi iliyopokelewa |
| vendor.purchases.unitCost | Unit cost | Bei ya kununua kwa kimoja |
| vendor.purchases.lineTotal | Line total | Jumla ya mstari |
| vendor.purchases.stockChange | Stock {from} → {to} | Stock {from} → {to} |
| vendor.purchases.lastCost | Last time: {amount} from {supplier}, {date} | Mara ya mwisho: {amount} kutoka kwa {supplier}, {date} |
| vendor.purchases.freeLine | Free: cost price stays as it is. | Bure: bei ya kununua haibadiliki. |
| vendor.purchases.costWillChange | Cost price will change from {from} to {to}. | Bei ya kununua itabadilika kutoka {from} kuwa {to}. |
| vendor.purchases.costWillBeSet | Cost price will be set to {to}. | Bei ya kununua itawekwa {to}. |
| vendor.purchases.removeLine | Remove {name} | Ondoa {name} |
| vendor.purchases.details | Details | Maelezo |
| vendor.purchases.receivedOn | Received on | Imepokelewa tarehe |
| vendor.purchases.invoiceRef | Supplier's invoice number (optional) | Namba ya ankara ya msambazaji (si lazima) |
| vendor.purchases.note | Note (optional) | Maelezo (si lazima) |
| vendor.purchases.payment | Payment | Malipo |
| vendor.purchases.total | Total | Jumla |
| vendor.purchases.paidFull / paidPart / notPaid | Paid in full / Paid part / Not paid yet | Imelipwa yote / Imelipwa sehemu / Bado haijalipwa |
| vendor.purchases.paidNow | Amount paid now | Kiasi kilicholipwa sasa |
| vendor.purchases.leftToPay | Left to pay {amount} | Kiasi kilichobaki {amount} |
| vendor.purchases.payBy | Pay by | Lipa kabla ya |
| vendor.purchases.split | Split into instalments | Gawa kwa awamu |
| vendor.purchases.instalmentCount | Number of instalments | Idadi ya awamu |
| vendor.purchases.every | Every | Kila |
| vendor.purchases.every2w / everyMonth | 2 weeks / Month | Wiki 2 / Mwezi |
| vendor.purchases.splitEvenly | Split evenly | Gawa sawa |
| vendor.purchases.instalmentN | Instalment {n} | Awamu ya {n} |
| vendor.purchases.sumCheck | Instalments add up to {sum} of {left} | Awamu zinafikia {sum} kati ya {left} |
| vendor.purchases.sumWrong | Instalments must add up to {left}. | Awamu lazima zifikie {left}. |
| vendor.purchases.moneyNotice | FitFlex does not pay suppliers. This only records what you paid and what you still owe. | FitFlex hailipi wasambazaji. Hapa unarekodi tu ulicholipa na unachodaiwa bado. |
| vendor.purchases.review | Review {amount} | Kagua {amount} |
| vendor.purchases.needSupplier | Choose a supplier, or mark it paid in full. | Chagua msambazaji, au weka imelipwa yote. |
| vendor.purchases.needItem | Add at least one item. | Ongeza angalau bidhaa moja. |
| vendor.purchases.draftSaved | Draft saved on this device | Rasimu imehifadhiwa kwenye kifaa hiki |
| vendor.purchases.draftFound | You have an unfinished delivery from {time}. | Una mzigo ambao haujamaliza kuurekodi tangu {time}. |
| vendor.purchases.continue / startAgain | Continue / Start again | Endelea / Anza upya |
| vendor.purchases.leaveTitle | Leave this delivery? | Uache mzigo huu? |
| vendor.purchases.keepDraft / discard | Keep draft / Discard | Hifadhi rasimu / Futa |
| vendor.purchases.adjustHint | Bought from a supplier? Use Receive stock to record the cost and what you owe. | Umenunua kutoka kwa msambazaji? Tumia Pokea Stock kurekodi bei na unachodaiwa. |

### 8.3 Confirm, detail, payments
| Key | EN | SW (draft) |
|---|---|---|
| vendor.purchases.confirmTitle | Receive {units} items from {supplier}? | Upokee bidhaa {units} kutoka kwa {supplier}? |
| vendor.purchases.confirmTitleNoSupplier | Receive {units} items? | Upokee bidhaa {units}? |
| vendor.purchases.costChanges | Cost price changes for {n} items | Bei ya kununua inabadilika kwa bidhaa {n} |
| vendor.purchases.confirm | Receive stock | Pokea Stock |
| vendor.purchases.saving | Saving delivery | Inahifadhi mzigo |
| vendor.purchases.saved | Stock received: {number} | Stock imepokelewa: {number} |
| vendor.purchases.grnTitle | Stock received {number} | Hati ya kupokea Stock {number} |
| vendor.purchases.recordedAt | Recorded {time} | Imerekodiwa {time} |
| vendor.purchases.recordedBy | Recorded by {name} | Imerekodiwa na {name} |
| vendor.purchases.state.paid / part_paid / unpaid / overdue | Paid / Part paid / Unpaid / Overdue | Imelipwa / Imelipwa sehemu / Haijalipwa / Imechelewa |
| vendor.purchases.state.received / voided | Received / Voided | Imepokelewa / Imebatilishwa |
| vendor.purchases.free | Free | Bure |
| vendor.purchases.costUpdated | Cost price updated | Bei ya kununua imesasishwa |
| vendor.purchases.costUpdatedFrom | Cost price updated (was {from}) | Bei ya kununua imesasishwa (ilikuwa {from}) |
| vendor.purchases.costRestored / costKept | Cost price put back / Cost price kept (changed since) | Bei ya kununua imerudishwa / Bei ya kununua imebaki (ilibadilishwa baadaye) |
| vendor.purchases.paid | Paid | Imelipwa |
| vendor.purchases.overdueAmount | Overdue {amount} | Imechelewa {amount} |
| vendor.purchases.instalments | Instalments | Awamu |
| vendor.purchases.inst.paid | Paid | Imelipwa |
| vendor.purchases.inst.part | {covered} of {amount} paid | {covered} kati ya {amount} imelipwa |
| vendor.purchases.inst.dueIn | Due in {n} days | Inadaiwa baada ya siku {n} |
| vendor.purchases.inst.dueToday | Due today | Inadaiwa leo |
| vendor.purchases.inst.overdue | Overdue {n} days | Imechelewa siku {n} |
| vendor.purchases.changePlan | Change instalments | Badilisha awamu |
| vendor.purchases.paidSoFar | Paid so far {amount} | Imelipwa hadi sasa {amount} |
| vendor.purchases.mustAddUp | Must add up to {balance} | Lazima zifikie {balance} |
| vendor.purchases.planSaved | Instalments updated | Awamu zimesasishwa |
| vendor.purchases.payments | Payments | Malipo |
| vendor.purchases.atDelivery | Paid at delivery | Imelipwa wakati wa kupokea |
| vendor.purchases.recordPayment | Record payment | Rekodi malipo |
| vendor.purchases.payTitle | Record payment to {supplier} | Rekodi malipo kwa {supplier} |
| vendor.purchases.payAll | Pay all {amount} | Lipa yote {amount} |
| vendor.purchases.paidOn | Paid on | Imelipwa tarehe |
| vendor.purchases.payCovers | Covers {list} | Inalipa {list} |
| vendor.purchases.payCoversPart | {amount} of instalment {n} | {amount} ya awamu ya {n} |
| vendor.purchases.savePayment | Save payment {amount} | Hifadhi malipo {amount} |
| vendor.purchases.paySaved | Payment saved: {amount} | Malipo yamehifadhiwa: {amount} |
| vendor.purchases.shareText | Share as text | Tuma kama maandishi |
| vendor.purchases.copyText | Copy as text | Nakili kama maandishi |
| vendor.purchases.print | Print | Chapisha |

### 8.4 Voids
| Key | EN | SW (draft) |
|---|---|---|
| vendor.purchases.void | Void purchase | Batilisha ununuzi |
| vendor.purchases.voidTitle | Void {number}? | Ubatilishe {number}? |
| vendor.purchases.voidBody | The items come back out of stock. {number} stays in your records as voided. | Bidhaa zitatolewa kwenye Stock. {number} itabaki kwenye kumbukumbu zako kama imebatilishwa. |
| vendor.purchases.voidPayments | The {n} payments recorded on it ({amount}) are voided too. Get any money back from the supplier yourself. | Malipo {n} yaliyorekodiwa ({amount}) yatabatilishwa pia. Dai pesa yako kutoka kwa msambazaji wewe mwenyewe. |
| vendor.purchases.voidCost | Cost prices this delivery set go back to what they were, unless they changed since. | Bei za kununua zilizowekwa na mzigo huu zitarudi kama zilivyokuwa, isipokuwa kama zilibadilishwa baadaye. |
| vendor.purchases.voidReason | Reason (required) | Sababu (lazima) |
| vendor.purchases.voided | {number} voided | {number} imebatilishwa |
| vendor.purchases.voidedBy | Voided by {name}, {time}: {reason} | Imebatilishwa na {name}, {time}: {reason} |
| vendor.purchases.voidPayment | Void payment | Batilisha malipo |
| vendor.purchases.voidPaymentTitle | Void payment of {amount} on {date}? | Ubatilishe malipo ya {amount} ya {date}? |
| vendor.purchases.voidPaymentBody | The amount is owed again. Instalments it paid show as due again. | Kiasi hiki kitadaiwa tena. Awamu zilizolipwa nacho zitaonekana zinadaiwa tena. |
| vendor.purchases.askOwner | Only the owner or an admin can void this. | Mmiliki au admin pekee anaweza kubatilisha hii. |

### 8.5 Suppliers
| Key | EN | SW (draft) |
|---|---|---|
| vendor.suppliers.title | Suppliers | Wasambazaji |
| vendor.suppliers.add | Add supplier | Ongeza msambazaji |
| vendor.suppliers.search | Search suppliers | Tafuta wasambazaji |
| vendor.suppliers.filter.all / owing / overdue / archived | All / Owe money / Overdue / Archived | Wote / Unaodaiwa nao / Waliochelewa / Waliowekwa kando |
| vendor.suppliers.sort.name / owed / recent | Name A–Z / Most owed / Recent | Jina A–Z / Deni kubwa zaidi / Wa karibuni |
| vendor.suppliers.rowLabel | {name}, you owe {amount}, {overdue} | {name}, unadaiwa {amount}, {overdue} |
| vendor.suppliers.youOwe | You owe {amount} | Unadaiwa {amount} |
| vendor.suppliers.empty | No suppliers yet. Add the people you buy stock from. | Bado hakuna wasambazaji. Ongeza watu unaonunua Stock kutoka kwao. |
| vendor.suppliers.emptyFilter | No suppliers match. | Hakuna msambazaji anayelingana. |
| vendor.suppliers.name | Business or person name | Jina la biashara au mtu |
| vendor.suppliers.phone | Phone number (optional) | Namba ya simu (si lazima) |
| vendor.suppliers.contactPerson | Contact person (optional) | Mtu wa kuwasiliana naye (si lazima) |
| vendor.suppliers.email | Email (optional) | Barua pepe (si lazima) |
| vendor.suppliers.address | Address (optional) | Anwani (si lazima) |
| vendor.suppliers.tin | TIN (optional) | TIN (si lazima) |
| vendor.suppliers.note | Note (optional) | Maelezo (si lazima) |
| vendor.suppliers.saved | Supplier saved | Msambazaji amehifadhiwa |
| vendor.suppliers.call | Call {name} | Mpigie {name} |
| vendor.suppliers.bought | Bought {amount} in {n} deliveries · paid {paid} | Umenunua {amount} kwa mizigo {n} · umelipa {paid} |
| vendor.suppliers.archive / restore | Archive / Restore | Weka kando / Rudisha |
| vendor.suppliers.archiveOwes | You still owe {amount}, so they can't be archived. | Bado unadaiwa {amount}, kwa hiyo hawezi kuwekwa kando. |
| vendor.suppliers.archived | Archived. Restore to receive stock from them. | Amewekwa kando. Mrudishe ili upokee Stock kutoka kwake. |
| vendor.suppliers.openInstalments | Still to pay | Bado kulipa |

### 8.6 Errors
| Key | EN | SW (draft) |
|---|---|---|
| vendor.purchases.offline | Receiving stock needs an internet connection. Your draft is kept. | Kupokea Stock kunahitaji intaneti. Rasimu yako imehifadhiwa. |
| vendor.purchases.err.server | Could not save. Nothing was changed. | Imeshindikana kuhifadhi. Hakuna kilichobadilishwa. |
| vendor.purchases.err.productGone | {name} can't be received any more. Remove it. | {name} haiwezi kupokelewa tena. Iondoe. |
| vendor.purchases.err.supplierArchived | {name} is archived. Choose another supplier or restore them. | {name} amewekwa kando. Chagua msambazaji mwingine au mrudishe. |
| vendor.purchases.err.overpayment | That is more than is owed ({amount}). | Hicho ni zaidi ya kinachodaiwa ({amount}). |
| vendor.purchases.err.overTotal | You can't pay more than the total ({amount}). | Huwezi kulipa zaidi ya jumla ({amount}). |
| vendor.purchases.err.nothingOwed | Nothing is owed on this delivery. | Hakuna deni kwenye mzigo huu. |
| vendor.purchases.err.voidStock | Some items are no longer in stock, so this can't be voided: {list}. Count the stock first. | Baadhi ya bidhaa hazipo tena kwenye Stock, kwa hiyo haiwezi kubatilishwa: {list}. Hesabu Stock kwanza. |
| vendor.purchases.err.voidStockLine | {name}: received {received}, in stock {available} | {name}: zilipokelewa {received}, zipo {available} |
| vendor.purchases.err.alreadyVoided | This was already voided. | Hii ilishabatilishwa. |
| vendor.purchases.err.noSupplierDebt | This delivery has no supplier, so it can't be left owing. Void the whole delivery instead. | Mzigo huu hauna msambazaji, kwa hiyo hauwezi kuachwa na deni. Batilisha mzigo wote badala yake. |
| vendor.purchases.err.duplicateSupplier | You already have a supplier called {name}. | Tayari una msambazaji anayeitwa {name}. |
| vendor.purchases.err.dateRange | Choose a date between {earliest} and {latest}. | Chagua tarehe kati ya {earliest} na {latest}. |
| vendor.purchases.notFound | This delivery is not available. | Mzigo huu haupatikani. |

Error-code → message: `product_not_found` / `product_unavailable` → err.productGone; `supplier_archived` → err.supplierArchived; `supplier_required` → needSupplier (receive) / err.noSupplierDebt (payment void); `overpayment` → err.overTotal (receive) / err.overpayment; `nothing_owed` → err.nothingOwed; `insufficient_stock` → err.voidStock; `already_voided` → err.alreadyVoided; `duplicate_supplier` → err.duplicateSupplier; `*_out_of_range` → err.dateRange; `schedule_mismatch` → sumWrong; `reference_required` → `vendor.pos.referenceRequired`; `void_not_allowed` → askOwner; `supplier_has_balance` → suppliers.archiveOwes; `feature_disabled` → unavailable; `*_not_found` → notFound; anything else → err.server. The raw code is never shown.

### 8.7 Stock, reports
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.reason.stock_in | Received from supplier | Imepokelewa kutoka kwa msambazaji |
| vendor.stock.reason.stock_in_void | Delivery voided, out of stock again | Mzigo umebatilishwa, imetolewa kwenye Stock |
| vendor.stock.grn | Delivery {number} | Mzigo {number} |
| vendor.reports.methods.paidToSuppliers | Paid to suppliers (by you) | Uliyowalipa wasambazaji (wewe) |
| vendor.dash.owedToSuppliers | Owed to suppliers {amount} · due in 7 days {due} | Madeni kwa wasambazaji {amount} · yanadaiwa ndani ya siku 7 {due} |

CSV headers (purchases, payables) in the chosen language with "(TZS)", S6 rules.

### 8.8 Push (server, both languages; `partner-notifier.mjs`)
| Type | EN title / body | SW title / body (draft) |
|---|---|---|
| vendor_purchase_voided | Delivery {number} voided / {who} voided delivery {number} ({amount}). Reason: {reason} | Mzigo {number} umebatilishwa / {who} amebatilisha mzigo {number} ({amount}). Sababu: {reason} |
| vendor_purchase_payment_voided | Supplier payment voided / {who} voided a payment of {amount} on {number}. Reason: {reason} | Malipo kwa msambazaji yamebatilishwa / {who} amebatilisha malipo ya {amount} kwenye {number}. Sababu: {reason} |
`{who}` falls back to "A staff member" / "Mfanyakazi".

### 8.9 Swahili overflow
- Longest SW: `voidPayments` (~120), `err.noSupplierDebt` (~110), `moneyNotice` (~85), `adjustHint` (~95). All are in `FFAlert`/dialog bodies and wrap.
- Buttons: "Pokea Stock" (11) fits everywhere. "Pokea Stock kutoka kwa {name}" wraps to 2 lines on the profile (full width). "Batilisha ununuzi" (17) and "Rekodi malipo" (13) stack under 120dp each (S3 rule). "Hifadhi malipo TSh 1,250,000" (28) is full width and wraps at 200%.
- Segment "Bado haijalipwa" (15) in a 3-way `FFSegmented` at 375: segments wrap to 2 lines (`maxLines: 2`), never truncate. If any segment would be < 96dp, it switches to a vertical `FFPill` group.
- Tab label "Ununuzi" (7) fits. Permission label "Wasambazaji na kupokea Stock" (28) wraps in the staff form.
- Portal aging header "Madeni kwa wasambazaji" wraps; column min width 96px.
- Badge "Imelipwa sehemu" (15) needs `min-width: auto`.

---

## 9. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `/vendor/tools/options`, `/vendor/me.tools` | `purchases` | **exists**; meaning changes to include `VENDOR_STOCK_LEDGER` (**requested, call out**); mobile `VendorTools.purchases` + portal typed field **to add** |
| `STAFF_PERMISSIONS`, `vendorMe.permissions`, staff form | `purchases` | **to add** + backfill (admin) |
| `VendorSupplier`, `VendorPurchase`, `VendorPurchaseLine`, `VendorPurchaseInstalment` | §2.1 | plan; **columns requested** (`receivedOn`, `supplierInvoiceRef`, `balanceTzs`, `fingerprint`, void fields, line cost-restore fields; instalment `status/replaced*`) |
| `VendorPurchasePayment` | §2.1 | **new table, requested** (plan put payment fields on the instalment; Q-3) |
| `ProductPrivate` | `costSourceId`, `costUpdatedAt` | **requested** (P-6) |
| Suppliers routes | §2.2 | plan has GET/POST/PUT; **profile shape, filters, archive via PUT, errors requested** |
| `POST /vendor/purchases` | §2.3–2.4 | plan; **body, response, error set requested** |
| `POST /vendor/purchases/:id/void` | §2.5 | plan; **response + errors requested** |
| Payments + plan | `POST …/payments`, `POST …/payments/:pid/void`, `PUT …/instalments` | **replace** the plan's `POST …/instalments` and `…/instalments/:iid/pay` (Q-3) |
| `GET /vendor/purchases`, `/:id`, `/last-costs` | §2.7 | **new, requested** |
| `GET /vendor/payables/aging` | §2.9 | plan; **shape requested** |
| `GET /vendor/products` | accepts `purchases` | **changed guard (call out)** |
| Stock movements | `document {type:'purchase', id, number}` | **requested** |
| Reports | `paymentMethods.paidToSuppliers` | **requested** |
| Notifications | `vendor_purchase_voided`, `vendor_purchase_payment_voided` | **new** |
| Audit | §2.10 | **new** |
| Settlement | none (spec proves unchanged) | — |

---

## 10. Rule-6 callouts (CLAUDE.md; each PR must list these explicitly)
1. **Money records:** new payables tables (`VendorPurchase`, `VendorPurchaseInstalment`, `VendorPurchasePayment`), with balance CHECKs. FitFlex moves no money.
2. **Cost price writes:** stock-in changes `ProductPrivate.costTzs` (O-9) and restores it on void (P-6); new `costSourceId`. This affects S6 stock value at cost and the cost snapshots of later sales and paid orders. It does not touch selling prices, commission or any pricing constant.
3. **Endpoint signatures:** all new purchase/supplier/payables routes; **changed** `GET /vendor/products` guard (+`purchases`); changed meaning of `tools.purchases` (needs the ledger flag); additive `document` on stock movements; additive `paidToSuppliers` on the S6 payment-methods report; the plan's instalment routes replaced (Q-3).
4. **Auth-adjacent:** new staff permission `purchases` in `STAFF_PERMISSIONS`, backfilled onto admin staff, memberships and pending invitations; new `requirePurchasesPermission` guard. `src/auth/*` itself is not changed.
5. **Stock logic:** new movements through the shared product rows (conditional decrement on void), with the S3/S7 lock order.
6. **Not touched:** payout engine, settlement, commission, marketplace orders, checkout, pricing constants. A spec proves settlement output is unchanged.
7. Reviews: security-and-privacy-reviewer (permission and backfill, cost visibility Q-1, money records, supplier personal data), contract-checker (shapes, deploy order functions → portal → mobile), i18n-swahili-auditor.

---

## Open questions — owner accepted every recommendation on 2026-11-04

- **Q-1 Who sees purchase costs.** Receiving stock means typing unit costs, and by O-9 the last unit cost **is** the cost price. Rec: `purchases` lets staff see costs on purchase records and the last purchase cost per product (they need them to fill in a delivery), but `canSeeCost` stays as it is (owner and admin staff). So staff with `purchases` only still don't see profit, stock value at cost, or the "from" figure when the cost price changes. Alt: make `purchases` imply `canSeeCost` (simpler, wider exposure).
- **Q-2 Backfill scope.** Rec: as the plan says, add `purchases` to `vendorRole=admin` staff only (plus their memberships and pending invitations). `inventory_manager` staff get it only when the owner ticks it, because it carries money records and costs. Alt: also backfill `inventory_manager`.
- **Q-3 Payments as their own records.** Rec: replace the plan's `instalments/:iid/pay` with purchase-level payments (`VendorPurchasePayment`) applied oldest due first, and an instalment plan that is only a schedule (§1 P-5, P-9 to P-11). One payment can cover several instalments, can be voided as one record, and the plan can be changed without touching money rows. Supplier-level payments covering several deliveries at once (S4-style allocations) are not in v1; ask after vendors use it.
- **Q-4 GRN document.** Rec: no S5 document, share link or PDF for GRNs in v1. A goods received note is an internal record, not something handed to a customer, so plain-text share and browser print (§6) cover it. Supplier payments get no number series (O-6 lists none). Add a GRN to S5's renderer later if vendors ask.
- **Q-5 Offline receiving.** Rec: online only, with the form kept as a local draft (§4.9). Alt: queue deliveries like S3 sales. That needs provisional GRN numbers and offline cost conflicts, and it is not worth it for a step that can wait for a connection.
- **Q-6 Returns to the supplier and partial voids.** Rec: not in v1. A wrong delivery is voided whole (if the stock is still there) and received again. Damaged items found later go through the S1 adjustment (Damaged). A "Return to supplier" record that reduces what you owe can follow if vendors ask.
- **Q-7 Due-date reminders.** Rec: no push in v1. The hub, the dashboard tile and Owed to suppliers show what is overdue and due in 7 days. Add a daily digest (S4 `vendor_customers_overdue` pattern) later if asked.

---

## 11. Acceptance criteria (UAT on Flutter web and portal from RC; isolated backend and DB)

Seed accounts and data:
- Vendor owner; staff `vendorRole=admin` (backfilled with `purchases`); staff `inventory_manager` with `purchases` + `products`; staff with `purchases` only; staff with `products` only; staff with `reports` only.
- Products: one plain product with cost TSh 9,000 and reorder level 5 (stock 3); one with tracked variants (S/M/L); one without a cost; one archived; one later deleted.
- Suppliers: "Juma Supplies" (phone), "Kariakoo Traders"; one archived supplier.
- Flags on: `VENDOR_TOOLS`, `VENDOR_STOCK_LEDGER`, `VENDOR_PURCHASES` (+ `VENDOR_WALKIN_SALES`, `VENDOR_REPORTS` for the report checks).

Gating and permissions
- **AC-1** With `VENDOR_PURCHASES` off, or `VENDOR_STOCK_LEDGER` off, or options failing: no Purchases segment, nav item, tile or Receive stock anywhere. `/vendor/purchases/*`, `/vendor/suppliers*` and `/vendor/payables` go to the vendor home with no message. Every S9 endpoint answers 404 `feature_disabled`. `tools.purchases` is false when the ledger flag is off.
- **AC-2** After turning the flag off with purchases recorded: stock and cost prices stay as received; stock history still says "Received from supplier" with "Delivery GRN-…" as plain text; turning it on again shows every record unchanged.
- **AC-3** After migration, admin staff and the owner have `purchases`; the staff form lists "Suppliers and stock in" (EN) / "Wasambazaji na kupokea Stock" (SW); a new admin staff member gets it automatically; other roles only when ticked. Migration down refuses while purchases exist.
- **AC-4** Staff with `purchases` only: tab 0 reads "Purchases" with no Products view; they can receive stock and pick products, but no cost price, profit or stock value at cost appears anywhere, and "Cost price will be set to TSh X" (without "from") shows on lines. The `/vendor/products` JSON for them has no `costTzs`.
- **AC-5** Staff without `purchases`: no purchase UI; the API answers 403 `vendor_permission_forbidden {requiredPermission: purchases}`. Vendor B cannot read or change vendor A's supplier, purchase or payment (404).

Suppliers
- **AC-6** Add, edit and search suppliers (name, phone, contact person). A second active "juma supplies" returns 409 `duplicate_supplier` with an "Open Juma Supplies" link.
- **AC-7** Archiving a supplier who is owed money is disabled with "You still owe {amount}…" and the API returns 409 `supplier_has_balance`. Once paid up, archive works. The archived supplier disappears from the picker and shows the archived banner; restore works.

Receive stock
- **AC-8** Receive 10 of the plain product at TSh 9,500 from Juma Supplies, paid in full by cash: GRN-000001 is created; stock 3 → 13 with one "Received from supplier" ledger row linked to the GRN; the cost price becomes 9,500 (owner sees "from TSh 9,000"); the low-stock badge clears; the purchase shows Paid.
- **AC-9** A tracked-variant product requires a variant. Receiving 4 M raises M's stock and the product's total by 4, and writes M's own cost price (product-level cost unchanged).
- **AC-10** A free line (unit cost 0) adds stock but leaves the cost price unchanged and shows "Free". A line at the same cost as now shows no cost change.
- **AC-11** Adding the same product twice merges into one line on the client. A crafted request with two lines for it returns 400 `duplicate_line`. Archived products return `product_unavailable`, and a deleted product returns `product_not_found` with the line highlighted.
- **AC-12** Without a supplier, Review stays disabled unless Paid in full is chosen ("Choose a supplier, or mark it paid in full."). The API returns 400 `supplier_required` for a balance without a supplier.
- **AC-13** Received on accepts today back to 30 days. A future date or an older one returns `received_on_out_of_range`. When it differs from today, the detail shows both received and recorded dates.
- **AC-14** Retrying a confirmed receive after a dropped response (same clientRef) records exactly one GRN, one stock increase and one ledger row per line. A different body with the same clientRef returns 409 `client_ref_reused`.
- **AC-15** GRN numbers run GRN-000001, -000002… per vendor with no gaps, including two staff receiving at once and a receive refused part-way. Another vendor starts at GRN-000001. A void keeps the number.

Payments and instalments
- **AC-16** Total TSh 200,000, paid part TSh 50,000 by M-Pesa (reference required), left 150,000 split into 3 monthly instalments with Split evenly (50,000 each). Instalments not adding up keep Review disabled with "Instalments must add up to {left}." Paying more than the total at receipt returns `overpayment`.
- **AC-17** Record a payment of 70,000: the preview says "Covers instalment 2 (…) and TSh 20,000 of instalment 3"; afterwards instalment 2 is Paid, instalment 3 is "20,000 of 50,000 paid", left to pay is 80,000. Paying more than 80,000 returns 409 `overpayment {balanceTzs: 80000}`; paying after it reaches 0 returns `nothing_owed`.
- **AC-18** Voiding the 70,000 payment brings left to pay back to 150,000 and instalments 2–3 back to due (overdue if past their dates). The payment stays listed as Voided with who, when and why.
- **AC-19** Change instalments with 50,000 paid: paid instalments stay read-only; the new rows must add up to 150,000; replaced rows are kept for history (audit row written).
- **AC-20** Two sessions record payments on the same purchase at once: the server serialises them; the second gets `overpayment` with the fresh balance when it no longer fits; nothing is double-counted.
- **AC-21** The money notice "FitFlex does not pay suppliers…" shows on Receive stock, Record payment and the purchase detail (mobile and portal). No PaymentRequest or settlement row is created (server spec).

Void
- **AC-22** Voiding the AC-8 purchase while all 10 units are still in stock: stock drops by 10 with one "Delivery voided" ledger row; the cost price goes back to TSh 9,000 ("Cost price put back"); its cash payment is voided with it; the GRN shows Voided with the reason; it no longer counts as owed.
- **AC-23** Sell 9 of the received units first, then void: 409 `insufficient_stock` lists "{name}: received 10, in stock 4" with a Count stock link (for users with `products`). Nothing changes.
- **AC-24** Receive at 9,500 (A), then at 9,800 (B), then void A: the cost price stays 9,800 ("Cost price kept (changed since)"). A manual cost edit after a receive also keeps the manual cost on void.
- **AC-25** Staff with `purchases` (not admin) can void their own purchase or payment on the day they recorded it, and not others' or older ones (403 `void_not_allowed` with `not_own` / `too_old`; the button is hidden with "Only the owner or an admin can void this."). A staff void sends the owner `vendor_purchase_voided` / `vendor_purchase_payment_voided` in their language (server spec; push needs a real device).
- **AC-26** Void and a POS sale racing for the same units: one wins; stock never goes negative; the loser gets its `insufficient_stock` message.

Aging and reports
- **AC-27** Owed to suppliers: totals equal the sum of rows; bucket tiles filter; an instalment due today is "Not due yet", one due yesterday is in 1–30 (EAT, checked at 23:59 EAT and 21:30 UTC); default order is most overdue first; CSV export matches the table.
- **AC-28** The supplier profile shows owed, overdue, the five buckets, open instalments and purchases; "Bought {amount} in {n} deliveries · paid {paid}" excludes voided purchases.
- **AC-29** S6 stock value at cost uses the new cost price right after a receive, and the "no cost price" count drops when a purchase fills a missing cost. Profit for sales made before the receive is unchanged, while a sale after it carries the new unit cost.
- **AC-30** S6 Payment methods shows "Paid to suppliers (by you)" by method, equal to the recorded supplier payments by paid date (voided ones excluded), only for users with `reports` and `purchases`. It is never added to money received.
- **AC-31** Vendor settlement, App sales after commission and `/vendor/payments` are identical before and after any purchase, payment or void (server spec).

States, layout, offline
- **AC-32** Receive stock keeps a draft. After closing the app (or reload on web), reopening offers "You have an unfinished delivery…" with Continue / Start again. The draft is gone after success, Discard or sign-out.
- **AC-33** With the network off, Review is disabled with "Receiving stock needs an internet connection. Your draft is kept." Losing the connection at Confirm keeps the dialog with Try again. Nothing is queued.
- **AC-34** Every screen shows its loading, empty, error, offline, partial and role-restricted states as §4.10 / §5.6 (hub, lists, receive, detail, sheets, supplier profile, owed).
- **AC-35** At 375px the receive screen, purchase detail, pay sheet, supplier profile and owed list have no horizontal scroll, and the sticky Review button is always visible. At ≥900 (Flutter web) receive shows two columns with an items table. The portal receive page works at 375 and at desktop width.

Accessibility and language
- **AC-36** Every actionable control in §7 has a screen-reader label in the Flutter web tree / DOM, including steppers with name and value, cost fields with the product name, segments and pills with selected state, and rows with merged labels. Total, left-to-pay, instalment sum and coverage preview are announced politely; errors assertively.
- **AC-37** Touch targets ≥48dp mobile and ≥44px portal; contrast ≥4.5:1 light and dark; Paid / Part paid / Unpaid / Overdue / Voided always in words.
- **AC-38** Focus: dialog/sheet open → heading; error → first invalid field or line; save → GRN heading; Escape closes portal dialogs (not while saving) and returns focus to the trigger.
- **AC-39** In Kiswahili at 375px and 200% text: no clipped text on any S9 screen, segment, badge, tile or dialog; "you owe" reads "Unadaiwa"; no English except "Stock", "TIN", "TZS", "GRN" inside numbers, method brand names, product and supplier names and user-entered text.

Needs a real device (not verifiable on Flutter web): push delivery of the two notifications; the Android share sheet with the text GRN; network loss on a real phone during Confirm; draft persistence after the OS kills the app.

---

## 12. Tests

**Functions** `specs/vendor-purchases.specs.mjs` (isolated CI DB, `FITFLEX_USE_CI_DB=1`, check the DB name before running):
- **Gating and access:** each route 404 with any of the three flags off; `tools.purchases` needs the ledger flag; 403 without `purchases`; suspended vendor 403; tenancy (vendor B 404 on supplier, purchase, payment, aging rows); `GET /vendor/products` with `purchases` only (read, no cost fields).
- **Migration:** backfill counts (admin users, memberships, pending invitations), idempotent re-run, down refuses with purchases present.
- **Suppliers:** validation codes, duplicate name (active only), archive refused with balance, restore, search.
- **Receive:** every 400/404/409 code; totals exact; one ledger row per line; variant stock + product sum (O-1); archived/deleted products; supplier rules P-3; receivedOn range.
- **Cost (P-6):** set, equal (no change), free line no change, variant own row, `costSourceId` written; void restores when untouched, keeps after a later receive or a manual form edit; later sale snapshots the new cost; paid app order `ShopOrderLineCost` uses it.
- **Payments and plan:** P-4 at receipt; schedule sums; FIFO coverage maths, including the partial instalment; overpayment, nothing_owed; payment void reopens the earliest; supplierless payment void → `supplier_required`; plan change keeps covered rows, splits the partial one; DB CHECKs refuse a forced inconsistent balance.
- **Void:** full reversal once; `insufficient_stock` lists every short line and changes nothing; payments voided with it; M2 rule (own/same day, admin any); `already_voided`.
- **Concurrency:** receive vs POS sale and app checkout; void vs sale (no negative stock); two payments; payment vs void; plan vs payment; archive vs receive; two receives on one cost row.
- **Idempotency:** clientRef replay 200 for receive and payment; concurrent identical requests → one record; `client_ref_reused`.
- **Numbering:** GRN gap-free under concurrency and rollback, per vendor; void keeps the number.
- **Aging:** buckets at EAT boundaries (pin 21:30 UTC and 23:59 EAT); totals = Σ rows; CSV escaping (formula injection).
- **Reports:** stock value at cost after receive and void; profit not restated; `paidToSuppliers`; settlement prepare output identical with purchases present.
- **Audit and notifications:** audit rows for every write; notifications only for staff actors, EN/SW.
- **Low stock:** a receive crossing above the level clears the alert; a void crossing below sends `vendor_low_stock` once.

**Portal** `tests/e2e/vendor-purchases.spec.ts`:
- gating (flag off: no nav; deep link home), permission visibility (owner, admin, purchases-only, M2 staff)
- suppliers add / duplicate / archive refused / restore
- receive page: add rows, variant select, cost notices, part payment + split evenly, sum error, confirm → detail
- record payment with coverage preview, overpayment message, void payment, change instalments
- void with `insufficient_stock` message and adjust link
- owed view buckets, sort, CSV; dashboard tile
- 375px layout, focus and Escape, axe on receive page, dialogs and owed table

**Mobile** (`test/vendor/purchases/`):
- `purchase_draft_controller_test.dart`: totals, split evenly (remainder on the last), coverage preview mirrors P-5, draft save/restore/clear on sign-out
- `receive_page_test.dart`: supplier rule, duplicate merge, cost notices by `canSeeCost`, free line, Review disabled reasons, offline disabled, Try again reuses clientRef, error mapping and focus
- `purchase_detail_test.dart`: instalment states in words, payment sheet, void dialogs and `insufficient_stock` list, M2 visibility, text share content (no previous cost, note or recorder)
- `suppliers_test.dart`: list filters, form validation, duplicate link, archive disabled when owed, Call label
- `payables_test.dart`: buckets as filters, ordering, empty
- `vendor_tools_test.dart`: `purchases` parsed and fails closed; tab 0 visibility for purchases-only staff
- i18n key parity (EN/SW for every new key)

---

Standing reminders:
- `VENDOR_TOOLS`, `VENDOR_STOCK_LEDGER` and `VENDOR_PURCHASES` stay off until the owner says otherwise.
- Payables are tracked only: FitFlex pays no supplier. Walk-in money and purchases are outside settlement, and vendor settlement has never been exercised by hand.
- Shop (app) payments are manual (D-9). VAT DR-05 is open; input VAT on purchases is out of scope.
- Vendor terms (data ownership, supplier records, money not handled by FitFlex) are drafts pending Tanzanian counsel.
- S8 barcodes is not built; scanning in Receive stock comes with it.
- All Swahili above is a draft for native review.
