import { dplLabel, dplTestLabel } from "./dpl.ts";
import { eplLabel, eplTestLabel } from "./epl.ts";
import type { PrintLabelOptions } from "./printers.ts";
import type { SymbologyId } from "./symbologies.ts";
import { tsplLabel, tsplTestLabel } from "./tspl.ts";
import { zplLabel, zplTestLabel } from "./zpl.ts";

/**
 * The printer languages the studio writes (ADR 0002), each with the printer's own commands, and how each is checked:
 * ZPL through Labelary, which renders what Zebra firmware prints; TSPL, EPL2 and DPL through Labelize, an open-source
 * emulator — none yet on a physical printer (backlog 3.9).
 */
export type PrinterLanguage = "zpl" | "tspl" | "epl2" | "dpl";

export interface PrinterLanguageInfo {
  id: PrinterLanguage;
  name: string;
  /** The print file's extension. */
  extension: string;
  /** The printers that speak it. */
  printers: string;
  /** What the tests print it with. */
  checkedWith: string;
  /** Whether it has templates with {{AI}} placeholders. */
  templates: boolean;
}

export const PRINTER_LANGUAGES: Record<PrinterLanguage, PrinterLanguageInfo> = {
  zpl: { id: "zpl", name: "ZPL", extension: "zpl", printers: "Zebra and printers that emulate ZPL", checkedWith: "Labelary", templates: true },
  tspl: { id: "tspl", name: "TSPL", extension: "prn", printers: "TSC and most generic thermal printers (TSPL/TSPL2)", checkedWith: "Labelize", templates: false },
  epl2: { id: "epl2", name: "EPL2", extension: "epl", printers: "older Zebras and printers that emulate EPL2", checkedWith: "Labelize", templates: false },
  dpl: { id: "dpl", name: "DPL", extension: "dpl", printers: "Datamax-O'Neil and Honeywell printers that speak DPL", checkedWith: "Labelize", templates: false },
};

/** One label with one symbol in the printer's language, ready to print. */
export function printLabel(language: PrinterLanguage, symbology: SymbologyId, data: string, options: PrintLabelOptions): string {
  switch (language) {
    case "zpl":
      return zplLabel(symbology, data, options);
    case "tspl":
      return tsplLabel(symbology, data, options);
    case "epl2":
      return eplLabel(symbology, data, options);
    case "dpl":
      return dplLabel(symbology, data, options);
  }
}

/** A test label (backlog 3.1) in the printer's language: the label, a 50 mm ruler and the settings. */
export function printTestLabel(language: PrinterLanguage, symbology: SymbologyId, data: string, options: PrintLabelOptions, notes: readonly string[]): string {
  switch (language) {
    case "zpl":
      return zplTestLabel(symbology, data, options, notes);
    case "tspl":
      return tsplTestLabel(symbology, data, options, notes);
    case "epl2":
      return eplTestLabel(symbology, data, options, notes);
    case "dpl":
      return dplTestLabel(symbology, data, options, notes);
  }
}
