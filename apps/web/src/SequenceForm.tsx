import { sequenceProblem, sequenceValues, type Sequence } from "@gs1-label-studio/core";
import { useState } from "react";
import { SEQUENCE_TEXTS } from "./texts.ts";
import { formatNumber, t, tm } from "./i18n.ts";

// In bulk, step 1 (backlog 2.3, mock-up A of two, 30 October 2026): serial numbers or SSCCs made in the studio, as rows of
// their own or as a column added to the rows already loaded.

interface Props {
  /** Rows already loaded, to which the sequence can be added as a column; 0 when none. */
  loaded: number;
  onRows: (sequence: Sequence) => void;
  onColumn: (sequence: Sequence) => void;
}

const number = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

export function SequenceForm({ loaded, onRows, onColumn }: Props) {
  const [kind, setKind] = useState<Sequence["kind"]>("serial");
  const [count, setCount] = useState("100");
  const [first, setFirst] = useState("1");
  const [step, setStep] = useState("1");
  const [prefix, setPrefix] = useState("");
  const [digits, setDigits] = useState("6");
  const [extension, setExtension] = useState("0");
  const [companyPrefix, setCompanyPrefix] = useState("");
  const common = { first: number(first), count: number(count), step: number(step) };
  const sequence: Sequence = kind === "serial"
    ? { kind, ...common, prefix, digits: number(digits) || 0 }
    : { kind, ...common, extension, companyPrefix };
  const problem = sequenceProblem(sequence);
  const ends = problem ? null : sequenceValues({ ...sequence, count: 1 })[0]!;
  const lastOne = problem ? null : sequenceValues({ ...sequence, first: sequence.first + (sequence.count - 1) * (sequence.step ?? 1), count: 1 })[0]!;
  const columnProblem = loaded ? sequenceProblem({ ...sequence, count: loaded }) : null;

  return (
    <div className="sequence">
      <b>{t(SEQUENCE_TEXTS.title)}</b>
      <div className="sequence-grid">
        <div>
          <label htmlFor="seq-kind">{t("What")}</label>
          <select id="seq-kind" value={kind} onChange={(e) => setKind(e.target.value as Sequence["kind"])}>
            <option value="serial">{t("Serial numbers (21)")}</option>
            <option value="sscc">{t("SSCCs (00)")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="seq-count">{t("How many")}</label>
          <input id="seq-count" type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="seq-first">{kind === "sscc" ? t("First serial reference") : t("First number")}</label>
          <input id="seq-first" type="number" min="0" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div>
          <label htmlFor="seq-step">{t("Step")}</label>
          <input id="seq-step" type="number" min="1" value={step} onChange={(e) => setStep(e.target.value)} />
        </div>
        {kind === "serial" ? (
          <>
            <div>
              <label htmlFor="seq-prefix">{t("Prefix")}</label>
              <input id="seq-prefix" className="mono" value={prefix} placeholder={t("e.g. S-")} spellCheck={false} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div>
              <label htmlFor="seq-digits">{t("Digits (zeros in front)")}</label>
              <input id="seq-digits" type="number" min="0" max="20" value={digits} onChange={(e) => setDigits(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="seq-extension">{t("Extension digit")}</label>
              <input id="seq-extension" className="mono" value={extension} maxLength={1} onChange={(e) => setExtension(e.target.value)} />
            </div>
            <div>
              <label htmlFor="seq-gcp">{t("GS1 Company Prefix")}</label>
              <input id="seq-gcp" className="mono" value={companyPrefix} placeholder={t("e.g. 0614141")} spellCheck={false}
                onChange={(e) => setCompanyPrefix(e.target.value.trim())} />
            </div>
          </>
        )}
      </div>
      <div className={problem ? "hint error" : "hint"} aria-live="polite">
        {problem ? tm(problem) : sequence.count === 1 ? ends : t("{first} to {last}", { first: ends!, last: lastOne! })}
        {!problem && kind === "sscc" ? ` · ${t(SEQUENCE_TEXTS.sscc)}` : ""}
      </div>
      <div className="sequence-go">
        <button type="button" className="btn" disabled={Boolean(problem)} onClick={() => onRows(sequence)}>
          {sequence.count === 1 ? t("Make 1 row") : t("Make {n} rows", { n: Number.isFinite(sequence.count) ? formatNumber(sequence.count) : "" })}
        </button>
        {loaded > 0 && (
          <button type="button" className="btn" disabled={Boolean(problem ?? columnProblem)} title={columnProblem ? tm(columnProblem) : undefined}
            onClick={() => onColumn(sequence)}>
            {loaded === 1 ? t("Add as a column to the 1 row") : t("Add as a column to the {n} rows", { n: formatNumber(loaded) })}
          </button>
        )}
      </div>
    </div>
  );
}
