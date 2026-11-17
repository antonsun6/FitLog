import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createFakeSupabase, fakeAuthedUser } from "../../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../../tests/helpers/redirect";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { updatePassword } from "./actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("updatePassword", () => {
  it("redirects with an error when a password field is missing", async () => {
    const url = await captureRedirect(() => updatePassword(formData({ password: "x" })));
    expect(url).toContain("/reset-password/confirm?error=");
  });

  it("redirects with an error when passwords don't match", async () => {
    const url = await captureRedirect(() =>
      updatePassword(formData({ password: "a", confirmPassword: "b" })),
    );
    expect(url).toBe("/reset-password/confirm?error=Passwords%20do%20not%20match.");
  });

  it("redirects to request a new link when there's no active session", async () => {
    vi.mocked(createClient).mockResolvedValue(createFakeSupabase() as never);
    const url = await captureRedirect(() =>
      updatePassword(formData({ password: "newpass1", confirmPassword: "newpass1" })),
    );
    expect(url).toContain("/reset-password?error=");
    expect(url).toContain("expired");
  });

  it("redirects back with the Supabase error message if updateUser fails", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        getUser: fakeAuthedUser("user-1"),
        updateUser: vi.fn().mockResolvedValue({ error: { message: "Password too weak" } }),
      }) as never,
    );
    const url = await captureRedirect(() =>
      updatePassword(formData({ password: "newpass1", confirmPassword: "newpass1" })),
    );
    expect(url).toBe("/reset-password/confirm?error=Password%20too%20weak");
  });

  it("redirects to the dashboard on success", async () => {
    const updateUserFn = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ getUser: fakeAuthedUser("user-1"), updateUser: updateUserFn }) as never,
    );
    const url = await captureRedirect(() =>
      updatePassword(formData({ password: "newpass1", confirmPassword: "newpass1" })),
    );
    expect(updateUserFn).toHaveBeenCalledWith({ password: "newpass1" });
    expect(url).toBe("/dashboard");
  });
});
