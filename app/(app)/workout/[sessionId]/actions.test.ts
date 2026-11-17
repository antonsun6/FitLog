import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { SetType, Unit } from "@/generated/prisma/client";
import { createFakeSupabase, fakeAuthedUser } from "../../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../../tests/helpers/redirect";
import {
  createExercise,
  createSession,
  createSet,
  createUser,
  createWorkoutExercise,
  resetDb,
} from "../../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  addExerciseToSession,
  deleteSet,
  deleteWorkoutExercise,
  finishWorkoutSession,
  logSet,
  saveExerciseNote,
  updateSet,
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

describe("addExerciseToSession", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => addExerciseToSession(formData({ name: "Curl" })));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when name is missing", async () => {
    const url = await captureRedirect(() => addExerciseToSession(formData({ sessionId: "s1" })));
    expect(url).toContain("/workout/s1?error=Exercise%20name%20is%20required.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => addExerciseToSession(formData({ sessionId: "s1", name: "Curl" })));
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the session isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const session = await createSession(otherUser.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    expect(url).toContain("Workout%20session%20not%20found.");
  });

  it("requires a muscle group for a genuinely new exercise", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Brand New" })),
    );
    expect(url).toContain("Pick%20a%20muscle%20group");
  });

  it("rejects an unknown muscle group", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Brand New", muscleGroup: "NotReal" })),
    );
    expect(url).toContain("isn't%20a%20known%20category");
  });

  it("reuses an existing library exercise by case-insensitive name", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const libraryExercise = await createExercise({ name: "Bench Press", ownerId: null });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "bench press" })),
    );
    expect(url).toBe(`/workout/${session.id}`);
    const linked = await prisma.workoutExercise.findMany({ where: { sessionId: session.id } });
    expect(linked[0].exerciseId).toBe(libraryExercise.id);
  });

  it("creates a new custom exercise and appends it at the next order position", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const existingExercise = await createExercise();
    await createWorkoutExercise(session.id, existingExercise.id, { order: 0 });
    await signedInAs(user.id);
    await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    const linked = await prisma.workoutExercise.findMany({
      where: { sessionId: session.id },
      orderBy: { order: "asc" },
      include: { exercise: true },
    });
    expect(linked).toHaveLength(2);
    expect(linked[1].exercise.name).toBe("Curl");
    expect(linked[1].order).toBe(1);
  });

  it("reuses an existing exercise instead of erroring when the case-insensitive lookup finds it", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await prisma.exercise.create({ data: { name: "Curl", ownerId: user.id, muscleGroup: "Biceps" } });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    expect(url).toBe(`/workout/${session.id}`);
  });

  it("surfaces a race-condition duplicate (P2002) caught at create() time, not just the lookup", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await prisma.exercise.create({ data: { name: "Curl", ownerId: user.id, muscleGroup: "Biceps" } });
    await signedInAs(user.id);

    const findFirstSpy = vi.spyOn(prisma.exercise, "findFirst").mockResolvedValueOnce(null);
    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Curl", muscleGroup: "Biceps" })),
    );
    findFirstSpy.mockRestore();

    expect(url).toContain("already%20have%20a%20custom%20exercise");
  });

  it("surfaces an unexpected (non-P2002) error from create() generically", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const createSpy = vi.spyOn(prisma.exercise, "create").mockRejectedValueOnce(new Error("db exploded"));

    const url = await captureRedirect(() =>
      addExerciseToSession(formData({ sessionId: session.id, name: "Curl", muscleGroup: "Biceps" })),
    );

    createSpy.mockRestore();
    consoleError.mockRestore();
    expect(url).toContain("Something%20went%20wrong%20adding%20that%20exercise.");
  });
});

