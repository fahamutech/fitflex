# FahamuTech — Review & Coordination Notice

**Date:** September 16, 2026  
**From:** FitFlex Product Team  
**To:** FahamuTech Development Team  
**Re:** New modules being added to the FitFlex repo + Review-before-write protocol  

---

Hi FahamuTech team,

We've been working on accelerating FitFlex Af's development to close the gap between the current prototype and the live codebase. We want to bring you into the loop on what's being added and establish a review protocol so nothing breaks your confirmed configurations.

## What's being added

1. **Trainer System module** (new files, no changes to existing code):
   - `src/shared/trainer-constants.mjs` — commission rates, session types, payout formula
   - `src/services/trainer-service.mjs` — booking flow, availability, payout calc, dashboard
   - `functions/trainer-endpoints.mjs` — REST endpoints for trainer booking, availability, dashboard

2. **WhatsApp standalone notification service** (new directory, no changes to existing code):
   - `fitflex-whatsapp/` — standalone HTTP service
   - `src/integrations/whatsapp-hooks.mjs` — integration hooks for the existing backend

3. **GitHub Actions CI/CD workflow** (planned — will add `.github/workflows/` for APK builds)

## What's NOT being touched

The following files have **confirmed, tested configurations** and we will not modify them without your explicit review and approval:

- `src/shared/constants.mjs` (PASS_TIERS pricing)
- `src/services/check-in-service.mjs` (BL-012 validation)
- `src/shared/payout-engine.mjs` (5-band calculation)
- `src/auth/*` (JWT, Firebase, QR token)
- `functions/index.mjs` (existing endpoint signatures)

## Review protocol

We've added a `CONTRIBUTING.md` to the repo that defines a **review-before-write workflow**:
1. All changes go through Pull Requests (no direct push to `main`)
2. New modules require review from a FahamuTech reviewer
3. Changes to existing confirmed configs require review + approval
4. CI tests must pass before merge

## What we need from you

1. **Review the new trainer module** — check that the booking flow and payout logic match the business rules in the Technical Onboarding Brief
2. **Confirm the WhatsApp hooks integration approach** — we're using a standalone service that calls the existing backend via API, not modifying `index.mjs` directly
3. **Review the GitHub Actions workflow** when it's ready — we want to automate APK builds and test runs

## Questions

- Is there a preferred reviewer for the trainer module?
- Are there any existing CI/CD configurations we should be aware of?
- Any concerns about the standalone WhatsApp service approach vs. embedding it in `index.mjs`?

Please reply with your review notes and we'll incorporate them before merging anything.

Best regards,  
FitFlex Product Team
