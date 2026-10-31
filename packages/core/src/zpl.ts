import { MM_PER_INCH } from "./dots.ts";
import { encode, widthInModules, type QrMode, type SymbolGeometry } from "./encode.ts";
import { hasPredefinedLength, parseElementString, type Element } from "./elementString.ts";
import type { Bitmap } from "./raster.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

/**
 * ZPL II with the printer's own barcode commands (ADR 0002, decided on 28 October 2026): a few hundred bytes a label,
 * readable, editable, and usable as a template whose placeholders a system fills in before printing. Images (^GF) are
 * for images — a logo — not for symbols. Reference: Zebra's ZPL II Programming Guide, P1134473-11EN Rev A; every
 * command here is printed through Labelary and read back by ZXing in the tests.
 */
export class ZplUnsupportedError extends Error {}

export interface ZplSymbolOptions {
  /** Top left corner of the symbol (not of its quiet zone), in dots. */
  x: number;
  y: number;
  /** Module width in dots: a whole number (dots.ts). */
  dotsPerModule: number;
  /** Bar height of a linear symbol, in dots. */
  barHeightDots: number;
  /** The printer's resolution, for the text height. */
  dpi: number;
  /** Human readable text: the printer's interpretation line for linear symbols, text lines below 2D symbols. */
  hri?: boolean;
  /**
   * ITF-14's bearer bars (section 5.3.2.4), drawn with ^GB: a frame around the symbol and its quiet zones of 10X, or
   * bars at the top and bottom; `thicknessDots` thick. `x` and `y` stay the symbol's corner.
   */
  bearer?: { kind: "frame" | "bars"; thicknessDots: number };
  /** A QR code's error correction level (M when not given) and one encoding mode for its data (backlog 1.14). */
  qrError?: "L" | "M" | "Q" | "H";
  qrMode?: QrMode;
  /**
   * GS1-128 over several symbols (backlog 1.13): the element strings of each, from the top; the data is then the whole
   * element string. Each symbol and its text are stacked `stackDots` apart, from `y`.
   */
  parts?: readonly string[];
}

export interface ZplLabelOptions extends ZplSymbolOptions {
  /** Label width and height in dots. */
  widthDots: number;
  heightDots: number;
  copies?: number;
}

/** A value a system replaces in a template: `{{name}}` in the ZPL. */
export interface ZplPlaceholder {
  name: string;
  description: string;
  /** The value in the label the template was made from. */
  sample: string;
  /** Characters a value must have replaced before it goes in, e.g. { ">": ">0" }. */
  escapes: Record<string, string>;
}

export interface ZplTemplate {
  zpl: string;
  placeholders: ZplPlaceholder[];
}

const HRI_TEXT_MM = 2.2;

/** One label with one symbol, ready to print. */
export function zplLabel(symbology: SymbologyId, data: string, options: ZplLabelOptions): string {
  return document(stacked(symbology, data, options, false).commands, options, []);
}

/** The height a stacked GS1-128 symbol takes with its text and the gap to the next: bars, text, a quiet zone. */
export function gs1128StackDots(options: Pick<ZplSymbolOptions, "barHeightDots" | "dotsPerModule" | "dpi">): number {
  return options.barHeightDots + 2 * options.dotsPerModule + hriTextDots(options.dpi) + 10 * options.dotsPerModule;
}

/** One symbol's fields, or GS1-128's symbols stacked from the top, each with its own element strings. */
function stacked(symbology: SymbologyId, data: string, options: ZplSymbolOptions, template: boolean) {
  if (symbology !== "gs1-128" || !options.parts || options.parts.length < 2) return fields(symbology, data, options, template);
  const step = gs1128StackDots(options);
  const all = options.parts.map((part, index) => fields(symbology, part, { ...options, y: options.y + index * step }, template));
  return { commands: all.flatMap((f) => f.commands), placeholders: all.flatMap((f) => f.placeholders) };
}

