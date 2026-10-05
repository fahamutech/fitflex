# Identity V2 · I7 — Registration, sign-in and PIN: design for confirmation

**Status (4 Oct 2026): design confirmed by the product owner on 2 Oct; I7a–I7e and invitation sign-in with a start PIN are all built, merged and deployed, and all dormant behind flags.** Before switching on: `PIN_PEPPER`, `FIREBASE_WEB_API_KEY`, Beem and Mailgun credentials on the server; production checks P1 and P2; then the flags. **Confirmed by the product owner on 5 Oct 2026:** the message wording (invitation SMS and email, and the notice to a replaced number or email) and the request limits (10 code or PIN-reset requests per network address per hour; 1,000 registration codes a day; 10 failed sign-ins per identifier and 30 per address in 15 minutes). Not designed: recovery for someone who has lost every verified identifier. I8 (cleanup) waits until the new sign-in has been live at least two weeks.

It implements the decisions of 2 Oct 2026 recorded in `IDENTITY_V2_DECISIONS_AND_STATUS.md` (O4-R, O9–O12):

- A mobile number or email is proved **once**, with a code FitFlex sends (Beem SMS, Mailgun email).
- Every email registration is verified by a code, then the person sets a PIN.
- Login is **mobile number or email + PIN**, with no code.
- **One PIN per person, exactly 4 digits, for everyone.**
- PIN reset: prove a verified email or number with a code, then set a new PIN.

## 1. How it works today (verified in code, 2 Oct)

| Area | Today |
|---|---|
| The PIN | It is the **Firebase password**, sent as `fitflex-pin:<pin>`. The FitFlex backend never sees or stores it. |
| PIN length | The sign-in keypad takes 4–6 digits; change-PIN allows 4–8. Someone who set a 7- or 8-digit PIN cannot type it at sign-in. |
| Register (email) | App creates a Firebase account with email + PIN, then exchanges the Firebase token for a FitFlex session. No email check unless the email matches an existing profile. No "confirm PIN" step. |
| Register (mobile number) | Not possible. The field accepts a number, then Firebase rejects it as an invalid email. |
| Sign in | Firebase email + PIN, or Google; then the token exchange. |
| Forgot PIN | A button with no code behind it. |
| Change PIN | Members only, done directly against Firebase. |
| Attempt limits | None in FitFlex. Whatever Firebase applies. |
| Sessions | A FitFlex token valid 7 days, with no way to end it early. |
| Portal | Admins and portal staff: Firebase email + password or Google. Company HR: password checked by the backend. |

## 2. The central choice: who keeps the PIN

**Recommended: the FitFlex backend keeps and checks the PIN.**

| | A. FitFlex keeps the PIN (recommended) | B. Firebase keeps the PIN |
|---|---|---|
| Login with a mobile number | Direct: number + PIN checked by FitFlex | Needs a made-up email per number, or a backend step that looks up the email and signs in on the person's behalf |
| One PIN for number and email | Natural: the PIN belongs to the person | Awkward: Firebase ties a password to one email account |
| Attempt limits and lockout | FitFlex controls them, which a 4-digit PIN needs | Only Firebase's own, which FitFlex cannot set |
| PIN reset by FitFlex code | Direct | Needs a privileged Firebase call for every reset |
| Firebase after this | Google sign-in and push notifications only | Stays the password store |

With option A, Firebase is no longer involved when someone signs in with a PIN. Google sign-in keeps working exactly as it does now.

## 3. Flows

**Register (email or mobile number)**
1. Person enters an email or a mobile number and picks a role, as today.
2. FitFlex sends a 6-digit code (email or SMS).
3. Person enters the code.
4. Person sets a 4-digit PIN and types it a second time to confirm.
5. Account is created and they are signed in. Role approval rules are unchanged (owners, trainers and vendors still wait for approval).

If the email or number already belongs to a profile a gym created earlier, proving it with the code links that profile to the new account, as the existing rules already require (decisions D1 and O7).

**Sign in**
1. Email or mobile number.
2. 4-digit PIN.
3. Signed in. No code.

**Sign in with Google**: unchanged. No PIN involved.

**Forgot PIN**
1. Person enters their verified email or number.
2. FitFlex sends a code to it.
3. Person enters the code, then sets a new 4-digit PIN.
4. Lockout is cleared and every other signed-in device is signed out.

**Change PIN (signed in)**: current PIN, then the new one, for every role (today members only).

**Add a second identifier** (a number to an email account, or the reverse): already built in I6a.

**Change an email or number**: enter the PIN, prove the new value with a code, then it replaces the old one. If someone loses access to every verified identifier, recovery is a manual support process; that policy is not designed here.

## 4. Protecting a 4-digit PIN

A 4-digit PIN has only 10,000 possibilities, so everything around it must limit guessing.

