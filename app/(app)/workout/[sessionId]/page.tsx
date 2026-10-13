import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatWeight } from "@/lib/units";
import { PR_TYPE_LABELS } from "@/lib/pr";
import { PRType } from "@/generated/prisma/client";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { deleteWorkoutSession } from "../actions";
import {
  addExerciseToSession,
  deleteSet,
  deleteWorkoutExercise,
  finishWorkoutSession,
  logSet,
  saveExerciseNote,
  updateSet,
} from "./actions";

export default async function WorkoutSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string; pr?: string }>;
}) {
  const { sessionId } = await params;
  const { error, pr } = await searchParams;
  // Only ever set by logSet right after a genuine new record — see
  // lib/pr.ts. Comma-separated PRType names, e.g. "MAX_WEIGHT,BEST_E1RM".
  const newRecordTypes = pr ? (pr.split(",") as PRType[]) : [];

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

  // Current PRs (MAX_WEIGHT/MAX_REPS/BEST_E1RM only — SESSION_VOLUME isn't
  // tied to one set) for the exercises in this session, so a still-standing
  // record can be badged on the set that holds it, not just celebrated once
  // at the moment it was set.
  const personalRecords = await prisma.personalRecord.findMany({
    where: {
      userId: user.id,
      exerciseId: { in: workoutExercises.map((we) => we.exerciseId) },
      setEntryId: { not: null },
    },
  });
  const prTypesBySetEntryId = new Map<string, PRType[]>();
  for (const record of personalRecords) {
    if (!record.setEntryId) continue;
    const types = prTypesBySetEntryId.get(record.setEntryId) ?? [];
    types.push(record.recordType);
    prTypesBySetEntryId.set(record.setEntryId, types);
  }

  const muscleGroups = [...new Set(availableExercises.map((e) => e.muscleGroup))];
  const unit = profile?.unitPreference ?? "KG";
  const unitLabel = unit === "LB" ? "lb" : "kg";
  const isFinished = session.finishedAt !== null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{session.name}</h1>
          <p className="text-sm text-gray-500">
            {session.startedAt.toLocaleString()}
            {isFinished &&
              ` · Completed ${session.finishedAt!.toLocaleString()}`}
          </p>
        </div>
        <form action={deleteWorkoutSession}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <ConfirmSubmitButton
            confirmMessage={`Delete "${session.name}" and everything logged in it? This can't be undone.`}
            className="shrink-0 text-xs text-red-600 underline"
          >
            Delete workout
          </ConfirmSubmitButton>
        </form>
      </div>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {newRecordTypes.length > 0 && (
        <p className="rounded bg-yellow-50 p-3 text-sm font-medium text-yellow-800">
          🏆 New PR
          {newRecordTypes.length > 1 ? "s" : ""}:{" "}
          {newRecordTypes.map((t) => PR_TYPE_LABELS[t]).join(", ")}
        </p>
      )}

      {workoutExercises.length === 0 ? (
        <p className="text-sm text-gray-500">No exercises logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {workoutExercises.map((we) => (
            <li key={we.id} className="flex flex-col gap-3 rounded border p-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-medium">{we.exercise.name}</h3>
                <form action={deleteWorkoutExercise}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="workoutExerciseId" value={we.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Remove ${we.exercise.name} and all its sets from this workout?`}
                    className="shrink-0 text-xs text-red-600 underline"
                  >
                    Remove exercise
                  </ConfirmSubmitButton>
                </form>
              </div>

              {we.sets.length > 0 && (
                <ul className="flex flex-col gap-2 text-sm text-gray-600">
                  {we.sets.map((set, i) => (
                    <li key={set.id} className="flex flex-wrap items-center gap-2">
                      <span className="w-12 shrink-0 text-gray-400">
                        Set {i + 1}
                      </span>
                      <form
                        action={updateSet}
                        className="flex flex-wrap items-center gap-1"
                      >
                        <input type="hidden" name="sessionId" value={sessionId} />
                        <input type="hidden" name="setEntryId" value={set.id} />
                        <input
                          type="number"
                          name="weight"
                          step="0.5"
                          min="0"
                          defaultValue={formatWeight(Number(set.weightKg), unit)}
                          className="w-20 rounded border px-1.5 py-0.5"
                        />
                        <span>{unitLabel}</span>
                        <span>×</span>
                        <input
                          type="number"
                          name="reps"
                          step="1"
                          min="1"
                          defaultValue={set.reps}
                          className="w-16 rounded border px-1.5 py-0.5"
                        />
                        <span>reps</span>
                        <select
                          name="setType"
                          defaultValue={set.setType}
                          className="rounded border px-1 py-0.5"
                        >
                          <option value="WORKING">Working</option>
                          <option value="WARMUP">Warm-up</option>
                        </select>
                        <input
                          type="number"
                          name="rpe"
                          step="0.5"
                          min="1"
                          max="10"
                          placeholder="RPE"
                          defaultValue={set.rpe !== null ? Number(set.rpe) : ""}
                          className="w-16 rounded border px-1.5 py-0.5"
                        />
                        <button type="submit" className="text-xs underline">
                          Save
                        </button>
                      </form>
                      <form action={deleteSet}>
                        <input type="hidden" name="sessionId" value={sessionId} />
                        <input type="hidden" name="setEntryId" value={set.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 underline"
                        >
                          Delete
                        </button>
                      </form>
                      {prTypesBySetEntryId.get(set.id)?.map((type) => (
                        <span
                          key={type}
                          title={PR_TYPE_LABELS[type]}
                          className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800"
                        >
                          🏆 PR
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}

              {!isFinished && (
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
              )}

              {/* Notes stay editable even after the session is finished —
                  correcting a note is "data editing" (docs/PRD.md), not new
                  logging. */}
              <form action={saveExerciseNote} className="flex flex-col gap-1">
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="workoutExerciseId" value={we.id} />
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
