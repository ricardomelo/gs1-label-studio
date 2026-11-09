import { attributeByCode, AttributeError } from "./attributes.ts";
import {
  aiEntry,
  carriesTime,
  identifierKeys,
  isDateAi,
  isFullYearDate,
  isPercentEncoded,
  isSexCode,
  percentEncode,
  qualifiersOf,
  sexCode,
} from "./dictionary.ts";
import { checkKeyValue, identify, normaliseKeyValue, parametersProblem, type Identification, type Identified } from "./identify.ts";
import { InputError, type SyntaxEngine } from "./syntax.ts";
import type { Table } from "./table.ts";

// Bulk generation (backlog 2.1): which AI each column of a table holds — guessed from its header, chosen by the
// person —, values the same on every row, and each row as the editor's identification, checked by the GS1 Barcode
// Syntax Engine as a single code is.

/**
 * Each column's AI (or a decimal family such as "310n"), `URI_PARAMETER` for one of the GS1 Digital Link URI's own
 * parameters, or null for a column left out.
 */
export type ColumnMapping = (string | null)[];

/**
 * A column holding one of the GS1 Digital Link URI's own parameters (backlog 1.17 in bulk), named by its header
 * (`parameterName`): `utm_source` with folheto on a row gives `…?utm_source=folheto` after the data attributes.
 */
export const URI_PARAMETER = "?";

/** The parameter a header names: the header trimmed, without a `?` before it or an `=` after it (`?lang`, `lang=`). */
export function parameterName(header: string): string {
  return header.trim().replace(/^\?\s*/, "").replace(/\s*=$/, "");
}

