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
- **PR recalculation is a full recompute, not an incremental update.** `lib/pr.ts` (stub) must, on every `SetEntry` create/update/delete, recompute all four `PRType` aggregates for that (user, exercise) from the complete current history — this is what makes edits/deletes correctly demote a record instead of leaving it stale. See `docs/TECHNICAL_PLAN.md` §4.
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
real history (name, date, exercise count, status) with inline rename.
**No PR detection is wired in yet** — `lib/pr.ts` is still the stub from
scaffolding; that's the next step. Every `WorkoutSession`/`WorkoutExercise`
query in these actions is explicitly scoped to the authenticated user
(directly or via the `session` relation) — same reasoning as the RLS note
above.

Every other app page (`exercises/[exerciseId]` history, `routines/*`,
`bodyweight`, `settings`) is still a static placeholder.

Remaining build order (`docs/TECHNICAL_PLAN.md` §8): PR detection
implementation → edit/delete UI → routines UI → bodyweight UI → account
deletion + RLS verification → PWA polish. Update this section as steps
land so a fresh session can see what's actually done vs. still planned.
