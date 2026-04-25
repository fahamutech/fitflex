Detailed Requirements Pack
Subject Line: RFP: FitFlex Af MVP Development – Tanzania Fitness Marketplace (React Native + Next.js + Prisma)
FitFlex Af – MVP Development Requirements Pack Version: 1.0 (April 2026) 
Prepared for: Development Team 
Contact: Nassor (Founder/CEO) 
Authoritative Sources:
•	Business Logic & Rules Document v2.0 (March 2026) – this is the single source of truth for all rules
•	Technical Onboarding Brief v1.0 (April 2026)
•	HTML Prototypes (fitflex-af-prototype.html for member app + owner portal reference)
•	User Flow Diagrams (fitflex-af-flow-diagrams.html)
1. Project Overview
FitFlex Af is a two-sided fitness marketplace for Tanzania (starting in Dar es Salaam & Zanzibar). It offers multi-gym access via a four-tier Platform Pass, a FitFlex Credits Wallet, QR check-in, direct gym subscriptions, and trainer booking.
Core Value: Members get flexible gym access cheaper than single-gym memberships. Gym owners get digital tools, analytics, and new customers.
Target Platforms (MVP):
•	Member + Trainer Mobile App: React Native (Expo preferred for speed) – iOS & Android
•	Gym Owner Portal: Next.js (web)
•	Backend: Node.js (NestJS or Express) + Prisma + PostgreSQL
•	Monorepo strongly recommended (Turborepo or Nx) for shared types/logic
Currency & Payments: All in TZS. Primary gateway: Selcom API (aggregates M-Pesa, Airtel Money, etc.). BaaS via Selcom Commercial Bank for Credits Wallet (GL-backed accounts).



Key Constraints:
•	Strictly follow Business Logic Document v2.0 (especially visit counting BL-010/BL-011, check-in validation BL-012, 5-band payout engine, credits 90-day rolling expiry).
•	No pro-rata refunds. Auto-renewing subscriptions with 3-day + 1-day notifications.
•	Offline-tolerant QR check-in where possible.
•	Swahili + English support from Day 1.
2. Core Features & Business Rules (Must Be Implemented Exactly as Documented)
User Types: Gym Member, Trainer, Gym Operator, FitFlex Admin (hooks only for now).
Platform Pass Tiers (v2.0 pricing – confirmed):
•	Basic: TZS 60,000 – 20 visits – Standard gyms only
•	Pro: TZS 120,000 – 30 visits – Standard + Mid-Tier
•	Premium: TZS 200,000 – 40 visits (soft cap) – + Premium gyms
•	Executive: TZS 350,000 – Unlimited – All gyms incl. Luxury/Executive
Gym Tiers & Access Rules: Standard / Mid-Tier / Premium / Luxury-Executive (set by FitFlex at onboarding, not self-reported).
Visit Counting (Critical – BL-010, BL-011):
•	One check-in = one visit (same gym same calendar day = still one visit).
•	Different gym same day = additional visit deducted.
•	Basic: max 1 gym per day. Pro+: multiple gyms per day.
•	Counter resets on subscription anniversary date. No rollover.
QR Check-In Validation (BL-012 – must be sequential):
1.	Subscription active (incl. 24h grace)?
2.	Tier covers this gym’s tier?
3.	Visits remaining (if capped)?
4.	Gym within operating hours?
Specific failure messages + CTAs required.

FitFlex Credits Wallet:
•	1:1 with TZS, non-withdrawable.
•	90-day rolling expiry (resets on any top-up).
•	Used for roaming (direct subs), trainer bookings, marketplace, tier upgrades.
•	Per-visit deduction rates by gym tier (Standard 5k, Mid 8k, Premium 13k, Luxury 20-25k).
Payout Engine (5-Band – Critical for margins): Band based on monthly visits from Platform Pass members. Commission decreases, payout speed accelerates. At Band 5 (500+ visits): switch to pre-negotiated flat monthly fee.
Payment Flow: Selcom STK push + webhook (idempotent). Never activate subscription/credits before confirmed webhook. Auto-renewal with notifications.
Direct Gym Subscriptions: 10–15% commission to FitFlex.
Other MVP Rules: See full Business Logic Doc sections 1–10.
3. Technical Requirements
•	Monorepo with packages/shared for all business constants, tier rules, payout formulas, types.
•	Database: PostgreSQL + Prisma ORM. Must include tables for users, gyms (with tier), subscriptions, checkins (all 8 logged fields), credits_wallet + transactions, payouts, etc.
•	Auth: Phone OTP primary (Swahili/English). JWT. Role-based access.
•	Security: Dynamic member QR (rotate every 60s), webhook verification, rate limiting on check-ins.
•	Notifications: Push + SMS (renewals, check-in confirm, failures).
•	Analytics: Basic real-time visit data for gym owners.
•	Hosting (MVP): Railway or Render (easy Postgres + Node).
•	Testing: Unit tests for visit logic, payout bands, credits expiry, check-in validation. End-to-end payment dry-run.
Open Items (note in contract): OI-003 (exact commissions), OI-005 (refund edges), OI-007 (marketplace), OI-008/009 (BaaS & credits T&C) – these will be resolved before affected modules.

4. Deliverables & Acceptance Criteria
See the 12-week plan below.
 
5. Timeline & Budget
We target a 12-week MVP. Please propose your team size, weekly rate or fixed price per phase, and any questions/clarifications.

6. Next Steps
1.	Confirm you have read the attached Business Logic Doc v2.0 and Technical Onboarding Brief.
2.	Provide your proposed tech stack confirmation and any deviations.
3.	Share a sample contract/milestone structure.
Attachments:
•	Business Logic & Rules v2.0 (HTML)
•	Technical Onboarding Brief v1.0 (DOCX)
•	Pricing Strategy v2.0
•	HTML Prototypes + Flow Diagrams
•	12 week implementation plan

