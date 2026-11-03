import {
  boxOf, DATE_FORMATS, formatDate, isDateAi, MONTH_NAMES, SIZES, type MonthLanguage, SYMBOLOGIES, type DesignBox, type DesignElement, type DesignLine, type DesignPage, type DesignSymbol, type DesignText, type PlacedElement, type SymbologyId,
} from "@gs1-label-studio/core";
import { useRef } from "react";
import { formatNumber, locale, t, tm } from "./i18n.ts";
import { ENVIRONMENT_NAMES } from "./texts.ts";

// A label of one's own (backlog 4.2, mock-up A of two, 3 November 2026): in step 3, "Label" offers it; the page on the
// canvas with its barcodes and text blocks, each selected by a click and moved by dragging it; "+ Barcode" and
// "+ Text" over the canvas; under it the page's size, the elements and the selected one's properties. Then (step b,
// mock-up B of two, the owner's choice of 3 November 2026) "+ Shape" beside them: a line across or down, a box
// outlined or filled, the shape chosen in its properties. Then (step c) a date field in a format, {17:DD/MM/YYYY}.

/** The symbols a barcode on the page can be: as step 3 offers them, not GS1 QR Code (ADR 0003). */
const OFFERED = Object.values(SYMBOLOGIES).filter((symbology) => symbology.id !== "gs1-qrcode");
const STEP_MM = 0.5; // dragging moves an element by half millimetres
const TEXT_HEIGHTS = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12];

const round = (mm: number) => Math.round(mm / STEP_MM) * STEP_MM;

/** A new text block's month language: the interface's (the owner, 3 November 2026). */
const interfaceMonths = (): MonthLanguage => (locale() === "pt-BR" ? "pt" : locale() === "es" ? "es" : "en");

/** The month languages a text block offers, each named with its December. */
const MONTH_LANGUAGES: { id: MonthLanguage; name: () => string }[] = [
  { id: "en", name: () => t("English ({dec})", { dec: MONTH_NAMES.en[11]! }) },
  { id: "pt", name: () => t("Portuguese ({dec})", { dec: MONTH_NAMES.pt[11]! }) },
  { id: "es", name: () => t("Spanish ({dec})", { dec: MONTH_NAMES.es[11]! }) },
];

function nextId(page: DesignPage): string {
  const used = page.elements.map((e) => Number(e.id.replace(/^e/, "")) || 0);
  return `e${Math.max(0, ...used) + 1}`;
}

/** The page a label of one's own starts with: 100 × 60 mm, the symbol of step 3 at the top left, a line of text below. */
export function startingPage(symbology: SymbologyId, firstAi: string | undefined): DesignPage {
  return {
    widthMm: 100,
    heightMm: 60,
    elements: [
      { id: "e1", kind: "symbol", symbology, ais: null, size: 100, hri: true, xMm: 2, yMm: 2 },
      { id: "e2", kind: "text", text: firstAi ? `{${firstAi}}` : t("Text"), heightMm: 3, months: interfaceMonths(), xMm: 4, yMm: 52 },
    ],
  };
}

/** The name an element goes by in the list and in the problems: its symbol, its text's first line, a line or a box with its size. */
export function elementName(element: DesignElement): string {
  if (element.kind === "symbol") return tm(SYMBOLOGIES[element.symbology].name);
  if (element.kind === "text") return `“${element.text.split("\n")[0] || t("Text")}”`;
  if (element.kind === "line") {
    const mm = formatNumber(element.lengthMm);
    return element.vertical ? t("Line down {mm} mm", { mm }) : t("Line across {mm} mm", { mm });
  }
  const size = { w: formatNumber(element.widthMm), h: formatNumber(element.heightMm) };
  return element.filled ? t("Filled box {w} × {h} mm", size) : t("Box {w} × {h} mm", size);
}

/** The mark beside an element's name in the list. */
function elementIcon(element: DesignElement): string {
  if (element.kind === "symbol") return "▥";
  if (element.kind === "text") return "T";
  return "◇";
}

/** A shape: a line across or down, a box outlined or filled (the core's line and box). */
type Shape = "across" | "down" | "box" | "filled";
const BOX_SIDE_MM = 20; // a box made from a line takes the line's length one way and this the other

function shapeOf(element: DesignLine | DesignBox): Shape {
  if (element.kind === "line") return element.vertical ? "down" : "across";
  return element.filled ? "filled" : "box";
}

/** The shape changed to another, its corner and thickness kept, and the length it shares with the new one. */
function reshaped(element: DesignLine | DesignBox, shape: Shape): DesignLine | DesignBox {
  const { id, xMm, yMm, thicknessMm } = element;
  if (shape === "across" || shape === "down") {
    const lengthMm = element.kind === "line" ? element.lengthMm : shape === "across" ? element.widthMm : element.heightMm;
    return { id, kind: "line", vertical: shape === "down", lengthMm, thicknessMm, xMm, yMm };
  }
  const [widthMm, heightMm] = element.kind === "box" ? [element.widthMm, element.heightMm]
    : element.vertical ? [BOX_SIDE_MM, element.lengthMm] : [element.lengthMm, BOX_SIDE_MM];
  return { id, kind: "box", widthMm, heightMm, thicknessMm, filled: shape === "filled", xMm, yMm };
}

interface ToolsProps {
  page: DesignPage;
  selected: string | null;
  symbology: SymbologyId;
  onChange: (page: DesignPage, selected: string | null) => void;
}

/** + Barcode, + Text, + Shape and Delete, over the canvas. */
export function DesignerTools({ page, selected, symbology, onChange }: ToolsProps) {
  const add = (element: DesignElement) => onChange({ ...page, elements: [...page.elements, element] }, element.id);
  return (
    <div className="design-tools" data-pane="label" data-beside="">
      <button type="button" className="btn" onClick={() => add({ id: nextId(page), kind: "symbol", symbology, ais: null, size: 100, hri: true, xMm: 2, yMm: 2 })}>
        {t("+ Barcode")}
      </button>
      <button type="button" className="btn" onClick={() => add({ id: nextId(page), kind: "text", text: t("Text"), heightMm: 3, months: interfaceMonths(), xMm: 4, yMm: 4 })}>
        {t("+ Text")}
      </button>
      <button type="button" className="btn" onClick={() => add({ id: nextId(page), kind: "line", vertical: false, lengthMm: 40, thicknessMm: 0.5, xMm: 4, yMm: 4 })}>
        {t("+ Shape")}
      </button>
      <span className="grow" />
      <button type="button" className="btn" disabled={!selected} onClick={() => onChange({ ...page, elements: page.elements.filter((e) => e.id !== selected) }, null)}>
        {t("Delete")}
      </button>
    </div>
  );
}

interface OverlayProps {
  page: DesignPage;
  placed: PlacedElement[];
  selected: string | null;
  onChange: (page: DesignPage, selected: string | null) => void;
}

const graphic = (page: DesignPage, id: string) => page.elements.some((e) => e.id === id && (e.kind === "line" || e.kind === "box"));

