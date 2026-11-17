import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAvailableMuscleGroups } from "@/lib/muscle-groups";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  addExerciseToRoutine,
  deleteRoutine,
  deleteRoutineExercise,
  renameRoutine,
  updateRoutineExercise,
} from "../actions";

export default async function RoutineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: routineId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Scoping by userId in the query itself is the real boundary here — see
  // the RLS note in CLAUDE.md (Prisma's role bypasses RLS).
  const routine = user
    ? await prisma.routine.findFirst({ where: { id: routineId, userId: user.id } })
    : null;

  if (!routine || !user) {
    notFound();
  }

  const [routineExercises, availableExercises, muscleGroups, pastSessions] =
    await Promise.all([
      prisma.routineExercise.findMany({
        where: { routineId },
        orderBy: { order: "asc" },
        include: { exercise: true },
      }),
      prisma.exercise.findMany({
        where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
        orderBy: { name: "asc" },
      }),
      getAvailableMuscleGroups(user.id),
      prisma.workoutSession.findMany({
        where: { routineId, userId: user.id },
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
    ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <form action={renameRoutine} className="flex items-center gap-2">
          <input type="hidden" name="routineId" value={routineId} />
          <input
            type="text"
            name="name"
            defaultValue={routine.name}
            className="rounded border px-3 py-2 text-2xl font-semibold"
          />
          <button type="submit" className="text-xs underline">
            Save
          </button>
        </form>
        <form action={deleteRoutine}>
          <input type="hidden" name="routineId" value={routineId} />
          <ConfirmSubmitButton
            confirmMessage={`Delete "${routine.name}"? This can't be undone. Past workouts started from it are kept.`}
            className="shrink-0 text-xs text-red-600 underline"
          >
            Delete routine
          </ConfirmSubmitButton>
        </form>
      </div>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-500">Exercises</h2>

        {routineExercises.length === 0 ? (
          <p className="text-sm text-gray-400">No exercises yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {routineExercises.map((re) => (
              <li
                key={re.id}
                className="flex flex-wrap items-end gap-3 rounded border p-3"
              >
                <span className="min-w-32 font-medium">{re.exercise.name}</span>
                <form
                  action={updateRoutineExercise}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="routineId" value={routineId} />
                  <input type="hidden" name="routineExerciseId" value={re.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    Target sets
                    <input
                      type="number"
                      name="targetSets"
                      step="1"
                      min="1"
                      defaultValue={re.targetSets ?? ""}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Target reps
                    <input
                      type="number"
                      name="targetReps"
                      step="1"
                      min="1"
                      defaultValue={re.targetReps ?? ""}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </label>
                  <button type="submit" className="text-xs underline">
                    Save
                  </button>
                </form>
                <form action={deleteRoutineExercise}>
                  <input type="hidden" name="routineId" value={routineId} />
                  <input type="hidden" name="routineExerciseId" value={re.id} />
                  <button type="submit" className="text-xs text-red-600 underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={addExerciseToRoutine}
          className="flex flex-wrap items-end gap-3 rounded border p-4"
        >
          <input type="hidden" name="routineId" value={routineId} />
          <label className="flex flex-col gap-1 text-sm">
            Exercise name
            <input
              type="text"
              name="name"
              required
              list="exercise-names"
              className="rounded border px-3 py-2"
            />
            <datalist id="exercise-names">
              {availableExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.name} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Muscle group (only needed if new)
            <select
              name="muscleGroup"
              defaultValue=""
              className="rounded border px-3 py-2"
            >
              <option value="">— pick if adding a new exercise —</option>
              {muscleGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Target sets (optional)
            <input
              type="number"
              name="targetSets"
              step="1"
              min="1"
              className="w-20 rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Target reps (optional)
            <input
              type="number"
              name="targetReps"
              step="1"
              min="1"
              className="w-20 rounded border px-2 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Add exercise
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-gray-500">
          Recent workouts from this routine
        </h2>
        {pastSessions.length === 0 ? (
          <p className="text-sm text-gray-400">
            No workouts started from this routine yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {pastSessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/workout/${session.id}`}
                  className="flex items-center justify-between rounded border px-3 py-2 hover:bg-gray-50"
                >
                  <span>{session.name}</span>
                  <span className="text-sm text-gray-400">
                    {session.startedAt.toLocaleDateString()}
                    {session.finishedAt ? "" : " · in progress"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href={`/workout/new?routineId=${routineId}`}
        className="w-fit rounded bg-black px-4 py-2 text-sm text-white"
      >
        Start workout from this routine
      </Link>
    </main>
  );
}
