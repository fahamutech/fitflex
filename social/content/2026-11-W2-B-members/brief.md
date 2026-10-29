# 2026-11-W2-B-members — "Outgrown your gym? Upgrade the pass. Keep your dates."

State: **brand_checked** (brand review: revise 2026-10-29, fixed, re-check pass). Planned slot Thu 2026-11-12 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v2). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Find & train (find_train) |
| Audience | member (Juma (Mobile Professional)) |
| Problem | Members who outgrow their gym think the only way up is a new contract somewhere else |
| Hook | Outgrown your gym? Upgrade the pass. Keep your dates. |
| Concept | v2 photo-scrim carousel: tiers from everyday to executive, see the gyms in a tier before paying, what upgrading in place means (pay the difference, same end date, visits carry over, after staff approval), same QR more doors, mobile money, no new contract, PASS. No prices. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | en (ISO week 46; English caption first) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: upgrade, tierlist, mm, qr |
| Planned slot | Thu 2026-11-12 17:00 Dar |

## Visual direction

Template v2: deep slate ground, Volt accent word, photo-scrim slides where the photo carries, list slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | Umeikua gym yako? · Outgrown your gym? Upgrade the pass. Keep your dates. · Panda daraja la pass. Tarehe zako zibaki. | pexels-4720565 |
| 2 | type | Madaraja kuanzia gym za kila siku hadi executive. · Tiers from everyday gyms to executive. Pick the doors you want to walk through. | none |
| 3 | type | Unaona gym zote za daraja kabla ya kulipa. · See every active gym in a tier before you pay. | none |
| 4 | list | Kupanda daraja bila kuanza upya maana yake: · Rows: Pay only the difference, Same end date, Visits used carry over, New gyms open up | none |
| 5 | photo | App ile ile. QR ile ile. Milango zaidi. · Same app. Same QR. More doors. | pexels-9545914 |
| 6 | type | Lipa kwa M-Pesa au Airtel Money, ndani ya app. · Pay by M-Pesa or Airtel Money, in the app. | none |
| 7 | type | Hakuna mkataba mpya. Hakuna kuanza upya. · No new contract. No starting over. | none |
| 8 | cta | Unataka kuanza? Andika · PASS | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W2-B-members --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a man lifting a medicine ball); text: Umeikua gym yako? Panda daraja la pass. Tarehe zako zibaki. Outgrown your gym? Upgrade the pass. Keep your dates. |
| 2 | Text slide; text: Madaraja kuanzia gym za kila siku hadi executive. Tiers from everyday gyms to executive. Pick the doors you want to walk through. |
| 3 | Text slide; text: Unaona gym zote za daraja kabla ya kulipa. See every active gym in a tier before you pay. |
| 4 | Checklist slide; text: Kupanda daraja bila kuanza upya maana yake:; Rows: Pay only the difference (once), Same end date (kept), Visits used carry over (kept), New gyms open up (after approval) |
| 5 | Photo slide with a photo (gym equipment); text: App ile ile. QR ile ile. Milango zaidi. Same app. Same QR. More doors. |
| 6 | Text slide; text: Lipa kwa M-Pesa au Airtel Money, ndani ya app. Pay by M-Pesa or Airtel Money, in the app. |
| 7 | Text slide; text: Hakuna mkataba mpya. Hakuna kuanza upya. No new contract. No starting over. |
| 8 | Call to action; text: Unataka kuanza? Andika; Keyword PASS. Tutakutumia DM link ya app. · We’ll DM you the app link. |

## Caption

**Swahili**
> Umeikua gym yako? Panda daraja la pass yako ya FitFlex bila kuanza upya: lipa tofauti tu, tarehe ya mwisho inabaki, ziara ulizotumia zinabaki, na gym mpya zinafunguka malipo yakithibitishwa.
> Andika PASS tukutumie link ya app.

**English (lead)**
> Outgrown your gym? Upgrade your FitFlex pass in place: pay only the difference, keep your end date, keep the visits you used, and new gyms open up once the payment is approved. Comment PASS for the app link.

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
- [ ] No prices or tier names with amounts; tier names on slide 2 are generic
- [ ] Confirm upgrade is visible in the member app build testers have
