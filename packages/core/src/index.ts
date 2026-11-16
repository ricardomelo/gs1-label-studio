export { checkDigit, hasValidCheckDigit } from "./checkDigit.ts";
export { DATABAR, SYMBOLOGIES, type Symbology, type SymbologyId } from "./symbologies.ts";
export { encode, EncodeError, QR_MODES, qrModeProblem, stackedRows, widthInModules, type EncodeOptions, type QrMode, type SymbolGeometry } from "./encode.ts";
export { COMMON_DPI, dotsWithin, MM_PER_INCH, snapToDots, type DotSnap } from "./dots.ts";
export { rasterize, type Bitmap, type RasterOptions } from "./raster.ts";
export { bitmapRects, dithered, greyLevels, PICTURE_MAX_SIDE, PICTURE_THRESHOLD, PICTURE_THRESHOLD_MAX, PICTURE_THRESHOLD_MIN, pictureBitmap, pictureFromGrey, pictureOf, redithered, resample, toned, turnedPicture, type Picture } from "./picture.ts";
export { toSvg, type SvgOptions } from "./svg.ts";
export { hasPredefinedLength, parseElementString, predefinedLength, type Element } from "./elementString.ts";
export {
  bitmapToGraphicField,
  fillTemplate,
  graphicFields,
  gs1128FieldData,
  gs1128Modules,
  MAX_GRAPHIC_FIELD_BYTES,
  upcaManufacturerAndProduct,
  gs1128StackDots,
  zplTextAbove,
  zplTestAreaDots,
  zplTestLabel,
  zplLabel,
  zplTemplate,
  zplFontHeight,
  zplLogisticLabel,
  zplPage,
  zplTurnedField,
  ZplUnsupportedError,
  type ZplLabelOptions,
  type ZplPlaceholder,
  type ZplTemplate,
} from "./zpl.ts";
export { HRI_TEXT_MM, hriTextDots, joinPrintFiles, printFileBytes, PrinterUnsupportedError, type PrintFile, type PrintLabelOptions, type PrintPage, type PrintSymbolOptions } from "./printers.ts";
export { tsplLabel, tsplPage, tsplTestLabel, TsplUnsupportedError } from "./tspl.ts";
export { dplLabel, dplPage, dplTestLabel, DplUnsupportedError } from "./dpl.ts";
export { pplaLabel, pplaPage, pplaTestLabel, PplaUnsupportedError, pplbLabel, pplbLogisticLabel, pplbPage, pplbTestLabel, PplbUnsupportedError } from "./argox.ts";
export { eplLabel, eplLogisticLabel, eplPage, eplTestLabel, EplUnsupportedError } from "./epl.ts";
export { PRINTER_LANGUAGES, printLabel, printTestLabel, type PrinterLanguage, type PrinterLanguageInfo } from "./printFile.ts";
export {
  dataFor,
  encodedCount,
  type EncodedCount,
  InputError,
  syntaxEngine,
  SyntaxEngine,
  zeroSuppress,
  type InputKind,
  type EngineFault,
  type ParsedElement,
  type ParsedInput,
} from "./syntax.ts";
export {
  checkEnvironment,
  ENVIRONMENTS,
  environmentsFor,
  linearSizesFor,
  linearXDimension,
  OutOfRange,
  RESOLVER_SYMBOL_OF,
  RESOLVER_SYMBOLS,
  SIZES,
  sizesFor,
  xDimension,
  type Environment,
  type EnvironmentChoice,
  type Range,
  type ResolverSymbol,
} from "./environments.ts";
export {
  baseX,
  minimumBarHeight,
  PARTS,
  SPEC_SYMBOL_NAMES,
  SPECIFICATION_TABLES,
  specificationFor,
  specificationsFor,
  specSizesFor,
  type SpecificationTable,
  type SpecSymbol,
  type SymbolSpecification,
} from "./specifications.ts";
export {
  carries,
  gs1128DataCharacters,
  guidance,
  QUESTIONS,
  TREE,
  walk,
  type Answers,
  type Carries,
  type Guidance,
  type Leaf,
  type QuestionId,
  type Step,
  type SymbolOption,
  type Walk,
} from "./guide.ts";
export {
  ASSISTANT_DATA,
  ASSISTANT_QUESTIONS,
  assistantOutcome,
  assistantQuestion,
  assistantSteps,
  EXAMPLE_VALUES,
  exampleValues,
  examplesLeft,
  examplesStillIn,
  nextAssistantStep,
  normaliseNeed,
  readNeed,
  websiteStem,
  type AssistantAnswers,
  type AssistantOption,
  type AssistantOutcome,
  type AssistantPrint,
  type AssistantQuestion,
  type AssistantRule,
  type AssistantScenario,
  type AssistantStep,
  type OtherKey,
} from "./assistant.ts";
export {
  LABEL_TEMPLATES,
  leaveOut,
  TEMPLATE_SEGMENTS,
  templateById,
  templateFit,
  type LabelTemplate,
  type TemplateFit,
  type TemplateSegment,
} from "./templates.ts";
export { HriFont } from "./hri.ts";
export {
  checkHriPattern, dataTitle, HRI_PATTERNS, HRI_STYLES, hriJoiner, hriText, SECOND_LANGUAGES, secondTitle, type HriFormat, type HriStyle,
  type SecondLanguage,
} from "./hriFormat.ts";
export { DATE_FORMATS, formatDate, MONTH_NAMES, TIME_FORMATS, type DateOptions, type MonthLanguage } from "./dates.ts";
export { pyFixed } from "./pyformat.ts";
export {
  BAR_HEIGHT,
  DIGIT_HEIGHT,
  encodeLinear,
  GUARD_EXTENSION,
  LINEAR_NAMES,
  NotPossible,
  QUIET,
  SMALL_DIGIT,
  symbolFor,
  upceFromUpca,
  type LinearDigit,
  type LinearEncoded,
  type LinearKind,
} from "./linear.ts";
export {
  BARS,
  BEARER_BARS,
  BEARER_FRAME_MM,
  DoesNotFit,
  ERROR_LEVELS,
  HRI_GAP_MM,
  HRI_MAX_MM,
  HRI_MIN_MM,
  HRI_POSITIONS,
  type HriPosition,
  ITF14_RATIO,
  labelSvg,
  layoutLabel,
  QUIET_ZONE,
  reduceBars,
  reductionNote,
  specDescription,
  symbolMatrix,
  type Bearer,
  type ErrorLevel,
  type LabelOptions,
  type LabelText,
  type Turn,
  type Layout,
} from "./layout.ts";
export {
  aiEntry,
  DICTIONARY,
  elementStringAttributes,
  exclusiveQualifiers,
  identifierKeys,
  carriesTime,
  isDateAi,
  isFullYearDate,
  isDigitalLinkKey,
  isPercentEncoded,
  isSexCode,
  formatHint,
  pathAis,
  percentDecode,
  percentEncode,
  primaryKeys,
  qualifiersOf,
  sexCode,
  shownQualifiers,
  SYNTAX_ENGINE,
  SYNTAX_ENGINE_NAME,
  type AiEntry,
  type Attribute,
  type Component,
} from "./dictionary.ts";
export {
  attributeByCode,
  AttributeError,
  attributeHint,
  attributesForKey,
  COMMON_ATTRIBUTES,
  decimalFamilies,
  MAX_ATTRIBUTES,
  offeredAttributes,
  refuseDayZero,
  resolveAttribute,
  resolveDecimal,
  type Offered,
  type Resolved,
} from "./attributes.ts";
export {
  checkKeyValue,
  elementStringOf,
  fieldsOf,
  identify,
  checkDigitProblem,
  isKey,
  OTHER_KEYS,
  parametersProblem,
  inUriOrder,
  orderOf,
  rowsOf,
  splitRows,
  uriParameters,
  withParameters,
  normaliseKeyValue,
  type Identification,
  type Identified,
} from "./identify.ts";
export {
  companyPart,
  defaultFilter,
  encodeEpc,
  EPC_QUALIFIERS,
  EpcError,
  decodeEpc,
  type DecodedEpc,
  epcMissing,
  epcPathOf,
  epcSchemes,
  KEY_SCHEMES,
  MINIMUM,
  PARTITION_LENGTHS,
  urlEscape,
  urnEscape,
  type Epc,
  type EpcScheme,
} from "./epc.ts";
export { aidcRow, decodeEpcPlus, encodeEpcPlus, PLUS_KEYS, PRIORITISED_DATES, type DecodedEpcPlus, type EpcPlus, type EpcPlusElements, type EpcPlusOptions, type EpcPlusScheme } from "./epcPlus.ts";
export { GcpError, gcpLengthOf, GcpTable, parseGcpTable } from "./gcp.ts";
export { crc32, deflate } from "./deflate.ts";
export { CMYK_BLACK, CMYK_BLACK_STROKE, CMYK_WHITE, CROP_MARKS, labelPdf, pdfContent, pdfDocument, type PdfPage } from "./pdf.ts";
export { labelEps } from "./eps.ts";
export { fillOutlines, labelPixels, labelPng, PNG_PIXELS_PER_MODULE, pngAt, pngDpi } from "./png.ts";
export { fileName, labelReadme, labelZip, zipArchive } from "./zip.ts";
export { expectedReads } from "./scan.ts";
export { excelDate, excelNumber, excelTimeOfDay, parseDelimited, parseTableFile, parseXlsx, TableError, unzip, type ExcelTime, type Table } from "./table.ts";
export {
  cellHint,
  checkRows,
  fieldColumns,
  guessColumn,
  guessMapping,
  normaliseCell,
  parameterName,
  rowCells,
  rowIdentification,
  URI_PARAMETER,
  type CheckedRow,
  type ColumnMapping,
  type FixedValue,
} from "./bulk.ts";
export {
  applyEdits,
  correctedCsv,
  editCell,
  reportCounts,
  reportCsv,
  rowStatus,
  toDelimited,
  type CellEdits,
  type ReportCounts,
  type RowStatus,
} from "./report.ts";
export {
  addToPattern,
  DEFAULT_PATTERN,
  generateBatch,
  labelFor,
  patternFields,
  patternName,
  patternProblem,
  upperCaseDomain,
  zplOptionsFor,
  printFileFor,
  printPageFor,
  printWidthDots,
  type BatchFile,
  type BatchRequest,
  type BatchResult,
  type BatchRow,
  type DrawnLabel,
  type LabelDesign,
} from "./batch.ts";
export { fitsSheet, LABEL_SHEETS, sheetCells, sheetPages, sheetProblem, type LabelSheet } from "./sheets.ts";
export {
  MAX_SEQUENCE,
  sequenceHeader,
  sequenceProblem,
  sequenceTable,
  sequenceValues,
  ssccFor,
  withSequence,
  type Sequence,
} from "./sequence.ts";
export { dataCharacters, GS1_128_MAX_DATA, GS1_128_MAX_MM, splitGs1128 } from "./gs1128.ts";
export {
  authenticityProblem,
  base64url,
  generateSigningKey,
  hideAuthenticationCode,
  isoDate,
  jwkThumbprint,
  keyCredential,
  productDataCredential,
  signCredential,
  signedPayload,
  signingKeyFrom,
  signJws,
  verifyJws,
  type AuthenticityDetails,
  type CredentialOptions,
  type SignedDetails,
  type Jwk,
  type SigningKey,
} from "./sign.ts";
export { firstUriRecord, ndefMessage, ndefRecords, ndefRecordUri, ndefUri, ndefUriMessage, URI_PREFIXES, type NdefRecord } from "./ndef.ts";
export {
  bytesToHex, bytesToText, readingFromDecoder, readingFromEpc, readingFromNdef, readingFromText, withControlPictures,
  type DecodedSymbol, type Reading, type ReadingCarrier, type ReadingOptions, type ReadingSource,
} from "./reading.ts";
export { GENERIC_PROFILES, languageOf, moduleChoice, printWidthProblem, profileProblem, type ModuleChoice, type PrinterProfile } from "./printer.ts";
export {
  boxOf, designLabel, imageHeightMm, ROTATIONS, type Rotation, turnedRect, type DesignImage, type DesignPictogram, PICTOGRAMS, PICTOGRAM_NAMES, PICTOGRAM_SEGMENTS, pictogramContours, pictogramLabel, type Contour, type Pictogram, type PictogramName, type PictogramSegment, pictogramSize, columnCell, fillFields, type FieldOptions, type DesignBox, type DesignElement, type DesignedLabel, type DesignOptions, type DesignPage, type DesignLine, type DesignSymbol, type DesignText,
  type PlacedElement, POS_RADIUS_MM,
} from "./design.ts";
export {
  LOGISTIC_SIZES, LOGISTIC_TWO_D, logisticLabel, logisticPage, type LogisticInput, type LogisticLabel, type LogisticSize, type LogisticText, type LogisticTwoD,
} from "./logistic.ts";
export { readWork, WORK_FORMAT, WORK_VERSION, workFile, zplWithWork, type Work, type WorkValue } from "./work.ts";
export { FAULT_GROUPS, FAULTS, fault, SEVERITY_RANK, type Fault, type FaultGroup, type FaultTexts, type Severity } from "./faults.ts";
export { REPAIR_PROVES, type RepairName } from "./repair.ts";
export { check, verdictOf, type CheckContext, type CheckedElement, type CheckResult, type Finding, type Verdict } from "./check.ts";
export { CONTEXT_CODES, contextRules, isPointOfSaleLinear, isTwoD, symbolsOf } from "./checkContext.ts";
export { checkTag, type TagEpc, type TagOutcome } from "./checkTag.ts";
export {
  checkGroup, type GroupColumn, type GroupFinding, type GroupKind, type GroupMember, type GroupResult, type MatrixRow,
} from "./checkGroup.ts";
export { leafOfEnvironment, rowsFor } from "./guide.ts";
export { ENGINE_LINTER_FAULTS, ENGINE_MESSAGE_FAULTS, ENGINE_UNMAPPED, engineMessageId, faultOfEngineMessage } from "./engineFaults.ts";
export { expectedCheckDigit, reorderedDate } from "./checkValues.ts";
export {
  FINDINGS_COLUMNS, findingsCsv, KEY_AIS, keyOf, parseReadingsJson, READINGS_COLUMNS, READINGS_FORMAT, READINGS_VERSION, readingsCsv, readingsJson,
  RECORD_VERDICTS, recordVerdict, surveyCounts, symbologyName, type CheckedRecord, type ReadingRecord, type RecordVerdict, type SurveyCounts,
} from "./readings.ts";
export { REPORT_PAGE, reportPages, reportPdf, textWidth, winAnsiCode, wrapText, type ReportBlock, type ReportDocument } from "./checkReport.ts";
