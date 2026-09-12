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
    disconnect: () => {},
    switchChain: () => {},
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

/// Each case is one ranking decision: when two conditions hold at once, which
/// status the user is shown.
describe("deriveWalletStatus", () => {
  it.each<[string, Partial<WalletStatusInputs>, string]>([
    ["disconnected", { session: connection({ isConnected: false }) }, "disconnected"],
    [
      "connecting while a connect is in flight",
      { session: connection({ isConnected: false, isConnecting: true }) },
      "connecting",
    ],
    // The wallet's network is the app's chain, so an unserved one is a hard
    // stop: there is no pool address, tree depth or asset list to fall back to.
    [
      "unsupported-chain on a network the deployment does not serve",
      { session: connection({ chainSupported: false }), wallet: WALLET },
      "unsupported-chain",
    ],
    // Ranked above `error`: a derive failure on an unknown chain is a
    // consequence, and naming the cause is what tells the user what to do.
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
    ["error over a resolved wallet", { deriveError: "rejected", wallet: WALLET }, "error"],
    ["ready once the wallet is built", { wallet: WALLET }, "ready"],
    // A cached nsk rebuilds without an EIP-712 prompt.
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
    // A passkey has no network of its own — it picks one from the registry —
    // so there is no chain it can be "on" that this deployment cannot serve.
    // The `eip1193` gate would otherwise strand it behind a switch prompt with
    // no wallet to send the prompt to.
    const session = connection({ kind: "passkey", chainSupported: true });
    expect(deriveWalletStatus(inputs({ session }))).toBe("deriving");
    expect(deriveWalletStatus(inputs({ session, wallet: WALLET }))).toBe("ready");
  });
});
