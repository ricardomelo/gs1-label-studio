import {
  ENVIRONMENTS,
  ERROR_LEVELS,
  LOGISTIC_SIZES,
  LOGISTIC_TWO_D,
  SECOND_LANGUAGES,
  linearSizesFor,
  linearXDimension,
  snapToDots,
  SYMBOLOGIES,
  xDimension,
  type Bearer,
  type ErrorLevel,
  type HriPosition,
  type QrMode,
  type LogisticSize,
  type LogisticTwoD,
  type SecondLanguage,
  parseElementString,
  type DesignPage,
  type PlacedElement,
  type RowStatus,
  symbolFor,
  type SymbologyId,
} from "@gs1-label-studio/core";
import { useState } from "react";
import { Help } from "./Help.tsx";
import { DesignerGuides, DesignerOverlay, DesignerPanel, DesignerTools, startingPage } from "./Designer.tsx";
import { keepGuides, keptGuides } from "./guides.ts";
import { Calibration, keptScale, RealSizeView } from "./RealSize.tsx";
import type { SymbolSizing } from "./resize.ts";
import { scanSvg } from "./scan.ts";
import { Segmented } from "./Segmented.tsx";
import { SplitButton } from "./SplitButton.tsx";
import {
  BEARER_CHOICES,
  ENVIRONMENT_NAMES,
  ERROR_NAMES,
  HRI_CHOICES,
  HRI_HEIGHTS,
  HRI_POSITION_NAMES,
  QR_MODE_NAMES,
  LINEAR_CHOICES,
  OPTION_HELP,
  type HriChoice,
  type LinearChoice,
  ROW_STATUS_NAMES,
} from "./texts.ts";
import { formatNumber, t, tm } from "./i18n.ts";

// Step 3 of the editor, as the resolver's label panel (ADR 0004): the preview beside its options, updated as the
// fields change; the GS1 Digital Link URI coloured by part; the downloads.

export interface LabelSettings {
  symbology: SymbologyId;
  environment: string;
  size: number;
  hri: HriChoice;
  version: number | null;
  error: ErrorLevel;
  linear: LinearChoice;
  linearSize: number | null;
  hriAsText: boolean;
  dpi: number;
  stem: string;
  /** ITF-14's bearer bars. */
  bearer: Bearer;
  /** Bar width reduction in mm (0: none). */
  reduction: number;
  /** Crop marks around the label in the PDF and EPS, on a page 10 mm larger on every side (backlog 1.5). */
  cropMarks: boolean;
  /** Where the human readable text goes, and its height in mm (null: 2.2 mm) (backlog 1.16). */
  hriPosition: HriPosition;
  hriHeightMm: number | null;
  /** GS1-128 over several symbols (backlog 1.13): the element strings that start a symbol; null: as many as fit. */
  gs1128Starts: number[] | null;
  /** A QR code's encoding mode, automatic or one for the whole data, and the URI's domain in capitals (backlog 1.14). */
  qrMode: QrMode | "auto";
  qrUpperDomain: boolean;
  /** A GS1 Logistic Label for an SSCC (backlog 4.1), its size, and who sends and receives it (a line a line). */
  logistic: "none" | LogisticSize;
  logisticFrom: string;
  logisticTo: string;
  /** A 2D symbol to the right of the label's middle block (General Specifications 6.6.4.1.1). */
  logisticTwoD: "none" | LogisticTwoD;
  /** The data titles also in a second language, under the English ones (General Specifications 6.6.4.2). */
  logisticSecond: "none" | SecondLanguage;
  /** A label of one's own (backlog 4.2): on or off, its page (kept when off) and the element chosen on it. */
  designer: boolean;
  page: DesignPage | null;
  selected: string | null;
  /** The PNG's resolution; null: the one at which it prints at the label's size. */
  pngResolution: number | null;
  /** The symbol chosen here rather than in step 2. */
  expert: boolean;
}

