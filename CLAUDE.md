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
end-to-end.

**Exercise library UI is complete** (`docs/TECHNICAL_PLAN.md` §8 step 3):
`app/(app)/exercises/page.tsx` lists library exercises (`ownerId: null`)
plus the signed-in user's own custom ones, grouped by muscle group; the
"add custom exercise" form (`app/(app)/exercises/actions.ts`) creates one
scoped to `ownerId: user.id`, with a case-insensitive duplicate-name check
(the DB's `@@unique([ownerId, name])` alone is case-sensitive) backed by a
P2002 catch as a fallback. `app/(app)/exercises/[exerciseId]/page.tsx`
(per-exercise history) is still a stub — it depends on workout logging
existing, which is the next step. Nav links between app pages were added
to `app/(app)/layout.tsx` alongside sign-out.

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
(Recharts) is still a separate, not-yet-done TODO on that page. **No UI
calls `recalculatePersonalRecords` on edit/delete yet** — there is no
edit/delete UI at all, that's the next build-order step, but the function
itself is already written to handle it correctly (full recompute, not
incremental) per `docs/TECHNICAL_PLAN.md` §4.

Every other app page (`routines/*`, `bodyweight`, `settings`) is still a
static placeholder.

Remaining build order (`docs/TECHNICAL_PLAN.md` §8): edit/delete UI (wire
into the existing `recalculatePersonalRecords`) → routines UI → bodyweight
UI → account deletion + RLS verification → PWA polish. Update this section
as steps land so a fresh session can see what's actually done vs. still
planned.
