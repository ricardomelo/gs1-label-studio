import { defineConfig, devices } from "@playwright/test";

// The assistant opens by itself on a first visit (backlog 6.10); these runs start as a visit after it, and its own
// test starts from an empty browser.
const SEEN = { cookies: [], origins: [{ origin: "http://localhost:4173", localStorage: [{ name: "gs1-label-studio.assistant-seen", value: "1" }] }] };

// The user guide's screenshots (docs/user-guide.md, ADR 0005): `pnpm --filter @gs1-label-studio/web screenshots` after
// `pnpm build` writes docs/images/guide/*.png from the built application. Not part of the browser tests.
export default defineConfig({
  testDir: "screenshots",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", colorScheme: "light", storageState: SEEN },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 } } }],
  webServer: { command: "pnpm exec vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true },
});
