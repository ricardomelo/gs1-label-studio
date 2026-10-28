import { useMemo, useState } from "react";
import {
  COMMON_DPI,
  encode,
  EncodeError,
  rasterize,
  snapToDots,
  SYMBOLOGIES,
  toSvg,
  zplLabel,
  type SymbologyId,
} from "@gs1-label-studio/core";

// Walking skeleton: one symbol, its preview at the X-dimension asked, and the X-dimension a printer of the resolution
// chosen actually prints. The guided flow, the scanning environments and the label layouts come with the backlog.
const EXAMPLES: Record<SymbologyId, string> = {
  ean13: "9506000134352",
  upca: "614141000036",
  ean8: "95012346",
  upce: "01234565",
  itf14: "19506000134359",
  "gs1-128": "(01)09506000134352(10)ABC123",
  "gs1-datamatrix": "(01)09506000134352(17)271231(10)ABC123",
  "gs1-qrcode": "(01)09506000134352(21)12345",
  "dl-qrcode": "https://id.gs1.org/01/09506000134352/10/ABC123",
  "dl-datamatrix": "https://id.gs1.org/01/09506000134352",
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [symbology, setSymbology] = useState<SymbologyId>("gs1-datamatrix");
  const [data, setData] = useState(EXAMPLES["gs1-datamatrix"]);
  const [xMm, setXMm] = useState(0.495);
  const [dpi, setDpi] = useState(203);

  const result = useMemo(() => {
    try {
      return { geometry: encode(symbology, data) };
    } catch (error) {
      return { error: error instanceof EncodeError ? error.message : String(error) };
    }
  }, [symbology, data]);

  const snap = snapToDots(xMm, dpi);
  const quietZone = SYMBOLOGIES[symbology].kind === "linear" ? 10 : 2;
  const svg = result.geometry ? toSvg(result.geometry, { xMm, quietZone }) : null;

  function downloadZpl() {
    if (!result.geometry) return;
    const bitmap = rasterize(result.geometry, { dotsPerModule: snap.dots, quietZone, barHeight: 50 * snap.dots });
    const zpl = zplLabel(bitmap, { widthDots: bitmap.width, heightDots: bitmap.height, x: 0, y: 0 });
    download(`${symbology}.zpl`, zpl, "text/plain");
  }

  return (
    <main>
      <header>
        <h1>GS1 Label Studio</h1>
        <p>Gerador de códigos de barras GS1 — tudo é processado no seu navegador.</p>
      </header>

      <section className="form">
        <label>
          Símbolo
          <select
            value={symbology}
            onChange={(event) => {
              const id = event.target.value as SymbologyId;
              setSymbology(id);
              setData(EXAMPLES[id]);
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
          Dados
          <input value={data} onChange={(event) => setData(event.target.value)} spellCheck={false} />
        </label>
        <label>
          Dimensão X (mm)
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
          Impressora (dpi)
          <select value={dpi} onChange={(event) => setDpi(Number(event.target.value))}>
            {COMMON_DPI.map((value) => (
              <option key={value} value={value}>
                {value} dpi
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          A {dpi} dpi o módulo é impresso com {snap.dots} {snap.dots === 1 ? "ponto" : "pontos"}:{" "}
          <strong>{snap.xMm.toFixed(3)} mm</strong>.
        </p>
      </section>

      <section className="preview" aria-live="polite">
        {result.error && <p className="error">{result.error}</p>}
        {svg && <div className="symbol" dangerouslySetInnerHTML={{ __html: svg }} />}
      </section>

      <section className="actions">
        <button disabled={!svg} onClick={() => svg && download(`${symbology}.svg`, svg, "image/svg+xml")}>
          Baixar SVG
        </button>
        <button disabled={!svg} onClick={downloadZpl}>
          Baixar ZPL ({dpi} dpi)
        </button>
      </section>
    </main>
  );
}
