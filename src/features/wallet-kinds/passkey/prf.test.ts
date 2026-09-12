// @vitest-environment jsdom
// The ceremony's two failure modes, which matter more than its success path.
//
// PRF is required and has no fallback, so "the authenticator ran but produced
// no PRF output" must be a clear refusal rather than a retry or, worse, a key
// derived from something else. These pin that down.

import { LELANTOS_PRF_SALT } from "@lelantos-org/sdk/keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubWebAuthn } from "@/test/dom";

const PRF_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i);

/// Minimal stand-in for what `navigator.credentials` returns.
function credential(ext: unknown, rawId = new Uint8Array([1, 2, 3]).buffer) {
  return { rawId, getClientExtensionResults: () => ext };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
});

describe("passkeysAvailable", () => {
  it("is false outside a secure context", async () => {
    stubWebAuthn();
    vi.stubGlobal("isSecureContext", false);
    const { passkeysAvailable } = await import("./prf");
    expect(passkeysAvailable()).toBe(false);
  });

  it("is false where WebAuthn is absent, without touching navigator", async () => {
    // The check has to short-circuit: reading `navigator.credentials.create`
    // on a browser without WebAuthn is what would throw.
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PublicKeyCredential", undefined);
    vi.stubGlobal("navigator", undefined);
    const { passkeysAvailable } = await import("./prf");
    expect(passkeysAvailable()).toBe(false);
  });

  it("is true with both in place", async () => {
    stubWebAuthn();
    const { passkeysAvailable } = await import("./prf");
    expect(passkeysAvailable()).toBe(true);
  });
});

describe("evaluatePrf", () => {
  it("returns the PRF output the authenticator produced", async () => {
    stubWebAuthn({
      get: async () => credential({ prf: { results: { first: PRF_BYTES.buffer } } }),
    });
    const { evaluatePrf } = await import("./prf");
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).resolves.toEqual(PRF_BYTES);
  });

  it("refuses when the authenticator produced no PRF result", async () => {
    stubWebAuthn({ get: async () => credential({ prf: { enabled: false } }) });
    const { evaluatePrf, PrfUnsupportedError } = await import("./prf");
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).rejects.toBeInstanceOf(
      PrfUnsupportedError,
    );
  });

  it("remembers the refusal so the picker stops offering passkeys here", async () => {
    // There is no second derivation to fall back to, so re-offering the same
    // authenticator would only reproduce a terminal failure.
    stubWebAuthn({ get: async () => credential({}) });
    const { evaluatePrf, prfKnownUnsupported } = await import("./prf");
    expect(prfKnownUnsupported()).toBe(false);
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).rejects.toThrow();
    expect(prfKnownUnsupported()).toBe(true);
  });

  it("reports a dismissed prompt as dismissed, not as missing PRF", async () => {
    // Distinct outcomes: one is worth retrying, the other never is.
    stubWebAuthn({ get: async () => null });
    const { evaluatePrf, prfKnownUnsupported } = await import("./prf");
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).rejects.toThrow(/dismissed/);
    expect(prfKnownUnsupported()).toBe(false);
  });
});

describe("createAndProvePasskey", () => {
  it("proves PRF with a follow-up assertion rather than trusting create", async () => {
    // Several authenticators report `enabled` on create but return results
    // only from an assertion, so enrolment that stopped at create could hand
    // back a credential that cannot derive a key.
    const get = vi.fn(async () => credential({ prf: { results: { first: PRF_BYTES.buffer } } }));
    stubWebAuthn({ create: async () => credential({ prf: { enabled: true } }), get });
    const { createAndProvePasskey } = await import("./prf");

    const { credentialId } = await createAndProvePasskey("test");

    expect(credentialId).toBeTruthy();
    expect(get).toHaveBeenCalledOnce();
  });

  it("refuses at create when the authenticator says PRF is off", async () => {
    const get = vi.fn();
    stubWebAuthn({ create: async () => credential({ prf: { enabled: false } }), get });
    const { createAndProvePasskey, PrfUnsupportedError } = await import("./prf");

    await expect(createAndProvePasskey()).rejects.toBeInstanceOf(PrfUnsupportedError);
    // No point unlocking a credential already known to be useless.
    expect(get).not.toHaveBeenCalled();
  });
});
