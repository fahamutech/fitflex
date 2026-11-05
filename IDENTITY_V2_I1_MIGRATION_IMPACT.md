# Identity V2 · I1 — Migration-impact report

**Written before any I1 schema change**, against `fitflex-functions` `main` 1faa02e (30 Sep 2026). Decisions and invariants: `IDENTITY_V2_DECISIONS_AND_STATUS.md`.

## 1. What exists today (verified in code)

| Area | Finding | Evidence |
|---|---|---|
| `User` schema | `id` text PK (`usr_` + 8 hex), `firebaseUid`, `phone`, `email`, `userType` (free text), `accountStatus`, `approvalStatus`, `passwordHash`, `gymId`/`gymIds`, `vendor*`, `corporateId`, jsonb `memberProfile`/`vendorProfile`, `createdAt`, `updatedAt` (NOT NULL). There is no verification column that anything reads. | `db/migrations/20260805120000_init_schema.cjs`, `…marketplace-requirements`, `…corporate-wellness` |
| Uniqueness | Partial unique `(firebaseUid, userType)`, `(phone, userType)`, `(email, userType)`, each `WHERE col IS NOT NULL`. So an identifier is unique **per persona**, not per person. | `pg_indexes` on the CI DB; migrations `20260904130000`, `20260922130000` |
| ID convention | Text IDs with a type prefix and a UUID fragment (`usr_`, `trn_`, `sub_`…). Timestamps are `createdAt`/`updatedAt`. Enums are lower-snake text checked in code. Status is a text column (`accountStatus`). | services, migrations |
| Writes to `User` | 11 service/route files, 22 call sites (auth, account, admin member/owner, corporate HR, owner member/trainer/staff, portal users, vendor staff/profile, owner-gym auto-provision); plus `src/infra/seed-db.mjs` and test fixtures inserting through `db('User')`. The store's column allow-list drops unknown keys, and upsert merges only the columns supplied. | `grep users.(insert\|upsert)Async`, `src/infra/knex-store.mjs:257-283,567` |
| Sign-in | `POST /auth/firebase/session` matches `firebaseUid`, or an email only when Firebase says it is verified (I0). `/auth/login` (scrypt roles) matches email. `/auth/otp/*` is closed in production (I0). | `src/services/auth-service.mjs` |
| Firebase verification | The token gives `emailVerified`, `phoneNumber` and `signInProvider` (I0). **The database stores none of these today.** | `src/auth/firebase.mjs` |
| JWT | `sub` = `User.id`, plus `userType` and org claims. `requireAuth` verifies the token and checks the row's `accountStatus` (I0). | `src/auth/jwt.mjs` |
| Public IDs | Computed on every call from the row's position within its `userType`, ordered by `createdAt`. Owners search members by them. Deleting a row renumbers every later row. | `src/services/identity-service.mjs:17-29`, `member-management-service.mjs:312` |
| Triggers | Already used for integrity (append-only KYC events). | `20261010090000-partner-kyc.cjs:313-321` |
| Feature flags | No flag module exists. | grep |

## 2. What the database can prove about existing rows

| Evidence | Available in the database? | I1 treatment |
|---|---|---|
| `firebaseUid` | Yes | A **verified** `firebase_uid` identifier. All rows sharing a uid are one Firebase account, so one Person (strong evidence). |
| Email verified | **No.** Only Firebase knows. | Stored **unverified** by the migration. A separate script asks Firebase Admin and marks an email verified only where Firebase confirms it (`emailVerified` or a Google provider) and it matches. |
| Phone verified | **No.** | Stored **unverified**. The script marks it verified only where Firebase's `phoneNumber` equals the normalised row phone. |
| Rows without a uid | Staff-created members, owners, HR and vendor staff | Each gets **its own Person**. There is no merge on a shared email or phone. I2 links them on a verified sign-in (D1). |

## 3. Plan and why it is safe

1. **Migration `20261030090000-identity-foundation`**
   - **Additive only:** new tables `Person`, `LoginIdentifier` and `IdentityConflict`; new nullable columns `User.personId` (FK) and `User.publicId`.
   - **Offline backfill:** pure database work with no network calls:
     - one Person per `firebaseUid` group, or per uid-less row;
     - `firebase_uid` identifiers are verified; email and phone identifiers are unverified;
     - today's computed public IDs are frozen into `User.publicId`.
   - **Idempotent:** rows that already have a `personId` are skipped, and identifier upserts use natural keys.
   - **No existing ID or history row is touched.**
2. **Trigger `user_person_guard`**
   - `BEFORE INSERT` gives every new `User` row a Person. That covers all 11 service files, the seed and the fixtures without editing each creation path.
   - `BEFORE UPDATE` stops `personId` being cleared or reassigned by an ordinary write.
   - `personId` and `publicId` stay **out of the store's allow-list**, so no application write can change them in I1.
3. **Script `scripts/identity-verify-backfill.mjs`**
   - Dry run by default: a report with counts only.
   - `--apply` marks identifiers verified from Firebase Admin data.
   - A verified email or phone claimed by more than one Person becomes an `IdentityConflict` and is **not** assigned to anyone.
   - Unverified overlaps are reported as possible duplicates only.
4. **Flags:** `IDENTITY_V2` + `V2_FOUNDATION` gate the only read change in I1: `publicUserId` preferring the frozen value. Both are off by default.
5. **No sign-in, JWT or response change.** `sub` is unchanged and no `pid` claim is added (I2). `personId` is removed from API responses so legacy clients see nothing new.

## 4. Risks

| Risk | Mitigation |
|---|---|
| The migration runs automatically on deploy | It is additive and offline, with no Firebase calls. The trigger and backfill are tested on a fresh DB and on a re-run. |
| The trigger adds work to every `User` insert | One extra small insert. No trigger on read paths. |
| Public ID freeze drift: rows created after I1 still get computed IDs | Unchanged from today. The flag keeps the old behaviour until enabled. Assigning public IDs at creation is left to I2. |
| Rows created after I1 get a Person but only unverified email and phone identifiers until the script re-runs | By design. I2 writes identifiers at sign-in. The script is re-runnable. |
| Rollback | `down()` drops the trigger, columns and tables. Nothing reads them in I1, and no existing data was modified apart from the new columns. |
