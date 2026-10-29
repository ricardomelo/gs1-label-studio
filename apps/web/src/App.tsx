import { useEffect, useMemo, useState } from "react";
import {
  AttributeError,
  BARS,
  baseX,
  dataFor,
  encode,
  expectedReads,
  ENVIRONMENTS,
  environmentsFor,
  fieldsOf,
  fileName,
  HriFont,
  identify,
  InputError,
  labelPdf,
  labelPng,
  labelSvg,
  labelZip,
  layoutLabel,
  linearSizesFor,
  linearXDimension,
  pngDpi,
  sizesFor,
  snapToDots,
  specificationFor,
  symbolFor,
  SYMBOLOGIES,
  syntaxEngine,
  widthInModules,
  xDimension,
  zplLabel,
  zplTemplate,
  GcpTable,
  guidance,
  SIZES,
  specSizesFor,
  walk,
  type Answers,
  type Identification,
  type Identified,
  type LabelOptions,
  type Layout,
  type SymbolGeometry,
  type SymbolSpecification,
  type SyntaxEngine,
  type SymbologyId,
} from "@gs1-label-studio/core";
import fontUrl from "@gs1-label-studio/core/assets/fonts/LiberationSans-Regular.ttf?url";
import { EpcSection } from "./EpcSection.tsx";
import { IdentifyCard } from "./IdentifyCard.tsx";
import { kept } from "./keep.ts";
import { LabelCard, type FileKind, type LabelSettings, type LabelView } from "./LabelCard.tsx";
import { chosen, ScanCard, type Choice } from "./ScanCard.tsx";
import { GUIDE_TEXTS } from "./texts.ts";

// One code: the resolver's editor without its records (ADR 0004, mock-ups approved on 28 October 2026) — what the
// code identifies and where it is scanned on the left (step 2, the guided choice: mock-up B of 29 October 2026), the
// label beside them on the right, redrawn as anything changes. Everything stays in the
// browser: the GS1 Barcode Syntax Engine and the encoder run here.

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];
const DEFAULT_STEM = "https://id.gs1.org";

const START: Identification = { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["17", "271231"]] };

