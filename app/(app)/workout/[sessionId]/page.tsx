export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // TODO: session detail view + edit/delete sets, exercises, or the whole
  // session (recalculating PRs on change). See docs/PRD.md "Key User
  // Workflows" #5 and docs/TECHNICAL_PLAN.md §4.
  return (
    <main>
      <h1>Workout Session {sessionId}</h1>
    </main>
  );
}
