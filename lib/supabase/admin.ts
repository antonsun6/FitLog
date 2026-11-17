import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using the service-role key — bypasses RLS and can perform
 * privileged operations the `anon`/`authenticated` roles can't, like
 * deleting an `auth.users` row (see app/(app)/settings/actions.ts).
 * Server-only: never import this from client code or expose the key to the
 * browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
