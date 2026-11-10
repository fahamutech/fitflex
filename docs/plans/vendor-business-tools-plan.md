# Vendor business tools — slice plan

Status: APPROVED 2026-10-19 — S1 in progress. Date: 2026-10-19. Author: fitflex-planner.
Read from origin/release-candidate: functions 49011aa, portal add3598, mobile 73425d7.
Owner decisions 2026-10-19 (final, not re-opened): walk-in sales recorded with NO commission and kept out of vendor settlement, same stock pool; VAT planned, TRA EFD/VFD in scope (late phase, dormant); vendors see only the basic buyer info needed to prepare an order, walk-in customers are owned by the vendor; vendor web portal in fitflex-portal reusing vendor identity and staff permissions.
Settled earlier, not re-opened: D-6 no partial refunds on marketplace orders; D-7 vendor paid when every vendor delivered; D-9 manual payment confirmation for shop orders; commission per vendor fixed on the order line.
Reference for patterns (not code): SmartStock (`~/smartstock-project`), e.g. ADR 0014 adjust-stock reason/note/conflict.

## 0. Findings that shape the plan (from RC code)

| # | Finding | Where | Consequence |
|---|---|---|---|
| F1 | Any vendor edit re-queues the product for approval: `upsertProduct` sets `approvalStatus='pending'` when a review field is *present* in the body; the app sends name/description/price/images/variants on every save, so every save delists the product (`listProducts` hides `pending`). | src/services/shop-service.mjs `upsertProduct`; lib/screens/vendor/vendor_home_page.dart `VendorProductForm` | Slice 1 must re-approve only on a real change, or editing cost/reorder level delists products. |
| F2 | `PUT /vendor/products/:id` writes `stock` as an absolute number with no ledger row. A form opened before a buyer's reservation overwrites it. | shop-service.mjs `upsertProduct` | Stock moves only through the adjustment endpoint; old app builds keep working (see S1). |
| F3 | The app sends `variants: [{name}]`, which erases any per-variant `stock` on every save. | vendor_home_page.dart ~l.993 | Fix in the app (S1) and merge by name on the server. |
| F4 | Public endpoints return the raw `Product` row (`/shop/products`, `/shop/products/:id`, `/shop/vendors/:id`, and the shop home feed via `listProducts`). | functions/shop.mjs, shop-service.mjs | Cost price and reorder level go in a private table, never on `Product`. |
| F5 | `vendorView` spreads the whole order: `buyerId`, `buyerRole`, `paymentReference`, `note`, and other vendors' older lines (`item.vendorId == null`). It has no buyer name or phone; the app shows the raw `pickupGymId`. | shop-service.mjs `vendorView` | S2 replaces it with an allowlist (section 3). |
| F6 | `products`, `shopOrders` and `users` are knex-store collections: `filterAsync` loads the whole table. | src/infra/knex-store.mjs | All new tables use dedicated Postgres stores (pattern: src/infra/shop-order-store-pg.mjs), with indexed, vendor-scoped, parameterised queries and SQL aggregates for reports. |
| F7 | `ShopStockMovement.orderId` is NOT NULL, with unique (orderId, productId, variant, reason, cycle). | db/migrations/20261224103000-shop-order-integrity.cjs | S1 makes `orderId` nullable and keeps the double-release guard as a partial unique index. |
| F8 | Staff permissions are copied onto the user at creation (`role admin` = the full list at that time). | shop-service.mjs `createVendorStaff` | Adding `sales`/`purchases` needs a backfill for staff with `vendorRole='admin'`. |
| F9 | No PDF library in functions; B2B invoices are a print view. `share_plus` and `mobile_scanner` are already in the mobile app. | package.json, pubspec.yaml | PDF needs an owner decision (O-4); barcode and share need no new mobile dependency. |
| F10 | Public HTML endpoint precedent: account-recovery uses `PUBLIC_API_URL`, which is still unconfirmed (identity future item F1). | src/services/account-recovery-service.mjs | Share links depend on `PUBLIC_API_URL` being set. |
| F11 | No CI runs on RC (backend-tests.yml filters main/develop). | .github/workflows | Builders run the suite on an isolated, throwaway CI database per slice (`FITFLEX_USE_CI_DB=1`, check the DB name). |

## 1. Cross-cutting

