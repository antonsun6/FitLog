import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/db";
import { createFakeSupabase, fakeAuthedUser } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import { createUser, resetDb } from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { deleteAccount } from "./actions";

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function fakeAdmin(deleteUser = vi.fn().mockResolvedValue({ error: null })) {
  return { auth: { admin: { deleteUser } } };
}

describe("deleteAccount", () => {
  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteAccount(formData({ confirmEmail: "x@y.com" })));
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the Prisma profile doesn't exist", async () => {
    const authId = "11111111-1111-1111-1111-111111111111";
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(authId) }) as never,
    );
    const url = await captureRedirect(() => deleteAccount(formData({ confirmEmail: "x@y.com" })));
    expect(url).toContain("/settings?error=Account%20profile%20not%20found.");
  });

  it("redirects with an error when confirmEmail is omitted entirely", async () => {
    const user = await createUser({ email: "real@example.com" });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id) }) as never,
    );
    const url = await captureRedirect(() => deleteAccount(formData({})));
    expect(url).toContain("Type%20your%20email%20exactly");
  });

  it("redirects with an error when the typed email doesn't match", async () => {
    const user = await createUser({ email: "real@example.com" });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id) }) as never,
    );
    const url = await captureRedirect(() =>
      deleteAccount(formData({ confirmEmail: "wrong@example.com" })),
    );
    expect(url).toContain("Type%20your%20email%20exactly");

    const stillThere = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillThere).not.toBeNull();
  });

  it("redirects with an error and leaves Prisma data untouched when admin.deleteUser fails", async () => {
    const user = await createUser({ email: "real@example.com" });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id) }) as never,
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteUserFn = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin(deleteUserFn) as never);

    const url = await captureRedirect(() => deleteAccount(formData({ confirmEmail: "real@example.com" })));

    consoleError.mockRestore();
    expect(url).toContain("Something%20went%20wrong%20deleting%20your%20account");
    expect(deleteUserFn).toHaveBeenCalledWith(user.id);

    const stillThere = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the Supabase auth user before the Prisma profile, signs out, and redirects home", async () => {
    const user = await createUser({ email: "real@example.com" });
    const signOutFn = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id), signOut: signOutFn }) as never,
    );
    const deleteUserFn = vi.fn().mockImplementation(async (id: string) => {
      // At the moment the auth user is deleted, the Prisma profile must
      // still exist — this is the ordering the action is built around.
      const stillThere = await prisma.user.findUnique({ where: { id } });
      expect(stillThere).not.toBeNull();
      return { error: null };
    });
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin(deleteUserFn) as never);

    const url = await captureRedirect(() => deleteAccount(formData({ confirmEmail: "real@example.com" })));

    expect(deleteUserFn).toHaveBeenCalledWith(user.id);
    expect(signOutFn).toHaveBeenCalledOnce();
    expect(url).toBe("/");

    const gone = await prisma.user.findUnique({ where: { id: user.id } });
    expect(gone).toBeNull();
  });

  it("trims whitespace from the typed confirmation email", async () => {
    const user = await createUser({ email: "real@example.com" });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id) }) as never,
    );
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);

    const url = await captureRedirect(() =>
      deleteAccount(formData({ confirmEmail: "  real@example.com  " })),
    );
    expect(url).toBe("/");
  });

  it("cascades every owned table on deletion (real FK verification, not just the User row)", async () => {
    const user = await createUser({ email: "real@example.com" });
    const exercise = await prisma.exercise.create({
      data: { name: "Custom Lift", ownerId: user.id, muscleGroup: "Chest" },
    });
    const routine = await prisma.routine.create({ data: { userId: user.id, name: "Push" } });
    await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId: exercise.id, order: 0 },
    });
    const session = await prisma.workoutSession.create({ data: { userId: user.id } });
    const we = await prisma.workoutExercise.create({
      data: { sessionId: session.id, exerciseId: exercise.id, order: 0 },
    });
    const set = await prisma.setEntry.create({
      data: { workoutExerciseId: we.id, weightKg: 100, reps: 5, order: 0 },
    });
    await prisma.personalRecord.create({
      data: {
        userId: user.id,
        exerciseId: exercise.id,
        recordType: "MAX_WEIGHT",
        valueKg: 100,
        reps: 5,
        setEntryId: set.id,
        achievedAt: new Date(),
      },
    });
    await prisma.bodyweightEntry.create({ data: { userId: user.id, weightKg: 80 } });
    await prisma.muscleGroup.create({ data: { name: "Grip", ownerId: user.id } });

    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser(user.id) }) as never,
    );
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);

    await captureRedirect(() => deleteAccount(formData({ confirmEmail: "real@example.com" })));

    expect(await prisma.exercise.findUnique({ where: { id: exercise.id } })).toBeNull();
    expect(await prisma.routine.findUnique({ where: { id: routine.id } })).toBeNull();
    expect(await prisma.routineExercise.findMany({ where: { routineId: routine.id } })).toHaveLength(0);
    expect(await prisma.workoutSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.workoutExercise.findUnique({ where: { id: we.id } })).toBeNull();
    expect(await prisma.setEntry.findUnique({ where: { id: set.id } })).toBeNull();
    expect(await prisma.personalRecord.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await prisma.bodyweightEntry.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await prisma.muscleGroup.findMany({ where: { ownerId: user.id } })).toHaveLength(0);
  });
});
