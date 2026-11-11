# 2026-11-W2-R-reel-members — "Before you pay any gym in Dar, check 3 things."

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Sat 2026-11-14 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v2). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Find & train (find_train) |
| Audience | member (Amina (Urban Seeker)) |
| Problem | Members pick a gym on price and location and only discover the rest after paying |
| Hook | Before you pay any gym in Dar, check 3 things. |
| Concept | Text-motion reel, 1080×1920, about 19 s, silent with burned-in text: hook, three checks (inspected, what members say, pay by phone), one pass many vetted gyms, PASS. Built from the v2 template with render-reel.js; no music until a licence is in hand. |
| Format | Reel, 6 frames, 1080×1920, about 19 s, silent |
| Language lead | en (ISO week 46; English caption first) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: vet, reviews, mm, network, membroz |
| Planned slot | Sat 2026-11-14 17:00 Dar |

## Visual direction

Template v2: deep slate ground, Volt accent word, photo-scrim slides where the photo carries, list slide, keyword CTA. Frames are padded to 9:16 on their own ground colour by `render-reel.js`, with a slow push-in and fades; no music.

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | Kabla hujalipa gym yoyote Dar… · Before you pay any gym in Dar… · 2.5 s | pexels-3916766 |
| 2 | type | 1. Je, imekaguliwa? · Has anyone inspected it? FitFlex visits every gym before it joins. · 3.2 s | none |
| 3 | type | 2. Wanachama wanasema nini? · What do members say? Reviews are in the app. · 3.2 s | none |
| 4 | type | 3. Unaweza kulipa kwa simu? · Can you pay by phone? M-Pesa or Airtel Money, in the app. · 3.2 s | none |
| 5 | type | Pass moja. Gym nyingi zilizokaguliwa. App moja. · One pass. Many vetted gyms. One app. · 3 s | none |
| 6 | cta | Unataka kuanza? Andika · PASS · 4 s | none |

Source: `source/reel.json`; render with `node social/tools/render-reel.js social/content/2026-11-W2-R-reel-members`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a dumbbell rack); text: Kabla hujalipa gym yoyote Dar… Before you pay any gym in Dar… |
| 2 | Text slide; text: 1. Je, imekaguliwa? Has anyone inspected it? FitFlex visits every gym before it joins. |
| 3 | Text slide; text: 2. Wanachama wanasema nini? What do members say? Reviews are in the app. |
| 4 | Text slide; text: 3. Unaweza kulipa kwa simu? Can you pay by phone? M-Pesa or Airtel Money, in the app. |
| 5 | Text slide; text: Pass moja. Gym nyingi zilizokaguliwa. App moja. One pass. Many vetted gyms. One app. |
| 6 | Call to action; text: Unataka kuanza? Andika; Keyword PASS. Tutakutumia DM link ya app. · We’ll DM you the app link. |

## Caption

**Swahili**
> Kabla hujalipa gym yoyote Dar, angalia mambo matatu: imekaguliwa? wanachama wanasema nini? unaweza kulipa kwa simu? FitFlex inafanya yote matatu.
> Andika PASS tukutumie link ya app.

**English (lead)**
> Before you pay any gym in Dar, check three things: has anyone inspected it, what do members say, and can you pay by phone. FitFlex does all three. Comment PASS for the app link.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PASS** → the owner replies to PASS comments and DMs himself: one line on the Pass plus the Android app link; the DM must not promise iOS.

## Hashtags

#fitness #mazoezi #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Reel (video); the Metricool connector has only been used for image carousels so far, so the first reel reservation must confirm the payload type |
| Facebook | not adapted | platform-specs.md has no Facebook video row; add one after checking the Page spec, or post the carousel version |
| TikTok | not adapted | Same file would fit; no FitFlex TikTok account recorded |
| LinkedIn | not adapted | Low fit |

## Checks before approval

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Metricool: confirm the connector accepts a video URL with instagramData type REEL before reserving (never tested)
- [ ] Silent reel; add music only with a licence