- **Flags (server env, all OFF by default):** umbrella `VENDOR_TOOLS`. A slice flag is on only when the umbrella and the slice flag are both on (Identity V2 pattern in src/shared/feature-flags.mjs). Slice flags: `VENDOR_STOCK_LEDGER`, `VENDOR_PORTAL`, `VENDOR_ORDER_BUYER_CONTACT`, `VENDOR_WALKIN_SALES`, `VENDOR_CUSTOMERS`, `VENDOR_DOCUMENTS`, `VENDOR_VAT`, `VENDOR_REPORTS`, `VENDOR_REFUNDS`, `VENDOR_BARCODES`, `VENDOR_PURCHASES`, `VENDOR_FISCAL` (+ `VENDOR_FISCAL_MODE=off|manual|sandbox|live`). When off, endpoints answer 404 `feature_disabled`; writes that are pure bookkeeping (ledger rows, cost snapshot) are not flagged.
- **Client discovery:** `GET /vendor/tools/options` → `{ stockLedger, portal, buyerContact, walkInSales, customers, documents, vat, reports, refunds, barcodes, purchases, fiscal: 'off'|'manual'|'vfd' }` (precedent: `/auth/options`). Mobile and portal show features from this, so no rebuild is needed to switch them on.
- **Permissions:** existing `products, orders, customers, reports, payments, staff` plus new `sales` (walk-in sales, receipts, refunds) and `purchases` (suppliers, stock-in, payables). Stock adjustments use `products`. Backfill both onto `vendorRole='admin'` staff. Auth change → security-and-privacy-reviewer.
- **Money:** integer TZS, EAT dates (`eatDate` from partner-statement-workflow). Walk-in money never passes through FitFlex: the UI says so, and no PaymentRequest is created.
- **Mobile structure:** new screens in `lib/screens/vendor/<feature>/…`; vendor_home_page.dart (1,467 lines) only gains entry tiles.
- **Migrations:** additive, named after RC's latest (20261227090000); rename at merge if RC has moved.
- **Deploy order per slice:** functions (migration + code, flag off) → portal → mobile → parent submodule re-point. Promotion RC → main only on the owner's go-ahead, in that order.
- **Branches:** the same `feat/<topic>` in every repo the slice touches, from `origin/release-candidate`, PR into `release-candidate`. Parent: `docs/vendor-business-tools` (this plan + design spec).

## 2. Slices

### S1 — Stock history with reasons, per-variant stock, cost price, low stock · `feat/vendor-stock-ledger`
Value: stops overselling and lost counts today; foundation for every later slice.

**Backend**
- Migration `…-vendor-stock-ledger.cjs`:
  - `ShopStockMovement`: `orderId` nullable; add `vendorId`, `kind` (order|adjustment|sale|sale_void|refund|refund_revert|stock_in|stock_in_void), `note` (≤200), `actorId`, `clientRef`, `sourceId`.
  - Replace the unique key with a partial unique (orderId, productId, variant, reason, cycle) WHERE orderId IS NOT NULL; unique (vendorId, clientRef) WHERE clientRef IS NOT NULL; index (vendorId, createdAt).
  - CHECK on reason (reserve, release, count, damaged, expired, lost, found, returned, restock, other, sale, sale_void, refund_restock, refund_revert, stock_in, stock_in_void), added NOT VALID then VALIDATE.
  - New `ProductPrivate` (productId, variant '' default, vendorId, costTzs, reorderLevel, lowStockAlertedAt, updatedAt; PK productId+variant).
  - New `ShopOrderLineCost` (orderId, productId, variant, vendorId, qty, unitCostTzs, createdAt; unique orderId+productId+variant).
  - D-5: validate `product_stock_non_negative` if no row is negative; otherwise print the rows and skip (D-11 pattern).
