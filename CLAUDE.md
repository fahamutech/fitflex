# FitFlex — working agreement for Claude

## Repo map
- Parent repo (this one): docs, canon, legal drafts, and submodule pointers.
- `fitflex-functions` — Node/Postgres/Firebase backend. Specs in `specs/`, migrations in `db/migrations`, CI in `.github/workflows/backend-tests.yml`.
- `fitflex-portal` — Next.js admin/owner/HR portal. e2e in `tests/e2e`. Deploys to Firebase Hosting.
- `fitflexmobile` — Flutter app (member, trainer, owner, vendor). Tests in `test/`.
- Other sessions share these checkouts. Memory notes live in `~/.claude/projects/-Users-chollo-FitFlex/memory/`; read the relevant one before starting.

## Branch model
- `main` is the default branch. A merge to `main` triggers deployment CI. Treat it as production.
- `release-candidate` (RC) exists per repo. **All agent and subagent work is pushed to RC**, never to `main`. RC is where it is compiled, tested, and run locally.
- Feature branches (`feat/<topic>`, `fix/<topic>`, `docs/<topic>`) branch from `origin/release-candidate` and PR into it.
- Promotion RC → `main` happens only when the owner explicitly says so, in order functions → portal → mobile, then a parent submodule re-point PR.
- If `release-candidate` is missing in a repo, create it from `origin/main` and tell the owner.

## Hard rules
1. Never switch branches in a shared checkout. Use a git worktree with a unique branch name, `|| exit 1` on every step, and confirm `pwd`.
2. Never merge to `main`, deploy, flip a production flag, or change production env without the owner's explicit go-ahead in chat. Approval does not carry to the next release.
3. Backend tests run only against the isolated CI database (`FITFLEX_USE_CI_DB=1`, `DATABASE_URL_CI`). Verify the DB name before running anything that writes.
4. New behaviour ships dormant behind a flag unless told otherwise.
5. Every user-facing string gets Swahili alongside English; no hardcoded English.
6. Changes to pricing constants, payout engine, check-in logic, `src/auth/*` or endpoint signatures must be called out explicitly in the PR (see CONTRIBUTING.md).
7. Report test failures with real output; say plainly what was not verified.
8. Always remind the owner of known gaps when relevant: vendor/trainer settlement status, legal text still draft pending Tanzanian counsel, flags still off.
9. The live DB holds test data, but do not run specs against it.

UAT rule: Flutter web UAT runs against a backend on an isolated DB with seed/fixture test accounts only; camera, push, step counting and native payments are "needs a real device".

## Subagents (`.claude/agents/`)
| Agent | Role |
|---|---|
| `fitflex-planner` | Per-repo slice plan, contract, flags, stop points (read-only) |
| `backend-builder` | `fitflex-functions` changes + specs |
| `portal-builder` | `fitflex-portal` screens + e2e |
| `mobile-builder` | `fitflexmobile` screens + tests |
| `i18n-swahili-auditor` | Hardcoded English / missing Swahili (read-only) |
| `contract-checker` | Backend vs portal/mobile API drift, deploy order (read-only) |
| `security-and-privacy-reviewer` | Auth, KYC, tenancy, privacy, payouts (read-only) |
| `release-captain` | Merges to RC, builds/tests, promotes RC → main on go-ahead |
| `docs-and-tracker-sync` | IMPLEMENTED_AS_OF, launch tracker, memory notes |
| `design-agent` | Screen/flow specs, states, Swahili, a11y, acceptance criteria (`docs/design/`) |
| `design-qa` | Checks the Flutter web build against the design spec and system |
| `uat-tester` | Runs role journeys on Flutter web from RC; go/no-go for promotion |

## Standard flow
```
planner → design-agent
  → backend-builder → portal-builder / mobile-builder (parallel, separate worktrees)
  → PRs into release-candidate
  → contract-checker + i18n-swahili-auditor + security-and-privacy-reviewer (parallel)
  → release-captain: merge to RC, build + test
  → design-qa + uat-tester on Flutter web built from RC (isolated backend/DB)
  → owner reviews, can run RC locally
  → owner go-ahead → release-captain promotes RC → main (deploy CI)
  → docs-and-tracker-sync
```

## Running RC locally
Check out `release-candidate` in a worktree per repo. Backend: `npm test` with the CI DB env, then start against a local DB. Portal: `npm run dev`. Mobile: `flutter run -d chrome` (or `-d web-server --web-port 7357` for UAT) with `--dart-define=API_BASE=<url>` and a `.env` containing `API_BASE`. Flags stay dormant unless the PR says otherwise.
