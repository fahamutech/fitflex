# Vendor documents: share links, PDF, WhatsApp/SMS, VAT (S5): design spec

Status: DRAFT for review. Date: 2026-10-20. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0 (F9 PDF, F10 `PUBLIC_API_URL`), §1, S5, §3 (A-02), §4, §5. Decisions applied: **O-4** PDF via `pdfkit`, print view as fallback; **O-5** links have no expiry, can be revoked, and only the token hash is stored; **O-6** continuous per-vendor numbers `R-`, `INV-`, `CN-`, `PMT-`; **O-7** SMS through the device intent only; **O-10** commission stays on the VAT-inclusive gross until DR-05; **O-11** the vendor is the seller of record; **O-12** TIN/VRN appear only after a KYC reviewer verifies the VRN certificate.
Builds on: `vendor-stock-ledger-s1.md`, `vendor-portal-s2.md`, `vendor-walkin-sales-s3.md`, `vendor-customers-s4.md`. Components, states, payment rules and S3/S4 strings are reused. This spec overrides them only where it says so.
Read from `origin/release-candidate`:
- functions 09709f5: `functions/shop.mjs` (options sample already has `documents`, `vat`); `src/services/shop-service.mjs` (`orderInvoice` returns plain text, titled "FitFlex Marketplace Invoice"; `PUBLIC_PROFILE_FIELDS` includes `logo`); `db/migrations/20261230120000-vendor-walkin-sales.cjs` (line `vatCode`, `vatRatePct`, `vatTzs`; sale CHECK `totalTzs = subtotal − lineDiscount − discount + vatTzs`); `src/shared/partner-kyc-requirements.mjs` (vendor KYC has `tin` and `tin_certificate`, no VAT item); `src/services/account-recovery-service.mjs` (`PUBLIC_API_URL` falls back to `https://fitflex-faas.bfast.smartstock.co.tz`); `src/shared/vendor-rate-limit.mjs`.
- mobile b4f5d9d: `lib/screens/vendor/sales/receipt_page.dart` (`SharePlus` text), `lib/screens/vendor/customers/statement_page.dart`, `payment_sheets.dart`, `lib/shared/widgets/shop_browse_page.dart` (buyer order card with Reorder; no invoice button today); `url_launcher` and `share_plus` are already dependencies.
- portal 8efb7e0: `src/components/b2b-finance.tsx` (Print button + `print:` styles pattern), `src/components/kyc-case.tsx`, `app/admin/kyc`, `app/vendor/{sales,customers,orders}`.

Platforms: Flutter (Android + Flutter web), Next.js portal, and a **public server-rendered page** (functions). Roles: `vendor`, `vendor_staff` (by permission), member/buyer, admin (`payments` scope; KYC reviewer).

Ground rules:
- **Public documents never show** the customer's phone, email or address, `buyerUserId`, cost price, commission, vendor payout, internal note, void reason or staff surname. App buyers appear by display name only. Walk-in customers appear by the name the vendor entered.
- **VAT is shown on vendor documents only.** Marketplace prices, the buyer's checkout total, commission and settlement do not change (O-10). FitFlex's commission never appears on a buyer or customer document.
- **"This is not a TRA fiscal receipt."** stays on every document until S10.
- **Money display: "TSh 95,000"** (glossary, owner 2026-10-19/20). "TZS" is used only in data and CSV headers. S3/S4 text templates still say "TZS". Builders should switch those to TSh in the same PR (string change only).
- Dates are the EAT calendar. EN uses `19 Oct 2026, 14:05`. SW uses `19 Okt 2026, 2:05 mchana` (12-hour clock + day part, same rule as the apps — NOT the six-hour Swahili clock; glossary §5a; months Jan Feb Mac Apr Mei Jun Jul Ago Sep Okt Nov Des). Marked for native review.

---

## 0. Scope, gating, permissions, reuse

### 0.1 Documents in S5
| Doc | Source | Number | Title EN / SW |
|---|---|---|---|
| Walk-in receipt | paid `VendorSale` (kind cash) | `R-` (exists) | Receipt / Risiti |
| Credit invoice | `VendorSale` kind credit | `INV-` new, plus `R-` as sale ref (Q-7) | Invoice / Ankara |
| Payment receipt | `VendorCustomerPayment` | `PMT-` (exists) | Payment receipt / Risiti ya malipo |
| Customer statement | customer, as of the share time (snapshot, Q-9) | none (dated) | Statement / Taarifa ya akaunti |
| Marketplace order invoice | the vendor's part of a paid `ShopOrder` | `INV-` (same vendor series) | Invoice / Ankara |
| Credit note | S7 refunds | `CN-` | Credit note / Hati ya marejesho. **The layout is defined here; it ships with S7** |

### 0.2 Gating (fail closed, as S1–S4)
- `tools.documents === true` (from `/vendor/tools/options` or `/vendor/me.tools`) enables links, PDF, the share sheet and order invoices. When it is false, missing or failed, everything behaves exactly like S3/S4 (text share). Never show "feature off".
- `tools.vat === true` enables the tax profile screen, the product VAT code field and VAT blocks. `vat` without `documents` gives the tax profile and VAT on in-app receipts and text, but no links or PDF.
- Buyer invoice (member app) uses `GET /me/shop-orders/:id/invoice?format=json`. A 404 `feature_disabled` hides the Invoice button.
- Public `/d/:token` with the flag off returns the same "not available" page as an unknown token (§5.5).

### 0.3 Permissions
| Action | Needs |
|---|---|
| Share, PDF or revoke a walk-in receipt or credit invoice | `sales` (credit invoice: `sales` or `customers`) |
| Share, PDF or revoke a payment receipt or statement | `customers` |
| Order invoice: view, share, PDF, revoke | `orders` |
| View the links list for a document | same as share |
| Tax profile: view | vendor owner, or staff with `payments` |
| Tax profile: edit | **vendor owner only** (Q-16). Server returns 403 `owner_only` |
| Product VAT code | `products` |
| Admin tax rates | admin scope `payments`. Maker ≠ checker |
| Verify VRN | KYC reviewer (existing `/admin/kyc` access) |

### 0.4 Components (reuse; one new shared piece)
| Need | Reuse |
|---|---|
| Share sheet | `showFFSheet` + `ListTile` rows (≥56dp) + `FFSegmented` (language) |
| Links list | `FFCard` rows + `FFBadge` (Active = success, Turned off = neutral) + `FFDialog` confirm |
| Tax profile | `FFTextField`, `SwitchListTile`, `FFAlert` (status), the KYC document upload control from the Verification centre (`ff_photo_picker_field.dart` + document upload API) |
| VAT code | `DropdownButtonFormField` as used in the S1 private product fields; portal `Select` |
| Admin | portal `Table`, `Dialog`, `ConfirmDialog`, `Badge`, toasts; `kyc-case.tsx` section pattern |
| Portal document view | B2B print pattern (`b2b-finance.tsx` Print button, `print:hidden`) |

**New (mobile), `lib/screens/vendor/documents/document_share_sheet.dart`.** One sheet used by the receipt, sale detail, payment receipt, statement and order detail screens. It takes `{docType, docId, number, title, customerPhone?}`. Reason: five screens need the same link, PDF and revoke behaviour. Each screen's "Share" button is replaced by this sheet when `tools.documents` is on. Portal equivalent: `src/components/vendor/documents/share-menu.tsx`.

**Single layout source.** The server template renders the HTML (public page and portal view) and the PDF from one document JSON. The mobile app keeps its native receipt and statement screens (S3/S4) and adds the VAT and seller blocks so the content matches. design-qa checks that content matches field by field, not pixel by pixel.

---

## 1. Navigation

