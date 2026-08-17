// Does the wallet sit on the chain the link's notes live on?
//
// The scan does not need it — the ephemeral wallet reads through the link
// chain's own `rpcUrl` — but the sweep does: it spends notes in that chain's
// pool through the wallet's provider. On the wrong network that spend either
// reverts or lands nowhere, so the claim is refused before it is attempted
// rather than surfaced as an opaque transaction failure.

import type { ChainEntry } from "@/config/chains";

export interface ChainMismatch {
  /// The chain named by the link, i.e. where the notes are.
  link: ChainEntry;
  walletChainId: bigint;
  /// What to call the wallet's chain on screen — see `chainLabel`.
  walletLabel: string;
}

/// A chain's name, falling back to its id.
///
/// The fallback is the case that matters: a wallet on a network the
/// deployment does not serve has no `ChainEntry` anywhere, and "your wallet is
/// on undefined" is how that reads if the caller forgets.
export function chainLabel(registry: ChainEntry[], chainId: bigint): string {
  const known = registry.find((c) => c.chainId === chainId);
  return known?.chainName ?? `chain ${chainId}`;
}

/// The mismatch to resolve before claiming, or `undefined` when there is
/// nothing to resolve *yet*.
///
/// `link` is `undefined` until the fragment is decoded, and stays undefined
/// for a link naming a chain the registry does not describe — switching
/// cannot fix that one, and the flow already fails it with "this app does not
/// serve chain N". `walletChainId` is `undefined` until a wallet connects.
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
