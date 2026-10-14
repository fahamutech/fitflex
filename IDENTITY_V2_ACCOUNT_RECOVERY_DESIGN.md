# Identity V2 — Recovering an account when every verified number and email is lost

**Status: decisions 1–8 approved by the product owner on 5 Oct 2026 (waiting period changed to 24 hours for members, 72 hours for partners). Decision 9 (how long evidence is kept) and the ID-and-selfie proof in decision 3 still need Tanzanian counsel. The reminder and the member path are built (5 Oct, drafts, not merged): see section 10.**

## 1. Who is actually stuck

Most people who lose a number or an email can already help themselves:

| Situation | What they can do today (once the new sign-in is on) |
|---|---|
| Lost the number, still has the email (or the reverse) | Forgot PIN or sign in with the other one, then Change |
| Lost both, **remembers the PIN** | Sign in still works: it needs the old number or email typed in, not access to it. Then Change (PIN + a code to the new one) |
| Lost both, forgot the PIN, **still signed in** on a device | Stuck: Change needs the PIN, and Forgot PIN needs the lost number or email |
| Lost both, forgot the PIN, signed out everywhere | Stuck |
| Signs in with Google | Not affected |

So this design is for one case: **the person can reach none of their verified numbers or emails and does not know their PIN.** It should be rare, and it is the most dangerous door in the system: whoever gets through it owns the account, with its paid plan, or for a gym owner or trainer, its payouts.

## 2. Principles

1. **FitFlex decides, never an organisation.** A gym or vendor cannot recover an account for someone (core principle: organisations never control identity). A gym may confirm what it knows, as evidence only.
2. **The real owner can always stop it.** Every recovery is announced to the old number and email and to any device still signed in, and waits before it takes effect.
3. **Nobody at FitFlex sets a PIN or sees a code.** Staff approve moving the account to a new number or email; the person then sets their own PIN with the normal Forgot PIN flow.
4. **The bar rises with what is at stake.** A member's account needs less proof than an account that receives money.
5. **Nothing is merged or recreated.** The same account, roles and history move to a new number or email. If recovery is refused, the person can open a new account; history is not moved to it.
6. **Everything is recorded:** who asked, what evidence was given, who approved, when.

## 3. The flow

1. **Ask.** On the sign-in screen: "I can't access my number or email". The person gives the number or email they used to sign in with, a **new** number or email, and their name. The new one is proved on the spot with a code, so FitFlex knows how to reach them and the request is not a typo or spam.
2. **Announce.** At once, a message goes to every old verified number and email, and a banner appears on any device still signed in: "Someone asked to recover this FitFlex account. If this was not you, cancel it." One tap (or the link in the message) cancels the request.
3. **Prove.** The person answers what FitFlex asks for their kind of account (section 4).
4. **Wait.** The request cannot be approved before the waiting period ends (section 5), however good the evidence. This gives the real owner time to see the announcement.
5. **Decide.** A FitFlex admin reviews the evidence in the portal and approves or refuses, with a reason.
6. **Hand over.** On approval: the new number or email becomes the verified one, the old ones stop signing in, the old PIN is removed, and every device is signed out. The person then uses Forgot PIN with the new number or email to set a PIN and sign in. The old number and email are told it was completed.
7. **Cool off.** For a period after recovery, the account cannot change where it is paid, and payouts are held (section 5).

A refused request tells the person why in general terms and what they can do (try again with better evidence, or register a new account).

## 4. What counts as proof

| Account | Proof asked for | Why |
|---|---|---|
| **Member** | Facts only the owner is likely to know: home gym, the plan they are on, roughly when they last checked in and where, a recent payment reference. Optionally, their gym confirms it knows them (evidence, not a decision). | Members have no ID on file with FitFlex, so there is nothing to compare a document against. |
| **Trainer, gym owner, vendor** (verified) | The same ID document that is already on their verification record, shown again, **with a photo of themselves holding it**. An admin compares it with what is on file. | These accounts receive money. FitFlex already holds their ID, so it can be matched. |
| **Trainer, gym owner, vendor** (not verified yet) | Treated as a member for proof; they have no payouts to protect. | Nothing is on file to compare. |
| **Staff of a gym or vendor** | No recovery. The owner removes the old staff account and invites the person again with their new number or email. | The role exists only through the organisation's invitation; nothing of the person's own is lost. |

