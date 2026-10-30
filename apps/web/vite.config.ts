import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { offline } from "./offline.ts";

// BASE_PATH is set by the GitHub Pages workflow (/<repository>/); "/" elsewhere.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), offline()],
  // The bulk generation's worker (backlog 2.5) is a module, as the page is.
  worker: { format: "es" },
});
