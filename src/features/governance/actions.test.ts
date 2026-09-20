import { evmAddress } from "@lelantos-org/sdk";
import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { hexBytes32 } from "@/test/fixtures/addresses";
import { feeBurnerActionAbi, govTokenActionAbi } from "./abi";
import {
  type ActionDraft,
  buildAction,
  decodeAction,
  findFunction,
  formatArgValue,
  functionSignature,
  knownContracts,
  parseArg,
} from "./actions";

const GOVERNOR = evmAddress("0x5555555555555555555555555555555555555555");
const TOKEN = evmAddress("0x6666666666666666666666666666666666666666");
const OTHER = "0x7777777777777777777777777777777777777777";
const MASP = evmAddress("0x8888888888888888888888888888888888888888");
const contracts = knownContracts({
  governorAddress: GOVERNOR,
  govTokenAddress: TOKEN,
  maspAddress: MASP,
});

const draft = (over: Partial<ActionDraft>): ActionDraft => ({
  target: TOKEN,
  value: "",
  mode: "function",
  contract: "token",
  fn: "transfer(address,uint256)",
  args: [OTHER, "1000"],
  calldata: "",
  ...over,
});

describe("knownContracts", () => {
  it("offers only functions that write", () => {
    for (const c of contracts) {
      expect(c.functions.length).toBeGreaterThan(0);
      for (const f of c.functions) expect(["nonpayable", "payable"]).toContain(f.stateMutability);
    }
  });

  it("places the governor and token at the registry's addresses", () => {
    expect(contracts.find((c) => c.id === "governor")?.address).toBe(GOVERNOR);
    expect(contracts.find((c) => c.id === "token")?.address).toBe(TOKEN);
    expect(contracts.find((c) => c.id === "pool")?.address).toBe(MASP);
    expect(contracts.find((c) => c.id === "feeBurner")?.address).toBeUndefined();
    expect(contracts.find((c) => c.id === "swapWrapper")?.address).toBeUndefined();
  });

  it("includes the quorum-vote cutoff setter on the governor", () => {
    const sigs = contracts.find((c) => c.id === "governor")?.functions.map(functionSignature);
    expect(sigs).toContain("setQuorumVoteCutoff(uint32)");
  });
});

describe("buildAction / decodeAction", () => {
  it("round-trips a typed call", () => {
    const r = buildAction(draft({}), contracts);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.action.target).toBe(TOKEN);
    expect(r.action.value).toBe(0n);
    expect(r.action.calldata).toBe(
      encodeFunctionData({
        abi: govTokenActionAbi,
        functionName: "transfer",
        args: [OTHER, 1000n],
      }),
    );

    const d = decodeAction(r.action, contracts);
    expect(d).toMatchObject({
      kind: "call",
      signature: "transfer(address,uint256)",
      contractMatches: true,
      args: [
        { name: "to", type: "address", value: OTHER },
        { name: "value", type: "uint256", value: "1000" },
      ],
    });
  });

  it("round-trips arrays, bools and a value in ETH", () => {
    const pools = [OTHER, TOKEN];
    const r = buildAction(
      draft({
        target: OTHER,
        contract: "feeBurner",
        fn: "setPools(address[])",
        args: [pools.join(", ")],
        value: "1.5",
      }),
      contracts,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.action.value).toBe(1_500_000_000_000_000_000n);
    const d = decodeAction(r.action, contracts);
    if (d.kind !== "call") throw new Error("expected a call");
    expect(d.contract.id).toBe("feeBurner");
    expect(d.contractMatches).toBeUndefined();
    expect(d.args[0]?.value).toBe(`[${OTHER}, ${TOKEN}]`);

    const paused = buildAction(
      draft({ target: OTHER, contract: "feeBurner", fn: "setPaused(bool)", args: ["true"] }),
      contracts,
    );
    if (!paused.ok) throw new Error("expected ok");
    expect(decodeAction(paused.action, contracts)).toMatchObject({
      args: [{ value: "true" }],
    });
  });

  it("flags a known call aimed at another address", () => {
    const data = encodeFunctionData({
      abi: govTokenActionAbi,
      functionName: "delegate",
      args: [OTHER],
    });
    const d = decodeAction({ target: OTHER, calldata: data }, contracts);
    expect(d).toMatchObject({ kind: "call", contractMatches: false });
  });

  it("reads empty calldata as a transfer and unknown calldata as raw", () => {
    expect(decodeAction({ target: OTHER, calldata: "0x" }, contracts)).toEqual({
      kind: "transfer",
    });
    expect(decodeAction({ target: OTHER, calldata: "0xdeadbeef00" }, contracts)).toEqual({
      kind: "raw",
      selector: "0xdeadbeef",
    });
    expect(decodeAction({ target: OTHER, calldata: "0x12" }, contracts)).toEqual({
      kind: "raw",
      selector: undefined,
    });
  });

  it("passes raw calldata through untouched", () => {
    const r = buildAction(draft({ mode: "raw", calldata: "0xabcd", target: OTHER }), contracts);
    expect(r).toEqual({
      ok: true,
      action: { target: evmAddress(OTHER), value: 0n, calldata: "0xabcd" },
    });
    const empty = buildAction(draft({ mode: "raw", calldata: " ", target: OTHER }), contracts);
    expect(empty.ok && empty.action.calldata).toBe("0x");
  });

  it("reports every broken field at once", () => {
    const r = buildAction(
      draft({ target: "nope", value: "1.2.3", args: ["0x12", "-1"] }),
      contracts,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["args.0", "args.1", "target", "value"]);
  });

  it("asks for a function when none is chosen, and hex in raw mode", () => {
    const noFn = buildAction(draft({ fn: "" }), contracts);
    expect(!noFn.ok && noFn.errors.fn).toBeTruthy();
    const badHex = buildAction(draft({ mode: "raw", calldata: "0xabc" }), contracts);
    expect(!badHex.ok && badHex.errors.calldata).toBeTruthy();
  });
});

