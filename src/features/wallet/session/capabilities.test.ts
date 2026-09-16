// What each kind of wallet is allowed to do, and why the answer is what it is.
//
// The rule these pin down: depositing is the only operation that moves public
// tokens out of an EVM account, so it is the only one a wallet can lack. A
// regression that let a passkey render the deposit form would surface here
// rather than as a failed transaction with a filled-in amount.

import type { WalletApi } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { deriveCapabilities } from "./capabilities";

/// A wallet whose chain layer signs as an EOA: what `connect` reports for a
/// signer or provider.
const signing = (over: Partial<WalletApi["capabilities"]> = {}): WalletApi =>
  fakeWalletApi({ capabilities: { deposit: true, nativeDeposit: false, ...over } });

/// A wallet built on a read-only chain layer — what a passkey session gets.
const readOnly = (): WalletApi =>
  fakeWalletApi({ capabilities: { deposit: false, nativeDeposit: false } });

const nativeCapable = () => signing({ nativeDeposit: true });

describe("deriveCapabilities", () => {
  it("denies everything with no wallet", () => {
    const caps = deriveCapabilities(undefined, undefined);
    for (const c of ["deposit", "depositEth"] as const) {
      expect(caps[c].allowed).toBe(false);
      expect(caps[c].reason).toBeTruthy();
    }
  });

  it("allows the deposit paths for an injected wallet", () => {
    const caps = deriveCapabilities(nativeCapable(), "eip1193");
    expect(caps.deposit.allowed).toBe(true);
    expect(caps.depositEth.allowed).toBe(true);
  });

  it("withholds native ETH where the chain has no adapter", () => {
    // A property of the deployment, not of the wallet — so the wallet keeps
    // every other deposit path.
    const caps = deriveCapabilities(signing(), "eip1193");
    expect(caps.deposit.allowed).toBe(true);
    expect(caps.depositEth.allowed).toBe(false);
    expect(caps.depositEth.reason).toMatch(/network/i);
  });

  it("denies every deposit path to a passkey, and explains why", () => {
    const caps = deriveCapabilities(readOnly(), "passkey");
    for (const c of ["deposit", "depositEth"] as const) {
      expect(caps[c].allowed).toBe(false);
    }
    // The message has to name the passkey and say what still works, or the
    // user is left thinking the wallet is broken rather than specialised.
    expect(caps.deposit.reason).toMatch(/passkey/i);
    expect(caps.deposit.reason).toMatch(/transfer/i);
  });

  it("denies a read-only chain layer even when the kind is not passkey", () => {
    // The flag, not the kind, is the load-bearing check: a future wallet kind
    // with no signer is denied without this file being touched.
    const caps = deriveCapabilities(readOnly(), "eip1193");
    expect(caps.deposit.allowed).toBe(false);
    expect(caps.deposit.reason).toMatch(/sign/i);
  });

  it("never denies a spend", () => {
    // The negative space matters as much as the positives: transfer, withdraw,
    // swap and claim links are relayed, so no capability gates them and none
    // should ever be added here without a reason as concrete as deposit's.
    const caps = deriveCapabilities(readOnly(), "passkey");
    expect(Object.keys(caps).sort()).toEqual(["deposit", "depositEth"]);
  });
});
