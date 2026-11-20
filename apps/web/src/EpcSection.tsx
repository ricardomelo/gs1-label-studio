import { useEffect, useMemo, useState } from "react";
import {
  EPC_CHOICES,
  type EpcForm,
  epcOf,
  epcSchemes,
  GcpError,
  KEY_SCHEMES,
  PARTITION_LENGTHS,
  parseGcpTable,
  PLUS_KEYS,
  type EpcChoices,
  type EpcInput,
  type EpcOutcome,
  type EpcResult,
  type EpcScheme,
  type GcpTable,
} from "@gs1-label-studio/core";
import { fileText, keep } from "./keep.ts";
import { NfcWriter } from "./NfcWriter.tsx";
import { Segmented } from "./Segmented.tsx";
import { en, formatNumber, inEnglish, locale, t, tm, t as say, tm as sayMessage } from "./i18n.ts";

// RFID and NFC (EPC), as the resolver's label panel had it (ADR 0004; item 1.8): the key's EPC as the EPC Tag Data
// Standard encodes it, and the compressed GS1 Digital Link an NFC tag emits. The company prefix's length: the person's
// choice, or GS1's GCP length table, which the person loads once and this browser keeps. The schemes new to TDS 2.x,
// EPC+ and EPC++ (backlog 6.7, mock-up A of two: buttons at the top of the card, B a list beside the filter), need no
// prefix length; EPC++ carries the GS1 Digital Link URI's hostname, a DSGTIN a date of the data before its GTIN.

/** The dates a DSGTIN can put first, by their AI (TDS 14.5.3). */
const DATE_NAMES: Record<string, string> = {
  "11": en("Production date (11)"), "13": en("Packaging date (13)"), "15": en("Best before date (15)"),
  "16": en("Sell by date (16)"), "17": en("Expiration date (17)"), "7006": en("First freeze date (7006)"),
  "7007": en("Harvest date (7007)"),
};

const FILTERS = [
  en("All others"),
  en("Point of sale (POS) trade item"),
  en("Full case for transport"),
  en("Reserved"),
  en("Inner pack"),
  en("Reserved"),
  en("Unit load"),
  en("Unit inside a trade item, not sold on its own"),
];

function Copyable({ text }: { text: string }) {
  return (
    <code>
      {text}{" "}
      <button type="button" className="link" onClick={() => void navigator.clipboard?.writeText(text)}>
        {t("Copy")}
      </button>
    </code>
  );
}

export { EPC_CHOICES, type EpcChoices, type EpcInput, type EpcResult };

/** The EPC of the data with the person's choices: the schemes loaded once, then every form computed as data change. */
export function useEpc(input: EpcInput, load = true) {
  const [schemes, setSchemes] = useState<Record<string, EpcScheme> | null>(null);
  useEffect(() => {
    if (load && !schemes) epcSchemes().then(setSchemes, (e: unknown) => console.error(e));
  }, [load, schemes]);
  const { id, stem, gcp, elements = [], choices } = input;
  const epc = useMemo(
    () => epcFor(input, schemes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schemes, id.key, id.value, JSON.stringify(id.qualifiers), JSON.stringify(id.attributes), stem, gcp, JSON.stringify(elements), JSON.stringify(choices), locale()],
  );
  return { ...epc, schemes };
}

/**
 * The EPC of one identification with the choices, the core's `epcOf` (`useEpc` for the data shown, and each row of the
 * RFID Studio in bulk): its messages in the page's language, or in English with `english` (the files).
 */
export function epcFor(input: EpcInput, schemes: Record<string, EpcScheme> | null, english = false): EpcOutcome {
  const tm = english ? (message: string) => message : sayMessage;
  if (!schemes) {
    const outcome = epcOf(input, {});
    const loading = english ? inEnglish("Loading the EPC schemes…") : t("Loading the EPC schemes…");
    return { ...outcome, result: { message: input.id.key in KEY_SCHEMES ? loading : tm(outcome.result.message ?? "") } };
  }
  const outcome = epcOf(input, schemes);
  const { result } = outcome;
  return {
    ...outcome,
    result: {
      ...result,
      ...(result.message ? { message: tm(result.message) } : {}),
      ...(result.source ? { source: tm(result.source) } : {}),
      ...(result.left ? { left: result.left.map(tm) } : {}),
    },
  };
}

type Change = (next: Partial<EpcChoices>) => void;

