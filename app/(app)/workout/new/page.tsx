import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { startWorkoutSession } from "../actions";

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ routineId?: string }>;
}) {
  const { routineId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const routines = user
    ? await prisma.routine.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Start a Workout</h1>
      <form action={startWorkoutSession} className="flex flex-col items-center gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Workout name (optional)
          <input
            type="text"
            name="name"
            placeholder="Lifting Session"
            className="rounded border px-3 py-2"
          />
        </label>
        {routines.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            Start from routine (optional)
            <select
              name="routineId"
              defaultValue={routineId ?? ""}
              className="rounded border px-3 py-2"
            >
              <option value="">— freeform, no routine —</option>
              {routines.map((routine) => (
                <option key={routine.id} value={routine.id}>
                  {routine.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded bg-black px-6 py-3 text-white"
        >
          Start Workout
        </button>
      </form>
    </main>
  );
}
