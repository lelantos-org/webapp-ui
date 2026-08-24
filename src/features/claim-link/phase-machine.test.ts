import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import type { EphemeralBalance } from "./claimLink";
import { initial, type Phase, reduce } from "./phase-machine";

const stubWallet = {} as WalletApi;
/// Chain the link names. Threaded through every phase that carries `nskHex`,
/// since the ephemeral wallet has to be built against the link's chain.
const CHAIN = 31337n;
const balances: EphemeralBalance[] = [{ asset: 1n, amount: 100n, notes: 1 }];

describe("phase-machine", () => {
  it("starts in reading-fragment", () => {
    expect(initial.kind).toBe("reading-fragment");
  });

  it("fragment-good → need-wallet", () => {
    const next = reduce(initial, { t: "fragment-good", nskHex: "abc", chainId: CHAIN });
    expect(next).toEqual({ kind: "need-wallet", nskHex: "abc", chainId: CHAIN });
  });

  it("fragment-bad → bad-link, marked malformed", () => {
    const next = reduce(initial, { t: "fragment-bad", error: "nope" });
    expect(next).toEqual({ kind: "bad-link", error: "nope", reason: "malformed" });
  });

  it("fragment-missing → bad-link, marked missing", () => {
    // The card words these two very differently: a missing fragment is what a
    // *reload* produces, and the link itself is still good.
    const next = reduce(initial, { t: "fragment-missing" });
    expect(next).toMatchObject({ kind: "bad-link", reason: "missing" });
  });

  it("load-start only valid from need-wallet", () => {
    const a = reduce({ kind: "need-wallet", nskHex: "x", chainId: CHAIN }, { t: "load-start" });
    expect(a).toEqual({ kind: "loading", nskHex: "x", chainId: CHAIN });

    const b = reduce({ kind: "bad-link", error: "e", reason: "malformed" }, { t: "load-start" });
    expect(b.kind).toBe("bad-link");
  });

  it("load-success → ready", () => {
    const next = reduce(
      { kind: "loading", nskHex: "x", chainId: CHAIN },
      { t: "load-success", eph: stubWallet, balances },
    );
    expect(next).toEqual({ kind: "ready", nskHex: "x", chainId: CHAIN, eph: stubWallet, balances });
  });

  it("load-failure carries everything a retry needs", () => {
    const next = reduce(
      { kind: "loading", nskHex: "x", chainId: CHAIN },
      { t: "load-failure", message: "boom" },
    );
    expect(next).toEqual({
      kind: "error",
      message: "boom",
      nskHex: "x",
      chainId: CHAIN,
      from: "scan",
    });
  });

  it("sweep-start → sweeping carries asset+amount", () => {
    const ready: Phase = { kind: "ready", nskHex: "x", chainId: CHAIN, eph: stubWallet, balances };
    const next = reduce(ready, { t: "sweep-start", asset: 1n, amount: 100n });
    expect(next).toMatchObject({
      kind: "sweeping",
      nskHex: "x",
      chainId: CHAIN,
      balances,
      asset: 1n,
      amount: 100n,
    });
  });

  it("sweep-success → done with asset+amount", () => {
    const sweeping: Phase = {
      kind: "sweeping",
      nskHex: "x",
      chainId: CHAIN,
      eph: stubWallet,
      balances,
      asset: 1n,
      amount: 100n,
    };
    const next = reduce(sweeping, { t: "sweep-success", txHash: "0xabc" });
    expect(next).toEqual({
      kind: "done",
      txHash: "0xabc",
      chainId: CHAIN,
      asset: 1n,
      amount: 100n,
    });
  });

  it("sweep-failure → error", () => {
    const sweeping: Phase = {
      kind: "sweeping",
      nskHex: "x",
      chainId: CHAIN,
      eph: stubWallet,
      balances,
      asset: 1n,
      amount: 100n,
    };
    const next = reduce(sweeping, { t: "sweep-failure", message: "rip" });
    expect(next).toEqual({
      kind: "error",
      message: "rip",
      nskHex: "x",
      chainId: CHAIN,
      from: "sweep",
    });
  });

  it("fragment-missing from need-wallet is a no-op (StrictMode replay)", () => {
    const s: Phase = { kind: "need-wallet", nskHex: "x", chainId: CHAIN };
    expect(reduce(s, { t: "fragment-missing" })).toBe(s);
  });

  it("fragment-bad from need-wallet is a no-op", () => {
    const s: Phase = { kind: "need-wallet", nskHex: "x", chainId: CHAIN };
    expect(reduce(s, { t: "fragment-bad", error: "nope" })).toBe(s);
  });

  it("fragment-good then fragment-missing stays in need-wallet", () => {
    const a = reduce(initial, { t: "fragment-good", nskHex: "abc", chainId: CHAIN });
    const b = reduce(a, { t: "fragment-missing" });
    expect(b).toEqual({ kind: "need-wallet", nskHex: "abc", chainId: CHAIN });
  });

  it("illegal transitions are no-ops", () => {
    const done: Phase = { kind: "done", txHash: "h", chainId: CHAIN, asset: 1n, amount: 100n };
    expect(reduce(done, { t: "sweep-start", asset: 1n, amount: 100n })).toBe(done);
    expect(reduce(done, { t: "load-start" })).toBe(done);
  });
});

describe("retry", () => {
  const failed = (over: Partial<Extract<Phase, { kind: "error" }>> = {}): Phase => ({
    kind: "error",
    message: "rpc blew up",
    nskHex: "ab",
    chainId: CHAIN,
    ...over,
  });

  it("goes back to need-wallet with the secret it retained", () => {
    // `error` used to be terminal, and the URL fragment is scrubbed on mount —
    // so a transient RPC failure during the scan ended the claim for good, and
    // reloading destroyed the secret rather than recovering it.
    expect(reduce(failed(), { t: "retry" })).toEqual({
      kind: "need-wallet",
      nskHex: "ab",
      chainId: CHAIN,
    });
  });

  it("is a no-op when the machine kept nothing to retry with", () => {
    const bare: Phase = { kind: "error", message: "boom" };
    expect(reduce(bare, { t: "retry" })).toBe(bare);
  });

  it("is illegal from any phase that has not failed", () => {
    const ready: Phase = { kind: "loading", nskHex: "ab", chainId: CHAIN };
    expect(reduce(ready, { t: "retry" })).toBe(ready);
  });
});

describe("failure origin", () => {
  it("records that a scan failed, not a claim", () => {
    const loading: Phase = { kind: "loading", nskHex: "ab", chainId: CHAIN };
    const next = reduce(loading, { t: "load-failure", message: "nope" });
    expect(next).toMatchObject({ kind: "error", from: "scan", chainId: CHAIN });
  });

  it("records a sweep failure separately", () => {
    const sweeping: Phase = {
      kind: "sweeping",
      nskHex: "ab",
      chainId: CHAIN,
      eph: stubWallet,
      balances,
      asset: 1n,
      amount: 100n,
    };
    const next = reduce(sweeping, { t: "sweep-failure", message: "nope" });
    expect(next).toMatchObject({ kind: "error", from: "sweep", chainId: CHAIN });
  });
});
