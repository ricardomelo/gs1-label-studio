import type { CheckResult, Reading, Verdict } from "@gs1-label-studio/core";
import { openDatabase } from "./keep.ts";

// The Check Studio's history (backlog 7.1 j; the check studio's project, section 7.1; ADR 0007 decision 16): every code
// checked is kept on this device, in the application's IndexedDB database (version 2 adds the stores readings and
// sessions; the upgrade keeps the GCP table), with its bytes, so that a reading made under an older release can be
// checked again; no picture is kept. Where the browser keeps nothing (a private window, blocked storage) the history
// lasts for the visit and the screen says so. The parts a test can reach without a browser are the pure functions
// below; the database is tested in the browser (e2e/check-history.spec.ts).

/** The engine and dictionary releases a verdict was given under, kept with it. */
export interface Releases {
  engine: string;
  dictionary: string;
}

export interface HistoryEntry {
  id: number;
  /** The reading as read, bytes and all; null for an item recorded as having no barcode (the project's Q9). */
  reading: Reading | null;
  at: string;
  session: number | null;
  /** The scanning environment it was checked against; null when not given. */
  environment: string | null;
  verdict: Verdict | "no-barcode";
  codes: string[];
  errors: number;
  warnings: number;
  /** The key's AI and value, the first element string's when there is no key. */
  key: { ai: string; value: string } | null;
  /** Every element string's AI and value, for the search and the mark of personal data. */
  ais: string[];
  values: string[];
  releases: Releases;
  note: string;
  /** The item (a group of codes, 7.1 i) it was read with; absent in entries kept before 7.1 k. */
  group?: string | null;
}

export interface HistorySession {
  id: number;
  name: string;
  at: string;
}

/** The most readings kept: past it, the oldest are offered for deletion (section 7.1). */
export const HISTORY_LIMIT = 5000;
/** AIs whose values can identify a person or a dispensed medicine: readings that carry them are marked (section 7.1). */
export const PERSONAL_AIS = new Set(["21", "8017", "8018", "235", "250"]);
const KEY_AIS = ["01", "00", "414", "8017", "8018", "253", "255", "8003", "8004", "401", "402", "417", "8006", "8010", "8013"];

/** What is kept of a reading and its result. */
export function entryOf(reading: Reading | null, result: CheckResult | null, environment: string | null, session: number | null, releases: Releases, group: string | null = null): Omit<HistoryEntry, "id"> {
  const elements = result?.elements ?? [];
  const key = KEY_AIS.map((ai) => elements.find((e) => e.ai === ai)).find(Boolean) ?? elements[0];
  const judged = result?.findings.filter((f) => f.severity !== "not-assessed") ?? [];
  return {
    reading,
    at: reading?.at ?? new Date().toISOString(),
    session,
    environment,
    verdict: reading && result ? result.verdict : "no-barcode",
    codes: [...new Set(judged.map((f) => f.code))],
    errors: judged.filter((f) => f.severity === "error").length,
    warnings: judged.filter((f) => f.severity === "warning").length,
    key: key ? { ai: key.ai, value: key.value } : null,
    ais: elements.map((e) => e.ai),
    values: elements.map((e) => e.value),
    releases,
    note: "",
    group,
  };
}

/** A reading whose values can identify a person or a dispensed medicine (a serial number, a GSRN). */
export function isPersonal(entry: Pick<HistoryEntry, "ais">): boolean {
  return entry.ais.some((ai) => PERSONAL_AIS.has(ai));
}

export interface HistoryFilter {
  verdict?: HistoryEntry["verdict"] | "";
  session?: number | "" | "none";
  /** A fault code ("B3"). */
  code?: string;
  /** Any part of a value, the key or the text read. */
  search?: string;
}

