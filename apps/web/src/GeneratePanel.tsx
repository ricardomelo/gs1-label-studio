import {
  DEFAULT_PATTERN,
  fitsSheet,
  LABEL_SHEETS,
  patternProblem,
  sheetProblem,
  type BatchFile,
  type BatchRequest,
  type LabelSheet,
} from "@gs1-label-studio/core";
import { useState } from "react";
import { GENERATE_TEXTS } from "./texts.ts";

// In bulk, under the label's Export bar (backlog 2.4, mock-up A of three, 30 October 2026): the label shown, drawn for
// every row ready or fixed, in the files chosen, in one zip with the CSV of what was generated.

/** What the panel asks of the studio; the design is the label's. */
export type GenerateChoice = Omit<BatchRequest, "design" | "pngResolution" | "hriAsText">;

interface Props {
  /** Rows ready or fixed, and rows left out (in error or skipped). */
  ready: number;
  left: number;
  /** The first row's file name for a pattern, as an example. */
  example: (pattern: string) => string | null;
  dpi: number;
  /** The label shown, in mm at 100 %: whether it fits the sheet's labels. */
  labelMm?: readonly [number, number];
  /** Progress of a generation running: labels drawn of all. */
  progress: { done: number; total: number } | null;
  result: string | null;
  error: string | null;
  onGenerate: (choice: GenerateChoice) => void;
}

const FILES: BatchFile[] = ["svg", "png", "pdf", "eps"];

// The choices are kept for the next visit in this browser: a convenience, never needed.
const KEY = "gs1-label-studio.generate";
interface Kept {
  files: BatchFile[];
  pattern: string;
  pdf: boolean;
  sheet: string;
  custom: LabelSheet;
  zpl: boolean;
}
const CUSTOM: LabelSheet = {
  id: "custom", name: "Custom sheet", page: [210, 297], label: [70, 37], columns: 3, rows: 8, margin: [0, 0.5], pitch: [70, 37],
};
function kept(): Kept {
  const start: Kept = { files: ["svg"], pattern: DEFAULT_PATTERN, pdf: true, sheet: "", custom: CUSTOM, zpl: false };
  try {
    return { ...start, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Kept>) };
  } catch {
    return start;
  }
}

/** A number field of the custom sheet, in mm or a count. */
function Num({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min="0" step="any" value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))} />
    </div>
  );
}

