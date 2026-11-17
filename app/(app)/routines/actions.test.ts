import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createFakeSupabase, fakeAuthedUser } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import { createExercise, createRoutine, createUser, resetDb } from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  addExerciseToRoutine,
  createRoutine as createRoutineAction,
  deleteRoutine,
  deleteRoutineExercise,
  renameRoutine,
  updateRoutineExercise,
} from "./actions";

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

describe("createRoutine", () => {
  it("redirects with an error when name is missing or blank", async () => {
    const url = await captureRedirect(() => createRoutineAction(formData({ name: "  " })));
    expect(url).toContain("/routines?error=Routine%20name%20is%20required.");
  });

  it("redirects with an error when the name field is omitted entirely", async () => {
    const url = await captureRedirect(() => createRoutineAction(formData({})));
    expect(url).toContain("/routines?error=Routine%20name%20is%20required.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => createRoutineAction(formData({ name: "Push Day" })));
    expect(url).toBe("/sign-in");
  });

  it("creates a routine for the signed-in user and redirects to it", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() => createRoutineAction(formData({ name: " Push Day " })));
    const routine = await prisma.routine.findFirst({ where: { userId: user.id } });
    expect(routine?.name).toBe("Push Day");
    expect(url).toBe(`/routines/${routine!.id}`);
  });
});

describe("renameRoutine", () => {
  it("redirects to /routines when routineId is missing", async () => {
    const url = await captureRedirect(() => renameRoutine(formData({ name: "x" })));
    expect(url).toBe("/routines");
  });

  it("redirects with an error when the new name is blank", async () => {
    const url = await captureRedirect(() => renameRoutine(formData({ routineId: "abc", name: "  " })));
    expect(url).toContain("/routines/abc?error=");
  });

  it("redirects with an error when the name field is omitted entirely", async () => {
    const url = await captureRedirect(() => renameRoutine(formData({ routineId: "abc" })));
    expect(url).toContain("/routines/abc?error=Routine%20name%20can't%20be%20empty.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => renameRoutine(formData({ routineId: "abc", name: "New" })));
    expect(url).toBe("/sign-in");
  });

  it("renames only a routine the user owns, then redirects back to it", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id, { name: "Not Mine" });
    await signedInAs(user.id);
    await captureRedirect(() => renameRoutine(formData({ routineId: routine.id, name: "Hijacked" })));

    const unchanged = await prisma.routine.findUnique({ where: { id: routine.id } });
    expect(unchanged?.name).toBe("Not Mine");
  });

  it("renames the user's own routine", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id, { name: "Old Name" });
    await signedInAs(user.id);
    const url = await captureRedirect(() => renameRoutine(formData({ routineId: routine.id, name: "New Name" })));
    expect(url).toBe(`/routines/${routine.id}`);
    const renamed = await prisma.routine.findUnique({ where: { id: routine.id } });
    expect(renamed?.name).toBe("New Name");
  });
});

describe("deleteRoutine", () => {
  it("redirects to /routines when routineId is missing", async () => {
    const url = await captureRedirect(() => deleteRoutine(formData({})));
    expect(url).toBe("/routines");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteRoutine(formData({ routineId: "abc" })));
    expect(url).toBe("/sign-in");
  });

  it("only deletes a routine the signed-in user owns", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id);
    await signedInAs(user.id);
    await captureRedirect(() => deleteRoutine(formData({ routineId: routine.id })));
    const stillThere = await prisma.routine.findUnique({ where: { id: routine.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the routine and redirects to /routines", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteRoutine(formData({ routineId: routine.id })));
    expect(url).toBe("/routines");
    const gone = await prisma.routine.findUnique({ where: { id: routine.id } });
    expect(gone).toBeNull();
  });
});

