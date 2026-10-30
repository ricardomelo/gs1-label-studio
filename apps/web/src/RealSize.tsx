import { useLayoutEffect, useRef, useState } from "react";

// The preview at real size (item 1.6, mock-up A of 29 October 2026): rulers in millimetres along the label, and a
// calibration of the screen against a bank card, kept in this browser.

/** CSS pixels per millimetre as browsers define them: 96 a inch. Real screens differ, hence the calibration. */
export const CSS_PX_PER_MM = 96 / 25.4;
export const CARD_MM = 53.98; // ISO/IEC 7810 ID-1: a bank card's short side (85.60 × 53.98 mm)
const KEPT = "gs1-label-studio.px-per-mm";

export function keptScale(): number {
  try {
    const value = Number(localStorage.getItem(KEPT));
    return value >= 2 && value <= 8 ? value : CSS_PX_PER_MM;
  } catch {
    return CSS_PX_PER_MM;
  }
}

function keep(value: number | null) {
  try {
    if (value === null) localStorage.removeItem(KEPT);
    else localStorage.setItem(KEPT, String(value));
  } catch {
    // Without storage the calibration lasts until the page is reloaded.
  }
}

/** A ruler in millimetres: a tick each millimetre, longer at 5, numbered in centimetres. */
export function Ruler({ lengthMm, pxPerMm, vertical = false }: { lengthMm: number; pxPerMm: number; vertical?: boolean }) {
  const ticks = [];
  for (let mm = 0; mm <= lengthMm; mm++) {
    const size = mm % 10 === 0 ? 10 : mm % 5 === 0 ? 7 : 4;
    const at = mm * pxPerMm;
    ticks.push(vertical
      ? <line key={mm} x1={18} x2={18 - size} y1={at} y2={at} />
      : <line key={mm} y1={18} y2={18 - size} x1={at} x2={at} />);
    if (mm % 10 === 0 && mm > 0) {
      ticks.push(vertical
        ? <text key={`t${mm}`} x={1} y={at + 3}>{mm / 10}</text>
        : <text key={`t${mm}`} x={at + 2} y={8}>{mm / 10}</text>);
    }
  }
  const length = lengthMm * pxPerMm;
  return (
    <svg className="ruler" aria-hidden="true" width={vertical ? 18 : length} height={vertical ? length : 18}>
      {ticks}
    </svg>
  );
}

/** The label at real size between its rulers. */
export function RealSizeView({ svg, widthMm, heightMm, pxPerMm }: { svg: string; widthMm: number; heightMm: number; pxPerMm: number }) {
  return (
    <div className="real" data-px-per-mm={pxPerMm.toFixed(4)}>
      <span />
      <Ruler lengthMm={Math.floor(widthMm)} pxPerMm={pxPerMm} />
      <Ruler lengthMm={Math.floor(heightMm)} pxPerMm={pxPerMm} vertical />
      <div className="symbol" style={{ width: widthMm * pxPerMm, height: heightMm * pxPerMm }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

const MIN = 2.5;
const MAX = 7;
const FINE = 0.01; // a step of the − and + buttons: about half a pixel on the bar

/**
 * The calibration: the person holds a bank card against the screen and matches a bar to it. It spans the label's
 * card, so the bar fits up to the slider's maximum (7 pixels a millimetre: 378 pixels, less on a narrow screen); − and
 * + move it by about half a pixel for the last adjustment (backlog 1.10 c).
 */
export function Calibration({ pxPerMm, onChange }: { pxPerMm: number; onChange: (pxPerMm: number) => void }) {
  const [value, setValue] = useState(pxPerMm);
  // On a narrow screen the slider stops where the bar still fits its box: a card wider than the screen cannot be
  // matched anyway.
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(MAX);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const room = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setMax(Math.max(MIN, Math.min(MAX, Math.floor((room / CARD_MM) * 200) / 200))); // on the slider's 0.005 steps
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const set = (next: number) => {
    const bounded = Math.min(max, Math.max(MIN, Math.round(next * 1000) / 1000));
    setValue(bounded);
    keep(bounded);
    onChange(bounded);
  };
  return (
    <div className="calibration" ref={box}>
      <label htmlFor="calibrate">Screen calibration</label>
      <div className="calibrate-row">
        <button type="button" className="ibtn" aria-label="Shorter" disabled={value <= MIN} onClick={() => set(value - FINE)}>
          −
        </button>
        <input
          id="calibrate"
          type="range"
          min={MIN}
          max={max}
          step={0.005}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
        />
        <button type="button" className="ibtn" aria-label="Longer" disabled={value >= max} onClick={() => set(value + FINE)}>
          +
        </button>
      </div>
      <div className="card-bar" style={{ width: CARD_MM * value }} />
      <div className="hint">
        Hold the short side of a bank card ({CARD_MM.toFixed(2)} mm) against the screen and move the slider until the bar
        is as long. Kept in this browser.{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            keep(null);
            setValue(CSS_PX_PER_MM);
            onChange(CSS_PX_PER_MM);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
