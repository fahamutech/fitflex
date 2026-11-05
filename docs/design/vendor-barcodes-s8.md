# Barcode scanning (S8): design spec

Status: DRAFT 2026-11-05. Waiting for the owner's answers to Q-1..Q-5. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §1 (flags `VENDOR_TOOLS` + `VENDOR_BARCODES`, `/vendor/tools/options.barcodes`, permissions, EAT), S8 (`ProductCode` vendorId, productId, variant, code; unique vendorId + code; `PUT /vendor/products/:id` accepts `barcodes` (additive); `GET /vendor/products/lookup?code=` → `{ productId, variant, name, priceTzs, stock }`; scan in the POS cart, stock count and stock-in; `mobile_scanner` already a dependency; on Flutter web the camera needs a real device), §6 (Flutter web UAT cannot cover the camera), §7.
Builds on: `vendor-stock-ledger-s1.md` (product form §1, variants, adjust sheet §2), `vendor-walkin-sales-s3.md` (POS §2, the reserved scan slot in the search field, Enter-in-search for USB scanners §2.2, offline cache and queue §6), `vendor-purchases-s9.md` (Receive stock §4.2–4.3, which left scanning to S8; format and Q-n style), `vendor-refunds-s7.md`. Components, states and strings from those specs are reused. This spec overrides them only where it says so.

Read from `origin/release-candidate` (read only): functions 4917d84, portal 581c777, mobile b52f63c.

Platforms: Flutter (Android, iOS, Flutter web) for scanning with the camera, plus USB/keyboard scanners on Flutter web. Next.js portal for entering codes and USB/keyboard scanning in Receive stock. Roles: `vendor`, and `vendor_staff` with `products`, `sales` or `purchases` depending on the surface (§0.3).

---

## What already exists in code (so builders don't duplicate it)

