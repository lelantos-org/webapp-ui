import { ADDRESS_HRP, shieldedAddress as brandShieldedAddress } from "@lelantos-org/sdk";
import { z } from "zod";
import { isDecimalString, isPositiveIntegerString } from "@/shared/lib/format";

/// bech32m data part for the SDK's 96-byte payload: `ceil(96 * 8 / 5)` = 154
/// characters plus the 6-character checksum. Exact rather than a minimum: the HRP
/// carries the format version, so a payload of a different size arrives under a
/// different HRP and fails that check first.
const ADDRESS_DATA_LEN = 160;
const ADDRESS_LEN = ADDRESS_HRP.length + 1 + ADDRESS_DATA_LEN;

/// Shape check for a shielded address.
///
/// HRP and charset come from the SDK's validator rather than a second regex here:
/// a hand-written `[0-9a-z]` admits `1`, `b`, `i` and `o`, which are not in the
/// bech32 charset. That validator performs no length check, hence the pair.
///
/// `decodeAddress` is definitive — checksum and curve points — but needs a Jubjub
/// context and is too costly per keystroke. A bad address clearing this check
/// still fails there, before anything is signed.
///
/// Exported for the recipient field's live valid marker, which must agree with
/// the schema gating the submit; a weaker rule would mark an address valid that
/// the form then rejects.
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

/// Shape check for an EVM address. Exported for the same reason as
/// `isShieldedAddress`.
export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS.test(value);
}

/// Field schemas shared across every action form, including the swap form's own
/// object, so there is one definition of which strings the submit accepts.
export const amountField = z.string().refine(isDecimalString, "must be a positive number");
export const assetField = z.string().refine(isPositiveIntegerString, "must be a positive integer");

const amount = amountField;
const asset = assetField.default("1");
const ethAddress = z.string().refine(isEvmAddress, "expected 0x-prefixed address");
const shieldedAddress = z
  .string()
  .refine(isShieldedAddress, `expected bech32 ${ADDRESS_HRP}1… address`);

/// `asEth: true` switches withdraw to the WETH-bridge entry point
/// (`MASP.withdrawEth`). Valid only when the selected asset is the chain's WETH;
/// the form layer hides the toggle otherwise. Deposits have no equivalent, since
/// users wrap ETH into WETH off-pool before depositing.
///
/// `z.boolean()` rather than `z.coerce.boolean()`. Coercion is `Boolean(x)`, so
/// every non-empty string is `true`, including `"false"`. The field is bound to a
/// hidden input and holds only because react-hook-form resolves from
/// `_formValues` rather than the DOM node; the failure mode otherwise is a
/// native-ETH deposit against an ERC-20 selection.
const asEth = z.boolean().default(false);

export const depositSchema = z.object({ amount, asset, asEth });
export type DepositInput = z.infer<typeof depositSchema>;

export const transferSchema = z.object({ to: shieldedAddress, amount, asset });
export type TransferInput = z.infer<typeof transferSchema>;

export const withdrawSchema = z.object({ to: ethAddress, amount, asset, asEth });
export type WithdrawInput = z.infer<typeof withdrawSchema>;

export const generateLinkSchema = z.object({ asset, amount });
export type GenerateLinkInput = z.infer<typeof generateLinkSchema>;
