import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  assistantOutcome,
  assistantQuestion,
  assistantSteps,
  readNeed,
  type AssistantAnswers,
  type AssistantOutcome,
  type AssistantStep,
} from "@gs1-label-studio/core";
import { KEY_TEXTS } from "./texts.ts";
import { t, tm } from "./i18n.ts";

// The assistant for first-time users (backlog 6.10, ADR 0006; mock-up A of two, 13 November 2026): a dialog, one
// question per screen (the whole screen on a phone), large cards and a line saying why each question is asked; a need
// written in one's own words read by keywords (readNeed, offline); then a summary of what is set up, what is still the
// person's to type and the rules for the artwork, before the editor's steps are filled in.

/** Simple line drawings for the first screen's cards: an emoji differs from one system to the next. */
const ICONS: Record<string, ReactNode> = {
  product: <path d="M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" />,
  healthcare: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  case: <path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" />,
  pallet: <path d="M4 4h16v10H4zM2 17h20M5 17v3M12 17v3M19 17v3" />,
  other: <path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01" />,
};

/** What the person still has to type: the key's example and the data's, all of them or those left (`ais`). */
export function examplesText(outcome: AssistantOutcome, answers: AssistantAnswers, ais: readonly string[] = outcome.examples): string {
  const keyAi = outcome.identification.key;
  const key = KEY_TEXTS[keyAi];
  const data = assistantQuestion("data", answers).options.filter((o) => ais.includes(o.value)).map((o) => tm(o.text));
  return [...(ais.includes(keyAi) ? [key ? t(key.short) : keyAi] : []), ...data].join(", ");
}

/** The answers in a line, each as its option reads: "A product I sell · In shops · Batch or lot · No · …". */
export function answersText(answers: AssistantAnswers): string {
  const parts: string[] = [];
  for (const step of assistantSteps(answers)) {
    const options = assistantQuestion(step, answers).options;
    const value = valueOf(step, answers);
    if (Array.isArray(value)) {
      const chosen = options.filter((o) => value.includes(o.value)).map((o) => tm(o.text));
      parts.push(chosen.length ? chosen.join(", ") : t("no lot, date or serial number"));
    } else {
      const option = options.find((o) => o.value === value);
      if (option) parts.push(tm(option.text));
    }
  }
  return parts.join(" · ");
}

function valueOf(step: AssistantStep, a: AssistantAnswers): string | string[] | undefined {
  switch (step) {
    case "scenario": return a.scenario;
    case "sold": return a.sold;
    case "data": return a.data;
    case "web": return a.web;
    case "care": return a.care;
    case "case-till": return a.caseTill;
    case "other-key": return a.other;
    case "dpm": return a.dpm;
    case "far": return a.far;
    case "print": return a.print;
  }
}

function answer(step: AssistantStep, a: AssistantAnswers, value: string): AssistantAnswers {
  switch (step) {
    // A new scenario starts its questions afresh; what to print with is kept
    case "scenario": return value === a.scenario ? a : { scenario: value as AssistantAnswers["scenario"], ...(a.print ? { print: a.print } : {}) };
    case "sold": return { ...a, sold: value as AssistantAnswers["sold"] };
    case "data": {
      const data = a.data ?? [];
      return { ...a, data: data.includes(value) ? data.filter((ai) => ai !== value) : [...data, value] };
    }
    case "web": return { ...a, web: value as AssistantAnswers["web"] };
    case "care": return { ...a, care: value as AssistantAnswers["care"] };
    case "case-till": return { ...a, caseTill: value as AssistantAnswers["caseTill"] };
    case "other-key": return { ...a, other: value as AssistantAnswers["other"] };
    case "dpm": return { ...a, dpm: value as AssistantAnswers["dpm"] };
    case "far": return { ...a, far: value as AssistantAnswers["far"] };
    case "print": return { ...a, print: value as AssistantAnswers["print"] };
  }
}

interface Props {
  /** The answers to start from: the last ones, to see the summary again, or none. */
  initial: AssistantAnswers;
  /** Open at the summary rather than at the first question. */
  atSummary: boolean;
  /** The symbols step 2 will draw for an outcome, by name: "EAN-13 with a QR code (GS1 Digital Link) beside it". */
  symbolsOf: (outcome: AssistantOutcome) => string;
  onApply: (answers: AssistantAnswers, outcome: AssistantOutcome) => void;
  onClose: () => void;
}

