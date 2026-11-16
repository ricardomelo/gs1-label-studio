import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_PAGE, reportPdf, textWidth, winAnsiCode, wrapText, type ReportDocument } from "../src/index.ts";

// The Check Studio's reports as PDF (backlog 7.1 k; the check studio's project, section 7.3 and item k's acceptance):
// written by the core with the standard fonts, the text selectable and searchable — read back here by poppler's
// pdftotext, as a reader's search would find it — accented text in each of the six languages, lines wrapped within the
// page, tables broken between rows with their heads repeated, and the pages numbered.

/** The PDF's text, page by page, as pdftotext extracts it. */
function textOf(pdf: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "report-"));
  writeFileSync(join(dir, "report.pdf"), pdf);
  const run = spawnSync("pdftotext", ["-layout", "report.pdf", "-"], { cwd: dir, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.split("\f").slice(0, -1);
}

const pageCount = (pdf: Uint8Array) => Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(new TextDecoder("latin1").decode(pdf))![1]);

/** A sentence with each language's own letters, as the interface's catalogues have them. */
const SENTENCES = {
  en: "The check digit that would be right — “quoted” — costs €5…",
  "pt-BR": "Relatório da sessão: ação, coração, não, você, à, ç",
  es: "Informe de la sesión: ¿Exportarlas? ñandú, pingüino, ¡sí!",
  fr: "Rapport de vérification : élève, être, garçon, œuvre, Noël",
  de: "Prüfbericht: Größe, übermäßig, Straße, Äpfel, Öl",
  it: "Rapporto di verifica: perché, città, più, così, è",
} as const;

describe("a report as PDF", () => {
  it("has its text selectable and searchable, accents intact in each of the six languages", async () => {
    const doc: ReportDocument = {
      title: "Relatório",
      footer: "GS1 Label Studio · 16/11/2026",
      blocks: [
        { kind: "title", text: "Relatório de verificação: GS1 DataMatrix" },
        ...Object.values(SENTENCES).map((text) => ({ kind: "paragraph" as const, text })),
        { kind: "pairs", rows: [["Veredito", "Não segue as regras GS1"]] },
        { kind: "paragraph", style: "mono", text: "(01)09506000134352(17)271300(10)ABC123" },
        { kind: "paragraph", text: "An unbalanced ) and a \\ backslash" },
      ],
    };
    const pdf = await reportPdf(doc);
    const [page] = textOf(pdf);
    for (const sentence of Object.values(SENTENCES)) expect(page!.replace(/\s+/g, " ")).toContain(sentence);
    expect(page).toContain("Relatório de verificação: GS1 DataMatrix");
    expect(page).toMatch(/Veredito\s+Não segue as regras GS1/);
    expect(page).toContain("(01)09506000134352(17)271300(10)ABC123");
    expect(page).toContain("An unbalanced ) and a \\ backslash");
    expect(page).toMatch(/GS1 Label Studio · 16\/11\/2026\s+1 ?\/ ?1/); // pdftotext may close up the spaces of "1 / 1"
    // The standard fonts, not embedded: nothing but their names
    const structure = new TextDecoder("latin1").decode(pdf);
    for (const font of ["Helvetica", "Helvetica-Bold", "Courier"]) expect(structure).toContain(`/BaseFont /${font} /Encoding /WinAnsiEncoding`);
    expect(structure).not.toContain("/FontFile");
  });

  it("breaks a long table between rows, its head on every page, and numbers the pages", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [String(i + 1), `(01) 0950600013435${i % 10}`, "Segue as regras GS1"]);
    const pdf = await reportPdf({ title: "Sessão", footer: "Rodapé", blocks: [{ kind: "heading", text: "Todas as leituras" }, { kind: "table", head: ["#", "Chave", "Veredito"], rows }] });
    const pages = textOf(pdf);
    expect(pages.length).toBeGreaterThan(1);
    expect(pageCount(pdf)).toBe(pages.length);
    pages.forEach((page, i) => {
      expect(page).toMatch(/#\s+Chave\s+Veredito/);
      expect(page).toMatch(new RegExp(`${i + 1} ?/ ?${pages.length}\\s*$`));
    });
    // Every row once, in order
    const numbers = pages.join("\n").split("\n").map((line) => /^\s*(\d+)\s+\(01\)/.exec(line)?.[1]).filter(Boolean).map(Number);
    expect(numbers).toEqual(rows.map((_, i) => i + 1));
  });

  it("starts a new page where it is asked to", async () => {
    const pdf = await reportPdf({ title: "t", footer: "f", blocks: [{ kind: "paragraph", text: "one" }, { kind: "page-break" }, { kind: "paragraph", text: "two" }] });
    const pages = textOf(pdf);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("two");
  });
});

describe("the lines", () => {
  it("are cut at spaces within the width, and inside a word only when the word alone is wider", () => {
    const width = 200;
    const text = "Os bytes, em hexadecimal: " + "30313039353036303030313334333532".repeat(4) + " e depois o resto do texto que continua";
    const lines = wrapText(text, "F1", 9.5, width);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(textWidth(line, "F1", 9.5)).toBeLessThanOrEqual(width);
    expect(lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
    expect(wrapText("one\ntwo", "F1", 10, width)).toEqual(["one", "two"]);
  });

  it("measure Helvetica by Adobe's widths, and Courier at 600", () => {
    expect(textWidth("Hello", "F1", 1000)).toBe(722 + 556 + 222 + 222 + 556);
    expect(textWidth("Hello", "F2", 1000)).toBe(722 + 556 + 278 + 278 + 611);
    expect(textWidth("ação", "F3", 10)).toBe(24);
    expect(REPORT_PAGE.width).toBeCloseTo(595.28);
  });

  it("encode WinAnsi: Latin-1, the Windows-1252 punctuation, and ? for the rest", () => {
    expect(["é", "ß", "€", "—", "“", "œ", "…", "Ω", "\u001d"].map(winAnsiCode)).toEqual([0xe9, 0xdf, 0x80, 0x97, 0x93, 0x9c, 0x85, 0x3f, 0x20]);
  });
});
