import type { CheckResult, GroupKind, GroupResult, Verdict } from "@gs1-label-studio/core";
import { useState, type ReactNode } from "react";
import { SIMPLE_TEXTS } from "./checkTexts.ts";
import { columnsText, GROUP_KINDS, groupDetailLines, memberName, type Member } from "./group.ts";
import { en, t } from "./i18n.ts";
import { VERDICT_ICONS, VERDICT_WORDS } from "./Picture.tsx";
import { aiTitle } from "./texts.ts";

// The Check Studio's group on screen (backlog 7.1 i; the check studio's project, sections 5.1 to 5.4; ADR 0007
// decision 15): the codes of one item listed, numbered, each ticked into the check or left out; the kind of group the
// user names; the group's verdict; the matrix of section 5.3, one row per AI and one column per code, the cells that
// differ marked; and a card per group fault. A column's head opens that code's own result below.

const SEVERITIES: Record<string, string> = { error: en("Error"), warning: en("Warning"), note: en("Note"), "not-assessed": en("Not checked") };

interface Props {
  members: readonly Member[];
  /** Each member's own result, ticked or not. */
  results: readonly (CheckResult | null)[];
  /** checkGroup() over the ticked members, in their order; null with fewer than two. */
  group: GroupResult | null;
  kind: GroupKind;
  onKind: (kind: GroupKind) => void;
  /** The member whose own result is shown below; null for the code just read. */
  selected: number | null;
  onSelect: (index: number) => void;
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
  /** The next code read joins the group. */
  awaiting: boolean;
  onAdd: () => void;
  /** Back to one code at a time. */
  onClose: () => void;
  /** The item's report as a PDF (7.1 k). */
  onReport: () => void;
  verdictBox: (verdict: Verdict) => ReactNode;
}

