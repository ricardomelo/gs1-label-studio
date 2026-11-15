import { ENVIRONMENTS, ERROR_LEVELS, linearSizesFor, linearXDimension, SYMBOLOGIES, type Bearer, type DesignSymbol, type ErrorLevel, type HriPosition, type QrMode } from "@gs1-label-studio/core";
import { formatNumber, t } from "./i18n.ts";
import { OptionGroup } from "./OptionGroup.tsx";
import { BEARER_CHOICES, ERROR_NAMES, HRI_HEIGHTS, HRI_POSITION_NAMES, LINEAR_CHOICES, QR_MODE_NAMES } from "./texts.ts";

// A barcode on a label of one's own with the options of the symbol alone (backlog 6.6; mock-up A of two: a group of its
// own under the barcode's fields, framed on a computer and folded on a phone as the label's options are; B put them
// loose among the barcode's fields). Each option the barcode's own, as the label's options have it until changed. The
// linear symbol beside a 2D one in the same group (mock-up A of two, 15 November 2026: B gave it a group of its own, as
// the symbol alone does): its choice, its size and the bar width reduction its bars then take.

/** What a press takes off every bar, as the label's options offer it (prepress). */
export const REDUCTIONS = [0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];

/** The symbols whose text is their digits, placed where section 5.2.5 puts them: no place or height to choose. */
const DIGITS_PLACED = ["ean13", "ean8", "upca", "upce"];

interface Props {
  element: DesignSymbol;
  /** The label's error correction level, a QR code's until it has its own. */
  labelError: ErrorLevel;
  /** The page's scanning environment: an EAN/UPC beside a 2D symbol where it has an EAN/UPC range. */
  environment: string;
  onChange: (next: Partial<DesignSymbol>) => void;
}

export function DesignerSymbolOptions({ element, labelError, environment, onChange }: Props) {
  const { symbology } = element;
  const placed = element.hri && !DIGITS_PLACED.includes(symbology);
  const qr = symbology === "dl-qrcode" || symbology === "gs1-qrcode";
  const twoD = SYMBOLOGIES[symbology].kind === "matrix";
  // Offered where the environment has an EAN/UPC range; still shown once chosen, so that it can be taken off when the
  // page's environment no longer allows it (the core then says why the label cannot be drawn)
  const beside = twoD && element.linear !== undefined;
  const besidePossible = beside || (twoD && Boolean(ENVIRONMENTS[environment]?.linear));
  const linear = !twoD || beside;
  const itf = symbology === "itf14";
  if (!placed && !qr && !linear && !besidePossible) return null;
  const position = element.hriPosition ?? "below";
  const height = element.hriHeightMm ?? 2.2;
  const error = element.error ?? labelError;
  const summary = [
    placed ? t(HRI_POSITION_NAMES[position]) : null,
    placed ? t(HRI_HEIGHTS.find(([mm]) => mm === height)?.[1] ?? "2.2 mm (default)") : null,
    qr ? t("error correction {level}", { level: error.toUpperCase() }) : null,
    beside ? t(LINEAR_CHOICES[element.linear!]) : null,
    linear && element.reduction ? t("{mm} mm less on every bar", { mm: formatNumber(element.reduction, 3) }) : null,
    itf ? t(BEARER_CHOICES[element.bearer ?? "frame"]) : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="wide">
      <OptionGroup title={t("This barcode's options")} summary={summary}>
        <div className="grid">
          {placed && (
            <>
              <div>
                <label htmlFor="el-hri-position">{t("Text position")}</label>
                <select id="el-hri-position" value={position} onChange={(e) => onChange({ hriPosition: e.target.value as HriPosition })}>
                  {Object.entries(HRI_POSITION_NAMES)
                    .filter(([value]) => !(itf && value === "split"))
                    .map(([value, text]) => (
                      <option key={value} value={value}>
                        {t(text)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="el-hri-height">{t("Text height")}</label>
                <select id="el-hri-height" value={height} onChange={(e) => onChange({ hriHeightMm: Number(e.target.value) })}>
                  {HRI_HEIGHTS.map(([mm, text]) => (
                    <option key={mm} value={mm}>
                      {t(text)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {qr && (
            <div>
              <label htmlFor="el-ecl">{t("Error correction")}</label>
              <select id="el-ecl" value={error} onChange={(e) => onChange({ error: e.target.value as ErrorLevel })}>
                {ERROR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(ERROR_NAMES[level])}
                  </option>
                ))}
              </select>
            </div>
          )}
          {symbology === "dl-qrcode" && (
            <div>
              <label htmlFor="el-qr-mode">{t("Encoding mode")}</label>
              <select
                id="el-qr-mode"
                value={element.qrMode ?? "auto"}
                onChange={(e) => onChange({ qrMode: e.target.value === "auto" ? undefined : (e.target.value as QrMode) })}
              >
                {Object.entries(QR_MODE_NAMES).map(([value, text]) => (
                  <option key={value} value={value}>
                    {t(text)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {besidePossible && (
            <div>
              <label htmlFor="el-linear">{t("Linear barcode beside it")}</label>
              <select
                id="el-linear"
                value={element.linear ?? "none"}
                onChange={(e) => onChange(e.target.value === "none"
                  ? { linear: undefined, linearSize: undefined, reduction: undefined }
                  : { linear: e.target.value as "auto" | "upce" })}
              >
                {Object.entries(LINEAR_CHOICES).map(([value, text]) => (
                  <option key={value} value={value}>
                    {t(text)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {beside && (
            <div>
              <label htmlFor="el-linear-size">{t("Size of the linear barcode")}</label>
              <select
                id="el-linear-size"
                value={element.linearSize ?? ""}
                onChange={(e) => onChange({ linearSize: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">{t("As the 2D symbol: {size} % (X {x} mm)", { size: element.size, x: formatNumber(linearXDimension(environment, element.size), 3) })}</option>
                {linearSizesFor(environment).map((size) => (
                  <option key={size} value={size}>
                    {t("{size} % (X {x} mm)", { size, x: formatNumber(linearXDimension(environment, size), 3) })}
                  </option>
                ))}
              </select>
            </div>
          )}
          {linear && (
            <div>
              <label htmlFor="el-reduction">{t("Bar width reduction")}</label>
              <select id="el-reduction" value={element.reduction ?? 0} onChange={(e) => onChange({ reduction: Number(e.target.value) || undefined })}>
                {REDUCTIONS.map((mm) => (
                  <option key={mm} value={mm}>
                    {mm ? t("{mm} mm less on every bar", { mm: formatNumber(mm, 3) }) : t("None")}
                  </option>
                ))}
              </select>
            </div>
          )}
          {itf && (
            <div>
              <label htmlFor="el-bearer">{t("Bearer bars")}</label>
              <select id="el-bearer" value={element.bearer ?? "frame"} onChange={(e) => onChange({ bearer: e.target.value as Bearer })}>
                {Object.entries(BEARER_CHOICES).map(([value, text]) => (
                  <option key={value} value={value}>
                    {t(text)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </OptionGroup>
    </div>
  );
}
