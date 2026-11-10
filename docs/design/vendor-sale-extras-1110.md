# Walk-in sale extras: any-method reference, customer details, receipt as image/PDF — design spec

Status: APPROVED 2026-11-10 — owner accepted all recommendations Q-1..Q-13 ("accept all your recommendations, start the backend"). Author: design-agent.
Owner request 2026-11-10 (verbatim):
1. "On sales flow, make transaction reference appear both when the sale is done both through cash or other means (mobile money or banks) - but shouldn't be mandatory"
2. "During recording a sale, Add a section to input customer details (however not mandatory) with name, mobile, and type/category of customer (new, online, walk-in, returning etc)"
3. "Sales receipt should be shareable as a pdf/image"

(A 4th item, a back button on the merch page, is built separately and is not in this spec.)

This is a small change on top of finished slices, not a new slice. Builds on: `vendor-walkin-sales-s3.md` (POS, payment sheet, receipt, offline queue), `vendor-customers-s4.md` (customers, POS picker, pay later, A-02 privacy), `vendor-documents-s5.md` (share sheet, server PDF), `vendor-refunds-s7.md` (refund method/reference rule). Components, states and strings from those specs are reused; this spec overrides them only where it says so.

Read from `origin/release-candidate` (read only): functions 41851df, portal cb1b73c, mobile bb331b7.

Platforms: Flutter (Android and Flutter web; sales are recorded here) and the Next.js portal (sale detail only; the portal does not record walk-in sales). Roles: `vendor`, and `vendor_staff` with `sales`.

---

## What already exists in code (so builders don't duplicate it)

