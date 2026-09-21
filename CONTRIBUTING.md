# FitFlex Af — Contribution & Review Protocol

**Status:** Active  
**Last Updated:** September 2026  
**Maintainers:** FahamuTech (original architecture), FitFlex Product Team  

---

## Review-Before-Write Protocol

All external contributions to this repository must follow a **review-before-write** workflow. No code may be merged to `main` without explicit approval from a FahamuTech reviewer.

### Why

The existing backend (`fitflex-functions`) contains confirmed, tested configurations including:
- QR check-in validation engine (BL-012)
- 5-band payout calculation
- Firebase Auth integration with role mapping
- Subscription state machine with pilot payment approval
- Selcom webhook handler (stubbed, idempotent)

Any change that touches these systems must be reviewed to avoid regressions.

### Workflow

1. **Fork or branch** — never push directly to `main`
2. **Open a Pull Request** with a clear description of what changed and why
3. **Tag a FahamuTech reviewer** — PRs require at least one approval before merge
4. **CI must pass** — all existing tests (`npm test`) must pass before merge
5. **No force-push to main** — branch protection is enabled

### What Requires Review

| Change Type | Requires Review? |
|---|---|
| New modules (e.g., trainer system, WhatsApp service) | ✅ Yes |
| Changes to `src/shared/constants.mjs` (pricing, tiers) | ✅ Yes — business rules |
| Changes to `src/services/check-in-service.mjs` | ✅ Yes — BL-012 logic |
| Changes to `src/shared/payout-engine.mjs` | ✅ Yes — 5-band logic |
| Changes to `src/auth/*` | ✅ Yes — security |
| Changes to `functions/index.mjs` endpoint signatures | ✅ Yes — API contract |
| New endpoints (additive) | ⚠️ Review recommended |
| Documentation only (README, .md files) | ❌ No |
| CI/CD workflow files | ⚠️ Review recommended |

### Current Active Workstreams

| Module | Status | Reviewer |
|---|---|---|
| Trainer System (booking, availability, payouts) | In Progress — new module | FahamuTech |
| WhatsApp Integration (standalone notification service) | In Progress — new module | FahamuTech |
| GitHub Actions CI/CD (APK build + test automation) | Planned | FahamuTech |
| Credits Wallet | Planned | TBD |
| Real Selcom Integration (STK push) | Planned — touches existing webhook | FahamuTech (required) |

### Contact

For review requests or questions about existing architecture:
- **FahamuTech** — original architecture and backend implementation
- **FitFlex Product Team** — business logic and requirements

---

*This document was added as part of the Trainer System + WhatsApp Integration workstream (September 2026).*
