import { en } from "./i18n.ts";
import type { Pane } from "./layout.ts";

// A tour of the studio (backlog 6.4, mock-up A of two, 14 November 2026): the steps and the main buttons pointed out
// one at a time, the rest of the page dimmed and a card beside what is shown. On a computer it starts from a button in
// the header; on a phone or a tablet from an entry of More, where it points at the destinations' bar. Its texts follow
// the README's tour and the user guide's sections. Each stop names the element it points at by its `data-tour`, and on
// a phone or a tablet the destination to open first.

export interface TourStop {
  /** The `data-tour` of the element pointed at. */
  target: string;
  /** On a phone or a tablet, the destination opened before pointing. */
  pane?: Pane;
  title: string;
  text: string;
}

const DATA_TEXT = en(
  "Choose the key — GTIN, SSCC, GLN and every other — and add its batch, serial number, expiry date, weight…, each checked as you type. Or paste what you have, an element string, a GS1 Digital Link URI or a scanner's output, and press Fill in.",
);
const SCAN_TEXT = en(
  "A few yes-or-no questions lead to the GS1 symbol specification table and the symbol it recommends for this data. Optional: with no answers, the label is a QR code with a GS1 Digital Link URI.",
);
const MODE = { target: "mode", title: en("One code or in bulk"), text: en("In bulk takes a spreadsheet or pasted rows, checks every row and makes a file for each, or one file for a label printer.") };
const ASSISTANT = {
  target: "assistant",
  title: en("New to GS1?"),
  text: en("The assistant asks in plain words what you want to identify and what for, then fills the three steps and says the rules for the artwork."),
};

/** On a computer: the steps, the label and its parts, then the header's buttons, ending on the tour's own button. */
export const COMPUTER_TOUR: readonly TourStop[] = [
  { target: "data", title: en("1. What the code identifies"), text: DATA_TEXT },
  { target: "scan", title: en("2. Where is it scanned?"), text: SCAN_TEXT },
  {
    target: "label",
    title: en("3. The label"),
    text: en("Redrawn as you type, with what it is written under it. Real size draws it between rulers in millimetres; Scan test reads it back, here in the browser."),
  },
  {
    target: "options",
    title: en("The label's options"),
    text: en("The barcode only or a label: the GS1 Logistic Label for an SSCC, or one of your own. Then the symbol, its size and its text in framed groups, each with a ? that says what it does."),
  },
  {
    target: "export",
    title: en("Export"),
    text: en("SVG, PNG, PDF and EPS for artwork, or everything in a zip; the arrows beside SVG and PNG choose their text and resolution. Label printer… opens the printer's languages and a test print."),
  },
  MODE,
  ASSISTANT,
  {
    target: "work",
    title: en("Your work"),
    text: en("Kept in this browser for your next visit. Save writes it to a file and Open… brings it back."),
  },
  { target: "tour", title: en("The tour, whenever you want"), text: en("This button shows the tour again. Esc or Skip the tour closes it at any step.") },
];

/** On a phone or a tablet: the destinations' bar, one destination at a time, then the header's buttons and More. */
export const TABBED_TOUR: readonly TourStop[] = [
  { target: "tab-data", pane: "data", title: en("Data: what the code identifies"), text: DATA_TEXT },
  { target: "tab-scan", pane: "scan", title: en("Use: where is it scanned?"), text: SCAN_TEXT },
  {
    target: "tab-label",
    pane: "label",
    title: en("Label"),
    text: en("The label, redrawn as you type, and its options in framed groups, each with a ? that says what it does. Real size and Scan test are here too."),
  },
  { target: "tab-export", pane: "export", title: en("Export"), text: en("SVG, PNG, PDF and EPS for artwork, or everything in a zip, and the label printer's files.") },
  { ...MODE, pane: "data" },
  { ...ASSISTANT, pane: "data" },
  { target: "start-over", pane: "data", title: en("Start over"), text: en("Clears the data and every choice, as on a first visit") },
  {
    target: "tab-more",
    pane: "more",
    title: en("More"),
    text: en("Installing the app, the EPC for RFID tags, signing and About — and this tour again, whenever you want."),
  },
];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The part of a box inside the window, so that the ring around a target taller than the screen stays on it. */
export function within(box: Box, view: { width: number; height: number }): Box {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(view.width, box.left + box.width);
  const bottom = Math.min(view.height, box.top + box.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Where the card goes: beside the target, at its right if there is room, else at its left, under it or over it, and
 * otherwise at the bottom of the window, over the target. Always whole within the window, `margin` from its edges.
 */
export function placeCard(target: Box, card: { width: number; height: number }, view: { width: number; height: number }, gap = 14, margin = 12): { left: number; top: number } {
  const seen = within(target, view);
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));
  const sideTop = clamp(seen.top, margin, view.height - card.height - margin);
  const underLeft = clamp(seen.left, margin, view.width - card.width - margin);
  if (seen.left + seen.width + gap + card.width <= view.width - margin) return { left: seen.left + seen.width + gap, top: sideTop };
  if (seen.left - gap - card.width >= margin) return { left: seen.left - gap - card.width, top: sideTop };
  if (seen.top + seen.height + gap + card.height <= view.height - margin) return { left: underLeft, top: seen.top + seen.height + gap };
  if (seen.top - gap - card.height >= margin) return { left: underLeft, top: seen.top - gap - card.height };
  return { left: clamp((view.width - card.width) / 2, margin, view.width - card.width - margin), top: clamp(view.height - card.height - margin, margin, view.height) };
}
