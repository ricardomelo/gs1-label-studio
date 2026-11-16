import {
  bytesToHex, check, fault, formatDate, readingFromDecoder, readingFromText, SYNTAX_ENGINE, type CheckContext, type CheckResult, type Finding,
  type Reading, type SyntaxEngine, type Verdict,
} from "@gs1-label-studio/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "./Camera.tsx";
import { decodeImage, mayHaveComposite, picturePixels, readingsOf } from "./camera.ts";
import { SIMPLE_TEXTS } from "./checkTexts.ts";
import { en, locale, t, tm } from "./i18n.ts";
import { routeHash } from "./routes.ts";
import { Picture, SymbolList, type PictureRead } from "./Picture.tsx";
import { Segmented } from "./Segmented.tsx";
import { aiTitle, ENVIRONMENT_NAMES } from "./texts.ts";

// The Check Studio's result (backlog 7.1 f; the check studio's project, section 6; ADR 0007): what a code holds, pasted
// or typed as a scanner in keyboard mode gives it, checked against the GS1 rules by the core's check(). One result, two
// depths: the simple view opens — the verdict with an icon and a word, what the code says, one card per finding with
// what, where, why and how to fix, what was not checked — and the expert view, one press away, shows the reading, the
// bytes, the element strings, the other syntaxes, the findings with their codes and sections, the context and the
// versions. Both are drawn from the same findings, so they cannot disagree. A code comes in three ways (7.1 g): the
// camera, first on a phone (the project's Q3), a picture, or typed and pasted text.

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
/** The ways a code comes in (backlog 7.1 g): the camera, a picture, typed or pasted text. Tags come with 7.1 h. */
type Way = "camera" | "picture" | "type";
const WAYS: readonly { value: Way; icon: string; text: string }[] = [
  { value: "camera", icon: "📷", text: en("Camera") },
  { value: "picture", icon: "🖼", text: en("Picture") },
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

const VERDICTS: Record<Verdict, { icon: string; word: string; line: string }> = {
  follows: { icon: "✓", word: en("Follows the GS1 rules"), line: en("No errors and no warnings.") },
  remarks: { icon: "!", word: en("Works, with remarks"), line: en("No errors, but some things are worth correcting.") },
  "does-not-follow": { icon: "✕", word: en("Does not follow the GS1 rules"), line: en("At least one error: see what is wrong below.") },
  "not-gs1": { icon: "–", word: en("Not a GS1 code"), line: en("Nothing here for a GS1 system to read.") },
  "not-assessed": { icon: "?", word: en("Could not be checked"), line: en("Nothing could be read to check.") },
};
/** What a code listed as not assessed could not say, and what would let it be checked. */
const NOT_CHECKED: Record<string, string> = {
  C8: en("Whether the company prefix is licensed: that needs GS1's table of company prefixes."),
  F1: en("Whether this type of symbol suits where it is scanned: that needs the place, and data that can be read."),
  F3: en("Whether a 2D symbol alone suits a shop till: that needs the place."),
  I1: en("The tag's EPC: that needs the EPC tables."),
  I2: en("The tag's EPC: that needs the EPC tables."),
  H1: en("Sizes and margins: those need a picture with a known scale."),
  J5: en("The distance between symbols: that needs a picture with a known scale."),
};
const SEVERITIES: Record<Finding["severity"], string> = {
  error: en("Error"),
  warning: en("Warning"),
  note: en("Note"),
  "not-assessed": en("Not checked"),
};

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

const DATE_AIS = new Set(["11", "12", "13", "15", "16", "17", "7006"]);

/** An element's value made readable: a date in the user's language, day 00 as the date it stands for. */
function readable(ai: string, value: string, today: Date): string {
  if (DATE_AIS.has(ai) && /^\d{6}$/.test(value)) {
    const month = Number(value.slice(2, 4));
    const day = Number(value.slice(4, 6));
    if (month < 1 || month > 12) return value;
    try {
      const iso = formatDate(value, "YYYY-MM-DD", { today });
      const date = new Date(`${iso}T12:00:00Z`);
      if (Number.isNaN(date.getTime()) || Number(iso.slice(8)) !== (day || Number(iso.slice(8)))) return value;
      return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    } catch {
      return value;
    }
  }
  if (/^3[1-6]\d\d$/.test(ai) && /^\d{6}$/.test(value)) {
    const decimals = Number(ai[3]);
    return (Number(value) / 10 ** decimals).toLocaleString(locale(), { minimumFractionDigits: decimals });
  }
  return value;
}

/** What a finding's details say in plain words, the ones the simple view shows. */
function detailLines(finding: Finding): string[] {
  const d = finding.details ?? {};
  const lines: string[] = [];
  if (d.expected) lines.push(t("The check digit that would be right: {expected}", { expected: d.expected }));
  if (d.reordered) lines.push(t("Read the other way round: {reordered}", { reordered: d.reordered }));
  if (d.required) lines.push(t("Needed with it: {required}", { required: d.required }));
  if (d.allowed) lines.push(t("Symbols allowed here: {allowed}", { allowed: d.allowed }));
  if (d.uri) lines.push(t("The address made right: {uri}", { uri: d.uri }));
  else if (d.canonical) lines.push(t("In GS1's standard form: {canonical}", { canonical: d.canonical }));
  return lines;
}

interface Props {
  engine: SyntaxEngine | null;
  /** What the address carries: the data (d) and the symbol's identifier (s). */
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
  const [place, setPlace] = useState<Place | null>(null);
  const [follow, setFollow] = useState<Follow>("a");
  const [view, setView] = useState<"simple" | "expert">("simple");
  const lang = locale();

  const typed = useMemo(() => {
    const text = data.trim() === "" ? "" : `${symbol}${data}`;
    return text ? readingFromText(text, { source: "paste" }) : null;
  }, [data, symbol]);
  const scanned = way === "camera" ? camReadings : way === "picture" ? (picture?.readings ?? []) : [];
  const reading = way === "type" ? typed : (unreadable ?? scanned[chosen] ?? null);
  useEffect(() => {
    if (way === "camera" && camReadings.length) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [way, camReadings]);
  // Checked once without a place, whose elements say which place an asset's is, then against the place chosen
  const unplaced = useMemo(() => (engine && reading ? check(engine, reading, { environment: null }) : null), [engine, reading]);
  const environment = place === null ? undefined : environmentOf(place, follow, unplaced?.elements.map((e) => e.ai) ?? []);
  const result = useMemo<CheckResult | null>(() => {
    if (!engine || !reading || !unplaced) return null;
    if (!environment) return unplaced;
    const context: CheckContext = { environment };
    return check(engine, reading, context);
  }, [engine, reading, unplaced, environment]);
  // Each symbol of a picture or a frame with its verdict, for the numbered list
  const verdicts = useMemo<Verdict[]>(
    () => (engine ? scanned.map((r) => check(engine, r, { environment: environment ?? null }).verdict) : []),
    [engine, scanned, environment],
  );
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
          onChange={(e) => setData(e.target.value)}
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

  if (!result || !reading) {
    return (
      <main className="check" lang={lang} aria-label={t("Check Studio")}>
        {input}
        {!engine && reading && <p className="hint">{t("Loading…")}</p>}
      </main>
    );
  }

  const verdict = VERDICTS[result.verdict];
  const today = new Date(reading.at);
  const judged = result.findings.filter((f) => f.severity !== "not-assessed");
  const notAssessed = [...result.findings.filter((f) => f.severity === "not-assessed").map((f) => f.code), ...result.notChecked];

  const verdictBox = (
    <div className="verdict" data-verdict={result.verdict} role="status">
      <span className="verdict-icon" aria-hidden="true">{verdict.icon}</span>
      <span>
        <b>{t(verdict.word)}</b>
        <span>{t(verdict.line)}</span>
      </span>
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

  const cards = judged.length > 0 && (
    <section aria-labelledby="check-wrong">
      <h3 id="check-wrong">{t("What is wrong")} ({judged.length})</h3>
      <ol className="findings">
        {judged.map((f, i) => {
          const texts = SIMPLE_TEXTS[f.code];
          return (
            <li key={i} className="finding" data-severity={f.severity} data-code={f.code}>
              <p className="finding-what">
                <span className="severity">{t(SEVERITIES[f.severity])}</span> {texts ? t(texts.what) : f.code}
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
      <section ref={resultRef} className="card check-result" aria-labelledby="check-result-title">
        <h2 id="check-result-title">{t("The result")}</h2>
        <Segmented
          id="check-view"
          label={t("View")}
          value={view}
          options={[{ value: "simple", text: t("Simple") }, { value: "expert", text: t("Expert") }]}
          onChange={setView}
        />
        {view === "simple" ? simple : <Expert result={result} reading={reading} environment={environment} />}
      </section>
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
          <dt>{t("Source")}</dt><dd>{t("Pasted or typed")}</dd>
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
