import { t } from "./i18n.ts";
import { useEffect, useRef, useState } from "react";

// A field for an AI that is typed or picked from a list (the owner's report of 30 October 2026): a browser's datalist
// shows only the options matching what the field holds, so once an AI is chosen its arrow showed that AI alone. Here
// the arrow, or a field holding a whole option, lists every option; typing filters them by AI or by title.

export interface ComboOption {
  /** The text the field takes: "(17) USE BY or EXPIRY". */
  value: string;
  /** Shown after it in the list, smaller: "element strings only". */
  note?: string;
}

interface Props {
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export function AiCombo({ value, options, onChange, label, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const typed = value.trim().toLowerCase();
  const whole = options.some((option) => option.value.toLowerCase() === typed);
  const shown = all || !typed || whole ? options : options.filter((option) => option.value.toLowerCase().includes(typed));

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // The arrow opens the list without focusing the field (on a phone that would raise the keyboard), so the field's
  // own Escape and blur never come: while the list is open, Escape or a press outside the field closes it (the owner's
  // report of 9 November 2026)
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const show = (everything: boolean) => {
    setAll(everything);
    const at = options.findIndex((option) => option.value.toLowerCase() === typed);
    setActive(everything && at >= 0 ? at : 0);
    setOpen(true);
  };
  const pick = (option: ComboOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className="combo" ref={box}>
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setAll(false);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) show(whole);
            else setActive(Math.min(active + 1, shown.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(active - 1, 0));
          } else if (event.key === "Enter" && open && shown[active]) {
            event.preventDefault();
            pick(shown[active]!);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className="combo-arrow"
        tabIndex={-1}
        aria-label={t("Open the list")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? setOpen(false) : show(true))}
      >
        ▾
      </button>
      {open && shown.length > 0 && (
        <ul className="combo-list" role="listbox" ref={list}>
          {shown.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setActive(index)}
            >
              {option.value}
              {option.note && <span className="note"> · {option.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
