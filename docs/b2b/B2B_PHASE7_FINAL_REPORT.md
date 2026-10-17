# B2B Phase 7 final report: Automation, Operational Workflows & Scale

Date: 2026-10-11

Phase 7 is merged. Recurring B2B work now runs through one operations layer that records every run, catches up missed runs, turns failures into exceptions and alerts staff. Three "done" criteria from the Phase 7 brief are only partly met, by design, because completing them would have meant inventing rules or stepping into the settlement engine:

- **Payment reconciliation** is assisted, not automatic: a person still confirms each payment.
- **Provider settlement** is monitored and cross-checked read-only; its jobs still belong to the settlement engine.
- **Notifications** reuse the existing senders rather than one central orchestrator.

Pull requests (all merged):

| Slice | Backend | Portal | Submodule re-point |
|---|---|---|---|
| 1. Jobs, exceptions, operations page | fitflex-functions#102 | fitflex-portal#55 | fitflex#25 |
| 2. Bulk import and invitations (email + SMS) | fitflex-functions#105 | fitflex-portal#57 | fitflex#27 |
| 3. Lifecycle notices and renewal drafts | fitflex-functions#130 | fitflex-portal#72 | fitflex#33 |
| 4. Billing watch, provider checks, staff alerts | fitflex-functions#132 | fitflex-portal#75 | fitflex#34 |

Technical detail and runbooks: `fitflex-functions/B2B_AUTOMATION.md`.

## 1. Current architecture (what existed)

- Scheduled jobs ran in-process with a basic run record.
- A failure was a line in the server log; nothing caught up a missed run, and staff had no page to see job health.
- The domain services were already idempotent (one invoice per organisation, programme and month; one reminder per invoice and stage; one payment per reference; one pass per entitlement).

## 2. New automation architecture

- **Operations service**: every B2B job runs through it. It gives each run a slot, a lock, a run record with counts, and a pause switch.
- **Sweeper** (every 10 minutes): runs missed daily jobs and retries failed ones.
- **Exceptions**: a failed job, a failed item, a failed integrity check or overdue billing work becomes a tracked exception that clears itself when the problem goes away.
- **Operations page** at `/admin/b2b-ops` in the portal.
- Nothing in this layer decides business rules; each job calls the service that already owned the work.

## 3. Jobs and workflows

Times are East Africa Time.

| Job | When | What it does |
|---|---|---|
| Programme expiry | 00:05 | Marks programmes past their end date expired |
| Benefit hold reconciler | every 5 min | Settles holds a check-in left behind |
| Sponsor billing drafts | 00:20 | Starts passes; keeps draft invoices current |
| Financial integrity check | 01:00 | 13 data checks plus 3 provider-side checks |
| Billing watch | 07:30 | Flags billing work left too long |
| Lifecycle notices | 08:00 | Benefit and programme starting, ending, ended |
| Daily summary | 08:30 | Emails staff what is still waiting |
| Payment reminders | 09:00 | 3 days before due, due day, +7, +14, +30 |
| Sponsor visibility notice | 10:00 | Tells newly covered people what their sponsor sees |
| Allowance notices | every 10 min | 80% used and fully used |
| Beneficiary invites | every 10 min | Enrols invited people who joined; sends invitations |
| Staff alerts | every 10 min | Emails new high-severity exceptions |

Two workflows are started by a person rather than a schedule:

- **Bulk import** of people from a file (up to 2,000 rows), with email and SMS invitations.
- **Renewal draft** for a programme, prepared on request and never automatic.

## 4. Idempotency

- A scheduled slot can succeed only once, backed by a unique database index.
- A database lock per job stops two servers, or the scheduler and an operator, running the same job together.
- Each message is claimed before it is sent, so reruns do not send twice.
- The domain rules listed in section 1 make a repeated run harmless, which is what makes catch-up and "Run now" safe.

## 5. Retry and recovery

- A missed daily run is caught up within about 10 minutes of the server coming back.
- A failed run is retried after 5 minutes, then 15, then stops; the exception becomes "gave up retrying" and waits for a person.
- A run interrupted by a restart is marked failed on the next run.
- One bad record fails only that item, not the whole job.
- An operator can retry an exception up to five times.

## 6. Financial safety

