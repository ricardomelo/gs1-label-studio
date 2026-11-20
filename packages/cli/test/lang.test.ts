import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo, Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntaxEngine } from "@gs1-label-studio/core";
import ptBR from "../../../apps/web/src/locales/pt-BR.json";
import ptBRMessages from "../../../apps/web/src/locales/pt-BR.messages.json";
import es from "../../../apps/web/src/locales/es.json";
import { SIMPLE_TEXTS } from "../../../apps/web/src/checkTexts.ts";
import { hriFont } from "../../core/test/font.ts";
import { LANGUAGES, OWN } from "../src/lang.ts";
import { run } from "../src/main.ts";
import { serve } from "../src/serve.ts";

// gs1ls --lang (backlog 5.1 d, ADR 0009 decision 5): what the command line says about the data in the page's
// languages, from the page's catalogues: the verdict, the Check Studio's plain words for each finding, the core's and
// the engine's messages, the EPC's reasons, the labels of its text; gs1ls serve by the request's Accept-Language.

const BAD = "(01)09506000134377(10)B42";

describe("gs1ls --lang", () => {
  it("checks in the language asked: the verdict, the plain words of the page, in text and JSON", async () => {
    const text = (await run(["check", BAD, "--lang", "pt-BR"])).stdout as string;
    const c1 = SIMPLE_TEXTS.C1!;
    expect(text.split("\n").slice(0, 5)).toEqual([
      OWN["pt-BR"]["Does not follow the GS1 rules."],
      "",
      `C1 (error) AI (01): ${(ptBR as Record<string, string>)[c1.what]}`,
      `  ${(ptBR as Record<string, string>)["Why it matters:"]} ${(ptBR as Record<string, string>)[c1.why]}`,
      `  ${(ptBR as Record<string, string>)["How to fix:"]} ${(ptBR as Record<string, string>)[c1.fix]}`,
    ]);
    const json = JSON.parse((await run(["check", BAD, "--json", "--lang", "es"])).stdout as string);
    expect(json.findings[0].plain).toEqual({ what: (es as Record<string, string>)[c1.what], why: (es as Record<string, string>)[c1.why], fix: (es as Record<string, string>)[c1.fix] });
    // the codes, severities and the catalogue's own texts stay as they are, for a program
    expect(json.findings[0]).toMatchObject({ code: "C1", severity: "error", what: expect.stringMatching(/^Wrong check digit/) });
    // English unchanged: the catalogue's expert texts, the plain words in JSON in English
    expect((await run(["check", BAD])).stdout).toContain("C1 (error) AI (01): Wrong check digit");
    expect(JSON.parse((await run(["check", BAD, "--json"])).stdout as string).findings[0].plain.what).toBe(c1.what);
  });

  it("says the core's and the engine's refusals, the EPC's reasons and its labels in the language asked", async () => {
    // the engine's message through the catalogue's template "AI ({p1}): {p2}", its parts translated in turn
    expect((await run(["label", "(01)09506000134377"])).stderr).toBe("AI (01): The numeric check digit is incorrect.\n");
    expect((ptBRMessages as Record<string, string>)["The numeric check digit is incorrect."]).toBe("O dígito verificador está incorreto.");
    expect((await run(["label", "(01)09506000134377", "--lang", "pt-BR"])).stderr).toBe("AI (01): O dígito verificador está incorreto.\n");
    expect((await run(["epc", "(01)09506000134352", "--prefix-length", "7", "--lang", "fr"])).stderr).toBe("L’EPC de cette clé a besoin de son qualificatif (21), comme le numéro de série.\n");
    const epc = (await run(["epc", "(01)09506000134352(21)1", "--prefix-length", "7", "--lang", "de"])).stdout as string;
    expect(epc).toContain("Schema: sgtin-96, Filter 1, 96 Bit\n");
    expect(epc).toContain("EPC (ab Bit 20h): ");
    // +AIDC data an EPC+ cannot carry, its reason said in the language asked (IMEI has no encoding after an EPC)
    const imei = "(01)09506000134352(21)1(8040)490154203237518";
    expect((await run(["epc", imei, "--scheme", "plus"])).stdout).toContain("Not carried: (8040) cannot follow an EPC: the EPC Tag Data Standard has no encoding for it.\n");
    expect((await run(["epc", imei, "--scheme", "plus", "--lang", "pt-BR"])).stdout).toContain("Não incluído: (8040) não pode vir depois de um EPC: o EPC Tag Data Standard não tem codificação para ele.\n");
  });

  it("counts a bulk run's rows in the language asked; the files stay in English", async () => {
    const csv = join(mkdtempSync(join(tmpdir(), "gs1ls-")), "rows.csv");
    writeFileSync(csv, "GTIN\n09506000134376\n123\n");
    const out = await run(["bulk", csv, "--lang", "pt-BR"], () => undefined);
    expect(out.stderr).toBe("labels.zip\n1 de 2 linhas geradas; 1 deixadas de fora (os motivos estão em generated.csv)\n");
  });

  it("refuses a language it does not speak; a region of one it does is taken", async () => {
    expect(await run(["check", BAD, "--lang", "nl"])).toMatchObject({ status: 2, stderr: `--lang is one of: ${LANGUAGES.join(", ")}.\n` });
    expect(((await run(["check", BAD, "--lang", "es-MX"])).stdout as string).split("\n")[0]).toBe(OWN.es["Does not follow the GS1 rules."]);
  });

  it("has every label the command line says in each of the five languages, with the same placeholders", () => {
    const sources = readdirSync(new URL("../src", import.meta.url)).filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n");
    const said = [...new Set([...sources.matchAll(/lang\.t\("((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string))];
    const block = sources.slice(sources.indexOf("const VERDICTS"), sources.indexOf("};", sources.indexOf("const VERDICTS")));
    const verdicts = [...block.matchAll(/: "([^"]+)",/g)].map((m) => m[1]!);
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    expect(said.length).toBeGreaterThan(10);
    expect(verdicts).toHaveLength(5);
    for (const [tag, own] of Object.entries(OWN)) {
      const page = JSON.parse(readFileSync(new URL(`../../../apps/web/src/locales/${tag}.json`, import.meta.url), "utf8")) as Record<string, string>;
      for (const text of [...said, ...verdicts]) {
        const translation = own[text] ?? page[text];
        expect(translation, `${tag}: ${text}`).toBeTruthy();
        expect(placeholders(translation!), `${tag}: ${text}`).toBe(placeholders(text));
      }
      // nothing in locales.json that the command line does not say, or that the page's catalogue already has
      for (const key of Object.keys(own)) expect([...said, ...verdicts], `${tag}: ${key}`).toContain(key);
    }
  });
});

describe("gs1ls serve's languages", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = await serve(await syntaxEngine(), hriFont(), { port: 0, lang: "de" }) as unknown as Server;
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("follows the request's Accept-Language, else its own --lang", async () => {
    const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`${base}${route}`, { method: "POST", body: JSON.stringify(body), headers });
    const spanish = await (await post("/check", { data: BAD }, { "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" })).json();
    expect(spanish.findings[0].plain.what).toBe((es as Record<string, string>)[SIMPLE_TEXTS.C1!.what]);
    const refused = await post("/epc", { data: "(01)09506000134352", prefixLength: 7 });
    expect(refused.headers.get("content-language")).toBe("de");
    expect((await refused.json()).error).toMatch(/^Der EPC dieses Schlüssels braucht/);
  });
});
