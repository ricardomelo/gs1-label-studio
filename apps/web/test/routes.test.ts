import { describe, expect, it } from "vitest";
import { parseRoute, routeHash, STUDIOS } from "../src/routes.ts";

// The studios' addresses (backlog 7.1 e): hash routes, an anchor of the editor kept in the editor.

describe("parseRoute", () => {
  it("the root, with or without a hash, is the start page", () => {
    for (const hash of ["", "#", "#/", "#//"]) expect(parseRoute(hash)).toEqual({ studio: "start", params: {} });
  });

  it("each studio by its address, a trailing slash allowed, its query read", () => {
    for (const studio of STUDIOS) expect(parseRoute(`#/${studio}`)).toEqual({ studio, params: {} });
    expect(parseRoute("#/label/")).toEqual({ studio: "label", params: {} });
    expect(parseRoute("#/check?r=eJxL&lang=pt-BR")).toEqual({ studio: "check", params: { r: "eJxL", lang: "pt-BR" } });
  });

  it("an unknown address is the start page; an anchor without the slash stays in the editor, as before routes", () => {
    expect(parseRoute("#/moon?x=1")).toEqual({ studio: "start", params: {} });
    expect(parseRoute("#about-title")).toEqual({ studio: "label", params: {}, anchor: "about-title" });
  });
});

describe("routeHash", () => {
  it("writes what parseRoute reads", () => {
    expect(routeHash({ studio: "start" })).toBe("#/");
    expect(routeHash({ studio: "barcode" })).toBe("#/barcode");
    const shared = routeHash({ studio: "label", params: { w: "a b/c" } });
    expect(shared).toBe("#/label?w=a+b%2Fc");
    expect(parseRoute(shared)).toEqual({ studio: "label", params: { w: "a b/c" } });
  });
});
