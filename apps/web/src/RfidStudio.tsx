import { compareReadBack, epcBank, EPC_MEMORY_LIMITS, type ReadDifference, zplRfidCommands, zplRfidLabel, zplWithRfid, type EpcBank, type GcpTable, type RfidWriteFrom } from "@gs1-label-studio/core";
import { useState, type ReactNode } from "react";
import { Segmented } from "./Segmented.tsx";
import { EpcControls, EpcFacts, nfcChoices, type EpcChoices, type useEpc } from "./EpcSection.tsx";
import { formatNumber, t } from "./i18n.ts";
import { NfcWriter } from "./NfcWriter.tsx";

// The RFID Studio (backlog 6.12, ADR 0008, option A of the ideation round): the editor's step 1, then three steps of
// its own in the places the label's take: 2 the encoding where step 2's question is, 3 the tag's memory where the
// label is, 4 writing and reading back where the export is. What a browser cannot do is said, never pretended: a UHF
// tag is written by an RFID printer or an encoder from what step 4 gives.

type Epc = ReturnType<typeof useEpc>;

/** Step 2: the scheme and its choices, the editor's card's controls. */
export function RfidEncodingCard({ epc, choices, onChoices, gcp, onGcp }: {
  epc: Epc;
  choices: EpcChoices;
  onChoices: (choices: EpcChoices) => void;
  gcp: GcpTable | null;
  onGcp: (table: GcpTable | null) => void;
}) {
  return (
    <section className="card rfid-encoding" aria-labelledby="encoding-title">
      <h2 id="encoding-title">
        <span className="n">2</span> {t("How is it encoded?")}
      </h2>
      <p className="hint">
        {t("The EPC Tag Data Standard's scheme for the key: classic schemes need the company prefix's length, EPC+ and EPC++ do not.")}
      </p>
      <EpcControls choices={choices} onChange={(next) => onChoices({ ...choices, ...next })} epc={epc} gcp={gcp} onGcp={onGcp} idPrefix="rfid" />
    </section>
  );
}

/** The EPC's hexadecimal and length, whichever form step 2 chose; null while there is none. */
export function epcOf(epc: Epc): { hex: string; bits: number } | null {
  if (epc.result.plus) return { hex: epc.result.plus.hex, bits: epc.result.plus.bits };
  if (epc.result.epc) return { hex: epc.result.epc.hex, bits: epc.result.epc.bits.length };
  return null;
}

/** The bank for step 2's EPC and step 3's control bits; null while there is no EPC or it does not fit. */
export function bankOf(epc: Epc, choices: EpcChoices): EpcBank | null {
  const own = epcOf(epc);
  if (!own || own.bits > EPC_MEMORY_LIMITS.withoutXpc) return null;
  return epcBank(own.hex, own.bits, { umi: choices.umi, attributes: choices.hazmat ? 1 : 0 });
}

const FIELD_NAMES = (): Record<string, string> => ({ crc: t("StoredCRC"), pc: t("StoredPC"), epc: "EPC" });

/** The tag drawn: an inlay with its antenna and chip, the memory as a bar from bit 00h to 496 bits of EPC. */
function TagPicture({ bank }: { bank: EpcBank | null }) {
  const total = 32 + EPC_MEMORY_LIMITS.withoutXpc; // CRC, PC and the largest EPC
  const x = (bits: number) => 10 + (bits / total) * 300;
  return (
    <svg className="tag-picture" viewBox="0 0 320 150" role="img" aria-label={t("An RFID tag and its EPC memory")}>
      <rect x="10" y="8" width="300" height="72" rx="8" className="inlay" />
      <path className="antenna" d="M24 44h40v-22h16v44h16v-44h16v44h16v-34h20M296 44h-40v-22h-16v44h-16v-44h-16v44h-16v-34h-20" />
      <rect x="148" y="34" width="24" height="20" rx="2" className="chip" />
      {bank && (
        <>
          <rect x={x(0)} y="98" width={x(16) - x(0)} height="18" className="mem crc" />
          <rect x={x(16)} y="98" width={x(32) - x(16)} height="18" className="mem pc" />
          <rect x={x(32)} y="98" width={x(32 + bank.bits) - x(32)} height="18" className="mem epc" />
          {bank.fill > 0 && <rect x={x(32 + bank.bits)} y="98" width={x(32 + bank.bits + bank.fill) - x(32 + bank.bits)} height="18" className="mem fill" />}
        </>
      )}
      <rect x={x(0)} y="98" width={x(total) - x(0)} height="18" className="mem frame" />
      <line x1={x(32 + EPC_MEMORY_LIMITS.withXpc)} x2={x(32 + EPC_MEMORY_LIMITS.withXpc)} y1="94" y2="120" className="limit" />
      <text x={x(0)} y="134" className="small">00h</text>
      <text x={x(total)} y="134" className="small" textAnchor="end">{t("{n} bits", { n: EPC_MEMORY_LIMITS.withoutXpc })}</text>
      {bank && <text x={x(32)} y="92" className="small">{t("{bits} bits, {words} words", { bits: bank.bits, words: bank.words.length - 2 })}</text>}
    </svg>
  );
}