/** The entries a filter keeps, newest first. */
export function filterHistory(entries: readonly HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  const search = filter.search?.trim().toLowerCase() ?? "";
  return entries
    .filter((e) => !filter.verdict || e.verdict === filter.verdict)
    .filter((e) => filter.session === undefined || filter.session === "" || (filter.session === "none" ? e.session === null : e.session === filter.session))
    .filter((e) => !filter.code || e.codes.includes(filter.code))
    .filter((e) => !search || [e.key?.value ?? "", ...e.values, e.reading?.text ?? ""].some((v) => v.toLowerCase().includes(search)))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** The entries past the limit, the oldest: offered for deletion. */
export function overLimit(entries: readonly HistoryEntry[], limit = HISTORY_LIMIT): HistoryEntry[] {
  return entries.length <= limit ? [] : [...entries].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).slice(0, entries.length - limit);
}

/** A stored verdict the current release would change: the reading is checked again under it (section 7.1, re-check). */
export function changedOnRecheck(entry: HistoryEntry, now: Verdict | null, releases: Releases): boolean {
  if (!entry.reading || now === null) return false;
  return now !== entry.verdict && (entry.releases.engine !== releases.engine || entry.releases.dictionary !== releases.dictionary);
}

/** Whether a reading is the same as the last one kept, so that the same code shown again is not kept twice in a row. */
export function sameAsLast(entries: readonly HistoryEntry[], reading: Reading, environment: string | null): boolean {
  const last = [...entries].sort((a, b) => b.id - a.id)[0];
  const r = last?.reading;
  if (!r || last.environment !== environment) return false;
  return r.carrier === reading.carrier && r.symbologyIdentifier === reading.symbologyIdentifier && r.bytes.length === reading.bytes.length && r.bytes.every((b, i) => b === reading.bytes[i]);
}

// The database. Every call answers null or false where the browser keeps nothing; the studio then keeps the visit's
// readings in memory and says so.

const READINGS = "readings";
const SESSIONS = "sessions";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore<T>(name: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(name, mode);
    const result = await request(run(transaction.objectStore(name)));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
}

/** Every entry kept; null when the browser keeps nothing. */
export async function loadHistory(): Promise<{ entries: HistoryEntry[]; sessions: HistorySession[] } | null> {
  try {
    const entries = await withStore(READINGS, "readonly", (s) => s.getAll() as IDBRequest<HistoryEntry[]>);
    const sessions = await withStore(SESSIONS, "readonly", (s) => s.getAll() as IDBRequest<HistorySession[]>);
    return { entries, sessions };
  } catch {
    return null;
  }
}

/** Keeps an entry; its id, or null when the browser keeps nothing. */
export async function addEntry(entry: Omit<HistoryEntry, "id">): Promise<number | null> {
  try {
    return Number(await withStore(READINGS, "readwrite", (s) => s.add(entry)));
  } catch {
    return null;
  }
}

/** Puts entries back as they now are (a code that joined an item gets the item's name). */
export async function putEntries(entries: readonly HistoryEntry[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(READINGS, "readwrite");
      for (const entry of entries) transaction.objectStore(READINGS).put(entry);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteEntries(ids: readonly number[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(READINGS, "readwrite");
      for (const id of ids) transaction.objectStore(READINGS).delete(id);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
    return true;
  } catch {
    return false;
  }
}

/** Deletes every reading and session. */
export async function deleteAll(): Promise<boolean> {
  try {
    await withStore(READINGS, "readwrite", (s) => s.clear());
    await withStore(SESSIONS, "readwrite", (s) => s.clear());
    return true;
  } catch {
    return false;
  }
}

/** Starts a named session; its id, or null when the browser keeps nothing. The browser is asked to keep the data. */
export async function addSession(name: string): Promise<number | null> {
  void navigator.storage?.persist?.().catch(() => false);
  try {
    return Number(await withStore(SESSIONS, "readwrite", (s) => s.add({ name, at: new Date().toISOString() })));
  } catch {
    return null;
  }
}

/** History off, remembered by this browser. */
const OFF = "gs1-label-studio.history-off";
export function historyOff(): boolean {
  try {
    return localStorage.getItem(OFF) === "1";
  } catch {
    return false;
  }
}
export function setHistoryOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF, "1");
    else localStorage.removeItem(OFF);
  } catch {
    // not remembered: it lasts for the visit
  }
}
