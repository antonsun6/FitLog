import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await prisma.user.findUnique({ where: { id: user.id } })
    : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* TODO: unit preference toggle (kg/lb — display-only, see
          lib/units.ts). Not yet built — docs/PRD.md workflow #1 has
          onboarding set this at sign-up, which also isn't built yet, so
          every account currently defaults to KG with no way to change it. */}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
        {profile && <DeleteAccountForm email={profile.email} />}
      </section>
    </main>
  );
}