- Endpoints (new):
  - `POST /vendor/products/:id/stock-adjustments` (products) `{ variant?, reason, quantity, expectedStock? (required for count), direction? ('in'|'out', for other), note? (required for other), clientRef }` → 201 `{ movement:{ id, productId, variant, reason, delta, stockBefore, stockAfter, note, actor:{id,name}, createdAt }, product:{ id, stock, variants } }`. Errors: 409 `stock_changed {currentStock}` (count with a stale expected value), 409 `insufficient_stock {currentStock}`, 400 `invalid_reason|invalid_quantity|note_too_long|note_required`, 403 `not_your_product`; a replayed clientRef returns 200 with the same movement. Runs in one transaction: `Product` row `FOR UPDATE`, conditional update, ledger row; variant stock is moved in the same statement (existing `variantStockAdjusted`).
  - `GET /vendor/products/:id/stock-movements?from&to&limit=50&cursor` → `{ openingStock, closingStock, rows:[…, document:{type,id,number}|null], nextCursor }`.
  - `GET /vendor/stock/low` → `[{ productId, name, variant, stock, reorderLevel }]`.
  - `GET /vendor/tools/options`.
- Changed (**endpoint behaviour, call out in the PR**):
  - `PUT /vendor/products/:id`: with the ledger on, a `stock` that differs from current is written as a `count` adjustment (`note: 'product_form'`), so old app builds keep working and the change is recorded. Incoming `variants` are merged by name and keep a stored numeric `stock` when the body omits it (fixes F3). `costTzs`/`reorderLevel` (and per-variant ones) are accepted and stored in `ProductPrivate`. Re-approval happens only when a review field's value actually changes (fixes F1; moderation gate → security review).
  - `GET /vendor/products` merges in the private fields (vendor only). Public views unchanged; a spec asserts `costTzs` never appears in `/shop/*` or `/shop/home`.
  - On order paid (`orderPaid`, best effort, idempotent): write `ShopOrderLineCost` from `ProductPrivate`. The checkout transaction and `ShopOrder.items` are untouched, as are settlement and pricing.
- Low stock: when a movement takes stock from above `reorderLevel` to at or below it, `notifyVendor(vendorId, 'vendor_low_stock', {productId, variant, stock})` after commit; once per crossing (`lowStockAlertedAt` is cleared when stock goes back above).
- Variant invariant (O-1): when every variant tracks stock, `Product.stock` = sum of variant stocks, kept by the server.

**Mobile** — product form: per-variant rows (name, stock, cost, reorder level), cost price, reorder level; on edit, stops sending `stock`. "Adjust stock" sheet (reason chips, counted vs add/remove, note); stock history screen; low-stock filter and badge; handle `vendor_low_stock` push deep link.

**Portal** — none (comes in S2).

**Tests**
- Functions `specs/vendor-stock-ledger.specs.mjs`: concurrent adjust vs checkout, no oversell; stale count 409; clientRef replay; variant sum; reason CHECK; public views never expose cost; PUT re-approves only on a real change; old-app PUT writes a count row; low-stock fires once per crossing; settlement output unchanged.
- Mobile `test/vendor/stock_adjust_test.dart`, `variant_editor_test.dart`.

**Review** security-and-privacy-reviewer (moderation gate, private fields). **STOP for go-ahead.**

### S2 — Vendor web portal shell and order privacy · `feat/vendor-portal`
Value: owner wants vendors on the web; fixes the F5 leak.

**Backend**
- Portal sign-in: vendor and vendor_staff sign in on the web with number + PIN (`/auth/pin/login`, then `/auth/switch-persona` to the vendor persona; needs `V2_PIN_LOGIN` on the server) or with Google/email via `/auth/firebase/session` (`requestedRole: 'vendor'`). No new token type. New `GET /vendor/me` → `{ vendorId, businessName, userType, vendorRole, permissions[], tools: <options> }`.
- **`GET /vendor/orders` response shape (endpoint-signature change, call out)** — allowlist in section 3. Removing the leaks ships unflagged as a privacy fix (reviewer to confirm); adding buyer name/phone sits behind `VENDOR_ORDER_BUYER_CONTACT`. Keeps `pickupGymId` and adds `pickupGym:{id,name}`.

