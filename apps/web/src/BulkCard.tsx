import { useState } from "react";
import {
  aiEntry,
  normaliseCell,
  reportCounts,
  rowStatus,
  type CellEdits,
  offeredAttributes,
  primaryKeys,
  qualifiersOf,
  type CheckedRow,
  type ColumnMapping,
  type FixedValue,
  type RowStatus,
  type Table,
} from "@gs1-label-studio/core";
import { aiText, byAi, BULK_TEXTS } from "./texts.ts";

// Step 1 in bulk (backlog 2.1, mock-up A of 29 October 2026): rows from a file or pasted, each column's AI — guessed
// from its header, remembered for files with the same headers —, values the same on every row, and how many rows the
// GS1 Barcode Syntax Engine accepts. Steps 2 and 3 are the editor's, drawing the row chosen in the label's preview.
// Below, the validation report (backlog 2.2, mock-up A of 29 October 2026): the rows in error with the cell at fault
// fixed in place — the file itself is not changed —, rows skipped, the report and the corrected rows as CSV.

interface Props {
  table: Table | null;
  source: string;
  mapping: ColumnMapping;
  fixed: FixedValue[];
  rows: CheckedRow[];
  /** Values fixed in the studio and rows skipped (by data row: 0 is the first row after the header). */
  edits: CellEdits;
  skipped: ReadonlySet<number>;
  error: string | null;
  onFile: (file: File) => void;
  onPaste: (text: string) => void;
  onMapping: (mapping: ColumnMapping) => void;
  onFixed: (fixed: FixedValue[]) => void;
  /** Shows a row (its index among the data rows) in the label's preview. */
  onShow: (index: number) => void;
  onEdit: (index: number, column: number, value: string) => void;
  onUndo: (index: number) => void;
  onSkip: (indexes: number[], skip: boolean) => void;
  onDownload: (what: "report" | "corrected") => void;
}

/** The AIs a column can go to: keys, their qualifiers, then the data attributes, each once. */
const CHOICES: { group: string; options: [string, string][] }[] = (() => {
  const seen = new Set<string>();
  const options = (list: [string, string | undefined][]) =>
    list.filter(([ai]) => !seen.has(ai) && seen.add(ai)).map(([ai, title]) => [ai, aiText(ai, title)] as [string, string]);
  const keys = primaryKeys().sort(byAi);
  return [
    { group: "Keys", options: options(keys.map((key) => [key, aiEntry(key)?.title])) },
    { group: "Qualifiers", options: options(keys.flatMap((key) => qualifiersOf(key)).sort(byAi).map((ai) => [ai, aiEntry(ai)?.title])) },
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

export function BulkCard(props: Props) {
  const { table, source, mapping, fixed, rows, error, onFile, onPaste, onMapping, onFixed } = props;
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);

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

          <Report {...props} table={table} />
          <div className="hint">{BULK_TEXTS.remembered}</div>
        </>
      )}
    </section>
  );
}

const PAGE = 20;
const FILTERS: { status: RowStatus | "all"; label: string }[] = [
  { status: "error", label: "With errors" },
  { status: "fixed", label: "Fixed" },
  { status: "skipped", label: "Skipped" },
  { status: "all", label: "All" },
];

