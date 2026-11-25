# Programmes P1: Flutter web UAT, 24 Nov 2026

**What was tested:** release-candidate as of 24 Nov 2026: backend `6b86135`, app `76f6c1c`. The portal was not part of this run.

**Where:**
- Backend: run locally against an isolated database, `fitflex_ci_uat_programmes_1124` (localhost).
  - Settings: `PROGRAMMES_CATALOGUE=1`, Identity V2 with PIN sign-in, email codes faked.
  - No production service was used.
- App: a Flutter web release build, served locally and viewed at phone size (375×812).

**Accounts:** all were made by a local seed script.
- Two members, both with a direct plan at one test gym.
- One gym owner and one trainer.
- The three starter programmes from `docs/programmes-starter-drafts.json`, published.

**Acceptance criteria:** from `docs/design/programmes-p1.md` §7.

## Results

| AC | What | Result | Evidence |
|---|---|---|---|
| P1-01 | Flag off hides every way in | **PASS** | Backend restarted with the flag off; `GET /programmes` answers 404 `feature_disabled`. No Programmes tile, no "Browse programmes", and the catalogue link shows "Not available". Finished workouts stay in history. See D-5. |
| P1-02 | Catalogue lists live programmes; filter; Clear | **PASS** | All 3 listed, each with meta line, goal pill, day-mix dots and Free badge. Length = 14 leaves one; Clear restores all 3. All starters are Beginner, so I used the Length filter instead of Level. See D-4. |
| P1-03 | Draft and retired never listed | **PASS** | A draft and a published-then-retired programme were added through the admin API. Neither is listed; a direct link to the retired one shows "Not available". |
| P1-04 | Start a 7-day programme today | **PASS** | Start sheet: Today, "Ends on Mon 30 Nov 2026". Plan page: "Day 1 of 7", home-day Today card, "Programme started" snack. |
| P1-05 | Replace a trainer's plan | **PASS** | Dialog names the plan and the trainer ("This plan was made by Coach Amani (UAT)"). "Keep my plan" leaves the trainer plan active. "Replace plan" starts the programme. |
| P1-06 | Home day done by workout | **PASS** | Finishing Full body A marks Day 1 "Done · Workout" with a 1-day streak. It also appears in Recent activity as Tue 24 Nov. |
| P1-07 | Web check-in at a partner gym | NOT RUN | Needs the portal's browser check-in page with QR flags. Both use the same check-in hook as P1-08 (also covered by backend specs). A QR scan needs a real device. |
| P1-08 | Owner manual visit on a gym day | **PASS** (gym name missing) | `POST /owner/members/:id/checkin` stored a completion with source `checkin`. After the app re-read, the Today card showed "Done: checked in at 11:26" (correct EAT time) and Day 1 showed "Done · Check-in". The spec's gym name is not shown; this is the known `completedBy` gap. |
| P1-09 | Check-in on a home or rest day changes nothing | **PASS** | A manual visit for member 1 on a home day created no completion. |
| P1-10 | Staff void turns the day back | **PASS** | `POST /admin/checkins/:id/status` with `voided` set `reversedAt`. The app went back to Today, "0 of 1 done". |
| P1-11 | Rest timer | **PASS** | Squat rest set to 45 s. Ticking set 1 shows "Rest 0:43" counting down; "+15 s" takes 0:40 to 0:55; "Skip" closes the bar. The haptic at 0 needs a real device. |
| P1-12 | Still and clip | **PASS** (image host) | "Watch clip" shows the data note once ("Opens in your video player"). With "Don't show again" ticked, it opens the link directly in a new window. The still image did not load; see D-3. |
| P1-13 | Summary after the last day | **PASS** | Plan moved back 7 days in the test DB: 3 of 4 home workouts done, gym day missed. The summary shows Days done 3/5, Workouts 3, Gym check-ins 0, Best streak 2, all matching the day list. Title is "You finished…" (60%). "Find your next programme" opens the catalogue filtered to the same goal. |
| P1-14 | Portal authoring, scope and 403 | NOT RE-RUN | Covered by portal e2e (`programmes.spec.ts`, 6 tests, green on portal#242). |
| P1-15 | New version doesn't change enrolled members | **PASS** | Editing a live programme is refused (`not_a_draft`). Duplicate, edit and publish makes the new version live and retires the old. Member 2's plan still shows the old workout names. |
| P1-16 | Swahili placeholders, no hardcoded English | **PASS** | In Kiswahili, the training card, catalogue, filters, summary and buttons show `[SW-PENDING]` keys, and programme content shows `[SW]` values. No bare English on these screens. |
| PD-8 | Trainer picker grouped by body area | **PASS** | Trainer: New plan, then "Choose from the FitFlex library" shows group headers ("Upper body" …). |

**Score:** 14 of 16 acceptance criteria were run, and all 14 passed. The two I didn't run are P1-07 (web check-in) and P1-14 (portal, covered by e2e).

## Defects and findings (most severe first)

**D-1 (medium): opening the plan page doesn't re-read it.**
- After a check-in, going back into the plan page still shows the old state. It only refreshes on pull-to-refresh or app resume.
- On a phone this mostly works, because the member comes back to the app. On desktop web with a mouse there is no refresh at all: Flutter web ignores mouse drags, so pull-to-refresh can't be done.
- I confirmed that resume does refresh by firing window blur/focus.
- Fix idea: re-read once when the page opens if the plan is a programme, or add a refresh button on web.
- Code: `member_training_plan_page.dart:46-58`.

**D-2 (low): programme detail keeps old state when only the id in the link changes.**
- Going from one programme's detail to another's by link, or with back/forward, kept the first one's "Not available" state until a full reload.
- `MemberProgrammePage` has no `didUpdateWidget`.

**D-3 (hosting requirement, not an app bug): stills need CORS headers.**
- Flutter web loads images by fetch. The test image host (the pilot portal) sends no `Access-Control-Allow-Origin`, so the still showed the broken-image icon.
- The app handled this gracefully.
- Whoever hosts stills and clips (PD-4) must allow the app's web origin.

**D-4 (cosmetic): layout.**
- On a 375 px phone the catalogue's "Clear" chip is cut off at the right edge, though it still works.
- On the programme detail, the "Home days" label wraps to two lines and that stat tile sits higher than the other two.

**D-5 (low, edge): "See your summary" still shows with the flag off.**
- This affects members who finished a programme while the flag was on.
- It only matters if the flag is switched off after launch.
- "Find your next programme" then lands on "Not available".

**D-6 (minor): Activity card doesn't use the programme title.**
- The Activity tab's "My training plan" card shows "1-week plan" instead of the programme title.
- The design spec doesn't cover this card.

**Test-setup note:** the first replace-dialog attempt had no trainer line. My fixture had `createdByType` left as `fitflex`; after correcting it, the dialog was right. Not an app defect.

## Needs a real device

- QR check-in.
- The haptic when the rest timer reaches 0.
- Opening a clip in the phone's video player.
- Pull-to-refresh by touch.
- App resume from the background on Android and iOS.

## Recommendation

**Go for promotion, with the flag still off.**
- Nothing found blocks the flag, apart from the gates already listed:
  - clip hosting and licence (now including the CORS requirement in D-3);
  - trainer review of the starter programmes;
  - native Swahili review;
  - legal text pending counsel.
- I suggest fixing D-1 (and D-2, D-4 if cheap) before the flag goes on.

## Leftovers

- The UAT database `fitflex_ci_uat_programmes_1124` was left on local Postgres. It can be dropped.
- Worktrees were removed and the servers stopped.
