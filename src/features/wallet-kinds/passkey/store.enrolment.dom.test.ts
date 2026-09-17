// Enrolment costs two prompts: the probe's PRF output seeds the nsk cache under the snapshot's `accountKey`.

import { LELANTOS_PRF_SALT } from "@lelantos-org/sdk/primitives";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubWebAuthn } from "@/test/browser";
import { getCachedNsk } from "../key-cache/nsk-session-cache";
import { isAttached, passkeyAccountKey, storedCredential } from "./credential-storage";
import { prfKnownUnsupported } from "./prf";
import { passkeyStore } from "./store";

const RAW_ID = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
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
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0].publicKey.extensions.prf.eval.first).toEqual(
      new Uint8Array(LELANTOS_PRF_SALT),
    );
  });

  it("seeds the nsk cache under the accountKey the session is keyed by", async () => {
    await passkeyStore.connect();

    const { credentialId } = passkeyStore.getState();
    expect(credentialId).toBeDefined();
    expect(getCachedNsk(passkeyAccountKey(credentialId as string))).toBeDefined();
  });
});

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

    passkeyStore.disconnect();
    expect(passkeyStore.getState().status).toBe("idle");
    expect(isAttached()).toBe(false);
    expect(storedCredential()?.id).toBe(enrolled);

    await passkeyStore.attachOrEnrol();

    expect(isAttached()).toBe(true);
    expect(passkeyStore.getState().credentialId).toBe(enrolled);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