/**
 * The same label as a template: each value is a placeholder, `{{01}}`, `{{10}}`… or `{{URI}}`, described in ^FX
 * comments at the top so that whoever wires it into a system knows what each one takes. `data` is a sample: the layout
 * (and a Data Matrix's size, forced in the template) follows it, so it should be as long as the longest values.
 */
export function zplTemplate(symbology: SymbologyId, data: string, options: ZplLabelOptions): ZplTemplate {
  const { commands, placeholders } = stacked(symbology, data, options, true);
  return { zpl: document(commands, options, placeholders), placeholders };
}

/**
 * Replaces each `{{name}}` of a template with its value, escaped as the placeholder says — what a system does with the
 * ^FX notes. The text below a symbol takes the value as it is.
 */
export function fillTemplate(template: ZplTemplate, values: Record<string, string>): string {
  const escapes = Object.fromEntries(template.placeholders.map((p) => [p.name, p.escapes]));
  return template.zpl
    .split("\n")
    .map((line) => {
      const inSymbol = /\^B[A-Z0-9]/.test(line);
      return line.replace(/\{\{([^}]+)\}\}/g, (placeholder, name: string) => {
        const value = values[name];
        if (value === undefined) return placeholder;
        if (!inSymbol) return value;
        return Object.entries(escapes[name] ?? {}).reduce((v, [from, to]) => v.split(from).join(to), value);
      });
    })
    .join("\n");
}

function document(commands: string[], options: ZplLabelOptions, placeholders: ZplPlaceholder[]): string {
  return [
    "^XA",
    ...(placeholders.length ? ["^FX Template: replace each {{name}}; values must not contain a caret or a tilde.^FS"] : []),
    ...placeholders.map((p) => `^FX {{${p.name}}}: ${p.description} Example: ${p.sample}^FS`),
    "^CI28",
    `^PW${options.widthDots}`,
    `^LL${options.heightDots}`,
    ...commands,
    `^PQ${options.copies ?? 1}`,
    "^XZ",
    "",
  ].join("\n");
}

/** ^FD, or ^FH and ^FD when the data holds a character ZPL reserves (caret, tilde) or the ^FH indicator. */
function fieldData(text: string): string {
  if (!/[\\^~]/.test(text)) return `^FD${text}^FS`;
  return `^FH\\^FD${text.replace(/[\\^~]/g, (c) => `\\${c.charCodeAt(0).toString(16).toUpperCase()}`)}^FS`;
}

interface LinearGtin {
  command: string;
  digits: (data: string) => string;
  description: string;
}

const LINEAR_GTIN: Partial<Record<SymbologyId, LinearGtin>> = {
  ean13: {
    command: "^BEN,{h},{f},N",
    digits: (data) => data.slice(0, 12),
    description: "the GTIN-13's first 12 digits; the printer adds the check digit (given 13, it drops the first).",
  },
  ean8: {
    command: "^B8N,{h},{f},N",
    digits: (data) => data.slice(0, 7),
    description: "the GTIN-8's first 7 digits; the printer adds the check digit.",
  },
  upca: {
    command: "^BUN,{h},{f},N,Y",
    digits: (data) => data.slice(0, 11),
    description: "the GTIN-12's first 11 digits; the printer adds the check digit.",
  },
  upce: {
    command: "^B9N,{h},{f},N,Y",
    digits: (data) => upcaManufacturerAndProduct(data),
    description: "digits 2 to 11 of the GTIN-12 (number system 0); the printer zero-suppresses it and adds the check digit.",
  },
  itf14: {
    command: "^B2N,{h},{f},N,Y",
    digits: (data) => data.slice(0, 13),
    description: "the GTIN-14's first 13 digits; the printer adds the check digit.",
  },
};

const ITF14_RATIO = 3; // ^BY's wide-to-narrow ratio for ^B2: whole dots for any module, within GS1's 2.25 to 3
const HRI_GAP_MM = 1.02; // section 5.3.2.2: from the bearer bar to the text

