// The WebAuthn half of the passkey key source.
//
// The SDK owns the reduction (`keys/passkey.ts`); this owns the ceremony. The
// split is the same one `Eip1193Signer` sits on for injected wallets: the
// browser API stays out of the SDK, which also ships to Node.
//
// PRF is required and there is no fallback. A WebAuthn assertion signature is
// ECDSA over secp256r1 with a random nonce, so the same credential signing the
// same challenge twice produces different bytes — a wallet derived from one
// could not be found again. Only the PRF extension is stable for the life of
// the credential. An authenticator without it cannot hold a Lelantos wallet,
// and saying so is better than deriving a key the user cannot reproduce.

import { LELANTOS_PRF_SALT, type PrfEvaluator } from "@lelantos-org/sdk/keys";
import { createLogger } from "@/shared/lib/logger";
import { localStore } from "@/shared/lib/storage";
import { LOCAL_KEYS } from "@/shared/lib/storage-keys";

const log = createLogger("passkey:prf");

/// Remembered "this device cannot" answer, so the picker stops offering a path
/// that has already been shown not to work here. Not user-identifying.
const NO_PRF_KEY = LOCAL_KEYS.passkeyNoPrf;

/// Relying-party name shown by the authenticator's own prompt.
const RP_NAME = "Lelantos";

/// The user-visible label the credential is stored under.
const DEFAULT_LABEL = "Lelantos wallet";

/// Whether this browser could run the ceremony at all.
///
/// Two cheap pre-checks before anything is created: WebAuthn is unavailable
/// outside a secure context, and absent entirely in older or stripped-down
/// browsers.
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
///
/// Separate from a generic failure because it is the one the UI must explain
/// rather than retry: no amount of trying again will make this authenticator
/// support the extension.
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

/// Copy into a buffer typed as `BufferSource`.
///
/// `Uint8Array` is generic over its backing buffer since TS 5.7, and the DOM
/// signatures want an `ArrayBuffer` specifically — a `SharedArrayBuffer` view
/// is not accepted. The SDK hands back a plain `Uint8Array`, so it is copied
/// rather than asserted.
function buf(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b);
}

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/// The `prf` slice of `getClientExtensionResults()`, which the DOM lib does not
/// type. Narrowed here rather than cast at each use.
interface PrfExtensionResults {
  prf?: {
    enabled?: boolean;
    results?: { first?: ArrayBuffer };
  };
}

function prfResults(cred: PublicKeyCredential): PrfExtensionResults["prf"] {
  return (cred.getClientExtensionResults() as PrfExtensionResults).prf;
}

/// Enrol a new credential.
///
/// `residentKey: "required"` so the credential is discoverable and the user is
/// never asked to name an account they do not have; `userVerification:
/// "required"` because the credential *is* the spending key, so an unlocked
/// device must not be enough.
///
/// The PRF extension is requested here, but its output is deliberately not
/// used: several authenticators report `enabled` on create while returning
/// results only from an assertion. The probe therefore runs as a follow-up
/// `get`, which is also the call the wallet build will make.
async function createPasskey(label = DEFAULT_LABEL): Promise<{ credentialId: string }> {
  if (!passkeysAvailable()) throw new Error("passkeys are not available in this browser");

  // Names the credential, and is what the authenticator lists. Random rather
  // than derived from anything: the shielded identity comes from the PRF
  // output, so there is nothing here worth linking to a user.
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { id: window.location.hostname, name: RP_NAME },
      user: { id: userId, name: label, displayName: label },
      // ES256 first, RS256 as the fallback platform authenticators still want.
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

  // A `false` here is conclusive; anything else is deferred to the probe.
  if (prfResults(cred)?.enabled === false) {
    rememberNoPrf();
    throw new PrfUnsupportedError();
  }

  const credentialId = toBase64Url(cred.rawId);
  log.info("passkey created");
  return { credentialId };
}

/// Run one assertion and return its PRF output.
///
/// Throws `PrfUnsupportedError` when the authenticator produced no PRF result,
/// which is the only failure the caller must explain rather than retry.
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

/// Enrol, then prove the credential really answers PRF.
///
/// The probe is a real assertion rather than a feature sniff, because
/// `getClientExtensionResults()` is the only honest answer available. Its cost
/// is one extra unlock at enrolment, paid once.
///
/// Its output is returned, not discarded: the probe evaluates the same
/// `(credential, salt)` pair the wallet build is about to, and PRF is
/// deterministic in exactly that pair. Throwing it away bought a third
/// user-verification prompt for a value already in hand. See
/// `passkeyStore.connect`, which seeds the nsk cache with it.
export async function createAndProvePasskey(
  label?: string,
): Promise<{ credentialId: string; prf: Uint8Array }> {
  const { credentialId } = await createPasskey(label);
  const prf = await evaluatePrf(credentialId, LELANTOS_PRF_SALT);
  return { credentialId, prf };
}
