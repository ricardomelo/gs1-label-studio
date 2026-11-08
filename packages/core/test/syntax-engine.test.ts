import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { DICTIONARY, SYNTAX_ENGINE, SYNTAX_ENGINE_NAME, type AiEntry } from "../src/index.ts";

// Following the GS1 Barcode Syntax Engine's releases (scripts/syntax-engine.mjs, .github/workflows/syntax-engine.yml):
// the release named on the screen and in the files made is the one installed, and the script that makes the
// dictionary and the engine's messages from a release's sources writes them as they are. The weekly workflow also
// runs `node scripts/syntax-engine.mjs --verify`, which makes both files again from the release's own sources.

const root = join(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

interface Messages {
  release: string;
  source: string;
  messages: Record<string, string>;
  linters: Record<string, string>;
}

const script = (await import(pathToFileURL(join(root, "scripts/syntax-engine.mjs")).href)) as {
  DICTIONARY_FILE: string;
  MESSAGES_FILE: string;
  RELEASE_MENTIONS: [string, RegExp][];
  engineMessages(trEN: string): Record<string, string>;
  linterMessages(header: string, source: string): Record<string, string>;
  dictionaryEntries(text: string): [string, AiEntry][];
  dictionaryRelease(text: string): string;
  dictionaryJson(release: string, date: string, ais: [string, AiEntry][]): string;
  messagesJson(release: string, messages: Record<string, string>, linters: Record<string, string>): string;
  moveMentions(read: (f: string) => string, write: (f: string, t: string) => void, from: string, to: string): string[];
  messageChanges(before: Messages, after: Messages): { added: string[]; removed: string[]; changed: string[] };
  newer(a: string, b: string): boolean;
};

const messages = JSON.parse(read(script.MESSAGES_FILE)) as Messages;

describe("the Syntax Engine's release, one for the code, the screen and the files", () => {
  it("is the gs1encoder installed and pinned, and the release the dictionary and the messages were made from", () => {
    const installed = JSON.parse(read("packages/core/node_modules/gs1encoder/package.json")) as { version: string };
    const pinned = (JSON.parse(read("packages/core/package.json")) as { dependencies: Record<string, string> }).dependencies;
    expect(SYNTAX_ENGINE.release).toMatch(/^\d+\.\d+\.\d+$/);
    expect([installed.version, pinned.gs1encoder, messages.release]).toEqual([SYNTAX_ENGINE.release, SYNTAX_ENGINE.release, SYNTAX_ENGINE.release]);
    const file = JSON.parse(read(script.DICTIONARY_FILE)) as { release: string; dictionary: string };
    expect(SYNTAX_ENGINE).toEqual({ release: file.release, dictionary: file.dictionary });
    expect(SYNTAX_ENGINE.dictionary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SYNTAX_ENGINE_NAME).toBe(`GS1 Barcode Syntax Engine ${SYNTAX_ENGINE.release}`);
  });

  it("is named, by the words the update moves, in every document that names it", () => {
    for (const [file, pattern] of script.RELEASE_MENTIONS) {
      const found = [...read(file).matchAll(new RegExp(pattern.source, "g"))].map((m) => m[2]);
      expect(found.length, `${file}: ${pattern}`).toBeGreaterThan(0);
      expect(found.every((v) => v === SYNTAX_ENGINE.release), `${file}: ${found.join(", ")}`).toBe(true);
    }
  });
});

describe("a newer release on npm (scripts/syntax-engine.mjs --latest)", () => {
  it("compares releases part by part, as numbers", () => {
    expect([["1.4.2", "1.4.1"], ["1.5.0", "1.4.9"], ["2.0.0", "1.12.3"], ["1.10.0", "1.9.9"]].map(([a, b]) => script.newer(a!, b!))).toEqual([true, true, true, true]);
    expect([["1.4.1", "1.4.1"], ["1.4.0", "1.4.1"], ["1.9.9", "1.10.0"], ["0.9.0", "1.0.0"]].map(([a, b]) => script.newer(a!, b!))).toEqual([false, false, false, false]);
  });
});

describe("the dictionary from the GS1 Barcode Syntax Dictionary's text (scripts/syntax-engine.mjs)", () => {
  // Lines as gs1-syntax-dictionary.txt writes them (release 2026-01-27).
  const TEXT = [
    "# GS1 Barcode Syntax Dictionary",
    "# Release: 2026-01-27",
    "#",
    "00         *?  N18,csum,gcppos2                  dlpkey                                           # SSCC",
    "01         *?  N14,csum,gcppos2                  ex=255,37 dlpkey=22,10,21|235                    # GTIN",
    "",
    "253         ?  N13,csum,gcppos1 [X..17]          dlpkey                                           # GDTI",
    "3100-3105  *?  N6                                req=01,02 ex=310n                                # NET WEIGHT (kg)",
    "427         ?  X..3                              req=01,02 req=422                                # ORIGIN SUBDIVISION",
    "8008        ?  N6,yymmdd N2,hh [N2],mi [N2],ss   req=01,02                                        # PROD TIME",
    "8030        ?  Z..90  req=00,01+21,253,255,8003,8004,8006+21,8010+8011,8017,8018                  # DIGSIG",
    "8043           N18 [N..2]                        req=01+21+8040                                   # PSIM",
    "8110        ?  X..70,couponcode",
    "91-99       ?  X..90                                                                              # INTERNAL",
  ].join("\n");

  it("gives each AI the entry gs1_dictionary.json holds, ranges one AI each, in the dictionary's order", () => {
    const entries = script.dictionaryEntries(TEXT);
    const ais = ["00", "01", "253", "3100", "3101", "3102", "3103", "3104", "3105", "427", "8008", "8030", "8043", "8110",
      ...Array.from({ length: 9 }, (_, i) => String(91 + i))];
    expect(entries.map(([ai]) => ai)).toEqual(ais);
    for (const [ai, entry] of entries) expect(entry, ai).toEqual(DICTIONARY.ais[ai]);
    expect(script.dictionaryRelease(TEXT)).toBe("2026-01-27");
    // A range's AIs keep its first AI's length: 07-09 is 07, 08, 09.
    expect(script.dictionaryEntries("07-09       ?  N6  # TEST").map(([ai]) => ai)).toEqual(["07", "08", "09"]);
  });

  it("refuses what it does not know rather than leave it out", () => {
    expect(() => script.dictionaryEntries("01  *?  N14  dlpkey newattr=1  # GTIN")).toThrow(/newattr=1/);
    expect(() => script.dictionaryEntries("01  *?  Q14  # GTIN")).toThrow(/Q14/);
    expect(() => script.dictionaryRelease("# no date")).toThrow();
  });

  it("writes the file byte for byte as the resolver's tool did", () => {
    // In the file's order: Object.entries would put "30" or "90" first, as integer keys come first.
    const order = [...read(script.DICTIONARY_FILE).matchAll(/^ {4}"(\w+)": /gm)].map((m) => m[1]!);
    expect(order.length).toBe(Object.keys(DICTIONARY.ais).length);
    const ais = order.map((ai): [string, AiEntry] => [ai, DICTIONARY.ais[ai]!]);
    expect(script.dictionaryJson(DICTIONARY.release, DICTIONARY.dictionary, ais) === read(script.DICTIONARY_FILE)).toBe(true);
  });
});

describe("the engine's messages from tr_EN.h and the linters (scripts/syntax-engine.mjs)", () => {
  it("turns each printf conversion into {p1}, {p2}… and C escapes into their characters", () => {
    const trEN = [
      '#define TR_EN_AI_TABLE_BROKEN_PREFIXES_DIFFER_IN_LENGTH "AI table is broken: AIs beginning \'%c%c\' have different lengths"',
      '#define TR_EN_INVALID_AI_PAIRS "It is invalid to pair AI (%.*s) with AI (%.*s)"',
      '#define TR_EN_NO_AI_FOR_PREFIX "No known AI is a prefix of: %.4s..."',
      '#define TR_EN_SYNTAX_DICTIONARY_LINE_EXCEEDS_IMPL "Syntax Dictionary line %d: Exceeds implementation limit of %d characters"',
      '#define TR_EN_QUOTED "A \\"quoted\\" word"',
      "#define TR_EN_H",
    ].join("\n");
    expect(script.engineMessages(trEN)).toEqual({
      AI_TABLE_BROKEN_PREFIXES_DIFFER_IN_LENGTH: "AI table is broken: AIs beginning '{p1}{p2}' have different lengths",
      INVALID_AI_PAIRS: "It is invalid to pair AI ({p1}) with AI ({p2})",
      NO_AI_FOR_PREFIX: "No known AI is a prefix of: {p1}...",
      SYNTAX_DICTIONARY_LINE_EXCEEDS_IMPL: "Syntax Dictionary line {p1}: Exceeds implementation limit of {p2} characters",
      QUOTED: 'A "quoted" word',
    });
    for (const key of ["AI_TABLE_BROKEN_PREFIXES_DIFFER_IN_LENGTH", "INVALID_AI_PAIRS", "NO_AI_FOR_PREFIX"]) {
      expect(script.engineMessages(trEN)[key]).toBe(messages.messages[key]);
    }
  });

  it("pairs the linters' codes with their texts, leaving out OK and the unused codes", () => {
    const header = "typedef enum\n{\n\tGS1_LINTER_OK = 0,\n\tGS1_LINTER_NON_DIGIT_CHARACTER,\n\tGS1_LINTER_UNUSED_1,\n" +
      "\tGS1_LINTER_NOT_ZERO_OR_ONE,\n} gs1_lint_err_t;";
    const source = 'const char *gs1_lint_err_str[] = {\n\t"No issues were detected by the linter.",\n' +
      '\t"A non-digit character was found where a digit is expected.",\n\t"",\n\t"A \\"0\\" or \\"1\\" is required.",\n};';
    expect(script.linterMessages(header, source)).toEqual({
      NON_DIGIT_CHARACTER: messages.linters.NON_DIGIT_CHARACTER,
      NOT_ZERO_OR_ONE: messages.linters.NOT_ZERO_OR_ONE,
    });
    expect(() => script.linterMessages(header, source.replace('\t"",\n', ""))).toThrow(/4 linter codes but 3 texts/);
  });

  it("writes the catalogue byte for byte as it is", () => {
    expect(script.messagesJson(messages.release, messages.messages, messages.linters) === read(script.MESSAGES_FILE)).toBe(true);
  });

  it("lists the messages a release adds, changes and removes, for the translations", () => {
    const after: Messages = {
      ...messages,
      messages: { ...messages.messages, NEW_ONE: "A new message", AI_DATA_IS_EMPTY: "AI ({p1}) is empty" },
      linters: Object.fromEntries(Object.entries(messages.linters).filter(([k]) => k !== "IBAN_TOO_LONG")),
    };
    expect(script.messageChanges(messages, after)).toEqual({
      added: ["A new message"],
      changed: ["AI ({p1}) data is empty → AI ({p1}) is empty"],
      removed: ["The IBAN is too long."],
    });
  });
});

describe("the documents' release moved with the engine (scripts/syntax-engine.mjs)", () => {
  it("moves the engine's release and nothing else that reads the same", () => {
    const files: Record<string, string> = {
      "README.md": "![GS1 Barcode Syntax Engine 1.4.1](https://img.shields.io/badge/GS1%20Barcode%20Syntax%20Engine-1.4.1-002c6c)",
      "docs/third-party.md": "| [GS1 Barcode Syntax Engine](…) (`gs1encoder`, WebAssembly) | 1.4.1 | parsing |\n| epc-tds | 1.4.1 | EPC |",
      "docs/conformance.md": "GS1 Barcode Syntax Engine 1.4.0 and its dictionary",
    };
    const read = (f: string) => files[f] ?? "";
    const write = (f: string, t: string) => {
      files[f] = t;
    };
    expect(script.moveMentions(read, write, "1.4.1", "1.5.0")).toEqual(["README.md", "docs/third-party.md"]);
    expect(files["README.md"]).toBe("![GS1 Barcode Syntax Engine 1.5.0](https://img.shields.io/badge/GS1%20Barcode%20Syntax%20Engine-1.5.0-002c6c)");
    expect(files["docs/third-party.md"]).toBe("| [GS1 Barcode Syntax Engine](…) (`gs1encoder`, WebAssembly) | 1.5.0 | parsing |\n| epc-tds | 1.4.1 | EPC |");
    expect(files["docs/conformance.md"]).toBe("GS1 Barcode Syntax Engine 1.4.0 and its dictionary");
  });
});
