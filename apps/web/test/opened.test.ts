import { readWork, workFile, type DesignPage } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { openedSettings, savedSettings, START_SETTINGS } from "../src/work.ts";
import type { LabelSettings } from "../src/LabelCard.tsx";

// A work opened again (backlog 4.3): the label's settings saved come back; one this studio does not know, or of
// another kind, keeps the editor's own.

const PAGE: DesignPage = { widthMm: 60, heightMm: 40, elements: [{ id: "t", kind: "text", text: "LOTE {10}", heightMm: 3, xMm: 2, yMm: 2 }] };

describe("the label's settings of a work opened (backlog 4.3)", () => {
  it("come back as they were saved, the page apart and nothing chosen on it", () => {
    const settings: LabelSettings = {
      ...START_SETTINGS, symbology: "gs1-128", environment: "distribution", size: 50, hri: "key", version: 7, error: "q",
      gs1128Starts: [0, 3], hriPosition: "split", hriHeightMm: 3, qrMode: "numeric", logistic: "4x6", logisticFrom: "A\nB",
      logisticTwoD: "dl-qrcode", logisticSecond: "es", designer: true, page: PAGE, selected: "t", expert: true, dpi: 300, bearer: "bars",
      cropMarks: true, template: "healthcare-pack", hriFormat: "own", hriPattern: "{title}: {value:DD/MM/YYYY}", hriTitles: "pt-BR",
    };
    const saved = savedSettings(settings);
    expect(Object.keys(saved)).not.toContain("page");
    expect(Object.keys(saved)).not.toContain("selected");
    const work = readWork(workFile({ mode: "one", identification: { key: "01", value: "1", qualifiers: {}, attributes: [] }, answers: {}, picked: null, settings: saved, page: PAGE, printer: null, columns: null }));
    expect(openedSettings(work.settings, work.page, START_SETTINGS)).toEqual({ ...settings, selected: null });
  });

  it("keep the editor's own where a setting is unknown, of another kind or a choice not offered", () => {
    const opened = openedSettings(
      { symbology: "aztec", size: "100", hri: "all", version: "7", error: "x", gs1128Starts: 3, expert: 1, stem: null, cropMarks: "yes", futureSetting: true, designer: true, qrMode: "kanji", logisticSecond: "nl" },
      null,
      START_SETTINGS,
    );
    expect(opened).toEqual(START_SETTINGS); // a label of one's own without its page is off
    expect(Object.keys(opened)).not.toContain("futureSetting");
    expect(openedSettings({ version: null, linearSize: 120, pngResolution: 600 }, null, { ...START_SETTINGS, version: 4 }))
      .toEqual({ ...START_SETTINGS, version: null, linearSize: 120, pngResolution: 600 });
    // The template a label started from (backlog 6.5): one this studio has, or none
    expect(openedSettings({ template: "retail-weight" }, null, START_SETTINGS).template).toBe("retail-weight");
    expect(openedSettings({ template: "a-future-template" }, null, START_SETTINGS).template).toBeNull();
    expect(openedSettings({ template: 3 }, null, START_SETTINGS).template).toBeNull();
    for (const second of ["fr", "de", "it"]) expect(openedSettings({ logisticSecond: second }, null, START_SETTINGS).logisticSecond).toBe(second);
    // The text's format (backlog 6.11): one of the four, the titles in English or one of the five languages
    expect(START_SETTINGS.hriFormat).toBe("ai");
    expect(openedSettings({ hriFormat: "both", hriTitles: "de", hriPattern: "{value}" }, null, START_SETTINGS))
      .toEqual({ ...START_SETTINGS, hriFormat: "both", hriTitles: "de", hriPattern: "{value}" });
    expect(openedSettings({ hriFormat: "fancy", hriTitles: "nl", hriPattern: 3 }, null, START_SETTINGS)).toEqual(START_SETTINGS);
  });
});
