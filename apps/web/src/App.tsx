import { useEffect, useMemo, useState } from "react";
import {
  COMMON_DPI,
  dataFor,
  encode,
  environmentsFor,
  ENVIRONMENTS,
  ERROR_LEVELS,
  HriFont,
  InputError,
  labelSvg,
  layoutLabel,
  linearSizesFor,
  sizesFor,
  snapToDots,
  symbolFor,
  SYMBOLOGIES,
  syntaxEngine,
  toSvg,
  widthInModules,
  zplLabel,
  zplTemplate,
  type ErrorLevel,
  type LabelOptions,
  type ParsedInput,
  type SyntaxEngine,
  type SymbologyId,
} from "@gs1-label-studio/core";
import fontUrl from "@gs1-label-studio/core/assets/fonts/LiberationSans-Regular.ttf?url";

// One code at a time: the data in any form GS1 writes it (backlog item 1.1), checked by the GS1 Barcode Syntax Engine;
// the label laid out as the resolver's label studio did (item 1.4, ADR 0004) — scanning environment, size, an EAN/UPC
// beside the 2D symbol, human readable text —, its preview, and what a printer of the resolution chosen prints. The
// guided choice and the final screen come with items 1.2 and 1.6, mock-ups first.
const EXAMPLE = "(01)09506000134352(17)271231(10)ABC123";

const KIND_NAMES: Record<ParsedInput["kind"], string> = {
  gtin: "GTIN",
  "element-string": "Element string",
  unbracketed: "Element string without brackets",
  "digital-link": "GS1 Digital Link URI",
  scan: "Scanner output",
};

const LAID_OUT: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix", "ean13", "upca", "upce", "ean8"];
const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];

