import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { Unit } from "@/generated/prisma/client";
import { createFakeSupabase, fakeAuthedUser } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import { createUser, resetDb } from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { deleteBodyweightEntry, logBodyweight, updateBodyweightEntry } from "./actions";

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

describe("logBodyweight", () => {
  it("redirects with an error when weight is missing", async () => {
    const url = await captureRedirect(() => logBodyweight(formData({})));
    expect(url).toBe("/bodyweight?error=Weight%20is%20required.");
  });

  it("rejects a non-positive weight", async () => {
    const url = await captureRedirect(() => logBodyweight(formData({ weight: "0" })));
    expect(url).toContain("Enter%20a%20valid%20weight");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => logBodyweight(formData({ weight: "180" })));
    expect(url).toBe("/sign-in");
  });

  it("stores weight as-is (kg) for a kg-preference user, defaulting loggedAt to now", async () => {
    const user = await createUser({ unitPreference: Unit.KG });
    await signedInAs(user.id);
    const before = new Date();
    const url = await captureRedirect(() => logBodyweight(formData({ weight: "82.5" })));
    expect(url).toBe("/bodyweight");

    const entry = await prisma.bodyweightEntry.findFirst({ where: { userId: user.id } });
    expect(Number(entry?.weightKg)).toBe(82.5);
    expect(entry!.loggedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("converts weight from lb to kg for an lb-preference user", async () => {
    const user = await createUser({ unitPreference: Unit.LB });
    await signedInAs(user.id);
    await captureRedirect(() => logBodyweight(formData({ weight: "200" })));

    const entry = await prisma.bodyweightEntry.findFirst({ where: { userId: user.id } });
    expect(Number(entry?.weightKg)).toBeCloseTo(90.72, 1);
  });

  it("uses an explicit loggedAt date when provided", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    await captureRedirect(() => logBodyweight(formData({ weight: "80", loggedAt: "2026-01-15" })));

    const entry = await prisma.bodyweightEntry.findFirst({ where: { userId: user.id } });
    expect(entry!.loggedAt.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("falls back to now when loggedAt is an invalid date string", async () => {
    const user = await createUser();
    await signedInAs(user.id);
    const before = new Date();
    await captureRedirect(() => logBodyweight(formData({ weight: "80", loggedAt: "not-a-date" })));

    const entry = await prisma.bodyweightEntry.findFirst({ where: { userId: user.id } });
    expect(entry!.loggedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

describe("updateBodyweightEntry", () => {
  it("redirects with an error when entryId is missing", async () => {
    const url = await captureRedirect(() => updateBodyweightEntry(formData({ weight: "80" })));
    expect(url).toContain("Could%20not%20identify%20which%20entry");
  });

  it("redirects with an error when weight is missing", async () => {
    const url = await captureRedirect(() => updateBodyweightEntry(formData({ entryId: "e1" })));
    expect(url).toContain("Weight%20is%20required.");
  });

  it("rejects a non-positive weight", async () => {
    const url = await captureRedirect(() =>
      updateBodyweightEntry(formData({ entryId: "e1", weight: "-5" })),
    );
    expect(url).toContain("Enter%20a%20valid%20weight");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      updateBodyweightEntry(formData({ entryId: "e1", weight: "80" })),
    );
    expect(url).toBe("/sign-in");
  });

  it("redirects with an error when the entry isn't the user's own", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const entry = await prisma.bodyweightEntry.create({
      data: { userId: otherUser.id, weightKg: 80 },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      updateBodyweightEntry(formData({ entryId: entry.id, weight: "90" })),
    );
    expect(url).toContain("That%20entry%20could%20not%20be%20found.");

    const unchanged = await prisma.bodyweightEntry.findUnique({ where: { id: entry.id } });
    expect(Number(unchanged?.weightKg)).toBe(80);
  });

  it("updates weight (with lb->kg conversion) and an explicit date", async () => {
    const user = await createUser({ unitPreference: Unit.LB });
    const entry = await prisma.bodyweightEntry.create({
      data: { userId: user.id, weightKg: 80, loggedAt: new Date("2026-01-01") },
    });
    await signedInAs(user.id);
    const url = await captureRedirect(() =>
      updateBodyweightEntry(formData({ entryId: entry.id, weight: "200", loggedAt: "2026-02-01" })),
    );
    expect(url).toBe("/bodyweight");

    const updated = await prisma.bodyweightEntry.findUnique({ where: { id: entry.id } });
    expect(Number(updated?.weightKg)).toBeCloseTo(90.72, 1);
    expect(updated!.loggedAt.toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it("keeps the existing date when loggedAt is omitted", async () => {
    const user = await createUser();
    const entry = await prisma.bodyweightEntry.create({
      data: { userId: user.id, weightKg: 80, loggedAt: new Date("2026-01-01") },
    });
    await signedInAs(user.id);
    await captureRedirect(() => updateBodyweightEntry(formData({ entryId: entry.id, weight: "81" })));

    const updated = await prisma.bodyweightEntry.findUnique({ where: { id: entry.id } });
    expect(updated!.loggedAt.toISOString().slice(0, 10)).toBe("2026-01-01");
  });
});

describe("deleteBodyweightEntry", () => {
  it("redirects with an error when entryId is missing", async () => {
    const url = await captureRedirect(() => deleteBodyweightEntry(formData({})));
    expect(url).toContain("Could%20not%20identify%20which%20entry");
  });

  it("redirects to sign-in when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() => deleteBodyweightEntry(formData({ entryId: "e1" })));
    expect(url).toBe("/sign-in");
  });

  it("only deletes an entry the signed-in user owns", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const entry = await prisma.bodyweightEntry.create({ data: { userId: otherUser.id, weightKg: 80 } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteBodyweightEntry(formData({ entryId: entry.id })));
    expect(url).toBe("/bodyweight");

    const stillThere = await prisma.bodyweightEntry.findUnique({ where: { id: entry.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the entry and redirects", async () => {
    const user = await createUser();
    const entry = await prisma.bodyweightEntry.create({ data: { userId: user.id, weightKg: 80 } });
    await signedInAs(user.id);
    const url = await captureRedirect(() => deleteBodyweightEntry(formData({ entryId: entry.id })));
    expect(url).toBe("/bodyweight");

    const gone = await prisma.bodyweightEntry.findUnique({ where: { id: entry.id } });
    expect(gone).toBeNull();
  });
});
