
FITFLEX AF
Technical Onboarding Brief
For the FitFlex Af Development Team
This document translates FitFlex Af's business model into the system requirements, rules, and architecture decisions needed before writing the first line of code.
Version 1.0  —  April 2026  —  Confidential

Product	FitFlex Af — Two-Sided Fitness Marketplace, Dar es Salaam, Tanzania
Founder / CEO	Nassor
Business Logic Doc	v2.0 (March 2026) — authoritative source for all business rules
Target Platforms	iOS App + Android App (Members & Trainers)  |  Web Portal (Gym Owners)
 
1. What Are We Building?

FitFlex Af is a two-sided digital marketplace for the fitness ecosystem in East Africa, starting with Dar es Salaam, Tanzania. Think ClassPass — but built for the realities of the East African market: mobile-money-first payments, data-light UX, offline-tolerant check-ins, and a gym ecosystem that currently runs on paper, WhatsApp, and cash.

The Two Sides of the Marketplace
Side	Who They Are	What FitFlex Gives Them
Supply (B2B)	Gym owners / gym operators	Digital management dashboard, analytics, new member acquisition via the FitFlex network, payout engine
Demand (B2C)	Gym members & independent trainers	Multi-gym access via one subscription (Platform Pass), QR check-in, trainer booking, credits wallet

⚡  The Cold-Start Problem — The Existential Risk
Gyms won't join without members. Members won't join without gyms. This is the classic two-sided marketplace chicken-and-egg problem. Our solution: seed the supply side first using trainers as warm-introduction partners (each trainer works across multiple gyms). Do NOT build features that assume a full network exists — build for Day 1 with 5 gyms.

User Types in the System
User Type	Primary App	Core Actions	Auth Notes
Gym Member	Mobile App (iOS/Android)	Subscribe, check in, discover gyms, book trainers, manage credits wallet	Phone/email + OTP
Trainer	Mobile App (shared app, trainer mode)	List services, manage bookings, track earnings, earn via gym referrals	Phone/email + OTP + profile verification
Gym Operator	Web Portal + Mobile App	Manage gym profile, scan QR codes, view analytics, manage payouts	Email + password + gym ID linked at onboarding
FitFlex Admin	Internal Admin Panel (Phase 2)	Onboard gyms, manage tiers, adjust rates, view platform financials	Role-based access control — build hooks now, UI later

🏗️  Corporate Wellness — Architecture Note (Build Hooks Now, UI Later)
Corporate accounts will allow companies to purchase bulk seat licenses for employees. This requires: (1) a new user role 'corporate_admin', (2) a many-to-many relationship between corporate accounts and member accounts, (3) group billing logic. Do NOT build the UI yet — but design the database schema and auth system to support multi-tenancy from Day 1. Adding this post-launch without prior schema design = a full rewrite.
 
2. Subscription Model — The Revenue Engine

FitFlex has two subscription tracks. Every billing decision in the codebase flows from this table. If you're unsure what a member is entitled to — refer here first.

Track A: Platform Pass (Multi-Gym Subscription)
Tier	Monthly Price	Visit Cap	Multi-Gym/Day	Gym Tiers Accessible	Trainer Discount
Basic	TZS 60,000	20 visits/mo	No (1 gym/day)	Standard only	None
Pro	TZS 120,000	30 visits/mo	Yes	Standard + Mid-Tier	10% off
Premium	TZS 200,000	40 visits/mo	Yes	Standard + Mid-Tier + Premium	20% off
Executive	TZS 350,000	Unlimited	Yes	All tiers incl. Luxury/Executive	20% off

🚨  Critical Business Rule — What Counts as a Visit (BL-002)
One visit = unlimited same-gym access for a full calendar day. Visiting a DIFFERENT gym on the same day depletes the monthly cap by 1. This means: Member checks into Gym A at 7am = 1 visit used. Goes back to Gym A at 6pm = NO additional visit used. Goes to Gym B later = 1 additional visit used. Basic tier: can only access 1 gym per day. Pro and above: multiple gyms per day, each new gym costs 1 visit from the monthly cap. This logic lives in the backend check-in validation — not the UI.

