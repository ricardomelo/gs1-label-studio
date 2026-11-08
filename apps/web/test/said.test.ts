import type { DesignBox, DesignImage, DesignLine, DesignPage, DesignSymbol, DesignText, PlacedElement } from "@gs1-label-studio/core";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../src/i18n.ts";
import { keyEnd, placeSaid, sizeSaid } from "../src/said.ts";

// What an arrow key did on a label of one's own, said after it (backlog 4.2, mock-up B of two, 7 November 2026): the
// element's new place or size, in the hint under its outline or handle and in a live region for a screen reader; the end
// of its sizes and the label's edge said too.

const page: DesignPage = { widthMm: 100, heightMm: 60, elements: [] };
const at = (xMm: number, yMm: number, widthMm: number, heightMm: number): PlacedElement => ({ id: "e1", xMm, yMm, widthMm, heightMm });
const box: DesignBox = { id: "e1", kind: "box", widthMm: 40, heightMm: 20.5, thicknessMm: 0.5, filled: false, xMm: 2.5, yMm: 7 };

afterEach(() => setLocale("en", false));

describe("what an arrow key on the outline says", () => {
  it("the element's top left corner, as Left and Top say, in the interface's language", () => {
    expect(placeSaid(box, at(2.5, 7, 40, 20.5), page)).toBe("Left 2.5 mm · top 7 mm");
    expect(placeSaid({ ...box, xMm: 0, yMm: 39.5 }, at(0, 39.5, 40, 20.5), page)).toBe("Left 0 mm · top 39.5 mm"); // at the foot, not past it
    expect(placeSaid({ ...box, xMm: 60, yMm: 0 }, at(60, 0, 40, 20.5), page)).toBe("Left 60 mm · top 0 mm"); // at the right edge and the top
    setLocale("pt-BR", false);
    expect(placeSaid(box, at(2.5, 7, 40, 20.5), page)).toBe("Esquerda 2,5 mm · topo 7 mm");
    setLocale("es", false);
    expect(placeSaid(box, at(2.5, 7, 40, 20.5), page)).toBe("Izquierda 2,5 mm · arriba 7 mm");
  });

  it("the label's edge when the element's box runs past any of its four sides", () => {
    expect(placeSaid({ ...box, xMm: 70 }, at(70, 7, 40, 20.5), page)).toBe("Left 70 mm · top 7 mm · past the label's edge");
    expect(placeSaid({ ...box, xMm: -0.5 }, at(-0.5, 7, 40, 20.5), page)).toBe("Left -0.5 mm · top 7 mm · past the label's edge");
    expect(placeSaid({ ...box, yMm: -0.5 }, at(2.5, -0.5, 40, 20.5), page)).toMatch(/past the label's edge$/);
    expect(placeSaid({ ...box, yMm: 40 }, at(2.5, 40, 40, 20.5), page)).toMatch(/past the label's edge$/);
    setLocale("pt-BR", false);
    expect(placeSaid({ ...box, xMm: 70 }, at(70, 7, 40, 20.5), page)).toBe("Esquerda 70 mm · topo 7 mm · passa da borda da etiqueta");
  });

  it("the label's edge reached when the key moved the element less than its step, held within the label", () => {
    expect(placeSaid({ ...box, xMm: 60 }, at(60, 7, 40, 20.5), page, true)).toBe("Left 60 mm · top 7 mm · at the label's edge");
    expect(placeSaid({ ...box, xMm: 0 }, at(0, 7, 40, 20.5), page, true)).toBe("Left 0 mm · top 7 mm · at the label's edge");
    expect(placeSaid({ ...box, xMm: 60 }, at(60, 7, 40, 20.5), page, false)).toBe("Left 60 mm · top 7 mm"); // a full step to the edge
    // Already past the edge, held from going further: past the edge alone
    expect(placeSaid({ ...box, xMm: 70 }, at(70, 7, 40, 20.5), page, true)).toBe("Left 70 mm · top 7 mm · past the label's edge");
    setLocale("pt-BR", false);
    expect(placeSaid({ ...box, xMm: 60 }, at(60, 7, 40, 20.5), page, true)).toBe("Esquerda 60 mm · topo 7 mm · na borda da etiqueta");
    setLocale("es", false);
    expect(placeSaid({ ...box, xMm: 60 }, at(60, 7, 40, 20.5), page, true)).toBe("Izquierda 60 mm · arriba 7 mm · en el borde de la etiqueta");
  });
});

describe("what an arrow key on the handle says", () => {
  it("each kind's size as its properties give it", () => {
    expect(sizeSaid(box, at(2.5, 7, 40, 20.5), page, 0)).toBe("Width 40 mm · height 20.5 mm");
    const line: DesignLine = { id: "e1", kind: "line", vertical: true, lengthMm: 26.5, thicknessMm: 0.5, xMm: 4, yMm: 4 };
    expect(sizeSaid(line, at(4, 4, 0.5, 26.5), page, 0)).toBe("Length 26.5 mm");
    // An image's height from its proportions, to a tenth of a millimetre as its properties show it
    const image: DesignImage = { id: "e1", kind: "image", name: "logo", picture: { width: 360, height: 150, bits: "" }, widthMm: 20.5, xMm: 60, yMm: 6 };
    expect(sizeSaid(image, at(60, 6, 20.5, 8.54), page, 0)).toBe("Width 20.5 mm · height 8.5 mm");
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 120, hri: true, xMm: 2, yMm: 2 };
    expect(sizeSaid(symbol, at(2, 2, 20, 30), page, 0)).toBe("Size 120 %");
    const text: DesignText = { id: "e1", kind: "text", text: "T", heightMm: 3.5, xMm: 4, yMm: 52 };
    expect(sizeSaid(text, at(4, 52, 3, 4), page, 0)).toBe("Text height 3.5 mm");
    setLocale("pt-BR", false);
    expect(sizeSaid(box, at(2.5, 7, 40, 20.5), page, 0)).toBe("Largura 40 mm · altura 20,5 mm");
    expect(sizeSaid(text, at(4, 52, 3, 4), page, 0)).toBe("Altura do texto 3,5 mm");
    setLocale("es", false);
    expect(sizeSaid(symbol, at(2, 2, 20, 30), page, 0)).toBe("Tamaño 120 %");
  });

  it("the end of its sizes, and the label's edge after it", () => {
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 2, yMm: 2 };
    expect(sizeSaid(symbol, at(2, 2, 20, 30), page, -1)).toBe("Size 100 % · no smaller size");
    expect(sizeSaid({ ...symbol, size: 200 }, at(2, 2, 40, 50), page, 1)).toBe("Size 200 % · no larger size");
    expect(sizeSaid({ ...symbol, size: 200 }, at(70, 2, 40, 50), page, 1)).toBe("Size 200 % · no larger size · past the label's edge");
    setLocale("pt-BR", false);
    expect(sizeSaid(symbol, at(2, 2, 20, 30), page, -1)).toBe("Tamanho 100 % · não há tamanho menor");
  });

  it("an end only when the key changed nothing, and never for a line's keys across it", () => {
    expect(keyEnd(box, { ...box, widthMm: 40.5 }, "ArrowRight")).toBe(0);
    expect(keyEnd(box, box, "ArrowLeft")).toBe(-1);
    expect(keyEnd(box, box, "ArrowUp")).toBe(-1);
    expect(keyEnd(box, box, "ArrowRight")).toBe(1);
    expect(keyEnd(box, box, "ArrowDown")).toBe(1);
    const down: DesignLine = { id: "e1", kind: "line", vertical: true, lengthMm: 0.5, thicknessMm: 0.5, xMm: 4, yMm: 4 };
    expect(keyEnd(down, down, "ArrowLeft")).toBe(0); // across it
    expect(keyEnd(down, down, "ArrowUp")).toBe(-1); // along it, at its shortest
    const across: DesignLine = { ...down, vertical: false };
    expect(keyEnd(across, across, "ArrowDown")).toBe(0);
    expect(keyEnd(across, across, "ArrowLeft")).toBe(-1);
  });
});
