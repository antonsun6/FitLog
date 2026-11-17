import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createFakeSupabase, fakeAuthedUser } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import { createUser, resetDb } from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { addCustomExercise, addMuscleGroup, deleteMuscleGroup } from "./actions";

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function signedInAs(userId: string) {
  vi.mocked(createClient).mockResolvedValue(createFakeSupabase({ getUser: fakeAuthedUser(userId) }) as never);
}

describe("addCustomExercise", () => {
  it("redirects with an error when name or muscle group is missing", async () => {
    const url = await captureRedirect(() => addCustomExercise(formData({ name: "Curl" })));
    expect(url).toContain("/exercises?error=");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      addCustomExercise(formData({ name: "Curl", muscleGroup: "Biceps" })),
    );
    expect(url).toContain("/exercises?error=You%20must%20be%20signed%20in");
  });

  it("rejects a muscle group that isn't canonical or the user's own custom one", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addCustomExercise(formData({ name: "Curl", muscleGroup: "NotARealGroup" })),
    );
    expect(url).toContain("isn't%20a%20known%20category");
  });

  it("rejects a case-insensitive duplicate of the user's own existing custom exercise", async () => {
    const user = await createUser();
    await prisma.exercise.create({ data: { name: "Smith Machine Press", ownerId: user.id, muscleGroup: "Chest" } });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addCustomExercise(formData({ name: "smith machine press", muscleGroup: "Chest" })),
    );
    expect(url).toContain("already%20have%20a%20custom%20exercise");
  });

  it("creates a custom exercise scoped to the signed-in user and redirects", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addCustomExercise(formData({ name: "Curl", muscleGroup: "Biceps" })),
    );
    expect(url).toBe("/exercises");
    const created = await prisma.exercise.findFirst({ where: { name: "Curl" } });
    expect(created?.ownerId).toBe(user.id);
    expect(created?.isCustom).toBe(true);
  });

  it("surfaces a race-condition duplicate (P2002) caught at create() time, not just the pre-check", async () => {
    const user = await createUser();
    await prisma.exercise.create({ data: { name: "Curl", ownerId: user.id, muscleGroup: "Biceps" } });
    await signedInAs(user.id);

    // Simulate the real race window: the pre-check's findFirst runs before
    // a concurrent request's row is visible (here forced via a mock), so it
    // reports "no existing exercise" even though one now exists — create()
    // then hits the real unique index and throws P2002 for real.
    const findFirstSpy = vi.spyOn(prisma.exercise, "findFirst").mockResolvedValueOnce(null);
    const url = await captureRedirect(() => addCustomExercise(formData({ name: "Curl", muscleGroup: "Biceps" })));
    findFirstSpy.mockRestore();

    expect(url).toContain("already%20have%20a%20custom%20exercise");
  });

  it("surfaces an unexpected (non-P2002) error from create() generically", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const createSpy = vi.spyOn(prisma.exercise, "create").mockRejectedValueOnce(new Error("db exploded"));

    const url = await captureRedirect(() => addCustomExercise(formData({ name: "Curl", muscleGroup: "Biceps" })));

    createSpy.mockRestore();
    consoleError.mockRestore();
    expect(url).toContain("Something%20went%20wrong%20creating%20that%20exercise.");
  });
});

describe("addMuscleGroup", () => {
  it("redirects with an error when name is missing or blank", async () => {
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "   " })));
    expect(url).toContain("/exercises?error=Category%20name%20is%20required.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "Grip" })));
    expect(url).toContain("You%20must%20be%20signed%20in");
  });

  it("rejects a name that collides with a canonical category", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "chest" })));
    expect(url).toContain("already%20exists%20as%20a%20built-in%20category");
  });

  it("rejects a case-insensitive duplicate of the user's own custom category", async () => {
    const user = await createUser();
    await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "grip" })));
    expect(url).toContain("already%20have%20a%20category");
  });

  it("creates a trimmed custom category and redirects", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "  Grip  " })));
    expect(url).toBe("/exercises");
    const created = await prisma.muscleGroup.findFirst({ where: { ownerId: user.id } });
    expect(created?.name).toBe("Grip");
  });

  it("surfaces a race-condition duplicate (P2002) caught at create() time, not just the pre-check", async () => {
    const user = await createUser();
    await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    await signedInAs(user.id);

    const findFirstSpy = vi.spyOn(prisma.muscleGroup, "findFirst").mockResolvedValueOnce(null);
    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "Grip" })));
    findFirstSpy.mockRestore();

    expect(url).toContain("already%20have%20a%20category");
  });

  it("surfaces an unexpected (non-P2002) error from create() generically", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const createSpy = vi.spyOn(prisma.muscleGroup, "create").mockRejectedValueOnce(new Error("db exploded"));

    const url = await captureRedirect(() => addMuscleGroup(formData({ name: "Grip" })));

    createSpy.mockRestore();
    consoleError.mockRestore();
    expect(url).toContain("Something%20went%20wrong%20creating%20that%20category.");
  });
});

describe("deleteMuscleGroup", () => {
  it("redirects with an error when muscleGroupId is missing", async () => {
    const url = await captureRedirect(() => deleteMuscleGroup(formData({})));
    expect(url).toContain("Could%20not%20identify");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteMuscleGroup(formData({ muscleGroupId: "nope" })));
    expect(url).toContain("You%20must%20be%20signed%20in");
  });

  it("redirects with an error when the category doesn't belong to the user", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const group = await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: otherUser.id } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteMuscleGroup(formData({ muscleGroupId: group.id })));
    expect(url).toContain("could%20not%20be%20found");
  });

  it("refuses to delete a category that still has exercises in it (singular count)", async () => {
    const user = await createUser();
    const group = await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    await prisma.exercise.create({ data: { name: "Farmer Carry", ownerId: user.id, muscleGroup: "Grip" } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteMuscleGroup(formData({ muscleGroupId: group.id })));
    expect(url).toContain("still%20has%201%20exercise%20in%20it");

    const stillThere = await prisma.muscleGroup.findUnique({ where: { id: group.id } });
    expect(stillThere).not.toBeNull();
  });

  it("refuses to delete a category with multiple exercises (plural count)", async () => {
    const user = await createUser();
    const group = await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    await prisma.exercise.create({ data: { name: "Farmer Carry", ownerId: user.id, muscleGroup: "Grip" } });
    await prisma.exercise.create({ data: { name: "Dead Hang", ownerId: user.id, muscleGroup: "Grip" } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteMuscleGroup(formData({ muscleGroupId: group.id })));
    expect(url).toContain("still%20has%202%20exercises%20in%20it");
  });

  it("deletes an empty custom category", async () => {
    const user = await createUser();
    const group = await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteMuscleGroup(formData({ muscleGroupId: group.id })));
    expect(url).toBe("/exercises");

    const gone = await prisma.muscleGroup.findUnique({ where: { id: group.id } });
    expect(gone).toBeNull();
  });
});
