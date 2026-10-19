# 2026-10-W1-B-trainers — "Why clients don't book you."

State: **brand_checked** (brand review passed 2026-10-16; owner approval pending). Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Grow your business |
| Audience | Trainers |
| Problem | Trainers lose bookings because clients cannot tell what they help with, see no proof, and find paying hard |
| Hook | Why clients don't book you. (It's not your price.) |
| Concept | 8-slide carousel: three reasons clients do not book, the fix, FitFlex profile + bookings + payment, TRAINER keyword |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | Swahili (odd week) |
| Inspiration | ins_2026-10-09_14 (speak to the problem, not yourself), ins_2026-10-09_16 (comment-keyword funnel). Structure only |
| Facts cited | Trainer profile, bookings and in-app payment: `FitFlex_Platform_Business_Overview.md` |
| Planned slot | Friday, week 1 |

## Slides

Template v2 (2026-10-20): deep slate ground, Volt accent word, mono eyebrow "Grow your business", photo-scrim slides where the photo carries, list slide for proof, keyword CTA. Previous v1 spec: `source/slides-v1.json`.

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | Why clients don't book you. (It's not your price.) | pexels-4720518 |
| 2 | type | 1. They can't tell what you actually help with. | none |
| 3 | type | “Personal trainer” says nothing. Say who you help, and with what. | none |
| 4 | list | 2. They can't see proof. Rows: Photos, Specialties, Honest reviews, Nothing | none |
| 5 | photo | 3. Booking and paying is hard. Cash, DMs and “later” kill sales. | pexels-7432872 |
| 6 | type | Fix all three. Clear offer. Visible proof. Easy booking. | none |
| 7 | type | A profile, bookings and payment, in one app. | none |
| 8 | cta | Are you a trainer? Comment TRAINER. We'll DM you how to join. | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W1-B-trainers --png`.

## Caption

**Swahili (lead)**
> Kwa nini wateja hawakubuki? Mara nyingi si bei.
> Sema unamsaidia nani na tatizo gani, onyesha ushahidi, na wape njia rahisi ya kulipa.
> Mkufunzi? Andika **TRAINER** kwenye comments tukutumie jinsi ya kujiunga.

**English**
> Say who you help, show proof, make paying easy. Trainers, comment TRAINER to learn how to join.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **TRAINER** → DM with a short explanation of the trainer side plus the trainer sign-up link.

## Hashtags

#personaltrainer #fitnesscoach #tanzania #daressalaam #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| TikTok | not adapted | Candidate: trainer talking-head or text-motion version of slides 2–5 |
| Facebook | drafted | Same 8 slides and caption on the FitFlex Africa Page (connected in Metricool 2026-10-16) |
| LinkedIn | not adapted | Low fit |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass 2026-10-16 after one revise (facts tags, C02/C04 surfaces)
- [x] Native Swahili review: owner chose to proceed without it for now (2026-10-16); caption still marked as a draft
- [ ] Confirm trainer onboarding is open to new sign-ups and reviews are visible on trainer profiles in the current build
- [ ] Where does the TRAINER DM link?
