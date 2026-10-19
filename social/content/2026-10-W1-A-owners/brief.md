# 2026-10-W1-A-owners — "You're counting the wrong members."

State: **scheduled** on Instagram for 2026-10-21 17:00 Dar es Salaam (pub_0004; owner approved 2026-10-19). Facebook variant not scheduled. Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Run a better gym |
| Audience | Gym owners (Hassan persona) |
| Problem | Owners count sign-ups, not visits, so they cannot see who is about to leave or why off-peak hours are empty |
| Hook | You're counting the wrong members. |
| Concept | Contrarian 8-slide carousel in FitFlex's own words: sign-ups vs visits, the notebook problem, silent churn, off-peak as a data problem, the dashboard, new members, PARTNER keyword |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | Swahili (odd week) |
| Inspiration | ins_2026-10-09_01 (operator-authority carousel structure), ins_2026-10-09_04 (attendance beats sign-ups). Structure only; no wording reused |
| Facts cited | Owner dashboard with check-ins, busy hours and lapsed members: `FitFlex_Platform_Business_Overview.md`. No statistics used |
| Planned slot | Monday, week 1 |

## Slides

Template v2 (2026-10-20): deep slate ground, Volt accent word, mono eyebrow "Run a better gym", photo-scrim slides where the photo carries, list slide for proof, keyword CTA. Previous v1 spec: `source/slides-v1.json`.

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | You're counting the wrong members. Sign-ups aren't the number. | pexels-34043570 |
| 2 | type | Sign-ups tell you who joined. Visits tell you who stayed. | none |
| 3 | photo | Most small gyms track visits in a notebook. Or not at all. | pexels-10376250 |
| 4 | type | Can't see visits? You can't see who's leaving. | none |
| 5 | list | Empty off-peak hours aren't a mystery. Rows: Check-ins today, Visit trends, Slipping · at risk, Stopped coming | none |
| 6 | type | A dashboard shows check-ins, visit trends and who stopped coming. | none |
| 7 | photo | And it brings new members to your door. | pexels-6604154 |
| 8 | cta | Own a gym in Dar es Salaam? Comment PARTNER. We'll DM you how FitFlex works. | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W1-A-owners --png`.

## Caption

**Swahili (lead)**
> Unahesabu wanachama wasiofaa? 👀
> Kujiunga si kubaki. Ukitaka kujua nani anakuja kweli, hesabu ziara, si usajili.
> Una gym Dar es Salaam? Andika **PARTNER** kwenye comments tupate kukutumia maelezo.

**English**
> Sign-ups tell you who joined. Visits tell you who stayed. Comment PARTNER to learn how FitFlex works for gyms.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PARTNER** → DM with a short explanation of partnering and the partner sign-up link or contact. Keyword delivery needs the comment-to-DM module (Phase 5) or a manual reply in the meantime.

## Hashtags (max 5)

#gymowner #fitnessbusiness #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| LinkedIn | not adapted | Candidate: same 8 slides as a PDF document post, English lead, owner audience fits LinkedIn best |
| Facebook | drafted | Same 8 slides and caption on the FitFlex Africa Page (connected in Metricool 2026-10-16) |
| TikTok | not adapted | Would need a text-motion version |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass 2026-10-16 after one revise (facts tags, C02/C04 surfaces)
- [x] Native Swahili review: owner chose to proceed without it for now (2026-10-16); caption still marked as a draft
- [ ] Where does the PARTNER DM link: sign-up page, WhatsApp number or email?
- [ ] Confirm the owner dashboard features named on slide 6 are live in the current build
