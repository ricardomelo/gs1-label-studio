/// <reference path="./build.d.ts" />
// The two published sites (backlog 0.4, ADR 0010): main, the last release, at the site's root ("stable"), and develop,
// the work in progress, under /develop/ for the owner's tests ("develop"). Both are on the same origin, so they would
// share the browser's storage; a develop that upgraded the database could then leave the stable site unable to open
// it. So develop keeps everything under names of its own, and the stable site's names are the ones it always had.

export type Channel = "stable" | "develop";

/** The channel this build was made for (stable where no build defines it, as in gs1ls, which imports the page's texts). */
export const CHANNEL: Channel = typeof __BUILD__ === "undefined" ? "stable" : __BUILD__.channel;

/** The name under which `name` (a storage key or database starting with "gs1-label-studio") is kept in `channel`. */
export function stored(name: string, channel: Channel = CHANNEL): string {
  if (!name.startsWith("gs1-label-studio")) throw new Error(`A kept name starts with gs1-label-studio: ${name}`);
  return channel === "develop" ? `gs1-label-studio-develop${name.slice("gs1-label-studio".length)}` : name;
}

/** What the header shows: the release on the stable site, the commit on develop (both link to About). */
export function versionLabel(build: { commit: string; date: string; version: string; channel: Channel } = __BUILD__): string {
  if (build.channel === "develop") return build.commit ? `develop · ${build.commit}` : "develop";
  const date = build.date ? new Date(build.date).toISOString().slice(0, 10) : "";
  return date ? `${build.version} · ${date}` : build.version;
}
