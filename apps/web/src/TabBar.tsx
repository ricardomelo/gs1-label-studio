import type { ReactNode } from "react";
import { t } from "./i18n.ts";
import { PANES, type Pane } from "./layout.ts";

// The destinations' bar (backlog 1.21, mock-up A): at the bottom on a phone, a rail on the left on a tablet held
// horizontally, hidden on a computer (styles.css). Each destination an icon and a word, the one shown marked; a dot
// where something needs attention.

// Called at each drawing, so that a change of language shows at once
const names = (): Record<Pane, string> => ({ data: t("Data"), scan: t("Scan"), label: t("Label"), export: t("Export"), more: t("More") });

const ICONS: Record<Pane, ReactNode> = {
  data: <path d="M4 6h16M4 12h10M4 18h7" />,
  scan: <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8" />,
  label: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18.5h1.5M18.5 14H20" />
    </>
  ),
  export: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
};

export function TabBar({ tab, onTab, alerts }: { tab: Pane; onTab: (pane: Pane) => void; alerts: Partial<Record<Pane, boolean>> }) {
  const label = names();
  return (
    <nav className="tabs" aria-label={t("Sections")}>
      {PANES.map((pane) => (
        <button key={pane} type="button" aria-current={pane === tab ? "page" : undefined} onClick={() => onTab(pane)}>
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[pane]}
            </svg>
            {alerts[pane] && <span className="alert" />}
          </span>
          <span className="word">{label[pane]}</span>
        </button>
      ))}
    </nav>
  );
}
