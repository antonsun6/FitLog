"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { lbToKg } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/bodyweight?error=${encodeURIComponent(message)}`);
}

/** Parses the optional `<input type="date">` value (YYYY-MM-DD) into a Date,
 * or null to let the caller fall back to "now". Empty/missing is valid —
 * logging defaults to today. */
function parseLoggedAt(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function logBodyweight(formData: FormData) {
  const weightRaw = formData.get("weight");
  const loggedAtRaw = formData.get("loggedAt");

  if (typeof weightRaw !== "string" || !weightRaw) {
    fail("Weight is required.");
  }
  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0) {
    fail("Enter a valid weight greater than 0.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { unitPreference: true },
  });
  const weightKg = profile?.unitPreference === "LB" ? lbToKg(weight) : weight;

  const loggedAt = parseLoggedAt(loggedAtRaw);

  await prisma.bodyweightEntry.create({
    data: {
      userId: user.id,
      weightKg,
      ...(loggedAt ? { loggedAt } : {}),
    },
  });

  redirect("/bodyweight");
}

export async function updateBodyweightEntry(formData: FormData) {
  const entryId = formData.get("entryId");
  const weightRaw = formData.get("weight");
  const loggedAtRaw = formData.get("loggedAt");

  if (typeof entryId !== "string" || !entryId) {
    fail("Could not identify which entry to update.");
  }
  if (typeof weightRaw !== "string" || !weightRaw) {
    fail("Weight is required.");
  }
  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0) {
    fail("Enter a valid weight greater than 0.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { unitPreference: true },
  });
  const weightKg = profile?.unitPreference === "LB" ? lbToKg(weight) : weight;

  const loggedAt = parseLoggedAt(loggedAtRaw);

  // BodyweightEntry is directly owned by User (no join needed) — see the RLS
  // note in CLAUDE.md on why this filter, not just "is someone signed in",
  // is the actual ownership boundary (Prisma's role bypasses RLS).
  const { count } = await prisma.bodyweightEntry.updateMany({
    where: { id: entryId, userId: user.id },
    data: { weightKg, ...(loggedAt ? { loggedAt } : {}) },
  });
  if (count === 0) {
    fail("That entry could not be found.");
  }

  redirect("/bodyweight");
}

export async function deleteBodyweightEntry(formData: FormData) {
  const entryId = formData.get("entryId");

  if (typeof entryId !== "string" || !entryId) {
    fail("Could not identify which entry to delete.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  await prisma.bodyweightEntry.deleteMany({ where: { id: entryId, userId: user.id } });

  redirect("/bodyweight");
}
