import { vi } from "vitest";

/** Minimal fake matching the slice of the Supabase client shape each server
 * action actually calls. Every method defaults to a harmless success/empty
 * response; pass overrides per test to simulate a signed-in user, an auth
 * error, etc. */
export function createFakeSupabase(
  overrides: Partial<{
    getUser: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    auth: {
      getUser: overrides.getUser ?? vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword:
        overrides.signInWithPassword ?? vi.fn().mockResolvedValue({ error: null }),
      signUp: overrides.signUp ?? vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail:
        overrides.resetPasswordForEmail ?? vi.fn().mockResolvedValue({ error: null }),
      updateUser: overrides.updateUser ?? vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

export function fakeAuthedUser(id: string) {
  return vi.fn().mockResolvedValue({ data: { user: { id } } });
}