export function GeneratePanel({ ready, left, example, dpi, labelMm, progress, result, error, onGenerate }: Props) {
  const [choice, setChoice] = useState<Kept>(kept);
  const [start, setStart] = useState(1);
  const update = (next: Partial<Kept>) => {
    const all = { ...choice, ...next };
    setChoice(all);
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Not kept: the defaults next time.
    }
  };
  const sheet = choice.sheet === "custom" ? choice.custom : LABEL_SHEETS.find((s) => s.id === choice.sheet);
  const perSheet = sheet ? sheet.columns * sheet.rows : 0;
  const from = Math.min(Math.max(1, Math.floor(start) || 1), perSheet || 1);
  const sheets = sheet ? Math.ceil((from - 1 + ready) / perSheet) : 0;
  const problem = patternProblem(choice.pattern) ?? (sheet ? sheetProblem(sheet) : null);
  const tooLarge = sheet && labelMm && !sheetProblem(sheet) ? fitsSheet(labelMm[0], labelMm[1], sheet) : null;
  const nothing = !choice.files.length && !choice.pdf && !sheet && !choice.zpl;
  const first = choice.files.length && !problem ? example(choice.pattern) : null;
  const custom = choice.custom;
  const setCustom = (next: Partial<LabelSheet>) => update({ custom: { ...custom, ...next } });

  return (
    <section className="generate" aria-labelledby="generate-title">
      <div className="generate-head">
        <b id="generate-title">Generate in bulk</b>
        <span className="hint">
          {GENERATE_TEXTS.intro} {left ? `${left} ${left === 1 ? "row" : "rows"} left out (errors or skipped) ${left === 1 ? "is" : "are"} named in the CSV.` : ""}
        </span>
      </div>
      <div className="generate-grid">
        <fieldset>
          <legend>A file a row</legend>
          <div className="checks">
            {FILES.map((kind) => (
              <label key={kind} className="check">
                <input
                  type="checkbox"
                  checked={choice.files.includes(kind)}
                  onChange={(e) => update({ files: e.target.checked ? FILES.filter((k) => k === kind || choice.files.includes(k)) : choice.files.filter((k) => k !== kind) })}
                />
                {kind.toUpperCase()}
              </label>
            ))}
          </div>
          <label htmlFor="gen-pattern">File names</label>
          <input id="gen-pattern" className="mono" value={choice.pattern} spellCheck={false}
            aria-invalid={Boolean(patternProblem(choice.pattern))} onChange={(e) => update({ pattern: e.target.value })} />
          <div className="hint">
            {GENERATE_TEXTS.pattern}
            {first ? ` First: ${first}.${choice.files[0]}` : ""}
          </div>
        </fieldset>
        <fieldset>
          <legend>To print</legend>
          <label className="check">
            <input type="checkbox" checked={choice.pdf} onChange={(e) => update({ pdf: e.target.checked })} />
            One PDF, a label a page
          </label>
          <label htmlFor="gen-sheet">Label sheets</label>
          <select id="gen-sheet" value={choice.sheet} onChange={(e) => update({ sheet: e.target.value })}>
            <option value="">None</option>
            {LABEL_SHEETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="custom">Custom sheet…</option>
          </select>
          {choice.sheet === "custom" && (
            <div className="sheet-fields">
              <Num id="gen-pw" label="Page width (mm)" value={custom.page[0]} onChange={(v) => setCustom({ page: [v, custom.page[1]] })} />
              <Num id="gen-ph" label="Page height (mm)" value={custom.page[1]} onChange={(v) => setCustom({ page: [custom.page[0], v] })} />
              <Num id="gen-lw" label="Label width (mm)" value={custom.label[0]} onChange={(v) => setCustom({ label: [v, custom.label[1]] })} />
              <Num id="gen-lh" label="Label height (mm)" value={custom.label[1]} onChange={(v) => setCustom({ label: [custom.label[0], v] })} />
              <Num id="gen-cols" label="Columns" value={custom.columns} onChange={(v) => setCustom({ columns: v })} />
              <Num id="gen-rows" label="Rows" value={custom.rows} onChange={(v) => setCustom({ rows: v })} />
              <Num id="gen-ml" label="Left margin (mm)" value={custom.margin[0]} onChange={(v) => setCustom({ margin: [v, custom.margin[1]] })} />
              <Num id="gen-mt" label="Top margin (mm)" value={custom.margin[1]} onChange={(v) => setCustom({ margin: [custom.margin[0], v] })} />
              <Num id="gen-xp" label="Across, edge to edge (mm)" value={custom.pitch[0]} onChange={(v) => setCustom({ pitch: [v, custom.pitch[1]] })} />
              <Num id="gen-yp" label="Down, edge to edge (mm)" value={custom.pitch[1]} onChange={(v) => setCustom({ pitch: [custom.pitch[0], v] })} />
            </div>
          )}
          {sheet && (
            <div className="hint">
              From label{" "}
              <input id="gen-start" className="start" type="number" min="1" max={perSheet} value={start} aria-label="First label to use on the first sheet"
                onChange={(e) => setStart(Number(e.target.value))} />{" "}
              of the first sheet · {ready} {ready === 1 ? "label" : "labels"} on {sheets} {sheets === 1 ? "sheet" : "sheets"}.{" "}
              {GENERATE_TEXTS.sheet}
            </div>
          )}
          {tooLarge && <p className="error small">{tooLarge}</p>}
          <label className="check">
            <input type="checkbox" checked={choice.zpl} onChange={(e) => update({ zpl: e.target.checked })} />
            One ZPL file ({dpi} dpi)
          </label>
        </fieldset>
      </div>
      {problem && <p className="error small">{problem}</p>}
      <div className="generate-go">
        <button
          type="button"
          className="btn primary"
          disabled={!ready || nothing || Boolean(problem) || progress !== null}
          onClick={() => onGenerate({
            files: choice.files, pattern: choice.pattern, pdf: choice.pdf, ...(sheet ? { sheet: { sheet, start: from } } : {}),
            ...(choice.zpl ? { zplDpi: dpi } : {}),
          })}
        >
          Generate {ready} {ready === 1 ? "label" : "labels"}
        </button>
        <span className="hint" aria-live="polite">
          {progress
            ? `Drawing ${progress.done} of ${progress.total}…`
            : result ?? (nothing ? GENERATE_TEXTS.nothing : GENERATE_TEXTS.zip)}
        </span>
      </div>
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
