import type { Reading, Verdict } from "@gs1-label-studio/core";
import { useRef, useState } from "react";
import { changedOnRecheck, filterHistory, HISTORY_LIMIT, isPersonal, overLimit, type HistoryEntry, type HistoryFilter, type HistorySession, type Releases } from "./history.ts";
import { en, locale, t } from "./i18n.ts";
import { symbolName, VERDICT_ICONS, VERDICT_WORDS } from "./Picture.tsx";
import { allowPersonal, personalAsked, type ShareContent } from "./share.ts";
import { ShareButton } from "./ShareButton.tsx";

// The Check Studio's history on screen (backlog 7.1 j; the check studio's project, section 7.1; ADR 0007 decision 16):
// the codes checked on this device, newest first, filtered by verdict, session or fault and searched by any value;
// sessions named before a run of readings; a reading opened shows its result again, checked under the current release,
// and is marked when that changes its verdict; History off and Delete all; an item with no barcode recorded for a
// survey's count (the project's Q9).

/** How many entries are listed before Show more. */
const PAGE = 50;

const KIND_NAMES: Record<string, string> = { rfid: en("RFID tag"), nfc: en("NFC tag") };
const NO_BARCODE = en("No barcode");

/** An entry's name in the list: the symbol, the kind of tag, or no barcode. */
function nameOf(reading: Reading | null): string {
  if (!reading) return t(NO_BARCODE);
  return KIND_NAMES[reading.carrier] ? t(KIND_NAMES[reading.carrier]!) : symbolName(reading);
}

interface Props {
  entries: readonly HistoryEntry[];
  sessions: readonly HistorySession[];
  /** False when the browser keeps nothing: the history lasts for the visit. */
  kept: boolean;
  off: boolean;
  onOff: (off: boolean) => void;
  session: number | null;
  onSession: (name: string | null) => void;
  /** Each listed entry's verdict under the current release, by id; null where it cannot be checked again. */
  verdictNow: (entry: HistoryEntry) => Verdict | null;
  releases: Releases;
  onOpen: (entry: HistoryEntry) => void;
  onNoBarcode: () => void;
  onDelete: (ids: number[]) => void;
  onDeleteAll: () => void;
  /** A report or a file of the entries listed (7.1 k); `title` names the session, or says the list is filtered. */
  onExport: (kind: ExportKind, listed: HistoryEntry[], title: string, delimiter: "," | ";") => void;
  /** A readings file chosen to open: its readings join the history. */
  onImport: (file: File) => void;
  /** What a share of the listed readings sends (7.1 l): the counts and the worst findings, the report and the CSV. */
  onShare: (listed: HistoryEntry[], title: string) => Promise<ShareContent>;
  /** What the last export or import said: done, or why not. */
  message: string | null;
}

/** What the history exports (section 7.2 and 7.3). */
export type ExportKind = "report" | "readings" | "findings" | "json";

const EXPORTS: readonly { kind: ExportKind; text: string }[] = [
  { kind: "report", text: en("Session report (PDF)") },
  { kind: "readings", text: en("Readings (CSV)") },
  { kind: "findings", text: en("Findings (CSV)") },
  { kind: "json", text: en("All the data (JSON)") },
];

