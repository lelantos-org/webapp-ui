import { evmAddress, type WalletApi } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { deriveCapabilities } from "./capabilities";

const signing = (over: Partial<WalletApi["capabilities"]> = {}): WalletApi =>
  fakeWalletApi({ capabilities: { deposit: true, nativeDeposit: false, ...over } });

const readOnly = (): WalletApi =>
  fakeWalletApi({ capabilities: { deposit: false, nativeDeposit: false } });

const nativeCapable = () => signing({ nativeDeposit: true });

describe("deriveCapabilities", () => {
  it("denies everything with no wallet", () => {
    const caps = deriveCapabilities(undefined, undefined);
    for (const c of ["deposit", "depositEth", "govern"] as const) {
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
    expect(caps.deposit.reason).toMatch(/passkey/i);
    expect(caps.deposit.reason).toMatch(/transfer/i);
  });

  it("denies a read-only chain layer even when the kind is not passkey", () => {
    const caps = deriveCapabilities(readOnly(), "eip1193");
    expect(caps.deposit.allowed).toBe(false);
    expect(caps.deposit.reason).toMatch(/sign/i);
  });

  it("never denies a spend", () => {
    const caps = deriveCapabilities(readOnly(), "passkey");
    expect(Object.keys(caps).sort()).toEqual(["deposit", "depositEth", "govern"]);
  });
});

describe("deriveCapabilities: govern", () => {
  const GOVERNED = { governorAddress: evmAddress("0x5555555555555555555555555555555555555555") };
  const ME = "0x1111111111111111111111111111111111111111";

  it("allows an injected wallet on a governed chain", () => {
    const caps = deriveCapabilities(signing(), "eip1193", { ethAddress: ME, chain: GOVERNED });
    expect(caps.govern.allowed).toBe(true);
  });

  it("names the network when the chain runs no governance", () => {
    const caps = deriveCapabilities(signing(), "eip1193", { ethAddress: ME, chain: {} });
    expect(caps.govern.allowed).toBe(false);
    expect(caps.govern.reason).toMatch(/governance/i);
  });

  it("denies a passkey, and says proposals stay readable", () => {
    const caps = deriveCapabilities(readOnly(), "passkey", { chain: GOVERNED });
    expect(caps.govern.allowed).toBe(false);
    expect(caps.govern.reason).toMatch(/browser wallet/i);
    expect(caps.govern.reason).toMatch(/readable/i);
  });

  it("denies a signer with no public account", () => {
    const caps = deriveCapabilities(signing(), "eip1193", { chain: GOVERNED });
    expect(caps.govern.allowed).toBe(false);
  });
});
