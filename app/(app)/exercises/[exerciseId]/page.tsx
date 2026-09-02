export default async function ExerciseHistoryPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;

  // TODO: full performance timeline + progress chart (Recharts) + PR
  // markers. See docs/PRD.md "Key User Workflows" #3.
  return (
    <main>
      <h1>Exercise {exerciseId}</h1>
    </main>
  );
}
