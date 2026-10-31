import { useState } from "react";
import {
  aiEntry,
  normaliseCell,
  reportCounts,
  rowStatus,
  type CellEdits,
  offeredAttributes,
  identifierKeys,
  qualifiersOf,
  type CheckedRow,
  type ColumnMapping,
  type FixedValue,
  type RowStatus,
  type Sequence,
  type Table,
} from "@gs1-label-studio/core";
import { SequenceForm } from "./SequenceForm.tsx";
import { aiText, byAi, BULK_TEXTS, ROW_STATUS_NAMES } from "./texts.ts";
import { en, formatNumber, t, tm } from "./i18n.ts";

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
  /** A sequence made in the studio (backlog 2.3): rows of its own, or a column added to the rows loaded. */
  onSequence: (sequence: Sequence, as: "rows" | "column") => void;
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
const choices = (): { group: string; options: [string, string][] }[] => {
  const seen = new Set<string>();
  const options = (list: [string, string | undefined][]) =>
    list.filter(([ai]) => !seen.has(ai) && seen.add(ai)).map(([ai, title]) => [ai, aiText(ai, title)] as [string, string]);
  const keys = identifierKeys().sort(byAi);
  return [
    { group: t("Keys"), options: options(keys.map((key) => [key, aiEntry(key)?.title])) },
    { group: t("Qualifiers"), options: options(keys.flatMap((key) => qualifiersOf(key)).sort(byAi).map((ai) => [ai, aiEntry(ai)?.title])) },
    { group: t("Data attributes"), options: options(offeredAttributes().map((a) => [a.ai, a.title])) },
  ];
};

