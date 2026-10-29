# 2026-11-W4-R-reel-trainers — "Mteja anaona nini kwenye profile yako?"

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Sat 2026-11-28 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Grow your business (grow_business) |
| Audience | trainer (Independent trainer in Dar) |
| Problem | Trainers do not know what a client actually sees before deciding to book |
| Hook | Mteja anaona nini kwenye profile yako? / What a client sees on your profile. |
| Concept | Text-motion reel, editorial frames, about 20 s: who you help, photos of real sessions, reviews from clients who booked, open slots and your price, one button to book and pay, TRAINER. |
| Format | Reel, 7 frames, 1080×1920, about 22 s, silent |
| Language lead | en (ISO week 48; English caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: booking, reviews, mm, trainerbio |
| Planned slot | Sat 2026-11-28 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. Frames are padded to 9:16 on their own ground colour by `render-reel.js`, with a slow push-in and fades; no music.

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Mteja anaona nini kwenye profile yako? · What a client sees on your profile. · Trainer · 2.5 s | pexels-4720518 |
| 2 | rule | Unamsaidia nani. · Who you help, in one line. · 3 s | none |
| 3 | rule | Picha za vipindi halisi. · Photos of real sessions. · 3 s | none |
| 4 | rule | Reviews kutoka kwa waliobook. · Reviews from clients who booked. · 3 s | none |
| 5 | rule | Nafasi zako na bei yako. · Your open slots and your price. · 3 s | none |
| 6 | rule | Kitufe kimoja: Book. · One button: book and pay by mobile money. · 3 s | none |
| 7 | cta | Wewe ni trainer? Andika · Are you a trainer? Comment · TRAINER · 4 s | none |

Source: `source/reel.json`; render with `node social/tools/render-reel.js social/content/2026-11-W4-R-reel-trainers`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a man chalking his hands in a gym); Swahili: Mteja anaona nini kwenye profile yako?; English: What a client sees on your profile. |
| 2 | Point 01 slide; Swahili: Unamsaidia nani.; English: Who you help, in one line. |
| 3 | Point 02 slide; Swahili: Picha za vipindi halisi.; English: Photos of real sessions. |
| 4 | Point 03 slide; Swahili: Reviews kutoka kwa waliobook.; English: Reviews from clients who booked. |
| 5 | Point 04 slide; Swahili: Nafasi zako na bei yako.; English: Your open slots and your price. |
| 6 | Point 05 slide; Swahili: Kitufe kimoja: Book.; English: One button: book and pay by mobile money. |
| 7 | Call to action; Swahili: Wewe ni trainer? Andika; English: Are you a trainer? Comment; Keyword TRAINER. Tutakutumia DM jinsi ya kujiunga. We’ll DM you how to join. |

## Caption

**Swahili**
> Mteja anaona nini kwenye profile yako ya FitFlex: unamsaidia nani, picha za vipindi halisi, reviews kutoka kwa waliobook, nafasi zako na bei yako, na kitufe kimoja cha kubook na kulipa.
> Wewe ni trainer? Andika TRAINER.

**English (lead)**
> What a client sees on your FitFlex profile: who you help, photos of real sessions, reviews from clients who booked, your open slots and your price, and one button to book and pay. Trainers, comment TRAINER.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **TRAINER** → the owner replies to TRAINER comments and DMs himself: a short note on the trainer side plus the trainer sign-up link.

## Hashtags

#personaltrainer #fitnesscoach #daressalaam #tanzania #fitflexafrica

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
- [ ] Metricool: confirm video + REEL type through the connector before reserving
