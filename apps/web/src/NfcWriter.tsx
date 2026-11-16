import { ndefUriMessage } from "@gs1-label-studio/core";
import { useState } from "react";
import { nfcAvailable, scanTag } from "./nfc.ts";
import { NFC_TEXTS } from "./texts.ts";
import { formatNumber, t, tm } from "./i18n.ts";

// Writing an NFC tag (backlog 1.19): one of the code's URIs as an NDEF URI record, through Web NFC where the browser has
// it (Chrome on Android), read back from the tag to check it; elsewhere the NDEF message as a file for a tag writer.

interface Props {
  /** The URIs that can go on the tag: [label, uri]. */
  choices: [string, string][];
  download: (name: string, content: Uint8Array<ArrayBuffer>, type: string) => void;
}

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };

export function NfcWriter({ choices, download }: Props) {
  const [chosen, setChosen] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const available = nfcAvailable();
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
    if (!uri) return;
    setStatus({ kind: "busy", text: t(NFC_TEXTS.holdRead) });
    try {
      const { records } = await scanTag(new AbortController().signal);
      const found = records.find((r) => r.recordType === "url");
      const text = found?.data ? new TextDecoder().decode(found.data) : null;
      setStatus(text === uri
        ? { kind: "ok", text: `${t(NFC_TEXTS.same)} ${text}` }
        : { kind: "error", text: text ? `${t(NFC_TEXTS.different)} ${text}` : t(NFC_TEXTS.noUrl) });
    } catch (error) {
      if ((error as { name?: string }).name === "NotReadableError") setStatus({ kind: "error", text: t(NFC_TEXTS.unreadable) });
      else failed(error);
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
