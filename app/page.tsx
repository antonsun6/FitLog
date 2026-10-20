import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">FitLogger</h1>
        <p className="text-sm text-gray-500">
          Track your lifts: sets, reps, weight, and history.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/sign-up"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Sign Up
        </Link>
        <Link
          href="/sign-in"
          className="rounded border border-black px-4 py-2 text-sm"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