function download(name: string, content: string | Uint8Array<ArrayBuffer>, type: string) {
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
    linearSize: null, hriAsText: false, dpi: 203, stem: DEFAULT_STEM, bearer: "frame", expert: false,
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [picked, setPicked] = useState<Choice | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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

  // Step 2: the decision tree walked with the answers so far; at a leaf, the symbols its table allows for this data
  // and the one chosen (the recommended one unless another was picked). Until then, or when the person chooses the
  // symbol themselves, the label's own fields decide.
  const walked = walk(id.key, answers);
  const guide = walked.leaf && checked.identified ? guidance(walked.leaf, checked.identified) : null;
  const guided = guide !== null && !settings.expert;
  const choice = guided ? chosen(guide, picked) : null;
  const symbology = choice ? (choice.with ?? choice.symbol) : settings.symbology;
  // A symbol chosen alone that carries the GTIN alone (an EAN-13 alone, with a batch typed): it draws the GTIN.
  const gtinOnly = Boolean(choice && !choice.with && guide?.options.find((o) => o.symbol === choice.symbol)?.carries === "key");

  // The key's scanning environments, its default first; for ITF-14, GS1-128 and GS1 DataBar, those whose table allows
  // the symbol. Guided, the table of step 2 decides.
  const bars = BARS.includes(symbology);
  const allowed = (name: string) => !bars || Boolean(specificationFor(ENVIRONMENTS[name]!.table, symbology));
  const environments = environmentsFor(id.key).filter(allowed);
  const environment: string | null = guided
    ? guide.environment && environmentsFor(id.key).includes(guide.environment) ? guide.environment : null
    : environments.includes(settings.environment) ? settings.environment : (environments[0] ?? null);
  // The table's row that sizes the symbol: ITF-14, GS1-128 and GS1 DataBar always; a 2D symbol of a table without a
  // scanning environment (12, 13). The others are sized by the scanning environment, as the resolver sized them.
  const option = guided ? guide.options.find((o) => o.symbol === symbology) : undefined;
  const table = guided ? guide.leaf.table : environment ? ENVIRONMENTS[environment]!.table : undefined;
  const spec: SymbolSpecification | undefined = !bars && environment !== null
    ? undefined
    : option ? (option.specs.find((row) => row.part) ?? option.specs[0])
    : table !== undefined ? specificationFor(table, symbology) : undefined;
  const twoD = TWO_D.includes(symbology);
  // An EAN/UPC beside the 2D symbol only where it can be: a GTIN, in an environment with an EAN/UPC range. Otherwise
  // the choice is kept for later but not applied (its field is not shown). Guided, the choice of step 2 decides.
  const linearPossible = !guided && twoD && id.key === "01" && Boolean(environment && ENVIRONMENTS[environment]?.linear);
  const linearChoice = choice ? (choice.with ? (choice.symbol === "upce" ? "upce" : "auto") : "none") : linearPossible ? settings.linear : "none";
  const effective: LabelSettings = { ...settings, symbology, environment: environment ?? "", linear: linearChoice };
  const sizes = spec
    ? specSizesFor(spec, SIZES)
    : environment === null ? [] : twoD ? sizesFor(environment, linearChoice !== "none" && settings.linearSize === null) : linearSizesFor(environment);
  const size = sizes.includes(settings.size) ? settings.size : sizes.includes(100) ? 100 : (sizes[0] ?? 100);
  effective.size = size;
  const linearKind = SYMBOLOGIES[symbology].kind !== "matrix";
  const blocked = guided && !choice
    ? guide.together ? `${GUIDE_TEXTS.together} ${GUIDE_TEXTS.togetherLater}`
    : guide.waiting ? `${GUIDE_TEXTS.waiting} ${guide.options.find((o) => o.symbol === guide.waiting)?.name}.` : GUIDE_TEXTS.nothing
    : !spec && environment === null ? `No scanning environment of this key allows ${SYMBOLOGIES[symbology].name}: choose it in step 2.`
    : null;

  // What the files are drawn from: the label's options and layout (a symbol without a layout yet: the symbol alone).
  const label = useMemo((): {
    view: Omit<LabelView, "environments" | "sizes" | "twoD" | "isQr" | "linearPossible" | "bars">;
    data?: string;
    geometry?: SymbolGeometry;
    options?: LabelOptions;
    layout?: Layout;
  } => {
    const identified = checked.identified && gtinOnly
      ? { ...checked.identified, elements: checked.identified.elements.filter((e) => e.ai === "01") }
      : checked.identified;
    const base = {
      xMm: spec ? (baseX(spec) * size) / 100 : !environment ? 0.495 : twoD ? xDimension(environment, size) : linearXDimension(environment, size), uri: identified?.digitalLinkUri ?? "", elementString: identified?.elementString ?? "",
    };
    if (!identified || !font) return { view: { ...base, error: checked.error ?? (engine && font ? undefined : "Loading…") } };
    if (blocked) return { view: { ...base, error: blocked } };
    try {
      const { symbology } = effective;
      const data = dataFor(symbology, identified);
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
        version: effective.version, error: effective.error, environment: environment ?? undefined, size, linear,
        linearSize: twoD ? effective.linearSize : null, ...(spec ? { spec, table } : {}), bearer: effective.bearer,
      };
      const layout = layoutLabel(options, font);
      const geometry = encode(symbology, data, symbology.endsWith("qrcode") ? { eclevel: effective.error.toUpperCase() as "M", ...(layout.version ? { version: layout.version } : {}) } : {});
      const wMm = layout.width * layout.xMm;
      const hMm = layout.height * layout.xMm;
      const symbolPart = layout.version
        ? `QR code version ${layout.version} · ${layout.modules} × ${layout.modules} modules · correction ${effective.error.toUpperCase()}`
        : layout.modules
          ? `${SYMBOLOGIES[symbology].name} · ${layout.modules} × ${layout.modules} modules`
          : layout.barHeight !== undefined
            ? `${SYMBOLOGIES[symbology].name} · bars ${(layout.barHeight * layout.xMm).toFixed(2)} mm`
            : SYMBOLOGIES[symbology].name;
      return {
        view: {
          ...base, xMm: layout.xMm, svg: labelSvg(options, layout, font, effective.hriAsText), pngDpi: pngDpi(layout),
          widthMm: wMm, heightMm: hMm, expected: expectedReads(options),
          caption: `${symbolPart} · X ${layout.xMm.toFixed(3)} mm · label ${wMm.toFixed(1)} × ${hMm.toFixed(1)} mm at 100 %`,
        },
        data, geometry, options, layout,
      };
    } catch (error) {
      return { view: { ...base, error: errorText(error) } };
    }
  }, [checked, gtinOnly, font, engine, blocked, spec, table, effective.symbology, effective.linear, effective.hri, effective.version, effective.error, effective.linearSize, effective.hriAsText, effective.bearer, environment, size, twoD]);

  const view: LabelView = {
    ...label.view, environments, sizes, twoD, bars, isQr: symbology.endsWith("qrcode"), linearPossible,
    ...(guided && walked.leaf
      ? {
          guided: {
            summary: choice
              ? choice.with
                ? `${SYMBOLOGIES[choice.symbol].name} with a ${SYMBOLOGIES[choice.with].name} beside it`
                : SYMBOLOGIES[choice.symbol].name
              : "No symbol yet",
            table: walked.leaf.table,
            application: walked.leaf.application,
          },
        }
      : {}),
    ...(spec ? { sizeBase: baseX(spec) } : {}),
  };

  // ZPL with the printer's own commands (ADR 0002); a label just large enough for the symbol, its quiet zones and text.
  function downloadZpl(template: boolean) {
    const { geometry, data } = label;
    if (!geometry || !data) return;
    const d = snapToDots(view.xMm, settings.dpi).dots;
    const quietZone = linearKind ? 10 : 2;
    const barHeightDots = Math.round((label.layout?.barHeight ?? 50) * d);
    const textDots = Math.round((2.2 / 25.4) * settings.dpi);
    const symbolHeight = geometry.kind === "matrix" ? geometry.rows * d : barHeightDots;
    const options = {
      x: quietZone * d, y: quietZone * d, dotsPerModule: d, barHeightDots, dpi: settings.dpi,
      widthDots: (widthInModules(geometry) + 2 * quietZone) * d,
      heightDots: symbolHeight + 2 * quietZone * d + 6 * textDots,
    };
    try {
      const zpl = template ? zplTemplate(symbology, data, options).zpl : zplLabel(symbology, data, options);
      download(`${name}${template ? "-template" : ""}.zpl`, zpl, "text/plain");
      setFileError(null);
    } catch (error) {
      setFileError(errorText(error));
    }
  }

  // The files' name, as the resolver named them: the symbol, the key and its qualifiers.
  const qualifiers = Object.entries(id.qualifiers).filter(([, v]) => v.trim()).map(([q, v]) => `_${q}_${v.trim()}`);
  const name = fileName(`${symbology}_${id.key}_${id.value.trim()}${qualifiers.join("")}`);

  async function downloadFile(kind: FileKind) {
    const { options, layout } = label;
    if (!view.svg || !options || !layout || !font) return;
    try {
      if (kind === "svg") download(`${name}.svg`, view.svg, "image/svg+xml");
      if (kind === "png") download(`${name}.png`, await labelPng(layout, font), "image/png");
      if (kind === "pdf") download(`${name}.pdf`, await labelPdf(options, layout, font), "application/pdf");
      if (kind === "zip") download(`${name}.zip`, await labelZip(options, layout, font, name, view.svg), "application/zip");
      setFileError(null);
    } catch (error) {
      setFileError(errorText(error));
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
        <div className="steps">
          <IdentifyCard
            id={id}
            onChange={(next) => {
              setId(next);
              setFileError(null);
            }}
            onPaste={(text) => {
              if (!engine) throw new Error("The GS1 Barcode Syntax Engine is still loading.");
              const fields = fieldsOf(engine.parse(text));
              setId(fields);
              return fields;
            }}
            status={{ error: checked.error, markup: checked.markup, count: checked.identified?.elements.length }}
          />
          <ScanCard
            identifierKey={id.key}
            walked={walked}
            guide={guide}
            dataError={checked.error}
            answers={answers}
            onAnswer={(question, answer) => {
              setAnswers({ ...answers, [question]: answer });
              setPicked(null);
            }}
            choice={choice}
            onPick={setPicked}
            expert={settings.expert}
            onExpert={(expert) =>
              // Choosing it yourself starts from the guided choice.
              setSettings(expert ? { ...settings, expert, symbology, linear: linearChoice, environment: environment ?? settings.environment } : { ...settings, expert })
            }
          />
        </div>
        <LabelCard
          settings={effective}
          onChange={(next) => {
            setSettings(next);
            setFileError(null);
          }}
          view={view}
          onDownload={(kind) => void downloadFile(kind)}
          onDownloadZpl={downloadZpl}
          fileError={fileError}
        >
          <EpcSection id={id} stem={settings.stem} gcp={gcp} onGcp={setGcp} />
        </LabelCard>
      </main>
    </>
  );
}
