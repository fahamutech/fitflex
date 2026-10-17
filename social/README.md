# FitFlex Social Studio

Everything for FitFlex Africa's social media (Instagram, TikTok, Facebook, LinkedIn) lives here: the records, the content, the brand assets and the tools. The skills that drive the workflow arrive in Phase 2 under `.claude/skills/social-*`; this folder is their system of record.

Audit and plan: the Phase 1 environment audit (2026-10-16) is a Claude Doc owned by the founder. The folder layout, data model and rules below are the approved version of its sections 5, 6 and 8.

## The workflow

```
Idea → Audience/problem → Hook → Creative concept → Image prompt → Caption → CTA
  → Platform adaptation → Brand review → Owner approval → Schedule/publish → Performance → Learnings
```

A **content record** is the spine. It starts as a line in `data/ideas.jsonl`, grows a `content/<id>/brief.md`, collects lines in `data/approvals.jsonl`, becomes lines in `data/publishes.jsonl`, and finally snapshots in `data/performance.jsonl`.

## Record states

`idea → drafted → brand_checked → approved → scheduled → published → measured`, plus `rejected` and `archived`.

Rules:

- Every state change is a new line in `data/approvals.jsonl` (actor, from, to, decision, note, time). Records are append-only; never edit a past line.
- Only a line with `actor = owner` may set `to_state = approved`. Nothing is scheduled or published without that line.
- Phases 1, 2 and 4 publish nothing. Publishing arrives in Phase 3 behind the `social-publisher` agent, which is the only thing allowed to call Metricool write tools.
- Prices, visit caps and payout claims come from `canon/00-master-brain/glossary-and-metrics.md` and carry its FACT / ASSUMPTION tag in `facts_cited`. An untagged number fails brand review.
- Never fabricate testimonials or present stock photos as FitFlex members, trainers or partners.
- Every caption is bilingual (English and Swahili). Swahili drafts are marked for native review until a reviewer is named.

## Folders

| Path | What it holds |
|---|---|
| `data/` | The six record files (JSON Lines) and `learnings.md`. Schema below. |
| `content/<id>/` | One folder per content record: `brief.md`, `source/slides.json` + rendered HTML, `slides/*.png`, `contact-sheet.png`, `licences.md`, `publish.json` (exact caption per platform, media order, alt text; hashed for approval) |
| `brand/` | `brand-tokens.json` (committed copy of the canon tokens), logo SVG/PNG, `fonts/` (Inter 700/800/900), `photos/` (licensed stock, see its README), `effects.css`, `post-templates.md`, `brand-block.md` |
| `tools/` | `render-carousel.js` (slides.json + tokens → HTML → PNG via headless Chrome), `gen-brand-tokens.js` (canon → tokens), `check-records.js` (integrity: states, approval lines, owner-only approvals, publish lines need an exact-version owner approval), `publish.js` (hash, dry-run, reserve, result, snapshot; see USAGE.md), `legacy/` (the week-1 scripts as they were) |
| `tests/` | Negative fixtures for the brand reviewer and a tampered data copy for `check-records.js`; results in `tests/README.md` |
| `intel/` | Intelligence notes: the 2026-10-09 swipe file, `weekly/` sweeps from Phase 4 |
| `calendar/` | Month plans; `2026-10-plan.md` is the month-1 content plan |
| `ops/` | `pause.json` (publishing kill switch, default on), `metricool-brand.json` (brand id, timezone, networks, media base; no secrets), `metricool-capabilities-<date>.md`, `dryruns/` reports, `comment-to-dm-design.md` (Phase 5) |

## Data model (JSON Lines, one object per line)

| File | Key fields |
|---|---|
| `watchlist.jsonl` | `id` (`wl_<platform>_<handle>`), `platform`, `handle`, `url`, `category` (gym, trainer, vendor, workout, growth, club, real_estate), `region` (tz, east_africa, global), `why`, `source`, `last_checked`, `active` |
| `inspiration.jsonl` | `id`, `watchlist_id`, `post_url` (null when not captured), `captured_at`, `format`, `hook_type` (contrarian, data, how_to, offer, spotlight, recap, price), `pattern` (the structure in our words, never their copy), `engagement` (null or {likes, comments, saves, shares, views, observed_at}), `tags` (pillars), `used_in` |
| `ideas.jsonl` | `id` (`YYYY-MM-W#-<letter>-<audience>`), `pillar` (find_train, grow_business, run_gym, community, marketplace), `audience` (member, trainer, owner, club_company, vendor), `problem`, `hook`, `concept`, `format`, `language_lead` (sw, en), `platforms`, `inspiration_ids`, `facts_cited`, `state`, `owner_note`, `created_at`, `updated_at` |
| `approvals.jsonl` | `id`, `idea_id`, `from_state`, `to_state`, `actor` (claude, brand_reviewer, owner), `decision` (pass, revise, reject), `note`, `at`; an owner approval that authorises publishing also carries `content_hash` (from `publish.js hash`) and `platforms` |
| `publishes.jsonl` | Append-only status lines per publish id (latest wins): `id`, `idea_id`, `platform`, `content_hash`, `scheduled_for`, `timezone`, `status` (pending, scheduled, published, failed, deleted), `idempotency_key`, `payload_file`, `metricool_post_id`, `metricool_uuid`, `post_url`, `planner_url`, `error` (redacted), `at` |
| `performance.jsonl` | `publish_id`, `observed_at`, `reach`, `impressions`, `likes`, `comments`, `saves`, `shares`, `views`, `clicks`, `follows`, `dm_keyword_hits`, `source` (metricool, manual, meta_api). Created on first pull (Phase 3). |

Times are ISO 8601 with the East Africa offset (`+03:00`).

## Day-to-day use

See `social/USAGE.md` for what to say to Claude Code, how approval is written, and the Cowork note.

## Rendering a carousel

```bash
node social/tools/render-carousel.js social/content/2026-10-W1-A-owners --png
```

Reads `source/slides.json` and `brand/brand-tokens.json`, writes `source/<prefix>NN.html` and, with `--png`, `slides/<prefix>NN.png` at the format's size through the local Google Chrome (`CHROME_BIN` overrides the path). Photos are referenced by Pexels id from `brand/photos/`.

## Brand tokens

`canon/04-marketing/design-system.md` (in the founder's workspace, not in this repo) is the brand's source of truth and carries a machine-readable `{"brandTokens": …}` JSON block. `node social/tools/gen-brand-tokens.js` copies that block to `brand/brand-tokens.json` and refuses if a token colour is missing from the canon prose. Decision of 2026-10-16: the brand primary is the app's green ramp (`#1F7A3A`); `#00B67A` remains the on-dark brand text and verified tint.

## Size rule

Rendered PNGs at 1080×1350 are about 650 KB each and are committed. Anything over a few MB (video, raw photo sets) goes to the `FitFlex Af/Social` folder on Google Drive with the link in the record, not into git.

## Secrets

No tokens, API keys or account credentials in this folder, ever. Metricool, Meta and Figma credentials live in claude.ai Connectors or the backend secret store.
