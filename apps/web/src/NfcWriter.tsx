import { ndefUriMessage } from "@gs1-label-studio/core";
import { useState } from "react";
import { NFC_TEXTS } from "./texts.ts";
import { formatNumber, t, tm } from "./i18n.ts";

// Writing an NFC tag (backlog 1.19): one of the code's URIs as an NDEF URI record, through Web NFC where the browser has
// it (Chrome on Android), read back from the tag to check it; elsewhere the NDEF message as a file for a tag writer.

/** Web NFC, which TypeScript's DOM library does not describe. */
interface NdefRecord {
  recordType: string;
  data?: DataView;
}
interface NdefReader extends EventTarget {
  write(message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }): Promise<void>;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}
declare global {
  interface Window {
    NDEFReader?: new () => NdefReader;
  }
}

interface Props {
  /** The URIs that can go on the tag: [label, uri]. */
  choices: [string, string][];
  download: (name: string, content: Uint8Array<ArrayBuffer>, type: string) => void;
}

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };

export function NfcWriter({ choices, download }: Props) {
  const [chosen, setChosen] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const available = typeof window !== "undefined" && typeof window.NDEFReader === "function";
  const uri = choices[Math.min(chosen, choices.length - 1)]?.[1];
  if (!uri) return null;

  const failed = (error: unknown) =>
    setStatus({ kind: "error", text: error instanceof Error ? `${error.name === "NotAllowedError" ? t(NFC_TEXTS.notAllowed) : tm(error.message)}` : String(error) });

  async function write() {
    if (!window.NDEFReader || !uri) return;
    setStatus({ kind: "busy", text: t(NFC_TEXTS.hold) });
    try {
      await new window.NDEFReader().write({ records: [{ recordType: "url", data: uri }] });
      setStatus({ kind: "ok", text: t(NFC_TEXTS.written) });
    } catch (error) {
      failed(error);
    }
  }

  async function readBack() {
    if (!window.NDEFReader || !uri) return;
    setStatus({ kind: "busy", text: t(NFC_TEXTS.holdRead) });
    const reader = new window.NDEFReader();
    const stop = new AbortController();
    reader.addEventListener("reading", (event) => {
      stop.abort();
      const records = (event as Event & { message?: { records: NdefRecord[] } }).message?.records ?? [];
      const found = records.find((r) => r.recordType === "url");
      const text = found?.data ? new TextDecoder().decode(found.data) : null;
      setStatus(text === uri
        ? { kind: "ok", text: `${t(NFC_TEXTS.same)} ${text}` }
        : { kind: "error", text: text ? `${t(NFC_TEXTS.different)} ${text}` : t(NFC_TEXTS.noUrl) });
    }, { once: true });
    reader.addEventListener("readingerror", () => setStatus({ kind: "error", text: t(NFC_TEXTS.unreadable) }), { once: true });
    try {
      await reader.scan({ signal: stop.signal });
    } catch (error) {
      failed(error);
    }
  }

  return (
    <div className="nfc">
      <b>{t("NFC tag")}</b>
      {choices.length > 1 && (
        <select aria-label={t("What to write on the NFC tag")} value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
          {choices.map(([label], index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      )}
      <div className="sign-row">
        <button type="button" className="btn" disabled={!available || status.kind === "busy"} onClick={() => void write()}>
          {t("Write to an NFC tag")}
        </button>
        <button type="button" className="btn" disabled={!available || status.kind === "busy"} onClick={() => void readBack()}>
          {t("Read the tag back")}
        </button>
        <button type="button" className="btn" onClick={() => download("nfc-uri.ndef", ndefUriMessage(uri), "application/octet-stream")}>
          {t("NDEF file")}
        </button>
      </div>
      <p className={status.kind === "ok" ? "hint ok" : status.kind === "error" ? "hint error" : "hint"} aria-live="polite">
        {status.text || (available ? t(NFC_TEXTS.ready) : t(NFC_TEXTS.unavailable))}
      </p>
    </div>
  );
}
