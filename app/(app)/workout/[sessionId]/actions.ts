"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

function fail(sessionId: string, message: string): never {
  redirect(`/workout/${sessionId}?error=${encodeURIComponent(message)}`);
}

export async function addExerciseToSession(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const name = formData.get("name");
  const muscleGroup = formData.get("muscleGroup");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }

  if (typeof name !== "string" || !name) {
    fail(sessionId, "Exercise name is required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Re-verify ownership server-side — never trust the client-submitted
  // sessionId alone (same reasoning as the page's own lookup).
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id },
  });
  if (!session) {
    fail(sessionId, "Workout session not found.");
  }

  // Case-insensitive match against the library + this user's own exercises,
  // so retyping an existing name reuses it instead of erroring or creating
  // a duplicate. Per current scope, any newly-created exercise here always
  // becomes a permanent custom exercise (same as the Exercises page) — see
  // docs/PRD.md Backlog for the deferred "save to library or not?" idea.
  let exercise = await prisma.exercise.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      OR: [{ ownerId: null }, { ownerId: user.id }],
    },
  });

  if (!exercise) {
    if (typeof muscleGroup !== "string" || !muscleGroup) {
      fail(sessionId, "Enter a muscle group to add this as a new exercise.");
    }
    try {
      exercise = await prisma.exercise.create({
        data: { name, muscleGroup, isCustom: true, ownerId: user.id },
      });
    } catch (error) {
      console.error("Failed to create exercise from workout session:", error);
      fail(sessionId, "Something went wrong adding that exercise.");
    }
  }

  const order = await prisma.workoutExercise.count({ where: { sessionId } });

  await prisma.workoutExercise.create({
    data: { sessionId, exerciseId: exercise.id, order },
  });

  redirect(`/workout/${sessionId}`);
}
