import { useState } from "react";
import {
  attributeByCode,
  attributeHint,
  attributesForKey,
  AttributeError,
  checkDigitProblem,
  checkKeyValue,
  exclusiveQualifiers,
  formatHint,
  aiEntry,
  identifierKeys,
  isKey,
  OTHER_KEYS,
  isDigitalLinkKey,
  normaliseKeyValue,
  parametersProblem,
  qualifiersOf,
  resolveDecimal,
  rowsOf,
  splitRows,
  type Identification,
} from "@gs1-label-studio/core";
import { AiCombo } from "./AiCombo.tsx";
import { aiText, byAi, KEY_TEXTS } from "./texts.ts";
import { t, tm } from "./i18n.ts";

// Step 1 of the editor, as the resolver's (ADR 0004): what the code identifies — a key, then its qualifiers and data
// attributes in one list (backlog 1.15, mock-up B of three, 30 October 2026) — or anything pasted, which fills the
// fields in.

interface Props {
  id: Identification;
  onChange: (id: Identification) => void;
  /** Recognises pasted text and returns its fields, or throws with the reason. */
  onPaste: (text: string) => Identification;
  /** The checked result: an error to show, or how many element strings were checked. */
  status: { error?: string; markup?: string; count?: number };
}

/** "(17) USE BY or EXPIRY", "17", "(17)" → "17"; "(310n) NET WEIGHT (kg)" → "310n" */
function attributeCode(text: string): string {
  const match = text.trim().match(/^\(?(\d{3}n|\d{2,4})\)?/i);
  return match ? match[1]!.toLowerCase() : "";
}

interface Row {
  ai: string;
  value: string;
  /** The AI field as typed. */
  typed: string;
}

function Markup({ text }: { text: string }) {
  return (
    <code className="markup">
      {text.split("|").map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))}
    </code>
  );
}