Track B: Direct Gym Subscription
A member subscribes to ONE specific gym through the FitFlex app. FitFlex acts as the payment processor and earns 10–15% commission. The member gets the gym's own subscription terms.

Attribute	Rule
Commission to FitFlex	10–15% of subscription fee (negotiated per gym at onboarding)
Gym access	That gym only, under gym's own terms (usually unlimited)
Top-up Roaming mechanic	Direct sub members can purchase a roaming top-up to access other network gyms. This gives 16 visits/month to non-home gyms at a flat fee (TBD: TZS 5,000–10,000 when direct sub fee >= Pro Pass price).
Credits deduction for roaming	Each roaming visit deducts from FitFlex Credits at standard per-visit rates by gym tier
Upsell trigger	System auto-prompts upgrade to Pro Pass after member uses roaming 2+ times in a month

Gym Classification Tiers
Each gym is classified at onboarding using a scored rubric. The tier determines which Platform Pass subscribers can access the gym AND the indicative per-visit payout rate.

Gym Tier	Indicative Per-Visit Payout	Accessible By	Typical Facility
Standard	TZS 5,000	Basic, Pro, Premium, Executive	Basic equipment, limited amenities
Mid-Tier	TZS 8,000	Pro, Premium, Executive	Good equipment, some classes, AC
Premium	TZS 13,000	Premium, Executive	Premium equipment, pool/sauna, classes
Luxury/Executive	TZS 20,000 - 25,000	Executive only	Luxury facilities, full-service spa

💡  Gym Tier is Set at Onboarding — Not Self-Reported
Gyms do not choose their own tier. FitFlex staff classify each gym using a scored rubric at onboarding. The tier field in the database is set by FitFlex Admin only. This prevents gaming. Build the admin interface to support tier assignment with an audit log.
 
3. FitFlex Credits Wallet

The Credits Wallet is a core fintech feature — not a loyalty points system. It functions as prepaid stored value denominated 1:1 with Tanzanian Shillings. The banking infrastructure partner is Selcom Commercial Bank, operating under Bank of Tanzania (BOT) requirements.

Credits Wallet Rules
Rule	Detail
Denomination	1 TZS Credit = TZS 1 in real value
Withdrawability	Non-withdrawable. Credits can only be spent within the FitFlex platform.
Expiry	90-day rolling expiry. The 90-day clock RESETS on any top-up activity. This is critical — expiry is not fixed-date from purchase.
Deduction trigger	Credits are deducted per visit for Direct Sub members using roaming. Per-visit deduction = gym tier rate.
Forfeiture language	Open Item OI-009 — T&C language for credits forfeiture on expiry not yet finalized. Do not build the expiry enforcement mechanism without final legal text.

🏦  Credits Wallet = Banking Float — Not a Liability
This is a critical reframe for the team: non-withdrawable credits held in user wallets represent committed float for our BaaS partner (Selcom Commercial Bank), not a balance sheet liability for FitFlex. This is the same model as prepaid airtime. Design the wallet system with a GL-backed account structure — each user wallet maps to a general ledger sub-account, not raw cash reserves. This is an OI-008 open item: formal BaaS agreement with Selcom Commercial Bank is pending.

Per-Visit Deduction Rates (for Roaming)
Gym Tier	Credits Deducted Per Roaming Visit	Applies To
Standard	TZS 5,000	Direct Sub members using roaming top-up
Mid-Tier	TZS 8,000	Direct Sub members using roaming top-up
Premium	TZS 13,000	Direct Sub members using roaming top-up
Luxury/Executive	TZS 20,000 – 25,000	Direct Sub members using roaming top-up

🚨  Critical Dev Rule — Credits Are Separate From Subscription Billing
Platform Pass subscription payments flow through Selcom payment gateway (real TZS collected). Credits are internal stored value topped up separately. These are TWO SEPARATE ledgers. Do not conflate them in the schema. A member's subscription status and their credits balance are independent fields. Subscription lapse does not zero out credits.
 
