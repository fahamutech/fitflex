# Partner KYC/KYB & Settlement Verification: Architecture & Impact Report

**Scope:** gym owners, personal trainers, fitness vendors, corporate partners
**Status:** analysis only. No production code was changed.
**Inspected:** 26 Sep 2026
- `fitflex-functions`: `origin/main` plus the local `feat/communications-foundation` branch
- `fitflex-portal`: `origin/main`
- `fitflexmobile`: `origin/main`
- `canon/` and the requirement docs in the superproject

> **Checkout note.** The portal and mobile checkouts are on old feature branches (`feat/trainer-booking-payments` and `feat/social-sharing`). Everything below was read from `origin/main`. Other sessions share these checkouts, so the build should run in worktrees cut from `origin/main`.

---

## Update, 26 Sep 2026: decisions and progress since this report

**Decision: no field encryption for now.** ID, TIN, registration, account and document numbers are stored as plain, normalised text, and there is no `KYC_ENCRYPTION_KEY`. Only FitFlex admins and staff may see these numbers; the API phases must enforce that. Fully verified details will come from **NIDA, BRELA and TRA** integrations, which don't exist yet. Until then, reviewers record checks as manual.

This supersedes these parts of the report:
- the `*Enc`/`*Last4` columns in §11.2
- the encrypt-then-upload option in §11.3
- `pii-crypto.mjs` in §11.6 and §13
- the `kyc_pii` unmask scope in §11.6, §15 and §16
- items 3–4 of §17
- the encryption-key risks in §18

Documents still need **private, access-controlled** storage, but D1 now only decides where files are hosted, not how they are encrypted.

