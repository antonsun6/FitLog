# Technical Implementation Plan

Companion to [`PRD.md`](./PRD.md). This defines *how* the MVP gets built: schema, policies, structure, and algorithms. Still no application code — this is design, per the "don't code until told" instruction.

## 1. Stack (confirmed in PRD)

Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres + Auth + RLS) · Prisma · Vercel · Recharts.

## 2. Database Schema (Prisma)

```prisma
model User {
  id              String   @id @default(uuid()) // matches Supabase auth.users.id
  email           String   @unique
  displayName     String
  unitPreference  Unit     @default(KG)
  createdAt       DateTime @default(now())

  exercises        Exercise[]
  routines         Routine[]
  workoutSessions  WorkoutSession[]
  personalRecords  PersonalRecord[]
  bodyweightEntries BodyweightEntry[]
}

enum Unit {
  KG
  LB
}

model Exercise {
  id          String   @id @default(uuid())
  name        String
  muscleGroup String                     // e.g. "Chest", "Back", "Legs"
  isCustom    Boolean  @default(false)
  ownerId     String?                    // null for library exercises
  owner       User?    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  routineExercises RoutineExercise[]
  workoutExercises WorkoutExercise[]
  personalRecords  PersonalRecord[]

  @@unique([ownerId, name]) // prevent duplicate custom exercise names per user
}

model Routine {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime @default(now())

  exercises        RoutineExercise[]
  workoutSessions  WorkoutSession[]       // sessions started from this routine
}

model RoutineExercise {
  id          String   @id @default(uuid())
  routineId   String
  routine     Routine  @relation(fields: [routineId], references: [id], onDelete: Cascade)
  exerciseId  String
  exercise    Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  targetSets  Int?
  targetReps  Int?
  order       Int      // display order within the routine
}

model WorkoutSession {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  routineId  String?
  routine    Routine?  @relation(fields: [routineId], references: [id], onDelete: SetNull)
  startedAt  DateTime  @default(now())
  finishedAt DateTime?

  exercises WorkoutExercise[]
}

model WorkoutExercise {
  id         String   @id @default(uuid())
  sessionId  String
  session    WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exerciseId String
  exercise   Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  note       String?
  order      Int

  sets SetEntry[]
}

model SetEntry {
  id                String   @id @default(uuid())
  workoutExerciseId String
  workoutExercise   WorkoutExercise @relation(fields: [workoutExerciseId], references: [id], onDelete: Cascade)
  weightKg          Decimal  @db.Decimal(6,2)   // canonical unit — see PRD "Units & Data Integrity"
  reps              Int
  setType           SetType  @default(WORKING)
  rpe               Decimal? @db.Decimal(3,1)   // optional, e.g. 8.5
  order             Int
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

enum SetType {
  WARMUP
  WORKING
}

model PersonalRecord {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  exerciseId      String
  exercise        Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  recordType      PRType
  valueKg         Decimal? @db.Decimal(6,2)     // for MAX_WEIGHT, BEST_E1RM
  reps            Int?                          // for MAX_WEIGHT (reps at that weight), MAX_REPS
  volumeKg        Decimal? @db.Decimal(8,2)     // for SESSION_VOLUME
  setEntryId      String?                       // source set, for MAX_WEIGHT / MAX_REPS / BEST_E1RM
  achievedAt      DateTime

  @@unique([userId, exerciseId, recordType])
}

enum PRType {
  MAX_WEIGHT
  MAX_REPS
  BEST_E1RM
  SESSION_VOLUME
}

model BodyweightEntry {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  weightKg  Decimal  @db.Decimal(5,2)
  loggedAt  DateTime @default(now())
}
```

**Phase 2 tables (not created yet, documented for forward-compatibility):** `Follow(followerId, followeeId, status)`, `KudosReaction(workoutSessionId, userId)`. Nothing above needs to change shape to add these later — they're purely additive.

Notes:
- Every child table cascades from `User` (directly or transitively) → account deletion is one `DELETE FROM users WHERE id = ...`, per the PRD's account-deletion requirement.
- `weightKg` / `volumeKg` use `Decimal`, not `Float`, to avoid floating-point drift across repeated unit conversions.
- `PersonalRecord` is one row per (user, exercise, recordType) — recomputation *replaces* the row rather than appending, so "current PR" is always a direct lookup, no aggregation query needed on read.

## 3. Row Level Security (Supabase)

Every user-owned table gets the same pattern. Example for `SetEntry` (via its `workoutExercise → session → userId` chain — RLS on a non-direct-owner table needs a join, not just `auth.uid() = user_id`):

```sql
alter table "SetEntry" enable row level security;

create policy "select own sets" on "SetEntry" for select using (
  exists (
    select 1 from "WorkoutExercise" we
    join "WorkoutSession" ws on ws.id = we."sessionId"
    where we.id = "SetEntry"."workoutExerciseId" and ws."userId" = auth.uid()
  )
);
-- same shape for insert (with check), update, delete
```

Directly-owned tables (`Routine`, `WorkoutSession`, `BodyweightEntry`, `PersonalRecord`, custom `Exercise` rows) use the simpler `auth.uid() = "userId"` form. Library exercises (`ownerId IS NULL`) get a `select`-only policy open to all authenticated users, with no insert/update/delete policy (only the seed script, running with the service role, can write them).

