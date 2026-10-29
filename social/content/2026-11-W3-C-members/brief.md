# 2026-11-W3-C-members — "Leaderboard si ya wanariadha tu."

State: **brand_checked** (brand review: revise 2026-10-29, fixed, re-check pass). Planned slot Fri 2026-11-20 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v3). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Community (community) |
| Audience | member (Amina (Urban Seeker)) |
| Problem | Training alone fades by week three; members want company without a club fee [ASSUMPTION] |
| Hook | Leaderboard si ya wanariadha tu. / Leaderboards aren’t just for athletes. |
| Concept | Bilingual v3 carousel, Volt cover: invite a friend by link, make a group, join a challenge and land on its leaderboard, daily steps stay in groups, gyms run challenges too, a how-to-start checklist, PASS. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | sw (ISO week 47; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: share, lead |
| Planned slot | Fri 2026-11-20 17:00 Dar |

## Visual direction

Template v3: bilingual type-first slides, Volt cover, outlined numerals and chips, check slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Leaderboard si ya wanariadha tu. · Leaderboards aren’t just for athletes. · Marafiki · friends | none |
| 2 | rule | Alika rafiki kwa link moja. · Invite a friend by link, email or number. Train apart, count together. | none |
| 3 | rule | Kikundi cha wenzako. · Make a group: your office, your estate, your Sunday crew. New activities post to the group. | none |
| 4 | rule | Jiunge na changamoto, leaderboard ya kweli. · Join a challenge and you’re on its leaderboard: first name, last initial, progress. Say no if you’d rather not. | none |
| 5 | rule | Hatua za kila siku zinaenda kwa kikundi tu. · Daily steps go to your groups only, never public. | none |
| 6 | rule | Gym yako nayo ina changamoto. · Gyms and trainers run challenges too, not just FitFlex. | none |
| 7 | check | Jinsi ya kuanza. · How to start. · Rows: Washa shughuli, Alika rafiki mmoja, Changamoto moja, Leaderboard Jumapili | none |
| 8 | cta | Unataka kuanza? Andika · Want to start? Comment · PASS | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W3-C-members --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide on Volt green; Swahili: Leaderboard si ya wanariadha tu.; English: Leaderboards aren’t just for athletes. |
| 2 | Point 01 slide; Swahili: Alika rafiki kwa link moja.; English: Invite a friend by link, email or number. Train apart, count together. |
| 3 | Point 02 slide; Swahili: Kikundi cha wenzako.; English: Make a group: your office, your estate, your Sunday crew. New activities post to the group. |
| 4 | Point 03 slide; Swahili: Jiunge na changamoto, leaderboard ya kweli.; English: Join a challenge and you’re on its leaderboard: first name, last initial, progress. Say no if you’d rather not. |
| 5 | Point 04 slide; Swahili: Hatua za kila siku zinaenda kwa kikundi tu.; English: Daily steps go to your groups only, never public. |
| 6 | Point 05 slide; Swahili: Gym yako nayo ina changamoto.; English: Gyms and trainers run challenges too, not just FitFlex. |
| 7 | Checklist slide; Swahili: Jinsi ya kuanza.; English: How to start.; Rows: Washa shughuli (turn on activity), Alika rafiki mmoja (invite one friend), Changamoto moja (join one challenge), Leaderboard Jumapili (check the board on Sunday) |
| 8 | Call to action; Swahili: Unataka kuanza? Andika; English: Want to start? Comment; Keyword PASS. Tutakutumia DM link ya app. We’ll DM you the app link. |

## Caption

**Swahili (lead)**
> Leaderboard si ya wanariadha tu. Alika rafiki kwa link moja, tengeneza kikundi, jiunge na changamoto na uone jina lako kwenye leaderboard. Hatua za kila siku zinabaki kwenye kikundi chako.
> Andika PASS tukutumie link ya app.

**English**
> Leaderboards aren’t just for athletes. Invite a friend by link, make a group, join a challenge and see your name on the board. Daily steps stay inside your groups. Comment PASS for the app link.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PASS** → the owner replies to PASS comments and DMs himself: one line on the Pass plus the Android app link; the DM must not promise iOS.

## Hashtags

#fitness #mazoezi #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| Facebook | drafted | Same media and caption without hashtags on the FitFlex Africa Page (Page↔Instagram link at Meta still unconfirmed) |
| TikTok | not adapted | Candidate for a text-motion reel of the first four slides |
| LinkedIn | not adapted | Low fit |

## Checks before approval

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Leaderboard display (first name, last initial or @username) to confirm in the current build
- [ ] The DM must not promise iOS
