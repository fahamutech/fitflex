# Identity V2 — go-live runbook

**Status: draft, 8 Oct 2026. Written for the product owner and whoever manages the backend server.** Everything described here is already merged and deployed; it does nothing until the settings and flags below are switched on. No step in this document has been run against the live server, real Beem or Mailgun, or a real device, so expect small problems on the first real pass and treat each step's "check" as a real test, not a formality.

## How to use this runbook

- Go **in order**. Each step ends with checks. Do not start the next step until the checks pass.
- Between steps, **restart the backend** (settings are read at start) and look at `/health`.
- **Roll back** any step by removing its lines from the server settings and restarting. Every flag is off unless set to `true` (or `shadow` for `V2_ORG_AUTHZ`). Data written while a flag was on stays; it is harmless while the flag is off.
- Use **test accounts**. All current users are test users, but still: one person per check, written down.
- **Never paste secrets** (PEPPER, API keys, connection strings) into chat, tickets, screenshots or this repository.
- **Never change the Firebase configuration** as part of this. Nothing here needs it.
- Server commands (`node scripts/…`, database queries) run **on the server by the server admin**, not from your laptop. Run from a laptop they either fail or hit the wrong database.

| Who | Does |
|---|---|
| **Product owner** | Decisions, accounts with Beem and Mailgun, tester phones, the "check" steps in the app and portal |
| **Server admin** | Where the backend's settings live: set values, restart, run the server-side checks, take backups |
| **Testers** | Two or three people on the current Android build, plus one on web, each with a phone number and an email that can receive messages |

---

## Step 0 — Before anything is switched on

| # | Do | Pass when |
|---|---|---|
| 0.1 | **Back up the production database** and write down the time. | A backup exists and can be restored (ask the server admin how it was tested). |
| 0.2 | **P1: confirm the migrations ran.** On the server: the migration log's last rows are the identity migrations (up to `20261124090000-account-recovery`); `Person` has rows; no `User` row has a null `personId`. Run the organisation-membership drift check as a dry run (`node scripts/org-membership-sync.mjs`). | Migrations present; zero null `personId`; drift 0. |
| 0.3 | **P2: reconcile dry run.** On the server: `node scripts/identity-reconcile.mjs --firebase` **without** `--apply`. Read the counts and any conflicts with the product owner. Run with `--apply` only once the dry run is understood. | Counts make sense; every conflict is explained or consciously left. (Needed before Step 1.) |
| 0.4 | **P3 is closed:** Firebase is set to one account per email. Nothing to do; do not change it. | — |
| 0.5 | **Health.** `https://fitflex-faas.bfast.smartstock.co.tz/health` answers 200. | 200. |
| 0.6 | **Current builds.** Testers have the current Android build and the web app is the latest deploy. Old builds are not supported for the new sign-in. | Testers confirm the version. |
| 0.7 | **Decide who gets the `account_recovery` permission** (portal → Users). Give it to as few people as possible. | Named. |

If 0.2 or 0.3 fails, stop and bring the output to the product owner. Do not switch anything on.

---

## Step A — Secrets and sending settings (no flag yet)

Add these to the backend's production settings. They change nothing visible until a flag uses them.

```
# the key every PIN is mixed with: generated once, never changed (see below)
PIN_PEPPER=<long random secret>

# sending codes
VERIFICATION_SMS_PROVIDER=beem
BEEM_API_KEY=<from Beem>
BEEM_SECRET_KEY=<from Beem>
VERIFICATION_SMS_SENDER_ID=<sender name registered with Beem>
VERIFICATION_EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=<from Mailgun>
MAILGUN_DOMAIN=<verified Mailgun sending domain>
# EU Mailgun account only:
# MAILGUN_API_URL=https://api.eu.mailgun.net

# the address phones open for the cancel link in a recovery message (future item F1)
PUBLIC_API_URL=https://fitflex-faas.bfast.smartstock.co.tz

# optional: moves existing users' old PINs across (see below)
# FIREBASE_WEB_API_KEY=<Web API key of project fitflex-af-pilot>
```

