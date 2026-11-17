import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createFakeSupabase } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";
import { resetDb } from "../../../tests/helpers/db";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { signUp } from "./actions";

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const validFields = {
  email: "new@example.com",
  password: "password123",
  confirmPassword: "password123",
  displayName: "New User",
};

describe("signUp", () => {
  const fieldNames = ["email", "password", "confirmPassword", "displayName"] as const;

  it.each(fieldNames)("redirects with an error when %s is missing entirely", async (missing) => {
    const fields = { ...validFields };
    delete (fields as Record<string, string>)[missing];
    const url = await captureRedirect(() => signUp(formData(fields)));
    expect(url).toBe("/sign-up?error=All%20fields%20are%20required.");
  });

  it.each(fieldNames)("redirects with an error when %s is an empty string", async (empty) => {
    const url = await captureRedirect(() =>
      signUp(formData({ ...validFields, [empty]: "" })),
    );
    expect(url).toBe("/sign-up?error=All%20fields%20are%20required.");
  });

  it("redirects with an error when passwords don't match", async () => {
    const url = await captureRedirect(() =>
      signUp(formData({ ...validFields, confirmPassword: "different" })),
    );
    expect(url).toBe("/sign-up?error=Passwords%20do%20not%20match.");
  });

  it("redirects with the Supabase error message when signUp fails", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "Weak password" } }),
      }) as never,
    );
    const url = await captureRedirect(() => signUp(formData(validFields)));
    expect(url).toBe("/sign-up?error=Weak%20password");
  });

  it("redirects with a generic message when Supabase returns no error but also no user", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      }) as never,
    );
    const url = await captureRedirect(() => signUp(formData(validFields)));
    expect(url).toBe("/sign-up?error=Sign%20up%20failed.");
  });

  it("creates a matching Prisma User row and redirects to the dashboard on success", async () => {
    const authUserId = "11111111-1111-1111-1111-111111111111";
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signUp: vi.fn().mockResolvedValue({ data: { user: { id: authUserId } }, error: null }),
      }) as never,
    );

    const url = await captureRedirect(() => signUp(formData(validFields)));
    expect(url).toBe("/dashboard");

    const user = await prisma.user.findUnique({ where: { id: authUserId } });
    expect(user?.email).toBe(validFields.email);
    expect(user?.displayName).toBe(validFields.displayName);
    expect(user?.unitPreference).toBe("KG");
  });

  it("surfaces Supabase's anti-enumeration already-registered case as an actionable message (P2002)", async () => {
    const existing = await prisma.user.create({
      data: { email: validFields.email, displayName: "Existing" },
    });
    // Mirrors Supabase's real anti-enumeration behavior: signUp() succeeds
    // (no error) even though the email is already registered — we only find
    // out via our own unique constraint on User.email.
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "22222222-2222-2222-2222-222222222222" } },
          error: null,
        }),
      }) as never,
    );

    const url = await captureRedirect(() => signUp(formData(validFields)));
    expect(url).toContain("/sign-up?error=An%20account%20with%20this%20email%20already%20exists");

    const stillOnlyOne = await prisma.user.findMany({ where: { email: validFields.email } });
    expect(stillOnlyOne).toHaveLength(1);
    expect(stillOnlyOne[0].id).toBe(existing.id);
  });

  it("surfaces an unexpected DB error generically rather than retrying sign-up", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signUp: vi.fn().mockResolvedValue({
          // id: null is not a valid uuid, but more importantly isn't a
          // P2002 — forces the generic catch branch instead of the
          // duplicate-email branch.
          data: { user: { id: null } },
          error: null,
        }),
      }) as never,
    );

    const url = await captureRedirect(() => signUp(formData(validFields)));
    expect(url).toContain(
      "/sign-up?error=Account%20created%20but%20profile%20setup%20failed",
    );
  });
});
