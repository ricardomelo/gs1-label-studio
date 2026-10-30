import { useEffect, useMemo, useState } from "react";
import {
  AttributeError,
  applyEdits,
  BARS,
  checkRows,
  correctedCsv,
  editCell,
  reportCsv,
  rowStatus,
  guessMapping,
  parseDelimited,
  parseTableFile,
  baseX,
  encodedCount,
  expectedReads,
  ENVIRONMENTS,
  environmentsFor,
  fieldsOf,
  fileName,
  HriFont,
  identify,
  InputError,
  generateBatch,
  labelFor,
  patternName,
  zplOptionsFor,
  uriParameters,
  sequenceTable,
  withSequence,
  type BatchRow,
  type LabelDesign,
  isDigitalLinkKey,
  ITF14_RATIO,
  labelEps,
  labelPdf,
  labelPng,
  labelSvg,
  labelZip,
  linearSizesFor,
  linearXDimension,
  pngAt,
  pngDpi,
  sizesFor,
  specificationFor,
  SYMBOLOGIES,
  syntaxEngine,
  xDimension,
  zplLabel,
  zplTemplate,
  GcpTable,
  guidance,
  SIZES,
  specSizesFor,
  walk,
  type Answers,
  type CellEdits,
  type ColumnMapping,
  type FixedValue,
  type Table,
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
import { BulkCard } from "./BulkCard.tsx";
import { EpcSection } from "./EpcSection.tsx";
import { GeneratePanel, type GenerateChoice } from "./GeneratePanel.tsx";
import { IdentifyCard } from "./IdentifyCard.tsx";
import { kept } from "./keep.ts";
import { LabelCard, type FileKind, type LabelSettings, type LabelView } from "./LabelCard.tsx";
import { chosen, ScanCard, type Choice } from "./ScanCard.tsx";
import { BULK_TEXTS, GUIDE_TEXTS } from "./texts.ts";

// One code: the resolver's editor without its records (ADR 0004, mock-ups approved on 28 October 2026) — what the
// code identifies and where it is scanned on the left (step 2, the guided choice: mock-up B of 29 October 2026), the
// label beside them on the right, redrawn as anything changes. Everything stays in the
// browser: the GS1 Barcode Syntax Engine and the encoder run here.

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];
const DEFAULT_STEM = "https://id.gs1.org";
const PNG_RESOLUTIONS = [300, 600, 1200]; // besides the PNG at the label's size (backlog 1.5)

const START: Identification = { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["17", "271231"]] };

