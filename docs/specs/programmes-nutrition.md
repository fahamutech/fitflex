# Feature spec: Programmes and Local Nutrition

| | |
|---|---|
| Version | 0.4 (split from the combined spec v0.3, 18 Nov 2026) |
| Owner | Nassor (FitFlex Africa) |
| Status | Draft: owner decisions recorded in §8; the open items there block only the slices they affect |
| Branch model | Work PRs into `release-candidate`; never `main` (see `CLAUDE.md`) |
| Companion spec | [`whatsapp-onboarding.md`](whatsapp-onboarding.md): WhatsApp onboarding bot |

**Changes from v0.3**
- Split out of the combined spec `programmes-nutrition-whatsapp.md`; the WhatsApp onboarding bot now has its own spec. Requirement, risk, dependency and decision IDs are unchanged.
- Programmes and Nutrition no longer depend on the bot. WhatsApp reminders (FR-P10) use the Communications WhatsApp channel once it has a provider; push reminders work without it.

Earlier history (v0.1–v0.3) is in the git log of `docs/specs/programmes-nutrition-whatsapp.md`.

---

## 1. Overview

FitFlex adds two features that give members a reason to open the app between gym visits:

1. **FitFlex Programmes**: published, fixed-length day-by-day programmes built on the existing Training Plans engine.
2. **Local Nutrition**: meal logging against a Tanzanian food database that FitFlex owns.

A Platform Pass covers a fixed number of gym visits a month. On the days in between, a member has no reason to open the app, and those quiet days are when people churn. Programmes and Nutrition fill those days.

