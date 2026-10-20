import { prisma } from "@/lib/db";

/**
 * Fixed display order for the built-in muscle groups. These aren't rows in
 * the database (unlike a user's custom ones, stored in `MuscleGroup`) — the
 * library `Exercise` catalog just happens to use these exact strings, so
 * this is purely a sort key, not a source of truth for which groups exist.
 */
export const CANONICAL_MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Calves",
  "Abductor/Adductor",
  "Abs",
  "Forearms",
] as const;

/**
 * Sorts muscle group names into: the canonical list (in its fixed order),
 * then everything else (custom categories, or any stray value) alphabetically.
 * Comparison is case-insensitive since names are user-entered.
 */
export function sortMuscleGroups(names: Iterable<string>): string[] {
  const canonicalIndex = new Map(
    CANONICAL_MUSCLE_GROUPS.map((name, i) => [name.toLowerCase(), i]),
  );
  return [...new Set(names)].sort((a, b) => {
    const ai = canonicalIndex.get(a.toLowerCase());
    const bi = canonicalIndex.get(b.toLowerCase());
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

export function isCanonicalMuscleGroup(name: string): boolean {
  return CANONICAL_MUSCLE_GROUPS.some(
    (canonical) => canonical.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * All category names a given user is allowed to file an exercise under:
 * the fixed canonical list plus whatever custom `MuscleGroup` rows they've
 * declared, in display order. The single source of truth for both the
 * add-exercise `<select>` options and server-side validation of what gets
 * submitted — see docs context in app/(app)/exercises/actions.ts.
 */
export async function getAvailableMuscleGroups(userId: string): Promise<string[]> {
  const custom = await prisma.muscleGroup.findMany({
    where: { ownerId: userId },
    select: { name: true },
  });
  return sortMuscleGroups([
    ...CANONICAL_MUSCLE_GROUPS,
    ...custom.map((c) => c.name),
  ]);
}
