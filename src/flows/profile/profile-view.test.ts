import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import {
  echoed,
  type ProfileInputs,
  type ProfileView,
  payableView,
  profileView,
} from "./profile-view";

const NAME = "mehow.lelantos.xyz";
const LOADED = { loaded: true, failed: false };
const NO_RECORD = { data: undefined, failed: false };
const ok = { ok: true, value: { label: "mehow", name: NAME } } as const;
const view = (over: Partial<ProfileInputs>) =>
  profileView({ read: ok, networks: LOADED, record: NO_RECORD, ...over });
const publishing = (value: string, registered = true) => ({
  record: { data: { registered, value }, failed: false },
});

describe("profileView", () => {
  it("waits for the networks before saying none offers handles", () => {
    const none = { read: undefined };
    expect(view({ ...none, networks: { loaded: false, failed: false } })).toEqual({
      kind: "loading-networks",
    });
    expect(view({ ...none, networks: LOADED })).toEqual({ kind: "no-registrar" });
    expect(view({ ...none, networks: { loaded: false, failed: true } })).toEqual({
      kind: "networks-failed",
    });
  });

  it("reads a cached registrar chain even if the refresh failed", () => {
    expect(view({ networks: { loaded: false, failed: true } })).toEqual({
      kind: "looking-up",
      name: NAME,
    });
  });

  it("tells a link with no handle from a name it refuses", () => {
    expect(view({ read: { ok: false, error: "empty" } })).toEqual({ kind: "no-handle" });
    expect(view({ read: { ok: false, error: "label" } })).toEqual({
      kind: "refused",
      problem: "label",
    });
    expect(view({ read: { ok: false, error: "parent" } })).toEqual({
      kind: "refused",
      problem: "parent",
    });
  });

  it("is looking the handle up until the record lands, and says so when the read failed", () => {
    expect(view({})).toEqual({ kind: "looking-up", name: NAME });
    expect(view({ record: { data: undefined, failed: true } })).toEqual({
      kind: "read-failed",
      name: NAME,
    });
  });

  it("maps the record to what can be shown, under the handle's name", () => {
    expect(view(publishing("", false))).toEqual({ kind: "not-found", name: NAME });
    expect(view(publishing(""))).toEqual({ kind: "unpublished", name: NAME });
    expect(view(publishing(SHIELDED_ADDRESS))).toEqual({
      kind: "ready",
      name: NAME,
      address: SHIELDED_ADDRESS,
    });
  });

  it.each([
    ["an EVM address", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
    ["a truncated address", SHIELDED_ADDRESS.slice(0, -1)],
    ["a character outside the address charset", `${SHIELDED_ADDRESS.slice(0, -1)}b`],
    ["another prefix", SHIELDED_ADDRESS.replace("lelantos1", "lelantoz1")],
    ["a padded address", ` ${SHIELDED_ADDRESS}`],
    ["free text", "pay me at example.com"],
  ])("offers no payment to %s", (_, value) => {
    expect(view(publishing(value))).toEqual({ kind: "invalid", name: NAME });
  });

  it("keeps showing a record it has while a refetch fails", () => {
    const stale = { data: { registered: true, value: SHIELDED_ADDRESS }, failed: true };
    expect(view({ record: stale }).kind).toBe("ready");
  });
});

describe("payableView", () => {
  const ready: ProfileView = { kind: "ready", name: NAME, address: SHIELDED_ADDRESS };

  it("offers the address only once it has decoded in full", () => {
    expect(payableView(ready, undefined)).toEqual({ kind: "looking-up", name: NAME });
    expect(payableView(ready, true)).toBe(ready);
  });

  it("refuses an address that reads as one but does not decode", () => {
    expect(payableView(ready, false)).toEqual({ kind: "invalid", name: NAME });
  });

  it("leaves every other view as it is", () => {
    const missing: ProfileView = { kind: "not-found", name: NAME };
    expect(payableView(missing, undefined)).toBe(missing);
    expect(payableView(missing, false)).toBe(missing);
  });
});

describe("echoed", () => {
  it("quotes a short name whole and cuts a long one", () => {
    expect(echoed("mehow.lelantos.eth")).toBe("mehow.lelantos.eth");
    expect(echoed("a".repeat(200))).toBe(`${"a".repeat(64)}…`);
  });
});
