# Events S6: runs, results, medals and rewards. Design spec

**Status:** Owner decisions D44 to D62 accepted 2026-10-29 (all recommended defaults, except D54 which changed to organizer-uploaded medal artwork, §7.7) · **Date:** 2026-10-29 · **Author:** design-agent
**Module:** Marathon & Running Events, Slice 6 of `docs/marathon/reuse-map.md` §9 (PRD §16 Phase 6)
**Repos:** `fitflex-functions` (results, run links, award engine, ledger, API and webhooks; §4 to §8), `fitflex-portal` (organizer Results tab, medal templates, admin reward desk; §9), `fitflexmobile` (event run, my result, public results, medals and rewards wallet; §10)
**Ships:** dormant behind five new server flags: `EVENTS_RESULTS`, `EVENTS_RUNS`, `EVENTS_RESULTS_PUBLIC`, `EVENTS_REWARDS`, `EVENTS_MEDAL_ART` (all need `EVENTS_MODULE` and `EVENTS_REGISTRATION`; see §13.1). With all five off, S5 behaviour is unchanged.
**Binding inputs:** `docs/marathon/decisions.md` D1 to D43 and D44 to D62 as accepted (D4 whole TZS, D5 error envelope and `/v1/organizer` for API-key callers only, D8 CSV first then API submission, D9 FitFlex-funded digital-only rewards at launch, D35 owner reviews rule 6 areas, D36 organizers never receive participant phone or email, D38/D42 webhook management owner only, D40 bib unique across the event, D43 launch gates); PRD §5.7 RUN-001..010, §5.8 RWD-001..012, §5.9 COM-002/003/005, §8, §9 (result status), §10 (privacy, running safety), §12 Epic G, §13; `docs/marathon/reuse-map.md` §1.1 (Activities, run validation, challenges, rewards), §5.1 (S1 tables), G7 to G10; `docs/marathon/follow-ups.md` (S6 section, privacy and retention item, S5 carried items); `s3-asbuilt.md`, `s4-asbuilt.md`, `s5-asbuilt.md`; the S5 spec for format, webhook envelope, idempotency and API credential scheme.

**Rule 6 and the owner.** CLAUDE.md rule 6 applies. This slice: (a) widens the API scope list in `src/auth/organizer-api-auth.mjs` (`results:write` activates, `results:read` is new); (b) adds a reward ledger and redemption (value-bearing, but FitFlex-funded digital only at launch, no TZS moves); (c) adds a step to account deletion (`DELETE /me`); (d) changes existing response shapes additively (`GET /events/options`, `GET /me/event-registrations/:id`, event detail). It does **not** touch payment code, the payout engine, pricing constants, check-in or `src/auth/jwt.mjs`. §13.4 lists every file. Per D35 the owner reviews §8.4 (API scopes) and §7.6 (ledger, redemption and deletion path) before anything reaches `main`.

**Not in scope:** timing-chip hardware integration (D8: CSV and API only); splits, checkpoints and route maps for organizers (RUN-010, P1); age-group and gender rankings (need gender and age data on a public board, see D61); sponsor-funded and partner-issued rewards and a partner redemption console (RWD-011, P1, D9); cash prizes (FitFlex moves no prize money; organizers settle prizes themselves); medal artwork beyond one image per medal (animation, 3D, SVG, video); offline result entry (S7); Strava, Garmin or Apple Health imports as event evidence; organizer settlement statements (still not built); payment-provider work (D34).

Sources read (RC heads of 2026-10-29, read-only via `git show`/`git grep`, no branch switched in the shared checkouts): functions `db/migrations/20270110090400-events-tickets-ops.cjs`, `…090500-events-rewards.cjs`, `…090100-events-core.cjs`, `…090200-events-orders.cjs`, `…090900-events-registration-fields.cjs`, `…20270126090000-events-ops-s5.cjs`, `src/shared/events-lifecycle.mjs`, `src/shared/events-config.mjs`, `src/shared/feature-flags.mjs`, `src/services/activity-service.mjs` (`recordRun`), `src/services/challenge-reward-service.mjs`, `src/services/events-sync-service.mjs`, `src/shared/events-participants.mjs`, `functions/subscriptions.mjs` (`DELETE /me`), `functions/challenge-rewards.mjs`, `functions/events-*.mjs` route lists; mobile `lib/router.dart`, `lib/shared/activity/run_recorder.dart`, `lib/screens/member/member_record_run_page.dart`, `lib/shared/events/*`, `lib/screens/member/events/*`; portal `src/components/organizer/event-views.tsx` and the file list under `app/organizer`.

Conventions: **EN** English copy, **SW** Swahili draft (every Swahili string needs native review; Swahili runs 20 to 30 % longer, so no layout may depend on English widths). "Backend field" lines list data the UI needs so `fitflex-planner` and `contract-checker` can confirm it; nothing is claimed to exist unless it says "exists". Money is integer whole TZS (D4).

---

## 1. What exists today, what this reuses, what is new

