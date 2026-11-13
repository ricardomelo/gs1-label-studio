import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initialLocale, setLocale, type Locale } from "./i18n.ts";
import "./install.ts"; // catches the browser's install offer before the page is drawn
import "./styles.css";
import { watchUpdates } from "./update.ts";

// Offline (backlog 1.7): the service worker the build writes (offline.ts) keeps every file of the application; a new
// release it installs is offered as a reload (backlog 6.1, update.ts).
if ("serviceWorker" in navigator && import.meta.env.PROD) watchUpdates(`${import.meta.env.BASE_URL}sw.js`);

// "Start over" (the owner, 30 October 2026): a new App, as on a first visit; what this browser keeps (the screen's
// calibration, the columns of known files, the GCP table) stays; the last work kept for the next visit is forgotten.
// The language (ADR 0003): the one chosen in this browser before, or the browser's own; changing it redraws the page
// in place, keeping what was typed.
setLocale(initialLocale(), false);

function Root() {
  const [visit, setVisit] = useState(0);
  const [locale, setCurrent] = useState<Locale>(initialLocale());
  return (
    <App
      key={visit}
      locale={locale}
      onStartOver={() => setVisit(visit + 1)}
      onLocale={(next) => {
        setLocale(next);
        setCurrent(next);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
