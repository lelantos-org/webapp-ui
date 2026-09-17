import { beforeEach, describe, expect, it } from "vitest";
import { announce, detail } from "@/test/fakes/eip6963";
import { parseChainId } from "./provider";
import { eip1193Store } from "./store";

describe("startDiscovery", () => {
  let notifies: number;
  let unsubscribe: () => void;

  beforeEach(() => {
    eip1193Store.resetForTest();
    notifies = 0;
    unsubscribe?.();
    unsubscribe = eip1193Store.subscribe(() => {
      notifies++;
    });
    return () => unsubscribe();
  });

  it("notifies once per announce however many times it was called", () => {
    eip1193Store.startDiscovery();
    eip1193Store.startDiscovery();
    eip1193Store.startDiscovery();

    announce(detail("uuid-a", "io.metamask"));

    expect(notifies).toBe(1);
    expect(eip1193Store.getState().discovered).toHaveLength(1);
  });

  it("still merges providers announced after the first call", () => {
    eip1193Store.startDiscovery();
    announce(detail("uuid-b", "com.rainbow"));
    eip1193Store.startDiscovery();
    announce(detail("uuid-c", "app.phantom"));

    const rdns = eip1193Store.getState().discovered.map((d) => d.info.rdns);
    expect(rdns).toContain("com.rainbow");
    expect(rdns).toContain("app.phantom");
  });

  it("ignores a repeat announce of a uuid it already has", () => {
    eip1193Store.startDiscovery();
    const d = detail("uuid-d", "io.zerion");
    announce(d);
    const after = notifies;
    announce(d);
    expect(notifies).toBe(after);
  });
});

describe("pickProvider", () => {
  beforeEach(() => {
    eip1193Store.resetForTest();
    eip1193Store.startDiscovery();
  });

  it("never substitutes another wallet for a named one", () => {
    // Substituting would silently attach a different EOA, nsk and shielded address.
    announce(detail("uuid-mm", "io.metamask"));

    expect(eip1193Store.pickProvider("com.rainbow")).toBeUndefined();
  });

  it("matches a named wallet case-insensitively once it announces", () => {
    announce(detail("uuid-rb", "com.rainbow"));

    expect(eip1193Store.pickProvider("COM.RAINBOW")?.info.rdns).toBe("com.rainbow");
  });

  it("returns the named wallet rather than the tiebreak winner", () => {
    announce(detail("uuid-mm3", "io.metamask"));
    announce(detail("uuid-rb", "io.rabby"));

    expect(eip1193Store.pickProvider("io.rabby")?.info.rdns).toBe("io.rabby");
    expect(eip1193Store.getState().discovered.map((d) => d.info.rdns)).toEqual([
      "io.metamask",
      "io.rabby",
    ]);
  });

  it("prefers MetaMask only when no wallet was named", () => {
    announce(detail("uuid-ph", "app.phantom"));
    announce(detail("uuid-mm2", "io.metamask"));

    expect(eip1193Store.pickProvider()?.info.rdns).toBe("io.metamask");
  });

  it("falls back to the first announced wallet when MetaMask is absent", () => {
    announce(detail("uuid-ph", "app.phantom", "Phantom"));

    expect(eip1193Store.pickProvider()?.info.rdns).toBe("app.phantom");
  });
});

describe("parseChainId", () => {
  it("reads the hex form the spec mandates", () => {
    expect(parseChainId("0x89")).toBe(137);
    expect(parseChainId("0X89")).toBe(137);
  });

  it("reads the bare decimal form wallets emit in practice", () => {
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
