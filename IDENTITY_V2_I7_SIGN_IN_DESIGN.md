# Identity V2 · I7 — Registration, sign-in and PIN: design for confirmation

**Status: design confirmed by the product owner on 2 Oct 2026 (section 9). Nothing in this document is built yet; each build step still needs its own go-ahead.**

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
| I7a | Backend: PIN storage, number/email + PIN sign-in, lockout, ending sessions, adopting existing users' PINs |
| I7b | Backend: registration with a code |
| I7c | Backend: forgot PIN and change PIN |
| I7d | App: new sign-up, sign-in, forgot-PIN and change-PIN screens with a 4-digit keypad |
| I7e | Change an email or number |

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
| Portal "Add staff" could never succeed (wrong field name); a member given a PIN from the portal could not sign in (raw PIN) | Fix built: fahamutech/fitflex-portal#35 (draft) |
| Gym owners and staff cannot sign in at the portal (C10) | Backend half **live 2 Oct** (fahamutech/fitflex-functions#74, merge bb84a3f; `existingOnly` on the session route, never creates a profile). Portal half built: fahamutech/fitflex-portal#36 (draft; tries admin, then existing owner, then existing staff; email sign-in also accepts the app PIN) |
| PIN length rules disagree (keypad 4–6, change-PIN up to 8) | Fix built: fahamutech/fitflex-mobile#50 (draft). Setting a PIN is exactly 4 digits; sign-in accepts up to 8 so older PINs still work |
| Stored credentials with no working sign-in (gym-created trainer PINs, vendor staff passwords, company employee activation PINs) | **Not fixed; under discussion.** It depends on how an invited person first signs in (below) |

**Open discussion (product owner, 2 Oct):** an invited trainer or staff member should receive, on their email or mobile number, a PIN to sign in with and a link to the app in the stores; which role they then sign in as is to be agreed. Nothing is decided or built. Points to settle: the PIN must come from FitFlex straight to the person (the organisation never sees it, principle P5); a person who already has an account gets no new PIN; whether the start PIN is single-use and replaced by the person's own PIN at first sign-in; whether a new person lands only in the invited role; whether a trainer profile created this way is approved at once, as gym-created trainers are today.

Also seen, unchanged: signing out of the app leaves Firebase signed in (the web build can restore the session), and the session token is kept in ordinary app storage.
