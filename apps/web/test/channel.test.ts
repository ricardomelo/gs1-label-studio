import { describe, expect, it } from "vitest";
import { stored, versionLabel } from "../src/channel.ts";

// Backlog 0.4, ADR 0010: the stable site and develop share an origin, so develop keeps what it keeps under names of
// its own, and the header names the release on the stable site and the commit on develop.
describe("channels", () => {
  it("keeps the stable site's names as they always were and gives develop its own", () => {
    expect(stored("gs1-label-studio", "stable")).toBe("gs1-label-studio");
    expect(stored("gs1-label-studio.locale", "stable")).toBe("gs1-label-studio.locale");
    expect(stored("gs1-label-studio", "develop")).toBe("gs1-label-studio-develop");
    expect(stored("gs1-label-studio.locale", "develop")).toBe("gs1-label-studio-develop.locale");
    expect(stored("gs1-label-studio.columns.a\u001fb", "develop")).toBe("gs1-label-studio-develop.columns.a\u001fb");
    expect(() => stored("locale", "develop")).toThrow(/starts with gs1-label-studio/);
  });

  it("this build's names are the stable site's (no CHANNEL given)", () => {
    expect(stored("gs1-label-studio.printers")).toBe("gs1-label-studio.printers");
  });

  it("names the release and its day on the stable site, the commit on develop", () => {
    const build = { commit: "abc1234", date: "2026-11-21T00:40:00+00:00", version: "1.0.0" };
    expect(versionLabel({ ...build, channel: "stable" })).toBe("1.0.0 · 2026-11-21");
    expect(versionLabel({ ...build, date: "", channel: "stable" })).toBe("1.0.0");
    expect(versionLabel({ ...build, channel: "develop" })).toBe("develop · abc1234");
    expect(versionLabel({ ...build, commit: "", channel: "develop" })).toBe("develop");
  });
});