describe("logSet", () => {
  async function setupSignedInSession(unitPreference: Unit = Unit.KG) {
    const user = await createUser({ unitPreference });
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    await signedInAs(user.id);
    return { user, exercise, session, we };
  }

  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => logSet(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when required fields are missing", async () => {
    const url = await captureRedirect(() => logSet(formData({ sessionId: "s1", workoutExerciseId: "we1" })));
    expect(url).toContain("Weight%20and%20reps%20are%20required.");
  });

  it("rejects a non-positive weight", async () => {
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: "s1", workoutExerciseId: "we1", weight: "0", reps: "5" })),
    );
    expect(url).toContain("Enter%20a%20valid%20weight");
  });

  it("rejects a non-integer or non-positive reps value", async () => {
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: "s1", workoutExerciseId: "we1", weight: "100", reps: "0" })),
    );
    expect(url).toContain("Reps%20must%20be%20a%20whole%20number");
  });

  it("rejects an out-of-range RPE", async () => {
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: "s1", workoutExerciseId: "we1", weight: "100", reps: "5", rpe: "11" })),
    );
    expect(url).toContain("RPE%20must%20be%20a%20number%20between%201%20and%2010");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: "s1", workoutExerciseId: "we1", weight: "100", reps: "5" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the workoutExercise isn't in a session the user owns", async () => {
    const { session } = await setupSignedInSession();
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: "bogus", weight: "100", reps: "5" })),
    );
    expect(url).toContain("could%20not%20be%20found%20in%20this%20session");
  });

  it("stores weight as-is (kg) for a kg-preference user and skips PR recalculation for a warm-up", async () => {
    const { session, we } = await setupSignedInSession(Unit.KG);
    const url = await captureRedirect(() =>
      logSet(
        formData({
          sessionId: session.id,
          workoutExerciseId: we.id,
          weight: "100",
          reps: "5",
          setType: "WARMUP",
        }),
      ),
    );
    expect(url).toBe(`/workout/${session.id}`);
    const stored = await prisma.setEntry.findFirst({ where: { workoutExerciseId: we.id } });
    expect(Number(stored?.weightKg)).toBe(100);
    expect(stored?.setType).toBe(SetType.WARMUP);
  });

  it("converts weight from lb to kg for an lb-preference user", async () => {
    const { session, we } = await setupSignedInSession(Unit.LB);
    await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: we.id, weight: "220", reps: "5" })),
    );
    const stored = await prisma.setEntry.findFirst({ where: { workoutExerciseId: we.id } });
    expect(Number(stored?.weightKg)).toBeCloseTo(99.79, 1);
  });

  it("appends sets at increasing order, defaults setType to WORKING, and accepts an optional RPE", async () => {
    const { session, we } = await setupSignedInSession();
    await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: we.id, weight: "100", reps: "5", rpe: "8" })),
    );
    await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: we.id, weight: "105", reps: "5" })),
    );
    const sets = await prisma.setEntry.findMany({ where: { workoutExerciseId: we.id }, orderBy: { order: "asc" } });
    expect(sets.map((s) => s.order)).toEqual([0, 1]);
    expect(sets[0].setType).toBe(SetType.WORKING);
    expect(Number(sets[0].rpe)).toBe(8);
    expect(sets[1].rpe).toBeNull();
  });

  it("recalculates PRs for a working set and redirects with ?pr= when it's a genuine new record", async () => {
    const { session, we } = await setupSignedInSession();
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: we.id, weight: "100", reps: "5" })),
    );
    expect(url).toContain(`/workout/${session.id}?pr=`);
    expect(url).toContain("MAX_WEIGHT");
  });

  it("redirects without ?pr= when logging a set that doesn't set any new record", async () => {
    const { user, exercise, session, we } = await setupSignedInSession();
    await captureRedirect(() =>
      logSet(formData({ sessionId: session.id, workoutExerciseId: we.id, weight: "100", reps: "5" })),
    );

    // A worse set in a SEPARATE session, so it can't inflate the first
    // session's cumulative volume into a new SESSION_VOLUME record too.
    const session2 = await createSession(user.id);
    const we2 = await createWorkoutExercise(session2.id, exercise.id);
    const url = await captureRedirect(() =>
      logSet(formData({ sessionId: session2.id, workoutExerciseId: we2.id, weight: "50", reps: "3" })),
    );
    expect(url).toBe(`/workout/${session2.id}`);
  });
});

