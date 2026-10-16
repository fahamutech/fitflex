---
name: social-ops
description: "Publishing operations and analytics for FitFlex social media (approval log, schedule, publish records, performance, learnings). Phase 1 scaffold only: this skill is not implemented yet and must not publish, schedule or connect anything."
---

# social-ops (Phase 1 scaffold)

Status: scaffold. Implementation arrives in Phase 2 after the owner authorises it.

Owns: social/data/approvals.jsonl, publishes.jsonl, performance.jsonl, learnings.md; Metricool only from Phase 3 and only through the social-publisher agent

Reads first: `social/README.md`, `canon/04-marketing/design-system.md`, `social/brand/brand-block.md`.

Rules that already bind: records are append-only JSON Lines in `social/data/`; only a line with `actor = owner` may set a record to `approved`; nothing is published or scheduled by this skill; prices and claims come from the glossary with their tag; captions are bilingual and Swahili is marked for native review.
