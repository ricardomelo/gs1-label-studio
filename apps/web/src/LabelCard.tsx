import {
  ENVIRONMENTS,
  ERROR_LEVELS,
  linearSizesFor,
  linearXDimension,
  snapToDots,
  SYMBOLOGIES,
  xDimension,
  type Bearer,
  type ErrorLevel,
  type HriPosition,
  type QrMode,
  type RowStatus,
  type SymbologyId,
} from "@gs1-label-studio/core";
import { useState } from "react";
import { Calibration, keptScale, RealSizeView } from "./RealSize.tsx";
import { scanSvg } from "./scan.ts";
import {
  BEARER_CHOICES,
  ENVIRONMENT_NAMES,
  ERROR_NAMES,
  HRI_CHOICES,
  HRI_HEIGHTS,
  HRI_POSITION_NAMES,
  QR_MODE_NAMES,
  LINEAR_CHOICES,
  type HriChoice,
  type LinearChoice,
} from "./texts.ts";

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
  /** Where the human readable text goes, and its height in mm (null: 2.2 mm) (backlog 1.16). */
  hriPosition: HriPosition;
  hriHeightMm: number | null;
  /** GS1-128 over several symbols (backlog 1.13): the element strings that start a symbol; null: as many as fit. */
  gs1128Starts: number[] | null;
  /** A QR code's encoding mode, automatic or one for the whole data, and the URI's domain in capitals (backlog 1.14). */
  qrMode: QrMode | "auto";
  qrUpperDomain: boolean;
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
  /** GS1-128: its element strings and the index of each that starts a symbol (the first always). */
  gs1128?: { elements: string[]; starts: number[] };
}

type Scan =
  | { svg: string; status: "reading" }
  | { svg: string; status: "ok" | "different"; reads: string[] }
  | { svg: string; status: "error"; message: string };

export type FileKind = "svg" | "png" | "pdf" | "eps" | "zip";

// Prepress (backlog 1.5): the bar width reductions offered, in mm.
const REDUCTIONS = [0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];

