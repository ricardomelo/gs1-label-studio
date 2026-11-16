import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_LINTER_FAULTS, ENGINE_MESSAGE_FAULTS, ENGINE_UNMAPPED, engineMessageId, FAULTS, faultOfEngineMessage, SYNTAX_ENGINE } from "../src/index.ts";

// Every message of the GS1 Barcode Syntax Engine, and every linter's, named by a fault of the Check Studio's
// catalogue or listed with the reason none applies (backlog 7.1 c): a new engine release fails here until each new
// message is placed.

const engine = JSON.parse(readFileSync(new URL("../src/data/engine_messages.json", import.meta.url), "utf8")) as {
  release: string;
  messages: Record<string, string>;
  linters: Record<string, string>;
};
const CODES = new Set(FAULTS.map((f) => f.code));

describe("the engine's messages and the faults they stand for", () => {
  it("are the messages of the engine release in use", () => {
    expect(engine.release).toBe(SYNTAX_ENGINE.release);
  });

  it("place every message in one list, and no message in two", () => {
    const messages = Object.keys(engine.messages).filter((id) => id !== "AI_LINTER_ERROR");
    for (const id of messages) expect(Number(id in ENGINE_MESSAGE_FAULTS) + Number(id in ENGINE_UNMAPPED), id).toBe(1);
    expect(messages).toHaveLength(93);
  });

  it("place every linter in one list, and no linter in two", () => {
    for (const id of Object.keys(engine.linters)) expect(Number(id in ENGINE_LINTER_FAULTS) + Number(id in ENGINE_UNMAPPED), id).toBe(1);
    expect(Object.keys(engine.linters)).toHaveLength(117);
  });

  it("name only faults of the catalogue, and only messages there are", () => {
    for (const code of [...Object.values(ENGINE_MESSAGE_FAULTS), ...Object.values(ENGINE_LINTER_FAULTS)]) expect(CODES).toContain(code);
    const ids = new Set([...Object.keys(engine.messages), ...Object.keys(engine.linters)]);
    for (const id of [...Object.keys(ENGINE_MESSAGE_FAULTS), ...Object.keys(ENGINE_LINTER_FAULTS), ...Object.keys(ENGINE_UNMAPPED)]) expect(ids).toContain(id);
  });

  it("give every unmapped message its reason", () => {
    for (const [id, reason] of Object.entries(ENGINE_UNMAPPED)) expect(reason.length, id).toBeGreaterThan(20);
  });

  it("recognise each message filled in, and each linter's as the engine writes it", () => {
    for (const [id, template] of Object.entries(engine.messages)) {
      if (id === "AI_LINTER_ERROR") continue;
      const filled = template.replace("{p1}", "10").replace("{p2}", "01,02");
      const found = engineMessageId(filled)?.message;
      // Some templates are the same text with different placeholders: the first of them is found
      expect(engine.messages[found!]?.replace("{p1}", "10").replace("{p2}", "01,02"), id).toBe(filled);
    }
    for (const [id, text] of Object.entries(engine.linters)) expect(engineMessageId(`AI (10): ${text}`), id).toEqual({ message: "AI_LINTER_ERROR", linter: id });
  });

  it("name a GTIN not padded C5, a batch too long or with a forbidden character D6, else as the lists say", () => {
    expect(faultOfEngineMessage("AI (01) data has incorrect length", "01", "9506000134352")).toBe("C5");
    expect(faultOfEngineMessage("AI (01) data has incorrect length", "01", "950600013435")).toBe("C5");
    expect(faultOfEngineMessage("AI (01) data has incorrect length", "01", "95060001343")).toBe("B8");
    expect(faultOfEngineMessage("AI (10) data is too long", "10", "A".repeat(21))).toBe("D6");
    expect(faultOfEngineMessage("AI (21): A non-CSET 82 character was found where a CSET 82 character is expected.", "21", "A#")).toBe("D6");
    expect(faultOfEngineMessage("AI (422): A valid ISO 3166 three-digit country code is required.", "422", "999")).toBe("D9");
    expect(faultOfEngineMessage("AI (8020): The coupon's Format Code is missing.")).toBe("D9");
    expect(faultOfEngineMessage("Something no engine says")).toBe("D9");
  });
});
