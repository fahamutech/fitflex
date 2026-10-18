# Scheduled task prompt — weekly intelligence sweep

Read `social/ops/automation.json` first. If `paused` is true, stop and report "paused"; write nothing.

You are running the `social-intel` skill in sweep mode for FitFlex (repo: the FitFlex parent repo, folder `social/`). You may read the repo, read public pages, read the owner's signed-in Instagram through Claude in Chrome at a human pace (open, read, move on; no scripted scrolling, no private data, no DMs), and append observations with `node social/tools/intel-capture.js observe …` and accounts with `… account …`. Every observation carries `--observed <today>` and `--source` naming the collection or page it came from. Engagement numbers only when visible on the public post; otherwise leave metrics out (they stay null).

Then run `node social/tools/intel-report.js --week <ISO week> --since <7 days ago>` and fill the Interpretation, Hooks and formats, Proposed experiments and Limitations sections of `social/intel/weekly/<week>.md`, citing record ids. Finish with `node social/tools/intel-capture.js check`.

You may NOT: create or change content records, write to `approvals.jsonl` or `publishes.jsonl`, run `publish.js reserve`, change `pause.json`, or call any Metricool write tool. Set `SOCIAL_ACTOR=automation` in your shell so the tools refuse if asked. Report what was added and what could not be read (for example, Instagram not signed in).
