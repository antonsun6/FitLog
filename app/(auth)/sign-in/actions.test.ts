import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createFakeSupabase } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { signIn } from "./actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("signIn", () => {
  it("redirects to sign-in with an error when email is missing", async () => {
    const url = await captureRedirect(() => signIn(formData({ password: "x" })));
    expect(url).toBe("/sign-in?error=Email%20and%20password%20are%20required.");
  });

  it("redirects to sign-in with an error when password is missing", async () => {
    const url = await captureRedirect(() => signIn(formData({ email: "a@b.com" })));
    expect(url).toContain("/sign-in?error=");
  });

  it("redirects back with the Supabase error message on failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "Invalid credentials" } }),
      }) as never,
    );

    const url = await captureRedirect(() =>
      signIn(formData({ email: "a@b.com", password: "wrong" })),
    );
    expect(url).toBe("/sign-in?error=Invalid%20credentials");
  });

  it("redirects to the dashboard on success", async () => {
    const signInFn = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase({ signInWithPassword: signInFn }) as never);

    const url = await captureRedirect(() =>
      signIn(formData({ email: "a@b.com", password: "right" })),
    );
    expect(signInFn).toHaveBeenCalledWith({ email: "a@b.com", password: "right" });
    expect(url).toBe("/dashboard");
  });
});
