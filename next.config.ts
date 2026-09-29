import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The demo database is migrated at runtime, so ship the SQL migrations and PGlite's
  // WASM/data files with every server function.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*", "./src/db/demo-bootstrap.sql", "./node_modules/@electric-sql/pglite/dist/**/*"],
  },
  async headers() {
    // Internal staff tool: keep every page out of search engines.
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
