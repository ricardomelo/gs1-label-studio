import { describe, expect, it } from "vitest";
import { GENERIC_PROFILES, joinPrintFiles, moduleChoice, printFileBytes, printWidthProblem, profileProblem, zplLabel, zplTestAreaDots, zplTestLabel } from "../src/index.ts";
import { fittingFont } from "../src/printers.ts";

// Printer profiles (backlog 3.1): whole dots a module within the table's range, the print width, a test label.

describe("a module in whole dots", () => {
  it("offers the dots within the range and takes the nearest to the label's X-dimension", () => {
    // Table 1's EAN/UPC range, 0.264 to 0.660 mm; at 203 dpi a dot is 0.125 mm
    const c = moduleChoice(0.33, [0.264, 0.66], 203);
    expect(c.choices.map((d) => d.dots)).toEqual([3, 4, 5]);
    expect(c.chosen.dots).toBe(3);
    expect(c.chosen.xMm).toBeCloseTo((3 * 25.4) / 203, 12); // 0.375 mm
    expect(c.inRange).toBe(true);
    expect(moduleChoice(0.33, [0.264, 0.66], 203, 5).chosen.dots).toBe(5);
    expect(moduleChoice(0.33, [0.264, 0.66], 203, 9).chosen.dots).toBe(3); // not within: the nearest within
  });

  it("says when no whole number of dots lies within the range, and prints the nearest", () => {
    const c = moduleChoice(0.17, [0.17, 0.2], 152); // a dot is 0.167 mm: none within
    expect(c.choices).toEqual([]);
    expect(c.chosen.dots).toBe(1);
    expect(c.inRange).toBe(false);
    expect(moduleChoice(0.5, null, 203).inRange).toBe(true);
  });
});

describe("profiles", () => {
  it("checks a profile and the label's width against the printer's", () => {
    const zt = GENERIC_PROFILES.find((p) => p.dpi === 203)!;
    expect(zt.widthMm).toBe(104);
    expect(printWidthProblem(819, zt)).toBeNull(); // 819 dots at 203 dpi: 102.5 mm
    expect(printWidthProblem(1000, zt)).toMatch(/125\.1 mm wide; Any ZPL printer, 203 dpi, 104 mm prints 104 mm/);
    expect(profileProblem({ name: "", dpi: 203, widthMm: 104 })).toMatch(/name/);
    expect(profileProblem({ name: "x", dpi: 50, widthMm: 104 })).toMatch(/100 to 1200/);
    expect(profileProblem({ name: "x", dpi: 203, widthMm: 5 })).toMatch(/10 to 500/);
  });
});

describe("a test label", () => {
  it("adds a 50 mm ruler with ticks every 10 mm and the settings below the label", () => {
    const o = { x: 40, y: 40, dotsPerModule: 3, barHeightDots: 120, dpi: 203, widthDots: 800, heightDots: 400 };
    const zpl = zplTestLabel("gs1-128", "(01)09506000134352", o, ["Printer: x", "Module: 3 dots"]);
    expect(zpl).toContain(`^LL${400 + zplTestAreaDots(203, 2)}`);
    expect(zpl).toContain(`^GB${Math.round((50 / 25.4) * 203)},2,2^FS`); // the 50 mm line: 400 dots
    expect(zpl.match(/\^GB2,\d+,2\^FS/g)).toHaveLength(6);
    expect(zpl).toContain("^FD50 mm: measure this line^FS");
    expect(zpl).toContain("^FDModule: 3 dots^FS");
    expect(zpl).toContain(zplLabel("gs1-128", "(01)09506000134352", o).split("\n").find((l) => l.includes("^BCN"))!);
  });
});

// A print file is text, or bytes when EPL2 sends an image (GW): in bulk every label's file goes into one, a line feed
// between them, bytes when any one is, its text as UTF-8 and its bytes untouched
describe("print files of text and bytes", () => {
  it("joins text as text and text with bytes as bytes, the bytes as they were", () => {
    expect(joinPrintFiles(["A", "B"])).toBe("A\nB");
    const bytes = Uint8Array.from([0x47, 0x57, 0x00, 0xff, 0x0a, 0x80]);
    expect(joinPrintFiles(["é", bytes, "C"])).toEqual(Uint8Array.from([0xc3, 0xa9, 0x0a, ...bytes, 0x0a, 0x43]));
    expect(printFileBytes("é")).toEqual(Uint8Array.from([0xc3, 0xa9]));
    expect(printFileBytes(bytes)).toBe(bytes);
  });
});

describe("a fixed-pitch font for a line of text", () => {
  // TSPL's dot fonts 1 to 5 (cells of 8 × 12 to 32 × 48 dots), their capitals 0.75 of the cell
  const FONTS = [
    { name: "1", width: 8, height: 12 }, { name: "2", width: 12, height: 20 }, { name: "3", width: 16, height: 24 },
    { name: "4", width: 24, height: 32 }, { name: "5", width: 32, height: 48 },
  ];
  const pitch = (f: { width: number }, m: number) => f.width * m;
  it("takes the cell nearest the capitals asked, else the tallest within a tenth of it that keeps the line within its width", () => {
    // Capitals of 67 dots ask an 89-dot cell: font 1 at 8 (96 dots) when the line has room for its pitch of 64
    expect(fittingFont(FONTS, "ABCDE", 67, 320, 0.75, pitch, 10)).toEqual({ font: FONTS[0], multiplier: 8 });
    // 300 dots wide: font 1 at 7 (84 dots, pitch 56), not font 2 at 5 (60 a character but 100 dots high, past the tenth)
    expect(fittingFont(FONTS, "ABCDE", 67, 300, 0.75, pitch, 10)).toEqual({ font: FONTS[0], multiplier: 7 });
    // No room for any: the smallest
    expect(fittingFont(FONTS, "ABCDE", 67, 20, 0.75, pitch, 10)).toEqual({ font: FONTS[0], multiplier: 1 });
  });
});