export function GroupMatrix({ members, results, group, kind, onKind, selected, onSelect, onToggle, onRemove, awaiting, onAdd, onClose, onReport, verdictBox }: Props) {
  // The ticked members, as the matrix's columns: column c is member on[c]
  const on = members.flatMap((m, i) => (m.on ? [i] : []));
  const [split, setSplit] = useState<boolean | null>(null);
  const name = (i: number) => memberName(members[i]!.reading, group?.columns[on.indexOf(i)]);

  return (
    <section className="card check-group" aria-labelledby="check-group-title">
      <h2 id="check-group-title">{t("The codes of this item")}</h2>
      <div className="check-place" role="group" aria-labelledby="check-group-kind">
        <h3 id="check-group-kind">{t("What is this item?")}</h3>
        <div className="chips">
          {GROUP_KINDS.map((k) => (
            <button key={k.value} type="button" className="chip" aria-pressed={kind === k.value} onClick={() => onKind(k.value)}>
              {t(k.text)}
            </button>
          ))}
        </div>
      </div>
      <ol className="group-members" aria-label={t("The codes in the group")}>
        {members.map((m, i) => {
          const verdict = results[i]?.verdict ?? "not-assessed";
          const column = on.indexOf(i);
          return (
            <li key={i} data-on={m.on || undefined} data-selected={selected === i || undefined}>
              <label className="group-tick">
                <input type="checkbox" checked={m.on} onChange={() => onToggle(i)} />
                <b>{column >= 0 ? column + 1 : "–"}</b> {name(i)}
              </label>
              <span className="group-verdict" data-verdict={verdict} title={t(VERDICT_WORDS[verdict])}>
                {VERDICT_ICONS[verdict]} <span>{t(VERDICT_WORDS[verdict])}</span>
              </span>
              <button type="button" className="link" onClick={() => onSelect(i)}>{t("Its own result")}</button>
              <button type="button" className="link" aria-label={t("Remove {name}", { name: name(i) })} onClick={() => onRemove(i)}>
                {t("Remove")}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="check-row">
        <button type="button" className="btn primary" onClick={onAdd} disabled={awaiting}>
          {t("Add another code from this item")}
        </button>
        <button type="button" className="btn" onClick={onClose}>{t("Check codes one at a time")}</button>
        {group && <button type="button" className="btn" onClick={onReport}>{t("Item report (PDF)")}</button>}
      </div>
      {awaiting && <p className="hint" role="status">{t("Read the next code in any way above: it joins this item.")}</p>}
      {!group && !awaiting && <p className="hint">{t("Tick at least two codes to compare them.")}</p>}
      {group && (
        <>
          {verdictBox(group.verdict)}
          <h3 id="check-matrix">{t("What each code says")}</h3>
          <div className="matrix-scroll">
            <table className="group-matrix" aria-labelledby="check-matrix">
              <thead>
                <tr>
                  <th scope="col">{t("Detail")}</th>
                  {on.map((i, c) => (
                    <th key={i} scope="col" data-selected={selected === i || undefined}>
                      <button type="button" className="link" onClick={() => onSelect(i)} title={t("Its own result")}>
                        <b>{c + 1}</b> {name(i)}
                      </button>
                      <span className="group-verdict" data-verdict={results[i]?.verdict ?? "not-assessed"}>{VERDICT_ICONS[results[i]?.verdict ?? "not-assessed"]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.matrix.map((row) => (
                  <tr key={row.ai} data-differs={row.differs || undefined}>
                    <th scope="row">
                      {aiTitle(row.ai, row.title)} <small className="mono">({row.ai})</small>
                    </th>
                    {row.values.map((value, c) => (
                      <td key={c} className="mono" data-col={`${c + 1} ${name(on[c]!)}`} data-differs={(row.differs && value !== null) || undefined}>
                        {value ?? <span className="absent" aria-label={t("not carried")}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {group.matrix.some((r) => r.differs) && <p className="hint">{t("Marked: the codes that carry this detail do not agree, character for character.")}</p>}
          {group.findings.some((f) => f.severity !== "not-assessed") && (
            <>
              <h3 id="check-group-wrong">{t("What is wrong with the group")} ({group.findings.filter((f) => f.severity !== "not-assessed").length})</h3>
              <ol className="findings" aria-labelledby="check-group-wrong">
                {group.findings
                  .filter((f) => f.severity !== "not-assessed")
                  .map((f, k) => {
                    const texts = SIMPLE_TEXTS[f.code];
                    const indicator = f.code === "J1" && f.details?.indicatorOnly === "true";
                    return (
                      <li key={k} className="finding" data-severity={f.severity} data-code={f.code}>
                        <p className="finding-what">
                          <span className="severity">{t(SEVERITIES[f.severity] ?? f.severity)}</span> {texts ? t(texts.what) : f.code}
                        </p>
                        <p className="finding-where">
                          <b>{t("Where:")}</b> {columnsText(f.columns)}
                          {f.ai && <> · {aiTitle(f.ai, group.matrix.find((r) => r.ai === f.ai)?.title ?? "")} ({f.ai})</>}
                        </p>
                        {texts && (
                          <>
                            <p><b>{t("Why it matters:")}</b> {t(texts.why)}</p>
                            <p><b>{t("How to fix:")}</b> {t(texts.fix)}</p>
                          </>
                        )}
                        {groupDetailLines(f).map((line) => (
                          <p key={line} className="mono small">{line}</p>
                        ))}
                        {indicator && (
                          <div className="group-question">
                            <p>{t("Is one of these the code of the box and the other of the product inside?")}</p>
                            <div className="chips">
                              <button type="button" className="chip" aria-pressed={split === true} onClick={() => setSplit(true)}>{t("Yes")}</button>
                              <button type="button" className="chip" aria-pressed={split === false} onClick={() => setSplit(false)}>{t("No")}</button>
                            </div>
                            {split === true && (
                              <p className="hint">
                                {t("Then they are different items, each with its own GTIN: check them one at a time.")}{" "}
                                <button type="button" className="link" onClick={onClose}>{t("Check codes one at a time")}</button>
                              </p>
                            )}
                            {split === false && <p className="hint">{t("Then one of the two GTINs is wrong: correct the odd one out.")}</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ol>
            </>
          )}
          {group.resolved.length > 0 && (
            <ul className="group-resolved">
              {group.resolved.map((r) => (
                <li key={`${r.column}-${r.code}`}>
                  {t("{code}: {what} — answered by the other codes of this item.", { code: columnsText([r.column]), what: SIMPLE_TEXTS[r.code] ? t(SIMPLE_TEXTS[r.code]!.what) : r.code })}
                </li>
              ))}
            </ul>
          )}
          {group.notChecked.length > 0 && (
            <>
              <h3 id="check-group-unchecked">{t("What was not checked")}</h3>
              <ul className="unchecked" aria-labelledby="check-group-unchecked">
                {group.notChecked.map((code) => (
                  <li key={code}>{code === "J4" ? t("Whether a shop item needs its ordinary barcode too: that needs the place.") : code === "J5" ? t("The distance between symbols: that needs a picture with a known scale.") : code}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