// ^BR: the GS1 DataBar type, and the height in modules it prints each at, which ^BR does not let a label change (its
// height parameter is for the linear part of composite symbols). Checked through Labelary.
const DATABAR: Partial<Record<SymbologyId, { type: number; modules?: number }>> = {
  "databar-omni": { type: 1, modules: 33 },
  "databar-truncated": { type: 2, modules: 13 },
  "databar-stacked": { type: 3, modules: 13 },
  "databar-stacked-omni": { type: 4, modules: 69 },
  "databar-limited": { type: 5, modules: 10 },
  "databar-expanded": { type: 6, modules: 34 },
  "databar-expanded-stacked": { type: 6 },
};
const EXPANDED_STACKED_SEGMENTS = 4; // segments a row, as the studio's layout draws it (the encoder's default)

function fields(symbology: SymbologyId, data: string, options: ZplSymbolOptions, template: boolean) {
  const geometry = encode(symbology, data); // checks the data: GS1 syntax, check digits
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const f = options.hri ?? true ? "Y" : "N";
  const placeholders: ZplPlaceholder[] = [];
  const value = (name: string, sample: string, description: string, escapes: Record<string, string> = {}) => {
    if (!template) return sample;
    placeholders.push({ name, description, sample, escapes });
    return `{{${name}}}`;
  };
  const at = `^FO${x},${y}`;
  // In a template a Data Matrix keeps the sample's size, so that the text below it stays clear.
  const matrixSize = geometry.kind === "matrix" && template ? `${geometry.cols},${geometry.rows}` : "0,0";

  const linear = LINEAR_GTIN[symbology];
  if (symbology === "itf14" && options.bearer) return { commands: itf14WithBearers(data, options, value), placeholders };
  if (linear) {
    const digits = value("01", linear.digits(data), linear.description);
    const command = linear.command.replace("{h}", String(h)).replace("{f}", f);
    return { commands: [`${at}^BY${d},3.0,${h}${command}${fieldData(digits)}`], placeholders };
  }

  switch (symbology) {
    case "gs1-128": {
      // Code 128 with the invocation codes written here (mode N): start code, FNC1 (">8") first and after each element
      // string without a predefined length that is not the last, and the code set changes. Mode D, which leaves this
      // to the printer, joins the element strings without FNC1 (Labelary, 28 October 2026), and mode A prints ">8" as
      // text. The interpretation line of mode N has no parentheses, so the element strings are printed below as text.
      const elements = parseElementString(data);
      const text = gs1128FieldData(
        elements,
        template ? (e) => value(e.ai, e.value, aiDescription(e.ai, 'a ">" is written ">0"'), { ">": ">0" }) : undefined,
      );
      const widthDots = widthInModules(geometry) * d;
      const hri = options.hri ?? true
        ? [`^FO${x},${y + h + 2 * d}^A0N,${hriTextDots(options.dpi)},${hriTextDots(options.dpi)}^FB${widthDots},1,0,C` +
            fieldData(elements.map((e) => `(${e.ai})${template ? `{{${e.ai}}}` : e.value}`).join(""))]
        : [];
      return { commands: [`${at}^BY${d},3.0,${h}^BCN,${h},N,N,N,N${fieldData(text)}`, ...hri], placeholders };
    }
    case "gs1-datamatrix": {
      // ECC 200 with "_" declared as the escape character (its default changed between firmware versions): "_1" is
      // FNC1, first and after each element string without a predefined length that is not the last.
      const elements = parseElementString(data);
      const shown: string[] = [];
      const text = "_1" + elements.map((e, index) => {
        const separator = index < elements.length - 1 && !hasPredefinedLength(e.ai) ? "_1" : "";
        const field = template
          ? value(e.ai, e.value, aiDescription(e.ai, "an underscore is written twice"), { _: "__" })
          : e.value.replace(/_/g, "__");
        shown.push(template ? `{{${e.ai}}}` : e.value);
        return e.ai + field + separator;
      }).join("");
      return {
        commands: [`${at}^BXN,${d},200,${matrixSize},6,_${fieldData(text)}`, ...hriLines(elements, shown, geometry, options)],
        placeholders,
      };
    }
    case "dl-datamatrix": {
      const uri = template
        ? value("URI", data, "the GS1 Digital Link URI; an underscore is written twice.", { _: "__" })
        : data.replace(/_/g, "__");
      return { commands: [`${at}^BXN,${d},200,${matrixSize},6,_${fieldData(uri)}`], placeholders };
    }
    case "dl-qrcode": {
      // Model 2, the error correction level chosen, automatic data input. ^BQ's manual input (one mode for the data) is
      // not used: Labelary prints the same symbol whatever mode it is given (31 October 2026), so nothing shows that a
      // printer would honour it (ADR 0002). The level is a minimum there: Labelary raised M to Q where the version had room.
      if (options.qrMode) {
        throw new ZplUnsupportedError("ZPL writes the QR code in the printer's automatic mode: one mode for the whole data could not be shown to print (ADR 0002).");
      }
      const uri = value("URI", data, "the GS1 Digital Link URI.");
      return { commands: [`${at}^BQN,2,${d}${fieldData(`${options.qrError ?? "M"}A,${uri}`)}`], placeholders };
    }
    case "gs1-qrcode":
      throw new ZplUnsupportedError(
        "ZPL's QR code command (^BQ) has no FNC1, so it cannot print a GS1 QR Code. Use a GS1 DataMatrix, or a QR code " +
          "with a GS1 Digital Link URI.",
      );
    case "databar-omni":
    case "databar-truncated":
    case "databar-stacked":
    case "databar-stacked-omni":
    case "databar-limited":
    case "databar-expanded":
    case "databar-expanded-stacked":
      return { commands: databar(symbology, data, geometry, options, value), placeholders };
    default:
      throw new ZplUnsupportedError(`no ZPL command for ${symbology}`);
  }
}

