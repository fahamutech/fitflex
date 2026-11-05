# Partial and revertible refunds on walk-in sales (S7): design spec

Status: APPROVED 2026-11-03 — owner accepted all recommendations (Q-1..Q-6). Date: 2026-11-03. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §1 (flags `VENDOR_TOOLS` + `VENDOR_REFUNDS`, `/vendor/tools/options.refunds`, permission `sales`, integer TZS, EAT), S7, §4, §5 (**O-6** CN- numbers continuous per vendor, no yearly reset; **O-8** no customer credit balance; **O-14** staff with `sales` may act, audited, no approval step), §7. **D-6 stands: no partial refunds on marketplace orders.** Marketplace orders are out of scope.
Builds on: `vendor-walkin-sales-s3.md` (sale, lines, payments, void), `vendor-customers-s4.md` (credit sales, balances, allocations, aging), `vendor-documents-s5.md` (renderer, share sheet, VAT per line, §4.3 credit-note layout), `vendor-reports-s6.md` (§1 definitions, §8.2 Q-5, §8.5 Refunds view). Components, states and strings from those specs are reused. This spec overrides them only where it says so.

Read from `origin/release-candidate` (read only): functions 40507a6, portal 7c1c000, mobile 5f0f99b.

Platforms: Flutter (Android and Flutter web; this is where refunds are made at the counter) and the Next.js portal (refund and undo on the sale detail). Roles: `vendor`, and `vendor_staff` with `sales`.

---

## What already exists in code (so builders don't duplicate it)

| Area | Exists on RC | S7 still has to add |
|---|---|---|
| Flag | `VENDOR_REFUNDS` is in the vendor-tools flag list; `/vendor/tools/options` and `/vendor/me.tools` already return `refunds` (`src/shared/feature-flags.mjs`) | Route guards that use it. Mobile `VendorTools` (`lib/screens/vendor/stock/stock_options.dart`) has **no `refunds` field** yet. The portal `VendorTools` type has an index signature only, so add a typed `refunds?: boolean` |
| Stock ledger | CHECK on `ShopStockMovement.reason` already allows `refund_restock` and `refund_revert`. `kind` allows `refund` and `refund_revert`. Unique `(sourceId, productId, variant, reason) WHERE sourceId IS NOT NULL` (S3 migration) | Writing those rows. Stock history `document` mapping only knows `order` and `sale`/`sale_void` (`vendor-stock-store-pg.mjs` l.37–39), so add `refund`. Client labels for both reasons |
| Sale | `VendorSale` (CHECKs `vendorsale_total_adds_up`, `vendorsale_paid_adds_up` = paid − change + balance = total, `vendorsale_kind_rules`), `VendorSaleLine` (`lineTotalTzs`, `saleDiscountShareTzs`, `unitCostTzs`, `vatTzs`, `vatCode`, `vatRatePct`), `allocate()` largest-remainder helper (`src/shared/vendor-sale.mjs`) | Refund columns and a **replaced paid-adds-up CHECK** (§2.1) |
| Void | `voidSale` locks the sale row, refuses `already_voided` and `sale_has_payments`, and applies the M2 rule (owner and admin staff: any sale; other staff: own sale, same EAT day; `void_not_allowed {reason}`). It **does not check refunds yet** | 409 `has_refunds` (§2.6). The portal already handles the code `has_refunds` (`app/vendor/sales/page.tsx` l.429) with `vendor.sales.voidHasRefunds` (EN+SW in portal i18n; **missing in mobile i18n**) |
| Documents | `VendorDocumentLink.docType` CHECK includes `credit_note`. `DOC_PERMISSIONS.credit_note = ['sales']`. `LINK_DOC_TYPES` and labels `credit_note`, `forReceipt`, `refunded` exist in EN/SW (`src/shared/vendor-documents.mjs`). Mobile has `vendor.doc.credit_note` | No credit-note builder, no `KIND_OF`/`KIND_PERMISSIONS`/`KIND_DOC_TYPES`/`NOT_FOUND` entry, no store source, no share route, no client handling (§6) |
| Reports | `/vendor/reports/refunds` route, `refundsCsv` with headers (Credit note, Date, Sale, Amount, Method, Units back in stock, EN/SW). The service returns `rows: []` (`vendor-report-service.mjs` l.310). The `facts` CTE already has `kind` sale/refund and signed columns for app refunds | Walk-in refund rows in `facts` (§2.11), refunds rows, a "paid back" group in payment methods. **Neither portal nor mobile renders the Refunds view yet** (S6 §8.5 was not built) |
| Notifications | `vendor_sale_voided` and `vendor_customer_payment_voided` templates (EN/SW) in `partner-notifier.mjs` | `vendor_sale_refunded`, `vendor_refund_reverted` (§2.10) |
| Clients | Portal sale detail is `/vendor/sales/?id=<saleId>` (query string, static export; not `/vendor/sales/:id`), with `mayVoidSale` in `src/lib/vendor.ts`. Mobile `SaleDetailPage` at `/vendor/sales/:saleId` with `canVoidSale` | Refund and undo UI on both (§4, §5) |

Nothing on RC creates a refund today. There is no `VendorSaleRefund` table.

---

## Ground rules

- **Walk-in money never passes through FitFlex.** A refund records that the vendor gave money back, or took it off a customer's balance. The UI says this plainly every time money is involved (`vendor.refunds.moneyNotice`). No PaymentRequest, no Selcom, no settlement row.
- **Online only.** Refunds and undo need a live server answer (§4.7).
- **A sale is never edited.** Its totals, lines and payments stay as issued. Refunds are separate records (credit notes) that point at it. The only sale fields that change are the refund counters and, for a credit sale, `balanceTzs`.
- **Money display "TSh 45,000"** (S5 rule). "TZS" only in data and CSV headers. Integer shillings everywhere.
- **EAT.** A refund is dated by when it was made (`createdAt`, EAT day). An undo is dated by when it was undone. Closed periods never change (S6 Q-4).
- **Everything is dormant** behind `VENDOR_TOOLS` + `VENDOR_WALKIN_SALES` + `VENDOR_REFUNDS`.

---

## 0. Scope, gating, permissions, reuse

### 0.1 In scope
- Refund some or all units of one or more lines of a **completed walk-in sale** (cash or credit), with a per-line "put back in stock" choice.
- Undo ("revert") a refund that was a mistake.
- Credit note `CN-000001` per refund, through S5's renderer, share sheet and PDF.
- Effects on stock, the credit-sale balance, S6 reports, customers and aging.

Out of scope: marketplace orders (D-6); amount-only refunds with no item (Q-2); exchanges (record a refund, then a new sale); offline refunds; fiscal (TRA) credit notes (S10).

### 0.2 Gating (fail closed, as S1–S6)
- `refundsOn` = `tools.walkInSales === true && tools.refunds === true` (the server computes `refunds` from VENDOR_TOOLS + VENDOR_REFUNDS; the client also requires `walkInSales`, because refunds live on walk-in sales).
- Off, missing or options failed: no Refund button, no undo, no refund routes. Deep links go to the sale detail (or the vendor home if sales are off) with no message. Never show "feature off".
- **Refunds already made stay visible when the flag goes off.** The sale read keeps returning `refunds[]` and the refund counters (pure bookkeeping, plan §1), so a sale never looks bigger than it is. The rows are read-only: refund detail opens, Share and Undo are hidden. Report totals always include existing refunds. The Refunds report view shows when `tools.refunds` **or** the period has refund rows (same rule as the S6 walk-in channel).
- Server (as built, functions#318 after security review L1): `POST /vendor/sales/:id/refunds`, `POST /vendor/refunds/:id/revert`, `GET /vendor/refunds` (list) and `POST /vendor/refunds/:id/share` → 404 `feature_disabled` when any of the three flags is off. `GET /vendor/refunds/:id` and credit-note documents need only VENDOR_TOOLS + VENDOR_WALKIN_SALES (documents also VENDOR_DOCUMENTS), so existing refunds open read-only (AC-2). `tools.refunds` already includes VENDOR_WALKIN_SALES.

### 0.3 Permissions

| Action | Needs | Notes |
|---|---|---|
| See refunds on a sale, refund detail, credit note | `sales` | Read |
| Make a refund | `sales` + the M2 rule (Q-1) | Owner and `vendorRole=admin` staff: any completed sale. Other `sales` staff: a sale **they recorded, on the EAT day it was sold**. Else 403 `refund_not_allowed {reason: not_own \| too_old}` |
| Undo a refund | `sales` + the same rule applied to the **refund** (own refund, same EAT day it was made) | Else 403 `revert_not_allowed {reason}` |
| Share / PDF the credit note | `sales` + `tools.documents` | `DOC_PERMISSIONS.credit_note` exists |
| Refunds report | `reports` | S6 rule |

- Rights are read from the stored staff record (`authorizeStaff`), never from the token (S3 pattern). Staff of a suspended vendor → 403 `vendor_suspended`.
- No new permission. `sales` already covers refunds (plan §1).
- A refund or undo by staff notifies the vendor account (§2.10).

### 0.4 Components (reuse; no new shared component)

| Need | Mobile | Portal |
|---|---|---|
| Refund screen lines | `FFCard` rows + the S3 qty stepper (48×48 buttons) + `SwitchListTile` (restock) | `Table` rows (cards below `md`) + `Input type="number"` with − / + `Button`s + `Switch` |
| Reason | `FFPill` wrap (suggestions) + `FFTextField` (3–200, counter) | `Segmented`-style chip buttons + `Textarea` |
| Method | S3 method `FFPill` wrap + `FFTextField` reference | S3 method chips + `Input` |
| Summary | `FFCard` totals rows (S3 receipt style) | `Card` + `dl` |
| Confirm / undo | `FFDialog` | `Dialog` / `ConfirmDialog` |
| Status | `FFBadge`: Part refunded = info, Refunded = neutral, Undone = neutral, Cancelled (on credit note) = neutral | `Badge` same tones |
| States | `FFSkeleton*`, `FFErrorState(onRetry:)`, `FFAlert`, `FFSnack` | `SkeletonCard`, `ErrorState`, `Alert`, toast |
| Credit-note share | `document_share_sheet.dart` (S5) with `docType: credit_note` | `share-menu.tsx` (S5) |
| Credit-note view | `document_view.dart` (S5 native document view) | `/vendor/documents/?type=credit_note&id=` (S5 iframe view) |

New non-visual pieces: `RefundDraftController` (mobile: picked quantities, restock flags, preview amounts) and `previewRefund()` (a client mirror of §2.4 rounding, for display only; the server's numbers win). New mobile files go in `lib/screens/vendor/sales/refunds/`. Portal: `src/components/vendor/sales/refund-dialog.tsx`, `refunds-card.tsx`.

---

## 1. Money rules (decided in this spec)

These are decisions, not open questions. They follow the plan and the S3–S6 specs. design-qa and the specs check them one by one.

**M-1 What a line can give back.** A line's refundable value is what the customer actually paid for it: `lineNet = lineTotalTzs − saleDiscountShareTzs` (line discount and the line's share of the sale-level discount already taken off; both are stored on the line). A refund can never return more than `lineNet` per line in total, or more than the sale's `totalTzs` overall.

**M-2 Rounding (cumulative, never exceeds).** Per line, with `Q` = sold qty, `a` = units already refunded by **active** refunds, `A` = Σ amount of those active refunds on this line, `q` = units in this refund:
```
amount(q) = (a + q == Q) ? lineNet − A
                         : max(0, min(lineNet − A, floor(lineNet × (a + q) / Q) − A))
```
- The last unit always takes whatever is left, so refunding everything returns exactly `lineNet`.
- Partial refunds round **down**, so the sum never exceeds what was paid.
- It works from the active sum, so undoing a refund in the middle never lets later refunds go over (worked check: `lineNet` 100, Q 3: refund A 2 units = 66; refund B 1 unit = 34; undo A; refund C 2 units = 100 − 34 = 66; active total 100).
- Example: 3 × TSh 3,500 with a TSh 500 line discount → lineNet 10,000. One unit → 3,333; a second → 3,333; the last → 3,334.
- The refund's amount = Σ line amounts. The server computes it; the client never sends money amounts.

**M-3 VAT on refunded lines.** The same formula applied to the line's `vatTzs` (stored, VAT-inclusive, S5 per-line half-up). So VAT reversed per line is exact on a full refund and never exceeds the line's VAT. The refund line stores `vatTzs`. The credit note groups it by the line's `vatCode`/`vatRatePct` (snapshot from the sale, never today's rate). VAT 0 lines show no VAT block.

