import {
  findingsCsv, parseReadingsJson, readingFromParam, readingParam, readingsCsv, readingsJson, reportPdf, surveyCounts, type CheckedRecord, type ReportDocument,
  bytesToHex, check, checkGroup, epcSchemes, fault, formatDate, readingFromDecoder, readingFromText, SYNTAX_ENGINE, type CheckContext, type CheckResult,
  type Finding, type EpcScheme, type GroupKind, type GroupResult, type Reading, type SyntaxEngine, type Verdict,
} from "@gs1-label-studio/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "./Camera.tsx";
import { decodeImage, mayHaveComposite, picturePixels, readingsOf } from "./camera.ts";
import { guessKind, memberName, sameReading, type Member } from "./group.ts";
import { GroupMatrix } from "./GroupMatrix.tsx";
import {
  addEntry, addSession, deleteAll, deleteEntries, entryOf, historyOff, isPersonal, loadHistory, putEntries, sameAsLast, setHistoryOff, type HistoryEntry, type HistorySession,
} from "./history.ts";
import { HistoryList, type ExportKind } from "./HistoryList.tsx";
import { download } from "./download.ts";
import { itemReport, itemShareText, readingName, readingReport, readingShareText, sessionReport, sessionShareText } from "./reports.ts";
import { studioLink, type ShareContent } from "./share.ts";
import { ShareButton } from "./ShareButton.tsx";
import { SIMPLE_TEXTS } from "./checkTexts.ts";
import { B3_KEYBOARD, detailLines, NOT_CHECKED, readable, SEVERITIES, SOURCE_NAMES, VERDICTS } from "./checkWords.ts";
import { en, locale, t, tm } from "./i18n.ts";
import { routeHash } from "./routes.ts";
import { Picture, SymbolList, type PictureRead } from "./Picture.tsx";
import { Segmented } from "./Segmented.tsx";
import { Tag } from "./Tag.tsx";
import { layoutRepairs, WedgeListener } from "./wedge.ts";
import { aiTitle, ENVIRONMENT_NAMES } from "./texts.ts";

// The Check Studio's result (backlog 7.1 f; the check studio's project, section 6; ADR 0007): what a code holds, pasted
// or typed as a scanner in keyboard mode gives it, checked against the GS1 rules by the core's check(). One result, two
// depths: the simple view opens — the verdict with an icon and a word, what the code says, one card per finding with
// what, where, why and how to fix, what was not checked — and the expert view, one press away, shows the reading, the
// bytes, the element strings, the other syntaxes, the findings with their codes and sections, the context and the
// versions. Both are drawn from the same findings, so they cannot disagree. A code comes in three ways (7.1 g): the
// camera, first on a phone (the project's Q3), a picture, or typed and pasted text. Several codes of one item are
// checked together (7.1 i): after any reading the next one joins the group, or every symbol of a picture at once.
// Every code checked is kept in the history on this device (7.1 j), unless History is off.

/** The symbols a pasted text can say it came from (the scanner's identifier, ISO/IEC 15424), the GS1 ones first. */
const SYMBOLS: readonly { id: string; name: string }[] = [
  { id: "", name: en("Not known (the data says)") },
  { id: "]d2", name: "GS1 DataMatrix" },
  { id: "]Q3", name: "GS1 QR Code" },
  { id: "]C1", name: "GS1-128" },
  { id: "]e0", name: "GS1 DataBar" },
  { id: "]E0", name: "EAN-13 / UPC-A" },
  { id: "]E4", name: "EAN-8" },
  { id: "]I1", name: "ITF-14" },
  { id: "]d1", name: en("Data Matrix (not GS1)") },
  { id: "]Q1", name: en("QR Code (not GS1)") },
  { id: "]C0", name: en("Code 128 (not GS1)") },
];

/** The project's worked example (section 6.3): a plain Data Matrix, the brackets encoded, a month 13. */
export const CHECK_EXAMPLE = { symbol: "]d1", data: "(01)09506000134352(17)271300(10)ABC123" };

/**
 * The Check Studio's address for data in the engine's notation ("^0109506000134352^17271231"): a GS1 DataMatrix's
 * reading of it, each later ^ a group separator, written {GS} (backlog 7.1 f: the Identify card's link).
 */
export function checkAddress(dataStr: string): string {
  return routeHash({ studio: "check", params: { s: "]d2", d: dataStr.replace(/^\^/, "").replace(/\^/g, "{GS}") } });
}

/** Where the code is scanned (section 3.6): each choice, the scanning environment it means, and its follow-up. */
export type Place = "shop" | "health" | "case" | "pallet" | "part" | "phone" | "asset" | "unknown";
const PLACES: readonly { value: Place; text: string }[] = [
  { value: "shop", text: en("A product sold in a shop") },
  { value: "health", text: en("A medicine or medical device") },
  { value: "case", text: en("A case or outer box") },
  { value: "pallet", text: en("A pallet or logistic label") },
  { value: "part", text: en("Marked on the part itself") },
  { value: "phone", text: en("For consumers to scan with a phone") },
  { value: "asset", text: en("An asset, document, place or service") },
  { value: "unknown", text: en("I do not know / just check the data") },
];
/** The ways a code comes in: the camera, a picture (7.1 g), an NFC or RFID tag (7.1 h), typed or pasted text. */
type Way = "camera" | "picture" | "tag" | "type";
const WAYS: readonly { value: Way; icon: string; text: string }[] = [
  { value: "camera", icon: "📷", text: en("Camera") },
  { value: "picture", icon: "🖼", text: en("Picture") },
  { value: "tag", icon: "📶", text: en("Tag") },
  { value: "type", icon: "⌨", text: en("Type or paste") },
];
/** On a touch screen the studio opens on the camera (the project's Q3); with a mouse, on the text a scanner types. */
const prefersCamera = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
type Follow = "a" | "b" | "c";
const FOLLOW_UPS: Partial<Record<Place, { label: string; options: { value: Follow; text: string }[] }>> = {
  shop: {
    label: en("Does it also go through a warehouse scanner?"),
    options: [{ value: "a", text: en("No") }, { value: "b", text: en("Yes") }],
  },
  health: {
    label: en("Where is it scanned?"),
    options: [
      { value: "a", text: en("Pharmacy") },
      { value: "b", text: en("Pharmacy and warehouse") },
      { value: "c", text: en("Hospital") },
    ],
  },
};

