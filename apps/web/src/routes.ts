// The studios' addresses (backlog 7.1 e; the check studio's project, section 8.3): hash routes, which GitHub Pages
// serves without configuration and which never reach the server. "#/" is the start page that offers the studios;
// "#/label" today's editor, unchanged; "#/barcode" the same editor with the barcode only; "#/rfid" the editor's step 1 with
// the RFID Studio's steps (ADR 0008); "#/check" the Check Studio; a query after the route ("#/check?r=…", "#/label?w=…") carries what a shared link holds. A hash
// without the slash is an anchor of the editor ("#about-title"), as before routes existed: it stays in the editor.

import { useEffect, useState } from "react";

export const STUDIOS = ["label", "barcode", "rfid", "check"] as const;
export type Studio = (typeof STUDIOS)[number];
/** The studios the application has today; the others are offered as coming soon. */
export const READY: ReadonlySet<Studio> = new Set(["label", "barcode", "rfid", "check"]);

export interface Route {
  /** "start" for the start page. */
  studio: Studio | "start";
  /** What follows "?" in the hash. */
  params: Record<string, string>;
  /** An anchor of the editor, kept so that the browser scrolls to it. */
  anchor?: string;
}

/** Reads a location's hash ("#/check?r=…", "#about-title", "") as a route; an unknown route is the start page. */
export function parseRoute(hash: string): Route {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  if (text !== "" && !text.startsWith("/")) return { studio: "label", params: {}, anchor: text };
  const [path = "", query = ""] = text.slice(1).split("?", 2) as [string?, string?];
  const name = path.replace(/\/+$/, "");
  const studio = (STUDIOS as readonly string[]).includes(name) ? (name as Studio) : "start";
  return { studio, params: studio === "start" ? {} : Object.fromEntries(new URLSearchParams(query)) };
}

/** A route as a hash: "#/", "#/check?r=…". */
export function routeHash(route: Pick<Route, "studio"> & { params?: Record<string, string> }): string {
  if (route.studio === "start") return "#/";
  const query = new URLSearchParams(route.params ?? {}).toString();
  return `#/${route.studio}${query ? `?${query}` : ""}`;
}

/** The route of the page's hash, followed as it changes: links, back and forward. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const follow = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return route;
}
