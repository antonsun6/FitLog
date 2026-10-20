"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  getAvailableMuscleGroups,
  isCanonicalMuscleGroup,
} from "@/lib/muscle-groups";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/exercises?error=${encodeURIComponent(message)}`);
}

export async function addCustomExercise(formData: FormData) {
  const name = formData.get("name");
  const muscleGroup = formData.get("muscleGroup");

  if (
    typeof name !== "string" ||
    typeof muscleGroup !== "string" ||
    !name ||
    !muscleGroup
  ) {
    fail("Name and muscle group are required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    fail("You must be signed in to add an exercise.");
  }

  // The muscle group field is a <select> of known categories, but a request
  // can always be forged — re-validate server-side rather than trusting
  // whatever string arrives.
  const available = await getAvailableMuscleGroups(user.id);
  if (!available.some((g) => g.toLowerCase() === muscleGroup.toLowerCase())) {
    fail(
      `"${muscleGroup}" isn't a known category — add it first, or pick an existing one.`,
    );
  }

  // Case-insensitive duplicate check — see lib/muscle-groups.ts and the
  // migration note on Exercise's @@unique for why both this pre-check AND
  // the real guarantee (a case-insensitive DB index) exist: the pre-check
  // alone has a race window between two concurrent requests.
  const existing = await prisma.exercise.findFirst({
    where: { ownerId: user.id, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    fail(`You already have a custom exercise named "${existing.name}".`);
  }

  try {
    await prisma.exercise.create({
      data: { name, muscleGroup, isCustom: true, ownerId: user.id },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      fail(`You already have a custom exercise named "${name}".`);
    }
    console.error("Failed to create custom exercise:", error);
    fail("Something went wrong creating that exercise.");
  }

  redirect("/exercises");
}

export async function addMuscleGroup(formData: FormData) {
  const name = formData.get("name");

  if (typeof name !== "string" || !name.trim()) {
    fail("Category name is required.");
  }
  const trimmed = name.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    fail("You must be signed in to add a category.");
  }

  if (isCanonicalMuscleGroup(trimmed)) {
    fail(`"${trimmed}" already exists as a built-in category.`);
  }

  const existing = await prisma.muscleGroup.findFirst({
    where: { ownerId: user.id, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) {
    fail(`You already have a category named "${existing.name}".`);
  }

  try {
    await prisma.muscleGroup.create({
      data: { name: trimmed, ownerId: user.id },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      fail(`You already have a category named "${trimmed}".`);
    }
    console.error("Failed to create muscle group:", error);
    fail("Something went wrong creating that category.");
  }

  redirect("/exercises");
}

export async function deleteMuscleGroup(formData: FormData) {
  const muscleGroupId = formData.get("muscleGroupId");

  if (typeof muscleGroupId !== "string" || !muscleGroupId) {
    fail("Could not identify which category to delete.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    fail("You must be signed in to delete a category.");
  }

  const group = await prisma.muscleGroup.findFirst({
    where: { id: muscleGroupId, ownerId: user.id },
  });
  if (!group) {
    fail("That category could not be found.");
  }

  // Deleting a category out from under exercises that still use its string
  // would leave them with a label no longer offered to anyone — require
  // the category to be empty first rather than silently orphaning them
  // (there's no exercise-editing UI yet to reassign them).
  const exerciseCount = await prisma.exercise.count({
    where: {
      ownerId: user.id,
      muscleGroup: { equals: group.name, mode: "insensitive" },
    },
  });
  if (exerciseCount > 0) {
    fail(
      `"${group.name}" still has ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"} in it — remove or reassign them first.`,
    );
  }

  await prisma.muscleGroup.delete({ where: { id: group.id } });

  redirect("/exercises");
}
