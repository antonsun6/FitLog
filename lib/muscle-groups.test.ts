import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import {
  CANONICAL_MUSCLE_GROUPS,
  getAvailableMuscleGroups,
  isCanonicalMuscleGroup,
  sortMuscleGroups,
} from "./muscle-groups";
import { resetDb, createUser } from "../tests/helpers/db";

describe("sortMuscleGroups", () => {
  it("orders canonical groups by their fixed display order", () => {
    expect(sortMuscleGroups(["Back", "Chest", "Triceps"])).toEqual([
      "Chest",
      "Back",
      "Triceps",
    ]);
  });

  it("matches canonical names case-insensitively", () => {
    expect(sortMuscleGroups(["back", "CHEST"])).toEqual(["CHEST", "back"]);
  });

  it("places non-canonical names after all canonical ones, alphabetically", () => {
    expect(sortMuscleGroups(["Grip", "Chest", "Neck"])).toEqual([
      "Chest",
      "Grip",
      "Neck",
    ]);
  });

  it("sorts two non-canonical names alphabetically against each other", () => {
    expect(sortMuscleGroups(["Neck", "Grip"])).toEqual(["Grip", "Neck"]);
  });

  it("de-duplicates repeated names", () => {
    expect(sortMuscleGroups(["Chest", "Chest", "Grip", "Grip"])).toEqual([
      "Chest",
      "Grip",
    ]);
  });

  it("handles an empty input", () => {
    expect(sortMuscleGroups([])).toEqual([]);
  });
});

describe("isCanonicalMuscleGroup", () => {
  it("is true for a canonical name", () => {
    expect(isCanonicalMuscleGroup("Chest")).toBe(true);
  });

  it("is true case-insensitively", () => {
    expect(isCanonicalMuscleGroup("chest")).toBe(true);
  });

  it("is false for a custom category", () => {
    expect(isCanonicalMuscleGroup("Grip")).toBe(false);
  });
});

describe("getAvailableMuscleGroups", () => {
  afterEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("returns the canonical list when the user has no custom categories", async () => {
    const user = await createUser();
    const groups = await getAvailableMuscleGroups(user.id);
    expect(groups).toEqual([...CANONICAL_MUSCLE_GROUPS]);
  });

  it("merges in the user's custom categories, sorted after the canonical ones", async () => {
    const user = await createUser();
    await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    const groups = await getAvailableMuscleGroups(user.id);
    expect(groups).toEqual([...CANONICAL_MUSCLE_GROUPS, "Grip"]);
  });

  it("never returns another user's custom categories", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: otherUser.id } });
    const groups = await getAvailableMuscleGroups(user.id);
    expect(groups).toEqual([...CANONICAL_MUSCLE_GROUPS]);
  });
});
