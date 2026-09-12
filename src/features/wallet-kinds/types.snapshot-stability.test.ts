// @vitest-environment jsdom
// Regression tests for the referential stability of each kind's snapshot.
//
// `useSession` passes `snapshot.layer` straight through, and `useBuildWallet`
// takes `session.layer` as an effect dependency. A snapshot rebuilt on every
// render therefore re-runs that effect on every render: its cleanup aborts the
// in-flight build and the next pass opens a fresh derivation prompt. Because a
// failed build sets state, and setting state renders, a rejected prompt used to
// reopen itself without bound — and a passkey unlock resolved into a build that
// had already been aborted, so confirming it appeared to do nothing.
//
// Identity is the whole assertion here; the snapshot's *contents* are covered
// by the tests that consume them.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Eip1193State } from "./eip1193/store";
import type { PasskeyState } from "./passkey/store";

const provider = { request: vi.fn() };

let walletState: Eip1193State;
let passkeyState: PasskeyState;

// Stores whose state is whatever the test last assigned. `useStore` reads
// `getState` on every render, so a reassignment plus a rerender is a change.
const staticStore = <T>(read: () => T) => ({ getState: read, subscribe: () => () => {} });

vi.mock("./eip1193/store", () => ({
  eip1193Store: {
    ...staticStore(() => walletState),
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchChain: vi.fn(),
  },
}));

vi.mock("./passkey/store", () => ({
  passkeyStore: {
    ...staticStore(() => passkeyState),
    attachOrEnrol: vi.fn(),
    disconnect: vi.fn(),
    selectChain: vi.fn(),
  },
}));
vi.mock("./passkey/prf", () => ({
  passkeysAvailable: () => true,
  prfKnownUnsupported: () => false,
  prfEvaluator: vi.fn(),
}));
vi.mock("./passkey/credential-storage", () => ({
  storedCredential: () => undefined,
  passkeyAccountKey: (id: string) => `passkey:${id}`,
}));

const { eip1193Kind } = await import("./eip1193-kind");
const { passkeyKind } = await import("./passkey-kind");

beforeEach(() => {
  walletState = {
    status: "connected",
    address: "0xabc",
    chainId: 31337,
    provider,
    error: undefined,
  } as unknown as Eip1193State;
  passkeyState = {
    status: "connected",
    credentialId: "cred-1",
    chainId: 31337n,
    error: undefined,
  } as unknown as PasskeyState;
});

describe.each([
  {
    name: "eip1193Kind",
    kind: eip1193Kind,
    what: "the account",
    change: () => {
      walletState = { ...walletState, address: "0xdef" } as Eip1193State;
    },
    changed: { ethAddress: "0xdef" },
  },
  {
    name: "passkeyKind",
    kind: passkeyKind,
    what: "the credential",
    change: () => {
      passkeyState = { ...passkeyState, credentialId: "cred-2" } as PasskeyState;
    },
    changed: { accountKey: "passkey:cred-2" },
  },
])("$name.useSnapshot", ({ kind, what, change, changed }) => {
  it("returns the same layer across a re-render with unchanged state", () => {
    const { result, rerender } = renderHook(() => kind.useSnapshot());
    const first = result.current;
    rerender();
    expect(result.current.layer).toBeDefined();
    expect(result.current.layer).toBe(first.layer);
    expect(result.current).toBe(first);
  });

  it(`returns a new layer once ${what} changes`, () => {
    const { result, rerender } = renderHook(() => kind.useSnapshot());
    const first = result.current;
    change();
    rerender();
    expect(result.current.layer).not.toBe(first.layer);
    expect(result.current).toMatchObject(changed);
  });
});
