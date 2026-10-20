"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { Prisma, Unit } from "@/generated/prisma/client";

function fail(message: string): never {
  redirect(`/sign-up?error=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const displayName = formData.get("displayName");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    typeof displayName !== "string" ||
    !email ||
    !password ||
    !confirmPassword ||
    !displayName
  ) {
    fail("All fields are required.");
  }

  // Client-side minLength doesn't guarantee a match, or that the request
  // even came from the real form — validate server-side too.
  if (password !== confirmPassword) {
    fail("Passwords do not match.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    fail(error?.message ?? "Sign up failed.");
  }

  // The profile row's id must match auth.users.id exactly — the schema's
  // @default(uuid()) only kicks in when no id is passed. See
  // docs/TECHNICAL_PLAN.md §2 and §8 step 2.
  try {
    await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        displayName,
        unitPreference: Unit.KG,
      },
    });
  } catch (dbError) {
    // Supabase's signUp() deliberately returns a success-shaped response
    // (no `error`, a `data.user`) when called with an email that's already
    // registered — an anti-enumeration measure, not a bug on their end. We
    // only find out here, when the email's uniqueness constraint on `User`
    // rejects it. This is an expected, recoverable case, not a real
    // failure — give an actionable message instead of a dead end.
    if (
      dbError instanceof Prisma.PrismaClientKnownRequestError &&
      dbError.code === "P2002"
    ) {
      fail(
        "An account with this email already exists. Sign in instead — if you've forgotten your password, use the reset link on the sign-in page.",
      );
    }
    console.error("Failed to create User profile after sign-up:", dbError);
    fail(
      "Account created but profile setup failed — contact support rather than retrying sign-up with the same email.",
    );
  }

  redirect("/dashboard");
}
