import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatWeight } from "@/lib/units";
import { PR_TYPE_LABELS } from "@/lib/pr";
import { PRType, SetType } from "@/generated/prisma/client";
import { createClient } from "@/lib/supabase/server";

export default async function ExerciseHistoryPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  // Scoped to library exercises or this user's own — same reasoning as
  // every other query in this app: Prisma bypasses RLS, so this is the
  // actual boundary (see CLAUDE.md).
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ ownerId: null }, { ownerId: user.id }] },
  });
  if (!exercise) {
    notFound();
  }

  const [records, sets, profile] = await Promise.all([
    prisma.personalRecord.findMany({
      where: { userId: user.id, exerciseId },
    }),
    prisma.setEntry.findMany({
      where: { workoutExercise: { exerciseId, session: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: { workoutExercise: { include: { session: true } } },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { unitPreference: true },
    }),
  ]);

  const recordsByType = new Map(records.map((r) => [r.recordType, r]));
  const unit = profile?.unitPreference ?? "KG";
  const unitLabel = unit === "LB" ? "lb" : "kg";

  // TODO: progress chart (Recharts) plotting weight/e1RM over time — the
  // list below is the full history but not yet visualized. See
  // docs/PRD.md "Key User Workflows" #3.
  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{exercise.name}</h1>
        <p className="text-sm text-gray-500">{exercise.muscleGroup}</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-gray-500">
          Personal Records
        </h2>
        {records.length === 0 ? (
          <p className="text-sm text-gray-500">
            No working sets logged yet — records appear once you do.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.values(PRType) as PRType[]).map((type) => {
              const record = recordsByType.get(type);
              if (!record) return null;
              const display =
                type === PRType.SESSION_VOLUME
                  ? `${formatWeight(Number(record.volumeKg), unit)} ${unitLabel} total`
                  : type === PRType.MAX_REPS
                    ? `${record.reps} reps @ ${formatWeight(Number(record.valueKg), unit)} ${unitLabel}`
                    : `${formatWeight(Number(record.valueKg), unit)} ${unitLabel}${record.reps ? ` × ${record.reps}` : ""}`;
              return (
                <li
                  key={type}
                  className="flex flex-col gap-0.5 rounded border p-3"
                >
                  <span className="text-xs text-gray-500">
                    {PR_TYPE_LABELS[type]}
                  </span>
                  <span className="font-medium">🏆 {display}</span>
                  <span className="text-xs text-gray-400">
                    {record.achievedAt.toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-gray-500">History</h2>
        {sets.length === 0 ? (
          <p className="text-sm text-gray-500">No sets logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-gray-600">
            {sets.map((set) => (
              <li key={set.id}>
                {set.workoutExercise.session.startedAt.toLocaleDateString()}{" "}
                — {formatWeight(Number(set.weightKg), unit)} {unitLabel} ×{" "}
                {set.reps} reps
                {set.setType === SetType.WARMUP && " (warm-up)"}
                {set.rpe !== null && ` — RPE ${Number(set.rpe)}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
