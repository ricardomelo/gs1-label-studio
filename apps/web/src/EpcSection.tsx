import { useEffect, useMemo, useState } from "react";
import {
  companyPart,
  defaultFilter,
  encodeEpc,
  EpcError,
  epcMissing,
  epcSchemes,
  GcpError,
  gcpLengthOf,
  KEY_SCHEMES,
  normaliseKeyValue,
  PARTITION_LENGTHS,
  parseGcpTable,
  type EpcScheme,
  type GcpTable,
  type Identification,
} from "@gs1-label-studio/core";
import { fileText, keep } from "./keep.ts";
import { NfcWriter } from "./NfcWriter.tsx";
import { en, formatNumber, locale, t, tm } from "./i18n.ts";

// RFID and NFC (EPC), as the resolver's label panel had it (ADR 0004; item 1.8): the key's EPC as the EPC Tag Data
// Standard encodes it, and the compressed GS1 Digital Link an NFC tag emits. The company prefix's length: the person's
// choice, or GS1's GCP length table, which the person loads once and this browser keeps.

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

interface Props {
  id: Identification;
  stem: string;
  gcp: GcpTable | null;
  onGcp: (table: GcpTable | null) => void;
  /** The label's GS1 Digital Link URI, for an NFC tag (backlog 1.19). */
  uri?: string;
  download: (name: string, content: Uint8Array<ArrayBuffer>, type: string) => void;
}

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

export function EpcSection({ id, stem, gcp, onGcp, uri, download }: Props) {
  const [schemes, setSchemes] = useState<Record<string, EpcScheme> | null>(null);
  const [open, setOpen] = useState(true);
  const [prefixChoice, setPrefixChoice] = useState<number | null>(null);
  const [filterChoice, setFilterChoice] = useState<number | null>(null);
  const [gcpMessage, setGcpMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open && !schemes) epcSchemes().then(setSchemes, (e: unknown) => console.error(e));
  }, [open, schemes]);

  const value = normaliseKeyValue(id.key, id.value);
  const filter = filterChoice ?? defaultFilter(id.key);
  const base = (stem.trim() || "https://id.gs1.org").replace(/\/$/, "");

  const result = useMemo(() => {
    if (!(id.key in KEY_SCHEMES)) return { message: t("This key has no EPC scheme in the EPC Tag Data Standard.") };
    if (!schemes) return { message: t("Loading the EPC schemes…") };
    const qualifiers = Object.fromEntries(Object.entries(id.qualifiers).map(([ai, v]) => [ai, v.trim()]).filter(([, v]) => v));
    // What the key lacks comes first, as the resolver's route checked it: no prefix length would help.
    const need = epcMissing(id.key, value, qualifiers);
    if (need) return { message: tm(new EpcError(need.qualifier ? "epc.needsQualifier" : "epc.needsSerial", need as Record<string, string | number>).message) };
    let length = prefixChoice;
    let source = "";
    if (length === null) {
      const listed = gcp ? gcpLengthOf(gcp, companyPart(id.key, value)) : null;
      if (listed === 0) {
        return { message: t("GS1's list says this key's range is not a GS1 Company Prefix: choose the prefix's length to write an EPC.") };
      }
      if (!listed) {
        return {
          message: gcp
            ? t("GS1's list of {date} has no entry for this key: choose the company prefix length.", { date: gcp.date.slice(0, 10) })
            : t("Choose the company prefix length, or load GS1's GCP length table."),
        };
      }
      length = listed;
      source = t("A company prefix of {n} digits, from GS1's list of {date}.", { n: listed, date: gcp!.date.slice(0, 10) });
    }
    try {
      return { epc: encodeEpc(schemes, id.key, value, qualifiers, length, filter), source };
    } catch (error) {
      return { message: tm(error instanceof EpcError ? error.message : String(error)) };
    }
  }, [schemes, id.key, value, id.qualifiers, prefixChoice, gcp, filter, locale()]);

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
    <details className="epc" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{t("RFID and NFC (EPC)")}</summary>
      <div className="hint">
        {t("The key's EPC as the EPC Tag Data Standard encodes it (SGTIN, SSCC, SGLN, GRAI, GIAI…), for RFID and NFC tags, and the compressed GS1 Digital Link an NFC tag emits.")}
      </div>
      <div className="grid">
        <div>
          <label htmlFor="epc-prefix">{t("Company prefix length")}</label>
          <select
            id="epc-prefix"
            value={prefixChoice ?? ""}
            onChange={(e) => setPrefixChoice(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("Automatic (GS1's GCP length table)")}</option>
            {PARTITION_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {t("{n} digits", { n })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="epc-filter">{t("Filter")}</label>
          <select id="epc-filter" value={filter} onChange={(e) => setFilterChoice(Number(e.target.value))}>
            {FILTERS.map((name, n) => (
              <option key={n} value={n}>
                {n} — {t(name)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="gcp">
        <label htmlFor="gcp-file">{t("GS1's GCP length table (GCPPrefixFormatList.xml)")}</label>
        <input id="gcp-file" type="file" accept=".xml,.gz,application/xml,text/xml" onChange={(e) => void load(e.target.files?.[0])} />
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
      </div>
      {result.epc ? (
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
      <NfcWriter
        choices={[
          ...(uri ? [[t("The GS1 Digital Link URI"), uri] as [string, string]] : []),
          ...(result.epc ? [[t("The link for NFC (EPC, hexadecimal)"), `${base}/eh${result.epc.linkHex}`] as [string, string]] : []),
        ]}
        download={download}
      />
    </details>
  );
}
