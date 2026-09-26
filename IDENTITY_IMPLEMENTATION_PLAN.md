# FitFlex Identity, Personas & Organisations — Implementation Plan

**Based on:** the read-only identity audit of `origin/main` in all three repos (26 Sep 2026, delivered in chat).
**Status:** Plan only. Nothing built. Decisions D1–D3 recorded 26 Sep 2026; open decisions O1–O7 are listed at the end.
**Repos:** `fitflex-functions` (backend, merged first), `fitflexmobile`, `fitflex-portal`.
**Release rule (existing):** every merge to `main` deploys. Backend PRs merge and are confirmed live before the mobile or portal PRs that call them.

---

## Decisions recorded (26 Sep 2026)

| # | Decision |
|---|---|
| D1 | Rows sharing an email **auto-link with no user prompt, but only on a verified sign-in**. When a person signs in with a verified email or phone, every persona row carrying that identifier joins their Person. No one is linked on an unverified string match. |
| D2 | **Gym → member:** the gym owner invites and the member must accept. **Corporate → employee:** HR adds a known person directly with no acceptance step. The person is notified and can leave the programme. |
| D3 | **Vendor becomes an organisation** with its own `Vendor` table. Owners and staff are memberships of it. |

## Audit facts this plan relies on

- A `User` row is **one person in one role** (a "persona row"). Uniqueness is `(firebaseUid|phone|email, userType)` (`db/migrations/20260904130000-*`, `20260922130000-*`).
- The JWT `sub` is that row's id. There are ~153 direct uses of `req.user.sub` and 216 `requireAuth(role)` guards.
- No Person, identifier, org-membership or invitation tables exist.
  - Owner→gym is `User.gymIds`.
  - Vendor→business is `User.vendorProfile`.
  - Staff ACL is per row, not per gym.
  - `CorporateEmployee.userId` is never written.
- History hangs off persona rows. Several tables cascade on delete (`Subscription`, `Checkin`, `PaymentRequest` and others). Trainer history is keyed by `TrainerProfile.id`, except `Goal.createdById`, `Challenge.createdBy` and `SocialGroup.createdBy`, which hold the trainer's `User.id`.
- Verification is never stored. `verifyFirebaseIdToken` drops `email_verified`, `phone_number` and the sign-in provider.
- The collection store filters `User` in JavaScript (`SELECT *`), so identifier lookups need indexed SQL.

## Guiding choices

1. **Add a Person above the existing rows. Never collapse them.**
   - Each existing `User` row becomes a persona of a `Person` through a new `User.personId` column.
   - No history table is rewritten, and no `User` row is deleted or merged anywhere in this programme.
2. **Keep `sub` = persona row id.** Tokens gain a `pid` (person id) claim. All existing `req.user.sub` code keeps working unchanged.
3. **Verified identifiers are the only linking key (D1).** `LoginIdentifier` is unique on `(type, value)` for verified values. Unverified values are stored but never link anything.
4. **One relationship table for every organisation.** `OrgMembership` covers gym, vendor and corporate.
   - Migration pattern: backfill, then dual-write, then switch reads, then remove the embedded columns.
   - Authorisation moves from "row carries `gymIds` and ACL" to "person has an active membership".
5. **Organisations never hold credentials.** Adding a person means looking them up, then inviting them (gym, vendor) or adding them directly (corporate, D2). Owner-set PINs and passwords are removed.
6. **New tables go through `collection()`** with `TABLE_MAP` and `ALLOWED_FIELDS` entries (`src/infra/knex-store.mjs`). Identifier and membership lookups use a small SQL query module on indexed columns, the same pattern as communications.
7. **Additive and flag-gated.** Everything up to I5 is behind `IDENTITY_V2` (backend env var) and is reversible because `personId` is nullable and the tables are new. Old app versions keep working until I8.

---

## I0 — Security hotfixes (backend, with small client follow-ups) — ship first

These are independent of the redesign.

