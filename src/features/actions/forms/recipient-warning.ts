import { isEvmAddress } from "./schemas";

/// True when the withdrawal recipient is the account the user is connected with.
///
/// That account funds their deposits — `payerAddress()` resolves to the signer's
/// address — so using it as the recipient puts one address on both sides of the
/// pool, which is the link a shielded withdrawal exists to break.
///
/// Gated on `isEvmAddress` so a half-typed value cannot match the live-watched
/// field, and compared case-insensitively since wallets return either EIP-55 or
/// lowercase.
export function isSelfWithdraw(to: string, ethAddress?: string): boolean {
  if (!ethAddress || !isEvmAddress(to)) return false;
  return to.toLowerCase() === ethAddress.toLowerCase();
}
