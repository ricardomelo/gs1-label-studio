import { dotsWithin, MM_PER_INCH, snapToDots, type DotSnap } from "./dots.ts";
import { PRINTER_LANGUAGES, type PrinterLanguage } from "./printFile.ts";

// Printer profiles (backlog 3.1): what the print files are made for — the printer's language and resolution, how wide
// it prints — and, for each label, how many whole dots a module takes, within the range of the symbol's specification
// table.

export interface PrinterProfile {
  id: string;
  name: string;
  /** The print head's resolution. */
  dpi: number;
  /** How wide the printer prints, mm: a label wider than this is refused. */
  widthMm: number;
  /** The printer's language (ADR 0002); ZPL when not given, as profiles kept before 31 October 2026 were. */
  language?: PrinterLanguage;
}

/** A profile's language: ZPL unless it says otherwise. */
export function languageOf(profile: Pick<PrinterProfile, "language">): PrinterLanguage {
  return profile.language ?? "zpl";
}

/**
 * A profile for any printer of each language at its common resolutions, four inches wide (104 mm), as most label
 * printers are: ZPL at 152 to 600 dpi, TSPL, EPL2, DPL, PPLA and PPLB at 203 and 300 dpi (EPL2's fonts are defined for
 * those two, and Argox's printers have those two: OS-214 and X-1000+ at 203 dpi, OS-314 and X-3000+ at 300 dpi).
 */
export const GENERIC_PROFILES: readonly PrinterProfile[] = [
  ...[152, 203, 300, 406, 600].map((dpi) => ({ id: `zpl-${dpi}`, name: `Any ZPL printer, ${dpi} dpi, 104 mm`, dpi, widthMm: 104 })),
  ...(["tspl", "epl2", "dpl", "ppla", "pplb"] as const).flatMap((language) => [203, 300].map((dpi) => ({
    id: `${language}-${dpi}`, name: `Any ${PRINTER_LANGUAGES[language].name} printer, ${dpi} dpi, 104 mm`, dpi, widthMm: 104, language,
  }))),
];

/** What is wrong with a profile the person described, or null. */
export function profileProblem(profile: Pick<PrinterProfile, "name" | "dpi" | "widthMm" | "language">): string | null {
  if (!profile.name.trim()) return "A profile needs a name.";
  if (profile.language !== undefined && !(profile.language in PRINTER_LANGUAGES)) return "The printer's language is ZPL, TSPL, EPL2, DPL, PPLA or PPLB.";
  if (!Number.isFinite(profile.dpi) || profile.dpi < 100 || profile.dpi > 1200) return "The resolution is from 100 to 1200 dpi.";
  if (!Number.isFinite(profile.widthMm) || profile.widthMm < 10 || profile.widthMm > 500) return "The print width is from 10 to 500 mm.";
  return null;
}

export interface ModuleChoice {
  /** The whole dots a module can take within the range, smallest first; empty when none can. */
  choices: DotSnap[];
  /** The one used: the person's, else the nearest to the label's X-dimension within the range, else the nearest. */
  chosen: DotSnap;
  /** Whether the one used lies within the range. */
  inRange: boolean;
}

/**
 * The dots a module takes at `dpi` for a label of X-dimension `xMm` whose table allows [min, max] mm (section 5.12.3):
 * whole dots only, as a printer prints them (dots.ts).
 */
export function moduleChoice(xMm: number, range: readonly [number, number] | null, dpi: number, wanted?: number | null): ModuleChoice {
  const choices = range ? dotsWithin(range[0], range[1], dpi) : [];
  const nearest = snapToDots(xMm, dpi);
  const pick = wanted ? choices.find((c) => c.dots === wanted) : undefined;
  const chosen = pick ?? (choices.length
    ? choices.reduce((best, c) => (Math.abs(c.xMm - xMm) < Math.abs(best.xMm - xMm) ? c : best))
    : nearest);
  const inRange = !range || (chosen.xMm >= range[0] - 1e-9 && chosen.xMm <= range[1] + 1e-9);
  return { choices, chosen, inRange };
}

/** The reason a label of `widthDots` cannot print on the profile's printer, or null. */
export function printWidthProblem(widthDots: number, profile: PrinterProfile): string | null {
  const widthMm = (widthDots / profile.dpi) * MM_PER_INCH;
  return widthMm > profile.widthMm + 1e-9
    ? `The label is ${widthMm.toFixed(1)} mm wide; ${profile.name} prints ${profile.widthMm} mm. Choose a smaller size or another printer.`
    : null;
}
