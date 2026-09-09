import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

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

  if (!session) {
    notFound();
  }

  // TODO: add exercises, log sets, finish session. See docs/PRD.md "Key
  // User Workflows" #2 and docs/TECHNICAL_PLAN.md §4 for PR detection —
  // deliberately not wired up yet, that's a separate later build step.
  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">
        Workout — {session.startedAt.toLocaleString()}
      </h1>
      <p className="text-sm text-gray-500">No exercises logged yet.</p>
    </main>
  );
}
