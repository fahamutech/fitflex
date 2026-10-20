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

## Publishing operations (Phase 3)

Publishing is a four-step hand-off; no step skips a gate.

| Step | Who | Command or action |
|---|---|---|
| 1. Exact-version approval | Owner, in chat | Claude shows caption, slide count, account, time and the content hash; owner says yes; Claude appends an `actor: owner` line with `content_hash` and `platforms` |
| 2. Lift the pause | Owner, in chat | Claude sets `social/ops/pause.json` to `paused: false` and records who and when |
| 3. Reserve | Claude (`social-ops`) | `node social/tools/publish.js reserve <id> <platform> <YYYY-MM-DDTHH:mm>` (Dar es Salaam time); writes a `pending` line and the payload file |
| 4. Write | `social-publisher` agent | Asks you to confirm the first publication per platform in the session, makes exactly one `createScheduledPost` call, reports the raw result |
| 5. Record | Claude (`social-ops`) | `publish.js result pub_NNNN --status scheduled --post-id … --uuid … --planner …` or `--status failed --error "…"`; state → `scheduled` |
| 6. Reconcile and measure | Claude (`social-ops`) | `getScheduledPosts` against `publishes.jsonl`; first snapshot within 48 h via `publish.js snapshot`; state → `published`, then `measured` |

Dry run at any time, no side effects beyond a report file:

```bash
node social/tools/publish.js dry-run <record-id> instagram 2026-10-19T08:00
```

Pause everything:

```bash
node -e "require('fs').writeFileSync('social/ops/pause.json', JSON.stringify({paused:true, reason:'owner', changed_by:'owner', changed_at:new Date().toISOString()}, null, 2))"
```

Rules: one platform per reservation; Instagram and Facebook only; a changed caption or slide changes the hash and needs a new owner line; failed writes are never retried automatically; the owner deletes a scheduled post in the Metricool planner (the connector has no delete).

## Daily operations (Claude Code or Cowork)

Same repo, same records, same rules. Cowork availability is still unverified; if used, point it at this repo checkout and give the same instructions. It must not keep its own calendar or content list.

| When | Instruction to Claude | What happens |
|---|---|---|
| Morning | "Ops check" | `check-records --phase 3`, `getScheduledPosts` for the next 7 days reconciled against `publishes.jsonl`, any `failed` lines since yesterday, pause state. Report only |
| Morning | "Draft today's record" | `social-strategy` + `social-studio` on the next calendar slot → `brand_checked`, contact sheet shown |
| When you are ready | "Approve exact <id> for instagram" | Owner line with hash; then "reserve and schedule <id> instagram <time>" → publisher asks you to confirm → scheduled |
| Day after a publish | "Snapshot <pub id>" | Analytics pull, `performance.jsonl`, `learnings.md` |
| Anything odd | "Pause publishing" | `pause.json` on; nothing writes until you lift it |

## Intelligence and learning (Phase 4)

| You say | What runs | Output |
|---|---|---|
| "Sweep" or "sync" | `social-intel`: reads your signed-in Instagram Saved collections at a human pace, appends observations with `intel-capture.js` (dated, sourced, deduped) | new lines in `inspiration.jsonl`, `watchlist.jsonl` |
| "Weekly intel" | `intel-report.js --week <ISO week>` then the analyst sections | `social/intel/weekly/<week>.md` with facts (cited) and interpretation (labelled) |
| "Performance pull" / Monday | `social-ops` analytics mode: Metricool `getAnalyticsDataByMetrics` per published post → `publish.js snapshot` → `performance-report.js --write` | `performance.jsonl` snapshots (missing metrics null), `learnings.md` with limitations and next tests |
| "Calendar" | `calendar.js --write` (and `--check`) | `social/calendar/<month>.md` generated from the records; never edited by hand |
| "Propose next week" | `social-strategy` with a **Learnings cited** list | proposal in chat; records only when you pick |
| "I posted this by hand: <url>" | `publish.js manual --url … --platform instagram --published <time> --caption "…"` | a record, an owner line and a `published` publish line marked `manual`; the Monday pull snapshots it; it is shown in learnings but kept out of comparisons because it skipped brand review. The Monday pull also lists any post it finds on the account that is not registered |

Scheduled tasks: two are prepared in `social/ops/tasks/` (weekly sweep Monday 06:00, performance pull Monday 07:00, Dar es Salaam) and **not created yet**. `social/ops/automation.json` is the master switch (paused) and lists what blocks each: the sweep needs you signed in to Instagram in Chrome when it runs, the pull needs a published post. When you approve, Claude creates them in the Claude scheduled-tasks connector (one scheduler, not duplicated in Cowork); they produce reports and observations only and can never reserve, approve or publish (`SOCIAL_ACTOR=automation` makes the tools refuse). Pause them by setting `paused: true` in `automation.json`; inspect outputs in `social/intel/weekly/`, `learnings.md` and the task run log.

Networks: `social/ops/networks.json`. Instagram is the publishing network; Facebook is connected and prepared but not activated until you confirm the Page linkage at Meta; TikTok and LinkedIn are unresolved.

## What is still manual

- Native Swahili review: no reviewer named. Every Swahili caption carries "Claude draft; needs native review" until an approvals note records a reviewer's sign-off.
- Checking product claims against the current build: each brief lists the claims to eyeball.
- Keyword replies (PASS, PARTNER, TRAINER): the owner replies to comments and DMs himself while traffic is low (decided 2026-10-20), until the comment-to-DM module (Phase 5).
- Posting: the Phase 3 process above; every write is preceded by your exact-version approval and a confirmation prompt. Deleting a scheduled post happens in the Metricool planner.

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