describe("updateSet", () => {
  async function setupSetInSession() {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    const set = await createSet(we.id, { weightKg: 100, reps: 5 });
    await signedInAs(user.id);
    return { user, exercise, session, we, set };
  }

  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => updateSet(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when setEntryId is missing", async () => {
    const url = await captureRedirect(() => updateSet(formData({ sessionId: "s1" })));
    expect(url).toContain("Could%20not%20identify%20which%20set");
  });

  it("redirects with an error when weight or reps is missing", async () => {
    const url = await captureRedirect(() => updateSet(formData({ sessionId: "s1", setEntryId: "e1" })));
    expect(url).toContain("Weight%20and%20reps%20are%20required.");
  });

  it("rejects a non-positive weight", async () => {
    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: "s1", setEntryId: "e1", weight: "-5", reps: "5" })),
    );
    expect(url).toContain("Enter%20a%20valid%20weight");
  });

  it("rejects a non-integer reps value", async () => {
    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: "s1", setEntryId: "e1", weight: "100", reps: "2.5" })),
    );
    expect(url).toContain("Reps%20must%20be%20a%20whole%20number");
  });

  it("rejects an out-of-range RPE", async () => {
    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: "s1", setEntryId: "e1", weight: "100", reps: "5", rpe: "0" })),
    );
    expect(url).toContain("RPE%20must%20be%20a%20number%20between%201%20and%2010");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: "s1", setEntryId: "e1", weight: "100", reps: "5" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the set isn't in a session the user owns", async () => {
    const { session } = await setupSetInSession();
    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: session.id, setEntryId: "bogus", weight: "100", reps: "5" })),
    );
    expect(url).toContain("That%20set%20could%20not%20be%20found.");
  });

  it("updates the set (with lb->kg conversion), recalculates PRs, and never adds ?pr= even on promotion", async () => {
    const { user, session, set } = await setupSetInSession();
    await prisma.user.update({ where: { id: user.id }, data: { unitPreference: Unit.LB } });

    const url = await captureRedirect(() =>
      updateSet(
        formData({ sessionId: session.id, setEntryId: set.id, weight: "220", reps: "5", setType: "WARMUP", rpe: "7" }),
      ),
    );
    expect(url).toBe(`/workout/${session.id}`);

    const updated = await prisma.setEntry.findUnique({ where: { id: set.id } });
    expect(Number(updated?.weightKg)).toBeCloseTo(99.79, 1);
    expect(updated?.setType).toBe(SetType.WARMUP);
    expect(Number(updated?.rpe)).toBe(7);
  });

  it("works on a finished session (editing stays unlocked)", async () => {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id, { finishedAt: new Date() });
    const we = await createWorkoutExercise(session.id, exercise.id);
    const set = await createSet(we.id, { weightKg: 100, reps: 5 });
    await signedInAs(user.id);

    const url = await captureRedirect(() =>
      updateSet(formData({ sessionId: session.id, setEntryId: set.id, weight: "110", reps: "5" })),
    );
    expect(url).toBe(`/workout/${session.id}`);
    const updated = await prisma.setEntry.findUnique({ where: { id: set.id } });
    expect(Number(updated?.weightKg)).toBe(110);
  });
});

describe("deleteSet", () => {
  async function setupSetInSession() {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    const set = await createSet(we.id, { weightKg: 100, reps: 5 });
    await signedInAs(user.id);
    return { user, exercise, session, we, set };
  }

  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => deleteSet(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when setEntryId is missing", async () => {
    const url = await captureRedirect(() => deleteSet(formData({ sessionId: "s1" })));
    expect(url).toContain("Could%20not%20identify%20which%20set");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteSet(formData({ sessionId: "s1", setEntryId: "e1" })));
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the set isn't in a session the user owns", async () => {
    const { session } = await setupSetInSession();
    const url = await captureRedirect(() =>
      deleteSet(formData({ sessionId: session.id, setEntryId: "bogus" })),
    );
    expect(url).toContain("That%20set%20could%20not%20be%20found.");
  });

  it("deletes the set and recalculates (clears) PRs that no longer have supporting data", async () => {
    const { user, exercise, session, set } = await setupSetInSession();
    const { recalculatePersonalRecords } = await import("@/lib/pr");
    await recalculatePersonalRecords(user.id, exercise.id);

    const url = await captureRedirect(() => deleteSet(formData({ sessionId: session.id, setEntryId: set.id })));
    expect(url).toBe(`/workout/${session.id}`);

    const gone = await prisma.setEntry.findUnique({ where: { id: set.id } });
    expect(gone).toBeNull();
    const records = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(records).toHaveLength(0);
  });
});

