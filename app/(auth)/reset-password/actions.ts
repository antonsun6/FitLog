"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/reset-password?error=${encodeURIComponent(message)}`);
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || !email) {
    fail("Email is required.");
  }

  const supabase = await createClient();
  // Deliberately ignore the result (success or error) before redirecting —
  // same anti-enumeration posture Supabase's own signUp() takes. Telling an
  // unauthenticated visitor whether an email is registered is a privacy
  // leak we shouldn't add on top of it.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password/confirm`,
  });

  redirect("/reset-password?sent=1");
}
