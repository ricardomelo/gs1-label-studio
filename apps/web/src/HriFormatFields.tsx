import { HRI_PATTERNS, hriText, SECOND_LANGUAGES, type HriFormat, type HriStyle, type SecondLanguage } from "@gs1-label-studio/core";
import { Help } from "./Help.tsx";
import { en, t, tm } from "./i18n.ts";
import { OPTION_HELP } from "./texts.ts";

// The human readable text's format, chosen (backlog 6.11, the owner, 15 November 2026; mock-up A of two: a list whose
// choices show the data as each writes it, rather than four buttons and a line of example under them). The same fields
// in the label's options and, for a label of one's own, under a barcode's Human readable text.

export interface HriFormatSettings {
  hriFormat: HriStyle;
  /** The pattern of one's own, kept when another format is chosen. */
  hriPattern: string;
  /** The data titles' language: English, or one of the five of data_titles.json. */
  hriTitles: "en" | SecondLanguage;
}

/** The pattern a format of one's own starts from: data titles, the AI, and a date written as people read it. */
export const START_PATTERN = "{title} ({ai}) {value:DD MMM YYYY}";

/** The core's format from the settings; none for the AI in parentheses, the symbols' text as it has always been. */
export function hriFormatOf(s: HriFormatSettings): HriFormat | undefined {
  if (s.hriFormat === "ai") return undefined;
  return { style: s.hriFormat, ...(s.hriFormat === "own" ? { pattern: s.hriPattern } : {}), ...(s.hriTitles !== "en" ? { language: s.hriTitles } : {}) };
}

/** A line written in the format, or the message saying why it cannot be. */
function example(line: string, s: HriFormatSettings): { text: string; error?: boolean } {
  try {
    return { text: hriText(line, hriFormatOf(s)) };
  } catch (error) {
    return { text: error instanceof Error ? tm(error.message) : String(error), error: true };
  }
}

const NAMES: Record<HriStyle, string> = {
  ai: en("AI and data: {example}"),
  title: en("Data title and data: {example}"),
  both: en("Both: {example}"),
  own: en("A format of my own"),
};

interface Props {
  settings: HriFormatSettings;
  onChange: (next: Partial<HriFormatSettings>) => void;
  /** An element string of the data, `(17)271231`, that the choices write as an example. */
  line: string;
}

export function HriFormatFields({ settings: s, onChange, line }: Props) {
  const label = (htmlFor: string, name: string, help: keyof typeof OPTION_HELP) => (
    <div className="label-row">
      <label htmlFor={htmlFor}>{name}</label>
      <Help name={name} text={t(OPTION_HELP[help])} />
    </div>
  );
  const shown = example(line, s);
  return (
    <>
      <div>
        {label("opt-hri-format", t("Text format"), "hriFormat")}
        <select id="opt-hri-format" value={s.hriFormat} onChange={(e) => onChange({ hriFormat: e.target.value as HriStyle })}>
          {(Object.keys(NAMES) as HriStyle[]).map((style) => (
            <option key={style} value={style}>
              {t(NAMES[style], { example: style === "own" ? "" : example(line, { ...s, hriFormat: style }).text })}
            </option>
          ))}
        </select>
      </div>
      {s.hriFormat !== "ai" && (
        <div>
          {label("opt-hri-titles", t("Data titles in"), "hriTitles")}
          <select id="opt-hri-titles" value={s.hriTitles} onChange={(e) => onChange({ hriTitles: e.target.value as HriFormatSettings["hriTitles"] })}>
            <option value="en">English</option>
            {Object.entries(SECOND_LANGUAGES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
      {s.hriFormat === "own" && (
        <div className="wide">
          {label("opt-hri-pattern", t("Format of my own"), "hriPattern")}
          <input
            id="opt-hri-pattern"
            className="mono"
            value={s.hriPattern}
            spellCheck={false}
            aria-invalid={shown.error ? true : undefined}
            aria-describedby="opt-hri-example"
            placeholder={HRI_PATTERNS.both}
            onChange={(e) => onChange({ hriPattern: e.target.value })}
          />
          <p className="hint">{t("{title}, {ai} and {value}; a date in a format of its own, such as {value:DD MMM YYYY}, is written without its AI (GS1 General Specifications, figure 4-9).")}</p>
        </div>
      )}
      {s.hriFormat === "own" && (
        <p id="opt-hri-example" className={shown.error ? "wide error" : "wide hint"} data-testid="hri-example">
          {shown.error ? shown.text : t("Example: {text}", { text: shown.text })}
        </p>
      )}
    </>
  );
}
