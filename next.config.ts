import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // Phone bill photos and PDFs are sent with the claim form. Vercel caps a request at 4.5 MB;
      // the app keeps an upload under 4 MB (src/lib/files.ts) to leave room for the form data.
      bodySizeLimit: "4.5mb",
    },
  },
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