describe("addExerciseToRoutine", () => {
  it("redirects to /routines when routineId is missing", async () => {
    const url = await captureRedirect(() => addExerciseToRoutine(formData({ name: "Curl" })));
    expect(url).toBe("/routines");
  });

  it("redirects with an error when name is missing", async () => {
    const url = await captureRedirect(() => addExerciseToRoutine(formData({ routineId: "abc" })));
    expect(url).toContain("/routines/abc?error=Exercise%20name%20is%20required.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: "abc", name: "Curl" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the routine isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    expect(url).toContain("/routines?error=Routine%20not%20found.");
  });

  it.each(["0", "-3", "2.5"])("rejects an invalid target sets value (%s)", async (value) => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(
        formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps", targetSets: value }),
      ),
    );
    expect(url).toContain("Target%20sets%20must%20be%20a%20whole%20number");
  });

  it.each(["0", "-1", "2.5"])("rejects an invalid target reps value (%s)", async (value) => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(
        formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps", targetReps: value }),
      ),
    );
    expect(url).toContain("Target%20reps%20must%20be%20a%20whole%20number");
  });

  it("requires a muscle group when the exercise name doesn't already exist", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Brand New Move" })),
    );
    expect(url).toContain("Pick%20a%20muscle%20group");
  });

  it("rejects an unknown muscle group for a new exercise", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(
        formData({ routineId: routine.id, name: "Brand New Move", muscleGroup: "NotReal" }),
      ),
    );
    expect(url).toContain("isn't%20a%20known%20category");
  });

  it("reuses an existing library exercise by case-insensitive name instead of creating a duplicate", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const libraryExercise = await createExercise({ name: "Bench Press", ownerId: null });
    await signedInAs(user.id);
    await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "bench press" })),
    );

    const linked = await prisma.routineExercise.findMany({ where: { routineId: routine.id } });
    expect(linked).toHaveLength(1);
    expect(linked[0].exerciseId).toBe(libraryExercise.id);
  });

  it("creates a new custom exercise with target sets/reps and links it to the routine", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(
        formData({
          routineId: routine.id,
          name: "Curl",
          muscleGroup: "Biceps",
          targetSets: "3",
          targetReps: "10",
        }),
      ),
    );
    expect(url).toBe(`/routines/${routine.id}`);

    const linked = await prisma.routineExercise.findMany({
      where: { routineId: routine.id },
      include: { exercise: true },
    });
    expect(linked).toHaveLength(1);
    expect(linked[0].exercise.name).toBe("Curl");
    expect(linked[0].exercise.ownerId).toBe(user.id);
    expect(linked[0].targetSets).toBe(3);
    expect(linked[0].targetReps).toBe(10);
  });

  it("rejects adding an exercise that's already in the routine", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const exercise = await createExercise({ name: "Bench Press", ownerId: null });
    await prisma.routineExercise.create({ data: { routineId: routine.id, exerciseId: exercise.id, order: 0 } });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Bench Press" })),
    );
    expect(url).toContain("is%20already%20in%20this%20routine");
  });

  it("reuses an existing exercise instead of erroring when the case-insensitive lookup finds it", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await prisma.exercise.create({ data: { name: "Curl", ownerId: user.id, muscleGroup: "Biceps" } });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    const linked = await prisma.routineExercise.findMany({ where: { routineId: routine.id } });
    expect(linked).toHaveLength(1);
    expect(url).toBe(`/routines/${routine.id}`);
  });

  it("surfaces a race-condition duplicate (P2002) caught at create() time, not just the lookup", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await prisma.exercise.create({ data: { name: "Curl", ownerId: user.id, muscleGroup: "Biceps" } });
    await signedInAs(user.id);

    const findFirstSpy = vi.spyOn(prisma.exercise, "findFirst").mockResolvedValueOnce(null);
    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    findFirstSpy.mockRestore();

    expect(url).toContain("already%20have%20a%20custom%20exercise");
  });

  it("surfaces an unexpected (non-P2002) error from create() generically", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const createSpy = vi.spyOn(prisma.exercise, "create").mockRejectedValueOnce(new Error("db exploded"));

    const url = await captureRedirect(() =>
      addExerciseToRoutine(formData({ routineId: routine.id, name: "Curl", muscleGroup: "Biceps" })),
    );

    createSpy.mockRestore();
    consoleError.mockRestore();
    expect(url).toContain("Something%20went%20wrong%20adding%20that%20exercise.");
  });
});

