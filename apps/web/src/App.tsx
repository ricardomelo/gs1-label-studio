import { useEffect, useMemo, useState } from "react";
import {
  COMMON_DPI,
  dataFor,
  encode,
  InputError,
  snapToDots,
  SYMBOLOGIES,
  syntaxEngine,
  toSvg,
  widthInModules,
  zplLabel,
  zplTemplate,
  type ParsedInput,
  type SyntaxEngine,
  type SymbologyId,
} from "@gs1-label-studio/core";

// One code at a time: the data in any form GS1 writes it (backlog item 1.1), checked by the GS1 Barcode Syntax Engine;
// the symbol, its preview at the X-dimension asked, and what a printer of the resolution chosen actually prints. The
// guided flow, the scanning environments and the label layouts come with the backlog.
const EXAMPLE = "(01)09506000134352(17)271231(10)ABC123";

const KIND_NAMES: Record<ParsedInput["kind"], string> = {
  gtin: "GTIN",
  "element-string": "Element string",
  unbracketed: "Element string without brackets",
  "digital-link": "GS1 Digital Link URI",
  scan: "Scanner output",
};

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

export function App() {
  const [engine, setEngine] = useState<SyntaxEngine | null>(null);
  const [symbology, setSymbology] = useState<SymbologyId>("gs1-datamatrix");
  const [text, setText] = useState(EXAMPLE);
  const [xMm, setXMm] = useState(0.495);
  const [dpi, setDpi] = useState(203);
  const [zplError, setZplError] = useState<string | null>(null);

  useEffect(() => {
    syntaxEngine().then(setEngine, (error: unknown) => console.error(error));
  }, []);

  const parsed = useMemo(() => {
    if (!engine) return null;
    try {
      return { input: engine.parse(text) };
    } catch (error) {
      return { error: error instanceof InputError ? error : new InputError(String(error)) };
    }
  }, [engine, text]);

  const symbol = useMemo(() => {
    if (!parsed?.input) return null;
    try {
      const data = dataFor(symbology, parsed.input);
      return { data, geometry: encode(symbology, data) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [parsed, symbology]);

  const snap = snapToDots(xMm, dpi);
  const quietZone = SYMBOLOGIES[symbology].kind === "linear" ? 10 : 2;
  const svg = symbol?.geometry ? toSvg(symbol.geometry, { xMm, quietZone }) : null;

  // ZPL with the printer's own commands (ADR 0002); a label just large enough for the symbol, its quiet zones and text.
  function downloadZpl(template: boolean) {
    if (!symbol?.geometry || !symbol.data) return;
    const { geometry, data } = symbol;
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
    } catch (error) {
      setZplError(error instanceof Error ? error.message : String(error));
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
        <label>
          X-dimension (mm)
          <input
            type="number"
            step="0.005"
            min="0.17"
            max="2"
            value={xMm}
            onChange={(event) => setXMm(Number(event.target.value) || 0.495)}
          />
        </label>
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
          At {dpi} dpi a module prints as {snap.dots} {snap.dots === 1 ? "dot" : "dots"}:{" "}
          <strong>{snap.xMm.toFixed(3)} mm</strong>.
        </p>
      </section>

      <section className="preview" aria-live="polite">
        {symbol?.error && <p className="error">{symbol.error}</p>}
        {zplError && <p className="error">{zplError}</p>}
        {svg && <div className="symbol" dangerouslySetInnerHTML={{ __html: svg }} />}
      </section>

      <section className="actions">
        <button disabled={!svg} onClick={() => svg && download(`${symbology}.svg`, svg, "image/svg+xml")}>
          Download SVG
        </button>
        <button disabled={!svg} onClick={() => downloadZpl(false)}>
          Download ZPL ({dpi} dpi)
        </button>
        <button disabled={!svg} onClick={() => downloadZpl(true)}>
          Download ZPL template
        </button>
      </section>
    </main>
  );
}
