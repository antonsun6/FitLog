import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createFakeSupabase } from "../../tests/helpers/supabase";
import { captureRedirect, redirectMock } from "../../tests/helpers/redirect";

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { signOut } from "./actions";

describe("signOut", () => {
  it("signs out via Supabase and redirects to sign-in", async () => {
    const signOutFn = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({ signOut: signOutFn }) as never,
    );

    const url = await captureRedirect(() => signOut());

    expect(signOutFn).toHaveBeenCalledOnce();
    expect(url).toBe("/sign-in");
  });
});
