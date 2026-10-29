# 2026-11-W3-B-trainers — "Booking bila DM. Malipo bila "nitakutumia"."

State: **brand_checked** (brand review: revise 2026-10-29, fixed, re-check pass). Planned slot Wed 2026-11-18 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v3). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Grow your business (grow_business) |
| Audience | trainer (Independent trainer in Dar) |
| Problem | Trainers run bookings in DMs and get paid "later", which often means never |
| Hook | Booking bila DM. Malipo bila "nitakutumia". / Bookings without DMs. Payment without "I’ll send it later". |
| Concept | Bilingual v3 carousel, dark cover: client picks a slot, paid in the app before the session, cancellations follow visible rules, message inside the app, a weekly statement, what your client sees, TRAINER. No payout terms, no hours for the cancellation rule. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | sw (ISO week 47; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: booking, mm, refund, tstmt, reviews, trainerbio |
| Planned slot | Wed 2026-11-18 17:00 Dar |

## Visual direction

Template v3: bilingual type-first slides, dark cover, outlined numerals and chips, check slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover (dark) | Booking bila DM. Malipo bila “nitakutumia”. · Bookings without DMs. Payment without “I’ll send it later”. · Trainer · bookings | none |
| 2 | rule | Mteja anachagua muda kutoka nafasi zako. · The client picks a slot from your availability. Several sessions in one booking. | none |
| 3 | rule | Malipo kabla ya kipindi. · Paid in the app before the session, by mobile money. No chasing on the day. | none |
| 4 | rule | Kughairi kuna sheria. · Cancellations follow rules both sides can see, with the refund tracked in the app. | none |
| 5 | rule | Ongea ndani ya app. · Message clients inside the app. Your number stays yours. | none |
| 6 | rule | Taarifa ya wiki ya kazi yako. · A weekly statement of the sessions you delivered, in the app. | none |
| 7 | check | Mteja wako anaona hivi. · What your client sees. · Rows: Profile yako, Nafasi zako, Reviews, Bei yako | none |
| 8 | cta | Wewe ni trainer? Andika · Are you a trainer? Comment · TRAINER | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W3-B-trainers --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide on dark slate; Swahili: Booking bila DM. Malipo bila “nitakutumia”.; English: Bookings without DMs. Payment without “I’ll send it later”. |
| 2 | Point 01 slide; Swahili: Mteja anachagua muda kutoka nafasi zako.; English: The client picks a slot from your availability. Several sessions in one booking. |
| 3 | Point 02 slide; Swahili: Malipo kabla ya kipindi.; English: Paid in the app before the session, by mobile money. No chasing on the day. |
| 4 | Point 03 slide; Swahili: Kughairi kuna sheria.; English: Cancellations follow rules both sides can see, with the refund tracked in the app. |
| 5 | Point 04 slide; Swahili: Ongea ndani ya app.; English: Message clients inside the app. Your number stays yours. |
| 6 | Point 05 slide; Swahili: Taarifa ya wiki ya kazi yako.; English: A weekly statement of the sessions you delivered, in the app. |
| 7 | Checklist slide; Swahili: Mteja wako anaona hivi.; English: What your client sees.; Rows: Profile yako (who you help, photos, specialties), Nafasi zako (your open slots), Reviews (from clients who booked), Bei yako (your price, set by you) |
| 8 | Call to action; Swahili: Wewe ni trainer? Andika; English: Are you a trainer? Comment; Keyword TRAINER. Tutakutumia DM jinsi ya kujiunga. We’ll DM you how to join. |

## Caption

**Swahili (lead)**
> Booking bila DM, malipo bila “nitakutumia”. Kwa FitFlex mteja anachagua muda, analipa ndani ya app kabla ya kipindi, kughairi kuna sheria zinazoonekana, na mnaongea ndani ya app.
> Wewe ni trainer? Andika TRAINER.

**English**
> Bookings without DMs, payment without “I’ll send it later”. On FitFlex the client picks a slot, pays in the app before the session, cancellations follow visible rules, and you message inside the app. Trainers, comment TRAINER.

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

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Statement slide names no amounts, percentages or discounts (counsel)
- [ ] Cancellation hours are not stated (24h rule still to confirm)
