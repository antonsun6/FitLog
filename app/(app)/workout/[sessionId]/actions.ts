"use server";

import { redirect } from "next/navigation";
import { Prisma, SetType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { lbToKg } from "@/lib/units";
import { recalculatePersonalRecords } from "@/lib/pr";
import { getAvailableMuscleGroups } from "@/lib/muscle-groups";
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
      fail(sessionId, "Pick a muscle group to add this as a new exercise.");
    }
    // The muscle group field is a <select> of known categories, but a
    // request can always be forged — re-validate rather than trusting it.
    const available = await getAvailableMuscleGroups(user.id);
    if (!available.some((g) => g.toLowerCase() === muscleGroup.toLowerCase())) {
      fail(
        sessionId,
        `"${muscleGroup}" isn't a known category — add it from the Exercises page first.`,
      );
    }
    try {
      exercise = await prisma.exercise.create({
        data: { name, muscleGroup, isCustom: true, ownerId: user.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        fail(sessionId, `You already have a custom exercise named "${name}".`);
      }
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

export async function logSet(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const workoutExerciseId = formData.get("workoutExerciseId");
  const weightRaw = formData.get("weight");
  const repsRaw = formData.get("reps");
  const setTypeRaw = formData.get("setType");
  const rpeRaw = formData.get("rpe");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }

  if (
    typeof workoutExerciseId !== "string" ||
    !workoutExerciseId ||
    typeof weightRaw !== "string" ||
    !weightRaw ||
    typeof repsRaw !== "string" ||
    !repsRaw
  ) {
    fail(sessionId, "Weight and reps are required.");
  }

  const weight = Number(weightRaw);
  const reps = Number(repsRaw);
  if (!Number.isFinite(weight) || weight <= 0) {
    fail(sessionId, "Enter a valid weight greater than 0.");
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    fail(sessionId, "Reps must be a whole number greater than 0.");
  }

  let rpe: number | null = null;
  if (typeof rpeRaw === "string" && rpeRaw) {
    rpe = Number(rpeRaw);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
      fail(sessionId, "RPE must be a number between 1 and 10.");
    }
  }

  const setType = setTypeRaw === "WARMUP" ? SetType.WARMUP : SetType.WORKING;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // WorkoutExercise has no direct userId — ownership has to be checked
  // through the session relation, same reasoning as everywhere else in
  // this file: Prisma bypasses RLS, so this join is the actual boundary.
  const workoutExercise = await prisma.workoutExercise.findFirst({
    where: { id: workoutExerciseId, session: { userId: user.id } },
    select: { id: true, sessionId: true, exerciseId: true },
  });
  if (!workoutExercise) {
    fail(sessionId, "That exercise could not be found in this session.");
  }

  // Convert to canonical kg per the user's stored preference — see
  // lib/units.ts and docs/PRD.md "Units & Data Integrity". Never store the
  // display unit directly.
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { unitPreference: true },
  });
  const weightKg = profile?.unitPreference === "LB" ? lbToKg(weight) : weight;

  const order = await prisma.setEntry.count({ where: { workoutExerciseId } });

  await prisma.setEntry.create({
    data: { workoutExerciseId, weightKg, reps, setType, rpe, order },
  });

  // Only working sets count toward records (see lib/pr.ts) — recalculating
  // after a warm-up would be wasted work and can never change anything.
  let newRecordTypes: string[] = [];
  if (setType === SetType.WORKING) {
    const results = await recalculatePersonalRecords(
      user.id,
      workoutExercise.exerciseId,
    );
    newRecordTypes = results
      .filter((r) => r.isNewRecord)
      .map((r) => r.recordType);
  }

  const prQuery =
    newRecordTypes.length > 0 ? `?pr=${newRecordTypes.join(",")}` : "";
  redirect(`/workout/${workoutExercise.sessionId}${prQuery}`);
}