| Fix | Change | Where |
|---|---|---|
| Unverified-email takeover | `verifyFirebaseIdToken` returns `emailVerified`, `phoneNumber`, `signInProvider`. `firebaseSession` matches rows **by email only when `emailVerified`**; otherwise by `firebaseUid` only. It returns `409 email_verification_required` when an unverified email would claim an existing uid-less row. | `src/auth/firebase.mjs`, `src/services/auth-service.mjs:117-203` |
| Password hashes sent to clients | Add a shared `toSessionUser(row)` that strips `passwordHash`, `pinHash` and internal fields. Use it in `/me`, `/auth/firebase/session`, `/auth/otp/verify`, and admin/owner list and detail responses. | `subscription-service.mjs:191`, `auth-service.mjs:73,202`, admin services |
| Plaintext trainer PINs | A migration re-hashes `demo:<PIN>` values to scrypt. `createTrainer` stores scrypt. Login stays blocked in production as it is today; I6 replaces the flow. | `owner-gym-service.mjs:175`, new migration |
| Shared Firebase user deleted | Staff and portal-user removal checks for another row with the same `firebaseUid` before `deleteUser`, as `account-service.mjs:32-35` already does. | `owner-staff-service.mjs:116-123`, `portal-user-service.mjs:123-130` |
| OTP endpoint | Return 404 for `/auth/otp/*` in production (no client uses it). Rewritten properly in I7. | `functions/auth.mjs:7-31` |
| Suspension ignored for 7 days | `requireAuth` checks `accountStatus` through `findByIdAsync` with a 30-second in-memory cache, and returns 401 or 403 for suspended or deleted rows. | `src/auth/jwt.mjs:17-28` |
| Case-sensitive email | Trim and lowercase on every email lookup and write. | `auth-service.mjs:79`, admin, owner, staff and member services |

**Clients:**
- Mobile and portal handle `email_verification_required` by calling Firebase `sendEmailVerification` and showing a "verify your email, then continue" screen.
- Remove the dead `email_already_used_for_different_role` handling (`fitflexmobile/lib/screens/*`, `fitflex-portal/app/login/page.tsx:30`).

**Tests:** specs for each fix under `specs/`, including an unverified-email claim attempt and a shared-uid staff removal.

## I1 — Person and identifier foundation (backend, no behaviour change)

**Migration `2026101x-identity-foundation.cjs`:**

| Table / column | Key columns | Constraints |
|---|---|---|
| `Person` | id (`psn_…`), displayName, status (active/suspended/closed), mergedIntoId, createdAt, updatedAt | |
| `LoginIdentifier` | id, personId → Person, type (email/phone/firebase_uid), value (normalised), verifiedAt, verificationSource (firebase_email/firebase_phone/google/otp/backfill), isRecovery, createdAt | **unique (type, value) where verifiedAt not null**; idx (type, value); idx (personId) |
| `User` (alter) | + personId → Person (nullable, indexed), + publicId (text, unique) | |
| `IdentityConflict` | id, personIds[], reason, identifier, status (open/resolved), resolvedBy, createdAt | Admin review queue for cases that must not auto-merge |

**Code:**
- `src/shared/identifiers.mjs`: `normalizeEmail` and `normalizePhone` (E.164, default +255). Replaces the local WhatsApp normaliser, which reads a field that doesn't exist (`whatsapp-service.mjs:26-32,89`).
- `identity-service`: `ensurePerson(userRow)`, `findPersonByIdentifier`, `attachIdentifier`, `linkRowsByVerifiedIdentifier(person, type, value)`, `mergePersons(a, b)`.
  - `mergePersons` only updates `personId` on rows and identifiers and sets `mergedIntoId`. It never touches history.
- Every User-creation path (the 14 in the audit) calls `ensurePerson`.

**Freeze public IDs.** Store today's computed `FM/FT/FO` code in `User.publicId`, and have `publicUserId` read the stored value. This stops later changes renumbering everyone's displayed ID (`identity-service.mjs:17-29`).

**Backfill script `scripts/backfill-identity.mjs`** (dry run by default; prints a report):
1. Group rows by `firebaseUid`. One Person per group, plus a verified `firebase_uid` identifier.
2. For each uid, call Firebase Admin `getUser`. Mark the email verified if `emailVerified` is true or the provider is Google, and the phone verified if `phoneNumber` is set. Link other rows carrying that verified email or phone (D1).
3. Rows with no uid each get their own Person, with **unverified** email and phone identifiers. They link on the person's first verified sign-in (I2).
4. A collision that would give one Person two personas of the same `userType` is **not** merged; it becomes an `IdentityConflict` row instead. The composite unique index makes this rare, since two rows can only collide when they were linked through different identifiers.

## I2 — Verified sign-in linking and person-aware sessions

**Backend:**
- `firebaseSession` resolves in this order:
  1. the `firebase_uid` identifier
  2. a verified email or phone identifier
  3. existing rows with a matching verified value
  4. a new Person
