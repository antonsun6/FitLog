import { Client, type QueryResult, type QueryResultRow } from "pg";

/**
 * Runs `fn` against the local test DB as the low-privilege `app_authenticated`
 * role (not the table-owning role Prisma/lib/db.ts normally connects as,
 * which has BYPASSRLS and would make every RLS check a no-op) with
 * `request.jwt.claims` set to simulate a specific signed-in user — the same
 * mechanism Supabase's real PostgREST layer uses to implement `auth.uid()`.
 * See the one-time local setup in CLAUDE.md "Testing" for how the role and
 * the `auth.uid()` stub function were created.
 *
 * Every call runs inside a transaction that's always rolled back, so an
 * "allowed" write under test never actually persists and pollutes later
 * assertions or other test files.
 */
export async function asUser<T>(
  userId: string,
  fn: (query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId }),
    ]);
    return await fn(client.query.bind(client));
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

/** Same as `asUser`, but with no JWT claim set — simulates an anonymous
 * (`anon`) request, i.e. auth.uid() returns null. */
export async function asAnonymous<T>(
  fn: (query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_authenticated");
    return await fn(client.query.bind(client));
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}