type Value = (name: string, sample: string, description: string, escapes?: Record<string, string>) => string;

/** The text below a linear symbol, centred on `widthDots` from `x`, in the printer's scalable font. */
function textBelow(text: string, x: number, y: number, widthDots: number, dpi: number): string {
  const dots = hriTextDots(dpi);
  return `^FO${x},${y}^A0N,${dots},${dots}^FB${widthDots},1,0,C${fieldData(text)}`;
}

/**
 * ITF-14 with its bearer bars as ^GB boxes and its 14 digits below them, 1.02 mm away: the printer's interpretation
 * line would print under the bottom bearer bar. The symbol takes the whole GTIN-14 with no check digit computed, so
 * that the symbol and the text below it carry the same value — in a template too.
 */
function itf14WithBearers(data: string, options: ZplSymbolOptions, value: Value) {
  const { x, y, dotsPerModule: d, barHeightDots: h, bearer } = options;
  const t = bearer!.thicknessDots;
  const quiet = 10 * d;
  const width = (7 * (4 * ITF14_RATIO + 6) + ITF14_RATIO + 6) * d; // section 5.3.2.2: P(4N+6)+N+6 modules
  const side = bearer!.kind === "frame" ? t : 0;
  const left = x - quiet - side;
  const outer = width + 2 * quiet + 2 * side;
  const gtin = value("01", data, "the GTIN-14, its check digit included.");
  const boxes = bearer!.kind === "frame"
    ? [`^FO${left},${y - t}^GB${outer},${h + 2 * t},${t}^FS`]
    : [`^FO${left},${y - t}^GB${outer},${t},${t}^FS`, `^FO${left},${y + h}^GB${outer},${t},${t}^FS`];
  const text = options.hri ?? true
    ? [textBelow(gtin, left, y + h + t + Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi), outer, options.dpi)]
    : [];
  return [`^FO${x},${y}^BY${d},${ITF14_RATIO}.0,${h}^B2N,${h},N,N,N${fieldData(gtin)}`, ...boxes, ...text];
}

