import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { PRType } from "../generated/prisma/client";
import { resetDb } from "./helpers/db";
import { asAnonymous, asUser } from "./helpers/rls";

/**
 * Verifies the RLS policies in
 * prisma/migrations/20261117062903_add_rls_policies/migration.sql actually
 * do what they say — see docs/TECHNICAL_PLAN.md §3's test plan ("two seeded
 * test users, assert user B can never read/write user A's rows across every
 * table"). This is NOT the app's primary security boundary (CLAUDE.md: the
 * app's own Prisma role has BYPASSRLS, so every server action's own
 * `where: userId` filtering is what actually protects it — already covered
 * by the actions.test.ts suites). This file exists so that IF the Data API
 * is ever turned on, the defense-in-depth policies are proven correct, not
 * just "written and hoped."
 *
 * Runs against the real `app_authenticated` role (not the table owner
 * Prisma normally connects as) via tests/helpers/rls.ts — see CLAUDE.md
 * "Testing" for the one-time local setup this depends on.
 */

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

type Fixtures = Awaited<ReturnType<typeof seedTwoUsers>>;

async function seedTwoUsers() {
  const userA = await prisma.user.create({ data: { email: `a-${randomUUID()}@example.com`, displayName: "A" } });
  const userB = await prisma.user.create({ data: { email: `b-${randomUUID()}@example.com`, displayName: "B" } });

  const libraryExercise = await prisma.exercise.create({ data: { name: `Library-${randomUUID()}`, muscleGroup: "Chest" } });
  const exerciseA = await prisma.exercise.create({ data: { name: `Custom-A-${randomUUID()}`, muscleGroup: "Chest", ownerId: userA.id, isCustom: true } });
  const exerciseB = await prisma.exercise.create({ data: { name: `Custom-B-${randomUUID()}`, muscleGroup: "Chest", ownerId: userB.id, isCustom: true } });

  const muscleGroupA = await prisma.muscleGroup.create({ data: { name: `Grip-A-${randomUUID()}`, ownerId: userA.id } });
  const muscleGroupB = await prisma.muscleGroup.create({ data: { name: `Grip-B-${randomUUID()}`, ownerId: userB.id } });

  const routineA = await prisma.routine.create({ data: { userId: userA.id, name: "Push A" } });
  const routineB = await prisma.routine.create({ data: { userId: userB.id, name: "Push B" } });

  const routineExerciseA = await prisma.routineExercise.create({ data: { routineId: routineA.id, exerciseId: exerciseA.id, order: 0 } });
  const routineExerciseB = await prisma.routineExercise.create({ data: { routineId: routineB.id, exerciseId: exerciseB.id, order: 0 } });

  const sessionA = await prisma.workoutSession.create({ data: { userId: userA.id } });
  const sessionB = await prisma.workoutSession.create({ data: { userId: userB.id } });

  const workoutExerciseA = await prisma.workoutExercise.create({ data: { sessionId: sessionA.id, exerciseId: exerciseA.id, order: 0 } });
  const workoutExerciseB = await prisma.workoutExercise.create({ data: { sessionId: sessionB.id, exerciseId: exerciseB.id, order: 0 } });

  const setA = await prisma.setEntry.create({ data: { workoutExerciseId: workoutExerciseA.id, weightKg: 100, reps: 5, order: 0 } });
  const setB = await prisma.setEntry.create({ data: { workoutExerciseId: workoutExerciseB.id, weightKg: 100, reps: 5, order: 0 } });

  const recordA = await prisma.personalRecord.create({ data: { userId: userA.id, exerciseId: exerciseA.id, recordType: PRType.MAX_WEIGHT, valueKg: 100, reps: 5, setEntryId: setA.id, achievedAt: new Date() } });
  const recordB = await prisma.personalRecord.create({ data: { userId: userB.id, exerciseId: exerciseB.id, recordType: PRType.MAX_WEIGHT, valueKg: 100, reps: 5, setEntryId: setB.id, achievedAt: new Date() } });

  const bodyweightA = await prisma.bodyweightEntry.create({ data: { userId: userA.id, weightKg: 80 } });
  const bodyweightB = await prisma.bodyweightEntry.create({ data: { userId: userB.id, weightKg: 80 } });

  return {
    userA, userB, libraryExercise, exerciseA, exerciseB, muscleGroupA, muscleGroupB,
    routineA, routineB, routineExerciseA, routineExerciseB, sessionA, sessionB,
    workoutExerciseA, workoutExerciseB, setA, setB, recordA, recordB, bodyweightA, bodyweightB,
  };
}

let fx: Fixtures;
beforeEach(async () => {
  fx = await seedTwoUsers();
});