export async function updateSet(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const setEntryId = formData.get("setEntryId");
  const weightRaw = formData.get("weight");
  const repsRaw = formData.get("reps");
  const setTypeRaw = formData.get("setType");
  const rpeRaw = formData.get("rpe");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }
  if (typeof setEntryId !== "string" || !setEntryId) {
    fail(sessionId, "Could not identify which set to update.");
  }
  if (
    typeof weightRaw !== "string" ||
    !weightRaw ||
    typeof repsRaw !== "string" ||
    !repsRaw
  ) {
    fail(sessionId, "Weight and reps are required.");
  }

  const weight = Number(weightRaw);
  const reps = Number(repsRaw);
  if (!Number.isFinite(weight) || weight <= 0) {
    fail(sessionId, "Enter a valid weight greater than 0.");
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    fail(sessionId, "Reps must be a whole number greater than 0.");
  }

  let rpe: number | null = null;
  if (typeof rpeRaw === "string" && rpeRaw) {
    rpe = Number(rpeRaw);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
      fail(sessionId, "RPE must be a number between 1 and 10.");
    }
  }

  const setType = setTypeRaw === "WARMUP" ? SetType.WARMUP : SetType.WORKING;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // SetEntry has no direct userId — ownership has to be checked through the
  // full workoutExercise → session chain, same reasoning as everywhere else
  // in this file: Prisma bypasses RLS, so this join is the actual boundary.
  // Editing (not just logging) is explicitly an MVP feature — see
  // docs/PRD.md "Data editing" — so this intentionally works even once the
  // session is finished, unlike logSet/addExerciseToSession.
  const setEntry = await prisma.setEntry.findFirst({
    where: { id: setEntryId, workoutExercise: { session: { userId: user.id } } },
    select: { workoutExercise: { select: { exerciseId: true } } },
  });
  if (!setEntry) {
    fail(sessionId, "That set could not be found.");
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { unitPreference: true },
  });
  const weightKg = profile?.unitPreference === "LB" ? lbToKg(weight) : weight;

  await prisma.setEntry.update({
    where: { id: setEntryId },
    data: { weightKg, reps, setType, rpe },
  });

  // Recompute from scratch — a full recompute (not incremental) is what
  // correctly promotes OR demotes a record after an edit, same algorithm as
  // logSet uses. We deliberately don't surface a "New PR!" celebration here
  // even if a record moved: per docs/TECHNICAL_PLAN.md §4, that celebration
  // is reserved for the moment a set is first logged, not a retroactive
  // correction.
  await recalculatePersonalRecords(user.id, setEntry.workoutExercise.exerciseId);

  redirect(`/workout/${sessionId}`);
}

export async function deleteSet(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const setEntryId = formData.get("setEntryId");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }
  if (typeof setEntryId !== "string" || !setEntryId) {
    fail(sessionId, "Could not identify which set to delete.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const setEntry = await prisma.setEntry.findFirst({
    where: { id: setEntryId, workoutExercise: { session: { userId: user.id } } },
    select: { workoutExercise: { select: { exerciseId: true } } },
  });
  if (!setEntry) {
    fail(sessionId, "That set could not be found.");
  }

  await prisma.setEntry.delete({ where: { id: setEntryId } });

  // A full recompute naturally demotes (or clears) whatever record this set
  // held, rather than leaving a stale value — see docs/TECHNICAL_PLAN.md §4.
  await recalculatePersonalRecords(user.id, setEntry.workoutExercise.exerciseId);

  redirect(`/workout/${sessionId}`);
}

export async function deleteWorkoutExercise(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const workoutExerciseId = formData.get("workoutExerciseId");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }
  if (typeof workoutExerciseId !== "string" || !workoutExerciseId) {
    fail(sessionId, "Could not identify which exercise to remove.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const workoutExercise = await prisma.workoutExercise.findFirst({
    where: { id: workoutExerciseId, session: { userId: user.id } },
    select: { exerciseId: true },
  });
  if (!workoutExercise) {
    fail(sessionId, "That exercise could not be found in this session.");
  }

  // Cascades its SetEntry rows (schema: onDelete: Cascade).
  await prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });

  // Recompute from scratch for the exercise that just lost all its sets in
  // this session — lib/pr.ts clears any PersonalRecord that no longer has
  // supporting data.
  await recalculatePersonalRecords(user.id, workoutExercise.exerciseId);

  redirect(`/workout/${sessionId}`);
}

export async function saveExerciseNote(formData: FormData) {
  const sessionId = formData.get("sessionId");
  const workoutExerciseId = formData.get("workoutExerciseId");
  const noteRaw = formData.get("note");

  if (typeof sessionId !== "string" || !sessionId) {
    redirect("/dashboard");
  }
  if (typeof workoutExerciseId !== "string" || !workoutExerciseId) {
    fail(sessionId, "Could not identify which exercise to note.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;

  // updateMany lets the ownership check (via the session relation) and the
  // write be one atomic query — a non-owner's id simply matches 0 rows.
  const { count } = await prisma.workoutExercise.updateMany({
    where: { id: workoutExerciseId, session: { userId: user.id } },
    data: { note },
  });
  if (count === 0) {
    fail(sessionId, "That exercise could not be found in this session.");
  }

  redirect(`/workout/${sessionId}`);
}

export async function finishWorkoutSession(formData: FormData) {
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

  // Only marks an as-yet-unfinished session belonging to this user.
  await prisma.workoutSession.updateMany({
    where: { id: sessionId, userId: user.id, finishedAt: null },
    data: { finishedAt: new Date() },
  });

  redirect("/dashboard");
}
