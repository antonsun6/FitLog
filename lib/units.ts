/**
 * Weight is always stored canonically in kilograms (see
 * docs/PRD.md "Units & Data Integrity" and docs/TECHNICAL_PLAN.md §5).
 * A user's kg/lb preference is purely a display/input formatting concern —
 * it must never change what's persisted. Convert on the way in, convert on
 * the way out, and never round before storing.
 */

const KG_PER_LB = 0.45359237;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Round only for display — never feed the result back into a write. */
export function formatWeight(kg: number, unit: "KG" | "LB", decimals = 1): number {
  const value = unit === "LB" ? kgToLb(kg) : kg;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
