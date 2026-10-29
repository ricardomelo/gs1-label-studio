import {
  QUESTIONS,
  SPEC_SYMBOL_NAMES,
  type Guidance,
  type QuestionId,
  type SpecSymbol,
  type SymbolSpecification,
  type SymbologyId,
  type Walk,
} from "@gs1-label-studio/core";
import { BY_KEY, GUIDE_TEXTS, KEY_TEXTS } from "./texts.ts";

// Step 2 of the editor (backlog 1.2, mock-up B approved on 29 October 2026): where the code is scanned, asked as the
// GS1 General Specifications' decision tree asks it (figure 5-68), then the symbols its table allows for this data,
// the recommended one first. The label (step 3) draws the symbol chosen here.

/** A symbol alone, or an EAN/UPC with a 2D symbol beside it (`with`). */
export interface Choice {
  symbol: SymbologyId;
  with?: SymbologyId;
}

export interface PickItem {
  key: string;
  group: "recommended" | "allowed" | "in-addition";
  name: string;
  meta: string;
  tag?: "recommended" | "in-addition" | "coming" | "not-offered";
  /** Undefined: shown, not selectable. */
  choice?: Choice;
}

const EAN_UPC: SpecSymbol[] = ["ean13", "upca", "ean8", "upce"];
const mm = (value: number) => value.toFixed(3);

/** A row of the table in a few words: the X-dimension, the bars' height, the quiet zones. */
export function specText(spec: SymbolSpecification): string {
  const [low, target, high] = spec.x;
  const parts = [`X ${mm(low)}–${mm(high)} mm${target === null ? "" : ` (target ${mm(target)})`}`];
  if (spec.height) parts.push(`bars at least ${spec.height[1].toFixed(2)} mm high${target === null ? "" : " at the target"}`);
  if (typeof spec.quietZone === "number") parts.push(`quiet zone ${spec.quietZone}X on all four sides`);
  else if (spec.quietZone[0] || spec.quietZone[1]) parts.push(`quiet zones ${spec.quietZone[0]}X and ${spec.quietZone[1]}X`);
  return `${spec.part ? `${spec.part[0]!.toUpperCase()}${spec.part.slice(1)}: ` : ""}${parts.join("; ")}`;
}

const same = (a: Choice | null | undefined, b: Choice | null | undefined) =>
  Boolean(a && b && a.symbol === b.symbol && a.with === b.with);