| Need | Exists (evidence) | Reuse / gap |
|---|---|---|
| Result table | `EventResult` (S1): `sourceType` (`timing_provider`, `organizer_verified`, `fitflex_gps`, `manual_unverified`), `sourceReference`, `distanceMeters`, `elapsedMs`, `finishStatus` (`finished`, `dnf`, `dns`, `dq`), `overallRank`, `categoryRank`, `verificationStatus` (`pending_verification`, `verified`, `rejected`, `corrected`, `disqualified`), `verifiedBy/At`, `correctionReason`, `revision`, `isCurrent`; unique `(registrationId, revision)`, partial unique one current row per registration; CHECK verified/corrected need `verifiedBy` and `verifiedAt`; `finished` needs `elapsedMs`. ON DELETE RESTRICT on the registration | Revisions are **rows of this table** (the reuse map's `EventResultRevision` was folded into it). S6 adds a few columns (§4.1). |
| Registration view | `EventRegistration.resultStatus` (`not_submitted`, `pending_verification`, `verified`, `rejected`, `corrected`, `disqualified`, `dnf`, `dns`), `bibNumber`, `participantUserId` (null until claimed), `dateOfBirth`, `consentTextVersion` | Denormalised view written in the same transaction as the result row. |
| State machine | `RESULT_STATUSES` and the `result` machine in `src/shared/events-lifecycle.mjs` (`verified -> corrected | disqualified`, `corrected -> verified | disqualified`, `rejected|dnf|dns -> pending_verification`, `disqualified -> corrected`) | **Unchanged.** "Disputed" and "provisional/official" are presentation states derived from existing data (§3.1), so the pure machine and its CHECK constraints do not move. |
| Run-to-event link | `EventActivityLink`: `registrationId`, `activityId` (SET NULL when the activity goes), `linkType` (`event_run`, `evidence`), `matchStatus` (`pending`, `matched`, `rejected`), `clientRef` (8 to 100 chars, unique per registration) | Add check summary columns and two partial uniques (§4.1). |
| Run recording | `RunRecorder` (Android-only `GeolocatorGpsSource`; state `idle/recording/paused/finished`; persisted every 10 points; `restore()`), `api.recordRun`, `POST /me/activities/runs`, server validation in `recordRun` (drops points over 30 m accuracy or 12 m/s; 50 m / 60 s minimum; 7 days old; 25 km/h average; source forced to `fitflex`), member-only `ActivityRoute` | Reused unchanged. Run upload has **no idempotency key** (reuse map G9): the event path adds one through `EventActivityLink.clientRef`. Plain runs stay as they are. |
| Medals and awards | `EventMedalTemplate` (name `{en,sw}`, `imageUrl`, `rule` jsonb, `categoryId` fenced to the event), `EventMedalAward` (unique `(registrationId, medalTemplateId)`, `awarded|revoked`, `sourceResultId`) | Rule vocabulary, artwork, lock rules, award engine are new (§7). |
| Achievements | `AchievementDefinition` (`key`, `ruleVersion`, `criteria`), `UserAchievement` (unique `awardKey`, `awarded|revoked`) | Seeded catalogue, criteria vocabulary, engine new (§7.3). |
| Ledger and redemption | `RewardDefinition` (issuer, `valueTzs`, `points`, caps, eligibility, `expiryDays`, `fundingNote`, status), `RewardLedgerEntry` (**append-only trigger**, unique `idempotencyKey`, `reversesEntryId`, sign CHECK), `RewardRedemption` (`reserved|redeemed|cancelled|expired`, `codeHash` unique) | Tables exist and are dormant. Semantics of `points` fixed by D44 (§7.4); deletion path new (§7.6). |
| Challenge rewards | `ChallengeReward`/`EarnedReward` through `GET /me/rewards` (labels and fulfilment queues; **no points, no ledger**) | **Separate system. Not merged, not touched.** The event ledger uses new routes so `/me/rewards` keeps its meaning. |
| Webhooks | S5 outbox + dispatcher, closed allowlist `WEBHOOK_EVENT_TYPES`, per-type projector, envelope with ids only | Add four result types (§8.5). |
| API credentials | S5 `ApiClient` scopes; `results:write` reserved and rejected with 422 `scope_not_available` | Activate it, add `results:read` (§8.4). |
| CSV import pattern | S5 bibs CSV (preview with `previewHash`, atomic apply, formula-injection neutralising, 512 KB, `,` or `;`); B2B roster import (dry run, header aliases) | Reuse the helper and the preview/apply shape (§6.2). |
| Idempotency | S5 `OrganizerIdempotency` (staff and API scopes) and the `Idempotency-Key` rule (8 to 100 chars) | Reused for every S6 write. |
| Jobs | `functions/jobs.mjs` + `opsService.runJob`, advisory locks, `JobRun` | Three new jobs (§7.5, §11.3). |
| Notifications | `notify` + `localeOf` pattern in `events-payment-service.mjs` (ids so retries never duplicate; bilingual `data.titleEn/Sw`) | Reused (§11). |
| Event auto-complete | `eventAutoCompleteGraceHours()` moves events to `completed` | Results release requires `in_progress` or `completed` (§6.4). |
| Mobile UI | `FFSegmented`, `FFCard*`, `FFBadge`, `FFPill`, `FFEmptyState`, `FFErrorState`, `FFSheet`, `FFHeroBand`, `RunMap`/`RunSummaryGrid`, `events_cache.dart` | All reused. |
| Portal UI | `EventViewTabs` (`registrations|orders|finance|kit|bibs|export`), `DataTable`, `Dialog`, `ConfirmDialog`, `Segmented`, `Badge`, `Alert`, `MetricCard`, `EmptyState`, `ErrorState`, the S5 CSV dialog pattern | All reused. |

**New components (with reason):**
1. Portal `src/components/organizer/results-view.tsx` (+ `results-import-dialog.tsx`, `results-table.tsx`, `release-dialog.tsx`, `correction-dialog.tsx`, `disputes-panel.tsx`, `medals-panel.tsx`, `results-settings.tsx`): nothing like results exists; the CSV dialog pattern is copied from the S5 bibs dialog, not shared (different columns and rules).
2. Portal `app/admin/rewards/page.tsx` (+ `reward-definition-form.tsx`, `redemption-lookup.tsx`): FitFlex-only reward desk; no reward admin exists for events.
3. Mobile `lib/screens/member/events/results/` (`member_event_result_page.dart`, `event_results_board_page.dart`, `event_run_sheet.dart`, `event_run_links_page.dart`), `lib/screens/member/events/rewards/` (`member_medals_page.dart`, `member_reward_wallet_page.dart`, `reward_redeem_sheet.dart`, `result_status_chip.dart`, `medal_badge.dart`), models in `lib/shared/events/event_result.dart`, `event_medal.dart`, `event_reward.dart`: nothing exists (reuse map: "no medal/achievement model or screen").
4. Backend `src/services/events-results-service.mjs`, `events-run-link-service.mjs`, `events-award-service.mjs`, `events-reward-service.mjs`, `src/infra/event-results-store-pg.mjs`, `event-rewards-store-pg.mjs`, `src/shared/events-results-csv.mjs`, `events-run-checks.mjs`, `events-reward-code.mjs`; routes `functions/events-results.mjs`, `events-runs.mjs`, `events-rewards.mjs`, `events-admin-rewards.mjs`: new bounded domain, same pattern as S4/S5.

---

## 2. Personas and permissions

| Actor | Identity | Import / enter results | Verify, reject, release | Correct, disqualify | Medal templates | Disputes | Reward definitions |
|---|---|---|---|---|---|---|---|
| Organizer owner / admin | `event_organizer`, `organizer_staff`; role from `EventOrganizerStaff` | yes | yes | yes | create, edit (rule locked after release), deactivate | resolve | no |
| Organizer timing | `organizer_staff` | **import and enter provisional only** | no | no | read | read | no |
| Organizer ops | `organizer_staff` | no (Results tab hidden) | no | no | no | no | no |
| Organizer finance | `organizer_staff` | no | no | no | no | no | no |
| FitFlex admin, scope `events` | portal admin | read all; manual entry only for an inactive organizer (D59) | no (exception: organizer inactive for more than 7 days after the event, D59) | yes, with reason, audited | read | resolve when the organizer cannot (D59) | **create, edit, pause** (D45; reuse of `events` scope, no new ACL scope) |
| External timing partner | `ApiClient` with `results:write` | yes (`results:write`), provisional only | **no** (D46) | no | no | no | no |
| External integration | `ApiClient` with `results:read` | no | no | no | no | no | no |
| Member / participant | `member`, `participantUserId = caller` | no | no | no | no | raise and withdraw own | no |
| Purchaser (not the participant) | `purchaserUserId = caller` | no | no | no | no | no | no |

Rules:
- Roles are checked in the service as well as the guard (the S5 rule). Timing role is the existing `timing` organizer staff role; no new role.
- A suspended organizer is read-only: no import, verify, release, correct or medal edits; participants' views keep working. An organizer suspended after issuing API clients: `/v1` calls fail closed (`organizer_suspended`, S5).
- A participant sees only their own result and, after release, the public board according to §5.5 visibility. Purchasers who are not the participant: **before the place is claimed** they see the result of the places they bought (they are the only person who can); **after the claim** they see only a status chip (D57, consistent with the S3 masked view, M5).
- Organizers never receive participant phone or email through results, import errors, API or webhooks (D36). Error rows in import previews identify people by bib and line number only.

---

## 3. Domain rules

### 3.1 Result states (what people see) and how they map to stored data

The stored model is unchanged (§1). Four **presentation states** are derived on the server and returned as `stage`; clients never derive them.

| `stage` | English label | Derived from | Visible to |
|---|---|---|---|
| `none` | No result yet / Result not published | no current `EventResult`, or current row `pending_verification`/`rejected` with no release of that category | participant: neutral message; organizer: count |
| `provisional` | Provisional | current row is `pending_verification`, or `verified` while the category's latest release is `provisional` | participant (once the category is released at least as provisional); board |
| `official` | Official | current row `verified` and the category's latest release is `official`; also `dnf`/`dns`/`dq` rows after official release | participant; board |
| `corrected` | Corrected | current row `verificationStatus = 'corrected'` (revision 2 or higher, after an official release) | participant, board (badge "Corrected") |
| `disputed` | Under review | an **open** `EventResultDispute` exists for the current row; overrides the label of any of the above, the numbers stay visible | participant, organizer; board shows "Under review" |
| `disqualified` | Disqualified | current row `verificationStatus = 'disqualified'` / `finishStatus = 'dq'` | participant, board without time; no rank |
| `rejected` | Not accepted | current row `rejected` (virtual GPS or import row refused) | participant only, with reason code text |

Allowed organizer actions follow the existing `result` machine, not a new one:
```
(no row) --import/enter/GPS submit--> pending_verification
pending_verification --verify--> verified | --reject--> rejected | --disqualify--> disqualified
(no row | not_submitted) --enter DNF/DNS--> dnf | dns   (finishStatus dnf/dns rows start settled, no time)
verified --correct--> corrected (revision n+1)         verified --disqualify--> disqualified
corrected --correct again--> corrected (revision n+2; status stays, a new row is inserted)
corrected --disqualify--> disqualified      disqualified --correct(reinstate)--> corrected
rejected | dnf | dns --new submission--> pending_verification (new revision)
```
`release` is **not** a result status. It is a row in `EventResultRelease` per event and category with `stage` `provisional` or `official` (§4.1). Rules:
- `provisional` release shows pending and verified results labelled Provisional; it can be **withdrawn** while no official release exists for that category (then `stage` goes back to `none` for participants).
- `official` release needs every non-DNS/DNF result in the category to be settled (verified, rejected or disqualified; none `pending_verification`) unless the organizer ticks "Leave unsettled results out" (they stay unpublished and unranked, listed as unsettled). It **cannot be withdrawn**; later changes are corrections with a reason (traceable).
- Ranks are computed on official release and recomputed when a correction changes a time (§6.5).

### 3.2 Dispute states
`open -> upheld | rejected | withdrawn`. `upheld` requires the resolver to perform a correction or disqualification in the same action (one transaction: the dispute row and the new result revision commit together) or to choose "No change needed" with a note, which is recorded as `rejected`. `withdrawn` is the participant's own action while `open`. One open dispute per registration; a closed dispute does not block a new one while the dispute window is open.

### 3.3 Medal award and achievement states
`EventMedalAward`: `awarded <-> revoked` on the same row (the unique key forbids a second row). Every flip writes an `AuditLog` row with before/after and the source result; the member sees revoked medals in a "Removed" list with a plain reason. `UserAchievement`: same flip rule. Never deleted.

### 3.4 Ledger and redemption states
`RewardLedgerEntry` rows are only inserted (database trigger, S1). `RewardRedemption`: `reserved -> redeemed | cancelled | expired`; `certificate` rewards go straight to `redeemed`.

### 3.5 Who may change what and when (summary)
- Results of a category are editable by import/entry until it has an official release; afterwards only by **correction** (owner/admin, reason 10 to 300 chars) or admin exception.
- Medal template **rules** are locked once their category (or, for an event-wide template, any category) has an official release. Names and artwork can still be edited (display only). New templates can be added later; they award retroactively after a preview-and-confirm (§7.2).
- Event cancelled: no new results, no medals; existing awards are revoked by the reconcile job (§7.5) with reason `event_cancelled`.

---

## 4. Data model and migrations

Additive, sorted after the highest timestamp at branch time. RC already contains `20270127090000-staff-pin-change-marking.cjs`, so the new files are named `20270128090000` and `20270128090100` (confirmation 1: re-check the highest timestamp when the branch is cut; anything after `20270126090100` satisfies the brief). `down` fails closed once S6 data exists, like S5.

### 4.1 `20270128090000-events-results-s6.cjs`
1. **`EventResult`** gains: `netElapsedMs bigint NULL`, `gunElapsedMs bigint NULL` (both CHECK `>= 0`; `elapsedMs` remains the **ranking basis** chosen by `EventCategory.resultRules.timeBasis`), `sourceLabel text NULL` (provider display name, 1 to 60 chars, plain text, e.g. "ChipTime Ltd"; shown to participants), `importId text NULL` (FK to `EventResultImport`), `submittedByUserId text NULL`, `submittedByApiClientId text NULL` (FK `ApiClient`, SET NULL; CHECK not both), `activityLinkId text NULL` (FK `EventActivityLink`, SET NULL; set for `fitflex_gps`), `withinCutoff boolean NULL`, `reasonCode text NULL` (closed list, rejection/correction/DQ), `ranksComputedAt timestamptz NULL`. (There is no per-row release column: release is per category, below.)
   CHECK: `sourceType = 'fitflex_gps'` requires `activityLinkId IS NOT NULL`; `manual_unverified` rows are not creatable by any S6 route (service refuses; value kept for compatibility).
   Indexes: the current-row unique per registration exists; add `(importId)` and, for listing, `(verificationStatus) WHERE "isCurrent"`.
2. **`EventResultRelease`** (append-only history): `id`, `eventId` (FK), `categoryId NULL` (composite FK to `EventCategory(id, eventId)`; NULL = whole event), `stage` CHECK in (`provisional`, `official`), `action` CHECK in (`release`, `withdraw`), `resultCount int`, `unsettledCount int`, `releasedBy` (User), `releasedAt`, `note`. The current stage of a category = latest non-withdrawn row for the category, else for the whole event. Trigger refusing UPDATE/DELETE (same pattern as `PartnerKycEvent`). Unique: one `official` `release` per `(eventId, categoryId)` (partial unique where `stage='official' AND action='release'`, with `COALESCE(categoryId,'')`).
3. **`EventResultImport`** (audit of applied imports): `id`, `eventId`, `organizerId`, `sourceType`, `sourceLabel`, `fileName` (<= 120), `contentSha256`, `rowCount`, `createdCount`, `revisedCount`, `unchangedCount`, `summary jsonb` (counts only, no names), `createdBy` / `apiClientId` (XOR), `createdAt`. Unique `(eventId, contentSha256)` so the same file cannot be applied twice (replay returns the first answer).
4. **`EventResultDispute`**: `id`, `registrationId`, `resultId` (the current row at the time), `raisedByUserId`, `reasonCode` (CHECK closed list: `time_wrong`, `not_my_result`, `wrong_category`, `missing_split`, `dq_challenge`, `other`), `note text NULL (<= 500)`, `status` (`open|upheld|rejected|withdrawn`), `resolutionNote text NULL (<= 500)`, `resolvedBy NULL`, `resolvedAt NULL`, `resultIdAfter NULL`, `createdAt`. Partial unique one `open` per registration; index `(status) WHERE status='open'`; CHECK resolved fields present iff status is `upheld|rejected`.
5. **`EventActivityLink`** gains: `distanceMeters int NULL` and `movingSeconds int NULL` (snapshots so the link survives activity deletion), `elapsedMs bigint NULL` (time to the category distance, §5.3), `checks jsonb NOT NULL DEFAULT '{}'`, `flags jsonb NOT NULL DEFAULT '[]'`, `routeFingerprint text NULL`, `submittedAt timestamptz`, `unlinkedAt timestamptz NULL`, `unlinkedReason text NULL`. Partial uniques: one live `event_run` link per registration (`WHERE linkType='event_run' AND unlinkedAt IS NULL AND matchStatus <> 'rejected'`); one live `event_run` link per activity (same predicate on `activityId`, so one run cannot be the result of two registrations); at most three live `evidence` links per registration (service-enforced, spec-tested). Index `(routeFingerprint) WHERE routeFingerprint IS NOT NULL` for duplicate detection per event (joined via registration).
6. **`EventRegistration`** gains: `resultsVisibility text NOT NULL DEFAULT 'standard'` CHECK in (`standard`, `bib_only`, `hidden`) and `resultsVisibilitySetAt timestamptz NULL`. Backfill in the migration: rows with `consentTextVersion` older than the version that contains the public-results clause (value of `EVENTS_CONSENT_TEXT_VERSION` at deploy, confirmation 6) get `bib_only`; rows with `dateOfBirth` indicating under 18 on the event start day get `bib_only` and the service never lets a minor set `standard` (§5.5). Because the module is dormant the backfill is expected to touch no real rows; it must still be written.
7. **`Event`** gains `resultsPolicy jsonb NOT NULL DEFAULT '{}'` validated in `events-document.mjs`: `{ disputeWindowHours: 24..720 (default EVENTS_RESULTS_DISPUTE_DEFAULT_HOURS = 168), publicNames: 'initial'|'bib_only' (default 'initial'), virtual: { allowedEvidence: ['fitflex_gps'] } }`. Editable until the first official release; afterwards only `disputeWindowHours` can be extended (never shortened).
8. **`EventCategory.resultRules`** (exists, jsonb, validated by the document validator, confirmation 7): `{ timeBasis: 'net'|'gun' (default 'net'), cutoffMinutes: int 1..1440 | null, virtualDistanceToleranceBps: int 0..500 | null }`. Unknown keys are rejected.
9. **`EventAwardTask`** (work queue for the award engine, §7.5): `id`, `eventId`, `registrationId NULL`, `releaseId NULL`, `reason` (`release`, `result_changed`, `claim`, `registration_cancelled`, `event_cancelled`, `template_added`, `definition_changed`), `state` (`pending|running|done|failed`), `attempts int`, `lastError text NULL (<= 200, no personal data)`, `createdAt`, `startedAt`, `finishedAt`. Partial unique on `(eventId, COALESCE(registrationId,''), reason) WHERE state IN ('pending','running')` so a burst of corrections coalesces.
10. **`OutboxEvent`** unchanged (types are data). **`OrganizerIdempotency`** unchanged (new route strings only).

### 4.2 `20270128090100-events-rewards-s6.cjs`
1. **`EventMedalTemplate`** gains `tier text NOT NULL DEFAULT 'finisher'` (CHECK in `finisher`, `gold`, `silver`, `bronze`, `time`, `other`), `artKey text NOT NULL` (the built-in fallback design, CHECK against the list in §7.7, defaulted from `tier` by the service), `artId text NULL` (the live custom artwork, FK `EventMedalArt`, SET NULL), `description jsonb NOT NULL DEFAULT '{}'` (`{en, sw}`, <= 140 chars each), `sortOrder int NOT NULL DEFAULT 0`. `imageUrl` is never written or accepted from a client (D54 uses its own tables, §7.7; the #273 rule that apps never load remote images stays true). `rule` is validated by the service (§7.1); also a CHECK `jsonb_typeof(rule) = 'object'`.
2. **`EventMedalAward`** gains `reasonCode text NULL` (set on revoke) and `revokedBy NULL`. Existing CHECK `awardStatus='revoked' <=> revokedAt IS NOT NULL` stays.
3. **`AchievementDefinition`**: seed rows (idempotent `INSERT … ON CONFLICT (key) DO NOTHING`), see §7.3. **`UserAchievement`** gains `reasonCode text NULL`.
4. **`RewardDefinition`** gains `triggerType text NOT NULL` CHECK in (`event_finish`, `medal`, `achievement`), `triggerEventId text NULL` (FK `Event`, RESTRICT), `triggerRef text NULL` (medal template id or achievement key), `reversalPolicy text NOT NULL DEFAULT 'revoke_unredeemed'` CHECK in (`revoke_unredeemed`, `revoke_all`), `redeemMode text NOT NULL DEFAULT 'certificate'` CHECK in (`certificate`, `perk`), `perUserCooldownDays int NULL`. Launch CHECK: `valueTzs IS NULL` while D45 stands (enforced in the service, not the database, so a later decision needs no migration). `points`: see D44, the service writes the entitlement unit count (`1`) per earn and ignores `RewardDefinition.points` for balance maths.
5. **`RewardLedgerEntry`**: make `userId` **nullable** and change its FK to `ON DELETE SET NULL`; replace the trigger function so that an UPDATE is allowed **only** when it sets `userId` from non-null to NULL and every other column is unchanged (this is the one exception that lets account deletion anonymise the ledger, §7.6). DELETE and TRUNCATE stay forbidden. Add `definitionId`-based index `(rewardDefinitionId, userId)`. Add CHECK `userId IS NOT NULL OR "anonymisedAt" IS NOT NULL` with new column `anonymisedAt timestamptz NULL` (set by the same update; the trigger requires it to change from NULL to a value at the same time).
6. **`RewardRedemption`**: `userId` nullable with `ON DELETE SET NULL` and `anonymisedAt` (same reason); gains `expiresAt timestamptz NULL` (reserved perks lapse), `adminNote text NULL (<= 200)`, `redeemedByRole text NULL`.
7. **`Notification` dedupe**: no schema change; ids are deterministic (§11).

### 4.3 Backend fields the clients need (for `fitflex-planner` / `contract-checker`)
Member result view (§8.3), organizer results rows (§8.1), medal and reward objects, board rows. Each field is listed in the contract it appears in; any field not in §4.1/§4.2 or already on `EventRegistration`/`Event`/`EventCategory` is computed.

---

## 5. Run linking (RUN-001..003, RUN-007, G9, G10)

### 5.1 What a link is
A **link** ties one FitFlex `Activity` (a run recorded in the app, `source = 'fitflex'`) to one registration. It is evidence and, for virtual events only, the basis of a result. **A link never changes an official result and never creates an official one for an in-person event** (RUN-005; the service refuses `sourceType = 'fitflex_gps'` unless `Event.eventType = 'virtual'`, with a spec).

| Event type | Link type | What it produces | Label to the participant |
|---|---|---|---|
| `road`, `trail`, `fun`, `charity` | `evidence` (up to 3) | A "Your FitFlex run" card on the result page, with distance, moving time and a comparison line to the official result (when one exists). Nothing is submitted to the organizer. | "Recorded with FitFlex GPS. This is not the official race time." |
| `virtual` | `event_run` (one live) | A `pending_verification` `EventResult` with `sourceType = 'fitflex_gps'`, `elapsedMs` per §5.3, which the organizer verifies or rejects | "Virtual run, GPS recorded. Waiting for the organizer to confirm." |

### 5.2 Eligibility (all checked on the server; the client only pre-checks for friendliness)
1. Caller is authenticated, `registration.participantUserId = caller` (follow-up S6: the service must also check `Activity.userId` equals that user) and the registration is `confirmed`. Unclaimed places cannot link (the app shows the claim prompt).
2. A ticket exists and is not `revoked`; event status is `published|registration_closed|in_progress|completed` and **not** `cancelled`; for in-person events linking is allowed from the run window start (below) until `EVENTS_RUN_LINK_MAX_DAYS_AFTER` (default 7) days after `Event.endsAt`; for virtual events until `endsAt` plus the same grace only if the run itself started inside the window.
3. The activity: `type = 'running'` (walking events: `walking` is not a recordable type in `RECORDABLE_TYPES`, so walkers are out of scope in S6, noted in §18), `source = 'fitflex'`, has a stored route (`hasRoute`), was recorded by `recordRun` (so the existing accuracy, speed, length and age limits already hold), belongs to the caller. Imported or manual activities (`device`, `manual`, `trainer`, `gym`) are refused: 422 `activity_not_recorded_in_app`.
4. **Run window** (D51): virtual = `[Event.startsAt, Event.endsAt]` in the event timezone (the run must **start** inside); in-person evidence = `[category.startTime or Event.startsAt − 2 h, Event.endsAt + 12 h]`. Outside: 422 `run_outside_window` with `window { startsAt, endsAt }`.
5. **Distance** (virtual only): measured distance (from the stored track) >= category distance × (1 − tolerance), tolerance default `EVENTS_RUN_DISTANCE_TOLERANCE_BPS` = 200 (2 %), per-category override `virtualDistanceToleranceBps`. Below: 422 `distance_too_short { measuredMeters, requiredMeters }`. In-person evidence has no distance rule (any run in the window may be linked).
6. Not already the live `event_run` of another registration (409 `activity_already_linked`) and the registration has no live `event_run` link (409 `run_already_linked`; unlink first).
7. Idempotency: `clientRef` (8 to 100 chars, client-generated at **Start** and persisted with the in-progress run) is required on the create-and-link route; the same `clientRef` for the same registration returns the original link (`Idempotent-Replayed: true`); the same `clientRef` with a different body is 409 `idempotency_key_reused`. The link-existing route uses `Idempotency-Key`.

### 5.3 How the time is worked out (virtual)
Server-side from `ActivityRoute.segments` (the track is never sent to the organizer): walk the cleaned points, accumulate distance, pauses (gaps between segments) excluded; `elapsedMs` = moving time at the first point where cumulative distance reaches the category distance (linear interpolation inside the last step). `distanceMeters` on the result = measured total distance of the run, `elapsedMs` as above, `netElapsedMs = elapsedMs`, `gunElapsedMs` NULL. D50: moving time, not wall-clock, because the recorder pauses; the result shows "Moving time" for GPS sources so nobody mistakes it for a gun time.

### 5.4 Checks, flags and anti-cheat (nothing is auto-rejected after eligibility; flags route to a human)
Stored in `EventActivityLink.checks` (numbers) and `flags` (codes). Organizers see **flag codes and the numbers below, never the route, never coordinates**.
| Check | Value stored | Flag raised when |
|---|---|---|
| Window | `startedAtOffsetMinutes` | none (hard rule, §5.2) |
| Coverage | `distanceCoveragePct` | below 100 (information) |
| Pace plausibility | `bestKmPaceSec`, `avgPaceSec` | `implausible_pace`: any 1 km split faster than 2:20/km, or average faster than the world-record pace for the distance +5 % (constants in `events-run-checks.mjs`, tunable) |
| Data quality | `droppedPointsPct`, `longestGapSec` | `many_dropped_points` > 15 %; `long_gap` > 10 min without a point |
| Duplicate route | `routeFingerprint` (hash of a coarse grid-cell sequence, 50 m cells, direction-sensitive) | `duplicate_route`: another **live** link in the **same event** from a **different user** has the same fingerprint (copied or shared run); the flag appears on both rows, the other participant is never named to either |
| Device | `source = fitflex` | none |
Bulk approve (§6.3) never includes flagged rows; each flagged row needs an individual decision with the flag codes in plain words. Reward farming (PRD §10): `capPerUser`, a per-user daily limit of 10 link attempts, and the admin reward desk's "most earned this week" list (§9.8).

### 5.5 Privacy of runs and results (RUN-003, PRD §10)
- Linking does **not** change the activity's `shareWith`; the run stays as private or shared as the member set it. The result board is a separate disclosure with its own switch (below).
- `ActivityRoute` stays member-only. S6 adds **no** read of a route by organizer, admin or API.
- Unlinking: the participant can unlink an `evidence` link any time, and an `event_run` link until the organizer verifies; the link row stays (audit) with `unlinkedAt`, and the pending result revision becomes `rejected` with reason `replaced_by_participant`.
- Deleting the activity: `EventActivityLink.activityId` becomes NULL (S1); the snapshot columns keep distance and time; a pending virtual result stays pending for the organizer to decide.
- **Public name display** (`EventRegistration.resultsVisibility`, D48):
  - `standard`: first name + last initial + bib (organizer default `publicNames = initial`) or bib only if the organizer chose `bib_only`.
  - `bib_only`: bib and "Runner" only.
  - `hidden`: the row is omitted from the board; the person still gets their own result, medals and rewards, and organizers still see them in their own tables.
  - **Minors** (age on the event start day < 18 using `DateOfBirth`, computed by `ageOnEventDay`): always `bib_only` on any board, cannot choose `standard`, their results are visible to the account holder only. **Unknown date of birth** in a category with `minAge` under 18: `bib_only`; otherwise treated as an adult (D48).
  - Registrations made under a consent text that does not contain the public-results clause default to `bib_only`; the app asks the participant once ("Show my name on the results?") the first time they open the result page (§10.3). New registrations (after the consent bump) default to `standard` with the notice shown at checkout (consent text bump is a launch gate, §14).
  - The signed-in board is members-only (D48): no unauthenticated results endpoint.
- Organizer-facing tables show full names for confirmed registrations exactly as the S5 roster does (masked before payment), never phone, email or date of birth (D36).
- Retention and anonymisation: unchanged follow-up. S6 adds that `hidden` removes a person from every public surface at once; permanent erasure of results is not offered (the organizer's official record), the retention period is a counsel item (D55).

### 5.6 Event page entry points (mobile)
`Start run for this event` appears on the **ticket page** and the **registration page** when: `EVENTS_RUNS` on (via `options.results.runs`), participant is the account holder, registration confirmed, the event is inside the run window (± the S5 states), and `GpsSource.isSupported` is true (Android). Otherwise:
- iOS, web or desktop: the button is replaced by "Recording runs isn't available on this device yet. If you recorded the run on another phone with this account, add it below." plus **Add a recorded run** (link existing). **Real device needed:** Android recording, permission prompts, foreground service, background behaviour, battery.
- Location permission denied: the existing `_AccessAlert` pattern with a link to settings; ticketing is untouched (RUN-002).

---

## 6. Results (RUN-004..009)

### 6.1 Sources and provenance (RUN-004)
| `sourceType` | Created by | Means | Label (EN) | Label (SW) |
|---|---|---|---|---|
| `timing_provider` | organizer import of a timing company's file, or `results:write` API client | Times from the event's timing system, confirmed by the organizer when verified | Official timing | Muda rasmi wa mbio |
| `organizer_verified` | organizer enters or edits a time by hand | Entered by the organizer's staff | Confirmed by organizer | Imethibitishwa na mwandaaji |
| `fitflex_gps` | participant GPS run on a **virtual** event | Phone GPS, accepted by the organizer | Virtual run, GPS | Mbio pepe, GPS |
| `manual_unverified` | not creatable in S6 | self-reported | Self-reported, not verified | Imeripotiwa na mshiriki, haijathibitishwa |
The label is always shown next to the time (never colour only) and `sourceLabel` (e.g. "ChipTime Ltd") follows it when set.

### 6.2 CSV import (D8; portal staff and `POST /v1/organizer`)
- **Roles:** owner, admin, timing. File: UTF-8 (BOM tolerated), `,` or `;` delimiter autodetected, header row required, <= 1 MB and <= `EVENTS_RESULTS_IMPORT_MAX_ROWS` (5,000) rows (under the platform body limit). Cells starting with `= + - @ tab CR` in text columns are neutralised on storage (S5 helper) and refused in the bib column.
- **Columns** (header aliases case-insensitive): `bib` (aliases `bib_number`, `number`) **or** `registrationId`; `status` (`finished`/`fin`, `dnf`, `dns`, `dq`; default `finished` when a time is present); `net_time` (alias `chip_time`, `time`); `gun_time`; `category` (name or id, optional check); `note` (<= 120, stored only as `sourceReference`, not shown to participants). Times: `H:MM:SS`, `HH:MM:SS.mmm`, `MM:SS`; anything else is `time_invalid`; zero or over 24 h is `time_out_of_range`. Ranks in the file are **ignored** with a warning `rank_ignored` (D52). Matching is by live bib (unique across the event, D40) or registration id; never by name.
- **Preview** `POST …/results/imports/preview { csv, sourceType: 'timing_provider'|'organizer_verified', sourceLabel?, timeBasis? }` -> `{ previewHash, rows { total, ok, warnings, problems }, willCreate, willRevise, unchanged, byStatus { finished, dnf, dns, dq }, unmatchedRegistrations (confirmed people with no row), problems[ { line, bib, code, message } ] (max 200 + total), warnings[ … ] }`. Problem codes: `bib_not_found`, `bib_duplicate_in_file`, `registration_not_confirmed`, `category_mismatch`, `time_missing_for_finisher`, `time_invalid`, `time_out_of_range`, `status_invalid`, `already_official` (the person has a verified result: use correction), `event_not_open_for_results`. Warnings: `rank_ignored`, `kit_not_collected`, `over_cutoff`, `time_basis_missing` (gun time absent while basis is gun).
- **Apply** `POST …/results/imports { csv, previewHash, Idempotency-Key }`: re-parses, compares `previewHash` (409 `preview_stale` if registrations or bibs changed), and applies **atomically, only when `problems = 0`**. New results are `pending_verification` (or already settled `dnf/dns/dq` rows, see below), a re-import that changes a still-pending row inserts revision n+1, an identical row is `unchanged`. Writes one `EventResultImport` row (unique `(eventId, contentSha256)`: re-sending the same file returns the first response, `Idempotent-Replayed: true`) and one audit row. `dq` rows from an import enter as `pending_verification` with `finishStatus = 'dq'` and require a reason on verify. `dnf`/`dns` rows enter already settled (`registration.resultStatus` = `dnf|dns`).
- Never creates `verified` results: **import is a submission, verification is a human act** (RUN-005). Timing role may import; only owner/admin verify.
- Events not `in_progress|completed`: `event_not_open_for_results`.

### 6.3 Verify, reject, bulk approve, manual entry
- **Manual entry** (owner/admin/timing): `PUT …/results/:registrationId { finishStatus, netTime?, gunTime?, sourceLabel?, reason? }` creates `organizer_verified` provisional (`pending_verification`) or a settled DNF/DNS.
- **Verify** `POST …/results/:resultId/verify { expectedRevision, reasonCode? }` (owner/admin): requires `expectedRevision` equal to the current revision (409 `result_changed` otherwise); conditional update `pending_verification -> verified`; sets `verifiedBy/At`; updates `EventRegistration.resultStatus` in the same transaction; outbox `result.verified`. A `dq` row requires `reasonCode`.
- **Reject** `POST …/reject { expectedRevision, reasonCode }` -> `rejected`; reason codes `not_a_valid_run`, `data_error`, `duplicate`, `other` (organizer picks, optional 120-char note, shown to the participant in their language through the code; the note is shown as typed).
- **Bulk verify** `POST …/results/verify-bulk/preview { categoryId?, filter: 'pending_clean' }` -> `{ previewHash, count, excludedFlagged }` and `POST …/verify-bulk { …, previewHash }`: verifies every `pending_verification` row in scope that has **no flags**; flagged GPS rows and `dq` rows are excluded and listed. Atomic; 409 `preview_stale`.
- **Role check**: `verify`, `reject`, `release`, `correct`, `disqualify` re-check `role in (owner, admin)` in the service.

### 6.4 Release (provisional and official)
`POST …/results/release/preview { categoryId?|null, stage }` -> `{ previewHash, finished, dnf, dns, dq, noResult, unsettled[ counts only ], willMarkDns }` and `POST …/results/release { categoryId?, stage, previewHash, markRemainingDns: bool, leaveUnsettledOut: bool, Idempotency-Key }`.
- `stage = provisional`: allowed when at least one result exists; visible to participants as "Provisional" and on the board only if `EVENTS_RESULTS_PUBLIC` is on. Withdrawable: `POST …/results/release/withdraw { categoryId? }` while no official release exists (audited, participants' notices are not recalled; the next view shows "not published").
- `stage = official`: allowed when the event is `in_progress` or `completed`, no `pending_verification` row remains (or `leaveUnsettledOut`), and (if `markRemainingDns`) confirmed registrations without any result are written as `dns` rows (`organizer_verified`, settled) in the same transaction. One transaction: insert the `EventResultRelease` row, compute ranks (§6.5), set `resultStatus` on registrations, insert one `EventAwardTask(reason='release')`, outbox `result.published`. A second `official` release for the same scope is 409 `already_released`.
- The organizer must type the **number of results** being published into the confirm dialog (the S4 `expectedRefundTzs` pattern), so a mis-scoped release cannot be confirmed by habit.

### 6.5 Ranks (D52)
Computed by the server on official release and on any change that alters a finished time, never accepted from the file. Within an event, `overallRank` ranks all `finished`, `verified|corrected`, non-DQ results with the same `distanceMeters` category set by `elapsedMs` ascending; `categoryRank` ranks within the category (identical when one category per distance). Ties share a rank (1, 2, 2, 4). DNF, DNS, DQ and over-cutoff finishers (when `cutoffMinutes` is set the result stays `finished` with `withinCutoff = false` and **is not ranked**) have no rank. Ranks live on the current row and are rewritten in place by the recompute (they are derived, not result input); the revision rows capture inputs only. A recompute that changes someone's rank enqueues an award task for podium templates only.

### 6.6 Corrections and disqualification (RUN-008, RUN-009)
- `POST …/results/:resultId/correct { expectedRevision, netTime?, gunTime?, finishStatus?, categoryId?, reasonCode, note (10..300) }` (owner/admin): inserts revision n+1 with `verificationStatus = 'corrected'`, `verifiedBy/At` = actor, clears `isCurrent` on the old row, one transaction; resets nothing in history; recomputes ranks for the category; enqueues award tasks (`result_changed`) for the registration and for registrations whose rank changed within a podium rule; notifies the participant (essential notice, §11); outbox `result.corrected`. `categoryId` change moves the registration? **No**: a category move is a registration action (not S6); a wrong-category result is corrected by `finishStatus` only (`category_mismatch` stays a problem).
- `POST …/results/:resultId/disqualify { expectedRevision, reasonCode, note }` -> `disqualified` (`finishStatus = 'dq'`), medals and event-linked rewards revoked by the engine, outbox `result.corrected` with `finishStatus: 'dq'`. Reinstating a DQ is a correction.
- FitFlex admin (`events` scope): the same two actions with a mandatory reason, `actorType: 'admin'` in the audit, and a notice to the organizer owner.
- Every action: `AuditLog` with actor, before/after (status, times, revision; **no** personal contact data), `requestId`.

### 6.7 Disputes (COM-005, PRD US-RUN-02)
- Participant: `POST /me/event-registrations/:id/result/disputes { reasonCode, note? }` while the category is released and **inside the dispute window** (`resultsPolicy.disputeWindowHours`, default 168 h from the official release; for provisional-only categories the window starts at the provisional release). 409 `dispute_window_closed` otherwise; 409 `dispute_open` if one is open; rate limit 5/day.
- Organizer owner/admin: sees open disputes (count badge on the Results tab), opens a panel with the result, the participant's reason, their linked FitFlex run summary (distance and time only, if any, **never the route**), and resolves: **Correct the result** (opens the correction dialog; on save the dispute becomes `upheld` in the same transaction), **No change** (needs a note, becomes `rejected`), or **Disqualification stands**.
- FitFlex admin sees all open disputes older than 7 days and can resolve (D59).
- Effects: `stage` shows "Under review" while open; medals are **not** suspended while open (a dispute is not a finding); outcome notice to the participant either way.

### 6.8 Virtual events
Separate rules (RUN-007): `Event.eventType = 'virtual'` shows the result page with "Virtual" and evidence method text; the Results tab replaces "Import CSV" with "GPS submissions" as the primary view (CSV still allowed for organizers who verify by other means, as `organizer_verified`). Bulk approval is the organizer's call; there is no automatic acceptance (D49). Rankings exist (same rules) but labelled "Virtual".

---

## 7. Medals, achievements and rewards (RWD-001..012)

### 7.1 Event medals (organizer-configured, per event, optionally per category)
- **Rule vocabulary** (closed; `EventMedalTemplate.rule`, validated, unknown keys refused):
  - `{ "type": "finish" }`: finished, verified (or corrected), not DQ, `withinCutoff` not false (when a cutoff exists), official release done.
  - `{ "type": "placing", "scope": "category" | "overall", "top": 1..10 }`: `categoryRank` or `overallRank` <= top.
  - `{ "type": "time_under", "maxElapsedMs": int }`: finished official with `elapsedMs <= maxElapsedMs` (e.g. sub-2:00 half marathon).
  All three require: registration `confirmed`, event not `cancelled`, result current and settled, **no medal for purchase alone** (RWD-004, spec asserts a paid registration without a result gets nothing).
- **Artwork** (D54 as changed): every organizer brings their own design (one image per medal template, so per event, per category and per tier: finisher, gold, silver, bronze, time); the built-in designs (§7.7) are the default until an upload and the fallback when artwork is removed or taken down. Design, pipeline and moderation are in §7.7. Medal name `{en, sw}` entered by the organizer (Swahili blank -> the English text with a "Swahili not provided" label in the organizer UI; the app shows the English text, never an empty string).
- **Lock rule:** `rule` and `categoryId` are locked when the scope has an official release (409 `template_locked`); `name`, `description`, `tier`, artwork (upload, replace, remove), `sortOrder`, `status` stay editable. Deactivating a template stops new awards and does **not** revoke existing ones.
- **Late template:** a new template on a released scope shows "N people would receive this" from `GET …/medal-templates/:id/preview`; saving enqueues `EventAwardTask(reason='template_added')`.
- **Defaults:** when an organizer publishes an event with no medal template the Medals panel suggests one "Finisher" template (a button "Add a finisher medal"); nothing is created automatically.

### 7.2 The award engine (`events-award-service.mjs`, run by job `event-awards-run`)
Deterministic and idempotent: for a registration it evaluates every active template of the event and every `AchievementDefinition`, then every matching `RewardDefinition`. Rules:
1. Input is the current `EventResult`, the registration, the event, the latest release for its category, and `participantUserId` (medal rows attach to the **registration**; achievements and ledger rows need a user, so unclaimed places produce medals only, and the claim enqueues `EventAwardTask(reason='claim')`).
2. A medal qualifies -> `INSERT … ON CONFLICT (registrationId, medalTemplateId) DO UPDATE SET awardStatus='awarded' WHERE awardStatus='revoked'`; a medal that no longer qualifies -> conditional update to `revoked` with `reasonCode` (`result_corrected`, `disqualified`, `registration_cancelled`, `event_cancelled`, `rule_changed_by_admin`). Either flip writes an audit row; a notice goes out only on a state change (notice ids are deterministic, §11).
3. Tasks coalesce per registration; a worker takes a batch of `EVENTS_AWARD_BATCH` (200) pending tasks with `FOR UPDATE SKIP LOCKED` under the job's advisory lock; a failed task keeps `attempts` and `lastError`, retries with backoff up to 5, then `failed` (visible on the admin reward desk and in the ops exception list).
4. **Cancellation and refund reconcile** (so no payment code is touched): job `event-awards-reconcile` (every 10 minutes) finds registrations whose status became `cancelled|refunded|disqualified` or whose event became `cancelled` since the last cursor (read of `EventRegistration.updatedAt`/`Event.cancelledAt`, not the outbox) and enqueues tasks; the engine then revokes medals and reverses ledger entries.
5. Concurrency: the unique keys are the guarantee (medal unique, `awardKey`, ledger `idempotencyKey`); the engine takes a `FOR UPDATE` on the registration row.

### 7.3 Achievements (platform-wide, separate from medals, RWD-002/003)
`AchievementDefinition` seeded at deploy (titles `{en,sw}`, `ruleVersion` 1, owner may edit titles through a direct admin call; no portal editor in S6, D58):
| `key` | EN title | SW title (draft) | `criteria` |
|---|---|---|---|
| `first_event_finish` | First event finished | Tukio la kwanza limekamilika | `{ type: 'event_finishes', count: 1 }` |
| `first_10k_finish` | First 10K finished | 10K ya kwanza imekamilika | `{ type: 'distance_finish', minMeters: 10000, count: 1 }` |
| `half_marathon_finish` | Half marathon finisher | Mshindi wa nusu marathoni | `{ type: 'distance_finish', minMeters: 21000, count: 1 }` |
| `marathon_finish` | Marathon finisher | Mshindi wa marathoni | `{ type: 'distance_finish', minMeters: 42000, count: 1 }` |
| `three_events_year` | 3 events in 12 months | Matukio 3 ndani ya miezi 12 | `{ type: 'event_finishes', count: 3, windowDays: 365 }` |
`distance_finish` compares the **category** distance (`distanceMeters`) of the user's official, settled, finished results. `awardKey = "<key>:v<ruleVersion>:<userId>"` (unique). Counting uses only results that are official and not revoked, across all the user's claimed registrations. A flip back to `revoked` on correction and a re-award on re-qualification use the same row.

### 7.4 Rewards and the ledger (D9, D44, D45)
- **No new points currency.** `RewardLedgerEntry.points` holds an **entitlement unit count per `RewardDefinition`** (an earn of one reward = `+1`), not a fungible balance. The wallet shows rewards ("1 Finisher certificate available"), never a points total, and units of different definitions are never added, converted or spent against each other (D44). `RewardDefinition.points` is ignored by the engine.
- **Definitions** are created by FitFlex admins only (organizers cannot create rewards in S6). Fields per RWD-006: issuer (`fitflex` only at launch; `partner|sponsor` modelled, refused by the service), title `{en,sw}`, trigger (`event_finish` for an event/any event, `medal` by template, `achievement` by key), audience (`eligibility`: optional `categoryIds`, `minAge` unused), `startsAt/endsAt`, `capTotal`, `capPerUser` (default 1), `expiryDays` (from the earn), `terms {en,sw}`, `reversalPolicy`, `redeemMode`, `fundingNote` (required text: who pays; for FitFlex-funded rewards "FitFlex"), `valueTzs` (whole TZS; **must be NULL at launch**, D45; a non-null value is refused with 422 `value_not_allowed_yet` so no cash or funded promise can exist), status `draft|active|paused|ended`.
- **Launch reward types (D45):** `certificate` (a shareable completion certificate shown in the app, redeemed instantly) and `perk` (a code with plain-language instructions that FitFlex staff verify at the admin desk; no cash value, no gym pass, no shop voucher until funding is decided).
- **Earning:** after a medal or achievement is awarded (or a result becomes official for `event_finish`), the engine finds active definitions whose trigger matches, in window, and not over `capPerUser`. It locks the `RewardDefinition` row `FOR UPDATE`, checks `capTotal` against the count of live earn entries (earns minus matching reverses), then inserts `earn (+1)` with `idempotencyKey = "earn:<definitionId>:<userId>:<sourceType>:<sourceId>"`, `sourceType in ('event_medal','achievement','event_result')`. A skipped earn because of caps is recorded in the task's audit row (`skipped: cap_total | cap_user | window`).
- **Reversal** (RWD-010): when the source medal or achievement is revoked, the engine inserts a `reverse (-1)` pointing at the earn entry (`reversesEntryId`) unless a redemption of that entitlement is already `redeemed`: `revoke_unredeemed` leaves redeemed rewards in place and writes an admin-visible exception row; `revoke_all` reverses anyway (the redemption is flagged `needs_review` in the admin desk, nothing is clawed back automatically). Reserved (unredeemed) redemptions of a reversed entitlement are `cancelled`.
- **Expiry:** job `event-reward-expire` (daily) writes `expire (-1)` for unredeemed earns older than `expiryDays`, idempotency key `expire:<earnEntryId>`.
- **Balance** for a user and definition = sum of `points` over their ledger rows for that definition; `available > 0` means the member can claim. Reverses carry the negated points of the entry they undo (a reverse of a redeem is `+1`).

### 7.5 Jobs (existing ops framework; each behind its flag; advisory lock; `JobRun`)
`event-awards-run` (every minute, batch loop), `event-awards-reconcile` (every 10 minutes), `event-reward-expire` (daily 02:00 `Africa/Dar_es_Salaam`), plus an ops exception for tasks `failed`. `event-awards-run` is the only writer of awards; request handlers only enqueue.

### 7.6 Redemption, codes, and the deletion path (rule 6 area; owner reviews)
- **Claim** `POST /me/reward-redemptions { rewardDefinitionId }` with `Idempotency-Key`: transaction locks the member's ledger rows for the definition (`pg_advisory_xact_lock` on `hash(userId, definitionId)`), requires `available >= 1` and definition `active`, inserts `redeem (-1)` (`idempotencyKey = "redeem:<redemptionId>"`) and a `RewardRedemption`: `certificate` -> `redeemed`; `perk` -> `reserved` with `expiresAt = now + 14 days`. Two parallel claims with one unit: exactly one wins (spec).
- **Code (perk):** `FFR-` + 8 characters of Crockford base32 derived as `HMAC-SHA256(deriveKey("reward-code-v1", EVENT_TICKET_SECRET), redemptionId)` (domain-separated key, so no new secret to manage and the app can re-show the code without storing it); only `sha256(code)` is stored in `codeHash`. Not secret enough to be a payment credential and it never unlocks money; lookup is rate limited (30/min/admin, 10 failures/hour/admin -> audit).
- **Verify at the desk** (FitFlex staff, scope `events`): `POST /admin/reward-redemptions/lookup { code }` -> redemption summary (reward title, member display name, status, expiry); `POST …/:id/redeem { note? }` conditional `reserved -> redeemed` (`redeemedBy` = admin); `POST …/:id/cancel`. A `reserved` redemption past `expiresAt` becomes `expired` and the unit is returned (`reverse` of the redeem entry); the reconcile job does this.
- **Account deletion** (follow-up S6; `functions/subscriptions.mjs` `DELETE /me` -> `accountService.deleteMyAccount`):
  - Members with ledger rows: deletion proceeds. A new step first runs the one permitted anonymising update (`userId -> NULL`, `anonymisedAt = now()`) on their `RewardLedgerEntry` and `RewardRedemption` rows inside the same transaction as the user delete (FK `ON DELETE SET NULL` performs the same update; the trigger exception allows exactly that). `UserAchievement` cascades (it is member data). `EventMedalAward` stays on the registration (registration data, whose person fields follow the separate retention rule). Aggregate counts for caps stay correct because rows remain.
  - Organizer owners (`EventOrganizer.ownerUserId` is RESTRICT): deletion is blocked with the existing assisted-transfer pattern: 409 `organizer_owner` and the message "Transfer or close your organizer account first" (D53).
  - Backend must prove it with a spec: delete a member with earn, redeem and reverse rows -> user gone, ledger rows remain with NULL user, trigger still blocks any other UPDATE and every DELETE.
- Dormant ledger note (rule 8): there is **no cash-out, no payout and no redemption against money** in S6; nothing in this slice changes balances of anything but the entitlement ledger.

### 7.7 Custom medal artwork (D54 as changed: organizers bring their own design)

**Rule.** Every organizer may upload their own medal image for each medal template (so per event, per category and per tier). The built-in FitFlex designs stay as the default and the fallback. Artwork goes live at once (show-now) and FitFlex can take it down afterwards (post-moderation), exactly like partner photos and logos. Everything below reuses the partner-media pipeline and the 2026-10-28 image-source security fixes (functions#273 media-source rules and `/storage/upload` restriction, functions#276 data-URI cap, mobile#246 remote-image host check); nothing new is invented where those already decide. Dormant behind `EVENTS_MEDAL_ART` (needs `EVENTS_REWARDS`).

**Built-in fallback set (8, shipped as app and portal assets):** `finisher_green`, `finisher_gold`, `podium_gold`, `podium_silver`, `podium_bronze`, `time_blue`, `charity_red`, `virtual_teal`. Default by `tier`: finisher -> `finisher_green`, gold/silver/bronze -> the matching podium design, time -> `time_blue`, other -> `finisher_gold`; a virtual event defaults to `virtual_teal`. The organizer can also choose any built-in design explicitly ("Use a FitFlex design").

**What is stored (partner-media decision: database storage, `bytea`, no evidence copy).** Migration `20270128090200-events-medal-art-s6.cjs`, additive; `down` fails closed once any row exists:
- `EventMedalArt`: `id` (random, never reused), `eventId`, `organizerId`, `templateId` (composite FK to `EventMedalTemplate(id, eventId)`), `status` (`live`, `replaced`, `removed`, `taken_down`; all but `live` are final), `revision`, `reviewState` (`to_review`, `reviewed`), `reviewedBy/At`, takedown `reason`, `reasonNote`, `decidedBy/At`, `statusChangedBy/At`, `width`, `height`, `altText jsonb` (`{en, sw}`, each <= 120 chars, optional), `confirmationVersion`, `confirmedBy`, `confirmedAt` (the rights confirmation, below), `uploadedBy`, `createdAt`, `updatedAt`, `sha256` and `pixelSha256` (kept **only** on `taken_down` rows, to refuse the same file or a re-saved copy again; cleared otherwise), `purgedAt`. Partial unique: one `live` row per template. The row is kept after the bytes are gone (audit, and the organizer's "taken down" notice).
- `EventMedalArtFile`: `artId`, `variant` (`master`, `m512`, `m256`, `m128`, plus review previews `p240`, `p480`), `contentType` (always `image/webp`), `bytes bytea`, `byteSize`. Deleting the rows really deletes the image (replace, remove, take-down).
- `EventMedalArtUploadAttempt`: one row per attempt, written **before the body is read** (caps count these; nightly sweep removes rows older than two days). It is a separate table so the partner-media tables and their subject-type CHECKs are untouched.
- `EventMedalTemplate.artId` (§4.2) points at the live row (or NULL = built-in).

**Upload pipeline (new file `src/infra/medal-art-file.mjs`, built on the same helpers as `prepareLogoUpload`: `looksLikeSvg`, `sniffImageType`, `pixelSha256`, `sharp`, and the shared image-job gate).** Order of checks, each with its own error code (400 unless noted):
1. Role owner/admin of the event's organizer, organizer `active`, template belongs to the event, event not `cancelled`; `Idempotency-Key`; caps (below) checked **before** the body is read (429 `rate_limited`).
2. Raw request body (not a data URI, not multipart JSON), `Content-Length` and streamed size <= **2 MB** (413 `payload_too_large`; under the platform body limit, the same limit that applies to logos). No remote URLs are ever accepted or stored: a client-supplied `imageUrl`, `http(s)` string or storage path in any medal field is stripped by the route and spec-tested (the #273 rule).
3. **SVG refused**: `looksLikeSvg` -> `svg_not_allowed`. SVG is never sanitised or rendered (D54 chooses refusal; scripts, external references and trademarks hide in SVG).
4. **Type sniffed from the bytes, the declared `Content-Type` and file name are ignored**: only `jpeg`, `png`, `webp` -> else `unsupported_file_type`. GIF, TIFF, HEIC, AVIF, PDF and animated WebP/APNG are refused (single frame only: pages > 1 -> `animated_not_allowed`).
5. **Pixel and size limits**: decoded with `limitInputPixels` 16,000,000 (4000 x 4000) and a failed decode is `corrupt_image`; side >= **512** px (`image_too_small`, so the 512 variant is never an upscale) and <= 4000; **square** within 2 % (`not_square { width, height }`; the portal crops to a square before sending, and the circular mask is applied by the UI, not baked in, so transparent corners are fine). Decoding runs inside the shared gate (`IMAGE_JOBS`: 2 at once, 20 waiting, else 503 `busy`, retry later).
6. **Cleaned master**: rotated upright from EXIF orientation, converted to sRGB, re-encoded as WebP (alpha kept), longest side <= 1024; **EXIF, GPS, XMP and ICC metadata are dropped** (the code never calls `withMetadata`/`keepMetadata`/`keepExif`; spec asserts no metadata survives and that a photo with GPS tags comes out clean). Variants `m512`, `m256`, `m128` are made from the master; review previews `p240`, `p480` at upload. Budget: `m512` <= 90 KB, `m256` <= 40 KB, `m128` <= 15 KB (quality steps as in `HERO_QUALITY_STEPS`; over budget -> keep the lowest step, never fail the upload for a budget miss).
7. **Rights confirmation required**: the request carries `confirmationVersion`; mismatch with the server's current version -> 409 `confirmation_outdated` with the current text; the stored version, user and time are the organizer's warranty (below).
8. Same-file refusal: if `sha256` or `pixelSha256` matches a `taken_down` row -> 409 `file_not_allowed` (the organizer is told this file was taken down and may contact FitFlex support).
9. In one transaction: previous live row -> `replaced` (bytes deleted), new row `live` with `reviewState = 'to_review'`, `EventMedalTemplate.artId` set, audit row, outbox none. Response `{ art }` (never bytes).
Upload caps (mirroring `UPLOAD_RATE`, tuned smaller because a medal needs few images): per person 5 attempts a minute and 30 a day across organizers; per organizer 10 attempts a minute, 20 **successful** uploads a day and 60 attempts a day (refused attempts never use the successful allowance, so a teammate's failures cannot lock the owner out).

**Serving (members, staff, admin).** `GET /events/medal-art/:artId/file?variant=m512|m256|m128` returns the WebP bytes. **Signed in only**, and only for: a member who holds (or held) an award from that template, staff of the event's organizer, or a FitFlex admin with `events`; everyone else 404 (never 403). The `master` is never served. Headers: `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Content-Security-Policy: default-src 'none'`, `Cache-Control: private, max-age=86400` (ids are random and never reused; bytes are deleted on take-down, so a cached copy at worst lives one day on a device; follow whichever cache choice partner-media shipped, confirmation 21). A `taken_down` or `removed` id returns 404 and clients fall back to the built-in design from the same `MedalAward.art.artKey`. Preview for staff: `…/art/preview?w=240|480` reads the stored previews only (no resizing per request) with a per-person rate limit like `PREVIEW_RATE`.

**Moderation (show-now + take-down, same model as partner media).** Art is visible to participants immediately. FitFlex admins (scope `events`) work a queue **Medal art -> To review** (count badge): preview 240/480, event and organizer names, tier and category, alt text, who confirmed the rights text and when; actions **Looks fine** (`reviewed`) and **Take down** with a reason: `inappropriate`, `rights` (copyright), `other_brand` (trademark or another brand's mark), `person_request` (an identifiable person asked for removal), `quality` (unreadable or misleading, e.g. looks like an official FitFlex or sponsor badge), `other` (needs a note <= 200). Take-down is final for that file: bytes deleted, `sha256`/`pixelSha256` kept, template reverts to its built-in fallback (`artId = NULL`), awards stay untouched, the organizer owners and admins get an essential bilingual notice with the reason in words, an `AuditLog` row records actor, reason and before/after, and the organizer may upload a different file. FitFlex also sets its own art (admin upload for an organizer who asks) through the same service with `reviewState = 'reviewed'` and an admin rights confirmation. A repeat takedown count per organizer shows in the queue (three in 30 days highlights the organizer for suspension review; no automatic suspension).

**Faces, trademarks and copyright (member-facing, rule 6 area and privacy callout).** Partner media allowed faces on the basis that it was partner-facing; medal art is shown to **other members** and is shareable, so: (a) the upload dialog states in plain words not to include photos of people unless they agreed and not to use other brands' logos without permission, (b) the **organizer rights confirmation** is a required checkbox stored with version, user and time: EN "I made this design or have the right to use it. It does not use another brand's logo or an identifiable person's picture without permission. FitFlex may show it to participants in the app." SW "Nimetengeneza muundo huu au nina haki ya kuutumia. Hauna nembo ya chapa nyingine wala picha ya mtu anayetambulika bila ruhusa. FitFlex inaweza kuuonyesha kwa washiriki kwenye app." Text version `2026-10-29.s6draft1`, status `draft_pending_counsel` (same convention as `PARTNER_CONFIRMATION`); (c) no organizer partner terms exist yet (follow-up S2), so this checkbox is the **only copyright warranty** until counsel adds it to organizer terms: it must not be presented as legal protection, and the event cannot rely on it for sponsor logos; (d) `person_request` take-downs are honoured without argument, and the file hash blocks re-upload; (e) the owner decision "faces allowed, revisit before member-facing" is **triggered by this slice**: flagged in §18 so the owner can restrict faces (a text rule only, there is no face detection) before `EVENTS_MEDAL_ART` is switched on; (f) the artwork never contains participant data: the share card (below) is composed on the phone and includes no name or time unless the member chooses.

**Portal UX (Medals panel, §9.2).** Each medal card shows its current art (custom or built-in) with a source chip ("Your design" / "FitFlex design"), a status chip for custom art (Live / Under review by FitFlex is **not** shown: show-now means no waiting; "Taken down" with the reason when applicable), and actions **Upload design**, **Replace**, **Use a FitFlex design**, **Remove**. The **Upload design** dialog: file input (PNG, JPEG or WebP, up to 2 MB, at least 512 x 512), a square crop step (reuse `image-upload.tsx` if it supports an aspect ratio; otherwise add a small `SquareCropper` and confirmation 22 settles it) with a circular preview mask and the line "Your design is shown in a circle", alt text `Input`s EN and SW (optional; blank uses the generated description), the faces/brands notice, the **rights checkbox** (required), then **Upload** (loading state; double submit prevented; an `Idempotency-Key` per attempt). Errors map code -> plain sentence (§12.1). A taken-down card shows a danger `Alert` with the reason and "Upload a different design"; the card shows the built-in fallback meanwhile.

**Member UX (mobile).** `MedalBadge` shows the custom `m256` in grids and `m512` in detail (circular mask, `BoxFit.cover`, transparent corners kept) with a built-in asset placeholder while loading and as the permanent fallback on 404/error/offline-uncached, so a medal never appears blank. Detail sheet adds "Design by {organizer name}" (organizer display name, not a person's name) and, for custom art, a small "Report this image" text button that opens FitFlex support with the art id (feeds the `person_request`/`rights` take-down path). **Share:** the share card is rendered on the device (`RepaintBoundary` to PNG) from the medal art, medal name, event name and category and the FitFlex wordmark; the member's name and time are off by default behind a toggle "Include my time"; shared via the system share sheet (**real device**). The shared image carries no metadata beyond what the renderer writes.

**Accessibility.** Portal: the preview `<img>` has `alt` = the organizer's alt text for the viewer's language, else the generated "{medal name} medal, {tier}"; the crop control is keyboard operable (arrow keys move, +/- zoom) and has a text alternative (numeric inputs for position and zoom); upload errors use `role="alert"`; the status chips carry text. Mobile: `Semantics(label:)` = alt text or "{medal name}, {event}, {category}, awarded {date}"; decorative duplicates excluded from the tree; the "Report this image" and Share buttons are >= 48 dp with labels.

**Privacy and data callouts.** Bytes live in the database (`bytea`) like partner media, so they are covered by the database's backups and access controls and are really deleted on replace, remove and take-down (backups age out by their own schedule, to state to counsel). EXIF/GPS are stripped on ingest. No third-party image host, CDN or remote URL is involved. Organizer deletion is blocked (D53), so art of a deleted organizer is not a case; if an organizer is purged later, `purgedAt` follows the partner-media rule. Art is not part of the organizer roster export or any webhook/API payload (the API exposes only `artSource: 'custom'|'builtin'` on medal templates if at all; no URLs).

---

## 8. API contract (D5 envelope `{ error: code, ...extra }`, camelCase, `X-Request-Id`; every route 404 `feature_disabled` when its flag is off)

Common: money fields (only `valueTzs` on reward definitions) are integer whole TZS; instants are ISO UTC; durations are milliseconds. Cursor pagination `{ items, nextCursor }`, `limit` default 50, max 200. Errors added by this slice: `400 invalid_request | invalid_cursor | csv_invalid | idempotency_key_required`, `403 forbidden_role | organizer_suspended`, `404 event_not_found | registration_not_found | result_not_found | not_found`, `409 idempotency_key_reused | request_in_progress | preview_stale | result_changed | already_released | template_locked | dispute_open | dispute_window_closed | run_already_linked | activity_already_linked | already_claimed | reward_unavailable | not_enough_units | organizer_owner`, `413 payload_too_large`, `422 validation_failed { fields } | run_outside_window { window } | distance_too_short { measuredMeters, requiredMeters } | activity_not_recorded_in_app | event_not_open_for_results | value_not_allowed_yet | source_not_allowed`, `429 rate_limited { retryAfterSeconds }`.

### 8.1 Organizer (JWT; `requireEventsResults`, organizer guards as in S5, roles per §2)
| Method + path | Roles | Purpose |
|---|---|---|
| `GET /organizer/events/:id/results/summary` | owner, admin, timing | `{ perCategory: [{ categoryId, name, distanceMeters, confirmed, finished, dnf, dns, dq, pending, rejected, noResult, flagged, release: { stage: 'none'|'provisional'|'official', releasedAt, releasedBy { name } }, disputesOpen }], disputesOpen, importsCount, settings { timeBasis, cutoffMinutes, disputeWindowHours, publicNames } }` |
| `GET /organizer/events/:id/results?categoryId&status&q&flag&cursor&limit` | owner, admin, timing | rows `{ registrationId, displayName (full name for confirmed), bibNumber, categoryId, categoryName, resultId, revision, finishStatus, verificationStatus, stage, sourceType, sourceLabel, netElapsedMs, gunElapsedMs, elapsedMs, overallRank, categoryRank, withinCutoff, flags[], disputeOpen, updatedAt }` and `counts` |
| `POST …/results/imports/preview`, `POST …/results/imports` | owner, admin, timing | §6.2 |
| `GET …/results/imports?cursor` | owner, admin, timing | applied imports `{ id, fileName, sourceType, sourceLabel, rowCount, createdCount, revisedCount, unchangedCount, createdBy { name }, createdAt }` |
| `PUT …/results/:registrationId` | owner, admin, timing | manual entry (§6.3) |
| `GET …/results/:registrationId` | owner, admin, timing | detail with revisions `[{ revision, finishStatus, verificationStatus, netElapsedMs, gunElapsedMs, sourceType, reasonCode, by { name }, at }]`, linked-run summary `{ distanceMeters, elapsedMs, checks, flags }` (no route), dispute history |
| `POST …/results/:resultId/verify` / `reject` / `correct` / `disqualify` | owner, admin | §6.3, §6.6 |
| `POST …/results/verify-bulk/preview`, `POST …/results/verify-bulk` | owner, admin | §6.3 |
| `POST …/results/release/preview`, `POST …/results/release`, `POST …/results/release/withdraw` | owner, admin | §6.4 |
| `GET …/results/disputes?status`, `POST …/results/disputes/:disputeId/resolve { outcome: 'upheld'|'rejected', note, correction? }` | owner, admin | §6.7 (when `upheld` with `correction`, one transaction) |
| `PATCH /organizer/events/:id/results-settings { timeBasis?, cutoffMinutes?, disputeWindowHours?, publicNames? }` | owner, admin | writes `resultsPolicy` and per-category `resultRules`; refused after the first official release except extending the dispute window (`template_locked` analogue: 409 `settings_locked`) |
| `GET/POST /organizer/events/:id/medal-templates`, `PATCH …/:templateId`, `GET …/:templateId/preview` | owner, admin (read: timing) | §7.1 |
| `POST …/medal-templates/:templateId/art` (raw image body), `PATCH …/art { altText }`, `DELETE …/art`, `GET …/art/preview?w=240\|480` | owner, admin (preview: timing) | §7.7 (needs `EVENTS_MEDAL_ART`) |
Every write: `Idempotency-Key` (8 to 100 chars), `requestId` in the audit row.

### 8.2 FitFlex admin (portal admin, scope `events`)
Medal art moderation: `GET /admin/medal-art?reviewState&status&cursor`, `GET /admin/medal-art/:id/preview?w=`, `POST /admin/medal-art/:id/reviewed`, `POST /admin/medal-art/:id/take-down { reason, note? }` (§7.7). `GET /admin/events/:id/results/summary` and `…/results` (same shapes, read only), `POST /admin/events/:id/results/:resultId/correct|disqualify` (reason required, `expectedRevision`), `POST /admin/events/:id/results/disputes/:disputeId/resolve` (only when open > 7 days or organizer suspended). Reward desk: `GET/POST/PATCH /admin/reward-definitions`, `POST /admin/reward-definitions/:id/pause|end`, `GET /admin/reward-ledger?userId|definitionId&cursor` (names masked to first name + last initial; no contact data), `GET /admin/reward-summary` (per definition: earned, redeemed, expired, reversed, capUsed, `needsReview`), `POST /admin/reward-redemptions/lookup`, `POST /admin/reward-redemptions/:id/redeem|cancel`, `GET /admin/event-award-tasks?state=failed`, `POST …/:id/retry`. Every action audited with actor, reason, before/after.

### 8.3 Member app (JWT member)
| Method + path | Purpose |
|---|---|
| `GET /me/event-registrations/:id/result` | `{ registrationId, eventId, eventTitle, eventType, categoryId, categoryName, distanceMeters, bibNumber, stage, viewer: 'participant'|'purchaser_status_only', result: null | { id, revision, finishStatus, verificationStatus, sourceType, sourceLabel, netElapsedMs, gunElapsedMs, elapsedMs, overallRank, categoryRank, finishersInCategory, withinCutoff, verifiedAt, correctedAt, reasonCode, correctionNote, personalBest { isPersonalBest, previousBestElapsedMs|null, basis: 'same_distance_and_route_type' } }, release { stage, releasedAt }, dispute: null | { id, status, createdAt, resolvedAt, resolutionNote, canRaise, windowEndsAt }, visibility { current, canChange, allowed[], reason? }, runLinks: [{ id, linkType, matchStatus, distanceMeters, movingSeconds, elapsedMs, flags[], activityId|null, startedAt, canUnlink }], medals: [MedalAward], rewardsEarned: [RewardEntitlement] }`; when `viewer = purchaser_status_only` only `stage` and `finishStatus` are returned. Cacheable for offline (§10.3) |
| `GET /me/event-results?cursor` | the member's own results across events (official only, newest first) for history and PB lines |
| `POST /me/event-registrations/:id/runs` | create-and-link: body `{ clientRef, segments, notes?, shareWith? }` (the same body as `POST /me/activities/runs` plus `clientRef`) -> 201 `{ link, activity, result|null }`; claims the link row (`activityId` NULL) first, then calls the existing `recordRun`, then fills the link, so a crash in between is repaired by replaying with the same `clientRef` |
| `POST /me/event-registrations/:id/run-links` | link an existing run: `{ activityId }` + `Idempotency-Key` -> 201 `{ link, result|null }` |
| `GET /me/event-registrations/:id/run-links` / `DELETE …/:linkId` | list / unlink (§5.5) |
| `PUT /me/event-registrations/:id/results-visibility { visibility }` | 200 `{ visibility }`; 422 `visibility_not_allowed` for minors choosing `standard`; idempotent |
| `POST /me/event-registrations/:id/result/disputes` / `DELETE …/disputes/:disputeId` | raise (§6.7) / withdraw |
| `GET /events/:eventId/results?categoryId&q&cursor&limit` | the board (signed-in members; `EVENTS_RESULTS_PUBLIC`): `{ event { title, eventType, timezone }, release { stage, releasedAt }, categories[…], items: [{ rank, bibNumber, displayName (per visibility), elapsedMs, finishStatus, stage, sourceType, badges[] ('corrected','under_review') }], mine: { rank, bibNumber }|null, nextCursor }`. Rows with `hidden`, minors and unreleased categories are absent or bib-only; DQ/DNF rows show status without time; `q` searches bib or the visible name only |
| `GET /me/achievements` | `{ medals: [MedalAward], achievements: [UserAchievementView], removed: [{ kind, id, title, reasonCode, revokedAt }] }` |
| `GET /me/reward-ledger?cursor` | entries `{ id, entryType, rewardDefinitionId, titleOf, units, sourceType, sourceLabelCode, occurredAt, reverses|null }` (own only; units are +1/-1, **no balance field named points**) |
| `GET /me/event-rewards` | wallet `{ available: [{ definitionId, title, terms, units, nextExpiry, redeemMode, canClaim }], redemptions: [{ id, definitionId, title, status, code|null, expiresAt, redeemedAt }], expired: […] }` (named so it cannot be confused with `GET /me/rewards`) |
| `POST /me/reward-redemptions` | claim (§7.6); 201 `{ redemption }` (`code` present for `perk` while `reserved`); `GET /me/reward-redemptions/:id` re-shows the code while `reserved` |
`MedalAward = { id, eventId, eventTitle, categoryName|null, templateId, tier, name{en,sw}, description{en,sw}, art { source: 'custom'|'builtin', artId|null, revision|null, artKey, altText{en,sw}|null }, status ('awarded'|'revoked'), awardedAt, revokedAt|null, reasonCode|null, resultSummary { rank|null, elapsedMs|null } }`.
Existing endpoint additions (additive, rule 6 callout): `GET /events/options` gains `results: { enabled, runs, public, rewards, medalArt }` and `runs: { toleranceBps, maxDaysAfter }`; `GET /events/:id` gains `results: { stage, releasedAt, categories: [{ id, stage }] }` (public fields only); `GET /me/event-registrations/:id` and `GET /me/event-registrations` rows gain `resultStage`, `resultsVisibility`, `medalsCount`.

### 8.4 Organizer API (`/v1/organizer`, API-key callers; extends S5 §5; rule 6, owner reviews)
- **Scopes:** `results:write` becomes selectable (was `scope_not_available`), `results:read` is new. Both need `registrations:read` for lookups. `results:write` is **High risk** in the portal scope picker with the line "Can submit provisional results for the selected events. It cannot verify or publish them." No API scope can verify, release, correct or disqualify (D46). Sandbox clients: reads from fixtures (a built-in sandbox result set for `evt_sandbox`: 25 fake runners, three statuses), writes validated and answered but persist nothing, `X-FitFlex-Sandbox: true`.
- **Endpoints** (each needs `Idempotency-Key` on writes; per-client rate limit shared; field minimisation: ids, bib, status, times, ranks; **no names**, no contact data):
| Method + path | Scope | Purpose |
|---|---|---|
| `GET /events/:eventId/results?categoryId&status&updatedSince&cursor` | `results:read` | `{ items: [{ registrationId, resultId, revision, bibNumber, categoryId, finishStatus, verificationStatus, stage, sourceType, netElapsedMs, gunElapsedMs, elapsedMs, overallRank, categoryRank, updatedAt }], nextCursor }` |
| `GET /events/:eventId/results/releases` | `results:read` | release history `[{ categoryId, stage, action, releasedAt, resultCount }]` |
| `POST /events/:eventId/results/imports` | `results:write` | `{ sourceLabel?, timeBasis?, rows: [{ clientRef, bib | registrationId, status?, netTime?, gunTime?, category? }] }` max 500 rows per call, `?dryRun=true` validates only; response per row `{ clientRef, ok, resultId|null, action: 'created'|'revised'|'unchanged', error|null }`; **not atomic across rows** (a timing system sends batches; each row is its own transaction; the `Idempotency-Key` covers the whole call); results are always `sourceType = 'timing_provider'`, `pending_verification` (settled for DNF/DNS), attributed to `submittedByApiClientId`; rows for verified results answer `already_official` |
- Event restriction (`eventIds`) and the 404-never-403 rule apply (S5 §5.3). Event must be `in_progress|completed` (409 `event_not_open_for_results`).
- OpenAPI document and fixtures extended (S5 §5.5): the contract-test rule "every mounted `/v1` route has an operation" now includes the three routes above.

### 8.5 Webhooks (extends S5 §7.1; closed allowlist; ids only; `EVENTS_WEBHOOKS` and `EVENTS_RESULTS` both on)
| Type | When | `data` (no names, times or contact data; the integration fetches authorised fields with the results API) |
|---|---|---|
| `result.verified` | a result becomes `verified` (PRD API-011) | `{ registrationId, resultId, revision, finishStatus }` |
| `result.published` | an official or provisional release is committed | `{ eventId, categoryId|null, stage, releasedAt, resultCount }` |
| `result.corrected` | a correction or disqualification commits | `{ registrationId, resultId, revision, previousRevision, finishStatus, material: true }` |
| `result.disputed` | a dispute is raised or resolved | `{ registrationId, resultId, disputeId, status: 'open'|'upheld'|'rejected'|'withdrawn' }` |
Same envelope, signing, retries and delivery log as S5. Each type has a projector allowlist. Subscriptions are explicit (no wildcards). Medal and reward events are **not** webhooks (they belong to the participant). Event ordering is not guaranteed; consumers use `revision`. Outbox rows are written in the same transaction as the state change (the D43 rule).

### 8.6 Notifications API
No new route: server pushes through `notify` (§11).

---

## 9. Portal (`fitflex-portal`)

### 9.1 Navigation, routes, flags
- `EventView` gains `'results'`; `EventViewTabs` shows **Results / Matokeo** for owner, admin, timing when `useEventsOptions().results.enabled` and the event status is `in_progress`, `completed` or `archived` (before the event the tab is hidden; the deep link shows the "opens when the event starts" state). A red dot (not colour only: the tab label gets a count "Results (3)") shows open disputes for owner/admin.
- Deep links: `/organizer/events?event=<id>&view=results[&section=overview|import|results|disputes|medals|settings][&registration=<id>][&category=<id>]`. Back returns to the previous section, then to the event's details. After a completed action the user stays on the page (import -> results table filtered to "needs review"; release -> overview with a success banner).
- Organizer overview card gains "Results to review: N" (owner/admin) when any event has pending results.
- Admin: `/admin/events` event drawer gains a read-only "Results" block (per-category stage and counts) and exception actions; `/admin/rewards` (new, `events` scope) with tabs **Definitions**, **Redemptions**, **Ledger**, **Tasks**.
- Portal reads availability from `GET /events/options` (`results.*`), never the build flag alone. `NEXT_PUBLIC_EVENTS_MODULE` is the only build-time gate.

### 9.2 Results tab layout
Sections via `Segmented` (scrolls horizontally at 375 px, active section scrolled into view): **Overview**, **Import**, **Results**, **Disputes**, **Medals**, **Settings**.

**Overview (desktop >= 1024 px).** `PageHeader` (event title, status badge), then one `Card` per category in a 2-column grid: category name + distance; a stage chip (None / Provisional / Official); counts as `Stat`s (Finished, DNF, DNS, DQ, Needs review, No result); a thin progress bar "settled 412 of 430" with text alternative; flags count "7 need individual review"; buttons by role: **Release provisional**, **Release official**, **Approve all clean** (owner/admin); timing sees counts only plus **Import**. Above the grid: a stepper-style status line "1 Import -> 2 Review -> 3 Release -> 4 Medals" showing the current step (text and `aria-current`). Phone: single column cards, buttons full width 56 px.

**Import.** A single `Card`: sources `Radio` (Timing company file / Entered by our team), optional provider name `Input` (60), time basis `Select` (Net / Gun, defaults from settings), file input (CSV only, <= 1 MB; filename shown), link **Download sample CSV** and a collapsed "Columns we read" list. After choosing a file, **Check file** runs preview; result panel: `{ok} ready, {problems} to fix, {warnings} notes`, counts by status, "N registered people have no row in this file" with a link to filter them; problems `DataTable` (Line, Bib, Problem in words, How to fix); **Apply** enabled only when problems = 0 (button states the count: "Add 412 results"); success toast + `aria-live` summary and a link "Review results". Past imports table below (name, rows, who, when). The timing role sees this section as its main page.

**Results table.** `DataTable` (`label="organizer.results.tableLabel"`, server cursor with "Load more"): Bib, Name, Category, Status badge (text + icon), Time (`h:mm:ss`), Source, Rank, Flags (chips with text), Updated; row click opens the **Result drawer** (right panel, full screen on phone): current numbers, source and provider, revision list (who/when/why), linked FitFlex run summary (distance, moving time, checks, flag explanations; "The route is private and is not shown"), dispute history, actions by role: Verify, Reject (reason `Select` + optional note), Correct (dialog), Disqualify (dialog), Mark DNF/DNS (timing may enter provisional). Filters: category, status (`Needs review`, `Verified`, `Rejected`, `DNF`, `DNS`, `DQ`, `No result`), flag, search (bib or name, min 2 chars). Bulk action bar when "Needs review" is filtered: **Approve all clean (N)** opens the preview dialog (count, excluded flagged count) and applies.
- **Correct dialog:** current values read-only, new net time / gun time inputs (`H:MM:SS`, inline validation), finish status `Select`, reason `Select` (Timing error, Wrong bib, Late finish line data, Other) + required note `Textarea` (10 to 300, counter); shows "This will change ranks and may change medals." and a computed preview "Rank 12 -> 14; medals: Finisher kept"; confirm button names the action. 409 `result_changed` -> "Someone else changed this result. Reload."
- **Release dialog:** scope (category or whole event), stage, the preview counts (finished, DNF, DNS, DQ, no result, unsettled), checkboxes **Mark runners with no result as DNS** and **Leave unsettled results out**, the line "Official results can't be withdrawn. Mistakes are fixed as corrections that everyone can see.", a field **Type the number of results being published** and a danger-styled confirm button, disabled until valid. Focus starts on the heading, then the checkboxes, then the number field.

**Disputes.** List (`DataTable`): Bib, Name, Reason, Raised, Window ends, Status; empty "No disputes". Detail panel shows the result, the participant's reason and note, linked-run summary, and three actions (Correct the result, No change needed, Disqualification stands) with required note; saving shows the outcome toast and notifies the participant.

**Medals.** Cards per template: art (custom or built-in, with a source chip), tier, name EN/SW, rule summary ("Finish the 21K within the cut-off"), scope, awarded count (live), status. **Add medal** dialog: name EN + SW `Input`s (SW blank warns "Swahili text missing; members will see English"), description, artwork block (**Upload design** or **Use a FitFlex design** from a radio group of 8 images with text names, 56 px tiles; the upload dialog is described in §7.7), tier `Select`, rule `Select` (Finish / Top N / Under a time) with the parameters, category `Select` (All / one). Locked templates show a lock icon with "Rules can't change after official results". Preview line "About 380 people would get this" before save on a released scope.

**Settings.** `resultsPolicy` (dispute window days `Select` 1/3/7/14/30, names on the board `Radio` initial/bib-only) and per-category time basis (Net/Gun) and cut-off minutes. Locked after the first official release except extending the dispute window.

### 9.3 States (all sections)
Loading (skeletons for cards and table); empty (`No results yet. Import a file or enter results by hand.`); error + retry; forbidden role (`Forbidden`, tab hidden); feature off (`Results aren't available yet`, from `results.enabled=false`); event not started / cancelled (`Alert`, actions disabled); suspended organizer (read-only banner); offline or 5xx on a write (stays on screen, `Alert` with **Retry** reusing the `Idempotency-Key`); partial (summary failed: cards without counts and a muted notice; table still loads); 429 (message with the time); pending-approval organizer (S2 gating: tab hidden); `preview_stale` ("Registrations changed. Check again."); long Swahili strings wrap, no fixed-width buttons.

### 9.4 Admin reward desk
**Definitions:** `DataTable` (Title, Trigger, Type, Status, Cap used / total, Window), **New reward** dialog with the fields of §7.4 (trigger pickers load events, medal templates, achievement keys; "Value" is shown disabled with "Cash and shop value aren't available yet"; terms EN + SW required; funding note required). Pause/End with `ConfirmDialog`. **Redemptions:** code lookup `Input` (monospace, uppercase, paste-friendly) -> result card (reward, member name masked, status, expiry) with **Mark as used** (note) and **Cancel**; recent redemptions table. **Ledger:** filters by definition, member id, entry type; rows read-only; reversed entries linked. **Tasks:** failed award tasks with Retry. **Medal art:** moderation queue (To review / All / Taken down) with 240 and 480 previews, organizer, event, category, tier, rights confirmation time, **Looks fine** and **Take down** (reason `Select` + note, `ConfirmDialog`), a per-organizer takedown count, and the empty state "Nothing to review". **Summary strip:** earned / redeemed / expired / reversed / `needsReview`, and a "Most earned this week" table (member id + count) for farming review. All admin-typed text gets a Swahili field or a labelled English fallback (S4 rule).

### 9.5 Accessibility and responsive rules (all new portal screens)
Every actionable control has a visible label or `aria-label` (icon-only: "Open result", "Copy code", "Remove"); tables use `label`; dialogs trap focus and return it to the trigger; status = text + icon + colour; errors via `role="alert"` or `aria-describedby`; counts announced in `aria-live="polite"` after apply/release; targets >= 44 px; contrast >= 4.5:1 using existing tokens (text-800 on tone-50); no horizontal page scroll at 375 px (tables scroll inside their labelled region); document titles `"{page} · FitFlex"`; the release number field has `inputmode="numeric"` and an `aria-describedby` to the warning; the built-in design picker is a `radiogroup` with arrow keys and the upload crop is keyboard operable (§7.7).
**Focus order (Results section):** tabs -> section segmented -> filters -> table -> row action buttons; after a drawer closes focus returns to the row; after Apply focus moves to the result summary heading (`tabIndex=-1`).

---

## 10. Mobile (`fitflexmobile`, member)

### 10.1 Routes and entry points (`lib/router.dart`, member `ShellRoute`)
| Route | Screen | Entry points |
|---|---|---|
| `/member/events/registrations/:registrationId/result` | `MemberEventResultPage` | ticket page and registration page ("Your result" card once the event has started), notification deep links, Events page "My results" |
| `/member/events/registrations/:registrationId/runs` | `EventRunLinksPage` | result page, ticket page |
| `/member/events/:eventId/results` | `EventResultsBoardPage` | event detail ("Results" button when `results.stage != none` and `options.results.public`), result page |
| `/member/events/medals` | `MemberMedalsPage` | Events page header "Medals and rewards", result page medal cards, notification |
| `/member/events/rewards` | `MemberRewardWalletPage` | medals page, notification |
Add all to `memberRouteFor` for the new push types (§11). Back goes to the previous screen; from a deep link with no history, to the Events page. After linking a run: back to the result page with the new run card. After claiming a reward: the wallet with the redemption card expanded.

### 10.2 Event run (`EventRunSheet`, `EventRunLinksPage`)
- **Start run for this event** (ticket/registration page, Android only, §5.6): opens the existing record-run page with an `eventRegistrationId` argument and a header chip "Recording for {event}". `clientRef` is generated at start and persisted with `run_in_progress_v1`. On finish the Save button label is **Save and add to event**; the save calls `POST /me/event-registrations/:id/runs`; if it fails (offline) the existing retry path keeps the run and the same `clientRef` is reused (**backend/mobile confirmation 5**). Saving always saves the run even if the link is refused: the sheet then explains the refusal in words and offers "Keep the run without adding it to the event".
- **Add a recorded run** (all platforms): a sheet listing the member's last 10 running activities from the last 7 days (`source = fitflex`) that fall inside the window, each row = date, distance, moving time, and a state chip: Available / Doesn't reach {distance} / Outside the event time / Already added. Tapping an available row opens a confirm sheet that shows exactly what happens ("This run will be sent to the organizer for {event} to review." for virtual; "This run will be shown next to your official result. It is not sent to the organizer." for in-person) with **Add this run**.
- **Run card** (result page and links page): date, distance, moving time, the comparison line when an official result exists ("Official time is 4:12 slower than your FitFlex run") labelled not official, flags only for the owner's own explanation in words ("Your run looks unusually fast. The organizer will check it."), **Remove from event** (secondary).
- **States:** loading, empty ("No runs added yet"), error, offline ("You're offline. Your run is saved on this phone and will be added when you're connected." for the pending state) , permission denied (settings link), not supported (§5.6), role restricted (purchaser who isn't the participant: explanatory text, no actions), event not started ("Opens {date}"), event ended and beyond the grace window ("Adding runs has closed"), cancelled ("This event was cancelled"), pending approval (virtual run awaiting the organizer: chip "Waiting for the organizer").

### 10.3 My result (`MemberEventResultPage`)
**Purpose:** show the participant's result, how official it is, and what it earned.
**Layout, phone (375 px):** `FFPageHeader` (event title, category chip) -> **Result card** (stage chip first: Provisional / Official / Corrected / Under review / Disqualified / Not accepted; big time `1:52:08` in display type with `Semantics` label "Finish time one hour fifty-two minutes eight seconds"; line "Official timing" or the source label; rank line "Rank 12 of 430 in 21K" only when released and ranked; bib "Bib 1042"; PB chip when applicable) -> **What this means** line (one sentence per stage, below) -> **Dispute** row (if `dispute.canRaise`: "Something looks wrong? Ask the organizer to review" -> sheet; if open: "Under review since {date}"; if closed: outcome and note) -> **Your FitFlex run** card(s) -> **Medals earned** (medal badges) -> **Rewards earned** (cards) -> **Who can see my name** row (visibility sheet: Show my name / Show only my bib / Hide me from the results; minors see the fixed state with the reason). **Desktop width (>= 840 px):** two columns: result and what it means left; run, medals, rewards, visibility right.
**Stage lines (EN/SW, §12).** Not published: "Results aren't published yet. We'll tell you when they are." Provisional: "These times may still change." Official: "Verified and published by the organizer." Corrected: "The organizer corrected this result on {date}." Under review: "The organizer is reviewing a question about this result." DNF/DNS: "No finish time recorded." Disqualified: "This result was disqualified. {reason}". Virtual: "Virtual run. Time is moving time recorded by FitFlex GPS."
**First-open consent prompt:** if `visibility.reason = 'ask'` (registration made before the public-results clause) a bottom sheet asks once: **Show my name** / **Show only my bib**; the choice is a PUT; dismissing keeps `bib_only` and asks again next time at most once a week.
**States:** loading (skeleton card), empty/no result (message by event state: before event, event running, finished but not published, published but no result for you: "We have no result for you. If you finished, ask the organizer."), error + retry, offline with cache (`events_cache.dart`: last result shown with "Saved on this phone, updated {time}" and actions that need the network disabled), partial (medals failed to load: card with retry), success, pending-approval (result pending verification inside a provisional release shows the Provisional chip), role-restricted (purchaser: status chip only, explanation "Results for this ticket are shown to the person it belongs to"), unclaimed (claim prompt), registration cancelled/refunded ("Your place was cancelled; no result is shown"), event cancelled.

### 10.4 Results board (`EventResultsBoardPage`)
`FFSegmented` of categories (scrolls), search field (bib or name), list rows: rank, display name or "Runner {bib}", bib, time, status badge; own row pinned at top as "You" when present; rows load by cursor ("Load more"); stage banner "Provisional results" / "Official results" and the board footer "Names appear only for people who chose to show them." DNF/DQ rows show status text in place of time. Empty: "Results aren't published yet." Offline: cached first page labelled "Saved on this phone". Phone: list; >= 840 px: centred 720 px column with sticky category tabs. Row `Semantics`: "Rank 3, bib 1042, Asha M, 1 hour 52 minutes 8 seconds". Not signed in: sign-in prompt (the board is members-only). Flag off: not shown.

### 10.5 Medals and achievements (`MemberMedalsPage`) and rewards wallet (`MemberRewardWalletPage`)
- **Medals page:** `FFSegmented` Medals / Achievements. Medals: grid (2 columns phone, 4 desktop) of `MedalBadge` (the organizer's own artwork with the built-in design as fallback, §7.7; name in the viewer's language, event and date, "Revoked" overlay text for removed ones in a separate "Removed" section with the reason in words). Tapping opens a detail sheet: art large, why it was earned ("Finished the 21K in 1:52:08 · Official"), event link, Share (device-rendered card, name and time off by default, real device: share sheet), "Report this image" and the text "Medals are awarded only for verified results." Achievements: list with title, progress for count-based ones when not yet earned (`x of 3`, computed from official results), earned date.
- **Wallet:** top card "Available rewards" lists each definition with units, terms link, expiry date, **Claim** (opens `RewardRedeemSheet`: terms in the viewer's language, what claiming does, confirm). For `certificate`: on confirm shows the certificate card (name, event, result line, date) and **Share/Save** (real device). For `perk`: shows the code in a large monospace block with a copy button, instructions, expiry, and status chip Reserved; after FitFlex verifies: Used. Below: History (earn, claim, expired, reversed entries in plain words with dates; no balance number). Empty: "No rewards yet. Finish an event to earn some." No "points" anywhere (D44).
- **States:** loading, empty, error + retry, offline (cached, Claim disabled with the reason), partial, success, expired ("This reward expired on {date}"), unavailable (`reward_unavailable`: "This reward is no longer available"), not enough units, role-restricted (none), flag off (entry points hidden).

### 10.6 Accessibility, touch and layout (all new mobile screens)
Targets >= 48 dp (chips and rows included); every actionable control has `Semantics(label:)` (medal tile: "Medal, Finisher, 21K, awarded 14 March, double tap for details"; stage chip: the full word; copy button "Copy reward code"); `Semantics(liveRegion: true)` on the result stage after a refresh and on the claim outcome; text scale to 200 % without clipping (cards grow); Swahili strings wrap, no fixed widths; contrast follows `FFTokens` (stage chips are `FFBadge` tone + icon + text, never colour only); focus order top to bottom as laid out; Flutter web exposes the semantics tree, so each page sets a title via the router; reduced-motion respected (no confetti: a static medal reveal). Hero flags: result page uses `FFPageHeader` (no hero dependency), designed for both hero states.

### 10.7 Mobile tests (`test/events/*`)
Model parsing (`event_result`, `event_medal`, `event_reward`); `member_event_result_page_test`: each stage renders label + line + Semantics, purchaser status-only view, offline cache label, visibility prompt and PUT, dispute sheet; `event_run_links_test`: Android shows Start run, iOS/web shows the fallback + Add recorded run, window/distance chips, unlink; `results_board_test`: own row pinned, hidden/minor rows, DNF/DQ rows, pagination; `member_medals_page_test`: awarded vs removed, achievements progress; `reward_wallet_test`: claim certificate, claim perk, expired, error mapping, no "points" string anywhere; i18n parity `keysOf('en') == keysOf('sw')` for all new keys; `memberRouteFor` cases for the new push types; 200 % text scale and 320 dp Swahili no-overflow checks.

---

## 11. Notifications (COM-002, COM-003, COM-004)

`notify(userId, { id, type, title, body, data })` with bilingual `data.titleEn/Sw` as in S4; the `id` is deterministic so retries never duplicate. "Essential" notices cannot be switched off (they change money-like standing or a published result); "optional" follow the member's existing notification preference (COM-004).
| # | Type | Id pattern | To | Essential | EN | SW (draft) | Opens |
|---|---|---|---|---|---|---|---|
| 1 | `event_result_published` | `evres:<registrationId>:<stage>` | participant | optional | Results are out / Your result for {event} is {stage}. | Matokeo yametoka / Matokeo yako ya {event} ni {stage}. | result |
| 2 | `event_result_corrected` | `evres:<resultId>:<revision>` | participant | **essential** | Your result was corrected / The organizer corrected your result for {event}. | Matokeo yako yamesahihishwa / Mwandaaji amesahihisha matokeo yako ya {event}. | result |
| 3 | `event_result_rejected` | `evrej:<resultId>:<revision>` | participant (virtual run) | essential | Run not accepted / Your run for {event} was not accepted. See why. | Mbio hazikukubaliwa / Mbio zako za {event} hazikukubaliwa. Angalia sababu. | result |
| 4 | `event_dispute_update` | `evdis:<disputeId>:<status>` | participant; organizer owner on `open` | essential | Question about your result: {outcome} | Swali kuhusu matokeo yako: {outcome} | result / Results tab |
| 5 | `event_medal_awarded` | `evmed:<awardId>:awarded` | participant | optional | New medal / You earned the {medal} medal. | Medali mpya / Umepata medali ya {medal}. | medals |
| 6 | `event_medal_revoked` | `evmed:<awardId>:revoked:<revokedAt>` | participant | **essential** | A medal was removed / The {medal} medal was removed because {reason}. | Medali imeondolewa / Medali ya {medal} imeondolewa kwa sababu {reason}. | medals |
| 7 | `event_reward_earned` | `evrw:<entryId>` | participant | optional | New reward / You earned: {reward}. | Zawadi mpya / Umepata: {reward}. | wallet |
| 8 | `event_reward_reversed` | `evrw:<entryId>` (reverse entry) | participant | essential | A reward was removed / {reward} was removed because {reason}. | Zawadi imeondolewa / {reward} imeondolewa kwa sababu {reason}. | wallet |
| 9 | `event_medal_art_taken_down` | `evart:<artId>:taken_down` | organizer owners and admins | essential | Medal design removed / Your medal design for {event} was removed: {reason}. | Muundo wa medali umeondolewa / Muundo wako wa medali wa {event} uliondolewa: {reason}. | Medals panel |
Bulk release sends are in-app only above `EVENTS_RESULTS_PUSH_MAX` (default 500 recipients per release) to protect the notifier (confirmation 8); smaller releases also push. Organizer-side notices: open dispute (in-app, to owner/admin), release success. Push needs a real device to verify.

---

## 12. Copy: i18n keys (EN and SW draft; native review needed)

Reason codes (`reasonCode`) map to words through `events.result.reason.*`; the server returns codes and the optional organizer note as typed (not translated; the UI labels it "Note from the organizer"). Glossary additions: result = matokeo, official = rasmi, provisional = ya awali, corrected = yamesahihishwa, dispute = pingamizi, medal = medali, achievement = mafanikio, reward = zawadi, claim a reward = dai zawadi, rank = nafasi (careful: S3 reserves "nafasi" for roles, D22; use "Nafasi ya {n}" only in the rank line and get the reviewer to confirm, alternative "Cheo"), bib = namba ya mbio (S5 term), cut-off = muda wa kikomo, DNF = Hakumaliza, DNS = Hakuanza, DQ = Amefutiwa.

### 12.1 Portal (`src/lib/i18n.ts`, both maps; all through `t()`)
| Key | EN | SW |
|---|---|---|
| `organizer.events.view.results` | Results | Matokeo |
| `organizer.results.tableLabel` | Results table | Jedwali la matokeo |
| `organizer.results.section.overview` / `.import` / `.results` / `.disputes` / `.medals` / `.settings` | Overview / Import / Results / Disputes / Medals / Settings | Muhtasari / Pakia / Matokeo / Pingamizi / Medali / Mipangilio |
| `organizer.results.stage.none` / `.provisional` / `.official` | Not published / Provisional / Official | Haijachapishwa / Ya awali / Rasmi |
| `organizer.results.step` | 1 Import, 2 Review, 3 Release, 4 Medals | 1 Pakia, 2 Kagua, 3 Chapisha, 4 Medali |
| `organizer.results.status.finished` / `.dnf` / `.dns` / `.dq` / `.pending` / `.rejected` / `.noResult` | Finished / Did not finish / Did not start / Disqualified / Needs review / Not accepted / No result | Amemaliza / Hakumaliza / Hakuanza / Amefutiwa / Inahitaji ukaguzi / Haikukubaliwa / Hakuna matokeo |
| `organizer.results.import.title` | Import results | Pakia matokeo |
| `organizer.results.import.source` | Where do these times come from? | Nyakati hizi zinatoka wapi? |
| `organizer.results.import.source.timing` / `.team` | Timing company file / Entered by our team | Faili la kampuni ya muda / Zimeingizwa na timu yetu |
| `organizer.results.import.provider` | Timing company name (optional) | Jina la kampuni ya muda (si lazima) |
| `organizer.results.import.basis` | Time to rank by | Muda wa kupanga nafasi |
| `organizer.results.import.check` | Check file | Kagua faili |
| `organizer.results.import.summary` | {ok} ready, {problems} to fix, {warnings} notes | {ok} tayari, {problems} za kurekebisha, {warnings} maelezo |
| `organizer.results.import.apply` | Add {n} results | Ongeza matokeo {n} |
| `organizer.results.import.unmatched` | {n} registered people have no row in this file. | Watu {n} waliosajiliwa hawamo kwenye faili hili. |
| `organizer.results.import.sample` | Download sample CSV | Pakua CSV ya mfano |
| `organizer.results.problem.bib_not_found` | Bib number not found in this event | Namba ya mbio haipo kwenye tukio hili |
| `organizer.results.problem.bib_duplicate_in_file` | This bib appears twice in the file | Namba hii imejirudia kwenye faili |
| `organizer.results.problem.registration_not_confirmed` | This place is cancelled or unpaid | Tiketi hii imeghairiwa au haijalipiwa |
| `organizer.results.problem.time_invalid` | Time isn't in a format we read (H:MM:SS) | Muda hauko katika muundo tunaosoma (H:MM:SS) |
| `organizer.results.problem.time_missing_for_finisher` | A finisher needs a time | Aliyemaliza anahitaji muda |
| `organizer.results.problem.already_official` | Already has an official result. Use Correct. | Tayari ana matokeo rasmi. Tumia Sahihisha. |
| `organizer.results.problem.category_mismatch` | Category doesn't match this runner's ticket | Kundi halilingani na tiketi ya mkimbiaji |
| `organizer.results.warn.rank_ignored` | Ranks in the file are ignored; FitFlex works them out | Nafasi zilizo kwenye faili hazitumiki; FitFlex huzihesabu |
| `organizer.results.action.verify` / `.reject` / `.correct` / `.disqualify` / `.approveClean` | Verify / Reject / Correct / Disqualify / Approve all clean ({n}) | Thibitisha / Kataa / Sahihisha / Futa matokeo / Thibitisha zote safi ({n}) |
| `organizer.results.flag.implausible_pace` | Pace looks unusually fast | Kasi inaonekana ya juu isivyo kawaida |
| `organizer.results.flag.many_dropped_points` | A lot of GPS points were dropped | Pointi nyingi za GPS ziliondolewa |
| `organizer.results.flag.long_gap` | Long gap with no GPS data | Pengo refu bila data ya GPS |
| `organizer.results.flag.duplicate_route` | Another runner's route looks the same | Njia ya mkimbiaji mwingine inafanana |
| `organizer.results.flag.privateRoute` | The route is private and isn't shown to you. | Njia ni ya siri na haionyeshwi kwako. |
| `organizer.results.correct.title` | Correct this result | Sahihisha matokeo haya |
| `organizer.results.correct.warn` | This changes ranks and may change medals. Everyone can see that it was corrected. | Hii hubadilisha nafasi na inaweza kubadilisha medali. Kila mtu ataona kuwa yamesahihishwa. |
| `organizer.results.correct.reason` | Reason | Sababu |
| `organizer.results.correct.note` | What changed and why (10 to 300 characters) | Nini kilibadilika na kwa nini (herufi 10 hadi 300) |
| `organizer.results.reason.timing_error` / `.wrong_bib` / `.late_data` / `.other` | Timing error / Wrong bib / Late finish-line data / Other | Hitilafu ya muda / Namba isiyo sahihi / Data ya mstari wa kumalizia ilichelewa / Nyingine |
| `organizer.results.release.title` | Publish results | Chapisha matokeo |
| `organizer.results.release.provisional` / `.official` | Publish as provisional / Publish as official | Chapisha kama ya awali / Chapisha kama rasmi |
| `organizer.results.release.warn` | Official results can't be withdrawn. Mistakes are fixed as corrections that everyone can see. | Matokeo rasmi hayawezi kuondolewa. Makosa hurekebishwa kama masahihisho yanayoonekana na kila mtu. |
| `organizer.results.release.markDns` | Mark runners with no result as did not start | Weka wasio na matokeo kama hawakuanza |
| `organizer.results.release.leaveOut` | Leave unsettled results out | Acha matokeo yasiyokamilika |
| `organizer.results.release.type` | Type the number of results being published ({n}) | Andika idadi ya matokeo yanayochapishwa ({n}) |
| `organizer.results.release.done` | Results published | Matokeo yamechapishwa |
| `organizer.results.disputes.title` | Questions about results | Maswali kuhusu matokeo |
| `organizer.results.disputes.empty` | No questions about results. | Hakuna maswali kuhusu matokeo. |
| `organizer.results.disputes.outcome.upheld` / `.rejected` / `.dq` | Correct the result / No change needed / Disqualification stands | Sahihisha matokeo / Hakuna mabadiliko / Kufutwa kunabaki |
| `organizer.results.medals.title` | Medals | Medali |
| `organizer.results.medals.add` | Add medal | Ongeza medali |
| `organizer.results.medals.rule.finish` / `.placing` / `.timeUnder` | Finish the race / Finish in the top {n} / Finish under {time} | Maliza mbio / Maliza kwenye {n} bora / Maliza chini ya {time} |
| `organizer.results.medals.swMissing` | Swahili text missing; members will see English | Maandishi ya Kiswahili hayapo; wanachama wataona Kiingereza |
| `organizer.results.medals.tier` | Medal level | Ngazi ya medali |
| `organizer.results.medals.tier.finisher` / `.gold` / `.silver` / `.bronze` / `.time` / `.other` | Finisher / Gold / Silver / Bronze / Time / Other | Aliyemaliza / Dhahabu / Fedha / Shaba / Muda / Nyingine |
| `organizer.results.art.title` | Medal design | Muundo wa medali |
| `organizer.results.art.source.custom` / `.builtin` | Your design / FitFlex design | Muundo wako / Muundo wa FitFlex |
| `organizer.results.art.upload` / `.replace` / `.remove` / `.useBuiltin` | Upload design / Replace / Remove / Use a FitFlex design | Pakia muundo / Badilisha / Ondoa / Tumia muundo wa FitFlex |
| `organizer.results.art.help` | PNG, JPEG or WebP, at least 512 x 512 pixels, up to 2 MB. Your design is shown in a circle. | PNG, JPEG au WebP, angalau pikseli 512 x 512, hadi MB 2. Muundo wako unaonyeshwa kwenye duara. |
| `organizer.results.art.notice` | Don't include photos of people unless they agreed, and don't use other brands' logos without permission. | Usiweke picha za watu bila ridhaa yao, wala nembo za chapa nyingine bila ruhusa. |
| `organizer.results.art.confirm` | I made this design or have the right to use it. It does not use another brand's logo or an identifiable person's picture without permission. FitFlex may show it to participants in the app. | Nimetengeneza muundo huu au nina haki ya kuutumia. Hauna nembo ya chapa nyingine wala picha ya mtu anayetambulika bila ruhusa. FitFlex inaweza kuuonyesha kwa washiriki kwenye app. |
| `organizer.results.art.alt` | Describe the design (optional) | Eleza muundo (si lazima) |
| `organizer.results.art.crop` | Move and zoom to fit the circle | Sogeza na kuza ili ilingane na duara |
| `organizer.results.art.liveNow` | Your design is now shown to participants. | Muundo wako sasa unaonyeshwa kwa washiriki. |
| `organizer.results.art.takenDown` | FitFlex removed this design: {reason}. A FitFlex design is shown instead. | FitFlex iliondoa muundo huu: {reason}. Muundo wa FitFlex unaonyeshwa badala yake. |
| `organizer.results.art.uploadAnother` | Upload a different design | Pakia muundo tofauti |
| `organizer.results.art.error.svg_not_allowed` | SVG files aren't accepted. Use PNG, JPEG or WebP. | Faili za SVG hazikubaliwi. Tumia PNG, JPEG au WebP. |
| `organizer.results.art.error.unsupported_file_type` | This file type isn't accepted. Use PNG, JPEG or WebP. | Aina hii ya faili haikubaliwi. Tumia PNG, JPEG au WebP. |
| `organizer.results.art.error.animated_not_allowed` | Animated images aren't accepted. | Picha zinazosogea hazikubaliwi. |
| `organizer.results.art.error.corrupt_image` | We couldn't read this image. Try another file. | Hatukuweza kusoma picha hii. Jaribu faili nyingine. |
| `organizer.results.art.error.payload_too_large` | The file is over 2 MB. | Faili ni kubwa kuliko MB 2. |
| `organizer.results.art.error.image_too_small` | The image must be at least 512 x 512 pixels. | Picha lazima iwe angalau pikseli 512 x 512. |
| `organizer.results.art.error.not_square` | The image must be square. Crop it and try again. | Picha lazima iwe mraba. Ipunguze uipakie tena. |
| `organizer.results.art.error.file_not_allowed` | This file was removed before and can't be used again. | Faili hili liliondolewa awali na haliwezi kutumika tena. |
| `organizer.results.art.error.rate_limited` | Too many uploads. Try again later. | Upakiaji mwingi mno. Jaribu tena baadaye. |
| `organizer.results.art.error.busy` | We're busy. Try again in a moment. | Tuna shughuli nyingi. Jaribu tena baada ya muda mfupi. |
| `organizer.results.art.reason.inappropriate` / `.rights` / `.other_brand` / `.person_request` / `.quality` / `.other` | it isn't suitable / it may use someone else's work / it uses another brand's mark / a person asked for it to be removed / it was unclear or misleading / another reason | haifai / inaweza kutumia kazi ya mtu mwingine / ina alama ya chapa nyingine / mtu aliomba iondolewe / haikuwa wazi au ilipotosha / sababu nyingine |
| `admin.medalArt.title` | Medal art | Picha za medali |
| `admin.medalArt.toReview` | To review | Za kukaguliwa |
| `admin.medalArt.looksFine` / `.takeDown` | Looks fine / Take down | Inafaa / Ondoa |
| `admin.medalArt.empty` | Nothing to review | Hakuna cha kukagua |
| `admin.medalArt.takedownCount` | {n} take-downs in 30 days | Uondoaji {n} ndani ya siku 30 |
| `organizer.results.medals.locked` | Rules can't change after official results | Masharti hayabadilishwi baada ya matokeo rasmi |
| `organizer.results.medals.preview` | About {n} people would get this medal | Takriban watu {n} watapata medali hii |
| `organizer.results.settings.disputeWindow` | How long runners can ask a question | Wakimbiaji wanaweza kuuliza kwa muda gani |
| `organizer.results.settings.names` | Names on the results board | Majina kwenye ubao wa matokeo |
| `organizer.results.settings.names.initial` / `.bib` | First name and last initial | Jina la kwanza na herufi ya jina la mwisho |
| `organizer.results.settings.cutoff` | Cut-off time (minutes) | Muda wa kikomo (dakika) |
| `organizer.results.empty` | No results yet. Import a file or enter results by hand. | Hakuna matokeo bado. Pakia faili au ingiza matokeo kwa mkono. |
| `organizer.results.notStarted` | Results open when the event starts. | Matokeo hufunguka tukio linapoanza. |
| `organizer.results.unavailable` | Results aren't available yet. | Matokeo bado hayapatikani. |
| `admin.rewards.title` | Rewards | Zawadi |
| `admin.rewards.new` | New reward | Zawadi mpya |
| `admin.rewards.valueLocked` | Cash and shop value aren't available yet. | Thamani ya fedha au duka bado haipatikani. |
| `admin.rewards.lookup` | Reward code | Msimbo wa zawadi |
| `admin.rewards.markUsed` | Mark as used | Weka kama imetumika |
| `admin.rewards.needsReview` | Needs review | Inahitaji ukaguzi |

### 12.2 Mobile (`lib/shared/i18n.dart`, both maps; parity test)
| Key | EN | SW |
|---|---|---|
| `events.result.title` | Your result | Matokeo yako |
| `events.result.stage.provisional` / `.official` / `.corrected` / `.underReview` / `.disqualified` / `.rejected` / `.none` | Provisional / Official / Corrected / Under review / Disqualified / Not accepted / Not published | Ya awali / Rasmi / Yamesahihishwa / Yanakaguliwa / Amefutiwa / Haikukubaliwa / Haijachapishwa |
| `events.result.line.none` | Results aren't published yet. We'll tell you when they are. | Matokeo bado hayajachapishwa. Tutakujulisha yakitoka. |
| `events.result.line.provisional` | These times may still change. | Nyakati hizi bado zinaweza kubadilika. |
| `events.result.line.official` | Verified and published by the organizer. | Yamethibitishwa na kuchapishwa na mwandaaji. |
| `events.result.line.corrected` | The organizer corrected this result on {date}. | Mwandaaji alisahihisha matokeo haya tarehe {date}. |
| `events.result.line.underReview` | The organizer is reviewing a question about this result. | Mwandaaji anakagua swali kuhusu matokeo haya. |
| `events.result.line.dnf` / `.dns` | No finish time was recorded. / You didn't start this event. | Hakuna muda wa kumaliza uliorekodiwa. / Hukuanza tukio hili. |
| `events.result.line.dq` | This result was disqualified. {reason} | Matokeo haya yamefutwa. {reason} |
| `events.result.line.virtual` | Virtual run. The time is moving time recorded by FitFlex GPS. | Mbio pepe. Muda ni muda wa kukimbia uliorekodiwa na GPS ya FitFlex. |
| `events.result.source.timing_provider` / `.organizer_verified` / `.fitflex_gps` / `.manual_unverified` | Official timing / Confirmed by organizer / Virtual run, GPS / Self-reported, not verified | Muda rasmi wa mbio / Imethibitishwa na mwandaaji / Mbio pepe, GPS / Imeripotiwa na mshiriki, haijathibitishwa |
| `events.result.rank` | Rank {rank} of {total} in {category} | Nafasi ya {rank} kati ya {total} kwenye {category} |
| `events.result.pb` | Personal best at this distance | Muda wako bora kwa umbali huu |
| `events.result.bib` | Bib {number} | Namba {number} |
| `events.result.time` | Finish time | Muda wa kumaliza |
| `events.result.note` | Note from the organizer | Ujumbe kutoka kwa mwandaaji |
| `events.result.empty.beforeEvent` | Results appear after the event. | Matokeo yanaonekana baada ya tukio. |
| `events.result.empty.notPublished` | The event is over. Results aren't published yet. | Tukio limeisha. Matokeo bado hayajachapishwa. |
| `events.result.empty.noneForYou` | We have no result for you. If you finished, ask the organizer. | Hatuna matokeo yako. Ukimaliza, muulize mwandaaji. |
| `events.result.purchaser` | Results for this ticket are shown to the person it belongs to. | Matokeo ya tiketi hii yanaonyeshwa kwa mwenye tiketi. |
| `events.result.cancelled` | Your place was cancelled, so no result is shown. | Tiketi yako ilighairiwa, kwa hiyo hakuna matokeo. |
| `events.result.cached` | Saved on this phone, updated {time} | Imehifadhiwa kwenye simu hii, imesasishwa {time} |
| `events.result.dispute.ask` | Something looks wrong? Ask the organizer to review. | Kuna kitu hakionekani sawa? Muombe mwandaaji akague. |
| `events.result.dispute.title` | Ask about this result | Uliza kuhusu matokeo haya |
| `events.result.dispute.reason.time_wrong` / `.not_my_result` / `.wrong_category` / `.dq_challenge` / `.other` | My time looks wrong / This isn't my result / Wrong category / I disagree with the disqualification / Something else | Muda wangu unaonekana si sahihi / Haya si matokeo yangu / Kundi si sahihi / Sikubaliani na kufutwa / Jambo lingine |
| `events.result.dispute.note` | Tell the organizer more (optional) | Mweleze mwandaaji zaidi (si lazima) |
| `events.result.dispute.send` | Send question | Tuma swali |
| `events.result.dispute.open` | Under review since {date} | Inakaguliwa tangu {date} |
| `events.result.dispute.closed` | Answered on {date}: {outcome} | Imejibiwa tarehe {date}: {outcome} |
| `events.result.dispute.window` | You can ask until {date}. | Unaweza kuuliza hadi {date}. |
| `events.result.dispute.closedWindow` | The time to ask has passed. | Muda wa kuuliza umeisha. |
| `events.result.dispute.withdraw` | Withdraw question | Ondoa swali |
| `events.result.visibility.title` | Who can see my name | Nani anaweza kuona jina langu |
| `events.result.visibility.standard` / `.bib_only` / `.hidden` | Show my name / Show only my bib / Hide me from the results | Onyesha jina langu / Onyesha namba yangu tu / Nifiche kwenye matokeo |
| `events.result.visibility.minor` | Results for under-18s show only the bib number. | Matokeo ya walio chini ya miaka 18 yanaonyesha namba ya mbio tu. |
| `events.result.visibility.ask` | Show your name on the results? | Onyesha jina lako kwenye matokeo? |
| `events.result.visibility.askBody` | Other FitFlex members can see the board. You can change this any time. | Wanachama wengine wa FitFlex wanaweza kuona ubao. Unaweza kubadilisha wakati wowote. |
| `events.run.start` | Start run for this event | Anza kukimbia kwa tukio hili |
| `events.run.save` | Save and add to event | Hifadhi na uongeze kwenye tukio |
| `events.run.keep` | Keep the run without adding it to the event | Hifadhi mbio bila kuziongeza kwenye tukio |
| `events.run.add` | Add a recorded run | Ongeza mbio zilizorekodiwa |
| `events.run.unsupported` | Recording runs isn't available on this device yet. If you recorded the run on another phone with this account, add it here. | Kurekodi mbio bado hakupatikani kwenye kifaa hiki. Ikiwa ulirekodi kwenye simu nyingine kwa akaunti hii, ziongeze hapa. |
| `events.run.state.available` / `.short` / `.outside` / `.linked` | Available / Doesn't reach {distance} / Outside the event time / Already added | Inapatikana / Haifikii {distance} / Nje ya muda wa tukio / Tayari imeongezwa |
| `events.run.confirm.virtual` | This run will be sent to the organizer for {event} to review. | Mbio hizi zitatumwa kwa mwandaaji wa {event} zikaguliwe. |
| `events.run.confirm.inPerson` | This run will be shown next to your official result. It isn't sent to the organizer. | Mbio hizi zitaonyeshwa karibu na matokeo yako rasmi. Hazitumwi kwa mwandaaji. |
| `events.run.notOfficial` | Recorded with FitFlex GPS. This is not the official race time. | Imerekodiwa kwa GPS ya FitFlex. Huu si muda rasmi wa mbio. |
| `events.run.compare` | Official time is {diff} {slower} than your FitFlex run | Muda rasmi ni {diff} {slower} kuliko mbio zako za FitFlex |
| `events.run.flag.fast` | Your run looks unusually fast. The organizer will check it. | Mbio zako zinaonekana za kasi isivyo kawaida. Mwandaaji atazikagua. |
| `events.run.waiting` | Waiting for the organizer | Inasubiri mwandaaji |
| `events.run.remove` | Remove from event | Ondoa kwenye tukio |
| `events.run.closed` | Adding runs has closed. | Kuongeza mbio kumefungwa. |
| `events.run.offlinePending` | You're offline. Your run is saved on this phone and will be added when you're connected. | Huna mtandao. Mbio zako zimehifadhiwa kwenye simu hii na zitaongezwa ukipata mtandao. |
| `events.run.error.run_outside_window` | This run is outside the event time. | Mbio hizi ziko nje ya muda wa tukio. |
| `events.run.error.distance_too_short` | This run is shorter than {distance}. | Mbio hizi ni fupi kuliko {distance}. |
| `events.run.error.activity_not_recorded_in_app` | Only runs recorded in FitFlex can be added. | Ni mbio zilizorekodiwa ndani ya FitFlex tu zinaweza kuongezwa. |
| `events.run.error.activity_already_linked` | This run is already added to another event. | Mbio hizi tayari zimeongezwa kwenye tukio lingine. |
| `events.board.title` | Results | Matokeo |
| `events.board.banner.provisional` / `.official` | Provisional results / Official results | Matokeo ya awali / Matokeo rasmi |
| `events.board.search` | Search by bib or name | Tafuta kwa namba au jina |
| `events.board.you` | You | Wewe |
| `events.board.runner` | Runner {bib} | Mkimbiaji {bib} |
| `events.board.footer` | Names appear only for people who chose to show them. | Majina yanaonekana kwa walioamua kuyaonyesha tu. |
| `events.board.empty` | Results aren't published yet. | Matokeo bado hayajachapishwa. |
| `events.board.signin` | Sign in to see the results. | Ingia ili uone matokeo. |
| `events.medals.title` | Medals and achievements | Medali na mafanikio |
| `events.medals.tab.medals` / `.achievements` | Medals / Achievements | Medali / Mafanikio |
| `events.medals.empty` | No medals yet. Finish an event to earn one. | Hakuna medali bado. Maliza tukio ili upate. |
| `events.medals.why` | Finished {category} in {time} · {stage} | Umemaliza {category} kwa {time} · {stage} |
| `events.medals.rule` | Medals are awarded only for verified results. | Medali hutolewa kwa matokeo yaliyothibitishwa tu. |
| `events.medals.removed` | Removed | Zimeondolewa |
| `events.medals.removedWhy` | Removed because {reason} | Imeondolewa kwa sababu {reason} |
| `events.medals.share` | Share medal | Shiriki medali |
| `events.medals.share.includeTime` | Include my time | Jumuisha muda wangu |
| `events.medals.designBy` | Design by {organizer} | Muundo na {organizer} |
| `events.medals.report` | Report this image | Ripoti picha hii |
| `events.medals.report.sent` | Thanks. FitFlex will look at it. | Asante. FitFlex italiangalia. |
| `events.medals.alt` | {medal}, {event}, {category}, awarded {date} | {medal}, {event}, {category}, imetolewa {date} |
| `events.achievement.progress` | {done} of {total} | {done} kati ya {total} |
| `events.rewards.title` | Rewards | Zawadi |
| `events.rewards.available` | Available rewards | Zawadi zilizopo |
| `events.rewards.claim` | Claim | Dai |
| `events.rewards.claim.confirm` | Claim this reward? | Dai zawadi hii? |
| `events.rewards.terms` | Terms | Masharti |
| `events.rewards.expires` | Use before {date} | Tumia kabla ya {date} |
| `events.rewards.status.reserved` / `.redeemed` / `.expired` / `.cancelled` | Reserved / Used / Expired / Cancelled | Imehifadhiwa / Imetumika / Imeisha muda / Imeghairiwa |
| `events.rewards.code` | Your code | Msimbo wako |
| `events.rewards.code.copy` | Copy reward code | Nakili msimbo wa zawadi |
| `events.rewards.code.help` | Show this code to FitFlex staff. It works once. | Onyesha msimbo huu kwa wafanyakazi wa FitFlex. Unatumika mara moja. |
| `events.rewards.certificate` | Certificate of completion | Cheti cha kumaliza |
| `events.rewards.history` | History | Historia |
| `events.rewards.entry.earn` / `.redeem` / `.expire` / `.reverse` | Earned / Claimed / Expired / Removed | Imepatikana / Imedaiwa / Imeisha muda / Imeondolewa |
| `events.rewards.empty` | No rewards yet. Finish an event to earn some. | Hakuna zawadi bado. Maliza tukio ili upate. |
| `events.rewards.error.reward_unavailable` | This reward is no longer available. | Zawadi hii haipatikani tena. |
| `events.rewards.error.not_enough_units` | You have none of this reward left to claim. | Huna zawadi hii iliyobaki ya kudai. |
| `events.notice.medalArtTakenDown` | Your medal design for {event} was removed: {reason}. | Muundo wako wa medali wa {event} uliondolewa: {reason}. |
| `events.reason.result_corrected` / `.disqualified` / `.registration_cancelled` / `.event_cancelled` / `.rule_changed_by_admin` | the result was corrected / you were disqualified / your place was cancelled / the event was cancelled / FitFlex changed the rule | matokeo yalisahihishwa / ulifutiwa matokeo / tiketi yako ilighairiwa / tukio lilighairiwa / FitFlex ilibadilisha sharti |
| `events.result.entry.myResults` | My results | Matokeo yangu |
| `events.rewards.entry` | Medals and rewards | Medali na zawadi |

Notification titles and bodies: §11.

---

## 13. E. Shared

### 13.1 Flags and options
| Flag | Gates |
|---|---|
| `EVENTS_RESULTS` | all `…/results*` organizer and admin routes, member `GET …/result`, disputes, visibility, `/v1` results routes, the result webhook types, `event-awards-*` jobs, the Results tab and the My result page |
| `EVENTS_RUNS` | `POST …/runs`, `POST/GET/DELETE …/run-links`, the Start run and Add recorded run entry points |
| `EVENTS_RESULTS_PUBLIC` | `GET /events/:eventId/results` (board) and `GET /events/:id` `results` block; needs `EVENTS_RESULTS`; **do not enable until the consent text carries the public-results clause (D48)** |
| `EVENTS_MEDAL_ART` | medal artwork upload/replace/remove/preview/serve routes, the admin Medal art queue and the art fields in medal payloads (`art.source` is always `builtin` while off, and existing custom art is served as its built-in fallback); needs `EVENTS_REWARDS` |
| `EVENTS_REWARDS` | `EventMedalTemplate` routes, medal awards, achievements, `GET /me/achievements`, ledger, wallet, redemption, admin reward desk, `event-reward-expire`; needs `EVENTS_RESULTS` |
All need `EVENTS_MODULE` and `EVENTS_REGISTRATION` (guards `requireEventsResults`, `requireEventsRuns`, `requireEventsResultsPublic`, `requireEventsRewards`: 404 `feature_disabled`). `/v1` results routes additionally need `EVENTS_ORGANIZER_API`; result webhooks need `EVENTS_WEBHOOKS`. `GET /events/options` gains `results: { enabled, runs, public, rewards, medalArt }`. Portal: `NEXT_PUBLIC_EVENTS_MODULE` only; the rest from options. Mobile: no new dart-define. Switch-on order after the owner's go-ahead: `EVENTS_RESULTS` -> `EVENTS_RUNS` -> `EVENTS_REWARDS` -> `EVENTS_MEDAL_ART` (after the owner has decided on faces, §18) -> `EVENTS_RESULTS_PUBLIC` (last, after counsel and the consent bump). Flags stay off on `main`.

### 13.2 Environment (add all to `docs/server-env-checklist.md` before enabling)
`EVENTS_RUN_DISTANCE_TOLERANCE_BPS` (200), `EVENTS_RUN_LINK_MAX_DAYS_AFTER` (7), `EVENTS_RESULTS_IMPORT_MAX_ROWS` (5000), `EVENTS_RESULTS_DISPUTE_DEFAULT_HOURS` (168), `EVENTS_AWARD_BATCH` (200), `EVENTS_RESULTS_PUSH_MAX` (500), `EVENTS_MEDAL_ART_MAX_BYTES` (2097152), `EVENTS_MEDAL_ART_MAX_PIXELS` (16000000), `EVENTS_MEDAL_ART_UPLOADS_PER_DAY` (20). Reward codes reuse `EVENT_TICKET_SECRET` through a derived key (confirmation 11); no new secret. Add each to `src/shared/events-config.mjs` with the same `intOr` helpers.

### 13.3 Migrations
§4. Dry-run on the isolated CI database first (verify the DB name before running; CLAUDE.md rule 3). The ledger trigger replacement and the nullable/`SET NULL` change on a table that is append-only are the delicate steps: the spec must prove (a) INSERT works, (b) UPDATE of any column except the single `userId -> NULL` + `anonymisedAt` pair fails, (c) DELETE and TRUNCATE fail, (d) deleting a user anonymises exactly their rows.

### 13.4 Rule 6 callout list (owner reviews, D35)
New or changed: `src/auth/organizer-api-auth.mjs` (scope list: `results:write` activated, `results:read` added; no change to token or guard logic), `src/services/account-service.mjs` (`deleteMyAccount`: ledger anonymisation step and the `organizer_owner` block), `db/migrations/2027012809*` (ledger trigger and FK change), `src/shared/events-config.mjs`, `src/shared/feature-flags.mjs`, `src/bootstrap/services.mjs` and `functions/jobs.mjs` (new jobs), `src/services/events-webhook-service.mjs` (allowlist + projectors for four types), `src/services/events-integrations-service.mjs` (scope validation), `src/shared/events-document.mjs` (`resultsPolicy`, `resultRules`, medal rule validators), `GET /events/options`, `GET /events/:id`, `GET /me/event-registrations[/:id]` (additive fields), the member notification type list and `memberRouteFor` (mobile), the portal `EventViewTabs`.
Not touched: payment code (`event-money-store-pg.mjs`, `events-payment-service.mjs`, refund service), pricing constants, payout engine, check-in, `src/auth/jwt.mjs`, `events-authz.mjs`, `route-guard.mjs`, `functions/checkins.mjs`, `constants.mjs`, challenge reward services and `GET /me/rewards`. Cancellation and refund effects on medals are read by the reconcile job so no payment path changes.

**Medal artwork additions (D54):** new file-upload route and image decoding (`src/infra/medal-art-file.mjs`, shared sharp/job-gate helpers from the partner-media code reused, not modified), new tables `EventMedalArt`, `EventMedalArtFile`, `EventMedalArtUploadAttempt` (migration `20270128090200`), new admin moderation routes, a new organizer rights confirmation text (draft pending counsel). Security and privacy review required on: SVG/type/pixel/size handling, metadata stripping, the serving authorisation and headers, the attempt caps, and the faces/trademark policy. `src/shared/media-src.mjs` and the `/storage/upload` restriction from functions#273 are not modified and are not used; the S6 routes strip any client-supplied `imageUrl`.

### 13.5 Audit events (`AuditLog`, actor + before/after, no contact data, no routes, `requestId`)
`events.results_imported`, `events.result_entered`, `events.result_verified|rejected|corrected|disqualified`, `events.results_bulk_verified`, `events.results_released|withdrawn`, `events.results_settings_changed`, `events.dispute_raised|resolved|withdrawn`, `events.run_linked|unlinked`, `events.result_visibility_changed`, `events.medal_template_created|updated`, `events.medal_art_uploaded|replaced|removed|reviewed|taken_down` (with reason code, sizes and hashes only, never bytes), `events.medal_art_refused` (code only), `events.medal_awarded|revoked` (by the engine, actor `system`), `events.achievement_awarded|revoked`, `events.reward_definition_created|updated|paused|ended`, `events.reward_earned|reversed|expired` (also visible as ledger rows), `events.reward_claimed`, `events.reward_redeemed|cancelled`, `events.award_task_failed`, `events.admin_result_exception`.

### 13.6 Analytics (server-side `analytics.<name>`, ids and counts only)
`events_results_imported {eventId, rows, ok}`, `events_results_released {eventId, stage, count}`, `events_result_corrected {eventId}`, `events_run_linked {eventId, linkType, flagged}`, `events_medal_awarded {eventId, templateId}`, `events_reward_claimed {definitionId}`, `events_dispute_raised {eventId}`.

### 13.7 Deploy order
Migrations (CI-DB dry run first) -> functions -> portal -> mobile -> flags last, in the §13.1 order. An old mobile build never calls the new routes, so it is safe; the portal must be deployed before `EVENTS_RESULTS` because the Results tab appears from options. Do not enable `EVENTS_RESULTS_PUBLIC` before the consent text bump and counsel review.

### 13.8 Backend spec expectations (`specs/events-s6-*.specs.mjs`, CI DB only; verify the DB name first)
Migrations up/down (down fails closed with data); result transitions through the existing machine including revision n+1 and the single current row; stage derivation table (every row of §3.1); import: preview/apply atomicity, `problems > 0` blocks apply, replay of the same file returns the first answer, `already_official`, rank column ignored, formula-injection cells; verify requires `expectedRevision` (stale -> 409), role matrix (timing cannot verify, API cannot verify, ops hidden, other organizer 404), cross-organizer and cross-event access 404; release: official once, number confirmation not server-checked but `previewHash` is, `markRemainingDns`, `leaveUnsettledOut`; ranks with ties and cut-off; corrections recompute ranks and enqueue tasks; **no `fitflex_gps` result on an in-person event** (spec); link eligibility matrix (owner of activity, claimed participant, window, distance tolerance, source `fitflex` only, `manual`/`device` refused, one live link per activity and per registration, three evidence max, unlink then relink, `clientRef` replay and mismatch, crash between claim and `recordRun` repaired by replay); duplicate-route flag across users never leaks the other person; medal engine: finisher not awarded on purchase alone, not awarded below cut-off, revoked on correction/DQ/cancel/refund/event cancel, re-awarded on reinstatement with the same row, unclaimed places get medals only and awards for the user appear after claim, task coalescing, SKIP LOCKED concurrency (two workers), idempotent re-run; achievements award once per `awardKey`; ledger: earn/redeem/expire/reverse signs, cap total and cap per user under concurrency (parallel earns), parallel redemption of one unit (exactly one wins), cancelled reservation returns the unit, `revoke_unredeemed` vs `revoke_all`, trigger exception only for anonymisation, **account deletion** spec (§13.3 d), `value_not_allowed_yet`; privacy: minors bib only, `hidden` omitted, legacy-consent default `bib_only`, purchaser status-only after claim, board requires auth, organizer/admin/API responses contain no phone, email, DOB or route; webhooks: four types, projectors, same-transaction outbox row (failing outbox write rolls back the state change), no wildcard; notifications deterministic ids (retry sends once); flag-off 404 on every new route; **medal art**: SVG (by content, any declared type) refused, GIF/TIFF/HEIC/PDF/animated refused, type taken from the bytes (a PNG named `.jpg` accepted as PNG, an executable named `.png` refused), oversize body 413 before decode, pixel bomb (small file, huge dimensions) refused, under 512 px and non-square refused, metadata and GPS gone from every stored variant, only WebP stored, client `imageUrl`/remote URL stripped, per-person and per-organizer caps count refusals before the body is read and refused attempts never use the successful allowance, concurrent decode gate returns 503 beyond the queue, one live art per template, replace deletes old bytes, take-down deletes bytes and keeps hashes, re-upload of a taken-down file (and a re-saved copy) refused, serving authorisation matrix (award holder, staff, admin yes; other member, signed-out, other organizer 404), master never served, headers present, take-down reverts the medal to its built-in fallback without touching awards, flag off serves fallback only, rights confirmation version mismatch 409, timing and ops roles cannot upload.

---

## 14. Acceptance criteria (check one by one; `design-qa`, `uat-tester`)

**Run linking**
1. AC-R1: With `EVENTS_RUNS` off, no Start run, Add recorded run or run card appears and every new run route returns 404 `feature_disabled`.
2. AC-R2: On Android, a participant of a confirmed, claimed registration can start a run from the ticket page; the recorder shows "Recording for {event}"; saving uses **Save and add to event** and the run card appears on the result page. (Real device.)
3. AC-R3: On iOS, web and desktop the Start run button is absent, the fallback text is shown, and **Add a recorded run** works.
4. AC-R4: Saving the same run twice with the same `clientRef` (retry after a dropped connection) creates one activity and one link.
5. AC-R5: A run outside the event window, shorter than the category distance (virtual) or recorded by import/manual entry is refused with a plain-language message and nothing is linked.
6. AC-R6: The same activity cannot be the result of two registrations; a registration cannot have two live event runs; an unclaimed place cannot link.
7. AC-R7: For an in-person event, no linked run ever produces an official result or a result row; the run card says "not the official race time".
8. AC-R8: For a virtual event, a linked run creates a pending result that the organizer sees with flags (if any) but never the route; unlinking before verification rejects the pending result with reason `replaced_by_participant`.
9. AC-R9: A run copied between two accounts in the same event is flagged `duplicate_route` on both, and neither organizer view nor participant view names the other person.
10. AC-R10: Linking does not change the run's sharing setting.

**Results and states**
11. AC-S1: The Results tab appears only for owner, admin and timing, only when the flag is on and the event has started; ops and finance do not see it.
12. AC-S2: A CSV with a bad row blocks Apply, lists the line number, bib and plain-language reason, and writes nothing; a clean file applies atomically; applying the same file again changes nothing and says so.
13. AC-S3: Imported results are provisional (`Needs review`); timing role cannot verify; no API client can verify or release.
14. AC-S4: Verify, reject, correct and disqualify require the current revision; a stale revision shows "Someone else changed this result" and writes nothing.
15. AC-S5: Bulk "Approve all clean" excludes flagged rows and shows the excluded count before applying.
16. AC-S6: Provisional release shows results labelled "Provisional" to participants; withdrawing hides them; official release cannot be withdrawn and requires typing the result count.
17. AC-S7: Official release is blocked while unsettled results exist unless "Leave unsettled results out" is ticked; "Mark runners with no result as DNS" writes settled DNS rows.
18. AC-S8: Ranks are produced by the server only, ties share a rank, DNF/DNS/DQ and over-cut-off finishers have no rank, ranks in the uploaded file are ignored with a warning.
19. AC-S9: A correction creates a new visible revision with reason, keeps the old one in history, recomputes ranks, notifies the participant and marks the result "Corrected" everywhere (result page, board, API `stage`).
20. AC-S10: A participant can raise one question inside the window with a reason; outside the window the control is replaced by "The time to ask has passed"; the organizer resolves it; the participant is told the outcome; while open the stage reads "Under review" and numbers stay visible.
21. AC-S11: Every result shows its source label (Official timing, Confirmed by organizer, Virtual run GPS) in words next to the time on result page, board and organizer table.
22. AC-S12: Cancelled event: no results can be added, no medals exist; cancelled or refunded registration: no result or medal shown to the participant.
23. AC-S13: Money: no screen, API field or notice in this slice shows a TZS amount other than reward `valueTzs` (always empty at launch); no balance or payout is changed.

**Medals and achievements**
24. AC-M1: A finisher medal is awarded only after a verified result, official release, confirmed registration, and (when set) finish within the cut-off; a paid registration alone never earns a medal.
25. AC-M2: Podium and "under a time" templates award from server ranks and times and flip when a correction changes them.
26. AC-M3: Disqualification, event cancellation, registration cancellation or refund revoke medals within the reconcile interval; the member sees them under Removed with a plain reason and a notice.
27. AC-M4: Re-running the award engine or re-importing a file never creates a second medal or achievement (unique keys).
28. AC-M5: Medal rules lock after official release; names and artwork stay editable (uploading or replacing artwork never changes who earned a medal); adding a medal later shows "About N people would get this" and awards after confirm.
29. AC-M6: A medal for an unclaimed place appears for the participant after they claim.
30. AC-M7: Achievements are listed separately from event medals and show progress for count-based ones; they are awarded once per rule version.

**Rewards and ledger**
31. AC-W1: No screen or API field calls anything "points" or shows a combined balance; the wallet lists rewards with counts.
32. AC-W2: Only FitFlex admins can create reward definitions; a non-empty value is refused with a clear message; terms EN and SW are required; funding note is required.
33. AC-W3: A qualifying medal or achievement creates exactly one earn entry per definition and user; caps (total and per user) hold under parallel awards.
34. AC-W4: Claiming is atomic: two simultaneous claims with one unit succeed once; the other shows "You have none of this reward left to claim".
35. AC-W5: A perk code is shown only to its owner, works once at the admin desk, and a reserved redemption that expires returns the unit.
36. AC-W6: Reversal of a source medal reverses unredeemed entries; a redeemed one is left in place and appears as "Needs review" on the admin desk (per policy); history is never edited or deleted.
37. AC-W7: Every ledger row shows why it exists (earn, claim, expiry, removal) in plain words with its date and source.
38. AC-W8: Deleting an account with ledger rows succeeds, the ledger rows remain without a user; deleting an organizer owner is blocked with the transfer message.

**Privacy**
39. AC-P1: The results board requires sign-in; signed-out requests are refused.
40. AC-P2: Minors (under 18 on the event day) appear only as "Runner {bib}"; they cannot choose "Show my name".
41. AC-P3: A registration made before the public-results clause shows bib only until its owner chooses; the first-open prompt appears once.
42. AC-P4: "Hide me from the results" removes the person from the board immediately; their own result, medals and rewards are unaffected.
43. AC-P5: No organizer, admin or API response contains phone, email, date of birth, emergency contact or any GPS route; webhook payloads contain ids and statuses only.
44. AC-P6: After a place is claimed the purchaser sees a status chip only.

**API and webhooks**
45. AC-A1: `results:write` is selectable in the scope picker as High risk with the "cannot verify or publish" line; `results:read` is selectable; a client without them gets 403 `insufficient_scope`.
46. AC-A2: A results import over the API requires `Idempotency-Key`; replay returns the same answer; per-row errors identify `clientRef`, not people; sandbox writes persist nothing.
47. AC-A3: `result.verified`, `result.published`, `result.corrected`, `result.disputed` appear in the endpoint event picker and the OpenAPI document, are signed like every S5 event and are written in the same transaction as the change.
48. AC-A4: A different organizer's event or registration gets 404 on every new route.

**Accessibility, copy, layout**
49. AC-X1: Every new control has a visible label or accessible name (checked in the Flutter web semantics tree and the portal accessibility tree); icon-only buttons are named.
50. AC-X2: Touch targets are at least 44 px on the portal and 48 dp on mobile; the release number field and art picker are keyboard reachable.
51. AC-X3: Stage, source and status are communicated with text and icon, never colour alone; contrast is 4.5:1 or better.
52. AC-X4: Every new string exists in English and Swahili; the mobile parity test passes; Swahili renders at 375 px and at 200 % text size without clipping or overflow.
53. AC-X5: Focus moves to the result heading after a result loads or a release applies and returns to the trigger when a dialog or sheet closes; the result stage change is announced (live region).
54. AC-X6: At 375 px no page scrolls horizontally; tables scroll inside their labelled region; at 840 px and above the result and wallet pages use two columns.
55. AC-X7: Offline: the result page shows the cached result with the saved-on-phone line, actions needing the network are disabled with the reason, and nothing is queued except a locally recorded run waiting to be added.

**Medal artwork (D54)**
59. AC-G1: With `EVENTS_MEDAL_ART` off there is no upload control and every medal shows a built-in design; with it on, owner/admin can upload a design per medal (per category and tier) and timing/ops cannot.
60. AC-G2: The upload dialog requires a PNG, JPEG or WebP of at least 512 x 512, up to 2 MB, square after cropping, shows the circular preview, states the faces/brands notice and will not enable Upload until the rights checkbox is ticked.
61. AC-G3: An SVG (including one renamed `.png`), a GIF, an animated image, a corrupt file, an oversize file, a huge-pixel file, a too-small file and a non-square file are each refused with a specific plain-language sentence in English and Swahili, and nothing is stored.
62. AC-G4: A new design appears for participants immediately; the old design's bytes are deleted; the medal card shows "Your design"; Remove or "Use a FitFlex design" switches back to a built-in design.
63. AC-G5: A FitFlex admin sees new designs in a Medal art queue, can mark them reviewed or take them down with a reason; after take-down the medal shows its built-in design everywhere within a refresh, the organizer sees the reason in words and an essential notice, awards are unchanged, and the same file (or a re-saved copy) cannot be uploaded again.
64. AC-G6: A member can open a medal's detail and use Report this image; the report reaches FitFlex support with the art id.
65. AC-G7: Stored artwork contains no EXIF, GPS or other metadata; only the owner's organizer staff, award holders and FitFlex admins can fetch an image; a signed-out or unrelated request gets 404.
66. AC-G8: Every medal image has alternative text (organizer-supplied in the viewer's language or a generated description) in the portal and in the Flutter web semantics tree; the Share action is labelled and the shared card contains no member name or time unless the member switches it on. (Share sheet: real device.)
67. AC-G9: An image that fails to load (offline, taken down, error) never leaves a blank medal: the built-in design shows.
68. AC-G10: No screen, API response, webhook or export exposes a medal image URL to organizers' integrations or contains the image bytes outside the authorised image route.

**Flags**
56. AC-F1: With all five flags off, S5 behaviour is unchanged: no new tab, route, card, notification or webhook type appears, and `GET /events/options.results` is all false.
57. AC-F2: Turning on only `EVENTS_RESULTS` shows organizer import/verify/release and the participant's own result, but no run buttons, no board and no medals or wallet.
58. AC-F3: The board and its entry points are absent until `EVENTS_RESULTS_PUBLIC` is on, even with results released.

---

## 15. Slice split for builders (stop after each; PRs into `release-candidate`, flags off)

| Stage | Builder | Content | Depends on | Stop point |
|---|---|---|---|---|
| **B1 Results core** | backend-builder | Migration `20270128090000`; stores; CSV import preview/apply; manual entry; verify/reject/bulk; release/withdraw; ranks; corrections/DQ; disputes; member `GET …/result`; visibility route; `/v1` results routes and `results:*` scopes; four webhook types; admin results; `EVENTS_RESULTS`; specs | S5 | contract-checker + security-and-privacy-reviewer (scopes, privacy) |
| **B2 Run links** | backend-builder | `events-run-link-service`, checks, routes, `EVENTS_RUNS`, specs (eligibility matrix, `clientRef`) | B1 | review |
| **B3 Awards and rewards** | backend-builder | Migration `20270128090100` (ledger trigger/FK change); award tasks and jobs; medal templates with built-in art and `tier`; achievements seed; definitions; ledger; redemption; admin desk routes; deletion path; `EVENTS_REWARDS`; specs | B1 | **owner review of §7.6 (rule 6)** |
| **B4 Medal artwork** | backend-builder | Migration `20270128090200-events-medal-art-s6.cjs` (§7.7); `src/infra/medal-art-file.mjs` on the shared sharp helpers; upload/replace/remove/preview/serve routes; admin review and take-down; upload attempt caps; confirmation text; notices; `EVENTS_MEDAL_ART`; specs | B3 (templates) | **security-and-privacy-reviewer on the upload path before any UI work merges** |
| **P1 Results tab** | portal-builder | Overview, Import, Results table + drawer, release/correct dialogs, Disputes, Settings, API scope picker update, Playwright with mocks (flag on/off) | B1 contract | design-qa |
| **P2 Medals + reward desk** | portal-builder | Medals panel (built-in art picker), `/admin/rewards`, admin result exception UI | B3 contract, P1 | design-qa |
| **P3 Medal artwork** | portal-builder | Upload/replace/remove with square crop and the rights confirmation, alt text, status chips, admin "Medal art" review queue and take-down dialog, Playwright (flag on/off, mocked errors) | B4 contract, P2 | design-qa + security review of the upload form |
| **M1 My result + runs** | mobile-builder | Result page, visibility prompt, dispute sheet, event run sheet/links, `RunRecorder` event argument and `clientRef`, notifications routing | B1, B2 contract | design-qa + uat-tester |
| **M2 Medals + wallet** | mobile-builder | Medals page, wallet, redeem sheet, cache; `MedalBadge` renders custom art with built-in fallback; share card (real device) | B3, B4 contract | design-qa + uat-tester |
| **M3 Board** | mobile-builder | Board page, entry points | B1 contract, flag `EVENTS_RESULTS_PUBLIC` | counsel gate before enabling |
Parallel work is possible once the B1 contract is merged (portal and mobile against fixtures). Review sequence: contract-checker, i18n-swahili-auditor and security-and-privacy-reviewer on each backend PR; release-captain merges to RC in the order functions -> portal -> mobile. Docs and tracker sync after each.

---

## 16. Backend confirmations for `fitflex-planner` / `contract-checker` (the builder resolves these in the PR)

1. Migration timestamps: RC already has `20270127090000`; confirm the highest at branch time and renumber `20270128090000/090100` if needed. Confirm the S5 `down` guard does not conflict.
2. `EventResult` really has no `EventResultRevision` table (revisions are rows); the reuse map names one. Confirm no code expects it.
3. `recordRun` can be called by the new combined route without double-inserting when the link row is claimed first (the activity store is `insertAsync`, not transactional): confirm the repair-by-replay design, or whether `activityId` can be pre-generated.
4. `AuditLog` helper signature and whether the actor can be `system` for the engine.
5. `RunRecorder` behaviour when `save` fails offline: does the finished run survive for retry, and can a `clientRef` persisted at start be reused? (Mobile builder confirms.)
6. Value of `EVENTS_CONSENT_TEXT_VERSION` that will carry the public-results clause and how `consentTextVersion` strings compare for the backfill (string equality or ordered?).
7. `EventCategory.resultRules` is currently free jsonb: confirm the document validator can enforce the key list without rejecting existing rows.
8. Notifier capacity for a release to thousands of participants; `EVENTS_RESULTS_PUSH_MAX` default; `memberRouteFor` additions for eight new types.
9. `account-service.deleteMyAccount` transaction boundaries and where the ledger anonymisation step slots in; confirm Postgres lets the `SET NULL` cascade pass the modified trigger (a BEFORE UPDATE trigger fires for FK actions).
10. `ageOnEventDay` and `maskName` reuse; how `participantUserId`-less minors are identified (date of birth on the registration only).
11. Reward-code key derivation from `EVENT_TICKET_SECRET` (HKDF with a label) is acceptable and the previous-key ring is honoured; otherwise a dedicated secret is needed (rule 6 review).
12. `OrganizerIdempotency` supports the new route strings and the 5,000-row body without exceeding platform body limits (the follow-up "body limit 2 MB gap" for images is the same limit).
13. `GET /events/options` caching so `results.*` flips appear without redeploy (portal `useEventsOptions`).
14. Admin ACL: reuse of the `events` scope for the reward desk (no new entry in `ALL_ACL_SCOPES`); confirm.
15. Whether `ActivityRoute.segments` already contains pause boundaries (segments array) so moving time can exclude pauses as §5.3 assumes.
16. `ageOnEventDay` for dates of birth missing on registrations from older S3 rows.
17. Event auto-complete job and `in_progress` timing: confirm results routes use the same status helper (not a new clock).
18. The `webhook` projector allowlist file and the OpenAPI contract test pick up the four new types and three routes.
19. Web (Flutter) deep links for the five new routes and that `FFHeroBand` is not required by the result page.
20. Cron cadence: one-minute job with an in-run loop is allowed (same as S5 webhook dispatcher).
21. Partner-media cache choice for served images (header values), and whether `sniffImageType`, `looksLikeSvg`, `pixelSha256` and the image-job gate can be imported from the partner-media modules without moving them; whether functions#276 (data-URI cap) is merged to RC and how the platform body limit (2 MB gap) applies to a 2 MB raw upload.
22. Portal `image-upload.tsx`: does it support a square crop with a circular preview, or is a `SquareCropper` needed; does it send raw bytes or a data URI (the S6 route takes raw bytes only).
23. Whether `PartnerMediaUploadAttempt` caps can be mirrored by a separate table without a shared limiter (as designed), and the nightly sweep location.
24. Whether mobile#246's remote-image host check needs any change for `Image.network` against the new authenticated route (it must send the bearer token; confirm the existing authenticated image helper, or use `Image.memory` after an `ApiClient` fetch).

---

## 17. UAT journeys for `uat-tester` (isolated backend/DB, seed accounts only; items marked R need a real device)

1. **Organizer: import to official.** Organizer owner opens Results for a completed seed event, imports the sample CSV with one deliberate bad row (blocked), fixes it, applies, approves all clean, verifies the flagged one individually, releases provisional, then official (types the number). Expect AC-S2..S8.
2. **Participant: my result.** Seed member opens the result from the ticket page: Provisional then Official labels, rank, bib, source label, visibility prompt, PB chip, dispute raise and organizer resolution with correction -> Corrected badge and notice. Expect AC-S9..S11, AC-P3, AC-P4. Push delivery: R.
3. **In-person event with a GPS run.** Android: record a short run for the event (R: GPS, permissions, foreground service); web/iOS: add a recorded run from the list. Expect AC-R2..R7, R10.
4. **Virtual event.** Seed virtual event: member submits a run, organizer sees it pending with flags, approves, releases; second member submits a copied run: both flagged. Expect AC-R8, R9.
5. **Medals and rewards.** After official release the finisher sees a medal and a certificate reward; claims it; a perk is claimed and verified at the admin desk; organizer disqualifies a finisher: medal removed, unredeemed reward reversed, notices sent. Expect AC-M1..M7, W1..W7. Share sheet and certificate save: R.
6. **Privacy and roles.** Minor seed registration appears as "Runner {bib}"; hidden participant omitted; purchaser after claim sees the status chip; timing role cannot verify; another organizer gets 404; board refuses signed-out requests. Expect AC-P1..P6, AC-A4.
7. **API.** Sandbox client: submit a results batch with an idempotency key, replay it, read results; verify no verify/release routes exist; confirm the four webhook types in the picker. Expect AC-A1..A4.
8. **Account deletion.** Delete a seed member who earned and claimed a reward; ledger rows remain without a user; delete an organizer owner: blocked. Expect AC-W8.
9. **Flags.** Walk the flag matrix of AC-F1..F3.
10. **Medal artwork.** Organizer uploads a valid design (appears at once), tries an SVG and a non-square file (refused with sentences), replaces it; admin reviews and takes one down; member sees the built-in design again and receives the notice; member reports an image. Expect AC-G1..G10. Share card and gallery/file pickers on a phone: R.
Needs a real device: Android GPS recording and its foreground service/permissions/battery; push notifications; share sheets for medals and certificates; copying a code to another app; camera not used in this slice.

---

## 18. Known gaps and reminders (rule 8)

- Trainer and vendor settlement have never been exercised against real accounts; organizer settlement statements are still not built; S6 moves no money and does not change them.
- Legal text is draft pending Tanzanian counsel: the public-results clause and the consent bump (a launch gate for `EVENTS_RESULTS_PUBLIC`), minors' handling (guardian rules, PRD §10), retention of results (D55), rewards terms. Swahili needs native review for every new string, especially "Nafasi ya", "Pingamizi", "Amefutiwa", the reward claim wording and the reason sentences built from `reasonCode`.
- All flags are off in production; nothing here ships live without the owner's go-ahead and, per D35, the owner's review of the rule 6 areas in §13.4.
- GPS run recording is Android-only; iOS and web users can only add runs recorded elsewhere. Walking events cannot link runs (`walking` is not a recordable type).
- Time from GPS is moving time, not a gun or chip time; it is always labelled and never official for in-person events.
- Timing-chip integrations, splits and route display for organizers, age-group and gender rankings, sponsor/partner rewards and redemption partners, medal art on the public event page before registration, reusing artwork across events, cash rewards and prize money, offline results, and a result API verify scope are **not** built.
- **Medal artwork is user-generated content shown to other members.** Faces and trademarks: the rights checkbox is a draft warranty pending Tanzanian counsel and organizer terms still do not exist; the earlier owner decision "faces allowed, revisit before member-facing" is now due. Recommended before `EVENTS_MEDAL_ART` goes on: owner states whether faces are allowed (the spec currently allows them with the notice, the checkbox and take-down on request). No automated image moderation exists (no face, nudity or logo detection); moderation is human, after the fact. Artwork cannot be reused across events (re-upload each time) and has no public pre-registration preview.
- Reward farming protection is caps, per-user limits and a weekly review list; there is no automated fraud scoring.
- Follow-ups carried and untouched: S5 L2, L7, L8; the registration-data retention/anonymisation rule; `EventRegistration` person fields persist after user deletion.
- The unclaimed-place edge: medals attach to the registration and appear after claim; if a place is never claimed they never reach a person.

---

## 19. Decisions D44 to D62 (accepted by the owner 2026-10-29)

All recommended defaults were accepted, **except D54, which the owner changed** to organizer-uploaded artwork (§7.7). They are recorded as accepted in `docs/marathon/decisions.md`.

| # | Decision | Accepted | Effect if changed later |
|---|---|---|---|
| **D44** | Is the reward ledger a points currency? | **No.** `RewardLedgerEntry.points` holds an entitlement unit count per `RewardDefinition` (+1 earn, -1 claim/expire); no balance, no conversion, no "points" wording anywhere. | A points currency needs its own design (earn rates, redemption catalogue, expiry law, liability accounting) and legal review before any build. |
| **D45** | Which reward types and funding at launch? | `certificate` (instant) and `perk` (code verified by FitFlex staff), FitFlex-funded, `valueTzs` must be empty; no cash, gym pass or shop voucher (extends D9). | Funded value needs a funding source, accounting treatment and an owner-set cap per definition; service refusal `value_not_allowed_yet` lifts. |
| **D46** | Who may mark a result official? | Only organizer owner/admin (portal). Timing partners and API clients submit **provisional** results only; no API verify or release. FitFlex admin only as an audited exception. | An API verify scope would let a leaked key create medals; needs extra review and four-eyes. |
| **D47** | When are medals awarded and when do disputes block them? | At **official release** of the category, from verified results; an open dispute does not suspend medals; corrections revoke or re-award. | Awarding at provisional release risks reversals; holding awards during disputes delays everyone. |
| **D48** | Public results visibility and consent | Signed-in members only; adults default first name + last initial + bib with a one-time prompt for registrations made before the new consent clause (those default to bib only); participant can choose bib only or hidden; minors always bib only; unknown date of birth treated as adult unless the category allows under-18s (then bib only). `EVENTS_RESULTS_PUBLIC` stays off until the consent text is bumped and counsel has reviewed. | Fully public (unauthenticated) results need a web page, search-engine and scraping decisions and counsel; opt-in only is safer but empties the board. |
| **D49** | Auto-accept of virtual GPS runs | **No auto-accept.** Organizer bulk-approves clean runs; flagged runs need an individual decision. | Auto-accept needs a system verifier (relax `verifiedBy` CHECK) and abuse monitoring. |
| **D50** | Time basis for GPS results | Moving time to the point the category distance is reached (pauses excluded), labelled "moving time". | Wall-clock time penalises stops; gun-style timing would need the recorder to mark a start. |
| **D51** | Run windows and tolerance | Virtual: run must start inside the event dates. In person (evidence): 2 h before the start to 12 h after the end; link up to 7 days after the event; virtual distance tolerance 2 % (per-category override). | Wider windows invite pre-recorded runs; tighter ones reject real late finishers. |
| **D52** | Who computes ranks | The server, on official release and on changes; imported ranks are ignored with a warning; ties share a rank; over-cut-off and DNF/DNS/DQ unranked. | Accepting imported ranks lets a typo set medals. |
| **D53** | Account deletion with ledger and organizer ownership | Ledger rows are anonymised (not deleted) on member deletion via the single trigger exception; organizer owners are blocked with a transfer message until ownership moves. | Hard delete of ledger rows would break the immutable-record promise; blocking all deletion breaks Play Store rules. |
| **D54 (changed)** | Medal artwork | **Organizers upload their own design** for each medal (per event, category and tier); the 8 built-in designs are the default and the fallback. Reuses the partner-media pipeline and the functions#273/#276 and mobile#246 image-security rules: DB storage, show-now + FitFlex take-down, SVG refused, bytes-sniffed types, 2 MB / 16 MP / 512-4000 px square limits, metadata stripped, rights checkbox (draft pending counsel). Details in §7.7. Own flag `EVENTS_MEDAL_ART`. | Restricting to built-ins is a flag switch; allowing SVG or animation would need a sanitiser and new review. |
| **D55** | Retention of results and names | Results are kept with the event record; a person can hide their name at any time; no retention period is encoded until counsel sets one. | A fixed period needs an anonymisation job for old registrations and results. |
| **D56** | Notification classes | Result published, medal awarded, reward earned are optional (user preference applies); corrections, rejections, dispute outcomes, medal and reward removals (and medal-art take-downs, for organizers) are essential. | Making all optional risks missed removals; making all essential adds noise. |
| **D57** | Purchaser view of a result | Purchaser sees the result of unclaimed places they bought; after the claim only a status chip. | Showing full times to purchasers would reveal a participant's data without their say (M5). |
| **D58** | Achievement catalogue | Five seeded achievements (§7.3); titles editable by a direct admin call, no portal editor in S6. | A portal editor and more criteria types are a later slice. |
| **D59** | Dispute and exception authority | Organizer resolves; FitFlex admin may resolve after 7 days or when the organizer is suspended/inactive, and may enter or correct results for an inactive organizer, always with a reason and an organizer notice. | No admin path leaves participants stuck if an organizer disappears. |
| **D60** | Four-eyes on official release | Not enforced in S6; the typed-count confirmation and non-withdrawable rule are the guard. | Enforcing it blocks small organizers; skipping it relies on one person's care. |
| **D61** | Age-group and gender rankings | Out of scope. Overall and category ranks only; the demographic scope is not extended to results. | Needs gender/age on a public board, privacy review and fairness rules. |
| **D62** | Personal-best rule | PB chip only for official results at the same category distance and `routeType`; label "Personal best at this distance", never "course record". | Without certified courses, cross-course PBs would be misleading. |

Still the owner's to settle before the matching flag goes on (not new numbered decisions): whether **faces** are allowed in medal artwork (§18), and the counsel-reviewed consent text for public results (D48).
