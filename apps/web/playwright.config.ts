import { defineConfig, devices } from "@playwright/test";

// Browser tests of the editor against the built application (`vite preview`).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "pnpm exec vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
});
