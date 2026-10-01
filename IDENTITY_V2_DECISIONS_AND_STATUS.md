# FitFlex Identity V2 — Decisions, Contract & Status (handoff)

**Read this first if you are picking up Identity V2.** It records what was decided, what is locked, what is done, and what blocks the next step. The phase-by-phase plan is `IDENTITY_IMPLEMENTATION_PLAN.md`. Where the two differ, **this file wins**: it records the final decisions of 26–27 Sep 2026, made after the plan was written.

**Last updated:** 28 Sep 2026
**Tracking:** plan PR fahamutech/fitflex#9 · I0 **merged and live 28 Sep 2026**: backend fahamutech/fitflex-functions#34 (cf4b6a6), mobile fahamutech/fitflex-mobile#29 (0e3c012), portal fahamutech/fitflex-portal#15 (f6246a3)

---

## 1. The problem in one paragraph

FitFlex has no concept of a *person*. A `User` row is one person **in one role**: uniqueness is `(firebaseUid | phone | email, userType)` (`fitflex-functions` migrations `20260904130000`, `20260922130000`). Someone who is both a member and a trainer has two unrelated rows that are matched only by a shared Firebase uid or email at sign-in. There are no person, identifier, org-membership or invitation tables.
- Owner→gym is stored in `User.gymIds`.
- A vendor's store *is* its `User` row (`vendorProfile`); there is no Vendor table.
- Corporate employees (`CorporateEmployee`) are never linked to a user.

Every "add a person" flow (owner adds a member, trainer or staff; HR adds an employee; admin adds users) creates a new row and sets the person's credentials. That breaks the core principles below and produces duplicate accounts. The read-only audit also found security issues; I0 fixes them.

## 2. Core principles (binding) — P1–P8

1. One person = one FitFlex identity.
2. Mobile and email are **identifiers**, not the user ID; either verified identifier can be used to sign in.
3. One identity can hold many personas (member, trainer, gym owner, vendor).
4. One identity can hold many organisation relationships.
5. **Organisations never own identities**, credentials, phone, email or sign-in methods. They manage only the relationship.
6. Existing users are reused through invitation or relationship, never duplicated.
7. History stays attached to the same IDs.
8. Nothing working breaks. Changes are incremental, backward compatible, verified against current code first, and regression-tested.

## 3. Target model (architecture contract)

```text
Person (psn_…, permanent)
 ├── LoginIdentifier  (email | phone | firebase_uid; verifiedAt; revokedAt)
 ├── User rows = personas (existing ids unchanged; userType = persona; history stays here)
 └── OrgMembership    (gym | vendor | corporate; role; status; ACL)
Invitation (org, role, target person or identifier, tokenHash, status)
```

- **JWT:** `sub` stays the existing `User.id` (the persona). Add `pid` (Person id) and `ver: 2`. Never bulk-switch `req.user.sub` (~153 uses) or the ~216 `requireAuth(role)` guards; migrate them one at a time with tests.
- **Personas:** `member`, `trainer`, `gym_operator`, `vendor`. The legacy rows `gym_staff`, `vendor_staff` and `corporate_hr` are organisation roles and are created only through memberships. `admin` stays a platform role.
- **Membership roles:** gym → owner, staff, trainer, member · vendor → owner, staff · corporate → hr_admin, employee.
- **Membership statuses:** requested, invited, active, declined, left, removed, suspended.
- **Invitation states:** pending → claimed → accepted | declined | expired | cancelled.
- **Linking rules:** automatic **only** on a verified identifier, and only for rows whose `firebaseUid` is null or the same uid. These cases create an `IdentityConflict` for admin review and are never merged silently:
  - a different non-null uid on a row with the same email or phone
  - the identifier is already verified on another Person
  - linking would give one Person two personas of the same `userType`

  Every link or merge writes an `IdentityEvent` (previous `personId` per row), so it can be reversed.
