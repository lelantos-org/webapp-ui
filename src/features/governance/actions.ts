// A proposal's actions — (target, value, calldata) triples — read back into the
// contract calls they make, and built from a function and its arguments.
//
// Decoding is a courtesy, never a verdict. A selector is four bytes, so a match
// against a known ABI says what the calldata *would* mean on that contract; the
// target address says whether it is that contract. Both are shown, and anything
// that does not decode is shown as raw bytes rather than hidden.

import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import {
  type Abi,
  type AbiFunction,
  type AbiParameter,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  toFunctionSignature,
} from "viem";
import type { ChainEntry } from "@/config/chains";
import { sameAddress } from "@/shared/lib/address";
import { parseDecimal } from "@/shared/lib/format/number";
import {
  feeBurnerActionAbi,
  governorActionAbi,
  govTokenActionAbi,
  protocolAdminActionAbi,
} from "./abi";

export type KnownContractId = "governor" | "token" | "protocolAdmin" | "feeBurner";

export interface KnownContract {
  id: KnownContractId;
  label: string;
  /// The functions a proposal may call on it.
  functions: readonly AbiFunction[];
  /// Where the registry says this contract is on the chain. ProtocolAdmin and
  /// FeeBurner are not published there, so their target is typed by hand.
  address?: EvmAddress | undefined;
}

const writes = (abi: Abi): AbiFunction[] =>
  abi.filter(
    (i): i is AbiFunction =>
      i.type === "function" && i.stateMutability !== "view" && i.stateMutability !== "pure",
  );

/// The contracts whose calls this app can read and build, for one chain.
export function knownContracts(chain: Pick<ChainEntry, "governorAddress" | "govTokenAddress">) {
  const out: KnownContract[] = [
    {
      id: "governor",
      label: "Governor",
      functions: writes(governorActionAbi),
      address: chain.governorAddress,
    },
    {
      id: "token",
      label: "LNT token",
      functions: writes(govTokenActionAbi),
      address: chain.govTokenAddress,
    },
    { id: "protocolAdmin", label: "ProtocolAdmin", functions: writes(protocolAdminActionAbi) },
    { id: "feeBurner", label: "FeeBurner", functions: writes(feeBurnerActionAbi) },
  ];
  return out;
}

/// `name(type,type)`: how a function is named in the picker and the preview.
export function functionSignature(fn: AbiFunction): string {
  return toFunctionSignature(fn);
}

// ── decoding ────────────────────────────────────────────────────────────────

export interface DecodedArg {
  name: string;
  type: string;
  value: string;
}

export type DecodedAction =
  /// Calldata matching a known function. `contractMatches` is whether the target
  /// is the address the registry gives that contract; `undefined` when the
  /// registry gives none to compare.
  | {
      kind: "call";
      contract: KnownContract;
      contractMatches: boolean | undefined;
      signature: string;
      args: DecodedArg[];
    }
  /// No calldata: a plain ETH transfer.
  | { kind: "transfer" }
  /// Nothing known decodes it.
  | { kind: "raw"; selector: string | undefined };