| Area | Exists on RC | Still to add |
|---|---|---|
| Reference rule (server) | `REFERENCE_REQUIRED` = mpesa, airtel_money, mixx, halopesa, bank (`src/shared/vendor-sale.mjs` l.18, owner rule 2026-10-19). `parseSale` drops any cash reference (l.103–105), 400 `reference_required` (l.107), max 100. **The same constant is imported by** `vendor-customer.mjs` (customer payments), `vendor-refund.mjs` (refunds) and `vendor-purchase.mjs` (supplier payments) | A sale-only rule (§1.2). Do **not** edit the shared constant |
| Reference rule (mobile) | `referenceRequiredMethods` (`sale_models.dart` l.23) used by the sale payment sheet, **and** by customer payments (`customer_models.dart` l.283), refunds (`refund_models.dart` l.363) and purchases (`purchase_draft_controller.dart`, `purchase_detail_page.dart`). `PaymentRow.toRequest` strips cash references (l.454). `payment_sheet.dart` clears the reference when Cash is tapped (~l.862) and hides the field for cash (~l.909) | Sale sheet only (§1.3) |
| Reference rule (portal) | `REFERENCE_REQUIRED` in `src/lib/vendor.ts` l.433, used by record-payment, purchases and refund dialogs. Sale detail prints `method (reference)` whenever a reference exists (`app/vendor/sales/page.tsx` l.589) | Nothing for #1 (it already shows a cash reference if one is stored) |
| Receipt payments line | `receipt_data.dart` l.480 and `ReceiptView` print `method (reference)` for any method with a reference | Nothing (cash references then print too) |
| Fingerprint | `saleFingerprint` includes each payment's `reference`; S4 fields only when used, "so fingerprints of S3 sales do not change" | `customerType` the same way (only when set) |
| Customers | `VendorCustomer` (manual: name 2–80 via `parseCustomer`, phone normalised to `+255XXXXXXXXX`, A-02 CHECK). `POST /vendor/customers` (staff with `sales` may send name + phone; `clientRef` idempotency; answers `phoneDuplicate`). `GET /vendor/customers?q=` (name or ≥3 phone digits; `sales`-only staff get the picker shape). POS chip `pos_page.dart` `_customerChip` + `customer_picker.dart` (search + quick add, online only: "Choosing a customer needs a connection.") | The inline section (§2) reuses these calls; no new customer endpoint |
| Sale ↔ customer | `VendorSale.customerId` (FK to the vendor's customer); sale view `customer {id, name, forgotten}`; S4: naming a customer needs `VENDOR_CUSTOMERS` (404 `feature_disabled` otherwise, after replay) | `VendorSale.customerType` (§2.3) |
| Offline queue | `offline_sale_queue.dart`: `shared_preferences` (localStorage on web), **not encrypted, not cleared at sign-out** (keyed vendor + person; "only Discard removes a queued sale"). Header comment: "no cost price and no customer data are stored … the customer's opaque id only". Draft cart `PosCart.toJson` keeps `customerId` only | Keep that rule (§2.7) |
| Receipt share | `receipt_page.dart` `_share`: documents off → `shareReceipt` text via `share_plus`; documents on → `openSaleShareSheet` (S5 server sheet; queued sale: text only). `sale_detail_page.dart` the same | Image + PDF on the device (§3) |
| Image capture | `capturePng` + `RepaintBoundary` (`member/events/results/results_widgets.dart` ~l.466); `XFile.fromData` share pattern (`EventShareActions.shareImage`, `DocumentActions.shareTypedFile`); web download `DocumentActions.download` (`saveBytesExport`) and `openPdfInNewTab` | Reuse; no new image package |
| PDF | No `pdf`/`printing` package in `pubspec.yaml` | `pdf` 3.13.1 (Q-12) |
| Fonts | Inter 400–900 TTF bundled in `assets/fonts/` | Embedded in the PDF (§3.5) |
| Flags | `VENDOR_CUSTOMERS` (ON in prod), `VENDOR_DOCUMENTS` (OFF in prod; links need `PUBLIC_API_URL`) | `VENDOR_SALE_REFERENCE_OPTIONAL`, `VENDOR_SALE_CUSTOMER_DETAILS` (§5) |

---

## Ground rules

- **Optional means optional.** Nothing in this change can block a sale. Every new field may be left empty, and Complete stays one tap for a cash sale with nothing extra typed.
- **Walk-in money never passes through FitFlex.** A reference is the vendor's own note, never checked against a provider.
- **No customer contact data on the device.** Name and mobile are typed while online and turned into a customer id before the sale is sent or queued. Queue and draft keep the id only (S3/S4 rule unchanged).
- **The customer's receipt never shows the customer's phone or the customer type.** Name only, as today.
- **Money display "TSh 45,000"**, integer shillings, EAT; "not a TRA fiscal receipt" on every receipt format.
- **Dormant**: #1 and #2 UI behind new flags; #3 per Q-11.

---

## 0. Scope, gating, permissions, components

### 0.1 In scope
- #1: the reference field on every payment row of a walk-in sale (cash, mobile money, card, bank, other), optional for all, in cash mode and in the pay-later "paid now" rows.
- #2: an optional **Customer** section in the payment sheet: name, mobile, customer type. Type stored on the sale.
- #3: receipt shared as **image (PNG)** or **PDF**, made on the device, from the receipt page and the sale detail.

Out of scope: customer payments, refunds and supplier payments keep their reference rules (Q-1); customer type in reports/CSV/list filters (Q-9); TRA fiscal receipts (S10); the merch-page back button.

### 0.2 Gating (fail closed, as S1–S9)
| Feature | Client shows it when | Server |
|---|---|---|
| #1 | `tools.walkInSales && tools.referenceOptional` | Accepts a missing reference for every method and stores a cash reference **always** (Q-2). Old apps still enforce the old rule client-side, so nothing visible changes until the flag is on |
| #2 type | `tools.walkInSales && tools.saleCustomerDetails` | Accepts and stores `customerType` **always** (pure bookkeeping, Q-8), so a sale queued while the flag was on still syncs after it goes off |
| #2 name + mobile | the above **and** `tools.customers` and online | Existing customer endpoints and their gates |
| #3 | `tools.walkInSales` (receipt page exists) | None (on device) |

Options missing a key (an older server) = off. Never show "feature off".

### 0.3 Permissions
No new permission. Recording a sale needs `sales`. Creating a customer from the section uses the S4 rule: staff with `sales` may send name + phone only (already allowed by `POST /vendor/customers`). The matched-customer line shows the name only (sales-only staff already get the picker shape: name + last 3 digits, never amounts).

### 0.4 Components (reuse; no new shared component)
| Need | Mobile | Portal |
|---|---|---|
| Reference | existing `FFTextField` in the payment row | — |
| Customer section | `FFCard` with an expand row (`InkWell` ≥56dp, chevron), `FFPill` wrap (type, single choice), `FFTextField` ×2, `FFAlert`, `FFButton` ghost "Search customers" (opens the existing `pickCustomer`) | — |
| Customer type on detail | `Text` line in the sale detail audit block | `<p>` line under the customer line |
| Receipt share sheet (documents off) | `showFFSheet` with rows built like the S5 sheet rows (icon, label, 56dp, busy spinner). Extract the S5 row into a small private-to-feature widget if convenient; **not** a new shared component | — |
| Image | `RepaintBoundary` around an off-screen `ReceiptView(audit: false)` + `capturePng` (move `capturePng` to `lib/shared/` so vendor code does not import member code) | — |
| PDF | `pdf` package widgets (§3.5) | Print button (Q-13) |

---

## 1. #1 Transaction reference on every method

### 1.1 Rule
With the flag on, every payment row of a walk-in sale has a **Reference (optional)** field, cash included. No method requires it. Empty is sent as no reference. Max 100 characters (unchanged). Leading/trailing spaces trimmed.

### 1.2 Backend (`src/shared/vendor-sale.mjs` `parseSale` only)
- New `SALE_REFERENCE_REQUIRED = new Set()` (empty) used by `parseSale`; `REFERENCE_REQUIRED` stays exported, unchanged, for customer payments, refunds and purchases.
- Cash: keep a string reference like any method (remove the cash strip at l.103–105). Type and length checks unchanged.
- No migration (`VendorSalePayment.reference` has no cash CHECK).
- Fingerprint unchanged in form; a cash reference simply becomes part of it when sent. Old apps never send one, so their retries still replay.
- Update the `POST /vendor/sales` description: "reference? (≤ 100; optional for every method; kept for cash too)". **Rule 6: endpoint behaviour change.**
- The S5 receipt document, if it prints `method (reference)` generically, shows cash references too: builder confirms in `vendor-documents.mjs` and adds a spec line.

### 1.3 Mobile (`payment_sheet.dart`, `sale_models.dart`)
- Flag on: the reference field shows under **every** method once a method is chosen, label `vendor.pos.referenceOptional` "Reference (optional)". Helper text: non-cash keeps `vendor.pos.referenceHint`; cash uses new `vendor.pos.referenceHintCash`.
- Tapping Cash no longer clears what was typed (switching method keeps the reference).
- `PaymentRow.needsReference` → false for every method when `referenceOptional`; `toRequest` sends a cash reference. `missingReferences` is then always empty.
- Field order per row (unchanged otherwise): method pills → amount (+ quick cash) → reference.
- Flag off: exactly today's behaviour.
- The other forms that import `referenceRequiredMethods` keep it untouched (give the sale sheet its own getter, e.g. `saleReferenceRequired(tools)`).

### 1.4 Portal
No code change: `SaleDetail` already prints `Cash (ABC123)` when a reference exists. Add an e2e case (AC-6).

### 1.5 Old/new combinations (contract-checker verifies each)
| Server | App | Result |
|---|---|---|
| new | old | Old app still asks for M-Pesa/bank references and strips cash ones. Accepted. No change visible |
| new, flag off | new | `referenceOptional` false → app behaves as today |
| new, flag on | new | Optional everywhere, cash reference stored and shown |
| old | new | Options have no `referenceOptional` → app behaves as today (no `reference_required` surprises). This is why the app reads the option and why functions deploy first |
| new, flag turned off after use | new | A queued M-Pesa sale without a reference still syncs (server rule is unconditional) |

---

## 2. #2 Customer details on a sale

### 2.1 Rule
An optional **Customer** section in the payment sheet with **Name**, **Mobile** and **Customer type**. Leaving it closed or empty records the sale exactly as today.
- **Type** (single choice, optional): New, Returning, Walk-in, Online, Other (Q-5). Stored on the sale: it describes this purchase, not the person.
- **Name / Mobile** become a link to a `VendorCustomer` (Q-3):
  - Mobile typed and valid → the app looks it up (`GET /vendor/customers?q=<9 local digits>`, the S4 picker search). One live match → linked automatically, shown "Already a customer: {name}" (stored name wins; the typed name is ignored and the field is replaced by the match line). Type pre-selects **Returning** if none was chosen.
  - No match → on Complete the app creates a manual customer (`POST /vendor/customers {clientRef, name, phone}`) then sends the sale with its `customerId`. Type pre-selects **New** if none was chosen.
  - Name without mobile → creates a customer with the name only (Q-4). Mobile without name → inline error `vendor.pos.cust.nameNeeded`.
  - "Search customers" opens the existing picker for anyone already saved without a phone.
- A customer already chosen with the cart chip shows in the section as the linked customer (one source: `PosCart.customerId`). Removing it in either place removes it from both.
- Pay later: the customer is already required by the S4 credit body; the section shows **Type only** there.

### 2.2 Validation (same as the S4 customer form)
- Name 2–80 characters after trim (`vendor.pos.cust.nameLength`).
- Mobile: `normalisePhone` rules (07…, 06…, 7…, 6…, 255…, +255…, spaces/dashes allowed) → `vendor.customers.phoneInvalid`. The client mirrors it; the server is the authority.
- Errors appear under the field on blur and on Complete; Complete focuses the first invalid field. An invalid mobile **blocks** Complete (it would otherwise be silently dropped); the seller can clear it.

### 2.3 Data and API (functions)
- Migration `<after the latest>-vendor-sale-customer-type.cjs`: `VendorSale.customerType text NULL`, CHECK `customerType IS NULL OR customerType IN ('new','returning','walk_in','online','other')`. Down drops the column. No backfill.
- `POST /vendor/sales` body: `customerType?` (one of the five; else 400 `invalid_field {field: 'customerType', allowed}`). Stored always (Q-8). In `saleFingerprint` **only when set**, like the S4 fields. **Rule 6: endpoint signature change (additive).**
- Reads (additive): `customerType|null` on `GET /vendor/sales/:id`, `GET /vendor/sales` rows, `GET /vendor/customers/:id/sales` rows and `/vendor/customers/:id/sales/:saleId`.
- `/vendor/tools/options` and `/vendor/me.tools`: `saleCustomerDetails` (VENDOR_TOOLS + VENDOR_SALE_CUSTOMER_DETAILS) and `referenceOptional` (VENDOR_TOOLS + VENDOR_SALE_REFERENCE_OPTIONAL). Add both names to `VENDOR_TOOLS_FLAGS`.
- Audit: the existing sale-recorded audit row gains `customerType` in its detail if it stores body fields; no new action.
- No change to `POST /vendor/customers`.

### 2.4 Layout — phone 375 (payment sheet, cash mode)
Order (new item marked ★):
1. Amount due
2. Payment rows (with the reference field from #1)
3. Add payment
4. Status line
5. Pay later entry (S4)
6. ★ **Customer (optional)** card, collapsed by default:
   - Collapsed row (56dp): person icon · "Customer (optional)" · summary on a second line (`{name} · {type}`, or `vendor.pos.cust.empty` "Add name, mobile or type") · chevron. `Semantics(button, expanded: false)`.
   - Expanded, top to bottom: **Customer type** label + 5 `FFPill`s (wrap; tap the selected one again to clear) → **Customer name** field → **Mobile number** field (phone keyboard, hint "e.g. 0712 345 678") → match line or error → "Search customers" ghost button. When linked: a row with the name, "Already a customer" muted, and a 48×48 remove button (`vendor.pos.customer.remove`); the name/mobile fields hide.
   - Customers off (`tools.customers` false) or offline: name/mobile/search hidden; type pills only; offline adds the muted line `vendor.pos.cust.offline`.
7. Problem alert / money notice / Complete (unchanged)

Flutter web desktop (sheet ≥560dp wide): same order; name and mobile sit side by side (each ≥240dp); pills on one row when they fit. Max sheet width as today.

Swahili: pills "Mpya", "Anayerudi", "Wa dukani", "Mtandaoni", "Nyingine" wrap to two rows at 375 and at 200% text; never truncate. The collapsed summary wraps to two lines.

### 2.5 Complete, in order
1. Validate (2.2). 2. If name/mobile typed and no customer linked: create the customer (stable `clientRef` per typed name+mobile, so a retry replays). 3. `setCustomer(id)` (S4: resets the sale `clientRef`; the sale has not been sent yet). 4. Send the sale with `customerId` and `customerType`.
- Create fails with no answer (network) → `FFAlert` error `vendor.pos.cust.saveFailed` with **Try again** and **Complete without customer** (keeps the type; clears name/mobile). The sale is never queued holding a name or phone.
- Create answers 400 `name_invalid`/`phone_invalid` → field errors. 404 `feature_disabled` (customers turned off) → hide name/mobile, keep type, show `vendor.pos.cust.saveFailed`.
- Sale answers 404/409 `customer_not_found`/`customer_archived` → existing `vendor.pos.customer.gone`.
- The created customer stays even if the sale is then refused (same as S4 quick add).

### 2.6 States
| State | Section shows |
|---|---|
| Flag off / options failed | Nothing (today's sheet) |
| Collapsed, empty | "Add name, mobile or type" |
| Looking up mobile | 16dp spinner in the mobile field suffix; Complete stays enabled (lookup result is optional) |
| Matched | "Already a customer: {name}", Returning pre-selected if no type, remove button |
| No match | Nothing extra; New pre-selected on Complete if no type |
| Several matches (rare: duplicate phones) | No auto-link; "{n} customers have this number. Search customers to choose one." (`vendor.pos.cust.manyMatches`) |
| Error (validation / save failed) | Inline field error / `FFAlert` as 2.5 |
| Offline | Type only + `vendor.pos.cust.offline` |
| Customers tool off | Type only |
| Saving | Fields and pills disabled, Complete spinner (existing) |
| Pay later | Type only (customer picked in the credit body) |
| Queued sale (after Complete) | Receipt as today: "Customer shown after sync" when a customer is linked |
| Role-restricted | Sales-only staff: same section; matched line shows name only |

### 2.7 Offline and storage (Q-7)
- Name and mobile typed in the section live **in memory only** (never in `PosCart.toJson`, never in the queue). Leaving the POS discards them.
- `customerType` is not personal data: it is kept in the draft cart and in the queued body.
- Queued sale body: `customerId?` (existing) + `customerType?`. Nothing else.

### 2.8 Where the type is shown (Q-9)
- Mobile sale detail (`sale_detail_page.dart`, audit block): "Customer type: Returning".
- Portal sale detail: the same line under the customer line (`vendor.sales.customerTypeLine`), with its own `data-testid="sale-customer-type"`.
- **Not** on the receipt, text share, image, PDF or S5 documents. Not in the sales list, filters, CSV or reports in this change.

---

## 3. #3 Receipt as image or PDF

### 3.1 Rule
"Share receipt" offers **Image**, **PDF** and **Text**, all made on the device from the same `ReceiptData` and in the receipt's chosen language (`ReceiptLanguageToggle`). Works offline and for a queued sale (provisional heading `vendor.pos.shareProvisional`, no number). Content = the customer receipt (`ReceiptView(audit: false)`), including business name, TIN/VRN when shown today, customer name (never phone), lines, discounts, VAT lines when present, payments with references, change/balance, served by, footer and **"This is not a TRA fiscal receipt."** Voided sales: Share stays hidden (unchanged).

### 3.2 Entry points
- Receipt page after a sale (`sales-receipt-share`) and sale detail Share.
- **Documents off** (prod today): Share opens a new sheet titled `vendor.pos.share` "Share receipt" with three rows: Image, PDF, Share as text. 
- **Documents on**: the S5 sheet keeps its rows and gains **Image** (above "Share as text"). Its PDF row keeps the server PDF; when the sale is queued or the device is offline (today: disabled) it falls back to the on-device PDF instead (Q-10).

### 3.3 Actions per platform
| Row | Android | Flutter web |
|---|---|---|
| Image | `share_plus` file `image/png` | Download the PNG (`DocumentActions.download`) |
| PDF | `share_plus` file `application/pdf` | Open in a new tab (`openPdfInNewTab`; the browser prints or saves), download if the tab is blocked |
| Text | today's `shareReceipt` | today's |

Labels on web: "Download image", "Open PDF" (existing key). File names: `receipt-R-000123.png|pdf`; queued: `receipt-pending-<yyyyMMdd-HHmm>.png|pdf` (not translated; file names only).

### 3.4 Image
- Render `ReceiptView(audit: false)` off-screen inside a `RepaintBoundary`, **light theme always**, white background, fixed width 360 logical px, padding 16, pixel ratio 3 (1080 px wide).
- If the rendered height would exceed 4,000 logical px (about 60 lines), use pixel ratio 2; above 6,000 logical px the Image row is disabled with `vendor.receipt.tooLongImage` (PDF still works). Reason: GPU texture limits on low-end phones and web.
- FitFlex wordmark is **not** added (the receipt is the vendor's).

### 3.5 PDF
- `pdf` package (Q-12), `pw.Document` with metadata title "Receipt R-000123" in the chosen language.
- Page: **80 mm roll width** (226.8 pt), height to content (`PdfPageFormat(80*mm, double.infinity, marginAll: 4*mm)`), so it prints on receipt printers and reads on phones. A4 is not offered (Q-10 keeps A4 in the server PDF).
- Fonts: embed bundled **Inter 400 and 700** (`rootBundle`); never the built-in Helvetica (no glyphs beyond Latin-1; business and product names may contain others). Tabular figures for amounts.
- Same block order and wording as `ReceiptView`; amounts right-aligned; the fiscal line last.
- Text is real text (selectable, readable by screen readers), not an embedded image.

### 3.6 States
| State | Sheet |
|---|---|
| Idle | Three rows enabled |
| Preparing | The tapped row shows a spinner and `vendor.receipt.preparing`; other rows disabled; sheet cannot be dismissed while preparing (<2 s target) |
| Failed (render/encode error) | `FFAlert` `vendor.receipt.fileFailed`; rows enabled again |
| Shared / downloaded | Sheet closes; web download shows snack `vendor.receipt.downloaded` |
| User cancelled the system share | Sheet closes, no message |
| Queued sale | All three rows work; heading provisional |
| Offline | All three rows work (documents on: link rows disabled as S5) |
| Too long for image | Image row disabled with reason |
| Language | Files follow the receipt's language toggle |

---

## 4. Navigation
- No new routes. The customer section is inside the payment sheet; "Search customers" pushes the existing picker sheet and returns to the payment sheet with the customer linked.
- Back / Escape in the payment sheet: closes it (unchanged); typed name/mobile are discarded, type stays in the draft.
- Share sheet: Back closes the sheet; after sharing the user stays on the receipt page / sale detail.
- Deep links: none new.
- After completion: receipt page as today.

---

## 5. Flags, deploy order, rule-6 callouts

Flags (both under `VENDOR_TOOLS`, off unless set): **`VENDOR_SALE_REFERENCE_OPTIONAL`** (#1 UI) and **`VENDOR_SALE_CUSTOMER_DETAILS`** (#2 UI). #3: no flag (Q-11).

Deploy order: **functions → portal → mobile** (standard). Functions carries the migration, the relaxed `parseSale`, `customerType`, the two options keys. Portal (type line) is read-only and tolerates a missing field. Mobile reads the options keys, so it is safe against an older server. Switch the flags on only after the new app is the one vendors use; turning them off later never breaks queued sales (§1.5, Q-8).

Rule 6 (each PR states these):
1. **Endpoint behaviour/signature:** `POST /vendor/sales` — payment `reference` optional for every method and kept for cash (relaxed validation); new optional `customerType`; additive `customerType` on sale reads and customer-sale reads; additive options keys.
2. **Migration:** `VendorSale.customerType` + CHECK.
3. **Not touched:** pricing constants, payout engine, check-in, `src/auth/*`, settlement, customer payments, refunds, purchases (their reference rules stay).
4. Reviews: security-and-privacy-reviewer (customer contact data stays off the device queue; receipt files contain customer name; phone never printed), contract-checker (§1.5 matrix, additive shapes), i18n-swahili-auditor.

---

## 6. Accessibility
- **Targets**: pills, rows, remove and expand controls ≥48dp on mobile; share rows 56dp; portal Print button `min-h-11`.
- **Semantics labels (Flutter web tree)**:

| Control | Label |
|---|---|
| Section expand row | `vendor.pos.cust.sectionA11y` "Customer details, optional" + summary, expanded/collapsed state |
| Type pills | the type name + selected state, `inMutuallyExclusiveGroup` |
| Name / Mobile fields | their labels; errors announced |
| Match line | "Already a customer: {name}" (polite live region) |
| Remove customer | existing `vendor.pos.customer.remove` "Remove {name} from this sale" |
| Reference field | "Reference (optional)" + method, e.g. "Reference (optional), Cash" (`vendor.pos.a11y.referenceFor`) |
| Share rows | `vendor.receipt.a11y.image` / `.pdf` / `.downloadImage`, and existing `vendor.documents.a11y.text` / `.openPdf` |
| Preparing | polite live region `vendor.receipt.preparing` |

- **Focus order (payment sheet)**: amount due → payment rows (method → amount → reference) → add payment → pay later → customer expand row → (expanded) type pills → name → mobile → search customers → Complete. Expanding moves focus to the first pill; collapsing returns it to the expand row. On a validation error focus goes to the first invalid field.
- **Focus order (share sheet)**: title → Image → PDF → Share as text (→ S5 rows when documents on). After closing, focus returns to the Share button.
- **Contrast** ≥4.5:1 light and dark; selected pill is filled + bold, never colour alone. The receipt image is always light (black on white).
- **Text scale 200%**: pills wrap, collapsed summary wraps, fields stack on desktop width too.

---

## 7. Strings (EN + SW; every SW string is a DRAFT for native review)
Glossary terms (`docs/localization/fitflex-terminology-glossary.md`): transaction reference = **namba ya muamala**; receipt = **risiti**; share receipt = **Tuma risiti**; vendor's customer = **mteja** (Mteja wa dukani); online = **mtandaoni**; walk-in sale = mauzo ya dukani.

Mobile (`lib/shared/i18n.dart`); portal keys with the same names where used.

| Key | EN | SW (draft) |
|---|---|---|
| vendor.pos.referenceOptional (exists) | Reference (optional) | Namba ya muamala (si lazima) |
| vendor.pos.referenceHint (exists) | From the payment SMS or card slip. | Kutoka SMS ya malipo au risiti ya kadi. |
| vendor.pos.referenceHintCash | Any number that helps you find this payment later. | Namba yoyote itakayokusaidia kupata malipo haya baadaye. |
| vendor.pos.a11y.referenceFor | Reference (optional), {method} | Namba ya muamala (si lazima), {method} |
| vendor.pos.cust.section | Customer (optional) | Mteja (si lazima) |
| vendor.pos.cust.sectionA11y | Customer details, optional | Taarifa za mteja, si lazima |
| vendor.pos.cust.empty | Add name, mobile or type | Ongeza jina, simu au aina |
| vendor.pos.cust.type | Customer type | Aina ya mteja |
| vendor.customerType.new | New | Mpya |
| vendor.customerType.returning | Returning | Anayerudi |
| vendor.customerType.walk_in | Walk-in | Wa dukani |
| vendor.customerType.online | Online | Mtandaoni |
| vendor.customerType.other | Other | Nyingine |
| vendor.pos.cust.name | Customer name | Jina la mteja |
| vendor.pos.cust.mobile | Mobile number | Namba ya simu |
| vendor.pos.cust.mobileHint | e.g. 0712 345 678 | mf. 0712 345 678 |
| vendor.customers.phoneInvalid (exists) | Enter a valid Tanzanian phone number. | Weka namba sahihi ya simu ya Tanzania. |
| vendor.pos.cust.nameNeeded | Add a name to save this number. | Weka jina ili kuhifadhi namba hii. |
| vendor.pos.cust.nameLength | Name must be 2 to 80 characters. | Jina liwe na herufi 2 hadi 80. |
| vendor.pos.cust.matched | Already a customer: {name} | Tayari ni mteja: {name} |
| vendor.pos.cust.manyMatches | {n} customers have this number. Search customers to choose one. | Wateja {n} wana namba hii. Tafuta wateja ili uchague mmoja. |
| vendor.pos.cust.search | Search customers | Tafuta wateja |
| vendor.pos.cust.offline | Name and mobile need a connection. You can still choose the customer type. | Jina na namba ya simu vinahitaji intaneti. Bado unaweza kuchagua aina ya mteja. |
| vendor.pos.cust.saveFailed | Couldn't save the customer. Try again, or complete the sale without them. | Imeshindikana kuhifadhi mteja. Jaribu tena, au kamilisha mauzo bila mteja. |
| vendor.pos.cust.completeWithout | Complete without customer | Kamilisha bila mteja |
| vendor.sales.customerTypeLine | Customer type: {type} | Aina ya mteja: {type} |
| vendor.pos.share (exists, sheet title) | Share receipt | Tuma risiti |
| vendor.receipt.asImage | Image | Picha |
| vendor.receipt.asPdf | PDF | PDF |
| vendor.documents.shareText (exists) | Share as text | Tuma kama maandishi |
| vendor.receipt.downloadImage | Download image | Pakua picha |
| vendor.documents.openPdf (exists) | Open PDF | (existing) |
| vendor.receipt.a11y.image | Share receipt {number} as an image | Tuma risiti {number} kama picha |
| vendor.receipt.a11y.pdf | Share receipt {number} as a PDF | Tuma risiti {number} kama PDF |
| vendor.receipt.a11y.downloadImage | Download receipt {number} as an image | Pakua risiti {number} kama picha |
| vendor.receipt.preparing | Preparing… | Inaandaa… |
| vendor.receipt.fileFailed | Couldn't make the file. Try again, or share as text. | Imeshindikana kutengeneza faili. Jaribu tena, au tuma kama maandishi. |
| vendor.receipt.tooLongImage | This receipt is too long for an image. Use PDF. | Risiti hii ni ndefu mno kwa picha. Tumia PDF. |
| vendor.receipt.downloaded | Downloaded | Imepakuliwa |
| vendor.sales.print (portal, Q-13) | Print or save as PDF | Chapisha au hifadhi kama PDF |

For a queued receipt, `{number}` in a11y labels is replaced by the provisional ref.

Swahili overflow: longest are `cust.offline` (~80) and `cust.saveFailed` (~75), both in wrapping alerts/helper lines. Pills: "Anayerudi" (9) and "Mtandaoni" (9) fit. "Kamilisha bila mteja" (20) is a full-width secondary button. Collapsed summary wraps to two lines; never truncated.

---

## 8. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `VendorSalePayment.reference` | kept for cash | column **exists**; parse rule **requested** |
| `VendorSale.customerType` | `new|returning|walk_in|online|other|null` | **new (migration)** |
| `POST /vendor/sales` | `customerType?`; reference optional for all methods | **requested (rule 6)** |
| Sale reads (`/vendor/sales/:id`, list rows, customer-sale reads) | `customerType` | **requested (additive)** |
| `/vendor/tools/options`, `/vendor/me.tools` | `referenceOptional`, `saleCustomerDetails` | **requested**; mobile `VendorTools` + portal type to add |
| `GET /vendor/customers?q=` | digits search returning `{id, name}` for sales-only staff | **exists** (builder confirms a 9-digit query matches the normalised phone exactly) |
| `POST /vendor/customers` | `clientRef`, `name`, `phone` → `{customer, phoneDuplicate}` | **exists** |

---

## 9. Open questions (each with a recommendation)

- **Q-1 Which flows get the optional reference.** Rec: walk-in sale payments only (cash mode and the pay-later "paid now" rows), as the owner said "sales flow". Customer payments (S4), refunds (S7) and supplier payments (S9) keep "required for mobile money and bank, none for cash". Alt: the same rule everywhere for consistency.
- **Q-2 How #1 is switched.** Rec: the server stops requiring references and keeps cash references unconditionally (old apps still enforce the old rule, so nobody notices), and the app UI is behind `VENDOR_SALE_REFERENCE_OPTIONAL` via `options.referenceOptional`. This lets functions deploy first, protects new apps against an old server, and keeps queued sales syncable if the flag is ever turned off. Alt: no flag at all (owner asked directly; rule 4 needs the owner to say so).
- **Q-3 How name and mobile become a customer.** Rec: the app reuses S4: look up by exact mobile, link the match, else create a manual customer with `POST /vendor/customers` just before sending the sale; `POST /vendor/sales` only gains `customerType`. Keeps the queue free of contact data. Alt: send `customer {name, phone}` inside the sale body for a server-side find-or-create in one transaction (atomic, but a bigger endpoint change and the queued body would hold name and phone).
- **Q-4 Partial details.** Rec: name alone creates a customer (duplicates of common names are possible, as with S4 quick add); mobile alone is refused inline ("Add a name to save this number") because a walk-in customer needs a name. Alt: allow mobile alone and save the number as the name.
- **Q-5 Customer type values.** The owner's list mixes history (new, returning) with channel (walk-in, online). Rec: one optional single-choice field as described: New, Returning, Walk-in, Online, Other. Alt: two fields, "History" (New/Returning) and "How they bought" (Walk-in/Online/Phone/WhatsApp).
- **Q-6 Pre-selecting the type.** Rec: Returning when an existing customer is linked, New when a new one is created, nothing otherwise; the seller can change it. The server never computes it.
- **Q-7 Offline.** Rec: name and mobile need a connection (as the S4 picker today); the type works offline and is queued. Reason: the queue is unencrypted `shared_preferences`/localStorage, is not cleared at sign-out, and S3/S4 deliberately keep only the customer id there. Alt (the brief's default): queue name and phone and clear on sync/sign-out. Not recommended: clearing at sign-out would also delete unsynced sales.
- **Q-8 Gating of #2.** Rec: `customerType` is accepted and stored by the server always (bookkeeping); `VENDOR_SALE_CUSTOMER_DETAILS` gates only the UI. The type works with `VENDOR_CUSTOMERS` off; name and mobile need it (they live in `VendorCustomer`). Prod has `VENDOR_CUSTOMERS` on.
- **Q-9 Where the type appears.** Rec: sale detail in app and portal only. Not on any receipt or document (it is an internal label), not in list filters, CSV or reports for now. Ask again after vendors use it ("sales by customer type" report).
- **Q-10 Receipt files when documents are on.** Rec: the S5 sheet gains an Image row; its PDF row stays the server PDF (with TIN/VRN, A4/80 mm) and falls back to the on-device 80 mm PDF when the sale is queued or the device is offline. With documents off (prod), a new three-row sheet: Image, PDF, Text.
- **Q-11 Flag for #3.** Rec: no flag. It only changes what the vendor's own Share button produces, works without the server, and sends nothing until the vendor chooses to share. Rule 4 says new behaviour ships dormant unless the owner says otherwise, so the owner must confirm. Alt: a client-read options key `VENDOR_RECEIPT_FILES`.
- **Q-12 New dependency `pdf` 3.13.1.** Pure Dart, Apache-2.0, supports Android, iOS and web. It needs Dart ≥3.12; the lockfile is already at 3.12 / Flutter 3.44. `archive`, `image`, `xml` and `crypto` are already in the lockfile; `barcode`, `bidi`, `path_parsing` and `vector_math` would be new. Embedding Inter adds about 300–600 KB to each PDF. Rec: accept. `printing` is not needed. Alt: image only, with no PDF from the device.
- **Q-13 Portal.** Rec: add a "Print or save as PDF" button on the portal sale detail when documents are off (`window.print()` with a print stylesheet that shows the receipt block only). Today the portal offers "Copy text" only, and browsers turn printing into Save as PDF. Alt: no portal change; vendors share from the app.

---

## 10. Acceptance criteria (UAT on Flutter web from RC + portal; isolated backend and DB)

Seed: vendor owner; staff with `sales` only; staff with `sales` + `customers`; a manual customer "Asha" with phone 0712 345 678; two manual customers sharing 0755 000 111; products with stock; `VENDOR_CUSTOMERS` on, `VENDOR_DOCUMENTS` off unless stated.

#1 Reference
- **AC-1** `VENDOR_SALE_REFERENCE_OPTIONAL` off: the payment sheet is unchanged (M-Pesa shows "Transaction reference" and requires it; Cash shows no reference field).
- **AC-2** Flag on: choosing each of the 8 methods shows "Reference (optional)" under the amount; Cash shows the cash hint. Complete works with every reference empty, including M-Pesa and Bank.
- **AC-3** Flag on: Cash TSh 10,000 with reference "TILL-889" → the receipt shows "Cash (TILL-889)"; `GET /vendor/sales/:id` returns `reference: "TILL-889"` on the cash payment.
- **AC-4** Switching a row from M-Pesa to Cash keeps the typed reference.
- **AC-5** A 101-character reference cannot be typed (counter at 100); a crafted 101-character request returns 400 `invalid_payment {field: reference}`.
- **AC-6** Portal sale detail shows "Cash (TILL-889)".
- **AC-7** An old app build (RC before this change) against the new server still requires M-Pesa references and records sales normally; customer payment, refund and supplier payment forms still require a reference for M-Pesa/bank (Q-1).
- **AC-8** A crafted `POST /vendor/sales` with M-Pesa and no reference returns 201 whether the flag is on or off.

#2 Customer details
- **AC-9** `VENDOR_SALE_CUSTOMER_DETAILS` off: no Customer section; sending `customerType` in a crafted request is still stored.
- **AC-10** Flag on: the section is collapsed and reads "Add name, mobile or type"; Complete with it untouched records a sale with no customer and `customerType: null`.
- **AC-11** Type only (Walk-in) → sale detail in app and portal shows "Customer type: Walk-in"; the receipt, text share, image and PDF do not show the type.
- **AC-12** Mobile "0712 345 678" → "Already a customer: Asha" appears, Returning is pre-selected, and the sale links Asha (`customer.id` = Asha's id). No new customer is created.
- **AC-13** New name "Juma" + mobile "0688 123 456" → after Complete, a manual customer Juma (+255688123456) exists, the sale links it, type is New unless changed.
- **AC-14** Name "Neema" without mobile → customer Neema (no phone) is created and linked.
- **AC-15** Mobile without name → "Add a name to save this number." under Name; Complete focuses Name. Mobile "12345" → "Enter a valid Tanzanian phone number."
- **AC-16** Mobile 0755 000 111 (two customers) → no auto-link; the "2 customers have this number" line shows; "Search customers" opens the picker and choosing one links it.
- **AC-17** Staff with `sales` only can do AC-12 and AC-13; the matched line shows the name only, no amounts.
- **AC-18** Offline (DevTools offline on web): name/mobile are hidden, the offline line shows, type pills work; the queued sale's stored body (localStorage `vendor_sale_queue.*`) contains `customerType` and no name or phone; after reconnecting it syncs with the type.
- **AC-19** Draft cart in localStorage (`vendor_pos_draft.*`) never contains a typed name or phone; reloading the POS loses them and keeps the type.
- **AC-20** Customer create fails (block `/vendor/customers` in DevTools): "Couldn't save the customer…" with Try again and Complete without customer; the latter records the sale with the type and no customer.
- **AC-21** Pay later: the section shows Type only; the credit sale stores the type.
- **AC-22** `VENDOR_CUSTOMERS` off: section shows Type only.
- **AC-23** Retrying a sale after a lost answer with the same `clientRef` and type replays (Idempotent-Replay header); a pre-change queued sale (no type) still replays.

#3 Receipt files
- **AC-24** Documents off, receipt page Share → sheet with Image, PDF (web: "Download image", "Open PDF") and Share as text.
- **AC-25** Web: Image downloads `receipt-R-xxxxxx.png`, 1080 px wide, white background in dark mode too, content matching the on-screen receipt, ending "This is not a TRA fiscal receipt."
- **AC-26** Web: PDF opens in a new tab, 80 mm wide, text selectable, Inter font, same content; in Swahili when the receipt toggle is Swahili.
- **AC-27** A queued sale (offline): Image and PDF both work and show the same queued heading as the on-screen receipt ("Receipt", "Waiting to sync", temporary ref; changed after UAT D5, 2026-11-10); file name `receipt-pending-….`
- **AC-28** A sale with a customer shows the customer name in image and PDF and never the phone.
- **AC-29** A 100-line sale: Image row disabled with "This receipt is too long for an image. Use PDF."; PDF works.
- **AC-30** Documents on: the S5 sheet has an Image row; offline its PDF row produces the on-device PDF instead of being disabled.
- **AC-31** Sale detail Share offers the same rows as the receipt page. Voided sale: no Share (unchanged).
- **AC-32** Android (needs a real device): Image and PDF open the system share sheet and reach WhatsApp as files.

A11y and language
- **AC-33** Flutter web semantics tree: every pill, field, expand row, remove button and share row has the label in §6; focus order matches §6 with keyboard only.
- **AC-34** Swahili at 375 px and 200% text: pills wrap, no truncation, Complete and the alert buttons stay visible.
- **AC-35** Portal (Q-13 if accepted): "Print or save as PDF" opens the browser print dialog showing the receipt block only.

---

## 11. Tests
- functions: `parseSale` (empty reference for every method; cash reference kept; 101 chars refused; `customerType` valid/invalid), fingerprint stable for sales without type, migration up/down, options keys, sale reads include `customerType`, customer payments/refunds/purchases still `reference_required` (regression). CI DB only.
- mobile: payment sheet with the flag on/off (reference per method, cash keeps reference), customer section (match, many matches, create, name-needed, offline, save failed, pay later), draft/queue contain no name/phone, receipt sheet rows per platform (fakes for share/download), PDF builder produces a document with the fiscal line in both languages, image capture height rule.
- portal: e2e sale detail shows cash reference and customer type; print button (if Q-13).
