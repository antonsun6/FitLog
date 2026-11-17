-- Row Level Security policies — see docs/TECHNICAL_PLAN.md §3 and the RLS
-- note in CLAUDE.md. IMPORTANT: this is defense-in-depth only. The app's
-- own Prisma connection (DATABASE_URL/DIRECT_URL) uses Supabase's
-- "postgres" role, which has BYPASSRLS, so none of this protects the app's
-- own queries — the actual boundary is every server action's explicit
-- `where: { userId: ... }` (or join-based equivalent) filtering, already in
-- place and covered by the test suite. These policies only matter if
-- Supabase's Data API is ever turned on, or another client connects as
-- `anon`/`authenticated`. Data API is currently disabled for this project.
--
-- Pattern: directly-owned tables (userId/ownerId column) use the simple
-- `auth.uid()::text = "userId"` form; non-directly-owned tables walk the FK chain
-- to the owning row via EXISTS.

-- ============================================================
-- User — row keyed by its own id (matches auth.users.id)
-- ============================================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own profile" ON "User" FOR SELECT
  USING (auth.uid()::text = id);
CREATE POLICY "update own profile" ON "User" FOR UPDATE
  USING (auth.uid()::text = id) WITH CHECK (auth.uid()::text = id);
CREATE POLICY "insert own profile" ON "User" FOR INSERT
  WITH CHECK (auth.uid()::text = id);
-- No DELETE policy: account deletion goes through the service-role admin
-- path (app/(app)/settings/actions.ts), never a direct client delete.

-- ============================================================
-- Exercise — library rows (ownerId IS NULL) are read-only to everyone
-- signed in; custom rows are full CRUD for their owner only. Only the seed
-- script (service role, bypasses RLS) can write library rows.
-- ============================================================
ALTER TABLE "Exercise" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select library exercises" ON "Exercise" FOR SELECT
  USING ("ownerId" IS NULL);
CREATE POLICY "select own exercises" ON "Exercise" FOR SELECT
  USING (auth.uid()::text = "ownerId");
CREATE POLICY "insert own exercises" ON "Exercise" FOR INSERT
  WITH CHECK (auth.uid()::text = "ownerId");
CREATE POLICY "update own exercises" ON "Exercise" FOR UPDATE
  USING (auth.uid()::text = "ownerId") WITH CHECK (auth.uid()::text = "ownerId");
CREATE POLICY "delete own exercises" ON "Exercise" FOR DELETE
  USING (auth.uid()::text = "ownerId");

-- ============================================================
-- MuscleGroup — always user-scoped, no library equivalent.
-- ============================================================
ALTER TABLE "MuscleGroup" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own muscle groups" ON "MuscleGroup" FOR SELECT
  USING (auth.uid()::text = "ownerId");
CREATE POLICY "insert own muscle groups" ON "MuscleGroup" FOR INSERT
  WITH CHECK (auth.uid()::text = "ownerId");
CREATE POLICY "update own muscle groups" ON "MuscleGroup" FOR UPDATE
  USING (auth.uid()::text = "ownerId") WITH CHECK (auth.uid()::text = "ownerId");
CREATE POLICY "delete own muscle groups" ON "MuscleGroup" FOR DELETE
  USING (auth.uid()::text = "ownerId");

-- ============================================================
-- Routine — directly owned.
-- ============================================================
ALTER TABLE "Routine" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own routines" ON "Routine" FOR SELECT
  USING (auth.uid()::text = "userId");
CREATE POLICY "insert own routines" ON "Routine" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "update own routines" ON "Routine" FOR UPDATE
  USING (auth.uid()::text = "userId") WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "delete own routines" ON "Routine" FOR DELETE
  USING (auth.uid()::text = "userId");

-- ============================================================
-- RoutineExercise — owned via Routine.userId.
-- ============================================================
ALTER TABLE "RoutineExercise" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own routine exercises" ON "RoutineExercise" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "Routine" r
    WHERE r.id = "RoutineExercise"."routineId" AND r."userId" = auth.uid()::text
  ));
CREATE POLICY "insert own routine exercises" ON "RoutineExercise" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Routine" r
    WHERE r.id = "RoutineExercise"."routineId" AND r."userId" = auth.uid()::text
  ));
CREATE POLICY "update own routine exercises" ON "RoutineExercise" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "Routine" r
    WHERE r.id = "RoutineExercise"."routineId" AND r."userId" = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Routine" r
    WHERE r.id = "RoutineExercise"."routineId" AND r."userId" = auth.uid()::text
  ));
