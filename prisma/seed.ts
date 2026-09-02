// Seeds the library exercise catalog (ownerId: null). Run via `prisma db seed`
// (wired up in prisma7.config.ts). Connects directly over Postgres — no
// Supabase service role key needed, see .env.example.
//
// This only covers a small placeholder list (prisma/seed-data/exercises.json).
// Expanding it to the full curated ~50-80 exercise catalog is a follow-up
// content task, not a code change — just add entries to that JSON file.

import { prisma } from "../lib/db";
import exercises from "./seed-data/exercises.json";

async function main() {
  // Prisma's generated compound-unique input for @@unique([ownerId, name])
  // requires a non-null ownerId, so `upsert` can't target the null-ownerId
  // library rows directly — find-then-create/update instead.
  for (const exercise of exercises) {
    const existing = await prisma.exercise.findFirst({
      where: { ownerId: null, name: exercise.name },
    });

    if (existing) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: { muscleGroup: exercise.muscleGroup },
      });
    } else {
      await prisma.exercise.create({
        data: {
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          isCustom: false,
          ownerId: null,
        },
      });
    }
  }

  console.log(`Seeded ${exercises.length} library exercises.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
