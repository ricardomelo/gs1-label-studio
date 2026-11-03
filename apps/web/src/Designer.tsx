import { SIZES, SYMBOLOGIES, type DesignElement, type DesignPage, type DesignSymbol, type DesignText, type PlacedElement, type SymbologyId } from "@gs1-label-studio/core";
import { useRef } from "react";
import { formatNumber, t, tm } from "./i18n.ts";
import { ENVIRONMENT_NAMES } from "./texts.ts";

// A label of one's own (backlog 4.2, mock-up A of two, 3 November 2026): in step 3, "Label" offers it; the page on the
// canvas with its barcodes and text blocks, each selected by a click and moved by dragging it; "+ Barcode" and
// "+ Text" over the canvas; under it the page's size, the elements and the selected one's properties.

/** The symbols a barcode on the page can be: as step 3 offers them, not GS1 QR Code (ADR 0003). */
const OFFERED = Object.values(SYMBOLOGIES).filter((symbology) => symbology.id !== "gs1-qrcode");
const STEP_MM = 0.5; // dragging moves an element by half millimetres
const TEXT_HEIGHTS = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12];

const round = (mm: number) => Math.round(mm / STEP_MM) * STEP_MM;

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
      { id: "e2", kind: "text", text: firstAi ? `{${firstAi}}` : t("Text"), heightMm: 3, xMm: 4, yMm: 52 },
    ],
  };
}

/** The name an element goes by in the list and in the problems: its symbol, or its text's first line. */
export function elementName(element: DesignElement): string {
  return element.kind === "symbol" ? tm(SYMBOLOGIES[element.symbology].name) : `“${element.text.split("\n")[0] || t("Text")}”`;
}

interface ToolsProps {
  page: DesignPage;
  selected: string | null;
  symbology: SymbologyId;
  onChange: (page: DesignPage, selected: string | null) => void;
}

/** + Barcode, + Text and Delete, over the canvas. */
export function DesignerTools({ page, selected, symbology, onChange }: ToolsProps) {
  const add = (element: DesignElement) => onChange({ ...page, elements: [...page.elements, element] }, element.id);
  return (
    <div className="design-tools" data-pane="label" data-beside="">
      <button type="button" className="btn" onClick={() => add({ id: nextId(page), kind: "symbol", symbology, ais: null, size: 100, hri: true, xMm: 2, yMm: 2 })}>
        {t("+ Barcode")}
      </button>
      <button type="button" className="btn" onClick={() => add({ id: nextId(page), kind: "text", text: t("Text"), heightMm: 3, xMm: 4, yMm: 4 })}>
        {t("+ Text")}
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
      {placed.map((p) => {
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

/** The page's size, its elements and the selected one's properties, under the canvas. */
export function DesignerPanel({ page, selected, elements, environments, environment, guided, problems, onEnvironment, onChange }: PanelProps) {
  const element = page.elements.find((e) => e.id === selected) ?? null;
  const update = (patch: Partial<DesignSymbol> | Partial<DesignText>) =>
    onChange({ ...page, elements: page.elements.map((e) => (e.id === selected ? ({ ...e, ...patch } as DesignElement) : e)) }, selected);
  const mm = (value: string, fallback: number) => (Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback);
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
                  <span aria-hidden="true">{e.kind === "symbol" ? "▥" : "T"}</span> {elementName(e)}
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
              ) : (
                <>
                  <div className="wide">
                    <label htmlFor="el-text">{t("Text")}</label>
                    <textarea id="el-text" rows={2} value={element.text} onChange={(e) => update({ text: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="el-field">{t("Insert a field from the data")}</label>
                    <select id="el-field" value="" onChange={(e) => e.target.value && update({ text: `${element.text}{${e.target.value}}` })}>
                      <option value="">{t("Choose…")}</option>
                      {elements.map(({ ai, text }) => (
                        <option key={ai} value={ai}>
                          {`{${ai}}`} — {text}
                        </option>
                      ))}
                    </select>
                  </div>
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
