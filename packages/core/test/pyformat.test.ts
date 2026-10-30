import { describe, expect, it } from "vitest";
import { pyFixed } from "../src/pyformat.ts";

// Python's f"{value:.Nf}" (ADR 0004): the fast path (toFixed far from a tie, backlog 2.5) gives what the exact
// expansion gives, ties to even.

/** The exact decimal expansion of the binary value, rounded half to even: the reference. */
function reference(value: number, decimals: number): string {
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const [whole, fraction = ""] = Math.abs(value).toFixed(decimals + 60).split(".");
  let digits = BigInt(whole + fraction.slice(0, decimals));
  const dropped = fraction.slice(decimals);
  const half = "5".padEnd(dropped.length, "0");
  if (dropped > half || (dropped === half && digits % 2n === 1n)) digits += 1n;
  const text = digits.toString().padStart(decimals + 1, "0");
  return sign + (decimals ? `${text.slice(0, -decimals)}.${text.slice(-decimals)}` : text);
}

describe("pyFixed", () => {
  it("breaks exact ties to even, as Python does, and keeps the sign of zero", () => {
    expect(pyFixed(9.3125, 3)).toBe("9.312");
    expect(pyFixed(9.3135, 3)).toBe(reference(9.3135, 3));
    expect(pyFixed(0.125, 2)).toBe("0.12");
    expect(pyFixed(0.375, 2)).toBe("0.38");
    expect(pyFixed(2.5, 0)).toBe("2");
    expect(pyFixed(3.5, 0)).toBe("4");
    expect(pyFixed(-0.0004, 3)).toBe("-0.000");
    expect(pyFixed(-0, 1)).toBe("-0.0");
  });

  it("gives the reference's answer for 200 000 values of every kind a layout writes", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 200_000; i++) {
      const decimals = i % 4;
      const value = (random() - 0.3) * 10 ** (i % 7) * (i % 5 === 0 ? 1 : random());
      const tie = Math.round(value * 1000) / 1000 + (i % 3 === 0 ? 0.0005 : 0); // near and on ties
      expect(pyFixed(value, decimals), `${value}`).toBe(reference(value, decimals));
      expect(pyFixed(tie, 3), `${tie}`).toBe(reference(tie, 3));
    }
  });
});
