import {
  COMMON_DPI,
  ENVIRONMENTS,
  ERROR_LEVELS,
  linearSizesFor,
  linearXDimension,
  snapToDots,
  SYMBOLOGIES,
  xDimension,
  type ErrorLevel,
  type SymbologyId,
} from "@gs1-label-studio/core";
import { ENVIRONMENT_NAMES, ERROR_NAMES, HRI_CHOICES, LINEAR_CHOICES, type HriChoice, type LinearChoice } from "./texts.ts";

// Step 2 of the editor, as the resolver's label panel (ADR 0004): the preview beside its options, updated as the
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
  /** For symbols without a layout yet (GS1-128, ITF-14). */
  xMmManual: number;
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
  laidOut: boolean;
  twoD: boolean;
  isQr: boolean;
  /** A GTIN in an environment with an EAN/UPC range: the linear barcode beside the 2D symbol is offered. */
  linearPossible: boolean;
}

interface Props {
  settings: LabelSettings;
  onChange: (settings: LabelSettings) => void;
  view: LabelView;
  onDownloadSvg: () => void;
  onDownloadZpl: (template: boolean) => void;
  zplError: string | null;
}

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

export function LabelCard({ settings: s, onChange, view, onDownloadSvg, onDownloadZpl, zplError }: Props) {
  const set = <K extends keyof LabelSettings>(name: K, value: LabelSettings[K]) => onChange({ ...s, [name]: value });
  const snap = snapToDots(view.xMm, s.dpi);
  const target = ENVIRONMENTS[s.environment]?.["2d"][1];

  return (
    <section className="card label-card" aria-labelledby="label-title">
      <h2 id="label-title">
        <span className="n">2</span> Label <span className="badge">updates as you type</span>
      </h2>
      <div className="panel">
        <div>
          <div className="preview" aria-live="polite">
            {view.svg ? (
              <div className="symbol" dangerouslySetInnerHTML={{ __html: view.svg }} />
            ) : (
              <p className="error">{view.error ?? "Loading…"}</p>
            )}
          </div>
          {view.caption && <div className="caption">{view.caption}</div>}
          {zplError && <p className="error small">{zplError}</p>}
          <div className="downloads">
            <button type="button" className="btn primary" disabled={!view.svg} onClick={onDownloadSvg}>
              Download SVG
            </button>
            <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownloadZpl(false)}>
              ZPL ({s.dpi} dpi)
            </button>
            <button type="button" className="btn" disabled={!view.svg} onClick={() => onDownloadZpl(true)}>
              ZPL template
            </button>
          </div>
        </div>

        <div>
          <div className="grid">
            <div>
              <label htmlFor="opt-symbol">Symbol</label>
              <select id="opt-symbol" value={s.symbology} onChange={(e) => set("symbology", e.target.value as SymbologyId)}>
                {Object.values(SYMBOLOGIES).map((symbology) => (
                  <option key={symbology.id} value={symbology.id}>
                    {symbology.name}
                  </option>
                ))}
              </select>
            </div>
            {view.laidOut ? (
              <>
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
                <div>
                  <label htmlFor="opt-size">Size</label>
                  <select id="opt-size" value={s.size} onChange={(e) => set("size", Number(e.target.value))}>
                    {view.sizes.map((size) => {
                      const x = view.twoD ? xDimension(s.environment, size) : linearXDimension(s.environment, size);
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
                {view.linearPossible && (
                  <>
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
              </>
            ) : (
              <div>
                <label htmlFor="opt-x">X-dimension (mm)</label>
                <input
                  id="opt-x"
                  type="number"
                  step="0.005"
                  min="0.17"
                  max="2"
                  value={s.xMmManual}
                  onChange={(e) => set("xMmManual", Number(e.target.value) || 0.495)}
                />
              </div>
            )}
            <div>
              <label htmlFor="opt-dpi">Printer</label>
              <select id="opt-dpi" value={s.dpi} onChange={(e) => set("dpi", Number(e.target.value))}>
                {COMMON_DPI.map((dpi) => {
                  const dots = snapToDots(view.xMm, dpi);
                  return (
                    <option key={dpi} value={dpi}>
                      {dpi} dpi — {dots.dots} {dots.dots === 1 ? "dot" : "dots"}, X {dots.xMm.toFixed(3)} mm
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="opt-stem">Domain in the GS1 Digital Link URI</label>
              <input id="opt-stem" className="mono" value={s.stem} onChange={(e) => set("stem", e.target.value)} spellCheck={false} />
            </div>
          </div>
          {view.laidOut && (
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
        </div>
      </div>
    </section>
  );
}
