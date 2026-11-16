import data from "./data/engine_messages.json";

// Every message of the GS1 Barcode Syntax Engine, and every linter's, named by the Check Studio's fault it stands for
// (backlog 7.1 c; the check studio's project, section 4), or listed with the reason none applies: the engine's own
// loading, memory and API errors, the encoder's input for a symbology, scan data, which check() never gives it. A new
// engine release with a new message fails the test until the message is placed in one list or the other.

const MESSAGES = data as unknown as { release: string; messages: Record<string, string>; linters: Record<string, string> };

const LOADING = "the Syntax Dictionary's or the engine's own loading, never a reading's data";
const MEMORY = "the engine's memory, never a reading's data";
const API = "a call to the engine's API that check() never makes";
const SCAN = "scan data: check() reads the symbology identifier itself (group A) and gives the engine the data alone";
const SYMBOL = "the encoder's input for a symbology, which check() never sets: it checks data, it does not encode it";
const GENERATING = "making a GS1 Digital Link URI from element strings, the generators' work, not a reading's";
const NO_GCP = "the engine here has no source for company prefixes; C8 comes from a GCP table the user loads";

/** The engine's messages (tr_EN.h) and the fault each stands for. */
export const ENGINE_MESSAGE_FAULTS: Readonly<Record<string, string>> = {
  AI_DATA_IS_EMPTY: "B8", AI_DATA_HAS_INCORRECT_LENGTH: "B8", AI_VALUE_IS_TOO_SHORT: "B8", AI_VALUE_IS_TOO_LONG: "B8",
  AI_DATA_IS_TOO_LONG: "B8", AI_DATA_EMPTY: "B8", AI_VALUE_PATH_ELEMENT_IS_EMPTY: "B8", AI_VALUE_QUERY_ELEMENT_IN_EMPTY: "B8",
  AI_CONTAINS_ILLEGAL_CARAT_CHARACTER: "B9",
  AI_UNRECOGNISED: "B7", NO_AI_FOR_PREFIX: "B7", AI_PARSE_FAILED: "B7", TOO_MANY_AIS: "B7",
  INSTANCES_OF_AI_HAVE_DIFFERENT_VALUES: "B10", DUPLICATE_AI: "B10",
  DATA_TOO_LONG: "B12",
  REQUIRED_AIS_NOT_SATISFIED: "E1", INVALID_AI_PAIRS: "E2", SERIAL_NOT_PRESENT: "E3",
  NO_GS1_DL_KEYS_FOUND_IN_PATH_INFO: "G1", URI_MISSING_DOMAIN_AND_PATH_INFO: "G1",
  INVALID_KEY_QUALIFIER_SEQUENCE: "G2", TOO_MANY_DL_KEY_QUALIFIERS: "G2", DL_URI_PARSE_FAILED: "G2",
  AI_SHOULD_BE_IN_PATH_INFO: "G3", UNKNOWN_AI_IN_QUERY_PARAMS: "G4", AI_IS_NOT_VALID_DATA_ATTRIBUTE: "G5",
  URI_CONTAINS_ILLEGAL_CHARACTERS: "G6", DECODED_AI_FROM_DL_PATH_INFO_CONTAINS_ILLEGAL_NULL: "G6",
  DECODED_AI_VALUE_FROM_QUERY_PARAMS_CONTAINS_ILLEGAL_NULL: "G6",
  URI_CONTAINS_ILLEGAL_SCHEME: "G8",
};

