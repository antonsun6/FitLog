"use client";

import { useState } from "react";
import { deleteAccount } from "@/app/(app)/settings/actions";

/**
 * Account deletion is irreversible and wipes every owned table (PRD "Key
 * User Workflows" #7) — a plain window.confirm (ConfirmSubmitButton's usual
 * pattern) is too easy to click through on something this destructive, so
 * this requires typing the account's own email to enable the submit button.
 * Still re-validated server-side (app/(app)/settings/actions.ts) since this
 * client-side check alone is trivially bypassable.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === email;

  return (
    <form
      action={deleteAccount}
      className="flex flex-col gap-3 rounded border border-red-300 p-4"
    >
      <p className="text-sm text-red-700">
        This permanently deletes your account and every workout, routine,
        exercise, and bodyweight entry you&apos;ve logged. This can&apos;t be
        undone.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Type <span className="font-mono">{email}</span> to confirm
        <input
          type="text"
          name="confirmEmail"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
          className="rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={!matches}
        className="w-fit rounded bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Permanently delete my account
      </button>
    </form>
  );
}
