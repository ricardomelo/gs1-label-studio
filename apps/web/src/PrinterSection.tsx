import { useState } from "react";
import { GENERIC_PROFILES, profileProblem, type ModuleChoice, type PrinterProfile } from "@gs1-label-studio/core";
import { PRINTER_TEXTS } from "./texts.ts";
import { formatNumber, t, tm } from "./i18n.ts";

// Printer profiles (backlog 3.1, mock-up A of two, 31 October 2026), above the EPC section: the printer the ZPL files are
// for — its resolution and print width —, the whole dots a module takes within the table's range, and a test label.
// The person's own profiles are kept in this browser (a convenience, never needed).

const KEY = "gs1-label-studio.printers";

export function keptProfiles(): PrinterProfile[] {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PrinterProfile[];
    return Array.isArray(kept) ? kept.filter((p) => !profileProblem(p)) : [];
  } catch {
    return [];
  }
}
function keepProfiles(profiles: PrinterProfile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles));
  } catch {
    // Not kept: the generic profiles stay.
  }
}

interface Props {
  profiles: PrinterProfile[];
  profile: PrinterProfile;
  onProfiles: (profiles: PrinterProfile[]) => void;
  onProfile: (profile: PrinterProfile) => void;
  /** The module's whole dots at the profile's resolution, and the person's choice (null: the nearest within the range). */
  module: ModuleChoice | null;
  dots: number | null;
  onDots: (dots: number | null) => void;
  /** The range of the symbol's table, mm, and why the label cannot print on this printer (its width), if so. */
  range: readonly [number, number] | null;
  widthProblem: string | null;
  onTestPrint: () => void;
}

export function PrinterSection({ profiles, profile, onProfiles, onProfile, module, dots, onDots, range, widthProblem, onTestPrint }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrinterProfile | null>(null);
  const all = [...GENERIC_PROFILES, ...profiles];
  const own = profiles.some((p) => p.id === profile.id);
  const problem = editing ? profileProblem(editing) : null;

  function save() {
    if (!editing || problem) return;
    const next = profiles.some((p) => p.id === editing.id) ? profiles.map((p) => (p.id === editing.id ? editing : p)) : [...profiles, editing];
    keepProfiles(next);
    onProfiles(next);
    onProfile(editing);
    setEditing(null);
  }

  return (
    <details className="printer" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{t("Printer (ZPL)")}</summary>
      <p className="hint">{t(PRINTER_TEXTS.intro)}</p>
      <div className="grid">
        <div>
          <label htmlFor="prn-profile">{t("Printer profile")}</label>
          <select
            id="prn-profile"
            value={profile.id}
            onChange={(e) => {
              if (e.target.value === "new") setEditing({ id: `own-${Date.now()}`, name: "", dpi: profile.dpi, widthMm: profile.widthMm });
              else onProfile(all.find((p) => p.id === e.target.value) ?? profile);
            }}
          >
            {all.map((p) => (
              <option key={p.id} value={p.id}>
                {tm(p.name)}
              </option>
            ))}
            <option value="new">{t("New profile…")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="prn-module">{t("Module")}</label>
          <select id="prn-module" value={dots ?? ""} onChange={(e) => onDots(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{module ? t("Nearest within the range: {dots} dots, X {x} mm", { dots: module.chosen.dots, x: formatNumber(module.chosen.xMm, 3) }) : t("Nearest")}</option>
            {(module?.choices ?? []).map((c) => (
              <option key={c.dots} value={c.dots}>
                {c.dots === 1 ? t("1 dot — X {x} mm", { x: formatNumber(c.xMm, 3) }) : t("{dots} dots — X {x} mm", { dots: c.dots, x: formatNumber(c.xMm, 3) })}
              </option>
            ))}
          </select>
        </div>
      </div>
      {editing && (
        <div className="grid profile-edit">
          <div>
            <label htmlFor="prn-name">{t("Name")}</label>
            <input id="prn-name" value={editing.name} placeholder={t("e.g. Warehouse ZT411")} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="prn-dpi">{t("Resolution (dpi)")}</label>
            <input id="prn-dpi" type="number" value={editing.dpi} onChange={(e) => setEditing({ ...editing, dpi: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="prn-width">{t("Print width (mm)")}</label>
            <input id="prn-width" type="number" step="any" value={editing.widthMm} onChange={(e) => setEditing({ ...editing, widthMm: Number(e.target.value) })} />
          </div>
          {problem && <p className="error small">{tm(problem)}</p>}
          <div className="sign-row">
            <button type="button" className="btn primary" disabled={Boolean(problem)} onClick={save}>
              {t("Save profile")}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {module && (
        <p className={module.inRange && !widthProblem ? "hint ok" : "hint error"} aria-live="polite">
          {!module.inRange
            ? PRINTER_TEXTS.outOfRange(module.chosen.dots, module.chosen.xMm, profile.dpi, range)
            : range
              ? t("✓ X {x} mm ({dots} dots at {dpi} dpi) is within the table's {low} to {high} mm.", { x: formatNumber(module.chosen.xMm, 3), dots: module.chosen.dots, dpi: profile.dpi, low: formatNumber(range[0], 3), high: formatNumber(range[1], 3) })
              : t("✓ X {x} mm ({dots} dots at {dpi} dpi).", { x: formatNumber(module.chosen.xMm, 3), dots: module.chosen.dots, dpi: profile.dpi })}
          {widthProblem ? ` ${tm(widthProblem)}` : ""}
        </p>
      )}
      <div className="sign-row">
        {own && !editing && (
          <>
            <button type="button" className="btn" onClick={() => setEditing(profile)}>
              {t("Edit profile")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = profiles.filter((p) => p.id !== profile.id);
                keepProfiles(next);
                onProfiles(next);
                onProfile(GENERIC_PROFILES.find((p) => p.dpi === profile.dpi) ?? GENERIC_PROFILES[1]!);
              }}
            >
              {t("Delete profile")}
            </button>
          </>
        )}
        <button type="button" className="btn primary" disabled={!module || Boolean(widthProblem)} onClick={onTestPrint}>
          {t("Test print (ZPL)")}
        </button>
      </div>
      <p className="hint">{t(PRINTER_TEXTS.testPrint)}</p>
    </details>
  );
}
