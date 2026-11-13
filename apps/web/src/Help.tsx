import { useEffect, useId, useRef, useState } from "react";
import { t } from "./i18n.ts";

// A ? beside an option's name that says what the option is for (backlog 6.3 a and j, mock-up A of the usability
// study, 13 November 2026): a popover under it on a computer, a sheet from the bottom of the screen on a phone
// (styles.css). A disclosure for assistive technology: the button says whether it is open, and the text follows it.
// Escape, the ? again or a press elsewhere closes it.

export function Help({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span className="help" ref={box}>
      <button
        type="button"
        ref={button}
        className="help-button"
        aria-label={t("What is {name}?", { name })}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      <span className="help-text" id={id} role="note" hidden={!open}>
        {text}
      </span>
    </span>
  );
}
