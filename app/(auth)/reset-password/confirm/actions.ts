"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/reset-password/confirm?error=${encodeURIComponent(message)}`);
}

export async function updatePassword(formData: FormData) {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    !password ||
    !confirmPassword
  ) {
    fail("Both password fields are required.");
  }
  if (password !== confirmPassword) {
    fail("Passwords do not match.");
  }

  const supabase = await createClient();

  // Requires the session the confirm page's code-exchange step just
  // established — if that expired or was never completed, there's no
  // signed-in user to update.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/reset-password?error=${encodeURIComponent("That reset link has expired. Request a new one.")}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    fail(error.message);
  }

  redirect("/dashboard");
}
