import { beforeEach, describe, expect, it, vi } from "vitest";
import { localStore, readJson, sessionStore, writeJson } from "./safe";

const isNumberList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number");

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("safe storage", () => {
  it("round-trips, and reads a missing key as undefined", () => {
    expect(localStore.get("k")).toBeUndefined();
    expect(localStore.set("k", "v")).toBe(true);
    expect(localStore.get("k")).toBe("v");
    localStore.remove("k");
    expect(localStore.get("k")).toBeUndefined();
  });

  it("keeps local and session apart", () => {
    sessionStore.set("k", "session");
    expect(localStore.get("k")).toBeUndefined();
    expect(sessionStore.get("k")).toBe("session");
  });

  it("reports a write refused for quota as not landed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(localStore.set("k", "v")).toBe(false);
    expect(localStore.get("k")).toBeUndefined();
  });

  it("treats storage that throws on access as absent", () => {
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(localStore.get("k")).toBeUndefined();
    expect(localStore.set("k", "v")).toBe(false);
    expect(localStore.keys("")).toEqual([]);
    expect(() => localStore.remove("k")).not.toThrow();
    expect(() => localStore.removePrefix("")).not.toThrow();
  });

  it("treats a missing global as absent", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(sessionStore.get("k")).toBeUndefined();
    expect(sessionStore.set("k", "v")).toBe(false);
    expect(sessionStore.keys("")).toEqual([]);
  });

  it("lists and removes by prefix, safe to remove while iterating", () => {
    localStore.set("app:a", "1");
    localStore.set("app:b", "2");
    localStore.set("other", "3");
    expect(localStore.keys("app:").sort()).toEqual(["app:a", "app:b"]);

    localStore.removePrefix("app:");
    expect(localStore.keys("app:")).toEqual([]);
    expect(localStore.get("other")).toBe("3");
  });
});

describe("readJson", () => {
  it("returns a value that satisfies the guard", () => {
    localStore.set("k", "[1,2]");
    expect(readJson(localStore, "k", isNumberList)).toEqual([1, 2]);
  });

  it("is undefined for a missing key, unparseable JSON, or a shape the guard rejects", () => {
    expect(readJson(localStore, "missing", isNumberList)).toBeUndefined();
    localStore.set("truncated", "[1,");
    expect(readJson(localStore, "truncated", isNumberList)).toBeUndefined();
    localStore.set("wrong", '["1"]');
    expect(readJson(localStore, "wrong", isNumberList)).toBeUndefined();
  });
});

describe("writeJson", () => {
  it("serialises and reports the write", () => {
    expect(writeJson(localStore, "k", [1, 2])).toBe(true);
    expect(localStore.get("k")).toBe("[1,2]");
  });

  it("refuses a value JSON cannot hold rather than throwing", () => {
    expect(writeJson(localStore, "k", { amount: 1n })).toBe(false);
    expect(localStore.get("k")).toBeUndefined();
  });
});