**Progress: Phase 1 (data model) is in review as [fahamutech/fitflex-functions#23](https://github.com/fahamutech/fitflex-functions/pull/23).** The target model was mapped onto the existing schema first, and only seven tables were added:

| Concept | Where it lives |
|---|---|
| Partner, PartnerProfile | **Existing:** `User` (gym owner, trainer or vendor) or `CorporateAccount`; `Gym`, `TrainerProfile`, `vendorProfile`. No Partner table. |
| KYC Case, BusinessProfile | `PartnerKycCase`: one per partner, carrying the legal-entity fields and the TIN |
| IndividualIdentity, BeneficialOwner, AuthorisedRepresentative | `PartnerPerson`, one table with a `role` column |
| Documents | `PartnerDocument` (metadata; the file lives in private storage) |
| Verification, settlement verification, operational verification | `PartnerCheck`. A registry lookup is `method: 'provider'`, and it must name `nida`, `brela` or `tra`. |
| Settlement Accounts | `PartnerSettlementAccount` (only a verified account can be primary) |
| Agreements | `PartnerAgreement` |
| Review History, Status History | `PartnerKycEvent` (append-only) |

These tables supersede the three-table sketch in §11.2 and §14.

The `GymPayout` generalisation described in §11.4 and §14 is **not** part of Phase 1. It belongs with the payout work (P5/P6).

---

## 0. Executive summary

FitFlex has **no KYC/KYB module today**. What it has is a single, coarse **role-approval flag**: `User.approvalStatus`, set to `pending_approval`, `approved` or `rejected`. Admins flip it from one portal page. There is also a scatter of free-text payment fields and cosmetic "verified" badges. There is:

- no document capture
- no private file storage
- no settlement-account verification
- no expiry
- no server-side enforcement

Several existing pieces are **broken in ways that matter for KYC**:

| # | Finding | Evidence |
|---|---|---|
| F1 | The `approvedAt` and `approvedBy` values written on approval are **silently dropped**. They are not in `ALLOWED_FIELDS.users` and they are not columns. | `src/services/admin-approval-service.mjs:28-33`, `src/infra/knex-store.mjs:516` |
| F2 | The vendor "Verified" toggle in the portal **never persists**, because `User.verified` doesn't exist. The UI updates optimistically and the value reverts on reload. | `shop-service.mjs:207`, `app/admin/vendors/page.tsx:104` |
| F3 | Approving a trainer updates `User.approvalStatus` but **not** `TrainerProfile.approvalStatus`, which stays `pending_approval` forever. | `admin-approval-service.mjs` has no trainer sync |
| F4 | **Pending status is enforced only by the mobile router.** The server issues a full JWT to pending partners. Pending trainers are publicly listed and bookable, because `trainerService.list` filters on `status` only. A pending owner's gyms are created `status:'active'` and are immediately live. | `auth-service.mjs:203`, `trainer-service.mjs:65`, `owner-gym-service.mjs:41` |
| F5 | A gym owner can set `verified`, `commissionRate` and the payout bank/number on their own gym. `PUT /owner/gyms/:id` passes the body through `normalizeGymPayload`, which honours those fields. | `owner-gym-service.mjs:104-113`, `gym-service.mjs:46,57,87-90` |
| F6 | `Gym.verified` is **auto-derived from profile completeness** (photos, coordinates, amenities). It is a listing-quality badge, not a KYB outcome, but members see it as "Verified". | `gym-service.mjs:43-56` |
| F7 | Uploaded files are **public, content-addressed and image-only**. `GET /storage/:cid/:filename` needs no auth. The current storage is unsuitable for ID documents. | `functions/storage.mjs:153-162` |
| F8 | A vendor can change `settlementAccount` at any time through `PUT /vendor/profile`, with no re-verification and no audit. Any key in the request body is merged into the `vendorProfile` JSON. | `shop-service.mjs:36-52` |
| F9 | There are **two payout calculators**. Gym "invoices" (which are really payables *to* the gym) use the streak-based day/week/month rates in `finance-service`. The 5-band engine in `shared/payout-engine.mjs` is only used for operator analytics. | `finance-service.mjs`, `operator-service.mjs:212` |
| F10 | Trainer payouts (`TrainerBooking.trainerPayoutTzs`) and vendor settlements (`ShopOrder.settlementStatus`) are **computed but never paid out**. Nothing ever sets `settled`, and there is no ledger. | grep: no writer of `settled` |

**Recommendation in one line:** build **one** partner-verification domain that extends the existing approval service. Make it the single source of truth that drives `User.approvalStatus`. Add a private document store and one `SettlementAccount` entity. Generalise `GymPayout` into a partner payout record rather than adding parallel payout tables. Then enforce verification on the server.

---

## 1. Existing architecture

| Layer | Stack | Key conventions |
|---|---|---|
| **Superproject** `fitflex` | Git submodules: `fitflex-functions`, `fitflex-portal`, `fitflexmobile` | Every merge to `main` in a submodule deploys. Superproject pointers are bumped by hand. |
| **API** `fitflex-functions` | Node ESM, `bfast-function` (Express under the hood), Knex + PostgreSQL, firebase-admin, Zebra storage, Africa's Talking (WhatsApp) | Routes are exported objects `{method, path, onGuard, onRequest}` in `functions/*.mjs`.<br>Services are factory functions with DI, wired in `src/bootstrap/services.mjs`.<br>Collections live in `src/bootstrap/collections.mjs`, backed by `src/infra/knex-store.mjs` (`TABLE_MAP` + an **`ALLOWED_FIELDS` column whitelist** + `JSON_FIELDS`).<br>Migrations are in `db/migrations/*.cjs`, run on `postinstall` (so on deploy). They are idempotent `hasTable`/`hasColumn` guards.<br>Tests are `node:test` specs in `specs/*.specs.mjs` against a CI database. |
| **Portal** `fitflex-portal` | Next.js App Router, static export to Firebase Hosting, Tailwind, lucide | One API client in `src/lib/api.ts`.<br>Shared UI: `DataTable`, `Dialog`/`ConfirmDialog`, `Badge`, `Field`, `ImageUpload`.<br>Nav is ACL-scoped in `src/components/Shell.tsx` (`aclScope`).<br>EN/SW strings in `src/lib/i18n.ts`.<br>Areas: `/admin/*`, `/hr/*`, `/owner/manage`, `/dashboard`, `/scan`. |
| **Mobile** `fitflexmobile` | Flutter, GoRouter, `AuthState` (ChangeNotifier), `ApiClient` | Role shells for member, owner (plus gym_staff), trainer and vendor.<br>Redirect gating in `lib/router.dart`.<br>EN/SW strings in `lib/shared/i18n.dart`.<br>`image_picker` and `file_picker` are already dependencies. |

**Authentication**
- Sign-in paths:
  - Firebase (Google or email) then `POST /auth/firebase/session`, which returns a FitFlex JWT (HS256, 7 days in production).
  - Phone OTP.
  - scrypt passwords, used only for `vendor_staff` and `corporate_hr`.
- JWT claims: `sub, userType, gymId, portalUser, aclPermissions, vendorId, vendorRole, vendorPermissions, corporateId`.
- **Multi-role identities.** There is one `User` row per `(identity, userType)`, enforced by the unique indexes `User_{phone,email,firebaseUid}_userType_key`. A person who is both a trainer and a gym owner therefore has **two** `User` rows.

**Roles:** `member`, `gym_operator`, `gym_staff`, `trainer`, `vendor`, `vendor_staff`, `corporate_hr`, `admin`.

**Access control**
- `requireAuth(...roles)` checks the role.
- `requireAcl(scope)` is for portal staff (admins with `portalUser:true`). Super-admins pass freely. Scopes are listed in `PORTAL_ACL_SCOPES` in `portal-user-service.mjs`.
- `requireGymAcl(scope)` is for gym staff.
- `requireVendorPermission(p)` is for vendor staff.
- In flight: branch `fix/admin-route-acl-scopes` (unmerged) adds `requireAcl('payments')` to invoices and finance, among others.

---

## 2. Existing partner onboarding flows

| Partner | Entry | What's collected | Approval | Where it goes live |
|---|---|---|---|---|
| **Gym owner** | Role choice, then Firebase sign-up. `User` is created as `pending_approval`. Mobile `OwnerRegistrationPage` calls `POST /gym-owner/register`. | Name, phone, gyms (name, location, coordinates, photos, rates, amenities). **No TIN, bank or licence on mobile.** The admin portal `gym-create-form.tsx` has a "Payment & KYC details" block with free-text `paymentBank`, `paymentNumber`, `paymentNotes` and `tinNumber` on the `Gym`. | Admin approves the `User` at `/admin/approvals`. Admin-created owners (`/admin/gym-owners`) skip approval. | **Immediately.** Gyms are inserted with `status:'active'` (F4). |
| **Trainer** | Role choice, then sign-up (`User` pending). `TrainerRegistrationPage` calls `POST /trainer/register`, which creates `TrainerProfile{approvalStatus:'pending_approval', status:'active'}`. | Photo, gender, bio, specialties, rate, experience. **No ID, certificates or insurance.** | Admin approves the `User` (the `TrainerProfile` is not synced, F3). A separate gym-affiliation flow (`pendingGymIds`) is approved by the owner in `/owner/manage` and the mobile Trainers page. Owner-created trainers are auto-approved. | **Immediately** in `/trainers` (F4). |
| **Vendor** | Role choice, then sign-up (`User` pending). Profile set in the mobile vendor shell with `PUT /vendor/profile`. | `vendorProfile` JSON on `User` with required fields, including `settlementAccount:{provider, account}` as free text. | Admin at `/admin/vendors` (approve, reject, suspend, "verified" (F2)). Each product also needs approval (`Product.approvalStatus`). | Storefront appears when `vendorProfile.status='published'`. Products appear once approved. |
| **Corporate** | **Admin-only**: `POST /admin/corporate` creates a `CorporateAccount{status:'pending'}`. The admin activates it and creates HR logins. | Company name, sector, workforce bracket, HR contact, subsidy model, domain whitelist, `lipaNamba` (a collection number). **No registration or TIN documents.** | `POST /admin/corporate/:id/status` (`pending`, `active`, `suspended`, `terminated`). | Seat provisioning requires `status:'active'` (server-enforced). |

**Canon requirements already on record** (`canon/00-master-brain/market-and-compliance.md` and `canon/07-operations/gym-vetting-sop.md`):
- **Tier 2, trainers:** certification credentials, liability coverage and national ID.
- **Tier 3, owners:** business licence audit, TIN validation, physical site verification and bank/wallet routing.
- **Vendors:** "not yet defined as a KYC'd stakeholder" (open).
- **Regulatory:** BRELA; Personal Data Protection Act 2022 (local hosting of personal data, explicit consent).

---

## 3. Existing KYC functionality

**None as a feature.** The fragments below exist today.

| Fragment | Location | Nature |
|---|---|---|
| `User.approvalStatus` and `approvalNote` | `User` table | Coarse role gate, the only real "approval" state |
| `TrainerProfile.approvalStatus` and `verified` | `TrainerProfile` | Duplicate state, not synced (F3). `verified` is an admin badge. |
| `Gym.verified` | `Gym` | Auto-derived from profile completeness (F6), and owner-settable (F5) |
| `Gym.tinNumber`, `paymentBank`, `paymentNumber`, `paymentNotes` | `Gym` | Free text, unvalidated, owner-editable, no audit trail on change |
| `vendorProfile.settlementAccount` | `User.vendorProfile` JSON | Free text `{provider, account}`, no verification |
| `CorporateAccount.domainWhitelist` and `verify-domain` | corporate | Email-domain check for employee seats, not KYB |
| Canon KYC tiers | `canon/` | Requirements only |

There are no NIDA, licence, certificate, insurance or document entities, and no expiry or re-verification.

---

## 4. Existing settlement/payout functionality

| Flow | How it works today | Gaps for settlement verification |
|---|---|---|
| **Gym payouts** | `finance-service.periodDistribution()` auto-creates `Invoice` rows per gym per period, using day/week/month streak rates. These "invoices" are **amounts FitFlex owes the gym**. The admin opens `/admin/distributions`, uploads a receipt **image**, and marks the row paid. `invoice-service.update` then inserts a `GymPayout{status:'paid'}`. Owners see this at `/owner/invoices` and `/owner/earnings` (mobile `owner_earnings_page.dart`). | Transfers happen off-platform. No destination account is recorded on the payout. Nothing checks that the gym's account is verified. No holds, no maker-checker, and one step goes from unpaid to paid. The 5-band engine is not used (F9). |
| **Trainer payouts** | `TrainerBooking` stores `commissionTzs` and `trainerPayoutTzs` when a booking is paid. | No ledger, statement or disbursement (F10). |
| **Vendor settlement** | `ShopOrder.settlementStatus='pending'` is set on create. The vendor payments tab shows pending versus settled totals. | No writer of `settled`, no admin settlement UI (F10). Note: `createOrder` records `paymentStatus:'paid'` without a payment check. That is out of scope, but it is a settlement-integrity risk. |
| **Corporate** | `CorporateBill` is money **in**: the admin marks bills paid. | Money in only. KYB is needed, but a payout account is not (see open decision D3). |
| **Money in** | `PaymentRequest` is approved manually by an admin, plus the Selcom webhook (shared secret). | No disbursement (B2C) integration exists. |

---

## 5. Existing admin approval functionality

| Workflow | API | Portal | Reusable pattern |
|---|---|---|---|
| Role approvals (owner, trainer, vendor) | `GET /admin/role-approvals`, `POST /admin/role-approvals/:id/decision` (ACL `approvals`) | `app/admin/approvals/page.tsx`: table, filter, approve or reject via `ConfirmDialog`. **Sends no note.** | **Extend this** into the verification queue |
| Vendor management | `PUT /admin/vendors/:id` (ACL `shop`) | `app/admin/vendors/page.tsx` | Merge vendor approval into verification |
| Product approval | `/admin/products` | `app/admin/products` | Unchanged |
| Payment requests | `/admin/payment-requests/:id/decision` | `app/admin/payments` | Pattern: `pending → approved/rejected` with `decidedBy`/`decidedAt`, and 409 `already_decided` |
| Challenge rewards | `challenge-reward-service` | `reward-queue.tsx` | **Best existing lifecycle pattern**: a `history` jsonb of `{status, by, at, note}`, a reason shown to the user, and admin/HR queues |
| Trainer gym applications | `pendingGymIds` | `owner/manage` | Unchanged (affiliation, not KYC) |
| Corporate status | `/admin/corporate/:id/status` | `app/admin/corporate` | Gate activation on KYB |
| Social reports, gym and trainer reviews | moderation endpoints | `admin/social` | n/a |

---

## 6. Existing database entities/models (relevant)

| Table | Relevant columns |
|---|---|
| `User` | `userType`, `accountStatus` (`active`/`suspended`), `approvalStatus`, `approvalNote`, `verified` (in the init schema, but **not** in `ALLOWED_FIELDS`), `gymId`/`gymIds`, `vendorProfile` jsonb, `vendorId`, `corporateId`, `portalUser`, `aclPermissions` |
| `Gym` | `status`, `verified`, `commissionRate`, `paymentBank`, `paymentNumber`, `paymentNotes`, `tinNumber` |
| `TrainerProfile` | `userId`, `status`, `approvalStatus`, `verified`, `pendingGymIds` |
| `CorporateAccount` | `status`, HR contact fields, `domainWhitelist`, `lipaNamba` |
| `Invoice` (a gym payable) | `gymId`, `ownerId`, `amount`, `status`, `receiptUrl`, `paymentReference`, `paidAt` |
| `GymPayout` | `gymId`, `invoiceId`, `amount`, `status`, `reference`, `paidAt` |
| `TrainerBooking` | `trainerPayoutTzs`, `commissionTzs`, `paymentRequestId` |
| `ShopOrder` | `settlementStatus`, `paymentStatus`, `paymentMethod` |
| `AuditLog` | `actor`, `action`, `target`, `before`, `after` (jsonb), `at`. **No read API.** |
| `Notification`, `DeviceToken` | in-app inbox and push |
| `PlatformSettings` | `payoutBands`, `paymentPeriodDays`, `payoutModel` |
| `JobRun` (communications branch) | job bookkeeping |

The latest migration on any branch is `20261003090000-social-followers-public.cjs`. The comms branch adds `20261002090000-communications.cjs`. **Pick a timestamp later than both at merge time.**

---

## 7. Existing APIs (relevant)

- **Auth:** `/auth/firebase/session`, `/auth/otp/*`, `/auth/login`, `GET /me`.
- **Onboarding:** `POST /gym-owner/register`, `POST /trainer/register`, `PUT /trainer/me`, `GET|PUT /vendor/profile`, `POST /admin/corporate`.
- **Owner:** `/owner/gyms` (CRUD), `/owner/invoices`, `/owner/earnings`.
- **Admin:**
  - `/admin/role-approvals*`, `/admin/vendors*`, `/admin/gym-owners*`, `/admin/trainers*`, `/gyms` (admin upsert)
  - `/admin/invoices*`, `/admin/distributions/periods`, `/admin/gym-usage*`, `/admin/book-keeping`
  - `/admin/corporate*`, `/admin/portal-users*`
- **Files:** `POST /storage/upload` (image only, converted to WebP) and public `GET /storage/:cid/:filename`.
- **Notifications:** `/me/notifications*`, `/me/device-tokens*`. Jobs live in `functions/jobs.mjs` (internal-token scheduled endpoints).

## 8. Existing frontend screens/components (relevant)

**Portal**
- Pages: `admin/approvals`, `admin/vendors`, `admin/owners`, `admin/trainers`, `admin/gyms`, `admin/corporate`, `admin/distributions`, `admin/payments`, `admin/users` (ACL grants), `owner/manage`.
- Components: `DataTable`, `ConfirmDialog`/`Dialog`, `Badge`, `ImageUpload`, `gym-create-form.tsx`, `reward-queue.tsx`, `Shell.tsx` (nav plus ACL).

**Mobile**
- Registration screens: `owner_registration_page.dart`, `trainer_registration_page.dart`.
- Profile screens: vendor profile form inside `vendor_home_page.dart`, `owner_profile_page.dart`, `owner_earnings_page.dart`.
- Pending state: `PendingApprovalScreen` (in `auth_screen.dart`), `ff_gym_unapproved_card.dart`, and the redirect gating in `router.dart`.
- Shared widgets: `ff_photo_picker_field.dart`, `profile_form_page.dart`, `trainer_form_page.dart`.

---

## 9. Reusable components/services

| Need | Reuse | Change needed |
|---|---|---|
| Approval queue and decision | `admin-approval-service.mjs`, `/admin/role-approvals`, portal approvals page | Extend into verification review. Keep the old endpoint as a compatibility shim. |
| Lifecycle and history | `challenge-reward-service` `history[]` pattern | Copy the pattern, not the code |
| Auth and RBAC | `requireAuth`, `requireAcl`, `PORTAL_ACL_SCOPES`, `Shell.tsx` `aclScope` | Add scopes `kyc` (review), `kyc_pii` (unmask) and `settlements` |
| Audit | `auditLog` collection | Use `insertAsync` (awaited) for KYC actions. Add a read endpoint filtered by target. |
| Notifications | `notificationService.notify()` (inbox, push, WhatsApp) | New types `kyc_*`. These are transactional, so **don't** route them through the campaign engine. |
| Scheduled jobs | `functions/jobs.mjs` pattern plus `JobRun` | Add a `kyc-expiry` job |
| Multipart parsing and Zebra client | `functions/storage.mjs` helpers | Extract into `src/infra/storage-client.mjs`. Add a **private** document path (see §11.3). |
| Upload UI | Portal `ImageUpload`; mobile `image_picker`/`file_picker` | New document-upload widgets that accept PDFs |
| Status badges | `statusTone`/`statusLabel` (`admin-utils.ts`), `Badge`, `FFGymUnapprovedCard` | Add the verification statuses |
| Payout record | `GymPayout` + `invoice-service.update` | Generalise; don't duplicate (§11.4) |
| i18n | Both apps, EN and SW | New keys, which then need the Swahili review (already an open item) |

---

## 10. Gaps against the KYC/KYB requirements

| # | Gap | Gym owner | Trainer | Vendor | Corporate |
|---|---|:-:|:-:|:-:|:-:|
| G1 | Structured, per-type requirement sets (which documents and fields are mandatory) | ✗ | ✗ | ✗ | ✗ |
| G2 | Document capture (PDF and images), versioning, per-document review, rejection reasons, resubmission | ✗ | ✗ | ✗ | ✗ |
| G3 | Private, access-controlled document storage with short-lived access | ✗ | ✗ | ✗ | ✗ |
| G4 | Identity: NIDA number and ID image for the owner, director or trainer | ✗ | ✗ | ✗ | signatory ✗ |
| G5 | Business: BRELA certificate, business licence, TIN certificate and number | ✗ | n/a | ✗ | ✗ |
| G6 | Professional: certification and liability insurance, with expiry | n/a | ✗ | n/a | n/a |
| G7 | Physical site verification per gym (visit date, reviewer, photos, rubric link) | ✗ | n/a | n/a | n/a |
| G8 | Settlement account: bank or mobile money, account-name match, verification, change control with re-verification and payout hold | ✗ (free text) | ✗ | ✗ (free text) | n/a (D3) |
| G9 | Server-side enforcement: listing, bookings, check-ins, product publish and payouts blocked until verified | ✗ (F4) | ✗ (F4) | partial | ✓ seats only |
| G10 | Expiry tracking, reminders, auto-suspension | ✗ | ✗ | ✗ | ✗ |
| G11 | Explicit states such as `info_requested` and `suspended`, with reason codes | ✗ | ✗ | ✗ | partial |
| G12 | Maker-checker on approval and on settlement-account change | ✗ | ✗ | ✗ | ✗ |
| G13 | PII protection: admin/staff-only visibility, retention and consent (PDPA 2022). Field encryption was dropped by decision on 26 Sep. | ✗ | ✗ | ✗ | ✗ |
| G14 | A partner-facing status screen showing what's missing and why a document was rejected | pending screen only | same | ✗ | ✗ |
| G15 | Audit timeline visible to reviewers | write-only | write-only | write-only | write-only |
| G16 | Self-serve corporate KYB | n/a | n/a | n/a | ✗ (admin-only) |

---

## 11. Recommended implementation architecture

### 11.1 One verification domain, not four

Build a single service, `partner-verification-service`, keyed by `(partnerType, subjectId)`. It **supersedes** the role-approval service and is not a sibling of it.

`partnerType` takes one of four values:

| `partnerType` | `subjectId` |
|---|---|
| `gym_owner` | `User.id` (`userType` `gym_operator`) |
| `trainer` | `User.id`; `TrainerProfile` is kept in sync |
| `vendor` | `User.id` |
| `corporate` | `CorporateAccount.id` |

- **Single source of truth.** The verification status **drives** `User.approvalStatus`, `TrainerProfile.approvalStatus` and `CorporateAccount.status` through one `applyOutcome()` function. That fixes F3 and keeps every existing reader (mobile router, auth, portal) working unchanged.
- **Requirements as code.** Put them in `src/shared/partner-verification-requirements.mjs`, with the same pattern as `corporate-constants.mjs`. Example: gym owner requires `owner_nida`, `brela_cert`, `business_licence`, `tin_cert` and `settlement_account`, plus a `site_visit` per gym. Trainer requires `nida`, `certification` (with expiry) and `liability_insurance` (with expiry). Admin-tunable overrides can go in `PlatformSettings` later.
- **State machine.** One pure module (`src/shared/verification-status.mjs`) that is unit-tested, like `subscription-status.mjs`:

```
draft ─submit→ submitted ─claim→ in_review ─┬→ approved ─expire/revoke→ suspended ─resubmit→ submitted
                                            ├→ info_requested ─resubmit→ submitted
                                            └→ rejected (terminal for that submission; may start a new one)
```

  Each document has its own state: `pending`, `accepted`, `rejected`, `expired` or `superseded`.

### 11.2 Data model (new)

- **`PartnerVerification`**
  - `id`, `partnerType`, `subjectId`, `status`, `tier` (2 or 3), `submittedAt`
  - `reviewerId`, `decidedBy`, `decidedAt`, `reasonCode`, `reasonNote`
  - `history` jsonb, `version`, `createdAt`, `updatedAt`
  - Unique on `(partnerType, subjectId)`.
- **`VerificationDocument`**
  - `id`, `verificationId`, `requirementKey`, `scopeId` (for example the `gymId` for a site visit)
  - `storageKey` (private), `mime`, `sizeBytes`, `sha256`
  - `documentNumberEnc`, `documentNumberLast4`, `issuedAt`, `expiresAt`
  - `status`, `reviewNote`, `reviewedBy`, `reviewedAt`, `uploadedBy`, `createdAt`
- **`SettlementAccount`**
  - Identity: `id`, `ownerType` (`gym`, `trainer` or `vendor`), `ownerId`, `method` (`bank` or `mobile_money`), `provider` (CRDB, NMB, NBC, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa and so on)
  - Account details: `accountName`, `accountNumberEnc`, `accountLast4`, `branch`/`swift`, `proofDocumentId`
  - Verification: `status` (`pending_verification`, `verified`, `rejected` or `disabled`), `verificationMethod` (`manual_document`, `name_match` or `test_deposit`), `verifiedBy`, `verifiedAt`
  - Change control: `requestedBy`, `isPrimary`, `cooldownUntil`, `history`
- **Payout holds (by extension):** `PartnerVerification.status` or an unverified primary `SettlementAccount` puts the partner's payouts on hold (§11.4).

### 11.3 Private document storage (decision D1)

Current storage is public and content-addressed (F7). There are two options:

- **(a) Encrypt, then upload to Zebra.** Encrypt with AES-256-GCM, key from `KYC_ENCRYPTION_KEY`, then upload. Store the Zebra CID in `storageKey`. Serve documents **only** through an authenticated `GET /admin/verifications/:id/documents/:docId`, which fetches, decrypts and streams them with `Cache-Control: no-store`. This keeps one storage vendor and keeps hosting local, which matters for PDPA, provided Zebra is hosted in Tanzania.
- **(b) A private Firebase/GCS bucket with 5-minute signed URLs.** firebase-admin is already a dependency. This is simpler, but the data then lives outside Tanzania, which needs a PDPA authorisation.

**Recommendation: (a)**, subject to confirming where Zebra is hosted. In both options the upload endpoint must:
- accept `application/pdf`, `image/jpeg`, `image/png` and `image/webp`, verified by magic bytes rather than the `Content-Type` header
- cap files at 10 MB
- **not** re-encode documents to WebP
- record a sha256
- strip EXIF from images

### 11.4 Settlement and payout (extend, don't duplicate)

- Generalise **`GymPayout` into the partner payout record**. Add `partnerType`, `partnerId`, `settlementAccountId`, a masked `destinationSnapshot`, `status` (`scheduled`, `held`, `approved`, `paid`, `failed`), `approvedBy` and `paidBy`, and make `gymId` nullable. Existing rows become `partnerType='gym'`. **Don't create separate `TrainerPayout` or `VendorSettlement` tables.**
- `invoice-service.update(status:'paid')` must refuse when:
  - the gym's owner verification isn't `approved`
  - no **verified** primary `SettlementAccount` exists
  - the actor is the same person who last changed that account (maker-checker)
- Snapshot the destination on the payout.
- Trainer payouts and vendor settlements then write into the same table, via a later phase (P6). Reconciling F9 (which calculator is canonical) is a **business decision** (D5), not part of KYC. Flag it; don't fix it silently.
- Changing a settlement account creates a **new** `pending_verification` account. The old account stays primary until the new one is verified. That rule fixes F5 and F8.

### 11.5 Enforcement (fixes F4 and F5)

One helper, `partnerVerificationService.isOperational(partnerType, subjectId)`, is applied at these points:

| Where | Check |
|---|---|
| `trainerService.list` / `getActive` | Only `approvalStatus==='approved'` trainers are listed or bookable |
| `trainer-booking-service` quote and create | Trainer is approved |
| `ownerGymService.registerOwner` / `createGym` | New gyms start `status:'pending'` and are activated when owner KYB and the gym's site visit are approved |
| `ownerGymService.updateGym` | Strip `verified`, `commissionRate`, `homepage*`, `status`, `paymentBank`, `paymentNumber` and `tinNumber` from owner input. Bank changes go through the `SettlementAccount` flow. |
| `shop-service` publish and product create | Vendor approved |
| `invoice-service.update` (paid) and future payout writers | See §11.4 |
| `corporate-service.setStatus('active')` | Corporate KYB approved (unless admin-overridden with a reason, audited) |
| Mobile router | Keep as UX only; the server is now authoritative |

**Grandfathering (decision D2).** Existing `approved` partners get a `PartnerVerification{status:'approved', tier:0 /*legacy*/}` plus a deadline. Suggested defaults:
- a 30-day grace period with reminders
- then payouts **held**, not listings removed

### 11.6 Security primitives
- A field-encryption helper, `src/shared/pii-crypto.mjs` (AES-256-GCM with a key version prefix to allow rotation), for NIDA, TIN, licence and account numbers. Keep `*Last4` values for display.
- New ACL scopes:
  - `kyc`: review, with masked PII
  - `kyc_pii`: unmask and view documents; every view is audited
  - `settlements`: verify accounts and approve payouts
- Maker-checker: the approver ≠ the person who requested a settlement-account change; the reviewer ≠ the subject.
- Every KYC action is written with `auditLog.insertAsync` (awaited). Document views are audited too.

---

## 12. Files that would need modification

**fitflex-functions**

| File | Change |
|---|---|
| `src/infra/knex-store.mjs` | `TABLE_MAP`, `ALLOWED_FIELDS` and `JSON_FIELDS` entries for 3 new tables and the `GymPayout` columns. Remove the dead `approvedAt`/`approvedBy` writes, or add the columns (F1). Decide `User.verified` (F2). |
| `src/bootstrap/collections.mjs`, `src/bootstrap/services.mjs` | Register the new collections and service |
| `src/services/admin-approval-service.mjs` | Delegate to the verification service, keeping the response shape for the compatibility shim |
| `functions/admin-approvals.mjs` | Keep the endpoints and back them with verification |
| `src/services/auth-service.mjs` | Add `verificationStatus` to the session payload (the JWT stays lean) |
| `src/services/trainer-service.mjs` | Listing filter; `register()` creates a draft verification |
| `src/services/trainer-booking-service.mjs` | Block unverified trainers |
| `src/services/owner-gym-service.mjs` | Pending gyms, input stripping (F5), draft verification on register |
| `src/services/gym-service.mjs` | Separate owner-controlled fields from admin-controlled ones; decide on the `verified` semantics (F6) |
| `src/services/shop-service.mjs` | Stop the free-form `settlementAccount` merge (F8); whitelist `vendorProfile` keys; remove the `verified` write (F2) |
| `src/services/invoice-service.mjs` | Payout gating, destination snapshot, maker-checker |
| `src/services/corporate-service.mjs` | KYB gate on activation |
| `src/services/portal-user-service.mjs` | Add the `kyc`, `kyc_pii` and `settlements` scopes |
| `src/services/notification-service.mjs` | No code change; new `type` strings only |
| `functions/jobs.mjs` | `kyc-expiry` job |
| `functions/storage.mjs` | Extract the Zebra and multipart helpers into `src/infra/storage-client.mjs` (the image path is unchanged) |
| `functions/owner-gyms.mjs`, `functions/trainers.mjs`, `functions/shop.mjs`, `functions/corporate.mjs`, `functions/admin-invoices.mjs` | Guard and route wiring |

**fitflex-portal**

| File | Change |
|---|---|
| `src/lib/api.ts` | Verification, document, settlement and audit endpoints; types |
| `src/components/Shell.tsx` | "Verification" and "Settlement accounts" nav items (scopes `kyc` and `settlements`) |
| `app/admin/approvals/page.tsx` | Becomes the verification queue (or redirects to it) |
| `app/admin/vendors/page.tsx` | Replace the verified toggle with the verification status (F2) |
| `app/admin/owners/page.tsx`, `app/admin/trainers/page.tsx`, `app/admin/corporate/page.tsx` | Verification status column and a link to the case |
| `app/admin/distributions/page.tsx` | Show the destination account and verification state; block "Pay" when held |
| `src/components/gym-create-form.tsx` | Remove the free-text "Payment & KYC details" block and link to the settlement account instead |
| `src/lib/i18n.ts`, `src/lib/admin-utils.ts` | Strings, status tones |

**fitflexmobile**

| File | Change |
|---|---|
| `lib/shared/api_client.dart` | Verification, document-upload and settlement endpoints |
| `lib/shared/auth_state.dart`, `lib/router.dart` | `verificationStatus`; route partners to the verification centre |
| `lib/screens/auth_screen.dart` (`PendingApprovalScreen`) | Replace with a checklist-driven status screen |
| `lib/screens/owner/owner_registration_page.dart`, `lib/screens/trainer/trainer_registration_page.dart` | Hand off to the KYC steps after the profile step |
| `lib/screens/vendor/vendor_home_page.dart` | Remove the free-text `settlementAccount`; link to settlement |
| `lib/screens/owner/owner_earnings_page.dart`, `owner_profile_page.dart` | Payout-hold banner and settlement account |
| `lib/shared/components/ff_gym_unapproved_card.dart`, `lib/shared/i18n.dart` | States, EN/SW strings |

## 13. New files that would need creation

**fitflex-functions**
- `db/migrations/2026100X090000-partner-verification.cjs`
- `db/migrations/2026100X091000-partner-payouts.cjs` (the `GymPayout` generalisation)
- `src/shared/verification-status.mjs`: pure state machine
- `src/shared/partner-verification-requirements.mjs`: requirement sets per partner type
- `src/shared/pii-crypto.mjs`: field encryption and masking
- `src/infra/storage-client.mjs`: Zebra client, plus encrypted private upload and download
- `src/services/partner-verification-service.mjs`
- `src/services/settlement-account-service.mjs`
- `functions/partner-verification.mjs`: partner self-service routes
- `functions/admin-verifications.mjs`: reviewer routes
- `functions/settlement-accounts.mjs`
- Specs:
  - `specs/verification-status.specs.mjs`
  - `specs/partner-verification.specs.mjs`
  - `specs/settlement-accounts.specs.mjs`
  - `specs/partner-enforcement.specs.mjs` (F4 and F5 regressions)
  - `specs/kyc-documents-storage.specs.mjs`
  - `specs/pii-crypto.specs.mjs`

**fitflex-portal**
- `app/admin/verifications/page.tsx`: the queue
- `app/admin/verifications/[id]/page.tsx`, or a detail drawer, since static export needs `generateStaticParams`. **Prefer a query-param detail view (`?id=`)**, which matches the existing pages.
- `app/admin/settlements/page.tsx`
- `src/components/document-viewer.tsx`: PDF and image, fetched with auth, with no public URL
- `src/components/verification-timeline.tsx`
- `src/components/requirement-checklist.tsx`

**fitflexmobile**
- `lib/screens/partner/verification_center_page.dart`
- `lib/screens/partner/document_upload_sheet.dart`
- `lib/screens/partner/settlement_account_page.dart`
- `lib/shared/partner/verification_models.dart`
- `lib/shared/widgets/ff_document_picker_field.dart`
- Tests under `test/partner/`

## 14. Database migration requirements

1. **Create** `PartnerVerification`, `VerificationDocument` and `SettlementAccount`, with indexes on `(partnerType, status)`, `(verificationId, requirementKey)`, `(ownerType, ownerId, isPrimary)` and `expiresAt`. Use idempotent `hasTable` guards (the house style).
2. **Alter** `GymPayout`: add `partnerType` (default `'gym'`), `partnerId`, `settlementAccountId`, `destinationSnapshot` jsonb, `approvedBy`, `paidBy` and `holdReason`, and make `gymId` nullable. Backfill `partnerId = gymId`.
3. **Alter** `Gym`: no destructive change. `paymentBank`, `paymentNumber` and `tinNumber` stay **read-only**, marked deprecated, and are dropped in a later release.
4. **Backfill** (in the migration or a one-off script; the migration is safer because it runs on deploy):
   - Existing `gym_operator`, `trainer` and `vendor` users become `PartnerVerification` rows. `approved` maps to `approved` with `tier:0` (legacy). `pending_approval` maps to `submitted`. `rejected` maps to `rejected`.
   - `CorporateAccount` rows get the same treatment.
   - Non-empty `Gym.paymentBank`/`paymentNumber` and `vendorProfile.settlementAccount` values become `SettlementAccount{status:'pending_verification'}`, **encrypted**. The backfill needs `KYC_ENCRYPTION_KEY` present at deploy.
   - Fix F3: set `TrainerProfile.approvalStatus` from `User.approvalStatus`.
5. **F1/F2:** either add `User.approvedAt`/`approvedBy` or delete the writes. Recommendation: delete them, because the verification record holds that information.
6. **Timestamps** must sort after `20261003090000`. Re-check against the comms M3/M4 branches when merging.
7. The `down` migrations drop the new tables and columns. The backfill is one-way, which is acceptable because the source columns are untouched.

## 15. API changes

**Partner self-service** (`requireAuth('gym_operator','trainer','vendor','corporate_hr')`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/me/verification` | Status, requirement checklist, per-document state, reasons |
| POST | `/me/verification/documents` | Multipart upload: `requirementKey`, `scopeId?`, `documentNumber?`, `issuedAt?`, `expiresAt?` |
| DELETE | `/me/verification/documents/:id` | Allowed only while `draft` or `info_requested` |
| POST | `/me/verification/submit` | Validates completeness, then `submitted` |
| GET, POST | `/me/settlement-accounts` | List (masked) and create (`pending_verification`) |
| POST | `/me/settlement-accounts/:id/primary` | Takes effect only once verified |

**Reviewer** (`requireAuth('admin')` plus `requireAcl('kyc')`; document download also needs `kyc_pii`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/verifications` | `?status&partnerType&expiringWithin&q` |
| GET | `/admin/verifications/:id` | Case detail, masked unless the caller has `kyc_pii`; includes the timeline |
| POST | `/admin/verifications/:id/claim` | Moves to `in_review` and assigns the reviewer |
| POST | `/admin/verifications/:id/documents/:docId/decision` | `accept` or `reject`, plus a note |
| POST | `/admin/verifications/:id/decision` | `approve`, `reject`, `request_info` or `suspend`. `reasonCode` is required for anything except approve. |
| GET | `/admin/verifications/:id/documents/:docId/file` | Authenticated streaming, audited, `no-store` |
| POST | `/admin/verifications/:id/site-visit` | Gym `scopeId`, date, notes, photos, rubric score |
| GET | `/admin/audit?target=` | Read-only audit timeline |

**Settlements** (`requireAcl('settlements')`): `GET /admin/settlement-accounts?status=`, `POST /admin/settlement-accounts/:id/decision` (maker-checker enforced).

**Changed:**
- `/admin/role-approvals*` becomes a thin shim over the verification service.
- `POST /gym-owner/register`: gyms now start `pending`.
- `PUT /owner/gyms/:id`: fields stripped (F5).
- `PUT /vendor/profile`: `settlementAccount` ignored, with a `deprecated` hint in the response.
- `PUT /admin/invoices/:id {status:'paid'}`: can now return `409 payout_held` with `{reason}`.
- `GET /trainers`: excludes unapproved trainers.
- The `/auth/firebase/session` response gains `verification:{status, missing[]}`.

**Jobs:** `POST /jobs/kyc-expiry` (internal token): expire documents, send T-30/T-7/T-0 notifications, suspend and hold payouts.

## 16. UI changes

**Portal (admin)**
- **Verification queue:** tabs Submitted, In review, Info requested, Expiring, Approved, Rejected; filter by partner type; SLA age column.
- **Case view:** requirement checklist; document viewer, where every open is audited; per-document accept or reject with a reason; decision panel with reason codes; timeline.
- **Settlement accounts page:** masked numbers; proof document; verify or reject; maker-checker banner.
- **Distributions:** show the destination account and its verified badge; "Pay" is disabled with the hold reason shown.
- **Vendors, Owners, Trainers, Corporate:** verification status column and a deep link to the case. Remove the non-functional vendor "verified" toggle.
- **Gyms:** relabel the auto `verified` badge as "Profile complete", *or* bind "Verified" to KYB (D4).
- **Users (ACL):** grant the `kyc`, `kyc_pii` and `settlements` scopes.

**Mobile (partners)**
- **Verification centre:** a checklist showing what's missing, what was rejected and why, and expiry dates. Upload by camera, gallery or PDF. Submit.
- **Settlement account screen:** choose bank or mobile money, provider, account name and number, and proof; show status; changes show "pending, your current account stays active until verified".
- **Payout-hold banner** on Earnings. Trainer and vendor earnings screens show the hold state as well.
- The pending screen becomes status-aware: submitted, info requested (with a CTA), or rejected (with the reason).
- All strings in EN and SW.

**Portal HR (corporate):** a read-only KYB status card on `/hr`. Upload runs through the admin-assisted flow unless self-serve corporate KYB is wanted (D3).

## 17. Security considerations
1. **No public URLs for KYC documents, ever.** Use the private path from §11.3, authenticated streaming, `Cache-Control: no-store` and `Content-Disposition: inline` with a sanitised filename.
2. **Upload validation:** sniff magic bytes; allow only PDF, JPEG, PNG and WebP; cap at 10 MB; reject encrypted PDFs or PDFs containing JavaScript (or at least flag them); strip EXIF (GPS) from photos; store a sha256 to detect duplicate IDs across accounts, which is a fraud signal.
3. **PII at rest:** AES-256-GCM field encryption with a key-version prefix for rotation. Store `last4` only for display. **Never** log decrypted values; audit `before`/`after` payloads must use the masked form.
4. **PII in transit:** list endpoints return masked values. Unmasking requires `kyc_pii` and is audited per view.
5. **Authorisation:** subject-scoped access (a partner sees only their own case; gym staff get no KYC access at all), new ACL scopes, maker-checker on approvals and on settlement changes, and no self-review (reviewer ≠ subject, including through a multi-role identity with the same email or phone).
6. **Mass-assignment fixes:** F5 (owner gym update) and F8 (vendor profile merge) are live today and must be fixed as part of this work.
7. **Server-side enforcement** (F4). The mobile router is not a security boundary.
8. **Settlement-change fraud** (account-takeover redirect of payouts): new accounts start unverified; a cooling-off period (`cooldownUntil`, suggested 48 h); a notification on every channel to the partner when their account changes; payouts are held until verification.
9. **PDPA 2022:** consent capture at submission (text plus a timestamp); data-residency decision (D1); retention policy. Documents of rejected or closed partners are purged after N months, unless held for AML/tax. Account deletion (`account-service.deleteMyAccount`) must cascade to KYC data or anonymise it, while retaining what law requires.
10. **Audit integrity:** use `insertAsync` (awaited) for KYC events. Today most `auditLog.insert` calls are fire-and-forget.

## 18. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Server-side enforcement hides existing live trainers and gyms that are "approved" but have no documents | Supply drops and member-visible gaps | Grandfather them as legacy `approved`; hold **payouts**, not listings, after the grace period; ship enforcement behind `KYC_ENFORCEMENT=off\|warn\|on` |
| Enforcement rejects **currently pending** trainers who are live today (F4) | Some trainers vanish from the catalogue | Before enabling, list them and have ops fast-track them |
| Storage residency and PDPA (D1) unresolved | Blocks the document phase | Decide before P3; the design allows either option |
| Encryption key management (a key lost means documents lost) | Critical | Key in a secret manager, versioned, rotation spec, backup of the key |
| `KYC_ENCRYPTION_KEY` missing at deploy, while migrations run on `postinstall` | Deploy fails or plaintext is written | The backfill aborts cleanly without the key; a health check flags it |
| Multi-role identities (one person with owner and trainer rows) | Duplicate KYC and self-review loopholes | Link verifications by identity (`firebaseUid`/phone/email); reuse accepted NIDA documents across roles |
| Payout calculator divergence (F9) surfaces when payout gating is added | Disputes | Out of scope; record as business decision D5 |
| Parallel in-flight work: `fix/admin-route-acl-scopes` (unmerged); comms M3/M4 branches (unpushed); stale portal and mobile checkouts | Merge conflicts in `knex-store.mjs`, `services.mjs`, `portal-user-service.mjs`, `Shell.tsx` | Rebase after those land; use worktrees off `origin/main`; pick migration timestamps at merge time |
| Existing free-text bank and TIN data is wrong or incomplete | Backfilled accounts fail verification | It's imported as `pending_verification`; ops review it |
| NIDA or TRA API access not available | No automated validation | Manual review in v1; a provider interface (`IdentityProvider`) left as an inert seam, like the device-provider seam |
| Swahili strings increase the pending native-speaker review | Localisation debt | Batch the new keys into the existing Swahili review item |

## 19. Recommended implementation sequence

Each phase is one PR per repo, merged in order: functions, then portal, then mobile. Each lands behind `KYC_ENFORCEMENT` until P5.

| Phase | Content | Repos |
|---|---|---|
| **P0: Hardening, no new feature** | Fix F1/F2 (dead writes and the non-persisting toggle), F3 (trainer approval sync), F5 (owner gym mass-assignment), F8 (vendor profile whitelist). Add specs. These are live defects worth fixing even if KYC slips. | functions, portal (vendor toggle) |
| **P1: Domain core** | Migrations (3 tables plus the `GymPayout` generalisation), `verification-status.mjs`, requirement sets, `pii-crypto.mjs`, `partner-verification-service`, backfill, `/admin/role-approvals` shim, ACL scopes | functions |
| **P2: Private document storage** | `storage-client.mjs`, encrypted upload and authenticated download, validation, specs. **Needs D1.** | functions |
| **P3: Partner self-service** | `/me/verification*` and `/me/settlement-accounts*` APIs; mobile verification centre, document picker, settlement screen, status-aware pending screen | functions, mobile |
| **P4: Reviewer tooling** | Admin verification queue and case view, document viewer, settlement verification (maker-checker), audit timeline, site-visit capture; status columns on owners, trainers, vendors and corporate | functions, portal |
| **P5: Enforcement** | Listing and booking gates, pending gyms, product publish gate, corporate activation gate, payout holds on invoice pay; `KYC_ENFORCEMENT` `warn`, then `on` after the grace period; notifications | functions, portal, mobile |
| **P6: Lifecycle** | `kyc-expiry` job, reminders, auto-suspend, re-verification; trainer and vendor payouts written into the generalised payout table (statements, holds) | functions, portal, mobile |
| **P7: Corporate KYB and polish** | Corporate KYB documents (admin-assisted, and optional HR self-serve), HR status card, retention purge job, account-deletion cascade, Swahili review | all |

---

## READY FOR IMPLEMENTATION

**Open decisions to settle before or during the work:**

| ID | Decision | Needed by | Recommendation |
|---|---|---|---|
| D1 | Document storage: private Zebra access or a private GCS bucket (PDPA data residency); no encryption key, per the 26 Sep decision | P2 | Zebra behind an authenticated proxy, if it is hosted in Tanzania |
| D2 | Grandfathering: grace period, and what is blocked when it expires | P5 | 30 days, then hold payouts only |
| D3 | "Corporate partner" meaning: an employer that pays FitFlex (KYB only) or a reward-funding partner that FitFlex pays (KYB plus settlement) | P1 (requirement sets) | Employers need KYB only; add settlement only if partner-funded rewards are paid out |
| D4 | What the member-facing "Verified" badge means: profile complete or KYB-approved | P4 | Bind it to KYB and rename the auto flag "Profile complete" |
| D5 | Which payout calculator is canonical: streak rates or the 5-band engine (F9) | P6 | Business call, outside KYC |
| D6 | Document list per partner type (for example, is TMDA/TFDA registration needed for supplement vendors?) | P1 | Start from canon Tier 2/3; vendors = BRELA + TIN + licence + director NIDA |

**Sequence:**
1. **P0:** hardening fixes F1, F2, F3, F5, F8, with specs. Small, independent, safe to ship now.
2. **P1:** verification domain core: schema, state machine and requirements (in review as fitflex-functions#23); then backfill and the approval shim.
3. **P2:** private, access-controlled document storage (after D1).
4. **P3:** partner self-service: API plus the mobile verification centre and settlement account screen.
5. **P4:** reviewer tooling in the portal: queue, case view, settlement verification (maker-checker), audit timeline.
6. **P5:** server-side enforcement and payout holds, rolled out `off` → `warn` → `on`.
7. **P6:** expiry, reminders, re-verification; trainer and vendor payouts on the unified payout record.
8. **P7:** corporate KYB, retention and deletion, Swahili review.

**Ground rules for the build:**
- Work in worktrees cut from `origin/main`.
- Rebase after `fix/admin-route-acl-scopes` and the comms branches land.
- Extend `admin-approval-service`, `GymPayout`, `auditLog`, `notificationService` and the storage helpers rather than creating parallel versions.
