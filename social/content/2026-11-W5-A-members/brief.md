# 2026-11-W5-A-members — "Desemba inakuja. Weka lengo, si azimio."

State: **brand_checked** (brand review pass 2026-10-29). Planned slot Mon 2026-11-30 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v2). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Find & train (find_train) |
| Audience | member (Amina (Urban Seeker)) |
| Problem | December becomes a month of waiting for a January resolution [ASSUMPTION] |
| Hook | Desemba inakuja. Weka lengo, si azimio. / December is coming. Set a goal, not a resolution. |
| Concept | v2 photo-scrim carousel, Swahili headline with English under (odd week): resolution vs goal, two visits and a run, the app shows the gap, one pass every gym in your tier, share or keep private, start 30 November, PASS. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | sw (ISO week 49; Swahili caption first) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: goals, steps, share, tierlist |
| Planned slot | Mon 2026-11-30 17:00 Dar |

## Visual direction

Template v2: deep slate ground, Volt accent word, photo-scrim slides where the photo carries, list slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | Desemba inakuja. Weka lengo, si azimio. · December is coming. Set a goal, not a resolution. | pexels-6388387 |
| 2 | type | Azimio ni la Januari 1. Lengo lina wiki hii. · A resolution belongs to 1 January. A goal has this week in it. | none |
| 3 | type | Ziara mbili kwa wiki. Mbio moja Jumamosi. · Two visits a week. One run on Saturday. Write it in the app. | none |
| 4 | list | App inakuonyesha pengo kabla hujalikosa. · Rows: Lengo la wiki, Streak, Hatua za simu, Mbio kwa GPS | none |
| 5 | photo | Pass moja. Gym zote za daraja lako. · One pass. Every gym in your tier. Nowhere to hide from your own goal. | pexels-33832204 |
| 6 | type | Shiriki na marafiki, au ficha. Wewe unaamua. · Share with friends, or keep it private. Your call. | none |
| 7 | type | Anza Novemba 30, si Januari 1. · Start on 30 November, not 1 January. | none |
| 8 | cta | Tayari? Andika · PASS | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W5-A-members --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a woman using battle ropes, black and white); text: Desemba inakuja. Weka lengo, si azimio. December is coming. Set a goal, not a resolution. |
| 2 | Text slide; text: Azimio ni la Januari 1. Lengo lina wiki hii. A resolution belongs to 1 January. A goal has this week in it. |
| 3 | Text slide; text: Ziara mbili kwa wiki. Mbio moja Jumamosi. Two visits a week. One run on Saturday. Write it in the app. |
| 4 | Checklist slide; text: App inakuonyesha pengo kabla hujalikosa.; Rows: Lengo la wiki (goal), Streak (keep it), Hatua za simu (Android), Mbio kwa GPS (Android) |
| 5 | Photo slide with a photo (a woman in a gym); text: Pass moja. Gym zote za daraja lako. One pass. Every gym in your tier. Nowhere to hide from your own goal. |
| 6 | Text slide; text: Shiriki na marafiki, au ficha. Wewe unaamua. Share with friends, or keep it private. Your call. |
| 7 | Text slide; text: Anza Novemba 30, si Januari 1. Start on 30 November, not 1 January. |
| 8 | Call to action; text: Tayari? Andika; Keyword PASS. Tutakutumia DM link ya app. · We’ll DM you the app link. |

## Caption

**Swahili (lead)**
> Desemba inakuja. Weka lengo, si azimio. Ziara mbili kwa wiki, mbio moja Jumamosi, andika kwenye app na iwe inakuonyesha pengo kabla hujalikosa. Pass moja, gym zote za daraja lako.
> Tayari? Andika PASS tukutumie link ya app.

**English**
> December is coming. Set a goal, not a resolution. Two visits a week, one run on Saturday, written in the app so it shows you the gap before you miss it. One pass, every gym in your tier. Ready? Comment PASS for the app link.

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
- [ ] Steps and runs are Android only (tagged on the slide); the DM must not promise iOS
