# 2026-10-W5-B-owners — "Dar members don't come back for the machines."

State: **scheduled** on Instagram for Thu 29 Oct 2026 17:00 Dar es Salaam (pub_0014; owner approved 2026-10-20). Caption aligned to the slide wording 2026-10-20. Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Run a better gym |
| Audience | Gym owners (Hassan persona) |
| Problem | Owners invest in equipment and miss the five everyday things that decide whether a Dar member comes back |
| Objective | Owners comment PARTNER; FitFlex seen as the operator who scores the whole experience |
| Hook | Dar members don't come back for the machines. |
| Concept | Text-only, five rules adapted to Dar: the greeting, power cuts, the changing room, paying by mobile money, floor staff who correct form; then the FitFlex scoring tie-in; then PARTNER |
| Format | Carousel, 8 slides, 1080×1350, template v3 (bilingual, Swahili lead on slides; owner request 2026-10-20) |
| Language lead | Slides: Swahili lead, English under. Caption: English lead (ISO week 44 is even), Swahili second |
| Inspiration | ins_2026-10-20_fe6d2d (stewartmiller: numbered-rules text cards; format only, wording original). Note the comments on that post: lifters answered that equipment is all that matters; rule 7 answers that by naming equipment first in what FitFlex scores |
| Facts cited | Rubric weights equipment, amenities, facility, staffing: glossary [FACT] (named, no percentages shown); M-Pesa/Airtel Money and on-site scoring before joining: Business Overview [FACT]; rules 1–5 are operator advice in Tanzanian context [ASSUMPTION]; no statistics, prices, caps or payouts |
| Planned slot | Thursday 29 October 2026, 17:00 Dar es Salaam |

## Visual direction

Template v3: Volt-ground cover with the Swahili hook; rule slides with a large outlined numeral, Swahili headline, English under, a bilingual chip; a tick checklist for the FitFlex scoring slide; bilingual CTA. No photos. Mono eyebrow "Gym bora · run a better gym · n/8".

## Slides

Template v3 (2026-10-20, owner asked for more engaging design and Swahili on the slides): Volt-ground cover, outlined numerals, Swahili headline with English under, bilingual chips, a tick checklist, bilingual CTA. Previous specs: `source/slides-v2.json`.

| # | Kind | Text | Photo |
|---|---|---|---|
| 1 | cover | SW: Wateja wa gym hawarudi kwa ajili ya mashine. — EN: Dar members don't come back for the machines. | none |
| 2 | rule | SW: Karibu ni step ya kwanza. — EN: A greeting at the door. By name after week one. Nobody trains hard where they feel like a stranger. Chip: Mlangoni · at the door | none |
| 3 | rule | SW: Jiandae na umeme kukatika. — EN: A fan that works, water that runs, light when TANESCO lets you down. Members remember the gym that was ready. Chip: Umeme · power | none |
| 4 | rule | SW: Chumba cha kubadilishia ndiyo review. — EN: A clean floor, a hook for the bag, a mirror that isn't cracked. That is what they describe to a friend. Chip: Usafi · cleanliness | none |
| 5 | rule | SW: Waache walipe jinsi Dar inavyolipa. — EN: M-Pesa or Airtel Money at the desk, receipt on the phone. Not "come back tomorrow with cash". Chip: Malipo · payment | none |
| 6 | rule | SW: Trainer anayejua mazoezi. — EN: Without being asked, without selling a package. That is the staff members talk about. Chip: Wafanyakazi · staff | none |
| 7 | check | SW: FitFlex inakagua kila gym kabla haijajiunga. — EN: FitFlex scores every gym on all of this before it joins. Not just the weights. Rows: Vifaa, Huduma, Jengo, Wafanyakazi | none |
| 8 | cta | SW: Una gym Dar es Salaam? Andika — EN: Own a gym in Dar es Salaam? Comment PARTNER. Tutakutumia DM jinsi FitFlex inavyofanya kazi. | none |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W5-B-owners --png`.

## Accessibility

Headlines 80–132 px Inter 900 (cover 132 on Volt with on-volt text, rules 104, checklist 92, CTA lead-in 80 under the 210 px keyword); English subs 38 px; contrast above 4.5:1 by token design. Alt text per slide in `publish.json`.

## Caption

**English (lead)**
> Dar members don't come back for the machines. They come back for the greeting, the fan that works in a power cut, a changing room they'd describe to a friend, paying by M-Pesa, and someone on the floor who corrects their form. Five rules, no equipment needed.
> Own a gym in Dar? Comment PARTNER.

**Swahili**
> Wateja wa gym hawarudi kwa ajili ya mashine. Wanarudi kwa ajili ya karibu mlangoni, feni inayofanya kazi umeme ukikatika, chumba cha kubadilishia nguo wanachokisifia kwa rafiki, kulipa kwa M-Pesa, na trainer anayejua mazoezi. Kanuni tano, hazihitaji vifaa.
> Una gym Dar? Andika PARTNER.

Swahili is a Claude draft; the owner chose to proceed without native review for now. "TANESCO" (slide 3) is the national power utility; keep it, Dar readers know it.

## CTA

Comment **PARTNER** → the owner replies by DM himself (decided 2026-10-20). One ask.

## Hashtags

#gymowner #fitnessbusiness #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | 8-slide text carousel |
| Facebook | drafted, not activated | Same slides and caption; Page linkage at Meta still unconfirmed |
| LinkedIn | not adapted | Would suit as a document post |
| TikTok | not adapted | |

## Checks before approval

- [x] Brand review of the v3 bilingual build: pass 2026-10-20 (15 of 15); F06 reworded after the reviewer's note on 'uwanjani'
- [x] Owner read the Swahili and changed three lines 2026-10-20 (cover, rule 1, rule 5); the rest stand as drafts accepted by the owner
- [x] Owner 2026-10-20: Volt cover is fine, alternate with dark covers across posts (written into canon)
- [ ] Owner comfortable with the TANESCO mention and with "Not “come back tomorrow with cash”" as tone
- [ ] Confirm the vetting rubric still weighs amenities, facility and staffing (glossary) before claiming "scores every gym on all of this"
