export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // TODO: routine editor (name, ordered exercise list with target
  // sets/reps) + adherence view against past sessions started from it.
  // See docs/PRD.md "Key User Workflows" #4.
  return (
    <main>
      <h1>Routine {id}</h1>
    </main>
  );
}