/** An AI and a value that every row carries, e.g. ["422", "076"]. */
export type FixedValue = [ai: string, value: string];

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words people put in headers, in English, Portuguese, Spanish, French, German and Italian, without their accents (data,
// not the interface's language: ADR 0003). Each list starts with a single word: the web's catalogue test would take a
// first text with a space for a message to translate.
const SYNONYMS: Record<string, string[]> = {
  "01": ["gtin", "gtin 14", "gtin 13", "ean", "ean 13", "ean13", "upc", "barcode", "codigo de barras", "cod barras", "codigo ean",
    "code barre", "code barres", "code a barres", "strichcode", "codice a barre", "codice ean"],
  "00": ["sscc"],
  "10": ["batch", "lot", "batch lot", "lot number", "batch number", "lote", "numero do lote", "numero de lote",
    "numero de lot", "charge", "chargennummer", "charge nr", "chargen nr", "lotto", "numero lotto", "numero di lotto"],
  "21": ["serial", "serial number", "serial no", "sn", "serie", "numero de serie", "n serie", "no serie",
    "seriennummer", "serien nr", "numero di serie"],
  "17": ["expiry", "expiry date", "expiration", "expiration date", "use by", "validade", "data de validade", "vencimento",
    "data de vencimento", "caducidad", "fecha de caducidad", "vencimiento", "date de peremption", "peremption", "dlc",
    "date limite de consommation", "verfallsdatum", "verfall", "verwendbar bis", "ablaufdatum", "scadenza", "data di scadenza"],
  "15": ["best before", "best by", "best before date", "consumir antes de", "consumir preferencialmente antes de", "dluo", "ddm",
    "date de durabilite minimale", "mhd", "mindesthaltbarkeitsdatum", "mindestens haltbar bis", "tmc",
    "da consumarsi preferibilmente entro"],
  "11": ["production date", "manufacturing date", "manufacture date", "prod date", "fabricacao", "data de fabricacao",
    "fecha de fabricacion", "date de fabrication", "herstelldatum", "produktionsdatum", "data di produzione",
    "data di fabbricazione"],
  "13": ["pack date", "packaging date", "packing date", "embalagem", "data de embalagem", "data de embalamento",
    "date d emballage", "date de conditionnement", "verpackungsdatum", "packdatum", "data di confezionamento"],
  "16": ["sell by", "sell by date", "date limite de vente", "verkaufen bis", "da vendere entro"],
  "22": ["cpv", "variant", "variante", "product variant"],
  "310n": ["net weight", "net weight kg", "weight kg", "peso", "peso kg", "peso liquido", "peso liquido kg", "peso neto",
    "poids net", "poids", "poids net kg", "nettogewicht", "nettogewicht kg", "gewicht", "gewicht kg", "peso netto",
    "peso netto kg"],
  "37": ["count", "quantity", "qty", "quantidade", "qtd", "cantidad", "quantite", "qte", "menge", "anzahl", "quantita"],
  "414": ["gln", "location", "localizacao", "localisation", "standort", "ubicazione"],
  "422": ["origin", "country of origin", "origem", "pais de origem", "pais de origen",
    "pays d origine", "origine", "ursprungsland", "herkunftsland", "paese di origine"],
  // A patient's wristband: GSRN alone is the recipient's, (8018), as the patient's data below require it. Left out, as
  // they may hold something else: a bare "name" (nome, nombre, nom: a full name, a surname or a given name), "patient
  // id" (often a hospital's own number), "apelido" (a surname in Portugal, a nickname in Brazil), "fall" (a case in
  // German, a season in English).
  "8018": ["gsrn", "patient gsrn", "gsrn do paciente", "gsrn del paciente", "gsrn du patient", "gsrn des patienten",
    "gsrn del paziente"],
  "8019": ["srin", "service relation instance number", "episode", "encounter", "atendimento", "numero do atendimento",
    "episodio", "numero de episodio", "sejour", "numero de sejour", "fallnummer", "numero di ricovero"],
  "7250": ["dob", "date of birth", "birth date", "birthdate", "data de nascimento", "nascimento", "dt nascimento",
    "data nascimento", "fecha de nacimiento", "nacimiento", "f nacimiento", "date de naissance", "naissance",
    "geburtsdatum", "geb datum", "data di nascita", "nascita"],
  "7251": ["geburtszeitpunkt", "dob time", "date and time of birth", "birth date and time", "time of birth", "data e hora de nascimento",
    "hora de nascimento", "fecha y hora de nacimiento", "hora de nacimiento", "date et heure de naissance",
    "heure de naissance", "geburtsdatum und uhrzeit", "geburtszeit", "data e ora di nascita",
    "ora di nascita"],
  "7252": ["sex", "biological sex", "gender", "sexo", "sexo biologico", "genero", "sexe", "sexe biologique",
    "geschlecht", "biologisches geschlecht", "sesso", "sesso biologico"],
  "7253": ["surname", "family name", "last name", "sobrenome", "apellido", "apellidos", "nom de famille",
    "nachname", "familienname", "cognome"],
  "7254": ["forename", "given name", "first name", "primeiro nome", "prenome", "nome proprio", "nombre de pila",
    "prenom", "vorname", "nome di battesimo"],
  "7255": ["suffix", "name suffix", "sufixo", "sufijo", "suffixe", "namenszusatz", "suffisso"],
  "7256": ["patientenname", "full name", "patient name", "patient s name", "nome completo", "nome do paciente", "nombre completo",
    "nombre del paciente", "nom complet", "nom du patient", "vollstandiger name", "name des patienten",
    "nome del paziente"],
  "7257": ["patientenadresse", "patient address", "patient s address", "home address", "endereco do paciente",
    "direccion del paciente", "adresse du patient", "adresse des patienten", "indirizzo del paziente"],
  "7258": ["geburtsreihenfolge", "birth sequence", "birth order", "ordem de nascimento", "orden de nacimiento",
    "rang de naissance", "ordine di nascita"],
  "7259": ["baby", "baby of", "bebe de", "baby von", "neonato di"],
};

const BY_WORDS = new Map<string, string>(Object.entries(SYNONYMS).flatMap(([ai, words]) => words.map((w) => [w, ai])));

/**
 * The AI a header names: written as an AI ("(10)", "AI 17", "3103", "(01) GTIN", a decimal family "(310n)"), as its
 * GS1 data title ("BATCH/LOT"), or in the common words of the synonyms above ("Lote", "Validade"). An AI in brackets
 * may be followed by any words; without brackets, only after a dash or a colon ("17 - expiry"), so that "10 kg" is not
 * read as (10). Null when nothing matches.
 */
export function guessColumn(header: string): string | null {
  const text = header.trim();
  const ai = (/^(?:ai\s*)?\((\d{2,4}|\d{3}n)\)/i.exec(text) ??
    /^(?:ai\s*)?(\d{2,4}|\d{3}n)\s*(?:[-:–—].*)?$/i.exec(text))?.[1]?.toLowerCase();
  if (ai && (ai.endsWith("n") ? attributeByCode(ai)?.family : aiEntry(ai))) return ai;
  const words = plain(header);
  const known = BY_WORDS.get(words);
  if (known) return known;
  for (const [code, title] of dataTitles()) if (title === words) return code;
  return null;
}

let titles: Map<string, string> | undefined;

/** A patient's data, (7250) DOB to (7259) BABY, whose GS1 data titles a header may also be. */
const PATIENT = ["7250", "7251", "7252", "7253", "7254", "7255", "7256", "7257", "7258", "7259"];

/**
 * The GS1 data titles of the keys, their qualifiers, the common attributes and a patient's data, in plain words ("batch
 * lot", "dob").
 */
function dataTitles(): Map<string, string> {
  titles ??= new Map(
    [...identifierKeys().flatMap((key) => [key, ...qualifiersOf(key)]), "11", "13", "15", "16", "17", "30", "37", "422",
      ...PATIENT]
      .map((ai) => [ai, plain(aiEntry(ai)?.title ?? "")] as [string, string])
      .filter(([, title]) => title),
  );
  return titles;
}

/**
 * The guessed mapping of every header; a column whose AI an earlier column already took is left out. A header written
 * as a parameter of the URI, `?name` or `name=` with a letter in the name, goes to `URI_PARAMETER`.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const taken = new Set<string>();
  return headers.map((header) => {
    const text = header.trim();
    if (/^\?|=$/.test(text) && /\D/.test(parameterName(text))) return URI_PARAMETER;
    const ai = guessColumn(header);
    if (!ai || taken.has(ai)) return null;
    taken.add(ai);
    return ai;
  });
}

/**
 * A cell as the AI takes it. Dates — AIs whose value starts with YYMMDD — are also read as YYYY-MM-DD (what an Excel
 * date becomes), day first as DD/MM/YYYY or DD/MM/YY (also with "-" or "."), and given as YYMMDD. A time HH:MM after a
 * date is kept as HHMM when the AI carries one (`carriesTime`), as (7003), (4324) or (8008), with its seconds when the
 * AI takes them, as (8008); else it is dropped. A time may be on a 12-hour clock, followed by AM or PM (also am, a.m.,
 * p.m.): 12 AM is 00, 12 PM is 12. Midnight with its seconds, 00:00:00, is how a date alone is exported, so an AI whose
 * time is optional, as (7011), leaves it out. An AI whose second part is a date too, as (7007)'s harvest period, also
 * takes two dates, a range with a dash, "to", "a", "al", "até", "hasta", "au", "à" or "bis" between them (or spaces alone),
 * as YYMMDDYYMMDD.
 * A date whose year has four digits, YYYYMMDD as (7250)'s (`isFullYearDate`), is read from YYYY-MM-DD and DD/MM/YYYY
 * alone, since a date of birth's century cannot be guessed. A name or an address whose AI is percent-encoded
 * (`isPercentEncoded`), as (7254) GIVEN NAME or (4302) SHIP TO ADD1, has its spaces written as plus signs and its other
 * characters outside CSET 82 as %XX (`percentEncode`: `Maria Conceição` → `Maria+Concei%C3%A7%C3%A3o`). A person's sex, (7252) BIO SEX (`isSexCode`),
 * is also read from a word in any of the six languages (`sexCode`: `Feminino` → 2), not from a letter. Anything else is
 * left as it is, for the Syntax Engine to judge.
 */
export function normaliseCell(ai: string, raw: string): string {
  const value = raw.trim();
  if (isPercentEncoded(ai)) return percentEncode(value);
  if (isSexCode(ai)) return sexCode(value);
  if (!isDateAi(ai)) return value;
  if (/^\d{6}$/.test(value)) return value;
  const date = dateCell(ai, value);
  if (date !== undefined) return date;
  const parts = aiEntry(ai)?.components ?? [];
  if (parts[1]?.linters.includes("yymmdd")) {
    const range = /^(.+?)(?:\s*[–—]\s*|\s+-\s+|\s+(?:to|a|al|até|hasta|au|à|bis)\s+|\s+)(.+)$/i.exec(value);
    const half = (text: string) => (/^\d{6}$/.test(text) ? text : dateCell(ai, text, false));
    const [first, second] = range ? [half(range[1]!), half(range[2]!)] : [];
    if (first && second) return first + second;
  }
  return value;
}

/** A time after a date, HH:MM or HH:MM:SS, perhaps on a 12-hour clock with AM or PM (also am, a.m., p.m.). */
const CLOCK = /(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?\s?m\.?)?)?/.source;

