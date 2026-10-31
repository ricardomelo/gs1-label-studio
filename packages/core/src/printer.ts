import { dotsWithin, MM_PER_INCH, snapToDots, type DotSnap } from "./dots.ts";

// Printer profiles (backlog 3.1): what the ZPL files are made for — the printer's resolution, how wide it prints — and,
// for each label, how many whole dots a module takes, within the range of the symbol's specification table.

export interface PrinterProfile {
  id: string;
  name: string;
  /** The print head's resolution. */
  dpi: number;
  /** How wide the printer prints, mm: a label wider than this is refused. */
  widthMm: number;
}

/** A profile for any ZPL printer at the common resolutions, four inches wide (104 mm), as most label printers are. */
export const GENERIC_PROFILES: readonly PrinterProfile[] = [152, 203, 300, 406, 600].map((dpi) => ({
  id: `zpl-${dpi}`, name: `Any ZPL printer, ${dpi} dpi, 104 mm`, dpi, widthMm: 104,
}));

/** What is wrong with a profile the person described, or null. */
export function profileProblem(profile: Pick<PrinterProfile, "name" | "dpi" | "widthMm">): string | null {
  if (!profile.name.trim()) return "A profile needs a name.";
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