- **Lockout per person:** 5 wrong PINs in a row locks sign-in for 15 minutes. 10 wrong in a row disables the PIN until it is reset with a code.
- **Limits per device/network address** on sign-in, registration and reset requests, so one source cannot try many accounts or trigger many SMS.
- **Same answer** for "no such account" and "wrong PIN", so sign-in cannot be used to discover who has an account.
- **Storage:** the PIN is stored only as a slow hash combined with a secret key kept on the server, not in the database. A copied database alone cannot be used to recover PINs.
- **Sessions can be ended:** a PIN reset or change invalidates tokens issued before it.
- **SMS cost control:** registration and reset requests come from people who are not signed in, so they get their own limits and a daily cap with an alert.

Not included: a code when signing in from a new device. The product owner asked for no code at login; this is noted as the main remaining risk of a 4-digit PIN.

## 5. Existing users

Their PIN lives in Firebase and FitFlex has never seen it.

Proposed, at the first sign-in with the new app:
1. Person enters email + PIN as usual.
2. FitFlex checks that PIN against Firebase once, on the server.
3. FitFlex sends a one-time code to the email, because the email has never been proved to FitFlex.
4. If the PIN is 4 digits, it is adopted as their FitFlex PIN. If it is longer, they choose a new 4-digit PIN.
5. From then on they sign in through FitFlex only.

People who only ever used Google are unaffected.

## 6. Old app versions

**Decided 2 Oct 2026:** every current user is a test user and will move to the new app, so old builds are **not** kept working. FitFlex does not copy the PIN back into Firebase. Once someone's PIN is kept by FitFlex, an old build can no longer sign them in with it.

## 7. What does not change in I7

- **Portal sign-in** for admins, portal staff and company HR.
- **Vendor staff and HR passwords** created before invitations: they keep their current sign-in; moving them is I8.
- **Google sign-in.**
- **Invitations, roles, memberships:** unchanged.

## 8. Build order (each step dormant behind a flag)

