import { prisma } from "@/lib/db";
import { formatWeight } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";
import { BodyweightChart } from "@/components/BodyweightChart";
import { deleteBodyweightEntry, logBodyweight, updateBodyweightEntry } from "./actions";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function BodyweightPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profile, entries] = user
    ? await Promise.all([
        prisma.user.findUnique({ where: { id: user.id }, select: { unitPreference: true } }),
        prisma.bodyweightEntry.findMany({
          where: { userId: user.id },
          orderBy: { loggedAt: "desc" },
        }),
      ])
    : [null, []];

  const unit = profile?.unitPreference ?? "KG";
  const unitLabel = unit === "LB" ? "lb" : "kg";

  const chartData = [...entries]
    .reverse()
    .map((entry) => ({
      date: entry.loggedAt.toLocaleDateString(),
      weight: formatWeight(Number(entry.weightKg), unit),
    }));

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Bodyweight</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        action={logBodyweight}
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          Weight ({unitLabel})
          <input
            type="number"
            name="weight"
            step="0.1"
            min="0"
            required
            className="w-28 rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            name="loggedAt"
            defaultValue={toDateInputValue(new Date())}
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Log weight
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No bodyweight entries yet.</p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-gray-500">Trend</h2>
          <BodyweightChart data={chartData} unitLabel={unitLabel} />

          <h2 className="text-sm font-medium text-gray-500">History</h2>
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-end gap-2 rounded border px-3 py-2"
              >
                <form
                  action={updateBodyweightEntry}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="entryId" value={entry.id} />
                  <input
                    type="number"
                    name="weight"
                    step="0.1"
                    min="0"
                    defaultValue={formatWeight(Number(entry.weightKg), unit)}
                    className="w-24 rounded border px-2 py-1 text-sm"
                  />
                  <span className="text-sm text-gray-500">{unitLabel}</span>
                  <input
                    type="date"
                    name="loggedAt"
                    defaultValue={toDateInputValue(entry.loggedAt)}
                    className="rounded border px-2 py-1 text-sm"
                  />
                  <button type="submit" className="text-xs underline">
                    Save
                  </button>
                </form>
                <form action={deleteBodyweightEntry}>
                  <input type="hidden" name="entryId" value={entry.id} />
                  <button type="submit" className="text-xs text-red-600 underline">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