type LinearChoice = "none" | "auto" | "upce";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** The engine's markup, "(17)27|13|31", with the characters between bars highlighted. */
function Markup({ text }: { text: string }) {
  return (
    <code className="markup">
      {text.split("|").map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))}
    </code>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [engine, setEngine] = useState<SyntaxEngine | null>(null);
  const [font, setFont] = useState<HriFont | null>(null);
  const [symbology, setSymbology] = useState<SymbologyId>("gs1-datamatrix");
  const [text, setText] = useState(EXAMPLE);
  const [environmentChoice, setEnvironmentChoice] = useState<string>("");
  const [size, setSize] = useState(100);
  const [linearChoice, setLinearChoice] = useState<LinearChoice>("none");
  const [linearSize, setLinearSize] = useState<number | null>(null);
  const [showHri, setShowHri] = useState(true);
  const [hriAsText, setHriAsText] = useState(false);
  const [error, setError] = useState<ErrorLevel>("m");
  const [xMmManual, setXMmManual] = useState(0.495);
  const [dpi, setDpi] = useState(203);
  const [zplError, setZplError] = useState<string | null>(null);

  useEffect(() => {
    syntaxEngine().then(setEngine, (e: unknown) => console.error(e));
    fetch(fontUrl)
      .then((response) => response.arrayBuffer())
      .then((bytes) => setFont(HriFont.fromBytes(bytes)), (e: unknown) => console.error(e));
  }, []);

  const parsed = useMemo(() => {
    if (!engine) return null;
    try {
      return { input: engine.parse(text) };
    } catch (e) {
      return { error: e instanceof InputError ? e : new InputError(String(e)) };
    }
  }, [engine, text]);

  // The key's scanning environments, its default first (General Specifications figure 5-68).
  const keyAi = parsed?.input?.elements[0]?.ai ?? "01";
  const environments = environmentsFor(keyAi);
  const environment = environments.includes(environmentChoice) ? environmentChoice : environments[0]!;
  const laidOut = LAID_OUT.includes(symbology);
  const twoD = TWO_D.includes(symbology);
  const sizes = twoD ? sizesFor(environment, linearChoice !== "none" && linearSize === null) : linearSizesFor(environment);
  const effectiveSize = sizes.includes(size) ? size : (sizes.includes(100) ? 100 : sizes[0]) ?? 100;

  const label = useMemo(() => {
    if (!parsed?.input || !font) return null;
    try {
      const data = dataFor(symbology, parsed.input);
      if (!laidOut) {
        const geometry = encode(symbology, data);
        const quietZone = SYMBOLOGIES[symbology].kind === "linear" ? 10 : 2;
        return { data, geometry, xMm: xMmManual, svg: toSvg(geometry, { xMm: xMmManual, quietZone }) };
      }
      const gtin = parsed.input.elements.find((e) => e.ai === "01")?.value;
      const linear = twoD && linearChoice !== "none" && gtin ? symbolFor(gtin, linearChoice) : null;
      if (twoD && linearChoice !== "none" && !gtin) throw new InputError("An EAN/UPC beside the 2D symbol needs a GTIN (01).");
      const options: LabelOptions = {
        symbology, data, showHri, error, environment, size: effectiveSize, linear,
        hriLines: parsed.input.elements.map((e) => `(${e.ai})${e.value}`),
        linearSize: twoD ? linearSize : null,
      };
      const layout = layoutLabel(options, font);
      const geometry = encode(symbology, data, twoD && symbology.endsWith("qrcode") ? { eclevel: error.toUpperCase() as "L" } : {});
      return { data, geometry, xMm: layout.xMm, svg: labelSvg(options, layout, font, hriAsText), layout };
    } catch (e) {
      const message = e instanceof Error && e.name === "NotPossible"
        ? linearChoice === "upce" ? "This GTIN has no UPC-E (a GTIN-12 that zero-suppresses)." : "This GTIN cannot be carried by an EAN/UPC (its indicator is not 0)."
        : errorText(e);
      return { error: message };
    }
  }, [parsed, font, symbology, laidOut, twoD, xMmManual, linearChoice, showHri, error, environment, effectiveSize, linearSize, hriAsText]);

  const xMm = label?.xMm ?? xMmManual;
  const snap = snapToDots(xMm, dpi);
  const quietZone = SYMBOLOGIES[symbology].kind === "linear" ? 10 : 2;

  // ZPL with the printer's own commands (ADR 0002); a label just large enough for the symbol, its quiet zones and text.
  function downloadZpl(template: boolean) {
    if (!label?.geometry || !label.data) return;
    const { geometry, data } = label;
    const d = snap.dots;
    const barHeightDots = 50 * d;
    const textDots = Math.round((2.2 / 25.4) * dpi);
    const symbolHeight = geometry.kind === "matrix" ? geometry.rows * d : barHeightDots;
    const options = {
      x: quietZone * d,
      y: quietZone * d,
      dotsPerModule: d,
      barHeightDots,
      dpi,
      widthDots: (widthInModules(geometry) + 2 * quietZone) * d,
      heightDots: symbolHeight + 2 * quietZone * d + 4 * textDots,
    };
    try {
      const zpl = template ? zplTemplate(symbology, data, options).zpl : zplLabel(symbology, data, options);
      download(`${symbology}${template ? "-template" : ""}.zpl`, zpl, "text/plain");
      setZplError(null);
    } catch (e) {
      setZplError(errorText(e));
    }
  }

  return (
    <main>
      <header>
        <h1>GS1 Label Studio</h1>
        <p>GS1 barcode generator — everything is processed in your browser.</p>
      </header>

      <section className="form">
        <label>
          Data
          <input
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setZplError(null);
            }}
            placeholder="A GTIN, (01)…(10)…, a GS1 Digital Link URI or a scanner's output"
            spellCheck={false}
            aria-describedby="data-help"
          />
        </label>
        <p id="data-help" className="hint">
          Paste a GTIN, an element string with or without brackets, a GS1 Digital Link URI, or a scanner's output with
          its symbology identifier (write the group separator as {"{GS}"}).
        </p>

        <div className="parsed" aria-live="polite">
          {!engine && <p className="hint">Loading the GS1 Barcode Syntax Engine…</p>}
          {parsed?.error && (
            <div className="error">
              <p>{parsed.error.message}</p>
              {parsed.error.markup && <Markup text={parsed.error.markup} />}
            </div>
          )}
          {parsed?.input && (
            <>
              <p className="hint">Recognised: {KIND_NAMES[parsed.input.kind]}</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">AI</th>
                    <th scope="col">Data title</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.input.elements.map((e) => (
                    <tr key={e.ai}>
                      <td>({e.ai})</td>
                      <td>{e.title}</td>
                      <td>
                        <code>{e.value}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                Element string: <code>{parsed.input.elementString}</code>
                {parsed.input.digitalLinkUri && (
                  <>
                    <br />
                    GS1 Digital Link URI: <code>{parsed.input.digitalLinkUri}</code>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <label>
          Symbol
          <select
            value={symbology}
            onChange={(event) => {
              setSymbology(event.target.value as SymbologyId);
              setZplError(null);
            }}
          >
            {Object.values(SYMBOLOGIES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {laidOut ? (
          <>
            <label>
              Scanning environment
              <select value={environment} onChange={(event) => setEnvironmentChoice(event.target.value)}>
                {environments.map((name) => (
                  <option key={name} value={name}>
                    {name} — symbol specification table {ENVIRONMENTS[name]!.table}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size (percentage of the environment's target X-dimension)
              <select value={effectiveSize} onChange={(event) => setSize(Number(event.target.value))}>
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s} %
                  </option>
                ))}
              </select>
            </label>
            {twoD && (
              <>
                <label>
                  EAN/UPC beside the 2D symbol
                  <select value={linearChoice} onChange={(event) => setLinearChoice(event.target.value as LinearChoice)}>
                    <option value="none">None</option>
                    <option value="auto">EAN-13, UPC-A or EAN-8, as the GTIN takes</option>
                    <option value="upce">UPC-E</option>
                  </select>
                </label>
                {linearChoice !== "none" && (
                  <label>
                    Size of the EAN/UPC
                    <select
                      value={linearSize ?? ""}
                      onChange={(event) => setLinearSize(event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">As the 2D symbol</option>
                      {linearSizesFor(environment).map((s) => (
                        <option key={s} value={s}>
                          {s} %
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {symbology.endsWith("qrcode") && (
                  <label>
                    QR error correction
                    <select value={error} onChange={(event) => setError(event.target.value as ErrorLevel)}>
                      {ERROR_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={showHri} onChange={(event) => setShowHri(event.target.checked)} />
              Human readable text
            </label>
            <label className="check">
              <input type="checkbox" checked={hriAsText} onChange={(event) => setHriAsText(event.target.checked)} />
              SVG text as editable text (needs Liberation Sans and OCR-B where printed)
            </label>
          </>
        ) : (
          <label>
            X-dimension (mm)
            <input
              type="number"
              step="0.005"
              min="0.17"
              max="2"
              value={xMmManual}
              onChange={(event) => setXMmManual(Number(event.target.value) || 0.495)}
            />
          </label>
        )}

        <label>
          Printer resolution
          <select value={dpi} onChange={(event) => setDpi(Number(event.target.value))}>
            {COMMON_DPI.map((value) => (
              <option key={value} value={value}>
                {value} dpi
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          X-dimension {xMm.toFixed(3)} mm. At {dpi} dpi a module prints as {snap.dots} {snap.dots === 1 ? "dot" : "dots"}:{" "}
          <strong>{snap.xMm.toFixed(3)} mm</strong>.
        </p>
      </section>

      <section className="preview" aria-live="polite">
        {!font && <p className="hint">Loading the font…</p>}
        {label?.error && <p className="error">{label.error}</p>}
        {zplError && <p className="error">{zplError}</p>}
        {label?.svg && <div className="symbol" dangerouslySetInnerHTML={{ __html: label.svg }} />}
      </section>

      <section className="actions">
        <button disabled={!label?.svg} onClick={() => label?.svg && download(`${symbology}.svg`, label.svg, "image/svg+xml")}>
          Download SVG
        </button>
        <button disabled={!label?.svg} onClick={() => downloadZpl(false)}>
          Download ZPL ({dpi} dpi)
        </button>
        <button disabled={!label?.svg} onClick={() => downloadZpl(true)}>
          Download ZPL template
        </button>
      </section>
    </main>
  );
}
