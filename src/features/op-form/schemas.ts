import { shieldedAddress as brandShieldedAddress } from "@lelantos-org/sdk";
import { ADDRESS_HRP } from "@lelantos-org/sdk/primitives";
import { z } from "zod";
import { DEFAULT_ASSET_ID } from "@/features/assets";
import { isDecimalString, isPositiveIntegerString } from "@/shared/lib/format/number";

/// bech32m data part for the SDK's 96-byte payload: 154 characters plus the 6-character checksum.
const ADDRESS_DATA_LEN = 160;
const ADDRESS_LEN = ADDRESS_HRP.length + 1 + ADDRESS_DATA_LEN;

/// Cheap shape check for a shielded address (length, HRP, charset); `decodeAddress` stays definitive.
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

/// Shape check for an EVM address.
export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS.test(value);
}

/// Field schemas every action form assembles its own schema from.
export const amountField = z.string().refine(isDecimalString, "Enter a positive number");
export const assetField = z.string().refine(isPositiveIntegerString, "Choose an asset");

/// `assetField`, falling back to the default asset when the form holds none.
export const defaultAssetField = assetField.default(DEFAULT_ASSET_ID);
export const evmAddressField = z
  .string()
  .refine(isEvmAddress, "That is not a valid public address");
export const shieldedAddressField = z
  .string()
  .refine(isShieldedAddress, `expected bech32 ${ADDRESS_HRP}1… address`);

/// Withdraw through `MASP.withdrawEth`; valid only for the chain's WETH.
/// Not `z.coerce.boolean()`: it turns `"false"` into `true` and would move native ETH for an ERC-20.
export const asEthField = z.boolean().default(false);
