import { beforeAll, describe, expect, it } from "vitest";
import {
  AttributeError,
  attributeHint,
  attributeByCode,
  attributesForKey,
  checkDigitProblem,
  checkKeyValue,
  dataFor,
  exclusiveQualifiers,
  fieldsOf,
  identify,
  inUriOrder,
  InputError,
  isKey,
  isSexCode,
  orderOf,
  OTHER_KEYS,
  parametersProblem,
  qualifiersOf,
  resolveAttribute,
  rowsOf,
  sexCode,
  splitRows,
  syntaxEngine,
  uriParameters,
  type Identification,
  type SyntaxEngine,
} from "../src/index.ts";

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const BASE: Identification = { key: "01", value: "09506000134376", qualifiers: {}, attributes: [] };

describe("the editor's identification", () => {
  it("knows each key's qualifiers, in path order, and which exclude each other", () => {
    expect(qualifiersOf("01")).toEqual(["22", "10", "21", "235"]);
    expect(qualifiersOf("414")).toEqual(["254", "7040"]);
    expect(qualifiersOf("00")).toEqual([]);
    expect(exclusiveQualifiers("01", "10", "235")).toBe(true);
    expect(exclusiveQualifiers("01", "10", "21")).toBe(false);
  });

  it("checks the key's value and says what the check digit should be", () => {
    expect(checkKeyValue("01", "09506000134376")).toBeNull();
    expect(checkKeyValue("01", "09506000134377")).toBe("The check digit does not match: it should be 6.");
    expect(checkKeyValue("00", "1234")).toBe("4 digits entered; this identifier has 18.");
    expect(checkKeyValue("01", "0950600013437A")).toBe("Use digits only.");
    expect(identify(engine, { ...BASE, value: "9506000134376" }).elementString).toBe("(01)09506000134376");
  });

  it("writes key, qualifiers in path order and attributes in the order chosen, decimals resolved", () => {
    const id: Identification = {
      ...BASE, qualifiers: { "21": "S1001", "10": "B42", "22": "V1" }, attributes: [["17", "271231"], ["3103", "0,5"]],
    };
    const result = identify(engine, id);
    expect(result.elementString).toBe("(01)09506000134376(22)V1(10)B42(21)S1001(17)271231(3103)000500");
    expect(result.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/22/V1/10/B42/21/S1001?17=271231&3103=000500");
    expect(result.resolvedAttributes).toEqual([["17", "271231"], ["3103", "000500"]]);
    expect(identify(engine, { ...BASE, attributes: [["310n", "1,25"]] }).elementString).toBe("(01)09506000134376(3102)000125");
  });

  it("refuses with the resolver's codes, naming the AI as chosen", () => {
    const code = (id: Identification) => {
      try {
        identify(engine, id);
      } catch (error) {
        if (error instanceof AttributeError) return error.code;
        if (error instanceof InputError) return error.message;
      }
      return "ok";
    };
    expect(code({ ...BASE, attributes: [["10", "B42"]] })).toBe("attr.inPath");
    expect(code({ ...BASE, attributes: [["17", "271231"], ["17", "271230"]] })).toBe("attr.duplicate");
    expect(code({ ...BASE, attributes: [["310n", "1,5"], ["3101", "2"]] })).toBe("attr.duplicate");
    expect(code({ ...BASE, attributes: [["17", ""]] })).toBe("attr.valueRequired");
    expect(code({ ...BASE, attributes: [["17", "271200"]] })).toBe("attr.dayZero");
    expect(code({ ...BASE, attributes: [["17", "271331"]] })).toBe("AI (17): The date contains an illegal month of the year.");
    expect(code({ ...BASE, qualifiers: { "10": "B42", "235": "X" } })).toBe(
      "Qualifiers (10) and (235) cannot be used together: (01) takes 22, 10, 21 or 235.",
    );
  });

  it("keeps an AI a GS1 Digital Link URI cannot carry for the element string symbols, and says why the URI cannot", () => {
    // (8200) PRODUCT URL: a valid element string with a GTIN, not a GS1 Digital Link data attribute
    const result = identify(engine, { ...BASE, attributes: [["8200", "https://example.com"]] });
    expect(result.elementString).toBe("(01)09506000134376(8200)https://example.com");
    expect(result.digitalLinkUri).toBe("");
    expect(dataFor("gs1-datamatrix", result)).toBe("(01)09506000134376(8200)https://example.com");
    expect(() => dataFor("dl-qrcode", result)).toThrow(/cannot be one/);
  });

  it("splits what was pasted into the fields, and back", () => {
    const pasted = engine.parse("https://id.gs1.org/01/09506000134376/10/B42/21/S1001?17=271231&3103=000500");
    const fields = fieldsOf(pasted);
    expect(fields).toEqual({
      key: "01", value: "09506000134376", qualifiers: { "10": "B42", "21": "S1001" },
      attributes: [["17", "271231"], ["3103", "000500"]],
    });
    expect(identify(engine, fields).digitalLinkUri).toBe(pasted.digitalLinkUri);
    expect(fieldsOf(engine.parse("(00)106141411234567897(02)09506000134352(37)10")).key).toBe("00");
  });

  it("offers a key's attributes without its own path AIs, with the resolver's hints", () => {
    const offered = attributesForKey("01").map((a) => a.ai);
    expect(offered).not.toContain("10");
    expect(offered).toContain("310n");
    expect(attributeHint(attributeByCode("17")!)).toBe("6 digits · date YYMMDD");
    expect(attributeHint(attributeByCode("3103")!)).toBe("3 decimal places: type with a comma or point (e.g. 1.5) or the digits only");
  });
});

describe("a person's sex typed as a word (backlog 2.1)", () => {
  const PATIENT: Identification = { key: "8018", value: "950600013435200008", qualifiers: {}, attributes: [] };

  it("reads ISO/IEC 5218's code from a word in each of the six languages, whatever its case, accents or full stop", () => {
    const words: [string, string][] = [
      ["Male", "1"], ["man", "1"], ["Masculino", "1"], ["Homem", "1"], ["Hombre", "1"], ["Varón", "1"], ["Masculin", "1"],
      ["Homme", "1"], ["Männlich", "1"], ["MANN", "1"], ["Maschile", "1"], ["Maschio", "1"], ["Uomo", "1"], ["Masc.", "1"],
      ["Female", "2"], ["Woman", "2"], ["Feminino", "2"], ["Mulher", "2"], ["Femenino", "2"], ["Mujer", "2"],
      ["Féminin", "2"], ["Femme", "2"], ["weiblich", "2"], ["Frau", "2"], ["Femminile", "2"], ["Femmina", "2"],
      ["Donna", "2"], ["fem.", "2"],
      ["Unknown", "0"], ["Not known", "0"], ["Desconhecido", "0"], ["Ignorado", "0"], ["Não informado", "0"],
      ["Desconocido", "0"], ["Inconnu", "0"], ["Non renseigné", "0"], ["Unbekannt", "0"], ["Keine Angabe", "0"],
      ["Sconosciuto", "0"],
      ["Not applicable", "9"], ["Não aplicável", "9"], ["Não se aplica", "9"], ["No aplicable", "9"], ["Sans objet", "9"],
      ["Non applicable", "9"], ["Nicht zutreffend", "9"], ["Entfällt", "9"], ["Non applicabile", "9"],
    ];
    for (const [word, code] of words) expect([word, sexCode(word)]).toEqual([word, code]);
    // A digit is kept; a letter is not guessed (M is male in English, female in Spanish); other words are left alone
    for (const text of ["0", "1", "2", "9", "3", "M", "F", "H", "Divers", "Masculino Feminino", "", "femaleish"]) {
      expect(sexCode(text)).toBe(text);
    }
    expect(isSexCode("7252")).toBe(true);
    for (const ai of ["7250", "7253", "10", "422"]) expect(isSexCode(ai)).toBe(false);
  });

  it("writes a word typed for (7252) as its code, says so in the hint, and leaves a letter for the engine to refuse", () => {
    expect(resolveAttribute("7252", "Feminino")).toEqual(["7252", "2"]);
    expect(resolveAttribute("7252", "Männlich")).toEqual(["7252", "1"]);
    expect(resolveAttribute("7252", "2")).toEqual(["7252", "2"]);
    expect(resolveAttribute("7252", "F")).toEqual(["7252", "F"]);
    expect(resolveAttribute("7253", "Feminino")).toEqual(["7253", "Feminino"]); // a surname is not a sex
    expect(attributeHint(attributeByCode("7252")!)).toBe("one digit · sex: 0 not known, 1 male, 2 female, 9 not applicable (ISO 5218), or the word");
    const result = identify(engine, { ...PATIENT, attributes: [["7252", " Mujer "]] });
    expect(result.elementString).toBe("(8018)950600013435200008(7252)2");
    expect(result.digitalLinkUri).toBe("https://id.gs1.org/8018/950600013435200008?7252=2");
    expect(() => identify(engine, { ...PATIENT, attributes: [["7252", "F"]] })).toThrow(/\(7252\): A non-digit/);
    expect(() => identify(engine, { ...PATIENT, attributes: [["7252", "3"]] })).toThrow(/ISO\/IEC 5218/);
  });
});

describe("names and addresses typed as people write them (backlog 1.9)", () => {
  const PATIENT: Identification = { key: "8018", value: "950600013435200008", qualifiers: {}, attributes: [] };

  it("writes a percent-encoded AI's spaces as + and accents as %XX in the code, and leaves every other AI as typed", () => {
    expect(resolveAttribute("7254", "Maria José")).toEqual(["7254", "Maria+Jos%C3%A9"]);
    expect(resolveAttribute("4302", "Rua 25 de Março, 7")).toEqual(["4302", "Rua+25+de+Mar%C3%A7o,+7"]);
    expect(resolveAttribute("7253", "Jo%C3%A3o")).toEqual(["7253", "Jo%C3%A3o"]); // %XX already written: kept
    expect(resolveAttribute("7253", "50% off")).toEqual(["7253", "50%25+off"]);
    expect(resolveAttribute("7253", "A+B")).toEqual(["7253", "A+B"]); // a + already stands for a space
    expect(resolveAttribute("7253", "A%2BB")).toEqual(["7253", "A%2BB"]); // a plus sign meant as itself);
    expect(resolveAttribute("240", "A B é")).toEqual(["240", "A B é"]); // not percent-encoded: for the engine to refuse
    expect(resolveAttribute("310n", "0,5")).toEqual(["3101", "000005"]);
    expect(resolveAttribute("7254", "")).toEqual(["7254", ""]);
    expect(attributeHint(attributeByCode("7254")!)).toBe("up to 40 characters · spaces written as + and accents and other characters as %XX in the code (e.g. é as %C3%A9)");
  });

  it("checks a name typed with spaces and accents through the Syntax Engine, trimmed, and puts it in both forms", () => {
    const result = identify(engine, { ...PATIENT, attributes: [["7254", " Maria José "], ["7253", "Conceição"], ["7250", "19600115"]] });
    expect(result.elementString).toBe("(8018)950600013435200008(7254)Maria+Jos%C3%A9(7253)Concei%C3%A7%C3%A3o(7250)19600115");
    expect(result.digitalLinkUri).toBe("https://id.gs1.org/8018/950600013435200008?7254=Maria%2BJos%25C3%25A9&7253=Concei%25C3%25A7%25C3%25A3o&7250=19600115");
    expect(result.resolvedAttributes).toEqual([["7254", "Maria+Jos%C3%A9"], ["7253", "Concei%C3%A7%C3%A3o"], ["7250", "19600115"]]);
    expect(() => identify(engine, { ...PATIENT, attributes: [["7240", "Maria José"]] })).toThrow(/CSET 82/);
  });

  it("shows a pasted name as people read it, and writes it back the same", () => {
    for (const text of [
      "(8018)950600013435200008(7254)Maria+Jos%C3%A9(7253)50%25",
      "https://id.gs1.org/8018/950600013435200008?7254=Maria%2BJos%25C3%25A9&7253=50%2525",
    ]) {
      const pasted = engine.parse(text);
      const fields = fieldsOf(pasted);
      expect(fields.attributes).toEqual([["7254", "Maria José"], ["7253", "50%"]]);
      expect(identify(engine, fields).elementString).toBe(pasted.elementString);
    }
  });

  it("keeps a pasted name as written when reading it would change what goes back in the code", () => {
    // %2541 reads %41, which would go back as A; lower-case %c3%a3 would go back in capitals; %C3 alone is not UTF-8;
    // %20 would go back as +, %2B as + read as a space; (240) is not percent-encoded
    const pasted = engine.parse("(8018)950600013435200008(7254)%2541(7253)Jo%c3%a3o(7257)Ana%C3");
    expect(fieldsOf(pasted).attributes).toEqual([["7254", "%2541"], ["7253", "Jo%c3%a3o"], ["7257", "Ana%C3"]]);
    expect(identify(engine, fieldsOf(pasted)).elementString).toBe(pasted.elementString);
    const spaces = engine.parse("(8018)950600013435200008(7254)Maria%20Jos%C3%A9(7253)A%2BB");
    expect(fieldsOf(spaces).attributes).toEqual([["7254", "Maria%20Jos%C3%A9"], ["7253", "A%2BB"]]);
    expect(identify(engine, fieldsOf(spaces)).elementString).toBe(spaces.elementString);
    expect(fieldsOf(engine.parse("(01)09506000134376(240)AB%20C")).attributes).toEqual([["240", "AB%20C"]]);
  });
});

describe("qualifiers and attributes as one list (backlog 1.15)", () => {
  it("sends a row with a qualifier's AI to the path, in the path's order whatever the row's place; the rest are attributes", () => {
    const split = splitRows("01", [["17", "271231"], ["21", "S1"], ["10", "B42"], ["3103", "000500"]]);
    expect(split).toEqual({ qualifiers: { "21": "S1", "10": "B42" }, attributes: [["17", "271231"], ["3103", "000500"]] });
    const id = { ...BASE, ...split };
    expect(identify(engine, id, "https://id.gs1.org").digitalLinkUri)
      .toBe("https://id.gs1.org/01/09506000134376/10/B42/21/S1?17=271231&3103=000500");
    expect(rowsOf(id)).toEqual([["10", "B42"], ["21", "S1"], ["17", "271231"], ["3103", "000500"]]);
  });

  it("keeps a qualifier given twice as an attribute, refused there; another key's qualifier is an attribute too", () => {
    const split = splitRows("01", [["10", "B1"], ["10", "B2"]]);
    expect(split).toEqual({ qualifiers: { "10": "B1" }, attributes: [["10", "B2"]] });
    expect(() => identify(engine, { ...BASE, ...split })).toThrow(AttributeError);
    expect(splitRows("414", [["10", "B1"], ["254", "X"]])).toEqual({ qualifiers: { "254": "X" }, attributes: [["10", "B1"]] });
    expect(splitRows("01", [["", ""]])).toEqual({ qualifiers: {}, attributes: [["", ""]] });
  });
});

// A reviewer's comment (9 November 2026): moving (17) above (10) changed neither a GS1 DataMatrix's data nor its text,
// as the batch (10) was always put right after the GTIN. An element string may carry its AIs in any order after the key,
// and a variable-length AI is best last, needing no FNC1 after it; only a GS1 Digital Link URI has an order of its own.
describe("the element string in the order of the rows, the URI in its own (session 55)", () => {
  const ROWS: [string, string][] = [["17", "271231"], ["10", "B42"]];

  it("carries the qualifiers and attributes in the rows' order; the URI's path keeps its own", () => {
    const order = orderOf("01", ROWS);
    expect(order).toEqual(["17", "10"]);
    const id: Identification = { ...BASE, ...splitRows("01", ROWS), order };
    const identified = identify(engine, id, "https://id.gs1.org");
    expect(identified.elementString).toBe("(01)09506000134376(17)271231(10)B42");
    expect(dataFor("gs1-datamatrix", identified)).toBe("(01)09506000134376(17)271231(10)B42");
    expect(dataFor("gs1-128", identified)).toBe("(01)09506000134376(17)271231(10)B42");
    expect(identified.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/10/B42?17=271231");
    expect(rowsOf(id)).toEqual(ROWS);
    // A serial between two attributes, an attribute chosen as 310n: each where its row is
    const many: [string, string][] = [["310n", "0,5"], ["21", "S1"], ["17", "271231"], ["10", "B42"]];
    const manyId: Identification = { ...BASE, ...splitRows("01", many), order: orderOf("01", many)! };
    const manyIdentified = identify(engine, manyId, "https://id.gs1.org");
    expect(manyIdentified.elementString).toBe("(01)09506000134376(3101)000005(21)S1(17)271231(10)B42");
    expect(manyIdentified.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/10/B42/21/S1?3101=000005&17=271231");
    expect(rowsOf(manyId)).toEqual(many);
  });

  it("gives no order for the usual one, so that an identification is written as before", () => {
    expect(orderOf("01", [["10", "B42"], ["21", "S1"], ["17", "271231"]])).toBeUndefined();
    expect(orderOf("01", [["21", "S1"], ["10", "B42"]])).toEqual(["21", "10"]);
    expect(orderOf("01", [])).toBeUndefined();
    expect(orderOf("00", [["02", "09506000134376"], ["37", "24"]])).toBeUndefined();
    // An AI the order does not name follows in its own place; one it names twice is placed once
    const id: Identification = { ...BASE, qualifiers: { "10": "B42", "21": "S1" }, attributes: [["17", "271231"]], order: ["17", "17"] };
    expect(identify(engine, id).elementString).toBe("(01)09506000134376(17)271231(10)B42(21)S1");
  });

  it("keeps the order of what was pasted, and gives it back the same", () => {
    const pasted = fieldsOf(engine.parse("(01)09506000134376(17)271231(10)B42"));
    expect(pasted).toEqual({ ...BASE, qualifiers: { "10": "B42" }, attributes: [["17", "271231"]], order: ["17", "10"] });
    expect(identify(engine, pasted).elementString).toBe("(01)09506000134376(17)271231(10)B42");
    // A URI is in the usual order: nothing to keep
    expect(fieldsOf(engine.parse("https://id.gs1.org/01/09506000134376/10/B42?17=271231"))).not.toHaveProperty("order");
  });

  it("puts the text under a URI's symbol in the URI's order", () => {
    const elements = engine.parse("(01)09506000134376(3101)000005(21)S1(17)271231(10)B42").elements;
    expect(inUriOrder(elements).map((e) => e.ai)).toEqual(["01", "10", "21", "3101", "17"]);
    expect(inUriOrder([])).toEqual([]);
  });
});

describe("the GS1 Digital Link URI's own parameters (backlog 1.17)", () => {
  const ID: Identification = { ...BASE, qualifiers: { "10": "B42" }, attributes: [["17", "271231"], ["20", "12"]] };

  it("follow the data attributes in the query string, percent-encoded; the element string has none", () => {
    const identified = identify(engine, { ...ID, parameters: [["a", "1"], ["b", "2"], ["c", "3"]] }, "https://id.gs1.org");
    expect(identified.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3");
    expect(identified.elementString).toBe("(01)09506000134376(10)B42(17)271231(20)12");
    expect(dataFor("dl-qrcode", identified)).toBe(identified.digitalLinkUri);
    expect(identify(engine, { ...BASE, parameters: [["utm source", "a&b=c é"]] }, "https://id.gs1.org").digitalLinkUri)
      .toBe("https://id.gs1.org/01/09506000134376?utm%20source=a%26b%3Dc%20%C3%A9");
    expect(identify(engine, { ...BASE, parameters: [["", ""]] }, "https://id.gs1.org").digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376");
  });

  it("refuses a name made of digits only, a missing name and a name given twice", () => {
    expect(() => identify(engine, { ...ID, parameters: [["99", "x"]] })).toThrow(/digits only: such names are GS1 Application Identifiers/);
    expect(parametersProblem([["", "x"]])).toMatch(/needs a name/);
    expect(parametersProblem([["a", "1"], ["a", "2"]])).toMatch(/given twice/);
    expect(parametersProblem([["17a", "1"], ["a1", "2"]])).toBeNull();
  });

  it("are taken from a pasted URI, which the Syntax Engine reads without them", () => {
    const text = "https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3";
    expect(uriParameters(text)).toEqual([["a", "1"], ["b", "2"], ["c", "3"]]);
    expect(fieldsOf(engine.parse(text))).toEqual({ ...ID });
    expect(uriParameters("https://example.com/01/09506000134376?utm%20source=a%26b&flag#top")).toEqual([["utm source", "a&b"], ["flag", ""]]);
    expect(uriParameters("(01)09506000134376")).toEqual([]);
  });
});

describe("several keys in one symbol (backlog 1.12)", () => {
  const SSCC = "106141411234567897";
  const values: Record<string, string> = {
    "02": "09506000134376", "37": "10", "01": "09506000134376", "8026": "095060001343760102", "401": "9506000134376ABC",
    "402": "95060001343760000", "403": "ROUTE1", "410": "9506000134376", "8003": "09506000134376123", "8004": "9506000134376KEG1",
  };

  it("draws each pairing the General Specifications give: one key in the URI's path, the others in its query string", () => {
    for (const [key, pairs] of Object.entries(OTHER_KEYS)) {
      for (const { ais } of pairs) {
        const value = key === "00" ? SSCC : "09506000134376";
        const id: Identification = { key, value, qualifiers: {}, attributes: ais.map((ai) => [ai, values[ai]!]) };
        const identified = identify(engine, id, "https://id.gs1.org");
        expect(identified.elementString, ais.join("+")).toBe(`(${key})${value}${ais.map((ai) => `(${ai})${values[ai]}`).join("")}`);
        expect(identified.digitalLinkUri).toBe(`https://id.gs1.org/${key}/${value}?${ais.map((ai) => `${ai}=${values[ai]}`).join("&")}`);
      }
    }
  });

  it("knows the keys and checks a row's check digit; the engine refuses the pairs the tables forbid", () => {
    expect(["00", "01", "02", "8003", "8026", "414"].every(isKey)).toBe(true);
    expect(["37", "10", "403", "410"].some(isKey)).toBe(false);
    expect(checkDigitProblem("02", "09506000134377")).toBe("The check digit does not match: it should be 6.");
    expect(checkDigitProblem("410", "9506000134376")).toBeNull();
    expect(checkDigitProblem("8003", "09506000134376123")).toBeNull(); // more than the digits: the engine checks it
    expect(checkDigitProblem("10", "B1")).toBeNull();
    expect(() => identify(engine, { ...BASE, attributes: [["02", "09506000134376"]] })).toThrow(/invalid to pair AI \(02\) with AI \(01\)/);
    expect(() => identify(engine, { key: "00", value: SSCC, qualifiers: {}, attributes: [["02", "09506000134376"]] }))
      .toThrow(/Required AIs for AI \(02\) are not satisfied: 37/);
  });
});
