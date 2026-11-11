# Phase 3 acceptance tests (run 2026-10-16)

`sh social/tests/phase3/run.sh` copies `social/data` and `social/ops` to a temp folder and runs `publish.js` and `check-records.js` against the copies. Live records are never touched. Result on 2026-10-16: **16 of 16 passed.**

| Requirement | Test | Result |
|---|---|---|
| Pause switch blocks publishing writes | reserve with `paused: true` | refused |
| Draft content cannot be scheduled | dry run on a `brand_checked` record and on an `idea` record | refused |
| Missing or invalid owner approval blocks | approved record whose owner line has no `content_hash`; reviewer-written "approval" with the right hash | both refused |
| Approval for one platform or version cannot authorise another | Instagram-only owner line → Instagram passes, Facebook refused; older-version hash for Facebook → refused | as expected |
| Repeated requests do not create duplicate posts | second `reserve` for same record, platform, hash; dry run while a `pending` line exists | both refused |
| Connector errors logged without secrets | `result --status failed --error` with a `token=` and a `bearer` value | stored as `[REDACTED]`; checker passes |
| Failed write frees the slot | reserve after a `failed` line | allowed |
| Checker enforces Phase 3 rules | `check-records --phase 3` on the copy; a rogue `scheduled` line without exact approval | ok; rogue line fails |

Not covered by automated tests (needs the live connector): a successful pilot reconciled with Metricool's returned status. See the pilot section below.

## Pilot (dry run only)

Record `2026-10-W3-A-owners` is the only owner-approved record (apr_0007). Dry run for Instagram at 2026-10-19 08:00 Africa/Dar_es_Salaam, report `social/ops/dryruns/2026-10-W3-A-owners-instagram-2026-10-16T180854Z.json`:

- Refused on two gates, as designed: the pause switch is on, and apr_0007 carries no `content_hash`/`platforms`, so it does not authorise this exact version.
- All other gates passed: state `approved`, licences resolved, all 8 media URLs answer 200 from the pushed branch, payload valid (`providers: instagram`, `date: 2026-10-19T08:00:00+03:00`, `publicationDate.timezone: Africa/Dar_es_Salaam`, 8 alt texts, `isAiGenerated: false`).
- Content hash: `sha256:e466c670d8b5acc5a19559899315d337`.

No `createScheduledPost` call was made. The owner's spec asked for a Week 1 carousel as the pilot; those three are `brand_checked`, not `approved`, so they cannot be piloted until the owner approves one. The approved candidate is the Week 3 record.

## To go live (owner steps, in order)

1. Confirm the connected Facebook Page (id 1368079233061761) is the Page linked to the Instagram account at Meta.
2. Approve the exact version: "approve exact 2026-10-W3-A-owners for instagram" (Claude appends the owner line with the hash).
3. Lift the pause: "lift the pause".
4. Authorise the single call: "reserve and schedule 2026-10-W3-A-owners instagram 2026-10-19T08:00". The publisher agent will ask once more before it writes.
