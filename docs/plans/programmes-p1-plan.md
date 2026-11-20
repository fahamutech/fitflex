# Plan: Programmes Phase P1 (free programmes)

Spec: [`docs/specs/programmes-nutrition.md`](../specs/programmes-nutrition.md) §4, §6 and §7 (P1). Order decision D-09: this spec ships first.
Status: **approved by the owner, 20 Nov 2026.** No code has been written yet.

> **Owner decisions 20 Nov 2026: every recommendation in §6 accepted.** The questions are now decisions PD-1..PD-11 (same numbers as Q-1..Q-11):
> - PD-1: enrolling replaces the current plan after a clear confirm.
> - PD-2: every signed-in member can see and start free programmes.
> - PD-3: a gym day may carry an optional suggested workout; the check-in alone completes it.
> - PD-4: P1 shows the still inline and "watch clip" opens the phone's player (`url_launcher`); no `video_player` dependency. Still open: where clips are hosted and the clip licence. Until then admins can only enter `https` links; the field stays empty in production content.
> - PD-5: check-ins on home or rest days are ignored.
> - PD-6: owner-recorded manual visits complete a gym day too.
> - PD-7: programme authoring uses the same portal scope as the exercise library.
> - PD-8: body areas shown as a grouped list; no illustrated body map in P1.
> - PD-9: FR-K01 is built at the end of P1.
> - PD-10: a partner trainer writes the starter programmes; I draft 2–3 for their review (with B1, as an import file, not live).
> - PD-11: pilot gyms are still to be named; needed only before rollout.

P1 scope from the spec: free catalogue programmes, exercise clip URLs, and a check-in completes gym days. Gate to P2: "check-in sync reliable".

Out of P1 (per §7 of the spec): offline days and reminders (P2), all nutrition (P2), paid and trainer-authored programmes (P3).

## 0. What I found that shapes the plan

All of these were read on each repo's `release-candidate` today (functions `0f9635a`, portal `b37cc28`, mobile `1f4392b`).

1. **A member's plan already does most of the enrolment work.** `TrainingPlan` holds a jsonb outline (`weeks[].days[]`). Each training day is an ordinary `Workout` row, `newWorkoutRow({ trainingPlanId, source })`. Finishing one creates the Activity, so goals, streaks and challenges already work (`training-plan-service.mjs`). The trainer-offer flow, `accept()`, already turns a stored template into a member's workouts and replaces the active plan. Enrolling in a programme is the same move.
2. **A member has one active plan at a time.** `generate()` returns `409 active_plan_exists` unless `replace: true` is sent; `accept()` cancels the current plan. Enrolling in a programme has to follow the same rule (Q-1).
3. **Plans today only list training days, scheduled by weekday.** A programme is day-by-day (Day 1..N, consecutive dates) with gym, home and rest days. `view()` currently shows a day with no workout as `removed`. It has to learn the new day types.
4. **Plan length is in whole weeks (1–12).** `durationWeeks` is an integer, `MAX_PLAN_WEEKS = 12`. A 21-day programme fits as 3 weeks with `endDate = start + lengthDays - 1`, but `lengthDays` has to be stored too.
5. **Check-ins already have hook points.** `createCheckInService({ onCheckin })` covers QR, web and B2B visits, and is called after the row is saved and can never fail the visit. `createCheckinStatusService({ onVoided })` runs when a visit is voided. **However, owner-recorded manual visits (`member-management-service.mjs` ~l.569) insert the row directly and fire no hook.** P1 has to add the hook there too, which touches check-in logic and must be called out in the PR (Q-6).
6. **A check-in already carries the EAT local day** (`businessDate`), so "same local day" (FR-P03) needs no new date logic.
7. **Exercises have no media fields.** There is no clip or still on the built-in library (`exercise-library.mjs`), the admin overlay table `TrainingExercise`, or the admin `FIELDS` list (`exercise-admin-service.mjs`). The video licence question from the exercise-admin work is still unanswered.
8. **The app has no video player and no rest timer.** `pubspec.yaml` has `url_launcher` and `share_plus` but no `video_player`. `member_workout_page.dart` has a session clock but never uses `restSeconds`, so FR-P02's rest timer is new work.
9. **Environments in the code are `gym`, `home`, `outdoor`, `any`** (`training-taxonomy.mjs`). The spec says "none / home / gym". I'll use the existing taxonomy and treat "none" as `equipment: ['none']`, not a new environment.
10. **The portal has an exercise admin** (`app/admin/exercises`, `src/components/exercise-manager.tsx`, e2e `tests/e2e/exercises.spec.ts`) that P1 can extend. The portal has no programme screen.
11. **Feature flags follow one pattern:** a function in `src/shared/feature-flags.mjs`, off unless the env var is set, and routes answer `404 feature_disabled` while off.

