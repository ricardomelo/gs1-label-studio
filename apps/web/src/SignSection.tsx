import { useState } from "react";
import {
  authenticityProblem,
  generateSigningKey,
  hideAuthenticationCode,
  keyCredential,
  productDataCredential,
  signCredential,
  signedPayload,
  signingKeyFrom,
  signJws,
  verifyJws,
  type AuthenticityDetails,
  type Identified,
  type SigningKey,
} from "@gs1-label-studio/core";
import { fileText } from "./keep.ts";
import { SECURITY_MARKINGS, SIGN_TEXTS } from "./texts.ts";

// A digital signature over the Web (backlog 1.18, mock-up A of two, 31 October 2026), below the EPC section: a JSON Web
// Signature of the code's data with the GS1 Web Vocabulary, as the GS1 Digital Signatures Technical Implementation
// Guideline 1.1.0, section 4, describes it, with a physical security marking's code shown (workflow 2) or to be read
// from the marking (workflow 3); and the GS1 verifiable credentials of the data model 1.2.1. The key is made and kept in
// this page only; it is gone when the page closes, unless the person saves it.

interface Props {
  identified?: Identified;
  /** A name for the files: the symbol, the key and its qualifiers. */
  name: string;
  download: (name: string, content: string, type: string) => void;
}

export function SignSection({ identified, name, download }: Props) {
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [marking, setMarking] = useState("");
  const [value, setValue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pattern, setPattern] = useState("");
  const [hidden, setHidden] = useState(false);
  const [issuer, setIssuer] = useState("");
  const [key, setKey] = useState<SigningKey | null>(null);
  const [signed, setSigned] = useState<{ jws: string; uri: string; verified: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticity: AuthenticityDetails | undefined = marking
    ? { type: marking, instructions, regularExpression: pattern, value }
    : undefined;
  const problem = authenticity ? authenticityProblem(authenticity) : null;
  const current = signed && identified && signed.uri === identified.digitalLinkUri ? signed : null;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  async function sign() {
    if (!identified || !key) return;
    try {
      const details = { productName, brandName, ...(authenticity ? { authenticity } : {}) };
      let jws = await signJws(signedPayload(identified, details), key);
      if (authenticity && hidden) jws = hideAuthenticationCode(jws);
      // Checked here before it is offered: with the code put back, as a verifier would after reading the marking
      const { valid } = await verifyJws(jws, key.publicJwk, authenticity && hidden ? value : undefined);
      setSigned({ jws, uri: identified.digitalLinkUri, verified: valid });
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  async function credential(kind: "key" | "product") {
    if (!identified || !key) return;
    try {
      const options = { issuer: issuer.trim() };
      const vc = kind === "key" ? keyCredential(identified, options) : productDataCredential(identified, { productName, brandName }, options);
      download(`${name}-${kind}-credential.jwt`, await signCredential(vc, key), "application/jwt");
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <details className="sign" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>Digital signature (GS1, JWS)</summary>
      <p className="hint">{SIGN_TEXTS.intro}</p>
      {!identified?.digitalLinkUri ? (
        <p className="hint error">{SIGN_TEXTS.noUri}</p>
      ) : (
        <>
          <div className="grid">
            <div>
              <label htmlFor="sig-name">Product name</label>
              <input id="sig-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="sig-brand">Brand</label>
              <input id="sig-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="sig-marking">Security marking</label>
              <select id="sig-marking" value={marking} onChange={(e) => setMarking(e.target.value)}>
                <option value="">None</option>
                {SECURITY_MARKINGS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {marking && (
              <>
                <div>
                  <label htmlFor="sig-code">Its code</label>
                  <input id="sig-code" className="mono" value={value} spellCheck={false} aria-invalid={Boolean(problem)} onChange={(e) => setValue(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="sig-where">Where to look</label>
                  <input id="sig-where" value={instructions} placeholder="e.g. look on side of pack" onChange={(e) => setInstructions(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="sig-pattern">Code pattern (regular expression)</label>
                  <input id="sig-pattern" className="mono" value={pattern} placeholder="e.g. [A-Z0-9]{11}" spellCheck={false} onChange={(e) => setPattern(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="sig-hidden">The code in the signature</label>
                  <select id="sig-hidden" value={hidden ? "hidden" : "shown"} onChange={(e) => setHidden(e.target.value === "hidden")}>
                    <option value="shown">Shown, to compare with the marking (workflow 2)</option>
                    <option value="hidden">Taken out, read from the marking (workflow 3)</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label htmlFor="sig-issuer">Issuer, for credentials (DID)</label>
              <input id="sig-issuer" className="mono" value={issuer} placeholder="e.g. did:web:brand.example.com" spellCheck={false} onChange={(e) => setIssuer(e.target.value)} />
            </div>
          </div>
          {problem && <p className="error small">{problem}</p>}
          <div className="sign-row">
            <b>Key</b>
            <span className="hint">{key ? `ECDSA P-256 · kid ${key.kid.slice(0, 6)}…${key.kid.slice(-4)}` : SIGN_TEXTS.noKey}</span>
            <button type="button" className="btn" onClick={() => void generateSigningKey().then((k) => { setKey(k); setSigned(null); }, fail)}>
              New key
            </button>
            <label className="btn">
              Use a saved key…
              <input
                type="file"
                accept=".jwk,.json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) fileText(file).then((text) => signingKeyFrom(JSON.parse(text) as JsonWebKey)).then((k) => { setKey(k); setSigned(null); setError(null); }, fail);
                }}
              />
            </label>
            <button type="button" className="btn" disabled={!key} title={SIGN_TEXTS.saveKey}
              onClick={() => key && download(`signing-key-${key.kid.slice(0, 8)}.private.jwk`, JSON.stringify(key.privateJwk, null, 2), "application/jwk+json")}>
              Save the key (private)
            </button>
          </div>
          <div className="sign-row">
            <button type="button" className="btn primary" disabled={!key || Boolean(problem)} onClick={() => void sign()}>
              Sign
            </button>
            <button type="button" className="btn" disabled={!current} onClick={() => current && download(`${name}.jws`, current.jws, "application/jose")}>
              JWS
            </button>
            <button type="button" className="btn" disabled={!key}
              onClick={() => key && download(`signing-key-${key.kid.slice(0, 8)}.public.jwks.json`, JSON.stringify({ keys: [key.publicJwk] }, null, 2), "application/jwk-set+json")}>
              Public key
            </button>
            <button type="button" className="btn" disabled={!key || !issuer.trim()} onClick={() => void credential("product")}>
              Product data credential
            </button>
            <button type="button" className="btn" disabled={!key || !issuer.trim()} onClick={() => void credential("key")}>
              Key credential
            </button>
          </div>
          {current && (
            <>
              <div className="uri jws">{current.jws}</div>
              <p className={current.verified ? "hint ok" : "hint error"} aria-live="polite">
                {current.verified ? SIGN_TEXTS.verified : SIGN_TEXTS.notVerified}
                {hidden && marking ? ` ${SIGN_TEXTS.hidden}` : ""}
              </p>
            </>
          )}
          {error && <p className="error small">{error}</p>}
          <p className="hint">{SIGN_TEXTS.notDigSig}</p>
        </>
      )}
    </details>
  );
}
