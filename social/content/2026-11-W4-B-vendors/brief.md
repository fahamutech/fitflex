# 2026-11-W4-B-vendors — "Unauza vifaa vya gym? Wateja wako tayari wako app moja."

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Thu 2026-11-26 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Marketplace (marketplace) |
| Audience | vendor (Small gym-gear or supplement seller in Dar [ASSUMPTION]) |
| Problem | Sellers of gym gear and supplements chase buyers one DM at a time |
| Hook | Unauza vifaa vya gym? Wateja wako tayari wako app moja. / Sell gym gear or supplements? Your buyers are already in one app. |
| Concept | Editorial carousel: list products with photos, buyers are training members, orders arrive in the app, verified vendors only, what you need to start, VENDOR keyword. No commission, no payout, no prices. |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | en (ISO week 48; English caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: vendor, partnernotif, badge |
| Planned slot | Thu 2026-11-26 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Unauza vifaa vya gym? Wateja wako tayari wako app moja. · Sell gym gear or supplements? Your buyers are already in one app. · Marketplace · soko | pexels-5312212 |
| 2 | rule | Orodhesha bidhaa zako na picha. · List products with photos and categories, from your phone. | none |
| 3 | rule | Wanunuzi ni wanachama wanaofanya mazoezi. · Buyers are FitFlex members already training. Your shop sits next to their pass. | none |
| 4 | rule | Oda zinakuja kwenye app, si kwenye DM. · Orders arrive in the app with a notification. Confirm, prepare, deliver. | none |
| 5 | rule | Wauzaji waliothibitishwa tu. · Vendors are verified before they sell. Members see who is verified before they buy. | none |
| 6 | check | Unahitaji nini kuanza. · What you need to start. · Rows: Jina la biashara, Kitambulisho, Bidhaa, Simu | none |
| 7 | cta | Unauza? Andika · Do you sell? Comment · VENDOR | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W4-B-vendors --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a row of coloured dumbbells); Swahili: Unauza vifaa vya gym? Wateja wako tayari wako app moja.; English: Sell gym gear or supplements? Your buyers are already in one app. |
| 2 | DUKA · LISTING slide; Swahili: Orodhesha bidhaa zako na picha.; English: List products with photos and categories, from your phone. |
| 3 | WATEJA · BUYERS slide; Swahili: Wanunuzi ni wanachama wanaofanya mazoezi.; English: Buyers are FitFlex members already training. Your shop sits next to their pass. |
| 4 | ODA · ORDERS slide; Swahili: Oda zinakuja kwenye app, si kwenye DM.; English: Orders arrive in the app with a notification. Confirm, prepare, deliver. |
| 5 | UTHIBITISHO · VERIFICATION slide; Swahili: Wauzaji waliothibitishwa tu.; English: Vendors are verified before they sell. Members see who is verified before they buy. |
| 6 | Checklist slide; Swahili: Unahitaji nini kuanza.; English: What you need to start.; Rows: Jina la biashara (business name and details), Kitambulisho (ID or registration, given once), Bidhaa (your first products with photos), Simu (a phone; the app does the rest) |
| 7 | Call to action; Swahili: Unauza? Andika; English: Do you sell? Comment; Keyword VENDOR. Tutakutumia DM jinsi ya kujiunga kama muuzaji. We’ll DM you how to join as a vendor. |

## Caption

**Swahili**
> Unauza vifaa vya gym au virutubisho Dar? Wateja wako tayari wako kwenye app moja. Orodhesha bidhaa na picha, pokea oda ndani ya app, na uuze kama muuzaji aliyethibitishwa kwa wanachama wanaofanya mazoezi.
> Andika VENDOR tukutumie jinsi ya kujiunga.

**English (lead)**
> Sell gym gear or supplements in Dar? Your buyers are already in one app. List products with photos, get orders in the app, and sell as a verified vendor to members who are already training. Comment VENDOR to learn how to join.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **VENDOR** → the owner replies to VENDOR comments and DMs himself: one line on the marketplace plus the vendor sign-up path in the app; no commission figure in the DM.

## Hashtags

#fitnessbusiness #gymgear #daressalaam #tanzania #fitflexafrica

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
- [ ] Marketplace payments are confirmed by hand and vendor payouts have not been tried with a real account (known gap); the slides promise neither
- [ ] Owner to confirm he wants vendor sign-ups now