/** A date, with its time if the AI carries one (see `normaliseCell`), or undefined when the cell is not a date. */
function dateCell(ai: string, value: string, timed = true): string | undefined {
  const full = isFullYearDate(ai);
  const clock = timed ? CLOCK : "";
  const time = (hh?: string, mi?: string, ss?: string, half?: string): string | undefined => {
    const parts = aiEntry(ai)?.components.slice(1) ?? [];
    if (!hh || !carriesTime(ai)) return "";
    if (half) {
      const hour = Number(hh);
      if (hour < 1 || hour > 12) return undefined; // 0 AM or 13 PM: left for the Syntax Engine to refuse
      hh = String((hour % 12) + (/p/i.test(half) ? 12 : 0));
    }
    hh = hh.padStart(2, "0");
    if (hh === "00" && mi === "00" && ss === "00" && parts[0]?.optional) return "";
    return hh + mi + (ss && parts.some((c) => c.linters.includes("ss")) ? ss : "");
  };
  const iso = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${clock}$`, "i").exec(value);
  if (iso) {
    const at = time(iso[4], iso[5], iso[6], iso[7]);
    return at === undefined ? undefined : (full ? iso[1]! : iso[1]!.slice(2)) + iso[2] + iso[3] + at;
  }
  const dayFirst = new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4}|\\d{2})${clock.replace("[ T]", " ")}$`, "i").exec(value);
  if (dayFirst) {
    const [, d, m, y, hh, mi, ss, half] = dayFirst;
    if (full && y!.length === 2) return undefined;
    const at = time(hh, mi, ss, half);
    return at === undefined ? undefined : (full ? y! : y!.slice(-2)) + m!.padStart(2, "0") + d!.padStart(2, "0") + at;
  }
  return undefined;
}