/**
 * GS1 DataBar through ^BR. The family but Expanded takes the GTIN's first 13 digits and adds the check digit; Expanded
 * takes the element strings without brackets. ^BR could not be made to separate an element string of no predefined
 * length from the next (neither "#" nor a GS byte through ^FH was read back), so Expanded is refused where one would
 * need it; and ^BR prints each symbol at a fixed height, so a table that asks for more is refused too. The element
 * strings are printed below as text.
 */
function databar(symbology: SymbologyId, data: string, geometry: SymbolGeometry, options: ZplSymbolOptions, value: Value) {
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const { type, modules } = DATABAR[symbology]!;
  const name = SYMBOLOGIES[symbology].name;
  if (d > 10) throw new ZplUnsupportedError(`^BR prints ${name} at 1 to 10 dots a module; this X-dimension needs ${d}.`);
  if (modules && h > modules * d + d / 2) {
    throw new ZplUnsupportedError(
      `^BR prints ${name} ${modules} modules high and no higher; this table asks for ${Math.round(h / d)}. Use the PDF, ` +
        "or a symbol the table lets the printer draw as high as it asks.",
    );
  }
  const elements = parseElementString(data);
  if (type === 6 && elements.slice(0, -1).some((e) => !hasPredefinedLength(e.ai))) {
    throw new ZplUnsupportedError(
      `^BR cannot separate an element string of no predefined length from the next, so ${name} carries such a one ` +
        "only last. Put it last, or use GS1-128 or the PDF.",
    );
  }
  const shown: string[] = [];
  const fd = type === 6
    ? elements.map((e) => {
        const v = value(e.ai, e.value, aiDescription(e.ai, "as it is"));
        shown.push(`(${e.ai})${v}`);
        return e.ai + v;
      }).join("")
    : (() => {
        const gtin = elements[0]!.value;
        const v = value("01", gtin.slice(0, 13), "the GTIN-14's first 13 digits; the printer adds the check digit.");
        shown.push(`(01)${value("GTIN", gtin, "the whole GTIN-14, for the text below the symbol.")}`);
        return v;
      })();
  const segments = symbology === "databar-expanded-stacked" ? EXPANDED_STACKED_SEGMENTS : 22;
  const height = (modules ?? (geometry.kind === "matrix" ? geometry.rows : 34)) * d;
  const widthDots = widthInModules(geometry) * d;
  const text = options.hri ?? true
    ? [textBelow(type === 6 ? shown.join("") : shown[0]!, x, y + height + Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi), widthDots, options.dpi)]
    : [];
  return [`^FO${x},${y}^BRN,${type},${d},1,${h},${segments}${fieldData(fd)}`, ...text];
}

function aiDescription(ai: string, escaping: string): string {
  return `the value of AI (${ai}), without the AI; ${escaping}.`;
}

/**
 * GS1-128 field data for ^BC mode N. Element strings of predefined length are all digits and of even length (figure
 * 7.8.5-2), so they go in code set C as pairs; the AI of another element string goes in C when it has an even number of
 * digits, and its value in code set B — or, in a label (not a template), in C wherever four or more digits follow one
 * another. In code set B ">" is written ">0" (ZPL II guide, table 2). `placeholder` turns a value into a template's.
 */
export function gs1128FieldData(elements: Element[], placeholder?: (element: Element) => string): string {
  let out = "";
  let set: "B" | "C" | null = null;
  const to = (next: "B" | "C") => {
    if (set !== next) out += set === null ? (next === "C" ? ">;" : ">:") : next === "C" ? ">5" : ">6";
    set = next;
  };
  const inB = (text: string) => {
    to("B");
    out += text.replace(/>/g, ">0");
  };
  elements.forEach((e, index) => {
    if (index === 0) {
      to(hasPredefinedLength(e.ai) || e.ai.length % 2 === 0 ? "C" : "B");
      out += ">8";
    }
    if (hasPredefinedLength(e.ai)) {
      to("C");
      out += e.ai + (placeholder ? placeholder(e) : e.value);
    } else {
      if (e.ai.length % 2 === 0) {
        to("C");
        out += e.ai;
      } else inB(e.ai);
      if (placeholder) inB(placeholder(e));
      else {
        for (const [run] of e.value.matchAll(/\d{4,}|\D+|\d{1,3}/g)) {
          if (!/^\d{4,}$/.test(run)) inB(run);
          else {
            if (run.length % 2 === 1) inB(run[0]!);
            to("C");
            out += run.slice(run.length % 2);
          }
        }
      }
      if (index < elements.length - 1) out += ">8";
    }
  });
  return out;
}

