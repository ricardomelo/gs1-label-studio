import { scaleFromWidth, type Finding, type Reading } from "@gs1-label-studio/core";
import { en, locale, t } from "./i18n.ts";

// The Check Studio's size estimates from a picture (backlog 7.1 m): the user measures one symbol's printed width with
// a ruler, the picture's scale follows, and every symbol of the picture is estimated with it (the core's estimate.ts).
// Nothing here is a quality grade: each estimate says so, and says that a verifier gives the grade.

/** A number of millimetres as typed, with a point or a comma; null when it is not a number above 0. */
export function parseMm(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(trimmed)) return null;
  const mm = Number(trimmed);
  return mm > 0 ? mm : null;
}

/**
 * The picture's readings with the scale that one symbol's printed width gives (`mm`), or with none (null); a reading
 * without a measure is kept as it is. Returns the same array when nothing can change.
 */
export function scaledReadings(readings: readonly Reading[], index: number, mm: number | null): Reading[] {
  const measured = readings[index]?.measure;
  if (mm !== null && !measured) return [...readings];
  const scale = mm === null ? null : scaleFromWidth(measured!, mm);
  return readings.map((r) => (r.measure ? { ...r, measure: { ...r.measure, scale } } : r));
}

/** A number in the page's language: "0,33" in Portuguese. */
export const num = (value: number | string, digits?: number): string =>
  Number(value).toLocaleString(locale(), digits === undefined ? { maximumFractionDigits: 3 } : { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The core's ESTIMATE_NOTE, as the page translates it. */
export const NOTE = en("Estimate from a photograph. For a quality grade, have the symbol verified.");

/** The sentence every estimate carries, and the grade a verifier must find, as the context's table writes it. */
export function estimateNote(table: string | number | null | undefined, quality: string | null | undefined): string {
  const note = t(NOTE);
  return table && quality ? `${note} ${t("Table {table} asks a verifier for at least {quality}.", { table: String(table), quality })}` : note;
}

const SIDES: Record<string, string> = { left: en("left"), right: en("right"), top: en("top"), bottom: en("bottom") };

/** What a size finding's details say in plain words (H1 to H3, J5), with the estimate's note; none for others. */
export function estimateLines(finding: Pick<Finding, "code" | "details">): string[] {
  const d = finding.details ?? {};
  const lines: string[] = [];
  if (finding.code === "H1" && d.x) {
    lines.push(t("X-dimension estimated: {x} mm ± {tolerance}; here {min} to {max} mm.", { x: num(d.x), tolerance: num(d.tolerance!), min: num(d.min!), max: num(d.max!) }));
  } else if (finding.code === "H2" && d.sides) {
    for (const side of d.sides.split(",")) {
      lines.push(t("Margin on the {side}: {found} modules; {needed} needed.", { side: t(SIDES[side] ?? side), found: num(d[side]!), needed: num(d[`${side}Needed`]!) }));
    }
  } else if (finding.code === "H3" && d.height) {
    lines.push(t("Bar height estimated: {height} modules; at least {needed}.", { height: num(d.height), needed: num(d.needed!) }));
  } else if (finding.code === "J5" && d.distance) {
    lines.push(t("Distance estimated: {distance} mm; at most {radius} mm.", { distance: num(d.distance), radius: d.radius! }));
  } else return lines;
  lines.push(estimateNote(d.table, d.quality));
  return lines;
}
