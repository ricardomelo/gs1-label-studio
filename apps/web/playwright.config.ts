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
    // A tablet held horizontally (backlog 1.21): a touch screen, so the navigation rail and the label beside
    { name: "tablet", use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "pnpm exec vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
});
