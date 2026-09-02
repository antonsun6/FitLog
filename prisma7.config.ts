import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // tsx runs the TS seed script directly; see prisma/seed.ts.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations/introspection need a direct (non-pgbouncer-pooled) connection.
    // The app itself connects separately via DATABASE_URL — see lib/db.ts.
    url: env("DIRECT_URL"),
  },
});
