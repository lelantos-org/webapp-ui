import { shieldedAddress as brandShieldedAddress } from "@lelantos-org/sdk";
import { ADDRESS_HRP } from "@lelantos-org/sdk/primitives";
import { isAddress } from "viem";
import { z } from "zod";
import { DEFAULT_ASSET_ID } from "@/features/assets";
import { memoProblem } from "@/shared/domain/memo";
import { isDecimalString, isPositiveIntegerString } from "@/shared/lib/format/number";

/// The SDK's address payload: a 16-byte diversifier and three 32-byte fields (`pk_d`, `pk`, `ck_d`).
const ADDRESS_PAYLOAD_BYTES = 16 + 3 * 32;
/// bech32m data part: the payload in 5-bit characters plus the 6-character checksum.
const ADDRESS_DATA_LEN = Math.ceil((ADDRESS_PAYLOAD_BYTES * 8) / 5) + 6;
const ADDRESS_LEN = ADDRESS_HRP.length + 1 + ADDRESS_DATA_LEN;

/// Shape check for a shielded address (length, HRP, charset); `decodeAddress` is the definitive check.
export function isShieldedAddress(value: string): boolean {
  if (value.length !== ADDRESS_LEN) return false;
  try {
    brandShieldedAddress(value);
    return true;
  } catch {
    return false;
  }
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/// Why `value` is not an EVM address, or `undefined` when it is one. A mixed-case address must
/// carry a valid EIP-55 checksum: that is what catches a mistyped character.
function evmAddressProblem(value: string): string | undefined {
  if (!EVM_ADDRESS.test(value)) return "That is not a valid public address";
  return isAddress(value)
    ? undefined
    : "That address has a typo: its capital letters don't match its checksum";
}

export function isEvmAddress(value: string): boolean {
  return evmAddressProblem(value) === undefined;
}

/// What a form accepts as its recipient, and what it says about one it does not.
export interface RecipientRule {
  /// Why `value` cannot be sent to, or `undefined` when it can.
  problem(value: string): string | undefined;
}

export const SHIELDED_RECIPIENT: RecipientRule = {
  problem: (value) => (isShieldedAddress(value) ? undefined : "That is not a shielded address"),
};

export const PUBLIC_RECIPIENT: RecipientRule = { problem: evmAddressProblem };

/// A zod string field that fails with `problem`'s own words.
function problemField(problem: (value: string) => string | undefined) {
  return z.string().superRefine((value, ctx) => {
    const message = problem(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });
}

export const amountField = z.string().refine(isDecimalString, "Enter a positive number");
export const assetField = z.string().refine(isPositiveIntegerString, "Choose an asset");

/// A payment's memo; the empty string is none.
export const memoField = problemField(memoProblem);

export const defaultAssetField = assetField.default(DEFAULT_ASSET_ID);
export const evmAddressField = problemField(PUBLIC_RECIPIENT.problem);
export const shieldedAddressField = problemField(SHIELDED_RECIPIENT.problem);

/// Withdraws through `MASP.withdrawEth`; valid only for the chain's WETH.
/// Not `z.coerce.boolean()`, which turns `"false"` into `true` and would move native ETH for an ERC-20.
export const asEthField = z.boolean().default(false);
