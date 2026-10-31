import { useEffect, useState } from "react";
import { t } from "./i18n.ts";
import { install, installState, onInstallChange } from "./install.ts";

// "Install the app" in More on a phone or a tablet (the owner, 31 October 2026): the browser's own install dialog where
// it has one, the way to do it on an iPhone or iPad, or a note once the studio runs as an app.

export function InstallApp() {
  const [state, setState] = useState(installState);
  useEffect(() => onInstallChange(() => setState(installState())), []);

  return (
    <div className="install">
      {state === "installed" ? (
        <span className="hint ok">{t("✓ Installed: open GS1 Label Studio from the home screen; it works offline.")}</span>
      ) : (
        <>
          <button type="button" className="btn primary" disabled={state !== "ready"} onClick={() => void install()}>
            {t("Install the app")}
          </button>
          <span className="hint">
            {state === "ready"
              ? t("On the home screen, offline, without the browser's bars.")
              : state === "ios"
                ? t("On an iPhone or iPad: tap Share, then Add to Home Screen.")
                : t("This browser installs it from its menu: Install app, or Add to Home screen.")}
          </span>
        </>
      )}
    </div>
  );
}