4. Gym Payout Engine — The 5-Band Model

How FitFlex pays gyms is one of the most complex parts of the system. It is NOT a simple flat commission. It is a graduated 5-band structure where payout speed accelerates and commission rate decreases as a gym generates more visits per month.

The 5-Band Payout Structure
Band	Monthly Visits	Commission Rate	Payout Speed	Net Rate to Gym	Notes
1	0 – 49	25%	30 days	75% of payout value	Low volume, slow payout
2	50 – 149	20%	14 days	80% of payout value	Growing gym
3	150 – 299	15%	7 days	85% of payout value	Strong performer
4	300 – 499	10%	Instant	90% of payout value	High volume — instant payout
5	500+	0% commission	Instant	Flat monthly fee (pre-negotiated)	Flat fee replaces per-visit model entirely

💡  Why Band 5 Exists — Margin Protection at Scale
At 500+ visits/month, the per-visit payout model becomes expensive for FitFlex. Band 5 converts the payout to a pre-negotiated flat monthly fee — paid instantly. This is confirmed via financial modeling. The flat fee is always lower than what per-visit payouts would cost at that volume. This is non-negotiable margin architecture. The system must detect when a gym crosses 500 visits and trigger the contract renegotiation workflow.

🚨  Dev Critical — Payout Amounts Are Calculated, Not Stored
Do NOT hardcode payout amounts. The payout engine must calculate the correct amount dynamically from: (1) visits logged in the billing period, (2) gym's negotiated per-visit rate (stored in gym_rates table), (3) current band based on visit volume, (4) commission rate for that band. Payout speed determines when the disbursement is triggered. Band transitions must be re-evaluated every billing cycle — a gym moves bands monthly, not permanently.

Trainer Payout Logic
Trainers are paid per session booked through FitFlex. The commission structure is different from gyms.

Rule	Detail
Commission rate	15–20% of session fee (negotiated individually at trainer onboarding)
Calculation order	(1) Apply member's Pass tier discount to session price → (2) Calculate FitFlex commission on discounted price → (3) Trainer payout = discounted price minus commission
Who absorbs member discount	FitFlex absorbs the trainer discount — NOT the trainer. The trainer's income is only reduced by the platform commission, not the member discount.
Pro Pass discount	10% off session price to member. FitFlex earns commission on the discounted amount.
Premium Pass discount	20% off session price to member. FitFlex earns commission on the discounted amount.
 
5. QR Check-In Engine

The check-in system is the physical access gate for every gym visit. It must be fast, reliable under poor connectivity, and impossible to game. Every check-in event is the data source for both visit-cap enforcement and gym payout calculations.

Two Check-In Modes
Mode	Who Scans	What Is Scanned	Use Case	Connectivity
Member Scans Gym	Member (phone camera)	Gym's STATIC QR code (posted at entrance)	Self-service, no staff needed	Online validation required
Gym Scans Member	Gym operator (camera in Owner App)	Member's DYNAMIC QR code (regenerates every 60 sec)	Staffed gyms, higher security, audit trail	Online validation required

⚡  Dynamic QR for Members — Security Requirement
The member-side QR code must regenerate every 60 seconds and be tied to a short-lived server-side token. This prevents screenshot sharing of QR codes to allow unauthorized entry. Static member QR codes are a security vulnerability. The gym-side QR code (posted at entrance) is static — it identifies the gym, not the member.

Check-In Validation Sequence (BL-012)
All four conditions must pass in sequence before check-in is confirmed:

1.	Is the member's subscription active (not expired, not in grace period)?
2.	Does the member's subscription tier grant access to THIS gym's tier? (e.g., Basic cannot enter Mid-Tier gyms)
3.	If on a capped plan (Basic/Pro/Premium): does the member have remaining visits this month?
4.	Is the gym currently within its operating hours?

