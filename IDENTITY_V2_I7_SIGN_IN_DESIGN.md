# Identity V2 · I7 — Registration, sign-in and PIN: design for confirmation

**Status: proposal, 2 Oct 2026. Nothing in this document is built. Build starts only after the product owner confirms the six decisions in section 9.**

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

Old builds keep signing in through Firebase, as they do now. While old builds are still supported, FitFlex keeps the Firebase password equal to the current PIN, so a PIN changed in the new app still works in an old one. This copy is removed in I8 when old builds are retired.

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

## 9. Decisions needed from the product owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Who keeps the PIN | FitFlex backend (option A) |
| 2 | Existing users at first sign-in with the new app | One code to their email, then adopt their PIN; anyone with a longer PIN chooses a new 4-digit one |
| 3 | Google sign-in | Keep it, with no PIN |
| 4 | Lockout | 5 wrong → 15 minutes; 10 wrong in a row → reset by code required |
| 5 | Old app builds during the changeover | Keep them working (Firebase password kept in step with the PIN) rather than forcing everyone to update at once |
| 6 | On sign-up, when the email or number is already registered | Tell the person plainly and send them to sign-in (the current sign-up already reveals this) |

## 10. Found during the survey (existing behaviour, not part of I7)

Reported for a separate decision; none of these were changed.

- **Portal "Add staff" cannot succeed today.** The portal sends the PIN under one field name and the backend reads another, so the request is refused. This is live because invitations are still switched off.
- **Gym owners and staff cannot sign in at the portal.** The login page always asks for the admin role (this is the parked item C10).
- **Three kinds of stored credential have no working sign-in:** PINs for trainers created by a gym, passwords for vendor staff, and the activation PIN for company employees.
- **Signing out of the app leaves Firebase signed in.** On the web build, opening the sign-in screen can restore the session.
- **The session token is kept in ordinary app storage** on both the app and the portal.
