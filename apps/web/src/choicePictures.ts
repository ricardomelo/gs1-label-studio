import {
  BARS,
  isDigitalLinkKey,
  labelFor,
  labelSvg,
  SYMBOLOGIES,
  type Guidance,
  type HriFont,
  type Identified,
  type LabelDesign,
  type SymbologyId,
} from "@gs1-label-studio/core";
import { pickList, type Choice } from "./ScanCard.tsx";

// A small picture of each choice of step 2 on a phone (backlog 6.3 c, the usability study's recommendation): the
// symbol as the label would draw it, from the data of step 1, so that an EAN-13 with a QR code beside it is seen, not
// only read. The text under the symbols is left out (too small to read); the label (step 3) keeps it.

/** The design that draws a choice as the editor would, at 100 % and without text. */
export function pictureDesign(guide: Guidance, choice: Choice, key: string): LabelDesign {
  const chosen = choice.with ?? choice.symbol;
  // A key that a GS1 Digital Link URI cannot carry is drawn in GS1 DataMatrix (App.tsx does the same)
  const symbology: SymbologyId = !isDigitalLinkKey(key) && SYMBOLOGIES[chosen].data === "uri" ? "gs1-datamatrix" : chosen;
  const option = guide.options.find((o) => o.symbol === symbology);
  const environment = guide.environment ?? undefined;
  // Bars are sized by the table's row; a 2D symbol by the scanning environment when there is one
  const useSpec = BARS.includes(symbology) || !environment;
  const spec = useSpec && option ? (option.specs.find((row) => row.part) ?? option.specs[0]) : undefined;
  return {
    symbology, hri: "none", version: null, error: "m", size: 100, bearer: "frame", reduction: 0, linearSize: null,
    linear: choice.with ? (choice.symbol === "upce" ? "upce" : "auto") : "none",
    ...(environment ? { environment } : {}),
    ...(spec ? { spec, table: guide.leaf.table } : {}),
    gtinOnly: !choice.with && option?.carries === "key",
  };
}

/** Each selectable choice's picture as an SVG data URI, by the list's key; a choice that cannot be drawn has none. */
export function choicePictures(guide: Guidance, identified: Identified, font: HriFont, key: string): Record<string, string> {
  const pictures: Record<string, string> = {};
  for (const item of pickList(guide)) {
    if (!item.choice) continue;
    try {
      const { options, layout } = labelFor(identified, pictureDesign(guide, item.choice, key), font);
      pictures[item.key] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(labelSvg(options, layout, font))}`;
    } catch {
      // The label says why when this choice is drawn; the list simply shows no picture
    }
  }
  return pictures;
}
