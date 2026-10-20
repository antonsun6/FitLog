import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default async function ResetPasswordRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Reset Password</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {sent ? (
        <p className="text-sm text-gray-600">
          If that email has an account, we&apos;ve sent a link to reset the
          password. Check your inbox.
        </p>
      ) : (
        <form action={requestPasswordReset} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              name="email"
              required
              className="rounded border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-white"
          >
            Send reset link
          </button>
        </form>
      )}

      <p className="text-sm text-gray-500">
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
