"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
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

  // Case-insensitive duplicate check — the DB's @@unique([ownerId, name])
  // constraint alone is case-sensitive, so "Face Pull" and "face pull"
  // wouldn't otherwise be treated as the same exercise.
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