interface Props {
  /** Shown below the options: the EPC section. */
  children?: React.ReactNode;
  /** In bulk, under the Export bar: generating every row (backlog 2.4). */
  generate?: React.ReactNode;
  settings: LabelSettings;
  onChange: (settings: LabelSettings) => void;
  view: LabelView;
  onDownload: (kind: FileKind) => void;
  onDownloadZpl: (template: boolean) => void;
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

/** The fitted label's widest, in CSS pixels (narrower where the canvas is); the zoom's steps, of that width. */
const FIT_PX = 420;
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const step = (zoom: number, by: 1 | -1) =>
  by > 0 ? (ZOOMS.find((z) => z > zoom) ?? zoom) : ([...ZOOMS].reverse().find((z) => z < zoom) ?? zoom);

export function LabelCard({ children, generate, settings: s, onChange, view, onDownload, onDownloadZpl, fileError, rows }: Props) {
  const set = <K extends keyof LabelSettings>(name: K, value: LabelSettings[K]) => onChange({ ...s, [name]: value });
  const [real, setReal] = useState(false);
  // The canvas's zoom (the owner, 30 October 2026): of the fitted label, or of the real size; back to 100 % when the
  // view changes.
  const [zoom, setZoom] = useState(1);
  const showReal = (next: boolean) => {
    setReal(next);
    setZoom(1);
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
  const snap = snapToDots(view.xMm, s.dpi);
  const target = view.sizeBase ?? (view.twoD ? ENVIRONMENTS[s.environment]?.["2d"][1] : ENVIRONMENTS[s.environment]?.linear?.[1]);

  return (
    <section className="card label-card" aria-labelledby="label-title">
      <h2 id="label-title">
        <span className="n">3</span> Label <span className="badge">updates as you type</span>
      </h2>
      {/* The label above, in its own area, with its tools over it and its exports below; the options under them
          (the owner's request of 30 October 2026, mock-up B of three): room for the label designer of phase 4. */}
      <div className="panel">
        <div className="stage">
          {rows && (
            <div className="row-nav">
              <button type="button" aria-label="Previous row" disabled={rows.index === 0} onClick={() => rows.onMove(rows.index - 1)}>
                ‹
              </button>
              <span aria-live="polite">
                Row <b>{rows.row}</b> · {rows.index + 1} of {rows.count} ·{" "}
                <span className={rows.status === "error" ? "bad" : rows.status === "skipped" ? "muted" : "ok"}>{rows.status}</span>
              </span>
              <button
                type="button"
                aria-label="Next row"
                disabled={rows.index === rows.count - 1}
                onClick={() => rows.onMove(rows.index + 1)}
              >
                ›
              </button>
            </div>
          )}
          <div className="toolbar">
            {view.svg && view.widthMm && (
              <div className="view-bar">
                <span className="seg" role="group" aria-label="Preview size">
                  <button type="button" aria-pressed={!real} onClick={() => showReal(false)}>
                    Fit
                  </button>
                  <button type="button" aria-pressed={real} onClick={() => showReal(true)}>
                    Real size
                  </button>
                </span>
                {real && (
                  <button type="button" className="link" aria-expanded={calibrating} onClick={() => setCalibrating(!calibrating)}>
                    Calibrate the screen
                  </button>
                )}
              </div>
            )}
            {view.svg && (
              <div className="scan">
                <button type="button" className="btn" disabled={scan?.status === "reading"} onClick={runScan}>
                  Scan test
                </button>
                <span className={`scan-result ${scan?.status ?? ""}`} aria-live="polite">
                  {!scan
                    ? "Reads the label back with ZXing, here in the browser."
                    : scan.status === "reading"
                      ? "Reading…"
                      : scan.status === "error"
                        ? `The test could not run: ${scan.message}`
                        : scan.status === "ok"
                          ? `✓ Read as intended: ${scan.reads.join(" and ")}`
                          : `✗ Read ${scan.reads.join(" and ") || "nothing"}; expected ${expected.join(" and ")}.`}
                </span>
              </div>
            )}
          </div>
          {/* Across the whole card, so that the bar has room up to the slider's maximum (backlog 1.10 c). */}
          {real && calibrating && view.svg && view.widthMm && <Calibration pxPerMm={pxPerMm} onChange={setPxPerMm} />}
          {view.caption && <div className="caption">{view.caption}</div>}
          <div className="canvas-frame">
            <div className="canvas">
              {real && view.svg && view.widthMm && view.heightMm ? (
                <RealSizeView svg={view.svg} widthMm={view.widthMm} heightMm={view.heightMm} pxPerMm={pxPerMm * zoom} />
              ) : (
                <div
                  className="preview"
                  aria-live="polite"
                  style={zoom === 1 ? undefined : { width: `calc(min(100%, ${FIT_PX}px) * ${zoom})` }}
                >
                  {view.svg ? (
                    <div className="symbol" dangerouslySetInnerHTML={{ __html: view.svg }} />
                  ) : (
                    <p className="error">{view.error ?? "Loading…"}</p>
                  )}
                </div>
              )}
            </div>
            {view.svg && (
              <div className="zoom" role="group" aria-label="Zoom">
                <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]!} onClick={() => setZoom(step(zoom, -1))}>
                  −
                </button>
                <button type="button" className="zoom-value" title="Back to 100 %" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)} %
                </button>
                <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOMS.at(-1)!} onClick={() => setZoom(step(zoom, 1))}>
                  +
                </button>
              </div>
            )}
          </div>
          {fileError && <p className="error small">{fileError}</p>}
          <div className="exportbar">
            <b>Export</b>
            <div className="downloads">
              <button type="button" className="btn primary" disabled={!view.svg} onClick={() => onDownload("svg")}>
                Download SVG
              </button>
              <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownload("png")}>
                PNG{s.pngResolution ? ` (${s.pngResolution} dpi)` : view.pngDpi ? ` (${Math.round(view.pngDpi)} dpi)` : ""}
              </button>
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
                title="SVG, PNG, PDF, EPS and a README"
                onClick={() => onDownload("zip")}
              >
                Zip of all
              </button>
              <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownloadZpl(false)}>
                ZPL ({s.dpi} dpi)
              </button>
              <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownloadZpl(true)}>
                ZPL template
              </button>
            </div>
          </div>
          {generate}
        </div>

        <div>
          <div className="grid">
            {view.guided ? (
              <div className="chosen">
                <span>
                  <b>{view.guided.summary}</b> · table {view.guided.table}, {view.guided.application.toLowerCase()}
                </span>
                <a className="link" href="#scan-title">
                  Change in step 2
                </a>
              </div>
            ) : (
              <div>
                <label htmlFor="opt-symbol">Symbol</label>
                <select id="opt-symbol" value={s.symbology} onChange={(e) => set("symbology", e.target.value as SymbologyId)}>
                  {OFFERED.map((symbology) => (
                    <option key={symbology.id} value={symbology.id}>
                      {symbology.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!view.guided && (
              <div>
                <label htmlFor="opt-env">Scanning environment</label>
                <select id="opt-env" value={s.environment} onChange={(e) => set("environment", e.target.value)}>
                  {view.environments.map((name) => (
                    <option key={name} value={name}>
                      {ENVIRONMENT_NAMES[name] ?? name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="opt-size">Size</label>
              <select id="opt-size" value={s.size} onChange={(e) => set("size", Number(e.target.value))}>
                {view.sizes.map((size) => {
                  const x = view.sizeBase
                    ? (view.sizeBase * size) / 100
                    : view.twoD ? xDimension(s.environment, size) : linearXDimension(s.environment, size);
                  return (
                    <option key={size} value={size}>
                      {size} % (X {x.toFixed(3)} mm{size === 100 ? ", recommended" : ""})
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="opt-hri">Human readable text</label>
              <select id="opt-hri" value={s.hri} onChange={(e) => set("hri", e.target.value as HriChoice)}>
                {Object.entries(HRI_CHOICES).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            {s.hri !== "none" && !LINEAR_ALONE.includes(s.symbology) && (
              <>
                <div>
                  <label htmlFor="opt-hri-position">Text position</label>
                  <select id="opt-hri-position" value={s.hriPosition} onChange={(e) => set("hriPosition", e.target.value as HriPosition)}>
                    {Object.entries(HRI_POSITION_NAMES)
                      .filter(([value]) => !(s.linear !== "none" && view.twoD && (value === "left" || value === "right")))
                      .filter(([value]) => !(s.symbology === "itf14" && value === "split"))
                      .map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="opt-hri-height">Text height</label>
                  <select id="opt-hri-height" value={s.hriHeightMm ?? ""} onChange={(e) => set("hriHeightMm", e.target.value ? Number(e.target.value) : null)}>
                    {HRI_HEIGHTS.map(([mm, text]) => (
                      <option key={mm} value={mm === 2.2 ? "" : mm}>
                        {text}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {s.symbology === "itf14" && (
              <div>
                <label htmlFor="opt-bearer">Bearer bars</label>
                <select id="opt-bearer" value={s.bearer} onChange={(e) => set("bearer", e.target.value as Bearer)}>
                  {Object.entries(BEARER_CHOICES).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {view.isQr && (
              <>
                <div>
                  <label htmlFor="opt-version">QR code version</label>
                  <select
                    id="opt-version"
                    value={s.version ?? ""}
                    onChange={(e) => set("version", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Automatic (smallest that fits)</option>
                    {Array.from({ length: 40 }, (_, i) => i + 1).map((v) => (
                      <option key={v} value={v}>
                        {v} ({17 + 4 * v} × {17 + 4 * v} modules)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="opt-qr-mode">Encoding mode</label>
                  <select id="opt-qr-mode" value={s.qrMode} onChange={(e) => set("qrMode", e.target.value as QrMode | "auto")}>
                    {Object.entries(QR_MODE_NAMES).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="opt-qr-upper">Scheme and domain</label>
                  <select id="opt-qr-upper" value={s.qrUpperDomain ? "upper" : "as"} onChange={(e) => set("qrUpperDomain", e.target.value === "upper")}>
                    <option value="as">As typed (https://id.gs1.org)</option>
                    <option value="upper">In capitals (HTTPS://ID.GS1.ORG)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="opt-ecl">Error correction</label>
                  <select id="opt-ecl" value={s.error} onChange={(e) => set("error", e.target.value as ErrorLevel)}>
                    {ERROR_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {ERROR_NAMES[level]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {(view.linearPossible || (view.guided && view.twoD && s.linear !== "none")) && (
              <>
                {view.linearPossible && (
                  <div>
                    <label htmlFor="opt-linear">Linear barcode beside it</label>
                    <select id="opt-linear" value={s.linear} onChange={(e) => set("linear", e.target.value as LinearChoice)}>
                      {Object.entries(LINEAR_CHOICES).map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {s.linear !== "none" && (
                  <div>
                    <label htmlFor="opt-linear-size">Size of the linear barcode</label>
                    <select
                      id="opt-linear-size"
                      value={s.linearSize ?? ""}
                      onChange={(e) => set("linearSize", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">As the 2D symbol: {s.size} %</option>
                      {linearSizesFor(s.environment).map((size) => (
                        <option key={size} value={size}>
                          {size} % (X {linearXDimension(s.environment, size).toFixed(3)} mm)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {view.hasBars && (
              <div>
                <label htmlFor="opt-reduction">Bar width reduction</label>
                <select id="opt-reduction" value={s.reduction} onChange={(e) => set("reduction", Number(e.target.value))}>
                  {REDUCTIONS.map((mm) => (
                    <option key={mm} value={mm}>
                      {mm ? `${mm.toFixed(3)} mm` : "None"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="opt-png">PNG resolution</label>
              <select
                id="opt-png"
                value={s.pngResolution ?? ""}
                onChange={(e) => set("pngResolution", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">At the label's size{view.pngDpi ? ` (${Math.round(view.pngDpi)} dpi)` : ""}</option>
                {(view.pngResolutions ?? []).map(({ dpi, pixelsPerModule, xMm }) => (
                  <option key={dpi} value={dpi}>
                    {dpi} dpi — {pixelsPerModule} {pixelsPerModule === 1 ? "pixel" : "pixels"} a module, X {xMm.toFixed(3)} mm
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="opt-hritext">Text in the SVG</label>
              <select
                id="opt-hritext"
                value={s.hriAsText ? "text" : "outline"}
                onChange={(e) => set("hriAsText", e.target.value === "text")}
              >
                <option value="outline">Outlines, no font needed</option>
                <option value="text">Text, editable (needs the fonts)</option>
              </select>
            </div>
            <div>
              <label htmlFor="opt-stem">Domain in the GS1 Digital Link URI</label>
              <input id="opt-stem" className="mono" value={s.stem} onChange={(e) => set("stem", e.target.value)} spellCheck={false} />
            </div>
          </div>
          {view.gs1128 && view.gs1128.elements.length > 1 && (
            <div className="gs1128">
              <div className="gs1128-head">
                <b>GS1-128 symbols</b>{" "}
                <span className="hint">
                  {view.gs1128.starts.length > 1 ? `${view.gs1128.starts.length} symbols, ` : "one symbol, "}
                  {s.gs1128Starts ? "split where you chose" : "as many element strings as fit in each (48 data characters, 165.10 mm)"}
                </span>
                {s.gs1128Starts && (
                  <button type="button" className="link" onClick={() => set("gs1128Starts", null)}>
                    Automatic
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
                        new symbol
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
              Sizes within table {view.guided.table}'s ranges (GS1 General Specifications 5.12.3.{view.guided.table})
              {view.bars ? "; bars as high as the table asks at this X-dimension" : ""}. At{" "}
              {s.dpi} dpi a module prints as {snap.dots} {snap.dots === 1 ? "dot" : "dots"}.
            </div>
          )}
          {!view.guided && (
            <div className="hint">
              Only the key's scanning environments and the sizes within their ranges are offered (GS1 General
              Specifications 5.12.3{target ? `; target X ${target.toFixed(3)} mm` : ""}). At {s.dpi} dpi a module prints
              as {snap.dots} {snap.dots === 1 ? "dot" : "dots"}.
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
                  <b>Domain</b>
                </span>
                <span>
                  <span className="sw" style={{ background: "var(--navy)" }} />
                  <b>Key</b>
                </span>
                <span>
                  <span className="sw" style={{ background: "var(--q)" }} />
                  <b>Qualifiers</b>
                </span>
                <span>
                  <span className="sw" style={{ background: "var(--attr)" }} />
                  <b>Data attributes</b>
                </span>
                <button type="button" className="link" onClick={() => copy(view.uri)}>
                  Copy URI
                </button>
              </div>
            </>
          ) : null}
          {view.elementString && (
            <div className="hint es">
              Element string <code>{view.elementString}</code>{" "}
              <button type="button" className="link" onClick={() => copy(view.elementString)}>
                Copy
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