| Step | Contents |
|---|---|
| I7a | Backend: PIN storage, number/email + PIN sign-in, lockout, ending sessions, adopting existing users' PINs. **Live 3 Oct** (fahamutech/fitflex-functions#82, merge cf1c03c; `POST /auth/pin/login`, `POST /auth/pin/setup`, flag `V2_PIN_LOGIN`, needs `PIN_PEPPER` and `FIREBASE_WEB_API_KEY` on the server; 1311/1311) |
| I7b | Backend: registration with a code. **Live 3 Oct** (fahamutech/fitflex-functions#83, merge ff579f7; `/auth/register/start`, `/confirm`, `/complete`; nothing exists until the four-digit PIN is set; 1318/1318) |
| I7c | Backend: forgot PIN and change PIN. **Live 4 Oct** (fahamutech/fitflex-functions#85, merge 9687279; `/auth/pin/reset/start`, `/confirm`, `/complete` behind `V2_RECOVERY`; `POST /me/pin` behind `V2_PIN_LOGIN`; 1326/1326) |
| I7d | App: new sign-up, sign-in, forgot-PIN and change-PIN screens with a 4-digit keypad. **Live 4 Oct** (fahamutech/fitflex-mobile#54, merge 09ff008; `lib/screens/pin_flows.dart`; the app probes which sign-in options are on and keeps the Firebase path while they are off; 561/561) |
| I7e | Change an email or number. **Backend live 4 Oct** (fahamutech/fitflex-functions#90, merge 319750d; `POST /me/identifiers/change/request` with the PIN and `…/confirm` with the code, behind `V2_RECOVERY`; the old value is revoked and told; 1367/1367). **App live 4 Oct** (fahamutech/fitflex-mobile#57, merge 32b100c; a Change action on each verified number or email; 573/573). |

A new flag, `V2_PIN_LOGIN`, is needed for I7a–I7d; `V2_RECOVERY` (already approved) covers forgot-PIN and identifier change. Adding the flag is a small addition to decision C2.

## 9. Decisions (confirmed by the product owner, 2 Oct 2026)

| # | Decision | Confirmed |
|---|---|---|
| 1 | Who keeps the PIN | The FitFlex backend |
| 2 | Existing users at first sign-in with the new app | One code to their email, then their PIN is adopted; anyone with a longer PIN chooses a new 4-digit one |
| 3 | Google sign-in | Kept, with no PIN |
| 4 | Lockout | 5 wrong → 15 minutes; 10 wrong in a row → reset by code required |
| 5 | Old app builds | **Not supported.** All current users are test users and continue on the new app (differs from the recommendation) |
| 6 | Sign-up with an email or number already registered | The person is told plainly and sent to sign-in |

## 10. Found during the survey — fixes requested 2 Oct 2026

| Finding | State |
|---|---|
| Portal "Add staff" could never succeed (wrong field name); a member given a PIN from the portal could not sign in (raw PIN) | **Live 3 Oct** (fahamutech/fitflex-portal#35, merge bf47ad9) |
| Gym owners and staff cannot sign in at the portal (C10) | Backend half **live 2 Oct** (fahamutech/fitflex-functions#74, merge bb84a3f; `existingOnly` on the session route, never creates a profile). Portal half **live 3 Oct** (fahamutech/fitflex-portal#37, merge 4e7fad5; tries admin, then existing owner, then existing staff; email sign-in also accepts the app PIN) |
| PIN length rules disagree (keypad 4–6, change-PIN up to 8) | **Live 3 Oct** (fahamutech/fitflex-mobile#50, merge e12c237). Setting a PIN is exactly 4 digits; sign-in accepts up to 8 so older PINs still work |
| Stored credentials with no working sign-in (gym-created trainer PINs, vendor staff passwords, company employee activation PINs) | **Not fixed; under discussion.** It depends on how an invited person first signs in (below) |

**Invitation sign-in — agreed with the product owner, 3 Oct 2026** (replaces the open discussion)

- An organisation (gym owner or vendor) invites a person by mobile number or email as staff or trainer. FitFlex sends the message straight to the person: who invited them, as what, links to the app in the stores (placeholders until the app is listed), and, **only if they are new to FitFlex**, a start PIN. The organisation never sees it.
- **Start PIN:** 4 digits, single use, expires with the invitation (14 days), dies after 5 wrong tries.
- **First sign-in:** number or email + start PIN (this also proves the number or email is theirs), then they **choose their own 4-digit PIN** straight away.
- **Then a separate Accept / Decline step**, the same screen existing users get.
- **Existing FitFlex users** get no PIN: the notice and store links only; they accept with their own PIN.
- **Declining with no other role:** they see the normal "How will you use FitFlex?" role choice (member, trainer, gym owner, vendor). If they choose nothing, the account keeps no role and can be invited again later.
- **Role after accepting:** only the invited role, using that role's interface. No member profile is created; to train and book as a customer they add the member role themselves (I3, `V2_ADD_PERSONA`).
- **A new person invited as a trainer** gets a trainer profile on acceptance, attached to that gym, **but not bookable until FitFlex verifies them** (rule below).

Depends on I7a (FitFlex keeps the PIN), so it is built after it. **Backend live 4 Oct** (fahamutech/fitflex-functions#86, merge c6b4b72; delivery by SMS or email for staff and trainer invitations, start PIN for people new to FitFlex, `POST /auth/invite/begin`, `/auth/onboarding/accept`, `/decline`, `/role`; a trainer profile is created on acceptance for anyone without one; member invitations unchanged; message wording not yet confirmed; 1343/1343). **App live 4 Oct** (fahamutech/fitflex-mobile#55, merge d488740; `InviteStartScreen`, `OnboardingScreen`, the invite sheet reports delivery; 569/569). The gap where forgot PIN answered `409 no_profile` for a person with no profile yet is fixed and live (fahamutech/fitflex-functions#88, merge ea645d2). Change PIN on the vendor screen is live (fahamutech/fitflex-mobile#56, merge 1b6e709).

**Partner verification — changed by the product owner, 3 Oct 2026** (replaces the 28 Sep rule "approved before going live" for trainers and gyms; vendors unchanged)

- Self-registered **trainers and gym owners** get an **active profile at once**: no "waiting for approval" screen.
- They show as **not verified** until they submit their details and a FitFlex admin approves them.
- Until verified: **no Connect** (the trainer–client link for sharing workouts and progress), **no bookings**, **no payouts or settlements**. This also applies to trainers invited by a gym.
- In lists, **verified profiles come first**, then unverified ones, labelled.
- Today (code, 3 Oct): unverified new trainers are hidden from lists and cannot be booked or apply to a gym; Connect (`POST /trainers/:id/connect`) has no verification check of its own; new gyms start as `pending_verification`.
- **Unverified gym (confirmed 3 Oct):** FitFlex Pass members cannot check in there until it is verified. Nothing else was asked to be blocked; the gym's own members and the existing payout gating for new gyms are unchanged.
- **Unverified trainer (confirmed 3 Oct):** cannot apply to join a gym (as today).
- This is a change to the partner-verification rules, not identity; built as its own piece.
- **Backend live 3 Oct** (fahamutech/fitflex-functions#80, merge 5c7a0d5; the live trainer list carries `bookable` and lists verified trainers first). **App live 3 Oct** (fahamutech/fitflex-mobile#52, merge 4fc42cf; "Not Verified" label in lists, Book and Connect disabled for an unverified trainer, the partner's own "not verified" notice; 550/550). A rejected KYC case still blocks sign-in as before; that was not part of the decision.


Also seen, unchanged: signing out of the app leaves Firebase signed in (the web build can restore the session), and the session token is kept in ordinary app storage.
