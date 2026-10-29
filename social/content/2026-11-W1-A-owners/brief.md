# 2026-11-W1-A-owners — "Mlango wa gym yako unajua nani ameingia?"

State: **brand_checked** (brand review pass 2026-10-29). Planned slot Mon 2026-11-02 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = editorial). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Run a better gym (run_gym) |
| Audience | owner (Hassan (Independent Owner)) |
| Problem | Owners know who paid but not who walked in; attendance lives in a notebook or in nobody’s head |
| Hook | Mlango wa gym yako unajua nani ameingia? / Does your door know who walked in today? |
| Concept | Editorial carousel (cream / navy / green, arch-cropped B&W photo): QR check-in that refreshes every minute, check-ins today, visit trends, who is slipping, a notebook-vs-FitFlex list, PARTNER. The "access" angle Membroz leads with, done with our real feature and no fake device. |
| Format | Carousel, 7 slides, 1080×1350 |
| Language lead | sw (ISO week 45; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: qr, dash, engage, msg, network, membroz |
| Planned slot | Mon 2026-11-02 17:00 Dar |

## Visual direction

Template editorial: cream / navy / green grounds, brand green accent, arch-cropped black-and-white photo on the cover, numbered slides, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Mlango wa gym yako unajua nani ameingia? · Does your door know who walked in today? · Check-in · access | pexels-4716814 |
| 2 | rule | QR inayobadilika kila dakika. · Members check in with a QR code that refreshes every minute. Nothing to forge, nothing to write down. | none |
| 3 | rule | Unaona nani ameingia leo. · Check-ins today, on your phone, as they happen. | none |
| 4 | rule | Ziara kwa wiki, si kwa kumbukumbu. · Visit trends by week, instead of a feeling about how busy it was. | none |
| 5 | rule | Anayepungua anaonekana mapema. · Who is slipping, who is at risk, who has stopped coming, before renewal day. | none |
| 6 | check | Daftari dhidi ya FitFlex. · The notebook versus FitFlex. · Rows: Nani ameingia leo, Nani amepungua, Ujumbe kwa wanaopungua, Wageni kutoka mtandaoni | none |
| 7 | cta | Una gym Dar es Salaam? Andika · Own a gym in Dar es Salaam? Comment · PARTNER | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W1-A-owners --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a gym floor with treadmills and lockers); Swahili: Mlango wa gym yako unajua nani ameingia?; English: Does your door know who walked in today? |
| 2 | QR · CHECK-IN slide; Swahili: QR inayobadilika kila dakika.; English: Members check in with a QR code that refreshes every minute. Nothing to forge, nothing to write down. |
| 3 | LEO · TODAY slide; Swahili: Unaona nani ameingia leo.; English: Check-ins today, on your phone, as they happen. |
| 4 | WIKI · WEEKLY slide; Swahili: Ziara kwa wiki, si kwa kumbukumbu.; English: Visit trends by week, instead of a feeling about how busy it was. |
| 5 | HATARI · AT RISK slide; Swahili: Anayepungua anaonekana mapema.; English: Who is slipping, who is at risk, who has stopped coming, before renewal day. |
| 6 | Checklist slide; Swahili: Daftari dhidi ya FitFlex.; English: The notebook versus FitFlex.; Rows: Nani ameingia leo (who came today), Nani amepungua (who is slipping), Ujumbe kwa wanaopungua (a message to them, sent from the app), Wageni kutoka mtandaoni (visitors from the FitFlex network) |
| 7 | Call to action; Swahili: Una gym Dar es Salaam? Andika; English: Own a gym in Dar es Salaam? Comment; Keyword PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. We’ll DM you how FitFlex works. |

## Caption

**Swahili (lead)**
> Mlango wa gym yako unajua nani ameingia leo? Kwa FitFlex wanachama wanaingia kwa QR inayobadilika kila dakika, na wewe unaona ziara za leo, mwenendo wa wiki, na nani anapungua kabla ya siku ya renewal.
> Una gym Dar es Salaam? Andika PARTNER.

**English**
> Does your door know who walked in today? With FitFlex, members check in with a QR that refreshes every minute, and you see today’s visits, weekly trends and who is slipping before renewal day. Own a gym in Dar? Comment PARTNER.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PARTNER** → the owner replies to PARTNER comments and DMs himself while traffic is low (decided 2026-10-20): a short note on how FitFlex works for gyms plus the partner sign-up path.

## Hashtags

#gymowner #fitnessbusiness #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| Facebook | drafted | Same media and caption without hashtags on the FitFlex Africa Page (Page↔Instagram link at Meta still unconfirmed) |
| TikTok | not adapted | Candidate for a text-motion reel of the first four slides |
| LinkedIn | not adapted | Good fit as a document post, English lead; Company Page not confirmed |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Confirm the owner dashboard labels (slipping, at risk, stopped coming) in the current build
