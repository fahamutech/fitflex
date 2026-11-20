# Programmes P1 — screen and flow design

**Status:** Draft for owner review · **Date:** 2026-11-20 · **Author:** design-agent stage (main session)
**Builds on:** plan [`docs/plans/programmes-p1-plan.md`](../plans/programmes-p1-plan.md) (decisions PD-1..PD-11) and spec [`docs/specs/programmes-nutrition.md`](../specs/programmes-nutrition.md) §4.
**Design system:** `canon/04-marketing/design-system.md` (V2: Volt as the dark-theme primary accent, Fuel for streak heat, Calm canvas in the portal). No new colours or patterns.
**Repos affected:** `fitflexmobile` (member screens), `fitflex-portal` (admin screens). No app code here.
**Ships:** dormant behind `PROGRAMMES_CATALOGUE`. The portal authoring screens work while the flag is off (PD-7, plan §2 B1).

Sources read on 2026-11-20 from `origin/release-candidate`:
- mobile: `member_training_plan_page.dart` (`FFPageHeader`, `FFCard`, `FFSectionTitle`, `FFEmptyState`, `FFConfirmDialog`, `_DayTile`, keys `training.*`), `member_workout_page.dart`, `lib/shared/components/*` (`FFFilterChip`, `FFSheet`, `FFBadge`, `FFPill`, `FFStatTile`, `FFSkeleton`, `FFErrorState`, `FFRemoteImage`, `FFSegmented`), `lib/shared/i18n.dart`;
- portal: `app/admin/exercises/page.tsx`, `src/components/exercise-manager.tsx`.

## 1. Copy and Swahili rule
- **Every new string has an English value and a Swahili value.** The Swahili value is a marked placeholder, `"[SW] <English>"`, listed in §8 for the native reviewer. No machine translation, per governance rule 11.
- **Existing keys are reused where the meaning matches.** For example: goal, level and environment names from the training setup screen (`training.*`), and `training.restNote`. Their Swahili already exists.
- **Numbers and dates use the app's existing formatters.** Programme length reads "21 days" via a plural-aware key.

## 2. Member journey (app, Flutter web included)

```
Training (/member/training)
  ├─ [Programmes tile]  ──►  Catalogue  ──►  Programme detail  ──►  Start sheet  ──► (confirm replace?) ──►  Plan page (programme mode)
  │                                                                                                      └─ Day ► Workout page (rest timer, clips)
  └─ existing plan page / setup / offers (unchanged)
                                                                       last day done ──► Programme summary
```

### 2.1 Entry: Programmes tile (on `/member/training`)
- **Placement:** an `FFActionTile` above the "My plan" card, with the title "Programmes", the subtitle "Free day-by-day plans for home and gym" and a chevron.
- **Shown only when** `GET /programmes` succeeds. A `feature_disabled` 404 hides it, with no error shown. Any other error also hides it and the plan page works as today.
- **No plan:** if the member has no plan, the empty state (`training.noneTitle`) gains a second button, "Browse programmes" (`FFButtonVariant.secondary`), under "Create a plan".

### 2.2 Catalogue (`/member/training/programmes`)
- **Header:** `FFPageHeader` titled "Programmes".
- **Filters:** a horizontal row of `FFFilterChip`s.
  - Goal, Level, Length and Where: each opens an `FFSheet` with single-choice `FFChoiceTile`s.
  - Length options are 7 / 14 / 21 / 28+ days.
  - Where options are Gym / Home / Outdoor / Anywhere, using the existing environment names.
  - A selected chip shows its value. "Clear" appears when any filter is set.
- **Programme card** (`FFCard`, full width):
  - Title.
  - A meta line: "21 days · Beginner · Home".
  - A goal `FFPill`.
  - A day-mix strip: one small dot per day, coloured by type (gym = Volt, home = text-body, rest = border-hairline), at most 30 dots and then "+n". It must work in light theme too (gym dot = primary green on light grounds; Volt is never used on light).
  - "Free" `FFBadge`, kept so the same card works for paid programmes in P3.
- **States:**
  - Loading: 3 `FFSkeleton` cards.
  - Empty, no programmes live: `FFEmptyState` "No programmes yet" / "New programmes are on the way."
  - Empty after filters: "No programmes match" plus a "Clear filters" button.
  - Error: `FFErrorState` with retry.
- **Current programme:** if the member is on one, a slim banner at the top reads "You're on {title} · Day {n} of {N}" and links to the plan page.