/** The symbols of the guidance as the step lists them: recommended, also allowed, only in addition. */
export function pickList(guide: Guidance): PickItem[] {
  const items: PickItem[] = [];
  const option = (symbol: SpecSymbol) => guide.options.find((o) => o.symbol === symbol);
  const specsOf = (symbol: SpecSymbol) => option(symbol)?.specs.map(specText).join(". ") ?? "";
  const { recommended } = guide;
  if (recommended) {
    const name = recommended.with
      ? `${SPEC_SYMBOL_NAMES[recommended.symbol]}, with a ${SPEC_SYMBOL_NAMES[recommended.with]} beside it`
      : SPEC_SYMBOL_NAMES[recommended.symbol];
    const meta = recommended.with
      ? `The ${SPEC_SYMBOL_NAMES[recommended.symbol]} carries the GTIN; the ${SPEC_SYMBOL_NAMES[recommended.with]} carries ` +
        `everything. ${SPEC_SYMBOL_NAMES[recommended.symbol]}: ${specsOf(recommended.symbol)}. ` +
        `${SPEC_SYMBOL_NAMES[recommended.with]}: ${specsOf(recommended.with)}.`
      : `${specsOf(recommended.symbol)}.`;
    items.push({ key: "recommended", group: "recommended", name, meta, tag: "recommended", choice: recommended });
  }
  const gtinCarrier = guide.options.find(
    (o) => o.role === "carrier" && EAN_UPC.includes(o.symbol) && o.carries !== "no",
  );
  for (const o of guide.options) {
    if (o.carries === "no") continue;
    const meta = `${o.carries === "key" ? `${GUIDE_TEXTS.gtinAlone} ` : ""}${o.specs.map(specText).join(". ")}.`;
    if (o.role !== "in-addition") {
      const choice: Choice = { symbol: o.symbol as SymbologyId };
      if (same(choice, recommended)) continue;
      if (!o.drawn) items.push({ key: o.symbol, group: "allowed", name: o.name, meta: `${meta} ${GUIDE_TEXTS.notDrawn}`, tag: "coming" });
      else if (o.symbol === "gs1-qrcode") items.push({ key: o.symbol, group: "allowed", name: o.name, meta: GUIDE_TEXTS.notOffered, tag: "not-offered" });
      else items.push({ key: o.symbol, group: "allowed", name: o.carries === "key" && recommended?.with ? `${o.name} alone` : o.name, meta, choice });
      continue;
    }
    // In addition: beside an EAN/UPC, which the label lays out; otherwise named only.
    const usable = o.drawn && o.symbol !== "gs1-qrcode";
    if (usable && gtinCarrier) {
      const choice: Choice = { symbol: gtinCarrier.symbol as SymbologyId, with: o.symbol as SymbologyId };
      if (same(choice, recommended)) continue;
      items.push({
        key: `with-${o.symbol}`, group: "in-addition", name: `${gtinCarrier.name}, with a ${o.name} beside it`, meta,
        tag: "in-addition", choice,
      });
    } else {
      items.push({
        key: o.symbol, group: "in-addition", name: o.name,
        meta: usable ? `${meta} ${GUIDE_TEXTS.oneSymbol}` : o.symbol === "gs1-qrcode" ? GUIDE_TEXTS.notOffered : meta,
        tag: !o.drawn ? "coming" : usable ? "in-addition" : "not-offered",
      });
    }
  }
  return items;
}

/** The choice to draw: the one picked if the list still offers it, else the recommended one. */
export function chosen(guide: Guidance, picked: Choice | null): Choice | null {
  const offered = pickList(guide).flatMap((item) => (item.choice ? [item.choice] : []));
  return offered.find((c) => same(c, picked)) ?? guide.recommended;
}

const TAGS: Record<NonNullable<PickItem["tag"]>, string> = {
  recommended: "Recommended",
  "in-addition": "In addition",
  coming: "Not drawn",
  "not-offered": "Not offered",
};

const GROUPS: Record<PickItem["group"], string> = {
  recommended: "Recommended for this data",
  allowed: "Also allowed",
  "in-addition": "Only in addition to one of the above",
};

interface Props {
  identifierKey: string;
  walked: Walk;
  guide: Guidance | null;
  /** Why there is no guidance at the leaf: the data of step 1 is not valid yet. */
  dataError?: string;
  answers: Partial<Record<QuestionId, boolean>>;
  onAnswer: (question: QuestionId, answer: boolean) => void;
  choice: Choice | null;
  onPick: (choice: Choice) => void;
  expert: boolean;
  onExpert: (expert: boolean) => void;
}

function YesNo({ question, value, onAnswer }: { question: QuestionId; value?: boolean; onAnswer: Props["onAnswer"] }) {
  return (
    <span className="yn" role="group" aria-label={QUESTIONS[question].text}>
      <button type="button" aria-pressed={value === true} onClick={() => onAnswer(question, true)}>
        Yes
      </button>
      <button type="button" aria-pressed={value === false} onClick={() => onAnswer(question, false)}>
        No
      </button>
    </span>
  );
}

