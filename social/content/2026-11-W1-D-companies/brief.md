# 2026-11-W1-D-companies — "Wellness ya ofisi si t-shirt ya marathon."

State: **brand_checked** (brand review: revise 2026-10-29, fixed, re-check pass). Planned slot Sun 2026-11-08 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Community (community) |
| Audience | club_company (HR lead or founder of a Dar company with 20–200 staff [ASSUMPTION]) |
| Problem | Company wellness is a one-off T-shirt event; nobody knows whether staff actually train afterwards [ASSUMPTION] |
| Hook | Wellness ya ofisi si t-shirt ya marathon. / Office wellness isn’t a marathon T-shirt. |
| Concept | Editorial carousel: sponsor gym access, choose who and how much, company challenges and groups, insights on participation, what a programme includes, TEAM keyword. No prices, no invoice terms, participation only (privacy wording unreviewed by counsel). |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | sw (ISO week 45; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: b2b, lead, network |
| Planned slot | Sun 2026-11-08 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Wellness ya ofisi si t-shirt ya marathon. · Office wellness isn’t a marathon T-shirt. · Kampuni · companies | pexels-10376250 |
| 2 | rule | Lipia gym ya wafanyakazi, si ahadi. · Sponsor gym access for your team: a pass they can use any day, paid by the company. | none |
| 3 | rule | Wewe unaamua nani na kiasi gani. · Pick who is eligible, by department or by name, and how much the company covers. | none |
| 4 | rule | Changamoto na vikundi vya kampuni. · Company challenges and groups, with a leaderboard the team can see. | none |
| 5 | rule | Unaona matumizi, si tu bili. · Insights show participation, the gyms and trainers used, and billing by month. | none |
| 6 | check | Ni nini kinaingia kwenye mpango. · What a programme can include. · Rows: Gym access, Vipindi vya trainer, Changamoto za kampuni, Ripoti za kila mwezi | none |
| 7 | cta | Una timu Dar es Salaam? Andika · Run a team in Dar es Salaam? Comment · TEAM | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W1-D-companies --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a man at an office desk); Swahili: Wellness ya ofisi si t-shirt ya marathon.; English: Office wellness isn’t a marathon T-shirt. |
| 2 | FAIDA · BENEFIT slide; Swahili: Lipia gym ya wafanyakazi, si ahadi.; English: Sponsor gym access for your team: a pass they can use any day, paid by the company. |
| 3 | CHAGUA · CHOOSE slide; Swahili: Wewe unaamua nani na kiasi gani.; English: Pick who is eligible, by department or by name, and how much the company covers. |
| 4 | TIMU · TEAM slide; Swahili: Changamoto na vikundi vya kampuni.; English: Company challenges and groups, with a leaderboard the team can see. |
| 5 | RIPOTI · INSIGHTS slide; Swahili: Unaona matumizi, si tu bili.; English: Insights show participation, the gyms and trainers used, and billing by month. |
| 6 | Checklist slide; Swahili: Ni nini kinaingia kwenye mpango.; English: What a programme can include.; Rows: Gym access (the sponsored pass), Vipindi vya trainer (trainer sessions), Changamoto za kampuni (company challenges and groups), Ripoti za kila mwezi (monthly insights and a CSV download) |
| 7 | Call to action; Swahili: Una timu Dar es Salaam? Andika; English: Run a team in Dar es Salaam? Comment; Keyword TEAM. Tutakutumia DM jinsi programu ya kampuni inavyofanya kazi. We’ll DM you how company programmes work. |

## Caption

**Swahili (lead)**
> Wellness ya ofisi si t-shirt ya marathon. Lipia gym ya wafanyakazi wako kupitia FitFlex, chagua nani na kiasi gani, weka changamoto za kampuni, na uone matumizi kila mwezi.
> Una timu Dar es Salaam? Andika TEAM.

**English**
> Office wellness isn’t a marathon T-shirt. Sponsor gym access for your team through FitFlex, choose who and how much, run company challenges, and see participation every month. Run a team in Dar? Comment TEAM.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **TEAM** → the owner replies to TEAM comments and DMs himself: one line on company programmes plus a request for the company name and a contact; no prices in the DM.

## Hashtags

#corporatewellness #hr #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| Facebook | drafted | Same media and caption without hashtags on the FitFlex Africa Page (Page↔Instagram link at Meta still unconfirmed) |
| TikTok | not adapted | Candidate for a text-motion reel of the first four slides |
| LinkedIn | not adapted | Good fit as a document post, English lead; Company Page not confirmed |

## Checks before approval

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Counsel has not reviewed the sponsors privacy wording; slides say "participation" only
- [ ] Owner to confirm he wants B2B leads on Instagram at all before approving
- [ ] No prices, fee basis or invoice terms anywhere (S-06/S-07 still open)
