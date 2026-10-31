import { en, t } from "./i18n.ts";

// About the studio, at the foot of the page (the owner, 31 October 2026): its repository, its licence, the version
// published, and the software of others it is made with, each with its repository (docs/third-party.md has the
// versions and the tools of the tests). On a phone it closes the "More" destination.

export const REPOSITORY = "https://github.com/ricardomelo/gs1-label-studio";

/** The software the application contains, as docs/third-party.md lists it ("In the application"). */
export const MADE_WITH: readonly { name: string; url: string; licence: string; use: string }[] = [
  { name: "bwip-js", url: "https://github.com/metafloor/bwip-js", licence: "MIT", use: en("encodes every symbol") },
  { name: "GS1 Barcode Syntax Engine", url: "https://github.com/gs1/gs1-syntax-engine", licence: "Apache 2.0, © GS1 AISBL", use: en("checks element strings and GS1 Digital Link URIs") },
  { name: "node-qrcode", url: "https://github.com/soldair/node-qrcode", licence: "MIT", use: en("a QR code in one encoding mode") },
  { name: "dijkstrajs", url: "https://github.com/tcort/dijkstrajs", licence: "MIT", use: en("used by node-qrcode") },
  { name: "opentype.js", url: "https://github.com/opentypejs/opentype.js", licence: "MIT", use: en("the human readable text as outlines") },
  { name: "zxing-wasm", url: "https://github.com/Sec-ant/zxing-wasm", licence: "MIT", use: en("the scan test") },
  { name: "zxing-cpp", url: "https://github.com/zxing-cpp/zxing-cpp", licence: "Apache 2.0", use: en("the decoder inside zxing-wasm") },
  { name: "React", url: "https://github.com/facebook/react", licence: "MIT", use: en("the user interface") },
  { name: "Liberation Sans", url: "https://github.com/liberationfonts/liberation-fonts", licence: "SIL Open Font License 1.1", use: en("the human readable text's font") },
];

export function About() {
  const date = __BUILD__.date ? new Date(__BUILD__.date).toISOString().slice(0, 10) : "";
  return (
    <footer className="about" data-pane="more" aria-labelledby="about-title">
      <h2 id="about-title">{t("About GS1 Label Studio")}</h2>
      <p>{t("GS1 barcodes and labels made in the browser, one at a time or thousands from a spreadsheet. Everything stays in your browser, and it works offline.")}</p>
      <ul className="about-links">
        <li>
          {t("Source code")}: <a href={REPOSITORY}>github.com/ricardomelo/gs1-label-studio</a>
        </li>
        <li>
          {t("Licence")}: <a href={`${REPOSITORY}/blob/main/LICENSE`}>Apache License 2.0</a> · {t("free and open source, for any use")}
        </li>
        <li>
          {t("Manuals")}: <a href={`${REPOSITORY}/blob/main/docs/user-guide.md`}>{t("user guide")}</a> ·{" "}
          <a href={`${REPOSITORY}/blob/main/docs/printing-guide.md`}>{t("printing guide")}</a> ·{" "}
          <a href={`${REPOSITORY}/blob/main/docs/README.md`}>{t("all documents")}</a>
        </li>
        {__BUILD__.commit && (
          <li>
            {t("Version")}:{" "}
            <a className="mono" href={`${REPOSITORY}/commit/${__BUILD__.commit}`}>
              {__BUILD__.commit}
            </a>
            {date && ` · ${date}`}
          </li>
        )}
      </ul>
      <h3>{t("Made with")}</h3>
      <ul className="made-with">
        {MADE_WITH.map((m) => (
          <li key={m.name}>
            <a href={m.url}>{m.name}</a> <span className="opt">— {t(m.use)} · {m.licence}</span>
          </li>
        ))}
      </ul>
      <p className="hint">
        {t("Ported in part from the label studio of the")} <a href="https://github.com/ricardomelo/GS1_DigitalLink_Resolver_CE">GS1 Digital Link Resolver CE — Expansion Pack</a>.{" "}
        {t("GS1 is a registered trademark of GS1 AISBL; this community tool is not maintained by GS1. It is provided \"as is\", without warranty (Apache License 2.0, sections 7 and 8): check a printed symbol before a production run.")}{" "}
        <a href={`${REPOSITORY}/blob/main/docs/third-party.md`}>{t("Third-party licences")}</a>
      </p>
    </footer>
  );
}
