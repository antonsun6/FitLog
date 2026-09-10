import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { addExerciseToSession } from "./actions";

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

  const [workoutExercises, availableExercises] = await Promise.all([
    prisma.workoutExercise.findMany({
      where: { sessionId },
      orderBy: { order: "asc" },
      include: { exercise: true },
    }),
    prisma.exercise.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
      orderBy: { name: "asc" },
    }),
  ]);
  const muscleGroups = [...new Set(availableExercises.map((e) => e.muscleGroup))];

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">
        Workout — {session.startedAt.toLocaleString()}
      </h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {workoutExercises.length === 0 ? (
        <p className="text-sm text-gray-500">No exercises logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workoutExercises.map((we) => (
            <li key={we.id} className="rounded border p-3">
              {we.exercise.name}
              {/* TODO: sets go here — next checkpoint. */}
            </li>
          ))}
        </ul>
      )}

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
    </main>
  );
}
