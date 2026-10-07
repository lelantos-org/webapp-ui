import { evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import { makeChain } from "@/test/fixtures/chains";
import {
  handleName,
  handleRefusalText,
  LABEL_RULE,
  profilePath,
  readHandle,
  registrarChain,
} from "./handle";

const PARENTS = ["lelantos.xyz", "lelantos.id"];

describe("handleName", () => {
  it("shows a label under the chain's first parent", () => {
    expect(handleName("mehow", PARENTS)).toBe("mehow.lelantos.xyz");
  });

  it("falls back to @label where the chain lists no parent", () => {
    expect(handleName("mehow", [])).toBe("@mehow");
  });
});

describe("readHandle", () => {
  it.each([
    ["a bare label", "mehow"],
    ["an @-prefixed label", "@mehow"],
    ["mixed case and padding", "  MeHow "],
    ["a name under the first parent", "mehow.lelantos.xyz"],
    ["a name under another served parent", "Mehow.Lelantos.ID"],
  ])("reads %s as the label, shown under the first parent", (_, input) => {
    expect(readHandle(input, PARENTS)).toEqual({
      ok: true,
      value: { label: "mehow", name: "mehow.lelantos.xyz" },
    });
  });

  it.each([
    ["nothing", ""],
    ["blanks", "   "],
    ["a lone @", "@"],
  ])("reads %s as empty", (_, input) => {
    expect(readHandle(input, PARENTS)).toEqual({ ok: false, error: "empty" });
  });

  it.each([
    ["a look-alike parent", "mehow.lelantos.eth"],
    ["a parent one letter off", "mehow.lelantoz.xyz"],
    ["a served parent nested under another", "mehow.lelantos.xyz.evil.com"],
    ["a subdomain of a served parent", "mehow.pay.lelantos.xyz"],
    ["a trailing dot", "mehow.lelantos.xyz."],
    ["a bad label under a foreign parent", "a.example.com"],
  ])("refuses %s by its parent", (_, input) => {
    expect(readHandle(input, PARENTS)).toEqual({ ok: false, error: "parent" });
  });

  it("refuses every dotted name where the chain lists no parent", () => {
    expect(readHandle("mehow.lelantos.xyz", [])).toEqual({ ok: false, error: "parent" });
    expect(readHandle("mehow", [])).toEqual({
      ok: true,
      value: { label: "mehow", name: "@mehow" },
    });
  });

  it.each([
    ["too short", "me"],
    ["too long", "a".repeat(33)],
    ["a leading hyphen", "-mehow"],
    ["a doubled hyphen", "me--how"],
    ["a space inside", "me how"],
    ["a non-ASCII letter", "mehöw"],
    ["a bad label under a served parent", "me.lelantos.xyz"],
  ])("refuses %s by its label", (_, input) => {
    expect(readHandle(input, PARENTS)).toEqual({ ok: false, error: "label" });
  });
});

describe("handleRefusalText", () => {
  it("states the label rule", () => {
    expect(handleRefusalText("label", PARENTS)).toBe(LABEL_RULE);
    expect(LABEL_RULE).toContain("3 to 32 characters");
  });

  it("names the parents that are served, and warns about look-alikes", () => {
    const text = handleRefusalText("parent", PARENTS);
    expect(text).toContain(".lelantos.xyz or .lelantos.id");
    expect(text).toContain("belongs to someone else");
  });

  it("asks for the bare handle where no parent is served", () => {
    expect(handleRefusalText("parent", [])).toContain("Enter the handle on its own");
  });
});

describe("registrarChain", () => {
  const REGISTRAR = evmAddress("0x7777777777777777777777777777777777777777");

  it("picks the first chain that runs a registrar", () => {
    const plain = makeChain({ chainId: 1n });
    const named = makeChain({ chainId: 10n, nameRegistrarAddress: REGISTRAR });
    const later = makeChain({ chainId: 11n, nameRegistrarAddress: REGISTRAR });
    expect(registrarChain([plain, named, later])).toBe(named);
  });

  it("is undefined where no chain offers handles", () => {
    expect(registrarChain([makeChain()])).toBeUndefined();
    expect(registrarChain([])).toBeUndefined();
  });
});

describe("profilePath", () => {
  it("carries the label in the fragment, never in the path or the query", () => {
    expect(profilePath("mehow")).toBe("/profile#mehow");
  });
});
