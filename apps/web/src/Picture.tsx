import type { Reading, Verdict } from "@gs1-label-studio/core";
import { useRef, useState } from "react";
import { en, t } from "./i18n.ts";

// A picture read by the Check Studio (backlog 7.1 g; the check studio's project, section 3.3): chosen, taken with the
// phone's camera, dropped or pasted. Every symbol found is outlined on it and numbered, each listed with its verdict;
// choosing one shows its result. When nothing is found the studio says what it cannot read (fault A9), rather than
// only that there is no barcode.

/** A picture and the symbols read on it. */
export interface PictureRead {
  url: string;
  width: number;
  height: number;
  readings: Reading[];
}

/** The verdict marks the list shows beside each symbol (the result's icons). */
export const VERDICT_ICONS: Record<Verdict, string> = { follows: "✓", remarks: "!", "does-not-follow": "✕", "not-gs1": "–", "not-assessed": "?" };

/** The decoder's names of the symbologies, as a person knows them. */
const FORMAT_NAMES: Record<string, string> = {
  DataMatrix: "Data Matrix",
  QRCode: "QR Code",
  Code128: "Code 128",
  EAN13: "EAN-13",
  EAN8: "EAN-8",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  ITF: "ITF",
  DataBar: "GS1 DataBar",
  DataBarOmni: "GS1 DataBar",
  DataBarLtd: "GS1 DataBar Limited",
  DataBarLimited: "GS1 DataBar Limited",
  DataBarExp: "GS1 DataBar Expanded",
  DataBarExpanded: "GS1 DataBar Expanded",
  DataBarStk: "GS1 DataBar Stacked",
  DataBarExpStk: "GS1 DataBar Expanded Stacked",
};
/** The GS1 names a symbology identifier gives the same symbols (General Specifications 5.1.3, table 5-2). */
const GS1_NAMES: Record<string, string> = { "]d2": "GS1 DataMatrix", "]Q3": "GS1 QR Code", "]C1": "GS1-128", "]I1": "ITF-14" };

/** A symbol's name for the list: its GS1 name when its identifier gives one, else the decoder's. */
export function symbolName(reading: Reading): string {
  const id = reading.symbologyIdentifier ?? "";
  return GS1_NAMES[id] ?? FORMAT_NAMES[reading.format ?? ""] ?? reading.format ?? t("A symbol");
}

const ACCEPT = "image/*";

interface Props {
  picture: PictureRead | null;
  busy: boolean;
  failed: boolean;
  chosen: number;
  verdicts: readonly Verdict[];
  onFile: (file: Blob) => void;
  onChoose: (index: number) => void;
  /** The user says there is a code the studio did not read (fault A9). */
  onUnreadable: () => void;
  /** Opens the file chooser at once (the camera's way round). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function Picture({ picture, busy, failed, chosen, verdicts, onFile, onChoose, onUnreadable, inputRef }: Props) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const [over, setOver] = useState(false);
  const none = picture !== null && picture.readings.length === 0;

  return (
    <div
      className="picture"
      data-over={over || undefined}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        setOver(false);
        if (!file) return;
        e.preventDefault();
        onFile(file);
      }}
    >
      <div className="picture-pick">
        <button type="button" className="btn primary" onClick={() => input.current?.click()}>
          {t("Take or choose a picture")}
        </button>
        <span className="hint">{t("or drop one here, or paste it (Ctrl+V).")}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          aria-label={t("Picture")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {busy && <p className="hint" role="status">{t("Reading the picture…")}</p>}
      {failed && <p className="hint" role="alert">{t("This file could not be opened as a picture.")}</p>}
      {picture && (
        <figure className="picture-figure">
          <div className="picture-frame">
            <img src={picture.url} alt={t("The picture read")} width={picture.width} height={picture.height} />
            <svg viewBox={`0 0 ${picture.width} ${picture.height}`} aria-hidden="true">
              {picture.readings.map((r, i) =>
                r.position ? (
                  <g key={i} className="outline" data-chosen={i === chosen || undefined} data-verdict={verdicts[i]}>
                    <polygon points={r.position.map(([x, y]) => `${x},${y}`).join(" ")} />
                    <text x={r.position[0]![0]} y={r.position[0]![1]} fontSize={Math.max(14, picture.width / 30)}>
                      {i + 1}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>
          </div>
          {picture.readings.length > 0 && (
            <figcaption>
              {picture.readings.length === 1 ? t("One symbol found.") : t("{n} symbols found: choose one to see its result.", { n: picture.readings.length })}
            </figcaption>
          )}
        </figure>
      )}
      {picture && <SymbolList readings={picture.readings} chosen={chosen} verdicts={verdicts} onChoose={onChoose} />}
      {none && (
        <div className="picture-none" role="status">
          <p>
            <b>{t("No barcode was found in this picture.")}</b>
          </p>
          <p className="hint">
            {t("A blurred, very small or cut-off code is not read; nor are a GS1 DotCode and the 2D part of a Composite symbol, which no decoder here reads. Try a sharper picture, or type what a scanner gives.")}
          </p>
          <button type="button" className="btn" onClick={onUnreadable}>
            {t("There is a code here that is not read")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The verdicts' words, for the list's marks (the same texts as the result's). */
export const VERDICT_WORDS: Record<Verdict, string> = {
  follows: en("Follows the GS1 rules"),
  remarks: en("Works, with remarks"),
  "does-not-follow": en("Does not follow the GS1 rules"),
  "not-gs1": en("Not a GS1 code"),
  "not-assessed": en("Could not be checked"),
};

/** The symbols of one picture or one camera frame, numbered as outlined, each with its verdict; one is chosen. */
export function SymbolList({ readings, chosen, verdicts, onChoose }: { readings: readonly Reading[]; chosen: number; verdicts: readonly Verdict[]; onChoose: (index: number) => void }) {
  if (readings.length < 2) return null;
  return (
    <ol className="picture-symbols" aria-label={t("The symbols found")}>
      {readings.map((r, i) => {
        const verdict = verdicts[i] ?? "not-assessed";
        return (
          <li key={i}>
            <button type="button" className="chip" aria-pressed={i === chosen} data-verdict={verdict} onClick={() => onChoose(i)}>
              <b>{i + 1}</b> {symbolName(r)} <span title={t(VERDICT_WORDS[verdict])}>{VERDICT_ICONS[verdict]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
