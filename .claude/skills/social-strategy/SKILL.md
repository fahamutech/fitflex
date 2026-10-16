---
name: social-strategy
description: "Content strategy and calendar for FitFlex social media. Turns an idea into a content record (audience, problem, hook, pillar, slot) in social/data/ideas.jsonl, and proposes the weekly mix from the month plan and learnings. Use when the owner asks for post ideas, the next week's plan, hooks for a topic, or the calendar. Never publishes."
---

# social-strategy

Owns the first four steps of the workflow: Idea → Audience/problem → Hook → calendar slot. Writes `ideas.jsonl` records in state `idea` and hands them to `social-studio`. Never writes `approvals.jsonl` lines beyond `idea` creation, never sets `approved`, never publishes.

## Read first

1. `social/README.md` (states, rules, data model).
2. `social/calendar/<month>-plan.md` (pillars, weekly rhythm, language alternation, themes).
3. `social/data/learnings.md` and the last `performance.jsonl` pulls, when they exist. Cite them in the proposal; if empty, say the mix is still a hypothesis.
4. `canon/03-market-intelligence/personas-and-segments.md` and `canon/04-marketing/value-proposition.md` for persona pains and the positioning (flexibility, verified quality, one app, mobile money; never "cheapest").
5. `social/data/inspiration.jsonl` for structures to borrow (structure only, never wording).

## Procedure for one idea

1. **Pillar and audience.** Pick one of find_train, grow_business, run_gym, community, marketplace and one audience (member, trainer, owner, club_company, vendor). Name the persona.
2. **Problem and objective.** The problem in one sentence in the audience's own words; if it is not in the personas doc, mark it `[ASSUMPTION]`. The objective in one line: what the post should make the reader do or believe (follow, save, comment a keyword, visit the partner page, trust the vetting).
3. **Duplicate check.** Grep `social/data/ideas.jsonl` for the same hook, pillar + audience + problem, or the same inspiration ids in the last 8 weeks. A near-duplicate is either dropped or written as a deliberate follow-up with `owner_note` saying which record it follows. Inspiration ids already in `used_in` twice are not reused in the same month.
4. **Hook options.** Write three first-slide lines in different hook types (contrarian, data, how_to, offer, spotlight, recap, price). Pick one and say why. Original wording only.
5. **Product grounding.** List the FitFlex features the post will rely on with the file that proves each is live (`IMPLEMENTED_AS_OF_<date>.md`, `FitFlex_Platform_Business_Overview.md`). A feature not provably live is not used. Every claim carries a label in `facts_cited`: `[FACT]` when the cited file shows it live or decided, `[ASSUMPTION]` when inferred, `[OPEN]` when the canon marks it undecided; `[OPEN]` claims do not go on a slide. Any number comes from `canon/00-master-brain/glossary-and-metrics.md` with its tag; prices and visit caps are off limits while the app lags canon (the live app still shows older Pass prices); payout terms, commissions and 'you keep X%' lines are off limits until counsel clears the legal texts. Also record the CTA and the evidence line for each claim in the idea record, so studio inherits them.
6. **Slot.** Place it in the weekly rhythm (Mon owners, Wed members/community, Fri trainers, Sat marketplace/community) and set `language_lead` (odd ISO week = sw, even = en).
7. **Record.** Append one line to `social/data/ideas.jsonl` with `state: "idea"`, the inspiration ids borrowed, `facts_cited`, and ISO `+03:00` timestamps. Record id = `YYYY-MM-W#-<letter>-<audience>`. Create `social/content/<id>/` with nothing but an empty `source/` folder; the brief is studio's job.
8. **Hand off.** Tell the owner the record id and what `social-studio` will produce. Stop.

## Procedure for a weekly proposal

- Read the month plan week, learnings and what is already in `ideas.jsonl` for that week.
- Propose 3 carousels + 1 reel (the decided mix), each as a one-line idea with pillar, audience, hook type and the feature it leans on.
- Flag anything that needs a real partner, trainer, member or recording before it can be made.
- Do not create records until the owner picks; then run the single-idea procedure per pick.

## Hard limits

- No fabricated testimonials, member counts, prices or payout percentages.
- No real person, gym or vendor featured without recorded permission.
- Never copy another account's wording, images or video.
- Never change `state` beyond `idea`; never touch `publishes.jsonl` or `performance.jsonl`.