/** The linters' messages, which the engine gives as "AI (x): …", and the fault each stands for. */
export const ENGINE_LINTER_FAULTS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    ["NON_DIGIT_CHARACTER", "INVALID_CSET82_CHARACTER", "INVALID_CSET39_CHARACTER", "INVALID_CSET32_CHARACTER", "INVALID_CSET64_CHARACTER",
      "INVALID_CSET64_PADDING", "REQUIRES_NON_DIGIT_CHARACTER", "NOT_HYPHEN"].map((id) => [id, "B9"]),
  ),
  INCORRECT_CHECK_DIGIT: "C1", TOO_SHORT_FOR_CHECK_DIGIT: "C1",
  INCORRECT_CHECK_PAIR: "C2", TOO_SHORT_FOR_CHECK_PAIR: "C2", TOO_LONG_FOR_CHECK_PAIR_IMPLEMENTATION: "C2",
  INVALID_GCP_PREFIX: "C8", TOO_SHORT_FOR_GCP: "C8",
  ...Object.fromEntries(
    ["DATE_TOO_SHORT", "DATE_TOO_LONG", "ILLEGAL_MONTH", "ILLEGAL_DAY", "HOUR_WITH_MINUTE_TOO_SHORT", "HOUR_WITH_MINUTE_TOO_LONG",
      "ILLEGAL_HOUR", "ILLEGAL_MINUTE", "ILLEGAL_SECOND", "HOUR_TOO_SHORT", "HOUR_TOO_LONG", "MINUTE_TOO_SHORT", "MINUTE_TOO_LONG",
      "SECOND_TOO_SHORT", "SECOND_TOO_LONG"].map((id) => [id, "D1"]),
  ),
  INVALID_PERCENT_SEQUENCE: "G6",
  // A typed field's own rule (D9): a coupon's structure, a country, a currency, an IBAN, a piece of a total, a position…
  ...Object.fromEntries(Object.keys(MESSAGES.linters).filter((id) => id.startsWith("COUPON_")).map((id) => [id, "D9"])),
  ...Object.fromEntries(
    ["IMPORTER_IDX_MUST_BE_ONE_CHARACTER", "INVALID_IMPORT_IDX_CHARACTER", "ILLEGAL_ZERO_VALUE", "NOT_ZERO", "ILLEGAL_ZERO_PREFIX",
      "NOT_ZERO_OR_ONE", "INVALID_WINDING_DIRECTION", "NOT_ISO3166", "NOT_ISO3166_OR_999", "NOT_ISO3166_ALPHA2", "NOT_ISO4217",
      "IBAN_TOO_SHORT", "IBAN_TOO_LONG", "INVALID_IBAN_CHARACTER", "ILLEGAL_IBAN_COUNTRY_CODE", "INCORRECT_IBAN_CHECKSUM",
      "INVALID_LENGTH_FOR_PIECE_OF_TOTAL", "ZERO_PIECE_NUMBER", "ZERO_TOTAL_PIECES", "PIECE_NUMBER_EXCEEDS_TOTAL", "INVALID_LATITUDE",
      "INVALID_LONGITUDE", "LATITUDE_INVALID_LENGTH", "LONGITUDE_INVALID_LENGTH", "INVALID_MEDIA_TYPE", "INVALID_BIOLOGICAL_SEX_CODE",
      "POSITION_IN_SEQUENCE_MALFORMED", "POSITION_EXCEEDS_END", "INVALID_PACKAGE_TYPE"].map((id) => [id, "D9"]),
  ),
};

/** The messages no fault stands for, each with its reason. */
export const ENGINE_UNMAPPED: Readonly<Record<string, string>> = {
  AI_TABLE_BROKEN_PREFIXES_DIFFER_IN_LENGTH: LOADING,
  MISSING_FNC1_IN_FIRST_POSITION: "check() always gives the FNC1; a missing one is found by the symbology identifier (A1 to A5)",
  FAILED_TO_REALLOC_FOR_KEY_QUALIFIERS: MEMORY, FAILED_TO_MALLOC_FOR_KEY_QUALIFIERS: MEMORY,
  CANNOT_CREATE_DL_URI_WITHOUT_PRIMARY_KEY_AI: GENERATING, DL_URI_TOO_LONG: GENERATING,
  DOMAIN_CONTAINS_ILLEGAL_CHARACTERS: GENERATING,
  UNKNOWN_SYMBOLOGY: API, UNKNOWN_VALIDATION: API, VALIDATION_CANNOT_BE_AMENDED: API,
  PRIMARY_DATA_MUST_BE_N_DIGITS_WITHOUT_CHECK_DIGIT: SYMBOL, PRIMARY_DATA_MUST_BE_N_DIGITS: SYMBOL, PRIMARY_DATA_MUST_BE_ALL_DIGITS: SYMBOL,
  PRIMARY_DATA_CHECK_DIGIT_IS_INCORRECT: SYMBOL, PRIMARY_DATA_IS_TOO_LARGE: SYMBOL,
  MISSING_SYMBOLOGY_IDENTIFIER: SCAN, UNSUPPORTED_SYMBOLOGY_IDENTIFIER: SCAN, PRIMARY_SCAN_DATA_IS_TOO_SHORT: SCAN,
  PRIMARY_MESSAGE_IS_TOO_LONG: SCAN, PRIMARY_MESSAGE_MAY_ONLY_CONTAIN_DIGITS: SCAN, PRIMARY_MESSAGE_CHECK_DIGIT_IS_INCORRECT: SCAN,
  SCAN_DATA_CONTAINS_ILLEGAL_CARAT: SCAN, FAILED_TO_PROCESS_SCAN_DATA: SCAN,
  ...Object.fromEntries(
    ["FORMAT_SPEC_FOR_OPT_COMPONENT_MISSING_RT_SQ_BRACKET", "UNKNOWN_CHARACTER_SET", "FORMAT_SPEC_TOO_SHORT", "AI_LENGTH_TOO_LONG",
      "AI_LENGTH_IS_NOT_A_NUMBER", "UNRECOGNISED_FORMAT_SPECIFICATION", "NUMBER_OF_LINTERS_EXCEEDS_IMPL_LIMIT", "UNKNOWN_LINTER",
      "ENTRY_TOO_LONG", "SYNTAX_DICTIONARY_CAPACITY_TOO_SMALL", "AI_RANGE_HAS_WRONG_WIDTH", "AIS_IN_RANGE_MUST_HAVE_EQUAL_WIDTH",
      "AIS_MUST_BE_NUMERIC", "AI_RANGE_PARTS_MAY_ONLY_DIFFER_IN_LAST_DIGIT", "AI_RANGE_END_MUST_EXCEED_RANGE_START", "AI_HAS_WRONG_WIDTH",
      "AI_MUST_BE_NUMERIC", "AIS_MUST_BE_IN_ASCENDING_ORDER", "TRUNCATED_AFTER_AI", "TRUNCATED_AFTER_FLAGS",
      "NUMBER_OF_AI_COMPONENTS_EXCEEDS_IMPL", "AI_IS_MISSING_COMPONENTS", "ONLY_FINAL_COMPONENT_MAY_HAVE_VARIABLE_LENGTH",
      "MANDATORY_COMPONENT_CANNOT_FOLLOW_OPTIONAL_COMPONENTS", "NO_FNC1_AI_MUST_BE_PREDEFINED_LENGTH",
      "ATTRIBUTE_NAME_REQUIRED_ON_LHS_OF_ASSIGNMENT", "ATTRIBUTE_NAME_CONTAINS_ILLEGAL_CHARACTERS",
      "ATTRIBUTE_VALUE_CONTAINS_ILLEGAL_CHARACTERS", "ATTRIBUTE_VALUE_REQUIRED_ON_RHS_OF_ASSIGNMENT", "ATTRIBUTE_AI_IS_NOT_WELL_FORMED",
      "SINGLETON_ATTRIBUTE_NAME_CONTAINS_ILLEGAL_CHARACTERS", "ATTRIBUTES_TOO_LONG", "FAILED_TO_ALLOCATE_MEMORY_FOR_ATTRS",
      "TITLE_CONTAINS_ILLEGAL_CHARACTERS", "FAILED_TO_ALLOCATE_MEMORY_FOR_TITLE", "FAILED_TO_ALLOCATE_AI_TABLE", "CANNOT_READ_FILE",
      "SYNTAX_DICTIONARY_LINE_EXCEEDS_IMPL", "SYNTAX_DICTIONARY_LINE_ERROR"].map((id) => [id, LOADING]),
  ),
  GCP_DATASOURCE_OFFLINE: NO_GCP,
};

