# Social Studio tests (Phase 2, run 2026-10-16)

Negative fixtures live in `fixtures/`. They are not records: nothing in `fixtures/` appears in `social/data/`. Results below are from the `social-brand-reviewer` agent and `tools/check-records.js` as run on 2026-10-16.

| Test | How | Result |
|---|---|---|
| New idea from the existing strategy | `social-strategy` procedure on the month plan's week 3 Monday slot → record `2026-10-W3-A-owners` | Created; facts traced to IMPLEMENTED_AS_OF_2026-10-11.md and the communications audit |
| Complete EN + SW draft with visual concept and CTA | `social-studio` → `content/2026-10-W3-A-owners/brief.md`, 8 slides rendered | Done; Swahili flagged "Claude draft; needs native review" |
| Both themes | Record uses navy, green (dark) and cream, orange (light), 4 slides each | Pass (reviewer rule "Light and dark") |
| Unsupported price is rejected | `fixtures/reject-price/` (glossary prices on slides, "cheaper than two memberships") | **reject**: Voice, Facts, Results and outcomes failed; reviewer cited Overview line 466 (live app shows older prices) |
| Fabricated testimonial is rejected | `fixtures/reject-testimonial/` ("Amina, Kinondoni, FitFlex member" on a stock photo, "40% more") | **reject**: No fabrication, Results and outcomes, Privacy, Facts, Voice failed |
| Unreviewed Swahili stays flagged | Reviewer rule "Bilingual and review status" on the real record | Pass only because the flag is present; the open item is carried into `notes` |
| Failed brand review cannot become approved | `fixtures/tamper/`: reviewer line with `to_state: approved`, record set to `approved` without an owner line | `check-records.js` exits 1 with 4 problems (see below) |
| Drafts cannot be scheduled or published in Phase 2 | `fixtures/tamper/publishes.jsonl` with one scheduled line; `--phase 2` | `check-records.js` flags "publishes.jsonl has 1 line(s) before Phase 3"; no publishing tool exists in the repo |
| Real records pass the checker | `node social/tools/check-records.js --phase 2` | ok: 5 records, 6 approval lines |

## check-records output on the tampered copy

```
check-records: 4 problem(s)
 - apr_tamper: only the owner may write to_state=approved (actor was brand_reviewer)
 - apr_tamper: brand_reviewer may only move a record to drafted, brand_checked or rejected (got approved)
 - 2026-10-W3-A-owners: state approved without an owner approved line
 - publishes.jsonl has 1 line(s) before Phase 3
```

## Reviewer run on the real record

First pass: **revise** (slide 4 dashboard overlay put brand green on a white card). Fix in `tools/render-carousel.js`, re-render, second pass: **pass**, 13 of 13 rules. Logged as apr_0005 and apr_0006. State `brand_checked`; owner approval pending.

## Known inconsistencies found by the tests

- On the fixtures the reviewer treated an UNRESOLVED photo licence as blocking; on the real record it treated it as a pass with a note. The rule text now says explicitly: UNRESOLVED passes the rule and goes to `notes` as an owner blocker before `approved`. Re-run on the next real record to confirm.
- The renderer puts the logo header on every slide; `brand-block.md` says first or last slide only. The reviewer flags it on every record. Owner decision needed: accept the exception or change the renderer.
- Fixture briefs list only Instagram; the template says unconfirmed platforms should read `not adapted`. Fixture-only.

## Re-running

```bash
node social/tools/check-records.js --phase 2
node social/tools/check-records.js --data social/tests/fixtures/tamper --phase 2   # expected to fail
```

The reviewer is run by asking Claude Code to brand-check a record or a fixture folder; it is read-only and its proposed approvals line is appended by the session, never by the agent.
