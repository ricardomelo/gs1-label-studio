import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Offline (backlog 1.7): the service worker the build writes (offline.ts) keeps every file of the application.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => console.warn(error));
}

// "Start over" (the owner, 30 October 2026): a new App, as on a first visit; what this browser keeps (the screen's
// calibration, the columns of known files, the GCP table) stays.
function Root() {
  const [visit, setVisit] = useState(0);
  return <App key={visit} onStartOver={() => setVisit(visit + 1)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