**M-4 Credit (pay-later) sales: the balance comes off first.** For a refund of amount `X` on a credit sale with current `balanceTzs = B`:
- `balanceReducedTzs = min(X, B)` is taken off the balance (no money moves).
- `paidOutTzs = X − balanceReducedTzs` is money the vendor gives back, by a method (M-6).
- Decision for the part-paid case: the customer has already paid some of it (at the counter or by PMT), so the refund first cancels what is still owed and the rest is paid back. The alternative (refuse any payout and force a customer credit) is ruled out by O-8 (no customer credit balance).
- A cash sale always has `balanceReducedTzs = 0`.

**M-5 Undo reverses exactly what the refund did.** Stock re-taken for restocked lines; the refunded quantities and amounts count as sold again; on a credit sale `balanceTzs += balanceReducedTzs` (the debt reopens, even if it is now overdue). The paid-out part is recorded as "the customer must return it" (wording in the undo dialog). If a customer payment was voided later, S4's void already reopens the balance by its allocation; the two compose correctly, and no special case is needed.

**M-6 Refund method.** One method per refund, from the S3 list (`cash, mpesa, airtel_money, mixx, halopesa, card, bank, other`). It is required only when `paidOutTzs > 0`. Default = the sale's first payment method (cash when the sale had no payment). A reference is required for `mpesa, airtel_money, mixx, halopesa, bank` (`REFERENCE_REQUIRED`, same as S3: the vendor's outgoing transaction id), optional for card and other, ≤100 characters. The method does not have to match the original payment. To split a payback over two methods, make two refunds.

**M-7 Restock.** Per refund line, `restock` (default true). True → the units go back to stock once (`refund_restock`). False → nothing moves (damaged, not returned). A product that was deleted cannot be restocked: 400 `restock_unavailable {saleLineId}`; the vendor turns restock off. A variant that no longer tracks its own stock goes back to the product's count with ledger note `variant_gone` (S3 void rule).

**M-8 Cost and profit (S6 Q-5).** Revenue comes off on the refund day. Cost comes off only for restocked units (`qty × unitCostTzs`); non-restocked units keep their cost (a real loss). Lines without a cost snapshot stay in the "uncosted" block, with negative revenue.

**M-9 Zero-amount refunds.** Allowed (a free or fully discounted item comes back). The amount is 0, no method, and the stock still moves.

**M-10 Numbering (O-6).** `CN-000001…` per vendor from `VendorDocumentSequence` docType `credit_note`, row-locked in the refund's transaction. A rolled-back refund gives its number back. **An undo keeps the number.** The credit note stays in the series, marked Cancelled, so numbers stay continuous and anyone holding it sees it was cancelled (S5 Q-2 rule for voided documents).

---

## 2. Backend contract (for backend-builder, contract-checker, security-and-privacy-reviewer)

All routes: `requireAuth('vendor','vendor_staff')` + the S3 `requireSalesPermission` guard (stored staff record, suspended vendor → 403). Flags VENDOR_TOOLS + VENDOR_WALKIN_SALES + VENDOR_REFUNDS, else 404 `feature_disabled`. Every query is vendor-scoped and parameterised, on a dedicated Postgres store (`src/infra/vendor-refund-store-pg.mjs` or inside `vendor-sale-store-pg.mjs`); no `filterAsync`.

### 2.1 Migration `<after 20270202090300>-vendor-sale-refunds.cjs` (**rule 6: money records; call out in the PR**)

**`VendorSaleRefund`**
| Column | Type | Notes |
|---|---|---|
| id | text PK | `vrf_` + 16 hex |
| vendorId | text not null | |
| saleId | text not null | FK `(saleId, vendorId)` → `VendorSale(id, vendorId)` (unique exists from S4) |
| seq, number | int, text not null | `CN-000001`; unique `(vendorId, seq)`, `(vendorId, number)` |
| status | text not null default `active` | CHECK `active \| reverted` |
| reason | text not null | CHECK 3–200 chars |
| method | text null | CHECK in the S3 method list |
| reference | text null | CHECK ≤100 |
| amountTzs | int not null | CHECK ≥0 |
| balanceReducedTzs | int not null default 0 | CHECK ≥0 |
| paidOutTzs | int not null default 0 | CHECK ≥0; CHECK `amountTzs = balanceReducedTzs + paidOutTzs`; CHECK `paidOutTzs = 0 OR method IS NOT NULL` |
| vatTzs | int not null default 0 | CHECK 0 ≤ vatTzs ≤ amountTzs |
| clientRef, fingerprint | text not null | unique `(vendorId, clientRef)`; clientRef 8–100 `[A-Za-z0-9._:-]` (S3 rule) |
| sellerSnapshot | jsonb | seller details at issue (S5 Q-8) |
| createdBy, createdAt | text, timestamptz(3) not null | createdAt = the refund time |
| revertedBy, revertedAt, revertReason | null | CHECK all set iff `status = reverted`; revertReason 3–200 |
| updatedAt | timestamptz(3) | |
Indexes: `(vendorId, createdAt, id)`, `(vendorId, revertedAt) WHERE revertedAt IS NOT NULL`, `(saleId)`.

**`VendorSaleRefundLine`**
| Column | Notes |
|---|---|
| id, refundId (FK cascade), vendorId, saleLineId (FK → `VendorSaleLine.id`) | unique `(refundId, saleLineId)` (one row per sale line per refund) |
| qty | CHECK > 0 |
| amountTzs, vatTzs | CHECK ≥0, vatTzs ≤ amountTzs |
| restock | bool not null |

(The plan listed `refundId, saleLineId, qty, amountTzs, restock`; `vendorId` and `vatTzs` are added for tenancy and M-3. Cost is not copied; reports join `VendorSaleLine.unitCostTzs`.)

**`VendorSale` gains** `refundedTzs int not null default 0` (Σ active refunds) and `balanceReducedTzs int not null default 0`:
- **Replace** `vendorsale_paid_adds_up` with `paidTzs − changeTzs + balanceTzs + balanceReducedTzs = totalTzs`. The old CHECK is dropped and the new one added `NOT VALID` then `VALIDATE` (all existing rows have 0, so it holds).
- CHECK `0 ≤ refundedTzs ≤ totalTzs`, `0 ≤ balanceReducedTzs ≤ refundedTzs`, `kind = 'cash' ⇒ balanceReducedTzs = 0`.

**`VendorSaleLine` gains** `refundedQty int not null default 0`, `refundedTzs int not null default 0`, `refundedVatTzs int not null default 0`: CHECK `0 ≤ refundedQty ≤ qty`, `0 ≤ refundedTzs ≤ lineTotalTzs − saleDiscountShareTzs`, `0 ≤ refundedVatTzs ≤ vatTzs`. These are the active totals (the M-2 `a` and `A`), kept in the refund/undo transaction, with the CHECKs as the last line of defence against over-refunding.

**Down:** refuses while any `VendorSaleRefund` row exists (prints the count; S4 pattern). Otherwise it restores the old CHECK, drops the columns, drops the tables, and deletes `VendorDocumentSequence` rows with docType `credit_note`. Ledger rows of kind refund/refund_revert would stay (valid S1 history), but none can exist if down runs.

### 2.2 `POST /vendor/sales/:id/refunds` (new endpoint; **rule 6**)
Request:
```
{ clientRef, lines:[{ saleLineId, qty, restock? (default true) }], reason, method?, reference? }
```
- `lines` 1–100, each `saleLineId` once (`duplicate_line`), `qty` 1–1000.
- The client sends **no amounts**.

→ **201** `{ refund, sale }`; a replay of the same clientRef with the same body → **200** with the same refund (checked before every other rule, so a lost response can be retried safely). Same clientRef with a different body → 409 `client_ref_reused`.

`refund` shape:
```
{ id, number, status, saleId, saleNumber, saleInvoiceNumber|null, saleKind, refundedAt, createdBy{id,name},
  reason, method|null, reference|null, amountTzs, balanceReducedTzs, paidOutTzs, vatTzs,
  vatSummary[{code, ratePct|null, netTzs, vatTzs}],
  customer{id,name,forgotten}|null,
  lines[{ saleLineId, productId, variant|null, nameSnapshot, qty, unitPriceTzs, amountTzs, vatTzs, vatCode|null, restock }],
  revertedBy{id,name}|null, revertedAt|null, revertReason|null }
```
`sale` = the S3/S4 sale view plus §2.5 fields. Never `unitCostTzs`, never `fingerprint`, never internals.