## 1. Proposed data model (planner to confirm, per spec §6)

The spec proposes four programme tables. Because of finding 1, I propose fewer, reusing `TrainingPlan` as the enrolment:

| Spec table | Proposal | Why |
|---|---|---|
| `programmes` + `programme_days` | **`Programme`** table; days kept as a jsonb `days` array, `[{ day, type: gym\|home\|rest, workout? }]`, with each workout checked by `validateWorkoutDefinition` | Same shape as `TrainingPlan.weeks`; a programme is edited and published as one unit |
| `programme_enrolments` | **`TrainingPlan.programmeId`** (new column) + `lengthDays`; `createdByType: 'fitflex'` | An enrolment *is* the member's plan; Activity, streaks and history keep working |
| `programme_day_completions` | **`ProgrammeDayCompletion`**: `planId`, `date`, `source` (`checkin` \| `workout`), `checkinId`, `completedAt`, `reversedAt` | Records a gym day done by a check-in without inventing an Activity; a void sets `reversedAt` |
| exercise clip URLs | `clipUrl`, `stillUrl` columns on `TrainingExercise`, plus the same fields allowed on the built-in library entries through the overlay | As the spec says: a field, not a table |

`Programme` columns:
- `id`, `slug`, `title` (en), `i18n.sw` (title and summary)
- `summary`, `goal` (`FITNESS_GOAL_IDS`), `level` (`EXPERIENCE_LEVELS`), `environment` (`ENVIRONMENTS`), `equipment`
- `lengthDays` (7–84), `days` (jsonb)
- `status` (`draft` \| `live` \| `retired`), `createdBy`, `updatedBy`, timestamps
- **Columns for P3 are not added now** (price, sold-individually switch, included tiers, revenue split, season tag, author trainer). A P3 migration adds them; P1 programmes are free by definition.

## 2. Slices

Each slice is its own branch and PR into `release-candidate`, merged in this order. **Stop after each slice for review.** Everything is dormant behind `PROGRAMMES_CATALOGUE`.

### Backend (`fitflex-functions`)

**B1. Schema, flag and admin authoring**
- Migration: `Programme`, `ProgrammeDayCompletion`, `TrainingPlan.programmeId` + `lengthDays`, `TrainingExercise.clipUrl` + `stillUrl`.
- `programmesCatalogueOn()` in `feature-flags.mjs`.
- `programme-service.mjs` (admin side). Endpoints:
  - `GET /admin/programmes`, `POST /admin/programmes`, `PUT /admin/programmes/:id`
  - `POST /admin/programmes/:id/publish` and `/retire`
  - Admin scope: same as exercises (Q-7).
  - Admin authoring works while the flag is off, so content can be ready before launch.
