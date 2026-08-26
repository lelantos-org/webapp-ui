import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import type { Connection } from "./use-connection";
import { deriveWalletStatus, type WalletStatusInputs } from "./wallet-status";

const connection = (over: Partial<Connection> = {}): Connection =>
  ({
    isConnected: true,
    isConnecting: false,
    chainSupported: true,
    disconnect: () => {},
    switchChain: () => {},
    ...over,
  }) as Connection;

const inputs = (over: Partial<WalletStatusInputs> = {}): WalletStatusInputs => ({
  conn: connection(),
  wallet: undefined,
  deriveError: undefined,
  hasCachedKey: false,
  ...over,
});

const WALLET = {} as WalletApi;

describe("deriveWalletStatus", () => {
  it("reports disconnected, and connecting while a connect is in flight", () => {
    expect(deriveWalletStatus(inputs({ conn: connection({ isConnected: false }) }))).toBe(
      "disconnected",
    );
    expect(
      deriveWalletStatus(inputs({ conn: connection({ isConnected: false, isConnecting: true }) })),
    ).toBe("connecting");
  });

  // The wallet's network is the app's chain, so an unserved one is a hard
  // stop: there is no pool address, tree depth or asset list to fall back to.
  it("blocks on a network the deployment does not serve", () => {
    expect(
      deriveWalletStatus(inputs({ conn: connection({ chainSupported: false }), wallet: WALLET })),
    ).toBe("unsupported-chain");
  });

  // Ranked above `error`: a derive failure on an unknown chain is a
  // consequence, and naming the cause is what tells the user what to do.
  it("reports the unsupported network over a derive error", () => {
    expect(
      deriveWalletStatus(
        inputs({ conn: connection({ chainSupported: false }), deriveError: "boom" }),
      ),
    ).toBe("unsupported-chain");
  });

  it("still reports disconnected over an unsupported network", () => {
    expect(
      deriveWalletStatus(
        inputs({ conn: connection({ isConnected: false, chainSupported: false }) }),
      ),
    ).toBe("disconnected");
  });

  it("surfaces a derive error over a resolved wallet", () => {
    expect(deriveWalletStatus(inputs({ deriveError: "rejected", wallet: WALLET }))).toBe("error");
  });

  it("is ready once the wallet is built", () => {
    expect(deriveWalletStatus(inputs({ wallet: WALLET }))).toBe("ready");
  });

  it("distinguishes a silent resume from a signature prompt", () => {
    // A cached nsk rebuilds without an EIP-712 prompt.
    expect(deriveWalletStatus(inputs({ hasCachedKey: true }))).toBe("resuming");
    expect(deriveWalletStatus(inputs({ hasCachedKey: false }))).toBe("deriving");
  });

  it("prefers a disconnect over a stale wallet handle", () => {
    expect(
      deriveWalletStatus(inputs({ conn: connection({ isConnected: false }), wallet: WALLET })),
    ).toBe("disconnected");
  });
});