### 2.3 Programme detail (`/member/training/programmes/:id`)
- **Header:** title, the meta line and the goal pill.
- **Summary:** paragraph, at most 400 characters.
- **Stat row:** 3 `FFStatTile`s for Gym days, Home days and Rest days.
- **"What you'll need":** equipment chips, or "No equipment" when equipment is `none`.
- **Day list:** grouped by week (`FFSectionTitle` "Week 1").
  - Each row: "Day 3", a type icon and label, and for gym and home days the workout name plus "~30 min".
  - Rest rows are muted and read "Rest".
  - A gym-day row with no suggested workout reads "Check in at any FitFlex gym".
- **Sticky bottom bar:** primary `FFButton` "Start programme".
- **Already on this programme:** the button becomes "Go to my programme".

### 2.4 Start sheet (`FFSheet`)
- **Title:** "When do you want to start?"
- **Start options:** `FFSegmented` with Today / Tomorrow / Pick a date. Pick a date opens the date picker, limited to today through today + 30.
- **Line under the options:** "Ends on {date}."
- **Primary button:** "Start".
- **Member already on another plan (PD-1):** pressing Start opens `FFConfirmDialog`:
  - Title: "Replace your current plan?"
  - Body: "You're on {current plan name}. Starting {programme} ends it. Workouts you've finished stay in your history."
  - If the current plan came from a trainer, the body adds: "This plan was made by {trainer}."
  - Buttons: "Replace plan" (primary) and "Keep my plan".
- **Success:** go to the plan page with snack "Programme started".
- **Errors:**
  - `start_in_past` / `start_too_far`: an inline message under the picker.
  - `programme_unavailable` (retired meanwhile): snack "This programme is no longer available" and back to the catalogue.

### 2.5 Plan page in programme mode (existing `MemberTrainingPlanPage`)
The same page; when `plan.programmeId` is set:
- **Header card:** the programme title, "Day {n} of {N}", and a progress bar of days done / days due so far.
  - Programme streak: consecutive gym and home days completed, with rest days not breaking it. The streak number uses the Fuel accent with a flame icon.
  - "Stop programme" replaces "Stop plan", using the same confirm dialog with programme wording.
- **Today card,** emphasised (`FFCard` with Volt border on dark, primary on light):
  - Home day: the workout name, "~30 min" and "Start workout", which opens the existing workout page.
  - Gym day, not done: "Gym day: check in at any FitFlex gym today." If there is a suggested workout, a secondary "See suggested workout" button.
  - Gym day, done by check-in: a check icon and "Done: checked in at {gym name}, {time}".
  - Rest day: "Rest day" plus `training.restNote`.
- **Day list:** day rows replace the week/weekday tiles for programme plans.
  - Statuses: done, today, upcoming, missed, rest.
  - Done rows show the source: "Workout" or "Check-in".
  - A completion that a void reversed shows as missed. There's no special message (keep it simple; voids are rare and staff-driven).
- **Refresh:** pull-to-refresh, plus a re-read when the app comes back to the foreground. This covers "within 1 minute" (US-02).

### 2.6 Workout page additions
- **Rest timer.** After a set is ticked, a bottom bar slides up.
  - It shows "Rest 0:45", counting down from the exercise's `restSeconds`, with "+15 s" and "Skip".
  - When the timer reaches 0, there is a haptic tap where supported, and the bar reads "Next set". No sound, which follows the app's existing silence.
  - Hidden when `restSeconds` is 0.
  - Accessibility: the timer value is a live region announced at 10 s and at 0, not every second.
- **Exercise media (PD-4).** The exercise card shows `stillUrl` via `FFRemoteImage` (16:9, rounded, lazy). If `clipUrl` is set, a "Watch clip" text button with a play icon opens the clip externally through `url_launcher`, after a one-time sheet:
  - Title: "Opens in your video player"
  - Body: "Clips use mobile data. Use Wi-Fi if you can."
  - Checkbox: "Don't show again"
  - With no still, nothing extra is shown and the card stays as it is today.
- **Body-area grouping (PD-8).** In the exercise alternatives sheet and the trainer picker, a group header per `TARGET_AREA_GROUPS` group. This is a list only.

### 2.7 Programme summary (after the last day, or when the end date passes)
- **Where:** a full page reached from the plan page. The plan page shows a "See your summary" card once the programme is `completed`.
- **Content:**
  - Title: "You finished {title}!", or "{title} has ended" if completion is under 50%.
  - Stat tiles: Days done X/N, Workouts, Gym check-ins, Best streak.
  - Primary button "Find your next programme", which opens the catalogue filtered to the same goal.
  - Secondary button "Back to training".
- **Share card:** not in P1 (US-05 "Could").

## 3. Admin journey (portal)