export interface LabelView {
  svg?: string;
  error?: string;
  caption?: string;
  xMm: number;
  uri: string;
  elementString: string;
  environments: string[];
  sizes: number[];
  twoD: boolean;
  /** ITF-14, GS1-128 or GS1 DataBar: sized by its table's row, bars at the row's minimum height. */
  bars: boolean;
  isQr: boolean;
  /** A GTIN in an environment with an EAN/UPC range: the linear barcode beside the 2D symbol is offered. */
  linearPossible: boolean;
  /** The PNG's resolution, at which it prints at the label's size. */
  pngDpi?: number;
  /** The PNG at each resolution offered: pixels a module and the X-dimension it prints at. */
  pngResolutions?: { dpi: number; pixelsPerModule: number; xMm: number }[];
  /** The label has a linear symbol's bars, which a bar width reduction narrows. */
  hasBars?: boolean;
  /** The symbol chosen in step 2, and its table. */
  guided?: { summary: string; table: number; application: string };
  /** A symbol sized by its table's row: sizes are percentages of this X-dimension (mm). */
  sizeBase?: number;
  /** The label's size in millimetres, for the real-size view. */
  widthMm?: number;
  heightMm?: number;
  /** What a reader should give back for the symbols on the label (`expectedReads()`), for the scan test. */
  expected?: string[];
  /** An SSCC: the GS1 Logistic Label is offered (backlog 4.1). */
  logisticPossible?: boolean;
  /** A label of one's own: where each element landed, and what is wrong with the page, in words. */
  designer?: { placed: PlacedElement[]; sizing: Record<string, SymbolSizing>; problems: string[] };
  /** GS1-128: its element strings and the index of each that starts a symbol (the first always). */
  gs1128?: { elements: string[]; starts: number[] };
  /** In bulk, the spreadsheet's columns a text can show as {column} fields, with the row shown's value (backlog 4.2). */
  columns?: { name: string; value: string }[];
}

type Scan =
  | { svg: string; status: "reading" }
  | { svg: string; status: "ok" | "different"; reads: string[] }
  | { svg: string; status: "error"; message: string };

export type FileKind = "svg" | "png" | "pdf" | "eps" | "zip";

// Prepress (backlog 1.5): the bar width reductions offered, in mm.
const REDUCTIONS = [0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];

interface Props {
  /** Shown below the options: the EPC and signature sections ("More" on a phone or a tablet). */
  children?: React.ReactNode;
  /** Below the options too, but with the exports on a phone or a tablet: the printer profiles. */
  printer?: React.ReactNode;
  /** In bulk, under the Export bar: generating every row (backlog 2.4). */
  generate?: React.ReactNode;
  settings: LabelSettings;
  onChange: (settings: LabelSettings) => void;
  view: LabelView;
  onDownload: (kind: FileKind) => void;
  /** Opens the printer's section and brings it into view (backlog 6.3 i): its print files are downloaded there. */
  onPrinter: () => void;
  fileError: string | null;
  /** In bulk: the row shown among the data rows, and a way to show another. */
  rows?: { index: number; count: number; row: number; status: RowStatus; onMove: (index: number) => void };
}

// EAN/UPC's digits are placed by section 5.2.5, not chosen (backlog 1.16).
const LINEAR_ALONE: SymbologyId[] = ["ean13", "ean8", "upca", "upce"];

// The symbols offered: not GS1 QR Code, which beside the QR code with a GS1 Digital Link URI confuses (ADR 0003).
const OFFERED = Object.values(SYMBOLOGIES).filter((symbology) => symbology.id !== "gs1-qrcode");

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

/** The URI by part: domain, key, qualifiers, data attributes. */
function ColouredUri({ uri, stem }: { uri: string; stem: string }) {
  const base = stem.replace(/\/$/, "");
  if (!uri.startsWith(base)) return <>{uri}</>;
  const rest = uri.slice(base.length);
  const [path = "", query] = rest.split("?");
  const segments = path.split("/").filter(Boolean);
  const key = segments.length >= 2 ? `/${segments.slice(0, 2).join("/")}` : path;
  const qualifiers = segments.length > 2 ? `/${segments.slice(2).join("/")}` : "";
  return (
    <>
      <span className="d">{base}</span>
      <span className="k">{key}</span>
      {qualifiers && <span className="q">{qualifiers}</span>}
      {query && <span className="a">?{query}</span>}
    </>
  );
}

/** The fitted label's widest, in CSS pixels (narrower where the canvas is, or a layout sets --fit); the zoom's steps, of that width. */
const FIT_PX = 420;
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const step = (zoom: number, by: 1 | -1) =>
  by > 0 ? (ZOOMS.find((z) => z > zoom) ?? zoom) : ([...ZOOMS].reverse().find((z) => z < zoom) ?? zoom);

/** The name of the EAN/UPC that goes beside the 2D symbol for this element string, or null when none can. */
function linearName(elementString: string, choice: LinearChoice): string | null {
  if (choice === "none") return null;
  try {
    const gtin = parseElementString(elementString).find((e) => e.ai === "01")?.value;
    return gtin ? tm(SYMBOLOGIES[symbolFor(gtin, choice)[0]].name) : null;
  } catch {
    return null;
  }
}

