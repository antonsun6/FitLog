import { prisma } from "@/lib/db";
import { SetType, Unit } from "@/generated/prisma/client";

/** Wipes every app table in the LOCAL test database between tests, so each
 * test starts from a clean slate without needing per-test transaction
 * rollback (actions use the shared `prisma` singleton directly, not an
 * injectable transaction client, so rollback-per-test isn't practical here). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PersonalRecord", "SetEntry", "WorkoutExercise", "WorkoutSession",
      "RoutineExercise", "Routine", "MuscleGroup", "Exercise",
      "BodyweightEntry", "User"
    RESTART IDENTITY CASCADE
  `);
}

let counter = 0;
function unique(label: string) {
  counter += 1;
  return `${label}-${counter}-${Date.now()}`;
}

export function createUser(overrides: Partial<{ email: string; displayName: string; unitPreference: Unit }> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${unique("user")}@example.com`,
      displayName: overrides.displayName ?? "Test User",
      unitPreference: overrides.unitPreference ?? Unit.KG,
    },
  });
}

export function createExercise(
  overrides: Partial<{ name: string; muscleGroup: string; isCustom: boolean; ownerId: string | null }> = {},
) {
  return prisma.exercise.create({
    data: {
      name: overrides.name ?? unique("Exercise"),
      muscleGroup: overrides.muscleGroup ?? "Chest",
      isCustom: overrides.isCustom ?? false,
      ownerId: overrides.ownerId ?? null,
    },
  });
}

export function createSession(
  userId: string,
  overrides: Partial<{ name: string; routineId: string | null; finishedAt: Date | null }> = {},
) {
  return prisma.workoutSession.create({
    data: {
      userId,
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      ...(overrides.routineId !== undefined ? { routineId: overrides.routineId } : {}),
      ...(overrides.finishedAt !== undefined ? { finishedAt: overrides.finishedAt } : {}),
    },
  });
}

export function createWorkoutExercise(
  sessionId: string,
  exerciseId: string,
  overrides: Partial<{ order: number; note: string | null }> = {},
) {
  return prisma.workoutExercise.create({
    data: {
      sessionId,
      exerciseId,
      order: overrides.order ?? 0,
      note: overrides.note ?? null,
    },
  });
}

export function createSet(
  workoutExerciseId: string,
  overrides: Partial<{
    weightKg: number;
    reps: number;
    setType: SetType;
    rpe: number | null;
    order: number;
    createdAt: Date;
  }> = {},
) {
  return prisma.setEntry.create({
    data: {
      workoutExerciseId,
      weightKg: overrides.weightKg ?? 100,
      reps: overrides.reps ?? 5,
      setType: overrides.setType ?? SetType.WORKING,
      rpe: overrides.rpe ?? null,
      order: overrides.order ?? 0,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}

export function createRoutine(userId: string, overrides: Partial<{ name: string }> = {}) {
  return prisma.routine.create({
    data: { userId, name: overrides.name ?? unique("Routine") },
  });
}