### 3.1 Programmes list (`/admin/programmes`, same nav group and scope as Exercises, PD-7)
- **Table columns:** Title, Goal, Level, Length, Where, Status (`draft` / `live` / `retired` badge), Enrolled (count), Updated.
- **Controls:** filter by status, and a "New programme" button.
- **Flag notice:** a Calm-canvas info alert when the member flag is off: "Members can't see programmes yet: the Programmes feature is off. You can still prepare them." The API returns that state.

### 3.2 Programme editor (`/admin/programmes/[id]`)
- **Details panel:**
  - English title and summary.
  - Swahili title and summary, labelled "Swahili (needs native review)". They may be empty while in draft; publishing needs both.
  - Goal, Level, Where and Equipment selects, all from the existing options endpoint.
  - Length in days (7–84).
- **Day grid:**
  - One cell per day, 7 per row, showing the day number and a type toggle (Gym / Home / Rest).
  - Clicking a Gym or Home day opens the workout editor drawer. It reuses the exercise picker and the sets/reps/rest fields from `exercise-manager.tsx`. For a gym day the drawer has the switch "Add a suggested workout (optional)" (PD-3).
  - "Copy day" and "Paste to…" let staff fill repeated weeks quickly.
- **Validation** is shown inline and in a summary at the top:
  - each Home day needs a workout;
  - at least one non-rest day;
  - no more than 3 rest days in a row (warning only);
  - Swahili fields are required to publish.
- **Actions:**
  - Save draft.
  - Publish, with the confirm "Publish {title}? Members will see it when Programmes is on."
  - Retire, with the confirm "Retire {title}? Members already on it can finish it; nobody new can start it."
  - Live programmes are edited by "Make a new version", which duplicates the programme as a draft. Members already enrolled are never changed under them.

### 3.3 Exercise manager additions
- **Fields:** "Image link (https)" and "Clip link (https)", each with a preview: the image is rendered, and the clip is a link that opens in a new tab.
- **Help text:** "Only add clips FitFlex has the right to use." This is because the clip licence is still open (PD-4).