- Admin list returns an `enrolled` count per programme and the member flag state (`catalogueOn`) so the portal can show its notice (design §3.1). Live programmes are not edited in place: `POST /admin/programmes/:id/duplicate` makes a new draft version (design §3.2). Enrolment copies the days into the member's workouts, so members are never changed under them.
- Validation: day count = `lengthDays`; publishing needs the Swahili title and summary (placeholders allowed, marked for native review); gym and home days need a valid workout definition (a gym day's workout is an optional suggested routine, Q-3); rest days have none; only `live` is shown to members; a `live` programme with enrolments can be retired, not deleted.
- Exercise admin: accept `clipUrl` and `stillUrl` (https only; allowed hosts per Q-4) and return them from `/training/exercises`.
- Specs: validation, publish/retire, scope check, flag-off behaviour of member routes.

**B2. Member catalogue and enrolment**
- Endpoints:
  - `GET /programmes?goal=&level=&lengthDays=&environment=` lists `live` programmes only
  - `GET /programmes/:id`
  - `POST /programmes/:id/enrol { startDate?, replace? }`
  - All three answer 404 `feature_disabled` while the flag is off.
- Enrolment copies `accept()`'s approach:
  - It creates a `TrainingPlan` (`programmeId`, `createdByType: 'fitflex'`, `source: 'programme'` on each `Workout`), with consecutive dates from `startDate`.
  - It returns `409 active_plan_exists` unless `replace: true` (Q-1).
  - Start date rules are the same as `generate()`: no start in the past, at most 30 days ahead.
  - A retired or draft programme answers `409 programme_unavailable`.
- `view()` learns day `type`:
  - Rest days are shown, never "missed".
  - Gym days are `completed` when there is a live `ProgrammeDayCompletion` **or** their suggested workout is completed.
  - Progress, today/next and end-of-programme summary data (FR-P04) are worked out here.
- Who may enrol (Q-2).
- Specs: enrol, replace, start-date rules, view with mixed day types, flag off.

**B3. Check-in completes the gym day (FR-P03, US-02). Touches check-in logic, so it gets the CONTRIBUTING.md call-out.**
- `programmeCheckinHook(checkin)` is attached to:
  - `onCheckin` in `bootstrap/services.mjs`, alongside the partner notifier and security handler in the same `Promise.allSettled`;
  - the owner manual-visit path in `member-management-service.mjs` (Q-6).
- What the hook does:
  - It finds the member's active programme plan and today's gym day (`checkin.businessDate`).
  - It inserts a `ProgrammeDayCompletion`, idempotent on (`planId`, `date`).
  - It never throws into the check-in, and does nothing while the flag is off.
- `onVoided`: sets `reversedAt` on the completion for that `checkinId`, unless another live check-in that day still covers it.
- Any partner gym counts (spec); a check-in on a non-gym day does nothing (Q-5).
- Specs: QR, web, B2B and owner-manual visits each complete the day; a void reverses it; a second visit is idempotent; another day or no active programme is a no-op; the flag being off is a no-op; a hook failure never fails the check-in.
- Acceptance "within 1 minute": the hook runs in-process right after the insert, so it is effectively immediate. The mobile plan screen re-reads on open and on pull-to-refresh.

### Portal (`fitflex-portal`)

**PO1. Programme authoring + clip fields** (after B1)
- `app/admin/programmes`:
  - list with status, plus create and edit;
  - day grid of type per day;
  - workout editor per gym or home day, reusing the exercise picker from `exercise-manager.tsx`;
  - Swahili title and summary fields, marked "pending native review", not machine-translated;
  - publish and retire actions.
- Exercise manager: `clipUrl` and `stillUrl` inputs with a preview.
- e2e: create, publish and retire a programme; save a clip URL. No portal build flag is needed, because authoring is not flag-gated (finding 11; avoids touching the deploy workflow).
- All strings go through the portal's en/sw dictionaries.

### Mobile (`fitflexmobile`)

**M1. Catalogue, detail and enrol** (after B2)
- Entry:
  - a "Programmes" tile on the member training area (`/member/training`);
  - hidden when `GET /programmes` answers `feature_disabled`.
- Catalogue: filter by goal, level, length and environment, as chips.
- Detail: summary, day list, start-date picker, and an enrol button that confirms before replacing a current plan.
- Repository methods in `training_repository.dart` (API and local fake for tests).

**M2. Day view, rest timer, clips, summary** (after M1 and B3)
- The plan page shows gym, home and rest days. A gym day reads "Done by check-in at {gym}" when completed that way.
- Workout page: a rest timer between sets using `restSeconds`.
- Exercise clip: the still is shown inline; play per Q-4.
- Exercise list grouped by body area using `TARGET_AREA_GROUPS` (FR-P05 "body-map grouping"; an illustrated body map is a design question, Q-8).
- End-of-programme summary (FR-P04); the share card is a "Could" (US-05) and is left to P2 unless you want it now.
- Widget tests for each.

### FR-K01 (KPI targets editor)
- The spec now places FR-K01 with this spec (D-09), but not in a particular phase.
- I propose a small separate slice pair after M2: `KpiTarget` table + `GET/PUT /admin/kpi-targets` (audit-logged) + a portal screen, seeded with the §3 conservative targets marked ASSUMPTION.
- It is not needed for the P1 gate, so it can move to P2 (Q-9).

## 3. Contract summary (new endpoints)

| Endpoint | Who | Flag-off behaviour |
|---|---|---|
| `GET/POST /admin/programmes`, `PUT /admin/programmes/:id`, `POST …/publish`, `POST …/retire` | admin (scope per Q-7) | works (authoring) |
| `GET /programmes`, `GET /programmes/:id` | signed-in member | 404 `feature_disabled` |
| `POST /programmes/:id/enrol` | signed-in member | 404 `feature_disabled` |
| `GET /me/training-plans/current` and `/:id` (existing) | member | unchanged shape plus `programmeId`, `lengthDays`, `days[].type`, `days[].completedBy` (additive) |
| `GET /training/exercises` (existing) | signed-in | additive `clipUrl`, `stillUrl` |

**Deploy order:** functions, then portal, then mobile. All changes are additive, so an older app keeps working against a newer server.

## 4. Call-outs for PRs (CONTRIBUTING.md)
- **Check-in logic:** the B3 hook, including the owner manual-visit path.
- **Endpoint signatures:** additive fields on the training-plan view and exercises.
- **No pricing, payout engine or `src/auth/*` changes in P1.**

## 5. Risks and checks
- **Hook failure:** a hook that throws must not fail a check-in. This is covered by `allSettled` and a spec.
- **Void timing:** a void after the day has passed still reverses the completion. The day then shows as missed.
- **Plan replacement:** enrolling cancels a trainer's plan if the member confirms. Trainers are not notified today when a member's plan is replaced by `generate()`; I'll keep that behaviour unless you say otherwise.
- **Data cost (NFR-P01):** under 15 MB a day. The still is shown by default and clips play only on tap. Full offline and low-data mode are P2.
- **Reviews:** contract-checker, i18n-swahili-auditor and security-and-privacy-reviewer (check-in path, admin scope) before release; then UAT on Flutter web from RC with seed accounts. Check-in by QR camera needs a real device; the web check-in path can be tested on web.

## 6. Questions for the owner (blocking marked ★)

| ID | Question | My recommendation |
|---|---|---|
| ★ Q-1 | Enrolling while on another plan (recommended or from a trainer): replace it after a confirm, or refuse? | Replace after a clear confirm, same as today's plan rules |
| ★ Q-2 | Who can see and start free programmes: every signed-in member, or only members with an active Pass? | Every member (helps conversion); the KPI still counts Pass holders |
| Q-3 | A gym day: just "check in at any gym", or also a suggested gym workout the member can follow? | Optional suggested workout; the check-in alone completes the day |
| ★ Q-4 | Clips: where are they hosted, and may the app play them in-app? In-app playback needs the `video_player` package (a new dependency). The alternative is opening the clip in the phone's player via `url_launcher` (no new dependency). The clip licence question from the exercise library is still open | P1: still image inline + "watch clip" opens externally; add `video_player` later if you approve |
| Q-5 | A check-in on a home or rest day: ignore it, or complete that day? | Ignore; only gym days are completed by check-in |
| Q-6 | Should owner-recorded manual visits also complete a gym day? | Yes: a real visit is a visit |
| Q-7 | Which portal staff may author programmes: same scope as the exercise library, or a new scope? | Same as the exercise library |
| Q-8 | Body map: a grouped list by body area (exists today), or an illustrated body map (design work)? | Grouped list in P1 |
| Q-9 | FR-K01 KPI editor: build at the end of P1 or in P2? | End of P1, small |
| ★ Q-10 | Starter programme content: who writes the first free programmes (titles, days, exercises)? I won't invent them. If you want, I can draft 2–3 for a trainer to review | A partner trainer writes them; I can draft for review |
| Q-11 | Pilot gyms for P1 (D-08) | Needed before rollout only |

## 7. Next steps after approval
1. Design stage: done as [`docs/design/programmes-p1.md`](../design/programmes-p1.md) (draft for owner review).
2. Then B1 → B2 → B3 → PO1 → M1 → M2 (FR-K01 per Q-9), each as a PR into `release-candidate`, stopping after each.
