// Does the wallet sit on the chain the link's notes live on?
//
// The scan does not need it — the ephemeral wallet reads through the link
// chain's own `rpcUrl` — but the sweep does: it spends notes in that chain's
// pool through the wallet's provider. On the wrong network that spend either
// reverts or lands nowhere, so the claim is refused before it is attempted
// rather than surfaced as an opaque transaction failure.

import { type ChainEntry, findChain } from "@/config/chains";

export interface ChainMismatch {
  /// The chain named by the link, i.e. where the notes are.
  link: ChainEntry;
  /// The wallet's chain, when this deployment serves it. `undefined` means
  /// the wallet is on a network outside the registry — there is no name to
  /// show for it, only the id.
  wallet: ChainEntry | undefined;
  walletChainId: bigint;
}

/// The mismatch to resolve before claiming, or `undefined` when there is
/// nothing to resolve *yet*.
///
/// A link naming a chain the registry does not describe is not reported here:
/// switching cannot fix it, and the flow already fails that link with "this
/// app does not serve chain N".
export function claimChainMismatch(
  registry: ChainEntry[],
  linkChainId: bigint | undefined,
  walletChainId: number | undefined,
): ChainMismatch | undefined {
  if (linkChainId === undefined || walletChainId === undefined) return undefined;
  const wallet = BigInt(walletChainId);
  if (wallet === linkChainId) return undefined;

  const link = findChain(registry, linkChainId);
  if (!link) return undefined;

  return { link, wallet: findChain(registry, wallet), walletChainId: wallet };
}

/// What to tell the user, in one line, given a mismatch.
export function describeChainMismatch(m: ChainMismatch): string {
  const where = m.wallet ? m.wallet.chainName : `chain ${m.walletChainId}`;
  return `this link holds funds on ${m.link.chainName}; your wallet is on ${where}.`;
}