**Test plan**: an RLS integration test suite (two seeded test users, assert user B can never read/write user A's rows across every table) runs before each deploy — this is the one piece of security infrastructure worth automating early, since a silent RLS gap is invisible until someone's data leaks.

## 4. PR Detection & Recalculation

**When it runs**: synchronously after any `SetEntry` create, update, or delete (inside the same server action/transaction, not a background job — v1 doesn't need that complexity).

**Per exercise, four record types are tracked independently** (matches `PRType` enum):
- `MAX_WEIGHT` — heaviest `weightKg` across all working sets for that exercise.
- `MAX_REPS` — most reps in a single working set (any weight).
- `BEST_E1RM` — highest estimated 1-rep max via the Epley formula: `weight × (1 + reps / 30)`.
- `SESSION_VOLUME` — highest single-session total (`Σ weight × reps` across that exercise's working sets in one session).

**Algorithm** (on any mutation to a `SetEntry` belonging to exercise E for user U):
1. Recompute all four aggregates for (U, E) from the full current `SetEntry` history (working sets only) — a straightforward `MAX`/aggregate query, not incremental math. This is what makes deletes safe: recomputing from scratch, rather than only checking "is this new value bigger," automatically handles demotion when the record-holding set itself gets edited or deleted.
2. Upsert the `PersonalRecord` row per type if the recomputed value differs from what's stored.
3. Return which (if any) record types changed, so the UI can show a "New PR!" moment right after logging a set — but only fire that celebration on create, never on a retroactive edit.

This directly addresses the PRD's flagged risk: deleting an all-time-best set naturally falls out to the next-best set because it's a full recompute, not a stored "was this the max" flag that goes stale.

## 5. Units

A single conversion module (`lib/units.ts`, pure functions, heavily unit-tested):
- `lbToKg(lb: number): number` / `kgToLb(kg: number): number` using the standard `1 lb = 0.45359237 kg` constant.
- All writes convert the user's input to kg *before* hitting the database (using the precise constant, not a rounded one).
- All reads stay in kg from Prisma; formatting to the user's display preference happens in the UI layer only, at render time.
- Display rounding (e.g., 1 decimal place) is cosmetic and never fed back into a write.

## 6. Route / Folder Structure (Next.js App Router, sketch)

```
app/
  (auth)/sign-in, sign-up
  (app)/
    dashboard/                 history feed + "Start Workout" CTA
    workout/new, workout/[sessionId]
    exercises/[exerciseId]     per-exercise history + chart + PRs
    routines/, routines/[id]
    bodyweight/
    settings/                  unit preference, account deletion
lib/
  db.ts (Prisma client), units.ts, pr.ts (PR calc), supabase/ (auth helpers)
prisma/
  schema.prisma, seed.ts, seed-data/exercises.json
```

Server actions live colocated with the routes that use them, matching Next.js App Router convention — no separate REST API layer needed.

## 7. Seed Scripts

- `prisma/seed-data/exercises.json`: curated list of ~50–80 common exercises (`name`, `muscleGroup`), covering the standard push/pull/legs/core split. Written as data, reviewed once, then loaded by `prisma/seed.ts` via the service role (bypasses RLS, since library exercises have `ownerId: null`).
- A second `seed-demo.ts` (dev-only, never run in production) generates synthetic users/sessions/sets for local development and demoing — deferred until after core logging exists, since it depends on those models.

## 8. Build Order (technical granularity, mirrors PRD's Next Steps §4)

1. Scaffold repo, Supabase project, Prisma connection, Vercel deploy — confirm a "hello world" round-trips through all three before building features.
2. Auth (Supabase Auth + Next.js middleware for session), `User` profile + unit preference.
3. `Exercise` model + `seed.ts` + custom exercise creation UI.
4. `WorkoutSession` → `WorkoutExercise` → `SetEntry` logging flow + history list/detail views.
5. `PersonalRecord` model + recalculation logic (§4) + PR history view.
6. Edit/delete UI for sets/exercises/sessions, wired to trigger the same recalculation path.
7. `Routine`/`RoutineExercise` + start-session-from-routine + adherence view.
8. `BodyweightEntry` log + trend chart.
9. Account deletion flow + RLS/cascade verification suite (§3).
10. PWA manifest/service worker + mobile UX pass.

## 9. Testing Strategy

- **Unit tests** (Vitest): `lib/units.ts` conversion round-trips, PR recalculation logic (create/edit/delete/demotion cases) — these are the two places identified in the PRD as likely to silently corrupt data.
- **RLS integration tests**: two seeded users, assert cross-user reads/writes fail, run against every table before deploy.
- **Manual QA checklist**: run through each PRD user workflow (§ Key User Workflows) against the actually-deployed Vercel preview after each build-order step, not just at the end.

## Open Decision Before Coding Starts

Prisma is recommended (per PRD), but confirm before scaffolding — this is the one architectural choice still worth a final gut-check since it shapes the whole `lib/db.ts` layer and migration workflow.
