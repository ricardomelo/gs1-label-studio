// The OpenAPI document gs1ls serve gives at /v1/openapi.json (backlog 5.1 c): what each route takes and returns, its
// choices listed from the same tables the commands check, so that the document cannot name a format they refuse.

import { ENVIRONMENTS, PRINTER_LANGUAGES, SYMBOLOGIES } from "@gs1-label-studio/core";
import { FORMATS, IMAGE_FORMATS } from "./commands.ts";

const error = { description: "The reason, in English", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const refusals = {
  400: { ...error, description: "A request the API cannot understand: an unknown format, symbol or option" },
  422: { ...error, description: "Data the GS1 rules refuse, or a design that cannot draw them, in the core's words" },
};

const DATA = { type: "string", description: "An element string, a GS1 Digital Link URI or a scanner's text", examples: ["(01)09506000134376(10)B42(17)271231"] };
const STEM = { type: "string", description: "The GS1 Digital Link URI's domain; https://id.gs1.org when not given" };
const DPI = { type: "integer", enum: [152, 203, 300, 600], default: 203 };
const DESIGN = {
  symbol: { type: "string", enum: Object.keys(SYMBOLOGIES), description: "The symbol; none: the one the studio's step 2 recommends" },
  environment: { type: "string", enum: Object.keys(ENVIRONMENTS), description: "The scanning environment; none: the key's first" },
  size: { type: "number", exclusiveMinimum: 0, description: "The symbol's size in percent" },
  hri: { type: "string", enum: ["full", "key", "none"], description: "The human readable text" },
};
const EPC = {
  scheme: { type: "string", enum: ["classic", "plus", "plusplus"], default: "classic", description: "Classic EPC, EPC+ or EPC++" },
  prefixLength: { type: "integer", minimum: 6, maximum: 12, description: "The GS1 Company Prefix's length (classic)" },
  gcp: { type: "string", description: "GS1's GCP length table (XML), which gives the prefix's length instead" },
  filter: { type: "integer", minimum: 0, maximum: 7, description: "The filter; none: the key's usual one" },
  date: { type: "string", description: "The AI of a DSGTIN's date, such as 17 (EPC+ and EPC++ of a GTIN)" },
  withData: { type: "boolean", description: "The data's other element strings after an EPC+ or EPC++ (+AIDC data)" },
  umi: { type: "boolean", description: "The StoredPC's user memory indicator" },
  hazmat: { type: "boolean", description: "The StoredPC's hazardous material attribute bit" },
  stem: STEM,
};
const WRITE_FROM = { type: "string", enum: ["pc", "epc"], default: "pc", description: "Where an RFID printer writes: from bit 10h (StoredPC and EPC) or 20h (EPC)" };
const query = (name: string, schema: object, description?: string) => ({ name, in: "query", schema, ...(description ? { description } : {}) });

export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "GS1 Label Studio local API (gs1ls serve)",
    version: "1",
    description: "GS1 Label Studio's checks, labels, bulk generation and RFID tags on this machine (ADR 0009). No authentication: keep it on 127.0.0.1 or behind the system's own gateway. Files and messages are in English.",
    license: { name: "Apache-2.0" },
  },
  paths: {
    "/v1/check": {
      post: {
        summary: "The Check Studio's check of one reading",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["data"], properties: { data: DATA } } } } },
        responses: {
          200: { description: "The verdict, each finding with how to fix it, the elements and the data's other forms", content: { "application/json": { schema: { $ref: "#/components/schemas/Check" } } } },
          400: refusals[400],
        },
      },
    },
    "/v1/label": {
      post: {
        summary: "One label as a file, drawn as the studio draws it",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["data"], properties: {
            data: DATA, format: { type: "string", enum: FORMATS, default: "svg" }, ...DESIGN,
            dpi: { ...DPI, description: "A print file's resolution" }, stem: STEM,
          } } } },
        },
        responses: {
          200: {
            description: "The file, its name in Content-Disposition",
            content: {
              ...Object.fromEntries(IMAGE_FORMATS.map((f) => [{ svg: "image/svg+xml", png: "image/png", pdf: "application/pdf", eps: "application/postscript" }[f], { schema: { type: "string", format: "binary" } }])),
              "text/plain": { schema: { type: "string" }, description: `A print file: ${Object.values(PRINTER_LANGUAGES).map((l) => l.name).join(", ")}` },
            },
          },
          ...refusals,
        },
      },
    },
    "/v1/epc": {
      post: {
        summary: "The EPC an RFID tag carries, as the RFID Studio writes it",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["data"], properties: {
            data: DATA, ...EPC, format: { type: "string", enum: ["json", "zpl"], default: "json", description: "zpl: a label for an RFID printer that writes the tag" },
            dpi: DPI, writeFrom: WRITE_FROM,
          } } } },
        },
        responses: {
          200: {
            description: "The tag, or with format zpl the label's ZPL",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Epc" } }, "text/plain": { schema: { type: "string" } } },
          },
          ...refusals,
        },
      },
    },
    "/v1/bulk": {
      post: {
        summary: "Every row's label, as the editor's bulk generation makes them",
        description: "The body is the file itself; the choices are the query's. The columns are found from their headers (GTIN, Batch, (17)…); one design for all the rows, from the first that passes.",
        parameters: [
          query("files", { type: "string" }, "A file of each kind for each row, comma-separated: svg, png, pdf, eps"),
          query("pdf", { type: "boolean" }, "One PDF with a label a page"),
          query("print", { type: "string", enum: Object.keys(PRINTER_LANGUAGES) }, "One print file with every label"),
          query("dpi", DPI),
          query("pattern", { type: "string", default: "{symbol}_{key}_{row}" }, "The files' names: {row}, {symbol}, {key}, an AI such as {10}, a column's header"),
          ...Object.entries(DESIGN).map(([name, schema]) => query(name, schema)),
          query("stem", STEM),
          query("rfid", { type: "boolean" }, "Each row's tag written by the ZPL file, and tags.csv for an encoder"),
          ...Object.entries(EPC).filter(([name]) => name !== "stem").map(([name, schema]) => query(name, schema)),
          query("writeFrom", WRITE_FROM),
        ],
        requestBody: {
          required: true,
          content: {
            "text/csv": { schema: { type: "string" } },
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } },
          },
        },
        responses: {
          200: {
            description: "The zip, with generated.csv naming each row's files or why it has none",
            headers: {
              "X-Rows": { schema: { type: "integer" } }, "X-Generated": { schema: { type: "integer" } },
              "X-Left": { schema: { type: "integer" }, description: "Rows left out, their reasons in generated.csv" },
            },
            content: { "application/zip": { schema: { type: "string", format: "binary" } } },
          },
          ...refusals,
          413: { ...error, description: "A body larger than 32 MB" },
        },
      },
    },
    "/v1/openapi.json": { get: { summary: "This document", responses: { 200: { description: "OpenAPI 3.1", content: { "application/json": {} } } } } },
  },
  components: {
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
      Check: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["follows", "remarks", "does-not-follow", "not-gs1", "not-assessed"] },
          findings: { type: "array", items: { type: "object", properties: {
            code: { type: "string" }, severity: { type: "string" }, ai: { type: ["string", "null"] }, what: { type: "string" }, fix: { type: "string" },
            sections: { type: "array", items: { type: "string" } }, fixedData: { type: "string" }, engineMessage: { type: "string" },
            details: { type: "object", additionalProperties: { type: "string" } },
          } } },
          elements: { type: "array", items: { type: "object", properties: { ai: { type: "string" }, value: { type: "string" }, title: { type: "string" } } } },
          forms: { type: ["object", "null"], properties: { elementString: { type: "string" }, dataStr: { type: "string" }, digitalLinkUri: { type: "string" } } },
          notChecked: { type: "array", items: { type: "string" } },
        },
      },
      Epc: {
        type: "object",
        properties: {
          scheme: { type: "string" }, filter: { type: "integer" }, bits: { type: "integer" },
          epc: { type: "string", description: "From bit 20h, zero-filled to the word" },
          pcAndEpc: { type: "string", description: "The StoredPC and the EPC, from bit 10h" },
          storedPc: { type: "string" }, storedCrc: { type: "string" },
          pureIdentity: { type: "string" }, tagUri: { type: "string" }, digitalLinkUri: { type: "string" },
          source: { type: "string", description: "Where the prefix's length came from, when GS1's list gave it" },
          left: { type: "array", items: { type: "string" }, description: "+AIDC data the EPC+ could not carry, with the reasons" },
        },
      },
    },
  },
};