CREATE POLICY "delete own routine exercises" ON "RoutineExercise" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "Routine" r
    WHERE r.id = "RoutineExercise"."routineId" AND r."userId" = auth.uid()::text
  ));

-- ============================================================
-- WorkoutSession — directly owned.
-- ============================================================
ALTER TABLE "WorkoutSession" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own sessions" ON "WorkoutSession" FOR SELECT
  USING (auth.uid()::text = "userId");
CREATE POLICY "insert own sessions" ON "WorkoutSession" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "update own sessions" ON "WorkoutSession" FOR UPDATE
  USING (auth.uid()::text = "userId") WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "delete own sessions" ON "WorkoutSession" FOR DELETE
  USING (auth.uid()::text = "userId");

-- ============================================================
-- WorkoutExercise — owned via WorkoutSession.userId.
-- ============================================================
ALTER TABLE "WorkoutExercise" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own workout exercises" ON "WorkoutExercise" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "WorkoutSession" ws
    WHERE ws.id = "WorkoutExercise"."sessionId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "insert own workout exercises" ON "WorkoutExercise" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "WorkoutSession" ws
    WHERE ws.id = "WorkoutExercise"."sessionId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "update own workout exercises" ON "WorkoutExercise" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "WorkoutSession" ws
    WHERE ws.id = "WorkoutExercise"."sessionId" AND ws."userId" = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "WorkoutSession" ws
    WHERE ws.id = "WorkoutExercise"."sessionId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "delete own workout exercises" ON "WorkoutExercise" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "WorkoutSession" ws
    WHERE ws.id = "WorkoutExercise"."sessionId" AND ws."userId" = auth.uid()::text
  ));

-- ============================================================
-- SetEntry — owned via WorkoutExercise -> WorkoutSession.userId (two-level
-- join; see docs/TECHNICAL_PLAN.md §3's own example for this table).
-- ============================================================
ALTER TABLE "SetEntry" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own sets" ON "SetEntry" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "WorkoutExercise" we
    JOIN "WorkoutSession" ws ON ws.id = we."sessionId"
    WHERE we.id = "SetEntry"."workoutExerciseId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "insert own sets" ON "SetEntry" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "WorkoutExercise" we
    JOIN "WorkoutSession" ws ON ws.id = we."sessionId"
    WHERE we.id = "SetEntry"."workoutExerciseId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "update own sets" ON "SetEntry" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "WorkoutExercise" we
    JOIN "WorkoutSession" ws ON ws.id = we."sessionId"
    WHERE we.id = "SetEntry"."workoutExerciseId" AND ws."userId" = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "WorkoutExercise" we
    JOIN "WorkoutSession" ws ON ws.id = we."sessionId"
    WHERE we.id = "SetEntry"."workoutExerciseId" AND ws."userId" = auth.uid()::text
  ));
CREATE POLICY "delete own sets" ON "SetEntry" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "WorkoutExercise" we
    JOIN "WorkoutSession" ws ON ws.id = we."sessionId"
    WHERE we.id = "SetEntry"."workoutExerciseId" AND ws."userId" = auth.uid()::text
  ));

-- ============================================================
-- PersonalRecord — directly owned. NOTE: in practice this table is only
-- ever written by lib/pr.ts's server-side recalculation, never directly by
-- a client — full owner CRUD here is purely the documented blanket pattern
-- for directly-owned tables (TECHNICAL_PLAN.md §3), kept consistent rather
-- than inventing an undocumented exception. Revisit (read-only to the
-- owner, no INSERT/UPDATE/DELETE policy at all) before ever enabling the
-- Data API for real, since an open UPDATE policy here would let a user
-- fabricate their own PRs through that path.
-- ============================================================
ALTER TABLE "PersonalRecord" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own records" ON "PersonalRecord" FOR SELECT
  USING (auth.uid()::text = "userId");
CREATE POLICY "insert own records" ON "PersonalRecord" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "update own records" ON "PersonalRecord" FOR UPDATE
  USING (auth.uid()::text = "userId") WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "delete own records" ON "PersonalRecord" FOR DELETE
  USING (auth.uid()::text = "userId");

-- ============================================================
-- BodyweightEntry — directly owned.
-- ============================================================
ALTER TABLE "BodyweightEntry" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own bodyweight entries" ON "BodyweightEntry" FOR SELECT
  USING (auth.uid()::text = "userId");
CREATE POLICY "insert own bodyweight entries" ON "BodyweightEntry" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "update own bodyweight entries" ON "BodyweightEntry" FOR UPDATE
  USING (auth.uid()::text = "userId") WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "delete own bodyweight entries" ON "BodyweightEntry" FOR DELETE
  USING (auth.uid()::text = "userId");
