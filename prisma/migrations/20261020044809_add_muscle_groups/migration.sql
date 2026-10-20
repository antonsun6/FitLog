-- CreateTable
CREATE TABLE "MuscleGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_ownerId_name_key" ON "MuscleGroup"("ownerId", "name");

-- AddForeignKey
ALTER TABLE "MuscleGroup" ADD CONSTRAINT "MuscleGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Case-insensitive uniqueness guarantee, hand-added (Prisma's schema DSL
-- can't express a function-based index). The plain @@unique([ownerId, name])
-- constraints above are case-SENSITIVE and let a real duplicate through in
-- practice via a race between two concurrent requests that both passed the
-- app-level case-insensitive pre-check before either committed ("Smith
-- Machine Press" vs "smith Machine Press"). These are the actual guarantee.
CREATE UNIQUE INDEX "Exercise_ownerId_lower_name_key" ON "Exercise" ("ownerId", lower("name"));
CREATE UNIQUE INDEX "MuscleGroup_ownerId_lower_name_key" ON "MuscleGroup" ("ownerId", lower("name"));
