import { useEffect, useMemo, useState } from "react";
import {
  AttributeError,
  dataFor,
  encode,
  ENVIRONMENTS,
  environmentsFor,
  fieldsOf,
  HriFont,
  identify,
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
  GcpTable,
  type Identification,
  type Identified,
  type LabelOptions,
  type SymbolGeometry,
  type SyntaxEngine,
  type SymbologyId,
} from "@gs1-label-studio/core";
import fontUrl from "@gs1-label-studio/core/assets/fonts/LiberationSans-Regular.ttf?url";
import { EpcSection } from "./EpcSection.tsx";
import { IdentifyCard } from "./IdentifyCard.tsx";
import { kept } from "./keep.ts";
import { LabelCard, type LabelSettings, type LabelView } from "./LabelCard.tsx";

// One code: the resolver's editor without its records (ADR 0004, mock-ups approved on 28 October 2026) — what the
// code identifies on the left, the label beside it on the right, redrawn as anything changes. Everything stays in the
// browser: the GS1 Barcode Syntax Engine and the encoder run here.

const LAID_OUT: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix", "ean13", "upca", "upce", "ean8"];
const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];
const DEFAULT_STEM = "https://id.gs1.org";

const START: Identification = { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["17", "271231"]] };

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function App() {
  const [engine, setEngine] = useState<SyntaxEngine | null>(null);
  const [font, setFont] = useState<HriFont | null>(null);
  const [id, setId] = useState<Identification>(START);
  const [settings, setSettings] = useState<LabelSettings>({
    symbology: "dl-qrcode", environment: "", size: 100, hri: "full", version: null, error: "m", linear: "none",
    linearSize: null, hriAsText: false, dpi: 203, stem: DEFAULT_STEM, xMmManual: 0.495,
  });
  const [zplError, setZplError] = useState<string | null>(null);
  const [gcp, setGcp] = useState<GcpTable | null>(null);

  useEffect(() => {
    kept("gcp").then((text) => text && setGcp(GcpTable.fromCompact(text)), () => undefined);
    syntaxEngine().then(setEngine, (e: unknown) => console.error(e));
    fetch(fontUrl)
      .then((response) => response.arrayBuffer())
      .then((bytes) => setFont(HriFont.fromBytes(bytes)), (e: unknown) => console.error(e));
  }, []);

  const checked = useMemo((): { identified?: Identified; error?: string; markup?: string } => {
    if (!engine) return {};
    try {
      return { identified: identify(engine, id, settings.stem.trim() || DEFAULT_STEM) };
    } catch (error) {
      if (error instanceof InputError) return { error: error.message, markup: error.markup };
      if (error instanceof AttributeError) return { error: error.message };
      return { error: errorText(error) };
    }
  }, [engine, id, settings.stem]);

  // The key's scanning environments, its default first, and the sizes the environment allows.
  const environments = environmentsFor(id.key);
  const environment = environments.includes(settings.environment) ? settings.environment : environments[0]!;
  const laidOut = LAID_OUT.includes(settings.symbology);
  const twoD = TWO_D.includes(settings.symbology);
  // An EAN/UPC beside the 2D symbol only where it can be: a GTIN, in an environment with an EAN/UPC range. Otherwise
  // the choice is kept for later but not applied (its field is not shown).
  const linearPossible = twoD && id.key === "01" && Boolean(ENVIRONMENTS[environment]?.linear);
  const linearChoice = linearPossible ? settings.linear : "none";
  const effective: LabelSettings = { ...settings, environment, linear: linearChoice };
  const sizes = twoD
    ? sizesFor(environment, linearChoice !== "none" && settings.linearSize === null)
    : linearSizesFor(environment);
  const size = sizes.includes(settings.size) ? settings.size : sizes.includes(100) ? 100 : (sizes[0] ?? 100);
  effective.size = size;

  const label = useMemo((): { view: Omit<LabelView, "environments" | "sizes" | "laidOut" | "twoD" | "isQr" | "linearPossible">; data?: string; geometry?: SymbolGeometry } => {
    const identified = checked.identified;
    const base = { xMm: effective.xMmManual, uri: identified?.digitalLinkUri ?? "", elementString: identified?.elementString ?? "" };
    if (!identified || !font) return { view: { ...base, error: checked.error ?? (engine && font ? undefined : "Loading…") } };
    try {
      const { symbology } = effective;
      const data = dataFor(symbology, identified);
      if (!laidOut) {
        const geometry = encode(symbology, data);
        const quietZone = SYMBOLOGIES[symbology].kind === "linear" ? 10 : 2;
        return { view: { ...base, svg: toSvg(geometry, { xMm: effective.xMmManual, quietZone }), caption: `${SYMBOLOGIES[symbology].name} · X ${effective.xMmManual.toFixed(3)} mm` }, data, geometry };
      }
      const lines = identified.elements.map((e) => `(${e.ai})${e.value}`);
      const gtin = identified.elements.find((e) => e.ai === "01")?.value;
      let linear: LabelOptions["linear"] = null;
      if (twoD && effective.linear !== "none") {
        if (!gtin) throw new InputError("A linear barcode beside the 2D symbol needs a GTIN (01).");
        try {
          linear = symbolFor(gtin, effective.linear);
        } catch {
          throw new InputError(
            effective.linear === "upce"
              ? "UPC-E is only for a GTIN-12 that zero-suppresses."
              : "An EAN/UPC is only for GTINs of consumer units (indicator 0).",
          );
        }
      }
      const options: LabelOptions = {
        symbology, data, showHri: effective.hri !== "none", hriLines: effective.hri === "key" ? lines.slice(0, 1) : lines,
        version: effective.version, error: effective.error, environment, size, linear,
        linearSize: twoD ? effective.linearSize : null,
      };
      const layout = layoutLabel(options, font);
      const geometry = encode(symbology, data, symbology.endsWith("qrcode") ? { eclevel: effective.error.toUpperCase() as "M", ...(layout.version ? { version: layout.version } : {}) } : {});
      const wMm = layout.width * layout.xMm;
      const hMm = layout.height * layout.xMm;
      const symbolPart = layout.version
        ? `QR code version ${layout.version} · ${layout.modules} × ${layout.modules} modules · correction ${effective.error.toUpperCase()}`
        : layout.modules
          ? `${SYMBOLOGIES[symbology].name} · ${layout.modules} × ${layout.modules} modules`
          : SYMBOLOGIES[symbology].name;
      return {
        view: {
          ...base, xMm: layout.xMm, svg: labelSvg(options, layout, font, effective.hriAsText),
          caption: `${symbolPart} · X ${layout.xMm.toFixed(3)} mm · label ${wMm.toFixed(1)} × ${hMm.toFixed(1)} mm at 100 %`,
        },
        data, geometry,
      };
    } catch (error) {
      return { view: { ...base, error: errorText(error) } };
    }
  }, [checked, font, engine, effective.symbology, effective.xMmManual, effective.linear, effective.hri, effective.version, effective.error, effective.linearSize, effective.hriAsText, environment, size, laidOut, twoD]);

  const view: LabelView = {
    ...label.view, environments, sizes, laidOut, twoD, isQr: settings.symbology.endsWith("qrcode"), linearPossible,
  };

  // ZPL with the printer's own commands (ADR 0002); a label just large enough for the symbol, its quiet zones and text.
  function downloadZpl(template: boolean) {
    const { geometry, data } = label;
    if (!geometry || !data) return;
    const d = snapToDots(view.xMm, settings.dpi).dots;
    const quietZone = SYMBOLOGIES[settings.symbology].kind === "linear" ? 10 : 2;
    const barHeightDots = 50 * d;
    const textDots = Math.round((2.2 / 25.4) * settings.dpi);
    const symbolHeight = geometry.kind === "matrix" ? geometry.rows * d : barHeightDots;
    const options = {
      x: quietZone * d, y: quietZone * d, dotsPerModule: d, barHeightDots, dpi: settings.dpi,
      widthDots: (widthInModules(geometry) + 2 * quietZone) * d,
      heightDots: symbolHeight + 2 * quietZone * d + 6 * textDots,
    };
    try {
      const zpl = template ? zplTemplate(settings.symbology, data, options).zpl : zplLabel(settings.symbology, data, options);
      download(`${settings.symbology}${template ? "-template" : ""}.zpl`, zpl, "text/plain");
      setZplError(null);
    } catch (error) {
      setZplError(errorText(error));
    }
  }

  return (
    <>
      <header className="top">
        <h1>GS1 Label Studio</h1>
        <span>Everything stays in your browser.</span>
      </header>
      {view.svg && (
        <a className="mini" href="#label-title" aria-label="Live preview: go to the label">
          <span dangerouslySetInnerHTML={{ __html: view.svg }} />
          <span>Live preview · tap to go to the label</span>
        </a>
      )}
      <main className="editor">
        <IdentifyCard
          id={id}
          onChange={(next) => {
            setId(next);
            setZplError(null);
          }}
          onPaste={(text) => {
            if (!engine) throw new Error("The GS1 Barcode Syntax Engine is still loading.");
            const fields = fieldsOf(engine.parse(text));
            setId(fields);
            return fields;
          }}
          status={{ error: checked.error, markup: checked.markup, count: checked.identified?.elements.length }}
        />
        <LabelCard
          settings={effective}
          onChange={(next) => {
            setSettings(next);
            setZplError(null);
          }}
          view={view}
          onDownloadSvg={() => view.svg && download(`${settings.symbology}.svg`, view.svg, "image/svg+xml")}
          onDownloadZpl={downloadZpl}
          zplError={zplError}
        >
          <EpcSection id={id} stem={settings.stem} gcp={gcp} onGcp={setGcp} />
        </LabelCard>
      </main>
    </>
  );
}
