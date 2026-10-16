# Comment-to-DM Setup Guide and Design — fitflex.africa

Status: **draft, docs only. Nothing has been built or created in Meta yet.**
Account: fitflex.africa, an Instagram **Business** account (confirmed 2026-10-09).
Facts below come from Meta's developer docs read on 2026-10-09. Meta changes this tooling often, so re-check the linked pages and the app dashboard when you actually set it up.

Sources:
- [Private replies](https://developers.facebook.com/docs/instagram-platform/private-replies)
- [Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks)
- [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- [Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)

---

## 1. What we're building

A viewer comments a keyword on a FitFlex post (for example **PARTNER**). FitFlex's server sees the comment and sends that one person a DM with the right link. This is the "comment WORD and I'll send you X" pattern from the swipe file.

## 2. What Meta allows (and what it doesn't)

| Rule | What the docs say |
|---|---|
| Mechanism | Private Replies: `POST /<IG_ID>/messages` replying to a specific comment |
| Window | Within **7 days** of the comment (for Live, only during the broadcast) |
| Volume | **One** message per comment. A follow-up is only allowed if the person replies, and within 24 hours |
| Where it lands | Inbox if the person follows us, **Requests** folder if not |
| Works on | Posts, reels, stories, Live and ad posts |
| Permissions (Instagram Login) | `instagram_business_basic`, `instagram_business_manage_comments`. Sending DMs normally also needs `instagram_business_manage_messages`. Confirm in the dashboard |
| Other scopes we may want later | `instagram_business_content_publish` (scheduling posts) |
| Rate limits | Not stated on the private-replies page; check the rate-limit docs before launch |

**Correction to what I said earlier:** with the *Instagram Login* route, a linked Facebook Page is **not** required. A Page is only needed on the older *Facebook Login* route. Use the Instagram Login route.

## 3. The main constraint: webhooks need an approved app

- To receive **comment webhooks**, the app must be set to **Live**, and Meta requires **Advanced Access** for the `comments` field.
- Advanced Access means passing **Meta App Review** (screencast, privacy policy URL, usually business verification too). That can take days to weeks.
- In **Development mode** the app does not receive webhook events.

So there are two paths:

| Path | How | When to use |
|---|---|---|
| **A. Polling (start here)** | Our server checks recent comments on our own posts every few minutes via the comments API, matches keywords, sends private replies | Works while the app is in development mode with a role on our own account. No App Review needed to start. A few minutes of delay. Confirm in practice |
| **B. Webhooks (later)** | Meta pushes comment events to our server instantly | After App Review is approved. Faster and cheaper on API calls |

Recommendation: build **A** first behind a feature flag, apply for App Review in parallel, and switch to **B** when approved. The matching and sending logic is identical.

## 4. Steps only you can do

I can't log in to Meta or accept its terms for you. Do these, and tell me when each is done:

1. Sign in at developers.facebook.com with an account that can manage fitflex.africa, and register as a developer.
2. Create an app (type **Business**). Name suggestion: "FitFlex Social".
3. Add the **Instagram** product and choose the **API setup with Instagram login** option.
4. Add fitflex.africa as an Instagram account the app can use (the dashboard calls this adding an Instagram tester or role, then accepting the invite inside Instagram under Apps and websites).
5. Generate an access token for the account in the dashboard. **Do not paste tokens or the app secret into chat.** They go into the server's secret/config storage only.
6. For App Review later: publish a privacy policy URL, prepare a short screencast of the keyword flow, and be ready for business verification of FitFlex Africa.

## 5. Design (fitflex-functions)

Runs as a small module in the existing backend, off by default.

**Data**
- `social_keyword_rules`: keyword (case-insensitive), reply text (English and Swahili), link, active flag, optional post filter.
- `social_dm_log`: comment id (unique), commenter id, rule id, status (sent, failed, skipped), timestamp, error. The unique comment id is what stops duplicates.
- `social_ig_account`: Instagram account id, token expiry, last poll time. The token itself lives in secret config, not the database.

**Flow (Path A, polling)**
1. Scheduled job every few minutes: fetch our recent media, then new comments since `last poll time`.
2. Match each comment's text against active keyword rules (whole word, case-insensitive).
3. If a rule matches and the comment id is not in the log: send the private reply, then write the log row.
4. Skip our own comments, replies, and already-logged ids. Cap sends per run.
5. On failure, record the error and retry once or twice, never more. Alert if failures spike.

**Flow (Path B, webhooks):** the same steps 2–5, triggered by Meta's POST. Needs a public HTTPS endpoint that answers Meta's verification request and checks the `X-Hub-Signature-256` signature using the app secret.

**Admin controls (portal, later):** list rules, pause all sending with one switch, see the log.

**Safety**
- One reply per comment, enforced by the unique id.
- Reply text is fixed per rule, never generated per user.
- Tokens: long-lived tokens expire (roughly 60 days) and must be refreshed on a schedule. Verify the current lifetime and refresh endpoint in the docs.
- Secrets only in server config. Never in the mobile app, portal or repo.
- A global kill switch and a per-rule switch.
- Log only what's needed: comment id, commenter id, outcome. No profile scraping.

## 6. Keyword rules for week 1 (no invented offers)

Every keyword delivers something the product already supports.

| Keyword | Who | DM contains |
|---|---|---|
| **PASS** | Members | One-line explanation of the Platform Pass plus the app download link |
| **PARTNER** | Gym owners | Short explanation of partnering with FitFlex plus the partner sign-up link or contact |
| **TRAINER** | Trainers | Short explanation of the trainer side plus the trainer sign-up link |

Notes:
- Android is live, iOS is not. Don't promise iOS in the DM text.
- Final links and wording need approval before sending. The legal drafts are still with counsel, so keep the DM to plain descriptions with no promises about prices or payouts.

## 7. Build phases (each needs your go-ahead)

| Phase | What | Needs from you |
|---|---|---|
| 0 | You create the Meta app and connect the account (section 4) | Steps 1–5 |
| 1 | Backend: keyword rules, DM log, polling job, kill switch. Feature flag off | Go-ahead, reply texts |
| 2 | Test on one hidden post with your own second account | Approval to send the first real private reply |
| 3 | Portal screen to manage rules and see the log | Go-ahead |
| 4 | App Review submission, then move to webhooks | Privacy policy URL, screencast, business verification |
| 5 | Optional: insights dashboard and scheduled publishing (needs `instagram_business_content_publish` and insights permissions) | Go-ahead |

## 8. Open decisions

1. Which keywords and final DM texts (English and Swahili)?
2. Where do PARTNER and TRAINER DMs link: a sign-up page, a WhatsApp number, or an email?
3. Who owns the Meta developer account? Use a FitFlex company account rather than a personal one, so access isn't lost if someone leaves.
4. Is a public privacy policy page available for App Review?