/// A decoded value as text: bigints in decimal, arrays joined, bytes as hex.
export function formatArgValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(formatArgValue).join(", ")}]`;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return v;
  return String(v);
}

function tryDecode(fn: AbiFunction, data: `0x${string}`): readonly unknown[] | undefined {
  try {
    const r = decodeFunctionData({ abi: [fn], data });
    return r.args ?? [];
  } catch {
    return undefined;
  }
}

export function decodeAction(
  action: { target: string; calldata: `0x${string}` },
  contracts: readonly KnownContract[],
): DecodedAction {
  const data = action.calldata;
  if (data === "0x") return { kind: "transfer" };
  // The contract at the target first, so a selector two known ABIs share is
  // named after the one actually being called.
  const ordered = [...contracts].sort((a, b) => rank(b, action.target) - rank(a, action.target));
  for (const contract of ordered) {
    for (const fn of contract.functions) {
      const args = tryDecode(fn, data);
      if (!args) continue;
      return {
        kind: "call",
        contract,
        contractMatches:
          contract.address === undefined ? undefined : sameAddress(contract.address, action.target),
        signature: functionSignature(fn),
        args: fn.inputs.map((p, i) => ({
          name: p.name ?? `arg${i}`,
          type: p.type,
          value: formatArgValue(args[i]),
        })),
      };
    }
  }
  return { kind: "raw", selector: data.length >= 10 ? data.slice(0, 10) : undefined };
}

function rank(c: KnownContract, target: string): number {
  return c.address !== undefined && sameAddress(c.address, target) ? 1 : 0;
}

// ── building ────────────────────────────────────────────────────────────────

/// One argument from its typed text.
///
/// Arrays take comma- or newline-separated items. Throws with a message fit to
/// show under the field.
export function parseArg(type: string, raw: string): unknown {
  const text = raw.trim();
  const array = /^(.*)\[\d*\]$/.exec(type);
  if (array) {
    const inner = array[1] ?? "";
    const body = text.replace(/^\[/, "").replace(/\]$/, "");
    const items = body
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
    return items.map((item) => parseArg(inner, item));
  }
  if (type === "address") {
    if (!isAddress(text, { strict: false })) throw new Error("Not an address");
    return getAddress(text);
  }
  if (type === "bool") {
    if (text === "true") return true;
    if (text === "false") return false;
    throw new Error("Enter true or false");
  }
  if (type === "string") return raw;
  const int = /^(u?)int(\d*)$/.exec(type);
  if (int) {
    if (!/^-?\d+$/.test(text)) throw new Error("Enter a whole number");
    const n = BigInt(text);
    const bits = BigInt(int[2] || "256");
    const [min, max] =
      int[1] === "u" ? [0n, (1n << bits) - 1n] : [-(1n << (bits - 1n)), (1n << (bits - 1n)) - 1n];
    if (n < min || n > max) throw new Error(`Out of range for ${type}`);
    return n;
  }
  const fixed = /^bytes(\d+)$/.exec(type);
  if (fixed) {
    const len = Number(fixed[1]);
    if (!isHex(text) || text.length !== 2 + len * 2)
      throw new Error(`Enter ${len} bytes as 0x hex`);
    return text;
  }
  if (type === "bytes") {
    if (!isHex(text) || text.length % 2 !== 0) throw new Error("Enter 0x hex");
    return text;
  }
  throw new Error(`Unsupported type ${type}`);
}

/// One row of the proposal form, as typed.
export interface ActionDraft {
  target: string;
  /// ETH sent with the call, as decimal text; empty means zero.
  value: string;
  mode: "function" | "raw";
  /// `KnownContractId` in function mode.
  contract: string;
  /// `functionSignature` of the chosen function.
  fn: string;
  args: string[];
  /// Hex, in raw mode.
  calldata: string;
}

export interface BuiltAction {
  target: EvmAddress;
  value: bigint;
  calldata: `0x${string}`;
}

/// Where a draft is wrong, keyed like the form's fields: `target`, `value`,
/// `fn`, `calldata`, or `args.<i>`.
export type DraftErrors = Partial<Record<string, string>>;

export function findFunction(
  contracts: readonly KnownContract[],
  contractId: string,
  signature: string,
): AbiFunction | undefined {
  return contracts
    .find((c) => c.id === contractId)
    ?.functions.find((f) => functionSignature(f) === signature);
}

/// A draft as the triple `propose` takes, or every field that stops it being one.
export function buildAction(
  draft: ActionDraft,
  contracts: readonly KnownContract[],
): { ok: true; action: BuiltAction } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const target = draft.target.trim();
  if (!isAddress(target, { strict: false })) errors.target = "Enter the contract's address";

  let value = 0n;
  if (draft.value.trim() !== "") {
    try {
      value = parseDecimal(draft.value, 18);
    } catch (e) {
      errors.value = e instanceof Error ? e.message : "Not an amount";
    }
  }

  let calldata: `0x${string}` = "0x";
  if (draft.mode === "raw") {
    const hex = draft.calldata.trim() || "0x";
    if (!isHex(hex) || hex.length % 2 !== 0) errors.calldata = "Enter calldata as 0x hex";
    else calldata = hex;
  } else {
    const fn = findFunction(contracts, draft.contract, draft.fn);
    if (!fn) {
      errors.fn = "Choose a function";
    } else {
      const args = fn.inputs.map((p: AbiParameter, i) => {
        try {
          return parseArg(p.type, draft.args[i] ?? "");
        } catch (e) {
          errors[`args.${i}`] = e instanceof Error ? e.message : "Invalid";
          return undefined;
        }
      });
      if (Object.keys(errors).every((k) => !k.startsWith("args."))) {
        try {
          calldata = encodeFunctionData({ abi: [fn], functionName: fn.name, args });
        } catch (e) {
          errors.fn = e instanceof Error ? e.message : "Could not encode";
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, action: { target: evmAddress(getAddress(target)), value, calldata } };
}
