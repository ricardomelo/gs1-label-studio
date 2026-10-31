import { defineConfig } from "vitest/config";

// The web application's unit tests (test/*.test.ts): the interface's languages. The browser tests (e2e/) are
// Playwright's.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
