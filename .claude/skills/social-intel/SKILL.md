---
name: social-intel
description: "Market intelligence and inspiration tracking for FitFlex social media: maintains the watchlist (about 40 accounts), captures dated observations of public posts (format, hook, structure, topic, engagement when visible), keeps facts apart from interpretation, and writes the weekly intelligence report under social/intel/weekly/. Use when the owner says sweep, sync, what are gyms or trainers posting, weekly intel, add this account, or asks what to test next. Never creates content records, never approves or publishes."
---

# social-intel

Owns `social/data/watchlist.jsonl`, `social/data/inspiration.jsonl` and `social/intel/weekly/`. Produces observations and reports; `social-strategy` turns them into ideas. Nothing here changes a content record, an approval or a publish.

## Read first

1. `social/README.md`, `social/USAGE.md`.
2. `social/data/watchlist.jsonl` (who we study and why) and the last two files in `social/intel/weekly/` (what was already noted).
3. `social/intel/2026-10-09-swipe-file.md` for the original categories and the open gaps (clubs, real estate, Kenya/Uganda).
4. `social/data/learnings.md` so recommendations connect to measured results when they exist.

## Sources and conduct

- The owner's signed-in Instagram through Claude in Chrome, at a human pace: open a Saved collection or profile, read what is on screen, move on. No scripted scrolling, no automation against Instagram, no DMs, no follower lists, no private accounts, no data about individuals beyond the public handle and the public post.
- Public web pages (a creator's site, a gym's page) with the URL recorded.
- The Instagram data export when the owner provides it (`social/intel/export/`), for the owner's own likes and saves only.
- Metricool competitor analytics if the plan exposes them; otherwise not.

Never bypass an access control, never collect phone numbers, emails, locations of individuals, or anything the person did not publish for the public.

## Capture

Accounts: `node social/tools/intel-capture.js account --platform instagram --handle <h> --category <gym|trainer|vendor|workout|growth|club|real_estate|other> --region <tz|east_africa|global> --why "<one line>" --source "<where it came from>"`.

Observations: `node social/tools/intel-capture.js observe --handle <h> --url <public post url or -> --format <carousel|reel|static|story|live|text> --hook <contrarian|data|how_to|offer|spotlight|recap|price> --pattern "<the structure in our words>" --topic "<topic>" --tags <pillars> --observed <YYYY-MM-DD> --source "<collection or page>" [--metrics '{"likes":n,"comments":n,"saves":n,"shares":n,"views":n}']`.

Rules: the pattern is a description of structure, never the creator's caption or copy; metrics only when visible on the post, otherwise omitted so they stay null; the observation date and source are always set; the tool refuses duplicates by URL or by account + pattern and refreshes metrics on a repeat instead of adding a line. Run `intel-capture.js check` at the end of every sweep.

## Weekly report

1. `node social/tools/intel-report.js --week <ISO week, e.g. 2026-W43> --since <date 7 days ago>` generates the facts section (every row cites record id, observation date, source) and leaves four headed sections for you.
2. Write **Interpretation** (why a pattern may work for a FitFlex audience, with the record ids that support it; say when it is a guess), **Hooks and formats worth testing** (pattern, FitFlex adaptation in our own words, pillar and audience, evidence ids, what would count as a signal), **Proposed experiments** (2 to 4, each with hypothesis, record to create, metric to watch, minimum sample before judging), **Limitations** (coverage, missing metrics, sampling bias, what was not observed).
3. Cover the categories: gyms, trainers, vendors, workout and education, growth, clubs and communities, regional (Tanzania, Kenya, Uganda) versus global. Say plainly when a category has no new observations.
4. Never present an interpretation as a measured result and never promise an outcome.

## Weekly sweep (on demand or as the prepared scheduled task)

The prompt in `social/ops/tasks/weekly-intel-sweep.md` is the exact procedure. The task is created only after the owner approves it and its inputs are verified (`social/ops/automation.json`). Whether run by a task or by hand, the sweep produces observations and a report only.

## Hard limits

- No content records, no `approvals.jsonl`, no `publishes.jsonl`, no `pause.json`, no Metricool write tools.
- No copying of captions, images or video; patterns in our words.
- No personal data beyond public handle and public post; no private accounts.
