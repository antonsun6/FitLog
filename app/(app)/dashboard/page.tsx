import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  // The proxy (lib/supabase/middleware.ts) already guarantees only a
  // signed-in user reaches this page, but we still guard defensively below
  // in case the Supabase user and Prisma profile ever get out of sync.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const profile = authUser
    ? await prisma.user.findUnique({ where: { id: authUser.id } })
    : null;

  // TODO: workout history list. See docs/PRD.md "Key User Workflows" #1.
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
      <Link
        href="/workout/new"
        className="inline-block w-fit rounded bg-black px-4 py-2 text-sm text-white"
      >
        Start Workout
      </Link>
      <p className="text-sm text-gray-500">
        Workout history will show up here once it&apos;s built.
      </p>
    </main>
  );
}