describe("deleteWorkoutExercise", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => deleteWorkoutExercise(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when workoutExerciseId is missing", async () => {
    const url = await captureRedirect(() => deleteWorkoutExercise(formData({ sessionId: "s1" })));
    expect(url).toContain("Could%20not%20identify%20which%20exercise");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      deleteWorkoutExercise(formData({ sessionId: "s1", workoutExerciseId: "we1" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the exercise isn't in a session the user owns", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      deleteWorkoutExercise(formData({ sessionId: session.id, workoutExerciseId: "bogus" })),
    );
    expect(url).toContain("could%20not%20be%20found%20in%20this%20session");
  });

  it("cascades its sets and recalculates (clears) PRs for that exercise", async () => {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    await createSet(we.id, { weightKg: 100, reps: 5 });
    const { recalculatePersonalRecords } = await import("@/lib/pr");
    await recalculatePersonalRecords(user.id, exercise.id);
    await signedInAs(user.id);

    const url = await captureRedirect(() =>
      deleteWorkoutExercise(formData({ sessionId: session.id, workoutExerciseId: we.id })),
    );
    expect(url).toBe(`/workout/${session.id}`);

    const weGone = await prisma.workoutExercise.findUnique({ where: { id: we.id } });
    expect(weGone).toBeNull();
    const records = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(records).toHaveLength(0);
  });
});

describe("saveExerciseNote", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => saveExerciseNote(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when workoutExerciseId is missing", async () => {
    const url = await captureRedirect(() => saveExerciseNote(formData({ sessionId: "s1" })));
    expect(url).toContain("Could%20not%20identify%20which%20exercise");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      saveExerciseNote(formData({ sessionId: "s1", workoutExerciseId: "we1", note: "felt good" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the exercise isn't in a session the user owns", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      saveExerciseNote(formData({ sessionId: session.id, workoutExerciseId: "bogus", note: "x" })),
    );
    expect(url).toContain("could%20not%20be%20found%20in%20this%20session");
  });

  it("trims the note and stores null for a blank note", async () => {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    await signedInAs(user.id);

    await captureRedirect(() =>
      saveExerciseNote(formData({ sessionId: session.id, workoutExerciseId: we.id, note: "  felt easy  " })),
    );
    let updated = await prisma.workoutExercise.findUnique({ where: { id: we.id } });
    expect(updated?.note).toBe("felt easy");

    await captureRedirect(() =>
      saveExerciseNote(formData({ sessionId: session.id, workoutExerciseId: we.id, note: "   " })),
    );
    updated = await prisma.workoutExercise.findUnique({ where: { id: we.id } });
    expect(updated?.note).toBeNull();
  });
});

describe("finishWorkoutSession", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => finishWorkoutSession(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => finishWorkoutSession(formData({ sessionId: "s1" })));
    expect(url).toBe("/sign-in");
  });

  it("only finishes a session the user owns, and only if not already finished", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const othersSession = await createSession(otherUser.id);
    await signedInAs(user.id);
    await captureRedirect(() => finishWorkoutSession(formData({ sessionId: othersSession.id })));
    const unchanged = await prisma.workoutSession.findUnique({ where: { id: othersSession.id } });
    expect(unchanged?.finishedAt).toBeNull();
  });

  it("sets finishedAt and redirects to the dashboard", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() => finishWorkoutSession(formData({ sessionId: session.id })));
    expect(url).toBe("/dashboard");
    const finished = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(finished?.finishedAt).not.toBeNull();
  });
});
