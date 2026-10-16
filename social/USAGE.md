# Using the Social Studio

How the owner and Claude run the content workflow day to day. Phases 1 and 2 are in place: ideas, briefs, renders and brand review. Scheduling, publishing and analytics arrive in Phase 3 and are not available yet.

## In Claude Code (this repo)

Open the repo (or a worktree of it) in Claude Code. The skills under `.claude/skills/social-*` and the agents under `.claude/agents/` load automatically. Say what you want in plain words; the matching skill picks it up.

| You say | What runs | What you get |
|---|---|---|
| "Propose next week's posts" | `social-strategy` (weekly proposal) | 3 carousel + 1 reel ideas with pillar, audience, hook type and the feature each leans on; nothing is written until you pick |
| "Create the record for idea 2" | `social-strategy` (single idea) | A line in `social/data/ideas.jsonl` in state `idea`, with problem, objective, hook, facts and CTA |
| "Draft and render 2026-10-W3-A-owners" | `social-studio` | `brief.md`, `source/slides.json`, rendered PNGs, `licences.md`; state `drafted`; then the brand review runs |
| "Brand-check 2026-10-W3-A-owners" | `social-brand-reviewer` agent | pass / revise / reject with one reason per rule; on pass the state becomes `brand_checked` |
| "Approve 2026-10-W3-A-owners" | Claude appends your approval line | `approvals.jsonl` gets `actor: owner, to_state: approved`; the state becomes `approved`. Only your instruction can do this |
| "Show me the slides" | Claude opens the PNGs or the contact sheet | |
| "Check the records" | `node social/tools/check-records.js` | Integrity report: states, approval lines, owner-only approvals, no publishing before Phase 3 |

Direct commands you can also run yourself:

```bash
node social/tools/render-carousel.js social/content/<record-id> --png
```

```bash
node social/tools/check-records.js --phase 2
```

```bash
node social/tools/gen-brand-tokens.js
```

## Approval

Approval is a written line, not a chat message. When you say "approve <id>" (or "revise" / "reject" with a note), Claude appends to `social/data/approvals.jsonl`:

```json
{"id":"apr_0007","idea_id":"<id>","from_state":"brand_checked","to_state":"approved","actor":"owner","decision":"pass","note":"<your words>","at":"<ISO time +03:00>"}
```

`check-records.js` refuses any `approved`, `scheduled` or `published` state that lacks such a line, and refuses any approval written by `claude` or `brand_reviewer`.

## What is still manual

- Native Swahili review: no reviewer named. Every Swahili caption carries "Claude draft; needs native review" until an approvals note records a reviewer's sign-off.
- Checking product claims against the current build: each brief lists the claims to eyeball.
- Keyword replies (PASS, PARTNER, TRAINER): manual DMs until the comment-to-DM module (Phase 5).
- Posting: not available. Phase 3 adds `social-ops` and the `social-publisher` agent against Metricool, after you connect the account.

## Claude Cowork (unverified)

Cowork availability on this account has not been confirmed from Claude Code. If it is available, the intended workflow is: point a Cowork session at the same repo folder (or a checkout of `release-candidate`), and give the same plain-word instructions. The skills, agents, records and renderer are files in the repo, so the same rules apply: nothing publishes, only your approval line moves a record to `approved`. A Cowork session must not be given Metricool, Meta or Figma credentials in chat; those stay in claude.ai Connectors. Confirm availability before relying on this.

## Day-to-day rhythm (proposed)

| When | Who | What |
|---|---|---|
| Monday | Claude (Phase 4 scheduled task, later) | Weekly intel sweep and performance pull, drafts only |
| Monday | Owner + Claude | Pick next week's 4 ideas from the proposal |
| Tue–Thu | Claude | Draft, render, brand-check each record |
| Thu | Owner | Review contact sheets, approve or send back |
| Fri | Claude (Phase 3, later) | Schedule approved records |

## Files that matter

- `social/README.md` — rules, states, data model
- `social/data/` — the records
- `social/content/<id>/` — one folder per post
- `social/brand/` — tokens, assets, templates
- `canon/04-marketing/design-system.md` — the brand source of truth (owner's workspace)
