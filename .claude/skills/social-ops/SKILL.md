---
name: social-ops
description: "Publishing operations and analytics for FitFlex social media: content readiness checks, recording the owner's exact-version approval, preparing a Metricool post (dry run), handing the single write to the social-publisher agent, recording schedule status, post ids, URLs, errors and performance snapshots, and the pause switch. Use when the owner asks to schedule, publish, pause, check what is scheduled, or pull performance. Never calls Metricool write tools itself."
---

# social-ops

Owns everything around publishing except the write itself. The write (one `createScheduledPost` call per record and platform) belongs to the `social-publisher` agent, which this skill briefs and then audits. Analytics reads are allowed here.

## Read first

1. `social/README.md`, `social/USAGE.md` (operations section).
2. `social/ops/metricool-brand.json` (brand id, timezone, networks, media base), `social/ops/pause.json`.
3. `social/ops/metricool-capabilities-<date>.md` for what the connector verifiably does.
4. The record's `publish.json`, `brief.md`, `licences.md` and its lines in `ideas.jsonl`, `approvals.jsonl`, `publishes.jsonl`.

## Readiness and dry run

```bash
node social/tools/publish.js dry-run <record-id> <instagram|facebook> <YYYY-MM-DDTHH:mm>
```

Times are Africa/Dar_es_Salaam; the tool converts to the API's ISO form with the +03:00 offset. The dry run writes a report under `social/ops/dryruns/` and exits 1 when any gate fails: pause on, state not `approved`, no owner approval for this exact content hash and platform, licences UNRESOLVED, blocking language review, media not publicly reachable, schedule in the past, or a duplicate publish line. Fix the cause; never bypass a gate.

## Owner approval of the exact version

Approval is per content version and per platform. Compute `node social/tools/publish.js hash <id>`, show the owner the caption text from `publish.json`, the slide count, the destination account and the intended time, and only when the owner confirms that exact set in chat append:

```json
{"id":"apr_NNNN","idea_id":"<id>","from_state":"approved","to_state":"approved","actor":"owner","decision":"pass","content_hash":"sha256:...","platforms":["instagram"],"note":"<owner's words>","at":"<ISO +03:00>"}
```

Any later change to `publish.json` or a slide changes the hash and needs a new line. Claude never writes `actor: owner` without an owner instruction in chat for that exact version.

## Scheduling (hand-off)

1. Pause must be off. The owner lifts it in chat; record who and when in `pause.json`.
2. `node social/tools/publish.js reserve <id> <platform> <time>` passes the same gates, then appends a `pending` line to `publishes.jsonl` with an idempotency key and writes the payload file. This reserves the slot: a second reserve for the same record, platform and hash is refused.
3. Launch the `social-publisher` agent with the record id, platform, the payload file path and the `pub_NNNN` id. It asks the owner to confirm the first publication per platform in this session, makes exactly one `createScheduledPost` call, and reports the result verbatim.
4. Record the result: `node social/tools/publish.js result pub_NNNN --status scheduled --post-id <id> --uuid <uuid> --planner <plannerUrl>` or `--status failed --error "<message>"`. Errors are redacted of anything token-like before they are written. Never retry a failed write automatically; a retry is a new owner decision, and the agent first checks `getScheduledPosts` to see whether the post exists.
5. Set the record state to `scheduled` with an `approvals.jsonl` line (`actor: claude`, `to_state: scheduled`, note with the pub id). After the network publishes, record `--status published --url <post url>` and set `published`.

## Reconciliation and performance

- `getScheduledPosts` (read) for the brand over the next 30 days: every Metricool post must match a `scheduled` line and every `scheduled` line a Metricool post. Report mismatches; do not fix them silently.
- First snapshot within 48 hours of publication: `getAnalyticsDataByMetrics` with IGPO13 likes, IGPO08 comments, IGPO15 saved, IGPO27 shares, IGPO14 reach, IGPO28 views, IGPO12 interactions, IGPO29 follows, IGPO06 url, IGPO04 post id. Record with `publish.js snapshot pub_NNNN --json '{...}'`; set state `measured` after the first snapshot. Then weekly.
- After each pull, update `social/data/learnings.md` by pillar, format and language.

## Pause

`social/ops/pause.json` with `paused: true` blocks every reserve and every publisher run. Default is paused. Lift it only on the owner's instruction, record the change, and set it back when the owner says so or when anything unexpected happens.

## Hard limits

- Never call `createScheduledPost`, `createScheduledPostForReview`, `updateScheduledPost` or `sendScheduledPostForReview`; only the publisher agent does, once per reservation.
- Never write `actor: owner`, never change an existing approval line, never move a record to `approved`.
- No credentials in records, logs, prompts or files. The connector holds them.
- Instagram and Facebook only. No multi-network fan-out in one call: one platform per reservation.
