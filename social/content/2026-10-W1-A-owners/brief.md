# 2026-10-W1-A-owners — "You're counting the wrong members."

State: **brand_checked** (brand review passed 2026-10-16; owner approval pending). Record: `social/data/ideas.jsonl`.

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

| # | Theme | Text | Photo |
|---|---|---|---|
| 1 | navy | **You're counting the wrong members.** | pexels-36510739 |
| 2 | cream | Sign-ups tell you who joined. Visits tell you who **stayed.** (bars overlay) | pexels-34043570 |
| 3 | orange | Most small gyms track visits in a notebook. Or not at all. | pexels-10376250 |
| 4 | navy | Can't see visits? You can't see who's leaving. | pexels-4716814 |
| 5 | green | Empty off-peak hours aren't a mystery. They're a **data problem.** (chart overlay) | pexels-12250460 |
| 6 | cream | A dashboard shows check-ins, busy hours and who stopped coming. (dashboard overlay) | pexels-9545909 |
| 7 | navy | And it brings new members to your door. | pexels-6604154 |
| 8 | orange | **Own a gym in Dar es Salaam?** Comment **PARTNER**. We'll DM you how FitFlex works. | pexels-8612491 |

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
