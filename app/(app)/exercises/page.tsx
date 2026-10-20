import Link from "next/link";
import { prisma } from "@/lib/db";
import { sortMuscleGroups } from "@/lib/muscle-groups";
import { createClient } from "@/lib/supabase/server";
import { addCustomExercise, addMuscleGroup, deleteMuscleGroup } from "./actions";

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
  // rather than passing `undefined` into the queries below.
  const [exercises, customGroups] = user
    ? await Promise.all([
        prisma.exercise.findMany({
          where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
          orderBy: { name: "asc" },
        }),
        prisma.muscleGroup.findMany({ where: { ownerId: user.id } }),
      ])
    : [[], []];

  const byMuscleGroup = Map.groupBy(exercises, (exercise) =>
    exercise.muscleGroup,
  );
  const customGroupByName = new Map(
    customGroups.map((g) => [g.name.toLowerCase(), g]),
  );

  // Every canonical category and every custom one a user has declared gets
  // a section, even with zero exercises yet — that's the point of being
  // able to pre-declare a category via "Add category" below. Any stray
  // muscleGroup value that's neither (shouldn't happen going forward, since
  // new exercises can only pick from this same list) still gets folded in
  // so nothing silently disappears.
  const allGroupNames = sortMuscleGroups([
    ...byMuscleGroup.keys(),
    ...customGroups.map((g) => g.name),
  ]);

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
          <select
            name="muscleGroup"
            required
            className="rounded border px-3 py-2"
          >
            {allGroupNames.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Add exercise
        </button>
      </form>

      <form
        action={addMuscleGroup}
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          New category name
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Grip"
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded border border-black px-4 py-2 text-sm"
        >
          Add category
        </button>
      </form>

      {allGroupNames.map((muscleGroup) => {
        const group = byMuscleGroup.get(muscleGroup) ?? [];
        const customGroup = customGroupByName.get(muscleGroup.toLowerCase());
        return (
          <section key={muscleGroup} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-gray-500">
                {muscleGroup}
              </h2>
              {customGroup && (
                <form action={deleteMuscleGroup}>
                  <input
                    type="hidden"
                    name="muscleGroupId"
                    value={customGroup.id}
                  />
                  <button
                    type="submit"
                    className="text-xs text-red-600 underline"
                  >
                    Delete category
                  </button>
                </form>
              )}
            </div>
            {group.length === 0 ? (
              <p className="text-sm text-gray-400">No exercises yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {group.map((exercise) => (
                  <li key={exercise.id}>
                    <Link
                      href={`/exercises/${exercise.id}`}
                      className="flex items-center justify-between rounded border px-3 py-2 hover:bg-gray-50"
                    >
                      <span>{exercise.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