export function HistoryList({ entries, sessions, kept, off, onOff, session, onSession, verdictNow, releases, onOpen, onNoBarcode, onDelete, onDeleteAll, onExport, onImport, onShare, message }: Props) {
  const [filter, setFilter] = useState<HistoryFilter>({ verdict: "", session: "", search: "" });
  const [shown, setShown] = useState(PAGE);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [semicolon, setSemicolon] = useState(false);
  // A share or an export that includes personal data asks once (section 7.1, privacy): the export waiting for the answer
  const [asking, setAsking] = useState<ExportKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listed = filterHistory(entries, filter);
  const old = overLimit(entries);
  const current = sessions.find((s) => s.id === session);
  const time = new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short" });
  const filtered = Boolean(filter.verdict || filter.search?.trim() || filter.code);
  const chosen = typeof filter.session === "number" ? sessions.find((s) => s.id === filter.session)?.name : undefined;
  const title = chosen ?? (filter.session === "none" ? t("Readings outside a session") : t("All readings"));
  const run = (kind: ExportKind, confirmed = personalAsked()) => {
    if (!confirmed && listed.some(isPersonal)) return setAsking(kind);
    setAsking(null);
    onExport(kind, listed, filtered ? `${title} (${t("filtered")})` : title, semicolon ? ";" : ",");
  };

  return (
    <section className="card check-history" aria-labelledby="check-history-title">
      <h2 id="check-history-title">{t("History")} ({entries.length})</h2>
      <p className="hint" role={kept ? undefined : "status"}>
        {off
          ? t("History is off: the codes you check are not kept.")
          : kept
            ? t("The codes you check are kept on this device only, without pictures.")
            : t("This browser keeps nothing here (a private window, or storage blocked): the history lasts only for this visit.")}
      </p>
      <div className="check-row history-session">
        {current ? (
          <>
            <span>{t("Session: {name}", { name: current.name })}</span>
            <button type="button" className="btn" onClick={() => onSession(null)}>{t("End the session")}</button>
          </>
        ) : (
          <form
            className="check-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onSession(name.trim());
              setName("");
            }}
          >
            <label className="field">
              <span>{t("Name a session for the next readings (a ward, a supplier, a day)")}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={!name.trim()}>{t("Start a session")}</button>
          </form>
        )}
        <button type="button" className="btn" onClick={onNoBarcode} disabled={off}>{t("This item has no barcode")}</button>
      </div>
      <div className="check-row history-filters">
        <label className="field">
          <span>{t("Search a GTIN or any value")}</span>
          <input type="search" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
        </label>
        <label className="field">
          <span>{t("Verdict")}</span>
          <select value={filter.verdict} onChange={(e) => setFilter({ ...filter, verdict: e.target.value as HistoryFilter["verdict"] })}>
            <option value="">{t("All")}</option>
            {(Object.keys(VERDICT_WORDS) as Verdict[]).map((v) => (
              <option key={v} value={v}>{t(VERDICT_WORDS[v])}</option>
            ))}
            <option value="no-barcode">{t(NO_BARCODE)}</option>
          </select>
        </label>
        {sessions.length > 0 && (
          <label className="field">
            <span>{t("Session")}</span>
            <select
              value={String(filter.session ?? "")}
              onChange={(e) => setFilter({ ...filter, session: e.target.value === "" || e.target.value === "none" ? e.target.value : Number(e.target.value) })}
            >
              <option value="">{t("All")}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="none">{t("No session")}</option>
            </select>
          </label>
        )}
      </div>
      <div className="history-export" role="group" aria-label={t("Export what is listed")}>
        <p className="hint">{t("Export what is listed ({n} readings): the report counts what the filters show.", { n: String(listed.length) })}</p>
        <div className="check-row">
          {EXPORTS.map((e) => (
            <button key={e.kind} type="button" className="btn" disabled={!listed.length} onClick={() => run(e.kind)}>{t(e.text)}</button>
          ))}
          <ShareButton
            disabled={!listed.length}
            personal={listed.some(isPersonal)}
            prepare={() => onShare(listed, filtered ? `${title} (${t("filtered")})` : title)}
          />
          <label className="history-off">
            <input type="checkbox" checked={semicolon} onChange={(e) => setSemicolon(e.target.checked)} /> {t("CSV with semicolons")}
          </label>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{t("Open a readings file")}</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label={t("Open a readings file")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = "";
            }}
          />
        </div>
        {asking && (
          <p className="check-row" role="alert">
            <span>{t("Some of these readings carry a serial number or a person's number. Export them all the same?")}</span>
            <button type="button" className="btn primary" onClick={() => { allowPersonal(); run(asking, true); }}>{t("Yes, export")}</button>
            <button type="button" className="btn" onClick={() => setAsking(null)}>{t("Cancel")}</button>
          </p>
        )}
        {message && <p className="hint" role="status">{message}</p>}
      </div>
      {old.length > 0 && (
        <p className="hint" role="status">
          {t("More than {limit} readings are kept: the oldest {n} can be deleted.", { limit: HISTORY_LIMIT.toLocaleString(locale()), n: String(old.length) })}{" "}
          <button type="button" className="link" onClick={() => onDelete(old.map((e) => e.id))}>{t("Delete the oldest")}</button>
        </p>
      )}
      {entries.length > 0 && listed.length === 0 && <p className="hint">{t("No reading matches.")}</p>}
      <ol className="history-list" aria-label={t("The readings kept")}>
        {listed.slice(0, shown).map((entry) => {
          const now = verdictNow(entry);
          const changed = changedOnRecheck(entry, now, releases);
          const verdict = entry.verdict === "no-barcode" ? null : entry.verdict;
          return (
            <li key={entry.id} data-verdict={entry.verdict} data-changed={changed || undefined}>
              <button type="button" className="history-item" onClick={() => onOpen(entry)} disabled={!entry.reading}>
                <span className="history-when">{time.format(new Date(entry.at))}</span>
                <span className="history-what">
                  <b>{nameOf(entry.reading)}</b>
                  {entry.key && <span className="mono"> ({entry.key.ai}) {entry.key.value}</span>}
                </span>
                {verdict && (
                  <span className="group-verdict" data-verdict={verdict}>
                    {VERDICT_ICONS[verdict]} {t(VERDICT_WORDS[verdict])}
                    {entry.codes.length > 0 && <span className="mono"> · {entry.codes.join(" ")}</span>}
                  </span>
                )}
                {isPersonal(entry) && <span className="history-mark">{t("Carries a serial number or a person's number")}</span>}
                {changed && now && (
                  <span className="history-mark changed">{t("Checked again under the current release: {verdict}", { verdict: t(VERDICT_WORDS[now]) })}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {listed.length > shown && (
        <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>{t("Show more")}</button>
      )}
      <div className="check-row">
        <label className="history-off">
          <input type="checkbox" checked={off} onChange={(e) => onOff(e.target.checked)} /> {t("History off")}
        </label>
        {entries.length > 0 &&
          (confirming ? (
            <>
              <span>{t("Delete all {n} readings and the sessions?", { n: String(entries.length) })}</span>
              <button type="button" className="btn danger" onClick={() => { onDeleteAll(); setConfirming(false); }}>{t("Yes, delete all")}</button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>{t("Delete all")}</button>
          ))}
      </div>
    </section>
  );
}
