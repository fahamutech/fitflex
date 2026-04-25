1. Detailed Backlog of User Stories with Acceptance Criteria
I organized this as Epics → User Stories with clear Acceptance Criteria (AC). Prioritize by the 12-week phases. All stories strictly enforce rules from the Business Logic Doc (e.g., BL-008 to BL-012, visit counting, 5-band payouts, credits expiry).
Epic 1: Authentication & Onboarding (Phase 1 + 3)
•	US-001: User selects language and account type on first launch AC: Splash screen shows language selector (English/Kiswahili). Account type: Gym Member / Trainer / Gym Owner. Selection persists. Matches prototype flow.
•	US-002: Phone OTP-based signup / signin AC: User enters phone → OTP sent → verification. JWT issued with role. Error handling for invalid OTP. Supports both member and trainer modes.
•	US-003: New member sets fitness goals and profile details AC: Goal selection (lose weight / gain muscle / stay fit). Intensity level. Basic profile (height, weight, photo optional, notification prefs). Skippable. Data saved to DB.
Epic 2: Gym & Tier Management (Admin/Backend)
•	US-004: Admin onboards gym with tier classification AC: CRUD for gyms. Tier (Standard/Mid-Tier/Premium/Luxury-Executive) set only by admin with audit log. Fields: name, location, operating hours, amenities, per-visit rate (negotiated). Matches Section 2.2 criteria.
•	US-005: Gym tier determines access rules AC: Backend enforces tier access (e.g., Basic only Standard gyms). Upgrade prompt shown on violation (BL-001).
Epic 3: Subscription & Payment Engine (Core – Phase 1 + 3)
•	US-006: Member purchases Platform Pass tier AC: Display 4 tiers with exact v2.0 pricing (60k/120k/200k/350k), visit caps, gym access. Selcom STK push initiation. Subscription created only on webhook success. Auto-renewing on anniversary date (BL-008). 3-day + 1-day notifications.
•	US-007: Direct Gym Subscription with commission AC: Member selects specific gym → pays via Selcom. FitFlex earns 10–15% (configurable per gym). Access limited to that gym only.
•	US-008: Payment failure & recovery AC: Retry after 6 hours. 24h grace period. Specific messages + retry/downgrade options. No activation on failure.
•	US-009: Renewal notification sequence AC: T-3 (push/in-app), T-1 (push/SMS), T=0 (confirmation or failure). Matches table in Section 7.2.
Epic 4: FitFlex Credits Wallet (Phase 1 + 3)
•	US-010: Top-up and manage Credits Wallet AC: Balance shown (1:1 TZS). Top-up via Selcom. 90-day rolling expiry (resets on any top-up). Non-withdrawable. Transaction history logged.
•	US-011: Credits deduction for roaming / upgrades AC: Per-visit rates by gym tier (Standard 5k, Mid 8k, Premium 13k, Luxury 20-25k). Deduction only for direct subs roaming or tier upgrades. Logs pre/post balance.
Epic 5: QR Check-In & Visit Rules (Critical – Phase 1 + 3)
•	US-012: Member generates dynamic QR for check-in AC: QR rotates every 60 seconds, tied to short-lived server token. Display in app. (Gym-scans-member mode).
•	US-013: Gym QR scanning (member scans gym or gym scans member) AC: Two modes supported. Validation runs BL-012 sequence exactly. Specific failure messages + CTAs (e.g., "Upgrade Plan" button).
•	US-014: Visit counting & cap enforcement AC: One check-in = one visit. Same gym same day = no extra deduction. Different gym = extra. Basic: 1 gym/day max. Reset on subscription anniversary. No rollover. Unlimited plans still log visits. Matches BL-010/BL-011 + formula example.
•	US-015: Check-in logging AC: Every successful check-in logs: member_id, gym_id, timestamp, method, subscription_type, pass_tier, visit_number_in_cycle, gym_tier, credits deducted (if any).
Epic 6: Gym Owner Portal (Phase 2)
•	US-016: Gym owner dashboard & analytics AC: Real-time visits, peak hours, attendance trends, payout summary, current band.
•	US-017: QR scanner for gym operators AC: Camera scans member dynamic QR. Validates and logs check-in.
•	US-018: Payout history & band status AC: Shows disbursements, visit count, band, commission rate. Weekly (direct sub) / monthly (pass) timing.
Epic 7: Payout Engine (Phase 1)
•	US-019: Calculate & trigger gym payouts AC: 5-band logic based on monthly Platform Pass visits. Dynamic per-visit rates by gym tier. Commission decreases + payout speed accelerates. Band 5: flat monthly fee. Disbursement via mobile money/bank (placeholder for now). Recalculate band monthly.
Epic 8: Notifications & Misc (Across phases)
•	US-020: Push + SMS notifications AC: Renewal sequence, check-in confirm, payment failure, low visits/expiry nudges.
Prioritization Note: Implement core rules (visit counting, check-in validation, payouts, credits) with heavy unit tests first. UI follows provided HTML prototypes.