/**
 * A row as the editor's identification: the first column holding a primary key gives the key (a key among the fixed
 * values too), its qualifiers go to the qualifiers, the rest are attributes in the columns' order, the fixed values
 * last; a column of a parameter of the URI gives a parameter named by its header (`headers`). Empty cells are left out.
 */
export function rowIdentification(row: string[], mapping: ColumnMapping, fixed: FixedValue[] = [],
  headers: readonly string[] = []): Identification {
  const pairs: [string, string][] = [];
  const parameters: [string, string][] = [];
  mapping.forEach((ai, column) => {
    const value = row[column]?.trim() ?? "";
    if (ai === URI_PARAMETER) {
      if (value) parameters.push([parameterName(headers[column] ?? ""), value]);
    } else if (ai && value) pairs.push([ai, normaliseCell(ai, value)]);
  });
  for (const [ai, value] of fixed) if (ai && value.trim()) pairs.push([ai, normaliseCell(ai, value)]);
  const keys = new Set(identifierKeys());
  const keyPair = pairs.find(([ai]) => keys.has(ai));
  if (!keyPair) {
    const keyColumn = mapping.findIndex((ai) => ai && keys.has(ai));
    throw new InputError(keyColumn >= 0
      ? `The key's column is empty on this row.`
      : "No column holds a key, such as (01) GTIN or (00) SSCC: choose which one does.");
  }
  const [key, value] = keyPair;
  const qualifiers = new Set(qualifiersOf(key));
  const id: Identification = { key, value, qualifiers: {}, attributes: [], ...(parameters.length ? { parameters } : {}) };
  for (const pair of pairs) {
    if (pair === keyPair) continue;
    const [ai, v] = pair;
    if (qualifiers.has(ai) && !(ai in id.qualifiers)) id.qualifiers[ai] = v;
    else id.attributes.push([ai, v]);
  }
  return id;
}

/**
 * A row's cells by their column's header, as a label of one's own's `{column}` fields read them (backlog 4.2): each
 * cell trimmed; a column without a header is left out, and of two columns with one header the first is kept.
 */
export function rowCells(headers: readonly string[], row: readonly string[]): Record<string, string> {
  const cells: Record<string, string> = {};
  headers.forEach((header, column) => {
    if (header.trim() && !(header in cells)) cells[header] = row[column]?.trim() ?? "";
  });
  return cells;
}

/**
 * The columns a label of one's own offers as `{column}` fields: those holding no AI (an AI's column is its `{AI}`
 * field), by their header trimmed, the first of two alike; a header a field cannot name (empty, with braces, or read as
 * an AI such as "10") is left out.
 */
export function fieldColumns(headers: readonly string[], mapping: ColumnMapping): { column: number; name: string }[] {
  const seen = new Set<string>();
  return headers.flatMap((header, column) => {
    const name = header.trim();
    const key = name.toLowerCase();
    if (mapping[column] || !name || /[{}]/.test(name) || /^\d{2,4}(:|$)/.test(name) || seen.has(key)) return [];
    seen.add(key);
    return [{ column, name }];
  });
}

