# 2026-11-W2-A-owners — "Your gym’s reviews are already being written. Just not where you can read them."

State: **scheduled** (owner approved 2026-10-29; in the Metricool planner). Planned slot Tue 2026-11-10 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v2). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Run a better gym (run_gym) |
| Audience | owner (Hassan (Independent Owner)) |
| Problem | A gym’s reputation is decided in WhatsApp groups and taxi rides where the owner cannot read it |
| Hook | Your gym’s reviews are already being written. Just not where you can read them. |
| Concept | v2 photo-scrim carousel, Swahili headline with English under: where reviews happen today, reviews in the app from members who trained there, what a member sees, read every review as the owner, reputation as data, PARTNER. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | en (ISO week 46; English caption first) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: reviews, badge, partnernotif, qr, mm |
| Planned slot | Tue 2026-11-10 17:00 Dar |

## Visual direction

Template v2: deep slate ground, Volt accent word, photo-scrim slides where the photo carries, list slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | photo | Reviews za gym yako tayari zinaandikwa. · Your gym’s reviews are already being written. Just not where you can read them. · Si mahali unapoweza kuzisoma. | pexels-5647574 |
| 2 | type | WhatsApp. Bajaji. Chumba cha kubadilishia. · WhatsApp groups, taxi rides, the changing room. That’s where members review you today. | none |
| 3 | type | Kwa FitFlex, waliofanya mazoezi kwako wanatoa review ndani ya app. · On FitFlex, members who trained at your gym review it in the app. | none |
| 4 | list | Mwanachama anaona hivi kabla ya kukuchagua. · Rows: Verified badge and tier, Member reviews, Check-in by QR, Pay by mobile money | none |
| 5 | photo | Anayefuata anasoma reviews zako kabla ya kukuchagua. · A bad one tells you what to fix this week. · The next member reads your reviews before choosing you. | pexels-8612491 |
| 6 | type | Unasoma kila review kama mmiliki. Unajulishwa inapoingia. · You read every review as the owner. You’re told when one lands. | none |
| 7 | type | Sifa ilikuwa bahati. Sasa ni data. · Reputation used to be luck. Now it’s data. | none |
| 8 | cta | Una gym Dar es Salaam? Andika · PARTNER | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W2-A-owners --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide with a photo (a manager texting on a phone); text: Reviews za gym yako tayari zinaandikwa. Si mahali unapoweza kuzisoma. Your gym’s reviews are already being written. Just not where you can read them. |
| 2 | Text slide; text: WhatsApp. Bajaji. Chumba cha kubadilishia. WhatsApp groups, taxi rides, the changing room. That’s where members review you today. |
| 3 | Text slide; text: Kwa FitFlex, waliofanya mazoezi kwako wanatoa review ndani ya app. On FitFlex, members who trained at your gym review it in the app. |
| 4 | Checklist slide; text: Mwanachama anaona hivi kabla ya kukuchagua.; Rows: Verified badge and tier (FitFlex), Member reviews (in app), Check-in by QR (60 s), Pay by mobile money (M-Pesa · Airtel) |
| 5 | Photo slide with a photo (a smiling man with crossed arms in a gym); text: Anayefuata anasoma reviews zako kabla ya kukuchagua. The next member reads your reviews before choosing you. A bad one tells you what to fix this week. |
| 6 | Text slide; text: Unasoma kila review kama mmiliki. Unajulishwa inapoingia. You read every review as the owner. You’re told when one lands. |
| 7 | Text slide; text: Sifa ilikuwa bahati. Sasa ni data. Reputation used to be luck. Now it’s data. |
| 8 | Call to action; text: Una gym Dar es Salaam? Andika; Keyword PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. · We’ll DM you how FitFlex works. |

## Caption

**Swahili**
> Reviews za gym yako tayari zinaandikwa, kwenye WhatsApp na kwenye bajaji. Kwa FitFlex, wanachama waliofanya mazoezi kwako wanatoa review ndani ya app, na wewe unasoma kila moja kama mmiliki.
> Una gym Dar? Andika PARTNER.

**English (lead)**
> Your gym’s reviews are already being written, in WhatsApp groups and taxi rides. On FitFlex, members who trained at your gym review it in the app, the next member reads them before choosing you, and you read every one as the owner. Own a gym in Dar? Comment PARTNER.

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

- [x] Brand review (social-brand-reviewer): revise → fixed → pass 2026-10-29
- [ ] Native Swahili review, or owner waiver
- [ ] Product claims verified against the current build
- [ ] Reply path for the keyword exists (owner replies by hand while traffic is low)
- [ ] Rating fix not checked end to end with a real review; confirm an owner sees and is notified of a new review in the current build
