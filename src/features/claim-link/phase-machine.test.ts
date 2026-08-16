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

  it("fragment-bad → bad-link", () => {
    const next = reduce(initial, { t: "fragment-bad", error: "nope" });
    expect(next).toEqual({ kind: "bad-link", error: "nope" });
  });

  it("fragment-missing → bad-link", () => {
    const next = reduce(initial, { t: "fragment-missing" });
    expect(next.kind).toBe("bad-link");
  });

  it("load-start only valid from need-wallet", () => {
    const a = reduce({ kind: "need-wallet", nskHex: "x", chainId: CHAIN }, { t: "load-start" });
    expect(a).toEqual({ kind: "loading", nskHex: "x", chainId: CHAIN });

    const b = reduce({ kind: "bad-link", error: "e" }, { t: "load-start" });
    expect(b.kind).toBe("bad-link");
  });

  it("load-success → ready", () => {
    const next = reduce(
      { kind: "loading", nskHex: "x", chainId: CHAIN },
      { t: "load-success", eph: stubWallet, balances },
    );
    expect(next).toEqual({ kind: "ready", nskHex: "x", chainId: CHAIN, eph: stubWallet, balances });
  });

  it("load-failure carries nskHex", () => {
    const next = reduce(
      { kind: "loading", nskHex: "x", chainId: CHAIN },
      { t: "load-failure", message: "boom" },
    );
    expect(next).toEqual({ kind: "error", message: "boom", nskHex: "x" });
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
    expect(next).toEqual({ kind: "done", txHash: "0xabc", asset: 1n, amount: 100n });
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
    expect(next).toEqual({ kind: "error", message: "rip", nskHex: "x" });
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
    const done: Phase = { kind: "done", txHash: "h", asset: 1n, amount: 100n };
    expect(reduce(done, { t: "sweep-start", asset: 1n, amount: 100n })).toBe(done);
    expect(reduce(done, { t: "load-start" })).toBe(done);
  });
});