- The billing job prepares **drafts only**. Issuing an invoice, confirming a payment, voiding and approving a settlement are still done by a person.
- Reminders, the billing watch and the provider checks change no financial record.
- No hold, late fee or credit-control action is taken automatically.
- The settlement tables are only read.
- Closing an exception changes nothing in the records it is about.

## 7. Exception management

- **Types**: job did not finish, item not processed, records do not add up, waiting too long.
- **Severity**: low, medium or high; a failed finance job or item is high.
- **Lifecycle**: open → being looked at → resolved or ignored (with a reason); can be reopened; never deleted.
- The same problem seen again raises the count on the existing exception instead of creating a duplicate.

## 8. Notifications

| Audience | Events | Channel |
|---|---|---|
| Members | Benefit starting, ending, ended; allowance 80% and used up; sponsor visibility | In-app |
| Invited people | Invitation and reminders | Email and SMS |
| Organisations | Programme ending in 30 days, 7 days, ended | In-app and contact email |
| Organisations | Payment reminders | In-app and contact email |
| FitFlex staff | High-severity exceptions; morning summary | Email |

WhatsApp is not used, because there is no provider account.

## 9. Operations dashboard

Staff can see:

- job health, last run, next due and run history;
- exceptions by severity and status;
- counts of work waiting on a person (drafts, payment notices, overdue invoices, held passes, unlinked people, renewals, invites);
- whether alert emails are switched on.

Staff can run a job now, pause or resume it with a reason, and mark, resolve, ignore, reopen or retry an exception.

## 10. Security

- The operations page and its actions are staff-only; organisation users have no access.
- Acting on a finance exception also needs billing-approval permission.
- Import and invitations need the organisation's people-management permission.
- An invite or renewal belongs to one organisation; another cannot see or change it.
- Alert emails carry organisation names, counts and amounts, never beneficiaries' personal details.
- No PINs, secrets or payment credentials are logged.

## 11. Audit

- Manual actions (run, pause, resume, exception changes) are in the audit log under the operator's id.
- Automated work is recorded as `system:<job>`, with the run id on the run record and on any exception it raised.
- Run and exception records are kept indefinitely.

## 12. Testing

- Five new spec files with 38 tests cover the run layer, import, SMS wiring, lifecycle notices and the watch/alerts slice.
- The last full local run was 1,763 of 1,764 passing; the one failure is an existing identity test unrelated to this work.
- CI passed on all eight pull requests.
- Each slice was clicked through on a local preview.
- Not verified from outside: that the migrations ran and the jobs are firing on the live server. The operations page will show it.

## 13. Corporate compatibility

- Existing Corporate accounts, employees and screens are unchanged.
- Every migration is additive.
- Jobs outside B2B are untouched, including member renewals, gym communications, KYC reminders and settlement close.

## 14. Known limitations

- Payment confirmation is manual; there is no bank or mobile-money statement matching.
- Settlement jobs do not run through the operations layer.
- Notifications are not centrally orchestrated or configurable per organisation; timings and thresholds are fixed in code.
- Staff alerts are email only, to one list of addresses.
- Member notices are English only.
- The scheduler is in-process: if the server is down for a whole day, that day's run is skipped.
- No retention period is set for run and exception records.
- Sponsored passes and vendor settlement are not cross-checked.
- Renewal is never automatic.

## 15. Production readiness

Remaining items, all owner-side or needing a decision:

- Set `OPS_ALERT_EMAILS` on the server, or nobody is alerted.
- Invitation SMS only sends where the SMS provider is on; each message is paid for.
- `FITFLEX_APP_LINK` is unset, so invitations carry no download link.
- Whether sending invitation SMS needs consent is a question for counsel.
- The privacy-policy section on sponsors is live and still needs counsel review.
- Real payment details must be entered by staff for reminders to be useful.
- Gym settlement is in shadow mode, so the two gym cross-checks report nothing yet.
- The watch thresholds (7, 3, 30, 3, 30, 30 and 14 days) are defaults chosen during the build; change them if they do not match how finance works.

## 16. Phase 8 recommendation

An operational go-live and hardening phase rather than new features:

1. Verify production: migrations, jobs firing, alert emails, SMS and email senders.
2. Take gym settlement from shadow to live, with the settlement owners, so the cross-checks have something to compare.
3. Decide the open policies: credit control and holds, VAT, record retention, notification preferences.
4. Add payment statement import and matching, if finance wants less manual confirmation.
5. Translate member notices into Swahili.

Phase 8 has not been started.
