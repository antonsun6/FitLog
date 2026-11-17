"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getAvailableMuscleGroups } from "@/lib/muscle-groups";
import { createClient } from "@/lib/supabase/server";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createRoutine(formData: FormData) {
  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) {
    fail("/routines", "Routine name is required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const routine = await prisma.routine.create({
    data: { userId: user.id, name },
  });

  redirect(`/routines/${routine.id}`);
}

export async function renameRoutine(formData: FormData) {
  const routineId = formData.get("routineId");
  const nameRaw = formData.get("name");

  if (typeof routineId !== "string" || !routineId) {
    redirect("/routines");
  }

  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) {
    fail(`/routines/${routineId}`, "Routine name can't be empty.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  await prisma.routine.updateMany({
    where: { id: routineId, userId: user.id },
    data: { name },
  });

  redirect(`/routines/${routineId}`);
}

export async function deleteRoutine(formData: FormData) {
  const routineId = formData.get("routineId");

  if (typeof routineId !== "string" || !routineId) {
    redirect("/routines");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Cascades RoutineExercise rows; past WorkoutSessions keep their history
  // and just lose the routine reference (schema: onDelete: SetNull).
  await prisma.routine.deleteMany({ where: { id: routineId, userId: user.id } });

  redirect("/routines");
}

export async function addExerciseToRoutine(formData: FormData) {
  const routineId = formData.get("routineId");
  const name = formData.get("name");
  const muscleGroup = formData.get("muscleGroup");
  const targetSetsRaw = formData.get("targetSets");
  const targetRepsRaw = formData.get("targetReps");

  if (typeof routineId !== "string" || !routineId) {
    redirect("/routines");
  }

  if (typeof name !== "string" || !name) {
    fail(`/routines/${routineId}`, "Exercise name is required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const routine = await prisma.routine.findFirst({
    where: { id: routineId, userId: user.id },
  });
  if (!routine) {
    fail("/routines", "Routine not found.");
  }

  let targetSets: number | null = null;
  if (typeof targetSetsRaw === "string" && targetSetsRaw) {
    targetSets = Number(targetSetsRaw);
    if (!Number.isInteger(targetSets) || targetSets <= 0) {
      fail(`/routines/${routineId}`, "Target sets must be a whole number greater than 0.");
    }
  }
  let targetReps: number | null = null;
  if (typeof targetRepsRaw === "string" && targetRepsRaw) {
    targetReps = Number(targetRepsRaw);
    if (!Number.isInteger(targetReps) || targetReps <= 0) {
      fail(`/routines/${routineId}`, "Target reps must be a whole number greater than 0.");
    }
  }

  // Same case-insensitive library-or-custom lookup as adding an exercise to
  // a live workout session — see workout/[sessionId]/actions.ts.
  let exercise = await prisma.exercise.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      OR: [{ ownerId: null }, { ownerId: user.id }],
    },
  });

  if (!exercise) {
    if (typeof muscleGroup !== "string" || !muscleGroup) {
      fail(`/routines/${routineId}`, "Pick a muscle group to add this as a new exercise.");
    }
    const available = await getAvailableMuscleGroups(user.id);
    if (!available.some((g) => g.toLowerCase() === muscleGroup.toLowerCase())) {
      fail(
        `/routines/${routineId}`,
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
        fail(`/routines/${routineId}`, `You already have a custom exercise named "${name}".`);
      }
      console.error("Failed to create exercise from routine:", error);
      fail(`/routines/${routineId}`, "Something went wrong adding that exercise.");
    }
  }

  const alreadyInRoutine = await prisma.routineExercise.findFirst({
    where: { routineId, exerciseId: exercise.id },
  });
  if (alreadyInRoutine) {
    fail(`/routines/${routineId}`, `${exercise.name} is already in this routine.`);
  }

  const order = await prisma.routineExercise.count({ where: { routineId } });

  await prisma.routineExercise.create({
    data: { routineId, exerciseId: exercise.id, targetSets, targetReps, order },
  });

  redirect(`/routines/${routineId}`);
}

export async function updateRoutineExercise(formData: FormData) {
  const routineId = formData.get("routineId");
  const routineExerciseId = formData.get("routineExerciseId");
  const targetSetsRaw = formData.get("targetSets");
  const targetRepsRaw = formData.get("targetReps");

  if (typeof routineId !== "string" || !routineId) {
    redirect("/routines");
  }
  if (typeof routineExerciseId !== "string" || !routineExerciseId) {
    fail(`/routines/${routineId}`, "Could not identify which exercise to update.");
  }

  let targetSets: number | null = null;
  if (typeof targetSetsRaw === "string" && targetSetsRaw) {
    targetSets = Number(targetSetsRaw);
    if (!Number.isInteger(targetSets) || targetSets <= 0) {
      fail(`/routines/${routineId}`, "Target sets must be a whole number greater than 0.");
    }
  }
  let targetReps: number | null = null;
  if (typeof targetRepsRaw === "string" && targetRepsRaw) {
    targetReps = Number(targetRepsRaw);
    if (!Number.isInteger(targetReps) || targetReps <= 0) {
      fail(`/routines/${routineId}`, "Target reps must be a whole number greater than 0.");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // RoutineExercise has no direct userId — ownership goes through the
  // routine relation, same reasoning as every join-table check elsewhere
  // (Prisma bypasses RLS; this is the actual boundary).
  const { count } = await prisma.routineExercise.updateMany({
    where: { id: routineExerciseId, routine: { userId: user.id } },
    data: { targetSets, targetReps },
  });
  if (count === 0) {
    fail(`/routines/${routineId}`, "That exercise could not be found in this routine.");
  }

  redirect(`/routines/${routineId}`);
}

export async function deleteRoutineExercise(formData: FormData) {
  const routineId = formData.get("routineId");
  const routineExerciseId = formData.get("routineExerciseId");

  if (typeof routineId !== "string" || !routineId) {
    redirect("/routines");
  }
  if (typeof routineExerciseId !== "string" || !routineExerciseId) {
    fail(`/routines/${routineId}`, "Could not identify which exercise to remove.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { count } = await prisma.routineExercise.deleteMany({
    where: { id: routineExerciseId, routine: { userId: user.id } },
  });
  if (count === 0) {
    fail(`/routines/${routineId}`, "That exercise could not be found in this routine.");
  }

  redirect(`/routines/${routineId}`);
}
