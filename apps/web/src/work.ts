import { HRI_POSITIONS, LOGISTIC_SIZES, LOGISTIC_TWO_D, QR_MODES, SYMBOLOGIES, type DesignPage, type WorkValue } from "@gs1-label-studio/core";
import type { LabelSettings } from "./LabelCard.tsx";
import { BEARER_CHOICES, ERROR_NAMES, HRI_CHOICES, LINEAR_CHOICES } from "./texts.ts";

// A work opened again (backlog 4.3): the label's settings saved, taken over the editor's own where each is one it knows
// and of the kind it keeps; anything else (a setting of a newer studio, a choice this one does not offer) keeps the
// editor's. The core has checked the file's parts (readWork); the label's settings are the editor's to check.

type Key = keyof LabelSettings;

const CHOICES: Partial<Record<Key, readonly string[]>> = {
  symbology: Object.keys(SYMBOLOGIES),
  hri: Object.keys(HRI_CHOICES),
  error: Object.keys(ERROR_NAMES),
  linear: Object.keys(LINEAR_CHOICES),
  bearer: Object.keys(BEARER_CHOICES),
  hriPosition: HRI_POSITIONS,
  qrMode: ["auto", ...QR_MODES],
  logistic: ["none", ...Object.keys(LOGISTIC_SIZES)],
  logisticTwoD: ["none", ...LOGISTIC_TWO_D],
};
/** Settings that are a number or nothing (null), and the list of numbers that may be nothing too. */
const NUMBER_OR_NULL: readonly Key[] = ["version", "linearSize", "hriHeightMm", "pngResolution"];
const NOT_SAVED: readonly Key[] = ["page", "selected"];

/** The GS1 Digital Link URI's domain when none is typed. */
export const DEFAULT_STEM = "https://id.gs1.org";

/** The label's settings on a first visit, and what a work opened starts from. */
export const START_SETTINGS: LabelSettings = {
  symbology: "dl-qrcode", environment: "", size: 100, hri: "full", version: null, error: "m", linear: "none",
  linearSize: null, hriAsText: false, dpi: 203, stem: DEFAULT_STEM, bearer: "frame", reduction: 0, pngResolution: null,
  hriPosition: "below", hriHeightMm: null, gs1128Starts: null, qrMode: "auto", qrUpperDomain: false,
  logistic: "none", logisticFrom: "", logisticTo: "", logisticTwoD: "none", designer: false, page: null, selected: null,
  expert: false,
};

/** What a work file keeps of the label's settings: all but its page (saved apart) and the element chosen on it. */
export function savedSettings(settings: LabelSettings): Record<string, WorkValue> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !NOT_SAVED.includes(key as Key))) as Record<string, WorkValue>;
}

function fits(key: Key, value: WorkValue, start: LabelSettings[Key]): boolean {
  const choices = CHOICES[key];
  if (choices) return typeof value === "string" && choices.includes(value);
  if (NUMBER_OR_NULL.includes(key)) return value === null || typeof value === "number";
  if (key === "gs1128Starts") return value === null || Array.isArray(value);
  return value !== null && !Array.isArray(value) && typeof value === typeof start;
}

/** The label's settings of a work opened: each saved one that fits over the editor's start; its page, none chosen. */
export function openedSettings(saved: Record<string, WorkValue>, page: DesignPage | null, start: LabelSettings): LabelSettings {
  const next: Record<string, unknown> = { ...start };
  for (const key of Object.keys(start) as Key[]) {
    if (!Object.hasOwn(saved, key)) continue;
    const value = saved[key]!;
    if (fits(key, value, start[key])) next[key] = value;
  }
  const settings = next as unknown as LabelSettings;
  return { ...settings, page, selected: null, designer: settings.designer && page !== null };
}