function download(name: string, content: string | Uint8Array<ArrayBuffer>, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

// In bulk, the columns chosen for a file are kept for the next file with the same headers (localStorage: a convenience
// of this browser, never needed).
const mappingKey = (headers: string[]) => `gs1-label-studio.columns.${headers.join("\u001f")}`;
function rememberedColumns(headers: string[]): { mapping: ColumnMapping; fixed: FixedValue[] } | null {
  try {
    const kept = JSON.parse(localStorage.getItem(mappingKey(headers)) ?? "null") as { mapping: ColumnMapping; fixed: FixedValue[] } | null;
    return kept && kept.mapping.length === headers.length ? kept : null;
  } catch {
    return null;
  }
}
function rememberColumns(headers: string[], mapping: ColumnMapping, fixed: FixedValue[]) {
  try {
    localStorage.setItem(mappingKey(headers), JSON.stringify({ mapping, fixed }));
  } catch {
    // Not kept: the guess is made again next time.
  }
}

export function App({ onStartOver }: { onStartOver?: () => void }) {
  const [engine, setEngine] = useState<SyntaxEngine | null>(null);
  const [font, setFont] = useState<HriFont | null>(null);
  const [id, setId] = useState<Identification>(START);
  const [settings, setSettings] = useState<LabelSettings>({
    symbology: "dl-qrcode", environment: "", size: 100, hri: "full", version: null, error: "m", linear: "none",
    linearSize: null, hriAsText: false, dpi: 203, stem: DEFAULT_STEM, bearer: "frame", reduction: 0, pngResolution: null,
    hriPosition: "below", hriHeightMm: null,
    expert: false,
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [picked, setPicked] = useState<Choice | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [gcp, setGcp] = useState<GcpTable | null>(null);
  // In bulk (backlog 2.1): the rows, each column's AI, the values every row takes, and the row shown.
  const [mode, setMode] = useState<"one" | "bulk">("one");
  const [dataTable, setDataTable] = useState<Table | null>(null);
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [fixed, setFixed] = useState<FixedValue[]>([]);
  const [rowIndex, setRowIndex] = useState(0);
  const [tableError, setTableError] = useState<string | null>(null);
  // The validation report (backlog 2.2): values fixed in the studio and rows skipped, until another file is taken.
  const [edits, setEdits] = useState<CellEdits>({});
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  // Generating every row (backlog 2.4): its progress while it runs, then what was made.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generated, setGenerated] = useState<{ result: string | null; error: string | null }>({ result: null, error: null });

  useEffect(() => {
    kept("gcp").then((text) => text && setGcp(GcpTable.fromCompact(text)), () => undefined);
    syntaxEngine().then(setEngine, (e: unknown) => console.error(e));
    fetch(fontUrl)
      .then((response) => response.arrayBuffer())
      .then((bytes) => setFont(HriFont.fromBytes(bytes)), (e: unknown) => console.error(e));
  }, []);

  const rows = useMemo(
    () => (engine && dataTable
      ? checkRows(engine, applyEdits(dataTable, edits), mapping, fixed, settings.stem.trim() || DEFAULT_STEM)
      : []),
    [engine, dataTable, edits, mapping, fixed, settings.stem],
  );
  const bulk = mode === "bulk";
  const current = bulk ? rows[Math.min(rowIndex, rows.length - 1)] : undefined;
  // What the steps after the first work from: the identification typed, or the row shown.
  const active: Identification = bulk ? (current?.id ?? id) : id;

  function takeTable(next: Table, name: string) {
    const kept = rememberedColumns(next.headers);
    setDataTable(next);
    setSource(name);
    setMapping(kept?.mapping ?? guessMapping(next.headers));
    setFixed(kept?.fixed ?? []);
    setRowIndex(0);
    setEdits({});
    setSkipped(new Set());
    setGenerated({ result: null, error: null });
    setTableError(null);
    setFileError(null);
  }

  const checked = useMemo((): { identified?: Identified; error?: string; markup?: string } => {
    if (bulk) {
      if (!dataTable) return { error: BULK_TEXTS.noRows };
      if (!current) return { error: "The file has no data rows." };
      return current.identified ? { identified: current.identified } : { error: `Row ${current.row}: ${current.error}` };
    }
    if (!engine) return {};
    try {
      return { identified: identify(engine, id, settings.stem.trim() || DEFAULT_STEM) };
    } catch (error) {
      if (error instanceof InputError) return { error: error.message, markup: error.markup };
      if (error instanceof AttributeError) return { error: error.message };
      return { error: errorText(error) };
    }
  }, [engine, id, settings.stem, bulk, dataTable, current]);

  // Step 2: the decision tree walked with the answers so far; at a leaf, the symbols its table allows for this data
  // and the one chosen (the recommended one unless another was picked). Until then, or when the person chooses the
  // symbol themselves, the label's own fields decide.
  const walked = walk(active.key, answers);
  const guide = walked.leaf && checked.identified ? guidance(walked.leaf, checked.identified) : null;
  const guided = guide !== null && !settings.expert;
  const choice = guided ? chosen(guide, picked) : null;
  const chosenSymbol = choice ? (choice.with ?? choice.symbol) : settings.symbology;
  // A key a GS1 Digital Link URI cannot carry ((03), backlog 1.11) is drawn in GS1 DataMatrix, not a symbol for a URI.
  const symbology = !isDigitalLinkKey(active.key) && SYMBOLOGIES[chosenSymbol].data === "uri" ? "gs1-datamatrix" : chosenSymbol;
  // A symbol chosen alone that carries the GTIN alone (an EAN-13 alone, with a batch typed): it draws the GTIN.
  const gtinOnly = Boolean(choice && !choice.with && guide?.options.find((o) => o.symbol === choice.symbol)?.carries === "key");

  // The key's scanning environments, its default first; for ITF-14, GS1-128 and GS1 DataBar, those whose table allows
  // the symbol. Guided, the table of step 2 decides.
  const bars = BARS.includes(symbology);
  const allowed = (name: string) => !bars || Boolean(specificationFor(ENVIRONMENTS[name]!.table, symbology));
  const environments = environmentsFor(active.key).filter(allowed);
  const environment: string | null = guided
    ? guide.environment && environmentsFor(active.key).includes(guide.environment) ? guide.environment : null
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
  const linearPossible = !guided && twoD && active.key === "01" && Boolean(environment && ENVIRONMENTS[environment]?.linear);
  const linearChoice = choice ? (choice.with ? (choice.symbol === "upce" ? "upce" : "auto") : "none") : linearPossible ? settings.linear : "none";
  const effective: LabelSettings = { ...settings, symbology, environment: environment ?? "", linear: linearChoice };
  const sizes = spec
    ? specSizesFor(spec, SIZES)
    : environment === null ? [] : twoD ? sizesFor(environment, linearChoice !== "none" && settings.linearSize === null) : linearSizesFor(environment);
  const size = sizes.includes(settings.size) ? settings.size : sizes.includes(100) ? 100 : (sizes[0] ?? 100);
  effective.size = size;
  const blocked = guided && !choice
    ? guide.together ? `${GUIDE_TEXTS.together} ${GUIDE_TEXTS.togetherLater}`
    : guide.waiting ? `${GUIDE_TEXTS.waiting} ${guide.options.find((o) => o.symbol === guide.waiting)?.name}.` : GUIDE_TEXTS.nothing
    : !spec && environment === null ? `No scanning environment of this key allows ${SYMBOLOGIES[symbology].name}: choose it in step 2.`
    : null;

  // The label's design, the same for the code typed and for every row in bulk (backlog 2.4).
  const design = useMemo((): LabelDesign => ({
    symbology, hri: effective.hri, version: effective.version, error: effective.error, environment: environment ?? undefined,
    size, linear: effective.linear, linearSize: effective.linearSize, ...(spec ? { spec, table } : {}),
    bearer: effective.bearer, reduction: effective.reduction, gtinOnly,
    // Beside an EAN/UPC, a 2D symbol's text stays below or above it (backlog 1.16)
    hriPosition: effective.linear !== "none" && (effective.hriPosition === "left" || effective.hriPosition === "right") ? "below" : effective.hriPosition,
    ...(effective.hriHeightMm ? { hriHeightMm: effective.hriHeightMm } : {}),
  }), [symbology, effective.hri, effective.version, effective.error, environment, size, effective.linear, effective.linearSize, spec, table, effective.bearer, effective.reduction, gtinOnly, effective.hriPosition, effective.hriHeightMm]);

  // What the files are drawn from: the label's options and layout (a symbol without a layout yet: the symbol alone).
  const label = useMemo((): {
    view: Omit<LabelView, "environments" | "sizes" | "twoD" | "isQr" | "linearPossible" | "bars">;
    data?: string;
    geometry?: SymbolGeometry;
    options?: LabelOptions;
    layout?: Layout;
  } => {
    const identified = checked.identified;
    const base = {
      xMm: spec ? (baseX(spec) * size) / 100 : !environment ? 0.495 : twoD ? xDimension(environment, size) : linearXDimension(environment, size), uri: identified?.digitalLinkUri ?? "", elementString: identified?.elementString ?? "",
    };
    if (!identified || !font) return { view: { ...base, error: checked.error ?? (engine && font ? undefined : "Loading…") } };
    if (blocked) return { view: { ...base, error: blocked } };
    try {
      const { symbology } = effective;
      const { data, options, layout, geometry } = labelFor(identified, design, font);
      const wMm = layout.width * layout.xMm;
      const hMm = layout.height * layout.xMm;
      // The modules in all (a matrix's rows times its columns, a linear symbol's width) and the characters encoded,
      // FNC1 and group separators included (the owner's request of 30 October 2026), at the end of the caption.
      const matrix = geometry.kind === "matrix"
        ? `${geometry.rows} × ${geometry.cols} = ${(geometry.rows * geometry.cols).toLocaleString("en-GB")} modules`
        : "";
      const count = encodedCount(symbology, gtinOnly ? { ...identified, elements: identified.elements.filter((e) => e.ai === "01") } : identified, data);
      const marks = [count.fnc1 ? "FNC1" : "", count.separators ? `${count.separators} group separator${count.separators === 1 ? "" : "s"}` : ""]
        .filter(Boolean).join(" and ");
      const tail = [
        // From the first bar to the last (bwip-js may end the widths with a space); ITF-14 as the layout draws it, its
        // wide bars at the ratio 2.5 (bwip-js gives 2)
        geometry.kind === "linear"
          ? `${geometry.widths.slice(0, geometry.widths.length % 2 ? undefined : -1)
            .reduce((sum, w) => sum + (symbology === "itf14" && w > 1 ? ITF14_RATIO : w), 0)} modules wide`
          : "",
        `${count.characters} characters encoded${marks ? ` (${marks} included)` : ""}`,
      ].filter(Boolean).join(" · ");
      const symbolPart = layout.version
        ? `QR code version ${layout.version} · ${matrix} · correction ${effective.error.toUpperCase()}`
        : layout.modules
          ? `${SYMBOLOGIES[symbology].name} · ${matrix}`
          : layout.barHeight !== undefined
            ? `${SYMBOLOGIES[symbology].name} · bars ${(layout.barHeight * layout.xMm).toFixed(2)} mm`
            : SYMBOLOGIES[symbology].name;
      return {
        view: {
          ...base, xMm: layout.xMm, svg: labelSvg(options, layout, font, effective.hriAsText), pngDpi: pngDpi(layout),
          widthMm: wMm, heightMm: hMm, expected: expectedReads(options),
          pngResolutions: PNG_RESOLUTIONS.map((dpi) => pngAt(layout, dpi)),
          hasBars: Boolean(layout.barRects && layout.barRects[1] > layout.barRects[0]),
          caption: `${symbolPart} · X ${layout.xMm.toFixed(3)} mm · label ${wMm.toFixed(1)} × ${hMm.toFixed(1)} mm at 100 % · ${tail}`,
        },
        data, geometry, options, layout,
      };
    } catch (error) {
      return { view: { ...base, error: errorText(error) } };
    }
  }, [checked, gtinOnly, font, engine, blocked, spec, design, effective.symbology, effective.hriAsText, effective.error, environment, size, twoD]);

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
    const { geometry, data, options, layout } = label;
    if (!geometry || !data || !options || !layout) return;
    const zplOptions = zplOptionsFor({ geometry, data, options, layout }, design, settings.dpi);
    try {
      const zpl = template ? zplTemplate(symbology, data, zplOptions).zpl : zplLabel(symbology, data, zplOptions);
      download(`${name}${template ? "-template" : ""}.zpl`, zpl, "text/plain");
      setFileError(null);
    } catch (error) {
      setFileError(errorText(error));
    }
  }

  // The files' name, as the resolver named them: the symbol, the key and its qualifiers.
  const qualifiers = Object.entries(active.qualifiers).filter(([, v]) => v.trim()).map(([q, v]) => `_${q}_${v.trim()}`);
  const name = fileName(`${symbology}_${active.key}_${active.value.trim()}${qualifiers.join("")}`);

  async function downloadFile(kind: FileKind) {
    const { options, layout } = label;
    if (!view.svg || !options || !layout || !font) return;
    try {
      if (kind === "svg") download(`${name}.svg`, view.svg, "image/svg+xml");
      if (kind === "png") {
        const chosen = settings.pngResolution ? pngAt(layout, settings.pngResolution) : null;
        const png = chosen ? await labelPng(layout, font, chosen.pixelsPerModule, chosen.dpi) : await labelPng(layout, font);
        download(`${name}.png`, png, "image/png");
      }
      if (kind === "pdf") download(`${name}.pdf`, await labelPdf(options, layout, font), "application/pdf");
      if (kind === "eps") download(`${name}.eps`, labelEps(options, layout, font), "application/postscript");
      if (kind === "zip") download(`${name}.zip`, await labelZip(options, layout, font, name, view.svg), "application/zip");
      setFileError(null);
    } catch (error) {
      setFileError(errorText(error));
    }
  }

  // In bulk: every row ready or fixed drawn with the label's design, in one zip (backlog 2.4).
  const batchRows: BatchRow[] = rows.map((row, index) => ({
    row: row.row, ...(row.identified ? { identified: row.identified } : {}), ...(row.error ? { error: row.error } : {}),
    ...(skipped.has(index) ? { skipped: true } : {}),
  }));
  const readyRows = batchRows.filter((row) => row.identified && !row.skipped);
  async function generate(choice: GenerateChoice) {
    if (!font) return;
    setGenerated({ result: null, error: null });
    setProgress({ done: 0, total: readyRows.length });
    try {
      const result = await generateBatch(batchRows, { ...choice, design, pngResolution: settings.pngResolution, hriAsText: settings.hriAsText },
        font, (done, total) => setProgress({ done, total }));
      const stem = source.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "rows";
      download(`${stem}_labels.zip`, result.zip, "application/zip");
      setGenerated({
        result: `${result.generated} ${result.generated === 1 ? "label" : "labels"} generated` +
          (result.left ? `; ${result.left} ${result.left === 1 ? "row" : "rows"} left out, each with its reason in generated.csv.` : "."),
        error: null,
      });
    } catch (error) {
      setGenerated({ result: null, error: errorText(error) });
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <header className="top">
        <h1>GS1 Label Studio</h1>
        <span className="mode" role="group" aria-label="Mode">
          <button type="button" aria-pressed={!bulk} onClick={() => setMode("one")}>
            One code
          </button>
          <button type="button" aria-pressed={bulk} onClick={() => setMode("bulk")}>
            In bulk
          </button>
        </span>
        <span>Everything stays in your browser, and it works offline.</span>
        <button
          type="button"
          className="start-over"
          title="Clears the data and every choice, as on a first visit"
          onClick={() => {
            if (dataTable && !window.confirm("Clear the rows, the fixes and every choice, and start over?")) return;
            onStartOver?.();
          }}
        >
          Start over
        </button>
      </header>
      {view.svg && (
        <a className="mini" href="#label-title" aria-label="Live preview: go to the label">
          <span dangerouslySetInnerHTML={{ __html: view.svg }} />
          <span>Live preview · tap to go to the label</span>
        </a>
      )}
      <main className="editor">
        <div className="steps">
          {bulk ? (
            <BulkCard
              table={dataTable}
              source={source}
              mapping={mapping}
              fixed={fixed}
              rows={rows}
              edits={edits}
              skipped={skipped}
              error={tableError}
              onFile={(file) => {
                file.arrayBuffer()
                  .then((bytes) => parseTableFile(new Uint8Array(bytes)))
                  .then((next) => takeTable(next, file.name), (error: unknown) => setTableError(errorText(error)));
              }}
              onPaste={(text) => {
                try {
                  takeTable(parseDelimited(text), "Pasted rows");
                } catch (error) {
                  setTableError(errorText(error));
                }
              }}
              onSequence={(sequence, as) => {
                try {
                  if (as === "rows" || !dataTable) {
                    takeTable(sequenceTable(sequence), sequence.kind === "sscc" ? "SSCCs made here" : "Serial numbers made here");
                  } else {
                    // A column after the others: the fixes, the rows skipped and the columns chosen stay as they are
                    const next = withSequence(dataTable, sequence);
                    const nextMapping = [...mapping, sequence.kind === "sscc" ? "00" : "21"];
                    setDataTable(next);
                    setMapping(nextMapping);
                    setSource(`${source} + ${sequence.kind === "sscc" ? "SSCCs" : "serial numbers"}`);
                    rememberColumns(next.headers, nextMapping, fixed);
                    setTableError(null);
                  }
                } catch (error) {
                  setTableError(errorText(error));
                }
              }}
              onMapping={(next) => {
                setMapping(next);
                if (dataTable) rememberColumns(dataTable.headers, next, fixed);
              }}
              onFixed={(next) => {
                setFixed(next);
                if (dataTable) rememberColumns(dataTable.headers, mapping, next);
              }}
              onShow={(index) => {
                setRowIndex(index);
                setFileError(null);
              }}
              onEdit={(index, column, value) => dataTable && setEdits(editCell(edits, dataTable, index, column, value))}
              onUndo={(index) => {
                const next = { ...edits };
                delete next[index];
                setEdits(next);
              }}
              onSkip={(indexes, skip) => {
                const next = new Set(skipped);
                for (const index of indexes) {
                  if (skip) next.add(index);
                  else next.delete(index);
                }
                setSkipped(next);
              }}
              onDownload={(what) => {
                if (!dataTable) return;
                const stem = source.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "rows";
                if (what === "report") download(`${stem}_report.csv`, reportCsv(dataTable, mapping, rows, edits, skipped), "text/csv");
                else download(`${stem}_corrected.csv`, correctedCsv(dataTable, edits), "text/csv");
              }}
            />
          ) : (
          <IdentifyCard
            id={id}
            onChange={(next) => {
              setId(next);
              setFileError(null);
            }}
            onPaste={(text) => {
              if (!engine) throw new Error("The GS1 Barcode Syntax Engine is still loading.");
              // The URI's own parameters, which the engine leaves out (backlog 1.17)
              const parameters = uriParameters(text);
              const fields = { ...fieldsOf(engine.parse(text)), ...(parameters.length ? { parameters } : {}) };
              setId(fields);
              return fields;
            }}
            status={{ error: checked.error, markup: checked.markup, count: checked.identified?.elements.length }}
          />
          )}
          <ScanCard
            identifierKey={active.key}
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
          rows={bulk && rows.length
            ? {
                index: Math.min(rowIndex, rows.length - 1), count: rows.length, row: current?.row ?? 2,
                status: current ? rowStatus(current, Math.min(rowIndex, rows.length - 1), edits, skipped) : "error",
                onMove: (index) => {
                  setRowIndex(index);
                  setFileError(null);
                },
              }
            : undefined}
          fileError={fileError}
          generate={bulk && rows.length
            ? (
                <GeneratePanel
                  ready={blocked || !font ? 0 : readyRows.length}
                  left={batchRows.length - readyRows.length}
                  example={(pattern) => readyRows[0] ? patternName(pattern, readyRows[0].row, symbology, readyRows[0].identified!) : null}
                  dpi={settings.dpi}
                  {...(view.widthMm && view.heightMm ? { labelMm: [view.widthMm, view.heightMm] as const } : {})}
                  progress={progress}
                  result={generated.result}
                  error={blocked ?? generated.error}
                  onGenerate={(choice) => void generate(choice)}
                />
              )
            : undefined}
        >
          <EpcSection id={active} stem={settings.stem} gcp={gcp} onGcp={setGcp} />
        </LabelCard>
      </main>
    </>
  );
}