The ideas come from a review of [Open-Code-Crafters/FitFlex](https://github.com/Open-Code-Crafters/FitFlex) (MIT licence). Its ideas were adapted; no code or media was copied.

| Feature | Member problem | Business outcome |
|---|---|---|
| Programmes | "I don't know what to do on days I'm not at the gym" | More active days per member; new trainer income |
| Local Nutrition | Calorie apps don't know ugali, wali or maharage | Daily habit loop; a local food dataset competitors lack |

## 2. Fit with the current codebase

Read this before planning. Most of the Programmes foundation already exists.

| Area | What already exists (`fitflex-functions`) | What this spec adds |
|---|---|---|
| Exercise library | `src/shared/exercise-library.mjs`: bilingual (`i18n.sw`), target areas, equipment, environment, goals; admin via `exercise-admin-service.mjs` | Demo clip URL per exercise; a body-map grouping in the app |
| Plans | `services/training/training-plan-service.mjs` (recommended plans, one `Workout` per session); `trainer-plan-service.mjs` (trainer offers a plan to a client) | **Published catalogue programmes** that any member can enrol in, free or paid, with fixed length and day order |
| Progress | `shared/member-progress.mjs` streaks (EAT, UTC+3); workouts feed Activity, goals, challenges | A gym day of a programme is completed by a check-in |
| Check-in | `check-in-rules.mjs`, `check-in-service`, QR tokens (`qr-token` specs); gym QR promoted 16 Nov | Hook: check-in marks today's programme gym day done |
| Payments | AzamPay MNO checkout `POST /me/payments/:id/mobile-money`, webhook `/webhooks/azampay`; `AZAMPAY_TRAINER_PRODUCTS` | Programme purchase as a new payable product |
| Reminders | Push notifications; `whatsapp-channel-service.mjs` (Communications, consent, kill switch, **no provider yet**) | Programme reminders by push now, and by WhatsApp once the channel has a provider (see [`whatsapp-onboarding.md`](whatsapp-onboarding.md)) |
| Nutrition | Nothing (activity has `calories` burned only) | Everything in §5 |

## 3. Goals, non-goals and KPIs

The main goal is more app-active days per paying member, up to at least 22 days a month.

**Goals**
- Give members something useful to do in the app on days they don't visit the gym
- Build a Tanzanian food dataset that FitFlex owns
- Open a new income stream for trainers through programmes they write and sell

**Non-goals for v1**
- Medical diet plans for health conditions (general wellness guidance only)
- New wearable integrations beyond the existing device steps
- Video streaming infrastructure (short clips on a CDN)
- Kenya and Uganda food data (Tanzania first)

**KPIs.** Baselines come from current analytics. Targets are 90 days after launch. The owner asked for conservative targets (D-07), so v0.2's figures are kept for reference and the lower v0.3 figures are the starting targets. Both are ASSUMPTIONS, not facts. Admins can change the targets in the portal (FR-K01). The 400-food goal is a data-coverage goal, not a performance target, so it is unchanged. The WhatsApp funnel KPIs are in [`whatsapp-onboarding.md`](whatsapp-onboarding.md) §3.

| KPI | Baseline | v0.2 draft | Target (v0.3, ASSUMPTION) |
|---|---|---|---|
| App-active days per paying member, per month | To measure | +30% | +20% |
| Active Pass holders who start a programme | 0 | 35% | 25% |
| Programme day-7 completion rate | n/a | 50% | 40% |
| Members logging a meal at least 3 days a week | 0 | 20% | 12% |
| Foods in the Tanzanian database | 0 | 400 | 400 |
| Month-2 Pass renewal rate | To measure | +10 points | +5 points |

| ID | Requirement | Priority |
|---|---|---|
| FR-K01 | Admin portal screen to view and edit each KPI target (including the WhatsApp funnel KPIs); changes are logged with who and when. Built by whichever of the two specs ships first | Med |

## 4. Feature 1: FitFlex Programmes

A programme is a published, fixed-length plan, such as "21-day home strength" or a seasonal plan like "30-day Ramadhan-friendly cardio". It is followed one day at a time and mixes gym days, home days and rest days. FitFlex publishes free starter programmes. Verified trainers publish paid ones and earn their own revenue share (D-03).

**How a paid programme is sold (D-02).** Each paid programme can be:
- sold on its own to any member, through AzamPay;
- included free with the Pass tiers the author or admin chooses (for example `pro` and `premium` from `PASS_TIERS`); or
- both: included for the chosen tiers and sold to everyone else.

**Implementation note.** A programme day is an existing `Workout` definition. Enrolling creates the member's plan and workouts the same way `training-plan-service` does, so Activity, streaks, goals and challenges need nothing new.

**How it works**
1. A member picks a programme by goal (`FITNESS_GOAL_IDS`), level, length and environment (none / home / gym).
2. Each day shows its workout: exercises, sets/reps/time, rest timer, demo clip and Swahili/English cues.
3. Gym days are completed by a check-in at any partner gym that day.
4. Home days are completed by finishing the workout in the app. Streak and weekly ring update.
5. At the end, the member gets a summary, a share card and a suggested next programme.

**Requirements**

| ID | Requirement | Priority |
|---|---|---|
| FR-P01 | Programme catalogue with filters for goal, level, length and environment | High |
| FR-P02 | Day view: exercises, sets/reps/time, rest timer, demo clip | High |
| FR-P03 | A gym day is completed automatically by a valid check-in on the same local day (EAT) | High |
| FR-P04 | Streaks, weekly ring and an end-of-programme summary, built on `member-progress` | High |
| FR-P05 | Exercise library extended with clip URLs; body-map grouping in the app | High |
| FR-P06 | Trainer portal: build a programme from library exercises and saved workouts, set price, submit for review | Med |
| FR-P07 | Paid programmes can be bought individually through AzamPay, included with chosen Pass tiers, or both (D-02) | Med |
| FR-P08 | Trainer revenue share per paid enrolment, paid with trainer settlements. The programme split is its own setting, separate from `TRAINER_COMMISSION_PCT` for sessions (D-03); the value is still open (§8) | Med |
| FR-P09 | Day content downloadable for offline use | High |
| FR-P10 | Push and WhatsApp reminders at the member's chosen time, through Communications consent rules. WhatsApp reminders need the Communications WhatsApp channel to have a provider; until then, push only | Med |
| FR-P11 | Per programme: price, a "sold individually" switch and the list of Pass tiers it is included with; a member with an included tier enrols without paying | Med |
| FR-P12 | Optional season tag on a programme (any season or event, e.g. Ramadhan, new year), with an optional availability window; the catalogue can filter by it. No seasonal programme is required at launch (D-05) | Low |
| NFR-P01 | A day's clips under 15 MB in total; low-data mode serves stills | High |

**User stories**

| ID | Story | MoSCoW |
|---|---|---|
| US-01 | As a Basic Pass member, I want a home workout on days I don't go to the gym so I keep my streak. | Must |
| US-02 | As a member, I want my gym check-in to tick off the day so I don't log it twice. | Must |
| US-03 | As a trainer, I want to publish a paid programme so I earn beyond my gym sessions. | Should |
| US-04 | As a member on limited data, I want to download the week's workouts on Wi-Fi. | Must |
| US-05 | As a member, I want to share my finished programme so friends see my progress. | Could |

**Acceptance (US-02).** Given a member enrolled in a programme with a gym day today, when a check-in is accepted at any partner gym, then today's day is marked complete within 1 minute and the streak updates. A voided check-in reverses it.

## 5. Feature 2: Local Nutrition

Members log meals in local terms, such as "sahani ya wali na maharage" or "chapati 2, chai ya maziwa". They get calories and macros from a Tanzanian Food Database (TFD) that FitFlex owns. A global nutrition API covers only the foods TFD lacks, and is called server-side.

**Tanzanian Food Database**
- Seed list of about 400 foods and dishes: staples (ugali, wali, ndizi, viazi, mihogo), proteins (maharage, dagaa, samaki, nyama choma, mishkaki), street food (chipsi mayai, mandazi, chapati, sambusa), drinks (chai, juisi, soda)
- Each entry has Swahili and English names, aliases and local spellings, and **local portions** (sahani, kikombe, kipande, mwiko) in grams
- Values come from published East African food composition tables. A contracted nutritionist reviews mixed dishes.
- Shop products and partner menus can link to TFD entries

**Logging and suggestions**
1. Log by text, voice note or photo. AI splits the input into TFD items and portions; the member confirms before saving.
2. A daily view shows calories and macros against a target set from goal, height, weight and activity.
3. Weekly suggestions respect the member's goal, budget band, diet choice and stated allergies, using local meals and nearby options.

**Requirements**

| ID | Requirement | Priority |
|---|---|---|
| FR-N01 | TFD with bilingual names, aliases and local portion units; admin-editable | High |
| FR-N02 | Natural-language meal logging in Swahili and English, member confirms before saving | High |
| FR-N03 | Photo meal logging (AI estimate, member confirms) | Med |
| FR-N04 | Daily calorie and macro summary against a target | High |
| FR-N05 | Global nutrition API fallback, server-side only | Med |
| FR-N06 | Weekly meal suggestions within a stated budget band | Med |
| FR-N07 | Shop and partner meals linked to TFD | Low |
| FR-N08 | Members report wrong values into an admin review queue | Med |
| NFR-N01 | Guidance-only disclaimer; no medical diet plans | High |
| NFR-N02 | Health inputs (allergies, weight) are sensitive personal data under PDPA 2022: explicit consent, encrypted, deletable, covered by account deletion and anonymisation | High |

**User stories**

| ID | Story | MoSCoW |
|---|---|---|
| US-06 | As a member, I want to type "ugali na samaki" and get calories without searching a list. | Must |
| US-07 | As a member, I want portions in sahani or kipande, not grams. | Must |
| US-08 | As a member saving money, I want meal ideas I can afford at a local mama ntilie. | Should |
| US-09 | As an admin, I want to review flagged food values before they go live. | Should |

**Acceptance (US-06).** Given TFD has "ugali" and "samaki wa kukaanga", when a member enters "ugali na samaki", then both items show with default portions and total calories within 3 seconds, and portions can be changed before saving.

## 6. Architecture and data

Runs on the current stack: `fitflex-functions` (Node, Postgres via knex migrations in `db/migrations`, Firebase auth), `fitflex-portal` (Next.js), `fitflexmobile` (Flutter). Third-party keys stay in the backend secret store, never in the apps or the repo.

**New feature flags (all dormant by default)**

| Flag | Covers |
|---|---|
| `PROGRAMMES_CATALOGUE` | Catalogue, enrolment, check-in completion |
| `PROGRAMMES_PAID` | Trainer-authored paid programmes (needs `AZAMPAY_PAYMENTS`) |
| `NUTRITION_LOGGING` | TFD, meal logs, daily summary |

**Proposed tables** (final names follow existing conventions; planner to confirm)

| Table | Holds | Links |
|---|---|---|
| `programmes` | Title (en/sw), goal, level, length, environment, price, sold-individually switch, included Pass tiers, revenue split, season tag and window, author, status draft/review/live | trainers |
| `programme_days` | Day number, type gym/home/rest, workout definition | programmes |
| `programme_enrolments` | Member, programme, start date, current day, status | users, programmes, training plan |
| `programme_day_completions` | Day, source check-in/workout, timestamp | enrolments, check-ins, workouts |
| `foods` | TFD entry: names, aliases, nutrients per 100 g, source, verified | n/a |
| `food_portions` | Local unit and grams | foods |
| `meal_logs` | Member, time, raw input, items, totals | users, foods |
| `food_reports` | Flagged value, note, review status | foods |
| `kpi_targets` | KPI key, target value, changed by, changed at | users (admin) |

Exercise clip URLs are a field on existing exercise entries, not a new table.

**Backend pieces**
- Check-in hook: an accepted (non-voided) check-in completes today's programme gym day
- Meal parser: LLM call server-side, TFD lookup, global API fallback
- Programme purchase as an AzamPay payable product, approved through the same `adminPaymentService.decide` path

Changes to call out in PRs (per `CONTRIBUTING.md`): the check-in hook touches check-in logic; paid programmes touch pricing and trainer settlements.

## 7. Phasing and rollout

Free programmes come first. Nutrition follows once TFD is verified. Paid trainer programmes come last. This spec can run in parallel with, before or after the WhatsApp onboarding bot; the order is the owner's call (§8).

| Phase | Weeks | Scope | Gate to next phase |
|---|---|---|---|
| P1. Free programmes | Planner to estimate | Free catalogue programmes; clip URLs; check-in completes gym days | Check-in sync reliable |
| P2. Daily habit | Planner to estimate | Text meal logging (sw/en); TFD 400 verified; offline days and reminders | Food values verified; day-7 completion on track |
| P3. Trainer economy | Planner to estimate | Trainer portal paid programmes; revenue share in settlements; photo logging; meal suggestions | Owner decision |

Each phase follows the standard flow in `CLAUDE.md`: planner → design-agent → builders → reviewers → RC → UAT → owner go-ahead. P1 can pilot with any number of partner gyms (D-08); which gyms, and how many, are not confirmed yet.

## 8. Risks, dependencies and decisions

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | Wrong food values damage trust | Published composition tables, nutritionist review, verified badge, member reports |
| R-03 | Health data mishandled (PDPA 2022) | Consent, encryption, deletion and anonymisation, nothing shared with trainers without the member's sharing permission |
| R-04 | Low programme completion | 7- and 14-day starters, chosen-time reminders, gym check-ins count automatically |
| R-05 | Weak or unsafe trainer programmes | Review before publishing, verified trainers only, ratings |
| R-06 | Mobile data cost | Wi-Fi download, low-data stills, short clips |
| R-07 | AI meal parsing mislabels local dishes | Member always confirms; corrections kept for improvement |
| R-08 | A sandbox AzamPay payment unlocks a real paid programme | Keep `AZAMPAY_SANDBOX_SETTLES` on test servers only |

**Dependencies**
- DEP-02: AzamPay merchant KYC approved and production hosts issued; sandbox until then (paid programmes only)
- DEP-03: Contracted nutritionist and East African food composition data
- DEP-04: Partner trainers to film exercise clips
- DEP-05: Check-in events exposed to the programme hook

**Owner decisions (17 Nov 2026)** that apply to this spec. IDs match the combined v0.3 spec.

| ID | Question | Decision |
|---|---|---|
| D-02 | Paid programmes: included with higher Passes, sold separately, or both? | Both: any programme can be sold individually and/or included with higher Passes |
| D-03 | Trainer revenue share | Programmes have their own split, separate from the session commission |
| D-05 | Seasonal variants at launch | Any seasonal programme is allowed (not only Ramadhan); none is required at launch |
| D-07 | KPI targets | Keep, but more conservative, and editable in the portal |
| D-08 | Pilot gyms | Any number of gyms; not confirmed yet |

**Still open**
- [ ] Programme revenue split: the actual percentage, and whether it is one platform-wide value or set per trainer/programme (D-03)
- [ ] Conservative KPI targets in §3 are a proposal; confirm them or edit them in the portal once FR-K01 ships (D-07)
- [ ] Which gyms take part in the pilot (D-08)
- [ ] Order of the two specs: bot first, Programmes & Nutrition first, or both in parallel