### 1.1 Entry points
| Where | Control | Opens |
|---|---|---|
| S3 receipt screen (after sale) | **Share receipt** (secondary) | Share sheet |
| S3 sale detail | app-bar `share` icon + "Share" button | Share sheet (receipt or invoice by kind) |
| S4 payment receipt sheet | **Share** | Share sheet (payment receipt) |
| S4 statement page | **Share** | Share sheet (statement snapshot) |
| S2 order detail (vendor) | **Invoice** button (shown once the vendor's part is paid) | Order invoice view (native) with Share |
| Business tab → Settings | **Tax details** tile (`tools.vat`) | `/vendor/settings/tax` |
| Product form (S1 private section) | **VAT code** field (`tools.vat` and the vendor VAT-verified) | inline |
| Buyer: shop order card (`shop_browse_page.dart`) | **Invoice** next to Reorder (paid orders) | Buyer invoice view, or a vendor picker sheet if several vendors |
| Push `vendor_vat_verified` / `vendor_vat_rejected` | tap | `/vendor/settings/tax` |
| Portal | sale detail, customer payment row, statement dialog, order detail: **View document** | `/vendor/documents/?type=&id=` |
| Portal | `vendorNav` → Settings → **Tax details** | `/vendor/settings/tax/` |
| Portal admin | `adminNav` → **Tax rates** (scope `payments`) | `/admin/tax-rates/` |
| Portal admin | `/admin/kyc` case → **VAT registration** section | inline |

### 1.2 Routes
| Route | Screen | Back |
|---|---|---|
| `/vendor/settings/tax` | Tax details (§6) | Pops. Unsaved changes → discard `FFDialog`. Nothing to pop → `go('/vendor/home?open=business')` |
| `/vendor/orders/:id/invoice` | Vendor order invoice (§4.4) | Pops to the order |
| `/shop/orders/:id/invoice?vendor=` | Buyer invoice (§4.5) | Pops to the orders list |
| Share sheet, links list | sheets, not routes | Close. The sheet cannot be dismissed while a link is being created |
| Portal `/vendor/documents/?type=sale\|payment\|statement\|order&id=` (+`&customer=` for statement) | Document view (§7.1) | Browser back. The breadcrumb goes to the source page |
| Public `{PUBLIC_API_URL}/d/:token[?lang=sw]`, `/d/:token.pdf[?lang=sw&paper=80mm]` | §5 | none (standalone page) |

Deep-link rules (as S4): flag off → `/vendor/home` with no message. Missing permission → first allowed section + snack `vendor.documents.noAccess`. Another vendor's id → not-found state. ids are checked with `_safeId`.

### 1.3 After completion
- WhatsApp or SMS opens the other app. On return the sheet stays open with a snack `vendor.documents.linkReady`, so the vendor can also copy or revoke.
- Copy link → snack `vendor.documents.copied`. Sheet stays open.
- Revoke → confirm → row shows "Turned off {date}" and snack `vendor.documents.revoked`.
- Tax details saved → status card shows "Waiting for review" and snack `vendor.tax.saved`.
- Admin approves a rate → the row moves to Scheduled or Active and a toast appears.

---

## 2. Share sheet (mobile; portal equivalent in §7.2)

Purpose: send the customer a link (or a PDF) they can open without an account, and turn links off later.

### 2.1 Layout, 375 (`showFFSheet`, title `vendor.documents.shareTitle` "Share {title} {number}")
1. **Document language** `FFSegmented` English | Kiswahili. Defaults to the language last used on that document's screen (S3 toggle). It sets `lang` on the link and the text.
2. Privacy note (body small, muted, info icon): `vendor.documents.privacyNote`.
3. Rows (`ListTile`, leading icon, ≥56dp, whole row tappable):
   - **WhatsApp** (brand glyph, label text). Opens `https://wa.me/{phone?}?text={whatsappText}`. `phone` is filled only for a **walk-in customer with a phone** (vendor-owned data), as digits without `+`. App customers have no phone, so WhatsApp opens the chat picker.
   - **SMS**. Opens `sms:{phone?}?body={smsText}` (Android). Same phone rule. No server SMS is sent (O-7).
   - **Copy link**. Puts the URL on the clipboard.
   - **Send PDF**. Downloads the PDF through the authenticated endpoint (§8) and passes the file to `SharePlus` (`ShareParams(files: [XFile])`, name `{number}_{slug}.pdf`). On Flutter web the row reads **Open PDF** and opens the blob in a new tab.
   - **Share as text**. The S3/S4 text plus a final line `vendor.documents.textLinkLine` "View: {url}" when a link already exists in this sheet session. No link is created just for this.
   - **Links for this document** ({n} active) → links list (§2.3).
4. Close (×, top right).

Flutter web ≥900: the same component in showFFSheet's wide presentation. Rows become a 2-column grid when width ≥560.

### 2.2 Link creation rules
- A link is created **lazily**, on the first tap of WhatsApp, SMS or Copy link. It is then reused for the rest of the sheet session (same URL in memory). Closing the sheet forgets the URL. Only the hash exists on the server, so the URL cannot be shown again (O-5). The next share creates a new link.
- While creating: the tapped row shows a spinner and the other rows are disabled. The sheet cannot be dismissed.
- Changing the language after a link exists creates **no** new link. The URL gets `?lang=sw|en` added on the client, and the texts come from the response for both languages (§10, `texts.en`/`texts.sw`).
- WhatsApp not installed (Android `canLaunchUrl` false) → copy the link instead and show snack `vendor.documents.noWhatsApp`. On web, `wa.me` opens in a new tab.

### 2.3 Links list (sheet, `vendor.documents.linksTitle`)
- Rows: "Link {n}" · `FFBadge` Active or Turned off · "Created {date} by {first name}" · "Last opened {date}" or "Never opened" · language tag (EN/SW) · trailing **Turn off** (danger ghost, ≥48dp) on active rows.
- Footer button **Turn off all links** (danger secondary) when ≥2 are active.
- Confirm `FFDialog` `vendor.documents.revokeConfirm` / `revokeAllConfirm`. Revoking is permanent.
- The URL is never listed (only the hash is stored).

### 2.4 States
| State | Behaviour |
|---|---|
| Queued (unsynced) sale | WhatsApp/SMS/Copy/PDF rows disabled. Reason line `vendor.documents.needsNumber`. Share as text works (S3 provisional text) |
| Offline | Same rows disabled with `vendor.documents.offline`. Share as text works without a link line |
| Voided sale or voided payment | Share button hidden on the source screen. The links list stays reachable from the "…" menu (to revoke). Banner `vendor.documents.voidedNote` |
| Create fails (5xx/timeout) | Inline `FFAlert` error `vendor.documents.createFailed` + Try again. Nothing copied |
| 503 `public_url_not_configured` | Rows disabled, `vendor.documents.unavailable`. Text share still works (Q-1) |
| 403 | Snack `vendor.documents.noAccess`; sheet closes |
| PDF loading / fails | Row spinner `vendor.documents.pdfPreparing` / alert `vendor.documents.pdfFailed` + retry |
| Pending-approval or suspended vendor | Allowed (the vendor's own records). Existing banners |
| Staff disabled | Existing staff-disabled alert. Rows disabled |
| Links list empty | `vendor.documents.noLinks` |
| Links list loading / error | `FFSkeletonList` / `FFErrorState(onRetry)` |

### 2.5 Message texts (server returns them; client never builds them)
- WhatsApp EN: `{business}: {title} {number}, {amount}. View it here: {url}`
- WhatsApp SW: `{business}: {title} {number}, {amount}. Itazame hapa: {url}`
- SMS EN: `{business} {title} {number} {amount}: {url}` / SW: `{business} {title} {number} {amount}: {url}` (SW title). Target ≤160 GSM-7 characters: the server shortens `{business}` to 24 chars with "…" and leaves out `{amount}` if still too long.
- Statement: `{amount}` = total owed. Order invoice: `{number}` = INV number.
- URL: `{PUBLIC_API_URL}/d/{token}`. The token is 22 base64url characters (128-bit), with `?lang=sw` when SW.

---

## 3. VAT rules (shown here so builders, design-qa and finance read the same thing)

- **Applies when** `tools.vat` is on **and** the vendor's VAT status is **Verified** at the time of the sale (or, for an order, when the vendor's part is paid). Earlier records keep VAT 0 and show no VAT block. A pending or rejected profile adds no VAT and shows no TIN/VRN (O-12).
- **Prices include VAT** (v1 locked, Q-11). The line VAT is contained in the price. The total the customer pays does not change.
- **Rate source:** the product's `vatCode` (default **A**) → the `TaxRate` active on the sale's EAT date. Line rows snapshot `vatCode`, `vatRatePct` and `vatTzs`. Later rate changes never alter past documents.
- **Rounding (recommendation, Q-6): per line.** `lineVat = round_half_up(lineNet × r / (100 + r))`, where `lineNet` is the line total after line discount and the line's share of the sale discount (S3 `saleDiscountShareTzs`), in whole TSh. Document VAT = Σ line VAT, grouped by code. Why: totals always reconcile with the lines, and S7 partial refunds can reverse exact line amounts. Example: one line TSh 10,000, code A 18% → VAT 1,525 (1,525.42), net 8,475.
- **Exempt (E)** shows "Exempt" and not "0%". **Zero-rated (C)** shows "0%". B and D are hidden from vendors until counsel confirms them (Q-12).
- **DB note (finding):** the walk-in sale CHECK is `totalTzs = subtotal − lineDiscount − discount + vatTzs`. For inclusive pricing, `VendorSale.vatTzs` must stay 0 ("VAT added") and the included VAT must go in a **new `vatIncludedTzs`** column (or the CHECK changes). Otherwise inclusive VAT double-counts. → planner/contract-checker.
- **Marketplace order invoice:** VAT is computed the same way on the vendor's own lines at payment time and stored on the order lines (new snapshot fields, §10). Checkout price, commission (on gross, O-10) and payout are unchanged.

---

## 4. Document content (all types)

### 4.1 Blocks, in order
1. **Seller:** logo (if set; existing `vendorProfile.logo`), business name, address, contact number, then `TIN {tin}` and `VRN {vrn}` **only when VAT-verified** (O-12; Q-10 for non-VAT vendors). Marketplace order invoice adds `doc.soldVia`: "Seller: {business}. Sold through the FitFlex app." (O-11).
2. **Title + number:** e.g. "Receipt R-000123", "Invoice INV-000045". Below it, small: "Sale ref R-000130" (credit invoice) or "Order {shortRef}" (order invoice).
3. **Status badge:** Paid · Pay later (balance) · Paid in full · Cancelled.
4. **Meta:** date and time (EAT); Customer {name} (walk-in or app display name; omitted for an anonymous walk-in sale); Due by {date} (credit); Served by {first name} (walk-in/credit); Payment method summary (order invoice: "Paid by {method}" from `paymentMethod`; never `paymentReference`).
5. **Lines:** name (variant), qty × unit price, discount, amount, and the VAT code letter after the amount when VAT applies.
6. **Totals:** Subtotal, Discounts (if > 0), **Total**, and when VAT applies "Includes VAT TSh X".
7. **VAT summary** (when VAT applies): table Code · Rate · Net · VAT, one row per code, then a total row.
8. **Payments:** method (reference) amount; Change. Credit invoice: Paid now, then a **live box** "Status on {today}: Balance due TSh X" or "Paid in full on {date}", with the PMT numbers that paid it.
9. **Payment receipt:** method + reference, amount, "Paid towards" (sale numbers + amounts), "Still owed".
10. **Statement (snapshot):** "As of {date}", open pay-later sales (number, sold, due, balance, days overdue), payments in the last 90 days, Total owed, aging line (S4 §7.3).
11. **Footer:** `doc.receivedBy` (receipts), `doc.notFiscal`, and on the public page and PDF `doc.copyNote` "This is a copy of a document issued by {business}." No FitFlex marketing line.

### 4.2 Cancelled (voided) documents
The link keeps working (Q-2). The page and PDF show the full content with a red-bordered banner `doc.cancelled` "Cancelled on {date}". It reads "{business} cancelled this document." with no reason. The PDF also has a diagonal watermark "CANCELLED · IMEBATILISHWA" at 12% opacity. New links cannot be created.

### 4.3 Credit note (layout for S7)
Same blocks: title "Credit note CN-000003", "For receipt R-000123", the returned lines, "Refunded TSh X by {method}", and the VAT reversed per code.

### 4.4 Vendor order invoice (mobile `/vendor/orders/:id/invoice`; portal document view)
Native view of the JSON with the same blocks. App bar: Share (sheet), PDF. Shown only for the vendor's own lines (§3 allowlist). Never shows other vendors, commission or payout. Before the vendor's part is paid there is no Invoice button. A crafted route shows `vendor.documents.invoiceAfterPayment`.

### 4.5 Buyer invoice (member app)
- Paid order card: **Invoice** (secondary, `shop.invoice.open`). One vendor → the invoice view. Several → a sheet "One invoice per seller" listing vendor name, INV number and amount.
- The view uses the same blocks, in the app language with an EN | Kiswahili toggle. Actions: **Download PDF** (authenticated `format=pdf`, then share or save as in §2.1) and **Done**. The buyer has no link sharing (links are vendor-issued only).
- Unpaid order: the button is hidden. States: skeleton, `FFErrorState` retry, offline `error.network`, 404 → `shop.invoice.notFound`.

---

## 5. Public document page `/d/:token` (server-rendered, functions)

### 5.1 Response rules
- `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex,nofollow">`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CSP `default-src 'none'; img-src 'self' {logo host}; style-src 'unsafe-inline'`. **No JavaScript.** No third-party requests apart from the logo host.
- Rate limit per IP (recommend 60/min) and per token (recommend 300/hour). Over the limit → 429 page (§5.5).
- Language: `?lang=en|sw`, default = the link's stored `lang`. `<html lang>` matches. Unknown `lang` values → default.
- `<title>`: "{Title} {number} · {business}".
- Each open updates `lastOpenedAt` (no IP stored; Q-14).

### 5.2 Layout, phone 375
- Page background `#F4F6F5`. White card full width, 16px padding, system font stack (`Inter, -apple-system, Roboto, sans-serif`), body 16px, numbers tabular.
- Top bar (outside the card): language links **English** | **Kiswahili** (current one bold with `aria-current="true"`, each ≥44×44) and **Download PDF** (button-styled link, ≥44px, `href=/d/:token.pdf?lang=`).
- Card: blocks 4.1 in order. Lines stack: name on line 1, then "2 × TSh 45,000 · Discount −5,000" muted on line 2, with the amount right-aligned on line 1. The VAT summary is a 4-column table that scrolls horizontally inside its own box below 340px.
- Status badge: Paid = success tone + text, Pay later = info, Cancelled = danger banner. Never colour alone.

### 5.3 Layout, desktop (≥768)
Centred card, max width 720px. Lines become a table: Item · Qty · Price · Discount · Amount · VAT. Seller block on the left, title/number/status on the right.

### 5.4 Print (`@media print`)
`@page { size: A4; margin: 15mm }`. Language links, Download PDF and the background are hidden. Black text on white; the brand green `#1F7A3A` is used only for the title rule. Table header repeats on each page. `doc.notFiscal` footer on the last page. Thermal printing goes through the 80mm PDF (§8.2), not print CSS (Q-5).

### 5.5 Error pages (same chrome, both languages stacked when `lang` is unknown)
| Case | Status | Copy |
|---|---|---|
| Unknown token, revoked, flag off, vendor or document deleted | **404, identical body** (no oracle) | `doc.unavailableTitle` + `doc.unavailableBody` |
| Rate limited | 429 + `Retry-After` | `doc.rateLimited` |
| Server error | 500 | `doc.serverError` |
| PDF fails to render | 500 on `.pdf`; the HTML page still works | `doc.pdfFailed` with a link back to the page |

---

## 6. Tax details (mobile `/vendor/settings/tax`; portal `/vendor/settings/tax/`)

Purpose: the vendor tells FitFlex they are VAT-registered and proves it, so VAT and TIN/VRN appear on their documents.

### 6.1 Layout, 375 (Flutter web ≥900: centred, max width 640)
1. **Status card** (`FFAlert`):
   - Not registered: neutral, `vendor.tax.statusNone`.
   - Waiting for review: info, `vendor.tax.statusPending`.
   - Verified: success, `vendor.tax.statusVerified` {date}.
   - Not accepted: warning, `vendor.tax.statusRejected` {reason} + **Send again**.
   - Change pending (verified + new details submitted): info, `vendor.tax.changePending`.
2. Switch **I'm registered for VAT** (`vendor.tax.registered`).
3. When on:
   - **TIN**: prefilled from the KYC case (`tin`). Read-only with helper `vendor.tax.tinFromKyc` when KYC has it. Otherwise editable, 9 digits; dashes and spaces are removed on save.
   - **VRN** (`vendor.tax.vrn`), required. Free text, 8–15 letters/digits after dashes are removed (format to confirm, Q-12). Error `vendor.tax.vrnInvalid`.
   - **VAT certificate** upload (KYC document control; requirement key `vat_certificate`; image or PDF; preview + Replace). Error `vendor.tax.certRequired`.
   - Info lines: `vendor.tax.howItWorks`, `vendor.tax.pastUnchanged`, `vendor.tax.appUnchanged`, `vendor.tax.pricesInclude`.
4. **Save** (primary, sticky). Turning the switch off on a verified profile → `FFDialog` `vendor.tax.stopConfirm`. It applies to new sales immediately.

### 6.2 Rules
- Saving new or changed TIN/VRN/certificate sets the review status to pending. While a change is pending, the **previous verified values stay in force** on documents and VAT.
- Staff with `payments` see the screen read-only with `vendor.tax.ownerOnly`.

### 6.3 States
Loading skeleton · error retry · offline (Save disabled, `error.network`) · saving (button spinner, fields disabled) · upload failed (`vendor.tax.uploadFailed` retry) · 409 `tax_profile_changed` → reload snack `vendor.tax.changedElsewhere`.

### 6.4 Product VAT code (product form, S1 private section)
Shown only when `tools.vat` and the vendor has ever been VAT-verified. Field **VAT code**. Options come from `GET /vendor/tax-rates` (active codes only), labelled "A · Standard 18%", "C · Zero-rated 0%", "E · Exempt". Default A. Helper `vendor.product.vatHint`. Saving the code is a private field: **it must not re-queue approval** (F1).

---

## 7. Portal

### 7.1 Document view `/vendor/documents/?type&id`
- Renders the server HTML (`format=html`, authenticated) in a sandboxed `iframe` (`sandbox="allow-same-origin allow-modals"` so Print works; scripts are not needed), max width 760, titled `vendor.documents.viewTitle`.
- Toolbar (`print:hidden`): language `Segmented`, **Print** (calls iframe print), **Download PDF**, **Share** (§7.2), **Links** ({n} active).
- States: loading skeleton · error + retry · 404 not-found · 403 no-access · voided banner.

### 7.2 Share menu (`share-menu.tsx`, `Dialog`)
Same rows as §2.1 except: WhatsApp opens `https://wa.me/...` in a new tab (`rel="noopener noreferrer"`). There is no SMS row (desktop has no SMS intent). Copy link (toast). Download PDF. Links list with Turn off and confirm. Focus trap, Escape closes, focus returns to the trigger.

### 7.3 Admin tax rates `/admin/tax-rates/`
- Intro line `admin.taxRates.intro`.
- `Table` (`aria-label` `admin.taxRates.title`): Code · Name (EN/SW) · Rate · Effective from · Until · Status · Proposed by · Actions. Rows are grouped by code: the current rate, then scheduled and pending ones.
- **Propose change** (primary) → `Dialog`: Code (select), Rate % (0–100, up to 2 decimals; or "Exempt" checkbox for E), Effective from (date ≥ tomorrow EAT, error `admin.taxRates.dateFuture`), Reason (required, ≤300). Submit → status **Waiting for approval**.
- Pending row: another admin sees **Approve** / **Reject** (reject needs a reason). The proposer sees `admin.taxRates.waitingOther` and **Withdraw**, and their Approve is disabled with `admin.taxRates.sameAdmin`. The server also refuses: 403 `same_admin`.
- Status badges: Active (success), Scheduled (info), Waiting for approval (warning), Rejected / Ended / Not in use (neutral). Each has text.
- Seed (Q-12): A 18% active, C 0% active, E exempt active, B and D "Not in use" until counsel confirms.
- States: loading, error, empty (should not occur; shows `admin.taxRates.empty`), no `payments` scope → existing admin 403 page.
- Every approve/reject/withdraw writes an audit row (who, when, before/after). It is shown in a row expander "History".
- **Callout in the PR:** these rates are pricing-adjacent constants (CLAUDE.md rule 6).

### 7.4 KYC review: VAT registration (`kyc-case.tsx`, vendor cases)
- New section **VAT registration** appears when the vendor has submitted a tax profile. It shows: VRN, TIN (with a mismatch warning `admin.kyc.vatTinMismatch` if it differs from the case TIN), certificate preview (existing document viewer), submitted date.
- Actions: **Verify** (primary) and **Not accepted** (danger secondary) with a reason select: `unreadable`, `number_mismatch`, `name_mismatch`, `not_vat_certificate`, `other` (+ note). Status badge as in §6.1.
- Verifying sets `verifiedBy/At` and sends push `vendor_vat_verified`. Rejecting sends `vendor_vat_rejected`. The section does not change the KYC case decision. VAT is optional for vendors.

---

## 8. PDF (pdfkit, O-4)

### 8.1 A4 (default)
- A4 portrait, 15mm margins, built-in Helvetica (no font files; small files for WhatsApp; Q-17), 10pt body, 18pt title, tabular figures.
- Header: logo at most 40×20mm on the left, seller block on the right. Title + number, status, then meta in a 2-column grid. Lines table with a header that repeats on every page. Totals right-aligned. VAT summary table. Payments. Live status box (credit invoice).
- Footer on every page: `doc.notFiscal` · "{number} · Page {n} of {m}" (`doc.pageOf`).
- Cancelled watermark (§4.2). Black/grey text; `#1F7A3A` only for the title rule.
- Metadata: Title "{Title} {number}", Author {business}, `lang` en/sw, `tagged: true` (pdfkit structure tags for headings and tables), `displayTitle: true`.
- File name: `{number}_{business-slug}.pdf` (statement: `statement_{customer-initials}_{YYYY-MM-DD}.pdf`; no full customer name in file names).
- Target: <150 KB for a 20-line receipt without a logo.

### 8.2 80mm (`?paper=80mm`)
72mm printable width, continuous height, single column in the S3 text layout, logo omitted, VAT summary as "A 18%  VAT 1,525" lines. Offered as **PDF (receipt printer)** under "More" in the sheet (Q-5).

---

## 9. Accessibility

- Targets: mobile ≥48dp (sheet rows ≥56dp, Turn off, segment, switch); portal and public page ≥44px.
- **Semantics labels (Flutter web tree):** share rows "Share {title} {number} on WhatsApp", "…by SMS", "Copy link for {title} {number}", "Send PDF of…"; link rows merged "Link {n}, {active|turned off}, created {date} by {name}, {last opened}" with a separate "Turn off link {n}" button; status card is a polite live region; VAT code field "VAT code for {product}"; the status badge is spoken as text.
- **Live regions:** "Creating link…" and "Link copied" are polite. Create and PDF errors are assertive.
- **Focus order, share sheet:** close → language → WhatsApp → SMS → Copy link → Send PDF → Share as text → Links. After revoke, focus goes to that row's status. After the confirm dialog closes, focus goes back to the trigger.
- **Focus order, tax details:** status card (and Send again) → switch → TIN → VRN → certificate → Save.
- **Public page:** one `h1` (title + number), `h2` per block, lines as a real `<table>` with `<th scope>` on desktop and a `<dl>` per line on phone. Language links have `hreflang` and `lang`. Contrast ≥4.5:1 (muted text `#4B5563` on white). Readable at 200% zoom with no horizontal scroll except the VAT table box. `prefers-reduced-motion` is not relevant (no motion).
- **PDF:** tagged, `lang` set, reading order matches visual order.
- Contrast ≥4.5:1 in light and dark in the apps. Volt only in dark, never as text on light. Cancelled and Paid always carry text.
- Text scale 200% (apps): sheet rows wrap to 2 lines; tax info lines wrap; the links list stacks badge under the title.

---

## 10. Strings (EN + SW; every SW string is a draft for native review)

### 10.1 Share sheet and links (`vendor.documents.*`)
| Key | EN | SW (draft) |
|---|---|---|
| shareTitle | Share {title} {number} | Tuma {title} {number} |
| language | Document language | Lugha ya hati |
| privacyNote | Anyone with the link can see this document: customer name, items and amounts. Phone numbers are never shown. | Yeyote mwenye kiungo ataweza kuona hati hii: jina la mteja, bidhaa na kiasi. Namba za simu hazionyeshwi kamwe. |
| whatsapp | WhatsApp | WhatsApp |
| sms | SMS | SMS |
| copyLink | Copy link | Nakili kiungo |
| copied | Link copied | Kiungo kimenakiliwa |
| linkReady | Link ready. You can copy it or turn it off here. | Kiungo kiko tayari. Unaweza kukinakili au kukizima hapa. |
| creating | Creating link… | Inatengeneza kiungo… |
| sendPdf | Send PDF | Tuma PDF |
| openPdf | Open PDF | Fungua PDF |
| pdfThermal | PDF (receipt printer) | PDF (printa ya risiti) |
| pdfPreparing | Preparing PDF… | Inaandaa PDF… |
| pdfFailed | Couldn't prepare the PDF. Try again. | Imeshindikana kuandaa PDF. Jaribu tena. |
| shareText | Share as text | Tuma kama maandishi |
| textLinkLine | View: {url} | Tazama: {url} |
| more | More | Zaidi |
| linksTitle | Links for this document | Viungo vya hati hii |
| linksCount | Links ({n} active) | Viungo ({n} vinatumika) |
| linkN | Link {n} | Kiungo {n} |
| active | Active | Kinatumika |
| turnedOff | Turned off {date} | Kilizimwa {date} |
| createdBy | Created {date} by {name} | Kimetengenezwa {date} na {name} |
| lastOpened | Last opened {date} | Kilifunguliwa mwisho {date} |
| neverOpened | Never opened | Bado hakijafunguliwa |
| revoke | Turn off | Zima |
| revokeAll | Turn off all links | Zima viungo vyote |
| revokeConfirm | Turn off this link? Anyone who has it will no longer see the document. This can't be undone. | Zima kiungo hiki? Yeyote mwenye kiungo hiki hataweza tena kuona hati. Huwezi kurudisha. |
| revokeAllConfirm | Turn off all {n} links? Anyone who has them will no longer see the document. This can't be undone. | Zima viungo vyote {n}? Walio navyo hawataweza tena kuona hati. Huwezi kurudisha. |
| revoked | Link turned off | Kiungo kimezimwa |
| noLinks | No links yet. Links are made when you share by WhatsApp, SMS or Copy link. | Bado hakuna viungo. Viungo hutengenezwa unapotuma kwa WhatsApp, SMS au Nakili kiungo. |
| needsNumber | This sale has no receipt number yet. You can share it as text. | Mauzo haya bado hayana namba ya risiti. Unaweza kuyatuma kama maandishi. |
| offline | Links and PDFs need an internet connection. | Viungo na PDF vinahitaji intaneti. |
| voidedNote | Cancelled documents can't be shared. Links already sent show it as cancelled. | Hati zilizobatilishwa haziwezi kutumwa. Viungo vilivyokwisha kutumwa vinaonyesha kuwa imebatilishwa. |
| createFailed | Couldn't create the link. Try again. | Imeshindikana kutengeneza kiungo. Jaribu tena. |
| unavailable | Links aren't available yet. Share as text for now. | Viungo bado havipatikani. Kwa sasa tuma kama maandishi. |
| noWhatsApp | WhatsApp isn't on this device. The link was copied instead. | WhatsApp haipo kwenye kifaa hiki. Kiungo kimenakiliwa badala yake. |
| noAccess | You don't have access to this document. | Huna ruhusa ya kuona hati hii. |
| viewTitle | Document | Hati |
| view | View document | Tazama hati |
| print | Print | Chapisha |
| downloadPdf | Download PDF | Pakua PDF |
| invoice | Invoice | Ankara |
| invoiceAfterPayment | The invoice is ready once the order is paid. | Ankara itapatikana baada ya oda kulipwa. |
| notFound | Document not found. | Hati haikupatikana. |

### 10.2 Document labels (server templates `doc.*`; also used by the mobile native views)
| Key | EN | SW (draft) |
|---|---|---|
| receipt / invoice / paymentReceipt / statement / creditNote | Receipt / Invoice / Payment receipt / Statement / Credit note | Risiti / Ankara / Risiti ya malipo / Taarifa ya akaunti / Hati ya marejesho |
| saleRef | Sale ref {number} | Kumb. ya mauzo {number} |
| orderRef | Order {ref} | Oda {ref} |
| forReceipt | For receipt {number} | Kwa risiti {number} |
| date | Date | Tarehe |
| customer | Customer: {name} | Mteja: {name} |
| servedBy | Served by {name} | Muhudumu: {name} |
| dueBy | Due by {date} | Tarehe ya mwisho ya kulipa: {date} |
| soldVia | Seller: {business}. Sold through the FitFlex app. | Muuzaji: {business}. Imeuzwa kupitia app ya FitFlex. |
| paidBy | Paid by {method} | Imelipwa kwa {method} |
| item / qty / price / discount / amount / vat | Item / Qty / Price / Discount / Amount / VAT | Bidhaa / Idadi / Bei / Punguzo / Kiasi / VAT |
| subtotal | Subtotal | Jumla ndogo |
| discounts | Discounts | Mapunguzo |
| total | Total | Jumla |
| includesVat | Includes VAT {amount} | Inajumuisha VAT {amount} |
| vatSummary | VAT summary | Muhtasari wa VAT |
| vatCode / vatRate / vatNet | Code / Rate / Before VAT | Msimbo / Kiwango / Kabla ya VAT |
| exempt | Exempt | Msamaha |
| zeroRated | Zero-rated | Kiwango sifuri |
| payments | Payments | Malipo |
| change | Change | Chenji |
| paidNow | Paid now | Imelipwa sasa |
| statusOn | Status on {date} | Hali kufikia {date} |
| balanceDue | Balance due | Kiasi kinachodaiwa |
| paidInFull | Paid in full on {date} | Imelipwa yote tarehe {date} |
| paidWith | Paid with {numbers} | Imelipwa kwa {numbers} |
| paidTowards | Paid towards | Imelipia |
| stillOwed | Still owed | Bado anadaiwa |
| asOf | As of {date} | Hadi {date} |
| openSales | Unpaid pay-later sales | Mauzo ya mkopo ambayo hayajalipwa |
| recentPayments | Payments (last 90 days) | Malipo (siku 90 zilizopita) |
| totalOwed | Total owed | Jumla ya deni |
| daysOverdue | {n} days overdue | Imechelewa siku {n} |
| statusPaid / statusPayLater / statusCancelled | Paid / Pay later / Cancelled | Imelipwa / Mkopo / Imebatilishwa |
| cancelled | Cancelled on {date}. {business} cancelled this document. | Imebatilishwa tarehe {date}. {business} imebatilisha hati hii. |
| watermark | CANCELLED · IMEBATILISHWA | CANCELLED · IMEBATILISHWA |
| refunded | Refunded {amount} by {method} | Imerejeshwa {amount} kwa {method} |
| receivedBy | Payment received by {business}. | Malipo yamepokelewa na {business}. |
| notFiscal | This is not a TRA fiscal receipt. | Hii si risiti ya kodi ya TRA. |
| copyNote | This is a copy of a document issued by {business}. | Hii ni nakala ya hati iliyotolewa na {business}. |
| pageOf | Page {n} of {m} | Ukurasa {n} kati ya {m} |
| langEn / langSw | English / Kiswahili | English / Kiswahili |
| unavailableTitle | This link isn't available | Kiungo hiki hakipatikani |
| unavailableBody | The seller may have turned it off. Ask them to send it again. | Huenda muuzaji amekizima. Mwombe akutumie tena. |
| rateLimited | Too many requests. Try again in a minute. | Maombi ni mengi mno. Jaribu tena baada ya dakika moja. |
| serverError | Something went wrong. Try again later. | Kuna hitilafu. Jaribu tena baadaye. |
| pdfFailedPage | The PDF couldn't be made. You can still view the page. | PDF imeshindikana kutengenezwa. Bado unaweza kuona ukurasa. |
| backToPage | Back to the document | Rudi kwenye hati |
| waText | {business}: {title} {number}, {amount}. View it here: {url} | {business}: {title} {number}, {amount}. Itazame hapa: {url} |
| smsText | {business} {title} {number} {amount}: {url} | {business} {title} {number} {amount}: {url} |

### 10.3 Tax details (`vendor.tax.*`) and product
| Key | EN | SW (draft) |
|---|---|---|
| title | Tax details | Taarifa za kodi |
| tile | Tax details (VAT) | Taarifa za kodi (VAT) |
| registered | I'm registered for VAT | Nimesajiliwa kwa VAT |
| tin | TIN | TIN |
| tinFromKyc | From your verification | Kutoka kwenye uthibitisho wako |
| vrn | VRN (VAT registration number) | VRN (namba ya usajili wa VAT) |
| vrnInvalid | Enter the VRN as shown on your certificate. | Andika VRN kama ilivyo kwenye cheti chako. |
| cert | VAT certificate | Cheti cha VAT |
| certRequired | Add your VAT certificate. | Ongeza cheti chako cha VAT. |
| uploadFailed | Upload failed. Try again. | Imeshindikana kupakia. Jaribu tena. |
| statusNone | Not registered for VAT. Your documents show no VAT. | Hujasajiliwa kwa VAT. Hati zako hazionyeshi VAT. |
| statusPending | Waiting for review. VAT and your TIN/VRN appear on documents once FitFlex checks your certificate. | Inasubiri ukaguzi. VAT na TIN/VRN yako zitaonekana kwenye hati baada ya FitFlex kukagua cheti chako. |
| statusVerified | Verified on {date}. VAT, TIN and VRN show on your documents. | Imethibitishwa tarehe {date}. VAT, TIN na VRN zinaonekana kwenye hati zako. |
| statusRejected | Not accepted: {reason} | Haikukubaliwa: {reason} |
| sendAgain | Send again | Tuma tena |
| changePending | New details waiting for review. Your current details stay on documents until then. | Taarifa mpya zinasubiri ukaguzi. Taarifa zako za sasa zitaendelea kuonekana kwenye hati hadi hapo. |
| howItWorks | VAT is worked out on shop sales and documents from the day your details are verified. | VAT itahesabiwa kwenye mauzo ya dukani na hati kuanzia siku taarifa zako zitakapothibitishwa. |
| pastUnchanged | Past sales and documents don't change. | Mauzo na hati za zamani hazibadiliki. |
| appUnchanged | App prices and FitFlex commission don't change. | Bei za app na kamisheni ya FitFlex hazibadiliki. |
| pricesInclude | Your prices include VAT. | Bei zako zinajumuisha VAT. |
| stopConfirm | Stop showing VAT? New sales won't include VAT. Past documents don't change. | Acha kuonyesha VAT? Mauzo mapya hayatakuwa na VAT. Hati za zamani hazibadiliki. |
| stop | Stop VAT | Acha VAT |
| save / saved | Save / Saved. We'll review it soon. | Hifadhi / Imehifadhiwa. Tutaikagua hivi karibuni. |
| ownerOnly | Only the business owner can change tax details. | Mmiliki wa biashara pekee ndiye anaweza kubadilisha taarifa za kodi. |
| changedElsewhere | These details changed on another device. We've reloaded them. | Taarifa hizi zimebadilishwa kwenye kifaa kingine. Tumezipakia upya. |
| reason.unreadable / number_mismatch / name_mismatch / not_vat_certificate / other | The certificate can't be read / The VRN doesn't match the certificate / The name doesn't match your business / This isn't a VAT certificate / Other | Cheti hakisomeki / VRN hailingani na cheti / Jina halilingani na biashara yako / Hiki si cheti cha VAT / Nyingine |
| vendor.product.vatCode | VAT code | Aina ya VAT |
| vendor.product.vatHint | Used on shop sales and documents only. | Inatumika kwenye mauzo ya dukani na hati pekee. |
| vat.A / B / C / D / E | A · Standard {rate}% / B · Special rate {rate}% / C · Zero-rated 0% / D · Special relief / E · Exempt | A · Kiwango cha kawaida {rate}% / B · Kiwango maalum {rate}% / C · Kiwango sifuri 0% / D · Nafuu maalum / E · Msamaha wa VAT |

### 10.4 Buyer (`shop.invoice.*`)
| Key | EN | SW (draft) |
|---|---|---|
| open | Invoice | Ankara |
| perSeller | One invoice per seller | Ankara moja kwa kila muuzaji |
| notFound | Invoice not found. | Ankara haikupatikana. |
| download | Download PDF | Pakua PDF |

### 10.5 Admin (`admin.taxRates.*`, `admin.kyc.vat*`)
| Key | EN | SW (draft) |
|---|---|---|
| title | Tax rates | Viwango vya kodi |
| intro | Rates apply to vendor shop sales and documents from the effective date. Past sales keep their rate. App prices and commission don't change. | Viwango vinatumika kwa mauzo ya dukani ya wauzaji na hati kuanzia tarehe ya kuanza. Mauzo ya zamani yanabaki na kiwango chake. Bei za app na kamisheni hazibadiliki. |
| code / name / rate / from / until / status / proposedBy | Code / Name / Rate / Effective from / Until / Status / Proposed by | Msimbo / Jina / Kiwango / Kuanzia / Hadi / Hali / Imependekezwa na |
| propose | Propose change | Pendekeza mabadiliko |
| reason | Reason | Sababu |
| exemptBox | Exempt (no VAT) | Msamaha (hakuna VAT) |
| dateFuture | The effective date must be tomorrow or later. | Tarehe ya kuanza lazima iwe kesho au baadaye. |
| approve / reject / withdraw | Approve / Reject / Withdraw | Idhinisha / Kataa / Ondoa pendekezo |
| waitingOther | Waiting for another admin to approve. | Inasubiri admin mwingine aidhinishe. |
| sameAdmin | You proposed this change, so another admin must approve it. | Wewe ndiye uliyependekeza, kwa hiyo admin mwingine lazima aidhinishe. |
| st.active / scheduled / pending / rejected / ended / unused | Active / Scheduled / Waiting for approval / Rejected / Ended / Not in use | Kinatumika / Kimepangwa / Kinasubiri kuidhinishwa / Kimekataliwa / Kimeisha / Hakitumiki |
| history | History | Historia |
| empty | No tax rates yet. | Bado hakuna viwango vya kodi. |
| approved / rejectedToast | Rate approved / Proposal rejected | Kiwango kimeidhinishwa / Pendekezo limekataliwa |
| admin.kyc.vatSection | VAT registration | Usajili wa VAT |
| admin.kyc.vatVerify / vatReject | Verify / Not accepted | Thibitisha / Haikukubaliwa |
| admin.kyc.vatTinMismatch | This TIN differs from the TIN on the verification case. | TIN hii inatofautiana na TIN iliyo kwenye uthibitisho. |

### 10.6 Push (server, both languages)
| Type | EN title / body | SW title / body (draft) |
|---|---|---|
| vendor_vat_verified | VAT details verified / Your TIN and VRN now show on your receipts and invoices. | Taarifa za VAT zimethibitishwa / TIN na VRN yako sasa zinaonekana kwenye risiti na ankara zako. |
| vendor_vat_rejected | VAT details not accepted / Open Tax details to see why and send them again. | Taarifa za VAT hazikukubaliwa / Fungua Taarifa za kodi uone sababu na uzitume tena. |

### 10.7 Swahili length
These run longest: `privacyNote`, `revokeConfirm`, `statusPending`, `howItWorks` and `admin.taxRates.intro`. They all wrap and none are in fixed-width controls. Sheet row labels are ≤18 characters in SW (`Tuma kama maandishi` is 19; it wraps to 2 lines, which is allowed). Status badges on the public page ("Imebatilishwa") need min-width auto. design-qa checks 375px SW at 200%.

---

## 11. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `/vendor/tools/options`, `/vendor/me.tools` | `documents`, `vat` | exist in sample |
| `POST /vendor/sales/:id/share`, `POST /vendor/orders/:id/share` | req `{lang}`; res `{linkId, url, lang, texts{en{whatsapp, sms}, sw{whatsapp, sms}}}` | plan has `{url, whatsappText, smsText}`; **both-language texts + `linkId` requested** |
| `POST /vendor/customers/:id/payments/:pid/share`, `POST /vendor/customers/:id/statement/share` | same | **new, requested**; `VendorDocumentLink.docType` must add `payment_receipt`, `statement` |
| `VendorDocumentLink` | + `lang`, `lastOpenedAt`, `snapshot jsonb` (statement only) | **requested** |
| `GET /vendor/document-links?docType&docId` | rows `{id, createdAt, createdBy{id, firstName}, revokedAt, lastOpenedAt, lang}` | **new, requested** |
| `POST /vendor/documents/:linkId/revoke`; `POST /vendor/document-links/revoke {docType, docId}` (all) | → updated rows | plan has single; **revoke-all requested** |
| Authenticated document | `GET /vendor/documents/:docType/:docId?format=json\|html\|pdf&lang&paper=a4\|80mm` | **new, requested** (vendor view and Send PDF without making a public link) |
| Public | `GET /d/:token`, `/d/:token.pdf` (`lang`, `paper`); identical 404 for unknown/revoked/off; 429 with `Retry-After` | plan; **identical-404 and `paper` requested** |
| `PUBLIC_API_URL` | share endpoints return 503 `public_url_not_configured` when unset. **Never fall back to the smartstock default** | **requested** (Q-1) |
| Document JSON | `{docType, number, saleRef?, orderShortRef?, status, issuedAt, lang, seller{businessName, logoUrl?, address, contactNumber, tin?, vrn?}, customer{name}?, servedBy{firstName}?, dueDate?, lines[{name, variant, qty, unitPriceTzs, discountTzs, amountTzs, vatCode?}], subtotalTzs, discountsTzs, totalTzs, vatIncludedTzs, vatSummary[{code, ratePct\|null(exempt), netTzs, vatTzs}], payments[{method, reference?, amountTzs}], changeTzs, liveStatus{asOf, balanceTzs, paidInFullAt?, paidWith[]}?, paidTowards[]?, statement{asOf, openSales[], recentPayments[], totalOwedTzs, aging{}}?, cancelledAt?}`. **Must not contain** phone, email, address, buyerUserId, cost, commission, payout, note, voidReason | **shape requested**; A-02 assertion in specs |
| Credit sale invoice number | `VendorSale.invoiceNumber` `INV-` from `VendorDocumentSequence` (docType `invoice`), set at sale; backfill of existing credit sales in `createdAt` order | **requested** (Q-7) |
| Order invoice | per vendor per order: `invoiceNumber` (`INV-`, same series) allocated when the vendor's part is paid; line VAT snapshot `vatCode, vatRatePct, vatTzs` on the vendor's order lines | **requested** (Q-15) |
| `GET /me/shop-orders/:id/invoice` | `?format=json` → `{invoices:[document JSON per vendor]}`; `html`; **`pdf&vendorId=` requested**; text stays default; 404 until paid | plan has html/json; **pdf requested** |
| VAT on sales | `VendorSale.vatIncludedTzs` (new) with `vatTzs` = 0 for inclusive pricing; lines snapshot `vatCode, vatRatePct, vatTzs` | **finding (CHECK constraint, §3)** |
| Seller snapshot | `VendorSale.sellerSnapshot jsonb` (name, address, contact, tin, vrn) at issue | **requested** (Q-8) |
| `GET/PUT /vendor/tax-profile` | `{vatRegistered, tin, tinFromKyc: bool, vrn, certificateDocumentId, pricesIncludeVat (true, locked), status none\|pending\|verified\|rejected, rejectReason?, verifiedAt?, pending{tin, vrn, certificateDocumentId, submittedAt}?, updatedAt}`; 409 `tax_profile_changed`, 403 `owner_only`, 400 `vrn_invalid`, `certificate_required` | plan has core columns; **status, pending change, reasons requested** |
| KYC | requirement key `vat_certificate` (optional, vendor); `POST /admin/kyc/vendors/:id/vat/verify` and `/reject {reason, note}` | **new, requested** |
| `GET /vendor/tax-rates` | active codes `{code, nameEn, nameSw, ratePct\|null, exempt}` | **new, requested** |
| `ProductPrivate.vatCode` | via existing private product fields; must not re-queue approval | plan |
| `GET/POST /admin/tax-rates`, `POST /admin/tax-rates/:id/approve\|reject\|withdraw` | rows `{id, code, nameEn, nameSw, ratePct, exempt, effectiveFrom, effectiveTo, status, proposedBy, proposedAt, reason, decidedBy, decidedAt, history[]}`; 403 `same_admin`; 400 `effective_date_past` | plan has GET/PUT; **workflow endpoints requested** |
| Push | `vendor_vat_verified`, `vendor_vat_rejected` `{type}` → `/vendor/settings/tax` | **new** |

---

## Open questions — 2026-10-20: lead applied the recommendations except Q-1 (owner: public domain), Q-10 (owner: show TIN for non-VAT vendors) and Q-12 (counsel)

- **Q-1 `PUBLIC_API_URL` (identity future item F1).** It is unset in production, and the code falls back to `fitflex-faas.bfast.smartstock.co.tz`. Customers would see a non-FitFlex domain, or links would break when it changes. Rec: the owner sets a FitFlex domain (for example `https://fitflex.co.tz`, with a Firebase Hosting rewrite of `/d/**` to functions) before `VENDOR_DOCUMENTS` goes on. Links already sent use whatever domain was set then, so pick it once. Until it is set, the share endpoints return 503 and the app offers text only.
- **Q-2 Links to voided documents.** Rec: keep working, show "Cancelled" (customer must know). Revoking stays possible. Alt: auto-revoke on void.
- **Q-3 QR code.** Rec: none in S5. A QR next to "not a fiscal receipt" could be mistaken for TRA verification. S10 adds the TRA verify QR.
- **Q-4 Logo.** Rec: reuse the existing required `vendorProfile.logo`. No new upload. The PDF scales it to fit 40×20mm. No logo → name only.
- **Q-5 Thermal printer.** Rec: S5 ships an 80mm PDF only (prints from Android printer apps). Direct Bluetooth ESC/POS later if vendors ask. Needs a real device either way.
- **Q-6 VAT rounding.** Rec: per line, half-up, whole TSh (§3). Alt: per document per code (common on TRA receipts), but partial refunds then leave odd shillings. Confirm with counsel/finance.
- **Q-7 Credit sale number.** Rec: credit sales get an `INV-` number (one continuous invoice series per vendor, shared with order invoices), shown as the document number, with `R-` as a small "Sale ref". Alt: keep `R-` only (simpler, but "Invoice R-…" mixes series).
- **Q-8 Seller details changing later.** Rec: snapshot seller details on the sale and order at issue, so old documents don't change when the vendor renames. Old S3/S4 sales without a snapshot render the current profile.
- **Q-9 Statement link.** Rec: a frozen snapshot at share time, labelled "As of {date}". A live statement link would keep exposing new debt indefinitely.
- **Q-10 TIN for vendors not registered for VAT.** O-12 ties TIN/VRN display to VRN verification. Rec: also show the TIN when the KYC `tin_certificate` is verified, even without VAT (common on Tanzanian receipts). This needs an owner yes, because it extends O-12.
- **Q-11 Prices exclusive of VAT.** Rec: lock `pricesIncludeVat = true` in v1 and hide the toggle. Shelf price = charged price, and it matches the marketplace (always inclusive).
- **Q-12 Codes B/D, VRN format, "Tax invoice" title.** Counsel to confirm the TRA codes and rates, the VRN format, whether VAT-registered sellers must title documents "Tax invoice", and the copy of `doc.soldVia` / `doc.notFiscal`. Until then: A/C/E only, free-format VRN, title "Invoice". Legal text stays draft.
- **Q-13 Who can share.** Rec: as §0.3 (by permission). No separate share permission.
- **Q-14 Open tracking.** Rec: store `lastOpenedAt` only (no IP, no count). It helps vendors and is minimal data.
- **Q-15 Order invoice timing.** Rec: allocate `INV-` when the vendor's part is paid. No proforma before payment. Cancelled or refunded after payment → the invoice shows Cancelled; the credit note comes with S7.
- **Q-16 Who edits tax details.** Rec: vendor owner only (legal identity). Staff with `payments` read-only.
- **Q-17 PDF font.** Rec: built-in Helvetica (small files, no font licence work). Alt: embed Inter for brand match (+~600 KB per PDF unless subset).

---

## 13. Acceptance criteria (UAT on Flutter web and portal from RC; isolated backend with `PUBLIC_API_URL` set to the local functions URL; seed: vendor owner, staff with `sales` only, staff with `customers` only, staff with `orders` only, staff with `payments`, two admins with `payments`, a KYC reviewer, a buyer with a paid two-vendor order, a walk-in customer with a phone, an app customer)

Gating
1. With `documents: false` the S3/S4 Share buttons send text exactly as before. There is no share sheet, no Invoice button on orders and no portal View document, and `/d/{any}` returns the "not available" page.
2. With `vat: false` there is no Tax details tile or route, no VAT code field and no VAT block anywhere.
3. With `documents: true` and `PUBLIC_API_URL` unset (server spec), the share endpoint returns 503 `public_url_not_configured`. The sheet shows "Links aren't available yet…" and Share as text still works.

Share sheet and links
4. On a synced receipt, tapping Copy link creates exactly one link. Tapping WhatsApp afterwards in the same sheet reuses the same URL (links list shows 1 active).
5. Opening the sheet and closing it without tapping a link row creates no link.
6. WhatsApp for a walk-in customer with phone `+255712345678` opens `wa.me/255712345678?text=…`. For an app customer it opens `wa.me/?text=…` with no number. The text matches §2.5 in the selected language.
7. (Real device) SMS opens the SMS app with the body filled and the walk-in phone as recipient. No SMS is sent by the server (no Beem call in logs).
8. Switching the sheet language to Kiswahili after a link exists adds `?lang=sw` to the URL and creates no new link.
9. A queued (unsynced) sale: link and PDF rows are disabled with "This sale has no receipt number yet…"; Share as text gives the provisional text.
10. Offline: link and PDF rows are disabled with the connection message.
11. A voided sale has no Share button. Its earlier link still opens and shows "Cancelled on {date}" with the watermark in the PDF. The void reason appears nowhere on the page.
12. Links list shows created date, first name, language and "Never opened". After the link is opened in a browser it shows "Last opened {date}". The URL is never displayed.
13. Turn off a link → confirm → status "Turned off". Opening that URL now shows the "not available" page with HTTP 404, byte-identical to a random token's response.
14. Turn off all links works when ≥2 are active.
15. Staff with `sales` only can share receipts but get no share on payment receipts or statements. Staff with `orders` only can share order invoices only. A crafted request without the permission returns 403.

Public page
16. `/d/:token` responses carry `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, a noindex meta tag and no `<script>`.
17. The page and PDF never contain the customer's phone, email, address, buyer id, cost price, commission, payout, internal note or a staff surname (server spec greps the rendered HTML/PDF text, plus manual check). The app customer shows display name only.
18. More than the rate limit of requests from one IP returns the 429 page with `Retry-After`.
19. English | Kiswahili links switch every label (none left in English except brand names, TIN, VRN, VAT, SMS, WhatsApp, PDF and user-entered text), `<html lang>` changes, and SW dates use the Swahili month and time style.
20. At 375px there is no horizontal page scroll (only the VAT table box may scroll). At ≥768px lines render as a table. At 200% zoom everything is readable.
21. Browser print preview shows A4 with toggles and buttons hidden, the table header repeated on page 2 of a 40-line receipt, and the not-fiscal footer.
22. Download PDF gives an A4 PDF named `{number}_{slug}.pdf`, with "Page n of m" and the not-fiscal line on every page, and title metadata set. `paper=80mm` gives a 80mm-wide single-column PDF.

Documents
23. Receipt content matches §4.1. Mobile receipt screen, portal view, public page and PDF show the same number, lines, totals, payments and footer.
24. A credit sale shows "Invoice INV-000001" with "Sale ref R-…", Due by, Paid now, and a status box. After a PMT pays it off, the same link shows "Paid in full on {date}" and the PMT number.
25. A payment receipt shows method, reference, Paid towards and Still owed. A voided payment's link shows Cancelled.
26. A statement link shows "As of {share date}". After a new payment, the old link still shows the old figures and a new share shows the new ones.
27. Vendor order invoice: the Invoice button appears only after the vendor's part is paid. The invoice shows only that vendor's lines and "Seller: {business}. Sold through the FitFlex app.", and no commission or payout.
28. Buyer with a two-vendor paid order: Invoice opens "One invoice per seller" listing two invoices with separate INV numbers from each vendor's series. Each shows only its vendor's lines. Download PDF works. The unpaid order has no Invoice button.
29. Numbers are continuous per vendor and type under concurrency (server spec): two credit sales and an order invoice for the same vendor get INV-000001..3 with no gaps. Another vendor starts at INV-000001.

VAT
30. A vendor not verified (none or pending): sales store VAT 0, documents show no VAT, TIN or VRN.
31. After the reviewer verifies: a new TSh 10,000 sale of a code-A product shows "Includes VAT TSh 1,525" and summary "A 18% 8,475 1,525". The customer total is still TSh 10,000. Sales from before verification are unchanged.
32. Mixed sale A TSh 10,000 + E TSh 5,000 with a TSh 1,500 sale discount: the discount is shared across lines, each line's VAT is rounded half-up, and the summary total equals the sum of line VAT.
33. Marketplace checkout price, commission and vendor payout for a VAT-verified vendor's order equal the same order without VAT (server spec).
34. Rate changed via admin to take effect tomorrow: today's sales still use the old rate. Sales on the effective date use the new one. Old documents never change.
35. Changing VRN on a verified profile shows "New details waiting for review". Documents keep the old VRN until the new one is verified.
36. Turning VAT off (confirm) stops VAT on new sales immediately. Old documents keep their VAT.
37. Saving a product's VAT code does not set `approvalStatus` to pending or delist it.

Tax details and admin
38. Tax details: TIN is prefilled read-only from KYC when present. VRN and certificate are required when the switch is on. Errors show as specified. Staff with `payments` see it read-only with "Only the business owner…". Other staff cannot open it.
39. KYC case shows the VAT registration section with VRN, certificate and TIN-mismatch warning. Verify and Not accepted (with reason) update the vendor's status card and send the matching push (server spec; push delivery needs a real device).
40. Admin tax rates: admin 1 proposes A = 16% from tomorrow and sees "Waiting for another admin…" with Approve disabled. A crafted approve by admin 1 returns 403 `same_admin`. Admin 2 approves → status Scheduled. A past effective date is refused. History shows both actions.
41. Seeded codes: A 18% and C 0% Active, E Exempt Active, B and D Not in use and absent from the vendor VAT code list.

Accessibility and language
42. Every control in the share sheet, links list, tax details, VAT code field, buyer invoice, portal share menu and admin pages has a screen-reader label as in §9. Create and PDF errors are announced.
43. Touch targets are ≥48dp in the app and ≥44px in the portal and public page. Contrast is ≥4.5:1 in light and dark. Paid, Pay later and Cancelled always carry text.
44. In Kiswahili at 375px and text scale 200%: no clipped text in the sheet, links list, tax details, buyer invoice, public page or admin pages. No hardcoded English.
45. The portal share menu traps focus, Escape closes it and focus returns to the trigger. The iframe document view prints only the document.

Needs a real device (not verifiable on Flutter web): WhatsApp/SMS intents with prefilled phone, Send PDF through the Android share sheet, 80mm thermal printing, push delivery of VAT verification.
