import type { Identified } from "./identify.ts";

/** What a signature or a credential is about: the element strings and the GS1 Digital Link URI. */
type Signed = Pick<Identified, "elements" | "digitalLinkUri">;

// Digital signatures over the Web (backlog 1.18), as the GS1 Digital Signatures Technical Implementation Guideline 1.1.0
// (January 2026), section 4, describes them: a JSON Web Signature (RFC 7515) whose payload is JSON-LD about the
// physical entity, with the GS1 Web Vocabulary, its GS1 Digital Link URI as the subject (figure 4-7); optionally the
// code of a physical security marking (gs1:AuthenticityDetails), revealed (workflow 2) or removed after signing, so that
// the person reads it from the marking before the signature can be verified (workflow 3). And the GS1 Verifiable
// Credentials data model 1.2.1's key and product data credentials, secured as JSON Web Tokens. Keys are made and used
// with the browser's Web Crypto (ECDSA P-256, ES256) and never leave it unless the person saves them.
//
// Not here: the ISO/IEC 20248 DigSig carried in AI (8030) (guideline section 3), whose binary encoding is defined by
// ISO/IEC 20248 itself, which the studio does not have.

export interface AuthenticityDetails {
  /** The kind of security marking, a GS1 Web Vocabulary code such as "gs1:SecurityMarking-UVINK". */
  type: string;
  /** Where to look for it, e.g. "look on side of pack". */
  instructions: string;
  /** What its code looks like, e.g. "[A-Z0-9]{11}". */
  regularExpression: string;
  /** The code itself. */
  value: string;
}

export interface SignedDetails {
  productName?: string;
  brandName?: string;
  /** The language of the names and instructions; "en" when not given. */
  language?: string;
  authenticity?: AuthenticityDetails;
}

/** A date AI's YYMMDD as an xsd:date: the century as section 7.12 of the General Specifications chooses it; day 00 is the month's last. */
export function isoDate(yymmdd: string, today = new Date()): string {
  const yy = Number(yymmdd.slice(0, 2));
  const now = today.getUTCFullYear();
  let year = Math.floor(now / 100) * 100 + yy;
  if (year - now >= 51) year -= 100;
  else if (now - year > 49) year += 100;
  const month = Number(yymmdd.slice(2, 4));
  const day = yymmdd.slice(4, 6) === "00" ? new Date(Date.UTC(year, month, 0)).getUTCDate() : Number(yymmdd.slice(4, 6));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Element strings the GS1 Web Vocabulary names a product's property for, with how its value is written.
const PROPERTIES: Record<string, [string, "text" | "date"]> = {
  "01": ["gs1:gtin", "text"],
  "10": ["gs1:hasBatchLotNumber", "text"],
  "21": ["gs1:hasSerialNumber", "text"],
  "11": ["gs1:productionDate", "date"],
  "13": ["gs1:packagingDate", "date"],
  "15": ["gs1:bestBeforeDate", "date"],
  "16": ["gs1:sellByDate", "date"],
  "17": ["gs1:expirationDate", "date"],
};

/**
 * The payload to sign, as figure 4-7 of the guideline writes it: JSON-LD with the GS1 Web Vocabulary, the GS1 Digital
 * Link URI as its id, the GTIN, serial and batch, the dates as xsd:date, the names in their language, and the security
 * marking when there is one. A key other than a GTIN is described by its URI alone.
 */
export function signedPayload(identified: Signed, details: SignedDetails = {}, today = new Date()): Record<string, unknown> {
  const lang = details.language || "en";
  const payload: Record<string, unknown> = {
    "@context": { gs1: "https://gs1.org/voc/", id: "@id", a: "@type", lang: "@language", value: "@value", type: "@type", xsd: "http://www.w3.org/2001/XMLSchema#" },
    id: identified.digitalLinkUri,
  };
  const gtin = identified.elements.some((e) => e.ai === "01");
  if (gtin) payload.a = "gs1:Product";
  for (const e of identified.elements) {
    const property = gtin ? PROPERTIES[e.ai] : undefined;
    if (!property || property[0] in payload) continue;
    payload[property[0]] = property[1] === "date" ? { value: isoDate(e.value, today), type: "xsd:date" } : e.value;
  }
  if (details.productName) payload["gs1:productName"] = { value: details.productName, lang };
  if (details.brandName) payload["gs1:brand"] = { "gs1:brandName": { value: details.brandName, lang } };
  if (details.authenticity) {
    const a = details.authenticity;
    payload["gs1:authenticity"] = {
      "gs1:authenticitySecurityFeatureType": a.type,
      "gs1:authenticitySecurityFeatureInstructions": { value: a.instructions, lang },
      "gs1:authenticitySecurityFeatureRegularExpression": a.regularExpression,
      "gs1:authenticitySecurityFeatureValue": a.value,
    };
  }
  return payload;
}

/** What is wrong with a security marking's details, or null: its code must match its regular expression. */
export function authenticityProblem(a: AuthenticityDetails): string | null {
  if (!a.type || !a.value) return "A security marking needs its kind and its code.";
  if (!a.regularExpression) return null;
  let pattern: RegExp;
  try {
    pattern = new RegExp(`^(?:${a.regularExpression})$`);
  } catch {
    return `“${a.regularExpression}” is not a regular expression.`;
  }
  return pattern.test(a.value) ? null : `The code “${a.value}” does not match ${a.regularExpression}.`;
}

const encoder = new TextEncoder();

/** Base64url without padding (RFC 4648, section 5), as JWS writes every part. */
export function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A JSON Web Key with its key ID (RFC 7517, section 4.5). */
export type Jwk = JsonWebKey & { kid?: string };

export interface SigningKey {
  privateJwk: Jwk;
  publicJwk: Jwk;
  /** The public key's JWK thumbprint (RFC 7638), its key ID. */
  kid: string;
}

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;

/** The JWK thumbprint (RFC 7638) of an EC public key: SHA-256 of its required members in lexicographic order. */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(canonical))));
}

