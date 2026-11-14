import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "./i18n.ts";
import type { Pane } from "./layout.ts";
import { placeCard, within, type Box, type TourStop } from "./tour.ts";

// The tour's overlay (backlog 6.4, mock-up A of two): a ring around what is shown, the rest of the page dimmed by the
// ring's shadow and kept from clicks by a clear backdrop, and a card beside it with the stop's title and text, n of
// count, Skip the tour, Back and Next (Done at the last). A dialog for assistive technology, its Next button focused at
// each stop; Escape closes it, the arrow keys move between stops, and the focus goes back to what opened it. Stops whose
// element is not on the page (a part of another mode) are left out.

const PAD = 6;

export function Tour({ stops, onPane, onClose }: { stops: readonly TourStop[]; onPane?: (pane: Pane) => void; onClose: () => void }) {
  const [present] = useState(() => stops.filter((stop) => document.querySelector(`[data-tour="${stop.target}"]`)));
  const [index, setIndex] = useState(0);
  const [ring, setRing] = useState<Box | null>(null);
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const stop = present[index];

  const close = useCallback(() => {
    onClose();
    // On the next frame: on a phone or a tablet the destination it was opened from is shown again first
    const back = opener.current;
    requestAnimationFrame(() => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    });
  }, [onClose]);

  const measure = useCallback(() => {
    const element = stop && document.querySelector(`[data-tour="${stop.target}"]`);
    const box = cardRef.current;
    if (!element || !box) return;
    const view = { width: window.innerWidth, height: window.innerHeight };
    const r = element.getBoundingClientRect();
    const target = { left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD };
    setRing(within(target, view));
    setCard(placeCard(target, { width: box.offsetWidth, height: box.offsetHeight }, view));
  }, [stop]);

  // At each stop: its destination opened, its element brought into view, then the ring and the card placed
  useLayoutEffect(() => {
    if (!stop) return;
    if (stop.pane) onPane?.(stop.pane);
    const element = document.querySelector(`[data-tour="${stop.target}"]`);
    if (element) {
      const tall = element.getBoundingClientRect().height > window.innerHeight * 0.7;
      element.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest" });
    }
    measure();
    next.current?.focus({ preventScroll: true });
    // A destination opened restores where it was scrolled to on the next frame (App's showPane): placed again after it
    const frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  useEffect(() => {
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", later);
      window.removeEventListener("scroll", later, true);
    };
  }, [measure]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        // Kept within the card, as the page behind is out of reach
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const to = buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
        if (to) {
          event.preventDefault();
          to.focus();
        }
      } else if (event.key === "ArrowRight" && index < present.length - 1) setIndex(index + 1);
      else if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [close, index, present.length]);

  if (!stop) return null;
  const last = index === present.length - 1;
  return (
    <div className="tour">
      <div className="tour-backdrop" />
      {ring && <div className="tour-ring" style={{ left: ring.left, top: ring.top, width: ring.width, height: ring.height }} />}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        data-stop={stop.target}
        style={card ? { left: card.left, top: card.top } : { opacity: 0 }}
      >
        <button type="button" className="close" aria-label={t("Close")} title={t("Close")} onClick={close}>
          ×
        </button>
        <h3 id="tour-title">{t(stop.title)}</h3>
        <p id="tour-text">{t(stop.text)}</p>
        <div className="tour-actions">
          <span className="count" aria-live="polite">
            {t("{n} of {count}", { n: index + 1, count: present.length })}
          </span>
          {!last && (
            <button type="button" className="link" onClick={close}>
              {t("Skip the tour")}
            </button>
          )}
          {index > 0 && (
            <button type="button" className="btn" onClick={() => setIndex(index - 1)}>
              {t("Back")}
            </button>
          )}
          <button ref={next} type="button" className="btn primary" onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? t("Done") : t("Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