/** The validation report: how many rows are ready, fixed, in error or skipped, and the rows of the filter chosen. */
function Report({ table, mapping, fixed, rows, edits, skipped, onShow, onEdit, onUndo, onSkip, onDownload }: Props & { table: Table }) {
  const counts = reportCounts(rows, edits, skipped);
  const [filter, setFilter] = useState<RowStatus | "all">("error");
  const [shown, setShown] = useState(PAGE);
  // A row fixed or skipped here stays in the list until another filter is chosen, so that it does not vanish while
  // its value is typed.
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set());
  const keep = (index: number) => kept.has(index) || setKept(new Set([...kept, index]));
  const statuses = rows.map((row, index) => rowStatus(row, index, edits, skipped));
  const listed = rows.map((row, index) => ({ row, index, status: statuses[index]! }))
    .filter(({ index, status }) => filter === "all" || status === filter || kept.has(index));
  const errors = statuses.flatMap((status, index) => (status === "error" ? [index] : []));
  const skippedRows = [...skipped];
  const count = (status: RowStatus | "all") => (status === "all" ? rows.length : counts[status]);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="summary report" aria-live="polite">
      <span className="ok">{plural(counts.ready, "row ready", "rows ready")}</span>
      {counts.error > 0 && (
        <>
          {" · "}
          <span className="bad">{counts.error} with errors</span>
        </>
      )}
      {counts.fixed > 0 && ` · ${counts.fixed} fixed`}
      {counts.skipped > 0 && ` · ${counts.skipped} skipped`}
      <div className="rep-tabs" role="group" aria-label="Rows shown">
        {FILTERS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => {
              setFilter(status);
              setShown(PAGE);
              setKept(new Set());
            }}
          >
            {label} ({count(status)})
          </button>
        ))}
      </div>
      {!listed.length && <div className="hint">{filter === "error" ? "No row has an error." : "No rows here."}</div>}
      {listed.slice(0, shown).map(({ row, index, status }) => (
        <div className="rrow" data-status={status} key={row.row} data-row={row.row}>
          <div className="head">
            <b>Row {row.row}</b>
            <span className="tag-line">
              {status !== "error" && <span className="tag" data-status={status}>{status}</span>}
              <button type="button" className="link" onClick={() => onShow(index)}>
                Show
              </button>
              {" · "}
              <button type="button" className="link" onClick={() => {
                  keep(index);
                  onSkip([index], status !== "skipped");
                }}>
                {status === "skipped" ? "Include" : "Skip"}
              </button>
              {edits[index] && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      keep(index);
                      onUndo(index);
                    }}
                  >
                    Undo the fixes
                  </button>
                </>
              )}
            </span>
          </div>
          {row.error && <div className="why">{row.error}</div>}
          {row.hint && <div className="hint">{row.hint}</div>}
          {row.fixedAt?.length ? (
            <div className="hint">
              {row.fixedAt.map((at) => `(${fixed[at]![0]}) ${fixed[at]![1]}`).join(", ")} is a value for every row: change it
              above.
            </div>
          ) : null}
          <div className="cells">
            {mapping.flatMap((ai, column) => {
              if (!ai) return [];
              const at = row.columns?.includes(column);
              const edited = edits[index]?.[column] !== undefined;
              const id = `cell-${index}-${column}`;
              return [
                <label key={`l${column}`} htmlFor={id} title={`(${ai})`}>
                  {table.headers[column]}
                </label>,
                <input
                  key={`i${column}`}
                  id={id}
                  className={`mono${at ? " at-fault" : edited ? " edited" : ""}`}
                  aria-invalid={at || undefined}
                  value={edits[index]?.[column] ?? table.rows[index]?.[column] ?? ""}
                  onChange={(e) => {
                    keep(index);
                    onEdit(index, column, e.target.value);
                  }}
                  spellCheck={false}
                />,
              ];
            })}
          </div>
        </div>
      ))}
      {listed.length > shown && (
        <button type="button" className="link more" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, listed.length - shown)} more of {listed.length - shown}
        </button>
      )}
      <div className="rep-actions">
        {errors.length > 0 && (
          <button type="button" className="btn" onClick={() => onSkip(errors, true)}>
            Skip the {plural(errors.length, "row", "rows")} with errors
          </button>
        )}
        {skippedRows.length > 0 && (
          <button type="button" className="btn" onClick={() => onSkip(skippedRows, false)}>
            Include the skipped rows
          </button>
        )}
        <button type="button" className="btn" onClick={() => onDownload("report")}>
          Report (CSV)
        </button>
        <button type="button" className="btn" disabled={!Object.keys(edits).length} onClick={() => onDownload("corrected")}>
          Corrected rows (CSV)
        </button>
      </div>
      <div className="hint">{BULK_TEXTS.report}</div>
    </div>
  );
}
