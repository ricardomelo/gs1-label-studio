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
import { en, formatNumber, t, tm } from "./i18n.ts";

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
const mm = (value: number) => formatNumber(value, 3);
const NAME = (symbol: SpecSymbol) => tm(SPEC_SYMBOL_NAMES[symbol]);

/** A row of the table in a few words: the X-dimension, the bars' height, the quiet zones. */
export function specText(spec: SymbolSpecification): string {
  const [low, target, high] = spec.x;
  const parts = [target === null
    ? t("X {low}–{high} mm", { low: mm(low), high: mm(high) })
    : t("X {low}–{high} mm (target {target})", { low: mm(low), high: mm(high), target: mm(target) })];
  if (spec.height) {
    const h = formatNumber(spec.height[1], 2);
    parts.push(target === null ? t("bars at least {h} mm high", { h }) : t("bars at least {h} mm high at the target", { h }));
  }
  if (typeof spec.quietZone === "number") parts.push(t("quiet zone {n}X on all four sides", { n: spec.quietZone }));
  else if (spec.quietZone[0] || spec.quietZone[1]) parts.push(t("quiet zones {a}X and {b}X", { a: spec.quietZone[0], b: spec.quietZone[1] }));
  const part = spec.part ? tm(spec.part) : "";
  return `${part ? `${part[0]!.toUpperCase()}${part.slice(1)}: ` : ""}${parts.join("; ")}`;
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
      ? t("{symbol}, with a {beside} beside it", { symbol: NAME(recommended.symbol), beside: NAME(recommended.with) })
      : NAME(recommended.symbol);
    const meta = recommended.with
      ? t("The {symbol} carries the GTIN; the {beside} carries everything.", { symbol: NAME(recommended.symbol), beside: NAME(recommended.with) }) +
        ` ${NAME(recommended.symbol)}: ${specsOf(recommended.symbol)}. ` +
        `${NAME(recommended.with)}: ${specsOf(recommended.with)}.`
      : `${specsOf(recommended.symbol)}.`;
    items.push({ key: "recommended", group: "recommended", name, meta, tag: "recommended", choice: recommended });
  }
  const gtinCarrier = guide.options.find(
    (o) => o.role === "carrier" && EAN_UPC.includes(o.symbol) && o.carries !== "no",
  );
  for (const o of guide.options) {
    if (o.carries === "no") continue;
    const meta = `${o.carries === "key" ? `${t(GUIDE_TEXTS.gtinAlone)} ` : ""}${o.specs.map(specText).join(". ")}.`;
    const oName = tm(o.name);
    if (o.role !== "in-addition") {
      const choice: Choice = { symbol: o.symbol as SymbologyId };
      if (same(choice, recommended)) continue;
      if (!o.drawn) items.push({ key: o.symbol, group: "allowed", name: oName, meta: `${meta} ${t(GUIDE_TEXTS.notDrawn)}`, tag: "coming" });
      else if (o.symbol === "gs1-qrcode") items.push({ key: o.symbol, group: "allowed", name: oName, meta: t(GUIDE_TEXTS.notOffered), tag: "not-offered" });
      else items.push({ key: o.symbol, group: "allowed", name: o.carries === "key" && recommended?.with ? t("{symbol} alone", { symbol: oName }) : oName, meta, choice });
      continue;
    }
    // In addition: beside an EAN/UPC, which the label lays out; otherwise named only.
    const usable = o.drawn && o.symbol !== "gs1-qrcode";
    if (usable && gtinCarrier) {
      const choice: Choice = { symbol: gtinCarrier.symbol as SymbologyId, with: o.symbol as SymbologyId };
      if (same(choice, recommended)) continue;
      items.push({
        key: `with-${o.symbol}`, group: "in-addition", name: t("{symbol}, with a {beside} beside it", { symbol: tm(gtinCarrier.name), beside: oName }), meta,
        tag: "in-addition", choice,
      });
    } else {
      items.push({
        key: o.symbol, group: "in-addition", name: oName,
        meta: usable ? `${meta} ${t(GUIDE_TEXTS.oneSymbol)}` : o.symbol === "gs1-qrcode" ? t(GUIDE_TEXTS.notOffered) : meta,
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
  recommended: en("Recommended"),
  "in-addition": en("In addition"),
  coming: en("Not drawn"),
  "not-offered": en("Not offered"),
};

const GROUPS: Record<PickItem["group"], string> = {
  recommended: en("Recommended for this data"),
  allowed: en("Also allowed"),
  "in-addition": en("Only in addition to one of the above"),
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
    <span className="yn" role="group" aria-label={tm(QUESTIONS[question].text)}>
      <button type="button" aria-pressed={value === true} onClick={() => onAnswer(question, true)}>
        {t("Yes")}
      </button>
      <button type="button" aria-pressed={value === false} onClick={() => onAnswer(question, false)}>
        {t("No")}
      </button>
    </span>
  );
}

export function ScanCard({ identifierKey, walked, guide, dataError, answers, onAnswer, choice, onPick, expert, onExpert }: Props) {
  const byKey = walked.steps.filter((s) => s.byKey).map((s) => BY_KEY[`${s.question}:${s.answer}`]).filter(Boolean).map((text) => t(text!));
  const asked = walked.steps.filter((s) => !s.byKey).map((s) => s.question as QuestionId);
  const short = KEY_TEXTS[identifierKey]?.short ?? t("key");
  const items = guide ? pickList(guide) : [];
  const table = walked.leaf?.table;

  return (
    <section className="card" aria-labelledby="scan-title">
      <h2 id="scan-title">
        <span className="n">2</span> {t("Where is it scanned?")}
      </h2>
      {expert ? (
        <p className="hint">
          {t(GUIDE_TEXTS.expert)}{" "}
          <button type="button" className="link" onClick={() => onExpert(false)}>
            {t("Back to the guided choice")}
          </button>
        </p>
      ) : (
        <>
          {byKey.length > 0 && (
            <p className="hint by-key">
              {byKey.length === 1
                ? t("The {key} already answers one question of the tree:", { key: short })
                : t("The {key} already answers {n} questions of the tree:", { key: short, n: byKey.length })}{" "}
              {byKey.join("; ")}.
            </p>
          )}
          <div className="ask">
            {[...asked, ...(walked.next ? [walked.next] : [])].map((question) => (
              <div key={question} className={question === walked.next ? "ask-row next" : "ask-row"}>
                <span>
                  {tm(QUESTIONS[question].text)}
                  <small>{tm(QUESTIONS[question].help)}</small>
                </span>
                <YesNo question={question} value={answers[question]} onAnswer={onAnswer} />
              </div>
            ))}
          </div>
          {walked.next && <p className="hint">{t(GUIDE_TEXTS.answer)}</p>}
          {walked.leaf && table && (
            <div className="table-box">
              <b>{t("Symbol specification table {n}", { n: table })}</b> — {tm(walked.leaf.application).toLowerCase()}.
              <span>
                {t("GS1 General Specifications 26.0: decision tree (figure 5-68), section 5.12.3.{n}; carrier choices {sections}.", { n: table, sections: walked.leaf.sections })}
              </span>
            </div>
          )}
          {walked.leaf && !guide && <p className="hint error">{dataError ?? t(GUIDE_TEXTS.fixData)}</p>}
          {guide && !guide.recommended && (
            <p className="hint error">
              {guide.together
                ? `${t(GUIDE_TEXTS.together)} ${t("{symbol} with a {beside} beside it", { symbol: NAME(guide.together.symbol), beside: NAME(guide.together.with) })}. ${t(GUIDE_TEXTS.togetherLater)}`
                : guide.waiting
                  ? `${t(GUIDE_TEXTS.waiting)} ${NAME(guide.waiting)}. ${t(GUIDE_TEXTS.notDrawn)}`
                  : t(GUIDE_TEXTS.nothing)}
            </p>
          )}
          {(["recommended", "allowed", "in-addition"] as const).map((group) => {
            const list = items.filter((item) => item.group === group);
            if (!list.length) return null;
            return (
              <div key={group} role="radiogroup" aria-label={t(GROUPS[group])}>
                <div className="pick-group">{t(GROUPS[group])}</div>
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
                        {item.tag && <span className={`tag ${item.tag}`}>{t(TAGS[item.tag])}</span>}
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
              {t("Not for this data:")}{" "}
              {guide.options
                .filter((o) => o.carries === "no")
                .map((o) => `${tm(o.name)} (${tm(o.reason ?? "")})`)
                .join("; ")}
              .
            </p>
          )}
          <p className="hint">
            <button type="button" className="link" onClick={() => onExpert(true)}>
              {t("Choose a symbol yourself")}
            </button>{" "}
            — {t(GUIDE_TEXTS.expertOffer)}
          </p>
        </>
      )}
    </section>
  );
}
