# <record-id> — "<hook>"

State: **<state>**. Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | find_train / grow_business / run_gym / community / marketplace |
| Audience | member / trainer / owner / club_company / vendor (persona) |
| Problem | one sentence, the audience's problem in their words |
| Hook | the first-slide line |
| Concept | one or two sentences: the structure and the turn |
| Format | carousel N slides 1080×1350 / reel / static |
| Language lead | sw / en (odd weeks Swahili) |
| Inspiration | `ins_…` ids and what structure was borrowed; never wording |
| Facts cited | path + [TAG] for every claim and number; "no numbers used" when true |
| Planned slot | day, week |

## Visual direction

Two lines: mood, subjects, overlay style, role colour. Dimensions per platform from `platform-specs.md`.

## Slides

| # | Theme | Text | Photo |
|---|---|---|---|
| 1 | navy / cream / green / orange | … | pexels-<id> or none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/<record-id> --png`.

## Image prompt (when an AI image is used)

Prompt + the brand block from `social/brand/brand-block.md` + aspect. Record generator and date in `licences.md`.

## Accessibility

| # | Alt text | Contrast note |
|---|---|---|
| 1 | … | white on navy ≥ 4.5:1 |

## Caption

**Swahili (lead)** … **English** … (both always present; note "Swahili is a Claude draft; needs native review before publishing")

## CTA

What the reader does and what they get; the reply path (manual until comment-to-DM ships).

## Hashtags (max 5 on Instagram)

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | |
| LinkedIn / Facebook / TikTok | not adapted | why, or what the variant would be |

## Checks before approval

- [ ] Brand review (social-brand-reviewer)
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists
