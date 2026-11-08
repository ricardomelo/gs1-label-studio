import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AttributeError,
  applyEdits,
  BARS,
  checkRows,
  correctedCsv,
  editCell,
  reportCsv,
  rowCells,
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
  fieldColumns,
  fileName,
  HriFont,
  identify,
  InputError,
  labelFor,
  patternFields,
  patternName,
  zplOptionsFor,
  printFileFor,
  printWidthDots,
  type DrawnLabel,
  languageOf,
  PRINTER_LANGUAGES,
  GENERIC_PROFILES,
  moduleChoice,
  printWidthProblem,
  type PrinterProfile,
  uriParameters,
  parseElementString,
  LOGISTIC_SIZES,
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
  readWork,
  workFile,
  zplWithWork,
  type Work,
} from "@gs1-label-studio/core";
import fontUrl from "@gs1-label-studio/core/assets/fonts/LiberationSans-Regular.ttf?url";
import { About } from "./About.tsx";
import { BulkCard } from "./BulkCard.tsx";
import { EpcSection } from "./EpcSection.tsx";
import { SignSection } from "./SignSection.tsx";
import { keepProfiles, keptProfiles, PrinterSection } from "./PrinterSection.tsx";
import { DEFAULT_STEM, openedSettings, savedSettings, START_SETTINGS } from "./work.ts";
import { keptWork, LAST_WORK, workKey, workSummary, workToKeep, type KeptWork } from "./lastwork.ts";
import type { GenerateMessage } from "./generate.worker.ts";
import { GeneratePanel, type GenerateChoice } from "./GeneratePanel.tsx";
import { IdentifyCard } from "./IdentifyCard.tsx";
import { keep, kept } from "./keep.ts";
import { symbolSizing } from "./resize.ts";
import { elementName } from "./Designer.tsx";
import { LabelCard, type FileKind, type LabelSettings, type LabelView } from "./LabelCard.tsx";
import { chosen, ScanCard, type Choice } from "./ScanCard.tsx";
import { BULK_TEXTS, GUIDE_TEXTS } from "./texts.ts";
import { TabBar } from "./TabBar.tsx";
import { InstallApp } from "./InstallApp.tsx";
import { paneOf, PHONE_QUERY, TABLET_QUERY, useMedia, type Pane } from "./layout.ts";
import { LOCALES, locale, t, tm, formatNumber, type Locale } from "./i18n.ts";

// One code: the resolver's editor without its records (ADR 0004, mock-ups approved on 28 October 2026) — what the
// code identifies and where it is scanned on the left (step 2, the guided choice: mock-up B of 29 October 2026), the
// label beside them on the right, redrawn as anything changes. Everything stays in the
// browser: the GS1 Barcode Syntax Engine and the encoder run here.

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];
const PNG_RESOLUTIONS = [300, 600, 1200]; // besides the PNG at the label's size (backlog 1.5)

const START: Identification = { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["17", "271231"]] };