🚨  Failure Messages Must Be Specific — Not Generic
The check-in failure message shown to the member must identify EXACTLY which condition failed. A generic 'Access Denied' is unacceptable. Examples: 'Your subscription has expired — Renew Now' / 'This gym requires a Pro Pass or higher — Upgrade' / 'You have used all 20 visits this month' / '[Gym Name] is currently closed. Opens at 6:00 AM'. Each failure type has a specific CTA (button) linked to the resolution action.

Check-In Data Logged Per Event
Every successful check-in MUST write these fields to the database. Missing any field = payout calculation errors:

•	member_id — links to member account
•	gym_id — links to gym record
•	timestamp — full date + time (UTC, displayed in EAT)
•	checkin_method — 'member_scanned' or 'gym_scanned'
•	subscription_type — 'platform_pass', 'direct_sub', 'roaming_topup'
•	pass_tier — 'basic', 'pro', 'premium', 'executive' (null if direct sub)
•	visit_number_in_cycle — integer (1 to cap) for capped plans, null for unlimited
•	gym_tier — 'standard', 'midtier', 'premium', 'luxury_executive' (for payout calc)
 
6. Payment Architecture

Tanzania is a mobile-money-first market. Bank cards are rare outside corporate users. The payment stack must treat M-Pesa, Airtel Money, and Tigo Pesa as first-class payment methods — not afterthoughts.

Recommended Payment Gateway: Selcom
Selcom API aggregates M-Pesa, Airtel Money, Tigo Pesa, and bank payments under a single integration — making it the most efficient single integration for the Tanzanian market. This avoids managing three separate mobile money APIs.

Item	Detail
Primary gateway	Selcom API — aggregates M-Pesa, Airtel Money, Tigo Pesa, bank transfer
Alternative	Vodacom Tanzania M-Pesa Daraja API (M-Pesa only — use only if Selcom integration fails)
Requirement	Tanzanian business registration + CBT (Central Bank of Tanzania) licence compliance
Status	Open Item OI-004 — Selcom business account activation pending TZ business reg
BaaS Partner	Selcom Commercial Bank — GL-backed accounts for credits wallet under BOT requirements

Payment Flow (Subscription)
5.	Member selects Platform Pass tier or Direct Sub in app
6.	App calls backend /subscriptions/initiate endpoint
7.	Backend calls Selcom API to initiate payment push to member's mobile number
8.	Member receives mobile money prompt (STK push) and confirms payment
9.	Selcom sends webhook to FitFlex backend confirming payment success/failure
10.	On success: subscription record activated, confirmation sent via push + SMS
11.	On failure: member shown recovery options, NO subscription activated

🚨  Never Activate Subscription Before Payment Confirmation
The subscription MUST NOT be activated until the payment webhook from Selcom is received and verified. Do not optimistically activate on the client side. The webhook is the source of truth. Implement idempotency keys on the webhook handler to prevent duplicate activations on retry.

Auto-Renewal Logic (BL-008)
•	All Platform Pass subscriptions are auto-renewing
•	Member is charged on the same calendar date each month (anniversary billing, not 1st of month)
•	System sends renewal reminder push notification 3 days before charge date
•	If payment fails: 24-hour grace period, then subscription pauses (access suspended)
•	Grace period: member retains access for 24 hours after failed payment to allow retry
•	After grace period: subscription moves to 'suspended' state — QR check-in returns 'subscription expired'
 
7. Recommended Architecture & Tech Stack

⚠️  This Is a Recommendation — Team Must Confirm
The following stack is recommended based on the product requirements, market context (East Africa, data-light UX, mobile money), and the goal of maximum code reuse across platforms. The team must confirm skill alignment before committing. Change the stack if necessary — but document the reason and the trade-offs.

Monorepo Structure
A monorepo (single repository containing all applications) is strongly recommended. It enables shared TypeScript types, shared business logic (pricing constants, tier rules, payout formulas), and shared API contracts across the mobile app, web portal, and backend.

