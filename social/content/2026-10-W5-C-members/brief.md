# 2026-10-W5-C-members — "Hatua zako zinahesabika hata nje ya gym."

State: **brand_checked** (brand review pass 2026-10-29). Planned slot Sat 2026-10-31 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v3). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Find & train (find_train) |
| Audience | member (Amina (Urban Seeker) and Juma (Mobile Professional)) |
| Problem | Members think the app is only for the gym door; the activity side (steps, runs, goals, challenges) is invisible to them [ASSUMPTION] |
| Hook | Hatua zako zinahesabika hata nje ya gym. / Your steps count, even outside the gym. |
| Concept | Bilingual v3 carousel, dark cover (W5-B had Volt): steps on Android, GPS runs, goals and streaks, challenges and leaderboards, a privacy checklist, PASS. Android only, said on the slide. |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | en (ISO week 44; English caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: steps, goals, lead, share |
| Planned slot | Sat 2026-10-31 17:00 Dar |

## Visual direction

Template v3: bilingual type-first slides, dark cover, outlined numerals and chips, check slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover (dark) | Hatua zako zinahesabika hata nje ya gym. · Your steps count, even outside the gym. · Activity · Android | none |
| 2 | rule | Simu yako inahesabu hatua. · Turn on step counting and your Android phone’s own counter does the work. Off until you say yes. | none |
| 3 | rule | Rekodi mbio zako kwa GPS. · Record a run with GPS: distance, time and route, saved to your activity. | none |
| 4 | rule | Weka lengo. Linda streak. · Set a weekly goal and keep the streak going. The app shows the gap before you lose it. | none |
| 5 | rule | Jiunge na changamoto. · Join a challenge with friends or your gym. You’re on the leaderboard unless you say no. | none |
| 6 | check | Wewe unaamua nani anaona. · You decide who sees what. · Rows: Marafiki, Vikundi, Umma, Hatua za kila siku | none |
| 7 | cta | Unataka kuanza? Andika · Want to start? Comment · PASS | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W5-C-members --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide on dark slate; Swahili: Hatua zako zinahesabika hata nje ya gym.; English: Your steps count, even outside the gym. |
| 2 | Point 01 slide; Swahili: Simu yako inahesabu hatua.; English: Turn on step counting and your Android phone’s own counter does the work. Off until you say yes. |
| 3 | Point 02 slide; Swahili: Rekodi mbio zako kwa GPS.; English: Record a run with GPS: distance, time and route, saved to your activity. |
| 4 | Point 03 slide; Swahili: Weka lengo. Linda streak.; English: Set a weekly goal and keep the streak going. The app shows the gap before you lose it. |
| 5 | Point 04 slide; Swahili: Jiunge na changamoto.; English: Join a challenge with friends or your gym. You’re on the leaderboard unless you say no. |
| 6 | Checklist slide; Swahili: Wewe unaamua nani anaona.; English: You decide who sees what.; Rows: Marafiki (friends), Vikundi (groups), Umma (public is on by default; switch it off any time), Hatua za kila siku (daily steps go to your groups only) |
| 7 | Call to action; Swahili: Unataka kuanza? Andika; English: Want to start? Comment; Keyword PASS. Tutakutumia DM link ya app. Android kwa sasa. We’ll DM you the app link. Android for now. |

## Caption

**Swahili**
> Hatua zako zinahesabika hata nje ya gym. Washa kuhesabu hatua, rekodi mbio kwa GPS, weka lengo la wiki na jiunge na changamoto na marafiki. Wewe unaamua nani anaona nini. Andika PASS tukutumie link ya app (Android kwa sasa).

**English (lead)**
> Your steps count, even outside the gym. Turn on step counting, record a run with GPS, set a weekly goal and join a challenge with friends. You choose who sees what. Comment PASS for the app link (Android for now).

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

- [x] Brand review (social-brand-reviewer): pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Step counting and run recording are Android only; the DM must not promise iOS
- [ ] Confirm the Activity tab wording (goal, streak) matches the current build
