import type { ReactNode } from "react";
import { t } from "./i18n.ts";
import { READY, routeHash, type Studio } from "./routes.ts";

// The start page (backlog 7.1 e; mock-up A of two, the studios as cards): the family of studios the owner asked for on
// 15 November 2026. A studio the application does not have yet is shown, named and marked as coming, not a link.

/** Each studio's picture: a few strokes of the studio's own, in the text's colour. */
const PICTURES: Record<Studio, ReactNode> = {
  label: (
    <>
      <rect x="6" y="8" width="36" height="32" rx="3" />
      <path d="M12 16h14M12 21h10M12 30v5M15 30v5M17 30v5M20 30v5M23 30v5M25 30v5" />
      <rect x="30" y="26" width="8" height="9" />
    </>
  ),
  barcode: <path d="M8 12v24M12 12v24M15 12v24M19 12v24M24 12v24M27 12v24M31 12v24M35 12v24M40 12v24" />,
  rfid: (
    <>
      <rect x="8" y="10" width="32" height="28" rx="3" />
      <path d="M16 18h16v12H16zM20 22h8v4h-8" />
    </>
  ),
  check: (
    <>
      <circle cx="21" cy="21" r="12" />
      <path d="M30 30l10 10M15 21l4 4 8-8" />
    </>
  ),
};

/** The studios' names and lines, as the start page writes them. */
export function studioTexts(): Record<Studio, { name: string; line: string }> {
  return {
    label: {
      name: t("Label Studio"),
      line: t("Labels with their barcodes: the GS1 Logistic Label, retail and healthcare templates, or a label of your own, for artwork and label printers."),
    },
    barcode: {
      name: t("Barcode Studio"),
      line: t("One GS1 barcode or a whole list of them, as SVG, PNG, PDF or EPS files, or for a label printer."),
    },
    rfid: {
      name: t("RFID Studio"),
      line: t("The EPC of RFID tags, and NFC tags that carry a GS1 Digital Link URI."),
    },
    check: {
      name: t("Check Studio"),
      line: t("Read a barcode or a tag and see whether it follows the GS1 rules: what is wrong, where, and how to put it right."),
    },
  };
}

export function StartPage() {
  const texts = studioTexts();
  const order: Studio[] = ["label", "barcode", "rfid", "check"];
  return (
    <main className="start" aria-labelledby="start-title">
      <h2 id="start-title">{t("Choose a studio")}</h2>
      <ul className="studios">
        {order.map((studio) => {
          const ready = READY.has(studio);
          const body = (
            <>
              <svg className="studio-picture" viewBox="0 0 48 48" aria-hidden="true">
                {PICTURES[studio]}
              </svg>
              <span className="studio-text">
                <b>{texts[studio].name}</b>
                <span>{texts[studio].line}</span>
                {!ready && <span className="soon">{t("Coming soon")}</span>}
              </span>
            </>
          );
          return (
            <li key={studio} data-studio={studio}>
              {ready ? (
                <a className="studio" href={routeHash({ studio })}>
                  {body}
                </a>
              ) : (
                <div className="studio" aria-disabled="true">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

/** What a studio still to come shows at its own address: its name, that it is coming, and the way back. */
export function ComingStudio({ studio }: { studio: Studio }) {
  const text = studioTexts()[studio];
  return (
    <main className="start" aria-labelledby="start-title">
      <h2 id="start-title">{text.name}</h2>
      <p>{text.line}</p>
      <p className="soon">{t("Coming soon")}</p>
      <p>
        <a className="btn primary" href={routeHash({ studio: "start" })}>
          {t("All studios")}
        </a>
      </p>
    </main>
  );
}