Package/App	Technology	Responsibility
apps/mobile	React Native (Expo)	Member + Trainer app (iOS & Android)
apps/web-portal	Next.js	Gym Owner dashboard (web)
apps/admin	Next.js (lightweight)	FitFlex internal ops — build hooks now, UI Phase 2
packages/api	Node.js + Express or NestJS	Single REST API + WebSocket for real-time check-ins
packages/db	PostgreSQL via Prisma ORM	All persistent data — schema is the source of truth
packages/shared	TypeScript	Pricing constants, tier rules, payout formulas, type definitions
packages/payments	TypeScript	Selcom API wrapper, credits logic, payout disbursement
infra/	Railway or Render (MVP), AWS later	Cloud hosting, environment management, CI/CD

💡  The packages/shared Package is Your Business Logic in Code
Every pricing constant, tier rule, visit-cap value, payout band, and commission rate lives in packages/shared. When a variable changes (e.g., a tier price is updated), change it in ONE place — it propagates to mobile app, web portal, and backend automatically. This is the technical equivalent of syncing across all documents.

Database Schema — Critical Tables
These are the minimum tables required for MVP. Design these first — everything else depends on them:

•	users — id, phone, email, user_type (member/trainer/gym_operator/admin/corporate_admin), created_at
•	gyms — id, name, tier (standard/midtier/premium/luxury_executive), location, operating_hours, per_visit_rate, commission_rate, status
•	subscriptions — id, user_id, type (platform_pass/direct_sub), tier, status, started_at, renews_at, home_gym_id (nullable)
•	checkins — id, user_id, gym_id, timestamp, method, subscription_type, pass_tier, visit_number_in_cycle, gym_tier
•	credits_wallet — id, user_id, balance_tzs, last_topup_at, expires_at (rolling 90 days from last_topup_at)
•	credits_transactions — id, wallet_id, amount, type (topup/deduction/expiry), reference, created_at
•	payouts — id, gym_id, period_start, period_end, visit_count, band, commission_rate, gross_amount, net_amount, status, disbursed_at
•	trainer_sessions — id, trainer_id, member_id, gym_id, session_type, member_price, discount_pct, commission_rate, trainer_payout, status
•	corporate_accounts — id, company_name, status, seat_limit (design now, implement Phase 2)
 
8. MVP Scope & Build Sequence

Build in this exact sequence. Each phase gates the next. Do not start Phase 2 without Phase 1 passing QA.

Phase 1: Backend API (Weeks 1–3)
Nothing else is built until the API is done and tested. All business logic lives here.

•	Database schema (all critical tables above) via Prisma migrations
•	Auth system — OTP-based phone auth, JWT tokens, role-based middleware
•	Gym management endpoints (CRUD, tier assignment, operating hours)
•	Subscription engine — create, activate, renew, suspend, cancel
•	Visit-cap enforcement logic — stateful check per member per billing cycle
•	Check-in validation engine (BL-012) — all 4 conditions in sequence
•	Check-in logging — write all 8 required fields per event
•	Credits wallet — balance, top-up, deduction, 90-day rolling expiry
•	Payout calculation engine — 5-band logic, commission rates, disbursement triggers
•	Selcom payment integration — STK push, webhook handler, idempotency
•	Unit tests for: visit-cap logic, payout band calculation, credits expiry, trainer payout formula

Phase 2: Gym Owner Web Portal (Weeks 4–6)
The existing fitflex-af-owner-prototype.html is the UI specification. Build against it.

•	Gym operator login + auth
•	Dashboard — live visit count, revenue summary, member flow chart
•	Check-in scanner — camera-based QR scanner to validate member QR codes
•	Member management — list of members who checked in, visit history
•	Payout history — view disbursements by period, current band status
•	Gym profile management — edit facilities, hours, amenities, subscription options

Phase 3: Member Mobile App (Weeks 7–10)
The existing fitflex-af-prototype.html is the UI specification. Build against it.

