import type { RegisteredAsset } from "@/config/chains";

/// Case-insensitive key for anything naming a token.
export function tokenKey(a: { token: string }): string {
  return a.token.toLowerCase();
}

/// One entry per distinct token, keeping the first asset that names it.
export function byDistinctToken(assets: readonly RegisteredAsset[]): RegisteredAsset[] {
  const seen = new Map<string, RegisteredAsset>();
  for (const a of assets) {
    if (!seen.has(tokenKey(a))) seen.set(tokenKey(a), a);
  }
  return [...seen.values()];
}