- **Vendor:** `Vendor.id` = the existing vendor `User.id`, so `Product.vendorId`, `MarketplaceEnquiry.vendorId` and `MarketplaceNotification.userId` stay valid.
- **Trainer history:** keyed by `TrainerProfile.id`; unchanged.
- **Phase order:** I0 → I1 → I2 → I3 → I4 → I5 → **I6a (identifier verification)** → I6 (invitations) → I7 (change/recovery) → I8 (cleanup). I6a was split out of I7 because invitations, lookups and corporate direct-adds depend on verified identifiers.
- **Feature flags (approved, C2):** umbrella `IDENTITY_V2` over `V2_FOUNDATION`, `V2_LINKING`, `V2_PERSONAS`, `V2_ADD_PERSONA`, `V2_ORG_WRITE`, `V2_ORG_AUTHZ`, `V2_IDENTIFIERS`, `V2_INVITES`, `V2_RECOVERY`. Security fixes and new-table writes are **not** flagged; reads and behaviour changes are.
- **Old clients (approved, C3b):** V2-aware clients send `X-FitFlex-Client: identity-v2`. Clients without it keep legacy role resolution and the legacy `user` object, and never see a new `409 profile_role_required`.

## 4. Final decision register (approved 26–27 Sep 2026)

| ID | Decision |
|---|---|
| O1 | KYC is **organisation-based for gyms and vendors**, **person-based for trainers**. Existing KYC history stays readable; vendor IDs stay stable. |
| O2 | Walk-in desk sale: desk payment → invitation (plan + payment reference attached) → person accepts → subscription created with `startedAt` = payment date. No check-in before acceptance. The refund/expiry policy for unaccepted invitations is still to be written. |
| O3 | HR sees relationship and participation data only: name, the identifier HR entered, department, membership status, joined programme challenges and groups. Steps, runs, workouts, goals, check-ins, activity and body metrics need explicit employee consent. HR never sees the person's other identifiers, gyms, personas or memberships. |
| O4 | **Firebase Phone Authentication** for phone login, add, change and recovery (`linkWithCredential`). No new backend OTP/SMS system. E.164 with a +255 default; the shared normaliser must handle `0712…`, `712…` and `+255712…`. The current normaliser (`whatsapp-service.mjs`) turns `712…` into `+712…`; that is a bug to fix. |
| O5 | Trainers and staff invited by gyms or vendors **must accept**. |
| O6 | Suspension is **membership-level**. Only an explicit FitFlex-level Person suspension suspends the whole identity. |
| O7 | A uid-less row matched by email needs a **verified email** before it can be claimed. The backend returns `409 email_verification_required`; mobile and portal must provide the verification flow. |
| O8 | "Delete account" from a persona context closes **that persona**, not the Person. History and counterparty records are kept; soft close only; Firebase deleted only when no live persona needs it; no blanket anonymisation in I3; grace period 30–90 days (**exact value not yet approved; don't hard-code it**). **See open item B1 below: Google Play conflict.** |
| C2 | Phase sub-flags approved (above). |
| C3a/b | JWT `sub`/`pid`/`ver` and the old-client header rule approved (above). |

**Out of scope unless separately approved:** co-owned gyms, second or co-owned vendor stores, Apple sign-in, new corporate data-sharing models, new KYC models beyond O1, new payment models beyond O2, new OTP infrastructure, bulk persona merging.

**Decisions an implementer must not make alone** (stop and ask): KYC ownership, deletion and retention, corporate data visibility, phone provider, walk-in semantics, invitation acceptance policy, pricing, compliance, customer communication, merging a disputed identity, any production Firebase configuration change.

## 5. Locked invariants (short form)

1. One human = one Person, whose ID never changes and is never reused.
2. Every persona row has exactly one Person.
3. Existing `User`, `TrainerProfile`, `Gym`, `CorporateAccount`, `CorporateEmployee` and vendor IDs never change, and history stays on them.
4. `sub` = persona, `pid` = Person.
5. Only verified, non-revoked identifiers authenticate or link. A verified value belongs to one Person. Unverified values never auto-link.
6. Conflicts are never auto-merged. Merges are audited and reversible.
7. Organisations never hold credentials or change identifiers.
8. Memberships and personas are never hard-deleted.
9. Invitation tokens grant nothing on their own. Accepting requires an authenticated owner of the target.
10. From I5, organisation authority comes from active memberships, not JWT ACL claims.
11. At most one live persona per (Person, userType). Public IDs are stored and frozen before linking.
12. No second or co-owned store until vendor authorisation is membership-based.
13. Nothing destructive before I8.
14. Membership or persona suspension never suspends the Person.

## 6. Status

| Phase / item | State |
|---|---|
| Audit, plan, architecture gate, decision lock | Done (this PR) |
| **I0 backend** | **Live** (functions#34, merge cf4b6a6, 28 Sep). Confirmed on the live API: `/auth/otp/*` → 404, `/me` without a token → 401, a bad Firebase token → 401, health 200. The rehash migration ran on deploy **without a production dry run** (waived by the product owner). |
| **I0 mobile** | **Live** (mobile#29, 0e3c012). The web deploy serves the verify-email route; the Android tester APK is distributed from the same merge. |
| **I0 portal** | **Live** (portal#15, f6246a3). The live login bundle contains the verify step. |
| **I1 foundation** | **Merged 30 Sep** (fahamutech/fitflex-functions#48, merge 1b92f4c; rebased onto main aecd43f, 1001/1001 specs, CI pass). After the redeploy the live API is healthy (health 200, `/me` 401). **The migration run is not confirmed from outside:** check the production database (step below). Reconcile script not yet run on production. |
| **I2 backend** | **Live** (fahamutech/fitflex-functions#51, merge e2a3562, 30 Sep). Confirmed on the live API: `POST /auth/switch-persona` → 401 without a token. Dormant: `V2_LINKING` / `V2_PERSONAS` are off. |
| **I2 mobile** | **Live** (fahamutech/fitflex-mobile#41, merge 9f0c888): web and the Android tester APK deployed; the live bundle has the switch-persona call and the V2 header. Dormant until `V2_PERSONAS` is on. |
| **I2 portal** | **Live** (fahamutech/fitflex-portal#25, merge 828f014): the live bundle has the switcher. Dormant until `V2_PERSONAS` is on. |
| **I3 backend** | **Merged 1 Oct** (fahamutech/fitflex-functions#53, merge 11910ea): `POST /me/personas`, `addablePersonaTypes`, unique index on `User (personId, userType)`. The API was healthy after the redeploy; the new route can't be probed without a token (the `/me` guard answers 401 either way). Dormant: `V2_ADD_PERSONA` is off. |
| **I3 mobile** | **Merged 1 Oct** (fahamutech/fitflex-mobile#42, merge 5f1a535): "Add a role" in the role sheet. Dormant until the flag is on. |
| I3 portal | Not needed: the addable personas are app personas. |
| **I4** | **Merged 1 Oct** (fahamutech/fitflex-functions#57, merge 2e8c21b); the live API was healthy after the redeploy (one 502 during the restart). The migration and its backfill are **not confirmed from outside**: run `node scripts/org-membership-sync.mjs` on production (dry run; drift should be 0). `OrgMembership` (gym, vendor) and a thin `Vendor` (id = vendor `User.id`); memberships derived from the existing sources, kept in step by hooks on the users / trainers / subscriptions collections; drift check `scripts/org-membership-sync.mjs`; `GET /me/memberships` behind `V2_ORG_WRITE`. No authorisation change. 1145/1145. **Decisions 1 Oct:** corporate relationships stay in the B2B tables and are read, not copied; the Vendor record is thin (store profile stays on the User row). Gym-scoped member suspension already landed in functions#47 (it pauses the subscription); I4 mirrors it as a `suspended` membership. |
| **I5 (first slice)** | **Live 1 Oct** (fahamutech/fitflex-functions#58, merge 62b7d17; confirmed: `GET /admin/identity/org-authz` went 404 → 401 without a token). Mode is **off**, so legacy rules still decide everywhere. Compatibility layer `src/auth/org-authz.mjs` with modes off / shadow / enforce (`V2_ORG_AUTHZ` unset / `shadow` / `true`); 14 routes migrated (staff administration, member management); everything else still legacy. Per-endpoint OLD / NEW / STATUS: `IDENTITY_AUTHZ_MIGRATION.md` in fitflex-functions. `GET /admin/identity/org-authz` reports shadow mismatches. 1156/1156. **Rollout:** merge → confirm I4 drift 0 on production → shadow → enforce. Remaining groups (check-in desk, gym/trainer/payment management, communications, vendor) migrate one at a time after a clean shadow run. |
| **I6 slice A** | **Live 1 Oct** (fahamutech/fitflex-functions#60, merge 682910f; probe `POST /orgs/gym/x/people/lookup` 404 → 401), dormant behind `V2_INVITES`. `Invitation` + `OrgLookupLog`; privacy-preserving lookup with rate limits; gym owners invite **staff and trainers**; accept / decline / claim by verified identifier; legacy `POST /owner/staff` and `/owner/trainers` refuse credentials when `V2_INVITES` is on. 1167/1167. **Decisions 1 Oct:** limits = 14-day expiry, 3 resends (1 per 24 h), lookups 30/h per person and 200/day per organisation, 15-minute pause after 10 misses; an unaccepted paid desk-sale invitation is held and flagged to the gym (no automatic refund); corporate direct-add is out of I6 (the B2B module owns it). |
| **I6 slice B** | **Live 1 Oct** (fahamutech/fitflex-functions#61, merge 70c7f15), dormant behind `V2_INVITES`. Member invitations and the desk sale (O2): plan and desk payment ride in `Invitation.payload`; subscription and payment are created on acceptance, dated from the payment date; owners and members-scope staff invite members; a paid invitation that expires unaccepted is flagged (`needsResolution`) and resolved by re-issue or a recorded refund; `POST /owner/members` answers `use_invitation` when the flag is on. No schema change. 1175/1175. |
| **I6 slice D** | **Live 1 Oct** (fahamutech/fitflex-mobile#44, merge 44caaf5; fahamutech/fitflex-portal#28, merge 27bda58; both web deploys succeeded and the live bundles contain the invitation calls), dormant while `V2_INVITES` is off. App: invitations inbox (profile tile, `/invitations?token=…`), accept / decline, and invite sheets for members, staff and trainers plus an "Invitations sent" page. Portal: `/owner/manage` invites members (single and bulk), staff and trainers and lists invitations sent (new link, cancel, send again, refunded). Both detect the flag from `GET /me/invitations` (404 = off) and keep the legacy forms while it is off. Mobile 519/519; portal e2e `gym-invitations` 4/4. The invited person answers in the app only. Known gap: a signed-out person who opens an invitation link loses the token on sign-in. |
| **I6 slice C** | **Built (backend):** fahamutech/fitflex-functions#64 (draft). A vendor invites staff by one phone or email (`/orgs/vendor/:vendorId/people/lookup`, `/invitations`, cancel, resend); the invitation carries the existing staff role and permissions; accepting creates a `vendor_staff` persona for the invited Person with no password; legacy `POST /vendor/staff` answers `credentials_not_accepted` when `V2_INVITES` is on. No schema change. Vendor only (staff cannot invite); one vendor per staff person. 1198/1198. **Client still to do after merge:** the app's vendor staff form (`lib/screens/vendor/vendor_home_page.dart`) still sends a password. |
| I6a | Not started: Firebase phone verification (phone invitations cannot be claimed until I6a). **Before turning on `V2_INVITES`:** slice C backend and its app change must be live, and testers need the current Android build, or old forms that set a PIN or password are refused. |
| I7 onwards | Not started. |

## 7. Open items that block progress

| # | Item | Blocks |
|---|---|---|
| ~~A1~~ | **Waived 28 Sep:** #34 was merged without the production dry run for the rehash migration (`20261021090000`). It converted every remaining `demo:<plaintext>` password to scrypt of the same value, so none stopped working. | — |
| ~~A2~~ | Done: #34 merged 28 Sep. | — |
| B1 | **O8 vs Google Play policy.** Play's User Data policy says *"Temporary account deactivation, disabling, or 'freezing' the app account does not qualify as account deletion"* and associated user data must be deleted (retention only for legitimate reasons such as fraud or regulatory compliance, disclosed in the privacy policy). A persona soft-close with no data removal as the store-facing "Delete account" may not comply. Needs a product/legal resolution. | I3 deletion UX (not I0–I2) |
| C1 | **Technical verification:** the Firebase Console *User account linking* setting (one account per email vs multiple) for project `fitflex-af-pilot` and the actual production project. The repo has no Auth config. Don't change it without approval. | I2 |
| C10 | **Technical verification:** portal gym-owner and staff sign-in. The portal always sends `requestedRole: 'admin'` (`fitflex-portal/app/login/page.tsx`, since May). Since `fitflex-functions` `224f160` (14 Sep 2026), the backend finds only admin rows for that and otherwise refuses with `admin_self_registration_not_allowed`. Owners and staff are therefore probably locked out of the portal; vendor staff and HR use `/auth/login` and are unaffected. Confirm in production logs; if confirmed, propose a separate hotfix. | I2 portal work |

**Noticed outside scope:** `fitflex-functions` commit `224f160` added `backup/fitflex.dump` (removed on 16 Sep, still in git history). If it is a production dump, personal data is in the repo history. Raise with the repo owner.

## 7a. Parked 30 Sep 2026 (by the product owner, for later clarification)

Building continued into I2. These are **not dropped**: each gates *enabling* the related flags in production, not building.

| # | Parked item | Must be done before |
|---|---|---|
| P1 | Confirm the migrations ran on production: I1 (below), I2/I3, and I4 (`OrgMembership` and `Vendor` exist; `node scripts/org-membership-sync.mjs` dry run reports drift 0). I1: (`knex_migrations` last row, `Person` count, 0 `User` rows with null `personId`). There is no SSH access from the product owner's Mac; needs the server admin, or an admin status endpoint (offered, not built). | Turning on any V2 flag |
| P2 | Run `node scripts/identity-reconcile.mjs --firebase` (dry run) on production, review the counts and conflicts, then `--apply` | Turning on `V2_LINKING` |
| P3 | C1: Firebase account-linking setting | Turning on `V2_LINKING` |
| P4 | C10: portal owner/staff sign-in in production logs | Portal I2 rollout |
| P5 | Live test of the I0 verify-email path with an admin-created test owner | — (confidence) |
| P6 | `User.personId` NOT NULL, after 7 days with no null rows | After P1 |
| P7 | Public repos: remove the production server address and the `backup/fitflex.dump` pointer from #9 and this document; decide on a history rewrite if the dump is real data | Owner decision |
| P8 | B1: account deletion vs Google Play, and the O8 soft-close of "Delete account" (today it hard-deletes the current persona row and its history) | Turning on `V2_ADD_PERSONA` for real users (it does not block building I3) |

## 8. How to continue (for the next agent)

1. **Worktrees only.** Other sessions share these checkouts; never switch branches in place.
2. **Backend tests** need a local Postgres. Use your own CI database so you don't collide with other sessions:
   ```bash
   export DATABASE_URL_CI=postgresql://<user>@localhost:5432/fitflex_ci_<yours>
   npm run db:setup:ci && npm test
   ```
   Do **not** run `npm install` in a worktree: `postinstall` runs migrations and the seed against `DATABASE_URL`. Symlink `node_modules` and `.env` from the main checkout instead, and never `git add` the symlinks.
3. **At the start of each phase:** re-read the affected code on current `main`, confirm the §4 decisions still apply, implement **only** that phase, produce a dry-run report for any migration or backfill, run the phase's regression suites (listed in `IDENTITY_IMPLEMENTATION_PLAN.md`), and merge backend before clients.
4. **Next permitted work:** I1 (Person + LoginIdentifier foundation, no behaviour change). The real 409 → verify → sign-in flow hasn't been exercised live yet; do that with a test account an admin creates (with no Firebase login attached) before relying on it. I2 additionally needs C1 and C10 verified.
5. **Portal e2e locally:** Playwright's bundled browser may be missing; run with an installed Chrome (`channel: 'chrome'`) via a local config rather than downloading it. New Swahili strings in both client PRs need the usual review.