export function IdentifyCard({ id, onChange, onPaste, status }: Props) {
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  // The rows of qualifiers and attributes, in the order shown, with their AI fields as typed, so that a half-typed AI
  // is not lost while it does not yet name one.
  const [rows, setRows] = useState<Row[]>(() => rowsFor(id));

  const keyText = KEY_TEXTS[id.key];
  const keyProblem = id.value ? checkKeyValue(id.key, normaliseKeyValue(id.key, id.value)) : null;
  const ownQualifiers = qualifiersOf(id.key);
  const used = new Set(rows.map((row) => row.ai));
  // The AIs offered: the key's qualifiers not yet given first, then every attribute.
  const choices = [
    ...ownQualifiers.filter((ai) => !used.has(ai)).map((ai) => ({ value: label(ai), note: t("qualifier · in the URI's path") })),
    ...attributesForKey(id.key).map((a) => ({ value: aiText(a.ai, a.title), ...(a.elementStringOnly ? { note: t("element strings only") } : {}) })),
  ];

  function label(ai: string): string {
    const attribute = attributeByCode(ai);
    return ai ? aiText(ai, attribute?.title ?? aiEntry(ai)?.title) : "";
  }

  function rowsFor(identification: Identification): Row[] {
    return rowsOf(identification).map(([ai, value]) => ({ ai, value, typed: label(ai) }));
  }

  const setAll = (next: Row[]) => {
    setRows(next);
    onChange({ ...id, ...splitRows(id.key, next.map((row) => [row.ai, row.value] as const)) });
  };

  const move = (index: number, by: number) => {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    setAll(next);
  };

  function fill() {
    try {
      const fields = onPaste(pasted);
      setRows(rowsFor(fields));
      setPasteError(null);
      setPasted("");
    } catch (error) {
      setPasteError(tm(error instanceof Error ? error.message : String(error)));
    }
  }

  return (
    <section className="card" aria-labelledby="identify-title">
      <h2 id="identify-title">
        <span className="n">1</span> {t("What does the code identify?")}
      </h2>

      <div className="paste">
        <label htmlFor="paste">{t("Have the data already? Paste it")}</label>
        <div className="paste-row">
          <input
            id="paste"
            className="mono"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && fill()}
            placeholder={t("A GTIN, (01)…(10)…, a GS1 Digital Link URI or a scanner's output")}
            spellCheck={false}
          />
          <button type="button" className="btn" onClick={fill} disabled={!pasted.trim()}>
            {t("Fill in")}
          </button>
        </div>
        <div className={pasteError ? "hint error" : "hint"}>
          {pasteError ?? t("Fills in the fields below. A scanner's group separator can be written {GS}.", { GS: "{GS}" })}
        </div>
      </div>

      <label htmlFor="key">{t("Identifier type")}</label>
      <select
        id="key"
        value={id.key}
        onChange={(event) => {
          setRows([]);
          onChange({ key: event.target.value, value: "", qualifiers: {}, attributes: [], ...(id.parameters ? { parameters: id.parameters } : {}) });
        }}
      >
        {[true, false].map((digitalLink) => (
          <optgroup key={String(digitalLink)} label={digitalLink ? t("GS1 Digital Link keys") : t("In element strings only")}>
            {identifierKeys().filter((key) => isDigitalLinkKey(key) === digitalLink).sort(byAi).map((key) => (
              <option key={key} value={key}>
                {aiText(key, aiEntry(key)?.title)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <label htmlFor="key-value">{keyText ? t(keyText.label) : tm(aiEntry(id.key)?.title ?? "")}</label>
      <input
        id="key-value"
        className="mono"
        value={id.value}
        placeholder={keyText ? t(keyText.placeholder) : undefined}
        onChange={(event) => onChange({ ...id, value: event.target.value })}
        spellCheck={false}
        aria-invalid={Boolean(keyProblem)}
        aria-describedby="key-hint"
      />
      <div id="key-hint" className={keyProblem ? "hint error" : id.value ? "hint ok" : "hint"}>
        {keyProblem ? tm(keyProblem) : id.value ? t("✓ Valid identifier.") : keyText ? t(keyText.hint) : null}
      </div>

      <h3>
        {t("Qualifiers and data attributes")} <span className="opt">{t("— batch, serial, expiry, weight, price…")}</span>
      </h3>
      {rows.map(({ ai, value, typed }, index) => {
        const qualifier = ownQualifiers.includes(ai) && rows.findIndex((row) => row.ai === ai) === index;
        const attribute = ai && !qualifier ? attributeByCode(ai) : undefined;
        let converted: string | null = null;
        let problem: string | null = null;
        if (qualifier) {
          const others = ownQualifiers.filter((q) => q !== ai && rows.some((row) => row.ai === q && row.value.trim()) && exclusiveQualifiers(id.key, ai, q));
          if (others.length && value.trim()) {
            const names = others.map((q) => `(${q})`);
            problem = t("Not with {qualifiers}: the key takes one or the other.", { qualifiers: names.length > 1 ? t("{list} and {last}", { list: names.slice(0, -1).join(", "), last: names.at(-1)! }) : names[0]! });
          }
        } else if (ownQualifiers.includes(ai)) {
          problem = t("({ai}) is given already.", { ai });
        } else if (checkDigitProblem(ai, value)) {
          problem = tm(checkDigitProblem(ai, value) ?? "");
        } else if (attribute && value.trim()) {
          try {
            const [code, digits] = resolveDecimal(ai, value.trim());
            if (code !== ai || digits !== value.trim()) converted = t("→ In the code: ({code}) {digits}", { code, digits });
          } catch (error) {
            problem = tm(error instanceof AttributeError ? error.message : String(error));
          }
        }
        const hint = problem ?? (qualifier
          ? tm(formatHint(aiEntry(ai)?.components ?? []))
          : attribute ? [tm(attributeHint(attribute)), converted].filter(Boolean).join(" ") : ai ? "" : t("Pick from the list or type, e.g. 17"));
        return (
          <div className={qualifier ? "attr qualifier" : "attr"} key={index}>
            <div className="row">
              <AiCombo
                label={qualifier ? t("Qualifier (AI)") : t("Attribute (AI)")}
                placeholder={t("Pick from the list or type, e.g. 17")}
                // An AI chosen reads in the language shown, even when it was chosen in another
                value={ai && typed.startsWith(`(${ai})`) ? label(ai) : typed}
                options={choices}
                onChange={(text) => {
                  const next = [...rows];
                  next[index] = { ai: attributeCode(text), value, typed: text };
                  setAll(next);
                }}
              />
              <button type="button" className="ibtn" aria-label={t("Move up")} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                type="button"
                className="ibtn"
                aria-label={t("Move down")}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="ibtn"
                aria-label={qualifier ? t("Remove qualifier") : t("Remove attribute")}
                onClick={() => setAll(rows.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
            <span className="kind">
              {qualifier ? t("qualifier · in the URI's path") : !ai ? "" : isKey(ai) ? t("another key · in the URI's query string") : t("data attribute · in the query string")}
            </span>
            <input
              className="mono"
              {...(qualifier ? { id: `q-${ai}` } : {})}
              aria-label={qualifier ? t("{qualifier} value", { qualifier: label(ai) }) : t("Attribute value")}
              placeholder={t("Value")}
              value={value}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ai, value: event.target.value, typed };
                setAll(next);
              }}
              spellCheck={false}
              aria-invalid={Boolean(problem)}
            />
            <div className={problem ? "hint error" : "hint"}>{hint}</div>
          </div>
        );
      })}
      <div className="add add-rows">
        <button type="button" className="btn" onClick={() => setAll([...rows, { ai: "", value: "", typed: "" }])}>
          {t("+ Add attributes")}
        </button>
        {ownQualifiers.some((ai) => !used.has(ai)) && (
          <span className="hint">
            {t("or a qualifier of the {key}:", { key: keyText?.short ?? `(${id.key})` })}{" "}
            {ownQualifiers.filter((ai) => !used.has(ai)).map((ai) => (
              <button key={ai} type="button" className="link" onClick={() => setAll([...rows, { ai, value: "", typed: label(ai) }])}>
                + {label(ai)}
              </button>
            ))}
          </span>
        )}
      </div>
      {(OTHER_KEYS[id.key] ?? []).some(({ ais }) => ais.some((ai) => !used.has(ai))) && (
        <div className="hint other-keys">
          {t("Other keys with the {key} (GS1 General Specifications 4.13):", { key: keyText?.short ?? `(${id.key})` })}{" "}
          {(OTHER_KEYS[id.key] ?? []).filter(({ ais }) => ais.some((ai) => !used.has(ai))).map(({ ais, what }) => (
            <button
              key={ais.join("+")}
              type="button"
              className="link"
              title={tm(what)}
              onClick={() => setAll([...rows, ...ais.filter((ai) => !used.has(ai)).map((ai) => ({ ai, value: "", typed: label(ai) }))])}
            >
              + {ais.map((ai) => `(${ai})`).join(t(" and "))} {tm(what)}
            </button>
          ))}
        </div>
      )}
      {ownQualifiers.length > 0 && (
        <div className="hint">{t("Qualifiers go to the GS1 Digital Link URI's path in the order its syntax asks, whatever their order here.")}</div>
      )}

      <h3>
        {t("Parameters of the URI")} <span className="opt">{t("— your own, not GS1: campaign, language, version…")}</span>
      </h3>
      {(id.parameters ?? []).map(([name, value], index) => {
        const parameters = id.parameters ?? [];
        const set = (next: [string, string]) => onChange({ ...id, parameters: parameters.map((p, i) => (i === index ? next : p)) });
        // This row's own fault: no name, digits only, or a name an earlier row has
        const problem = !name && !value ? null : parametersProblem([[name, value]]);
        const own = problem ? tm(problem)
          : !name && !value ? null
          : parameters.slice(0, index).some(([n]) => n.trim() === name.trim()) ? t("The parameter \"{name}\" is given twice.", { name: name.trim() }) : null;
        return (
          <div className="param" key={index}>
            <input className="mono" aria-label={t("Parameter name")} placeholder={t("name")} value={name} spellCheck={false}
              aria-invalid={Boolean(own)} onChange={(event) => set([event.target.value, value])} />
            <span>=</span>
            <input className="mono" aria-label={t("Parameter value")} placeholder={t("value")} value={value} spellCheck={false}
              onChange={(event) => set([name, event.target.value])} />
            <button type="button" className="ibtn" aria-label={t("Remove parameter")}
              onClick={() => onChange({ ...id, parameters: parameters.filter((_, i) => i !== index) })}>
              ×
            </button>
            {own && <div className="hint error">{own}</div>}
          </div>
        );
      })}
      <div className="add">
        <button type="button" className="btn" onClick={() => onChange({ ...id, parameters: [...(id.parameters ?? []), ["", ""]] })}>
          {t("+ Add parameter")}
        </button>
      </div>
      <div className="hint">
        {t("After the data attributes in the GS1 Digital Link URI's query string, as name=value; a name of digits only is an AI, so it is refused here. Element strings have no place for them.")}
      </div>

      <div className={status.error ? "status error" : "status ok"} aria-live="polite">
        {status.error ? (
          <>
            {tm(status.error)}
            {status.markup && (
              <>
                {" "}
                <Markup text={status.markup} />
              </>
            )}
          </>
        ) : status.count ? (
          status.count === 1 ? t("✓ Checked by the GS1 Barcode Syntax Engine: 1 element string.") : t("✓ Checked by the GS1 Barcode Syntax Engine: {n} element strings.", { n: status.count })
        ) : null}
      </div>
    </section>
  );
}