**Portal** — new area `app/vendor/*`: dashboard (today's sales, low stock, open orders), products (list, stock adjust, history), orders (allowlisted view, status moves), payouts (reuse `src/components/partner-payouts.tsx` with `/vendor/statements`). Shell `vendorNav` is filtered by `permissions`; login gets a "Business sign-in (number + PIN)" method; `handleSuccess` routes vendor → `/vendor`.

**Mobile** — orders tab shows buyer name, tap-to-call phone and pickup gym name when present.

**Tests**
- Functions `specs/vendor-order-view.specs.mjs`: no buyerId/paymentReference/foreign lines; contact only inside the window; staff without `orders` get 403; tenancy between two vendors.
- Portal `tests/e2e/vendor-portal.spec.ts`: login routing, nav filtered by permission, adjust stock, order status move.

**Review** security-and-privacy-reviewer (auth surface, PII). **STOP for go-ahead.**

### S3 — Walk-in sales (cash, split payments, discounts, offline, receipts) · `feat/vendor-walkin-sales`

**Backend**
- Migration: `VendorSale` (id, vendorId, number, kind cash|credit, status completed|voided, customerId null, soldAt, subtotalTzs, discountTzs, vatTzs 0, totalTzs, paidTzs, changeTzs, balanceTzs, dueDate null, clientRef, note, createdBy, voidedBy/At/reason; unique vendorId+clientRef, unique vendorId+number). `VendorSaleLine` (saleId, productId, variant, nameSnapshot, qty, listPriceTzs, unitPriceTzs, discountTzs, unitCostTzs snapshot, vatCode null, vatRatePct 0, vatTzs 0, lineTotalTzs). `VendorSalePayment` (saleId, method cash|mpesa|airtel_money|mixx|halopesa|card|bank|other, amountTzs, reference ≤100, paidAt, recordedBy). `VendorDocumentSequence` (vendorId, docType, next; row-locked → gap-free numbers R-000001).
- Endpoints (permission `sales`):
  - `POST /vendor/sales` `{ clientRef, soldAt, lines:[{productId, variant?, qty, unitPriceTzs?, discountTzs?}], discountTzs?, payments:[{method, amountTzs, reference?}], note? }` → 201 `{ sale }`; replay → 200 with the same sale. Errors: 409 `insufficient_stock {productId, variant, available}`, 409 `payment_short` (cash sale), 400 `discount_exceeds_price|invalid_payment`. Stock leaves through the same conditional update, with ledger reason `sale`.
  - `GET /vendor/sales?from&to&status&cursor`; `GET /vendor/sales/:id`; `POST /vendor/sales/:id/void {reason}` (full revert with `sale_void` restock; only if no refunds exist).
- **No commission, no ShopOrder, no PaymentRequest, no settlement.** A spec proves VendorSettlement `prepare` ignores walk-in sales.

**Mobile** — POS: product search, cart, line and sale discount, split-payment sheet (method + mobile-money reference), change due, receipt screen (shared as text via share_plus until S5), sales history, void. Offline queue on network failure only (SmartStock `offline_sale_queue.dart` pattern): shared_preferences, clientRef UUID, sync on resume and reconnect, conflict list for 409s (O-2). Receipt shows "Waiting to sync" until the server number arrives.

**Portal** — `/vendor/sales` list + detail + void.

**Tests**
- Functions `specs/vendor-walkin-sales.specs.mjs`: shared pool with app reservations under concurrency, idempotent replay, gap-free numbers under concurrency, split payments sum, void restocks once, settlement unaffected.
- Mobile `test/vendor/pos_cart_test.dart`, `offline_sale_queue_test.dart`.
- Portal `tests/e2e/vendor-sales.spec.ts`.

**Review** security-and-privacy-reviewer (new permission, money records). **STOP for go-ahead.**

### S4 — Vendor customers, pay-later, balances and aging · `feat/vendor-customers`

**Backend**
- Migration: `VendorCustomer` (id, vendorId, source manual|marketplace, buyerUserId null, name, phone, email, address, note, archivedAt, createdBy; unique vendorId+buyerUserId where not null). `VendorCustomerPayment` (id, vendorId, customerId, number PMT-…, amountTzs, method, reference, receivedAt, recordedBy, voidedAt). `VendorPaymentAllocation` (paymentId, saleId, amountTzs).
- Marketplace customers are created on the first *paid* order with this vendor and hold only `buyerUserId` + a name snapshot. Phone and address are never copied into the record; they show only on the order inside its window (section 3). Manual (walk-in) customers are owned by the vendor and fully editable.
- Endpoints (permission `customers`): `GET/POST /vendor/customers`, `GET/PUT /vendor/customers/:id` (profile: totals, balance, aging buckets current/1–30/31–60/61–90/90+, walk-in sales, marketplace orders with this vendor), `POST /vendor/customers/:id/payments {amountTzs, method, reference?, allocations?}` (default oldest-due first), `GET /vendor/receivables/aging`. `POST /vendor/sales` gains `customerId` and `kind:'credit'` + `dueDate` (required for credit; `balanceTzs` = total − paid).

**Mobile** — customer picker in POS, add customer, customer profile, record payment, "Owed to you" list.

**Portal** — `/vendor/customers` list/profile, aging table.

**Tests**
- Functions `specs/vendor-customers.specs.mjs`: A-02 fields, tenancy, allocation FIFO, aging boundaries in EAT, over-payment refused or credited (O-8).
- Portal e2e `vendor-customers.spec.ts`; mobile `customer_payment_test.dart`.

**Review** security-and-privacy-reviewer (PII, data ownership). **STOP for go-ahead.**

### S5 — Invoices and receipts: share links, PDF, WhatsApp/SMS, VAT · `feat/vendor-documents`

**Backend**
- Migration: `VendorDocumentLink` (id, vendorId, docType receipt|invoice|credit_note|order_invoice, docId, tokenHash sha256, createdBy, createdAt, revokedAt, expiresAt null). `VendorTaxProfile` (vendorId, vatRegistered, tin, vrn, pricesIncludeVat default true, verifiedBy/At). `TaxRate` (code A/B/C/D/E-style, pct, effectiveFrom, effectiveTo, maker/checker). Product-side VAT code in `ProductPrivate.vatCode`.
- Endpoints:
  - `POST /vendor/sales/:id/share` and `POST /vendor/orders/:id/share` → `{ url, whatsappText, smsText }` (token: 128-bit random, returned once, only the hash stored).
  - Public `GET /d/:token` (HTML, `?lang=sw`, `noindex`, `Cache-Control: no-store`, rate-limited) and `GET /d/:token.pdf`; `POST /vendor/documents/:id/revoke`.
  - `GET/PUT /vendor/tax-profile`; admin `GET/PUT /admin/tax-rates` (scope `payments`, maker ≠ checker).
  - `GET /me/shop-orders/:id/invoice` gains `?format=html|json` (additive; text stays the default). For a multi-vendor order: one document per vendor.
- VAT (`VENDOR_VAT`): sale lines get vatCode/rate/vatTzs at sale time from `TaxRate` + `VendorTaxProfile`; prices VAT-inclusive; VAT summary block on documents. VAT appears on vendor documents only; marketplace pricing and commission are unchanged (DR-05, O-10).
- Document content: vendor business name, address, contact, TIN/VRN (if verified), number, date, customer name (no phone), lines, discounts, VAT, payments, balance, fiscal block (S10). Bilingual labels.

**Mobile** — share sheet: WhatsApp (`wa.me` with text + link), SMS (device `sms:` intent), copy link, open PDF; tax profile screen.

**Portal** — document view + print, share link copy, `/vendor/settings/tax`; `/admin/tax-rates`.

**Tests**
- Functions `specs/vendor-documents.specs.mjs`: token not guessable, hash only, revoke, no phone on the public page, VAT rounding per line vs total, Swahili rendering.
- Portal e2e `vendor-documents.spec.ts`.

**Review** security-and-privacy-reviewer (public unauthenticated endpoint; VAT rates are pricing constants). **STOP for go-ahead.**

### S6 — Vendor reports + CSV/PDF export · `feat/vendor-reports`

**Backend** (permission `reports`; SQL aggregates, EAT, `channel=app|walk_in|all`):
- `GET /vendor/reports/sales?from&to&groupBy=day|week|month` (gross, discounts, VAT, net of voids/refunds; app vs walk-in).
- `/vendor/reports/products` (best/slow sellers: qty, revenue, last sold, days of cover).
- `/vendor/reports/stock-value` (at cost and at retail; "cost unknown" count).
- `/vendor/reports/profit` (revenue − cost snapshot from `VendorSaleLine.unitCostTzs` and `ShopOrderLineCost`; lines without cost reported separately, never assumed zero).
- `/vendor/reports/refunds` (from S7; empty until then).
- `/vendor/reports/marketplace-net` (gross, commission, payout, settled vs unsettled from order-line `commissionTzs`/`vendorPayoutTzs`; read-only, reconciles with VendorSettlement).
- All accept `?format=csv|pdf`.
- `GET /vendor/payments` gains additive `net*` fields (call out: read-only use of `vendorShareOfOrder`, payout engine unchanged).

**Portal** — `/vendor/reports` (main home for reports): period picker, charts, export.

**Mobile** — compact report cards + export share.

**Tests**
- Functions `specs/vendor-reports.specs.mjs`: totals match line sums; marketplace-net equals a prepared VendorSettlement for the same week; EAT day boundaries (avoid the known 22:00 UTC flake pattern); CSV injection escaped.
- Portal e2e `vendor-reports.spec.ts`.

**STOP for go-ahead.**

### S7 — Partial and revertible refunds on walk-in sales · `feat/vendor-sale-refunds`
- Migration: `VendorSaleRefund` (id, vendorId, saleId, number CN-…, status active|reverted, reason, method, reference, amountTzs, createdBy, revertedBy/At) + `VendorSaleRefundLine` (refundId, saleLineId, qty, amountTzs, restock bool).
- Endpoints (`sales`):
  - `POST /vendor/sales/:id/refunds {clientRef, lines:[{saleLineId, qty, restock}], method, reference?, reason}` → 201; 409 `refund_exceeds_sold`.
  - `POST /vendor/refunds/:id/revert` → re-takes stock (409 `insufficient_stock` if gone) and re-opens the amount.
  - For credit sales, a refund reduces the balance instead of paying out.
- Marketplace orders are out of scope (D-6 stands).
- Mobile refund flow on the sale; portal refund/revert on the sale detail; credit-note document in S5's renderer.
- Tests: over-refund, double revert, restock ledger once, reports net of refunds.
- **Review:** security-and-privacy-reviewer (money). **STOP for go-ahead.**

### S8 — Barcode scanning · `feat/vendor-barcodes`
- Migration: `ProductCode` (vendorId, productId, variant, code; unique vendorId+code).
- `PUT /vendor/products/:id` accepts `barcodes` (additive); new `GET /vendor/products/lookup?code=` → `{ productId, variant, name, priceTzs, stock }`.
- Mobile: scan to add to the POS cart, scan in stock count and stock-in (mobile_scanner already a dependency; on Flutter web the camera needs a real device).
- Tests: code unique per vendor (two vendors may share an EAN), lookup tenancy.
- **STOP for go-ahead.**

### S9 — Suppliers, stock-in (receive stock), payables with instalments · `feat/vendor-purchases`
- Migration: `VendorSupplier`; `VendorPurchase` (number GRN-…, supplierId, receivedAt, totalTzs, paidTzs, status received|voided, clientRef); `VendorPurchaseLine` (productId, variant, qty, unitCostTzs); `VendorPurchaseInstalment` (dueDate, amountTzs, paidAt, method, reference).
- Endpoints (`purchases`):
  - `GET/POST/PUT /vendor/suppliers`.
  - `POST /vendor/purchases` (stock in with ledger reason `stock_in`; updates `ProductPrivate.costTzs` per O-9).
  - `POST /vendor/purchases/:id/void` (reverses if stock allows).
  - `POST /vendor/purchases/:id/instalments`, `/…/instalments/:iid/pay`; `GET /vendor/payables/aging`.
- Payables are tracked only: FitFlex moves no money.
- Mobile receive-stock flow (with scan); portal suppliers, purchases, payables aging.
- Tests: cost update rule, void reversal, instalment sums, tenancy.
- **Review:** security-and-privacy-reviewer (money records). **STOP for go-ahead.**

### S10 — TRA fiscal receipts (EFD/VFD), dormant · `feat/vendor-fiscal`

**What VFD requires** — from the planner's own knowledge, NOT verified online; confirm with TRA, an approved provider, or counsel before building:
- Each taxpayer TIN is registered with TRA for a VFD. TRA issues a client certificate (.pfx + password) and registration details (registration id, serial/UIN, receipt code prefix, routing key, token username/password).
- Receipt posting (XML) is signed SHA1withRSA with the TIN's private key, and posted with a bearer token. Each receipt carries a receipt number, daily counter, global counter, Z-number (date) and a verification code. VAT is grouped by TRA tax codes (A standard 18%, B special, C zero-rated, D special relief, E exempt).
- A daily Z-report is posted per device.
- The receipt shows a QR / verification URL on TRA's verify site built from the verification code and time.
- Offline: receipts are numbered locally and posted when back online within TRA's time limit (limit to confirm).
- Which taxpayers must use EFD/VFD (VAT-registered and turnover thresholds): confirm with counsel.

**Provider options**
- (a) Manual fiscal reference: the vendor keeps their own EFD machine and types its receipt number/verification code into FitFlex. Cheapest, no credential custody.
- (b) TRA-approved VFD service provider API (names from TRA's published list; owner to obtain).
- (c) FitFlex registers as a VFD integrator with TRA and holds each vendor's certificate.

**Recommendation:** ship (a) first, then an adapter for (b); (c) only with counsel's advice.

**Backend**
- `FiscalProvider` port `{ register, issueReceipt, zReport, verifyUrl }`; modes off|manual|sandbox|live.
- `VendorFiscalRegistration` (vendorId, tin, provider, status, encrypted credentials ref; secrets in the backend secret store, never in env per vendor).
- `FiscalReceipt` (docType, docId, vendorId, rctNum, dc, gc, znum, verificationCode, verifyUrl, status queued|posted|failed|manual, attempts, lastError, payloadHash).
- Retry job; daily Z-report job; S5 documents show the fiscal block and QR.
- Endpoints `GET/PUT /vendor/fiscal`, `POST /vendor/sales/:id/fiscal-reference` (manual mode); admin `GET /admin/fiscal/failures`.

**Env:** `VENDOR_FISCAL_MODE`, `VFD_PROVIDER`, `VFD_BASE_URL`, `FISCAL_CREDENTIALS_KEY` (encryption at rest).

**Tests:** provider stub; signing with a test cert; queue retry and idempotency; offline numbering continuity.

**Review:** security-and-privacy-reviewer (TINs, certificates, legal). **STOP for go-ahead.**

## 3. What a vendor sees of a marketplace order (privacy rule, A-02)

Allowed fields:
- Order id/reference, placed date, combined status, own fulfilment status, own timeline, next statuses.
- Own lines only: productId, name, variant, qty, priceTzs, image, commissionTzs, vendorPayoutTzs. Own subtotal.
- paymentStatus and paymentMethod; deliveryMethod; the buyer's order note.
- `pickupGym {id, name}`.
- `buyer {customerId (vendor-scoped), displayName}`.
- While the vendor's own fulfilment is open (paid, not cancelled) and for 7 days after delivery (O-3): `deliveryAddress` (no flag — live app builds need it to deliver; decided 2026-10-19), and, only with `VENDOR_ORDER_BUYER_CONTACT`, `buyer.phone` and `buyer.contactVisibleUntil`.
- Short reference: `shortRef` (last 6 characters of the order id, uppercase).

Never shown: buyerId, buyerRole, email, paymentReference, other vendors' lines or totals, older lines without a vendorId, internal fields.
Walk-in customers: entered and owned by the vendor; FitFlex staff see them only for support/legal (to be written into vendor terms — draft, counsel).

## 4. Swahili (glossary: Stock stays English; ankara, risiti, marejesho, muuzaji, bidhaa)

New namespaces `vendor.stock.*`, `vendor.pos.*`, `vendor.customers.*`, `vendor.documents.*`, `vendor.reports.*`, `vendor.refunds.*`, `vendor.purchases.*`, `vendor.fiscal.*` in lib/shared/i18n.dart and src/lib/i18n.ts; server notification `vendor_low_stock` in both languages. Drafts below, marked for native review:

| Key | EN | SW (draft) |
|---|---|---|
| vendor.stock.adjust | Adjust stock | Rekebisha Stock |
| vendor.stock.reason.count | Counted | Imehesabiwa |
| vendor.stock.reason.damaged | Damaged | Imeharibika |
| vendor.stock.reason.expired | Expired | Muda wake umeisha |
| vendor.stock.reason.lost | Lost | Imepotea |
| vendor.stock.reason.found | Found | Imepatikana |
| vendor.stock.reason.returned | Returned | Imerudishwa |
| vendor.stock.reason.restock | Restocked | Stock imeongezwa |
| vendor.stock.reason.other | Other | Nyingine |
| vendor.stock.changed | Stock changed while you were counting. Count again. | Stock imebadilika ulipokuwa ukihesabu. Hesabu tena. |
| vendor.stock.low | Low stock | Stock inakaribia kuisha |
| vendor.stock.reorderLevel | Reorder level | Kiwango cha kuagiza tena |
| vendor.costPrice | Cost price | Bei ya kununua |
| vendor.pos.title | Shop sale | Mauzo ya dukani |
| vendor.pos.payLater | Pay later | Lipa baadaye |
| vendor.pos.dueDate | Due date | Tarehe ya mwisho ya kulipa |
| vendor.pos.change | Change | Chenji |
| vendor.pos.waitingSync | Waiting to sync | Inasubiri kutumwa |
| vendor.documents.receipt / invoice / creditNote | Receipt / Invoice / Credit note | Risiti / Ankara / Hati ya marejesho |
| vendor.customers.owed | Owed to you | Unachodai |
| vendor.reports.profit | Profit | Faida |
| vendor.purchases.supplier | Supplier | Msambazaji |
| vendor.purchases.receive | Receive stock | Pokea Stock |
| vendor.fiscal.receipt | Fiscal receipt (TRA) | Risiti ya kodi (TRA) |

## 5. Decisions — owner accepted all recommendations below on 2026-10-19

| # | Decision | Recommendation |
|---|---|---|
| O-1 | Variant stock: product stock = sum of variants when all variants track stock | Yes, server-maintained |
| O-2 | An offline sale syncs after stock ran out | Refuse (409) and show it in a conflict list for the vendor to fix (count, then retry); no negative stock (keeps D-5) |
| O-3 | Buyer phone/address window | While the vendor's part is open + 7 days after delivery; display name always |
| O-4 | PDF | Add `pdfkit` to functions (new dependency) for receipts/invoices/report exports; print view as fallback |
| O-5 | Share-link life | No expiry, revocable by the vendor; token hashed |
| O-6 | Numbering | Per vendor, per document type, continuous (R-, INV-, CN-, PMT-, GRN-); no yearly reset (VFD counters are separate) |
| O-7 | SMS share | Device SMS intent only; no Beem cost to FitFlex |
| O-8 | Over-payment on a customer | Refuse in v1 (no customer credit balance) |
| O-9 | Cost update on stock-in | Last purchase cost; weighted average later if asked |
| O-10 | Commission for VAT-registered vendors | Keep on VAT-inclusive gross until DR-05 is decided; flag to finance |
| O-11 | Seller of record on app orders (who issues the invoice/fiscal receipt) | The vendor; FitFlex invoices its commission to the vendor (ties to DR-05) |
| O-12 | VAT registration proof | The vendor enters TIN/VRN; shown on documents only after a KYC reviewer verifies the VRN certificate |
| O-13 | VFD route | Manual fiscal reference first, then an approved-provider adapter; FitFlex as integrator only on counsel's advice |
| O-14 | Discount and price override by staff | Allowed with `sales`, audited, no approval step in v1 |
| O-15 | Vendor leaves: walk-in customer data | Export then delete after a retention period set by counsel |

## 6. Risks
- Concurrency: stock adjustments, walk-in sales and app reservations write the same row. Every write is a conditional update in one transaction with a ledger row; specs cover races.
- The F1/F2 fixes change live vendor behaviour (approval queue, stock writes from old builds); old builds keep working via the count fallback.
- knex-store full-table loads: new code must not use `filterAsync` on orders/products for vendor views or reports.
- Public share links carry personal data: hash, noindex, no-store, rate limit, revocation; `PUBLIC_API_URL` still unconfirmed.
- VFD credential custody and fiscal liability; requirements unverified (see S10).
- Scope size: about 10 slices × 3 repos; Swahili volume large; vendor_home_page.dart monolith.
- Flutter web UAT cannot cover camera (barcode), push (low stock) or offline on a real device: "needs a real device".

## 7. Standing reminders
- Vendor settlement is built but has never been exercised by hand.
- Shop payments are manual (D-9, no provider for shop orders).
- D-5 (stock constraint), D-11, D-12 and `SHOP_RESERVATION_EXPIRY` are still open; `SHOP_REQUIRE_VARIANT` is off.
- VAT DR-05 is open.
- Legal and vendor terms are drafts pending Tanzanian counsel; vendor tools need new terms text (data ownership, walk-in money not handled by FitFlex, fiscal duties).
- Every flag above stays off until the owner says otherwise.
