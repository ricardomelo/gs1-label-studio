/**
 * Python's fixed-point formatting, f"{value:.{decimals}f}": the exact binary value rounded to the nearest, ties to
 * even. JavaScript's toFixed() breaks ties upwards, so 9.3125 gives "9.313" where Python gives "9.312"; the port of the
 * resolver's renderers formats as Python does, so that both write the same numbers (ADR 0004).
 */
export function pyFixed(value: number, decimals: number): string {
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const exact = Math.abs(value).toFixed(Math.min(100, decimals + 60));
  const [whole, fraction = ""] = exact.split(".");
  const kept = fraction.slice(0, decimals);
  const dropped = fraction.slice(decimals);
  let digits = BigInt(whole + kept);
  const half = "5".padEnd(dropped.length, "0");
  if (dropped > half || (dropped === half && digits % 2n === 1n)) digits += 1n;
  const text = digits.toString().padStart(decimals + 1, "0");
  const result = decimals ? `${text.slice(0, -decimals)}.${text.slice(-decimals)}` : text;
  return sign + result;
}