describe("updateRoutineExercise", () => {
  it("redirects to /routines when routineId is missing", async () => {
    const url = await captureRedirect(() => updateRoutineExercise(formData({})));
    expect(url).toBe("/routines");
  });

  it("redirects with an error when routineExerciseId is missing", async () => {
    const url = await captureRedirect(() => updateRoutineExercise(formData({ routineId: "abc" })));
    expect(url).toContain("/routines/abc?error=Could%20not%20identify");
  });

  it.each(["0", "-3", "2.5"])("rejects an invalid target sets value (%s)", async (value) => {
    const url = await captureRedirect(() =>
      updateRoutineExercise(formData({ routineId: "abc", routineExerciseId: "re1", targetSets: value })),
    );
    expect(url).toContain("Target%20sets%20must%20be%20a%20whole%20number");
  });

  it.each(["0", "-1", "2.5"])("rejects an invalid target reps value (%s)", async (value) => {
    const url = await captureRedirect(() =>
      updateRoutineExercise(formData({ routineId: "abc", routineExerciseId: "re1", targetReps: value })),
    );
    expect(url).toContain("Target%20reps%20must%20be%20a%20whole%20number");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      updateRoutineExercise(formData({ routineId: "abc", routineExerciseId: "re1" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the routine exercise isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id);
    const exercise = await createExercise();
    const re = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      updateRoutineExercise(formData({ routineId: routine.id, routineExerciseId: re.id })),
    );
    expect(url).toContain("could%20not%20be%20found");
  });

  it("updates target sets and reps to new valid values", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const exercise = await createExercise();
    const re = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: 10 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      updateRoutineExercise(
        formData({ routineId: routine.id, routineExerciseId: re.id, targetSets: "5", targetReps: "12" }),
      ),
    );
    expect(url).toBe(`/routines/${routine.id}`);
    const updated = await prisma.routineExercise.findUnique({ where: { id: re.id } });
    expect(updated?.targetSets).toBe(5);
    expect(updated?.targetReps).toBe(12);
  });

  it("clears target sets/reps back to null when the fields are omitted", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const exercise = await createExercise();
    const re = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: 10 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      updateRoutineExercise(formData({ routineId: routine.id, routineExerciseId: re.id })),
    );
    expect(url).toBe(`/routines/${routine.id}`);
    const updated = await prisma.routineExercise.findUnique({ where: { id: re.id } });
    expect(updated?.targetSets).toBeNull();
  });
});

describe("deleteRoutineExercise", () => {
  it("redirects to /routines when routineId is missing", async () => {
    const url = await captureRedirect(() => deleteRoutineExercise(formData({})));
    expect(url).toBe("/routines");
  });

  it("redirects with an error when routineExerciseId is missing", async () => {
    const url = await captureRedirect(() => deleteRoutineExercise(formData({ routineId: "abc" })));
    expect(url).toContain("Could%20not%20identify");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      deleteRoutineExercise(formData({ routineId: "abc", routineExerciseId: "re1" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the routine exercise isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id);
    const exercise = await createExercise();
    const re = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      deleteRoutineExercise(formData({ routineId: routine.id, routineExerciseId: re.id })),
    );
    expect(url).toContain("could%20not%20be%20found");
    const stillThere = await prisma.routineExercise.findUnique({ where: { id: re.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the routine exercise and redirects back to the routine", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const exercise = await createExercise();
    const re = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      deleteRoutineExercise(formData({ routineId: routine.id, routineExerciseId: re.id })),
    );
    expect(url).toBe(`/routines/${routine.id}`);
    const gone = await prisma.routineExercise.findUnique({ where: { id: re.id } });
    expect(gone).toBeNull();
  });
});
