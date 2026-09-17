import { describe, expect, it } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import type { Session } from "./session";
import { deriveWalletStatus, type WalletStatusInputs } from "./wallet-status";

const connection = (over: Partial<Session> = {}): Session =>
  ({
    kind: "eip1193",
    isConnected: true,
    isConnecting: false,
    chainSupported: true,
    registry: { status: "ready" },
    disconnect: () => {},
    ...over,
  }) as Session;

const inputs = (over: Partial<WalletStatusInputs> = {}): WalletStatusInputs => ({
  session: connection(),
  wallet: undefined,
  deriveError: undefined,
  hasCachedKey: false,
  ...over,
});

const WALLET = fakeWalletApi();

describe("deriveWalletStatus", () => {
  it.each<[string, Partial<WalletStatusInputs>, string]>([
    ["disconnected", { session: connection({ isConnected: false }) }, "disconnected"],
    [
      "connecting while a connect is in flight",
      { session: connection({ isConnected: false, isConnecting: true }) },
      "connecting",
    ],
    [
      "unsupported-chain on a network the deployment does not serve",
      { session: connection({ chainSupported: false }), wallet: WALLET },
      "unsupported-chain",
    ],
    [
      "unsupported-chain over a derive error",
      { session: connection({ chainSupported: false }), deriveError: "boom" },
      "unsupported-chain",
    ],
    [
      "disconnected over an unsupported network",
      { session: connection({ isConnected: false, chainSupported: false }) },
      "disconnected",
    ],
    [
      "loading-networks over an unsupported network while the registry loads",
      { session: connection({ registry: { status: "loading" }, chainSupported: false }) },
      "loading-networks",
    ],
    [
      "disconnected while the registry is idle",
      { session: connection({ isConnected: false, registry: { status: "idle" } }) },
      "disconnected",
    ],
    [
      "error when the registry failed",
      {
        session: connection({
          registry: { status: "failed", message: "down", retry: () => {} },
          chainSupported: false,
        }),
      },
      "error",
    ],
    ["error over a resolved wallet", { deriveError: "rejected", wallet: WALLET }, "error"],
    ["ready once the wallet is built", { wallet: WALLET }, "ready"],
    ["resuming, silently, with a cached key", { hasCachedKey: true }, "resuming"],
    ["deriving, behind a signature prompt, without one", { hasCachedKey: false }, "deriving"],
    [
      "disconnected over a stale wallet handle",
      { session: connection({ isConnected: false }), wallet: WALLET },
      "disconnected",
    ],
  ])("reports %s", (_label, over, status) => {
    expect(deriveWalletStatus(inputs(over))).toBe(status);
  });

  it("never reports unsupported-chain for a passkey session", () => {
    const session = connection({ kind: "passkey", chainSupported: true });
    expect(deriveWalletStatus(inputs({ session }))).toBe("deriving");
    expect(deriveWalletStatus(inputs({ session, wallet: WALLET }))).toBe("ready");
  });
});
