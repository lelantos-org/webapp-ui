// Hex encoding for the shielded spending key.
//
// Lives with the wallet rather than with claim links: the key is the wallet's,
// and the per-tab session cache encodes it too. Keeping it in `claim-link/codec`
// would make `features/wallet` import `features/claim-link`, which already
// imports `features/wallet`.

import { type Field, fromLeBytes, toLeBytes } from "@lelantos-org/sdk/crypto";
import { err, ok, type Result } from "@/shared/lib/result";

export const NSK_HEX_LEN = 64;

export type NskParseError = "invalid-length" | "invalid-hex";

export function nskHexFromField(f: Field): string {
  return Array.from(toLeBytes(f), (b) => b.toString(16).padStart(2, "0")).join("");
}

/// Parse an nsk hex string into a `Field`. Tolerates an optional `0x` prefix.
export function nskFieldFromHex(hex: string): Result<Field, NskParseError> {
  const t = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (t.length !== NSK_HEX_LEN) return err("invalid-length");
  if (!/^[0-9a-fA-F]+$/.test(t)) return err("invalid-hex");
  const bytes = new Uint8Array(NSK_HEX_LEN / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  }
  return ok(fromLeBytes(bytes));
}