function download(name: string, content: string | Uint8Array<ArrayBuffer>, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

// A print file is text, or bytes when EPL2 sends an image (GW): then not text, so that nothing changes its bytes
const printFileType = (file: string | Uint8Array) => (typeof file === "string" ? "text/plain" : "application/octet-stream");

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

export function App({ onStartOver, onLocale }: { locale?: Locale; onStartOver?: () => void; onLocale?: (locale: Locale) => void }) {
  const lang = locale();
  const [engine, setEngine] = useState<SyntaxEngine | null>(null);
  const [font, setFont] = useState<HriFont | null>(null);
  const [id, setId] = useState<Identification>(START);
  const [settings, setSettings] = useState<LabelSettings>(START_SETTINGS);
  const [answers, setAnswers] = useState<Answers>({});
  const [picked, setPicked] = useState<Choice | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [gcp, setGcp] = useState<GcpTable | null>(null);
  // The printer the ZPL files are for (backlog 3.1): its profile, and the module's whole dots chosen (null: the nearest
  // within the table's range).
  const [profiles, setProfiles] = useState<PrinterProfile[]>(keptProfiles);
  const [profile, setProfile] = useState<PrinterProfile>(GENERIC_PROFILES.find((p) => p.dpi === 203)!);
  const [zplDots, setZplDots] = useState<number | null>(null);
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
  // The work saved or opened (backlog 4.3): what happened, in words, under the header.
  const [workNote, setWorkNote] = useState<{ text: string; error: boolean } | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  // Step 1 keeps its rows of fields itself: a work opened draws it anew from the data opened
  const [opened, setOpened] = useState(0);
  // The last work kept in this browser (backlog 4.3 (c)): read on arrival ("reading"), offered until the person answers,
  // and nothing kept meanwhile, so that the work offered is not replaced by the first visit's.
  const [offer, setOffer] = useState<KeptWork | "reading" | null>("reading");
  useEffect(() => {
    kept("gcp").then((text) => text && setGcp(GcpTable.fromCompact(text)), () => undefined);
    kept(LAST_WORK).then((text) => setOffer(keptWork(text)), () => setOffer(null));
    syntaxEngine().then(setEngine, (e: unknown) => console.error(e));
    fetch(fontUrl)
      .then((response) => response.arrayBuffer())
      .then((bytes) => setFont(HriFont.fromBytes(bytes)), (e: unknown) => console.error(e));
  }, []);

  // The rows with the values fixed in the studio: what is checked, and what a label of one's own's {column} fields show
  const edited = useMemo(() => (dataTable ? applyEdits(dataTable, edits) : null), [dataTable, edits]);
  const rows = useMemo(
    () => (engine && edited ? checkRows(engine, edited, mapping, fixed, settings.stem.trim() || DEFAULT_STEM) : []),
    [engine, edited, mapping, fixed, settings.stem],
  );
  const bulk = mode === "bulk";
  const current = bulk ? rows[Math.min(rowIndex, rows.length - 1)] : undefined;
  // The row shown's cells by their column's header (backlog 4.2: fields bound to spreadsheet columns)
  const cellsOf = (index: number) => (edited?.rows[index] ? rowCells(edited.headers, edited.rows[index]) : undefined);
  const currentCells = useMemo(() => (bulk && rows.length ? cellsOf(Math.min(rowIndex, rows.length - 1)) : undefined), [bulk, edited, rowIndex, rows.length]);
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
      if (!dataTable) return { error: t(BULK_TEXTS.noRows) };
      if (!current) return { error: t("The file has no data rows.") };
      return current.identified ? { identified: current.identified } : { error: t("Row {row}: {error}", { row: current.row, error: tm(current.error ?? "") }) };
    }
    if (!engine) return {};
    try {
      return { identified: identify(engine, id, settings.stem.trim() || DEFAULT_STEM) };
    } catch (error) {
      if (error instanceof InputError) return { error: tm(error.message), markup: error.markup };
      if (error instanceof AttributeError) return { error: tm(error.message) };
      return { error: errorText(error) };
    }
  }, [engine, id, settings.stem, bulk, dataTable, current, lang]);

  // Step 2: the decision tree walked with the answers so far; at a leaf, the symbols its table allows for this data
  // and the one chosen (the recommended one unless another was picked). Until then, or when the person chooses the
  // symbol themselves, the label's own fields decide.
  const walked = walk(active.key, answers);
  const guide = walked.leaf && checked.identified ? guidance(walked.leaf, checked.identified) : null;
  const guided = guide !== null && !settings.expert;
  const choice = guided ? chosen(guide, picked) : null;
  const chosenSymbol = choice ? (choice.with ?? choice.symbol) : settings.symbology;
  // A key a GS1 Digital Link URI cannot carry ((03), backlog 1.11) is drawn in GS1 DataMatrix, not a symbol for a URI.
  // A GS1 Logistic Label (backlog 4.1) for an SSCC: GS1-128 at table 5's row, whatever step 2 says.
  const logisticOn = active.key === "00" && settings.logistic !== "none" && !settings.designer;
  const symbology: SymbologyId = logisticOn ? "gs1-128"
    : !isDigitalLinkKey(active.key) && SYMBOLOGIES[chosenSymbol].data === "uri" ? "gs1-datamatrix" : chosenSymbol;
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
  const table = logisticOn ? 5 : guided ? guide.leaf.table : environment ? ENVIRONMENTS[environment]!.table : undefined;
  const spec: SymbolSpecification | undefined = logisticOn ? specificationFor(5, "gs1-128")
    : !bars && environment !== null
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
    ? guide.together ? `${t(GUIDE_TEXTS.together)} ${t(GUIDE_TEXTS.togetherLater)}`
    : guide.waiting ? `${t(GUIDE_TEXTS.waiting)} ${tm(guide.options.find((o) => o.symbol === guide.waiting)?.name ?? "")}.` : t(GUIDE_TEXTS.nothing)
    : !spec && environment === null ? t("No scanning environment of this key allows {symbol}: choose it in step 2.", { symbol: tm(SYMBOLOGIES[symbology].name) })
    : null;

  // The label's design, the same for the code typed and for every row in bulk (backlog 2.4).
  const design = useMemo((): LabelDesign => ({
    symbology, hri: effective.hri, version: effective.version, error: effective.error, environment: environment ?? undefined,
    size, linear: effective.linear, linearSize: effective.linearSize, ...(spec ? { spec, table } : {}),
    bearer: effective.bearer, reduction: effective.reduction, gtinOnly,
    // Beside an EAN/UPC, a 2D symbol's text stays below or above it (backlog 1.16)
    hriPosition: effective.linear !== "none" && (effective.hriPosition === "left" || effective.hriPosition === "right") ? "below" : effective.hriPosition,
    ...(effective.hriHeightMm ? { hriHeightMm: effective.hriHeightMm } : {}),
    ...(effective.gs1128Starts ? { gs1128Starts: effective.gs1128Starts } : {}),
    ...(effective.qrMode !== "auto" ? { qrMode: effective.qrMode } : {}),
    ...(effective.qrUpperDomain ? { qrUpperDomain: true } : {}),
    ...(logisticOn && settings.logistic !== "none"
      ? {
        logistic: {
          size: settings.logistic, from: settings.logisticFrom.split("\n"), to: settings.logisticTo.split("\n"),
          ...(settings.logisticTwoD !== "none" ? { twoD: settings.logisticTwoD } : {}),
          ...(settings.logisticSecond !== "none" ? { secondLanguage: settings.logisticSecond } : {}),
        },
      }
      : {}),
    // A label of one's own (backlog 4.2): its page, the environment and table sizing its barcodes
    ...(settings.designer && settings.page ? { page: settings.page } : {}),
  }), [settings.designer, settings.page, symbology, effective.hri, effective.version, effective.error, environment, size, effective.linear, effective.linearSize, spec, table, effective.bearer, effective.reduction, gtinOnly, effective.hriPosition, effective.hriHeightMm, effective.gs1128Starts, effective.qrMode, effective.qrUpperDomain, logisticOn, settings.logistic, settings.logisticFrom, settings.logisticTo, settings.logisticTwoD, settings.logisticSecond]);

  // What the files are drawn from: the label's options and layout (a symbol without a layout yet: the symbol alone).
  const label = useMemo((): {
    view: Omit<LabelView, "environments" | "sizes" | "twoD" | "isQr" | "linearPossible" | "bars">;
    data?: string;
    geometry?: SymbolGeometry;
    options?: LabelOptions;
    layout?: Layout;
    logistic?: DrawnLabel["logistic"];
    designed?: DrawnLabel["designed"];
  } => {
    const identified = checked.identified;
    const base = {
      xMm: spec ? (baseX(spec) * size) / 100 : !environment ? 0.495 : twoD ? xDimension(environment, size) : linearXDimension(environment, size), uri: identified?.digitalLinkUri ?? "", elementString: identified?.elementString ?? "",
    };
    if (!identified || !font) return { view: { ...base, error: checked.error ?? (engine && font ? undefined : t("Loading…")) } };
    if (blocked) return { view: { ...base, error: blocked } };
    try {
      const { symbology } = effective;
      const { data, options, layout, geometry, logistic, designed } = labelFor(identified, design, font, currentCells);
      if (designed && design.page) {
        // A label of one's own: its size and its barcodes in the caption, its problems in words, its symbols expected
        const page = design.page;
        const named = (id: string) => {
          const element = page.elements.find((e) => e.id === id);
          return element ? elementName(element) : id;
        };
        const problems = designed.problems.map((p) => p.kind === "edge"
          ? t("{name} goes past the label's edge.", { name: named(p.id) })
          : t("{a} and {b} overlap: a barcode's quiet zones must stay clear.", { a: named(p.ids[0]), b: named(p.ids[1]) }));
        const names = designed.symbols.map((s) => tm(SYMBOLOGIES[s.symbology].name)).join(", ");
        return {
          view: {
            ...base, xMm: layout.xMm, svg: labelSvg(options, layout, font, effective.hriAsText), pngDpi: pngDpi(layout),
            widthMm: page.widthMm, heightMm: page.heightMm, expected: designed.expected,
            pngResolutions: PNG_RESOLUTIONS.map((dpi) => pngAt(layout, dpi)),
            caption: t("A label of my own {w} × {h} mm · {symbols}", { w: formatNumber(page.widthMm), h: formatNumber(page.heightMm), symbols: names }),
            designer: { placed: designed.placed, sizing: Object.fromEntries(designed.printer.symbols.map((symbol) => [symbol.id, symbolSizing(symbol, font)])), problems },
          },
          data, geometry, options, layout, designed,
        };
      }
      const wMm = layout.width * layout.xMm;
      const hMm = layout.height * layout.xMm;
      // The modules in all (a matrix's rows times its columns, a linear symbol's width) and the characters encoded,
      // FNC1 and group separators included (the owner's request of 30 October 2026), at the end of the caption.
      const matrix = geometry.kind === "matrix"
        ? t("{rows} × {cols} = {total} modules", { rows: geometry.rows, cols: geometry.cols, total: formatNumber(geometry.rows * geometry.cols) })
        : "";
      const count = encodedCount(symbology, gtinOnly ? { ...identified, elements: identified.elements.filter((e) => e.ai === "01") } : identified, data);
      const marks = [count.fnc1 ? "FNC1" : "", count.separators ? (count.separators === 1 ? t("1 group separator") : t("{n} group separators", { n: count.separators })) : ""]
        .filter(Boolean).join(t(" and "));
      const tail = [
        // From the first bar to the last (bwip-js may end the widths with a space); ITF-14 as the layout draws it, its
        // wide bars at the ratio 2.5 (bwip-js gives 2)
        geometry.kind === "linear"
          ? t("{n} modules wide", { n: formatNumber(geometry.widths.slice(0, geometry.widths.length % 2 ? undefined : -1)
            .reduce((sum, w) => sum + (symbology === "itf14" && w > 1 ? ITF14_RATIO : w), 0)) })
          : "",
        marks ? t("{n} characters encoded ({marks} included)", { n: count.characters, marks }) : t("{n} characters encoded", { n: count.characters }),
      ].filter(Boolean).join(" · ");
      // GS1-128 over several symbols (backlog 1.13): its element strings and where each symbol starts
      const gs1128 = symbology === "gs1-128" && !logisticOn
        ? (() => {
            const elements = parseElementString(data).map((e) => `(${e.ai})${e.value}`);
            const starts = [0];
            for (const part of (layout.parts ?? []).slice(0, -1)) starts.push(starts.at(-1)! + parseElementString(part).length);
            return { elements, starts };
          })()
        : undefined;
      const logisticName = logisticOn && settings.logistic !== "none" ? LOGISTIC_SIZES[settings.logistic].name : null;
      const beside = logistic?.printer.twoD;
      const symbolPart = logisticName
        ? ((layout.parts?.length ?? 1) === 1
          ? t("GS1 Logistic Label {size} · 1 GS1-128 symbol", { size: logisticName })
          : t("GS1 Logistic Label {size} · {n} GS1-128 symbols", { size: logisticName, n: layout.parts?.length ?? 1 })) +
          (beside ? ` · ${tm(SYMBOLOGIES[beside.symbology].name)} · ${t("{rows} × {cols} = {total} modules", { rows: beside.modules, cols: beside.modules, total: formatNumber(beside.modules ** 2) })}` : "")
        : layout.version
        ? t("QR code version {version} · {matrix} · correction {level}", { version: layout.version, matrix, level: effective.error.toUpperCase() }) +
          (options.qrMode ? ` · ${{ numeric: t("numeric mode"), alphanumeric: t("alphanumeric mode"), byte: t("byte mode") }[options.qrMode]}` : "")
        : layout.modules
          ? `${tm(SYMBOLOGIES[symbology].name)} · ${matrix}`
          : layout.barHeight !== undefined
            ? (layout.parts ? t("{symbol} in {n} symbols", { symbol: tm(SYMBOLOGIES[symbology].name), n: layout.parts.length }) : tm(SYMBOLOGIES[symbology].name)) +
              ` · ${t("bars {mm} mm", { mm: formatNumber(layout.barHeight * layout.xMm, 2) })}`
            : tm(SYMBOLOGIES[symbology].name);
      return {
        view: {
          ...base, xMm: layout.xMm, svg: labelSvg(options, layout, font, effective.hriAsText), pngDpi: pngDpi(layout),
          widthMm: wMm, heightMm: hMm, expected: layout.parts
            ? [...layout.parts.map((part) => `]C1 ${part}`), ...(beside ? expectedReads({ symbology: beside.symbology, data: beside.data }) : [])].sort()
            : expectedReads(options), ...(gs1128 ? { gs1128 } : {}),
          pngResolutions: PNG_RESOLUTIONS.map((dpi) => pngAt(layout, dpi)),
          hasBars: Boolean(layout.barRects && layout.barRects[1] > layout.barRects[0]),
          caption: `${symbolPart} · ${t("X {x} mm · label {w} × {h} mm at 100 %", { x: formatNumber(layout.xMm, 3), w: formatNumber(wMm, 1), h: formatNumber(hMm, 1) })} · ${tail}`,
        },
        data, geometry, options, layout, ...(logistic ? { logistic } : {}),
      };
    } catch (error) {
      return { view: { ...base, error: tm(errorText(error)) } };
    }
  }, [checked, currentCells, gtinOnly, font, engine, blocked, spec, design, effective.symbology, effective.hriAsText, effective.error, environment, size, twoD, lang]);

  const view: LabelView = {
    ...label.view, environments, sizes, twoD, bars, isQr: symbology.endsWith("qrcode"), linearPossible, logisticPossible: active.key === "00",
    ...(guided && walked.leaf
      ? {
          guided: {
            summary: choice
              ? choice.with
                ? t("{symbol} with a {beside} beside it", { symbol: tm(SYMBOLOGIES[choice.symbol].name), beside: tm(SYMBOLOGIES[choice.with].name) })
                : tm(SYMBOLOGIES[choice.symbol].name)
              : t("No symbol yet"),
            table: walked.leaf.table,
            application: tm(walked.leaf.application),
          },
        }
      : {}),
    ...(spec ? { sizeBase: baseX(spec) } : {}),
    // In bulk, the columns holding no AI as {column} fields, each with the row shown's value
    ...(bulk && edited
      ? { columns: fieldColumns(edited.headers, mapping).map(({ column, name }) => ({ name, value: currentCells?.[edited.headers[column]!] ?? "" })) }
      : {}),
  };

  // ZPL with the printer's own commands (ADR 0002); a label just large enough for the symbol, its quiet zones and text.
  // The range of the symbol's table (section 5.12.3) the printed X-dimension must stay within (backlog 3.1).
  const xRange: readonly [number, number] | null = spec
    ? [spec.x[0], spec.x[2]]
    : environment ? ((range) => (range ? [range[0], range[2]] as const : null))(twoD ? ENVIRONMENTS[environment]?.["2d"] : ENVIRONMENTS[environment]?.linear) : null;
  const module = label.layout ? moduleChoice(label.layout.xMm, xRange, settings.dpi, zplDots) : null;
  const drawn = (): DrawnLabel | null => {
    const { geometry, data, options, layout, logistic, designed } = label;
    return geometry && data && options && layout ? { geometry, data, options, layout, ...(logistic ? { logistic } : {}), ...(designed ? { designed } : {}) } : null;
  };
  const zplWidthProblem = (() => {
    try {
      const d = drawn();
      return d ? printWidthProblem(printWidthDots(d, design, settings.dpi, module?.chosen.dots), profile) : null;
    } catch {
      return null;
    }
  })();

  // The print file in the profile's language (ADR 0002): ZPL, TSPL, EPL2 or DPL; templates in ZPL only
  const language = PRINTER_LANGUAGES[languageOf(profile)];
  function downloadZpl(template: boolean) {
    try {
      const d = drawn();
      if (!d) return;
      // What the language cannot write first, then whether the printer prints that wide
      const file = template
        ? zplTemplate(symbology, d.data, zplOptionsFor(d, design, settings.dpi, module?.chosen.dots)).zpl
        : printFileFor(language.id, d, design, settings.dpi, module?.chosen.dots);
      if (zplWidthProblem) throw new Error(zplWidthProblem);
      // The ZPL carries the work in comments, so that Open… takes it back (backlog 4.3)
      download(`${name}${template ? "-template.zpl" : `.${language.extension}`}`, !template && typeof file === "string" && language.id === "zpl" ? zplWithWork(file, currentWork()) : file, printFileType(file));
      setFileError(null);
    } catch (error) {
      setFileError(tm(errorText(error)));
    }
  }

  // A test label (backlog 3.1): the label with a 50 mm ruler and the settings below it.
  function testPrint() {
    const data = label.data;
    try {
      const d = drawn();
      if (!d || !data || !module) return;
      const notes = [
        `Printer: ${profile.name}`,
        `Module: ${module.chosen.dots} ${module.chosen.dots === 1 ? "dot" : "dots"}, X ${module.chosen.xMm.toFixed(3)} mm` +
          (xRange ? ` (table range ${xRange[0].toFixed(3)} to ${xRange[1].toFixed(3)} mm)` : ""),
        `${SYMBOLOGIES[symbology].name}: ${data.length > 60 ? `${data.slice(0, 57)}...` : data}`,
        `GS1 Label Studio, ${new Date().toISOString().slice(0, 10)}`,
      ];
      const file = printFileFor(language.id, d, design, settings.dpi, module.chosen.dots, notes);
      download(`${name}-test-${settings.dpi}dpi.${language.extension}`, file, printFileType(file));
      setFileError(null);
    } catch (error) {
      setFileError(tm(errorText(error)));
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
      setFileError(tm(errorText(error)));
    }
  }

  // In bulk: every row ready or fixed drawn with the label's design, in one zip (backlog 2.4).
  const batchRows: BatchRow[] = rows.map((row, index) => ({
    row: row.row, ...(row.identified ? { identified: row.identified } : {}), ...(row.error ? { error: row.error } : {}),
    ...(skipped.has(index) ? { skipped: true } : {}), cells: cellsOf(index),
  }));
  const readyRows = batchRows.filter((row) => row.identified && !row.skipped);
  // Generated in a worker (backlog 2.5): the page stays usable, the progress shows, and Cancel ends the worker.
  const [worker, setWorker] = useState<Worker | null>(null);
  function generate(choice: GenerateChoice) {
    setGenerated({ result: null, error: null });
    setProgress({ done: 0, total: readyRows.length });
    const running = new Worker(new URL("./generate.worker.ts", import.meta.url), { type: "module" });
    setWorker(running);
    const finish = () => {
      running.terminate();
      setWorker(null);
      setProgress(null);
    };
    running.onmessage = (event: MessageEvent<GenerateMessage>) => {
      const message = event.data;
      if (message.type === "progress") setProgress({ done: message.done, total: message.total });
      else if (message.type === "error") {
        setGenerated({ result: null, error: tm(message.message) });
        finish();
      } else {
        const stem = source.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "rows";
        download(`${stem}_labels.zip`, message.zip, "application/zip");
        setGenerated({
          result: (message.generated === 1 ? t("1 label generated") : t("{n} labels generated", { n: message.generated })) +
            (message.left ? (message.left === 1 ? t("; 1 row left out, with its reason in generated.csv.") : t("; {n} rows left out, each with its reason in generated.csv.", { n: message.left })) : "."),
          error: null,
        });
        finish();
      }
    };
    running.onerror = (event) => {
      setGenerated({ result: null, error: event.message || t("The generation stopped.") });
      finish();
    };
    running.postMessage({
      rows: batchRows,
      request: { ...choice, design, pngResolution: settings.pngResolution, hriAsText: settings.hriAsText, ...(choice.zplDpi ? { printLanguage: language.id } : {}), ...(choice.zplDpi && module ? { zplDots: module.chosen.dots } : {}) },
    });
  }
  // The destination shown on a phone or a tablet (backlog 1.21, layout.ts); a computer shows them all. Each keeps
  // where it was scrolled to, as the tabs of phone apps do; a link to a part of another destination opens it.
  const phone = useMedia(PHONE_QUERY);
  const tablet = useMedia(TABLET_QUERY);
  const tabbed = phone || tablet;
  const [tab, setTab] = useState<Pane>("data");
  const scrolled = useRef<Partial<Record<Pane, number>>>({});
  const goTo = useRef<string | null>(null);
  function showPane(next: Pane, target?: string) {
    if (!tabbed) return;
    scrolled.current[tab] = window.scrollY;
    goTo.current = target ?? null;
    setTab(next);
  }
  useLayoutEffect(() => {
    if (!tabbed) return;
    const target = goTo.current ? document.getElementById(goTo.current) : null;
    goTo.current = null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, scrolled.current[tab] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    if (!tabbed) return;
    const follow = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      const id = link?.getAttribute("href")?.slice(1);
      const pane = id ? paneOf(document.getElementById(id)) : null;
      if (!id || !pane) return;
      event.preventDefault();
      if (pane === tab) document.getElementById(id)!.scrollIntoView({ block: "start" });
      else showPane(pane, id);
    };
    document.addEventListener("click", follow);
    return () => document.removeEventListener("click", follow);
  });

  // The work saved on this computer and opened again (backlog 4.3, mock-up A of two): the data typed, step 2's answers,
  // the label's settings and page, the printer, in bulk the columns chosen (the rows stay in their spreadsheet).
  function currentWork(): Work {
    return {
      mode, identification: id, answers, picked, settings: savedSettings(settings), page: settings.page,
      printer: { profile, moduleDots: zplDots },
      columns: dataTable ? { headers: dataTable.headers, mapping, fixed } : null,
    };
  }
  function saveWork() {
    const file = `${name}.gs1-work.json`;
    download(file, workFile(currentWork()), "application/json");
    setWorkNote({ text: t("Saved as {file}: Open… takes it back, with the data, the choices and the label.", { file }), error: false });
  }
  async function openWork(file: File) {
    let work: Work;
    try {
      work = readWork(await file.text());
    } catch (error) {
      setWorkNote({ text: `${file.name}: ${tm(errorText(error))}`, error: true });
      return;
    }
    takeWork(work);
    setWorkNote({
      text: work.mode === "bulk" && !dataTable
        ? t("Opened {file}. Take the spreadsheet again: its columns are chosen as they were saved.", { file: file.name })
        : t("Opened {file}.", { file: file.name }),
      error: false,
    });
  }
  /** A work opened from a file or from this browser: the data, the answers, the label, the printer and the columns. */
  function takeWork(work: Work) {
    setOffer(null);
    setMode(work.mode);
    setId(work.identification);
    setOpened(opened + 1);
    setAnswers(work.answers);
    setPicked(work.picked);
    setSettings(openedSettings(work.settings, work.page, START_SETTINGS));
    if (work.printer) {
      const saved = work.printer.profile;
      const known = [...GENERIC_PROFILES, ...profiles].find((p) => p.id === saved.id);
      if (!known) {
        // A profile of another browser: kept here too, so that it can be chosen again
        const next = [...profiles, saved];
        keepProfiles(next);
        setProfiles(next);
      }
      setProfile(known ?? saved);
      setZplDots(work.printer.moduleDots);
    }
    if (work.columns) {
      rememberColumns(work.columns.headers, work.columns.mapping, work.columns.fixed);
      if (dataTable && dataTable.headers.join("\u001f") === work.columns.headers.join("\u001f")) {
        setMapping(work.columns.mapping);
        setFixed(work.columns.fixed);
      }
    }
  }

  // The work kept in this browser as it changes (backlog 4.3 (c)), a moment after the last change and when the page is
  // left; a first visit's work keeps nothing.
  const startWork = useRef<string | null>(null);
  startWork.current ??= workKey(currentWork());
  const workNow = offer === null ? workKey(currentWork()) : null;
  useEffect(() => {
    if (workNow === null) return;
    const store = () => {
      const work = JSON.parse(workNow) as Work;
      void keep(LAST_WORK, workToKeep(work, startWork.current!));
    };
    const timer = window.setTimeout(store, 500);
    window.addEventListener("pagehide", store);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", store);
    };
  }, [workNow]);
  function continueKept(kept: KeptWork) {
    takeWork(kept.work);
    setWorkNote({
      text: kept.work.mode === "bulk" && !dataTable
        ? t("Your last work is back. Take the spreadsheet again: its columns are chosen as they were.")
        : t("Your last work is back."),
      error: false,
    });
  }
  // Start anew: the question closes and keeping resumes, so what is kept becomes the work now (nothing, at first)
  const startAnew = () => setOffer(null);
  const keptTime = offer && offer !== "reading" && offer.saved
    ? new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short" }).format(offer.saved)
    : null;
  const workButtons = (
    <span className="work">
      <button type="button" className={phone ? "btn" : "start-over"} title={t("Opens a work saved here (.json), or a ZPL downloaded here")} onClick={() => openInput.current?.click()}>
        {t("Open…")}
      </button>
      <button type="button" className={phone ? "btn" : "start-over"} title={t("Downloads the work: the data, the choices and the label")} onClick={saveWork}>
        {t("Save")}
      </button>
      <input
        ref={openInput}
        type="file"
        hidden
        accept=".json,.zpl,.txt,application/json,text/plain"
        aria-label={t("Open a saved work")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openWork(file);
        }}
      />
    </span>
  );

  const languageMenu = (
    <label className="lang">
      <span>{t("Language")}</span>
      <select id="language" value={lang} onChange={(e) => onLocale?.(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l.tag} value={l.tag} lang={l.tag}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
  const startOverClick = () => {
    if (dataTable && !window.confirm(t("Clear the rows, the fixes and every choice, and start over?"))) return;
    // What is kept is emptied before the new visit reads it: IndexedDB runs the two in the order they were asked
    void keep(LAST_WORK, null);
    onStartOver?.();
  };
  // In the header on a computer and a tablet; on a phone a round reload icon at the right of the live preview's bar
  // (the owner, 31 October 2026), its name kept for screen readers.
  const startOver = phone ? (
    <button type="button" className="start-over round" aria-label={t("Start over")} title={t("Clears the data and every choice, as on a first visit")} onClick={startOverClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" />
      </svg>
    </button>
  ) : (
    <button type="button" className="start-over" title={t("Clears the data and every choice, as on a first visit")} onClick={startOverClick}>
      {t("Start over")}
    </button>
  );

  function cancelGeneration() {
    worker?.terminate();
    setWorker(null);
    setProgress(null);
    setGenerated({ result: t("Stopped: nothing was downloaded."), error: null });
  }

  return (
    <div className="app" data-tab={tab}>
      <header className="top">
        <h1>GS1 Label Studio</h1>
        <span className="mode" role="group" aria-label={t("Mode")}>
          <button type="button" aria-pressed={!bulk} onClick={() => setMode("one")}>
            {t("One code")}
          </button>
          <button type="button" aria-pressed={bulk} onClick={() => setMode("bulk")}>
            {t("In bulk")}
          </button>
        </span>
        <span className="tagline">{t("Everything stays in your browser, and it works offline.")}</span>
        {/* On a phone the language is in "More" and Start over beside the live preview, leaving the header to the
            name and the mode */}
        {!phone && languageMenu}
        {!phone && workButtons}
        {!phone && startOver}
      </header>
      {offer && offer !== "reading" && (
        <div className="kept-work" role="region" aria-label={t("Your last work")}>
          <span>
            {keptTime
              ? t("Your last work, of {time}, is kept in this browser.", { time: keptTime })
              : t("Your last work is kept in this browser.")}
            {workSummary(offer.work) && <> <b>{workSummary(offer.work)}</b></>}
            {offer.work.page && <> · {t("a label of your own")}</>}
          </span>
          <span className="kept-actions">
            <button type="button" className="btn primary" onClick={() => continueKept(offer)}>
              {t("Continue it")}
            </button>
            <button type="button" className="btn" onClick={startAnew}>
              {t("Start anew")}
            </button>
          </span>
        </div>
      )}
      {workNote && (
        <div className={`work-note${workNote.error ? " error" : ""}`} role={workNote.error ? "alert" : "status"}>
          <span>{workNote.text}</span>
          <button type="button" aria-label={t("Close")} onClick={() => setWorkNote(null)}>
            ×
          </button>
        </div>
      )}
      <div className="mini-bar" data-pane="data scan export more">
        {view.svg ? (
          <a className="mini" href="#label-title" aria-label={t("Live preview: go to the label")}>
            <span dangerouslySetInnerHTML={{ __html: view.svg }} />
            <span>{t("Live preview · tap to go to the label")}</span>
          </a>
        ) : (
          <a className="mini" href="#label-title">
            <span className="error small">{view.error ?? t("Loading…")}</span>
          </a>
        )}
        {phone && startOver}
      </div>
      <main className="editor">
        <div className="steps" data-pane="data scan">
          <div data-pane="data">
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
                  .then((next) => takeTable(next, file.name), (error: unknown) => setTableError(tm(errorText(error))));
              }}
              onPaste={(text) => {
                try {
                  takeTable(parseDelimited(text), t("Pasted rows"));
                } catch (error) {
                  setTableError(tm(errorText(error)));
                }
              }}
              onSequence={(sequence, as) => {
                try {
                  if (as === "rows" || !dataTable) {
                    takeTable(sequenceTable(sequence), sequence.kind === "sscc" ? t("SSCCs made here") : t("Serial numbers made here"));
                  } else {
                    // A column after the others: the fixes, the rows skipped and the columns chosen stay as they are
                    const next = withSequence(dataTable, sequence);
                    const nextMapping = [...mapping, sequence.kind === "sscc" ? "00" : "21"];
                    setDataTable(next);
                    setMapping(nextMapping);
                    setSource(`${source} + ${sequence.kind === "sscc" ? t("SSCCs") : t("serial numbers")}`);
                    rememberColumns(next.headers, nextMapping, fixed);
                    setTableError(null);
                  }
                } catch (error) {
                  setTableError(tm(errorText(error)));
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
                if (phone) showPane("label"); // beside the rows already on a tablet
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
            key={opened}
            id={id}
            onChange={(next) => {
              setId(next);
              setFileError(null);
            }}
            onPaste={(text) => {
              if (!engine) throw new Error(t("The GS1 Barcode Syntax Engine is still loading."));
              // The URI's own parameters, which the engine leaves out (backlog 1.17)
              const parameters = uriParameters(text);
              const fields = { ...fieldsOf(engine.parse(text)), ...(parameters.length ? { parameters } : {}) };
              setId(fields);
              return fields;
            }}
            status={{ error: checked.error, markup: checked.markup, count: checked.identified?.elements.length }}
          />
          )}
          </div>
          <div data-pane="scan">
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
          printLanguage={language}
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
                  example={(pattern) => readyRows[0] ? patternName(pattern, readyRows[0].row, symbology, readyRows[0].identified!, readyRows[0].cells) : null}
                  columns={edited?.headers ?? []}
                  fields={readyRows[0] && edited ? patternFields(readyRows[0], symbology, fieldColumns(edited.headers, mapping).map((c) => c.name)) : []}
                  dpi={settings.dpi}
                  {...(view.widthMm && view.heightMm ? { labelMm: [view.widthMm, view.heightMm] as const } : {})}
                  progress={progress}
                  result={generated.result}
                  error={blocked ?? generated.error}
                  onGenerate={generate}
                  onCancel={cancelGeneration}
                  languageName={language.name}
                />
              )
            : undefined}
          printer={
          <PrinterSection
            profiles={profiles}
            profile={profile}
            onProfiles={setProfiles}
            onProfile={(next) => {
              setProfile(next);
              setZplDots(null);
              setSettings({ ...settings, dpi: next.dpi });
            }}
            module={module}
            dots={zplDots}
            onDots={setZplDots}
            range={xRange}
            widthProblem={zplWidthProblem}
            onTestPrint={testPrint}
          />
          }
        >
          {tabbed && (
            <div className="settings">
              {phone && languageMenu}
              {phone && workButtons}
              <InstallApp />
            </div>
          )}
          <EpcSection id={active} stem={settings.stem} gcp={gcp} onGcp={setGcp} {...(checked.identified?.digitalLinkUri ? { uri: checked.identified.digitalLinkUri } : {})} download={download} />
          <SignSection {...(checked.identified ? { identified: checked.identified } : {})} name={name} download={download} />
        </LabelCard>
      </main>
      <About />
      <TabBar
        tab={tab}
        onTab={(next) => showPane(next)}
        alerts={{ data: Boolean(bulk ? tableError : checked.error), label: Boolean(view.error && !checked.error) }}
      />
    </div>
  );
}
