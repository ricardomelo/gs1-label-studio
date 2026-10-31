import { defineConfig, devices } from "@playwright/test";

// The user guide's screenshots (docs/user-guide.md, ADR 0005): `pnpm --filter @gs1-label-studio/web screenshots` after
// `pnpm build` writes docs/images/guide/*.png from the built application. Not part of the browser tests.
export default defineConfig({
  testDir: "screenshots",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", colorScheme: "light" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 } } }],
  webServer: { command: "pnpm exec vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true },
});
