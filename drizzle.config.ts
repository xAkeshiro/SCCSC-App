import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Only the app's own schema is generated. `auth` belongs to Supabase (or the demo bootstrap),
  // and RLS, functions and triggers live in hand-written migrations (see docs/ARCHITECTURE.md).
  schemaFilter: ["public"],
});
