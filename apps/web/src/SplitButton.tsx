import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

// A download button with its options beside it (backlog 6.3 h, the owner's comments of 11 November 2026 on the test
// plan): the left part downloads at once, as before; the arrow opens the choices that used to sit far below among the
// label's options (the PNG's resolution, the SVG's text). The choice is kept and shown on the button where it says
// something (PNG (300 dpi)). A menu of radio items for assistive technology: the arrow keys move between them, Enter
// or a click chooses, Escape, Tab or a click elsewhere closes it and gives the focus back to the arrow. On a phone the
// menu rises from the bottom of the screen as a sheet (styles.css).

export interface SplitChoice<T extends string> {
  value: T;
  text: string;
  /** A second line under the choice, saying what it means. */
  detail?: string;
}

interface Props<T extends string> {
  /** The button's text, and what the arrow is called for assistive technology ("PNG options"). */
  text: string;
  menuLabel: string;
  /** The menu's heading, over its choices. */
  heading: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  choices: readonly SplitChoice<T>[];
  value: T;
  onChoose: (value: T) => void;
}

export function SplitButton<T extends string>({ text, menuLabel, heading, primary, disabled, onClick, choices, value, onChoose }: Props<T>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];

  const close = (focusArrow: boolean) => {
    setOpen(false);
    if (focusArrow) arrow.current?.focus();
  };

  // Opened: the focus on the choice made; a press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const all = items();
    (all.find((item) => item.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const by = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (by) {
      event.preventDefault();
      all[(at + by + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? all[0] : all.at(-1))?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const kind = primary ? "btn primary" : "btn";
  return (
    <span className={`split${primary ? " split-primary" : ""}${open ? " open" : ""}`} ref={box}>
      <button type="button" className={`${kind} split-main`} disabled={disabled} onClick={onClick}>
        {text}
      </button>
      <button
        type="button"
        ref={arrow}
        className={`${kind} split-arrow`}
        aria-label={menuLabel}
        title={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && (
        <div className="split-menu" role="menu" id={id} aria-label={heading} ref={menu} onKeyDown={onMenuKey}>
          <div className="split-heading" aria-hidden="true">
            {heading}
          </div>
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice.value === value}
              tabIndex={-1}
              onClick={() => {
                onChoose(choice.value);
                close(true);
              }}
            >
              <span className="split-text">{choice.text}</span>
              {choice.detail && <span className="split-detail">{choice.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