export interface CheckedRow {
  /** 1-based, as a spreadsheet numbers rows after the header: the first data row is row 2. */
  row: number;
  id?: Identification;
  identified?: Identified;
  error?: string;
  /** The columns the error is about (backlog 2.2), when it names an AI a column holds or concerns the key. */
  columns?: number[];
  /** The values for every row the error is about, by their index among the fixed values. */
  fixedAt?: number[];
  /** What may have spoilt the value at fault before it reached the studio (Excel's 15 digits, scientific notation). */
  hint?: string;
}

/** Every row identified and checked by the Syntax Engine, or the reason it cannot be, with the columns at fault. */
export function checkRows(engine: SyntaxEngine, table: Table, mapping: ColumnMapping, fixed: FixedValue[] = [],
  stem: string | null = null): CheckedRow[] {
  const keys = new Set(identifierKeys());
  const keyColumns = mapping.flatMap((ai, column) => (ai && keys.has(ai) ? [column] : []));
  return table.rows.map((cells, index) => {
    const row = index + 2;
    let id: Identification | undefined;
    try {
      id = rowIdentification(cells, mapping, fixed, table.headers);
      return { row, id, identified: identify(engine, id, stem) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const keyProblem = !id || checkKeyValue(id.key, normaliseKeyValue(id.key, id.value)) !== null;
      const ais = keyProblem ? [id?.key ?? ""] : faultyAis(error);
      // A parameter's name comes from its header: a refusal of it is about the parameters' columns filled on the row.
      const parameterProblem = !keyProblem && id?.parameters && message === parametersProblem(id.parameters);
      const columns = parameterProblem
        ? mapping.flatMap((m, column) => (m === URI_PARAMETER && cells[column]?.trim() ? [column] : []))
        : keyProblem && !id ? keyColumns : columnsOf(ais, mapping, cells);
      const fixedAt = fixed.flatMap(([ai], at) => (ai && ais.some((a) => sameAi(a, ai)) ? [at] : []));
      const hint = columns.map((column) => cellHint(cells[column] ?? "", Boolean(table.sheet))).find((h) => h);
      return {
        row, ...(id ? { id } : {}), error: message, columns,
        ...(fixedAt.length && !columns.length ? { fixedAt } : {}), ...(hint ? { hint } : {}),
      };
    }
  });
}

/** The AIs an error is about: "AI (17): …", "(310n): at most 5 decimal places", or the AI before the engine's mark. */
function faultyAis(error: unknown): string[] {
  if (error instanceof AttributeError && typeof error.params.ai === "string") return [error.params.ai];
  const message = error instanceof Error ? error.message : String(error);
  // The AIs before the first colon are the subject ("Qualifiers (22) and (235) cannot be used together: (01) takes…").
  const named = (text: string) => [...text.matchAll(/\((\d{2,4}n?)\)/g)].map((m) => m[1]!);
  const subject = named(message.split(": ")[0]!);
  if (subject.length) return subject;
  if (named(message).length) return named(message);
  const markup = error instanceof InputError ? error.markup : "";
  const before = markup.slice(0, Math.max(0, markup.indexOf("|")));
  const last = [...before.matchAll(/\((\d{2,4})\)/g)].at(-1);
  return last ? [last[1]!] : [];
}

/** "3103" is in the column of its decimal family "310n"; a family is in a column of one of its members. */
function sameAi(a: string, b: string): boolean {
  const family = (ai: string) => (/^3[1-69]\d[\dn]$/.test(ai) ? ai.slice(0, 3) : ai);
  return a === b || (a.length === 4 && b.length === 4 && family(a) === family(b) && (a.endsWith("n") || b.endsWith("n")));
}

/** The columns holding these AIs on this row (a column left empty on the row does not count). */
function columnsOf(ais: string[], mapping: ColumnMapping, cells: string[]): number[] {
  return mapping.flatMap((ai, column) => (ai && cells[column]?.trim() && ais.some((a) => sameAi(a, ai)) ? [column] : []));
}

/**
 * Why a cell's value may not be what was typed: Excel keeps 15 significant digits of a number, so an SSCC typed as a
 * number loses its last digits (they come back as zeros); and a CSV saved by Excel may write a long number in
 * scientific notation.
 */
export function cellHint(value: string, fromWorkbook: boolean): string | undefined {
  const text = value.trim();
  if (/^\d+(?:[.,]\d+)?E\+?\d+$/i.test(text)) {
    return "This value is in scientific notation, as a spreadsheet writes a long number: format the column as text, " +
      "type the codes again and save the file again.";
  }
  if (fromWorkbook && /^\d{15}0+$/.test(text) && text.length > 15) {
    return "Excel keeps 15 digits of a number, so the last digits of this code became zeros: format the column as " +
      "text in Excel and type the codes again.";
  }
  return undefined;
}
