import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function ExercisesPage() {
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

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exercises</h1>
        {/* TODO: "Add custom exercise" form — next checkpoint. */}
      </div>

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
