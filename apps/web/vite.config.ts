import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
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

// The release (the root package.json's version, which scripts/release.mjs writes) and the channel (backlog 0.4,
// ADR 0010): CHANNEL=develop for the work in progress published under /develop/, else the stable site.
const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
const channel = process.env.CHANNEL ?? "stable";
if (channel !== "stable" && channel !== "develop") throw new Error(`CHANNEL is stable or develop, not ${channel}`);

// Develop's page and installed app are named apart from the stable one's, with another colour, so that the two are
// never taken for each other on a phone's home screen or in a browser's tabs.
const DEVELOP_NAME = "GS1 Label Studio (develop)";
const DEVELOP_COLOUR = "#8a3b00";
function developNames(): Plugin {
  return {
    name: "gs1-label-studio-develop-names",
    apply: "build",
    transformIndexHtml(html) {
      return html
        .replace("<title>GS1 Label Studio</title>", `<title>${DEVELOP_NAME}</title>`)
        .replace('name="apple-mobile-web-app-title" content="GS1 Label Studio"', `name="apple-mobile-web-app-title" content="GS1LS develop"`)
        .replace('name="theme-color" content="#002c6c"', `name="theme-color" content="${DEVELOP_COLOUR}"`);
    },
    generateBundle() {
      const manifest = JSON.parse(readFileSync(new URL("public/manifest.webmanifest", import.meta.url), "utf8")) as Record<string, unknown>;
      // Emitted over the public folder's copy (a bundle's file of the same name wins)
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: `${JSON.stringify({ ...manifest, name: DEVELOP_NAME, short_name: "GS1LS develop", theme_color: DEVELOP_COLOUR }, null, 2)}\n`,
      });
    },
  };
}

// BASE_PATH is set by the GitHub Pages workflow (/<repository>/, or /<repository>/develop/); "/" elsewhere.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), offline({ stable: channel === "stable" }), ...(channel === "develop" ? [developNames()] : [])],
  define: { __BUILD__: JSON.stringify({ ...build(), version, channel }) },
  // The bulk generation's worker (backlog 2.5) is a module, as the page is.
  worker: { format: "es" },
});
