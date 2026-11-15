import { ERROR_LEVELS, SYMBOLOGIES, type Bearer, type DesignSymbol, type ErrorLevel, type HriPosition, type QrMode } from "@gs1-label-studio/core";
import { formatNumber, t } from "./i18n.ts";
import { OptionGroup } from "./OptionGroup.tsx";
import { BEARER_CHOICES, ERROR_NAMES, HRI_HEIGHTS, HRI_POSITION_NAMES, QR_MODE_NAMES } from "./texts.ts";

// A barcode on a label of one's own with the options of the symbol alone (backlog 6.6; mock-up A of two: a group of its
// own under the barcode's fields, framed on a computer and folded on a phone as the label's options are; B put them
// loose among the barcode's fields). Each option the barcode's own, as the label's options have it until changed.

/** What a press takes off every bar, as the label's options offer it (prepress). */
export const REDUCTIONS = [0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];

/** The symbols whose text is their digits, placed where section 5.2.5 puts them: no place or height to choose. */
const DIGITS_PLACED = ["ean13", "ean8", "upca", "upce"];

interface Props {
  element: DesignSymbol;
  /** The label's error correction level, a QR code's until it has its own. */
  labelError: ErrorLevel;
  onChange: (next: Partial<DesignSymbol>) => void;
}

export function DesignerSymbolOptions({ element, labelError, onChange }: Props) {
  const { symbology } = element;
  const placed = element.hri && !DIGITS_PLACED.includes(symbology);
  const qr = symbology === "dl-qrcode" || symbology === "gs1-qrcode";
  const linear = SYMBOLOGIES[symbology].kind !== "matrix";
  const itf = symbology === "itf14";
  if (!placed && !qr && !linear) return null;
  const position = element.hriPosition ?? "below";
  const height = element.hriHeightMm ?? 2.2;
  const error = element.error ?? labelError;
  const summary = [
    placed ? t(HRI_POSITION_NAMES[position]) : null,
    placed ? t(HRI_HEIGHTS.find(([mm]) => mm === height)?.[1] ?? "2.2 mm (default)") : null,
    qr ? t("error correction {level}", { level: error.toUpperCase() }) : null,
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
