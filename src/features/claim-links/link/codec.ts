import { NSK_HEX_LEN, type NskParseError, nskFieldFromHex } from "@/features/wallet-kinds";
import { err, ok, type Result } from "@/shared/lib/result";

/// What a claim link carries: the notes' chain and the ephemeral key that spends them.
export interface ClaimPayload {
  chainId: bigint;
  /// Ephemeral nsk, kept as hex: the ephemeral wallet is built from the string.
  nskHex: string;
}

export type ClaimParseError = NskParseError | "malformed" | "invalid-chain";

/// `<chainIdHex>:<nskHex>`. The chain names the pool; the key alone cannot.
export function encodeClaimPayload(chainId: bigint, nskHex: string): string {
  return `${chainId.toString(16)}:${nskHex}`;
}

export function parseClaimFragment(hash: string): Result<ClaimPayload, ClaimParseError> {
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  const sep = stripped.indexOf(":");
  if (sep < 0) return err("malformed");
  const chainHex = stripped.slice(0, sep);
  const nskHex = stripped.slice(sep + 1);

  let chainId: bigint;
  try {
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
