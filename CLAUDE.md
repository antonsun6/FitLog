@AGENTS.md

# FitLogger

A structured workout logger (sets/reps/weight, history, automatic PR
detection, routines) — replaces an unstructured Notes-app workflow. See
[`docs/PRD.md`](docs/PRD.md) for the full product spec (goals, MVP vs. phase
2, user stories) and [`docs/TECHNICAL_PLAN.md`](docs/TECHNICAL_PLAN.md) for
the technical design (schema, RLS policies, PR algorithm, route structure).
Read both before making product or architecture decisions — this file is
just the fast-context summary.

## Stack

Next.js (App Router) + TypeScript + Tailwind · Prisma 7 (driver-adapter mode,
`@prisma/adapter-pg`) · Supabase (Postgres + Auth + RLS) · Vercel · Recharts ·
pnpm · **Node 22+ required** (`.nvmrc`/`engines` pin this — Node 20 hit EOL
in April 2026 and lacks runtime features like `Map.groupBy` that this
codebase now uses; run `nvm use` in the project directory if your shell
defaults elsewhere).

## Commands

```bash
pnpm dev                    # dev server
pnpm build                  # production build (also type-checks)
pnpm lint                   # eslint
pnpm exec tsc --noEmit      # type-check only
pnpm exec prisma generate   # regenerate the Prisma client after a schema change
pnpm exec prisma migrate dev --name <name>   # create + apply a migration
pnpm exec prisma db seed    # run prisma/seed.ts (library exercise catalog)
pnpm test                   # vitest run (lib/*.ts + every actions.ts, see "Testing" below)
pnpm test:watch             # vitest in watch mode
pnpm test:coverage          # vitest run --coverage — must stay at 100% (lines/branches/fns/stmts)
```

## Conventions worth remembering

