# Vendor web portal and order privacy (S2): design spec

Status: DRAFT for review. Date: 2026-10-19. Author: design-agent.
Plan: `docs/plans/vendor-business-tools-plan.md` §0 (F5, F6), §1, S2, §3, §4 (approved 2026-10-19). S1 spec: `docs/design/vendor-stock-ledger-s1.md` (behaviour and strings reused here).
Read from `origin/release-candidate`: portal ef9650f (`app/login/page.tsx`, `app/providers.tsx`, `src/components/Shell.tsx`, `src/components/shared.tsx`, `dialog.tsx`, `partner-payouts.tsx`, `app/owner/statements/page.tsx`, `app/admin/products/page.tsx`, `src/lib/api.ts`, `next.config.mjs`), functions 582d22c (`functions/shop.mjs`, `functions/pin-auth.mjs`, `src/services/shop-service.mjs`, `auth-service.mjs`, `pin-auth-service.mjs`, `vendor-settlement-service.mjs`, `src/shared/order-lifecycle.mjs`, `feature-flags.mjs`), mobile `lib/shared/i18n.dart` (order status strings).
Platform: Next.js portal (static export, `trailingSlash: true`; **no dynamic route segments**, so detail views use query strings). Roles: `vendor`, `vendor_staff`, FitFlex `admin` (admin products page only).

