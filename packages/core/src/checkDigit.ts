/**
 * The GS1 check digit (GS1 General Specifications, section 7.9.1): the digits are weighted 3 and 1 alternately from
 * the right, and the check digit brings the sum up to a multiple of ten. Used by every GS1 key that has one (GTIN,
 * SSCC, GLN, GRAI, GDTI, GSRN…).
 */
export function checkDigit(digitsWithoutCheck: string): number {
  if (!/^\d+$/.test(digitsWithoutCheck)) throw new Error("check digit: digits only");
  let sum = 0;
  for (let i = 0; i < digitsWithoutCheck.length; i++) {
    const digit = digitsWithoutCheck.charCodeAt(digitsWithoutCheck.length - 1 - i) - 48;
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when the last digit of `digits` is the check digit of the others. */
export function hasValidCheckDigit(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  return checkDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}
