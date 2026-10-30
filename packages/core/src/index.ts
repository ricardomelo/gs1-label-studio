export { checkDigit, hasValidCheckDigit } from "./checkDigit.ts";
export { DATABAR, SYMBOLOGIES, type Symbology, type SymbologyId } from "./symbologies.ts";
export { encode, EncodeError, stackedRows, widthInModules, type EncodeOptions, type SymbolGeometry } from "./encode.ts";
export { COMMON_DPI, dotsWithin, MM_PER_INCH, snapToDots, type DotSnap } from "./dots.ts";
export { rasterize, type Bitmap, type RasterOptions } from "./raster.ts";
export { toSvg, type SvgOptions } from "./svg.ts";
export { hasPredefinedLength, parseElementString, type Element } from "./elementString.ts";
export {
  bitmapToGraphicField,
  fillTemplate,
  graphicFields,
  gs1128FieldData,
  MAX_GRAPHIC_FIELD_BYTES,
  upcaManufacturerAndProduct,
  zplLabel,
  zplTemplate,
  ZplUnsupportedError,
  type ZplLabelOptions,
  type ZplPlaceholder,
  type ZplTemplate,
} from "./zpl.ts";
export {
  dataFor,
  encodedCount,
  type EncodedCount,
  InputError,
  syntaxEngine,
  SyntaxEngine,
  zeroSuppress,
  type InputKind,
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
export { HriFont } from "./hri.ts";
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
  type Layout,
} from "./layout.ts";
export {
  aiEntry,
  DICTIONARY,
  elementStringAttributes,
  exclusiveQualifiers,
  identifierKeys,
  isDigitalLinkKey,
  formatHint,
  pathAis,
  primaryKeys,
  qualifiersOf,
  shownQualifiers,
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
  resolveDecimal,
  type Offered,
  type Resolved,
} from "./attributes.ts";
export {
  checkKeyValue,
  elementStringOf,
  fieldsOf,
  identify,
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
export { GcpError, gcpLengthOf, GcpTable, parseGcpTable } from "./gcp.ts";
export { crc32, deflate } from "./deflate.ts";
export { CMYK_BLACK, CMYK_WHITE, labelPdf, pdfContent } from "./pdf.ts";
export { labelEps } from "./eps.ts";
export { labelPixels, labelPng, PNG_PIXELS_PER_MODULE, pngAt, pngDpi } from "./png.ts";
export { fileName, labelReadme, labelZip, zipArchive } from "./zip.ts";
export { expectedReads } from "./scan.ts";
export { excelDate, excelNumber, parseDelimited, parseTableFile, parseXlsx, TableError, unzip, type Table } from "./table.ts";
export {
  cellHint,
  checkRows,
  guessColumn,
  guessMapping,
  normaliseCell,
  rowIdentification,
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