function AiSelect({ id, value, onChange, label }: { id: string; value: string | null; onChange: (ai: string | null) => void; label: string }) {
  return (
    <select id={id} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t("Not used")}</option>
      {choices().map(({ group, options }) => (
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
  const { table, source, mapping, fixed, rows, error, onFile, onPaste, onSequence, onMapping, onFixed } = props;
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);

  return (
    <section className="card" aria-labelledby="rows-title">
      <h2 id="rows-title">
        <span className="n">1</span> {t("Rows")} <span className="badge">{t("CSV, Excel or pasted")}</span>
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
        {t(BULK_TEXTS.drop)}{" "}
        <label className="link">
          {t("Choose a file")}
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
          aria-label={t("Rows pasted from a spreadsheet")}
          placeholder={t(BULK_TEXTS.pastePlaceholder)}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
        />
        <button type="button" className="btn" disabled={!pasted.trim()} onClick={() => onPaste(pasted)}>
          {t("Use the pasted rows")}
        </button>
        <SequenceForm
          loaded={table?.rows.length ?? 0}
          onRows={(sequence) => onSequence(sequence, "rows")}
          onColumn={(sequence) => onSequence(sequence, "column")}
        />
      </div>
      {error && <p className="error small">{error}</p>}

      {table && (
        <>
          <div className="source">
            <b>{source}</b>
            {table.sheet ? ` · ${t("sheet “{name}”", { name: table.sheet })}` : ""} · {table.rows.length === 1 ? t("1 row") : t("{n} rows", { n: table.rows.length })} ·{" "}
            {t("headers in row 1")}
          </div>
          <table className="mapping">
            <thead>
              <tr>
                <th>{t("Column")}</th>
                <th>{t("First value")}</th>
                <th>{t("Goes to")}</th>
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
                        label={t("Column {header} goes to", { header })}
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
            <b>{t("Same value on every row")}</b>{" "}
            <button type="button" className="link" onClick={() => onFixed([...fixed, ["", ""]])}>
              {t("+ Add")}
            </button>
            {fixed.map(([ai, value], index) => (
              <div className="fixed-row" key={index}>
                <AiSelect
                  id={`fixed-ai-${index}`}
                  label={t("Value {n}: AI", { n: index + 1 })}
                  value={ai || null}
                  onChange={(next) => onFixed(fixed.map((f, i) => (i === index ? [next ?? "", f[1]] : f)))}
                />
                <input
                  aria-label={t("Value {n}", { n: index + 1 })}
                  className="mono"
                  value={value}
                  onChange={(e) => onFixed(fixed.map((f, i) => (i === index ? [f[0], e.target.value] : f)))}
                />
                <button
                  type="button"
                  className="ibtn"
                  aria-label={t("Remove value {n}", { n: index + 1 })}
                  onClick={() => onFixed(fixed.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
            {!fixed.length && <div className="hint">{t(BULK_TEXTS.fixedHint)}</div>}
          </div>

          <Report {...props} table={table} />
          <div className="hint">{t(BULK_TEXTS.remembered)}</div>
        </>
      )}
    </section>
  );
}

const PAGE = 20;
const FILTERS: { status: RowStatus | "all"; label: string }[] = [
  { status: "error", label: en("With errors") },
  { status: "fixed", label: en("Fixed") },
  { status: "skipped", label: en("Skipped") },
  { status: "all", label: en("All") },
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


  return (
    <div className="summary report" aria-live="polite">
      <span className="ok">{counts.ready === 1 ? t("1 row ready") : t("{n} rows ready", { n: counts.ready })}</span>
      {counts.error > 0 && (
        <>
          {" · "}
          <span className="bad">{t("{n} with errors", { n: counts.error })}</span>
        </>
      )}
      {counts.fixed > 0 && ` · ${t("{n} fixed", { n: counts.fixed })}`}
      {counts.skipped > 0 && ` · ${t("{n} skipped", { n: counts.skipped })}`}
      <div className="rep-tabs" role="group" aria-label={t("Rows shown")}>
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
            {t(label)} ({count(status)})
          </button>
        ))}
      </div>
      {!listed.length && <div className="hint">{filter === "error" ? t("No row has an error.") : t("No rows here.")}</div>}
      {listed.slice(0, shown).map(({ row, index, status }) => (
        <div className="rrow" data-status={status} key={row.row} data-row={row.row}>
          <div className="head">
            <b>{t("Row {n}", { n: row.row })}</b>
            <span className="tag-line">
              {status !== "error" && <span className="tag" data-status={status}>{t(ROW_STATUS_NAMES[status])}</span>}
              <button type="button" className="link" onClick={() => onShow(index)}>
                {t("Show")}
              </button>
              {" · "}
              <button type="button" className="link" onClick={() => {
                  keep(index);
                  onSkip([index], status !== "skipped");
                }}>
                {status === "skipped" ? t("Include") : t("Skip")}
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
                    {t("Undo the fixes")}
                  </button>
                </>
              )}
            </span>
          </div>
          {row.error && <div className="why">{tm(row.error)}</div>}
          {row.hint && <div className="hint">{tm(row.hint)}</div>}
          {row.fixedAt?.length ? (
            <div className="hint">
              {t("{values} is a value for every row: change it above.", { values: row.fixedAt.map((at) => `(${fixed[at]![0]}) ${fixed[at]![1]}`).join(", ") })}
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
          {t("Show {n} more of {rest}", { n: Math.min(PAGE, listed.length - shown), rest: listed.length - shown })}
        </button>
      )}
      <div className="rep-actions">
        {errors.length > 0 && (
          <button type="button" className="btn" onClick={() => onSkip(errors, true)}>
            {errors.length === 1 ? t("Skip the 1 row with errors") : t("Skip the {n} rows with errors", { n: errors.length })}
          </button>
        )}
        {skippedRows.length > 0 && (
          <button type="button" className="btn" onClick={() => onSkip(skippedRows, false)}>
            {t("Include the skipped rows")}
          </button>
        )}
        <button type="button" className="btn" onClick={() => onDownload("report")}>
          {t("Report (CSV)")}
        </button>
        <button type="button" className="btn" disabled={!Object.keys(edits).length} onClick={() => onDownload("corrected")}>
          {t("Corrected rows (CSV)")}
        </button>
      </div>
      <div className="hint">{t(BULK_TEXTS.report)}</div>
    </div>
  );
}
