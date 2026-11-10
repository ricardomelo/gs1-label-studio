import { useRef, type KeyboardEvent } from "react";

// A choice of two to four short options as buttons in a row (the owner's request of 10 November 2026, mock-up A of
// two: B put sliders in their place, which suit an ordered scale only and cut the options' names): every option in
// view and one press to change it, where a list needed two. A radio group for assistive technology: Tab reaches the
// chosen option, the arrow keys move the choice. The chosen option's full text is said under it.

export interface SegmentedOption<T extends string> {
  value: T;
  /** The button's text: a word or two. */
  text: string;
  /** The option's full text, said under the buttons once it is chosen and given to the button as its title. */
  detail?: string;
}

interface Props<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ id, label, value, options, onChange }: Props<T>) {
  const group = useRef<HTMLDivElement>(null);
  const chosen = options.find((option) => option.value === value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const by = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!by) return;
    event.preventDefault();
    const next = (index + by + options.length) % options.length;
    onChange(options[next]!.value);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <div className="seg-field">
      <span className="seg-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="seg" role="radiogroup" id={id} aria-labelledby={`${id}-label`} ref={group}>
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            tabIndex={option.value === value ? 0 : -1}
            title={option.detail}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.text}
          </button>
        ))}
      </div>
      {chosen?.detail && <div className="hint">{chosen.detail}</div>}
    </div>
  );
}