/** What a message that is not the engine's stands for: a typed field's own rule, the widest code (D9). */
const OTHER_LINTER = "D9";

/** A message's template as a pattern: {p1} and {p2} stand for any text. */
const pattern = (template: string) =>
  new RegExp(`^${template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{p\d\\\}/g, "(.*?)")}$`);

const MESSAGE_PATTERNS = Object.entries(MESSAGES.messages)
  .filter(([id]) => id !== "AI_LINTER_ERROR")
  .map(([id, template]) => ({ id, re: pattern(template), holes: (template.match(/\{p\d\}/g) ?? []).length }))
  // A template without a placeholder first: "Primary data must be all digits" is not "… must be {p1} digits"
  .sort((a, b) => a.holes - b.holes);
const LINTER_IDS = new Map(Object.entries(MESSAGES.linters).map(([id, text]) => [text, id]));

/** Which message of the engine this is: its identifier, and the linter's for "AI (x): …". */
export function engineMessageId(message: string): { message: string; linter?: string } | null {
  const linted = /^AI \(\d{2,4}\): (.*)$/.exec(message);
  const linter = linted ? LINTER_IDS.get(linted[1]!) : undefined;
  if (linter) return { message: "AI_LINTER_ERROR", linter };
  const found = MESSAGE_PATTERNS.find(({ re }) => re.test(message));
  return found ? { message: found.id } : null;
}

/**
 * The fault an engine message stands for, from the lists above; for the AI it concerns, a length or a character a
 * GTIN or a batch or serial number has its own code: a GTIN-13, -12 or -8 under AI (01) not padded (C5), a batch or
 * serial number too long or with a character outside the set (D6). D9 when the message is not the engine's.
 */
export function faultOfEngineMessage(message: string, ai: string | null = null, value = ""): string {
  const id = engineMessageId(message);
  const code = !id ? OTHER_LINTER : id.linter ? (ENGINE_LINTER_FAULTS[id.linter] ?? OTHER_LINTER) : (ENGINE_MESSAGE_FAULTS[id.message] ?? OTHER_LINTER);
  if (code === "B8" && (ai === "01" || ai === "02") && /^(?:\d{8}|\d{12,13})$/.test(value)) return "C5";
  if ((code === "B8" || code === "B9") && (ai === "10" || ai === "21")) return "D6";
  return code;
}