describe("parseArg", () => {
  it("parses integers within their width", () => {
    expect(parseArg("uint16", "65535")).toBe(65535n);
    expect(() => parseArg("uint16", "65536")).toThrow(/range/);
    expect(() => parseArg("uint256", "-1")).toThrow(/range/);
    expect(parseArg("int8", "-128")).toBe(-128n);
    expect(() => parseArg("int8", "128")).toThrow(/range/);
    expect(() => parseArg("uint64", "1.5")).toThrow(/whole/);
  });

  it("parses addresses, bools, strings and bytes", () => {
    expect(parseArg("address", OTHER.toUpperCase().replace("0X", "0x"))).toBe(OTHER);
    expect(() => parseArg("address", "0x12")).toThrow();
    expect(parseArg("bool", "false")).toBe(false);
    expect(() => parseArg("bool", "yes")).toThrow();
    expect(parseArg("string", " kept as typed ")).toBe(" kept as typed ");
    const role = hexBytes32("ab");
    expect(parseArg("bytes32", role)).toBe(role);
    expect(() => parseArg("bytes32", "0xab")).toThrow(/32 bytes/);
    expect(parseArg("bytes", "0x")).toBe("0x");
    expect(() => parseArg("bytes", "zz")).toThrow();
    expect(() => parseArg("tuple", "x")).toThrow(/Unsupported/);
  });

  it("parses arrays from commas, newlines or brackets", () => {
    expect(parseArg("uint256[]", "[1, 2\n3]")).toEqual([1n, 2n, 3n]);
    expect(parseArg("uint256[]", "")).toEqual([]);
  });
});

describe("helpers", () => {
  it("finds a function by contract and signature", () => {
    expect(findFunction(contracts, "token", "delegate(address)")?.name).toBe("delegate");
    expect(findFunction(contracts, "token", "nope()")).toBeUndefined();
    expect(findFunction(contracts, "nope", "delegate(address)")).toBeUndefined();
  });

  it("formats decoded values", () => {
    expect(formatArgValue([1n, [true]])).toBe("[1, [true]]");
    expect(formatArgValue(7)).toBe("7");
  });

  it("uses the same FeeBurner ABI the picker offers", () => {
    expect(feeBurnerActionAbi.some((f) => f.name === "setBurnBps")).toBe(true);
  });
});
