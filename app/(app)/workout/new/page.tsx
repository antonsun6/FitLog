import { startWorkoutSession } from "../actions";

export default function NewWorkoutPage() {
  // TODO: option to start from a saved Routine. See docs/PRD.md "Key User
  // Workflows" #2 — routines don't exist yet, so freeform-only for now.
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
