import { useState } from "react";
import {
  attributeByCode,
  attributeHint,
  attributesForKey,
  AttributeError,
  checkKeyValue,
  COMMON_ATTRIBUTES,
  exclusiveQualifiers,
  formatHint,
  aiEntry,
  normaliseKeyValue,
  primaryKeys,
  qualifiersOf,
  resolveDecimal,
  type Identification,
} from "@gs1-label-studio/core";
import { KEY_TEXTS, QUALIFIER_LABELS } from "./texts.ts";

// Step 1 of the editor, as the resolver's (ADR 0004): what the code identifies — a key, its qualifiers, data
// attributes — or anything pasted, which fills the fields in.

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
  // The AI fields as typed, so that a half-typed AI is not lost while it does not yet name one.
  const [typedAis, setTypedAis] = useState<string[]>(id.attributes.map(([ai]) => label(ai)));

  const keyText = KEY_TEXTS[id.key];
  const keyProblem = id.value ? checkKeyValue(id.key, normaliseKeyValue(id.key, id.value)) : null;
  const qualifiers = qualifiersOf(id.key);
  const offered = attributesForKey(id.key);
  const common = COMMON_ATTRIBUTES.map((code) => offered.find((a) => a.ai === code)).filter((a) => a !== undefined);

  function label(ai: string): string {
    const attribute = attributeByCode(ai);
    return attribute ? `(${ai}) ${attribute.title}` : ai ? `(${ai}) ${aiEntry(ai)?.title ?? ""}`.trim() : "";
  }

  const setAttributes = (attributes: [string, string][], typed: string[]) => {
    setTypedAis(typed);
    onChange({ ...id, attributes });
  };

  const move = (index: number, by: number) => {
    const attributes = [...id.attributes];
    const typed = [...typedAis];
    [attributes[index], attributes[index + by]] = [attributes[index + by]!, attributes[index]!];
    [typed[index], typed[index + by]] = [typed[index + by]!, typed[index]!];
    setAttributes(attributes, typed);
  };

  function fill() {
    try {
      const fields = onPaste(pasted);
      setTypedAis(fields.attributes.map(([ai]) => label(ai)));
      setPasteError(null);
      setPasted("");
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="card" aria-labelledby="identify-title">
      <h2 id="identify-title">
        <span className="n">1</span> What does the code identify?
      </h2>

      <div className="paste">
        <label htmlFor="paste">Have the data already? Paste it</label>
        <div className="paste-row">
          <input
            id="paste"
            className="mono"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && fill()}
            placeholder="A GTIN, (01)…(10)…, a GS1 Digital Link URI or a scanner's output"
            spellCheck={false}
          />
          <button type="button" className="btn" onClick={fill} disabled={!pasted.trim()}>
            Fill in
          </button>
        </div>
        <div className={pasteError ? "hint error" : "hint"}>
          {pasteError ?? "Fills in the fields below. A scanner's group separator can be written {GS}."}
        </div>
      </div>

      <label htmlFor="key">Identifier type</label>
      <select
        id="key"
        value={id.key}
        onChange={(event) => {
          setTypedAis([]);
          onChange({ key: event.target.value, value: "", qualifiers: {}, attributes: [] });
        }}
      >
        {primaryKeys().map((key) => (
          <option key={key} value={key}>
            {KEY_TEXTS[key]?.name ?? `${aiEntry(key)?.title} (${key})`}
          </option>
        ))}
      </select>

      <label htmlFor="key-value">{keyText?.label ?? aiEntry(id.key)?.title}</label>
      <input
        id="key-value"
        className="mono"
        value={id.value}
        placeholder={keyText?.placeholder}
        onChange={(event) => onChange({ ...id, value: event.target.value })}
        spellCheck={false}
        aria-invalid={Boolean(keyProblem)}
        aria-describedby="key-hint"
      />
      <div id="key-hint" className={keyProblem ? "hint error" : id.value ? "hint ok" : "hint"}>
        {keyProblem ?? (id.value ? "✓ Valid identifier." : keyText?.hint)}
      </div>

      {qualifiers.length > 0 && (
        <>
          <h3>
            Qualifiers <span className="opt">— narrow the code to one variant, batch or unit</span>
          </h3>
          <div className="qual">
            {qualifiers.map((ai) => {
              const blockedBy = qualifiers.find((other) => other !== ai && id.qualifiers[other] && exclusiveQualifiers(id.key, ai, other));
              return (
                <div key={ai}>
                  <label htmlFor={`q-${ai}`}>
                    {QUALIFIER_LABELS[ai] ?? `${aiEntry(ai)?.title} (${ai})`} <span className="opt">optional</span>
                  </label>
                  <input
                    id={`q-${ai}`}
                    className="mono"
                    value={id.qualifiers[ai] ?? ""}
                    disabled={Boolean(blockedBy)}
                    onChange={(event) => onChange({ ...id, qualifiers: { ...id.qualifiers, [ai]: event.target.value } })}
                    spellCheck={false}
                  />
                  <div className="hint">
                    {blockedBy ? `Not with (${blockedBy})` : formatHint(aiEntry(ai)?.components ?? [])}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3>
        Data attributes <span className="opt">— expiry, weight, price…</span>
      </h3>
      <datalist id="attribute-list">
        {[...common, ...offered.filter((a) => !common.includes(a))].map((a) => (
          <option key={a.ai} value={`(${a.ai}) ${a.title}`} />
        ))}
      </datalist>
      {id.attributes.map(([ai, value], index) => {
        const attribute = ai ? attributeByCode(ai) : undefined;
        let converted: string | null = null;
        let problem: string | null = null;
        if (attribute && value.trim()) {
          try {
            const [code, digits] = resolveDecimal(ai, value.trim());
            if (code !== ai || digits !== value.trim()) converted = `→ In the code: (${code}) ${digits}`;
          } catch (error) {
            problem = error instanceof AttributeError ? error.message : String(error);
          }
        }
        const hint = problem ?? (attribute ? [attributeHint(attribute), converted].filter(Boolean).join(" ") : ai ? "" : "Pick from the list or type, e.g. 17");
        return (
          <div className="attr" key={index}>
            <div className="row">
              <input
                list="attribute-list"
                aria-label="Attribute (AI)"
                placeholder="Pick from the list or type, e.g. 17"
                value={typedAis[index] ?? label(ai)}
                onChange={(event) => {
                  const typed = [...typedAis];
                  typed[index] = event.target.value;
                  const attributes = [...id.attributes];
                  attributes[index] = [attributeCode(event.target.value), value];
                  setAttributes(attributes, typed);
                }}
              />
              <button type="button" className="ibtn" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                type="button"
                className="ibtn"
                aria-label="Move down"
                disabled={index === id.attributes.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="ibtn"
                aria-label="Remove attribute"
                onClick={() =>
                  setAttributes(id.attributes.filter((_, i) => i !== index), typedAis.filter((_, i) => i !== index))
                }
              >
                ×
              </button>
            </div>
            <input
              className="mono"
              aria-label="Attribute value"
              placeholder="Value"
              value={value}
              onChange={(event) => {
                const attributes = [...id.attributes];
                attributes[index] = [ai, event.target.value];
                setAttributes(attributes, typedAis);
              }}
              spellCheck={false}
            />
            <div className={problem ? "hint error" : "hint"}>{hint}</div>
          </div>
        );
      })}
      <div className="add">
        <button type="button" className="btn" onClick={() => setAttributes([...id.attributes, ["", ""]], [...typedAis, ""])}>
          + Add attribute
        </button>
      </div>

      <div className={status.error ? "status error" : "status ok"} aria-live="polite">
        {status.error ? (
          <>
            {status.error}
            {status.markup && (
              <>
                {" "}
                <Markup text={status.markup} />
              </>
            )}
          </>
        ) : status.count ? (
          `✓ Checked by the GS1 Barcode Syntax Engine: ${status.count} element string${status.count === 1 ? "" : "s"}.`
        ) : null}
      </div>
    </section>
  );
}
