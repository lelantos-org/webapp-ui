// @vitest-environment jsdom
// `eip1193Store` scenarios: the silent resume on load, and what a failed
// connect leaves behind.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { announce, detail } from "@/test/fakes/eip6963";
import { eip1193Store } from "./store";

const RDNS = "io.metamask";

beforeEach(() => {
  eip1193Store.resetForTest();
  localStorage.clear();
});

// `resumeFromStorage` restores the previous session silently on load. These pin
// down when it must decline to.
//
// The status check inside it covers a resume that loses to an explicit connect
// on the same store. It cannot cover a *disconnect* that lands while the
// handshake is in flight: that leaves the store back at `idle`, which reads as
// "still free to attach". Choosing a passkey disconnects the injected wallet,
// and an injected wallet outranks every other kind in `WALLET_KINDS`, so a
// resume that reattached afterwards took the session back off the passkey —
// the pick appeared to revert on its own.

/// A provider that answers the resume handshake, with `eth_accounts` deferred so
/// the test can act while it is in flight.
function handshakeProvider() {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const d = detail("uuid-mm", RDNS);
  d.provider.request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_accounts") {
      await gate;
      return ["0x00000000000000000000000000000000000000ab"];
    }
    if (method === "eth_chainId") return "0x7a69";
    return undefined;
  }) as typeof d.provider.request;
  return { d, release };
}

describe("resumeFromStorage", () => {
  beforeEach(() => {
    // The *attached* latch, which is what a resume reads; the preference key is
    // a lasting choice that deliberately survives a disconnect.
    localStorage.setItem("lelantos:wallet:rdns", RDNS);
  });

  it("declines to attach when a disconnect lands while the handshake is in flight", async () => {
    const { d, release } = handshakeProvider();
    eip1193Store.startDiscovery();
    announce(d);

    const resume = eip1193Store.resumeFromStorage();
    // The disconnect a passkey pick performs, while `eth_accounts` is pending.
    eip1193Store.disconnect();
    release();
    await resume;

    expect(eip1193Store.getState().status).toBe("idle");
    expect(eip1193Store.getState().address).toBeUndefined();
  });

  it("attaches when nothing interrupts it", async () => {
    const { d, release } = handshakeProvider();
    eip1193Store.startDiscovery();
    announce(d);

    const resume = eip1193Store.resumeFromStorage();
    release();
    await resume;

    expect(eip1193Store.getState().status).toBe("connected");
    expect(eip1193Store.getState().rdns).toBe(RDNS);
  });
});

// What a failed connect leaves in `error`, which the wallet picker and the
// connect button render verbatim.
//
// It used to be the wallet's own rejection text: "User rejected the request."
// for a dismissed prompt, and for a wrapped RPC fault whatever the innermost
// layer said, hex included. Those now read as they do everywhere else.
function rejectingWallet(rejection: unknown) {
  const d = detail("uuid-mm", RDNS);
  d.provider.request = vi.fn(async () => {
    throw rejection;
  }) as typeof d.provider.request;
  eip1193Store.startDiscovery();
  announce(d);
}

describe("eip1193Store.connect failure", () => {
  it("reports a dismissed prompt as a cancellation", async () => {
    rejectingWallet({ code: 4001, message: "User rejected the request." });
    await eip1193Store.connect(RDNS);

    expect(eip1193Store.getState().status).toBe("error");
    expect(eip1193Store.getState().error).toBe(CANCELED_IN_WALLET);
  });

  it("does not put a raw RPC payload on screen", async () => {
    rejectingWallet({
      code: -32603,
      message: "Internal JSON-RPC error.",
      data: { originalError: { message: `execution failed 0x${"de".repeat(40)}` } },
    });
    await eip1193Store.connect(RDNS);

    const { error } = eip1193Store.getState();
    expect(error).toBeDefined();
    expect(error).not.toMatch(/0x[0-9a-f]{8,}/i);
  });
});
