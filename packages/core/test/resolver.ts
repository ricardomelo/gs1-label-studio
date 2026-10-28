import { readFileSync } from "node:fs";
import type { LabelOptions, LinearKind } from "../src/index.ts";

// The resolver's answers, from its own code at a pinned commit (scripts/resolver-reference/golden.py; ADR 0004).

export const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/resolver/${name}`, import.meta.url), "utf8"));

export type Resolver = {
  uri: string; hri_lines: string[]; show_hri: boolean; version?: number; error?: "l" | "m" | "q" | "h"; size?: number;
  linear?: [LinearKind, string]; symbol?: "qr" | "dm" | "gs1dm"; element_string?: string; environment?: string;
  linear_size?: number;
};

export function optionsOf(r: Resolver): LabelOptions {
  const symbol = r.symbol ?? "qr";
  return {
    symbology: symbol === "qr" ? "dl-qrcode" : symbol === "dm" ? "dl-datamatrix" : "gs1-datamatrix",
    data: symbol === "gs1dm" ? r.element_string! : r.uri,
    hriLines: r.hri_lines, showHri: r.show_hri, version: r.version ?? null, error: r.error ?? "m", size: r.size ?? 100,
    linear: r.linear ?? null, environment: r.environment ?? "retail", linearSize: r.linear_size ?? null,
  };
}

