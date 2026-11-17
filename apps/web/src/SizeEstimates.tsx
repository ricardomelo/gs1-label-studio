import type { CheckResult, Reading } from "@gs1-label-studio/core";
import { useState } from "react";
import { estimateNote, num, parseMm } from "./estimates.ts";
import { t } from "./i18n.ts";
import { symbolName } from "./Picture.tsx";

// The size estimates of a picture's symbols (backlog 7.1 m; mock-up A of two taken: the printed width of one symbol,
// measured with a ruler and typed, rather than a line dragged over something of known size in the picture). The margins
// and an EAN/UPC's bar height need no scale; the X-dimension does. Each value is an estimate with its tolerance,
// never a grade, and the table says so above it.

interface Props {
  readings: readonly Reading[];
  results: readonly (CheckResult | null)[];
  /** The symbol whose printed width was given, and the width in mm; null for none. */
  scale: { index: number; mm: number } | null;
  onScale: (scale: { index: number; mm: number } | null) => void;
}

const mark = (result: CheckResult | null, code: string) =>
  result?.findings.some((f) => f.code === code) ? <span className="estimate-bad" title={t("Outside what the table allows")}>!</span> : <span className="estimate-ok">✓</span>;

export function SizeEstimates({ readings, results, scale, onScale }: Props) {
  const measured = readings.map((r, i) => [r, i] as const).filter(([r]) => r.measure && r.measure.across > 0);
  const [index, setIndex] = useState(scale?.index ?? measured[0]?.[1] ?? 0);
  const [width, setWidth] = useState(scale ? num(scale.mm) : "");
  const [wrong, setWrong] = useState(false);
  if (measured.length === 0) return null;
  const first = results.find((r) => r?.estimate?.quality);
  return (
    <section className="estimates" aria-labelledby="estimates-title">
      <h4 id="estimates-title">{t("Size estimates")}</h4>
      <p className="hint">{t("Measure the width of one symbol with a ruler, the bars or modules only, without the margins.")}</p>
      <form
        className="estimates-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (width.trim() === "") {
            setWrong(false);
            onScale(null);
            return;
          }
          const mm = parseMm(width);
          setWrong(mm === null);
          if (mm !== null) onScale({ index, mm });
        }}
      >
        <label>
          {t("Symbol")}
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {measured.map(([r, i]) => (
              <option key={i} value={i}>{`${i + 1} · ${symbolName(r)}`}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Printed width (mm)")}
          <input inputMode="decimal" size={6} value={width} aria-invalid={wrong || undefined} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <button type="submit" className="btn primary">{t("Estimate")}</button>
      </form>
      {wrong && <p className="hint" role="alert">{t("Type the width in millimetres, a number more than 0.")}</p>}
      <p className="hint">{estimateNote(first?.estimate?.table, first?.estimate?.quality)}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("Symbol")}</th>
            <th scope="col">{t("X-dimension")}</th>
            <th scope="col">{t("Margins")}</th>
            <th scope="col">{t("Bar height")}</th>
          </tr>
        </thead>
        <tbody>
          {measured.map(([r, i]) => {
            const result = results[i] ?? null;
            const e = result?.estimate ?? null;
            const sides = e?.quietZone ? Object.values(e.quietZone).filter((m): m is number => m !== null) : [];
            return (
              <tr key={i}>
                <td><b>{i + 1}</b> {symbolName(r)}</td>
                <td>
                  {e?.xMm ? (
                    <>
                      {t("{value} mm ± {tolerance}", { value: num(e.xMm.value, 2), tolerance: num(e.xMm.tolerance, 2) })}{" "}
                      {e.range && result?.notChecked.includes("H1") ? null : mark(result, "H1")}
                      {e.range && <small>{t("{min} to {max} mm", { min: num(e.range[0]), max: num(e.range[2]) })}</small>}
                    </>
                  ) : (
                    <span className="hint">{t("Give a printed width")}</span>
                  )}
                </td>
                <td>
                  {sides.length ? (
                    <>
                      {/* The narrowest side; a margin is measured up to 16 modules, enough for any table */}
                      {t("{n} modules", { n: Math.min(...sides) >= 15.5 ? "16+" : num(Math.min(...sides), 0) })} {mark(result, "H2")}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {e?.barHeight != null ? (
                    <>
                      {t("{n} modules", { n: num(e.barHeight, 0) })} {result?.notChecked.includes("H3") ? null : mark(result, "H3")}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