- On every verified sign-in, run `linkRowsByVerifiedIdentifier` (D1). This is how the uid-less rows created by admins or owners join the person.
- The response adds `person` and `personas[]` (id, userType, approvalStatus, onboardingCompleted). `user` stays the active persona for old clients.
- The active persona is the requested role if given, otherwise the last used (`Person.lastPersonaId`), otherwise the single non-member persona, otherwise the member persona. `profile_role_required` is kept for old clients.
- The JWT adds `pid`. `sub` is unchanged.
- New endpoints:
  - `GET /me/personas`
  - `POST /auth/switch-persona {personaId}`: checks `personaId.personId === pid` and approval status, then mints a new token. No Firebase round trip.

**Mobile:**
- `AuthState` gains `person`, `personas` and `activePersonaId`, and `switchPersona()`.
- `routeForSignedInUser` routes on the active persona.
- Add a persona picker when several personas exist and none was remembered (replaces the auto-pick in `auth_state.dart:144-156`).
- Add a "Switch role" entry in each shell's profile tab (member, trainer, owner, vendor).
- On switch, re-register the push token (`DeviceToken.userId` is per persona row).

**Portal:**
- `providers.tsx` stores personas.
- `Shell.tsx` gets a role switcher.
- `login/page.tsx` stops hard-coding `requestedRole: 'admin'` and uses the returned active persona.

## I3 — Add a persona while signed in

**Backend:**
- `POST /me/personas {userType}` for member, trainer, gym_operator and vendor.
  - It creates a `User` row with the caller's `personId`, verified email and phone, and display name. `approvalStatus` follows `approvalStatusForRole`.
  - The caller then switches to it.
  - Org-scoped roles (gym_staff, vendor_staff, corporate_hr, admin) are refused; those come only through memberships (I4–I6).
- Existing registration endpoints (`/trainer/register`, `/gym-owner/register`, vendor profile) work unchanged under the new persona's token.

**Mobile:**
- "Become a trainer", "Register a gym" and "Open a store" entries lead to the existing registration and onboarding pages.
- `role_screen.dart` stays as the first-persona picker at sign-up and no longer offers `gym_staff` for self sign-up.
- The Firebase account is reused, so the email + PIN `email-already-in-use` dead end goes away.

## I4 — Organisation model: `Vendor` and `OrgMembership` (backfill and dual-write)

**Migration `2026101x-org-memberships.cjs`:**

