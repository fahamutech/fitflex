# 2026-10-W1-C-members — "One gym. One contract. Stuck."

State: **scheduled** (v2 render swapped into the planner 2026-10-20) on Instagram for 2026-10-25 17:00 Dar es Salaam (pub_0006; owner approved 2026-10-19). Facebook variant not scheduled. Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Find & train |
| Audience | Members (Amina and Juma personas) |
| Problem | Members are locked into one gym with one contract and cannot trust unfamiliar gyms |
| Hook | One gym. One contract. Stuck. |
| Concept | 8-slide carousel explaining the Pass without prices: mobile money, the network, vetting, travel, QR check-in, one app, PASS keyword |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | Swahili (odd week) |
| Inspiration | ins_2026-10-09_08 (gym as destination), ins_2026-10-09_17 (short Swahili-first captions). Structure only |
| Facts cited | QR refresh 60 s: `canon/00-master-brain/glossary-and-metrics.md` [FACT]. Pass, vetting, mobile money: `FitFlex_Platform_Business_Overview.md`. No prices or visit caps on purpose |
| Planned slot | Saturday, week 1 |

## Slides

Template v2 (2026-10-20): deep slate ground, Volt accent word, mono eyebrow "Find & train", photo-scrim slides where the photo carries, list slide for proof, keyword CTA. Previous v1 spec: `source/slides-v1.json`.

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | One gym. One contract. Stuck. There's a better way. | pexels-6388369 |
| 2 | list | Pay once with mobile money. Rows: M-Pesa, Airtel Money, Tigo Pesa | none |
| 3 | photo | Train at gyms across the network. | pexels-29526371 |
| 4 | type | Every gym is visited and scored before it joins. | none |
| 5 | photo | Travelling for work? Your pass goes with you. | pexels-4173217 |
| 6 | type | Check in with a QR that refreshes every minute. | none |
| 7 | type | Book a trainer and buy gear in one app. | none |
| 8 | cta | Want in? Comment PASS. We'll DM you the link. | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W1-C-members --png`.

## Caption

**Swahili (lead)**
> Gym moja, mkataba mmoja, umekwama? Kuna njia bora. 💪
> Lipa mara moja kwa M-Pesa, Airtel Money au Tigo Pesa, na ufanye mazoezi kwenye gym tofauti zilizokaguliwa na FitFlex.
> Andika **PASS** kwenye comments tukutumie link.

**English**
> One mobile-money pass, many vetted gyms. Comment PASS for the link.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PASS** → DM with a one-line explanation of the Platform Pass plus the Android app link. Android is live, iOS is not; the DM must not promise iOS.

## Hashtags

#gym #daressalaam #mpesa #fitness #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| TikTok | not adapted | Candidate: 15 s text-motion of slides 1–4 |
| Facebook | drafted | Same 8 slides and caption on the FitFlex Africa Page (connected in Metricool 2026-10-16) |
| LinkedIn | not adapted | Low fit |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass 2026-10-16 after one revise (facts tags, C02/C04 surfaces)
- [x] Native Swahili review: owner chose to proceed without it for now (2026-10-16); caption still marked as a draft
- [ ] "Across the network" must be true for the gyms live in Dar es Salaam; if only a few are live, say "gyms in Dar es Salaam" and name the number honestly
- [ ] The Android link is live and the DM does not mention iOS
- [ ] Confirm the trainer booking and marketplace named on slide 7 are live in the current build