**`PIN_PEPPER`.** A long random secret (for example 48 random bytes, base64), generated on the server, stored in a password manager. It is mixed into every stored PIN, so a copied database cannot be cracked. **Set it once and never change it:** changing it makes every PIN stop working. Without it in production the PIN endpoints answer `503 pin_not_configured`.

**`FIREBASE_WEB_API_KEY`.** Optional. Only used to check an existing user's old Firebase PIN once. All current users are testers, so it may be left out: they use Forgot PIN once. If set, and the key is restricted by website/app in Google Cloud, server calls may be refused (symptom: existing users are told their PIN is wrong).

**Beem.** The sender name must be registered and approved before messages go out under it. Without it, SMS fails.

**Mailgun.** The domain must be verified (SPF, DKIM) or messages land in spam.

**`PUBLIC_API_URL` (F1).** Defaults to the current backend address, so it is optional today. Set it explicitly, and re-check it whenever the backend address changes; if it is wrong, the cancel link in a recovery message does not open (the in-app Cancel button still works).

**Test the settings without a flag:** restart, then check `/health` and that normal sign-in (Google, and an existing email + PIN) works exactly as before. Nothing else should change.

**Rollback:** remove the lines, restart.

---

## Step 1 — `IDENTITY_V2`, `V2_LINKING`, `V2_PERSONAS`

```
IDENTITY_V2=true
V2_LINKING=true
V2_PERSONAS=true
```

Prerequisite: Step 0 fully passed, including P2 applied.

What this does: a person is recognised as one identity across email, phone and Google; a person with several roles can switch between them; verified sign-in links the profiles that belong to the same person.

| Check | Expected |
|---|---|
| A tester signs in with Google | Signs in as before. |
| A tester with an existing email + PIN signs in | Signs in as before. |
| A tester who holds two roles (for example member and trainer) | The role switcher appears (app and portal); switching works and the app remembers the last role. |
| Look for duplicates | No new duplicate accounts after sign-in. |
| Identity conflicts (the `IdentityConflict` table, read by the server admin; there is no portal screen or report for it yet) | Any new conflict is explained. The identity health report offered earlier would remove the need for server access here; it is not built. |

**Stop and roll back if:** a user cannot sign in, a person gets a different account than before, or a history (subscriptions, check-ins, payments) looks to belong to the wrong person.

---

## Step 2 — `V2_ORG_WRITE` and `V2_ORG_AUTHZ=shadow`

```
V2_ORG_WRITE=true
V2_ORG_AUTHZ=shadow
```

What this does: organisation relationships (gym staff, trainers, vendor staff, members) are also recorded as memberships. **Shadow** computes the new access decision beside the old one and logs disagreements; the old rules still decide. Nothing a user can do changes.

| Check | Expected |
|---|---|
| App: a signed-in user's memberships (`GET /me/memberships`, or the profile if shown) | Matches their real gym/vendor relationships. |
| Server: `node scripts/org-membership-sync.mjs` dry run | Drift 0. |
| Use the app and portal normally for several days | No new access problems. |
| Admin: shadow report (`GET /admin/identity/org-authz`) | Mismatches are zero, or each is understood. |

**Not part of go-live:** switching `V2_ORG_AUTHZ` from `shadow` to enforce. Do that later, only after a clean shadow period, as its own decision.

---

## Step 3 — `V2_IDENTIFIERS`

```
V2_IDENTIFIERS=true
```

What this does: a signed-in person can add and verify a mobile number or email with a code FitFlex sends. **This is the first real test of Beem and Mailgun.**

Tester path: Profile → "Mobile number and email".

| Check | Expected |
|---|---|
| Add a mobile number | An SMS with a 6-digit code arrives within a minute, from the registered sender name, in the right language. |
| Enter the code | The number shows as verified. |
| Add an email | An email arrives (not in spam) from the Mailgun domain; code verifies it. |
| Wrong code 5 times | The code stops working; a new one is needed. |
| Ask for a second code at once | "Wait" for 60 seconds. |
| Add a number another tester has verified | Refused ("already in use"); nothing is merged. |
| With only one kind verified | The gentle card appears: "Add an email/mobile number too, so you can always get back in". |

Watch the Beem and Mailgun dashboards for delivery failures and the first costs.

