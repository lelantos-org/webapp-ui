import type { ChainEntry } from "@/config/chains";
import { useActiveChainOrUndefined, useChainRegistry } from "@/features/chain/ChainProvider";
import { useSwitchChain } from "@/features/eip1193/use-switch-chain";

export interface ChainSwitchButtonsProps {
  /// Restrict the offer to one chain — used when a claim link names the chain
  /// it belongs to. Omitted, every chain the deployment serves is offered.
  only?: bigint;
}

/// Buttons that move the *wallet* to a supported chain.
///
/// Not a chain picker: there is no app-level chain to pick. Each button calls
/// `wallet_switchEthereumChain`, so the wallet remains the single source of
/// truth and the app simply follows. That is why this replaced the header
/// dropdown — the dropdown implied the app had a chain of its own.
///
/// The chain the wallet is already on is omitted rather than disabled: an
/// inert button invites a click that does nothing.
export function ChainSwitchButtons({ only }: ChainSwitchButtonsProps) {
  const registry = useChainRegistry();
  const switchChain = useSwitchChain();
  // `undefined` on an unsupported network, which is exactly when every chain
  // should be offered.
  const active = useActiveChainOrUndefined();

  const offered = registry.filter(
    (c) => (only === undefined || c.chainId === only) && c.chainId !== active?.chainId,
  );
  if (offered.length === 0) return null;

  return (
    <div className="row row--center row--wrap">
      {offered.map((c: ChainEntry) => (
        <button
          key={c.chainId.toString()}
          type="button"
          className="btn"
          onClick={() => switchChain(c)}
        >
          switch to {c.chainName}
        </button>
      ))}
    </div>
  );
}
