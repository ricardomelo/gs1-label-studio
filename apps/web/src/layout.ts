import { useEffect, useState } from "react";

// The layouts (backlog 1.21, mock-up A of three, 31 October 2026). A computer keeps the editor as it was: the steps on
// the left, the label beside them. A phone, a tablet held upright or a narrow window shows one column and one
// destination at a time, chosen in a tab bar at the bottom, as phone apps do; a tablet held horizontally shows a
// navigation rail on the left, the destination beside it and the label always on the right. The destinations are the
// page's parts marked `data-pane` (styles.css hides those of the other destinations); the same page serves every
// layout, so what is typed stays when a phone is turned.

export type Pane = "data" | "scan" | "label" | "export" | "more";
export const PANES: readonly Pane[] = ["data", "scan", "label", "export", "more"];

/** One column, a tab bar at the bottom: phones, tablets held upright, narrow windows. As `@media` in styles.css. */
export const PHONE_QUERY = "(max-width: 900px)";
/** A navigation rail and two columns: a touch screen held horizontally, up to a large tablet's width. */
export const TABLET_QUERY = "(min-width: 901px) and (max-width: 1366px) and (orientation: landscape) and (pointer: coarse)";

/** Whether a media query matches, kept up to date as the window is resized or the device turned. */
export function useMedia(query: string): boolean {
  const media = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null);
  const [matches, setMatches] = useState(() => media()?.matches ?? false);
  useEffect(() => {
    const list = media();
    if (!list) return;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return matches;
}

/** The destination an element of the page belongs to: the first of its nearest `data-pane`. */
export function paneOf(element: Element | null): Pane | null {
  const first = element?.closest("[data-pane]")?.getAttribute("data-pane")?.split(" ")[0];
  return first && (PANES as readonly string[]).includes(first) ? (first as Pane) : null;
}
