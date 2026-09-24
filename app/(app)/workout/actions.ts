"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function startWorkoutSession(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const nameRaw = formData.get("name");
  const name =
    typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined;

  const session = await prisma.workoutSession.create({
    // Omitting `name` lets the schema default ("Lifting Session") apply.
    data: { userId: user.id, ...(name ? { name } : {}) },
  });

  redirect(`/workout/${session.id}`);
}

export async function renameWorkoutSession(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const nameRaw = formData.get("name");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }

  const name =
    typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null;
  if (!name) {
    redirect(
      `/dashboard?error=${encodeURIComponent("Workout name can't be empty.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  await prisma.workoutSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: { name },
  });

  redirect("/dashboard");
}
