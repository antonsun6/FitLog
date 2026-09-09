import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { addCustomExercise } from "./actions";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy guarantees a signed-in user reaches this page, but guard anyway
  // rather than passing `undefined` into the query below.
  const exercises = user
    ? await prisma.exercise.findMany({
        where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
        orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
      })
    : [];

  const byMuscleGroup = Map.groupBy(exercises, (exercise) => exercise.muscleGroup);
  const muscleGroups = [...byMuscleGroup.keys()];

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Exercises</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        action={addCustomExercise}
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            name="name"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Muscle group
          <input
            type="text"
            name="muscleGroup"
            required
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

      {[...byMuscleGroup.entries()].map(([muscleGroup, group]) => (
        <section key={muscleGroup} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-500">{muscleGroup}</h2>
          <ul className="flex flex-col gap-1">
            {group.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  href={`/exercises/${exercise.id}`}
                  className="flex items-center justify-between rounded border px-3 py-2 hover:bg-gray-50"
                >
                  <span>{exercise.name}</span>
                  {exercise.isCustom && (
                    <span className="text-xs text-gray-400">Custom</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
