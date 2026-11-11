# 2026-10-W3-A-owners — "Your members don't quit loudly."

State: **approved** (owner, 2026-10-16, apr_0007). Ready for Phase 3 scheduling on Instagram and Facebook. Record: `social/data/ideas.jsonl`.

| Field | Value |
|---|---|
| Pillar | Run a better gym |
| Audience | Gym owners (Hassan persona: silent churn, zero business visibility) |
| Problem | Members leave without a word; the owner only notices when the renewal does not come, and by then it is too late to act |
| Hook | Your members don't quit loudly. |
| Concept | 8-slide carousel on silent churn. Slides 1–3 name the problem (they stop coming; renewal day is too late). Slides 4–6 turn to FitFlex: engagement states, messaging members from the app, a challenge to bring them back. Slide 7 lands the lesson, slide 8 asks for PARTNER |
| Format | Carousel, 8 slides, 1080×1350; 4 dark (navy, green) and 4 light (cream, orange) grounds |
| Language lead | Swahili (week 3 is odd); slides stay English, caption bilingual |
| Inspiration | ins_2026-10-09_01 (operator-authority carousel: hook, lesson slides, ask), ins_2026-10-09_06 (community as the product). Structure only, no wording reused |
| Facts cited | Owners see engagement states active, slipping, at risk, lapsed and visit stats: `IMPLEMENTED_AS_OF_2026-10-11.md` (activity phases 6–8) [FACT]. Owners send campaigns in-app, push or SMS: same file, communications module [FACT]. Gyms create, publish and pause challenges: same file, §20 [FACT]. Gyms message their direct members only: `COMMUNICATION_IMPLEMENTATION_AUDIT.md` D1 [DECISION]. No numbers used |
| Planned slot | Monday, week 3 (month plan: owner carousel on community and retention) |

## Visual direction

Documentary gym photography in black-and-white or muted colour, owners and staff rather than posed athletes, one vector overlay only where it explains the product (slide 4). Owner role colour (amber) carries the highlights on dark slides; navy carries them on light slides. Instagram 1080×1350; a LinkedIn PDF variant would reuse the same 1080×1350 pages.

## Slides

| # | Theme | Text | Photo |
|---|---|---|---|
| 1 | navy | **Your members don't quit loudly.** | pexels-5878659 |
| 2 | cream | They just stop **coming.** No message. No goodbye. | pexels-7432872 |
| 3 | orange | By renewal day, they've **already left.** | pexels-12250460 |
| 4 | navy | See who's **slipping** before they're gone. Active. Slipping. At risk. **Lapsed.** (dashboard overlay) | pexels-34043570 |
| 5 | cream | Message them from the **app.** In-app, push or SMS. Your words, your members. | pexels-5592605 |
| 6 | green | Give them a reason to come back: a **challenge.** | pexels-29526371 |
| 7 | navy | Community keeps members. Data tells you **when** to act. | pexels-36510744 |
| 8 | orange | **Own a gym in Dar es Salaam?** Comment **PARTNER**. We'll DM you how FitFlex works. | pexels-6496099 |

Source: `source/slides.json`; render with `node social/tools/render-carousel.js social/content/2026-10-W3-A-owners --png`. Rendered 2026-10-16 with the `#1F7A3A` tokens.

## Image prompt

None. Licensed photos plus a vector overlay drawn in code; no AI-generated imagery.

## Accessibility

Headlines 84–112 px Inter 900, subheads 48 px Inter 700. Contrast: white on navy `#0B192C` and on green `#1F7A3A`, navy `#0B192C` on cream `#FFF6E5` and on orange `#FF9800`, all above 4.5:1 by token design. Highlight colour never carries meaning alone; the words do.

| # | Alt text |
|---|---|
| 1 | Gym owner in a dark gym; headline: Your members don't quit loudly |
| 2 | Empty gym floor; text: They just stop coming. No message, no goodbye |
| 3 | Gym reception; text: By renewal day they've already left |
| 4 | Two men in a gym with a dashboard card showing bars and ticks; text: See who's slipping before they're gone. Active, slipping, at risk, lapsed |
| 5 | Person using a phone in a gym; text: Message them from the app. In-app, push or SMS |
| 6 | Group training; text: Give them a reason to come back, a challenge |
| 7 | Gym at night; text: Community keeps members, data tells you when to act |
| 8 | Smiling woman with a speech bubble: Comment PARTNER. We'll DM you how FitFlex works |

## Caption

**Swahili (lead)**
> Wanachama hawaachi kwa kelele. Wanaacha kuja tu.
> FitFlex inakuonyesha nani anapungua kabla hajaondoka, na unaweza kumtumia ujumbe moja kwa moja kutoka kwenye app.
> Una gym Dar es Salaam? Andika **PARTNER** kwenye comments tukutumie maelezo.

**English**
> Members don't quit loudly. They just stop coming. FitFlex shows you who's slipping and lets you message them before they're gone. Own a gym in Dar? Comment PARTNER.

Swahili is a Claude draft; needs native review before publishing.

## CTA

Comment **PARTNER** → a DM explaining partnering plus the partner sign-up link or contact. Reply path: **manual reply by the owner** until the comment-to-DM module (Phase 5) exists. Where the DM should link is still an open decision.

## Hashtags

#gymowner #memberretention #daressalaam #tanzania #fitflexafrica

## Platform variants

| Platform | Status | Notes |
|---|---|---|
| Instagram | drafted | Carousel as above |
| LinkedIn | not adapted | Best second home for this piece: same 8 slides as a PDF document post, English caption; needs the Company Page confirmed |
| Facebook | drafted | Same 8 slides and caption on the FitFlex Africa Page (connected in Metricool 2026-10-16) |
| TikTok | not adapted | Would be a 20 s text-motion version of slides 1–4; no account recorded |

## Checks before approval

- [x] Brand review (social-brand-reviewer): pass, apr_0006 (revise apr_0005 fixed: slide 4 card no longer white)
- [x] Native Swahili review: owner chose to proceed without it for now (2026-10-16); caption still marked as a draft
- [ ] Confirm in the current build that owners see the slipping / at-risk / lapsed states and can send a campaign (slides 4–5)
- [ ] Slide 5 is true for the gym's direct members only (decision D1); the caption does not claim FitFlex Pass members can be messaged
- [ ] Decide where the PARTNER DM links
