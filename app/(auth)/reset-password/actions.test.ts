import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createFakeSupabase } from "../../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../../tests/helpers/redirect";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { requestPasswordReset } from "./actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("requestPasswordReset", () => {
  it("redirects with an error when email is missing", async () => {
    const url = await captureRedirect(() => requestPasswordReset(formData({})));
    expect(url).toBe("/reset-password?error=Email%20is%20required.");
  });

  it("surfaces the send-rate-limit error specifically", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        resetPasswordForEmail: vi
          .fn()
          .mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "rate limited" } }),
      }) as never,
    );
    const url = await captureRedirect(() => requestPasswordReset(formData({ email: "a@b.com" })));
    expect(url).toContain("/reset-password?error=Too%20many%20reset%20emails");
  });

  it("swallows other errors (anti-enumeration) and redirects as if sent", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { code: "other_error", message: "boom" } }),
      }) as never,
    );
    const url = await captureRedirect(() => requestPasswordReset(formData({ email: "a@b.com" })));
    expect(url).toBe("/reset-password?sent=1");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("redirects as sent on success, without logging anything", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      }) as never,
    );
    const url = await captureRedirect(() => requestPasswordReset(formData({ email: "a@b.com" })));
    expect(url).toBe("/reset-password?sent=1");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