describe("SELECT visibility — every table", () => {
  it("User: each user sees only their own profile row", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "User"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.userA.id]);

    const asB = await asUser(fx.userB.id, (q) => q('SELECT id FROM "User"'));
    expect(asB.rows.map((r) => r.id)).toEqual([fx.userB.id]);
  });

  it("Exercise: library rows are visible to everyone; custom rows only to their owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "Exercise"'));
    expect(new Set(asA.rows.map((r) => r.id))).toEqual(new Set([fx.libraryExercise.id, fx.exerciseA.id]));

    const asB = await asUser(fx.userB.id, (q) => q('SELECT id FROM "Exercise"'));
    expect(new Set(asB.rows.map((r) => r.id))).toEqual(new Set([fx.libraryExercise.id, fx.exerciseB.id]));

    const anon = await asAnonymous((q) => q('SELECT id FROM "Exercise"'));
    expect(anon.rows.map((r) => r.id)).toEqual([fx.libraryExercise.id]);
  });

  it("MuscleGroup: scoped to owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "MuscleGroup"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.muscleGroupA.id]);
  });

  it("Routine: scoped to owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "Routine"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.routineA.id]);
  });

  it("RoutineExercise: scoped via Routine.userId", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "RoutineExercise"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.routineExerciseA.id]);
  });

  it("WorkoutSession: scoped to owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "WorkoutSession"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.sessionA.id]);
  });

  it("WorkoutExercise: scoped via WorkoutSession.userId", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "WorkoutExercise"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.workoutExerciseA.id]);
  });

  it("SetEntry: scoped via WorkoutExercise -> WorkoutSession.userId (two-level join)", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "SetEntry"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.setA.id]);
  });

  it("PersonalRecord: scoped to owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "PersonalRecord"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.recordA.id]);
  });

  it("BodyweightEntry: scoped to owner", async () => {
    const asA = await asUser(fx.userA.id, (q) => q('SELECT id FROM "BodyweightEntry"'));
    expect(asA.rows.map((r) => r.id)).toEqual([fx.bodyweightA.id]);
  });

  it("anonymous (no JWT claim) sees no rows on a directly-owned table", async () => {
    const anon = await asAnonymous((q) => q('SELECT id FROM "Routine"'));
    expect(anon.rows).toHaveLength(0);
  });
});

describe("write enforcement — directly-owned table (BodyweightEntry)", () => {
  it("blocks inserting a row impersonating another user (WITH CHECK)", async () => {
    await expect(
      asUser(fx.userB.id, (q) =>
        q('INSERT INTO "BodyweightEntry" (id, "userId", "weightKg") VALUES ($1, $2, $3)', [
          randomUUID(),
          fx.userA.id,
          90,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("allows inserting a row as yourself", async () => {
    const result = await asUser(fx.userA.id, (q) =>
      q('INSERT INTO "BodyweightEntry" (id, "userId", "weightKg") VALUES ($1, $2, $3)', [
        randomUUID(),
        fx.userA.id,
        90,
      ]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("blocks updating another user's row (affects 0 rows, no error)", async () => {
    const result = await asUser(fx.userB.id, (q) =>
      q('UPDATE "BodyweightEntry" SET "weightKg" = 999 WHERE id = $1', [fx.bodyweightA.id]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("allows updating your own row", async () => {
    const result = await asUser(fx.userA.id, (q) =>
      q('UPDATE "BodyweightEntry" SET "weightKg" = 85 WHERE id = $1', [fx.bodyweightA.id]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("blocks deleting another user's row", async () => {
    const result = await asUser(fx.userB.id, (q) =>
      q('DELETE FROM "BodyweightEntry" WHERE id = $1', [fx.bodyweightA.id]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("allows deleting your own row", async () => {
    const result = await asUser(fx.userA.id, (q) =>
      q('DELETE FROM "BodyweightEntry" WHERE id = $1', [fx.bodyweightA.id]),
    );
    expect(result.rowCount).toBe(1);
  });
});

describe("write enforcement — join-based table (SetEntry, two-level)", () => {
  it("blocks inserting a set under another user's workoutExercise (WITH CHECK)", async () => {
    await expect(
      asUser(fx.userB.id, (q) =>
        q('INSERT INTO "SetEntry" (id, "workoutExerciseId", "weightKg", reps, "order", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [
          randomUUID(),
          fx.workoutExerciseA.id,
          50,
          5,
          1,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("allows inserting a set under your own workoutExercise", async () => {
    const result = await asUser(fx.userA.id, (q) =>
      q('INSERT INTO "SetEntry" (id, "workoutExerciseId", "weightKg", reps, "order", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [
        randomUUID(),
        fx.workoutExerciseA.id,
        50,
        5,
        1,
      ]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("blocks deleting another user's set", async () => {
    const result = await asUser(fx.userB.id, (q) => q('DELETE FROM "SetEntry" WHERE id = $1', [fx.setA.id]));
    expect(result.rowCount).toBe(0);
  });

  it("allows deleting your own set", async () => {
    const result = await asUser(fx.userA.id, (q) => q('DELETE FROM "SetEntry" WHERE id = $1', [fx.setA.id]));
    expect(result.rowCount).toBe(1);
  });
});

describe("Exercise library write restrictions", () => {
  it("blocks a user from inserting a library exercise (ownerId NULL) for themselves", async () => {
    // No INSERT policy covers ownerId IS NULL — only a user's own ownerId —
    // so this should be denied regardless of who's asking.
    await expect(
      asUser(fx.userA.id, (q) =>
        q('INSERT INTO "Exercise" (id, name, "muscleGroup", "ownerId") VALUES ($1, $2, $3, NULL)', [
          randomUUID(),
          `Sneaky-${randomUUID()}`,
          "Chest",
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("blocks a user from deleting another user's custom exercise", async () => {
    const result = await asUser(fx.userB.id, (q) => q('DELETE FROM "Exercise" WHERE id = $1', [fx.exerciseA.id]));
    expect(result.rowCount).toBe(0);
  });
});
