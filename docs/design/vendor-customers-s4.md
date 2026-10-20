# Vendor customers, pay later, balances and aging (S4): design spec

Status: DRAFT for review. Date: 2026-10-20. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0, §1, S4, §3 (A-02 privacy), §4, §5 (O-1..O-15 accepted 2026-10-19; **O-8: over-payment refused in v1**, O-6 numbering `PMT-`, O-7 device share only).
Builds on: `docs/design/vendor-stock-ledger-s1.md`, `docs/design/vendor-portal-s2.md`, `docs/design/vendor-walkin-sales-s3.md` (components, states, payment rules, offline queue, strings reused; nothing here overrides them unless stated).
Read from `origin/release-candidate`: functions b7abce4 (`functions/shop.mjs` enquiry routes guarded by `customers`; `src/services/shop-service.mjs` `STAFF_PERMISSIONS` already has `sales` and `customers`; `src/shared/feature-flags.mjs` `customers: vendorToolsFlag('VENDOR_CUSTOMERS')`; `db/migrations/20261230120000-vendor-walkin-sales.cjs` `VendorSale.kind cash|credit`, `customerId`, `balanceTzs`, `dueDate`, CHECK `paidTzs − changeTzs + balanceTzs = totalTzs`; `src/shared/vendor-sale.mjs` `REFERENCE_REQUIRED`), mobile 0c76a3a (`lib/screens/vendor/vendor_home_page.dart` `_sections`: section 3 = Messages, guarded by `customers`; `lib/screens/vendor/sales/*`).
Platforms: Flutter (Android + Flutter web) and Next.js portal. Roles: `vendor`, `vendor_staff` with `customers` and/or `sales`.

Ground rules applied:
- **A-02.** A marketplace customer record holds only `buyerUserId` + a name snapshot. Phone, email and address are never copied into it and never shown on the customer profile, statement or receipt; they appear only on an order inside its O-3 window (S2). Walk-in customers are entered and owned by the vendor and are fully editable.
- **Money never passes through FitFlex** for walk-in or credit sales or customer payments. FitFlex keeps the record only; it never collects, chases or reminds the customer.
- **O-8.** A payment larger than what the customer owes is refused. There is no customer credit balance in v1.
- Money is integer TZS (`formatCurrency`, "TZS 45,000"). Dates and aging use the **EAT** calendar day.

---

## 0. Scope, gating, permissions, reuse

### 0.1 Gating (fail closed, as S1–S3)
- `tools.customers === true` (from `GET /vendor/tools/options`; portal `/vendor/me.tools.customers`). False, missing or failed: no customer screens, no customer picker, no Pay later, no Customers segment. Never show "feature off".
- **Pay later** additionally needs `tools.walkInSales` (it lives in the POS).
- Customers on, walk-in sales off: the customer list and profiles still work (marketplace customers, manual customers, payments against older credit sales); POS items are absent.

### 0.2 Permissions (`customers` vs `sales`)

| Action | Needs | Notes |
|---|---|---|
| Customer list, profile, add/edit/archive walk-in customer | `customers` | |
| Owed to you (aging), statement share | `customers` | |
| Record / void a customer payment | `customers` | Q-3 |
| Attach a customer to a **paid** POS sale | `sales` | Limited picker: name + phone ending only, no balances (§3.2) |
| Quick-add a walk-in customer from the POS | `sales` | Name + phone only |
| **Pay later** (credit sale) | `sales` **and** `customers` | Extending credit is a money decision. Server: 403 `credit_not_allowed` |
| See balances/overdue in the POS picker | `customers` | |
| Void a credit sale | `sales` (as S3) | Blocked while later payments are allocated (§6.3) |
| Open a marketplace order from the profile | `orders` | Without it the row is plain text |

- `customers` already exists and guards Messages (enquiries). The staff form label stays `vendor.permission.customers` "Customers / Wateja"; its helper text is new (`vendor.permission.customersHint`) so admins know it now also covers balances and payments.
- Recommendation for the server: S4 adds **no** new permission, so no backfill. Admin-role staff already carry `customers`.

### 0.3 Components (reuse; no new shared component)
| Need | Reuse |
|---|---|
| Lists, rows | `FFCard` + `ListTile` (≥64dp); portal `Table` (`aria-label`) / card list below `md` |
| Figures | `FFStatTile`; portal `Stat`, `MetricCard` |
| Aging buckets | Row of 5 `FFStatTile` (wrap 2–3 per row at 375); portal `Stat` row + `Table`. **No chart**: numbers in text (screen-reader friendly, no colour-only meaning) |
| Status | `FFBadge` / `Badge`: Overdue = warning, Paid off = success, Pay later = info, App customer / Shop customer = neutral, Archived = gray, Voided = neutral |
| Filters | `FFPill` wrap (48dp, `Semantics(selected:)`); portal `Segmented`/`Select` |
| Sheets, dialogs | `showFFSheet` (customer picker, record payment, due date), `FFDialog` (archive, void payment); portal `Dialog`, `ConfirmDialog` |
| Inputs | `FFTextField`; date via `showDatePicker` (EAT dates); portal `Field`/`Input type="date"` |
| States | `FFSkeletonList`, `FFEmptyState`, `FFErrorState(onRetry:)`, `FFAlert`, `FFSnack`; portal equivalents |
| Share | `share_plus` (text); portal clipboard |
| Payment rows | S3 `payment_sheet.dart` method chips + reference field + rules (reused as a widget, not copied) |

New non-visual pieces only: `CustomerRepository` (fetch, cache in memory only, see §8) and `AllocationPreview` (client mirror of oldest-due-first). New files in `lib/screens/vendor/customers/`.

### 0.4 Colour
As S3 §0.4. Overdue uses `warning700` on `warning50` plus the word "Overdue"; amounts owed are never shown in red alone. Paid off uses success tone plus text.

---

## 1. Navigation

### 1.1 Mobile entry points
The owner already has 6 tabs (S3 Q-1). S4 adds **no tab**.
- **Tab 3 (today "Messages", guarded by `customers`) becomes "Customers"** when `tools.customers` is on (Q-1). Top `FFSegmented`: **Customers** | **Owed** | **Messages**. The unread-messages badge stays on the tab icon and on the Messages segment. Flag off: tab unchanged ("Messages", no segments).
  - Label `vendor.customers.tab` "Customers / Wateja" (≤8 chars).
- **Sales tab:** a compact card at the top, "Owed to you: TZS X · n overdue" (`customers` only, hidden when nothing is owed) → Owed view.
- **POS:** "Customer" chip in the cart (§3).
- **Sale detail (S3):** customer name → profile (`customers`); "Record payment" on an open credit sale.
- **Order detail (S2 mobile):** buyer name → marketplace customer profile (`customers`).
- **Push** `vendor_customers_overdue` (§9) → Owed view.

### 1.2 Routes (GoRoute; ids checked with `_safeId`)
| Route | Screen | Back |
|---|---|---|
| `/vendor/home?open=customers&view=list\|owed\|messages` | Customers tab | Tab behaviour |
| `/vendor/customers/new` | Add customer (§4) | Pops; unsaved changes → discard `FFDialog` |
| `/vendor/customers/:id` | Customer profile (§5) | Pops; nothing to pop → `go('/vendor/home?open=customers')` |
| `/vendor/customers/:id/edit` | Edit customer (§4) | Pops to profile |
| `/vendor/customers/:id/statement` | Statement preview (§7) | Pops to profile |
| Record payment | Sheet over profile or sale detail (not a route) | Sheet closes; not dismissible while saving |

