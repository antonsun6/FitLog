import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatWeight } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";
import {
  addExerciseToSession,
  finishWorkoutSession,
  logSet,
  saveExerciseNote,
} from "./actions";

export default async function WorkoutSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { sessionId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Scoping by userId in the query itself (not just "is someone logged in")
  // matters here: Prisma's connection bypasses RLS (see CLAUDE.md), so this
  // is the actual boundary preventing one user from loading another's
  // session by guessing/knowing its id.
  const session = user
    ? await prisma.workoutSession.findFirst({
        where: { id: sessionId, userId: user.id },
      })
    : null;

  if (!session || !user) {
    notFound();
  }

  const [workoutExercises, availableExercises, profile] = await Promise.all([
    prisma.workoutExercise.findMany({
      where: { sessionId },
      orderBy: { order: "asc" },
      include: { exercise: true, sets: { orderBy: { order: "asc" } } },
    }),
    prisma.exercise.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { unitPreference: true },
    }),
  ]);
  const muscleGroups = [...new Set(availableExercises.map((e) => e.muscleGroup))];
  const unit = profile?.unitPreference ?? "KG";
  const unitLabel = unit === "LB" ? "lb" : "kg";
  const isFinished = session.finishedAt !== null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{session.name}</h1>
        <p className="text-sm text-gray-500">
          {session.startedAt.toLocaleString()}
          {isFinished &&
            ` · Completed ${session.finishedAt!.toLocaleString()}`}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {workoutExercises.length === 0 ? (
        <p className="text-sm text-gray-500">No exercises logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {workoutExercises.map((we) => (
            <li key={we.id} className="flex flex-col gap-3 rounded border p-4">
              <h3 className="font-medium">{we.exercise.name}</h3>

              {we.sets.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-gray-600">
                  {we.sets.map((set, i) => (
                    <li key={set.id}>
                      Set {i + 1}: {formatWeight(Number(set.weightKg), unit)}{" "}
                      {unitLabel} × {set.reps} reps
                      {set.setType === "WARMUP" && " (warm-up)"}
                      {set.rpe !== null && ` — RPE ${Number(set.rpe)}`}
                    </li>
                  ))}
                </ul>
              )}

              {isFinished ? (
                we.note && (
                  <p className="text-sm text-gray-600">Note: {we.note}</p>
                )
              ) : (
                <>
                  <form
                    action={logSet}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="sessionId" value={sessionId} />
                    <input
                      type="hidden"
                      name="workoutExerciseId"
                      value={we.id}
                    />
                    <label className="flex flex-col gap-1 text-xs">
                      Weight ({unitLabel})
                      <input
                        type="number"
                        name="weight"
                        step="0.5"
                        min="0"
                        required
                        className="w-24 rounded border px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Reps
                      <input
                        type="number"
                        name="reps"
                        step="1"
                        min="1"
                        required
                        className="w-20 rounded border px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Type
                      <select
                        name="setType"
                        defaultValue="WORKING"
                        className="rounded border px-2 py-1"
                      >
                        <option value="WORKING">Working</option>
                        <option value="WARMUP">Warm-up</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      RPE (optional)
                      <input
                        type="number"
                        name="rpe"
                        step="0.5"
                        min="1"
                        max="10"
                        className="w-20 rounded border px-2 py-1"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded bg-black px-3 py-1.5 text-sm text-white"
                    >
                      Log set
                    </button>
                  </form>

                  <form
                    action={saveExerciseNote}
                    className="flex flex-col gap-1"
                  >
                    <input type="hidden" name="sessionId" value={sessionId} />
                    <input
                      type="hidden"
                      name="workoutExerciseId"
                      value={we.id}
                    />
                    <textarea
                      name="note"
                      rows={2}
                      defaultValue={we.note ?? ""}
                      placeholder="Note (e.g. felt easy, bump next time)"
                      className="rounded border px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      className="w-fit text-xs text-gray-600 underline"
                    >
                      Save note
                    </button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isFinished && (
        <>
          <form
            action={addExerciseToSession}
            className="flex flex-wrap items-end gap-3 rounded border p-4"
          >
            <input type="hidden" name="sessionId" value={sessionId} />
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
              <input
                type="text"
                name="muscleGroup"
                list="muscle-groups"
                className="rounded border px-3 py-2"
              />
              <datalist id="muscle-groups">
                {muscleGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </label>
            <button
              type="submit"
              className="rounded bg-black px-4 py-2 text-sm text-white"
            >
              Add exercise
            </button>
          </form>

          <form action={finishWorkoutSession}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button
              type="submit"
              className="rounded border border-black px-4 py-2 text-sm"
            >
              Finish Workout
            </button>
          </form>
        </>
      )}
    </main>
  );
}
