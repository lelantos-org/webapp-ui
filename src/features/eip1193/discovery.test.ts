// EIP-6963 discovery is called from three places on boot (`WalletBoot`,
// `resumeFromStorage`, and `connect` when nothing has been discovered yet).
// These pin the handler registration to one per page: registering per call
// would fan a single announce out into one store notification per prior call,
// re-rendering every `useWalletStore` subscriber that many times.

import { beforeEach, describe, expect, it } from "vitest";
import { announce, detail } from "@/test/eip6963";
import { parseChainId } from "./provider";
import { walletStore } from "./store";

describe("startDiscovery", () => {
  let notifies: number;
  let unsubscribe: () => void;

  beforeEach(() => {
    // The store is a module singleton, so without a reset each case inherits
    // the previous one's `discovered` list and `seen` map — the length
    // assertions below then only hold in file order.
    walletStore.resetForTest();
    notifies = 0;
    unsubscribe?.();
    unsubscribe = walletStore.subscribe(() => {
      notifies++;
    });
    return () => unsubscribe();
  });

  it("notifies once per announce however many times it was called", () => {
    walletStore.startDiscovery();
    walletStore.startDiscovery();
    walletStore.startDiscovery();

    announce(detail("uuid-a", "io.metamask"));

    expect(notifies).toBe(1);
    expect(walletStore.getState().discovered).toHaveLength(1);
  });

  it("still merges providers announced after the first call", () => {
    walletStore.startDiscovery();
    announce(detail("uuid-b", "com.rainbow"));
    walletStore.startDiscovery();
    announce(detail("uuid-c", "app.phantom"));

    const rdns = walletStore.getState().discovered.map((d) => d.info.rdns);
    expect(rdns).toContain("com.rainbow");
    expect(rdns).toContain("app.phantom");
  });

  it("ignores a repeat announce of a uuid it already has", () => {
    walletStore.startDiscovery();
    const d = detail("uuid-d", "io.zerion");
    announce(d);
    const after = notifies;
    announce(d);
    expect(notifies).toBe(after);
  });
});

describe("pickProvider", () => {
  beforeEach(() => {
    walletStore.resetForTest();
    walletStore.startDiscovery();
  });

  it("never substitutes another wallet for a named one", () => {
    // The stored wallet has not announced; only MetaMask has. Substituting it
    // would silently attach a different EOA — hence a different nsk and a
    // different shielded address — without the user choosing it.
    announce(detail("uuid-mm", "io.metamask"));

    expect(walletStore.pickProvider("com.rainbow")).toBeUndefined();
  });

  it("matches a named wallet case-insensitively once it announces", () => {
    announce(detail("uuid-rb", "com.rainbow"));

    expect(walletStore.pickProvider("COM.RAINBOW")?.info.rdns).toBe("com.rainbow");
  });

  it("returns the named wallet rather than the tiebreak winner", () => {
    // Rabby announces alongside MetaMask, which wins `pick(undefined)`. The
    // picker's whole job is naming one, so this is the path it depends on.
    announce(detail("uuid-mm3", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));

    expect(walletStore.pickProvider("io.rabby")?.info.rdns).toBe("io.rabby");
    expect(walletStore.getState().discovered.map((d) => d.info.rdns)).toEqual([
      "io.metamask",
      "io.rabby",
    ]);
  });

  it("prefers MetaMask only when no wallet was named", () => {
    announce(detail("uuid-ph", "app.phantom"));
    announce(detail("uuid-mm2", "io.metamask"));

    expect(walletStore.pickProvider()?.info.rdns).toBe("io.metamask");
  });
});

describe("parseChainId", () => {
  it("reads the hex form the spec mandates", () => {
    expect(parseChainId("0x89")).toBe(137);
    expect(parseChainId("0X89")).toBe(137);
  });

  it("reads the bare decimal form wallets emit in practice", () => {
    // `parseInt("137", 16)` is 311, which resolves to no known chain and drops
    // the whole app to `unsupported-chain` with no diagnostic.
    expect(parseChainId("137")).toBe(137);
  });

  it("accepts a number and rejects anything unparseable", () => {
    expect(parseChainId(137)).toBe(137);
    expect(parseChainId("")).toBeUndefined();
    expect(parseChainId("zzz")).toBeUndefined();
    expect(parseChainId(null)).toBeUndefined();
    expect(parseChainId(Number.NaN)).toBeUndefined();
  });
});