**Rollback:** remove the line, restart. Verified identifiers stay recorded.

---

## Step 4 — `V2_PIN_LOGIN` and `V2_RECOVERY`

```
V2_PIN_LOGIN=true
V2_RECOVERY=true
```

Prerequisite: Step 3 passed, `PIN_PEPPER` set.

This is the biggest step: sign-up, sign-in, Forgot PIN, changing the PIN, changing the number or email, and account recovery. Run all of these with different testers.

**Sign-up and sign-in**

| Check | Expected |
|---|---|
| Register with a mobile number → code → name → 4-digit PIN | Signed in; the account exists once. |
| Register with an email → code → PIN | Same. |
| Register with a number or email that is already registered | Told plainly it is registered; sent to sign in. |
| Sign in with number or email + PIN | No code is sent. |
| An existing test user's first sign-in (email + old PIN) | One code to their email, then a 4-digit PIN (their old one if it has 4 digits, a new one otherwise). |
| Google sign-in | Still works, no PIN asked. |
| Portal: gym owner and gym staff sign in with email + PIN | Works (this was C10). |

**Lockout and Forgot PIN**

| Check | Expected |
|---|---|
| 5 wrong PINs in a row | Sign-in pauses for 15 minutes. |
| 10 wrong in a row | The PIN is switched off; Forgot PIN is required. |
| Forgot PIN → code to the verified number/email → new PIN | Signed in; other devices are signed out. |
| An address that has no account asks for Forgot PIN | The same answer as one that has (no account discovery). |

**Change PIN, change number or email**

| Check | Expected |
|---|---|
| Profile → Change PIN (also the vendor app bar) | Needs the current PIN; other sessions end. |
| Profile → change number or email | Needs the PIN and a code sent to the new value; the old one stops signing in and is told. |

**Account recovery** (use two testers: one who "lost everything", one admin with the `account_recovery` permission)

| Check | Expected |
|---|---|
| Sign-in screen → "I can't access my number or email" → old contact, new contact, code, name | A request is recorded; every old number and email gets the message with a cancel link. |
| Open the cancel link on a phone | A page asks; **only the button cancels**. Cancel on a second test request. |
| Ask again right after a cancel | Blocked for 7 days (`recovery_blocked`). |
| Signed-in device of the account | Shows the banner with Cancel. |
| Answer the questions; portal → Account recovery | The request shows with the answers beside the account's facts; Approve is disabled for the first 24 hours. |
| Approve after the wait (see note) | The new contact signs in; old contacts stop; the old PIN is gone; every device signed out. |
| New contact → Forgot PIN → new PIN → signed in | Works; the account, roles and history are the same as before. |
| Try recovery for a staff account, an admin account, a KYC-verified trainer | Not offered; told how to proceed. |

*Note on the wait:* the 24 hours cannot be skipped in the product. To test end to end in one sitting the server admin may temporarily set `RECOVERY_WAIT_HOURS_MEMBER` to a small value (for example `0.01`), then **remove it** and restart. Do not leave the short value in place.

**Costs and limits to watch:** SMS and email volume against the Beem and Mailgun accounts; the daily registration-code cap (`REGISTER_CODES_PER_DAY`, default 1,000) is the guard on the SMS bill.

**Rollback:** remove the lines and restart. People who changed or reset their PIN on FitFlex have a newer PIN than the old Firebase one, so with the flag off they would need the old PIN or to use the Google/Firebase route. With only test users this is acceptable; tell the testers.

---

## Step 5 — `V2_INVITES`

```
V2_INVITES=true
```

Prerequisite: testers on the current Android build.

What this does: gym owners and vendors **invite** staff, trainers and members instead of creating logins for them. The person gets a message with a start PIN (if new to FitFlex) and a link to the app.

| Check | Expected |
|---|---|
| Gym owner invites a trainer by mobile number (portal or app) | The trainer receives an SMS with the start PIN and the app link (placeholder: the web app until the store links exist). |
| New trainer opens the app, signs in with the start PIN | Asked for their name and their own 4-digit PIN; then sees the invitation; accepts → trainer role; declines → asked which role to continue with. |
| Existing FitFlex user is invited | Sees the invitation in the app after signing in; their history is untouched. |
| Gym owner invites staff; vendor invites staff | Same; the staff role has the permissions given. |
| Member invitation, with and without a desk payment | Subscription is created on acceptance, dated from the payment. |
| Old "Add staff" / "Add trainer" with a password | Refused with a message pointing to invitations. |
| Cancel, resend (limit 3, one per 24 hours), expiry after 14 days | Behave as stated. |

