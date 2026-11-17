import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { createRoutine } from "./actions";

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const routines = user
    ? await prisma.routine.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { exercises: true } } },
      })
    : [];

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Routines</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        action={createRoutine}
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          Routine name
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Push Day"
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Create routine
        </button>
      </form>

      {routines.length === 0 ? (
        <p className="text-sm text-gray-400">
          No routines yet — create one above to use as a starting point for
          future workouts.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((routine) => (
            <li key={routine.id}>
              <Link
                href={`/routines/${routine.id}`}
                className="flex items-center justify-between rounded border px-3 py-2 hover:bg-gray-50"
              >
                <span>{routine.name}</span>
                <span className="text-sm text-gray-400">
                  {routine._count.exercises} exercise
                  {routine._count.exercises === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
