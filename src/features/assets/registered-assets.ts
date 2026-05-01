import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { env } from "@/config/env";
import { useWallet } from "@/features/wallet";

/// Display-friendly view of one registered asset on the MASP.
export interface RegisteredAsset {
  id: bigint;
  /// 0x-hex token address as registered on-chain.
  token: string;
  /// True iff this asset is the chain's WETH9, detected by ERC-20 symbol
  /// ("WETH"). Enables the ETH auto-wrap path (`MASP.depositEth` /
  /// `MASP.withdrawEth`) instead of the ERC-20 permit flow.
  isWeth: boolean;
  /// Best-effort short symbol for display (ERC-20 ticker / "#id").
  symbol: string;
  /// Decimals for amount formatting; scale-derived when `tokenMeta` is unavailable.
  decimals: number;
  /// Circuit-units → base-units multiplier.
  scale: bigint;
}

const POLL_MS = 5 * 60_000;

export const registeredAssetsKey = (chainId?: bigint) =>
  ["registered-assets", chainId?.toString() ?? null] as const;

interface RelayerAsset {
  chainId: number;
  assetIdU64: number;
  tokenHex: string;
  scale: string;
}

interface RelayerAssetsResponse {
  // Older relayers return `{ assets: [...] }`; newer return a bare array.
  assets?: RelayerAsset[];
}

async function fetchExplorerAssets(chainId: bigint): Promise<RelayerAsset[]> {
  const r = await fetch(`${env.explorerApiUrl}/v1/assets`);
  if (!r.ok) throw new Error(`explorer /v1/assets ${r.status}`);
  const json: RelayerAsset[] | RelayerAssetsResponse = await r.json();
  const list = Array.isArray(json) ? json : (json.assets ?? []);
  return list.filter((a) => BigInt(a.chainId) === chainId);
}

async function probeAssets(wallet: WalletApi): Promise<RegisteredAsset[]> {
  // Explorer `/v1/assets` is the source of truth: walking `MASP.asset(i)`
  // reverts past the last id and can falsely truncate on rate-limited RPCs.
  const list = await fetchExplorerAssets(env.chainId);
  const enriched = await Promise.all(
    list.map(async (a) => {
      const id = BigInt(a.assetIdU64);
      const token = `0x${a.tokenHex.replace(/^0x/, "")}`;
      const scale = BigInt(a.scale);
      const meta = wallet.chain.tokenMeta ? await safeTokenMeta(wallet, token) : null;
      const symbol = meta?.symbol ?? `#${id}`;
      const entry: RegisteredAsset = {
        id,
        token,
        isWeth: symbol.toUpperCase() === "WETH",
        symbol,
        decimals: meta?.decimals ?? scaleToDecimals(scale),
        scale,
      };
      return entry;
    }),
  );
  enriched.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return enriched;
}

async function safeTokenMeta(
  wallet: WalletApi,
  token: string,
): Promise<{ symbol: string; decimals: number } | null> {
  try {
    return (await wallet.chain.tokenMeta?.(token)) ?? null;
  } catch {
    return null;
  }
}

function scaleToDecimals(scale: bigint): number {
  // Assumes scale = 10^d.
  let d = 0;
  let s = scale;
  while (s > 1n) {
    s /= 10n;
    d++;
  }
  return d;
}

/// Resolve a `RegisteredAsset` from a form-style asset id (decimal string
/// or bigint); `undefined` if the registry hasn't loaded or the id is unknown.
export function findAsset(
  assets: readonly RegisteredAsset[] | undefined,
  id: string | bigint | undefined,
): RegisteredAsset | undefined {
  if (!assets || id === undefined || id === "") return undefined;
  const target = typeof id === "bigint" ? id : safeParseAssetId(id);
  if (target === undefined) return undefined;
  return assets.find((a) => a.id === target);
}

function safeParseAssetId(s: string): bigint | undefined {
  try {
    const v = BigInt(s.trim());
    return v >= 0n ? v : undefined;
  } catch {
    return undefined;
  }
}

/// Returns the on-chain registered asset list, polled lazily.
export function useRegisteredAssets(): UseQueryResult<RegisteredAsset[]> {
  const { wallet } = useWallet();
  return useQuery<RegisteredAsset[]>({
    queryKey: registeredAssetsKey(),
    enabled: !!wallet,
    queryFn: () => {
      if (!wallet) throw new Error("wallet not ready");
      return probeAssets(wallet);
    },
    staleTime: POLL_MS,
    gcTime: POLL_MS,
  });
}
