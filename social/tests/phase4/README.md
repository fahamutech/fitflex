# Phase 4 acceptance tests (run 2026-10-17)

`sh social/tests/phase4/run.sh` works on copies of `social/data` and `social/ops`. Result: **37 of 37 passed** (26 original + 11 for manual posts, added 2026-10-19).

| Requirement | Test | Result |
|---|---|---|
| Weekly reports cite dated source records | generated report contains record ids, observation dates, sources, and a labelled interpretation section | pass |
| Repeated observations do not create duplicates | same URL twice; same pattern without URL (case-insensitive) | one line, metrics refreshed only |
| Missing metrics remain null | observation with only likes; performance snapshot with only likes and reach | other metrics stored as null |
| Calendar reconciles with the records | `calendar.js --check` after `--write`; then a record appended | pass, then detected |
| Recommendations disclose limitations | `learnings.md` has a Limitations section, the sample-size rule and no winner from one post | pass |
| Scheduled tasks produce no publishing writes | `SOCIAL_ACTOR=automation` reserve refused; task prompts forbid writes; `automation.json` paused | pass |
| Next proposal cites learnings | `social-strategy` requires a Learnings cited list (procedural; verified by review of the skill text) | pass |
| Checker green | `check-records --phase 3` on the copy | pass |
| Manual posts can be tracked | `publish.js manual` creates a record, an owner line and a `published` publish line marked manual; same URL twice refused; automation refused; snapshot works; learnings list it as manual and state it is excluded from comparisons; calendar shows it; checker accepts it | pass |

## Isolation

Since the pilot, the live records hold a real reservation (pub_0001) and the W3 record is `scheduled`. Both suites copy the records and reset the copy to the pre-pilot state (publishes emptied, W3 back to `approved`, exact-version approval lines removed) and write content only under a temp folder (`SOCIAL_CONTENT_DIR`). Live files are never touched.

## Preconditions not met, by design

- No post-performance data exists (no post has been published), so the performance analysis ran on an empty set and says so. The pipeline is proven on a fixture inside the test only; no real metrics were fabricated.
- The weekly report 2026-W42 is built from the 24 records of the 2026-10-09 swipe-file reading: one source, one date, no engagement numbers, no post URLs. Its Limitations section states this.
- Metricool analytics read access was verified (`getAnalyticsAvailableMetrics` for Instagram posts) but `getAnalyticsDataByMetrics` has not been exercised on a real post.
- The two scheduled tasks are prepared, not created: the sweep needs the owner signed in to Instagram at run time; the pull needs a published post. Both wait for the owner's approval to create.
