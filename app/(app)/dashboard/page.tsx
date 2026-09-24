import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { renameWorkoutSession } from "../workout/actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // The proxy (lib/supabase/middleware.ts) already guarantees only a
  // signed-in user reaches this page, but we still guard defensively below
  // in case the Supabase user and Prisma profile ever get out of sync.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const [profile, sessions] = await Promise.all([
    authUser
      ? prisma.user.findUnique({ where: { id: authUser.id } })
      : null,
    authUser
      ? prisma.workoutSession.findMany({
          where: { userId: authUser.id },
          orderBy: { startedAt: "desc" },
          include: { _count: { select: { exercises: true } } },
        })
      : [],
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">
        {profile ? `Welcome, ${profile.displayName}. It's time to get active!` : "Dashboard"}
      </h1>
      {!profile && authUser && (
        <p className="text-sm text-red-700">
          Signed in, but no matching profile row was found for this account —
          this shouldn&apos;t happen for accounts created via /sign-up.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Link
        href="/workout/new"
        className="inline-block w-fit rounded bg-black px-4 py-2 text-sm text-white"
      >
        Start Workout
      </Link>

      <h2 className="mt-4 text-sm font-medium text-gray-500">History</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">No workouts logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-2 rounded border px-3 py-2"
            >
              <Link
                href={`/workout/${session.id}`}
                className="flex items-center justify-between hover:underline"
              >
                <span className="font-medium">{session.name}</span>
                <span className="text-sm text-gray-500">
                  {session.startedAt.toLocaleDateString()} ·{" "}
                  {session._count.exercises} exercise
                  {session._count.exercises === 1 ? "" : "s"} ·{" "}
                  {session.finishedAt ? "Completed" : "In progress"}
                </span>
              </Link>
              <form
                action={renameWorkoutSession}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="text"
                  name="name"
                  defaultValue={session.name}
                  className="flex-1 rounded border px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  className="text-xs text-gray-600 underline"
                >
                  Rename
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
