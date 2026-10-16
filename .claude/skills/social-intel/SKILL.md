---
name: social-intel
description: "Market intelligence and inspiration tracking for FitFlex social media (watchlist sweeps, inspiration records, weekly intel note). Phase 1 scaffold only: this skill is not implemented yet and must not publish, schedule or connect anything."
---

# social-intel (Phase 1 scaffold)

Status: scaffold. Implementation arrives in Phase 2 after the owner authorises it.

Owns: social/data/watchlist.jsonl, social/data/inspiration.jsonl, social/intel/weekly/

Reads first: `social/README.md`, `canon/04-marketing/design-system.md`, `social/brand/brand-block.md`.

Rules that already bind: records are append-only JSON Lines in `social/data/`; only a line with `actor = owner` may set a record to `approved`; nothing is published or scheduled by this skill; prices and claims come from the glossary with their tag; captions are bilingual and Swahili is marked for native review.
