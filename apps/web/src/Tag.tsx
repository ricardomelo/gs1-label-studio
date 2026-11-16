import { ndefRecords, ndefRecordUri, readingFromEpc, readingFromNdef, type NdefRecord, type Reading } from "@gs1-label-studio/core";
import { useRef, useState } from "react";
import { en, t } from "./i18n.ts";
import { messageOf, nfcAvailable, scanTag } from "./nfc.ts";
import { WedgeListener } from "./wedge.ts";

// The Check Studio's tags (backlog 7.1 h; the check studio's project, section 3.4). NFC: read with Web NFC where the
// browser has it (Chrome on Android), the tag's every record listed; elsewhere the screen says what works instead (an
// iPhone opens the tag's link by itself; a tag app's .ndef file) rather than showing a dead button. RFID: no browser
// reads a UHF tag, so its EPC is pasted or typed by a reader in keyboard mode, as hexadecimal or a URI.

/** A record of a tag, as the list names it: its type in words and what it holds. */
export function describeRecord(record: NdefRecord): { type: string; holds: string } {
  if (record.tnf === 1 && record.type === "U") {
    try {
      return { type: en("Link (URI)"), holds: ndefRecordUri(record) };
    } catch {
      return { type: en("Link (URI)"), holds: "?" };
    }
  }
  if (record.tnf === 1 && record.type === "T") {
    const status = record.payload[0] ?? 0;
    const langLength = status & 0x3f;
    const decoder = new TextDecoder(status & 0x80 ? "utf-16" : "utf-8");
    return { type: en("Text"), holds: decoder.decode(record.payload.subarray(1 + langLength)) };
  }
  if (record.tnf === 1 && record.type === "Sp") return { type: en("Smart poster"), holds: `${record.payload.length} B` };
  if (record.tnf === 0) return { type: en("Empty"), holds: "" };
  return { type: record.type || en("Unknown"), holds: `${record.payload.length} B` };
}

type NfcState = { kind: "idle" } | { kind: "waiting" } | { kind: "error"; text: string };

interface Props {
  /** The reading of a tag held to the phone, of an .ndef file, or of an EPC pasted or typed. */
  onRead: (reading: Reading | null) => void;
  /** The NDEF message read last, to list its records. */
  message: Uint8Array | null;
  onMessage: (message: Uint8Array | null) => void;
}

export function Tag({ onRead, message, onMessage }: Props) {
  const [nfc, setNfc] = useState<NfcState>({ kind: "idle" });
  const [epc, setEpc] = useState("");
  const waiting = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const wedge = useRef(new WedgeListener());
  const available = nfcAvailable();

  const readNdef = (bytes: Uint8Array, serialNumber: string | null) => {
    try {
      onRead(readingFromNdef(bytes, { serialNumber }));
      onMessage(bytes);
      setNfc({ kind: "idle" });
    } catch {
      setNfc({ kind: "error", text: t("This is not an NDEF message a tag holds.") });
    }
  };

  const scan = async () => {
    const stop = new AbortController();
    waiting.current = stop;
    setNfc({ kind: "waiting" });
    try {
      const tag = await scanTag(stop.signal);
      readNdef(messageOf(tag.records), tag.serialNumber);
    } catch (error) {
      if (stop.signal.aborted) return;
      const name = (error as { name?: string }).name;
      setNfc({
        kind: "error",
        text: name === "NotAllowedError" ? t("NFC was not allowed. Allow it in the browser's settings for this site.") : name === "NotReadableError" ? t("The tag could not be read. Hold it still against the phone and try again.") : t("NFC could not be started. Check that NFC is switched on in the phone's settings."),
      });
    } finally {
      waiting.current = null;
    }
  };

  const records = message ? safeRecords(message) : [];

  return (
    <div className="tag-reader">
      <section aria-labelledby="tag-nfc">
        <h3 id="tag-nfc">{t("NFC tag")}</h3>
        {available ? (
          <div className="check-row">
            {nfc.kind === "waiting" ? (
              <>
                <p className="hint" role="status">{t("Hold the tag to the back of the phone…")}</p>
                <button type="button" className="btn" onClick={() => { waiting.current?.abort(); setNfc({ kind: "idle" }); }}>
                  {t("Cancel")}
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={() => void scan()}>
                {t("Read an NFC tag")}
              </button>
            )}
          </div>
        ) : (
          <div className="tag-absent">
            <p>{t("This browser cannot read NFC tags: only Chrome on Android can.")}</p>
            <ul>
              <li>{t("On an iPhone, hold the tag near the top of the phone: it opens the tag's link by itself. Copy that link and paste it under Type or paste.")}</li>
              <li>{t("Or open the .ndef file an NFC app saved from the tag:")}</li>
            </ul>
          </div>
        )}
        <div className="check-row">
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            {t("Open an .ndef file")}
          </button>
          <input
            ref={file}
            type="file"
            accept=".ndef,application/octet-stream"
            hidden
            aria-label={t("An .ndef file")}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) readNdef(new Uint8Array(await f.arrayBuffer()), null);
            }}
          />
        </div>
        {nfc.kind === "error" && <p className="hint error" role="alert">{nfc.text}</p>}
        {records.length > 0 && (
          <div className="tag-records">
            <p className="hint">{records.length === 1 ? t("The tag holds one record:") : t("The tag holds {n} records:", { n: records.length })}</p>
            <ol>
              {records.map((r, i) => {
                const d = describeRecord(r);
                return (
                  <li key={i}>
                    <b>{t(d.type)}</b> <span className="mono">{d.holds}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
      <section aria-labelledby="tag-rfid">
        <h3 id="tag-rfid">{t("RFID tag (EPC)")}</h3>
        <label className="field">
          <span>{t("Paste the EPC as hexadecimal (3034…) or as a URI (urn:epc:…), or read it with an RFID reader set as a keyboard. No browser reads a UHF tag by itself.")}</span>
          <input
            type="text"
            className="mono"
            value={epc}
            spellCheck={false}
            placeholder="3074257BF7194E4000001A85"
            onKeyDown={(e) => {
              const now = performance.now();
              if (e.key === "Enter") {
                const burst = wedge.current.end(now);
                if (burst) {
                  e.preventDefault();
                  setEpc(burst);
                  onRead(readingFromEpc(burst, { source: "wedge" }));
                }
                return;
              }
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) wedge.current.key(e.key, now);
            }}
            onChange={(e) => {
              setEpc(e.target.value);
              onMessage(null);
              onRead(e.target.value.trim() ? readingFromEpc(e.target.value, { source: "paste" }) : null);
            }}
          />
        </label>
      </section>
    </div>
  );
}

function safeRecords(message: Uint8Array): NdefRecord[] {
  try {
    return ndefRecords(message);
  } catch {
    return [];
  }
}