/** A new ECDSA P-256 key pair, made in the browser. */
export async function generateSigningKey(): Promise<SigningKey> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = await jwkThumbprint(publicJwk);
  return { privateJwk: { ...privateJwk, kid }, publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, kid }, kid };
}

/** A key pair from a private EC P-256 JWK the person saved before. */
export async function signingKeyFrom(privateJwk: JsonWebKey): Promise<SigningKey> {
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" || !privateJwk.d) throw new Error("The key is not a private EC P-256 key in JWK form.");
  await crypto.subtle.importKey("jwk", privateJwk, ALGORITHM, false, ["sign"]);
  const publicJwk = { kty: "EC", crv: "P-256", x: privateJwk.x, y: privateJwk.y };
  const kid = await jwkThumbprint(publicJwk);
  return { privateJwk: { ...privateJwk, kid }, publicJwk: { ...publicJwk, kid }, kid };
}

/** A compact JWS (RFC 7515) of `payload`, signed with ES256 (ECDSA P-256 and SHA-256), its key ID in the header. */
export async function signJws(payload: unknown, key: SigningKey, typ = "JOSE"): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "ES256", typ, kid: key.kid }));
  const body = base64url(JSON.stringify(payload));
  const signing = await crypto.subtle.importKey("jwk", { ...key.privateJwk, key_ops: ["sign"] }, ALGORITHM, false, ["sign"]);
  // Web Crypto gives r and s side by side (IEEE P1363), the form JWS asks for ES256 (RFC 7518, section 3.4)
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signing, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
}

const AUTHENTICITY = "gs1:authenticity";
const VALUE = "gs1:authenticitySecurityFeatureValue";

/**
 * Workflow 3: the JWS with the security marking's code taken out of its payload (an empty string), so that the
 * signature verifies only once the code read from the marking is put back.
 */