export function Assistant({ initial, atSummary, symbolsOf, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState<AssistantAnswers>(initial);
  const [said, setSaid] = useState("");
  const steps = assistantSteps(answers);
  const [index, setIndex] = useState(atSummary && assistantOutcome(initial) ? steps.length : 0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current!;
    if (!element.open) element.showModal();
    return () => element.close();
  }, []);
  // Each screen's question takes the focus, so that a keyboard and a screen reader start from it
  useEffect(() => heading.current?.focus(), [index]);

  const step = steps[index];
  const outcome = index >= steps.length ? assistantOutcome(answers) : null;
  const total = steps.length;
  const question = step ? assistantQuestion(step, answers) : null;
  const value = step ? valueOf(step, answers) : undefined;
  const answered = step === "data" ? true : value !== undefined && (step !== "web" || value !== "own" || Boolean(answers.domain?.trim()));
  const found = said.trim() ? readNeed(said) : {};

  function onSay(text: string) {
    setSaid(text);
    const read = readNeed(text);
    if (read.scenario) setAnswers({ ...read, ...(answers.domain ? { domain: answers.domain } : {}) });
  }
  function next() {
    if (step === "data" && answers.data === undefined) setAnswers({ ...answers, data: [] });
    setIndex(index + 1);
  }
  function again() {
    setAnswers({});
    setSaid("");
    setIndex(0);
  }

  return (
    <dialog
      ref={dialog}
      className="assistant"
      aria-labelledby="assistant-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="assistant-top">
        <b>{outcome ? t("Assistant · ready") : t("Assistant · {n} of {total}", { n: index + 1, total })}</b>
        <button type="button" className="close" aria-label={t("Close")} title={t("Close")} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="assistant-progress" aria-hidden="true">
        {steps.map((s, i) => (
          <i key={s} className={i <= index ? "on" : ""} />
        ))}
      </div>
      {question && step && (
        <>
          <h3 id="assistant-title" ref={heading} tabIndex={-1}>
            {tm(question.text)}
          </h3>
          <p className="sub">{tm(question.help)}</p>
          <div className="assistant-cards" role={question.multiple ? "group" : "radiogroup"} aria-labelledby="assistant-title">
            {question.options.map((option) => {
              const chosen = Array.isArray(value) ? value.includes(option.value) : value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role={question.multiple ? "checkbox" : "radio"}
                  aria-checked={chosen}
                  className={chosen ? "assistant-card picked" : "assistant-card"}
                  onClick={() => setAnswers(answer(step, answers, option.value))}
                >
                  {step === "scenario" && (
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {ICONS[option.value]}
                    </svg>
                  )}
                  {question.multiple && <span className={chosen ? "tick on" : "tick"} aria-hidden="true" />}
                  <span>
                    <b>{tm(option.text)}</b>
                    <small>{tm(option.help)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {step === "scenario" && (
            <>
              <div className="assistant-or">{t("or describe it in your own words")}</div>
              <input
                className="assistant-say"
                aria-label={t("Describe what you need")}
                placeholder={t("e.g. a QR code with my website on the product I sell in shops")}
                value={said}
                onChange={(e) => onSay(e.target.value)}
              />
              {said.trim() && (
                <p className="assistant-found" role="status">
                  {found.scenario ? (
                    <>
                      {t("Understood as follows; check it on the next screens:")}{" "}
                      {answersText(found).split(" · ").map((part) => (
                        <span key={part} className="chip">
                          {part}
                        </span>
                      ))}
                    </>
                  ) : (
                    t("No word I know yet: choose one of the cards.")
                  )}
                </p>
              )}
            </>
          )}
          {step === "web" && answers.web === "own" && (
            <>
              <label htmlFor="assistant-domain">{t("Your website's domain")}</label>
              <input
                id="assistant-domain"
                className="assistant-say"
                inputMode="url"
                placeholder="https://www.example.com"
                value={answers.domain ?? ""}
                onChange={(e) => setAnswers({ ...answers, domain: e.target.value })}
              />
            </>
          )}
          {question.why && (
            <p className="assistant-why">
              <b>{t("Why we ask:")}</b> {tm(question.why)}
            </p>
          )}
          <div className="assistant-foot">
            {index === 0 ? (
              // A button as plain as Continue, not a link (the owner, 14 November 2026: too discreet on a phone)
              <button type="button" className="btn assistant-skip" onClick={onClose}>
                {t("I know what I want: go to the editor")}
              </button>
            ) : (
              <span />
            )}
            <span className="assistant-buttons">
              {index > 0 && (
                <button type="button" className="btn" onClick={() => setIndex(index - 1)}>
                  {t("Back")}
                </button>
              )}
              <button type="button" className="btn primary" disabled={!answered} onClick={next}>
                {step === "print" ? t("See the result") : t("Continue")}
              </button>
            </span>
          </div>
        </>
      )}
      {outcome && (
        <>
          <h3 id="assistant-title" ref={heading} tabIndex={-1}>
            {t("Ready: {symbols}", { symbols: symbolsOf(outcome) })}
          </h3>
          <p className="sub">{answersText(answers)}</p>
          <div className="assistant-summary">
            <div>
              <h4>{t("Still yours to type")}</h4>
              <p className="assistant-todo">
                {t("The example values are only for trying the studio. Replace them with yours: {fields}.", { fields: examplesText(outcome, answers) })}
              </p>
              {outcome.stem && (
                <p>
                  {t("Domain in the GS1 Digital Link URI")}: <b className="mono">{outcome.stem}</b>
                </p>
              )}
            </div>
            <div>
              <h4>{t("Rules to follow")}</h4>
              <ul>
                {outcome.rules.map((rule) => (
                  <li key={rule.text}>
                    {tm(rule.text)}
                    {rule.section && <cite> {t("(General Specifications {section})", { section: rule.section })}</cite>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="assistant-foot">
            <button type="button" className="link" onClick={again}>
              {t("Start the answers again")}
            </button>
            <span className="assistant-buttons">
              <button type="button" className="btn" onClick={() => setIndex(steps.length - 1)}>
                {t("Back")}
              </button>
              <button type="button" className="btn primary" onClick={() => onApply(answers, outcome)}>
                {t("Fill in my data")}
              </button>
            </span>
          </div>
        </>
      )}
    </dialog>
  );
}
