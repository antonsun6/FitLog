import { PRType, SetType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * PR recalculation — see docs/TECHNICAL_PLAN.md §4 for the full algorithm
 * design and rationale.
 *
 * This recomputes all four PRType aggregates for (userId, exerciseId) FROM
 * SCRATCH against the current SetEntry history (working sets only) every
 * time it's called — never incrementally. That's what makes editing or
 * deleting a record-holding set correctly demote the PersonalRecord to the
 * next-best set instead of leaving a stale value: there's no "was this the
 * max" flag to go stale, just a fresh MAX() over whatever remains.
 *
 * Call this after every SetEntry create/update/delete for a given exercise.
 * `isNewRecord` is only meaningful for deciding whether to show a "New PR!"
 * celebration — it's true when this recompute's result is strictly greater
 * than what was previously stored, which happens on a genuine new best, not
 * on a demotion (metric went down) or a no-op (metric unchanged).
 */
export type PRRecalculationResult = {
  recordType: PRType;
  isNewRecord: boolean;
};

/** Shared display copy so the workout page and exercise page stay in sync. */
export const PR_TYPE_LABELS: Record<PRType, string> = {
  [PRType.MAX_WEIGHT]: "Heaviest weight",
  [PRType.MAX_REPS]: "Most reps in a set",
  [PRType.BEST_E1RM]: "Best estimated 1RM",
  [PRType.SESSION_VOLUME]: "Best session volume",
};

/** Epley formula — see docs/TECHNICAL_PLAN.md §4. */
function estimateOneRepMax(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * valueKg/volumeKg are stored as Decimal(_, 2) — round every computed metric
 * to the same precision before comparing or storing it. Without this, e.g.
 * estimateOneRepMax(120, 1) === 124.00000000000001 in floating point, which
 * would never exactly equal the 124.00 read back from the DB on the next
 * recalculation and would falsely register as "changed" (and even as a new
 * record) on every subsequent call, forever.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ExistingRecord = {
  recordType: PRType;
  valueKg: unknown;
  reps: number | null;
  volumeKg: unknown;
};

/** The single number each PRType is actually compared/sorted on. */
function metricOf(record: ExistingRecord | undefined, recordType: PRType): number {
  if (!record) return -Infinity;
  switch (recordType) {
    case PRType.MAX_WEIGHT:
    case PRType.BEST_E1RM:
      return Number(record.valueKg);
    case PRType.MAX_REPS:
      return record.reps ?? -Infinity;
    case PRType.SESSION_VOLUME:
      return Number(record.volumeKg);
  }
}

export async function recalculatePersonalRecords(
  userId: string,
  exerciseId: string,
): Promise<PRRecalculationResult[]> {
  const [workingSets, existing] = await Promise.all([
    prisma.setEntry.findMany({
      where: {
        setType: SetType.WORKING,
        workoutExercise: { exerciseId, session: { userId } },
      },
      select: {
        id: true,
        weightKg: true,
        reps: true,
        createdAt: true,
        workoutExercise: { select: { sessionId: true } },
      },
    }),
    prisma.personalRecord.findMany({ where: { userId, exerciseId } }),
  ]);

  const existingByType = new Map(existing.map((r) => [r.recordType, r]));

  if (workingSets.length === 0) {
    // Nothing left to support any record for this exercise (e.g. the only
    // working set was deleted) — clear stale records rather than leaving a
    // record that no longer has any supporting data.
    if (existing.length > 0) {
      await prisma.personalRecord.deleteMany({ where: { userId, exerciseId } });
    }
    return [];
  }

  const sets = workingSets.map((s) => ({
    id: s.id,
    weightKg: Number(s.weightKg),
    reps: s.reps,
    sessionId: s.workoutExercise.sessionId,
    createdAt: s.createdAt,
  }));

  const maxWeightSet = sets.reduce((best, s) =>
    s.weightKg > best.weightKg ? s : best,
  );
  const maxRepsSet = sets.reduce((best, s) => (s.reps > best.reps ? s : best));
  const bestE1RMSet = sets.reduce((best, s) =>
    estimateOneRepMax(s.weightKg, s.reps) > estimateOneRepMax(best.weightKg, best.reps)
      ? s
      : best,
  );
  const bestE1RM = round2(estimateOneRepMax(bestE1RMSet.weightKg, bestE1RMSet.reps));

  const setsBySession = Map.groupBy(sets, (s) => s.sessionId);
  let bestVolume = -Infinity;
  let bestVolumeAchievedAt = sets[0].createdAt;
  for (const sessionSets of setsBySession.values()) {
    const volume = round2(
      sessionSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
    );
    if (volume > bestVolume) {
      bestVolume = volume;
      bestVolumeAchievedAt = sessionSets.reduce(
        (latest, s) => (s.createdAt > latest ? s.createdAt : latest),
        sessionSets[0].createdAt,
      );
    }
  }

  const targets: {
    recordType: PRType;
    metric: number;
    valueKg: number | null;
    reps: number | null;
    volumeKg: number | null;
    setEntryId: string | null;
    achievedAt: Date;
  }[] = [
    {
      recordType: PRType.MAX_WEIGHT,
      metric: maxWeightSet.weightKg,
      valueKg: maxWeightSet.weightKg,
      reps: maxWeightSet.reps,
      volumeKg: null,
      setEntryId: maxWeightSet.id,
      achievedAt: maxWeightSet.createdAt,
    },
    {
      recordType: PRType.MAX_REPS,
      metric: maxRepsSet.reps,
      valueKg: maxRepsSet.weightKg,
      reps: maxRepsSet.reps,
      volumeKg: null,
      setEntryId: maxRepsSet.id,
      achievedAt: maxRepsSet.createdAt,
    },
    {
      recordType: PRType.BEST_E1RM,
      metric: bestE1RM,
      valueKg: bestE1RM,
      reps: bestE1RMSet.reps,
      volumeKg: null,
      setEntryId: bestE1RMSet.id,
      achievedAt: bestE1RMSet.createdAt,
    },
    {
      recordType: PRType.SESSION_VOLUME,
      metric: bestVolume,
      valueKg: null,
      reps: null,
      volumeKg: bestVolume,
      setEntryId: null,
      achievedAt: bestVolumeAchievedAt,
    },
  ];

  const results: PRRecalculationResult[] = [];

  for (const target of targets) {
    const prior = existingByType.get(target.recordType);
    const priorMetric = metricOf(prior, target.recordType);

    if (target.metric !== priorMetric) {
      await prisma.personalRecord.upsert({
        where: {
          userId_exerciseId_recordType: {
            userId,
            exerciseId,
            recordType: target.recordType,
          },
        },
        create: {
          userId,
          exerciseId,
          recordType: target.recordType,
          valueKg: target.valueKg,
          reps: target.reps,
          volumeKg: target.volumeKg,
          setEntryId: target.setEntryId,
          achievedAt: target.achievedAt,
        },
        update: {
          valueKg: target.valueKg,
          reps: target.reps,
          volumeKg: target.volumeKg,
          setEntryId: target.setEntryId,
          achievedAt: target.achievedAt,
        },
      });
    }

    results.push({
      recordType: target.recordType,
      isNewRecord: target.metric > priorMetric,
    });
  }

  return results;
}