## 4. States checklist (builders must cover)
| Screen | Loading | Empty | Error | Flag off | Offline |
|---|---|---|---|---|---|
| Programmes tile | none (hidden until loaded) | hidden | hidden | hidden | hidden |
| Catalogue | skeleton ×3 | two variants (§2.2) | `FFErrorState` + retry | n/a (no entry) | `FFErrorState` "You're offline" |
| Detail | skeleton | n/a | retry | 404 page "Not available" | as error |
| Start sheet | button spinner | n/a | inline + snack | snack + back | snack "No connection" |
| Plan page (programme) | existing spinner | n/a | existing `training.failed` | plan still shows (it's a normal plan); catalogue links hidden | existing behaviour |
| Summary | spinner | n/a | retry | still shown | as error |
| Portal list/editor | table skeleton | "No programmes yet" + New | alert + retry | info alert (§3.1) | n/a |

## 5. Accessibility
- **Touch targets:** at least 48×48 dp, including the dots strip, which is decorative and excluded from semantics. Its meaning is given in text by the stat row.
- **Status is never colour-only.** Gym, home and rest days have icon and label; done rows have a check icon and text.
- **Text scale:** layouts hold at 130% (app-wide cap). The day row wraps the workout name to 2 lines and then ellipsises.
- **Rest timer:** see §2.6. The "+15 s" and "Skip" buttons have full labels for screen readers.
- **Portal day grid:** keyboard operable (arrow keys move between days; Space cycles the type). Each cell's label reads like "Day 3, Home, Upper body 30 minutes".

## 6. Swahili length
Swahili runs about 20–35% longer. These are the tight spots, each to be checked with the placeholder strings padded by 35% in widget tests:
- the meta line (§2.2) wraps to 2 lines;
- chip labels ellipsise at 16 characters with the full value in the sheet;
- the rest bar's "Next set" button grows and keeps the timer visible.

## 7. Acceptance criteria (for UAT on Flutter web from RC, seed accounts, isolated DB)
| ID | Given / when / then |
|---|---|
| AC-P1-01 | With the flag off, the Programmes tile and "Browse programmes" button don't appear, and `/member/training/programmes` shows "Not available". |
| AC-P1-02 | With the flag on and two live programmes, the catalogue lists both; filtering Level = Beginner shows only beginner ones; Clear restores both. |
| AC-P1-03 | A draft or retired programme never appears in the catalogue. |
| AC-P1-04 | A member with no plan starts a 7-day programme today: the plan page shows Day 1 of 7, today's card matches day 1's type, and the history keeps finished workouts only. |
| AC-P1-05 | A member on a trainer's plan who starts a programme sees the replace dialog naming the trainer. "Keep my plan" changes nothing; "Replace plan" starts the programme. |
| AC-P1-06 | Home day: finishing the workout marks the day done ("Workout"), and the Activity appears in Recent activity as today. |
| AC-P1-07 | Gym day: a web check-in at a partner gym marks the day done ("Check-in", gym name) after pull-to-refresh, with no workout logged. A QR check-in is "needs a real device". |
| AC-P1-08 | An owner-recorded manual visit on a gym day also marks it done (PD-6). |
| AC-P1-09 | A check-in on a home or rest day changes nothing on the programme (PD-5). |
| AC-P1-10 | A staff void of that check-in turns the gym day back to missed (or today, if it's still today). |
| AC-P1-11 | Rest timer: ticking a set with 45 s rest shows the bar counting down; "+15 s" adds 15; "Skip" closes it. |
| AC-P1-12 | An exercise with a still and a clip shows the image; "Watch clip" shows the data sheet once, then opens the link outside the app. |
| AC-P1-13 | When the last day passes, "See your summary" appears and the summary numbers match the day list. |
| AC-P1-14 | Portal: staff with the exercise scope can create, publish and retire a programme; staff without it get 403 and no nav item. Publishing without Swahili fields is blocked with a clear message. |
| AC-P1-15 | Editing a live programme creates a new draft version; a member enrolled in the old version sees no change. |
| AC-P1-16 | Switching the app to Swahili shows `[SW]` placeholders (or existing Swahili) everywhere on these screens; no hardcoded English. |

## 8. New string keys (English; Swahili = `[SW]` placeholder pending native review)
Mobile (`programmes.*`):
- `title` "Programmes"
- `tileSubtitle` "Free day-by-day plans for home and gym"
- `browse` "Browse programmes"
- `emptyTitle` "No programmes yet"
- `emptyBody` "New programmes are on the way."
- `noMatch` "No programmes match"
- `clearFilters` "Clear filters"
- `filter.goal` "Goal"
- `filter.level` "Level"
- `filter.length` "Length"
- `filter.where` "Where"
- `days` "{n} days" (plural)
- `free` "Free"
- `onProgramme` "You're on {title} · Day {n} of {N}"
- `stat.gym` "Gym days"
- `stat.home` "Home days"
- `stat.rest` "Rest days"
- `needs` "What you'll need"
- `noEquipment` "No equipment"
- `day` "Day {n}"
- `type.gym` "Gym"
- `type.home` "Home"
- `type.rest` "Rest"
- `gymAnyGym` "Check in at any FitFlex gym"
- `start` "Start programme"
- `goToMine` "Go to my programme"
- `startWhen` "When do you want to start?"
- `today` "Today"
- `tomorrow` "Tomorrow"
- `pickDate` "Pick a date"
- `endsOn` "Ends on {date}."
- `replaceTitle` "Replace your current plan?"
- `replaceBody` "You're on {plan}. Starting {programme} ends it. Workouts you've finished stay in your history."
- `replaceTrainer` "This plan was made by {trainer}."
- `replace` "Replace plan"
- `keep` "Keep my plan"
- `started` "Programme started"
- `unavailable` "This programme is no longer available"
- `dayOf` "Day {n} of {N}"
- `streak` "{n}-day streak"
- `stop` "Stop programme"
- `gymToday` "Gym day: check in at any FitFlex gym today."
- `seeSuggested` "See suggested workout"
- `doneCheckin` "Done: checked in at {gym}, {time}"
- `source.workout` "Workout"
- `source.checkin` "Check-in"
- `seeSummary` "See your summary"
- `finished` "You finished {title}!"
- `ended` "{title} has ended"
- `sum.days` "Days done"
- `sum.workouts` "Workouts"
- `sum.checkins` "Gym check-ins"
- `sum.bestStreak` "Best streak"
- `findNext` "Find your next programme"
- `backToTraining` "Back to training"
- `notAvailable` "Not available"

Workout (`workout.*`):
- `rest` "Rest {time}"
- `addRest` "+15 s"
- `skipRest` "Skip"
- `nextSet` "Next set"
- `watchClip` "Watch clip"
- `clipTitle` "Opens in your video player"
- `clipBody` "Clips use mobile data. Use Wi-Fi if you can."
- `dontShow` "Don't show again"

Portal (`programmes.*` in `src/lib/i18n.ts`): every label, button, validation message and confirm in §3. The builder lists them in the PR, and each gets a `[SW]` placeholder.

## 9. Open design questions (non-blocking; defaults above apply)
- DQ-1: the day-mix dots strip on cards. If it reads as noise in design QA, drop it; the stat row on the detail page carries the same information.
- DQ-2: "28+" length bucket. Adjust once real programme lengths are known.