/** An option's name with a ? that says what it is for (backlog 6.3 a). */
function OptionLabel({ htmlFor, name, help }: { htmlFor: string; name: string; help: keyof typeof OPTION_HELP }) {
  return (
    <div className="label-row">
      <label htmlFor={htmlFor}>{name}</label>
      <Help name={name} text={t(OPTION_HELP[help])} />
    </div>
  );
}

export function LabelCard({ children, generate, printer, settings: s, onChange, view, onDownload, onPrinter, fileError, rows }: Props) {
  const set = <K extends keyof LabelSettings>(name: K, value: LabelSettings[K]) => onChange({ ...s, [name]: value });
  // The data's element strings, for a barcode on a label of one's own to carry and a text to show (backlog 4.2)
  const aiList = (() => {
    try {
      return view.elementString ? parseElementString(view.elementString).map((e) => ({ ai: e.ai, text: `(${e.ai})${e.value}` })) : [];
    } catch {
      return [];
    }
  })();
  const [real, setReal] = useState(false);
  // The canvas's zoom (the owner, 30 October 2026): of the fitted label, or of the real size; back to 100 % when the
  // view changes.
  const [zoom, setZoom] = useState(1);
  const showReal = (next: boolean) => {
    setReal(next);
    setZoom(1);
  };
  // The designer's grid and rulers, on or off as this browser last left them (guides.ts)
  const [guides, setGuides] = useState(keptGuides);
  const showGuides = (on: boolean) => {
    setGuides(on);
    keepGuides(on);
  };
  const [calibrating, setCalibrating] = useState(false);
  const [pxPerMm, setPxPerMm] = useState(keptScale);
  const [scanned, setScanned] = useState<Scan | null>(null);
  const scan = scanned && scanned.svg === view.svg ? scanned : null; // a test of an earlier label says nothing
  const expected = view.expected ?? [];

  function runScan() {
    const svg = view.svg;
    if (!svg) return;
    setScanned({ svg, status: "reading" });
    scanSvg(svg).then(
      (reads) => setScanned({ svg, status: reads.join("\n") === expected.join("\n") ? "ok" : "different", reads }),
      (error: unknown) => setScanned({ svg, status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
  }
  // The linear barcode's group (backlog 6.3 j): beside a 2D symbol, or the symbol itself; its name and X
  const linearBeside = s.linear !== "none" && (view.linearPossible || Boolean(view.guided && view.twoD));
  const barsName = linearBeside ? linearName(view.elementString, s.linear) : view.hasBars ? (s.logistic !== "none" ? tm(SYMBOLOGIES["gs1-128"].name) : tm(SYMBOLOGIES[s.symbology].name)) : null;
  const barsX = linearBeside ? linearXDimension(s.environment, s.linearSize ?? s.size) : view.xMm;
  const snap = snapToDots(view.xMm, s.dpi);
  const target = view.sizeBase ?? (view.twoD ? ENVIRONMENTS[s.environment]?.["2d"][1] : ENVIRONMENTS[s.environment]?.linear?.[1]);

  return (
    <section className="card label-card" aria-labelledby="label-title" data-pane="label export more" data-beside="">
      {/* The label above, in its own area, with its tools over it and its exports below; the options under them
          (the owner's request of 30 October 2026, mock-up B of three): room for the label designer of phase 4.
          Each part marked with its destination on a phone or a tablet (backlog 1.21, layout.ts); data-beside, what a
          tablet held horizontally keeps beside every destination. */}
      <div className="panel">
        <div className="stage" data-pane="label export" data-beside="">
          <h2 id="label-title" data-pane="label" data-beside="">
            <span className="n">3</span> {t("Label")} <span className="badge">{t("updates as you type")}</span>
          </h2>
          {rows && (
            <div className="row-nav" data-pane="label" data-beside="">
              <button type="button" aria-label={t("Previous row")} disabled={rows.index === 0} onClick={() => rows.onMove(rows.index - 1)}>
                ‹
              </button>
              <span aria-live="polite">
                {t("Row")} <b>{rows.row}</b> · {t("{n} of {count}", { n: rows.index + 1, count: rows.count })} ·{" "}
                <span className={rows.status === "error" ? "bad" : rows.status === "skipped" ? "muted" : "ok"}>{t(ROW_STATUS_NAMES[rows.status])}</span>
              </span>
              <button
                type="button"
                aria-label={t("Next row")}
                disabled={rows.index === rows.count - 1}
                onClick={() => rows.onMove(rows.index + 1)}
              >
                ›
              </button>
            </div>
          )}
          <div className="toolbar" data-pane="label" data-beside="">
            {view.svg && view.widthMm && (
              <div className="view-bar">
                <span className="seg" role="group" aria-label={t("Preview size")}>
                  <button type="button" aria-pressed={!real} onClick={() => showReal(false)}>
                    {t("Fit")}
                  </button>
                  <button type="button" aria-pressed={real} onClick={() => showReal(true)}>
                    {t("Real size")}
                  </button>
                </span>
                {real && (
                  <button type="button" className="link" aria-expanded={calibrating} onClick={() => setCalibrating(!calibrating)}>
                    {t("Calibrate the screen")}
                  </button>
                )}
              </div>
            )}
            {view.svg && (
              <div className="scan">
                <button type="button" className="btn" disabled={scan?.status === "reading"} onClick={runScan}>
                  {t("Scan test")}
                </button>
                <span className={`scan-result ${scan?.status ?? ""}`} aria-live="polite">
                  {!scan
                    ? t("Reads the label back with ZXing, here in the browser.")
                    : scan.status === "reading"
                      ? t("Reading…")
                      : scan.status === "error"
                        ? t("The test could not run: {reason}", { reason: scan.message })
                        : scan.status === "ok"
                          ? t("✓ Read as intended: {reads}", { reads: scan.reads.join(t(" and ")) })
                          : t("✗ Read {reads}; expected {expected}.", { reads: scan.reads.join(t(" and ")) || t("nothing"), expected: expected.join(t(" and ")) })}
                </span>
              </div>
            )}
          </div>
          {/* Across the whole card, so that the bar has room up to the slider's maximum (backlog 1.10 c). */}
          {real && calibrating && view.svg && view.widthMm && (
            <div data-pane="label" data-beside="">
              <Calibration pxPerMm={pxPerMm} onChange={setPxPerMm} />
            </div>
          )}
          {view.caption && (
            <div className="caption" data-pane="label" data-beside="">
              {view.caption}
            </div>
          )}
          {s.designer && s.page && (
            <DesignerTools page={s.page} selected={s.selected} symbology={s.symbology} onChange={(page, selected) => onChange({ ...s, page, selected })} guides={guides} onGuides={showGuides} />
          )}
          <div className="canvas-frame" data-pane="label" data-beside="">
            <div className="canvas">
              {real && view.svg && view.widthMm && view.heightMm ? (
                <RealSizeView svg={view.svg} widthMm={view.widthMm} heightMm={view.heightMm} pxPerMm={pxPerMm * zoom} />
              ) : (
                <div
                  className={guides && s.designer && s.page && view.designer ? "preview guided" : "preview"}
                  aria-live="polite"
                  style={zoom === 1 ? undefined : { width: `calc(min(100%, var(--fit, ${FIT_PX}px)) * ${zoom})` }}
                >
                  {view.svg && s.designer && s.page && view.designer ? (
                    <div className="designed">
                      <div className="symbol" dangerouslySetInnerHTML={{ __html: view.svg }} />
                      {guides && <DesignerGuides page={s.page} placed={view.designer.placed} selected={s.selected} />}
                      <DesignerOverlay page={s.page} placed={view.designer.placed} sizing={view.designer.sizing} selected={s.selected} onChange={(page, selected) => onChange({ ...s, page, selected })} />
                    </div>
                  ) : view.svg ? (
                    <div className="symbol" dangerouslySetInnerHTML={{ __html: view.svg }} />
                  ) : (
                    <p className="error">{view.error ?? t("Loading…")}</p>
                  )}
                </div>
              )}
            </div>
            {view.svg && (
              <div className="zoom" role="group" aria-label={t("Zoom")}>
                <button type="button" aria-label={t("Zoom out")} disabled={zoom <= ZOOMS[0]!} onClick={() => setZoom(step(zoom, -1))}>
                  −
                </button>
                <button type="button" className="zoom-value" title={t("Back to 100 %")} onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)} %
                </button>
                <button type="button" aria-label={t("Zoom in")} disabled={zoom >= ZOOMS.at(-1)!} onClick={() => setZoom(step(zoom, 1))}>
                  +
                </button>
              </div>
            )}
          </div>
          {fileError && (
            <p className="error small" data-pane="label export" data-beside="">
              {fileError}
            </p>
          )}
          <h2 className="pane-title" data-pane="export">
            {t("Export")}
          </h2>
          <div className="exportbar" data-pane="export" data-beside="">
            <b>{t("Export")}</b>
            <div className="downloads">
              {/* Each file's options beside its button (backlog 6.3 h, the owner's comments of 11 November 2026) */}
              <SplitButton
                primary
                text={t("Download SVG")}
                menuLabel={t("SVG options")}
                heading={t("The human readable text in the SVG")}
                disabled={!view.svg}
                onClick={() => onDownload("svg")}
                value={s.hriAsText ? "text" : "outline"}
                choices={[
                  { value: "outline", text: t("Outlines"), detail: t("no font needed: prints the same in any program") },
                  { value: "text", text: t("Text"), detail: t("editable in a drawing program; needs the Liberation Sans and OCR-B fonts") },
                ]}
                onChoose={(value) => set("hriAsText", value === "text")}
              />
              <SplitButton
                text={`PNG${s.pngResolution ? ` (${s.pngResolution} dpi)` : view.pngDpi ? ` (${Math.round(view.pngDpi)} dpi)` : ""}`}
                menuLabel={t("PNG options")}
                heading={t("PNG resolution (the choice is kept)")}
                disabled={!view.svg}
                onClick={() => onDownload("png")}
                value={s.pngResolution ? String(s.pngResolution) : ""}
                choices={[
                  { value: "", text: view.pngDpi ? t("At the label's size ({dpi} dpi)", { dpi: Math.round(view.pngDpi) }) : t("At the label's size") },
                  ...(view.pngResolutions ?? []).map(({ dpi, pixelsPerModule, xMm }) => ({
                    value: String(dpi),
                    text: pixelsPerModule === 1
                      ? t("{dpi} dpi — 1 pixel a module, X {x} mm", { dpi, x: formatNumber(xMm, 3) })
                      : t("{dpi} dpi — {n} pixels a module, X {x} mm", { dpi, n: pixelsPerModule, x: formatNumber(xMm, 3) }),
                  })),
                ]}
                onChoose={(value) => set("pngResolution", value ? Number(value) : null)}
              />
              <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownload("pdf")}>
                PDF
              </button>
              <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownload("eps")}>
                EPS
              </button>
              <button
                type="button"
                className="btn"
                disabled={!view.svg}
                title={t("SVG, PNG, PDF, EPS and a README")}
                onClick={() => onDownload("zip")}
              >
                {t("Zip of all")}
              </button>
              {/* The print files in the printer's section, beside its profile and test print (backlog 6.3 i, the owner's
                  comment of 11 November 2026) */}
              {printer && (
                <button type="button" className="btn" onClick={onPrinter}>
                  {t("Label printer…")}
                </button>
              )}
            </div>
          </div>
          {generate && <div data-pane="export">{generate}</div>}
        </div>

        <div className="side" data-pane="label export more">
          <div className="options" data-pane="label">
            {(
              <div className="grid logistic">
                <div>
                  <OptionLabel htmlFor="opt-logistic" name={t("Label")} help="label" />
                  <select
                    id="opt-logistic"
                    value={s.designer ? "designer" : s.logistic}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "designer") {
                        onChange({ ...s, designer: true, logistic: "none", page: s.page ?? startingPage(s.symbology, aiList[0]?.ai), selected: s.selected });
                      } else onChange({ ...s, designer: false, logistic: value as "none" | LogisticSize });
                    }}
                  >
                    <option value="none">{t("The symbol alone")}</option>
                    <option value="designer">{t("A label of my own (barcodes and text placed freely)")}</option>
                    {view.logisticPossible && Object.entries(LOGISTIC_SIZES).map(([id, size]) => (
                      <option key={id} value={id}>
                        {t("GS1 Logistic Label, {size} ({w} × {h} mm)", { size: size.name, w: formatNumber(size.widthMm), h: formatNumber(size.heightMm) })}
                      </option>
                    ))}
                  </select>
                </div>
                {s.logistic !== "none" && (
                  <>
                    <div>
                      <OptionLabel htmlFor="opt-logistic-2d" name={t("2D symbol beside the data")} help="logisticTwoD" />
                      <select id="opt-logistic-2d" value={s.logisticTwoD} onChange={(e) => set("logisticTwoD", e.target.value as "none" | LogisticTwoD)}>
                        <option value="none">{t("None")}</option>
                        {LOGISTIC_TWO_D.map((id) => (
                          <option key={id} value={id}>{tm(SYMBOLOGIES[id].name)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <OptionLabel htmlFor="opt-logistic-second" name={t("Data titles also in")} help="logisticSecond" />
                      <select id="opt-logistic-second" value={s.logisticSecond} onChange={(e) => set("logisticSecond", e.target.value as "none" | SecondLanguage)}>
                        <option value="none">{t("English only")}</option>
                        {Object.entries(SECOND_LANGUAGES).map(([id, name]) => (
                          <option key={id} value={id} lang={id}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <OptionLabel htmlFor="opt-from" name={t("From")} help="from" />
                      <textarea id="opt-from" rows={3} value={s.logisticFrom} placeholder={t("Who sends it: name, address")} onChange={(e) => set("logisticFrom", e.target.value)} />
                    </div>
                    <div>
                      <OptionLabel htmlFor="opt-to" name={t("To")} help="to" />
                      <textarea id="opt-to" rows={3} value={s.logisticTo} placeholder={t("Who receives it")} onChange={(e) => set("logisticTo", e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}
            {s.designer && s.page && (
              <DesignerPanel
                page={s.page}
                selected={s.selected}
                elements={aiList}
                columns={view.columns ?? []}
                environments={view.environments}
                environment={s.environment}
                guided={Boolean(view.guided)}
                problems={view.designer?.problems ?? []}
                onEnvironment={(environment) => set("environment", environment)}
                onChange={(page, selected) => onChange({ ...s, page, selected })}
                outlined={!real && Boolean(view.svg && view.designer)}
              />
            )}
            {!s.designer && (<>
            <div className="grid">
              {view.guided ? (
                <div className="chosen">
                  <span>
                    <b>{view.guided.summary}</b> · {t("table {n}", { n: view.guided.table })}, {view.guided.application.toLowerCase()}
                  </span>
                  <a className="link" href="#scan-title">
                    {t("Change in step 2")}
                  </a>
                </div>
              ) : (
                <div>
                  <OptionLabel htmlFor="opt-symbol" name={t("Symbol")} help="symbol" />
                  <select id="opt-symbol" value={s.symbology} onChange={(e) => set("symbology", e.target.value as SymbologyId)}>
                    {OFFERED.map((symbology) => (
                      <option key={symbology.id} value={symbology.id}>
                        {tm(symbology.name)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!view.guided && (
                <div>
                  <OptionLabel htmlFor="opt-env" name={t("Scanning environment")} help="environment" />
                  <select id="opt-env" value={s.environment} onChange={(e) => set("environment", e.target.value)}>
                    {view.environments.map((name) => (
                      <option key={name} value={name}>
                        {ENVIRONMENT_NAMES[name] ? t(ENVIRONMENT_NAMES[name]) : name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <OptionLabel htmlFor="opt-size" name={t("Size")} help="size" />
                <select id="opt-size" value={s.size} onChange={(e) => set("size", Number(e.target.value))}>
                  {view.sizes.map((size) => {
                    const x = view.sizeBase
                      ? (view.sizeBase * size) / 100
                      : view.twoD ? xDimension(s.environment, size) : linearXDimension(s.environment, size);
                    return (
                      <option key={size} value={size}>
                        {size === 100 ? t("{size} % (X {x} mm, recommended)", { size, x: formatNumber(x, 3) }) : t("{size} % (X {x} mm)", { size, x: formatNumber(x, 3) })}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <OptionLabel htmlFor="opt-hri" name={t("Human readable text")} help="hri" />
                <select id="opt-hri" value={s.hri} onChange={(e) => set("hri", e.target.value as HriChoice)}>
                  {Object.entries(HRI_CHOICES).map(([value, text]) => (
                    <option key={value} value={value}>
                      {t(text)}
                    </option>
                  ))}
                </select>
              </div>
              {s.hri !== "none" && !LINEAR_ALONE.includes(s.symbology) && (
                <>
                  <div>
                    <OptionLabel htmlFor="opt-hri-position" name={t("Text position")} help="hriPosition" />
                    <select id="opt-hri-position" value={s.hriPosition} onChange={(e) => set("hriPosition", e.target.value as HriPosition)}>
                      {Object.entries(HRI_POSITION_NAMES)
                        .filter(([value]) => !(s.linear !== "none" && view.twoD && (value === "left" || value === "right")))
                        .filter(([value]) => !(s.symbology === "itf14" && value === "split"))
                        .map(([value, text]) => (
                          <option key={value} value={value}>
                            {t(text)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <OptionLabel htmlFor="opt-hri-height" name={t("Text height")} help="hriHeight" />
                    <select id="opt-hri-height" value={s.hriHeightMm ?? ""} onChange={(e) => set("hriHeightMm", e.target.value ? Number(e.target.value) : null)}>
                      {HRI_HEIGHTS.map(([mm, text]) => (
                        <option key={mm} value={mm === 2.2 ? "" : mm}>
                          {t(text)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {s.symbology === "itf14" && (
                <div>
                  <OptionLabel htmlFor="opt-bearer" name={t("Bearer bars")} help="bearer" />
                  <select id="opt-bearer" value={s.bearer} onChange={(e) => set("bearer", e.target.value as Bearer)}>
                    {Object.entries(BEARER_CHOICES).map(([value, text]) => (
                      <option key={value} value={value}>
                        {t(text)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {view.isQr && (
                <>
                  <div>
                    <OptionLabel htmlFor="opt-version" name={t("QR code version")} help="version" />
                    <select
                      id="opt-version"
                      value={s.version ?? ""}
                      onChange={(e) => set("version", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">{t("Automatic (smallest that fits)")}</option>
                      {Array.from({ length: 40 }, (_, i) => i + 1).map((v) => (
                        <option key={v} value={v}>
                          {t("{v} ({n} × {n} modules)", { v, n: 17 + 4 * v })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <OptionLabel htmlFor="opt-qr-mode" name={t("Encoding mode")} help="qrMode" />
                    <select id="opt-qr-mode" value={s.qrMode} onChange={(e) => set("qrMode", e.target.value as QrMode | "auto")}>
                      {Object.entries(QR_MODE_NAMES).map(([value, text]) => (
                        <option key={value} value={value}>
                          {t(text)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Segmented
                    id="opt-qr-upper"
                    label={t("Scheme and domain")}
                    help={t(OPTION_HELP.qrUpper)}
                    value={s.qrUpperDomain ? "upper" : "as"}
                    options={[
                      { value: "as", text: t("As typed"), detail: t("As typed (https://id.gs1.org)") },
                      { value: "upper", text: t("In capitals"), detail: t("In capitals (HTTPS://ID.GS1.ORG)") },
                    ]}
                    onChange={(value) => set("qrUpperDomain", value === "upper")}
                  />
                  <Segmented
                    id="opt-ecl"
                    label={t("Error correction")}
                    help={t(OPTION_HELP.error)}
                    value={s.error}
                    options={ERROR_LEVELS.map((level) => ({ value: level, text: level.toUpperCase(), detail: t(ERROR_NAMES[level]) }))}
                    onChange={(value) => set("error", value as ErrorLevel)}
                  />
                </>
              )}
              {(view.linearPossible || (view.guided && view.twoD && s.linear !== "none")) && (
                <>
                  {view.linearPossible && (
                    <div>
                      <OptionLabel htmlFor="opt-linear" name={t("Linear barcode beside it")} help="linear" />
                      <select id="opt-linear" value={s.linear} onChange={(e) => set("linear", e.target.value as LinearChoice)}>
                        {Object.entries(LINEAR_CHOICES).map(([value, text]) => (
                          <option key={value} value={value}>
                            {t(text)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <Segmented
                id="opt-crop"
                label={t("Crop marks")}
                help={t(OPTION_HELP.crop)}
                value={s.cropMarks ? "marks" : "none"}
                options={[
                  { value: "none", text: t("None") },
                  { value: "marks", text: t("In the PDF and EPS"), detail: t("In the PDF and EPS, on a 10 mm margin") },
                ]}
                onChange={(value) => set("cropMarks", value === "marks")}
              />
              <div>
                <OptionLabel htmlFor="opt-stem" name={t("Domain in the GS1 Digital Link URI")} help="stem" />
                <input id="opt-stem" className="mono" value={s.stem} onChange={(e) => set("stem", e.target.value)} spellCheck={false} />
              </div>
            </div>
            {(linearBeside || view.hasBars) && (
              // The linear barcode's two options in one group, each said plainly (backlog 6.3 j, the owner's comment of
              // 11 November 2026): the size sets its X; a reduction takes a fixed amount off every bar, and says what
              // share of that X it is, since 0.020 mm read as a bar's width.
              <fieldset className="group">
                <legend>{barsName ? t("Linear barcode ({name})", { name: barsName }) : t("Linear barcode")}</legend>
                <div className="grid">
                  {linearBeside && (
                    <div>
                      <OptionLabel htmlFor="opt-linear-size" name={t("Size of the linear barcode")} help="linearSize" />
                      <select
                        id="opt-linear-size"
                        value={s.linearSize ?? ""}
                        onChange={(e) => set("linearSize", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">{t("As the 2D symbol: {size} % (X {x} mm)", { size: s.size, x: formatNumber(linearXDimension(s.environment, s.size), 3) })}</option>
                        {linearSizesFor(s.environment).map((size) => (
                          <option key={size} value={size}>
                            {t("{size} % (X {x} mm)", { size, x: formatNumber(linearXDimension(s.environment, size), 3) })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {view.hasBars && (
                    <div>
                      <div className="label-row">
                        <label htmlFor="opt-reduction">{t("Bar width reduction")}</label>
                        <Help
                          name={t("Bar width reduction")}
                          text={t("A press (offset, flexography, gravure) spreads the ink and widens the bars. Take off what the printer asks for; none for a label printer, a laser printer or an inkjet.")}
                        />
                      </div>
                      <select id="opt-reduction" value={s.reduction} onChange={(e) => set("reduction", Number(e.target.value))}>
                        {REDUCTIONS.map((mm) => (
                          <option key={mm} value={mm}>
                            {mm
                              ? t("{mm} mm less on every bar ({share} % of X {x} mm)", { mm: formatNumber(mm, 3), share: Math.round((mm / barsX) * 100), x: formatNumber(barsX, 3) })
                              : t("None")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="hint">
                  {linearBeside
                    ? t("The size sets the X of the {name} (the width of a narrow bar). The reduction takes a fixed amount off every bar, half on each side: the barcode's size and the 2D symbol do not change, the spaces widen.", { name: barsName ?? t("linear barcode") })
                    : t("The reduction takes a fixed amount off every bar, half on each side: the symbol's size does not change, the spaces widen.")}
                </div>
              </fieldset>
            )}
            {view.gs1128 && view.gs1128.elements.length > 1 && (
              <div className="gs1128">
                <div className="gs1128-head">
                  <b>{t("GS1-128 symbols")}</b>{" "}
                  <span className="hint">
                    {view.gs1128.starts.length > 1 ? t("{n} symbols, ", { n: view.gs1128.starts.length }) : t("one symbol, ")}
                    {s.gs1128Starts ? t("split where you chose") : t("as many element strings as fit in each (48 data characters, 165.10 mm)")}
                  </span>
                  {s.gs1128Starts && (
                    <button type="button" className="link" onClick={() => set("gs1128Starts", null)}>
                      {t("Automatic")}
                    </button>
                  )}
                </div>
                <ol className="gs1128-list">
                  {view.gs1128.elements.map((element, index) => (
                    <li key={index} className={view.gs1128!.starts.includes(index) ? "starts" : ""}>
                      {index > 0 && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={view.gs1128!.starts.includes(index)}
                            onChange={(e) => {
                              const starts = view.gs1128!.starts.filter((i) => i > 0 && i !== index);
                              set("gs1128Starts", e.target.checked ? [...starts, index].sort((a, b) => a - b) : starts);
                            }}
                          />
                          {t("new symbol")}
                        </label>
                      )}
                      <code>{element}</code>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {view.guided && (
              <div className="hint">
                {t("Sizes within table {n}'s ranges (GS1 General Specifications 5.12.3.{n})", { n: view.guided.table })}
                {view.bars ? t("; bars as high as the table asks at this X-dimension") : ""}.{" "}
                {snap.dots === 1 ? t("At {dpi} dpi a module prints as 1 dot.", { dpi: s.dpi }) : t("At {dpi} dpi a module prints as {n} dots.", { dpi: s.dpi, n: snap.dots })}
              </div>
            )}
            {!view.guided && (
              <div className="hint">
                {target
                  ? t("Only the key's scanning environments and the sizes within their ranges are offered (GS1 General Specifications 5.12.3; target X {x} mm).", { x: formatNumber(target, 3) })
                  : t("Only the key's scanning environments and the sizes within their ranges are offered (GS1 General Specifications 5.12.3).")}{" "}
                {snap.dots === 1 ? t("At {dpi} dpi a module prints as 1 dot.", { dpi: s.dpi }) : t("At {dpi} dpi a module prints as {n} dots.", { dpi: s.dpi, n: snap.dots })}
              </div>
            )}

            {view.uri ? (
              <>
                <div className="uri">
                  <ColouredUri uri={view.uri} stem={s.stem} />
                </div>
                <div className="legend">
                  <span>
                    <span className="sw" style={{ background: "var(--dom)" }} />
                    <b>{t("Domain")}</b>
                  </span>
                  <span>
                    <span className="sw" style={{ background: "var(--navy)" }} />
                    <b>{t("Key")}</b>
                  </span>
                  <span>
                    <span className="sw" style={{ background: "var(--q)" }} />
                    <b>{t("Qualifiers")}</b>
                  </span>
                  <span>
                    <span className="sw" style={{ background: "var(--attr)" }} />
                    <b>{t("Data attributes")}</b>
                  </span>
                  <button type="button" className="link" onClick={() => copy(view.uri)}>
                    {t("Copy URI")}
                  </button>
                </div>
              </>
            ) : null}
            </>)}
            {view.elementString && (
              <div className="hint es">
                {t("Element string")} <code>{view.elementString}</code>{" "}
                <button type="button" className="link" onClick={() => copy(view.elementString)}>
                  {t("Copy")}
                </button>
              </div>
            )}
          </div>
          {printer && <div data-pane="export">{printer}</div>}
          <div className="extras" data-pane="more">
            <h2 className="pane-title">{t("More")}</h2>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
