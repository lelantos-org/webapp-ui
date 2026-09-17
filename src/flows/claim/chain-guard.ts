import type { ChainEntry } from "@/config/chains";

export interface ChainMismatch {
  link: ChainEntry;
  walletChainId: bigint;
  walletLabel: string;
}

/// A chain's name, falling back to its id for networks the deployment does not serve.
export function chainLabel(registry: ChainEntry[], chainId: bigint): string {
  const known = registry.find((c) => c.chainId === chainId);
  return known?.chainName ?? `chain ${chainId}`;
}

/// The wallet/link chain mismatch to resolve before claiming, or `undefined` if none (yet).
export function chainMismatch(
  registry: ChainEntry[],
  link: ChainEntry | undefined,
  walletChainId: number | undefined,
): ChainMismatch | undefined {
  if (!link || walletChainId === undefined) return undefined;

  const wallet = BigInt(walletChainId);
  if (wallet === link.chainId) return undefined;

  return { link, walletChainId: wallet, walletLabel: chainLabel(registry, wallet) };
}

/// One line naming both sides, for a toast or a log.
export function describeChainMismatch({ link, walletLabel }: ChainMismatch): string {
  return `this link holds funds on ${link.chainName}; your wallet is on ${walletLabel}.`;
}
