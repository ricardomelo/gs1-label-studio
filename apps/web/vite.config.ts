import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { offline } from "./offline.ts";

// The commit the build is made from and its date, for the About section ("" outside a Git checkout).
function build(): { commit: string; date: string } {
  try {
    const [commit = "", date = ""] = execFileSync("git", ["log", "-1", "--format=%h %cI"], { encoding: "utf8" }).trim().split(" ");
    return { commit, date };
  } catch {
    return { commit: "", date: "" };
  }
}

// BASE_PATH is set by the GitHub Pages workflow (/<repository>/); "/" elsewhere.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), offline()],
  define: { __BUILD__: JSON.stringify(build()) },
  // The bulk generation's worker (backlog 2.5) is a module, as the page is.
  worker: { format: "es" },
});
