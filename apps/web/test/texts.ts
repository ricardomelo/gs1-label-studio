import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The texts the page shows (ADR 0003, languages): the page's own, each the literal of a t() call, and the messages and
// names the core writes in English, found in its sources by the forms they take — what an error is constructed with,
// what a *Problem or hint function returns, a carrier's reason, the decision tree's questions and applications, a
// symbol's name. A ${expression} in a template literal becomes a {placeholder} named after it.

const root = new URL("../../..", import.meta.url).pathname;

/** A JavaScript string or template literal's text, its ${…} as {name}. */
function literal(quote: string, body: string): string {
  if (quote !== "`") return body.replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
  // A name used twice in one text is told apart by a number: "({label} × {label2} mm)"
  const seen = new Map<string, number>();
  return body.replace(/\$\{([^}]*)\}/g, (_, expr: string) => {
    const name = placeholderName(expr);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return `{${n === 1 ? name : `${name}${n}`}}`;
  }).replace(/\\`/g, "`");
}

function placeholderName(expr: string): string {
  const words = expr.match(/[A-Za-z_]\w*/g) ?? ["x"];
  const last = words.filter((w) => !["toFixed", "join", "length", "map", "slice", "String", "Number", "toUpperCase", "trim"].includes(w)).at(-1) ?? "x";
  return last;
}

const STRING = String.raw`(["'\x60])((?:\\.|(?!\1)[^\\])*)\1`;
/** A literal and the literals joined to it with +, as long messages are written. */
const LITERAL = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60)`;
const JOINED = String.raw`((?:${LITERAL}\s*\+\s*)*${LITERAL})`;

function joined(text: string): string {
  return [...text.matchAll(new RegExp(STRING, "g"))].map((m) => literal(m[1]!, m[2]!)).join("");
}

/** Every t("…") and en("…") of the page's sources, and every text texts.ts exports, with the file it is in. */
export async function pageTexts(): Promise<{ text: string; file: string }[]> {
  const dir = join(root, "apps/web/src");
  const out: { text: string; file: string }[] = [];
  const add = (text: string, file: string) => out.some((o) => o.text === text) || out.push({ text, file });
  for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== "i18n.ts")) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const m of source.matchAll(new RegExp(String.raw`\b(?:t|en)\(\s*` + JOINED, "g"))) add(joined(m[1]!), file);
  }
  // texts.ts holds texts only, shown through t(): each string it exports, but a key's abbreviation (GTIN, SSCC), which
  // is shown as it is, and the codes of its maps
  const texts = (await import("../src/texts.ts")) as Record<string, unknown>;
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (key !== "short" && /[A-Za-z]{2}|^\d.* mm/.test(value) && !/^gs1:/.test(value)) add(value, "texts.ts");
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  for (const [name, value] of Object.entries(texts)) if (typeof value !== "function") walk(value, name);
  return out;
}

/** Calls of t() with a text built at run time (a template literal with ${…}): no catalogue can hold it. */
export function dynamicCalls(): string[] {
  const dir = join(root, "apps/web/src");
  const out: string[] = [];
  for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== "i18n.ts")) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const m of source.matchAll(/\bt\(\s*`[^`]*\$\{/g)) out.push(`${file}: ${m[0]}`);
  }
  return out;
}

const CORE_FORMS = [
  String.raw`new \w*(?:Error|NotPossible|OutOfRange|DoesNotFit)\(\s*` + JOINED,
  String.raw`\breturn\s+` + JOINED,
  // An object's property: a carrier's reason, a question, an application, a symbol's name, a message of a map
  String.raw`(?:^|[{,]\s*)["']?[\w.-]+["']?:\s*` + JOINED,
  // Either branch of a choice between texts, and the texts of a pair (the hints' sizes: "{n} digits", "up to {n} digits")
  String.raw`\?\s*` + JOINED + String.raw`\s*:`,
  String.raw`\?\s*${LITERAL}\s*:\s*` + JOINED,
  String.raw`:\s*\[\s*` + JOINED + String.raw`\s*,`,
  String.raw`:\s*\[\s*${LITERAL}\s*,\s*` + JOINED + String.raw`\s*\]`,
];

/** Files whose texts are the content of a file made, not shown on the page (README, SVG description, ZPL notes). */
const FILE_CONTENT = new Set(["zip.ts", "svg.ts", "pdf.ts", "eps.ts", "png.ts"]);

/** The core's messages and names, from its sources (comments left out). */
export function coreTexts(): { text: string; file: string }[] {
  const dir = join(root, "packages/core/src");
  const out: { text: string; file: string }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !FILE_CONTENT.has(f))) {
    const source = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    for (const form of CORE_FORMS) {
      for (const m of source.matchAll(new RegExp(form, "gm"))) {
        const text = joined(m[1]!);
        // Human text: a letter, a bracket or a placeholder first, a space after; not code, markup or a URL
        if (!/^[A-Za-z({][^<>]*\s/.test(text) || /^(https?:|urn:|\^|%|M |\d|[a-z]+\()/.test(text) || /^[a-z]\w*$/.test(text)) continue;
        if (!out.some((o) => o.text === text)) out.push({ text, file });
      }
    }
  }
  return out;
}