Known gaps (not blockers): opening an invitation link while signed out loses the link after sign-in; a staff person at two organisations is not supported; member invitations get no direct message or start PIN.

---

## Step 6 — `V2_ADD_PERSONA` (last)

```
V2_ADD_PERSONA=true
```

What this does: a person can add another role (for example a member who also becomes a trainer) from the role sheet, on the same account.

**Gate before real users or a store release:** P8 / B1 — Google Play requires real account deletion (data removed, with disclosed exceptions), and the current "Delete account" for a role is not yet reconciled with that. For test users only, this is not a blocker; for store release it is.

| Check | Expected |
|---|---|
| "Add a role" from the role sheet | The new role is created on the same account; the switcher shows both. |
| Adding a role the person already has | Not offered. |
| History | Still on the same IDs. |

---

## After go-live — first week

| Watch | Where | Act if |
|---|---|---|
| Backend health and errors | `/health`, server logs | Any new crash loop, 5xx on `/auth/*`. |
| Messages sent, failed, cost | Beem and Mailgun dashboards | Failures over a few percent, or cost above plan. |
| Sign-in problems | Support messages from testers; many 429 / `pin_reset_required` | Lockout limits too tight, or an attack pattern. |
| Identity conflicts | `IdentityConflict` table (server admin) | Any person with two accounts that should be one: **do not merge** — escalate; merging a disputed identity is the product owner's decision. |
| Shadow mismatches | `GET /admin/identity/org-authz` | Any mismatch not yet understood. |
| Recovery requests | Portal → Account recovery | A request nobody decided; a request from a number you do not recognise. |
| `User.personId` nulls | Server query | Any null after 7 days → P6 can only follow a clean week. |

**Later, not now:** I8 cleanup (only at least 2 weeks after go-live); switching `V2_ORG_AUTHZ` to enforce; partner account recovery (waits for counsel on the ID-and-selfie proof and on how long evidence is kept); P5, P7 and P8 as listed in the status document.

## Stop rules

Stop and roll back the last step if: a tester cannot sign in who could before; money or subscription data appears under the wrong person; codes are delivered to the wrong place or in the wrong language; or SMS volume or cost is far above what the test would explain. Tell the product owner before trying again.

## Quick reference — all settings

| Setting | Value / default | Step |
|---|---|---|
| `PIN_PEPPER` | secret, set once | A |
| `VERIFICATION_SMS_PROVIDER`, `BEEM_API_KEY`, `BEEM_SECRET_KEY`, `VERIFICATION_SMS_SENDER_ID` | Beem | A |
| `VERIFICATION_EMAIL_PROVIDER`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` (`MAILGUN_API_URL` for EU) | Mailgun | A |
| `PUBLIC_API_URL` | backend address (default is the current one) | A |
| `FIREBASE_WEB_API_KEY` | optional | A |
| `APP_DOWNLOAD_LINK` | web app until store links exist | 5 |
| `IDENTITY_V2`, `V2_LINKING`, `V2_PERSONAS` | `true` | 1 |
| `V2_ORG_WRITE`, `V2_ORG_AUTHZ` | `true`, `shadow` | 2 |
| `V2_IDENTIFIERS` | `true` | 3 |
| `V2_PIN_LOGIN`, `V2_RECOVERY` | `true` | 4 |
| `V2_INVITES` | `true` | 5 |
| `V2_ADD_PERSONA` | `true` | 6 |
| Limits (all optional, defaults shown) | code 6 digits, 10 min, 5 tries, 60 s resend, 5 codes/identifier/hour, 10/person/day · PIN lock after 5 wrong for 15 min, off after 10 · 10 reset requests per address per hour · 1,000 registration codes per day · recovery wait 24 h, block 7 days, 3 starts per address per day | — |
