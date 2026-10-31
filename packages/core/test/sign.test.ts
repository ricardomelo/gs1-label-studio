import { createHash, createPublicKey, verify } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  authenticityProblem,
  generateSigningKey,
  hideAuthenticationCode,
  isoDate,
  jwkThumbprint,
  keyCredential,
  productDataCredential,
  signCredential,
  signedPayload,
  signingKeyFrom,
  signJws,
  syntaxEngine,
  verifyJws,
  type SigningKey,
  type SyntaxEngine,
} from "../src/index.ts";

// Digital signatures over the Web (backlog 1.18): GS1 Digital Signatures Technical Implementation Guideline 1.1.0,
// section 4 (a JWS of JSON-LD, workflows 1 to 3), and the GS1 VC data model 1.2.1's credentials as JWTs. Every
// signature is checked by Node's own crypto as well, an implementation independent of the Web Crypto that made it.

let engine: SyntaxEngine;
let key: SigningKey;
beforeAll(async () => {
  engine = await syntaxEngine();
  key = await generateSigningKey();
});

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
/** Node's verdict on a compact JWS signed with ES256. */
function nodeVerifies(jws: string, jwk: JsonWebKey): boolean {
  const [header, body, signature] = jws.split(".");
  const publicKey = createPublicKey({ key: { kty: jwk.kty!, crv: jwk.crv!, x: jwk.x!, y: jwk.y! }, format: "jwk" });
  return verify("sha256", Buffer.from(`${header}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url"));
}

const UV = { type: "gs1:SecurityMarking-UVINK", instructions: "look on side of pack", regularExpression: "[A-Z0-9]{11}", value: "UV389JKG4M2" };
const identified = () => engine.parse("(01)09506000151519(21)12345678p901(10)1234567p(17)221105", "https://dalgiardino.com");

describe("the payload", () => {
  it("is figure 4-7's JSON-LD: the GS1 Digital Link URI as id, the GTIN, serial, batch, expiry as xsd:date, names, marking", () => {
    const payload = signedPayload(identified(), { productName: "Finest Truffle Tapenade", brandName: "Dal Giardino", authenticity: UV }, new Date("2026-10-31"));
    expect(payload).toEqual({
      "@context": { gs1: "https://gs1.org/voc/", id: "@id", a: "@type", lang: "@language", value: "@value", type: "@type", xsd: "http://www.w3.org/2001/XMLSchema#" },
      id: "https://dalgiardino.com/01/09506000151519/10/1234567p/21/12345678p901?17=221105",
      a: "gs1:Product",
      "gs1:gtin": "09506000151519",
      "gs1:hasSerialNumber": "12345678p901",
      "gs1:hasBatchLotNumber": "1234567p",
      "gs1:expirationDate": { value: "2022-11-05", type: "xsd:date" },
      "gs1:productName": { value: "Finest Truffle Tapenade", lang: "en" },
      "gs1:brand": { "gs1:brandName": { value: "Dal Giardino", lang: "en" } },
      "gs1:authenticity": {
        "gs1:authenticitySecurityFeatureType": "gs1:SecurityMarking-UVINK",
        "gs1:authenticitySecurityFeatureInstructions": { value: "look on side of pack", lang: "en" },
        "gs1:authenticitySecurityFeatureRegularExpression": "[A-Z0-9]{11}",
        "gs1:authenticitySecurityFeatureValue": "UV389JKG4M2",
      },
    });
  });

  it("dates YYMMDD as section 7.12 chooses the century (49 years back, 50 ahead); day 00 is the month's last", () => {
    const today = new Date("2026-10-31");
    expect(isoDate("761231", today)).toBe("2076-12-31");
    expect(isoDate("770101", today)).toBe("1977-01-01");
    expect(isoDate("270200", today)).toBe("2027-02-28");
    expect(isoDate("280200", today)).toBe("2028-02-29");
    // Near the end of a century: 50 years back is too far, so the next century
    expect(isoDate("410101", new Date("2090-06-01"))).toBe("2041-01-01");
    expect(isoDate("400101", new Date("2090-06-01"))).toBe("2140-01-01");
  });

  it("checks a marking's code against its regular expression", () => {
    expect(authenticityProblem(UV)).toBeNull();
    expect(authenticityProblem({ ...UV, value: "uv389" })).toMatch(/does not match \[A-Z0-9\]\{11\}/);
    expect(authenticityProblem({ ...UV, regularExpression: "[A-" })).toMatch(/not a regular expression/);
    expect(authenticityProblem({ ...UV, value: "" })).toMatch(/needs its kind and its code/);
  });
});

describe("signing", () => {
  it("writes a compact JWS with ES256 and the key's thumbprint as kid, which Node verifies too", async () => {
    const payload = signedPayload(identified(), { authenticity: UV });
    const jws = await signJws(payload, key);
    const [header, body] = jws.split(".");
    expect(decode(header!)).toEqual({ alg: "ES256", typ: "JOSE", kid: key.kid });
    expect(decode(body!)).toEqual(payload);
    expect(nodeVerifies(jws, key.publicJwk)).toBe(true);
    expect((await verifyJws(jws, key.publicJwk)).valid).toBe(true);
    // RFC 7638's thumbprint, computed here by Node's SHA-256
    const { crv, kty, x, y } = key.publicJwk;
    expect(key.kid).toBe(createHash("sha256").update(JSON.stringify({ crv, kty, x, y })).digest("base64url"));
    expect(await jwkThumbprint(key.publicJwk)).toBe(key.kid);
  });

  it("refuses a payload changed after signing, and another key", async () => {
    const jws = await signJws(signedPayload(identified()), key);
    const [header, , signature] = jws.split(".");
    const forged = `${header}.${Buffer.from(JSON.stringify({ id: "https://evil.example/01/09506000151519" })).toString("base64url")}.${signature}`;
    expect((await verifyJws(forged, key.publicJwk)).valid).toBe(false);
    expect(nodeVerifies(forged, key.publicJwk)).toBe(false);
    const other = await generateSigningKey();
    expect((await verifyJws(jws, other.publicJwk)).valid).toBe(false);
  });

  it("workflow 3: with the code taken out, verifies only once the code read from the marking is put back", async () => {
    const jws = await signJws(signedPayload(identified(), { authenticity: UV }), key);
    const hidden = hideAuthenticationCode(jws);
    expect((decode(hidden.split(".")[1]!)["gs1:authenticity"] as Record<string, string>)["gs1:authenticitySecurityFeatureValue"]).toBe("");
    expect((await verifyJws(hidden, key.publicJwk)).valid).toBe(false);
    expect((await verifyJws(hidden, key.publicJwk, "UV389JKG4M3")).valid).toBe(false);
    expect((await verifyJws(hidden, key.publicJwk, "UV389JKG4M2")).valid).toBe(true);
    expect(() => hideAuthenticationCode(jws.replace(/\.[^.]+\./, `.${Buffer.from("{}").toString("base64url")}.`))).toThrow(/no security marking/);
  });

  it("takes back a key the person saved, with the same kid; refuses what is not a private P-256 key", async () => {
    const again = await signingKeyFrom(key.privateJwk);
    expect(again.kid).toBe(key.kid);
    expect(nodeVerifies(await signJws({ a: 1 }, again), key.publicJwk)).toBe(true);
    await expect(signingKeyFrom(key.publicJwk)).rejects.toThrow(/not a private EC P-256 key/);
  });
});

describe("GS1 verifiable credentials (data model 1.2.1)", () => {
  it("writes the key and product data credentials as its examples 5.5.1 and 5.6.1 do, secured as JWTs", async () => {
    const issued = new Date("2026-10-31T12:00:00Z");
    const product = engine.parse("(01)07541234555551", "https://id.gs1.org");
    const keyVc = keyCredential(product, { issuer: "did:web:www.example.ca", id: "urn:uuid:1", issued });
    expect(keyVc).toEqual({
      "@context": ["https://www.w3.org/2018/credentials/v1", "https://ref.gs1.org/gs1/vc/declaration-context/"],
      id: "urn:uuid:1", type: ["VerifiableCredential", "KeyCredential"], issuer: "did:web:www.example.ca",
      issuanceDate: "2026-10-31T12:00:00Z", credentialSubject: { id: "https://id.gs1.org/01/07541234555551" },
    });
    const data = productDataCredential(product, { brandName: "The Best Example", productName: "Never Give Up NRG Drink" },
      { issuer: "did:web:www.example.ca", id: "urn:uuid:2", issued, keyCredential: "urn:uuid:1" });
    expect(data.type).toEqual(["VerifiableCredential", "ProductDataCredential"]);
    expect(data.credentialSubject).toEqual({
      id: "https://id.gs1.org/01/07541234555551", keyAuthorization: "urn:uuid:1",
      product: { "gs1:brand": { "gs1:brandName": "The Best Example" }, "gs1:productDescription": "Never Give Up NRG Drink" },
    });
    const jwt = await signCredential(data, key);
    expect(decode(jwt.split(".")[0]!)).toEqual({ alg: "ES256", typ: "JWT", kid: key.kid });
    expect(decode(jwt.split(".")[1]!)).toEqual({
      iss: "did:web:www.example.ca", sub: "https://id.gs1.org/01/07541234555551", jti: "urn:uuid:2", nbf: 1793448000, vc: data,
    });
    expect(nodeVerifies(jwt, key.publicJwk)).toBe(true);
    expect(keyCredential(product, { issuer: "did:web:x" }).id).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });
});
