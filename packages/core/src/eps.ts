import type { HriFont } from "./hri.ts";
import type { LabelOptions, Layout } from "./layout.ts";
import { pdfContent } from "./pdf.ts";

// The label as EPS for prepress (backlog 1.5): the PDF's content stream itself, its operators defined in PostScript by
// a short prolog, so that the EPS draws exactly what the PDF draws: the bars and modules, the text as outlines, process
// black alone (100 % K). Rectangles are filled in groups, since some raster image processors limit a path's points.

const PROLOG = [
  "/m { moveto } bind def",
  "/l { lineto } bind def",
  "/c { curveto } bind def",
  "/h { closepath } bind def",
  "/f { fill } bind def",
  "/k { setcmykcolor } bind def",
  "/re { 4 2 roll moveto 1 index 0 rlineto 0 exch rlineto neg 0 rlineto closepath } bind def",
];
const RECTANGLES_A_FILL = 400;

/** A DSC comment's text: printable ASCII only. */
function comment(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

/** The label as an Encapsulated PostScript file (EPSF 3.0) the size of the label. */
export function labelEps(options: LabelOptions, layout: Layout, font: HriFont): string {
  const { content, width, height } = pdfContent(layout, font);
  const body: string[] = [];
  let open = 0;
  for (const line of content.split("\n")) {
    if (line.endsWith(" re")) {
      if (open === RECTANGLES_A_FILL) {
        body.push("f");
        open = 0;
      }
      open++;
    } else if (line === "f") {
      open = 0;
    }
    body.push(line);
  }
  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
    `%%HiResBoundingBox: 0 0 ${width.toFixed(3)} ${height.toFixed(3)}`,
    `%%Title: ${comment(options.data)}`,
    "%%Creator: GS1 Label Studio",
    "%%LanguageLevel: 2",
    "%%DocumentProcessColors: Black",
    "%%EndComments",
    "%%BeginProlog",
    "10 dict begin",
    ...PROLOG,
    "%%EndProlog",
    ...body,
    "end",
    "showpage",
    "%%EOF",
    "",
  ].join("\n");
}
