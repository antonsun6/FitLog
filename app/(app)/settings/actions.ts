"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}

export async function deleteAccount(formData: FormData) {
  const confirmEmailRaw = formData.get("confirmEmail");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) {
    fail("Account profile not found.");
  }

  const confirmEmail = typeof confirmEmailRaw === "string" ? confirmEmailRaw.trim() : "";
  if (confirmEmail !== profile.email) {
    fail("Type your email exactly to confirm account deletion.");
  }

  // Delete the Supabase auth user FIRST, not the Prisma profile. If this
  // step fails we abort having touched nothing. The reverse order has a
  // worse failure mode: a Prisma-delete success followed by an auth-delete
  // failure leaves a live, loggable-into auth account whose profile is
  // already gone. This order's own failure mode (auth gone, Prisma row
  // orphaned) is strictly safer — nobody can obtain a session for that
  // user id anymore, so the orphaned row is unreachable, not a live gap.
  const admin = createAdminClient();
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    console.error("Failed to delete Supabase auth user:", authDeleteError);
    fail("Something went wrong deleting your account. Please try again.");
  }

  // Cascades every owned table (schema: onDelete: Cascade throughout).
  await prisma.user.delete({ where: { id: user.id } });

  await supabase.auth.signOut();

  redirect("/");
}
