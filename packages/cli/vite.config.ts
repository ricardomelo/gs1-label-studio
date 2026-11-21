import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// gs1ls in one file (ADR 0009): the core bundled from its TypeScript with bwip-js, opentype.js and qrcode; the GS1
// Barcode Syntax Engine left to Node to load, as it finds its WebAssembly beside its own module; the HRI font written
// beside the bundle.

const FONT = new URL("../core/assets/fonts/LiberationSans-Regular.ttf", import.meta.url);
const EXTERNAL = ["gs1encoder"];

// The version: the release (the root package.json's, written by scripts/release.mjs: backlog 0.4, ADR 0010) and the
// commit it was built from, as the page's About shows them
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
})();
const release = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig({
  define: { __VERSION__: JSON.stringify(commit ? `${release} (${commit})` : release) },
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    target: "node22",
    minify: false,
    rollupOptions: {
      external: (id) => id.startsWith("node:") || builtinModules.includes(id) || EXTERNAL.some((name) => id === name || id.startsWith(`${name}/`)),
      output: { entryFileNames: "gs1ls.mjs", banner: "#!/usr/bin/env node" },
    },
  },
  ssr: { noExternal: true },
  plugins: [{
    name: "hri-font",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "LiberationSans-Regular.ttf", source: readFileSync(FONT) });
    },
  }],
});
