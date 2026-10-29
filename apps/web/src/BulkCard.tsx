import { useState } from "react";
import {
  aiEntry,
  normaliseCell,
  offeredAttributes,
  primaryKeys,
  qualifiersOf,
  type CheckedRow,
  type ColumnMapping,
  type FixedValue,
  type Table,
} from "@gs1-label-studio/core";
import { BULK_TEXTS, KEY_TEXTS } from "./texts.ts";

// Step 1 in bulk (backlog 2.1, mock-up A of 29 October 2026): rows from a file or pasted, each column's AI — guessed
// from its header, remembered for files with the same headers —, values the same on every row, and how many rows the
// GS1 Barcode Syntax Engine accepts. Steps 2 and 3 are the editor's, drawing the row chosen in the label's preview.

interface Props {
  table: Table | null;
  source: string;
  mapping: ColumnMapping;
  fixed: FixedValue[];
  rows: CheckedRow[];
  error: string | null;
  onFile: (file: File) => void;
  onPaste: (text: string) => void;
  onMapping: (mapping: ColumnMapping) => void;
  onFixed: (fixed: FixedValue[]) => void;
  /** Shows a row (its index among the data rows) in the label's preview. */
  onShow: (index: number) => void;
}

/** The AIs a column can go to: keys, their qualifiers, then the data attributes, each once. */
const CHOICES: { group: string; options: [string, string][] }[] = (() => {
  const seen = new Set<string>();
  const options = (list: [string, string | undefined][]) =>
    list.filter(([ai]) => !seen.has(ai) && seen.add(ai)).map(([ai, title]) => [ai, `(${ai}) ${title ?? ""}`.trim()] as [string, string]);
  const keys = primaryKeys();
  return [
    { group: "Keys", options: options(keys.map((key) => [key, KEY_TEXTS[key]?.name.replace(/\s*\(\d+\)$/, "") ?? aiEntry(key)?.title])) },
    { group: "Qualifiers", options: options(keys.flatMap((key) => qualifiersOf(key)).map((ai) => [ai, aiEntry(ai)?.title])) },
    { group: "Data attributes", options: options(offeredAttributes().map((a) => [a.ai, a.title])) },
  ];
})();

function AiSelect({ id, value, onChange, label }: { id: string; value: string | null; onChange: (ai: string | null) => void; label: string }) {
  return (
    <select id={id} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Not used</option>
      {CHOICES.map(({ group, options }) => (
        <optgroup key={group} label={group}>
          {options.map(([ai, text]) => (
            <option key={ai} value={ai}>
              {text}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function BulkCard({ table, source, mapping, fixed, rows, error, onFile, onPaste, onMapping, onFixed, onShow }: Props) {
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [allErrors, setAllErrors] = useState(false);
  const bad = rows.filter((r) => r.error);
  const shown = allErrors ? bad : bad.slice(0, 5);

  return (
    <section className="card" aria-labelledby="rows-title">
      <h2 id="rows-title">
        <span className="n">1</span> Rows <span className="badge">CSV, Excel or pasted</span>
      </h2>
      <div
        className={`drop${dragging ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        {BULK_TEXTS.drop}{" "}
        <label className="link">
          Choose a file
          <input
            id="rows-file"
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          id="rows-paste"
          aria-label="Rows pasted from a spreadsheet"
          placeholder={BULK_TEXTS.pastePlaceholder}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
        />
        <button type="button" className="btn" disabled={!pasted.trim()} onClick={() => onPaste(pasted)}>
          Use the pasted rows
        </button>
      </div>
      {error && <p className="error small">{error}</p>}

      {table && (
        <>
          <div className="source">
            <b>{source}</b>
            {table.sheet ? ` · sheet “${table.sheet}”` : ""} · {table.rows.length} {table.rows.length === 1 ? "row" : "rows"} ·
            headers in row 1
          </div>
          <table className="mapping">
            <thead>
              <tr>
                <th>Column</th>
                <th>First value</th>
                <th>Goes to</th>
              </tr>
            </thead>
            <tbody>
              {table.headers.map((header, column) => {
                const first = table.rows.find((r) => r[column]?.trim())?.[column] ?? "";
                const ai = mapping[column] ?? null;
                const normalised = ai && first ? normaliseCell(ai, first) : first;
                return (
                  <tr key={column}>
                    <td>{header}</td>
                    <td className="mono">{normalised !== first.trim() ? `${first} → ${normalised}` : first}</td>
                    <td>
                      <AiSelect
                        id={`map-${column}`}
                        label={`Column ${header} goes to`}
                        value={ai}
                        onChange={(next) => onMapping(mapping.map((m, i) => (i === column ? next : m)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="fixed">
            <b>Same value on every row</b>{" "}
            <button type="button" className="link" onClick={() => onFixed([...fixed, ["", ""]])}>
              + Add
            </button>
            {fixed.map(([ai, value], index) => (
              <div className="fixed-row" key={index}>
                <AiSelect
                  id={`fixed-ai-${index}`}
                  label={`Value ${index + 1}: AI`}
                  value={ai || null}
                  onChange={(next) => onFixed(fixed.map((f, i) => (i === index ? [next ?? "", f[1]] : f)))}
                />
                <input
                  aria-label={`Value ${index + 1}`}
                  className="mono"
                  value={value}
                  onChange={(e) => onFixed(fixed.map((f, i) => (i === index ? [f[0], e.target.value] : f)))}
                />
                <button
                  type="button"
                  className="ibtn"
                  aria-label={`Remove value ${index + 1}`}
                  onClick={() => onFixed(fixed.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
            {!fixed.length && <div className="hint">{BULK_TEXTS.fixedHint}</div>}
          </div>

          <div className="summary" aria-live="polite">
            <span className="ok">
              {rows.length - bad.length} {rows.length - bad.length === 1 ? "row" : "rows"} ready
            </span>
            {bad.length > 0 && (
              <>
                {" · "}
                <span className="bad">{bad.length} with errors</span>
                <ul>
                  {shown.map((r) => (
                    <li key={r.row}>
                      <button type="button" className="link" onClick={() => onShow(r.row - 2)}>
                        Row {r.row}
                      </button>
                      : {r.error}
                    </li>
                  ))}
                </ul>
                {bad.length > 5 && (
                  <button type="button" className="link" onClick={() => setAllErrors(!allErrors)}>
                    {allErrors ? "Show the first five" : `Show all ${bad.length}`}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="hint">{BULK_TEXTS.remembered}</div>
        </>
      )}
    </section>
  );
}
