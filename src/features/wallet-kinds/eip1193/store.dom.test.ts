import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { announce, detail } from "@/test/fakes/eip6963";
import { eip1193Store } from "./store";

const RDNS = "io.metamask";

beforeEach(() => {
  eip1193Store.resetForTest();
  localStorage.clear();
});

// A disconnect mid-handshake leaves status `idle`, so the resume must detect it another way.

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
    localStorage.setItem("lelantos:wallet:rdns", RDNS);
  });

  it("declines to attach when a disconnect lands while the handshake is in flight", async () => {
    const { d, release } = handshakeProvider();
    eip1193Store.startDiscovery();
    announce(d);

    const resume = eip1193Store.resumeFromStorage();
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