export function hideAuthenticationCode(jws: string): string {
  const [header, body, signature] = jws.split(".");
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body!))) as Record<string, Record<string, unknown>>;
  if (!payload[AUTHENTICITY]) throw new Error("The payload has no security marking.");
  payload[AUTHENTICITY][VALUE] = "";
  return `${header}.${base64url(JSON.stringify(payload))}.${signature}`;
}

/**
 * Whether a compact JWS verifies with the public key, and its payload; for workflow 3 with the code read from the
 * security marking put back first.
 */
export async function verifyJws(jws: string, publicJwk: JsonWebKey, authenticationCode?: string): Promise<{ valid: boolean; payload: unknown }> {
  const [header = "", body = "", signature = ""] = jws.split(".");
  let payload = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Record<string, Record<string, unknown>>;
  let signed = body;
  if (authenticationCode !== undefined && payload[AUTHENTICITY]) {
    payload = { ...payload, [AUTHENTICITY]: { ...payload[AUTHENTICITY], [VALUE]: authenticationCode } };
    signed = base64url(JSON.stringify(payload));
  }
  const key = await crypto.subtle.importKey("jwk", { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }, ALGORITHM, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64url(signature), encoder.encode(`${header}.${signed}`));
  return { valid, payload };
}

export interface CredentialOptions {
  /** The issuer: the brand owner's DID, e.g. did:web:brand.example.com. */
  issuer: string;
  /** The credential's own ID; a random UUID URN when not given. */
  id?: string;
  issued?: Date;
}

const VC_CONTEXT = "https://www.w3.org/2018/credentials/v1";
const DECLARATION = "https://ref.gs1.org/gs1/vc/declaration-context/";
const PRODUCT = "https://ref.gs1.org/gs1/vc/product-context/";

const stamp = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The GS1 VC data model 1.2.1's KeyCredential (section 4.4.1, example 5.5.1): the key exists and is valid. */
export function keyCredential(identified: Signed, options: CredentialOptions): Record<string, unknown> {
  return {
    "@context": [VC_CONTEXT, DECLARATION],
    id: options.id ?? `urn:uuid:${crypto.randomUUID()}`,
    type: ["VerifiableCredential", "KeyCredential"],
    issuer: options.issuer,
    issuanceDate: stamp(options.issued ?? new Date()),
    credentialSubject: { id: identified.digitalLinkUri },
  };
}

/** The GS1 VC data model 1.2.1's ProductDataCredential (section 4.4.4, example 5.6.1): the product's basic data. */
export function productDataCredential(identified: Signed, details: SignedDetails, options: CredentialOptions & { keyCredential?: string }): Record<string, unknown> {
  const product: Record<string, unknown> = {};
  if (details.brandName) product["gs1:brand"] = { "gs1:brandName": details.brandName };
  if (details.productName) product["gs1:productDescription"] = details.productName;
  return {
    "@context": [VC_CONTEXT, DECLARATION, PRODUCT],
    id: options.id ?? `urn:uuid:${crypto.randomUUID()}`,
    type: ["VerifiableCredential", "ProductDataCredential"],
    issuer: options.issuer,
    issuanceDate: stamp(options.issued ?? new Date()),
    credentialSubject: { id: identified.digitalLinkUri, ...(options.keyCredential ? { keyAuthorization: options.keyCredential } : {}), product },
  };
}

/**
 * A credential secured as a JSON Web Token (VC data model 1.1, section 6.3.1): its issuer, subject, ID and issuance as
 * the claims iss, sub, jti and nbf, the credential itself as vc, signed with ES256.
 */
export async function signCredential(credential: Record<string, unknown>, key: SigningKey): Promise<string> {
  const subject = (credential.credentialSubject as { id?: string } | undefined)?.id;
  const claims = {
    iss: credential.issuer, ...(subject ? { sub: subject } : {}), jti: credential.id,
    nbf: Math.floor(Date.parse(String(credential.issuanceDate)) / 1000), vc: credential,
  };
  return signJws(claims, key, "JWT");
}