/** The choices of the encoding: the scheme, the company prefix and GS1's list, a DSGTIN's date, the filter, +AIDC data. */
export function EpcControls({ choices, onChange, epc, gcp, onGcp, idPrefix = "epc" }: {
  choices: EpcChoices;
  onChange: Change;
  epc: ReturnType<typeof useEpc>;
  gcp: GcpTable | null;
  onGcp: (table: GcpTable | null) => void;
  idPrefix?: string;
}) {
  const [gcpMessage, setGcpMessage] = useState<string | null>(null);
  const { form, prefix: prefixChoice, withData } = choices;
  // The editor's card keeps the field's id from before the RFID Studio (its tests and links name it)
  const gcpId = idPrefix === "epc" ? "gcp-file" : `${idPrefix}-gcp-file`;
  const { result, filter, hostname, dates, date } = epc;
  async function load(file: File | undefined) {
    if (!file) return;
    setGcpMessage(t("Checking the list…"));
    try {
      const table = parseGcpTable(await fileText(file));
      const saved = await keep("gcp", table.compact());
      onGcp(table);
      setGcpMessage(saved
        ? t("GS1's list of {date} loaded: {n} prefixes, kept in this browser.", { date: table.date.slice(0, 10), n: formatNumber(table.size) })
        : t("GS1's list of {date} loaded: {n} prefixes (this browser cannot keep it: load it again next time).", { date: table.date.slice(0, 10), n: formatNumber(table.size) }));
    } catch (error) {
      setGcpMessage(tm(error instanceof GcpError ? error.message : String(error)));
    }
  }


  return (
    <>
      <Segmented<EpcForm>
        id={`${idPrefix}-form`}
        label={t("Scheme")}
        value={form}
        options={[
          { value: "classic", text: t("Classic"), detail: t("SGTIN-96, SGTIN-198, SSCC-96…, which every RFID reader knows, with the tag URI.") },
          { value: "+", text: "EPC+", detail: t("EPC Tag Data Standard 2.0: no company prefix length needed. Older readers may not know it.") },
          {
            value: "++",
            text: "EPC++",
            detail: t("EPC Tag Data Standard 2.3: EPC+ with the GS1 Digital Link URI's hostname, {host}. Older readers may not know it.", { host: hostname }),
          },
        ]}
        onChange={(next) => onChange({ form: next })}
      />
      <div className="grid">
        {form === "classic" && <div>
          <label htmlFor={`${idPrefix}-prefix`}>{t("Company prefix length")}</label>
          <select
            id={`${idPrefix}-prefix`}
            value={prefixChoice ?? ""}
            onChange={(e) => onChange({ prefix: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t("Automatic (GS1's GCP length table)")}</option>
            {PARTITION_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {t("{n} digits", { n })}
              </option>
            ))}
          </select>
        </div>}
        {form !== "classic" && dates.length > 0 && (
          <div>
            <label htmlFor={`${idPrefix}-date`}>{t("Date in the EPC")}</label>
            <select id={`${idPrefix}-date`} value={date?.[0] ?? ""} onChange={(e) => onChange({ date: e.target.value })}>
              <option value="">{t("None (SGTIN)")}</option>
              {dates.map(([ai]) => (
                <option key={ai} value={ai}>
                  {t(DATE_NAMES[ai]!)} — DSGTIN
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${idPrefix}-filter`}>{t("Filter")}</label>
          <select id={`${idPrefix}-filter`} value={filter} onChange={(e) => onChange({ filter: Number(e.target.value) })}>
            {FILTERS.map((name, n) => (
              <option key={n} value={n}>
                {n} — {t(name)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {form === "classic" && <div className="gcp">
        <label htmlFor={gcpId}>{t("GS1's GCP length table (GCPPrefixFormatList.xml)")}</label>
        <input id={gcpId} type="file" accept=".xml,.gz,application/xml,text/xml" onChange={(e) => void load(e.target.files?.[0])} />
        <div className="hint">
          {gcpMessage ??
            (gcp
              ? t("GS1's list of {date}: {n} prefixes, kept in this browser.", { date: gcp.date.slice(0, 10), n: formatNumber(gcp.size) })
              : t("GS1 gives this list on request. It is read here and stays in this browser."))}
          {gcp && (
            <>
              {" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  void keep("gcp", null);
                  onGcp(null);
                  setGcpMessage(t("The list was removed from this browser."));
                }}
              >
                {t("Remove")}
              </button>
            </>
          )}
        </div>
      </div>}
      {result.plus && (result.after?.length || result.left?.length) ? (
        <div className="epc-aidc">
          <label className="check">
            <input type="checkbox" checked={withData} disabled={!result.after?.length} onChange={(e) => onChange({ withData: e.target.checked })} />{" "}
            {t("The data's other element strings after the EPC (+AIDC data)")}
          </label>
          <div className="hint">
            {result.after?.length
              ? t("After the EPC: {ais}.", { ais: result.after.map(([ai]) => `(${ai})`).join(" ") })
              : null}
            {result.left?.map((message) => <div key={message}>{message}</div>)}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** What the EPC is in each form, each with a copy button. */
export function EpcFacts({ epc }: { epc: ReturnType<typeof useEpc> }) {
  const { result, base } = epc;
  return (
    <>
      {result.plus ? (
        <div className="kv">
          <span>{t("Scheme")}</span>
          <code>{result.plus.scheme}</code>
          <span>{t("Length")}</span>
          <span>
            {t("{bits} bits, {words} words of the tag's EPC memory", { bits: result.plus.bits, words: Math.ceil(result.plus.bits / 16) })}
            {result.plus.bits > 496 && <span className="error"> {t("More than the 496 bits (31 words) an EPC memory can hold.")}</span>}
          </span>
          <span>{t("EPC (hexadecimal, as on the tag)")}</span>
          <Copyable text={result.plus.hex} />
          <span>{t("GS1 Digital Link URI it carries")}</span>
          <Copyable text={result.link ?? ""} />
        </div>
      ) : result.epc ? (
        <>
          {result.source && <div className="hint">{result.source}</div>}
          <div className="kv">
            <span>{t("Scheme")}</span>
            <code>{result.epc.scheme.toUpperCase()}</code>
            <span>{t("EPC (hexadecimal, as on the tag)")}</span>
            <Copyable text={result.epc.hex} />
            <span>{t("EPC (base 64)")}</span>
            <Copyable text={result.epc.base64} />
            <span>{t("Tag URI")}</span>
            <Copyable text={result.epc.tagUri} />
            <span>{t("Pure identity URI")}</span>
            <Copyable text={result.epc.pureIdentity} />
            <span>{t("Link for NFC")}</span>
            <Copyable text={`${base}/eh${result.epc.linkHex}`} />
            <span>{t("Link for NFC (base 64)")}</span>
            <Copyable text={`${base}/ex${result.epc.base64}`} />
          </div>
        </>
      ) : (
        <p className="hint epc-message">{result.message}</p>
      )}
    </>
  );
}

interface Props extends Omit<EpcInput, "choices"> {
  choices: EpcChoices;
  onChoices: (choices: EpcChoices) => void;
  onGcp: (table: GcpTable | null) => void;
  /** The label's GS1 Digital Link URI, for an NFC tag (backlog 1.19). */
  uri?: string;
  download: (name: string, content: Uint8Array<ArrayBuffer>, type: string) => void;
}

/** The NFC tag's choices: the GS1 Digital Link URI, or the link with the EPC. */
export function nfcChoices(epc: ReturnType<typeof useEpc>, uri?: string): [string, string][] {
  return [
    ...(uri ? [[t("The GS1 Digital Link URI"), uri] as [string, string]] : []),
    ...(epc.result.epc ? [[t("The link for NFC (EPC, hexadecimal)"), `${epc.base}/eh${epc.result.epc.linkHex}`] as [string, string]] : []),
  ];
}

export function EpcSection({ id, stem, gcp, onGcp, uri, elements = [], choices, onChoices, download }: Props) {
  const [open, setOpen] = useState(true);
  const epc = useEpc({ id, stem, gcp, elements, choices }, open);
  return (
    <details className="epc" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{t("RFID and NFC (EPC)")}</summary>
      <div className="hint">
        {t("The key's EPC as the EPC Tag Data Standard encodes it (SGTIN, SSCC, SGLN, GRAI, GIAI…), for RFID and NFC tags, and the compressed GS1 Digital Link an NFC tag emits.")}{" "}
        <a href="#/rfid">{t("Open in the RFID Studio")}</a>
      </div>
      <EpcControls choices={choices} onChange={(next) => onChoices({ ...choices, ...next })} epc={epc} gcp={gcp} onGcp={onGcp} />
      <EpcFacts epc={epc} />
      <NfcWriter choices={nfcChoices(epc, uri)} download={download} />
    </details>
  );
}
