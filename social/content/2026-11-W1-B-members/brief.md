# 2026-11-W1-B-members — "Gym nzuri inaonekana kabla hujalipa."

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Wed 2026-11-04 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Find & train (find_train) |
| Audience | member (Amina (Urban Seeker)) |
| Problem | Members pay a gym on a promise and find out what it is like after the money is gone |
| Hook | Gym nzuri inaonekana kabla hujalipa. / A good gym shows itself before you pay. |
| Concept | Editorial carousel: inspection before joining, see every active gym in your tier before paying, reviews from members who trained there, saved gyms, a "before you pay" checklist, PASS. |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | sw (ISO week 45; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: vet, tierlist, reviews, saved, mm |
| Planned slot | Wed 2026-11-04 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Gym nzuri inaonekana kabla hujalipa. · A good gym shows itself before you pay. · Vetted · imekaguliwa | pexels-29526371 |
| 2 | rule | Kila gym inatembelewa kwanza. · Every FitFlex gym is visited and scored before it joins: equipment, amenities, facility, staff. | none |
| 3 | rule | Unaona gym zote za daraja lako kabla ya kulipa. · See every active gym in your pass tier before you pay a shilling. | none |
| 4 | rule | Reviews kutoka kwa waliofanya mazoezi pale. · Reviews from members who trained there, under the gym, in the app. | none |
| 5 | rule | Hifadhi gym unazopenda kwa moyo mmoja. · Tap the heart to save a gym; filter your list to the ones you saved. | none |
| 6 | check | Kabla hujalipa, angalia hivi. · Before you pay any gym, check these. · Rows: Imekaguliwa, Daraja, Reviews, Malipo | none |
| 7 | cta | Tayari kuchagua? Andika · Ready to choose? Comment · PASS | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W1-B-members --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a gym floor); Swahili: Gym nzuri inaonekana kabla hujalipa.; English: A good gym shows itself before you pay. |
| 2 | UKAGUZI · INSPECTION slide; Swahili: Kila gym inatembelewa kwanza.; English: Every FitFlex gym is visited and scored before it joins: equipment, amenities, facility, staff. |
| 3 | DARAJA · TIER slide; Swahili: Unaona gym zote za daraja lako kabla ya kulipa.; English: See every active gym in your pass tier before you pay a shilling. |
| 4 | REVIEWS slide; Swahili: Reviews kutoka kwa waliofanya mazoezi pale.; English: Reviews from members who trained there, under the gym, in the app. |
| 5 | HIFADHI · SAVED slide; Swahili: Hifadhi gym unazopenda kwa moyo mmoja.; English: Tap the heart to save a gym; filter your list to the ones you saved. |
| 6 | Checklist slide; Swahili: Kabla hujalipa, angalia hivi.; English: Before you pay any gym, check these.; Rows: Imekaguliwa (inspected and scored), Daraja (which tier it is in), Reviews (what members said), Malipo (pay by M-Pesa or Airtel Money, in the app) |
| 7 | Call to action; Swahili: Tayari kuchagua? Andika; English: Ready to choose? Comment; Keyword PASS. Tutakutumia DM link ya app. We’ll DM you the app link. |

## Caption

**Swahili (lead)**
> Gym nzuri inaonekana kabla hujalipa. Kila gym ya FitFlex inakaguliwa kwanza, unaona gym zote za daraja lako kabla ya kulipa, na reviews zinatoka kwa waliofanya mazoezi pale.
> Andika PASS tukutumie link ya app.

**English**
> A good gym shows itself before you pay. Every FitFlex gym is inspected first, you see every gym in your tier before paying, and reviews come from members who trained there. Comment PASS for the app link.

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
- [ ] Reviews: the rating fix has not been checked end to end with a real review; confirm a review shows under a gym in the current build
- [ ] The DM must not promise iOS
