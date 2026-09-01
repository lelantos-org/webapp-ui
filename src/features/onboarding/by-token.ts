// Asset ids collapsed to the ERC-20s behind them.
//
// The pool registers a separate asset id per yield variant, and those ids share
// an underlying token. Permit2 keys both halves of setup — the ERC-20 approval
// and the `(owner, token, spender)` allowance — by token, so anything the setup
// flow counts, lists or prompts for is per token, while the probes and the cache
// stay per id.

import type { RegisteredAsset } from "@/features/assets";

/// Case-insensitive address comparison. Registry addresses arrive lowercased
/// from `/chains` while the SDK hands back checksummed ones, so `===` on the raw
/// strings silently reports two spellings of one token as two tokens.
export function sameToken(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/// Key an asset by its token, for a `Set` or a `Map`.
export function tokenKey(a: RegisteredAsset): string {
  return a.token.toLowerCase();
}

/// One entry per distinct token, keeping the first asset that names it.
///
/// A representative rather than a bare address: callers need a symbol to label
/// the token with, and every id over one token carries the same one.
export function byDistinctToken(assets: readonly RegisteredAsset[]): RegisteredAsset[] {
  const seen = new Map<string, RegisteredAsset>();
  for (const a of assets) {
    if (!seen.has(tokenKey(a))) seen.set(tokenKey(a), a);
  }
  return [...seen.values()];
}
