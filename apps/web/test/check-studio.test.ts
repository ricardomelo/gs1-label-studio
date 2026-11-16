import { FAULTS } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { environmentOf } from "../src/CheckStudio.tsx";
import { SIMPLE_TEXTS } from "../src/checkTexts.ts";

// The Check Studio's simple view (backlog 7.1 f; the check studio's project, sections 3.6 and 6.1): every fault of the
// catalogue told in plain words, and each answer to "Where is it scanned?" mapped to its scanning environment.

describe("the simple view's texts", () => {
  it("cover every fault of the catalogue, and nothing else", () => {
    expect(Object.keys(SIMPLE_TEXTS).sort()).toEqual(FAULTS.map((f) => f.code).sort());
  });

  it("are one sentence each, with an AI never named by its number alone", () => {
    for (const [code, texts] of Object.entries(SIMPLE_TEXTS)) {
      for (const text of [texts.what, texts.why, texts.fix]) {
        expect(text, code).toMatch(/[.!?]$/);
        expect(text.slice(0, -1), code).not.toMatch(/[.!?] [A-Z]/);
        expect(text, code).not.toMatch(/\bAI \(\d|\(\d{2,4}\)/);
        expect(text, code).not.toMatch(/\b(invalid|illegal|malformed)\b/i);
      }
    }
  });
});

describe("where the code is scanned", () => {
  it("maps each choice and its follow-up to a scanning environment, I do not know to null", () => {
    expect(environmentOf("shop", "a", [])).toBe("retail");
    expect(environmentOf("shop", "b", [])).toBe("retail-gd");
    expect(environmentOf("health", "a", [])).toBe("pharmacy");
    expect(environmentOf("health", "b", [])).toBe("pharmacy-gd");
    expect(environmentOf("health", "c", [])).toBe("healthcare");
    expect(environmentOf("case", "a", [])).toBe("distribution");
    expect(environmentOf("pallet", "a", [])).toBe("logistics");
    expect(environmentOf("part", "a", [])).toBe("dpm");
    expect(environmentOf("phone", "a", [])).toBe("retail");
    expect(environmentOf("asset", "a", ["8018"])).toBe("gsrn");
    expect(environmentOf("asset", "a", ["414"])).toBe("assets");
    expect(environmentOf("unknown", "a", [])).toBeNull();
  });
});