| Table | Key columns | Constraints |
|---|---|---|
| `Vendor` (D3) | id (**reuses the vendor's current `User.id`**, so `Product.vendorId`, `MarketplaceEnquiry.vendorId` and vendor notifications need no rewrite), name, logo, banner, description, category, contactNumber, email, address, deliveryRegions, businessHours, settlementAccount, status, approvalStatus, createdAt, updatedAt | |
| `OrgMembership` | id, personId → Person, orgType (gym/vendor/corporate), orgId, role (owner/staff/trainer/member/hr_admin/employee), status (requested/invited/active/declined/left/removed/suspended), aclPermissions text[], source (backfill/invite/direct_add/application/self), invitedBy, startedAt, endedAt, createdAt, updatedAt | **unique (orgType, orgId, personId, role) where status in (requested, invited, active)**; idx (personId, status); idx (orgType, orgId, role, status) |

**Backfill** (a script with dry run, like I1):

| Source | Membership |
|---|---|
| `User(gym_operator).gymIds` / `gymId` | gym · owner · active |
| `User(gym_staff).gymIds` + `aclPermissions` | gym · staff · active (ACL copied into each membership) |
| `TrainerProfileGym` | gym · trainer · active |
| `TrainerProfile.pendingGymIds` | gym · trainer · requested |
| Latest active `direct_sub` per `homeGymId` | gym · member · active (platform-pass members are not gym members) |
| `User(vendor)` + `vendorProfile` | a `Vendor` row, plus vendor · owner · active |
| `User(vendor_staff).vendorId` + `vendorPermissions` | vendor · staff · active |
| `User(corporate_hr).corporateId` | corporate · hr_admin · active |
| `CorporateEmployee` | corporate · employee · active where the email or phone matches a **verified** identifier. Otherwise it stays as a claimable record that activates when that identifier is verified (I6). |

**Dual-write:** every writer of `gymIds`, `TrainerProfileGym`, `pendingGymIds`, `vendorId`, `vendorProfile` and `corporateId` also writes the membership or `Vendor` row. `shop-service` reads the store profile from `Vendor`, falling back to `vendorProfile` until I8.

## I5 — Switch reads: authorisation from memberships

**Backend:**
- `operatorGymIds`, `requireGymAcl`, owner and staff list queries, `invoice-service.mjs:18` and `finance-service.mjs:235` read active memberships. That makes co-owners possible.
- The ACL check becomes per membership, per gym.
- Org context comes from the request (`gymId`, `vendorId` or `corporateId` in the path or body), checked against the caller's memberships (cached), not from token claims.
- Vendor staff permissions come from the vendor membership. The same person can then be staff at two vendors, which the index blocks today.
- Gym-level member suspension sets the **membership** status, not the platform-wide `User.accountStatus` (`member-management-service.mjs:587-588`). See O6.

**Portal:**
- `owner/manage/page.tsx` gets a gym selector instead of `gyms[0]`.
- `scan` and `checkins` send `gymId`.
- The HR area reads company context from the membership.

**Mobile:**
- The owner `activeGymId` comes from memberships.
- Add an organisation switcher in `ff_owner_dashboard_bar.dart`.
- Replace the first-gym defaults (`add_member_sheet.dart:47`, `owner_checkins_page.dart:67`, `owner_qr_scanner_page.dart:48,90`).

## I6 — Invitations and direct adds

**Migration:** `Invitation`: id, orgType, orgId, role, targetPersonId (nullable), targetIdentifierType, targetIdentifierValue (normalised), tokenHash, status (pending/accepted/declined/expired/revoked), payload jsonb (for example a desk-sale plan), message, invitedBy, expiresAt, respondedAt, createdAt. Indexes on (targetPersonId, status) and (targetIdentifierType, targetIdentifierValue, status).

**Lookup:**
- `POST /orgs/:orgType/:orgId/people/lookup {phone|email}` matches **verified** identifiers only.
- It returns `{found, maskedName}` and nothing more.
- Rate-limited and written to the audit log.

**Flows:**

| Flow | Behaviour |
|---|---|
| Gym invites a member (D2) | Lookup, then an `Invitation` plus a membership with status `invited`. The member accepts or declines in the app, and the membership becomes `active` or `declined`. A desk-sale subscription follows O2. |
| Gym invites a trainer or staff member | Same invite and accept flow (O5). Replaces owner-set PINs (`owner-gym-service.mjs:152-184`, `owner-staff-service.mjs:28-85`). The trainer→gym application flow stays as the reverse direction (`requested` → owner decides). `syncTrainersForGym` stops attaching trainers without consent. |
| Vendor invites staff | Invite and accept. Replaces `shop-service.mjs:330-338` passwords. |
| Corporate adds an employee (D2) | Direct add: the membership is `active` immediately, the person gets a notification with a "Leave programme" action (membership → `left`). An unknown identifier becomes a claimable record that activates on the person's first verified sign-in with that identifier, still with no acceptance step. Retire the `CorporateEmployee` PIN. |
| Admin adds an HR admin | Invite and accept for `corporate · hr_admin`, replacing the scrypt password created by the admin (`corporate-service.mjs:440-460`). |
| Unknown identifier (gym/vendor) | The invite is delivered by SMS, WhatsApp or email through the existing communication channel adapters, and claimed on sign-up with that verified identifier. |

**Credentials removed:** `initialPassword` and `initialPin` are dropped from `/owner/members`, `/owner/staff` and `/owner/trainers`, and `password` from `/vendor/staff`. Old clients get `400 credentials_not_accepted` with an upgrade message.

**Mobile:**
- An invitations list in the existing inbox, with an accept/decline sheet.
- `add_member_sheet.dart` (both), `staff_form_page.dart`, `trainer_form_page.dart` and vendor staff creation become "look up, then invite".
- A corporate programme card with "Leave".

**Portal:**
- `owner/manage` member, staff and trainer forms become look up, then invite.
- `admin/corporate` HR creation becomes an invite.
- A new HR "Employees" page for direct add (the backend endpoint exists; the portal has no screen).
- `searchable-select.tsx` is reused for pickers.

## I7 — Identifier management and recovery

- **Add or verify a phone:** Firebase phone auth `linkWithCredential` on mobile, then `POST /me/identifiers/verify` with an ID token carrying `phone_number`. The alternative is backend OTP over Africa's Talking or WhatsApp (O4).
- **Verify an email:** Firebase `sendEmailVerification`, then the same endpoint.
- **Change an email or phone:** verify the new value, then swap the identifier, then Firebase Admin `updateUser`, then refresh the display copies on all of the person's rows. `POST /me/profile` stops accepting `email` and `phone` (`account-service.mjs:65-67`).
- **Phone login:** the "email or phone" field on `auth_screen.dart` goes to Firebase phone auth when a phone is entered. That fixes the phone-as-email bug (`email_auth_screen.dart:82-92`).
- **Forgot PIN:** verify any verified identifier (email link or phone code), then `POST /auth/pin/reset` sets `fitflex-pin:<newPin>` through Admin `updateUser`. The PIN-as-password scheme means a plain Firebase reset page can't be used. This wires up the empty handler at `email_auth_screen.dart:234-243` and gives change-PIN to every persona, not only members.
- **Account recovery:** sign in with any other verified identifier. `firebase_uid` is not required.

## I8 — Cleanup (after I5–I7 have been live at least two weeks)

- Remove the `resolveRequestUser` email/phone fallbacks (`identity-service.mjs:6-15`).
- Drop `User.gymId`, `gymIds`, `vendorId`, `vendorRole`, `vendorPermissions`, `vendorProfile` and `corporateId`, plus the dual-writes.
- Move HR and vendor staff to Firebase sign-in, remove the production `/auth/login` path (`auth-service.mjs:76-115`), and delete the remaining `demo:` and scrypt hashes.
- Decide whether `User.email` and `User.phone` stay as display copies or are read from `LoginIdentifier`. The `(col, userType)` indexes go once identifiers are authoritative.
- Remove `profile_role_required` once old app versions age out, based on a minimum-version check.
- Only then consider merging persona rows. That is not part of this programme.

---

## Pull-request slicing (per repo, in order)

| Step | fitflex-functions | fitflexmobile | fitflex-portal |
|---|---|---|---|
| I0 | security hotfixes | verify-email screen, dead-code removal | verify-email handling, dead-code removal |
| I1 | identity foundation + public-ID freeze + backfill script | — | — |
| I2 | linking, personas, switch endpoint | persona state, picker, switcher | role switcher, drop hard-coded admin role |
| I3 | `POST /me/personas` | add-persona entries | — |
| I4 | Vendor + OrgMembership, backfill, dual-write | — | — |
| I5 | membership-based auth | org switcher, first-gym defaults | gym selector, scan/check-in gymId |
| I6 | invitations, lookup, direct add, credential removal | invitations inbox, look-up-then-invite forms | invite forms, HR employees page |
| I7 | identifier verify/change, PIN reset | phone login, forgot PIN, change PIN everywhere | forgot password |
| I8 | cleanup | old-path removal | old-path removal |

Backfill scripts run with a dry-run report reviewed before each real run.

## Migration safety

- **No `User` row is ever deleted or merged.** Cascade deletes on history (`Subscription`, `Checkin`, `PaymentRequest` and others) can't fire.
- Person merges only rewrite `personId` and `mergedIntoId`. Both are reversible from the audit log.
- Unique-review collisions (two members reviewing the same gym) can't happen because member rows are never combined.
- Freezing public IDs before any linking keeps QR codes and support references stable.
- `Vendor.id` reuses the vendor's `User.id`, so product, enquiry and order links stay intact.
- The trainer ID split (`TrainerProfile.id` vs trainer `User.id` in three `createdBy` columns) is untouched, because rows aren't merged.
- Rollback before I8: turn off `IDENTITY_V2`. The new tables and `personId` are simply ignored.

## Open decisions

| # | Question | Default if not decided |
|---|---|---|
| O1 | Partner KYC subject: the organisation (gym, vendor) or the person? `PartnerKycCase.userId` points at a persona row today, and KYC D1/D3–D6 are still open. | Move vendor and gym KYC to the organisation; trainer KYC stays per person |
| O2 | Walk-in desk sale: does a gym-sold subscription start at payment or only when the member accepts the invite? | Starts at payment and is attached to the invite; moves to the person on acceptance |
| O3 | Corporate direct add: what can HR see about an employee (participation only, or activity data)? Tanzania PDPA 2022 consent wording | Participation in company challenges and groups only; activity data needs an explicit opt-in |
| O4 | Phone verification: Firebase phone auth or backend OTP via Africa's Talking or WhatsApp? | Firebase phone auth (no SMS code to build); revisit on cost |
| O5 | Do gym trainers, gym staff and vendor staff also have to accept invites? | Yes |
| O6 | Does a gym suspending a member become membership-level only (the member can still use other gyms)? | Yes |
| O7 | Existing uid-less rows (admin-created owners, HR admins): is the "verify your email to continue" step in I0 acceptable for them? | Yes |
