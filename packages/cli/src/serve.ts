// gs1ls serve (backlog 5.1 c, ADR 0009 decision 3): the command line's operations as a local HTTP API, bound to
// 127.0.0.1 unless told otherwise. No authentication, by design: a local tool. JSON in, the file or JSON out; each route
// the same function of commands.ts as its command, so that the two cannot drift apart.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { GcpError, InputError, parseGcpTable, type HriFont, type SyntaxEngine } from "@gs1-label-studio/core";
import { bulkFile, checkData, epcData, epcZpl, makeLabel, UsageError, type BulkRequest, type EpcRequest, type LabelRequest } from "./commands.ts";
import { language } from "./lang.ts";
import { OPENAPI } from "./openapi.ts";

/** A request body larger than this is refused (413): a workbook of many thousand rows fits. */
export const MAX_BODY = 32 * 1024 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function body(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, `The request is larger than ${MAX_BODY / 1024 / 1024} MB.`);
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  const text = new TextDecoder().decode(await body(request));
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UsageError("The body is not JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UsageError("The body is a JSON object.");
  return value as Record<string, unknown>;
}

const string = (value: unknown, name: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new UsageError(`${name} is a string.`);
  return value;
};
const number = (value: unknown, name: string): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new UsageError(`${name} is a number.`);
  return n;
};
const boolean = (value: unknown, name: string): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new UsageError(`${name} is true or false.`);
};

/** Fields named with a value only: the request types take no undefined. */
const defined = <T extends object>(object: T): T => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined)) as T;

function data(fields: Record<string, unknown>): string {
  const value = string(fields.data, "data");
  if (!value?.trim()) throw new UsageError("data is the element string, GS1 Digital Link URI or scanner's text.");
  return value;
}

function epcRequest(fields: Record<string, unknown>): EpcRequest {
  const gcp = string(fields.gcp, "gcp");
  return defined({
    scheme: string(fields.scheme, "scheme") as EpcRequest["scheme"],
    prefixLength: number(fields.prefixLength, "prefixLength"),
    filter: number(fields.filter, "filter"),
    date: string(fields.date, "date"),
    withData: boolean(fields.withData, "withData"),
    umi: boolean(fields.umi, "umi"),
    hazmat: boolean(fields.hazmat, "hazmat"),
    stem: string(fields.stem, "stem"),
    ...(gcp ? { gcp: parseGcpTable(gcp) } : {}),
  });
}

const writeFrom = (value: unknown) => {
  const from = string(value, "writeFrom");
  if (from === undefined || from === "pc") return "pc" as const;
  if (from === "epc") return "auto" as const;
  throw new UsageError("writeFrom is pc (from bit 10h) or epc (from bit 20h).");
};

function send(response: ServerResponse, status: number, type: string, payload: string | Uint8Array, headers: Record<string, string> = {}) {
  response.writeHead(status, { "Content-Type": type, ...headers });
  response.end(payload);
}

const sendJson = (response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) =>
  send(response, status, "application/json; charset=utf-8", JSON.stringify(value, null, 2) + "\n", headers);

/** A file as a download, its name in Content-Disposition. */
const attachment = (name: string) => ({ "Content-Disposition": `attachment; filename="${name.replace(/["\\]/g, "_")}"` });