/** The scanning environment of a place and its follow-up's answer; null for "I do not know". */
export function environmentOf(place: Place, follow: Follow, ais: readonly string[]): string | null {
  switch (place) {
    case "shop": return follow === "b" ? "retail-gd" : "retail";
    case "health": return follow === "b" ? "pharmacy-gd" : follow === "c" ? "healthcare" : "pharmacy";
    case "case": return "distribution";
    case "pallet": return "logistics";
    case "part": return "dpm";
    case "phone": return "retail";
    case "asset": return ais.includes("8017") || ais.includes("8018") ? "gsrn" : "assets";
    case "unknown": return null;
  }
}


/** The byte offsets of each character of a text, and its length in bytes after the last. */
function byteStarts(text: string): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const ch of text) {
    starts.push(at);
    at += new TextEncoder().encode(ch).length;
  }
  starts.push(at);
  return starts;
}

/** A reading's text with the bytes of the ranges marked, control characters drawn (<GS> as ␝). */
function Marked({ reading, ranges }: { reading: Reading; ranges: readonly (readonly [number, number])[] }) {
  const chars = [...reading.text];
  const starts = byteStarts(reading.text);
  const marked = (i: number) => ranges.some(([a, b]) => starts[i]! < b && starts[i + 1]! > a);
  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((ch, i) => {
    const shown = ch === "\u001d" ? "␝" : ch.charCodeAt(0) < 32 ? String.fromCharCode(0x2400 + ch.charCodeAt(0)) : ch;
    const mark = marked(i);
    const last = parts.at(-1);
    if (last && last.mark === mark) last.text += shown;
    else parts.push({ text: shown, mark });
  });
  return (
    <code className="marked">
      {reading.symbologyIdentifier && <span className="sid">{reading.symbologyIdentifier}</span>}
      {parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </code>
  );
}


interface Props {
  engine: SyntaxEngine | null;
  /** What the address carries: the data (d) and the symbol's identifier (s), or a shared reading (r, 7.1 l). */
  params?: Record<string, string>;
  /** Opens the Barcode Studio with this data (a bracketed element string). */
  onMakeRight: (elementString: string) => void;
}

export function CheckStudio({ engine, onMakeRight, params = {} }: Props) {
  const [data, setData] = useState(params.d ?? "");
  const [symbol, setSymbol] = useState(SYMBOLS.some((s) => s.id === params.s) ? params.s! : "");
  // A link opened while the studio is shown (the Identify card's) brings its data
  useEffect(() => {
    if (params.d !== undefined) setData(params.d);
    if (params.s !== undefined && SYMBOLS.some((s) => s.id === params.s)) setSymbol(params.s);
  }, [params.d, params.s]);
  const [way, setWay] = useState<Way>(() => (params.d !== undefined || !prefersCamera() ? "type" : "camera"));
  const [camReadings, setCamReadings] = useState<Reading[]>([]);
  const [picture, setPicture] = useState<PictureRead | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [pictureFailed, setPictureFailed] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [unreadable, setUnreadable] = useState<Reading | null>(null);
  const [tagReading, setTagReading] = useState<Reading | null>(null);
  const [tagMessage, setTagMessage] = useState<Uint8Array | null>(null);
  // A scanner in keyboard mode (7.1 h): a scan is told from typing by its rhythm, and marked as the scanner's
  const [typedSource, setTypedSource] = useState<"wedge" | "paste">("paste");
  const wedge = useRef(new WedgeListener());
  // A classic EPC is read with the EPC schemes (the application's own tables), loaded when a tag is first read
  const [schemes, setSchemes] = useState<Record<string, EpcScheme> | undefined>(undefined);
  useEffect(() => {
    if (way === "tag" && !schemes) epcSchemes().then(setSchemes, (e: unknown) => console.error(e));
  }, [way, schemes]);
  const pictureInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const pictureUrl = useRef<string | null>(null);
  useEffect(() => () => { if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current); }, []);
  useEffect(() => {
    if (params.d !== undefined) setWay("type");
  }, [params.d]);

  const readPicture = async (file: Blob) => {
    setWay("picture");
    setPictureBusy(true);
    setPictureFailed(false);
    setUnreadable(null);
    try {
      const { pixels, url, width, height } = await picturePixels(file);
      const symbols = await decodeImage(pixels, true);
      if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current);
      pictureUrl.current = url;
      setPicture({ url, width, height, readings: readingsOf(symbols, "image", { width, height }) });
      setChosen(0);
    } catch {
      setPictureFailed(true);
    } finally {
      setPictureBusy(false);
    }
  };
  // A picture pasted anywhere in the studio is read; pasted text goes where the cursor is
  const readPictureRef = useRef(readPicture);
  readPictureRef.current = readPicture;
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void readPictureRef.current(file);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, []);
  const choose = (next: Way) => {
    setWay(next);
    setUnreadable(null);
    setChosen(0);
  };
  // The codes of one item (7.1 i): the next reading joins while awaiting; selected shows a member's own result
  const [members, setMembers] = useState<Member[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [chosenKind, setChosenKind] = useState<GroupKind | null>(null);
  const [round, setRound] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [follow, setFollow] = useState<Follow>("a");
  const [view, setView] = useState<"simple" | "expert">("simple");
  const lang = locale();

  const typed = useMemo(() => {
    const text = data.trim() === "" ? "" : `${symbol}${data}`;
    return text ? readingFromText(text, { source: typedSource }) : null;
  }, [data, symbol, typedSource]);
  const repairs = useMemo(() => (data.trim() ? layoutRepairs(data.trim()) : []), [data]);
  const scanned = way === "camera" ? camReadings : way === "picture" ? (picture?.readings ?? []) : [];
  const current = way === "type" ? typed : way === "tag" ? tagReading : (unreadable ?? scanned[chosen] ?? null);
  // A reading opened from the history (7.1 j), shown until another code is read
  const [opened, setOpened] = useState<Reading | null>(null);
  // A shared link (7.1 l): the reading it carries, checked again here, with the place it was checked against
  const [linkPlace, setLinkPlace] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  useEffect(() => {
    if (!params.r) return;
    let live = true;
    readingFromParam(params.r).then(
      ({ reading: linked, environment: env }) => {
        if (!live) return;
        setLinkError(null);
        setOpened(linked);
        setLinkPlace(env);
        setTimeout(() => resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
      },
      (error: unknown) => live && setLinkError(tm(error instanceof Error ? error.message : String(error))),
    );
    return () => {
      live = false;
    };
  }, [params.r]);
  const reading = selected !== null && members[selected] ? members[selected].reading : (opened ?? current);
  // A new reading is shown rather than the member chosen before it; read while awaiting, it joins the group, unless
  // it is text still being typed (it joins on a press) or a code already in the group
  useEffect(() => {
    setSelected(null);
    setOpened(null);
    setLinkPlace(null);
  }, [current]);
  const inGroup = (r: Reading) => members.some((m) => sameReading(m.reading, r));
  const join = (r: Reading) => {
    if (inGroup(r)) return;
    setMembers((list) => [...list, { reading: r, on: true }]);
    setAwaiting(false);
  };
  useEffect(() => {
    if (awaiting && current && current.source !== "paste") join(current);
  }, [awaiting, current]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Starts a group with the code shown, or adds to it: the ways in are cleared for the next code. */
  const addAnother = () => {
    if (members.length === 0 && current) setMembers([{ reading: current, on: true }]);
    setAwaiting(true);
    setSelected(null);
    setCamReadings([]);
    setData("");
    setTypedSource("paste");
    setTagReading(null);
    setTagMessage(null);
    setUnreadable(null);
    setRound((n) => n + 1);
  };
  const closeGroup = () => {
    setMembers([]);
    setAwaiting(false);
    setSelected(null);
    setChosenKind(null);
  };
  // The item a group is, named by when it started: the history keeps it with each code of it (7.1 k)
  const [itemId, setItemId] = useState<string | null>(null);
  useEffect(() => {
    if (members.length && !itemId) setItemId(new Date().toISOString().slice(0, 19).replace("T", " "));
    if (!members.length && itemId) setItemId(null);
  }, [members, itemId]);
  useEffect(() => {
    if (way === "camera" && camReadings.length) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [way, camReadings]);
  // Checked once without a place, whose elements say which place an asset's is, then against the place chosen
  const unplaced = useMemo(() => (engine && reading ? check(engine, reading, { environment: null, epcSchemes: schemes }) : null), [engine, reading, schemes]);
  const environment = linkPlace && opened ? linkPlace : place === null ? undefined : environmentOf(place, follow, unplaced?.elements.map((e) => e.ai) ?? []);
  const result = useMemo<CheckResult | null>(() => {
    if (!engine || !reading || !unplaced) return null;
    if (!environment) return unplaced;
    const context: CheckContext = { environment, epcSchemes: schemes };
    return check(engine, reading, context);
  }, [engine, reading, unplaced, environment, schemes]);
  // Each symbol of a picture or a frame with its verdict, for the numbered list
  const verdicts = useMemo<Verdict[]>(
    () => (engine ? scanned.map((r) => check(engine, r, { environment: environment ?? null }).verdict) : []),
    [engine, scanned, environment],
  );
  // The group: each member checked alone, then the ticked ones together (the project's section 5)
  const memberResults = useMemo<(CheckResult | null)[]>(
    () => members.map((m) => (engine ? check(engine, m.reading, { environment: environment ?? null, epcSchemes: schemes }) : null)),
    [engine, members, environment, schemes],
  );
  // The history (7.1 j): loaded once; each code read is kept, typed text once it has rested for two seconds
  const releases = useMemo(() => ({ engine: SYNTAX_ENGINE.release, dictionary: SYNTAX_ENGINE.dictionary }), []);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [kept, setKept] = useState(true);
  const [off, setOff] = useState(historyOff);
  const [session, setSession] = useState<number | null>(null);
  const memoryId = useRef(-1);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const environmentRef = useRef(environment);
  environmentRef.current = environment;
  useEffect(() => {
    void loadHistory().then((h) => {
      if (!h) return setKept(false);
      setEntries(h.entries);
      setSessions(h.sessions);
    });
  }, []);
  const store = (entry: Omit<HistoryEntry, "id">) => {
    void addEntry(entry).then((id) => {
      if (id === null) setKept(false);
      const full = { ...entry, id: id ?? memoryId.current-- };
      setEntries((list) => [...list, full]);
    });
  };
  // Kept when a code is read, not when History is switched on, a session starts or everything is deleted
  const offRef = useRef(off);
  offRef.current = off;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const itemRef = useRef(itemId);
  itemRef.current = itemId;
  useEffect(() => {
    if (!engine || !current) return;
    const timer = setTimeout(() => {
      const env = environmentRef.current ?? null;
      if (offRef.current || sameAsLast(entriesRef.current, current, env)) return;
      store(entryOf(current, check(engine, current, { environment: env, epcSchemes: schemes }), env, sessionRef.current, releases, itemRef.current));
    }, current.source === "paste" ? 2000 : 0);
    return () => clearTimeout(timer);
  }, [current, engine]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each entry checked again under the current release, the newest 200 (section 7.1, re-check)
  const nowVerdicts = useMemo(() => {
    const map = new Map<number, Verdict>();
    if (!engine) return map;
    for (const e of [...entries].sort((a, b) => b.id - a.id).slice(0, 200)) {
      if (e.reading) map.set(e.id, check(engine, e.reading, { environment: e.environment, epcSchemes: schemes }).verdict);
    }
    return map;
  }, [engine, entries, schemes]);
  // Each code of the item, as the history last kept it, gets the item's name
  useEffect(() => {
    if (!itemId) return;
    const changed: HistoryEntry[] = [];
    for (const m of members) {
      const e = [...entries].reverse().find((x) => x.reading && sameReading(x.reading, m.reading));
      if (e && !e.group) changed.push({ ...e, group: itemId });
    }
    if (!changed.length) return;
    void putEntries(changed.filter((e) => e.id > 0));
    setEntries((list) => list.map((e) => changed.find((c) => c.id === e.id) ?? e));
  }, [itemId, members, entries]);
  // Reports and files (7.1 k): every reading checked again under the current release, as the list's re-check does
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const savePdf = (doc: ReportDocument, name: string) => void reportPdf(doc).then((pdf) => download(name, pdf, "application/pdf"));
  const recordsOf = (list: readonly HistoryEntry[]): CheckedRecord[] =>
    [...list].reverse().map((e) => ({
      reading: e.reading,
      at: e.at,
      session: sessions.find((s) => s.id === e.session)?.name ?? null,
      group: e.group ?? null,
      environment: e.environment,
      note: e.note,
      result: e.reading && engine ? check(engine, e.reading, { environment: e.environment, epcSchemes: schemes }) : null,
    }));
  const exportHistory = (kind: ExportKind, listed: HistoryEntry[], title: string, delimiter: "," | ";") => {
    const records = recordsOf(listed);
    if (kind === "report") savePdf(sessionReport(title, records, surveyCounts(records), releases), "session-report.pdf");
    else if (kind === "readings") download("readings.csv", readingsCsv(records, delimiter), "text/csv;charset=utf-8");
    else if (kind === "findings") download("findings.csv", findingsCsv(records, delimiter), "text/csv;charset=utf-8");
    else download("readings.json", readingsJson(records), "application/json");
    setExportMessage(t("{n} readings exported.", { n: String(records.length) }));
  };
  // Shares (7.1 l): the text, the PDF report as the file, and for one reading a link that checks it again
  const pdfFile = async (doc: ReportDocument, name: string) => new File([await reportPdf(doc)], name, { type: "application/pdf" });
  const shareHistory = async (listed: HistoryEntry[], title: string): Promise<ShareContent> => {
    const records = recordsOf(listed);
    const counts = surveyCounts(records);
    return { title: `${t("Session report")}: ${title}`, text: sessionShareText(title, counts), link: null, file: await pdfFile(sessionReport(title, records, counts, releases), "session-report.pdf") };
  };
  const importReadings = async (file: File) => {
    try {
      const records = parseReadingsJson(await file.text());
      const known = new Map(sessions.map((s) => [s.name, s.id]));
      for (const record of records) {
        let id: number | null = null;
        if (record.session) {
          id = known.get(record.session) ?? null;
          if (id === null) {
            const name = record.session;
            id = (await addSession(name)) ?? memoryId.current--;
            known.set(name, id);
            setSessions((list) => [...list, { id: id!, name, at: record.at }]);
          }
        }
        const result = record.reading && engine ? check(engine, record.reading, { environment: record.environment, epcSchemes: schemes }) : null;
        store({ ...entryOf(record.reading, result, record.environment, id, releases, record.group), at: record.at, note: record.note });
      }
      setExportMessage(t("{n} readings opened from the file.", { n: String(records.length) }));
    } catch (error) {
      setExportMessage(tm(error instanceof Error ? error.message : String(error)));
    }
  };
  const history = (
    <HistoryList
      entries={entries}
      sessions={sessions}
      kept={kept}
      off={off}
      onOff={(value) => {
        setHistoryOff(value);
        setOff(value);
      }}
      session={session}
      onSession={(name) => {
        if (name === null) return setSession(null);
        void addSession(name).then((id) => {
          const s = { id: id ?? memoryId.current--, name, at: new Date().toISOString() };
          setSessions((list) => [...list, s]);
          setSession(s.id);
        });
      }}
      verdictNow={(e) => nowVerdicts.get(e.id) ?? null}
      releases={releases}
      onOpen={(e) => {
        setSelected(null);
        setOpened(e.reading);
        setLinkPlace(null);
        setTimeout(() => resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }}
      onNoBarcode={() => store(entryOf(null, null, environment ?? null, session, releases))}
      onDelete={(ids) => {
        void deleteEntries(ids);
        setEntries((list) => list.filter((e) => !ids.includes(e.id)));
      }}
      onExport={exportHistory}
      onShare={shareHistory}
      onImport={(file) => void importReadings(file)}
      message={exportMessage}
      onDeleteAll={() => {
        void deleteAll();
        setEntries([]);
        setSessions([]);
        setSession(null);
      }}
    />
  );
  const kind = chosenKind ?? guessKind(members.filter((m) => m.on).map((m) => m.reading));
  const membersOn = () => members.flatMap((m, i) => (m.on && memberResults[i] ? [{ reading: m.reading, result: memberResults[i]! }] : []));
  const group = useMemo<GroupResult | null>(() => {
    const on = members.flatMap((m, i) => (m.on && memberResults[i] ? [{ reading: m.reading, result: memberResults[i]! }] : []));
    return on.length >= 2 ? checkGroup(on, kind, { environment: environment ?? null }) : null;
  }, [members, memberResults, kind, environment]);
  /** The user says there is a code the decoder did not read: a reading with nothing in it, which check() calls A9. */
  const notRead = () =>
    setUnreadable(readingFromDecoder({ format: "", symbologyIdentifier: "", bytes: new Uint8Array(0) }, { source: way === "camera" ? "camera" : "image" }));

  const typeIn = (
    <div className="check-type">
      <h3 id="check-type-title">{t("What the code holds")}</h3>
      <label className="field">
        <span>{t("Paste or type it, or scan it with a scanner connected as a keyboard")}</span>
        <textarea
          rows={3}
          value={data}
          spellCheck={false}
          placeholder="]d20109506000134352172712311 0ABC123"
          onChange={(e) => {
            setData(e.target.value);
            setTypedSource("paste");
          }}
          onKeyDown={(e) => {
            const now = performance.now();
            // A scanner sends the group separator as Ctrl+] (ASCII 29), which a field does not type by itself
            if (e.ctrlKey && (e.key === "]" || e.code === "BracketRight")) {
              e.preventDefault();
              const field = e.currentTarget;
              const at = field.selectionStart ?? field.value.length;
              setData(field.value.slice(0, at) + "\u001d" + field.value.slice(field.selectionEnd ?? at));
              wedge.current.key("\u001d", now);
              return;
            }
            if (e.key === "Enter") {
              const burst = wedge.current.end(now);
              if (burst) {
                e.preventDefault();
                setData(burst);
                setTypedSource("wedge");
              }
              return;
            }
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) wedge.current.key(e.key, now);
          }}
        />
      </label>
      <div className="check-row">
        <label className="field">
          <span>{t("The symbol it came from")}</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.name)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSymbol(CHECK_EXAMPLE.symbol);
            setData(CHECK_EXAMPLE.data);
          }}
        >
          {t("Try an example")}
        </button>
      </div>
      {typed?.source === "wedge" && <p className="hint ok" role="status">{t("Read from a scanner in keyboard mode.")}</p>}
      {typed?.identifierAssumed && typedSource === "wedge" && !symbol && (
        <p className="hint scanner-help">
          {t("The scanner sent no symbology identifier, so the data alone says which symbol it was. Choose the symbol below, or switch on the scanner's “AIM ID” (symbology identifier) setting so that it says so itself.")}
        </p>
      )}
      {repairs.map((r) => (
        <p key={r.text} className="hint scanner-help">
          {t("Typed on another keyboard layout? With {layouts}, the scanner meant:", { layouts: r.layouts.map((l) => t(l.name)).join(", ") })}{" "}
          <code className="mono">{r.text}</code>{" "}
          <button type="button" className="link" onClick={() => setData(r.text)}>{t("Use this")}</button>
        </p>
      ))}
      <p className="hint">{t("A separator can be typed as <GS>, {GS} or \\x1D. Nothing leaves this page.")}</p>
    </div>
  );

  const ways = (
    <div className="ways" role="group" aria-label={t("How to read the code")}>
      {WAYS.map((w) => (
        <button key={w.value} type="button" className="btn way" aria-pressed={way === w.value} onClick={() => choose(w.value)}>
          <span aria-hidden="true">{w.icon}</span> {t(w.text)}
        </button>
      ))}
    </div>
  );

  const input = (
    <section className="card check-input" aria-labelledby="check-input-title">
      <h2 id="check-input-title">{t("Read a code")}</h2>
      {way === "camera" && (
        <>
          <Camera
            active={camReadings.length === 0}
            autoStart={false}
            onRead={(readings) => {
              setCamReadings(readings);
              setChosen(0);
              setUnreadable(null);
            }}
            onPicture={() => {
              choose("picture");
              setTimeout(() => pictureInput.current?.click());
            }}
          />
          {camReadings.length > 0 && (
            <div className="check-row">
              <SymbolList readings={camReadings} chosen={chosen} verdicts={verdicts} onChoose={setChosen} />
              <button type="button" className="btn primary" onClick={() => { setCamReadings([]); setChosen(0); setUnreadable(null); }}>
                {t("Scan another")}
              </button>
            </div>
          )}
          {camReadings.length === 0 && (
            <p className="hint">
              {t("A GS1 DotCode and the 2D part of a Composite symbol are not read here.")}{" "}
              <button type="button" className="link" onClick={notRead}>{t("There is a code here that is not read")}</button>
            </p>
          )}
        </>
      )}
      {way === "picture" && (
        <Picture
          picture={picture}
          busy={pictureBusy}
          failed={pictureFailed}
          chosen={chosen}
          verdicts={verdicts}
          inputRef={pictureInput}
          onFile={(file) => void readPicture(file)}
          onChoose={(i) => { setChosen(i); setUnreadable(null); }}
          onUnreadable={notRead}
        />
      )}
      {(way === "camera" || way === "picture") && scanned.length >= 2 && members.length === 0 && (
        <div className="check-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMembers(scanned.map((r) => ({ reading: r, on: true })));
              setAwaiting(false);
            }}
          >
            {t("Check all {n} as one item", { n: String(scanned.length) })}
          </button>
        </div>
      )}
      {way === "tag" && <Tag key={round} onRead={setTagReading} message={tagMessage} onMessage={setTagMessage} />}
      {way === "type" && typeIn}
      {ways}
      <div className="check-place" role="group" aria-labelledby="check-place-title">
        <h3 id="check-place-title">{t("Where is it scanned?")}</h3>
        <div className="chips">
          {PLACES.map((p) => (
            <button key={p.value} type="button" className="chip" aria-pressed={place === p.value} onClick={() => { setPlace(p.value); setFollow("a"); }}>
              {t(p.text)}
            </button>
          ))}
        </div>
        {place && FOLLOW_UPS[place] && (
          <Segmented
            id="check-follow"
            label={t(FOLLOW_UPS[place]!.label)}
            value={follow}
            options={FOLLOW_UPS[place]!.options.map((o) => ({ value: o.value, text: t(o.text) }))}
            onChange={setFollow}
          />
        )}
        {environment && <p className="hint">{t("Checked against: {table}", { table: t(ENVIRONMENT_NAMES[environment] ?? environment) })}</p>}
      </div>
    </section>
  );

  const verdictOf = (v: Verdict) => {
    const box = VERDICTS[v];
    return (
      <div className="verdict" data-verdict={v} role="status">
        <span className="verdict-icon" aria-hidden="true">{box.icon}</span>
        <span>
          <b>{t(box.word)}</b>
          <span>{t(box.line)}</span>
        </span>
      </div>
    );
  };
  const groupCard = members.length > 0 && (
    <GroupMatrix
      members={members}
      results={memberResults}
      group={group}
      kind={kind}
      onKind={setChosenKind}
      selected={selected}
      onSelect={(i) => {
        setSelected(i);
        setTimeout(() => resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }}
      onToggle={(i) => setMembers((list) => list.map((m, k) => (k === i ? { ...m, on: !m.on } : m)))}
      onRemove={(i) => {
        setMembers((list) => list.filter((_, k) => k !== i));
        setSelected(null);
      }}
      awaiting={awaiting}
      onAdd={addAnother}
      onClose={closeGroup}
      onReport={() => {
        if (!group) return;
        savePdf(itemReport(membersOn(), group, kind, releases), "item-report.pdf");
      }}
      share={group && (
        <ShareButton
          personal={membersOn().some((m) => isPersonal({ ais: m.result.elements.map((e) => e.ai) }))}
          prepare={async () => ({
            title: t("Item report"),
            text: itemShareText(membersOn(), group, kind),
            link: null,
            file: await pdfFile(itemReport(membersOn(), group, kind, releases), "item-report.pdf"),
          })}
        />
      )}
      verdictBox={verdictOf}
    />
  );

  if (!result || !reading) {
    return (
      <main className="check" lang={lang} aria-label={t("Check Studio")}>
        {input}
        {linkError && <p className="error" role="alert">{linkError}</p>}
        {groupCard}
        {!engine && reading && <p className="hint">{t("Loading…")}</p>}
        {history}
      </main>
    );
  }

  const today = new Date(reading.at);
  const judged = result.findings.filter((f) => f.severity !== "not-assessed");
  const notAssessed = [...result.findings.filter((f) => f.severity === "not-assessed").map((f) => f.code), ...result.notChecked];

  const verdictBox = verdictOf(result.verdict);
  // The code shown: a member of the group, a code read to join it, or a code alone
  const memberShown = selected !== null && members[selected] ? selected : members.findIndex((m) => sameReading(m.reading, reading));
  const groupLine =
    opened && reading === opened && selected === null ? (
      <p className="hint">{t("A reading from the history, read on {date}, checked again now.", { date: new Date(opened.at).toLocaleString(lang) })}</p>
    ) : memberShown >= 0 ? (
      <p className="hint">{t("The result of one code of this item: {name}.", { name: memberName(reading, undefined) })}</p>
    ) : members.length > 0 ? (
      <div className="check-row">
        <button type="button" className="btn primary" onClick={() => join(reading)}>{t("Add this code to the item")}</button>
      </div>
    ) : (
      <div className="check-row">
        <button type="button" className="btn" onClick={addAnother}>{t("Add another code from this item")}</button>
        <span className="hint">{t("A pack's 2D symbol and its barcode, or a barcode and its RFID or NFC tag, are compared.")}</span>
      </div>
    );

  const says = result.elements.length > 0 && (
    <section aria-labelledby="check-says">
      <h3 id="check-says">{t("What the code says")}</h3>
      <dl className="says">
        {result.elements.map((e) => (
          <div key={`${e.ai}-${e.range[0]}`}>
            <dt>{aiTitle(e.ai, e.title)} <small className="mono">({e.ai})</small></dt>
            <dd className="mono">{readable(e.ai, e.value, today)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  // Text from a keyboard (a scanner's or pasted) may have lost its separators on the way (the project's section 3.5)
  const keyboard = reading.source === "wedge" || reading.source === "paste";
  const cards = judged.length > 0 && (
    <section aria-labelledby="check-wrong">
      <h3 id="check-wrong">{t("What is wrong")} ({judged.length})</h3>
      <ol className="findings">
        {judged.map((f, i) => {
          const texts = SIMPLE_TEXTS[f.code];
          return (
            <li key={i} className="finding" data-severity={f.severity} data-code={f.code}>
              <p className="finding-what">
                <span className="severity">{t(SEVERITIES[f.severity])}</span> {f.code === "B3" && keyboard ? t(B3_KEYBOARD.what) : texts ? t(texts.what) : f.code}
              </p>
              <p className="finding-where">
                <b>{t("Where:")}</b>{" "}
                {f.ranges.length ? <Marked reading={reading} ranges={f.ranges} /> : t("the symbol as a whole")}
                {f.ai && <> · {aiTitle(f.ai, result.elements.find((e) => e.ai === f.ai)?.title ?? "")} ({f.ai})</>}
              </p>
              {texts && (
                <>
                  <p><b>{t("Why it matters:")}</b> {t(texts.why)}</p>
                  <p><b>{t("How to fix:")}</b> {t(texts.fix)}</p>
                  {f.code === "B3" && keyboard && <p className="scanner-help">{t(B3_KEYBOARD.scanner)}</p>}
                </>
              )}
              {detailLines(f).map((line) => (
                <p key={line} className="mono small">{line}</p>
              ))}
              {f.fixedData && (
                <button type="button" className="btn primary" onClick={() => onMakeRight(f.fixedData!)}>
                  {t("Make it right")}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );

  const unchecked = (notAssessed.length > 0 || mayHaveComposite(reading)) && (
    <section aria-labelledby="check-unchecked">
      <h3 id="check-unchecked">{t("What was not checked")}</h3>
      <ul className="unchecked">
        {[...new Set(notAssessed)].map((code) => (
          <li key={code}>{NOT_CHECKED[code] ? t(NOT_CHECKED[code]!) : SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code}</li>
        ))}
        {mayHaveComposite(reading) && <li>{t("A 2D part printed with this barcode (a Composite Component): no decoder here reads it.")}</li>}
        <li>{t("Print quality: a phone or a page cannot grade it; that needs a barcode verifier.")}</li>
      </ul>
    </section>
  );

  const simple = (
    <div className="check-simple">
      {verdictBox}
      {says}
      {cards}
      {unchecked}
    </div>
  );

  return (
    <main className="check" lang={lang} aria-label={t("Check Studio")}>
      {input}
      {linkError && <p className="error" role="alert">{linkError}</p>}
      {groupCard}
      <section ref={resultRef} className="card check-result" aria-labelledby="check-result-title">
        <h2 id="check-result-title">{t("The result")}</h2>
        <Segmented
          id="check-view"
          label={t("View")}
          value={view}
          options={[{ value: "simple", text: t("Simple") }, { value: "expert", text: t("Expert") }]}
          onChange={setView}
        />
        {groupLine}
        {view === "simple" ? simple : <Expert result={result} reading={reading} environment={environment} />}
        <div className="check-row check-report">
          <button type="button" className="btn" onClick={() => savePdf(readingReport(reading, result, environment ?? null, releases), "check-report.pdf")}>
            {t("Report (PDF)")}
          </button>
          <ShareButton
            personal={isPersonal({ ais: result.elements.map((e) => e.ai) })}
            prepare={async () => {
              const link = studioLink("check", "r", await readingParam(reading, environment ?? null));
              return {
                title: `${t("Check report")}: ${readingName(reading)}`,
                text: readingShareText(reading, result),
                link,
                linkTooLong: !link,
                file: await pdfFile(readingReport(reading, result, environment ?? null, releases), "check-report.pdf"),
              };
            }}
          />
          <span className="hint">{t("The simple view and the expert details, to print or send.")}</span>
        </div>
      </section>
      {history}
    </main>
  );
}

/** Copies a text, saying so on the button for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? t("Copied") : label}
    </button>
  );
}

/** The bytes, 16 to a line, in hexadecimal and as text side by side, the findings' bytes highlighted. */
function ByteStrip({ reading, ranges }: { reading: Reading; ranges: readonly (readonly [number, number])[] }) {
  const lines: number[] = [];
  for (let i = 0; i < reading.bytes.length; i += 16) lines.push(i);
  const hit = (i: number) => ranges.some(([a, b]) => i >= a && i < b);
  const shown = (byte: number) => (byte === 29 ? "␝" : byte < 32 ? String.fromCharCode(0x2400 + byte) : byte < 127 ? String.fromCharCode(byte) : "·");
  return (
    <div className="bytes mono" role="table" aria-label={t("The bytes")}>
      {lines.map((start) => {
        const slice = [...reading.bytes.slice(start, start + 16)];
        return (
          <div key={start} role="row" className="bytes-line">
            <span className="bytes-at">{start.toString(16).padStart(4, "0")}</span>
            <span className="bytes-hex">
              {slice.map((b, k) => (
                <span key={k} className={hit(start + k) ? "hit" : undefined}>{b.toString(16).padStart(2, "0")}</span>
              ))}
            </span>
            <span className="bytes-text">
              {slice.map((b, k) => (
                <span key={k} className={hit(start + k) ? "hit" : undefined}>{shown(b)}</span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The meaning of the symbology identifiers a paste can carry (General Specifications 5.1.3, table 5-2). */
const IDENTIFIER_MEANING: Record<string, string> = Object.fromEntries(SYMBOLS.filter((s) => s.id).map((s) => [s.id, s.name]));

function Expert({ result, reading, environment }: { result: CheckResult; reading: Reading; environment: string | null | undefined }) {
  const all = result.findings.flatMap((f) => f.ranges);
  const withBraces = reading.text.replace(/\u001d/g, "{GS}");
  const escaped = [...reading.bytes].map((b) => (b >= 32 && b < 127 && b !== 92 && b !== 34 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`)).join("");
  return (
    <div className="expert">
      <section aria-labelledby="ex-reading">
        <h3 id="ex-reading">{t("Reading")}</h3>
        <dl className="pairs">
          <dt>{t("Source")}</dt><dd>{t(SOURCE_NAMES[reading.source])}{reading.format ? ` (${reading.format})` : ""}</dd>
          <dt>{t("Time (UTC)")}</dt><dd className="mono">{reading.at}</dd>
          <dt>{t("Symbology identifier")}</dt>
          <dd className="mono">
            {reading.symbologyIdentifier
              ? `${reading.symbologyIdentifier} · ${t(IDENTIFIER_MEANING[reading.symbologyIdentifier] ?? "")}`
              : t("none given (assumed from the data)")}
          </dd>
          <dt>{t("Repairs tried and kept")}</dt><dd className="mono">{result.repairs.join(", ") || "—"}</dd>
        </dl>
      </section>
      <section aria-labelledby="ex-bytes">
        <h3 id="ex-bytes">{t("Raw data")}</h3>
        <ByteStrip reading={reading} ranges={all} />
        <div className="actions">
          <CopyButton text={bytesToHex(reading.bytes)} label={t("Copy as hex")} />
          <CopyButton text={withBraces} label={t("Copy as text with {GS}")} />
          <CopyButton text={escaped} label={t("Copy as an escaped string")} />
        </div>
      </section>
      {result.elements.length > 0 && (
        <section aria-labelledby="ex-elements">
          <h3 id="ex-elements">{t("Element strings")}</h3>
          <table className="ex-table">
            <thead><tr><th>AI</th><th>{t("Data title")}</th><th>{t("Value")}</th><th>{t("Separator")}</th></tr></thead>
            <tbody>
              {result.elements.map((e) => (
                <tr key={`${e.ai}-${e.range[0]}`}>
                  <td className="mono">({e.ai})</td><td>{e.title}</td><td className="mono">{e.value}</td><td>{e.separator ? "␝" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {result.forms && (
        <section aria-labelledby="ex-forms">
          <h3 id="ex-forms">{t("Other syntaxes")}</h3>
          <dl className="pairs mono">
            <dt>{t("Element string")}</dt><dd>{result.forms.elementString}</dd>
            <dt>{t("Unbracketed, with ^")}</dt><dd>{result.forms.dataStr}</dd>
            <dt>GS1 Digital Link</dt><dd>{result.forms.digitalLinkUri}</dd>
          </dl>
        </section>
      )}
      <section aria-labelledby="ex-findings">
        <h3 id="ex-findings">{t("Findings")}</h3>
        {result.findings.length === 0 ? <p>—</p> : (
          <ol className="ex-findings">
            {result.findings.map((f, i) => {
              const entry = fault(f.code);
              return (
                <li key={i} data-code={f.code}>
                  <p><b className="mono">{f.code}</b> · {t(SEVERITIES[f.severity])} · <span lang="en">{entry.texts.what}</span></p>
                  <p className="small" lang="en">{entry.texts.why}</p>
                  <p className="small">{t("General Specifications")}: {f.sections.join(", ") || "—"}{f.ranges.length ? ` · ${t("bytes")} ${f.ranges.map(([a, b]) => `${a}–${b - 1}`).join(", ")}` : ""}</p>
                  {f.engineMessage && (
                    <p className="small">
                      <span lang="en" className="mono">{f.engineMessage}</span>
                      {tm(f.engineMessage) !== f.engineMessage && <><br />{tm(f.engineMessage)}</>}
                    </p>
                  )}
                  {f.details && <p className="small mono">{Object.entries(f.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
                  {f.fixedData && <p className="small mono">{t("Made right")}: {f.fixedData}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section aria-labelledby="ex-context">
        <h3 id="ex-context">{t("Context")}</h3>
        <p>{environment ? t(ENVIRONMENT_NAMES[environment] ?? environment) : t("Not given")}</p>
      </section>
      <section aria-labelledby="ex-versions">
        <h3 id="ex-versions">{t("Versions")}</h3>
        <dl className="pairs mono">
          <dt>GS1 Barcode Syntax Engine</dt><dd>{SYNTAX_ENGINE.release}</dd>
          <dt>{t("Syntax Dictionary")}</dt><dd>{SYNTAX_ENGINE.dictionary}</dd>
          <dt>{t("General Specifications")}</dt><dd>26.0</dd>
          <dt>GS1 Label Studio</dt><dd>{__BUILD__.commit || "—"}</dd>
        </dl>
      </section>
      <p><a href={routeHash({ studio: "start" })}>{t("All studios")}</a></p>
    </div>
  );
}