Owner decisions applied: O-3 (buyer phone and address only while the vendor's part is open and for 7 days after delivery, display name always); cost price visible only to the vendor account, vendor staff with `vendorRole: 'admin'`, and FitFlex admins; the portal hides cost UI when the field is absent; Swahili "variant" = chaguo / machaguo; "Stock" stays English.

---

## 0. Scope, gating, reuse

### 0.1 Gating (fail closed)
After any vendor sign-in the portal calls `GET /vendor/me` (new) once per session, and again on a full reload.
- `tools.portal === true`: vendor area opens.
- `tools.portal === false`, 404 (`feature_disabled` or route missing), or network error on first load: show the **Portal not open** screen (§2.4). Never show the vendor nav.
- Inside the area, each feature reads `tools` (same object as `GET /vendor/tools/options`): low stock, Adjust stock and Stock history need `tools.stockLedger`; buyer phone and address need `tools.buyerContact` (the server also enforces it). Cost UI needs `tools.canSeeCost` **and** the field present on the row.
- A feature that is off is simply absent. No "coming soon" text, except the Portal not open screen.

### 0.2 Permissions
`permissions[]` from `/vendor/me`. The vendor account has all. Staff have their copied list (F8).

| Area | Needs |
|---|---|
| Dashboard | any active vendor user (cards filtered, §3) |
| Products, Adjust stock, Stock history | `products` |
| Orders, status moves | `orders` |
| Payouts | `payments` |
| Staff (link to the app, §2.2) | `staff` |
| Reports, Customers | not in S2 (S4, S6) |

The server is the authority; the portal hides what is not allowed and handles 403 anyway (§2.5).

### 0.3 Components (reuse; no new shared component)

| Need | Reuse |
|---|---|
| Page title + actions | `PageHeader` |
| Lists | `Table`/`THead`/`TBody`/`Tr`/`Th`/`Td` (`aria-label` required), card list below `md` (§8) |
| Figures | `MetricCard` (dashboard), `Stat` (detail headers) |
| Status chips | `Badge` (tones: `success`, `warning`, `error`, `gray`, `brand`) |
| Filters | `Segmented` (status tabs), `Select`, `Input` (search) |
| Dialogs | `Dialog` + `DialogFooter` (Adjust stock, status move with reason, cancel order); `ConfirmDialog` (cancel order) |
| States | `SkeletonTable`, `SkeletonCard`, `EmptyState`, `ErrorState`, `Alert`, `Spinner` |
| Feedback | `useToast` (success/error) |
| Forms | `Field` (label, hint, error), `Input`, `Textarea`, `Radio` group for reasons |
| Shell | `Shell` + `SidebarContent` (new `vendorNav`), `LanguageToggle` |
| Payouts | `partner-payouts.tsx` (extended, see §6), `owner/statements` read-only patterns |

**Changes to existing components (not new components):**
1. `partner-payouts.tsx` gets `audience: 'admin' | 'partner'` (default `admin`). `partner` hides Prepare and every workflow action, reads `/vendor/statements[/:id]`, and moves its hard-coded English (`KIND`, `ERRORS`, `whyNot`) into `src/lib/i18n.ts` (needed anyway for rule 5). Why not a new component: the table, detail and line layout are exactly what a vendor needs; only the actions differ.
2. `Shell.tsx`: vendor nav, routing guards, i18n'd subtitle and role label (the current `'Operator Portal'`, `'Company HR'`, `' · staff'` are hard-coded English; the vendor variants must not be).
3. `providers.tsx`: `PORTAL_PERSONA_TYPES` adds `vendor`, `vendor_staff` so the role switcher can move between a gym and a vendor persona.

### 0.4 Routes (static export: query strings for detail)

| Route | Screen |
|---|---|
| `/vendor/` | Dashboard |
| `/vendor/products/` | Products (`?filter=low` opens the Low filter) |
| `/vendor/products/history/?id=<productId>&variant=<name?>` | Stock history |
| `/vendor/orders/` | Orders (`?status=open|delivered|cancelled|all`) |
| `/vendor/orders/?id=<orderId>` | Order detail (same page, detail panel) |
| `/vendor/payouts/` | Payouts (`?id=<statementId>` opens one) |

Unknown or forbidden `/vendor/*` paths go to the first allowed nav item (§2.5).

---

## 1. Sign-in (`app/login/page.tsx`)

### 1.1 Layout (unchanged card, max width 384px, centred; 375px: 16px side padding)
Order in the `choose` step:
1. **Continue with Google** (primary, existing).
2. divider "or".
3. **Continue with email** (secondary, existing).
4. **Business sign-in (number + PIN)** (secondary, new; `data-testid="pin-method-btn"`). Shown only when `GET /auth/options` → `pinLogin: true` (fetch on page load; failure or false = hidden).
5. Company HR link (existing).

Headline copy changes so vendors know they belong here: `login.heading` "Sign in to FitFlex for partners", `login.assignedAccount` mentions businesses (§9.1). `login.adminRequired` lists vendors.

### 1.2 PIN step (`method === 'pin'`, `data-testid="pin-login-form"`)
- Title `login.pinHeading`, hint `login.pinHint`.
- **Mobile number or email** (`Input`, `type="text"`, `inputMode="email"`, `autoComplete="username"`, required, `data-testid="pin-identifier-input"`). Contains `@` → sent as `email`, else as `phone`.
- **PIN** (`Input`, `type="password"`, `inputMode="numeric"`, `pattern="[0-9]{4}"`, `maxLength=4`, `autoComplete="current-password"`, required, `data-testid="pin-input"`). Client check: exactly 4 digits, else inline `login.pinFormat` (no request).
- Primary **Sign in** (`login.submit`, full width, 44px tall, spinner + `login.signingIn` while busy). Link **Back to sign-in options**.
- Hint line under the form: `login.pinForgot` ("Forgot your PIN? Reset it in the FitFlex app."). No reset flow on the portal in S2.

### 1.3 PIN responses → what the user sees

| Response of `POST /auth/pin/login` | Result |
|---|---|
| `{ token, user }`, `user.userType` is `vendor` or `vendor_staff` | `signIn`, go to `/vendor/` |
| `{ token, user }`, other portal type (`gym_operator`, `gym_staff`, `corporate_hr`, admin) | existing `handleSuccess` routing |
| `{ token, user }`, `member`/`trainer`, and `personas[]` has a usable `vendor` or `vendor_staff` (accountStatus not `suspended`) | `POST /auth/switch-persona` to it (vendor before vendor_staff; then gym persona), then `/vendor/` |
| same, no portal persona usable | Do not store the token. Error `login.adminRequired` |
| `personas[]` has a `vendor_staff` with `accountStatus: 'suspended'` and nothing usable | Error `login.vendorStaffDisabled` (do not store token). See Q-2. |
| `setupRequired: true` | Error/info `login.pinSetupInApp` (finish in the app) |
| `startPin: true` or `onboarding: true` | Info `login.pinNoBusiness` |
| 401 `invalid_credentials` | `login.pinWrong` |
| 429 `too_many_attempts` `{ retryAfterSeconds }` | `login.pinTooMany` with minutes rounded up |
| 403 `pin_reset_required` | `login.pinLocked` |
| 403 `account_suspended` / `person_not_active` | `login.suspended` |
| 404 (flag off) / 503 `pin_not_configured` | `login.pinUnavailable`, and hide the method |
| network/5xx | `login.error` |

Errors render in the existing `Alert tone="error"` at the top of the card, which has `role="alert"` (screen readers announce). Focus moves to the PIN field after a wrong PIN; the PIN is cleared, the identifier kept.

### 1.4 Google / email path
`api.portalSession` tries, in order, `admin`, `gym_operator`, `gym_staff` (existing), then **`vendor` and `vendor_staff` with `existingOnly: true`** (new), then the B2B organisation check. Only "no such profile" moves on; `account_suspended` on a `vendor_staff` attempt shows `login.vendorStaffDisabled` instead of the generic suspended text. A vendor never gets a new account from the portal.

`handleSuccess` routing gains: `vendor`/`vendor_staff` → `/vendor/`.

### 1.5 Legacy staff passwords
Vendor staff created before Identity V2 have a scrypt password and sign in through `/auth/login` (`requestedRole: 'vendor'` falls back to `vendor_staff`). The email form's existing Firebase path does not reach them. See Q-1; until answered, the email step does **not** call `/auth/login` for vendors.

---

## 2. Vendor shell

### 2.1 Desktop (≥1024px, `lg`): existing dark sidebar (256px)
- Header: brand logo, line 1 **business name** from `/vendor/me.businessName` (truncate, full name in `title`), line 2 `vendor.shell.subtitle` ("Business portal"). Fallback when businessName is null: `vendor.shell.unnamed`.
- Nav (`vendorNav`, ungrouped, in this order; each filtered by §0.2):
  | Item | Icon (lucide) | Key |
  |---|---|---|
  | Dashboard `/vendor/` | `LayoutDashboard` | `vendor.nav.dashboard` |
  | Products `/vendor/products/` | `ShoppingBag` | `vendor.nav.products` |
  | Orders `/vendor/orders/` | `ClipboardList` | `vendor.nav.orders` |
  | Payouts `/vendor/payouts/` | `HandCoins` | `vendor.nav.payouts` |
  Products shows a count pill of low-stock items (when `stockLedger` and >0; "99+" cap; `aria-label` `vendor.nav.productsLow`). Orders shows a count of orders waiting to be accepted (own status `pending`, paid) (`vendor.nav.ordersWaiting`).
  `/vendor` is added to `ROOTS` so Dashboard is active only on itself.
- Footer (existing): language select (EN/Kiswahili), role switcher (when another portal persona exists; labels `nav.personaVendor` / `nav.personaVendorStaff`), user row (name, role line `vendor.role.owner` / `vendor.role.staff`), sign out.
- For staff with `staff` permission: a footer text link `vendor.shell.staffInApp` ("Manage staff in the FitFlex app"). No web staff screen in S2.

### 2.2 Below 1024px (incl. 375px)
Existing top bar (menu button, logo, `LanguageToggle`) with the badge text replaced by the i18n role (`vendor.role.owner|staff`). The drawer is the same sidebar. Drawer focus/Escape behaviour is unchanged.

### 2.3 Routing guards (`Shell` effect)
- `vendor`/`vendor_staff` on any path outside `/vendor` → `/vendor/`.
- Anyone else on `/vendor/*` → their own home (admin `/admin`, HR `/hr`, org `/org…`, operator `/dashboard`).
- Vendor on a `/vendor/*` page without its permission → first allowed nav item, toast `vendor.noAccess`.

### 2.4 Whole-area states

| State | What shows |
|---|---|
| Restoring session / `/vendor/me` loading | Existing `shell-restoring-session` header, then `SkeletonCard` ×3 in the main area (`aria-busy="true"`) |
| Portal not open (§0.1) | Centred card, no nav: title `vendor.portalOff.title`, body `vendor.portalOff.body`, button **Sign out**. `data-testid="vendor-portal-off"` |
| `/vendor/me` 403 `vendor_staff_inactive` | Centred card: `vendor.staffDisabled.title` / `.body`, **Sign out**. `data-testid="vendor-staff-disabled"` |
| Vendor `approvalStatus: 'pending_approval'` | Shell opens. A persistent `Alert tone="info"` above every page: `vendor.pending.banner`. Products and Orders work as in the app (pending vendors can add products, mobile#83) |
| Account suspended (vendor) | `Alert tone="error"` `vendor.suspended.banner` on every page; status-move buttons disabled (server refuses anyway) |
| 401 anywhere | Existing global sign-out to `/login` |

### 2.5 Per-request errors inside the area
- 403 `vendor_staff_inactive` on any call → replace the area with the Staff disabled card (§2.4).
- 403 `acl_forbidden`/`forbidden`/`not_your_*` → toast `vendor.noAccess`, refresh `/vendor/me`, re-filter nav.
- 404 `feature_disabled` on a stock call → hide stock UI and refresh `/vendor/me`.

---

## 3. Dashboard (`/vendor/`)

Purpose: what needs doing today. Desktop: 4-column `MetricCard` row, then two cards side by side (Orders to act on | Low stock). 375px: one column, same order.

| Card | Source | Shown when | Content |
|---|---|---|---|
| Sales delivered today | `/vendor/payments.todaySalesTzs` | `payments` | TZS; sub `vendor.dash.salesHint` |
| Open orders | `/vendor/orders` (count own status not `delivered`/`cancelled`, `paymentStatus: 'paid'`) | `orders` | count; link to `/vendor/orders/?status=open` |
| Low stock | `/vendor/stock/low` length | `products` + `stockLedger` | count; link to `/vendor/products/?filter=low` |
| Waiting for payout | `/vendor/payments.pendingSettlementTzs` + `/vendor/statements.payoutReady` | `payments` | TZS; when `payoutReady === false`, `Badge warning` `vendor.dash.payoutBlocked` + reason text (§9.6) |

Below the metrics:
- **Orders to act on** (`orders`): up to 5 paid orders with own status `pending` or `accepted`…`ready_for_pickup`, oldest first: reference, placed time, own items count, status `Badge`. Row → order detail. Empty: `vendor.dash.noOpenOrders`.
- **Low stock** (`products` + `stockLedger`): up to 5 rows from `/vendor/stock/low`: name (+ variant), stock / reorder level. Row → stock history. Empty: `vendor.stock.lowEmpty`.
- Staff with none of `orders`, `products`, `payments`: `EmptyState` `vendor.dash.nothingForYou`.

States: each card loads independently (`Skeleton` inside the card); a failed card shows `vendor.dash.cardFailed` with a **Try again** button inside that card only; others keep working.

---

## 4. Products (`/vendor/products/`, needs `products`)

### 4.1 List
Header: `PageHeader` title `vendor.nav.products`, description `vendor.products.description`, action **Refresh**. Adding/editing products stays in the app in S2 (`vendor.products.editInApp` hint under the header). See Q-6.

Filters row: search `Input` (name, `aria-label` `vendor.products.search`), status `Select` (All / Active / Paused / Archived / Waiting for approval / Rejected), and when `stockLedger`: `Segmented` **All products | Low stock (n)** (S1 strings `vendor.stock.all`, `vendor.stock.lowFilter`). Filters are client-side over `GET /vendor/products` and mirrored in the URL (`?filter=low&q=&status=`).

Desktop table (`aria-label` `vendor.nav.products`), columns:
1. Product (image 40px with `alt=""`, name, category; variants count `vendor.products.variantsCount`)
2. Price (TZS; discount shown as new price with old struck through, `aria-label` "was X, now Y")
3. Stock (number; `Badge warning` `vendor.stock.lowBadge` when low; for variants "n across m options" `vendor.products.stockAcross`)
4. Reorder level (only when `stockLedger`; `—` when null)
5. Cost price (only when `tools.canSeeCost` **and** at least one row has the key `costTzs`; `—` when null)
6. Status (`Badge`: active success, paused gray, archived gray, approval pending warning `vendor.products.pendingApproval`, rejected error)
7. Actions: **Adjust stock** (secondary sm, `stockLedger` only) and **History** (ghost sm, `stockLedger` only). `aria-label` includes the product name (`vendor.stock.adjustFor`, `vendor.stock.historyFor`).

Row expand (chevron button, `aria-expanded`) for products with variants: sub-rows per option: name, stock, reorder level, cost (same visibility rule), low badge, Adjust (preselects that option).

375px: card list instead of the table: name + status line, price, stock with low badge, cost/reorder line (when shown), buttons full width side by side (each ≥44px tall).

States:
| State | Content |
|---|---|
| Loading | `SkeletonTable rows=6` (desktop) / `SkeletonCard`×4 |
| Empty (no products) | `EmptyState` `vendor.products.empty` + body `vendor.products.emptyBody` (add in app) |
| Empty after filter | `EmptyState` `vendor.products.noMatch` + **Clear filters** |
| Low filter empty | S1 `vendor.stock.lowEmpty` + **Show all** |
| Error | `ErrorState` `vendor.products.failed` + **Try again** |
| Forbidden | guard (§2.3) |

### 4.2 Adjust stock dialog (`Dialog`, max width 560px; full screen-width sheet at 375px)
Same behaviour, order, validation, request and error handling as S1 §2 (reason order Counted, Restocked, Returned, Found, Damaged, Expired, Lost, Other; Counted sends `expectedStock`; `clientRef` reused on retry and renewed after a 409 `stock_changed`; note ≤200, required for Other). Web differences:
- Reasons are a `Radio` group in a `fieldset` with `legend` `vendor.stock.reasonLabel` (arrow keys move, one tab stop). Other's Add/Remove is a second radio group.
- Option picker is a `Select` (`vendor.stock.variantLabel`) listing `name · {stock}`; required when the product has options.
- Difference / Stock after preview is `aria-live="polite"`.
- Focus: opens on the option picker (or the first reason); Escape and Cancel close and return focus to the row's Adjust button; after success focus returns to that button and a toast `vendor.stock.updated` shows; the row updates from the response `product` without reloading the list.
- Error rows from S1 §2.3 apply as-is (409 `stock_changed` alert at the top, counted field cleared and focused; 409 `insufficient_stock`; 400 note/quantity; 403/404 close + toast; network keeps the dialog open with **Try again**). Also handle 400 `variant_required { variants }` (reload options, inline `vendor.stock.pickVariant`), 409 `client_ref_reused` (new clientRef, generic `vendor.saveFailed`).

### 4.3 Stock history (`/vendor/products/history/?id=&variant=`)
Same content as S1 §3: header (name, current stock, reorder level, low badge, **Adjust stock**), range `Segmented` (Last 7 days / Last 30 days default / Choose dates with two `type="date"` inputs, EAT), option `Select` when the product has options (sends `variant`), opening/closing `Stat`s, table (Time · Reason · Change · Before → after · By · Note), **Load more** button. 375px: rows become stacked cards. Order-linked rows link to `/vendor/orders/?id=<orderId>` when the user has `orders`, else plain text `vendor.stock.order`. Back link `vendor.products.back` → `/vendor/products/` keeping the previous query string. States as S1 §3.2 (loading, empty with Adjust action, error, not found, not allowed).

---

## 5. Orders (`/vendor/orders/`, needs `orders`)

### 5.1 List
Header: title `vendor.nav.orders`, **Refresh**. `Segmented` tabs: **Open** (default) | **Delivered** | **Cancelled** | **All** with counts. Open = own status not `delivered`/`cancelled`. Unpaid orders (`paymentStatus !== 'paid'`) appear only in All, labelled `vendor.orders.awaitingPayment`, with no actions. Search by reference.

Desktop table (`aria-label` `vendor.nav.orders`): Reference · Placed (EAT `19 Oct, 14:05`) · Buyer (display name) · Items (count + first item name) · Your total (own subtotal TZS) · Delivery (`vendor.orders.delivery.home` / `vendor.orders.delivery.pickup` + gym name) · Status (`Badge`, own fulfilment status, `shop.orderStatus.*`) · open chevron. Whole row is a link to `?id=` (keyboard: the reference cell is the `<a>`).
375px: cards: reference + status badge, buyer name, "3 items · TZS 45,000", delivery line, placed time.

States: loading `SkeletonTable`; empty per tab (`vendor.orders.emptyOpen`, `.emptyDelivered`, `.emptyCancelled`, `.emptyAll`); error `ErrorState` `vendor.orders.failed`.

### 5.2 Order detail (`?id=`; desktop: right-hand panel 480px over the list with a back link; 375px: full page)
Focus moves to the detail heading on open; **Back to orders** returns focus to the row.

Sections, top to bottom (only fields from §3 of the plan; nothing else is rendered even if present):
1. **Header**: `vendor.orders.ref` `{reference}`, placed time, own status `Badge`, combined status line `vendor.orders.overall` `{orderStatus}` only when it differs from own.
2. **Next step** (paid, not cancelled, `nextStatuses` not empty): one primary button per entry of `nextStatuses`, using `vendor.markStatus.*` labels (mobile strings), first = primary, others secondary. Clicking opens a small `Dialog` with optional **Reason** (`Textarea`, ≤200, `vendor.orders.reasonOptional`) and **Confirm**. **Cancel my part** (danger, ghost) is shown while own status is not terminal; it opens `ConfirmDialog` `vendor.orders.cancelTitle` / `vendor.orders.cancelBody` (restock + refund for a paid order) with required reason.
   - `POST /vendor/orders/:id/status { status, reason? }`. Success: toast `vendor.orders.moved` (new status), detail and list update from the response. 409 `invalid_transition { allowed }`: `Alert` `vendor.orders.movedElsewhere`, reload the order, buttons from `allowed`. 403 `vendor_suspended`/`forbidden`: toast `vendor.noAccess`. Network: dialog stays open, **Try again**.
   - Unpaid: `Alert info` `vendor.orders.awaitingPaymentHint`, no buttons.
3. **Your items** (table / list): image, name, option (`vendor.orders.option` when `variant`), qty, unit price, line total. Footer: own subtotal; when present, FitFlex commission (`commissionTzs` sum, `vendor.orders.commission`) and you receive (`vendorPayoutTzs` sum, `vendor.orders.youReceive`). Shown to everyone with `orders` (see Q-5).
4. **Payment**: `paymentStatus` (`vendor.orders.payment.paid|pending|refunded|failed`), method (`vendor.orders.method.*`: M-Pesa, Airtel Money, Mixx by Yas, Card, Bank).
5. **Buyer and delivery**
   - Buyer: `buyer.displayName` (fallback `vendor.orders.buyerUnnamed`).
   - Delivery method. Pickup: `pickupGym.name` (fallback `vendor.orders.pickupGymUnknown`; never the raw id).
   - Phone and address (only when the server sends them: `tools.buyerContact` on and inside the O-3 window): phone as `tel:` link button **Call {phone}** (≥44px, `aria-label` `vendor.orders.callBuyer`), address as text with a **Copy** button (`vendor.orders.copyAddress`, toast on copy). Under them a muted line `vendor.orders.contactUntil` `{date}` when `buyer.contactVisibleUntil` is present.
   - Window closed (flag on, fields absent, own status delivered/cancelled): muted line `vendor.orders.contactHidden`. Flag off: nothing (no explanation line).
   - Buyer note (`note`): quoted block `vendor.orders.buyerNote`, plain text, preserved line breaks.
6. **Timeline**: own timeline entries, newest last: status label, time (EAT), reason if any. Actor names are not shown.

Never rendered: buyer id/role/email, payment reference, other vendors' lines or totals, raw `pickupGymId`, internal fields. If the old response shape is still served (old backend), the portal still renders only the allowlisted keys.

Detail states: loading (`SkeletonCard`), not found / not yours (`ErrorState` `vendor.orders.notFound` + Back), error (`ErrorState` + **Try again**).

---

## 6. Payouts (`/vendor/payouts/`, needs `payments`)

`<PartnerPayouts kind="vendor" audience="partner" />` reading `GET /vendor/statements` and `GET /vendor/statements/:id`.
- Top: when `payoutReady === false`, `Alert warning` `vendor.payouts.blocked` + reason from `payoutBlockedBy` (reuses `whyNot` strings, now i18n: §9.6) and a line `vendor.payouts.fixInApp` (payout account is set in the app's Verification centre).
- Table: Week (Mon–Sun, EAT) · Orders · Sales · Commission · To pay you · Status (`submitted` → `vendor.payouts.status.inReview`, `approved`, `payable` → `vendor.payouts.status.due`, `paid`) · On hold badge when `onHold`.
- Detail: header figures, paid date + reference + `paidTo` (method, provider, ****last4) when paid, hold explanation `vendor.payouts.onHoldHint`, delivered orders table (reference, delivered date, sales, commission, you receive). Order reference links to the order detail when the user has `orders`.
- No Prepare, approve, hold, void or pay buttons in partner mode.
- States: loading, empty `vendor.payouts.empty` + hint `vendor.payouts.emptyHint`, error, statement not found (404 `statement_not_found`).

---

## 7. Admin: product cost and reorder (`/admin/products`, scope `shop`)

On each product card (existing grid), when the row has the key `costTzs` or `reorderLevel` (i.e. `GET /admin/products` sends private fields: ledger on):
- Read line under the name: `products.stock` n · `vendor.stock.reorderLevel` n|— · `vendor.costPrice` TZS|— · low `Badge` when stock ≤ reorder level.
- Two inputs added to the card's edit row: **Cost price (TZS)** and **Reorder level** (`type="number"`, min 0, integer; empty = clear → sends `null`), each with `aria-label` "{label}: {product name}". Saved with the existing **Save listing** in the same `PUT /admin/products/:id/listing` call.
- Products with options: a **Options** disclosure (`aria-expanded`) lists each option with its own cost and reorder inputs, sent as `variants: [{ name, costTzs, reorderLevel }]`.
- Errors: 400 `invalid_field { field }` → inline on that field `products.invalidNumber`; 400 `duplicate_variant` / 404 `variant_not_found` → `Alert error` `products.variantChanged` and reload.
- Also replace the raw `{product.vendorId}` in the meta line with the vendor's business name from the already-loaded `adminVendors` list (fallback the id).
- When the keys are absent (ledger off): page exactly as today.

---

## 8. Responsive and accessibility

- Desktop first (1280 reference; sidebar 256 + content max width 1200). Usable at 375: no horizontal page scroll; tables switch to card lists below `md` (768); dialogs become full-width bottom-anchored panels with 16px padding.
- Touch targets ≥44×44px on every button, link-button, chevron, pill and radio label (`size="sm"` buttons get `min-h-11` on small screens).
- Contrast ≥4.5:1 text, ≥3:1 for badge borders/icons, light theme on the Calm `#F7F5F0` canvas; brand green `#1F7A3A`; Volt never on light grounds; Fuel only for "act soon" (orders waiting to be accepted count pill may use Fuel; low stock uses warning/amber).
- Every icon-only control has an `aria-label`; icons `aria-hidden`. Tables have `aria-label` and `Th scope="col"`. Status badges include text (never colour only). Money read as "TZS 45,000".
- Focus order per page: skip-to-content → page heading → page actions → filters → table/list → pagination. Dialogs trap focus and return it to the opener. Toasts are `role="status"`; blocking errors `role="alert"`.
- Language switch changes all vendor-area text immediately, including dates (`en-GB` / `sw-TZ` month names) and status badges; persisted (existing locale storage).
- Swahili runs 20–30% longer: nav labels truncate with `title` in the sidebar (256px fits "Malipo yako"); table headers wrap to two lines; buttons wrap, never clip; MetricCard labels wrap to two lines.

---

## 9. Strings (EN + SW)

All SW are **drafts for native review** (plan §4). "Stock" stays English. Variant = chaguo / machaguo. Keys go in `src/lib/i18n.ts` under `vendor.*`, `login.*`, `nav.*`, `products.*`. Strings already in the S1 spec (`vendor.stock.*`, `vendor.costPrice`, reasons) are reused with the same text; mobile `shop.orderStatus.*` and `vendor.markStatus.*` are copied with the same text. Placeholders `{n}`, `{name}`, `{date}`, `{minutes}`, `{ref}`, `{status}`, `{phone}`, `{amount}`.

### 9.1 Sign-in
| Key | EN | SW (draft) |
|---|---|---|
| login.heading | Sign in to FitFlex for partners | Ingia FitFlex kwa washirika |
| login.assignedAccount | For gyms, businesses, FitFlex staff and organisations. Use the account you already have. | Kwa gym, biashara, wafanyakazi wa FitFlex na mashirika. Tumia akaunti uliyonayo tayari. |
| login.adminRequired | This account has no portal access. The portal is for gym owners and staff, businesses that sell on FitFlex and their staff, FitFlex admins and organisations. | Akaunti hii haina ruhusa ya kuingia kwenye portal. Portal ni ya wamiliki na wafanyakazi wa gym, biashara zinazouza FitFlex na wafanyakazi wao, wasimamizi wa FitFlex na mashirika. |
| login.pinMethod | Business sign-in (number + PIN) | Kuingia kwa biashara (namba + PIN) |
| login.pinHeading | Sign in with your number and PIN | Ingia kwa namba yako na PIN |
| login.pinHint | Use the mobile number or email and the 4-digit PIN you use in the FitFlex app. | Tumia namba ya simu au barua pepe na PIN ya tarakimu 4 unayotumia kwenye programu ya FitFlex. |
| login.identifier | Mobile number or email | Namba ya simu au barua pepe |
| login.pin | PIN | PIN |
| login.pinFormat | Your PIN is 4 digits. | PIN yako ina tarakimu 4. |
| login.pinWrong | That number or PIN is not right. Try again. | Namba au PIN si sahihi. Jaribu tena. |
| login.pinTooMany | Too many tries. Try again in {minutes} min. | Umejaribu mara nyingi mno. Jaribu tena baada ya dakika {minutes}. |
| login.pinLocked | Your PIN is locked. Reset it in the FitFlex app. | PIN yako imefungwa. Iweke upya kwenye programu ya FitFlex. |
| login.pinForgot | Forgot your PIN? Reset it in the FitFlex app. | Umesahau PIN? Iweke upya kwenye programu ya FitFlex. |
| login.pinSetupInApp | Finish setting up your PIN in the FitFlex app, then sign in here. | Maliza kuweka PIN yako kwenye programu ya FitFlex, kisha uingie hapa. |
| login.pinNoBusiness | This account is not linked to a business yet. Accept your invitation in the FitFlex app first. | Akaunti hii bado haijaunganishwa na biashara. Kubali mwaliko wako kwenye programu ya FitFlex kwanza. |
| login.pinUnavailable | Sign-in with a PIN is not available right now. Use Google or email. | Kuingia kwa PIN hakupatikani kwa sasa. Tumia Google au barua pepe. |
| login.vendorStaffDisabled | Your staff access has been turned off. Ask the business owner. | Ruhusa yako ya mfanyakazi imezimwa. Wasiliana na mmiliki wa biashara. |

### 9.2 Shell and area states
| Key | EN | SW (draft) |
|---|---|---|
| vendor.shell.subtitle | Business portal | Portal ya biashara |
| vendor.shell.unnamed | Your business | Biashara yako |
| vendor.shell.staffInApp | Manage staff in the FitFlex app | Simamia wafanyakazi kwenye programu ya FitFlex |
| vendor.role.owner | Business owner | Mmiliki wa biashara |
| vendor.role.staff | Staff | Mfanyakazi |
| nav.personaVendor | Business | Biashara |
| nav.personaVendorStaff | Business staff | Mfanyakazi wa biashara |
| vendor.nav.dashboard | Dashboard | Muhtasari |
| vendor.nav.products | Products | Bidhaa |
| vendor.nav.orders | Orders | Oda |
| vendor.nav.payouts | Payouts | Malipo yako |
| vendor.nav.productsLow | Products, {n} low on stock | Bidhaa, {n} zina Stock chache |
| vendor.nav.ordersWaiting | Orders, {n} waiting to be accepted | Oda, {n} zinasubiri kukubaliwa |
| vendor.portalOff.title | The business portal is not open yet | Portal ya biashara bado haijafunguliwa |
| vendor.portalOff.body | Keep using the FitFlex app to run your shop. We'll let you know when the web portal opens. | Endelea kutumia programu ya FitFlex kuendesha duka lako. Tutakujulisha portal ya mtandaoni itakapofunguliwa. |
| vendor.staffDisabled.title | Your access has been turned off | Ruhusa yako imezimwa |
| vendor.staffDisabled.body | The business owner has turned off your staff account. Ask them if you think this is a mistake. | Mmiliki wa biashara amezima akaunti yako ya mfanyakazi. Muulize kama unadhani ni kosa. |
| vendor.pending.banner | Your business is waiting for FitFlex approval. You can add products; members see them after approval. | Biashara yako inasubiri idhini ya FitFlex. Unaweza kuongeza bidhaa; wanachama wataziona baada ya idhini. |
| vendor.suspended.banner | Your business account is suspended. Your products are not on sale. Contact FitFlex. | Akaunti ya biashara yako imesimamishwa. Bidhaa zako haziuzwi. Wasiliana na FitFlex. |
| vendor.noAccess | You don't have access to that. | Huna ruhusa ya kuona hilo. |
| vendor.saveFailed | Could not save. Try again. | Imeshindikana kuhifadhi. Jaribu tena. |
| common.signOut | Sign out | Toka |

### 9.3 Dashboard
| Key | EN | SW (draft) |
|---|---|---|
| vendor.dash.salesToday | Sales delivered today | Mauzo yaliyofikishwa leo |
| vendor.dash.salesHint | App orders delivered today | Oda za programu zilizofikishwa leo |
| vendor.dash.openOrders | Open orders | Oda zinazoendelea |
| vendor.dash.lowStock | Low stock | Stock chache |
| vendor.dash.waitingPayout | Waiting for payout | Inasubiri kulipwa |
| vendor.dash.payoutBlocked | Payout on hold | Malipo yamesitishwa |
| vendor.dash.toAct | Orders to act on | Oda za kushughulikia |
| vendor.dash.noOpenOrders | No orders need you right now. | Hakuna oda inayokuhitaji kwa sasa. |
| vendor.dash.viewAll | View all | Ona zote |
| vendor.dash.nothingForYou | Nothing here for your role yet. Ask the business owner for access. | Hakuna kitu hapa kwa nafasi yako bado. Muombe mmiliki wa biashara ruhusa. |
| vendor.dash.cardFailed | Could not load this. | Imeshindikana kupakia hiki. |

### 9.4 Products (new; plus S1 keys)
| Key | EN | SW (draft) |
|---|---|---|
| vendor.products.description | Your products, stock and stock changes. | Bidhaa zako, Stock na mabadiliko ya Stock. |
| vendor.products.editInApp | To add or edit a product, use the FitFlex app. | Kuongeza au kuhariri bidhaa, tumia programu ya FitFlex. |
| vendor.products.search | Search products | Tafuta bidhaa |
| vendor.products.status.all | All statuses | Hali zote |
| vendor.products.status.active | Active | Inauzwa |
| vendor.products.status.paused | Paused | Imesimamishwa |
| vendor.products.status.archived | Archived | Imehifadhiwa kando |
| vendor.products.pendingApproval | Waiting for approval | Inasubiri idhini |
| vendor.products.rejected | Not approved | Haijaidhinishwa |
| vendor.products.colProduct | Product | Bidhaa |
| vendor.products.colPrice | Price | Bei |
| vendor.products.colStock | Stock | Stock |
| vendor.products.colStatus | Status | Hali |
| vendor.products.colActions | Actions | Vitendo |
| vendor.products.variantsCount | {n} options | Machaguo {n} |
| vendor.products.stockAcross | {n} across {m} options | {n} kwa machaguo {m} |
| vendor.products.showOptions | Show options for {name} | Onyesha machaguo ya {name} |
| vendor.products.empty | No products yet | Bado hakuna bidhaa |
| vendor.products.emptyBody | Add your first product in the FitFlex app. | Ongeza bidhaa yako ya kwanza kwenye programu ya FitFlex. |
| vendor.products.noMatch | No products match these filters. | Hakuna bidhaa zinazolingana na vichujio hivi. |
| vendor.products.clearFilters | Clear filters | Futa vichujio |
| vendor.products.failed | Could not load your products. | Imeshindikana kupakia bidhaa zako. |
| vendor.products.back | Back to products | Rudi kwenye bidhaa |
| vendor.stock.adjustFor | Adjust stock for {name} | Rekebisha Stock ya {name} |
| vendor.stock.historyFor | Stock history for {name} | Historia ya Stock ya {name} |
| vendor.stock.historyShort | History | Historia |
| vendor.stock.variantLabel | Option | Chaguo |
| vendor.stock.pickVariant | Choose an option | Chagua chaguo |
| vendor.stock.totalFromVariants | Total from all options | Jumla ya machaguo yote |

(`vendor.stock.variantLabel`, `pickVariant`, `totalFromVariants` supersede the S1 "aina" drafts with chaguo/machaguo; EN also changes "Variant" → "Option" on the web to match. See Q-7.)

### 9.5 Orders
| Key | EN | SW (draft) |
|---|---|---|
| vendor.orders.tab.open | Open ({n}) | Zinazoendelea ({n}) |
| vendor.orders.tab.delivered | Delivered ({n}) | Zimefikishwa ({n}) |
| vendor.orders.tab.cancelled | Cancelled ({n}) | Zimeghairiwa ({n}) |
| vendor.orders.tab.all | All ({n}) | Zote ({n}) |
| vendor.orders.search | Search by order number | Tafuta kwa namba ya oda |
| vendor.orders.colRef | Order | Oda |
| vendor.orders.colPlaced | Placed | Imewekwa |
| vendor.orders.colBuyer | Buyer | Mnunuzi |
| vendor.orders.colItems | Items | Bidhaa |
| vendor.orders.colTotal | Your total | Jumla yako |
| vendor.orders.colDelivery | Delivery | Ufikishaji |
| vendor.orders.itemsCount | {n} items | Bidhaa {n} |
| vendor.orders.ref | Order {ref} | Oda {ref} |
| vendor.orders.overall | Whole order: {status} | Oda nzima: {status} |
| vendor.orders.delivery.home | Home delivery | Kufikishwa nyumbani |
| vendor.orders.delivery.pickup | Pickup at {gym} | Kuchukua {gym} |
| vendor.orders.pickupGymUnknown | Pickup at a gym | Kuchukua kwenye gym |
| vendor.orders.awaitingPayment | Waiting for payment | Inasubiri malipo |
| vendor.orders.awaitingPaymentHint | You can start once FitFlex confirms the payment. | Utaanza FitFlex ikishathibitisha malipo. |
| vendor.orders.nextStep | Next step | Hatua inayofuata |
| vendor.orders.reasonOptional | Reason (optional) | Sababu (si lazima) |
| vendor.orders.reasonRequired | Reason (required) | Sababu (lazima) |
| vendor.orders.confirm | Confirm | Thibitisha |
| vendor.orders.cancelMine | Cancel my part | Ghairi sehemu yangu |
| vendor.orders.cancelTitle | Cancel your part of this order? | Ughairi sehemu yako ya oda hii? |
| vendor.orders.cancelBody | Your items go back into stock. If the buyer has paid, FitFlex refunds them for your items. This can't be undone. | Bidhaa zako zitarudi kwenye Stock. Kama mnunuzi amelipa, FitFlex itamrudishia pesa ya bidhaa zako. Hili haliwezi kutenduliwa. |
| vendor.orders.moved | Order is now: {status} | Oda sasa iko: {status} |
| vendor.orders.movedElsewhere | This order changed in the meantime. Here is where it stands now. | Oda hii imebadilika wakati huo huo. Hapa ndipo ilipo sasa. |
| vendor.orders.yourItems | Your items | Bidhaa zako |
| vendor.orders.option | Option: {name} | Chaguo: {name} |
| vendor.orders.qty | Qty | Idadi |
| vendor.orders.unitPrice | Price each | Bei ya moja |
| vendor.orders.subtotal | Your subtotal | Jumla ndogo yako |
| vendor.orders.commission | FitFlex commission | Kamisheni ya FitFlex |
| vendor.orders.youReceive | You receive | Utapokea |
| vendor.orders.payment | Payment | Malipo |
| vendor.orders.payment.paid | Paid | Imelipwa |
| vendor.orders.payment.pending | Not paid yet | Bado haijalipwa |
| vendor.orders.payment.refunded | Refunded | Imerudishiwa pesa |
| vendor.orders.payment.failed | Payment failed | Malipo yameshindikana |
| vendor.orders.method.mpesa / airtel_money / mixx / card / bank | M-Pesa / Airtel Money / Mixx by Yas / Card / Bank transfer | M-Pesa / Airtel Money / Mixx by Yas / Kadi / Uhamisho wa benki |
| vendor.orders.buyerDelivery | Buyer and delivery | Mnunuzi na ufikishaji |
| vendor.orders.buyerUnnamed | FitFlex member | Mwanachama wa FitFlex |
| vendor.orders.callBuyer | Call the buyer on {phone} | Mpigie mnunuzi kwa {phone} |
| vendor.orders.address | Delivery address | Anwani ya kufikisha |
| vendor.orders.copyAddress | Copy address | Nakili anwani |
| vendor.orders.copied | Address copied | Anwani imenakiliwa |
| vendor.orders.contactUntil | You can see the phone and address until {date}. | Unaweza kuona simu na anwani hadi {date}. |
| vendor.orders.contactHidden | The buyer's phone and address are hidden 7 days after delivery. | Simu na anwani ya mnunuzi hufichwa siku 7 baada ya kufikishwa. |
| vendor.orders.buyerNote | Note from the buyer | Ujumbe kutoka kwa mnunuzi |
| vendor.orders.timeline | History | Historia |
| vendor.orders.back | Back to orders | Rudi kwenye oda |
| vendor.orders.emptyOpen | No open orders. | Hakuna oda zinazoendelea. |
| vendor.orders.emptyDelivered | No delivered orders yet. | Bado hakuna oda zilizofikishwa. |
| vendor.orders.emptyCancelled | No cancelled orders. | Hakuna oda zilizoghairiwa. |
| vendor.orders.emptyAll | No orders yet. | Bado hakuna oda. |
| vendor.orders.failed | Could not load your orders. | Imeshindikana kupakia oda zako. |
| vendor.orders.notFound | This order is not available. | Oda hii haipatikani. |
| shop.orderStatus.*, vendor.markStatus.* | copy from mobile `lib/shared/i18n.dart` (same EN and SW) | |

### 9.6 Payouts (partner mode; also moves admin `KIND`/`ERRORS` English into i18n)
| Key | EN | SW (draft) |
|---|---|---|
| vendor.payouts.title | Payouts | Malipo yako |
| vendor.payouts.description | What FitFlex pays you each week for delivered orders, after commission. | Kiasi FitFlex inachokulipa kila wiki kwa oda zilizofikishwa, baada ya kamisheni. |
| vendor.payouts.week | Week | Wiki |
| vendor.payouts.orders | Orders | Oda |
| vendor.payouts.sales | Sales | Mauzo |
| vendor.payouts.commission | Commission | Kamisheni |
| vendor.payouts.toPay | To pay you | Utakacholipwa |
| vendor.payouts.status.inReview | In review | Inakaguliwa |
| vendor.payouts.status.approved | Approved | Imeidhinishwa |
| vendor.payouts.status.due | Payment due | Inasubiri malipo |
| vendor.payouts.status.paid | Paid | Imelipwa |
| vendor.payouts.onHold | On hold | Imesitishwa |
| vendor.payouts.onHoldHint | FitFlex is checking something on this statement. We'll contact you if we need anything. | FitFlex inakagua jambo kwenye taarifa hii. Tutawasiliana nawe tukihitaji chochote. |
| vendor.payouts.paidOn | Paid on {date} | Ililipwa tarehe {date} |
| vendor.payouts.reference | Payment reference | Kumbukumbu ya malipo |
| vendor.payouts.paidTo | Paid to | Imelipwa kwa |
| vendor.payouts.blocked | We can't pay you yet: {reason}. | Bado hatuwezi kukulipa: {reason}. |
| vendor.payouts.fixInApp | Fix this in the Verification centre in the FitFlex app. | Rekebisha hili kwenye Kituo cha uthibitisho katika programu ya FitFlex. |
| payout.why.kyc_not_started | you have not started verification | hujaanza uthibitisho |
| payout.why.payout_account_not_verified | you have no verified payout account | huna akaunti ya malipo iliyothibitishwa |
| payout.why.payout_account_cooling_off | your payout account was changed recently and is still in its waiting period | akaunti yako ya malipo ilibadilishwa hivi karibuni na bado iko kwenye muda wa kusubiri |
| payout.why.kyc_other | your verification is not approved | uthibitisho wako haujaidhinishwa |
| payout.why.other | your account does not pass the payout check yet | akaunti yako bado haijapita ukaguzi wa malipo |
| vendor.payouts.empty | No payout statements yet | Bado hakuna taarifa za malipo |
| vendor.payouts.emptyHint | Your first statement appears after a week with delivered orders. | Taarifa yako ya kwanza itaonekana baada ya wiki yenye oda zilizofikishwa. |
| vendor.payouts.failed | Could not load your payouts. | Imeshindikana kupakia malipo yako. |
| vendor.payouts.back | All payouts | Malipo yote |

### 9.7 Admin products
| Key | EN | SW (draft) |
|---|---|---|
| products.costPrice | Cost price (TZS) | Bei ya kununua (TZS) |
| products.reorderLevel | Reorder level | Kiwango cha kuagiza tena |
| products.options | Options | Machaguo |
| products.invalidNumber | Enter a whole number, 0 or more, or leave empty. | Weka namba kamili, 0 au zaidi, au acha wazi. |
| products.variantChanged | The product's options changed. The list has been reloaded. | Machaguo ya bidhaa yamebadilika. Orodha imepakiwa upya. |

---

## 10. Backend fields needed (for fitflex-planner / contract-checker)

| Endpoint | Fields the portal reads/sends | Status on RC 582d22c |
|---|---|---|
| `GET /auth/options` | `pinLogin` | exists |
| `POST /auth/pin/login` | req `{ phone | email, pin }`; res `{ token, user{ id, userType, displayName?, email? }, personas[{ id, userType, accountStatus, approvalStatus, portalOnly }], activePersonaId }` or `setupRequired` / `startPin` / `onboarding`; errors `invalid_credentials`, `too_many_attempts{retryAfterSeconds}`, `pin_reset_required`, `pin_not_configured`, 404 | exists; confirm `personas[]` includes suspended personas with `accountStatus` (Q-2) |
| `POST /auth/switch-persona` | `{ personaId }` → `{ token, user, personas }` for a vendor/vendor_staff persona | exists; confirm vendor personas are allowed |
| `POST /auth/firebase/session` | `requestedRole: 'vendor' | 'vendor_staff'`, `existingOnly: true`; refusals `profile_not_found`, `account_suspended` | confirm `existingOnly` honoured for both roles |
| `GET /vendor/me` | `{ vendorId, businessName|null, userType, vendorRole|null, permissions[], approvalStatus, accountStatus, tools{ portal, stockLedger, buyerContact, canSeeCost, … } }`; 404 `feature_disabled` when `VENDOR_PORTAL` off; 403 `vendor_staff_inactive` | **new** (plan S2); `approvalStatus`/`accountStatus` are additions — confirm |
| `GET /vendor/products` | `id, name, category, images[0], priceTzs, discountPriceTzs, stock, status, approvalStatus, variants[{ name, stock, reorderLevel, costTzs?, effectiveReorderLevel, effectiveCostTzs? }], reorderLevel, costTzs?` | exists (S1) |
| S1 stock endpoints | as S1 spec §9 | exist |
| `GET /vendor/orders` | per order: `id`, `reference` (display number), `createdAt`, `status` (own), `orderStatus`, `nextStatuses[]`, `timeline[{ status, at, reason? }]`, `items[{ productId, name, variant, qty, priceTzs, image, commissionTzs, vendorPayoutTzs }]`, `totalTzs` (own), `paymentStatus`, `paymentMethod`, `deliveryMethod`, `note`, `pickupGym{ id, name }|null`, `buyer{ customerId, displayName, phone?, contactVisibleUntil? }`, `deliveryAddress?` | **shape change** (plan §3). `reference`, `buyer.contactVisibleUntil` are not in the plan — confirm or the portal falls back to a short id and drops the "until" line |
| `GET /vendor/orders?id=` or `/vendor/orders/:id` | single order, same shape | not in plan — Q-4 (else the portal filters the list) |
| `POST /vendor/orders/:id/status` | `{ status, reason? }` → order in the same allowlisted shape; 409 `invalid_transition{ allowed }` | exists; **response must also be allowlisted** (today it returns `result.order`) |
| `GET /vendor/payments` | `todaySalesTzs`, `pendingSettlementTzs` | exists; `todaySalesTzs` uses the UTC day — Q-3 |
| `GET /vendor/stock/low` | `[{ productId, name, variant, stock, reorderLevel }]` | exists |
| `GET /vendor/statements[/:id]` | `statements[{ id, periodStartDate, periodEndDate, status, onHold, orderCount, salesTzs, commissionTzs, netTzs, paidAt, paymentReference, paidTo{ method, provider, accountLast4 } }]`, `payoutReady`, `payoutBlockedBy`; detail `lines[{ orderId, orderReference?, deliveredAt, salesTzs, commissionTzs, netTzs }]` | exists; contract-checker to confirm exact money key names against `PartnerSettlement` in portal api.ts |
| `GET /admin/products` / `PUT /admin/products/:id/listing` | `costTzs`, `reorderLevel`, `variants[{ name, costTzs, reorderLevel }]` | exists (#192) |

---

## 11. Open questions — answered 2026-10-19 (lead, under the owner's accept-recommendations go-ahead)

- **Q-1:** PIN path only (plus Google/email for Firebase accounts); legacy staff move to PIN via the app.
- **Q-2:** Yes — sign-in returns 403 `vendor_staff_inactive` for disabled staff (auth change; call out in the PR).
- **Q-3:** "Today's sales" uses the EAT day and counts **paid** orders (not delivered).
- **Q-4:** Yes — add `GET /vendor/orders/:id` (same allowlist as the list).
- **Q-5:** No — per-order commission and "you receive" are shown only to staff with `payments` (and the vendor / vendor admin); the server omits them otherwise.
- **Q-6:** Confirmed — product create/edit on the web is out of S2 (app only).
- **Q-7:** English keeps **"Variant"** (matches the app); Swahili "chaguo / machaguo".
- **Q-8:** No human order number exists yet: both apps show the same short id (last 6 characters, uppercase). Add `buyer.contactVisibleUntil` (ISO, EAT) when contact is present.

Original questions:

- **Q-1** Legacy vendor staff with a scrypt password (`/auth/login`, `requestedRole: 'vendor'`): should the portal email form try `/auth/login` for them, or are all current staff on Identity V2 (invite + PIN) so the PIN path covers them? Recommendation: PIN path only; legacy staff sign in once in the app to move to a PIN.
- **Q-2** Disabled staff at sign-in: `sessionForPerson` drops suspended personas, so a disabled staff member with no other persona gets `onboarding` (looks like "no business"). Can `/auth/pin/login` and `/auth/firebase/session` return 403 `vendor_staff_inactive` in that case, so the portal shows the right message?
- **Q-3** "Sales delivered today" uses `todaySalesTzs` (delivered orders, UTC date). Should it be EAT and count paid orders by placed date instead? Label follows the answer.
- **Q-4** Order detail by id: add `GET /vendor/orders/:id` (allowlisted), or have the portal filter the list? Given F6 (full-table loads), a single-order route is better.
- **Q-5** Should staff without `payments` see per-order commission and "you receive"? Spec shows them to anyone with `orders` (they are on the order lines today in the app).
- **Q-6** Product create/edit on the web: out of S2 (app only). Confirm, or add a slice.
- **Q-7** EN "Variant" vs "Option" on the web: spec uses "Option" to match chaguo; the app still says "Variant". Pick one for both.
- **Q-8** Order display number: is there a short `reference` for orders, or do both apps show a shortened id (last 6)?

---

## 12. Acceptance criteria (UAT on portal from RC against an isolated backend with seed vendor, vendor staff, admin accounts)

Gating and sign-in
1. With `VENDOR_PORTAL` off, a vendor who signs in (any method) sees only the "business portal is not open yet" card and a Sign out button; no vendor nav; `/vendor/products/` typed in the address bar shows the same card.
2. With `/auth/options.pinLogin` false, the "Business sign-in" button is absent; with it true, it is present.
3. PIN form refuses a 3-digit PIN with "Your PIN is 4 digits." and sends no request (network tab).
4. Vendor signs in with number + PIN and lands on `/vendor/`. Same vendor via Google or email lands on `/vendor/`.
5. A person whose session opens as a member but who has a vendor persona lands on `/vendor/` after PIN sign-in, and the role switcher lists their other portal personas.
6. Wrong PIN shows "That number or PIN is not right", clears the PIN, keeps the number, focuses the PIN field. Five wrong tries show the "Too many tries… {minutes} min" message.
7. A disabled vendor staff member cannot get in and sees "Your staff access has been turned off" (or, pending Q-2, no vendor area at all; never a blank page).
8. A staff member disabled while signed in sees the "Your access has been turned off" card on their next action.
9. A vendor visiting `/dashboard/`, `/admin/` or `/hr/` is sent to `/vendor/`; an admin or gym owner visiting `/vendor/` is sent to their own home.

Shell
10. Sidebar shows the business name; nav items appear only for held permissions (staff with only `orders` see Dashboard and Orders).
11. Switching to Kiswahili changes nav, headers, badges, buttons and dates on every vendor page with no English left except "Stock", product names, option names, buyer names and notes.
12. A pending-approval vendor sees the approval banner on every page; a suspended vendor sees the suspended banner and disabled status buttons.

Dashboard
13. Cards show only for held permissions; Low stock card only with `stockLedger`. Each links to the filtered list. A card whose request fails shows its own Try again while the others still show.

Products
14. List shows stock, low badge, status; Low stock (n) filter shows only low items and the URL keeps `?filter=low`.
15. Cost column shows for the vendor account and admin-role staff when cost is set; it is absent (column and dialog fields) for staff without admin role, and the network response for them contains no `costTzs`.
16. Adjust stock behaves as S1 AC 10–19 (reason order, Counted difference, insufficient, Other needs note, 200-char counter, stale count alert and refocus, offline Try again with one history row). The row updates without a page reload; focus returns to the Adjust button.
17. Reasons are reachable as one radio group by keyboard (Tab in, arrows to move); Escape closes the dialog.
18. Stock history shows opening/closing, rows with reason, change, before → after, time (EAT), by, note; Load more appends; an order row opens that order for a user with `orders`.
19. With `stockLedger` off, no Adjust, History, reorder or low UI appears anywhere.

Orders and privacy
20. The order response (network tab) and the page contain no buyer id, buyer role, email, payment reference, other vendors' lines or totals, or a raw pickup gym id. A two-vendor seed order shows only this vendor's lines and subtotal.
21. Pickup orders show the gym's name.
22. With `VENDOR_ORDER_BUYER_CONTACT` on: a paid, open order shows the buyer's phone (tap-to-call link) and, for home delivery, the address with Copy; an order delivered 8+ days ago shows neither and shows the "hidden 7 days after delivery" line; an unpaid or cancelled order shows neither. With the flag off: no phone, no address, no explanation line.
23. Next-step buttons match `nextStatuses`; Accept moves the order and the badge updates; a move made meanwhile in another session shows "This order changed in the meantime" and the right buttons.
24. Cancel my part requires a reason and confirms; after it, the order is under Cancelled and its stock is back (visible in stock history as "Order cancelled, back in stock" with the ledger on).
25. Vendor staff without `orders` get no Orders nav; typing `/vendor/orders/` redirects with "You don't have access to that."
26. Vendor A cannot open vendor B's order id (not-found state).

Payouts
27. Statements list shows week, orders, sales, commission, to pay you, status; no Prepare/approve/void/pay buttons exist; paid statements show date, reference and ****last4.
28. With no verified payout account, the "We can't pay you yet: …" warning shows with the reason in the chosen language.

Admin
29. Admin (super-admin and portal staff with `shop`) sees cost and reorder level per product and per option on `/admin/products`, can change and clear them, and they persist after reload; with the ledger off the page is unchanged.
30. The admin product meta line shows the vendor's business name, not the raw id.

Responsive and accessibility
31. At 375px every vendor page has no horizontal page scroll; tables become cards; dialogs fit the screen; all buttons ≥44px tall.
32. In Swahili at 375px and at 200% browser zoom, no text is clipped or overlapping in nav, metric cards, tabs, table headers, buttons or dialogs.
33. Every control has an accessible name (axe or the browser accessibility tree): icon buttons, row actions (include the product name), call/copy buttons, nav count pills. Status is never shown by colour alone.
34. Text contrast ≥4.5:1 on the Calm canvas and in cards; badges ≥3:1 for their borders/icons; no Volt on light backgrounds.
35. Keyboard only: every page can be fully used; focus is visible; dialogs trap and return focus; opening an order moves focus to its heading and Back returns it to the row.

Not verifiable on web: none specific to S2 (portal is web-only). Real-phone check of the `tel:` link is advised.