**For counsel:** collecting an ID photo and a selfie for recovery, and how long that evidence may be kept, are data-protection questions under Tanzanian law. I have not assumed an answer; the retention period is left open.

## 5. Proposed numbers

| Setting | Member | Trainer, gym owner, vendor |
|---|---|---|
| Waiting period before approval | 24 hours | 72 hours |
| Who approves | One FitFlex admin | Two FitFlex admins |
| After recovery: payouts held, and the payout account cannot be changed | not applicable | 7 days |
| Requests allowed | 1 open request per account; 3 per network address per day | same |
| A cancelled or refused request blocks a new one for | 7 days | 7 days |

All would be adjustable on the server.

## 6. What FitFlex staff can and cannot do

- **Can:** see the request, the evidence, the account's roles and non-sensitive history; approve or refuse with a reason; cancel.
- **Cannot:** set or see a PIN, see a verification code, sign in as the person, or approve before the waiting period ends.
- Needs a new admin permission ("account recovery"), given only to the people who should do this.
- Every view and decision is written to the audit log.

## 7. Preventing it

Cheaper than any recovery:

- **Ask everyone to verify both a mobile number and an email.** A gentle reminder on the profile while only one is verified. With two, losing one is never fatal.
- **Say so at sign-up and when changing a number:** "Add an email too, so you can always get back in."

## 8. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | Offer assisted recovery at all, or tell people in this case to open a new account | Offer it, as designed here |
| 2 | Proof for members | Account facts, with the gym's confirmation as optional supporting evidence |
| 3 | Proof for verified trainers, gym owners and vendors | The ID already on file, shown again with a photo of the person holding it (**subject to counsel**) |
| 4 | Waiting period | 24 hours for members, 72 hours for partners (changed by the product owner, 5 Oct) |
| 5 | Approval | One admin for members, two for partners |
| 6 | Hold after recovery | 7 days: payouts held and payout account locked |
| 7 | Staff accounts | No recovery; the owner re-invites |
| 8 | The reminder to verify both a number and an email | Yes |
| 9 | How long recovery evidence is kept | **For counsel**; not assumed |

## 9. What it would take to build

Three pieces, each dormant behind `V2_RECOVERY`:

| Piece | Contents |
|---|---|
| Backend | A recovery-request record; ask, prove, cancel and status steps; the announcements; the waiting period; admin review with the new permission; the hand-over; the payout hold |
| Portal | An "Account recovery" queue for FitFlex admins: evidence, account summary, approve or refuse |
| App | "I can't access my number or email" on the sign-in screen; the proof steps; the cancel banner; the reminder to verify a second contact |

The reminder in section 7 is independent and small; it could ship first.

## 10. Build status (5 Oct 2026)

Built as drafts, dormant behind `IDENTITY_V2` + `V2_RECOVERY` (the same flag as Forgot PIN), nothing merged:

| Piece | Draft PR | What it does |
|---|---|---|
| Backend | fitflex-functions#97 | Member recovery end to end; admin permission `account_recovery`; the "second contact" suggestion on `GET /me/identifiers` |
| Portal | fitflex-portal#50 | Admin "Account recovery" queue and decision screen |
| App | fitflex-mobile#60 | Sign-in link, questions, status, cancel banner, profile reminder card |

Not built, by design: partner recovery (verified trainers, gym owners, vendors) until counsel answers decisions 3 and 9. Such accounts are refused with "contact FitFlex support". Staff and admin accounts are not offered recovery. Recovery answers are free text; no ID or selfie is collected in the member path.