function Copy({ text }: { text: string }) {
  return (
    <button type="button" className="link" onClick={() => void navigator.clipboard?.writeText(text)}>
      {t("Copy")}
    </button>
  );
}

/** Steps 3 and 4: the tag's memory, then what writes and reads it. */
export function RfidTagCard({ epc, choices, onChoices, uri, download, children }: {
  epc: Epc;
  choices: EpcChoices;
  onChoices: (choices: EpcChoices) => void;
  /** The data's GS1 Digital Link URI, for an NFC tag. */
  uri?: string;
  download: (name: string, content: Uint8Array<ArrayBuffer>, type: string) => void;
  children?: ReactNode;
}) {
  const own = epcOf(epc);
  const bank = bankOf(epc, choices);
  const names = FIELD_NAMES();
  const tagUri = epc.result.epc?.tagUri;
  const controlled = tagUri && bank?.controls ? tagUri.replace(/^urn:epc:tag:/, `urn:epc:tag:${bank.controls}:`) : tagUri;
  return (
    <section className="card label-card rfid-tag" aria-labelledby="memory-title" data-pane="label export more" data-beside="">
      <div className="stage" data-pane="label export" data-beside="">
        <h2 id="memory-title" data-pane="label" data-beside="">
          <span className="n">3</span> {t("The tag's memory")}
        </h2>
        <div data-pane="label" data-beside="">
          <TagPicture bank={bank} />
          {own && !bank && (
            <p className="error">{t("More than the 496 bits (31 words) an EPC memory can hold.")}</p>
          )}
          {bank && (
            <>
              <ol className="words" aria-label={t("The EPC memory bank, word by word")}>
                {bank.words.map((w) => (
                  <li key={w.address} className={w.field} title={names[w.field]}>
                    <span className="address">{w.address.toString(16).toUpperCase().padStart(2, "0")}h</span>
                    <code>{w.hex}</code>
                  </li>
                ))}
              </ol>
              <p className="legend small">
                <span className="key crc" /> {names.crc} <span className="key pc" /> {names.pc} <span className="key epc" /> EPC
              </p>
              <p className="hint">
                {t("The StoredPC's Length counts the EPC's {words} words; the tag computes the StoredCRC itself, shown here to compare with what a reader returns.", { words: bank.words.length - 2 })}
                {bank.fill > 0 && <> {t("The last word ends in {n} zero bits.", { n: bank.fill })}</>}
                {bank.bits > EPC_MEMORY_LIMITS.withXpc && <> {t("More than {n} bits: only tags without an XPC_W1 word hold it.", { n: EPC_MEMORY_LIMITS.withXpc })}</>}
              </p>
              <fieldset className="pc-bits">
                <legend>{t("Control bits in the StoredPC")}</legend>
                <label className="check">
                  <input type="checkbox" checked={choices.hazmat} onChange={(e) => onChoices({ ...choices, hazmat: e.target.checked })} />{" "}
                  {t("Hazardous material (attribute bit, Gen2 version 1 tags)")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={choices.umi} onChange={(e) => onChoices({ ...choices, umi: e.target.checked })} />{" "}
                  {t("User memory holds data (many tags set this bit themselves)")}
                </label>
              </fieldset>
            </>
          )}
          <EpcFacts epc={epc} />
        </div>
        <div className="rfid-write" data-pane="export" data-beside="">
        <h2 id="write-title">
          <span className="n">4</span> {t("Writing and reading back")}
        </h2>
        <p className="hint">
          {t("A browser cannot write or read a UHF RFID tag: an RFID printer or an encoder writes what is below, and a reader's output can be pasted in step 1.")}
        </p>
        {bank && (
          <div className="kv">
            <span>{t("EPC, from bit 20h (most encoders and readers)")}</span>
            <code>{bank.fromEpc} <Copy text={bank.fromEpc} /></code>
            <span>{t("StoredPC and EPC, from bit 10h")}</span>
            <code>{bank.fromPc} <Copy text={bank.fromPc} /></code>
            <span>{t("The whole bank, from bit 00h")}</span>
            <code>{bank.hex} <Copy text={bank.hex} /></code>
            {controlled && (
              <>
                <span>{t("Tag URI with the control bits")}</span>
                <code>{controlled} <Copy text={controlled} /></code>
              </>
            )}
          </div>
        )}
        {own && (
          <p className="hint">
            {t("{bits} bits of EPC: a tag with at least {memory} bits of EPC memory.", { bits: own.bits, memory: formatNumber(Math.ceil(own.bits / 16) * 16) })}
          </p>
        )}
        {children}
        {bank && <ReadBack bank={bank} />}
        <NfcWriter choices={nfcChoices(epc, uri)} download={download} />
        </div>
      </div>
    </section>
  );
}

/** Step 4's RFID printer: ZPL's ^RS and ^RF, alone with the EPC in text or added to the label's own ZPL. */
export function RfidPrinter({ bank, lines, stem, dpi, labelZpl, download }: {
  bank: EpcBank;
  /** What the tag's own label prints in text: the EPC and what it identifies. */
  lines: string[];
  stem: string;
  dpi: number;
  /** The label of the Label Studio as ZPL, or the reason there is none. */
  labelZpl: () => { zpl: string } | { error: string };
  download: (name: string, content: string, type: string) => void;
}) {
  const [from, setFrom] = useState<RfidWriteFrom>("pc");
  const [error, setError] = useState<string | null>(null);
  const commands = zplRfidCommands(bank, from);
  return (
    <div className="rfid-printer">
      <h3>{t("RFID printer (ZPL)")}</h3>
      <Segmented<RfidWriteFrom>
        id="rfid-from"
        label={t("Where the printer writes")}
        value={from}
        options={[
          { value: "pc", text: t("From bit 10h"), detail: t("The StoredPC and the EPC, so that the Length is right on any Gen2 printer.") },
          { value: "auto", text: t("From bit 20h"), detail: t("The EPC alone, the printer setting the StoredPC: Zebra ZD500R, ZT400 and ZT600 series only.") },
        ]}
        onChange={setFrom}
      />
      <pre className="zpl-rfid">{commands}</pre>
      <div className="buttons">
        <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(commands)}>
          {t("Copy")}
        </button>
        <button type="button" className="btn primary" onClick={() => download(`${stem}-rfid.zpl`, zplRfidLabel(bank, lines, { dpi, from }), "text/plain")}>
          {t("The tag and its EPC in text (.zpl)")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const label = labelZpl();
            if ("error" in label) return setError(label.error);
            setError(null);
            download(`${stem}-label-rfid.zpl`, zplWithRfid(label.zpl, bank, from), "text/plain");
          }}
        >
          {t("The tag with the Label Studio's label (.zpl)")}
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      <p className="hint">{t("Printed at {dpi} dpi. Check one tag with a reader before a whole run.", { dpi })}</p>
    </div>
  );
}

