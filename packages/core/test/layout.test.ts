import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bwipjs from "bwip-js";
import {
  DoesNotFit,
  encodeLinear,
  labelSvg,
  layoutLabel,
  NotPossible,
  symbolFor,
  type LabelOptions,
  type LinearKind,
} from "../src/index.ts";
import { hriFont } from "./font.ts";

// The resolver's answers, from its own code at a pinned commit (scripts/resolver-reference/golden.py; ADR 0004).
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/resolver/${name}`, import.meta.url), "utf8"));
const linear = fixture("linear.json");
const layouts = fixture("layouts.json");
const font = hriFont();

describe("EAN/UPC, as the resolver encoded them", () => {
  type Encoding = { kind: LinearKind; digits: string; modules: string };
  const encodings = linear.encodings as Encoding[];

  it.each(encodings.map((e) => [e.kind, e.digits, e] as const))(
    "%s %s: modules, guard bars, quiet zones, bar height and digits",
    (kind, digits, expected) => {
      const e = encodeLinear(kind, digits);
      expect({
        kind: e.kind, digits, modules: e.modules, extended: [...e.extended].sort((a, b) => a - b),
        quiet: [...e.quiet], barHeight: e.barHeight, digitsUnder: e.digits.map((d) => [...d]),
      }).toEqual(expected);
    },
  );

  it.each(encodings.map((e) => [e.kind, e.digits, e.modules] as const))(
    "%s %s: the same bars as bwip-js",
    (kind, digits, modules) => {
      const [raw] = bwipjs.raw({ bcid: kind, text: digits });
      const widths = (raw as { sbs: number[] }).sbs;
      const fromBwip = widths.map((w, i) => (i % 2 === 0 ? "1" : "0").repeat(w)).join("");
      expect(fromBwip).toBe(modules);
    },
  );

  it("chooses the symbol a GTIN takes, or refuses", () => {
    for (const [gtin, choice, expected] of linear.symbolFor) expect(symbolFor(gtin, choice)).toEqual(expected);
    for (const [gtin, choice] of linear.notPossible) expect(() => symbolFor(gtin, choice)).toThrow(NotPossible);
    expect(() => encodeLinear("ean13", "9506000134353")).toThrow(NotPossible);
  });
});

type Resolver = {
  uri: string; hri_lines: string[]; show_hri: boolean; version?: number; error?: "l" | "m" | "q" | "h"; size?: number;
  linear?: [LinearKind, string]; symbol?: "qr" | "dm" | "gs1dm"; element_string?: string; environment?: string;
  linear_size?: number;
};

function optionsOf(r: Resolver): LabelOptions {
  const symbol = r.symbol ?? "qr";
  return {
    symbology: symbol === "qr" ? "dl-qrcode" : symbol === "dm" ? "dl-datamatrix" : "gs1-datamatrix",
    data: symbol === "gs1dm" ? r.element_string! : r.uri,
    hriLines: r.hri_lines, showHri: r.show_hri, version: r.version ?? null, error: r.error ?? "m", size: r.size ?? 100,
    linear: r.linear ?? null, environment: r.environment ?? "retail", linearSize: r.linear_size ?? null,
  };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("the label's layout, as the resolver placed it", () => {
  type Expected = {
    options: Resolver; doesNotFit?: object; width: number; height: number; xMm: number; modules: number;
    version: number | null; texts: [string, number, number, number, boolean][]; linearRects: number[][];
  };
  it.each((layouts.layouts as Expected[]).map((l, i) => [i, JSON.stringify(l.options), l] as const))(
    "case %i: %s",
    (_i, _name, e) => {
      const options = optionsOf(e.options);
      if (e.doesNotFit) {
        let error: unknown;
        try {
          layoutLabel(options, font);
        } catch (thrown) {
          error = thrown;
        }
        expect(error).toBeInstanceOf(DoesNotFit);
        // bwip-js may need a smaller version than segno did (see below): never a larger one.
        const { needed, ...rest } = (error as DoesNotFit).params;
        const { needed: neededThen, ...restThen } = e.doesNotFit as { needed: number };
        expect(rest).toEqual(restThen);
        expect(needed).toBeLessThanOrEqual(neededThen);
        return;
      }
      const layout = layoutLabel(options, font);
      // bwip-js splits a QR code's data into modes (the GTIN's digits numeric), where segno used one mode for all: at
      // some levels its version is smaller (ADR 0004, deliberate differences). The layout then moves by exactly the
      // modules saved — the text down, and across by half when the symbol is the widest thing on the label.
      const saved = e.modules - layout.modules;
      expect(saved, "never a larger symbol than the resolver's").toBeGreaterThanOrEqual(0);
      if (saved === 0) expect(layout.version).toBe(e.version);
      const widest = !options.linear && e.texts.every((t) => font.textWidth(t[0], t[3]) <= e.modules + 8);
      const shift = widest ? saved : 0;
      expect(close(layout.width, e.width - shift) && close(layout.height, e.height - saved) && close(layout.xMm, e.xMm),
        `${layout.width}×${layout.height} at ${layout.xMm} vs ${e.width}×${e.height} at ${e.xMm}`).toBe(true);
      expect(layout.texts.map((t) => [t.text, t.linear])).toEqual(e.texts.map((t) => [t[0], t[4]]));
      layout.texts.forEach((t, i) => {
        const [, x, baseline, em] = e.texts[i]!;
        expect(close(t.x, x - shift / 2) && close(t.baseline, baseline - saved) && close(t.em, em), `${t.text}`).toBe(true);
      });
      const bars = layout.rects.slice(layout.symbolRects);
      expect(bars.length).toBe(e.linearRects.length);
      bars.forEach((r, i) => expect(r.every((v, j) => close(v, e.linearRects[i]![j]!)), `bar ${i}`).toBe(true));
    },
  );

  it("draws an SVG at the label's size with the text as outlines, or as text", () => {
    const options: LabelOptions = {
      symbology: "gs1-datamatrix", data: "(01)09506000134352(10)ABC123", hriLines: ["(01)09506000134352", "(10)ABC123"],
      showHri: true, linear: ["ean13", "9506000134352"],
    };
    const layout = layoutLabel(options, font);
    const svg = labelSvg(options, layout, font);
    expect(svg).toContain(`width="${(layout.width * layout.xMm).toFixed(3)}mm"`);
    expect(svg).toMatch(/<path fill="#000" aria-label="\(10\)ABC123" d="M[\d.]+ [\d.]+/);
    expect(labelSvg(options, layout, font, true)).toContain("font-family=\"OCR-B, 'OCR B', 'OCR-B 10 BT', monospace\"");
  });
});
