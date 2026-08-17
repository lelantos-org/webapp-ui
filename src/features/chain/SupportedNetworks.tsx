import type { ChainEntry } from "@/config/chains";
import { useChainRegistry } from "@/features/chain/ChainProvider";

/// The networks this deployment serves, named before a wallet is connected.
///
/// The registry is already loaded by `ChainProvider` before anything renders,
/// so the first screen can answer "will my network work here?" without the
/// user connecting first and discovering `unsupported-chain` instead.
///
/// Names only, and not buttons: with no wallet connected there is nothing to
/// switch, and `ChainSwitchButtons` covers the case where there is.
export function SupportedNetworks() {
  const registry = useChainRegistry();
  if (registry.length === 0) return null;

  return (
    <div className="networks">
      <span className="networks__label muted">supported networks</span>
      <span className="networks__list">
        {registry.map((c: ChainEntry) => (
          <span
            key={c.chainId.toString()}
            className="pill pill--sm"
            title={`chain id ${c.chainId}`}
          >
            {c.chainName}
          </span>
        ))}
      </span>
    </div>
  );
}
