import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChain } from "@/test/fixtures/chains";
import { connectWallet } from "./connect-wallet";

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  resolveSyncStrategy: vi.fn(),
  scanner: { id: "scanner" },
  createScanner: vi.fn(),
  disposeScanner: vi.fn(async () => {}),
  holdScanner: vi.fn(),
}));

vi.mock("@lelantos-org/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lelantos-org/sdk")>()),
  connect: h.connect,
}));
vi.mock("@/config/env", () => ({ env: { fmdUrl: "/fmd", relayerUrl: "/relayer" } }));
vi.mock("../prover/prover-worker", () => ({ sharedProver: () => ({ id: "prover" }) }));
vi.mock("../sync/fmd-subscription", () => ({ resolveSyncStrategy: h.resolveSyncStrategy }));
vi.mock("../sync/scanner", () => ({
  createScanner: h.createScanner,
  disposeScanner: h.disposeScanner,
  holdScanner: h.holdScanner,
}));
vi.mock("./perf", () => ({
  instrumentWallet: () => {},
  timed: (_label: string, fn: () => unknown) => fn(),
}));

const chain = makeChain({ chainId: 31337n });
const args = { chain, nsk: 7n as never, account: "acct", storage: { notes: {} as never } };

beforeEach(() => {
  vi.clearAllMocks();
  h.createScanner.mockReturnValue(h.scanner);
  h.resolveSyncStrategy.mockResolvedValue({ strategy: { kind: "matches", token: "t" } });
});

describe("connectWallet", () => {
  it("connects read-only without a signer, with the scanner and the resolved strategy", async () => {
    const wallet = { address: "lelantos1w" };
    h.connect.mockResolvedValue(wallet);

    const out = await connectWallet({ ...args, signer: undefined, scannerSize: 2 });

    expect(out).toEqual({ wallet, fullSync: undefined });
    expect(h.createScanner).toHaveBeenCalledWith(2);
    const options = h.connect.mock.lastCall?.[0];
    expect(options).toMatchObject({
      readOnly: true,
      scanner: h.scanner,
      syncStrategy: { kind: "matches", token: "t" },
    });
    expect(options).not.toHaveProperty("signer");
    expect(h.holdScanner).toHaveBeenCalledWith(wallet, h.scanner);
  });

  it("passes a signer through instead of going read-only", async () => {
    h.connect.mockResolvedValue({});
    const signer = { id: "signer" } as never;
    await connectWallet({ ...args, signer, denominations: true });
    const options = h.connect.mock.lastCall?.[0];
    expect(options).toMatchObject({ signer, denominations: true });
    expect(options).not.toHaveProperty("readOnly");
  });

  it("reports a full scan the discovery service forced", async () => {
    h.connect.mockResolvedValue({});
    h.resolveSyncStrategy.mockResolvedValue({
      strategy: { kind: "full" },
      fallback: "unavailable",
    });
    expect((await connectWallet({ ...args, signer: undefined })).fullSync).toBe("unavailable");
  });

  it("frees the scanner when the connection fails", async () => {
    h.connect.mockRejectedValue(new Error("rpc down"));
    await expect(connectWallet({ ...args, signer: undefined })).rejects.toThrow("rpc down");
    expect(h.disposeScanner).toHaveBeenCalledWith(h.scanner);
    expect(h.holdScanner).not.toHaveBeenCalled();
  });
});
