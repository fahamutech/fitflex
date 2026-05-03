# FitFlex Af Platform

Three apps + shared docs, built per RFP / Business Logic Doc v2.0.

| Folder | Stack | Purpose |
|--------|-------|---------|
| [`fitflex-functions/`](./fitflex-functions/) | Node.js (bfast-functions) + JSON store, Prisma schema for Postgres pilot migration | REST/SCHEDULE/SOCKET API. All BL-* business rules live in `src/shared/`. 28 unit + service tests. |
| [`fitflex-portal/`](./fitflex-portal/) | Next.js 15 + Tailwind v4 + TS | Gym-operator + admin web portal. EN/SW i18n, Playwright E2E. |
| [`fitflexmobile/`](./fitflexmobile/) | Flutter 3.x | Member + Trainer mobile app. EN/SW i18n, design tokens, dynamic 60s QR. |

## Run the full stack

```bash
# 1. Backend (port 3000)
cd fitflex-functions && npm install && npm test && npm start

# 2. Portal (port 3001)
cd fitflex-portal && npm install && npm run dev

# 3. Mobile
cd fitflexmobile && flutter pub get && flutter run
#   For web: flutter run -d chrome --web-port 8080 \
#            --dart-define=API_BASE=http://localhost:3000
```

## Demo credentials

| Role          | Where    | Credentials                                          |
|---------------|----------|------------------------------------------------------|
| Gym member    | mobile   | Firebase Google sign-in; new mobile users self-select member/trainer |
| Gym operator  | portal   | Firebase Google sign-in with email pre-assigned to `gym_operator` |
| FitFlex admin | portal   | Firebase Google sign-in with email pre-assigned to `admin` |

## Core feature implemented end-to-end

**QR Check-in (BL-010, BL-011, BL-012)**

```
mobile (member)            backend                    portal (operator)
──────────────────         ──────────────────         ──────────────────
1. Google sign-in ───────► Firebase Auth
                           /auth/firebase/session  ──► FitFlex JWT
2. Request Pro ─────────► /me/subscribe        ─► payment_pending
3. Admin approves ──────► /admin/payment-requests/:id/decision
4. Show rotating QR ◄──── /me/qr (60s HMAC)
                                                   5. Google sign-in
                           /auth/firebase/session ◄──── Firebase ID token
                                                   6. Scan member QR (camera + jsQR)
                           /operator/checkins ◄── { qrToken }
                              │
                              ├─ verify HMAC
                              ├─ BL-012 step 1: subscription active?
                              ├─ BL-012 step 2: tier covers gym tier?
                              ├─ BL-012 step 3: visits remaining?
                              ├─ BL-012 step 4: gym open?
                              ├─ BL-010/011: same-gym/same-day = no extra visit
                              └─ Log all 8 BL-015 fields
                              ▼
                          ✅ visitNumberInCycle  ─► success card + recent list
```

## Tracking

See [`FEATURE_MATRIX.md`](./FEATURE_MATRIX.md) for the live status of all 20 user stories (US-001 to US-020) across the three surfaces, and the cross-cutting concerns (i18n, design tokens, payouts, Selcom open items, etc.).

## Open items blocking full implementation

- **OI-004** Selcom STK push + webhook signature verification (`/webhooks/selcom` is stubbed and idempotent); pilot uses admin-approved payment requests
- **OI-008** Selcom BaaS GL-account ledger for credits
- **OI-009** Credits forfeiture T&C — expiry computed but not enforced
