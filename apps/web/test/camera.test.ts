import { readingFromText, type DecodedSymbol } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { cameraProblem, mayHaveComposite, pictureSize, readingKey, readingsOf, RecentReadings, SAME_READING_MS, trackControls } from "../src/camera.ts";
import { symbolName } from "../src/Picture.tsx";

// The Check Studio's camera and pictures (backlog 7.1 g; the check studio's project, sections 3.2 and 3.3): what can
// be said without a camera. The camera and the pictures themselves are e2e/check-camera.spec.ts.

const symbol = (over: Partial<DecodedSymbol> = {}): DecodedSymbol => ({
  format: "DataMatrix",
  symbologyIdentifier: "]d2",
  bytes: new TextEncoder().encode("0109506000134352"),
  position: { topLeft: { x: 10, y: 20 }, topRight: { x: 110, y: 20 }, bottomRight: { x: 110, y: 120 }, bottomLeft: { x: 10, y: 120 } },
  ...over,
});

describe("the camera's problems", () => {
  it("name a refused, missing or busy camera from the error's name", () => {
    expect(cameraProblem(new DOMException("", "NotAllowedError"))).toBe("refused");
    expect(cameraProblem(new DOMException("", "SecurityError"))).toBe("refused");
    expect(cameraProblem(new DOMException("", "NotFoundError"))).toBe("none");
    expect(cameraProblem(new DOMException("", "OverconstrainedError"))).toBe("none");
    expect(cameraProblem(new DOMException("", "NotReadableError"))).toBe("busy");
    expect(cameraProblem(new DOMException("", "AbortError"))).toBe("busy");
    expect(cameraProblem(new Error("what"))).toBe("other");
    expect(cameraProblem(null)).toBe("other");
  });
});

describe("the track's controls", () => {
  it("offer a torch and a zoom only where the capabilities say so", () => {
    expect(trackControls(undefined)).toEqual({ torch: false, zoom: null });
    expect(trackControls({ torch: true, zoom: { min: 1, max: 8, step: 0.1 } })).toEqual({ torch: true, zoom: { min: 1, max: 8, step: 0.1 } });
    // Some browsers list the torch's values
    expect(trackControls({ torch: [false, true] }).torch).toBe(true);
    expect(trackControls({ torch: [false] }).torch).toBe(false);
    // A zoom that cannot change is none; a step of 0 is given one
    expect(trackControls({ zoom: { min: 1, max: 1, step: 0.1 } }).zoom).toBeNull();
    expect(trackControls({ zoom: { min: 1, max: 4, step: 0 } }).zoom).toEqual({ min: 1, max: 4, step: 0.1 });
  });
});

describe("the same reading within three seconds", () => {
  it("counts once; again after the interval; another symbol at once", () => {
    const recent = new RecentReadings();
    expect(recent.isNew("a", 0)).toBe(true);
    expect(recent.isNew("a", 200)).toBe(false);
    expect(recent.isNew("b", 300)).toBe(true);
    // Held in front of the camera the whole time, it stays one reading
    expect(recent.isNew("a", 200 + SAME_READING_MS)).toBe(false);
    expect(recent.isNew("a", 400 + 2 * SAME_READING_MS + 1)).toBe(true);
  });
  it("tells symbols apart by their identifier and bytes", () => {
    const [a] = readingsOf([symbol()], "camera", { width: 640, height: 480 });
    const [b] = readingsOf([symbol({ symbologyIdentifier: "]d1" })], "camera", { width: 640, height: 480 });
    expect(readingKey(a!)).toBe("]d2 30 31 30 39 35 30 36 30 30 30 31 33 34 33 35 32");
    expect(readingKey(a!)).not.toBe(readingKey(b!));
  });
});

describe("the readings of a frame or a picture", () => {
  it("keep the decoder's bytes, identifier, corners and the picture's size", () => {
    const [r] = readingsOf([symbol()], "image", { width: 800, height: 600 }, new Date("2026-11-16T12:00:00Z"));
    expect(r).toMatchObject({ source: "image", carrier: "barcode", symbologyIdentifier: "]d2", text: "0109506000134352", image: { width: 800, height: 600 }, at: "2026-11-16T12:00:00.000Z" });
    expect(r!.position).toEqual([[10, 20], [110, 20], [110, 120], [10, 120]]);
  });
  it("say when a linear symbol read by the camera or in a picture may have a Composite part left out", () => {
    const of = (id: string, source: "camera" | "image" = "camera") => readingsOf([symbol({ symbologyIdentifier: id })], source, { width: 1, height: 1 })[0]!;
    for (const id of ["]E0", "]E4", "]C1", "]e0"]) expect(mayHaveComposite(of(id)), id).toBe(true);
    expect(mayHaveComposite(of("]e0", "image"))).toBe(true);
    for (const id of ["]d2", "]Q3", "]I1", "]C0"]) expect(mayHaveComposite(of(id)), id).toBe(false);
    // Typed text says nothing of what was printed beside it
    expect(mayHaveComposite(readingFromText("]E09506000134352", { source: "paste" }))).toBe(false);
  });
  it("name each symbol as a person knows it", () => {
    const name = (over: Partial<DecodedSymbol>) => symbolName(readingsOf([symbol(over)], "image", { width: 1, height: 1 })[0]!);
    expect(name({})).toBe("GS1 DataMatrix");
    expect(name({ symbologyIdentifier: "]d1" })).toBe("Data Matrix");
    expect(name({ format: "QRCode", symbologyIdentifier: "]Q3" })).toBe("GS1 QR Code");
    expect(name({ format: "QRCode", symbologyIdentifier: "]Q1" })).toBe("QR Code");
    expect(name({ format: "EAN13", symbologyIdentifier: "]E0" })).toBe("EAN-13");
    expect(name({ format: "DataBarExp", symbologyIdentifier: "]e0" })).toBe("GS1 DataBar Expanded");
    expect(name({ format: "Code128", symbologyIdentifier: "]C1" })).toBe("GS1-128");
    expect(name({ format: "Code128", symbologyIdentifier: "]C0" })).toBe("Code 128");
  });
});

describe("a picture's size", () => {
  it("is kept up to the limit, and scaled down to it on the longest side", () => {
    expect(pictureSize(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(pictureSize(4800, 3600)).toEqual({ width: 2400, height: 1800 });
    expect(pictureSize(3000, 6000)).toEqual({ width: 1200, height: 2400 });
    expect(pictureSize(0, 0, 10)).toEqual({ width: 1, height: 1 });
  });
});