Deep-link rules: `tools.customers` off → `/vendor/home`, no message. No `customers` → first allowed section + snack `vendor.customers.noAccess`. Unknown / other vendor's id → not-found state.

### 1.3 Portal
- `vendorNav` gains **Customers** (`/vendor/customers/`, lucide `Users`, `vendor.nav.customers`) after Sales. Shown when `tools.customers` and `customers`.
- `/vendor/customers/` with `Segmented` **Customers** | **Owed to you** (`?view=owed`); profile `?id=`; filters in the URL. Static export, query strings (S2 pattern).
- Portal has **no POS** (S3 Q-2), so no Pay later in the portal. It can add/edit customers, record and void payments, and copy statements.
- Dashboard: new `MetricCard` **Owed to you** (`vendor.dash.owed`, sub `vendor.dash.owedHint` "{n} overdue") → `?view=owed`. Kept separate from app and shop sales.

### 1.4 After completion
- Add customer → profile of the new customer (snack `vendor.customers.saved`). From the POS quick-add → back to the POS with that customer attached.
- Record payment → sheet closes, profile refreshes, snack `vendor.pay.saved` {number}, then the payment receipt sheet (§7.2) with Share / Done.
- Credit sale completed → S3 receipt with the credit block (§3.5).

---

## 2. Customers list (Customers segment; portal `/vendor/customers/`)

Purpose: find a customer fast and see who owes money.

### 2.1 Layout, phone 375
1. Search `FFTextField` (`vendor.customers.search`, hint `vendor.customers.searchHint`): name, or phone digits (walk-in customers only; marketplace customers have no phone). Debounced 300ms, server-side.
2. Filter pills (wrap, single select): **All** · **Owe you** · **Overdue** · **Shop customers** (manual) · **App customers** (marketplace) · **Archived**.
3. Sort (`FFPill` menu, `vendor.customers.sort`): Name A–Z (default) · Most owed · Most overdue · Last purchase.
4. Rows (`FFCard`, ≥64dp, whole row tappable):
   - Line 1: name (1 line, ellipsis) · owed amount right-aligned (`titleMedium`, tabular) or nothing when 0.
   - Line 2: source badge (`App customer` / `Shop customer`) · "Last bought {date}" · `Overdue` badge when any sale is past due.
   - Merged semantics `vendor.customers.rowLabel`.
5. **Load more** (ghost) while `nextCursor`.
6. FAB **Add customer** (`vendor-customers-add`, icon `person_add_alt`).

Web ≥900 (Flutter) and portal desktop: table — Name · Type · Phone (walk-in only; "—" otherwise) · Last purchase · Owed · Overdue · chevron. Max width 1100.

