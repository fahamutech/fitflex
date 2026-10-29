# 2026-11-W1-C-trainers — "Mpango wa mazoezi unaoishi kwenye simu ya mteja."

State: **brand_checked** (brand review pass 2026-10-29). Planned slot Fri 2026-11-06 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Grow your business (grow_business) |
| Audience | trainer (Independent trainer in Dar) |
| Problem | Trainers send plans as notebook photos on WhatsApp and never know whether the client followed them |
| Hook | Mpango wa mazoezi unaoishi kwenye simu ya mteja. / A training plan that lives on your client’s phone. |
| Concept | Editorial carousel: build a plan from the library, client accepts first, edits notify, see workouts logged, a "what a trainer gets" list, TRAINER. |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | sw (ISO week 45; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: plans, booking, share, trainerbio |
| Planned slot | Fri 2026-11-06 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Mpango wa mazoezi unaoishi kwenye simu ya mteja. · A training plan that lives on your client’s phone. · Mipango · training plans | pexels-5878659 |
| 2 | rule | Jenga mpango kwa dakika, si kwa karatasi. · Build a plan from the exercise library or write your own. No more WhatsApp photos of a notebook. | none |
| 3 | rule | Mteja anakubali kwanza. · Send it; the client accepts it before it starts. Nothing lands on them unannounced. | none |
| 4 | rule | Ukibadilisha, anajulishwa. · Edit a sent plan and the client is notified. One version, always current. | none |
| 5 | rule | Unaona maendeleo bila kuuliza. · See the workouts they logged in their activity summary. Ask less, coach more. | none |
| 6 | check | Trainer kwenye FitFlex anapata hivi. · What a trainer gets on FitFlex. · Rows: Profile, Booking na malipo, Ujumbe ndani ya app, Mipango ya mazoezi | none |
| 7 | cta | Wewe ni trainer? Andika · Are you a trainer? Comment · TRAINER | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W1-C-trainers --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a man in a black jacket in a gym); Swahili: Mpango wa mazoezi unaoishi kwenye simu ya mteja.; English: A training plan that lives on your client’s phone. |
| 2 | JENGA · BUILD slide; Swahili: Jenga mpango kwa dakika, si kwa karatasi.; English: Build a plan from the exercise library or write your own. No more WhatsApp photos of a notebook. |
| 3 | TUMA · SEND slide; Swahili: Mteja anakubali kwanza.; English: Send it; the client accepts it before it starts. Nothing lands on them unannounced. |
| 4 | BADILISHA · EDIT slide; Swahili: Ukibadilisha, anajulishwa.; English: Edit a sent plan and the client is notified. One version, always current. |
| 5 | FUATILIA · FOLLOW slide; Swahili: Unaona maendeleo bila kuuliza.; English: See the workouts they logged in their activity summary. Ask less, coach more. |
| 6 | Checklist slide; Swahili: Trainer kwenye FitFlex anapata hivi.; English: What a trainer gets on FitFlex.; Rows: Profile (who you help, photos, specialties), Booking na malipo (bookings and payment in one app), Ujumbe ndani ya app (in-app messaging with clients), Mipango ya mazoezi (training plans your clients accept) |
| 7 | Call to action; Swahili: Wewe ni trainer? Andika; English: Are you a trainer? Comment; Keyword TRAINER. Tutakutumia DM jinsi ya kujiunga. We’ll DM you how to join. |

## Caption

**Swahili (lead)**
> Mpango wa mazoezi unaoishi kwenye simu ya mteja. Jenga kutoka kwenye maktaba ya mazoezi, mteja anakubali kwanza, ukibadilisha anajulishwa, na unaona mazoezi aliyorekodi.
> Wewe ni trainer? Andika TRAINER.

**English**
> A training plan that lives on your client’s phone. Build it from the exercise library, the client accepts it first, edits notify them, and you see the workouts they logged. Trainers, comment TRAINER.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **TRAINER** → the owner replies to TRAINER comments and DMs himself: a short note on the trainer side plus the trainer sign-up link.

## Hashtags

#personaltrainer #fitnesscoach #daressalaam #tanzania #fitflexafrica

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
- [ ] Confirm trainer summaries show client workouts against a plan in the current build
