# 2026-11-W3-A-owners — "Ujumbe mmoja unamrudisha mwanachama. Ukitumwa kwa wakati."

State: **brand_checked** (brand review pass 2026-10-29). Planned slot Mon 2026-11-16 17:00 Africa/Dar_es_Salaam (every-other-day cadence; rotation week = v3). Record: `social/data/ideas.jsonl`. Nothing is scheduled until the owner writes an exact-version approval line.

| Field | Value |
|---|---|
| Pillar | Run a better gym (run_gym) |
| Audience | owner (Hassan (Independent Owner)) |
| Problem | Owners message members from a personal number, to everyone at once, usually too late |
| Hook | Ujumbe mmoja unamrudisha mwanachama. Ukitumwa kwa wakati. / One message brings a member back. If it’s sent in time. |
| Concept | Bilingual v3 carousel, Volt cover: the signal (slipping, at risk), send from the app not your number, pick the audience, renewal reminders go out on their own, results, a before-you-send checklist with the two-a-week cap, PARTNER. |
| Format | Carousel, 8 slides, 1080×1350 |
| Language lead | sw (ISO week 47; Swahili caption first; Swahili leads on every slide with English under) |
| Inspiration | ins_2026-10-29_membroz (Membroz review 2026-10-29: one outcome per post, message first, fixed template; structure only, no wording) |
| Facts cited | see `facts_cited` on the record; summarised: msg, renew, dash, engage |
| Planned slot | Mon 2026-11-16 17:00 Dar |

## Visual direction

Template v3: bilingual type-first slides, Volt cover, outlined numerals and chips, check slide, keyword CTA. 

## Slides

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | Ujumbe mmoja unamrudisha mwanachama. Ukitumwa kwa wakati. · One message brings a member back. If it’s sent in time. · Mawasiliano · communication | none |
| 2 | rule | Anayepungua anaonekana kabla hajaondoka. · Slipping, at risk, stopped coming: the app sorts your members before renewal day. | none |
| 3 | rule | Tuma kutoka kwenye app, si namba yako binafsi. · Send from the app, not your personal number: in-app, push or SMS, to your own members. | none |
| 4 | rule | Chagua nani apate ujumbe. · Pick the audience: everyone, the ones slipping, or the ones due to renew this week. | none |
| 5 | rule | Vikumbusho vya renewal vinajituma. · Renewal reminders go out on their own: three days before, one day before, on the day. | none |
| 6 | rule | Unaona nani alifungua na nani alirudi. · Results show deliveries, opens, taps and who renewed after the message. | none |
| 7 | check | Kabla ya kutuma, jiulize. · Before you send, ask. · Rows: Ujumbe mmoja, kazi moja, Jina lake, si “Ndugu”, Lugha anayoisoma, Si zaidi ya mbili kwa wiki | none |
| 8 | cta | Una gym Dar es Salaam? Andika · Own a gym in Dar es Salaam? Comment · PARTNER | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-11-W3-A-owners --png`.

## Accessibility

| # | Alt text |
|---|---|
| 1 | Cover slide on Volt green; Swahili: Ujumbe mmoja unamrudisha mwanachama. Ukitumwa kwa wakati.; English: One message brings a member back. If it’s sent in time. |
| 2 | Point 01 slide; Swahili: Anayepungua anaonekana kabla hajaondoka.; English: Slipping, at risk, stopped coming: the app sorts your members before renewal day. |
| 3 | Point 02 slide; Swahili: Tuma kutoka kwenye app, si namba yako binafsi.; English: Send from the app, not your personal number: in-app, push or SMS, to your own members. |
| 4 | Point 03 slide; Swahili: Chagua nani apate ujumbe.; English: Pick the audience: everyone, the ones slipping, or the ones due to renew this week. |
| 5 | Point 04 slide; Swahili: Vikumbusho vya renewal vinajituma.; English: Renewal reminders go out on their own: three days before, one day before, on the day. |
| 6 | Point 05 slide; Swahili: Unaona nani alifungua na nani alirudi.; English: Results show deliveries, opens, taps and who renewed after the message. |
| 7 | Checklist slide; Swahili: Kabla ya kutuma, jiulize.; English: Before you send, ask.; Rows: Ujumbe mmoja, kazi moja (one message, one job), Jina lake, si “Ndugu” (their name, not “Dear member”), Lugha anayoisoma (Swahili or English, whichever they read), Si zaidi ya mbili kwa wiki (two marketing sends a week at most) |
| 8 | Call to action; Swahili: Una gym Dar es Salaam? Andika; English: Own a gym in Dar es Salaam? Comment; Keyword PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. We’ll DM you how FitFlex works. |

## Caption

**Swahili (lead)**
> Ujumbe mmoja unamrudisha mwanachama, ukitumwa kwa wakati. FitFlex inakuonyesha nani anapungua, unatuma kutoka kwenye app (si namba yako binafsi), vikumbusho vya renewal vinajituma, na unaona nani alifungua na nani alirudi.
> Una gym Dar es Salaam? Andika PARTNER.

**English**
> One message brings a member back, if it’s sent in time. FitFlex shows you who is slipping, you send from the app (not your personal number), renewal reminders go out on their own, and you see who opened and who came back. Own a gym in Dar? Comment PARTNER.

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
- [ ] Confirm the audience options in the composer (slipping, due to renew) match the current build wording
- [ ] Push is Android only and not yet tested on a real phone; the slide says push without a platform
