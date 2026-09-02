export default function Home() {
  // TODO: landing page for signed-out visitors, linking to sign-in/sign-up.
  // Signed-in users should redirect to /dashboard once auth middleware
  // exists — see docs/TECHNICAL_PLAN.md §8 step 2.
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-3xl font-semibold">FitLogger</h1>
      <p className="text-sm text-gray-500">
        Track your lifts: sets, reps, weight, and history.
      </p>
    </main>
  );
}
