# 2026-10-W5-A-owners — "Dar gym owners are watching the wrong numbers."

State: **scheduled** on Instagram for Tue 27 Oct 2026 17:00 Dar es Salaam (pub_0012; v3 render swapped into the planner 2026-10-20 after the owner's exact-version approval). Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Run a better gym |
| Audience | Gym owners (Hassan persona) |
| Problem | Owners measure sign-ups, enquiries and cash, and miss the shifts that show up in visits first |
| Objective | Owners comment PARTNER; FitFlex as the operator's tool |
| Hook | Dar gym owners are watching the wrong numbers. |
| Concept | Trends carousel in our own words: hook, eight shifts one per slide, PARTNER. Shifts 2 and 6 are assumptions and are worded as such (shift 6 as a question) |
| Format | Carousel, 10 slides, 1080×1350, template v3 bilingual (text-only: dark cover, 8 numbered shifts, 1 checklist, CTA) |
| Language lead | English (ISO week 44 is even); Swahili second |
| Inspiration | ins_2026-10-20_459ac6 (gsdgyms trends carousel: format only), ins_2026-10-09_01 (operator-authority structure). No wording or imagery reused |
| Facts cited | See `facts_cited` in the record: shifts 1, 3, 4, 5, 7, 8 rest on FitFlex_Platform_Business_Overview.md and the glossary [FACT]; shift 2 on the Hassan persona research [ASSUMPTION]; shift 6 is the gsdgyms claim written as a question [ASSUMPTION]. No statistics, prices, caps or payouts |
| Planned slot | Tuesday 27 October 2026, 17:00 Dar es Salaam |

## Visual direction

Type-first on deep slate with one Volt word per shift; a photo-scrim hook (owner-aged man training) and a photo-scrim slide 9 (traveller). Mono eyebrow "Run a better gym · nn/10". Fuel only on the "Cash only" row.

## Slides

Template v3 (rotation: ISO week 44 = type-first bilingual). Dark cover (the Thursday post carries the Volt cover). Swahili lead, English under. Previous v2 spec: `source/slides-v2.json`.

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | SW: Wamiliki wa gym Dar wanaangalia namba zisizo sahihi. — EN: Dar gym owners are watching the wrong numbers. | none |
| 2 | rule | SW: Ziara ndiyo namba, si usajili. — EN: A member who joined and stopped coming is a cancellation you haven't seen yet. | none |
| 3 | rule | SW: Je, daftari ndilo tatizo? — EN: If your gym runs on WhatsApp, a notebook and cash, nobody can see who's slipping. | none |
| 4 | check | SW: Wanachama tayari wanalipa kwa simu. — EN: Members already pay by phone. Cash only is the exception. Rows: M-Pesa, Airtel Money, Tigo Pesa, Pesa taslimu tu | none |
| 5 | rule | SW: Mlango wako wa mbele ni skrini ya simu. — EN: Find the gym, check in with a QR, book a trainer. If it's slow, they feel it before you do. | none |
| 6 | rule | SW: Hakuna anayesema kwaheri. — EN: Nobody says goodbye. The only early signal is fewer visits. | none |
| 7 | rule | SW: Je, wateja wako wangebaki kama gym ya bei nafuu ingefunguliwa jirani? — EN: If the honest answer is "the ones who feel at home", protect that. | none |
| 8 | rule | SW: Trainer anataka booking na malipo sehemu moja. — EN: Give them that and you give them a reason to stay. | none |
| 9 | rule | SW: Gym zilizo kwenye mtandao zinapata wateja wasiowatangazia. — EN: Travellers and multi-gym members choose from the network. | none |
| 10 | cta | SW: Una gym Dar es Salaam? Andika — EN: Own a gym in Dar es Salaam? Comment PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W5-A-owners --png`.

## Accessibility

Headlines 92–128 px Inter 900 on `#020617` or on the dark scrim; subheads 36 px; contrast above 4.5:1 by token design. Alt text per slide in `publish.json`.

## Caption

**English (lead)**
> Dar gym owners are watching the wrong numbers. Sign-ups, enquiries, cash in the drawer. Eight shifts are changing gyms right now, and most of them show up in your visits before they show up in your bank.
> Own a gym in Dar? Comment PARTNER.

**Swahili**
> Wamiliki wa gym Dar wanaangalia namba zisizo sahihi. Usajili, maulizo, pesa taslimu. Mabadiliko manane yanabadilisha gym sasa hivi, na mengi yanaonekana kwenye ziara kabla ya kuonekana benki.
> Una gym Dar? Andika PARTNER.

Swahili is a Claude draft; the owner chose to proceed without native review for now.

## CTA

Comment **PARTNER** → the owner replies by DM himself (decided 2026-10-20). The save ask was dropped after brand review (one ask per post); the owner may reinstate it as an accepted exception for this format.

## Hashtags

#gymowner #fitnessbusiness #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | 10-slide carousel (Instagram maximum) |
| Facebook | drafted, not activated | Same slides and caption; Page linkage at Meta still unconfirmed |
| LinkedIn | not adapted | Would suit this piece as a PDF document post; Company Page unconfirmed |
| TikTok | not adapted | |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass 2026-10-20 after one revise (shift 2 as a question, one CTA)
- [ ] Confirm in the current build: engagement states and visit trends on the owner dashboard (shifts 1, 5); QR check-in and trainer booking (shift 4); trainer in-app payment (shift 7)
- [x] Shifts 2 and 6 worded as questions after brand review (assumptions, not facts)