| Area | Exists on RC | S8 still has to add |
|---|---|---|
| Flag | `VENDOR_BARCODES` is in `VENDOR_TOOLS_FLAGS`. `vendorToolsOptions().barcodes = vendorToolsFlag('VENDOR_BARCODES')` (umbrella + slice), so `/vendor/tools/options` and `/vendor/me.tools` already carry `barcodes` (`src/shared/feature-flags.mjs` l.220–257; samples in `functions/shop.mjs` l.169, l.180) | A `vendorBarcodesOn()` helper that **also needs `VENDOR_STOCK_LEDGER`** (§0.2). `barcodes` changes meaning to match (**call out**). Mobile `VendorTools` (`lib/screens/vendor/stock/stock_options.dart`) has **no `barcodes` field**. Portal `VendorTools` (`src/lib/api.ts`) has only the index signature, so add a typed `barcodes?: boolean` |
| Product code storage | **None.** No `ProductCode` table, no `barcode` column. `Product.sku` (text, ≤ 100, free, **not unique**) is on the public `Product` row, so `/shop/products` returns it, and public search matches it (`shop-service.mjs` l.292) | The `ProductCode` table (§2.1). Codes are never put on `Product` or inside `Product.variants` |
| Product save | `upsertProduct` → `upsertProductCore` (flash-sale price lock) → `upsertProductFields`. With the ledger on, edits go through `stockLedger.applyProductForm({decide})` and creates through `stockLedger.createProduct` (`src/infra/vendor-stock-store-pg.mjs` l.171, l.468): one transaction under the product row lock | Write codes **inside** those two transactions (§2.3). This is why S8 needs the ledger flag |
| Approval gate | `PRODUCT_REVIEW_FIELDS = name, description, category, brand, images, variants` (`shop-service.mjs` l.45). `reviewChanged` compares variants by `publicShape` = every key except `stock` and the private keys (`src/shared/vendor-stock.mjs`). `validateProductInput` does **not** refuse unknown keys on a variant object, so they would be stored on the public row and would re-queue review | `barcodes` / `addBarcodes` are top-level body fields, so they are not review fields and do not re-queue approval. A `barcodes` key inside a variant object is refused (§2.3) |
| Variant model | `Product.variants = [{ name, stock? }]`, merged by name on save. Tracked variants = every variant has a numeric `stock`, product stock = sum (O-1). Private cost/reorder per variant in `ProductPrivate (productId, variant)` | Codes refer to a variant by name (`''` = the whole product), the same as `ProductPrivate` |
| Product list | `GET /vendor/products` uses `requireProductListAccess`: staff with `products` or `sales`, or `purchases` while S9 is on, with the suspended-vendor rule (`functions/shop.mjs` l.55–75) | Add `barcodes` to each product (flag on). Reuse the same guard for the lookup |
| Product delete | `deleteProduct` soft-deletes (`deletedAt`, `status archived`) through the knex store | A code held by a deleted product is free (§1 B-7) |
| Smart import (functions#326) | The products and inventory CSVs have **no barcode field**. The header `barcode` (and `code`, `itemcode`, `productcode`, `msimbo`) is a **synonym for `sku`** (`src/shared/vendor-import-rules.mjs` l.35, l.42). SKUs may repeat (`sku_ambiguous`) | Nothing in S8. The SKU fallback in the lookup (§1 B-9) makes imported "barcode" columns scannable. A real barcode import column is Q-4 |
| Rate limit | `createVendorLimiter`, `limitOrNull` (`src/shared/vendor-rate-limit.mjs`) | Two limiters for the lookup (§2.4) |
| Mobile camera | `mobile_scanner: ^6.0.2` (lock 6.0.11). Used by `member_scan_gym_page.dart` and `owner_qr_scanner_page.dart`: `MobileScannerController`, `onDetect`, `errorBuilder`, and `OwnerScanCameraError` (denied / unsupported / error, Try again, a manual way out). **On Flutter web, mobile_scanner loads ZXing from `https://unpkg.com/@zxing/library@0.21.3` at run time** (`zxing_barcode_reader.dart` l.55). `setBarcodeLibraryScriptUrl` can point it at a self-hosted copy | A vendor scanner widget (§4). The script source is Q-3 |
| Mobile POS | `pos_page.dart`: product list cached per vendor (`session.saveProducts`), works offline. `_enterInSearch` adds the single match or the exact-SKU match on Enter ("web; also USB scanners", l.1011). The search field's trailing slot is reserved for S8 (S3 §2.1). Haptic `selectionClick` and a polite announcement on add | A scan button, scan panel, and code matching in `_enterInSearch` (§5.1). The offline cache allowlist gains `barcodes` (§7) |
| Mobile Receive stock | `receive_stock_page.dart`: product picker with search by name or SKU (l.1526–1604). No scan (S9 §4.3) | Scan button + panel (§5.2) |
| Mobile product form | `VendorProductForm` (`vendor_home_page.dart` l.2350+) with a free SKU field (`vendor-product-sku`) sent on every save | A Barcodes section (§5.4) |
| Mobile adjust sheet | `adjust_stock_sheet.dart` (`openAdjustStock`), one product at a time | Opened from a scan, and "Count by scanning" (§5.3) |
| Portal camera | `src/components/qr-scanner.tsx` uses `jsQR`: **QR only**, it cannot read EAN/UPC/Code 128 | Nothing. No camera scanning in the portal (§6.4) |
| Portal POS | **None.** Walk-in sales are recorded in the app (S3 §7.1) | Nothing |
| Portal products | `app/vendor/products/page.tsx`: list + Adjust stock dialog. Adding and editing products stays in the app (`vendor.products.editInApp`, S2 Q-6) | A Barcodes dialog per product (§6.1) |
| Portal Receive stock | `src/components/vendor/purchases/receive-stock.tsx` `ProductCombobox`: search by name or SKU; Enter picks the highlighted hit | Exact code/SKU match on Enter (§6.2) |
| Strings | `ownerScan.camera.*` (EN + SW), `vendor.sku`, `vendor.pos.*`, `vendor.purchases.*`. Glossary: Scan = **skani** (decided) | `vendor.barcodes.*`, `vendor.scan.*` (§10) |

No table, route or screen for barcodes exists on RC.

---

## Ground rules

- **A barcode is the vendor's private shop data.** It is never on the public `Product` row, in `/shop/*` responses, in public search, in the shop home feed, in moderation, or on receipts and documents.
- **Codes never re-queue approval.** Adding or removing a code leaves `approvalStatus` and listing as they are.
- **One code means one thing within a vendor.** It belongs to one product (or one variant of it). Two vendors may use the same EAN, and neither can find out about the other.
- **Scanning only fills in what the user would otherwise tap.** A scan adds to a cart, a delivery or a count. Nothing is sold, received or saved until the user confirms on the normal button of that screen.
- **Camera is optional.** Every scan surface also takes a typed code and a USB/keyboard scanner (types the code, then Enter). Both go through the same handler as the camera, so UAT on Flutter web can check everything except the camera itself.
- **Dormant**: everything needs `VENDOR_TOOLS` + `VENDOR_STOCK_LEDGER` + `VENDOR_BARCODES`, and each surface's own tool (§0.2).

---

## 0. Scope, gating, permissions, reuse

### 0.1 In scope
- Store barcodes on a product or on one of its variants. Add and remove them in the app's product form and in a portal Barcodes dialog.
- Look up a code within the vendor (`GET /vendor/products/lookup`).
- Scan with the camera, or enter with a USB/keyboard scanner or by typing:
  - **POS** (S3): add to the cart.
  - **Receive stock** (S9): add a line, or +1 on an existing line (mobile and portal).
  - **Products tab** (S1): find a product, then count or adjust its stock. "Count by scanning" inside the Counted adjustment.
  - **Product form**: fill the barcode field.
- Unknown code: add it to an existing product, or start a new product with it (users with `products`).
- Offline matching in the POS against the cached product list.

Out of scope: printing barcode labels; generating in-store codes; pack or carton codes that count as several units (Q-5); a barcode column in smart import (Q-4); camera scanning in the portal (§6.4); a barcode on customer receipts or documents; looking codes up in an external product database (GS1 or similar); scanning in refunds (S7 picks lines from the sale); moving a code from one product to another in one step (remove it, then add it).

### 0.2 Gating (fail closed, as S1–S9)
- Server: `vendorBarcodesOn()` = `VENDOR_TOOLS && VENDOR_STOCK_LEDGER && VENDOR_BARCODES`. Codes are written inside the ledger's product-form transaction (§2.3). Without the ledger, the save would take the knex-store path and the codes would need a second, non-atomic write. `vendorToolsOptions().barcodes` returns this value (**changed meaning, call out**; today it ignores the ledger flag; S9 did the same for `purchases`).
- Client: `barcodesOn` = `tools.barcodes === true`. False, missing, or options failed: no scan buttons, no Barcodes section or dialog, Enter-in-search keeps today's SKU behaviour. Never show "feature off".
- Each surface also needs its own tool:

| Surface | Shown when |
|---|---|
| POS scan | `barcodesOn` and `walkInSales` (S3 gating) |
| Receive stock scan | `barcodesOn` and `purchases` (S9 gating) |
| Products tab scan, Count by scanning | `barcodesOn` (the ledger is already implied) |
| Product form Barcodes section, portal Barcodes dialog | `barcodesOn` |

- **Flag goes off after use (decision):** the lookup answers 404 `feature_disabled`. `GET /vendor/products` drops the `barcodes` key. `barcodes` / `addBarcodes` in a product save are **ignored** (the rest of the save works and stored codes are untouched), so an app that still shows the section cannot break product saving. Codes are kept and come back when the flag is on. Nothing else depends on them.

### 0.3 Permissions (no new permission)

| Action | Needs | Notes |
|---|---|---|
| See codes on `GET /vendor/products` | Same as the list: `products` or `sales`, or `purchases` while S9 is on | Codes are not sensitive, and the POS needs them to match offline |
| Look up a code | Same guard (`requireProductListAccess`), including 403 `vendor_suspended` for `purchases`-only staff of a suspended vendor | Vendor account and vendor staff only. FitFlex admins get 403 (no vendor context) |
| Add / remove codes (product form, portal dialog, "Add this code to a product") | `products` (the `PUT`/`POST /vendor/products` guard as today) | `sales`-only and `purchases`-only staff see the unknown-code message without the add actions |
| Scan in the POS | `sales` | |
| Scan in Receive stock | `purchases` | |
| Products tab scan, Count by scanning | `products` | |

- Rights come from the stored staff record (existing guards), never from the token.
- FitFlex admins: `barcodes` / `addBarcodes` in an admin product save are ignored in v1 (no admin UI).

### 0.4 Components (reuse first)

| Need | Mobile | Portal |
|---|---|---|
| Camera | `MobileScanner` + `MobileScannerController` (as the owner and member scan pages) | none (§6.4) |
| Camera error | Same layout and strings pattern as `OwnerScanCameraError` (icon, message, Try again, manual way out) | n/a |
| Scan button | `IconButton` in the `FFTextField` trailing slot, 48×48, icon `qr_code_scanner` | n/a |
| Result row | `FFCard` compact + `FFBadge` | `Alert` inline status |
| Unknown code, actions | `FFAlert` warning + `FFButton` secondary/ghost | `Alert` + `Button` |
| Pickers | `showFFSheet` + `FFTextField` search (S9 product picker); S3 variant picker sheet | S9 `ProductCombobox`, `Select` |
| Code list | List tiles ≥ 56dp, remove `IconButton` 48×48 | `Table` (cards below `md`) or list, remove `Button` |
| Dialogs | `FFDialog` | `Dialog`, `ConfirmDialog` |
| States | `FFSkeletonLine`, `FFSpinner`, `FFSnack`, `FFAlert` | `Skeleton`, toast, `Alert` |

**New component (one): `VendorScanPanel`** (`lib/screens/vendor/barcodes/vendor_scan_panel.dart`) with `VendorScanController` (non-visual: debounce, matching, one code in flight) and `codeKey()` (`lib/screens/vendor/barcodes/barcode_rules.dart`). Why: there is no shared scanner component. The two existing scan pages are full-screen, single-shot QR flows with check-in logic built in. Three vendor screens need the same continuous, docked panel with torch, typed entry and debounce. It lives under `vendor/` and does **not** change the owner check-in or member scan pages, so check-in behaviour is untouched. Its camera-error view copies the `OwnerScanCameraError` layout with vendor strings. It does not import from the owner page.

Portal: `src/components/vendor/barcodes/barcodes-dialog.tsx`, `src/lib/barcode-rules.ts` (`codeKey`, `checkGtin`; the same test vectors as Dart and the server, §14).

---

## 1. Barcode rules (decided in this spec)

These are decisions, not open questions (except where a Q-n is named). design-qa and the specs check them one by one.

**B-1 What a code is.** After trimming, 4–48 characters, printable ASCII only (`0x21`–`0x7E`: letters, digits and symbols, no spaces, no control characters, no non-Latin letters). This covers EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, Code 128 and Code 39 labels, and short in-store codes. Errors: `invalid_barcode {code, reason: too_short | too_long | bad_characters}`.

**B-2 Matching key (`codeKey`).** Codes are compared by a normalised key, never by the raw text:
- All digits, 12 long (UPC-A) → `'0' + code` (the same item as its EAN-13). Android (ML Kit) reports UPC-A as 12 digits and iOS as 13 with a leading 0. Without this rule the same tin of protein would not match on both phones.
- All digits, 14 long, starting with `0` → drop the first `0` (GTIN-14 of a unit = its EAN-13).
- Other all-digit codes: unchanged. Eight digits are **not** expanded (EAN-8 and UPC-E cannot be told apart from the text).
- Anything with a letter or symbol → upper case.
- `code` keeps what the vendor typed or scanned (trimmed) for display. `codeKey` is used for uniqueness and every lookup. The same function runs on the server, in Dart and in TypeScript, with one shared table of test vectors.

**B-3 Check digit (Q-2).** All-digit codes 12, 13 or 14 long must pass the GTIN mod-10 check, otherwise 400 `invalid_check_digit {code}`. Reason: scanners check EAN/UPC digits before they return a value, so a code that fails can only come from a typing mistake. Stored, it could never match a scan. Eight-digit codes are not checked (a UPC-E check digit is worked out on its expanded form, so the EAN-8 rule would refuse valid UPC-E codes). Other lengths and non-digit codes are not checked. The client shows the same error inline before saving.

**B-4 Uniqueness.** One `codeKey` per vendor, across all products and variants: unique `(vendorId, codeKey)`.
- The same code twice in one body → 400 `duplicate_barcode {code}`.
- On another live product of the same vendor → 409 `barcode_in_use {code, productId, name, variant}`. It is the vendor's own product, so naming it is fine.
- Another vendor having the code changes nothing and is never revealed.

**B-5 Variants.** `variant` is `''` (the whole product) or the name of a variant the product has **after** the save. Otherwise 400 `barcode_variant_not_found {code, variant}`.
- A whole-product code on a product with tracked variants is allowed. Scanning it asks which variant (§4.4), as a tap does today.
- At most **20 codes per product**, all variants included → 400 `too_many_barcodes {max: 20}`.

**B-6 Renamed or removed variants.** Variants are merged by name, so a rename is a remove plus an add.
- When the save drops a variant (any app build), its codes are deleted in the same transaction and listed in the audit row.
- The S8 product form sends the codes with the new variant name in the same body, so they follow a rename.

**B-7 Archived and deleted products.**
- Archived: codes are kept. The lookup returns the product with `status: archived`. Each surface decides what to do with it (§8).
- Deleted: the lookup never returns it. Its codes are deleted with it (best effort, after the soft delete). Any code still held by a deleted product counts as **free**: a save that wants it removes the old row in the same transaction. So a deleted product can never block a code.

**B-8 Approval and privacy.**
- Codes are not reviewed and never set `approvalStatus = 'pending'`.
- They are never stored on `Product` or in `Product.variants`. A variant object in the body that carries `barcodes` → 400 `invalid_field {field: 'variants'}` (otherwise it would be stored publicly and re-queue review, see "What already exists").
- They never appear in `/shop/*`, the shop home feed, public search, the admin moderation queue, receipts, invoices, credit notes or exports.

**B-9 SKU fallback (Q-1).** When no `ProductCode` matches, the lookup also matches the SKU exactly (trimmed, case-insensitive) among the vendor's non-deleted products (`matchedBy: 'sku'`). SKUs are not unique, so there may be several matches (§4.5).
- Barcode matches always win over SKU matches.
- The client does the same against its loaded list.
- Why: many shops already typed the EAN into SKU, and smart import puts a "barcode" column into SKU. They can scan on day one, with no new data entry.

**B-10 What a scan returns.** Product id, name, variant, price and discount price (the client applies the S3 walk-in price rule), stock, status, approval status and SKU. **Never cost**, never images (product images can be large data URIs), never reorder level.

**B-11 FitFlex QR codes are not product codes.** A detected payload that `isEventTicketPayload` recognises, or that is longer than 48 characters (member check-in QR tokens, URLs), is ignored, with the notice `vendor.scan.notProduct`. It is never sent to the lookup.

**B-12 Audit.** Every change to a product's codes writes one `product_barcodes_changed` audit row `{ productId, added:[{code, variant}], removed:[{code, variant}], reason: form | add_from_scan | variant_removed | product_deleted }` in the same transaction.

---

## 2. Backend contract (for backend-builder, contract-checker, security-and-privacy-reviewer)

Files: `src/shared/vendor-barcode.mjs` (`codeKey`, `checkGtin`, `parseBarcodes`), `src/infra/product-code-store-pg.mjs` (dedicated Postgres store, vendor-scoped, parameterised, never `filterAsync`), changes in `shop-service.mjs`, `vendor-stock-store-pg.mjs` and `functions/shop.mjs`.

### 2.1 Migration `<after 20270203090100>-vendor-barcodes.cjs`

**`ProductCode`**
| Column | Notes |
|---|---|
| id text PK | `pcd_` + 16 hex |
| vendorId text not null | |
| productId text not null | FK → `Product(id)` ON DELETE CASCADE |
| variant text not null default `''` | CHECK `length(variant) <= 60` |
| code text not null | as entered, trimmed; CHECK 4–48 characters |
| codeKey text not null | B-2; CHECK 4–48 characters |
| createdBy text not null, createdAt timestamptz(3) not null | |

Indexes: unique `(vendorId, codeKey)`; `(vendorId, productId)`.

No backfill (no code exists today; SKUs stay SKUs, B-9). **Down:** refuses while any `ProductCode` row exists (prints the count; S4/S7/S9 pattern), otherwise drops the table.

### 2.2 `GET /vendor/products` (changed, additive)
With `vendorBarcodesOn()`, each product gains `barcodes: [{ code, variant: string | null }]`, ordered by variant (whole product first) and then `createdAt`. `null` = whole product. The key is absent when the flag is off. One query for the whole list (`WHERE vendorId = ? AND productId = ANY(?)`), not one per product.

### 2.3 `POST /vendor/products` and `PUT /vendor/products/:id` (changed, additive; **rule 6**)
Guard unchanged (`products`). Two new optional body fields, **mutually exclusive** (both → 400 `barcodes_conflict`):
- `barcodes: [{ code, variant? }]`: the product's **whole set** after the save. `[]` clears it. The form sends this.
- `addBarcodes: [{ code, variant? }]`: add to the set. A code already on this product and variant is a no-op. "Add this code to a product" and the portal quick-add send this, so a stale list cannot remove someone else's new code.
- `variant` left out, `null` or `''` = whole product.
- Shape: an array of ≤ 20 objects with a string `code` → else 400 `invalid_field {field: 'barcodes' | 'addBarcodes'}`.

Processing:
1. Parse and validate every code (B-1, B-3) and duplicates in the body (B-4) **before** anything is written.
2. Inside the existing ledger transaction (`applyProductForm` for PUT, `createProduct` for POST), under the product row lock, after the variant plan is known:
   - check variants (B-5) and the 20 cap;
   - delete codes of variants this save drops (B-6);
   - free codes held by deleted products (B-7);
   - compute added and removed codes against the **locked** current set;
   - insert and delete rows;
   - write the audit row (B-12).
3. The unique index is the authority. A concurrent save that took the code first makes this save fail with 409 `barcode_in_use`, and the whole save rolls back (fields, stock rows and codes together).
4. The response product gains `barcodes` as in §2.2.

Errors (new): 400 `invalid_barcode {code, reason}`, `invalid_check_digit {code}`, `duplicate_barcode {code}`, `too_many_barcodes {max}`, `barcode_variant_not_found {code, variant}`, `barcodes_conflict`, `invalid_field {field}`; 409 `barcode_in_use {code, productId, name, variant}`. Existing errors unchanged. Body codes are processed in order and the first failing code is reported.

`DELETE /vendor/products/:id` (changed behaviour, same signature): after the soft delete, the product's codes are deleted (audit `product_deleted`). If that fails, B-7 still frees them.

A body that sends only `barcodes` or `addBarcodes` is a valid partial update. It changes nothing else, takes no flash-sale lock (no price in the body) and leaves approval alone.

### 2.4 `GET /vendor/products/lookup?code=` (new; **rule 6**)
- Guard: `requireAuth('vendor', 'vendor_staff')`, `requireActiveVendorStaff`, `requireProductListAccess`. `vendorBarcodesOn()` false → 404 `feature_disabled`.
- The route must be registered **before** any `/vendor/products/:id` GET.
- Query: `code` (required; trimmed; 1–100 printable ASCII so that short SKUs can be found). Empty → 400 `code_required`. Too long or bad characters → 400 `invalid_code {reason: too_long | bad_characters}`. A code that breaks B-1 or B-3 cannot match a `ProductCode` but may still match a SKU.
- Rate limit: 120 per person per minute and 600 per vendor per minute (continuous scanning is about one a second, and the clients match locally first) → 429 `rate_limited {retryAfterSeconds}` + `Retry-After`.
- Tenancy: only `ProductCode` rows and products where `vendorId` = the caller's vendor. The answer is the same whether or not another vendor has the code.
- Codes are not written to logs.

Response 200 (also when nothing matches):
```json
{
  "code": "6201234567893",
  "codeKey": "6201234567893",
  "matches": [
    {
      "productId": "prd_1a2b3c4d",
      "name": "Whey Protein 1kg",
      "variant": "M",
      "variants": null,
      "priceTzs": 85000,
      "discountPriceTzs": null,
      "stock": 4,
      "status": "active",
      "approvalStatus": "approved",
      "sku": "WP-1KG",
      "matchedBy": "barcode"
    }
  ]
}
```
- `variant`: the code's variant, or `null` for a whole-product code (or a SKU match).
- `variants`: `[{ name, stock }]` only when `variant` is null and the product has tracked variants (so the client can show the variant picker without another call); else `null`.
- `stock`: the variant's own stock when `variant` is set, else the product's.
- `matches`: `[]` (no match), exactly 1 (barcode match), or 1–10 (SKU matches, ordered by name). Deleted products are never included. Archived ones are, with `status: "archived"`.
- **Changed from the plan's shape** (`{ productId, variant, name, priceTzs, stock }`): it is wrapped in `matches` so that "no match" (200, `[]`) is not confused with 404 `feature_disabled`, and SKU fallback can return several. Call out.

### 2.5 Concurrency
- Two saves adding the same code: one wins; the other gets 409 `barcode_in_use` and nothing of it is saved.
- Replace-set against the locked current set: a stale form can remove a code that was added after it opened. That code is named in the audit row. Quick adds use `addBarcodes` and never remove anything.
- Lookup vs save: the lookup reads committed rows only. A code saved a moment ago is found on the next scan.
- A product deleted while its code is being looked up: the lookup returns no match for it.

### 2.6 Effects on other slices
- S3 offline product cache gains `barcodes` (codes only). §7 overrides the S3 §6.1 allowlist.
- S9 Receive stock: no contract change. Lines still go through `POST /vendor/purchases`.
- S1 adjustments: no contract change.
- Smart import: no change (Q-4). An imported product has no codes until the vendor adds them. Its SKU is found by B-9.
- Moderation, settlement, payouts, commission, pricing, check-in: not touched.

---

## 3. Navigation

No new routes. The scan panel is part of each screen, not a page, and it is never a deep-link target: the camera only starts from a user tap.

| Entry point | Opens | Back |
|---|---|---|
| POS search field, scan icon (`pos-scan`) | Scan panel docked in the POS (§5.1) | System back / Esc closes the panel first (`PopScope`), then the POS's own back (S3) |
| Receive stock, product search and Items header "Scan items" (`purchase-scan`) | Scan panel docked in Receive stock (§5.2) | Panel closes first, then S9's leave dialog |
| Products tab header, scan icon (`products-scan`) | Scan panel as a full-height sheet (single shot) → product action sheet (§5.3) | Closes the sheet and returns to the Products tab |
| Adjust sheet, Counted, "Count by scanning" | Scan panel inside the sheet (§5.3) | Panel closes; the sheet stays |
| Product form, scan icon on the barcode field | Scan panel as a sheet (single shot) → fills the field (§5.4) | Closes the sheet; the form stays with its values |
| Unknown code → "New product with this code" | Product form (create) with the code in the Barcodes list | Form's discard dialog, then the screen that opened it, where scanning resumes |
| Unknown code → "Add this code to a product" | Product picker sheet → variant → confirm dialog | Each step pops to the previous one; Cancel returns to the scan panel |
| Portal `/vendor/products/` row action "Barcodes" | Barcodes dialog (§6.1) | Esc / Cancel; focus returns to the row action |
| Portal `/vendor/purchases/receive/` product input | Enter matches codes (§6.2) | n/a |

After completion:
- **Code saved** (form): S1 behaviour (sheet closes, `vendor.productSaved`).
- **Code added from a scan**: snack `vendor.scan.codeAdded` {name}. The item is then handled as if it had been scanned: added to the cart, to the delivery, or the product action sheet opens. Scanning resumes.
- **Portal dialog saved**: toast `vendor.barcodes.saved`. The row shows the new count. Focus returns to the row's Barcodes button.
- Leaving any screen stops the camera (`controller.stop()` in `dispose`, and when the app is paused).

---

## 4. Mobile scan panel (`VendorScanPanel`)

### 4.1 Layout, phone 375
Docked at the top of the content, below the app bar and banners, full width:
- **Viewfinder**: 220dp high (180dp when the screen is < 640dp tall). `MobileScanner` with `fit: BoxFit.cover`, a centred guide rectangle 260 × 120dp (2dp border, `outline`), and a hint under it on a scrim: `vendor.scan.hint`.
- **Controls row** (48dp, under the viewfinder):
  - **Torch** `IconButton` (`flash_on` / `flash_off`; label `vendor.scan.torchOn` / `torchOff`). Only shown when the controller reports a torch. Usually hidden on Flutter web.
  - **Type code** `FFButton` ghost (`vendor.scan.type`, icon `keyboard`).
  - **Pause / Resume** (continuous mode only, `vendor.scan.pause` / `resume`).
  - **Stop scanning** `IconButton` `close` (`vendor.scan.close`).
- **Result row** (continuous mode; under the controls, 64dp, `FFCard`): the last handled code (§4.3).
- **Type code** opens an inline `FFTextField` in place of the viewfinder: label `vendor.scan.typeLabel`, `keyboardType: TextInputType.visiblePassword` (no autocorrect, letters allowed), `textInputAction: search`, and a **Find** button. Enter and Find go through the same handler as a detection. A USB/Bluetooth keyboard scanner works here too.

Single-shot mode (Products tab, product form): the same panel in a `showFFSheet` (90% height): viewfinder 60% of the sheet, controls below, no Pause and no result row. It closes on the first valid code.

Flutter web ≥ 900: in the POS and Receive stock the panel sits at the top of the left pane (products / items), 280px high, max width 640. The cart and payment panes do not move.

### 4.2 Camera states

| State | Shown |
|---|---|
| Starting (permission prompt, camera warming up) | Viewfinder black with `FFSpinner` and `vendor.scan.starting`. Type code is usable |
| Active | Live preview, guide, hint |
| Denied (`permissionDenied`) | Error view (OwnerScanCameraError layout): icon `no_photography_outlined`, `vendor.scan.camera.denied`, **Try again** and **Type code**. iOS: once denied, the app cannot ask again, so the copy points to Settings |
| Unsupported (`unsupported`, no camera, desktop without a webcam) | `vendor.scan.camera.unsupported`, **Type code** only |
| Insecure page (Flutter web over http) | `vendor.scan.camera.insecure`, **Type code** only |
| Other error (`genericError`, ZXing script failed to load on web, camera busy) | `vendor.scan.camera.error`, **Try again**, **Type code** |
| Paused (user, a sheet or dialog over it, app in background) | Viewfinder dimmed with `vendor.scan.paused` + **Resume**. The camera is stopped, not only hidden |

Remembering: once the camera has failed on this device, the panel opens straight to Type code with a link "Try the camera" (per vendor, per device, in shared_preferences). It never asks for the camera on screen open, only on a tap.

### 4.3 Detection, debounce and feedback (`VendorScanController`)
- **Formats** (speeds up detection): EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF, QR. `DetectionSpeed.normal`, `detectionTimeoutMs: 250`.
- **One code at a time.** While a code is being handled (a lookup in flight, or a sheet or dialog open), other detections are dropped.
- **Debounce.** The same `codeKey` is ignored for **1,500 ms** after it was handled. A different code is handled at once. Holding the camera over one item therefore adds it once; moving away and back, or waiting 1.5 s, adds another.
- **Order of matching:**
  1. B-11 filter.
  2. Local index of the screen's loaded product list (barcode `codeKey`s, then exact SKU).
  3. If no local match and online: `GET /vendor/products/lookup`. Results are added to the local index for this session.
  4. Still no match: unknown code (§4.6).
- **Feedback**:

| Outcome | Haptic | Visual | Announced |
|---|---|---|---|
| Added / matched | `HapticFeedback.lightImpact` | Guide border turns success green for 300 ms (no animation when reduce motion is on: plain colour change); result row updates | Polite: `vendor.scan.added` {name} {qty} |
| Needs a choice (variant, several matches) | `selectionClick` | Sheet opens; camera paused | Sheet title is read |
| Unknown, archived, out of stock, not a product code | `HapticFeedback.heavyImpact` | Result row turns into a warning `FFAlert` | Polite (the user is looking at the item, not the screen) |
| Lookup failed / rate limited | `heavyImpact` | Error row with **Try again** | Polite |

- **No sound in v1** (decision): Flutter's `SystemSound` is a weak click on Android and does nothing on iOS, a real beep needs an audio dependency, and the haptic + colour + announcement already confirm a scan. Revisit after device testing in a noisy shop.
- **Result row** (continuous mode): name (variant), "{qty} in sale" / "{qty} received", a −/+ stepper (48dp) to correct the count without scanning again, and **Undo** (removes the last scan's +1; available until the next scan). Semantics: merged label `vendor.scan.resultLabel`.

### 4.4 Variants
- Variant code → that variant directly.
- Whole-product code on a product with tracked variants → the S3 variant picker sheet (POS) or the S9 variant chooser (Receive stock), with the camera paused. Picking adds the item and resumes scanning. Cancel resumes without adding.
- Untracked variants (names only): the code adds the product with that variant name, as a tap does today.

### 4.5 Several matches (SKU fallback only)
Sheet `vendor.scan.pickMatch`: one 56dp row per match (name · variant · "{n} in stock" · price), with the camera paused. Picking continues as a single match. Cancel resumes scanning.

### 4.6 Unknown code
The result row (continuous) or the sheet body (single shot) shows `FFAlert` warning `vendor.scan.notFound` {code} (online), or `vendor.scan.notFoundOffline` {code} (offline, §7), with actions:

| Action | Who | Does |
|---|---|---|
| **Add this code to a product** (`vendor.scan.addToProduct`) | `products`, online | Product picker sheet (search by name or SKU; archived products are listed with a badge) → variant choice when the product has variants ("Whole product" first, then names) → `FFDialog` `vendor.scan.confirmAddTitle` {code} {name} → `PUT /vendor/products/:id {addBarcodes:[{code, variant}]}`. Success: snack `vendor.scan.codeAdded`, then the item is handled as a match (§3 After completion). 409 `barcode_in_use` (someone else just added it): message `vendor.barcodes.err.inUse` {name}, then the code is looked up again |
| **New product with this code** (`vendor.scan.createProduct`) | `products`, online | Product form (create), Barcodes list prefilled with the code (whole product). Saving creates the product pending review, as today |
| **Search by name** (`vendor.scan.searchByName`) | everyone | Closes Type code, focuses the screen's search field with nothing typed |
| **Scan again** (`vendor.scan.again`) | everyone | Clears the row; the next detection of the same code is handled at once (debounce reset) |

Without `products`: the two add actions are hidden and the muted line `vendor.scan.askProducts` shows.

---

## 5. Mobile surfaces

### 5.1 POS (S3 `/vendor/sales/new`)
- The scan icon appears in the reserved trailing slot of the search field (S3 §2.1) when `barcodesOn`. Tapping it opens the panel in **continuous** mode. The panel's open state is kept while the POS is open and is not stored in the draft.
- A match calls the existing `_tapProduct` / `_add` path, so the stock cap, "only {n} left", the haptic and the announcement are the S3 ones. Out of stock → warning `vendor.scan.outOfStock` {name}. Archived → `vendor.scan.archived` {name} (archived products are not sold, S3 §2.3). Pending, paused or rejected listings are added as S3 allows.
- **Enter in search** (S3 §2.2, also on phones with a Bluetooth scanner): with `barcodesOn`, an exact `codeKey` match in the loaded list wins first, then the exact SKU (today), then the single text match (today). With no local match and the text looking like a code (no spaces, 4–48 characters), the lookup runs (online), and an unknown code shows §4.6 under the search field. The search field is cleared and refocused after each Enter.
- The cart sheet, Charge and the offline queue are unchanged.

### 5.2 Receive stock (S9 `/vendor/purchases/receive`)
- Scan icon in the product picker's search field, and a **Scan items** ghost button in the Items section header (`vendor.scan.scanItems`). Both open the panel in **continuous** mode, docked above the Items list. (S9 §4.3: "a scan icon in the search field calls the lookup and adds the line (or +1 qty)". This spec keeps that and adds the header button.)
- Match: a new line with qty 1 and S9's unit cost prefill, or +1 on the existing line for that product and variant (S9 merges duplicates). The line scrolls into view. The result row reads `vendor.scan.addedLine` {name} {qty}.
- Archived → `vendor.scan.archived` (S9 P-2 refuses archived products). Paused, pending and rejected listings are added as S9 allows.
- Unknown: §4.6. With `products`, a code added from here then adds the line.
- Receiving stays online only (S9 Q-5). Scanning needs no extra rule: the S9 draft keeps the lines.

### 5.3 Products tab: find, count, adjust
- Products tab header: a scan icon (`products-scan`, `vendor.scan.findProduct`) next to the search/add actions, with `products` and `barcodesOn`. It opens the **single-shot** sheet.
- Match → **product action sheet** (title "{name} ({variant})", subtitle `vendor.scan.stockNow` {n}, plus badges for status and approval):
  - **Count stock** (`vendor.scan.countStock`) → S1 adjust sheet with this variant preselected and reason **Counted** preselected.
  - **Adjust stock** → S1 adjust sheet with the variant preselected and no reason.
  - **Stock history** → S1 history for this product/variant.
  - **Edit product** → product form.
  - **Scan another** → back to the scanner.
  A whole-product code on a product with variants opens the sheet with a variant dropdown first (S1 §2.1 rule: no product-level adjustment when variants exist). Archived products: all actions except Count/Adjust (S1 does not adjust archived products), plus the badge.
- **Count by scanning** (in the S1 adjust sheet, reason Counted, with `barcodesOn`): a ghost button under the Counted field (`vendor.scan.countByScan`). It opens the panel inside the sheet in continuous mode.
  - Each scan of a code of **this product** whose variant is the chosen one (or a whole-product code) adds 1 to the Counted field. The difference preview updates (S1 live region). The result row reads `vendor.scan.countedOne` {n}, with −/+ to correct.
  - A code of another product or variant: warning `vendor.scan.otherProduct` {name}. Nothing changes.
  - Typing in the Counted field still works. Scans add to what is typed.
  - Save is the S1 Save count with `expectedStock`, so S1's 409 `stock_changed` handling applies unchanged.
- Counting a whole shelf of different products by scanning (a stocktake session) is out of scope. Each product is counted and saved in turn.

### 5.4 Product form (S1 `VendorProductForm`)
New section **Barcodes** (`vendor.barcodes.title`), after the SKU/weight row (S1 §1.1 item 4) and before Variants:
- Helper `vendor.barcodes.help` (customers never see it).
- One row per code (≥ 56dp): code in a monospace style (`fontFeatures: tabularFigures`), "· Whole product" or "· {variant}", remove `IconButton` (48×48, `vendor.barcodes.remove` {code}).
- **Add row**:
  - `FFTextField` `vendor.barcodes.field` (visiblePassword keyboard; trailing scan `IconButton` 48×48 that opens the single-shot sheet and fills the field);
  - **For** dropdown (`vendor.barcodes.for`), only when the form has variants: "Whole product" (default), then the variant names as currently typed in the form;
  - **Add** button (`vendor.barcodes.add`). Enter in the field also adds (USB scanner).
- Client validation on Add (same rules as the server): B-1 length/characters, B-3 check digit, duplicate in the list → inline `errorText` on the field, with the field keeping its value. Max 20.
- A variant removed in the form: its codes are removed from the list too, with an inline info line `vendor.barcodes.removedWithVariant` {n}. A variant renamed in the form: its codes follow the new name.
- Save sends `barcodes` (the whole list) only when `barcodesOn`. Server errors:
  - `barcode_in_use` → inline on that row: `vendor.barcodes.err.inUse` {name}, with focus on that row.
  - `invalid_check_digit`, `invalid_barcode` → inline on that row.
  - `barcode_variant_not_found` → inline `vendor.barcodes.err.variantGone` {variant}.
  - `too_many_barcodes` → under the section.
  - Other errors: S1 behaviour.
- At 375: field and scan icon on one line, For + Add on the next. At text scale ≥ 1.3 or in Swahili, For and Add stack.

---

## 6. Portal

### 6.1 Products page: Barcodes dialog (`/vendor/products/`)
- With `products` and `tools.barcodes`: each product row gets a **Barcodes** row action (`vendor.barcodes.title`, icon `Barcode`, `min-h-11`), and the muted row line gains "· {n} barcodes" when n > 0. The page search also matches codes (`codeKey`) on top of name and SKU.
- **Dialog** `vendor.barcodes.dialogTitle` {name}:
  - code list as in §5.4 (code · for · Remove);
  - input `vendor.barcodes.field` with **autofocus**, and the hint `vendor.barcodes.scannerHint` (a USB scanner types the code and presses Enter). **Enter adds the code to the list and keeps focus in the input**, so several items can be scanned one after another;
  - **For** `Select` when the product has variants;
  - client validation as §5.4, inline under the input, input value kept;
  - **Save** sends `PUT /vendor/products/:id {barcodes}`; **Cancel**. Esc with changes → `ConfirmDialog` "Discard changes?" (S9 pattern).
  - Saving: Save shows a spinner, inputs disabled. 409 `barcode_in_use` → error on that row ("Already on {name}"), focus there. Other errors → `Alert` in the dialog.
- The portal still does not edit other product fields (S2 Q-6 stands).

### 6.2 Receive stock (`/vendor/purchases/receive/`)
`ProductCombobox` Enter, with `tools.barcodes`:
1. Exact `codeKey` match in the loaded products → add that product (or +1 on its line). Variant code → that variant. Whole-product code on a tracked product → the line's variant `Select` opens with focus (S9 portal pattern).
2. Else exact SKU → same.
3. Else, when the text looks like a code (no spaces, 4–48 characters), `GET /vendor/products/lookup`. One match → add it. Several → keep the listbox open, filtered to those matches. None → inline status under the input: `vendor.scan.notFound` {code}, plus **Add this code to a product** (`products` only). That opens a small dialog: product combobox → For → **Add code** (`PUT {addBarcodes}`), and then the line is added.
4. Else (normal text): today's behaviour (Enter picks the highlighted hit).

After each add, the input clears and keeps focus. A polite live region announces `vendor.scan.addedLine` {name} {qty}. Archived → inline `vendor.scan.archived` {name}.

### 6.3 Portal states
| State | Behaviour |
|---|---|
| Flag off / no `products` | No Barcodes action; Enter in Receive stock behaves as in S9 |
| Dialog loading | Codes come with the products list, so there is no extra load |
| Lookup in flight | Input `aria-busy`, small spinner in the input end; Enter ignored until it answers (one at a time) |
| Lookup 429 | Inline `vendor.scan.rateLimited` {s} |
| Lookup network / 5xx | Inline `vendor.scan.lookupFailed` + Try again |
| 404 `feature_disabled` | Toast `vendor.barcodes.unavailable`; the Barcodes action disappears on the next options load |
| 403 | Toast `vendor.purchases.noAccess` / `vendor.products.noAccess` (existing) |

### 6.4 No camera scanning in the portal (decision)
The portal's `QrScanner` uses `jsQR`, which reads QR only. Reading EAN/UPC in the browser needs a new dependency (ZXing or similar), and desks have USB scanners, which already work through Enter. Phones and tablets use the app. Revisit if vendors ask.

---

## 7. Offline behaviour

- **POS (offline-capable, S3):** the cached product list (`vendor_pos_products.<vendorId>`) gains `barcodes: [{code, variant}]`. **This overrides the S3 §6.1 allowlist.** Codes are not personal or cost data. Offline, a scan or Enter matches the cache only:
  - match → added (S3 offline stock rules: known available = cached stock − queued sales − cart);
  - no match → `vendor.scan.notFoundOffline` {code} with **Search by name** and **Scan again**. The add actions are hidden offline (they need the server).
- **No separate lookup cache.** The cached product list *is* the lookup cache, refreshed whenever the POS loads products. Lookups made online during a session go into the in-memory index for that session only.
- **Receive stock, product form, Products tab, portal:** online only, as their slices. The local index of the loaded list still answers first, so scanning stays fast. A lookup that fails on the network shows `vendor.scan.lookupFailed` + Try again. Nothing is queued.
- **Flutter web:** the camera needs HTTPS. The ZXing script loads from the network (Q-3). If it fails, the panel shows the error state and Type code works. Offline on web, the camera may not start at all (the script is not loaded), so the POS falls back to Type code / USB with cache matching.

---

## 8. States (all surfaces)

| State | Behaviour |
|---|---|
| Flag off / options failed | No scan UI, no Barcodes section/dialog; Enter-in-search as before S8 (SKU) |
| Role-restricted | Scan shown only per §0.3. Without `products`: no add actions (`vendor.scan.askProducts`). Crafted lookup without a list permission → 403 → `vendor.scan.noAccess` |
| Pending-approval vendor | Works (own products) |
| Suspended vendor | As each surface's slice. `purchases`-only staff: lookup 403 `vendor_suspended` → existing suspended banner |
| Staff disabled | Existing staff-disabled alert; panel closes |
| Loading (lookup) | Result row "Looking up {code}…" (`vendor.scan.looking`) with `FFSpinner` small; camera keeps running but detections are dropped (§4.3) |
| Empty (vendor has no products) | Scan still opens; every code is unknown; "New product with this code" is the useful action |
| Partial (product list loaded from cache, refresh failed) | Matching uses the cache; the S3 offline banner shows |
| Success | §4.3 feedback |
| Several matches | §4.5 |
| Unknown | §4.6 |
| Archived match | Warning `vendor.scan.archived` {name}; not added (POS, Receive stock); the Products-tab action sheet opens with Edit and History |
| Out of stock (POS) | Warning `vendor.scan.outOfStock` {name} |
| Not a product code (B-11) | Warning `vendor.scan.notProduct` |
| Offline | §7 |
| 429 | `vendor.scan.rateLimited` {s}; scanning pauses for that many seconds, then resumes on its own |
| 404 `feature_disabled` on lookup | Snack `vendor.barcodes.unavailable`; panel closes; scan icon hidden after the options refresh |
| Camera states | §4.2 |

---

## 9. Accessibility

- **Targets:** mobile ≥ 48dp (scan icon, torch, Type code, Pause, Stop, result-row stepper and Undo, code row remove, For dropdown, sheet rows ≥ 56dp); portal ≥ 44px (`min-h-11`).
- **Semantics labels (Flutter web tree), every actionable control:**

| Control | Label |
|---|---|
| Scan icon (POS, Receive, Products, form) | `vendor.scan.open` "Scan barcode" (Products tab: `vendor.scan.findProduct`) |
| Viewfinder | `vendor.scan.preview` (image role, not focusable) |
| Torch | `vendor.scan.torchOn` / `torchOff`, toggled state |
| Type code / Find | `vendor.scan.type` / `vendor.scan.find` |
| Pause / Resume / Stop | `vendor.scan.pause` / `resume` / `close` |
| Result row | merged `vendor.scan.resultLabel` "{name}, {qty}, last scanned" |
| Result stepper | "One more {name}" / "One fewer {name}" (S9 strings) |
| Undo | `vendor.scan.undoLabel` "Undo last scan of {name}" |
| Code row remove | `vendor.barcodes.remove` {code} |
| Code row | merged `vendor.barcodes.rowLabel` "Barcode {code}, {for}" (digits read one by one: `Semantics(value:)` with spaces between digits) |
| Unknown-code actions | their button text + the code |

- **Live regions:** result row (polite), lookup status (polite), unknown/archived/out-of-stock (polite), field validation errors (assertive on Add/Save). The viewfinder is not a live region.
- **Focus order:**
  - POS: search → scan icon → (panel) Type code → torch → pause → stop → result row → product list → cart (S3).
  - Receive: S9 order, with the panel controls after Add item / Scan items.
  - Form: field → scan icon → For → Add → code rows (remove).
  - Closing the panel returns focus to the scan icon that opened it. After "Add this code", focus goes to the result row.
- **Not camera-only:** every action has a non-camera path (Type code, USB, search), checked in AC.
- **Contrast** ≥ 4.5:1 light and dark. The guide rectangle and hint sit on a 60% black scrim; the success green is the border only (state also comes from the text and the announcement). Warnings use warning700 on warning50 with words.
- **Motion:** the 300 ms border colour is a plain colour change when reduce motion is on. No scanning-line animation.
- **Text scale 200%:** the viewfinder keeps its height and the controls row wraps to two lines; the result row grows; the form's For/Add stack.

---

## 10. Strings (EN + SW; every SW string is a DRAFT for native review)

Terms:
- barcode = **msimbopau** (plural **misimbopau**). Draft; new to the glossary. "Msimbo" alone (code) is used where the text is about any code.
- scan = **skani** (glossary: decided).
- light/torch = **tochi**; camera = **kamera** (as `ownerScan.*`).
- variant = **chaguo** (S1 `vendor.variants` = Machaguo); whole product = **bidhaa nzima**.
- archived = **imewekwa kando** (S9).
- Stock stays English.

Placeholders: `{code} {name} {variant} {qty} {n} {max} {for} {s}`.

Same keys in `lib/shared/i18n.dart` and `src/lib/i18n.ts` (portal uses the `vendor.barcodes.*` keys, plus `vendor.scan.notFound`, `addToProduct`, `addedLine`, `archived`, `rateLimited`, `lookupFailed`).

### 10.1 Barcodes (form, dialog)
| Key | EN | SW (draft) |
|---|---|---|
| vendor.barcodes.title | Barcodes | Misimbopau |
| vendor.barcodes.help | Scan or type the code printed on the item. Customers never see it. | Skani au andika msimbo uliochapishwa kwenye bidhaa. Wateja hawauoni kamwe. |
| vendor.barcodes.field | Barcode | Msimbopau |
| vendor.barcodes.add | Add barcode | Ongeza msimbopau |
| vendor.barcodes.for | For | Kwa ajili ya |
| vendor.barcodes.wholeProduct | Whole product | Bidhaa nzima |
| vendor.barcodes.none | No barcodes yet. | Bado hakuna msimbopau. |
| vendor.barcodes.count (one / other) | 1 barcode / {n} barcodes | Msimbopau 1 / Misimbopau {n} |
| vendor.barcodes.remove | Remove barcode {code} | Ondoa msimbopau {code} |
| vendor.barcodes.rowLabel | Barcode {code}, {for} | Msimbopau {code}, {for} |
| vendor.barcodes.dialogTitle | Barcodes for {name} | Misimbopau ya {name} |
| vendor.barcodes.scannerHint | A USB scanner types the code and presses Enter. | Skana ya USB huandika msimbo na kubonyeza Enter. |
| vendor.barcodes.saved | Barcodes saved. | Misimbopau imehifadhiwa. |
| vendor.barcodes.removedWithVariant | {n} barcodes were removed with the option. | Misimbopau {n} imeondolewa pamoja na chaguo hilo. |
| vendor.barcodes.unavailable | Barcodes aren't available right now. | Misimbopau haipatikani kwa sasa. |
| vendor.barcodes.discardTitle | Discard changes to barcodes? | Ufute mabadiliko ya misimbopau? |

### 10.2 Barcode errors
| Key | EN | SW (draft) |
|---|---|---|
| vendor.barcodes.err.tooShort | A barcode has at least 4 characters. | Msimbopau una angalau herufi 4. |
| vendor.barcodes.err.tooLong | A barcode has at most 48 characters. | Msimbopau hauzidi herufi 48. |
| vendor.barcodes.err.badChars | Use letters, numbers and symbols only, with no spaces. | Tumia herufi, namba na alama tu, bila nafasi. |
| vendor.barcodes.err.checkDigit | This number doesn't look right. Check the last digit. | Namba hii haionekani sahihi. Hakiki tarakimu ya mwisho. |
| vendor.barcodes.err.duplicate | This barcode is already in the list. | Msimbopau huu tayari upo kwenye orodha. |
| vendor.barcodes.err.inUse | Already on {name}. | Tayari upo kwenye {name}. |
| vendor.barcodes.err.tooMany | A product can have up to {max} barcodes. | Bidhaa inaweza kuwa na misimbopau hadi {max}. |
| vendor.barcodes.err.variantGone | The option {variant} no longer exists. Choose again. | Chaguo {variant} halipo tena. Chagua tena. |

### 10.3 Scanning
| Key | EN | SW (draft) |
|---|---|---|
| vendor.scan.open | Scan barcode | Skani msimbopau |
| vendor.scan.findProduct | Find a product by scanning | Tafuta bidhaa kwa kuskani |
| vendor.scan.scanItems | Scan items | Skani bidhaa |
| vendor.scan.close | Stop scanning | Acha kuskani |
| vendor.scan.hint | Point the camera at the barcode | Elekeza kamera kwenye msimbopau |
| vendor.scan.preview | Camera view for scanning barcodes | Mwonekano wa kamera wa kuskani misimbopau |
| vendor.scan.starting | Starting the camera… | Inawasha kamera… |
| vendor.scan.torchOn / torchOff | Turn on the light / Turn off the light | Washa tochi / Zima tochi |
| vendor.scan.type | Type code | Andika msimbo |
| vendor.scan.typeLabel | Code | Msimbo |
| vendor.scan.find | Find | Tafuta |
| vendor.scan.tryCamera | Try the camera | Jaribu kamera |
| vendor.scan.pause / resume | Pause scanning / Resume scanning | Sitisha kuskani / Endelea kuskani |
| vendor.scan.paused | Scanning paused | Kuskani kumesitishwa |
| vendor.scan.looking | Looking up {code}… | Inatafuta {code}… |
| vendor.scan.added | {name} added · {qty} in this sale | {name} imeongezwa · {qty} kwenye mauzo haya |
| vendor.scan.addedLine | {name} added · {qty} received | {name} imeongezwa · {qty} zimepokelewa |
| vendor.scan.resultLabel | {name}, {qty}, last scanned | {name}, {qty}, iliyoskaniwa mwisho |
| vendor.scan.undo | Undo | Tendua |
| vendor.scan.undoLabel | Undo last scan of {name} | Tendua uskani wa mwisho wa {name} |
| vendor.scan.notFound | No product has the code {code}. | Hakuna bidhaa yenye msimbo {code}. |
| vendor.scan.notFoundOffline | {code} isn't in the saved product list. Search by name, or try again when you're online. | {code} haipo kwenye orodha ya bidhaa iliyohifadhiwa. Tafuta kwa jina, au jaribu tena ukiwa mtandaoni. |
| vendor.scan.addToProduct | Add this code to a product | Weka msimbo huu kwenye bidhaa |
| vendor.scan.createProduct | New product with this code | Bidhaa mpya yenye msimbo huu |
| vendor.scan.searchByName | Search by name | Tafuta kwa jina |
| vendor.scan.again | Scan again | Skani tena |
| vendor.scan.askProducts | Ask someone who manages products to add this code. | Muombe anayesimamia bidhaa aongeze msimbo huu. |
| vendor.scan.chooseProduct | Choose the product | Chagua bidhaa |
| vendor.scan.confirmAddTitle | Add code {code} to {name}? | Uweke msimbo {code} kwenye {name}? |
| vendor.scan.confirmAdd | Add code | Weka msimbo |
| vendor.scan.codeAdded | Code added to {name}. | Msimbo umewekwa kwenye {name}. |
| vendor.scan.pickMatch | More than one product has this code. Choose one. | Zaidi ya bidhaa moja ina msimbo huu. Chagua moja. |
| vendor.scan.archived | {name} is archived. Restore it in Products first. | {name} imewekwa kando. Irejeshe kwenye Bidhaa kwanza. |
| vendor.scan.outOfStock | {name} is out of stock. | Stock ya {name} imeisha. |
| vendor.scan.notProduct | This isn't a product barcode. | Huu si msimbopau wa bidhaa. |
| vendor.scan.rateLimited | Too many scans. Wait {s} seconds. | Umeskani mara nyingi mno. Subiri sekunde {s}. |
| vendor.scan.lookupFailed | Couldn't check this code. Try again. | Imeshindwa kuhakiki msimbo huu. Jaribu tena. |
| vendor.scan.noAccess | You don't have access to products. Ask the owner. | Huna ruhusa ya bidhaa. Muulize mmiliki. |
| vendor.scan.stockNow | Stock now: {n} | Stock sasa: {n} |
| vendor.scan.countStock | Count stock | Hesabu Stock |
| vendor.scan.adjustStock | Adjust stock | Rekebisha Stock |
| vendor.scan.history | Stock history | Historia ya Stock |
| vendor.scan.edit | Edit product | Hariri bidhaa |
| vendor.scan.another | Scan another | Skani nyingine |
| vendor.scan.countByScan | Count by scanning | Hesabu kwa kuskani |
| vendor.scan.countedOne | {n} counted | {n} zimehesabiwa |
| vendor.scan.otherProduct | That's {name}. Save this count first. | Hiyo ni {name}. Hifadhi hesabu hii kwanza. |

### 10.4 Camera
| Key | EN | SW (draft) |
|---|---|---|
| vendor.scan.camera.denied | Camera access is off. Allow the camera for FitFlex in your settings, or type the code. | Ruhusa ya kamera imezimwa. Ruhusu kamera kwa FitFlex kwenye mipangilio, au andika msimbo. |
| vendor.scan.camera.unsupported | This device can't scan here. Type the code or use a USB scanner. | Kifaa hiki hakiwezi kuskani hapa. Andika msimbo au tumia skana ya USB. |
| vendor.scan.camera.insecure | The camera works only on a secure (https) page. Type the code instead. | Kamera inafanya kazi kwenye ukurasa salama (https) tu. Andika msimbo badala yake. |
| vendor.scan.camera.error | The camera couldn't start. Try again, or type the code. | Kamera imeshindwa kuwaka. Jaribu tena, au andika msimbo. |

### 10.5 Swahili overflow
- Longest SW: `notFoundOffline` (~105), `camera.denied` (~95), `camera.insecure` (~85). All of them are in `FFAlert`s or error views and wrap.
- Buttons:
  - "Weka msimbo huu kwenye bidhaa" (29) and "Bidhaa mpya yenye msimbo huu" (28) are full width and stacked in the unknown-code row, never side by side at 375.
  - "Hesabu kwa kuskani" (18) is a full-width ghost button in the adjust sheet.
  - "Sitisha kuskani" (15) in the controls row: at < 360dp or in Swahili, Pause shows as an icon button with its label in semantics and tooltip only.
  - "Ongeza msimbopau" (16): the form's For and Add stack in Swahili (§5.4).
- Result row "{name} imeongezwa · {qty} kwenye mauzo haya" wraps to two lines (name ellipsis on line 1, count on line 2).
- Portal: "Misimbopau ya {name}" dialog title wraps; the row action "Misimbopau" (10) fits at `min-w-0`.

---

## 11. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `/vendor/tools/options`, `/vendor/me.tools` | `barcodes` | **exists**. Meaning changes to include `VENDOR_STOCK_LEDGER` (**requested, call out**). Mobile `VendorTools.barcodes` and a typed portal field **to add** |
| `ProductCode` | id, vendorId, productId, variant, code, codeKey, createdBy, createdAt | plan had vendorId, productId, variant, code. **`codeKey`, `createdBy`, `createdAt` requested** (B-2) |
| `GET /vendor/products` | `barcodes: [{code, variant\|null}]` per product | **requested** (additive, flag on) |
| `POST` / `PUT /vendor/products(/:id)` | body `barcodes` (plan) **and `addBarcodes` (requested)**; response `barcodes`; errors §2.3 | plan had PUT only. **POST requested** (create with a scanned code) |
| `DELETE /vendor/products/:id` | deletes codes (B-7) | **requested** (behaviour only) |
| `GET /vendor/products/lookup` | `code`, `codeKey`, `matches[{productId, name, variant, variants, priceTzs, discountPriceTzs, stock, status, approvalStatus, sku, matchedBy}]` | plan had `{productId, variant, name, priceTzs, stock}`. **Wrapped in `matches` and extended (requested)** |
| `AuditLog` | action `product_barcodes_changed` | **requested** |

Nothing in this spec reads a field the backend does not have or is not asked to add.

---

## 12. Rule-6 callouts (CLAUDE.md; each PR must list these explicitly)
1. **Endpoint signatures (changed):**
   - `PUT /vendor/products/:id` and `POST /vendor/products` accept `barcodes` / `addBarcodes` and return `barcodes`;
   - `GET /vendor/products` returns `barcodes`;
   - `DELETE /vendor/products/:id` also deletes codes;
   - the meaning of `tools.barcodes` changes (it now needs the ledger flag).
2. **Endpoint (new):** `GET /vendor/products/lookup`, with the plan's response shape wrapped in `matches` (§2.4).
3. **Product save path:** codes are written inside `applyProductForm` / `createProduct`. A `barcode_in_use` race rolls back the whole save. `variants[].barcodes` is now refused (400). Approval re-queue logic (`PRODUCT_REVIEW_FIELDS`, `reviewChanged`) is **not** changed. A spec proves that adding or removing codes keeps an approved product approved and listed.
4. **S3 offline cache allowlist** gains `barcodes` (§7).
5. **Auth-adjacent:** no new permission. The lookup reuses `requireProductListAccess` (including the S9 suspended-vendor rule). `src/auth/*` is not changed.
6. **Not touched:** pricing constants, payout engine, settlement, commission, check-in logic (the owner and member scan pages are unchanged; the vendor panel is a separate widget), marketplace checkout, moderation.
7. Reviews:
   - security-and-privacy-reviewer: lookup tenancy and enumeration (rate limit; same answer whether another vendor has a code), codes kept off public views, the ZXing script source on Flutter web (Q-3);
   - contract-checker: shapes; deploy order functions → portal → mobile;
   - i18n-swahili-auditor.

---

## Open questions (each with a recommendation)

- **Q-1 SKU fallback in the lookup (B-9).** Rec: yes. When no barcode matches, an exact SKU match counts too (barcode matches first; several SKU matches show a chooser). Vendors who already typed the EAN as the SKU, and smart imports whose "barcode" column became the SKU, can scan from day one. Alt: barcodes only (stricter, but every vendor must enter codes again).
- **Q-2 Reject wrong GTIN check digits (B-3).** Rec: reject 12-, 13- and 14-digit codes that fail the check, on the server and inline. A scanner never returns such a code, so a stored one can only be a typo that will never match. Eight-digit codes are not checked (UPC-E). Alt: warn but allow (handles odd in-store labels printed as 13 digits, at the cost of dead codes).
- **Q-3 Where Flutter web loads the barcode library from.** `mobile_scanner` on web loads ZXing from `unpkg.com` at run time. This is true today for the member and owner QR pages as well. Rec: ship a pinned copy of `@zxing/library@0.21.3` under `web/` and call `setBarcodeLibraryScriptUrl` at start-up, so the web app does not run third-party CDN code and works when unpkg is blocked. This is a small, separate mobile change that also covers the existing scan pages, and security-and-privacy-reviewer should see it. Alt: keep unpkg (no change; supply-chain and availability risk).
- **Q-4 Barcode column in smart import.** Rec: not in S8. Q-1 makes imported "barcode" columns (stored as SKU) scannable already. Add a real `barcode` field to the products and inventory templates in a later import revision if vendors ask (it touches the import rules, the templates in two languages and the synonym list, where `barcode` now means `sku`).
- **Q-5 Pack and carton codes** (one scan = 6 or 12 units, e.g. an ITF-14 on a carton). Rec: not in v1. Map a carton code to the product only if one scan should add one unit. After scanning, use the −/+ stepper or type the quantity. Add `unitsPerScan` to `ProductCode` later if vendors who receive by the carton ask.

---

## 13. Acceptance criteria (UAT on Flutter web and portal from RC; isolated backend and DB)

Seed accounts and data:
- Vendor A owner; vendor A staff with `products`; staff with `sales` only; staff with `purchases` only; vendor B owner.
- Vendor A products:
  - "Whey Protein 1kg", SKU `WP-1KG`, approved, stock 10;
  - "Gym Gloves" with tracked variants S/M/L (stock 3/4/0);
  - "Shaker", SKU `6201234567886` (an EAN typed as SKU);
  - two products sharing the SKU `BAND`;
  - one archived product;
  - one later deleted.
- Vendor B: a product with the code `5012345678900`.
- Flags on: `VENDOR_TOOLS`, `VENDOR_STOCK_LEDGER`, `VENDOR_BARCODES`, `VENDOR_WALKIN_SALES`, `VENDOR_PURCHASES`.

**Camera ACs are "needs a real device"** (Android and iOS, plus Flutter web on a phone over HTTPS). Every other AC uses **Type code** or a USB/keyboard entry, which go through the same handler.

Gating and permissions
- **AC-1** With `VENDOR_BARCODES` off, or `VENDOR_STOCK_LEDGER` off, or options failing: no scan icon, no Barcodes section or dialog anywhere. `tools.barcodes` is false. The lookup answers 404 `feature_disabled`. `GET /vendor/products` has no `barcodes` key. A product save with `barcodes` succeeds and leaves stored codes unchanged. Enter in POS search still adds an exact SKU match.
- **AC-2** Turning the flag off and on again: codes added earlier are still there, unchanged.
- **AC-3** Staff with `sales` only: the scan icon is in the POS, but not on the Products tab, in the form or in the portal. An unknown code shows "Ask someone who manages products to add this code." with no add actions. `PUT /vendor/products/:id {addBarcodes}` returns 403.
- **AC-4** Staff with `purchases` only: scanning works in Receive stock (mobile and portal). Unknown codes show no add actions. With vendor A suspended, the lookup returns 403 `vendor_suspended`.
- **AC-5** Tenancy: vendor A looking up `5012345678900` (vendor B's code) gets `matches: []`, the same body as for a code nobody has. Vendor A can save `5012345678900` on its own product. Vendor B's product is unaffected. A FitFlex admin calling the lookup gets 403.

Codes on products
- **AC-6** In the app form, add `6201234567893` (valid) to Whey: it saves, the product stays **approved and listed** (shop search still finds it), and an audit row `product_barcodes_changed` exists. `/shop/products/:id`, `/shop/products` and the shop home do not contain the code, and searching the shop for it finds nothing.
- **AC-7** Validation, inline before Save and on the server:
  - `123` → too short;
  - a 49-character code → too long;
  - `AB 12` → bad characters;
  - `6201234567891` → "Check the last digit" (`invalid_check_digit`);
  - `12345670` (8 digits) → accepted;
  - the same code twice → `duplicate_barcode`;
  - a 21st code → `too_many_barcodes`.
- **AC-8** `036000291452` (UPC-A) saved on Gloves M is found by looking up `0036000291452` and `00036000291452`, and the other way round. `abc-123` and `ABC-123` are the same code.
- **AC-9** Saving a code that is already on another vendor A product returns 409 `barcode_in_use` naming that product, shown on the row. The rest of the save is not applied (the name change in the same save is not stored).
- **AC-10** A code on Gloves M follows a rename of M to "Medium" made in the same save. Removing variant L in the form removes its codes, with the info line. A crafted body with `variants:[{name:'S', barcodes:[…]}]` returns 400 `invalid_field {field: variants}`.
- **AC-11** Deleting a product frees its codes: the same code can be saved on another product straight away.
- **AC-12** Portal Barcodes dialog: the input has focus; typing a code and pressing Enter adds it to the list and keeps focus; three codes in a row then Save → toast, the row shows "· 3 barcodes", and the app form shows the same three codes. Esc with changes asks to discard.

Lookup
- **AC-13** Lookup of a variant code returns that variant with its own stock and no cost. A whole-product code on Gloves returns `variant: null` and `variants` with stock. The archived product's code returns `status: archived`. The deleted product's former code returns `[]`.
- **AC-14** SKU fallback: `6201234567886` (Shaker's SKU, not stored as a code) finds Shaker with `matchedBy: sku`. `BAND` returns two matches and the app shows the chooser. Once `6201234567886` is saved as a barcode on Whey, the lookup returns only Whey (barcode wins).
- **AC-15** More than 120 lookups in a minute from one person return 429 with `retryAfterSeconds`. The app shows "Too many scans. Wait {s} seconds." and resumes on its own.

POS
- **AC-16** POS, Type code `6201234567893` → Whey added (1 in this sale), haptic (device), announced. The same code again within 1.5 s (camera, device) is ignored. After 1.5 s it adds a second one. Undo removes the last one.
- **AC-17** A whole-product code on Gloves opens the variant picker with L disabled (0 left). Picking M adds Gloves M. An out-of-stock variant code shows "{name} is out of stock." An archived product's code shows "… is archived …" and adds nothing.
- **AC-18** Flutter web POS with a USB scanner (or typing + Enter) in the search field: a code match is added and the field clears and keeps focus. With `barcodesOn`, a code match wins over a text match.
- **AC-19** Offline (network off, product cache present): a code in the cache is added and the sale queues as in S3. A code not in the cache shows the "isn't in the saved product list" message with no add actions. Back online, the same code finds products added on another device (lookup).
- **AC-20** Unknown code with `products`: "Add this code to a product" → pick Whey → confirm → snack "Code added to Whey Protein 1kg", Whey is in the cart, and the code is on Whey's form. "New product with this code" opens the form with the code listed. Saving creates a pending product with the code.

Receive stock, count, form scan
- **AC-21** Mobile Receive stock: Scan items, enter Whey's code twice → one line, qty 2, unit cost prefilled per S9. The archived product's code is refused with the archived message. The delivery saves through S9 unchanged.
- **AC-22** Portal Receive stock: Enter with Whey's code adds a line, and again makes qty 2. Gloves' whole-product code adds a line with the variant select focused. An unknown code shows the inline message, and with `products` the quick-add dialog adds the code and the line.
- **AC-23** Products tab scan → Whey's action sheet (stock now 10) → Count stock opens the S1 sheet with Counted selected. "Count by scanning" with Whey's code entered 7 times → Counted 7, difference −3. Entering Gloves' code shows "That's Gym Gloves. Save this count first." and changes nothing. Save writes one `count` row (S1), and S1's `stock_changed` handling still applies.
- **AC-24** Product form scan icon (device): scanning fills the field and closes the sheet. Typed codes follow the same validation.

Camera (needs a real device unless noted)
- **AC-25** First scan tap asks for the camera. Denying it shows the denied view with Try again and Type code, and Type code works. On iOS after a denial, the text points to Settings. Flutter web over http (checkable on web) shows the insecure message, and Type code works. Torch shows only where the device has one, and toggles. Leaving the screen or backgrounding the app turns the camera off (the indicator goes out).
- **AC-26** Scanning a FitFlex member QR or event ticket in the POS shows "This isn't a product barcode." and sends no lookup (network log).
- **AC-27** EAN-13, UPC-A (Android and iOS on the same item), EAN-8 and a Code 128 in-store label all scan and match the stored code.

Accessibility and language
- **AC-28** Flutter web semantics tree: every control in §9 has its label. Closing the panel returns focus to the scan icon. Result and unknown-code messages are announced. Every target ≥ 48dp (portal ≥ 44px).
- **AC-29** At 375px in Swahili and at 200% text: no clipped text in the panel, result row, unknown-code actions, form Barcodes section or portal dialog. The Pause label collapses to an icon with a tooltip. Every new key exists in EN and SW (key parity test), and SW is marked for native review.

---

## 14. Tests

**Shared vectors:** `barcode-vectors.json`, copied into functions, portal and mobile tests and kept the same by a test that compares the copies. Each vector is `{input, codeKey | error}`, including UPC-A/EAN-13/GTIN-14 equivalents, a bad check digit, 8 digits, letters → upper case, spaces, too short, too long, non-ASCII.

**Functions** `specs/vendor-barcodes.specs.mjs` (isolated CI DB, `FITFLEX_USE_CI_DB=1`, check the DB name before running):
- **Gating:** lookup 404 with any of the three flags off; `tools.barcodes` false without the ledger; saves with the flag off ignore `barcodes` and keep stored codes; `GET /vendor/products` has no key when off.
- **Rules:** every B-1/B-3 error code; `codeKey` vectors; duplicate in the body; the 20 cap; `barcodes_conflict`; `invalid_field` shapes; `variants[].barcodes` refused.
- **Uniqueness and tenancy:** same code on two products of one vendor → 409 naming the product; same code at two vendors → both fine; lookup never returns another vendor's product, with an identical body for "exists elsewhere" and "exists nowhere".
- **Save path:** codes written in the `applyProductForm` / `createProduct` transaction; a `barcode_in_use` race (two concurrent saves) → one wins and the loser's fields, stock rows and codes all roll back; replace-set vs `addBarcodes` (no removals); variant rename with codes in the body; dropped variant deletes its codes (old-build body without `barcodes`); audit rows for each reason.
- **Approval:** adding/removing codes on an approved product keeps `approvalStatus` and listing (`listProducts` still returns it); codes absent from `/shop/products`, `/shop/products/:id`, `/shop/vendors/:id`, the shop home and public search.
- **Delete:** codes deleted; a code still held by a deleted product (simulate a failed cleanup) can be taken by another product.
- **Lookup:** variant code, whole-product code with `variants`, archived status, deleted excluded, SKU fallback (one and several, barcode wins), no cost or images in the body, `code_required` / `invalid_code`, rate limits per person and per vendor, guard matrix (products, sales, purchases on/off, suspended vendor, admin 403), route order (`/vendor/products/lookup` not caught by `:id`).
- **Migration:** up/down; down refuses with rows present.
- **Not touched:** settlement prepare output identical with codes present; moderation queue unchanged.

**Portal** `tests/e2e/vendor-barcodes.spec.ts`:
- gating (flag off: no Barcodes action; Receive Enter as S9)
- Barcodes dialog: autofocus, Enter adds and keeps focus, validation messages, `barcode_in_use` row error, Esc discard, save → row count
- products page search matches codes
- Receive stock Enter: code match, +1, whole-product code focuses the variant select, SKU fallback, several matches, unknown + quick-add (with and without `products`), archived message, 429 message
- 375px layout, focus return, axe on the dialog and the Receive page with the inline status

**Mobile** (`test/vendor/barcodes/`):
- `barcode_rules_test.dart`: shared vectors, check digit
- `vendor_scan_controller_test.dart`: debounce (same code within 1.5 s ignored, different code handled at once), one code in flight, local index before lookup, B-11 filter, offline miss → offline message, 429 pause and resume
- `vendor_scan_panel_test.dart` (fake camera stream / Type code): camera error states map to the right strings and actions, torch shown only when available, Pause stops the controller, dispose stops the camera, semantics labels, focus return
- `pos_scan_test.dart`: add, +1, Undo, variant picker, out of stock, archived, Enter-in-search priority (code → SKU → text), offline cache match, cache stores `barcodes` and never `costTzs`
- `receive_scan_test.dart`: line add and merge, cost prefill unchanged, archived refusal
- `count_by_scan_test.dart`: increments Counted, other-product warning, Save sends `expectedStock`
- `product_form_barcodes_test.dart`: add/remove, For dropdown, validation, variant rename/remove carries codes, server error mapping to rows, `barcodes` sent only when `barcodesOn`
- `unknown_code_test.dart`: actions by permission, Add this code (`addBarcodes`) then add to cart, `barcode_in_use` retry, New product prefill
- `vendor_tools_test.dart`: `barcodes` parsed and fails closed
- i18n key parity (EN/SW for every new key)

---

Standing reminders:
- `VENDOR_TOOLS`, `VENDOR_STOCK_LEDGER` and `VENDOR_BARCODES` stay off until the owner says otherwise.
- Camera scanning has not been checked on a real device. Flutter web UAT covers Type code and USB entry only. Android, iOS and phone-browser camera checks (AC-16 haptics, AC-25–AC-27) need a real device.
- Walk-in money and purchases are outside settlement; vendor settlement has never been exercised by hand. Shop (app) payments are manual (D-9).
- Vendor terms (data ownership; walk-in and supplier records; money not handled by FitFlex) are drafts pending Tanzanian counsel.
- All Swahili above is a draft for native review. "Msimbopau" is a new glossary term.
