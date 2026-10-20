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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password/confirm`,
  });

  // Most errors here are deliberately swallowed before redirecting — same
  // anti-enumeration posture Supabase's own signUp() takes. Telling an
  // unauthenticated visitor whether an email is registered is a privacy
  // leak we shouldn't add on top of it. A send-rate-limit error is
  // different: it reveals nothing about this specific email (it's a
  // global/per-IP limit), and silently swallowing it left a real outage
  // invisible behind a "check your inbox" message that was never true —
  // see CLAUDE.md for how that was actually diagnosed.
  if (error?.code === "over_email_send_rate_limit") {
    fail(
      "Too many reset emails sent recently (Supabase's free-tier limit) — wait a bit and try again.",
    );
  }
  if (error) {
    console.error("resetPasswordForEmail failed unexpectedly:", error);
  }

  redirect("/reset-password?sent=1");
}
