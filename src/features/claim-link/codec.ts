import { NSK_HEX_LEN, type NskParseError, nskFieldFromHex } from "@/features/wallet/nsk-codec";
import { err, ok, type Result } from "@/shared/lib/result";

export type { NskParseError } from "@/features/wallet/nsk-codec";
// Re-exported so claim-link callers keep one import for the link format and
// the key encoding it wraps.
export { NSK_HEX_LEN, nskFieldFromHex, nskHexFromField } from "@/features/wallet/nsk-codec";

/// What a claim link carries: which chain the notes are on, and the ephemeral
/// key that spends them.
export interface ClaimPayload {
  chainId: bigint;
  /// Ephemeral nsk, still hex — the ephemeral wallet is built from the string.
  nskHex: string;
}

export type ClaimParseError = NskParseError | "malformed" | "invalid-chain";

/// `<chainIdHex>:<nskHex>`.
///
/// The chain is part of the payload because the key alone does not say where
/// the notes live. Without it a link made on one chain, opened against
/// another, scans the wrong pool and reports "nothing to claim" — which is
/// indistinguishable from an already-claimed link.
///
/// Unversioned by choice, so links from before this format do not parse. That
/// is acceptable while the deployment is a devnet; a version prefix is what
/// this would need to grow one.
export function encodeClaimPayload(chainId: bigint, nskHex: string): string {
  return `${chainId.toString(16)}:${nskHex}`;
}

/// Strip a leading `#` and parse the claim payload.
export function parseClaimFragment(hash: string): Result<ClaimPayload, ClaimParseError> {
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  const sep = stripped.indexOf(":");
  if (sep < 0) return err("malformed");
  const chainHex = stripped.slice(0, sep);
  const nskHex = stripped.slice(sep + 1);

  let chainId: bigint;
  try {
    // Hex, matching `encodeClaimPayload`; `BigInt` needs the prefix to read it
    // as such, and rejects anything non-numeric.
    chainId = BigInt(`0x${chainHex}`);
  } catch {
    return err("invalid-chain");
  }
  if (chainHex.length === 0 || chainId <= 0n) return err("invalid-chain");

  const parsed = nskFieldFromHex(nskHex);
  if (!parsed.ok) return err(parsed.error);
  return ok({ chainId, nskHex });
}

/// Map a parse error to a user-facing string.
export function describeClaimError(e: ClaimParseError): string {
  switch (e) {
    case "invalid-length":
      return `nsk fragment must be ${NSK_HEX_LEN} hex chars`;
    case "invalid-hex":
      return "nsk fragment contains non-hex characters";
    case "malformed":
      return "claim link is missing its chain prefix";
    case "invalid-chain":
      return "claim link has an unreadable chain id";
  }
}
