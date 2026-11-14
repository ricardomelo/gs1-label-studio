import { useId, useState } from "react";
import { PHONE_QUERY, useMedia } from "./layout.ts";

// The label's options grouped by what they do (backlog 6.3 b, mock-up B of the usability study, 13 November 2026):
// each group framed and named on a computer and a tablet; on a phone, where the options were a long scroll of fields,
// folded under its name with a line saying what is set, a tap opening it. A disclosure for assistive technology: the
// button says whether it is open, and the options follow it as a group named after it.

export function OptionGroup({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const phone = useMedia(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!phone) {
    return (
      <fieldset className="group">
        <legend>{title}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <div className={open ? "group folding open" : "group folding"}>
      <button type="button" className="group-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span className="group-title" id={`${id}-title`}>
          {title}
        </span>
        <span className="group-summary">{summary}</span>
        <span className="group-arrow" aria-hidden="true">
          ▸
        </span>
      </button>
      <div className="group-body" id={`${id}-body`} role="group" aria-labelledby={`${id}-title`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
