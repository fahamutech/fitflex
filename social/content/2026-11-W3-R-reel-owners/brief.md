# 2026-11-W3-R-reel-owners — "Ishara 3 kwamba mwanachama anaondoka."

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Sun 2026-11-22 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v3). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Run a better gym (run_gym) |
| Audience | owner (Hassan (Independent Owner)) |
| Problem | Owners notice a member has left when the renewal does not come |
| Hook | Ishara 3 kwamba mwanachama anaondoka. / 3 signs a member is about to leave. |
| Concept | Text-motion reel, bilingual v3 frames, dark cover, about 19 s: fewer visits, no check-in for weeks, renewal passes quietly, FitFlex shows all three, PARTNER. |
| Format | Reel, 6 frames, 1080×1920, about 19 s, silent |
| Language lead | sw (ISO week 47; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: dash, engage, msg, renew |
| Planned slot | Sun 2026-11-22 17:00 Dar |

## Visual direction

Template v3: bilingual type-first slides, dark cover, outlined numerals and chips, check slide, keyword CTA. Frames are padded to 9:16 on their own ground colour by `render-reel.js`, with a slow push-in and fades; no music.

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover (dark) | Ishara 3 kwamba mwanachama anaondoka. · 3 signs a member is about to leave. · Retention · 2.5 s | none |
| 2 | rule | Ziara zinapungua. · Fewer visits than before. The first sign, and the one most owners miss. · 3.2 s | none |
| 3 | rule | Hajaingia kwa wiki. · No check-in for weeks. The app marks them at risk. · 3.2 s | none |
| 4 | rule | Renewal imepita kimya. · Renewal day passes with no payment and no goodbye. · 3.2 s | none |
| 5 | rule | Unaona zote kwenye app. · FitFlex shows all three before it’s too late, and lets you message them from the app. · 3.2 s | none |
| 6 | cta | Una gym Dar es Salaam? Andika · Own a gym in Dar es Salaam? Comment · PARTNER · 4 s | none |

Source: `source/reel.json`; render with `node social/tools/render-reel.js social/content/2026-11-W3-R-reel-owners`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide on dark slate; Swahili: Ishara 3 kwamba mwanachama anaondoka.; English: 3 signs a member is about to leave. |
| 2 | Point 01 slide; Swahili: Ziara zinapungua.; English: Fewer visits than before. The first sign, and the one most owners miss. |
| 3 | Point 02 slide; Swahili: Hajaingia kwa wiki.; English: No check-in for weeks. The app marks them at risk. |
| 4 | Point 03 slide; Swahili: Renewal imepita kimya.; English: Renewal day passes with no payment and no goodbye. |
| 5 | Point 04 slide; Swahili: Unaona zote kwenye app.; English: FitFlex shows all three before it’s too late, and lets you message them from the app. |
| 6 | Call to action; Swahili: Una gym Dar es Salaam? Andika; English: Own a gym in Dar es Salaam? Comment; Keyword PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. We’ll DM you how FitFlex works. |

## Caption

**Swahili (lead)**
> Ishara tatu kwamba mwanachama anaondoka: ziara zinapungua, hajaingia kwa wiki, renewal imepita kimya. FitFlex inakuonyesha zote tatu kabla hajaondoka, na unaweza kumtumia ujumbe kutoka kwenye app.
> Una gym Dar es Salaam? Andika PARTNER.

**English**
> Three signs a member is about to leave: fewer visits, no check-in for weeks, a renewal that passes quietly. FitFlex shows all three before it’s too late. Own a gym in Dar? Comment PARTNER.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PARTNER** → the owner replies to PARTNER comments and DMs himself while traffic is low (decided 2026-10-20): a short note on how FitFlex works for gyms plus the partner sign-up path.

## Hashtags

#gymowner #fitnessbusiness #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Reel (video); the Metricool connector has only been used for image carousels so far, so the first reel reservation must confirm the payload type |
| Facebook | not adapted | platform-specs.md has no Facebook video row; add one after checking the Page spec, or post the carousel version |
| TikTok | not adapted | Same file would fit; no FitFlex TikTok account recorded |
| LinkedIn | not adapted | Good fit as a document post, English lead; Company Page not confirmed |

## Checks before approval

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Metricool: confirm video + REEL type through the connector before reserving