/** What each difference between the tag read and the bank meant says (backlog 6.12 e). */
const DIFFERENCES = (): Record<ReadDifference, string> => ({
  epc: t("The EPC read is not the one meant: the tag was written with other data, or not written."),
  length: t("The StoredPC's Length counts other than the EPC's words: write from bit 10h, or let the printer set the PC."),
  attributes: t("The attribute bits differ (the hazardous material bit in step 3)."),
  toggle: t("The toggle bit says the tag holds no EPC but an ISO identifier."),
  crc: t("The StoredCRC does not match the PC and EPC read: read the tag again."),
});

/** Step 4's reading back: what a reader returned, pasted, compared with the bank. */
function ReadBack({ bank }: { bank: EpcBank }) {
  const [text, setText] = useState("");
  const comparison = text.trim() ? compareReadBack(bank, text) : null;
  const texts = DIFFERENCES();
  const forms = { epc: t("the EPC alone"), pc: t("from the StoredPC"), bank: t("the whole bank, CRC first") };
  return (
    <div className="read-back">
      <h3>{t("Reading back")}</h3>
      <label htmlFor="rfid-read">{t("What the reader returned (hexadecimal: the EPC, or the bank from bit 10h or 00h)")}</label>
      <input id="rfid-read" className="mono" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
      {text.trim() && !comparison && <p className="error small">{t("Not an EPC or an EPC bank: hexadecimal in whole 16-bit words (4 digits each).")}</p>}
      {comparison && (comparison.differences.length === 0
        ? <p className="ok" role="status">✓ {t("The tag holds what was meant ({form}).", { form: forms[comparison.form] })}</p>
        : (
          <div role="alert">
            <p className="error">{t("The tag does not hold what was meant ({form}):", { form: forms[comparison.form] })}</p>
            <ul className="small">{comparison.differences.map((d) => <li key={d}>{texts[d]}</li>)}</ul>
          </div>
        ))}
    </div>
  );
}
