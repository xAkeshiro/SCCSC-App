import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // No opening animation in the tests (it never plays for reduced motion); intro.spec.ts turns it on.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Phone runs the tests tagged @phone (the everyday employee flows).
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    // Fresh in-memory demo database for every run.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    env: { DEMO_MODE: "true" },
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