/** The routes, over the engine and font loaded once. */
export function apiHandler(engine: SyntaxEngine, font: HriFont, defaultLang?: string): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    // The language of what is said about the data: the request's Accept-Language, else gs1ls serve's --lang
    // ("*", which fetch sends by default, or a language it does not speak, leaves it to --lang)
    const header = request.headers["accept-language"];
    const lang = language(header && /(^|,)\s*(en|pt|es|fr|de|it)\b/i.test(header) ? header : defaultLang);
    const route = `${request.method} ${url.pathname.replace(/\/$/, "")}`;
    try {
      switch (route) {
        case "GET /v1/openapi.json":
          return sendJson(response, 200, OPENAPI);
        case "POST /v1/check":
          return sendJson(response, 200, checkData(engine, data(await json(request)), lang));
        case "POST /v1/label": {
          const fields = await json(request);
          const label: LabelRequest = defined({
            data: data(fields),
            format: (string(fields.format, "format") ?? "svg") as LabelRequest["format"],
            symbology: string(fields.symbol, "symbol") as LabelRequest["symbology"],
            environment: string(fields.environment, "environment"),
            size: number(fields.size, "size"),
            hri: string(fields.hri, "hri") as LabelRequest["hri"],
            dpi: number(fields.dpi, "dpi"),
            stem: string(fields.stem, "stem"),
          });
          const file = await makeLabel(engine, font, label);
          return send(response, 200, file.type, file.bytes, attachment(file.name));
        }
        case "POST /v1/epc": {
          const fields = await json(request);
          const out = await epcData(engine, data(fields), epcRequest(fields), lang);
          const format = string(fields.format, "format") ?? "json";
          if (format === "zpl") {
            return send(response, 200, "text/plain; charset=utf-8", epcZpl(out, defined({ dpi: number(fields.dpi, "dpi"), from: writeFrom(fields.writeFrom) })),
              attachment(`epc_${out.epc}.zpl`));
          }
          if (format !== "json") throw new UsageError("format is json or zpl.");
          const { tag: _tag, ...rest } = out;
          return sendJson(response, 200, rest);
        }
        case "POST /v1/bulk": {
          // The file itself is the body (a CSV or a workbook); the choices are the query's
          const q = Object.fromEntries(url.searchParams);
          const files = string(q.files, "files");
          const rfid = boolean(q.rfid, "rfid");
          const bulk: BulkRequest = defined({
            files: files === undefined ? undefined : (files.split(",").map((f) => f.trim()).filter(Boolean) as BulkRequest["files"]),
            pdf: boolean(q.pdf, "pdf"),
            print: string(q.print, "print") as BulkRequest["print"],
            dpi: number(q.dpi, "dpi"),
            pattern: string(q.pattern, "pattern"),
            symbology: string(q.symbol, "symbol") as BulkRequest["symbology"],
            environment: string(q.environment, "environment"),
            size: number(q.size, "size"),
            hri: string(q.hri, "hri") as BulkRequest["hri"],
            stem: string(q.stem, "stem"),
            rfid: rfid ? { ...epcRequest(q), from: writeFrom(q.writeFrom) } : undefined,
          });
          const out = await bulkFile(engine, font, await body(request), bulk);
          return send(response, 200, "application/zip", out.zip, {
            ...attachment("labels.zip"), "X-Rows": String(out.rows), "X-Generated": String(out.generated), "X-Left": String(out.left),
          });
        }
        default:
          if (["/v1/openapi.json", "/v1/check", "/v1/label", "/v1/epc", "/v1/bulk"].includes(url.pathname.replace(/\/$/, ""))) {
            throw new HttpError(405, `${request.method} is not allowed here.`);
          }
          throw new HttpError(404, `No such route: ${url.pathname}. See /v1/openapi.json.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A usage error is the request's (400), data the GS1 rules refuse 422, anything else the server's (500)
      const status = error instanceof HttpError ? error.status
        : error instanceof UsageError || error instanceof GcpError ? 400
        : error instanceof InputError ? 422 : 500;
      sendJson(response, status, { error: status === 422 ? lang.tm(message) : message }, { "Content-Language": lang.locale });
    }
  };
}

/** The API listening: on 127.0.0.1 unless `host` says otherwise; port 0 takes a free one (the tests). */
export function serve(engine: SyntaxEngine, font: HriFont, options: { host?: string; port?: number; lang?: string } = {}): Promise<Server> {
  const handle = apiHandler(engine, font, options.lang);
  const server = createServer((request, response) => void handle(request, response));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8080, options.host ?? "127.0.0.1", () => resolve(server));
  });
}
