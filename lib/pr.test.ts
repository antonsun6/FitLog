import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PRType, SetType } from "@/generated/prisma/client";
import { prisma } from "./db";
import { PR_TYPE_LABELS, recalculatePersonalRecords } from "./pr";
import {
  createExercise,
  createSession,
  createSet,
  createUser,
  createWorkoutExercise,
  resetDb,
} from "../tests/helpers/db";

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

/** Convenience: user + exercise + one session + one workoutExercise, ready
 * for sets to be logged against. */
async function setupExercise() {
  const user = await createUser();
  const exercise = await createExercise();
  const session = await createSession(user.id);
  const we = await createWorkoutExercise(session.id, exercise.id);
  return { user, exercise, session, we };
}

function recordsByType<T extends { recordType: PRType }>(records: T[]): Map<PRType, T> {
  return new Map(records.map((r) => [r.recordType, r]));
}

describe("PR_TYPE_LABELS", () => {
  it("has a label for every PRType", () => {
    for (const type of Object.values(PRType)) {
      expect(PR_TYPE_LABELS[type]).toBeTypeOf("string");
    }
  });
});

describe("recalculatePersonalRecords", () => {
  it("returns an empty result and writes nothing when there are no working sets at all", async () => {
    const { user, exercise } = await setupExercise();
    const results = await recalculatePersonalRecords(user.id, exercise.id);
    expect(results).toEqual([]);
    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(stored).toHaveLength(0);
  });

  it("ignores warm-up sets entirely", async () => {
    const { user, exercise, we } = await setupExercise();
    await createSet(we.id, { setType: SetType.WARMUP, weightKg: 200, reps: 1 });
    const results = await recalculatePersonalRecords(user.id, exercise.id);
    expect(results).toEqual([]);
  });

  it("creates all four record types on the first working set, flagging each as a new record", async () => {
    const { user, exercise, we } = await setupExercise();
    await createSet(we.id, { weightKg: 100, reps: 5 });

    const results = await recalculatePersonalRecords(user.id, exercise.id);
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.isNewRecord).toBe(true);

    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(stored).toHaveLength(4);

    const byType = recordsByType(stored);
    expect(Number(byType.get(PRType.MAX_WEIGHT)!.valueKg)).toBe(100);
    expect(byType.get(PRType.MAX_REPS)!.reps).toBe(5);
    // Epley: 100 * (1 + 5/30) = 116.67
    expect(Number(byType.get(PRType.BEST_E1RM)!.valueKg)).toBeCloseTo(116.67, 2);
    expect(Number(byType.get(PRType.SESSION_VOLUME)!.volumeKg)).toBe(500);
  });

  it("is idempotent: recalculating again with no new sets changes nothing and reports no new records", async () => {
    const { user, exercise, we } = await setupExercise();
    await createSet(we.id, { weightKg: 100, reps: 5 });
    await recalculatePersonalRecords(user.id, exercise.id);

    const before = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });

    const results = await recalculatePersonalRecords(user.id, exercise.id);
    for (const r of results) expect(r.isNewRecord).toBe(false);

    const after = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    // Same values, not just same count — confirms the round2'd float comparison
    // actually matches on the second pass (the documented float-noise bug).
    expect(after).toEqual(before);
  });

  it("promotes a record when a genuinely heavier/longer/better set is added", async () => {
    const { user, exercise, we } = await setupExercise();
    await createSet(we.id, { weightKg: 100, reps: 5, order: 0 });
    await recalculatePersonalRecords(user.id, exercise.id);

    await createSet(we.id, { weightKg: 150, reps: 3, order: 1 });
    const results = await recalculatePersonalRecords(user.id, exercise.id);

    const byType = new Map(results.map((r) => [r.recordType, r.isNewRecord]));
    expect(byType.get(PRType.MAX_WEIGHT)).toBe(true);

    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(Number(recordsByType(stored).get(PRType.MAX_WEIGHT)!.valueKg)).toBe(150);
  });

  it("demotes a record when the set that held it is deleted", async () => {
    const { user, exercise, we } = await setupExercise();
    const heavySet = await createSet(we.id, { weightKg: 150, reps: 3, order: 0 });
    await createSet(we.id, { weightKg: 100, reps: 5, order: 1 });
    await recalculatePersonalRecords(user.id, exercise.id);

    await prisma.setEntry.delete({ where: { id: heavySet.id } });
    const results = await recalculatePersonalRecords(user.id, exercise.id);

    const byType = new Map(results.map((r) => [r.recordType, r.isNewRecord]));
    // The remaining set (100kg) is worse than the previous 150kg record, so
    // this is a demotion, not a new record.
    expect(byType.get(PRType.MAX_WEIGHT)).toBe(false);

    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(Number(recordsByType(stored).get(PRType.MAX_WEIGHT)!.valueKg)).toBe(100);
  });

  it("clears all records when the last working set is removed", async () => {
    const { user, exercise, we } = await setupExercise();
    const theSet = await createSet(we.id, { weightKg: 100, reps: 5 });
    await recalculatePersonalRecords(user.id, exercise.id);

    await prisma.setEntry.delete({ where: { id: theSet.id } });
    const results = await recalculatePersonalRecords(user.id, exercise.id);

    expect(results).toEqual([]);
    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(stored).toHaveLength(0);
  });

  it("picks the best session volume across multiple sessions, and selects the single set that holds each per-set record from among several", async () => {
    const user = await createUser();
    const exercise = await createExercise();

    const session1 = await createSession(user.id);
    const we1 = await createWorkoutExercise(session1.id, exercise.id);
    const t0 = new Date("2026-01-01T00:00:00Z");
    // Session 1 volume: 100*5 + 90*5 = 950
    await createSet(we1.id, { weightKg: 100, reps: 5, order: 0, createdAt: t0 });
    await createSet(we1.id, { weightKg: 90, reps: 5, order: 1, createdAt: new Date(t0.getTime() + 1000) });

    const session2 = await createSession(user.id);
    const we2 = await createWorkoutExercise(session2.id, exercise.id);
    const t1 = new Date("2026-01-02T00:00:00Z");
    // Session 2 volume: 120*6 = 720 (lower than session 1 — exercises the
    // `volume > bestVolume` false branch).
    await createSet(we2.id, { weightKg: 120, reps: 6, order: 0, createdAt: t1 });

    const results = await recalculatePersonalRecords(user.id, exercise.id);
    expect(results).toHaveLength(4);

    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    const byType = recordsByType(stored);

    expect(Number(byType.get(PRType.SESSION_VOLUME)!.volumeKg)).toBe(950);
    // MAX_WEIGHT should point at the single 120kg set in session 2, not session 1.
    expect(Number(byType.get(PRType.MAX_WEIGHT)!.valueKg)).toBe(120);
    // MAX_REPS should point at the single 6-rep set in session 2.
    expect(byType.get(PRType.MAX_REPS)!.reps).toBe(6);
  });

  it("falls back to -Infinity for a MAX_REPS record with a null reps value (defensive/corrupted-data path)", async () => {
    const { user, exercise, we } = await setupExercise();
    // Seed a stale/corrupt existing record directly, bypassing the normal
    // recompute path, to exercise the `record.reps ?? -Infinity` fallback.
    await prisma.personalRecord.create({
      data: {
        userId: user.id,
        exerciseId: exercise.id,
        recordType: PRType.MAX_REPS,
        valueKg: 50,
        reps: null,
        volumeKg: null,
        setEntryId: null,
        achievedAt: new Date(),
      },
    });
    await createSet(we.id, { weightKg: 100, reps: 5 });

    const results = await recalculatePersonalRecords(user.id, exercise.id);
    const byType = new Map(results.map((r) => [r.recordType, r.isNewRecord]));
    // Any real reps count beats the null/-Infinity fallback, so this is a new record.
    expect(byType.get(PRType.MAX_REPS)).toBe(true);

    const stored = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(recordsByType(stored).get(PRType.MAX_REPS)!.reps).toBe(5);
  });

  it("scopes to the given user and exercise only", async () => {
    const { user, exercise, we } = await setupExercise();
    const otherUser = await createUser();
    const otherExercise = await createExercise();
    const otherSession = await createSession(otherUser.id);
    const otherWe = await createWorkoutExercise(otherSession.id, otherExercise.id);
    await createSet(otherWe.id, { weightKg: 999, reps: 99 });

    await createSet(we.id, { weightKg: 100, reps: 5 });
    await recalculatePersonalRecords(user.id, exercise.id);

    const otherRecords = await prisma.personalRecord.findMany({ where: { userId: otherUser.id } });
    expect(otherRecords).toHaveLength(0);
  });
});
