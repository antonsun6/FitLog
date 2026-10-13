"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { recalculatePersonalRecords } from "@/lib/pr";
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

export async function deleteWorkoutSession(formData: FormData) {
  const sessionId = formData.get("sessionId");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Need the set of exercises this session touched BEFORE deleting it, so
  // we know which PersonalRecords might need to be recomputed afterward —
  // deleting a whole session can demote or clear records for any exercise
  // it contained (docs/TECHNICAL_PLAN.md §4).
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: { exercises: { select: { exerciseId: true } } },
  });
  if (!session) {
    redirect("/dashboard");
  }
  const affectedExerciseIds = [
    ...new Set(session.exercises.map((we) => we.exerciseId)),
  ];

  // Cascades WorkoutExercise + SetEntry rows (schema: onDelete: Cascade).
  await prisma.workoutSession.delete({ where: { id: sessionId } });

  await Promise.all(
    affectedExerciseIds.map((exerciseId) =>
      recalculatePersonalRecords(user.id, exerciseId),
    ),
  );

  redirect("/dashboard");
}