•	Onboarding — language selection, account type, signup (phone OTP), fitness goals
•	Subscription selection — Platform Pass tiers, Direct Sub, payment via Selcom
•	QR check-in — generate dynamic rotating QR code (60-sec refresh)
•	Gym discovery — map view, filter by tier, search, gym detail page
•	Visit history + cap tracker — 'X of 20 visits used this month'
•	Credits wallet screen — balance, top-up, transaction history, expiry date
•	Trainer booking — browse trainers, select session type, pay in-app
•	Push notifications — renewal reminders, check-in confirmations, upsell prompts

Phase 4: Integration & Payment Testing (Weeks 10–12)
•	End-to-end payment flow testing in Selcom sandbox
•	Live transaction testing with real accounts (minimum TZS 100 test transactions)
•	Payout disbursement dry-run to gym test accounts
•	Load testing: 50 concurrent check-ins, 100 concurrent subscription activations
•	Security audit: QR token generation, payment webhook verification, auth tokens

Post-MVP (Do Not Build Now)
Feature	Reason Deferred
Trainer booking	Validate core subscription model first
Corporate wellness portal	Schema hooks built in Phase 1, UI Phase 2+
Fitness marketplace	Marketplace commission structure not yet defined (OI-007)
Gamification (streaks, badges)	Nice-to-have, not revenue-critical
Multi-city expansion	Validate DSM model first
Credits-based international pricing	East Africa expansion feature, not MVP
 
9. Open Items — Decisions Needed Before Dev

These items are unresolved and will block specific development modules. Each item has a hard deadline tied to the build sequence.

ID	Item	Context	Blocks
OI-002	Top-up flat fee (TZS)	TZS 5,000–10,000 suggested for roaming when direct sub >= Pro price. Not confirmed.	Credits deduction logic
OI-004	Selcom API activation	Requires TZ business registration. In progress.	Phase 4 payment testing
OI-005	Refund policy detail	No pro-rata refunds stated. Edge cases (duplicate charge, gym closure mid-month) undefined.	Customer support flows
OI-007	Marketplace commission	Marketplace is post-MVP but margin structure not defined. Build schema placeholder.	Marketplace dev
OI-008	Selcom BaaS agreement	Formal GL-backed account structure with Selcom Commercial Bank pending.	Credits wallet enforcement
OI-009	Credits forfeiture T&C	Legal language for credits expiry/forfeiture not finalized. Cannot enforce expiry without this.	Credits expiry logic

✅  Resolved Items — These Are Confirmed and Can Be Coded
The following items from earlier versions are now RESOLVED and confirmed in Business Logic Doc v2.0: (OI-001) Tier pricing: Basic TZS 60k / Pro TZS 120k / Premium TZS 200k / Executive TZS 350k. Gym classification rubric: 4-tier system with scored rubric (Standard / Mid-Tier / Premium / Luxury-Executive). Payout band structure: 5-band graduated model confirmed. Credits expiry: 90-day rolling, resets on any top-up. Trainer discount absorption: FitFlex absorbs, not the trainer.

10. Questions for the Development Team

Before the first sprint begins, the founding team needs clear answers to the following from the tech team:

12.	What is the confirmed tech stack? (React Native vs Flutter, Node vs Python, Prisma vs Mongoose — decide and commit.)
13.	Who is the single technical decision-maker for architecture? (Not consensus — one person with final say.)
14.	What is the team's experience with Selcom API or any Tanzanian mobile money integration? Have you integrated STK push before?
15.	Can you confirm your capacity for the 12-week MVP build? We need a timeline commitment, not a goodwill estimate.
16.	Who is responsible for security review? (QR token generation, webhook verification, auth tokens, payment security.)
17.	Have you reviewed the existing HTML prototypes (fitflex-af-prototype.html and fitflex-af-owner-prototype.html) as UI specifications?
18.	What is your CI/CD and hosting preference for MVP? (Railway, Render, DigitalOcean, AWS — cost and complexity vary significantly.)



FitFlex Af  —  Technical Onboarding Brief v1.0  —  April 2026  —  Confidential
Questions? Contact Nassor (Founder / CEO) — the Business Logic Document v2.0 is the authoritative reference.