function hriTextDots(dpi: number): number {
  return Math.round((HRI_TEXT_MM / MM_PER_INCH) * dpi);
}

/** The element strings as text lines below a 2D symbol (after its one-module quiet zone), in the scalable font. */
function hriLines(elements: Element[], shown: string[], geometry: SymbolGeometry, options: ZplSymbolOptions): string[] {
  if (!(options.hri ?? true) || geometry.kind !== "matrix") return [];
  const textDots = hriTextDots(options.dpi);
  let y = options.y + (geometry.rows + 2) * options.dotsPerModule;
  return elements.map((e, index) => {
    const line = `^FO${options.x},${y}^A0N,${textDots},${textDots}${fieldData(`(${e.ai})${shown[index]}`)}`;
    y += Math.round(textDots * 1.4);
    return line;
  });
}

/** UPC-E (number system 0, eight digits) expanded to the UPC-A's manufacturer and product digits (ten). */
export function upcaManufacturerAndProduct(upce: string): string {
  const d = upce.slice(1, 7);
  const last = Number(d[5]);
  if (last <= 2) return `${d[0]}${d[1]}${d[5]}00` + `00${d[2]}${d[3]}${d[4]}`;
  if (last === 3) return `${d.slice(0, 3)}00` + `000${d[3]}${d[4]}`;
  if (last === 4) return `${d.slice(0, 4)}0` + `0000${d[4]}`;
  return d.slice(0, 5) + `0000${d[5]}`;
}

/**
 * The largest graphic field: the byte counts of ^GF take 1 to 99999 (ZPL II Programming Guide, ^GF). Graphic fields
 * are for images such as a logo; a larger image is sent as horizontal stripes.
 */
export const MAX_GRAPHIC_FIELD_BYTES = 99999;

/** Rows `fromRow` (inclusive) to `toRow` (exclusive) of `bitmap` as one ^GFA, eight dots a byte, leftmost dot first. */
export function bitmapToGraphicField(bitmap: Bitmap, fromRow = 0, toRow = bitmap.height): string {
  const bytesPerRow = Math.ceil(bitmap.width / 8);
  let hex = "";
  for (let y = fromRow; y < toRow; y++) {
    for (let byte = 0; byte < bytesPerRow; byte++) {
      let value = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit;
        if (x < bitmap.width && bitmap.dark[y * bitmap.width + x]) value |= 0x80 >> bit;
      }
      hex += value.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  const total = bytesPerRow * (toRow - fromRow);
  if (total > MAX_GRAPHIC_FIELD_BYTES) throw new Error(`a graphic field holds at most ${MAX_GRAPHIC_FIELD_BYTES} bytes`);
  return `^GFA,${total},${total},${bytesPerRow},${hex}`;
}

/** The bitmap placed at (x, y) in dots, as one field or as stripes that each fit a graphic field. */
export function graphicFields(bitmap: Bitmap, x: number, y: number): string[] {
  const rowsPerField = Math.floor(MAX_GRAPHIC_FIELD_BYTES / Math.ceil(bitmap.width / 8));
  if (rowsPerField < 1) throw new Error("the image is too wide for a graphic field");
  const fields: string[] = [];
  for (let row = 0; row < bitmap.height; row += rowsPerField) {
    const end = Math.min(bitmap.height, row + rowsPerField);
    fields.push(`^FO${x},${y + row}${bitmapToGraphicField(bitmap, row, end)}^FS`);
  }
  return fields;
}
