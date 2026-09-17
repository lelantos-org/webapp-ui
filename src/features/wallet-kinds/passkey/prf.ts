// WebAuthn PRF ceremony. PRF is required: assertion signatures are non-deterministic, so cannot derive a key.

import type { PrfEvaluator } from "@lelantos-org/sdk";
import { LELANTOS_PRF_SALT } from "@lelantos-org/sdk/primitives";
import { fromBase64Url, toBase64Url } from "@/shared/lib/base64url";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";

const log = createLogger("passkey:prf");

/// Latched "this device lacks PRF" answer, so the picker stops offering passkeys.
const NO_PRF_KEY = LOCAL_KEYS.passkeyNoPrf;

const RP_NAME = "Lelantos";

const DEFAULT_LABEL = "Lelantos wallet";

/// Whether this browser could run the ceremony at all.
export function passkeysAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator?.credentials?.create === "function"
  );
}

/// Whether PRF has already been found missing on this device.
export function prfKnownUnsupported(): boolean {
  return localStore.get(NO_PRF_KEY) === "1";
}

function rememberNoPrf(): void {
  localStore.set(NO_PRF_KEY, "1");
}

/// Thrown when the authenticator ran but produced no PRF output.
export class PrfUnsupportedError extends Error {
  constructor() {
    super(
      "This passkey's authenticator does not support the PRF extension, which " +
        "Lelantos needs to derive your shielded key. Try a platform passkey " +
        "(Touch ID, Face ID or Windows Hello), or a FIDO2 security key with " +
        "hmac-secret.",
    );
    this.name = "PrfUnsupportedError";
  }
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

/// Copy into an `ArrayBuffer`-backed view; DOM `BufferSource` rejects shared buffers.
function buf(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b);
}

/// The `prf` slice of `getClientExtensionResults()`, untyped in the DOM lib.
interface PrfExtensionResults {
  prf?: {
    enabled?: boolean;
    results?: { first?: ArrayBuffer };
  };
}

function prfResults(cred: PublicKeyCredential): PrfExtensionResults["prf"] {
  return (cred.getClientExtensionResults() as PrfExtensionResults).prf;
}

/// Enrol a discoverable credential. User verification required: the credential is the spending key.
async function createPasskey(label = DEFAULT_LABEL): Promise<{ credentialId: string }> {
  if (!passkeysAvailable()) throw new Error("passkeys are not available in this browser");

  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { id: window.location.hostname, name: RP_NAME },
      user: { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: {
        prf: { eval: { first: LELANTOS_PRF_SALT } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("passkey creation was dismissed");

  if (prfResults(cred)?.enabled === false) {
    rememberNoPrf();
    throw new PrfUnsupportedError();
  }

  const credentialId = toBase64Url(cred.rawId);
  log.info("passkey created");
  return { credentialId };
}

/// Run one assertion and return its PRF output.
export async function evaluatePrf(credentialId: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!passkeysAvailable()) throw new Error("passkeys are not available in this browser");

  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{ id: buf(fromBase64Url(credentialId)), type: "public-key" }],
      userVerification: "required",
      extensions: {
        prf: { eval: { first: buf(salt) } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("passkey unlock was dismissed");

  const first = prfResults(cred)?.results?.first;
  if (!first) {
    rememberNoPrf();
    throw new PrfUnsupportedError();
  }
  return new Uint8Array(first);
}

/// A `PrfEvaluator` bound to one credential, for the SDK to reduce.
export function prfEvaluator(credentialId: string): PrfEvaluator {
  return { evaluatePrf: (salt) => evaluatePrf(credentialId, salt) };
}

/// Enrol, then prove PRF with a real assertion. Returns its output so the build skips a prompt.
export async function createAndProvePasskey(
  label?: string,
): Promise<{ credentialId: string; prf: Uint8Array }> {
  const { credentialId } = await createPasskey(label);
  const prf = await evaluatePrf(credentialId, LELANTOS_PRF_SALT);
  return { credentialId, prf };
}
