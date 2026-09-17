import { describe, expect, it } from "vitest";
import type { EphemeralBalance } from "@/features/claim-links";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { initial, type Phase, reduce } from "./phase-machine";

const stubWallet = fakeWalletApi();
const CHAIN = 31337n;
const balances: EphemeralBalance[] = [{ asset: 1n, amount: 100n, notes: 1 }];
const ready: Phase = { kind: "ready", nskHex: "x", chainId: CHAIN, eph: stubWallet, balances };
const sweeping: Phase = { ...ready, kind: "sweeping", asset: 1n, amount: 100n };
const needWallet: Phase = { kind: "need-wallet", nskHex: "x", chainId: CHAIN };
const done: Phase = { kind: "done", txHash: "h", chainId: CHAIN, asset: 1n, amount: 100n };

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
    const next = reduce(initial, { t: "fragment-missing" });
    expect(next).toMatchObject({ kind: "bad-link", reason: "missing" });
  });

  it("load-start → loading", () => {
    expect(reduce(needWallet, { t: "load-start" })).toEqual({
      kind: "loading",
      nskHex: "x",
      chainId: CHAIN,
    });
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
    const next = reduce(sweeping, { t: "sweep-success", txHash: "0xabc" });
    expect(next).toEqual({
      kind: "done",
      txHash: "0xabc",
      chainId: CHAIN,
      asset: 1n,
      amount: 100n,
    });
  });

  it("sweep-failure → error, recorded as a sweep rather than a scan", () => {
    const next = reduce(sweeping, { t: "sweep-failure", message: "rip" });
    expect(next).toEqual({
      kind: "error",
      message: "rip",
      nskHex: "x",
      chainId: CHAIN,
      from: "sweep",
    });
  });

  it.each<[string, Phase, Parameters<typeof reduce>[1]]>([
    ["fragment-missing from need-wallet", needWallet, { t: "fragment-missing" }],
    ["fragment-bad from need-wallet", needWallet, { t: "fragment-bad", error: "nope" }],
    [
      "load-start from bad-link",
      { kind: "bad-link", error: "e", reason: "malformed" },
      { t: "load-start" },
    ],
    ["sweep-start from done", done, { t: "sweep-start", asset: 1n, amount: 100n }],
    ["load-start from done", done, { t: "load-start" }],
    [
      "retry from a phase that has not failed",
      { kind: "loading", nskHex: "ab", chainId: CHAIN },
      { t: "retry" },
    ],
  ])("ignores %s", (_label, from, event) => {
    expect(reduce(from, event)).toBe(from);
  });
});

describe("retry", () => {
  const failed = (over: Partial<Extract<Phase, { kind: "error" }>> = {}): Phase => ({
    kind: "error",
    message: "rpc blew up",
    nskHex: "ab",
    chainId: CHAIN,
    from: "scan",
    ...over,
  });

  it("goes back to need-wallet with the secret it retained", () => {
    expect(reduce(failed(), { t: "retry" })).toEqual({
      kind: "need-wallet",
      nskHex: "ab",
      chainId: CHAIN,
    });
  });
});
