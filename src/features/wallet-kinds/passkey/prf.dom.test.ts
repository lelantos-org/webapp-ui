import { LELANTOS_PRF_SALT } from "@lelantos-org/sdk/primitives";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubWebAuthn } from "@/test/browser";

const PRF_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i);

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
    stubWebAuthn({ get: async () => credential({}) });
    const { evaluatePrf, prfKnownUnsupported } = await import("./prf");
    expect(prfKnownUnsupported()).toBe(false);
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).rejects.toThrow();
    expect(prfKnownUnsupported()).toBe(true);
  });

  it("reports a dismissed prompt as dismissed, not as missing PRF", async () => {
    stubWebAuthn({ get: async () => null });
    const { evaluatePrf, prfKnownUnsupported } = await import("./prf");
    await expect(evaluatePrf("Y3JlZA", LELANTOS_PRF_SALT)).rejects.toThrow(/dismissed/);
    expect(prfKnownUnsupported()).toBe(false);
  });
});

describe("createAndProvePasskey", () => {
  it("proves PRF with a follow-up assertion rather than trusting create", async () => {
    // Some authenticators report `enabled` on create but return PRF output only from an assertion.
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
    expect(get).not.toHaveBeenCalled();
  });
});
