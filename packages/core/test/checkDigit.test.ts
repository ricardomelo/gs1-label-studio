import { describe, expect, it } from "vitest";
import { checkDigit, hasValidCheckDigit } from "../src/index.ts";

describe("GS1 check digit", () => {
  it.each([
    ["950600013435", 2], // GTIN-13 9506000134352
    ["0950600013435", 2], // the same GTIN as a GTIN-14
    ["9501234", 6], // GTIN-8 95012346
  ])("of %s is %i", (digits, expected) => {
    expect(checkDigit(digits)).toBe(expected);
  });

  it("matches published keys", () => {
    for (const key of ["9506000134352", "09506000134352", "95012346", "614141000036", "106141411234567897"]) {
      expect(hasValidCheckDigit(key), key).toBe(true);
    }
  });

  it("rejects a wrong digit and non-digits", () => {
    expect(hasValidCheckDigit("9506000134353")).toBe(false);
    expect(hasValidCheckDigit("95060001343A2")).toBe(false);
    expect(() => checkDigit("12a")).toThrow();
  });
});