**Order of checks** (one transaction, §2.7):
1. Replay.
2. Parse (400s).
3. Lock and load the sale (404 `sale_not_found` for unknown or another vendor's sale).
4. M2 rule (403 `refund_not_allowed`).
5. `sale_voided`.
6. Quantities (409 `refund_exceeds_sold`).
7. Method and reference (400).
8. Restock availability (400 `restock_unavailable`).
9. Stock moves, then the number, then writes.

### 2.3 Errors (refund)

| Status | Code | Extra | When |
|---|---|---|---|
| 404 | `feature_disabled` | | any flag off |
| 403 | `vendor_permission_forbidden` | `requiredPermission: 'sales'` | staff without `sales` |
| 403 | `vendor_suspended` | | staff of a suspended vendor |
| 403 | `refund_not_allowed` | `reason: not_own \| too_old` | M2 rule (Q-1) |
| 404 | `sale_not_found` | | |
| 409 | `sale_voided` | `voidedAt` | |
| 409 | `refund_exceeds_sold` | `lines:[{saleLineId, soldQty, refundedQty, refundableQty}]` | qty > Q − a (including a race lost to another refund) |
| 409 | `client_ref_reused` | | |
| 400 | `lines_required`, `too_many_lines`, `invalid_line {index, field}`, `duplicate_line {saleLineId}`, `invalid_quantity {index}`, `line_not_on_sale {saleLineId}` | | |
| 400 | `reason_required {min}`, `reason_too_long {max}` | | |
| 400 | `method_required`, `invalid_method`, `reference_required {method}`, `reference_too_long {max}` | | method rules (M-6), judged on the server's `paidOutTzs` |
| 400 | `restock_unavailable` | `saleLineId, productId` | M-7 |
| 400 | `invalid_client_ref` | | |
| 429 | `rate_limited` | `retryAfterSeconds` | shares the S3 sales limiter (120/min/vendor) |

A method or reference sent when nothing is paid back (`paidOutTzs = 0`) is ignored and stored as null. It is not an error.

A queued (unsynced) sale has no server id, so refunds cannot be asked for it (the client hides the action; §4.6).

### 2.4 `POST /vendor/refunds/:id/revert` (new endpoint; **rule 6**)
Body `{ reason }` (3–200, required; see Q-4). → **200** `{ refund, sale }` (`status: reverted`, `revertedBy/At`, `revertReason`).
| Status | Code | Extra |
|---|---|---|
| 404 | `refund_not_found` | |
| 403 | `revert_not_allowed` | `reason: not_own \| too_old` |
| 409 | `already_reverted` | `revertedAt` |
| 409 | `sale_voided` | (cannot happen while the rule in §2.6 holds; kept as a guard) |
| 409 | `insufficient_stock` | `productId, variant\|null, available` (a restocked unit was sold since; nothing changes) |
| 409 | `customer_archived` | `customerId` (credit sale: undo would put debt on an archived customer, which S4 forbids; unarchive first) |
| 400 | `reason_required`, `reason_too_long` | |
No clientRef: a second call answers `already_reverted`. The ledger unique index is the backstop.

### 2.5 Reads (new and changed)
- `GET /vendor/refunds?from&to&saleId&status=active|reverted|all&limit=50&cursor` (`sales`) → `{ refunds:[{ id, number, status, refundedAt, revertedAt, saleId, saleNumber, amountTzs, paidOutTzs, balanceReducedTzs, method, restockedUnits, createdBy{id,name} }], nextCursor }`. Newest first. EAT `from/to` on `createdAt`.
- `GET /vendor/refunds/:id` → `{ refund }` (§2.2 shape). 404 `refund_not_found`.
- **Changed (additive; call out): sale view** (`GET /vendor/sales/:id`, POST/void responses, S4 customer sale reads) gains:
  - `refundedTzs`, `refundableTzs` (= Σ lines' lineNet − refundedTzs)
  - `netAfterRefundsTzs` (= totalTzs − refundedTzs)
  - `refundState: none | partial | full` (full = every line's refundedQty = qty)
  - `balanceReducedTzs`
  - `refunds:[{ id, number, status, refundedAt, amountTzs }]` (active and reverted, oldest first)
  - per line `refundedQty`, `refundableQty`, `refundedTzs`, `lineNetTzs`

  Returned **whatever the flag**, because these are bookkeeping facts (§0.2).
- **Changed: `GET /vendor/sales` rows** gain `refundedTzs`, `refundState`; `summary` gains `refundCount`, `refundTzs` (refunds made in the range by refund date, minus undos made in the range by undo date) and `netTzs = totalTzs − refundTzs`. `byMethod` stays money received. A new `refundsByMethod[{method, amountTzs}]` holds money paid back (paidOut).
- **Changed: stock movements** rows of kind `refund`/`refund_revert` carry `document: { type: 'refund', id, number }` (CN number).

### 2.6 Void interplay (changed S3 behaviour; call out)
`POST /vendor/sales/:id/void` → 409 **`has_refunds {refunds:[{id, number}]}`** while the sale has **active** refunds. Checked after `void_not_allowed` and `already_voided`, before `sale_has_payments`. Reverted refunds do not block (Q-3): their stock was re-taken, so the void's full give-back stays correct. After a void, refunds can no longer be made or undone (`sale_voided`).

### 2.7 Concurrency (one transaction each)
Lock order everywhere: **customer → sale → products** (products in the fixed `productId\0variant` order S3 uses). This matches S4 payments (customer → sales) and S3 void (sale → products), so there is no deadlock cycle.

**Refund:**
1. If the sale is credit, lock `VendorCustomer` FOR UPDATE. Read the sale's kind and customer first without a lock, then re-check after locking.
2. Lock `VendorSale` FOR UPDATE and re-read status, kind and balance.
3. Lock its lines FOR UPDATE.
4. Compute amounts (M-2, M-3, M-4) from the locked line counters.
5. For restock groups (lines grouped per product+variant), lock `Product` FOR UPDATE, `stock = stock + q` (variant too, S3 helper), and insert the ledger row: `reason refund_restock`, `kind refund`, `sourceId = refundId`, `delta +q`, `stockAfter`, `actorId`.
6. Issue the CN number.
7. Insert the refund and its lines.
8. Update line counters, then the sale (`refundedTzs`, `balanceTzs −= balanceReducedTzs`, `balanceReducedTzs +=`), then write the audit row.

**Undo:** lock customer (credit) → refund FOR UPDATE (status must be active) → sale → lines → products. Then:
- For each restocked group, take stock with the conditional update `stock >= q` (and the variant's own stock), else 409 `insufficient_stock`, which rolls back everything.
- Ledger row `refund_revert`/`refund_revert`, `sourceId = refundId`, `delta −q`.
- Then subtract the counters, `balanceTzs += balanceReducedTzs`, set the refund to reverted, write the audit row.

| Race | Result |
|---|---|
| Two refunds of the same line | The second waits for the sale lock, re-reads `refundedQty`, and gets `refund_exceeds_sold` with fresh numbers if it would go over. Never over-refunds (the line CHECK is the backstop). |
| Refund vs void | Both lock the sale first. A void that wins makes the refund answer `sale_voided`. A refund that wins makes the void answer `has_refunds`. |
| Refund vs customer payment on a credit sale | Both lock the customer first. The payment sees the reduced balance (`overpayment {owedTzs}` if it no longer fits; S4 handling). The refund sees the paid balance and pays out the rest (M-4). |
| Undo vs sale of the same product (POS or app checkout) | Product row lock; the undo fails cleanly with `insufficient_stock` if the units are gone. |
| Double undo | Refund row lock → `already_reverted`; the ledger unique `(sourceId, productId, variant, 'refund_revert')` backs it up. |
| Replay after a lost response | Unique `(vendorId, clientRef)` → 200 with the stored refund. A unique violation inside the transaction (two identical requests at once) is caught and answered as a replay. |

**Stock ledger exactly once:** a refund writes at most one `refund_restock` row per (refund, product, variant). Its undo writes at most one `refund_revert`. Both are guaranteed by the existing unique index on `sourceId`. A refund with no restocked lines writes no ledger row, and its undo writes none either. After commit: `afterStockMoved(productIds)` (low-stock check, S1), best effort.

### 2.8 Credit sales, customers and aging
- `balanceTzs` drops by `balanceReducedTzs` in the refund transaction, so Owed to you, aging buckets, the customer profile `owedTzs`, the overdue digest and S5 credit-invoice live status all follow automatically (they read `balanceTzs`). A balance that reaches 0 leaves Owed to you. An undo reopens it.
- Customer profile `totals.shopSalesTzs` → net of active refunds (requested; labelled "after refunds").
- Archive: S4 refuses archiving while owed > 0. A refund can bring it to 0 and allow archiving. Undo on an archived customer → `customer_archived`.
- Allocations are untouched. `allocatedTzs ≤ paidTzs` still holds, because refunds never change `paidTzs`.

### 2.9 Audit
`AuditLog` rows in the same transaction:
- `vendor_sale_refunded`, target = refundId. `before {saleNumber, saleTotalTzs, refundedTzs, balanceTzs}`, `after {number, amountTzs, balanceReducedTzs, paidOutTzs, method, reference, lines[{saleLineId, qty, restock, amountTzs}], reason, vendorId}`.
- `vendor_sale_refund_reverted`, target = refundId. `before {status: active, …}`, `after {status: reverted, reason}`.

### 2.10 Notifications (vendor account only, after commit, best effort; only when the actor is staff)
- `vendor_sale_refunded {saleId, refundId, number, saleNumber, amountTzs, createdByName, reason}`
- `vendor_refund_reverted {saleId, refundId, number, amountTzs, revertedByName, reason}`

As built, push `data` carries `saleId, refundId, number, saleNumber` (+ title/body); amount, actor name and reason are only in the message text. Templates EN/SW in §8.8. Tap → `/vendor/refunds/:refundId` (mobile); the portal list shows them as today. Nothing ever goes to the customer.

### 2.11 Reports (S6) — changes to `facts` and sections
- **`facts` gains walk-in refund rows** from `VendorSaleRefundLine` × refund × sale line, for refunds whose `createdAt` falls in the period:
  - `channel walk_in`, `kind refund`, `doc_id = refundId`, `day = EAT(createdAt)`
  - `qty = −q`, `refund_qty = q`, `gross 0`, `discount 0`, `refund = +amountTzs`, `net = −amountTzs`, `vat = −vatTzs`, `commission 0`
  - `cost = restock ? −(q × unitCostTzs) : 0`, or null when `unitCostTzs` is null (uncosted)
- **Undo rows**: the same refund lines again, for refunds whose `revertedAt` falls in the period, dated `EAT(revertedAt)`, with **every sign flipped** (`refund = −amountTzs`, `net = +amountTzs`, `qty = +q`, …).
  - Effect: a refund and its undo in the same period cancel to 0. A refund last month undone today leaves last month unchanged and adds back today (S6 Q-4: closed periods never change).
  - Deduction columns stay positive for refunds and go negative only on undo rows, so Gross − Discounts − Refunds = Net still adds up in every bucket.
- **Sales**: Refunds figure and column now include walk-in credit notes. Net = Gross − Discounts − Refunds. Units are net of refunds.
- **Profit**: M-8. A non-restocked unit keeps its cost.
- **Products**: units and revenue net of refunds on refund dates. Days of cover uses the 30-day net units.
- **Refunds report** (`/vendor/reports/refunds`):
  - `rows[{ type: refund|revert, refundId, number, date (EAT), saleId, saleNumber, amountTzs (− on revert rows), paidOutTzs, balanceReducedTzs, method, restockedUnits, status }]`
  - `totals{ count, amountTzs, paidOutTzs, balanceReducedTzs, restockedUnits, revertedCount }`, where `amountTzs` = refunds − undos in the period (equals the Sales report walk-in Refunds figure)
  - CSV as `refundsCsv` plus a "Type" column (`Refund`/`Undone`)
- **Payment methods**: a third group **"Paid back by you (refunds)"** `paidBack[{method, amountTzs, count}]` from `paidOutTzs` on refund dates, minus undos on undo dates. "Collected by you" is unchanged (money in). The three groups are never summed without a label. The balance-reduced part is not money and is not listed.
- **Customers section**: owed and overdue follow `balanceTzs` (no change needed). "Pay-later sales in period" stays gross, with sub-line `vendor.reports.cust.refundedOff` showing the balance taken off by refunds in the period.
- **Marketplace net and settlement: untouched.** Walk-in sales are outside settlement; refunds are too. A spec asserts `VendorSettlement` prepare output is identical with and without walk-in refunds.
- Caching (S6 Q-10): refunds and undos are always dated "now", so closed-period caches stay valid. No invalidation is needed.

### 2.12 Documents (S5) — credit note
- `KIND_OF` gains `refund`/`credit_note` → kind `refund`. `KIND_PERMISSIONS.refund = ['sales']`, `KIND_DOC_TYPES.refund = ['credit_note']`, `NOT_FOUND.refund = 'refund_not_found'`.
- Store `refundSource(vendorId, refundId)` loads the refund, lines, sale (number, invoiceNumber, kind, soldAt) and customer name.
- `creditNoteDocument(src, lang)` (§6).
- `GET /vendor/documents/credit_note/:refundId?format=json|html|pdf&lang&paper` (existing route; new kind).
- `POST /vendor/refunds/:id/share` (new, via `shareRoute`, needs `sales`) → the S5 share response. A reverted refund: share refused like a voided sale (409 `document_cancelled`, the existing S5 rule for new links on cancelled documents); earlier links keep working and show Cancelled.
- The **sale's own** receipt/invoice document gains a **Refunds** block (CN numbers, dates, amounts; reverted ones omitted) and "Total after refunds" when any active refund exists (§6.3).

---

## 3. Navigation

### 3.1 Mobile routes (GoRoute; ids checked with `_safeId`)

| Route | Screen | Back |
|---|---|---|
| `/vendor/sales/:saleId` | S3 sale detail, gains the Refunds card and the **Refund items** button | as S3 |
| `/vendor/sales/:saleId/refund` | Refund screen (§4.2) | Pops to the sale detail. With picks made: `FFDialog` `vendor.refunds.discardTitle`. Nothing to pop → `go('/vendor/sales/:saleId')` |
| `/vendor/refunds/:refundId` | Refund detail / result (§4.4) | Pops. When opened right after saving, back goes to the **sale detail** (the refund screen is replaced, never returned to). Nothing to pop → the sale detail |

Deep-link rules:
- `refundsOn` false → `/vendor/sales/:saleId` (or the vendor home if walk-in sales are off), no message.
- Exception: `/vendor/refunds/:refundId` still opens read-only when the flag is off, if the user has `sales` and walk-in sales are on (§0.2).
- No `sales` → first allowed section + snack `vendor.sales.noAccess`.
- Unknown or another vendor's id → not-found state.
- Push `vendor_sale_refunded` / `vendor_refund_reverted` → `/vendor/refunds/:refundId`.

Entry points: the sale detail (Refunds card rows; Refund items), stock history rows with `document.type == 'refund'` (link `vendor.stock.creditNote` {number} → refund detail), the Refunds report rows, and push.

### 3.2 Portal
- Sale detail stays at `/vendor/sales/?id=<saleId>`, with a Refunds card and a **Refund items** button that opens the refund dialog (§5). No new nav item.
- Credit note view: `/vendor/documents/?type=credit_note&id=<refundId>` (S5 page; new type).
- Reports: `view=refunds` (S6 §8.5) is now rendered.

### 3.3 After completion
- **Refund saved** → mobile replaces the refund screen with the refund detail (`/vendor/refunds/:id`), snack `vendor.refunds.saved` {number}, focus on the credit-note heading. **Done** goes back to the sale detail, which now shows the refund. Portal: dialog closes, toast, sale panel refreshes in place, focus to the new row in the Refunds card.
- **Undo saved** → detail updates in place (status Undone, banner), snack/toast `vendor.refunds.reverted` {number}. Focus returns to the status heading.

---

## 4. Mobile

### 4.1 Sale detail additions (`sale_detail_page.dart`)
1. **Badge** next to the status: `Part refunded` (info) or `Refunded` (neutral) from `refundState`.
2. **Totals**: after Total, when `refundedTzs > 0`: row `vendor.refunds.refundsRow` −{amount} and **`vendor.refunds.netAfter`** {amount} (bold). Credit sale: Balance due already reflects the reduction (S4 row unchanged).
3. **Lines**: a line with `refundedQty > 0` shows muted text `vendor.refunds.lineRefunded` "{n} refunded".
4. **Refunds card** (`FFSectionTitle` `vendor.refunds.section`): one row per refund (oldest first). Each row: CN number · date (EAT) · amount · badge (Undone when reverted, struck-through amount + "Undone" text). The whole row is tappable, ≥56dp, chevron. Merged semantics `vendor.refunds.rowLabel`.
5. **Refund items** button (secondary, icon `assignment_return`, `key: sale-detail-refund`), placed before Void. It is shown when:
   - `refundsOn`, `sales`, and `canRefundSale(user, sale)` (mirror of the server's M2 rule, like `canVoidSale`)
   - the sale is completed and synced
   - `refundableQty > 0` on some line

   It is disabled offline with helper `vendor.refunds.offline`.
   - Not shown, with a muted line instead:
     - fully refunded → `vendor.refunds.fully`
     - voided → nothing (the S3 voided banner already explains)
     - queued → `vendor.refunds.queuedNo`
     - staff blocked by M2 → `vendor.refunds.askOwner`
6. **Void** with active refunds: hidden. The sale shows a muted line `vendor.sales.voidHasRefunds` instead (refund the rest, or undo the refunds first). This prevents the 409; the server still enforces it.

### 4.2 Refund screen (`/vendor/sales/:saleId/refund`) — layout, phone 375
Purpose: record what the customer brought back and what they get back, in under a minute, without arithmetic.

- **AppBar**: title `vendor.refunds.title` {number} ("Refund from R-000123"). Close icon (`vendor.refunds.close`).
- **Info line** (muted): sale date · total · method summary · customer name (credit or attached).
- **Section 1 · Items** (`vendor.refunds.pickItems`):
  - Ghost button **`vendor.refunds.refundAll`** (sets every line to its refundable qty).
  - One `FFCard` per sale line:
    - name (variant)
    - `vendor.refunds.soldRefunded` "Sold 3 · refunded 1"
    - stepper 0..refundableQty: − / value / +, 48×48 each, labels `vendor.refunds.increase` / `decrease` {name}
    - preview amount right-aligned ("TSh 3,333", from `previewRefund`)
    - when qty > 0: `SwitchListTile` **`vendor.refunds.restock`** (default on). Off shows helper `vendor.refunds.restockOff`.
  - Lines with refundableQty 0: shown disabled with "All refunded" (`vendor.refunds.lineAllDone`), no stepper.
- **Section 2 · Reason**: suggestion pills (`FFPill`, single select; tapping fills the text field in the current app language, editable): Returned / Faulty or damaged / Wrong item / Changed mind / Other (Other clears the field and focuses it). `FFTextField` `vendor.refunds.reason` (3–200, counter, required).
- **Section 3 · Money back** (shown once any qty > 0):
  - Summary rows:
    - `vendor.refunds.total` {amount}
    - credit sale: `vendor.refunds.offBalance` {name} −{amount}
    - `vendor.refunds.payBack` {amount} (bold, success tone + text)
    - when VAT applies: `doc.includesVat` {amount}
  - When payBack > 0: method pills (S3 order; default per M-6) + reference field with S3 rules (`vendor.pos.reference`, required marker for the five methods).
  - When payBack = 0: `vendor.refunds.nothingBack` (info), no method.
  - **Money notice** `FFAlert` info: `vendor.refunds.moneyNotice` (always shown).
- **Primary (sticky bottom): `vendor.refunds.review`** "Review refund {amount}". Disabled until qty > 0 on some line, the reason has 3+ characters, and the method and reference are valid. When disabled, the first missing thing shows as helper text above the button (`vendor.refunds.selectSome`, `vendor.refunds.reasonMissing`, `vendor.pos.referenceRequired`).

Flutter web ≥900: content max width 720, centred; Items and Money back side by side (Items 60%, Money back 40%, sticky). Tab order: close → Refund everything → each line (stepper −, +, restock) → reason pills → reason → method pills → reference → Review.

### 4.3 Confirm (`FFDialog`)
- Title `vendor.refunds.confirmTitle` ("Refund TSh 6,666 from R-000123?").
- Body: compact list "{qty} × {name} · {amount} · Back in stock / Not back in stock", then the money lines from §4.2, then `vendor.refunds.confirmBody`.
- Buttons: **`vendor.refunds.confirm`** "Refund TSh 6,666" (primary; it is not danger, because the action can be undone), Cancel.
- While saving: button spinner `vendor.refunds.saving`, dialog not dismissible.
- `clientRef` is made when Confirm is first tapped (S3 `Random.secure()` generator) and reused on Try again.

### 4.4 Refund detail / result (`/vendor/refunds/:refundId`)
- Heading `vendor.refunds.cnTitle` "Credit note CN-000004" (focus target), badge Refunded / Undone.
- `doc.forReceipt` {R-…} (or `vendor.refunds.forInvoice` {INV-…} for credit sales) as a link to the sale.
- Date, Mhudumu {name}, customer (when any).
- Lines: qty × name (variant), amount, `vendor.refunds.backInStock` / `notBackInStock` (vendor-only info).
- Money: total, taken off the balance, paid back by method (reference), VAT included.
- Reason (vendor-only).
- `FFAlert` info `vendor.refunds.moneyNotice`.
- Undone: `FFAlert` neutral `vendor.refunds.revertedBy` {name} {time} {reason}.
- **Actions** (sticky):
  - **Share credit note** (primary, `tools.documents` → S5 share sheet with `docType: credit_note`; documents off → `share_plus` text, §6.4). Hidden when undone; the links list stays in "…" for revoking (S5 rule).
  - **Done** (secondary) → sale detail.
  - **Undo refund** (ghost, danger tone; `canRevertRefund`; online only) in the overflow menu, not next to Share, so it isn't tapped by accident.

### 4.5 Undo dialog (`FFDialog`)
- Title `vendor.refunds.revertTitle` {number}.
- Body `vendor.refunds.revertBody` {amount}, plus `vendor.refunds.revertCredit` {amount} {name} for a credit refund with balanceReduced > 0, plus `vendor.refunds.revertStock` when anything was restocked.
- Reason `FFTextField` (3–200, required).
- **Undo refund** (danger, disabled until a reason is entered), Cancel.
- Responses: 200 → update in place + snack. 409 `insufficient_stock` → dialog stays, `FFAlert` error `vendor.refunds.err.revertStock` {available} {name} + **Count stock** link (needs `products`; S1 sheet, Counted preselected). 409 `already_reverted` → reload + snack. 409 `customer_archived` → `vendor.refunds.err.customerArchived` {name} with a link to the customer (needs `customers`). 403 → `vendor.pos.err.notAllowed`. Network → dialog stays, `vendor.refunds.offline`, Try again.

### 4.6 States

| State | Behaviour |
|---|---|
| Loading refund screen | `FFSkeletonList(count: 4, semanticLabel: vendor.refunds.loading)` while the sale reloads (always reloaded, never from a cached detail, so counters are fresh) |
| Load error | `FFErrorState` `vendor.refunds.loadFailed` + Try again |
| Offline at open | `FFErrorState` `error.network` + Try again (nothing to cache) |
| Flag off | No button, no route (§3.1) |
| No `sales` / blocked by M2 | Button hidden; M2 helper text (§4.1); crafted route → sale detail + snack `vendor.refunds.askOwner` |
| Fully refunded | Button hidden + `vendor.refunds.fully`; crafted route → same text with Back |
| Voided sale | No refund; crafted route → `vendor.refunds.err.saleVoided` with Back |
| Queued sale | No refund; `vendor.refunds.queuedNo` |
| Partial | Already-refunded lines shown with their counts; only the remainder is pickable |
| Pending-approval vendor | Works (own records) |
| Suspended vendor / staff disabled | Existing banners; Review disabled; server 403 |
| Saving | Confirm spinner; screen blocked |
| 201 / 200 replay | §3.3 |
| 409 `refund_exceeds_sold` | Dialog closes; the screen reloads the sale; affected lines are highlighted (warning border) with `vendor.refunds.err.exceeds`; picks are clamped to the new refundable qty; focus on the first highlighted line |
| 409 `sale_voided` | `FFAlert` error `vendor.refunds.err.saleVoided`; Review disabled; Back |
| 400 `restock_unavailable` | That line's restock switch turns off and shows `vendor.refunds.err.restockUnavailable` {name}; focus there |
| 400 reference/method | Inline on the field |
| 403 `refund_not_allowed` | Snack `vendor.refunds.askOwner`; back to the sale |
| 404 `feature_disabled` | Snack `vendor.refunds.unavailable`; back to the sale; the button disappears on the next options refresh |
| Network failure / timeout | Dialog stays; `FFAlert` `vendor.refunds.offline`; **Try again** reuses the same clientRef (a refund that did reach the server answers 200). **Never queued** |
| 5xx | Same as network with `vendor.refunds.err.server` |
| Refund detail undone | Banner, struck amounts carry the word "Undone", no Share, no Undo |

### 4.7 Offline: online only (recommendation, Q-6)
Refunds are never queued.
- **Correctness:** the over-refund check, the credit balance (M-4) and the CN number need the server's locked rows. Two devices refunding the same line offline would both "succeed" locally.
- **Number:** a credit note handed to a customer must carry its CN number. A provisional credit note invites disputes.
- **Low urgency:** returns are rarer than sales and can wait for a connection, unlike a customer waiting to pay.
- **Precedent:** S3 voids and S4 payments are online only.

The Refund button is disabled offline (`browser_online` / last request failure), with helper `vendor.refunds.offline`.

---

## 5. Portal (sale detail `/vendor/sales/?id=`)

### 5.1 Additions to `SaleDetail`
- Badges and totals as mobile §4.1 (Part refunded / Refunded; Refunds row; Total after refunds; per-line "{n} refunded").
- **Refunds card** (`Card`, heading `h3` `vendor.refunds.section`), after the Payment card:
  - Desktop: `Table aria-label={vendor.refunds.section}` with columns Credit note (link to `/vendor/documents/?type=credit_note&id=` when `documentsOn`, else plain), Date, Amount, Paid back, Method, Back in stock (units), Status, Actions (**Undo**, ghost danger, `min-h-11`, when `mayRevertRefund`).
  - 375px: one card per refund ("CN-000004 · 3 Nov · TSh 6,666 · Cash · 2 back in stock", badge, Undo button full width).
  - Undone rows: amount struck through + `Badge` "Undone" (text).
- **Refund items** button (secondary, `data-testid="sale-refund"`) next to Void, same visibility rules as mobile §4.1 (`mayRefundSale` in `src/lib/vendor.ts`, mirroring `mayVoidSale`). Void is hidden while active refunds exist, with the muted `vendor.sales.voidHasRefunds` line.

### 5.2 Refund dialog (`refund-dialog.tsx`)
- `Dialog`, max width 720 on desktop. **Full-screen sheet at <640px** (so 375 has room for lines), with a sticky footer.
- Title `vendor.refunds.title` {number}. Two steps in one dialog:
  1. **Choose**:
     - lines table: Item · Sold · Refunded · Refund qty (number input 0..refundable with − / + buttons, `aria-label` `vendor.refunds.qtyLabel` {name}) · Back in stock (`Switch`) · Amount
     - Refund everything (ghost)
     - reason chips + `Textarea` (counter)
     - money summary + method chips + reference
     - money notice `Alert`
     - footer **Review refund {amount}** / Cancel
  2. **Confirm**: the §4.3 summary as a `dl`, `vendor.refunds.confirmBody`. Footer **Refund {amount}** (primary, loading state) / **Back** (returns to step 1 keeping the picks).
- Focus: on open → the dialog heading; step change → the step heading; errors → the first invalid field. Focus trap; Escape closes only when not saving (asks `vendor.refunds.discardTitle` when picks exist); focus returns to the Refund items button.
- Responses as mobile §4.6 (toasts instead of snacks). Network: the dialog stays on Confirm with `Alert` `vendor.refunds.offline` and **Try again** (same clientRef).

### 5.3 Undo (`ConfirmDialog` with required `Textarea`)
Same copy as mobile §4.5. Errors inline in the dialog. Success → toast, row and totals update. `insufficient_stock` links to the product's stock adjust (`adjust-stock-dialog.tsx`, needs `products`).

### 5.4 Portal states

| State | Behaviour |
|---|---|
| Sale loading / error | Existing S3 skeleton / `ErrorState` |
| Flag off | No Refund button, no Undo; existing refunds listed read-only (§0.2) |
| No permission / M2 blocked | Button hidden + muted `vendor.refunds.askOwner` |
| Fully refunded | Button hidden + `vendor.refunds.fully` |
| Voided | Existing voided `Alert`; no refund controls |
| Refund dialog: loading counters | `SkeletonTable` inside the dialog (it re-fetches the sale on open) |
| Saving / undoing | Primary button `loading`, `aria-busy`, inputs disabled |

### 5.5 Reports view `refunds` (S6 §8.5, now built)
- Totals: Refunds (count) · Amount · Paid back · Taken off balances · Units back in stock · Undone (count).
- Table by event: Date · Credit note · Sale · Type (Refund / Undone) · Amount (− on Undone) · Paid back · Method · Back in stock.
- Mobile: a **Refunds** card in the Reports segment (count · amount · paid back) → `/vendor/reports/refunds` section detail, plus "Paid back by you" in the Payment methods card.

---

## 6. Credit-note document (S5 renderer, bilingual)

### 6.1 Blocks (S5 §4.1 order; §4.3 layout)
1. **Seller** (from `sellerSnapshot`; TIN/VRN as S5 rules).
2. **Title + number**: `doc.creditNote` "Credit note CN-000004". Under it `doc.forReceipt` "For receipt R-000123", or for a credit sale `doc.forInvoice` "For invoice INV-000045".
3. **Status**: `doc.statusIssued` "Issued", or Cancelled (§6.2).
4. **Meta**: date and time (EAT); customer name (when any; never phone); Mhudumu {first name}; original sale date `doc.saleDate` {date}.
5. **Returned items** (`doc.returnedItems`): name (variant), qty, amount, VAT code letter when VAT applies. **Not shown:** restock flags, reason, cost.
6. **Totals**: **Refund total** {amount}; `doc.includesVat` {amount} when VAT > 0.
7. **VAT summary** (when VAT > 0): `doc.vatSummary` table Code · Rate · Before VAT · VAT, from refund lines (M-3).
8. **Settlement**:
   - credit: `doc.balanceReduced` "Taken off the balance TSh X"
   - paid out: existing `doc.refunded` "Refunded TSh Y by {method}", with the reference in brackets when present
   - zero: `doc.nothingPaidBack` "No money paid back."
9. **Footer**: `doc.refundGivenBy` "Refund given by {business}.", `doc.notFiscal`, and `doc.copyNote` on public/PDF.

Document JSON (`creditNoteDocument`):
```
{ docType:'credit_note', number, saleRef{number, invoiceNumber?, soldAt}, status, issuedAt, lang, seller{…},
  customer{name}?, servedBy{firstName}, lines[{name, variant, qty, amountTzs, vatCode?}], totalTzs,
  vatIncludedTzs, vatSummary[…], balanceReducedTzs, paidOut{method, reference?, amountTzs}|null, cancelledAt? }
```
It must **not** contain phone, email, address, buyerUserId, cost, reason, revertReason or restock flags (A-02 grep spec, S5 pattern).

### 6.2 Undone credit note
Rendered like a voided S5 document:
- the `doc.cancelled` banner "Cancelled on {revertedAt}. {business} cancelled this document." (no reason)
- the PDF watermark "CANCELLED · IMEBATILISHWA"

Existing links keep working. New links are refused (409 `document_cancelled`). No new watermark strings.

### 6.3 The sale's receipt / invoice after refunds
S5 `saleDocument` gains a **Refunds** block after Payments: `doc.refundsOnSale` heading, rows "CN-000004 · 3 Nov 2026 · −TSh 6,666" (active only), then `doc.totalAfterRefunds` {amount}. The status badge stays Paid / Pay later, and the credit invoice live box already uses the reduced balance. The mobile native receipt (`receipt_data.dart`) and the portal detail show the same rows.

### 6.4 Text share (documents off; also "Share as text" in the S5 sheet)
```
{business}
Credit note CN-000004
For receipt R-000123
3 Nov 2026, 14:05
--------------------
1 x Whey 1kg (Chocolate)
                    45,000
--------------------
Refund total    TSh 45,000
Refunded by Cash    45,000
--------------------
Refund given by {business}.
Not a TRA fiscal receipt.
```
SW uses the same structure with SW labels (`Hati ya marejesho`, `Kwa risiti`, `Jumla ya marejesho`, `Imerejeshwa kwa Taslimu`, `Imepunguzwa kwenye deni`). Credit sale: "Taken off the balance" line. ≤32 characters per line where possible (S3 rule).

### 6.5 Language
`?lang=en|sw` as S5. SW dates use 12-hour + day part (`3 Nov 2026, 2:05 mchana`). Every label is in both languages (§8.6).

---

## 7. Accessibility

- **Targets**: mobile ≥48dp (steppers, restock switch row, reason pills, method pills, card rows ≥56dp, overflow menu items); portal ≥44px (`min-h-11` on every button, number inputs, switches, chips).
- **Semantics labels (Flutter web tree)**, every actionable control:

| Control | Label |
|---|---|
| Refund items | `vendor.refunds.open` "Refund items from {number}" |
| Refund everything | `vendor.refunds.refundAll` |
| Stepper + / − | `vendor.refunds.increase` / `decrease` {name}; value "{qty} of {refundable} to refund" (`vendor.refunds.a11y.qtyValue`) |
| Restock switch | "Put {name} back in stock" (`vendor.refunds.a11y.restock`), with on/off state |
| Reason pills | text + selected state, in a mutually exclusive group |
| Method pills | S3 labels + selected state |
| Review / Confirm | include the amount |
| Refund row | merged `vendor.refunds.rowLabel` "Credit note {number}, {amount}, {date}, {status}" |
| Undo | `vendor.refunds.a11y.undo` "Undo refund {number}" |
| Share | S5 labels with "credit note {number}" |

- **Live regions**: the money summary (Refund total / Pay back) is polite and updates as quantities change. Errors (`refund_exceeds_sold`, stock on undo) are assertive. "Refund saved {number}" is polite.
- **Focus order**: §4.2 / §5.2. After saving → the credit-note heading. After a 409 → the first highlighted line. After undo → the status heading.
- **Contrast** ≥4.5:1 light and dark. "Pay back" uses success700 on light with the words, never colour alone. Undone/struck amounts also carry the word "Undone". Volt only in dark, never as text on light.
- **Text scale 200%**: line cards stack name / counts / stepper / amount; summary rows put the amount under the label; the sticky Review button grows in height (never clips); the portal table becomes cards below `md`.
- **Swahili length**: see §8.9.

---

## 8. Strings (EN + SW; every SW string is a DRAFT for native review)

Terms: refund = **marejesho**; credit note = **hati ya marejesho**; receipt = **risiti**; invoice = **ankara**; undo a refund = **tendua marejesho** (draft; "batilisha" stays for voiding sales/documents, glossary); put back in stock = **rudisha kwenye Stock** (Stock stays English); pay back = **mrudishie mteja**; balance owed = **deni**; served by = **Mhudumu**; no connection = **Hakuna intaneti**. Reused: S3 `vendor.pos.method.*`, `vendor.pos.reference*`, `vendor.pos.err.notAllowed`, `vendor.sales.voidHasRefunds` (**add to mobile i18n; exists in portal**), `vendor.sales.noAccess`; S5 `doc.*`; `error.network`, `common.*`. Placeholders: `{number} {amount} {name} {n} {sold} {refunded} {refundable} {qty} {available} {time} {date} {reason} {method} {business}`.

### 8.1 Sale detail
| Key | EN | SW (draft) |
|---|---|---|
| vendor.refunds.section | Refunds | Marejesho |
| vendor.refunds.open | Refund items | Fanya marejesho |
| vendor.refunds.badgePartial | Part refunded | Imerejeshwa sehemu |
| vendor.refunds.badgeFull | Refunded | Imerejeshwa yote |
| vendor.refunds.refundsRow | Refunds | Marejesho |
| vendor.refunds.netAfter | Total after refunds | Jumla baada ya marejesho |
| vendor.refunds.lineRefunded | {n} refunded | {n} zimerejeshwa |
| vendor.refunds.rowLabel | Credit note {number}, {amount}, {date}, {status} | Hati ya marejesho {number}, {amount}, {date}, {status} |
| vendor.refunds.fully | Everything on this sale has been refunded. | Kila kitu kwenye mauzo haya kimerejeshwa. |
| vendor.refunds.queuedNo | Sync this sale first. Refunds need a receipt number. | Tuma mauzo haya kwanza. Marejesho yanahitaji namba ya risiti. |
| vendor.refunds.askOwner | Only the owner or an admin can refund this sale. | Mmiliki au admin pekee anaweza kufanya marejesho ya mauzo haya. |
| vendor.refunds.offline | Refunds need an internet connection. Nothing was changed. | Marejesho yanahitaji intaneti. Hakuna kilichobadilishwa. |
| vendor.refunds.unavailable | Refunds aren't available right now. | Marejesho hayapatikani kwa sasa. |
| vendor.refunds.status.active | Refunded | Imerejeshwa |
| vendor.refunds.status.reverted | Undone | Imetenduliwa |

### 8.2 Refund screen
| Key | EN | SW (draft) |
|---|---|---|
| vendor.refunds.title | Refund from {number} | Marejesho ya {number} |
| vendor.refunds.close | Close refund | Funga marejesho |
| vendor.refunds.loading | Loading the sale | Inapakia mauzo |
| vendor.refunds.loadFailed | Could not load this sale. | Imeshindikana kupakia mauzo haya. |
| vendor.refunds.pickItems | What is the customer bringing back? | Mteja anarudisha nini? |
| vendor.refunds.refundAll | Refund everything left | Rejesha zote zilizobaki |
| vendor.refunds.soldRefunded | Sold {sold} · refunded {refunded} | Ziliuzwa {sold} · zimerejeshwa {refunded} |
| vendor.refunds.lineAllDone | All refunded | Zote zimerejeshwa |
| vendor.refunds.qtyLabel | Quantity to refund for {name} | Idadi ya kurejesha ya {name} |
| vendor.refunds.increase | Refund one more {name} | Ongeza moja ya kurejesha, {name} |
| vendor.refunds.decrease | Refund one fewer {name} | Punguza moja ya kurejesha, {name} |
| vendor.refunds.a11y.qtyValue | {qty} of {refundable} to refund | {qty} kati ya {refundable} za kurejesha |
| vendor.refunds.restock | Put back in stock | Rudisha kwenye Stock |
| vendor.refunds.a11y.restock | Put {name} back in stock | Rudisha {name} kwenye Stock |
| vendor.refunds.restockOff | Off: damaged or not returned. It stays out of stock. | Imezimwa: imeharibika au haijarudishwa. Haitarudi kwenye Stock. |
| vendor.refunds.reason | Reason (required) | Sababu (lazima) |
| vendor.refunds.reason.returned | Customer returned it | Mteja ameirudisha |
| vendor.refunds.reason.faulty | Faulty or damaged | Ina hitilafu au imeharibika |
| vendor.refunds.reason.wrong | Wrong item | Bidhaa isiyo sahihi |
| vendor.refunds.reason.mind | Changed their mind | Amebadilisha mawazo |
| vendor.refunds.reason.other | Other | Nyingine |
| vendor.refunds.reasonMissing | Say why you are refunding. | Eleza kwa nini unafanya marejesho. |
| vendor.refunds.selectSome | Choose at least one item. | Chagua angalau bidhaa moja. |
| vendor.refunds.moneyBack | Money back | Pesa ya kurudisha |
| vendor.refunds.total | Refund total | Jumla ya marejesho |
| vendor.refunds.offBalance | Taken off what {name} owes | Kinapunguzwa kwenye deni la {name} |
| vendor.refunds.payBack | Give back to the customer | Mrudishie mteja |
| vendor.refunds.nothingBack | Nothing to give back: the refund comes off what is owed. | Hakuna pesa ya kurudisha: marejesho yanapunguzwa kwenye deni. |
| vendor.refunds.method | How you give the money back | Unarudisha pesa kwa njia gani |
| vendor.refunds.moneyNotice | FitFlex does not handle this money. Give it back to the customer yourself. | FitFlex haishughulikii pesa hii. Mrudishie mteja pesa wewe mwenyewe. |
| vendor.refunds.review | Review refund {amount} | Kagua marejesho {amount} |
| vendor.refunds.discardTitle | Leave without refunding? Your choices will be lost. | Uondoke bila kufanya marejesho? Ulichochagua kitapotea. |
| vendor.refunds.discard | Leave | Ondoka |

### 8.3 Confirm and result
| Key | EN | SW (draft) |
|---|---|---|
| vendor.refunds.confirmTitle | Refund {amount} from {number}? | Ufanye marejesho ya {amount} kutoka {number}? |
| vendor.refunds.confirmBody | A credit note is made and stays in your records. If it was a mistake, you can undo it later. | Hati ya marejesho itatengenezwa na itabaki kwenye kumbukumbu zako. Kama ni kosa, unaweza kuitendua baadaye. |
| vendor.refunds.backInStock | Back in stock | Imerudi kwenye Stock |
| vendor.refunds.notBackInStock | Not back in stock | Haikurudi kwenye Stock |
| vendor.refunds.confirm | Refund {amount} | Rejesha {amount} |
| vendor.refunds.back | Back | Rudi |
| vendor.refunds.saving | Saving refund | Inahifadhi marejesho |
| vendor.refunds.saved | Refund saved: {number} | Marejesho yamehifadhiwa: {number} |
| vendor.refunds.cnTitle | Credit note {number} | Hati ya marejesho {number} |
| vendor.refunds.forInvoice | For invoice {number} | Kwa ankara {number} |
| vendor.refunds.reasonLabel | Reason: {reason} | Sababu: {reason} |
| vendor.refunds.share | Share credit note | Tuma hati ya marejesho |
| vendor.refunds.done | Done | Maliza |

### 8.4 Undo
| Key | EN | SW (draft) |
|---|---|---|
| vendor.refunds.revert | Undo refund | Tendua marejesho |
| vendor.refunds.a11y.undo | Undo refund {number} | Tendua marejesho {number} |
| vendor.refunds.revertTitle | Undo refund {number}? | Utendue marejesho {number}? |
| vendor.refunds.revertBody | {amount} counts as sold again and the credit note shows as cancelled. If you gave money back, the customer needs to return it. | {amount} itahesabiwa kama imeuzwa tena na hati ya marejesho itaonekana imebatilishwa. Kama ulimrudishia mteja pesa, anapaswa kuirudisha. |
| vendor.refunds.revertStock | Items that went back into stock are taken out again. | Bidhaa zilizorudishwa kwenye Stock zitatolewa tena. |
| vendor.refunds.revertCredit | {amount} is added back to what {name} owes. | {amount} itaongezwa tena kwenye deni la {name}. |
| vendor.refunds.revertReason | Reason (required) | Sababu (lazima) |
| vendor.refunds.reverted | Refund {number} undone | Marejesho {number} yametenduliwa |
| vendor.refunds.revertedBy | Undone by {name}, {time}: {reason} | Yametenduliwa na {name}, {time}: {reason} |

### 8.5 Errors
| Key | EN | SW (draft) |
|---|---|---|
| vendor.refunds.err.exceeds | Part of this sale was refunded somewhere else. Check the quantities again. | Sehemu ya mauzo haya imerejeshwa mahali pengine. Angalia idadi tena. |
| vendor.refunds.err.saleVoided | This sale was voided, so it can't be refunded. | Mauzo haya yamebatilishwa, kwa hiyo hayawezi kurejeshwa. |
| vendor.refunds.err.restockUnavailable | {name} was deleted, so it can't go back in stock. Turn off Put back in stock. | {name} imefutwa, kwa hiyo haiwezi kurudi kwenye Stock. Zima Rudisha kwenye Stock. |
| vendor.refunds.err.revertStock | Only {available} of {name} left in stock, so this refund can't be undone. Count the stock first. | Zimebaki {available} tu za {name} kwenye Stock, kwa hiyo marejesho haya hayawezi kutenduliwa. Hesabu Stock kwanza. |
| vendor.refunds.err.alreadyReverted | This refund was already undone. | Marejesho haya yalishatenduliwa. |
| vendor.refunds.err.customerArchived | {name} is archived. Bring them back first, because undoing adds to what they owe. | {name} amewekwa kando. Mrudishe kwanza, kwa sababu kutendua kunaongeza deni lake. |
| vendor.refunds.err.server | Could not save the refund. Nothing was changed. | Imeshindikana kuhifadhi marejesho. Hakuna kilichobadilishwa. |
| vendor.refunds.notFound | This refund is not available. | Marejesho haya hayapatikani. |

Error-code → message: `refund_exceeds_sold` → err.exceeds; `sale_voided` → err.saleVoided; `restock_unavailable` → err.restockUnavailable; `insufficient_stock` (undo) → err.revertStock; `already_reverted` → err.alreadyReverted; `customer_archived` → err.customerArchived; `refund_not_allowed` / `revert_not_allowed` → askOwner; `reference_required` → `vendor.pos.referenceRequired`; `feature_disabled` → unavailable; `refund_not_found` → notFound; anything else → err.server. The raw code is never shown.

### 8.6 Documents (`doc.*`, server templates; mobile native views)
| Key | EN | SW (draft) |
|---|---|---|
| doc.creditNote (exists as `credit_note`) | Credit note | Hati ya marejesho |
| doc.forReceipt (exists) | For receipt {number} | Kwa risiti {number} |
| doc.forInvoice | For invoice {number} | Kwa ankara {number} |
| doc.saleDate | Sold on {date} | Iliuzwa {date} |
| doc.statusIssued | Issued | Imetolewa |
| doc.returnedItems | Returned items | Bidhaa zilizorudishwa |
| doc.refundTotal | Refund total | Jumla ya marejesho |
| doc.balanceReduced | Taken off the balance {amount} | Imepunguzwa kwenye deni {amount} |
| doc.refunded (exists) | Refunded {amount} by {method} | Imerejeshwa {amount} kwa {method} |
| doc.nothingPaidBack | No money paid back. | Hakuna pesa iliyorudishwa. |
| doc.refundGivenBy | Refund given by {business}. | Marejesho yametolewa na {business}. |
| doc.refundsOnSale | Refunds | Marejesho |
| doc.totalAfterRefunds | Total after refunds | Jumla baada ya marejesho |

### 8.7 Stock, reports, sales summary
| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.reason.refund_restock | Refund, back in stock | Marejesho, imerudi kwenye Stock |
| vendor.stock.reason.refund_revert | Refund undone, out of stock again | Marejesho yametenduliwa, imetolewa kwenye Stock |
| vendor.stock.creditNote | Credit note {number} | Hati ya marejesho {number} |
| vendor.reports.methods.paidBack | Paid back by you (refunds) | Uliyorudisha wewe (marejesho) |
| vendor.reports.refunds.type.refund / revert | Refund / Undone | Marejesho / Yametenduliwa |
| vendor.reports.refunds.paidBack | Paid back | Yaliyorudishwa |
| vendor.reports.refunds.offBalances | Taken off balances | Yaliyopunguzwa kwenye madeni |
| vendor.reports.refunds.restocked | Units back in stock | Idadi iliyorudi kwenye Stock |
| vendor.reports.refunds.undoneCount | Undone | Yaliyotenduliwa |
| vendor.reports.refunds.empty | No refunds in {period}. | Hakuna marejesho {period}. |
| vendor.reports.cust.refundedOff | Taken off by refunds: {amount} | Yaliyopunguzwa kwa marejesho: {amount} |
| vendor.sales.refundsLine | Refunds −{amount} · after refunds {net} | Marejesho −{amount} · baada ya marejesho {net} |
| vendor.dash.afterRefunds | after refunds | baada ya marejesho |

CSV: `refundsCsv` gains a "Type / Aina" column.

### 8.8 Push (server, both languages; `partner-notifier.mjs`)
| Type | EN title / body | SW title / body (draft) |
|---|---|---|
| vendor_sale_refunded | Refund {number} on sale {sale} / {who} refunded {amount} on sale {sale}. Reason: {reason} | Marejesho {number} kwenye mauzo {sale} / {who} amefanya marejesho ya {amount} kwenye mauzo {sale}. Sababu: {reason} |
| vendor_refund_reverted | Refund {number} undone / {who} undid refund {number} ({amount}). Reason: {reason} | Marejesho {number} yametenduliwa / {who} ametendua marejesho {number} ({amount}). Sababu: {reason} |
`{who}` falls back to "A staff member" / "Mfanyakazi" (existing pattern).

### 8.9 Swahili overflow
- Longest SW strings: `revertBody` (~150), `err.customerArchived` (~110), `nothingBack` (~85), `moneyNotice` (~80). All sit in `FFAlert`/`Alert`/dialog bodies and wrap.
- Buttons:
  - "Fanya marejesho" (15) and "Tendua marejesho" (16) fit at 375 next to Void; they stack when either would be <120dp (S3 rule).
  - "Rejesha zote zilizobaki" (23) is a full-width ghost button.
  - "Kagua marejesho TSh 125,000" (27) is a full-width sticky button and wraps to 2 lines at 200%.
- The restock switch label "Rudisha kwenye Stock" (20) fits; its helper wraps.
- Badge "Imerejeshwa sehemu" (18) needs `min-width: auto`. Never truncate.
- Portal table header "Idadi iliyorudi kwenye Stock" wraps to 2 lines (min column width 96px).

---

## 9. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `/vendor/tools/options`, `/vendor/me.tools` | `refunds` | **exists**; mobile `VendorTools.refunds` + portal typed field **to add** |
| `VendorSaleRefund`, `VendorSaleRefundLine` | §2.1 | plan; **`balanceReducedTzs`, `paidOutTzs`, `vatTzs`, `clientRef`/`fingerprint`, `sellerSnapshot`, `revertReason`, line `vatTzs`/`vendorId` requested** |
| `VendorSale` | `refundedTzs`, `balanceReducedTzs`; **paid-adds-up CHECK replaced** | **requested (rule 6)** |
| `VendorSaleLine` | `refundedQty`, `refundedTzs`, `refundedVatTzs` | **requested** |
| `POST /vendor/sales/:id/refunds` | §2.2, errors §2.3 | plan has the core; **body without amounts, `restock` per line, error set requested** |
| `POST /vendor/refunds/:id/revert` | body `{reason}`; errors §2.4 | plan has the endpoint; **`reason` body + errors requested** (Q-4) |
| `GET /vendor/refunds`, `GET /vendor/refunds/:id` | §2.5 | **new, requested** |
| Sale view / list / summary | §2.5 additions | **requested (additive; call out)** |
| `POST /vendor/sales/:id/void` | 409 `has_refunds {refunds[]}` (active only) | S3 spec code; **not implemented on RC**; Q-3 |
| Stock movements | `document {type:'refund', id, number}` | **requested** |
| Documents | `credit_note` kind, `creditNoteDocument`, `refundSource`, `POST /vendor/refunds/:id/share`, sale document Refunds block | docType + labels **exist**; rest **requested** |
| Reports | walk-in refund + undo facts rows; refunds rows/totals; `paidBack` group; customers `refundedOffTzs` | route + CSV header **exist**; rest **requested** |
| Customer profile | `totals.shopSalesTzs` net of refunds | **requested** |
| Notifications | `vendor_sale_refunded`, `vendor_refund_reverted` | **new** |
| Audit | `vendor_sale_refunded`, `vendor_sale_refund_reverted` | **new** |
| Settlement | none (spec proves unchanged) | — |

---

## 10. Rule-6 callouts (CLAUDE.md; each PR must list these explicitly)
1. **Money records:** new tables `VendorSaleRefund` / `VendorSaleRefundLine`; new counters on `VendorSale` / `VendorSaleLine`; **replacement of the `vendorsale_paid_adds_up` CHECK**; credit-sale `balanceTzs` changes outside S4's payment code.
2. **Endpoint signatures:** new `POST /vendor/sales/:id/refunds`, `POST /vendor/refunds/:id/revert`, `GET /vendor/refunds[/:id]`, `POST /vendor/refunds/:id/share`; **changed** `POST /vendor/sales/:id/void` (new 409 `has_refunds`); additive fields on the sale view, `/vendor/sales` list and summary, stock movements, report responses and the customer profile.
3. **Stock / check-in-adjacent logic:** new stock movements through the shared product row (restock and conditional re-take on undo).
4. **Not touched:** pricing constants, payout engine, settlement, commission, marketplace orders (D-6), `src/auth/*`. A spec proves settlement output is unchanged.
5. Reviews: security-and-privacy-reviewer (money, M2 rule for refunds, public credit-note document), contract-checker (additive shapes, deploy order functions → portal → mobile), i18n-swahili-auditor.

---

## Open questions — owner accepted every recommendation on 2026-11-03

- **Q-1 Who may refund and undo.** Rec: the same rule security review M2 set for voids. The owner and admin-role staff can refund any completed sale. Other `sales` staff can refund only a sale they recorded, on its EAT sale day, and can undo only their own refund on the day they made it. Staff refunds and undos notify the owner. Why: a cash refund is the same fraud risk as a void (money out of the till). Alt: any `sales` staff may refund any sale up to 30 days old, with the owner notified. Returns are easier at the counter, but the risk is higher.
- **Q-2 Amount-only refunds (no item back, e.g. a goodwill discount after the sale).** Rec: not in v1. The amount is always computed from returned units (M-2), so it can never exceed what was paid and needs no approval. Ask after vendors use it.
- **Q-3 Void after refunds.** Rec: only **active** refunds block a void (`has_refunds`). Undone refunds don't, because their stock was re-taken and the void's full give-back is correct. The S3 wording "only if no refunds exist" is read as "no active refunds".
- **Q-4 Undo needs a reason.** Rec: yes, 3–200 characters, stored and shown (as void). This adds a body to the plan's `POST /vendor/refunds/:id/revert`.
- **Q-5 Credit notes and TRA (VAT-registered vendors).** Counsel to confirm whether a VAT-registered seller's credit note must carry a specific title ("Tax credit note"), the original fiscal receipt number, or EFD/VFD reporting. Rec: until counsel answers, use the title "Credit note", keep "This is not a TRA fiscal receipt.", and handle fiscal credit notes in S10. Legal text stays draft.
- **Q-6 Offline refunds.** Rec: online only (§4.7). Alt: queue refunds like sales. This needs a provisional CN, cross-device over-refund conflicts and a credit-balance check offline. Not worth it for a rare action.

---

## 11. Acceptance criteria (UAT on Flutter web and portal from RC; isolated backend and DB)

Seed accounts and data:
- Vendor owner; staff `vendorRole=admin` with `sales`; staff with `sales` only (role sales); staff without `sales`; staff with `reports`.
- Products with cost price, one without cost, one with variants that track stock, one product later deleted.
- Cash sales: one with a line discount and a sale discount (3 × TSh 3,500 with TSh 500 line discount; plus a second line); a split-payment sale (Cash + M-Pesa); a fully discounted (TSh 0) line.
- A credit sale TSh 100,000 with TSh 20,000 paid now, then PMT 30,000 allocated (balance 50,000).
- A VAT-verified vendor sale with code A and E lines.
- A queued offline sale on the device.

Gating and permissions
- **AC-1** With `refunds: false` (or `walkInSales: false`, or options failing): no Refund items button on mobile or portal, no Undo, `/vendor/sales/:id/refund` goes to the sale detail without a message, and the API answers 404 `feature_disabled` for every refund endpoint.
- **AC-2** With the flag off after refunds were made: the sale still shows the Refunds card, "Total after refunds" and the badge. Refund detail opens read-only (no Share, no Undo). Report totals still include the refunds.
- **AC-3** Flag on, owner: Refund items shows on a completed synced sale with refundable units, and not on a voided, queued or fully refunded sale. Each case shows the specified muted text.
- **AC-4** Staff with `sales` only: can refund their own sale on its sale day. On another person's sale, or their own from yesterday, the button is hidden with "Only the owner or an admin can refund this sale." A crafted request returns 403 `refund_not_allowed` with `reason` `not_own` / `too_old`. Admin staff can refund any sale.
- **AC-5** Staff without `sales`: no refund UI; the API returns 403 `vendor_permission_forbidden`. Vendor B cannot read or refund vendor A's sale or refund (404).

Refund flow and money
- **AC-6** Refund 1 of 3 units of the TSh 10,000-net line → amount TSh 3,333. A second 1 → 3,333. The last → 3,334. The three credit notes add up to exactly the line's net. The app preview equals the server amount each time.
- **AC-7** Refund everything left on a sale with a sale-level discount: Σ credit notes = the sale's `totalTzs` exactly; the sale shows "Refunded" and Total after refunds TSh 0; Refund items disappears.
- **AC-8** A request asking for more units than remain returns 409 `refund_exceeds_sold` with sold/refunded/refundable per line. Nothing is written (no CN number used, no stock moved).
- **AC-9** Two sessions refund the last unit of the same line at once: exactly one succeeds. The other shows "Part of this sale was refunded somewhere else…" with the quantities clamped, and focus moves to the line.
- **AC-10** Restock on: product stock rises by the refunded qty and stock history shows one "Refund, back in stock" row linked to "Credit note CN-…". Restock off: stock unchanged and no ledger row. A variant line returns to that variant's stock.
- **AC-11** A deleted product's line with restock on returns 400 `restock_unavailable`. The switch turns off with the "was deleted" message, and saving then succeeds.
- **AC-12** Method: payback defaults to the sale's first payment method. M-Pesa without a reference keeps Review disabled with "Enter the transaction reference."; Cash needs none. A TSh 0 refund (free item) needs no method and still restocks.
- **AC-13** The money notice "FitFlex does not handle this money. Give it back to the customer yourself." shows on the refund screen, the confirm step and refund detail (mobile and portal).
- **AC-14** Retrying a confirmed refund after a dropped response (devtools offline then retry with the same clientRef) records exactly one refund, one CN number and one ledger row. A different body with the same clientRef returns 409 `client_ref_reused`.
- **AC-15** With the network off, Refund items is disabled with "Refunds need an internet connection…". Losing the connection at Confirm keeps the dialog open with Try again. Nothing is queued on the device (local storage has no refund queue).

Credit sales and customers
- **AC-16** On the credit sale (balance 50,000), refund lines worth 30,000: Taken off what {name} owes 30,000, Give back 0, no method asked. Balance becomes 20,000 in the sale, the customer profile, Owed to you and aging.
- **AC-17** Then refund lines worth 40,000: taken off 20,000 (balance 0), give back 20,000 by the chosen method. The sale leaves Owed to you. The credit note shows both lines ("Taken off the balance TSh 20,000", "Refunded TSh 20,000 by Cash").
- **AC-18** A customer payment recorded while a refund is in progress: the server serialises them; the payment gets `overpayment` with the reduced owed amount when it no longer fits; nothing is double-counted.
- **AC-19** Undoing the 30,000 refund from AC-16 adds 30,000 back to the balance (the message names the customer) and the sale shows in Owed to you again (overdue if past due). On an archived customer, undo returns `customer_archived` with the message and a link.

Undo
- **AC-20** Undo needs a reason. After undo: the status is "Undone" with "Undone by {name}, {time}: {reason}"; restocked units leave stock again with one "Refund undone, out of stock again" ledger row; the sale's Total after refunds goes back up; the CN number stays and its document shows "Cancelled on {date}" (and the PDF watermark).
- **AC-21** A second undo shows "This refund was already undone." (409 `already_reverted`), with no second ledger row.
- **AC-22** Selling the restocked units first, then undoing, returns `insufficient_stock` with "Only {n} of {name} left…" and a Count stock link (for users with `products`). Nothing changes.
- **AC-23** Staff with `sales` only can undo their own refund on the day they made it, and not others' (403 `revert_not_allowed`). A staff refund or undo sends the owner a `vendor_sale_refunded` / `vendor_refund_reverted` notification in their language (server spec; push needs a real device).

Void interplay
- **AC-24** A sale with an active refund has no Void button and shows "This sale has refunds, so it can't be voided." A crafted void returns 409 `has_refunds` listing the CN numbers. After undoing every refund, Void is available and returns the **full** sold quantity to stock exactly once.
- **AC-25** Refund and void racing on one sale: one wins. The other answers `sale_voided` or `has_refunds`. Stock is never counted twice.

Numbers, documents, VAT
- **AC-26** The first refund of a new vendor is CN-000001, then CN-000002, with no gaps, including two refunds by two staff at once and a refund refused mid-way. Another vendor starts at CN-000001. Undo does not free or reuse a number.
- **AC-27** The credit note (mobile view, portal iframe, public link, PDF) shows seller, "Credit note CN-…", "For receipt R-…" (credit sale: "For invoice INV-…"), date, customer name (no phone), returned lines, Refund total, settlement lines and "Refund given by {business}." plus "This is not a TRA fiscal receipt.". It has no reason, no restock flags, no cost (server grep spec).
- **AC-28** On the VAT-verified sale, refunding the whole A line reverses exactly that line's VAT. A partial refund reverses VAT by the same cumulative rule. The VAT summary groups by the sale's snapshot code and rate, even after an admin changes the rate.
- **AC-29** Share credit note opens the S5 sheet (WhatsApp, SMS, Copy link, PDF). With documents off, it shares the §6.4 text in the chosen language. An undone credit note has no Share; its earlier links show Cancelled.
- **AC-30** The sale's receipt/invoice (all four surfaces) lists active refunds and "Total after refunds"; undone ones are not listed.
- **AC-31** English | Kiswahili switch every credit-note label; SW dates use "3 Nov 2026, 2:05 mchana".

Reports
- **AC-32** Sales report for the seed month: walk-in Refunds = Σ active credit notes dated in the month; Net = Gross − Discounts − Refunds in every bucket; units are net of refunded units.
- **AC-33** A refund made in October and undone in November: October is unchanged (Refunds include it); November shows it with the sign flipped, so Refunds falls and Net rises by the same amount. A refund and its undo on the same day net to 0.
- **AC-34** Profit: a restocked refunded unit removes its cost; a non-restocked unit keeps its cost (profit drops by its net revenue only); an uncosted line's refund appears only in the "Sold without a cost price" block.
- **AC-35** Refunds report view (portal and mobile) lists Refund and Undone rows by date with CN, sale, amount (Undone negative), paid back, method and units back in stock. Its totals equal the Sales walk-in Refunds figure. The CSV has the Type column.
- **AC-36** Payment methods shows "Paid back by you (refunds)" as its own group, by method, equal to Σ paid-back amounts. "Collected by you" is unchanged. Balance reductions are not listed as money.
- **AC-37** Vendor settlement, App sales after commission and `/vendor/payments` figures are identical before and after any refund (server spec).
- **AC-38** The Sales tab summary and portal list show "Refunds −{amount} · after refunds {net}" for the range, and "Shop sales today" reads after refunds when the flag is on.

States and layout
- **AC-39** Refund screen states: loading skeleton; load error with Try again; offline "Hakuna intaneti"; partial (already refunded counts shown, only the remainder pickable); fully refunded; voided; queued — each as §4.6. Portal dialog states as §5.4.
- **AC-40** At 375px the mobile refund screen and the portal full-screen dialog show all lines, the summary and the sticky Review button with no horizontal scroll. At ≥900 (Flutter web) Items and Money back sit side by side. At ≥md the portal shows the lines table.

Accessibility and language
- **AC-41** Every control (Refund items, Refund everything, steppers with name and value, restock switches with name and state, reason and method pills with selected state, reference, Review, Confirm, Undo, Share, refund rows) has a screen-reader label in the Flutter web tree / DOM. The money summary is announced as quantities change, and errors are announced assertively.
- **AC-42** Touch targets ≥48dp mobile and ≥44px portal; contrast ≥4.5:1 in light and dark; "Undone", "Refunded" and "Give back" are always in words, not only colour or strike-through.
- **AC-43** Focus moves: dialog open → heading; step change → step heading; error → first invalid field / highlighted line; save → credit-note heading; Escape closes the portal dialog (asking first if picks exist) and returns focus to the trigger.
- **AC-44** In Kiswahili at 375px and 200% text: no clipped text on the sale detail, refund screen, confirm, refund detail, undo dialog, portal dialog, Refunds card or report view. No English except "Stock", "VAT", "PDF", "TZS", method brand names, product names and user-entered text.

Needs a real device (not verifiable on Flutter web): push delivery of the two notifications, the Android share sheet with the credit-note PDF into WhatsApp/SMS, network loss on a real phone during Confirm.

---

## 12. Tests

**Functions** `specs/vendor-sale-refunds.specs.mjs` (isolated CI DB, `FITFLEX_USE_CI_DB=1`, check the DB name):
- **Gating and access:** flags off → 404 for each route; staff without `sales` 403; suspended vendor 403; M2 refund/undo rule (own/same day, admin any); tenancy (vendor B 404).
- **Validation:** every 400 code, `line_not_on_sale`, `duplicate_line`.
- **Rounding:** M-2 cases (1+1+1 of 10,000 = 3,333/3,333/3,334); full refund = lineNet; sale-discount share honoured; the undo-in-the-middle case never exceeds lineNet; zero-net line; DB CHECKs refuse a forced over-refund.
- **VAT:** M-3 cumulative, full refund = line VAT, snapshot rate after a rate change.
- **Credit sales:** M-4 balance first then payout; the CHECK holds after refund, undo, PMT and PMT void in every order; aging and owed follow `balanceTzs`; `customer_archived` on undo.
- **Concurrency:** two refunds racing (one `refund_exceeds_sold`); refund vs void (one wins); refund vs customer payment; undo vs POS sale and app checkout of the same units (`insufficient_stock`, no negative stock).
- **Idempotency and the ledger:** clientRef replay 200 same refund and number; concurrent identical requests → one refund; `client_ref_reused`; exactly one `refund_restock` per (refund, product, variant); exactly one `refund_revert`; no ledger row when restock is off; `variant_gone` fallback.
- **Void and numbering:** void → `has_refunds` with active refunds and allowed after all are undone (full restock once); CN gap-free under concurrency and rollback, per vendor, undo keeps the number.
- **Audit and notifications:** audit rows; notifications only for staff actors (EN/SW).
- **Reports:** walk-in refund and undo facts rows; Net = Gross − Discounts − Refunds per bucket; closed period unchanged after a later undo; profit M-8; refunds report totals = Sales refunds; payment-methods `paidBack`; EAT boundary at 21:30 UTC / 23:59 EAT (avoid the known 21:00–22:00 UTC flake); settlement prepare output identical with walk-in refunds present.
- **Documents:** credit-note JSON/HTML/PDF content; A-02 grep (no phone, reason, cost, restock); reverted → Cancelled banner and watermark, 409 on new share; sale document Refunds block.
- **Migration:** up on a DB with existing sales (CHECK validates); down refuses with refunds present.

**Portal** `tests/e2e/vendor-refunds.spec.ts`:
- gating (flag off, read-only existing refunds)
- permission visibility (owner, admin, own-sale staff)
- refund dialog choose → confirm → toast, panel updates, CN link to the document view
- 409 exceeds handling, undo with reason, `insufficient_stock` message, void hidden with refunds
- 375px full-screen dialog, focus and Escape, axe on the dialog and Refunds card
- reports `view=refunds`

**Mobile** (`test/vendor/`):
- `refund_draft_controller_test.dart`: preview matches M-2/M-3/M-4 for the AC-6/AC-16/AC-17 cases
- `refund_page_test.dart`: steppers capped at refundable, restock default on, method hidden when payback is 0, reference rule, Review disabled reasons, 409 exceeds clamping and focus, offline disabled, no queue written
- `refund_detail_test.dart`: share sheet docType `credit_note`, text share when documents off, undo dialog and errors, undone state
- `sale_detail_refunds_test.dart`: badges, totals after refunds, Refunds card, `canRefundSale` M2 mirror, Void hidden with active refunds
- `vendor_tools_test.dart`: `refunds` parsed and fails closed
- i18n key parity test (EN/SW for every new key)

---

Standing reminders:
- `VENDOR_TOOLS`, `VENDOR_WALKIN_SALES` and `VENDOR_REFUNDS` stay off until the owner says otherwise.
- Walk-in sales and refunds are outside settlement, and vendor settlement has never been exercised by hand.
- Shop (app) payments are manual (D-9), and D-6 (no partial refunds on app orders) stands.
- VAT DR-05 is open; credit-note fiscal rules wait for counsel (Q-5).
- Vendor terms (walk-in money not handled by FitFlex, refunds) are drafts pending Tanzanian counsel.
- All Swahili above is a draft for native review.
