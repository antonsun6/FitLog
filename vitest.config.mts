import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

// Loaded here (config evaluation time) rather than via setupFiles, so
// DATABASE_URL/DIRECT_URL are already set in process.env before Vitest
// imports any test file — lib/db.ts reads DATABASE_URL at module-load time.
loadEnv({ path: path.resolve(rootDir, ".env.test") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // DB-touching test files share one real Postgres database and reset it
    // via TRUNCATE between tests — running files in parallel would let one
    // file's reset race another file's in-progress fixtures.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DIRECT_URL: process.env.DIRECT_URL ?? "",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/**/actions.ts"],
      exclude: [
        "lib/supabase/**", // thin Supabase SDK wiring; always mocked in tests
        "lib/db.ts", // PrismaClient wiring, exercised implicitly by every DB test
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
