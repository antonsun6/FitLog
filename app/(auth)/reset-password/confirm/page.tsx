import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      redirect(
        `/reset-password?error=${encodeURIComponent("That reset link is invalid or has expired. Request a new one.")}`,
      );
    }
    // Redirect to strip `code` from the URL now that it's been exchanged
    // for a session (cookies are set) — a code is single-use, so leaving
    // it in the URL invites a confusing re-exchange attempt on refresh.
    redirect("/reset-password/confirm");
  }

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Set a New Password</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={updatePassword} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <input
            type="password"
            name="confirmPassword"
            required
            minLength={6}
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Update password
        </button>
      </form>
    </main>
  );
}
