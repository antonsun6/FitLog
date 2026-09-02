import type { PRType } from "@/generated/prisma/client";

/**
 * PR recalculation stub — see docs/TECHNICAL_PLAN.md §4 for the full
 * algorithm design. Not implemented yet; this is scaffolding only.
 *
 * When implemented, this must recompute all four PRType aggregates for
 * (userId, exerciseId) FROM SCRATCH against current SetEntry history (not
 * incrementally), so that editing or deleting a record-holding set correctly
 * demotes the PersonalRecord to the next-best set rather than leaving a
 * stale value. Call after every SetEntry create/update/delete, inside the
 * same transaction as that mutation.
 */
export type PRRecalculationResult = {
  recordType: PRType;
  changed: boolean;
};

export async function recalculatePersonalRecords(
  _userId: string,
  _exerciseId: string,
): Promise<PRRecalculationResult[]> {
  throw new Error("recalculatePersonalRecords: not yet implemented — see docs/TECHNICAL_PLAN.md §4");
}
