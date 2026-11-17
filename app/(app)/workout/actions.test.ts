import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createFakeSupabase, fakeAuthedUser } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import {
  createExercise,
  createRoutine,
  createSession,
  createSet,
  createUser,
  createWorkoutExercise,
  resetDb,
} from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { deleteWorkoutSession, renameWorkoutSession, startWorkoutSession } from "./actions";

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

describe("startWorkoutSession", () => {
  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => startWorkoutSession(formData({})));
    expect(url).toBe("/sign-in");
  });

  it("creates a session with the default name when none is given", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const url = await captureRedirect(() => startWorkoutSession(formData({})));
    const session = await prisma.workoutSession.findFirst({ where: { userId: user.id } });
    expect(session?.name).toBe("Lifting Session");
    expect(url).toBe(`/workout/${session!.id}`);
  });

  it("uses a trimmed custom name when given", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    await captureRedirect(() => startWorkoutSession(formData({ name: "  Leg Day  " })));
    const session = await prisma.workoutSession.findFirst({ where: { userId: user.id } });
    expect(session?.name).toBe("Leg Day");
  });

  it("ignores a routineId that doesn't belong to the user", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const routine = await createRoutine(otherUser.id);
    await signedInAs(user.id);
    await captureRedirect(() => startWorkoutSession(formData({ routineId: routine.id })));
    const session = await prisma.workoutSession.findFirst({ where: { userId: user.id } });
    expect(session?.routineId).toBeNull();
  });

  it("pre-fills the session's exercises from the routine, in routine order, and records the routine link", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    const exerciseA = await createExercise({ name: "Squat" });
    const exerciseB = await createExercise({ name: "Bench" });
    await prisma.routineExercise.create({ data: { routineId: routine.id, exerciseId: exerciseA.id, order: 0 } });
    await prisma.routineExercise.create({ data: { routineId: routine.id, exerciseId: exerciseB.id, order: 1 } });
    await signedInAs(user.id);

    const url = await captureRedirect(() => startWorkoutSession(formData({ routineId: routine.id })));
    const session = await prisma.workoutSession.findFirst({ where: { userId: user.id } });
    expect(session?.routineId).toBe(routine.id);
    expect(url).toBe(`/workout/${session!.id}`);

    const exercises = await prisma.workoutExercise.findMany({
      where: { sessionId: session!.id },
      orderBy: { order: "asc" },
    });
    expect(exercises.map((e) => e.exerciseId)).toEqual([exerciseA.id, exerciseB.id]);
  });

  it("creates no exercises when the routine itself has none", async () => {
    const user = await createUser();
    const routine = await createRoutine(user.id);
    await signedInAs(user.id);
    await captureRedirect(() => startWorkoutSession(formData({ routineId: routine.id })));
    const session = await prisma.workoutSession.findFirst({ where: { userId: user.id } });
    const exercises = await prisma.workoutExercise.findMany({ where: { sessionId: session!.id } });
    expect(exercises).toHaveLength(0);
  });
});

describe("renameWorkoutSession", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => renameWorkoutSession(formData({ name: "x" })));
    expect(url).toBe("/dashboard");
  });

  it("redirects with an error when the new name is blank", async () => {
    const url = await captureRedirect(() => renameWorkoutSession(formData({ sessionId: "s1", name: "  " })));
    expect(url).toContain("/dashboard?error=Workout%20name%20can't%20be%20empty.");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => renameWorkoutSession(formData({ sessionId: "s1", name: "New" })));
    expect(url).toBe("/sign-in");
  });

  it("only renames a session the signed-in user owns", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const session = await createSession(otherUser.id, { name: "Not Mine" });
    await signedInAs(user.id);
    await captureRedirect(() => renameWorkoutSession(formData({ sessionId: session.id, name: "Hijacked" })));
    const unchanged = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(unchanged?.name).toBe("Not Mine");
  });

  it("renames the session and redirects to the dashboard", async () => {
    const user = await createUser();
    const session = await createSession(user.id, { name: "Old" });
    await signedInAs(user.id);
    const url = await captureRedirect(() => renameWorkoutSession(formData({ sessionId: session.id, name: "New" })));
    expect(url).toBe("/dashboard");
    const renamed = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(renamed?.name).toBe("New");
  });
});

describe("deleteWorkoutSession", () => {
  it("redirects to /dashboard when sessionId is missing", async () => {
    const url = await captureRedirect(() => deleteWorkoutSession(formData({})));
    expect(url).toBe("/dashboard");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteWorkoutSession(formData({ sessionId: "s1" })));
    expect(url).toBe("/sign-in");
  });

  it("redirects to /dashboard when the session isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const session = await createSession(otherUser.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteWorkoutSession(formData({ sessionId: session.id })));
    expect(url).toBe("/dashboard");
    const stillThere = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the session (cascading exercises/sets) and recalculates PRs for every exercise it touched", async () => {
    const user = await createUser();
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const we = await createWorkoutExercise(session.id, exercise.id);
    await createSet(we.id, { weightKg: 100, reps: 5 });
    // Establish the record first, same as logSet would.
    const { recalculatePersonalRecords } = await import("@/lib/pr");
    await recalculatePersonalRecords(user.id, exercise.id);
    const before = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(before.length).toBeGreaterThan(0);

    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteWorkoutSession(formData({ sessionId: session.id })));
    expect(url).toBe("/dashboard");

    const sessionGone = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(sessionGone).toBeNull();
    const exerciseGone = await prisma.workoutExercise.findMany({ where: { sessionId: session.id } });
    expect(exerciseGone).toHaveLength(0);

    // The deleted session held the only sets for this exercise, so every
    // record should now be cleared rather than left stale.
    const after = await prisma.personalRecord.findMany({ where: { userId: user.id, exerciseId: exercise.id } });
    expect(after).toHaveLength(0);
  });

  it("handles a session with no exercises at all (nothing to recalculate)", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteWorkoutSession(formData({ sessionId: session.id })));
    expect(url).toBe("/dashboard");
  });
});
