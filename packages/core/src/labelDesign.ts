// The design of one label from its data alone (backlog 5.1, ADR 0009): what the editor's step 2 recommends for the
// data in a scanning environment, or the symbol named, sized as the editor sizes it, with the editor's defaults for the
// rest. The command line and the local API draw with it, so that a label made without a browser is the one the studio
// would have made.

import type { LabelDesign } from "./batch.ts";
import { isDigitalLinkKey } from "./dictionary.ts";
import { ENVIRONMENTS, environmentsFor } from "./environments.ts";
import { guidance, leafOfEnvironment } from "./guide.ts";
import { isKey, type Identified } from "./identify.ts";
import { BARS } from "./layout.ts";
import { specificationFor } from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { InputError } from "./syntax.ts";

export interface DesignChoice {
  /** The symbol; none: the one step 2's table recommends for the data in the environment. */
  symbology?: SymbologyId;
  /** The scanning environment (`ENVIRONMENTS`); none: the key's first, as the editor starts. */
  environment?: string;
  /** Percentage of the environment's target X-dimension, or of the table's row; 100 when not given. */
  size?: number;
  /** Human readable text: every element string, the key's alone, or none; every one when not given. */
  hri?: LabelDesign["hri"];
}

/**
 * The label's design for `identified`, as the editor makes it on a first visit: the symbol step 2 recommends (with the
 * 2D symbol beside an EAN/UPC where it recommends both), or `choice.symbology` sized by the environment or its table's
 * row. An `InputError` names what to choose when neither gives a symbol.
 */
export function designFor(identified: Identified, choice: DesignChoice = {}): LabelDesign {
  const key = identified.elements.find((e) => isKey(e.ai))?.ai;
  if (!key) throw new InputError("The data has no GS1 key, such as (01) GTIN or (00) SSCC.");
  const environments = environmentsFor(key);
  const environment = choice.environment ?? environments[0];
  if (!environment || !ENVIRONMENTS[environment]) {
    throw new InputError(`Unknown scanning environment: ${choice.environment ?? ""}. Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`);
  }
  if (!environments.includes(environment)) {
    throw new InputError(`(${key}) is not scanned in the environment ${environment}: use ${environments.join(", ")}.`);
  }
  const base = {
    hri: choice.hri ?? "full", version: null, error: "m", size: choice.size ?? 100, bearer: "frame", reduction: 0, linearSize: null,
  } as const;

  if (!choice.symbology) {
    const guide = guidance(leafOfEnvironment(environment)!, identified);
    const recommended = guide.recommended;
    if (!recommended) {
      throw new InputError(`Step 2's table recommends no symbol the studio draws for this data in ${environment}: name one.`);
    }
    const symbology = recommended.with ?? recommended.symbol;
    const option = guide.options.find((o) => o.symbol === symbology);
    const spec = !BARS.includes(symbology) && guide.environment !== null ? undefined
      : option ? (option.specs.find((row) => row.part) ?? option.specs[0]) : undefined;
    return {
      ...base, symbology, ...(guide.environment ? { environment: guide.environment } : {}),
      linear: recommended.with ? (recommended.symbol === "upce" ? "upce" : "auto") : "none",
      ...(spec ? { spec, table: guide.leaf.table } : {}),
    };
  }

  // A symbol named: a Digital Link symbol for a key no URI carries is drawn in GS1 DataMatrix, as in the editor
  const symbology = !isDigitalLinkKey(key) && SYMBOLOGIES[choice.symbology].data === "uri" ? "gs1-datamatrix" : choice.symbology;
  const table = ENVIRONMENTS[environment]!.table;
  const spec = BARS.includes(symbology) ? specificationFor(table, symbology) : undefined;
  if (BARS.includes(symbology) && !spec) {
    throw new InputError(`The table of ${environment} has no row for ${SYMBOLOGIES[symbology].name}: choose another environment or symbol.`);
  }
  return { ...base, symbology, environment, linear: "none", ...(spec ? { spec, table } : {}) };
}
