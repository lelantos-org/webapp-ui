// @vitest-environment jsdom
// How many user-verification prompts an enrolment costs.
//
// Three things happen on the enrolment path that each want the authenticator:
// `credentials.create`, the PRF probe, and the wallet build's derivation. The
// probe and the derivation evaluate the same `(credential, LELANTOS_PRF_SALT)`
// pair, and PRF is deterministic in exactly that pair — so the probe's output
// *is* the derivation's answer. Discarding it cost the user a third Touch ID
// for a value already in hand.
//
// This pins the count at two, and pins the reason it is two: the seed has to
// land under the same `accountKey` the snapshot publishes, or it silently
// misses and the prompt comes back with nothing failing.

import { LELANTOS_PRF_SALT } from "@lelantos-org/sdk/primitives";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubWebAuthn } from "@/test/dom";
import { getCachedNsk } from "../key-cache/nsk-session-cache";
import { isAttached, passkeyAccountKey, storedCredential } from "./credential-storage";
import { prfKnownUnsupported } from "./prf";
import { passkeyStore } from "./store";

const RAW_ID = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
/// Any stable 32 bytes; the reduction only cares about the length.
const PRF_BYTES = new Uint8Array(32).fill(7);

let create: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;

function credential(prf: { enabled?: boolean; results?: { first: ArrayBuffer } }) {
  return {
    rawId: RAW_ID.buffer.slice(0),
    getClientExtensionResults: () => ({ prf }),
  };
}

beforeEach(() => {
  passkeyStore.resetForTest();
  localStorage.clear();
  sessionStorage.clear();

  create = vi.fn(async () => credential({ enabled: true }));
  get = vi.fn(async () => credential({ results: { first: PRF_BYTES.buffer.slice(0) } }));

  stubWebAuthn({ create, get });
});

describe("passkey enrolment", () => {
  it("costs exactly two authenticator ceremonies", async () => {
    await passkeyStore.connect();

    expect(passkeyStore.getState().status).toBe("connected");
    expect(create).toHaveBeenCalledTimes(1);
    // The probe, and only the probe. A third prompt would be the wallet build
    // re-deriving what this already produced.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0].publicKey.extensions.prf.eval.first).toEqual(
      new Uint8Array(LELANTOS_PRF_SALT),
    );
  });

  it("seeds the nsk cache under the accountKey the session is keyed by", async () => {
    await passkeyStore.connect();

    const { credentialId } = passkeyStore.getState();
    expect(credentialId).toBeDefined();
    // The build reads exactly this key, so a seed under any other spelling is a
    // silent miss rather than a failure.
    expect(getCachedNsk(passkeyAccountKey(credentialId as string))).toBeDefined();
  });
});

// `error` is rendered verbatim by the wallet picker.
describe("passkey enrolment failure", () => {
  it("keeps the PRF explanation whole, since it says what to try instead", async () => {
    create = vi.fn(async () => credential({ enabled: false }));
    stubWebAuthn({ create, get });
    await passkeyStore.connect();

    const state = passkeyStore.getState();
    expect(prfKnownUnsupported()).toBe(true);
    expect(state.error).toMatch(/does not support the PRF extension/);
  });

  it("does not put a raw authenticator fault on screen", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create = vi.fn(async () => {
      throw new Error(`authenticator fault 0x${"ab".repeat(32)}`);
    });
    stubWebAuthn({ create, get });
    await passkeyStore.connect();

    expect(passkeyStore.getState().status).toBe("error");
    expect(passkeyStore.getState().error).toBe("Something went wrong. Please try again.");
  });
});

describe("passkey disconnect", () => {
  it("keeps the credential so a reconnect returns to the same wallet", async () => {
    await passkeyStore.connect();
    const enrolled = passkeyStore.getState().credentialId;
    expect(create).toHaveBeenCalledTimes(1);
    expect(isAttached()).toBe(true);

    // `restored()` gates the boot session on the attachment and the stored
    // credential, so they are what decides whether a reload comes back signed in.
    passkeyStore.disconnect();
    expect(passkeyStore.getState().status).toBe("idle");
    expect(isAttached()).toBe(false);
    // The id is the only handle on the shielded balance: `nsk` comes from this
    // credential's PRF output and nothing else can reproduce it.
    expect(storedCredential()?.id).toBe(enrolled);

    await passkeyStore.attachOrEnrol();

    expect(isAttached()).toBe(true);
    expect(passkeyStore.getState().credentialId).toBe(enrolled);
    // Never a second enrolment: that would derive a different key and leave
    // whatever the first credential holds unreachable.
    expect(create).toHaveBeenCalledTimes(1);
  });
});