### 2.2 States
| State | Behaviour |
|---|---|
| Loading | `FFSkeletonList(semanticLabel: vendor.customers.loading)` |
| Empty, none yet | `FFEmptyState` `vendor.customers.emptyFirst` + **Add customer** |
| Empty filter/search | `vendor.customers.empty` / `vendor.pos.noResults` pattern `vendor.customers.noMatch` {q} |
| Error | `FFErrorState` `vendor.customers.failed` + Try again |
| Offline | Error state with `error.network`; FAB disabled (customers are online-only, §8) |
| Pending-approval / suspended vendor | Works (vendor's own records), existing banners (S3 Q-4/Q-6) |
| Staff disabled | Existing staff-disabled alert; actions disabled |

---

## 3. POS: customer picker and Pay later

### 3.1 Customer chip (cart sheet and web cart pane)
- Above Subtotal: `FFPill` **Add customer** (`vendor.pos.customer.add`, icon `person_outline`). With a customer: chip "{name}" with a clear (×, 48×48, `vendor.pos.customer.remove` {name}).
- Optional for paid sales; **required for Pay later**.
- Draft cart (S3 §2.5) stores the `customerId` only; the name is re-fetched on reopen. If the fetch fails the chip reads `vendor.pos.customer.selected`.

### 3.2 Picker sheet (`vendor.pos.customer.pick`, 90% height)
- Search field (autofocus on web), server search, 300ms debounce.
- Rows (56dp): name · source badge · phone ending `•••• 234` (walk-in with phone only).
  - With `customers`: owed amount and `Overdue` badge on the row.
  - Without `customers`: no amounts (server omits them).
- Top row **New customer** → quick-add form in the same sheet: Name (required), Phone (optional), Save. Full form (§4) is reached from the profile later.
- Archived customers are not offered.
- Offline: sheet shows `FFAlert` `vendor.pos.customer.offline`; nothing selectable.

### 3.3 Pay later in the payment sheet (S3 §3)
Shown only with `tools.customers` + `tools.walkInSales` + `sales` + `customers`, and when online.
- Under the payment rows, when Σ payments < total: secondary button **Pay later** (`vendor-pos-paylater`). It switches the sheet into credit mode:
  - Header line `vendor.pos.credit.title` "Pay later: {amount} owed".
  - **Customer** row (required). If none, opens the picker; after picking, returns here.
  - **Due date** chips: In 7 days (default) · 14 days · 30 days · Choose date (`showDatePicker`, EAT; earliest = sale day, latest = sale day + 365). Shows the resolved date "Due {date}".
  - **Paid now** = existing payment rows (may be zero: remove all rows, or set the first to 0 → row removed). Rules as S3 (reference required for M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, Bank; optional for Card, Other).
  - **Balance** line (live region): `vendor.pos.credit.balance` {amount}.
  - Existing balance warning (with `customers`, when > 0): `FFAlert` warning `vendor.pos.credit.alreadyOwes` {name} {amount}, plus "{n} overdue" when relevant. Information only; no credit limit in v1 (Q-5).
  - Money notice (S3) stays, plus `vendor.pos.credit.notice`.
  - Primary **Complete pay-later sale**. Disabled until: customer set, due date set, Σ paid < total, no cash change (cash may not exceed the remaining amount in credit mode), references valid.
  - Ghost **Back to full payment** leaves credit mode (keeps rows).
- Pay later is hidden when the total is 0 and for users lacking a permission. Offline: button shown disabled with helper `vendor.pos.credit.needsConnection`.

### 3.4 Request and responses
`POST /vendor/sales` gains `kind: 'credit'`, `customerId`, `dueDate` (`YYYY-MM-DD`, EAT). A paid sale may also carry `customerId` (kind `cash`).

| Response | Behaviour |
|---|---|
| 201 / 200 replay | Receipt with credit block; snack `vendor.pos.credit.saved` {number} |
| 403 `credit_not_allowed` | Sheet stays in credit mode; `FFAlert` error `vendor.pos.credit.notAllowed` |
| 404/409 `customer_not_found` / `customer_archived` | Customer chip cleared, `vendor.pos.customer.gone`; picker reopens |
| 400 `due_date_invalid` | Inline on due date `vendor.pos.credit.dueInvalid` |
| 400 `credit_fully_paid` (Σ paid ≥ total) | Inline `vendor.pos.credit.fullyPaid`; offers Back to full payment |
| 400 `change_not_allowed` | Inline `vendor.pos.credit.noChange` |
| S3 errors (stock, payment, reference, discount) | As S3 §3.4 |
| **Network failure / 5xx on a credit sale** | **Not queued.** Sheet stays; `FFAlert` `vendor.pos.credit.failed` with **Try again** (same clientRef). The cart draft is kept. A paid (cash) sale with a customer follows S3 queueing (§8). |

### 3.5 Receipt changes (S3 §4)
- When a customer is attached: line `vendor.receipt.customer` {name} under the date. Never phone, email or address.
- Credit sale adds, after Payments: **Paid now** {amount}, **Balance due** {amount}, **Due date** {date}, and the badge `Pay later`. "Change" is never shown.
- Share text adds the same lines (§7.1). Footer "Payment received by {business}." becomes `vendor.receipt.footerCredit` "{business} recorded the balance due." for credit sales.

---

## 4. Add / edit customer

Mobile full-screen form (web: centred, max 560); portal `Dialog` (560px; full-width sheet at 375).

### 4.1 Walk-in (manual) customer
| Field | Rules |
|---|---|
| Name | Required, 2–80 chars, trimmed |
| Phone | Optional; normalised to `+255…` (accepts `07…`, `7…`, `+255…`); invalid → `vendor.customers.phoneInvalid`. Duplicate within the vendor → **warning, not a block**: `vendor.customers.phoneDuplicate` {name} with **Open** link (Q-7) |
| Email | Optional, format check |
| Address | Optional, ≤200 |
| Note | Optional, ≤500, multiline (`vendor.customers.noteHint`: only the vendor's staff see it) |

- Muted line above Save: `vendor.customers.consent` ("Only save details the customer agreed to give you.").
- Buttons: **Save** (primary), Cancel. Edit adds **Archive** (danger ghost) / **Restore**.
- Archive with owed > 0 → refused: inline `vendor.customers.archiveHasBalance`. Otherwise `FFDialog` `vendor.customers.archiveTitle`/`archiveBody`. Archived customers keep their history, leave the picker, show under Archived. No hard delete in v1 (Q-8).

### 4.2 Marketplace (app) customer
- Name is a snapshot from the buyer's FitFlex name; **read-only** with helper `vendor.customers.appNameHint`.
- **No** phone, email or address fields (not even empty). Only **Note** is editable, and Archive/Restore.
- Profile shows `vendor.customers.appContactHint` ("Contact details show on an order while you're delivering it.").

### 4.3 States
Saving: button spinner, form locked. 400 field errors inline. 409 `customer_changed` (edited elsewhere, `updatedAt` mismatch) → `FFAlert` `vendor.customers.changedElsewhere` + **Reload**. Network: `FFAlert` `vendor.customers.saveOffline`; nothing saved, form kept.

---

## 5. Customer profile

Purpose: everything the vendor needs about one customer, and the place to take a payment.

### 5.1 Layout, phone 375 (top to bottom)
1. **Header:** name (`headlineSmall`), source badge, Archived badge if any. Walk-in with phone: **Call** (`tel:`, 48dp, `vendor.customers.call` {name}). Actions menu: Edit, Share statement, Archive/Restore.
2. **Owed card** (`FFCard`, shown when owed > 0 or any credit sale exists):
   - **Owes you** {amount} (large) · `Overdue` {amount} when > 0.
   - Aging as 5 `FFStatTile`s: Not due yet · 1–30 days · 31–60 days · 61–90 days · Over 90 days (wraps 3+2 at 375; zero tiles shown muted, not hidden, so positions stay stable).
   - `vendor.customers.asOf` {EAT date}.
   - Primary **Record payment** (needs `customers`; disabled with helper when owed = 0 or offline).
   - Owed = 0 and credit history exists: success line `vendor.customers.paidOff`.
3. **Totals** (`FFStatTile` row): Shop sales {amount} ({n}) · App orders {amount} ({n}) · Last bought {date}. App orders = this vendor's own paid lines only (S2 allowlist), excluding cancelled.
4. **Open pay-later sales** (oldest due first): number · sold date · due date · balance · `Overdue {n} days` badge. Tap → S3 sale detail.
5. **Activity** `FFSegmented`: **Shop sales** | **App orders** | **Payments**.
   - Shop sales: S3 history rows filtered to this customer (incl. voided, cash and credit; credit rows show Balance or Paid off).
   - App orders: `shortRef` · placed date · own status badge · own total. Tap → order detail if `orders`, else not tappable. **No phone/address here**, even inside the window.
   - Payments: `PMT-000001` · date · method · amount · "Paid {sale numbers}" · Voided badge. Tap → payment receipt (§7.2) with Void (§6.4).
   - Each list: 20 rows + Load more.
6. **Note** (if any), muted.

Web ≥900 / portal desktop: two columns — left 360px (header, owed card, totals, note), right (open sales + activity tabs). Portal profile is a full page at `?id=` (not a side panel: too much content), with **Back to customers**.

### 5.2 States
Loading `FFSkeletonList`; not found / not yours `FFErrorState` `vendor.customers.notFound` + Back; error + Try again; offline: last-loaded profile is **not** cached (§8) → error state with `error.network`. Partial: if activity fails but the header loads, show the header and an inline `FFAlert` with retry in the activity area.

---

## 6. Record payment, allocation, voids

### 6.1 Record payment sheet (`vendor.pay.title` "Record payment from {name}")
1. **Owes you** {amount} (read-only).
2. **Amount** (digits). Quick chips: **All owed** {amount} · **Oldest sale** {balance of the oldest-due sale} (hidden when only one open sale).
3. **Method** chips (S3 order: Cash, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, Card, Bank transfer, Other). One method per payment (split = two payments).
4. **Reference**: S3 rules (required for mobile money and bank, ≤100, uppercase). Cash: hidden.
5. **Date received**: default today (EAT); earliest = 30 days back (Q-4), never in the future.
6. **Note** optional ≤200.
7. **Applies to** (preview, live region): oldest due first — "Pays off R-000012 (TZS 20,000)", "Pays TZS 5,000 of R-000015 (TZS 25,000 left)". Ghost **Choose sales** switches to manual: each open sale with an amount field (≤ its balance); Σ must equal Amount (`vendor.pay.allocMismatch` {amount}).
8. Money notice `vendor.pay.notice` ("You received this money directly. FitFlex only keeps the record.").
9. Primary **Save payment {amount}**. Disabled while: amount empty/0, amount > owed, required reference missing, manual allocation mismatched, offline.

**Over-payment (O-8):** amount > owed shows inline `vendor.pay.overOwed` {owed} and disables Save. No "keep as credit" option.

### 6.2 Request and responses
`POST /vendor/customers/:id/payments { clientRef, amountTzs, method, reference?, receivedOn, note?, allocations?:[{saleId, amountTzs}] }`

| Response | Behaviour |
|---|---|
| 201 / 200 replay | Snack `vendor.pay.saved` {number}; payment receipt (§7.2); profile refreshes |
| 409 `overpayment {owedTzs}` (balance changed meanwhile) | Sheet stays; Owes updated; inline `vendor.pay.overOwed` |
| 409 `allocation_stale` (a chosen sale was paid/voided meanwhile) | Preview reloads; `vendor.pay.allocStale` |
| 400 `reference_required` / `invalid_payment` / `received_on_invalid` | Inline on the field |
| 403 | `FFSnack.error` `vendor.customers.noAccess` |
| Network / 5xx | Sheet stays; `FFAlert` `vendor.pay.failed` + Try again (same `clientRef`). **Never queued** (§8) |

### 6.3 Voiding a credit sale (decision)
- **No later payments allocated:** S3 void flow unchanged. Body adds `vendor.sales.voidCreditBody` ("The balance due is cancelled. Give back any money paid at the sale yourself.").
- **Later customer payments allocated to it:** **refused** (409 `sale_has_payments {payments:[{id, number}]}`). The Void button stays, and the dialog explains `vendor.sales.voidHasPayments` with links to each `PMT-…`. The vendor voids those payments first (§6.4), re-records them if they belong to other sales, then voids the sale. Rationale: no money record is silently moved; O-8 forbids parking it as credit. (Alternative in Q-2.)

### 6.4 Voiding a customer payment
- From the payment receipt: **Void payment** (danger secondary, `customers`). `FFDialog`: `vendor.pay.voidTitle` {number}, body `vendor.pay.voidBody`, required reason (3–200).
- Effect: allocations removed; those sales' balances reopen; payment stays listed as Voided with who/when/why. Online only.
- Errors: 409 `already_voided`; network → `vendor.pay.voidOffline`.

---

## 7. Plain-text documents (S4; PDF and links are S5)

All texts: receipt language toggle as S3 §4.1 (EN | Kiswahili), lines ≤32 chars where possible, no phone/email/address of the customer, no FitFlex marketing line, "Not a TRA fiscal receipt." footer kept. Mobile: `share_plus`. Portal: **Copy text** + toast.

### 7.1 Credit sale receipt (S3 template + lines)
```
Customer: Juma M.
...
Total         TZS 95,000
Cash               20,000
Paid now           20,000
Balance due        75,000
Due by        27 Oct 2026
```

### 7.2 Payment receipt
```
{business}
Payment PMT-000004
22 Oct 2026
Customer: Juma M.
--------------------
M-Pesa (QK12AB34)  50,000
Paid towards:
R-000012           20,000
R-000015           30,000
--------------------
Still owed     TZS 25,000
Payment received by {business}.
Not a TRA fiscal receipt.
```
Voided payments cannot be shared.

### 7.3 Customer statement (`/vendor/customers/:id/statement`; portal Copy statement)
Preview screen with language toggle and **Share** / **Copy**. Content: business, `Statement for {name}`, `As of {date}`; **open pay-later sales** (number, sold date, due date, balance, "{n} days overdue"); **payments in the last 90 days** (number, date, amount); **Total owed**; aging line ("Overdue: 1–30 TZS X · 31–60 TZS Y …", zero buckets omitted). Empty owed: `vendor.statement.nothingOwed`.

---

## 8. Offline behaviour (recommendation)

| Action | Offline | Why |
|---|---|---|
| Paid sale, no customer | S3 queue unchanged | |
| Paid sale **with** customer, network fails at Complete | Queued with `customerId` only (no name, no phone in local storage). Queued receipt shows `vendor.receipt.customerAfterSync`. If sync returns `customer_not_found`/`customer_archived` → S3 conflict list with `vendor.sync.conflictCustomer` and **Try again without customer** | Keeps S3 rule: no customer data in the unencrypted queue |
| Picking a customer while offline | Not possible (picker offline alert) | No local customer cache |
| **Pay later** | **Online only**; button disabled offline; network failure at Complete is not queued | A debt must not exist only on one phone; balances/warnings need the server; avoids a debt silently failing later |
| Record / void payment | **Online only**, never queued (like S3 voids) | Over-payment check needs the live balance |
| Customer list / profile | Not cached; error state offline | Customer PII stays off device storage |

Draft cart keeps `customerId` (an opaque id). Sign-out (S3 §6.5) also clears any in-memory customer cache.

---

## 9. Notifications (recommendation)

- **To the vendor only:** daily overdue digest push + inbox `vendor_customers_overdue` at 09:00 EAT, only when at least one pay-later sale **became** overdue that day (EAT day after its due date). Data: `{count, totalTzs}`. Recipients: the vendor account and active staff with `customers`. Deep link `/vendor/home?open=customers&view=owed`. One per vendor per day; nothing on days with no new overdue sale.
  - Title/body in §11.7. Server templates (backend-builder), both languages.
  - Dormant under `VENDOR_CUSTOMERS`; push itself needs a real device.
- **Never to the customer.** FitFlex does not message walk-in or app customers about vendor debts (privacy, and money does not pass through FitFlex). The vendor sends a statement themselves (§7.3).

---

## 10. Owed to you (receivables aging)

Mobile: Customers tab → **Owed**. Portal: `/vendor/customers/?view=owed`.

### 10.1 Layout
1. **Summary** (`FFStatTile`s): Total owed · Overdue · Customers who owe. `As of {EAT date}`.
2. **Buckets**: 5 tiles (as §5.1), each a filter toggle (`Semantics(selected:)`); tapping one filters the list to customers with money in that bucket. "All" pill to clear.
3. **List** (default sort: most overdue first, then largest owed): name · owed · overdue amount · oldest due date · `{n} days overdue` badge. Tap → profile. Load more.
   - Portal desktop table: Customer · Not due yet · 1–30 · 31–60 · 61–90 · 90+ · Total owed · Oldest due · chevron; footer row with totals; `aria-label` `vendor.owed.title`. Sortable headers (`aria-sort`).
4. Shop sales only (pay-later). App orders never appear here (paid through FitFlex).

### 10.2 Aging rule (server computes; client never sums pages)
- Per open credit sale: outstanding = `balanceTzs` (after allocations, excluding voided sales and voided payments).
- `daysOverdue = EAT today − dueDate`. ≤0 → Not due yet (due today = not due yet); 1–30; 31–60; 61–90; ≥91 → Over 90 days.
- Day boundary is 00:00 EAT (21:00 UTC); specs must not flake around 21:00–22:00 UTC (known pattern).

### 10.3 States
Loading skeleton; empty `FFEmptyState` `vendor.owed.empty` ("Nobody owes you money."); filter empty `vendor.owed.emptyBucket`; error + Try again; offline as error.

---

## 11. Strings (EN + SW, all SW drafts for native review)

Terms: customer = mteja / wateja; pay later = lipa baadaye; credit sale = mauzo ya mkopo; owed to you = unachodai; owes = anadaiwa; overdue = imechelewa; balance due = kiasi kinachodaiwa; due date = tarehe ya mwisho ya kulipa; statement = taarifa ya akaunti; archive = weka kando. Reused: S3 `vendor.pos.method.*`, `vendor.pos.reference*`, `vendor.pos.moneyNotice`, `vendor.pos.notFiscal`, `vendor.pos.receiptLanguage`, `common.*`, `error.network`. Placeholders: `{name} {amount} {n} {date} {number} {q} {business} {owed}`.

### 11.1 Nav, permission, list
| Key | EN | SW (draft) |
|---|---|---|
| vendor.customers.tab | Customers | Wateja |
| vendor.nav.customers | Customers | Wateja |
| vendor.customers.seg.list | Customers | Wateja |
| vendor.customers.seg.owed | Owed | Madeni |
| vendor.customers.seg.messages | Messages | Ujumbe |
| vendor.permission.customersHint | Customers, messages, money owed and payments | Wateja, ujumbe, madeni na malipo |
| vendor.customers.noAccess | You don't have access to customers. | Huna ruhusa ya kuona wateja. |
| vendor.customers.search | Search customers | Tafuta wateja |
| vendor.customers.searchHint | Name or phone number | Jina au namba ya simu |
| vendor.customers.filter.all | All | Wote |
| vendor.customers.filter.owe | Owe you | Wanadaiwa |
| vendor.customers.filter.overdue | Overdue | Wamechelewa |
| vendor.customers.filter.shop | Shop customers | Wateja wa dukani |
| vendor.customers.filter.app | App customers | Wateja wa app |
| vendor.customers.filter.archived | Archived | Waliowekwa kando |
| vendor.customers.sort | Sort | Panga |
| vendor.customers.sort.name / owed / overdue / recent | Name A–Z / Most owed / Most overdue / Last purchase | Jina A–Z / Deni kubwa zaidi / Waliochelewa zaidi / Walionunua karibuni |
| vendor.customers.badge.shop | Shop customer | Mteja wa dukani |
| vendor.customers.badge.app | App customer | Mteja wa app |
| vendor.customers.badge.archived | Archived | Amewekwa kando |
| vendor.customers.overdueBadge | Overdue | Imechelewa |
| vendor.customers.lastBought | Last bought {date} | Alinunua mwisho {date} |
| vendor.customers.rowLabel | {name}, {type}, owes {amount}, {status} | {name}, {type}, anadaiwa {amount}, {status} |
| vendor.customers.add | Add customer | Ongeza mteja |
| vendor.customers.loading | Loading customers | Inapakia wateja |
| vendor.customers.emptyFirst | No customers yet. They appear after an app order, or add one yourself. | Bado hakuna wateja. Wataonekana baada ya oda ya app, au ongeza mwenyewe. |
| vendor.customers.empty | No customers here. | Hakuna wateja hapa. |
| vendor.customers.noMatch | No customers match "{q}". | Hakuna mteja anayelingana na "{q}". |
| vendor.customers.failed | Could not load customers. | Imeshindikana kupakia wateja. |

### 11.2 Form
| Key | EN | SW (draft) |
|---|---|---|
| vendor.customers.newTitle | New customer | Mteja mpya |
| vendor.customers.editTitle | Edit customer | Hariri mteja |
| vendor.customers.name | Name | Jina |
| vendor.customers.phone | Phone number (optional) | Namba ya simu (si lazima) |
| vendor.customers.email | Email (optional) | Barua pepe (si lazima) |
| vendor.customers.address | Address (optional) | Anwani (si lazima) |
| vendor.customers.note | Note (optional) | Maelezo (si lazima) |
| vendor.customers.noteHint | Only you and your staff see this. | Ni wewe na wafanyakazi wako tu mnaoona hili. |
| vendor.customers.nameRequired | Enter the customer's name. | Weka jina la mteja. |
| vendor.customers.phoneInvalid | Enter a valid Tanzanian phone number. | Weka namba sahihi ya simu ya Tanzania. |
| vendor.customers.phoneDuplicate | {name} already has this number. | {name} tayari ana namba hii. |
| vendor.customers.open | Open | Fungua |
| vendor.customers.consent | Only save details the customer agreed to give you. | Hifadhi taarifa ambazo mteja amekubali kukupa tu. |
| vendor.customers.save | Save | Hifadhi |
| vendor.customers.saved | Customer saved | Mteja amehifadhiwa |
| vendor.customers.saveOffline | No connection. Nothing was saved. | Hakuna mtandao. Hakuna kilichohifadhiwa. |
| vendor.customers.changedElsewhere | Someone else changed this customer. Reload to see the latest. | Mtu mwingine amebadilisha mteja huyu. Pakia upya uone ya sasa. |
| vendor.customers.reload | Reload | Pakia upya |
| vendor.customers.discardTitle | Discard changes? | Uachane na mabadiliko? |
| vendor.customers.archive | Archive | Weka kando |
| vendor.customers.restore | Restore | Rudisha |
| vendor.customers.archiveTitle | Archive {name}? | Umweke kando {name}? |
| vendor.customers.archiveBody | Their history stays. They won't appear when you pick a customer for a sale. | Historia yake itabaki. Hataonekana unapochagua mteja wa mauzo. |
| vendor.customers.archiveHasBalance | This customer still owes {amount}. Record the payment first. | Mteja huyu bado anadaiwa {amount}. Rekodi malipo kwanza. |
| vendor.customers.appNameHint | Name from their FitFlex account. | Jina kutoka akaunti yake ya FitFlex. |
| vendor.customers.appContactHint | Contact details show on an order while you're delivering it. | Taarifa za mawasiliano huonekana kwenye oda wakati unaiwasilisha. |

### 11.3 Profile
| Key | EN | SW (draft) |
|---|---|---|
| vendor.customers.call | Call {name} | Mpigie {name} |
| vendor.customers.owes | Owes you | Anadaiwa |
| vendor.customers.overdueAmount | Overdue {amount} | Imechelewa {amount} |
| vendor.customers.asOf | As of {date} | Hadi {date} |
| vendor.customers.paidOff | Nothing owed. All paid off. | Hakuna deni. Yote yamelipwa. |
| vendor.customers.shopSales | Shop sales | Mauzo ya dukani |
| vendor.customers.appOrders | App orders | Oda za app |
| vendor.customers.payments | Payments | Malipo |
| vendor.customers.openSales | Pay-later sales still open | Mauzo ya mkopo ambayo hayajalipwa |
| vendor.customers.dueOn | Due {date} | Mwisho {date} |
| vendor.customers.daysOverdue | {n} days overdue | Imechelewa siku {n} |
| vendor.customers.notFound | This customer is not available. | Mteja huyu hapatikani. |
| vendor.customers.back | Back to customers | Rudi kwa wateja |
| vendor.aging.current | Not due yet | Bado muda haujafika |
| vendor.aging.d1_30 | 1–30 days | Siku 1–30 |
| vendor.aging.d31_60 | 31–60 days | Siku 31–60 |
| vendor.aging.d61_90 | 61–90 days | Siku 61–90 |
| vendor.aging.d90plus | Over 90 days | Zaidi ya siku 90 |


### 11.4 POS and receipt
| Key | EN | SW (draft) |
|---|---|---|
| vendor.pos.customer.add | Add customer | Ongeza mteja |
| vendor.pos.customer.remove | Remove {name} from this sale | Mwondoe {name} kwenye mauzo haya |
| vendor.pos.customer.pick | Choose customer | Chagua mteja |
| vendor.pos.customer.new | New customer | Mteja mpya |
| vendor.pos.customer.selected | Customer selected | Mteja amechaguliwa |
| vendor.pos.customer.offline | Choosing a customer needs a connection. | Kuchagua mteja kunahitaji mtandao. |
| vendor.pos.customer.gone | That customer is no longer available. Choose again. | Mteja huyo hapatikani tena. Chagua tena. |
| vendor.pos.payLater | Pay later | Lipa baadaye |
| vendor.pos.credit.title | Pay later: {amount} owed | Lipa baadaye: anadaiwa {amount} |
| vendor.pos.dueDate | Due date | Tarehe ya mwisho ya kulipa |
| vendor.pos.credit.in7 / in14 / in30 / choose | In 7 days / In 14 days / In 30 days / Choose date | Baada ya siku 7 / 14 / 30 / Chagua tarehe |
| vendor.pos.credit.dueOn | Due {date} | Mwisho {date} |
| vendor.pos.credit.paidNow | Paid now | Amelipa sasa |
| vendor.pos.credit.balance | Balance due: {amount} | Kiasi kinachodaiwa: {amount} |
| vendor.pos.credit.alreadyOwes | {name} already owes you {amount}. | {name} tayari anadaiwa {amount}. |
| vendor.pos.credit.notice | You give this credit yourself. FitFlex does not collect it. | Mkopo huu unautoa wewe mwenyewe. FitFlex haiukusanyi. |
| vendor.pos.credit.complete | Complete pay-later sale | Kamilisha mauzo ya mkopo |
| vendor.pos.credit.backToFull | Back to full payment | Rudi kwenye malipo kamili |
| vendor.pos.credit.needsConnection | Pay later needs a connection. | Lipa baadaye kunahitaji mtandao. |
| vendor.pos.credit.failed | Could not save. A pay-later sale is never saved offline. Try again or take full payment. | Imeshindikana kuhifadhi. Mauzo ya mkopo hayahifadhiwi bila mtandao. Jaribu tena au pokea malipo kamili. |
| vendor.pos.credit.notAllowed | You don't have permission to sell on credit. | Huna ruhusa ya kuuza kwa mkopo. |
| vendor.pos.credit.dueInvalid | Choose a date from the sale day up to one year ahead. | Chagua tarehe kuanzia siku ya mauzo hadi mwaka mmoja mbele. |
| vendor.pos.credit.fullyPaid | This sale is fully paid, so it isn't pay later. | Mauzo haya yamelipwa yote, si ya mkopo. |
| vendor.pos.credit.noChange | No change on a pay-later sale. Lower the cash amount. | Hakuna chenji kwenye mauzo ya mkopo. Punguza kiasi cha taslimu. |
| vendor.pos.credit.saved | Pay-later sale saved: {number} | Mauzo ya mkopo yamehifadhiwa: {number} |
| vendor.receipt.customer | Customer: {name} | Mteja: {name} |
| vendor.receipt.customerAfterSync | Customer shown after sync | Mteja ataonekana baada ya kutumwa |
| vendor.receipt.balanceDue | Balance due | Kiasi kinachodaiwa |
| vendor.receipt.dueBy | Due by | Mwisho wa kulipa |
| vendor.receipt.footerCredit | {business} recorded the balance due. | {business} imerekodi kiasi kinachodaiwa. |
| vendor.sales.payLaterBadge | Pay later | Mkopo |
| vendor.sales.filter.credit | Pay later | Mkopo |
| vendor.sales.owesBadge | Owes {amount} | Anadaiwa {amount} |
| vendor.sales.paidOffBadge | Paid off | Imelipwa |
| vendor.sales.voidCreditBody | The balance due is cancelled. Give back any money paid at the sale yourself. | Kiasi kinachodaiwa kitafutwa. Rudisha mwenyewe pesa yoyote iliyolipwa wakati wa mauzo. |
| vendor.sales.voidHasPayments | Payments are recorded against this sale. Void them first: {numbers} | Kuna malipo yaliyorekodiwa kwa mauzo haya. Yabatilishe kwanza: {numbers} |
| vendor.sync.conflictCustomer | The customer on this sale is no longer available. | Mteja wa mauzo haya hapatikani tena. |
| vendor.sync.retryNoCustomer | Try again without customer | Jaribu tena bila mteja |

### 11.5 Payments
| Key | EN | SW (draft) |
|---|---|---|
| vendor.pay.record | Record payment | Rekodi malipo |
| vendor.pay.title | Record payment from {name} | Rekodi malipo ya {name} |
| vendor.pay.amount | Amount received (TZS) | Kiasi kilichopokelewa (TZS) |
| vendor.pay.allOwed | All owed {amount} | Deni lote {amount} |
| vendor.pay.oldest | Oldest sale {amount} | Mauzo ya zamani zaidi {amount} |
| vendor.pay.date | Date received | Tarehe ya kupokea |
| vendor.pay.appliesTo | Applies to | Inalipia |
| vendor.pay.paysOff | Pays off {number} ({amount}) | Inamaliza {number} ({amount}) |
| vendor.pay.paysPart | Pays {amount} of {number} ({left} left) | Inalipa {amount} ya {number} (zimebaki {left}) |
| vendor.pay.chooseSales | Choose sales | Chagua mauzo |
| vendor.pay.oldestFirst | Oldest due first | Lililochelewa zaidi kwanza |
| vendor.pay.allocMismatch | Amounts must add up to {amount}. | Viasi lazima vifike {amount}. |
| vendor.pay.overOwed | That's more than the {owed} owed. FitFlex can't keep extra as credit. | Hicho ni zaidi ya deni la {owed}. FitFlex haiwezi kuhifadhi ziada kama salio. |
| vendor.pay.notice | You received this money directly. FitFlex only keeps the record. | Umepokea pesa hii moja kwa moja. FitFlex inahifadhi kumbukumbu tu. |
| vendor.pay.save | Save payment {amount} | Hifadhi malipo {amount} |
| vendor.pay.saved | Payment saved: {number} | Malipo yamehifadhiwa: {number} |
| vendor.pay.failed | Could not save the payment. Nothing is recorded yet. | Imeshindikana kuhifadhi malipo. Hakuna kilichorekodiwa bado. |
| vendor.pay.allocStale | Those sales changed. Check the new amounts. | Mauzo hayo yamebadilika. Angalia viasi vipya. |
| vendor.pay.offline | Recording a payment needs a connection. | Kurekodi malipo kunahitaji mtandao. |
| vendor.pay.receiptTitle | Payment {number} | Malipo {number} |
| vendor.pay.paidTowards | Paid towards | Imelipia |
| vendor.pay.stillOwed | Still owed | Bado anadaiwa |
| vendor.pay.void | Void payment | Batilisha malipo |
| vendor.pay.voidTitle | Void payment {number}? | Ubatilishe malipo {number}? |
| vendor.pay.voidBody | The sales it paid will show as owed again. Give back the money yourself if needed. | Mauzo iliyolipia yataonekana kudaiwa tena. Rudisha pesa mwenyewe ikihitajika. |
| vendor.pay.voided | Payment {number} voided | Malipo {number} yamebatilishwa |
| vendor.pay.voidedBy | Voided by {name}, {time}: {reason} | Yamebatilishwa na {name}, {time}: {reason} |
| vendor.pay.voidOffline | Voiding needs a connection. Nothing was changed. | Kubatilisha kunahitaji mtandao. Hakuna kilichobadilishwa. |
| vendor.pay.alreadyVoided | This payment was already voided. | Malipo haya yalishabatilishwa. |

### 11.6 Owed to you, statement, dashboard
| Key | EN | SW (draft) |
|---|---|---|
| vendor.owed.title | Owed to you | Unachodai |
| vendor.owed.total | Total owed | Jumla ya madeni |
| vendor.owed.overdue | Overdue | Yaliyochelewa |
| vendor.owed.customers | Customers who owe | Wateja wanaodaiwa |
| vendor.owed.card | Owed to you: {amount} · {n} overdue | Unachodai: {amount} · {n} yamechelewa |
| vendor.owed.oldestDue | Oldest due | Deni la zamani zaidi |
| vendor.owed.empty | Nobody owes you money. | Hakuna mteja anayedaiwa. |
| vendor.owed.emptyBucket | No money owed in this group. | Hakuna deni katika kundi hili. |
| vendor.statement.title | Statement for {name} | Taarifa ya akaunti ya {name} |
| vendor.statement.share | Share statement | Tuma taarifa ya akaunti |
| vendor.statement.copy | Copy statement | Nakili taarifa ya akaunti |
| vendor.statement.recentPayments | Payments, last 90 days | Malipo, siku 90 zilizopita |
| vendor.statement.totalOwed | Total owed | Jumla inayodaiwa |
| vendor.statement.nothingOwed | Nothing owed. Thank you. | Hakuna deni. Asante. |
| vendor.dash.owed | Owed to you | Unachodai |
| vendor.dash.owedHint | {n} overdue · not in FitFlex payouts | {n} yamechelewa · si sehemu ya malipo ya FitFlex |


### 11.7 Server push `vendor_customers_overdue`
| Part | EN | SW (draft) |
|---|---|---|
| title | {n} pay-later sales are now overdue | Mauzo {n} ya mkopo yamechelewa |
| body | TZS {amount} is past its due date. See who owes you. | TZS {amount} imepita tarehe ya mwisho. Ona wanaokudai. |

### 11.8 Swahili overflow
- Tab "Wateja" (6) fits. Segments "Wateja | Madeni | Ujumbe" fit at 375 (≈110dp each).
- Filter pills: "Waliowekwa kando" (16) and "Wateja wa dukani" (16) wrap to a second row at 375; never truncate.
- Aging tiles: "Bado muda haujafika" (19) wraps to 2 lines inside the tile; tile height grows. 3+2 grid at 375, 5 in a row ≥900.
- `vendor.pos.credit.failed` and `vendor.pay.overOwed` SW (~110 chars) wrap in `FFAlert`.
- Pay later button "Lipa baadaye" and "Kamilisha mauzo ya mkopo" (24) fit full width.
- Text share: "Kiasi kinachodaiwa" (18) + amount fits 32 chars; "Mwisho wa kulipa" (16) + date fits.

---

## 12. Accessibility
- Targets: mobile ≥48dp (pills, chips, clear ×, Call, bucket tiles, row taps); portal ≥44px.
- Labels: every control labelled (Flutter web semantics tree). Customer row = merged semantics `vendor.customers.rowLabel`; bucket tiles "{bucket}, {amount}, selected/not selected"; Call button includes the name; clear-customer chip includes the name; allocation preview is a polite live region; Balance due and over-owed errors are announced (assertive for errors).
- Focus order, payment sheet: close → amount → quick chips → method chips → reference → date → note → Choose sales → Save. Credit mode: customer → due date chips → payment rows → Complete. After save: focus to the payment receipt heading. Portal dialogs: focus trap, Escape closes, focus returns to the trigger; profile open → focus on name heading.
- Contrast ≥4.5:1 light and dark; Overdue always has text; amounts never colour-only; Volt only in dark.
- Text scale 200%: aging tiles stack 2 per row; owed card stacks amount over Overdue; table views switch to cards.

---

## 13. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint / data | Fields | Status |
|---|---|---|
| `GET /vendor/tools/options`, `/vendor/me.tools` | `customers: bool` | flag exists (`feature-flags.mjs`); confirm key in options |
| `GET /vendor/customers` | query `q, filter=all\|owes\|overdue\|manual\|marketplace\|archived, bucket?, sort=name\|owed\|overdue\|recent, cursor, limit`; rows `{id, source, name, phone? (manual only), lastPurchaseAt, owedTzs, overdueTzs, oldestDueDate, archived}`; `nextCursor` | plan endpoint; **filters/sort/row fields requested** |
| Picker search for `sales`-only users | same list endpoint (or `GET /vendor/customers/lookup?q=`) allowed for `sales`, returning `{id, source, name, phoneLast3}` and **omitting** money fields when the caller lacks `customers` | **new, requested** (permission rule) |
| `POST/PUT /vendor/customers[/:id]` | `{name, phone?, email?, address?, note?, archived?}` + `updatedAt` (409 `customer_changed`); marketplace: only `note`, `archived` accepted (others 400 `field_not_editable`); 409 `customer_has_balance` on archive; `phoneDuplicate: {id, name}` warning in the response | plan; **errors and duplicate hint requested** |
| `GET /vendor/customers/:id` | `{id, source, name, phone?, email?, address?, note, archivedAt, createdAt, updatedAt, totals{shopSalesTzs, shopSalesCount, appOrdersTzs, appOrdersCount, lastPurchaseAt}, owedTzs, overdueTzs, aging{current, d1_30, d31_60, d61_90, d90plus}, asOf, openSales[{id, number, soldAt, dueDate, totalTzs, balanceTzs, daysOverdue}]}` — **never** buyerUserId, buyer phone/email/address for marketplace | plan lists totals/aging; **exact keys requested**; A-02 assertion in specs |
| Profile activity | `GET /vendor/sales?customerId=` (S3 list + `kind, balanceTzs, dueDate, customer{id,name}`); `GET /vendor/orders?customerId=` (S2 allowlist, own lines only); `GET /vendor/customers/:id/payments?cursor` | **`customerId` filters requested** (or embedded paged lists) |
| `POST /vendor/sales` | adds `customerId?`, `kind:'cash'\|'credit'`, `dueDate?`; errors `credit_not_allowed`(403), `customer_not_found`, `customer_archived`, `due_date_invalid`, `credit_fully_paid`, `change_not_allowed` | plan; **error codes requested** |
| Sale object | adds `kind, customer{id, name}\|null, dueDate, balanceTzs (current outstanding), allocations[{paymentId, number, amountTzs, voided}]` | **confirm**: do later allocations update `VendorSale.paidTzs/balanceTzs` (CHECK `vendorsale_paid_adds_up`) or is balance derived? Spec reads `balanceTzs` as current outstanding |
| `POST /vendor/sales/:id/void` | 409 `sale_has_payments{payments[{id, number}]}` | **new error, requested** (§6.3) |
| `POST /vendor/customers/:id/payments` | req `{clientRef, amountTzs, method, reference?, receivedOn, note?, allocations?}`; res `{payment{id, number, amountTzs, method, reference, receivedOn, recordedBy{id,name}, allocations[{saleId, saleNumber, amountTzs}], voidedAt, voidedBy, voidReason}, customer{owedTzs, aging}}`; errors `overpayment{owedTzs}`, `allocation_stale`, `reference_required`, `invalid_payment`, `received_on_invalid` | plan has amount/method/reference/allocations; **`clientRef`, `receivedOn`, `note` requested** (plan has `receivedAt`; schema lacks clientRef/note/void fields) |
| `POST /vendor/customers/:id/payments/:pid/void` | `{reason}`; `already_voided` | **new endpoint + `voidedBy`, `voidReason` columns requested** |
| `GET /vendor/receivables/aging` | `{asOf, totals{owedTzs, overdueTzs, customerCount, current, d1_30, d31_60, d61_90, d90plus}, rows[{customerId, name, source, owedTzs, overdueTzs, oldestDueDate, maxDaysOverdue, current…d90plus}], nextCursor}`; query `bucket, sort, cursor` | plan; **shape requested** |
| Marketplace customer creation | on first **paid** order with this vendor; name snapshot refreshed on each later paid order (Q-6); **backfill** from existing paid orders (Q-6) | plan + requests |
| S2 order view | `buyer.customerId` present → mobile/portal link to profile | S2 has it |
| Push `vendor_customers_overdue` | `{type, count, totalTzs}`; recipients vendor + staff with `customers`; once per vendor per EAT day | **new, requested** (§9) |

---

## Open questions — decided 2026-10-20 (lead applied every recommendation below; owner may override)

- **Q-1 Where Customers lives on mobile.** Rec: turn tab 3 (Messages, already guarded by `customers`) into **Customers** with segments Customers | Owed | Messages when the flag is on. Alt: Business-tab tile (but staff with only `customers` don't see Business).
- **Q-2 Voiding a credit sale that later payments paid into.** Rec: refuse until those payments are voided (§6.3). Alt: auto-reallocate them to the customer's other open sales oldest-first, refusing only the part that can't be placed (O-8).
- **Q-3 Who records customer payments.** Rec: `customers` only. Alt: also `sales` (cashier takes debt payments at the counter).
- **Q-4 Backdating a payment.** Rec: up to 30 days back, never future; recorded time kept separately.
- **Q-5 Credit limit per customer.** Rec: none in v1; the POS shows existing debt and overdue as a warning.
- **Q-6 Marketplace customers.** Rec: backfill from existing paid orders at deploy (idempotent); refresh the name snapshot on each new paid order; the vendor may attach shop sales and pay-later sales to an app customer (no phone added).
- **Q-7 Duplicate phone on walk-in customers.** Rec: warn with a link, don't block. No merge in v1.
- **Q-8 Deleting a walk-in customer.** Rec: archive only in v1; deletion follows O-15 / counsel retention text (vendor terms still draft).
- **Q-9 Overdue digest.** Rec: vendor-only daily push as §9, dormant with the flag; nothing ever to the customer.
- **Q-10 Default due date.** Rec: 7 days preselected.
- **Q-11 Pay later offline.** Rec: online only (§8). Alt: queue credit sales for existing customers (needs encrypted local customer cache).

---

## 15. Acceptance criteria (UAT on Flutter web and portal from RC; isolated backend; seed vendor, staff with `sales` only, staff with `customers` only, staff with both, a buyer with a paid app order)

Gating and permissions
1. With `customers: false` (or options failing): tab 3 reads "Messages" with no segments; no customer chip in the POS; no Pay later; portal has no Customers nav or "Owed to you" card; `/vendor/customers/new` redirects to vendor home with no message.
2. Flag on: tab 3 reads "Customers / Wateja" with segments Customers | Owed | Messages; the messages unread badge still shows.
3. Staff with `sales` only: can attach a customer to a paid sale via the picker, which shows names and phone endings but no amounts; Pay later is not shown; the API response for their picker search contains no `owedTzs`.
4. Staff with `customers` only: see customers, Owed, record payments; no Sales tab.
5. Pay later appears only for users with both `sales` and `customers`; a crafted credit request from a `sales`-only user gets 403 `credit_not_allowed`.
6. Portal: `/vendor/customers/` reachable only with `tools.customers` and `customers`.

Customers and A-02
7. After a buyer's first **paid** order, that buyer appears as "App customer" with their name; an unpaid order creates no customer.
8. An app customer's profile, edit form, statement and API response show no phone, email, address or buyerUserId, even while the order's contact window is open; the order itself (S2) still shows contact inside the window.
9. An app customer's name is read-only; only Note and Archive are editable.
10. Add walk-in customer: name required; `0712345678` is saved as `+255712345678`; an invalid phone shows the error; a duplicate phone shows "{name} already has this number." with Open, and still saves.
11. Archiving a customer who owes money is refused with the message; archiving one with nothing owed moves them to Archived and out of the POS picker; Restore brings them back.
12. Vendor A cannot open vendor B's customer (not-found) on mobile or portal.
13. List search by name and by phone digits works; filters All / Owe you / Overdue / Shop / App / Archived and sorts behave as named; Load more appends.

POS and credit sales
14. A paid sale with a customer shows "Customer: {name}" on the receipt and share text; no phone.
15. Pay later on a TZS 95,000 sale with Cash 20,000 and due "In 7 days" saves; receipt shows Paid now 20,000, Balance due 75,000, Due by (sale date + 7, EAT), badge Pay later, footer "{business} recorded the balance due."; no Change line.
16. Pay later with zero paid now saves with Balance due = total.
17. In credit mode, cash above the remaining amount shows "No change on a pay-later sale…" and Complete is disabled; Σ paid ≥ total shows "fully paid" and offers Back to full payment.
18. M-Pesa paid-now without a reference keeps Complete disabled (S3 rule).
19. Due date earlier than the sale day or beyond a year cannot be chosen.
20. When the customer already owes money, the warning "{name} already owes you {amount}." shows; the sale still completes.
21. Offline: Pay later is disabled with "Pay later needs a connection."; a network failure at Complete of a credit sale shows the not-saved error, keeps the cart, and creates no queued item.
22. Offline paid sale with a customer queues; the queued receipt says "Customer shown after sync"; local storage (devtools) holds only `customerId`, no name or phone; after sync the receipt shows the name.
23. Sales history shows credit sales with "Pay later" and "Owes {amount}" / "Paid off"; the Pay later filter works.

Payments and allocation
24. Customer with R-1 (20,000, due earliest) and R-2 (30,000): payment of 25,000 previews "Pays off R-1" and "Pays 5,000 of R-2 (25,000 left)"; after saving, R-1 is Paid off, R-2 owes 25,000; number is PMT-000001, next PMT-000002.
25. Choose sales: allocating 25,000 entirely to R-2 works; amounts not adding up show "Amounts must add up to…" and Save is disabled.
26. Entering more than owed shows "That's more than the {owed} owed…" and Save is disabled; a server `overpayment` race (second session pays first) shows the same message with the updated owed amount; nothing is saved.
27. Reference rules match S3 (required for mobile money and bank, hidden for cash).
28. Retrying a payment after a lost response records exactly one payment.
29. Payment receipt shows method, reference, the sales paid and Still owed; Share/Copy produce §7.2 text in the chosen language.
30. Void payment requires a reason; afterwards the payment shows Voided with who/when/why, the sales it paid reopen, and a second void shows "already voided".
31. Recording or voiding a payment offline shows the needs-connection message and changes nothing.

Voiding credit sales
32. Voiding a credit sale with no later payments: dialog includes "The balance due is cancelled…"; stock returns once; the balance leaves Owed.
33. Voiding a credit sale that a PMT paid into is refused, listing the PMT numbers with links; after voiding that payment, the sale can be voided.

Aging and Owed to you
34. With EAT today = 20 Oct: sales due 20 Oct → Not due yet; 19 Oct → 1–30; 19 Sep (31 days) → 31–60; 21 Jul (91 days) → Over 90 days. Profile, Owed list and portal table agree, including when checked between 21:00 and 24:00 UTC.
35. Owed to you: summary totals equal the sum of rows; tapping a bucket filters the list; default order is most overdue first; app orders never appear.
36. Portal aging table has the five bucket columns and a totals row; headers sort with `aria-sort`.
37. Portal dashboard shows "Owed to you" with "{n} overdue", separate from sales cards.

Statement and notifications
38. Statement lists open pay-later sales with due dates and days overdue, last-90-day payments, total owed and the aging line; no phone/address; language toggle switches labels.
39. (Server spec / real device) `vendor_customers_overdue` is sent once on the EAT day a sale becomes overdue, to the vendor and staff with `customers` only, and opens Owed; no message ever goes to the customer.

Accessibility and language
40. Every control on the list, form, profile, picker, credit mode, payment sheet, Owed and portal pages has a screen-reader label; allocation preview, Balance due and over-owed errors are announced.
41. Touch targets ≥48dp mobile / ≥44px portal; contrast ≥4.5:1 light and dark; Overdue and Paid off always carry text.
42. In Kiswahili at 375px and text scale 200%: no clipped text in segments, filter pills, aging tiles, credit mode, payment sheet or receipts; no English except "Stock", "SKU", "app", product/brand names, method brand names and user-entered text.

Not verifiable on Flutter web (needs a real device): Android offline queue with a customer, `tel:` Call, share into WhatsApp/SMS, push delivery of the overdue digest.