/** Over the drawn page, in its millimetres: each element's box, selected by a click, moved by dragging. */
export function DesignerOverlay({ page, placed, selected, onChange }: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; xMm: number; yMm: number } | null>(null);
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !svg.current) return;
    const scale = page.widthMm / svg.current.getBoundingClientRect().width;
    const xMm = round(d.xMm + (event.clientX - d.x) * scale);
    const yMm = round(d.yMm + (event.clientY - d.y) * scale);
    const element = page.elements.find((e) => e.id === d.id);
    if (element && (element.xMm !== xMm || element.yMm !== yMm)) {
      onChange({ ...page, elements: page.elements.map((e) => (e.id === d.id ? { ...e, xMm, yMm } : e)) }, d.id);
    }
  };
  return (
    <svg
      ref={svg}
      className="design-overlay"
      viewBox={`0 0 ${page.widthMm} ${page.heightMm}`}
      aria-label={t("The label's elements: click one to choose it, drag it to move it")}
      onPointerDown={(event) => {
        if (event.target === svg.current) onChange(page, null);
      }}
    >
      {/* Lines and boxes underneath, so that a frame around a barcode or text leaves them to be chosen */}
      {[...placed].sort((a, b) => Number(!graphic(page, a.id)) - Number(!graphic(page, b.id))).map((p) => {
        const element = page.elements.find((e) => e.id === p.id);
        if (!element) return null;
        return (
          <rect
            key={p.id}
            data-id={p.id}
            className={p.id === selected ? "selected" : undefined}
            x={p.xMm}
            y={p.yMm}
            width={Math.max(p.widthMm, 1)}
            height={Math.max(p.heightMm, 1)}
            onPointerDown={(event) => {
              event.stopPropagation();
              (event.target as Element).setPointerCapture?.(event.pointerId);
              drag.current = { id: p.id, x: event.clientX, y: event.clientY, xMm: element.xMm, yMm: element.yMm };
              if (p.id !== selected) onChange(page, p.id);
            }}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <title>{elementName(element)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

interface PanelProps {
  page: DesignPage;
  selected: string | null;
  /** The data's AIs, in order, and their element strings: what a barcode can carry and a text can show. */
  elements: { ai: string; text: string }[];
  environments: string[];
  environment: string;
  guided: boolean;
  problems: string[];
  onEnvironment: (environment: string) => void;
  onChange: (page: DesignPage, selected: string | null) => void;
}

const millimetres = (value: string, fallback: number) => (Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback);
// A size or thickness is kept while the field holds nothing above 0 (being typed): the core refuses none
const positive = (value: string, fallback: number) => (millimetres(value, fallback) > 0 ? millimetres(value, fallback) : fallback);

/**
 * A shape's properties (mock-up B): its shape, then its width, height and thickness. A line's width (across) or height
 * (down) is its length and the other its thickness, shown but not typed; a filled box has no outline to thicken.
 */
function ShapeFields({ element, onChange }: { element: DesignLine | DesignBox; onChange: (element: DesignLine | DesignBox) => void }) {
  const shape = shapeOf(element);
  const { widthMm, heightMm } = boxOf(element);
  const setWidth = (value: number) => onChange(element.kind === "line" ? { ...element, lengthMm: value } : { ...element, widthMm: value });
  const setHeight = (value: number) => onChange(element.kind === "line" ? { ...element, lengthMm: value } : { ...element, heightMm: value });
  return (
    <>
      <div>
        <label htmlFor="el-shape">{t("Shape")}</label>
        <select id="el-shape" value={shape} onChange={(e) => onChange(reshaped(element, e.target.value as Shape))}>
          <option value="across">{t("Line across")}</option>
          <option value="down">{t("Line down")}</option>
          <option value="box">{t("Box")}</option>
          <option value="filled">{t("Filled box")}</option>
        </select>
      </div>
      <div>
        <label htmlFor="el-width">{t("Width (mm)")}</label>
        <input id="el-width" type="number" min={STEP_MM} step={STEP_MM} disabled={shape === "down"} value={widthMm} onChange={(e) => setWidth(positive(e.target.value, widthMm))} />
      </div>
      <div>
        <label htmlFor="el-height-mm">{t("Height (mm)")}</label>
        <input id="el-height-mm" type="number" min={STEP_MM} step={STEP_MM} disabled={shape === "across"} value={heightMm} onChange={(e) => setHeight(positive(e.target.value, heightMm))} />
      </div>
      <div>
        <label htmlFor="el-thickness">{t("Thickness (mm)")}</label>
        <input id="el-thickness" type="number" min={0.1} step={0.1} disabled={shape === "filled"} value={element.thicknessMm} onChange={(e) => onChange({ ...element, thicknessMm: positive(e.target.value, element.thicknessMm) })} />
      </div>
    </>
  );
}

/** A field's value in the data: "(17)271231" without its AI. */
const valueOf = ({ ai, text }: { ai: string; text: string }) => text.slice(ai.length + 2);

/**
 * "Insert a field from the data" (backlog 4.2, step c, mock-up B of two): each AI's field, and each date's in the formats
 * offered as well, each with the value it gives (its month in the text block's language); the other mock-up had a date
 * format select beside it. The month's language is the text block's "Month names" (mock-up B of two, 3 November 2026;
 * A wrote it in each field, {17:DD MMM YYYY:pt}).
 */
function FieldInsert({ elements, months, onInsert }: { elements: { ai: string; text: string }[]; months: MonthLanguage; onInsert: (field: string) => void }) {
  const today = new Date();
  return (
    <div>
      <label htmlFor="el-field">{t("Insert a field from the data")}</label>
      <select id="el-field" value="" onChange={(e) => e.target.value && onInsert(e.target.value)}>
        <option value="">{t("Choose…")}</option>
        {elements.map((x) =>
          isDateAi(x.ai) ? (
            <optgroup key={x.ai} label={x.text}>
              <option value={`{${x.ai}}`}>{`{${x.ai}}`} — {valueOf(x)}</option>
              {DATE_FORMATS.map((format) => (
                <option key={format} value={`{${x.ai}:${format}}`}>
                  {`{${x.ai}:${format}}`} — {formatDate(valueOf(x), format, { today, months })}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={x.ai} value={`{${x.ai}}`}>
              {`{${x.ai}}`} — {x.text}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

/** The page's size, its elements and the selected one's properties, under the canvas. */
export function DesignerPanel({ page, selected, elements, environments, environment, guided, problems, onEnvironment, onChange }: PanelProps) {
  const element = page.elements.find((e) => e.id === selected) ?? null;
  const update = (patch: Partial<DesignSymbol> | Partial<DesignText>) =>
    onChange({ ...page, elements: page.elements.map((e) => (e.id === selected ? ({ ...e, ...patch } as DesignElement) : e)) }, selected);
  const mm = (value: string, fallback: number) => millimetres(value, fallback);
  return (
    <div className="designer">
      <div className="grid">
        <div>
          <label htmlFor="page-width">{t("Label width (mm)")}</label>
          <input id="page-width" type="number" min={10} max={300} step={1} value={page.widthMm} onChange={(e) => onChange({ ...page, widthMm: mm(e.target.value, page.widthMm) }, selected)} />
        </div>
        <div>
          <label htmlFor="page-height">{t("Label height (mm)")}</label>
          <input id="page-height" type="number" min={10} max={300} step={1} value={page.heightMm} onChange={(e) => onChange({ ...page, heightMm: mm(e.target.value, page.heightMm) }, selected)} />
        </div>
        {!guided && (
          <div>
            <label htmlFor="page-env">{t("Scanning environment")}</label>
            <select id="page-env" value={environment} onChange={(e) => onEnvironment(e.target.value)}>
              {environments.map((name) => (
                <option key={name} value={name}>
                  {ENVIRONMENT_NAMES[name] ? t(ENVIRONMENT_NAMES[name]) : name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="hint error design-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="design-columns">
        <div>
          <span className="label">{t("Elements")}</span>
          <ul className="design-list">
            {page.elements.map((e) => (
              <li key={e.id}>
                <button type="button" aria-pressed={e.id === selected} onClick={() => onChange(page, e.id)}>
                  <span aria-hidden="true">{elementIcon(e)}</span> {elementName(e)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {!element ? (
            <p className="hint">{t("Choose an element in the list or on the label to change it; drag it on the label to move it.")}</p>
          ) : (
            <div className="grid">
              {element.kind === "symbol" ? (
                <>
                  <div>
                    <label htmlFor="el-symbol">{t("Symbol")}</label>
                    <select id="el-symbol" value={element.symbology} onChange={(e) => update({ symbology: e.target.value as SymbologyId })}>
                      {OFFERED.map((symbology) => (
                        <option key={symbology.id} value={symbology.id}>
                          {tm(symbology.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="el-size">{t("Size")}</label>
                    <select id="el-size" value={element.size} onChange={(e) => update({ size: Number(e.target.value) })}>
                      {SIZES.map((size) => (
                        <option key={size} value={size}>
                          {t("{size} %", { size })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="check">
                    <label>
                      <input type="checkbox" checked={element.hri} onChange={(e) => update({ hri: e.target.checked })} /> {t("Human readable text")}
                    </label>
                  </div>
                  <fieldset className="wide">
                    <legend>{t("Element strings it carries")}</legend>
                    {SYMBOLOGIES[element.symbology].data === "uri" ? (
                      <p className="hint">{t("A GS1 Digital Link URI carries them all.")}</p>
                    ) : (
                      elements.map(({ ai, text }) => (
                        <label key={ai} className="inline">
                          <input
                            type="checkbox"
                            checked={!element.ais || element.ais.includes(ai)}
                            onChange={(e) => {
                              const now = element.ais ?? elements.map((x) => x.ai);
                              const next = e.target.checked ? elements.map((x) => x.ai).filter((a) => a === ai || now.includes(a)) : now.filter((a) => a !== ai);
                              update({ ais: next.length === elements.length ? null : next });
                            }}
                          />{" "}
                          <code>{text}</code>
                        </label>
                      ))
                    )}
                  </fieldset>
                </>
              ) : element.kind === "line" || element.kind === "box" ? (
                <ShapeFields element={element} onChange={(shape) => onChange({ ...page, elements: page.elements.map((e) => (e.id === selected ? shape : e)) }, selected)} />
              ) : (
                <>
                  <div className="wide">
                    <label htmlFor="el-text">{t("Text")}</label>
                    <textarea id="el-text" rows={2} value={element.text} onChange={(e) => update({ text: e.target.value })} />
                    <p className="hint">{t("A date takes a format after a colon, such as {field}: DD, MM, MMM, YY and YYYY.", { field: "{17:DD/MM/YYYY}" })}</p>
                  </div>
                  <FieldInsert elements={elements} months={element.months ?? "en"} onInsert={(field) => update({ text: element.text + field })} />
                  {/MMM/.test(element.text) && (
                    <div>
                      <label htmlFor="el-months">{t("Month names")}</label>
                      <select id="el-months" value={element.months ?? "en"} onChange={(e) => update({ months: e.target.value as MonthLanguage })}>
                        {MONTH_LANGUAGES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="el-height">{t("Text height")}</label>
                    <select id="el-height" value={element.heightMm} onChange={(e) => update({ heightMm: Number(e.target.value) })}>
                      {TEXT_HEIGHTS.map((h) => (
                        <option key={h} value={h}>
                          {t("{mm} mm", { mm: formatNumber(h) })}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label htmlFor="el-x">{t("Left (mm)")}</label>
                <input id="el-x" type="number" step={STEP_MM} value={element.xMm} onChange={(e) => update({ xMm: mm(e.target.value, element.xMm) })} />
              </div>
              <div>
                <label htmlFor="el-y">{t("Top (mm)")}</label>
                <input id="el-y" type="number" step={STEP_MM} value={element.yMm} onChange={(e) => update({ yMm: mm(e.target.value, element.yMm) })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