export function ScanCard({ identifierKey, walked, guide, dataError, answers, onAnswer, choice, onPick, expert, onExpert }: Props) {
  const byKey = walked.steps.filter((s) => s.byKey).map((s) => BY_KEY[`${s.question}:${s.answer}`]).filter(Boolean);
  const asked = walked.steps.filter((s) => !s.byKey).map((s) => s.question as QuestionId);
  const short = KEY_TEXTS[identifierKey]?.short ?? "key";
  const items = guide ? pickList(guide) : [];
  const table = walked.leaf?.table;

  return (
    <section className="card" aria-labelledby="scan-title">
      <h2 id="scan-title">
        <span className="n">2</span> Where is it scanned?
      </h2>
      {expert ? (
        <p className="hint">
          {GUIDE_TEXTS.expert}{" "}
          <button type="button" className="link" onClick={() => onExpert(false)}>
            Back to the guided choice
          </button>
        </p>
      ) : (
        <>
          {byKey.length > 0 && (
            <p className="hint by-key">
              The {short} already answers {byKey.length === 1 ? "one question" : `${byKey.length} questions`} of the tree:{" "}
              {byKey.join("; ")}.
            </p>
          )}
          <div className="ask">
            {[...asked, ...(walked.next ? [walked.next] : [])].map((question) => (
              <div key={question} className={question === walked.next ? "ask-row next" : "ask-row"}>
                <span>
                  {QUESTIONS[question].text}
                  <small>{QUESTIONS[question].help}</small>
                </span>
                <YesNo question={question} value={answers[question]} onAnswer={onAnswer} />
              </div>
            ))}
          </div>
          {walked.next && <p className="hint">{GUIDE_TEXTS.answer}</p>}
          {walked.leaf && table && (
            <div className="table-box">
              <b>Symbol specification table {table}</b> — {walked.leaf.application.toLowerCase()}.
              <span>
                GS1 General Specifications 26.0: decision tree (figure 5-68), section 5.12.3.{table}; carrier choices{" "}
                {walked.leaf.sections}.
              </span>
            </div>
          )}
          {walked.leaf && !guide && <p className="hint error">{dataError ?? GUIDE_TEXTS.fixData}</p>}
          {guide && !guide.recommended && (
            <p className="hint error">
              {guide.together
                ? `${GUIDE_TEXTS.together} ${SPEC_SYMBOL_NAMES[guide.together.symbol]} with a ` +
                  `${SPEC_SYMBOL_NAMES[guide.together.with]} beside it. ${GUIDE_TEXTS.togetherLater}`
                : guide.waiting
                  ? `${GUIDE_TEXTS.waiting} ${SPEC_SYMBOL_NAMES[guide.waiting]}. ${GUIDE_TEXTS.notDrawn}`
                  : GUIDE_TEXTS.nothing}
            </p>
          )}
          {(["recommended", "allowed", "in-addition"] as const).map((group) => {
            const list = items.filter((item) => item.group === group);
            if (!list.length) return null;
            return (
              <div key={group} role="radiogroup" aria-label={GROUPS[group]}>
                <div className="pick-group">{GROUPS[group]}</div>
                {list.map((item) => {
                  const selected = same(item.choice, choice);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!item.choice}
                      className={selected ? "pick selected" : "pick"}
                      onClick={() => item.choice && onPick(item.choice)}
                    >
                      <span className="dot" aria-hidden="true" />
                      <span className="name">
                        {item.name}
                        {item.tag && <span className={`tag ${item.tag}`}>{TAGS[item.tag]}</span>}
                      </span>
                      <span className="meta">{item.meta}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {guide && guide.options.some((o) => o.carries === "no") && (
            <p className="hint">
              Not for this data:{" "}
              {guide.options
                .filter((o) => o.carries === "no")
                .map((o) => `${o.name} (${o.reason})`)
                .join("; ")}
              .
            </p>
          )}
          <p className="hint">
            <button type="button" className="link" onClick={() => onExpert(true)}>
              Choose a symbol yourself
            </button>{" "}
            — {GUIDE_TEXTS.expertOffer}
          </p>
        </>
      )}
    </section>
  );
}