- **Weight is always stored in kg** (`SetEntry.weightKg`, `BodyweightEntry.weightKg`). A user's kg/lb preference is a display/input formatting concern only — convert in `lib/units.ts`, never store lb, never let a display rounding feed back into a write. See `docs/PRD.md` → "Units & Data Integrity".
- **PR recalculation is a full recompute, not an incremental update.** `lib/pr.ts`'s `recalculatePersonalRecords(userId, exerciseId)` recomputes all four `PRType` aggregates from the complete current working-set history every call — this is what makes edits/deletes correctly demote a record instead of leaving it stale. See `docs/TECHNICAL_PLAN.md` §4.
- **Round every computed PR metric to 2 decimals (`round2` in `lib/pr.ts`) before comparing or storing it.** `valueKg`/`volumeKg` are `Decimal(_, 2)` columns; the Epley e1RM formula produces float noise (e.g. `120 * (1 + 1/30) === 124.00000000000001`), which would never exactly equal the `124.00` read back from the DB on the next call — without rounding, that mismatch falsely registers as "changed" (and even as a new record) on every subsequent recalculation, forever. Caught by an ad hoc verification script against the real DB, not by lint/types — if you touch this file, re-verify with real data, not just `tsc`.
- **RLS policies on non-directly-owned tables need a join.** `SetEntry` isn't owned by `User` directly — its policy has to walk `SetEntry → WorkoutExercise → WorkoutSession → userId`. Directly-owned tables (`Routine`, `WorkoutSession`, `BodyweightEntry`, `PersonalRecord`, custom `Exercise` rows) use the simpler `auth.uid() = "userId"` form. See `docs/TECHNICAL_PLAN.md` §3.
- **Two DB connection strings, different jobs.** `DATABASE_URL` (pooled/pgbouncer, port 6543) is what the app uses at runtime via `lib/db.ts`. `DIRECT_URL` (unpooled, port 5432) is what `prisma7.config.ts` uses for migrations/introspection — Prisma 7 dropped schema-level `directUrl`, so this split is enforced by which var each file reads, not by Prisma itself.
- **Account deletion needs two systems, not one.** Every Prisma-modeled table cascades from `User` via `ON DELETE CASCADE`, but the Supabase `auth.users` row is separate and needs the Supabase Admin API (`SUPABASE_SERVICE_ROLE_KEY`, server-only) to remove — a Prisma-only delete leaves an orphaned auth account.
- **Social (follow/feed/kudos) is deliberately phase 2**, deferred to keep v1 scope tight. Don't add social tables or UI without checking `docs/PRD.md` first — the schema is designed to add it later without reworking core tables.
- **A schema change needs an actual dev-server restart, not just a hot reload.** `pnpm exec prisma migrate dev` regenerates the Prisma Client on disk, but a long-running `next dev` process won't pick up the new client without restarting. Worse: `pkill -f "next dev"` only reliably kills the launcher process, not the `next-server` worker it spawns — check `lsof -i :3000` / `ps aux | grep next-server` and kill that PID directly if a restart doesn't seem to take effect (symptom: `PrismaClientValidationError: Unknown argument` for a field that's definitely in the schema).

## Testing

Every `lib/*.ts` file and every `actions.ts` (server actions) must stay at
**100% coverage** (lines/branches/functions/statements — enforced by the
`coverage.thresholds` block in `vitest.config.mts`; `pnpm test:coverage`
fails the build if any of the four drops below 100). `page.tsx`/`layout.tsx`
(React Server Components) are deliberately *not* in that gate — they're thin
data-fetching + JSX, better suited to manual/e2e checks than unit tests; see
`vitest.config.mts`'s `coverage.include`. When you add a new `lib/*.ts` file
or `actions.ts` export, add tests for it in the same change, not as a
follow-up.

- **Tests hit a real local Postgres database, never the dev Supabase
  project.** Mocking Prisma would only test that the mock does what you told
  it to — it's exactly the kind of test that would've missed the real bugs
  this project already hit (the case-insensitive unique-index race, the PR
  float-rounding bug). One-time setup:
  ```bash
  brew install postgresql@14 && brew services start postgresql@14
  createdb -h 127.0.0.1 -p <your port, check `brew services info postgresql@14`> fitlogger_test
  cp .env.test.example .env.test   # then edit DATABASE_URL/DIRECT_URL for your local host/port/user
  DATABASE_URL=... DIRECT_URL=... pnpm exec prisma migrate deploy   # apply the real migration history
  ```
  `vitest.config.mts` loads `.env.test` (git-ignored, like `.env`) at config
  eval time, before any test file imports `lib/db.ts`. Re-run `prisma migrate
  deploy` against the test DB after adding a new migration, same as you
  would for the real one.
- **Test files run sequentially, not in parallel (`fileParallelism: false`
  in `vitest.config.mts`).** Every DB-touching test calls `resetDb()`
  (`tests/helpers/db.ts`, a `TRUNCATE ... CASCADE` on every app table) in
  `afterEach` for isolation. If files ran in parallel, one file's reset would
  race another file's in-progress fixtures against the same real database —
  this isn't a mocked-per-test connection, it's one shared Postgres instance.
- **Server actions are tested as real functions, not through HTTP.** Two
  things get mocked (`tests/helpers/`), everything else is real:
  - `next/navigation`'s `redirect()` — real Next.js has it throw a special
    error the framework catches; `tests/helpers/redirect.ts`'s
    `redirectMock`/`RedirectSignal` mirror that so `captureRedirect(() =>
    someAction(formData))` returns the target URL instead of letting the
    throw escape.
  - `@/lib/supabase/server`'s `createClient()` — real Supabase auth isn't
    reachable/desirable in tests; `tests/helpers/supabase.ts`'s
    `createFakeSupabase()`/`fakeAuthedUser()` stub just the `auth.*` methods
    each action actually calls.
  - Everything else (Prisma queries, `lib/pr.ts`, `lib/muscle-groups.ts`) runs
    for real against the local test DB.
- **A pre-check + unique-constraint race (the exercise/muscle-group
  duplicate-name pattern) is tested by forcing the race, not skipping it.**
  `vi.spyOn(prisma.exercise, "findFirst").mockResolvedValueOnce(null)` makes
  the app-level pre-check report "nothing found" while a real conflicting row
  already exists, so the subsequent `create()` hits the real DB unique index
  and throws a genuine `P2002` — see `app/(app)/exercises/actions.test.ts` for
  the pattern. Don't skip this branch just because the pre-check "usually"
  catches it; that's exactly the kind of bug this project has shipped before.

## Status

Scaffolding complete: Next.js + Tailwind + Prisma schema (all MVP models) +
`lib/db.ts`, `lib/units.ts` implemented, `lib/pr.ts` stubbed. Supabase
project is connected — `.env` has real credentials, the initial migration
(`prisma/migrations/..._init`) is applied, and the seed script has run
successfully. RLS policies are still just designed on paper
(`docs/TECHNICAL_PLAN.md` §3), not yet written — **and note the Prisma
connection (`DATABASE_URL`/`DIRECT_URL`) uses Supabase's `postgres` role,
which has `BYPASSRLS`, so RLS won't actually protect app queries even once
policies exist. Every server action must do its own
`where: { userId: ... }` filtering — RLS here is defense-in-depth for the
Data API only (currently disabled), not the primary boundary.**

**Auth is complete** (`docs/TECHNICAL_PLAN.md` §8 step 2): sign-up creates
both a Supabase auth user and a matching Prisma `User` row (id kept in sync
explicitly, not via the schema's default); sign-in/sign-out work;
`proxy.ts` + `lib/supabase/middleware.ts` refresh the session on every
request and redirect signed-out users off protected app routes /
signed-in users off the auth routes; `app/(app)/dashboard/page.tsx` reads
the real signed-in user's Prisma row as the proof this all connects
end-to-end. The homepage (`app/page.tsx`) checks auth state itself and
redirects to `/dashboard` if signed in, otherwise shows Sign Up/Sign In
links — it was briefly a dead-end scaffolding placeholder with no links at
all; fixed.

**Password reset exists** (`app/(auth)/reset-password/`): request page ->
Supabase emails a link (anti-enumeration generic response, same posture as
sign-up) -> `/reset-password/confirm` exchanges the emailed `code` for a
session via `exchangeCodeForSession`, then lets the user set a new
password via `auth.updateUser`. Needs `NEXT_PUBLIC_SITE_URL` added to
Supabase's Authentication → URL Configuration → Redirect URLs allowlist
(as `<value>/reset-password/confirm`) or the emailed link fails. Built
after a real bug: Supabase's `signUp()` returns a success-shaped response
(no error) for an already-registered email as an anti-enumeration measure,
so sign-up's own error handling only ever saw the resulting Prisma
`P2002` on `User.email` — now caught specifically and pointed at sign-in /
this reset flow instead of the dead-end "contact support" message it used
to show. **Operational note**: Supabase's free-tier built-in mailer has a
low send-rate limit — testing sign-up/reset repeatedly in a short span
will hit `429 over_email_send_rate_limit`. `requestPasswordReset` now
surfaces that specific error to the user (it reveals nothing about any
individual account) instead of silently swallowing it like other
reset-related errors. If "no email arrives" comes up again, check this
before assuming the code regressed; a real deployment needs custom SMTP
configured in Supabase (Project Settings → Auth → SMTP Settings), not the
shared default.

**Exercise library UI is complete** (`docs/TECHNICAL_PLAN.md` §8 step 3):
`app/(app)/exercises/page.tsx` lists library exercises (`ownerId: null`)
plus the signed-in user's own custom ones, grouped by muscle group; the
"add custom exercise" form (`app/(app)/exercises/actions.ts`) creates one
scoped to `ownerId: user.id`. `app/(app)/exercises/[exerciseId]/page.tsx`
(per-exercise history) is still a stub for its progress *chart* — it now
shows PRs and full history (see PR detection below), just not a graph yet.
Nav links between app pages were added to `app/(app)/layout.tsx` alongside
sign-out. No "Custom" badge on custom exercises per request — nothing
distinguishes them visually from library ones.

**Muscle group / category system** (`lib/muscle-groups.ts`): a fixed
canonical display order — Chest, Back, Shoulders, Biceps, Triceps, Quads,
Hamstrings, Calves, Abductor/Adductor, Abs, Forearms — plus a `MuscleGroup`
model for user-scoped custom categories (addable/deletable from the
Exercises page). Deleting a category is blocked while any exercise still
uses it (no exercise-reassignment UI exists to fall back on). Exercise
creation everywhere (Exercises page, and the in-session "add exercise"
flow) uses a `<select>` built from `getAvailableMuscleGroups()` — canonical
+ the user's own custom ones — not a free-text input, so a stray/unregistered
category string can no longer get created going forward.

**Case-insensitive name uniqueness is enforced at the DB level, not just
app-level pre-checks.** A real duplicate ("Smith Machine Press" / "smith
Machine Press", same user) existed in production data: the app's
`findFirst` pre-check before `create` has a race window between two
concurrent requests, and `@@unique([ownerId, name])` in `schema.prisma` is
case-SENSITIVE so it didn't catch it either. The actual fix is in migration
`20261020044809_add_muscle_groups`'s hand-added raw SQL:
`CREATE UNIQUE INDEX ... ON "Exercise" ("ownerId", lower("name"))` (and the
same for `MuscleGroup`). Prisma's schema DSL can't express a function-based
index, so this kind of constraint always needs a migration hand-edit —
`prisma migrate dev --create-only`, edit the generated `migration.sql`,
then `prisma migrate dev` (no name) to apply. If another case-insensitive
uniqueness need comes up, follow the same pattern rather than trusting the
app-level check alone.

**Core workout logging is complete** (`docs/TECHNICAL_PLAN.md` §8 step 4):
`app/(app)/workout/new/page.tsx` starts a `WorkoutSession` (optional custom
name, defaults to "Lifting Session" — `WorkoutSession.name`); the session
page (`app/(app)/workout/[sessionId]/`) adds exercises (reusing the
library-or-create-custom lookup from the Exercises page), logs `SetEntry`
rows (weight converted to canonical kg via `lib/units.ts`, optional
warm-up/working tag and RPE), and saves a free-text note per exercise
(`WorkoutExercise.note`). Finishing a session sets `finishedAt` and
switches the page to a read-only view (no edit forms). The dashboard shows
real history (name, date, exercise count, status) with inline rename. Every
`WorkoutSession`/`WorkoutExercise` query in these actions is explicitly
scoped to the authenticated user (directly or via the `session` relation) —
same reasoning as the RLS note above.

**PR detection is complete** (`docs/TECHNICAL_PLAN.md` §8 step 5):
`lib/pr.ts`'s `recalculatePersonalRecords` is fully implemented (see the
"round every computed metric" convention above — that bug was real and was
only caught by testing against actual data). `logSet`
(`app/(app)/workout/[sessionId]/actions.ts`) calls it after every working-set
create (warm-ups are skipped — they can never affect a record) and redirects
with `?pr=TYPE,TYPE` for any genuinely new record, which the session page
renders as a celebration banner; sets that currently hold a record get an
inline "🏆 PR" badge (`prTypesBySetEntryId` lookup, keyed by `PersonalRecord.setEntryId` — note `SESSION_VOLUME` has no single owning set, so it's excluded from that badge and only shown in the banner/exercise page).
`app/(app)/exercises/[exerciseId]/page.tsx` (previously a stub) now shows
the exercise's current PRs plus its full set history — this is the "PR
history view" from `docs/PRD.md`'s MVP feature list; the progress *chart*
(Recharts) is still a separate, not-yet-done TODO on that page.

**Edit/delete UI is complete** (`docs/TECHNICAL_PLAN.md` §8 step 6):
`updateSet`/`deleteSet`/`deleteWorkoutExercise`
(`app/(app)/workout/[sessionId]/actions.ts`) and `deleteWorkoutSession`
(`app/(app)/workout/actions.ts`) all call `recalculatePersonalRecords`
afterward, same as `logSet` — verified against real data (ownership-join
scoping, cascade deletes, and PR promotion/demotion/clearing) with another
throwaway script, same approach as the PR-detection verification above.
Editing/deleting works even on a *finished* session (only adding new
sets/exercises stays locked once finished) — correcting history is
explicitly in scope per `docs/PRD.md` "Data editing", distinct from new
logging. `updateSet` deliberately never passes a `?pr=` celebration param
even if a record moves, per `docs/TECHNICAL_PLAN.md` §4 ("only fire that
celebration on create, never on a retroactive edit"). The two genuinely
destructive actions (remove exercise, delete whole workout) go through a
new `components/ConfirmSubmitButton.tsx` (client component, `window.confirm`
before submit); single-set delete doesn't bother — low-stakes, trivially
redone by re-logging.

**Routines UI is complete** (`docs/TECHNICAL_PLAN.md` §8 step 7 /
`docs/PRD.md` workflow #4): `app/(app)/routines/page.tsx` lists the user's
routines with exercise counts + a create form; `app/(app)/routines/[id]/
page.tsx` is the editor (rename, delete, add/edit/remove exercises with
optional target sets/reps, reusing the same library-or-create-custom lookup
as the workout session page) plus a "recent workouts from this routine"
list. `workout/new` now shows a routine picker when the user has any;
`startWorkoutSession` (`app/(app)/workout/actions.ts`) copies the routine's
`RoutineExercise` rows into the new session as `WorkoutExercise` rows (sets
themselves are still logged fresh each session — a routine only pre-fills
*which* exercises, not weights/reps). Deleting a routine `SetNull`s
`WorkoutSession.routineId` on any past session that used it rather than
deleting that history (schema: `onDelete: SetNull`).

Every other app page (`bodyweight`, `settings`) is still a static
placeholder.

**Operational note**: this Supabase project is on the free tier and
auto-pauses after a period of inactivity — its pooler connection fails with
`(ENOTFOUND) tenant/user ... not found` while paused, even though the
REST/Auth API comes back online first. Resuming it from the dashboard can
take a few minutes for the pooler specifically to catch up after the
REST API already looks fine — if `pnpm dev` or a verification script can't
connect, check the dashboard before assuming the code broke.

Remaining build order (`docs/TECHNICAL_PLAN.md` §8): bodyweight UI →
account deletion + RLS verification → PWA polish. Update this section as
steps land so a fresh session can see what's actually done vs. still
planned.

**Test suite exists now** (see "Testing" above): `lib/units.ts`,
`lib/muscle-groups.ts`, `lib/pr.ts`, and every `actions.ts` across both
`app/(app)` and `app/(auth)` are at 100% coverage (195 tests as of routines
UI landing). This was added retroactively alongside the routines feature —
when you build bodyweight UI / account deletion next, write their tests in
the same change rather than as a follow-up.
