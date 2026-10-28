export { checkDigit, hasValidCheckDigit } from "./checkDigit.ts";
export { SYMBOLOGIES, type Symbology, type SymbologyId } from "./symbologies.ts";
export { encode, EncodeError, widthInModules, type EncodeOptions, type SymbolGeometry } from "./encode.ts";
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
  DoesNotFit,
  ERROR_LEVELS,
  labelSvg,
  layoutLabel,
  symbolMatrix,
  type ErrorLevel,
  type LabelOptions,
  type LabelText,
  type Layout,
} from "./layout.ts";
