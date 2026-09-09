"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function startWorkoutSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const session = await prisma.workoutSession.create({
    data: { userId: user.id },
  });

  redirect(`/workout/${session.id}`);
}
